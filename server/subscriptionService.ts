import { getUncachableStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { GST_RATE } from "@shared/schema";
import Stripe from "stripe";

const TIER_CONFIG = {
  payg: { name: "Pay As You Go", monthlyFee: 0, monthlyFeeWithGst: 0 },
  access: { name: "Access", monthlyFee: 24.99, monthlyFeeWithGst: 26.24 },
  household: { name: "Household", monthlyFee: 49.99, monthlyFeeWithGst: 52.49 },
  rural: { name: "Rural", monthlyFee: 99.99, monthlyFeeWithGst: 104.99 },
  vip: { name: "VIP Fuel Concierge", monthlyFee: 249.99, monthlyFeeWithGst: 262.49 },
};

export const subscriptionService = {
  async initializeStripeProducts(): Promise<void> {
    const stripe = await getUncachableStripeClient();
    const tiers = await storage.getAllSubscriptionTiers();

    for (const tier of tiers) {
      if (tier.stripeProductId && tier.stripePriceId) {
        continue;
      }

      const product = await stripe.products.create({
        name: `Prairie Mobile Fuel - ${tier.name}`,
        description: `Monthly subscription for ${tier.name} tier`,
        metadata: { tierId: tier.id },
      });

      const priceAmount = Math.round(parseFloat(tier.monthlyFeeWithGst) * 100);
      
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: priceAmount,
        currency: "cad",
        recurring: { interval: "month" },
        metadata: { tierId: tier.id },
      });

      await storage.updateSubscriptionTierStripeIds(tier.id, product.id, price.id);
      console.log(`Created Stripe product/price for ${tier.id}: ${product.id}/${price.id}`);
    }
  },

  async createSubscription(userId: string, tierId: string): Promise<{ subscriptionId: string; clientSecret?: string }> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const tier = await storage.getSubscriptionTier(tierId);
    if (!tier) throw new Error("Tier not found");
    if (!tier.stripePriceId) throw new Error("Tier not configured in Stripe");

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await storage.updateUserStripeCustomerId(userId, customerId);
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: tier.stripePriceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: { userId, tierId },
    });

    await storage.updateUserStripeSubscription(userId, {
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      subscriptionTier: tierId as any,
    });

    const invoice = subscription.latest_invoice as any;
    const paymentIntent = invoice?.payment_intent;

    return {
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret,
    };
  },

  async changeSubscriptionTier(userId: string, newTierId: string): Promise<{ clientSecret?: string }> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const newTier = await storage.getSubscriptionTier(newTierId);
    if (!newTier) throw new Error("Tier not found");
    if (!newTier.stripePriceId) throw new Error("Tier not configured in Stripe");

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await storage.updateUserStripeCustomerId(userId, customerId);
    }

    if (user.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        
        if (subscription.status === 'canceled' || subscription.status === 'incomplete' || subscription.status === 'incomplete_expired') {
          const newSubscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: newTier.stripePriceId }],
            payment_behavior: "default_incomplete",
            payment_settings: { save_default_payment_method: "on_subscription" },
            expand: ["latest_invoice.payment_intent"],
            metadata: { userId, tierId: newTierId },
          });

          await storage.updateUserStripeSubscription(userId, {
            stripeSubscriptionId: newSubscription.id,
            stripeSubscriptionStatus: newSubscription.status,
            subscriptionTier: newTierId as any,
          });

          const invoice = newSubscription.latest_invoice as any;
          const paymentIntent = invoice?.payment_intent;
          return { clientSecret: paymentIntent?.client_secret };
        }
        
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
          items: [{
            id: subscription.items.data[0].id,
            price: newTier.stripePriceId,
          }],
          proration_behavior: "always_invoice",
          metadata: { tierId: newTierId },
        });

        await storage.updateUserStripeSubscription(userId, {
          subscriptionTier: newTierId as any,
        });
        return {};
      } catch (error: any) {
        if (error.code === 'resource_missing') {
          const newSubscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: newTier.stripePriceId }],
            payment_behavior: "default_incomplete",
            payment_settings: { save_default_payment_method: "on_subscription" },
            expand: ["latest_invoice.payment_intent"],
            metadata: { userId, tierId: newTierId },
          });

          await storage.updateUserStripeSubscription(userId, {
            stripeSubscriptionId: newSubscription.id,
            stripeSubscriptionStatus: newSubscription.status,
            subscriptionTier: newTierId as any,
          });

          const invoice = newSubscription.latest_invoice as any;
          const paymentIntent = invoice?.payment_intent;
          return { clientSecret: paymentIntent?.client_secret };
        }
        throw error;
      }
    } else {
      const newSubscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: newTier.stripePriceId }],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent"],
        metadata: { userId, tierId: newTierId },
      });

      await storage.updateUserStripeSubscription(userId, {
        stripeSubscriptionId: newSubscription.id,
        stripeSubscriptionStatus: newSubscription.status,
        subscriptionTier: newTierId as any,
      });

      const invoice = newSubscription.latest_invoice as any;
      const paymentIntent = invoice?.payment_intent;
      return { clientSecret: paymentIntent?.client_secret };
    }
  },

  async cancelSubscription(userId: string): Promise<void> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");
    if (!user.stripeSubscriptionId) throw new Error("No active subscription");

    await stripe.subscriptions.cancel(user.stripeSubscriptionId);

    await storage.updateUserStripeSubscription(userId, {
      stripeSubscriptionId: undefined,
      stripeSubscriptionStatus: "cancelled",
      subscriptionTier: "payg",
    });
  },

  async getCustomerPaymentMethods(userId: string): Promise<any[]> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) return [];

    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
    });

    return paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
    }));
  },

  async createSetupIntent(userId: string): Promise<{ clientSecret: string }> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await storage.updateUserStripeCustomerId(userId, customerId);
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      metadata: { userId },
    });

    return { clientSecret: setupIntent.client_secret! };
  },

  async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    await storage.updateUserStripeSubscription(userId, {
      stripeSubscriptionStatus: subscription.status,
    });

    if (subscription.status === "past_due" || subscription.status === "unpaid") {
      await storage.blockUserPayments(userId, `Subscription ${subscription.status}`);
    } else if (subscription.status === "active") {
      await storage.unblockUserPayments(userId);
    }
  },

  async handleInvoicePaymentFailed(invoice: any): Promise<void> {
    const customerId = invoice.customer;
    const users = await storage.getAllUsers();
    const user = users.find(u => u.stripeCustomerId === customerId);
    
    if (user) {
      await storage.blockUserPayments(user.id, "Payment failed");
    }
  },

  async handleInvoicePaymentSucceeded(invoice: any): Promise<void> {
    const customerId = invoice.customer;
    const users = await storage.getAllUsers();
    const user = users.find(u => u.stripeCustomerId === customerId);
    
    if (user && user.paymentBlocked && user.paymentBlockedReason?.includes("Payment failed")) {
      await storage.unblockUserPayments(user.id);
    }
  },

  async attachPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) throw new Error("User has no Stripe customer");

    // Check if customer has any existing payment methods
    const existingMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });

    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId,
    });

    // Auto-set as default if this is the first card
    if (existingMethods.data.length === 0) {
      console.log(`[Payment] Auto-setting first payment method as default for user ${userId}`);
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }
  },

  async detachPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) throw new Error("User has no Stripe customer");

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== user.stripeCustomerId) {
      throw new Error("Payment method does not belong to this customer");
    }

    await stripe.paymentMethods.detach(paymentMethodId);
  },

  async setDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) throw new Error("User has no Stripe customer");

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== user.stripeCustomerId) {
      throw new Error("Payment method does not belong to this customer");
    }

    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  },

  async getCustomerDefaultPaymentMethod(userId: string): Promise<string | null> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) return null;

    const customer = await stripe.customers.retrieve(user.stripeCustomerId) as Stripe.Customer;
    const defaultPm = customer.invoice_settings?.default_payment_method;
    return typeof defaultPm === 'string' ? defaultPm : defaultPm?.id || null;
  },

  /**
   * Admin-initiated tier change with special handling:
   * - @prairiemobilefuel.ca accounts: Always free (subscription with automatic invoice voiding via metadata)
   * - Regular customers: No proration, no immediate charge - billing starts on next cycle
   */
  async adminChangeSubscriptionTier(userId: string, newTierId: string): Promise<{ success: boolean; message: string }> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const newTier = await storage.getSubscriptionTier(newTierId);
    if (!newTier) throw new Error("Tier not found");
    
    const isInternalAccount = user.email.toLowerCase().endsWith('@prairiemobilefuel.ca');
    const isPAYG = newTierId === 'payg';
    
    // For PAYG tier, just cancel any existing subscription and update tier
    if (isPAYG) {
      if (user.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(user.stripeSubscriptionId);
        } catch (e) {
          // Subscription may not exist in Stripe
        }
      }
      await storage.updateUserStripeSubscription(userId, {
        stripeSubscriptionId: undefined,
        stripeSubscriptionStatus: 'cancelled',
        subscriptionTier: 'payg',
      });
      return { success: true, message: 'Tier changed to Pay As You Go' };
    }

    if (!newTier.stripePriceId) throw new Error("Tier not configured in Stripe");

    // Ensure customer exists in Stripe
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await storage.updateUserStripeCustomerId(userId, customerId);
    }

    // Check if user has an existing active subscription
    if (user.stripeSubscriptionId) {
      try {
        const existingSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        
        if (existingSubscription.status === 'active' || existingSubscription.status === 'trialing') {
          // Update existing subscription with NO proration (no immediate charge)
          const updateParams: Stripe.SubscriptionUpdateParams = {
            items: [{
              id: existingSubscription.items.data[0].id,
              price: newTier.stripePriceId,
            }],
            proration_behavior: 'none', // No immediate charge, billing on next cycle
            metadata: { tierId: newTierId, adminOverride: 'true' },
          };
          
          // For internal accounts, mark for auto-void invoices
          if (isInternalAccount) {
            (updateParams.metadata as Record<string, string>).internalAccount = 'true';
            (updateParams.metadata as Record<string, string>).autoVoidInvoices = 'true';
          }
          
          await stripe.subscriptions.update(user.stripeSubscriptionId, updateParams);

          await storage.updateUserStripeSubscription(userId, {
            subscriptionTier: newTierId as any,
          });

          return { 
            success: true, 
            message: isInternalAccount 
              ? 'Tier updated (internal account - invoices will be auto-voided)' 
              : 'Tier updated - no charge until next billing cycle'
          };
        }
      } catch (error: any) {
        // If subscription doesn't exist or is in a bad state, we'll create a new one below
        console.log('Existing subscription not usable, creating new one:', error.message);
      }
    }

    // Create new subscription
    const thirtyDaysFromNow = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

    if (isInternalAccount) {
      // For internal accounts: Use collection_method='send_invoice' with auto_advance=false
      // This prevents automatic payment attempts. Invoices will be manually voided via webhook.
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: newTier.stripePriceId }],
        collection_method: 'send_invoice', // Don't auto-charge, send invoice instead
        days_until_due: 30, // Invoice due in 30 days (gives time to void)
        pending_invoice_item_interval: null, // Don't accumulate invoice items
        metadata: { 
          userId, 
          tierId: newTierId, 
          internalAccount: 'true', 
          autoVoidInvoices: 'true',
          adminOverride: 'true' 
        },
      });

      // Disable auto-advance on future invoices for this subscription
      await stripe.subscriptions.update(subscription.id, {
        automatic_tax: { enabled: false },
      });

      // Immediately void the first invoice if it was created
      try {
        const invoices = await stripe.invoices.list({
          subscription: subscription.id,
          limit: 1,
        });
        if (invoices.data.length > 0) {
          const invoice = invoices.data[0];
          if (invoice.status === 'draft' || invoice.status === 'open') {
            await stripe.invoices.voidInvoice(invoice.id);
            console.log(`Voided initial invoice ${invoice.id} for internal account ${user.email}`);
          }
        }
      } catch (e) {
        console.log('No initial invoice to void or already voided');
      }

      await storage.updateUserStripeSubscription(userId, {
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: 'active', // Treat as active for internal accounts
        subscriptionTier: newTierId as any,
      });

      return { success: true, message: 'Tier updated (internal account - no charges ever)' };
    } else {
      // For regular customers: Use trial_end to ensure no immediate charge
      // trial_end with proration_behavior: 'none' ensures billing starts at trial end
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: newTier.stripePriceId }],
        trial_end: thirtyDaysFromNow, // No charge until this date
        payment_behavior: 'default_incomplete', // Won't fail if no payment method
        payment_settings: { save_default_payment_method: 'on_subscription' },
        metadata: { userId, tierId: newTierId, adminOverride: 'true' },
      });

      await storage.updateUserStripeSubscription(userId, {
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: subscription.status,
        subscriptionTier: newTierId as any,
      });

      return { success: true, message: 'Tier updated - billing starts in 30 days' };
    }
  },

  /**
   * Handle auto-voiding invoices for internal @prairiemobilefuel.ca accounts
   * Called from invoice.created webhook
   */
  async handleInvoiceForInternalAccount(invoice: any): Promise<boolean> {
    const stripe = await getUncachableStripeClient();
    
    // Check if this invoice is from a subscription with autoVoidInvoices metadata
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
    if (!subscriptionId) return false;
    
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      if (subscription.metadata?.autoVoidInvoices === 'true' || subscription.metadata?.internalAccount === 'true') {
        // This is an internal account - void the invoice
        if (invoice.status === 'draft') {
          await stripe.invoices.voidInvoice(invoice.id);
          console.log(`Auto-voided invoice ${invoice.id} for internal account`);
          return true;
        } else if (invoice.status === 'open') {
          await stripe.invoices.voidInvoice(invoice.id);
          console.log(`Auto-voided open invoice ${invoice.id} for internal account`);
          return true;
        }
      }
    } catch (error) {
      console.error('Error handling internal account invoice:', error);
    }
    
    return false;
  },
};
