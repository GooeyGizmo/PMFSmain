import { useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { 
  BarChart3, DollarSign, TrendingUp, Users, Fuel, Truck,
  Loader2, Target, Trash2, Skull, Navigation, Gauge, MapPin, Wallet, ArrowUpRight, ArrowDownRight, Database, Calculator, RefreshCw
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';


export default function OpsAnalytics({ embedded }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOwner = user?.role === 'owner';

  const { data: settingsData } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['/api/ops/settings'],
  });

  const isUsingCalculatorProjections = settingsData?.settings?.calculatorProjectionsActive === 'true';
  const resetToLiveDataMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ops/settings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings: { calculatorProjectionsActive: 'false' } }),
      });
      if (!res.ok) throw new Error('Failed to reset');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/analytics/overview'] });
      toast({ title: 'Reset to Live Data', description: 'Analytics now showing real-time database data' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to reset to live data', variant: 'destructive' });
    },
  });

  const { data: overviewData, isLoading: overviewLoading } = useQuery<{ overview: any }>({
    queryKey: ['/api/ops/analytics/overview'],
  });

  const { data: chartData, isLoading: chartLoading } = useQuery<{ chartData: any[] }>({
    queryKey: ['/api/ops/analytics/orders-over-time'],
  });

  const { data: pricingData } = useQuery<{ pricing: any[] }>({
    queryKey: ['/api/fuel-pricing'],
  });

  const { data: shameData } = useQuery<{ leaderboard: any[]; recentEvents: any[]; totalEvents: number }>({
    queryKey: ['/api/shame-events/leaderboard'],
    enabled: isOwner,
  });

  const { data: routeEfficiencyData } = useQuery<{
    summary: {
      totalRoutes: number;
      totalDistanceKm: number;
      avgRouteDistanceKm: number;
      avgStopDistanceKm: number;
      avgFleetFuelEconomy: number;
      estimatedFuelUse: number;
      estimatedFuelCost: number;
      dieselCostPerLitre: number;
      period: string;
    };
    chartData: Array<{ date: string; routes: number; distanceKm: number; fuelUse: number; fuelCost: number }>;
  }>({
    queryKey: ['/api/ops/analytics/route-efficiency'],
  });

  const routeEfficiency = routeEfficiencyData?.summary;
  const routeEfficiencyChart = routeEfficiencyData?.chartData || [];

  const calculatorProjections = useMemo(() => {
    if (!isUsingCalculatorProjections || !settingsData?.settings) return null;
    try {
      const settings = settingsData.settings;
      const fuelCalc = settings.calculatorFuelCalc ? JSON.parse(settings.calculatorFuelCalc) : null;
      const tierCounts = settings.calculatorTierCounts ? JSON.parse(settings.calculatorTierCounts) : null;
      const deliveriesPerMonth = settings.calculatorDeliveriesPerMonth ? JSON.parse(settings.calculatorDeliveriesPerMonth) : null;
      const operatingCosts = parseFloat(settings.operatingCosts || '0');
      if (!fuelCalc || !tierCounts || !deliveriesPerMonth) return null;
      const pricing = pricingData?.pricing || [];
      const regularPricing = pricing.find((p: any) => p.fuelType === 'regular') || { baseCost: '1.29', customerPrice: '1.45' };
      const dieselPricing = pricing.find((p: any) => p.fuelType === 'diesel') || { baseCost: '1.30', customerPrice: '1.67' };
      const premiumPricing = pricing.find((p: any) => p.fuelType === 'premium') || { baseCost: '1.35', customerPrice: '1.79' };
      const avgLitresPerStop = parseFloat(fuelCalc.avgLitresPerStop) || 55;
      const workDaysPerWeek = parseFloat(fuelCalc.workDaysPerWeek) || 3;
      const regularPctRaw = parseFloat(fuelCalc.regular87Pct);
      const dieselPctRaw = parseFloat(fuelCalc.dieselPct);
      const premiumPctRaw = parseFloat(fuelCalc.premium91Pct);
      const regularPct = (isNaN(regularPctRaw) ? 45 : regularPctRaw) / 100;
      const dieselPct = (isNaN(dieselPctRaw) ? 40 : dieselPctRaw) / 100;
      const premiumPct = (isNaN(premiumPctRaw) ? 15 : premiumPctRaw) / 100;
      const accessCount = parseInt(tierCounts.access) || 0;
      const householdCount = parseInt(tierCounts.household) || 0;
      const ruralCount = parseInt(tierCounts.rural) || 0;
      const paygCount = parseInt(tierCounts.payg) || 0;
      const accessDeliveries = parseInt(deliveriesPerMonth.access) || 2;
      const householdDeliveries = parseInt(deliveriesPerMonth.household) || 3;
      const ruralDeliveries = parseInt(deliveriesPerMonth.rural) || 3;
      const paygDeliveries = parseInt(deliveriesPerMonth.payg) || 1;
      const GST_RATE = 0.05;
      const monthlyOrders = (accessCount * accessDeliveries) + (householdCount * householdDeliveries) + (ruralCount * ruralDeliveries) + (paygCount * paygDeliveries);
      const accessLitres = accessCount * accessDeliveries * avgLitresPerStop;
      const householdLitres = householdCount * householdDeliveries * avgLitresPerStop;
      const ruralLitres = ruralCount * ruralDeliveries * avgLitresPerStop;
      const paygLitres = paygCount * paygDeliveries * avgLitresPerStop;
      const monthlyLitres = accessLitres + householdLitres + ruralLitres + paygLitres;
      const avgFuelPrice = (regularPct * parseFloat(regularPricing.customerPrice)) + (dieselPct * parseFloat(dieselPricing.customerPrice)) + (premiumPct * parseFloat(premiumPricing.customerPrice));
      const avgFuelCost = (regularPct * parseFloat(regularPricing.baseCost)) + (dieselPct * parseFloat(dieselPricing.baseCost)) + (premiumPct * parseFloat(premiumPricing.baseCost));
      const subscriptionMRRPreGST = (accessCount * 24.99) + (householdCount * 49.99) + (ruralCount * 99.99);
      const subscriptionMRR = subscriptionMRRPreGST * (1 + GST_RATE);
      const accessFuelRevenue = accessLitres * avgFuelPrice;
      const householdFuelRevenue = householdLitres * avgFuelPrice;
      const ruralFuelRevenue = ruralLitres * avgFuelPrice;
      const paygFuelRevenue = paygLitres * avgFuelPrice;
      const fuelRevenuePreGST = accessFuelRevenue + householdFuelRevenue + ruralFuelRevenue + paygFuelRevenue;
      const fuelRevenue = fuelRevenuePreGST * (1 + GST_RATE);
      const deliveryFeeRevenuePreGST = (accessCount * accessDeliveries * 12.49) + (paygCount * paygDeliveries * 24.99);
      const deliveryFeeRevenue = deliveryFeeRevenuePreGST * (1 + GST_RATE);
      const monthlyGrossIncome = subscriptionMRR + fuelRevenue + deliveryFeeRevenue;
      const weeklyOrders = Math.round(monthlyOrders / 4.33);
      const weeklyLitres = monthlyLitres / 4.33;
      const weeklyGrossIncome = monthlyGrossIncome / 4.33;
      const gstCollected = monthlyGrossIncome * (GST_RATE / (1 + GST_RATE));
      const netRevenue = monthlyGrossIncome - gstCollected;
      const fuelCOGS = monthlyLitres * avgFuelCost;
      const grossProfit = netRevenue - fuelCOGS;
      const monthlyProfit = grossProfit - operatingCosts;
      const weeklyProfit = monthlyProfit / 4.33;
      const taxRate = parseFloat(settings.taxReserveRate || '25') / 100;
      const cppRate = parseFloat(settings.cppReserveRate || '9') / 100;
      const incomeTaxReserve = Math.max(0, monthlyProfit * taxRate);
      const cppReserve = Math.max(0, monthlyProfit * cppRate);
      const monthlyOwnerDraw = Math.max(0, monthlyProfit - incomeTaxReserve - cppReserve);
      const weeklyOwnerDraw = monthlyOwnerDraw / 4.33;
      return {
        tierDistribution: { payg: paygCount, access: accessCount, household: householdCount, rural: ruralCount },
        totalCustomers: accessCount + householdCount + ruralCount + paygCount,
        monthly: { orders: monthlyOrders, litres: monthlyLitres, grossIncome: monthlyGrossIncome, trueProfit: monthlyProfit, ownerDrawAvailable: monthlyOwnerDraw },
        weekly: { orders: weeklyOrders, litres: weeklyLitres, grossIncome: weeklyGrossIncome, trueProfit: weeklyProfit, ownerDrawAvailable: weeklyOwnerDraw },
        daily: { orders: Math.round(weeklyOrders / workDaysPerWeek), litres: weeklyLitres / workDaysPerWeek, grossIncome: weeklyGrossIncome / workDaysPerWeek, trueProfit: weeklyProfit / workDaysPerWeek, ownerDrawAvailable: weeklyOwnerDraw / workDaysPerWeek },
        yearly: { orders: monthlyOrders * 12, litres: monthlyLitres * 12, grossIncome: monthlyGrossIncome * 12, trueProfit: monthlyProfit * 12, ownerDrawAvailable: monthlyOwnerDraw * 12 },
        operatingCosts, taxReserveRate: taxRate, cppReserveRate: cppRate, subscriptionMRR, fuelRevenue, deliveryFeeRevenue,
        avgFuelPrice, avgFuelCost, fuelCOGS, gstCollected, netRevenue, grossProfit, incomeTaxReserve, cppReserve, isProjection: true,
      };
    } catch (e) {
      console.error('Failed to parse calculator projections:', e);
      return null;
    }
  }, [isUsingCalculatorProjections, settingsData?.settings, pricingData?.pricing]);

  const overview = calculatorProjections || overviewData?.overview;
  const ordersOverTime = chartData?.chartData || [];
  const isLoading = overviewLoading || chartLoading;

  const tierBreakdown = [
    { tier: 'PAY AS YOU GO', subscribers: overview?.tierDistribution?.payg || 0, mrr: 0 },
    { tier: 'ACCESS', subscribers: overview?.tierDistribution?.access || 0, mrr: (overview?.tierDistribution?.access || 0) * 24.99 },
    { tier: 'HOUSEHOLD', subscribers: overview?.tierDistribution?.household || 0, mrr: (overview?.tierDistribution?.household || 0) * 49.99 },
    { tier: 'RURAL / POWER USER', subscribers: overview?.tierDistribution?.rural || 0, mrr: (overview?.tierDistribution?.rural || 0) * 99.99 },
  ];
  const totalMRR = tierBreakdown.reduce((sum, t) => sum + t.mrr, 0);

  const daily = overview?.daily || {};
  const weekly = overview?.weekly || {};
  const monthly = overview?.monthly || {};
  const yearly = overview?.yearly || {};

  const formatCurrency = (val: number) => val < 0 ? `-$${Math.abs(val).toFixed(2)}` : `$${val.toFixed(2)}`;

  const fuelTypeBreakdown = overview?.fuelTypeBreakdown || { regular: { deliveries: 0, litres: 0, revenue: 0 }, diesel: { deliveries: 0, litres: 0, revenue: 0 }, premium: { deliveries: 0, litres: 0, revenue: 0 } };
  const fuelTypeRevenue = [
    { type: 'Regular 87 Gas', deliveries: fuelTypeBreakdown.regular?.deliveries || 0, litres: fuelTypeBreakdown.regular?.litres || 0, revenue: fuelTypeBreakdown.regular?.revenue || 0 },
    { type: 'Diesel', deliveries: fuelTypeBreakdown.diesel?.deliveries || 0, litres: fuelTypeBreakdown.diesel?.litres || 0, revenue: fuelTypeBreakdown.diesel?.revenue || 0 },
    { type: 'Premium 91 Gas', deliveries: fuelTypeBreakdown.premium?.deliveries || 0, litres: fuelTypeBreakdown.premium?.litres || 0, revenue: fuelTypeBreakdown.premium?.revenue || 0 },
  ];

  const yearlyOrders = yearly.orders || 0;
  const cancelledOrders = overview?.cancelledOrders || 0;
  const completionRate = yearlyOrders > 0 ? ((yearlyOrders - cancelledOrders) / yearlyOrders) * 100 : 0;
  const cancellationRate = yearlyOrders > 0 ? (cancelledOrders / yearlyOrders) * 100 : 0;
  const totalOrders = yearlyOrders;
  const completedOrders = yearlyOrders - cancelledOrders;

  const deletedOrders = {
    totalDeleted: overview?.cancelledOrders || 0,
    lostRevenue: overview?.cancelledRevenue || 0,
    monthlyData: overview?.cancelledMonthlyData || [],
  };

  const activeCustomers = overview?.totalCustomers || 0;
  const newCustomersThisMonth = overview?.newCustomersThisMonth || 0;
  const lifetimeValue = activeCustomers > 0 ? (yearly.grossIncome || 0) / activeCustomers : 0;
  const avgRevenuePerCustomer = activeCustomers > 0 ? (monthly.grossIncome || 0) / activeCustomers : 0;
  const avgOrderValue = yearlyOrders > 0 ? (yearly.grossIncome || 0) / yearlyOrders : 0;
  const retentionRate = 100;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-copper" />
      </div>
    );
  }

  const weeklyOwnerDraw = weekly.ownerDrawAvailable || 0;
  const monthlyOwnerDraw = monthly.ownerDrawAvailable || 0;
  const dailyOwnerDraw = daily.ownerDrawAvailable || 0;
  const yearlyOwnerDraw = yearly.ownerDrawAvailable || 0;
  const monthlyRevenue = monthly.grossIncome || 0;
  const monthlyProfit = monthly.trueProfit || 0;
  const grossMarginPct = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;
  const netMarginPct = monthlyRevenue > 0 ? (monthlyOwnerDraw / monthlyRevenue) * 100 : 0;
  const isProfitableWeekly = weeklyOwnerDraw > 0;
  const goalMonth6Weekly = 1200;
  const goalMonth12Weekly = 3850;
  const month6Progress = Math.min((weeklyOwnerDraw / goalMonth6Weekly) * 100, 100);
  const month12Progress = Math.min((weeklyOwnerDraw / goalMonth12Weekly) * 100, 100);
  const projectedMonthlyFromWeek = weeklyOwnerDraw * 4.33;
  const projectedYearlyFromMonth = monthlyOwnerDraw * 12;

  const subscriptionMRR = totalMRR;
  const fuelRevenue = (fuelTypeRevenue[0]?.revenue || 0) + (fuelTypeRevenue[1]?.revenue || 0) + (fuelTypeRevenue[2]?.revenue || 0);
  const deliveryFeeRevenue = Math.max(0, monthlyRevenue - subscriptionMRR - fuelRevenue);

  const revenueDonutData = [
    { name: 'Fuel Sales', value: fuelRevenue, color: 'hsl(var(--chart-1))' },
    { name: 'Subscriptions', value: subscriptionMRR, color: 'hsl(var(--chart-2))' },
    { name: 'Delivery Fees', value: deliveryFeeRevenue, color: 'hsl(var(--chart-3))' },
  ].filter(d => d.value > 0);

  const orderVolumeData = [
    { name: 'Completed', value: completedOrders, color: '#22c55e' },
    { name: 'Cancelled', value: cancelledOrders, color: '#ef4444' },
  ];

  const fuelTypeChartData = fuelTypeRevenue.map(f => ({
    name: f.type.replace(' Gas', '').replace('Regular 87', 'Regular').replace('Premium 91', 'Premium'),
    litres: f.litres,
    revenue: f.revenue,
  }));

  const tierChartData = tierBreakdown.map(t => ({
    name: t.tier.replace('PAY AS YOU GO', 'PAYG').replace('RURAL / POWER USER', 'RURAL'),
    subscribers: t.subscribers,
    mrr: t.mrr,
  }));

  const content = (
    <div className={embedded ? "space-y-4" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-4"}>
      {!embedded && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isUsingCalculatorProjections ? (
              <Badge variant="secondary" className="gap-1 bg-amber-500/20 text-amber-700 border-amber-500/30">
                <Calculator className="w-3 h-3" />
                Projections
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 bg-sage/20 text-sage border-sage/30">
                <Database className="w-3 h-3" />
                Live Data
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isUsingCalculatorProjections && (
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => resetToLiveDataMutation.mutate()}
                disabled={resetToLiveDataMutation.isPending}
                data-testid="button-reset-live-data"
              >
                <RefreshCw className={`w-4 h-4 ${resetToLiveDataMutation.isPending ? 'animate-spin' : ''}`} />
                Reset to Live
              </Button>
            )}
            <Link href="/owner/finance?tab=calculators">
              <Button variant="secondary" size="sm" className="gap-2" data-testid="button-go-to-calculator">
                <Calculator className="w-4 h-4" />
                Calculators
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 1. Profitability Banner + KPI Bar */}
      <div className={`p-3 rounded-xl border ${isProfitableWeekly ? 'border-sage/40 bg-sage/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className={`w-4 h-4 ${isProfitableWeekly ? 'text-sage' : 'text-amber-500 rotate-180'}`} />
            <span className="font-display font-bold text-sm">
              {isProfitableWeekly ? 'Profitable This Week' : 'Not Yet Profitable This Week'}
            </span>
            <span className="text-xs text-muted-foreground">
              {weekly.orders || 0} orders, {(weekly.litres || 0).toFixed(0)}L
            </span>
          </div>
          <Badge className={`text-xs ${isProfitableWeekly ? 'bg-sage text-white' : 'bg-amber-500 text-white'}`}>
            {isProfitableWeekly ? 'Profitable' : 'Building'}
          </Badge>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2" data-testid="analytics-kpi-bar">
          <div className="p-2 rounded-lg bg-background/80 text-center">
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
              {dailyOwnerDraw > 0 ? <ArrowUpRight className="w-2.5 h-2.5 text-sage" /> : <ArrowDownRight className="w-2.5 h-2.5 text-amber-500" />}
              Daily
            </p>
            <p className={`font-display text-xs sm:text-sm font-bold truncate ${dailyOwnerDraw > 0 ? 'text-sage' : 'text-amber-600'}`} data-testid="text-daily-draw">
              {formatCurrency(dailyOwnerDraw)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-background/80 text-center">
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
              {weeklyOwnerDraw > 0 ? <ArrowUpRight className="w-2.5 h-2.5 text-sage" /> : <ArrowDownRight className="w-2.5 h-2.5 text-amber-500" />}
              Weekly
            </p>
            <p className={`font-display text-xs sm:text-sm font-bold truncate ${weeklyOwnerDraw > 0 ? 'text-sage' : 'text-amber-600'}`} data-testid="text-weekly-draw">
              {formatCurrency(weeklyOwnerDraw)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-background/80 text-center">
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
              {monthlyOwnerDraw > 0 ? <ArrowUpRight className="w-2.5 h-2.5 text-sage" /> : <ArrowDownRight className="w-2.5 h-2.5 text-amber-500" />}
              Monthly
            </p>
            <p className={`font-display text-xs sm:text-sm font-bold truncate ${monthlyOwnerDraw > 0 ? 'text-sage' : 'text-amber-600'}`} data-testid="text-monthly-draw">
              {formatCurrency(monthlyOwnerDraw)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-background/80 text-center">
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
              {yearlyOwnerDraw > 0 ? <ArrowUpRight className="w-2.5 h-2.5 text-sage" /> : <ArrowDownRight className="w-2.5 h-2.5 text-amber-500" />}
              YTD
            </p>
            <p className={`font-display text-xs sm:text-sm font-bold truncate ${yearlyOwnerDraw > 0 ? 'text-sage' : 'text-amber-600'}`} data-testid="text-ytd-draw">
              {formatCurrency(yearlyOwnerDraw)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-background/80 text-center">
            <p className="text-[10px] text-muted-foreground"><DollarSign className="w-2.5 h-2.5 inline" /> Revenue</p>
            <p className="font-display text-xs sm:text-sm font-bold truncate" data-testid="text-monthly-revenue">{formatCurrency(monthlyRevenue)}</p>
          </div>
          <div className="p-2 rounded-lg bg-background/80 text-center">
            <p className="text-[10px] text-muted-foreground"><BarChart3 className="w-2.5 h-2.5 inline" /> Gross Margin</p>
            <p className={`font-display text-xs sm:text-sm font-bold ${grossMarginPct >= 0 ? '' : 'text-destructive'}`} data-testid="text-gross-margin">{grossMarginPct.toFixed(1)}%</p>
          </div>
          <div className="p-2 rounded-lg bg-background/80 text-center">
            <p className="text-[10px] text-muted-foreground"><Users className="w-2.5 h-2.5 inline" /> Customers</p>
            <p className="font-display text-xs sm:text-sm font-bold" data-testid="text-active-customers">{activeCustomers}</p>
          </div>
          <div className="p-2 rounded-lg bg-background/80 text-center">
            <p className="text-[10px] text-muted-foreground"><Wallet className="w-2.5 h-2.5 inline" /> Net Margin</p>
            <p className={`font-display text-xs sm:text-sm font-bold ${netMarginPct >= 0 ? 'text-sage' : 'text-destructive'}`} data-testid="text-net-margin">{netMarginPct.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* 2. Goals & Projections - Compact Side-by-Side */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-copper" />
            Goal Progress
          </h4>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs">Month 6: ${goalMonth6Weekly}/wk</span>
                <span className="text-xs font-medium">{month6Progress.toFixed(0)}%</span>
              </div>
              <Progress value={month6Progress} className="h-2" />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {month6Progress >= 100 ? 'Achieved!' : `${formatCurrency(goalMonth6Weekly - weeklyOwnerDraw)} more/wk needed`}
              </p>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs">Month 12: ${goalMonth12Weekly}/wk</span>
                <span className="text-xs font-medium">{month12Progress.toFixed(0)}%</span>
              </div>
              <Progress value={month12Progress} className="h-2" />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {month12Progress >= 100 ? 'Achieved!' : `${formatCurrency(goalMonth12Weekly - weeklyOwnerDraw)} more/wk needed`}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-copper" />
            Projections
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-lg bg-muted text-center">
              <p className="text-[10px] text-muted-foreground">Monthly Draw</p>
              <p className={`font-display text-sm font-bold ${projectedMonthlyFromWeek >= 0 ? 'text-sage' : 'text-destructive'}`}>{formatCurrency(projectedMonthlyFromWeek)}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted text-center">
              <p className="text-[10px] text-muted-foreground">Yearly Draw</p>
              <p className={`font-display text-sm font-bold ${projectedYearlyFromMonth >= 0 ? 'text-sage' : 'text-destructive'}`}>{formatCurrency(projectedYearlyFromMonth)}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted text-center">
              <p className="text-[10px] text-muted-foreground">Avg Order</p>
              <p className="font-display text-sm font-bold">{formatCurrency(avgOrderValue)}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted text-center">
              <p className="text-[10px] text-muted-foreground">Rev/Customer</p>
              <p className="font-display text-sm font-bold">{formatCurrency(avgRevenuePerCustomer)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 3. Order Volume Chart + 4. Revenue Sources Donut - Side by Side */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4" data-testid="order-volume-chart">
          <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-3">
            <Truck className="w-4 h-4 text-copper" />
            Order Volume
          </h4>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderVolumeData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={(val: number) => [val, 'Orders']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {orderVolumeData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="font-display text-sm font-bold">{totalOrders}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Completed</p>
              <p className="font-display text-sm font-bold text-green-600">{completedOrders}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Cancelled</p>
              <p className="font-display text-sm font-bold text-red-500">{cancelledOrders}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">This Month</p>
              <p className="font-display text-sm font-bold text-copper">{overview?.monthOrders || 0}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="p-1.5 rounded bg-muted text-center">
              <p className="text-[10px] text-muted-foreground">Completion</p>
              <p className="font-display text-xs font-bold text-sage">{completionRate.toFixed(1)}%</p>
            </div>
            <div className="p-1.5 rounded bg-muted text-center">
              <p className="text-[10px] text-muted-foreground">Cancellation</p>
              <p className="font-display text-xs font-bold text-red-500">{cancellationRate.toFixed(1)}%</p>
            </div>
          </div>
        </Card>

        <Card className="p-4" data-testid="revenue-sources-donut">
          <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-copper" />
            Revenue Sources (This Month)
          </h4>
          {revenueDonutData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {revenueDonutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => [`$${val.toFixed(2)}`, 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No revenue data yet</div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
            <div className="p-1.5 rounded bg-muted">
              <p className="text-[10px] text-muted-foreground">Fuel</p>
              <p className="font-display text-xs font-bold">{formatCurrency(fuelRevenue)}</p>
            </div>
            <div className="p-1.5 rounded bg-muted">
              <p className="text-[10px] text-muted-foreground">Subs</p>
              <p className="font-display text-xs font-bold">{formatCurrency(subscriptionMRR)}</p>
            </div>
            <div className="p-1.5 rounded bg-muted">
              <p className="text-[10px] text-muted-foreground">Delivery</p>
              <p className="font-display text-xs font-bold">{formatCurrency(deliveryFeeRevenue)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 5. Daily Fuel Cost Trend - Enlarged */}
      <Card className="p-4" data-testid="fuel-cost-trend">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-display font-bold text-sm flex items-center gap-2">
            <Fuel className="w-4 h-4 text-amber-500" />
            Daily Fuel Cost Trend (30 Days)
          </h4>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Est. Cost: <strong className="text-amber-600">${(routeEfficiency?.estimatedFuelCost || 0).toFixed(2)}</strong></span>
            <span>{(routeEfficiency?.estimatedFuelUse || 0).toFixed(1)}L @ ${(routeEfficiency?.dieselCostPerLitre || 1.45).toFixed(2)}/L</span>
          </div>
        </div>
        <div className="h-64">
          {routeEfficiencyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={routeEfficiencyChart.slice(-30)}>
                <defs>
                  <linearGradient id="fuelCostGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(val) => { try { return format(new Date(val), 'MM/dd'); } catch { return val; } }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(val) => `$${val.toFixed(0)}`} />
                <Tooltip 
                  formatter={(val: number) => [`$${val.toFixed(2)}`, 'Fuel Cost']}
                  labelFormatter={(label) => { try { return format(new Date(label), 'MMM d, yyyy'); } catch { return String(label); } }}
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                />
                <Area type="monotone" dataKey="fuelCost" stroke="#f59e0b" fill="url(#fuelCostGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No fuel cost data yet</div>
          )}
        </div>
      </Card>

      {/* 6. Fuel Type Performance + Subscription Tiers - Side by Side */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4" data-testid="fuel-type-performance">
          <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-3">
            <Fuel className="w-4 h-4 text-copper" />
            Fuel Type Performance
          </h4>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fuelTypeChartData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val: number) => [`${val} L`, 'Litres']} />
                <Bar dataKey="litres" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-xs mt-2">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">Type</th>
                <th className="text-center py-1">Deliveries</th>
                <th className="text-center py-1">Litres</th>
                <th className="text-right py-1">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {fuelTypeRevenue.map(f => (
                <tr key={f.type} className="border-b border-muted">
                  <td className="py-1">{f.type}</td>
                  <td className="text-center py-1">{f.deliveries}</td>
                  <td className="text-center py-1">{f.litres} L</td>
                  <td className="text-right py-1">${f.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4" data-testid="subscription-tiers-chart">
          <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-copper" />
            Subscription Tiers
          </h4>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tierChartData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val: number, name: string) => [name === 'mrr' ? `$${val.toFixed(2)}` : val, name === 'mrr' ? 'MRR' : 'Subscribers']} />
                <Bar dataKey="subscribers" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-xs mt-2">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">Tier</th>
                <th className="text-center py-1">Subscribers</th>
                <th className="text-right py-1">MRR</th>
              </tr>
            </thead>
            <tbody>
              {tierBreakdown.map(t => (
                <tr key={t.tier} className="border-b border-muted">
                  <td className="py-1">{t.tier}</td>
                  <td className="text-center py-1">{t.subscribers}</td>
                  <td className="text-right py-1">${t.mrr.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* 7. Route Efficiency - Compact Grid */}
      <Card className="p-4" data-testid="route-efficiency-analytics">
        <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-3">
          <Navigation className="w-4 h-4 text-blue-500" />
          Route Efficiency (Last 30 Days)
        </h4>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <div className="p-2 rounded-lg bg-muted text-center">
            <Truck className="w-3.5 h-3.5 mx-auto text-blue-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">Routes</p>
            <p className="font-display text-sm font-bold">{routeEfficiency?.totalRoutes || 0}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted text-center">
            <Navigation className="w-3.5 h-3.5 mx-auto text-blue-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">Total Dist</p>
            <p className="font-display text-sm font-bold">{(routeEfficiency?.totalDistanceKm || 0).toFixed(1)} km</p>
          </div>
          <div className="p-2 rounded-lg bg-muted text-center">
            <MapPin className="w-3.5 h-3.5 mx-auto text-sage mb-1" />
            <p className="text-[10px] text-muted-foreground">Avg Route</p>
            <p className="font-display text-sm font-bold">{(routeEfficiency?.avgRouteDistanceKm || 0).toFixed(1)} km</p>
          </div>
          <div className="p-2 rounded-lg bg-muted text-center">
            <MapPin className="w-3.5 h-3.5 mx-auto text-copper mb-1" />
            <p className="text-[10px] text-muted-foreground">Avg Stop</p>
            <p className="font-display text-sm font-bold">{(routeEfficiency?.avgStopDistanceKm || 0).toFixed(1)} km</p>
          </div>
          <div className="p-2 rounded-lg bg-muted text-center">
            <Gauge className="w-3.5 h-3.5 mx-auto text-amber-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">L/100km</p>
            <p className="font-display text-sm font-bold">{(routeEfficiency?.avgFleetFuelEconomy || 15).toFixed(1)}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted text-center">
            <Fuel className="w-3.5 h-3.5 mx-auto text-brass mb-1" />
            <p className="text-[10px] text-muted-foreground">Est. Fuel</p>
            <p className="font-display text-sm font-bold">{(routeEfficiency?.estimatedFuelUse || 0).toFixed(1)} L</p>
          </div>
        </div>
      </Card>

      {/* 8. Customer Metrics - Compact Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="customer-metrics">
        <Card className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground">Active Subscribers</p>
          <p className="font-display text-xl font-bold">{activeCustomers}</p>
          <p className="text-[10px] text-muted-foreground">+{newCustomersThisMonth} this month</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground">Lifetime Value</p>
          <p className="font-display text-xl font-bold">${lifetimeValue.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">Annual CLV</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground">Retention Rate</p>
          <p className="font-display text-xl font-bold">{retentionRate.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground">Churn 0%</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground">Rev/Customer</p>
          <p className="font-display text-xl font-bold">${avgRevenuePerCustomer.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">Monthly avg</p>
        </Card>
      </div>

      {/* Hall of Shame - Owner Only */}
      {isOwner && shameData && (
        <Card className="border-red-200 bg-gradient-to-br from-red-50/50 to-background p-4">
          <h4 className="font-display font-bold text-sm flex items-center gap-2 text-red-700 mb-3">
            <Skull className="w-4 h-4" />
            Hall of Shame
            <Badge variant="destructive" className="ml-1 text-xs">{shameData.totalEvents} total</Badge>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium mb-2">Leaderboard</p>
              {shameData.leaderboard.length === 0 ? (
                <p className="text-muted-foreground text-xs py-2 text-center">No shame events yet</p>
              ) : (
                <div className="space-y-1">
                  {shameData.leaderboard.slice(0, 5).map((entry: any, index: number) => (
                    <div key={entry.userId} className="flex items-center justify-between p-2 rounded-lg bg-red-100/50 text-xs">
                      <div className="flex items-center gap-2">
                        <span>{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '💀'}</span>
                        <span className="font-medium">{entry.userName}</span>
                      </div>
                      <Badge variant="outline" className="border-red-300 text-red-700 text-xs">{entry.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium mb-2">Recent Events</p>
              {shameData.recentEvents.length === 0 ? (
                <p className="text-muted-foreground text-xs py-2 text-center">No recent shaming</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {shameData.recentEvents.map((event: any) => (
                    <div key={event.id} className="p-2 rounded-lg bg-muted/50 text-xs">
                      <p className="text-muted-foreground text-[10px]">{format(new Date(event.createdAt), 'MMM d, h:mm a')}</p>
                      <p className="italic text-red-600">"{event.messageShown}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 9. Deleted Orders - Collapsible */}
      <details className="group" data-testid="deleted-orders-section">
        <summary className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
          <Trash2 className="w-4 h-4 text-red-500" />
          <span className="font-display font-bold text-sm">Deleted Orders</span>
          <span className="text-xs text-muted-foreground ml-auto">{deletedOrders.totalDeleted} deleted, {formatCurrency(deletedOrders.lostRevenue)} lost</span>
        </summary>
        <div className="mt-2 p-4 rounded-lg border bg-background">
          {deletedOrders.monthlyData.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5">Month</th>
                  <th className="text-center py-1.5">Count</th>
                  <th className="text-right py-1.5">Value</th>
                </tr>
              </thead>
              <tbody>
                {deletedOrders.monthlyData.map((m: any) => (
                  <tr key={m.month} className="border-b border-muted">
                    <td className="py-1.5">{m.month}</td>
                    <td className="text-center py-1.5">{m.count}</td>
                    <td className="text-right py-1.5">${m.value.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No deleted orders</p>
          )}
        </div>
      </details>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
