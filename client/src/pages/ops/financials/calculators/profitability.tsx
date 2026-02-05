import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ArrowLeft, TrendingUp, DollarSign, Calendar, Fuel, Truck, BarChart3,
  Users, Plus, X, ChevronDown, Target, Wallet, PiggyBank
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import {
  SUBSCRIPTION_MONTHLY_FEES,
  DELIVERY_FEES_BY_TIER,
  SUBSCRIPTION_DISPLAY_NAMES,
  GST_RATE,
  STRIPE_FEE_RATE,
  STRIPE_FEE_FLAT_CENTS,
  type SubscriptionTierId,
} from '@shared/pricing';

interface ProfitabilityCalculatorProps {
  embedded?: boolean;
}

interface Expense {
  id: string;
  name: string;
  amount: string;
  frequency: 'daily' | 'weekly' | 'monthly';
}

const TIER_COLORS: Record<SubscriptionTierId, string> = {
  payg: 'bg-gray-500',
  access: 'bg-cyan-600',
  household: 'bg-sky-400',
  rural: 'bg-green-700',
  vip: 'bg-amber-500',
};

const TIER_ORDER: SubscriptionTierId[] = ['payg', 'access', 'household', 'rural', 'vip'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

export default function ProfitabilityCalculator({ embedded = false }: ProfitabilityCalculatorProps) {
  const { data: pricingData } = useQuery<{ pricing: any[] }>({
    queryKey: ['/api/fuel-pricing'],
  });

  const [tierCounts, setTierCounts] = useState<Record<SubscriptionTierId, string>>({
    payg: '6',
    access: '3',
    household: '4',
    rural: '1',
    vip: '0',
  });

  const [deliveriesPerMonth, setDeliveriesPerMonth] = useState<Record<SubscriptionTierId, string>>({
    payg: '1',
    access: '2',
    household: '3',
    rural: '3',
    vip: '2',
  });

  const [avgLitresPerDelivery, setAvgLitresPerDelivery] = useState<Record<SubscriptionTierId, string>>({
    payg: '45',
    access: '50',
    household: '55',
    rural: '120',
    vip: '60',
  });

  const [fuelMix, setFuelMix] = useState({
    regular: '45',
    diesel: '40',
    premium: '15',
  });

  const [taxReserveRate, setTaxReserveRate] = useState('30');
  const [workDaysPerWeek, setWorkDaysPerWeek] = useState('3');

  const [expenses, setExpenses] = useState<Expense[]>([
    { id: '1', name: 'Truck Fuel (Diesel)', amount: '45', frequency: 'daily' },
    { id: '2', name: 'Vehicle Insurance', amount: '275', frequency: 'monthly' },
    { id: '3', name: 'Maintenance Reserve', amount: '150', frequency: 'monthly' },
    { id: '4', name: 'Phone/Data Plan', amount: '85', frequency: 'monthly' },
    { id: '5', name: 'Software Subscriptions', amount: '50', frequency: 'monthly' },
    { id: '6', name: 'Fuel Tank Rental', amount: '200', frequency: 'monthly' },
  ]);

  const [sectionsOpen, setSectionsOpen] = useState({
    tiers: true,
    fuel: true,
    expenses: true,
  });

  const addExpense = () => {
    setExpenses([...expenses, { id: crypto.randomUUID(), name: '', amount: '0', frequency: 'monthly' }]);
  };

  const removeExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  const updateExpense = (id: string, field: keyof Expense, value: string) => {
    setExpenses(expenses.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const livePricing = useMemo(() => {
    const pricing = pricingData?.pricing || [];
    return {
      regular: pricing.find((p: any) => p.fuelType === 'regular') || { baseCost: '1.2893', customerPrice: '1.4444' },
      diesel: pricing.find((p: any) => p.fuelType === 'diesel') || { baseCost: '1.2951', customerPrice: '1.6705' },
      premium: pricing.find((p: any) => p.fuelType === 'premium') || { baseCost: '1.3451', customerPrice: '1.7863' },
    };
  }, [pricingData]);

  const projections = useMemo(() => {
    const workDays = parseFloat(workDaysPerWeek) || 3;
    const taxRate = parseFloat(taxReserveRate) / 100 || 0.30;
    const regMix = parseFloat(fuelMix.regular) / 100 || 0;
    const dieselMix = parseFloat(fuelMix.diesel) / 100 || 0;
    const premiumMix = parseFloat(fuelMix.premium) / 100 || 0;

    const regPrice = parseFloat(livePricing.regular.customerPrice);
    const dieselPrice = parseFloat(livePricing.diesel.customerPrice);
    const premiumPrice = parseFloat(livePricing.premium.customerPrice);
    const regCost = parseFloat(livePricing.regular.baseCost);
    const dieselCost = parseFloat(livePricing.diesel.baseCost);
    const premiumCost = parseFloat(livePricing.premium.baseCost);

    let totalSubscriptionRevenue = 0;
    let totalDeliveryFeeRevenue = 0;
    let totalMonthlyDeliveries = 0;
    let totalMonthlyLitres = 0;
    let totalCustomers = 0;

    const tierBreakdown: Record<string, any> = {};

    TIER_ORDER.forEach((tierId) => {
      const count = parseInt(tierCounts[tierId]) || 0;
      const deliveries = parseFloat(deliveriesPerMonth[tierId]) || 0;
      const avgLitres = parseFloat(avgLitresPerDelivery[tierId]) || 0;

      const monthlyDeliveries = count * deliveries;
      const monthlyLitres = monthlyDeliveries * avgLitres;

      const subscriptionRevenue = count * SUBSCRIPTION_MONTHLY_FEES[tierId];
      const deliveryFeeRevenue = monthlyDeliveries * DELIVERY_FEES_BY_TIER[tierId];

      totalSubscriptionRevenue += subscriptionRevenue;
      totalDeliveryFeeRevenue += deliveryFeeRevenue;
      totalMonthlyDeliveries += monthlyDeliveries;
      totalMonthlyLitres += monthlyLitres;
      totalCustomers += count;

      tierBreakdown[tierId] = {
        count,
        deliveries,
        avgLitres,
        monthlyDeliveries,
        monthlyLitres,
        subscriptionRevenue,
        deliveryFeeRevenue,
        totalTierRevenue: subscriptionRevenue + deliveryFeeRevenue,
      };
    });

    const regularLitres = totalMonthlyLitres * regMix;
    const dieselLitres = totalMonthlyLitres * dieselMix;
    const premiumLitres = totalMonthlyLitres * premiumMix;

    const fuelByType = {
      regular: {
        litres: regularLitres,
        revenue: regularLitres * regPrice,
        cogs: regularLitres * regCost,
        margin: regularLitres * (regPrice - regCost),
        pricePerLitre: regPrice,
        costPerLitre: regCost,
        marginPerLitre: regPrice - regCost,
      },
      diesel: {
        litres: dieselLitres,
        revenue: dieselLitres * dieselPrice,
        cogs: dieselLitres * dieselCost,
        margin: dieselLitres * (dieselPrice - dieselCost),
        pricePerLitre: dieselPrice,
        costPerLitre: dieselCost,
        marginPerLitre: dieselPrice - dieselCost,
      },
      premium: {
        litres: premiumLitres,
        revenue: premiumLitres * premiumPrice,
        cogs: premiumLitres * premiumCost,
        margin: premiumLitres * (premiumPrice - premiumCost),
        pricePerLitre: premiumPrice,
        costPerLitre: premiumCost,
        marginPerLitre: premiumPrice - premiumCost,
      },
    };

    const totalFuelRevenue = fuelByType.regular.revenue + fuelByType.diesel.revenue + fuelByType.premium.revenue;
    const totalFuelCOGS = fuelByType.regular.cogs + fuelByType.diesel.cogs + fuelByType.premium.cogs;
    const totalFuelMargin = totalFuelRevenue - totalFuelCOGS;

    const totalGrossRevenue = totalSubscriptionRevenue + totalDeliveryFeeRevenue + totalFuelRevenue;

    let monthlyOpCost = 0;
    const expenseBreakdown = expenses.map(exp => {
      const amount = parseFloat(exp.amount) || 0;
      let monthly = 0;
      switch (exp.frequency) {
        case 'daily':
          monthly = amount * workDays * 4.33;
          break;
        case 'weekly':
          monthly = amount * 4.33;
          break;
        case 'monthly':
          monthly = amount;
          break;
      }
      monthlyOpCost += monthly;
      return { ...exp, monthly };
    });

    // P&L Step 1: Gross Margin = Total Revenue - Fuel COGS
    const grossMargin = totalGrossRevenue - totalFuelCOGS;

    // P&L Step 2: Operating Profit = Gross Margin - Operating Expenses
    const operatingProfit = grossMargin - monthlyOpCost;

    // P&L Step 3: Stripe Fees (separate subscription vs delivery charges)
    const subscribingCustomers = TIER_ORDER.reduce((sum, tierId) => {
      const count = parseInt(tierCounts[tierId]) || 0;
      return sum + (SUBSCRIPTION_MONTHLY_FEES[tierId] > 0 ? count : 0);
    }, 0);
    const subscriptionStripeFees = subscribingCustomers > 0
      ? subscribingCustomers * (STRIPE_FEE_FLAT_CENTS / 100) + totalSubscriptionRevenue * STRIPE_FEE_RATE
      : 0;
    const deliveryChargeRevenue = totalDeliveryFeeRevenue + totalFuelRevenue;
    const deliveryStripeFees = totalMonthlyDeliveries > 0
      ? totalMonthlyDeliveries * (STRIPE_FEE_FLAT_CENTS / 100) + deliveryChargeRevenue * STRIPE_FEE_RATE
      : 0;
    const estimatedStripeFees = subscriptionStripeFees + deliveryStripeFees;

    // P&L Step 4: Profit Before Tax = Operating Profit - Stripe Fees
    const profitBeforeTax = operatingProfit - estimatedStripeFees;

    // P&L Step 5: Tax Reserve
    const taxReserve = Math.max(0, profitBeforeTax * taxRate);

    // P&L Step 6: Net Profit (Owner Draw) = Profit Before Tax - Tax Reserve
    const netProfit = profitBeforeTax - taxReserve;

    const weeklyNetProfit = netProfit / 4.33;
    const yearlyNetProfit = netProfit * 12;

    // GST is pass-through: collected from customers, remitted to CRA. Not revenue, not expense.
    const gstCollected = totalGrossRevenue * GST_RATE;

    // Metrics
    const grossMarginPct = totalGrossRevenue > 0 ? (grossMargin / totalGrossRevenue) * 100 : 0;
    const netMarginPct = totalGrossRevenue > 0 ? (netProfit / totalGrossRevenue) * 100 : 0;
    const revenuePerCustomer = totalCustomers > 0 ? totalGrossRevenue / totalCustomers : 0;
    const costPerDelivery = totalMonthlyDeliveries > 0 ? (totalFuelCOGS + monthlyOpCost) / totalMonthlyDeliveries : 0;
    const profitPerDelivery = totalMonthlyDeliveries > 0
      ? (grossMargin - monthlyOpCost - estimatedStripeFees + totalSubscriptionRevenue) / totalMonthlyDeliveries
      : 0;
    const fixedCosts = monthlyOpCost + estimatedStripeFees;
    const breakEvenDeliveries = profitPerDelivery > 0
      ? Math.ceil(fixedCosts / profitPerDelivery)
      : 0;

    return {
      tierBreakdown,
      totalCustomers,
      totalMonthlyDeliveries,
      totalMonthlyLitres,
      totalSubscriptionRevenue,
      totalDeliveryFeeRevenue,
      fuelByType,
      totalFuelRevenue,
      totalFuelCOGS,
      totalFuelMargin,
      totalGrossRevenue,
      grossMargin,
      monthlyOpCost,
      expenseBreakdown,
      operatingProfit,
      estimatedStripeFees,
      subscriptionStripeFees,
      deliveryStripeFees,
      gstCollected,
      profitBeforeTax,
      taxReserve,
      netProfit,
      weeklyNetProfit,
      yearlyNetProfit,
      metrics: {
        grossMarginPct,
        netMarginPct,
        revenuePerCustomer,
        costPerDelivery,
        breakEvenDeliveries,
      },
    };
  }, [tierCounts, deliveriesPerMonth, avgLitresPerDelivery, fuelMix, expenses, livePricing, taxReserveRate, workDaysPerWeek]);

  const content = (
    <main className={embedded ? "space-y-6" : "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6"}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <Link href="/owner/finance">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-sage" />
            <span className="font-display font-bold text-foreground">Profitability Projections</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card className="border-2 border-sage/30 bg-gradient-to-br from-sage/5 to-sage/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-sage" />
              <span className="text-sm text-muted-foreground">Weekly Net Profit</span>
            </div>
            <p className={`font-display text-2xl sm:text-3xl font-bold ${projections.weeklyNetProfit >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-weekly-net-profit">
              {formatCurrency(projections.weeklyNetProfit)}
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
            <p className={`font-display text-2xl sm:text-3xl font-bold ${projections.netProfit >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-monthly-net-profit">
              {formatCurrency(projections.netProfit)}
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
            <p className={`font-display text-2xl sm:text-3xl font-bold ${projections.yearlyNetProfit >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-yearly-net-profit">
              {formatCurrency(projections.yearlyNetProfit)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Annual owner income</p>
          </CardContent>
        </Card>
      </div>

      <Collapsible open={sectionsOpen.tiers} onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, tiers: open }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Users className="w-5 h-5 text-copper" />
                    Customer Base by Tier
                  </CardTitle>
                  <CardDescription>{projections.totalCustomers} customers · {projections.totalMonthlyDeliveries.toFixed(0)} deliveries/month</CardDescription>
                </div>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${sectionsOpen.tiers ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                  <div className="col-span-3">Tier</div>
                  <div className="col-span-2">Customers</div>
                  <div className="col-span-2">Del./Mo</div>
                  <div className="col-span-2">Avg L/Del.</div>
                  <div className="col-span-3 text-right">Monthly Revenue</div>
                </div>
                {TIER_ORDER.map((tierId) => {
                  const tier = projections.tierBreakdown[tierId];
                  return (
                    <div key={tierId} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${TIER_COLORS[tierId]}`} />
                        <span className="text-sm font-medium truncate">{SUBSCRIPTION_DISPLAY_NAMES[tierId]}</span>
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="0"
                          value={tierCounts[tierId]}
                          onChange={(e) => setTierCounts(prev => ({ ...prev, [tierId]: e.target.value }))}
                          className="h-8 text-sm"
                          data-testid={`input-tier-count-${tierId}`}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={deliveriesPerMonth[tierId]}
                          onChange={(e) => setDeliveriesPerMonth(prev => ({ ...prev, [tierId]: e.target.value }))}
                          className="h-8 text-sm"
                          data-testid={`input-tier-deliveries-${tierId}`}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="0"
                          value={avgLitresPerDelivery[tierId]}
                          onChange={(e) => setAvgLitresPerDelivery(prev => ({ ...prev, [tierId]: e.target.value }))}
                          className="h-8 text-sm"
                          data-testid={`input-tier-litres-${tierId}`}
                        />
                      </div>
                      <div className="col-span-3 text-right">
                        <div className="text-sm font-medium">{formatCurrency(tier.totalTierRevenue)}</div>
                        <div className="text-xs text-muted-foreground">
                          Sub: {formatCurrency(tier.subscriptionRevenue)} · Del: {formatCurrency(tier.deliveryFeeRevenue)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="grid grid-cols-12 gap-2 pt-3 border-t">
                  <div className="col-span-3 font-medium text-sm">Totals</div>
                  <div className="col-span-2 text-sm font-medium">{projections.totalCustomers}</div>
                  <div className="col-span-2 text-sm font-medium">{projections.totalMonthlyDeliveries.toFixed(0)}</div>
                  <div className="col-span-2 text-sm font-medium">{projections.totalMonthlyLitres.toFixed(0)}L</div>
                  <div className="col-span-3 text-right text-sm font-medium text-sage">
                    {formatCurrency(projections.totalSubscriptionRevenue + projections.totalDeliveryFeeRevenue)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1">
                  <div className="grid grid-cols-5 gap-2 font-medium">
                    {TIER_ORDER.map(t => (
                      <div key={t} className="text-center">
                        <div>{SUBSCRIPTION_DISPLAY_NAMES[t].split(' ')[0]}</div>
                        <div className="text-foreground">Sub: {formatCurrency(SUBSCRIPTION_MONTHLY_FEES[t])}</div>
                        <div className="text-foreground">Del: {formatCurrency(DELIVERY_FEES_BY_TIER[t])}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={sectionsOpen.fuel} onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, fuel: open }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Fuel className="w-5 h-5 text-copper" />
                    Fuel Economics
                  </CardTitle>
                  <CardDescription>
                    {projections.totalMonthlyLitres.toFixed(0)}L/month · Margin: {formatCurrency(projections.totalFuelMargin)}
                  </CardDescription>
                </div>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${sectionsOpen.fuel ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Fuel Mix (%)</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Regular 87</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={fuelMix.regular}
                      onChange={(e) => setFuelMix(prev => ({ ...prev, regular: e.target.value }))}
                      className="mt-1"
                      data-testid="input-fuel-mix-regular"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Diesel</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={fuelMix.diesel}
                      onChange={(e) => setFuelMix(prev => ({ ...prev, diesel: e.target.value }))}
                      className="mt-1"
                      data-testid="input-fuel-mix-diesel"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Premium 91</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={fuelMix.premium}
                      onChange={(e) => setFuelMix(prev => ({ ...prev, premium: e.target.value }))}
                      className="mt-1"
                      data-testid="input-fuel-mix-premium"
                    />
                  </div>
                </div>
                {(() => {
                  const total = (parseFloat(fuelMix.regular) || 0) + (parseFloat(fuelMix.diesel) || 0) + (parseFloat(fuelMix.premium) || 0);
                  if (Math.abs(total - 100) > 0.1) {
                    return (
                      <p className="text-xs text-red-500 mt-2" data-testid="text-fuel-mix-warning">
                        Fuel mix totals {total.toFixed(0)}% — should equal 100%
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Per-Litre Breakdown (Live Pricing)</h4>
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                  <div className="col-span-2">Type</div>
                  <div className="col-span-1 text-right">Mix</div>
                  <div className="col-span-2 text-right">Price/L</div>
                  <div className="col-span-2 text-right">Cost/L</div>
                  <div className="col-span-1 text-right">Margin/L</div>
                  <div className="col-span-2 text-right">Revenue</div>
                  <div className="col-span-2 text-right">COGS</div>
                </div>
                {(['regular', 'diesel', 'premium'] as const).map((type) => {
                  const f = projections.fuelByType[type];
                  const mixPct = fuelMix[type];
                  return (
                    <div key={type} className="grid grid-cols-12 gap-2 text-sm items-center">
                      <div className="col-span-2 capitalize font-medium">{type === 'regular' ? 'Regular 87' : type === 'premium' ? 'Premium 91' : 'Diesel'}</div>
                      <div className="col-span-1 text-right">{mixPct}%</div>
                      <div className="col-span-2 text-right">${f.pricePerLitre.toFixed(4)}</div>
                      <div className="col-span-2 text-right">${f.costPerLitre.toFixed(4)}</div>
                      <div className="col-span-1 text-right text-sage">${f.marginPerLitre.toFixed(4)}</div>
                      <div className="col-span-2 text-right">{formatCurrency(f.revenue)}</div>
                      <div className="col-span-2 text-right text-amber-600">{formatCurrency(f.cogs)}</div>
                    </div>
                  );
                })}
                <div className="grid grid-cols-12 gap-2 text-sm font-medium pt-2 border-t">
                  <div className="col-span-2">Totals</div>
                  <div className="col-span-1"></div>
                  <div className="col-span-2"></div>
                  <div className="col-span-2"></div>
                  <div className="col-span-1"></div>
                  <div className="col-span-2 text-right">{formatCurrency(projections.totalFuelRevenue)}</div>
                  <div className="col-span-2 text-right text-amber-600">{formatCurrency(projections.totalFuelCOGS)}</div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-sage/10 flex items-center justify-between">
                <span className="text-sm font-medium">Total Fuel Margin</span>
                <span className="font-display text-lg font-bold text-sage">{formatCurrency(projections.totalFuelMargin)}</span>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={sectionsOpen.expenses} onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, expenses: open }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Truck className="w-5 h-5 text-copper" />
                    Operating Expenses
                  </CardTitle>
                  <CardDescription>Monthly total: {formatCurrency(projections.monthlyOpCost)}</CardDescription>
                </div>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${sectionsOpen.expenses ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Work Days/Week</Label>
                  <Input
                    type="number"
                    min="1"
                    max="7"
                    value={workDaysPerWeek}
                    onChange={(e) => setWorkDaysPerWeek(e.target.value)}
                    className="mt-1"
                    data-testid="input-work-days"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Tax Reserve %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={taxReserveRate}
                    onChange={(e) => setTaxReserveRate(e.target.value)}
                    className="mt-1"
                    data-testid="input-tax-rate"
                  />
                </div>
                <div className="pt-5">
                  <Button onClick={addExpense} variant="outline" size="sm" className="gap-1" data-testid="button-add-expense">
                    <Plus className="w-4 h-4" />
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                  <div className="col-span-4">Expense</div>
                  <div className="col-span-3">Amount ($)</div>
                  <div className="col-span-3">Frequency</div>
                  <div className="col-span-1 text-right">Monthly</div>
                  <div className="col-span-1"></div>
                </div>

                {projections.expenseBreakdown.map((expense) => (
                  <div key={expense.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Input
                        value={expense.name}
                        onChange={(e) => updateExpense(expense.id, 'name', e.target.value)}
                        placeholder="Expense name"
                        className="h-8 text-sm"
                        data-testid={`input-expense-name-${expense.id}`}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        value={expense.amount}
                        onChange={(e) => updateExpense(expense.id, 'amount', e.target.value)}
                        className="h-8 text-sm"
                        data-testid={`input-expense-amount-${expense.id}`}
                      />
                    </div>
                    <div className="col-span-3">
                      <Select
                        value={expense.frequency}
                        onValueChange={(v) => updateExpense(expense.id, 'frequency', v)}
                      >
                        <SelectTrigger className="h-8 text-sm" data-testid={`select-expense-freq-${expense.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 text-right text-sm">{formatCurrency(expense.monthly)}</div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExpense(expense.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        data-testid={`button-remove-expense-${expense.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-12 gap-2 pt-2 border-t font-medium text-sm">
                  <div className="col-span-4">Total Operating Expenses</div>
                  <div className="col-span-3"></div>
                  <div className="col-span-3"></div>
                  <div className="col-span-1 text-right text-amber-600">{formatCurrency(projections.monthlyOpCost)}</div>
                  <div className="col-span-1"></div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card className="border-2 border-copper/20">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Wallet className="w-5 h-5 text-copper" />
            Monthly Profit & Loss Statement
          </CardTitle>
          <CardDescription>Pro forma income statement for bank presentation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-2 pb-1">Revenue</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground">Subscription Revenue</span>
            <span className="text-sm font-medium" data-testid="text-pl-subscription">{formatCurrency(projections.totalSubscriptionRevenue)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground">Delivery Fee Revenue</span>
            <span className="text-sm font-medium" data-testid="text-pl-delivery-fees">{formatCurrency(projections.totalDeliveryFeeRevenue)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Regular 87 ({fuelMix.regular}% · {projections.fuelByType.regular.litres.toFixed(0)}L)</span>
            <span className="text-sm font-medium">{formatCurrency(projections.fuelByType.regular.revenue)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Diesel ({fuelMix.diesel}% · {projections.fuelByType.diesel.litres.toFixed(0)}L)</span>
            <span className="text-sm font-medium">{formatCurrency(projections.fuelByType.diesel.revenue)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Premium 91 ({fuelMix.premium}% · {projections.fuelByType.premium.litres.toFixed(0)}L)</span>
            <span className="text-sm font-medium">{formatCurrency(projections.fuelByType.premium.revenue)}</span>
          </div>
          <div className="flex justify-between py-2 px-2 border-t font-medium">
            <span className="text-sm">Total Gross Revenue</span>
            <span className="text-sm" data-testid="text-pl-gross-revenue">{formatCurrency(projections.totalGrossRevenue)}</span>
          </div>

          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">Cost of Goods Sold</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Regular 87 COGS ({projections.fuelByType.regular.litres.toFixed(0)}L × ${projections.fuelByType.regular.costPerLitre.toFixed(4)})</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.fuelByType.regular.cogs)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Diesel COGS ({projections.fuelByType.diesel.litres.toFixed(0)}L × ${projections.fuelByType.diesel.costPerLitre.toFixed(4)})</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.fuelByType.diesel.cogs)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Premium 91 COGS ({projections.fuelByType.premium.litres.toFixed(0)}L × ${projections.fuelByType.premium.costPerLitre.toFixed(4)})</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.fuelByType.premium.cogs)}</span>
          </div>
          <div className="flex justify-between py-2 px-2 border-t font-medium">
            <span className="text-sm">Total COGS</span>
            <span className="text-sm text-amber-600" data-testid="text-pl-total-cogs">-{formatCurrency(projections.totalFuelCOGS)}</span>
          </div>

          <div className="flex justify-between py-2.5 px-3 bg-blue-500/10 rounded-lg font-medium">
            <span className="text-sm">Gross Margin (Revenue - COGS)</span>
            <span className="text-sm" data-testid="text-pl-gross-margin">{formatCurrency(projections.grossMargin)}</span>
          </div>

          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">Operating Expenses</div>
          {projections.expenseBreakdown.map((exp) => (
            <div key={exp.id} className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
              <span className="text-sm text-muted-foreground pl-4">{exp.name || 'Unnamed Expense'}</span>
              <span className="text-sm font-medium text-amber-600">-{formatCurrency(exp.monthly)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 px-2 border-t font-medium">
            <span className="text-sm">Total Operating Expenses</span>
            <span className="text-sm text-amber-600" data-testid="text-pl-total-opex">-{formatCurrency(projections.monthlyOpCost)}</span>
          </div>

          <div className="flex justify-between py-2.5 px-3 bg-copper/10 rounded-lg font-medium">
            <span className="text-sm">Operating Profit (Margin - OpEx)</span>
            <span className={`text-sm ${projections.operatingProfit >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-pl-operating-profit">
              {formatCurrency(projections.operatingProfit)}
            </span>
          </div>

          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">Payment Processing</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Subscription billing ({TIER_ORDER.reduce((s, t) => s + (SUBSCRIPTION_MONTHLY_FEES[t] > 0 ? (parseInt(tierCounts[t]) || 0) : 0), 0)} charges)</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.subscriptionStripeFees)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Delivery billing ({projections.totalMonthlyDeliveries.toFixed(0)} charges)</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.deliveryStripeFees)}</span>
          </div>
          <div className="flex justify-between py-2 px-2 border-t font-medium">
            <span className="text-sm">Total Stripe Fees (2.9% + $0.30/charge)</span>
            <span className="text-sm text-amber-600">-{formatCurrency(projections.estimatedStripeFees)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-blue-500/10 rounded-lg font-medium mt-1">
            <span className="text-sm">Profit Before Tax</span>
            <span className={`text-sm ${projections.profitBeforeTax >= 0 ? '' : 'text-red-600'}`} data-testid="text-pl-profit-before-tax">
              {formatCurrency(projections.profitBeforeTax)}
            </span>
          </div>

          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">Tax & Reserves</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground">Income Tax Reserve ({taxReserveRate}%)</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.taxReserve)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground">GST Collected (5% — pass-through liability, not profit)</span>
            <span className="text-sm font-medium text-muted-foreground">{formatCurrency(projections.gstCollected)}</span>
          </div>

          <div className="flex justify-between py-3 px-4 bg-sage/15 rounded-xl mt-2">
            <span className="font-medium">Net Profit (Owner Draw)</span>
            <span className={`font-display text-xl font-bold ${projections.netProfit >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-pl-net-profit">
              {formatCurrency(projections.netProfit)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Target className="w-5 h-5 text-copper" />
            Key Business Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Gross Margin %</div>
              <div className="font-display text-xl font-bold" data-testid="text-metric-gross-margin">{projections.metrics.grossMarginPct.toFixed(1)}%</div>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Net Margin %</div>
              <div className={`font-display text-xl font-bold ${projections.metrics.netMarginPct >= 0 ? '' : 'text-red-600'}`} data-testid="text-metric-net-margin">
                {projections.metrics.netMarginPct.toFixed(1)}%
              </div>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Revenue/Customer</div>
              <div className="font-display text-xl font-bold" data-testid="text-metric-rev-per-customer">
                {formatCurrency(projections.metrics.revenuePerCustomer)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Cost/Delivery</div>
              <div className="font-display text-xl font-bold" data-testid="text-metric-cost-per-delivery">
                {formatCurrency(projections.metrics.costPerDelivery)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Break-Even Deliveries</div>
              <div className="font-display text-xl font-bold" data-testid="text-metric-breakeven">
                {projections.metrics.breakEvenDeliveries}/mo
              </div>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Total Deliveries</div>
              <div className="font-display text-xl font-bold" data-testid="text-metric-total-deliveries">
                {projections.totalMonthlyDeliveries.toFixed(0)}/mo
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-copper" />
            Annual Projection Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-sage/10 to-sage/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual Revenue</div>
              <div className="font-display text-lg font-bold" data-testid="text-annual-revenue">{formatCurrency(projections.totalGrossRevenue * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual COGS</div>
              <div className="font-display text-lg font-bold text-amber-600">{formatCurrency(projections.totalFuelCOGS * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-copper/10 to-copper/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual OpEx</div>
              <div className="font-display text-lg font-bold text-amber-600">{formatCurrency(projections.monthlyOpCost * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-sage/15 to-sage/5 border-2 border-sage/30 text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual Net Profit</div>
              <div className={`font-display text-lg font-bold ${projections.yearlyNetProfit >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-annual-net-profit">
                {formatCurrency(projections.yearlyNetProfit)}
              </div>
            </div>
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
