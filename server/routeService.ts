import { storage } from "./storage";
import { TIER_PRIORITY, MAX_ORDERS_PER_ROUTE, type Order, type Route, type User } from "@shared/schema";
import { startOfDay } from "date-fns";

interface OrderWithUser extends Order {
  user?: User;
}

export class RouteService {
  async assignOrderToRoute(order: Order, userTier: string): Promise<Order> {
    const scheduledDate = new Date(order.scheduledDate);
    const dateKey = startOfDay(scheduledDate);
    
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
      
      targetRoute = await storage.createRoute({
        routeDate: dateKey,
        routeNumber,
        driverId: routeNumber === 1 && owner ? owner.id : null,
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

  async optimizeRoute(routeId: string): Promise<Order[]> {
    const routeOrders = await storage.getOrdersByRoute(routeId);
    
    if (routeOrders.length === 0) return [];
    
    const ordersWithUserData = await Promise.all(
      routeOrders.map(async (order) => {
        const user = await storage.getUser(order.userId);
        return { ...order, user };
      })
    );
    
    ordersWithUserData.sort((a, b) => {
      const priorityA = a.tierPriority;
      const priorityB = b.tierPriority;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      const windowA = this.parseDeliveryWindow(a.deliveryWindow);
      const windowB = this.parseDeliveryWindow(b.deliveryWindow);
      if (windowA.start !== windowB.start) {
        return windowA.start - windowB.start;
      }
      
      return a.city.localeCompare(b.city);
    });
    
    const updatedOrders: Order[] = [];
    for (let i = 0; i < ordersWithUserData.length; i++) {
      const order = ordersWithUserData[i];
      const updatedOrder = await storage.updateOrderRoutePosition(order.id, i + 1);
      updatedOrders.push(updatedOrder);
    }
    
    await storage.updateRoute(routeId, { isOptimized: true });
    
    return updatedOrders;
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

  private parseDeliveryWindow(window: string): { start: number; end: number } {
    const match = window.match(/(\d+):?(\d*).*-.*(\d+):?(\d*)/);
    if (match) {
      const startHour = parseInt(match[1]) + (parseInt(match[2] || "0") / 60);
      const endHour = parseInt(match[3]) + (parseInt(match[4] || "0") / 60);
      return { start: startHour, end: endHour };
    }
    return { start: 6, end: 18 };
  }

  async getRouteWithOrders(routeId: string): Promise<{ route: Route; orders: Order[]; driver: User | null }> {
    const route = await storage.getRoute(routeId);
    if (!route) {
      throw new Error("Route not found");
    }
    
    const orders = await storage.getOrdersByRoute(routeId);
    const driver = route.driverId ? await storage.getUser(route.driverId) : null;
    
    return { route, orders, driver: driver || null };
  }

  async getRoutesWithDetails(date?: Date): Promise<Array<{ route: Route; orders: Order[]; driver: User | null }>> {
    const routes = date 
      ? await storage.getRoutesByDate(date)
      : await storage.getAllRoutes();
    
    const routesWithDetails = await Promise.all(
      routes.map(async (route) => {
        const orders = await storage.getOrdersByRoute(route.id);
        const driver = route.driverId ? await storage.getUser(route.driverId) : null;
        return { route, orders, driver: driver || null };
      })
    );
    
    return routesWithDetails;
  }
}

export const routeService = new RouteService();
