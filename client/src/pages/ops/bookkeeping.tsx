import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Download, Loader2, AlertTriangle, DollarSign, Receipt,
  FileSpreadsheet, PiggyBank, TrendingUp, RefreshCw, Calendar, Plus
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { TaxCoverageHealthWidget } from '@/components/TaxCoverageHealthWidget';
import { format } from 'date-fns';

interface LedgerEntry {
  id: string;
  eventDate: string;
  source: string;
  sourceType: string;
  sourceId: string | null;
  description: string;
  category: string;
  grossAmountCents: number;
  netAmountCents: number;
  stripeFeeCents: number;
  gstCollectedCents: number;
  gstPaidCents: number;
  gstNeedsReview: boolean;
  revenueSubscriptionCents: number;
  revenueFuelCents: number;
  revenueOtherCents: number;
  isReversal: boolean;
}

interface LedgerResponse {
  entries: LedgerEntry[];
  total: number;
  offset: number;
  limit: number;
}

interface RevenueReport {
  period: { year: number; month: number };
  totalRevenue: number;
  subscriptionRevenue: number;
  fuelRevenue: number;
  otherRevenue: number;
  gstCollected: number;
  stripeFees: number;
  refunds: number;
  payouts: number;
  netRevenue: number;
  entryCount: number;
}

interface GstReport {
  period: { year: number; month: number };
  gstCollected: number;
  gstPaid: number;
  netGstOwing: number;
  needsReviewCount: number;
}

interface CashFlowReport {
  period: { year: number; month: number };
  grossIncome: number;
  refunds: number;
  netIncome: number;
  stripeFees: number;
  cogsFuel: number;
  expensesOther: number;
  totalExpenses: number;
  cashFlow: number;
  payouts: number;
}

interface Diagnostics {
  unmappedCount: number;
  unmappedRevenue: LedgerEntry[];
  gstReviewCount: number;
  gstReviewItems: LedgerEntry[];
}

interface BucketBalances {
  balances: {
    operating_chequing: number;
    gst_holding: number;
    deferred_subscription: number;
    income_tax_reserve: number;
    operating_buffer: number;
    maintenance_reserve: number;
    emergency_risk: number;
    growth_capital: number;
    owner_draw_holding: number;
  };
}

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

const formatCurrency = (cents: number) => {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(dollars);
};

export default function OpsBookkeeping() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('ledger');
  
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [categoryFilter, setCategoryFilter] = useState('all');
  
  const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString();
  const endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59).toISOString();

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery<LedgerResponse>({
    queryKey: ['/api/ops/bookkeeping/ledger', { startDate, endDate, category: categoryFilter }],
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery<RevenueReport>({
    queryKey: ['/api/ops/bookkeeping/reports/revenue', { year: selectedYear, month: selectedMonth }],
  });

  const { data: gstData, isLoading: gstLoading } = useQuery<GstReport>({
    queryKey: ['/api/ops/bookkeeping/reports/gst', { year: selectedYear, month: selectedMonth }],
  });

  const { data: cashFlowData, isLoading: cashFlowLoading } = useQuery<CashFlowReport>({
    queryKey: ['/api/ops/bookkeeping/reports/cashflow', { year: selectedYear, month: selectedMonth }],
  });

  const { data: diagnosticsData, isLoading: diagnosticsLoading } = useQuery<Diagnostics>({
    queryKey: ['/api/ops/bookkeeping/diagnostics'],
  });

  const { data: bucketData, isLoading: bucketLoading } = useQuery<BucketBalances>({
    queryKey: ['/api/ops/waterfall/buckets'],
  });

  const backfillMutation = useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }) => {
      const res = await fetch('/api/ops/bookkeeping/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) throw new Error('Backfill failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping'] });
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
      });
      if (!res.ok) throw new Error('Waterfall backfill failed');
      return res.json();
    },
    onSuccess: (data) => {
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

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <OpsLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/ops/finances">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Bookkeeping</h1>
              <p className="text-muted-foreground">Stripe-led financial tracking and reporting</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
              <SelectTrigger className="w-32" data-testid="select-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-24" data-testid="select-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full max-w-lg">
            <TabsTrigger value="ledger" data-testid="tab-ledger">
              <Receipt className="h-4 w-4 mr-2" />
              Ledger
            </TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="manual" data-testid="tab-manual">
              <Plus className="h-4 w-4 mr-2" />
              Manual
            </TabsTrigger>
            <TabsTrigger value="diagnostics" data-testid="tab-diagnostics">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Diagnostics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-48" data-testid="select-category">
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
              
              <a 
                href={`/api/ops/bookkeeping/export/ledger?startDate=${startDate}&endDate=${endDate}`}
                download
              >
                <Button variant="outline" size="sm" data-testid="button-export-ledger">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </a>
            </div>

            <Card>
              <CardContent className="p-0">
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
                      ) : ledgerData?.entries?.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center p-8 text-muted-foreground">
                            No entries for this period
                          </td>
                        </tr>
                      ) : (
                        ledgerData?.entries?.map((entry) => (
                          <tr 
                            key={entry.id} 
                            className={`border-b hover:bg-muted/30 ${entry.isReversal ? 'text-red-600' : ''}`}
                            data-testid={`row-entry-${entry.id}`}
                          >
                            <td className="p-3">{format(new Date(entry.eventDate), 'MMM d')}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {entry.gstNeedsReview && (
                                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                                )}
                                {entry.description}
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

          <TabsContent value="reports" className="space-y-4">
            <TaxCoverageHealthWidget />
            
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Revenue Summary
                  </CardTitle>
                  <CardDescription>{months[selectedMonth - 1]} {selectedYear}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {revenueLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : revenueData ? (
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
                      <div className="border-t pt-2 flex justify-between font-semibold">
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
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PiggyBank className="h-5 w-5" />
                    GST Summary
                  </CardTitle>
                  <CardDescription>CRA-ready summary</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {gstLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : gstData ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">GST Collected</span>
                        <span className="font-mono">{formatCurrency(gstData.gstCollected)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">GST Paid (ITCs)</span>
                        <span className="font-mono">-{formatCurrency(gstData.gstPaid)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-semibold">
                        <span>Net GST Owing</span>
                        <span className="font-mono">{formatCurrency(gstData.netGstOwing)}</span>
                      </div>
                      {gstData.needsReviewCount > 0 && (
                        <div className="flex items-center gap-2 text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm">{gstData.needsReviewCount} items need review</span>
                        </div>
                      )}
                    </>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Cash Flow
                  </CardTitle>
                  <CardDescription>Monthly summary</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cashFlowLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : cashFlowData ? (
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
                      <div className="border-t pt-2 flex justify-between font-semibold">
                        <span>Net Cash Flow</span>
                        <span className={`font-mono ${cashFlowData.cashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(cashFlowData.cashFlow)}
                        </span>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className="flex gap-2">
              <a href={`/api/ops/bookkeeping/export/gst?year=${selectedYear}`} download>
                <Button variant="outline" data-testid="button-export-gst">
                  <Download className="h-4 w-4 mr-2" />
                  Export GST Year ({selectedYear})
                </Button>
              </a>
            </div>

            {/* 9-Bucket Waterfall Balances */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PiggyBank className="h-5 w-5" />
                  Financial Bucket Balances
                </CardTitle>
                <CardDescription>9-bucket waterfall allocation system for sole proprietor accounting</CardDescription>
              </CardHeader>
              <CardContent>
                {bucketLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                ) : bucketData?.balances ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {/* Non-spendable holding buckets */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Holding (Non-Spendable)</h4>
                      <div className="flex justify-between p-2 bg-amber-50 rounded border border-amber-200">
                        <span className="text-sm">GST Holding</span>
                        <span className="font-mono text-amber-700">{formatCurrency(bucketData.balances.gst_holding * 100)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-amber-50 rounded border border-amber-200">
                        <span className="text-sm">Deferred Subscription</span>
                        <span className="font-mono text-amber-700">{formatCurrency(bucketData.balances.deferred_subscription * 100)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-amber-50 rounded border border-amber-200">
                        <span className="text-sm">Income Tax Reserve</span>
                        <span className="font-mono text-amber-700">{formatCurrency(bucketData.balances.income_tax_reserve * 100)}</span>
                      </div>
                    </div>

                    {/* Reserve buckets */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Reserve Funds</h4>
                      <div className="flex justify-between p-2 bg-blue-50 rounded border border-blue-200">
                        <span className="text-sm">Operating Buffer</span>
                        <span className="font-mono text-blue-700">{formatCurrency(bucketData.balances.operating_buffer * 100)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-blue-50 rounded border border-blue-200">
                        <span className="text-sm">Maintenance Reserve</span>
                        <span className="font-mono text-blue-700">{formatCurrency(bucketData.balances.maintenance_reserve * 100)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-blue-50 rounded border border-blue-200">
                        <span className="text-sm">Emergency / Risk</span>
                        <span className="font-mono text-blue-700">{formatCurrency(bucketData.balances.emergency_risk * 100)}</span>
                      </div>
                    </div>

                    {/* Growth and owner buckets */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Growth & Owner</h4>
                      <div className="flex justify-between p-2 bg-green-50 rounded border border-green-200">
                        <span className="text-sm">Growth Capital</span>
                        <span className="font-mono text-green-700">{formatCurrency(bucketData.balances.growth_capital * 100)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-green-50 rounded border border-green-200">
                        <span className="text-sm">Owner Draw Holding</span>
                        <span className="font-mono text-green-700">{formatCurrency(bucketData.balances.owner_draw_holding * 100)}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-gray-50 rounded border border-gray-200 mt-4">
                        <span className="text-sm font-medium">Operating Chequing</span>
                        <span className="font-mono font-semibold">{formatCurrency(bucketData.balances.operating_chequing * 100)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No bucket data available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Add Manual Entry</CardTitle>
                <CardDescription>
                  Record fuel costs, expenses, and other manual adjustments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ManualEntryForm onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping'] });
                  toast({ title: 'Entry Created' });
                }} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="diagnostics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Unmapped Revenue
                  </CardTitle>
                  <CardDescription>
                    Stripe payments that couldn't be categorized
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {diagnosticsLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : diagnosticsData?.unmappedCount === 0 ? (
                    <p className="text-green-600">No unmapped revenue</p>
                  ) : (
                    <div className="space-y-2">
                      <Badge variant="destructive">{diagnosticsData?.unmappedCount} items</Badge>
                      <ul className="text-sm space-y-1 mt-2">
                        {diagnosticsData?.unmappedRevenue?.slice(0, 5).map((e) => (
                          <li key={e.id} className="text-muted-foreground">
                            {format(new Date(e.eventDate), 'MMM d')} - {e.description} ({formatCurrency(e.grossAmountCents)})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PiggyBank className="h-5 w-5 text-amber-500" />
                    GST Needs Review
                  </CardTitle>
                  <CardDescription>
                    Entries with estimated GST that need verification
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {diagnosticsLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : diagnosticsData?.gstReviewCount === 0 ? (
                    <p className="text-green-600">All GST verified</p>
                  ) : (
                    <div className="space-y-2">
                      <Badge variant="secondary">{diagnosticsData?.gstReviewCount} items</Badge>
                      <ul className="text-sm space-y-1 mt-2">
                        {diagnosticsData?.gstReviewItems?.slice(0, 5).map((e) => (
                          <li key={e.id} className="text-muted-foreground">
                            {format(new Date(e.eventDate), 'MMM d')} - {e.description} (GST: {formatCurrency(e.gstCollectedCents)})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Stripe Backfill
                  </CardTitle>
                  <CardDescription>
                    Import historical Stripe transactions into the ledger
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-4">
                  <Button 
                    onClick={() => backfillMutation.mutate({ dryRun: true })}
                    variant="outline"
                    disabled={backfillMutation.isPending}
                    data-testid="button-backfill-dryrun"
                  >
                    {backfillMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Dry Run
                  </Button>
                  <Button 
                    onClick={() => backfillMutation.mutate({ dryRun: false })}
                    disabled={backfillMutation.isPending}
                    data-testid="button-backfill-run"
                  >
                    {backfillMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Run Backfill
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PiggyBank className="h-5 w-5" />
                    Bucket Allocation
                  </CardTitle>
                  <CardDescription>
                    Process ledger entries through the 9-bucket waterfall
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => waterfallBackfillMutation.mutate()}
                    disabled={waterfallBackfillMutation.isPending}
                    data-testid="button-waterfall-backfill"
                  >
                    {waterfallBackfillMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Allocate to Buckets
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </OpsLayout>
  );
}

function ManualEntryForm({ onSuccess }: { onSuccess: () => void }) {
  const [sourceType, setSourceType] = useState('fuel_cost');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [gstPaid, setGstPaid] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const amountCents = Math.round(parseFloat(amount || '0') * 100);
      const gstCents = Math.round(parseFloat(gstPaid || '0') * 100);
      
      const res = await fetch('/api/ops/bookkeeping/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventDate: date,
          sourceType,
          description,
          category: sourceType === 'fuel_cost' ? 'fuel_cogs' : 'expense_other',
          grossAmountCents: sourceType === 'owner_draw' ? amountCents : 0,
          gstPaidCents: gstCents,
          cogsFuelCents: sourceType === 'fuel_cost' ? amountCents : 0,
          expenseOtherCents: sourceType === 'expense' ? amountCents : 0,
        }),
      });
      
      if (!res.ok) throw new Error('Failed to create entry');
      
      setDescription('');
      setAmount('');
      setGstPaid('');
      onSuccess();
    } catch (err) {
      toast({ title: 'Failed to create entry', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="type">Entry Type</Label>
        <Select value={sourceType} onValueChange={setSourceType}>
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
        <Label htmlFor="date">Date</Label>
        <Input 
          type="date" 
          value={date} 
          onChange={(e) => setDate(e.target.value)}
          data-testid="input-date"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input 
          placeholder="e.g., UFA Cardlock fuel purchase"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          data-testid="input-description"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="amount">Amount ($)</Label>
        <Input 
          type="number" 
          step="0.01" 
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          data-testid="input-amount"
        />
      </div>
      
      {sourceType === 'fuel_cost' && (
        <div className="space-y-2">
          <Label htmlFor="gst">GST Paid (ITC) ($)</Label>
          <Input 
            type="number" 
            step="0.01" 
            placeholder="0.00"
            value={gstPaid}
            onChange={(e) => setGstPaid(e.target.value)}
            data-testid="input-gst"
          />
        </div>
      )}
      
      <Button type="submit" disabled={isSubmitting} data-testid="button-submit-entry">
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Add Entry
      </Button>
    </form>
  );
}
