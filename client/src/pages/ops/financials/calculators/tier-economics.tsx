import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Eye, Users, DollarSign, TrendingUp, Trophy, BarChart3 } from 'lucide-react';
import OpsLayout from '@/components/ops-layout';

interface TierEconomicsCalculatorProps {
  embedded?: boolean;
}

const tierConfig = {
  payg: { name: 'PAYG', monthlyFee: 0, deliveryFee: 24.99, discount: 0, color: 'bg-gray-500' },
  access: { name: 'ACCESS', monthlyFee: 24.99, deliveryFee: 14.99, discount: 0, color: 'bg-cyan-600' },
  household: { name: 'HOUSEHOLD', monthlyFee: 49.99, deliveryFee: 0, discount: 0, color: 'bg-sky-400' },
  rural: { name: 'RURAL', monthlyFee: 99.99, deliveryFee: 0, discount: 0, color: 'bg-green-700' },
  vip: { name: 'VIP', monthlyFee: 249.99, deliveryFee: 0, discount: 0, color: 'bg-amber-600' },
};

export default function TierEconomicsCalculator({ embedded = false }: TierEconomicsCalculatorProps) {
  const { data: pricingData } = useQuery<{ pricing: any[] }>({
    queryKey: ['/api/fuel-pricing'],
  });

  const [tierCounts, setTierCounts] = useState({
    payg: '1',
    access: '5',
    household: '8',
    rural: '0',
    vip: '1',
  });

  const [deliveriesPerMonth, setDeliveriesPerMonth] = useState({
    payg: '1',
    access: '2',
    household: '4',
    rural: '4',
    vip: '4',
  });

  const [avgLitresPerDelivery, setAvgLitresPerDelivery] = useState({
    payg: '45',
    access: '50',
    household: '65',
    rural: '120',
    vip: '100',
  });
  const [monthlyOperatingCost, setMonthlyOperatingCost] = useState('1860');

  const livePricing = useMemo(() => {
    const pricing = pricingData?.pricing || [];
    return {
      regular: pricing.find((p: any) => p.fuelType === 'regular') || { baseCost: '1.2893', customerPrice: '1.4444' },
      diesel: pricing.find((p: any) => p.fuelType === 'diesel') || { baseCost: '1.2951', customerPrice: '1.6705' },
      premium: pricing.find((p: any) => p.fuelType === 'premium') || { baseCost: '1.3451', customerPrice: '1.7863' },
    };
  }, [pricingData]);

  const calculations = useMemo(() => {
    const opCost = parseFloat(monthlyOperatingCost) || 1860;

    const avgPrice = (parseFloat(livePricing.regular.customerPrice) * 0.45 + 
                     parseFloat(livePricing.diesel.customerPrice) * 0.40 + 
                     parseFloat(livePricing.premium.customerPrice) * 0.15);
    const avgCost = (parseFloat(livePricing.regular.baseCost) * 0.45 + 
                    parseFloat(livePricing.diesel.baseCost) * 0.40 + 
                    parseFloat(livePricing.premium.baseCost) * 0.15);

    let totalMonthlyDeliveries = 0;
    const tierResults: Record<string, any> = {};

    Object.entries(tierConfig).forEach(([key, tier]) => {
      const count = parseInt(tierCounts[key as keyof typeof tierCounts]) || 0;
      const deliveries = parseInt(deliveriesPerMonth[key as keyof typeof deliveriesPerMonth]) || 0;
      const avgLitres = parseFloat(avgLitresPerDelivery[key as keyof typeof avgLitresPerDelivery]) || 50;
      const totalDeliveries = count * deliveries;
      totalMonthlyDeliveries += totalDeliveries;
      
      const totalLitres = totalDeliveries * avgLitres;
      const subscriptionIncome = count * tier.monthlyFee;
      const deliveryFeeIncome = totalDeliveries * tier.deliveryFee;
      const fuelRevenue = totalLitres * avgPrice;
      const totalRevenue = subscriptionIncome + deliveryFeeIncome + fuelRevenue;
      
      const fuelCOGS = totalLitres * avgCost;
      
      tierResults[key] = {
        count,
        deliveries,
        totalDeliveries,
        totalLitres,
        subscriptionIncome,
        deliveryFeeIncome,
        fuelRevenue,
        totalRevenue,
        fuelCOGS,
        tier,
      };
    });

    Object.entries(tierResults).forEach(([key, result]) => {
      const opCostShare = totalMonthlyDeliveries > 0 
        ? (result.totalDeliveries / totalMonthlyDeliveries) * opCost 
        : 0;
      const totalCosts = result.fuelCOGS + opCostShare;
      const profit = result.totalRevenue - totalCosts;
      const profitPerCustomer = result.count > 0 ? profit / result.count : 0;
      const profitPerDelivery = result.totalDeliveries > 0 ? profit / result.totalDeliveries : 0;
      const marginPct = result.totalRevenue > 0 ? (profit / result.totalRevenue) * 100 : 0;

      tierResults[key] = {
        ...result,
        opCostShare,
        totalCosts,
        profit,
        profitPerCustomer,
        profitPerDelivery,
        marginPct,
      };
    });

    const ranking = Object.entries(tierResults)
      .sort((a, b) => b[1].profitPerCustomer - a[1].profitPerCustomer)
      .map(([key, data], i) => ({ rank: i + 1, tier: key, ...data }));

    const totalCustomers = Object.values(tierCounts).reduce((sum, c) => sum + (parseInt(c) || 0), 0);
    const totalRevenue = Object.values(tierResults).reduce((sum, t) => sum + t.totalRevenue, 0);
    const totalProfit = Object.values(tierResults).reduce((sum, t) => sum + t.profit, 0);
    const avgProfitPerCustomer = totalCustomers > 0 ? totalProfit / totalCustomers : 0;

    return {
      tierResults,
      ranking,
      totalCustomers,
      totalMonthlyDeliveries,
      totalRevenue,
      totalProfit,
      avgProfitPerCustomer,
    };
  }, [tierCounts, deliveriesPerMonth, avgLitresPerDelivery, monthlyOperatingCost, livePricing]);

  const content = (
    <main className={embedded ? "space-y-6" : "max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6"}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <Link href="/owner/finance">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-purple-500" />
            <span className="font-display font-bold text-foreground">Tier Economics</span>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-4">
          <Card className="border-2 border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-purple-500/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-purple-500" />
                <span className="text-sm text-muted-foreground">Total Customers</span>
              </div>
              <p className="font-display text-3xl font-bold">{calculations.totalCustomers}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-blue-500/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Total Revenue</span>
              </div>
              <p className="font-display text-3xl font-bold">${calculations.totalRevenue.toFixed(0)}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-sage/30 bg-gradient-to-br from-sage/5 to-sage/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-sage" />
                <span className="text-sm text-muted-foreground">Total Profit</span>
              </div>
              <p className={`font-display text-3xl font-bold ${calculations.totalProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                ${calculations.totalProfit.toFixed(0)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-2 border-copper/30 bg-gradient-to-br from-copper/5 to-copper/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-copper" />
                <span className="text-sm text-muted-foreground">Avg $/Customer</span>
              </div>
              <p className="font-display text-3xl font-bold">${calculations.avgProfitPerCustomer.toFixed(0)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-copper" />
              Customer Mix
            </CardTitle>
            <CardDescription>Enter your customer counts and delivery frequency by tier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <Label className="mb-3 block font-medium">Customers per Tier</Label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(tierConfig).map(([key, tier]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Badge className={tier.color}>{tier.name}</Badge>
                      <Input
                        type="number"
                        value={tierCounts[key as keyof typeof tierCounts]}
                        onChange={(e) => setTierCounts(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-20"
                        data-testid={`input-tier-count-${key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-3 block font-medium">Deliveries/Month per Customer</Label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(tierConfig).map(([key, tier]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Badge className={tier.color}>{tier.name}</Badge>
                      <Input
                        type="number"
                        value={deliveriesPerMonth[key as keyof typeof deliveriesPerMonth]}
                        onChange={(e) => setDeliveriesPerMonth(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-20"
                        data-testid={`input-tier-deliveries-${key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t">
              <Label className="mb-3 block font-medium">Avg Litres per Delivery</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {Object.entries(tierConfig).map(([key, tier]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Badge className={tier.color}>{tier.name}</Badge>
                    <Input
                      type="number"
                      value={avgLitresPerDelivery[key as keyof typeof avgLitresPerDelivery]}
                      onChange={(e) => setAvgLitresPerDelivery(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-20"
                      data-testid={`input-avg-litres-${key}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <Label>Monthly Operating Cost ($)</Label>
              <Input
                type="number"
                value={monthlyOperatingCost}
                onChange={(e) => setMonthlyOperatingCost(e.target.value)}
                className="mt-1 max-w-xs"
                data-testid="input-op-cost"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Trophy className="w-5 h-5 text-gold" />
              Tier Profitability Ranking
            </CardTitle>
            <CardDescription>Which subscription tiers are most profitable per customer?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-5 gap-4">
              {calculations.ranking.map((item: any) => (
                <Card 
                  key={item.tier} 
                  className={`relative ${item.rank === 1 ? 'border-2 border-gold' : ''}`}
                >
                  {item.rank === 1 && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gold text-white">
                        <Trophy className="w-3 h-3 mr-1" />
                        Best
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge className={item.tier.color}>{item.tier.name}</Badge>
                      <span className="text-2xl font-bold text-muted-foreground">#{item.rank}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="p-3 rounded-lg bg-sage/10">
                      <div className="text-xs text-muted-foreground">Profit/Customer</div>
                      <div className={`font-display text-xl font-bold ${item.profitPerCustomer >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                        ${item.profitPerCustomer.toFixed(2)}/mo
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Customers</span>
                        <span>{item.count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deliveries</span>
                        <span>{item.totalDeliveries}/mo</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Revenue</span>
                        <span>${item.totalRevenue.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Margin</span>
                        <span className={item.marginPct >= 0 ? 'text-sage' : 'text-amber-600'}>
                          {item.marginPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between text-sm font-medium">
                        <span>Total Profit</span>
                        <span className={item.profit >= 0 ? 'text-sage' : 'text-amber-600'}>
                          ${item.profit.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Detailed Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Tier</th>
                    <th className="text-right py-2 px-3">Customers</th>
                    <th className="text-right py-2 px-3">Deliveries</th>
                    <th className="text-right py-2 px-3">Subscription</th>
                    <th className="text-right py-2 px-3">Delivery Fees</th>
                    <th className="text-right py-2 px-3">Fuel Revenue</th>
                    <th className="text-right py-2 px-3">Total Revenue</th>
                    <th className="text-right py-2 px-3">Costs</th>
                    <th className="text-right py-2 px-3">Profit</th>
                    <th className="text-right py-2 px-3">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(calculations.tierResults).map(([key, data]: [string, any]) => (
                    <tr key={key} className="border-b">
                      <td className="py-2 px-3">
                        <Badge className={data.tier.color}>{data.tier.name}</Badge>
                      </td>
                      <td className="text-right py-2 px-3">{data.count}</td>
                      <td className="text-right py-2 px-3">{data.totalDeliveries}</td>
                      <td className="text-right py-2 px-3">${data.subscriptionIncome.toFixed(0)}</td>
                      <td className="text-right py-2 px-3">${data.deliveryFeeIncome.toFixed(0)}</td>
                      <td className="text-right py-2 px-3">${data.fuelRevenue.toFixed(0)}</td>
                      <td className="text-right py-2 px-3 font-medium">${data.totalRevenue.toFixed(0)}</td>
                      <td className="text-right py-2 px-3 text-amber-600">${data.totalCosts.toFixed(0)}</td>
                      <td className={`text-right py-2 px-3 font-medium ${data.profit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                        ${data.profit.toFixed(0)}
                      </td>
                      <td className={`text-right py-2 px-3 ${data.marginPct >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                        {data.marginPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="font-medium bg-muted/50">
                    <td className="py-2 px-3">Total</td>
                    <td className="text-right py-2 px-3">{calculations.totalCustomers}</td>
                    <td className="text-right py-2 px-3">{calculations.totalMonthlyDeliveries}</td>
                    <td className="text-right py-2 px-3" colSpan={3}></td>
                    <td className="text-right py-2 px-3">${calculations.totalRevenue.toFixed(0)}</td>
                    <td className="text-right py-2 px-3"></td>
                    <td className={`text-right py-2 px-3 ${calculations.totalProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                      ${calculations.totalProfit.toFixed(0)}
                    </td>
                    <td className="text-right py-2 px-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
