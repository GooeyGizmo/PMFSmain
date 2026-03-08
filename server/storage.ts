import { users, vehicles, orders, orderItems, fuelPricing, fuelPriceHistory, subscriptionTiers, routes, notifications, recurringSchedules, rewardBalances, rewardTransactions, rewardRedemptions, fuelInventory, fuelInventoryTransactions, businessSettings, shameEvents, serviceRequests, trucks, truckFuelTransactions, truckPreTripInspections, drivers, promoCodes, promoRedemptions, vipWaitlist, userAddresses, parts, ledgerEntries, waitlistEntries, waitlistVehicles, type User, type InsertUser, type Vehicle, type InsertVehicle, type Order, type InsertOrder, type OrderItem, type InsertOrderItem, type PublicUser, type FuelPricing, type FuelPriceHistory, type SubscriptionTier, type Route, type InsertRoute, type Notification, type InsertNotification, type RecurringSchedule, type InsertRecurringSchedule, type RewardBalance, type RewardTransaction, type InsertRewardTransaction, type RewardRedemption, type InsertRewardRedemption, type FuelInventoryRecord, type FuelInventoryTransaction, type InsertFuelInventoryTransaction, type BusinessSetting, type ShameEvent, type InsertShameEvent, type ServiceRequest, type InsertServiceRequest, type ServiceType, type ServiceRequestStatus, type Truck, type InsertTruck, type TruckFuelTransaction, type InsertTruckFuelTransaction, type TruckPreTripInspection, type InsertTruckPreTripInspection, type Driver, type InsertDriver, type PromoCode, type InsertPromoCode, type PromoRedemption, type InsertPromoRedemption, type UserAddress, type InsertUserAddress, type Part, type InsertPart, type WaitlistEntry, type InsertWaitlistEntry, type WaitlistVehicle, type InsertWaitlistVehicle, type VipWaitlist, TDG_FUEL_INFO, TIER_PRIORITY, POINTS_PER_DOLLAR, getNotificationCategory } from "@shared/schema";
import { db } from "./db";
import { serverCache } from './cache';
import { eq, and, gte, lte, desc, sql, lt, between, asc, notInArray, ne, or, isNull, inArray } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSubscription(userId: string, tier: "payg" | "access" | "heroes" | "household" | "rural" | "vip"): Promise<void>;
  updateUserPassword(userId: string, newPassword: string): Promise<void>;
  updateUserDefaultAddress(userId: string, address: string, city: string): Promise<void>;
  updateUserProfile(userId: string, data: { name?: string; phone?: string; defaultAddress?: string; defaultCity?: string }): Promise<void>;
  updateUserStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  verifyUserEmail(userId: string): Promise<void>;
  updateUserVerificationToken(userId: string, token: string, expires: Date): Promise<void>;
  getUserByActivationToken(token: string): Promise<User | undefined>;
  setUserActivationToken(userId: string, token: string, expires: Date): Promise<void>;
  activateUser(userId: string, hashedPassword: string): Promise<void>;
  getUserByPasswordResetToken(token: string): Promise<User | undefined>;
  setPasswordResetToken(userId: string, token: string, expires: Date): Promise<void>;
  clearPasswordResetToken(userId: string): Promise<void>;
  incrementFailedLoginAttempts(userId: string): Promise<{ failedLoginAttempts: number }>;
  resetFailedLoginAttempts(userId: string): Promise<void>;
  lockUserAccount(userId: string, until: Date): Promise<void>;
  
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
  updateOrder(id: string, data: Partial<Pick<Order, 'scheduledDate' | 'deliveryWindow' | 'address' | 'city' | 'notes' | 'fuelAmount' | 'fillToFull' | 'latitude' | 'longitude' | 'actualLitresDelivered' | 'deliveredAt' | 'subtotal' | 'gstAmount' | 'total'>>): Promise<Order>;
  getAllOrders(): Promise<Order[]>;
  getOrdersPaginated(options: { limit?: number; offset?: number; status?: string }): Promise<{ orders: Order[]; total: number }>;
  getOrdersDetailedPaginated(options: { limit?: number; offset?: number; status?: string }): Promise<{ 
    orders: Array<Order & { 
      user: { id: string; name: string; email: string; subscriptionTier: string } | null;
      vehicle: Vehicle | null;
      orderItems: Array<OrderItem & { vehicle: { id: string; make: string; model: string; year: string; licensePlate: string } | null }>;
    }>; 
    total: number 
  }>;
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
  getFuelPriceHistoryNearDate(fuelType: string, targetDate: Date): Promise<FuelPriceHistory | undefined>;
  recordFuelPriceHistory(fuelType: string, customerPrice: string, baseCost?: string, markupPercent?: string, markupFlat?: string): Promise<FuelPriceHistory>;
  
  // Order pricing snapshot methods
  updateOrderPricingSnapshot(orderId: string, data: { pricingSnapshotJson: string; snapshotLockedAt: Date; snapshotLockedBy: string | null }): Promise<void>;
  
  // Subscription tier methods
  getSubscriptionTier(id: string): Promise<SubscriptionTier | undefined>;
  getAllSubscriptionTiers(): Promise<SubscriptionTier[]>;
  updateSubscriptionTierStripeIds(id: string, stripeProductId: string, stripePriceId: string): Promise<void>;
  upsertSubscriptionTier(tier: { id: string; name: string; monthlyFee: string; monthlyFeeWithGst: string; deliveryFee: string; perLitreDiscount: string; minOrderLitres: number; maxVehiclesPerOrder: number; maxOrdersPerMonth?: number | null }): Promise<void>;
  
  // User subscription methods
  updateUserStripeSubscription(userId: string, data: { stripeSubscriptionId?: string; stripeSubscriptionStatus?: string; subscriptionTier?: "payg" | "access" | "heroes" | "household" | "rural" | "vip" }): Promise<void>;
  blockUserPayments(userId: string, reason: string): Promise<void>;
  unblockUserPayments(userId: string): Promise<void>;
  setPaymentFailedAt(userId: string, failedAt: Date | null): Promise<void>;
  setPendingDowngradeTier(userId: string, tier: string | null): Promise<void>;
  getUserOrderCountThisMonth(userId: string): Promise<number>;
  getAllUsers(): Promise<User[]>;
  getUsersPaginated(options: { limit?: number; offset?: number }): Promise<{ users: User[]; total: number }>;
  getOrdersByUserIds(userIds: string[]): Promise<Order[]>;
  
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
  updateOrderRoutePosition(orderId: string, position: number, estimatedArrival?: Date | null): Promise<Order>;
  removeOrderFromRoute(orderId: string): Promise<Order>;
  getUnassignedOrders(): Promise<Order[]>;
  getOrdersByStatus(status: string): Promise<Order[]>;
  getOwnerUser(): Promise<User | undefined>;
  
  // Notification methods
  getUserNotifications(userId: string, category?: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  
  // Slot availability methods
  getOrderCountByDateAndWindow(date: Date, deliveryWindow: string): Promise<number>;
  getOrderCountsByDate(date: Date): Promise<{ deliveryWindow: string; count: number }[]>;
  
  // VIP booking methods
  getVipBookingsForDateRange(startTime: Date, endTime: Date, excludeOrderId?: string): Promise<Order[]>;
  getVipBookingsForDate(date: Date): Promise<Order[]>;
  getVipBlockedTimesForDate(date: Date): Promise<{ blockedStart: Date; blockedEnd: Date; vipStart: Date; vipEnd: Date; orderId: string; released: boolean }[]>;
  getActiveVipSubscriberCount(): Promise<number>;
  getVipWaitlist(): Promise<VipWaitlist[]>;
  addToVipWaitlist(data: { name: string; email: string; phone?: string; userId?: string }): Promise<VipWaitlist>;
  getVipWaitlistById(id: string): Promise<VipWaitlist | undefined>;
  updateVipWaitlistEntry(id: string, data: Partial<Pick<VipWaitlist, 'status' | 'notes'>>): Promise<VipWaitlist>;
  deleteVipWaitlistEntry(id: string): Promise<void>;
  getVipWaitlistCount(): Promise<number>;
  getVipWaitlistCountByStatus(): Promise<Record<string, number>>;
  getVipWaitlistByEmail(email: string): Promise<VipWaitlist | undefined>;
  releaseVipTime(orderId: string): Promise<Order | undefined>;
  getConflictingOrdersForVipSlot(date: Date, blockedStart: Date, blockedEnd: Date): Promise<Order[]>;
  markOrderNeedsRebooking(orderId: string, displacedByOrderId: string): Promise<Order | undefined>;
  
  // Household usage monitoring (optimized)
  getHouseholdUsageStats(): Promise<{ userId: string; name: string; email: string; ordersThisMonth: number }[]>;
  
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
  
  // Pre-trip inspection methods
  getTodayPreTripInspection(truckId: string, startOfDay: Date, endOfDay: Date): Promise<TruckPreTripInspection | undefined>;
  getPreTripInspections(truckId: string, limit?: number): Promise<TruckPreTripInspection[]>;
  createPreTripInspection(inspection: InsertTruckPreTripInspection): Promise<TruckPreTripInspection>;
  getAllTodayPreTripStatuses(startOfDay: Date, endOfDay: Date): Promise<{ truckId: string; hasInspection: boolean; vehicleRoadworthy: boolean }[]>;
  getTruckById(id: string): Promise<Truck | undefined>;
  
  // Driver methods
  getAllDrivers(): Promise<Driver[]>;
  getDriver(id: string): Promise<Driver | undefined>;
  createDriver(driver: InsertDriver): Promise<Driver>;
  updateDriver(id: string, data: Partial<Driver>): Promise<Driver>;
  deleteDriver(id: string): Promise<void>;
  
  // Promo code methods
  getPromoCode(id: string): Promise<PromoCode | undefined>;
  getPromoCodeByCode(code: string): Promise<PromoCode | undefined>;
  getAllPromoCodes(): Promise<PromoCode[]>;
  createPromoCode(promo: InsertPromoCode): Promise<PromoCode>;
  updatePromoCode(id: string, data: Partial<PromoCode>): Promise<PromoCode>;
  deletePromoCode(id: string): Promise<void>;
  incrementPromoCodeUses(id: string): Promise<void>;
  
  // Promo redemption methods
  getUserPromoRedemption(userId: string, promoCodeId: string): Promise<PromoRedemption | undefined>;
  createPromoRedemption(redemption: InsertPromoRedemption): Promise<PromoRedemption>;
  getPromoRedemptionsByCode(promoCodeId: string): Promise<PromoRedemption[]>;
  
  // User address methods
  getUserAddresses(userId: string): Promise<UserAddress[]>;
  getUserAddress(id: string): Promise<UserAddress | undefined>;
  createUserAddress(address: InsertUserAddress): Promise<UserAddress>;
  updateUserAddress(id: string, data: Partial<InsertUserAddress>): Promise<UserAddress>;
  deleteUserAddress(id: string): Promise<void>;
  setDefaultAddress(userId: string, addressId: string): Promise<void>;
  countUserAddresses(userId: string): Promise<number>;
  getAddressByLocation(userId: string, address: string, city: string): Promise<UserAddress | undefined>;
  updateAddressDeliveryNotes(addressId: string, notes: string): Promise<UserAddress>;
  
  // Failed delivery methods
  markOrderFailedDelivery(orderId: string, reason: string): Promise<Order>;
  updateOrderProofOfDelivery(orderId: string, photoUrl: string): Promise<Order>;
  linkRescheduledOrders(originalId: string, newOrderId: string): Promise<void>;
  
  // Route replay methods
  saveRoutePlannedStopOrder(routeId: string, stopOrder: string[]): Promise<void>;
  appendRouteGpsTrace(routeId: string, lat: number, lng: number): Promise<void>;
  setRouteActualTimes(routeId: string, startTime?: Date, endTime?: Date): Promise<void>;
  
  // Parts inventory methods
  getAllParts(): Promise<Part[]>;
  getPart(id: string): Promise<Part | undefined>;
  createPart(part: InsertPart): Promise<Part>;
  updatePart(id: string, data: Partial<InsertPart>): Promise<Part>;
  deletePart(id: string): Promise<void>;

  // Waitlist methods
  createWaitlistEntry(entry: InsertWaitlistEntry): Promise<WaitlistEntry>;
  createWaitlistVehicle(vehicle: InsertWaitlistVehicle): Promise<WaitlistVehicle>;
  getWaitlistEntries(): Promise<(WaitlistEntry & { vehicles: WaitlistVehicle[] })[]>;
  getWaitlistCount(): Promise<number>;
  getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | null>;
  updateWaitlistEntry(id: string, data: Partial<Pick<WaitlistEntry, 'status' | 'notes' | 'invitedAt' | 'convertedAt' | 'priorityScore' | 'postalCode' | 'phone' | 'address' | 'city' | 'referralSource' | 'referralDetail' | 'estimatedMonthlyUsage' | 'vehicleCount' | 'preferredTier'>>): Promise<WaitlistEntry>;
  getWaitlistCountByStatus(): Promise<Record<string, number>>;
  deleteWaitlistEntry(id: string): Promise<void>;
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

  async updateUserSubscription(userId: string, tier: "payg" | "access" | "heroes" | "household" | "rural" | "vip"): Promise<void> {
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

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.verificationToken, token));
    return user || undefined;
  }

  async verifyUserEmail(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        emailVerified: true, 
        verificationToken: null, 
        verificationTokenExpires: null 
      })
      .where(eq(users.id, userId));
  }

  async updateUserVerificationToken(userId: string, token: string, expires: Date): Promise<void> {
    await db
      .update(users)
      .set({ 
        verificationToken: token, 
        verificationTokenExpires: expires 
      })
      .where(eq(users.id, userId));
  }

  async getUserByActivationToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.activationToken, token));
    return user || undefined;
  }

  async setUserActivationToken(userId: string, token: string, expires: Date): Promise<void> {
    await db
      .update(users)
      .set({ activationToken: token, activationTokenExpires: expires })
      .where(eq(users.id, userId));
  }

  async activateUser(userId: string, hashedPassword: string): Promise<void> {
    await db
      .update(users)
      .set({
        password: hashedPassword,
        emailVerified: true,
        activationToken: null,
        activationTokenExpires: null,
        verificationToken: null,
        verificationTokenExpires: null,
      })
      .where(eq(users.id, userId));
  }

  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));
    return user || undefined;
  }

  async setPasswordResetToken(userId: string, token: string, expires: Date): Promise<void> {
    await db
      .update(users)
      .set({ passwordResetToken: token, passwordResetTokenExpires: expires })
      .where(eq(users.id, userId));
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ passwordResetToken: null, passwordResetTokenExpires: null })
      .where(eq(users.id, userId));
  }

  async incrementFailedLoginAttempts(userId: string): Promise<{ failedLoginAttempts: number }> {
    const [result] = await db
      .update(users)
      .set({ failedLoginAttempts: sql`${users.failedLoginAttempts} + 1` })
      .where(eq(users.id, userId))
      .returning({ failedLoginAttempts: users.failedLoginAttempts });
    return result;
  }

  async resetFailedLoginAttempts(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, userId));
  }

  async lockUserAccount(userId: string, until: Date): Promise<void> {
    await db
      .update(users)
      .set({ lockedUntil: until })
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
    await db.transaction(async (tx) => {
      const vehicleOrders = await tx.select({ id: orders.id }).from(orders).where(eq(orders.vehicleId, id));
      const orderIds = vehicleOrders.map(o => o.id);

      if (orderIds.length > 0) {
        await tx.update(ledgerEntries).set({ orderId: null }).where(inArray(ledgerEntries.orderId, orderIds));
        await tx.update(rewardTransactions).set({ orderId: null }).where(inArray(rewardTransactions.orderId, orderIds));
        await tx.update(fuelInventoryTransactions).set({ orderId: null }).where(inArray(fuelInventoryTransactions.orderId, orderIds));
        await tx.update(shameEvents).set({ orderId: null }).where(inArray(shameEvents.orderId, orderIds));
        await tx.update(truckFuelTransactions).set({ orderId: null }).where(inArray(truckFuelTransactions.orderId, orderIds));
        await tx.update(promoRedemptions).set({ orderId: null }).where(inArray(promoRedemptions.orderId, orderIds));
      }

      await tx.delete(vehicles).where(eq(vehicles.id, id));
    });
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
      .values(order as any)
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

  async updateOrder(id: string, data: Partial<Pick<Order, 'scheduledDate' | 'deliveryWindow' | 'address' | 'city' | 'notes' | 'fuelAmount' | 'fillToFull' | 'latitude' | 'longitude' | 'actualLitresDelivered' | 'deliveredAt' | 'subtotal' | 'gstAmount' | 'total'>>): Promise<Order> {
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

  async getOrdersPaginated(options: { limit?: number; offset?: number; status?: string }): Promise<{ orders: Order[]; total: number }> {
    const { limit = 50, offset = 0, status } = options;
    
    // Build where clause
    const whereClause = status ? eq(orders.status, status as Order["status"]) : undefined;
    
    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(whereClause);
    const total = countResult[0]?.count || 0;
    
    // Get paginated results
    let query = db
      .select()
      .from(orders)
      .orderBy(desc(orders.scheduledDate))
      .limit(limit)
      .offset(offset);
    
    if (whereClause) {
      query = query.where(whereClause) as typeof query;
    }
    
    const ordersList = await query;
    
    return { orders: ordersList, total };
  }

  async getOrdersDetailedPaginated(options: { limit?: number; offset?: number; status?: string }): Promise<{ 
    orders: Array<Order & { 
      user: { id: string; name: string; email: string; subscriptionTier: string } | null;
      vehicle: Vehicle | null;
      orderItems: Array<OrderItem & { vehicle: { id: string; make: string; model: string; year: string; licensePlate: string } | null }>;
    }>; 
    total: number 
  }> {
    const { limit = 50, offset = 0, status } = options;
    
    // Build where clause
    const whereClause = status ? eq(orders.status, status as Order["status"]) : undefined;
    
    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(whereClause);
    const total = countResult[0]?.count || 0;
    
    // Get paginated orders
    let query = db
      .select()
      .from(orders)
      .orderBy(desc(orders.scheduledDate))
      .limit(limit)
      .offset(offset);
    
    if (whereClause) {
      query = query.where(whereClause) as typeof query;
    }
    
    const ordersList = await query;
    
    if (ordersList.length === 0) {
      return { orders: [], total };
    }
    
    // Batch fetch all related data using inArray (avoiding N+1)
    const orderIds = ordersList.map(o => o.id);
    const userIds = Array.from(new Set(ordersList.map(o => o.userId)));
    const vehicleIds = Array.from(new Set(ordersList.map(o => o.vehicleId).filter((id): id is string => !!id)));
    
    // Batch fetch users with inArray
    const usersData = userIds.length > 0 
      ? await db.select().from(users).where(inArray(users.id, userIds))
      : [];
    const usersMap = new Map(usersData.map(u => [u.id, u]));
    
    // Batch fetch vehicles with inArray
    const vehiclesData = vehicleIds.length > 0
      ? await db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds))
      : [];
    const vehiclesMap = new Map(vehiclesData.map(v => [v.id, v]));
    
    // Batch fetch order items with inArray
    const allOrderItems = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));
    
    // Get all vehicle IDs from order items and batch fetch those too
    const itemVehicleIds = Array.from(new Set(allOrderItems.map(i => i.vehicleId).filter((id): id is string => !!id)));
    const itemVehiclesData = itemVehicleIds.length > 0
      ? await db.select().from(vehicles).where(inArray(vehicles.id, itemVehicleIds))
      : [];
    itemVehiclesData.forEach(v => vehiclesMap.set(v.id, v));
    
    // Pre-group order items by orderId for O(1) lookup instead of O(n) filter
    const orderItemsMap = new Map<string, typeof allOrderItems>();
    allOrderItems.forEach(item => {
      const existing = orderItemsMap.get(item.orderId) || [];
      existing.push(item);
      orderItemsMap.set(item.orderId, existing);
    });
    
    // Build the result
    const ordersWithDetails = ordersList.map(order => {
      const user = usersMap.get(order.userId);
      const vehicle = order.vehicleId ? vehiclesMap.get(order.vehicleId) : null;
      const items = orderItemsMap.get(order.id) || [];
      
      const orderItemsWithVehicles = items.map(item => {
        const itemVehicle = vehiclesMap.get(item.vehicleId);
        return {
          ...item,
          vehicle: itemVehicle ? {
            id: itemVehicle.id,
            make: itemVehicle.make,
            model: itemVehicle.model,
            year: itemVehicle.year || '',
            licensePlate: itemVehicle.licensePlate || '',
          } : null,
        };
      });
      
      return {
        ...order,
        user: user ? { 
          id: user.id, 
          name: user.name, 
          email: user.email, 
          subscriptionTier: user.subscriptionTier 
        } : null,
        vehicle: vehicle || null,
        orderItems: orderItemsWithVehicles,
      };
    });
    
    return { orders: ordersWithDetails as any, total };
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
      .set({ actualLitresDelivered: String(actualLitresDelivered) })
      .where(eq(orderItems.id, itemId))
      .returning();
    return updated;
  }

  // Fuel pricing methods
  async getAllFuelPricing(): Promise<FuelPricing[]> {
    return await db.select().from(fuelPricing);
  }

  async getFuelPricing(fuelType: string): Promise<FuelPricing | undefined> {
    const cacheKey = `fuel_pricing:${fuelType}`;
    const cached = serverCache.get<FuelPricing>(cacheKey);
    if (cached !== undefined) return cached;
    const [pricing] = await db
      .select()
      .from(fuelPricing)
      .where(eq(fuelPricing.fuelType, fuelType as any));
    const result = pricing || undefined;
    if (result) serverCache.set(cacheKey, result, 60000);
    return result;
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
      serverCache.invalidate(`fuel_pricing:${fuelType}`);
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
      serverCache.invalidate(`fuel_pricing:${fuelType}`);
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

  async recordFuelPriceHistory(
    fuelType: string, 
    customerPrice: string, 
    baseCost?: string, 
    markupPercent?: string, 
    markupFlat?: string
  ): Promise<FuelPriceHistory> {
    const [record] = await db
      .insert(fuelPriceHistory)
      .values({
        fuelType: fuelType as any,
        customerPrice,
        baseCost: baseCost || null,
        markupPercent: markupPercent || null,
        markupFlat: markupFlat || null,
      })
      .returning();
    return record;
  }
  
  async getFuelPriceHistoryNearDate(fuelType: string, targetDate: Date): Promise<FuelPriceHistory | undefined> {
    const results = await db
      .select()
      .from(fuelPriceHistory)
      .where(
        and(
          eq(fuelPriceHistory.fuelType, fuelType as any),
          lte(fuelPriceHistory.recordedAt, targetDate)
        )
      )
      .orderBy(desc(fuelPriceHistory.recordedAt))
      .limit(1);
    return results[0] || undefined;
  }
  
  async updateOrderPricingSnapshot(
    orderId: string, 
    data: { pricingSnapshotJson: string; snapshotLockedAt: Date; snapshotLockedBy: string | null }
  ): Promise<void> {
    await db
      .update(orders)
      .set({
        pricingSnapshotJson: data.pricingSnapshotJson,
        snapshotLockedAt: data.snapshotLockedAt,
        snapshotLockedBy: data.snapshotLockedBy,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
  }

  // Subscription tier methods
  async getSubscriptionTier(id: string): Promise<SubscriptionTier | undefined> {
    const cacheKey = `subscription_tier:${id}`;
    const cached = serverCache.get<SubscriptionTier>(cacheKey);
    if (cached !== undefined) return cached;
    const [tier] = await db.select().from(subscriptionTiers).where(eq(subscriptionTiers.id, id));
    const result = tier || undefined;
    if (result) serverCache.set(cacheKey, result, 120000);
    return result;
  }

  async getAllSubscriptionTiers(): Promise<SubscriptionTier[]> {
    const cacheKey = `subscription_tiers:all`;
    const cached = serverCache.get<SubscriptionTier[]>(cacheKey);
    if (cached !== undefined) return cached;
    const result = await db.select().from(subscriptionTiers);
    serverCache.set(cacheKey, result, 120000);
    return result;
  }

  async updateSubscriptionTierStripeIds(id: string, stripeProductId: string, stripePriceId: string): Promise<void> {
    await db
      .update(subscriptionTiers)
      .set({ stripeProductId, stripePriceId, updatedAt: new Date() })
      .where(eq(subscriptionTiers.id, id));
  }

  async upsertSubscriptionTier(tier: { id: string; name: string; monthlyFee: string; monthlyFeeWithGst: string; deliveryFee: string; perLitreDiscount: string; minOrderLitres: number; maxVehiclesPerOrder: number; maxOrdersPerMonth?: number | null }): Promise<void> {
    const existing = await this.getSubscriptionTier(tier.id);
    if (existing) {
      await db
        .update(subscriptionTiers)
        .set({
          name: tier.name,
          monthlyFee: tier.monthlyFee,
          monthlyFeeWithGst: tier.monthlyFeeWithGst,
          deliveryFee: tier.deliveryFee,
          perLitreDiscount: tier.perLitreDiscount,
          minOrderLitres: tier.minOrderLitres,
          maxVehiclesPerOrder: tier.maxVehiclesPerOrder,
          maxOrdersPerMonth: tier.maxOrdersPerMonth,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionTiers.id, tier.id));
    } else {
      await db.insert(subscriptionTiers).values({
        id: tier.id,
        name: tier.name,
        monthlyFee: tier.monthlyFee,
        monthlyFeeWithGst: tier.monthlyFeeWithGst,
        deliveryFee: tier.deliveryFee,
        perLitreDiscount: tier.perLitreDiscount,
        minOrderLitres: tier.minOrderLitres,
        maxVehiclesPerOrder: tier.maxVehiclesPerOrder,
        maxOrdersPerMonth: tier.maxOrdersPerMonth,
      });
    }
    serverCache.invalidate(`subscription_tier:${tier.id}`);
    serverCache.invalidate(`subscription_tiers:all`);
  }

  // User subscription methods
  async updateUserStripeSubscription(userId: string, data: { stripeSubscriptionId?: string; stripeSubscriptionStatus?: string; subscriptionTier?: "payg" | "access" | "heroes" | "household" | "rural" | "vip" }): Promise<void> {
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
      .set({ paymentBlocked: false, paymentBlockedReason: null, paymentFailedAt: null })
      .where(eq(users.id, userId));
  }

  async setPaymentFailedAt(userId: string, failedAt: Date | null): Promise<void> {
    await db
      .update(users)
      .set({ paymentFailedAt: failedAt })
      .where(eq(users.id, userId));
  }

  async setPendingDowngradeTier(userId: string, tier: string | null): Promise<void> {
    await db
      .update(users)
      .set({ pendingDowngradeTier: tier })
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

  async getUsersPaginated(options: { limit?: number; offset?: number }): Promise<{ users: User[]; total: number }> {
    const { limit = 50, offset = 0 } = options;
    
    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const total = countResult[0]?.count || 0;
    
    // Get paginated results
    const usersList = await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);
    
    return { users: usersList, total };
  }

  async getOrdersByUserIds(userIds: string[]): Promise<Order[]> {
    if (userIds.length === 0) return [];
    return await db
      .select()
      .from(orders)
      .where(inArray(orders.userId, userIds))
      .orderBy(desc(orders.scheduledDate));
  }

  // Route methods
  async getRoute(id: string): Promise<Route | undefined> {
    const [route] = await db.select().from(routes).where(eq(routes.id, id));
    return route || undefined;
  }

  async getRoutesByDate(date: Date): Promise<Route[]> {
    // Routes are stored with routeDate at noon UTC representing Calgary calendar date
    // (see routeService.getCalgaryStartOfDay which uses 'T12:00:00.000Z')
    // 
    // To match, we need to find routes where routeDate is noon UTC of the Calgary day
    // We use a range from 6am to 6pm UTC which captures noon regardless of minor variations
    
    const calgaryFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const calgaryDateStr = calgaryFormatter.format(date); // e.g., "2026-01-24"
    
    // Range around noon UTC for that Calgary calendar date
    const rangeStart = new Date(calgaryDateStr + 'T06:00:00.000Z');
    const rangeEnd = new Date(calgaryDateStr + 'T18:00:00.000Z');
    
    return await db
      .select()
      .from(routes)
      .where(
        and(
          gte(routes.routeDate, rangeStart),
          lt(routes.routeDate, rangeEnd)
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

  async updateOrderRoutePosition(orderId: string, position: number, estimatedArrival?: Date | null): Promise<Order> {
    const setData: any = { routePosition: position, updatedAt: new Date() };
    if (estimatedArrival !== undefined) {
      setData.estimatedArrival = estimatedArrival;
    }
    const [updated] = await db
      .update(orders)
      .set(setData)
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
  async getUserNotifications(userId: string, category?: string): Promise<Notification[]> {
    const conditions = [eq(notifications.userId, userId)];
    if (category) {
      conditions.push(eq(notifications.category, category));
    }
    return await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const notifWithCategory = {
      ...notification,
      category: notification.category || getNotificationCategory(notification.type),
    };
    const [newNotification] = await db
      .insert(notifications)
      .values(notifWithCategory)
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
          sql`${orders.status} != 'cancelled'`
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
          sql`${orders.status} != 'cancelled'`
        )
      )
      .groupBy(orders.deliveryWindow);
    
    return result.map(r => ({ deliveryWindow: r.deliveryWindow, count: Number(r.count) }));
  }

  // VIP booking methods
  async getVipBookingsForDateRange(startTime: Date, endTime: Date, excludeOrderId?: string): Promise<Order[]> {
    const conditions = [
      eq(orders.bookingType, 'vip_exclusive'),
      sql`${orders.status} NOT IN ('cancelled', 'completed')`,
      sql`(${orders.vipStartTime} < ${endTime} AND ${orders.vipEndTime} > ${startTime})`
    ];
    
    if (excludeOrderId) {
      conditions.push(ne(orders.id, excludeOrderId));
    }
    
    return await db
      .select()
      .from(orders)
      .where(and(...conditions));
  }

  async getVipBookingsForDate(date: Date): Promise<Order[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.bookingType, 'vip_exclusive'),
          sql`${orders.status} NOT IN ('cancelled', 'completed')`,
          gte(orders.scheduledDate, startOfDay),
          lt(orders.scheduledDate, endOfDay)
        )
      );
  }

  async getActiveVipSubscriberCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(
        and(
          eq(users.subscriptionTier, 'vip'),
          sql`${users.stripeSubscriptionStatus} = 'active'`
        )
      );
    return Number(result[0]?.count || 0);
  }

  async getVipWaitlist(): Promise<VipWaitlist[]> {
    return await db.select().from(vipWaitlist).orderBy(desc(vipWaitlist.createdAt));
  }

  async addToVipWaitlist(data: { name: string; email: string; phone?: string; userId?: string }): Promise<VipWaitlist> {
    const [entry] = await db.insert(vipWaitlist).values(data).returning();
    return entry;
  }

  async getVipWaitlistById(id: string): Promise<VipWaitlist | undefined> {
    const [entry] = await db.select().from(vipWaitlist).where(eq(vipWaitlist.id, id));
    return entry;
  }

  async updateVipWaitlistEntry(id: string, data: Partial<Pick<VipWaitlist, 'status' | 'notes'>>): Promise<VipWaitlist> {
    const [updated] = await db.update(vipWaitlist).set(data).where(eq(vipWaitlist.id, id)).returning();
    return updated;
  }

  async deleteVipWaitlistEntry(id: string): Promise<void> {
    await db.delete(vipWaitlist).where(eq(vipWaitlist.id, id));
  }

  async getVipWaitlistCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(vipWaitlist);
    return Number(result[0]?.count || 0);
  }

  async getVipWaitlistCountByStatus(): Promise<Record<string, number>> {
    const results = await db.select({
      status: vipWaitlist.status,
      count: sql<number>`count(*)`
    }).from(vipWaitlist).groupBy(vipWaitlist.status);
    const counts: Record<string, number> = { new: 0, contacted: 0, invited: 0, converted: 0, declined: 0 };
    for (const r of results) {
      counts[r.status] = Number(r.count);
    }
    return counts;
  }

  async getVipWaitlistByEmail(email: string): Promise<VipWaitlist | undefined> {
    const [entry] = await db.select().from(vipWaitlist).where(eq(vipWaitlist.email, email.toLowerCase()));
    return entry;
  }

  async getVipBlockedTimesForDate(date: Date): Promise<{ blockedStart: Date; blockedEnd: Date; vipStart: Date; vipEnd: Date; orderId: string; released: boolean }[]> {
    const vipOrders = await this.getVipBookingsForDate(date);
    
    return vipOrders
      .filter(order => order.vipStartTime && order.vipEndTime)
      .map(order => {
        const vipStart = new Date(order.vipStartTime!);
        const vipEnd = new Date(order.vipEndTime!);
        
        // If time has been released, only block from prep start to release time
        const released = !!order.vipTimeReleased;
        
        // 30 min buffer before VIP slot (prep time)
        const blockedStart = new Date(vipStart.getTime() - 30 * 60 * 1000);
        
        // 30 min buffer after VIP slot (refuel time) - unless released early
        const blockedEnd = released && order.vipTimeReleased 
          ? new Date(order.vipTimeReleased)
          : new Date(vipEnd.getTime() + 30 * 60 * 1000);
        
        return {
          blockedStart,
          blockedEnd,
          vipStart,
          vipEnd,
          orderId: order.id,
          released,
        };
      });
  }

  async releaseVipTime(orderId: string): Promise<Order | undefined> {
    const [updated] = await db
      .update(orders)
      .set({ vipTimeReleased: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async getConflictingOrdersForVipSlot(date: Date, blockedStart: Date, blockedEnd: Date): Promise<Order[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Find non-VIP orders on the same day that overlap with the blocked period
    // We check if the delivery window time range overlaps with blockedStart-blockedEnd
    const dayOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          ne(orders.bookingType, 'vip_exclusive'),
          sql`${orders.status} NOT IN ('cancelled', 'completed')`,
          eq(orders.needsRebooking, false),
          gte(orders.scheduledDate, startOfDay),
          lt(orders.scheduledDate, endOfDay)
        )
      );
    
    // Filter orders whose delivery windows overlap with blocked period
    return dayOrders.filter(order => {
      const windowOverlap = this.checkDeliveryWindowOverlap(order.deliveryWindow, date, blockedStart, blockedEnd);
      return windowOverlap;
    });
  }

  private checkDeliveryWindowOverlap(deliveryWindow: string, date: Date, blockedStart: Date, blockedEnd: Date): boolean {
    // Parse delivery window labels like "8:00 AM - 10:00 AM" or "Morning (8 AM - 12 PM)"
    const timeRangeMatch = deliveryWindow.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    
    if (!timeRangeMatch) {
      // Can't parse, assume it might overlap
      return true;
    }
    
    const [, startHour, startMin, startPeriod, endHour, endMin, endPeriod] = timeRangeMatch;
    
    let startH = parseInt(startHour);
    let endH = parseInt(endHour);
    const startM = parseInt(startMin || '0');
    const endM = parseInt(endMin || '0');
    
    if (startPeriod.toUpperCase() === 'PM' && startH !== 12) startH += 12;
    if (startPeriod.toUpperCase() === 'AM' && startH === 12) startH = 0;
    if (endPeriod.toUpperCase() === 'PM' && endH !== 12) endH += 12;
    if (endPeriod.toUpperCase() === 'AM' && endH === 12) endH = 0;
    
    const windowStart = new Date(date);
    windowStart.setHours(startH, startM, 0, 0);
    const windowEnd = new Date(date);
    windowEnd.setHours(endH, endM, 0, 0);
    
    // Check for overlap: two ranges overlap if start1 < end2 AND end1 > start2
    return windowStart < blockedEnd && windowEnd > blockedStart;
  }

  async markOrderNeedsRebooking(orderId: string, displacedByOrderId: string): Promise<Order | undefined> {
    const [updated] = await db
      .update(orders)
      .set({ 
        needsRebooking: true, 
        displacedByOrderId 
      })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async getHouseholdUsageStats(): Promise<{ userId: string; name: string; email: string; ordersThisMonth: number }[]> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    const result = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        ordersThisMonth: sql<number>`count(${orders.id})`,
      })
      .from(users)
      .leftJoin(
        orders, 
        and(
          eq(orders.userId, users.id),
          gte(orders.scheduledDate, startOfMonth),
          lt(orders.scheduledDate, endOfMonth),
          ne(orders.status, 'cancelled')
        )
      )
      .where(eq(users.subscriptionTier, 'household'))
      .groupBy(users.id, users.name, users.email);
    
    return result.map(r => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      ordersThisMonth: Number(r.ordersThisMonth || 0),
    }));
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
    // First unlink any orders that reference this schedule
    await db.update(orders).set({ recurringScheduleId: null }).where(eq(orders.recurringScheduleId, id));
    // Then delete the schedule
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
    const cacheKey = `business_setting:${key}`;
    const cached = serverCache.get<string>(cacheKey);
    if (cached !== undefined) return cached;
    const [setting] = await db.select().from(businessSettings).where(eq(businessSettings.settingKey, key));
    const result = setting?.settingValue;
    if (result !== undefined) serverCache.set(cacheKey, result, 30000);
    return result;
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
    serverCache.invalidate(`business_setting:${key}`);
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

  // Pre-trip inspection methods
  async getTodayPreTripInspection(truckId: string, startOfDay: Date, endOfDay: Date): Promise<TruckPreTripInspection | undefined> {
    const [inspection] = await db.select().from(truckPreTripInspections)
      .where(and(
        eq(truckPreTripInspections.truckId, truckId),
        gte(truckPreTripInspections.inspectionDate, startOfDay),
        lt(truckPreTripInspections.inspectionDate, endOfDay)
      ))
      .orderBy(desc(truckPreTripInspections.createdAt))
      .limit(1);
    return inspection || undefined;
  }

  async getPreTripInspections(truckId: string, limit: number = 30): Promise<TruckPreTripInspection[]> {
    return await db.select().from(truckPreTripInspections)
      .where(eq(truckPreTripInspections.truckId, truckId))
      .orderBy(desc(truckPreTripInspections.inspectionDate))
      .limit(limit);
  }

  async createPreTripInspection(inspection: InsertTruckPreTripInspection): Promise<TruckPreTripInspection> {
    const [created] = await db.insert(truckPreTripInspections).values(inspection).returning();
    return created;
  }

  async getAllTodayPreTripStatuses(startOfDay: Date, endOfDay: Date): Promise<{ truckId: string; hasInspection: boolean; vehicleRoadworthy: boolean }[]> {
    const allTrucks = await this.getAllTrucks();
    const statuses = [];
    
    for (const truck of allTrucks) {
      const inspection = await this.getTodayPreTripInspection(truck.id, startOfDay, endOfDay);
      statuses.push({
        truckId: truck.id,
        hasInspection: !!inspection,
        vehicleRoadworthy: inspection?.vehicleRoadworthy ?? false,
      });
    }
    
    return statuses;
  }

  async getTruckById(id: string): Promise<Truck | undefined> {
    return this.getTruck(id);
  }

  // Driver methods
  async getAllDrivers(): Promise<Driver[]> {
    return await db.select().from(drivers).orderBy(drivers.lastName, drivers.firstName);
  }

  async getDriver(id: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, id));
    return driver || undefined;
  }

  async createDriver(driver: InsertDriver): Promise<Driver> {
    const [created] = await db.insert(drivers).values(driver).returning();
    return created;
  }

  async updateDriver(id: string, data: Partial<Driver>): Promise<Driver> {
    const [updated] = await db.update(drivers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(drivers.id, id))
      .returning();
    return updated;
  }

  async deleteDriver(id: string): Promise<void> {
    await db.delete(drivers).where(eq(drivers.id, id));
  }

  // Promo code methods
  async getPromoCode(id: string): Promise<PromoCode | undefined> {
    const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.id, id));
    return promo || undefined;
  }

  async getPromoCodeByCode(code: string): Promise<PromoCode | undefined> {
    const [promo] = await db.select().from(promoCodes).where(
      eq(sql`UPPER(${promoCodes.code})`, code.toUpperCase())
    );
    return promo || undefined;
  }

  async getAllPromoCodes(): Promise<PromoCode[]> {
    return await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
  }

  async createPromoCode(promo: InsertPromoCode): Promise<PromoCode> {
    const [created] = await db.insert(promoCodes).values(promo).returning();
    return created;
  }

  async updatePromoCode(id: string, data: Partial<PromoCode>): Promise<PromoCode> {
    const [updated] = await db.update(promoCodes)
      .set(data)
      .where(eq(promoCodes.id, id))
      .returning();
    return updated;
  }

  async deletePromoCode(id: string): Promise<void> {
    await db.delete(promoRedemptions).where(eq(promoRedemptions.promoCodeId, id));
    await db.delete(promoCodes).where(eq(promoCodes.id, id));
  }

  async incrementPromoCodeUses(id: string): Promise<void> {
    // Atomically increment with guard for maxTotalUses
    const result = await db.update(promoCodes)
      .set({ currentUses: sql`${promoCodes.currentUses} + 1` })
      .where(and(
        eq(promoCodes.id, id),
        or(
          isNull(promoCodes.maxTotalUses),
          sql`${promoCodes.currentUses} < ${promoCodes.maxTotalUses}`
        )
      ))
      .returning();
  }

  async deletePromoRedemption(id: string): Promise<void> {
    await db.delete(promoRedemptions).where(eq(promoRedemptions.id, id));
  }

  async decrementPromoCodeUses(id: string): Promise<void> {
    await db.update(promoCodes)
      .set({ currentUses: sql`GREATEST(0, ${promoCodes.currentUses} - 1)` })
      .where(eq(promoCodes.id, id));
  }

  // Promo redemption methods
  async getUserPromoRedemption(userId: string, promoCodeId: string): Promise<PromoRedemption | undefined> {
    const [redemption] = await db.select().from(promoRedemptions)
      .where(and(
        eq(promoRedemptions.userId, userId),
        eq(promoRedemptions.promoCodeId, promoCodeId)
      ));
    return redemption || undefined;
  }

  async createPromoRedemption(redemption: InsertPromoRedemption): Promise<PromoRedemption> {
    const [created] = await db.insert(promoRedemptions).values(redemption).returning();
    return created;
  }

  async updatePromoRedemption(id: string, data: Partial<PromoRedemption>): Promise<PromoRedemption> {
    const [updated] = await db.update(promoRedemptions)
      .set(data)
      .where(eq(promoRedemptions.id, id))
      .returning();
    return updated;
  }

  async getPromoRedemptionsByCode(promoCodeId: string): Promise<PromoRedemption[]> {
    return await db.select().from(promoRedemptions)
      .where(eq(promoRedemptions.promoCodeId, promoCodeId))
      .orderBy(desc(promoRedemptions.redeemedAt));
  }

  // User address methods
  async getUserAddresses(userId: string): Promise<UserAddress[]> {
    return await db.select().from(userAddresses)
      .where(eq(userAddresses.userId, userId))
      .orderBy(desc(userAddresses.isDefault), asc(userAddresses.createdAt));
  }

  async getUserAddress(id: string): Promise<UserAddress | undefined> {
    const [address] = await db.select().from(userAddresses)
      .where(eq(userAddresses.id, id));
    return address || undefined;
  }

  async createUserAddress(address: InsertUserAddress): Promise<UserAddress> {
    if (address.isDefault) {
      await db.update(userAddresses)
        .set({ isDefault: false })
        .where(eq(userAddresses.userId, address.userId));
    }
    const [created] = await db.insert(userAddresses).values(address).returning();
    return created;
  }

  async updateUserAddress(id: string, data: Partial<InsertUserAddress>): Promise<UserAddress> {
    const [existing] = await db.select().from(userAddresses)
      .where(eq(userAddresses.id, id));
    
    if (data.isDefault && existing) {
      await db.update(userAddresses)
        .set({ isDefault: false })
        .where(eq(userAddresses.userId, existing.userId));
    }
    
    const [updated] = await db.update(userAddresses)
      .set(data)
      .where(eq(userAddresses.id, id))
      .returning();
    return updated;
  }

  async deleteUserAddress(id: string): Promise<void> {
    await db.delete(userAddresses).where(eq(userAddresses.id, id));
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    await db.update(userAddresses)
      .set({ isDefault: false })
      .where(eq(userAddresses.userId, userId));
    
    await db.update(userAddresses)
      .set({ isDefault: true })
      .where(eq(userAddresses.id, addressId));

    const address = await db.select().from(userAddresses).where(eq(userAddresses.id, addressId)).then(rows => rows[0]);
    if (address) {
      await db.update(users)
        .set({ defaultAddress: address.address, defaultCity: address.city })
        .where(eq(users.id, userId));
    }
  }

  async countUserAddresses(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(userAddresses)
      .where(eq(userAddresses.userId, userId));
    return Number(result[0]?.count ?? 0);
  }

  // Parts inventory methods
  async getAllParts(): Promise<Part[]> {
    return await db.select().from(parts).orderBy(desc(parts.createdAt));
  }

  async getPart(id: string): Promise<Part | undefined> {
    const [part] = await db.select().from(parts).where(eq(parts.id, id));
    return part || undefined;
  }

  async createPart(part: InsertPart): Promise<Part> {
    const [created] = await db.insert(parts).values(part).returning();
    return created;
  }

  async updatePart(id: string, data: Partial<InsertPart>): Promise<Part> {
    const [updated] = await db.update(parts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(parts.id, id))
      .returning();
    return updated;
  }

  async deletePart(id: string): Promise<void> {
    await db.delete(parts).where(eq(parts.id, id));
  }

  async createWaitlistEntry(entry: InsertWaitlistEntry): Promise<WaitlistEntry> {
    const [result] = await db.insert(waitlistEntries).values(entry).returning();
    return result;
  }

  async createWaitlistVehicle(vehicle: InsertWaitlistVehicle): Promise<WaitlistVehicle> {
    const [result] = await db.insert(waitlistVehicles).values(vehicle).returning();
    return result;
  }

  async getWaitlistEntries(): Promise<(WaitlistEntry & { vehicles: WaitlistVehicle[] })[]> {
    const entries = await db.select().from(waitlistEntries).orderBy(asc(waitlistEntries.createdAt));
    const allVehicles = await db.select().from(waitlistVehicles);
    return entries.map(entry => ({
      ...entry,
      vehicles: allVehicles.filter(v => v.entryId === entry.id),
    }));
  }

  async getWaitlistCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(waitlistEntries);
    return Number(result[0]?.count || 0);
  }

  async getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | null> {
    const [entry] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.email, email.toLowerCase()));
    return entry || null;
  }

  async updateWaitlistEntry(id: string, data: Partial<Pick<WaitlistEntry, 'status' | 'notes' | 'invitedAt' | 'convertedAt' | 'priorityScore' | 'postalCode' | 'phone' | 'address' | 'city' | 'referralSource' | 'referralDetail' | 'estimatedMonthlyUsage' | 'vehicleCount' | 'preferredTier'>>): Promise<WaitlistEntry> {
    const [updated] = await db.update(waitlistEntries).set(data).where(eq(waitlistEntries.id, id)).returning();
    return updated;
  }

  async getWaitlistVehiclesByEntryId(entryId: string): Promise<WaitlistVehicle[]> {
    return db.select().from(waitlistVehicles).where(eq(waitlistVehicles.entryId, entryId));
  }

  async deleteWaitlistEntry(id: string): Promise<void> {
    await db.delete(waitlistEntries).where(eq(waitlistEntries.id, id));
  }

  async getWaitlistCountByStatus(): Promise<Record<string, number>> {
    const results = await db.select({
      status: waitlistEntries.status,
      count: sql<number>`count(*)`
    }).from(waitlistEntries).groupBy(waitlistEntries.status);
    const counts: Record<string, number> = { new: 0, contacted: 0, invited: 0, converted: 0, declined: 0 };
    for (const r of results) {
      counts[r.status] = Number(r.count);
    }
    return counts;
  }

  async getAddressByLocation(userId: string, address: string, city: string): Promise<UserAddress | undefined> {
    const [result] = await db.select().from(userAddresses)
      .where(and(
        eq(userAddresses.userId, userId),
        eq(userAddresses.address, address),
        eq(userAddresses.city, city)
      ));
    return result || undefined;
  }

  async updateAddressDeliveryNotes(addressId: string, notes: string): Promise<UserAddress> {
    const [updated] = await db.update(userAddresses)
      .set({ deliveryNotes: notes })
      .where(eq(userAddresses.id, addressId))
      .returning();
    return updated;
  }

  async markOrderFailedDelivery(orderId: string, reason: string): Promise<Order> {
    const [updated] = await db.update(orders)
      .set({
        status: "failed_delivery",
        failedReason: reason,
        failedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async updateOrderProofOfDelivery(orderId: string, photoUrl: string): Promise<Order> {
    const [updated] = await db.update(orders)
      .set({ proofOfDeliveryUrl: photoUrl, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async linkRescheduledOrders(originalId: string, newOrderId: string): Promise<void> {
    await db.update(orders)
      .set({ rescheduledToId: newOrderId, updatedAt: new Date() })
      .where(eq(orders.id, originalId));
    await db.update(orders)
      .set({ rescheduledFromId: originalId, updatedAt: new Date() })
      .where(eq(orders.id, newOrderId));
  }

  async saveRoutePlannedStopOrder(routeId: string, stopOrder: string[]): Promise<void> {
    await db.update(routes)
      .set({ plannedStopOrder: JSON.stringify(stopOrder), updatedAt: new Date() })
      .where(eq(routes.id, routeId));
  }

  async appendRouteGpsTrace(routeId: string, lat: number, lng: number): Promise<void> {
    const [route] = await db.select({ actualGpsTrace: routes.actualGpsTrace }).from(routes).where(eq(routes.id, routeId));
    const existing: Array<{ lat: number; lng: number; t: number }> = route?.actualGpsTrace ? JSON.parse(route.actualGpsTrace) : [];
    existing.push({ lat, lng, t: Date.now() });
    await db.update(routes)
      .set({ actualGpsTrace: JSON.stringify(existing), updatedAt: new Date() })
      .where(eq(routes.id, routeId));
  }

  async setRouteActualTimes(routeId: string, startTime?: Date, endTime?: Date): Promise<void> {
    const data: Record<string, any> = { updatedAt: new Date() };
    if (startTime) data.actualStartTime = startTime;
    if (endTime) data.actualEndTime = endTime;
    await db.update(routes).set(data).where(eq(routes.id, routeId));
  }
}

export const storage = new DatabaseStorage();
