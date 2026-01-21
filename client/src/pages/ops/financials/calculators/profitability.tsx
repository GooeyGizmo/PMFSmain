import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, TrendingUp, DollarSign, Calendar, Fuel, Truck, BarChart3 } from 'lucide-react';
import OpsLayout from '@/components/ops-layout';

export default function ProfitabilityCalculator() {
  const { data: pricingData } = useQuery<{ pricing: any[] }>({
    queryKey: ['/api/fuel-pricing'],
  });

  const [inputs, setInputs] = useState({
    avgLitresPerStop: '55',
    stopsPerDay: '5',
    workDaysPerWeek: '3',
    regular87Pct: '45',
    dieselPct: '40',
    premium91Pct: '15',
    monthlyOperatingCost: '1860',
    taxReserveRate: '30',
  });

  const livePricing = useMemo(() => {
    const pricing = pricingData?.pricing || [];
    return {
      regular: pricing.find((p: any) => p.fuelType === 'regular') || { baseCost: '1.2893', customerPrice: '1.4444' },
      diesel: pricing.find((p: any) => p.fuelType === 'diesel') || { baseCost: '1.2951', customerPrice: '1.6705' },
      premium: pricing.find((p: any) => p.fuelType === 'premium') || { baseCost: '1.3451', customerPrice: '1.7863' },
    };
  }, [pricingData]);

  const projections = useMemo(() => {
    const avgLitres = parseFloat(inputs.avgLitresPerStop) || 55;
    const stopsPerDay = parseFloat(inputs.stopsPerDay) || 5;
    const workDays = parseFloat(inputs.workDaysPerWeek) || 3;
    const reg87Pct = parseFloat(inputs.regular87Pct) / 100 || 0.45;
    const dieselPct = parseFloat(inputs.dieselPct) / 100 || 0.40;
    const premium91Pct = parseFloat(inputs.premium91Pct) / 100 || 0.15;
    const monthlyOpCost = parseFloat(inputs.monthlyOperatingCost) || 1860;
    const taxRate = parseFloat(inputs.taxReserveRate) / 100 || 0.30;

    const regPrice = parseFloat(livePricing.regular.customerPrice);
    const dieselPrice = parseFloat(livePricing.diesel.customerPrice);
    const premiumPrice = parseFloat(livePricing.premium.customerPrice);
    const regCost = parseFloat(livePricing.regular.baseCost);
    const dieselCost = parseFloat(livePricing.diesel.baseCost);
    const premiumCost = parseFloat(livePricing.premium.baseCost);

    const weightedPrice = regPrice * reg87Pct + dieselPrice * dieselPct + premiumPrice * premium91Pct;
    const weightedCost = regCost * reg87Pct + dieselCost * dieselPct + premiumCost * premium91Pct;
    const marginPerLitre = weightedPrice - weightedCost;

    const dailyStops = stopsPerDay;
    const dailyLitres = dailyStops * avgLitres;
    const dailyRevenue = dailyLitres * weightedPrice;
    const dailyCOGS = dailyLitres * weightedCost;
    const dailyMargin = dailyLitres * marginPerLitre;

    const weeklyStops = dailyStops * workDays;
    const weeklyLitres = dailyLitres * workDays;
    const weeklyRevenue = dailyRevenue * workDays;
    const weeklyCOGS = dailyCOGS * workDays;
    const weeklyMargin = dailyMargin * workDays;
    const weeklyOpCost = monthlyOpCost / 4.33;

    const monthlyStops = weeklyStops * 4.33;
    const monthlyLitres = weeklyLitres * 4.33;
    const monthlyRevenue = weeklyRevenue * 4.33;
    const monthlyCOGS = weeklyCOGS * 4.33;
    const monthlyMargin = weeklyMargin * 4.33;

    const weeklyGrossProfit = weeklyMargin - weeklyOpCost;
    const monthlyGrossProfit = monthlyMargin - monthlyOpCost;

    const weeklyTaxReserve = Math.max(0, weeklyGrossProfit * taxRate);
    const monthlyTaxReserve = Math.max(0, monthlyGrossProfit * taxRate);

    const weeklyNetProfit = weeklyGrossProfit - weeklyTaxReserve;
    const monthlyNetProfit = monthlyGrossProfit - monthlyTaxReserve;
    const yearlyNetProfit = monthlyNetProfit * 12;

    const grossMarginPct = monthlyRevenue > 0 ? (monthlyMargin / monthlyRevenue) * 100 : 0;
    const netMarginPct = monthlyRevenue > 0 ? (monthlyNetProfit / monthlyRevenue) * 100 : 0;

    return {
      daily: { stops: dailyStops, litres: dailyLitres, revenue: dailyRevenue, cogs: dailyCOGS, margin: dailyMargin },
      weekly: { stops: weeklyStops, litres: weeklyLitres, revenue: weeklyRevenue, cogs: weeklyCOGS, margin: weeklyMargin, opCost: weeklyOpCost, grossProfit: weeklyGrossProfit, taxReserve: weeklyTaxReserve, netProfit: weeklyNetProfit },
      monthly: { stops: monthlyStops, litres: monthlyLitres, revenue: monthlyRevenue, cogs: monthlyCOGS, margin: monthlyMargin, opCost: monthlyOpCost, grossProfit: monthlyGrossProfit, taxReserve: monthlyTaxReserve, netProfit: monthlyNetProfit },
      yearly: { netProfit: yearlyNetProfit },
      metrics: { grossMarginPct, netMarginPct, marginPerLitre, weightedPrice, weightedCost },
    };
  }, [inputs, livePricing]);

  return (
    <OpsLayout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/ops/financials">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-sage" />
            <span className="font-display font-bold text-foreground">Profitability Projections</span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="border-2 border-sage/30 bg-gradient-to-br from-sage/5 to-sage/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-sage" />
                <span className="text-sm text-muted-foreground">Weekly Net Profit</span>
              </div>
              <p className={`font-display text-3xl font-bold ${projections.weekly.netProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                ${projections.weekly.netProfit.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">After tax reserve</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-copper/30 bg-gradient-to-br from-copper/5 to-copper/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-copper" />
                <span className="text-sm text-muted-foreground">Monthly Net Profit</span>
              </div>
              <p className={`font-display text-3xl font-bold ${projections.monthly.netProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                ${projections.monthly.netProfit.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{projections.metrics.netMarginPct.toFixed(1)}% net margin</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-gold/30 bg-gradient-to-br from-gold/5 to-gold/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-gold" />
                <span className="text-sm text-muted-foreground">Yearly Projection</span>
              </div>
              <p className={`font-display text-3xl font-bold ${projections.yearly.netProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                ${projections.yearly.netProfit.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Annual owner income</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Truck className="w-5 h-5 text-copper" />
              Business Inputs
            </CardTitle>
            <CardDescription>Adjust your delivery volume and operating parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <Label>Avg Litres/Stop</Label>
                <Input
                  type="number"
                  value={inputs.avgLitresPerStop}
                  onChange={(e) => setInputs(prev => ({ ...prev, avgLitresPerStop: e.target.value }))}
                  className="mt-1"
                  data-testid="input-avg-litres"
                />
              </div>
              <div>
                <Label>Stops/Day</Label>
                <Input
                  type="number"
                  value={inputs.stopsPerDay}
                  onChange={(e) => setInputs(prev => ({ ...prev, stopsPerDay: e.target.value }))}
                  className="mt-1"
                  data-testid="input-stops-day"
                />
              </div>
              <div>
                <Label>Work Days/Week</Label>
                <Input
                  type="number"
                  value={inputs.workDaysPerWeek}
                  onChange={(e) => setInputs(prev => ({ ...prev, workDaysPerWeek: e.target.value }))}
                  className="mt-1"
                  data-testid="input-work-days"
                />
              </div>
              <div>
                <Label>Monthly Op Costs ($)</Label>
                <Input
                  type="number"
                  value={inputs.monthlyOperatingCost}
                  onChange={(e) => setInputs(prev => ({ ...prev, monthlyOperatingCost: e.target.value }))}
                  className="mt-1"
                  data-testid="input-monthly-opcost"
                />
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-4 mt-4">
              <div>
                <Label>Regular 87 Mix %</Label>
                <Input
                  type="number"
                  value={inputs.regular87Pct}
                  onChange={(e) => setInputs(prev => ({ ...prev, regular87Pct: e.target.value }))}
                  className="mt-1"
                  data-testid="input-regular-pct"
                />
              </div>
              <div>
                <Label>Diesel Mix %</Label>
                <Input
                  type="number"
                  value={inputs.dieselPct}
                  onChange={(e) => setInputs(prev => ({ ...prev, dieselPct: e.target.value }))}
                  className="mt-1"
                  data-testid="input-diesel-pct"
                />
              </div>
              <div>
                <Label>Premium 91 Mix %</Label>
                <Input
                  type="number"
                  value={inputs.premium91Pct}
                  onChange={(e) => setInputs(prev => ({ ...prev, premium91Pct: e.target.value }))}
                  className="mt-1"
                  data-testid="input-premium-pct"
                />
              </div>
              <div>
                <Label>Tax Reserve %</Label>
                <Input
                  type="number"
                  value={inputs.taxReserveRate}
                  onChange={(e) => setInputs(prev => ({ ...prev, taxReserveRate: e.target.value }))}
                  className="mt-1"
                  data-testid="input-tax-rate"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Calendar className="w-5 h-5 text-copper" />
                Weekly Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Deliveries</span>
                <span className="font-medium">{projections.weekly.stops.toFixed(0)} stops</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Litres Delivered</span>
                <span className="font-medium">{projections.weekly.litres.toFixed(0)}L</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Revenue</span>
                <span className="font-medium">${projections.weekly.revenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Fuel COGS</span>
                <span className="font-medium text-amber-600">-${projections.weekly.cogs.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Fuel Margin</span>
                <span className="font-medium text-sage">${projections.weekly.margin.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Operating Costs</span>
                <span className="font-medium text-amber-600">-${projections.weekly.opCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Gross Profit</span>
                <span className={`font-medium ${projections.weekly.grossProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                  ${projections.weekly.grossProfit.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Tax Reserve ({inputs.taxReserveRate}%)</span>
                <span className="font-medium text-amber-600">-${projections.weekly.taxReserve.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-3 bg-sage/10 rounded-lg px-3 -mx-3">
                <span className="font-medium">Net Profit (Owner Draw)</span>
                <span className={`font-display text-xl font-bold ${projections.weekly.netProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                  ${projections.weekly.netProfit.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Fuel className="w-5 h-5 text-copper" />
                Monthly Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Deliveries</span>
                <span className="font-medium">{projections.monthly.stops.toFixed(0)} stops</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Litres Delivered</span>
                <span className="font-medium">{projections.monthly.litres.toFixed(0)}L</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Revenue</span>
                <span className="font-medium">${projections.monthly.revenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Fuel COGS</span>
                <span className="font-medium text-amber-600">-${projections.monthly.cogs.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Fuel Margin</span>
                <span className="font-medium text-sage">${projections.monthly.margin.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Operating Costs</span>
                <span className="font-medium text-amber-600">-${projections.monthly.opCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Gross Profit</span>
                <span className={`font-medium ${projections.monthly.grossProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                  ${projections.monthly.grossProfit.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Tax Reserve ({inputs.taxReserveRate}%)</span>
                <span className="font-medium text-amber-600">-${projections.monthly.taxReserve.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-3 bg-sage/10 rounded-lg px-3 -mx-3">
                <span className="font-medium">Net Profit (Owner Draw)</span>
                <span className={`font-display text-xl font-bold ${projections.monthly.netProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                  ${projections.monthly.netProfit.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-muted text-center">
                <div className="text-sm text-muted-foreground mb-1">Weighted Price</div>
                <div className="font-display text-xl font-bold">${projections.metrics.weightedPrice.toFixed(4)}/L</div>
              </div>
              <div className="p-4 rounded-xl bg-muted text-center">
                <div className="text-sm text-muted-foreground mb-1">Weighted Cost</div>
                <div className="font-display text-xl font-bold">${projections.metrics.weightedCost.toFixed(4)}/L</div>
              </div>
              <div className="p-4 rounded-xl bg-sage/10 text-center">
                <div className="text-sm text-muted-foreground mb-1">Margin/Litre</div>
                <div className="font-display text-xl font-bold text-sage">${projections.metrics.marginPerLitre.toFixed(4)}</div>
              </div>
              <div className="p-4 rounded-xl bg-copper/10 text-center">
                <div className="text-sm text-muted-foreground mb-1">Gross Margin</div>
                <div className="font-display text-xl font-bold">{projections.metrics.grossMarginPct.toFixed(1)}%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </OpsLayout>
  );
}
