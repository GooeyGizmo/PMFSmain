export type FuelType = 'regular' | 'premium' | 'diesel';
export type SubscriptionTier = 'payg' | 'access' | 'household' | 'rural' | 'vip' | 'PAYG' | 'ACCESS' | 'HOUSEHOLD' | 'RURAL' | 'VIP';

export const FUEL_COLORS: Record<FuelType, { bg: string; text: string; border: string; gradient: string }> = {
  regular: {
    bg: 'bg-red-500',
    text: 'text-red-600',
    border: 'border-red-500',
    gradient: 'from-red-500/10 to-red-500/5',
  },
  premium: {
    bg: 'bg-amber-500',
    text: 'text-amber-600',
    border: 'border-amber-500',
    gradient: 'from-amber-500/10 to-amber-500/5',
  },
  diesel: {
    bg: 'bg-emerald-600',
    text: 'text-emerald-600',
    border: 'border-emerald-600',
    gradient: 'from-emerald-600/10 to-emerald-600/5',
  },
};

export const TIER_COLORS: Record<string, { bg: string; text: string; border: string; gradient: string; label: string }> = {
  payg: {
    bg: 'bg-gray-500',
    text: 'text-gray-600',
    border: 'border-gray-500',
    gradient: 'from-gray-500/10 to-gray-500/5',
    label: 'PAYG',
  },
  PAYG: {
    bg: 'bg-gray-500',
    text: 'text-gray-600',
    border: 'border-gray-500',
    gradient: 'from-gray-500/10 to-gray-500/5',
    label: 'PAYG',
  },
  access: {
    bg: 'bg-cyan-600',
    text: 'text-cyan-600',
    border: 'border-cyan-600',
    gradient: 'from-cyan-600/10 to-cyan-600/5',
    label: 'ACCESS',
  },
  ACCESS: {
    bg: 'bg-cyan-600',
    text: 'text-cyan-600',
    border: 'border-cyan-600',
    gradient: 'from-cyan-600/10 to-cyan-600/5',
    label: 'ACCESS',
  },
  household: {
    bg: 'bg-sky-400',
    text: 'text-sky-500',
    border: 'border-sky-400',
    gradient: 'from-sky-400/10 to-sky-400/5',
    label: 'HOUSEHOLD',
  },
  HOUSEHOLD: {
    bg: 'bg-sky-400',
    text: 'text-sky-500',
    border: 'border-sky-400',
    gradient: 'from-sky-400/10 to-sky-400/5',
    label: 'HOUSEHOLD',
  },
  rural: {
    bg: 'bg-green-700',
    text: 'text-green-700',
    border: 'border-green-700',
    gradient: 'from-green-700/10 to-green-700/5',
    label: 'RURAL',
  },
  RURAL: {
    bg: 'bg-green-700',
    text: 'text-green-700',
    border: 'border-green-700',
    gradient: 'from-green-700/10 to-green-700/5',
    label: 'RURAL',
  },
  vip: {
    bg: 'bg-amber-600',
    text: 'text-amber-600',
    border: 'border-amber-600',
    gradient: 'from-amber-600/10 to-amber-600/5',
    label: 'VIP',
  },
  VIP: {
    bg: 'bg-amber-600',
    text: 'text-amber-600',
    border: 'border-amber-600',
    gradient: 'from-amber-600/10 to-amber-600/5',
    label: 'VIP',
  },
};

export const FUEL_LABELS: Record<FuelType, string> = {
  regular: 'Regular 87',
  premium: 'Premium 91',
  diesel: 'Diesel',
};

export function getFuelColor(type: string): string {
  const normalizedType = type.toLowerCase() as FuelType;
  return FUEL_COLORS[normalizedType]?.bg || 'bg-gray-500';
}

export function getFuelTextColor(type: string): string {
  const normalizedType = type.toLowerCase() as FuelType;
  return FUEL_COLORS[normalizedType]?.text || 'text-gray-600';
}

export function getFuelGradient(type: string): string {
  const normalizedType = type.toLowerCase() as FuelType;
  return FUEL_COLORS[normalizedType]?.gradient || 'from-gray-500/10 to-gray-500/5';
}

export function getFuelLabel(type: string): string {
  const normalizedType = type.toLowerCase() as FuelType;
  return FUEL_LABELS[normalizedType] || type;
}

export function getTierColor(tier: string): string {
  const normalizedTier = tier.toLowerCase();
  return TIER_COLORS[normalizedTier]?.bg || TIER_COLORS.payg.bg;
}

export function getTierTextColor(tier: string): string {
  const normalizedTier = tier.toLowerCase();
  return TIER_COLORS[normalizedTier]?.text || TIER_COLORS.payg.text;
}

export function getTierGradient(tier: string): string {
  const normalizedTier = tier.toLowerCase();
  return TIER_COLORS[normalizedTier]?.gradient || TIER_COLORS.payg.gradient;
}

export function getTierLabel(tier: string): string {
  return tier.toUpperCase();
}
