import { storage } from './storage';
import { db } from './db';
import { orders, orderItems, recurringSchedules } from '@shared/schema';
import { PaymentService, calculateOrderPricing } from './paymentService';
import { sendOrderConfirmationEmail, sendPaymentFailureEmail } from './emailService';
import { RecurringSchedule, GST_RATE } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';

const paymentService = new PaymentService();
const CALGARY_TIMEZONE = 'America/Edmonton';

function getCalgaryDateParts(): { year: number; month: number; day: number; hour: number; minute: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALGARY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  return {
    year: parseInt(parts.find(p => p.type === 'year')?.value || '2025'),
    month: parseInt(parts.find(p => p.type === 'month')?.value || '1'),
    day: parseInt(parts.find(p => p.type === 'day')?.value || '1'),
    hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
    minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
  };
}

function getCalgaryDateString(): string {
  const parts = getCalgaryDateParts();
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getCalgaryHour(): number {
  return getCalgaryDateParts().hour;
}

function getCalgaryMinutes(): number {
  return getCalgaryDateParts().minute;
}

function getTomorrowCalgaryParts(): { year: number; month: number; day: number; dayOfWeek: number } {
  const today = getCalgaryDateParts();
  const tempDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
  tempDate.setUTCDate(tempDate.getUTCDate() + 1);
  return {
    year: tempDate.getUTCFullYear(),
    month: tempDate.getUTCMonth() + 1,
    day: tempDate.getUTCDate(),
    dayOfWeek: tempDate.getUTCDay(),
  };
}

function createCalgaryNoonUtc(year: number, month: number, day: number): Date {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00`;
  return fromZonedTime(dateStr, CALGARY_TIMEZONE);
}

function addDaysToCalgaryParts(parts: { year: number; month: number; day: number }, days: number): { year: number; month: number; day: number; dayOfWeek: number } {
  const tempDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  tempDate.setUTCDate(tempDate.getUTCDate() + days);
  return {
    year: tempDate.getUTCFullYear(),
    month: tempDate.getUTCMonth() + 1,
    day: tempDate.getUTCDate(),
    dayOfWeek: tempDate.getUTCDay(),
  };
}

function calculateNextDeliveryFromDate(schedule: RecurringSchedule, fromDate: Date): Date | null {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALGARY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(fromDate);
  const fromParts = {
    year: parseInt(parts.find(p => p.type === 'year')?.value || '2025'),
    month: parseInt(parts.find(p => p.type === 'month')?.value || '1'),
    day: parseInt(parts.find(p => p.type === 'day')?.value || '1'),
    dayOfWeek: 0,
  };
  const tempDate = new Date(Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day));
  fromParts.dayOfWeek = tempDate.getUTCDay();
  
  if (schedule.frequency === 'weekly') {
    const next = addDaysToCalgaryParts(fromParts, 7);
    return createCalgaryNoonUtc(next.year, next.month, next.day);
  }
  
  if (schedule.frequency === 'bi-weekly') {
    const next = addDaysToCalgaryParts(fromParts, 14);
    return createCalgaryNoonUtc(next.year, next.month, next.day);
  }
  
  if (schedule.frequency === 'monthly') {
    const targetDayOfMonth = schedule.dayOfMonth ?? 1;
    let nextMonth = fromParts.month + 1;
    let nextYear = fromParts.year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    const lastDayOfNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    const actualDay = Math.min(targetDayOfMonth, lastDayOfNextMonth);
    return createCalgaryNoonUtc(nextYear, nextMonth, actualDay);
  }
  
  return null;
}

function calculateNextDeliveryAfterTomorrow(schedule: RecurringSchedule): Date | null {
  const tomorrow = getTomorrowCalgaryParts();
  const tomorrowDate = createCalgaryNoonUtc(tomorrow.year, tomorrow.month, tomorrow.day);
  return calculateNextDeliveryFromDate(schedule, tomorrowDate);
}

function getCalendarDaysBetween(earlierUtc: Date, laterParts: { year: number; month: number; day: number }): number {
  const laterJulian = Math.floor(Date.UTC(laterParts.year, laterParts.month - 1, laterParts.day) / (1000 * 60 * 60 * 24));
  
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALGARY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(earlierUtc);
  const earlierYear = parseInt(parts.find(p => p.type === 'year')?.value || '2025');
  const earlierMonth = parseInt(parts.find(p => p.type === 'month')?.value || '1');
  const earlierDay = parseInt(parts.find(p => p.type === 'day')?.value || '1');
  const earlierJulian = Math.floor(Date.UTC(earlierYear, earlierMonth - 1, earlierDay) / (1000 * 60 * 60 * 24));
  
  return laterJulian - earlierJulian;
}

function isLastOrderDateTomorrow(schedule: RecurringSchedule): boolean {
  if (!schedule.lastOrderDate) return false;
  const tomorrow = getTomorrowCalgaryParts();
  const lastOrderUtc = new Date(schedule.lastOrderDate);
  const daysDiff = getCalendarDaysBetween(lastOrderUtc, tomorrow);
  return daysDiff === 0;
}

function shouldCreateOrderTomorrow(schedule: RecurringSchedule): boolean {
  const tomorrow = getTomorrowCalgaryParts();
  
  if (isLastOrderDateTomorrow(schedule)) {
    return false;
  }
  
  if (schedule.frequency === 'weekly' || schedule.frequency === 'bi-weekly') {
    const targetDay = schedule.dayOfWeek ?? 1;
    if (tomorrow.dayOfWeek !== targetDay) {
      return false;
    }
    if (schedule.frequency === 'bi-weekly' && schedule.lastOrderDate) {
      const lastOrderUtc = new Date(schedule.lastOrderDate);
      const daysSinceLastOrder = getCalendarDaysBetween(lastOrderUtc, tomorrow);
      return daysSinceLastOrder >= 14;
    }
    return true;
  }
  
  if (schedule.frequency === 'monthly') {
    const targetDayOfMonth = schedule.dayOfMonth ?? 1;
    return tomorrow.day === targetDayOfMonth;
  }
  
  return false;
}

async function createOrderFromSchedule(schedule: RecurringSchedule): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const user = await storage.getUser(schedule.userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  const vehicle = await storage.getVehicle(schedule.vehicleId);
  if (!vehicle) {
    return { success: false, error: 'Vehicle not found' };
  }
  
  const tier = await storage.getSubscriptionTier(user.subscriptionTier);
  if (!tier) {
    return { success: false, error: 'Subscription tier not found' };
  }
  
  const pricing = await storage.getFuelPricing(schedule.fuelType);
  if (!pricing) {
    return { success: false, error: 'Fuel pricing not found' };
  }
  
  if (user.paymentBlocked) {
    return { success: false, error: 'Customer payment is blocked' };
  }
  
  if (!user.stripeCustomerId) {
    return { success: false, error: 'Customer has no payment method on file' };
  }
  
  const tomorrow = getTomorrowCalgaryParts();
  const scheduledDate = createCalgaryNoonUtc(tomorrow.year, tomorrow.month, tomorrow.day);
  
  const litres = parseFloat(schedule.fuelAmount.toString());
  const pricePerLitre = parseFloat(pricing.customerPrice.toString());
  const tierDiscount = parseFloat(tier.perLitreDiscount.toString());
  const deliveryFee = parseFloat(tier.deliveryFee.toString());
  
  const preCalcPricing = calculateOrderPricing({
    litres: schedule.fillToFull ? 150 : litres,
    pricePerLitre,
    tierDiscount,
    deliveryFee,
  });
  
  try {
    return await db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({
        userId: user.id,
        vehicleId: schedule.vehicleId,
        status: 'scheduled',
        scheduledDate: scheduledDate,
        deliveryWindow: schedule.preferredWindow,
        fuelType: schedule.fuelType,
        fuelAmount: litres.toString(),
        fillToFull: schedule.fillToFull,
        pricePerLitre: pricePerLitre.toFixed(4),
        tierDiscount: tierDiscount.toFixed(4),
        deliveryFee: deliveryFee.toFixed(2),
        subtotal: preCalcPricing.subtotal.toFixed(2),
        gstAmount: preCalcPricing.gstAmount.toFixed(2),
        total: preCalcPricing.total.toFixed(2),
        address: user.defaultAddress || '',
        city: user.defaultCity || 'Calgary, AB',
        isRecurring: true,
        recurringScheduleId: schedule.id,
      }).returning();
      
      await tx.insert(orderItems).values({
        orderId: order.id,
        vehicleId: schedule.vehicleId,
        fuelType: schedule.fuelType,
        fuelAmount: litres.toString(),
        fillToFull: schedule.fillToFull,
        pricePerLitre: pricePerLitre.toFixed(4),
        subtotal: (litres * pricePerLitre).toFixed(2),
      });
      
      try {
        const preAuthResult = await paymentService.createPreAuthorization({
          customerId: user.stripeCustomerId!,
          orderId: order.id,
          litres,
          pricePerLitre,
          tierDiscount,
          deliveryFee,
          description: `Recurring fuel delivery - ${schedule.fuelType} for ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          fuelType: schedule.fuelType,
          fillToFull: schedule.fillToFull,
          vehicleId: schedule.vehicleId,
          subscriptionTier: user.subscriptionTier,
        });
        
        await tx.update(orders)
          .set({
            stripePaymentIntentId: preAuthResult.paymentIntentId,
            paymentStatus: 'preauthorized',
            preAuthAmount: preAuthResult.pricing.total.toFixed(2),
            status: 'confirmed',
          })
          .where(eq(orders.id, order.id));
        
        const nextDelivery = calculateNextDeliveryAfterTomorrow(schedule);
        await tx.update(recurringSchedules)
          .set({
            lastOrderDate: scheduledDate,
            nextOrderDate: nextDelivery,
          })
          .where(eq(recurringSchedules.id, schedule.id));
        
        if (user.email) {
          try {
            await sendOrderConfirmationEmail({
              id: order.id,
              userEmail: user.email,
              userName: user.name || 'Customer',
              scheduledDate: scheduledDate,
              deliveryWindow: schedule.preferredWindow,
              address: user.defaultAddress || '',
              city: user.defaultCity || 'Calgary, AB',
              fuelType: schedule.fuelType,
              fuelAmount: litres,
              fillToFull: schedule.fillToFull,
              total: preAuthResult.pricing.total.toFixed(2),
            });
          } catch (emailError) {
            console.warn(`[RecurringOrder] Email send failed for order ${order.id}, continuing:`, emailError);
          }
        }
        
        console.log(`[RecurringOrder] Created order ${order.id} for schedule ${schedule.id}`);
        return { success: true, orderId: order.id };
        
      } catch (preAuthError: any) {
        console.error(`[RecurringOrder] Pre-auth failed for schedule ${schedule.id}:`, preAuthError);
        
        await tx.update(orders)
          .set({
            status: 'cancelled',
            paymentStatus: 'failed',
          })
          .where(eq(orders.id, order.id));
        
        await tx.update(recurringSchedules)
          .set({ active: false })
          .where(eq(recurringSchedules.id, schedule.id));
        
        if (user.email) {
          try {
            await sendPaymentFailureEmail({
              id: order.id,
              userEmail: user.email,
              userName: user.name || 'Customer',
              scheduledDate: scheduledDate,
              deliveryWindow: schedule.preferredWindow,
              address: user.defaultAddress || '',
              city: user.defaultCity || 'Calgary, AB',
              total: preCalcPricing.total.toFixed(2),
            });
          } catch (emailError) {
            console.warn(`[RecurringOrder] Failure email send failed for order ${order.id}:`, emailError);
          }
        }
        
        return { success: false, error: `Pre-authorization failed: ${preAuthError.message}` };
      }
    });
    
  } catch (error: any) {
    console.error(`[RecurringOrder] Error creating order for schedule ${schedule.id}:`, error);
    return { success: false, error: error.message };
  }
}

export async function processRecurringSchedules(): Promise<{ processed: number; created: number; failed: number }> {
  const activeSchedules = await storage.getActiveRecurringSchedules();
  
  let processed = 0;
  let created = 0;
  let failed = 0;
  
  for (const schedule of activeSchedules) {
    const freshSchedule = await storage.getRecurringSchedule(schedule.id);
    if (!freshSchedule || !freshSchedule.active) {
      continue;
    }
    
    if (shouldCreateOrderTomorrow(freshSchedule)) {
      processed++;
      const result = await createOrderFromSchedule(freshSchedule);
      if (result.success) {
        created++;
      } else {
        failed++;
        console.error(`[RecurringOrder] Failed to create order for schedule ${schedule.id}: ${result.error}`);
      }
    }
  }
  
  console.log(`[RecurringOrder] Processing complete: ${processed} processed, ${created} created, ${failed} failed`);
  return { processed, created, failed };
}

function calculateFirstDeliveryDate(schedule: RecurringSchedule): Date {
  const today = getCalgaryDateParts();
  const todayParts = { year: today.year, month: today.month, day: today.day };
  
  const tempDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const todayDayOfWeek = tempDate.getUTCDay();
  
  if (schedule.frequency === 'weekly' || schedule.frequency === 'bi-weekly') {
    const targetDay = schedule.dayOfWeek ?? 1;
    let daysUntil = targetDay - todayDayOfWeek;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0) daysUntil = 7;
    const next = addDaysToCalgaryParts(todayParts, daysUntil);
    return createCalgaryNoonUtc(next.year, next.month, next.day);
  }
  
  if (schedule.frequency === 'monthly') {
    const targetDayOfMonth = schedule.dayOfMonth ?? 1;
    let targetMonth = today.month;
    let targetYear = today.year;
    
    if (today.day >= targetDayOfMonth) {
      targetMonth++;
      if (targetMonth > 12) {
        targetMonth = 1;
        targetYear++;
      }
    }
    
    const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    const actualDay = Math.min(targetDayOfMonth, lastDayOfMonth);
    return createCalgaryNoonUtc(targetYear, targetMonth, actualDay);
  }
  
  const next = addDaysToCalgaryParts(todayParts, 7);
  return createCalgaryNoonUtc(next.year, next.month, next.day);
}

export async function createFirstOrderFromSchedule(schedule: RecurringSchedule): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const user = await storage.getUser(schedule.userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  const vehicle = await storage.getVehicle(schedule.vehicleId);
  if (!vehicle) {
    return { success: false, error: 'Vehicle not found' };
  }
  
  const tier = await storage.getSubscriptionTier(user.subscriptionTier);
  if (!tier) {
    return { success: false, error: 'Subscription tier not found' };
  }
  
  const pricing = await storage.getFuelPricing(schedule.fuelType);
  if (!pricing) {
    return { success: false, error: 'Fuel pricing not found' };
  }
  
  if (user.paymentBlocked) {
    return { success: false, error: 'Customer payment is blocked' };
  }
  
  if (!user.stripeCustomerId) {
    return { success: false, error: 'Customer has no payment method on file' };
  }
  
  const scheduledDate = calculateFirstDeliveryDate(schedule);
  
  const litres = parseFloat(schedule.fuelAmount.toString());
  const pricePerLitre = parseFloat(pricing.customerPrice.toString());
  const tierDiscount = parseFloat(tier.perLitreDiscount.toString());
  const deliveryFee = parseFloat(tier.deliveryFee.toString());
  
  const preCalcPricing = calculateOrderPricing({
    litres: schedule.fillToFull ? 150 : litres,
    pricePerLitre,
    tierDiscount,
    deliveryFee,
  });
  
  try {
    return await db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({
        userId: user.id,
        vehicleId: schedule.vehicleId,
        status: 'scheduled',
        scheduledDate: scheduledDate,
        deliveryWindow: schedule.preferredWindow,
        fuelType: schedule.fuelType,
        fuelAmount: litres.toString(),
        fillToFull: schedule.fillToFull,
        pricePerLitre: pricePerLitre.toFixed(4),
        tierDiscount: tierDiscount.toFixed(4),
        deliveryFee: deliveryFee.toFixed(2),
        subtotal: preCalcPricing.subtotal.toFixed(2),
        gstAmount: preCalcPricing.gstAmount.toFixed(2),
        total: preCalcPricing.total.toFixed(2),
        address: user.defaultAddress || '',
        city: user.defaultCity || 'Calgary, AB',
        isRecurring: true,
        recurringScheduleId: schedule.id,
      }).returning();
      
      await tx.insert(orderItems).values({
        orderId: order.id,
        vehicleId: schedule.vehicleId,
        fuelType: schedule.fuelType,
        fuelAmount: litres.toString(),
        fillToFull: schedule.fillToFull,
        pricePerLitre: pricePerLitre.toFixed(4),
        subtotal: (litres * pricePerLitre).toFixed(2),
      });
      
      try {
        const preAuthResult = await paymentService.createPreAuthorization({
          customerId: user.stripeCustomerId!,
          orderId: order.id,
          litres,
          pricePerLitre,
          tierDiscount,
          deliveryFee,
          description: `Recurring fuel delivery - ${schedule.fuelType} for ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          fuelType: schedule.fuelType,
          fillToFull: schedule.fillToFull,
          vehicleId: schedule.vehicleId,
          subscriptionTier: user.subscriptionTier,
        });
        
        await tx.update(orders)
          .set({
            stripePaymentIntentId: preAuthResult.paymentIntentId,
            paymentStatus: 'preauthorized',
            preAuthAmount: preAuthResult.pricing.total.toFixed(2),
            status: 'confirmed',
          })
          .where(eq(orders.id, order.id));
        
        const nextDelivery = calculateNextDeliveryFromDate(schedule, scheduledDate);
        await tx.update(recurringSchedules)
          .set({
            lastOrderDate: scheduledDate,
            nextOrderDate: nextDelivery,
          })
          .where(eq(recurringSchedules.id, schedule.id));
        
        if (user.email) {
          try {
            await sendOrderConfirmationEmail({
              id: order.id,
              userEmail: user.email,
              userName: user.name || 'Customer',
              scheduledDate: scheduledDate,
              deliveryWindow: schedule.preferredWindow,
              address: user.defaultAddress || '',
              city: user.defaultCity || 'Calgary, AB',
              fuelType: schedule.fuelType,
              fuelAmount: litres,
              fillToFull: schedule.fillToFull,
              total: preAuthResult.pricing.total.toFixed(2),
            });
          } catch (emailError) {
            console.warn(`[RecurringOrder] Email send failed for order ${order.id}, continuing:`, emailError);
          }
        }
        
        console.log(`[RecurringOrder] Created first order ${order.id} for schedule ${schedule.id}`);
        return { success: true, orderId: order.id };
        
      } catch (preAuthError: any) {
        console.error(`[RecurringOrder] Pre-auth failed for first order of schedule ${schedule.id}:`, preAuthError);
        
        await tx.update(orders)
          .set({
            status: 'cancelled',
            paymentStatus: 'failed',
          })
          .where(eq(orders.id, order.id));
        
        await tx.update(recurringSchedules)
          .set({ active: false })
          .where(eq(recurringSchedules.id, schedule.id));
        
        return { success: false, error: `Pre-authorization failed: ${preAuthError.message}` };
      }
    });
    
  } catch (error: any) {
    console.error(`[RecurringOrder] Error creating first order for schedule ${schedule.id}:`, error);
    return { success: false, error: error.message };
  }
}

let lastProcessedDate: string | null = null;

export function scheduleRecurringOrderProcessing(): void {
  const checkAndProcess = async () => {
    const calgaryHour = getCalgaryHour();
    const calgaryMinutes = getCalgaryMinutes();
    const todayStr = getCalgaryDateString();
    
    if (calgaryHour === 5 && calgaryMinutes < 10 && lastProcessedDate !== todayStr) {
      console.log('[RecurringOrder] Running scheduled recurring order processing...');
      lastProcessedDate = todayStr;
      try {
        const result = await processRecurringSchedules();
        console.log(`[RecurringOrder] Scheduled processing complete: ${result.created} orders created`);
      } catch (error) {
        console.error('[RecurringOrder] Failed to process recurring schedules:', error);
        lastProcessedDate = null;
      }
    }
  };
  
  setInterval(checkAndProcess, 60 * 1000);
  console.log('[RecurringOrder] Scheduler initialized - will process at 5am Calgary time daily');
}
