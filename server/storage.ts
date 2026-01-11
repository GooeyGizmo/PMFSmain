import { users, vehicles, orders, fuelPricing, fuelPriceHistory, subscriptionTiers, routes, notifications, type User, type InsertUser, type Vehicle, type InsertVehicle, type Order, type InsertOrder, type PublicUser, type FuelPricing, type FuelPriceHistory, type SubscriptionTier, type Route, type InsertRoute, type Notification, type InsertNotification, TIER_PRIORITY } from "@shared/schema";
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
}

export const storage = new DatabaseStorage();
