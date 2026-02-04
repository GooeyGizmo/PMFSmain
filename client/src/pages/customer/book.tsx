import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useVehicles, useOrders, useFuelPricing } from '@/lib/api-hooks';
import { subscriptionTiers } from '@/lib/mockData';
import { Car, Calendar as CalendarIcon, Clock, MapPin, Fuel, ChevronLeft, ChevronRight, Check, CreditCard, Loader2, Info } from 'lucide-react';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

interface SlotAvailability {
  id: string;
  label: string;
  maxBookings: number;
  currentBookings: number;
  available: boolean;
  spotsLeft: number;
  isFull: boolean;
  isPast: boolean;
  hasVipConflict?: boolean;
  startTime?: string;
  endTime?: string;
}

interface CapacityInfo {
  maxBlocks: number;
  blocksUsed: number;
  blocksRemaining: number;
  eligibleInventory: number;
  isAvailable: boolean;
  reason?: string;
  tierInventory: Array<{ tier: string; reserved: number; booked: number; remaining: number }>;
}

type Step = 'vehicles' | 'date' | 'window' | 'address' | 'fuel' | 'review' | 'payment';

export default function BookDelivery() {
  const [, setLocation] = useLocation();
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const { vehicles, isLoading } = useVehicles();
  const { createOrder } = useOrders();
  const { getFuelPrice } = useFuelPricing();
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);

  const [step, setStep] = useState<Step>('vehicles');
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [selectedWindow, setSelectedWindow] = useState<string>('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [fuelType, setFuelType] = useState<'regular' | 'premium' | 'diesel'>('regular');
  const [fuelAmount, setFuelAmount] = useState(40);
  const [fillToFull, setFillToFull] = useState(false);

  // Per-vehicle fuel selections: { vehicleId: { fuelAmount, fillToFull } }
  interface VehicleFuelSelection {
    fuelAmount: number;
    fillToFull: boolean;
  }
  const [vehicleFuelSelections, setVehicleFuelSelections] = useState<Record<string, VehicleFuelSelection>>({});

  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [createdOrderId, setCreatedOrderId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Slot availability state
  const [slotAvailability, setSlotAvailability] = useState<SlotAvailability[]>([]);
  const [capacityInfo, setCapacityInfo] = useState<CapacityInfo | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  // VIP exclusive time picker state
  const [vipSelectedTime, setVipSelectedTime] = useState<string>('');
  const isVipUser = user?.subscriptionTier === 'vip';
  
  // VIP blocked times state
  interface VipBlockedPeriod {
    blockedStart: string;
    blockedEnd: string;
    vipStart: string;
    vipEnd: string;
    orderId: string;
    released: boolean;
  }
  const [vipBlockedPeriods, setVipBlockedPeriods] = useState<VipBlockedPeriod[]>([]);
  const [loadingVipBlocked, setLoadingVipBlocked] = useState(false);

  // Promo code state
  const [promoCode, setPromoCode] = useState('');
  const [promoCodeError, setPromoCodeError] = useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{
    id: string;
    code: string;
    description: string | null;
    discountType: string;
    discountValue: number;
    minimumOrderValue: number | null;
    maximumDiscountCap: number | null;
    stackable: boolean;
    deliveryFeeCents: number;
    discountDescription: string;
  } | null>(null);

  // localStorage key for persisting booking progress
  const BOOKING_STORAGE_KEY = 'pmfs_booking_progress';

  // Restore booking state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BOOKING_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore if data is from the same user
        if (parsed.userId === user?.id) {
          // Check if saved date is still valid (not in the past)
          if (parsed.selectedDate) {
            const savedDate = new Date(parsed.selectedDate);
            const tomorrow = addDays(startOfDay(new Date()), 1);
            if (!isBefore(savedDate, tomorrow)) {
              setSelectedDate(savedDate);
            }
          }
          if (parsed.step) setStep(parsed.step);
          if (parsed.selectedVehicles) setSelectedVehicles(parsed.selectedVehicles);
          if (parsed.selectedWindow) setSelectedWindow(parsed.selectedWindow);
          if (parsed.address) setAddress(parsed.address);
          if (parsed.city) setCity(parsed.city);
          if (parsed.vehicleFuelSelections) setVehicleFuelSelections(parsed.vehicleFuelSelections);
          if (parsed.vipSelectedTime) setVipSelectedTime(parsed.vipSelectedTime);
        }
      }
    } catch (e) {
      console.error('Failed to restore booking state:', e);
    }
  }, [user?.id]);

  // Save booking state to localStorage when it changes
  useEffect(() => {
    if (user?.id) {
      const stateToSave = {
        userId: user.id,
        step,
        selectedVehicles,
        selectedDate: selectedDate?.toISOString(),
        selectedWindow,
        address,
        city,
        vehicleFuelSelections,
        vipSelectedTime,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(stateToSave));
    }
  }, [user?.id, step, selectedVehicles, selectedDate, selectedWindow, address, city, vehicleFuelSelections, vipSelectedTime]);

  // Clear saved booking state after successful order
  const clearBookingProgress = () => {
    localStorage.removeItem(BOOKING_STORAGE_KEY);
  };

  // Refresh user data on mount to ensure we have latest subscription tier
  useEffect(() => {
    refreshUser();
  }, []);

  // Fetch slot availability when date changes
  useEffect(() => {
    if (selectedDate) {
      const fetchSlotAvailability = async () => {
        setLoadingSlots(true);
        try {
          const year = selectedDate.getFullYear();
          const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
          const day = String(selectedDate.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}T12:00:00.000Z`;
          
          const res = await fetch(`/api/slots/availability?date=${encodeURIComponent(dateStr)}`);
          if (res.ok) {
            const data = await res.json();
            setSlotAvailability(data.availability || []);
            setCapacityInfo(data.capacityInfo || null);
          }
        } catch (error) {
          console.error('Failed to fetch slot availability:', error);
        } finally {
          setLoadingSlots(false);
        }
      };
      fetchSlotAvailability();
      // Clear selected window when date changes if the slot is no longer available
      setSelectedWindow('');
    }
  }, [selectedDate]);

  // Fetch VIP blocked times when date changes (for VIP users)
  useEffect(() => {
    if (selectedDate && isVipUser) {
      const fetchVipBlockedTimes = async () => {
        setLoadingVipBlocked(true);
        try {
          const year = selectedDate.getFullYear();
          const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
          const day = String(selectedDate.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          
          const res = await fetch(`/api/vip-blocked-times?date=${encodeURIComponent(dateStr)}`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            setVipBlockedPeriods(data.blockedPeriods || []);
          }
        } catch (error) {
          console.error('Failed to fetch VIP blocked times:', error);
        } finally {
          setLoadingVipBlocked(false);
        }
      };
      fetchVipBlockedTimes();
      // Clear VIP selected time when date changes
      setVipSelectedTime('');
    }
  }, [selectedDate, isVipUser]);

  // Helper to check if a VIP time slot is blocked or unavailable
  const isVipTimeBlocked = (timeStr: string): boolean => {
    if (!selectedDate) return false;
    
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);
    
    // Check if this is a same-day booking and slot is less than 90 minutes from now
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();
    if (isToday) {
      const minBookingTime = new Date(now.getTime() + 90 * 60 * 1000); // 90 minutes from now
      if (slotStart < minBookingTime) {
        return true; // Too soon - need at least 90 minutes lead time
      }
    }
    
    // If no blocked periods, return false (slot is available)
    if (vipBlockedPeriods.length === 0) return false;
    
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000); // 1 hour later
    
    // Also add the 30-min buffers for this potential slot
    const potentialBlockedStart = new Date(slotStart.getTime() - 30 * 60 * 1000);
    const potentialBlockedEnd = new Date(slotEnd.getTime() + 30 * 60 * 1000);
    
    // Check if this slot's full blocked period overlaps with any existing blocked period
    for (const period of vipBlockedPeriods) {
      const existingStart = new Date(period.blockedStart);
      const existingEnd = new Date(period.blockedEnd);
      
      // Overlap check: two ranges overlap if start1 < end2 AND end1 > start2
      if (potentialBlockedStart < existingEnd && potentialBlockedEnd > existingStart) {
        return true;
      }
    }
    return false;
  };

  // Initialize address from user's default address
  useEffect(() => {
    if (user?.defaultAddress && !address) {
      setAddress(user.defaultAddress);
    }
    if (user?.defaultCity && !city) {
      setCity(user.defaultCity);
    }
  }, [user?.defaultAddress, user?.defaultCity]);

  const steps: Step[] = ['vehicles', 'date', 'window', 'address', 'fuel', 'review', 'payment'];
  const currentStepIndex = steps.indexOf(step);

  useEffect(() => {
    const initStripe = async () => {
      try {
        const res = await fetch('/api/stripe/publishable-key');
        const { publishableKey } = await res.json();
        setStripePromise(loadStripe(publishableKey));
      } catch (error) {
        console.error('Failed to load Stripe:', error);
      }
    };
    initStripe();
  }, []);

  const toggleVehicle = (vehicleId: string) => {
    const maxVehicles = currentTier?.maxVehicles || 1;
    if (selectedVehicles.includes(vehicleId)) {
      setSelectedVehicles(prev => prev.filter(id => id !== vehicleId));
      // Remove from fuel selections
      setVehicleFuelSelections(prev => {
        const updated = { ...prev };
        delete updated[vehicleId];
        return updated;
      });
    } else if (selectedVehicles.length < maxVehicles) {
      setSelectedVehicles(prev => [...prev, vehicleId]);
      // Initialize fuel selection with empty amount (user must enter)
      setVehicleFuelSelections(prev => ({
        ...prev,
        [vehicleId]: { fuelAmount: 0, fillToFull: false }
      }));
    } else {
      toast({ title: 'Vehicle limit reached', description: `Your plan allows up to ${maxVehicles} vehicles per order.`, variant: 'destructive' });
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'vehicles': return selectedVehicles.length > 0;
      case 'date': return !!selectedDate;
      case 'window': return isVipUser ? !!vipSelectedTime : !!selectedWindow;
      case 'address': return address.trim() && city.trim();
      case 'fuel': 
        // All selected vehicles must have some fuel selection (either fillToFull or amount > 0)
        // Minimum litre validation happens on Continue button click
        return selectedVehicles.every(vid => {
          const selection = vehicleFuelSelections[vid];
          return selection && (selection.fillToFull || selection.fuelAmount > 0);
        });
      default: return true;
    }
  };

  const validateFuelMinimums = (): boolean => {
    const minOrderLitres = currentTier?.minOrder || 0;
    if (minOrderLitres === 0) return true;
    
    // Calculate total litres across all vehicles
    let totalLitres = 0;
    for (const vid of selectedVehicles) {
      const selection = vehicleFuelSelections[vid];
      if (selection) {
        totalLitres += selection.fillToFull ? FILL_TO_FULL_LITRES : selection.fuelAmount;
      }
    }
    
    if (totalLitres < minOrderLitres) {
      toast({
        title: 'Minimum order not met',
        description: `Your subscription requires a minimum of ${minOrderLitres} litres total. You currently have ${totalLitres} litres.`,
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const nextStep = async () => {
    // Validate fuel minimums when leaving fuel step
    if (step === 'fuel') {
      if (!validateFuelMinimums()) {
        return;
      }
    }
    
    // Save default address if checked when leaving address step
    if (step === 'address' && saveAsDefault && address.trim() && city.trim()) {
      try {
        const res = await fetch('/api/user/default-address', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, city }),
        });
        if (res.ok) {
          await refreshUser();
          toast({ title: 'Address saved', description: 'This address is now your default delivery location.' });
        }
      } catch (error) {
        console.error('Failed to save default address:', error);
      }
    }
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  const prevStep = () => {
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  const FILL_TO_FULL_LITRES = 150;
  const GST_RATE = 0.05;

  const getEffectiveLitres = () => fillToFull ? FILL_TO_FULL_LITRES : fuelAmount;

  // Helper to get per-vehicle details for pricing calculations
  const getVehicleFuelDetails = () => {
    return selectedVehicles.map(vid => {
      const vehicle = vehicles.find(v => v.id === vid);
      const selection = vehicleFuelSelections[vid] || { fuelAmount: 40, fillToFull: false };
      const effectiveLitres = selection.fillToFull ? FILL_TO_FULL_LITRES : selection.fuelAmount;
      const fuelType = vehicle?.fuelType || 'regular';
      const pricePerLitre = getFuelPrice(fuelType);
      return {
        vehicleId: vid,
        vehicle,
        fuelType,
        litres: effectiveLitres,
        fillToFull: selection.fillToFull,
        pricePerLitre,
      };
    });
  };

  const validatePromoCode = async () => {
    if (!promoCode.trim()) {
      setPromoCodeError('Please enter a promo code');
      return;
    }

    setValidatingPromo(true);
    setPromoCodeError(null);

    try {
      const res = await fetch('/api/promo-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim() }),
      });

      const data = await res.json();

      if (data.valid) {
        setAppliedPromo({
          id: data.promoCode.id,
          code: data.promoCode.code,
          description: data.promoCode.description,
          discountType: data.promoCode.discountType,
          discountValue: data.promoCode.discountValue,
          minimumOrderValue: data.promoCode.minimumOrderValue,
          maximumDiscountCap: data.promoCode.maximumDiscountCap,
          stackable: data.promoCode.stackable,
          deliveryFeeCents: data.deliveryFeeCents,
          discountDescription: data.discountDescription,
        });
        setPromoCodeError(null);
        toast({
          title: 'Promo code applied!',
          description: data.discountDescription,
        });
      } else {
        setPromoCodeError(data.message || 'Invalid promo code');
        setAppliedPromo(null);
      }
    } catch (error) {
      setPromoCodeError('Failed to validate promo code');
      setAppliedPromo(null);
    } finally {
      setValidatingPromo(false);
    }
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
    setPromoCode('');
    setPromoCodeError(null);
  };

  const calculateTotal = () => {
    const vehicleDetails = getVehicleFuelDetails();
    // Option 4 pricing: NO per-litre tier discounts
    const tierDiscount = 0; // Always 0 in Option 4 model
    const baseDeliveryFee = currentTier?.deliveryFee ?? 24.99;
    
    // Calculate total fuel cost across all vehicles
    let totalFuelCost = 0;
    let totalLitres = 0;
    
    vehicleDetails.forEach(v => {
      const fuelCost = v.litres * v.pricePerLitre;
      totalFuelCost += fuelCost;
      totalLitres += v.litres;
    });
    
    // Fuel subtotal (no tier discount in Option 4)
    const fuelSubtotal = totalFuelCost;
    
    // Calculate promo discount based on discount type
    let promoDiscount = 0;
    let deliveryFee = baseDeliveryFee;
    let promoDiscountDescription = "";
    let minimumOrderError: string | null = null;
    
    if (appliedPromo) {
      // Check stackable flag - if promo is non-stackable and user has free delivery, show warning
      const hasTierBenefit = baseDeliveryFee === 0;
      if (!appliedPromo.stackable && hasTierBenefit) {
        minimumOrderError = "This promo cannot be combined with your tier benefits";
      }
      // Check minimum order value
      else if (appliedPromo.minimumOrderValue && fuelSubtotal < appliedPromo.minimumOrderValue) {
        minimumOrderError = `Minimum order of $${appliedPromo.minimumOrderValue.toFixed(2)} required`;
      } else {
        switch (appliedPromo.discountType) {
          case "delivery_fee":
            // Delivery fee waiver
            promoDiscount = baseDeliveryFee;
            deliveryFee = 0;
            promoDiscountDescription = "Free delivery";
            break;
          case "percentage_fuel":
            // Percentage off fuel subtotal
            promoDiscount = fuelSubtotal * (appliedPromo.discountValue / 100);
            // Apply cap if set
            if (appliedPromo.maximumDiscountCap && promoDiscount > appliedPromo.maximumDiscountCap) {
              promoDiscount = appliedPromo.maximumDiscountCap;
            }
            promoDiscountDescription = `${appliedPromo.discountValue}% off fuel`;
            break;
          case "flat_amount":
            // Fixed dollar amount off
            promoDiscount = Math.min(appliedPromo.discountValue, fuelSubtotal);
            promoDiscountDescription = `$${appliedPromo.discountValue.toFixed(2)} off`;
            break;
        }
      }
    }
    
    // Calculate final subtotal and total
    const subtotal = fuelSubtotal + deliveryFee - (appliedPromo?.discountType !== "delivery_fee" ? promoDiscount : 0);
    const gstAmount = subtotal * GST_RATE;
    const total = subtotal + gstAmount;
    
    return { 
      subtotal, 
      deliveryFee, 
      baseDeliveryFee,
      promoDiscount,
      promoDiscountDescription,
      minimumOrderError,
      discount: 0, // Always 0 in Option 4 model - no per-litre tier discounts
      fuelSubtotal,
      gstAmount,
      total, 
      pricePerLitre: vehicleDetails[0]?.pricePerLitre || 0,
      litres: totalLitres,
      vehicleDetails,
    };
  };

  const handleSubmit = async () => {
    if (!selectedDate) return;

    // VIP users use exact time, non-VIP use slot-based windows
    const selectedSlot = isVipUser 
      ? null 
      : slotAvailability.find((s: SlotAvailability) => s.id === selectedWindow);
    
    if (!isVipUser && !selectedSlot) return;
    if (isVipUser && !vipSelectedTime) return;

    const { deliveryFee, total, litres, subtotal, gstAmount, vehicleDetails, fuelSubtotal, minimumOrderError } = calculateTotal();
    // Option 4: tierDiscount is always 0
    const tierDiscount = 0;
    
    // Check for minimum order error before proceeding
    if (minimumOrderError) {
      toast({
        title: 'Order requirement not met',
        description: minimumOrderError,
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Use the first vehicle for the main order record (for backwards compatibility)
      // All vehicles are stored in order_items
      const primaryVehicle = vehicleDetails[0];
      
      // Build order items data for multi-vehicle support
      const orderItems = vehicleDetails.map(v => ({
        vehicleId: v.vehicleId,
        fuelType: v.fuelType,
        fuelAmount: v.litres,
        fillToFull: v.fillToFull,
        pricePerLitre: v.pricePerLitre.toString(),
        tierDiscount: tierDiscount.toString(),
        subtotal: ((v.litres * v.pricePerLitre) - (v.litres * tierDiscount)).toFixed(2),
      }));

      // Build VIP start/end times if VIP user
      let vipStartTime: Date | null = null;
      let vipEndTime: Date | null = null;
      let deliveryWindowLabel = selectedSlot?.label || '';
      
      let windowStart: Date | null = null;
      let windowEnd: Date | null = null;
      
      if (isVipUser && vipSelectedTime) {
        const [hours, minutes] = vipSelectedTime.split(':').map(Number);
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const day = selectedDate.getDate();
        vipStartTime = new Date(year, month, day, hours, minutes, 0);
        vipEndTime = new Date(year, month, day, hours + 1, minutes, 0);
        windowStart = vipStartTime;
        windowEnd = vipEndTime;
        const endHours = hours + 1;
        const startDisplay = `${hours > 12 ? hours - 12 : hours}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
        const endDisplay = `${endHours > 12 ? endHours - 12 : endHours}:${minutes.toString().padStart(2, '0')} ${endHours >= 12 ? 'PM' : 'AM'}`;
        deliveryWindowLabel = `VIP Exclusive: ${startDisplay} - ${endDisplay}`;
      } else if (!isVipUser && selectedWindow) {
        const selectedSlot = slotAvailability.find(s => s.id === selectedWindow);
        if (selectedSlot?.startTime && selectedSlot?.endTime) {
          windowStart = new Date(selectedSlot.startTime);
          windowEnd = new Date(selectedSlot.endTime);
        }
      }

      const result = await createOrder({
        vehicleId: primaryVehicle.vehicleId,
        address,
        city,
        scheduledDate: (() => {
          const year = selectedDate.getFullYear();
          const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
          const day = String(selectedDate.getDate()).padStart(2, '0');
          return new Date(`${year}-${month}-${day}T12:00:00.000Z`);
        })(),
        deliveryWindow: deliveryWindowLabel,
        fuelType: primaryVehicle.fuelType,
        fuelAmount: litres,
        fillToFull: vehicleDetails.some(v => v.fillToFull),
        pricePerLitre: primaryVehicle.pricePerLitre.toString(),
        deliveryFee: deliveryFee.toString(),
        subtotal: subtotal.toFixed(2),
        gstAmount: gstAmount.toFixed(2),
        total: total.toFixed(2),
        tierDiscount: tierDiscount.toString(),
        status: 'scheduled',
        notes: null,
        orderItems,
        promoCodeId: appliedPromo?.id || null,
        orderSubtotalCents: Math.round(fuelSubtotal * 100),
        bookingType: isVipUser ? 'vip_exclusive' : 'standard_window',
        vipStartTime: vipStartTime?.toISOString() || null,
        vipEndTime: vipEndTime?.toISOString() || null,
        windowStart: windowStart?.toISOString() || null,
        windowEnd: windowEnd?.toISOString() || null,
      } as any);

      if (!result.success || !result.order) {
        throw new Error(result.error || 'Failed to create order');
      }

      const order = result.order;
      setCreatedOrderId(order.id);

      const paymentRes = await fetch(`/api/orders/${order.id}/payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!paymentRes.ok) {
        throw new Error('Failed to create payment intent');
      }

      const { clientSecret: secret } = await paymentRes.json();
      setClientSecret(secret);
      setStep('payment');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create order. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentSuccess = async () => {
    try {
      // Confirm payment success with backend to update order status to confirmed
      if (!createdOrderId) {
        toast({
          title: 'Error',
          description: 'Order not found. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      const res = await fetch(`/api/orders/${createdOrderId}/confirm-payment-success`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        // Payment confirmation failed - show error and stay on payment step
        toast({
          title: 'Payment Not Confirmed',
          description: data.message || 'Your payment could not be confirmed. Please try again or use a different card.',
          variant: 'destructive',
        });
        return; // Stay on payment step - don't redirect
      }
      
      // Payment confirmed successfully - clear saved booking state, show success and redirect
      clearBookingProgress();
      toast({
        title: 'Payment Successful!',
        description: `Your fuel delivery is scheduled for ${format(selectedDate!, 'MMMM d')}.`,
      });
      setLocation('/customer/deliveries');
    } catch (error) {
      console.error('Error confirming payment:', error);
      toast({
        title: 'Payment Error',
        description: 'Something went wrong confirming your payment. Please contact support if this persists.',
        variant: 'destructive',
      });
      // Stay on payment step - don't redirect
    }
  };

  const handlePaymentError = (message: string) => {
    toast({
      title: 'Payment Failed',
      description: message,
      variant: 'destructive',
    });
  };

  return (
    <AppShell forceShell="customer">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground">Book Delivery</h1>
          <p className="text-muted-foreground mt-1">Schedule your fuel delivery</p>
        </div>

        <div className="flex items-center justify-between mb-8 w-full">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-colors shrink-0 ${
                  i < currentStepIndex
                    ? 'bg-copper text-white'
                    : i === currentStepIndex
                    ? 'bg-copper text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < currentStepIndex ? <Check className="w-3 h-3 sm:w-4 sm:h-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${i < currentStepIndex ? 'bg-copper' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {step === 'vehicles' && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Car className="w-5 h-5 text-copper" />
                    Select Vehicles
                  </CardTitle>
                  <CardDescription>Choose which vehicles need fuel (up to {currentTier?.maxVehicles})</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {vehicles.map((vehicle) => (
                    <div
                      key={vehicle.id}
                      onClick={() => toggleVehicle(vehicle.id)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedVehicles.includes(vehicle.id)
                          ? 'border-copper bg-copper/5'
                          : 'border-border hover:border-copper/30'
                      }`}
                      data-testid={`vehicle-${vehicle.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {vehicle.color} · {vehicle.licensePlate} · {vehicle.fuelType}
                          </p>
                        </div>
                        <Checkbox checked={selectedVehicles.includes(vehicle.id)} />
                      </div>
                    </div>
                  ))}
                  {vehicles.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Car className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No vehicles added yet.</p>
                      <Button variant="link" className="text-copper" onClick={() => setLocation('/customer/vehicles')}>
                        Add a Vehicle
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {step === 'date' && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-copper" />
                    Select Date
                  </CardTitle>
                  <CardDescription>Choose your preferred delivery date</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => {
                      // Past dates are always disabled
                      if (isBefore(date, startOfDay(new Date()))) return true;
                      // Sundays are VIP-only (day 0 = Sunday)
                      if (date.getDay() === 0 && user?.subscriptionTier !== 'vip') return true;
                      return false;
                    }}
                    className="w-full max-w-sm p-0 [&_table]:w-full [&_td]:p-1 [&_th]:p-1 [&_button]:h-12 [&_button]:w-full [&_button]:text-base [&_.rdp-head_cell]:text-sm [&_.rdp-caption]:text-lg [&_.rdp-caption]:py-3 [&_.rdp-nav_button]:h-10 [&_.rdp-nav_button]:w-10"
                  />
                  {user?.subscriptionTier !== 'vip' && (
                    <p className="text-xs text-muted-foreground mt-4 text-center max-w-sm">
                      Sunday deliveries are available exclusively for VIP Fuel Concierge members.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {step === 'window' && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Clock className="w-5 h-5 text-copper" />
                    {isVipUser ? 'Your Exclusive Hour' : 'Delivery Window'}
                  </CardTitle>
                  <CardDescription>
                    {isVipUser 
                      ? `Choose your exact 1-hour private booking for ${format(selectedDate!, 'MMMM d')}`
                      : `Select a time window for ${format(selectedDate!, 'MMMM d')}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isVipUser ? (
                    // VIP Exclusive Time Picker - 30-minute increments, 1-hour blocks
                    <div className="space-y-4">
                      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-4 mb-4">
                        <div className="flex items-center gap-2 text-amber-800">
                          <Info className="w-4 h-4" />
                          <span className="text-sm font-medium">VIP Fuel Concierge Exclusive</span>
                        </div>
                        <p className="text-xs text-amber-700 mt-1">
                          Your 1-hour block is guaranteed private. No other deliveries will be scheduled during your window.
                        </p>
                      </div>
                      {loadingVipBlocked ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                          <span className="ml-2 text-muted-foreground">Checking availability...</span>
                        </div>
                      ) : (
                        <RadioGroup value={vipSelectedTime} onValueChange={(value) => {
                          if (!isVipTimeBlocked(value)) {
                            setVipSelectedTime(value);
                          }
                        }} className="grid grid-cols-3 gap-2">
                          {['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'].map((time) => {
                            const [hours, minutes] = time.split(':').map(Number);
                            const endHours = hours + 1;
                            const endTime = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                            const displayTime = `${hours > 12 ? hours - 12 : hours}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
                            const isBlocked = isVipTimeBlocked(time);
                            
                            return (
                              <div
                                key={time}
                                className={`p-3 rounded-lg border-2 text-center transition-all ${
                                  isBlocked 
                                    ? 'border-gray-200 bg-gray-100 cursor-not-allowed opacity-50' 
                                    : vipSelectedTime === time 
                                      ? 'border-amber-500 bg-amber-50 cursor-pointer' 
                                      : 'border-border hover:border-amber-300 cursor-pointer'
                                }`}
                                onClick={() => !isBlocked && setVipSelectedTime(time)}
                              >
                                <RadioGroupItem value={time} id={`vip-${time}`} className="sr-only" disabled={isBlocked} />
                                <Label htmlFor={`vip-${time}`} className={isBlocked ? 'cursor-not-allowed' : 'cursor-pointer'}>
                                  <span className={`font-medium text-sm ${isBlocked ? 'text-gray-400' : ''}`}>{displayTime}</span>
                                  {isBlocked && <span className="block text-xs text-gray-400">Booked</span>}
                                </Label>
                              </div>
                            );
                          })}
                        </RadioGroup>
                      )}
                      {vipSelectedTime && (
                        <p className="text-sm text-muted-foreground text-center mt-2">
                          Your exclusive 1-hour block: {vipSelectedTime} - {
                            (() => {
                              const [h, m] = vipSelectedTime.split(':').map(Number);
                              return `${(h + 1).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                            })()
                          }
                        </p>
                      )}
                    </div>
                  ) : loadingSlots ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-copper" />
                      <span className="ml-2 text-muted-foreground">Loading availability...</span>
                    </div>
                  ) : (
                    <RadioGroup value={selectedWindow} onValueChange={(value) => {
                      const slot = slotAvailability.find(s => s.id === value);
                      if (slot?.available) {
                        setSelectedWindow(value);
                      }
                    }} className="grid grid-cols-2 gap-3">
                      {slotAvailability.map((slot) => {
                        const isUnavailable = !slot.available;
                        const statusText = slot.isPast ? 'Unavailable' : slot.hasVipConflict ? 'VIP Reserved' : slot.isFull ? 'Full' : `${slot.spotsLeft} left`;
                        
                        return (
                          <div
                            key={slot.id}
                            className={`flex items-center space-x-3 p-4 rounded-xl border-2 transition-all ${
                              isUnavailable
                                ? 'border-border bg-muted/50 cursor-not-allowed opacity-60'
                                : selectedWindow === slot.id 
                                  ? 'border-copper bg-copper/5 cursor-pointer' 
                                  : 'border-border hover:border-copper/30 cursor-pointer'
                            }`}
                            onClick={() => {
                              if (!isUnavailable) {
                                setSelectedWindow(slot.id);
                              }
                            }}
                          >
                            <RadioGroupItem 
                              value={slot.id} 
                              id={slot.id} 
                              disabled={isUnavailable}
                              className={isUnavailable ? 'opacity-50' : ''}
                            />
                            <Label 
                              htmlFor={slot.id} 
                              className={`flex-1 ${isUnavailable ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <span className={`font-medium text-sm ${isUnavailable ? 'text-muted-foreground' : ''}`}>
                                {slot.label}
                              </span>
                              <span className={`block text-xs mt-0.5 ${
                                isUnavailable 
                                  ? 'text-destructive/70' 
                                  : slot.spotsLeft === 1 
                                    ? 'text-amber-600' 
                                    : 'text-muted-foreground'
                              }`}>
                                {statusText}
                              </span>
                            </Label>
                          </div>
                        );
                      })}
                    </RadioGroup>
                  )}
                </CardContent>
              </Card>
            )}

            {step === 'address' && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-copper" />
                    Delivery Address
                  </CardTitle>
                  <CardDescription>
                    {user?.defaultAddress ? 'Your saved address is pre-filled below' : 'Where should we deliver?'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">Street Address</Label>
                    <Input
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Main Street"
                      data-testid="input-address"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City, Province</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Calgary, AB"
                      data-testid="input-city"
                    />
                  </div>
                  {!user?.defaultAddress && (
                    <div className="flex items-center space-x-2 pt-2">
                      <Checkbox
                        id="saveAsDefault"
                        checked={saveAsDefault}
                        onCheckedChange={(checked) => setSaveAsDefault(checked === true)}
                        data-testid="checkbox-save-default-address"
                      />
                      <Label htmlFor="saveAsDefault" className="text-sm text-muted-foreground cursor-pointer">
                        Save as my default delivery address
                      </Label>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {step === 'fuel' && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Fuel className="w-5 h-5 text-copper" />
                    Fuel Selection
                  </CardTitle>
                  <CardDescription>
                    {selectedVehicles.length === 1 
                      ? 'Choose how much fuel you need' 
                      : `Set fuel amount for each of your ${selectedVehicles.length} vehicles`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {selectedVehicles.map((vehicleId) => {
                    const vehicle = vehicles.find(v => v.id === vehicleId);
                    const selection = vehicleFuelSelections[vehicleId] || { fuelAmount: 40, fillToFull: false };
                    const fuelTypeLabel = vehicle?.fuelType === 'regular' ? 'Regular 87' : 
                                          vehicle?.fuelType === 'premium' ? 'Premium' : 'Diesel';
                    const price = getFuelPrice(vehicle?.fuelType || 'regular');

                    return (
                      <div key={vehicleId} className="p-4 rounded-xl border border-border bg-muted/30 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Car className="w-5 h-5 text-copper" />
                            <div>
                              <p className="font-medium text-foreground">
                                {vehicle?.year} {vehicle?.make} {vehicle?.model}
                              </p>
                              <p className="text-sm text-muted-foreground">{vehicle?.licensePlate}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-foreground">{fuelTypeLabel}</p>
                            <p className="text-xs text-muted-foreground">${price.toFixed(4)}/L</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <Label htmlFor={`fuelAmount-${vehicleId}`} className="text-sm">Amount (Litres)</Label>
                              <Input
                                id={`fuelAmount-${vehicleId}`}
                                type="number"
                                min={1}
                                max={vehicle?.tankCapacity || 500}
                                step="0.1"
                                value={selection.fillToFull ? FILL_TO_FULL_LITRES : (selection.fuelAmount === 0 ? '' : selection.fuelAmount)}
                                onChange={(e) => {
                                  const rawValue = e.target.value;
                                  const amount = rawValue === '' ? 0 : parseFloat(rawValue) || 0;
                                  setVehicleFuelSelections(prev => ({
                                    ...prev,
                                    [vehicleId]: { ...prev[vehicleId], fuelAmount: amount }
                                  }));
                                }}
                                disabled={selection.fillToFull}
                                placeholder="Enter litres"
                                className="mt-1"
                                data-testid={`input-fuel-amount-${vehicleId}`}
                              />
                            </div>
                            <div className="flex items-center gap-2 pt-5">
                              <Checkbox
                                id={`fillToFull-${vehicleId}`}
                                checked={selection.fillToFull}
                                onCheckedChange={(checked) => {
                                  setVehicleFuelSelections(prev => ({
                                    ...prev,
                                    [vehicleId]: { ...prev[vehicleId], fillToFull: !!checked }
                                  }));
                                }}
                                data-testid={`checkbox-fill-to-full-${vehicleId}`}
                              />
                              <Label htmlFor={`fillToFull-${vehicleId}`} className="text-sm cursor-pointer whitespace-nowrap">
                                Fill to Full
                              </Label>
                            </div>
                          </div>
                          {selection.fillToFull && (
                            <p className="text-xs text-muted-foreground">
                              Pre-auth based on ~150L. Final charge based on actual litres.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {currentTier?.minOrder ? (
                    <p className="text-sm text-muted-foreground text-center">
                      Minimum total order: {currentTier.minOrder} litres
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {step === 'review' && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display">Review Order</CardTitle>
                  <CardDescription>Confirm your delivery details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-medium">{format(selectedDate!, 'EEEE, MMMM d, yyyy')}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">{isVipUser ? 'Your Exclusive Hour' : 'Window'}</span>
                      <span className="font-medium">
                        {isVipUser && vipSelectedTime ? (() => {
                          const [h, m] = vipSelectedTime.split(':').map(Number);
                          const startDisplay = `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
                          const endH = h + 1;
                          const endDisplay = `${endH > 12 ? endH - 12 : endH}:${m.toString().padStart(2, '0')} ${endH >= 12 ? 'PM' : 'AM'}`;
                          return `${startDisplay} - ${endDisplay}`;
                        })() : slotAvailability.find(w => w.id === selectedWindow)?.label}
                      </span>
                    </div>
                    {isVipUser && (
                      <div className="flex items-center gap-2 py-2 border-b border-amber-200 bg-amber-50/50 px-2 rounded">
                        <Info className="w-4 h-4 text-amber-600" />
                        <span className="text-xs text-amber-700">VIP Exclusive: No other deliveries during your hour</span>
                      </div>
                    )}
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Address</span>
                      <span className="font-medium text-right">{address}, {city}</span>
                    </div>
                  </div>

                  {/* Per-vehicle fuel summary */}
                  <div className="space-y-3 pt-2">
                    <p className="text-sm font-medium text-muted-foreground">Vehicles ({selectedVehicles.length})</p>
                    {calculateTotal().vehicleDetails.map((v) => {
                      const fuelTypeLabel = v.fuelType === 'regular' ? 'Regular' : 
                                            v.fuelType === 'premium' ? 'Premium' : 'Diesel';
                      return (
                        <div key={v.vehicleId} className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium text-sm">
                              {v.vehicle?.year} {v.vehicle?.make} {v.vehicle?.model}
                            </span>
                            <span className="text-sm text-muted-foreground">{v.vehicle?.licensePlate}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {v.fillToFull ? `Fill to Full (~${v.litres}L)` : `${v.litres}L`} {fuelTypeLabel}
                            </span>
                            <span>${(v.litres * v.pricePerLitre).toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Promo Code Section */}
                  <div className="pt-4 border-t border-border">
                    <p className="text-sm font-medium mb-2">Promo Code</p>
                    {appliedPromo ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-sage/10 border border-sage/30">
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-sage" />
                            <span className="text-sm font-medium text-sage">{appliedPromo.code}</span>
                            <span className="text-xs text-muted-foreground">- {appliedPromo.discountDescription}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={removePromoCode}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid="button-remove-promo"
                          >
                            Remove
                          </Button>
                        </div>
                        {calculateTotal().minimumOrderError && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <span className="font-medium">Note:</span> {calculateTotal().minimumOrderError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter promo code"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                          className="flex-1"
                          data-testid="input-promo-code"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={validatePromoCode}
                          disabled={validatingPromo || !promoCode.trim()}
                          data-testid="button-apply-promo"
                        >
                          {validatingPromo ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                        </Button>
                      </div>
                    )}
                    {promoCodeError && (
                      <p className="text-xs text-red-500 mt-1">{promoCodeError}</p>
                    )}
                  </div>

                  <div className="pt-4 space-y-2 border-t border-border">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Fuel ({calculateTotal().litres}L)</span>
                      <span>${calculateTotal().fuelSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Delivery Fee</span>
                      {calculateTotal().promoDiscount > 0 ? (
                        <div className="text-right">
                          <span className="line-through text-muted-foreground mr-2">${calculateTotal().baseDeliveryFee.toFixed(2)}</span>
                          <span className="text-sage font-medium">FREE</span>
                        </div>
                      ) : (
                        <span>{calculateTotal().deliveryFee === 0 ? 'FREE' : `$${calculateTotal().deliveryFee.toFixed(2)}`}</span>
                      )}
                    </div>
                    {calculateTotal().promoDiscount > 0 && (
                      <div className="flex justify-between text-sm text-sage">
                        <span>Promo Discount ({appliedPromo?.code})</span>
                        <span>-${calculateTotal().promoDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">GST (5%)</span>
                      <span>${calculateTotal().gstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-display font-bold pt-2 border-t border-border">
                      <span>Total</span>
                      <span>${calculateTotal().total.toFixed(2)}</span>
                    </div>
                    {calculateTotal().vehicleDetails.some(v => v.fillToFull) && (
                      <p className="text-xs text-muted-foreground pt-2">
                        * Fill to Full estimate based on ~150L per vehicle. Final charge will be based on actual litres delivered.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 'payment' && stripePromise && clientSecret && (
              <div className="space-y-6">
                <Elements stripe={stripePromise} options={{ clientSecret, locale: 'en-CA' }}>
                  <PaymentForm
                    clientSecret={clientSecret}
                    total={calculateTotal().total}
                    fuelAmount={calculateTotal().litres}
                    fuelType={calculateTotal().vehicleDetails[0]?.fuelType || 'regular'}
                    address={address}
                    city={city}
                    date={selectedDate!}
                    deliveryWindow={isVipUser && vipSelectedTime ? (() => {
                      const [h, m] = vipSelectedTime.split(':').map(Number);
                      const startDisplay = `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
                      const endH = h + 1;
                      const endDisplay = `${endH > 12 ? endH - 12 : endH}:${m.toString().padStart(2, '0')} ${endH >= 12 ? 'PM' : 'AM'}`;
                      return `VIP Exclusive: ${startDisplay} - ${endDisplay}`;
                    })() : slotAvailability.find((s: SlotAvailability) => s.id === selectedWindow)?.label || ''}
                    fillToFull={calculateTotal().vehicleDetails.some(v => v.fillToFull)}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                  />
                </Elements>
                <Button
                  variant="outline"
                  onClick={prevStep}
                  data-testid="button-prev-step-payment"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {step !== 'payment' && (
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStepIndex === 0}
              data-testid="button-prev-step"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            {step === 'review' ? (
              <Button
                className="bg-copper hover:bg-copper/90"
                onClick={handleSubmit}
                disabled={isProcessing}
                data-testid="button-confirm-booking"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Confirm Booking
                    <Check className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={nextStep}
                disabled={!canProceed()}
                className="bg-copper hover:bg-copper/90"
                data-testid="button-next-step"
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

interface SavedPaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

interface PaymentFormProps {
  clientSecret: string;
  total: number;
  fuelAmount: number;
  fuelType: string;
  address: string;
  city: string;
  date: Date;
  deliveryWindow: string;
  fillToFull: boolean;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function PaymentForm({ clientSecret, total, fuelAmount, fuelType, address, city, date, deliveryWindow, fillToFull, onSuccess, onError }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedPaymentMethod[]>([]);
  const [defaultCardId, setDefaultCardId] = useState<string | null>(null);
  const [loadingCards, setLoadingCards] = useState(true);
  const [useNewCard, setUseNewCard] = useState(false);
  const [savedCardError, setSavedCardError] = useState<string | null>(null);

  // Fetch saved payment methods on mount
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        const res = await fetch('/api/payment-methods');
        if (res.ok) {
          const data = await res.json();
          const cards: SavedPaymentMethod[] = (data.paymentMethods || []).map((pm: any) => ({
            id: pm.id,
            brand: pm.brand || 'card',
            last4: pm.last4 || '****',
            expMonth: pm.expMonth || 0,
            expYear: pm.expYear || 0,
          }));
          setSavedCards(cards);
          setDefaultCardId(data.defaultPaymentMethodId || (cards.length > 0 ? cards[0].id : null));
        }
      } catch (error) {
        console.error('Failed to fetch payment methods:', error);
      } finally {
        setLoadingCards(false);
      }
    };
    fetchPaymentMethods();
  }, []);

  const getCardBrandName = (brand: string) => {
    const brands: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'Amex',
      discover: 'Discover',
    };
    return brands[brand?.toLowerCase()] || brand || 'Card';
  };

  const getCardBrandIcon = (brand: string) => {
    const b = brand?.toLowerCase();
    switch (b) {
      case 'visa':
        return (
          <div className="w-10 h-7 bg-gradient-to-br from-blue-800 to-blue-600 rounded flex items-center justify-center">
            <span className="text-white text-[10px] font-bold italic">VISA</span>
          </div>
        );
      case 'mastercard':
        return (
          <div className="w-10 h-7 bg-gradient-to-br from-gray-800 to-gray-900 rounded flex items-center justify-center relative overflow-hidden">
            <div className="absolute w-4 h-4 rounded-full bg-red-500 -left-0.5"></div>
            <div className="absolute w-4 h-4 rounded-full bg-yellow-500 -right-0.5 opacity-90"></div>
          </div>
        );
      case 'amex':
        return (
          <div className="w-10 h-7 bg-gradient-to-br from-blue-500 to-blue-400 rounded flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">AMEX</span>
          </div>
        );
      case 'discover':
        return (
          <div className="w-10 h-7 bg-gradient-to-br from-orange-500 to-orange-400 rounded flex items-center justify-center">
            <span className="text-white text-[7px] font-bold">DISCOVER</span>
          </div>
        );
      default:
        return (
          <div className="w-10 h-7 bg-gradient-to-br from-gray-700 to-gray-900 rounded flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
        );
    }
  };

  const handlePaymentWithSavedCard = async () => {
    if (!stripe || !defaultCardId) {
      return;
    }

    setIsProcessing(true);
    setSavedCardError(null);

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: defaultCardId,
        }
      );

      if (error) {
        // If saved card fails, show error and allow user to try different card
        setSavedCardError(error.message || 'Payment failed with saved card');
        setUseNewCard(true);
      } else if (paymentIntent?.status === 'requires_capture' || paymentIntent?.status === 'succeeded') {
        onSuccess();
      } else {
        setSavedCardError('Payment was not completed. Please try a different card.');
        setUseNewCard(true);
      }
    } catch (error: any) {
      setSavedCardError(error.message || 'An unexpected error occurred');
      setUseNewCard(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentWithNewCard = async () => {
    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
          },
        }
      );

      if (error) {
        onError(error.message || 'Payment failed');
      } else if (paymentIntent?.status === 'requires_capture' || paymentIntent?.status === 'succeeded') {
        onSuccess();
      } else {
        onError('Payment was not completed. Please try again.');
      }
    } catch (error: any) {
      onError(error.message || 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedCard = savedCards.find(c => c.id === defaultCardId);
  const hasSavedCard = savedCards.length > 0 && defaultCardId && !useNewCard;

  if (loadingCards) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-copper" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-copper" />
          Payment Details
        </CardTitle>
        <CardDescription>
          {hasSavedCard ? 'Confirm payment with your saved card' : 'Complete your booking by entering payment details'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
          <h4 className="font-medium text-foreground mb-3">Order Summary</h4>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fuel</span>
            <span>{fillToFull ? `Fill to Full (~${fuelAmount}L)` : `${fuelAmount}L`} {fuelType.charAt(0).toUpperCase() + fuelType.slice(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Address</span>
            <span className="text-right">{address}, {city}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span>{format(date, 'MMMM d, yyyy')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Window</span>
            <span>{deliveryWindow}</span>
          </div>
          <div className="flex justify-between font-bold text-foreground pt-2 border-t border-border mt-2">
            <span>Total</span>
            <span>${total.toFixed(2)} CAD</span>
          </div>
        </div>

        {/* Saved Card Display */}
        {hasSavedCard && selectedCard && (
          <div className="space-y-3">
            <Label>Payment Method</Label>
            <div className="border border-copper/30 bg-copper/5 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getCardBrandIcon(selectedCard.brand)}
                <div>
                  <p className="font-medium text-foreground">
                    {getCardBrandName(selectedCard.brand)} •••• {selectedCard.last4}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Expires {selectedCard.expMonth.toString().padStart(2, '0')}/{selectedCard.expYear.toString().slice(-2)}
                  </p>
                </div>
              </div>
              <Check className="w-5 h-5 text-copper" />
            </div>
            {savedCardError && (
              <p className="text-sm text-destructive">{savedCardError}</p>
            )}
            <button
              type="button"
              onClick={() => setUseNewCard(true)}
              className="text-sm text-copper hover:text-copper/80 underline"
            >
              Use a different card
            </button>
          </div>
        )}

        {/* New Card Entry */}
        {(!hasSavedCard || useNewCard) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Card Information</Label>
              {savedCards.length > 0 && useNewCard && (
                <button
                  type="button"
                  onClick={() => {
                    setUseNewCard(false);
                    setSavedCardError(null);
                  }}
                  className="text-sm text-copper hover:text-copper/80 underline"
                >
                  Use saved card
                </button>
              )}
            </div>
            <div className="border border-border rounded-lg p-4 bg-background">
              <CardElement
                options={{
                  hidePostalCode: true,
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#1f2937',
                      '::placeholder': {
                        color: '#9ca3af',
                      },
                    },
                    invalid: {
                      color: '#ef4444',
                    },
                  },
                }}
              />
            </div>
          </div>
        )}

        <div className="bg-sage/10 border border-sage/20 rounded-xl p-4 space-y-2 text-sm">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Info className="w-4 h-4 text-sage" />
            How billing works — no surprises:
          </h4>
          <ul className="space-y-1.5 text-muted-foreground text-xs leading-relaxed">
            <li>You can change or cancel your order before your cutoff time<br/><span className="text-xs opacity-75">(Rural: 2h • Household: 3h • Access/PAYG: midnight)</span></li>
            <li>You're only charged after fuel is delivered</li>
            <li>Any charge you see at booking is just a temporary authorization</li>
            <li>Subscriptions can be changed anytime — pricing adjusts fairly</li>
            <li>If roads or weather are unsafe, you won't be charged and we'll reschedule</li>
            <li>Pricing is based on daily pump prices + clear service costs</li>
            <li>GST is shown separately and remitted properly</li>
          </ul>
          <p className="text-xs font-medium text-sage pt-1">Fuel without the hassle. That's the whole point.</p>
        </div>

        <Button
          className="w-full bg-copper hover:bg-copper/90 h-12 text-lg"
          onClick={hasSavedCard ? handlePaymentWithSavedCard : handlePaymentWithNewCard}
          disabled={!stripe || isProcessing || (!hasSavedCard && !elements)}
          data-testid="button-complete-payment"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Processing Payment...
            </>
          ) : (
            <>
              Complete Booking - ${total.toFixed(2)}
              <Check className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Your card will be pre-authorized. Final charge will be based on actual fuel delivered.
        </p>
      </CardContent>
    </Card>
  );
}
