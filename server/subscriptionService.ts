import { getUncachableStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { GST_RATE } from "@shared/schema";
import Stripe from "stripe";

const TIER_CONFIG = {
  payg: { name: "Pay As You Go", monthlyFee: 0, monthlyFeeWithGst: 0 },
  access: { name: "Access", monthlyFee: 24.99, monthlyFeeWithGst: 26.24 },
  household: { name: "Household", monthlyFee: 49.99, monthlyFeeWithGst: 52.49 },
  rural: { name: "Rural", monthlyFee: 99.99, monthlyFeeWithGst: 104.99 },
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
};
