import { db } from "./db";
import { auditLog, type AuditLogEntry, type InsertAuditLogEntry } from "@shared/schema";
import { eq, and, desc, lt } from "drizzle-orm";

const CRA_RETENTION_YEARS = 6;

function retainUntilDate(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() + CRA_RETENTION_YEARS);
  return date;
}

function stringify(data: unknown): string | undefined {
  if (data === undefined || data === null) return undefined;
  if (typeof data === "string") return data;
  return JSON.stringify(data);
}

export const auditService = {
  async log(input: {
    entityType: string;
    entityId: string;
    action: InsertAuditLogEntry["action"];
    userId?: string;
    userName?: string;
    changesSummary?: string;
    previousData?: unknown;
    newData?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLogEntry | null> {
    try {
      const [entry] = await db
        .insert(auditLog)
        .values({
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          userId: input.userId,
          userName: input.userName,
          changesSummary: input.changesSummary,
          previousData: stringify(input.previousData),
          newData: stringify(input.newData),
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          retainUntil: retainUntilDate(),
        })
        .returning();
      return entry;
    } catch (error) {
      console.error("Audit log write failed:", error);
      return null;
    }
  },

  async getAuditTrail(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    return db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
      .orderBy(desc(auditLog.createdAt));
  },

  async getRecentActivity(limit: number = 50): Promise<AuditLogEntry[]> {
    return db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  },

  async purgeExpired(): Promise<number> {
    const result = await db
      .delete(auditLog)
      .where(lt(auditLog.retainUntil, new Date()))
      .returning({ id: auditLog.id });
    return result.length;
  },

  async logInvoiceEvent(
    action: InsertAuditLogEntry["action"],
    invoiceId: string,
    userId: string,
    userName: string,
    summary: string,
    previousData?: unknown,
    newData?: unknown,
  ) {
    return this.log({
      entityType: "invoice",
      entityId: invoiceId,
      action,
      userId,
      userName,
      changesSummary: summary,
      previousData,
      newData,
    });
  },

  async logExpenseEvent(
    action: InsertAuditLogEntry["action"],
    expenseId: string,
    userId: string,
    userName: string,
    summary: string,
    previousData?: unknown,
    newData?: unknown,
  ) {
    return this.log({
      entityType: "expense",
      entityId: expenseId,
      action,
      userId,
      userName,
      changesSummary: summary,
      previousData,
      newData,
    });
  },

  async logFuelEvent(
    action: InsertAuditLogEntry["action"],
    transactionId: string,
    userId: string,
    userName: string,
    summary: string,
    previousData?: unknown,
    newData?: unknown,
  ) {
    return this.log({
      entityType: "fuel_transaction",
      entityId: transactionId,
      action,
      userId,
      userName,
      changesSummary: summary,
      previousData,
      newData,
    });
  },
};

// Schedule daily audit purge at 3am Calgary time
function scheduleAuditPurge() {
  const checkAndPurge = async () => {
    const now = new Date();
    const calgaryHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/Edmonton' })).getHours();
    if (calgaryHour === 3) {
      try {
        const count = await auditService.purgeExpired();
        if (count > 0) {
          console.log(`[AuditPurge] Removed ${count} expired audit entries`);
        }
      } catch (e) {
        console.error('[AuditPurge] Failed:', e);
      }
    }
  };
  setInterval(checkAndPurge, 60 * 60 * 1000);
  console.log('[AuditPurge] Scheduler initialized - will purge expired entries at 3am Calgary time daily');
}
scheduleAuditPurge();
