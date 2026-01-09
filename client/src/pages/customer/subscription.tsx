import { useState } from 'react';
import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { subscriptionTiers } from '@/lib/mockData';
import { Check, Zap, Crown, Truck, Star } from 'lucide-react';

export default function Subscription() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const getTierIcon = (slug: string) => {
    switch (slug) {
      case 'payg': return Zap;
      case 'access': return Star;
      case 'household': return Crown;
      case 'rural': return Truck;
      default: return Zap;
    }
  };

  const handleUpgrade = (tierSlug: string) => {
    toast({
      title: 'Upgrade initiated',
      description: 'You would be redirected to Stripe checkout to complete your subscription.',
    });
  };

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
                        <span className="font-medium">{tier.deliveryFee === 0 ? 'FREE' : `$${tier.deliveryFee.toFixed(2)}`}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Fuel Discount</span>
                        <span className="font-medium">{tier.fuelDiscount === 0 ? 'None' : `${(tier.fuelDiscount * 100).toFixed(0)}¢/L`}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Max Vehicles</span>
                        <span className="font-medium">{tier.maxVehicles}</span>
                      </div>
                    </div>

                    {isCurrent ? (
                      <Button className="w-full" disabled variant="secondary">
                        Current Plan
                      </Button>
                    ) : isUpgrade ? (
                      <Button 
                        className="w-full bg-copper hover:bg-copper/90" 
                        onClick={() => handleUpgrade(tier.slug)}
                        data-testid={`button-upgrade-${tier.slug}`}
                      >
                        Upgrade
                      </Button>
                    ) : (
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={() => handleUpgrade(tier.slug)}
                      >
                        Downgrade
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </CustomerLayout>
  );
}
