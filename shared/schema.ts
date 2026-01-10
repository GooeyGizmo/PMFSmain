import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["user", "operator", "admin", "owner"]);
export const subscriptionTierEnum = pgEnum("subscription_tier", ["payg", "access", "household", "rural"]);
export const fuelTypeEnum = pgEnum("fuel_type", ["regular", "premium", "diesel"]);
export const orderStatusEnum = pgEnum("order_status", ["scheduled", "confirmed", "en_route", "fueling", "completed", "cancelled"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("user"),
  subscriptionTier: subscriptionTierEnum("subscription_tier").notNull().default("payg"),
  defaultAddress: text("default_address"),
  defaultCity: text("default_city"),
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
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  
  // Status
  status: orderStatusEnum("status").notNull().default("scheduled"),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [orders.vehicleId],
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
  fuelAmount: z.number().min(50),
}).omit({
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
