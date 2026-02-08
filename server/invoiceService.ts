import { db } from "./db";
import {
  invoices,
  craBusinessSettings,
  orders,
  orderItems,
  vehicles,
  users,
  type Invoice,
  type InvoiceLineItem,
  type CraBusinessSettings,
} from "@shared/schema";
import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";

const FUEL_TYPE_LABELS: Record<string, string> = {
  regular: "Regular Gasoline",
  premium: "Premium Gasoline",
  diesel: "Diesel",
};

export const invoiceService = {
  async getOrCreateBusinessSettings(): Promise<CraBusinessSettings> {
    const [existing] = await db.select().from(craBusinessSettings).limit(1);
    if (existing) return existing;

    const [created] = await db
      .insert(craBusinessSettings)
      .values({
        businessName: "Prairie Mobile Fuel Services",
        businessLegalName: "Prairie Mobile Fuel Services",
        gstRegistrationNumber: "",
        businessAddress: "",
        businessCity: "",
        businessProvince: "AB",
        businessPostalCode: "",
        businessPhone: "",
        businessEmail: "",
        gstFilingFrequency: "quarterly",
        fiscalYearEnd: "12-31",
        incomeTaxRate: "0.30",
        nextInvoiceNumber: 1001,
        invoicePrefix: "PMFS",
        invoiceTerms: "Due upon delivery",
      })
      .returning();

    return created;
  },

  async getNextInvoiceNumber(): Promise<number> {
    return await db.transaction(async (tx) => {
      const [settings] = await tx
        .select({ id: craBusinessSettings.id, nextInvoiceNumber: craBusinessSettings.nextInvoiceNumber })
        .from(craBusinessSettings)
        .limit(1)
        .for("update");

      if (!settings) {
        throw new Error("CRA business settings not initialized");
      }

      const invoiceNumber = settings.nextInvoiceNumber;

      await tx
        .update(craBusinessSettings)
        .set({
          nextInvoiceNumber: invoiceNumber + 1,
          updatedAt: new Date(),
        })
        .where(eq(craBusinessSettings.id, settings.id));

      return invoiceNumber;
    });
  },

  async generateInvoiceFromOrder(orderId: string): Promise<Invoice> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error(`Order not found: ${orderId}`);

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

    const [customer] = await db.select().from(users).where(eq(users.id, order.userId)).limit(1);
    if (!customer) throw new Error(`Customer not found: ${order.userId}`);

    const settings = await this.getOrCreateBusinessSettings();

    const lineItems: InvoiceLineItem[] = [];

    for (const item of items) {
      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, item.vehicleId))
        .limit(1);

      const fuelLabel = FUEL_TYPE_LABELS[item.fuelType] || item.fuelType;
      const vehicleLabel = vehicle
        ? `${vehicle.year || ""} ${vehicle.make} ${vehicle.model}`.trim()
        : "Vehicle";

      const litres = parseFloat(
        item.actualLitresDelivered?.toString() || item.fuelAmount?.toString() || "0"
      );
      const pricePerLitre = parseFloat(item.pricePerLitre?.toString() || "0");
      const amount = parseFloat(item.subtotal?.toString() || "0");

      lineItems.push({
        description: `${fuelLabel} - ${vehicleLabel}`,
        quantity: litres,
        unitPrice: pricePerLitre,
        amount,
        fuelType: item.fuelType as "regular" | "premium" | "diesel",
        litres,
      });
    }

    const deliveryFee = parseFloat(order.deliveryFee?.toString() || "0");
    if (deliveryFee > 0) {
      lineItems.push({
        description: "Delivery Fee",
        quantity: 1,
        unitPrice: deliveryFee,
        amount: deliveryFee,
      });
    }

    const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
    const gstAmount = parseFloat(
      order.finalGstAmount?.toString() || order.gstAmount?.toString() || "0"
    );
    const total = parseFloat(
      order.finalAmount?.toString() || order.total?.toString() || "0"
    );

    const invoiceNumber = await this.getNextInvoiceNumber();

    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        businessName: settings.businessName,
        businessAddress: settings.businessAddress || "",
        businessCity: settings.businessCity || "",
        businessPhone: settings.businessPhone,
        gstRegistrationNumber: settings.gstRegistrationNumber || "",
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        customerAddress: customer.defaultAddress || order.address,
        customerCity: customer.defaultCity || order.city,
        orderId: order.id,
        subtotal: subtotal.toFixed(2),
        gstAmount: gstAmount.toFixed(2),
        total: total.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        lineItemsJson: JSON.stringify(lineItems),
        status: "issued",
        invoiceDate: new Date(),
        dueDate: new Date(),
        paidDate: new Date(),
        stripePaymentIntentId: order.stripePaymentIntentId,
        notes: settings.invoiceNotes,
      })
      .returning();

    return invoice;
  },

  async getInvoice(id: string): Promise<Invoice | null> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return invoice || null;
  },

  async getInvoices(filters: {
    customerId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ invoices: Invoice[]; total: number }> {
    const conditions = [];

    if (filters.customerId) {
      conditions.push(eq(invoices.customerId, filters.customerId));
    }
    if (filters.status) {
      conditions.push(eq(invoices.status, filters.status as any));
    }
    if (filters.startDate) {
      conditions.push(gte(invoices.invoiceDate, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(invoices.invoiceDate, filters.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
      .select({ count: count() })
      .from(invoices)
      .where(whereClause);

    const rows = await db
      .select()
      .from(invoices)
      .where(whereClause)
      .orderBy(desc(invoices.invoiceDate))
      .limit(filters.limit || 50)
      .offset(filters.offset || 0);

    return {
      invoices: rows,
      total: totalResult?.count || 0,
    };
  },

  async voidInvoice(id: string, reason: string): Promise<Invoice | null> {
    const existing = await this.getInvoice(id);
    if (!existing) return null;

    const updatedNotes = existing.notes
      ? `${existing.notes}\n\nVOIDED: ${reason}`
      : `VOIDED: ${reason}`;

    const [updated] = await db
      .update(invoices)
      .set({
        status: "void",
        notes: updatedNotes,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();

    return updated || null;
  },

  async getInvoiceSummary(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalInvoices: number;
    totalRevenue: number;
    totalGstCollected: number;
    byMonth: Array<{
      month: string;
      invoiceCount: number;
      revenue: number;
      gstCollected: number;
    }>;
  }> {
    const rows = await db
      .select()
      .from(invoices)
      .where(
        and(
          gte(invoices.invoiceDate, startDate),
          lte(invoices.invoiceDate, endDate),
          sql`${invoices.status} != 'void'`
        )
      )
      .orderBy(invoices.invoiceDate);

    let totalRevenue = 0;
    let totalGstCollected = 0;
    const monthMap = new Map<
      string,
      { invoiceCount: number; revenue: number; gstCollected: number }
    >();

    for (const inv of rows) {
      const revenue = parseFloat(inv.total?.toString() || "0");
      const gst = parseFloat(inv.gstAmount?.toString() || "0");

      totalRevenue += revenue;
      totalGstCollected += gst;

      const d = new Date(inv.invoiceDate);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      const entry = monthMap.get(monthKey) || { invoiceCount: 0, revenue: 0, gstCollected: 0 };
      entry.invoiceCount++;
      entry.revenue += revenue;
      entry.gstCollected += gst;
      monthMap.set(monthKey, entry);
    }

    const byMonth = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    return {
      totalInvoices: rows.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalGstCollected: Math.round(totalGstCollected * 100) / 100,
      byMonth,
    };
  },
};
