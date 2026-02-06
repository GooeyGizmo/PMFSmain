import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Check, Zap, Star, Crown, Truck, Loader2, Save, Info, Mail } from 'lucide-react';
import { subscriptionTiers as mockTiers } from '@/lib/mockData';
import { apiRequest } from '@/lib/queryClient';

interface SubscriptionPricingProps {
  embedded?: boolean;
}

interface TierEdits {
  [tierId: string]: {
    monthlyFee: string;
    deliveryFee: string;
  };
}

export default function SubscriptionPricing({ embedded = false }: SubscriptionPricingProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<TierEdits>({});
  const [savingTier, setSavingTier] = useState<string | null>(null);

  const { data: dbTiersData, isLoading } = useQuery<{ tiers: any[] }>({
    queryKey: ['/api/subscription-tiers'],
  });

  const dbTiers = dbTiersData?.tiers || [];

  const updatePricingMutation = useMutation({
    mutationFn: async ({ tierId, monthlyFee, deliveryFee }: { tierId: string; monthlyFee: string; deliveryFee: string }) => {
      const res = await apiRequest('PUT', `/api/subscription-tiers/${tierId}/pricing`, {
        monthlyFee,
        deliveryFee,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update pricing');
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription-tiers'] });
      setEdits(prev => {
        const next = { ...prev };
        delete next[variables.tierId];
        return next;
      });
      setSavingTier(null);

      const stripeInfo = data.stripe;
      let description = 'Pricing has been updated in the database.';
      if (stripeInfo && !stripeInfo.error) {
        description += ` Stripe updated (${stripeInfo.subscribersMigrated}/${stripeInfo.totalAffected} subscribers migrated to new price at next billing cycle).`;
      }
      description += ' Notification emails sent to affected subscribers.';

      toast({
        title: 'Pricing Updated',
        description,
      });
    },
    onError: (error: any) => {
      setSavingTier(null);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update pricing',
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
      case 'vip': return Star;
      default: return Zap;
    }
  };

  const getMockTier = (tierId: string) => {
    return mockTiers.find(t => t.slug === tierId);
  };

  const getEditValue = (tierId: string, field: 'monthlyFee' | 'deliveryFee') => {
    if (edits[tierId]?.[field] !== undefined) {
      return edits[tierId][field];
    }
    const dbTier = dbTiers.find((t: any) => t.id === tierId);
    if (dbTier) {
      return field === 'monthlyFee' ? dbTier.monthlyFee : dbTier.deliveryFee;
    }
    return '0.00';
  };

  const setEditValue = (tierId: string, field: 'monthlyFee' | 'deliveryFee', value: string) => {
    setEdits(prev => ({
      ...prev,
      [tierId]: {
        ...prev[tierId],
        monthlyFee: prev[tierId]?.monthlyFee ?? getDbValue(tierId, 'monthlyFee'),
        deliveryFee: prev[tierId]?.deliveryFee ?? getDbValue(tierId, 'deliveryFee'),
        [field]: value,
      },
    }));
  };

  const getDbValue = (tierId: string, field: 'monthlyFee' | 'deliveryFee') => {
    const dbTier = dbTiers.find((t: any) => t.id === tierId);
    if (dbTier) {
      return field === 'monthlyFee' ? dbTier.monthlyFee : dbTier.deliveryFee;
    }
    return '0.00';
  };

  const hasChanges = (tierId: string) => {
    if (!edits[tierId]) return false;
    const dbTier = dbTiers.find((t: any) => t.id === tierId);
    if (!dbTier) return false;
    return (
      edits[tierId].monthlyFee !== dbTier.monthlyFee ||
      edits[tierId].deliveryFee !== dbTier.deliveryFee
    );
  };

  const handleSave = (tierId: string) => {
    const monthlyFee = getEditValue(tierId, 'monthlyFee');
    const deliveryFee = getEditValue(tierId, 'deliveryFee');
    setSavingTier(tierId);
    updatePricingMutation.mutate({ tierId, monthlyFee, deliveryFee });
  };

  const tierOrder = ['payg', 'access', 'household', 'rural', 'vip'];

  const sortedDbTiers = [...dbTiers].sort((a: any, b: any) => {
    return tierOrder.indexOf(a.id) - tierOrder.indexOf(b.id);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"}>
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Subscription Tier Pricing</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Edit monthly subscription fees and delivery fees for each tier. Changes update Stripe and notify subscribers.
        </p>
      </div>

      <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-amber-800 dark:text-amber-400">How mid-cycle pricing changes work</p>
              <ul className="text-amber-700 dark:text-amber-500 space-y-1 list-disc pl-4">
                <li><strong>New subscribers</strong> see updated prices immediately.</li>
                <li><strong>Existing subscribers</strong> keep their current rate until their next billing date, then the new price applies automatically.</li>
                <li><strong>Email notifications</strong> are sent to all affected subscribers with the old and new pricing, giving them a chance to downgrade or cancel before the new rate kicks in.</li>
                <li>Stripe prices are immutable — a new Stripe Price object is created and the old one is archived.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {sortedDbTiers.map((dbTier: any) => {
          const mockTier = getMockTier(dbTier.id);
          const Icon = getTierIcon(dbTier.id);
          const features = mockTier?.features || [];
          const isVip = dbTier.id === 'vip';
          const changed = hasChanges(dbTier.id);
          const isSaving = savingTier === dbTier.id;
          const monthlyFeeWithGst = (parseFloat(getEditValue(dbTier.id, 'monthlyFee')) * 1.05).toFixed(2);

          return (
            <Card
              key={dbTier.id}
              className={`h-full relative transition-all ${changed ? 'border-copper shadow-lg ring-1 ring-copper/20' : 'border-border'} ${isVip ? 'md:col-span-2' : ''}`}
              data-testid={`card-tier-${dbTier.id}`}
            >
              {isVip && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-amber-500 to-copper text-white text-xs font-medium rounded-full">
                  VIP Tier
                </div>
              )}
              {dbTier.id === 'household' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-copper text-white text-xs font-medium rounded-full">
                  Most Popular
                </div>
              )}
              <CardHeader className="pt-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-copper/10 text-copper">
                    <Icon className="w-5 h-5" />
                  </div>
                  <CardTitle className="font-display text-xl">{dbTier.name}</CardTitle>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold text-foreground">
                    {parseFloat(dbTier.monthlyFee) === 0 ? 'Free' : `$${parseFloat(dbTier.monthlyFee).toFixed(2)}`}
                  </span>
                  {parseFloat(dbTier.monthlyFee) > 0 && (
                    <span className="text-muted-foreground">/month</span>
                  )}
                  {parseFloat(dbTier.monthlyFee) > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (${parseFloat(dbTier.monthlyFeeWithGst).toFixed(2)} w/ GST)
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {features.map((feature: string) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-sage mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="pt-4 space-y-2 border-t border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Vehicles</span>
                    <span className="font-medium">{dbTier.maxVehiclesPerOrder === 1 ? '1 vehicle' : `Up to ${dbTier.maxVehiclesPerOrder}`}</span>
                  </div>
                  {dbTier.stripePriceId && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Stripe Price</span>
                      <span className="font-mono text-xs text-muted-foreground">{dbTier.stripePriceId.slice(0, 20)}...</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 space-y-4 border-t border-border">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    Editable Pricing
                    {changed && <Badge variant="outline" className="text-copper border-copper text-xs">Modified</Badge>}
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`monthly-${dbTier.id}`} className="text-xs text-muted-foreground">Monthly Fee (pre-GST)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          id={`monthly-${dbTier.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          className="pl-7"
                          value={getEditValue(dbTier.id, 'monthlyFee')}
                          onChange={(e) => setEditValue(dbTier.id, 'monthlyFee', e.target.value)}
                          data-testid={`input-monthly-fee-${dbTier.id}`}
                        />
                      </div>
                      {parseFloat(getEditValue(dbTier.id, 'monthlyFee')) > 0 && (
                        <p className="text-xs text-muted-foreground">${monthlyFeeWithGst} w/ GST</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`delivery-${dbTier.id}`} className="text-xs text-muted-foreground">Delivery Fee</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          id={`delivery-${dbTier.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          className="pl-7"
                          value={getEditValue(dbTier.id, 'deliveryFee')}
                          onChange={(e) => setEditValue(dbTier.id, 'deliveryFee', e.target.value)}
                          data-testid={`input-delivery-fee-${dbTier.id}`}
                        />
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-copper hover:bg-copper/90"
                    disabled={!changed || isSaving}
                    onClick={() => handleSave(dbTier.id)}
                    data-testid={`button-save-tier-${dbTier.id}`}
                  >
                    {isSaving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving & Notifying Subscribers...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> {changed ? 'Save & Update Stripe' : 'No Changes'}</>
                    )}
                  </Button>

                  {changed && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      Saving will send notification emails to all subscribers on this tier
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
