import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Fuel, DollarSign, TrendingUp, Percent } from 'lucide-react';
import OpsLayout from '@/components/ops-layout';

export default function FuelMarkupCalculator() {
  const { data: pricingData } = useQuery<{ pricing: any[] }>({
    queryKey: ['/api/fuel-pricing'],
  });

  const [customMarkup, setCustomMarkup] = useState({
    regular: '12',
    premium: '10',
    diesel: '8',
  });

  const [customLitres, setCustomLitres] = useState('100');

  const livePricing = useMemo(() => {
    const pricing = pricingData?.pricing || [];
    return {
      regular: pricing.find((p: any) => p.fuelType === 'regular') || { baseCost: '1.2893', customerPrice: '1.4444', markupPercent: '12' },
      diesel: pricing.find((p: any) => p.fuelType === 'diesel') || { baseCost: '1.2951', customerPrice: '1.6705', markupPercent: '10' },
      premium: pricing.find((p: any) => p.fuelType === 'premium') || { baseCost: '1.3451', customerPrice: '1.7863', markupPercent: '8' },
    };
  }, [pricingData]);

  const calculations = useMemo(() => {
    const litres = parseFloat(customLitres) || 100;
    
    const fuelTypes = ['regular', 'premium', 'diesel'] as const;
    const results: Record<string, any> = {};
    
    fuelTypes.forEach(fuelType => {
      const baseCost = parseFloat(livePricing[fuelType].baseCost);
      const markupPct = parseFloat(customMarkup[fuelType]) / 100;
      const customerPrice = baseCost * (1 + markupPct);
      const marginPerLitre = customerPrice - baseCost;
      const totalRevenue = customerPrice * litres;
      const totalCost = baseCost * litres;
      const totalProfit = marginPerLitre * litres;
      
      results[fuelType] = {
        baseCost,
        customerPrice,
        marginPerLitre,
        markupPct: markupPct * 100,
        totalRevenue,
        totalCost,
        totalProfit,
      };
    });
    
    return results;
  }, [livePricing, customMarkup, customLitres]);

  const getFuelColor = (type: string) => {
    switch (type) {
      case 'regular': return 'bg-amber-500';
      case 'premium': return 'bg-purple-500';
      case 'diesel': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getFuelLabel = (type: string) => {
    switch (type) {
      case 'regular': return 'Regular 87';
      case 'premium': return 'Premium 91';
      case 'diesel': return 'Diesel';
      default: return type;
    }
  };

  return (
    <OpsLayout>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/ops/financials">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Fuel className="w-5 h-5 text-amber-500" />
            <span className="font-display font-bold text-foreground">Fuel Markup Calculator</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-copper" />
              Live Fuel Pricing
            </CardTitle>
            <CardDescription>Current prices from your pricing settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {['regular', 'premium', 'diesel'].map(fuelType => (
                <div key={fuelType} className="p-4 rounded-xl border bg-gradient-to-br from-muted/50 to-muted">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className={getFuelColor(fuelType)}>{getFuelLabel(fuelType)}</Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rack Cost</span>
                      <span className="font-medium">${parseFloat(livePricing[fuelType as keyof typeof livePricing].baseCost).toFixed(4)}/L</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Customer Price</span>
                      <span className="font-medium">${parseFloat(livePricing[fuelType as keyof typeof livePricing].customerPrice).toFixed(4)}/L</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current Markup</span>
                      <span className="font-medium text-sage">{livePricing[fuelType as keyof typeof livePricing].markupPercent}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Percent className="w-5 h-5 text-copper" />
              Custom Markup Simulator
            </CardTitle>
            <CardDescription>Adjust markups to see how it affects your margins</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>Litres to Calculate</Label>
                <Input
                  type="number"
                  value={customLitres}
                  onChange={(e) => setCustomLitres(e.target.value)}
                  className="mt-1"
                  data-testid="input-litres"
                />
              </div>
              <div>
                <Label>Regular Markup %</Label>
                <Input
                  type="number"
                  value={customMarkup.regular}
                  onChange={(e) => setCustomMarkup(prev => ({ ...prev, regular: e.target.value }))}
                  className="mt-1"
                  data-testid="input-markup-regular"
                />
              </div>
              <div>
                <Label>Premium Markup %</Label>
                <Input
                  type="number"
                  value={customMarkup.premium}
                  onChange={(e) => setCustomMarkup(prev => ({ ...prev, premium: e.target.value }))}
                  className="mt-1"
                  data-testid="input-markup-premium"
                />
              </div>
              <div>
                <Label>Diesel Markup %</Label>
                <Input
                  type="number"
                  value={customMarkup.diesel}
                  onChange={(e) => setCustomMarkup(prev => ({ ...prev, diesel: e.target.value }))}
                  className="mt-1"
                  data-testid="input-markup-diesel"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {['regular', 'premium', 'diesel'].map(fuelType => {
                const calc = calculations[fuelType];
                return (
                  <Card key={fuelType} className="border-2">
                    <CardHeader className="pb-2">
                      <Badge className={`${getFuelColor(fuelType)} w-fit`}>{getFuelLabel(fuelType)}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="p-3 rounded-lg bg-muted">
                        <div className="text-xs text-muted-foreground mb-1">Calculated Price</div>
                        <div className="font-display text-2xl font-bold">${calc.customerPrice.toFixed(4)}/L</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Margin/L</span>
                          <div className="font-medium text-sage">${calc.marginPerLitre.toFixed(4)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Markup</span>
                          <div className="font-medium">{calc.markupPct.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="pt-3 border-t space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Revenue ({customLitres}L)</span>
                          <span className="font-medium">${calc.totalRevenue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Cost</span>
                          <span className="font-medium">${calc.totalCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-sage">Profit</span>
                          <span className="text-sage">${calc.totalProfit.toFixed(2)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-copper" />
              Profit Summary
            </CardTitle>
            <CardDescription>Combined profit across all fuel types for {customLitres} litres each</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-sage/10 to-sage/5 border">
                <div className="text-sm text-muted-foreground mb-1">Total Revenue</div>
                <div className="font-display text-2xl font-bold">
                  ${(calculations.regular.totalRevenue + calculations.premium.totalRevenue + calculations.diesel.totalRevenue).toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border">
                <div className="text-sm text-muted-foreground mb-1">Total Cost</div>
                <div className="font-display text-2xl font-bold">
                  ${(calculations.regular.totalCost + calculations.premium.totalCost + calculations.diesel.totalCost).toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-br from-sage/20 to-sage/10 border-2 border-sage/30">
                <div className="text-sm text-muted-foreground mb-1">Total Profit</div>
                <div className="font-display text-2xl font-bold text-sage">
                  ${(calculations.regular.totalProfit + calculations.premium.totalProfit + calculations.diesel.totalProfit).toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-br from-copper/10 to-copper/5 border">
                <div className="text-sm text-muted-foreground mb-1">Avg Margin</div>
                <div className="font-display text-2xl font-bold">
                  {(((calculations.regular.marginPerLitre + calculations.premium.marginPerLitre + calculations.diesel.marginPerLitre) / 3) / 
                    ((calculations.regular.baseCost + calculations.premium.baseCost + calculations.diesel.baseCost) / 3) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </OpsLayout>
  );
}
