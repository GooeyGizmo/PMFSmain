import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool, db } from "./db";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { insertUserSchema, insertVehicleSchema, insertOrderSchema, TDG_FUEL_INFO, orders, financialTransactions, pushSubscriptions, users } from "@shared/schema";
import { z } from "zod";
import { paymentService, calculateOrderPricing } from "./paymentService";
import { getStripePublishableKey, getUncachableStripeClient } from "./stripeClient";
import type Stripe from "stripe";
import { subscriptionService } from "./subscriptionService";
import { routeService } from "./routeService";
import { TIER_PRIORITY } from "@shared/schema";
import { sendOrderConfirmationEmail, sendDeliveryReceiptEmail, sendVerificationEmail, sendPaymentFailureEmail } from "./emailService";
import crypto from "crypto";
import { wsService } from "./websocket";
import { geocodingService } from "./geocodingService";
import { getNetMarginHistory, backfillNetMarginData, scheduleDailyNetMarginLogging } from "./netMarginService";
import { scheduleRecurringOrderProcessing, processRecurringSchedules } from "./recurringOrderService";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

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

// Middleware to require owner role (for launch mode control)
async function requireOwner(req: Request, res: Response, next: Function) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== 'owner') {
    return res.status(403).json({ message: "Owner access required" });
  }
  (req as any).user = user;
  next();
}

// Helper to check if app is in live mode
async function isLiveMode(): Promise<boolean> {
  const setting = await storage.getBusinessSetting('launchMode');
  return setting === 'live';
}

// Helper to check if address is already registered to another HOUSEHOLD/RURAL user
// Returns the user if found, null otherwise
async function checkAddressConflict(
  address: string, 
  city: string, 
  excludeUserId?: string
): Promise<{ hasConflict: boolean; conflictingTier?: string }> {
  // Only check for conflicts with HOUSEHOLD and RURAL tiers
  const protectedTiers = ['household', 'rural'];
  const allUsers = await storage.getAllUsers();
  
  // Normalize for comparison (lowercase, trim whitespace)
  const normalizedAddress = address.toLowerCase().trim();
  const normalizedCity = city.toLowerCase().trim();
  
  for (const user of allUsers) {
    // Skip the current user
    if (excludeUserId && user.id === excludeUserId) continue;
    
    // Only check users on HOUSEHOLD or RURAL tiers
    if (!protectedTiers.includes(user.subscriptionTier)) continue;
    
    // Check if address matches
    const userAddress = (user.defaultAddress || '').toLowerCase().trim();
    const userCity = (user.defaultCity || '').toLowerCase().trim();
    
    if (userAddress === normalizedAddress && userCity === normalizedCity) {
      return { hasConflict: true, conflictingTier: user.subscriptionTier };
    }
  }
  
  return { hasConflict: false };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Trust proxy - required for secure cookies when behind reverse proxy (custom domain, Replit deployment)
  // This ensures req.secure is true when the original request was HTTPS
  app.set('trust proxy', 1);
  
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
      
      // Check launch mode - if not live, restrict to @prairiemobilefuel.ca emails
      const liveMode = await isLiveMode();
      if (!liveMode) {
        const ALLOWED_DOMAIN = "@prairiemobilefuel.ca";
        const emailLower = data.email.toLowerCase();
        if (!emailLower.endsWith(ALLOWED_DOMAIN)) {
          return res.status(403).json({ 
            message: "Registration is currently closed. Please check back soon!" 
          });
        }
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

      // Generate verification token (expires in 24 hours)
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Create user with verification token
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
        role: isOwner ? "owner" : "user",
        emailVerified: false,
        verificationToken,
        verificationTokenExpires,
      });

      // Send verification email
      await sendVerificationEmail({
        email: user.email,
        name: user.name,
        verificationToken,
      });

      // Don't auto-login - require email verification first
      const { password, ...publicUser } = user;
      res.json({ 
        user: publicUser,
        message: "Please check your email to verify your account before logging in."
      });
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
        // Check launch mode - if not live, restrict to @prairiemobilefuel.ca emails
        const liveMode = await isLiveMode();
        if (!liveMode) {
          const ALLOWED_DOMAIN = "@prairiemobilefuel.ca";
          const emailLower = email.toLowerCase();
          if (!emailLower.endsWith(ALLOWED_DOMAIN)) {
            return res.status(403).json({ 
              message: "Login is currently restricted. Please check back soon!" 
            });
          }
        }
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check if email is verified
      if (!user.emailVerified) {
        return res.status(403).json({ 
          message: "Please verify your email before logging in. Check your inbox for the verification link.",
          needsVerification: true,
          email: user.email
        });
      }

      req.session.userId = user.id;

      const { password: _, ...publicUser } = user;
      res.json({ user: publicUser });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Verify email
  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ message: "Verification token required" });
      }

      const user = await storage.getUserByVerificationToken(token);
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired verification link" });
      }

      // Check if token is expired
      if (user.verificationTokenExpires && new Date() > user.verificationTokenExpires) {
        return res.status(400).json({ 
          message: "Verification link has expired. Please request a new one.",
          expired: true
        });
      }

      // Mark email as verified and clear token
      await storage.verifyUserEmail(user.id);

      res.json({ 
        success: true, 
        message: "Email verified successfully! You can now log in." 
      });
    } catch (error) {
      console.error("Verify email error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Resend verification email
  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if user exists or not
        return res.json({ message: "If an account exists with this email, a verification link has been sent." });
      }

      if (user.emailVerified) {
        return res.status(400).json({ message: "Email is already verified. You can log in." });
      }

      // Generate new token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await storage.updateUserVerificationToken(user.id, verificationToken, verificationTokenExpires);

      // Send verification email
      await sendVerificationEmail({
        email: user.email,
        name: user.name,
        verificationToken,
      });

      res.json({ message: "Verification email sent. Please check your inbox." });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to resend verification email" });
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
      const currentUser = await storage.getUser(req.session.userId!);
      
      // Check address uniqueness if user is on HOUSEHOLD/RURAL and changing address
      const protectedTiers = ['household', 'rural'];
      if (protectedTiers.includes(currentUser!.subscriptionTier)) {
        const newAddress = defaultAddress !== undefined ? defaultAddress : currentUser!.defaultAddress;
        const newCity = defaultCity !== undefined ? defaultCity : currentUser!.defaultCity;
        
        if (newAddress && newCity) {
          const { hasConflict } = await checkAddressConflict(newAddress, newCity, req.session.userId!);
          if (hasConflict) {
            return res.status(400).json({ 
              message: "This address is already registered to another premium subscription. Each address can only have one Household or Rural subscription." 
            });
          }
        }
      }
      
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
          
          const totalLitres = activeOrders.reduce((sum, o) => sum + parseFloat(o.fuelAmount?.toString() || '0'), 0);
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

      // VIP-only Sunday validation
      if (req.body.scheduledDate) {
        const scheduledDate = new Date(req.body.scheduledDate);
        if (scheduledDate.getDay() === 0 && user.subscriptionTier !== 'vip') {
          return res.status(400).json({ message: "Sunday deliveries are only available for VIP Fuel Concierge members" });
        }
      }

      const tierPriority = TIER_PRIORITY[user.subscriptionTier] || 4;
      
      // Server-side promo code validation before creating order
      let validatedPromoCode: any = null;
      let promoDiscountApplied = false;
      if (req.body.promoCodeId) {
        const promoCode = await storage.getPromoCode(req.body.promoCodeId);
        if (!promoCode) {
          return res.status(400).json({ message: "Invalid promo code" });
        }

        // Check if code is active
        if (!promoCode.isActive) {
          return res.status(400).json({ message: "This promo code is no longer active" });
        }

        // Check expiration
        if (promoCode.expiresAt && new Date(promoCode.expiresAt) < new Date()) {
          return res.status(400).json({ message: "This promo code has expired" });
        }

        // Check max uses
        if (promoCode.maxTotalUses && promoCode.currentUses >= promoCode.maxTotalUses) {
          return res.status(400).json({ message: "This promo code has reached its maximum uses" });
        }

        // Check tier eligibility
        const eligibleTiers = promoCode.eligibleTiers.split(',').map((t: string) => t.trim().toLowerCase());
        if (!eligibleTiers.includes('all') && !eligibleTiers.includes(user.subscriptionTier)) {
          return res.status(400).json({ message: "This promo code is not available for your subscription tier" });
        }

        // Option 4 guardrail: percentage_fuel promos require adminOverride
        // This protects margins by preventing fuel discounts unless explicitly approved
        if (promoCode.discountType === 'percentage_fuel' && !promoCode.adminOverride) {
          return res.status(400).json({ message: "This promo code is not currently available" });
        }

        // Check one-time use per user
        if (promoCode.oneTimePerUser) {
          const existingRedemption = await storage.getUserPromoRedemption(req.session.userId!, promoCode.id);
          if (existingRedemption) {
            return res.status(400).json({ message: "You have already used this promo code" });
          }
        }

        validatedPromoCode = promoCode;
        promoDiscountApplied = true;
      }

      const data = insertOrderSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });

      // If promo code is being used, create redemption FIRST to prevent race conditions
      // The unique constraint will block duplicate redemptions
      let promoRedemption: any = null;
      let discountAmountCents = 0;
      let usageIncremented = false;
      if (validatedPromoCode) {
        try {
          const tier = await storage.getSubscriptionTier(user.subscriptionTier);
          const tierFuelDiscount = tier?.fuelDiscount != null ? parseFloat(tier.fuelDiscount.toString()) : 0;
          const tierDeliveryFee = tier?.deliveryFee != null ? parseFloat(tier.deliveryFee.toString()) : 24.99;
          
          // Recalculate fuel subtotal server-side from order items (don't trust client)
          let serverCalculatedFuelSubtotal = 0;
          const orderItems = req.body.orderItems || [];
          if (Array.isArray(orderItems) && orderItems.length > 0) {
            for (const item of orderItems) {
              const litres = parseFloat(item.fuelAmount) || 0;
              const pricePerLitre = parseFloat(item.pricePerLitre) || 0;
              const fuelCost = litres * pricePerLitre;
              const itemTierDiscount = litres * tierFuelDiscount;
              serverCalculatedFuelSubtotal += (fuelCost - itemTierDiscount);
            }
          } else {
            // Fallback for single-vehicle orders
            const litres = parseFloat(data.fuelAmount) || 0;
            const pricePerLitre = parseFloat(data.pricePerLitre?.toString() || "0");
            const fuelCost = litres * pricePerLitre;
            const itemTierDiscount = litres * tierFuelDiscount;
            serverCalculatedFuelSubtotal = fuelCost - itemTierDiscount;
          }
          const orderSubtotalCents = Math.round(serverCalculatedFuelSubtotal * 100);
          
          // Check stackable flag - if promo is non-stackable and user has any tier benefit, reject
          const isStackable = validatedPromoCode.stackable;
          const hasTierBenefit = tierFuelDiscount > 0 || tierDeliveryFee === 0;
          if (!isStackable && hasTierBenefit) {
            return res.status(400).json({ 
              message: "This promo code cannot be combined with your subscription tier benefits" 
            });
          }
          
          // Check minimum order value
          const minimumOrderValue = validatedPromoCode.minimumOrderValue 
            ? parseFloat(validatedPromoCode.minimumOrderValue.toString()) 
            : null;
          if (minimumOrderValue && (orderSubtotalCents / 100) < minimumOrderValue) {
            return res.status(400).json({ 
              message: `This promo code requires a minimum order of $${minimumOrderValue.toFixed(2)}` 
            });
          }
          
          // Calculate discount based on discount type
          const discountType = validatedPromoCode.discountType;
          const discountValue = validatedPromoCode.discountValue 
            ? parseFloat(validatedPromoCode.discountValue.toString()) 
            : 0;
          const maximumDiscountCap = validatedPromoCode.maximumDiscountCap 
            ? parseFloat(validatedPromoCode.maximumDiscountCap.toString()) 
            : null;
          
          switch (discountType) {
            case "delivery_fee":
              // Delivery fee waiver - discount equals tier's delivery fee
              discountAmountCents = tier ? Math.round(parseFloat(tier.deliveryFee.toString()) * 100) : 0;
              break;
            case "percentage_fuel":
              // Percentage off fuel subtotal
              discountAmountCents = Math.round(orderSubtotalCents * (discountValue / 100));
              // Apply cap if set
              if (maximumDiscountCap) {
                discountAmountCents = Math.min(discountAmountCents, Math.round(maximumDiscountCap * 100));
              }
              break;
            case "flat_amount":
              // Fixed dollar amount off
              discountAmountCents = Math.round(discountValue * 100);
              // Don't exceed order subtotal
              discountAmountCents = Math.min(discountAmountCents, orderSubtotalCents);
              break;
            default:
              discountAmountCents = 0;
          }
          
          // Atomically increment usage count with guard for maxTotalUses
          usageIncremented = await storage.incrementPromoCodeUses(validatedPromoCode.id);
          if (!usageIncremented) {
            return res.status(400).json({ message: "This promo code has reached its maximum uses" });
          }
          
          // Record the redemption - this will fail on duplicate due to unique constraint
          promoRedemption = await storage.createPromoRedemption({
            userId: user.id,
            promoCodeId: validatedPromoCode.id,
            orderId: null, // Will be updated after order creation
            discountAmountCents,
            tierAtRedemption: user.subscriptionTier,
          });
        } catch (promoError: any) {
          // Rollback usage increment if redemption failed
          if (usageIncremented) {
            try {
              await storage.decrementPromoCodeUses(validatedPromoCode.id);
            } catch (rollbackError) {
              console.error("Failed to rollback promo code usage:", rollbackError);
            }
          }
          
          // Check for unique constraint violation (race condition)
          if (promoError?.code === '23505') {
            return res.status(409).json({ message: "You have already used this promo code" });
          }
          console.error("Promo code redemption error:", promoError);
          return res.status(500).json({ message: "Failed to apply promo code" });
        }
      }

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
      // Convert fuelAmount to string for decimal column at the database boundary
      const orderData = {
        ...data,
        fuelAmount: String(data.fuelAmount),
        tierPriority,
        latitude,
        longitude,
        promoCodeId: validatedPromoCode?.id || null,
      };

      let order;
      try {
        order = await storage.createOrder(orderData as any);
      } catch (orderError) {
        // Rollback promo code if order creation fails
        if (promoRedemption && validatedPromoCode) {
          try {
            await storage.deletePromoRedemption(promoRedemption.id);
            await storage.decrementPromoCodeUses(validatedPromoCode.id);
          } catch (rollbackError) {
            console.error("Failed to rollback promo code usage after order failure:", rollbackError);
          }
        }
        throw orderError;
      }
      
      // Update the promo redemption with the order ID if we created one
      if (promoRedemption) {
        try {
          await storage.updatePromoRedemption(promoRedemption.id, { orderId: order.id });
        } catch (updateError) {
          console.error("Failed to update promo redemption with order ID:", updateError);
        }
      }
      
      // Create order items if provided (for multi-vehicle orders)
      // NOTE: tierDiscount is ALWAYS 0 in Option 4 pricing model
      if (req.body.orderItems && Array.isArray(req.body.orderItems)) {
        try {
          const itemsData = req.body.orderItems.map((item: any) => ({
            orderId: order.id,
            vehicleId: item.vehicleId,
            fuelType: item.fuelType,
            fuelAmount: String(item.fuelAmount),
            fillToFull: item.fillToFull || false,
            pricePerLitre: item.pricePerLitre,
            tierDiscount: "0", // Always 0 in Option 4 model - no per-litre tier discounts
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

      // When confirming a scheduled order, validate pre-authorization first
      if (status === 'confirmed') {
        const existingOrder = await storage.getOrder(id);
        if (existingOrder && existingOrder.status === 'scheduled') {
          // Validate pre-auth before allowing confirmation
          const validationResult = await paymentService.validatePreAuthorization(id);
          
          if (!validationResult.valid) {
            // Only send failure email for actual payment failures (not pending or no_payment_intent)
            if (validationResult.status === 'failed') {
              const user = await storage.getUser(existingOrder.userId);
              if (user) {
                sendPaymentFailureEmail({
                  id: existingOrder.id,
                  userEmail: user.email,
                  userName: user.name,
                  scheduledDate: new Date(existingOrder.scheduledDate),
                  deliveryWindow: existingOrder.deliveryWindow,
                  address: existingOrder.address,
                  city: existingOrder.city,
                  total: existingOrder.total.toString(),
                }).catch(err => console.error("Payment failure email error:", err));
              }
              
              return res.status(400).json({ 
                message: `Cannot confirm order: ${validationResult.error || 'Payment authorization failed'}. Customer has been notified to update their payment method.`,
                paymentError: true,
                validationResult
              });
            } else if (validationResult.status === 'pending') {
              return res.status(400).json({ 
                message: 'Payment is still pending confirmation. Customer needs to complete payment before this order can be confirmed.',
                paymentPending: true,
                validationResult
              });
            } else if (validationResult.status === 'no_payment_intent') {
              return res.status(400).json({ 
                message: 'No payment authorization exists for this order. The order may need to be re-created or the customer needs to complete checkout.',
                noPaymentIntent: true,
                validationResult
              });
            }
          }
        }
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
            fuelAmount: parseFloat(order.fuelAmount?.toString() || '0'),
            actualLitresDelivered: parseFloat(order.actualLitresDelivered?.toString() || order.fuelAmount?.toString() || '0'),
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
            
            // Send push notification for order status updates
            const { sendOrderStatusUpdate } = await import("./pushService");
            sendOrderStatusUpdate(user.id, order.id, status, notificationMessage)
              .catch(err => console.error("Push notification error:", err));
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

  // Cancel order (admin only) - handles refund if payment was pre-authorized or captured
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

      const { getUncachableStripeClient } = await import('./stripeClient');
      const { ledgerService } = await import('./ledgerService');
      const { waterfallService } = await import('./waterfallService');
      const stripe = await getUncachableStripeClient();

      // Handle payment cancellation/refund based on payment status
      if (existingOrder.stripePaymentIntentId) {
        if (existingOrder.paymentStatus === 'preauthorized') {
          // Cancel pre-authorization
          try {
            await stripe.paymentIntents.cancel(existingOrder.stripePaymentIntentId);
            await storage.updateOrderPaymentInfo(id, { paymentStatus: 'cancelled' });
          } catch (stripeError) {
            console.error("Failed to cancel payment intent:", stripeError);
          }
        } else if (existingOrder.paymentStatus === 'captured') {
          // Issue full refund for captured payment
          try {
            const refund = await stripe.refunds.create({
              payment_intent: existingOrder.stripePaymentIntentId,
              reason: 'requested_by_customer',
            });

            // Find the original ledger entry for this order
            const originalEntry = await ledgerService.findByOrderId(id);
            
            if (originalEntry) {
              // Create reversal ledger entry
              await ledgerService.createDirectRefundEntry(
                originalEntry,
                refund.id,
                new Date()
              );

              // Reverse bucket allocations using the transaction IDs from original waterfall
              // These match the pattern used in paymentService.capturePayment
              const fuelReversal = await waterfallService.reverseTransaction(`order_fuel_${id}`);
              const deliveryReversal = await waterfallService.reverseTransaction(`order_delivery_${id}`);

              const fuelReversed = fuelReversal.allocations.length;
              const deliveryReversed = deliveryReversal.allocations.length;
              
              if (fuelReversed === 0 && deliveryReversed === 0) {
                console.warn(`No bucket allocations found to reverse for order ${id}`);
              }
            } else {
              console.warn(`No ledger entry found for order ${id}, refund issued but no ledger reversal`);
            }

            await storage.updateOrderPaymentInfo(id, { paymentStatus: 'refunded' });
          } catch (stripeError: any) {
            console.error("Failed to process refund:", stripeError);
            return res.status(500).json({ 
              message: `Failed to process refund: ${stripeError.message || 'Unknown error'}` 
            });
          }
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
          const totalLitres = activeOrders.reduce((sum, o) => sum + parseFloat(o.fuelAmount?.toString() || '0'), 0);
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
      
      // Also update the truck's last known location if user has an assigned truck
      const allTrucks = await storage.getAllTrucks();
      const assignedTruck = allTrucks.find(t => t.assignedDriverId === user.id);
      if (assignedTruck) {
        await storage.updateTruck(assignedTruck.id, {
          lastLatitude: lat.toString(),
          lastLongitude: lng.toString(),
          lastLocationUpdate: new Date(),
        });
      }
      
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
  // Push Notification Routes
  // ============================================

  // Get VAPID public key for push subscription
  app.get("/api/push/vapid-key", async (req, res) => {
    try {
      const { getVapidPublicKey } = await import("./pushService");
      const publicKey = await getVapidPublicKey();
      res.json({ publicKey });
    } catch (error) {
      console.error("Get VAPID key error:", error);
      res.status(500).json({ message: "Failed to get VAPID key" });
    }
  });

  // Subscribe to push notifications
  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const { subscription, userAgent } = req.body;
      
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription data" });
      }

      const { saveSubscription } = await import("./pushService");
      await saveSubscription(req.session.userId!, subscription, userAgent);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Push subscribe error:", error);
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  // Unsubscribe from push notifications
  app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
    try {
      const { endpoint } = req.body;
      
      if (!endpoint) {
        return res.status(400).json({ message: "Endpoint required" });
      }

      const { removeSubscription } = await import("./pushService");
      await removeSubscription(endpoint);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Push unsubscribe error:", error);
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });

  // Handle subscription change (from service worker)
  app.post("/api/push/resubscribe", async (req, res) => {
    try {
      const { oldEndpoint, newSubscription } = req.body;
      
      // Try to get user from session first
      let userId = req.session.userId;
      
      // If no session, try to look up userId from old endpoint
      if (!userId && oldEndpoint) {
        const { pushSubscriptions } = await import("@shared/schema");
        const { db } = await import("./db");
        const { eq } = await import("drizzle-orm");
        
        const oldSub = await db.select({ userId: pushSubscriptions.userId })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, oldEndpoint))
          .limit(1);
        
        if (oldSub.length > 0) {
          userId = oldSub[0].userId;
        }
      }
      
      const { removeSubscription, saveSubscription } = await import("./pushService");
      
      if (oldEndpoint) {
        await removeSubscription(oldEndpoint);
      }
      
      // Save new subscription if we have a userId
      if (userId && newSubscription?.endpoint && newSubscription?.keys) {
        await saveSubscription(userId, {
          endpoint: newSubscription.endpoint,
          keys: newSubscription.keys
        });
        res.json({ success: true });
      } else {
        res.json({ success: false, message: "Could not determine user for resubscription" });
      }
    } catch (error) {
      console.error("Push resubscribe error:", error);
      res.status(500).json({ message: "Failed to resubscribe" });
    }
  });

  // Get notification preferences
  app.get("/api/push/preferences", requireAuth, async (req, res) => {
    try {
      const { getUserPreferences } = await import("./pushService");
      const preferences = await getUserPreferences(req.session.userId!);
      res.json({ preferences });
    } catch (error) {
      console.error("Get preferences error:", error);
      res.status(500).json({ message: "Failed to get preferences" });
    }
  });

  // Update notification preferences
  app.put("/api/push/preferences", requireAuth, async (req, res) => {
    try {
      const { orderUpdates, promotionalOffers, deliveryReminders, paymentAlerts } = req.body;
      
      const { updateUserPreferences } = await import("./pushService");
      await updateUserPreferences(req.session.userId!, {
        orderUpdates,
        promotionalOffers,
        deliveryReminders,
        paymentAlerts
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Update preferences error:", error);
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // Admin: Send promotional notification to all users (or filtered)
  app.post("/api/ops/push/promotional", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { title, body, url, userIds } = req.body;
      
      if (!title || !body) {
        return res.status(400).json({ message: "Title and body are required" });
      }

      const { sendPromotionalNotification } = await import("./pushService");
      
      let targetUserIds = userIds;
      if (!targetUserIds || targetUserIds.length === 0) {
        // Send to all users with promotional notifications enabled
        const allUsers = await storage.getAllUsers();
        targetUserIds = allUsers.map((u: { id: string }) => u.id);
      }
      
      const result = await sendPromotionalNotification(targetUserIds, title, body, url);
      
      res.json({ 
        success: true, 
        sent: result.totalSent,
        sentCount: result.totalSent,
        failed: result.totalFailed,
        targetCount: targetUserIds.length
      });
    } catch (error) {
      console.error("Send promotional error:", error);
      res.status(500).json({ message: "Failed to send promotional notifications" });
    }
  });

  // Admin: Get push notification stats
  app.get("/api/ops/push/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const subs = await db.select().from(pushSubscriptions);
      
      res.json({
        totalSubscribers: subs.length,
        activeSubscribers: subs.length,
      });
    } catch (error) {
      console.error("Push stats error:", error);
      res.status(500).json({ message: "Failed to get push stats" });
    }
  });

  // Admin: Get push notification subscribers list
  app.get("/api/ops/push/subscribers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const subs = await db
        .select({
          id: pushSubscriptions.id,
          userId: pushSubscriptions.userId,
          createdAt: pushSubscriptions.createdAt,
          userEmail: users.email,
          userName: users.firstName,
        })
        .from(pushSubscriptions)
        .leftJoin(users, eq(pushSubscriptions.userId, users.id))
        .orderBy(desc(pushSubscriptions.createdAt));
      
      res.json({ subscribers: subs });
    } catch (error) {
      console.error("Push subscribers error:", error);
      res.status(500).json({ message: "Failed to get subscribers" });
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
        litres: parseFloat(order.fuelAmount?.toString() || '0'),
        pricePerLitre,
        tierDiscount,
        deliveryFee,
        description: `Fuel delivery - ${order.fuelAmount}L ${order.fuelType}`,
        fuelType: order.fuelType,
        fillToFull: order.fillToFull,
      });

      // Note: Order stays at 'scheduled' until customer confirms payment on frontend.
      // The frontend will call confirmPayment, which moves PaymentIntent to requires_capture.
      // Then confirm-payment-success endpoint can promote to 'confirmed' status.
      
      res.json({ paymentIntentId, clientSecret });
    } catch (error) {
      console.error("Create payment intent error:", error);
      res.status(500).json({ message: "Failed to create payment intent" });
    }
  });

  // Confirm payment success after customer confirms on Stripe Elements
  app.post("/api/orders/:id/confirm-payment-success", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getOrder(id);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!order.stripePaymentIntentId) {
        return res.status(400).json({ message: "No payment intent found" });
      }

      // Check PaymentIntent status in Stripe
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);

      if (paymentIntent.status === 'requires_capture') {
        // Payment was successfully pre-authorized - update order to confirmed
        const user = await storage.getUser(order.userId);
        
        await storage.updateOrderStatus(id, 'confirmed');
        await storage.updateOrderPaymentInfo(id, { paymentStatus: 'preauthorized' });
        
        const updatedOrder = await storage.getOrder(id);
        if (updatedOrder) {
          wsService.notifyOrderUpdate(updatedOrder);
        }

        // Send confirmation email
        if (user) {
          sendOrderConfirmationEmail({
            id: order.id,
            userEmail: user.email,
            userName: user.name,
            scheduledDate: new Date(order.scheduledDate),
            deliveryWindow: order.deliveryWindow,
            address: order.address,
            city: order.city,
            fuelType: order.fuelType,
            fuelAmount: parseFloat(order.fuelAmount?.toString() || '0'),
            fillToFull: order.fillToFull,
            total: order.total.toString(),
          }).catch(err => console.error("Email send error:", err));
        }

        res.json({ success: true, status: 'confirmed' });
      } else if (paymentIntent.status === 'succeeded') {
        // Already captured (shouldn't happen for pre-auth but handle it)
        res.json({ success: true, status: 'captured' });
      } else {
        // Payment not confirmed yet
        res.json({ 
          success: false, 
          status: paymentIntent.status,
          message: 'Payment not yet confirmed. Please complete payment to confirm your order.'
        });
      }
    } catch (error) {
      console.error("Confirm payment success error:", error);
      res.status(500).json({ success: false, message: "Failed to confirm payment" });
    }
  });

  // Validate pre-authorization for an order (admin only)
  app.post("/api/orders/:id/validate-payment", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getOrder(id);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const result = await paymentService.validatePreAuthorization(id);
      
      // If validation failed, send email to customer
      if (!result.valid && result.status === 'failed') {
        const user = await storage.getUser(order.userId);
        if (user) {
          sendPaymentFailureEmail({
            id: order.id,
            userEmail: user.email,
            userName: user.name,
            scheduledDate: new Date(order.scheduledDate),
            deliveryWindow: order.deliveryWindow,
            address: order.address,
            city: order.city,
            total: order.total.toString(),
          }).catch(err => console.error("Payment failure email error:", err));
        }
      }

      // If validation succeeded, update order status to confirmed
      if (result.valid && order.status === 'scheduled') {
        await storage.updateOrderStatus(id, 'confirmed');
        const updatedOrder = await storage.getOrder(id);
        if (updatedOrder) {
          wsService.notifyOrderUpdate(updatedOrder);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Validate payment error:", error);
      res.status(500).json({ message: "Failed to validate payment", valid: false, status: 'failed' });
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
        
        // Record this in the Hall of Shame
        const currentUser = await getCurrentUser(req);
        if (currentUser?.id) {
          try {
            await storage.createShameEvent({
              userId: currentUser.id,
              messageShown: `Attempted to capture $0.00 for order ${id} with ${actualLitresDelivered}L`,
              orderId: id,
            });
            console.log(`[Hall of Shame] Recorded $0 capture attempt by ${currentUser.name || currentUser.email}`);
          } catch (e) {
            console.error("[Hall of Shame] Failed to record shame event:", e);
          }
        }
        
        return res.status(400).json({ 
          message: "Cannot capture payment for 0 litres. If no fuel was delivered, cancel the order instead.",
          blocked: true,
          shameRecorded: true,
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
        
        // Record to ledger immediately after successful capture (direct recording)
        if (order && order.stripePaymentIntentId) {
          try {
            const { ledgerService } = await import('./ledgerService');
            const stripe = await getUncachableStripeClient();
            
            // Fetch the payment intent to get charge details
            const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId, {
              expand: ['latest_charge.balance_transaction'],
            });
            
            const charge = paymentIntent.latest_charge as Stripe.Charge | null;
            if (charge && charge.status === 'succeeded') {
              const balanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction | null;
              
              // Use charge ID for idempotency to match webhook behavior
              const idempotencyKey = `direct:charge:${charge.id}`;
              
              const existing = await ledgerService.checkIdempotency(idempotencyKey);
              if (!existing) {
                const grossCents = charge.amount;
                const stripeFee = balanceTransaction?.fee || 0;
                const netCents = balanceTransaction?.net || (grossCents - stripeFee);
                
                // Calculate GST from order data (more accurate than estimating)
                const gstCents = order.finalGstAmount 
                  ? Math.round(parseFloat(order.finalGstAmount.toString()) * 100)
                  : Math.round(grossCents * 5 / 105); // fallback to 5% estimate
                
                const preTaxRevenue = grossCents - gstCents;
                
                await ledgerService.createEntry({
                  eventDate: new Date(),
                  source: 'stripe',
                  sourceType: 'charge',
                  sourceId: charge.id,
                  stripeEventId: null,
                  idempotencyKey,
                  chargeId: charge.id,
                  paymentIntentId: order.stripePaymentIntentId,
                  stripeCustomerId: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || null,
                  userId: order.userId,
                  orderId: order.id,
                  description: `Fuel delivery - ${order.address}, ${order.city}`,
                  category: 'fuel_delivery',
                  currency: charge.currency || 'cad',
                  grossAmountCents: grossCents,
                  netAmountCents: netCents,
                  stripeFeeCents: stripeFee,
                  gstCollectedCents: gstCents,
                  gstPaidCents: 0,
                  gstNeedsReview: false,
                  revenueSubscriptionCents: 0,
                  revenueFuelCents: preTaxRevenue,
                  revenueOtherCents: 0,
                  cogsFuelCents: 0,
                  expenseOtherCents: 0,
                  isReversal: false,
                  reversesEntryId: null,
                });
              }
            }
          } catch (ledgerError: any) {
            // Log but don't fail the capture - ledger is secondary to payment
            console.error('[Ledger] Failed to record capture:', ledgerError?.message || ledgerError);
            if (ledgerError?.code === 'RECONCILIATION_FAILED') {
              console.error('[Ledger] Reconciliation details - expected:', ledgerError.expected, 'actual:', ledgerError.actual);
            }
          }
        }
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
              : parseFloat(item.actualLitresDelivered?.toString() || item.fuelAmount?.toString() || '0');
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
        await storage.updateOrder(id, { actualLitresDelivered: actualLitresDelivered.toString() });
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
      
      // ============================================
      // Deduct fuel from assigned truck and log TDG transactions
      // ============================================
      if (order && order.routeId) {
        try {
          const route = await storage.getRoute(order.routeId);
          if (route && route.truckId) {
            const truck = await storage.getTruck(route.truckId);
            if (truck) {
              // Get the operator name (driver from route or current user)
              const operatorId = route.driverId || (req as any).user?.id;
              const operatorName = route.driverName || (req as any).user?.name || 'System';
              
              // Collect fuel amounts by type from order items or single order
              const fuelAmounts: Record<string, number> = {};
              const orderItemsList = await storage.getOrderItems(id);
              
              if (orderItemsList.length > 0) {
                // Multi-vehicle order: group by fuel type
                for (const item of orderItemsList) {
                  const fuelType = item.fuelType as 'regular' | 'premium' | 'diesel';
                  const litres = (itemActuals && itemActuals[item.id]) 
                    ? itemActuals[item.id] 
                    : parseFloat(item.actualLitresDelivered?.toString() || item.fuelAmount?.toString() || '0');
                  fuelAmounts[fuelType] = (fuelAmounts[fuelType] || 0) + litres;
                }
              } else {
                // Single vehicle order
                const fuelType = order.fuelType as 'regular' | 'premium' | 'diesel';
                fuelAmounts[fuelType] = actualLitresDelivered;
              }
              
              // Deduct each fuel type from truck and create transaction records
              for (const [fuelType, litres] of Object.entries(fuelAmounts)) {
                if (litres <= 0) continue;
                
                const typedFuelType = fuelType as 'regular' | 'premium' | 'diesel';
                const tdgInfo = TDG_FUEL_INFO[typedFuelType];
                
                // Get current level based on fuel type
                let currentLevel = 0;
                if (typedFuelType === 'regular') {
                  currentLevel = parseFloat(truck.regularLevel?.toString() || '0');
                } else if (typedFuelType === 'premium') {
                  currentLevel = parseFloat(truck.premiumLevel?.toString() || '0');
                } else if (typedFuelType === 'diesel') {
                  currentLevel = parseFloat(truck.dieselLevel?.toString() || '0');
                }
                
                const newLevel = Math.max(0, currentLevel - litres);
                
                // Update truck fuel level
                await storage.updateTruckFuelLevel(truck.id, typedFuelType, newLevel);
                
                // Create dispense transaction in TDG log
                await storage.createTruckFuelTransaction({
                  truckId: truck.id,
                  transactionType: 'dispense',
                  fuelType: typedFuelType,
                  litres: (-litres).toString(), // negative for dispense
                  previousLevel: currentLevel.toString(),
                  newLevel: newLevel.toString(),
                  unNumber: tdgInfo.unNumber,
                  properShippingName: tdgInfo.properShippingName,
                  dangerClass: tdgInfo.class,
                  packingGroup: tdgInfo.packingGroup,
                  deliveryAddress: order.address,
                  deliveryCity: order.city,
                  orderId: order.id,
                  operatorId,
                  operatorName,
                  notes: `Delivery for order #${order.id.slice(0, 8)}`,
                });
                
                // Also log to main fuel inventory for tracking sales/deliveries
                await storage.updateFuelInventory(
                  typedFuelType,
                  -litres, // negative for delivery/sale
                  'delivery',
                  order.id,
                  `Order #${order.id.slice(0, 8).toUpperCase()} - ${order.address}, ${order.city}`,
                  operatorId
                );
              }
              
            }
          }
        } catch (fuelError) {
          // Log error but don't fail the capture - fuel tracking is secondary
          console.error("Error deducting fuel from truck:", fuelError);
        }
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
            fuelAmount: parseFloat(order.fuelAmount?.toString() || '0'),
            actualLitresDelivered: parseFloat(order.actualLitresDelivered?.toString() || actualLitresDelivered?.toString() || '0'),
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

      // Check address uniqueness if upgrading to HOUSEHOLD or RURAL
      const protectedTiers = ['household', 'rural'];
      if (protectedTiers.includes(tierId)) {
        const user = await storage.getUser(req.session.userId!);
        if (user?.defaultAddress && user?.defaultCity) {
          const { hasConflict } = await checkAddressConflict(user.defaultAddress, user.defaultCity, req.session.userId!);
          if (hasConflict) {
            return res.status(400).json({ 
              message: "Your registered address is already associated with another Household or Rural subscription. Please update your profile address before upgrading." 
            });
          }
        }
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

      // Check address uniqueness if upgrading to HOUSEHOLD or RURAL
      const protectedTiers = ['household', 'rural'];
      if (protectedTiers.includes(tierId)) {
        const user = await storage.getUser(req.session.userId!);
        if (user?.defaultAddress && user?.defaultCity) {
          const { hasConflict } = await checkAddressConflict(user.defaultAddress, user.defaultCity, req.session.userId!);
          if (hasConflict) {
            return res.status(400).json({ 
              message: "Your registered address is already associated with another Household or Rural subscription. Please update your profile address before upgrading." 
            });
          }
        }
      }

      const result = await subscriptionService.changeSubscriptionTier(req.session.userId!, tierId);
      const user = await storage.getUser(req.session.userId!);
      res.json({ user, clientSecret: result.clientSecret });
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
  // Promo Code Routes
  // ============================================

  // Validate a promo code (customer use)
  app.post("/api/promo-codes/validate", requireAuth, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ valid: false, message: "Promo code is required" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ valid: false, message: "User not found" });
      }

      const promoCode = await storage.getPromoCodeByCode(code);
      if (!promoCode) {
        return res.status(404).json({ valid: false, message: "Promo code not found" });
      }

      // Check if code is active
      if (!promoCode.isActive) {
        return res.json({ valid: false, message: "This promo code is no longer active" });
      }

      // Check expiration
      if (promoCode.expiresAt && new Date(promoCode.expiresAt) < new Date()) {
        return res.json({ valid: false, message: "This promo code has expired" });
      }

      // Check max uses
      if (promoCode.maxTotalUses && promoCode.currentUses >= promoCode.maxTotalUses) {
        return res.json({ valid: false, message: "This promo code has reached its maximum uses" });
      }

      // Check tier eligibility
      const eligibleTiers = promoCode.eligibleTiers.split(',').map(t => t.trim().toLowerCase());
      if (!eligibleTiers.includes('all') && !eligibleTiers.includes(user.subscriptionTier)) {
        return res.json({ valid: false, message: "This promo code is not available for your subscription tier" });
      }

      // Check one-time use per user
      if (promoCode.oneTimePerUser) {
        const existingRedemption = await storage.getUserPromoRedemption(req.session.userId!, promoCode.id);
        if (existingRedemption) {
          return res.json({ valid: false, message: "You have already used this promo code" });
        }
      }

      // Get tier info for delivery fee
      const tier = await storage.getSubscriptionTier(user.subscriptionTier);
      
      // Build discount description and prepare response based on discount type
      let discountDescription = "";
      const discountType = promoCode.discountType;
      const discountValue = promoCode.discountValue ? parseFloat(promoCode.discountValue.toString()) : 0;
      const minimumOrderValue = promoCode.minimumOrderValue ? parseFloat(promoCode.minimumOrderValue.toString()) : null;
      const maximumDiscountCap = promoCode.maximumDiscountCap ? parseFloat(promoCode.maximumDiscountCap.toString()) : null;
      const stackable = promoCode.stackable;

      switch (discountType) {
        case "delivery_fee":
          discountDescription = "Free delivery";
          break;
        case "percentage_fuel":
          discountDescription = `${discountValue}% off fuel`;
          if (maximumDiscountCap) {
            discountDescription += ` (max $${maximumDiscountCap.toFixed(2)})`;
          }
          break;
        case "flat_amount":
          discountDescription = `$${discountValue.toFixed(2)} off`;
          break;
        default:
          discountDescription = "Discount applied";
      }

      res.json({
        valid: true,
        promoCode: {
          id: promoCode.id,
          code: promoCode.code,
          description: promoCode.description,
          discountType,
          discountValue,
          minimumOrderValue,
          maximumDiscountCap,
          stackable,
        },
        discountDescription,
        deliveryFeeCents: tier ? Math.round(parseFloat(tier.deliveryFee.toString()) * 100) : 0,
      });
    } catch (error) {
      console.error("Validate promo code error:", error);
      res.status(500).json({ valid: false, message: "Failed to validate promo code" });
    }
  });

  // Get all promo codes (owner only)
  app.get("/api/ops/promo-codes", requireAuth, requireOwner, async (req, res) => {
    try {
      const codes = await storage.getAllPromoCodes();
      
      // Get redemption counts for each code
      const codesWithStats = await Promise.all(codes.map(async (code) => {
        const redemptions = await storage.getPromoRedemptionsByCode(code.id);
        return { ...code, redemptions };
      }));
      
      res.json({ promoCodes: codesWithStats });
    } catch (error) {
      console.error("Get promo codes error:", error);
      res.status(500).json({ message: "Failed to get promo codes" });
    }
  });

  // Create a promo code (owner only)
  app.post("/api/ops/promo-codes", requireAuth, requireOwner, async (req, res) => {
    try {
      const { code, description, eligibleTiers, maxTotalUses, oneTimePerUser, expiresAt } = req.body;
      
      if (!code) {
        return res.status(400).json({ message: "Promo code is required" });
      }

      // Check if code already exists
      const existing = await storage.getPromoCodeByCode(code);
      if (existing) {
        return res.status(400).json({ message: "A promo code with this name already exists" });
      }

      const promoCode = await storage.createPromoCode({
        code: code.toUpperCase().trim(),
        description,
        discountType: "delivery_fee",
        eligibleTiers: eligibleTiers || "payg,access",
        maxTotalUses: maxTotalUses || null,
        oneTimePerUser: oneTimePerUser !== false,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
        createdBy: req.session.userId,
      });

      res.json({ promoCode });
    } catch (error) {
      console.error("Create promo code error:", error);
      res.status(500).json({ message: "Failed to create promo code" });
    }
  });

  // Update a promo code (owner only)
  app.patch("/api/ops/promo-codes/:id", requireAuth, requireOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { description, eligibleTiers, maxTotalUses, oneTimePerUser, expiresAt, isActive } = req.body;

      const existing = await storage.getPromoCode(id);
      if (!existing) {
        return res.status(404).json({ message: "Promo code not found" });
      }

      const updateData: any = {};
      if (description !== undefined) updateData.description = description;
      if (eligibleTiers !== undefined) updateData.eligibleTiers = eligibleTiers;
      if (maxTotalUses !== undefined) updateData.maxTotalUses = maxTotalUses;
      if (oneTimePerUser !== undefined) updateData.oneTimePerUser = oneTimePerUser;
      if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (isActive !== undefined) updateData.isActive = isActive;

      const promoCode = await storage.updatePromoCode(id, updateData);
      res.json({ promoCode });
    } catch (error) {
      console.error("Update promo code error:", error);
      res.status(500).json({ message: "Failed to update promo code" });
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
      const { vehicleId, frequency, dayOfWeek, dayOfMonth, preferredWindow, fuelType, fuelAmount, fillToFull } = req.body;
      
      const vehicle = await storage.getVehicle(vehicleId);
      if (!vehicle || vehicle.userId !== req.session.userId) {
        return res.status(403).json({ message: "Vehicle not found or not owned by user" });
      }

      // Validate fuelType
      const validFuelTypes = ['regular', 'premium', 'diesel'];
      const resolvedFuelType = fuelType || vehicle.fuelType || 'regular';
      if (!validFuelTypes.includes(resolvedFuelType)) {
        return res.status(400).json({ message: "Invalid fuel type. Must be regular, premium, or diesel." });
      }

      // Validate fuelAmount
      const parsedAmount = parseFloat(fuelAmount);
      if (isNaN(parsedAmount) || parsedAmount < 0 || parsedAmount > 500) {
        return res.status(400).json({ message: "Invalid fuel amount." });
      }

      const schedule = await storage.createRecurringSchedule({
        userId: req.session.userId!,
        vehicleId,
        frequency,
        dayOfWeek: dayOfWeek !== undefined ? parseInt(dayOfWeek) : null,
        dayOfMonth: dayOfMonth !== undefined ? parseInt(dayOfMonth) : null,
        preferredWindow: preferredWindow || "9:00 AM - 12:00 PM",
        fuelType: resolvedFuelType,
        fuelAmount: parsedAmount.toString(),
        fillToFull: fillToFull || false,
        active: true,
      });

      // Create the first order immediately
      const { createFirstOrderFromSchedule } = await import('./recurringOrderService');
      const orderResult = await createFirstOrderFromSchedule(schedule);
      
      if (!orderResult.success) {
        console.warn(`[RecurringSchedule] First order creation failed: ${orderResult.error}`);
      }

      res.json({ schedule, firstOrder: orderResult });
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
  // Launch Mode Routes (Owner Only)
  // ============================================

  // Get launch mode status
  app.get("/api/ops/launch-mode", requireAuth, requireAdmin, async (req, res) => {
    try {
      const launchMode = await storage.getBusinessSetting('launchMode') || 'test';
      const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
      res.json({ 
        launchMode,
        isLive: launchMode === 'live',
        stripeMode: isProduction ? 'live' : 'test',
        environment: isProduction ? 'production' : 'development'
      });
    } catch (error) {
      console.error("Get launch mode error:", error);
      res.status(500).json({ message: "Failed to get launch mode" });
    }
  });

  // Set launch mode (owner only)
  app.post("/api/ops/launch-mode", requireAuth, requireOwner, async (req, res) => {
    try {
      const { mode } = req.body;
      if (!['live', 'test'].includes(mode)) {
        return res.status(400).json({ message: "Invalid mode. Use 'live' or 'test'" });
      }
      
      const user = await getCurrentUser(req);
      await storage.setBusinessSetting('launchMode', mode, user?.id);
      
      const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
      res.json({ 
        success: true, 
        launchMode: mode,
        isLive: mode === 'live',
        stripeMode: isProduction ? 'live' : 'test',
        message: mode === 'live' 
          ? 'App is now LIVE! Public registration and login are enabled.'
          : 'App is in TEST mode. Only @prairiemobilefuel.ca emails can register/login.'
      });
    } catch (error) {
      console.error("Set launch mode error:", error);
      res.status(500).json({ message: "Failed to set launch mode" });
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
          fuelTypeBreakdown[fuelType].litres += parseFloat(item.fuelAmount?.toString() || '0');
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
      const dieselPricing = pricing?.find(p => p.fuelType === 'diesel');
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
  // Net Margin Analytics Routes
  // ============================================

  // Get net margin history for charts
  app.get("/api/ops/analytics/net-margin", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { period = 'monthly', year } = req.query;
      const validPeriods = ['daily', 'weekly', 'monthly', 'yearly', 'all'];
      
      if (!validPeriods.includes(period as string)) {
        return res.status(400).json({ message: "Invalid period. Use: daily, weekly, monthly, yearly, or all" });
      }
      
      const yearNum = year ? parseInt(year as string) : undefined;
      const data = await getNetMarginHistory(period as any, yearNum);
      
      res.json({ 
        period, 
        year: yearNum,
        data,
        businessStartDate: '2025-12-23',
      });
    } catch (error) {
      console.error("Get net margin history error:", error);
      res.status(500).json({ message: "Failed to get net margin history" });
    }
  });

  // Trigger backfill of net margin data (admin only)
  app.post("/api/ops/analytics/net-margin/backfill", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await backfillNetMarginData();
      res.json({ 
        message: `Backfilled ${result.backfilledDays} days of net margin data`,
        ...result 
      });
    } catch (error) {
      console.error("Backfill net margin data error:", error);
      res.status(500).json({ message: "Failed to backfill net margin data" });
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

  // Drain fuel from truck (removes from truck sellable fuel AND total inventory)
  app.post("/api/ops/fleet/trucks/:id/drain", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { fuelType, litres, notes } = req.body;
      const user = req.user as any;
      
      const truck = await storage.getTruck(id);
      if (!truck) {
        return res.status(404).json({ message: "Truck not found" });
      }
      
      // Operators can only drain from their own truck
      if (user.role === 'operator' && truck.assignedDriverId !== user.id) {
        return res.status(403).json({ message: "Not authorized to drain from this truck" });
      }
      
      // Get current truck level
      const currentLevel = fuelType === 'regular' ? parseFloat(truck.regularLevel || '0')
        : fuelType === 'premium' ? parseFloat(truck.premiumLevel || '0')
        : parseFloat(truck.dieselLevel || '0');
      
      const drainAmount = parseFloat(litres);
      
      if (currentLevel < drainAmount) {
        return res.status(400).json({ message: `Insufficient ${fuelType} fuel on truck. Current: ${currentLevel}L, Requested: ${drainAmount}L` });
      }
      
      const newLevel = currentLevel - drainAmount;
      
      // Get TDG info for this fuel type
      const tdgInfo = TDG_FUEL_INFO[fuelType as keyof typeof TDG_FUEL_INFO];
      
      // Create transaction record for the truck
      const transaction = await storage.createTruckFuelTransaction({
        truckId: id,
        transactionType: 'adjustment',
        fuelType,
        litres: String(-drainAmount), // Negative for removal
        previousLevel: String(currentLevel),
        newLevel: String(newLevel),
        unNumber: tdgInfo.unNumber,
        properShippingName: tdgInfo.properShippingName,
        dangerClass: tdgInfo.class,
        packingGroup: tdgInfo.packingGroup,
        operatorId: user.id,
        operatorName: user.name,
        notes: notes || 'Fuel drained from truck',
      });
      
      // Update truck fuel level
      await storage.updateTruckFuelLevel(id, fuelType, newLevel);
      
      // Also subtract from total fuel inventory via updateFuelInventory
      // This method handles the stock update and returns the transaction
      const inventoryTransaction = await storage.updateFuelInventory(
        fuelType,
        -drainAmount, // Negative to reduce stock
        'adjustment',
        undefined,
        `Drained from truck ${truck.unitNumber}: ${notes || 'No notes'}`,
        user.id,
        '0'
      );
      
      // Get the actual updated inventory level after the transaction
      const updatedInventory = await storage.getFuelInventoryByType(fuelType);
      const newInventoryLevel = parseFloat(updatedInventory?.currentStock || '0');
      
      res.json({ success: true, transaction, newLevel, inventoryNewLevel: newInventoryLevel });
    } catch (error) {
      console.error("Drain fuel error:", error);
      res.status(500).json({ message: "Failed to drain fuel" });
    }
  });

  // Empty all fuel from truck (sets all fuel levels to 0)
  app.post("/api/ops/fleet/trucks/:id/empty", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as any;
      
      const truck = await storage.getTruck(id);
      if (!truck) {
        return res.status(404).json({ message: "Truck not found" });
      }
      
      const regularLevel = parseFloat(truck.regularLevel || '0');
      const premiumLevel = parseFloat(truck.premiumLevel || '0');
      const dieselLevel = parseFloat(truck.dieselLevel || '0');
      const totalFuel = regularLevel + premiumLevel + dieselLevel;
      
      if (totalFuel === 0) {
        return res.status(400).json({ message: "Truck already has no fuel" });
      }
      
      // Create drain transactions for each fuel type that has fuel
      const transactions = [];
      
      if (regularLevel > 0) {
        const tdgInfo = TDG_FUEL_INFO['regular'];
        const txn = await storage.createTruckFuelTransaction({
          truckId: id,
          transactionType: 'ops_empty',
          fuelType: 'regular',
          litres: String(-regularLevel),
          previousLevel: String(regularLevel),
          newLevel: '0',
          unNumber: tdgInfo.unNumber,
          properShippingName: tdgInfo.properShippingName,
          dangerClass: tdgInfo.class,
          packingGroup: tdgInfo.packingGroup,
          operatorId: user.id,
          operatorName: user.name,
          notes: 'Emptied truck - all fuel removed',
        });
        transactions.push(txn);
        await storage.updateTruckFuelLevel(id, 'regular', 0);
        await storage.updateFuelInventory('regular', -regularLevel, 'adjustment', undefined, `Emptied truck ${truck.unitNumber}`, user.id, '0');
      }
      
      if (premiumLevel > 0) {
        const tdgInfo = TDG_FUEL_INFO['premium'];
        const txn = await storage.createTruckFuelTransaction({
          truckId: id,
          transactionType: 'ops_empty',
          fuelType: 'premium',
          litres: String(-premiumLevel),
          previousLevel: String(premiumLevel),
          newLevel: '0',
          unNumber: tdgInfo.unNumber,
          properShippingName: tdgInfo.properShippingName,
          dangerClass: tdgInfo.class,
          packingGroup: tdgInfo.packingGroup,
          operatorId: user.id,
          operatorName: user.name,
          notes: 'Emptied truck - all fuel removed',
        });
        transactions.push(txn);
        await storage.updateTruckFuelLevel(id, 'premium', 0);
        await storage.updateFuelInventory('premium', -premiumLevel, 'adjustment', undefined, `Emptied truck ${truck.unitNumber}`, user.id, '0');
      }
      
      if (dieselLevel > 0) {
        const tdgInfo = TDG_FUEL_INFO['diesel'];
        const txn = await storage.createTruckFuelTransaction({
          truckId: id,
          transactionType: 'ops_empty',
          fuelType: 'diesel',
          litres: String(-dieselLevel),
          previousLevel: String(dieselLevel),
          newLevel: '0',
          unNumber: tdgInfo.unNumber,
          properShippingName: tdgInfo.properShippingName,
          dangerClass: tdgInfo.class,
          packingGroup: tdgInfo.packingGroup,
          operatorId: user.id,
          operatorName: user.name,
          notes: 'Emptied truck - all fuel removed',
        });
        transactions.push(txn);
        await storage.updateTruckFuelLevel(id, 'diesel', 0);
        await storage.updateFuelInventory('diesel', -dieselLevel, 'adjustment', undefined, `Emptied truck ${truck.unitNumber}`, user.id, '0');
      }
      
      res.json({ 
        success: true, 
        transactions, 
        removed: { regular: regularLevel, premium: premiumLevel, diesel: dieselLevel, total: totalFuel }
      });
    } catch (error) {
      console.error("Empty truck error:", error);
      res.status(500).json({ message: "Failed to empty truck" });
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

  // Generate TDG Fuel Log HTML download
  app.get("/api/ops/fleet/trucks/:id/fuel-log-download", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { fuelType } = req.query;
      const user = req.user as any;
      
      const truck = await storage.getTruck(id);
      if (!truck) {
        return res.status(404).json({ message: "Truck not found" });
      }
      
      // Operators can only view their own truck
      if (user.role === 'operator' && truck.assignedDriverId !== user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      // Get transactions (optionally filtered by fuel type)
      const transactions = await storage.getTruckFuelTransactions(
        id,
        fuelType as string | undefined
      );
      
      const tdg = TDG_FUEL_INFO;
      const currentDate = new Date().toLocaleDateString('en-CA');
      
      const transactionsHTML = transactions.length > 0 
        ? transactions.map(tx => `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${new Date(tx.createdAt).toLocaleString('en-CA')}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${tx.transactionType === 'fill' ? 'Fill' : 'Dispense'}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${tx.properShippingName}<br/><small>${tx.unNumber} • Class ${tx.dangerClass} • PG ${tx.packingGroup}</small></td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${parseFloat(tx.litres) > 0 ? '+' : ''}${parseFloat(tx.litres).toFixed(1)}L</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${parseFloat(tx.previousLevel).toFixed(0)} → ${parseFloat(tx.newLevel).toFixed(0)}L</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${tx.deliveryAddress || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${tx.operatorName}</td>
          </tr>
        `).join('')
        : `<tr><td colspan="7" style="padding: 20px; text-align: center; color: #718096; font-style: italic;">No transactions recorded for this period</td></tr>`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Fuel Log - ${truck.unitNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
            h1 { color: #1a365d; font-size: 18px; margin-bottom: 5px; }
            h2 { color: #2d3748; font-size: 14px; margin-top: 20px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
            .truck-info { background: #f7fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .emergency { background: #fff5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #e53e3e; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background: #2d3748; color: white; padding: 10px; text-align: left; }
            tr:nth-child(even) { background: #f7fafc; }
            .footer { margin-top: 30px; font-size: 10px; color: #718096; text-align: center; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>TDG Fuel Log</h1>
              <p><strong>Unit #${truck.unitNumber}</strong> ${truck.name ? `(${truck.name})` : ''}</p>
              <p>${truck.year} ${truck.make} ${truck.model} • ${truck.licensePlate}</p>
            </div>
            <div style="text-align: right;">
              <p><strong>Generated:</strong> ${currentDate}</p>
              <p><strong>Records:</strong> ${transactions.length}</p>
            </div>
          </div>

          <div class="emergency">
            <h2 style="margin-top: 0; color: #e53e3e;">Emergency Contacts</h2>
            <p><strong>CANUTEC (24/7):</strong> 1-888-226-8832 or *666 (cell)</p>
            <p><strong>Company Contact:</strong> Levi Ernst - 587-890-8982</p>
          </div>

          <div class="truck-info">
            <h2 style="margin-top: 0;">Current Serviceable Fuel Levels</h2>
            <table>
              <tr>
                <th>Fuel Type</th>
                <th>Current Level</th>
                <th>Tank Capacity</th>
                <th>Available for Service</th>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>87 Regular Gasoline</strong><br/><small>${tdg.regular.unNumber} • Class ${tdg.regular.class}</small></td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${parseFloat(truck.regularLevel || '0').toFixed(1)} L</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${parseFloat(truck.regularCapacity || '0').toFixed(0)} L</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: ${parseFloat(truck.regularLevel || '0') > 0 ? '#38a169' : '#718096'};">${parseFloat(truck.regularLevel || '0') > 0 ? 'YES' : 'EMPTY'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>91 Premium Gasoline</strong><br/><small>${tdg.premium.unNumber} • Class ${tdg.premium.class}</small></td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${parseFloat(truck.premiumLevel || '0').toFixed(1)} L</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${parseFloat(truck.premiumCapacity || '0').toFixed(0)} L</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: ${parseFloat(truck.premiumLevel || '0') > 0 ? '#38a169' : '#718096'};">${parseFloat(truck.premiumLevel || '0') > 0 ? 'YES' : 'EMPTY'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Diesel</strong><br/><small>${tdg.diesel.unNumber} • Class ${tdg.diesel.class}</small></td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${parseFloat(truck.dieselLevel || '0').toFixed(1)} L</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${parseFloat(truck.dieselCapacity || '0').toFixed(0)} L</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: ${parseFloat(truck.dieselLevel || '0') > 0 ? '#38a169' : '#718096'};">${parseFloat(truck.dieselLevel || '0') > 0 ? 'YES' : 'EMPTY'}</td>
              </tr>
            </table>
          </div>

          <div class="truck-info">
            <h2 style="margin-top: 0;">Dangerous Goods Classification</h2>
            <table>
              <tr>
                <th>Product</th>
                <th>UN Number</th>
                <th>Proper Shipping Name</th>
                <th>Class</th>
                <th>Packing Group</th>
                <th>ERG Guide</th>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">87 Regular Gasoline</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.regular.unNumber}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.regular.properShippingName}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.regular.class}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.regular.packingGroup}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.regular.ergGuide}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">91 Premium Gasoline</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.premium.unNumber}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.premium.properShippingName}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.premium.class}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.premium.packingGroup}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.premium.ergGuide}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">Diesel</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.diesel.unNumber}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.diesel.properShippingName}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.diesel.class}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.diesel.packingGroup}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${tdg.diesel.ergGuide}</td>
              </tr>
            </table>
          </div>

          <h2>Transaction Log</h2>
          <table>
            <tr>
              <th>Date/Time</th>
              <th>Type</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Level</th>
              <th>Location</th>
              <th>Operator</th>
            </tr>
            ${transactionsHTML}
          </table>

          <div class="footer">
            <p>Prairie Mobile Fuel Services • TDG-Compliant Fuel Log • Generated ${new Date().toISOString()}</p>
          </div>
        </body>
        </html>
      `;
      
      const filename = `TDG-Fuel-Log-${truck.unitNumber}-${new Date().toISOString().split('T')[0]}.html`;
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(htmlContent);
    } catch (error) {
      console.error("Generate fuel log download error:", error);
      res.status(500).json({ message: "Failed to generate fuel log" });
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

  // Get all inspections for a truck (with driver info)
  app.get("/api/ops/fleet/trucks/:id/pretrip", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 30;
      const inspections = await storage.getPreTripInspections(id, limit);
      
      // Fetch driver info for each inspection (guard against null/missing driverId)
      const inspectionsWithDriver = await Promise.all(
        inspections.map(async (insp) => {
          let driver = null;
          if (insp.driverId) {
            try {
              const driverData = await storage.getUser(insp.driverId);
              if (driverData) {
                driver = { id: driverData.id, name: driverData.name, email: driverData.email };
              }
            } catch (e) {
              // Driver may have been deleted, ignore
            }
          }
          return { ...insp, driver };
        })
      );
      
      res.json({ inspections: inspectionsWithDriver });
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

  // ============================================
  // Driver Management (separate from route drivers)
  // ============================================

  // Get all drivers
  app.get("/api/ops/driver-management", requireAuth, requireAdmin, async (req, res) => {
    try {
      const drivers = await storage.getAllDrivers();
      const trucks = await storage.getAllTrucks();
      
      const driversWithTrucks = drivers.map(driver => {
        const truck = trucks.find(t => t.id === driver.assignedTruckId);
        return { ...driver, assignedTruck: truck || null };
      });
      
      res.json({ drivers: driversWithTrucks });
    } catch (error) {
      console.error("Get drivers error:", error);
      res.status(500).json({ message: "Failed to fetch drivers" });
    }
  });

  // Get single driver
  app.get("/api/ops/driver-management/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const driver = await storage.getDriver(id);
      
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }
      
      let assignedTruck = null;
      if (driver.assignedTruckId) {
        assignedTruck = await storage.getTruck(driver.assignedTruckId);
      }
      
      res.json({ driver: { ...driver, assignedTruck } });
    } catch (error) {
      console.error("Get driver error:", error);
      res.status(500).json({ message: "Failed to fetch driver" });
    }
  });

  // Helper to parse driver date fields
  const parseDriverDates = (data: any) => {
    const dateFields = [
      'driversLicenseIssueDate', 'driversLicenseExpiryDate',
      'tdgCertificateIssueDate', 'tdgCertificateExpiryDate',
      'lockoutLicenseIssueDate', 'lockoutLicenseExpiryDate'
    ];
    
    const parsed = { ...data };
    for (const field of dateFields) {
      if (parsed[field] && typeof parsed[field] === 'string') {
        if (parsed[field].trim() === '') {
          parsed[field] = null;
        } else {
          parsed[field] = new Date(parsed[field]);
        }
      }
    }
    
    // Handle empty string values for optional text fields
    if (parsed.driversLicenseNumber === '') parsed.driversLicenseNumber = null;
    if (parsed.tdgCertificateNumber === '') parsed.tdgCertificateNumber = null;
    if (parsed.lockoutLicenseNumber === '') parsed.lockoutLicenseNumber = null;
    if (parsed.assignedTruckId === '') parsed.assignedTruckId = null;
    
    return parsed;
  };

  // Create driver
  app.post("/api/ops/driver-management", requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsedData = parseDriverDates(req.body);
      const driver = await storage.createDriver(parsedData);
      res.json({ driver });
    } catch (error) {
      console.error("Create driver error:", error);
      res.status(500).json({ message: "Failed to create driver" });
    }
  });

  // Update driver
  app.patch("/api/ops/driver-management/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const parsedData = parseDriverDates(req.body);
      const driver = await storage.updateDriver(id, parsedData);
      res.json({ driver });
    } catch (error) {
      console.error("Update driver error:", error);
      res.status(500).json({ message: "Failed to update driver" });
    }
  });

  // Delete driver
  app.delete("/api/ops/driver-management/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteDriver(id);
      res.json({ message: "Driver deleted successfully" });
    } catch (error) {
      console.error("Delete driver error:", error);
      res.status(500).json({ message: "Failed to delete driver" });
    }
  });

  // ============================================
  // Business Finances API
  // ============================================

  // Get all financial accounts with balances
  app.get("/api/ops/finances/accounts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { financialAccounts } = await import("@shared/schema");
      const accounts = await db.select().from(financialAccounts).orderBy(financialAccounts.sortOrder);
      res.json({ accounts });
    } catch (error) {
      console.error("Get financial accounts error:", error);
      res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  // Get finance settings
  app.get("/api/ops/finances/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { financeSettings } = await import("@shared/schema");
      const settings = await db.select().from(financeSettings);
      const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
      res.json({ settings: settingsMap });
    } catch (error) {
      console.error("Get finance settings error:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // Update finance setting
  app.put("/api/ops/finances/settings/:key", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      const { financeSettings } = await import("@shared/schema");
      
      await db.insert(financeSettings)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: financeSettings.key,
          set: { value, updatedAt: new Date() }
        });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Update finance setting error:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // Get allocation rules
  app.get("/api/ops/finances/allocation-rules", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { allocationRules } = await import("@shared/schema");
      const rules = await db.select().from(allocationRules).where(eq(allocationRules.isActive, true));
      res.json({ rules });
    } catch (error) {
      console.error("Get allocation rules error:", error);
      res.status(500).json({ message: "Failed to fetch allocation rules" });
    }
  });

  // Get weekly closes history
  app.get("/api/ops/finances/weekly-closes", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { weeklyCloses } = await import("@shared/schema");
      const closes = await db.select().from(weeklyCloses).orderBy(desc(weeklyCloses.weekEndDate)).limit(12);
      res.json({ closes });
    } catch (error) {
      console.error("Get weekly closes error:", error);
      res.status(500).json({ message: "Failed to fetch weekly closes" });
    }
  });

  // Get current week summary for weekly close
  app.get("/api/ops/finances/current-week-summary", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { financeSettings } = await import("@shared/schema");
      const settings = await db.select().from(financeSettings);
      const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
      
      const operatingMode = settingsMap.operating_mode || 'soft_launch';
      const now = new Date();
      
      // Calculate week boundaries based on operating mode
      let weekStart: Date, weekEnd: Date;
      const dayOfWeek = now.getDay();
      
      if (operatingMode === 'soft_launch') {
        // Soft launch: Sun-Tue, close on Wed
        // Week starts Sunday, ends Tuesday
        const daysToSunday = dayOfWeek;
        weekStart = new Date(now);
        weekStart.setDate(now.getDate() - daysToSunday);
        weekStart.setHours(0, 0, 0, 0);
        
        weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 2);
        weekEnd.setHours(23, 59, 59, 999);
      } else {
        // Full time: Mon-Sat, close on Sunday
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        weekStart = new Date(now);
        weekStart.setDate(now.getDate() - daysToMonday);
        weekStart.setHours(0, 0, 0, 0);
        
        weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 5);
        weekEnd.setHours(23, 59, 59, 999);
      }
      
      // Get orders for this week
      const weekOrders = await db.select().from(orders)
        .where(and(
          gte(orders.scheduledDate, weekStart),
          lte(orders.scheduledDate, weekEnd),
          eq(orders.status, 'completed')
        ));
      
      // Calculate totals
      let fuelRevenueGross = 0;
      let deliveryFeeRevenue = 0;
      let totalGstCollected = 0;
      let litresBilled = 0;
      
      for (const order of weekOrders) {
        fuelRevenueGross += parseFloat(order.subtotal || '0') - parseFloat(order.deliveryFee || '0');
        deliveryFeeRevenue += parseFloat(order.deliveryFee || '0');
        totalGstCollected += parseFloat(order.gstAmount || '0');
        litresBilled += parseFloat(order.actualLitresDelivered || order.fuelAmount || '0');
      }
      
      // Get subscription revenue for the week
      // This would come from Stripe subscription payments - simplified for now
      const subscriptionRevenue = 0; // TODO: Pull from Stripe
      
      res.json({
        weekStart,
        weekEnd,
        operatingMode,
        summary: {
          ordersCompleted: weekOrders.length,
          litresBilled,
          fuelRevenueGross,
          deliveryFeeRevenue,
          subscriptionRevenue,
          totalGstCollected,
          totalRevenue: fuelRevenueGross + deliveryFeeRevenue + subscriptionRevenue + totalGstCollected,
        }
      });
    } catch (error) {
      console.error("Get current week summary error:", error);
      res.status(500).json({ message: "Failed to fetch week summary" });
    }
  });

  // Get runway tracker data
  app.get("/api/ops/finances/runway", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { financialAccounts, financeSettings, financialTransactions } = await import("@shared/schema");
      
      // Get owner draw holding balance
      const ownerDrawAccount = await db.select().from(financialAccounts)
        .where(eq(financialAccounts.accountType, 'owner_draw_holding'))
        .limit(1);
      
      const ownerDrawBalance = parseFloat(ownerDrawAccount[0]?.balance || '0');
      
      // Get target monthly income
      const settings = await db.select().from(financeSettings);
      const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
      const targetMonthlyIncome = parseFloat(settingsMap.target_monthly_income || '5000');
      
      // Calculate months of runway
      const monthsOfRunway = targetMonthlyIncome > 0 ? ownerDrawBalance / targetMonthlyIncome : 0;
      
      // Get recent owner draw transfers
      const recentTransfers = await db.select().from(financialTransactions)
        .where(eq(financialTransactions.transactionType, 'owner_draw_transfer'))
        .orderBy(desc(financialTransactions.createdAt))
        .limit(12);
      
      // Calculate average weekly contribution
      const avgWeeklyContribution = recentTransfers.length > 0 
        ? recentTransfers.reduce((sum, t) => sum + parseFloat(t.amount), 0) / recentTransfers.length
        : 0;
      
      // Project freedom date
      const weeksToFreedom = avgWeeklyContribution > 0 
        ? Math.ceil((targetMonthlyIncome * 6 - ownerDrawBalance) / avgWeeklyContribution)
        : 0;
      
      const freedomDate = new Date();
      freedomDate.setDate(freedomDate.getDate() + (weeksToFreedom * 7));
      
      res.json({
        ownerDrawBalance,
        targetMonthlyIncome,
        monthsOfRunway,
        avgWeeklyContribution,
        weeksToFreedom,
        freedomDate: weeksToFreedom > 0 && weeksToFreedom < 520 ? freedomDate : null,
        recentTransfers: recentTransfers.slice(0, 6)
      });
    } catch (error) {
      console.error("Get runway data error:", error);
      res.status(500).json({ message: "Failed to fetch runway data" });
    }
  });

  // Initialize daily net margin logging scheduler
  scheduleDailyNetMarginLogging();
  
  // Initialize recurring order processing scheduler (5am Calgary time)
  scheduleRecurringOrderProcessing();
  
  // Run backfill on startup to catch up any missing days
  backfillNetMarginData().then(result => {
    if (result.backfilledDays > 0) {
      console.log(`[NetMargin] Backfilled ${result.backfilledDays} days of data on startup`);
    }
  }).catch(err => {
    console.error('[NetMargin] Failed to backfill on startup:', err);
  });

  // ============================================
  // Stripe Bookkeeping / Ledger API
  // ============================================

  const { ledgerService } = await import('./ledgerService');
  const { backfillLedgerFromStripe } = await import('./ledgerBackfill');
  const { ledgerEntries } = await import('@shared/schema');

  // Get ledger entries with pagination and filtering
  app.get("/api/ops/bookkeeping/ledger", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate, category, limit = '50', offset = '0' } = req.query;
      
      let start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let end = endDate ? new Date(endDate as string) : new Date();
      
      const entries = await ledgerService.getEntriesByDateRange(start, end);
      
      let filtered = entries;
      if (category && category !== 'all') {
        filtered = entries.filter(e => e.category === category);
      }
      
      const total = filtered.length;
      const offsetNum = parseInt(offset as string) || 0;
      const limitNum = parseInt(limit as string) || 50;
      const paginated = filtered.slice(offsetNum, offsetNum + limitNum);
      
      res.json({ entries: paginated, total, offset: offsetNum, limit: limitNum });
    } catch (error) {
      console.error("Get ledger entries error:", error);
      res.status(500).json({ message: "Failed to fetch ledger entries" });
    }
  });

  // Get monthly revenue report
  app.get("/api/ops/bookkeeping/reports/revenue", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { year, month } = req.query;
      const y = parseInt(year as string) || new Date().getFullYear();
      const m = parseInt(month as string) || new Date().getMonth() + 1;
      
      const summary = await ledgerService.getMonthlySummary(y, m);
      res.json(summary);
    } catch (error) {
      console.error("Get revenue report error:", error);
      res.status(500).json({ message: "Failed to fetch revenue report" });
    }
  });

  // Get GST summary report
  app.get("/api/ops/bookkeeping/reports/gst", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { year, month } = req.query;
      const y = parseInt(year as string) || new Date().getFullYear();
      const m = parseInt(month as string) || new Date().getMonth() + 1;
      
      const summary = await ledgerService.getGstSummary(y, m);
      res.json(summary);
    } catch (error) {
      console.error("Get GST report error:", error);
      res.status(500).json({ message: "Failed to fetch GST report" });
    }
  });

  // Get cash flow report
  app.get("/api/ops/bookkeeping/reports/cashflow", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { year, month } = req.query;
      const y = parseInt(year as string) || new Date().getFullYear();
      const m = parseInt(month as string) || new Date().getMonth() + 1;
      
      const summary = await ledgerService.getCashFlowSummary(y, m);
      res.json(summary);
    } catch (error) {
      console.error("Get cash flow report error:", error);
      res.status(500).json({ message: "Failed to fetch cash flow report" });
    }
  });

  // Get diagnostics (unmapped revenue, GST review items)
  app.get("/api/ops/bookkeeping/diagnostics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const unmappedRevenue = await ledgerService.getUnmappedRevenue();
      const gstReviewItems = await ledgerService.getEntriesNeedingGstReview();
      
      res.json({
        unmappedCount: unmappedRevenue.length,
        unmappedRevenue: unmappedRevenue.slice(0, 20),
        gstReviewCount: gstReviewItems.length,
        gstReviewItems: gstReviewItems.slice(0, 20),
      });
    } catch (error) {
      console.error("Get diagnostics error:", error);
      res.status(500).json({ message: "Failed to fetch diagnostics" });
    }
  });

  // Create manual ledger entry (fuel COGS, expenses, adjustments)
  app.post("/api/ops/bookkeeping/manual-entry", requireAuth, requireOwner, async (req, res) => {
    try {
      const { 
        eventDate, sourceType, description, category, 
        grossAmountCents, gstPaidCents, cogsFuelCents, expenseOtherCents 
      } = req.body;
      
      if (!['fuel_cost', 'expense', 'adjustment', 'owner_draw'].includes(sourceType)) {
        return res.status(400).json({ message: "Invalid source type for manual entry" });
      }
      
      const user = await getCurrentUser(req);
      const idempotencyKey = `manual:${Date.now()}:${user?.id}:${Math.random().toString(36).substring(7)}`;
      
      const entry = await ledgerService.createEntry({
        eventDate: new Date(eventDate),
        source: 'manual',
        sourceType,
        sourceId: null,
        stripeEventId: null,
        idempotencyKey,
        chargeId: null,
        paymentIntentId: null,
        stripeCustomerId: null,
        userId: user?.id || null,
        orderId: null,
        description,
        category,
        currency: 'cad',
        grossAmountCents: grossAmountCents || 0,
        netAmountCents: grossAmountCents || 0,
        stripeFeeCents: 0,
        gstCollectedCents: 0,
        gstPaidCents: gstPaidCents || 0,
        gstNeedsReview: false,
        revenueSubscriptionCents: 0,
        revenueFuelCents: 0,
        revenueOtherCents: 0,
        cogsFuelCents: cogsFuelCents || 0,
        expenseOtherCents: expenseOtherCents || 0,
        metaJson: JSON.stringify({ createdBy: user?.id }),
        isReversal: false,
        reversesEntryId: null,
      });
      
      res.json(entry);
    } catch (error: any) {
      console.error("Create manual entry error:", error);
      res.status(500).json({ message: error.message || "Failed to create manual entry" });
    }
  });

  // Run Stripe backfill (owner only)
  app.post("/api/ops/bookkeeping/backfill", requireAuth, requireOwner, async (req, res) => {
    try {
      const { startDate, endDate, dryRun } = req.body;
      
      const result = await backfillLedgerFromStripe({
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        dryRun: dryRun || false,
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Backfill error:", error);
      res.status(500).json({ message: error.message || "Backfill failed" });
    }
  });

  // Export ledger to CSV
  app.get("/api/ops/bookkeeping/export/ledger", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      let start = startDate ? new Date(startDate as string) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      let end = endDate ? new Date(endDate as string) : new Date();
      
      const entries = await ledgerService.getEntriesByDateRange(start, end);
      
      const headers = [
        'Date', 'Source', 'Type', 'Description', 'Category', 
        'Gross ($)', 'Net ($)', 'Stripe Fee ($)', 
        'GST Collected ($)', 'GST Paid ($)',
        'Revenue Sub ($)', 'Revenue Fuel ($)', 'Revenue Other ($)',
        'COGS Fuel ($)', 'Expense Other ($)', 'Stripe Event ID', 'ID'
      ];
      
      const rows = entries.map(e => [
        e.eventDate.toISOString().split('T')[0],
        e.source,
        e.sourceType,
        `"${(e.description || '').replace(/"/g, '""')}"`,
        e.category,
        (e.grossAmountCents / 100).toFixed(2),
        (e.netAmountCents / 100).toFixed(2),
        (e.stripeFeeCents / 100).toFixed(2),
        (e.gstCollectedCents / 100).toFixed(2),
        (e.gstPaidCents / 100).toFixed(2),
        (e.revenueSubscriptionCents / 100).toFixed(2),
        (e.revenueFuelCents / 100).toFixed(2),
        (e.revenueOtherCents / 100).toFixed(2),
        (e.cogsFuelCents / 100).toFixed(2),
        (e.expenseOtherCents / 100).toFixed(2),
        e.stripeEventId || '',
        e.id
      ].join(','));
      
      const csv = [headers.join(','), ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="ledger-export-${start.toISOString().split('T')[0]}-to-${end.toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Export ledger error:", error);
      res.status(500).json({ message: "Failed to export ledger" });
    }
  });

  // Export GST report to CSV
  app.get("/api/ops/bookkeeping/export/gst", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { year } = req.query;
      const y = parseInt(year as string) || new Date().getFullYear();
      
      const headers = ['Month', 'GST Collected ($)', 'GST Paid ($)', 'Net GST Owing ($)', 'Items Needing Review'];
      const rows: string[] = [];
      
      for (let m = 1; m <= 12; m++) {
        const summary = await ledgerService.getGstSummary(y, m);
        rows.push([
          `${y}-${m.toString().padStart(2, '0')}`,
          (summary.gstCollected / 100).toFixed(2),
          (summary.gstPaid / 100).toFixed(2),
          (summary.netGstOwing / 100).toFixed(2),
          summary.needsReviewCount.toString()
        ].join(','));
      }
      
      const csv = [headers.join(','), ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="gst-summary-${y}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Export GST error:", error);
      res.status(500).json({ message: "Failed to export GST report" });
    }
  });

  // ============== 9-BUCKET WATERFALL API ==============

  // Get current bucket balances
  app.get("/api/ops/waterfall/buckets", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { waterfallService } = await import('./waterfallService');
      const balances = await waterfallService.getBucketBalances();
      res.json({ balances });
    } catch (error) {
      console.error("Get bucket balances error:", error);
      res.status(500).json({ message: "Failed to fetch bucket balances" });
    }
  });

  // Get allocation summary for a date range
  app.get("/api/ops/waterfall/summary", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { waterfallService } = await import('./waterfallService');
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();
      
      const summary = await waterfallService.getAllocationSummary(start, end);
      res.json(summary);
    } catch (error) {
      console.error("Get allocation summary error:", error);
      res.status(500).json({ message: "Failed to fetch allocation summary" });
    }
  });

  // Preview waterfall allocation (dry run, doesn't apply)
  app.post("/api/ops/waterfall/preview", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { waterfallService } = await import('./waterfallService');
      const { revenueType, grossAmountCents, litresDelivered, wholesaleCostPerLitreCents } = req.body;
      
      const result = await waterfallService.executeWaterfall({
        transactionId: 'preview_' + Date.now(),
        revenueType,
        grossAmountCents,
        litresDelivered,
        wholesaleCostPerLitreCents,
        isReversal: false
      });
      
      res.json(result);
    } catch (error) {
      console.error("Preview waterfall error:", error);
      res.status(500).json({ message: "Failed to preview waterfall allocation" });
    }
  });

  // Get allocation rules
  app.get("/api/ops/waterfall/rules", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { allocationRules } = await import('@shared/schema');
      const rules = await db.select().from(allocationRules);
      res.json({ rules });
    } catch (error) {
      console.error("Get allocation rules error:", error);
      res.status(500).json({ message: "Failed to fetch allocation rules" });
    }
  });

  // Backfill waterfall allocations from existing ledger entries
  app.post("/api/ops/waterfall/backfill", requireAuth, requireOwner, async (req, res) => {
    try {
      const { waterfallService } = await import('./waterfallService');
      const { ledgerEntries, orders, orderItems, fuelPricing } = await import('@shared/schema');
      
      // Get all fuel_delivery ledger entries that haven't been processed
      const unprocessedEntries = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.category, 'fuel_delivery'));
      
      const results: { entryId: string; orderId: string | null; success: boolean; error?: string }[] = [];
      
      for (const entry of unprocessedEntries) {
        // Check if already processed (has corresponding financial_transactions)
        const existingTxn = await db
          .select()
          .from(financialTransactions)
          .where(eq(financialTransactions.referenceId, `order_fuel_${entry.orderId}`))
          .limit(1);
        
        if (existingTxn.length > 0) {
          results.push({ entryId: entry.id, orderId: entry.orderId, success: true, error: 'Already processed' });
          continue;
        }
        
        if (!entry.orderId) {
          results.push({ entryId: entry.id, orderId: null, success: false, error: 'No order_id' });
          continue;
        }
        
        // Get order details
        const [order] = await db.select().from(orders).where(eq(orders.id, entry.orderId));
        if (!order) {
          results.push({ entryId: entry.id, orderId: entry.orderId, success: false, error: 'Order not found' });
          continue;
        }
        
        // Get total litres from order items
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, entry.orderId));
        // Use actualLitresDelivered if available, otherwise fall back to ordered fuelAmount
        const totalLitres = items.reduce((sum, item) => {
          const delivered = item.actualLitresDelivered ? parseFloat(item.actualLitresDelivered) : 0;
          const ordered = parseFloat(item.fuelAmount);
          return sum + (delivered > 0 ? delivered : ordered);
        }, 0);
        
        // Get wholesale cost
        const [fuelPrice] = await db.select().from(fuelPricing).where(eq(fuelPricing.fuelType, order.fuelType));
        const wholesaleCostPerLitreCents = fuelPrice ? Math.round(parseFloat(fuelPrice.baseCost) * 100) : 0;
        
        // Calculate amounts using ledger entry's recorded values
        const grossAmountCents = entry.grossAmountCents;
        const deliveryFeeCents = Math.round(parseFloat(order.deliveryFee) * 1.05 * 100);
        const fuelRevenueCents = grossAmountCents - deliveryFeeCents;
        
        // Run waterfall for fuel revenue
        if (fuelRevenueCents > 0 && totalLitres > 0) {
          const fuelResult = await waterfallService.processAndApply({
            transactionId: `order_fuel_${entry.orderId}`,
            revenueType: 'fuel_sale',
            grossAmountCents: fuelRevenueCents,
            litresDelivered: totalLitres,
            wholesaleCostPerLitreCents,
            isReversal: false
          });
          
          if (!fuelResult.success) {
            results.push({ entryId: entry.id, orderId: entry.orderId, success: false, error: fuelResult.error });
            continue;
          }
        }
        
        // Run waterfall for delivery fee if any
        if (deliveryFeeCents > 0) {
          await waterfallService.processAndApply({
            transactionId: `order_delivery_${entry.orderId}`,
            revenueType: 'delivery_fee',
            grossAmountCents: deliveryFeeCents,
            isReversal: false
          });
        }
        
        results.push({ entryId: entry.id, orderId: entry.orderId, success: true });
      }
      
      // Get updated bucket balances
      const balances = await waterfallService.getBucketBalances();
      
      res.json({ 
        message: `Processed ${results.length} ledger entries`,
        results,
        balances
      });
    } catch (error) {
      console.error("Backfill waterfall error:", error);
      res.status(500).json({ message: "Failed to backfill waterfall allocations" });
    }
  });

  // Backfill reversals for cancelled orders that were cancelled before refund flow was implemented
  app.post("/api/ops/cancelled-orders/backfill-reversals", requireAuth, requireOwner, async (req, res) => {
    try {
      const { ledgerService } = await import('./ledgerService');
      const { waterfallService } = await import('./waterfallService');
      const { orders, ledgerEntries } = await import('@shared/schema');
      
      // Find cancelled orders with captured payment status (not yet refunded in ledger)
      const cancelledOrders = await db
        .select()
        .from(orders)
        .where(and(
          eq(orders.status, 'cancelled'),
          eq(orders.paymentStatus, 'captured')
        ));
      
      const results: { orderId: string; success: boolean; message: string }[] = [];
      
      for (const order of cancelledOrders) {
        // Check if reversal entry already exists
        const existingReversal = await db
          .select()
          .from(ledgerEntries)
          .where(and(
            eq(ledgerEntries.orderId, order.id),
            eq(ledgerEntries.isReversal, true)
          ))
          .limit(1);
        
        if (existingReversal.length > 0) {
          results.push({ orderId: order.id, success: true, message: 'Reversal already exists' });
          continue;
        }
        
        // Find original ledger entry
        const originalEntry = await ledgerService.findByOrderId(order.id);
        
        if (!originalEntry) {
          results.push({ orderId: order.id, success: false, message: 'No original ledger entry found' });
          continue;
        }
        
        try {
          // Create reversal ledger entry (manual backfill - no Stripe refund since that was separate)
          const reversalId = `backfill_reversal_${order.id}_${Date.now()}`;
          await ledgerService.createDirectRefundEntry(
            originalEntry,
            reversalId,
            new Date()
          );
          
          // Reverse bucket allocations
          const fuelReversal = await waterfallService.reverseTransaction(`order_fuel_${order.id}`);
          const deliveryReversal = await waterfallService.reverseTransaction(`order_delivery_${order.id}`);
          
          const fuelReversed = fuelReversal.allocations.length;
          const deliveryReversed = deliveryReversal.allocations.length;
          
          results.push({ 
            orderId: order.id, 
            success: true, 
            message: `Reversal created, ${fuelReversed} fuel + ${deliveryReversed} delivery allocations reversed` 
          });
          
        } catch (err: any) {
          results.push({ orderId: order.id, success: false, message: err.message || 'Unknown error' });
        }
      }
      
      res.json({
        message: `Processed ${results.length} cancelled orders`,
        results
      });
    } catch (error) {
      console.error("Backfill cancelled order reversals error:", error);
      res.status(500).json({ message: "Failed to backfill cancelled order reversals" });
    }
  });

  // ============================================
  // TAX COVERAGE HEALTH REPORT
  // ============================================
  app.get("/api/reports/tax-coverage", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { financialAccounts, ledgerEntries, financialTransactions: finTxns } = await import('@shared/schema');
      
      // Parse query params
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const fromDate = req.query.from ? new Date(req.query.from as string) : yearStart;
      const toDate = req.query.to ? new Date(req.query.to as string) : now;
      const includeOwnerDraw = req.query.includeOwnerDraw !== '0';
      const includeGrowth = req.query.includeGrowth !== '0';
      const taxRate = parseFloat(req.query.taxRate as string) || 0.25;
      const assumedCogsRatio = 0.85; // TODO: make configurable

      // 1. Get current bucket balances
      const accounts = await db.select().from(financialAccounts).orderBy(financialAccounts.sortOrder);
      const balances: Record<string, number> = {};
      for (const acc of accounts) {
        balances[acc.accountType] = parseFloat(acc.balance);
      }

      // 2. Compute YTD revenue from ledger_entries (fuel_delivery, subscription categories)
      const subscriptionCategories = ['subscription_payg', 'subscription_access', 'subscription_household', 'subscription_rural', 'subscription_emergency'];
      const revenueEntries = await db
        .select()
        .from(ledgerEntries)
        .where(
          and(
            sql`${ledgerEntries.eventDate} >= ${fromDate}`,
            sql`${ledgerEntries.eventDate} <= ${toDate}`,
            sql`${ledgerEntries.category} IN ('fuel_delivery', 'subscription_payg', 'subscription_access', 'subscription_household', 'subscription_rural', 'subscription_emergency')`,
            eq(ledgerEntries.isReversal, false)
          )
        );

      let revenueFuelYtd = 0;
      let revenueSubscriptionYtd = 0;
      let revenueOtherYtd = 0;

      for (const entry of revenueEntries) {
        // Use revenue_* fields if available, otherwise fallback
        if (entry.revenueFuelCents > 0 || entry.revenueSubscriptionCents > 0 || entry.revenueOtherCents > 0) {
          revenueFuelYtd += entry.revenueFuelCents;
          revenueSubscriptionYtd += entry.revenueSubscriptionCents;
          revenueOtherYtd += entry.revenueOtherCents;
        } else {
          // Fallback: (net + stripe_fee) - gst = recognized revenue ex GST
          const recognized = (entry.netAmountCents + entry.stripeFeeCents) - entry.gstCollectedCents;
          if (entry.category === 'fuel_delivery') {
            revenueFuelYtd += recognized;
          } else if (entry.category?.startsWith('subscription_')) {
            revenueSubscriptionYtd += recognized;
          } else {
            revenueOtherYtd += recognized;
          }
        }
      }

      const recognizedRevenueExGstYtd = (revenueFuelYtd + revenueSubscriptionYtd + revenueOtherYtd) / 100;
      
      // 3. Compute Fuel COGS YTD (estimated via ratio for v1)
      const fuelCogsYtd = (revenueFuelYtd / 100) * assumedCogsRatio;
      const profitMethod = "estimated_cogs_ratio";
      
      // 4. Profit Proxy YTD
      const profitProxyYtd = recognizedRevenueExGstYtd - fuelCogsYtd;

      // 5. Tax Safety Pool (current)
      const taxPoolBuckets = [
        'income_tax_reserve',
        'operating_buffer',
        'maintenance_reserve',
        'emergency_risk',
      ];
      if (includeGrowth) taxPoolBuckets.push('growth_capital');
      if (includeOwnerDraw) taxPoolBuckets.push('owner_draw_holding');

      let taxSafetyPool = 0;
      for (const bucket of taxPoolBuckets) {
        taxSafetyPool += balances[bucket] || 0;
      }

      // 6. Build monthly trend data
      // Get all financial_transactions to compute running balances
      const allTxns = await db
        .select({
          id: finTxns.id,
          accountId: finTxns.accountId,
          amount: finTxns.amount,
          createdAt: finTxns.createdAt,
        })
        .from(finTxns)
        .where(sql`${finTxns.createdAt} >= ${fromDate} AND ${finTxns.createdAt} <= ${toDate}`);

      // Map account IDs to account types
      const accountIdToType: Record<string, string> = {};
      for (const acc of accounts) {
        accountIdToType[acc.id] = acc.accountType;
      }

      // Build month-by-month data
      const trend: { month: string; tax_safety_pool_end: number; profit_proxy_ytd_end: number; effective_set_aside_pct: number | null }[] = [];
      
      const startMonth = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
      const endMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
      
      let currentMonth = new Date(startMonth);
      while (currentMonth <= endMonth) {
        const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
        const monthLabel = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
        
        // Compute tax pool balance at end of this month from transactions
        let poolEndOfMonth = 0;
        for (const txn of allTxns) {
          const txnDate = new Date(txn.createdAt);
          if (txnDate <= monthEnd) {
            const accType = accountIdToType[txn.accountId];
            if (taxPoolBuckets.includes(accType)) {
              poolEndOfMonth += parseFloat(txn.amount);
            }
          }
        }

        // Compute profit proxy YTD up to end of this month
        let profitProxyYtdEndOfMonth = 0;
        let revFuelToMonth = 0;
        let revSubToMonth = 0;
        let revOtherToMonth = 0;

        for (const entry of revenueEntries) {
          const entryDate = new Date(entry.eventDate);
          if (entryDate <= monthEnd) {
            if (entry.revenueFuelCents > 0 || entry.revenueSubscriptionCents > 0 || entry.revenueOtherCents > 0) {
              revFuelToMonth += entry.revenueFuelCents;
              revSubToMonth += entry.revenueSubscriptionCents;
              revOtherToMonth += entry.revenueOtherCents;
            } else {
              const recognized = (entry.netAmountCents + entry.stripeFeeCents) - entry.gstCollectedCents;
              if (entry.category === 'fuel_delivery') {
                revFuelToMonth += recognized;
              } else if (entry.category === 'subscription') {
                revSubToMonth += recognized;
              } else {
                revOtherToMonth += recognized;
              }
            }
          }
        }

        const revTotalToMonth = (revFuelToMonth + revSubToMonth + revOtherToMonth) / 100;
        const cogsToMonth = (revFuelToMonth / 100) * assumedCogsRatio;
        profitProxyYtdEndOfMonth = revTotalToMonth - cogsToMonth;

        let effectivePct: number | null = null;
        if (profitProxyYtdEndOfMonth > 0) {
          effectivePct = poolEndOfMonth / profitProxyYtdEndOfMonth;
        }

        trend.push({
          month: monthLabel,
          tax_safety_pool_end: Math.round(poolEndOfMonth * 100) / 100,
          profit_proxy_ytd_end: Math.round(profitProxyYtdEndOfMonth * 100) / 100,
          effective_set_aside_pct: effectivePct !== null ? Math.round(effectivePct * 10000) / 10000 : null
        });

        // Move to next month
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
      }

      res.json({
        period: {
          from: fromDate.toISOString().split('T')[0],
          to: toDate.toISOString().split('T')[0]
        },
        balances,
        profit: {
          recognized_revenue_ex_gst_ytd: Math.round(recognizedRevenueExGstYtd * 100) / 100,
          fuel_cogs_ytd: Math.round(fuelCogsYtd * 100) / 100,
          profit_proxy_ytd: Math.round(profitProxyYtd * 100) / 100,
          method: profitMethod,
          assumed_cogs_ratio: assumedCogsRatio
        },
        tax_pool: {
          current_balance: Math.round(taxSafetyPool * 100) / 100,
          included_buckets: taxPoolBuckets,
          excluded_buckets: ['gst_holding', 'deferred_subscription']
        },
        kpis: {
          effective_set_aside_pct: profitProxyYtd > 0 ? Math.round((taxSafetyPool / profitProxyYtd) * 10000) / 10000 : null,
          expected_tax_owing: Math.round(profitProxyYtd * taxRate * 100) / 100,
          coverage_ratio: profitProxyYtd > 0 ? Math.round((taxSafetyPool / (profitProxyYtd * taxRate)) * 100) / 100 : null,
          tax_rate_used: taxRate
        },
        trend
      });
    } catch (error) {
      console.error("Tax coverage report error:", error);
      res.status(500).json({ message: "Failed to generate tax coverage report" });
    }
  });

  return httpServer;
}
