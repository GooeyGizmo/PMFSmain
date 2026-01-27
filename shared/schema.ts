import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, pgEnum, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["user", "operator", "admin", "owner"]);
export const subscriptionTierEnum = pgEnum("subscription_tier", ["payg", "access", "household", "rural", "vip"]);
export const bookingTypeEnum = pgEnum("booking_type", ["standard_window", "vip_exclusive"]);
export const householdUsageFlagEnum = pgEnum("household_usage_flag", ["normal", "over_usage", "excessive_usage"]);
export const fuelTypeEnum = pgEnum("fuel_type", ["regular", "premium", "diesel"]);
export const orderStatusEnum = pgEnum("order_status", ["scheduled", "confirmed", "en_route", "arriving", "fueling", "completed", "cancelled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "preauthorized", "captured", "failed", "refunded", "cancelled"]);
export const routeStatusEnum = pgEnum("route_status", ["pending", "in_progress", "completed"]);
export const serviceTypeEnum = pgEnum("service_type", ["emergency_fuel", "lockout", "boost"]);
export const serviceRequestStatusEnum = pgEnum("service_request_status", ["pending", "dispatched", "en_route", "on_site", "completed", "cancelled"]);
export const equipmentTypeEnum = pgEnum("equipment_type", ["vehicle", "boat", "rv", "quads_toys", "generator", "other"]);

// Subscription Tiers Configuration Table
export const subscriptionTiers = pgTable("subscription_tiers", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  monthlyFee: decimal("monthly_fee", { precision: 10, scale: 2 }).notNull(),
  monthlyFeeWithGst: decimal("monthly_fee_with_gst", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).notNull(),
  perLitreDiscount: decimal("per_litre_discount", { precision: 10, scale: 4 }).notNull(),
  minOrderLitres: integer("min_order_litres").notNull().default(0),
  maxVehiclesPerOrder: integer("max_vehicles_per_order").notNull(),
  maxOrdersPerMonth: integer("max_orders_per_month"),
  stripePriceId: text("stripe_price_id"),
  stripeProductId: text("stripe_product_id"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  role: roleEnum("role").notNull().default("user"),
  subscriptionTier: subscriptionTierEnum("subscription_tier").notNull().default("payg"),
  defaultAddress: text("default_address"),
  defaultCity: text("default_city"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeSubscriptionStatus: text("stripe_subscription_status"),
  paymentBlocked: boolean("payment_blocked").notNull().default(false),
  paymentBlockedReason: text("payment_blocked_reason"),
  hasEmergencyAccess: boolean("has_emergency_access").notNull().default(false),
  emergencyAccessStripeSubId: text("emergency_access_stripe_sub_id"),
  emergencyCreditsRemaining: integer("emergency_credits_remaining").notNull().default(0),
  emergencyCreditYearStart: timestamp("emergency_credit_year_start"),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: text("verification_token"),
  verificationTokenExpires: timestamp("verification_token_expires"),
  // Household usage tracking (admin-only soft caps)
  householdUsageFlag: householdUsageFlagEnum("household_usage_flag").default("normal"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  vehicles: many(vehicles),
  orders: many(orders),
  addresses: many(userAddresses),
}));

// User Addresses table
export const userAddresses = pgTable("user_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  latitude: text("latitude"),
  longitude: text("longitude"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userAddressesRelations = relations(userAddresses, ({ one }) => ({
  user: one(users, {
    fields: [userAddresses.userId],
    references: [users.id],
  }),
}));

// Vehicles table (supports multiple equipment types)
export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  equipmentType: equipmentTypeEnum("equipment_type").notNull().default("vehicle"),
  year: text("year"),
  make: text("make").notNull(),
  model: text("model").notNull(),
  color: text("color"),
  licensePlate: text("license_plate"),
  hullId: text("hull_id"),
  fuelType: fuelTypeEnum("fuel_type").notNull(),
  tankCapacity: integer("tank_capacity").notNull(),
  nickname: text("nickname"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  user: one(users, {
    fields: [vehicles.userId],
    references: [users.id],
  }),
  orders: many(orders),
}));

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vehicleId: varchar("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  
  // Delivery details
  address: text("address").notNull(),
  city: text("city").notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  deliveryWindow: text("delivery_window").notNull(),
  
  // Fuel details
  fuelType: fuelTypeEnum("fuel_type").notNull(),
  fuelAmount: decimal("fuel_amount", { precision: 8, scale: 2 }).notNull(),
  fillToFull: boolean("fill_to_full").notNull().default(false),
  
  // Pricing
  pricePerLitre: decimal("price_per_litre", { precision: 10, scale: 4 }).notNull(),
  tierDiscount: decimal("tier_discount", { precision: 10, scale: 4 }).notNull().default("0"),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  gstAmount: decimal("gst_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  
  // Delivery tracking
  actualLitresDelivered: decimal("actual_litres_delivered", { precision: 10, scale: 2 }),
  
  // Status
  status: orderStatusEnum("status").notNull().default("scheduled"),
  notes: text("notes"),
  
  // Payment
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  preAuthAmount: decimal("pre_auth_amount", { precision: 10, scale: 2 }),
  finalAmount: decimal("final_amount", { precision: 10, scale: 2 }),
  finalGstAmount: decimal("final_gst_amount", { precision: 10, scale: 2 }),
  
  // Route assignment
  routeId: varchar("route_id"),
  routePosition: integer("route_position"),
  tierPriority: integer("tier_priority").notNull().default(4),
  estimatedArrival: timestamp("estimated_arrival"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  // Recurring order tracking
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringScheduleId: varchar("recurring_schedule_id").references(() => recurringSchedules.id),
  
  // Promo code
  promoCodeId: varchar("promo_code_id"),
  
  // VIP booking fields
  bookingType: bookingTypeEnum("booking_type").notNull().default("standard_window"),
  vipStartTime: timestamp("vip_start_time"),
  vipEndTime: timestamp("vip_end_time"),
  vipTimeReleased: timestamp("vip_time_released"),
  
  // Displacement fields for VIP priority
  needsRebooking: boolean("needs_rebooking").notNull().default(false),
  displacedByOrderId: varchar("displaced_by_order_id"),
  
  // Pricing snapshot - locked at delivery time for historical accuracy
  pricingSnapshotJson: text("pricing_snapshot_json"), // JSONB stored as text for Drizzle compatibility
  snapshotLockedAt: timestamp("snapshot_locked_at"),
  snapshotLockedBy: varchar("snapshot_locked_by").references(() => users.id),
  
  // Delivery timestamp - set when status becomes "delivered"
  deliveredAt: timestamp("delivered_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [orders.vehicleId],
    references: [vehicles.id],
  }),
  route: one(routes, {
    fields: [orders.routeId],
    references: [routes.id],
  }),
  items: many(orderItems),
}));

// Order Items table - stores per-vehicle fuel details for multi-vehicle orders
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  vehicleId: varchar("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  
  // Fuel details per vehicle
  fuelType: fuelTypeEnum("fuel_type").notNull(),
  fuelAmount: decimal("fuel_amount", { precision: 8, scale: 2 }).notNull(),
  fillToFull: boolean("fill_to_full").notNull().default(false),
  
  // Pricing per vehicle (at time of order)
  pricePerLitre: decimal("price_per_litre", { precision: 10, scale: 4 }).notNull(),
  tierDiscount: decimal("tier_discount", { precision: 10, scale: 4 }).notNull().default("0"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  
  // Delivery tracking per vehicle
  actualLitresDelivered: decimal("actual_litres_delivered", { precision: 10, scale: 2 }),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  vehicle: one(vehicles, {
    fields: [orderItems.vehicleId],
    references: [vehicles.id],
  }),
}));

// Fuel Pricing table
export const fuelPricing = pgTable("fuel_pricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fuelType: fuelTypeEnum("fuel_type").notNull().unique(),
  baseCost: decimal("base_cost", { precision: 10, scale: 4 }).notNull(),
  markupPercent: decimal("markup_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  markupFlat: decimal("markup_flat", { precision: 10, scale: 4 }).notNull().default("0"),
  customerPrice: decimal("customer_price", { precision: 10, scale: 4 }).notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

// Fuel Price History table - for tracking historical prices (extended for COGS tracking)
export const fuelPriceHistory = pgTable("fuel_price_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fuelType: fuelTypeEnum("fuel_type").notNull(),
  baseCost: decimal("base_cost", { precision: 10, scale: 4 }), // Added for COGS tracking
  markupPercent: decimal("markup_percent", { precision: 5, scale: 2 }), // Added for COGS tracking
  markupFlat: decimal("markup_flat", { precision: 10, scale: 4 }), // Added for COGS tracking
  customerPrice: decimal("customer_price", { precision: 10, scale: 4 }).notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

// Push Subscriptions table - for storing Web Push subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

// Notification Preferences table - for user notification settings
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  orderUpdates: boolean("order_updates").notNull().default(true),
  promotionalOffers: boolean("promotional_offers").notNull().default(true),
  deliveryReminders: boolean("delivery_reminders").notNull().default(true),
  paymentAlerts: boolean("payment_alerts").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
}));

// Routes table - for grouping orders into delivery routes
export const routes = pgTable("routes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  routeDate: timestamp("route_date").notNull(),
  routeNumber: integer("route_number").notNull().default(1),
  driverName: text("driver_name"),
  driverId: varchar("driver_id").references(() => users.id),
  status: routeStatusEnum("status").notNull().default("pending"),
  orderCount: integer("order_count").notNull().default(0),
  totalLitres: integer("total_litres").notNull().default(0),
  isOptimized: boolean("is_optimized").notNull().default(false),
  
  // Route distance metrics (calculated during optimization)
  totalDistanceKm: decimal("total_distance_km", { precision: 10, scale: 2 }),
  avgStopDistanceKm: decimal("avg_stop_distance_km", { precision: 10, scale: 2 }),
  
  // Assigned truck for fuel economy calculations
  truckId: varchar("truck_id").references(() => trucks.id, { onDelete: "set null" }),
  
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const routesRelations = relations(routes, ({ one, many }) => ({
  driver: one(users, {
    fields: [routes.driverId],
    references: [users.id],
  }),
  orders: many(orders),
}));

// Insert/Select schemas
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
}).omit({
  id: true,
  createdAt: true,
});

export const selectUserSchema = createSelectSchema(users).omit({
  password: true,
});

export const insertVehicleSchema = createInsertSchema(vehicles, {
  equipmentType: z.enum(["vehicle", "boat", "rv", "quads_toys", "generator", "other"]).default("vehicle"),
  year: z.string().min(4).max(4).optional().nullable(),
  make: z.string().min(1),
  model: z.string().min(1),
  color: z.string().min(1).optional().nullable(),
  licensePlate: z.string().min(1).optional().nullable(),
  hullId: z.string().min(1).optional().nullable(),
  nickname: z.string().optional().nullable(),
  tankCapacity: z.number().min(1),
}).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders, {
  address: z.string().min(1),
  city: z.string().min(1),
  fuelAmount: z.number().min(0.1),
  scheduledDate: z.union([z.string(), z.date()]).transform((val) => 
    typeof val === 'string' ? new Date(val) : val
  ),
  vipStartTime: z.union([z.string(), z.date(), z.null()]).optional().transform((val) => 
    val === null || val === undefined ? null : typeof val === 'string' ? new Date(val) : val
  ),
  vipEndTime: z.union([z.string(), z.date(), z.null()]).optional().transform((val) => 
    val === null || val === undefined ? null : typeof val === 'string' ? new Date(val) : val
  ),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  actualLitresDelivered: true,
  stripePaymentIntentId: true,
  paymentStatus: true,
  preAuthAmount: true,
  finalAmount: true,
  finalGstAmount: true,
  routeId: true,
  routePosition: true,
  tierPriority: true,
}).extend({
  isRecurring: z.boolean().optional().default(false),
  recurringScheduleId: z.string().optional(),
});

export const insertRouteSchema = createInsertSchema(routes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFuelPricingSchema = createInsertSchema(fuelPricing).omit({
  id: true,
  updatedAt: true,
});

export const updateFuelPricingSchema = z.object({
  baseCost: z.string(),
  markupPercent: z.string(),
  markupFlat: z.string(),
  customerPrice: z.string(),
});

export const insertSubscriptionTierSchema = createInsertSchema(subscriptionTiers);

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
  createdAt: true,
  actualLitresDelivered: true,
});

export const insertUserAddressSchema = createInsertSchema(userAddresses, {
  label: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  isDefault: z.boolean().optional().default(false),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type PublicUser = z.infer<typeof selectUserSchema>;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type FuelPricing = typeof fuelPricing.$inferSelect;
export type InsertFuelPricing = z.infer<typeof insertFuelPricingSchema>;
export type FuelPriceHistory = typeof fuelPriceHistory.$inferSelect;
export type SubscriptionTier = typeof subscriptionTiers.$inferSelect;
export type InsertSubscriptionTier = z.infer<typeof insertSubscriptionTierSchema>;
export type Route = typeof routes.$inferSelect;
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type UserAddress = typeof userAddresses.$inferSelect;
export type InsertUserAddress = z.infer<typeof insertUserAddressSchema>;

// Recurring Schedules table
export const recurringScheduleFrequencyEnum = pgEnum("recurring_schedule_frequency", ["weekly", "bi-weekly", "monthly"]);

export const recurringSchedules = pgTable("recurring_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vehicleId: varchar("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  frequency: recurringScheduleFrequencyEnum("frequency").notNull(),
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly/bi-weekly
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly
  preferredWindow: text("preferred_window").notNull().default("9:00 AM - 12:00 PM"),
  fuelType: fuelTypeEnum("fuel_type").notNull().default("regular"),
  fuelAmount: decimal("fuel_amount", { precision: 8, scale: 2 }).notNull(),
  fillToFull: boolean("fill_to_full").notNull().default(false),
  active: boolean("active").notNull().default(true),
  lastOrderDate: timestamp("last_order_date"),
  nextOrderDate: timestamp("next_order_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const recurringSchedulesRelations = relations(recurringSchedules, ({ one }) => ({
  user: one(users, {
    fields: [recurringSchedules.userId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [recurringSchedules.vehicleId],
    references: [vehicles.id],
  }),
}));

// Rewards/Points System
export const rewardTransactionTypeEnum = pgEnum("reward_transaction_type", ["earned", "redeemed", "expired", "adjusted"]);

export const rewardBalances = pgTable("reward_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  availablePoints: integer("available_points").notNull().default(0),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rewardTransactions = pgTable("reward_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: rewardTransactionTypeEnum("type").notNull(),
  points: integer("points").notNull(),
  description: text("description").notNull(),
  orderId: varchar("order_id").references(() => orders.id),
  orderTotal: decimal("order_total", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rewardRedemptions = pgTable("reward_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemName: text("item_name").notNull(),
  itemDescription: text("item_description"),
  pointsCost: integer("points_cost").notNull(),
  status: text("status").notNull().default("pending"), // pending, fulfilled, cancelled
  fulfilledAt: timestamp("fulfilled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rewardBalancesRelations = relations(rewardBalances, ({ one }) => ({
  user: one(users, {
    fields: [rewardBalances.userId],
    references: [users.id],
  }),
}));

export const rewardTransactionsRelations = relations(rewardTransactions, ({ one }) => ({
  user: one(users, {
    fields: [rewardTransactions.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [rewardTransactions.orderId],
    references: [orders.id],
  }),
}));

// Fuel Inventory System
export const fuelInventory = pgTable("fuel_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fuelType: fuelTypeEnum("fuel_type").notNull().unique(),
  currentStock: decimal("current_stock", { precision: 10, scale: 2 }).notNull().default("0"),
  lowStockThreshold: decimal("low_stock_threshold", { precision: 10, scale: 2 }).notNull().default("500"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fuelInventoryTransactionTypeEnum = pgEnum("fuel_inventory_transaction_type", ["purchase", "delivery", "adjustment", "spill"]);

export const fuelInventoryTransactions = pgTable("fuel_inventory_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fuelType: fuelTypeEnum("fuel_type").notNull(),
  type: fuelInventoryTransactionTypeEnum("type").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(), // positive for additions, negative for deductions
  costPerLitre: decimal("cost_per_litre", { precision: 10, scale: 4 }), // cost per litre for purchases
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }), // total cost of this transaction
  previousStock: decimal("previous_stock", { precision: 10, scale: 2 }).notNull(),
  newStock: decimal("new_stock", { precision: 10, scale: 2 }).notNull(),
  orderId: varchar("order_id").references(() => orders.id),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas for new tables
export const insertRecurringScheduleSchema = createInsertSchema(recurringSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastOrderDate: true,
  nextOrderDate: true,
});

export const insertRewardTransactionSchema = createInsertSchema(rewardTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertRewardRedemptionSchema = createInsertSchema(rewardRedemptions).omit({
  id: true,
  createdAt: true,
  fulfilledAt: true,
});

export const insertFuelInventoryTransactionSchema = createInsertSchema(fuelInventoryTransactions).omit({
  id: true,
  createdAt: true,
});

// New types
export type RecurringSchedule = typeof recurringSchedules.$inferSelect;
export type InsertRecurringSchedule = z.infer<typeof insertRecurringScheduleSchema>;
export type RewardBalance = typeof rewardBalances.$inferSelect;
export type RewardTransaction = typeof rewardTransactions.$inferSelect;
export type InsertRewardTransaction = z.infer<typeof insertRewardTransactionSchema>;
export type RewardRedemption = typeof rewardRedemptions.$inferSelect;
export type InsertRewardRedemption = z.infer<typeof insertRewardRedemptionSchema>;
export type FuelInventoryRecord = typeof fuelInventory.$inferSelect;
export type FuelInventoryTransaction = typeof fuelInventoryTransactions.$inferSelect;
export type InsertFuelInventoryTransaction = z.infer<typeof insertFuelInventoryTransactionSchema>;

// Business Settings for Analytics
export const businessSettings = pgTable("business_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingKey: text("setting_key").notNull().unique(),
  settingValue: text("setting_value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertBusinessSettingSchema = createInsertSchema(businessSettings).omit({
  id: true,
  updatedAt: true,
});

export type BusinessSetting = typeof businessSettings.$inferSelect;
export type InsertBusinessSetting = z.infer<typeof insertBusinessSettingSchema>;

// Daily Net Margin Snapshots - Logged at 10pm Calgary time each day
export const dailyNetMarginSnapshots = pgTable("daily_net_margin_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: timestamp("snapshot_date").notNull().unique(),
  netMarginPercent: decimal("net_margin_percent", { precision: 10, scale: 4 }).notNull(),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
  totalCogs: decimal("total_cogs", { precision: 12, scale: 2 }).notNull().default("0"),
  totalOperatingCosts: decimal("total_operating_costs", { precision: 12, scale: 2 }).notNull().default("0"),
  netProfit: decimal("net_profit", { precision: 12, scale: 2 }).notNull().default("0"),
  ordersCompleted: integer("orders_completed").notNull().default(0),
  litresDelivered: decimal("litres_delivered", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDailyNetMarginSnapshotSchema = createInsertSchema(dailyNetMarginSnapshots).omit({
  id: true,
  createdAt: true,
});

export type DailyNetMarginSnapshot = typeof dailyNetMarginSnapshots.$inferSelect;
export type InsertDailyNetMarginSnapshot = z.infer<typeof insertDailyNetMarginSnapshotSchema>;

// Shame Events - Track 0-litre delivery attempts (for the Hall of Shame)
export const shameEvents = pgTable("shame_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageShown: text("message_shown").notNull(),
  orderId: varchar("order_id").references(() => orders.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const shameEventsRelations = relations(shameEvents, ({ one }) => ({
  user: one(users, {
    fields: [shameEvents.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [shameEvents.orderId],
    references: [orders.id],
  }),
}));

export const insertShameEventSchema = createInsertSchema(shameEvents).omit({
  id: true,
  createdAt: true,
});

export type ShameEvent = typeof shameEvents.$inferSelect;
export type InsertShameEvent = z.infer<typeof insertShameEventSchema>;

// Re-export pricing constants from shared/pricing.ts (single source of truth)
export { 
  GST_RATE, 
  TIER_PRIORITY, 
  EMERGENCY_FEES,
  DELIVERY_FEES_BY_TIER,
  SUBSCRIPTION_MONTHLY_FEES,
  SUBSCRIPTION_MAX_VEHICLES,
  SUBSCRIPTION_BENEFITS,
  SUBSCRIPTION_DISPLAY_NAMES,
  PRICING_MODEL_VERSION,
  STRIPE_FEE_RATE,
  STRIPE_FEE_FLAT_CENTS,
  calculateOrderPricingV2,
  estimateStripeFee,
  getDeliveryFeeForTier,
  type SubscriptionTierId,
  type OrderPricingInput,
  type OrderPricingResult,
} from './pricing';

// Max orders per route
export const MAX_ORDERS_PER_ROUTE = 20;

// Rewards: Points per dollar spent (1 point = $1 spent)
export const POINTS_PER_DOLLAR = 1;

// ============================================
// Fleet Management & TDG Compliance
// ============================================

// Truck fuel transaction types
export const truckFuelTransactionTypeEnum = pgEnum("truck_fuel_transaction_type", ["fill", "dispense", "adjustment", "ops_empty"]);

// Trucks table - Fleet vehicles for fuel delivery
export const trucks = pgTable("trucks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitNumber: text("unit_number").notNull().unique(),
  name: text("name"), // Optional friendly name like "Big Blue"
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: text("year").notNull(),
  licensePlate: text("license_plate").notNull(),
  vinNumber: text("vin_number"),
  
  // Assigned driver
  assignedDriverId: varchar("assigned_driver_id").references(() => users.id, { onDelete: "set null" }),
  
  // Sellable fuel tank capacities (litres)
  regularCapacity: decimal("regular_capacity", { precision: 10, scale: 2 }).notNull().default("0"),
  premiumCapacity: decimal("premium_capacity", { precision: 10, scale: 2 }).notNull().default("0"),
  dieselCapacity: decimal("diesel_capacity", { precision: 10, scale: 2 }).notNull().default("0"),
  
  // Current sellable fuel levels (litres)
  regularLevel: decimal("regular_level", { precision: 10, scale: 2 }).notNull().default("0"),
  premiumLevel: decimal("premium_level", { precision: 10, scale: 2 }).notNull().default("0"),
  dieselLevel: decimal("diesel_level", { precision: 10, scale: 2 }).notNull().default("0"),
  
  // Maintenance tracking
  lastMaintenanceDate: timestamp("last_maintenance_date"),
  nextMaintenanceDate: timestamp("next_maintenance_date"),
  maintenanceNotes: text("maintenance_notes"),
  odometerReading: integer("odometer_reading"),
  
  // Fuel economy - L/100km (for calculating route fuel costs)
  // Driver enters this during daily pre-trip inspection
  fuelEconomy: decimal("fuel_economy", { precision: 5, scale: 2 }),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  
  // GPS location tracking
  lastLatitude: decimal("last_latitude", { precision: 10, scale: 7 }),
  lastLongitude: decimal("last_longitude", { precision: 10, scale: 7 }),
  lastLocationUpdate: timestamp("last_location_update"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const trucksRelations = relations(trucks, ({ one, many }) => ({
  assignedDriver: one(users, {
    fields: [trucks.assignedDriverId],
    references: [users.id],
  }),
  fuelTransactions: many(truckFuelTransactions),
}));

// TDG Fuel Information - Static reference data
export const TDG_FUEL_INFO = {
  regular: {
    unNumber: "UN1203",
    properShippingName: "GASOLINE",
    class: "3",
    packingGroup: "II",
    placard: "FLAMMABLE LIQUID",
    ergGuide: "128",
  },
  premium: {
    unNumber: "UN1203",
    properShippingName: "GASOLINE",
    class: "3",
    packingGroup: "II",
    placard: "FLAMMABLE LIQUID",
    ergGuide: "128",
  },
  diesel: {
    unNumber: "UN1202",
    properShippingName: "DIESEL FUEL",
    class: "3",
    packingGroup: "III",
    placard: "FLAMMABLE LIQUID",
    ergGuide: "128",
  },
};

// CANUTEC Emergency Contact
export const CANUTEC_INFO = {
  name: "CANUTEC",
  phone: "1-888-226-8832",
  phoneAlternate: "*666 (cell)",
  available: "24/7",
  purpose: "Dangerous goods transportation emergencies",
};

// Truck fuel transactions - TDG compliant log
export const truckFuelTransactions = pgTable("truck_fuel_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  truckId: varchar("truck_id").notNull().references(() => trucks.id, { onDelete: "cascade" }),
  
  // Transaction details
  transactionType: truckFuelTransactionTypeEnum("transaction_type").notNull(),
  fuelType: fuelTypeEnum("fuel_type").notNull(),
  litres: decimal("litres", { precision: 10, scale: 2 }).notNull(), // positive for fill, negative for dispense
  
  // Stock levels at time of transaction
  previousLevel: decimal("previous_level", { precision: 10, scale: 2 }).notNull(),
  newLevel: decimal("new_level", { precision: 10, scale: 2 }).notNull(),
  
  // TDG compliance fields
  unNumber: text("un_number").notNull(),
  properShippingName: text("proper_shipping_name").notNull(),
  dangerClass: text("danger_class").notNull(),
  packingGroup: text("packing_group").notNull(),
  
  // Location for dispense transactions
  deliveryAddress: text("delivery_address"),
  deliveryCity: text("delivery_city"),
  
  // Reference to customer order if dispense
  orderId: varchar("order_id").references(() => orders.id),
  
  // Operator who performed the transaction
  operatorId: varchar("operator_id").notNull().references(() => users.id),
  operatorName: text("operator_name").notNull(),
  
  // Notes
  notes: text("notes"),
  
  // Effective timestamp - when the transaction actually occurred (for dispense: deliveredAt)
  effectiveAt: timestamp("effective_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const truckFuelTransactionsRelations = relations(truckFuelTransactions, ({ one }) => ({
  truck: one(trucks, {
    fields: [truckFuelTransactions.truckId],
    references: [trucks.id],
  }),
  order: one(orders, {
    fields: [truckFuelTransactions.orderId],
    references: [orders.id],
  }),
  operator: one(users, {
    fields: [truckFuelTransactions.operatorId],
    references: [users.id],
  }),
}));

// Pre-trip inspection table - daily truck inspection records
export const truckPreTripInspections = pgTable("truck_pre_trip_inspections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  truckId: varchar("truck_id").notNull().references(() => trucks.id, { onDelete: "cascade" }),
  driverId: varchar("driver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  inspectionDate: timestamp("inspection_date").notNull(),
  
  // Vehicle condition checks (all boolean)
  lightsWorking: boolean("lights_working").notNull().default(true),
  brakesWorking: boolean("brakes_working").notNull().default(true),
  tiresCondition: boolean("tires_condition").notNull().default(true),
  mirrorsClear: boolean("mirrors_clear").notNull().default(true),
  hornWorking: boolean("horn_working").notNull().default(true),
  windshieldClear: boolean("windshield_clear").notNull().default(true),
  wipersWorking: boolean("wipers_working").notNull().default(true),
  
  // Fluid levels
  oilLevelOk: boolean("oil_level_ok").notNull().default(true),
  coolantLevelOk: boolean("coolant_level_ok").notNull().default(true),
  washerFluidOk: boolean("washer_fluid_ok").notNull().default(true),
  
  // Safety equipment
  fireExtinguisherPresent: boolean("fire_extinguisher_present").notNull().default(true),
  firstAidKitPresent: boolean("first_aid_kit_present").notNull().default(true),
  spillKitPresent: boolean("spill_kit_present").notNull().default(true),
  tdgDocumentsPresent: boolean("tdg_documents_present").notNull().default(true),
  
  // Odometer and fuel readings at start of day
  odometerReading: integer("odometer_reading").notNull(),
  regularFuelLevel: decimal("regular_fuel_level", { precision: 10, scale: 2 }).notNull().default("0"),
  premiumFuelLevel: decimal("premium_fuel_level", { precision: 10, scale: 2 }).notNull().default("0"),
  dieselFuelLevel: decimal("diesel_fuel_level", { precision: 10, scale: 2 }).notNull().default("0"),
  
  // Truck's own fuel tank (for route efficiency tracking)
  truckFuelLevel: decimal("truck_fuel_level", { precision: 10, scale: 2 }),
  fuelEconomy: decimal("fuel_economy", { precision: 5, scale: 2 }), // L/100km
  
  // Overall status
  vehicleRoadworthy: boolean("vehicle_roadworthy").notNull().default(true),
  notes: text("notes"),
  defectsNoted: text("defects_noted"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const truckPreTripInspectionsRelations = relations(truckPreTripInspections, ({ one }) => ({
  truck: one(trucks, {
    fields: [truckPreTripInspections.truckId],
    references: [trucks.id],
  }),
  driver: one(users, {
    fields: [truckPreTripInspections.driverId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertTruckSchema = createInsertSchema(trucks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTruckFuelTransactionSchema = createInsertSchema(truckFuelTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertTruckPreTripInspectionSchema = createInsertSchema(truckPreTripInspections).omit({
  id: true,
  createdAt: true,
});

// Types
export type Truck = typeof trucks.$inferSelect;
export type InsertTruck = z.infer<typeof insertTruckSchema>;
export type TruckFuelTransaction = typeof truckFuelTransactions.$inferSelect;
export type InsertTruckFuelTransaction = z.infer<typeof insertTruckFuelTransactionSchema>;
export type TruckPreTripInspection = typeof truckPreTripInspections.$inferSelect;
export type InsertTruckPreTripInspection = z.infer<typeof insertTruckPreTripInspectionSchema>;

// ============================================
// Emergency/After-Hours Services
// ============================================

// Business hours configuration (Calgary timezone)
export const BUSINESS_HOURS = {
  startHour: 7,    // 7:00 AM
  startMinute: 0,
  endHour: 17,     // 5:30 PM
  endMinute: 30,
  timezone: 'America/Edmonton',
};

// EMERGENCY_FEES is now re-exported from shared/pricing.ts above

// Service request table for emergency services
export const serviceRequests = pgTable("service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  
  serviceType: serviceTypeEnum("service_type").notNull(),
  status: serviceRequestStatusEnum("status").notNull().default("pending"),
  
  address: text("address").notNull(),
  city: text("city").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  notes: text("notes"),
  
  // For emergency_fuel only
  fuelType: fuelTypeEnum("fuel_type"),
  fuelAmount: decimal("fuel_amount", { precision: 8, scale: 2 }),
  
  // Pricing
  serviceFee: decimal("service_fee", { precision: 10, scale: 2 }).notNull(),
  fuelCost: decimal("fuel_cost", { precision: 10, scale: 2 }).default("0"),
  gstAmount: decimal("gst_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  creditUsed: boolean("credit_used").notNull().default(false),
  
  // Payment
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  dispatchedAt: timestamp("dispatched_at"),
  completedAt: timestamp("completed_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const serviceRequestsRelations = relations(serviceRequests, ({ one }) => ({
  user: one(users, {
    fields: [serviceRequests.userId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [serviceRequests.vehicleId],
    references: [vehicles.id],
  }),
}));

export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  requestedAt: true,
});

export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type ServiceType = "emergency_fuel" | "lockout" | "boost";
export type ServiceRequestStatus = "pending" | "dispatched" | "en_route" | "on_site" | "completed" | "cancelled";

// ============================================
// Driver Management
// ============================================

export const licenseStatusEnum = pgEnum("license_status", ["valid", "expiring", "expired"]);

export const drivers = pgTable("drivers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Basic info
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  
  // Driver's License (optional - can be added later)
  driversLicenseNumber: text("drivers_license_number"),
  driversLicenseIssueDate: timestamp("drivers_license_issue_date"),
  driversLicenseExpiryDate: timestamp("drivers_license_expiry_date"),
  driversLicenseClass: text("drivers_license_class"),
  
  // TDG Certification (optional - can be added later)
  tdgCertificateNumber: text("tdg_certificate_number"),
  tdgCertificateIssueDate: timestamp("tdg_certificate_issue_date"),
  tdgCertificateExpiryDate: timestamp("tdg_certificate_expiry_date"),
  
  // Lockout License/Certification (optional)
  lockoutLicenseNumber: text("lockout_license_number"),
  lockoutLicenseIssueDate: timestamp("lockout_license_issue_date"),
  lockoutLicenseExpiryDate: timestamp("lockout_license_expiry_date"),
  
  // Assigned truck
  assignedTruckId: varchar("assigned_truck_id").references(() => trucks.id, { onDelete: "set null" }),
  
  // Performance
  rating: decimal("rating", { precision: 3, scale: 2 }).default("5.00"),
  totalDeliveries: integer("total_deliveries").notNull().default(0),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const driversRelations = relations(drivers, ({ one }) => ({
  assignedTruck: one(trucks, {
    fields: [drivers.assignedTruckId],
    references: [trucks.id],
  }),
}));

export const insertDriverSchema = createInsertSchema(drivers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Driver = typeof drivers.$inferSelect;
export type InsertDriver = z.infer<typeof insertDriverSchema>;

// ============================================
// Business Finances - Weekly Close System
// ============================================

export const operatingModeEnum = pgEnum("operating_mode", ["soft_launch", "full_time"]);

export const financialAccountTypeEnum = pgEnum("financial_account_type", [
  "operating_chequing",
  "gst_holding",
  "deferred_subscription",
  "income_tax_reserve",
  "operating_buffer",
  "maintenance_reserve",
  "emergency_risk",
  "growth_capital",
  "owner_draw_holding"
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "fuel_revenue",
  "subscription_revenue",
  "delivery_fee_revenue",
  "emergency_service_revenue",
  "gst_separation",
  "ufa_payment",
  "allocation",
  "deferred_release",
  "owner_draw_transfer",
  "manual_adjustment"
]);

export const weeklyCloseStatusEnum = pgEnum("weekly_close_status", ["draft", "in_progress", "completed"]);

// Financial Accounts (The 9 Buckets)
export const financialAccounts = pgTable("financial_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountType: financialAccountTypeEnum("account_type").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  balance: decimal("balance", { precision: 12, scale: 2 }).notNull().default("0.00"),
  isHolding: boolean("is_holding").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type FinancialAccount = typeof financialAccounts.$inferSelect;

// Financial Transactions
export const financialTransactions = pgTable("financial_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  weeklyCloseId: varchar("weekly_close_id").references(() => weeklyCloses.id),
  accountId: varchar("account_id").notNull().references(() => financialAccounts.id),
  transactionType: transactionTypeEnum("transaction_type").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  referenceType: text("reference_type"),
  referenceId: varchar("reference_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FinancialTransaction = typeof financialTransactions.$inferSelect;

// Weekly Closes
export const weeklyCloses = pgTable("weekly_closes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  weekStartDate: timestamp("week_start_date").notNull(),
  weekEndDate: timestamp("week_end_date").notNull(),
  closeDate: timestamp("close_date"),
  status: weeklyCloseStatusEnum("status").notNull().default("draft"),
  
  // Fuel Reconciliation Summary
  litresPurchased: decimal("litres_purchased", { precision: 12, scale: 2 }).default("0"),
  litresBilled: decimal("litres_billed", { precision: 12, scale: 2 }).default("0"),
  shrinkageLitres: decimal("shrinkage_litres", { precision: 12, scale: 2 }).default("0"),
  shrinkagePercent: decimal("shrinkage_percent", { precision: 5, scale: 2 }).default("0"),
  
  // Revenue Summary
  fuelRevenueGross: decimal("fuel_revenue_gross", { precision: 12, scale: 2 }).default("0"),
  fuelCOGS: decimal("fuel_cogs", { precision: 12, scale: 2 }).default("0"),
  fuelMarkupRevenue: decimal("fuel_markup_revenue", { precision: 12, scale: 2 }).default("0"),
  subscriptionRevenue: decimal("subscription_revenue", { precision: 12, scale: 2 }).default("0"),
  deliveryFeeRevenue: decimal("delivery_fee_revenue", { precision: 12, scale: 2 }).default("0"),
  emergencyServiceRevenue: decimal("emergency_service_revenue", { precision: 12, scale: 2 }).default("0"),
  totalGstCollected: decimal("total_gst_collected", { precision: 12, scale: 2 }).default("0"),
  
  // Payment Summary
  ufaPaymentAmount: decimal("ufa_payment_amount", { precision: 12, scale: 2 }).default("0"),
  
  // Allocations Made
  allocationsCompleted: boolean("allocations_completed").notNull().default(false),
  ownerDrawTransferred: decimal("owner_draw_transferred", { precision: 12, scale: 2 }).default("0"),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type WeeklyClose = typeof weeklyCloses.$inferSelect;

// Fuel Reconciliation Records (detailed per-purchase tracking)
export const fuelReconciliationRecords = pgTable("fuel_reconciliation_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  weeklyCloseId: varchar("weekly_close_id").references(() => weeklyCloses.id),
  purchaseDate: timestamp("purchase_date").notNull(),
  fuelType: fuelTypeEnum("fuel_type").notNull(),
  litresPurchased: decimal("litres_purchased", { precision: 12, scale: 2 }).notNull(),
  costPerLitre: decimal("cost_per_litre", { precision: 10, scale: 4 }).notNull(),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }).notNull(),
  supplier: text("supplier").default("UFA Cardlock"),
  receiptNumber: text("receipt_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FuelReconciliationRecord = typeof fuelReconciliationRecords.$inferSelect;

// Allocation Rules (configurable percentages for each bucket)
export const allocationRules = pgTable("allocation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  revenueType: text("revenue_type").notNull(),
  accountType: financialAccountTypeEnum("account_type").notNull(),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AllocationRule = typeof allocationRules.$inferSelect;

// Business Finance Settings
export const financeSettings = pgTable("finance_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type FinanceSetting = typeof financeSettings.$inferSelect;

// ============================================
// Bookkeeping Ledger (Stripe Source of Truth)
// ============================================

export const ledgerSourceEnum = pgEnum("ledger_source", ["stripe", "manual"]);
export const ledgerSourceTypeEnum = pgEnum("ledger_source_type", [
  "invoice_payment", "charge", "refund", "payout",
  "fuel_cost", "expense", "adjustment", "owner_draw"
]);
export const ledgerCategoryEnum = pgEnum("ledger_category", [
  "subscription_payg", "subscription_access", "subscription_household", "subscription_rural",
  "subscription_emergency", "fuel_delivery", "processing_fee", "fuel_cogs",
  "expense_other", "payout_settlement", "revenue_unmapped"
]);

export const ledgerEntries = pgTable("ledger_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  
  // Dates
  eventDate: timestamp("event_date").notNull(),
  postedAt: timestamp("posted_at").notNull().defaultNow(),
  
  // Source tracking
  source: ledgerSourceEnum("source").notNull(),
  sourceType: ledgerSourceTypeEnum("source_type").notNull(),
  sourceId: varchar("source_id"),
  stripeEventId: varchar("stripe_event_id"),
  idempotencyKey: varchar("idempotency_key").unique().notNull(),
  
  // Stripe object IDs for refund lookup
  chargeId: varchar("charge_id"),
  paymentIntentId: varchar("payment_intent_id"),
  
  // Linked data
  stripeCustomerId: varchar("stripe_customer_id"),
  userId: varchar("user_id").references(() => users.id),
  orderId: varchar("order_id").references(() => orders.id),
  
  // Description
  description: text("description").notNull(),
  category: ledgerCategoryEnum("category").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("cad"),
  
  // Amounts (cents). Revenue = gross - GST (pre-tax)
  grossAmountCents: integer("gross_amount_cents").notNull().default(0),
  netAmountCents: integer("net_amount_cents").notNull().default(0),
  stripeFeeCents: integer("stripe_fee_cents").notNull().default(0),
  
  // GST tracking
  gstCollectedCents: integer("gst_collected_cents").notNull().default(0),
  gstPaidCents: integer("gst_paid_cents").notNull().default(0),
  gstNeedsReview: boolean("gst_needs_review").notNull().default(false),
  
  // Revenue breakdown (PRE-TAX: gross - gst)
  revenueSubscriptionCents: integer("revenue_subscription_cents").notNull().default(0),
  revenueFuelCents: integer("revenue_fuel_cents").notNull().default(0),
  revenueOtherCents: integer("revenue_other_cents").notNull().default(0),
  
  // Expenses (manual entries)
  cogsFuelCents: integer("cogs_fuel_cents").notNull().default(0),
  expenseOtherCents: integer("expense_other_cents").notNull().default(0),
  
  // Metadata and reversals
  metaJson: text("meta_json"),
  isReversal: boolean("is_reversal").notNull().default(false),
  reversesEntryId: varchar("reverses_entry_id").references(() => ledgerEntries.id),
});

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type InsertLedgerEntry = typeof ledgerEntries.$inferInsert;

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  postedAt: true,
});

// ============================================
// Promo Codes System
// ============================================

export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: text("description"),
  
  // Discount type: delivery_fee, percentage_fuel, flat_amount
  // NOTE: percentage_fuel is DISABLED by default in Option 4 model (requires adminOverride)
  discountType: varchar("discount_type", { length: 50 }).notNull().default("delivery_fee"),
  
  // Discount value (percentage 0-100 for percentage_fuel, dollar amount for flat_amount, ignored for delivery_fee)
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).default("0"),
  
  // Minimum order value to qualify for discount (null = no minimum)
  minimumOrderValue: decimal("minimum_order_value", { precision: 10, scale: 2 }),
  
  // Maximum discount cap for percentage-based discounts (null = no cap)
  maximumDiscountCap: decimal("maximum_discount_cap", { precision: 10, scale: 2 }),
  
  // Admin override for margin-risky promos (percentage_fuel requires this to be true)
  adminOverride: boolean("admin_override").notNull().default(false),
  
  // Whether this discount stacks with tier discounts (DEPRECATED in Option 4 - no tier discounts)
  stackable: boolean("stackable").notNull().default(true),
  
  // Tier eligibility (comma-separated: "payg,access" or "all")
  eligibleTiers: text("eligible_tiers").notNull().default("payg,access"),
  
  // Usage limits
  maxTotalUses: integer("max_total_uses"), // null = unlimited
  currentUses: integer("current_uses").notNull().default(0),
  oneTimePerUser: boolean("one_time_per_user").notNull().default(true),
  
  // Validity
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const promoRedemptions = pgTable("promo_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promoCodeId: varchar("promo_code_id").notNull().references(() => promoCodes.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  orderId: varchar("order_id").references(() => orders.id),
  
  // Discount applied
  discountAmountCents: integer("discount_amount_cents").notNull().default(0),
  tierAtRedemption: subscriptionTierEnum("tier_at_redemption"),
  
  redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
}, (table) => ({
  uniqueUserPromo: unique().on(table.userId, table.promoCodeId),
}));

export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = typeof promoCodes.$inferInsert;
export type PromoRedemption = typeof promoRedemptions.$inferSelect;
export type InsertPromoRedemption = typeof promoRedemptions.$inferInsert;

export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({
  id: true,
  createdAt: true,
  currentUses: true,
});

export const insertPromoRedemptionSchema = createInsertSchema(promoRedemptions).omit({
  id: true,
  redeemedAt: true,
});

// VIP Waitlist table
export const vipWaitlist = pgTable("vip_waitlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type VipWaitlist = typeof vipWaitlist.$inferSelect;
export type InsertVipWaitlist = typeof vipWaitlist.$inferInsert;

export const insertVipWaitlistSchema = createInsertSchema(vipWaitlist).omit({
  id: true,
  createdAt: true,
});

// ============================================
// CLOSEOUT & RECONCILIATION SYSTEM
// ============================================

// Enums for closeout system
export const shrinkClassificationEnum = pgEnum("shrink_classification", ["within_expected", "outside_expected", "hard_alert"]);
export const closeoutModeEnum = pgEnum("closeout_mode", ["weekly", "nightly"]);
export const closeoutStatusEnum = pgEnum("closeout_status", ["created", "running", "completed", "failed"]);
export const flagSeverityEnum = pgEnum("flag_severity", ["info", "warning", "critical"]);
export const exportKindEnum = pgEnum("export_kind", ["orders_csv", "ledger_csv", "gst_csv", "closeout_json"]);

// Fuel Shrinkage Rules - configurable variance thresholds per fuel type
export const fuelShrinkageRules = pgTable("fuel_shrinkage_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fuelType: fuelTypeEnum("fuel_type").notNull().unique(),
  expectedMinPercent: decimal("expected_min_percent", { precision: 5, scale: 2 }).notNull().default("0.5"),
  expectedMaxPercent: decimal("expected_max_percent", { precision: 5, scale: 2 }).notNull().default("3.0"),
  hardAlertPercent: decimal("hard_alert_percent", { precision: 5, scale: 2 }).notNull().default("8.0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type FuelShrinkageRule = typeof fuelShrinkageRules.$inferSelect;
export type InsertFuelShrinkageRule = typeof fuelShrinkageRules.$inferInsert;

// Fuel Reconciliation Periods - per-truck, per-fuel type inventory reconciliation
export const fuelReconciliationPeriods = pgTable("fuel_reconciliation_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dateStart: timestamp("date_start").notNull(),
  dateEnd: timestamp("date_end").notNull(),
  truckId: varchar("truck_id").notNull().references(() => trucks.id, { onDelete: "cascade" }),
  fuelType: fuelTypeEnum("fuel_type").notNull(),
  
  // Inventory levels
  startingLevelLitres: decimal("starting_level_litres", { precision: 10, scale: 2 }),
  endingLevelLitres: decimal("ending_level_litres", { precision: 10, scale: 2 }),
  
  // Movement totals
  fillsLitres: decimal("fills_litres", { precision: 10, scale: 2 }).notNull().default("0"),
  dispensedLitres: decimal("dispensed_litres", { precision: 10, scale: 2 }).notNull().default("0"),
  adjustmentsLitres: decimal("adjustments_litres", { precision: 10, scale: 2 }).notNull().default("0"),
  
  // Calculated values
  expectedEndingLitres: decimal("expected_ending_litres", { precision: 10, scale: 2 }),
  shrinkLitres: decimal("shrink_litres", { precision: 10, scale: 2 }),
  shrinkPercent: decimal("shrink_percent", { precision: 5, scale: 2 }),
  classification: shrinkClassificationEnum("classification").notNull(),
  
  // Link to closeout run
  closeoutRunId: varchar("closeout_run_id"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FuelReconciliationPeriod = typeof fuelReconciliationPeriods.$inferSelect;
export type InsertFuelReconciliationPeriod = typeof fuelReconciliationPeriods.$inferInsert;

// Closeout Runs - immutable record of each closeout execution
export const closeoutRuns = pgTable("closeout_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: closeoutModeEnum("mode").notNull(),
  dateStart: timestamp("date_start").notNull(),
  dateEnd: timestamp("date_end").notNull(),
  dryRun: boolean("dry_run").notNull().default(false),
  status: closeoutStatusEnum("status").notNull().default("created"),
  
  // Computed totals stored as JSON
  totalsJson: text("totals_json"), // Stores CloseoutTotals object
  
  // Reconciliation results stored as JSON
  stripeReconciliationJson: text("stripe_reconciliation_json"),
  fuelReconciliationJson: text("fuel_reconciliation_json"),
  
  // Bucket allocations made
  allocationsJson: text("allocations_json"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  completedAt: timestamp("completed_at"),
});

export type CloseoutRun = typeof closeoutRuns.$inferSelect;
export type InsertCloseoutRun = typeof closeoutRuns.$inferInsert;

// Closeout Flags - anomalies and issues detected during closeout
export const closeoutFlags = pgTable("closeout_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  closeoutRunId: varchar("closeout_run_id").notNull().references(() => closeoutRuns.id, { onDelete: "cascade" }),
  severity: flagSeverityEnum("severity").notNull(),
  code: varchar("code", { length: 100 }).notNull(), // e.g., MISSING_SNAPSHOT, STRIPE_LEDGER_MISMATCH
  message: text("message").notNull(),
  meta: text("meta"), // JSON with additional context
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CloseoutFlag = typeof closeoutFlags.$inferSelect;
export type InsertCloseoutFlag = typeof closeoutFlags.$inferInsert;

// Closeout Exports - generated export files
export const closeoutExports = pgTable("closeout_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  closeoutRunId: varchar("closeout_run_id").notNull().references(() => closeoutRuns.id, { onDelete: "cascade" }),
  kind: exportKindEnum("kind").notNull(),
  content: text("content"), // Store CSV/JSON content directly (or URL if using external storage)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CloseoutExport = typeof closeoutExports.$inferSelect;
export type InsertCloseoutExport = typeof closeoutExports.$inferInsert;

export const insertFuelShrinkageRuleSchema = createInsertSchema(fuelShrinkageRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFuelReconciliationPeriodSchema = createInsertSchema(fuelReconciliationPeriods).omit({
  id: true,
  createdAt: true,
});

export const insertCloseoutRunSchema = createInsertSchema(closeoutRuns).omit({
  id: true,
  createdAt: true,
});

export const insertCloseoutFlagSchema = createInsertSchema(closeoutFlags).omit({
  id: true,
  createdAt: true,
});

export const insertCloseoutExportSchema = createInsertSchema(closeoutExports).omit({
  id: true,
  createdAt: true,
});

// ============================================
// CLOSEOUT TYPES (for JSON fields)
// ============================================

export interface PricingSnapshot {
  gstRate: number;
  deliveryFeeBeforeGst: number;
  items: Array<{
    fuelType: "regular" | "premium" | "diesel";
    litres: number;
    baseCost: number;
    markupPercent: number;
    markupFlat: number;
    customerPrice: number;
  }>;
  createdAtSnapshot: string;
  fuelPricingUpdatedAt: string;
  notes?: string;
}

export interface CloseoutTotals {
  ordersProcessed: number;
  ordersWithMissingSnapshot: number;
  litresByFuelType: Record<string, number>;
  fuelRevenueExGst: number;
  deliveryRevenueExGst: number;
  subscriptionRevenueExGst: number;
  gstCollected: number;
  fuelCogs: number;
  stripeFees: number;
  grossMargin: number;
  netIncomeEstimate: number;
  unstableTotals: boolean;
}

export interface StripeReconciliation {
  stripeChargesTotal: number;
  stripeRefundsTotal: number;
  stripeFeesTotal: number;
  stripeNetTotal: number;
  ledgerRevenueTotal: number;
  ledgerGstTotal: number;
  ledgerRefundsTotal: number;
  ledgerFeesTotal: number;
  missingLedgerEntries: number;
  autoCreatedEntries: number;
  mismatchAmountCents: number;
  reconciled: boolean;
  toleranceCents: number;
}

export interface FuelReconciliationSummary {
  periodsByTruck: Array<{
    truckId: string;
    truckName: string;
    fuelType: string;
    startingLitres: number;
    endingLitres: number;
    fills: number;
    dispensed: number;
    adjustments: number;
    expectedEnding: number;
    shrinkLitres: number;
    shrinkPercent: number;
    classification: "within_expected" | "outside_expected" | "hard_alert";
  }>;
  totalShrinkByFuelType: Record<string, number>;
  hasAlerts: boolean;
}
