import { db } from './db';
import { expenses, type InsertExpense, type Expense } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, inArray } from 'drizzle-orm';

function getTaxQuarter(date: Date): number {
  const month = date.getMonth() + 1;
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

function getTaxYear(date: Date): number {
  return date.getFullYear();
}

function calculateNetAmount(amount: number, gstPaid: number): string {
  return (amount - gstPaid).toFixed(2);
}

interface ExpenseFilters {
  category?: string;
  vendor?: string;
  taxYear?: number;
  taxQuarter?: number;
  startDate?: Date;
  endDate?: Date;
  itcClaimed?: boolean;
  limit?: number;
  offset?: number;
}

export const expenseService = {
  async createExpense(input: Omit<InsertExpense, 'netAmount' | 'taxYear' | 'taxQuarter'>) {
    try {
      const expenseDate = new Date(input.expenseDate);
      const amount = parseFloat(String(input.amount));
      const gstPaid = parseFloat(String(input.gstPaid ?? '0'));

      const [created] = await db.insert(expenses).values({
        ...input,
        netAmount: calculateNetAmount(amount, gstPaid),
        taxYear: getTaxYear(expenseDate),
        taxQuarter: getTaxQuarter(expenseDate),
      }).returning();

      return { success: true, data: created };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async updateExpense(id: string, updates: Partial<InsertExpense>) {
    try {
      const existing = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
      if (!existing.length) {
        return { success: false, error: 'Expense not found' };
      }

      const current = existing[0];
      const finalUpdates: Record<string, any> = { ...updates, updatedAt: new Date() };

      if (updates.amount !== undefined || updates.gstPaid !== undefined) {
        const amount = parseFloat(String(updates.amount ?? current.amount));
        const gstPaid = parseFloat(String(updates.gstPaid ?? current.gstPaid));
        finalUpdates.netAmount = calculateNetAmount(amount, gstPaid);
      }

      if (updates.expenseDate !== undefined) {
        const expenseDate = new Date(updates.expenseDate);
        finalUpdates.taxYear = getTaxYear(expenseDate);
        finalUpdates.taxQuarter = getTaxQuarter(expenseDate);
      }

      const [updated] = await db.update(expenses)
        .set(finalUpdates)
        .where(eq(expenses.id, id))
        .returning();

      return { success: true, data: updated };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async deleteExpense(id: string) {
    try {
      const result = await db.delete(expenses).where(eq(expenses.id, id)).returning();
      if (!result.length) {
        return { success: false, error: 'Expense not found' };
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getExpense(id: string) {
    try {
      const [expense] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
      if (!expense) {
        return { success: false, error: 'Expense not found' };
      }
      return { success: true, data: expense };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getExpenses(filters: ExpenseFilters = {}) {
    try {
      const conditions: any[] = [];

      if (filters.category) {
        conditions.push(eq(expenses.category, filters.category as any));
      }
      if (filters.vendor) {
        conditions.push(eq(expenses.vendor, filters.vendor));
      }
      if (filters.taxYear !== undefined) {
        conditions.push(eq(expenses.taxYear, filters.taxYear));
      }
      if (filters.taxQuarter !== undefined) {
        conditions.push(eq(expenses.taxQuarter, filters.taxQuarter));
      }
      if (filters.startDate) {
        conditions.push(gte(expenses.expenseDate, filters.startDate));
      }
      if (filters.endDate) {
        conditions.push(lte(expenses.expenseDate, filters.endDate));
      }
      if (filters.itcClaimed !== undefined) {
        conditions.push(eq(expenses.itcClaimed, filters.itcClaimed));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [expenseRows, countResult] = await Promise.all([
        db.select()
          .from(expenses)
          .where(whereClause)
          .orderBy(desc(expenses.expenseDate))
          .limit(filters.limit ?? 100)
          .offset(filters.offset ?? 0),
        db.select({ total: sql<number>`count(*)::int` })
          .from(expenses)
          .where(whereClause),
      ]);

      return {
        success: true,
        data: {
          expenses: expenseRows,
          total: countResult[0]?.total ?? 0,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getExpenseSummaryByCategory(taxYear: number) {
    try {
      const results = await db.select({
        category: expenses.category,
        totalAmount: sql<string>`sum(${expenses.amount})::numeric(12,2)`,
        totalGstPaid: sql<string>`sum(${expenses.gstPaid})::numeric(12,2)`,
        totalNetAmount: sql<string>`sum(${expenses.netAmount})::numeric(12,2)`,
        count: sql<number>`count(*)::int`,
      })
        .from(expenses)
        .where(eq(expenses.taxYear, taxYear))
        .groupBy(expenses.category);

      return { success: true, data: results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getITCSummary(taxYear: number, quarter?: number) {
    try {
      const conditions: any[] = [eq(expenses.taxYear, taxYear)];
      if (quarter !== undefined) {
        conditions.push(eq(expenses.taxQuarter, quarter));
      }

      const whereClause = and(...conditions);

      const [unclaimedResult, claimedResult] = await Promise.all([
        db.select({
          total: sql<string>`coalesce(sum(${expenses.gstPaid}), 0)::numeric(12,2)`,
          count: sql<number>`count(*)::int`,
        })
          .from(expenses)
          .where(and(whereClause, eq(expenses.itcClaimed, false))),
        db.select({
          total: sql<string>`coalesce(sum(${expenses.gstPaid}), 0)::numeric(12,2)`,
          count: sql<number>`count(*)::int`,
        })
          .from(expenses)
          .where(and(whereClause, eq(expenses.itcClaimed, true))),
      ]);

      const unclaimed = parseFloat(unclaimedResult[0]?.total ?? '0');
      const claimed = parseFloat(claimedResult[0]?.total ?? '0');

      return {
        success: true,
        data: {
          unclaimed,
          claimed,
          total: unclaimed + claimed,
          expenseCount: (unclaimedResult[0]?.count ?? 0) + (claimedResult[0]?.count ?? 0),
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async markITCsClaimed(expenseIds: string[], claimedDate?: Date) {
    try {
      if (!expenseIds.length) {
        return { success: false, error: 'No expense IDs provided' };
      }

      const result = await db.update(expenses)
        .set({
          itcClaimed: true,
          itcClaimedDate: claimedDate ?? new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(expenses.id, expenseIds))
        .returning();

      return { success: true, data: { count: result.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getExpensesByVendor(taxYear?: number) {
    try {
      const whereClause = taxYear !== undefined
        ? eq(expenses.taxYear, taxYear)
        : undefined;

      const results = await db.select({
        vendor: expenses.vendor,
        totalSpent: sql<string>`sum(${expenses.amount})::numeric(12,2)`,
        totalGstPaid: sql<string>`sum(${expenses.gstPaid})::numeric(12,2)`,
        count: sql<number>`count(*)::int`,
      })
        .from(expenses)
        .where(whereClause)
        .groupBy(expenses.vendor)
        .orderBy(sql`sum(${expenses.amount}) desc`);

      return { success: true, data: results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async createExpenseFromFuelPurchase(
    truckFuelTransactionId: string,
    truckId: string,
    supplierName: string,
    litres: number,
    costPerLitre: number,
    totalCost: number,
    gstPaid: number,
    operatorId: string,
  ) {
    try {
      const now = new Date();
      const description = `Fuel purchase - ${litres}L @ $${costPerLitre.toFixed(2)}/L from ${supplierName}`;

      return await this.createExpense({
        category: 'fuel_oil',
        description,
        vendor: supplierName,
        amount: totalCost.toFixed(2),
        gstPaid: gstPaid.toFixed(2),
        truckId,
        fuelTransactionId: truckFuelTransactionId,
        expenseDate: now,
        createdBy: operatorId,
      });
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
