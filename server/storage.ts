import { users, vehicles, orders, orderItems, fuelPricing, fuelPriceHistory, subscriptionTiers, routes, notifications, recurringSchedules, rewardBalances, rewardTransactions, rewardRedemptions, fuelInventory, fuelInventoryTransactions, businessSettings, shameEvents, serviceRequests, trucks, truckFuelTransactions, type User, type InsertUser, type Vehicle, type InsertVehicle, type Order, type InsertOrder, type OrderItem, type InsertOrderItem, type PublicUser, type FuelPricing, type FuelPriceHistory, type SubscriptionTier, type Route, type InsertRoute, type Notification, type InsertNotification, type RecurringSchedule, type InsertRecurringSchedule, type RewardBalance, type RewardTransaction, type InsertRewardTransaction, type RewardRedemption, type InsertRewardRedemption, type FuelInventoryRecord, type FuelInventoryTransaction, type InsertFuelInventoryTransaction, type BusinessSetting, type ShameEvent, type InsertShameEvent, type ServiceRequest, type InsertServiceRequest, type ServiceType, type ServiceRequestStatus, type Truck, type InsertTruck, type TruckFuelTransaction, type InsertTruckFuelTransaction, TDG_FUEL_INFO, TIER_PRIORITY, POINTS_PER_DOLLAR } from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, desc, sql, lt, between, asc, notInArray, ne } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSubscription(userId: string, tier: "payg" | "access" | "household" | "rural"): Promise<void>;
  updateUserPassword(userId: string, newPassword: string): Promise<void>;
  updateUserDefaultAddress(userId: string, address: string, city: string): Promise<void>;
  updateUserProfile(userId: string, data: { name?: string; phone?: string; defaultAddress?: string; defaultCity?: string }): Promise<void>;
  updateUserStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void>;
  
  // Vehicle methods
  getUserVehicles(userId: string): Promise<Vehicle[]>;
  getVehicle(id: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: string, vehicle: Partial<InsertVehicle>): Promise<Vehicle>;
  deleteVehicle(id: string): Promise<void>;
  
  // Order methods
  getUserOrders(userId: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: string, status: Order["status"]): Promise<Order>;
  updateOrder(id: string, data: Partial<Pick<Order, 'scheduledDate' | 'deliveryWindow' | 'address' | 'city' | 'notes' | 'fuelAmount' | 'fillToFull' | 'latitude' | 'longitude' | 'actualLitresDelivered'>>): Promise<Order>;
  getAllOrders(): Promise<Order[]>;
  getUpcomingOrders(userId: string): Promise<Order[]>;
  updateOrderPaymentInfo(orderId: string, data: { stripePaymentIntentId?: string; paymentStatus?: "pending" | "preauthorized" | "captured" | "failed" | "refunded" | "cancelled"; preAuthAmount?: string; finalAmount?: string }): Promise<void>;
  
  // Order items methods
  createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]>;
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  getAllOrderItems(): Promise<OrderItem[]>;
  updateOrderItemActualLitres(itemId: string, actualLitresDelivered: number): Promise<OrderItem>;
  
  // Fuel pricing methods
  getAllFuelPricing(): Promise<FuelPricing[]>;
  getFuelPricing(fuelType: string): Promise<FuelPricing | undefined>;
  upsertFuelPricing(fuelType: string, data: { baseCost: string; markupPercent: string; markupFlat: string; customerPrice: string }, updatedBy: string): Promise<FuelPricing>;
  getFuelPriceHistory(days?: number): Promise<FuelPriceHistory[]>;
  recordFuelPriceHistory(fuelType: string, customerPrice: string): Promise<FuelPriceHistory>;
  
  // Subscription tier methods
  getSubscriptionTier(id: string): Promise<SubscriptionTier | undefined>;
  getAllSubscriptionTiers(): Promise<SubscriptionTier[]>;
  updateSubscriptionTierStripeIds(id: string, stripeProductId: string, stripePriceId: string): Promise<void>;
  
  // User subscription methods
  updateUserStripeSubscription(userId: string, data: { stripeSubscriptionId?: string; stripeSubscriptionStatus?: string; subscriptionTier?: "payg" | "access" | "household" | "rural" }): Promise<void>;
  blockUserPayments(userId: string, reason: string): Promise<void>;
  unblockUserPayments(userId: string): Promise<void>;
  getUserOrderCountThisMonth(userId: string): Promise<number>;
  getAllUsers(): Promise<User[]>;
  
  // Route methods
  getRoute(id: string): Promise<Route | undefined>;
  getRoutesByDate(date: Date): Promise<Route[]>;
  getAllRoutes(): Promise<Route[]>;
  createRoute(route: InsertRoute): Promise<Route>;
  updateRoute(id: string, data: Partial<Route>): Promise<Route>;
  deleteRoute(id: string): Promise<void>;
  assignDriverToRoute(routeId: string, driverId: string): Promise<Route>;
  getOrdersByRoute(routeId: string): Promise<Order[]>;
  assignOrderToRoute(orderId: string, routeId: string, position: number): Promise<Order>;
  updateOrderRoutePosition(orderId: string, position: number): Promise<Order>;
  removeOrderFromRoute(orderId: string): Promise<Order>;
  getUnassignedOrders(): Promise<Order[]>;
  getOrdersByStatus(status: string): Promise<Order[]>;
  getOwnerUser(): Promise<User | undefined>;
  
  // Notification methods
  getUserNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  
  // Slot availability methods
  getOrderCountByDateAndWindow(date: Date, deliveryWindow: string): Promise<number>;
  getOrderCountsByDate(date: Date): Promise<{ deliveryWindow: string; count: number }[]>;
  
  // Recurring schedule methods
  getUserRecurringSchedules(userId: string): Promise<RecurringSchedule[]>;
  getRecurringSchedule(id: string): Promise<RecurringSchedule | undefined>;
  createRecurringSchedule(schedule: InsertRecurringSchedule): Promise<RecurringSchedule>;
  updateRecurringSchedule(id: string, data: Partial<RecurringSchedule>): Promise<RecurringSchedule>;
  deleteRecurringSchedule(id: string): Promise<void>;
  getActiveRecurringSchedules(): Promise<RecurringSchedule[]>;
  
  // Rewards methods
  getRewardBalance(userId: string): Promise<RewardBalance | undefined>;
  getOrCreateRewardBalance(userId: string): Promise<RewardBalance>;
  addRewardPoints(userId: string, points: number, description: string, orderId?: string, orderTotal?: string): Promise<RewardTransaction>;
  redeemRewardPoints(userId: string, points: number, itemName: string, itemDescription?: string): Promise<RewardRedemption>;
  getRewardTransactions(userId: string): Promise<RewardTransaction[]>;
  getRewardRedemptions(userId: string): Promise<RewardRedemption[]>;
  updateRedemptionStatus(id: string, status: string): Promise<RewardRedemption>;
  
  // Fuel inventory methods
  getAllFuelInventory(): Promise<FuelInventoryRecord[]>;
  getFuelInventoryByType(fuelType: string): Promise<FuelInventoryRecord | undefined>;
  updateFuelInventory(fuelType: string, quantity: number, type: "purchase" | "delivery" | "adjustment" | "spill", orderId?: string, notes?: string, createdBy?: string, costPerLitre?: string): Promise<FuelInventoryTransaction>;
  getFuelInventoryTransactions(fuelType?: string, limit?: number): Promise<FuelInventoryTransaction[]>;
  initializeFuelInventory(): Promise<void>;
  
  // Business settings methods
  getBusinessSetting(key: string): Promise<string | undefined>;
  setBusinessSetting(key: string, value: string, updatedBy?: string): Promise<void>;
  getAllBusinessSettings(): Promise<Record<string, string>>;
  
  // Shame events methods (Hall of Shame)
  createShameEvent(event: InsertShameEvent): Promise<ShameEvent>;
  getShameEvents(limit?: number): Promise<ShameEvent[]>;
  getShameEventsByUser(userId: string): Promise<ShameEvent[]>;
  getShameLeaderboard(): Promise<{ userId: string; userName: string; count: number }[]>;
  
  // Emergency Access methods
  updateUserEmergencyAccess(userId: string, data: { hasEmergencyAccess?: boolean; emergencyAccessStripeSubId?: string | null; emergencyCreditsRemaining?: number; emergencyCreditYearStart?: Date | null }): Promise<void>;
  
  // Service request methods
  createServiceRequest(request: InsertServiceRequest): Promise<ServiceRequest>;
  getServiceRequest(id: string): Promise<ServiceRequest | undefined>;
  getUserServiceRequests(userId: string): Promise<ServiceRequest[]>;
  getAllServiceRequests(): Promise<ServiceRequest[]>;
  getPendingServiceRequests(): Promise<ServiceRequest[]>;
  updateServiceRequestStatus(id: string, status: ServiceRequestStatus): Promise<ServiceRequest>;
  updateServiceRequest(id: string, data: Partial<ServiceRequest>): Promise<ServiceRequest>;
  
  // Fleet/Truck methods
  getAllTrucks(): Promise<Truck[]>;
  getTruck(id: string): Promise<Truck | undefined>;
  getTruckByDriver(driverId: string): Promise<Truck | undefined>;
  createTruck(truck: InsertTruck): Promise<Truck>;
  updateTruck(id: string, data: Partial<Truck>): Promise<Truck>;
  deleteTruck(id: string): Promise<void>;
  updateTruckFuelLevel(truckId: string, fuelType: "regular" | "premium" | "diesel", newLevel: number): Promise<Truck>;
  
  // Truck fuel transaction methods
  getTruckFuelTransactions(truckId: string, fuelType?: string, startDate?: Date, endDate?: Date): Promise<TruckFuelTransaction[]>;
  createTruckFuelTransaction(transaction: InsertTruckFuelTransaction): Promise<TruckFuelTransaction>;
  getAllTruckFuelTransactions(startDate?: Date, endDate?: Date): Promise<TruckFuelTransaction[]>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        email: insertUser.email.toLowerCase(),
      })
      .returning();
    return user;
  }

  async updateUserSubscription(userId: string, tier: "payg" | "access" | "household" | "rural"): Promise<void> {
    await db
      .update(users)
      .set({ subscriptionTier: tier })
      .where(eq(users.id, userId));
  }

  async updateUserPassword(userId: string, newPassword: string): Promise<void> {
    await db
      .update(users)
      .set({ password: newPassword })
      .where(eq(users.id, userId));
  }

  async updateUserDefaultAddress(userId: string, address: string, city: string): Promise<void> {
    await db
      .update(users)
      .set({ defaultAddress: address, defaultCity: city })
      .where(eq(users.id, userId));
  }

  async updateUserProfile(userId: string, data: { name?: string; phone?: string; defaultAddress?: string; defaultCity?: string }): Promise<void> {
    await db
      .update(users)
      .set(data)
      .where(eq(users.id, userId));
  }

  async updateUserStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    await db
      .update(users)
      .set({ stripeCustomerId })
      .where(eq(users.id, userId));
  }

  // Vehicle methods
  async getUserVehicles(userId: string): Promise<Vehicle[]> {
    return await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.userId, userId))
      .orderBy(desc(vehicles.createdAt));
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    return vehicle || undefined;
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    const [newVehicle] = await db
      .insert(vehicles)
      .values(vehicle)
      .returning();
    return newVehicle;
  }

  async updateVehicle(id: string, vehicleData: Partial<InsertVehicle>): Promise<Vehicle> {
    const [updated] = await db
      .update(vehicles)
      .set(vehicleData)
      .where(eq(vehicles.id, id))
      .returning();
    return updated;
  }

  async deleteVehicle(id: string): Promise<void> {
    await db.delete(vehicles).where(eq(vehicles.id, id));
  }

  // Order methods
  async getUserOrders(userId: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.scheduledDate));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order || undefined;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db
      .insert(orders)
      .values(order)
      .returning();
    return newOrder;
  }

  async updateOrderStatus(id: string, status: Order["status"]): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  async updateOrder(id: string, data: Partial<Pick<Order, 'scheduledDate' | 'deliveryWindow' | 'address' | 'city' | 'notes' | 'fuelAmount' | 'fillToFull' | 'latitude' | 'longitude' | 'actualLitresDelivered'>>): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  async getAllOrders(): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .orderBy(desc(orders.scheduledDate));
  }

  async getUpcomingOrders(userId: string): Promise<Order[]> {
    const now = new Date();
    return await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          gte(orders.scheduledDate, now),
          notInArray(orders.status, ['cancelled', 'completed'])
        )
      )
      .orderBy(orders.scheduledDate);
  }

  async updateOrderPaymentInfo(orderId: string, data: { stripePaymentIntentId?: string; paymentStatus?: "pending" | "preauthorized" | "captured" | "failed" | "refunded" | "cancelled"; preAuthAmount?: string; finalAmount?: string }): Promise<void> {
    await db
      .update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  }

  // Order items methods
  async createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]> {
    if (items.length === 0) return [];
    const newItems = await db
      .insert(orderItems)
      .values(items)
      .returning();
    return newItems;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
  }

  async getAllOrderItems(): Promise<OrderItem[]> {
    return await db.select().from(orderItems);
  }

  async updateOrderItemActualLitres(itemId: string, actualLitresDelivered: number): Promise<OrderItem> {
    const [updated] = await db
      .update(orderItems)
      .set({ actualLitresDelivered })
      .where(eq(orderItems.id, itemId))
      .returning();
    return updated;
  }

  // Fuel pricing methods
  async getAllFuelPricing(): Promise<FuelPricing[]> {
    return await db.select().from(fuelPricing);
  }

  async getFuelPricing(fuelType: string): Promise<FuelPricing | undefined> {
    const [pricing] = await db
      .select()
      .from(fuelPricing)
      .where(eq(fuelPricing.fuelType, fuelType as any));
    return pricing || undefined;
  }

  async upsertFuelPricing(
    fuelType: string,
    data: { baseCost: string; markupPercent: string; markupFlat: string; customerPrice: string },
    updatedBy: string
  ): Promise<FuelPricing> {
    const existing = await this.getFuelPricing(fuelType);
    
    if (existing) {
      const [updated] = await db
        .update(fuelPricing)
        .set({
          ...data,
          updatedAt: new Date(),
          updatedBy,
        })
        .where(eq(fuelPricing.fuelType, fuelType as any))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(fuelPricing)
        .values({
          fuelType: fuelType as any,
          ...data,
          updatedBy,
        })
        .returning();
      return created;
    }
  }

  async getFuelPriceHistory(days: number = 30): Promise<FuelPriceHistory[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return await db
      .select()
      .from(fuelPriceHistory)
      .where(gte(fuelPriceHistory.recordedAt, startDate))
      .orderBy(asc(fuelPriceHistory.recordedAt));
  }

  async recordFuelPriceHistory(fuelType: string, customerPrice: string): Promise<FuelPriceHistory> {
    const [record] = await db
      .insert(fuelPriceHistory)
      .values({
        fuelType: fuelType as any,
        customerPrice,
      })
      .returning();
    return record;
  }

  // Subscription tier methods
  async getSubscriptionTier(id: string): Promise<SubscriptionTier | undefined> {
    const [tier] = await db.select().from(subscriptionTiers).where(eq(subscriptionTiers.id, id));
    return tier || undefined;
  }

  async getAllSubscriptionTiers(): Promise<SubscriptionTier[]> {
    return await db.select().from(subscriptionTiers);
  }

  async updateSubscriptionTierStripeIds(id: string, stripeProductId: string, stripePriceId: string): Promise<void> {
    await db
      .update(subscriptionTiers)
      .set({ stripeProductId, stripePriceId, updatedAt: new Date() })
      .where(eq(subscriptionTiers.id, id));
  }

  // User subscription methods
  async updateUserStripeSubscription(userId: string, data: { stripeSubscriptionId?: string; stripeSubscriptionStatus?: string; subscriptionTier?: "payg" | "access" | "household" | "rural" }): Promise<void> {
    await db
      .update(users)
      .set(data)
      .where(eq(users.id, userId));
  }

  async blockUserPayments(userId: string, reason: string): Promise<void> {
    await db
      .update(users)
      .set({ paymentBlocked: true, paymentBlockedReason: reason })
      .where(eq(users.id, userId));
  }

  async unblockUserPayments(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ paymentBlocked: false, paymentBlockedReason: null })
      .where(eq(users.id, userId));
  }

  async getUserOrderCountThisMonth(userId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          gte(orders.createdAt, startOfMonth)
        )
      );
    return Number(result[0]?.count || 0);
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  // Route methods
  async getRoute(id: string): Promise<Route | undefined> {
    const [route] = await db.select().from(routes).where(eq(routes.id, id));
    return route || undefined;
  }

  async getRoutesByDate(date: Date): Promise<Route[]> {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);
    
    return await db
      .select()
      .from(routes)
      .where(
        and(
          gte(routes.routeDate, startOfDay),
          lt(routes.routeDate, endOfDay)
        )
      )
      .orderBy(asc(routes.routeNumber));
  }

  async getAllRoutes(): Promise<Route[]> {
    return await db.select().from(routes).orderBy(desc(routes.routeDate), asc(routes.routeNumber));
  }

  async createRoute(route: InsertRoute): Promise<Route> {
    const [newRoute] = await db
      .insert(routes)
      .values(route)
      .returning();
    return newRoute;
  }

  async updateRoute(id: string, data: Partial<Route>): Promise<Route> {
    const [updated] = await db
      .update(routes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(routes.id, id))
      .returning();
    return updated;
  }

  async deleteRoute(id: string): Promise<void> {
    await db.delete(routes).where(eq(routes.id, id));
  }

  async assignDriverToRoute(routeId: string, driverId: string): Promise<Route> {
    // Get driver name to store on route
    const driver = await this.getUser(driverId);
    const driverName = driver?.name || null;
    
    const [updated] = await db
      .update(routes)
      .set({ driverId, driverName, updatedAt: new Date() })
      .where(eq(routes.id, routeId))
      .returning();
    return updated;
  }

  async getOrdersByRoute(routeId: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.routeId, routeId))
      .orderBy(asc(orders.routePosition));
  }

  async assignOrderToRoute(orderId: string, routeId: string, position: number): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ routeId, routePosition: position, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async updateOrderRoutePosition(orderId: string, position: number): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ routePosition: position, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async removeOrderFromRoute(orderId: string): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ routeId: null, routePosition: null, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async getUnassignedOrders(): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(
        and(
          sql`${orders.routeId} IS NULL`,
          notInArray(orders.status, ['cancelled', 'completed'])
        )
      )
      .orderBy(asc(orders.scheduledDate));
  }

  async getOrdersByStatus(status: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.status, status as Order['status']));
  }

  async getOwnerUser(): Promise<User | undefined> {
    const [owner] = await db.select().from(users).where(eq(users.role, 'owner'));
    return owner || undefined;
  }

  // Notification methods
  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return newNotification;
  }

  async markNotificationRead(id: string, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId)
        )
      );
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, userId));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.read, false)
        )
      );
    return Number(result[0]?.count || 0);
  }

  // Slot availability methods
  async getOrderCountByDateAndWindow(date: Date, deliveryWindow: string): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(
        and(
          gte(orders.scheduledDate, startOfDay),
          lt(orders.scheduledDate, endOfDay),
          eq(orders.deliveryWindow, deliveryWindow),
          sql`${orders.status} NOT IN ('cancelled', 'completed')`
        )
      );
    return Number(result[0]?.count || 0);
  }

  async getOrderCountsByDate(date: Date): Promise<{ deliveryWindow: string; count: number }[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const result = await db
      .select({ 
        deliveryWindow: orders.deliveryWindow, 
        count: sql<number>`count(*)` 
      })
      .from(orders)
      .where(
        and(
          gte(orders.scheduledDate, startOfDay),
          lt(orders.scheduledDate, endOfDay),
          sql`${orders.status} NOT IN ('cancelled', 'completed')`
        )
      )
      .groupBy(orders.deliveryWindow);
    
    return result.map(r => ({ deliveryWindow: r.deliveryWindow, count: Number(r.count) }));
  }

  // Recurring schedule methods
  async getUserRecurringSchedules(userId: string): Promise<RecurringSchedule[]> {
    return await db.select().from(recurringSchedules).where(eq(recurringSchedules.userId, userId)).orderBy(desc(recurringSchedules.createdAt));
  }

  async getRecurringSchedule(id: string): Promise<RecurringSchedule | undefined> {
    const [schedule] = await db.select().from(recurringSchedules).where(eq(recurringSchedules.id, id));
    return schedule || undefined;
  }

  async createRecurringSchedule(schedule: InsertRecurringSchedule): Promise<RecurringSchedule> {
    const [created] = await db.insert(recurringSchedules).values(schedule).returning();
    return created;
  }

  async updateRecurringSchedule(id: string, data: Partial<RecurringSchedule>): Promise<RecurringSchedule> {
    const [updated] = await db.update(recurringSchedules).set({ ...data, updatedAt: new Date() }).where(eq(recurringSchedules.id, id)).returning();
    return updated;
  }

  async deleteRecurringSchedule(id: string): Promise<void> {
    await db.delete(recurringSchedules).where(eq(recurringSchedules.id, id));
  }

  async getActiveRecurringSchedules(): Promise<RecurringSchedule[]> {
    return await db.select().from(recurringSchedules).where(eq(recurringSchedules.active, true));
  }

  // Rewards methods
  async getRewardBalance(userId: string): Promise<RewardBalance | undefined> {
    const [balance] = await db.select().from(rewardBalances).where(eq(rewardBalances.userId, userId));
    return balance || undefined;
  }

  async getOrCreateRewardBalance(userId: string): Promise<RewardBalance> {
    let balance = await this.getRewardBalance(userId);
    if (!balance) {
      const [created] = await db.insert(rewardBalances).values({ userId, availablePoints: 0, lifetimePoints: 0 }).returning();
      balance = created;
    }
    return balance;
  }

  async addRewardPoints(userId: string, points: number, description: string, orderId?: string, orderTotal?: string): Promise<RewardTransaction> {
    const balance = await this.getOrCreateRewardBalance(userId);
    
    await db.update(rewardBalances).set({
      availablePoints: balance.availablePoints + points,
      lifetimePoints: balance.lifetimePoints + points,
      updatedAt: new Date(),
    }).where(eq(rewardBalances.userId, userId));

    const [transaction] = await db.insert(rewardTransactions).values({
      userId,
      type: "earned",
      points,
      description,
      orderId,
      orderTotal,
    }).returning();

    return transaction;
  }

  async redeemRewardPoints(userId: string, points: number, itemName: string, itemDescription?: string): Promise<RewardRedemption> {
    const balance = await this.getOrCreateRewardBalance(userId);
    
    if (balance.availablePoints < points) {
      throw new Error("Insufficient points");
    }

    await db.update(rewardBalances).set({
      availablePoints: balance.availablePoints - points,
      updatedAt: new Date(),
    }).where(eq(rewardBalances.userId, userId));

    await db.insert(rewardTransactions).values({
      userId,
      type: "redeemed",
      points: -points,
      description: `Redeemed for: ${itemName}`,
    });

    const [redemption] = await db.insert(rewardRedemptions).values({
      userId,
      itemName,
      itemDescription,
      pointsCost: points,
      status: "pending",
    }).returning();

    return redemption;
  }

  async getRewardTransactions(userId: string): Promise<RewardTransaction[]> {
    return await db.select().from(rewardTransactions).where(eq(rewardTransactions.userId, userId)).orderBy(desc(rewardTransactions.createdAt));
  }

  async getRewardRedemptions(userId: string): Promise<RewardRedemption[]> {
    return await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.userId, userId)).orderBy(desc(rewardRedemptions.createdAt));
  }

  async updateRedemptionStatus(id: string, status: string): Promise<RewardRedemption> {
    const [updated] = await db.update(rewardRedemptions).set({ 
      status, 
      fulfilledAt: status === "fulfilled" ? new Date() : null 
    }).where(eq(rewardRedemptions.id, id)).returning();
    return updated;
  }

  // Fuel inventory methods
  async getAllFuelInventory(): Promise<FuelInventoryRecord[]> {
    return await db.select().from(fuelInventory);
  }

  async getFuelInventoryByType(fuelType: string): Promise<FuelInventoryRecord | undefined> {
    const [record] = await db.select().from(fuelInventory).where(eq(fuelInventory.fuelType, fuelType as any));
    return record || undefined;
  }

  async updateFuelInventory(fuelType: string, quantity: number, type: "purchase" | "delivery" | "adjustment" | "spill", orderId?: string, notes?: string, createdBy?: string, costPerLitre?: string): Promise<FuelInventoryTransaction> {
    let record = await this.getFuelInventoryByType(fuelType);
    
    if (!record) {
      const [created] = await db.insert(fuelInventory).values({
        fuelType: fuelType as any,
        currentStock: "0",
        lowStockThreshold: "500",
      }).returning();
      record = created;
    }

    const previousStock = parseFloat(record.currentStock.toString());
    const newStock = previousStock + quantity;

    await db.update(fuelInventory).set({
      currentStock: newStock.toString(),
      updatedAt: new Date(),
    }).where(eq(fuelInventory.fuelType, fuelType as any));

    const totalCost = costPerLitre ? (Math.abs(quantity) * parseFloat(costPerLitre)).toFixed(2) : undefined;

    const [transaction] = await db.insert(fuelInventoryTransactions).values({
      fuelType: fuelType as any,
      type,
      quantity: quantity.toString(),
      costPerLitre,
      totalCost,
      previousStock: previousStock.toString(),
      newStock: newStock.toString(),
      orderId,
      notes,
      createdBy,
    }).returning();

    return transaction;
  }

  async getFuelInventoryTransactions(fuelType?: string, limit?: number): Promise<FuelInventoryTransaction[]> {
    let query = db.select().from(fuelInventoryTransactions);
    
    if (fuelType) {
      query = query.where(eq(fuelInventoryTransactions.fuelType, fuelType as any)) as any;
    }
    
    const results = await query.orderBy(desc(fuelInventoryTransactions.createdAt)).limit(limit || 100);
    return results;
  }

  async initializeFuelInventory(): Promise<void> {
    const fuelTypes = ["regular", "premium", "diesel"];
    for (const fuelType of fuelTypes) {
      const existing = await this.getFuelInventoryByType(fuelType);
      if (!existing) {
        await db.insert(fuelInventory).values({
          fuelType: fuelType as any,
          currentStock: "0",
          lowStockThreshold: "500",
        });
      }
    }
  }

  // Business settings methods
  async getBusinessSetting(key: string): Promise<string | undefined> {
    const [setting] = await db.select().from(businessSettings).where(eq(businessSettings.settingKey, key));
    return setting?.settingValue;
  }

  async setBusinessSetting(key: string, value: string, updatedBy?: string): Promise<void> {
    const existing = await this.getBusinessSetting(key);
    if (existing !== undefined) {
      await db.update(businessSettings).set({
        settingValue: value,
        updatedAt: new Date(),
        updatedBy,
      }).where(eq(businessSettings.settingKey, key));
    } else {
      await db.insert(businessSettings).values({
        settingKey: key,
        settingValue: value,
        updatedBy,
      });
    }
  }

  async getAllBusinessSettings(): Promise<Record<string, string>> {
    const settings = await db.select().from(businessSettings);
    const result: Record<string, string> = {};
    for (const setting of settings) {
      result[setting.settingKey] = setting.settingValue;
    }
    return result;
  }

  // Shame events methods (Hall of Shame)
  async createShameEvent(event: InsertShameEvent): Promise<ShameEvent> {
    const [created] = await db.insert(shameEvents).values(event).returning();
    return created;
  }

  async getShameEvents(limit: number = 50): Promise<ShameEvent[]> {
    return await db.select().from(shameEvents).orderBy(desc(shameEvents.createdAt)).limit(limit);
  }

  async getShameEventsByUser(userId: string): Promise<ShameEvent[]> {
    return await db.select().from(shameEvents).where(eq(shameEvents.userId, userId)).orderBy(desc(shameEvents.createdAt));
  }

  async getShameLeaderboard(): Promise<{ userId: string; userName: string; count: number }[]> {
    const result = await db
      .select({
        userId: shameEvents.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(shameEvents)
      .groupBy(shameEvents.userId)
      .orderBy(desc(sql`count(*)`));
    
    // Get user names for the leaderboard
    const leaderboard: { userId: string; userName: string; count: number }[] = [];
    for (const row of result) {
      const user = await this.getUser(row.userId);
      leaderboard.push({
        userId: row.userId,
        userName: user?.name || 'Unknown',
        count: row.count,
      });
    }
    return leaderboard;
  }

  // Emergency Access methods
  async updateUserEmergencyAccess(userId: string, data: { hasEmergencyAccess?: boolean; emergencyAccessStripeSubId?: string | null; emergencyCreditsRemaining?: number; emergencyCreditYearStart?: Date | null }): Promise<void> {
    await db.update(users).set(data).where(eq(users.id, userId));
  }

  // Service request methods
  async createServiceRequest(request: InsertServiceRequest): Promise<ServiceRequest> {
    const [created] = await db.insert(serviceRequests).values(request).returning();
    return created;
  }

  async getServiceRequest(id: string): Promise<ServiceRequest | undefined> {
    const [request] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
    return request || undefined;
  }

  async getUserServiceRequests(userId: string): Promise<ServiceRequest[]> {
    return await db.select().from(serviceRequests).where(eq(serviceRequests.userId, userId)).orderBy(desc(serviceRequests.requestedAt));
  }

  async getAllServiceRequests(): Promise<ServiceRequest[]> {
    return await db.select().from(serviceRequests).orderBy(desc(serviceRequests.requestedAt));
  }

  async getPendingServiceRequests(): Promise<ServiceRequest[]> {
    return await db.select().from(serviceRequests).where(
      notInArray(serviceRequests.status, ['completed', 'cancelled'])
    ).orderBy(asc(serviceRequests.requestedAt));
  }

  async updateServiceRequestStatus(id: string, status: ServiceRequestStatus): Promise<ServiceRequest> {
    const updateData: Partial<ServiceRequest> = { status, updatedAt: new Date() };
    if (status === 'dispatched') {
      updateData.dispatchedAt = new Date();
    } else if (status === 'completed') {
      updateData.completedAt = new Date();
    }
    const [updated] = await db.update(serviceRequests).set(updateData).where(eq(serviceRequests.id, id)).returning();
    return updated;
  }

  async updateServiceRequest(id: string, data: Partial<ServiceRequest>): Promise<ServiceRequest> {
    const [updated] = await db.update(serviceRequests).set({ ...data, updatedAt: new Date() }).where(eq(serviceRequests.id, id)).returning();
    return updated;
  }

  // Fleet/Truck methods
  async getAllTrucks(): Promise<Truck[]> {
    return await db.select().from(trucks).orderBy(trucks.unitNumber);
  }

  async getTruck(id: string): Promise<Truck | undefined> {
    const [truck] = await db.select().from(trucks).where(eq(trucks.id, id));
    return truck || undefined;
  }

  async getTruckByDriver(driverId: string): Promise<Truck | undefined> {
    const [truck] = await db.select().from(trucks).where(eq(trucks.assignedDriverId, driverId));
    return truck || undefined;
  }

  async createTruck(truck: InsertTruck): Promise<Truck> {
    const [created] = await db.insert(trucks).values(truck).returning();
    return created;
  }

  async updateTruck(id: string, data: Partial<Truck>): Promise<Truck> {
    const [updated] = await db.update(trucks).set({ ...data, updatedAt: new Date() }).where(eq(trucks.id, id)).returning();
    return updated;
  }

  async deleteTruck(id: string): Promise<void> {
    await db.delete(trucks).where(eq(trucks.id, id));
  }

  async updateTruckFuelLevel(truckId: string, fuelType: "regular" | "premium" | "diesel", newLevel: number): Promise<Truck> {
    const levelField = fuelType === "regular" ? { regularLevel: String(newLevel) } 
      : fuelType === "premium" ? { premiumLevel: String(newLevel) }
      : { dieselLevel: String(newLevel) };
    const [updated] = await db.update(trucks).set({ ...levelField, updatedAt: new Date() }).where(eq(trucks.id, truckId)).returning();
    return updated;
  }

  // Truck fuel transaction methods
  async getTruckFuelTransactions(truckId: string, fuelType?: string, startDate?: Date, endDate?: Date): Promise<TruckFuelTransaction[]> {
    const conditions = [eq(truckFuelTransactions.truckId, truckId)];
    
    if (fuelType) {
      conditions.push(eq(truckFuelTransactions.fuelType, fuelType as any));
    }
    if (startDate) {
      conditions.push(gte(truckFuelTransactions.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lt(truckFuelTransactions.createdAt, endDate));
    }
    
    return await db.select().from(truckFuelTransactions)
      .where(and(...conditions))
      .orderBy(desc(truckFuelTransactions.createdAt));
  }

  async createTruckFuelTransaction(transaction: InsertTruckFuelTransaction): Promise<TruckFuelTransaction> {
    const [created] = await db.insert(truckFuelTransactions).values(transaction).returning();
    return created;
  }

  async getAllTruckFuelTransactions(startDate?: Date, endDate?: Date): Promise<TruckFuelTransaction[]> {
    if (startDate && endDate) {
      return await db.select().from(truckFuelTransactions)
        .where(and(gte(truckFuelTransactions.createdAt, startDate), lt(truckFuelTransactions.createdAt, endDate)))
        .orderBy(desc(truckFuelTransactions.createdAt));
    }
    return await db.select().from(truckFuelTransactions).orderBy(desc(truckFuelTransactions.createdAt));
  }
}

export const storage = new DatabaseStorage();
