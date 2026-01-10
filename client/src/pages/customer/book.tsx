import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
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
import { deliveryWindows, subscriptionTiers } from '@/lib/mockData';
import { Car, Calendar as CalendarIcon, Clock, MapPin, Fuel, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { format, addDays, isBefore, startOfDay, setHours } from 'date-fns';

type Step = 'vehicles' | 'date' | 'window' | 'address' | 'fuel' | 'review';

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
  const [fuelAmount, setFuelAmount] = useState(50);
  const [fillToFull, setFillToFull] = useState(false);

  // Initialize address from user's default address
  useEffect(() => {
    if (user?.defaultAddress && !address) {
      setAddress(user.defaultAddress);
    }
    if (user?.defaultCity && !city) {
      setCity(user.defaultCity);
    }
  }, [user?.defaultAddress, user?.defaultCity]);

  const steps: Step[] = ['vehicles', 'date', 'window', 'address', 'fuel', 'review'];
  const currentStepIndex = steps.indexOf(step);

  const toggleVehicle = (vehicleId: string) => {
    const maxVehicles = currentTier?.maxVehicles || 1;
    if (selectedVehicles.includes(vehicleId)) {
      setSelectedVehicles(prev => prev.filter(id => id !== vehicleId));
    } else if (selectedVehicles.length < maxVehicles) {
      setSelectedVehicles(prev => [...prev, vehicleId]);
    } else {
      toast({ title: 'Vehicle limit reached', description: `Your plan allows up to ${maxVehicles} vehicles per order.`, variant: 'destructive' });
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'vehicles': return selectedVehicles.length > 0;
      case 'date': return !!selectedDate;
      case 'window': return !!selectedWindow;
      case 'address': return address.trim() && city.trim();
      case 'fuel': return fuelAmount > 0 || fillToFull;
      default: return true;
    }
  };

  const nextStep = async () => {
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

  const calculateTotal = () => {
    const litres = getEffectiveLitres();
    const basePrice = getFuelPrice(fuelType);
    const tierDiscount = currentTier?.fuelDiscount || 0;
    const pricePerLitre = basePrice;
    const deliveryFee = currentTier?.deliveryFee || 19.99;
    
    const fuelCost = litres * pricePerLitre * selectedVehicles.length;
    const discountTotal = litres * tierDiscount * selectedVehicles.length;
    const subtotal = fuelCost - discountTotal + deliveryFee;
    const gstAmount = subtotal * GST_RATE;
    const total = subtotal + gstAmount;
    
    return { 
      subtotal, 
      deliveryFee, 
      discount: discountTotal, 
      gstAmount,
      total, 
      pricePerLitre,
      litres 
    };
  };

  const handleSubmit = async () => {
    if (!selectedDate) return;

    const window = deliveryWindows.find(w => w.id === selectedWindow);
    if (!window) return;

    const { deliveryFee, total, pricePerLitre, litres, subtotal, gstAmount } = calculateTotal();

    try {
      for (const vehicleId of selectedVehicles) {
        await createOrder({
          vehicleId,
          address,
          city,
          scheduledDate: setHours(selectedDate, parseInt(window.startTime)),
          deliveryWindow: window.label,
          fuelType,
          fuelAmount: litres,
          fillToFull,
          pricePerLitre: pricePerLitre.toString(),
          deliveryFee: deliveryFee.toString(),
          subtotal: (subtotal / selectedVehicles.length).toString(),
          gstAmount: (gstAmount / selectedVehicles.length).toString(),
          total: (total / selectedVehicles.length).toString(),
          tierDiscount: (currentTier?.fuelDiscount || 0).toString(),
          status: 'scheduled',
          notes: null,
        });
      }

      toast({
        title: 'Delivery Booked!',
        description: `Your fuel delivery is scheduled for ${format(selectedDate, 'MMMM d')}.`,
      });
      setLocation('/customer/deliveries');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to book delivery. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <CustomerLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground">Book Delivery</h1>
          <p className="text-muted-foreground mt-1">Schedule your fuel delivery</p>
        </div>

        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  i < currentStepIndex
                    ? 'bg-copper text-white'
                    : i === currentStepIndex
                    ? 'bg-copper text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < currentStepIndex ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 ${i < currentStepIndex ? 'bg-copper' : 'bg-muted'}`} />
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
                <CardContent className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => isBefore(date, startOfDay(new Date()))}
                    className="w-full max-w-sm p-0 [&_table]:w-full [&_td]:p-1 [&_th]:p-1 [&_button]:h-12 [&_button]:w-full [&_button]:text-base [&_.rdp-head_cell]:text-sm [&_.rdp-caption]:text-lg [&_.rdp-caption]:py-3 [&_.rdp-nav_button]:h-10 [&_.rdp-nav_button]:w-10"
                  />
                </CardContent>
              </Card>
            )}

            {step === 'window' && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Clock className="w-5 h-5 text-copper" />
                    Delivery Window
                  </CardTitle>
                  <CardDescription>Select a time window for {format(selectedDate!, 'MMMM d')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={selectedWindow} onValueChange={setSelectedWindow} className="grid grid-cols-2 gap-3">
                    {deliveryWindows.filter(w => w.active).map((window) => (
                      <div
                        key={window.id}
                        className={`flex items-center space-x-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedWindow === window.id ? 'border-copper bg-copper/5' : 'border-border hover:border-copper/30'
                        }`}
                        onClick={() => setSelectedWindow(window.id)}
                      >
                        <RadioGroupItem value={window.id} id={window.id} />
                        <Label htmlFor={window.id} className="flex-1 cursor-pointer">
                          <span className="font-medium text-sm">{window.label}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
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
                  <CardDescription>Choose fuel type and amount</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Fuel Type</Label>
                    <RadioGroup value={fuelType} onValueChange={(v) => setFuelType(v as any)} className="grid grid-cols-3 gap-3">
                      {[
                        { value: 'regular' as const, label: 'Regular 87 Gas', color: 'text-red-500' },
                        { value: 'premium' as const, label: 'Premium', color: 'text-brass' },
                        { value: 'diesel' as const, label: 'Diesel', color: 'text-sage' },
                      ].map((fuel) => (
                        <div
                          key={fuel.value}
                          className={`p-4 rounded-xl border-2 cursor-pointer text-center transition-all ${
                            fuelType === fuel.value ? 'border-copper bg-copper/5' : 'border-border hover:border-copper/30'
                          }`}
                          onClick={() => setFuelType(fuel.value)}
                        >
                          <p className="font-medium text-foreground">{fuel.label}</p>
                          <p className="text-sm text-muted-foreground">${getFuelPrice(fuel.value).toFixed(4)}/L</p>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="fuelAmount">Amount (Litres)</Label>
                    <Input
                      id="fuelAmount"
                      type="number"
                      min={10}
                      max={500}
                      value={fillToFull ? FILL_TO_FULL_LITRES : fuelAmount}
                      onChange={(e) => setFuelAmount(Math.max(10, parseInt(e.target.value) || 10))}
                      disabled={fillToFull}
                      placeholder="Enter litres"
                      className="text-lg font-medium"
                      data-testid="input-fuel-amount"
                    />
                    <p className="text-sm text-muted-foreground">
                      {fillToFull 
                        ? 'Pre-authorization based on ~150L. Final charge based on actual litres delivered.'
                        : `Minimum ${currentTier?.minOrder || 50} litres`
                      }
                    </p>
                    <div className="flex items-center gap-2 pt-2">
                      <Checkbox
                        id="fillToFull"
                        checked={fillToFull}
                        onCheckedChange={(checked) => setFillToFull(!!checked)}
                        data-testid="checkbox-fill-to-full"
                      />
                      <Label htmlFor="fillToFull" className="text-sm cursor-pointer">
                        Fill to full (driver will fill tank completely)
                      </Label>
                    </div>
                  </div>
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
                      <span className="text-muted-foreground">Vehicles</span>
                      <span className="font-medium">{selectedVehicles.length} selected</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-medium">{format(selectedDate!, 'EEEE, MMMM d, yyyy')}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Window</span>
                      <span className="font-medium">
                        {deliveryWindows.find(w => w.id === selectedWindow)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Address</span>
                      <span className="font-medium text-right">{address}, {city}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Fuel</span>
                      <span className="font-medium">
                        {fillToFull ? `Fill to Full (~${FILL_TO_FULL_LITRES}L)` : `${fuelAmount}L`} {fuelType.charAt(0).toUpperCase() + fuelType.slice(1)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 space-y-2 border-t border-border">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Fuel ({calculateTotal().litres}L × ${calculateTotal().pricePerLitre.toFixed(4)}/L)</span>
                      <span>${(calculateTotal().litres * calculateTotal().pricePerLitre * selectedVehicles.length).toFixed(2)}</span>
                    </div>
                    {calculateTotal().discount > 0 && (
                      <div className="flex justify-between text-sm text-sage">
                        <span>Member Discount (-${(currentTier?.fuelDiscount || 0).toFixed(2)}/L)</span>
                        <span>-${calculateTotal().discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Delivery Fee</span>
                      <span>{calculateTotal().deliveryFee === 0 ? 'FREE' : `$${calculateTotal().deliveryFee.toFixed(2)}`}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">GST (5%)</span>
                      <span>${calculateTotal().gstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-display font-bold pt-2 border-t border-border">
                      <span>Total</span>
                      <span>${calculateTotal().total.toFixed(2)}</span>
                    </div>
                    {fillToFull && (
                      <p className="text-xs text-muted-foreground pt-2">
                        * Fill to Full estimate based on ~150L. Final charge will be based on actual litres delivered.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>

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
              data-testid="button-confirm-booking"
            >
              Confirm Booking
              <Check className="w-4 h-4 ml-2" />
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
      </div>
    </CustomerLayout>
  );
}
