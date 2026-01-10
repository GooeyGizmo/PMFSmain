import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { insertUserSchema, insertVehicleSchema, insertOrderSchema } from "@shared/schema";
import { z } from "zod";
import { paymentService, calculateOrderPricing } from "./paymentService";
import { getStripePublishableKey } from "./stripeClient";
import { subscriptionService } from "./subscriptionService";
import { routeService } from "./routeService";
import { TIER_PRIORITY } from "@shared/schema";
import { sendOrderConfirmationEmail, sendDeliveryReceiptEmail } from "./emailService";
import { wsService } from "./websocket";

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

  // Update user profile
  app.patch("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const { name, phone, defaultAddress, defaultCity } = req.body;
      
      const updateData: { name?: string; phone?: string; defaultAddress?: string; defaultCity?: string } = {};
      if (name) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (defaultAddress !== undefined) updateData.defaultAddress = defaultAddress;
      if (defaultCity !== undefined) updateData.defaultCity = defaultCity;

      await storage.updateUserProfile(req.session.userId!, updateData);
      const user = await storage.getUser(req.session.userId!);
      
      const { password, ...publicUser } = user!;
      res.json({ user: publicUser });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
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
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const tierPriority = TIER_PRIORITY[user.subscriptionTier] || 4;
      
      const data = insertOrderSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });

      // Create the order with tier priority
      const orderData = {
        ...data,
        tierPriority,
      };

      const order = await storage.createOrder(orderData as any);
      
      // Auto-assign to route
      try {
        await routeService.assignOrderToRoute(order, user.subscriptionTier);
      } catch (routeError) {
        console.error("Route assignment error (non-blocking):", routeError);
      }

      // Send order confirmation email (non-blocking)
      sendOrderConfirmationEmail({
        id: order.id,
        userEmail: user.email,
        userName: user.name,
        scheduledDate: new Date(order.scheduledDate),
        deliveryWindow: order.deliveryWindow,
        address: order.address,
        city: order.city,
        fuelType: order.fuelType,
        fuelAmount: order.fuelAmount,
        fillToFull: order.fillToFull,
        total: order.total.toString(),
      }).catch(err => console.error("Email send error:", err));

      // Create notification for order confirmation
      try {
        const notification = await storage.createNotification({
          userId: user.id,
          type: 'order_update',
          title: 'Order Confirmed',
          message: `Your fuel delivery is scheduled for ${new Date(order.scheduledDate).toLocaleDateString()}.`,
          metadata: JSON.stringify({ orderId: order.id }),
        });
        wsService.notifyNewNotification(user.id, notification);
      } catch (notifError) {
        console.error("Notification creation error:", notifError);
      }

      // Broadcast order update via WebSocket
      wsService.notifyOrderUpdate(order);

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

      if (!["scheduled", "confirmed", "en_route", "arriving", "fueling", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const order = await storage.updateOrderStatus(id, status);
      
      // Broadcast order status update via WebSocket
      wsService.notifyOrderUpdate(order);
      
      res.json({ order });
    } catch (error) {
      console.error("Update order status error:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // Update order details (admin only)
  app.patch("/api/orders/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { scheduledDate, deliveryWindow, address, city, notes, fuelAmount, fillToFull } = req.body;

      const existingOrder = await storage.getOrder(id);
      if (!existingOrder) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Allow editing all orders during testing phase
      // if (existingOrder.status === 'completed' || existingOrder.status === 'cancelled') {
      //   return res.status(400).json({ message: "Cannot modify completed or cancelled orders" });
      // }

      const updateData: any = {};
      if (scheduledDate !== undefined) updateData.scheduledDate = new Date(scheduledDate);
      if (deliveryWindow !== undefined) updateData.deliveryWindow = deliveryWindow;
      if (address !== undefined) updateData.address = address;
      if (city !== undefined) updateData.city = city;
      if (notes !== undefined) updateData.notes = notes;
      if (fuelAmount !== undefined) updateData.fuelAmount = fuelAmount;
      if (fillToFull !== undefined) updateData.fillToFull = fillToFull;

      const order = await storage.updateOrder(id, updateData);
      
      // Create notification for customer
      const notification = await storage.createNotification({
        userId: order.userId,
        type: 'order_update',
        title: 'Order Updated',
        message: `Your order has been updated. Scheduled for ${new Date(order.scheduledDate).toLocaleDateString()}.`,
        metadata: JSON.stringify({ orderId: order.id }),
      });
      wsService.notifyNewNotification(order.userId, notification);
      
      // Broadcast order update via WebSocket
      wsService.notifyOrderUpdate(order);
      
      res.json({ order });
    } catch (error) {
      console.error("Update order error:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  // Cancel order (admin only) - handles refund if payment was pre-authorized
  app.post("/api/orders/:id/cancel", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const existingOrder = await storage.getOrder(id);
      if (!existingOrder) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Allow cancelling all orders during testing phase
      // if (existingOrder.status === 'completed') {
      //   return res.status(400).json({ message: "Cannot cancel a completed order" });
      // }

      if (existingOrder.status === 'cancelled') {
        return res.status(400).json({ message: "Order is already cancelled" });
      }

      // If payment was pre-authorized, cancel the payment intent
      if (existingOrder.stripePaymentIntentId && existingOrder.paymentStatus === 'preauthorized') {
        try {
          const { getUncachableStripeClient } = await import('./stripeClient');
          const stripe = await getUncachableStripeClient();
          await stripe.paymentIntents.cancel(existingOrder.stripePaymentIntentId);
          await storage.updateOrderPaymentInfo(id, { paymentStatus: 'cancelled' });
        } catch (stripeError) {
          console.error("Failed to cancel payment intent:", stripeError);
        }
      }

      const order = await storage.updateOrderStatus(id, 'cancelled');
      
      // Create notification for customer
      const notification = await storage.createNotification({
        userId: order.userId,
        type: 'order_update',
        title: 'Order Cancelled',
        message: reason ? `Your order has been cancelled. Reason: ${reason}` : 'Your order has been cancelled.',
        metadata: JSON.stringify({ orderId: order.id }),
      });
      wsService.notifyNewNotification(order.userId, notification);
      
      // Broadcast order update via WebSocket
      wsService.notifyOrderUpdate(order);
      
      res.json({ order, message: "Order cancelled successfully" });
    } catch (error) {
      console.error("Cancel order error:", error);
      res.status(500).json({ message: "Failed to cancel order" });
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

  // Get all orders with user info (admin only)
  app.get("/api/ops/orders/detailed", requireAuth, requireAdmin, async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      const ordersWithUsers = await Promise.all(
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
      res.json({ orders: ordersWithUsers });
    } catch (error) {
      console.error("Get detailed orders error:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // ============================================
  // Route Management Routes (admin only)
  // ============================================

  // Get all routes
  app.get("/api/ops/routes", requireAuth, requireAdmin, async (req, res) => {
    try {
      const dateParam = req.query.date as string;
      const date = dateParam ? new Date(dateParam) : undefined;
      const routesWithDetails = await routeService.getRoutesWithDetails(date);
      res.json({ routes: routesWithDetails });
    } catch (error) {
      console.error("Get routes error:", error);
      res.status(500).json({ message: "Failed to fetch routes" });
    }
  });

  // Get single route with orders
  app.get("/api/ops/routes/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const routeWithOrders = await routeService.getRouteWithOrders(id);
      res.json(routeWithOrders);
    } catch (error) {
      console.error("Get route error:", error);
      res.status(500).json({ message: "Failed to fetch route" });
    }
  });

  // Assign driver to route
  app.post("/api/ops/routes/:id/assign-driver", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { driverId } = req.body;
      
      if (!driverId) {
        return res.status(400).json({ message: "Driver ID is required" });
      }

      const route = await storage.assignDriverToRoute(id, driverId);
      
      // Also update all orders in this route to 'confirmed' status
      const orders = await storage.getOrdersByRoute(id);
      for (const order of orders) {
        if (order.status === 'scheduled') {
          const updatedOrder = await storage.updateOrderStatus(order.id, 'confirmed');
          wsService.notifyOrderUpdate(updatedOrder);
        }
      }
      
      // Broadcast route update via WebSocket
      wsService.notifyRouteUpdate(route);
      
      res.json({ route });
    } catch (error) {
      console.error("Assign driver error:", error);
      res.status(500).json({ message: "Failed to assign driver" });
    }
  });

  // Optimize route
  app.post("/api/ops/routes/:id/optimize", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const optimizedOrders = await routeService.optimizeRoute(id);
      
      // Broadcast route update via WebSocket
      const route = await storage.getRoute(id);
      if (route) wsService.notifyRouteUpdate(route);
      
      res.json({ orders: optimizedOrders });
    } catch (error) {
      console.error("Optimize route error:", error);
      res.status(500).json({ message: "Failed to optimize route" });
    }
  });

  // Update route status
  app.patch("/api/ops/routes/:id/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!["pending", "in_progress", "completed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const route = await storage.updateRoute(id, { status });
      
      // Broadcast route update via WebSocket
      wsService.notifyRouteUpdate(route);
      
      res.json({ route });
    } catch (error) {
      console.error("Update route status error:", error);
      res.status(500).json({ message: "Failed to update route status" });
    }
  });

  // Get drivers for assignment
  app.get("/api/ops/drivers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const drivers = users.filter(u => ['owner', 'admin', 'operator'].includes(u.role));
      res.json({ drivers: drivers.map(d => ({ id: d.id, name: d.name, role: d.role })) });
    } catch (error) {
      console.error("Get drivers error:", error);
      res.status(500).json({ message: "Failed to fetch drivers" });
    }
  });

  // Reassign all unassigned orders to routes
  app.post("/api/ops/routes/reassign-unassigned", requireAuth, requireAdmin, async (req, res) => {
    try {
      await routeService.reassignUnassignedOrders();
      const routesWithDetails = await routeService.getRoutesWithDetails();
      res.json({ routes: routesWithDetails });
    } catch (error) {
      console.error("Reassign orders error:", error);
      res.status(500).json({ message: "Failed to reassign orders" });
    }
  });

  // ============================================
  // Customer Management Routes (admin only)
  // ============================================

  // Get all customers with stats
  app.get("/api/ops/customers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      // Show all users (customers and non-admin staff can also be managed)
      const customers = allUsers;
      
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const customersWithStats = await Promise.all(
        customers.map(async (customer) => {
          const orders = await storage.getUserOrders(customer.id);
          const completedOrders = orders.filter(o => o.status === 'completed');
          const ordersThisMonth = orders.filter(o => 
            new Date(o.scheduledDate) >= startOfMonth
          ).length;
          const totalSpent = completedOrders.reduce((sum, o) => sum + parseFloat(o.total.toString()), 0);
          
          return {
            id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            subscriptionTier: customer.subscriptionTier,
            defaultAddress: customer.defaultAddress,
            defaultCity: customer.defaultCity,
            paymentBlocked: customer.paymentBlocked,
            paymentBlockedReason: customer.paymentBlockedReason,
            createdAt: customer.createdAt,
            totalOrders: orders.length,
            ordersThisMonth,
            totalSpent,
          };
        })
      );
      
      res.json({ customers: customersWithStats });
    } catch (error) {
      console.error("Get customers error:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  // Get customer details with vehicles and orders
  app.get("/api/ops/customers/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const customer = await storage.getUser(id);
      
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      
      const vehicles = await storage.getUserVehicles(id);
      const orders = await storage.getUserOrders(id);
      const recentOrders = orders.slice(0, 10);
      
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const completedOrders = orders.filter(o => o.status === 'completed');
      const ordersThisMonth = orders.filter(o => 
        new Date(o.scheduledDate) >= startOfMonth
      ).length;
      const totalSpent = completedOrders.reduce((sum, o) => sum + parseFloat(o.total.toString()), 0);
      
      res.json({
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          subscriptionTier: customer.subscriptionTier,
          defaultAddress: customer.defaultAddress,
          defaultCity: customer.defaultCity,
          paymentBlocked: customer.paymentBlocked,
          paymentBlockedReason: customer.paymentBlockedReason,
          createdAt: customer.createdAt,
          totalOrders: orders.length,
          ordersThisMonth,
          totalSpent,
        },
        vehicles: vehicles.map(v => ({
          id: v.id,
          year: v.year,
          make: v.make,
          model: v.model,
          color: v.color,
          licensePlate: v.licensePlate,
          fuelType: v.fuelType,
          tankCapacity: v.tankCapacity,
        })),
        recentOrders: recentOrders.map(o => ({
          id: o.id,
          scheduledDate: o.scheduledDate,
          status: o.status,
          fuelType: o.fuelType,
          fuelAmount: o.fuelAmount,
          total: o.total,
          address: o.address,
          city: o.city,
        })),
      });
    } catch (error) {
      console.error("Get customer details error:", error);
      res.status(500).json({ message: "Failed to fetch customer details" });
    }
  });

  // Toggle payment blocked status
  app.patch("/api/ops/customers/:id/payment-block", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { blocked, reason } = req.body;
      
      const user = await getCurrentUser(req);
      if (!user || !['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Only admins and owners can modify payment status" });
      }
      
      if (blocked) {
        await storage.blockUserPayments(id, reason || 'Blocked by admin');
      } else {
        await storage.unblockUserPayments(id);
      }
      
      const customer = await storage.getUser(id);
      res.json({ 
        success: true, 
        paymentBlocked: customer?.paymentBlocked,
        paymentBlockedReason: customer?.paymentBlockedReason,
      });
    } catch (error) {
      console.error("Toggle payment block error:", error);
      res.status(500).json({ message: "Failed to update payment status" });
    }
  });

  // ============================================
  // Notification Routes
  // ============================================

  // Get user notifications
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getUserNotifications(req.session.userId!);
      res.json({ notifications });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // Get unread notification count
  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.session.userId!);
      res.json({ count });
    } catch (error) {
      console.error("Get unread count error:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsRead(req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark all read error:", error);
      res.status(500).json({ message: "Failed to mark all as read" });
    }
  });

  // Mark single notification as read
  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.markNotificationRead(id, req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // ============================================
  // Payment Routes
  // ============================================

  // Get Stripe publishable key
  app.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Get publishable key error:", error);
      res.status(500).json({ message: "Failed to get Stripe key" });
    }
  });

  // Create payment intent for order pre-authorization
  app.post("/api/orders/:id/payment-intent", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getOrder(id);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const customerId = await paymentService.getOrCreateStripeCustomer(
        user.id,
        user.email,
        user.name
      );

      const pricePerLitre = parseFloat(order.pricePerLitre.toString());
      const deliveryFee = parseFloat(order.deliveryFee.toString());
      const tierDiscount = parseFloat(order.tierDiscount?.toString() || '0');

      const { paymentIntentId, clientSecret } = await paymentService.createPreAuthorization({
        customerId,
        orderId: order.id,
        litres: order.fuelAmount,
        pricePerLitre,
        tierDiscount,
        deliveryFee,
        description: `Fuel delivery - ${order.fuelAmount}L ${order.fuelType}`,
        fuelType: order.fuelType,
        fillToFull: order.fillToFull,
      });

      res.json({ paymentIntentId, clientSecret });
    } catch (error) {
      console.error("Create payment intent error:", error);
      res.status(500).json({ message: "Failed to create payment intent" });
    }
  });

  // Capture payment after delivery (admin only)
  app.post("/api/orders/:id/capture-payment", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { actualLitresDelivered } = req.body;
      
      if (!actualLitresDelivered || typeof actualLitresDelivered !== 'number') {
        return res.status(400).json({ message: "Actual litres delivered is required" });
      }

      const pricing = await paymentService.capturePayment(id, actualLitresDelivered);
      const order = await storage.getOrder(id);
      
      if (order) {
        const user = await storage.getUser(order.userId);
        if (user) {
          // Send delivery receipt email (non-blocking)
          sendDeliveryReceiptEmail({
            id: order.id,
            userEmail: user.email,
            userName: user.name,
            scheduledDate: new Date(order.scheduledDate),
            deliveryWindow: order.deliveryWindow,
            address: order.address,
            city: order.city,
            fuelType: order.fuelType,
            fuelAmount: order.fuelAmount,
            actualLitresDelivered: order.actualLitresDelivered || actualLitresDelivered,
            fillToFull: order.fillToFull,
            pricePerLitre: order.pricePerLitre.toString(),
            tierDiscount: order.tierDiscount?.toString() || '0',
            deliveryFee: order.deliveryFee.toString(),
            gstAmount: order.finalGstAmount?.toString() || order.gstAmount.toString(),
            total: order.finalAmount?.toString() || order.total.toString(),
          }).catch(err => console.error("Receipt email send error:", err));

          // Create notification for delivery completion
          try {
            const notification = await storage.createNotification({
              userId: user.id,
              type: 'delivery',
              title: 'Delivery Complete!',
              message: `Your ${actualLitresDelivered}L delivery has been completed. Thank you!`,
              metadata: JSON.stringify({ orderId: order.id }),
            });
            wsService.notifyNewNotification(user.id, notification);
          } catch (notifError) {
            console.error("Notification creation error:", notifError);
          }
        }
        
        // Broadcast order update via WebSocket
        wsService.notifyOrderUpdate(order);
      }
      
      res.json({ order, pricing });
    } catch (error) {
      console.error("Capture payment error:", error);
      res.status(500).json({ message: "Failed to capture payment" });
    }
  });

  // Cancel payment pre-authorization (for cancelled orders)
  app.post("/api/orders/:id/cancel-payment", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      await paymentService.cancelPreAuthorization(id);
      const order = await storage.getOrder(id);
      
      res.json({ order });
    } catch (error) {
      console.error("Cancel payment error:", error);
      res.status(500).json({ message: "Failed to cancel payment" });
    }
  });

  // ============================================
  // Subscription Routes
  // ============================================

  // Get all subscription tiers
  app.get("/api/subscription-tiers", async (req, res) => {
    try {
      const tiers = await storage.getAllSubscriptionTiers();
      res.json({ tiers });
    } catch (error) {
      console.error("Get subscription tiers error:", error);
      res.status(500).json({ message: "Failed to fetch subscription tiers" });
    }
  });

  // Create subscription for customer
  app.post("/api/subscriptions", requireAuth, async (req, res) => {
    try {
      const { tierId } = req.body;
      if (!tierId) {
        return res.status(400).json({ message: "Tier ID is required" });
      }

      const result = await subscriptionService.createSubscription(req.session.userId!, tierId);
      res.json(result);
    } catch (error) {
      console.error("Create subscription error:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  // Change subscription tier
  app.put("/api/subscriptions/tier", requireAuth, async (req, res) => {
    try {
      const { tierId } = req.body;
      if (!tierId) {
        return res.status(400).json({ message: "Tier ID is required" });
      }

      await subscriptionService.changeSubscriptionTier(req.session.userId!, tierId);
      const user = await storage.getUser(req.session.userId!);
      res.json({ user });
    } catch (error) {
      console.error("Change tier error:", error);
      res.status(500).json({ message: "Failed to change subscription tier" });
    }
  });

  // Cancel subscription
  app.delete("/api/subscriptions", requireAuth, async (req, res) => {
    try {
      await subscriptionService.cancelSubscription(req.session.userId!);
      const user = await storage.getUser(req.session.userId!);
      res.json({ user });
    } catch (error) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // Get payment methods
  app.get("/api/payment-methods", requireAuth, async (req, res) => {
    try {
      const paymentMethods = await subscriptionService.getCustomerPaymentMethods(req.session.userId!);
      const defaultPm = await subscriptionService.getCustomerDefaultPaymentMethod(req.session.userId!);
      res.json({ paymentMethods, defaultPaymentMethodId: defaultPm });
    } catch (error) {
      console.error("Get payment methods error:", error);
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  // Add payment method
  app.post("/api/payment-methods", requireAuth, async (req, res) => {
    try {
      const { paymentMethodId } = req.body;
      if (!paymentMethodId) {
        return res.status(400).json({ message: "Payment method ID is required" });
      }

      await subscriptionService.attachPaymentMethod(req.session.userId!, paymentMethodId);
      const paymentMethods = await subscriptionService.getCustomerPaymentMethods(req.session.userId!);
      const defaultPm = await subscriptionService.getCustomerDefaultPaymentMethod(req.session.userId!);
      res.json({ paymentMethods, defaultPaymentMethodId: defaultPm });
    } catch (error) {
      console.error("Add payment method error:", error);
      res.status(500).json({ message: "Failed to add payment method" });
    }
  });

  // Remove payment method
  app.delete("/api/payment-methods/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await subscriptionService.detachPaymentMethod(req.session.userId!, id);
      const paymentMethods = await subscriptionService.getCustomerPaymentMethods(req.session.userId!);
      const defaultPm = await subscriptionService.getCustomerDefaultPaymentMethod(req.session.userId!);
      res.json({ paymentMethods, defaultPaymentMethodId: defaultPm });
    } catch (error) {
      console.error("Remove payment method error:", error);
      res.status(500).json({ message: "Failed to remove payment method" });
    }
  });

  // Set default payment method
  app.put("/api/payment-methods/:id/default", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await subscriptionService.setDefaultPaymentMethod(req.session.userId!, id);
      const paymentMethods = await subscriptionService.getCustomerPaymentMethods(req.session.userId!);
      const defaultPm = await subscriptionService.getCustomerDefaultPaymentMethod(req.session.userId!);
      res.json({ paymentMethods, defaultPaymentMethodId: defaultPm });
    } catch (error) {
      console.error("Set default payment method error:", error);
      res.status(500).json({ message: "Failed to set default payment method" });
    }
  });

  // Create setup intent for adding new payment method
  app.post("/api/setup-intent", requireAuth, async (req, res) => {
    try {
      const result = await subscriptionService.createSetupIntent(req.session.userId!);
      res.json(result);
    } catch (error) {
      console.error("Create setup intent error:", error);
      res.status(500).json({ message: "Failed to create setup intent" });
    }
  });

  // Validate booking rules before order creation
  app.post("/api/validate-booking", requireAuth, async (req, res) => {
    try {
      const { vehicleCount, litres } = req.body;
      const result = await paymentService.validateBookingRules(
        req.session.userId!,
        vehicleCount || 1,
        litres || 0
      );
      res.json(result);
    } catch (error) {
      console.error("Validate booking error:", error);
      res.status(500).json({ message: "Failed to validate booking" });
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

  // Get fuel price history for trend graph
  app.get("/api/fuel-pricing/history", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const history = await storage.getFuelPriceHistory(days);
      res.json({ history });
    } catch (error) {
      console.error("Get fuel price history error:", error);
      res.status(500).json({ message: "Failed to fetch fuel price history" });
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

      // Record price history
      await storage.recordFuelPriceHistory(fuelType, customerPrice);

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
        
        // Record price history
        await storage.recordFuelPriceHistory(fuelType, customerPrice);
      }

      res.json({ pricing: results });
    } catch (error) {
      console.error("Batch update fuel pricing error:", error);
      res.status(500).json({ message: "Failed to update fuel pricing" });
    }
  });

  return httpServer;
}
