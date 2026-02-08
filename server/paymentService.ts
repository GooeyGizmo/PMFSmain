import { getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import { GST_RATE, PRICING_MODEL_VERSION } from '@shared/schema';
import { calculatePreAuthFloor } from '@shared/pricing';
import { waterfallService } from './waterfallService';
import { pricingSnapshotService } from './pricingSnapshotService';

const PRE_AUTH_FILL_FACTOR = 0.65 * 1.5;

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
  async getCustomerDefaultPaymentMethod(customerId: string): Promise<string | null> {
    try {
      const stripe = await getUncachableStripeClient();
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && !customer.deleted) {
        const defaultPm = (customer as any).invoice_settings?.default_payment_method;
        if (defaultPm) {
          return typeof defaultPm === 'string' ? defaultPm : defaultPm.id;
        }
      }
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1,
      });
      if (paymentMethods.data.length > 0) {
        return paymentMethods.data[0].id;
      }
      return null;
    } catch (error: any) {
      console.error("Error fetching default payment method:", error.message);
      return null;
    }
  }

  async getCustomerCardDetails(customerId: string): Promise<{ id: string; brand: string; last4: string } | null> {
    try {
      const pmId = await this.getCustomerDefaultPaymentMethod(customerId);
      if (!pmId) return null;
      const stripe = await getUncachableStripeClient();
      const pm = await stripe.paymentMethods.retrieve(pmId);
      if (pm.card) {
        return { id: pmId, brand: pm.card.brand, last4: pm.card.last4 };
      }
      return { id: pmId, brand: 'card', last4: '****' };
    } catch (error: any) {
      console.error("Error fetching card details:", error.message);
      return null;
    }
  }

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
    vehicleId?: string;
    subscriptionTier?: string;
  }): Promise<{ paymentIntentId: string; clientSecret: string; pricing: OrderPricing }> {
    const stripe = await getUncachableStripeClient();
    
    let litresForPreAuth = params.litres;
    if (params.fillToFull) {
      let tankCapacity = 150;
      if (params.vehicleId) {
        const vehicle = await storage.getVehicle(params.vehicleId);
        if (vehicle?.tankCapacity) tankCapacity = vehicle.tankCapacity;
      }
      litresForPreAuth = Math.max(litresForPreAuth, Math.round(tankCapacity * PRE_AUTH_FILL_FACTOR));
    }

    const pricing = calculateOrderPricing({
      litres: litresForPreAuth,
      pricePerLitre: params.pricePerLitre,
      tierDiscount: params.tierDiscount,
      deliveryFee: params.deliveryFee,
    });

    if (params.fillToFull) {
      const floor = calculatePreAuthFloor(pricing.total);
      if (pricing.total < floor) {
        pricing.total = floor;
      }
    }

    const amountInCents = Math.round(pricing.total * 100);

    const defaultPm = await this.getCustomerDefaultPaymentMethod(params.customerId);

    const createParams: any = {
      amount: amountInCents,
      currency: 'cad',
      customer: params.customerId,
      capture_method: 'manual',
      payment_method_types: ['card'],
      description: params.description,
      metadata: {
        orderId: params.orderId,
        fuelType: params.fuelType,
        fillToFull: params.fillToFull.toString(),
        preAuthAmount: pricing.total.toFixed(2),
        subtotal: pricing.subtotal.toFixed(2),
        gstAmount: pricing.gstAmount.toFixed(2),
      },
    };

    if (defaultPm) {
      createParams.payment_method = defaultPm;
    }

    const paymentIntent = await stripe.paymentIntents.create(createParams);

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

  // New method for multi-vehicle orders that takes pre-calculated totals
  async createPreAuthorizationWithAmount(params: {
    customerId: string;
    orderId: string;
    totalAmount: number;
    description: string;
    fuelType: string;
    fillToFull: boolean;
    subtotal: number;
    gstAmount: number;
  }): Promise<{ paymentIntentId: string; clientSecret: string }> {
    const stripe = await getUncachableStripeClient();
    
    const amountInCents = Math.round(params.totalAmount * 100);

    const defaultPm = await this.getCustomerDefaultPaymentMethod(params.customerId);

    const createParams: any = {
      amount: amountInCents,
      currency: 'cad',
      customer: params.customerId,
      capture_method: 'manual',
      payment_method_types: ['card'],
      description: params.description,
      metadata: {
        orderId: params.orderId,
        fuelType: params.fuelType,
        fillToFull: params.fillToFull.toString(),
        preAuthAmount: params.totalAmount.toFixed(2),
        subtotal: params.subtotal.toFixed(2),
        gstAmount: params.gstAmount.toFixed(2),
      },
    };

    if (defaultPm) {
      createParams.payment_method = defaultPm;
    }

    const paymentIntent = await stripe.paymentIntents.create(createParams);

    await storage.updateOrderPaymentInfo(params.orderId, {
      stripePaymentIntentId: paymentIntent.id,
      paymentStatus: 'pending',
      preAuthAmount: params.totalAmount.toFixed(2),
    });

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
    };
  }

  async capturePayment(orderId: string, actualLitresDelivered: number): Promise<OrderPricing> {
    const order = await storage.getOrder(orderId);
    
    if (!order?.stripePaymentIntentId) {
      throw new Error('No payment intent found for this order');
    }

    const stripe = await getUncachableStripeClient();
    
    // Calculate final pricing based on actual delivery
    const pricing = calculateOrderPricing({
      litres: actualLitresDelivered,
      pricePerLitre: parseFloat(order.pricePerLitre.toString()),
      tierDiscount: parseFloat(order.tierDiscount.toString()),
      deliveryFee: parseFloat(order.deliveryFee.toString()),
    });

    const amountInCents = Math.round(pricing.total * 100);
    
    // CRITICAL: Check PaymentIntent status before attempting capture
    const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    
    // If pre-auth failed (requires_payment_method), auto-retry with stored payment methods
    if (paymentIntent.status === 'requires_payment_method') {
      return await this.autoRetryPayment(orderId, order, pricing, amountInCents, actualLitresDelivered);
    }
    
    if (paymentIntent.status === 'canceled') {
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

    const capturedIntent = await stripe.paymentIntents.capture(order.stripePaymentIntentId, {
      amount_to_capture: amountInCents,
    });

    // CRITICAL: Verify Stripe confirms the payment was successfully captured
    if (capturedIntent.status !== 'succeeded') {
      console.error(`[Payment] FAILED: Stripe capture returned status "${capturedIntent.status}" for order ${orderId}`);
      throw new Error(`Payment capture failed with status: ${capturedIntent.status}`);
    }

    await storage.updateOrderPaymentInfo(orderId, {
      paymentStatus: 'captured',
      finalAmount: pricing.total.toFixed(2),
    });

    // Run waterfall allocation for captured payment
    await this.runWaterfallAllocations(orderId, order, pricing, actualLitresDelivered);

    // Lock pricing snapshot at delivery time for historical accuracy
    await this.lockPricingSnapshot(orderId, order, actualLitresDelivered);

    return pricing;
  }

  /**
   * Lock pricing snapshot at delivery time for historical accuracy and COGS tracking.
   * Captures baseCost, markup, and customerPrice at the moment of delivery.
   */
  private async lockPricingSnapshot(
    orderId: string, 
    order: any, 
    actualLitresDelivered: number
  ): Promise<void> {
    try {
      const orderItems = await storage.getOrderItems(orderId);
      
      if (orderItems && orderItems.length > 0) {
        const result = await pricingSnapshotService.buildAndLock({
          orderId,
          orderItems: orderItems.map(item => ({
            fuelType: item.fuelType as 'regular' | 'premium' | 'diesel',
            fuelAmount: item.fuelAmount.toString(),
            pricePerLitre: item.pricePerLitre.toString(),
            actualLitresDelivered: item.actualLitresDelivered?.toString() || null,
          })),
          deliveryFee: order.deliveryFee?.toString() || '0',
        });
        
        if (!result.success) {
          console.error(`[Payment] Failed to lock pricing snapshot for order ${orderId}:`, result.error);
        }
      } else {
        const result = await pricingSnapshotService.buildAndLock({
          orderId,
          orderItems: [{
            fuelType: order.fuelType || 'regular',
            fuelAmount: order.fuelAmount?.toString() || '0',
            pricePerLitre: order.pricePerLitre?.toString() || '0',
          }],
          deliveryFee: order.deliveryFee?.toString() || '0',
          actualLitresOverride: actualLitresDelivered,
        });
        
        if (!result.success) {
          console.error(`[Payment] Failed to lock pricing snapshot for order ${orderId}:`, result.error);
        }
      }
    } catch (error) {
      console.error(`[Payment] Error locking pricing snapshot for order ${orderId}:`, error);
    }
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
        
        if (!fuelResult.success) {
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
        
        if (!deliveryResult.success) {
          console.error(`[Waterfall] Delivery fee allocation failed for order ${orderId}: ${deliveryResult.error}`);
        }
      }
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

    let lastError: Error | null = null;
    const originalPaymentIntentId = order.stripePaymentIntentId;

    // Try each payment method in order
    for (const pm of sortedMethods) {
      try {

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
          // Cancel the original failed PaymentIntent to prevent re-entry
          try {
            await stripe.paymentIntents.cancel(originalPaymentIntentId);
          } catch (cancelError: any) {
            // Non-fatal - original PI may already be canceled or in a terminal state
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
        }
      } catch (error: any) {
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
        return { valid: true, status: 'valid', paymentIntentStatus: paymentIntent.status };
      }

      // Already captured (shouldn't happen for validation but handle it)
      if (paymentIntent.status === 'succeeded') {
        return { valid: true, status: 'valid', paymentIntentStatus: paymentIntent.status };
      }

      // Pre-auth failed - try to create a new one with saved cards
      if (paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'canceled') {
        
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

            const pricePerLitre = parseFloat(order.pricePerLitre.toString());
            const deliveryFee = parseFloat(order.deliveryFee.toString());
            const tierDiscount = parseFloat(order.tierDiscount?.toString() || '0');
            
            let litresForPreAuth = parseFloat(order.fuelAmount?.toString() || '0');
            if (order.fillToFull) {
              let tankCapacity = 150;
              if (order.vehicleId) {
                const orderVehicle = await storage.getVehicle(order.vehicleId);
                if (orderVehicle?.tankCapacity) tankCapacity = orderVehicle.tankCapacity;
              }
              litresForPreAuth = Math.max(litresForPreAuth, Math.round(tankCapacity * PRE_AUTH_FILL_FACTOR));
            }

            const pricing = calculateOrderPricing({
              litres: litresForPreAuth,
              pricePerLitre,
              tierDiscount,
              deliveryFee,
            });

            if (order.fillToFull) {
              const reAuthFloor = calculatePreAuthFloor(pricing.total);
              if (pricing.total < reAuthFloor) {
                pricing.total = reAuthFloor;
              }
            }

            const amountInCents = Math.round(pricing.total * 100);

            const newIntent = await stripe.paymentIntents.create({
              amount: amountInCents,
              currency: 'cad',
              customer: user.stripeCustomerId,
              payment_method: pm.id,
              confirm: true,
              capture_method: 'manual',
              description: `Fuel delivery order #${orderId.slice(0, 8).toUpperCase()} (re-auth)`,
              metadata: {
                orderId,
                reAuthorization: 'true',
                originalPaymentIntentId: order.stripePaymentIntentId,
              },
              off_session: true,
            });

            if (newIntent.status === 'requires_capture') {
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
              lastError = `Card returned status: ${newIntent.status}`;
            }
          } catch (error: any) {
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
