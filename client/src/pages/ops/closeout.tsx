import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { 
  ArrowLeft, Calendar, DollarSign, Loader2, CheckCircle, Clock, Download, 
  AlertTriangle, Fuel, FileSpreadsheet, RefreshCw, AlertCircle, Info, 
  PlayCircle, History, Droplets, CreditCard, TrendingUp, XCircle, Printer
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { format } from 'date-fns';
import { Link } from 'wouter';

interface CloseoutRun {
  id: string;
  mode: 'weekly' | 'nightly';
  dateStart: string;
  dateEnd: string;
  dryRun: boolean;
  status: 'created' | 'running' | 'completed' | 'failed';
  totalsJson: string | null;
  stripeReconciliationJson: string | null;
  fuelReconciliationJson: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface CloseoutFlag {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
  meta: string | null;
}

interface CloseoutTotals {
  ordersProcessed: number;
  ordersWithMissingSnapshot: number;
  litresByFuelType: Record<string, number>;
  fuelRevenueExGst: number;
  deliveryRevenueExGst: number;
  subscriptionRevenueExGst: number;
  gstCollected: number;
  fuelCogs: number;
  stripeFees: number;
  grossMargin: number;
  netIncomeEstimate: number;
  unstableTotals: boolean;
}

interface StripeReconciliation {
  stripeChargesTotal: number;
  stripeRefundsTotal: number;
  stripeFeesTotal: number;
  stripeNetTotal: number;
  ledgerRevenueTotal: number;
  ledgerGstTotal: number;
  ledgerRefundsTotal: number;
  ledgerFeesTotal: number;
  missingLedgerEntries: number;
  autoCreatedEntries: number;
  mismatchAmountCents: number;
  reconciled: boolean;
  toleranceCents: number;
}

interface FuelReconciliationSummary {
  periodsByTruck: Array<{
    truckId: string;
    truckName: string;
    fuelType: string;
    startingLitres: number;
    endingLitres: number;
    fills: number;
    dispensed: number;
    shrinkLitres: number;
    shrinkPercent: number;
    classification: 'within_expected' | 'outside_expected' | 'hard_alert';
  }>;
  totalShrinkByFuelType: Record<string, number>;
  hasAlerts: boolean;
}

export default function CloseoutPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dryRun, setDryRun] = useState(true);
  const [selectedRun, setSelectedRun] = useState<CloseoutRun | null>(null);

  const { data: weeklyDates } = useQuery({
    queryKey: ['/api/ops/closeout/dates/weekly'],
    queryFn: async () => {
      const res = await fetch('/api/ops/closeout/dates/weekly', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to get dates');
      return res.json() as Promise<{ dateStart: string; dateEnd: string }>;
    },
    enabled: user?.role === 'owner' || user?.role === 'admin',
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/ops/closeout/history'],
    queryFn: async () => {
      const res = await fetch('/api/ops/closeout/history?limit=10', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to get history');
      return res.json() as Promise<CloseoutRun[]>;
    },
    enabled: user?.role === 'owner' || user?.role === 'admin',
  });

  const { data: selectedDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['/api/ops/closeout', selectedRun?.id],
    queryFn: async () => {
      if (!selectedRun) return null;
      const res = await fetch(`/api/ops/closeout/${selectedRun.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to get details');
      return res.json() as Promise<{ run: CloseoutRun; flags: CloseoutFlag[] }>;
    },
    enabled: !!selectedRun,
  });
  
  const { data: dataIntegrity } = useQuery({
    queryKey: ['/api/ops/closeout/data-integrity', weeklyDates?.dateStart, weeklyDates?.dateEnd],
    queryFn: async () => {
      const params = weeklyDates 
        ? `?dateStart=${weeklyDates.dateStart}&dateEnd=${weeklyDates.dateEnd}`
        : '';
      const res = await fetch(`/api/ops/closeout/data-integrity${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to get data integrity');
      return res.json() as Promise<{
        totalCompletedOrders: number;
        missingRouteAssignment: Array<{ id: string; address: string }>;
        missingPricingSnapshot: Array<{ id: string; address: string }>;
        missingDeliveredAt: Array<{ id: string; address: string }>;
        missingDispenseTransaction: Array<{ id: string; address: string }>;
        summary: {
          missingRouteCount: number;
          missingSnapshotCount: number;
          missingDeliveredAtCount: number;
          missingDispenseCount: number;
        };
      }>;
    },
    enabled: user?.role === 'owner' || user?.role === 'admin',
  });

  const runCloseout = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ops/closeout/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: 'weekly', dryRun }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Closeout failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: dryRun ? 'Dry Run Complete' : 'Closeout Complete',
        description: `Processed with ${data.flags?.length || 0} flags`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/closeout/history'] });
      if (data.run) {
        setSelectedRun(data.run);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Closeout Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const backfillFromStripe = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ops/bookkeeping/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          startDate: weeklyDates?.dateStart,
          endDate: weeklyDates?.dateEnd,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Backfill failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const invoicesCreated = data.invoices?.processed || 0;
      const chargesCreated = data.charges?.processed || 0;
      const refundsCreated = data.refunds?.processed || 0;
      const totalCreated = invoicesCreated + chargesCreated + refundsCreated;
      const totalSkipped = (data.invoices?.skipped || 0) + (data.charges?.skipped || 0) + (data.refunds?.skipped || 0);
      
      toast({
        title: 'Backfill Complete',
        description: totalCreated > 0 
          ? `Created ${totalCreated} new entries (${totalSkipped} already existed)`
          : `All ${totalSkipped} entries already exist in ledger`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/closeout/history'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Backfill Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const exportCsv = async (kind: 'orders_csv' | 'ledger_csv' | 'gst_csv') => {
    if (!selectedRun) return;
    try {
      const res = await fetch(`/api/ops/closeout/${selectedRun.id}/export/${kind}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `closeout_${selectedRun.id}_${kind}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Could not download CSV',
        variant: 'destructive',
      });
    }
  };

  const parseTotals = (json: string | null): CloseoutTotals | null => {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const parseStripeRecon = (json: string | null): StripeReconciliation | null => {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const parseFuelRecon = (json: string | null): FuelReconciliationSummary | null => {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const totals = selectedDetails ? parseTotals(selectedDetails.run.totalsJson) : null;
  const stripeRecon = selectedDetails ? parseStripeRecon(selectedDetails.run.stripeReconciliationJson) : null;
  const fuelRecon = selectedDetails ? parseFuelRecon(selectedDetails.run.fuelReconciliationJson) : null;
  const flags = selectedDetails?.flags || [];

  const criticalFlags = flags.filter(f => f.severity === 'critical');
  const warningFlags = flags.filter(f => f.severity === 'warning');
  const infoFlags = flags.filter(f => f.severity === 'info');

  return (
    <OpsLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/ops/financials">
              <Button variant="ghost" size="icon" data-testid="btn-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Sunday Closeout</h1>
              <p className="text-muted-foreground">Weekly financial reconciliation and review</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1">
            <Calendar className="h-3 w-3" />
            {weeklyDates ? (
              <>
                {format(new Date(weeklyDates.dateStart), 'MMM d')} - {format(new Date(weeklyDates.dateEnd), 'MMM d, yyyy')}
              </>
            ) : (
              'Loading...'
            )}
          </Badge>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5" />
                Run Closeout
              </CardTitle>
              <CardDescription>
                Process the week's transactions and generate reports
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="dry-run" className="cursor-pointer">Dry Run (Preview Only)</Label>
                <Switch
                  id="dry-run"
                  checked={dryRun}
                  onCheckedChange={setDryRun}
                  data-testid="switch-dry-run"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {dryRun 
                  ? 'Preview mode - no changes will be saved to the database'
                  : 'Live mode - will update ledger entries and create records'}
              </p>
              <Button 
                className="w-full" 
                onClick={() => runCloseout.mutate()}
                disabled={runCloseout.isPending}
                data-testid="btn-run-closeout"
              >
                {runCloseout.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {dryRun ? 'Run Dry Closeout' : 'Run Weekly Closeout'}
                  </>
                )}
              </Button>
              <Separator className="my-4" />
              <div className="space-y-2">
                <p className="text-sm font-medium">Data Recovery</p>
                <p className="text-xs text-muted-foreground">
                  Import missing Stripe transactions into the ledger
                </p>
                <Button 
                  variant="outline"
                  className="w-full" 
                  onClick={() => backfillFromStripe.mutate()}
                  disabled={backfillFromStripe.isPending}
                  data-testid="btn-backfill-main"
                >
                  {backfillFromStripe.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Backfilling...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Backfill from Stripe
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Recent Closeouts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : history && history.length > 0 ? (
                <div className="space-y-2">
                  {history.slice(0, 5).map((run) => (
                    <div
                      key={run.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedRun?.id === run.id ? 'bg-primary/5 border-primary' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedRun(run)}
                      data-testid={`closeout-run-${run.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {run.status === 'completed' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : run.status === 'failed' ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-amber-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            {format(new Date(run.dateStart), 'MMM d')} - {format(new Date(run.dateEnd), 'MMM d')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {run.dryRun ? 'Dry Run' : 'Live'} | {run.mode}
                          </p>
                        </div>
                      </div>
                      <Badge variant={run.status === 'completed' ? 'default' : 'secondary'}>
                        {run.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No closeouts yet</p>
              )}
            </CardContent>
          </Card>
        </div>
        
        {dataIntegrity && (
          <Card className={
            dataIntegrity.summary.missingDispenseCount > 0 || dataIntegrity.summary.missingSnapshotCount > 0
              ? 'border-red-500'
              : dataIntegrity.summary.missingRouteCount > 0 || dataIntegrity.summary.missingDeliveredAtCount > 0
              ? 'border-amber-500'
              : ''
          }>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Data Integrity Check
              </CardTitle>
              <CardDescription>
                {dataIntegrity.totalCompletedOrders} completed orders in period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Missing Route/Truck</p>
                  <p className={`text-2xl font-bold ${dataIntegrity.summary.missingRouteCount > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                    {dataIntegrity.summary.missingRouteCount}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Missing Pricing Snapshot</p>
                  <p className={`text-2xl font-bold ${dataIntegrity.summary.missingSnapshotCount > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {dataIntegrity.summary.missingSnapshotCount}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Missing DeliveredAt</p>
                  <p className={`text-2xl font-bold ${dataIntegrity.summary.missingDeliveredAtCount > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                    {dataIntegrity.summary.missingDeliveredAtCount}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Missing Dispense Tx</p>
                  <p className={`text-2xl font-bold ${dataIntegrity.summary.missingDispenseCount > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {dataIntegrity.summary.missingDispenseCount}
                  </p>
                </div>
              </div>
              
              {(dataIntegrity.summary.missingDispenseCount > 0 || dataIntegrity.summary.missingSnapshotCount > 0) && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                    Critical: Some completed orders are missing required data for accurate COGS/reconciliation.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {selectedDetails && selectedRun && (
          <>
            <Separator />

            {flags.length > 0 && (
              <Card className={criticalFlags.length > 0 ? 'border-red-500' : warningFlags.length > 0 ? 'border-amber-500' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Flags & Alerts ({flags.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {criticalFlags.map((flag) => (
                      <div key={flag.id} className="flex items-start gap-3 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-700">{flag.code}</p>
                          <p className="text-sm text-red-600">{flag.message}</p>
                        </div>
                      </div>
                    ))}
                    {warningFlags.map((flag) => (
                      <div key={flag.id} className="flex items-start gap-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                        <div>
                          <p className="font-medium text-amber-700">{flag.code}</p>
                          <p className="text-sm text-amber-600">{flag.message}</p>
                        </div>
                      </div>
                    ))}
                    {infoFlags.map((flag) => (
                      <div key={flag.id} className="flex items-start gap-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                        <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div>
                          <p className="font-medium text-blue-700">{flag.code}</p>
                          <p className="text-sm text-blue-600">{flag.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {totals && (
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Orders Processed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totals.ordersProcessed}</div>
                    {totals.ordersWithMissingSnapshot > 0 && (
                      <p className="text-xs text-amber-500">{totals.ordersWithMissingSnapshot} missing snapshots</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Fuel Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${totals.fuelRevenueExGst.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">
                      R: {totals.litresByFuelType.regular?.toFixed(0) || 0}L | 
                      P: {totals.litresByFuelType.premium?.toFixed(0) || 0}L | 
                      D: {totals.litresByFuelType.diesel?.toFixed(0) || 0}L
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">GST Collected</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${totals.gstCollected.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">5% on all transactions</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Gross Margin</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">${totals.grossMargin.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">COGS: ${totals.fuelCogs.toFixed(2)}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              {stripeRecon && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Stripe Reconciliation
                      {stripeRecon.reconciled ? (
                        <Badge className="ml-auto bg-green-500">Reconciled</Badge>
                      ) : (
                        <Badge variant="destructive" className="ml-auto">Mismatch</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stripe Charges</span>
                      <span className="font-mono">${(stripeRecon.stripeChargesTotal / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stripe Refunds</span>
                      <span className="font-mono text-red-500">-${(stripeRecon.stripeRefundsTotal / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stripe Fees</span>
                      <span className="font-mono text-amber-500">-${(stripeRecon.stripeFeesTotal / 100).toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-medium">
                      <span>Stripe Net</span>
                      <span className="font-mono">${(stripeRecon.stripeNetTotal / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ledger Revenue</span>
                      <span className="font-mono">${(stripeRecon.ledgerRevenueTotal / 100).toFixed(2)}</span>
                    </div>
                    {stripeRecon.missingLedgerEntries > 0 && (
                      <div className="flex justify-between text-amber-500">
                        <span>Missing Entries</span>
                        <span>{stripeRecon.missingLedgerEntries} (auto-created: {stripeRecon.autoCreatedEntries})</span>
                      </div>
                    )}
                    {stripeRecon.missingLedgerEntries > 0 && stripeRecon.autoCreatedEntries === 0 && (
                      <div className="mt-4">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => backfillFromStripe.mutate()}
                          disabled={backfillFromStripe.isPending}
                          data-testid="btn-backfill-stripe"
                        >
                          {backfillFromStripe.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Backfilling...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Backfill Missing from Stripe
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {fuelRecon && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Droplets className="h-5 w-5" />
                      Fuel Shrinkage
                      {fuelRecon.hasAlerts ? (
                        <Badge variant="destructive" className="ml-auto">Alerts</Badge>
                      ) : (
                        <Badge className="ml-auto bg-green-500">Normal</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {fuelRecon.periodsByTruck.length > 0 ? (
                      <div className="space-y-2">
                        {fuelRecon.periodsByTruck.map((period, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-2 rounded-lg border ${
                              period.classification === 'hard_alert' 
                                ? 'bg-red-500/10 border-red-500/30' 
                                : period.classification === 'outside_expected'
                                ? 'bg-amber-500/10 border-amber-500/30'
                                : 'bg-green-500/10 border-green-500/30'
                            }`}
                          >
                            <div>
                              <p className="text-sm font-medium">{period.truckName} - {period.fuelType}</p>
                              <p className="text-xs text-muted-foreground">
                                Dispensed: {period.dispensed.toFixed(0)}L | Shrink: {period.shrinkLitres.toFixed(1)}L
                              </p>
                            </div>
                            <Badge variant={
                              period.classification === 'hard_alert' ? 'destructive' :
                              period.classification === 'outside_expected' ? 'secondary' : 'default'
                            }>
                              {period.shrinkPercent.toFixed(1)}%
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">No fuel transactions this period</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Export Reports
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  <div>
                    <Link href={`/ops/closeout-report/${selectedRun.id}`}>
                      <Button data-testid="btn-view-print-report">
                        <Printer className="mr-2 h-4 w-4" />
                        View Print Report
                      </Button>
                    </Link>
                    <p className="text-xs text-muted-foreground mt-1">
                      Opens a print-friendly page with full closeout summary
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-2 text-muted-foreground">Legacy CSV Downloads</p>
                    <div className="flex gap-3">
                      <Button variant="outline" size="sm" onClick={() => exportCsv('orders_csv')} data-testid="btn-export-orders">
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Orders CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportCsv('ledger_csv')} data-testid="btn-export-ledger">
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Ledger CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportCsv('gst_csv')} data-testid="btn-export-gst">
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        GST Report (CRA)
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </OpsLayout>
  );
}
