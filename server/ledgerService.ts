import { db } from "./db";
import { ledgerEntries, type InsertLedgerEntry, type LedgerEntry } from "@shared/schema";
import { eq, or, and, sql, desc, gte, lte } from "drizzle-orm";

export class LedgerError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "LedgerError";
  }
}

export class ReconciliationError extends LedgerError {
  constructor(
    message: string,
    public expected: number,
    public actual: number
  ) {
    super(message, "RECONCILIATION_FAILED");
  }
}

export interface CreateLedgerEntryInput extends Omit<InsertLedgerEntry, "id" | "createdAt" | "updatedAt" | "postedAt"> {}

export const ledgerService = {
  async checkIdempotency(idempotencyKey: string): Promise<LedgerEntry | null> {
    const result = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.idempotencyKey, idempotencyKey))
      .limit(1) as LedgerEntry[];
    return result[0] || null;
  },

  async checkByChargeId(chargeId: string): Promise<LedgerEntry | null> {
    const result = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.chargeId, chargeId))
      .limit(1) as LedgerEntry[];
    return result[0] || null;
  },

  async checkBySourceId(sourceId: string): Promise<LedgerEntry | null> {
    const result = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.sourceId, sourceId))
      .limit(1) as LedgerEntry[];
    return result[0] || null;
  },

  validateReconciliation(entry: CreateLedgerEntryInput): void {
    const exemptTypes = ["payout", "fuel_cost", "expense", "adjustment", "owner_draw", "refund"];
    if (exemptTypes.includes(entry.sourceType)) {
      return;
    }

    const gross = entry.grossAmountCents ?? 0;
    const gst = entry.gstCollectedCents ?? 0;
    const revSub = entry.revenueSubscriptionCents ?? 0;
    const revFuel = entry.revenueFuelCents ?? 0;
    const revOther = entry.revenueOtherCents ?? 0;

    if (gross === 0 && revSub === 0 && revFuel === 0 && revOther === 0) {
      return;
    }

    const hasCogs = (entry.cogsFuelCents ?? 0) !== 0;
    const hasExpenses = (entry.expenseOtherCents ?? 0) !== 0;
    if (hasCogs || hasExpenses) {
      return;
    }

    const expectedPreTax = gross - gst;
    const actualPreTax = revSub + revFuel + revOther;

    if (expectedPreTax !== actualPreTax) {
      throw new ReconciliationError(
        `Revenue reconciliation failed: expected ${expectedPreTax} (gross ${gross} - gst ${gst}), got ${actualPreTax} (sub ${revSub} + fuel ${revFuel} + other ${revOther})`,
        expectedPreTax,
        actualPreTax
      );
    }
  },

  async createEntry(input: CreateLedgerEntryInput): Promise<LedgerEntry> {
    const existing = await this.checkIdempotency(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    this.validateReconciliation(input);

    const [entry] = await db.insert(ledgerEntries).values(input).returning() as LedgerEntry[];
    return entry;
  },

  async findOriginalForRefund(
    chargeId?: string | null,
    paymentIntentId?: string | null,
    sourceId?: string | null
  ): Promise<LedgerEntry | null> {
    const conditions: ReturnType<typeof eq>[] = [];
    
    if (chargeId) {
      conditions.push(eq(ledgerEntries.chargeId, chargeId));
    }
    if (paymentIntentId) {
      conditions.push(eq(ledgerEntries.paymentIntentId, paymentIntentId));
    }
    if (sourceId) {
      conditions.push(eq(ledgerEntries.sourceId, sourceId));
    }

    if (conditions.length === 0) {
      return null;
    }

    const result = await db
      .select()
      .from(ledgerEntries)
      .where(and(
        or(...conditions),
        eq(ledgerEntries.isReversal, false)
      ))
      .orderBy(desc(ledgerEntries.eventDate))
      .limit(1) as LedgerEntry[];

    return result[0] || null;
  },

  createRefundEntry(
    original: LedgerEntry,
    refundAmountCents: number,
    refundId: string,
    stripeEventId: string,
    eventDate: Date
  ): CreateLedgerEntryInput {
    const originalGross = original.grossAmountCents || 0;
    
    if (originalGross === 0 && refundAmountCents === 0) {
      return {
        eventDate,
        source: "stripe",
        sourceType: "refund",
        sourceId: refundId,
        stripeEventId,
        idempotencyKey: `stripe:event:${stripeEventId}`,
        chargeId: original.chargeId,
        paymentIntentId: original.paymentIntentId,
        stripeCustomerId: original.stripeCustomerId,
        userId: original.userId,
        orderId: original.orderId,
        description: `Refund for ${original.description} (zero-value)`,
        category: original.category,
        currency: original.currency || "cad",
        grossAmountCents: 0,
        netAmountCents: 0,
        stripeFeeCents: 0,
        gstCollectedCents: 0,
        gstPaidCents: 0,
        gstNeedsReview: false,
        revenueSubscriptionCents: 0,
        revenueFuelCents: 0,
        revenueOtherCents: 0,
        cogsFuelCents: 0,
        expenseOtherCents: 0,
        // Zero allocation fields for zero-value refund
        allocOperatingCents: 0,
        allocGstHoldingCents: 0,
        allocDeferredSubCents: 0,
        allocIncomeTaxCents: 0,
        allocMaintenanceCents: 0,
        allocEmergencyRiskCents: 0,
        allocGrowthCapitalCents: 0,
        allocOwnerDrawCents: 0,
        isReversal: true,
        reversesEntryId: original.id,
      };
    }
    
    if (originalGross === 0 && refundAmountCents > 0) {
      const gstPortion = Math.round(refundAmountCents * 5 / 105);
      const preTaxRevenue = refundAmountCents - gstPortion;
      return {
        eventDate,
        source: "stripe",
        sourceType: "refund",
        sourceId: refundId,
        stripeEventId,
        idempotencyKey: `stripe:event:${stripeEventId}`,
        chargeId: original.chargeId,
        paymentIntentId: original.paymentIntentId,
        stripeCustomerId: original.stripeCustomerId,
        userId: original.userId,
        orderId: original.orderId,
        description: `Refund for ${original.description} (needs review - zero-value original)`,
        category: original.category,
        currency: original.currency || "cad",
        grossAmountCents: -refundAmountCents,
        netAmountCents: -refundAmountCents,
        stripeFeeCents: 0,
        gstCollectedCents: -gstPortion,
        gstPaidCents: 0,
        gstNeedsReview: true,
        revenueSubscriptionCents: 0,
        revenueFuelCents: 0,
        revenueOtherCents: -preTaxRevenue,
        cogsFuelCents: 0,
        expenseOtherCents: 0,
        // Negative allocation fields to reverse buckets
        allocOperatingCents: 0,
        allocGstHoldingCents: -gstPortion,
        allocDeferredSubCents: 0,
        allocIncomeTaxCents: 0,
        allocMaintenanceCents: 0,
        allocEmergencyRiskCents: 0,
        allocGrowthCapitalCents: 0,
        allocOwnerDrawCents: -preTaxRevenue,
        isReversal: true,
        reversesEntryId: original.id,
      };
    }
    
    const proportion = refundAmountCents / originalGross;
    
    const proportionalGst = Math.round((original.gstCollectedCents || 0) * proportion);
    const proportionalRevSub = Math.round((original.revenueSubscriptionCents || 0) * proportion);
    const proportionalRevFuel = Math.round((original.revenueFuelCents || 0) * proportion);
    const proportionalRevOther = Math.round((original.revenueOtherCents || 0) * proportion);

    const preCheck = proportionalRevSub + proportionalRevFuel + proportionalRevOther;
    const expectedPreTax = refundAmountCents - proportionalGst;
    
    let adjustedRevOther = proportionalRevOther;
    if (preCheck !== expectedPreTax) {
      adjustedRevOther = expectedPreTax - proportionalRevSub - proportionalRevFuel;
    }

    // Calculate proportional negative bucket allocations from original entry
    const proportionalAllocOperating = Math.round((original.allocOperatingCents || 0) * proportion);
    const proportionalAllocGst = Math.round((original.allocGstHoldingCents || 0) * proportion);
    const proportionalAllocDeferred = Math.round((original.allocDeferredSubCents || 0) * proportion);
    const proportionalAllocTax = Math.round((original.allocIncomeTaxCents || 0) * proportion);
    const proportionalAllocMaint = Math.round((original.allocMaintenanceCents || 0) * proportion);
    const proportionalAllocEmergency = Math.round((original.allocEmergencyRiskCents || 0) * proportion);
    const proportionalAllocGrowth = Math.round((original.allocGrowthCapitalCents || 0) * proportion);
    const proportionalAllocOwner = Math.round((original.allocOwnerDrawCents || 0) * proportion);

    return {
      eventDate,
      source: "stripe",
      sourceType: "refund",
      sourceId: refundId,
      stripeEventId,
      idempotencyKey: `stripe:event:${stripeEventId}`,
      chargeId: original.chargeId,
      paymentIntentId: original.paymentIntentId,
      stripeCustomerId: original.stripeCustomerId,
      userId: original.userId,
      orderId: original.orderId,
      description: `Refund for ${original.description}`,
      category: original.category,
      currency: original.currency || "cad",
      grossAmountCents: -refundAmountCents,
      netAmountCents: -refundAmountCents,
      stripeFeeCents: 0,
      gstCollectedCents: -proportionalGst,
      gstPaidCents: 0,
      gstNeedsReview: false,
      revenueSubscriptionCents: -proportionalRevSub,
      revenueFuelCents: -proportionalRevFuel,
      revenueOtherCents: -adjustedRevOther,
      cogsFuelCents: 0,
      expenseOtherCents: 0,
      // Proportional negative bucket allocations to reverse balances
      allocOperatingCents: -proportionalAllocOperating,
      allocGstHoldingCents: -proportionalAllocGst,
      allocDeferredSubCents: -proportionalAllocDeferred,
      allocIncomeTaxCents: -proportionalAllocTax,
      allocMaintenanceCents: -proportionalAllocMaint,
      allocEmergencyRiskCents: -proportionalAllocEmergency,
      allocGrowthCapitalCents: -proportionalAllocGrowth,
      allocOwnerDrawCents: -proportionalAllocOwner,
      isReversal: true,
      reversesEntryId: original.id,
    };
  },

  async getEntriesByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<LedgerEntry[]> {
    return await db
      .select()
      .from(ledgerEntries)
      .where(and(
        gte(ledgerEntries.eventDate, startDate),
        lte(ledgerEntries.eventDate, endDate)
      ))
      .orderBy(desc(ledgerEntries.eventDate)) as LedgerEntry[];
  },

  async getEntriesNeedingGstReview(): Promise<LedgerEntry[]> {
    return await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.gstNeedsReview, true))
      .orderBy(desc(ledgerEntries.eventDate)) as LedgerEntry[];
  },

  async getUnmappedRevenue(): Promise<LedgerEntry[]> {
    return await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.category, "revenue_unmapped"))
      .orderBy(desc(ledgerEntries.eventDate)) as LedgerEntry[];
  },

  async findByOrderId(orderId: string): Promise<LedgerEntry | null> {
    const result = await db
      .select()
      .from(ledgerEntries)
      .where(and(
        eq(ledgerEntries.orderId, orderId),
        eq(ledgerEntries.isReversal, false)
      ))
      .orderBy(desc(ledgerEntries.eventDate))
      .limit(1) as LedgerEntry[];
    return result[0] || null;
  },

  async createDirectRefundEntry(
    original: LedgerEntry,
    refundId: string,
    eventDate: Date
  ): Promise<LedgerEntry> {
    const originalGross = original.grossAmountCents || 0;
    const idempotencyKey = `direct:refund:${refundId}`;
    
    const existing = await this.checkIdempotency(idempotencyKey);
    if (existing) {
      return existing;
    }

    const proportion = 1; // Full refund
    const proportionalGst = original.gstCollectedCents || 0;
    const proportionalRevSub = original.revenueSubscriptionCents || 0;
    const proportionalRevFuel = original.revenueFuelCents || 0;
    const proportionalRevOther = original.revenueOtherCents || 0;

    const input = {
      eventDate,
      source: "stripe" as const,
      sourceType: "refund" as const,
      sourceId: refundId,
      stripeEventId: null,
      idempotencyKey,
      chargeId: original.chargeId,
      paymentIntentId: original.paymentIntentId,
      stripeCustomerId: original.stripeCustomerId,
      userId: original.userId,
      orderId: original.orderId,
      description: `Refund for ${original.description}`,
      category: original.category,
      currency: original.currency || "cad",
      grossAmountCents: -originalGross,
      netAmountCents: -originalGross,
      stripeFeeCents: 0,
      gstCollectedCents: -proportionalGst,
      gstPaidCents: 0,
      gstNeedsReview: false,
      revenueSubscriptionCents: -proportionalRevSub,
      revenueFuelCents: -proportionalRevFuel,
      revenueOtherCents: -proportionalRevOther,
      cogsFuelCents: 0,
      expenseOtherCents: 0,
      isReversal: true,
      reversesEntryId: original.id,
    };

    const [entry] = await db.insert(ledgerEntries).values(input).returning() as LedgerEntry[];
    return entry;
  },

  mapTierToCategory(tierId: string | null | undefined): "subscription_payg" | "subscription_access" | "subscription_household" | "subscription_rural" | "subscription_emergency" | "revenue_unmapped" {
    const tierMap: Record<string, "subscription_payg" | "subscription_access" | "subscription_household" | "subscription_rural" | "subscription_emergency"> = {
      "payg": "subscription_payg",
      "access": "subscription_access",
      "household": "subscription_household",
      "rural": "subscription_rural",
      "emergency": "subscription_emergency",
    };
    
    if (!tierId) return "revenue_unmapped";
    const normalized = tierId.toLowerCase();
    return tierMap[normalized] || "revenue_unmapped";
  },

  async getMonthlySummary(year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const entries = await this.getEntriesByDateRange(startDate, endDate);

    let totalRevenue = 0;
    let subscriptionRevenue = 0;
    let fuelRevenue = 0;
    let otherRevenue = 0;
    let gstCollected = 0;
    let stripeFees = 0;
    let refunds = 0;
    let payouts = 0;

    for (const entry of entries) {
      if (entry.sourceType === "payout") {
        payouts += entry.grossAmountCents || 0;
        continue;
      }
      
      if (entry.isReversal) {
        refunds += Math.abs(entry.grossAmountCents || 0);
      }

      subscriptionRevenue += entry.revenueSubscriptionCents || 0;
      fuelRevenue += entry.revenueFuelCents || 0;
      otherRevenue += entry.revenueOtherCents || 0;
      gstCollected += entry.gstCollectedCents || 0;
      stripeFees += entry.stripeFeeCents || 0;
    }

    totalRevenue = subscriptionRevenue + fuelRevenue + otherRevenue;

    return {
      period: { year, month },
      totalRevenue,
      subscriptionRevenue,
      fuelRevenue,
      otherRevenue,
      gstCollected,
      stripeFees,
      refunds,
      payouts,
      netRevenue: totalRevenue - stripeFees,
      entryCount: entries.length,
    };
  },

  async getGstSummary(year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const entries = await this.getEntriesByDateRange(startDate, endDate);

    let gstCollected = 0;
    let gstPaid = 0;
    let needsReviewCount = 0;

    for (const entry of entries) {
      gstCollected += entry.gstCollectedCents || 0;
      gstPaid += entry.gstPaidCents || 0;
      if (entry.gstNeedsReview) needsReviewCount++;
    }

    return {
      period: { year, month },
      gstCollected,
      gstPaid,
      netGstOwing: gstCollected - gstPaid,
      needsReviewCount,
    };
  },

  async getCashFlowSummary(year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const entries = await this.getEntriesByDateRange(startDate, endDate);

    let grossIncome = 0;
    let refunds = 0;
    let stripeFees = 0;
    let payouts = 0;
    let cogsFuel = 0;
    let expensesOther = 0;

    for (const entry of entries) {
      if (entry.sourceType === "payout") {
        payouts += entry.grossAmountCents || 0;
        continue;
      }

      if (entry.isReversal) {
        refunds += Math.abs(entry.grossAmountCents || 0);
      } else {
        grossIncome += entry.grossAmountCents || 0;
      }
      
      stripeFees += entry.stripeFeeCents || 0;
      cogsFuel += entry.cogsFuelCents || 0;
      expensesOther += entry.expenseOtherCents || 0;
    }

    return {
      period: { year, month },
      grossIncome,
      refunds,
      netIncome: grossIncome - refunds,
      stripeFees,
      cogsFuel,
      expensesOther,
      totalExpenses: stripeFees + cogsFuel + expensesOther,
      cashFlow: grossIncome - refunds - stripeFees - cogsFuel - expensesOther,
      payouts,
    };
  },
};

const CALGARY_TIMEZONE = 'America/Edmonton';

function getCalgaryDateParts(): { year: number; month: number; day: number; hour: number; minute: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALGARY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  return {
    year: parseInt(parts.find(p => p.type === 'year')?.value || '2025'),
    month: parseInt(parts.find(p => p.type === 'month')?.value || '1'),
    day: parseInt(parts.find(p => p.type === 'day')?.value || '1'),
    hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
    minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
  };
}

function getCalgaryDateString(): string {
  const parts = getCalgaryDateParts();
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

let lastCancelledOrderCleanupDate: string | null = null;

async function processCancelledOrderReversals(): Promise<{ processed: number; results: { orderId: string; success: boolean; message: string }[] }> {
  const { orders } = await import('@shared/schema');
  const { waterfallService } = await import('./waterfallService');
  const { getUncachableStripeClient } = await import('./stripeClient');
  const { storage } = await import('./storage');
  const stripe = await getUncachableStripeClient();
  
  const cancelledOrders = await db
    .select()
    .from(orders)
    .where(and(
      eq(orders.status, 'cancelled'),
      eq(orders.paymentStatus, 'captured')
    ));
  
  const results: { orderId: string; success: boolean; message: string }[] = [];
  
  for (const order of cancelledOrders) {
    const existingReversal = await db
      .select()
      .from(ledgerEntries)
      .where(and(
        eq(ledgerEntries.orderId, order.id),
        eq(ledgerEntries.isReversal, true)
      ))
      .limit(1);
    
    if (existingReversal.length > 0) {
      // Normalize stale paymentStatus if reversal exists but status still shows captured
      await storage.updateOrderPaymentInfo(order.id, { paymentStatus: 'refunded' });
      results.push({ orderId: order.id, success: true, message: 'Reversal already exists, normalized paymentStatus' });
      continue;
    }
    
    const originalEntry = await ledgerService.findByOrderId(order.id);
    
    if (!originalEntry) {
      results.push({ orderId: order.id, success: false, message: 'No original ledger entry found' });
      continue;
    }
    
    try {
      let refundId: string | null = null;
      let refundIssued = false;
      let alreadyRefunded = false;
      
      if (order.stripePaymentIntentId) {
        try {
          const refund = await stripe.refunds.create({
            payment_intent: order.stripePaymentIntentId,
            reason: 'requested_by_customer',
          });
          refundId = refund.id;
          refundIssued = true;
        } catch (stripeError: any) {
          if (stripeError.code === 'charge_already_refunded') {
            alreadyRefunded = true;
            refundId = `already_refunded_pi_${order.id}`;
          } else {
            throw stripeError;
          }
        }
      } else if (originalEntry.chargeId) {
        try {
          const refund = await stripe.refunds.create({
            charge: originalEntry.chargeId,
            reason: 'requested_by_customer',
          });
          refundId = refund.id;
          refundIssued = true;
        } catch (stripeError: any) {
          if (stripeError.code === 'charge_already_refunded') {
            alreadyRefunded = true;
            refundId = `already_refunded_ch_${order.id}`;
          } else {
            throw stripeError;
          }
        }
      }
      
      if (!refundIssued && !alreadyRefunded) {
        results.push({ 
          orderId: order.id, 
          success: false, 
          message: 'No payment intent or charge ID available for refund' 
        });
        continue;
      }
      
      await storage.updateOrderPaymentInfo(order.id, { paymentStatus: 'refunded' });
      
      await ledgerService.createDirectRefundEntry(
        originalEntry,
        refundId!,
        new Date()
      );
      
      const fuelReversal = await waterfallService.reverseTransaction(`order_fuel_${order.id}`);
      const deliveryReversal = await waterfallService.reverseTransaction(`order_delivery_${order.id}`);
      
      const fuelReversed = fuelReversal.allocations.length;
      const deliveryReversed = deliveryReversal.allocations.length;
      
      const refundStatus = alreadyRefunded ? 'already refunded' : 'refund issued';
      results.push({ 
        orderId: order.id, 
        success: true, 
        message: `${refundStatus}, ${fuelReversed} fuel + ${deliveryReversed} delivery allocations reversed` 
      });
      
    } catch (err: any) {
      results.push({ orderId: order.id, success: false, message: err.message || 'Unknown error' });
    }
  }
  
  return { processed: results.length, results };
}

export function scheduleCancelledOrderCleanup(): void {
  const checkAndProcess = async () => {
    const parts = getCalgaryDateParts();
    const calgaryHour = parts.hour;
    const calgaryMinutes = parts.minute;
    const todayStr = getCalgaryDateString();
    
    if (calgaryHour === 4 && calgaryMinutes < 10 && lastCancelledOrderCleanupDate !== todayStr) {
      console.log('[LedgerCleanup] Running scheduled cancelled order reversal cleanup...');
      lastCancelledOrderCleanupDate = todayStr;
      try {
        const result = await processCancelledOrderReversals();
        if (result.processed > 0) {
          const successCount = result.results.filter(r => r.success).length;
          console.log(`[LedgerCleanup] Cleanup complete: ${successCount}/${result.processed} orders processed successfully`);
        }
      } catch (error) {
        console.error('[LedgerCleanup] Failed to process cancelled order reversals:', error);
        lastCancelledOrderCleanupDate = null;
      }
    }
  };
  
  setInterval(checkAndProcess, 60 * 1000);
  console.log('[LedgerCleanup] Scheduler initialized - will run at 4am Calgary time daily');
}
