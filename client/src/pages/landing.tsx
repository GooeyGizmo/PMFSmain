import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Fuel, Clock, MapPin, Shield, Truck, ChevronRight, Droplets, Leaf } from 'lucide-react';
import heroImage from '@assets/generated_images/prairie_landscape_golden_hour.png';

export default function Landing() {
  const [, setLocation] = useLocation();
  const { login, signup, isLoading, user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [activeTab, setActiveTab] = useState('login');

  if (user) {
    setLocation(isAdmin ? '/ops' : '/customer');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(loginEmail, loginPassword);
    if (success) {
      toast({ title: 'Welcome back!', description: 'Successfully logged in.' });
    } else {
      toast({ title: 'Login failed', description: 'Invalid email or password.', variant: 'destructive' });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim()) {
      toast({ title: 'Name required', description: 'Please enter your name.', variant: 'destructive' });
      return;
    }
    const success = await signup(signupEmail, signupPassword, signupName);
    if (success) {
      toast({ title: 'Welcome to Prairie Mobile Fuel Services!', description: 'Your account has been created.' });
    } else {
      toast({ title: 'Signup failed', description: 'An account with this email already exists.', variant: 'destructive' });
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
            <nav className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
              <a href="#auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign In</a>
            </nav>
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
          <div className="grid lg:grid-cols-2 gap-12 items-center">
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
                Skip the Pump.
                <br />
                <span className="text-copper">We Bring the Fuel.</span>
              </h1>
              
              <p className="text-lg text-muted-foreground mb-8 max-w-xl">
                On-demand fuel delivery to your home, farm, or fleet. Save time, stay productive, and never wait at a gas station again.
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
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col items-center gap-8"
            >
              <motion.img 
                src="/pmfs-logo-full.png" 
                alt="Prairie Mobile Fuel Services" 
                className="w-80 xl:w-96 drop-shadow-2xl"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.3 }}
              />
              
              <div className="relative w-full">
                <div className="absolute -inset-4 bg-gradient-to-r from-copper/20 via-brass/20 to-gold/20 rounded-3xl blur-2xl" />
                <Card className="relative bg-card/80 backdrop-blur border-wheat/30 shadow-xl">
                  <CardHeader className="pb-4">
                    <CardTitle className="font-display text-xl">Today's Fuel Prices</CardTitle>
                    <CardDescription>Updated hourly · Competitive rates</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-sage/20 flex items-center justify-center">
                          <Fuel className="w-5 h-5 text-sage" />
                        </div>
                        <span className="font-medium">Regular</span>
                      </div>
                      <span className="font-display text-2xl font-bold text-foreground">$1.429<span className="text-sm text-muted-foreground">/L</span></span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-brass/20 flex items-center justify-center">
                          <Fuel className="w-5 h-5 text-brass" />
                        </div>
                        <span className="font-medium">Premium</span>
                      </div>
                      <span className="font-display text-2xl font-bold text-foreground">$1.629<span className="text-sm text-muted-foreground">/L</span></span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-copper/20 flex items-center justify-center">
                          <Fuel className="w-5 h-5 text-copper" />
                        </div>
                        <span className="font-medium">Diesel</span>
                      </div>
                      <span className="font-display text-2xl font-bold text-foreground">$1.549<span className="text-sm text-muted-foreground">/L</span></span>
                    </div>
                  </CardContent>
                </Card>
              </div>
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
              Fuel Delivery, <span className="text-copper">Simplified</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Whether you're a busy professional, a rural farmer, or managing a fleet — we've got you covered.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Clock,
                title: 'Flexible Scheduling',
                description: 'Choose from multiple delivery windows that fit your schedule. Early morning to evening.',
              },
              {
                icon: Truck,
                title: 'We Come to You',
                description: 'Home, office, farm, or job site. Our certified drivers deliver wherever your vehicle is parked.',
              },
              {
                icon: Shield,
                title: 'Safe & Certified',
                description: 'Fully licensed, insured, and compliant with all safety regulations. Quality fuel guaranteed.',
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="h-full bg-card border-border hover:border-copper/30 transition-colors">
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 rounded-xl bg-copper/10 flex items-center justify-center mb-4">
                      <feature.icon className="w-6 h-6 text-copper" />
                    </div>
                    <h3 className="font-display text-xl font-semibold mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
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
              Plans for Every Need
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Start free or subscribe for extra savings. No long-term contracts.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Pay As You Go', price: 'Free', fee: '$9.99 delivery', discount: 'Standard pricing', vehicles: '1 vehicle', popular: false },
              { name: 'Access', price: '$24.99/mo', fee: '$4.99 delivery', discount: '2¢/L savings', vehicles: '2 vehicles', popular: false },
              { name: 'Household', price: '$49.99/mo', fee: 'FREE delivery', discount: '4¢/L savings', vehicles: '5 vehicles', popular: true },
              { name: 'Rural / Power', price: '$89.99/mo', fee: 'FREE delivery', discount: '6¢/L savings', vehicles: '15 vehicles', popular: false },
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
                        {plan.discount}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                        Up to {plan.vehicles}
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="auth" className="py-20 bg-muted/30">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="border-border shadow-xl">
              <CardHeader className="text-center">
                <CardTitle className="font-display text-2xl">Get Started</CardTitle>
                <CardDescription>Sign in or create your account</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                        <Button 
                          type="submit" 
                          className="w-full bg-copper hover:bg-copper/90"
                          disabled={isLoading}
                          data-testid="button-login"
                        >
                          {isLoading ? 'Signing in...' : 'Sign In'}
                        </Button>
                      </motion.form>
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
            <div className="flex items-center gap-3">
              <img src="/pmfs-logo.png" alt="PMFS Logo" className="w-8 h-8 object-contain" />
              <span className="font-display font-semibold text-foreground">Prairie Mobile Fuel Services</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Prairie Mobile Fuel Services. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
