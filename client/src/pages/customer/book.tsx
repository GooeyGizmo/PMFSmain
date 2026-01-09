import { useState } from 'react';
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
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { fuelPrices, deliveryWindows, subscriptionTiers, generateMockVehicles } from '@/lib/mockData';
import { Car, Calendar as CalendarIcon, Clock, MapPin, Fuel, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { format, addDays, isBefore, startOfDay } from 'date-fns';

type Step = 'vehicles' | 'date' | 'window' | 'address' | 'fuel' | 'review';

export default function BookDelivery() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const vehicles = generateMockVehicles(user?.id || '');
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);

  const [step, setStep] = useState<Step>('vehicles');
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [selectedWindow, setSelectedWindow] = useState<string>('');
  const [address, setAddress] = useState(user?.address || '');
  const [city, setCity] = useState(user?.city || '');
  const [fuelType, setFuelType] = useState<'regular' | 'premium' | 'diesel'>('regular');
  const [fuelAmount, setFuelAmount] = useState(50);
  const [fillToFull, setFillToFull] = useState(false);

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

  const nextStep = () => {
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  const prevStep = () => {
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  const calculateTotal = () => {
    const pricePerLitre = fuelPrices[fuelType] - (currentTier?.fuelDiscount || 0);
    const subtotal = fuelAmount * pricePerLitre * selectedVehicles.length;
    const deliveryFee = currentTier?.deliveryFee || 9.99;
    const discount = fuelAmount * (currentTier?.fuelDiscount || 0) * selectedVehicles.length;
    return { subtotal, deliveryFee, discount, total: subtotal + deliveryFee };
  };

  const handleSubmit = () => {
    toast({
      title: 'Delivery Booked!',
      description: `Your fuel delivery is scheduled for ${format(selectedDate!, 'MMMM d')}.`,
    });
    setLocation('/customer/deliveries');
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
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => isBefore(date, startOfDay(new Date()))}
                    className="mx-auto"
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
                  <RadioGroup value={selectedWindow} onValueChange={setSelectedWindow} className="space-y-3">
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
                          <span className="font-medium">{window.label}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            ({window.startTime} - {window.endTime})
                          </span>
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
                  <CardDescription>Where should we deliver?</CardDescription>
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
                      placeholder="Regina, SK"
                      data-testid="input-city"
                    />
                  </div>
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
                        { value: 'regular', label: 'Regular 87 Gas', price: fuelPrices.regular, color: 'text-red-500' },
                        { value: 'premium', label: 'Premium', price: fuelPrices.premium, color: 'text-brass' },
                        { value: 'diesel', label: 'Diesel', price: fuelPrices.diesel, color: 'text-sage' },
                      ].map((fuel) => (
                        <div
                          key={fuel.value}
                          className={`p-4 rounded-xl border-2 cursor-pointer text-center transition-all ${
                            fuelType === fuel.value ? 'border-copper bg-copper/5' : 'border-border hover:border-copper/30'
                          }`}
                          onClick={() => setFuelType(fuel.value as any)}
                        >
                          <p className="font-medium text-foreground">{fuel.label}</p>
                          <p className="text-sm text-muted-foreground">${fuel.price.toFixed(3)}/L</p>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Amount (Litres)</Label>
                      <span className="font-display font-bold text-foreground">{fuelAmount}L</span>
                    </div>
                    <Slider
                      value={[fuelAmount]}
                      onValueChange={([v]) => setFuelAmount(v)}
                      min={10}
                      max={150}
                      step={5}
                      disabled={fillToFull}
                      className="py-4"
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="fillToFull"
                        checked={fillToFull}
                        onCheckedChange={(checked) => setFillToFull(!!checked)}
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
                        {fillToFull ? 'Fill to Full' : `${fuelAmount}L`} {fuelType.charAt(0).toUpperCase() + fuelType.slice(1)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 space-y-2 border-t border-border">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>${calculateTotal().subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Delivery Fee</span>
                      <span>{calculateTotal().deliveryFee === 0 ? 'FREE' : `$${calculateTotal().deliveryFee.toFixed(2)}`}</span>
                    </div>
                    {calculateTotal().discount > 0 && (
                      <div className="flex justify-between text-sm text-sage">
                        <span>Member Discount</span>
                        <span>-${calculateTotal().discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-display font-bold pt-2 border-t border-border">
                      <span>Total</span>
                      <span>${calculateTotal().total.toFixed(2)}</span>
                    </div>
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
