import { useState, useMemo, useRef } from 'react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { useUpload } from '@/hooks/use-upload';
import { 
  ArrowLeft, Wallet, PiggyBank, TrendingUp, Calendar, DollarSign, 
  Loader2, Target, CheckCircle, Clock, Download, Settings, Fuel,
  Building2, Shield, Wrench, Rocket, Heart, AlertTriangle, Banknote,
  CalendarCheck, FileSpreadsheet, LayoutDashboard, Save, Receipt, Plus,
  RefreshCw, Calculator, BarChart3, Eye, ChevronRight, Users, Truck,
  Activity, Zap, Navigation, Gauge, MapPin, Trash2, ArrowUpRight, ArrowDownRight, Database, Printer,
  Upload, Image, X, Scan, Camera, ChevronDown
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { TaxCoverageHealthWidget } from '@/components/TaxCoverageHealthWidget';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const ACCOUNT_ICONS: Record<string, any> = {
  operating_chequing: Building2,
  gst_holding: Banknote,
  deferred_subscription: Clock,
  income_tax_reserve: FileSpreadsheet,
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
  receiptUrl?: string | null;
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
  const [targetIncomeInput, setTargetIncomeInput] = useState<string | null>(null);
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
  const [entryReceiptUrl, setEntryReceiptUrl] = useState<string | null>(null);
  const [entryReceiptName, setEntryReceiptName] = useState<string | null>(null);
  const [entryLitres, setEntryLitres] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanConfidence, setScanConfidence] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  
  // Auto-calculated cost per litre for fuel entries
  const costPerLitre = useMemo(() => {
    const amount = parseFloat(entryAmount);
    const litres = parseFloat(entryLitres);
    if (!isNaN(amount) && !isNaN(litres) && litres > 0) {
      return (amount / litres).toFixed(4);
    }
    return null;
  }, [entryAmount, entryLitres]);
  
  // Handle receipt scan with AI
  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsScanning(true);
    setScanConfidence(null);
    
    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(file);
      });
      
      // Send to scan endpoint
      const res = await fetch('/api/ops/bookkeeping/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ imageBase64: base64 }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Scan failed');
      }
      
      const { data } = await res.json();
      
      // Auto-fill form fields
      if (data.date) {
        setEntryDate(data.date);
      }
      if (data.litres) {
        setEntryLitres(String(data.litres));
      }
      if (data.totalCost) {
        setEntryAmount(String(data.totalCost));
      }
      if (data.gstPaid) {
        setEntryGst(String(data.gstPaid));
      }
      
      setScanConfidence(data.confidence);
      
      // Also upload the receipt as the attachment
      await uploadFile(file);
      
      toast({ 
        title: 'Receipt scanned successfully',
        description: `Confidence: ${Math.round(data.confidence * 100)}%`
      });
    } catch (err: any) {
      toast({ 
        title: 'Scan failed', 
        description: err.message,
        variant: 'destructive'
      });
    } finally {
      setIsScanning(false);
      // Reset input for re-use
      if (scanInputRef.current) {
        scanInputRef.current.value = '';
      }
    }
  };
  
  // File upload hook
  const { uploadFile, isUploading: isUploadingReceipt } = useUpload({
    onSuccess: (response) => {
      setEntryReceiptUrl(response.objectPath);
      setEntryReceiptName(response.metadata.name);
      toast({ title: 'Receipt uploaded successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to upload receipt', description: error.message, variant: 'destructive' });
    },
  });

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

  const { data: orderWaterfallData, isLoading: orderWaterfallLoading } = useQuery<{
    orders: Array<{
      id: string;
      userId: string;
      scheduledDate: string;
      address: string;
      city: string;
      fuelType: string;
      actualLitresDelivered: string | null;
      fuelAmount: string;
      pricePerLitre: string;
      deliveryFee: string;
      subtotal: string;
      gstAmount: string;
      total: string;
      status: string;
      completedAt: string;
      userName: string | null;
      userEmail: string | null;
      waterfall: {
        grossTotal: number;
        subtotal: number;
        fuelSubtotal: number;
        deliverySubtotal: number;
        gstCollected: number;
        stripeFee: number;
        cogs: number;
        fuelMargin: number;
        deliveryMargin: number;
        litresDelivered: number;
        fuelBuckets: Record<string, number>;
        deliveryBuckets: Record<string, number>;
      };
    }>;
    total: number;
  }>({
    queryKey: ['/api/ops/finances/order-waterfall'],
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
      queryClient.invalidateQueries({ queryKey: ['/api/ops/finances/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/finances/runway'] });
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

  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [cleanupResult, setCleanupResult] = useState<{ totalDeleted: number; details: Record<string, number> } | null>(null);

  const cleanupDatabaseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/cleanup-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Database cleanup failed');
      return res.json();
    },
    onSuccess: (data) => {
      setCleanupResult({ totalDeleted: data.totalDeleted, details: data.details });
      setCleanupConfirmText('');
      queryClient.invalidateQueries();
      toast({
        title: 'Database Cleaned',
        description: `${data.totalDeleted} records removed. App is now a blank slate.`,
      });
    },
    onError: () => {
      toast({ title: 'Database Cleanup Failed', variant: 'destructive' });
    },
  });

  const handleManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate receipt for fuel_cost and expense entries
    if (['fuel_cost', 'expense'].includes(entryType) && !entryReceiptUrl) {
      toast({ title: 'Receipt required', description: 'Please upload a receipt for this entry type', variant: 'destructive' });
      return;
    }
    
    setEntrySubmitting(true);
    
    try {
      const amountCents = Math.round(parseFloat(entryAmount || '0') * 100);
      const gstCents = Math.round(parseFloat(entryGst || '0') * 100);
      
      // Auto-generate description for fuel_cost entries
      let description = entryDescription;
      if (entryType === 'fuel_cost' && entryLitres && costPerLitre) {
        description = `UFA Cardlock - ${parseFloat(entryLitres).toFixed(1)}L @ $${costPerLitre}/L`;
      }
      
      const res = await fetch('/api/ops/bookkeeping/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          eventDate: entryDate,
          sourceType: entryType,
          description,
          category: entryType === 'fuel_cost' ? 'fuel_cogs' : 'expense_other',
          grossAmountCents: entryType === 'owner_draw' ? amountCents : 0,
          gstPaidCents: gstCents,
          cogsFuelCents: entryType === 'fuel_cost' ? amountCents : 0,
          expenseOtherCents: entryType === 'expense' ? amountCents : 0,
          receiptUrl: entryReceiptUrl,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to create entry');
      }
      
      setEntryDescription('');
      setEntryAmount('');
      setEntryGst('');
      setEntryLitres('');
      setEntryReceiptUrl(null);
      setEntryReceiptName(null);
      setManualEntryOpen(false);
      // Invalidate all bookkeeping queries to refresh ledger and reports
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/ledger'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/diagnostics'] });
      toast({ title: 'Entry Created' });
    } catch (err: any) {
      toast({ title: 'Failed to create entry', description: err.message, variant: 'destructive' });
    } finally {
      setEntrySubmitting(false);
    }
  };
  
  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };
  
  const handleRemoveReceipt = () => {
    setEntryReceiptUrl(null);
    setEntryReceiptName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
    // When embedded, don't wrap in OpsLayout - just show simple spinner
    if (embedded) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-copper" />
        </div>
      );
    }
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
      {/* Shared hidden file input for receipt scanning - accessible by both form tabs */}
      <input
        ref={scanInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleScanReceipt}
        className="hidden"
        data-testid="input-scan-receipt"
      />
      <div className={embedded ? "" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6"}>
        {/* HEADER CONTROLS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {!embedded && (
            <div className="flex items-center gap-3">
              <Link href="/ops">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-copper" />
                  <h1 className="font-display text-2xl font-bold text-foreground">Financial Command Center</h1>
                </div>
                <p className="text-sm text-muted-foreground">Your complete business finance dashboard</p>
              </motion.div>
            </div>
          )}
          
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
          <TabsList className="grid grid-cols-3 w-full max-w-lg">
            <TabsTrigger value="overview" data-testid="tab-overview" className="gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="ledger" data-testid="tab-ledger" className="gap-2">
              <Receipt className="w-4 h-4" />
              Ledger
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics" className="gap-2">
              <Activity className="w-4 h-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* ========== OVERVIEW TAB ========== */}
          <TabsContent value="overview" className="space-y-6">

        {/* ═══ KPI BAR ═══ */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="kpi-bar">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }} className="p-3 rounded-xl border-2 border-copper/30 bg-gradient-to-br from-copper/5 to-background">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-copper" />
              <p className="text-xs text-muted-foreground font-medium">Gross Revenue</p>
            </div>
            <p className="font-display text-xl font-bold" data-testid="kpi-gross-revenue">
              {revenueData ? formatCurrency(revenueData.totalRevenue) : '$0.00'}
            </p>
            <p className="text-[10px] text-muted-foreground">{months[selectedMonth - 1]} {selectedYear}</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="p-3 rounded-xl border bg-background hover:shadow-md hover:border-copper/20 transition-all duration-200">
            <div className="flex items-center gap-1.5 mb-1">
              <Banknote className="w-3.5 h-3.5 text-red-500" />
              <p className="text-xs text-muted-foreground font-medium">Net GST Owing</p>
            </div>
            <p className="font-display text-xl font-bold text-red-600" data-testid="kpi-gst-owing">
              {gstData ? formatCurrency(gstData.netGstOwing) : '$0.00'}
            </p>
            <p className="text-[10px] text-muted-foreground">CRA liability</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="p-3 rounded-xl border bg-background hover:shadow-md hover:border-copper/20 transition-all duration-200">
            <div className="flex items-center gap-1.5 mb-1">
              <PiggyBank className="w-3.5 h-3.5 text-copper" />
              <p className="text-xs text-muted-foreground font-medium">All Buckets</p>
            </div>
            <p className="font-display text-xl font-bold" data-testid="kpi-total-balance">
              {formatDollars(totalBalance)}
            </p>
            <p className="text-[10px] text-muted-foreground">{accounts.length} accounts</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }} className="p-3 rounded-xl border bg-background hover:shadow-md hover:border-copper/20 transition-all duration-200">
            <div className="flex items-center gap-1.5 mb-1">
              <Heart className="w-3.5 h-3.5 text-pink-500" />
              <p className="text-xs text-muted-foreground font-medium">Owner Draw</p>
            </div>
            <p className="font-display text-xl font-bold text-pink-600" data-testid="kpi-owner-draw">
              {formatDollars(runway?.ownerDrawBalance || 0)}
            </p>
            <p className="text-[10px] text-muted-foreground">{runway?.monthsOfRunway?.toFixed(1) || 0} mo runway</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="p-3 rounded-xl border bg-background hover:shadow-md hover:border-copper/20 transition-all duration-200">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-copper" />
              <p className="text-xs text-muted-foreground font-medium">Orders</p>
            </div>
            <p className="font-display text-xl font-bold text-copper" data-testid="kpi-orders">
              {orderWaterfallData?.total || 0}
            </p>
            <p className="text-[10px] text-muted-foreground">Completed</p>
          </motion.div>
        </div>

        {/* ═══ LIVE P&L STATEMENT ═══ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-2 border-copper/20 shadow-sm" data-testid="live-pnl-statement">
          <CardHeader className="pb-3">
            <CardTitle className="font-display flex items-center gap-2">
              <Wallet className="w-5 h-5 text-copper" />
              Live Profit & Loss Statement
            </CardTitle>
            <CardDescription>
              Real business data · {viewMode === 'live' ? 'Month-to-date' : `${months[selectedMonth - 1]} ${selectedYear}`} · 9-bucket CRA-compliant waterfall
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {(() => {
              const grossRevenueCents = revenueData?.totalRevenue || 0;
              const grossRevenue = grossRevenueCents / 100;
              const subscriptionRevenueCents = revenueData?.subscriptionRevenue || 0;
              const fuelRevenueCents = revenueData?.fuelRevenue || 0;
              const otherRevenueCents = revenueData?.otherRevenue || 0;
              const stripeFeesCents = revenueData?.stripeFees || 0;
              const stripeFees = stripeFeesCents / 100;
              const stripePayout = grossRevenue - stripeFees;

              const gstCollectedCents = gstData?.gstCollected || 0;
              const gstPaidCents = gstData?.gstPaid || 0;
              const netGstOwingCents = gstData?.netGstOwing || 0;

              const fuelCogsCents = cashFlowData?.cogsFuel || 0;
              const expenseOtherCents = cashFlowData?.expensesOther || 0;
              const totalMandatoryCents = gstCollectedCents + stripeFeesCents + fuelCogsCents + expenseOtherCents;

              const netBusinessIncomeCents = grossRevenueCents - totalMandatoryCents;
              const incomeTaxRatePct = 0.25;
              const incomeTaxCents = netBusinessIncomeCents > 0 ? Math.round(netBusinessIncomeCents * incomeTaxRatePct) : 0;

              const subscriptionNetCents = Math.round(subscriptionRevenueCents / 1.05) - Math.round(stripeFeesCents * (subscriptionRevenueCents / (grossRevenueCents || 1)));
              const deferredSubCents = Math.max(0, Math.round(subscriptionNetCents * 0.40));

              const totalAllMandatoryCents = totalMandatoryCents + incomeTaxCents + deferredSubCents;
              const distributableProfitCents = grossRevenueCents - totalAllMandatoryCents;
              const profitForSplitCents = Math.max(0, distributableProfitCents);

              const discSplit = { ownerDraw: 0.55, growth: 0.25, maintenance: 0.10, emergency: 0.10 };
              const ownerDrawCents = Math.round(profitForSplitCents * discSplit.ownerDraw);
              const growthCents = Math.round(profitForSplitCents * discSplit.growth);
              const maintenanceCents = Math.round(profitForSplitCents * discSplit.maintenance);
              const emergencyCents = Math.round(profitForSplitCents * discSplit.emergency);
              const totalDiscretionaryCents = ownerDrawCents + growthCents + maintenanceCents + emergencyCents;

              return (
                <>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-2 pb-1">1. Revenue Recognition</div>
                  <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
                    <span className="text-sm text-muted-foreground">Subscription Revenue</span>
                    <span className="text-sm font-medium" data-testid="pnl-subscription">{formatCurrency(subscriptionRevenueCents)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
                    <span className="text-sm text-muted-foreground">Fuel Delivery Revenue</span>
                    <span className="text-sm font-medium" data-testid="pnl-fuel">{formatCurrency(fuelRevenueCents)}</span>
                  </div>
                  {otherRevenueCents > 0 && (
                    <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
                      <span className="text-sm text-muted-foreground">Other Revenue</span>
                      <span className="text-sm font-medium">{formatCurrency(otherRevenueCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 px-2 border-t font-medium">
                    <span className="text-sm">Total Gross Revenue (Customer-Paid)</span>
                    <span className="text-sm" data-testid="pnl-gross-revenue">{formatCurrency(grossRevenueCents)}</span>
                  </div>

                  <div className="text-xs uppercase tracking-wider text-red-700 font-bold pt-5 pb-1 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                    MANDATORY OBLIGATIONS
                  </div>
                  <p className="text-xs text-muted-foreground px-2 mb-1">Subtracted from gross revenue before any discretionary allocations.</p>

                  <div className="flex justify-between py-2.5 px-3 bg-red-500/10 rounded-lg font-medium mt-1">
                    <div>
                      <span className="text-sm">GST Collected → GST Holding</span>
                      <p className="text-[10px] text-red-600/70">5% on gross revenue (CRA)</p>
                    </div>
                    <span className="text-sm text-red-600" data-testid="pnl-gst">-{formatCurrency(gstCollectedCents)}</span>
                  </div>

                  <div className="flex justify-between py-2.5 px-3 bg-amber-500/10 rounded-lg font-medium mt-1">
                    <div>
                      <span className="text-sm">Stripe Processing Fees</span>
                      <p className="text-[10px] text-amber-600/70">Bank deposit: {formatDollars(stripePayout)}/mo</p>
                    </div>
                    <span className="text-sm text-amber-600" data-testid="pnl-stripe">-{formatCurrency(stripeFeesCents)}</span>
                  </div>

                  <div className="flex justify-between py-2.5 px-3 bg-amber-500/10 rounded-lg font-medium mt-1">
                    <span className="text-sm">Fuel COGS → UFA Payable</span>
                    <span className="text-sm text-amber-600" data-testid="pnl-cogs">-{formatCurrency(fuelCogsCents)}</span>
                  </div>

                  <div className="flex justify-between py-2.5 px-3 bg-amber-500/10 rounded-lg font-medium mt-1">
                    <span className="text-sm">Operating Expenses</span>
                    <span className="text-sm text-amber-600" data-testid="pnl-opex">-{formatCurrency(expenseOtherCents)}</span>
                  </div>

                  <div className="flex justify-between py-2.5 px-3 bg-orange-500/10 rounded-lg font-medium mt-1">
                    <div>
                      <span className="text-sm">Income Tax Reserve (25%)</span>
                      <p className="text-[10px] text-orange-600/70">On net business income of {formatCurrency(netBusinessIncomeCents)}</p>
                    </div>
                    <span className="text-sm text-orange-600" data-testid="pnl-tax">-{formatCurrency(incomeTaxCents)}</span>
                  </div>

                  <div className="flex justify-between py-2.5 px-3 bg-purple-500/10 rounded-lg font-medium mt-1">
                    <div>
                      <span className="text-sm">Deferred Subscription Revenue (40%)</span>
                      <p className="text-[10px] text-purple-600/70">Unearned revenue obligation</p>
                    </div>
                    <span className="text-sm text-purple-600" data-testid="pnl-deferred">-{formatCurrency(deferredSubCents)}</span>
                  </div>

                  <div className="flex justify-between py-2.5 px-3 bg-red-500/10 rounded-lg font-medium mt-4 border border-red-300">
                    <div>
                      <span className="text-sm text-red-700">Total Mandatory Obligations</span>
                      <p className="text-[10px] text-red-600/70">GST + Stripe + COGS + OpEx + Tax + Deferred</p>
                    </div>
                    <span className="text-sm font-bold text-red-700" data-testid="pnl-total-mandatory">-{formatCurrency(totalAllMandatoryCents)}</span>
                  </div>

                  <div className={`flex justify-between py-3 px-4 rounded-xl mt-3 border-2 ${distributableProfitCents < 0 ? 'bg-red-500/15 border-red-400' : 'bg-sage/15 border-sage/30'}`}>
                    <div>
                      <span className={`font-medium ${distributableProfitCents < 0 ? 'text-red-700' : ''}`}>Distributable Profit</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Gross Revenue minus all mandatory obligations</p>
                    </div>
                    <span className={`font-display text-xl font-bold ${distributableProfitCents >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="pnl-distributable-profit">
                      {formatCurrency(distributableProfitCents)}
                    </span>
                  </div>

                  {distributableProfitCents < 0 && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-300 mt-2">
                      <p className="text-xs text-red-700 font-medium">
                        Mandatory obligations exceed revenue by {formatCurrency(Math.abs(distributableProfitCents))}. The business cannot cover its basic costs this period.
                      </p>
                    </div>
                  )}

                  <div className="text-xs uppercase tracking-wider text-sage font-bold pt-5 pb-1 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-sage animate-pulse" />
                    DISCRETIONARY RESERVES
                  </div>
                  <p className="text-xs text-muted-foreground px-2 mb-2">4 buckets split 100% of {formatCurrency(profitForSplitCents)} distributable profit.</p>

                  <div className="border rounded-lg overflow-hidden">
                    <div className="grid gap-1 px-3 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground border-b" style={{ gridTemplateColumns: '2.5fr 0.8fr 0.8fr 1fr 1fr' }}>
                      <div>Reserve Bucket</div>
                      <div className="text-right">Split %</div>
                      <div className="text-right">Weekly</div>
                      <div className="text-right">Monthly</div>
                      <div className="text-right">Annual</div>
                    </div>

                    {([
                      { key: 'maintenance', name: 'Maintenance & Replacement', desc: 'Equipment maintenance and replacement fund', color: 'text-amber-700', pct: discSplit.maintenance, cents: maintenanceCents },
                      { key: 'emergency', name: 'Emergency / Risk Fund', desc: 'Emergency and risk buffer', color: 'text-rose-600', pct: discSplit.emergency, cents: emergencyCents },
                      { key: 'growth', name: 'Growth / Capital Fund', desc: 'Business expansion and capital', color: 'text-teal-600', pct: discSplit.growth, cents: growthCents },
                      { key: 'owner_draw', name: 'Owner Draw Holding', desc: 'Available for owner compensation', color: 'text-sage', pct: discSplit.ownerDraw, cents: ownerDrawCents },
                    ]).map(({ key, name, desc, color, pct, cents }) => {
                      const monthly = cents / 100;
                      const weekly = monthly * 12 / 52;
                      const annual = monthly * 12;
                      const isOwnerDrawRow = key === 'owner_draw';
                      return (
                        <div
                          key={key}
                          className={`grid gap-1 px-3 py-2 text-xs items-center border-b border-border/30 ${isOwnerDrawRow ? 'bg-sage/10' : 'hover:bg-muted/30'}`}
                          style={{ gridTemplateColumns: '2.5fr 0.8fr 0.8fr 1fr 1fr' }}
                          data-testid={`pnl-bucket-${key}`}
                        >
                          <div>
                            <div className={`font-medium ${color} ${isOwnerDrawRow ? 'text-sm' : ''}`}>{name}</div>
                            <div className="text-[10px] text-muted-foreground leading-tight">{desc}</div>
                          </div>
                          <div className={`text-right font-medium ${color}`}>{(pct * 100).toFixed(0)}%</div>
                          <div className={`text-right font-medium ${isOwnerDrawRow ? 'text-sage' : color}`}>{formatDollars(weekly)}</div>
                          <div className={`text-right font-bold ${isOwnerDrawRow ? 'text-sage text-sm' : color}`}>{formatDollars(monthly)}</div>
                          <div className={`text-right font-semibold ${isOwnerDrawRow ? 'text-sage' : ''}`}>{formatDollars(annual)}</div>
                        </div>
                      );
                    })}

                    <div className="grid gap-1 px-3 py-2 text-xs font-bold border-t-2 border-sage/30 bg-sage/5" style={{ gridTemplateColumns: '2.5fr 0.8fr 0.8fr 1fr 1fr' }}>
                      <div className="text-sage">Total Discretionary</div>
                      <div className="text-right text-sage">100%</div>
                      <div className="text-right text-sage">{formatDollars(totalDiscretionaryCents / 100 * 12 / 52)}</div>
                      <div className="text-right text-sage text-sm">{formatCurrency(totalDiscretionaryCents)}</div>
                      <div className="text-right text-sage">{formatDollars(totalDiscretionaryCents / 100 * 12)}</div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground px-2 mt-3 space-y-0.5">
                    <p className="italic">
                      Gross Revenue ({formatCurrency(grossRevenueCents)})
                      → Mandatory Obligations (-{formatCurrency(totalAllMandatoryCents)})
                      → Distributable Profit ({formatCurrency(distributableProfitCents)})
                      → 4 Discretionary Buckets ({formatCurrency(totalDiscretionaryCents)})
                    </p>
                    <p className="italic">Bank deposit: {formatDollars(stripePayout)}/mo (gross minus Stripe fees)</p>
                  </div>

                  <div className="flex justify-between py-3 px-4 bg-sage/15 rounded-xl mt-4 border-2 border-sage/30">
                    <div>
                      <span className="font-medium">Owner Draw Holding ({(discSplit.ownerDraw * 100).toFixed(0)}% of distributable profit)</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Your take-home after all mandatory obligations</p>
                    </div>
                    <span className="font-display text-xl font-bold text-sage" data-testid="pnl-owner-draw-final">{formatCurrency(ownerDrawCents)}</span>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
        </motion.div>

        {/* ═══ 9-BUCKET ACCOUNT BALANCES (COMPACT GRID) ═══ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card data-testid="bucket-balances-grid">
          <CardHeader className="pb-3">
            <CardTitle className="font-display flex items-center gap-2 text-base">
              <PiggyBank className="w-5 h-5 text-copper" />
              Account Balances
            </CardTitle>
            <CardDescription>Current balance in each of your 9 financial buckets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {accounts.map((account) => {
                const Icon = ACCOUNT_ICONS[account.accountType] || Wallet;
                const colorClass = ACCOUNT_COLORS[account.accountType] || 'bg-gray-500/10 border-gray-500/30';
                const balance = parseFloat(account.balance);
                return (
                  <div
                    key={account.id}
                    className={`p-3 rounded-lg border ${colorClass} transition-all hover:shadow-md hover:scale-[1.02] duration-200 cursor-default`}
                    data-testid={`bucket-${account.accountType}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-medium truncate">{account.name}</span>
                    </div>
                    <p className="font-display text-lg font-bold">{formatDollars(balance)}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total Across All Buckets</span>
              <span className="font-display text-lg font-bold">{formatDollars(totalBalance)}</span>
            </div>
          </CardContent>
        </Card>
        </motion.div>

        {/* ═══ REVENUE & GST SUMMARY (COMPACT 2-COL) ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-copper" />
                Revenue Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {revenueData ? (
                <>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-muted-foreground">Subscriptions</span>
                    <span className="font-mono font-medium">{formatCurrency(revenueData.subscriptionRevenue)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-muted-foreground">Fuel Delivery</span>
                    <span className="font-mono font-medium">{formatCurrency(revenueData.fuelRevenue)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-muted-foreground">Other</span>
                    <span className="font-mono font-medium">{formatCurrency(revenueData.otherRevenue)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between py-1 font-semibold text-sm">
                    <span>Total</span>
                    <span className="font-mono">{formatCurrency(revenueData.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-xs text-muted-foreground">
                    <span>Stripe Fees</span>
                    <span className="font-mono">-{formatCurrency(revenueData.stripeFees)}</span>
                  </div>
                </>
              ) : (
                <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">No data</div>
              )}
            </CardContent>
          </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <Banknote className="w-4 h-4 text-red-500" />
                GST Summary (CRA)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {gstData ? (
                <>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-muted-foreground">GST Collected</span>
                    <span className="font-mono font-medium">{formatCurrency(gstData.gstCollected)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-muted-foreground">GST Paid (ITCs)</span>
                    <span className="font-mono font-medium">-{formatCurrency(gstData.gstPaid)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between py-1 font-semibold text-sm">
                    <span>Net GST Owing</span>
                    <span className="font-mono text-red-600">{formatCurrency(gstData.netGstOwing)}</span>
                  </div>
                  {gstData.needsReviewCount > 0 && (
                    <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/20 flex items-center gap-2 text-amber-600 text-xs">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{gstData.needsReviewCount} items need review</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Link href="/owner/finance/gst-report" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-2 text-xs h-8">
                        <Printer className="w-3 h-3" />
                        Print
                      </Button>
                    </Link>
                    <a href={`/api/ops/bookkeeping/export/gst?year=${selectedYear}&month=${selectedMonth}`} download>
                      <Button variant="ghost" size="sm" className="gap-2 text-xs h-8">
                        <Download className="w-3 h-3" />
                        CSV
                      </Button>
                    </a>
                  </div>
                </>
              ) : (
                <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">No data</div>
              )}
            </CardContent>
          </Card>
          </motion.div>
        </div>

        {/* ═══ RECENT ACTIVITY ═══ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card className="shadow-sm" data-testid="recent-activity">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-display text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-copper" />
                  Recent Activity
                </CardTitle>
                <CardDescription>{orderWaterfallData?.total || 0} completed orders</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={() => setActiveTab('ledger')}
                data-testid="btn-view-full-ledger"
              >
                Full Ledger
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {orderWaterfallLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : !orderWaterfallData?.orders?.length ? (
              <div className="text-center py-6 text-muted-foreground text-sm">No completed orders yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Date</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Customer</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Location</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Litres</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Gross</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderWaterfallData.orders.slice(0, 8).map((order) => (
                      <tr key={order.id} className="border-b border-border/30 hover:bg-muted/20" data-testid={`order-row-${order.id}`}>
                        <td className="py-2 px-3 text-xs text-muted-foreground">{format(new Date(order.completedAt), 'MMM d')}</td>
                        <td className="py-2 px-3 text-xs font-medium">{order.userName || order.userEmail || 'Customer'}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">{order.city}</td>
                        <td className="py-2 px-3 text-xs text-right font-mono">{order.waterfall.litresDelivered.toFixed(1)}L</td>
                        <td className="py-2 px-3 text-xs text-right font-mono font-medium">{formatCurrency(order.waterfall.grossTotal)}</td>
                        <td className="py-2 px-3 text-xs text-right font-mono text-sage">{formatCurrency(order.waterfall.fuelMargin + order.waterfall.deliveryMargin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orderWaterfallData.orders.length > 8 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">Showing 8 of {orderWaterfallData.total} orders</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        </motion.div>

        {/* ═══ FREEDOM RUNWAY (COMPACT) ═══ */}
        {runway && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-2 border-pink-500/20 shadow-sm" data-testid="freedom-runway">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-500" />
                Freedom Runway
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Owner Draw Balance</p>
                  <p className="font-display text-xl font-bold text-pink-600">{formatDollars(runway.ownerDrawBalance)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Monthly Target</p>
                  <p className="font-display text-xl font-bold">{formatDollars(runway.targetMonthlyIncome)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Runway</p>
                  <p className="font-display text-xl font-bold text-sage">{runway.monthsOfRunway.toFixed(1)} mo</p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Progress to 6-Month Safety Net</span>
                  <span>{Math.min(100, (runway.monthsOfRunway / 6) * 100).toFixed(0)}%</span>
                </div>
                <Progress value={Math.min(100, (runway.monthsOfRunway / 6) * 100)} className="h-2" />
              </div>
              {runway.freedomDate && (
                <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-sage/10 to-copper/10 border border-sage/20 flex items-center gap-3">
                  <Target className="w-5 h-5 text-sage flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Freedom Date: {format(new Date(runway.freedomDate), 'MMM d, yyyy')}</p>
                    <p className="text-xs text-muted-foreground">~{runway.weeksToFreedom} weeks at {formatDollars(runway.avgWeeklyContribution)}/week</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </motion.div>
        )}

        {/* ═══ SETTINGS & TOOLS (COLLAPSIBLE) ═══ */}
        <Collapsible>
          <Card className="shadow-sm">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display text-base flex items-center gap-2">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    Settings & Tools
                  </CardTitle>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">Operating Mode: {operatingMode === 'soft_launch' ? 'Soft Launch' : 'Full-Time'}</p>
                    <p className="text-xs text-muted-foreground">
                      {operatingMode === 'soft_launch' ? 'Sun-Tue, close Wednesday' : 'Mon-Sat, close Sunday'}
                    </p>
                  </div>
                  {isOwner && (
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${operatingMode === 'soft_launch' ? 'font-medium' : 'text-muted-foreground'}`}>Soft</span>
                      <Switch
                        checked={operatingMode === 'full_time'}
                        onCheckedChange={(checked) => {
                          const newMode = checked ? 'full_time' : 'soft_launch';
                          setLocalOperatingMode(newMode);
                          updateSettingMutation.mutate({ key: 'operating_mode', value: newMode });
                        }}
                      />
                      <span className={`text-xs ${operatingMode === 'full_time' ? 'font-medium' : 'text-muted-foreground'}`}>Full</span>
                    </div>
                  )}
                </div>

                {isOwner && (
                  <div className="p-3 rounded-lg border">
                    <Label className="text-sm">Target Monthly Income</Label>
                    <div className="flex gap-2 mt-1">
                      <span className="text-muted-foreground self-center text-sm">$</span>
                      <Input
                        type="number"
                        value={targetIncomeInput !== null ? targetIncomeInput : (settings.target_monthly_income || '')}
                        onChange={(e) => setTargetIncomeInput(e.target.value)}
                        className="max-w-28 h-8"
                        placeholder="6000"
                        data-testid="input-target-income"
                      />
                      <span className="text-muted-foreground self-center text-sm">/mo</span>
                      <Button
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => {
                          const inputValue = targetIncomeInput !== null ? targetIncomeInput : (settings.target_monthly_income || '');
                          const value = inputValue.trim() === '' ? '0' : inputValue;
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue >= 0) {
                            updateSettingMutation.mutate({ key: 'target_monthly_income', value: numValue.toString() });
                            setTargetIncomeInput(null);
                          } else {
                            toast({ title: 'Invalid Amount', variant: 'destructive' });
                          }
                        }}
                        disabled={updateSettingMutation.isPending}
                        data-testid="button-update-income"
                      >
                        <Save className="w-3 h-3" />
                        Save
                      </Button>
                    </div>
                  </div>
                )}

                {isOwner && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Wrench className="w-3 h-3" />
                        Maintenance Tools
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-2 mb-1">
                            <RefreshCw className="w-3 h-3 text-blue-500" />
                            <span className="text-xs font-medium">Stripe Backfill</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mb-2">Import historical transactions</p>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => backfillMutation.mutate({ dryRun: true })} disabled={backfillMutation.isPending} data-testid="button-backfill-dryrun">
                              {backfillMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                              Dry Run
                            </Button>
                            <Button size="sm" className="h-7 text-xs" onClick={() => backfillMutation.mutate({ dryRun: false })} disabled={backfillMutation.isPending} data-testid="button-backfill-run">
                              {backfillMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                              Run
                            </Button>
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-2 mb-1">
                            <PiggyBank className="w-3 h-3 text-green-500" />
                            <span className="text-xs font-medium">Bucket Allocation</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mb-2">Process through 9-bucket waterfall</p>
                          <Button size="sm" className="h-7 text-xs" onClick={() => waterfallBackfillMutation.mutate()} disabled={waterfallBackfillMutation.isPending} data-testid="button-waterfall-backfill">
                            {waterfallBackfillMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            Allocate
                          </Button>
                        </div>
                        <div className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                            <span className="text-xs font-medium">Cancelled Reversals</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mb-2">Create reversals for cancelled orders</p>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => cancelledOrderReversalMutation.mutate()} disabled={cancelledOrderReversalMutation.isPending} data-testid="button-cancelled-reversals">
                            {cancelledOrderReversalMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            Process
                          </Button>
                        </div>
                      </div>

                      <Separator className="my-3" />

                      <div className="p-4 rounded-lg border-2 border-red-200 bg-red-50/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Database className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-semibold text-red-800">Clean Up Database</span>
                        </div>
                        <p className="text-xs text-red-700/80 mb-3">
                          Reset the app to a blank slate by removing all transactional data. Use this before publishing or after testing.
                        </p>

                        {!cleanupDialogOpen && !cleanupResult && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 text-xs gap-1"
                            onClick={() => { setCleanupDialogOpen(true); setCleanupConfirmText(''); setCleanupResult(null); }}
                            data-testid="button-cleanup-database"
                          >
                            <Trash2 className="w-3 h-3" />
                            Clean Up Database
                          </Button>
                        )}

                        {cleanupDialogOpen && !cleanupResult && (
                          <div className="space-y-3 mt-2">
                            <div className="rounded-lg border border-red-300 bg-white p-3">
                              <p className="text-xs font-semibold text-red-800 mb-2 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                This action cannot be undone!
                              </p>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                                <div>
                                  <p className="font-semibold text-red-700 mb-1">Will be DELETED:</p>
                                  <ul className="space-y-0.5 text-red-600/90">
                                    <li>All orders & order items</li>
                                    <li>All booking events</li>
                                    <li>All notifications</li>
                                    <li>All ledger entries</li>
                                    <li>All financial transactions</li>
                                    <li>All daily margin snapshots</li>
                                    <li>All closeout runs & flags</li>
                                    <li>All truck fuel transactions</li>
                                    <li>All pre-trip inspections</li>
                                    <li>All reward data & redemptions</li>
                                    <li>All promo redemptions</li>
                                    <li>All recurring schedules</li>
                                    <li>All service requests</li>
                                    <li>All push subscriptions</li>
                                    <li>All active sessions</li>
                                  </ul>
                                </div>
                                <div>
                                  <p className="font-semibold text-green-700 mb-1">Will be PRESERVED:</p>
                                  <ul className="space-y-0.5 text-green-600/90">
                                    <li>User accounts & profiles</li>
                                    <li>Vehicles & addresses</li>
                                    <li>Subscription tiers</li>
                                    <li>Fuel pricing & price history</li>
                                    <li>9-bucket allocation rules</li>
                                    <li>Business & finance settings</li>
                                    <li>Financial accounts (balances reset to $0)</li>
                                    <li>Trucks, drivers & parts</li>
                                    <li>Fuel inventory & shrinkage rules</li>
                                    <li>Booking day config</li>
                                    <li>Promo codes</li>
                                    <li>VIP waitlist</li>
                                  </ul>
                                </div>
                              </div>

                              <div className="mt-3 pt-3 border-t border-red-200">
                                <Label className="text-xs text-red-700">Type <span className="font-bold">CLEAN</span> to confirm:</Label>
                                <div className="flex gap-2 mt-1">
                                  <Input
                                    value={cleanupConfirmText}
                                    onChange={(e) => setCleanupConfirmText(e.target.value)}
                                    placeholder="Type CLEAN"
                                    className="h-8 text-xs max-w-32 border-red-300 focus:border-red-500"
                                    data-testid="input-cleanup-confirm"
                                  />
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-8 text-xs gap-1"
                                    disabled={cleanupConfirmText !== 'CLEAN' || cleanupDatabaseMutation.isPending}
                                    onClick={() => cleanupDatabaseMutation.mutate()}
                                    data-testid="button-cleanup-confirm"
                                  >
                                    {cleanupDatabaseMutation.isPending ? (
                                      <><Loader2 className="w-3 h-3 animate-spin" /> Cleaning...</>
                                    ) : (
                                      <><Trash2 className="w-3 h-3" /> Confirm Clean</>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs"
                                    onClick={() => { setCleanupDialogOpen(false); setCleanupConfirmText(''); }}
                                    data-testid="button-cleanup-cancel"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {cleanupResult && (
                          <div className="mt-2 rounded-lg border border-green-300 bg-green-50 p-3">
                            <p className="text-xs font-semibold text-green-800 flex items-center gap-1 mb-2">
                              <CheckCircle className="w-3 h-3" />
                              Cleanup Complete — {cleanupResult.totalDeleted} records removed
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-[10px] text-green-700">
                              {Object.entries(cleanupResult.details)
                                .filter(([, count]) => count > 0)
                                .map(([table, count]) => (
                                  <span key={table}>{table.replace(/_/g, ' ')}: {count}</span>
                                ))}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs mt-2"
                              onClick={() => { setCleanupResult(null); setCleanupDialogOpen(false); }}
                              data-testid="button-cleanup-dismiss"
                            >
                              Dismiss
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
          </TabsContent>

          {/* ========== LEDGER TAB ========== */}
          <TabsContent value="ledger" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-copper" />
                  Full Transaction Ledger
                  {viewMode === 'live' && <Badge variant="secondary" className="ml-2">Live MTD</Badge>}
                </CardTitle>
                <CardDescription>Complete Stripe-led source of truth for all transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Controls row - below description, above table */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="flex flex-wrap items-center gap-2">
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
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href="/owner/finance/ledger-report">
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
                            
                            {entryType === 'fuel_cost' ? (
                              <>
                                <div className="p-3 rounded-lg border-2 border-dashed border-copper/30 bg-copper/5">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full gap-2 border-copper text-copper hover:bg-copper/10"
                                    onClick={() => scanInputRef.current?.click()}
                                    disabled={isScanning}
                                    data-testid="button-scan-receipt-full"
                                  >
                                    {isScanning ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Scanning receipt...
                                      </>
                                    ) : (
                                      <>
                                        <Camera className="h-4 w-4" />
                                        Scan Receipt (AI)
                                      </>
                                    )}
                                  </Button>
                                  <p className="text-xs text-muted-foreground text-center mt-2">
                                    Take a photo or upload a receipt to auto-fill
                                  </p>
                                  {scanConfidence !== null && (
                                    <div className="mt-2 text-xs text-center">
                                      <span className={`font-medium ${scanConfidence >= 0.8 ? 'text-green-600' : scanConfidence >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
                                        Scan confidence: {Math.round(scanConfidence * 100)}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="space-y-2">
                                  <Label>Litres</Label>
                                  <Input 
                                    type="number" 
                                    step="0.01" 
                                    placeholder="e.g., 500"
                                    value={entryLitres}
                                    onChange={(e) => setEntryLitres(e.target.value)}
                                    required
                                    data-testid="input-entry-litres-full"
                                  />
                                </div>
                                
                                <div className="space-y-2">
                                  <Label>Total Cost ($)</Label>
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
                                
                                {costPerLitre && (
                                  <div className="p-3 bg-muted rounded-lg">
                                    <div className="flex justify-between items-center">
                                      <span className="text-sm text-muted-foreground">Cost per Litre</span>
                                      <span className="font-mono font-medium">${costPerLitre}/L</span>
                                    </div>
                                  </div>
                                )}
                                
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
                              </>
                            ) : (
                              <>
                                <div className="space-y-2">
                                  <Label>Description</Label>
                                  <Input 
                                    placeholder="e.g., Monthly subscription"
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
                              </>
                            )}
                            
                            {['fuel_cost', 'expense'].includes(entryType) && (
                              <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                  Receipt/Invoice <span className="text-red-500">*</span>
                                </Label>
                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  accept="image/*,.pdf"
                                  onChange={handleReceiptFileChange}
                                  className="hidden"
                                  data-testid="input-receipt-file"
                                />
                                {entryReceiptUrl ? (
                                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                                    <Image className="h-5 w-5 text-green-600" />
                                    <span className="flex-1 text-sm truncate">{entryReceiptName}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={handleRemoveReceipt}
                                      data-testid="button-remove-receipt"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full gap-2"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploadingReceipt}
                                    data-testid="button-upload-receipt"
                                  >
                                    {isUploadingReceipt ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Upload className="h-4 w-4" />
                                    )}
                                    {isUploadingReceipt ? 'Uploading...' : 'Upload Receipt'}
                                  </Button>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Required for fuel and expense entries
                                </p>
                              </div>
                            )}
                            
                            <Button type="submit" disabled={entrySubmitting || isUploadingReceipt} className="w-full" data-testid="button-submit-entry-full">
                              {entrySubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                              Add Entry
                            </Button>
                          </form>
                        </SheetContent>
                      </Sheet>
                    )}
                  </div>
                </div>
                
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
                        <th className="text-center p-3 w-16">Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerLoading ? (
                        <tr>
                          <td colSpan={8} className="text-center p-8">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                          </td>
                        </tr>
                      ) : !ledgerData?.entries?.length ? (
                        <tr>
                          <td colSpan={8} className="text-center p-8 text-muted-foreground">
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
                            <td className="p-3 text-center">
                              {entry.receiptUrl ? (
                                <a 
                                  href={entry.receiptUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center text-copper hover:text-copper/80"
                                  data-testid={`link-receipt-${entry.id}`}
                                >
                                  <Receipt className="h-4 w-4" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== ANALYTICS TAB ========== */}
          <TabsContent value="analytics" className="space-y-6">
            {analyticsLoading ? (
              <div className="min-h-[400px] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-copper" />
              </div>
            ) : (
              <>
                {(() => {
                  const weeklyOwnerDraw = analyticsWeekly.ownerDrawAvailable || 0;
                  const monthlyOwnerDraw = analyticsMonthly.ownerDrawAvailable || 0;
                  const dailyOwnerDraw = analyticsDaily.ownerDrawAvailable || 0;
                  const yearlyOwnerDraw = analyticsYearly.ownerDrawAvailable || 0;
                  const monthlyRevenue = analyticsMonthly.grossIncome || 0;
                  const monthlyProfit = analyticsMonthly.trueProfit || 0;
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
                    { name: 'Fuel Sales', value: fuelRevenue, color: '#f59e0b' },
                    { name: 'Subscriptions', value: subscriptionMRR, color: '#8b5cf6' },
                    { name: 'Delivery Fees', value: deliveryFeeRevenue, color: '#3b82f6' },
                  ].filter(d => d.value > 0);

                  const orderVolumeData = [
                    { name: 'Completed', value: completedOrders, color: '#4d7c5e' },
                    { name: 'Cancelled', value: cancelledOrders, color: '#ef4444' },
                  ];

                  const fuelTypeChartData = fuelTypeRevenue.map(f => ({
                    name: f.type.charAt(0).toUpperCase() + f.type.slice(1),
                    litres: f.litres,
                    revenue: f.revenue,
                    deliveries: f.deliveries,
                  }));

                  return (
                    <>
                      {/* ── 1. KPI BAR ── */}
                      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
                      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 mb-2 shadow-sm ${isProfitableWeekly ? 'border-sage/40 bg-sage/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
                        {isProfitableWeekly ? (
                          <TrendingUp className="w-5 h-5 text-sage shrink-0" />
                        ) : (
                          <TrendingUp className="w-5 h-5 text-amber-500 rotate-180 shrink-0" />
                        )}
                        <span className="font-display font-bold text-sm">
                          {isProfitableWeekly ? 'Profitable This Week' : 'Not Yet Profitable This Week'}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {analyticsWeekly.orders || 0} orders · {(analyticsWeekly.litres || 0).toFixed(0)}L delivered
                        </span>
                      </div>
                      </motion.div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="analytics-kpi-bar">
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }} className="p-3 rounded-xl bg-background border border-l-2 border-l-copper/30 text-center hover:shadow-md hover:border-copper/20 transition-all duration-200">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Daily Draw</p>
                          <p className={`font-display text-lg font-bold ${dailyOwnerDraw > 0 ? 'text-sage' : 'text-amber-600'}`} data-testid="kpi-daily-draw">
                            {formatAnalyticsCurrency(dailyOwnerDraw)}
                          </p>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="p-3 rounded-xl bg-background border border-l-2 border-l-copper/30 text-center hover:shadow-md hover:border-copper/20 transition-all duration-200">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Weekly Draw</p>
                          <p className={`font-display text-lg font-bold ${weeklyOwnerDraw > 0 ? 'text-sage' : 'text-amber-600'}`} data-testid="kpi-weekly-draw">
                            {formatAnalyticsCurrency(weeklyOwnerDraw)}
                          </p>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="p-3 rounded-xl bg-background border border-l-2 border-l-copper/30 text-center hover:shadow-md hover:border-copper/20 transition-all duration-200">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Monthly Draw</p>
                          <p className={`font-display text-lg font-bold ${monthlyOwnerDraw > 0 ? 'text-sage' : 'text-amber-600'}`} data-testid="kpi-monthly-draw">
                            {formatAnalyticsCurrency(monthlyOwnerDraw)}
                          </p>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }} className="p-3 rounded-xl bg-background border border-l-2 border-l-copper/30 text-center hover:shadow-md hover:border-copper/20 transition-all duration-200">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">YTD Draw</p>
                          <p className={`font-display text-lg font-bold ${yearlyOwnerDraw > 0 ? 'text-sage' : 'text-amber-600'}`} data-testid="kpi-ytd-draw">
                            {formatAnalyticsCurrency(yearlyOwnerDraw)}
                          </p>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="p-3 rounded-xl bg-background border text-center hover:shadow-md hover:border-copper/20 transition-all duration-200">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Revenue</p>
                          <p className="font-display text-lg font-bold" data-testid="kpi-revenue">{formatAnalyticsCurrency(monthlyRevenue)}</p>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="p-3 rounded-xl bg-background border text-center hover:shadow-md hover:border-copper/20 transition-all duration-200">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Gross Margin</p>
                          <p className={`font-display text-lg font-bold ${grossMarginPct >= 0 ? '' : 'text-destructive'}`} data-testid="kpi-gross-margin">{grossMarginPct.toFixed(1)}%</p>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="p-3 rounded-xl bg-background border text-center hover:shadow-md hover:border-copper/20 transition-all duration-200">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Customers</p>
                          <p className="font-display text-lg font-bold" data-testid="kpi-customers">{activeCustomers}</p>
                          <p className="text-[9px] text-muted-foreground">+{newCustomersThisMonth} new</p>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }} className="p-3 rounded-xl bg-background border text-center hover:shadow-md hover:border-copper/20 transition-all duration-200">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Net Margin</p>
                          <p className={`font-display text-lg font-bold ${netMarginPct >= 0 ? 'text-sage' : 'text-destructive'}`} data-testid="kpi-net-margin">{netMarginPct.toFixed(1)}%</p>
                        </motion.div>
                      </div>

                      {/* ── 2. GOALS & PROJECTIONS (compact side-by-side) ── */}
                      <div className="grid md:grid-cols-2 gap-4">
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                        <Card className="border border-copper/20">
                          <CardContent className="pt-5 pb-4 space-y-3">
                            <h4 className="font-display font-bold text-sm flex items-center gap-2">
                              <Target className="w-4 h-4 text-copper" />
                              Goal Progress
                            </h4>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs">6-Month: ${goalMonth6Weekly}/wk</span>
                                <span className="text-xs font-medium">{month6Progress.toFixed(0)}%</span>
                              </div>
                              <Progress value={month6Progress} className="h-2" />
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {month6Progress >= 100 ? 'Achieved!' : `${formatAnalyticsCurrency(goalMonth6Weekly - weeklyOwnerDraw)} more/wk needed`}
                              </p>
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs">12-Month: ${goalMonth12Weekly}/wk</span>
                                <span className="text-xs font-medium">{month12Progress.toFixed(0)}%</span>
                              </div>
                              <Progress value={month12Progress} className="h-2" />
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {month12Progress >= 100 ? 'Achieved!' : `${formatAnalyticsCurrency(goalMonth12Weekly - weeklyOwnerDraw)} more/wk needed`}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                        <Card className="border border-sage/20">
                          <CardContent className="pt-5 pb-4">
                            <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-3">
                              <BarChart3 className="w-4 h-4 text-copper" />
                              Projections
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-[10px] text-muted-foreground">Monthly Draw</p>
                                <p className={`font-display text-base font-bold ${projectedMonthlyFromWeek >= 0 ? 'text-sage' : 'text-destructive'}`}>
                                  {formatAnalyticsCurrency(projectedMonthlyFromWeek)}
                                </p>
                              </div>
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-[10px] text-muted-foreground">Yearly Draw</p>
                                <p className={`font-display text-base font-bold ${projectedYearlyFromMonth >= 0 ? 'text-sage' : 'text-destructive'}`}>
                                  {formatAnalyticsCurrency(projectedYearlyFromMonth)}
                                </p>
                              </div>
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-[10px] text-muted-foreground">Avg Order Value</p>
                                <p className="font-display text-base font-bold">{formatAnalyticsCurrency(avgOrderValue)}</p>
                              </div>
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-[10px] text-muted-foreground">Rev/Customer</p>
                                <p className="font-display text-base font-bold">{formatAnalyticsCurrency(avgRevenuePerCustomer)}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        </motion.div>
                      </div>

                      {/* ── 3. CHARTS SECTION (the star) ── */}
                      <div className="grid md:grid-cols-3 gap-4">
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="md:col-span-2">
                        <Card className="border shadow-sm" data-testid="chart-order-volume">
                          <CardContent className="pt-5 pb-4">
                            <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-4">
                              <Truck className="w-4 h-4 text-copper" />
                              Order Volume & Performance
                            </h4>
                            <div className="grid grid-cols-4 gap-3 mb-4">
                              <div className="text-center p-2 rounded-lg bg-muted/30">
                                <p className="font-display text-2xl font-bold" data-testid="stat-total-orders">{totalOrders}</p>
                                <p className="text-[10px] text-muted-foreground">Total YTD</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-sage/10">
                                <p className="font-display text-2xl font-bold text-sage" data-testid="stat-completed">{completedOrders}</p>
                                <p className="text-[10px] text-muted-foreground">Completed</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-red-500/10">
                                <p className="font-display text-2xl font-bold text-red-500" data-testid="stat-cancelled">{cancelledOrders}</p>
                                <p className="text-[10px] text-muted-foreground">Cancelled</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-copper/10">
                                <p className="font-display text-2xl font-bold text-copper" data-testid="stat-this-month">{analyticsOverview?.monthOrders || 0}</p>
                                <p className="text-[10px] text-muted-foreground">This Month</p>
                              </div>
                            </div>
                            <div className="h-52">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={orderVolumeData} layout="vertical" barSize={28}>
                                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" horizontal={false} />
                                  <XAxis type="number" tick={{ fontSize: 11 }} />
                                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} width={80} />
                                  <Tooltip formatter={(val: number) => [val, 'Orders']} />
                                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                                    {orderVolumeData.map((entry, i) => (
                                      <Cell key={i} fill={entry.color} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="grid grid-cols-3 gap-3 mt-3">
                              <div className="text-center p-2 rounded-lg bg-muted/30">
                                <p className="font-display text-base font-bold text-sage">{completionRate.toFixed(1)}%</p>
                                <p className="text-[10px] text-muted-foreground">Completion Rate</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-muted/30">
                                <p className="font-display text-base font-bold text-red-500">{cancellationRate.toFixed(1)}%</p>
                                <p className="text-[10px] text-muted-foreground">Cancellation Rate</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-muted/30">
                                <p className="font-display text-base font-bold">{avgLitresPerDelivery.toFixed(1)} L</p>
                                <p className="text-[10px] text-muted-foreground">Avg L/Delivery</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                        <Card className="border shadow-sm" data-testid="chart-revenue-sources">
                          <CardContent className="pt-5 pb-4">
                            <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-2">
                              <DollarSign className="w-4 h-4 text-copper" />
                              Revenue Sources
                            </h4>
                            <p className="text-[10px] text-muted-foreground mb-3">This month · {formatAnalyticsCurrency(monthlyRevenue)} total</p>
                            <div className="h-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={revenueDonutData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={45}
                                    outerRadius={70}
                                    paddingAngle={3}
                                    dataKey="value"
                                  >
                                    {revenueDonutData.map((entry, i) => (
                                      <Cell key={i} fill={entry.color} />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={(val: number) => [formatAnalyticsCurrency(val), '']} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="space-y-1.5 mt-2">
                              {revenueDonutData.map(d => (
                                <div key={d.name} className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                                    <span>{d.name}</span>
                                  </div>
                                  <span className="font-medium">{formatAnalyticsCurrency(d.value)}</span>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                        </motion.div>
                      </div>

                      {/* ── 4. DAILY FUEL COST TREND (prominent) ── */}
                      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                      <Card className="border-2 border-amber-500/20 bg-amber-500/5" data-testid="chart-fuel-cost-trend">
                        <CardContent className="pt-5 pb-4">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-display font-bold text-sm flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-amber-500" />
                              Daily Fuel Cost Trend
                            </h4>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Est. Cost: <span className="font-bold text-amber-600">${(routeEfficiency?.estimatedFuelCost || 0).toFixed(2)}</span></span>
                              <span>{(routeEfficiency?.estimatedFuelUse || 0).toFixed(1)}L @ ${(routeEfficiency?.dieselCostPerLitre || 1.45).toFixed(2)}/L</span>
                            </div>
                          </div>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={routeEfficiencyChart.slice(-30)}>
                                <defs>
                                  <linearGradient id="fuelCostGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                                <XAxis
                                  dataKey="date"
                                  tick={{ fontSize: 10 }}
                                  tickFormatter={(val) => format(new Date(val), 'MMM d')}
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
                                  strokeWidth={2}
                                  fill="url(#fuelCostGradient)"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                      </motion.div>

                      {/* ── 5. FUEL TYPE PERFORMANCE (bar chart) ── */}
                      <div className="grid md:grid-cols-2 gap-4">
                        <Card className="border" data-testid="chart-fuel-type">
                          <CardContent className="pt-5 pb-4">
                            <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-4">
                              <Fuel className="w-4 h-4 text-copper" />
                              Fuel Type Performance
                            </h4>
                            <div className="h-52">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={fuelTypeChartData} barSize={30}>
                                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(val) => `${val}L`} />
                                  <Tooltip formatter={(val: number, name: string) => [name === 'revenue' ? `$${val.toFixed(2)}` : `${val}L`, name === 'revenue' ? 'Revenue' : 'Litres']} />
                                  <Bar dataKey="litres" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Litres" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                            <table className="w-full text-xs mt-3">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-1.5">Type</th>
                                  <th className="text-center py-1.5">Deliveries</th>
                                  <th className="text-center py-1.5">Litres</th>
                                  <th className="text-right py-1.5">Revenue</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fuelTypeRevenue.map(f => (
                                  <tr key={f.type} className="border-b border-dashed">
                                    <td className="py-1.5 capitalize">{f.type}</td>
                                    <td className="text-center py-1.5">{f.deliveries}</td>
                                    <td className="text-center py-1.5">{f.litres} L</td>
                                    <td className="text-right py-1.5 font-medium">${f.revenue.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </CardContent>
                        </Card>

                        <Card className="border" data-testid="chart-subscription-tier">
                          <CardContent className="pt-5 pb-4">
                            <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-4">
                              <Users className="w-4 h-4 text-copper" />
                              Subscription Tiers
                            </h4>
                            <div className="h-52">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={tierBreakdown.map(t => ({ name: t.tier.split(' ')[0], subscribers: t.subscribers, mrr: t.mrr }))} barSize={30}>
                                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                  <YAxis tick={{ fontSize: 10 }} />
                                  <Tooltip formatter={(val: number, name: string) => [name === 'mrr' ? `$${val.toFixed(2)}` : val, name === 'mrr' ? 'MRR' : 'Subscribers']} />
                                  <Bar dataKey="subscribers" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Subscribers" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                            <table className="w-full text-xs mt-3">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-1.5">Tier</th>
                                  <th className="text-center py-1.5">Subs</th>
                                  <th className="text-right py-1.5">MRR</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tierBreakdown.map(t => (
                                  <tr key={t.tier} className="border-b border-dashed">
                                    <td className="py-1.5">{t.tier}</td>
                                    <td className="text-center py-1.5">{t.subscribers}</td>
                                    <td className="text-right py-1.5 font-medium">${t.mrr.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </CardContent>
                        </Card>
                      </div>

                      {/* ── 6. ROUTE EFFICIENCY (compact) ── */}
                      <Card className="border bg-blue-500/5 border-blue-500/20" data-testid="route-efficiency-analytics">
                        <CardContent className="pt-5 pb-4">
                          <h4 className="font-display font-bold text-sm flex items-center gap-2 mb-3">
                            <Navigation className="w-4 h-4 text-blue-500" />
                            Route Efficiency
                            <span className="text-[10px] text-muted-foreground font-normal ml-auto">Last 30 days</span>
                          </h4>
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                            <div className="p-2 rounded-lg bg-background border text-center">
                              <p className="font-display text-lg font-bold">{routeEfficiency?.totalRoutes || 0}</p>
                              <p className="text-[10px] text-muted-foreground">Routes</p>
                            </div>
                            <div className="p-2 rounded-lg bg-background border text-center">
                              <p className="font-display text-lg font-bold">{(routeEfficiency?.totalDistanceKm || 0).toFixed(1)} km</p>
                              <p className="text-[10px] text-muted-foreground">Total Dist.</p>
                            </div>
                            <div className="p-2 rounded-lg bg-background border text-center">
                              <p className="font-display text-lg font-bold">{(routeEfficiency?.avgRouteDistanceKm || 0).toFixed(1)} km</p>
                              <p className="text-[10px] text-muted-foreground">Avg Route</p>
                            </div>
                            <div className="p-2 rounded-lg bg-background border text-center">
                              <p className="font-display text-lg font-bold">{(routeEfficiency?.avgStopDistanceKm || 0).toFixed(1)} km</p>
                              <p className="text-[10px] text-muted-foreground">Avg Stop</p>
                            </div>
                            <div className="p-2 rounded-lg bg-background border text-center">
                              <p className="font-display text-lg font-bold">{(routeEfficiency?.avgFleetFuelEconomy || 15).toFixed(1)}</p>
                              <p className="text-[10px] text-muted-foreground">L/100km</p>
                            </div>
                            <div className="p-2 rounded-lg bg-background border text-center">
                              <p className="font-display text-lg font-bold">{(routeEfficiency?.estimatedFuelUse || 0).toFixed(1)} L</p>
                              <p className="text-[10px] text-muted-foreground">Est. Used</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* ── 7. CUSTOMER METRICS (compact) ── */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Card className="p-3 border">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Active Subscribers</p>
                          <p className="font-display text-xl font-bold" data-testid="stat-active-subs">{activeCustomers}</p>
                        </Card>
                        <Card className="p-3 border">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lifetime Value</p>
                          <p className="font-display text-xl font-bold" data-testid="stat-clv">${lifetimeValue.toFixed(2)}</p>
                          <p className="text-[9px] text-muted-foreground">Annual CLV</p>
                        </Card>
                        <Card className="p-3 border">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Retention Rate</p>
                          <p className="font-display text-xl font-bold text-sage" data-testid="stat-retention">100.0%</p>
                          <p className="text-[9px] text-muted-foreground">0% churn</p>
                        </Card>
                        <Card className="p-3 border">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Rev/Customer</p>
                          <p className="font-display text-xl font-bold" data-testid="stat-rev-customer">${avgRevenuePerCustomer.toFixed(2)}</p>
                          <p className="text-[9px] text-muted-foreground">Monthly avg</p>
                        </Card>
                      </div>

                      {/* ── 8. DELETED ORDERS (collapsible) ── */}
                      <details className="group">
                        <summary className="flex items-center gap-2 cursor-pointer py-2 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                          <Trash2 className="w-4 h-4 text-red-500" />
                          <span className="text-sm font-medium">Deleted Orders Archive</span>
                          <span className="text-xs text-muted-foreground ml-auto">{deletedOrders.totalDeleted} deleted · ${deletedOrders.lostRevenue.toFixed(2)} lost revenue</span>
                        </summary>
                        <Card className="mt-2 border">
                          <CardContent className="pt-4 pb-3">
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
                                    <tr key={m.month} className="border-b border-dashed">
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
                          </CardContent>
                        </Card>
                      </details>
                    </>
                  );
                })()}
              </>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }
  return <OpsLayout>{content}</OpsLayout>;
}
