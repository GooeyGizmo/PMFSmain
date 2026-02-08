import { db } from './db';
import {
  trucks,
  truckFuelTransactions,
  fuelInventory,
  fuelInventoryTransactions,
  orders,
  TDG_FUEL_INFO,
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc, asc, isNotNull } from 'drizzle-orm';

type FuelType = 'regular' | 'premium' | 'diesel';

interface RecordPurchaseInput {
  truckId: string;
  fuelType: FuelType;
  litres: number;
  costPerLitre: number;
  supplierName?: string;
  supplierInvoice?: string;
  operatorId: string;
  operatorName: string;
  notes?: string;
}

interface WeightedAverageCostResult {
  avgCostPerLitre: number;
  totalLitresPurchased: number;
  totalCost: number;
  lastPurchaseDate: Date | null;
}

interface LifecycleCategory {
  litres: number;
  cost: number;
  count: number;
}

interface LitreLifecycleSummary {
  purchased: LifecycleCategory;
  delivered: LifecycleCategory;
  internalTransfer: LifecycleCategory;
  recirculation: LifecycleCategory;
  spillage: LifecycleCategory;
  roadFuel: LifecycleCategory;
  calibration: LifecycleCategory;
  adjustment: LifecycleCategory;
  opsEmpty: LifecycleCategory;
  netChange: number;
}

function getLevelField(fuelType: FuelType): 'regularLevel' | 'premiumLevel' | 'dieselLevel' {
  switch (fuelType) {
    case 'regular': return 'regularLevel';
    case 'premium': return 'premiumLevel';
    case 'diesel': return 'dieselLevel';
  }
}

function getCapacityField(fuelType: FuelType): 'regularCapacity' | 'premiumCapacity' | 'dieselCapacity' {
  switch (fuelType) {
    case 'regular': return 'regularCapacity';
    case 'premium': return 'premiumCapacity';
    case 'diesel': return 'dieselCapacity';
  }
}

export const fuelLedgerService = {
  async recordPurchase(input: RecordPurchaseInput): Promise<{ success: boolean; error?: string; data?: { truckTransactionId: string; inventoryTransactionId: string } }> {
    try {
      const { truckId, fuelType, litres, costPerLitre, supplierName, supplierInvoice, operatorId, operatorName, notes } = input;

      if (litres <= 0) {
        return { success: false, error: 'Litres must be positive for a purchase' };
      }

      const tdgInfo = TDG_FUEL_INFO[fuelType];
      const totalCost = litres * costPerLitre;
      const levelField = getLevelField(fuelType);

      const result = await db.transaction(async (tx) => {
        const [truck] = await tx.select().from(trucks).where(eq(trucks.id, truckId));
        if (!truck) {
          throw new Error(`Truck ${truckId} not found`);
        }

        const previousLevel = parseFloat(truck[levelField]?.toString() || '0');
        const newLevel = previousLevel + litres;

        const [truckTx] = await tx
          .insert(truckFuelTransactions)
          .values({
            truckId,
            transactionType: 'fill',
            fuelType,
            litres: litres.toFixed(2),
            previousLevel: previousLevel.toFixed(2),
            newLevel: newLevel.toFixed(2),
            unNumber: tdgInfo.unNumber,
            properShippingName: tdgInfo.properShippingName,
            dangerClass: tdgInfo.class,
            packingGroup: tdgInfo.packingGroup,
            operatorId,
            operatorName,
            supplierName: supplierName || null,
            supplierInvoice: supplierInvoice || null,
            costPerLitre: costPerLitre.toFixed(4),
            totalCost: totalCost.toFixed(2),
            notes: notes || null,
          })
          .returning();

        await tx
          .update(trucks)
          .set({
            [levelField]: newLevel.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(trucks.id, truckId));

        const [inventoryRecord] = await tx
          .select()
          .from(fuelInventory)
          .where(eq(fuelInventory.fuelType, fuelType));

        const previousStock = inventoryRecord ? parseFloat(inventoryRecord.currentStock?.toString() || '0') : 0;
        const newStock = previousStock + litres;

        const [invTx] = await tx
          .insert(fuelInventoryTransactions)
          .values({
            fuelType,
            type: 'purchase',
            quantity: litres.toFixed(2),
            costPerLitre: costPerLitre.toFixed(4),
            totalCost: totalCost.toFixed(2),
            previousStock: previousStock.toFixed(2),
            newStock: newStock.toFixed(2),
            notes: `Fill truck ${truck.unitNumber || truckId}${supplierName ? ` from ${supplierName}` : ''}${supplierInvoice ? ` (Invoice: ${supplierInvoice})` : ''}`,
            createdBy: operatorId,
          })
          .returning();

        if (inventoryRecord) {
          await tx
            .update(fuelInventory)
            .set({
              currentStock: newStock.toFixed(2),
              updatedAt: new Date(),
            })
            .where(eq(fuelInventory.fuelType, fuelType));
        } else {
          await tx
            .insert(fuelInventory)
            .values({
              fuelType,
              currentStock: newStock.toFixed(2),
            });
        }

        await tx
          .update(truckFuelTransactions)
          .set({ fuelInventoryTransactionId: invTx.id })
          .where(eq(truckFuelTransactions.id, truckTx.id));

        return { truckTransactionId: truckTx.id, inventoryTransactionId: invTx.id };
      });

      return { success: true, data: result };
    } catch (error) {
      console.error('[FuelLedger] recordPurchase error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error recording purchase' };
    }
  },

  async getWeightedAverageCost(fuelType: FuelType): Promise<{ success: boolean; error?: string; data?: WeightedAverageCostResult }> {
    try {
      const result = await db
        .select({
          totalWeightedCost: sql<string>`COALESCE(SUM(CAST(${truckFuelTransactions.litres} AS numeric) * CAST(${truckFuelTransactions.costPerLitre} AS numeric)), 0)`,
          totalLitres: sql<string>`COALESCE(SUM(CAST(${truckFuelTransactions.litres} AS numeric)), 0)`,
          lastDate: sql<Date | null>`MAX(${truckFuelTransactions.createdAt})`,
        })
        .from(truckFuelTransactions)
        .where(
          and(
            eq(truckFuelTransactions.fuelType, fuelType),
            eq(truckFuelTransactions.transactionType, 'fill'),
            isNotNull(truckFuelTransactions.costPerLitre)
          )
        );

      const row = result[0];
      const totalLitres = parseFloat(row?.totalLitres || '0');
      const totalWeightedCost = parseFloat(row?.totalWeightedCost || '0');
      const avgCostPerLitre = totalLitres > 0 ? totalWeightedCost / totalLitres : 0;

      return {
        success: true,
        data: {
          avgCostPerLitre: parseFloat(avgCostPerLitre.toFixed(4)),
          totalLitresPurchased: parseFloat(totalLitres.toFixed(2)),
          totalCost: parseFloat(totalWeightedCost.toFixed(2)),
          lastPurchaseDate: row?.lastDate || null,
        },
      };
    } catch (error) {
      console.error('[FuelLedger] getWeightedAverageCost error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async getWeightedAverageCostForPeriod(fuelType: FuelType, startDate: Date, endDate: Date): Promise<{ success: boolean; error?: string; data?: WeightedAverageCostResult }> {
    try {
      const result = await db
        .select({
          totalWeightedCost: sql<string>`COALESCE(SUM(CAST(${truckFuelTransactions.litres} AS numeric) * CAST(${truckFuelTransactions.costPerLitre} AS numeric)), 0)`,
          totalLitres: sql<string>`COALESCE(SUM(CAST(${truckFuelTransactions.litres} AS numeric)), 0)`,
          lastDate: sql<Date | null>`MAX(${truckFuelTransactions.createdAt})`,
        })
        .from(truckFuelTransactions)
        .where(
          and(
            eq(truckFuelTransactions.fuelType, fuelType),
            eq(truckFuelTransactions.transactionType, 'fill'),
            isNotNull(truckFuelTransactions.costPerLitre),
            gte(truckFuelTransactions.createdAt, startDate),
            lte(truckFuelTransactions.createdAt, endDate)
          )
        );

      const row = result[0];
      const totalLitres = parseFloat(row?.totalLitres || '0');
      const totalWeightedCost = parseFloat(row?.totalWeightedCost || '0');
      const avgCostPerLitre = totalLitres > 0 ? totalWeightedCost / totalLitres : 0;

      return {
        success: true,
        data: {
          avgCostPerLitre: parseFloat(avgCostPerLitre.toFixed(4)),
          totalLitresPurchased: parseFloat(totalLitres.toFixed(2)),
          totalCost: parseFloat(totalWeightedCost.toFixed(2)),
          lastPurchaseDate: row?.lastDate || null,
        },
      };
    } catch (error) {
      console.error('[FuelLedger] getWeightedAverageCostForPeriod error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async getLitreLifecycleSummary(startDate?: Date, endDate?: Date): Promise<{ success: boolean; error?: string; data?: LitreLifecycleSummary }> {
    try {
      const conditions = [];
      if (startDate) conditions.push(gte(truckFuelTransactions.createdAt, startDate));
      if (endDate) conditions.push(lte(truckFuelTransactions.createdAt, endDate));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({
          transactionType: truckFuelTransactions.transactionType,
          totalLitres: sql<string>`COALESCE(SUM(ABS(CAST(${truckFuelTransactions.litres} AS numeric))), 0)`,
          totalCost: sql<string>`COALESCE(SUM(CAST(${truckFuelTransactions.totalCost} AS numeric)), 0)`,
          txCount: sql<string>`COUNT(*)`,
        })
        .from(truckFuelTransactions)
        .where(whereClause)
        .groupBy(truckFuelTransactions.transactionType);

      const empty = (): LifecycleCategory => ({ litres: 0, cost: 0, count: 0 });
      const summary: LitreLifecycleSummary = {
        purchased: empty(),
        delivered: empty(),
        internalTransfer: empty(),
        recirculation: empty(),
        spillage: empty(),
        roadFuel: empty(),
        calibration: empty(),
        adjustment: empty(),
        opsEmpty: empty(),
        netChange: 0,
      };

      const typeMap: Record<string, keyof LitreLifecycleSummary> = {
        fill: 'purchased',
        dispense: 'delivered',
        internal_transfer: 'internalTransfer',
        recirculation: 'recirculation',
        spillage: 'spillage',
        road_fuel: 'roadFuel',
        calibration: 'calibration',
        adjustment: 'adjustment',
        ops_empty: 'opsEmpty',
      };

      for (const row of rows) {
        const key = typeMap[row.transactionType];
        if (key && key !== 'netChange') {
          const cat = summary[key] as LifecycleCategory;
          cat.litres = parseFloat(parseFloat(row.totalLitres).toFixed(2));
          cat.cost = parseFloat(parseFloat(row.totalCost).toFixed(2));
          cat.count = parseInt(row.txCount);
        }
      }

      summary.netChange = parseFloat(
        (summary.purchased.litres - summary.delivered.litres - summary.spillage.litres - summary.roadFuel.litres - summary.opsEmpty.litres + summary.adjustment.litres).toFixed(2)
      );

      return { success: true, data: summary };
    } catch (error) {
      console.error('[FuelLedger] getLitreLifecycleSummary error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async getTruckFuelSummary(truckId: string): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      const [truck] = await db.select().from(trucks).where(eq(trucks.id, truckId));
      if (!truck) {
        return { success: false, error: `Truck ${truckId} not found` };
      }

      const fuelTypes: FuelType[] = ['regular', 'premium', 'diesel'];
      const levels = fuelTypes.map((ft) => ({
        fuelType: ft,
        currentLevel: parseFloat(truck[getLevelField(ft)]?.toString() || '0'),
        capacity: parseFloat(truck[getCapacityField(ft)]?.toString() || '0'),
        percentFull: (() => {
          const cap = parseFloat(truck[getCapacityField(ft)]?.toString() || '0');
          const lvl = parseFloat(truck[getLevelField(ft)]?.toString() || '0');
          return cap > 0 ? parseFloat(((lvl / cap) * 100).toFixed(1)) : 0;
        })(),
      }));

      const recentTransactions = await db
        .select()
        .from(truckFuelTransactions)
        .where(eq(truckFuelTransactions.truckId, truckId))
        .orderBy(desc(truckFuelTransactions.createdAt))
        .limit(20);

      const totals = await db
        .select({
          transactionType: truckFuelTransactions.transactionType,
          totalLitres: sql<string>`COALESCE(SUM(ABS(CAST(${truckFuelTransactions.litres} AS numeric))), 0)`,
          totalCost: sql<string>`COALESCE(SUM(CAST(${truckFuelTransactions.totalCost} AS numeric)), 0)`,
          txCount: sql<string>`COUNT(*)`,
        })
        .from(truckFuelTransactions)
        .where(eq(truckFuelTransactions.truckId, truckId))
        .groupBy(truckFuelTransactions.transactionType);

      const totalsByType: Record<string, { litres: number; cost: number; count: number }> = {};
      for (const row of totals) {
        totalsByType[row.transactionType] = {
          litres: parseFloat(parseFloat(row.totalLitres).toFixed(2)),
          cost: parseFloat(parseFloat(row.totalCost).toFixed(2)),
          count: parseInt(row.txCount),
        };
      }

      return {
        success: true,
        data: {
          truck: {
            id: truck.id,
            unitNumber: truck.unitNumber,
            name: truck.name,
          },
          levels,
          recentTransactions,
          totalsByType,
        },
      };
    } catch (error) {
      console.error('[FuelLedger] getTruckFuelSummary error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async getSupplierPurchaseHistory(limit: number = 10): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      const recentPurchases = await db
        .select({
          id: truckFuelTransactions.id,
          supplierName: truckFuelTransactions.supplierName,
          supplierInvoice: truckFuelTransactions.supplierInvoice,
          fuelType: truckFuelTransactions.fuelType,
          litres: truckFuelTransactions.litres,
          costPerLitre: truckFuelTransactions.costPerLitre,
          totalCost: truckFuelTransactions.totalCost,
          truckId: truckFuelTransactions.truckId,
          createdAt: truckFuelTransactions.createdAt,
        })
        .from(truckFuelTransactions)
        .where(
          and(
            eq(truckFuelTransactions.transactionType, 'fill'),
            isNotNull(truckFuelTransactions.costPerLitre)
          )
        )
        .orderBy(desc(truckFuelTransactions.createdAt))
        .limit(limit);

      const supplierStats = await db
        .select({
          supplierName: truckFuelTransactions.supplierName,
          purchaseCount: sql<string>`COUNT(*)`,
          totalLitres: sql<string>`COALESCE(SUM(CAST(${truckFuelTransactions.litres} AS numeric)), 0)`,
          avgCostPerLitre: sql<string>`COALESCE(AVG(CAST(${truckFuelTransactions.costPerLitre} AS numeric)), 0)`,
          lastPurchase: sql<Date>`MAX(${truckFuelTransactions.createdAt})`,
        })
        .from(truckFuelTransactions)
        .where(
          and(
            eq(truckFuelTransactions.transactionType, 'fill'),
            isNotNull(truckFuelTransactions.supplierName),
            isNotNull(truckFuelTransactions.costPerLitre)
          )
        )
        .groupBy(truckFuelTransactions.supplierName)
        .orderBy(sql`COUNT(*) DESC`);

      const avgCostByFuelType = await db
        .select({
          fuelType: truckFuelTransactions.fuelType,
          avgCost: sql<string>`COALESCE(SUM(CAST(${truckFuelTransactions.litres} AS numeric) * CAST(${truckFuelTransactions.costPerLitre} AS numeric)) / NULLIF(SUM(CAST(${truckFuelTransactions.litres} AS numeric)), 0), 0)`,
          totalLitres: sql<string>`COALESCE(SUM(CAST(${truckFuelTransactions.litres} AS numeric)), 0)`,
        })
        .from(truckFuelTransactions)
        .where(
          and(
            eq(truckFuelTransactions.transactionType, 'fill'),
            isNotNull(truckFuelTransactions.costPerLitre)
          )
        )
        .groupBy(truckFuelTransactions.fuelType);

      const mostFrequentSupplier = supplierStats.length > 0 ? supplierStats[0].supplierName : null;

      const avgCostMap: Record<string, number> = {};
      for (const row of avgCostByFuelType) {
        avgCostMap[row.fuelType] = parseFloat(parseFloat(row.avgCost).toFixed(4));
      }

      return {
        success: true,
        data: {
          recentPurchases: recentPurchases.map((p) => ({
            id: p.id,
            supplierName: p.supplierName,
            supplierInvoice: p.supplierInvoice,
            fuelType: p.fuelType,
            litres: parseFloat(p.litres?.toString() || '0'),
            costPerLitre: parseFloat(p.costPerLitre?.toString() || '0'),
            totalCost: parseFloat(p.totalCost?.toString() || '0'),
            truckId: p.truckId,
            date: p.createdAt,
          })),
          supplierStats: supplierStats.map((s) => ({
            supplierName: s.supplierName,
            purchaseCount: parseInt(s.purchaseCount),
            totalLitres: parseFloat(parseFloat(s.totalLitres).toFixed(2)),
            avgCostPerLitre: parseFloat(parseFloat(s.avgCostPerLitre).toFixed(4)),
            lastPurchase: s.lastPurchase,
          })),
          mostFrequentSupplier,
          avgCostByFuelType: avgCostMap,
        },
      };
    } catch (error) {
      console.error('[FuelLedger] getSupplierPurchaseHistory error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async recordRecirculation(input: {
    truckId: string;
    fuelType: FuelType;
    litres: number;
    operatorId: string;
    operatorName: string;
    reason?: string;
    notes?: string;
  }): Promise<{ success: boolean; error?: string; data?: { transactionId: string } }> {
    try {
      const { truckId, fuelType, litres, operatorId, operatorName, reason, notes } = input;

      if (litres <= 0) {
        return { success: false, error: 'Litres must be positive for recirculation' };
      }

      const tdgInfo = TDG_FUEL_INFO[fuelType];
      const levelField = getLevelField(fuelType);

      const [truck] = await db.select().from(trucks).where(eq(trucks.id, truckId));
      if (!truck) {
        return { success: false, error: `Truck ${truckId} not found` };
      }

      const currentLevel = parseFloat(truck[levelField]?.toString() || '0');

      const [truckTx] = await db
        .insert(truckFuelTransactions)
        .values({
          truckId,
          transactionType: 'recirculation',
          fuelType,
          litres: litres.toFixed(2),
          previousLevel: currentLevel.toFixed(2),
          newLevel: currentLevel.toFixed(2),
          unNumber: tdgInfo.unNumber,
          properShippingName: tdgInfo.properShippingName,
          dangerClass: tdgInfo.class,
          packingGroup: tdgInfo.packingGroup,
          operatorId,
          operatorName,
          reason: reason || null,
          notes: notes || null,
        })
        .returning();

      return { success: true, data: { transactionId: truckTx.id } };
    } catch (error) {
      console.error('[FuelLedger] recordRecirculation error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error recording recirculation' };
    }
  },

  async recordInternalTransfer(input: {
    sourceTruckId: string;
    destinationTruckId: string;
    fuelType: FuelType;
    litres: number;
    operatorId: string;
    operatorName: string;
    reason?: string;
    emergencyFlag?: boolean;
    notes?: string;
  }): Promise<{ success: boolean; error?: string; data?: { sourceTransactionId: string; destinationTransactionId: string } }> {
    try {
      const { sourceTruckId, destinationTruckId, fuelType, litres, operatorId, operatorName, reason, emergencyFlag, notes } = input;

      if (litres <= 0) {
        return { success: false, error: 'Litres must be positive for internal transfer' };
      }

      const tdgInfo = TDG_FUEL_INFO[fuelType];
      const levelField = getLevelField(fuelType);
      const isEmergency = emergencyFlag || false;
      const txReason = reason || (isEmergency ? 'Emergency self-fuel' : null);

      const result = await db.transaction(async (tx) => {
        const [sourceTruck] = await tx.select().from(trucks).where(eq(trucks.id, sourceTruckId));
        if (!sourceTruck) {
          throw new Error(`Source truck ${sourceTruckId} not found`);
        }

        const [destTruck] = await tx.select().from(trucks).where(eq(trucks.id, destinationTruckId));
        if (!destTruck) {
          throw new Error(`Destination truck ${destinationTruckId} not found`);
        }

        const sourcePrevLevel = parseFloat(sourceTruck[levelField]?.toString() || '0');
        const sourceNewLevel = sourcePrevLevel - litres;

        const destPrevLevel = parseFloat(destTruck[levelField]?.toString() || '0');
        const destNewLevel = destPrevLevel + litres;

        const [sourceTx] = await tx
          .insert(truckFuelTransactions)
          .values({
            truckId: sourceTruckId,
            transactionType: 'internal_transfer',
            fuelType,
            litres: (-litres).toFixed(2),
            previousLevel: sourcePrevLevel.toFixed(2),
            newLevel: sourceNewLevel.toFixed(2),
            unNumber: tdgInfo.unNumber,
            properShippingName: tdgInfo.properShippingName,
            dangerClass: tdgInfo.class,
            packingGroup: tdgInfo.packingGroup,
            operatorId,
            operatorName,
            sourceTruckId,
            destinationTruckId,
            reason: txReason,
            emergencyFlag: isEmergency,
            notes: notes || null,
          })
          .returning();

        const [destTx] = await tx
          .insert(truckFuelTransactions)
          .values({
            truckId: destinationTruckId,
            transactionType: 'internal_transfer',
            fuelType,
            litres: litres.toFixed(2),
            previousLevel: destPrevLevel.toFixed(2),
            newLevel: destNewLevel.toFixed(2),
            unNumber: tdgInfo.unNumber,
            properShippingName: tdgInfo.properShippingName,
            dangerClass: tdgInfo.class,
            packingGroup: tdgInfo.packingGroup,
            operatorId,
            operatorName,
            sourceTruckId,
            destinationTruckId,
            reason: txReason,
            emergencyFlag: isEmergency,
            notes: notes || null,
          })
          .returning();

        await tx
          .update(truckFuelTransactions)
          .set({ linkedTransactionId: destTx.id })
          .where(eq(truckFuelTransactions.id, sourceTx.id));

        await tx
          .update(truckFuelTransactions)
          .set({ linkedTransactionId: sourceTx.id })
          .where(eq(truckFuelTransactions.id, destTx.id));

        await tx
          .update(trucks)
          .set({ [levelField]: sourceNewLevel.toFixed(2), updatedAt: new Date() })
          .where(eq(trucks.id, sourceTruckId));

        await tx
          .update(trucks)
          .set({ [levelField]: destNewLevel.toFixed(2), updatedAt: new Date() })
          .where(eq(trucks.id, destinationTruckId));

        return { sourceTransactionId: sourceTx.id, destinationTransactionId: destTx.id };
      });

      return { success: true, data: result };
    } catch (error) {
      console.error('[FuelLedger] recordInternalTransfer error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error recording internal transfer' };
    }
  },

  async recordRoadFuel(input: {
    truckId: string;
    fuelType: FuelType;
    litres: number;
    operatorId: string;
    operatorName: string;
    reason?: string;
    emergencyFlag?: boolean;
    notes?: string;
  }): Promise<{ success: boolean; error?: string; data?: { transactionId: string } }> {
    try {
      const { truckId, fuelType, litres, operatorId, operatorName, reason, emergencyFlag, notes } = input;

      if (litres <= 0) {
        return { success: false, error: 'Litres must be positive for road fuel' };
      }

      const tdgInfo = TDG_FUEL_INFO[fuelType];
      const levelField = getLevelField(fuelType);

      const result = await db.transaction(async (tx) => {
        const [truck] = await tx.select().from(trucks).where(eq(trucks.id, truckId));
        if (!truck) {
          throw new Error(`Truck ${truckId} not found`);
        }

        const previousLevel = parseFloat(truck[levelField]?.toString() || '0');
        const newLevel = previousLevel - litres;

        const [truckTx] = await tx
          .insert(truckFuelTransactions)
          .values({
            truckId,
            transactionType: 'road_fuel',
            fuelType,
            litres: (-litres).toFixed(2),
            previousLevel: previousLevel.toFixed(2),
            newLevel: newLevel.toFixed(2),
            unNumber: tdgInfo.unNumber,
            properShippingName: tdgInfo.properShippingName,
            dangerClass: tdgInfo.class,
            packingGroup: tdgInfo.packingGroup,
            operatorId,
            operatorName,
            reason: reason || null,
            emergencyFlag: emergencyFlag || false,
            notes: notes || null,
          })
          .returning();

        await tx
          .update(trucks)
          .set({ [levelField]: newLevel.toFixed(2), updatedAt: new Date() })
          .where(eq(trucks.id, truckId));

        return { transactionId: truckTx.id };
      });

      return { success: true, data: result };
    } catch (error) {
      console.error('[FuelLedger] recordRoadFuel error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error recording road fuel' };
    }
  },

  async recordCalibration(input: {
    truckId: string;
    fuelType: FuelType;
    litres: number;
    operatorId: string;
    operatorName: string;
    notes?: string;
  }): Promise<{ success: boolean; error?: string; data?: { transactionId: string } }> {
    try {
      const { truckId, fuelType, litres, operatorId, operatorName, notes } = input;

      if (litres <= 0) {
        return { success: false, error: 'Litres must be positive for calibration' };
      }

      const tdgInfo = TDG_FUEL_INFO[fuelType];
      const levelField = getLevelField(fuelType);

      const [truck] = await db.select().from(trucks).where(eq(trucks.id, truckId));
      if (!truck) {
        return { success: false, error: `Truck ${truckId} not found` };
      }

      const currentLevel = parseFloat(truck[levelField]?.toString() || '0');

      const [truckTx] = await db
        .insert(truckFuelTransactions)
        .values({
          truckId,
          transactionType: 'calibration',
          fuelType,
          litres: litres.toFixed(2),
          previousLevel: currentLevel.toFixed(2),
          newLevel: currentLevel.toFixed(2),
          unNumber: tdgInfo.unNumber,
          properShippingName: tdgInfo.properShippingName,
          dangerClass: tdgInfo.class,
          packingGroup: tdgInfo.packingGroup,
          operatorId,
          operatorName,
          notes: notes || null,
        })
        .returning();

      return { success: true, data: { transactionId: truckTx.id } };
    } catch (error) {
      console.error('[FuelLedger] recordCalibration error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error recording calibration' };
    }
  },

  async recordSpillage(input: {
    truckId: string;
    fuelType: FuelType;
    litres: number;
    operatorId: string;
    operatorName: string;
    reason?: string;
    notes?: string;
  }): Promise<{ success: boolean; error?: string; data?: { transactionId: string } }> {
    try {
      const { truckId, fuelType, litres, operatorId, operatorName, reason, notes } = input;

      if (litres <= 0) {
        return { success: false, error: 'Litres must be positive for spillage' };
      }

      const tdgInfo = TDG_FUEL_INFO[fuelType];
      const levelField = getLevelField(fuelType);

      const result = await db.transaction(async (tx) => {
        const [truck] = await tx.select().from(trucks).where(eq(trucks.id, truckId));
        if (!truck) {
          throw new Error(`Truck ${truckId} not found`);
        }

        const previousLevel = parseFloat(truck[levelField]?.toString() || '0');
        const newLevel = previousLevel - litres;

        const [truckTx] = await tx
          .insert(truckFuelTransactions)
          .values({
            truckId,
            transactionType: 'spillage',
            fuelType,
            litres: (-litres).toFixed(2),
            previousLevel: previousLevel.toFixed(2),
            newLevel: newLevel.toFixed(2),
            unNumber: tdgInfo.unNumber,
            properShippingName: tdgInfo.properShippingName,
            dangerClass: tdgInfo.class,
            packingGroup: tdgInfo.packingGroup,
            operatorId,
            operatorName,
            reason: reason || null,
            notes: notes || null,
          })
          .returning();

        await tx
          .update(trucks)
          .set({ [levelField]: newLevel.toFixed(2), updatedAt: new Date() })
          .where(eq(trucks.id, truckId));

        const [inventoryRecord] = await tx
          .select()
          .from(fuelInventory)
          .where(eq(fuelInventory.fuelType, fuelType));

        const previousStock = inventoryRecord ? parseFloat(inventoryRecord.currentStock?.toString() || '0') : 0;
        const newStock = previousStock - litres;

        await tx
          .insert(fuelInventoryTransactions)
          .values({
            fuelType,
            type: 'spill',
            quantity: (-litres).toFixed(2),
            previousStock: previousStock.toFixed(2),
            newStock: newStock.toFixed(2),
            notes: `Spillage from truck ${truck.unitNumber || truckId}${reason ? `: ${reason}` : ''}`,
            createdBy: operatorId,
          });

        if (inventoryRecord) {
          await tx
            .update(fuelInventory)
            .set({ currentStock: newStock.toFixed(2), updatedAt: new Date() })
            .where(eq(fuelInventory.fuelType, fuelType));
        }

        return { transactionId: truckTx.id };
      });

      return { success: true, data: result };
    } catch (error) {
      console.error('[FuelLedger] recordSpillage error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error recording spillage' };
    }
  },

  async getFuelMarginReport(startDate: Date, endDate: Date): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      const fuelTypes: FuelType[] = ['regular', 'premium', 'diesel'];
      const marginByFuelType: Record<string, any> = {};
      let totalRevenue = 0;
      let totalCogs = 0;
      let totalLitresDelivered = 0;

      for (const ft of fuelTypes) {
        const costResult = await this.getWeightedAverageCostForPeriod(ft, startDate, endDate);
        const avgCost = costResult.data?.avgCostPerLitre || 0;

        const [dispensed] = await db
          .select({
            totalLitres: sql<string>`COALESCE(SUM(ABS(CAST(${truckFuelTransactions.litres} AS numeric))), 0)`,
          })
          .from(truckFuelTransactions)
          .where(
            and(
              eq(truckFuelTransactions.fuelType, ft),
              eq(truckFuelTransactions.transactionType, 'dispense'),
              gte(truckFuelTransactions.createdAt, startDate),
              lte(truckFuelTransactions.createdAt, endDate)
            )
          );

        const litresDelivered = parseFloat(dispensed?.totalLitres || '0');

        const [revenueRow] = await db
          .select({
            totalRevenue: sql<string>`COALESCE(SUM(
              CASE 
                WHEN ${orders.finalAmount} IS NOT NULL THEN CAST(${orders.finalAmount} AS numeric)
                ELSE CAST(${orders.subtotal} AS numeric)
              END
            ), 0)`,
          })
          .from(orders)
          .where(
            and(
              eq(orders.fuelType, ft),
              eq(orders.status, 'completed'),
              gte(orders.createdAt, startDate),
              lte(orders.createdAt, endDate)
            )
          );

        const revenue = parseFloat(revenueRow?.totalRevenue || '0');
        const cogs = litresDelivered * avgCost;
        const grossMargin = revenue - cogs;
        const marginPerLitre = litresDelivered > 0 ? grossMargin / litresDelivered : 0;
        const marginPercent = revenue > 0 ? (grossMargin / revenue) * 100 : 0;

        marginByFuelType[ft] = {
          avgCostPerLitre: parseFloat(avgCost.toFixed(4)),
          litresDelivered: parseFloat(litresDelivered.toFixed(2)),
          revenue: parseFloat(revenue.toFixed(2)),
          cogs: parseFloat(cogs.toFixed(2)),
          grossMargin: parseFloat(grossMargin.toFixed(2)),
          marginPerLitre: parseFloat(marginPerLitre.toFixed(4)),
          marginPercent: parseFloat(marginPercent.toFixed(2)),
        };

        totalRevenue += revenue;
        totalCogs += cogs;
        totalLitresDelivered += litresDelivered;
      }

      const totalGrossMargin = totalRevenue - totalCogs;
      const totalMarginPerLitre = totalLitresDelivered > 0 ? totalGrossMargin / totalLitresDelivered : 0;
      const totalMarginPercent = totalRevenue > 0 ? (totalGrossMargin / totalRevenue) * 100 : 0;

      return {
        success: true,
        data: {
          period: { startDate, endDate },
          byFuelType: marginByFuelType,
          totals: {
            revenue: parseFloat(totalRevenue.toFixed(2)),
            cogs: parseFloat(totalCogs.toFixed(2)),
            grossMargin: parseFloat(totalGrossMargin.toFixed(2)),
            marginPerLitre: parseFloat(totalMarginPerLitre.toFixed(4)),
            marginPercent: parseFloat(totalMarginPercent.toFixed(2)),
            litresDelivered: parseFloat(totalLitresDelivered.toFixed(2)),
          },
        },
      };
    } catch (error) {
      console.error('[FuelLedger] getFuelMarginReport error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
