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
  (req as any).user = user;
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
          
          // Note: Do NOT auto-optimize route when order is cancelled
          // Stop numbers should remain stable - only manual Re-Optimize button changes them
          
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
          
          // Note: Do NOT auto-optimize route when order is cancelled
          // Stop numbers should remain stable - only manual Re-Optimize button changes them
          
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
      
      // CRITICAL SAFETY NET: Reject if actualLitresDelivered is 0 or negative
      // This prevents $0.00 captures that would cause financial loss
      if (actualLitresDelivered === undefined || actualLitresDelivered === null || 
          typeof actualLitresDelivered !== 'number' || actualLitresDelivered <= 0) {
        console.error(`BLOCKED: Attempted $0 capture for order ${id} with litres: ${actualLitresDelivered}`);
        return res.status(400).json({ 
          message: "Cannot capture payment for 0 litres. If no fuel was delivered, cancel the order instead.",
          blocked: true 
        });
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
        
        // CRITICAL: Only set order to completed AFTER Stripe confirms payment captured successfully
        // If capturePayment throws an error, we won't reach this line
        await storage.updateOrderStatus(id, 'completed');
        
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
      const user = await getCurrentUser(req);
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
      const user = await getCurrentUser(req);
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
      const user = await getCurrentUser(req);
      const { message, orderId } = req.body;
      
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
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
      const user = await getCurrentUser(req);
      // Only owner can see the Hall of Shame
      if (!user || user.role !== 'owner') {
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
      
      // Use Calgary timezone for all date calculations
      const now = new Date();
      const calgaryNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Edmonton" }));
      
      // Today: start of today Calgary time
      const startOfToday = new Date(calgaryNow);
      startOfToday.setHours(0, 0, 0, 0);
      
      // Current week: Sunday to Saturday (Calgary time)
      const currentDayOfWeek = calgaryNow.getDay(); // 0 = Sunday
      const startOfWeek = new Date(calgaryNow);
      startOfWeek.setDate(calgaryNow.getDate() - currentDayOfWeek);
      startOfWeek.setHours(0, 0, 0, 0);
      
      // Current month: 1st to end of month
      const startOfMonth = new Date(calgaryNow.getFullYear(), calgaryNow.getMonth(), 1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      // Current year: Jan 1 to Dec 31
      const startOfYear = new Date(calgaryNow.getFullYear(), 0, 1);
      startOfYear.setHours(0, 0, 0, 0);
      
      const completedOrders = allOrders.filter(o => o.status === 'completed');
      const dayOrders = completedOrders.filter(o => new Date(o.createdAt) >= startOfToday);
      const weekOrders = completedOrders.filter(o => new Date(o.createdAt) >= startOfWeek);
      const monthOrders = completedOrders.filter(o => new Date(o.createdAt) >= startOfMonth);
      const yearOrders = completedOrders.filter(o => new Date(o.createdAt) >= startOfYear);
      
      // Revenue calculations for each period
      const dayRevenue = dayOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || o.total?.toString() || '0'), 0);
      const weekRevenue = weekOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || o.total?.toString() || '0'), 0);
      const monthRevenue = monthOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || o.total?.toString() || '0'), 0);
      const yearRevenue = yearOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || o.total?.toString() || '0'), 0);
      
      // Litres calculations for each period
      const dayLitres = dayOrders.reduce((sum, o) => sum + parseFloat(o.actualLitresDelivered?.toString() || o.fuelAmount?.toString() || '0'), 0);
      const weekLitres = weekOrders.reduce((sum, o) => sum + parseFloat(o.actualLitresDelivered?.toString() || o.fuelAmount?.toString() || '0'), 0);
      const monthLitres = monthOrders.reduce((sum, o) => sum + parseFloat(o.actualLitresDelivered?.toString() || o.fuelAmount?.toString() || '0'), 0);
      const yearLitres = yearOrders.reduce((sum, o) => sum + parseFloat(o.actualLitresDelivered?.toString() || o.fuelAmount?.toString() || '0'), 0);
      
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
      const yearFuelCOGS = yearLitres * avgPurchaseCostPerL;
      const monthFuelCOGS = monthLitres * avgPurchaseCostPerL;
      const weekFuelCOGS = weekLitres * avgPurchaseCostPerL;
      const dayFuelCOGS = dayLitres * avgPurchaseCostPerL;

      // New customers this month (startOfMonth already defined above)
      const newCustomersThisMonth = customers.filter(c => new Date(c.createdAt) >= startOfMonth).length;
      const newCustomersThisYear = customers.filter(c => new Date(c.createdAt) >= startOfYear).length;

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
        driverStats[route.driverId].litres += routeOrders.reduce((sum, o) => sum + parseFloat(o.actualLitresDelivered?.toString() || o.fuelAmount?.toString() || '0'), 0);
        driverStats[route.driverId].revenue += routeOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || o.total?.toString() || '0'), 0);
        driverStats[route.driverId].routesWorked++;
      }
      
      const driverPerformance = Object.values(driverStats)
        .map(d => ({
          ...d,
          avgDeliveriesPerRoute: d.routesWorked > 0 ? (d.deliveries / d.routesWorked).toFixed(1) : '0',
        }))
        .sort((a, b) => b.deliveries - a.deliveries);

      // Calculate days in current month and days elapsed
      const daysInMonth = new Date(calgaryNow.getFullYear(), calgaryNow.getMonth() + 1, 0).getDate();
      const dayOfMonth = calgaryNow.getDate();
      const dayOfWeek = calgaryNow.getDay() === 0 ? 7 : calgaryNow.getDay(); // 1-7 (Mon-Sun), adjusted for current week
      const dayOfYear = Math.floor((calgaryNow.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;

      // Pro-rated operating costs for each period
      const monthlyOperatingCosts = operatingCosts; // Monthly base
      const yearOperatingCosts = operatingCosts * 12;
      const weekOperatingCosts = (operatingCosts * 12) / 52;
      const dayOperatingCosts = operatingCosts / 30;

      // Calculate revenue flow for each period
      // Revenue Flow: Gross Income → Operating Costs → True Profit → Obligations → Owner Draw Available → Retained Capital
      const GST_RATE = 0.05;

      // YEARLY calculations
      const yearGstCollected = yearRevenue * GST_RATE / (1 + GST_RATE); // Extract GST from total
      const yearGrossIncome = yearRevenue - yearGstCollected; // Revenue before GST
      const yearTrueProfit = yearGrossIncome - yearFuelCOGS - yearOperatingCosts;
      const yearTaxReserve = Math.max(0, yearTrueProfit * taxReserveRate);
      const yearOwnerDrawAvailable = yearTrueProfit - yearGstCollected - yearTaxReserve;

      // MONTHLY calculations
      const monthGstCollected = monthRevenue * GST_RATE / (1 + GST_RATE);
      const monthGrossIncome = monthRevenue - monthGstCollected;
      const monthTrueProfit = monthGrossIncome - monthFuelCOGS - monthlyOperatingCosts;
      const monthTaxReserve = Math.max(0, monthTrueProfit * taxReserveRate);
      const monthOwnerDrawAvailable = monthTrueProfit - monthGstCollected - monthTaxReserve;

      // WEEKLY calculations
      const weekGstCollected = weekRevenue * GST_RATE / (1 + GST_RATE);
      const weekGrossIncome = weekRevenue - weekGstCollected;
      const weekTrueProfit = weekGrossIncome - weekFuelCOGS - weekOperatingCosts;
      const weekTaxReserve = Math.max(0, weekTrueProfit * taxReserveRate);
      const weekOwnerDrawAvailable = weekTrueProfit - weekGstCollected - weekTaxReserve;

      // DAILY calculations
      const dayGstCollected = dayRevenue * GST_RATE / (1 + GST_RATE);
      const dayGrossIncome = dayRevenue - dayGstCollected;
      const dayTrueProfit = dayGrossIncome - dayFuelCOGS - dayOperatingCosts;
      const dayTaxReserve = Math.max(0, dayTrueProfit * taxReserveRate);
      const dayOwnerDrawAvailable = dayTrueProfit - dayGstCollected - dayTaxReserve;

      // ============================================
      // PROJECTIONS - Statistical Analysis
      // ============================================
      
      // Get historical monthly data for trend analysis
      const monthlyHistory: { month: string; revenue: number; orders: number; customers: number; litres: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const monthStart = new Date(calgaryNow.getFullYear(), calgaryNow.getMonth() - i, 1);
        const monthEnd = new Date(calgaryNow.getFullYear(), calgaryNow.getMonth() - i + 1, 0, 23, 59, 59);
        const monthOrdersFiltered = completedOrders.filter(o => {
          const d = new Date(o.createdAt);
          return d >= monthStart && d <= monthEnd;
        });
        const monthCustomersFiltered = customers.filter(c => new Date(c.createdAt) <= monthEnd);
        
        monthlyHistory.push({
          month: monthStart.toISOString().slice(0, 7),
          revenue: monthOrdersFiltered.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || o.total?.toString() || '0'), 0),
          orders: monthOrdersFiltered.length,
          customers: monthCustomersFiltered.length,
          litres: monthOrdersFiltered.reduce((sum, o) => sum + parseFloat(o.actualLitresDelivered?.toString() || o.fuelAmount?.toString() || '0'), 0),
        });
      }

      // Calculate growth rates and trends
      const recentMonths = monthlyHistory.slice(-3); // Last 3 months with data
      const avgMonthlyRevenue = recentMonths.length > 0 ? recentMonths.reduce((sum, m) => sum + m.revenue, 0) / recentMonths.length : 0;
      const avgMonthlyOrders = recentMonths.length > 0 ? recentMonths.reduce((sum, m) => sum + m.orders, 0) / recentMonths.length : 0;
      const avgMonthlyLitres = recentMonths.length > 0 ? recentMonths.reduce((sum, m) => sum + m.litres, 0) / recentMonths.length : 0;

      // Calculate month-over-month growth rate
      const lastMonth = monthlyHistory[monthlyHistory.length - 2];
      const twoMonthsAgo = monthlyHistory[monthlyHistory.length - 3];
      const revenueGrowthRate = lastMonth && twoMonthsAgo && twoMonthsAgo.revenue > 0 
        ? ((lastMonth.revenue - twoMonthsAgo.revenue) / twoMonthsAgo.revenue) 
        : 0;
      const customerGrowthRate = lastMonth && twoMonthsAgo && twoMonthsAgo.customers > 0
        ? ((lastMonth.customers - twoMonthsAgo.customers) / twoMonthsAgo.customers)
        : 0;

      // Linear regression for next month projection
      const monthsWithData = monthlyHistory.filter(m => m.revenue > 0);
      let projectedNextMonthRevenue = avgMonthlyRevenue;
      let projectedNextMonthOrders = avgMonthlyOrders;
      let projectedNextMonthLitres = avgMonthlyLitres;
      
      if (monthsWithData.length >= 3) {
        // Simple linear regression
        const n = monthsWithData.length;
        const sumX = (n * (n + 1)) / 2;
        const sumXX = (n * (n + 1) * (2 * n + 1)) / 6;
        const sumY = monthsWithData.reduce((sum, m) => sum + m.revenue, 0);
        const sumXY = monthsWithData.reduce((sum, m, i) => sum + (i + 1) * m.revenue, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        projectedNextMonthRevenue = intercept + slope * (n + 1);
        projectedNextMonthRevenue = Math.max(0, projectedNextMonthRevenue); // Can't be negative
        
        // Similar for orders
        const sumYOrders = monthsWithData.reduce((sum, m) => sum + m.orders, 0);
        const sumXYOrders = monthsWithData.reduce((sum, m, i) => sum + (i + 1) * m.orders, 0);
        const slopeOrders = (n * sumXYOrders - sumX * sumYOrders) / (n * sumXX - sumX * sumX);
        const interceptOrders = (sumYOrders - slopeOrders * sumX) / n;
        projectedNextMonthOrders = Math.max(0, Math.round(interceptOrders + slopeOrders * (n + 1)));
        
        // Similar for litres
        const sumYLitres = monthsWithData.reduce((sum, m) => sum + m.litres, 0);
        const sumXYLitres = monthsWithData.reduce((sum, m, i) => sum + (i + 1) * m.litres, 0);
        const slopeLitres = (n * sumXYLitres - sumX * sumYLitres) / (n * sumXX - sumX * sumX);
        const interceptLitres = (sumYLitres - slopeLitres * sumX) / n;
        projectedNextMonthLitres = Math.max(0, interceptLitres + slopeLitres * (n + 1));
      }

      // Calculate projected annual revenue
      const projectedAnnualRevenue = projectedNextMonthRevenue * 12;
      const projectedAnnualProfit = projectedAnnualRevenue - (projectedAnnualRevenue * GST_RATE / (1 + GST_RATE)) 
        - (projectedNextMonthLitres * 12 * avgPurchaseCostPerL) - yearOperatingCosts;
      const projectedAnnualOwnerDraw = projectedAnnualProfit - (projectedAnnualProfit * taxReserveRate);

      // Health indicators
      const healthIndicators: { type: 'positive' | 'negative' | 'neutral'; label: string; value: string; description: string }[] = [];
      
      // Revenue trend
      if (revenueGrowthRate > 0.1) {
        healthIndicators.push({ type: 'positive', label: 'Revenue Growth', value: `+${(revenueGrowthRate * 100).toFixed(1)}%`, description: 'Strong month-over-month revenue growth' });
      } else if (revenueGrowthRate < -0.1) {
        healthIndicators.push({ type: 'negative', label: 'Revenue Decline', value: `${(revenueGrowthRate * 100).toFixed(1)}%`, description: 'Revenue declining month-over-month' });
      } else if (revenueGrowthRate !== 0) {
        healthIndicators.push({ type: 'neutral', label: 'Revenue Stable', value: `${(revenueGrowthRate * 100).toFixed(1)}%`, description: 'Revenue relatively stable' });
      }

      // Customer growth
      if (customerGrowthRate > 0.05) {
        healthIndicators.push({ type: 'positive', label: 'Customer Growth', value: `+${(customerGrowthRate * 100).toFixed(1)}%`, description: 'Growing customer base' });
      } else if (customerGrowthRate < 0) {
        healthIndicators.push({ type: 'negative', label: 'Customer Loss', value: `${(customerGrowthRate * 100).toFixed(1)}%`, description: 'Losing customers' });
      }

      // Profit margin
      const profitMargin = yearGrossIncome > 0 ? (yearTrueProfit / yearGrossIncome) * 100 : 0;
      if (profitMargin > 30) {
        healthIndicators.push({ type: 'positive', label: 'Profit Margin', value: `${profitMargin.toFixed(1)}%`, description: 'Healthy profit margin' });
      } else if (profitMargin < 10 && profitMargin > 0) {
        healthIndicators.push({ type: 'negative', label: 'Low Margin', value: `${profitMargin.toFixed(1)}%`, description: 'Profit margin is thin' });
      } else if (profitMargin <= 0) {
        healthIndicators.push({ type: 'negative', label: 'No Profit', value: `${profitMargin.toFixed(1)}%`, description: 'Operating at a loss' });
      }

      // Order volume
      if (avgMonthlyOrders > 50) {
        healthIndicators.push({ type: 'positive', label: 'Strong Volume', value: `${avgMonthlyOrders.toFixed(0)}/mo`, description: 'Healthy order volume' });
      } else if (avgMonthlyOrders < 10 && avgMonthlyOrders > 0) {
        healthIndicators.push({ type: 'negative', label: 'Low Volume', value: `${avgMonthlyOrders.toFixed(0)}/mo`, description: 'Need more orders' });
      }

      // Subscription tier health
      const paidTiers = tierDistribution.access + tierDistribution.household + tierDistribution.rural;
      const totalTiers = paidTiers + tierDistribution.payg;
      const paidTierRatio = totalTiers > 0 ? paidTiers / totalTiers : 0;
      if (paidTierRatio > 0.5) {
        healthIndicators.push({ type: 'positive', label: 'Subscription Mix', value: `${(paidTierRatio * 100).toFixed(0)}% paid`, description: 'Good mix of paid subscribers' });
      } else if (paidTierRatio < 0.2 && totalTiers > 0) {
        healthIndicators.push({ type: 'negative', label: 'Subscription Mix', value: `${(paidTierRatio * 100).toFixed(0)}% paid`, description: 'Most customers on PAYG tier' });
      }

      // Cancellation rate
      const totalAllOrders = allOrders.length;
      const cancellationRate = totalAllOrders > 0 ? (cancelledCount / totalAllOrders) * 100 : 0;
      if (cancellationRate > 10) {
        healthIndicators.push({ type: 'negative', label: 'Cancellation Rate', value: `${cancellationRate.toFixed(1)}%`, description: 'High cancellation rate - investigate causes' });
      } else if (cancellationRate < 3) {
        healthIndicators.push({ type: 'positive', label: 'Low Cancellations', value: `${cancellationRate.toFixed(1)}%`, description: 'Excellent order completion' });
      }

      res.json({
        overview: {
          // Customer metrics
          totalCustomers: customers.length,
          newCustomersThisMonth,
          newCustomersThisYear,
          tierDistribution,
          
          // Period summaries following: Gross Income → Operating Costs → True Profit → Obligations → Owner Draw
          daily: {
            orders: dayOrders.length,
            litres: dayLitres,
            grossIncome: dayGrossIncome,
            fuelCOGS: dayFuelCOGS,
            operatingCosts: dayOperatingCosts,
            trueProfit: dayTrueProfit,
            gstCollected: dayGstCollected,
            taxReserve: dayTaxReserve,
            ownerDrawAvailable: dayOwnerDrawAvailable,
            dateRange: `Today (${calgaryNow.toLocaleDateString('en-CA')})`,
          },
          weekly: {
            orders: weekOrders.length,
            litres: weekLitres,
            grossIncome: weekGrossIncome,
            fuelCOGS: weekFuelCOGS,
            operatingCosts: weekOperatingCosts,
            trueProfit: weekTrueProfit,
            gstCollected: weekGstCollected,
            taxReserve: weekTaxReserve,
            ownerDrawAvailable: weekOwnerDrawAvailable,
            dateRange: `Week of ${startOfWeek.toLocaleDateString('en-CA')}`,
          },
          monthly: {
            orders: monthOrders.length,
            litres: monthLitres,
            grossIncome: monthGrossIncome,
            fuelCOGS: monthFuelCOGS,
            operatingCosts: monthlyOperatingCosts,
            trueProfit: monthTrueProfit,
            gstCollected: monthGstCollected,
            taxReserve: monthTaxReserve,
            ownerDrawAvailable: monthOwnerDrawAvailable,
            dateRange: `${calgaryNow.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}`,
          },
          yearly: {
            orders: yearOrders.length,
            litres: yearLitres,
            grossIncome: yearGrossIncome,
            fuelCOGS: yearFuelCOGS,
            operatingCosts: yearOperatingCosts,
            trueProfit: yearTrueProfit,
            gstCollected: yearGstCollected,
            taxReserve: yearTaxReserve,
            ownerDrawAvailable: yearOwnerDrawAvailable,
            dateRange: `${calgaryNow.getFullYear()} (Jan 1 - Dec 31)`,
          },
          
          // Projections
          projections: {
            nextMonthRevenue: projectedNextMonthRevenue,
            nextMonthOrders: projectedNextMonthOrders,
            nextMonthLitres: projectedNextMonthLitres,
            annualRevenue: projectedAnnualRevenue,
            annualProfit: projectedAnnualProfit,
            annualOwnerDraw: projectedAnnualOwnerDraw,
            revenueGrowthRate,
            customerGrowthRate,
            avgMonthlyRevenue,
            avgMonthlyOrders,
            healthIndicators,
            monthlyHistory: monthlyHistory.slice(-6), // Last 6 months for chart
          },
          
          // Additional metrics
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
          taxReserveRate,
          sellableFuelCost,
          sellableLitres,
          avgPurchaseCostPerL,
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
          dailyData[dateStr].litres += parseFloat(order.actualLitresDelivered?.toString() || order.fuelAmount?.toString() || '0');
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

  // Route efficiency analytics endpoint
  app.get("/api/ops/analytics/route-efficiency", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const allRoutes = await storage.getAllRoutes();
      
      const now = new Date();
      const startDate = new Date(now.getTime() - parseInt(days as string) * 24 * 60 * 60 * 1000);
      
      // Filter routes within date range
      const recentRoutes = allRoutes.filter(route => {
        const routeDate = new Date(route.routeDate);
        return routeDate >= startDate && routeDate <= now;
      });
      
      // Get trucks for fuel economy data
      const trucks = await storage.getAllTrucks();
      const trucksWithEconomy = trucks.filter(t => t.fuelEconomy && parseFloat(t.fuelEconomy) > 0);
      const avgFleetFuelEconomy = trucksWithEconomy.length > 0
        ? trucksWithEconomy.reduce((sum, t) => sum + parseFloat(t.fuelEconomy!), 0) / trucksWithEconomy.length
        : 15; // Default 15 L/100km
      
      // Get diesel pricing for cost estimates
      const pricing = await storage.getFuelPricing();
      const dieselPricing = pricing.find(p => p.fuelType === 'diesel');
      const dieselCostPerLitre = dieselPricing ? parseFloat(dieselPricing.baseCost) : 1.45;
      
      // Aggregate metrics
      const totalRoutes = recentRoutes.length;
      const totalDistanceKm = recentRoutes.reduce((sum, r) => sum + parseFloat(r.totalDistanceKm || '0'), 0);
      const avgRouteDistanceKm = totalRoutes > 0 ? totalDistanceKm / totalRoutes : 0;
      const avgStopDistanceKm = totalRoutes > 0
        ? recentRoutes.reduce((sum, r) => sum + parseFloat(r.avgStopDistanceKm || '0'), 0) / totalRoutes
        : 0;
      
      // Fuel consumption estimates
      const estimatedFuelUse = (totalDistanceKm / 100) * avgFleetFuelEconomy;
      const estimatedFuelCost = estimatedFuelUse * dieselCostPerLitre;
      
      // Daily breakdown for chart
      const dailyData: Record<string, { routes: number; distanceKm: number; fuelUse: number; fuelCost: number }> = {};
      
      for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        dailyData[dateStr] = { routes: 0, distanceKm: 0, fuelUse: 0, fuelCost: 0 };
      }
      
      recentRoutes.forEach(route => {
        const dateStr = new Date(route.routeDate).toISOString().split('T')[0];
        if (dailyData[dateStr]) {
          const routeDistance = parseFloat(route.totalDistanceKm || '0');
          const routeFuelUse = (routeDistance / 100) * avgFleetFuelEconomy;
          const routeFuelCost = routeFuelUse * dieselCostPerLitre;
          
          dailyData[dateStr].routes++;
          dailyData[dateStr].distanceKm += routeDistance;
          dailyData[dateStr].fuelUse += routeFuelUse;
          dailyData[dateStr].fuelCost += routeFuelCost;
        }
      });
      
      const chartData = Object.entries(dailyData).map(([date, data]) => ({
        date,
        ...data
      })).sort((a, b) => a.date.localeCompare(b.date));
      
      res.json({
        summary: {
          totalRoutes,
          totalDistanceKm,
          avgRouteDistanceKm,
          avgStopDistanceKm,
          avgFleetFuelEconomy,
          estimatedFuelUse,
          estimatedFuelCost,
          dieselCostPerLitre,
          period: `${days} days`,
        },
        chartData,
      });
    } catch (error) {
      console.error("Get route efficiency analytics error:", error);
      res.status(500).json({ message: "Failed to get route efficiency data" });
    }
  });

  // ============================================
  // Emergency Services Routes
  // ============================================

  // Get emergency services info (pricing, user's access status)
  app.get("/api/emergency/info", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Business hours: 7:00 AM - 5:30 PM Calgary time
      const now = new Date();
      const calgaryTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Edmonton" }));
      const hour = calgaryTime.getHours();
      const minute = calgaryTime.getMinutes();
      const currentTimeMinutes = hour * 60 + minute;
      const startMinutes = 7 * 60; // 7:00 AM
      const endMinutes = 17 * 60 + 30; // 5:30 PM
      const isBusinessHours = currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes;
      const dayOfWeek = calgaryTime.getDay();
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      const isWithinBusinessHours = isBusinessHours && isWeekday;

      res.json({
        hasEmergencyAccess: user.hasEmergencyAccess,
        emergencyCreditsRemaining: user.emergencyCreditsRemaining,
        emergencyCreditYearStart: user.emergencyCreditYearStart,
        isWithinBusinessHours,
        calgaryTime: calgaryTime.toISOString(),
        pricing: {
          monthlyFee: 14.99,
          serviceFee: 29.99,
          annualCredits: 1,
        },
        services: [
          { type: 'emergency_fuel', name: 'Emergency Fuel', description: 'Ran out of gas? We\'ll bring fuel to you.' },
          { type: 'lockout', name: 'Lockout Assistance', description: 'Locked out of your vehicle? We can help.' },
          { type: 'boost', name: 'Boost Service', description: 'Dead battery? We\'ll give you a boost.' },
        ],
      });
    } catch (error) {
      console.error("Get emergency info error:", error);
      res.status(500).json({ message: "Failed to get emergency services info" });
    }
  });

  // Subscribe to Emergency Access add-on
  app.post("/api/emergency/subscribe", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (user.hasEmergencyAccess) {
        return res.status(400).json({ message: "You already have Emergency Access" });
      }

      // For now, we'll just enable Emergency Access directly
      // In production, this would create a Stripe subscription for $14.99/month
      await storage.updateUserEmergencyAccess(user.id, {
        hasEmergencyAccess: true,
        emergencyCreditsRemaining: 1,
        emergencyCreditYearStart: new Date(),
      });

      res.json({ 
        success: true, 
        message: "Emergency Access activated! You have 1 free emergency service credit." 
      });
    } catch (error) {
      console.error("Subscribe to emergency access error:", error);
      res.status(500).json({ message: "Failed to activate Emergency Access" });
    }
  });

  // Cancel Emergency Access
  app.post("/api/emergency/cancel", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (!user.hasEmergencyAccess) {
        return res.status(400).json({ message: "You don't have Emergency Access" });
      }

      await storage.updateUserEmergencyAccess(user.id, {
        hasEmergencyAccess: false,
        emergencyAccessStripeSubId: null,
      });

      res.json({ success: true, message: "Emergency Access cancelled" });
    } catch (error) {
      console.error("Cancel emergency access error:", error);
      res.status(500).json({ message: "Failed to cancel Emergency Access" });
    }
  });

  // Get user's service request history
  app.get("/api/emergency/requests", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const requests = await storage.getUserServiceRequests(user.id);
      res.json({ requests });
    } catch (error) {
      console.error("Get service requests error:", error);
      res.status(500).json({ message: "Failed to get service requests" });
    }
  });

  // Create a new service request
  app.post("/api/emergency/requests", requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Check if user has Emergency Access
      if (!user.hasEmergencyAccess) {
        return res.status(403).json({ 
          message: "Emergency Access required. Subscribe to Emergency Access ($14.99/month) to request after-hours services." 
        });
      }

      const { serviceType, vehicleId, address, city, latitude, longitude, notes, fuelType, fuelAmount } = req.body;

      if (!serviceType || !address || !city) {
        return res.status(400).json({ message: "Service type, address, and city are required" });
      }

      // Check if using free credit
      const useCredit = user.emergencyCreditsRemaining > 0;
      const serviceFee = useCredit ? 0 : 29.99;
      const fuelCost = serviceType === 'emergency_fuel' && fuelAmount ? fuelAmount * 1.50 : 0; // Example fuel pricing
      const subtotal = serviceFee + fuelCost;
      const gstAmount = subtotal * 0.05;
      const total = subtotal + gstAmount;

      const request = await storage.createServiceRequest({
        userId: user.id,
        vehicleId: vehicleId || null,
        serviceType,
        status: 'pending',
        address,
        city,
        latitude: latitude || null,
        longitude: longitude || null,
        notes: notes || null,
        fuelType: serviceType === 'emergency_fuel' ? fuelType : null,
        fuelAmount: serviceType === 'emergency_fuel' ? fuelAmount : null,
        serviceFee: serviceFee.toFixed(2),
        fuelCost: fuelCost.toFixed(2),
        gstAmount: gstAmount.toFixed(2),
        total: total.toFixed(2),
        creditUsed: useCredit,
        paymentStatus: 'pending',
      });

      // Deduct credit if used
      if (useCredit) {
        await storage.updateUserEmergencyAccess(user.id, {
          emergencyCreditsRemaining: user.emergencyCreditsRemaining - 1,
        });
      }

      res.json({ 
        success: true, 
        request,
        creditUsed: useCredit,
        message: useCredit 
          ? "Emergency service requested! Your free credit was applied." 
          : `Emergency service requested! Total: $${total.toFixed(2)} (incl. GST)`
      });
    } catch (error) {
      console.error("Create service request error:", error);
      res.status(500).json({ message: "Failed to create service request" });
    }
  });

  // ============================================
  // Ops: Emergency Service Requests Management
  // ============================================

  // Get all service requests (ops)
  app.get("/api/ops/emergency/requests", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status } = req.query;
      let requests;
      if (status === 'pending') {
        requests = await storage.getPendingServiceRequests();
      } else {
        requests = await storage.getAllServiceRequests();
      }

      // Enrich with user and vehicle info
      const enrichedRequests = await Promise.all(requests.map(async (r) => {
        const requestUser = await storage.getUser(r.userId);
        const vehicle = r.vehicleId ? await storage.getVehicle(r.vehicleId) : null;
        return {
          ...r,
          userName: requestUser?.name || 'Unknown',
          userEmail: requestUser?.email || '',
          userPhone: requestUser?.phone || '',
          vehicleInfo: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : null,
        };
      }));

      res.json({ requests: enrichedRequests });
    } catch (error) {
      console.error("Get all service requests error:", error);
      res.status(500).json({ message: "Failed to get service requests" });
    }
  });

  // Update service request status (ops)
  app.patch("/api/ops/emergency/requests/:id/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['pending', 'dispatched', 'en_route', 'on_site', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updated = await storage.updateServiceRequestStatus(id, status);
      res.json({ success: true, request: updated });
    } catch (error) {
      console.error("Update service request status error:", error);
      res.status(500).json({ message: "Failed to update service request status" });
    }
  });

  // ============================================
  // Fleet Management & TDG Fuel Tracking
  // ============================================

  // TDG Fuel Reference Info
  const TDG_FUEL_INFO = {
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

  // Get all trucks (owner/admin see all, operators see only their assigned truck)
  app.get("/api/ops/fleet/trucks", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (user.role === 'operator') {
        // Operators only see their assigned truck
        const truck = await storage.getTruckByDriver(user.id);
        const trucks = truck ? [truck] : [];
        
        // Enrich with driver info
        const enriched = await Promise.all(trucks.map(async (t) => {
          const driver = t.assignedDriverId ? await storage.getUser(t.assignedDriverId) : null;
          return {
            ...t,
            assignedDriverName: driver?.name || null,
            assignedDriverEmail: driver?.email || null,
          };
        }));
        
        return res.json({ trucks: enriched });
      }
      
      // Admin/owner see all trucks
      const allTrucks = await storage.getAllTrucks();
      
      // Enrich with driver info
      const enriched = await Promise.all(allTrucks.map(async (t) => {
        const driver = t.assignedDriverId ? await storage.getUser(t.assignedDriverId) : null;
        return {
          ...t,
          assignedDriverName: driver?.name || null,
          assignedDriverEmail: driver?.email || null,
        };
      }));
      
      res.json({ trucks: enriched });
    } catch (error) {
      console.error("Get trucks error:", error);
      res.status(500).json({ message: "Failed to get trucks" });
    }
  });

  // Get single truck
  app.get("/api/ops/fleet/trucks/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as any;
      
      const truck = await storage.getTruck(id);
      if (!truck) {
        return res.status(404).json({ message: "Truck not found" });
      }
      
      // Operators can only see their own truck
      if (user.role === 'operator' && truck.assignedDriverId !== user.id) {
        return res.status(403).json({ message: "Not authorized to view this truck" });
      }
      
      const driver = truck.assignedDriverId ? await storage.getUser(truck.assignedDriverId) : null;
      
      res.json({
        truck: {
          ...truck,
          assignedDriverName: driver?.name || null,
          assignedDriverEmail: driver?.email || null,
        }
      });
    } catch (error) {
      console.error("Get truck error:", error);
      res.status(500).json({ message: "Failed to get truck" });
    }
  });

  // Create truck (admin/owner only)
  app.post("/api/ops/fleet/trucks", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role === 'operator') {
        return res.status(403).json({ message: "Operators cannot create trucks" });
      }
      
      const truck = await storage.createTruck(req.body);
      res.json({ success: true, truck });
    } catch (error) {
      console.error("Create truck error:", error);
      res.status(500).json({ message: "Failed to create truck" });
    }
  });

  // Update truck (admin/owner only)
  app.patch("/api/ops/fleet/trucks/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role === 'operator') {
        return res.status(403).json({ message: "Operators cannot update trucks" });
      }
      
      const { id } = req.params;
      const truck = await storage.updateTruck(id, req.body);
      res.json({ success: true, truck });
    } catch (error) {
      console.error("Update truck error:", error);
      res.status(500).json({ message: "Failed to update truck" });
    }
  });

  // Delete truck (admin/owner only)
  app.delete("/api/ops/fleet/trucks/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role === 'operator') {
        return res.status(403).json({ message: "Operators cannot delete trucks" });
      }
      
      const { id } = req.params;
      await storage.deleteTruck(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete truck error:", error);
      res.status(500).json({ message: "Failed to delete truck" });
    }
  });

  // Record fuel fill (adding fuel to truck)
  app.post("/api/ops/fleet/trucks/:id/fill", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { fuelType, litres, notes } = req.body;
      const user = req.user as any;
      
      const truck = await storage.getTruck(id);
      if (!truck) {
        return res.status(404).json({ message: "Truck not found" });
      }
      
      // Operators can only fill their own truck
      if (user.role === 'operator' && truck.assignedDriverId !== user.id) {
        return res.status(403).json({ message: "Not authorized to fill this truck" });
      }
      
      // Get current level
      const currentLevel = fuelType === 'regular' ? parseFloat(truck.regularLevel || '0')
        : fuelType === 'premium' ? parseFloat(truck.premiumLevel || '0')
        : parseFloat(truck.dieselLevel || '0');
      
      const newLevel = currentLevel + parseFloat(litres);
      
      // Get TDG info for this fuel type
      const tdgInfo = TDG_FUEL_INFO[fuelType as keyof typeof TDG_FUEL_INFO];
      
      // Create transaction record
      const transaction = await storage.createTruckFuelTransaction({
        truckId: id,
        transactionType: 'fill',
        fuelType,
        litres: String(litres),
        previousLevel: String(currentLevel),
        newLevel: String(newLevel),
        unNumber: tdgInfo.unNumber,
        properShippingName: tdgInfo.properShippingName,
        dangerClass: tdgInfo.class,
        packingGroup: tdgInfo.packingGroup,
        operatorId: user.id,
        operatorName: user.name,
        notes,
      });
      
      // Update truck fuel level
      await storage.updateTruckFuelLevel(id, fuelType, newLevel);
      
      res.json({ success: true, transaction, newLevel });
    } catch (error) {
      console.error("Record fuel fill error:", error);
      res.status(500).json({ message: "Failed to record fuel fill" });
    }
  });

  // Record fuel dispense (selling fuel from truck)
  app.post("/api/ops/fleet/trucks/:id/dispense", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { fuelType, litres, orderId, deliveryAddress, deliveryCity, notes } = req.body;
      const user = req.user as any;
      
      const truck = await storage.getTruck(id);
      if (!truck) {
        return res.status(404).json({ message: "Truck not found" });
      }
      
      // Operators can only dispense from their own truck
      if (user.role === 'operator' && truck.assignedDriverId !== user.id) {
        return res.status(403).json({ message: "Not authorized to dispense from this truck" });
      }
      
      // Get current level
      const currentLevel = fuelType === 'regular' ? parseFloat(truck.regularLevel || '0')
        : fuelType === 'premium' ? parseFloat(truck.premiumLevel || '0')
        : parseFloat(truck.dieselLevel || '0');
      
      if (currentLevel < parseFloat(litres)) {
        return res.status(400).json({ message: `Insufficient ${fuelType} fuel on truck. Current: ${currentLevel}L, Requested: ${litres}L` });
      }
      
      const newLevel = currentLevel - parseFloat(litres);
      
      // Get TDG info for this fuel type
      const tdgInfo = TDG_FUEL_INFO[fuelType as keyof typeof TDG_FUEL_INFO];
      
      // Create transaction record
      const transaction = await storage.createTruckFuelTransaction({
        truckId: id,
        transactionType: 'dispense',
        fuelType,
        litres: String(-parseFloat(litres)), // Negative for dispense
        previousLevel: String(currentLevel),
        newLevel: String(newLevel),
        unNumber: tdgInfo.unNumber,
        properShippingName: tdgInfo.properShippingName,
        dangerClass: tdgInfo.class,
        packingGroup: tdgInfo.packingGroup,
        orderId,
        deliveryAddress,
        deliveryCity,
        operatorId: user.id,
        operatorName: user.name,
        notes,
      });
      
      // Update truck fuel level
      await storage.updateTruckFuelLevel(id, fuelType, newLevel);
      
      res.json({ success: true, transaction, newLevel });
    } catch (error) {
      console.error("Record fuel dispense error:", error);
      res.status(500).json({ message: "Failed to record fuel dispense" });
    }
  });

  // Get fuel transactions for a truck
  app.get("/api/ops/fleet/trucks/:id/transactions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { fuelType, startDate, endDate } = req.query;
      const user = req.user as any;
      
      const truck = await storage.getTruck(id);
      if (!truck) {
        return res.status(404).json({ message: "Truck not found" });
      }
      
      // Operators can only view their own truck
      if (user.role === 'operator' && truck.assignedDriverId !== user.id) {
        return res.status(403).json({ message: "Not authorized to view this truck's transactions" });
      }
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const transactions = await storage.getTruckFuelTransactions(
        id,
        fuelType as string | undefined,
        start,
        end
      );
      
      res.json({ transactions });
    } catch (error) {
      console.error("Get fuel transactions error:", error);
      res.status(500).json({ message: "Failed to get fuel transactions" });
    }
  });

  // Get all fuel transactions (admin/owner only - for reports)
  app.get("/api/ops/fleet/transactions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role === 'operator') {
        return res.status(403).json({ message: "Operators cannot view all transactions" });
      }
      
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const transactions = await storage.getAllTruckFuelTransactions(start, end);
      res.json({ transactions });
    } catch (error) {
      console.error("Get all fuel transactions error:", error);
      res.status(500).json({ message: "Failed to get all fuel transactions" });
    }
  });

  // Get TDG info for PDF generation
  app.get("/api/ops/fleet/tdg-info", requireAuth, requireAdmin, async (req, res) => {
    try {
      res.json({
        fuelInfo: TDG_FUEL_INFO,
        canutec: {
          name: "CANUTEC",
          phone: "1-888-226-8832",
          phoneAlternate: "*666 (cell)",
          available: "24/7",
          purpose: "Dangerous goods transportation emergencies",
        },
        emergencyContact: {
          name: "Levi Ernst",
          title: "Owner/Operator",
          company: "Prairie Mobile Fuel Services",
          email: "levi.ernst@prairiemobilefuel.ca",
          phone: "587-890-8982",
        },
      });
    } catch (error) {
      console.error("Get TDG info error:", error);
      res.status(500).json({ message: "Failed to get TDG info" });
    }
  });

  // Get routes by driver (for fleet view)
  app.get("/api/ops/fleet/driver-routes/:driverId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { driverId } = req.params;
      const user = req.user as any;
      
      // Operators can only see their own routes
      if (user.role === 'operator' && driverId !== user.id) {
        return res.status(403).json({ message: "Not authorized to view this driver's routes" });
      }
      
      const allRoutes = await storage.getAllRoutes();
      const driverRoutes = allRoutes.filter(r => r.driverId === driverId);
      
      // Get orders for each route
      const routesWithOrders = await Promise.all(driverRoutes.map(async (route) => {
        const routeOrders = await storage.getOrdersByRoute(route.id);
        return { route, orders: routeOrders };
      }));
      
      res.json({ routes: routesWithOrders });
    } catch (error) {
      console.error("Get driver routes error:", error);
      res.status(500).json({ message: "Failed to get driver routes" });
    }
  });

  // ==========================================
  // Pre-Trip Inspection Endpoints
  // ==========================================

  // Get today's inspection for a truck
  app.get("/api/ops/fleet/trucks/:id/pretrip/today", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const inspection = await storage.getTodayPreTripInspection(id, today, tomorrow);
      res.json({ inspection: inspection || null });
    } catch (error) {
      console.error("Get today's pre-trip inspection error:", error);
      res.status(500).json({ message: "Failed to get pre-trip inspection" });
    }
  });

  // Get all inspections for a truck
  app.get("/api/ops/fleet/trucks/:id/pretrip", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 30;
      const inspections = await storage.getPreTripInspections(id, limit);
      res.json({ inspections });
    } catch (error) {
      console.error("Get pre-trip inspections error:", error);
      res.status(500).json({ message: "Failed to get pre-trip inspections" });
    }
  });

  // Submit a new pre-trip inspection
  app.post("/api/ops/fleet/trucks/:id/pretrip", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id: truckId } = req.params;
      const user = req.user as any;
      
      const truck = await storage.getTruckById(truckId);
      if (!truck) {
        return res.status(404).json({ message: "Truck not found" });
      }

      const inspectionData = {
        truckId,
        driverId: user.id,
        inspectionDate: new Date(),
        ...req.body,
      };

      const inspection = await storage.createPreTripInspection(inspectionData);
      
      // Update truck fuel levels from inspection if provided
      if (req.body.regularFuelLevel !== undefined || 
          req.body.premiumFuelLevel !== undefined || 
          req.body.dieselFuelLevel !== undefined) {
        await storage.updateTruck(truckId, {
          regularLevel: req.body.regularFuelLevel?.toString() || truck.regularLevel,
          premiumLevel: req.body.premiumFuelLevel?.toString() || truck.premiumLevel,
          dieselLevel: req.body.dieselFuelLevel?.toString() || truck.dieselLevel,
        });
      }

      res.json({ inspection, message: "Pre-trip inspection submitted successfully" });
    } catch (error) {
      console.error("Create pre-trip inspection error:", error);
      res.status(500).json({ message: "Failed to create pre-trip inspection" });
    }
  });

  // Get daily pre-trip status for all trucks (for fleet page status icons)
  app.get("/api/ops/fleet/pretrip-status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const statuses = await storage.getAllTodayPreTripStatuses(today, tomorrow);
      res.json({ statuses });
    } catch (error) {
      console.error("Get pre-trip statuses error:", error);
      res.status(500).json({ message: "Failed to get pre-trip statuses" });
    }
  });

  return httpServer;
}
