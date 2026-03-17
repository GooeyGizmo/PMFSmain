import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, pgEnum, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["user", "operator", "admin", "owner"]);
export const subscriptionTierEnum = pgEnum("subscription_tier", ["payg", "access", "heroes", "household", "rural", "vip"]);
export const bookingTypeEnum = pgEnum("booking_type", ["standard_window", "vip_exclusive"]);
export const householdUsageFlagEnum = pgEnum("household_usage_flag", ["normal", "over_usage", "excessive_usage"]);
export const fuelTypeEnum = pgEnum("fuel_type", ["regular", "premium", "diesel"]);
export const orderStatusEnum = pgEnum("order_status", ["scheduled", "confirmed", "en_route", "arriving", "fueling", "completed", "cancelled", "failed_delivery"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "preauthorized", "captured", "failed", "refunded", "cancelled"]);
export const routeStatusEnum = pgEnum("route_status", ["pending", "in_progress", "completed"]);
export const serviceTypeEnum = pgEnum("service_type", ["emergency_fuel", "lockout", "boost"]);
export const serviceRequestStatusEnum = pgEnum("service_request_status", ["pending", "dispatched", "en_route", "on_site", "completed", "cancelled"]);
export const equipmentTypeEnum = pgEnum("equipment_type", ["vehicle", "boat", "rv", "quads_toys", "generator", "tractor", "excavator", "skid_steer", "pump", "heater", "compressor", "pressure_washer", "lawn_equipment", "other"]);
export const bodyStyleEnum = pgEnum("body_style", ["car", "truck", "suv", "van", "sedan"]);

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
  paymentFailedAt: timestamp("payment_failed_at"),
  pendingDowngradeTier: text("pending_downgrade_tier"),
  hasEmergencyAccess: boolean("has_emergency_access").notNull().default(false),
  emergencyAccessStripeSubId: text("emergency_access_stripe_sub_id"),
  emergencyCreditsRemaining: integer("emergency_credits_remaining").notNull().default(0),
  emergencyCreditYearStart: timestamp("emergency_credit_year_start"),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: text("verification_token"),
  verificationTokenExpires: timestamp("verification_token_expires"),
  activationToken: text("activation_token"),
  activationTokenExpires: timestamp("activation_token_expires"),
  // Household usage tracking (admin-only soft caps)
  householdUsageFlag: householdUsageFlagEnum("household_usage_flag").default("normal"),
  // Heroes tier verification for Service Members & Seniors
  heroesVerified: boolean("heroes_verified").notNull().default(false),
  heroesVerificationStatus: text("heroes_verification_status").default("none"), // "none", "pending", "approved", "denied"
  heroesGroup: text("heroes_group"), // "military", "responder", "senior"
  heroesDocUrl: text("heroes_doc_url"),
  heroesVerifiedAt: timestamp("heroes_verified_at"),
  heroesVerificationNote: text("heroes_verification_note"),
  passwordResetToken: text("password_reset_token"),
  passwordResetTokenExpires: timestamp("password_reset_token_expires"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
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
  deliveryNotes: text("delivery_notes"),
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
  bodyStyle: bodyStyleEnum("body_style"),
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
  
  // New capacity management fields (90-min windows + tier inventory)
  windowStart: timestamp("window_start"), // Exact window start time
  windowEnd: timestamp("window_end"), // Exact window end time
  blocksConsumed: integer("blocks_consumed").notNull().default(1), // STANDARD=1, VIP=2
  tierAtBooking: text("tier_at_booking"), // User's tier when order was placed
  inventoryConsumedFromTier: text("inventory_consumed_from_tier"), // Which tier's reservation was consumed (for overflow tracking)
  
  // Displacement fields for VIP priority
  needsRebooking: boolean("needs_rebooking").notNull().default(false),
  displacedByOrderId: varchar("displaced_by_order_id"),
  
  // Pricing snapshot - locked at delivery time for historical accuracy
  pricingSnapshotJson: text("pricing_snapshot_json"), // JSONB stored as text for Drizzle compatibility
  snapshotLockedAt: timestamp("snapshot_locked_at"),
  snapshotLockedBy: varchar("snapshot_locked_by").references(() => users.id),
  
  // Delivery timestamp - set when status becomes "delivered"
  deliveredAt: timestamp("delivered_at"),
  
  // Failed delivery tracking
  failedReason: text("failed_reason"),
  failedAt: timestamp("failed_at"),
  rescheduledFromId: varchar("rescheduled_from_id"),
  rescheduledToId: varchar("rescheduled_to_id"),
  
  // Proof of delivery
  proofOfDeliveryUrl: text("proof_of_delivery_url"),
  
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
  category: text("category").notNull().default("customer"),
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
  
  // Legacy general toggles (kept for backward compatibility)
  orderUpdates: boolean("order_updates").notNull().default(true),
  promotionalOffers: boolean("promotional_offers").notNull().default(true),
  deliveryReminders: boolean("delivery_reminders").notNull().default(true),
  paymentAlerts: boolean("payment_alerts").notNull().default(true),
  
  // Granular order status notifications - EMAIL (NOT for Fueling)
  emailConfirmed: boolean("email_confirmed").notNull().default(true),
  emailEnRoute: boolean("email_en_route").notNull().default(true),
  emailArriving: boolean("email_arriving").notNull().default(true),
  emailCompleted: boolean("email_completed").notNull().default(true),
  
  // Granular order status notifications - SMS/RCS (including Fueling)
  smsConfirmed: boolean("sms_confirmed").notNull().default(true),
  smsEnRoute: boolean("sms_en_route").notNull().default(true),
  smsArriving: boolean("sms_arriving").notNull().default(true),
  smsFueling: boolean("sms_fueling").notNull().default(true),
  smsCompleted: boolean("sms_completed").notNull().default(true),
  
  // Granular order status notifications - PUSH (all stages)
  pushConfirmed: boolean("push_confirmed").notNull().default(true),
  pushEnRoute: boolean("push_en_route").notNull().default(true),
  pushArriving: boolean("push_arriving").notNull().default(true),
  pushFueling: boolean("push_fueling").notNull().default(true),
  pushCompleted: boolean("push_completed").notNull().default(true),
  
  // Granular order status notifications - IN-APP (all stages, always-on system notifications)
  // Note: In-app notifications are always sent for critical system events regardless of these settings
  inAppConfirmed: boolean("in_app_confirmed").notNull().default(true),
  inAppEnRoute: boolean("in_app_en_route").notNull().default(true),
  inAppArriving: boolean("in_app_arriving").notNull().default(true),
  inAppFueling: boolean("in_app_fueling").notNull().default(true),
  inAppCompleted: boolean("in_app_completed").notNull().default(true),
  
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
  
  // Route replay data
  plannedStopOrder: text("planned_stop_order"),
  actualGpsTrace: text("actual_gps_trace"),
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  
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
  equipmentType: z.enum(["vehicle", "boat", "rv", "quads_toys", "generator", "tractor", "excavator", "skid_steer", "pump", "heater", "compressor", "pressure_washer", "lawn_equipment", "other"]).default("vehicle"),
  bodyStyle: z.enum(["car", "truck", "suv", "van", "sedan"]).optional().nullable(),
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
  windowStart: z.union([z.string(), z.date(), z.null()]).optional().transform((val) => 
    val === null || val === undefined ? null : typeof val === 'string' ? new Date(val) : val
  ),
  windowEnd: z.union([z.string(), z.date(), z.null()]).optional().transform((val) => 
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

export const fuelInventoryTransactionTypeEnum = pgEnum("fuel_inventory_transaction_type", ["purchase", "delivery", "adjustment", "spill", "internal_transfer", "road_fuel"]);

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
export const truckFuelTransactionTypeEnum = pgEnum("truck_fuel_transaction_type", ["fill", "dispense", "adjustment", "ops_empty", "recirculation", "internal_transfer", "calibration", "spillage", "road_fuel"]);

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
  
  // Transfer/internal movement fields
  sourceTruckId: varchar("source_truck_id").references(() => trucks.id),
  destinationTruckId: varchar("destination_truck_id").references(() => trucks.id),
  linkedTransactionId: varchar("linked_transaction_id"), // pairs debit/credit for transfers
  
  // Reason and emergency tracking
  reason: text("reason"), // why this transaction happened
  emergencyFlag: boolean("emergency_flag").default(false),
  
  // Supplier and cost tracking (for fill transactions from UFA etc.)
  supplierName: text("supplier_name"),
  supplierInvoice: text("supplier_invoice"),
  costPerLitre: decimal("cost_per_litre", { precision: 10, scale: 4 }),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }),
  
  // Link to global fuel inventory
  fuelInventoryTransactionId: varchar("fuel_inventory_transaction_id"),
  
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

// Capacity Management Enums
export const inventoryTierEnum = pgEnum("inventory_tier", ["payg", "access", "household", "rural"]);
export const slotTypeEnum = pgEnum("slot_type", ["standard", "vip"]);
export const bookingEventTypeEnum = pgEnum("booking_event_type", ["created", "confirmed", "rescheduled", "cancelled", "completed"]);

// ============================================
// Capacity Management Tables
// ============================================

// Booking Day Configuration - daily capacity settings
export const bookingDayConfig = pgTable("booking_day_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull().unique(), // YYYY-MM-DD stored as timestamp
  modeOverride: operatingModeEnum("mode_override"), // nullable - uses global if null
  maxBlocks: integer("max_blocks").notNull().default(6),
  vipMaxCount: integer("vip_max_count").notNull().default(1),
  // Standard reservations by tier (JSON: { rural: 2, household: 4, access: 2, payg: 1 })
  standardReservations: text("standard_reservations").notNull().default('{"rural":2,"household":4,"access":2,"payg":1}'),
  isClosed: boolean("is_closed").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBookingDayConfigSchema = createInsertSchema(bookingDayConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type BookingDayConfig = typeof bookingDayConfig.$inferSelect;
export type InsertBookingDayConfig = z.infer<typeof insertBookingDayConfigSchema>;

// Booking Slots - track per-slot availability
export const bookingSlots = pgTable("booking_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
  slotType: slotTypeEnum("slot_type").notNull().default("standard"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  capacity: integer("capacity").notNull().default(2), // 2 for standard, 1 for VIP
  reservedCount: integer("reserved_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBookingSlotSchema = createInsertSchema(bookingSlots).omit({ id: true, createdAt: true });
export type BookingSlot = typeof bookingSlots.$inferSelect;
export type InsertBookingSlot = z.infer<typeof insertBookingSlotSchema>;

// Booking Events - audit trail for order lifecycle
export const bookingEvents = pgTable("booking_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  eventType: bookingEventTypeEnum("event_type").notNull(),
  details: text("details"), // JSON details
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const insertBookingEventSchema = createInsertSchema(bookingEvents).omit({ id: true, createdAt: true });
export type BookingEvent = typeof bookingEvents.$inferSelect;
export type InsertBookingEvent = z.infer<typeof insertBookingEventSchema>;

// Standard 90-minute window definitions (times in HH:MM format)
// Business hours: 7:00 AM - 5:30 PM = 7 windows of 90 minutes each
export const STANDARD_WINDOW_STARTS = ["07:00", "08:30", "10:00", "11:30", "13:00", "14:30", "16:00"] as const;
export const STANDARD_WINDOW_DURATION_MINUTES = 90;

// VIP hourly start times (07:00 to 16:00, last slot ends at 17:00 + 30min buffer = 17:30)
export const VIP_HOUR_STARTS = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"] as const;
export const VIP_BOOKING_DURATION_MINUTES = 60;
export const VIP_BUFFER_MINUTES = 30;

// Tier priority order (highest to lowest): VIP > Rural > Household > Access > PAYG
export const TIER_OVERFLOW_ORDER = ["vip", "rural", "household", "access", "payg"] as const;

// Default capacity configurations
export const DEFAULT_LAUNCH_CONFIG = {
  maxBlocks: 14,
  vipMaxCount: 1,
  standardReservations: { rural: 3, household: 25, heroes: 5, access: 15, payg: 7 },
  allowedDays: [0, 1, 2], // Sun, Mon, Tue
} as const;

export const DEFAULT_FULLTIME_CONFIG = {
  maxBlocks: 14,
  vipMaxCount: 1,
  standardReservations: { rural: 3, household: 25, heroes: 5, access: 15, payg: 7 },
  allowedDays: [1, 2, 3, 4, 5, 6], // Mon-Sat (Sun is VIP/Admin only)
} as const;

// Blocks consumed per booking type
export const BLOCKS_CONSUMED = {
  standard: 1,
  vip: 2,
} as const;

// Type for standard reservations JSON
export interface StandardReservations {
  rural: number;
  household: number;
  heroes: number;
  access: number;
  payg: number;
}

export const financialAccountTypeEnum = pgEnum("financial_account_type", [
  "operating_chequing",
  "gst_holding",
  "fuel_cogs_payable",
  "deferred_subscription",
  "income_tax_reserve",
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

export const ledgerEntries: any = pgTable("ledger_entries", {
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
  
  // 8-Bucket Allocation Fields (cents) - Single Source of Truth
  // These fields store exactly how this transaction is allocated to each bucket
  allocOperatingCents: integer("alloc_operating_cents").notNull().default(0),
  allocGstHoldingCents: integer("alloc_gst_holding_cents").notNull().default(0),
  allocDeferredSubCents: integer("alloc_deferred_sub_cents").notNull().default(0),
  allocIncomeTaxCents: integer("alloc_income_tax_cents").notNull().default(0),
  allocMaintenanceCents: integer("alloc_maintenance_cents").notNull().default(0),
  allocEmergencyRiskCents: integer("alloc_emergency_risk_cents").notNull().default(0),
  allocGrowthCapitalCents: integer("alloc_growth_capital_cents").notNull().default(0),
  allocOwnerDrawCents: integer("alloc_owner_draw_cents").notNull().default(0),
  
  // Payout tracking for automatic daily closeouts
  stripePayoutId: varchar("stripe_payout_id"),
  payoutIncludedAt: timestamp("payout_included_at"),
  
  // Metadata and reversals
  metaJson: text("meta_json"),
  isReversal: boolean("is_reversal").notNull().default(false),
  reversesEntryId: varchar("reverses_entry_id").references(() => ledgerEntries.id),
  
  // Receipt attachment (required for manual entries)
  receiptUrl: text("receipt_url"),
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
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type VipWaitlist = typeof vipWaitlist.$inferSelect;
export type InsertVipWaitlist = typeof vipWaitlist.$inferInsert;

export const insertVipWaitlistSchema = createInsertSchema(vipWaitlist).omit({
  id: true,
  createdAt: true,
});

// ============================================
// PARTS INVENTORY MANAGEMENT
// ============================================

export const currencyEnum = pgEnum("currency", ["CAD", "USD"]);
export const partsCategoryEnum = pgEnum("parts_category", ["operations", "safety_compliance", "certification"]);

export const parts = pgTable("parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: partsCategoryEnum("category").notNull().default("operations"),
  supplier: text("supplier").notNull(),
  itemModel: text("item_model").notNull(),
  quantity: integer("quantity").notNull().default(0),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
  currency: currencyEnum("currency").notNull().default("CAD"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Part = typeof parts.$inferSelect;
export type InsertPart = typeof parts.$inferInsert;

export const insertPartSchema = createInsertSchema(parts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
    internalTransfers: number;
    spillageLitres: number;
    roadFuelLitres: number;
    expectedEnding: number;
    shrinkLitres: number;
    shrinkPercent: number;
    classification: "within_expected" | "outside_expected" | "hard_alert";
  }>;
  totalShrinkByFuelType: Record<string, number>;
  hasAlerts: boolean;
}

// ============================================
// CRA Compliance & Financial Documentation
// ============================================

// Invoice status enum
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "issued", "paid", "void", "overdue"]);

// CRA T2125 Expense Categories
export const expenseCategoryEnum = pgEnum("expense_category", [
  "advertising", "business_tax", "delivery_freight", "fuel_oil", 
  "insurance", "interest_bank", "maintenance_repairs", "management_admin",
  "meals_entertainment", "motor_vehicle", "office_supplies", "legal_accounting",
  "rent", "salaries_wages", "travel", "telephone_utilities", "other"
]);

// CCA Asset Classes
export const ccaClassEnum = pgEnum("cca_class", [
  "class_1", "class_8", "class_10", "class_10_1", "class_12", 
  "class_43", "class_50", "class_54"
]);

// Vehicle log trip purpose
export const tripPurposeEnum = pgEnum("trip_purpose", ["business", "personal", "mixed"]);

// Audit action types
export const auditActionEnum = pgEnum("audit_action", ["create", "update", "delete", "void", "approve", "export"]);

// ---- Invoices Table ----
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: integer("invoice_number").notNull().unique(), // Sequential CRA-compliant numbering
  
  // Business info (snapshot at time of invoice)
  businessName: text("business_name").notNull(),
  businessAddress: text("business_address").notNull(),
  businessCity: text("business_city").notNull(),
  businessPhone: text("business_phone"),
  gstRegistrationNumber: text("gst_registration_number").notNull(),
  
  // Customer info
  customerId: varchar("customer_id").references(() => users.id),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerAddress: text("customer_address"),
  customerCity: text("customer_city"),
  
  // Order reference
  orderId: varchar("order_id").references(() => orders.id),
  
  // Financial totals
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  gstAmount: decimal("gst_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  
  // Line items stored as JSON array
  lineItemsJson: text("line_items_json").notNull(), // JSON: [{description, quantity, unitPrice, amount, fuelType?}]
  
  // Status and dates
  status: invoiceStatusEnum("status").notNull().default("issued"),
  invoiceDate: timestamp("invoice_date").notNull().defaultNow(),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),
  
  // Payment reference
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  
  // Notes
  notes: text("notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---- Expenses Table (ITC tracking built in) ----
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Categorization
  category: expenseCategoryEnum("category").notNull(),
  subcategory: text("subcategory"), // Free-text refinement within category
  
  // Details
  description: text("description").notNull(),
  vendor: text("vendor"),
  vendorGstNumber: text("vendor_gst_number"), // For ITC claims
  referenceNumber: text("reference_number"), // Invoice/receipt number from vendor
  
  // Financial
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Total including GST
  gstPaid: decimal("gst_paid", { precision: 10, scale: 2 }).notNull().default("0"), // GST paid (ITC eligible)
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(), // Amount minus GST
  
  // Receipt/document
  receiptUrl: text("receipt_url"), // Uploaded receipt image/PDF
  receiptFileName: text("receipt_file_name"),
  
  // Linking
  truckId: varchar("truck_id").references(() => trucks.id),
  fuelTransactionId: varchar("fuel_transaction_id"), // Link to fuel purchase if applicable
  
  // Date and period
  expenseDate: timestamp("expense_date").notNull(),
  taxYear: integer("tax_year").notNull(),
  taxQuarter: integer("tax_quarter").notNull(), // 1-4
  
  // Status
  itcClaimed: boolean("itc_claimed").notNull().default(false),
  itcClaimedDate: timestamp("itc_claimed_date"),
  
  // Audit
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---- CCA Assets (Capital Cost Allowance) ----
export const ccaAssets = pgTable("cca_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Asset identification
  name: text("name").notNull(), // e.g., "2022 Ram 3500 Fuel Truck"
  description: text("description"),
  serialNumber: text("serial_number"),
  
  // CCA classification
  ccaClass: ccaClassEnum("cca_class").notNull(),
  ccaRate: decimal("cca_rate", { precision: 5, scale: 4 }).notNull(), // e.g., 0.30 for 30%
  
  // Financial
  originalCost: decimal("original_cost", { precision: 12, scale: 2 }).notNull(),
  adjustedCostBase: decimal("adjusted_cost_base", { precision: 12, scale: 2 }).notNull(), // Minus trade-in, etc.
  accumulatedCca: decimal("accumulated_cca", { precision: 12, scale: 2 }).notNull().default("0"),
  undepreciatedCapitalCost: decimal("undepreciated_capital_cost", { precision: 12, scale: 2 }).notNull(), // UCC = ACB - accumulated CCA
  
  // Dates
  acquisitionDate: timestamp("acquisition_date").notNull(),
  disposalDate: timestamp("disposal_date"),
  disposalProceeds: decimal("disposal_proceeds", { precision: 12, scale: 2 }),
  
  // Linking
  truckId: varchar("truck_id").references(() => trucks.id), // If this is a fleet vehicle
  
  // Business use percentage (CRA requires this for vehicles)
  businessUsePercent: decimal("business_use_percent", { precision: 5, scale: 2 }).notNull().default("100"),
  
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---- CCA Annual Entries ----
export const ccaAnnualEntries = pgTable("cca_annual_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => ccaAssets.id, { onDelete: "cascade" }),
  taxYear: integer("tax_year").notNull(),
  
  openingUcc: decimal("opening_ucc", { precision: 12, scale: 2 }).notNull(),
  additions: decimal("additions", { precision: 12, scale: 2 }).notNull().default("0"),
  disposals: decimal("disposals", { precision: 12, scale: 2 }).notNull().default("0"),
  ccaClaimed: decimal("cca_claimed", { precision: 12, scale: 2 }).notNull().default("0"),
  closingUcc: decimal("closing_ucc", { precision: 12, scale: 2 }).notNull(),
  
  // Half-year rule applied?
  halfYearRuleApplied: boolean("half_year_rule_applied").notNull().default(false),
  
  // Business use adjustment
  businessUsePercent: decimal("business_use_percent", { precision: 5, scale: 2 }).notNull().default("100"),
  adjustedCca: decimal("adjusted_cca", { precision: 12, scale: 2 }).notNull().default("0"), // CCA * business use %
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("cca_annual_entries_asset_year_idx").on(table.assetId, table.taxYear),
]);

// ---- Vehicle Logbook (CRA requirement for vehicle expense claims) ----
export const vehicleLogEntries = pgTable("vehicle_log_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  truckId: varchar("truck_id").notNull().references(() => trucks.id, { onDelete: "cascade" }),
  
  // Trip details
  tripDate: timestamp("trip_date").notNull(),
  purpose: tripPurposeEnum("purpose").notNull(),
  description: text("description"), // e.g., "Fuel deliveries - Route 3"
  
  // Odometer
  startOdometer: decimal("start_odometer", { precision: 10, scale: 1 }).notNull(),
  endOdometer: decimal("end_odometer", { precision: 10, scale: 1 }).notNull(),
  totalKm: decimal("total_km", { precision: 10, scale: 1 }).notNull(),
  
  // Business vs personal split for mixed trips
  businessKm: decimal("business_km", { precision: 10, scale: 1 }),
  personalKm: decimal("personal_km", { precision: 10, scale: 1 }),
  
  // Route linking (auto-populate from delivery routes)
  routeId: varchar("route_id").references(() => routes.id),
  
  // Fuel used (estimated from truck fuel economy)
  estimatedFuelUsed: decimal("estimated_fuel_used", { precision: 10, scale: 2 }),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---- Audit Trail ----
export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // What changed
  entityType: text("entity_type").notNull(), // e.g., "invoice", "expense", "fuel_transaction", "order"
  entityId: varchar("entity_id").notNull(),
  action: auditActionEnum("action").notNull(),
  
  // Who changed it
  userId: varchar("user_id").references(() => users.id),
  userName: text("user_name"),
  
  // Change details
  changesSummary: text("changes_summary"), // Human-readable description
  previousData: text("previous_data"), // JSON snapshot of before state
  newData: text("new_data"), // JSON snapshot of after state
  
  // Metadata
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  
  // Retention
  retainUntil: timestamp("retain_until"), // 6 years from creation for CRA
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---- GST Filing Periods ----
export const gstFilingPeriods = pgTable("gst_filing_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  filingFrequency: text("filing_frequency").notNull(), // "quarterly" or "annual"
  taxYear: integer("tax_year").notNull(),
  quarter: integer("quarter"), // 1-4 for quarterly, null for annual
  
  // GST amounts
  gstCollected: decimal("gst_collected", { precision: 12, scale: 2 }).notNull().default("0"),
  itcsClaimed: decimal("itcs_claimed", { precision: 12, scale: 2 }).notNull().default("0"),
  netGstOwing: decimal("net_gst_owing", { precision: 12, scale: 2 }).notNull().default("0"),
  
  // Status
  status: text("status").notNull().default("open"), // open, calculated, filed, paid
  filedDate: timestamp("filed_date"),
  paymentDate: timestamp("payment_date"),
  paymentReference: text("payment_reference"),
  
  // CRA form reference
  gst34Reference: text("gst34_reference"), // CRA confirmation number
  
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---- Business Settings for CRA ----
export const craBusinessSettings = pgTable("cra_business_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Business identification
  businessName: text("business_name").notNull().default("Prairie Mobile Fuel Services"),
  businessLegalName: text("business_legal_name"),
  businessNumber: text("business_number"), // CRA Business Number (BN)
  gstRegistrationNumber: text("gst_registration_number"), // GST/HST Registration Number (RT)
  
  // Business address
  businessAddress: text("business_address"),
  businessCity: text("business_city"),
  businessProvince: text("business_province").default("AB"),
  businessPostalCode: text("business_postal_code"),
  
  // Contact
  businessPhone: text("business_phone"),
  businessEmail: text("business_email"),
  
  // Tax settings
  gstFilingFrequency: text("gst_filing_frequency").notNull().default("quarterly"), // quarterly, annual
  fiscalYearEnd: text("fiscal_year_end").notNull().default("12-31"), // MM-DD
  incomeTaxRate: decimal("income_tax_rate", { precision: 5, scale: 4 }).notNull().default("0.25"),
  
  // Invoice settings
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1001),
  invoicePrefix: text("invoice_prefix").default("PMFS"),
  invoiceTerms: text("invoice_terms").default("Due upon delivery"),
  invoiceNotes: text("invoice_notes"),
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================
// Insert Schemas & Types for CRA Tables
// ============================================

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCcaAssetSchema = createInsertSchema(ccaAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCcaAnnualEntrySchema = createInsertSchema(ccaAnnualEntries).omit({
  id: true,
  createdAt: true,
});

export const insertVehicleLogEntrySchema = createInsertSchema(vehicleLogEntries).omit({
  id: true,
  createdAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  createdAt: true,
});

export const insertGstFilingPeriodSchema = createInsertSchema(gstFilingPeriods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCraBusinessSettingsSchema = createInsertSchema(craBusinessSettings).omit({
  id: true,
  updatedAt: true,
});

// Types
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type CcaAsset = typeof ccaAssets.$inferSelect;
export type InsertCcaAsset = z.infer<typeof insertCcaAssetSchema>;
export type CcaAnnualEntry = typeof ccaAnnualEntries.$inferSelect;
export type InsertCcaAnnualEntry = z.infer<typeof insertCcaAnnualEntrySchema>;
export type VehicleLogEntry = typeof vehicleLogEntries.$inferSelect;
export type InsertVehicleLogEntry = z.infer<typeof insertVehicleLogEntrySchema>;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = z.infer<typeof insertAuditLogSchema>;
export type GstFilingPeriod = typeof gstFilingPeriods.$inferSelect;
export type InsertGstFilingPeriod = z.infer<typeof insertGstFilingPeriodSchema>;
export type CraBusinessSettings = typeof craBusinessSettings.$inferSelect;
export type InsertCraBusinessSettings = z.infer<typeof insertCraBusinessSettingsSchema>;

// Invoice line item type (for JSON field)
export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  fuelType?: "regular" | "premium" | "diesel";
  litres?: number;
}

export function getNotificationCategory(type: string): string {
  if (['system', 'payment_failed', 'subscription_cancelled', 'revenue', 'weekly_close', 'reconciliation', 'gst_filing', 'tax', 'business'].includes(type)) return 'owner';
  if (['route_assigned', 'route_completed', 'fuel_inventory', 'fleet', 'dispatch', 'inspection'].includes(type)) return 'operations';
  if (['delivery', 'delivery_assigned', 'delivery_started', 'delivery_completed', 'truck_assigned'].includes(type)) return 'driver';
  return 'customer';
}

// =============================================================================
// WAITLIST
// =============================================================================

export const waitlistEntries = pgTable("waitlist_entries", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code").notNull(),
  preferredTier: text("preferred_tier"),
  referralSource: text("referral_source"),
  referralDetail: text("referral_detail"),
  estimatedMonthlyUsage: text("estimated_monthly_usage"),
  vehicleCount: integer("vehicle_count"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  priorityScore: integer("priority_score").notNull().default(0),
  invitedAt: timestamp("invited_at"),
  convertedAt: timestamp("converted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const waitlistVehicles = pgTable("waitlist_vehicles", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entryId: varchar("entry_id").notNull().references(() => waitlistEntries.id, { onDelete: 'cascade' }),
  year: text("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  fuelType: text("fuel_type").notNull(),
});

export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries).omit({ id: true, createdAt: true });
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistEntrySchema>;

export const insertWaitlistVehicleSchema = createInsertSchema(waitlistVehicles).omit({ id: true });
export type WaitlistVehicle = typeof waitlistVehicles.$inferSelect;
export type InsertWaitlistVehicle = z.infer<typeof insertWaitlistVehicleSchema>;

// =============================================================================
// COMPANY EMAIL CONFIGURATION
// =============================================================================
// Centralized email addresses for all company communications
// Use these constants instead of hardcoding email addresses

export const COMPANY_EMAILS = {
  // General public inquiries, privacy requests, public-facing contact
  INFO: "info@prairiemobilefuel.ca",
  
  // Order issues, service issues, customer service, delivery notifications
  SUPPORT: "support@prairiemobilefuel.ca",
  
  // All billing, Stripe, subscription, payment-related communications
  BILLING: "billing@prairiemobilefuel.ca",
  
  // Owner/admin personal email for internal use
  OWNER: "levi.ernst@prairiemobilefuel.ca",
  
  // Domain for internal account detection
  INTERNAL_DOMAIN: "@prairiemobilefuel.ca",
} as const;

export type CompanyEmailType = keyof typeof COMPANY_EMAILS;

