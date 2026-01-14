import { db } from "./db";
import { dailyNetMarginSnapshots, orders, fuelInventoryTransactions, businessSettings } from "@shared/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

const BUSINESS_START_DATE = new Date('2025-12-23T00:00:00-07:00');
const REAL_DATA_START_DATE = new Date('2026-01-06T00:00:00-07:00');

export async function calculateDailyNetMargin(date: Date): Promise<{
  netMarginPercent: number;
  totalRevenue: number;
  totalCogs: number;
  totalOperatingCosts: number;
  netProfit: number;
  ordersCompleted: number;
  litresDelivered: number;
}> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const completedOrders = await db.select()
    .from(orders)
    .where(
      and(
        eq(orders.status, 'completed'),
        gte(orders.scheduledDate, startOfDay),
        lte(orders.scheduledDate, endOfDay)
      )
    );

  let totalRevenue = 0;
  let totalLitres = 0;
  
  for (const order of completedOrders) {
    totalRevenue += parseFloat(order.total) || 0;
    totalLitres += parseFloat(order.actualLitresDelivered || order.fuelAmount?.toString() || '0');
  }

  const fuelTransactions = await db.select()
    .from(fuelInventoryTransactions)
    .where(
      and(
        eq(fuelInventoryTransactions.type, 'purchase'),
        gte(fuelInventoryTransactions.createdAt, startOfDay),
        lte(fuelInventoryTransactions.createdAt, endOfDay)
      )
    );

  let totalCogs = 0;
  for (const tx of fuelTransactions) {
    if (tx.costPerLitre && tx.quantity) {
      totalCogs += parseFloat(tx.costPerLitre) * parseFloat(tx.quantity);
    }
  }

  const opCostSetting = await db.select()
    .from(businessSettings)
    .where(eq(businessSettings.settingKey, 'monthly_operating_costs'))
    .limit(1);
  
  const monthlyOpCosts = opCostSetting.length > 0 
    ? parseFloat(opCostSetting[0].settingValue) || 0 
    : 0;
  const dailyOpCosts = monthlyOpCosts / 30;

  const gstExcludedRevenue = totalRevenue / 1.05;
  const grossProfit = gstExcludedRevenue - totalCogs;
  const netProfit = grossProfit - dailyOpCosts;
  const netMarginPercent = gstExcludedRevenue > 0 
    ? (netProfit / gstExcludedRevenue) * 100 
    : 0;

  return {
    netMarginPercent,
    totalRevenue: gstExcludedRevenue,
    totalCogs,
    totalOperatingCosts: dailyOpCosts,
    netProfit,
    ordersCompleted: completedOrders.length,
    litresDelivered: totalLitres,
  };
}

export async function logDailyNetMargin(date: Date): Promise<void> {
  const snapshotDate = new Date(date);
  snapshotDate.setHours(22, 0, 0, 0);

  const existing = await db.select()
    .from(dailyNetMarginSnapshots)
    .where(
      sql`DATE(${dailyNetMarginSnapshots.snapshotDate}) = DATE(${snapshotDate})`
    )
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  const metrics = await calculateDailyNetMargin(date);

  await db.insert(dailyNetMarginSnapshots).values({
    snapshotDate,
    netMarginPercent: metrics.netMarginPercent.toFixed(4),
    totalRevenue: metrics.totalRevenue.toFixed(2),
    totalCogs: metrics.totalCogs.toFixed(2),
    totalOperatingCosts: metrics.totalOperatingCosts.toFixed(2),
    netProfit: metrics.netProfit.toFixed(2),
    ordersCompleted: metrics.ordersCompleted,
    litresDelivered: metrics.litresDelivered.toFixed(2),
  });
}

export async function backfillNetMarginData(): Promise<{ backfilledDays: number }> {
  const today = new Date();
  let current = new Date(BUSINESS_START_DATE);
  let backfilledDays = 0;

  while (current <= today) {
    const snapshotDate = new Date(current);
    snapshotDate.setHours(22, 0, 0, 0);

    const existing = await db.select()
      .from(dailyNetMarginSnapshots)
      .where(
        sql`DATE(${dailyNetMarginSnapshots.snapshotDate}) = DATE(${snapshotDate})`
      )
      .limit(1);

    if (existing.length === 0) {
      if (current < REAL_DATA_START_DATE) {
        await db.insert(dailyNetMarginSnapshots).values({
          snapshotDate,
          netMarginPercent: "0",
          totalRevenue: "0",
          totalCogs: "0",
          totalOperatingCosts: "0",
          netProfit: "0",
          ordersCompleted: 0,
          litresDelivered: "0",
        });
      } else {
        const metrics = await calculateDailyNetMargin(current);
        await db.insert(dailyNetMarginSnapshots).values({
          snapshotDate,
          netMarginPercent: metrics.netMarginPercent.toFixed(4),
          totalRevenue: metrics.totalRevenue.toFixed(2),
          totalCogs: metrics.totalCogs.toFixed(2),
          totalOperatingCosts: metrics.totalOperatingCosts.toFixed(2),
          netProfit: metrics.netProfit.toFixed(2),
          ordersCompleted: metrics.ordersCompleted,
          litresDelivered: metrics.litresDelivered.toFixed(2),
        });
      }
      backfilledDays++;
    }

    current.setDate(current.getDate() + 1);
  }

  return { backfilledDays };
}

export async function getNetMarginHistory(
  period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all',
  year?: number
): Promise<Array<{
  date: string;
  netMarginPercent: number;
  totalRevenue: number;
  netProfit: number;
  ordersCompleted: number;
}>> {
  let startDate: Date;
  let endDate: Date;

  const now = new Date();
  const currentYear = year || now.getFullYear();

  switch (period) {
    case 'daily':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      endDate = now;
      break;
    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 90);
      endDate = now;
      break;
    case 'monthly':
      startDate = new Date(currentYear, 0, 1);
      endDate = new Date(currentYear, 11, 31, 23, 59, 59);
      break;
    case 'yearly':
      startDate = new Date(currentYear, 0, 1);
      endDate = now;
      break;
    case 'all':
    default:
      startDate = BUSINESS_START_DATE;
      endDate = now;
      break;
  }

  const snapshots = await db.select()
    .from(dailyNetMarginSnapshots)
    .where(
      and(
        gte(dailyNetMarginSnapshots.snapshotDate, startDate),
        lte(dailyNetMarginSnapshots.snapshotDate, endDate)
      )
    )
    .orderBy(dailyNetMarginSnapshots.snapshotDate);

  if (period === 'monthly') {
    const monthlyData: Map<string, {
      totalMargin: number;
      totalRevenue: number;
      totalProfit: number;
      totalOrders: number;
      count: number;
    }> = new Map();

    for (const snap of snapshots) {
      const monthKey = new Date(snap.snapshotDate).toISOString().slice(0, 7);
      const existing = monthlyData.get(monthKey) || {
        totalMargin: 0, totalRevenue: 0, totalProfit: 0, totalOrders: 0, count: 0
      };
      
      existing.totalMargin += parseFloat(snap.netMarginPercent);
      existing.totalRevenue += parseFloat(snap.totalRevenue);
      existing.totalProfit += parseFloat(snap.netProfit);
      existing.totalOrders += snap.ordersCompleted;
      existing.count++;
      
      monthlyData.set(monthKey, existing);
    }

    return Array.from(monthlyData.entries()).map(([month, data]) => ({
      date: month,
      netMarginPercent: data.count > 0 ? data.totalMargin / data.count : 0,
      totalRevenue: data.totalRevenue,
      netProfit: data.totalProfit,
      ordersCompleted: data.totalOrders,
    }));
  }

  if (period === 'weekly') {
    const weeklyData: Map<string, {
      totalMargin: number;
      totalRevenue: number;
      totalProfit: number;
      totalOrders: number;
      count: number;
      weekStart: Date;
    }> = new Map();

    for (const snap of snapshots) {
      const snapDate = new Date(snap.snapshotDate);
      const weekStart = new Date(snapDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekKey = weekStart.toISOString().slice(0, 10);
      
      const existing = weeklyData.get(weekKey) || {
        totalMargin: 0, totalRevenue: 0, totalProfit: 0, totalOrders: 0, count: 0, weekStart
      };
      
      existing.totalMargin += parseFloat(snap.netMarginPercent);
      existing.totalRevenue += parseFloat(snap.totalRevenue);
      existing.totalProfit += parseFloat(snap.netProfit);
      existing.totalOrders += snap.ordersCompleted;
      existing.count++;
      
      weeklyData.set(weekKey, existing);
    }

    return Array.from(weeklyData.entries()).map(([week, data]) => ({
      date: week,
      netMarginPercent: data.count > 0 ? data.totalMargin / data.count : 0,
      totalRevenue: data.totalRevenue,
      netProfit: data.totalProfit,
      ordersCompleted: data.totalOrders,
    }));
  }

  return snapshots.map(snap => ({
    date: new Date(snap.snapshotDate).toISOString().slice(0, 10),
    netMarginPercent: parseFloat(snap.netMarginPercent),
    totalRevenue: parseFloat(snap.totalRevenue),
    netProfit: parseFloat(snap.netProfit),
    ordersCompleted: snap.ordersCompleted,
  }));
}

export function scheduleDailyNetMarginLogging(): void {
  const checkAndLog = async () => {
    const now = new Date();
    const calgaryOffset = -7;
    const utcHour = now.getUTCHours();
    const calgaryHour = (utcHour + calgaryOffset + 24) % 24;
    
    if (calgaryHour === 22 && now.getMinutes() < 5) {
      console.log('[NetMargin] Running scheduled daily net margin snapshot...');
      try {
        await logDailyNetMargin(now);
        console.log('[NetMargin] Daily snapshot completed');
      } catch (error) {
        console.error('[NetMargin] Failed to log daily snapshot:', error);
      }
    }
  };

  setInterval(checkAndLog, 5 * 60 * 1000);
  console.log('[NetMargin] Scheduler initialized - will log at 10pm Calgary time daily');
}
