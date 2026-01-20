import { getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import { GST_RATE, PRICING_MODEL_VERSION } from '@shared/schema';
import { waterfallService } from './waterfallService';

const FILL_TO_FULL_LITRES = 150;

/**
 * PMFS Option 4 Pricing Model (pmfs_option4_v1)
 * - NO per-litre tier discounts
 * - Fuel price is premium and invariant by tier
 * - Subscriptions only affect delivery fees
 */

export interface OrderPricingParams {
  litres: number;
  pricePerLitre: number;
  tierDiscount: number; // DEPRECATED: kept for backwards compatibility, always ignored
  deliveryFee: number;
  promoDiscount?: number; // Optional promo discount amount in dollars
}

export interface OrderPricing {
  subtotal: number;
  gstAmount: number;
  total: number;
  tierDiscountTotal: number; // DEPRECATED: always 0 in Option 4 model
  fuelSubtotal?: number;
  promoDiscount?: number;
}

/**
 * Calculate order pricing using Option 4 model.
 * Per-litre tier discounts are REMOVED - tierDiscount param is ignored.
 * Fuel price is invariant by subscription tier.
 */
export function calculateOrderPricing(params: OrderPricingParams): OrderPricing {
  const { litres, pricePerLitre, deliveryFee, promoDiscount = 0 } = params;
  // NOTE: tierDiscount is intentionally ignored in Option 4 model
  
  const fuelSubtotal = litres * pricePerLitre;
  const subtotal = fuelSubtotal + deliveryFee - promoDiscount;
  const gstAmount = subtotal * GST_RATE;
  const total = subtotal + gstAmount;
  
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
    tierDiscountTotal: 0, // Always 0 in Option 4 model
    fuelSubtotal: Math.round(fuelSubtotal * 100) / 100,
    promoDiscount: Math.round(promoDiscount * 100) / 100,
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

    // Set paymentStatus to 'pending' - will be updated to 'preauthorized' when customer confirms payment
    await storage.updateOrderPaymentInfo(params.orderId, {
      stripePaymentIntentId: paymentIntent.id,
      paymentStatus: 'pending',
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
    
    // CRITICAL DEBUG: Log the actualLitresDelivered parameter to verify it's correct
    console.log(`[Payment] capturePayment called for order ${orderId}`);
    console.log(`[Payment] actualLitresDelivered parameter: ${actualLitresDelivered} (type: ${typeof actualLitresDelivered})`);
    console.log(`[Payment] order.fuelAmount from DB: ${order.fuelAmount}`);
    console.log(`[Payment] order.pricePerLitre: ${order.pricePerLitre}, tierDiscount: ${order.tierDiscount}, deliveryFee: ${order.deliveryFee}`);
    
    // Calculate final pricing based on actual delivery
    const pricing = calculateOrderPricing({
      litres: actualLitresDelivered,
      pricePerLitre: parseFloat(order.pricePerLitre.toString()),
      tierDiscount: parseFloat(order.tierDiscount.toString()),
      deliveryFee: parseFloat(order.deliveryFee.toString()),
    });

    console.log(`[Payment] Calculated pricing - subtotal: $${pricing.subtotal.toFixed(2)}, gst: $${pricing.gstAmount.toFixed(2)}, total: $${pricing.total.toFixed(2)}`);

    const amountInCents = Math.round(pricing.total * 100);
    console.log(`[Payment] amountInCents to capture: ${amountInCents}`);
    
    // CRITICAL: Check PaymentIntent status before attempting capture
    const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    
    // If pre-auth failed (requires_payment_method), auto-retry with stored payment methods
    if (paymentIntent.status === 'requires_payment_method') {
      console.log(`[Payment] Order ${orderId}: Pre-auth failed, attempting auto-retry with stored payment methods`);
      return await this.autoRetryPayment(orderId, order, pricing, amountInCents, actualLitresDelivered);
    }
    
    if (paymentIntent.status === 'canceled') {
      console.log(`[Payment] Order ${orderId}: Original PaymentIntent was canceled, attempting auto-retry`);
      return await this.autoRetryPayment(orderId, order, pricing, amountInCents, actualLitresDelivered);
    }
    
    if (paymentIntent.status === 'succeeded') {
      console.error(`[Payment] Order ${orderId}: PaymentIntent was already captured`);
      throw new Error('This payment was already captured.');
    }
    
    if (paymentIntent.status !== 'requires_capture') {
      console.error(`[Payment] Order ${orderId}: PaymentIntent has unexpected status: ${paymentIntent.status}`);
      throw new Error(`Cannot capture payment. Current status: ${paymentIntent.status}. Expected: requires_capture.`);
    }

    // Log the comparison between pre-auth and capture amounts
    const preAuthAmountCents = paymentIntent.amount;
    const preAuthAmountDollars = preAuthAmountCents / 100;
    console.log(`[Payment] ==================== CAPTURE DETAILS ====================`);
    console.log(`[Payment] Order ${orderId}:`);
    console.log(`[Payment]   Pre-authorized amount: $${preAuthAmountDollars.toFixed(2)} (${preAuthAmountCents} cents)`);
    console.log(`[Payment]   Capture amount:        $${pricing.total.toFixed(2)} (${amountInCents} cents)`);
    console.log(`[Payment]   Difference:            $${(preAuthAmountDollars - pricing.total).toFixed(2)} (will be released)`);
    console.log(`[Payment] ============================================================`);

    const capturedIntent = await stripe.paymentIntents.capture(order.stripePaymentIntentId, {
      amount_to_capture: amountInCents,
    });

    // CRITICAL: Verify Stripe confirms the payment was successfully captured
    if (capturedIntent.status !== 'succeeded') {
      console.error(`[Payment] FAILED: Stripe capture returned status "${capturedIntent.status}" for order ${orderId}`);
      throw new Error(`Payment capture failed with status: ${capturedIntent.status}`);
    }

    // Log what Stripe actually confirmed
    console.log(`[Payment] ==================== STRIPE RESPONSE ====================`);
    console.log(`[Payment] Order ${orderId} capture SUCCESS:`);
    console.log(`[Payment]   Stripe status:          ${capturedIntent.status}`);
    console.log(`[Payment]   Amount captured:        $${(capturedIntent.amount_received / 100).toFixed(2)}`);
    console.log(`[Payment]   Original amount:        $${(capturedIntent.amount / 100).toFixed(2)}`);
    console.log(`[Payment] ============================================================`);

    await storage.updateOrderPaymentInfo(orderId, {
      paymentStatus: 'captured',
      finalAmount: pricing.total.toFixed(2),
    });

    // Run waterfall allocation for captured payment
    await this.runWaterfallAllocations(orderId, order, pricing, actualLitresDelivered);

    return pricing;
  }

  /**
   * Run waterfall allocations after successful payment capture.
   * Allocates fuel margin and delivery fee to the 9 financial buckets.
   * Uses pricing values from capture to ensure exact reconciliation.
   */
  private async runWaterfallAllocations(
    orderId: string,
    order: any,
    pricing: OrderPricing,
    litresDelivered: number
  ): Promise<void> {
    try {
      // Get wholesale cost for fuel margin calculation
      const fuelPricing = await storage.getFuelPricing(order.fuelType);
      const wholesaleCostPerLitre = fuelPricing ? parseFloat(fuelPricing.baseCost) : 0;
      const wholesaleCostPerLitreCents = Math.round(wholesaleCostPerLitre * 100);

      // Use the exact pricing values from capture for accurate reconciliation
      // Total captured = fuel portion + delivery portion, both include GST
      const deliveryFeePreGst = parseFloat(order.deliveryFee) || 0;
      const deliveryFeeWithGstCents = Math.round(deliveryFeePreGst * 1.05 * 100);
      
      // Fuel revenue = total captured - delivery fee portion
      // This ensures waterfall allocations reconcile exactly to Stripe capture
      const totalCapturedCents = Math.round(pricing.total * 100);
      const fuelRevenueCents = totalCapturedCents - deliveryFeeWithGstCents;
      
      // Allocate fuel margin to buckets
      if (fuelRevenueCents > 0 && litresDelivered > 0) {
        const fuelResult = await waterfallService.processAndApply({
          transactionId: `order_fuel_${orderId}`,
          revenueType: 'fuel_sale',
          grossAmountCents: fuelRevenueCents,
          litresDelivered,
          wholesaleCostPerLitreCents,
          isReversal: false
        });
        
        if (fuelResult.success) {
          console.log(`[Waterfall] Fuel allocation complete for order ${orderId}: ${fuelResult.allocations.length} allocations, margin $${(fuelResult.marginCents || 0) / 100}`);
        } else {
          console.error(`[Waterfall] Fuel allocation failed for order ${orderId}: ${fuelResult.error}`);
        }
      }

      // Allocate delivery fee to buckets (if any)
      if (deliveryFeeWithGstCents > 0) {
        const deliveryResult = await waterfallService.processAndApply({
          transactionId: `order_delivery_${orderId}`,
          revenueType: 'delivery_fee',
          grossAmountCents: deliveryFeeWithGstCents,
          isReversal: false
        });
        
        if (deliveryResult.success) {
          console.log(`[Waterfall] Delivery fee allocation complete for order ${orderId}: ${deliveryResult.allocations.length} allocations`);
        } else {
          console.error(`[Waterfall] Delivery fee allocation failed for order ${orderId}: ${deliveryResult.error}`);
        }
      }
      
      console.log(`[Waterfall] Order ${orderId} allocation summary: total=$${pricing.total.toFixed(2)}, fuel=$${(fuelRevenueCents/100).toFixed(2)}, delivery=$${(deliveryFeeWithGstCents/100).toFixed(2)}`);
    } catch (error) {
      // Don't fail the capture if waterfall fails - log and continue
      console.error(`[Waterfall] Error running allocations for order ${orderId}:`, error);
    }
  }

  /**
   * Auto-retry payment when original pre-auth failed.
   * Tries default payment method first, then falls back to other saved cards.
   */
  private async autoRetryPayment(
    orderId: string, 
    order: any, 
    pricing: OrderPricing, 
    amountInCents: number,
    litresDelivered: number
  ): Promise<OrderPricing> {
    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(order.userId);
    
    // Guard: If customer has no Stripe account, provide actionable guidance
    if (!user?.stripeCustomerId) {
      console.error(`[Payment] Auto-retry SKIPPED: Order ${orderId} - customer has no Stripe account`);
      throw new Error('Pre-authorization was not completed and customer has no saved payment methods. Please contact the customer to complete payment, or cancel this order and create a new one.');
    }

    // Get all saved payment methods for the customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });

    if (paymentMethods.data.length === 0) {
      console.error(`[Payment] Auto-retry SKIPPED: Order ${orderId} - customer has no saved cards`);
      throw new Error('Pre-authorization failed and customer has no backup payment methods. Please contact the customer to add a card and retry, or cancel this order.');
    }

    // Get customer's default payment method
    const customer = await stripe.customers.retrieve(user.stripeCustomerId) as import('stripe').Stripe.Customer;
    const defaultPmId = typeof customer.invoice_settings?.default_payment_method === 'string' 
      ? customer.invoice_settings.default_payment_method 
      : customer.invoice_settings?.default_payment_method?.id;

    // Sort payment methods: default first, then others
    const sortedMethods = paymentMethods.data.sort((a, b) => {
      if (a.id === defaultPmId) return -1;
      if (b.id === defaultPmId) return 1;
      return 0;
    });

    console.log(`[Payment] Auto-retry: Found ${sortedMethods.length} payment method(s) for customer ${user.stripeCustomerId}`);

    let lastError: Error | null = null;
    const originalPaymentIntentId = order.stripePaymentIntentId;

    // Try each payment method in order
    for (const pm of sortedMethods) {
      try {
        console.log(`[Payment] Auto-retry: Attempting charge with ${pm.card?.brand} ****${pm.card?.last4}`);

        // Create a new PaymentIntent and immediately confirm+capture it
        const newIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: 'cad',
          customer: user.stripeCustomerId,
          payment_method: pm.id,
          confirm: true,
          capture_method: 'automatic', // Charge immediately
          description: `Fuel delivery order #${orderId.slice(0, 8).toUpperCase()} (auto-retry)`,
          metadata: {
            orderId,
            autoRetry: 'true',
            originalPaymentIntentId,
          },
          off_session: true, // Charge without customer present
        });

        if (newIntent.status === 'succeeded') {
          console.log(`[Payment] Auto-retry SUCCESS: Order ${orderId} charged $${pricing.total.toFixed(2)} with ${pm.card?.brand} ****${pm.card?.last4}`);

          // Cancel the original failed PaymentIntent to prevent re-entry
          try {
            await stripe.paymentIntents.cancel(originalPaymentIntentId);
            console.log(`[Payment] Auto-retry: Canceled original PaymentIntent ${originalPaymentIntentId}`);
          } catch (cancelError: any) {
            // Non-fatal - original PI may already be canceled or in a terminal state
            console.log(`[Payment] Auto-retry: Could not cancel original PaymentIntent: ${cancelError.message}`);
          }

          // Update order with new payment intent
          await storage.updateOrderPaymentInfo(orderId, {
            stripePaymentIntentId: newIntent.id,
            paymentStatus: 'captured',
            finalAmount: pricing.total.toFixed(2),
          });

          // Run waterfall allocation for auto-retry captured payment
          await this.runWaterfallAllocations(orderId, order, pricing, litresDelivered);

          return pricing;
        } else {
          console.log(`[Payment] Auto-retry: PaymentIntent status is ${newIntent.status}, trying next card...`);
        }
      } catch (error: any) {
        console.log(`[Payment] Auto-retry: Failed with ${pm.card?.brand} ****${pm.card?.last4}: ${error.message}`);
        lastError = error;
        // Continue to next payment method
      }
    }

    // All cards failed
    console.error(`[Payment] Auto-retry FAILED: All ${sortedMethods.length} payment methods failed for order ${orderId}`);
    throw new Error(`All payment methods failed. Last error: ${lastError?.message || 'Unknown error'}. Please contact the customer to update their payment information.`);
  }

  /**
   * Validate that an order has a successful pre-authorization.
   * If the pre-auth failed, attempt to create a new one with saved cards.
   * Returns validation result with status and error details.
   */
  async validatePreAuthorization(orderId: string): Promise<{
    valid: boolean;
    status: 'valid' | 'pending' | 'failed' | 'no_payment_intent';
    error?: string;
    paymentIntentStatus?: string;
  }> {
    const order = await storage.getOrder(orderId);
    
    if (!order) {
      return { valid: false, status: 'failed', error: 'Order not found' };
    }

    // If no payment intent exists, we need to create one
    if (!order.stripePaymentIntentId) {
      return { valid: false, status: 'no_payment_intent', error: 'No payment intent created yet' };
    }

    const stripe = await getUncachableStripeClient();
    
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
      
      // Already successfully pre-authorized
      if (paymentIntent.status === 'requires_capture') {
        console.log(`[Payment] Order ${orderId}: Pre-auth valid (requires_capture)`);
        return { valid: true, status: 'valid', paymentIntentStatus: paymentIntent.status };
      }

      // Already captured (shouldn't happen for validation but handle it)
      if (paymentIntent.status === 'succeeded') {
        console.log(`[Payment] Order ${orderId}: Already captured`);
        return { valid: true, status: 'valid', paymentIntentStatus: paymentIntent.status };
      }

      // Pre-auth failed - try to create a new one with saved cards
      if (paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'canceled') {
        console.log(`[Payment] Order ${orderId}: Pre-auth needs retry (status: ${paymentIntent.status})`);
        
        const user = await storage.getUser(order.userId);
        if (!user?.stripeCustomerId) {
          return { 
            valid: false, 
            status: 'failed', 
            error: 'Customer has no Stripe account. They need to complete payment setup.',
            paymentIntentStatus: paymentIntent.status
          };
        }

        // Get saved payment methods
        const paymentMethods = await stripe.paymentMethods.list({
          customer: user.stripeCustomerId,
          type: 'card',
        });

        if (paymentMethods.data.length === 0) {
          return { 
            valid: false, 
            status: 'failed', 
            error: 'Customer has no saved payment methods.',
            paymentIntentStatus: paymentIntent.status
          };
        }

        // Get default payment method
        const customer = await stripe.customers.retrieve(user.stripeCustomerId) as import('stripe').Stripe.Customer;
        const defaultPmId = typeof customer.invoice_settings?.default_payment_method === 'string' 
          ? customer.invoice_settings.default_payment_method 
          : customer.invoice_settings?.default_payment_method?.id;

        // Sort: default first
        const sortedMethods = paymentMethods.data.sort((a, b) => {
          if (a.id === defaultPmId) return -1;
          if (b.id === defaultPmId) return 1;
          return 0;
        });

        let lastError: string | null = null;

        // Try each card to create a new pre-authorization
        for (const pm of sortedMethods) {
          try {
            console.log(`[Payment] Validate: Attempting pre-auth with ${pm.card?.brand} ****${pm.card?.last4}`);

            const pricePerLitre = parseFloat(order.pricePerLitre.toString());
            const deliveryFee = parseFloat(order.deliveryFee.toString());
            const tierDiscount = parseFloat(order.tierDiscount?.toString() || '0');
            
            let litresForPreAuth = parseFloat(order.fuelAmount?.toString() || '0');
            if (order.fillToFull) {
              litresForPreAuth = 150; // FILL_TO_FULL_LITRES
            }

            const pricing = calculateOrderPricing({
              litres: litresForPreAuth,
              pricePerLitre,
              tierDiscount,
              deliveryFee,
            });

            const amountInCents = Math.round(pricing.total * 100);

            // Create new pre-authorization
            const newIntent = await stripe.paymentIntents.create({
              amount: amountInCents,
              currency: 'cad',
              customer: user.stripeCustomerId,
              payment_method: pm.id,
              confirm: true,
              capture_method: 'manual', // Pre-auth, not immediate capture
              description: `Fuel delivery order #${orderId.slice(0, 8).toUpperCase()} (re-auth)`,
              metadata: {
                orderId,
                reAuthorization: 'true',
                originalPaymentIntentId: order.stripePaymentIntentId,
              },
              off_session: true,
            });

            if (newIntent.status === 'requires_capture') {
              console.log(`[Payment] Validate SUCCESS: Order ${orderId} pre-authorized with ${pm.card?.brand} ****${pm.card?.last4}`);

              // Cancel old payment intent
              try {
                await stripe.paymentIntents.cancel(order.stripePaymentIntentId);
              } catch (e) {
                // Non-fatal
              }

              // Update order with new payment intent
              await storage.updateOrderPaymentInfo(orderId, {
                stripePaymentIntentId: newIntent.id,
                paymentStatus: 'preauthorized',
                preAuthAmount: pricing.total.toFixed(2),
              });

              // Update order status to confirmed since pre-auth succeeded
              await storage.updateOrderStatus(orderId, 'confirmed');

              return { valid: true, status: 'valid', paymentIntentStatus: newIntent.status };
            } else {
              console.log(`[Payment] Validate: PaymentIntent status is ${newIntent.status}, trying next card...`);
              lastError = `Card returned status: ${newIntent.status}`;
            }
          } catch (error: any) {
            console.log(`[Payment] Validate: Failed with ${pm.card?.brand} ****${pm.card?.last4}: ${error.message}`);
            lastError = error.message;
          }
        }

        // All cards failed - update paymentStatus to 'failed' so ops can see the issue
        await storage.updateOrderPaymentInfo(orderId, {
          paymentStatus: 'failed',
        });
        
        return { 
          valid: false, 
          status: 'failed', 
          error: `All payment methods failed. ${lastError || 'Please update payment info.'}`,
          paymentIntentStatus: paymentIntent.status
        };
      }

      // Pending confirmation from customer
      if (paymentIntent.status === 'requires_confirmation' || paymentIntent.status === 'requires_action') {
        // Update paymentStatus to reflect pending state
        await storage.updateOrderPaymentInfo(orderId, {
          paymentStatus: 'pending',
        });
        
        return { 
          valid: false, 
          status: 'pending', 
          error: 'Payment requires customer action.',
          paymentIntentStatus: paymentIntent.status
        };
      }

      // Unknown/processing status - keep as pending
      return { 
        valid: false, 
        status: 'pending', 
        error: `Payment is processing (status: ${paymentIntent.status})`,
        paymentIntentStatus: paymentIntent.status
      };
    } catch (error: any) {
      console.error(`[Payment] Validate error for order ${orderId}:`, error.message);
      return { valid: false, status: 'failed', error: error.message };
    }
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
