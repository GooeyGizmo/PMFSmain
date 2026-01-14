import { getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import { GST_RATE } from '@shared/schema';

const FILL_TO_FULL_LITRES = 150;

export interface OrderPricingParams {
  litres: number;
  pricePerLitre: number;
  tierDiscount: number;
  deliveryFee: number;
}

export interface OrderPricing {
  subtotal: number;
  gstAmount: number;
  total: number;
  tierDiscountTotal: number;
}

export function calculateOrderPricing(params: OrderPricingParams): OrderPricing {
  const { litres, pricePerLitre, tierDiscount, deliveryFee } = params;
  
  const fuelCost = litres * pricePerLitre;
  const tierDiscountTotal = litres * tierDiscount;
  const subtotal = fuelCost - tierDiscountTotal + deliveryFee;
  const gstAmount = subtotal * GST_RATE;
  const total = subtotal + gstAmount;
  
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
    tierDiscountTotal: Math.round(tierDiscountTotal * 100) / 100,
  };
}

export class PaymentService {
  async getOrCreateStripeCustomer(userId: string, email: string, name: string): Promise<string> {
    const user = await storage.getUser(userId);
    
    if (user?.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { userId },
    });

    await storage.updateUserStripeCustomerId(userId, customer.id);
    return customer.id;
  }

  async validateBookingRules(userId: string, vehicleCount: number, litres: number): Promise<{ valid: boolean; error?: string }> {
    const user = await storage.getUser(userId);
    if (!user) return { valid: false, error: "User not found" };
    
    if (user.paymentBlocked) {
      return { valid: false, error: `Payment blocked: ${user.paymentBlockedReason || "Please update your payment method"}` };
    }
    
    const tier = await storage.getSubscriptionTier(user.subscriptionTier);
    if (!tier) return { valid: false, error: "Subscription tier not found" };
    
    if (litres < tier.minOrderLitres) {
      return { valid: false, error: `Minimum order is ${tier.minOrderLitres}L for ${tier.name} tier` };
    }
    
    if (vehicleCount > tier.maxVehiclesPerOrder) {
      return { valid: false, error: `Maximum ${tier.maxVehiclesPerOrder} vehicle(s) per order for ${tier.name} tier` };
    }
    
    if (tier.maxOrdersPerMonth !== null) {
      const orderCount = await storage.getUserOrderCountThisMonth(userId);
      if (orderCount >= tier.maxOrdersPerMonth) {
        return { valid: false, error: `Maximum ${tier.maxOrdersPerMonth} orders per month for ${tier.name} tier` };
      }
    }
    
    return { valid: true };
  }

  async createPreAuthorization(params: {
    customerId: string;
    orderId: string;
    litres: number;
    pricePerLitre: number;
    tierDiscount: number;
    deliveryFee: number;
    description: string;
    fuelType: string;
    fillToFull: boolean;
  }): Promise<{ paymentIntentId: string; clientSecret: string; pricing: OrderPricing }> {
    const stripe = await getUncachableStripeClient();
    
    let litresForPreAuth = params.litres;
    if (params.fillToFull) {
      litresForPreAuth = FILL_TO_FULL_LITRES;
    }

    const pricing = calculateOrderPricing({
      litres: litresForPreAuth,
      pricePerLitre: params.pricePerLitre,
      tierDiscount: params.tierDiscount,
      deliveryFee: params.deliveryFee,
    });

    const amountInCents = Math.round(pricing.total * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'cad',
      customer: params.customerId,
      capture_method: 'manual',
      description: params.description,
      metadata: {
        orderId: params.orderId,
        fuelType: params.fuelType,
        fillToFull: params.fillToFull.toString(),
        preAuthAmount: pricing.total.toFixed(2),
        subtotal: pricing.subtotal.toFixed(2),
        gstAmount: pricing.gstAmount.toFixed(2),
      },
    });

    await storage.updateOrderPaymentInfo(params.orderId, {
      stripePaymentIntentId: paymentIntent.id,
      paymentStatus: 'preauthorized',
      preAuthAmount: pricing.total.toFixed(2),
    });

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
      pricing,
    };
  }

  async capturePayment(orderId: string, actualLitresDelivered: number): Promise<OrderPricing> {
    const order = await storage.getOrder(orderId);
    
    if (!order?.stripePaymentIntentId) {
      throw new Error('No payment intent found for this order');
    }

    const stripe = await getUncachableStripeClient();
    
    // CRITICAL: Check PaymentIntent status before attempting capture
    const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    
    if (paymentIntent.status === 'requires_payment_method') {
      console.error(`[Payment] Order ${orderId}: PaymentIntent requires payment method - customer never confirmed pre-authorization`);
      throw new Error('Pre-authorization was not completed. The customer needs to confirm payment before delivery can be completed. Please contact the customer or cancel this order.');
    }
    
    if (paymentIntent.status === 'canceled') {
      console.error(`[Payment] Order ${orderId}: PaymentIntent was already canceled`);
      throw new Error('This payment was already canceled. Please create a new order.');
    }
    
    if (paymentIntent.status === 'succeeded') {
      console.error(`[Payment] Order ${orderId}: PaymentIntent was already captured`);
      throw new Error('This payment was already captured.');
    }
    
    if (paymentIntent.status !== 'requires_capture') {
      console.error(`[Payment] Order ${orderId}: PaymentIntent has unexpected status: ${paymentIntent.status}`);
      throw new Error(`Cannot capture payment. Current status: ${paymentIntent.status}. Expected: requires_capture.`);
    }
    
    const pricing = calculateOrderPricing({
      litres: actualLitresDelivered,
      pricePerLitre: parseFloat(order.pricePerLitre.toString()),
      tierDiscount: parseFloat(order.tierDiscount.toString()),
      deliveryFee: parseFloat(order.deliveryFee.toString()),
    });

    const amountInCents = Math.round(pricing.total * 100);

    console.log(`[Payment] Capturing payment for order ${orderId}: $${pricing.total.toFixed(2)} (${amountInCents} cents)`);

    const capturedIntent = await stripe.paymentIntents.capture(order.stripePaymentIntentId, {
      amount_to_capture: amountInCents,
    });

    // CRITICAL: Verify Stripe confirms the payment was successfully captured
    if (capturedIntent.status !== 'succeeded') {
      console.error(`[Payment] FAILED: Stripe capture returned status "${capturedIntent.status}" for order ${orderId}`);
      throw new Error(`Payment capture failed with status: ${capturedIntent.status}`);
    }

    console.log(`[Payment] SUCCESS: Order ${orderId} payment captured - Status: ${capturedIntent.status}, Amount: $${(capturedIntent.amount_received / 100).toFixed(2)}`);

    await storage.updateOrderPaymentInfo(orderId, {
      paymentStatus: 'captured',
      finalAmount: pricing.total.toFixed(2),
    });

    return pricing;
  }

  async cancelPreAuthorization(orderId: string): Promise<void> {
    const order = await storage.getOrder(orderId);
    
    if (!order?.stripePaymentIntentId) {
      return;
    }

    const stripe = await getUncachableStripeClient();
    
    try {
      await stripe.paymentIntents.cancel(order.stripePaymentIntentId);
    } catch (error: any) {
      if (error.code !== 'payment_intent_unexpected_state') {
        throw error;
      }
    }

    await storage.updateOrderPaymentInfo(orderId, {
      paymentStatus: 'cancelled',
    });
  }
}

export const paymentService = new PaymentService();
