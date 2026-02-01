import { db } from "./db";
import { eq, and, gte, lte, desc, sql, ne } from "drizzle-orm";
import {
  orders,
  bookingDayConfig,
  bookingSlots,
  bookingEvents,
  users,
  STANDARD_WINDOW_STARTS,
  STANDARD_WINDOW_DURATION_MINUTES,
  VIP_HOUR_STARTS,
  VIP_BOOKING_DURATION_MINUTES,
  VIP_BUFFER_MINUTES,
  TIER_OVERFLOW_ORDER,
  DEFAULT_LAUNCH_CONFIG,
  DEFAULT_FULLTIME_CONFIG,
  BLOCKS_CONSUMED,
  type StandardReservations,
  type BookingDayConfig,
} from "@shared/schema";

export { STANDARD_WINDOW_DURATION_MINUTES };

export type SubscriptionTier = "payg" | "access" | "household" | "rural" | "vip";
export type OperatingMode = "soft_launch" | "full_time";

export interface SlotInfo {
  id: string;
  startTime: Date;
  endTime: Date;
  label: string;
  slotType: "standard" | "vip";
  capacity: number;
  reservedCount: number;
  available: boolean;
  spotsLeft: number;
  isFull: boolean;
  isPast: boolean;
  hasVipConflict?: boolean;
}

export interface DateAvailability {
  date: Date;
  isAvailable: boolean;
  reason?: string;
  isClosed: boolean;
  maxBlocks: number;
  blocksUsed: number;
  blocksRemaining: number;
  vipMaxCount: number;
  vipUsed: number;
  standardSlots: SlotInfo[];
  vipSlots: SlotInfo[];
  tierInventory: {
    tier: string;
    reserved: number;
    booked: number;
    remaining: number;
  }[];
  eligibleInventory: number;
  overflowUsed: number;
}

export interface BookingPayload {
  userId: string;
  vehicleId: string;
  scheduledDate: Date;
  slotType: "standard" | "vip";
  windowStart: Date;
  windowEnd: Date;
  vipStartTime?: Date;
  vipEndTime?: Date;
  address: string;
  city: string;
  fuelType: string;
  fuelAmount: number;
  fillToFull: boolean;
  pricePerLitre: number;
  deliveryFee: number;
  subtotal: number;
  gstAmount: number;
  total: number;
  promoCodeId?: string;
}

const TIER_PRIORITY: Record<SubscriptionTier, number> = {
  vip: 0,
  rural: 1,
  household: 2,
  access: 3,
  payg: 4,
};

const INVENTORY_TIERS = ["rural", "household", "access", "payg"] as const;
type InventoryTier = typeof INVENTORY_TIERS[number];

function getTierPriority(tier: SubscriptionTier): number {
  return TIER_PRIORITY[tier] ?? 99;
}

function getLowerTiers(tier: SubscriptionTier): InventoryTier[] {
  const priority = getTierPriority(tier);
  return INVENTORY_TIERS.filter(t => getTierPriority(t as SubscriptionTier) > priority);
}

function getLowestFirstOverflowOrder(tier: SubscriptionTier): InventoryTier[] {
  const lowerTiers = getLowerTiers(tier);
  return lowerTiers.sort((a, b) => getTierPriority(b as SubscriptionTier) - getTierPriority(a as SubscriptionTier));
}

export async function getGlobalOperatingMode(): Promise<OperatingMode> {
  const { financeSettings } = await import("@shared/schema");
  const settings = await db.select().from(financeSettings);
  const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
  return (settingsMap.operating_mode as OperatingMode) || "soft_launch";
}

export async function getDayConfig(date: Date): Promise<{
  config: BookingDayConfig | null;
  effectiveMode: OperatingMode;
  maxBlocks: number;
  vipMaxCount: number;
  standardReservations: StandardReservations;
  isClosed: boolean;
}> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const [dayConfig] = await db
    .select()
    .from(bookingDayConfig)
    .where(and(gte(bookingDayConfig.date, startOfDay), lte(bookingDayConfig.date, endOfDay)));

  const globalMode = await getGlobalOperatingMode();
  const effectiveMode = dayConfig?.modeOverride || globalMode;
  const defaults = effectiveMode === "full_time" ? DEFAULT_FULLTIME_CONFIG : DEFAULT_LAUNCH_CONFIG;

  let standardReservations: StandardReservations;
  try {
    standardReservations = dayConfig?.standardReservations 
      ? JSON.parse(dayConfig.standardReservations)
      : defaults.standardReservations;
  } catch {
    standardReservations = defaults.standardReservations;
  }

  return {
    config: dayConfig || null,
    effectiveMode,
    maxBlocks: dayConfig?.maxBlocks ?? defaults.maxBlocks,
    vipMaxCount: dayConfig?.vipMaxCount ?? defaults.vipMaxCount,
    standardReservations,
    isClosed: dayConfig?.isClosed ?? false,
  };
}

export async function getBlocksUsed(date: Date): Promise<{ total: number; standard: number; vip: number }> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const dayOrders = await db
    .select({
      blocksConsumed: orders.blocksConsumed,
      bookingType: orders.bookingType,
    })
    .from(orders)
    .where(
      and(
        gte(orders.scheduledDate, startOfDay),
        lte(orders.scheduledDate, endOfDay),
        ne(orders.status, "cancelled")
      )
    );

  let standard = 0;
  let vip = 0;
  for (const order of dayOrders) {
    const blocks = order.blocksConsumed || (order.bookingType === "vip_exclusive" ? 2 : 1);
    if (order.bookingType === "vip_exclusive") {
      vip += blocks;
    } else {
      standard += blocks;
    }
  }

  return { total: standard + vip, standard, vip };
}

export async function getTierBookedCounts(date: Date): Promise<Record<InventoryTier, number>> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const dayOrders = await db
    .select({
      tierAtBooking: orders.tierAtBooking,
      inventoryConsumedFromTier: orders.inventoryConsumedFromTier,
      bookingType: orders.bookingType,
    })
    .from(orders)
    .where(
      and(
        gte(orders.scheduledDate, startOfDay),
        lte(orders.scheduledDate, endOfDay),
        ne(orders.status, "cancelled"),
        eq(orders.bookingType, "standard_window")
      )
    );

  const counts: Record<InventoryTier, number> = { rural: 0, household: 0, access: 0, payg: 0 };
  
  for (const order of dayOrders) {
    const consumedFrom = (order.inventoryConsumedFromTier as InventoryTier) || 
                         (order.tierAtBooking as InventoryTier);
    if (consumedFrom && INVENTORY_TIERS.includes(consumedFrom as any)) {
      counts[consumedFrom as InventoryTier]++;
    }
  }

  return counts;
}

export async function getVipBookedCount(date: Date): Promise<number> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(
      and(
        gte(orders.scheduledDate, startOfDay),
        lte(orders.scheduledDate, endOfDay),
        ne(orders.status, "cancelled"),
        eq(orders.bookingType, "vip_exclusive")
      )
    );

  return Number(result?.count ?? 0);
}

export async function getVipProtectedSpans(date: Date): Promise<Array<{ start: Date; end: Date; orderId: string }>> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const vipOrders = await db
    .select({
      id: orders.id,
      vipStartTime: orders.vipStartTime,
      vipEndTime: orders.vipEndTime,
    })
    .from(orders)
    .where(
      and(
        gte(orders.scheduledDate, startOfDay),
        lte(orders.scheduledDate, endOfDay),
        ne(orders.status, "cancelled"),
        eq(orders.bookingType, "vip_exclusive")
      )
    );

  return vipOrders
    .filter(o => o.vipStartTime && o.vipEndTime)
    .map(o => ({
      start: new Date(new Date(o.vipStartTime!).getTime() - VIP_BUFFER_MINUTES * 60 * 1000),
      end: new Date(new Date(o.vipEndTime!).getTime() + VIP_BUFFER_MINUTES * 60 * 1000),
      orderId: o.id,
    }));
}

export async function getSlotReservedCount(date: Date, startTime: Date): Promise<number> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const windowStartStr = startTime.toISOString();
  
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(
      and(
        gte(orders.scheduledDate, startOfDay),
        lte(orders.scheduledDate, endOfDay),
        ne(orders.status, "cancelled"),
        eq(orders.bookingType, "standard_window"),
        eq(orders.windowStart, startTime)
      )
    );

  return Number(result?.count ?? 0);
}

function isDateAllowedByMode(date: Date, mode: OperatingMode): { allowed: boolean; reason?: string } {
  const dayOfWeek = date.getDay();
  
  if (mode === "soft_launch") {
    if (!(DEFAULT_LAUNCH_CONFIG.allowedDays as readonly number[]).includes(dayOfWeek)) {
      return { allowed: false, reason: "Date not available in launch mode (only Sun-Tue)" };
    }
  } else {
    if (dayOfWeek === 0) {
      return { allowed: false, reason: "Sundays are VIP-only" };
    }
    if (!(DEFAULT_FULLTIME_CONFIG.allowedDays as readonly number[]).includes(dayOfWeek)) {
      return { allowed: false, reason: "Date not available" };
    }
  }
  
  return { allowed: true };
}

export function calculateEligibleInventory(
  userTier: SubscriptionTier,
  remaining: Record<InventoryTier, number>
): number {
  if (userTier === "vip") {
    return 0;
  }
  
  const userInventoryTier = userTier as InventoryTier;
  if (!INVENTORY_TIERS.includes(userInventoryTier as any)) {
    return 0;
  }
  
  let eligible = remaining[userInventoryTier] || 0;
  
  const lowerTiers = getLowerTiers(userTier);
  for (const lowerTier of lowerTiers) {
    eligible += remaining[lowerTier] || 0;
  }
  
  return eligible;
}

export function determineInventoryBucketToConsume(
  userTier: SubscriptionTier,
  remaining: Record<InventoryTier, number>
): InventoryTier | null {
  if (userTier === "vip") {
    return null;
  }
  
  const userInventoryTier = userTier as InventoryTier;
  
  if (remaining[userInventoryTier] > 0) {
    return userInventoryTier;
  }
  
  const overflowOrder = getLowestFirstOverflowOrder(userTier);
  for (const tier of overflowOrder) {
    if (remaining[tier] > 0) {
      return tier;
    }
  }
  
  return null;
}

export async function getDateAvailability(
  date: Date,
  userTier: SubscriptionTier
): Promise<DateAvailability> {
  const dayConfig = await getDayConfig(date);
  const { effectiveMode, maxBlocks, vipMaxCount, standardReservations, isClosed } = dayConfig;
  
  if (isClosed) {
    return {
      date,
      isAvailable: false,
      reason: "Day is closed",
      isClosed: true,
      maxBlocks,
      blocksUsed: 0,
      blocksRemaining: maxBlocks,
      vipMaxCount,
      vipUsed: 0,
      standardSlots: [],
      vipSlots: [],
      tierInventory: INVENTORY_TIERS.map(t => ({ tier: t, reserved: 0, booked: 0, remaining: 0 })),
      eligibleInventory: 0,
      overflowUsed: 0,
    };
  }
  
  const modeCheck = isDateAllowedByMode(date, effectiveMode);
  const isVip = userTier === "vip";
  
  if (!isVip && !modeCheck.allowed && date.getDay() !== 0) {
    return {
      date,
      isAvailable: false,
      reason: modeCheck.reason,
      isClosed: false,
      maxBlocks,
      blocksUsed: 0,
      blocksRemaining: maxBlocks,
      vipMaxCount,
      vipUsed: 0,
      standardSlots: [],
      vipSlots: [],
      tierInventory: INVENTORY_TIERS.map(t => ({ tier: t, reserved: standardReservations[t] || 0, booked: 0, remaining: standardReservations[t] || 0 })),
      eligibleInventory: 0,
      overflowUsed: 0,
    };
  }
  
  const blocksUsedData = await getBlocksUsed(date);
  const blocksRemaining = maxBlocks - blocksUsedData.total;
  const vipUsed = await getVipBookedCount(date);
  const tierBooked = await getTierBookedCounts(date);
  const vipSpans = await getVipProtectedSpans(date);
  
  const tierInventory = INVENTORY_TIERS.map(tier => ({
    tier,
    reserved: standardReservations[tier] || 0,
    booked: tierBooked[tier] || 0,
    remaining: Math.max(0, (standardReservations[tier] || 0) - (tierBooked[tier] || 0)),
  }));
  
  const remaining: Record<InventoryTier, number> = {} as any;
  for (const ti of tierInventory) {
    remaining[ti.tier as InventoryTier] = ti.remaining;
  }
  
  const eligibleInventory = isVip ? 0 : calculateEligibleInventory(userTier, remaining);
  
  const overflowUsedOrders = await db
    .select({ inventoryConsumedFromTier: orders.inventoryConsumedFromTier, tierAtBooking: orders.tierAtBooking })
    .from(orders)
    .where(
      and(
        gte(orders.scheduledDate, new Date(date.setHours(0, 0, 0, 0))),
        lte(orders.scheduledDate, new Date(date.setHours(23, 59, 59, 999))),
        ne(orders.status, "cancelled")
      )
    );
  
  let overflowUsed = 0;
  for (const o of overflowUsedOrders) {
    if (o.inventoryConsumedFromTier && o.tierAtBooking && o.inventoryConsumedFromTier !== o.tierAtBooking) {
      overflowUsed++;
    }
  }
  
  const now = new Date();
  const standardSlots: SlotInfo[] = [];
  const vipSlots: SlotInfo[] = [];
  
  if (!isVip || date.getDay() !== 0) {
    for (const startTimeStr of STANDARD_WINDOW_STARTS) {
      const [hours, minutes] = startTimeStr.split(":").map(Number);
      const startTime = new Date(date);
      startTime.setHours(hours, minutes, 0, 0);
      const endTime = new Date(startTime.getTime() + STANDARD_WINDOW_DURATION_MINUTES * 60 * 1000);
      
      const isPast = startTime <= now;
      const reservedCount = await getSlotReservedCount(date, startTime);
      const capacity = 2;
      const spotsLeft = Math.max(0, capacity - reservedCount);
      
      let hasVipConflict = false;
      for (const span of vipSpans) {
        if (startTime < span.end && endTime > span.start) {
          hasVipConflict = true;
          break;
        }
      }
      
      const canBook = !isPast && spotsLeft > 0 && blocksRemaining >= BLOCKS_CONSUMED.standard && eligibleInventory > 0 && !hasVipConflict;
      
      standardSlots.push({
        id: `standard-${startTimeStr}`,
        startTime,
        endTime,
        label: `${startTimeStr} - ${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}`,
        slotType: "standard",
        capacity,
        reservedCount,
        available: canBook,
        spotsLeft,
        isFull: spotsLeft === 0,
        isPast,
        hasVipConflict,
      });
    }
  }
  
  if (isVip && blocksRemaining >= BLOCKS_CONSUMED.vip && vipUsed < vipMaxCount) {
    for (const startTimeStr of VIP_HOUR_STARTS) {
      const [hours, minutes] = startTimeStr.split(":").map(Number);
      const startTime = new Date(date);
      startTime.setHours(hours, minutes, 0, 0);
      const endTime = new Date(startTime.getTime() + VIP_BOOKING_DURATION_MINUTES * 60 * 1000);
      
      const protectedStart = new Date(startTime.getTime() - VIP_BUFFER_MINUTES * 60 * 1000);
      const protectedEnd = new Date(endTime.getTime() + VIP_BUFFER_MINUTES * 60 * 1000);
      
      const isPast = startTime <= now;
      
      let hasConflict = false;
      for (const span of vipSpans) {
        if (protectedStart < span.end && protectedEnd > span.start) {
          hasConflict = true;
          break;
        }
      }
      
      const canBook = !isPast && !hasConflict;
      
      vipSlots.push({
        id: `vip-${startTimeStr}`,
        startTime,
        endTime,
        label: `${startTimeStr} - ${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")} (VIP Exclusive)`,
        slotType: "vip",
        capacity: 1,
        reservedCount: hasConflict ? 1 : 0,
        available: canBook,
        spotsLeft: canBook ? 1 : 0,
        isFull: hasConflict,
        isPast,
        hasVipConflict: hasConflict,
      });
    }
  }
  
  const hasAvailableSlots = isVip 
    ? vipSlots.some(s => s.available)
    : standardSlots.some(s => s.available);
  
  return {
    date,
    isAvailable: !isClosed && hasAvailableSlots,
    isClosed,
    maxBlocks,
    blocksUsed: blocksUsedData.total,
    blocksRemaining,
    vipMaxCount,
    vipUsed,
    standardSlots: !isVip ? standardSlots : [],
    vipSlots: isVip ? vipSlots : [],
    tierInventory,
    eligibleInventory,
    overflowUsed,
  };
}

export async function validateBookingCapacity(
  userId: string,
  scheduledDate: Date,
  slotType: "standard" | "vip",
  windowStart: Date
): Promise<{ valid: boolean; error?: string; inventoryBucket?: InventoryTier }> {
  const user = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
  if (!user) {
    return { valid: false, error: "User not found" };
  }
  
  const userTier = user.subscriptionTier as SubscriptionTier;
  const dayConfig = await getDayConfig(scheduledDate);
  const { effectiveMode, maxBlocks, vipMaxCount, standardReservations, isClosed } = dayConfig;
  
  if (isClosed) {
    return { valid: false, error: "This day is closed for bookings" };
  }
  
  const blocksUsedData = await getBlocksUsed(scheduledDate);
  const blocksRemaining = maxBlocks - blocksUsedData.total;
  const blocksNeeded = slotType === "vip" ? BLOCKS_CONSUMED.vip : BLOCKS_CONSUMED.standard;
  
  if (blocksRemaining < blocksNeeded) {
    return { valid: false, error: "Daily capacity is full" };
  }
  
  if (slotType === "vip") {
    if (userTier !== "vip") {
      return { valid: false, error: "VIP bookings require VIP tier" };
    }
    
    const vipUsed = await getVipBookedCount(scheduledDate);
    if (vipUsed >= vipMaxCount) {
      return { valid: false, error: "VIP capacity is full for this day" };
    }
    
    const vipSpans = await getVipProtectedSpans(scheduledDate);
    const protectedStart = new Date(windowStart.getTime() - VIP_BUFFER_MINUTES * 60 * 1000);
    const windowEnd = new Date(windowStart.getTime() + VIP_BOOKING_DURATION_MINUTES * 60 * 1000);
    const protectedEnd = new Date(windowEnd.getTime() + VIP_BUFFER_MINUTES * 60 * 1000);
    
    for (const span of vipSpans) {
      if (protectedStart < span.end && protectedEnd > span.start) {
        return { valid: false, error: "This VIP time conflicts with another booking" };
      }
    }
    
    return { valid: true };
  }
  
  if (userTier === "vip") {
    return { valid: false, error: "VIP users should use VIP booking slots" };
  }
  
  const modeCheck = isDateAllowedByMode(scheduledDate, effectiveMode);
  if (!modeCheck.allowed) {
    return { valid: false, error: modeCheck.reason };
  }
  
  const slotReserved = await getSlotReservedCount(scheduledDate, windowStart);
  if (slotReserved >= 2) {
    return { valid: false, error: "This time slot is full" };
  }
  
  const vipSpans = await getVipProtectedSpans(scheduledDate);
  const windowEnd = new Date(windowStart.getTime() + STANDARD_WINDOW_DURATION_MINUTES * 60 * 1000);
  for (const span of vipSpans) {
    if (windowStart < span.end && windowEnd > span.start) {
      return { valid: false, error: "This slot conflicts with a VIP booking" };
    }
  }
  
  const tierBooked = await getTierBookedCounts(scheduledDate);
  const remaining: Record<InventoryTier, number> = {} as any;
  for (const tier of INVENTORY_TIERS) {
    remaining[tier] = Math.max(0, (standardReservations[tier] || 0) - (tierBooked[tier] || 0));
  }
  
  const eligibleInventory = calculateEligibleInventory(userTier, remaining);
  if (eligibleInventory <= 0) {
    return { valid: false, error: "No inventory available for your subscription tier" };
  }
  
  const inventoryBucket = determineInventoryBucketToConsume(userTier, remaining);
  if (!inventoryBucket) {
    return { valid: false, error: "Unable to allocate inventory" };
  }
  
  return { valid: true, inventoryBucket };
}

export async function createBookingEvent(
  orderId: string,
  eventType: "created" | "confirmed" | "rescheduled" | "cancelled" | "completed",
  details?: Record<string, any>,
  createdBy?: string
): Promise<void> {
  await db.insert(bookingEvents).values({
    orderId,
    eventType,
    details: details ? JSON.stringify(details) : null,
    createdBy,
  });
}
