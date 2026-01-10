import { getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

const FILL_TO_FULL_LITRES = 150;

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

  async createPreAuthorization(params: {
    customerId: string;
    orderId: string;
    amount: number;
    description: string;
    fuelType: string;
    fillToFull: boolean;
    pricePerLitre: number;
  }): Promise<{ paymentIntentId: string; clientSecret: string }> {
    const stripe = await getUncachableStripeClient();
    
    let preAuthAmount = params.amount;
    
    if (params.fillToFull) {
      preAuthAmount = FILL_TO_FULL_LITRES * params.pricePerLitre;
    }

    const amountInCents = Math.round(preAuthAmount * 100);

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
        preAuthAmount: preAuthAmount.toFixed(2),
      },
    });

    await storage.updateOrderPaymentInfo(params.orderId, {
      stripePaymentIntentId: paymentIntent.id,
      paymentStatus: 'authorized',
      preAuthAmount: preAuthAmount.toFixed(2),
    });

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
    };
  }

  async capturePayment(orderId: string, finalAmount: number): Promise<void> {
    const order = await storage.getOrder(orderId);
    
    if (!order?.stripePaymentIntentId) {
      throw new Error('No payment intent found for this order');
    }

    const stripe = await getUncachableStripeClient();
    const amountInCents = Math.round(finalAmount * 100);

    await stripe.paymentIntents.capture(order.stripePaymentIntentId, {
      amount_to_capture: amountInCents,
    });

    await storage.updateOrderPaymentInfo(orderId, {
      paymentStatus: 'captured',
      finalAmount: finalAmount.toFixed(2),
    });
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
