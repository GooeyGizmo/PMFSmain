import { storage } from './storage';
import { db } from './db';
import { 
  trucks, 
  truckFuelTransactions, 
  fuelShrinkageRules, 
  fuelReconciliationPeriods,
  type FuelReconciliationPeriod,
  type FuelReconciliationSummary 
} from '@shared/schema';
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm';

type FuelType = 'regular' | 'premium' | 'diesel';
type ShrinkClassification = 'within_expected' | 'outside_expected' | 'hard_alert';

interface ReconciliationInput {
  dateStart: Date;
  dateEnd: Date;
  closeoutRunId?: string;
}

interface TruckFuelReconciliation {
  truckId: string;
  truckName: string;
  fuelType: FuelType;
  startingLitres: number;
  endingLitres: number;
  fills: number;
  dispensed: number;
  adjustments: number;
  expectedEnding: number;
  shrinkLitres: number;
  shrinkPercent: number;
  classification: ShrinkClassification;
}

interface ReconciliationResult {
  success: boolean;
  summary?: FuelReconciliationSummary;
  periods?: FuelReconciliationPeriod[];
  error?: string;
}

export class FuelReconciliationService {
  async getShrinkageRules(): Promise<Map<FuelType, { minPercent: number; maxPercent: number; hardAlertPercent: number }>> {
    const rules = await db.select().from(fuelShrinkageRules).where(eq(fuelShrinkageRules.active, true));
    
    const ruleMap = new Map<FuelType, { minPercent: number; maxPercent: number; hardAlertPercent: number }>();
    
    const defaultRule = { minPercent: 0.5, maxPercent: 3.0, hardAlertPercent: 8.0 };
    ruleMap.set('regular', defaultRule);
    ruleMap.set('premium', defaultRule);
    ruleMap.set('diesel', defaultRule);
    
    for (const rule of rules) {
      ruleMap.set(rule.fuelType as FuelType, {
        minPercent: parseFloat(rule.expectedMinPercent.toString()),
        maxPercent: parseFloat(rule.expectedMaxPercent.toString()),
        hardAlertPercent: parseFloat(rule.hardAlertPercent.toString()),
      });
    }
    
    return ruleMap;
  }
  
  classifyShrinkage(
    shrinkPercent: number, 
    rule: { minPercent: number; maxPercent: number; hardAlertPercent: number }
  ): ShrinkClassification {
    const absPercent = Math.abs(shrinkPercent);
    
    if (absPercent >= rule.hardAlertPercent) {
      return 'hard_alert';
    }
    
    if (absPercent > rule.maxPercent || absPercent < rule.minPercent) {
      return 'outside_expected';
    }
    
    return 'within_expected';
  }
  
  async reconcilePeriod(input: ReconciliationInput): Promise<ReconciliationResult> {
    try {
      const allTrucks = await db.select().from(trucks).where(eq(trucks.isActive, true));
      const shrinkageRules = await this.getShrinkageRules();
      
      const reconciliations: TruckFuelReconciliation[] = [];
      const createdPeriods: FuelReconciliationPeriod[] = [];
      
      for (const truck of allTrucks) {
        const fuelTypes: FuelType[] = ['regular', 'premium', 'diesel'];
        
        for (const fuelType of fuelTypes) {
          const levelField = fuelType === 'regular' ? 'regularLevel' 
            : fuelType === 'premium' ? 'premiumLevel' 
            : 'dieselLevel';
          
          const transactions = await db
            .select()
            .from(truckFuelTransactions)
            .where(
              and(
                eq(truckFuelTransactions.truckId, truck.id),
                eq(truckFuelTransactions.fuelType, fuelType),
                gte(truckFuelTransactions.createdAt, input.dateStart),
                lte(truckFuelTransactions.createdAt, input.dateEnd)
              )
            )
            .orderBy(asc(truckFuelTransactions.createdAt));
          
          if (transactions.length === 0) {
            continue;
          }
          
          const firstTx = transactions[0];
          const lastTx = transactions[transactions.length - 1];
          
          const startingLitres = parseFloat(firstTx.previousLevel?.toString() || '0');
          const endingLitres = parseFloat(lastTx.newLevel?.toString() || '0');
          
          let fills = 0;
          let dispensed = 0;
          let adjustments = 0;
          
          for (const tx of transactions) {
            const litres = parseFloat(tx.litres?.toString() || '0');
            
            switch (tx.transactionType) {
              case 'fill':
                fills += litres;
                break;
              case 'dispense':
                dispensed += litres;
                break;
              case 'adjustment':
                adjustments += litres;
                break;
              case 'ops_empty':
                dispensed += litres;
                break;
            }
          }
          
          const expectedEnding = startingLitres + fills - dispensed + adjustments;
          const shrinkLitres = expectedEnding - endingLitres;
          
          const totalMovement = fills + dispensed;
          const shrinkPercent = totalMovement > 0 
            ? (shrinkLitres / totalMovement) * 100 
            : 0;
          
          const rule = shrinkageRules.get(fuelType) || { minPercent: 0.5, maxPercent: 3.0, hardAlertPercent: 8.0 };
          const classification = this.classifyShrinkage(shrinkPercent, rule);
          
          reconciliations.push({
            truckId: truck.id,
            truckName: truck.name || 'Unknown Truck',
            fuelType,
            startingLitres,
            endingLitres,
            fills,
            dispensed,
            adjustments,
            expectedEnding,
            shrinkLitres,
            shrinkPercent,
            classification,
          });
          
          const [period] = await db
            .insert(fuelReconciliationPeriods)
            .values({
              dateStart: input.dateStart,
              dateEnd: input.dateEnd,
              truckId: truck.id,
              fuelType,
              startingLevelLitres: startingLitres.toFixed(2),
              endingLevelLitres: endingLitres.toFixed(2),
              fillsLitres: fills.toFixed(2),
              dispensedLitres: dispensed.toFixed(2),
              adjustmentsLitres: adjustments.toFixed(2),
              expectedEndingLitres: expectedEnding.toFixed(2),
              shrinkLitres: shrinkLitres.toFixed(2),
              shrinkPercent: shrinkPercent.toFixed(2),
              classification,
              closeoutRunId: input.closeoutRunId ?? undefined,
            })
            .returning();
          
          createdPeriods.push(period);
        }
      }
      
      const totalShrinkByFuelType: Record<string, number> = {};
      for (const rec of reconciliations) {
        totalShrinkByFuelType[rec.fuelType] = (totalShrinkByFuelType[rec.fuelType] || 0) + rec.shrinkLitres;
      }
      
      const hasAlerts = reconciliations.some(r => r.classification === 'hard_alert');
      
      const summary: FuelReconciliationSummary = {
        periodsByTruck: reconciliations,
        totalShrinkByFuelType,
        hasAlerts,
      };
      
      return { success: true, summary, periods: createdPeriods };
    } catch (error) {
      console.error('[FuelReconciliation] Error during reconciliation:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during fuel reconciliation' 
      };
    }
  }
  
  async getReconciliationHistory(limit: number = 50): Promise<FuelReconciliationPeriod[]> {
    return db
      .select()
      .from(fuelReconciliationPeriods)
      .orderBy(desc(fuelReconciliationPeriods.createdAt))
      .limit(limit);
  }
  
  async getReconciliationsByCloseout(closeoutRunId: string): Promise<FuelReconciliationPeriod[]> {
    return db
      .select()
      .from(fuelReconciliationPeriods)
      .where(eq(fuelReconciliationPeriods.closeoutRunId, closeoutRunId))
      .orderBy(asc(fuelReconciliationPeriods.createdAt));
  }
}

export const fuelReconciliationService = new FuelReconciliationService();
