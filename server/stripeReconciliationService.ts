import { getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { ledgerEntries, type StripeReconciliation } from '@shared/schema';
import { and, gte, lte, eq, sql } from 'drizzle-orm';
import { ledgerService } from './ledgerService';
import Stripe from 'stripe';

interface ReconciliationInput {
  dateStart: Date;
  dateEnd: Date;
  toleranceCents?: number;
  autoCreateMissing?: boolean;
}

interface ReconciliationResult {
  success: boolean;
  reconciliation?: StripeReconciliation;
  error?: string;
}

export class StripeReconciliationService {
  async reconcilePeriod(input: ReconciliationInput): Promise<ReconciliationResult> {
    try {
      const stripe = await getUncachableStripeClient();
      const toleranceCents = input.toleranceCents ?? 100;
      
      const startTimestamp = Math.floor(input.dateStart.getTime() / 1000);
      const endTimestamp = Math.floor(input.dateEnd.getTime() / 1000);
      
      let stripeCharges: Stripe.Charge[] = [];
      let stripeRefunds: Stripe.Refund[] = [];
      let stripePayouts: Stripe.Payout[] = [];
      
      try {
        let hasMoreCharges = true;
        let chargesStartingAfter: string | undefined;
        while (hasMoreCharges) {
          const chargesList = await stripe.charges.list({
            created: { gte: startTimestamp, lte: endTimestamp },
            limit: 100,
            expand: ['data.balance_transaction'],
            starting_after: chargesStartingAfter,
          });
          stripeCharges.push(...chargesList.data.filter(c => c.status === 'succeeded'));
          hasMoreCharges = chargesList.has_more;
          if (chargesList.data.length > 0) {
            chargesStartingAfter = chargesList.data[chargesList.data.length - 1].id;
          } else {
            hasMoreCharges = false;
          }
        }
        
        let hasMoreRefunds = true;
        let refundsStartingAfter: string | undefined;
        while (hasMoreRefunds) {
          const refundsList = await stripe.refunds.list({
            created: { gte: startTimestamp, lte: endTimestamp },
            limit: 100,
            starting_after: refundsStartingAfter,
          });
          stripeRefunds.push(...refundsList.data.filter(r => r.status === 'succeeded'));
          hasMoreRefunds = refundsList.has_more;
          if (refundsList.data.length > 0) {
            refundsStartingAfter = refundsList.data[refundsList.data.length - 1].id;
          } else {
            hasMoreRefunds = false;
          }
        }
        
        let hasMorePayouts = true;
        let payoutsStartingAfter: string | undefined;
        while (hasMorePayouts) {
          const payoutsList = await stripe.payouts.list({
            created: { gte: startTimestamp, lte: endTimestamp },
            limit: 100,
            starting_after: payoutsStartingAfter,
          });
          stripePayouts.push(...payoutsList.data.filter(p => p.status === 'paid'));
          hasMorePayouts = payoutsList.has_more;
          if (payoutsList.data.length > 0) {
            payoutsStartingAfter = payoutsList.data[payoutsList.data.length - 1].id;
          } else {
            hasMorePayouts = false;
          }
        }
      } catch (stripeError) {
        console.error('[StripeReconciliation] Stripe API error:', stripeError);
        return { success: false, error: 'Failed to fetch Stripe data' };
      }
      
      let stripeChargesTotal = 0;
      let stripeFeesTotal = 0;
      for (const charge of stripeCharges) {
        stripeChargesTotal += charge.amount;
        const bt = charge.balance_transaction as Stripe.BalanceTransaction | null;
        if (bt) {
          stripeFeesTotal += bt.fee;
        }
      }
      
      let stripeRefundsTotal = 0;
      for (const refund of stripeRefunds) {
        stripeRefundsTotal += refund.amount;
      }
      
      const stripeNetTotal = stripeChargesTotal - stripeRefundsTotal - stripeFeesTotal;
      
      const ledgerEntriesData = await db
        .select()
        .from(ledgerEntries)
        .where(
          and(
            gte(ledgerEntries.eventDate, input.dateStart),
            lte(ledgerEntries.eventDate, input.dateEnd),
            eq(ledgerEntries.source, 'stripe')
          )
        );
      
      let ledgerRevenueTotal = 0;
      let ledgerGstTotal = 0;
      let ledgerRefundsTotal = 0;
      let ledgerFeesTotal = 0;
      
      const seenChargeIds = new Set<string>();
      
      for (const entry of ledgerEntriesData) {
        if (entry.chargeId) {
          seenChargeIds.add(entry.chargeId);
        }
        
        if (entry.isReversal) {
          ledgerRefundsTotal += entry.grossCents;
        } else {
          ledgerRevenueTotal += entry.grossCents;
          ledgerGstTotal += entry.gstCents || 0;
          ledgerFeesTotal += entry.stripeFeeCents || 0;
        }
      }
      
      let autoCreatedEntries = 0;
      const missingChargeIds: string[] = [];
      
      for (const charge of stripeCharges) {
        if (!seenChargeIds.has(charge.id)) {
          missingChargeIds.push(charge.id);
          
          if (input.autoCreateMissing) {
            const idempotencyKey = `reconcile:charge:${charge.id}`;
            const existing = await ledgerService.checkIdempotency(idempotencyKey);
            
            if (!existing) {
              const bt = charge.balance_transaction as Stripe.BalanceTransaction | null;
              const grossCents = charge.amount;
              const stripeFee = bt?.fee || 0;
              const gstCents = Math.round(grossCents * 5 / 105);
              
              await ledgerService.createEntry({
                eventDate: new Date(charge.created * 1000),
                source: 'stripe',
                entryType: 'revenue',
                category: 'unmapped',
                grossCents,
                netCents: bt?.net || (grossCents - stripeFee),
                gstCents,
                stripeFeeCents: stripeFee,
                idempotencyKey,
                chargeId: charge.id,
                paymentIntentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : null,
                gstNeedsReview: true,
                notes: 'Auto-created during Stripe reconciliation',
              });
              
              autoCreatedEntries++;
              ledgerRevenueTotal += grossCents;
              ledgerGstTotal += gstCents;
              ledgerFeesTotal += stripeFee;
            }
          }
        }
      }
      
      const mismatchAmountCents = Math.abs(stripeChargesTotal - ledgerRevenueTotal - ledgerRefundsTotal);
      const reconciled = mismatchAmountCents <= toleranceCents && missingChargeIds.length === 0;
      
      const reconciliation: StripeReconciliation = {
        stripeChargesTotal,
        stripeRefundsTotal,
        stripeFeesTotal,
        stripeNetTotal,
        ledgerRevenueTotal,
        ledgerGstTotal,
        ledgerRefundsTotal,
        ledgerFeesTotal,
        missingLedgerEntries: missingChargeIds.length,
        autoCreatedEntries,
        mismatchAmountCents,
        reconciled,
        toleranceCents,
      };
      
      return { success: true, reconciliation };
    } catch (error) {
      console.error('[StripeReconciliation] Error during reconciliation:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during Stripe reconciliation' 
      };
    }
  }
  
  async validateChargeExists(chargeId: string): Promise<boolean> {
    const results = await db
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.chargeId, chargeId))
      .limit(1);
    
    return results.length > 0;
  }
  
  async getUnmappedEntries(limit: number = 50): Promise<typeof ledgerEntries.$inferSelect[]> {
    return db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.category, 'unmapped'))
      .limit(limit);
  }
  
  async getEntriesNeedingGstReview(limit: number = 50): Promise<typeof ledgerEntries.$inferSelect[]> {
    return db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.gstNeedsReview, true))
      .limit(limit);
  }
}

export const stripeReconciliationService = new StripeReconciliationService();
