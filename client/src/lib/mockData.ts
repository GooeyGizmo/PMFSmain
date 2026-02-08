export interface SubscriptionTier {
  id: string;
  name: string;
  slug: 'payg' | 'access' | 'heroes' | 'household' | 'rural' | 'vip';
  monthlyPrice: number;
  deliveryFee: number;
  fuelDiscount: number;
  maxVehicles: number;
  minOrder: number;
  maxOrdersPerMonth: number | null;
  features: string[];
  requiresVerification?: boolean;
}

export const subscriptionTiers: SubscriptionTier[] = [
  {
    id: '1',
    name: 'Pay As You Go',
    slug: 'payg',
    monthlyPrice: 0,
    deliveryFee: 24.99,
    fuelDiscount: 0,
    maxVehicles: 1,
    minOrder: 50,
    maxOrdersPerMonth: 4,
    features: ['No monthly commitment', 'Premium fuel at your door', 'Email support'],
  },
  {
    id: '2',
    name: 'Access',
    slug: 'access',
    monthlyPrice: 24.99,
    deliveryFee: 14.99,
    fuelDiscount: 0,
    maxVehicles: 1,
    minOrder: 50,
    maxOrdersPerMonth: 4,
    features: ['Reduced delivery fee', 'Priority scheduling windows', 'SMS notifications', 'Premium support'],
  },
  {
    id: '6',
    name: 'Service Members & Seniors',
    slug: 'heroes',
    monthlyPrice: 34.99,
    deliveryFee: 0,
    fuelDiscount: 0,
    maxVehicles: 4,
    minOrder: 50,
    maxOrdersPerMonth: null,
    features: ['FREE delivery always', 'Up to 4 vehicles', 'Household-level perks', 'Priority support', 'Recurring schedules', 'ID verification required'],
    requiresVerification: true,
  },
  {
    id: '3',
    name: 'Household',
    slug: 'household',
    monthlyPrice: 49.99,
    deliveryFee: 0,
    fuelDiscount: 0,
    maxVehicles: 4,
    minOrder: 50,
    maxOrdersPerMonth: null,
    features: ['FREE delivery always', 'Up to 4 vehicles', 'Generous household usage', 'Priority support', 'Recurring schedules'],
  },
  {
    id: '4',
    name: 'Rural / Power User',
    slug: 'rural',
    monthlyPrice: 99.99,
    deliveryFee: 0,
    fuelDiscount: 0,
    maxVehicles: 10,
    minOrder: 75,
    maxOrdersPerMonth: null,
    features: ['FREE delivery always', 'Up to 10 vehicles', 'Farm & fleet ready', 'Bulk ordering', 'Recurring deliveries'],
  },
  {
    id: '5',
    name: 'VIP',
    slug: 'vip',
    monthlyPrice: 249.99,
    deliveryFee: 0,
    fuelDiscount: 0,
    maxVehicles: 25,
    minOrder: 0,
    maxOrdersPerMonth: null,
    features: [
      'Guaranteed 1-hour private booking',
      'Exact start time (not a window)',
      'No stacked deliveries during your hour',
      'Sunday delivery access (VIP-only)',
      'Priority scheduling above all tiers',
      'Unlimited personal vehicles',
      'FREE delivery always',
    ],
  },
];

export const faqs = [
  {
    question: 'How does mobile fuel delivery work?',
    answer: 'Simply add your vehicle, select a delivery window, and we come to you! Our certified drivers arrive in our specially equipped fuel trucks and fill your vehicle while it\'s parked at home, work, or anywhere convenient.',
  },
  {
    question: 'Is it safe?',
    answer: 'Absolutely. Our drivers are fully certified and our trucks meet all safety regulations. We use the same fuel you\'d get at any gas station, delivered with professional-grade equipment.',
  },
  {
    question: 'What areas do you serve?',
    answer: 'We currently serve Calgary, surrounding areas, and communities across Southern Alberta. Check our coverage map or enter your address during booking to confirm service availability.',
  },
  {
    question: 'Can I schedule recurring deliveries?',
    answer: 'Yes! Household and Rural tier subscribers can set up automatic recurring deliveries on a weekly, bi-weekly, or monthly basis.',
  },
  {
    question: 'What if I need to cancel or reschedule?',
    answer: 'You can cancel or reschedule any order up to 2 hours before your delivery window at no charge. Simply use the app or contact our support team.',
  },
  {
    question: 'Do you offer bulk or fleet pricing?',
    answer: 'Yes! Our Rural/Power User tier is designed for farms, fleets, and high-volume users. Contact us for custom enterprise solutions.',
  },
];
