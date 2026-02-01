import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { subscriptionService } from './subscriptionService';
import { ledgerService, type CreateLedgerEntryInput } from './ledgerService';
import { storage } from './storage';
import { waterfallService, type RevenueType } from './waterfallService';
import type Stripe from 'stripe';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }

  static async handleStripeEvent(event: any): Promise<void> {
    const { type, data, id: eventId } = event;
    
    switch (type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await subscriptionService.handleSubscriptionUpdated(data.object);
        break;
      case 'invoice.payment_failed':
        await subscriptionService.handleInvoicePaymentFailed(data.object);
        break;
      case 'invoice.payment_succeeded':
        await subscriptionService.handleInvoicePaymentSucceeded(data.object);
        await this.recordInvoicePayment(eventId, data.object);
        break;
      case 'invoice.created':
      case 'invoice.finalized':
        // Auto-void invoices for internal company accounts
        await subscriptionService.handleInvoiceForInternalAccount(data.object);
        break;
      case 'charge.succeeded':
        await this.recordChargeSucceeded(eventId, data.object);
        break;
      case 'refund.created':
        await this.recordRefund(eventId, data.object);
        break;
      case 'payout.paid':
        await this.recordPayout(eventId, data.object);
        break;
      default:
        console.log(`Unhandled Stripe event: ${type}`);
    }
  }

  static async recordInvoicePayment(eventId: string, invoice: Stripe.Invoice): Promise<void> {
    const idempotencyKey = `stripe:event:${eventId}`;
    
    const existing = await ledgerService.checkIdempotency(idempotencyKey);
    if (existing) {
      return;
    }

    try {
      const stripe = await getUncachableStripeClient();
      
      const expandedInvoice = await stripe.invoices.retrieve(invoice.id, {
        expand: ['lines.data.price.product', 'charge.balance_transaction'],
      }) as unknown as Stripe.Invoice & { charge: Stripe.Charge | null; tax: number | null; payment_intent: string | Stripe.PaymentIntent | null };

      const charge = expandedInvoice.charge;
      const balanceTransaction = charge?.balance_transaction as Stripe.BalanceTransaction | null;
      
      const grossAmountCents = expandedInvoice.amount_paid || 0;
      const stripeFeeCents = balanceTransaction?.fee || 0;
      const netAmountCents = balanceTransaction?.net || (grossAmountCents - stripeFeeCents);

      let gstCollectedCents = expandedInvoice.tax || 0;
      let gstNeedsReview = false;
      let tierId: string | null = null;
      let isFuelDelivery = false;

      const lineItems = expandedInvoice.lines?.data || [];
      for (const lineItem of lineItems) {
        const price = (lineItem as any).price as Stripe.Price | null;
        const product = price?.product as Stripe.Product | null;
        
        if (product?.metadata?.tierId) {
          tierId = product.metadata.tierId;
        }
        
        if (product?.metadata?.type === 'fuel_delivery') {
          isFuelDelivery = true;
        }

        const taxAmounts = (lineItem as any).tax_amounts as Array<{ amount: number }> | undefined;
        if (!gstCollectedCents && taxAmounts?.length) {
          gstCollectedCents = taxAmounts.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
        }

        if (!gstCollectedCents && price?.tax_behavior) {
          if (price.tax_behavior === 'inclusive') {
            gstCollectedCents = Math.round(grossAmountCents * 5 / 105);
            gstNeedsReview = true;
          } else if (price.tax_behavior === 'exclusive') {
            gstCollectedCents = Math.round((grossAmountCents - stripeFeeCents) * 5 / 100);
            gstNeedsReview = true;
          }
        }
      }

      const category = isFuelDelivery ? 'fuel_delivery' : ledgerService.mapTierToCategory(tierId);
      const preTaxRevenue = grossAmountCents - gstCollectedCents;

      let revenueSubscriptionCents = 0;
      let revenueFuelCents = 0;
      let revenueOtherCents = 0;

      if (isFuelDelivery) {
        revenueFuelCents = preTaxRevenue;
      } else if (category !== 'revenue_unmapped') {
        revenueSubscriptionCents = preTaxRevenue;
      } else {
        revenueOtherCents = preTaxRevenue;
        gstNeedsReview = true;
      }

      const users = await storage.getAllUsers();
      const user = users.find(u => u.stripeCustomerId === expandedInvoice.customer);

      // Calculate bucket allocations for subscription payments
      let allocFields = {
        allocOperatingCents: 0,
        allocGstHoldingCents: 0,
        allocDeferredSubCents: 0,
        allocIncomeTaxCents: 0,
        allocMaintenanceCents: 0,
        allocEmergencyRiskCents: 0,
        allocGrowthCapitalCents: 0,
        allocOwnerDrawCents: 0,
      };

      if (revenueSubscriptionCents > 0) {
        // Subscription payment - use subscription_fee waterfall (40% deferred + allocations)
        // Pass GST-inclusive gross and actual Stripe fee - waterfall handles everything
        const subResult = await waterfallService.executeWaterfall({
          transactionId: expandedInvoice.id,
          revenueType: 'subscription_fee' as RevenueType,
          grossAmountCents,
          stripeFeeCents,
        });
        
        if (subResult.success) {
          allocFields = waterfallService.allocationsToLedgerFields(subResult.allocations);
        }
      } else if (revenueFuelCents > 0 || revenueOtherCents > 0) {
        // Fuel delivery or other revenue via invoice
        // Use standard GST + owner draw allocation (consistent with charge path fallback)
        // Stripe fee is deducted from owner draw
        allocFields.allocGstHoldingCents = gstCollectedCents;
        allocFields.allocOwnerDrawCents = preTaxRevenue - stripeFeeCents;
      } else {
        // Zero revenue edge case - still allocate GST if present
        allocFields.allocGstHoldingCents = gstCollectedCents;
      }

      const entry: CreateLedgerEntryInput = {
        eventDate: new Date((expandedInvoice.status_transitions?.paid_at || expandedInvoice.created) * 1000),
        source: 'stripe',
        sourceType: 'invoice_payment',
        sourceId: expandedInvoice.id,
        stripeEventId: eventId,
        idempotencyKey,
        chargeId: charge?.id || null,
        paymentIntentId: typeof expandedInvoice.payment_intent === 'string' 
          ? expandedInvoice.payment_intent 
          : expandedInvoice.payment_intent?.id || null,
        stripeCustomerId: typeof expandedInvoice.customer === 'string' 
          ? expandedInvoice.customer 
          : expandedInvoice.customer?.id || null,
        userId: user?.id || null,
        orderId: null,
        description: `Invoice ${expandedInvoice.number || expandedInvoice.id}`,
        category,
        currency: expandedInvoice.currency || 'cad',
        grossAmountCents,
        netAmountCents,
        stripeFeeCents,
        gstCollectedCents,
        gstPaidCents: 0,
        gstNeedsReview,
        revenueSubscriptionCents,
        revenueFuelCents,
        revenueOtherCents,
        cogsFuelCents: 0,
        expenseOtherCents: 0,
        // Bucket allocations - single source of truth
        ...allocFields,
        metaJson: JSON.stringify({
          invoiceNumber: expandedInvoice.number,
          tierId,
          lineItemCount: expandedInvoice.lines?.data?.length || 0,
        }),
        isReversal: false,
        reversesEntryId: null,
      };

      await ledgerService.createEntry(entry);
      console.log(`[Ledger] Recorded invoice payment with bucket allocations: ${expandedInvoice.id}`);
    } catch (error) {
      console.error(`[Ledger] Failed to record invoice payment:`, error);
    }
  }

  static async recordChargeSucceeded(eventId: string, charge: Stripe.Charge): Promise<void> {
    if ((charge as any).invoice) {
      return;
    }

    const idempotencyKey = `stripe:event:${eventId}`;
    
    // Check if already recorded by webhook
    const existingWebhook = await ledgerService.checkIdempotency(idempotencyKey);
    if (existingWebhook) {
      return;
    }
    
    // Check if already recorded by direct capture (dual-recording prevention)
    const directCaptureKey = `direct:charge:${charge.id}`;
    const existingDirect = await ledgerService.checkIdempotency(directCaptureKey);
    if (existingDirect) {
      return;
    }

    try {
      const stripe = await getUncachableStripeClient();
      
      let balanceTransaction: Stripe.BalanceTransaction | null = null;
      if (typeof charge.balance_transaction === 'string') {
        balanceTransaction = await stripe.balanceTransactions.retrieve(charge.balance_transaction);
      } else {
        balanceTransaction = charge.balance_transaction;
      }

      // Use amount_captured for actual captured amount (not pre-auth amount)
      const grossAmountCents = charge.amount_captured || charge.amount || 0;
      const stripeFeeCents = balanceTransaction?.fee || 0;
      // Always calculate net as gross minus fees (more reliable than balanceTransaction.net)
      const netAmountCents = grossAmountCents - stripeFeeCents;

      let gstCollectedCents = 0;
      let orderId: string | null = null;
      
      if (charge.metadata?.orderId) {
        orderId = charge.metadata.orderId;
        const order = await storage.getOrder(orderId);
        if (order?.finalGstAmount) {
          gstCollectedCents = Math.round(parseFloat(order.finalGstAmount) * 100);
        }
      }

      if (!gstCollectedCents) {
        gstCollectedCents = Math.round(grossAmountCents * 5 / 105);
      }

      const preTaxRevenue = grossAmountCents - gstCollectedCents;
      const users = await storage.getAllUsers();
      const user = users.find(u => u.stripeCustomerId === charge.customer);

      // Calculate bucket allocations based on transaction type
      let allocFields = {
        allocOperatingCents: 0,
        allocGstHoldingCents: 0,
        allocDeferredSubCents: 0,
        allocIncomeTaxCents: 0,
        allocMaintenanceCents: 0,
        allocEmergencyRiskCents: 0,
        allocGrowthCapitalCents: 0,
        allocOwnerDrawCents: 0,
      };

      if (orderId) {
        // For fuel deliveries, get order details for proper margin calculation
        const order = await storage.getOrder(orderId);
        const litresDelivered = order?.actualLitresDelivered 
          ? parseFloat(order.actualLitresDelivered)
          : undefined;
        
        // Get real COGS from fuel pricing table (wholesale cost per litre in cents)
        const fuelType = order?.fuelType || 'regular';
        const wholesaleCostPerLitreCents = await waterfallService.getCurrentCOGS(fuelType);
        
        // Calculate fuel cost portion (gross minus delivery fee)
        const deliveryFee = order?.deliveryFee ? parseFloat(order.deliveryFee) : 0;
        const deliveryFeeGross = Math.round(deliveryFee * 105); // GST-inclusive
        const fuelGross = grossAmountCents - deliveryFeeGross;
        
        // Split Stripe fee proportionally between fuel and delivery portions
        const fuelProportion = fuelGross / grossAmountCents;
        const fuelStripeFeeCents = Math.round(stripeFeeCents * fuelProportion);
        const deliveryStripeFeeCents = stripeFeeCents - fuelStripeFeeCents;
        
        // Calculate waterfall allocations for fuel sale portion
        // Pass GST-inclusive gross and actual Stripe fee - waterfall handles everything
        if (litresDelivered && litresDelivered > 0 && fuelGross > 0 && wholesaleCostPerLitreCents > 0) {
          const fuelResult = await waterfallService.executeWaterfall({
            transactionId: charge.id,
            revenueType: 'fuel_sale' as RevenueType,
            grossAmountCents: fuelGross,
            stripeFeeCents: fuelStripeFeeCents,
            litresDelivered,
            wholesaleCostPerLitreCents,
          });
          
          if (fuelResult.success) {
            allocFields = waterfallService.allocationsToLedgerFields(fuelResult.allocations);
          }
        } else if (fuelGross > 0) {
          // Fallback when litres or COGS unknown: allocate GST and remaining to owner draw
          // This ensures allocations are never zero for revenue entries
          const { gstCents, netCents } = waterfallService.extractGst(fuelGross);
          allocFields.allocGstHoldingCents = gstCents;
          allocFields.allocOwnerDrawCents = netCents - fuelStripeFeeCents;
        }
        
        // Also account for delivery fee if applicable
        if (deliveryFeeGross > 0) {
          const deliveryResult = await waterfallService.executeWaterfall({
            transactionId: `${charge.id}_delivery`,
            revenueType: 'delivery_fee' as RevenueType,
            grossAmountCents: deliveryFeeGross,
            stripeFeeCents: deliveryStripeFeeCents,
          });
          
          if (deliveryResult.success) {
            const deliveryAllocs = waterfallService.allocationsToLedgerFields(deliveryResult.allocations);
            // Combine allocations
            allocFields.allocOperatingCents += deliveryAllocs.allocOperatingCents;
            allocFields.allocGstHoldingCents += deliveryAllocs.allocGstHoldingCents;
            allocFields.allocDeferredSubCents += deliveryAllocs.allocDeferredSubCents;
            allocFields.allocIncomeTaxCents += deliveryAllocs.allocIncomeTaxCents;
            allocFields.allocMaintenanceCents += deliveryAllocs.allocMaintenanceCents;
            allocFields.allocEmergencyRiskCents += deliveryAllocs.allocEmergencyRiskCents;
            allocFields.allocGrowthCapitalCents += deliveryAllocs.allocGrowthCapitalCents;
            allocFields.allocOwnerDrawCents += deliveryAllocs.allocOwnerDrawCents;
          }
        }
      } else {
        // For non-fuel charges (e.g., service calls), allocate GST and remaining to owner draw
        allocFields.allocGstHoldingCents = gstCollectedCents;
        allocFields.allocOwnerDrawCents = preTaxRevenue - stripeFeeCents;
      }

      const entry: CreateLedgerEntryInput = {
        eventDate: new Date(charge.created * 1000),
        source: 'stripe',
        sourceType: 'charge',
        sourceId: charge.id,
        stripeEventId: eventId,
        idempotencyKey,
        chargeId: charge.id,
        paymentIntentId: typeof charge.payment_intent === 'string' 
          ? charge.payment_intent 
          : charge.payment_intent?.id || null,
        stripeCustomerId: typeof charge.customer === 'string' 
          ? charge.customer 
          : charge.customer?.id || null,
        userId: user?.id || null,
        orderId,
        description: charge.description || `Charge ${charge.id}`,
        category: orderId ? 'fuel_delivery' : 'revenue_unmapped',
        currency: charge.currency || 'cad',
        grossAmountCents,
        netAmountCents,
        stripeFeeCents,
        gstCollectedCents,
        gstPaidCents: 0,
        gstNeedsReview: !orderId,
        revenueSubscriptionCents: 0,
        revenueFuelCents: orderId ? preTaxRevenue : 0,
        revenueOtherCents: orderId ? 0 : preTaxRevenue,
        cogsFuelCents: 0,
        expenseOtherCents: 0,
        // Bucket allocations - single source of truth
        ...allocFields,
        metaJson: JSON.stringify({
          chargeDescription: charge.description,
          hasOrder: !!orderId,
        }),
        isReversal: false,
        reversesEntryId: null,
      };

      await ledgerService.createEntry(entry);
      console.log(`[Ledger] Recorded charge with bucket allocations: ${charge.id}`);
    } catch (error) {
      console.error(`[Ledger] Failed to record charge:`, error);
    }
  }

  static async recordRefund(eventId: string, refund: Stripe.Refund): Promise<void> {
    const idempotencyKey = `stripe:event:${eventId}`;
    
    const existing = await ledgerService.checkIdempotency(idempotencyKey);
    if (existing) {
      return;
    }

    try {
      const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
      const paymentIntentId = typeof refund.payment_intent === 'string' 
        ? refund.payment_intent 
        : refund.payment_intent?.id;

      const original = await ledgerService.findOriginalForRefund(chargeId, paymentIntentId);

      if (!original) {
        console.warn(`[Ledger] No original entry found for refund ${refund.id}`);
        
        const grossAmountCents = refund.amount || 0;
        const gstCollectedCents = Math.round(grossAmountCents * 5 / 105);
        const preTaxRevenue = grossAmountCents - gstCollectedCents;

        // Refund with no original - allocate negative GST + owner draw to reverse buckets
        const entry: CreateLedgerEntryInput = {
          eventDate: new Date(refund.created * 1000),
          source: 'stripe',
          sourceType: 'refund',
          sourceId: refund.id,
          stripeEventId: eventId,
          idempotencyKey,
          chargeId: chargeId || null,
          paymentIntentId: paymentIntentId || null,
          stripeCustomerId: null,
          userId: null,
          orderId: null,
          description: `Refund ${refund.id} (no original found)`,
          category: 'revenue_unmapped',
          currency: refund.currency || 'cad',
          grossAmountCents: -grossAmountCents,
          netAmountCents: -grossAmountCents,
          stripeFeeCents: 0,
          gstCollectedCents: -gstCollectedCents,
          gstPaidCents: 0,
          gstNeedsReview: true,
          revenueSubscriptionCents: 0,
          revenueFuelCents: 0,
          revenueOtherCents: -preTaxRevenue,
          cogsFuelCents: 0,
          expenseOtherCents: 0,
          // Negative bucket allocations to reverse balances
          allocOperatingCents: 0,
          allocGstHoldingCents: -gstCollectedCents,
          allocDeferredSubCents: 0,
          allocIncomeTaxCents: 0,
          allocMaintenanceCents: 0,
          allocEmergencyRiskCents: 0,
          allocGrowthCapitalCents: 0,
          allocOwnerDrawCents: -preTaxRevenue,
          metaJson: JSON.stringify({ reason: refund.reason, noOriginalFound: true }),
          isReversal: true,
          reversesEntryId: null,
        };

        await ledgerService.createEntry(entry);
        return;
      }

      // For refunds with original entry, create reversal with proportional negative allocations
      const refundEntry = ledgerService.createRefundEntry(
        original,
        refund.amount || 0,
        refund.id,
        eventId,
        new Date(refund.created * 1000)
      );

      await ledgerService.createEntry(refundEntry);
      console.log(`[Ledger] Recorded refund: ${refund.id} reversing ${original.id}`);
    } catch (error) {
      console.error(`[Ledger] Failed to record refund:`, error);
    }
  }

  static async recordPayout(eventId: string, payout: Stripe.Payout): Promise<void> {
    const idempotencyKey = `stripe:event:${eventId}`;
    
    const existing = await ledgerService.checkIdempotency(idempotencyKey);
    if (existing) {
      return;
    }

    try {
      const entry: CreateLedgerEntryInput = {
        eventDate: new Date((payout.arrival_date || payout.created) * 1000),
        source: 'stripe',
        sourceType: 'payout',
        sourceId: payout.id,
        stripeEventId: eventId,
        idempotencyKey,
        chargeId: null,
        paymentIntentId: null,
        stripeCustomerId: null,
        userId: null,
        orderId: null,
        description: `Payout to ${payout.destination || 'bank account'}`,
        category: 'payout_settlement',
        currency: payout.currency || 'cad',
        grossAmountCents: payout.amount || 0,
        netAmountCents: payout.amount || 0,
        stripeFeeCents: 0,
        gstCollectedCents: 0,
        gstPaidCents: 0,
        gstNeedsReview: false,
        revenueSubscriptionCents: 0,
        revenueFuelCents: 0,
        revenueOtherCents: 0,
        cogsFuelCents: 0,
        expenseOtherCents: 0,
        metaJson: JSON.stringify({
          destination: payout.destination,
          method: payout.method,
          status: payout.status,
        }),
        isReversal: false,
        reversesEntryId: null,
      };

      await ledgerService.createEntry(entry);
      console.log(`[Ledger] Recorded payout: ${payout.id}`);
    } catch (error) {
      console.error(`[Ledger] Failed to record payout:`, error);
    }
  }
}
