import { useMemo } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, BarChart3, DollarSign, TrendingUp, Users, Fuel, Truck, Calendar, 
  Loader2, Target, Star, AlertTriangle, CheckCircle, XCircle, Trash2, UserPlus, UserMinus,
  Clock, ThumbsUp, Activity, Zap
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { format, subMonths, startOfMonth } from 'date-fns';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
const TIER_COLORS = { payg: '#9ca3af', access: '#3b82f6', household: '#f59e0b', rural: '#8b5cf6' };

interface AnalyticsData {
  overview: any;
  orderMetrics: any;
  fuelPerformance: any[];
  revenueBreakdown: any;
  costsBreakdown: any;
  customerHealth: any;
  serviceQuality: any;
  demandPatterns: any;
  churnTrends: any[];
  deletedOrders: any;
}

export default function OpsAnalytics() {
  const { data: overviewData, isLoading: overviewLoading } = useQuery<{ overview: any }>({
    queryKey: ['/api/ops/analytics/overview'],
  });

  const { data: chartData, isLoading: chartLoading } = useQuery<{ chartData: any[] }>({
    queryKey: ['/api/ops/analytics/orders-over-time'],
  });

  const { data: pricingData } = useQuery<{ pricing: any[] }>({
    queryKey: ['/api/fuel-pricing'],
  });

  const overview = overviewData?.overview;
  const ordersOverTime = chartData?.chartData || [];
  const isLoading = overviewLoading || chartLoading;

  const tierData = overview ? [
    { name: 'PAYG', value: overview.tierDistribution.payg },
    { name: 'ACCESS', value: overview.tierDistribution.access },
    { name: 'HOUSEHOLD', value: overview.tierDistribution.household },
    { name: 'RURAL', value: overview.tierDistribution.rural },
  ].filter(t => t.value > 0) : [];

  const tierBreakdown = [
    { tier: 'PAY AS YOU GO', subscribers: overview?.tierDistribution?.payg || 0, mrr: 0 },
    { tier: 'ACCESS', subscribers: overview?.tierDistribution?.access || 0, mrr: (overview?.tierDistribution?.access || 0) * 24.99 },
    { tier: 'HOUSEHOLD', subscribers: overview?.tierDistribution?.household || 0, mrr: (overview?.tierDistribution?.household || 0) * 49.99 },
    { tier: 'RURAL / POWER USER', subscribers: overview?.tierDistribution?.rural || 0, mrr: (overview?.tierDistribution?.rural || 0) * 99.99 },
  ];

  const totalMRR = tierBreakdown.reduce((sum, t) => sum + t.mrr, 0);

  const grossRevenue = overview?.totalRevenue || 0;
  const gstCollected = grossRevenue * 0.05;
  const operatingCosts = overview?.operatingCosts || 0;
  const fuelCOGS = overview?.fuelCOGS || 0;
  const taxReserveRate = overview?.taxReserveRate || 0.30;
  const grossProfit = grossRevenue - gstCollected - fuelCOGS;
  const taxReserve = grossProfit * taxReserveRate;
  const netProfit = grossProfit - operatingCosts - taxReserve;
  const ownerSalary = overview?.ownerSalary || 0;
  const retainedEarnings = netProfit - ownerSalary;

  const truckFuel = 0;
  const maintenance = 0;
  const admin = 0;

  const monthRevenue = overview?.monthRevenue || 0;
  const avgRevenuePerCustomer = (overview?.totalCustomers || 0) > 0 ? monthRevenue / overview.totalCustomers : 0;
  const avgOrderValue = (overview?.totalOrders || 0) > 0 ? grossRevenue / overview.totalOrders : 0;

  const operatingFuelCost = 0;
  const litresFilled = 0;
  const avgCostPerL = 0;

  const sellableFuelCost = overview?.sellableFuelCost || 0;
  const sellableLitres = overview?.sellableLitres || 0;

  const fuelTypeBreakdown = overview?.fuelTypeBreakdown || { regular: { deliveries: 0, litres: 0, revenue: 0 }, diesel: { deliveries: 0, litres: 0, revenue: 0 }, premium: { deliveries: 0, litres: 0, revenue: 0 } };
  const fuelTypeRevenue = [
    { type: 'Regular 87 Gas', deliveries: fuelTypeBreakdown.regular?.deliveries || 0, litres: fuelTypeBreakdown.regular?.litres || 0, revenue: fuelTypeBreakdown.regular?.revenue || 0 },
    { type: 'Diesel', deliveries: fuelTypeBreakdown.diesel?.deliveries || 0, litres: fuelTypeBreakdown.diesel?.litres || 0, revenue: fuelTypeBreakdown.diesel?.revenue || 0 },
    { type: 'Premium 91 Gas', deliveries: fuelTypeBreakdown.premium?.deliveries || 0, litres: fuelTypeBreakdown.premium?.litres || 0, revenue: fuelTypeBreakdown.premium?.revenue || 0 },
  ];

  const completedOrders = overview?.completedOrders || 0;
  const cancelledOrders = overview?.cancelledOrders || 0;
  const totalOrders = overview?.totalOrders || 0;
  const pendingOrders = totalOrders - completedOrders - cancelledOrders;
  const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;
  const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;
  const avgLitresPerDelivery = completedOrders > 0 ? (overview?.totalLitres || 0) / completedOrders : 0;

  const deletedOrders = {
    totalDeleted: overview?.cancelledOrders || 0,
    lostRevenue: overview?.cancelledRevenue || 0,
    monthlyData: overview?.cancelledMonthlyData || [],
  };

  const activeCustomers = overview?.totalCustomers || 0;
  const newCustomersThisMonth = overview?.newCustomersThisMonth || 0;
  const churnedThisMonth = 0;

  const lifetimeValue = activeCustomers > 0 ? grossRevenue / activeCustomers : 0;
  const retentionRate = 100;
  const churnRate = 0;

  const npsScore = 0;
  const onTimeRate = 100;
  const avgRating = 0;
  const responseRate = 0;
  const avgCostPerDelivery = 0;

  const driverPerformance = overview?.driverPerformance || [];

  const demandByDay = overview?.demandByDay || [
    { day: 'Mon', deliveries: 0 },
    { day: 'Tue', deliveries: 0 },
    { day: 'Wed', deliveries: 0 },
    { day: 'Thu', deliveries: 0 },
    { day: 'Fri', deliveries: 0 },
    { day: 'Sat', deliveries: 0 },
    { day: 'Sun', deliveries: 0 },
  ];

  const peakDay = overview?.peakDay || 'N/A';
  const peakWindow = overview?.peakWindow || 'N/A';
  const avgDailyOrders = overview?.avgDailyOrders || 0;
  const timeWindowActive = 0;

  const churnData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      months.push({
        month: format(date, 'MMM yy'),
        churnRate: 0,
        retention: 100,
        netGrowth: 0,
      });
    }
    return months;
  }, []);

  const churnMonthlyBreakdown = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      months.push({
        month: format(date, 'MMM yy'),
        churned: 0,
        newSubs: 0,
        net: 0,
        churnRate: 0,
      });
    }
    return months;
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-copper" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/ops">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-copper" />
                <span className="font-display font-bold text-foreground">Business Analytics</span>
                <Badge variant="outline" className="text-xs border-copper/30 text-copper">Operations</Badge>
              </div>
            </div>
            <Button variant="destructive" size="sm" className="gap-2">
              <Target className="w-4 h-4" />
              Review Target!
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <motion.h1 
            className="font-display text-2xl font-bold text-foreground"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Business Analytics
          </motion.h1>
          <p className="text-muted-foreground mt-1">Comprehensive metrics for Prairie Mobile Fuel Services</p>
        </div>

        <Card className="bg-gradient-to-br from-muted/50 to-background">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Target className="w-5 h-5 text-copper" />
              Profitability Summary
            </CardTitle>
            <CardDescription>Monthly profit after 30% tax reserve and operating costs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div>
                <p className="text-sm text-muted-foreground">Gross Revenue</p>
                <p className="font-display text-xl font-bold">${grossRevenue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">GST Collected (5%)</p>
                <p className="font-display text-xl font-bold text-amber-500">-${gstCollected.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Remit to CRA</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tax Reserve ({(taxReserveRate * 100).toFixed(0)}%)</p>
                <p className="font-display text-xl font-bold text-destructive">-${taxReserve.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Income tax withholding</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Operating Costs</p>
                <p className="font-display text-xl font-bold text-destructive">-${operatingCosts.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className="font-display text-xl font-bold text-sage">${netProfit.toFixed(2)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Owner Salary Taken</p>
                <p className="font-display font-bold">${ownerSalary.toFixed(2)} <span className="text-xs text-muted-foreground">or $0/week</span></p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Retained Earnings</p>
                <p className="font-display font-bold text-sage">${retainedEarnings.toFixed(2)}</p>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium mb-2">Cost Breakdown</p>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-red-500" />
                  <span>Fuel COGS: ${fuelCOGS.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-amber-500" />
                  <span>Truck Fuel: ${truckFuel.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-blue-500" />
                  <span>Maintenance: ${maintenance.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-purple-500" />
                  <span>Admin: ${admin.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Fuel className="w-4 h-4" />
                <span className="text-sm">6 Month Revenue</span>
              </div>
              <CardTitle className="font-display text-2xl">${monthRevenue.toFixed(2)}</CardTitle>
              <p className="text-xs text-muted-foreground">6-12% vs last month</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="w-4 h-4" />
                <span className="text-sm">Subscription MRR</span>
              </div>
              <CardTitle className="font-display text-2xl">${totalMRR.toFixed(2)}</CardTitle>
              <p className="text-xs text-muted-foreground">Monthly recurring revenue</p>
            </CardHeader>
          </Card>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Active Subscribers</p>
            <p className="font-display text-xl font-bold">{activeCustomers}</p>
            <p className="text-xs text-muted-foreground">{activeCustomers} total customers</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Subscriber Lifetime Value</p>
            <p className="font-display text-xl font-bold">${lifetimeValue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Estimated annual CLV</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Retention Rate</p>
            <p className="font-display text-xl font-bold">{retentionRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Churn 0%</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Avg Revenue/Customer</p>
            <p className="font-display text-xl font-bold">${avgRevenuePerCustomer.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">This month per customer</p>
          </Card>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Avg Order Value</p>
            <p className="font-display text-xl font-bold">${avgOrderValue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Per order/customer</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Customers</p>
            <p className="font-display text-xl font-bold">{overview?.totalCustomers || 0}</p>
            <p className="text-xs text-muted-foreground">This month</p>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-amber-500/5 border-amber-500/20">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Fuel className="w-5 h-5 text-amber-500" />
                Operating Fuel Cost
              </CardTitle>
              <CardDescription>Truck litres to run the business, like mileage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="font-display text-2xl font-bold">${operatingFuelCost.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Litres Filled</p>
                  <p className="font-display text-2xl font-bold">{litresFilled} L</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fillups</p>
                  <p className="font-display font-bold">0</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Cost/L</p>
                  <p className="font-display font-bold">${avgCostPerL.toFixed(4)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-sage/5 border-sage/20">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Fuel className="w-5 h-5 text-sage" />
                Sellable Fuel Cost
              </CardTitle>
              <CardDescription>Wholesale fuel for resale at delivered price</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="font-display text-2xl font-bold">${sellableFuelCost.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Litres Purchased</p>
                  <p className="font-display text-2xl font-bold">{sellableLitres} L</p>
                </div>
              </div>
              <div className="space-y-2">
                {pricingData?.pricing?.map((p: any) => (
                  <div key={p.fuelType} className="flex justify-between text-sm">
                    <span>{p.fuelType === 'regular' ? 'Regular 87 Gas' : p.fuelType === 'diesel' ? 'Diesel - Regular' : 'Diesel - Jacked'}</span>
                    <span>$0.00 (0 L)</span>
                  </div>
                )) || (
                  <>
                    <div className="flex justify-between text-sm"><span>Regular 87 Gas</span><span>$0.00 (0 L)</span></div>
                    <div className="flex justify-between text-sm"><span>Diesel - Regular</span><span>$0.00 (0 L)</span></div>
                    <div className="flex justify-between text-sm"><span>Diesel - Jacked</span><span>$0.00 (0 L)</span></div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Truck className="w-5 h-5 text-copper" />
              Order Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="font-display text-3xl font-bold text-foreground">{totalOrders}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="font-display text-3xl font-bold text-sage">{completedOrders}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cancelled</p>
                <p className="font-display text-3xl font-bold text-red-500">{cancelledOrders}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="font-display text-3xl font-bold text-copper">{overview?.monthOrders || 0}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="font-display text-xl font-bold text-sage">{completionRate.toFixed(1)}%</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Cancellation Rate</p>
                <p className="font-display text-xl font-bold text-red-500">{cancellationRate.toFixed(1)}%</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Avg L/Delivery</p>
                <p className="font-display text-xl font-bold">{avgLitresPerDelivery.toFixed(1)} L</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Deleted Orders Archive
            </CardTitle>
            <CardDescription>Cancelled orders moved to archive</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-sm text-muted-foreground">Total Deleted</p>
                <p className="font-display text-2xl font-bold">{deletedOrders.totalDeleted}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lost Revenue</p>
                <p className="font-display text-2xl font-bold text-destructive">${deletedOrders.lostRevenue.toFixed(2)}</p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Month</th>
                  <th className="text-center py-2">Count</th>
                  <th className="text-right py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {deletedOrders.monthlyData.map((m: any) => (
                  <tr key={m.month} className="border-b">
                    <td className="py-2">{m.month}</td>
                    <td className="text-center py-2">{m.count}</td>
                    <td className="text-right py-2">${m.value.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-copper" />
              Subscription Tier Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Tier</th>
                  <th className="text-center py-2">Subscribers</th>
                  <th className="text-right py-2">MRR</th>
                </tr>
              </thead>
              <tbody>
                {tierBreakdown.map(t => (
                  <tr key={t.tier} className="border-b">
                    <td className="py-2">{t.tier}</td>
                    <td className="text-center py-2">{t.subscribers}</td>
                    <td className="text-right py-2">${t.mrr.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Fuel className="w-5 h-5 text-copper" />
              Fuel Type Performance (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Fuel Type</th>
                  <th className="text-center py-2">Deliveries</th>
                  <th className="text-center py-2">Litres</th>
                  <th className="text-right py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {fuelTypeRevenue.map(f => (
                  <tr key={f.type} className="border-b">
                    <td className="py-2">{f.type}</td>
                    <td className="text-center py-2">{f.deliveries}</td>
                    <td className="text-center py-2">{f.litres} L</td>
                    <td className="text-right py-2">${f.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-sage" />
                Revenue Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-red-500/10 text-center">
                  <p className="text-xs text-muted-foreground">Fuel Sales</p>
                  <p className="font-display text-lg font-bold">$0.00</p>
                  <p className="text-xs text-muted-foreground">From fuel deliveries</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-500/10 text-center">
                  <p className="text-xs text-muted-foreground">Delivery Fees</p>
                  <p className="font-display text-lg font-bold">$0.00</p>
                  <p className="text-xs text-muted-foreground">Service charges</p>
                </div>
                <div className="p-3 rounded-lg bg-sage/10 text-center">
                  <p className="text-xs text-muted-foreground">Subscriptions</p>
                  <p className="font-display text-lg font-bold">${totalMRR.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Monthly recurring</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-destructive rotate-180" />
                Costs Breakdown
              </CardTitle>
              <CardDescription>Business expenses by category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Fuel COGS</p>
                  <p className="font-display text-lg font-bold">$0.00</p>
                  <p className="text-xs text-muted-foreground">0 expenses</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">This Month</p>
                  <p className="font-display text-lg font-bold">$0.00</p>
                  <p className="text-xs text-muted-foreground">0 expenses</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Year to Date</p>
                  <p className="font-display text-lg font-bold">$0.00</p>
                  <p className="text-xs text-muted-foreground">0 expenses</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-2 rounded-lg bg-amber-500/10 text-center">
                  <Truck className="w-4 h-4 mx-auto text-amber-500" />
                  <p className="text-xs font-medium mt-1">Truck Operating</p>
                  <p className="text-sm font-bold">$0.00</p>
                </div>
                <div className="p-2 rounded-lg bg-red-500/10 text-center">
                  <Fuel className="w-4 h-4 mx-auto text-red-500" />
                  <p className="text-xs font-medium mt-1">Fuel Costs</p>
                  <p className="text-sm font-bold">$0.00</p>
                </div>
                <div className="p-2 rounded-lg bg-blue-500/10 text-center">
                  <Activity className="w-4 h-4 mx-auto text-blue-500" />
                  <p className="text-xs font-medium mt-1">Add-ons</p>
                  <p className="text-sm font-bold">$0.00</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-copper" />
              Customer Health Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-sage/10 text-center">
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="font-display text-2xl font-bold text-sage">{activeCustomers}</p>
              </div>
              <div className="p-4 rounded-lg bg-green-500/10 text-center">
                <p className="text-sm text-muted-foreground">New This Month</p>
                <p className="font-display text-2xl font-bold text-green-500">{newCustomersThisMonth}</p>
              </div>
              <div className="p-4 rounded-lg bg-red-500/10 text-center">
                <p className="text-sm text-muted-foreground">Churned This Month</p>
                <p className="font-display text-2xl font-bold text-red-500">{churnedThisMonth}</p>
              </div>
              <div className="p-4 rounded-lg bg-blue-500/10 text-center">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="font-display text-2xl font-bold text-blue-500">{overview?.totalCustomers || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Service Quality Metrics
            </CardTitle>
            <CardDescription>Customer satisfaction, delivery performance, and driver ratings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-purple-500/10 text-center">
                <p className="text-sm text-muted-foreground">NPS Score</p>
                <p className="font-display text-2xl font-bold text-purple-500">{npsScore}</p>
                <p className="text-xs text-muted-foreground">0 responses</p>
              </div>
              <div className="p-4 rounded-lg bg-sage/10 text-center">
                <p className="text-sm text-muted-foreground">On-Time Rate</p>
                <p className="font-display text-2xl font-bold text-sage">{onTimeRate}%</p>
              </div>
              <div className="p-4 rounded-lg bg-amber-500/10 text-center">
                <p className="text-sm text-muted-foreground">Avg Rating</p>
                <p className="font-display text-2xl font-bold text-amber-500">{avgRating.toFixed(1)}</p>
              </div>
              <div className="p-4 rounded-lg bg-blue-500/10 text-center">
                <p className="text-sm text-muted-foreground">Avg Cost</p>
                <p className="font-display text-2xl font-bold text-blue-500">${avgCostPerDelivery.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">per delivery</p>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Response Rate: {responseRate}% &nbsp; | &nbsp; This Month: 0 completed</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Truck className="w-5 h-5 text-copper" />
              Driver Performance Analytics
            </CardTitle>
            <CardDescription>Comprehensive driver performance metrics and trends</CardDescription>
          </CardHeader>
          <CardContent>
            {driverPerformance.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No driver data yet - drivers are assigned when routes are created</p>
            ) : (
              <div className="space-y-4">
                {driverPerformance.map((driver: any) => (
                  <div key={driver.name} className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-10 h-10 rounded-full bg-copper/10 flex items-center justify-center text-copper font-bold">
                        {driver.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{driver.name}</p>
                        <p className="text-sm text-muted-foreground">{driver.routesWorked} routes worked</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Deliveries</p>
                        <p className="font-display font-bold text-foreground">{driver.deliveries}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Litres</p>
                        <p className="font-display font-bold text-blue-500">{driver.litres.toFixed(0)} L</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="font-display font-bold text-sage">${driver.revenue.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Avg/Route</p>
                        <p className="font-display font-bold text-copper">{driver.avgDeliveriesPerRoute}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-copper" />
              Demand Patterns
            </CardTitle>
            <CardDescription>Delivery demand by day and time for operational planning</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="p-3 rounded-lg bg-green-500/10 text-center">
                <p className="text-xs text-muted-foreground">Peak Day</p>
                <p className="font-display font-bold text-green-600">{peakDay}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 text-center">
                <p className="text-xs text-muted-foreground">Peak Window</p>
                <p className="font-display font-bold text-amber-600">{peakWindow}</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 text-center">
                <p className="text-xs text-muted-foreground">Avg Daily</p>
                <p className="font-display font-bold text-blue-600">{avgDailyOrders}</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 text-center">
                <p className="text-xs text-muted-foreground">Time Windows</p>
                <p className="font-display font-bold text-red-600">{timeWindowActive} active</p>
              </div>
            </div>
            <p className="text-sm font-medium mb-2">Deliveries by Day of Week</p>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={demandByDay}>
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Bar dataKey="deliveries" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-copper" />
              Subscription Churn Trends (6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={churnData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="churnRate" name="Churn Rate" stroke="#ef4444" strokeWidth={2} />
                <Line type="monotone" dataKey="retention" name="Retention" stroke="#22c55e" strokeWidth={2} />
                <Line type="monotone" dataKey="netGrowth" name="Net Growth" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <span className="inline-block w-3 h-3 rounded bg-red-500 mr-1" />
                Churn Rate: 0%
              </div>
              <div>
                <span className="inline-block w-3 h-3 rounded bg-green-500 mr-1" />
                Current: 0%
              </div>
              <div>
                <span className="inline-block w-3 h-3 rounded bg-blue-500 mr-1" />
                Retention: 100.0% | Net Growth: 0
              </div>
            </div>
            <div className="mt-6">
              <p className="text-sm font-medium mb-2">Monthly Breakdown</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Month</th>
                    <th className="text-center py-2">Churned</th>
                    <th className="text-center py-2">New Subs</th>
                    <th className="text-center py-2">Net</th>
                    <th className="text-right py-2">Churn Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {churnMonthlyBreakdown.map(m => (
                    <tr key={m.month} className="border-b">
                      <td className="py-2">{m.month}</td>
                      <td className="text-center py-2 text-red-500">{m.churned}</td>
                      <td className="text-center py-2 text-green-500">+{m.newSubs}</td>
                      <td className="text-center py-2">{m.net}</td>
                      <td className="text-right py-2">{m.churnRate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Orders Over Time (30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {ordersOverTime.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={ordersOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10 }}
                        tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        labelFormatter={(val) => new Date(val).toLocaleDateString()}
                      />
                      <Area type="monotone" dataKey="orders" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No order data available
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Revenue Over Time (30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {ordersOverTime.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={ordersOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10 }}
                        tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(val) => `$${val}`} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        labelFormatter={(val) => new Date(val).toLocaleDateString()}
                        formatter={(val: number) => [`$${val.toFixed(2)}`, 'Revenue']}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No revenue data available
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Customer Tier Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {tierData.length > 0 ? (
                  <div className="flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={tierData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {tierData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    No customer data available
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Popular Delivery Windows</CardTitle>
              </CardHeader>
              <CardContent>
                {overview?.popularWindows?.length > 0 ? (
                  <div className="space-y-4">
                    {overview.popularWindows.map(([window, count]: [string, number], i: number) => (
                      <div key={window} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            i === 0 ? 'bg-copper/10 text-copper' : 
                            i === 1 ? 'bg-brass/10 text-brass' : 
                            'bg-muted text-muted-foreground'
                          }`}>
                            <span className="font-display font-bold text-sm">{i + 1}</span>
                          </div>
                          <span className="font-medium text-foreground">{window}</span>
                        </div>
                        <Badge variant="secondary">{count} orders</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-[150px] flex items-center justify-center text-muted-foreground">
                    No delivery window data available
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
