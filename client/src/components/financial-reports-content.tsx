import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  DollarSign, TrendingUp, Calendar, Loader2, AlertTriangle, Banknote,
  CalendarCheck, FileSpreadsheet, CheckCircle, Printer, Receipt, Download,
  BarChart3
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { TaxCoverageHealthWidget } from '@/components/TaxCoverageHealthWidget';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

const formatCurrency = (cents: number) => {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(dollars);
};

const formatDollars = (amount: number) => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
};

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

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
        <Link href="/owner/finance?tab=closeout">
          <Button variant="outline" data-testid="btn-go-to-closeout-reports">
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
          <SelectTrigger className="w-[280px]" data-testid="select-closeout-period-reports">
            <SelectValue placeholder="Select a closeout period" />
          </SelectTrigger>
          <SelectContent>
            {runs.map(run => (
              <SelectItem key={run.id} value={run.id} data-testid={`select-period-reports-${run.id}`}>
                {format(new Date(run.dateStart), 'MMM d')} - {format(new Date(run.dateEnd), 'MMM d, yyyy')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedRun && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Link href={`/owner/operations/orders-report/${selectedRun.id}`}>
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2" data-testid="btn-print-orders-report-r">
              <Receipt className="h-6 w-6 text-copper" />
              <span className="font-medium">Orders Report</span>
              <span className="text-xs text-muted-foreground text-center">Completed deliveries</span>
            </Button>
          </Link>
          <Link href={`/owner/operations/closeout-ledger-report/${selectedRun.id}`}>
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2" data-testid="btn-print-ledger-report-r">
              <FileSpreadsheet className="h-6 w-6 text-copper" />
              <span className="font-medium">Financial Ledger</span>
              <span className="text-xs text-muted-foreground text-center">All transactions</span>
            </Button>
          </Link>
          <Link href={`/owner/operations/closeout-gst-report/${selectedRun.id}`}>
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2" data-testid="btn-print-gst-report-r">
              <Banknote className="h-6 w-6 text-copper" />
              <span className="font-medium">GST Summary</span>
              <span className="text-xs text-muted-foreground text-center">CRA-ready report</span>
            </Button>
          </Link>
          <Link href={`/owner/operations/closeout-report/${selectedRun.id}`}>
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2" data-testid="btn-print-closeout-report-r">
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

export default function FinancialReportsContent() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const { data: weekSummaryData } = useQuery<any>({
    queryKey: ['/api/ops/finances/current-week-summary'],
  });

  const { data: closesData } = useQuery<{ closes: any[] }>({
    queryKey: ['/api/ops/finances/weekly-closes'],
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

  const weekSummary = weekSummaryData;
  const closes = closesData?.closes || [];

  const revenueBreakdown = useMemo(() => {
    if (!revenueData) return [];
    return [
      { name: 'Subscriptions', value: revenueData.subscriptionRevenue / 100, color: CHART_COLORS[0] },
      { name: 'Fuel Delivery', value: revenueData.fuelRevenue / 100, color: CHART_COLORS[1] },
      { name: 'Other', value: revenueData.otherRevenue / 100, color: CHART_COLORS[2] },
    ].filter(item => item.value > 0);
  }, [revenueData]);

  return (
    <div className="space-y-6">
      <TaxCoverageHealthWidget />

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
                {closes.slice(0, 3).map((close: any) => (
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

      <div className="flex items-center gap-3">
        <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
          <SelectTrigger className="w-[140px]" data-testid="select-report-month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m, i) => (
              <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
          <SelectTrigger className="w-[100px]" data-testid="select-report-year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => (
              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
        <Link href="/owner/finance/gst-report">
          <Button variant="outline" data-testid="button-print-gst-report-r">
            <Printer className="h-4 w-4 mr-2" />
            Print GST Report
          </Button>
        </Link>
        <a href={`/api/ops/bookkeeping/export/gst?year=${selectedYear}&month=${selectedMonth}`} download>
          <Button variant="ghost" data-testid="button-export-gst-report-r">
            <Download className="h-4 w-4 mr-2" />
            CSV ({months[selectedMonth - 1]} {selectedYear})
          </Button>
        </a>
      </div>

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
    </div>
  );
}
