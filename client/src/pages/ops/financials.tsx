import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { 
  ArrowLeft, Wallet, PiggyBank, TrendingUp, Calendar, DollarSign, 
  Loader2, Target, CheckCircle, Clock, Download, Settings, Fuel,
  Building2, Shield, Wrench, Rocket, Heart, AlertTriangle, Banknote,
  CalendarCheck, FileSpreadsheet, LayoutDashboard, Save, Receipt, Plus,
  RefreshCw, Calculator, BarChart3, Eye, ChevronRight, Users, Truck,
  Activity, Zap, Navigation, Gauge, MapPin, Trash2, ArrowUpRight, ArrowDownRight, Database, Printer
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { TaxCoverageHealthWidget } from '@/components/TaxCoverageHealthWidget';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const ACCOUNT_ICONS: Record<string, any> = {
  operating_chequing: Building2,
  gst_holding: Banknote,
  deferred_subscription: Clock,
  income_tax_reserve: FileSpreadsheet,
  operating_buffer: Wallet,
  maintenance_reserve: Wrench,
  emergency_risk: Shield,
  growth_capital: Rocket,
  owner_draw_holding: Heart,
};

const ACCOUNT_COLORS: Record<string, string> = {
  operating_chequing: 'bg-blue-500/10 border-blue-500/30 text-blue-600',
  gst_holding: 'bg-red-500/10 border-red-500/30 text-red-600',
  deferred_subscription: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
  income_tax_reserve: 'bg-purple-500/10 border-purple-500/30 text-purple-600',
  operating_buffer: 'bg-teal-500/10 border-teal-500/30 text-teal-600',
  maintenance_reserve: 'bg-orange-500/10 border-orange-500/30 text-orange-600',
  emergency_risk: 'bg-rose-500/10 border-rose-500/30 text-rose-600',
  growth_capital: 'bg-green-500/10 border-green-500/30 text-green-600',
  owner_draw_holding: 'bg-pink-500/10 border-pink-500/30 text-pink-600',
};

const CATEGORY_LABELS: Record<string, string> = {
  subscription_payg: 'PAYG Subscription',
  subscription_access: 'ACCESS Subscription',
  subscription_household: 'HOUSEHOLD Subscription',
  subscription_rural: 'RURAL Subscription',
  subscription_emergency: 'Emergency Add-On',
  fuel_delivery: 'Fuel Delivery',
  processing_fee: 'Processing Fee',
  fuel_cogs: 'Fuel Cost (COGS)',
  expense_other: 'Other Expense',
  payout_settlement: 'Payout',
  revenue_unmapped: 'Unmapped Revenue',
};

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

interface FinancialAccount {
  id: string;
  accountType: string;
  name: string;
  description: string | null;
  balance: string;
  isHolding: boolean;
  sortOrder: number;
}

interface LedgerEntry {
  id: string;
  eventDate: string;
  source: string;
  sourceType: string;
  description: string;
  category: string;
  grossAmountCents: number;
  netAmountCents: number;
  stripeFeeCents: number;
  gstCollectedCents: number;
  gstNeedsReview: boolean;
  isReversal: boolean;
}

interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  operatingMode: string;
  summary: {
    ordersCompleted: number;
    litresBilled: number;
    fuelRevenueGross: number;
    deliveryFeeRevenue: number;
    subscriptionRevenue: number;
    totalGstCollected: number;
    totalRevenue: number;
  };
}

interface RunwayData {
  ownerDrawBalance: number;
  targetMonthlyIncome: number;
  monthsOfRunway: number;
  avgWeeklyContribution: number;
  weeksToFreedom: number;
  freedomDate: string | null;
}

const formatCurrency = (cents: number) => {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(dollars);
};

const formatDollars = (amount: number) => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
};

interface CloseoutRun {
  id: string;
  mode: string;
  dateStart: string;
  dateEnd: string;
  status: string;
}

function PrintReportsSection() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  
  const { data: runsData, isLoading } = useQuery<{ runs: CloseoutRun[] }>({
    queryKey: ['/api/ops/closeout/runs'],
    queryFn: async () => {
      const res = await fetch('/api/ops/closeout/runs', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch closeout runs');
      return res.json();
    }
  });

  const runs = runsData?.runs?.filter(r => r.status === 'completed') || [];
  const selectedRun = runs.find(r => r.id === selectedRunId) || runs[0];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">No completed closeout periods available</p>
        <Link href="/ops/closeout">
          <Button variant="outline" data-testid="btn-go-to-closeout">
            <CalendarCheck className="mr-2 h-4 w-4" />
            Run Weekly Closeout
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Label className="text-sm font-medium">Select Period:</Label>
        <Select value={selectedRun?.id || ''} onValueChange={setSelectedRunId}>
          <SelectTrigger className="w-[280px]" data-testid="select-closeout-period">
            <SelectValue placeholder="Select a closeout period" />
          </SelectTrigger>
          <SelectContent>
            {runs.map(run => (
              <SelectItem key={run.id} value={run.id} data-testid={`select-period-${run.id}`}>
                {format(new Date(run.dateStart), 'MMM d')} - {format(new Date(run.dateEnd), 'MMM d, yyyy')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedRun && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Link href={`/ops/orders-report/${selectedRun.id}`}>
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2" data-testid="btn-print-orders-report">
              <Receipt className="h-6 w-6 text-copper" />
              <span className="font-medium">Orders Report</span>
              <span className="text-xs text-muted-foreground text-center">Completed deliveries</span>
            </Button>
          </Link>
          <Link href={`/ops/closeout-ledger-report/${selectedRun.id}`}>
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2" data-testid="btn-print-ledger-report">
              <FileSpreadsheet className="h-6 w-6 text-copper" />
              <span className="font-medium">Financial Ledger</span>
              <span className="text-xs text-muted-foreground text-center">All transactions</span>
            </Button>
          </Link>
          <Link href={`/ops/closeout-gst-report/${selectedRun.id}`}>
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2" data-testid="btn-print-gst-report">
              <Banknote className="h-6 w-6 text-copper" />
              <span className="font-medium">GST Summary</span>
              <span className="text-xs text-muted-foreground text-center">CRA-ready report</span>
            </Button>
          </Link>
          <Link href={`/ops/closeout-report/${selectedRun.id}`}>
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2" data-testid="btn-print-closeout-report">
              <CalendarCheck className="h-6 w-6 text-copper" />
              <span className="font-medium">Weekly Closeout</span>
              <span className="text-xs text-muted-foreground text-center">Full summary</span>
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function FinancialCommandCenter({ embedded }: { embedded?: boolean }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role === 'owner';
  
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<'live' | 'month'>('live');
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [targetIncomeInput, setTargetIncomeInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [localOperatingMode, setLocalOperatingMode] = useState<string | null>(null);
  
  // Manual entry form state
  const [entryType, setEntryType] = useState('fuel_cost');
  const [entryDescription, setEntryDescription] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryGst, setEntryGst] = useState('');
  const [entryDate, setEntryDate] = useState(format(now, 'yyyy-MM-dd'));
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Calculate date range based on view mode
  const { startDate, endDate } = useMemo(() => {
    if (viewMode === 'live') {
      // Live mode: month-to-date (from 1st of current month to today)
      const today = new Date();
      return {
        startDate: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString(),
      };
    } else {
      // Month mode: full selected month
      return {
        startDate: new Date(selectedYear, selectedMonth - 1, 1).toISOString(),
        endDate: new Date(selectedYear, selectedMonth, 0, 23, 59, 59).toISOString(),
      };
    }
  }, [viewMode, selectedYear, selectedMonth]);

  const { data: accountsData, isLoading: accountsLoading } = useQuery<{ accounts: FinancialAccount[] }>({
    queryKey: ['/api/ops/finances/accounts'],
  });

  const { data: settingsData } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['/api/ops/finances/settings'],
  });

  const { data: runwayData } = useQuery<RunwayData>({
    queryKey: ['/api/ops/finances/runway'],
  });

  const { data: weekSummaryData } = useQuery<WeekSummary>({
    queryKey: ['/api/ops/finances/current-week-summary'],
  });

  const { data: closesData } = useQuery<{ closes: any[] }>({
    queryKey: ['/api/ops/finances/weekly-closes'],
  });

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery<{ entries: LedgerEntry[]; total: number }>({
    queryKey: ['/api/ops/bookkeeping/ledger', { startDate, endDate, category: categoryFilter }],
  });

  const { data: revenueData } = useQuery<any>({
    queryKey: ['/api/ops/bookkeeping/reports/revenue', { year: selectedYear, month: selectedMonth }],
  });

  const { data: gstData } = useQuery<any>({
    queryKey: ['/api/ops/bookkeeping/reports/gst', { year: selectedYear, month: selectedMonth }],
  });

  const { data: cashFlowData } = useQuery<any>({
    queryKey: ['/api/ops/bookkeeping/reports/cashflow', { year: selectedYear, month: selectedMonth }],
  });

  const { data: diagnosticsData } = useQuery<{ unmappedCount: number; gstReviewCount: number; unmappedRevenue: any[]; gstReviewItems: any[] }>({
    queryKey: ['/api/ops/bookkeeping/diagnostics'],
  });

  const { data: overviewData, isLoading: analyticsLoading } = useQuery<{ overview: any }>({
    queryKey: ['/api/ops/analytics/overview'],
  });

  const { data: chartData } = useQuery<{ chartData: any[] }>({
    queryKey: ['/api/ops/analytics/orders-over-time'],
  });

  const { data: pricingData } = useQuery<{ pricing: any[] }>({
    queryKey: ['/api/fuel-pricing'],
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

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await fetch(`/api/ops/finances/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error('Failed to update setting');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/finances'] });
      toast({ title: 'Setting Updated' });
      if (variables.key === 'operating_mode') {
        setLocalOperatingMode(null);
      }
    },
    onError: (_, variables) => {
      if (variables.key === 'operating_mode') {
        setLocalOperatingMode(null);
      }
      toast({ title: 'Failed to update setting', variant: 'destructive' });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }) => {
      const res = await fetch('/api/ops/bookkeeping/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) throw new Error('Backfill failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/finances'] });
      toast({
        title: 'Backfill Complete',
        description: `Processed: ${data.invoices?.processed || 0} invoices, ${data.charges?.processed || 0} charges, ${data.refunds?.processed || 0} refunds, ${data.payouts?.processed || 0} payouts`,
      });
    },
    onError: () => {
      toast({ title: 'Backfill Failed', variant: 'destructive' });
    },
  });

  const waterfallBackfillMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ops/waterfall/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Waterfall backfill failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/finances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/waterfall/buckets'] });
      toast({
        title: 'Bucket Allocation Complete',
        description: `Processed ${data.results?.length || 0} entries`,
      });
    },
    onError: () => {
      toast({ title: 'Bucket Allocation Failed', variant: 'destructive' });
    },
  });

  const cancelledOrderReversalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ops/cancelled-orders/backfill-reversals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Cancelled order reversal failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/finances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/ledger'] });
      toast({
        title: 'Cancelled Order Reversals Complete',
        description: data.message || `Processed ${data.results?.length || 0} orders`,
      });
    },
    onError: () => {
      toast({ title: 'Cancelled Order Reversal Failed', variant: 'destructive' });
    },
  });

  const handleManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntrySubmitting(true);
    
    try {
      const amountCents = Math.round(parseFloat(entryAmount || '0') * 100);
      const gstCents = Math.round(parseFloat(entryGst || '0') * 100);
      
      const res = await fetch('/api/ops/bookkeeping/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          eventDate: entryDate,
          sourceType: entryType,
          description: entryDescription,
          category: entryType === 'fuel_cost' ? 'fuel_cogs' : 'expense_other',
          grossAmountCents: entryType === 'owner_draw' ? amountCents : 0,
          gstPaidCents: gstCents,
          cogsFuelCents: entryType === 'fuel_cost' ? amountCents : 0,
          expenseOtherCents: entryType === 'expense' ? amountCents : 0,
        }),
      });
      
      if (!res.ok) throw new Error('Failed to create entry');
      
      setEntryDescription('');
      setEntryAmount('');
      setEntryGst('');
      setManualEntryOpen(false);
      // Invalidate all bookkeeping queries to refresh ledger and reports
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/ledger'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/diagnostics'] });
      toast({ title: 'Entry Created' });
    } catch (err) {
      toast({ title: 'Failed to create entry', variant: 'destructive' });
    } finally {
      setEntrySubmitting(false);
    }
  };

  const accounts = accountsData?.accounts || [];
  const settings = settingsData?.settings || {};
  const runway = runwayData;
  const weekSummary = weekSummaryData;
  const closes = closesData?.closes || [];
  
  const operatingMode = localOperatingMode ?? settings.operating_mode ?? 'soft_launch';
  const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.balance), 0);
  const holdingBalance = accounts.filter(a => a.isHolding).reduce((sum, a) => sum + parseFloat(a.balance), 0);

  const gstNeedsReviewCount = diagnosticsData?.gstReviewCount || 0;
  const unmappedCount = diagnosticsData?.unmappedCount || 0;
  const totalDiagnosticIssues = gstNeedsReviewCount + unmappedCount;

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const revenueBreakdown = useMemo(() => {
    if (!revenueData) return [];
    return [
      { name: 'Subscriptions', value: revenueData.subscriptionRevenue / 100, color: CHART_COLORS[0] },
      { name: 'Fuel Delivery', value: revenueData.fuelRevenue / 100, color: CHART_COLORS[1] },
      { name: 'Other', value: revenueData.otherRevenue / 100, color: CHART_COLORS[2] },
    ].filter(item => item.value > 0);
  }, [revenueData]);

  const analyticsOverview = overviewData?.overview;
  const routeEfficiency = routeEfficiencyData?.summary;
  const routeEfficiencyChart = routeEfficiencyData?.chartData || [];
  const ordersOverTime = chartData?.chartData || [];

  const tierData = analyticsOverview ? [
    { name: 'PAYG', value: analyticsOverview.tierDistribution?.payg || 0 },
    { name: 'ACCESS', value: analyticsOverview.tierDistribution?.access || 0 },
    { name: 'HOUSEHOLD', value: analyticsOverview.tierDistribution?.household || 0 },
    { name: 'RURAL', value: analyticsOverview.tierDistribution?.rural || 0 },
  ].filter(t => t.value > 0) : [];

  const tierBreakdown = [
    { tier: 'PAY AS YOU GO', subscribers: analyticsOverview?.tierDistribution?.payg || 0, mrr: 0 },
    { tier: 'ACCESS', subscribers: analyticsOverview?.tierDistribution?.access || 0, mrr: (analyticsOverview?.tierDistribution?.access || 0) * 24.99 },
    { tier: 'HOUSEHOLD', subscribers: analyticsOverview?.tierDistribution?.household || 0, mrr: (analyticsOverview?.tierDistribution?.household || 0) * 49.99 },
    { tier: 'RURAL / POWER USER', subscribers: analyticsOverview?.tierDistribution?.rural || 0, mrr: (analyticsOverview?.tierDistribution?.rural || 0) * 99.99 },
  ];

  const totalMRR = tierBreakdown.reduce((sum, t) => sum + t.mrr, 0);

  const analyticsDaily = analyticsOverview?.daily || {};
  const analyticsWeekly = analyticsOverview?.weekly || {};
  const analyticsMonthly = analyticsOverview?.monthly || {};
  const analyticsYearly = analyticsOverview?.yearly || {};

  const formatAnalyticsCurrency = (val: number) => val < 0 ? `-$${Math.abs(val).toFixed(2)}` : `$${val.toFixed(2)}`;

  const fuelTypeBreakdown = analyticsOverview?.fuelTypeBreakdown || { regular: { deliveries: 0, litres: 0, revenue: 0 }, diesel: { deliveries: 0, litres: 0, revenue: 0 }, premium: { deliveries: 0, litres: 0, revenue: 0 } };
  const fuelTypeRevenue = [
    { type: 'Regular 87 Gas', deliveries: fuelTypeBreakdown.regular?.deliveries || 0, litres: fuelTypeBreakdown.regular?.litres || 0, revenue: fuelTypeBreakdown.regular?.revenue || 0 },
    { type: 'Diesel', deliveries: fuelTypeBreakdown.diesel?.deliveries || 0, litres: fuelTypeBreakdown.diesel?.litres || 0, revenue: fuelTypeBreakdown.diesel?.revenue || 0 },
    { type: 'Premium 91 Gas', deliveries: fuelTypeBreakdown.premium?.deliveries || 0, litres: fuelTypeBreakdown.premium?.litres || 0, revenue: fuelTypeBreakdown.premium?.revenue || 0 },
  ];

  const yearlyOrders = analyticsYearly.orders || 0;
  const cancelledOrders = analyticsOverview?.cancelledOrders || 0;
  const completionRate = yearlyOrders > 0 ? ((yearlyOrders - cancelledOrders) / yearlyOrders) * 100 : 0;
  const cancellationRate = yearlyOrders > 0 ? (cancelledOrders / yearlyOrders) * 100 : 0;
  const avgLitresPerDelivery = yearlyOrders > 0 ? (analyticsYearly.litres || 0) / yearlyOrders : 0;

  const deletedOrders = {
    totalDeleted: analyticsOverview?.cancelledOrders || 0,
    lostRevenue: analyticsOverview?.cancelledRevenue || 0,
    monthlyData: analyticsOverview?.cancelledMonthlyData || [],
  };

  const activeCustomers = analyticsOverview?.totalCustomers || 0;
  const newCustomersThisMonth = analyticsOverview?.newCustomersThisMonth || 0;
  const totalOrders = yearlyOrders;
  const completedOrders = yearlyOrders - cancelledOrders;

  const lifetimeValue = activeCustomers > 0 ? (analyticsYearly.grossIncome || 0) / activeCustomers : 0;
  const avgRevenuePerCustomer = activeCustomers > 0 ? (analyticsMonthly.grossIncome || 0) / activeCustomers : 0;
  const avgOrderValue = yearlyOrders > 0 ? (analyticsYearly.grossIncome || 0) / yearlyOrders : 0;

  if (accountsLoading) {
    return (
      <OpsLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-copper" />
        </div>
      </OpsLayout>
    );
  }

  const content = (
    <div className="space-y-6">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        {/* HEADER CONTROLS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/ops">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-copper" />
                <h1 className="font-display text-xl font-bold text-foreground">Financial Command Center</h1>
              </div>
              <p className="text-sm text-muted-foreground">Your complete business finance dashboard</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
              <SelectTrigger className="w-28" data-testid="select-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-20" data-testid="select-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
              <span className={viewMode === 'live' ? 'text-foreground font-medium' : 'text-muted-foreground'}>Live</span>
              <Switch 
                checked={viewMode === 'month'}
                onCheckedChange={(checked) => setViewMode(checked ? 'month' : 'live')}
              />
              <span className={viewMode === 'month' ? 'text-foreground font-medium' : 'text-muted-foreground'}>Month</span>
            </div>

            {totalDiagnosticIssues > 0 && (
              <Sheet open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 border-amber-500/50 text-amber-600" data-testid="button-diagnostics">
                    <AlertTriangle className="w-4 h-4" />
                    {totalDiagnosticIssues} Issues
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[500px] sm:max-w-[500px]">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      Financial Diagnostics
                    </SheetTitle>
                    <SheetDescription>
                      Items requiring review or correction
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6">
                    {gstNeedsReviewCount > 0 && (
                      <div>
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <Banknote className="w-4 h-4 text-red-500" />
                          GST Needs Review ({gstNeedsReviewCount})
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {diagnosticsData?.gstReviewItems?.map((item: any) => (
                            <div key={item.id} className="p-2 rounded bg-red-50 dark:bg-red-950/20 text-sm">
                              <p className="font-medium">{item.description}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(item.eventDate), 'MMM d, yyyy')}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {unmappedCount > 0 && (
                      <div>
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-amber-500" />
                          Unmapped Revenue ({unmappedCount})
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {diagnosticsData?.unmappedRevenue?.map((item: any) => (
                            <div key={item.id} className="p-2 rounded bg-amber-50 dark:bg-amber-950/20 text-sm">
                              <p className="font-medium">{item.description}</p>
                              <p className="text-xs text-muted-foreground">{formatCurrency(item.grossAmountCents)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Manual correcting entries can be added in the Ledger tab.
                      Stripe-originated entries cannot be edited directly.
                    </p>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>

        {/* MAIN TABS */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="overview" data-testid="tab-overview" className="gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="ledger" data-testid="tab-ledger" className="gap-2">
              <Receipt className="w-4 h-4" />
              Ledger
            </TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics" className="gap-2">
              <Activity className="w-4 h-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="calculators" data-testid="tab-calculators" className="gap-2">
              <Calculator className="w-4 h-4" />
              Calculators
            </TabsTrigger>
          </TabsList>

          {/* ========== OVERVIEW TAB ========== */}
          <TabsContent value="overview" className="space-y-6">

        {/* TOP SUMMARY CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-2 border-copper/30 bg-gradient-to-br from-copper/5 to-background">
            <CardHeader className="pb-2">
              <CardDescription>Total All Buckets</CardDescription>
              <CardTitle className="text-2xl font-display">{formatDollars(totalBalance)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{accounts.length} accounts tracked</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Holding (Untouchable)</CardDescription>
              <CardTitle className="text-2xl font-display text-amber-600">{formatDollars(holdingBalance)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">GST, Tax, Reserves</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Owner Draw Holding</CardDescription>
              <CardTitle className="text-2xl font-display text-pink-600">
                {formatDollars(runway?.ownerDrawBalance || 0)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {runway?.monthsOfRunway?.toFixed(1) || 0} months runway
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>MTD Gross Revenue</CardDescription>
              <CardTitle className="text-2xl font-display text-sage">
                {revenueData ? formatCurrency(revenueData.totalRevenue) : '$0.00'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {months[selectedMonth - 1]} {selectedYear}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* SECTION 1: FINANCIAL BUCKET WATERFALL */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-copper" />
              9-Bucket Financial Waterfall
            </CardTitle>
            <CardDescription>Your financial buckets with current balances</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((account) => {
                const Icon = ACCOUNT_ICONS[account.accountType] || Wallet;
                const colorClass = ACCOUNT_COLORS[account.accountType] || 'bg-gray-500/10 border-gray-500/30';
                const balance = parseFloat(account.balance);
                
                return (
                  <motion.div 
                    key={account.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-xl border-2 ${colorClass} transition-all hover:scale-[1.02] cursor-pointer`}
                    data-testid={`bucket-${account.accountType}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5" />
                        <span className="font-medium text-sm">{account.name}</span>
                      </div>
                      {account.isHolding && (
                        <Badge variant="outline" className="text-xs">Holding</Badge>
                      )}
                    </div>
                    <p className="text-2xl font-display font-bold">
                      {formatDollars(balance)}
                    </p>
                    {account.description && (
                      <p className="text-xs text-muted-foreground mt-1">{account.description}</p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2: EMBEDDED BOOKKEEPING LEDGER */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-display flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-copper" />
                  Transaction Ledger
                  {viewMode === 'live' && <Badge variant="secondary" className="ml-2">Live MTD</Badge>}
                </CardTitle>
                <CardDescription>Stripe-led source of truth for all transactions</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-40" data-testid="select-ledger-category">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="outline">{ledgerData?.total || 0} entries</Badge>
                
                {/* Manual Entry Sheet */}
                {isOwner && (
                  <Sheet open={manualEntryOpen} onOpenChange={setManualEntryOpen}>
                    <SheetTrigger asChild>
                      <Button size="sm" className="gap-2" data-testid="button-add-entry">
                        <Plus className="w-4 h-4" />
                        Add Entry
                      </Button>
                    </SheetTrigger>
                    <SheetContent>
                      <SheetHeader>
                        <SheetTitle>Add Manual Entry</SheetTitle>
                        <SheetDescription>
                          Record fuel costs, expenses, and other manual adjustments
                        </SheetDescription>
                      </SheetHeader>
                      <form onSubmit={handleManualEntry} className="mt-6 space-y-4">
                        <div className="space-y-2">
                          <Label>Entry Type</Label>
                          <Select value={entryType} onValueChange={setEntryType}>
                            <SelectTrigger data-testid="select-entry-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fuel_cost">Fuel Cost (COGS)</SelectItem>
                              <SelectItem value="expense">Other Expense</SelectItem>
                              <SelectItem value="adjustment">Adjustment</SelectItem>
                              <SelectItem value="owner_draw">Owner Draw</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Input 
                            type="date" 
                            value={entryDate} 
                            onChange={(e) => setEntryDate(e.target.value)}
                            data-testid="input-entry-date"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input 
                            placeholder="e.g., UFA Cardlock fuel purchase"
                            value={entryDescription}
                            onChange={(e) => setEntryDescription(e.target.value)}
                            required
                            data-testid="input-entry-description"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Amount ($)</Label>
                          <Input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00"
                            value={entryAmount}
                            onChange={(e) => setEntryAmount(e.target.value)}
                            required
                            data-testid="input-entry-amount"
                          />
                        </div>
                        
                        {entryType === 'fuel_cost' && (
                          <div className="space-y-2">
                            <Label>GST Paid (ITC) ($)</Label>
                            <Input 
                              type="number" 
                              step="0.01" 
                              placeholder="0.00"
                              value={entryGst}
                              onChange={(e) => setEntryGst(e.target.value)}
                              data-testid="input-entry-gst"
                            />
                          </div>
                        )}
                        
                        <Button type="submit" disabled={entrySubmitting} className="w-full" data-testid="button-submit-entry">
                          {entrySubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                          Add Entry
                        </Button>
                      </form>
                    </SheetContent>
                  </Sheet>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Description</th>
                    <th className="text-left p-3">Category</th>
                    <th className="text-right p-3">Gross</th>
                    <th className="text-right p-3">GST</th>
                    <th className="text-right p-3">Fees</th>
                    <th className="text-right p-3">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : !ledgerData?.entries?.length ? (
                    <tr>
                      <td colSpan={7} className="text-center p-8 text-muted-foreground">
                        No entries for this period
                      </td>
                    </tr>
                  ) : (
                    ledgerData.entries.slice(0, 10).map((entry) => (
                      <tr 
                        key={entry.id} 
                        className={`border-b hover:bg-muted/30 ${entry.isReversal ? 'text-red-600' : ''}`}
                        data-testid={`row-ledger-${entry.id}`}
                      >
                        <td className="p-3">{format(new Date(entry.eventDate), 'MMM d')}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {entry.gstNeedsReview && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                            <span className="truncate max-w-[200px]">{entry.description}</span>
                            {entry.isReversal && <Badge variant="destructive" className="text-xs">Refund</Badge>}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {CATEGORY_LABELS[entry.category] || entry.category}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono">{formatCurrency(entry.grossAmountCents)}</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(entry.gstCollectedCents)}</td>
                        <td className="p-3 text-right font-mono text-muted-foreground">{formatCurrency(entry.stripeFeeCents)}</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(entry.netAmountCents)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {ledgerData && ledgerData.entries.length > 10 && (
              <div className="mt-4 text-center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                  onClick={() => setActiveTab('ledger')}
                  data-testid="btn-view-all-ledger"
                >
                  View All {ledgerData.total} Entries
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>


        {/* SECTION 4: ANALYTICS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-copper" />
                Revenue Summary
              </CardTitle>
              <CardDescription>{months[selectedMonth - 1]} {selectedYear}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {revenueData ? (
                <>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subscriptions</span>
                      <span className="font-mono font-medium">{formatCurrency(revenueData.subscriptionRevenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fuel Delivery</span>
                      <span className="font-mono font-medium">{formatCurrency(revenueData.fuelRevenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Other</span>
                      <span className="font-mono font-medium">{formatCurrency(revenueData.otherRevenue)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Total Revenue</span>
                      <span className="font-mono">{formatCurrency(revenueData.totalRevenue)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Stripe Fees</span>
                      <span className="font-mono">-{formatCurrency(revenueData.stripeFees)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Refunds</span>
                      <span className="font-mono">-{formatCurrency(revenueData.refunds)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  No data for this period
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Banknote className="w-5 h-5 text-red-500" />
                GST Summary
              </CardTitle>
              <CardDescription>CRA-ready summary</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {gstData ? (
                <>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST Collected</span>
                      <span className="font-mono font-medium">{formatCurrency(gstData.gstCollected)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST Paid (ITCs)</span>
                      <span className="font-mono font-medium">-{formatCurrency(gstData.gstPaid)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Net GST Owing</span>
                      <span className="font-mono text-red-600">{formatCurrency(gstData.netGstOwing)}</span>
                    </div>
                  </div>
                  {gstData.needsReviewCount > 0 && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm">{gstData.needsReviewCount} items need review</span>
                    </div>
                  )}
                  <div className="flex gap-2 w-full">
                    <Link href="/ops/gst-report" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-2">
                        <Printer className="w-4 h-4" />
                        Print Report
                      </Button>
                    </Link>
                    <a href={`/api/ops/bookkeeping/export/gst?year=${selectedYear}&month=${selectedMonth}`} download>
                      <Button variant="ghost" size="sm" className="gap-2">
                        <Download className="w-4 h-4" />
                        CSV
                      </Button>
                    </a>
                  </div>
                </>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  No data for this period
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Revenue Mix Chart */}
        {revenueBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-copper" />
                Revenue Mix
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {revenueBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatDollars(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SECTION 5: FREEDOM RUNWAY */}
        <Card className="border-2 border-pink-500/30 bg-gradient-to-br from-pink-500/5 to-background">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Heart className="w-5 h-5 text-pink-500" />
              Freedom Runway Tracker
            </CardTitle>
            <CardDescription>
              Track your progress toward replacing your full-time job income
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {runway && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-pink-500/10 border border-pink-500/30">
                    <p className="text-sm text-muted-foreground">Owner Draw Holding</p>
                    <p className="text-3xl font-display font-bold text-pink-600">
                      {formatDollars(runway.ownerDrawBalance)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Freedom fund</p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-sm text-muted-foreground">Monthly Target</p>
                    <p className="text-3xl font-display font-bold">{formatDollars(runway.targetMonthlyIncome)}</p>
                    <p className="text-xs text-muted-foreground mt-1">To replace your job</p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-sm text-muted-foreground">Current Runway</p>
                    <p className="text-3xl font-display font-bold text-sage">
                      {runway.monthsOfRunway.toFixed(1)} months
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">At target spending</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress to 6-Month Safety Net</span>
                    <span>{Math.min(100, (runway.monthsOfRunway / 6) * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={Math.min(100, (runway.monthsOfRunway / 6) * 100)} className="h-3" />
                </div>

                {runway.freedomDate && (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-sage/20 to-copper/20 border border-sage/30">
                    <div className="flex items-center gap-3">
                      <Target className="w-8 h-8 text-sage" />
                      <div>
                        <p className="text-sm text-muted-foreground">Projected Freedom Date</p>
                        <p className="text-2xl font-display font-bold">
                          {format(new Date(runway.freedomDate), 'MMMM d, yyyy')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ~{runway.weeksToFreedom} weeks at {formatDollars(runway.avgWeeklyContribution)}/week
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>


        {/* SETTINGS (collapsible or inline) */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Settings className="w-5 h-5 text-muted-foreground" />
              Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <p className="font-medium">Operating Mode: {operatingMode === 'soft_launch' ? 'Soft Launch' : 'Full-Time'}</p>
                <p className="text-sm text-muted-foreground">
                  {operatingMode === 'soft_launch' 
                    ? 'Operating Sun-Tue, close Wednesday'
                    : 'Operating Mon-Sat, close Sunday'}
                </p>
              </div>
              {isOwner && (
                <div className="flex items-center gap-3">
                  <span className={operatingMode === 'soft_launch' ? 'font-medium' : 'text-muted-foreground'}>
                    Soft
                  </span>
                  <Switch 
                    checked={operatingMode === 'full_time'}
                    onCheckedChange={(checked) => {
                      const newMode = checked ? 'full_time' : 'soft_launch';
                      setLocalOperatingMode(newMode);
                      updateSettingMutation.mutate({
                        key: 'operating_mode',
                        value: newMode
                      });
                    }}
                  />
                  <span className={operatingMode === 'full_time' ? 'font-medium' : 'text-muted-foreground'}>
                    Full
                  </span>
                </div>
              )}
            </div>

            {isOwner && (
              <div className="p-4 rounded-xl border">
                <Label>Target Monthly Income</Label>
                <div className="flex gap-2 mt-2">
                  <span className="text-muted-foreground self-center">$</span>
                  <Input 
                    type="number"
                    value={targetIncomeInput || settings.target_monthly_income || ''}
                    onChange={(e) => setTargetIncomeInput(e.target.value)}
                    className="max-w-32"
                    placeholder="6000"
                    data-testid="input-target-income"
                  />
                  <span className="text-muted-foreground self-center">/month</span>
                  <Button 
                    size="sm"
                    onClick={() => {
                      const value = targetIncomeInput.trim() === '' ? '0' : targetIncomeInput;
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue) && numValue >= 0) {
                        updateSettingMutation.mutate({
                          key: 'target_monthly_income',
                          value: numValue.toString()
                        });
                        setTargetIncomeInput('');
                      } else {
                        toast({ title: 'Invalid Amount', variant: 'destructive' });
                      }
                    }}
                    disabled={updateSettingMutation.isPending}
                    className="gap-1"
                    data-testid="button-update-income"
                  >
                    <Save className="w-4 h-4" />
                    Update
                  </Button>
                </div>
              </div>
            )}

            {/* Maintenance Tools (Owner only) */}
            {isOwner && (
              <Separator className="my-4" />
            )}
            {isOwner && (
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  Maintenance Tools
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <RefreshCw className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-sm">Stripe Backfill</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Import historical Stripe transactions
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm"
                        variant="outline"
                        onClick={() => backfillMutation.mutate({ dryRun: true })}
                        disabled={backfillMutation.isPending}
                        data-testid="button-backfill-dryrun"
                      >
                        {backfillMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                        Dry Run
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => backfillMutation.mutate({ dryRun: false })}
                        disabled={backfillMutation.isPending}
                        data-testid="button-backfill-run"
                      >
                        {backfillMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                        Run
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <PiggyBank className="w-4 h-4 text-green-500" />
                      <span className="font-medium text-sm">Bucket Allocation</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Process entries through 9-bucket waterfall
                    </p>
                    <Button 
                      size="sm"
                      onClick={() => waterfallBackfillMutation.mutate()}
                      disabled={waterfallBackfillMutation.isPending}
                      data-testid="button-waterfall-backfill"
                    >
                      {waterfallBackfillMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                      Allocate
                    </Button>
                  </div>

                  <div className="p-4 rounded-xl border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span className="font-medium text-sm">Cancelled Reversals</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Create reversals for cancelled orders
                    </p>
                    <Button 
                      size="sm"
                      variant="destructive"
                      onClick={() => cancelledOrderReversalMutation.mutate()}
                      disabled={cancelledOrderReversalMutation.isPending}
                      data-testid="button-cancelled-reversals"
                    >
                      {cancelledOrderReversalMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                      Process
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          {/* ========== LEDGER TAB ========== */}
          <TabsContent value="ledger" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-display flex items-center gap-2">
                      <Receipt className="w-5 h-5 text-copper" />
                      Full Transaction Ledger
                      {viewMode === 'live' && <Badge variant="secondary" className="ml-2">Live MTD</Badge>}
                    </CardTitle>
                    <CardDescription>Complete Stripe-led source of truth for all transactions</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-40" data-testid="select-ledger-category-full">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant="outline">{ledgerData?.total || 0} entries</Badge>
                    <Link href="/ops/ledger-report">
                      <Button variant="outline" size="sm" className="gap-2" data-testid="button-print-ledger">
                        <Printer className="w-4 h-4" />
                        Print Report
                      </Button>
                    </Link>
                    <a href={`/api/ops/bookkeeping/export/ledger?startDate=${startDate}&endDate=${endDate}`} download>
                      <Button variant="ghost" size="sm" className="gap-2" data-testid="button-export-ledger">
                        <Download className="w-4 h-4" />
                        CSV
                      </Button>
                    </a>
                    
                    {/* Manual Entry Sheet */}
                    {isOwner && (
                      <Sheet open={manualEntryOpen} onOpenChange={setManualEntryOpen}>
                        <SheetTrigger asChild>
                          <Button size="sm" className="gap-2" data-testid="button-add-entry-ledger">
                            <Plus className="w-4 h-4" />
                            Add Entry
                          </Button>
                        </SheetTrigger>
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>Add Manual Entry</SheetTitle>
                            <SheetDescription>
                              Record fuel costs, expenses, and other manual adjustments
                            </SheetDescription>
                          </SheetHeader>
                          <form onSubmit={handleManualEntry} className="mt-6 space-y-4">
                            <div className="space-y-2">
                              <Label>Entry Type</Label>
                              <Select value={entryType} onValueChange={setEntryType}>
                                <SelectTrigger data-testid="select-entry-type-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="fuel_cost">Fuel Cost (COGS)</SelectItem>
                                  <SelectItem value="expense">Other Expense</SelectItem>
                                  <SelectItem value="adjustment">Adjustment</SelectItem>
                                  <SelectItem value="owner_draw">Owner Draw</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Date</Label>
                              <Input 
                                type="date" 
                                value={entryDate} 
                                onChange={(e) => setEntryDate(e.target.value)}
                                data-testid="input-entry-date-full"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Description</Label>
                              <Input 
                                placeholder="e.g., UFA Cardlock fuel purchase"
                                value={entryDescription}
                                onChange={(e) => setEntryDescription(e.target.value)}
                                required
                                data-testid="input-entry-description-full"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Amount ($)</Label>
                              <Input 
                                type="number" 
                                step="0.01" 
                                placeholder="0.00"
                                value={entryAmount}
                                onChange={(e) => setEntryAmount(e.target.value)}
                                required
                                data-testid="input-entry-amount-full"
                              />
                            </div>
                            
                            {entryType === 'fuel_cost' && (
                              <div className="space-y-2">
                                <Label>GST Paid (ITC) ($)</Label>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  placeholder="0.00"
                                  value={entryGst}
                                  onChange={(e) => setEntryGst(e.target.value)}
                                  data-testid="input-entry-gst-full"
                                />
                              </div>
                            )}
                            
                            <Button type="submit" disabled={entrySubmitting} className="w-full" data-testid="button-submit-entry-full">
                              {entrySubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                              Add Entry
                            </Button>
                          </form>
                        </SheetContent>
                      </Sheet>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3">Date</th>
                        <th className="text-left p-3">Description</th>
                        <th className="text-left p-3">Category</th>
                        <th className="text-right p-3">Gross</th>
                        <th className="text-right p-3">GST</th>
                        <th className="text-right p-3">Fees</th>
                        <th className="text-right p-3">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerLoading ? (
                        <tr>
                          <td colSpan={7} className="text-center p-8">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                          </td>
                        </tr>
                      ) : !ledgerData?.entries?.length ? (
                        <tr>
                          <td colSpan={7} className="text-center p-8 text-muted-foreground">
                            No entries for this period
                          </td>
                        </tr>
                      ) : (
                        ledgerData.entries.map((entry) => (
                          <tr 
                            key={entry.id} 
                            className={`border-b hover:bg-muted/30 ${entry.isReversal ? 'text-red-600' : ''}`}
                            data-testid={`row-full-ledger-${entry.id}`}
                          >
                            <td className="p-3">{format(new Date(entry.eventDate), 'MMM d, yyyy')}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {entry.gstNeedsReview && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                                <span>{entry.description}</span>
                                {entry.isReversal && <Badge variant="destructive" className="text-xs">Refund</Badge>}
                              </div>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-xs">
                                {CATEGORY_LABELS[entry.category] || entry.category}
                              </Badge>
                            </td>
                            <td className="p-3 text-right font-mono">{formatCurrency(entry.grossAmountCents)}</td>
                            <td className="p-3 text-right font-mono">{formatCurrency(entry.gstCollectedCents)}</td>
                            <td className="p-3 text-right font-mono text-muted-foreground">{formatCurrency(entry.stripeFeeCents)}</td>
                            <td className="p-3 text-right font-mono">{formatCurrency(entry.netAmountCents)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== REPORTS TAB ========== */}
          <TabsContent value="reports" className="space-y-6">
            {/* Tax Coverage Health */}
            <TaxCoverageHealthWidget />

            {/* Weekly Close Section */}
            <Card className="border-2 border-sage/30">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-sage" />
                  Weekly Close
                </CardTitle>
                <CardDescription>
                  {weekSummary ? (
                    <>Week of {format(new Date(weekSummary.weekStart), 'MMM d')} - {format(new Date(weekSummary.weekEnd), 'MMM d, yyyy')}</>
                  ) : 'Current week summary'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {weekSummary && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Orders</p>
                        <p className="text-2xl font-display font-bold">{weekSummary.summary.ordersCompleted}</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Litres Billed</p>
                        <p className="text-2xl font-display font-bold">{weekSummary.summary.litresBilled.toFixed(1)}L</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Fuel Revenue</p>
                        <p className="text-2xl font-display font-bold">{formatDollars(weekSummary.summary.fuelRevenueGross)}</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">GST Collected</p>
                        <p className="text-2xl font-display font-bold">{formatDollars(weekSummary.summary.totalGstCollected)}</p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-sage/10 border border-sage/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Total Week Revenue</p>
                          <p className="text-3xl font-display font-bold text-sage">{formatDollars(weekSummary.summary.totalRevenue)}</p>
                        </div>
                        {isOwner && (
                          <Button className="gap-2" disabled>
                            <CheckCircle className="w-4 h-4" />
                            Run Weekly Close
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Weekly close: Fuel Reconciliation → GST Separation → Bucket Allocations → Owner Draw
                      </p>
                    </div>
                  </>
                )}

                {closes.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Recent Closes</h4>
                    <div className="space-y-2">
                      {closes.slice(0, 3).map((close) => (
                        <div key={close.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div>
                            <p className="font-medium text-sm">
                              Week of {format(new Date(close.weekStartDate), 'MMM d')} - {format(new Date(close.weekEndDate), 'MMM d')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {close.ordersCompleted || 0} orders • {formatDollars(parseFloat(close.fuelRevenueGross || 0))} fuel
                            </p>
                          </div>
                          <Badge variant={close.status === 'completed' ? 'default' : 'secondary'}>
                            {close.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Print Reports Section */}
            <Card className="border-2 border-copper/30">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Printer className="w-5 h-5 text-copper" />
                  Print Reports
                </CardTitle>
                <CardDescription>
                  Professional, print-ready financial documents from completed closeout periods
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PrintReportsSection />
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-sage" />
                    Revenue Summary
                  </CardTitle>
                  <CardDescription>{months[selectedMonth - 1]} {selectedYear}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {revenueData ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subscriptions</span>
                        <span className="font-mono">{formatCurrency(revenueData.subscriptionRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fuel Delivery</span>
                        <span className="font-mono">{formatCurrency(revenueData.fuelRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Other</span>
                        <span className="font-mono">{formatCurrency(revenueData.otherRevenue)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Total Revenue</span>
                        <span className="font-mono">{formatCurrency(revenueData.totalRevenue)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Stripe Fees</span>
                        <span className="font-mono">-{formatCurrency(revenueData.stripeFees)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Refunds</span>
                        <span className="font-mono">-{formatCurrency(revenueData.refunds)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="h-32 flex items-center justify-center text-muted-foreground">
                      No data for this period
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-red-500" />
                    GST Summary
                  </CardTitle>
                  <CardDescription>CRA-ready summary</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {gstData ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">GST Collected</span>
                        <span className="font-mono">{formatCurrency(gstData.gstCollected)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">GST Paid (ITCs)</span>
                        <span className="font-mono">-{formatCurrency(gstData.gstPaid)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Net GST Owing</span>
                        <span className="font-mono text-red-600">{formatCurrency(gstData.netGstOwing)}</span>
                      </div>
                      {gstData.needsReviewCount > 0 && (
                        <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center gap-2 text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm">{gstData.needsReviewCount} items need review</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-32 flex items-center justify-center text-muted-foreground">
                      No data for this period
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-copper" />
                    Cash Flow
                  </CardTitle>
                  <CardDescription>Monthly summary</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cashFlowData ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gross Income</span>
                        <span className="font-mono">{formatCurrency(cashFlowData.grossIncome)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Refunds</span>
                        <span className="font-mono">-{formatCurrency(cashFlowData.refunds)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Stripe Fees</span>
                        <span className="font-mono">-{formatCurrency(cashFlowData.stripeFees)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Fuel COGS</span>
                        <span className="font-mono">-{formatCurrency(cashFlowData.cogsFuel)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Other Expenses</span>
                        <span className="font-mono">-{formatCurrency(cashFlowData.expensesOther)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Net Cash Flow</span>
                        <span className={`font-mono ${cashFlowData.cashFlow >= 0 ? 'text-sage' : 'text-red-600'}`}>
                          {formatCurrency(cashFlowData.cashFlow)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="h-32 flex items-center justify-center text-muted-foreground">
                      No data for this period
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex gap-2">
              <Link href="/ops/gst-report">
                <Button variant="outline" data-testid="button-print-gst-report">
                  <Printer className="h-4 w-4 mr-2" />
                  Print GST Report
                </Button>
              </Link>
              <a href={`/api/ops/bookkeeping/export/gst?year=${selectedYear}&month=${selectedMonth}`} download>
                <Button variant="ghost" data-testid="button-export-gst-report">
                  <Download className="h-4 w-4 mr-2" />
                  CSV ({months[selectedMonth - 1]} {selectedYear})
                </Button>
              </a>
            </div>

            {/* Revenue Mix Chart */}
            {revenueBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-copper" />
                    Revenue Mix
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={revenueBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {revenueBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatDollars(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ========== ANALYTICS TAB ========== */}
          <TabsContent value="analytics" className="space-y-6">
            {analyticsLoading ? (
              <div className="min-h-[400px] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-copper" />
              </div>
            ) : (
              <>
                {/* Business Health Overview */}
                {(() => {
                  const weeklyOwnerDraw = analyticsWeekly.ownerDrawAvailable || 0;
                  const monthlyOwnerDraw = analyticsMonthly.ownerDrawAvailable || 0;
                  const dailyOwnerDraw = analyticsDaily.ownerDrawAvailable || 0;
                  const yearlyOwnerDraw = analyticsYearly.ownerDrawAvailable || 0;
                  
                  const weeklyRevenue = analyticsWeekly.grossIncome || 0;
                  const monthlyRevenue = analyticsMonthly.grossIncome || 0;
                  const yearlyRevenue = analyticsYearly.grossIncome || 0;
                  
                  const weeklyProfit = analyticsWeekly.trueProfit || 0;
                  const monthlyProfit = analyticsMonthly.trueProfit || 0;
                  
                  const grossMarginPct = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;
                  const netMarginPct = monthlyRevenue > 0 ? (monthlyOwnerDraw / monthlyRevenue) * 100 : 0;

                  const isProfitableDaily = dailyOwnerDraw > 0;
                  const isProfitableWeekly = weeklyOwnerDraw > 0;
                  const isProfitableMonthly = monthlyOwnerDraw > 0;
                  
                  const goalMonth6Weekly = 1200;
                  const goalMonth12Weekly = 3850;
                  const month6Progress = Math.min((weeklyOwnerDraw / goalMonth6Weekly) * 100, 100);
                  const month12Progress = Math.min((weeklyOwnerDraw / goalMonth12Weekly) * 100, 100);
                  
                  const projectedMonthlyFromWeek = weeklyOwnerDraw * 4.33;
                  const projectedYearlyFromMonth = monthlyOwnerDraw * 12;
                  const projectedYearlyRevenue = monthlyRevenue * 12;

                  const subscriptionMRR = totalMRR;
                  const fuelRevenue = (fuelTypeRevenue[0]?.revenue || 0) + (fuelTypeRevenue[1]?.revenue || 0) + (fuelTypeRevenue[2]?.revenue || 0);
                  const deliveryFeeRevenue = monthlyRevenue - subscriptionMRR - fuelRevenue;

                  return (
                    <Card className="border-2 border-copper/30 bg-gradient-to-br from-copper/5 to-background">
                      <CardHeader className="pb-4">
                        <CardTitle className="font-display flex items-center gap-2">
                          <LayoutDashboard className="w-5 h-5 text-copper" />
                          Business Health Overview
                        </CardTitle>
                        <CardDescription>Real-time performance based on actual orders and revenue</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className={`p-4 rounded-xl border-2 ${isProfitableWeekly ? 'border-sage/50 bg-sage/5' : 'border-amber-500/50 bg-amber-500/5'}`}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              {isProfitableWeekly ? (
                                <div className="w-10 h-10 rounded-full bg-sage/20 flex items-center justify-center">
                                  <TrendingUp className="w-5 h-5 text-sage" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                  <TrendingUp className="w-5 h-5 text-amber-500 rotate-180" />
                                </div>
                              )}
                              <div>
                                <h3 className="font-display font-bold">
                                  {isProfitableWeekly ? 'Profitable This Week' : 'Not Yet Profitable This Week'}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  Based on {analyticsWeekly.orders || 0} orders, {(analyticsWeekly.litres || 0).toFixed(0)}L delivered
                                </p>
                              </div>
                            </div>
                            <Badge className={isProfitableWeekly ? 'bg-sage text-white' : 'bg-amber-500 text-white'}>
                              {isProfitableWeekly ? 'Profitable' : 'Building'}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-4 gap-3 text-center">
                            <div className={`p-3 rounded-lg ${isProfitableDaily ? 'bg-sage/10' : 'bg-muted'}`}>
                              <div className="flex items-center justify-center gap-1 mb-1">
                                {isProfitableDaily ? <ArrowUpRight className="w-3 h-3 text-sage" /> : <ArrowDownRight className="w-3 h-3 text-amber-500" />}
                                <span className="text-xs text-muted-foreground">Daily</span>
                              </div>
                              <p className={`font-display text-lg font-bold ${isProfitableDaily ? 'text-sage' : 'text-amber-600'}`}>
                                {formatAnalyticsCurrency(dailyOwnerDraw)}
                              </p>
                            </div>
                            <div className={`p-3 rounded-lg ${isProfitableWeekly ? 'bg-sage/10' : 'bg-muted'}`}>
                              <div className="flex items-center justify-center gap-1 mb-1">
                                {isProfitableWeekly ? <ArrowUpRight className="w-3 h-3 text-sage" /> : <ArrowDownRight className="w-3 h-3 text-amber-500" />}
                                <span className="text-xs text-muted-foreground">Weekly</span>
                              </div>
                              <p className={`font-display text-lg font-bold ${isProfitableWeekly ? 'text-sage' : 'text-amber-600'}`}>
                                {formatAnalyticsCurrency(weeklyOwnerDraw)}
                              </p>
                            </div>
                            <div className={`p-3 rounded-lg ${isProfitableMonthly ? 'bg-sage/10' : 'bg-muted'}`}>
                              <div className="flex items-center justify-center gap-1 mb-1">
                                {isProfitableMonthly ? <ArrowUpRight className="w-3 h-3 text-sage" /> : <ArrowDownRight className="w-3 h-3 text-amber-500" />}
                                <span className="text-xs text-muted-foreground">Monthly</span>
                              </div>
                              <p className={`font-display text-lg font-bold ${isProfitableMonthly ? 'text-sage' : 'text-amber-600'}`}>
                                {formatAnalyticsCurrency(monthlyOwnerDraw)}
                              </p>
                            </div>
                            <div className={`p-3 rounded-lg ${yearlyOwnerDraw > 0 ? 'bg-sage/10' : 'bg-muted'}`}>
                              <div className="flex items-center justify-center gap-1 mb-1">
                                {yearlyOwnerDraw > 0 ? <ArrowUpRight className="w-3 h-3 text-sage" /> : <ArrowDownRight className="w-3 h-3 text-amber-500" />}
                                <span className="text-xs text-muted-foreground">YTD</span>
                              </div>
                              <p className={`font-display text-lg font-bold ${yearlyOwnerDraw > 0 ? 'text-sage' : 'text-amber-600'}`}>
                                {formatAnalyticsCurrency(yearlyOwnerDraw)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-4 gap-4">
                          <div className="p-4 rounded-xl bg-background border">
                            <div className="flex items-center gap-2 mb-2">
                              <Users className="w-4 h-4 text-copper" />
                              <span className="text-sm text-muted-foreground">Active Customers</span>
                            </div>
                            <p className="font-display text-2xl font-bold">{activeCustomers}</p>
                            <p className="text-xs text-muted-foreground">+{newCustomersThisMonth} this month</p>
                          </div>
                          
                          <div className="p-4 rounded-xl bg-background border">
                            <div className="flex items-center gap-2 mb-2">
                              <DollarSign className="w-4 h-4 text-blue-500" />
                              <span className="text-sm text-muted-foreground">Monthly Revenue</span>
                            </div>
                            <p className="font-display text-2xl font-bold">{formatAnalyticsCurrency(monthlyRevenue)}</p>
                            <p className="text-xs text-muted-foreground">Proj: {formatAnalyticsCurrency(projectedYearlyRevenue)}/yr</p>
                          </div>
                          
                          <div className="p-4 rounded-xl bg-background border">
                            <div className="flex items-center gap-2 mb-2">
                              <BarChart3 className="w-4 h-4 text-purple-500" />
                              <span className="text-sm text-muted-foreground">Gross Margin</span>
                            </div>
                            <p className={`font-display text-2xl font-bold ${grossMarginPct >= 0 ? '' : 'text-destructive'}`}>{grossMarginPct.toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground">{formatAnalyticsCurrency(monthlyProfit)} profit</p>
                          </div>
                          
                          <div className="p-4 rounded-xl bg-background border">
                            <div className="flex items-center gap-2 mb-2">
                              <Wallet className="w-4 h-4 text-sage" />
                              <span className="text-sm text-muted-foreground">Net Margin</span>
                            </div>
                            <p className={`font-display text-2xl font-bold ${netMarginPct >= 0 ? 'text-sage' : 'text-destructive'}`}>{netMarginPct.toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground">{formatAnalyticsCurrency(monthlyOwnerDraw)} owner draw</p>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <h4 className="font-display font-bold flex items-center gap-2">
                              <Target className="w-4 h-4 text-copper" />
                              Goal Progress (Based on Actual Weekly Draw)
                            </h4>
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm">Month 6 Goal: ${goalMonth6Weekly}/week</span>
                                <span className="text-sm font-medium">{month6Progress.toFixed(0)}%</span>
                              </div>
                              <Progress value={month6Progress} className="h-3" />
                              <p className="text-xs text-muted-foreground mt-1">
                                {month6Progress >= 100 
                                  ? 'Goal achieved!' 
                                  : `${formatAnalyticsCurrency(goalMonth6Weekly - weeklyOwnerDraw)} more per week needed`}
                              </p>
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm">Month 12 Goal: ${goalMonth12Weekly}/week</span>
                                <span className="text-sm font-medium">{month12Progress.toFixed(0)}%</span>
                              </div>
                              <Progress value={month12Progress} className="h-3" />
                              <p className="text-xs text-muted-foreground mt-1">
                                {month12Progress >= 100 
                                  ? 'Goal achieved!' 
                                  : `${formatAnalyticsCurrency(goalMonth12Weekly - weeklyOwnerDraw)} more per week needed`}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="font-display font-bold flex items-center gap-2">
                              <BarChart3 className="w-4 h-4 text-copper" />
                              Projections (Based on Current Performance)
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 rounded-lg bg-muted">
                                <p className="text-xs text-muted-foreground mb-1">Monthly Projection</p>
                                <p className={`font-display text-lg font-bold ${projectedMonthlyFromWeek >= 0 ? 'text-sage' : 'text-destructive'}`}>
                                  {formatAnalyticsCurrency(projectedMonthlyFromWeek)}
                                </p>
                                <p className="text-xs text-muted-foreground">Weekly × 4.33</p>
                              </div>
                              <div className="p-3 rounded-lg bg-muted">
                                <p className="text-xs text-muted-foreground mb-1">Yearly Projection</p>
                                <p className={`font-display text-lg font-bold ${projectedYearlyFromMonth >= 0 ? 'text-sage' : 'text-destructive'}`}>
                                  {formatAnalyticsCurrency(projectedYearlyFromMonth)}
                                </p>
                                <p className="text-xs text-muted-foreground">Monthly × 12</p>
                              </div>
                              <div className="p-3 rounded-lg bg-muted">
                                <p className="text-xs text-muted-foreground mb-1">Avg Order Value</p>
                                <p className="font-display text-lg font-bold">{formatAnalyticsCurrency(avgOrderValue)}</p>
                                <p className="text-xs text-muted-foreground">{totalOrders} orders YTD</p>
                              </div>
                              <div className="p-3 rounded-lg bg-muted">
                                <p className="text-xs text-muted-foreground mb-1">Revenue/Customer</p>
                                <p className="font-display text-lg font-bold">{formatAnalyticsCurrency(avgRevenuePerCustomer)}</p>
                                <p className="text-xs text-muted-foreground">Monthly avg</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t">
                          <h4 className="font-display font-bold mb-3">Revenue Sources (This Month)</h4>
                          <div className="space-y-2">
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Fuel Sales</span>
                                <span className="font-medium">{formatAnalyticsCurrency(fuelRevenue)}</span>
                              </div>
                              <Progress value={monthlyRevenue > 0 ? (fuelRevenue / monthlyRevenue) * 100 : 0} className="h-2" />
                            </div>
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Subscriptions (MRR)</span>
                                <span className="font-medium">{formatAnalyticsCurrency(subscriptionMRR)}</span>
                              </div>
                              <Progress value={monthlyRevenue > 0 ? (subscriptionMRR / monthlyRevenue) * 100 : 0} className="h-2" />
                            </div>
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Delivery Fees</span>
                                <span className="font-medium">{formatAnalyticsCurrency(Math.max(0, deliveryFeeRevenue))}</span>
                              </div>
                              <Progress value={monthlyRevenue > 0 ? (Math.max(0, deliveryFeeRevenue) / monthlyRevenue) * 100 : 0} className="h-2" />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Order Metrics */}
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
                        <p className="font-display text-3xl font-bold text-copper">{analyticsOverview?.monthOrders || 0}</p>
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

                {/* Route Efficiency Analytics */}
                <Card className="bg-blue-500/5 border-blue-500/20" data-testid="route-efficiency-analytics">
                  <CardHeader>
                    <CardTitle className="font-display flex items-center gap-2">
                      <Navigation className="w-5 h-5 text-blue-500" />
                      Route Efficiency Analytics
                    </CardTitle>
                    <CardDescription>Delivery route distances, fuel consumption estimates, and operational costs (Last 30 days)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                      <div className="p-3 rounded-lg bg-background border">
                        <div className="flex items-center gap-2 mb-1">
                          <Truck className="w-4 h-4 text-blue-500" />
                          <span className="text-xs text-muted-foreground">Total Routes</span>
                        </div>
                        <p className="font-display text-2xl font-bold">{routeEfficiency?.totalRoutes || 0}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background border">
                        <div className="flex items-center gap-2 mb-1">
                          <Navigation className="w-4 h-4 text-blue-500" />
                          <span className="text-xs text-muted-foreground">Total Distance</span>
                        </div>
                        <p className="font-display text-2xl font-bold">{(routeEfficiency?.totalDistanceKm || 0).toFixed(1)} km</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background border">
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className="w-4 h-4 text-sage" />
                          <span className="text-xs text-muted-foreground">Avg Route Distance</span>
                        </div>
                        <p className="font-display text-2xl font-bold">{(routeEfficiency?.avgRouteDistanceKm || 0).toFixed(1)} km</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background border">
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className="w-4 h-4 text-copper" />
                          <span className="text-xs text-muted-foreground">Avg Stop Distance</span>
                        </div>
                        <p className="font-display text-2xl font-bold">{(routeEfficiency?.avgStopDistanceKm || 0).toFixed(1)} km</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background border">
                        <div className="flex items-center gap-2 mb-1">
                          <Gauge className="w-4 h-4 text-amber-500" />
                          <span className="text-xs text-muted-foreground">Fleet Fuel Economy</span>
                        </div>
                        <p className="font-display text-2xl font-bold">{(routeEfficiency?.avgFleetFuelEconomy || 15).toFixed(1)} L/100km</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background border">
                        <div className="flex items-center gap-2 mb-1">
                          <Fuel className="w-4 h-4 text-brass" />
                          <span className="text-xs text-muted-foreground">Est. Fuel Used</span>
                        </div>
                        <p className="font-display text-2xl font-bold">{(routeEfficiency?.estimatedFuelUse || 0).toFixed(1)} L</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="p-4 rounded-lg bg-gradient-to-br from-amber-500/10 to-background border border-amber-500/20">
                        <h4 className="font-display font-medium flex items-center gap-2 mb-3">
                          <DollarSign className="w-4 h-4 text-amber-500" />
                          Estimated Operating Fuel Cost
                        </h4>
                        <p className="font-display text-4xl font-bold text-amber-600">${(routeEfficiency?.estimatedFuelCost || 0).toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Based on {(routeEfficiency?.estimatedFuelUse || 0).toFixed(1)}L @ ${(routeEfficiency?.dieselCostPerLitre || 1.45).toFixed(2)}/L
                        </p>
                      </div>

                      <div className="h-48">
                        <h4 className="font-display font-medium flex items-center gap-2 mb-3">
                          <TrendingUp className="w-4 h-4 text-blue-500" />
                          Daily Fuel Cost Trend
                        </h4>
                        <ResponsiveContainer width="100%" height="85%">
                          <AreaChart data={routeEfficiencyChart.slice(-14)}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis 
                              dataKey="date" 
                              tick={{ fontSize: 10 }}
                              tickFormatter={(val) => format(new Date(val), 'MM/dd')}
                            />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(val) => `$${val.toFixed(0)}`} />
                            <Tooltip 
                              formatter={(val: number) => [`$${val.toFixed(2)}`, 'Fuel Cost']}
                              labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="fuelCost" 
                              stroke="#f59e0b" 
                              fill="#f59e0b" 
                              fillOpacity={0.2} 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Subscription Tier Breakdown */}
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

                {/* Fuel Type Performance */}
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

                {/* Deleted Orders Archive */}
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
                    {deletedOrders.monthlyData.length > 0 && (
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
                    )}
                  </CardContent>
                </Card>

                {/* Customer Stats */}
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
                    <p className="font-display text-xl font-bold">100.0%</p>
                    <p className="text-xs text-muted-foreground">Churn 0%</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Avg Revenue/Customer</p>
                    <p className="font-display text-xl font-bold">${avgRevenuePerCustomer.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">This month per customer</p>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* ========== CALCULATORS TAB ========== */}
          <TabsContent value="calculators" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-copper" />
                  Business Calculators
                </CardTitle>
                <CardDescription>Financial planning and projection tools</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Link href="/ops/financials/calculators/fuel-markup">
                    <div className="p-6 rounded-xl border bg-gradient-to-br from-amber-500/10 to-amber-500/5 hover:shadow-md transition-shadow cursor-pointer group">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                          <Fuel className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium group-hover:text-amber-600 transition-colors">Fuel Markup Calculator</h3>
                          <p className="text-sm text-muted-foreground">Calculate fuel pricing and margins</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-amber-600 transition-colors" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Set your markup percentages and see real-time profit per litre for each fuel type.
                      </p>
                    </div>
                  </Link>
                  
                  <Link href="/ops/financials/calculators/profitability">
                    <div className="p-6 rounded-xl border bg-gradient-to-br from-sage/10 to-sage/5 hover:shadow-md transition-shadow cursor-pointer group">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-sage/20 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-sage" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium group-hover:text-sage transition-colors">Profitability Projections</h3>
                          <p className="text-sm text-muted-foreground">Weekly and monthly forecasts</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-sage transition-colors" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Project your revenue, costs, and net profit based on delivery volume.
                      </p>
                    </div>
                  </Link>
                  
                  <Link href="/ops/financials/calculators/freedom-runway">
                    <div className="p-6 rounded-xl border bg-gradient-to-br from-pink-500/10 to-pink-500/5 hover:shadow-md transition-shadow cursor-pointer group">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
                          <Target className="w-5 h-5 text-pink-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium group-hover:text-pink-600 transition-colors">Freedom Runway Planner</h3>
                          <p className="text-sm text-muted-foreground">Path to financial independence</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-pink-600 transition-colors" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Track your progress toward replacing your job income.
                      </p>
                    </div>
                  </Link>
                  
                  <Link href="/ops/financials/calculators/operating-costs">
                    <div className="p-6 rounded-xl border bg-gradient-to-br from-blue-500/10 to-blue-500/5 hover:shadow-md transition-shadow cursor-pointer group">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <RefreshCw className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium group-hover:text-blue-600 transition-colors">Operating Costs</h3>
                          <p className="text-sm text-muted-foreground">Track business expenses</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-600 transition-colors" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Manage daily, weekly, and monthly operating expenses.
                      </p>
                    </div>
                  </Link>
                  
                  <Link href="/ops/financials/calculators/tier-economics">
                    <div className="p-6 rounded-xl border bg-gradient-to-br from-purple-500/10 to-purple-500/5 hover:shadow-md transition-shadow cursor-pointer group">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <Eye className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium group-hover:text-purple-600 transition-colors">Tier Economics</h3>
                          <p className="text-sm text-muted-foreground">Compare subscription tier profitability</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-purple-600 transition-colors" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        See which subscription tiers are most profitable per customer.
                      </p>
                    </div>
                  </Link>
                  
                  <Link href="/ops/financials/calculators/net-margin">
                    <div className="p-6 rounded-xl border bg-gradient-to-br from-copper/10 to-copper/5 hover:shadow-md transition-shadow cursor-pointer group">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-copper/20 flex items-center justify-center">
                          <BarChart3 className="w-5 h-5 text-copper" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium group-hover:text-copper transition-colors">Net Margin Tracker</h3>
                          <p className="text-sm text-muted-foreground">Historical profitability trends</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-copper transition-colors" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Track net margin over time with daily logging at 10pm Calgary time.
                      </p>
                    </div>
                  </Link>
                </div>

                <div className="mt-6 pt-4 border-t flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Looking for old calculators? Access them during the transition period.
                  </p>
                  <Link href="/ops/financials/calculators/legacy">
                    <Button variant="outline" size="sm" className="gap-2" data-testid="link-legacy-calculators">
                      <Calculator className="w-4 h-4" />
                      Legacy Calculators
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );

  if (embedded) {
    return content;
  }
  return <OpsLayout>{content}</OpsLayout>;
}
