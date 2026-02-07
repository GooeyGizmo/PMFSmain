import { getUncachableStripeClient } from './stripeClient';
import { ledgerService, type CreateLedgerEntryInput } from './ledgerService';
import { storage } from './storage';
import type Stripe from 'stripe';

interface BackfillOptions {
  startDate?: Date;
  endDate?: Date;
  dryRun?: boolean;
}

interface BackfillResult {
  invoices: { processed: number; skipped: number; errors: number };
  charges: { processed: number; skipped: number; errors: number };
  refunds: { processed: number; skipped: number; errors: number };
  payouts: { processed: number; skipped: number; errors: number };
  errors: Array<{ type: string; id: string; error: string }>;
}

export async function backfillLedgerFromStripe(options: BackfillOptions = {}): Promise<BackfillResult> {
  const stripe = await getUncachableStripeClient();
  const result: BackfillResult = {
    invoices: { processed: 0, skipped: 0, errors: 0 },
    charges: { processed: 0, skipped: 0, errors: 0 },
    refunds: { processed: 0, skipped: 0, errors: 0 },
    payouts: { processed: 0, skipped: 0, errors: 0 },
    errors: [],
  };

  const startTimestamp = options.startDate ? Math.floor(options.startDate.getTime() / 1000) : undefined;
  const endTimestamp = options.endDate ? Math.floor(options.endDate.getTime() / 1000) : undefined;

  const users = await storage.getAllUsers();
  const usersByStripeId = new Map(users.filter(u => u.stripeCustomerId).map(u => [u.stripeCustomerId!, u]));

  console.log('[Backfill] Starting ledger backfill...');

  await backfillInvoices(stripe, result, usersByStripeId, startTimestamp, endTimestamp, options.dryRun);
  await backfillCharges(stripe, result, usersByStripeId, startTimestamp, endTimestamp, options.dryRun);
  await backfillRefunds(stripe, result, startTimestamp, endTimestamp, options.dryRun);
  await backfillPayouts(stripe, result, startTimestamp, endTimestamp, options.dryRun);

  console.log('[Backfill] Complete:', result);
  return result;
}

async function backfillInvoices(
  stripe: Stripe,
  result: BackfillResult,
  usersByStripeId: Map<string, any>,
  startTimestamp?: number,
  endTimestamp?: number,
  dryRun?: boolean
): Promise<void> {

  const invoiceParams: Stripe.InvoiceListParams = {
    limit: 100,
    status: 'paid',
    expand: ['data.charge.balance_transaction'],
  };
  if (startTimestamp) invoiceParams.created = { gte: startTimestamp };
  if (endTimestamp) {
    invoiceParams.created = { ...invoiceParams.created as any, lte: endTimestamp };
  }

  for await (const invoice of stripe.invoices.list(invoiceParams)) {
    // Skip invoice backfill entirely - charges capture the same revenue with proper GST/fees
    // Invoice entries were creating duplicates without proper GST breakdown
    result.invoices.skipped++;
  }
}

async function backfillCharges(
  stripe: Stripe,
  result: BackfillResult,
  usersByStripeId: Map<string, any>,
  startTimestamp?: number,
  endTimestamp?: number,
  dryRun?: boolean
): Promise<void> {

  const chargeParams: Stripe.ChargeListParams = {
    limit: 100,
    expand: ['data.balance_transaction'],
  };
  if (startTimestamp) chargeParams.created = { gte: startTimestamp };
  if (endTimestamp) {
    chargeParams.created = { ...chargeParams.created as any, lte: endTimestamp };
  }

  for await (const charge of stripe.charges.list(chargeParams)) {
    if ((charge as any).invoice) {
      result.charges.skipped++;
      continue;
    }

    if (!charge.paid || charge.refunded) {
      result.charges.skipped++;
      continue;
    }

    const idempotencyKey = `bf:charge:${charge.id}`;
    
    // Check if entry already exists by idempotency key OR by charge_id
    const existingByKey = await ledgerService.checkIdempotency(idempotencyKey);
    const existingByChargeId = await ledgerService.checkByChargeId(charge.id);
    if (existingByKey || existingByChargeId) {
      result.charges.skipped++;
      continue;
    }

    try {
      const balanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction | null;
      // Use amount_captured for actual captured amount (not pre-auth amount)
      const grossAmountCents = charge.amount_captured || charge.amount || 0;
      const stripeFeeCents = balanceTransaction?.fee || 0;
      // Always calculate net as gross minus fees (more reliable)
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
      const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
      const user = customerId ? usersByStripeId.get(customerId) : null;

      // Calculate fuel COGS from wholesale cost × litres delivered
      let cogsFuelCents = 0;
      if (orderId) {
        const order = await storage.getOrder(orderId);
        const litresDelivered = order?.actualLitresDelivered
          ? parseFloat(order.actualLitresDelivered)
          : 0;
        if (litresDelivered > 0) {
          const { waterfallService } = await import('./waterfallService');
          const fuelType = order?.fuelType || 'regular';
          const wholesaleCostPerLitreCents = await waterfallService.getCurrentCOGS(fuelType);
          if (wholesaleCostPerLitreCents > 0) {
            cogsFuelCents = Math.round(wholesaleCostPerLitreCents * litresDelivered);
          }
        }
      }

      const entry: CreateLedgerEntryInput = {
        eventDate: new Date(charge.created * 1000),
        source: 'stripe',
        sourceType: 'charge',
        sourceId: charge.id,
        stripeEventId: null,
        idempotencyKey,
        chargeId: charge.id,
        paymentIntentId: typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id || null,
        stripeCustomerId: customerId || null,
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
        cogsFuelCents,
        expenseOtherCents: 0,
        metaJson: JSON.stringify({ backfilled: true, hasOrder: !!orderId }),
        isReversal: false,
        reversesEntryId: null,
      };

      if (!dryRun) {
        await ledgerService.createEntry(entry);
      }
      result.charges.processed++;
    } catch (error: any) {
      result.charges.errors++;
      result.errors.push({ type: 'charge', id: charge.id, error: error.message });
      console.error(`[Backfill] Error processing charge ${charge.id}:`, error.message);
    }
  }
}

async function backfillRefunds(
  stripe: Stripe,
  result: BackfillResult,
  startTimestamp?: number,
  endTimestamp?: number,
  dryRun?: boolean
): Promise<void> {

  const refundParams: Stripe.RefundListParams = { limit: 100 };
  if (startTimestamp) refundParams.created = { gte: startTimestamp };
  if (endTimestamp) {
    refundParams.created = { ...refundParams.created as any, lte: endTimestamp };
  }

  for await (const refund of stripe.refunds.list(refundParams)) {
    const idempotencyKey = `bf:refund:${refund.id}`;
    
    // Check if entry already exists by idempotency key OR by source_id (refund ID)
    const existingByKey = await ledgerService.checkIdempotency(idempotencyKey);
    const existingBySourceId = await ledgerService.checkBySourceId(refund.id);
    if (existingByKey || existingBySourceId) {
      result.refunds.skipped++;
      continue;
    }

    try {
      const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
      const paymentIntentId = typeof refund.payment_intent === 'string'
        ? refund.payment_intent
        : refund.payment_intent?.id;

      const original = await ledgerService.findOriginalForRefund(chargeId, paymentIntentId);

      if (!original) {
        const grossAmountCents = refund.amount || 0;
        const gstCollectedCents = Math.round(grossAmountCents * 5 / 105);
        const preTaxRevenue = grossAmountCents - gstCollectedCents;

        const entry: CreateLedgerEntryInput = {
          eventDate: new Date(refund.created * 1000),
          source: 'stripe',
          sourceType: 'refund',
          sourceId: refund.id,
          stripeEventId: null,
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
          metaJson: JSON.stringify({ backfilled: true, reason: refund.reason, noOriginalFound: true }),
          isReversal: true,
          reversesEntryId: null,
        };

        if (!dryRun) {
          await ledgerService.createEntry(entry);
        }
      } else {
        const refundEntry = ledgerService.createRefundEntry(
          original,
          refund.amount || 0,
          refund.id,
          idempotencyKey,
          new Date(refund.created * 1000)
        );

        refundEntry.idempotencyKey = idempotencyKey;
        refundEntry.stripeEventId = null;

        if (!dryRun) {
          await ledgerService.createEntry(refundEntry);
        }
      }

      result.refunds.processed++;
    } catch (error: any) {
      result.refunds.errors++;
      result.errors.push({ type: 'refund', id: refund.id, error: error.message });
      console.error(`[Backfill] Error processing refund ${refund.id}:`, error.message);
    }
  }
}

async function backfillPayouts(
  stripe: Stripe,
  result: BackfillResult,
  startTimestamp?: number,
  endTimestamp?: number,
  dryRun?: boolean
): Promise<void> {

  const payoutParams: Stripe.PayoutListParams = {
    limit: 100,
    status: 'paid',
  };
  if (startTimestamp) payoutParams.created = { gte: startTimestamp };
  if (endTimestamp) {
    payoutParams.created = { ...payoutParams.created as any, lte: endTimestamp };
  }

  for await (const payout of stripe.payouts.list(payoutParams)) {
    const idempotencyKey = `bf:payout:${payout.id}`;
    const existing = await ledgerService.checkIdempotency(idempotencyKey);
    if (existing) {
      result.payouts.skipped++;
      continue;
    }

    try {
      const entry: CreateLedgerEntryInput = {
        eventDate: new Date((payout.arrival_date || payout.created) * 1000),
        source: 'stripe',
        sourceType: 'payout',
        sourceId: payout.id,
        stripeEventId: null,
        idempotencyKey,
        chargeId: null,
        paymentIntentId: null,
        stripeCustomerId: null,
        userId: null,
        orderId: null,
        description: `Payout to bank account`,
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
        metaJson: JSON.stringify({ backfilled: true, method: payout.method, status: payout.status }),
        isReversal: false,
        reversesEntryId: null,
      };

      if (!dryRun) {
        await ledgerService.createEntry(entry);
      }
      result.payouts.processed++;
    } catch (error: any) {
      result.payouts.errors++;
      result.errors.push({ type: 'payout', id: payout.id, error: error.message });
      console.error(`[Backfill] Error processing payout ${payout.id}:`, error.message);
    }
  }
}
