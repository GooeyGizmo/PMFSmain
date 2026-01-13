import { storage } from "./storage";
import { TIER_PRIORITY, MAX_ORDERS_PER_ROUTE, type Order, type Route, type User } from "@shared/schema";
// Helper to get normalized date key in Calgary timezone
// Uses noon UTC to avoid day-boundary timezone shifts
// e.g., Jan 10th noon UTC = Jan 10th 5am Calgary (still Jan 10th in any North American timezone)
function getCalgaryStartOfDay(date: Date): Date {
  // Format the date in Calgary timezone to get the correct local date
  const calgaryFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const calgaryDateStr = calgaryFormatter.format(date);
  // Parse back as a date at NOON UTC (avoids day-shift issues when converting between timezones)
  // Format is YYYY-MM-DD
  return new Date(calgaryDateStr + 'T12:00:00.000Z');
}
import { wsService } from "./websocket";

interface OrderWithUser extends Order {
  user?: User;
}

interface Coordinates {
  lat: number;
  lng: number;
}

// INTERNAL ONLY - Depot coordinates for route optimization
// This information is NEVER exposed to customers via any API
// 619 Moraine Rd NE, Calgary, AB T2A 7R2
const DEPOT_COORDINATES: Coordinates = {
  lat: 51.057134,
  lng: -113.999303,
};

// Calculate distance between two coordinates using Haversine formula
function haversineDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Get coordinates from order, returns null if missing
function getOrderCoordinates(order: Order): Coordinates | null {
  if (order.latitude && order.longitude) {
    return {
      lat: parseFloat(order.latitude),
      lng: parseFloat(order.longitude),
    };
  }
  return null;
}

export class RouteService {
  // Get depot coordinates (for ops map only - never expose to customers)
  getDepotCoordinates(): Coordinates {
    return { ...DEPOT_COORDINATES };
  }

  async assignOrderToRoute(order: Order, userTier: string): Promise<Order> {
    const scheduledDate = new Date(order.scheduledDate);
    const dateKey = getCalgaryStartOfDay(scheduledDate);
    
    const tierPriority = TIER_PRIORITY[userTier] || 4;
    
    const existingRoutes = await storage.getRoutesByDate(dateKey);
    
    let targetRoute: Route | null = null;
    
    for (const route of existingRoutes) {
      if (route.orderCount < MAX_ORDERS_PER_ROUTE) {
        targetRoute = route;
        break;
      }
    }
    
    if (!targetRoute) {
      const routeNumber = existingRoutes.length + 1;
      const owner = await storage.getOwnerUser();
      const autoAssignOwner = routeNumber === 1 && owner;
      
      targetRoute = await storage.createRoute({
        routeDate: dateKey,
        routeNumber,
        driverId: autoAssignOwner ? owner.id : null,
        driverName: autoAssignOwner ? owner.name : null,
        status: "pending",
        orderCount: 0,
        totalLitres: 0,
        isOptimized: false,
      });
    }
    
    const routeOrders = await storage.getOrdersByRoute(targetRoute.id);
    const position = routeOrders.length + 1;
    
    const updatedOrder = await storage.assignOrderToRoute(order.id, targetRoute.id, position);
    
    await storage.updateRoute(targetRoute.id, {
      orderCount: targetRoute.orderCount + 1,
      totalLitres: targetRoute.totalLitres + order.fuelAmount,
    });
    
    return updatedOrder;
  }

  private parseDeliveryWindow(window: string): { start: number; end: number } {
    // Parse time windows like "7:00am - 9:00am" or "3:00pm - 5:30pm"
    const timePattern = /(\d+):?(\d*)\s*(am|pm)/gi;
    const times: number[] = [];
    let match;
    
    while ((match = timePattern.exec(window)) !== null) {
      let hour = parseInt(match[1]);
      const minutes = parseInt(match[2] || "0") / 60;
      const period = match[3].toLowerCase();
      
      // Convert to 24-hour format
      if (period === 'pm' && hour !== 12) {
        hour += 12;
      } else if (period === 'am' && hour === 12) {
        hour = 0;
      }
      
      times.push(hour + minutes);
    }
    
    if (times.length >= 2) {
      return { start: times[0], end: times[1] };
    }
    return { start: 6, end: 18 };
  }

  // Group orders by their delivery time window
  private groupByDeliveryWindow(orders: OrderWithUser[]): Map<string, OrderWithUser[]> {
    const groups = new Map<string, OrderWithUser[]>();
    
    for (const order of orders) {
      const window = this.parseDeliveryWindow(order.deliveryWindow);
      const key = `${window.start}-${window.end}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(order);
    }
    
    return groups;
  }

  // Sort window groups by start time
  private getSortedWindowKeys(groups: Map<string, OrderWithUser[]>): string[] {
    return Array.from(groups.keys()).sort((a, b) => {
      const startA = parseFloat(a.split('-')[0]);
      const startB = parseFloat(b.split('-')[0]);
      return startA - startB;
    });
  }

  // Group orders by tier priority
  private groupByTierPriority(orders: OrderWithUser[]): Map<number, OrderWithUser[]> {
    const groups = new Map<number, OrderWithUser[]>();
    
    for (const order of orders) {
      const priority = order.tierPriority || 4;
      if (!groups.has(priority)) {
        groups.set(priority, []);
      }
      groups.get(priority)!.push(order);
    }
    
    return groups;
  }

  // Nearest-neighbor algorithm for distance optimization within a tier group
  private optimizeByDistance(
    orders: OrderWithUser[],
    startingPoint: Coordinates
  ): OrderWithUser[] {
    if (orders.length <= 1) return orders;
    
    const remaining = [...orders];
    const optimized: OrderWithUser[] = [];
    let currentLocation = startingPoint;
    
    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      
      for (let i = 0; i < remaining.length; i++) {
        const order = remaining[i];
        const coords = getOrderCoordinates(order);
        
        if (coords) {
          const distance = haversineDistance(currentLocation, coords);
          if (distance < bestDistance) {
            bestIndex = i;
            bestDistance = distance;
          }
        }
      }
      
      const selected = remaining.splice(bestIndex, 1)[0];
      optimized.push(selected);
      
      const selectedCoords = getOrderCoordinates(selected);
      if (selectedCoords) {
        currentLocation = selectedCoords;
      }
    }
    
    return optimized;
  }

  // Optimize orders within a time window: tier priority first, then distance within each tier
  private optimizeGroupByTierThenDistance(
    orders: OrderWithUser[],
    startingPoint: Coordinates
  ): OrderWithUser[] {
    if (orders.length <= 1) return orders;
    
    // Step 1: Group orders by tier priority
    const tierGroups = this.groupByTierPriority(orders);
    
    // Step 2: Sort tier groups by priority (1=RURAL highest, 4=PAYG lowest)
    const sortedTiers = Array.from(tierGroups.keys()).sort((a, b) => a - b);
    
    // Step 3: Optimize each tier group by distance, chaining from previous group
    const finalOrder: OrderWithUser[] = [];
    let currentLocation = startingPoint;
    
    for (const tier of sortedTiers) {
      const tierOrders = tierGroups.get(tier)!;
      
      // Optimize this tier group by driving distance
      const optimizedTier = this.optimizeByDistance(tierOrders, currentLocation);
      finalOrder.push(...optimizedTier);
      
      // Update starting point for next tier to be the last stop of this tier
      if (optimizedTier.length > 0) {
        const lastOrder = optimizedTier[optimizedTier.length - 1];
        const lastCoords = getOrderCoordinates(lastOrder);
        if (lastCoords) {
          currentLocation = lastCoords;
        }
      }
    }
    
    return finalOrder;
  }

  async optimizeRoute(routeId: string): Promise<Order[]> {
    const routeOrders = await storage.getOrdersByRoute(routeId);
    
    if (routeOrders.length === 0) return [];
    
    // Fetch user data for all orders
    const ordersWithUserData: OrderWithUser[] = await Promise.all(
      routeOrders.map(async (order) => {
        const user = await storage.getUser(order.userId);
        return { ...order, user };
      })
    );
    
    // Step 1: Group orders by delivery time window
    const windowGroups = this.groupByDeliveryWindow(ordersWithUserData);
    const sortedWindowKeys = this.getSortedWindowKeys(windowGroups);
    
    // Step 2: Optimize each window group by tier priority, then distance
    // Start from depot for first group, then chain from last stop of previous group
    let currentStartPoint = DEPOT_COORDINATES;
    const finalOrder: OrderWithUser[] = [];
    
    for (const windowKey of sortedWindowKeys) {
      const groupOrders = windowGroups.get(windowKey)!;
      
      // Optimize this window group: tier priority first, then distance within each tier
      const optimizedGroup = this.optimizeGroupByTierThenDistance(groupOrders, currentStartPoint);
      finalOrder.push(...optimizedGroup);
      
      // Update starting point for next group to be the last stop of this group
      if (optimizedGroup.length > 0) {
        const lastOrder = optimizedGroup[optimizedGroup.length - 1];
        const lastCoords = getOrderCoordinates(lastOrder);
        if (lastCoords) {
          currentStartPoint = lastCoords;
        }
      }
    }
    
    // Step 3: Calculate total route distance
    const routeDistances = this.calculateRouteDistances(finalOrder);
    
    // Step 4: Update route positions in database
    const updatedOrders: Order[] = [];
    for (let i = 0; i < finalOrder.length; i++) {
      const order = finalOrder[i];
      const updatedOrder = await storage.updateOrderRoutePosition(order.id, i + 1);
      updatedOrders.push(updatedOrder);
    }
    
    // Step 5: Update route with optimization status and distance metrics
    await storage.updateRoute(routeId, { 
      isOptimized: true,
      totalDistanceKm: routeDistances.totalDistance.toFixed(2),
      avgStopDistanceKm: routeDistances.avgStopDistance.toFixed(2),
    });
    
    // Notify via WebSocket
    wsService.notifyRouteUpdate({ routeId, optimized: true });
    
    return updatedOrders;
  }

  // Calculate total route distance and average stop distance
  private calculateRouteDistances(orders: OrderWithUser[]): { 
    totalDistance: number; 
    avgStopDistance: number;
    stopDistances: number[];
  } {
    if (orders.length === 0) {
      return { totalDistance: 0, avgStopDistance: 0, stopDistances: [] };
    }
    
    const stopDistances: number[] = [];
    let totalDistance = 0;
    let currentLocation = DEPOT_COORDINATES;
    
    for (const order of orders) {
      const orderCoords = getOrderCoordinates(order);
      if (orderCoords) {
        const distance = haversineDistance(currentLocation, orderCoords);
        stopDistances.push(distance);
        totalDistance += distance;
        currentLocation = orderCoords;
      }
    }
    
    // Add return to depot distance
    const returnDistance = haversineDistance(currentLocation, DEPOT_COORDINATES);
    totalDistance += returnDistance;
    
    const avgStopDistance = stopDistances.length > 0 
      ? stopDistances.reduce((sum, d) => sum + d, 0) / stopDistances.length 
      : 0;
    
    return { totalDistance, avgStopDistance, stopDistances };
  }

  async optimizeAllRoutesForDate(date: Date): Promise<void> {
    const routes = await storage.getRoutesByDate(date);
    
    for (const route of routes) {
      await this.optimizeRoute(route.id);
    }
  }

  async reassignUnassignedOrders(): Promise<void> {
    const unassignedOrders = await storage.getUnassignedOrders();
    
    for (const order of unassignedOrders) {
      const user = await storage.getUser(order.userId);
      if (user) {
        await this.assignOrderToRoute(order, user.subscriptionTier);
      }
    }
  }

  async getRouteWithOrders(routeId: string): Promise<{ route: Route; orders: any[]; driver: User | null }> {
    const route = await storage.getRoute(routeId);
    if (!route) {
      throw new Error("Route not found");
    }
    
    const orders = await storage.getOrdersByRoute(routeId);
    const ordersWithDetails = await Promise.all(
      orders.map(async (order) => {
        const user = await storage.getUser(order.userId);
        const vehicle = await storage.getVehicle(order.vehicleId);
        return {
          ...order,
          user: user ? { id: user.id, name: user.name, email: user.email, subscriptionTier: user.subscriptionTier } : null,
          vehicle: vehicle || null,
        };
      })
    );
    const driver = route.driverId ? await storage.getUser(route.driverId) : null;
    
    return { route, orders: ordersWithDetails, driver: driver || null };
  }

  async getRoutesWithDetails(date?: Date): Promise<Array<{ route: Route; orders: any[]; driver: User | null }>> {
    const routes = date 
      ? await storage.getRoutesByDate(date)
      : await storage.getAllRoutes();
    
    const routesWithDetails = await Promise.all(
      routes.map(async (route) => {
        const orders = await storage.getOrdersByRoute(route.id);
        const ordersWithDetails = await Promise.all(
          orders.map(async (order) => {
            const user = await storage.getUser(order.userId);
            const vehicle = await storage.getVehicle(order.vehicleId);
            return {
              ...order,
              user: user ? { id: user.id, name: user.name, email: user.email, subscriptionTier: user.subscriptionTier } : null,
              vehicle: vehicle || null,
            };
          })
        );
        const driver = route.driverId ? await storage.getUser(route.driverId) : null;
        return { route, orders: ordersWithDetails, driver: driver || null };
      })
    );
    
    return routesWithDetails;
  }

  // Update driver location and auto-update order statuses based on proximity
  async updateDriverLocation(
    driverId: string,
    lat: number,
    lng: number
  ): Promise<{ updatedOrders: Order[] }> {
    const driverLocation: Coordinates = { lat, lng };
    const updatedOrders: Order[] = [];
    
    // Get today's routes for this driver (in Calgary timezone)
    const today = getCalgaryStartOfDay(new Date());
    const routes = await storage.getRoutesByDate(today);
    const driverRoute = routes.find(r => r.driverId === driverId);
    
    if (!driverRoute) {
      return { updatedOrders };
    }
    
    const orders = await storage.getOrdersByRoute(driverRoute.id);
    
    for (const order of orders) {
      if (order.status === 'completed' || order.status === 'cancelled') {
        continue;
      }
      
      const orderCoords = getOrderCoordinates(order);
      if (!orderCoords) continue;
      
      const distance = haversineDistance(driverLocation, orderCoords);
      
      // Auto-update status based on proximity
      let newStatus: string | null = null;
      
      if (distance <= 0.1 && order.status !== 'fueling') {
        // Within 100m - driver has arrived
        newStatus = 'arriving';
      } else if (distance <= 2 && order.status === 'confirmed') {
        // Within 2km - driver is nearby/en route
        newStatus = 'en_route';
      }
      
      if (newStatus && newStatus !== order.status) {
        const updated = await storage.updateOrderStatus(order.id, newStatus as Order["status"]);
        if (updated) {
          updatedOrders.push(updated);
          wsService.notifyOrderUpdate(updated);
          
          // Send notification for arriving status (auto-triggered by proximity)
          if (newStatus === 'arriving') {
            const user = await storage.getUser(order.userId);
            if (user) {
              try {
                const notification = await storage.createNotification({
                  userId: user.id,
                  type: 'order_update',
                  title: 'Fuel Delivery Arriving Soon!',
                  message: "Heads up! Your fuel delivery is almost here! Please be sure to have clear access to your vehicle and ensure your fuel door is unlocked/open. Your vehicle does not need to be unlocked, and you do not need to be present during refueling. You will be updated once fuel delivery begins, and once again when your delivery is completed! See you soon!",
                  metadata: JSON.stringify({ orderId: order.id }),
                });
                wsService.notifyNewNotification(user.id, notification);
              } catch (notifError) {
                console.error("Notification creation error:", notifError);
              }
            }
          }
        }
      }
    }
    
    // Broadcast driver location to ops dashboard
    wsService.broadcast({
      type: 'driver_location',
      payload: {
        driverId,
        lat,
        lng,
        timestamp: new Date().toISOString(),
      },
    });
    
    return { updatedOrders };
  }
}

export const routeService = new RouteService();
