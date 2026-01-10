export interface Vehicle {
  id: string;
  userId: string;
  year: number;
  make: string;
  model: string;
  color: string;
  licensePlate: string;
  fuelType: 'regular' | 'premium' | 'diesel';
  tankCapacity: number;
}

export interface Order {
  id: string;
  userId: string;
  vehicleIds: string[];
  status: 'scheduled' | 'confirmed' | 'en_route' | 'arriving' | 'fueling' | 'completed' | 'cancelled';
  scheduledDate: Date;
  deliveryWindow: string;
  address: string;
  city: string;
  fuelAmount: number;
  fuelType: 'regular' | 'premium' | 'diesel';
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  createdAt: Date;
  driverName?: string;
  driverLatitude?: number;
  driverLongitude?: number;
}

export interface DeliveryWindow {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  active: boolean;
  maxBookings: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'delivery_scheduled' | 'delivery_confirmed' | 'delivery_en_route' | 'delivery_arriving' | 'delivery_fueling' | 'delivery_completed' | 'delivery_cancelled' | 'promotion' | 'system';
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

export interface RecurringSchedule {
  id: string;
  userId: string;
  vehicleId: string;
  frequency: 'weekly' | 'bi-weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  fuelAmount: number;
  active: boolean;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredEmail: string;
  status: 'pending' | 'signed_up' | 'first_order' | 'rewarded';
  rewardAmount: number;
  createdAt: Date;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  slug: 'payg' | 'access' | 'household' | 'rural';
  monthlyPrice: number;
  deliveryFee: number;
  fuelDiscount: number;
  maxVehicles: number;
  minOrder: number;
  maxOrdersPerMonth: number | null;
  features: string[];
}

export const subscriptionTiers: SubscriptionTier[] = [
  {
    id: '1',
    name: 'Pay As You Go',
    slug: 'payg',
    monthlyPrice: 0,
    deliveryFee: 19.99,
    fuelDiscount: 0,
    maxVehicles: 1,
    minOrder: 50,
    maxOrdersPerMonth: 4,
    features: ['No monthly commitment', 'Standard fuel pricing', 'Email support'],
  },
  {
    id: '2',
    name: 'Access',
    slug: 'access',
    monthlyPrice: 24.99,
    deliveryFee: 12.49,
    fuelDiscount: 0.03,
    maxVehicles: 1,
    minOrder: 50,
    maxOrdersPerMonth: 4,
    features: ['Reduced delivery fee', '3¢/L fuel discount', 'Priority scheduling', 'SMS notifications'],
  },
  {
    id: '3',
    name: 'Household',
    slug: 'household',
    monthlyPrice: 49.99,
    deliveryFee: 0,
    fuelDiscount: 0.05,
    maxVehicles: 4,
    minOrder: 0,
    maxOrdersPerMonth: null,
    features: ['FREE delivery', '5¢/L fuel discount', 'Up to 4 vehicles', 'Priority support', 'Recurring schedules'],
  },
  {
    id: '4',
    name: 'Rural / Power User',
    slug: 'rural',
    monthlyPrice: 99.99,
    deliveryFee: 0,
    fuelDiscount: 0.07,
    maxVehicles: 20,
    minOrder: 0,
    maxOrdersPerMonth: null,
    features: ['FREE delivery', '7¢/L fuel discount', 'Up to 20 vehicles', 'Farm & fleet ready', 'Dedicated account manager', 'Bulk ordering'],
  },
];

export const deliveryWindows: DeliveryWindow[] = [
  { id: '1', label: '6:00 AM - 7:30 AM', startTime: '6', endTime: '7:30', active: true, maxBookings: 2 },
  { id: '2', label: '7:30 AM - 9:00 AM', startTime: '7:30', endTime: '9:00', active: true, maxBookings: 2 },
  { id: '3', label: '9:00 AM - 10:30 AM', startTime: '9', endTime: '10:30', active: true, maxBookings: 2 },
  { id: '4', label: '10:30 AM - 12:00 PM', startTime: '10:30', endTime: '12:00', active: true, maxBookings: 2 },
  { id: '5', label: '12:00 PM - 1:30 PM', startTime: '12', endTime: '13:30', active: true, maxBookings: 2 },
  { id: '6', label: '1:30 PM - 3:00 PM', startTime: '13:30', endTime: '15:00', active: true, maxBookings: 2 },
  { id: '7', label: '3:00 PM - 4:30 PM', startTime: '15', endTime: '16:30', active: true, maxBookings: 2 },
  { id: '8', label: '4:30 PM - 6:00 PM', startTime: '16:30', endTime: '18:00', active: true, maxBookings: 2 },
  { id: '9', label: '6:00 PM - 7:30 PM', startTime: '18', endTime: '19:30', active: true, maxBookings: 2 },
  { id: '10', label: '7:30 PM - 9:00 PM', startTime: '19:30', endTime: '21:00', active: true, maxBookings: 2 },
];

export const fuelPrices = {
  regular: 1.4200,
  premium: 1.6400,
  diesel: 1.5850,
};

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

export function generateMockVehicles(userId: string): Vehicle[] {
  return [
    {
      id: 'v1',
      userId,
      year: 2022,
      make: 'Ford',
      model: 'F-150',
      color: 'White',
      licensePlate: 'ABC 123',
      fuelType: 'regular',
      tankCapacity: 98,
    },
    {
      id: 'v2',
      userId,
      year: 2021,
      make: 'Toyota',
      model: 'RAV4',
      color: 'Silver',
      licensePlate: 'XYZ 789',
      fuelType: 'regular',
      tankCapacity: 55,
    },
  ];
}

export function generateMockOrders(userId: string): Order[] {
  const now = new Date();
  return [
    {
      id: 'o1',
      userId,
      vehicleIds: ['v1'],
      status: 'scheduled',
      scheduledDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      deliveryWindow: 'Morning (9AM - 12PM)',
      address: '123 Main Street',
      city: 'Calgary, AB',
      fuelAmount: 60,
      fuelType: 'regular',
      subtotal: 85.74,
      deliveryFee: 0,
      discount: 2.40,
      total: 83.34,
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'o2',
      userId,
      vehicleIds: ['v2'],
      status: 'completed',
      scheduledDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      deliveryWindow: 'Afternoon (12PM - 3PM)',
      address: '123 Main Street',
      city: 'Calgary, AB',
      fuelAmount: 45,
      fuelType: 'regular',
      subtotal: 64.31,
      deliveryFee: 0,
      discount: 1.80,
      total: 62.51,
      createdAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      driverName: 'Mike Thompson',
    },
    {
      id: 'o3',
      userId,
      vehicleIds: ['v1', 'v2'],
      status: 'completed',
      scheduledDate: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000),
      deliveryWindow: 'Morning (9AM - 12PM)',
      address: '123 Main Street',
      city: 'Calgary, AB',
      fuelAmount: 95,
      fuelType: 'regular',
      subtotal: 135.76,
      deliveryFee: 0,
      discount: 3.80,
      total: 131.96,
      createdAt: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000),
      driverName: 'Sarah Johnson',
    },
  ];
}

export function generateMockNotifications(userId: string): Notification[] {
  const now = new Date();
  return [
    {
      id: 'n1',
      userId,
      type: 'delivery_scheduled',
      title: 'Delivery Scheduled',
      message: 'Your fuel delivery is confirmed for tomorrow between 9AM - 12PM.',
      read: false,
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'n2',
      userId,
      type: 'promotion',
      title: 'Winter Special',
      message: 'Get 5¢ off per litre on your next diesel delivery. Use code WINTER5.',
      read: false,
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'n3',
      userId,
      type: 'delivery_completed',
      title: 'Delivery Complete',
      message: 'Your delivery of 45L has been completed. Thank you for using Prairie Mobile Fuel Services!',
      read: true,
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  ];
}
