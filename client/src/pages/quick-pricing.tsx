import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Redirect } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FuelData {
  fuelType: string;
  baseCost: string;
  markupPercent: string;
  markupFlat: string;
  customerPrice: string;
}

function calculateCustomerPrice(baseCost: number, markupPercent: number, markupFlat: number): number {
  return baseCost + baseCost * (markupPercent / 100) + markupFlat;
}

const FUEL_LABELS: Record<string, string> = {
  regular: 'Regular',
  premium: 'Premium',
  diesel: 'Diesel',
};

const FUEL_COLORS: Record<string, string> = {
  regular: 'border-l-red-500',
  premium: 'border-l-amber-500',
  diesel: 'border-l-emerald-600',
};

export default function QuickPricing() {
  const { user, isLoading: authLoading, isAdmin } = useAuth();
  const { toast } = useToast();
  const [pricing, setPricing] = useState<Record<string, FuelData>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchPricing() {
      try {
        const res = await fetch('/api/fuel-pricing', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const map: Record<string, FuelData> = {};
        for (const p of data.pricing) {
          map[p.fuelType] = {
            fuelType: p.fuelType,
            baseCost: p.baseCost || '0',
            markupPercent: p.markupPercent || '0',
            markupFlat: p.markupFlat || '0',
            customerPrice: p.customerPrice || '0',
          };
        }
        setPricing(map);
      } catch {
        toast({ title: 'Error', description: 'Failed to load current prices', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    }
    fetchPricing();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Redirect to="/" />;
  if (!isAdmin) return <Redirect to="/app" />;

  const updateBaseCost = (fuelType: string, value: string) => {
    setPricing(prev => {
      const item = prev[fuelType];
      if (!item) return prev;
      const baseCost = parseFloat(value) || 0;
      const markupPercent = parseFloat(item.markupPercent) || 0;
      const markupFlat = parseFloat(item.markupFlat) || 0;
      const customerPrice = calculateCustomerPrice(baseCost, markupPercent, markupFlat);
      return {
        ...prev,
        [fuelType]: {
          ...item,
          baseCost: value,
          customerPrice: customerPrice.toFixed(4),
        },
      };
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const pricingArray = Object.values(pricing);
      const res = await fetch('/api/ops/fuel-pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pricing: pricingArray }),
      });

      if (res.ok) {
        toast({ title: 'Prices Updated', description: 'All fuel prices have been saved.' });
        setSaved(true);
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: err.message || 'Failed to update prices', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error — please try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const fuelTypes = ['regular', 'premium', 'diesel'];

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col items-center justify-start pt-8">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-quick-pricing-title">
            Quick Fuel Pricing
          </h1>
          <p className="text-sm text-muted-foreground">Update today's base costs</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {fuelTypes.map(type => {
                const data = pricing[type];
                if (!data) return null;
                return (
                  <Card key={type} className={`border-l-4 ${FUEL_COLORS[type]}`}>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-base font-semibold" data-testid={`text-fuel-label-${type}`}>
                        {FUEL_LABELS[type]}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                      <div>
                        <Label htmlFor={`baseCost-${type}`} className="text-xs text-muted-foreground">
                          Base Cost ($/L)
                        </Label>
                        <Input
                          id={`baseCost-${type}`}
                          type="number"
                          step="0.0001"
                          inputMode="decimal"
                          value={data.baseCost}
                          onChange={e => updateBaseCost(type, e.target.value)}
                          className="text-lg h-12 font-mono"
                          data-testid={`input-basecost-${type}`}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Markup: {data.markupPercent}% + ${data.markupFlat} flat</span>
                        <span className="font-semibold text-foreground" data-testid={`text-customer-price-${type}`}>
                          Customer: ${data.customerPrice}/L
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || saved}
              className="w-full h-14 text-lg font-semibold"
              data-testid="button-update-pricing"
            >
              {saving ? 'Saving...' : saved ? 'Prices Updated' : 'Update All Prices'}
            </Button>

            {saved && (
              <a
                href="/owner"
                className="block text-center text-sm text-primary underline hover:no-underline"
                data-testid="link-go-to-dashboard"
              >
                Go to Dashboard
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
