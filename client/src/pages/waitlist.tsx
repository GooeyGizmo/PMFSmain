import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Fuel, Clock, MapPin, Shield, Truck, ChevronRight, Droplets, UserPlus, CheckCircle2, Plus, X, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import heroImage from '@assets/generated_images/prairie_landscape_golden_hour.png';

interface VehicleEntry {
  year: string;
  make: string;
  model: string;
  fuelType: string;
}

const tiers = [
  { value: 'payg', name: 'Pay As You Go', price: '$0/mo', vehicles: '1 vehicle', delivery: '$24.99/delivery', popular: false },
  { value: 'access', name: 'Access', price: '$24.99/mo', vehicles: '1 vehicle', delivery: '$14.99/delivery', popular: false },
  { value: 'heroes', name: 'Seniors & Service Members', price: '$34.99/mo', vehicles: '4 vehicles', delivery: 'FREE delivery', popular: false, note: 'ID verification required' },
  { value: 'household', name: 'Household', price: '$49.99/mo', vehicles: '4 vehicles', delivery: 'FREE delivery', popular: true },
  { value: 'rural', name: 'Rural', price: '$99.99/mo', vehicles: '10 vehicles', delivery: 'FREE delivery', popular: false },
  { value: 'vip', name: 'VIP Fuel Concierge', price: '$249.99/mo', vehicles: '25 vehicles', delivery: 'FREE delivery', popular: false },
];

export default function WaitlistPage() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedTier, setSelectedTier] = useState('');
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([]);
  const [caslConsent, setCaslConsent] = useState(false);
  const [successPosition, setSuccessPosition] = useState<number | null>(null);

  const waitlistMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest('POST', '/api/waitlist', data);
      return await res.json();
    },
    onSuccess: (data) => {
      setSuccessPosition(data.positionNumber || 1);
    },
    onError: (error: Error) => {
      toast({
        title: 'Submission failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: 'Email required', description: 'Please enter your email address.', variant: 'destructive' });
      return;
    }
    if (!caslConsent) {
      toast({ title: 'Consent required', description: 'Please agree to receive communications.', variant: 'destructive' });
      return;
    }
    waitlistMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      interestedTier: selectedTier || null,
      vehicles: JSON.stringify(vehicles),
      caslConsent,
    });
  };

  const addVehicle = () => {
    if (vehicles.length >= 10) return;
    setVehicles([...vehicles, { year: '', make: '', model: '', fuelType: 'regular' }]);
  };

  const removeVehicle = (index: number) => {
    setVehicles(vehicles.filter((_, i) => i !== index));
  };

  const updateVehicle = (index: number, field: keyof VehicleEntry, value: string) => {
    const updated = [...vehicles];
    updated[index] = { ...updated[index], [field]: value };
    setVehicles(updated);
  };

  if (successPosition !== null) {
    return (
      <div className="min-h-screen bg-background">
        <div className="absolute inset-0 z-0">
          <img src={heroImage} alt="Prairie landscape" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-md"
          >
            <div className="w-20 h-20 rounded-full bg-copper/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-copper" data-testid="icon-success" />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4" data-testid="text-success-title">
              You're on the list!
            </h1>
            <p className="text-lg text-muted-foreground mb-2">
              Thank you for joining the Prairie Mobile Fuel Services waitlist.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-copper/10 border border-copper/30 mb-6">
              <span className="text-sm text-muted-foreground">Your position:</span>
              <span className="font-display font-bold text-2xl text-copper" data-testid="text-waitlist-position">#{successPosition}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              We'll send you updates as we get closer to launch. Stay tuned!
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/pmfs-logo-full.png" alt="PMFS Logo" className="h-10 object-contain" />
            </div>
            <div className="flex items-center gap-4">
              <nav className="hidden md:flex items-center gap-6">
                <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
                <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
                <a href="#waitlist-form" className="text-sm font-medium text-copper hover:text-copper/80 transition-colors">Join Waitlist</a>
              </nav>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                data-testid="button-theme-toggle"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={heroImage} alt="Prairie landscape at golden hour" className="w-full h-full object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/50 to-background" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-copper/10 border border-copper/30 text-copper mb-6">
                <Fuel className="w-4 h-4" />
                <span className="text-sm font-medium" data-testid="badge-launching-soon">Launching Soon</span>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-4" data-testid="text-hero-title">
                Prairie Mobile
                <br />
                <span className="text-copper">Fuel Services</span>
              </h1>

              <p className="text-xl text-muted-foreground mb-3 font-display" data-testid="text-hero-tagline">
                Calgary's First Mobile Fuel Delivery Service
              </p>

              <p className="text-lg text-muted-foreground mb-8 max-w-xl">
                Be the first to know when we launch. Join our waitlist and never visit a gas station again.
              </p>

              <div className="flex flex-wrap gap-4 mb-10">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Clock className="w-4 h-4 text-copper" />
                  <span>Choose your delivery window</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <MapPin className="w-4 h-4 text-copper" />
                  <span>We come to you</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Shield className="w-4 h-4 text-copper" />
                  <span>Certified & insured</span>
                </div>
              </div>

              <Button
                size="lg"
                className="bg-copper hover:bg-copper/90 text-white font-display font-semibold px-8"
                onClick={() => document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })}
                data-testid="button-join-waitlist-hero"
              >
                Join the Waitlist
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="hidden md:flex items-center justify-end"
            >
              <motion.img
                src="/pmfs-logo-full.png"
                alt="Prairie Mobile Fuel Services"
                className="w-72 lg:w-80 xl:w-[420px] drop-shadow-2xl"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.3 }}
              />
            </motion.div>
          </div>
        </div>
      </section>

      <section id="waitlist-form" className="py-20 bg-muted/30">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Be the <span className="text-copper">First to Know</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Join our waitlist and we'll notify you as soon as we're ready to fuel up Calgary.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-copper/20">
              <CardHeader>
                <CardTitle className="font-display text-xl">Join the Waitlist</CardTitle>
                <CardDescription>Fill out the form below and secure your spot.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        placeholder="First name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        data-testid="input-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        placeholder="Last name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      data-testid="input-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(403) 555-0123"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      data-testid="input-phone"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tier">Interested Membership Tier</Label>
                    <Select value={selectedTier} onValueChange={setSelectedTier}>
                      <SelectTrigger data-testid="select-tier">
                        <SelectValue placeholder="Select a tier..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tiers.map((tier) => (
                          <SelectItem key={tier.value} value={tier.value} data-testid={`select-tier-${tier.value}`}>
                            {tier.name} — {tier.price}, {tier.vehicles}, {tier.delivery}{'note' in tier && tier.note ? ` (${tier.note})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-display">Add Your Vehicles</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addVehicle}
                        disabled={vehicles.length >= 10}
                        data-testid="button-add-vehicle"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Vehicle
                      </Button>
                    </div>

                    {vehicles.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                        No vehicles added yet. Click "Add Vehicle" to get started.
                      </p>
                    )}

                    {vehicles.map((vehicle, index) => (
                      <Card key={index} className="relative">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-7 w-7"
                          onClick={() => removeVehicle(index)}
                          data-testid={`button-remove-vehicle-${index}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <CardContent className="pt-4 pb-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Year</Label>
                              <Input
                                placeholder="2024"
                                value={vehicle.year}
                                onChange={(e) => updateVehicle(index, 'year', e.target.value)}
                                data-testid={`input-vehicle-year-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Make</Label>
                              <Input
                                placeholder="Toyota"
                                value={vehicle.make}
                                onChange={(e) => updateVehicle(index, 'make', e.target.value)}
                                data-testid={`input-vehicle-make-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Model</Label>
                              <Input
                                placeholder="Camry"
                                value={vehicle.model}
                                onChange={(e) => updateVehicle(index, 'model', e.target.value)}
                                data-testid={`input-vehicle-model-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Fuel Type</Label>
                              <Select
                                value={vehicle.fuelType}
                                onValueChange={(val) => updateVehicle(index, 'fuelType', val)}
                              >
                                <SelectTrigger data-testid={`select-vehicle-fuel-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="regular">Regular</SelectItem>
                                  <SelectItem value="midgrade">Mid-Grade</SelectItem>
                                  <SelectItem value="premium">Premium</SelectItem>
                                  <SelectItem value="diesel">Diesel</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="casl"
                      checked={caslConsent}
                      onCheckedChange={(checked) => setCaslConsent(checked === true)}
                      data-testid="checkbox-casl-consent"
                    />
                    <Label htmlFor="casl" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                      I consent to receive communications from Prairie Mobile Fuel Services about my waitlist status and service updates. You can unsubscribe at any time.
                    </Label>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-copper hover:bg-copper/90 text-white font-display font-semibold"
                    disabled={waitlistMutation.isPending}
                    data-testid="button-submit-waitlist"
                  >
                    {waitlistMutation.isPending ? 'Joining...' : 'Join the Waitlist'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      <section id="how-it-works" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              How It <span className="text-copper">Works</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Getting fuel delivered is simple. Three easy steps to a full tank.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: UserPlus,
                step: '1',
                title: 'Sign Up',
                description: 'Create your free account in seconds. Add your vehicles and delivery location.',
              },
              {
                icon: Truck,
                step: '2',
                title: 'Schedule',
                description: "Choose a 90-minute delivery window. We'll text you when we're on the way.",
              },
              {
                icon: CheckCircle2,
                step: '3',
                title: 'Get Fueled',
                description: 'Park with fuel door facing out. We fill your tank while you go about your day.',
              },
            ].map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="text-center"
              >
                <div className="relative inline-flex items-center justify-center mb-6">
                  <div className="w-20 h-20 rounded-full bg-copper/10 flex items-center justify-center">
                    <step.icon className="w-10 h-10 text-copper" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-copper text-white font-display font-bold flex items-center justify-center text-sm">
                    {step.step}
                  </div>
                </div>
                <h3 className="font-display text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Membership <span className="text-copper">Tiers</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose a plan that works for you. From pay-as-you-go to VIP concierge.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tiers.map((tier, i) => (
              <motion.div
                key={tier.value}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={`h-full relative ${tier.popular ? 'border-copper shadow-lg' : 'border-border'}`} data-testid={`card-tier-${tier.value}`}>
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-copper text-white text-xs font-medium rounded-full">
                      Most Popular
                    </div>
                  )}
                  <CardContent className="pt-8">
                    <h3 className="font-display text-lg font-semibold mb-2">{tier.name}</h3>
                    <div className="font-display text-3xl font-bold text-foreground mb-4">{tier.price}</div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Droplets className="w-3.5 h-3.5 text-copper" />
                        {tier.delivery}
                      </li>
                      <li className="flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 text-copper" />
                        Up to {tier.vehicles}
                      </li>
                      {'note' in tier && tier.note && (
                        <li className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium">
                          <Shield className="w-3.5 h-3.5" />
                          {tier.note}
                        </li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/pmfs-logo-full.png" alt="PMFS" className="h-8 object-contain" />
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Prairie Mobile Fuel Services. Calgary, Alberta.
              </p>
            </div>
            <div>
              <a
                href="/login"
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                data-testid="link-staff-login"
              >
                Staff Login
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
