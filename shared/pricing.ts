/**
 * PMFS Pricing Configuration - Single Source of Truth
 * Version: pmfs_option4_v1
 * 
 * This model uses:
 * - LAYER 1: Premium, daily-updated fuel pricing (NEVER discounted by tier)
 * - LAYER 2: Delivery fee varies by tier
 * - LAYER 3: Subscriptions sell access/reliability/scheduling (NOT cheaper fuel)
 * 
 * Per-litre tier discounts are REMOVED from this model.
 */

export const PRICING_MODEL_VERSION = "pmfs_option4_v1";

export const GST_RATE = 0.05;

export const STRIPE_FEE_RATE = 0.029;
export const STRIPE_FEE_FLAT_CENTS = 30;

export type SubscriptionTierId = "payg" | "access" | "household" | "rural" | "vip";

export const DELIVERY_FEES_BY_TIER: Record<SubscriptionTierId, number> = {
  payg: 24.99,
  access: 14.99,
  household: 0.00,
  rural: 0.00,
  vip: 0.00,
};

export const SUBSCRIPTION_MONTHLY_FEES: Record<SubscriptionTierId, number> = {
  payg: 0.00,
  access: 24.99,
  household: 49.99,
  rural: 99.99,
  vip: 249.99,
};

export const SUBSCRIPTION_MAX_VEHICLES: Record<SubscriptionTierId, number> = {
  payg: 1,
  access: 1,
  household: 4,
  rural: 20,
  vip: 99, // Unlimited personal vehicles
};

export const TIER_PRIORITY: Record<SubscriptionTierId, number> = {
  vip: 0, // Highest priority
  rural: 1,
  household: 2,
  access: 3,
  payg: 4,
};

export const SUBSCRIPTION_BENEFITS: Record<SubscriptionTierId, string[]> = {
  payg: [
    "Standard delivery fee",
    "Standard scheduling",
    "Email support",
  ],
  access: [
    "Reduced delivery fee",
    "Priority scheduling",
    "SMS notifications",
    "Faster reschedule support",
  ],
  household: [
    "Delivery included",
    "Priority support",
    "Recurring schedules",
    "Up to 4 vehicles",
    "Generous household usage",
  ],
  rural: [
    "Delivery included",
    "Farm & fleet ready",
    "Bulk ordering support",
    "Up to 20 vehicles",
    "Priority scheduling + support",
  ],
  vip: [
    "Guaranteed 1-hour private booking",
    "Exact start time (not a window)",
    "No stacked deliveries during your hour",
    "Sunday delivery access (VIP-only)",
    "Priority scheduling above all tiers",
    "Unlimited personal vehicles",
    "Delivery included",
  ],
};

export const SUBSCRIPTION_DISPLAY_NAMES: Record<SubscriptionTierId, string> = {
  payg: "Pay As You Go",
  access: "Access",
  household: "Household",
  rural: "Rural / Power User",
  vip: "VIP",
};

// VIP Configuration
export const VIP_CONFIG = {
  maxSubscribers: 10,
  bookingDurationMinutes: 60,
  timeSlotIntervalMinutes: 30,
};

export const EMERGENCY_FEES = {
  monthlyAddOnFee: 14.99,
  monthlyAddOnWithGst: 15.74,
  serviceFee: 29.99,
  serviceFeeWithGst: 31.49,
  annualCredits: 1,
};

export interface OrderPricingInput {
  litres: number;
  pricePerLitre: number;
  deliveryFee: number;
  promoDiscount?: number;
}

export interface OrderPricingResult {
  fuelSubtotal: number;
  deliveryFee: number;
  promoDiscount: number;
  subtotalBeforeGst: number;
  gstAmount: number;
  total: number;
}

/**
 * Calculate order pricing using the Option 4 model.
 * NO per-litre tier discounts - fuel price is invariant by tier.
 */
export function calculateOrderPricingV2(input: OrderPricingInput): OrderPricingResult {
  const { litres, pricePerLitre, deliveryFee, promoDiscount = 0 } = input;
  
  const fuelSubtotal = Math.round(litres * pricePerLitre * 100) / 100;
  const subtotalBeforeGst = Math.round((fuelSubtotal + deliveryFee - promoDiscount) * 100) / 100;
  const gstAmount = Math.round(subtotalBeforeGst * GST_RATE * 100) / 100;
  const total = Math.round((subtotalBeforeGst + gstAmount) * 100) / 100;
  
  return {
    fuelSubtotal,
    deliveryFee,
    promoDiscount,
    subtotalBeforeGst,
    gstAmount,
    total,
  };
}

/**
 * Estimate Stripe fee for a given charge amount in dollars.
 */
export function estimateStripeFee(totalDollars: number): number {
  const feeCents = Math.round(totalDollars * 100 * STRIPE_FEE_RATE) + STRIPE_FEE_FLAT_CENTS;
  return Math.round(feeCents) / 100;
}

/**
 * Get delivery fee for a subscription tier.
 */
export function getDeliveryFeeForTier(tier: SubscriptionTierId): number {
  return DELIVERY_FEES_BY_TIER[tier] ?? DELIVERY_FEES_BY_TIER.payg;
}
