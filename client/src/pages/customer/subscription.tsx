import { useState } from 'react';
import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { subscriptionTiers } from '@/lib/mockData';
import { Check, Zap, Crown, Truck, Star, Loader2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

let stripePromise: Promise<any> | null = null;

async function getStripePromise() {
  if (!stripePromise) {
    const res = await fetch('/api/stripe/publishable-key');
    const { publishableKey } = await res.json();
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

function PaymentMethodForm({ 
  onSuccess, 
  onCancel,
  tierName,
  tierPrice 
}: { 
  onSuccess: () => void; 
  onCancel: () => void;
  tierName: string;
  tierPrice: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
    });

    if (stripeError) {
      setError(stripeError.message || 'Payment failed');
      setIsProcessing(false);
      return;
    }

    onSuccess();
    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground mb-2">Card Details</p>
        <CardElement 
          options={{
            hidePostalCode: true,
            style: {
              base: {
                fontSize: '16px',
                color: '#1a1a1a',
                '::placeholder': { color: '#a0a0a0' },
              },
            },
          }}
        />
      </div>
      
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={!stripe || isProcessing}
          className="flex-1 bg-copper hover:bg-copper/90"
        >
          {isProcessing ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
          ) : (
            `Subscribe - $${tierPrice.toFixed(2)}/mo`
          )}
        </Button>
      </div>
    </form>
  );
}

export default function Subscription() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);
  const [changingTier, setChangingTier] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [stripeReady, setStripeReady] = useState<any>(null);

  const { data: dbTiers } = useQuery({
    queryKey: ['/api/subscription-tiers'],
  });

  const changeTierMutation = useMutation({
    mutationFn: async (tierId: string) => {
      const res = await fetch('/api/subscriptions/tier', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to change tier');
      return res.json();
    },
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({
        title: 'Subscription Updated',
        description: 'Your subscription has been updated successfully.',
      });
      setChangingTier(null);
      setShowPaymentDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update subscription',
        variant: 'destructive',
      });
    },
  });

  const createSubscriptionMutation = useMutation({
    mutationFn: async (tierId: string) => {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create subscription');
      return res.json();
    },
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({
        title: 'Subscription Created',
        description: 'Welcome to your new subscription plan!',
      });
      setChangingTier(null);
      setShowPaymentDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create subscription',
        variant: 'destructive',
      });
    },
  });

  const getTierIcon = (slug: string) => {
    switch (slug) {
      case 'payg': return Zap;
      case 'access': return Star;
      case 'household': return Crown;
      case 'rural': return Truck;
      default: return Zap;
    }
  };

  const handleTierChange = async (tierSlug: string) => {
    const tier = subscriptionTiers.find(t => t.slug === tierSlug);
    if (!tier) return;

    const dbTier = (dbTiers as any)?.tiers?.find((t: any) => t.id === tierSlug);
    if (!dbTier) {
      toast({
        title: 'Error',
        description: 'Subscription tier not found',
        variant: 'destructive',
      });
      return;
    }

    setChangingTier(tierSlug);

    if (user?.stripeSubscriptionId) {
      changeTierMutation.mutate(dbTier.id);
    } else {
      if (tier.monthlyPrice > 0) {
        const promise = await getStripePromise();
        setStripeReady(promise);
        setShowPaymentDialog(true);
      } else {
        createSubscriptionMutation.mutate(dbTier.id);
      }
    }
  };

  const handlePaymentSuccess = () => {
    const tier = subscriptionTiers.find(t => t.slug === changingTier);
    const dbTier = (dbTiers as any)?.tiers?.find((t: any) => t.id === changingTier);
    if (dbTier) {
      createSubscriptionMutation.mutate(dbTier.id);
    }
  };

  const selectedTierForPayment = subscriptionTiers.find(t => t.slug === changingTier);

  return (
    <CustomerLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Subscription</h1>
          <p className="text-muted-foreground mt-1">Choose the plan that fits your needs</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-copper/30 bg-gradient-to-r from-copper/5 to-brass/5">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-copper/20 flex items-center justify-center">
                    {currentTier && (() => {
                      const Icon = getTierIcon(currentTier.slug);
                      return <Icon className="w-7 h-7 text-copper" />;
                    })()}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Plan</p>
                    <h2 className="font-display text-2xl font-bold text-foreground">{currentTier?.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {currentTier?.monthlyPrice === 0 ? 'No monthly fee' : `$${currentTier?.monthlyPrice}/month`}
                    </p>
                  </div>
                </div>
                {currentTier?.slug !== 'payg' && (
                  <Button variant="outline" onClick={() => toast({ title: 'Manage Billing', description: 'Opens Stripe customer portal' })}>
                    Manage Billing
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {subscriptionTiers.map((tier, i) => {
            const Icon = getTierIcon(tier.slug);
            const isCurrent = tier.slug === user?.subscriptionTier;
            const isUpgrade = subscriptionTiers.findIndex(t => t.slug === user?.subscriptionTier) < i;
            const isChanging = changingTier === tier.slug && (changeTierMutation.isPending || createSubscriptionMutation.isPending);

            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className={`h-full relative ${isCurrent ? 'border-copper shadow-lg' : 'border-border hover:border-copper/30'} transition-all`}>
                  {tier.slug === 'household' && !isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-copper text-white text-xs font-medium rounded-full">
                      Most Popular
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-sage text-white text-xs font-medium rounded-full">
                      Current Plan
                    </div>
                  )}
                  <CardHeader className="pt-8">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isCurrent ? 'bg-copper/20 text-copper' : 'bg-muted text-muted-foreground'}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <CardTitle className="font-display text-xl">{tier.name}</CardTitle>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-bold text-foreground">
                        {tier.monthlyPrice === 0 ? 'Free' : `$${tier.monthlyPrice}`}
                      </span>
                      {tier.monthlyPrice > 0 && (
                        <span className="text-muted-foreground">/month</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-3">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-sage mt-0.5 flex-shrink-0" />
                          <span className="text-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="pt-4 space-y-2 border-t border-border">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Delivery Fee</span>
                        <span className="font-medium text-sage">{tier.deliveryFee === 0 ? 'FREE' : `$${tier.deliveryFee.toFixed(2)}`}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Vehicles</span>
                        <span className="font-medium">{tier.maxVehicles === 1 ? '1 vehicle' : `Up to ${tier.maxVehicles}`}</span>
                      </div>
                      {tier.maxOrdersPerMonth && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Orders/Month</span>
                          <span className="font-medium">{tier.maxOrdersPerMonth}</span>
                        </div>
                      )}
                    </div>

                    {isCurrent ? (
                      <Button className="w-full" disabled variant="secondary">
                        Current Plan
                      </Button>
                    ) : isUpgrade ? (
                      <Button 
                        className="w-full bg-copper hover:bg-copper/90" 
                        onClick={() => handleTierChange(tier.slug)}
                        disabled={isChanging}
                        data-testid={`button-upgrade-${tier.slug}`}
                      >
                        {isChanging ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                        ) : (
                          'Upgrade'
                        )}
                      </Button>
                    ) : (
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={() => handleTierChange(tier.slug)}
                        disabled={isChanging}
                      >
                        {isChanging ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                        ) : (
                          'Downgrade'
                        )}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              Subscribe to {selectedTierForPayment?.name}
            </DialogTitle>
            <DialogDescription>
              Add your payment method to start your subscription at ${selectedTierForPayment?.monthlyPrice}/month.
            </DialogDescription>
          </DialogHeader>
          
          {stripeReady && selectedTierForPayment && (
            <Elements stripe={stripeReady} options={{ locale: 'en-CA' }}>
              <PaymentMethodForm 
                onSuccess={handlePaymentSuccess}
                onCancel={() => {
                  setShowPaymentDialog(false);
                  setChangingTier(null);
                }}
                tierName={selectedTierForPayment.name}
                tierPrice={selectedTierForPayment.monthlyPrice}
              />
            </Elements>
          )}
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}
