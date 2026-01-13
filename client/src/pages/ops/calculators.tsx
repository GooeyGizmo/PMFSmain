import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Calculator, Fuel, TrendingUp, Route, DollarSign, Plus, X, Truck, Shield, Wrench, FileText, BarChart3, Target, Users, Save, Check, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const tierConfig = {
  access: { name: 'ACCESS', monthlyFee: 24.99, deliveryFee: 12.49, discount: 0.03, color: 'bg-blue-500' },
  household: { name: 'HOUSEHOLD', monthlyFee: 49.99, deliveryFee: 0, discount: 0.05, color: 'bg-amber-500' },
  rural: { name: 'RURAL / POWER USER', monthlyFee: 99.99, deliveryFee: 0, discount: 0.07, color: 'bg-purple-500' },
  payg: { name: 'Non-Subscriber', monthlyFee: 0, deliveryFee: 19.99, discount: 0, color: 'bg-gray-400' },
};

interface Expense {
  id: string;
  name: string;
  amount: string;
  frequency: 'daily' | 'weekly' | 'monthly';
}

export default function OpsCalculators() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settingsSaved, setSettingsSaved] = useState(false);
  
  const { data: pricingData } = useQuery<{ pricing: any[] }>({
    queryKey: ['/api/fuel-pricing'],
  });

  const { data: settingsData } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['/api/ops/settings'],
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: Record<string, string>) => {
      const res = await fetch('/api/ops/settings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/settings'] });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
      toast({ title: 'Settings saved', description: 'Operating costs saved for analytics' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    },
  });

  const [expenses, setExpenses] = useState<Expense[]>([
    { id: '1', name: 'Truck Operating', amount: '100', frequency: 'daily' },
    { id: '2', name: 'Vehicle Insurance', amount: '350', frequency: 'monthly' },
    { id: '3', name: 'Maintenance Reserve', amount: '200', frequency: 'monthly' },
    { id: '4', name: 'Vehicle Lease/Payment', amount: '0', frequency: 'monthly' },
  ]);

  const [fuelCalc, setFuelCalc] = useState({
    avgLitresPerStop: '50',
    stopsPerDay: '6',
    workDaysPerWeek: '3',
    regular87Pct: '50',
    dieselPct: '30',
    premium91Pct: '20',
  });

  const [tierCounts, setTierCounts] = useState({
    access: '5',
    household: '15',
    rural: '8',
    payg: '10',
  });

  const [deliveriesPerMonth, setDeliveriesPerMonth] = useState({
    access: '2',
    household: '4',
    rural: '4',
    payg: '1',
  });

  const [goalTargets] = useState({
    month6WeeklyNet: 1200,
    month12WeeklyNet: 3850,
  });

  const [reserveRates, setReserveRates] = useState({
    incomeTaxRate: '25',
    cppRate: '9',
  });

  const [profitCalc, setProfitCalc] = useState({
    revenue: '5000',
    fuelCost: '3500',
    laborCost: '500',
    vehicleCost: '200',
    otherCost: '100',
  });

  const [routeCalc, setRouteCalc] = useState({
    totalStops: '12',
    totalDistance: '85',
    totalLitresDelivered: '720',
    fuelConsumed: '25',
    hoursWorked: '6',
  });

  const livePricing = useMemo(() => {
    const pricing = pricingData?.pricing || [];
    return {
      regular: pricing.find((p: any) => p.fuelType === 'regular') || { baseCost: '1.2893', customerPrice: '1.4444', markupPercent: '12' },
      diesel: pricing.find((p: any) => p.fuelType === 'diesel') || { baseCost: '1.2951', customerPrice: '1.6705', markupPercent: '10' },
      premium: pricing.find((p: any) => p.fuelType === 'premium') || { baseCost: '1.3451', customerPrice: '1.7863', markupPercent: '8' },
    };
  }, [pricingData]);

  const monthlyOperatingCost = useMemo(() => {
    return expenses.reduce((total, exp) => {
      const amount = parseFloat(exp.amount) || 0;
      switch (exp.frequency) {
        case 'daily': return total + (amount * 30);
        case 'weekly': return total + (amount * 4.33);
        case 'monthly': return total + amount;
        default: return total;
      }
    }, 0);
  }, [expenses]);

  const weeklyOperatingCost = monthlyOperatingCost / 4.33;
  const costPerStopPerDay = useMemo(() => {
    const workDays = parseFloat(fuelCalc.workDaysPerWeek) || 1;
    const stopsPerDay = parseFloat(fuelCalc.stopsPerDay) || 1;
    return weeklyOperatingCost / workDays / stopsPerDay;
  }, [weeklyOperatingCost, fuelCalc]);

  const fuelMargins = useMemo(() => {
    const regular = livePricing.regular;
    const diesel = livePricing.diesel;
    const premium = livePricing.premium;
    return {
      regular: parseFloat(regular.customerPrice) - parseFloat(regular.baseCost),
      diesel: parseFloat(diesel.customerPrice) - parseFloat(diesel.baseCost),
      premium: parseFloat(premium.customerPrice) - parseFloat(premium.baseCost),
    };
  }, [livePricing]);

  const avgLitres = parseFloat(fuelCalc.avgLitresPerStop) || 50;
  const reg87Pct = parseFloat(fuelCalc.regular87Pct) / 100 || 0.5;
  const dieselPct = parseFloat(fuelCalc.dieselPct) / 100 || 0.3;
  const premium91Pct = parseFloat(fuelCalc.premium91Pct) / 100 || 0.2;

  const perStopEconomics = useMemo(() => {
    const regPrice = parseFloat(livePricing.regular.customerPrice);
    const dieselPrice = parseFloat(livePricing.diesel.customerPrice);
    const premiumPrice = parseFloat(livePricing.premium.customerPrice);
    const regCost = parseFloat(livePricing.regular.baseCost);
    const dieselCost = parseFloat(livePricing.diesel.baseCost);
    const premiumCost = parseFloat(livePricing.premium.baseCost);

    const regular = {
      fuelSale: avgLitres * regPrice,
      fuelCOGS: avgLitres * regCost,
      margin: avgLitres * (regPrice - regCost),
    };
    const diesel = {
      fuelSale: avgLitres * dieselPrice,
      fuelCOGS: avgLitres * dieselCost,
      margin: avgLitres * (dieselPrice - dieselCost),
    };
    const premium = {
      fuelSale: avgLitres * premiumPrice,
      fuelCOGS: avgLitres * premiumCost,
      margin: avgLitres * (premiumPrice - premiumCost),
    };
    const weighted = {
      fuelSale: regular.fuelSale * reg87Pct + diesel.fuelSale * dieselPct + premium.fuelSale * premium91Pct,
      fuelCOGS: regular.fuelCOGS * reg87Pct + diesel.fuelCOGS * dieselPct + premium.fuelCOGS * premium91Pct,
      margin: regular.margin * reg87Pct + diesel.margin * dieselPct + premium.margin * premium91Pct,
    };
    return { regular, diesel, premium, weighted };
  }, [livePricing, avgLitres, reg87Pct, dieselPct, premium91Pct]);

  const volumeProjections = useMemo(() => {
    const stopsPerDay = parseFloat(fuelCalc.stopsPerDay) || 6;
    const workDays = parseFloat(fuelCalc.workDaysPerWeek) || 3;
    const dailyLitres = stopsPerDay * avgLitres;
    const weeklyLitres = dailyLitres * workDays;
    const monthlyLitres = weeklyLitres * 4.33;

    return {
      daily: {
        total: dailyLitres,
        regular: dailyLitres * reg87Pct,
        diesel: dailyLitres * dieselPct,
        premium: dailyLitres * premium91Pct,
      },
      weekly: {
        total: weeklyLitres,
        regular: weeklyLitres * reg87Pct,
        diesel: weeklyLitres * dieselPct,
        premium: weeklyLitres * premium91Pct,
      },
      monthly: {
        total: monthlyLitres,
        regular: monthlyLitres * reg87Pct,
        diesel: monthlyLitres * dieselPct,
        premium: monthlyLitres * premium91Pct,
      },
    };
  }, [fuelCalc, avgLitres, reg87Pct, dieselPct, premium91Pct]);

  const projections = useMemo(() => {
    const stopsPerDay = parseFloat(fuelCalc.stopsPerDay) || 6;
    const workDays = parseFloat(fuelCalc.workDaysPerWeek) || 3;
    const weeklyStops = stopsPerDay * workDays;
    const monthlyStops = weeklyStops * 4.33;

    const weeklyRevenue = weeklyStops * perStopEconomics.weighted.fuelSale;
    const monthlyRevenue = monthlyStops * perStopEconomics.weighted.fuelSale;
    const weeklyFuelCOGS = weeklyStops * perStopEconomics.weighted.fuelCOGS;
    const monthlyFuelCOGS = monthlyStops * perStopEconomics.weighted.fuelCOGS;

    // Gross profit before tax reserve
    const weeklyGrossProfit = weeklyRevenue - weeklyFuelCOGS - weeklyOperatingCost;
    const monthlyGrossProfit = monthlyRevenue - monthlyFuelCOGS - monthlyOperatingCost;
    
    // 30% tax reserve (income tax withholding)
    const taxReserveRate = 0.30;
    const weeklyTaxReserve = Math.max(0, weeklyGrossProfit * taxReserveRate);
    const monthlyTaxReserve = Math.max(0, monthlyGrossProfit * taxReserveRate);
    
    // Net profit after tax reserve
    const weeklyNetProfit = weeklyGrossProfit - weeklyTaxReserve;
    const monthlyNetProfit = monthlyGrossProfit - monthlyTaxReserve;

    return {
      weekly: { stops: weeklyStops, revenue: weeklyRevenue, fuelCOGS: weeklyFuelCOGS, operatingCost: weeklyOperatingCost, grossProfit: weeklyGrossProfit, taxReserve: weeklyTaxReserve, netProfit: weeklyNetProfit },
      monthly: { stops: monthlyStops, revenue: monthlyRevenue, fuelCOGS: monthlyFuelCOGS, operatingCost: monthlyOperatingCost, grossProfit: monthlyGrossProfit, taxReserve: monthlyTaxReserve, netProfit: monthlyNetProfit },
    };
  }, [fuelCalc, perStopEconomics, weeklyOperatingCost, monthlyOperatingCost]);

  const tierEconomics = useMemo(() => {
    const results: Record<string, any> = {};
    const avgFuelCOGSPerL = perStopEconomics.weighted.fuelCOGS / avgLitres;
    const avgPricePerL = perStopEconomics.weighted.fuelSale / avgLitres;

    Object.entries(tierConfig).forEach(([key, tier]) => {
      const count = parseInt(tierCounts[key as keyof typeof tierCounts]) || 0;
      const deliveries = parseInt(deliveriesPerMonth[key as keyof typeof deliveriesPerMonth]) || 0;
      const totalDeliveries = count * deliveries;
      const litresPerDelivery = avgLitres;
      const totalLitres = totalDeliveries * litresPerDelivery;

      const subscriptionIncome = count * tier.monthlyFee;
      const deliveryFees = key === 'payg' ? totalDeliveries * tier.deliveryFee : (key === 'access' ? totalDeliveries * tier.deliveryFee : 0);
      const fuelSales = totalLitres * (avgPricePerL - tier.discount);
      const totalRevenue = subscriptionIncome + deliveryFees + fuelSales;

      const fuelCOGS = totalLitres * avgFuelCOGSPerL;
      const operatingCostShare = (totalDeliveries / (projections.monthly.stops || 1)) * monthlyOperatingCost;
      const totalCosts = fuelCOGS + operatingCostShare;

      const profit = totalRevenue - totalCosts;
      const profitPerCustomer = count > 0 ? profit / count : 0;

      results[key] = {
        count,
        deliveries,
        totalDeliveries,
        subscriptionIncome,
        deliveryFees,
        fuelSales,
        totalRevenue,
        fuelCOGS,
        operatingCost: operatingCostShare,
        totalCosts,
        profit,
        profitPerCustomer,
      };
    });

    return results;
  }, [tierCounts, deliveriesPerMonth, perStopEconomics, avgLitres, projections, monthlyOperatingCost]);

  const combinedSummary = useMemo(() => {
    const totalCustomers = Object.values(tierCounts).reduce((sum, c) => sum + (parseInt(c) || 0), 0);
    const totalMonthlyDeliveries = Object.values(tierEconomics).reduce((sum, t) => sum + t.totalDeliveries, 0);
    const weeklyDeliveries = totalMonthlyDeliveries / 4.33;
    const weeklyLitres = volumeProjections.weekly.total;
    const monthlyLitres = volumeProjections.monthly.total;

    const subscriptionRevenue = Object.values(tierEconomics).reduce((sum, t) => sum + t.subscriptionIncome, 0);
    const deliveryFeeRevenue = Object.values(tierEconomics).reduce((sum, t) => sum + t.deliveryFees, 0);
    const fuelSalesRevenue = Object.values(tierEconomics).reduce((sum, t) => sum + t.fuelSales, 0);
    
    // STEP 1: Customer Payment (Total collected including GST)
    // GST is 5% ON TOP of prices, so total = base * 1.05
    // If we show prices as GST-inclusive, then: base = total / 1.05, GST = total - base
    const totalMonthlyRevenueWithGST = subscriptionRevenue + deliveryFeeRevenue + fuelSalesRevenue;
    const weeklyRevenueWithGST = totalMonthlyRevenueWithGST / 4.33;
    
    // STEP 2: Extract GST (5% collected, set aside for CRA)
    // GST = totalWithGST / 1.05 * 0.05 = totalWithGST * (5/105) ≈ 4.76% of total
    const monthlyGSTCollected = totalMonthlyRevenueWithGST * (5 / 105);
    const weeklyGSTCollected = weeklyRevenueWithGST * (5 / 105);
    
    // STEP 3: Net Revenue (GST-excluded)
    const monthlyNetRevenue = totalMonthlyRevenueWithGST - monthlyGSTCollected;
    const weeklyNetRevenue = weeklyRevenueWithGST - weeklyGSTCollected;
    
    // STEP 4: Cost of Goods Sold (Fuel COGS)
    const totalFuelCOGS = Object.values(tierEconomics).reduce((sum, t) => sum + t.fuelCOGS, 0);
    const weeklyFuelCOGS = totalFuelCOGS / 4.33;
    
    // STEP 5: Gross Profit (Net Revenue - COGS)
    const monthlyGrossProfit = monthlyNetRevenue - totalFuelCOGS;
    const weeklyGrossProfit = weeklyNetRevenue - weeklyFuelCOGS;
    
    // STEP 6: Operating Expenses
    const monthlyOpEx = monthlyOperatingCost;
    const weeklyOpEx = monthlyOpEx / 4.33;
    
    // STEP 7: Net Profit (Pre-Tax) = Gross Profit - Operating Expenses
    const monthlyNetProfitPreTax = monthlyGrossProfit - monthlyOpEx;
    const weeklyNetProfitPreTax = weeklyGrossProfit - weeklyOpEx;
    
    // Parse reserve rates
    const incomeTaxRate = (parseFloat(reserveRates.incomeTaxRate) || 25) / 100;
    const cppRate = (parseFloat(reserveRates.cppRate) || 9) / 100;
    
    // STEP 8: Income Tax Reserve (only on positive profit)
    const monthlyIncomeTaxReserve = Math.max(0, monthlyNetProfitPreTax * incomeTaxRate);
    const weeklyIncomeTaxReserve = Math.max(0, weeklyNetProfitPreTax * incomeTaxRate);
    
    // STEP 9: CPP Reserve (self-employed CPP contribution)
    const monthlyCPPReserve = Math.max(0, monthlyNetProfitPreTax * cppRate);
    const weeklyCPPReserve = Math.max(0, weeklyNetProfitPreTax * cppRate);
    
    // STEP 10: Available Owner Draw = Net Profit - Tax - CPP
    const monthlyOwnerDraw = monthlyNetProfitPreTax - monthlyIncomeTaxReserve - monthlyCPPReserve;
    const weeklyOwnerDraw = weeklyNetProfitPreTax - weeklyIncomeTaxReserve - weeklyCPPReserve;
    
    // Total reserves to set aside (GST + Tax + CPP)
    const monthlyTotalReserves = monthlyGSTCollected + monthlyIncomeTaxReserve + monthlyCPPReserve;
    const weeklyTotalReserves = weeklyGSTCollected + weeklyIncomeTaxReserve + weeklyCPPReserve;

    return {
      totalCustomers,
      weeklyDeliveries,
      monthlyDeliveries: totalMonthlyDeliveries,
      weeklyLitres,
      monthlyLitres,
      subscriptionRevenue,
      deliveryFeeRevenue,
      fuelSalesRevenue,
      weeklyRevenueWithGST,
      monthlyRevenueWithGST: totalMonthlyRevenueWithGST,
      weeklyGSTCollected,
      monthlyGSTCollected,
      weeklyNetRevenue,
      monthlyNetRevenue,
      weeklyFuelCOGS,
      monthlyFuelCOGS: totalFuelCOGS,
      weeklyGrossProfit,
      monthlyGrossProfit,
      weeklyOpEx,
      monthlyOpEx,
      weeklyNetProfitPreTax,
      monthlyNetProfitPreTax,
      weeklyIncomeTaxReserve,
      monthlyIncomeTaxReserve,
      weeklyCPPReserve,
      monthlyCPPReserve,
      weeklyOwnerDraw,
      monthlyOwnerDraw,
      weeklyTotalReserves,
      monthlyTotalReserves,
    };
  }, [tierCounts, tierEconomics, volumeProjections, monthlyOperatingCost, reserveRates]);

  const addExpense = () => {
    setExpenses([...expenses, { id: crypto.randomUUID(), name: '', amount: '0', frequency: 'monthly' }]);
  };

  const removeExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  const updateExpense = (id: string, field: keyof Expense, value: string) => {
    setExpenses(expenses.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const revenue = parseFloat(profitCalc.revenue) || 0;
  const totalCosts = parseFloat(profitCalc.fuelCost) + parseFloat(profitCalc.laborCost) + parseFloat(profitCalc.vehicleCost) + parseFloat(profitCalc.otherCost);
  const grossProfit = revenue - totalCosts;
  const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const totalStops = parseFloat(routeCalc.totalStops) || 0;
  const totalDistance = parseFloat(routeCalc.totalDistance) || 0;
  const totalLitresDelivered = parseFloat(routeCalc.totalLitresDelivered) || 0;
  const fuelConsumed = parseFloat(routeCalc.fuelConsumed) || 0;
  const hoursWorked = parseFloat(routeCalc.hoursWorked) || 0;
  const avgStopsPerHour = hoursWorked > 0 ? totalStops / hoursWorked : 0;
  const avgLitresPerStop = totalStops > 0 ? totalLitresDelivered / totalStops : 0;
  const avgDistancePerStop = totalStops > 0 ? totalDistance / totalStops : 0;
  const deliveryEfficiency = fuelConsumed > 0 ? totalLitresDelivered / fuelConsumed : 0;

  const tierRanking = Object.entries(tierEconomics)
    .sort((a, b) => b[1].profitPerCustomer - a[1].profitPerCustomer)
    .map(([key, data], i) => ({ rank: i + 1, tier: key, ...data }));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/ops">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-copper" />
                <span className="font-display font-bold text-foreground">Business Calculators</span>
                <Badge variant="outline" className="text-xs border-copper/30 text-copper">Operations</Badge>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Tabs defaultValue="pricing" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="pricing" className="flex items-center gap-2">
              <Fuel className="w-4 h-4" />
              Fuel & Revenue
            </TabsTrigger>
            <TabsTrigger value="profit" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Profit Margin
            </TabsTrigger>
            <TabsTrigger value="route" className="flex items-center gap-2">
              <Route className="w-4 h-4" />
              Route Efficiency
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pricing" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Truck className="w-5 h-5 text-copper" />
                  Operating Costs
                </CardTitle>
                <CardDescription>
                  Enter your business operating expenses with their frequency - costs are automatically converted to monthly totals
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {expenses.map((expense, i) => (
                  <div key={expense.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                      {i === 0 ? <Truck className="w-4 h-4 text-muted-foreground" /> :
                       i === 1 ? <Shield className="w-4 h-4 text-muted-foreground" /> :
                       i === 2 ? <Wrench className="w-4 h-4 text-muted-foreground" /> :
                       <FileText className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <Input
                      value={expense.name}
                      onChange={(e) => updateExpense(expense.id, 'name', e.target.value)}
                      className="flex-1"
                      placeholder="Expense name"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={expense.amount}
                        onChange={(e) => updateExpense(expense.id, 'amount', e.target.value)}
                        className="w-24"
                      />
                    </div>
                    <Select value={expense.frequency} onValueChange={(v) => updateExpense(expense.id, 'frequency', v as any)}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground w-24">
                      + ${((parseFloat(expense.amount) || 0) * (expense.frequency === 'daily' ? 30 : expense.frequency === 'weekly' ? 4.33 : 1)).toFixed(2)}/mo
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => removeExpense(expense.id)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" onClick={addExpense} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Expense
                </Button>

                <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Monthly Operating Cost</p>
                      <p className="font-display text-2xl font-bold text-foreground">${monthlyOperatingCost.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Based on {fuelCalc.workDaysPerWeek} work days/week. This cost is used in the revenue calculators below.</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Weekly Equivalent</p>
                      <p className="font-display text-xl font-bold text-copper">${weeklyOperatingCost.toFixed(2)}/week</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-amber-500/30">
                    <Button 
                      onClick={() => saveSettingsMutation.mutate({ 
                        operatingCosts: monthlyOperatingCost.toFixed(2),
                        taxReserveRate: '30',
                      })}
                      disabled={saveSettingsMutation.isPending}
                      className="gap-2"
                      variant="outline"
                    >
                      {settingsSaved ? (
                        <>
                          <Check className="w-4 h-4 text-green-500" />
                          Saved to Analytics
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          {saveSettingsMutation.isPending ? 'Saving...' : 'Save to Analytics'}
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">Saves operating costs for use in Business Analytics profitability calculations</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Fuel className="w-5 h-5 text-copper" />
                  Fuel Pricing Calculator
                </CardTitle>
                <CardDescription>
                  Model per-stop economics, margins, and weekly profitability using your live Ops Dashboard pricing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-xl bg-muted/50">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Fuel className="w-4 h-4 text-copper" />
                    Live Fuel Pricing (from Ops Dashboard)
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 rounded-lg bg-red-500/10 border-l-4 border-red-500">
                      <p className="text-xs text-muted-foreground">Regular 87 Gas</p>
                      <p className="text-xs text-muted-foreground">Mkt Cost: ${parseFloat(livePricing.regular.baseCost).toFixed(4)}</p>
                      <p className="text-xs text-muted-foreground">Markup: ${(parseFloat(livePricing.regular.customerPrice) - parseFloat(livePricing.regular.baseCost)).toFixed(2)} + {livePricing.regular.markupPercent}%</p>
                      <p className="font-display font-bold text-foreground">Retail: ${parseFloat(livePricing.regular.customerPrice).toFixed(4)}</p>
                      <p className="text-xs text-sage">Margin/L: +${fuelMargins.regular.toFixed(2)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-500/10 border-l-4 border-green-500">
                      <p className="text-xs text-muted-foreground">Diesel</p>
                      <p className="text-xs text-muted-foreground">Mkt Cost: ${parseFloat(livePricing.diesel.baseCost).toFixed(4)}</p>
                      <p className="text-xs text-muted-foreground">Markup: ${(parseFloat(livePricing.diesel.customerPrice) - parseFloat(livePricing.diesel.baseCost)).toFixed(2)} + {livePricing.diesel.markupPercent}%</p>
                      <p className="font-display font-bold text-foreground">Retail: ${parseFloat(livePricing.diesel.customerPrice).toFixed(4)}</p>
                      <p className="text-xs text-sage">Margin/L: +${fuelMargins.diesel.toFixed(2)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-500/10 border-l-4 border-amber-500">
                      <p className="text-xs text-muted-foreground">Premium 91 Gas</p>
                      <p className="text-xs text-muted-foreground">Mkt Cost: ${parseFloat(livePricing.premium.baseCost).toFixed(4)}</p>
                      <p className="text-xs text-muted-foreground">Markup: ${(parseFloat(livePricing.premium.customerPrice) - parseFloat(livePricing.premium.baseCost)).toFixed(2)} + {livePricing.premium.markupPercent}%</p>
                      <p className="font-display font-bold text-foreground">Retail: ${parseFloat(livePricing.premium.customerPrice).toFixed(4)}</p>
                      <p className="text-xs text-sage">Margin/L: +${fuelMargins.premium.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Avg Litres/Stop</Label>
                    <Input type="number" value={fuelCalc.avgLitresPerStop} onChange={(e) => setFuelCalc(p => ({ ...p, avgLitresPerStop: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Stops/Day</Label>
                    <Input type="number" value={fuelCalc.stopsPerDay} onChange={(e) => setFuelCalc(p => ({ ...p, stopsPerDay: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Work Days/Week</Label>
                    <Input type="number" value={fuelCalc.workDaysPerWeek} onChange={(e) => setFuelCalc(p => ({ ...p, workDaysPerWeek: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Regular 87 (%)</Label>
                    <Input type="number" value={fuelCalc.regular87Pct} onChange={(e) => setFuelCalc(p => ({ ...p, regular87Pct: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Diesel (%)</Label>
                    <Input type="number" value={fuelCalc.dieselPct} onChange={(e) => setFuelCalc(p => ({ ...p, dieselPct: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Premium 91 (%)</Label>
                    <Input type="number" value={fuelCalc.premium91Pct} onChange={(e) => setFuelCalc(p => ({ ...p, premium91Pct: e.target.value }))} />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-muted/50">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-copper" />
                    Per-Stop Economics by Fuel Type
                  </p>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-background border">
                      <p className="text-xs text-muted-foreground">Regular 87 Gas ({fuelCalc.regular87Pct}% of stops)</p>
                      <p className="text-sm">Fuel Sale: <span className="font-semibold">${perStopEconomics.regular.fuelSale.toFixed(2)}</span></p>
                      <p className="text-sm">Fuel COGS: <span className="text-destructive">-${perStopEconomics.regular.fuelCOGS.toFixed(2)}</span></p>
                      <p className="text-sm">Fuel Margin: <span className="text-sage">${perStopEconomics.regular.margin.toFixed(2)}</span></p>
                    </div>
                    <div className="p-3 rounded-lg bg-background border">
                      <p className="text-xs text-muted-foreground">Diesel ({fuelCalc.dieselPct}% of stops)</p>
                      <p className="text-sm">Fuel Sale: <span className="font-semibold">${perStopEconomics.diesel.fuelSale.toFixed(2)}</span></p>
                      <p className="text-sm">Fuel COGS: <span className="text-destructive">-${perStopEconomics.diesel.fuelCOGS.toFixed(2)}</span></p>
                      <p className="text-sm">Fuel Margin: <span className="text-sage">${perStopEconomics.diesel.margin.toFixed(2)}</span></p>
                    </div>
                    <div className="p-3 rounded-lg bg-background border">
                      <p className="text-xs text-muted-foreground">Premium 91 Gas ({fuelCalc.premium91Pct}% of stops)</p>
                      <p className="text-sm">Fuel Sale: <span className="font-semibold">${perStopEconomics.premium.fuelSale.toFixed(2)}</span></p>
                      <p className="text-sm">Fuel COGS: <span className="text-destructive">-${perStopEconomics.premium.fuelCOGS.toFixed(2)}</span></p>
                      <p className="text-sm">Fuel Margin: <span className="text-sage">${perStopEconomics.premium.margin.toFixed(2)}</span></p>
                    </div>
                    <div className="p-3 rounded-lg bg-copper/10 border border-copper/30">
                      <p className="text-xs text-muted-foreground">Weighted Average</p>
                      <p className="text-sm">Fuel Sale: <span className="font-semibold">${perStopEconomics.weighted.fuelSale.toFixed(2)}</span></p>
                      <p className="text-sm">Fuel COGS: <span className="text-destructive">-${perStopEconomics.weighted.fuelCOGS.toFixed(2)}</span></p>
                      <p className="text-sm font-bold">Fuel Margin: <span className="text-sage">${perStopEconomics.weighted.margin.toFixed(2)}</span></p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-muted/50">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-copper" />
                    Volume Projections
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-background border text-center">
                      <p className="text-sm text-muted-foreground">Daily Volume</p>
                      <p className="font-display text-2xl font-bold text-foreground">{volumeProjections.daily.total.toFixed(0)} L</p>
                      <div className="text-xs text-muted-foreground mt-2 space-y-1">
                        <p>Regular 87: {volumeProjections.daily.regular.toFixed(0)} L</p>
                        <p>Diesel: {volumeProjections.daily.diesel.toFixed(0)} L</p>
                        <p>Premium 91: {volumeProjections.daily.premium.toFixed(0)} L</p>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-background border text-center">
                      <p className="text-sm text-muted-foreground">Weekly Volume</p>
                      <p className="font-display text-2xl font-bold text-foreground">{volumeProjections.weekly.total.toFixed(0)} L</p>
                      <div className="text-xs text-muted-foreground mt-2 space-y-1">
                        <p>Regular 87: {volumeProjections.weekly.regular.toFixed(0)} L</p>
                        <p>Diesel: {volumeProjections.weekly.diesel.toFixed(0)} L</p>
                        <p>Premium 91: {volumeProjections.weekly.premium.toFixed(0)} L</p>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-background border text-center">
                      <p className="text-sm text-muted-foreground">Monthly Volume</p>
                      <p className="font-display text-2xl font-bold text-foreground">{volumeProjections.monthly.total.toFixed(0)} L</p>
                      <div className="text-xs text-muted-foreground mt-2 space-y-1">
                        <p>Regular 87: {volumeProjections.monthly.regular.toFixed(0)} L</p>
                        <p>Diesel: {volumeProjections.monthly.diesel.toFixed(0)} L</p>
                        <p>Premium 91: {volumeProjections.monthly.premium.toFixed(0)} L</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-background border">
                    <p className="text-sm font-medium mb-3">Weekly Projection</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span>Total Stops:</span><span className="font-medium">{projections.weekly.stops.toFixed(0)}</span></div>
                      <div className="flex justify-between"><span>Revenue:</span><span className="font-medium">${projections.weekly.revenue.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Fuel COGS:</span><span className="text-destructive">-${projections.weekly.fuelCOGS.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Operating (${costPerStopPerDay.toFixed(2)}/stop):</span><span className="text-destructive">-${projections.weekly.operatingCost.toFixed(2)}</span></div>
                      <div className="h-px bg-border my-2" />
                      <div className="flex justify-between"><span>Gross Profit:</span><span className={projections.weekly.grossProfit >= 0 ? 'text-sage' : 'text-destructive'}>${projections.weekly.grossProfit.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Tax Reserve (30%):</span><span className="text-destructive">-${projections.weekly.taxReserve.toFixed(2)}</span></div>
                      <div className="h-px bg-border my-2" />
                      <div className="flex justify-between font-bold"><span>Net Profit:</span><span className={projections.weekly.netProfit >= 0 ? 'text-sage' : 'text-destructive'}>${projections.weekly.netProfit.toFixed(2)}</span></div>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-background border">
                    <p className="text-sm font-medium mb-3">Monthly Projection</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span>Total Stops:</span><span className="font-medium">{projections.monthly.stops.toFixed(0)}</span></div>
                      <div className="flex justify-between"><span>Revenue:</span><span className="font-medium">${projections.monthly.revenue.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Fuel COGS:</span><span className="text-destructive">-${projections.monthly.fuelCOGS.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Operating Costs:</span><span className="text-destructive">-${projections.monthly.operatingCost.toFixed(2)}</span></div>
                      <div className="h-px bg-border my-2" />
                      <div className="flex justify-between"><span>Gross Profit:</span><span className={projections.monthly.grossProfit >= 0 ? 'text-sage' : 'text-destructive'}>${projections.monthly.grossProfit.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Tax Reserve (30%):</span><span className="text-destructive">-${projections.monthly.taxReserve.toFixed(2)}</span></div>
                      <div className="h-px bg-border my-2" />
                      <div className="flex justify-between font-bold"><span>Est. Net Profit:</span><span className={projections.monthly.netProfit >= 0 ? 'text-sage' : 'text-destructive'}>${projections.monthly.netProfit.toFixed(2)}</span></div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-sage/10 border border-sage/30">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-sage" />
                    Goal Progress
                  </p>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Month 6 Target: ${goalTargets.month6WeeklyNet}/week net</span>
                        <span>{Math.min((projections.weekly.netProfit / goalTargets.month6WeeklyNet) * 100, 100).toFixed(0)}%</span>
                      </div>
                      <Progress value={Math.min((projections.weekly.netProfit / goalTargets.month6WeeklyNet) * 100, 100)} className="h-3" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Month 12 Target: ${goalTargets.month12WeeklyNet}/week revenue</span>
                        <span>{Math.min((projections.weekly.revenue / goalTargets.month12WeeklyNet) * 100, 100).toFixed(0)}%</span>
                      </div>
                      <Progress value={Math.min((projections.weekly.revenue / goalTargets.month12WeeklyNet) * 100, 100)} className="h-3" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Users className="w-5 h-5 text-copper" />
                  Subscription Revenue Calculator
                </CardTitle>
                <CardDescription>
                  Model revenue based on customer counts per tier - separating recurring subscription income from delivery revenue
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-xl bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-3">
                    Using fuel economics: ${perStopEconomics.weighted.fuelSale.toFixed(2)} avg fuel sale, ${perStopEconomics.weighted.fuelCOGS.toFixed(2)} COGS, $14.28 margin per 40L delivery
                    <br />
                    Operating cost: ${monthlyOperatingCost.toFixed(2)}/month total = ${costPerStopPerDay.toFixed(2)}/stop ({projections.monthly.stops.toFixed(0)} projected deliveries)
                  </p>
                  <p className="text-sm font-medium mb-3">Customer Counts by Tier</p>
                  <div className="grid grid-cols-4 gap-4">
                    {Object.entries(tierConfig).map(([key, tier]) => (
                      <div key={key} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded ${tier.color}`} />
                          <Label className="text-xs">{tier.name}</Label>
                        </div>
                        <Input
                          type="number"
                          value={tierCounts[key as keyof typeof tierCounts]}
                          onChange={(e) => setTierCounts(p => ({ ...p, [key]: e.target.value }))}
                          className="text-center"
                        />
                        <p className="text-xs text-muted-foreground text-center">
                          {key === 'payg' ? 'Avg $19.99/delivery fee' : `$${tier.monthlyFee}/mo`}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-center mt-3">Total Customers: {Object.values(tierCounts).reduce((sum, c) => sum + (parseInt(c) || 0), 0)}</p>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-medium">Per-Tier Monthly Economics</p>
                  {Object.entries(tierConfig).map(([key, tier]) => {
                    const econ = tierEconomics[key];
                    if (!econ || econ.count === 0) return null;
                    return (
                      <div key={key} className="p-4 rounded-lg border" style={{ borderLeftWidth: 4, borderLeftColor: key === 'access' ? '#3b82f6' : key === 'household' ? '#f59e0b' : key === 'rural' ? '#8b5cf6' : '#9ca3af' }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded ${tier.color}`} />
                            <span className="font-medium">{tier.name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{econ.count} customers</span>
                            <div className="flex items-center gap-2">
                              <span>Deliveries/Month:</span>
                              <Input
                                type="number"
                                value={deliveriesPerMonth[key as keyof typeof deliveriesPerMonth]}
                                onChange={(e) => setDeliveriesPerMonth(p => ({ ...p, [key]: e.target.value }))}
                                className="w-16 h-7 text-center"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground mb-1">Monthly Revenue</p>
                            <p>Subscription Income: ${econ.subscriptionIncome.toFixed(2)}</p>
                            <p>Delivery Fees: ${econ.deliveryFees.toFixed(2)}</p>
                            <p>Fuel Sales ({econ.totalDeliveries} deliveries): ${econ.fuelSales.toFixed(2)}</p>
                            <p className="font-semibold mt-1">Total Revenue: ${econ.totalRevenue.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">Monthly Costs</p>
                            <p>Fuel COGS: <span className="text-destructive">-${econ.fuelCOGS.toFixed(2)}</span></p>
                            <p>Operating (${costPerStopPerDay.toFixed(2)}/stop): <span className="text-destructive">-${econ.operatingCost.toFixed(2)}</span></p>
                          </div>
                          <div className="flex flex-col justify-center">
                            <p className="text-muted-foreground mb-1">Monthly Profit:</p>
                            <p className={`font-display text-xl font-bold ${econ.profit >= 0 ? 'text-sage' : 'text-destructive'}`}>${econ.profit.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">Per Customer: ${econ.profitPerCustomer.toFixed(2)}/mo</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 rounded-xl bg-muted/50">
                  <p className="text-sm font-medium mb-3">Tier Profitability Ranking</p>
                  <div className="space-y-2">
                    {tierRanking.filter(t => t.count > 0).map((t) => (
                      <div key={t.tier} className="flex items-center gap-3 text-sm">
                        <span className="font-bold text-copper">#{t.rank}</span>
                        <span className="flex-1">{tierConfig[t.tier as keyof typeof tierConfig].name}</span>
                        <span className="text-sage font-semibold">${t.profitPerCustomer.toFixed(2)}/customer/mo</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-copper/10 border border-copper/30">
                  <p className="text-sm font-medium mb-3">Business Summary</p>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Monthly Revenue Breakdown</p>
                      <p className="text-sm">Recurring Subscription Income: ${combinedSummary.subscriptionRevenue.toFixed(2)}</p>
                      <p className="text-sm">Delivery Fee Income: ${combinedSummary.deliveryFeeRevenue.toFixed(2)}</p>
                      <p className="text-sm">Fuel Sales ({combinedSummary.monthlyDeliveries.toFixed(0)} deliveries): ${combinedSummary.fuelSalesRevenue.toFixed(2)}</p>
                      <p className="text-sm font-bold mt-2">Total (GST-inclusive): ${combinedSummary.monthlyRevenueWithGST.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Cash Flow Summary</p>
                      <p className="text-sm">GST to Set Aside: <span className="text-amber-600">-${combinedSummary.monthlyGSTCollected.toFixed(2)}</span></p>
                      <p className="text-sm">Net Revenue: ${combinedSummary.monthlyNetRevenue.toFixed(2)}</p>
                      <p className="text-sm">COGS + OpEx: <span className="text-destructive">-${(combinedSummary.monthlyFuelCOGS + combinedSummary.monthlyOpEx).toFixed(2)}</span></p>
                      <p className="text-sm">Net Profit (Pre-Tax): <span className={combinedSummary.monthlyNetProfitPreTax >= 0 ? 'text-sage' : 'text-destructive'}>${combinedSummary.monthlyNetProfitPreTax.toFixed(2)}</span></p>
                      <p className="text-sm font-bold mt-2">Owner Draw: <span className={combinedSummary.monthlyOwnerDraw >= 0 ? 'text-sage' : 'text-destructive'}>${combinedSummary.monthlyOwnerDraw.toFixed(2)}</span></p>
                      <p className="text-xs text-muted-foreground">Weekly Equivalent: ${combinedSummary.weeklyOwnerDraw.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-copper/30 bg-gradient-to-br from-copper/5 to-brass/5">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-copper" />
                  Cash Flow Waterfall
                </CardTitle>
                <CardDescription>
                  Complete money flow from customer payment to owner draw (based on your subscription customer projections)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2 text-blue-600">
                    <BarChart3 className="w-4 h-4" />
                    Volume Summary
                  </p>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Customers</p>
                      <p className="font-display text-xl font-bold">{combinedSummary.totalCustomers}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Weekly Stops</p>
                      <p className="font-display text-xl font-bold">{combinedSummary.weeklyDeliveries.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Monthly Stops</p>
                      <p className="font-display text-xl font-bold">{combinedSummary.monthlyDeliveries.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Monthly Litres</p>
                      <p className="font-display text-xl font-bold">{combinedSummary.monthlyLitres.toFixed(0)}L</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-muted/30 border">
                  <p className="text-sm font-medium mb-4 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-copper" />
                    Reserve Rate Settings
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Income Tax Rate (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={reserveRates.incomeTaxRate}
                        onChange={(e) => setReserveRates(prev => ({ ...prev, incomeTaxRate: e.target.value }))}
                        className="h-8"
                      />
                      <p className="text-xs text-muted-foreground">Recommended: 25-30%</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">CPP Rate (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="20"
                        step="0.1"
                        value={reserveRates.cppRate}
                        onChange={(e) => setReserveRates(prev => ({ ...prev, cppRate: e.target.value }))}
                        className="h-8"
                      />
                      <p className="text-xs text-muted-foreground">Self-employed: 9-12%</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-sage/20 border border-sage/40">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-sage" />
                      <span className="font-medium">Customer Payment (GST-inclusive)</span>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-bold text-sage">${combinedSummary.monthlyRevenueWithGST.toFixed(2)}/mo</p>
                      <p className="text-xs text-muted-foreground">${combinedSummary.weeklyRevenueWithGST.toFixed(2)}/wk</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <div className="w-px h-4 bg-border"></div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600">−</span>
                      <span className="text-sm">GST Collected (5%, set aside for CRA)</span>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-amber-600">−${combinedSummary.monthlyGSTCollected.toFixed(2)}/mo</p>
                      <p className="text-xs text-muted-foreground">−${combinedSummary.weeklyGSTCollected.toFixed(2)}/wk</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <div className="w-px h-4 bg-border"></div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600">=</span>
                      <span className="font-medium">Net Revenue (GST-excluded)</span>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-bold text-blue-600">${combinedSummary.monthlyNetRevenue.toFixed(2)}/mo</p>
                      <p className="text-xs text-muted-foreground">${combinedSummary.weeklyNetRevenue.toFixed(2)}/wk</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <div className="w-px h-4 bg-border"></div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="flex items-center gap-2">
                      <span className="text-red-600">−</span>
                      <span className="text-sm">Cost of Goods Sold (Fuel COGS)</span>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-red-600">−${combinedSummary.monthlyFuelCOGS.toFixed(2)}/mo</p>
                      <p className="text-xs text-muted-foreground">−${combinedSummary.weeklyFuelCOGS.toFixed(2)}/wk</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <div className="w-px h-4 bg-border"></div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background border-2">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground">=</span>
                      <span className="font-medium">Gross Profit</span>
                    </div>
                    <div className="text-right">
                      <p className={`font-display text-lg font-bold ${combinedSummary.monthlyGrossProfit >= 0 ? 'text-sage' : 'text-destructive'}`}>${combinedSummary.monthlyGrossProfit.toFixed(2)}/mo</p>
                      <p className="text-xs text-muted-foreground">${combinedSummary.weeklyGrossProfit.toFixed(2)}/wk</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <div className="w-px h-4 bg-border"></div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="flex items-center gap-2">
                      <span className="text-red-600">−</span>
                      <span className="text-sm">Operating Expenses</span>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-red-600">−${combinedSummary.monthlyOpEx.toFixed(2)}/mo</p>
                      <p className="text-xs text-muted-foreground">−${combinedSummary.weeklyOpEx.toFixed(2)}/wk</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <div className="w-px h-4 bg-border"></div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background border-2">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground">=</span>
                      <span className="font-medium">Net Profit (Pre-Tax)</span>
                    </div>
                    <div className="text-right">
                      <p className={`font-display text-lg font-bold ${combinedSummary.monthlyNetProfitPreTax >= 0 ? 'text-sage' : 'text-destructive'}`}>${combinedSummary.monthlyNetProfitPreTax.toFixed(2)}/mo</p>
                      <p className="text-xs text-muted-foreground">${combinedSummary.weeklyNetProfitPreTax.toFixed(2)}/wk</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <div className="w-px h-4 bg-border"></div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600">−</span>
                      <span className="text-sm">Income Tax Reserve ({reserveRates.incomeTaxRate}%)</span>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-amber-600">−${combinedSummary.monthlyIncomeTaxReserve.toFixed(2)}/mo</p>
                      <p className="text-xs text-muted-foreground">−${combinedSummary.weeklyIncomeTaxReserve.toFixed(2)}/wk</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <div className="w-px h-4 bg-border"></div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600">−</span>
                      <span className="text-sm">CPP Reserve ({reserveRates.cppRate}%)</span>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-amber-600">−${combinedSummary.monthlyCPPReserve.toFixed(2)}/mo</p>
                      <p className="text-xs text-muted-foreground">−${combinedSummary.weeklyCPPReserve.toFixed(2)}/wk</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <div className="w-px h-4 bg-border"></div>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-sage/20 to-copper/20 border-2 border-sage">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-sage" />
                      <span className="font-bold">Available Owner Draw</span>
                    </div>
                    <div className="text-right">
                      <p className={`font-display text-2xl font-bold ${combinedSummary.monthlyOwnerDraw >= 0 ? 'text-sage' : 'text-destructive'}`}>${combinedSummary.monthlyOwnerDraw.toFixed(2)}/mo</p>
                      <p className="text-sm text-muted-foreground">${combinedSummary.weeklyOwnerDraw.toFixed(2)}/wk</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2 text-amber-600">
                    <Shield className="w-4 h-4" />
                    Total Monthly Set-Asides (Move to Savings)
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-2 rounded-lg bg-background">
                      <p className="text-xs text-muted-foreground">GST</p>
                      <p className="font-bold text-amber-600">${combinedSummary.monthlyGSTCollected.toFixed(2)}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-background">
                      <p className="text-xs text-muted-foreground">Tax ({reserveRates.incomeTaxRate}%)</p>
                      <p className="font-bold text-amber-600">${combinedSummary.monthlyIncomeTaxReserve.toFixed(2)}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-background">
                      <p className="text-xs text-muted-foreground">CPP ({reserveRates.cppRate}%)</p>
                      <p className="font-bold text-amber-600">${combinedSummary.monthlyCPPReserve.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-amber-500/30 flex justify-between items-center">
                    <span className="text-sm font-medium">Total to Set Aside:</span>
                    <span className="font-display text-xl font-bold text-amber-700">${combinedSummary.monthlyTotalReserves.toFixed(2)}/mo</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-sage/10 border border-sage/30">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-sage" />
                    Goal Progress (Based on Owner Draw)
                  </p>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Month 6: ${goalTargets.month6WeeklyNet}/wk</span>
                        <span>{Math.min((combinedSummary.weeklyOwnerDraw / goalTargets.month6WeeklyNet) * 100, 100).toFixed(0)}%</span>
                      </div>
                      <Progress value={Math.min((combinedSummary.weeklyOwnerDraw / goalTargets.month6WeeklyNet) * 100, 100)} className="h-3" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Month 12: ${goalTargets.month12WeeklyNet}/wk</span>
                        <span>{Math.min((combinedSummary.weeklyOwnerDraw / goalTargets.month12WeeklyNet) * 100, 100).toFixed(0)}%</span>
                      </div>
                      <Progress value={Math.min((combinedSummary.weeklyOwnerDraw / goalTargets.month12WeeklyNet) * 100, 100)} className="h-3" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profit" className="space-y-6 mt-6">
            <div>
              <motion.h1 
                className="font-display text-2xl font-bold text-foreground"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Profit Margin Analysis
              </motion.h1>
              <p className="text-muted-foreground mt-1">
                True profit margins based on your Cash Flow Waterfall projections
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-sage" />
                    Monthly Revenue Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm">Subscription Income</span>
                    <span className="font-display font-bold text-sage">${combinedSummary.subscriptionRevenue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm">Delivery Fee Income</span>
                    <span className="font-display font-bold text-sage">${combinedSummary.deliveryFeeRevenue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm">Fuel Sales Revenue</span>
                    <span className="font-display font-bold text-sage">${combinedSummary.fuelSalesRevenue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-amber-500/50">
                    <span className="text-sm text-amber-600">− GST Collected (set aside)</span>
                    <span className="font-display font-bold text-amber-600">−${combinedSummary.monthlyGSTCollected.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-sage/10 rounded px-2">
                    <span className="font-medium">Net Revenue (GST-excluded)</span>
                    <span className="font-display text-xl font-bold text-sage">${combinedSummary.monthlyNetRevenue.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-red-500 rotate-180" />
                    Monthly Costs Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm">Fuel COGS (Cost of Goods Sold)</span>
                    <span className="font-display font-bold text-red-500">${combinedSummary.monthlyFuelCOGS.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm">Operating Expenses</span>
                    <span className="font-display font-bold text-red-500">${combinedSummary.monthlyOpEx.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-muted/50 rounded px-2">
                    <span className="font-medium">Total Costs</span>
                    <span className="font-display text-xl font-bold text-red-600">${(combinedSummary.monthlyFuelCOGS + combinedSummary.monthlyOpEx).toFixed(2)}</span>
                  </div>
                  <div className="pt-3 mt-3 border-t space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Reserve Set-Asides (from Net Profit)</p>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-amber-600">Income Tax ({reserveRates.incomeTaxRate}%)</span>
                      <span className="text-amber-600">${combinedSummary.monthlyIncomeTaxReserve.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-amber-600">CPP ({reserveRates.cppRate}%)</span>
                      <span className="text-amber-600">${combinedSummary.monthlyCPPReserve.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-gradient-to-r from-copper/5 to-brass/5 border-copper/30">
              <CardHeader>
                <CardTitle className="font-display">Profit Margin Analysis</CardTitle>
                <CardDescription>Based on your projected {combinedSummary.totalCustomers} customers and {combinedSummary.monthlyDeliveries.toFixed(0)} monthly deliveries</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-background text-center">
                    <p className="text-xs text-muted-foreground mb-1">Gross Margin</p>
                    <p className="font-display text-2xl font-bold text-sage">
                      {combinedSummary.monthlyNetRevenue > 0 ? ((combinedSummary.monthlyGrossProfit / combinedSummary.monthlyNetRevenue) * 100).toFixed(1) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">(Revenue − COGS) / Revenue</p>
                  </div>
                  <div className="p-4 rounded-xl bg-background text-center">
                    <p className="text-xs text-muted-foreground mb-1">Operating Margin</p>
                    <p className={`font-display text-2xl font-bold ${combinedSummary.monthlyNetProfitPreTax >= 0 ? 'text-sage' : 'text-destructive'}`}>
                      {combinedSummary.monthlyNetRevenue > 0 ? ((combinedSummary.monthlyNetProfitPreTax / combinedSummary.monthlyNetRevenue) * 100).toFixed(1) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">(Revenue − COGS − OpEx) / Revenue</p>
                  </div>
                  <div className="p-4 rounded-xl bg-background text-center">
                    <p className="text-xs text-muted-foreground mb-1">Net Margin (After Reserves)</p>
                    <p className={`font-display text-2xl font-bold ${combinedSummary.monthlyOwnerDraw >= 0 ? 'text-copper' : 'text-destructive'}`}>
                      {combinedSummary.monthlyNetRevenue > 0 ? ((combinedSummary.monthlyOwnerDraw / combinedSummary.monthlyNetRevenue) * 100).toFixed(1) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Owner Draw / Revenue</p>
                  </div>
                  <div className="p-4 rounded-xl bg-sage/10 border border-sage/30 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Monthly Owner Draw</p>
                    <p className={`font-display text-2xl font-bold ${combinedSummary.monthlyOwnerDraw >= 0 ? 'text-sage' : 'text-destructive'}`}>
                      ${combinedSummary.monthlyOwnerDraw.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">${combinedSummary.weeklyOwnerDraw.toFixed(2)}/week</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                    <p className="text-sm font-medium text-blue-600 mb-2">Gross Profit</p>
                    <p className="font-display text-xl font-bold">${combinedSummary.monthlyGrossProfit.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Net Revenue − Fuel COGS</p>
                  </div>
                  <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
                    <p className="text-sm font-medium text-purple-600 mb-2">Net Profit (Pre-Tax)</p>
                    <p className={`font-display text-xl font-bold ${combinedSummary.monthlyNetProfitPreTax >= 0 ? '' : 'text-destructive'}`}>${combinedSummary.monthlyNetProfitPreTax.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Gross Profit − Operating Expenses</p>
                  </div>
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                    <p className="text-sm font-medium text-amber-600 mb-2">Total Reserves</p>
                    <p className="font-display text-xl font-bold text-amber-600">${combinedSummary.monthlyTotalReserves.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">GST + Tax + CPP set aside</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="route" className="space-y-6 mt-6">
            <div>
              <motion.h1 
                className="font-display text-2xl font-bold text-foreground"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Route Efficiency Calculator
              </motion.h1>
              <p className="text-muted-foreground mt-1">
                Analyze route performance metrics for optimization
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-display">Route Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Total Stops</Label>
                    <Input type="number" value={routeCalc.totalStops} onChange={(e) => setRouteCalc(prev => ({ ...prev, totalStops: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Distance (km)</Label>
                    <Input type="number" value={routeCalc.totalDistance} onChange={(e) => setRouteCalc(prev => ({ ...prev, totalDistance: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Litres Delivered</Label>
                    <Input type="number" value={routeCalc.totalLitresDelivered} onChange={(e) => setRouteCalc(prev => ({ ...prev, totalLitresDelivered: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fuel Consumed (L)</Label>
                    <Input type="number" value={routeCalc.fuelConsumed} onChange={(e) => setRouteCalc(prev => ({ ...prev, fuelConsumed: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Hours Worked</Label>
                    <Input type="number" step="0.5" value={routeCalc.hoursWorked} onChange={(e) => setRouteCalc(prev => ({ ...prev, hoursWorked: e.target.value }))} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-copper/5 to-brass/5 border-copper/30">
              <CardHeader>
                <CardTitle className="font-display">Efficiency Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Stops/Hour</p>
                    <p className="font-display text-2xl font-bold text-foreground">{avgStopsPerHour.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg L/Stop</p>
                    <p className="font-display text-2xl font-bold text-foreground">{avgLitresPerStop.toFixed(1)}L</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg km/Stop</p>
                    <p className="font-display text-2xl font-bold text-foreground">{avgDistancePerStop.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Delivery Ratio</p>
                    <p className="font-display text-2xl font-bold text-copper">{deliveryEfficiency.toFixed(1)}:1</p>
                    <p className="text-xs text-muted-foreground">L delivered per L consumed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
