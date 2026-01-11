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
import { geocodingService } from "./geocodingService";

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
      
      // LAUNCH LOCK: Only allow @prairiemobilefuel.ca emails to register
      const ALLOWED_DOMAIN = "@prairiemobilefuel.ca";
      const emailLower = data.email.toLowerCase();
      if (!emailLower.endsWith(ALLOWED_DOMAIN)) {
        return res.status(403).json({ 
          message: "Registration is currently closed. Please check back soon!" 
        });
      }
      
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
        // LAUNCH LOCK: Check if this is a non-allowed domain trying to login
        const ALLOWED_DOMAIN = "@prairiemobilefuel.ca";
        const emailLower = email.toLowerCase();
        if (!emailLower.endsWith(ALLOWED_DOMAIN)) {
          return res.status(403).json({ 
            message: "Login is currently restricted. Please check back soon!" 
          });
        }
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
  // Slot Availability Routes
  // ============================================

  // Get delivery slot availability for a date
  app.get("/api/slots/availability", requireAuth, async (req, res) => {
    try {
      const { date } = req.query;
      if (!date || typeof date !== 'string') {
        return res.status(400).json({ message: "Date parameter required" });
      }
      
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      const counts = await storage.getOrderCountsByDate(targetDate);
      
      // Get current time in Calgary timezone
      const nowCalgary = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
      const targetDateCalgary = new Date(targetDate.toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
      const isToday = nowCalgary.toDateString() === targetDateCalgary.toDateString();
      const currentHour = nowCalgary.getHours();
      const currentMinutes = nowCalgary.getMinutes();
      
      // Delivery windows with max bookings and start hours for past checking
      const deliveryWindows = [
        { id: '1', label: '6:00 AM - 7:30 AM', maxBookings: 2, startHour: 6, startMinute: 0 },
        { id: '2', label: '7:30 AM - 9:00 AM', maxBookings: 2, startHour: 7, startMinute: 30 },
        { id: '3', label: '9:00 AM - 10:30 AM', maxBookings: 2, startHour: 9, startMinute: 0 },
        { id: '4', label: '10:30 AM - 12:00 PM', maxBookings: 2, startHour: 10, startMinute: 30 },
        { id: '5', label: '12:00 PM - 1:30 PM', maxBookings: 2, startHour: 12, startMinute: 0 },
        { id: '6', label: '1:30 PM - 3:00 PM', maxBookings: 2, startHour: 13, startMinute: 30 },
        { id: '7', label: '3:00 PM - 4:30 PM', maxBookings: 2, startHour: 15, startMinute: 0 },
        { id: '8', label: '4:30 PM - 6:00 PM', maxBookings: 2, startHour: 16, startMinute: 30 },
        { id: '9', label: '6:00 PM - 7:30 PM', maxBookings: 2, startHour: 18, startMinute: 0 },
        { id: '10', label: '7:30 PM - 9:00 PM', maxBookings: 2, startHour: 19, startMinute: 30 },
      ];
      
      const availability = deliveryWindows.map(window => {
        const count = counts.find(c => c.deliveryWindow === window.label)?.count || 0;
        const isFull = count >= window.maxBookings;
        
        // Check if window is in the past (only for today)
        let isPast = false;
        if (isToday) {
          const windowStartMinutes = window.startHour * 60 + window.startMinute;
          const currentTotalMinutes = currentHour * 60 + currentMinutes;
          isPast = currentTotalMinutes >= windowStartMinutes;
        }
        
        return {
          id: window.id,
          label: window.label,
          maxBookings: window.maxBookings,
          currentBookings: count,
          available: !isFull && !isPast,
          spotsLeft: window.maxBookings - count,
          isFull,
          isPast,
        };
      });
      
      res.json({ availability });
    } catch (error) {
      console.error("Get slot availability error:", error);
      res.status(500).json({ message: "Failed to fetch slot availability" });
    }
  });

  // ============================================
  // Order Routes
  // ============================================

  // Get user orders with order items and vehicle details
  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const userOrders = await storage.getUserOrders(req.session.userId!);
      
      // Fetch order items and vehicles for each order
      const ordersWithItems = await Promise.all(userOrders.map(async (order) => {
        const items = await storage.getOrderItems(order.id);
        
        // Fetch vehicle details for each item
        const itemsWithVehicles = await Promise.all(items.map(async (item) => {
          const vehicle = await storage.getVehicle(item.vehicleId);
          return {
            ...item,
            vehicle: vehicle ? {
              id: vehicle.id,
              year: vehicle.year,
              make: vehicle.make,
              model: vehicle.model,
              licensePlate: vehicle.licensePlate,
            } : null,
          };
        }));
        
        return {
          ...order,
          orderItems: itemsWithVehicles,
        };
      }));
      
      res.json({ orders: ordersWithItems });
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

  // Get single order with order items
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

      // Fetch order items for multi-vehicle orders
      const orderItems = await storage.getOrderItems(id);

      res.json({ order, orderItems });
    } catch (error) {
      console.error("Get order error:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  // Cancel order (customer - can only cancel their own scheduled/confirmed orders)
  app.post("/api/orders/:id/customer-cancel", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;

      const existingOrder = await storage.getOrder(id);
      if (!existingOrder) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify the order belongs to this user
      if (existingOrder.userId !== userId) {
        return res.status(403).json({ message: "You can only cancel your own orders" });
      }

      // Only allow cancelling scheduled or confirmed orders
      if (!['scheduled', 'confirmed'].includes(existingOrder.status)) {
        return res.status(400).json({ 
          message: "Cannot cancel this order. Orders can only be cancelled before the driver is en route." 
        });
      }

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

      // Store the routeId before removing order from route
      const routeIdBeforeCancel = existingOrder.routeId;
      
      // Remove the order from its route if assigned
      if (routeIdBeforeCancel) {
        await storage.removeOrderFromRoute(id);
      }
      
      const order = await storage.updateOrderStatus(id, 'cancelled');
      
      // Re-optimize the route and update totals if order was assigned to a route
      if (routeIdBeforeCancel) {
        try {
          const remainingOrders = await storage.getOrdersByRoute(routeIdBeforeCancel);
          const activeOrders = remainingOrders.filter(o => o.status !== 'cancelled' && o.status !== 'completed');
          
          const totalLitres = activeOrders.reduce((sum, o) => sum + (o.fuelAmount || 0), 0);
          const updatedRoute = await storage.updateRoute(routeIdBeforeCancel, {
            orderCount: activeOrders.length,
            totalLitres,
          });
          
          if (activeOrders.length > 0) {
            await routeService.optimizeRoute(routeIdBeforeCancel);
          }
          
          // Broadcast route update so Routes tab refreshes
          if (updatedRoute) {
            wsService.notifyRouteUpdate(updatedRoute);
          }
        } catch (routeError) {
          console.error("Error updating route after cancellation:", routeError);
        }
      }
      
      // Create notification for customer
      const notification = await storage.createNotification({
        userId: order.userId,
        type: 'order_update',
        title: 'Order Cancelled',
        message: 'Your order has been cancelled successfully.',
        metadata: JSON.stringify({ orderId: order.id }),
      });
      wsService.notifyNewNotification(order.userId, notification);
      
      // Broadcast order update via WebSocket
      wsService.notifyOrderUpdate(order);
      
      res.json({ order, message: "Order cancelled successfully" });
    } catch (error) {
      console.error("Customer cancel order error:", error);
      res.status(500).json({ message: "Failed to cancel order" });
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

      // Geocode the address to get coordinates
      let latitude: string | null = null;
      let longitude: string | null = null;
      try {
        const coords = await geocodingService.geocodeAddress(data.address, data.city);
        if (coords) {
          latitude = coords.lat.toString();
          longitude = coords.lng.toString();
        }
      } catch (geoError) {
        console.error("Geocoding error (non-blocking):", geoError);
      }

      // Create the order with tier priority and coordinates
      const orderData = {
        ...data,
        tierPriority,
        latitude,
        longitude,
      };

      const order = await storage.createOrder(orderData as any);
      
      // Create order items if provided (for multi-vehicle orders)
      if (req.body.orderItems && Array.isArray(req.body.orderItems)) {
        try {
          const itemsData = req.body.orderItems.map((item: any) => ({
            orderId: order.id,
            vehicleId: item.vehicleId,
            fuelType: item.fuelType,
            fuelAmount: item.fuelAmount,
            fillToFull: item.fillToFull || false,
            pricePerLitre: item.pricePerLitre,
            tierDiscount: item.tierDiscount || "0",
            subtotal: item.subtotal,
          }));
          await storage.createOrderItems(itemsData);
        } catch (itemError) {
          console.error("Order items creation error:", itemError);
        }
      }
      
      // Auto-assign to route
      try {
        await routeService.assignOrderToRoute(order, user.subscriptionTier);
      } catch (routeError) {
        console.error("Route assignment error (non-blocking):", routeError);
      }

      // Note: Order confirmation email is sent after successful pre-authorization in /api/orders/:id/payment-intent

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
      const { status, actualLitresDelivered } = req.body;

      if (!["scheduled", "confirmed", "en_route", "arriving", "fueling", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      // If completing and actual litres provided, update the order first
      let order;
      if (status === 'completed' && actualLitresDelivered) {
        await storage.updateOrder(id, { actualLitresDelivered });
      }
      
      order = await storage.updateOrderStatus(id, status);
      
      // When an order is completed, automatically set the next stop to en_route
      if (status === 'completed' && order.routeId) {
        const routeOrders = await storage.getOrdersByRoute(order.routeId);
        // Sort by route position and find the next incomplete order
        const sortedOrders = routeOrders
          .filter(o => o.status !== 'completed' && o.status !== 'cancelled')
          .sort((a, b) => (a.routePosition || 99) - (b.routePosition || 99));
        
        const nextOrder = sortedOrders[0];
        if (nextOrder && nextOrder.status === 'confirmed') {
          const updatedNext = await storage.updateOrderStatus(nextOrder.id, 'en_route');
          wsService.notifyOrderUpdate(updatedNext);
        }
      }
      
      // Get user info for notifications
      const user = await storage.getUser(order.userId);
      
      // Send status-specific notifications
      if (user) {
        let notificationTitle = '';
        let notificationMessage = '';
        
        if (status === 'arriving') {
          notificationTitle = 'Fuel Delivery Arriving Soon!';
          notificationMessage = "Heads up! Your fuel delivery is almost here! Please be sure to have clear access to your vehicle and ensure your fuel door is unlocked/open. Your vehicle does not need to be unlocked, and you do not need to be present during refueling. You will be updated once fuel delivery begins, and once again when your delivery is completed! See you soon!";
        } else if (status === 'fueling') {
          notificationTitle = 'Fuel Delivery In Progress';
          notificationMessage = "Heads up! Your fuel delivery has started! You will be notified once your delivery is completed, and you will be charged for the actual amount fueled, and sent a receipt to your email on file! Please allow for 5-7 BUSINESS DAYS for any pre-authorizations to drop off of your credit card account. You will only be charged for the actual amount dispensed after delivery is completed.";
        } else if (status === 'completed') {
          notificationTitle = 'Fuel Delivery Complete!';
          notificationMessage = "Heads up! Your fuel delivery is complete! You have been charged for the actual amount fueled, and a receipt has been sent to your email on file! Please allow for 5-7 BUSINESS DAYS for any pre-authorizations to drop off of your credit card account. Thank you for your business!";
          
          // Send email receipt for completed orders
          const vehicle = order.vehicleId ? await storage.getVehicle(order.vehicleId) : null;
          const { sendDeliveryReceiptEmail } = await import('./emailService');
          sendDeliveryReceiptEmail({
            id: order.id,
            userEmail: user.email,
            userName: user.name,
            scheduledDate: new Date(order.scheduledDate),
            deliveryWindow: order.deliveryWindow,
            address: order.address,
            city: order.city,
            fuelType: vehicle?.fuelType || 'regular',
            fuelAmount: order.fuelAmount,
            actualLitresDelivered: order.actualLitresDelivered || order.fuelAmount,
            fillToFull: order.fillToFull,
            pricePerLitre: order.pricePerLitre,
            tierDiscount: order.tierDiscount,
            deliveryFee: order.deliveryFee,
            gstAmount: order.gstAmount,
            total: order.total,
          }).catch(err => console.error("Receipt email error:", err));
          
          // Award reward points (1 point per dollar spent)
          try {
            const finalAmount = parseFloat(order.finalAmount?.toString() || order.total?.toString() || '0');
            const pointsToAward = Math.floor(finalAmount);
            if (pointsToAward > 0) {
              await storage.addRewardPoints(
                user.id,
                pointsToAward,
                `Order #${order.id.slice(0, 8).toUpperCase()} completed`,
                order.id,
                finalAmount.toFixed(2)
              );
            }
          } catch (rewardErr) {
            console.error("Reward points error:", rewardErr);
          }
        }
        
        if (notificationTitle) {
          try {
            const notification = await storage.createNotification({
              userId: user.id,
              type: 'order_update',
              title: notificationTitle,
              message: notificationMessage,
              metadata: JSON.stringify({ orderId: order.id }),
            });
            wsService.notifyNewNotification(user.id, notification);
          } catch (notifError) {
            console.error("Notification creation error:", notifError);
          }
        }
      }
      
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

      // Store the routeId before removing order from route
      const routeIdBeforeCancel = existingOrder.routeId;
      
      // Remove the order from its route if assigned
      if (routeIdBeforeCancel) {
        await storage.removeOrderFromRoute(id);
      }
      
      const order = await storage.updateOrderStatus(id, 'cancelled');
      
      // Re-optimize the route and update totals if order was assigned to a route
      if (routeIdBeforeCancel) {
        try {
          // Get remaining orders in the route
          const remainingOrders = await storage.getOrdersByRoute(routeIdBeforeCancel);
          const activeOrders = remainingOrders.filter(o => o.status !== 'cancelled' && o.status !== 'completed');
          
          // Update route totals
          const totalLitres = activeOrders.reduce((sum, o) => sum + (o.fuelAmount || 0), 0);
          const updatedRoute = await storage.updateRoute(routeIdBeforeCancel, {
            orderCount: activeOrders.length,
            totalLitres,
          });
          
          // Re-optimize the route if there are still orders
          if (activeOrders.length > 0) {
            await routeService.optimizeRoute(routeIdBeforeCancel);
          }
          
          // Broadcast route update so Routes tab refreshes
          if (updatedRoute) {
            wsService.notifyRouteUpdate(updatedRoute);
          }
        } catch (routeError) {
          console.error("Error updating route after cancellation:", routeError);
        }
      }
      
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

  // Update route (driver name, etc)
  app.patch("/api/ops/routes/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { driverName, startTime, endTime } = req.body;
      
      const updates: any = {};
      if (driverName !== undefined) updates.driverName = driverName;
      if (startTime !== undefined) updates.startTime = new Date(startTime);
      if (endTime !== undefined) updates.endTime = new Date(endTime);

      const route = await storage.updateRoute(id, updates);
      
      wsService.notifyRouteUpdate(route);
      
      res.json({ route });
    } catch (error) {
      console.error("Update route error:", error);
      res.status(500).json({ message: "Failed to update route" });
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

  // Delete a route (only if 0 orders OR all orders are completed/cancelled)
  app.delete("/api/ops/routes/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const route = await storage.getRoute(id);
      if (!route) {
        return res.status(404).json({ message: "Route not found" });
      }
      
      const routeOrders = await storage.getOrdersByRoute(id);
      const activeOrders = routeOrders.filter(o => 
        o.status !== 'cancelled' && o.status !== 'completed'
      );
      
      if (activeOrders.length > 0) {
        return res.status(400).json({ 
          message: `Cannot delete route with ${activeOrders.length} active order(s). All orders must be completed or cancelled first.`
        });
      }
      
      await storage.deleteRoute(id);
      
      res.json({ message: "Route deleted successfully" });
    } catch (error) {
      console.error("Delete route error:", error);
      res.status(500).json({ message: "Failed to delete route" });
    }
  });

  // Cleanup past routes with no active orders
  // Uses Calgary timezone (America/Edmonton) for date comparisons
  app.post("/api/ops/routes/cleanup-past", requireAuth, requireAdmin, async (req, res) => {
    try {
      const allRoutes = await storage.getAllRoutes();
      
      // Get today's date in Calgary timezone
      const calgaryFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Edmonton',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const todayCalgaryStr = calgaryFormatter.format(new Date());
      const [todayYear, todayMonth, todayDay] = todayCalgaryStr.split('-').map(Number);
      
      let deletedCount = 0;
      
      for (const route of allRoutes) {
        // Convert route date to Calgary timezone for comparison
        const routeDateCalgaryStr = calgaryFormatter.format(new Date(route.routeDate));
        const [routeYear, routeMonth, routeDay] = routeDateCalgaryStr.split('-').map(Number);
        
        // Compare as YYYYMMDD numbers
        const todayNum = todayYear * 10000 + todayMonth * 100 + todayDay;
        const routeNum = routeYear * 10000 + routeMonth * 100 + routeDay;
        
        // Skip routes that are today or in the future
        if (routeNum >= todayNum) continue;
        
        const routeOrders = await storage.getOrdersByRoute(route.id);
        const activeOrders = routeOrders.filter(o => 
          o.status !== 'cancelled' && o.status !== 'completed'
        );
        
        if (activeOrders.length === 0) {
          await storage.deleteRoute(route.id);
          deletedCount++;
        }
      }
      
      res.json({ 
        message: `Cleaned up ${deletedCount} past route(s)`,
        deletedCount 
      });
    } catch (error) {
      console.error("Cleanup past routes error:", error);
      res.status(500).json({ message: "Failed to cleanup past routes" });
    }
  });

  // Get depot coordinates (ops only - NEVER expose to customers)
  app.get("/api/ops/depot", requireAuth, requireAdmin, async (req, res) => {
    try {
      const depot = routeService.getDepotCoordinates();
      res.json({ depot });
    } catch (error) {
      console.error("Get depot error:", error);
      res.status(500).json({ message: "Failed to get depot location" });
    }
  });

  // Update driver location (for live tracking)
  app.post("/api/ops/driver-location", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { lat, lng } = req.body;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ message: "Invalid coordinates" });
      }

      const result = await routeService.updateDriverLocation(user.id, lat, lng);
      res.json({ success: true, updatedOrders: result.updatedOrders.length });
    } catch (error) {
      console.error("Update driver location error:", error);
      res.status(500).json({ message: "Failed to update driver location" });
    }
  });

  // Geocode orders with missing coordinates
  app.post("/api/ops/geocode-orders", requireAuth, requireAdmin, async (req, res) => {
    try {
      // Get all orders with null coordinates
      const allOrders = await storage.getAllOrders();
      const ordersToGeocode = allOrders.filter(o => !o.latitude || !o.longitude);
      
      if (ordersToGeocode.length === 0) {
        return res.json({ message: "No orders need geocoding", updated: 0 });
      }

      let updated = 0;
      for (const order of ordersToGeocode) {
        try {
          const coords = await geocodingService.geocodeAddress(order.address, order.city);
          if (coords) {
            await storage.updateOrder(order.id, {
              latitude: coords.lat.toString(),
              longitude: coords.lng.toString(),
            });
            updated++;
          }
        } catch (err) {
          console.error(`Failed to geocode order ${order.id}:`, err);
        }
      }

      res.json({ 
        message: `Geocoded ${updated} of ${ordersToGeocode.length} orders`,
        updated,
        total: ordersToGeocode.length 
      });
    } catch (error) {
      console.error("Geocode orders error:", error);
      res.status(500).json({ message: "Failed to geocode orders" });
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

      // Send order confirmation email after successful pre-authorization (non-blocking)
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
      const { actualLitresDelivered, itemActuals } = req.body;
      
      if (!actualLitresDelivered || typeof actualLitresDelivered !== 'number') {
        return res.status(400).json({ message: "Actual litres delivered is required" });
      }

      // Get the order first to check if it has a payment intent
      let order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Update order items with actual litres if provided
      if (itemActuals && typeof itemActuals === 'object') {
        for (const [itemId, litres] of Object.entries(itemActuals)) {
          if (typeof litres === 'number' && litres >= 0) {
            await storage.updateOrderItemActualLitres(itemId, litres);
          }
        }
      }

      let pricing = null;
      
      // Only capture payment if order has a payment intent (pre-authorized)
      if (order.stripePaymentIntentId) {
        pricing = await paymentService.capturePayment(id, actualLitresDelivered);
        order = await storage.getOrder(id);
      } else {
        // No payment intent - calculate based on order items if available
        const orderItemsList = await storage.getOrderItems(id);
        
        let subtotalBeforeDiscount = 0;
        const tierDiscount = parseFloat(order.tierDiscount?.toString() || '0');
        const deliveryFee = parseFloat(order.deliveryFee.toString());
        
        if (orderItemsList.length > 0) {
          // Multi-vehicle: calculate from each item's actual litres and price
          for (const item of orderItemsList) {
            const itemLitres = (itemActuals && itemActuals[item.id]) 
              ? itemActuals[item.id] 
              : (item.actualLitresDelivered || item.fuelAmount);
            const itemPrice = parseFloat(item.pricePerLitre?.toString() || '0');
            subtotalBeforeDiscount += itemLitres * itemPrice;
          }
        } else {
          // Single vehicle fallback
          const pricePerLitre = parseFloat(order.pricePerLitre.toString());
          subtotalBeforeDiscount = actualLitresDelivered * pricePerLitre;
        }
        
        const discount = actualLitresDelivered * tierDiscount;
        const subtotal = subtotalBeforeDiscount - discount + deliveryFee;
        const gst = subtotal * 0.05;
        const total = subtotal + gst;
        
        // Update actual litres delivered
        await storage.updateOrder(id, { actualLitresDelivered });
        // Update payment info (finalAmount)
        await storage.updateOrderPaymentInfo(id, {
          paymentStatus: 'captured',
          finalAmount: total.toFixed(2),
        });
        await storage.updateOrderStatus(id, 'completed');
        order = await storage.getOrder(id);
        
        pricing = {
          actualLitres: actualLitresDelivered,
          subtotalBeforeDiscount: subtotalBeforeDiscount.toFixed(2),
          tierDiscount,
          deliveryFee,
          subtotal: subtotal.toFixed(2),
          gst: gst.toFixed(2),
          total: total.toFixed(2),
          paymentSkipped: true,
        };
      }
      
      // Auto-progression: set next stop in route to en_route
      if (order && order.routeId) {
        const routeOrders = await storage.getOrdersByRoute(order.routeId);
        const sortedOrders = routeOrders
          .filter(o => o.status !== 'completed' && o.status !== 'cancelled')
          .sort((a, b) => (a.routePosition || 99) - (b.routePosition || 99));
        
        const nextOrder = sortedOrders[0];
        if (nextOrder && nextOrder.status === 'confirmed') {
          const updatedNext = await storage.updateOrderStatus(nextOrder.id, 'en_route');
          wsService.notifyOrderUpdate(updatedNext);
        }
      }
      
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

  // ============================================
  // Recurring Schedules Routes
  // ============================================

  app.get("/api/recurring-schedules", requireAuth, async (req, res) => {
    try {
      const schedules = await storage.getUserRecurringSchedules(req.session.userId!);
      res.json({ schedules });
    } catch (error) {
      console.error("Get recurring schedules error:", error);
      res.status(500).json({ message: "Failed to get recurring schedules" });
    }
  });

  app.post("/api/recurring-schedules", requireAuth, async (req, res) => {
    try {
      const { vehicleId, frequency, dayOfWeek, dayOfMonth, preferredWindow, fuelAmount, fillToFull } = req.body;
      
      const vehicle = await storage.getVehicle(vehicleId);
      if (!vehicle || vehicle.userId !== req.session.userId) {
        return res.status(403).json({ message: "Vehicle not found or not owned by user" });
      }

      const schedule = await storage.createRecurringSchedule({
        userId: req.session.userId!,
        vehicleId,
        frequency,
        dayOfWeek: dayOfWeek !== undefined ? parseInt(dayOfWeek) : null,
        dayOfMonth: dayOfMonth !== undefined ? parseInt(dayOfMonth) : null,
        preferredWindow: preferredWindow || "9:00 AM - 12:00 PM",
        fuelAmount: parseInt(fuelAmount),
        fillToFull: fillToFull || false,
        active: true,
      });

      res.json({ schedule });
    } catch (error) {
      console.error("Create recurring schedule error:", error);
      res.status(500).json({ message: "Failed to create recurring schedule" });
    }
  });

  app.patch("/api/recurring-schedules/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const schedule = await storage.getRecurringSchedule(id);
      
      if (!schedule || schedule.userId !== req.session.userId) {
        return res.status(403).json({ message: "Schedule not found or not owned by user" });
      }

      const updated = await storage.updateRecurringSchedule(id, req.body);
      res.json({ schedule: updated });
    } catch (error) {
      console.error("Update recurring schedule error:", error);
      res.status(500).json({ message: "Failed to update recurring schedule" });
    }
  });

  app.delete("/api/recurring-schedules/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const schedule = await storage.getRecurringSchedule(id);
      
      if (!schedule || schedule.userId !== req.session.userId) {
        return res.status(403).json({ message: "Schedule not found or not owned by user" });
      }

      await storage.deleteRecurringSchedule(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete recurring schedule error:", error);
      res.status(500).json({ message: "Failed to delete recurring schedule" });
    }
  });

  // ============================================
  // Rewards Routes
  // ============================================

  app.get("/api/rewards/balance", requireAuth, async (req, res) => {
    try {
      const balance = await storage.getOrCreateRewardBalance(req.session.userId!);
      res.json({ balance });
    } catch (error) {
      console.error("Get reward balance error:", error);
      res.status(500).json({ message: "Failed to get reward balance" });
    }
  });

  app.get("/api/rewards/transactions", requireAuth, async (req, res) => {
    try {
      const transactions = await storage.getRewardTransactions(req.session.userId!);
      res.json({ transactions });
    } catch (error) {
      console.error("Get reward transactions error:", error);
      res.status(500).json({ message: "Failed to get reward transactions" });
    }
  });

  app.get("/api/rewards/redemptions", requireAuth, async (req, res) => {
    try {
      const redemptions = await storage.getRewardRedemptions(req.session.userId!);
      res.json({ redemptions });
    } catch (error) {
      console.error("Get reward redemptions error:", error);
      res.status(500).json({ message: "Failed to get reward redemptions" });
    }
  });

  // ============================================
  // Fuel Inventory Routes (Admin Only)
  // ============================================

  app.get("/api/ops/inventory", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.initializeFuelInventory();
      const inventory = await storage.getAllFuelInventory();
      res.json({ inventory });
    } catch (error) {
      console.error("Get fuel inventory error:", error);
      res.status(500).json({ message: "Failed to get fuel inventory" });
    }
  });

  app.post("/api/ops/inventory/transaction", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { fuelType, quantity, type, notes } = req.body;
      const user = await getCurrentUser(req);
      
      if (!["regular", "premium", "diesel"].includes(fuelType)) {
        return res.status(400).json({ message: "Invalid fuel type" });
      }

      if (!["purchase", "adjustment", "spill"].includes(type)) {
        return res.status(400).json({ message: "Invalid transaction type" });
      }

      const transaction = await storage.updateFuelInventory(
        fuelType,
        parseFloat(quantity),
        type,
        undefined,
        notes,
        user?.id
      );

      res.json({ transaction });
    } catch (error) {
      console.error("Create inventory transaction error:", error);
      res.status(500).json({ message: "Failed to create inventory transaction" });
    }
  });

  app.get("/api/ops/inventory/transactions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { fuelType, limit } = req.query;
      const transactions = await storage.getFuelInventoryTransactions(
        fuelType as string | undefined,
        limit ? parseInt(limit as string) : undefined
      );
      res.json({ transactions });
    } catch (error) {
      console.error("Get inventory transactions error:", error);
      res.status(500).json({ message: "Failed to get inventory transactions" });
    }
  });

  // ============================================
  // Business Settings Routes (Admin Only)
  // ============================================

  app.get("/api/ops/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAllBusinessSettings();
      res.json({ settings });
    } catch (error) {
      console.error("Get business settings error:", error);
      res.status(500).json({ message: "Failed to get business settings" });
    }
  });

  app.post("/api/ops/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { key, value } = req.body;
      const user = req.user as any;
      await storage.setBusinessSetting(key, value, user?.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Set business setting error:", error);
      res.status(500).json({ message: "Failed to save business setting" });
    }
  });

  app.post("/api/ops/settings/bulk", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { settings } = req.body;
      const user = req.user as any;
      for (const [key, value] of Object.entries(settings)) {
        await storage.setBusinessSetting(key, value as string, user?.id);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Bulk save business settings error:", error);
      res.status(500).json({ message: "Failed to save business settings" });
    }
  });

  // ============================================
  // Shame Events Routes (Hall of Shame)
  // ============================================

  // Record a shame event (when someone tries to capture 0 litres)
  app.post("/api/shame-events", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      const { message, orderId } = req.body;
      
      const event = await storage.createShameEvent({
        userId: user.id,
        messageShown: message,
        orderId: orderId || null,
      });
      
      res.json({ success: true, event });
    } catch (error) {
      console.error("Create shame event error:", error);
      res.status(500).json({ message: "Failed to record shame event" });
    }
  });

  // Get shame leaderboard (owner only)
  app.get("/api/shame-events/leaderboard", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      // Only owner can see the Hall of Shame
      if (user.role !== 'owner') {
        return res.status(403).json({ message: "Only the owner can view the Hall of Shame" });
      }
      
      const leaderboard = await storage.getShameLeaderboard();
      const recentEvents = await storage.getShameEvents(10);
      const totalEvents = (await storage.getShameEvents(1000)).length;
      
      res.json({ leaderboard, recentEvents, totalEvents });
    } catch (error) {
      console.error("Get shame leaderboard error:", error);
      res.status(500).json({ message: "Failed to get shame leaderboard" });
    }
  });

  // ============================================
  // Analytics Routes (Admin Only)
  // ============================================

  app.get("/api/ops/analytics/overview", requireAuth, requireAdmin, async (req, res) => {
    try {
      const allOrders = await storage.getAllOrders();
      const allUsers = await storage.getAllUsers();
      const customers = allUsers.filter(u => u.role === 'user');
      
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const completedOrders = allOrders.filter(o => o.status === 'completed');
      const recentOrders = completedOrders.filter(o => new Date(o.createdAt) >= thirtyDaysAgo);
      const weekOrders = completedOrders.filter(o => new Date(o.createdAt) >= sevenDaysAgo);
      
      const totalRevenue = completedOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || o.total?.toString() || '0'), 0);
      const monthRevenue = recentOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || o.total?.toString() || '0'), 0);
      const weekRevenue = weekOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || o.total?.toString() || '0'), 0);
      
      const totalLitres = completedOrders.reduce((sum, o) => sum + (o.actualLitresDelivered || o.fuelAmount), 0);
      const monthLitres = recentOrders.reduce((sum, o) => sum + (o.actualLitresDelivered || o.fuelAmount), 0);
      
      const tierDistribution = {
        payg: customers.filter(c => c.subscriptionTier === 'payg').length,
        access: customers.filter(c => c.subscriptionTier === 'access').length,
        household: customers.filter(c => c.subscriptionTier === 'household').length,
        rural: customers.filter(c => c.subscriptionTier === 'rural').length,
      };

      const windowCounts: Record<string, number> = {};
      completedOrders.forEach(o => {
        windowCounts[o.deliveryWindow] = (windowCounts[o.deliveryWindow] || 0) + 1;
      });
      const popularWindows = Object.entries(windowCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

      // Cancelled orders analytics
      const cancelledOrders = allOrders.filter(o => o.status === 'cancelled');
      const cancelledCount = cancelledOrders.length;
      const cancelledRevenue = cancelledOrders.reduce((sum, o) => sum + parseFloat(o.total?.toString() || '0'), 0);
      
      // Monthly breakdown of cancelled orders
      const cancelledByMonth: Record<string, { count: number; value: number }> = {};
      cancelledOrders.forEach(o => {
        const monthKey = new Date(o.createdAt).toISOString().slice(0, 7); // YYYY-MM
        if (!cancelledByMonth[monthKey]) {
          cancelledByMonth[monthKey] = { count: 0, value: 0 };
        }
        cancelledByMonth[monthKey].count++;
        cancelledByMonth[monthKey].value += parseFloat(o.total?.toString() || '0');
      });
      const cancelledMonthlyData = Object.entries(cancelledByMonth)
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Fuel type breakdown from order_items
      const allOrderItems = await storage.getAllOrderItems();
      const completedOrderIds = new Set(completedOrders.map(o => o.id));
      const completedOrderItems = allOrderItems.filter(item => completedOrderIds.has(item.orderId));
      
      const fuelTypeBreakdown: Record<string, { deliveries: number; litres: number; revenue: number }> = {
        regular: { deliveries: 0, litres: 0, revenue: 0 },
        diesel: { deliveries: 0, litres: 0, revenue: 0 },
        premium: { deliveries: 0, litres: 0, revenue: 0 },
      };
      
      completedOrderItems.forEach(item => {
        const fuelType = item.fuelType || 'regular';
        if (fuelTypeBreakdown[fuelType]) {
          fuelTypeBreakdown[fuelType].deliveries++;
          fuelTypeBreakdown[fuelType].litres += item.fuelAmount || 0;
          fuelTypeBreakdown[fuelType].revenue += parseFloat(item.subtotal?.toString() || '0');
        }
      });

      // Demand by day of week
      const demandByDay: Record<string, number> = {
        Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0
      };
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      allOrders.forEach(o => {
        const dayOfWeek = new Date(o.scheduledDate).getDay();
        demandByDay[dayNames[dayOfWeek]]++;
      });
      const demandByDayArray = dayNames.map(day => ({ day, deliveries: demandByDay[day] }));

      // Calculate peak day from demand data
      const peakDayEntry = demandByDayArray.reduce((max, curr) => curr.deliveries > max.deliveries ? curr : max, demandByDayArray[0]);
      const peakDay = peakDayEntry.day;
      
      // Calculate peak delivery window
      const peakWindow = popularWindows.length > 0 ? popularWindows[0][0] : 'N/A';
      
      // Calculate average daily orders
      const totalOrdersCount = allOrders.length;
      const avgDailyOrders = totalOrdersCount > 0 ? (totalOrdersCount / 30).toFixed(1) : 0;

      // Business settings
      const businessSettingsData = await storage.getAllBusinessSettings();
      const operatingCosts = parseFloat(businessSettingsData.operatingCosts || '0');
      const ownerSalary = parseFloat(businessSettingsData.ownerSalary || '0');
      const taxReserveRate = parseFloat(businessSettingsData.taxReserveRate || '30') / 100;

      // Fuel inventory costs
      const allTransactions = await storage.getFuelInventoryTransactions(undefined, 1000);
      const purchaseTransactions = allTransactions.filter(t => t.type === 'purchase');
      const sellableFuelCost = purchaseTransactions.reduce((sum, t) => sum + parseFloat(t.totalCost?.toString() || '0'), 0);
      const sellableLitres = purchaseTransactions.reduce((sum, t) => sum + parseFloat(t.quantity?.toString() || '0'), 0);
      
      // For COGS, calculate based on delivered fuel (simplified - using average purchase cost)
      const avgPurchaseCostPerL = sellableLitres > 0 ? sellableFuelCost / sellableLitres : 0;
      const fuelCOGS = totalLitres * avgPurchaseCostPerL;

      // New customers this month
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const newCustomersThisMonth = customers.filter(c => new Date(c.createdAt) >= startOfMonth).length;

      // Driver performance aggregation
      const allRoutes = await storage.getAllRoutes();
      const driverStats: Record<string, { name: string; deliveries: number; litres: number; revenue: number; routesWorked: number }> = {};
      
      for (const route of allRoutes) {
        if (!route.driverId || !route.driverName) continue;
        
        // Get completed orders for this route
        const routeOrders = completedOrders.filter(o => o.routeId === route.id);
        
        if (!driverStats[route.driverId]) {
          driverStats[route.driverId] = {
            name: route.driverName,
            deliveries: 0,
            litres: 0,
            revenue: 0,
            routesWorked: 0,
          };
        }
        
        driverStats[route.driverId].deliveries += routeOrders.length;
        driverStats[route.driverId].litres += routeOrders.reduce((sum, o) => sum + (o.actualLitresDelivered || o.fuelAmount), 0);
        driverStats[route.driverId].revenue += routeOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || o.total?.toString() || '0'), 0);
        driverStats[route.driverId].routesWorked++;
      }
      
      const driverPerformance = Object.values(driverStats)
        .map(d => ({
          ...d,
          avgDeliveriesPerRoute: d.routesWorked > 0 ? (d.deliveries / d.routesWorked).toFixed(1) : '0',
        }))
        .sort((a, b) => b.deliveries - a.deliveries);

      res.json({
        overview: {
          totalCustomers: customers.length,
          totalOrders: completedOrders.length,
          totalRevenue,
          totalLitres,
          monthRevenue,
          monthLitres,
          weekRevenue,
          weekOrders: weekOrders.length,
          tierDistribution,
          popularWindows,
          cancelledOrders: cancelledCount,
          cancelledRevenue,
          cancelledMonthlyData,
          fuelTypeBreakdown,
          demandByDay: demandByDayArray,
          peakDay,
          peakWindow,
          avgDailyOrders: parseFloat(avgDailyOrders.toString()),
          operatingCosts,
          ownerSalary,
          taxReserveRate,
          sellableFuelCost,
          sellableLitres,
          fuelCOGS,
          newCustomersThisMonth,
          driverPerformance,
        }
      });
    } catch (error) {
      console.error("Get analytics overview error:", error);
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  app.get("/api/ops/analytics/orders-over-time", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const allOrders = await storage.getAllOrders();
      const completedOrders = allOrders.filter(o => o.status === 'completed');
      
      const now = new Date();
      const startDate = new Date(now.getTime() - parseInt(days as string) * 24 * 60 * 60 * 1000);
      
      const dailyData: Record<string, { orders: number; revenue: number; litres: number }> = {};
      
      for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        dailyData[dateStr] = { orders: 0, revenue: 0, litres: 0 };
      }
      
      completedOrders.forEach(order => {
        const dateStr = new Date(order.createdAt).toISOString().split('T')[0];
        if (dailyData[dateStr]) {
          dailyData[dateStr].orders++;
          dailyData[dateStr].revenue += parseFloat(order.finalAmount?.toString() || order.total?.toString() || '0');
          dailyData[dateStr].litres += order.actualLitresDelivered || order.fuelAmount;
        }
      });

      const chartData = Object.entries(dailyData).map(([date, data]) => ({
        date,
        ...data
      })).sort((a, b) => a.date.localeCompare(b.date));

      res.json({ chartData });
    } catch (error) {
      console.error("Get orders over time error:", error);
      res.status(500).json({ message: "Failed to get chart data" });
    }
  });

  return httpServer;
}
