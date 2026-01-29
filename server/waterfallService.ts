/**
 * PMFS 9-Bucket Waterfall Accounting Service
 * Version: Final v1
 * 
 * Implements automated waterfall allocation logic that routes incoming revenue
 * into 9 financial buckets consistently, deterministically, and audit-safely.
 */

import { db } from "./db";
import { 
  financialAccounts, 
  financialTransactions, 
  allocationRules,
  ledgerEntries,
  fuelPricing,
  type FinancialAccount,
  type AllocationRule
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export type RevenueType = "fuel_sale" | "delivery_fee" | "subscription_fee";

export type BucketType = 
  | "operating_chequing"
  | "gst_holding"
  | "deferred_subscription"
  | "income_tax_reserve"
  | "maintenance_reserve"
  | "emergency_risk"
  | "growth_capital"
  | "owner_draw_holding";

export interface AllocationRecord {
  sourceBucket: BucketType;
  destinationBucket: BucketType;
  amountCents: number;
  revenueType: RevenueType;
  transactionId: string;
  description: string;
}

export interface WaterfallInput {
  transactionId: string;
  revenueType: RevenueType;
  grossAmountCents: number;
  stripeFeeCents?: number;  // Actual Stripe fee from webhook - deducted before bucket allocation
  litresDelivered?: number;
  wholesaleCostPerLitreCents?: number;
  isReversal?: boolean;
}

export interface WaterfallResult {
  success: boolean;
  allocations: AllocationRecord[];
  gstAmountCents: number;
  netAmountCents: number;       // After GST extraction
  netAfterStripeCents: number;  // After both GST and Stripe fee - what actually gets allocated
  stripeFeeCents: number;       // Stripe fee tracked separately
  marginCents?: number;
  error?: string;
}

const GST_RATE = 0.05;

export const waterfallService = {
  /**
   * Extract GST from a gross amount using GST-inclusive method.
   * GST = gross_amount - (gross_amount / 1.05)
   */
  extractGst(grossAmountCents: number): { gstCents: number; netCents: number } {
    const netCents = Math.round(grossAmountCents / 1.05);
    const gstCents = grossAmountCents - netCents;
    return { gstCents, netCents };
  },

  /**
   * Get current wholesale cost (COGS) per litre for a fuel type from fuel_pricing table.
   * Returns cost in cents per litre.
   */
  async getCurrentCOGS(fuelType: string = 'regular'): Promise<number> {
    const [pricing] = await db
      .select()
      .from(fuelPricing)
      .where(eq(fuelPricing.fuelType, fuelType as any))
      .limit(1);
    
    if (pricing && pricing.baseCost) {
      // baseCost is stored in dollars, convert to cents
      return Math.round(parseFloat(pricing.baseCost) * 100);
    }
    
    // Fallback: return 0 if no COGS data available (will use passed value or fail gracefully)
    console.warn(`[Waterfall] No COGS found for fuel type: ${fuelType}`);
    return 0;
  },

  /**
   * Get allocation rules for a specific revenue type.
   */
  async getAllocationRules(revenueType: RevenueType): Promise<AllocationRule[]> {
    const rules = await db
      .select()
      .from(allocationRules)
      .where(
        and(
          eq(allocationRules.revenueType, revenueType),
          eq(allocationRules.isActive, true)
        )
      );
    return rules as AllocationRule[];
  },

  /**
   * Get a financial account by type.
   */
  async getAccountByType(accountType: BucketType): Promise<FinancialAccount | null> {
    const [account] = await db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.accountType, accountType))
      .limit(1);
    return account as FinancialAccount || null;
  },

  /**
   * Update account balance by adding/subtracting an amount.
   */
  async updateAccountBalance(accountType: BucketType, amountCents: number): Promise<void> {
    const amountDollars = amountCents / 100;
    await db
      .update(financialAccounts)
      .set({
        balance: sql`${financialAccounts.balance} + ${amountDollars}`,
        updatedAt: new Date()
      })
      .where(eq(financialAccounts.accountType, accountType));
  },

  /**
   * Record a financial transaction for audit purposes.
   * Uses "allocation" for normal allocations, "manual_adjustment" for reversals.
   */
  async recordTransaction(
    accountType: BucketType,
    amountCents: number,
    isReversal: boolean,
    description: string,
    referenceId: string,
    referenceType: string
  ): Promise<void> {
    const account = await this.getAccountByType(accountType);
    if (!account) {
      throw new Error(`Account not found: ${accountType}`);
    }

    const transactionType = isReversal ? "manual_adjustment" : "allocation";

    await db.insert(financialTransactions).values({
      accountId: account.id,
      transactionType,
      amount: (amountCents / 100).toFixed(2),
      description,
      referenceType,
      referenceId
    });
  },

  /**
   * Process a fuel sale through the waterfall.
   * Allocations are margin-based, not gross revenue based.
   * Stripe fee is tracked separately and deducted before margin calculation.
   * 
   * Flow: Gross → Extract GST → Deduct Stripe Fee → Calculate Margin → Allocate from Margin
   */
  async processFuelSale(input: WaterfallInput): Promise<WaterfallResult> {
    const { transactionId, grossAmountCents, stripeFeeCents = 0, litresDelivered, wholesaleCostPerLitreCents, isReversal } = input;
    const allocations: AllocationRecord[] = [];
    const multiplier = isReversal ? -1 : 1;

    // GST is extracted from customer-paid gross (GST is on what customer paid)
    const { gstCents, netCents } = this.extractGst(grossAmountCents);
    
    // What you actually receive after Stripe takes their cut
    const netAfterStripeCents = netCents - stripeFeeCents;
    
    allocations.push({
      sourceBucket: "operating_chequing",
      destinationBucket: "gst_holding",
      amountCents: gstCents * multiplier,
      revenueType: "fuel_sale",
      transactionId,
      description: isReversal ? "GST reversal for refund" : "GST collected on fuel sale"
    });

    if (!litresDelivered || !wholesaleCostPerLitreCents) {
      return {
        success: false,
        allocations,
        gstAmountCents: gstCents,
        netAmountCents: netCents,
        netAfterStripeCents,
        stripeFeeCents,
        error: "Fuel sale requires litresDelivered and wholesaleCostPerLitreCents"
      };
    }

    // COGS is calculated on litres delivered
    const cogsCents = Math.round(litresDelivered * wholesaleCostPerLitreCents);
    
    // Margin = Net after Stripe fee - COGS
    // This ensures bucket allocations sum to what you actually receive
    const marginCents = netAfterStripeCents - cogsCents;

    const rules = await this.getAllocationRules("fuel_sale");
    
    for (const rule of rules) {
      const percentage = parseFloat(rule.percentage);
      const allocationCents = Math.round(marginCents * (percentage / 100));
      
      if (allocationCents !== 0) {
        allocations.push({
          sourceBucket: "operating_chequing",
          destinationBucket: rule.accountType as BucketType,
          amountCents: allocationCents * multiplier,
          revenueType: "fuel_sale",
          transactionId,
          description: isReversal 
            ? `Reversal: ${percentage}% of fuel margin to ${rule.accountType}`
            : `${percentage}% of fuel margin ($${(marginCents / 100).toFixed(2)})`
        });
      }
    }

    return {
      success: true,
      allocations,
      gstAmountCents: gstCents,
      netAmountCents: netCents,
      netAfterStripeCents,
      stripeFeeCents,
      marginCents
    };
  },

  /**
   * Process a delivery fee through the waterfall.
   * High-margin service revenue - allocated from net amount after Stripe fee.
   * 
   * Flow: Gross → Extract GST → Deduct Stripe Fee → Allocate from Net
   */
  async processDeliveryFee(input: WaterfallInput): Promise<WaterfallResult> {
    const { transactionId, grossAmountCents, stripeFeeCents = 0, isReversal } = input;
    const allocations: AllocationRecord[] = [];
    const multiplier = isReversal ? -1 : 1;

    // GST is extracted from customer-paid gross
    const { gstCents, netCents } = this.extractGst(grossAmountCents);
    
    // What you actually receive after Stripe takes their cut
    const netAfterStripeCents = netCents - stripeFeeCents;

    allocations.push({
      sourceBucket: "operating_chequing",
      destinationBucket: "gst_holding",
      amountCents: gstCents * multiplier,
      revenueType: "delivery_fee",
      transactionId,
      description: isReversal ? "GST reversal for refund" : "GST collected on delivery fee"
    });

    const rules = await this.getAllocationRules("delivery_fee");
    
    for (const rule of rules) {
      const percentage = parseFloat(rule.percentage);
      // Allocate from net AFTER Stripe fee, not just net after GST
      const allocationCents = Math.round(netAfterStripeCents * (percentage / 100));
      
      if (allocationCents !== 0) {
        allocations.push({
          sourceBucket: "operating_chequing",
          destinationBucket: rule.accountType as BucketType,
          amountCents: allocationCents * multiplier,
          revenueType: "delivery_fee",
          transactionId,
          description: isReversal
            ? `Reversal: ${percentage}% of delivery fee to ${rule.accountType}`
            : `${percentage}% of delivery fee ($${(netAfterStripeCents / 100).toFixed(2)})`
        });
      }
    }

    return {
      success: true,
      allocations,
      gstAmountCents: gstCents,
      netAmountCents: netCents,
      netAfterStripeCents,
      stripeFeeCents
    };
  },

  /**
   * Process a subscription fee through the waterfall.
   * 40% goes to deferred subscription, remaining 60% is allocated.
   * Stripe fee is deducted before allocations.
   * 
   * Flow: Gross → Extract GST → Deduct Stripe Fee → 40% Deferred → Allocate 60%
   */
  async processSubscriptionFee(input: WaterfallInput): Promise<WaterfallResult> {
    const { transactionId, grossAmountCents, stripeFeeCents = 0, isReversal } = input;
    const allocations: AllocationRecord[] = [];
    const multiplier = isReversal ? -1 : 1;

    // GST is extracted from customer-paid gross
    const { gstCents, netCents } = this.extractGst(grossAmountCents);
    
    // What you actually receive after Stripe takes their cut
    const netAfterStripeCents = netCents - stripeFeeCents;

    allocations.push({
      sourceBucket: "operating_chequing",
      destinationBucket: "gst_holding",
      amountCents: gstCents * multiplier,
      revenueType: "subscription_fee",
      transactionId,
      description: isReversal ? "GST reversal for refund" : "GST collected on subscription"
    });

    // 40% of net-after-Stripe goes to deferred
    const deferredCents = Math.round(netAfterStripeCents * 0.40);
    const usableCents = netAfterStripeCents - deferredCents;

    allocations.push({
      sourceBucket: "operating_chequing",
      destinationBucket: "deferred_subscription",
      amountCents: deferredCents * multiplier,
      revenueType: "subscription_fee",
      transactionId,
      description: isReversal
        ? "Reversal: 40% subscription deferral"
        : "40% deferred for service obligation"
    });

    const rules = await this.getAllocationRules("subscription_fee");
    
    for (const rule of rules) {
      if (rule.accountType === "deferred_subscription") continue;
      
      const percentage = parseFloat(rule.percentage);
      const allocationCents = Math.round(usableCents * (percentage / 100));
      
      if (allocationCents !== 0) {
        allocations.push({
          sourceBucket: "operating_chequing",
          destinationBucket: rule.accountType as BucketType,
          amountCents: allocationCents * multiplier,
          revenueType: "subscription_fee",
          transactionId,
          description: isReversal
            ? `Reversal: ${percentage}% of usable subscription to ${rule.accountType}`
            : `${percentage}% of usable subscription ($${(usableCents / 100).toFixed(2)})`
        });
      }
    }

    return {
      success: true,
      allocations,
      gstAmountCents: gstCents,
      netAmountCents: netCents,
      netAfterStripeCents,
      stripeFeeCents
    };
  },

  /**
   * Execute the waterfall for a given transaction.
   * This is the main entry point.
   */
  async executeWaterfall(input: WaterfallInput): Promise<WaterfallResult> {
    let result: WaterfallResult;

    switch (input.revenueType) {
      case "fuel_sale":
        result = await this.processFuelSale(input);
        break;
      case "delivery_fee":
        result = await this.processDeliveryFee(input);
        break;
      case "subscription_fee":
        result = await this.processSubscriptionFee(input);
        break;
      default:
        return {
          success: false,
          allocations: [],
          gstAmountCents: 0,
          netAmountCents: 0,
          netAfterStripeCents: 0,
          stripeFeeCents: 0,
          error: `Unknown revenue type: ${input.revenueType}`
        };
    }

    return result;
  },

  /**
   * Apply allocations to the bucket balances.
   * This updates the financial_accounts table and records transactions.
   */
  async applyAllocations(allocations: AllocationRecord[]): Promise<void> {
    for (const allocation of allocations) {
      if (allocation.sourceBucket !== allocation.destinationBucket) {
        await this.updateAccountBalance(allocation.destinationBucket, allocation.amountCents);
      }

      const isReversal = allocation.amountCents < 0;
      await this.recordTransaction(
        allocation.destinationBucket,
        Math.abs(allocation.amountCents),
        isReversal,
        allocation.description,
        allocation.transactionId,
        allocation.revenueType
      );
    }
  },

  /**
   * Process and apply a complete waterfall for a transaction.
   * Combines executeWaterfall and applyAllocations.
   */
  async processAndApply(input: WaterfallInput): Promise<WaterfallResult> {
    const result = await this.executeWaterfall(input);
    
    if (result.success && result.allocations.length > 0) {
      await this.applyAllocations(result.allocations);
    }
    
    return result;
  },

  /**
   * Reverse all allocations for a given transaction.
   * Used when a refund or cancellation occurs.
   */
  async reverseTransaction(transactionId: string): Promise<WaterfallResult> {
    const transactions = await db
      .select()
      .from(financialTransactions)
      .where(eq(financialTransactions.referenceId, transactionId));

    const reversals: AllocationRecord[] = [];

    for (const tx of transactions) {
      if (tx.transactionType === "manual_adjustment") continue;

      const account = await db
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, tx.accountId))
        .limit(1);

      if (account[0]) {
        const amountCents = Math.round(parseFloat(tx.amount) * -100);
        reversals.push({
          sourceBucket: "operating_chequing",
          destinationBucket: account[0].accountType as BucketType,
          amountCents,
          revenueType: tx.referenceType as RevenueType,
          transactionId: `reversal_${transactionId}`,
          description: `Reversal of: ${tx.description}`
        });
      }
    }

    if (reversals.length > 0) {
      await this.applyAllocations(reversals);
    }

    return {
      success: true,
      allocations: reversals,
      gstAmountCents: 0,
      netAmountCents: 0,
      netAfterStripeCents: 0,
      stripeFeeCents: 0
    };
  },

  /**
   * Get current balances for all buckets.
   * NOW USES LEDGER-BASED CALCULATION (single source of truth).
   * Bucket balances are calculated by summing allocation fields from ledger entries.
   */
  async getBucketBalances(): Promise<Record<BucketType, number>> {
    // Use ledger-based calculation for real-time accuracy
    return this.getBucketBalancesFromLedger();
  },

  /**
   * Get allocation summary for a date range.
   */
  async getAllocationSummary(startDate: Date, endDate: Date): Promise<{
    byBucket: Record<BucketType, number>;
    byRevenueType: Record<RevenueType, number>;
    totalAllocated: number;
  }> {
    const transactions = await db
      .select()
      .from(financialTransactions)
      .where(
        and(
          sql`${financialTransactions.createdAt} >= ${startDate}`,
          sql`${financialTransactions.createdAt} <= ${endDate}`
        )
      );

    const byBucket: Record<string, number> = {
      operating_chequing: 0,
      gst_holding: 0,
      deferred_subscription: 0,
      income_tax_reserve: 0,
      maintenance_reserve: 0,
      emergency_risk: 0,
      growth_capital: 0,
      owner_draw_holding: 0
    };

    const byRevenueType: Record<string, number> = {
      fuel_sale: 0,
      delivery_fee: 0,
      subscription_fee: 0
    };

    let totalAllocated = 0;

    for (const tx of transactions) {
      const account = await db
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, tx.accountId))
        .limit(1);

      if (account[0]) {
        const amount = parseFloat(tx.amount);
        byBucket[account[0].accountType] = (byBucket[account[0].accountType] || 0) + amount;
        
        if (tx.referenceType && byRevenueType[tx.referenceType] !== undefined) {
          byRevenueType[tx.referenceType] += amount;
        }
        
        totalAllocated += amount;
      }
    }

    return {
      byBucket: byBucket as Record<BucketType, number>,
      byRevenueType: byRevenueType as Record<RevenueType, number>,
      totalAllocated
    };
  },

  /**
   * Convert allocation records to ledger entry allocation fields.
   * This is the new single-source-of-truth approach where allocations
   * are stored directly in the ledger entry.
   */
  allocationsToLedgerFields(allocations: AllocationRecord[]): {
    allocOperatingCents: number;
    allocGstHoldingCents: number;
    allocDeferredSubCents: number;
    allocIncomeTaxCents: number;
    allocMaintenanceCents: number;
    allocEmergencyRiskCents: number;
    allocGrowthCapitalCents: number;
    allocOwnerDrawCents: number;
  } {
    const fields = {
      allocOperatingCents: 0,
      allocGstHoldingCents: 0,
      allocDeferredSubCents: 0,
      allocIncomeTaxCents: 0,
      allocMaintenanceCents: 0,
      allocEmergencyRiskCents: 0,
      allocGrowthCapitalCents: 0,
      allocOwnerDrawCents: 0
    };

    for (const alloc of allocations) {
      switch (alloc.destinationBucket) {
        case 'operating_chequing':
          fields.allocOperatingCents += alloc.amountCents;
          break;
        case 'gst_holding':
          fields.allocGstHoldingCents += alloc.amountCents;
          break;
        case 'deferred_subscription':
          fields.allocDeferredSubCents += alloc.amountCents;
          break;
        case 'income_tax_reserve':
          fields.allocIncomeTaxCents += alloc.amountCents;
          break;
        case 'maintenance_reserve':
          fields.allocMaintenanceCents += alloc.amountCents;
          break;
        case 'emergency_risk':
          fields.allocEmergencyRiskCents += alloc.amountCents;
          break;
        case 'growth_capital':
          fields.allocGrowthCapitalCents += alloc.amountCents;
          break;
        case 'owner_draw_holding':
          fields.allocOwnerDrawCents += alloc.amountCents;
          break;
      }
    }

    return fields;
  },

  /**
   * Calculate bucket balances in real-time by summing allocation fields
   * from all ledger entries. This is the single source of truth.
   */
  async getBucketBalancesFromLedger(): Promise<Record<BucketType, number>> {
    const result = await db
      .select({
        allocOperatingCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocOperatingCents}), 0)`,
        allocGstHoldingCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocGstHoldingCents}), 0)`,
        allocDeferredSubCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocDeferredSubCents}), 0)`,
        allocIncomeTaxCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocIncomeTaxCents}), 0)`,
        allocMaintenanceCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocMaintenanceCents}), 0)`,
        allocEmergencyRiskCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocEmergencyRiskCents}), 0)`,
        allocGrowthCapitalCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocGrowthCapitalCents}), 0)`,
        allocOwnerDrawCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocOwnerDrawCents}), 0)`,
      })
      .from(ledgerEntries);

    const row = result[0];

    return {
      operating_chequing: Number(row.allocOperatingCents) / 100,
      gst_holding: Number(row.allocGstHoldingCents) / 100,
      deferred_subscription: Number(row.allocDeferredSubCents) / 100,
      income_tax_reserve: Number(row.allocIncomeTaxCents) / 100,
      maintenance_reserve: Number(row.allocMaintenanceCents) / 100,
      emergency_risk: Number(row.allocEmergencyRiskCents) / 100,
      growth_capital: Number(row.allocGrowthCapitalCents) / 100,
      owner_draw_holding: Number(row.allocOwnerDrawCents) / 100,
    };
  },

  /**
   * Calculate bucket balances for a specific date range (for monthly views).
   */
  async getBucketBalancesFromLedgerByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<Record<BucketType, number>> {
    const result = await db
      .select({
        allocOperatingCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocOperatingCents}), 0)`,
        allocGstHoldingCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocGstHoldingCents}), 0)`,
        allocDeferredSubCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocDeferredSubCents}), 0)`,
        allocIncomeTaxCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocIncomeTaxCents}), 0)`,
        allocMaintenanceCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocMaintenanceCents}), 0)`,
        allocEmergencyRiskCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocEmergencyRiskCents}), 0)`,
        allocGrowthCapitalCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocGrowthCapitalCents}), 0)`,
        allocOwnerDrawCents: sql<number>`COALESCE(SUM(${ledgerEntries.allocOwnerDrawCents}), 0)`,
      })
      .from(ledgerEntries)
      .where(
        and(
          sql`${ledgerEntries.eventDate} >= ${startDate}`,
          sql`${ledgerEntries.eventDate} <= ${endDate}`
        )
      );

    const row = result[0];

    return {
      operating_chequing: Number(row.allocOperatingCents) / 100,
      gst_holding: Number(row.allocGstHoldingCents) / 100,
      deferred_subscription: Number(row.allocDeferredSubCents) / 100,
      income_tax_reserve: Number(row.allocIncomeTaxCents) / 100,
      maintenance_reserve: Number(row.allocMaintenanceCents) / 100,
      emergency_risk: Number(row.allocEmergencyRiskCents) / 100,
      growth_capital: Number(row.allocGrowthCapitalCents) / 100,
      owner_draw_holding: Number(row.allocOwnerDrawCents) / 100,
    };
  }
};
