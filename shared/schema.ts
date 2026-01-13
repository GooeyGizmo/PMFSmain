import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["user", "operator", "admin", "owner"]);
export const subscriptionTierEnum = pgEnum("subscription_tier", ["payg", "access", "household", "rural"]);
export const fuelTypeEnum = pgEnum("fuel_type", ["regular", "premium", "diesel"]);
export const orderStatusEnum = pgEnum("order_status", ["scheduled", "confirmed", "en_route", "arriving", "fueling", "completed", "cancelled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "preauthorized", "captured", "failed", "refunded", "cancelled"]);
export const routeStatusEnum = pgEnum("route_status", ["pending", "in_progress", "completed"]);
export const serviceTypeEnum = pgEnum("service_type", ["emergency_fuel", "lockout", "boost"]);
export const serviceRequestStatusEnum = pgEnum("service_request_status", ["pending", "dispatched", "en_route", "on_site", "completed", "cancelled"]);

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  vehicles: many(vehicles),
  orders: many(orders),
}));

// Vehicles table
export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  year: text("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  color: text("color").notNull(),
  licensePlate: text("license_plate").notNull(),
  fuelType: fuelTypeEnum("fuel_type").notNull(),
  tankCapacity: integer("tank_capacity").notNull(),
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
  fuelAmount: integer("fuel_amount").notNull(),
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
  fuelAmount: integer("fuel_amount").notNull(),
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

// Fuel Price History table - for tracking historical prices
export const fuelPriceHistory = pgTable("fuel_price_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fuelType: fuelTypeEnum("fuel_type").notNull(),
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
  year: z.string().min(4).max(4),
  make: z.string().min(1),
  model: z.string().min(1),
  color: z.string().min(1),
  licensePlate: z.string().min(1),
  tankCapacity: z.number().min(1),
}).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders, {
  address: z.string().min(1),
  city: z.string().min(1),
  fuelAmount: z.number().min(1),
  scheduledDate: z.union([z.string(), z.date()]).transform((val) => 
    typeof val === 'string' ? new Date(val) : val
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
  fuelAmount: integer("fuel_amount").notNull(),
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

// Tier priority mapping (lower number = higher priority)
export const TIER_PRIORITY: Record<string, number> = {
  rural: 1,
  household: 2,
  access: 3,
  payg: 4,
};

// Max orders per route
export const MAX_ORDERS_PER_ROUTE = 20;

// GST constant
export const GST_RATE = 0.05;

// Rewards: Points per dollar spent (1 point = $1 spent)
export const POINTS_PER_DOLLAR = 1;

// ============================================
// Fleet Management & TDG Compliance
// ============================================

// Truck fuel transaction types
export const truckFuelTransactionTypeEnum = pgEnum("truck_fuel_transaction_type", ["fill", "dispense", "adjustment"]);

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

// Emergency service fees
export const EMERGENCY_FEES = {
  monthlyAddOnFee: 14.99,       // Monthly fee for Emergency Access add-on
  monthlyAddOnWithGst: 15.74,   // With 5% GST
  serviceFee: 29.99,            // Per-call emergency service fee for members
  serviceFeeWithGst: 31.49,     // With 5% GST
  annualCredits: 1,             // Free emergency calls per year with add-on
};

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
  fuelAmount: integer("fuel_amount"),
  
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
