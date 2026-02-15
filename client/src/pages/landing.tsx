import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Fuel, Clock, MapPin, Shield, Truck, ChevronRight, Droplets, Leaf, UserPlus, CalendarCheck, CheckCircle2, Sun, Moon, Smartphone, Apple, Share, PlusSquare, X, Plus, Trash2, Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import heroImage from '@assets/generated_images/prairie_landscape_golden_hour.png';
import serviceAreaMap from '@assets/Screenshot_20260215_101519_Chrome_1771175792378.jpg';

export default function Landing() {
  const [, setLocation] = useLocation();
  const { login, signup, isLoading, user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [activeTab, setActiveTab] = useState('login');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [verificationNeeded, setVerificationNeeded] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  
  // Waitlist overlay state
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistFirstName, setWaitlistFirstName] = useState('');
  const [waitlistLastName, setWaitlistLastName] = useState('');
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistPhone, setWaitlistPhone] = useState('');
  const [waitlistPreferredTier, setWaitlistPreferredTier] = useState('');
  const [waitlistVehicles, setWaitlistVehicles] = useState([{ year: '', make: '', model: '', fuelType: '' }]);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  const { data: appModeData } = useQuery({
    queryKey: ['/api/public/app-mode'],
    queryFn: async () => {
      const res = await fetch('/api/public/app-mode');
      if (!res.ok) return { appMode: 'test', showWaitlist: false, isPreLaunch: false, maintenanceMode: false };
      return res.json();
    },
  });

  const isPreLaunch = appModeData?.showWaitlist || false;

  const addWaitlistVehicle = () => {
    setWaitlistVehicles([...waitlistVehicles, { year: '', make: '', model: '', fuelType: '' }]);
  };

  const removeWaitlistVehicle = (index: number) => {
    if (waitlistVehicles.length > 1) {
      setWaitlistVehicles(waitlistVehicles.filter((_, i) => i !== index));
    }
  };

  const updateWaitlistVehicle = (index: number, field: string, value: string) => {
    const updated = [...waitlistVehicles];
    updated[index] = { ...updated[index], [field]: value };
    setWaitlistVehicles(updated);
  };

  const submitWaitlist = async () => {
    if (!waitlistFirstName || !waitlistLastName || !waitlistEmail) {
      toast({ title: 'Missing info', description: 'Please fill in your name and email.', variant: 'destructive' });
      return;
    }
    const validVehicles = waitlistVehicles.filter(v => v.year && v.make && v.model && v.fuelType);
    if (validVehicles.length === 0) {
      toast({ title: 'Missing vehicle', description: 'Please add at least one vehicle with all fields filled.', variant: 'destructive' });
      return;
    }
    setWaitlistSubmitting(true);
    try {
      const res = await fetch('/api/public/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: waitlistFirstName,
          lastName: waitlistLastName,
          email: waitlistEmail,
          phone: waitlistPhone || null,
          preferredTier: waitlistPreferredTier || null,
          vehicles: validVehicles,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to join waitlist');
      }
      setWaitlistSuccess(true);
      toast({ title: "You're on the list!", description: 'We\'ll notify you when we launch.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  // PWA Install state - must be before any conditional returns
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIOSInstall, setShowIOSInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true); // Default to true to hide buttons until we detect
  const [isIOS, setIsIOS] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  
  // Redirect logged-in users - must be in useEffect to avoid render-phase state updates
  useEffect(() => {
    if (user) {
      // Route based on role
      if (user.role === 'owner') {
        setLocation('/owner');
      } else if (user.role === 'operator') {
        setLocation('/operator');
      } else if (user.role === 'admin') {
        setLocation('/owner'); // Admins go to owner view
      } else {
        setLocation('/app'); // Regular customers
      }
    }
  }, [user, setLocation]);
  
  // Platform detection and install prompt capture - safe for SSR
  useEffect(() => {
    // Platform detection
    const ua = window.navigator?.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);
    
    // Check if already installed as standalone
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
    
    // Capture the beforeinstallprompt event for Android/Chrome
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    
    // Listen for app installed event
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setCanInstall(false);
      setIsStandalone(true);
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);
  
  // If user is logged in, show nothing while redirect happens
  if (user) {
    return null;
  }
  
  const handleAndroidInstall = async () => {
    if (!deferredPrompt) {
      toast({ 
        title: 'Install not available', 
        description: 'Please use Chrome browser to install the app, or it may already be installed.',
        variant: 'destructive' 
      });
      return;
    }
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      toast({ title: 'App installed!', description: 'PMFS has been added to your home screen.' });
      setDeferredPrompt(null);
    }
  };
  
  const handleIOSInstall = () => {
    setShowIOSInstall(true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(loginEmail, loginPassword);
    if (result.success) {
      toast({ title: 'Welcome back!', description: 'Successfully logged in.' });
    } else if (result.needsVerification) {
      setVerificationNeeded(result.email || loginEmail);
      toast({ 
        title: 'Email verification required', 
        description: 'Please check your inbox and verify your email before logging in.',
        variant: 'destructive' 
      });
    } else {
      toast({ title: 'Login failed', description: result.message || 'Invalid email or password.', variant: 'destructive' });
    }
  };

  const handleResendVerification = async () => {
    if (!verificationNeeded) return;
    setResendingVerification(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationNeeded }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Verification email sent!', description: 'Please check your inbox for the verification link.' });
      } else {
        toast({ title: 'Failed to resend', description: data.message || 'Please try again later.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to resend verification email.', variant: 'destructive' });
    } finally {
      setResendingVerification(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim()) {
      toast({ title: 'Name required', description: 'Please enter your name.', variant: 'destructive' });
      return;
    }
    const result = await signup(signupEmail, signupPassword, signupName);
    if (result.success) {
      toast({ title: 'Welcome to Prairie Mobile Fuel Services!', description: 'Your account has been created.' });
    } else {
      toast({ title: 'Signup failed', description: result.message || 'Unable to create account. Please try again.', variant: 'destructive' });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      toast({ title: 'Email required', description: 'Please enter your email address.', variant: 'destructive' });
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setForgotSent(true);
        setResendCooldown(60);
        const interval = setInterval(() => {
          setResendCooldown(prev => {
            if (prev <= 1) { clearInterval(interval); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else {
        toast({ title: 'Error', description: data.message || 'Something went wrong.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Unable to send reset email. Please try again.', variant: 'destructive' });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/pmfs-logo.png" alt="PMFS Logo" className="w-10 h-10 object-contain" />
              <span className="font-display font-bold text-lg text-foreground">Prairie Mobile Fuel Services</span>
            </div>
            <div className="flex items-center gap-4">
              <nav className="hidden md:flex items-center gap-6">
                <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
                <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
                <a 
                  href="#auth" 
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setActiveTab('login')}
                >Sign In</a>
              </nav>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                data-testid="theme-toggle"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src={heroImage} 
            alt="Prairie landscape" 
            className="w-full h-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/50 to-background" />
        </div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-800/80 border border-emerald-700 text-white mb-6">
                <Leaf className="w-4 h-4" />
                <span className="text-sm font-medium">Serving Calgary & Southern Alberta</span>
              </div>
              
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
                Fuel Delivered to
                <br />
                <span className="text-copper">Your Doorstep</span>
              </h1>
              
              <p className="text-lg text-muted-foreground mb-8 max-w-xl">
                Skip the gas station. We deliver premium fuel directly to your vehicle at home, work, or anywhere in the Calgary area. Just park, schedule your delivery, and we handle the rest.
              </p>

              <div className="flex flex-wrap gap-4 mb-10">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Clock className="w-4 h-4 text-brass" />
                  <span>Choose your delivery window</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <MapPin className="w-4 h-4 text-brass" />
                  <span>We come to you</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Shield className="w-4 h-4 text-brass" />
                  <span>Certified & insured</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                {isPreLaunch ? (
                  <Button 
                    size="lg" 
                    className="bg-copper hover:bg-copper/90 text-white font-display font-semibold px-8"
                    onClick={() => setShowWaitlist(true)}
                    data-testid="button-join-waitlist"
                  >
                    Join the Waitlist
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button 
                    size="lg" 
                    className="bg-copper hover:bg-copper/90 text-white font-display font-semibold px-8"
                    onClick={() => {
                      setActiveTab('signup');
                      document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    data-testid="button-get-started"
                  >
                    Get Started Free
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
                
                <Button 
                  size="lg" 
                  variant="outline"
                  className="border-copper text-copper hover:bg-copper/10 font-display font-semibold px-8"
                  onClick={() => {
                    setActiveTab('login');
                    document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  data-testid="button-login-hero"
                >
                  Login
                </Button>
                
                {/* Android Install - only show when beforeinstallprompt captured */}
                {!isStandalone && canInstall && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-prairie-600 text-prairie-700 dark:text-prairie-300 hover:bg-prairie-50 dark:hover:bg-prairie-900/20"
                    onClick={handleAndroidInstall}
                    data-testid="button-install-android"
                  >
                    <Smartphone className="w-4 h-4 mr-2" />
                    Install App
                  </Button>
                )}
                
                {/* iOS Install - only show on iOS devices */}
                {!isStandalone && isIOS && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-prairie-600 text-prairie-700 dark:text-prairie-300 hover:bg-prairie-50 dark:hover:bg-prairie-900/20"
                    onClick={handleIOSInstall}
                    data-testid="button-install-ios"
                  >
                    <Apple className="w-4 h-4 mr-2" />
                    Install App
                  </Button>
                )}
              </div>
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

      <section id="features" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Why Choose <span className="text-copper">Prairie Mobile Fuel?</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Convenient fuel delivery at lowest fuel markups, or cheaper.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Truck,
                title: 'Doorstep Delivery',
                description: 'Premium fuel delivered directly to your vehicle, wherever it\'s parked.',
              },
              {
                icon: Clock,
                title: 'Flexible Scheduling',
                description: 'Choose a 90-minute delivery window that works for your schedule.',
              },
              {
                icon: Droplets,
                title: 'Membership Plans',
                description: 'Save with a membership. Free delivery, priority scheduling, and more.',
              },
              {
                icon: Shield,
                title: 'Safe & Certified',
                description: 'Professionally trained drivers. Fully licensed and insured.',
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="h-full bg-card border-border hover:border-copper/30 transition-colors text-center">
                  <CardContent className="pt-6">
                    <div className="w-14 h-14 rounded-full bg-copper/10 flex items-center justify-center mb-4 mx-auto">
                      <feature.icon className="w-7 h-7 text-copper" />
                    </div>
                    <h3 className="font-display text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              How It Works
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
                icon: CalendarCheck,
                step: '2',
                title: 'Schedule',
                description: 'Choose a 90-minute delivery window. We\'ll text you when we\'re on the way.',
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

      <section id="service-area" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Our <span className="text-copper">Service Area</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We proudly serve Calgary and surrounding communities including Airdrie and Chestermere.
            </p>
          </motion.div>

          <motion.div
            className="relative w-full max-w-5xl mx-auto"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="rounded-2xl overflow-hidden border border-border shadow-2xl bg-card">
              <img
                src={serviceAreaMap}
                alt="Prairie Mobile Fuel service area covering Calgary, Airdrie, Chestermere, and surrounding communities in Alberta"
                className="w-full h-auto object-contain"
                data-testid="img-service-area-map"
                loading="lazy"
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 mt-8">
              {[
                { icon: MapPin, label: 'Calgary & Area' },
                { icon: Truck, label: 'Mobile Delivery' },
                { icon: Clock, label: '90-Min Windows' },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  className="flex items-center gap-2 text-muted-foreground"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                >
                  <item.icon className="w-5 h-5 text-copper" />
                  <span className="text-sm font-medium">{item.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section id="pricing" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose a plan that works for you. Cancel anytime.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: 'Pay As You Go', price: 'Free', fee: '$24.99 delivery', benefit: 'No commitment', vehicles: '1 vehicle', popular: false },
              { name: 'Access', price: '$24.99/mo', fee: '$14.99 delivery', benefit: 'Priority scheduling', vehicles: '1 vehicle', popular: false },
              { name: 'Seniors & Service Members', price: '$39.99/mo', fee: 'FREE delivery', benefit: 'Service members & seniors', vehicles: '4 vehicles', popular: false, extra: 'ID verification required' },
              { name: 'Household', price: '$49.99/mo', fee: 'FREE delivery', benefit: 'Generous household usage', vehicles: '4 vehicles', popular: true },
              { name: 'Rural', price: '$99.99/mo', fee: 'FREE delivery', benefit: 'Fleet ready', vehicles: '10 vehicles', popular: false },
              { name: 'VIP Fuel Concierge', price: '$249.99/mo', fee: 'FREE delivery', benefit: 'Exclusive priority service', vehicles: '25 vehicles', popular: false },
            ].map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={`h-full relative ${plan.popular ? 'border-copper shadow-lg' : 'border-border'}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-copper text-white text-xs font-medium rounded-full">
                      Most Popular
                    </div>
                  )}
                  <CardContent className="pt-8">
                    <h3 className="font-display text-lg font-semibold mb-2">{plan.name}</h3>
                    <div className="font-display text-3xl font-bold text-foreground mb-4">{plan.price}</div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                        {plan.fee}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                        {plan.benefit}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                        Up to {plan.vehicles}
                      </li>
                      {'extra' in plan && plan.extra && (
                        <li className="flex items-center gap-2 text-copper font-medium">
                          <Shield className="w-3.5 h-3.5 shrink-0" />
                          {plan.extra}
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

      <section id="faq" className="py-20 bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground">
              Everything you need to know about mobile fuel delivery
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="areas" className="border border-border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  What areas do you serve?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  We currently serve Calgary and surrounding areas within a 30km radius of the city center. Our RURAL/POWER USER tier extends this to 50km for customers in outlying communities.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="fuel-types" className="border border-border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  What types of fuel do you deliver?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  We deliver regular unleaded (87), and premium (91) gasoline, and diesel fuel.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="scheduling" className="border border-border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  How does scheduling work?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  You choose a 90-minute delivery window that works for you. Just make sure your vehicle is parked in an accessible location with the fuel door facing outward. We'll text you when we're on the way and when we're done.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="safety" className="border border-border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  Is it safe to fuel my vehicle while I'm not there?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  Absolutely. Our drivers are professionally trained and use certified equipment that meets all safety standards. We carry liability insurance and take every precaution to ensure safe deliveries.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="minimum" className="border border-border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  What's the minimum order?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  The minimum order is 40 litres per delivery. This ensures efficient routing and keeps our delivery fees low for all customers.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="cancel" className="border border-border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  Can I cancel or reschedule a delivery?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  Yes, you can cancel or reschedule up to 2 hours before your delivery window at no charge. Changes made within 2 hours may incur a small fee.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="pricing" className="border border-border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  How is pricing determined?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  Our fuel prices are based on daily Calgary market rates plus a small premium for the convenience of mobile delivery. Delivery fees depend on your membership level — Access members get reduced delivery fees, while Household and Rural plans include free delivery.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>
        </div>
      </section>

      <section id="auth" className="py-20">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-bold text-foreground mb-2">Ready to Get Started?</h2>
              <p className="text-muted-foreground">Join Calgary's premier mobile fuel delivery service. Free to sign up.</p>
            </div>
            <Card className="border-border shadow-xl">
              <CardHeader className="text-center">
                <CardTitle className="font-display text-2xl">Get Started</CardTitle>
                <CardDescription>Sign in or create your account</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setShowForgotPassword(false); setForgotSent(false); }}>
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
                    <TabsTrigger value="signup" data-testid="tab-signup">Sign Up</TabsTrigger>
                  </TabsList>
                  
                  <AnimatePresence mode="wait">
                    <TabsContent value="login" key="login">
                      <motion.form 
                        onSubmit={handleLogin}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <Label htmlFor="login-email">Email</Label>
                          <Input
                            id="login-email"
                            type="email"
                            placeholder="you@example.com"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            required
                            data-testid="input-login-email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="login-password">Password</Label>
                          <Input
                            id="login-password"
                            type="password"
                            placeholder="••••••••"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            required
                            data-testid="input-login-password"
                          />
                        </div>
                        {!showForgotPassword && (
                          <>
                            <Button 
                              type="submit" 
                              className="w-full bg-copper hover:bg-copper/90"
                              disabled={isLoading}
                              data-testid="button-login"
                            >
                              {isLoading ? 'Signing in...' : 'Sign In'}
                            </Button>
                            <button
                              type="button"
                              onClick={() => { setShowForgotPassword(true); setForgotEmail(loginEmail); }}
                              className="w-full text-center text-sm text-muted-foreground hover:text-copper transition-colors mt-2"
                              data-testid="link-forgot-password"
                            >
                              Forgot your password?
                            </button>
                          </>
                        )}
                        
                        {verificationNeeded && !showForgotPassword && (
                          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                              Please verify your email address before logging in. Check your inbox for the verification link.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleResendVerification}
                              disabled={resendingVerification}
                              className="w-full border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/50"
                              data-testid="button-resend-verification"
                            >
                              {resendingVerification ? 'Sending...' : 'Resend Verification Email'}
                            </Button>
                          </div>
                        )}
                      </motion.form>

                      {showForgotPassword && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-4 p-4 border border-border rounded-lg bg-muted/30"
                        >
                          {!forgotSent ? (
                            <form onSubmit={handleForgotPassword} className="space-y-3">
                              <p className="text-sm text-foreground font-medium">Reset your password</p>
                              <p className="text-xs text-muted-foreground">Enter your email and we'll send you a link to reset your password.</p>
                              <Input
                                type="email"
                                placeholder="you@example.com"
                                value={forgotEmail}
                                onChange={(e) => setForgotEmail(e.target.value)}
                                required
                                data-testid="input-forgot-email"
                              />
                              <div className="flex gap-2">
                                <Button 
                                  type="submit" 
                                  className="flex-1 bg-copper hover:bg-copper/90"
                                  disabled={forgotLoading}
                                  data-testid="button-send-reset"
                                >
                                  {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                                </Button>
                                <Button 
                                  type="button" 
                                  variant="outline"
                                  onClick={() => setShowForgotPassword(false)}
                                  data-testid="button-cancel-forgot"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <div className="space-y-3 text-center">
                              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center mx-auto">
                                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              </div>
                              <p className="text-sm font-medium text-foreground">Check your email</p>
                              <p className="text-xs text-muted-foreground">
                                If an account exists for <strong>{forgotEmail}</strong>, we've sent a password reset link. The link expires in 1 hour.
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="flex-1"
                                  disabled={resendCooldown > 0 || forgotLoading}
                                  onClick={handleForgotPassword as any}
                                  data-testid="button-resend-reset"
                                >
                                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Email'}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setShowForgotPassword(false); setForgotSent(false); }}
                                  data-testid="button-back-to-login"
                                >
                                  Back to Sign In
                                </Button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </TabsContent>
                    
                    <TabsContent value="signup" key="signup">
                      <motion.form 
                        onSubmit={handleSignup}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <Label htmlFor="signup-name">Full Name</Label>
                          <Input
                            id="signup-name"
                            type="text"
                            placeholder="John Doe"
                            value={signupName}
                            onChange={(e) => setSignupName(e.target.value)}
                            required
                            data-testid="input-signup-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-email">Email</Label>
                          <Input
                            id="signup-email"
                            type="email"
                            placeholder="you@example.com"
                            value={signupEmail}
                            onChange={(e) => setSignupEmail(e.target.value)}
                            required
                            data-testid="input-signup-email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-password">Password</Label>
                          <Input
                            id="signup-password"
                            type="password"
                            placeholder="••••••••"
                            value={signupPassword}
                            onChange={(e) => setSignupPassword(e.target.value)}
                            required
                            minLength={6}
                            data-testid="input-signup-password"
                          />
                        </div>
                        <Button 
                          type="submit" 
                          className="w-full bg-copper hover:bg-copper/90"
                          disabled={isLoading}
                          data-testid="button-signup"
                        >
                          {isLoading ? 'Creating account...' : 'Create Account'}
                        </Button>
                      </motion.form>
                    </TabsContent>
                    
                  </AnimatePresence>
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center">
              <img src="/pmfs-logo.png" alt="PMFS Logo" className="w-8 h-8 object-contain" />
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Prairie Mobile Fuel Services. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
      
      {/* iOS Install Instructions Dialog */}
      <Dialog open={showIOSInstall} onOpenChange={setShowIOSInstall}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Apple className="w-5 h-5" />
              Install PMFS on iOS
            </DialogTitle>
            <DialogDescription>
              Follow these steps to add the app to your home screen
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-prairie-100 dark:bg-prairie-900 text-prairie-700 dark:text-prairie-300 font-bold shrink-0">
                1
              </div>
              <div>
                <p className="font-medium text-foreground">Tap the Share button</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Look for the <Share className="w-4 h-4 inline mx-1" /> share icon at the bottom of Safari
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-prairie-100 dark:bg-prairie-900 text-prairie-700 dark:text-prairie-300 font-bold shrink-0">
                2
              </div>
              <div>
                <p className="font-medium text-foreground">Scroll and tap "Add to Home Screen"</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Look for the <PlusSquare className="w-4 h-4 inline mx-1" /> Add to Home Screen option
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-prairie-100 dark:bg-prairie-900 text-prairie-700 dark:text-prairie-300 font-bold shrink-0">
                3
              </div>
              <div>
                <p className="font-medium text-foreground">Tap "Add" to confirm</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The app will appear on your home screen like a native app
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowIOSInstall(false)} className="bg-copper hover:bg-copper/90">
              Got it!
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Waitlist Overlay */}
      <AnimatePresence>
        {showWaitlist && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm overflow-y-auto"
          >
            <button
              onClick={() => { setShowWaitlist(false); setWaitlistSuccess(false); }}
              className="fixed top-4 right-4 z-[101] p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
              data-testid="button-close-waitlist"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <div className="text-center mb-10">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-copper/10 text-copper text-sm font-medium mb-4">
                    <Fuel className="w-4 h-4" />
                    Coming Soon to Calgary
                  </div>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
                    Join the Waitlist
                  </h1>
                  <p className="text-muted-foreground max-w-xl mx-auto">
                    Be the first to know when Prairie Mobile Fuel Services launches. Sign up below and we'll notify you when we're ready to start delivering.
                  </p>
                </div>
              </motion.div>

              <div className="grid lg:grid-cols-2 gap-8">
                {/* Left: Form */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  {waitlistSuccess ? (
                    <Card className="border-sage/30">
                      <CardContent className="pt-8 pb-8 text-center">
                        <div className="w-16 h-16 rounded-full bg-sage/10 flex items-center justify-center mx-auto mb-4">
                          <CheckCircle2 className="w-8 h-8 text-sage" />
                        </div>
                        <h3 className="font-display text-xl font-semibold mb-2">You're on the list!</h3>
                        <p className="text-muted-foreground mb-6">
                          We'll reach out as soon as we're ready to launch. Thank you for your interest!
                        </p>
                        <Button 
                          variant="outline" 
                          onClick={() => { setShowWaitlist(false); setWaitlistSuccess(false); }}
                          data-testid="button-waitlist-done"
                        >
                          Back to Home
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle className="font-display">Your Information</CardTitle>
                        <CardDescription>Tell us about yourself and your vehicles</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="wl-first">First Name *</Label>
                            <Input id="wl-first" value={waitlistFirstName} onChange={(e) => setWaitlistFirstName(e.target.value)} placeholder="First name" data-testid="input-waitlist-first-name" />
                          </div>
                          <div>
                            <Label htmlFor="wl-last">Last Name *</Label>
                            <Input id="wl-last" value={waitlistLastName} onChange={(e) => setWaitlistLastName(e.target.value)} placeholder="Last name" data-testid="input-waitlist-last-name" />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="wl-email">Email *</Label>
                          <Input id="wl-email" type="email" value={waitlistEmail} onChange={(e) => setWaitlistEmail(e.target.value)} placeholder="your@email.com" data-testid="input-waitlist-email" />
                        </div>
                        <div>
                          <Label htmlFor="wl-phone">Phone (optional)</Label>
                          <Input id="wl-phone" type="tel" value={waitlistPhone} onChange={(e) => setWaitlistPhone(e.target.value)} placeholder="(403) 555-1234" data-testid="input-waitlist-phone" />
                        </div>

                        <div>
                          <Label htmlFor="wl-tier">Which membership interests you? (optional)</Label>
                          <Select value={waitlistPreferredTier} onValueChange={setWaitlistPreferredTier}>
                            <SelectTrigger id="wl-tier" data-testid="select-waitlist-tier">
                              <SelectValue placeholder="Select a tier" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="payg">Pay As You Go — $0/mo</SelectItem>
                              <SelectItem value="access">Access — $24.99/mo</SelectItem>
                              <SelectItem value="heroes">Seniors & Service Members — $39.99/mo</SelectItem>
                              <SelectItem value="household">Household — $49.99/mo</SelectItem>
                              <SelectItem value="rural">Rural — $99.99/mo</SelectItem>
                              <SelectItem value="vip">VIP Fuel Concierge — $249.99/mo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="pt-2">
                          <div className="flex items-center justify-between mb-3">
                            <Label className="text-base font-semibold">Your Vehicles</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addWaitlistVehicle} data-testid="button-add-vehicle">
                              <Plus className="w-3.5 h-3.5 mr-1" /> Add Vehicle
                            </Button>
                          </div>
                          
                          {waitlistVehicles.map((vehicle, i) => (
                            <div key={i} className="border rounded-lg p-3 mb-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-muted-foreground">Vehicle {i + 1}</span>
                                {waitlistVehicles.length > 1 && (
                                  <button onClick={() => removeWaitlistVehicle(i)} className="text-muted-foreground hover:text-destructive transition-colors" data-testid={`button-remove-vehicle-${i}`}>
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Input placeholder="Year" value={vehicle.year} onChange={(e) => updateWaitlistVehicle(i, 'year', e.target.value)} data-testid={`input-vehicle-year-${i}`} />
                                <Input placeholder="Make" value={vehicle.make} onChange={(e) => updateWaitlistVehicle(i, 'make', e.target.value)} data-testid={`input-vehicle-make-${i}`} />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Input placeholder="Model" value={vehicle.model} onChange={(e) => updateWaitlistVehicle(i, 'model', e.target.value)} data-testid={`input-vehicle-model-${i}`} />
                                <Select value={vehicle.fuelType} onValueChange={(val) => updateWaitlistVehicle(i, 'fuelType', val)}>
                                  <SelectTrigger data-testid={`select-vehicle-fuel-${i}`}>
                                    <SelectValue placeholder="Fuel type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="regular">Regular</SelectItem>
                                    <SelectItem value="premium">Premium</SelectItem>
                                    <SelectItem value="diesel">Diesel</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          ))}
                        </div>

                        <Button 
                          className="w-full bg-copper hover:bg-copper/90 text-white font-display font-semibold"
                          onClick={submitWaitlist}
                          disabled={waitlistSubmitting}
                          data-testid="button-submit-waitlist"
                        >
                          {waitlistSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            'Join the Waitlist'
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </motion.div>

                {/* Right: Info about the service */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-6">
                  {/* How It Works */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="font-display text-lg">How It Works</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-copper/10 flex items-center justify-center shrink-0">
                          <span className="text-copper font-bold text-sm">1</span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">Choose Your Membership</p>
                          <p className="text-xs text-muted-foreground">Pick the level that fits your needs, from Pay As You Go to VIP.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-copper/10 flex items-center justify-center shrink-0">
                          <span className="text-copper font-bold text-sm">2</span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">Schedule a Delivery</p>
                          <p className="text-xs text-muted-foreground">Pick a delivery window, add your vehicle(s), and confirm.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-copper/10 flex items-center justify-center shrink-0">
                          <span className="text-copper font-bold text-sm">3</span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">We Come to You</p>
                          <p className="text-xs text-muted-foreground">Our certified truck arrives at your location and fills your vehicle. No gas station needed.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-copper/10 flex items-center justify-center shrink-0">
                          <span className="text-copper font-bold text-sm">4</span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">Pay Only for What You Get</p>
                          <p className="text-xs text-muted-foreground">You're charged for actual litres delivered. Transparent pricing, no surprises.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Membership Tiers */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="font-display text-lg">Membership Levels</CardTitle>
                      <CardDescription>Choose a level when we launch</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {[
                          { name: 'Pay As You Go', price: 'Free', detail: '1 vehicle, $24.99 delivery fee' },
                          { name: 'Access', price: '$24.99/mo', detail: '1 vehicle, $14.99 delivery fee' },
                          { name: 'Seniors & Service Members', price: '$39.99/mo', detail: '4 vehicles, FREE delivery — ID verification required' },
                          { name: 'Household', price: '$49.99/mo', detail: '4 vehicles, FREE delivery' },
                          { name: 'Rural', price: '$99.99/mo', detail: '10 vehicles, FREE delivery' },
                          { name: 'VIP Fuel Concierge', price: '$249.99/mo', detail: '25 vehicles, FREE delivery, priority scheduling' },
                        ].map((tier) => (
                          <div key={tier.name} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div>
                              <p className="font-medium text-sm">{tier.name}</p>
                              <p className="text-xs text-muted-foreground">{tier.detail}</p>
                            </div>
                            <span className="text-sm font-semibold text-copper whitespace-nowrap">{tier.price}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Why PMFS */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="font-display text-lg">Why Prairie Mobile Fuel?</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {[
                          'Skip the gas station entirely',
                          'Certified, insured, and TDG-compliant',
                          'Transparent per-litre pricing',
                          'Regular, Premium & Diesel available',
                          'Serving the Calgary area',
                          'Recurring deliveries available',
                        ].map((item, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-sage shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
