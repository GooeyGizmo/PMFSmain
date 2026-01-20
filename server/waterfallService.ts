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
  | "operating_buffer"
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
  litresDelivered?: number;
  wholesaleCostPerLitreCents?: number;
  isReversal?: boolean;
}

export interface WaterfallResult {
  success: boolean;
  allocations: AllocationRecord[];
  gstAmountCents: number;
  netAmountCents: number;
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
   */
  async recordTransaction(
    accountType: BucketType,
    amountCents: number,
    transactionType: "credit" | "debit" | "allocation" | "reversal",
    description: string,
    referenceId: string,
    referenceType: string
  ): Promise<void> {
    const account = await this.getAccountByType(accountType);
    if (!account) {
      throw new Error(`Account not found: ${accountType}`);
    }

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
   */
  async processFuelSale(input: WaterfallInput): Promise<WaterfallResult> {
    const { transactionId, grossAmountCents, litresDelivered, wholesaleCostPerLitreCents, isReversal } = input;
    const allocations: AllocationRecord[] = [];
    const multiplier = isReversal ? -1 : 1;

    const { gstCents, netCents } = this.extractGst(grossAmountCents);
    
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
        error: "Fuel sale requires litresDelivered and wholesaleCostPerLitreCents"
      };
    }

    const cogsCents = Math.round(litresDelivered * wholesaleCostPerLitreCents);
    const marginCents = netCents - cogsCents;

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
      marginCents
    };
  },

  /**
   * Process a delivery fee through the waterfall.
   * High-margin service revenue - allocated from net amount.
   */
  async processDeliveryFee(input: WaterfallInput): Promise<WaterfallResult> {
    const { transactionId, grossAmountCents, isReversal } = input;
    const allocations: AllocationRecord[] = [];
    const multiplier = isReversal ? -1 : 1;

    const { gstCents, netCents } = this.extractGst(grossAmountCents);

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
      const allocationCents = Math.round(netCents * (percentage / 100));
      
      if (allocationCents !== 0) {
        allocations.push({
          sourceBucket: "operating_chequing",
          destinationBucket: rule.accountType as BucketType,
          amountCents: allocationCents * multiplier,
          revenueType: "delivery_fee",
          transactionId,
          description: isReversal
            ? `Reversal: ${percentage}% of delivery fee to ${rule.accountType}`
            : `${percentage}% of delivery fee ($${(netCents / 100).toFixed(2)})`
        });
      }
    }

    return {
      success: true,
      allocations,
      gstAmountCents: gstCents,
      netAmountCents: netCents
    };
  },

  /**
   * Process a subscription fee through the waterfall.
   * 40% goes to deferred subscription, remaining 60% is allocated.
   */
  async processSubscriptionFee(input: WaterfallInput): Promise<WaterfallResult> {
    const { transactionId, grossAmountCents, isReversal } = input;
    const allocations: AllocationRecord[] = [];
    const multiplier = isReversal ? -1 : 1;

    const { gstCents, netCents } = this.extractGst(grossAmountCents);

    allocations.push({
      sourceBucket: "operating_chequing",
      destinationBucket: "gst_holding",
      amountCents: gstCents * multiplier,
      revenueType: "subscription_fee",
      transactionId,
      description: isReversal ? "GST reversal for refund" : "GST collected on subscription"
    });

    const deferredCents = Math.round(netCents * 0.40);
    const usableCents = netCents - deferredCents;

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
      netAmountCents: netCents
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

      const transactionType = allocation.amountCents < 0 ? "reversal" : "allocation";
      await this.recordTransaction(
        allocation.destinationBucket,
        Math.abs(allocation.amountCents),
        transactionType,
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
      if (tx.transactionType === "reversal") continue;

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
      netAmountCents: 0
    };
  },

  /**
   * Get current balances for all buckets.
   */
  async getBucketBalances(): Promise<Record<BucketType, number>> {
    const accounts = await db
      .select()
      .from(financialAccounts)
      .orderBy(financialAccounts.sortOrder);

    const balances: Record<string, number> = {};
    for (const account of accounts) {
      balances[account.accountType] = parseFloat(account.balance);
    }
    return balances as Record<BucketType, number>;
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
      operating_buffer: 0,
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
  }
};
