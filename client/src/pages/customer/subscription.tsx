import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useSearch } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { subscriptionTiers } from '@/lib/mockData';
import { Check, Zap, Crown, Truck, Star, Loader2, ExternalLink, Shield, Upload, Clock, CheckCircle, XCircle } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
            `Join - $${tierPrice.toFixed(2)}/mo`
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
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const tierFromUrl = urlParams.get('tier');
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);
  const [changingTier, setChangingTier] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [stripeReady, setStripeReady] = useState<any>(null);
  const [autoTierTriggered, setAutoTierTriggered] = useState(false);

  const { data: dbTiers } = useQuery({
    queryKey: ['/api/subscription-tiers'],
  });

  const { data: verificationData } = useQuery({
    queryKey: ['/api/verification/status'],
  });

  const verificationStatus = (verificationData as any)?.status || 'none';

  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [verificationGroup, setVerificationGroup] = useState<string>('');
  const [verificationFile, setVerificationFile] = useState<File | null>(null);

  const submitVerificationMutation = useMutation({
    mutationFn: async () => {
      if (!verificationGroup || !verificationFile) throw new Error('Missing fields');
      const formData = new FormData();
      formData.append('group', verificationGroup);
      formData.append('document', verificationFile);
      const res = await fetch('/api/verification/submit', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Verification submission failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/verification/status'] });
      setShowVerificationDialog(false);
      setVerificationGroup('');
      setVerificationFile(null);
      toast({
        title: 'Verification Submitted',
        description: 'Your ID has been submitted for review. We\'ll notify you once it\'s approved.',
      });
    },
    onError: () => {
      toast({ title: 'Submission Failed', description: 'Please try again or contact support.', variant: 'destructive' });
    },
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
        title: 'Membership Updated',
        description: 'Your membership has been updated successfully.',
      });
      setChangingTier(null);
      setShowPaymentDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update membership',
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
        title: 'Membership Activated',
        description: 'Welcome to your new membership!',
      });
      setChangingTier(null);
      setShowPaymentDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to activate membership',
        variant: 'destructive',
      });
    },
  });

  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/stripe/billing-portal');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to open billing portal');
      }
      return res.json();
    },
    onSuccess: (data) => {
      // Calculate popup dimensions and position (centered)
      const width = Math.min(600, window.innerWidth - 40);
      const height = Math.min(700, window.innerHeight - 40);
      const left = Math.round((window.innerWidth - width) / 2);
      const top = Math.round((window.innerHeight - height) / 2);
      
      // Open in a popup window
      const popup = window.open(
        data.url, 
        'stripe_billing_portal',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );
      
      // Show toast with guidance
      toast({
        title: 'Billing Portal Opened',
        description: 'Manage your membership in the popup window. Close it when done.',
      });
      
      // Listen for popup close to refresh data
      if (popup) {
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            toast({
              title: 'Welcome Back',
              description: 'Your membership details have been refreshed.',
            });
            // Refetch user data
            queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
            queryClient.invalidateQueries({ queryKey: ['/api/subscription-tiers'] });
          }
        }, 500);
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to open billing portal',
        variant: 'destructive',
      });
    },
  });

  const getTierIcon = (slug: string) => {
    switch (slug) {
      case 'payg': return Zap;
      case 'access': return Star;
      case 'heroes': return Shield;
      case 'household': return Crown;
      case 'rural': return Truck;
      default: return Zap;
    }
  };

  const handleTierChange = async (tierSlug: string) => {
    const tier = subscriptionTiers.find(t => t.slug === tierSlug);
    if (!tier) return;

    if (tier.requiresVerification && verificationStatus !== 'approved') {
      setShowVerificationDialog(true);
      return;
    }

    const dbTier = (dbTiers as any)?.tiers?.find((t: any) => t.id === tierSlug);
    if (!dbTier) {
      toast({
        title: 'Error',
        description: 'Membership level not found',
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

  useEffect(() => {
    if (tierFromUrl && !autoTierTriggered && dbTiers && user) {
      setAutoTierTriggered(true);
      const tier = subscriptionTiers.find(t => t.slug === tierFromUrl);
      if (tier && tier.slug !== user.subscriptionTier) {
        toast({
          title: `Welcome to Prairie Mobile Fuel Services!`,
          description: `Let's get you set up with the ${tier.name} membership.`,
        });
        setTimeout(() => {
          handleTierChange(tierFromUrl);
        }, 800);
      }
    }
  }, [tierFromUrl, autoTierTriggered, dbTiers, user]);

  const selectedTierForPayment = subscriptionTiers.find(t => t.slug === changingTier);

  return (
    <div className="space-y-6">
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
                  <Button 
                    variant="outline" 
                    onClick={() => billingPortalMutation.mutate()}
                    disabled={billingPortalMutation.isPending}
                  >
                    {billingPortalMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4 mr-2" />
                    )}
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
                  {tier.slug === 'heroes' && !isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      ID Verification Required
                    </div>
                  )}
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
                    </div>

                    {tier.slug === 'heroes' && verificationStatus === 'pending' && !isCurrent && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 mb-2">
                        <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span className="text-xs text-amber-700">Verification pending review</span>
                      </div>
                    )}
                    {tier.slug === 'heroes' && verificationStatus === 'denied' && !isCurrent && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-200 mb-2">
                        <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <span className="text-xs text-red-700">Verification denied — you can resubmit</span>
                      </div>
                    )}
                    {tier.slug === 'heroes' && verificationStatus === 'approved' && !isCurrent && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-200 mb-2">
                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <span className="text-xs text-green-700">Verified — ready to join</span>
                      </div>
                    )}

                    {isCurrent ? (
                      <Button className="w-full" disabled variant="secondary" data-testid={`button-current-${tier.slug}`}>
                        Current Plan
                      </Button>
                    ) : tier.requiresVerification && verificationStatus === 'pending' ? (
                      <Button className="w-full" disabled variant="secondary" data-testid={`button-pending-${tier.slug}`}>
                        <Clock className="w-4 h-4 mr-2" /> Awaiting Verification
                      </Button>
                    ) : tier.requiresVerification && verificationStatus !== 'approved' ? (
                      <Button 
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white" 
                        onClick={() => handleTierChange(tier.slug)}
                        data-testid={`button-verify-${tier.slug}`}
                      >
                        <Shield className="w-4 h-4 mr-2" /> Verify & Join
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
                        data-testid={`button-downgrade-${tier.slug}`}
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

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              Join {selectedTierForPayment?.name}
            </DialogTitle>
            <DialogDescription>
              Add your payment method to activate your membership at ${selectedTierForPayment?.monthlyPrice}/month.
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

      <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Verify Your Eligibility
            </DialogTitle>
            <DialogDescription>
              The Service Members & Seniors tier requires ID verification. Upload a valid ID and we'll review it within 24 hours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">I am a...</Label>
              <Select value={verificationGroup} onValueChange={setVerificationGroup}>
                <SelectTrigger data-testid="select-verification-group">
                  <SelectValue placeholder="Select your group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="military">Military (Active Duty, Veteran, Reservist)</SelectItem>
                  <SelectItem value="responder">First Responder (Police, Fire, EMS, 911)</SelectItem>
                  <SelectItem value="senior">Senior (65+)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Upload ID Document</Label>
              <p className="text-xs text-muted-foreground">
                {verificationGroup === 'military' && 'Military ID card, veteran card, or discharge papers'}
                {verificationGroup === 'responder' && 'Badge photo, department ID, or certification'}
                {verificationGroup === 'senior' && "Driver's license or government ID showing date of birth"}
                {!verificationGroup && 'Select your group above to see accepted documents'}
              </p>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setVerificationFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="verification-upload"
                  data-testid="input-verification-upload"
                />
                <label htmlFor="verification-upload" className="cursor-pointer">
                  {verificationFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-green-700">
                      <CheckCircle className="w-4 h-4" />
                      {verificationFile.name}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                      <Upload className="w-6 h-6" />
                      <span>Tap to upload photo or PDF</span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="text-xs text-blue-700">
                Your document is stored securely and only reviewed by Prairie Mobile Fuel staff. We'll notify you once your verification is approved.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowVerificationDialog(false);
                setVerificationGroup('');
                setVerificationFile(null);
              }}
              data-testid="button-verification-cancel"
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!verificationGroup || !verificationFile || submitVerificationMutation.isPending}
              onClick={() => submitVerificationMutation.mutate()}
              data-testid="button-verification-submit"
            >
              {submitVerificationMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
              ) : (
                <><Shield className="w-4 h-4 mr-2" /> Submit for Review</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
  );
}
