import { db } from './db';
import { storage } from './storage';
import { 
  orders, 
  closeoutRuns, 
  closeoutFlags, 
  closeoutExports,
  ledgerEntries,
  type CloseoutRun,
  type CloseoutFlag,
  type CloseoutTotals,
  type StripeReconciliation,
  type FuelReconciliationSummary,
  type PricingSnapshot
} from '@shared/schema';
import { and, gte, lte, eq, desc, isNull, sql } from 'drizzle-orm';
import { fuelReconciliationService } from './fuelReconciliationService';
import { stripeReconciliationService } from './stripeReconciliationService';
import { waterfallService } from './waterfallService';

type CloseoutMode = 'weekly' | 'nightly';
type FlagSeverity = 'info' | 'warning' | 'critical';

interface CloseoutInput {
  mode: CloseoutMode;
  dateStart: Date;
  dateEnd: Date;
  dryRun?: boolean;
  createdBy?: string;
}

interface CloseoutResult {
  success: boolean;
  run?: CloseoutRun;
  flags?: CloseoutFlag[];
  error?: string;
}

export class CloseoutService {
  async runCloseout(input: CloseoutInput): Promise<CloseoutResult> {
    let runId: string | null = null;
    
    try {
      const [run] = await db
        .insert(closeoutRuns)
        .values({
          mode: input.mode,
          dateStart: input.dateStart,
          dateEnd: input.dateEnd,
          dryRun: input.dryRun ?? false,
          status: 'running',
          createdBy: input.createdBy ?? null,
        })
        .returning();
      
      runId = run.id;
      console.log(`[Closeout] Starting ${input.mode} closeout run ${runId} (${input.dryRun ? 'DRY RUN' : 'LIVE'})`);
      
      const flags: { severity: FlagSeverity; code: string; message: string; meta?: any }[] = [];
      
      const totals = await this.computeOrderTotals(input.dateStart, input.dateEnd, flags);
      
      const fuelResult = await fuelReconciliationService.reconcilePeriod({
        dateStart: input.dateStart,
        dateEnd: input.dateEnd,
        closeoutRunId: runId,
      });
      
      if (!fuelResult.success) {
        flags.push({
          severity: 'warning',
          code: 'FUEL_RECONCILIATION_FAILED',
          message: `Fuel reconciliation failed: ${fuelResult.error}`,
        });
      } else if (fuelResult.summary?.hasAlerts) {
        flags.push({
          severity: 'critical',
          code: 'FUEL_SHRINKAGE_ALERT',
          message: 'One or more fuel types have shrinkage exceeding hard alert threshold',
          meta: { totalShrinkByFuelType: fuelResult.summary.totalShrinkByFuelType },
        });
      }
      
      const stripeResult = await stripeReconciliationService.reconcilePeriod({
        dateStart: input.dateStart,
        dateEnd: input.dateEnd,
        toleranceCents: 100,
        autoCreateMissing: !input.dryRun,
      });
      
      if (!stripeResult.success) {
        flags.push({
          severity: 'warning',
          code: 'STRIPE_RECONCILIATION_FAILED',
          message: `Stripe reconciliation failed: ${stripeResult.error}`,
        });
      } else if (!stripeResult.reconciliation?.reconciled) {
        flags.push({
          severity: 'warning',
          code: 'STRIPE_LEDGER_MISMATCH',
          message: `Stripe/Ledger mismatch of ${stripeResult.reconciliation?.mismatchAmountCents || 0} cents`,
          meta: { 
            missingEntries: stripeResult.reconciliation?.missingLedgerEntries,
            autoCreated: stripeResult.reconciliation?.autoCreatedEntries,
          },
        });
      }
      
      if (totals.ordersWithMissingSnapshot > 0) {
        flags.push({
          severity: 'info',
          code: 'MISSING_PRICING_SNAPSHOTS',
          message: `${totals.ordersWithMissingSnapshot} orders missing pricing snapshots (COGS tracking unavailable)`,
        });
      }
      
      if (totals.unstableTotals) {
        flags.push({
          severity: 'warning',
          code: 'UNSTABLE_TOTALS',
          message: 'Some pricing data was reconstructed from current prices, not historical',
        });
      }
      
      for (const flag of flags) {
        await db.insert(closeoutFlags).values({
          closeoutRunId: runId,
          severity: flag.severity,
          code: flag.code,
          message: flag.message,
          meta: flag.meta ? JSON.stringify(flag.meta) : null,
        });
      }
      
      const [updatedRun] = await db
        .update(closeoutRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
          totalsJson: JSON.stringify(totals),
          stripeReconciliationJson: stripeResult.reconciliation ? JSON.stringify(stripeResult.reconciliation) : null,
          fuelReconciliationJson: fuelResult.summary ? JSON.stringify(fuelResult.summary) : null,
        })
        .where(eq(closeoutRuns.id, runId))
        .returning();
      
      const savedFlags = await db
        .select()
        .from(closeoutFlags)
        .where(eq(closeoutFlags.closeoutRunId, runId));
      
      console.log(`[Closeout] Completed ${input.mode} closeout run ${runId} with ${savedFlags.length} flags`);
      
      return { success: true, run: updatedRun, flags: savedFlags };
    } catch (error) {
      console.error('[Closeout] Error during closeout run:', error);
      
      if (runId) {
        await db
          .update(closeoutRuns)
          .set({ status: 'failed', completedAt: new Date() })
          .where(eq(closeoutRuns.id, runId));
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during closeout' 
      };
    }
  }
  
  private async computeOrderTotals(
    dateStart: Date, 
    dateEnd: Date,
    flags: { severity: FlagSeverity; code: string; message: string; meta?: any }[]
  ): Promise<CloseoutTotals> {
    const completedOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, 'completed'),
          gte(orders.updatedAt, dateStart),
          lte(orders.updatedAt, dateEnd)
        )
      );
    
    let ordersProcessed = 0;
    let ordersWithMissingSnapshot = 0;
    const litresByFuelType: Record<string, number> = { regular: 0, premium: 0, diesel: 0 };
    let fuelRevenueExGst = 0;
    let deliveryRevenueExGst = 0;
    let gstCollected = 0;
    let fuelCogs = 0;
    let unstableTotals = false;
    
    for (const order of completedOrders) {
      ordersProcessed++;
      
      const litres = order.actualLitresDelivered 
        ? parseFloat(order.actualLitresDelivered.toString()) 
        : parseFloat(order.fuelAmount?.toString() || '0');
      
      if (order.pricingSnapshotJson) {
        try {
          const snapshot: PricingSnapshot = JSON.parse(order.pricingSnapshotJson);
          
          for (const item of snapshot.items) {
            litresByFuelType[item.fuelType] = (litresByFuelType[item.fuelType] || 0) + item.litres;
            const itemRevenue = item.litres * item.customerPrice;
            fuelRevenueExGst += itemRevenue;
            
            const itemCogs = item.litres * item.baseCost;
            fuelCogs += itemCogs;
          }
          
          deliveryRevenueExGst += snapshot.deliveryFeeBeforeGst;
          gstCollected += (fuelRevenueExGst + snapshot.deliveryFeeBeforeGst) * snapshot.gstRate;
          
          if (snapshot.notes?.includes('COGS_RECONSTRUCTED')) {
            unstableTotals = true;
          }
        } catch (e) {
          ordersWithMissingSnapshot++;
          unstableTotals = true;
        }
      } else {
        ordersWithMissingSnapshot++;
        unstableTotals = true;
        
        litresByFuelType[order.fuelType] = (litresByFuelType[order.fuelType] || 0) + litres;
        
        const pricePerLitre = parseFloat(order.pricePerLitre?.toString() || '0');
        fuelRevenueExGst += litres * pricePerLitre;
        deliveryRevenueExGst += parseFloat(order.deliveryFee?.toString() || '0');
        gstCollected += parseFloat(order.gstAmount?.toString() || '0');
      }
    }
    
    const subscriptionLedger = await db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          gte(ledgerEntries.eventDate, dateStart),
          lte(ledgerEntries.eventDate, dateEnd),
          eq(ledgerEntries.isReversal, false),
          sql`${ledgerEntries.revenueSubscriptionCents} > 0`
        )
      );
    
    let subscriptionRevenueExGst = 0;
    for (const entry of subscriptionLedger) {
      subscriptionRevenueExGst += (entry.revenueSubscriptionCents || 0) / 100;
    }
    
    const stripeFees = await db
      .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.stripeFeeCents}), 0)` })
      .from(ledgerEntries)
      .where(
        and(
          gte(ledgerEntries.eventDate, dateStart),
          lte(ledgerEntries.eventDate, dateEnd)
        )
      );
    
    const stripeFeesTotal = (stripeFees[0]?.total || 0) / 100;
    
    const grossMargin = fuelRevenueExGst + deliveryRevenueExGst + subscriptionRevenueExGst - fuelCogs;
    const netIncomeEstimate = grossMargin - stripeFeesTotal;
    
    return {
      ordersProcessed,
      ordersWithMissingSnapshot,
      litresByFuelType,
      fuelRevenueExGst,
      deliveryRevenueExGst,
      subscriptionRevenueExGst,
      gstCollected,
      fuelCogs,
      stripeFees: stripeFeesTotal,
      grossMargin,
      netIncomeEstimate,
      unstableTotals,
    };
  }
  
  async getCloseoutHistory(limit: number = 20): Promise<CloseoutRun[]> {
    return db
      .select()
      .from(closeoutRuns)
      .orderBy(desc(closeoutRuns.createdAt))
      .limit(limit);
  }
  
  async getCloseoutById(id: string): Promise<{ run: CloseoutRun | null; flags: CloseoutFlag[] }> {
    const [run] = await db
      .select()
      .from(closeoutRuns)
      .where(eq(closeoutRuns.id, id));
    
    if (!run) {
      return { run: null, flags: [] };
    }
    
    const flags = await db
      .select()
      .from(closeoutFlags)
      .where(eq(closeoutFlags.closeoutRunId, id));
    
    return { run, flags };
  }
  
  async exportCloseoutCsv(closeoutRunId: string, kind: 'orders_csv' | 'ledger_csv' | 'gst_csv'): Promise<string> {
    const { run } = await this.getCloseoutById(closeoutRunId);
    if (!run) {
      throw new Error('Closeout run not found');
    }
    
    let csvContent = '';
    
    if (kind === 'orders_csv') {
      const periodOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.status, 'completed'),
            gte(orders.updatedAt, run.dateStart),
            lte(orders.updatedAt, run.dateEnd)
          )
        );
      
      csvContent = 'Order ID,Date,Fuel Type,Litres,Customer Price,Delivery Fee,GST,Total,Has Snapshot\n';
      for (const order of periodOrders) {
        const litres = order.actualLitresDelivered || order.fuelAmount || '0';
        csvContent += `${order.id},${order.updatedAt?.toISOString()},${order.fuelType},${litres},${order.pricePerLitre},${order.deliveryFee},${order.gstAmount},${order.total},${order.pricingSnapshotJson ? 'Yes' : 'No'}\n`;
      }
    } else if (kind === 'ledger_csv') {
      const periodLedger = await db
        .select()
        .from(ledgerEntries)
        .where(
          and(
            gte(ledgerEntries.eventDate, run.dateStart),
            lte(ledgerEntries.eventDate, run.dateEnd)
          )
        );
      
      csvContent = 'Entry ID,Date,Category,Gross (cents),GST (cents),Net (cents),Stripe Fee,Is Reversal\n';
      for (const entry of periodLedger) {
        csvContent += `${entry.id},${entry.eventDate?.toISOString()},${entry.category},${entry.grossCents},${entry.gstCents},${entry.netCents},${entry.stripeFeeCents},${entry.isReversal}\n`;
      }
    } else if (kind === 'gst_csv') {
      const periodLedger = await db
        .select()
        .from(ledgerEntries)
        .where(
          and(
            gte(ledgerEntries.eventDate, run.dateStart),
            lte(ledgerEntries.eventDate, run.dateEnd),
            sql`${ledgerEntries.gstCents} > 0`
          )
        );
      
      let totalGst = 0;
      csvContent = 'Entry ID,Date,Category,Gross (cents),GST (cents),Needs Review\n';
      for (const entry of periodLedger) {
        totalGst += entry.gstCents || 0;
        csvContent += `${entry.id},${entry.eventDate?.toISOString()},${entry.category},${entry.grossCents},${entry.gstCents},${entry.gstNeedsReview}\n`;
      }
      csvContent += `\nTOTAL GST COLLECTED,,,${totalGst},$${(totalGst / 100).toFixed(2)}\n`;
    }
    
    const [savedExport] = await db
      .insert(closeoutExports)
      .values({
        closeoutRunId,
        kind,
        content: csvContent,
      })
      .returning();
    
    return csvContent;
  }
  
  getWeeklyCloseoutDates(): { dateStart: Date; dateEnd: Date } {
    const now = new Date();
    const calgaryOffset = -7 * 60;
    const localOffset = now.getTimezoneOffset();
    const offsetDiff = (localOffset - calgaryOffset) * 60 * 1000;
    
    const calgaryNow = new Date(now.getTime() + offsetDiff);
    const dayOfWeek = calgaryNow.getDay();
    
    const daysToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
    const dateEnd = new Date(calgaryNow);
    dateEnd.setDate(calgaryNow.getDate() - daysToLastSunday);
    dateEnd.setHours(23, 59, 59, 999);
    
    const dateStart = new Date(dateEnd);
    dateStart.setDate(dateEnd.getDate() - 6);
    dateStart.setHours(0, 0, 0, 0);
    
    return { dateStart, dateEnd };
  }
}

export const closeoutService = new CloseoutService();
