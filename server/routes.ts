import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { insertUserSchema, insertVehicleSchema, insertOrderSchema } from "@shared/schema";
import { z } from "zod";

const PgStore = connectPg(session);

// Session user interface
declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

// Helper to get current user
async function getCurrentUser(req: Request) {
  if (!req.session.userId) {
    return null;
  }
  return await storage.getUser(req.session.userId);
}

// Middleware to require authentication
function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

// Middleware to require admin role
async function requireAdmin(req: Request, res: Response, next: Function) {
  const user = await getCurrentUser(req);
  if (!user || !['admin', 'owner', 'operator'].includes(user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session middleware
  app.use(
    session({
      store: new PgStore({
        pool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "prairie-mobile-fuel-secret-key-change-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    })
  );

  // ============================================
  // Authentication Routes
  // ============================================

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const { password, ...publicUser } = user;
    res.json({ user: publicUser });
  });

  // Register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      
      // Check if user exists
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Check if this is the owner email
      const OWNER_EMAIL = "levi.ernst@prairiemobilefuel.ca";
      const isOwner = data.email.toLowerCase() === OWNER_EMAIL.toLowerCase();

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // Create user
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
        role: isOwner ? "owner" : "user",
      });

      // Set session
      req.session.userId = user.id;

      const { password, ...publicUser } = user;
      res.json({ user: publicUser });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;

      const { password: _, ...publicUser } = user;
      res.json({ user: publicUser });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  // Reset password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, currentPassword, newPassword } = req.body;

      if (!email || !currentPassword || !newPassword) {
        return res.status(400).json({ message: "All fields required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(user.id, hashedPassword);

      res.json({ success: true });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Password reset failed" });
    }
  });

  // ============================================
  // User/Profile Routes
  // ============================================

  // Update subscription
  app.patch("/api/user/subscription", requireAuth, async (req, res) => {
    try {
      const { tier } = req.body;
      
      if (!["payg", "access", "household", "rural"].includes(tier)) {
        return res.status(400).json({ message: "Invalid subscription tier" });
      }

      await storage.updateUserSubscription(req.session.userId!, tier);
      const user = await storage.getUser(req.session.userId!);
      
      const { password, ...publicUser } = user!;
      res.json({ user: publicUser });
    } catch (error) {
      console.error("Subscription update error:", error);
      res.status(500).json({ message: "Failed to update subscription" });
    }
  });

  // Update default address
  app.patch("/api/user/default-address", requireAuth, async (req, res) => {
    try {
      const { address, city } = req.body;
      
      if (!address || !city) {
        return res.status(400).json({ message: "Address and city are required" });
      }

      await storage.updateUserDefaultAddress(req.session.userId!, address, city);
      const user = await storage.getUser(req.session.userId!);
      
      const { password, ...publicUser } = user!;
      res.json({ user: publicUser });
    } catch (error) {
      console.error("Default address update error:", error);
      res.status(500).json({ message: "Failed to update default address" });
    }
  });

  // ============================================
  // Vehicle Routes
  // ============================================

  // Get user vehicles
  app.get("/api/vehicles", requireAuth, async (req, res) => {
    try {
      const vehicles = await storage.getUserVehicles(req.session.userId!);
      res.json({ vehicles });
    } catch (error) {
      console.error("Get vehicles error:", error);
      res.status(500).json({ message: "Failed to fetch vehicles" });
    }
  });

  // Create vehicle
  app.post("/api/vehicles", requireAuth, async (req, res) => {
    try {
      const data = insertVehicleSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });

      const vehicle = await storage.createVehicle(data);
      res.json({ vehicle });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Create vehicle error:", error);
      res.status(500).json({ message: "Failed to create vehicle" });
    }
  });

  // Update vehicle
  app.patch("/api/vehicles/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify ownership
      const existing = await storage.getVehicle(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      const vehicle = await storage.updateVehicle(id, req.body);
      res.json({ vehicle });
    } catch (error) {
      console.error("Update vehicle error:", error);
      res.status(500).json({ message: "Failed to update vehicle" });
    }
  });

  // Delete vehicle
  app.delete("/api/vehicles/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify ownership
      const existing = await storage.getVehicle(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      await storage.deleteVehicle(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete vehicle error:", error);
      res.status(500).json({ message: "Failed to delete vehicle" });
    }
  });

  // ============================================
  // Order Routes
  // ============================================

  // Get user orders
  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getUserOrders(req.session.userId!);
      res.json({ orders });
    } catch (error) {
      console.error("Get orders error:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Get upcoming orders
  app.get("/api/orders/upcoming", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getUpcomingOrders(req.session.userId!);
      res.json({ orders });
    } catch (error) {
      console.error("Get upcoming orders error:", error);
      res.status(500).json({ message: "Failed to fetch upcoming orders" });
    }
  });

  // Get single order
  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getOrder(id);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify ownership or admin
      const user = await getCurrentUser(req);
      const isAdmin = user && ['admin', 'owner', 'operator'].includes(user.role);
      if (order.userId !== req.session.userId && !isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.json({ order });
    } catch (error) {
      console.error("Get order error:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  // Create order
  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const data = insertOrderSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });

      const order = await storage.createOrder(data);
      res.json({ order });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Create order error:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Update order status (admin only)
  app.patch("/api/orders/:id/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["scheduled", "confirmed", "en_route", "fueling", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const order = await storage.updateOrderStatus(id, status);
      res.json({ order });
    } catch (error) {
      console.error("Update order status error:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // ============================================
  // Operations/Admin Routes
  // ============================================

  // Get all orders (admin only)
  app.get("/api/ops/orders", requireAuth, requireAdmin, async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      res.json({ orders });
    } catch (error) {
      console.error("Get all orders error:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // ============================================
  // Fuel Pricing Routes (admin only)
  // ============================================

  // Get all fuel pricing
  app.get("/api/fuel-pricing", async (req, res) => {
    try {
      const pricing = await storage.getAllFuelPricing();
      res.json({ pricing });
    } catch (error) {
      console.error("Get fuel pricing error:", error);
      res.status(500).json({ message: "Failed to fetch fuel pricing" });
    }
  });

  // Update fuel pricing (admin only)
  app.put("/api/ops/fuel-pricing/:fuelType", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { fuelType } = req.params;
      const { baseCost, markupPercent, markupFlat, customerPrice } = req.body;

      if (!["regular", "premium", "diesel"].includes(fuelType)) {
        return res.status(400).json({ message: "Invalid fuel type" });
      }

      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const pricing = await storage.upsertFuelPricing(
        fuelType,
        { baseCost, markupPercent, markupFlat, customerPrice },
        user.id
      );

      res.json({ pricing });
    } catch (error) {
      console.error("Update fuel pricing error:", error);
      res.status(500).json({ message: "Failed to update fuel pricing" });
    }
  });

  // Batch update all fuel pricing (admin only)
  app.put("/api/ops/fuel-pricing", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pricing } = req.body;
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const results = [];
      for (const item of pricing) {
        const { fuelType, baseCost, markupPercent, markupFlat, customerPrice } = item;
        const result = await storage.upsertFuelPricing(
          fuelType,
          { baseCost, markupPercent, markupFlat, customerPrice },
          user.id
        );
        results.push(result);
      }

      res.json({ pricing: results });
    } catch (error) {
      console.error("Batch update fuel pricing error:", error);
      res.status(500).json({ message: "Failed to update fuel pricing" });
    }
  });

  return httpServer;
}
