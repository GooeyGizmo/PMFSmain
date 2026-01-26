import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, AlertTriangle, CheckCircle } from "lucide-react";
import type { CloseoutTotals, StripeReconciliation, FuelReconciliationSummary } from "@shared/schema";

interface CloseoutRun {
  id: string;
  mode: string;
  dateStart: string;
  dateEnd: string;
  dryRun: boolean;
  status: string;
  totalsJson: string | null;
  stripeReconciliationJson: string | null;
  fuelReconciliationJson: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface CloseoutFlag {
  id: string;
  closeoutRunId: string;
  severity: string;
  category: string;
  message: string;
  resolvedAt: string | null;
}

export default function CloseoutReport() {
  const [, params] = useRoute("/ops/closeout-report/:id");
  const runId = params?.id;

  const { data, isLoading } = useQuery<{ run: CloseoutRun | null; flags: CloseoutFlag[] }>({
    queryKey: ["/api/ops/closeout", runId],
    queryFn: async () => {
      const res = await fetch(`/api/ops/closeout/${runId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch closeout run");
      return res.json();
    },
    enabled: !!runId
  });

  const run = data?.run;
  const flags = data?.flags || [];

  const totals: CloseoutTotals | null = run?.totalsJson ? JSON.parse(run.totalsJson) : null;
  const stripeRecon: StripeReconciliation | null = run?.stripeReconciliationJson ? JSON.parse(run.stripeReconciliationJson) : null;
  const fuelRecon: FuelReconciliationSummary | null = run?.fuelReconciliationJson ? JSON.parse(run.fuelReconciliationJson) : null;

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(cents / 100);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-copper border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Closeout run not found</p>
      </div>
    );
  }

  const warningFlags = flags.filter(f => f.severity === 'warning' && !f.resolvedAt);
  const errorFlags = flags.filter(f => f.severity === 'error' && !f.resolvedAt);

  return (
    <>
      <div className="print:hidden bg-background p-4 flex items-center gap-4 border-b">
        <Link href="/ops/closeout">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Closeout
          </Button>
        </Link>
        <Button onClick={handlePrint} data-testid="button-print-report">
          <Printer className="w-4 h-4 mr-2" />
          Print Report
        </Button>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white text-black print:p-4" id="report-content">
        <div className="border-2 border-black p-6 print:p-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase tracking-wide">Prairie Mobile Fuel Services</h1>
            <h2 className="text-xl font-bold">Weekly Closeout Report</h2>
            <p className="text-sm mt-2">
              {format(new Date(run.dateStart), "MMMM d, yyyy")} - {format(new Date(run.dateEnd), "MMMM d, yyyy")}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Generated: {format(new Date(), "MMMM d, yyyy h:mm a")}
              {run.dryRun && <span className="ml-2 px-2 py-0.5 bg-yellow-200 text-yellow-800 rounded">DRY RUN</span>}
            </p>
          </div>

          {(errorFlags.length > 0 || warningFlags.length > 0) && (
            <div className="border-2 border-red-600 bg-red-50 p-4 mb-6">
              <h3 className="font-bold text-red-700 uppercase mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Flags & Alerts
              </h3>
              {errorFlags.map(flag => (
                <div key={flag.id} className="text-sm text-red-700 mb-1">
                  <strong>ERROR:</strong> {flag.message}
                </div>
              ))}
              {warningFlags.map(flag => (
                <div key={flag.id} className="text-sm text-yellow-700 mb-1">
                  <strong>WARNING:</strong> {flag.message}
                </div>
              ))}
            </div>
          )}

          <div className="border-2 border-black mb-6">
            <div className="bg-black text-white p-2 font-bold uppercase text-center">
              Order Summary
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-bold uppercase text-gray-600">Orders Processed</p>
                  <p className="text-2xl font-bold">{totals?.ordersProcessed || 0}</p>
                </div>
                <div>
                  <p className="text-sm font-bold uppercase text-gray-600">Missing Snapshots</p>
                  <p className="text-2xl font-bold">{totals?.ordersWithMissingSnapshot || 0}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-2 border-black mb-6">
            <div className="bg-black text-white p-2 font-bold uppercase text-center">
              Fuel Volume Summary
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="p-2 text-left border-r border-black">Fuel Type</th>
                  <th className="p-2 text-right">Litres Delivered</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(totals?.litresByFuelType || {}).map(([type, litres]) => (
                  <tr key={type} className="border-b border-black">
                    <td className="p-2 border-r border-black capitalize">{type}</td>
                    <td className="p-2 text-right font-mono">{(litres as number).toFixed(2)} L</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-bold">
                  <td className="p-2 border-r border-black">TOTAL</td>
                  <td className="p-2 text-right font-mono">
                    {Object.values(totals?.litresByFuelType || {}).reduce((sum, l) => sum + (l as number), 0).toFixed(2)} L
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-2 border-black mb-6">
            <div className="bg-black text-white p-2 font-bold uppercase text-center">
              Financial Summary
            </div>
            <table className="w-full">
              <tbody>
                <tr className="border-b border-black">
                  <td className="p-3 border-r border-black">Fuel Revenue (excl. GST)</td>
                  <td className="p-3 text-right font-mono">{formatCurrency(totals?.fuelRevenueExGst || 0)}</td>
                </tr>
                <tr className="border-b border-black">
                  <td className="p-3 border-r border-black">Delivery Revenue (excl. GST)</td>
                  <td className="p-3 text-right font-mono">{formatCurrency(totals?.deliveryRevenueExGst || 0)}</td>
                </tr>
                <tr className="border-b border-black">
                  <td className="p-3 border-r border-black">Subscription Revenue (excl. GST)</td>
                  <td className="p-3 text-right font-mono">{formatCurrency(totals?.subscriptionRevenueExGst || 0)}</td>
                </tr>
                <tr className="border-b border-black bg-gray-50">
                  <td className="p-3 border-r border-black font-bold">GST Collected</td>
                  <td className="p-3 text-right font-mono font-bold">{formatCurrency(totals?.gstCollected || 0)}</td>
                </tr>
                <tr className="border-b border-black">
                  <td className="p-3 border-r border-black">Fuel COGS</td>
                  <td className="p-3 text-right font-mono text-red-600">({formatCurrency(totals?.fuelCogs || 0)})</td>
                </tr>
                <tr className="border-b border-black">
                  <td className="p-3 border-r border-black">Stripe Fees</td>
                  <td className="p-3 text-right font-mono text-red-600">({formatCurrency(totals?.stripeFees || 0)})</td>
                </tr>
                <tr className="border-b border-black bg-green-50">
                  <td className="p-3 border-r border-black font-bold">Gross Margin</td>
                  <td className="p-3 text-right font-mono font-bold text-green-700">{formatCurrency(totals?.grossMargin || 0)}</td>
                </tr>
                <tr className="bg-blue-50">
                  <td className="p-3 border-r border-black font-bold">Net Income Estimate</td>
                  <td className="p-3 text-right font-mono font-bold text-blue-700">{formatCurrency(totals?.netIncomeEstimate || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {fuelRecon && fuelRecon.periodsByTruck && fuelRecon.periodsByTruck.length > 0 && (
            <div className="border-2 border-black mb-6">
              <div className="bg-black text-white p-2 font-bold uppercase text-center">
                Fuel Reconciliation (Shrinkage)
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black">
                    <th className="p-2 text-left">Truck</th>
                    <th className="p-2 text-left">Fuel</th>
                    <th className="p-2 text-right">Start</th>
                    <th className="p-2 text-right">Fill</th>
                    <th className="p-2 text-right">Dispense</th>
                    <th className="p-2 text-right">End</th>
                    <th className="p-2 text-right">Shrink</th>
                    <th className="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fuelRecon.periodsByTruck.map((period, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="p-2">{period.truckName}</td>
                      <td className="p-2 capitalize">{period.fuelType}</td>
                      <td className="p-2 text-right font-mono">{period.startingLitres?.toFixed(1) || '-'}</td>
                      <td className="p-2 text-right font-mono">{period.fills?.toFixed(1) || '-'}</td>
                      <td className="p-2 text-right font-mono">{period.dispensed?.toFixed(1) || '-'}</td>
                      <td className="p-2 text-right font-mono">{period.endingLitres?.toFixed(1) || '-'}</td>
                      <td className="p-2 text-right font-mono">
                        {period.shrinkLitres !== undefined ? `${period.shrinkLitres?.toFixed(1)}L (${period.shrinkPercent?.toFixed(1)}%)` : '-'}
                      </td>
                      <td className="p-2 text-center">
                        {period.classification === 'within_expected' && (
                          <span className="text-green-600 text-xs">OK</span>
                        )}
                        {period.classification === 'outside_expected' && (
                          <span className="text-yellow-600 text-xs">REVIEW</span>
                        )}
                        {period.classification === 'hard_alert' && (
                          <span className="text-red-600 text-xs font-bold">ALERT</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {stripeRecon && (
            <div className="border-2 border-black mb-6">
              <div className="bg-black text-white p-2 font-bold uppercase text-center">
                Stripe Reconciliation
              </div>
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm font-bold uppercase text-gray-600">Charges</p>
                    <p className="text-lg font-mono">{formatCurrency(stripeRecon.stripeChargesTotal || 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold uppercase text-gray-600">Refunds</p>
                    <p className="text-lg font-mono text-red-600">{formatCurrency(stripeRecon.stripeRefundsTotal || 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold uppercase text-gray-600">Fees</p>
                    <p className="text-lg font-mono text-amber-600">{formatCurrency(stripeRecon.stripeFeesTotal || 0)}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div className="p-2 bg-gray-50 rounded">
                    <p className="text-xs uppercase text-gray-500">Stripe Net</p>
                    <p className="font-mono">{formatCurrency(stripeRecon.stripeNetTotal || 0)}</p>
                  </div>
                  <div className="p-2 bg-gray-50 rounded">
                    <p className="text-xs uppercase text-gray-500">Ledger Revenue</p>
                    <p className="font-mono">{formatCurrency(stripeRecon.ledgerRevenueTotal || 0)}</p>
                  </div>
                </div>
                {stripeRecon.missingLedgerEntries > 0 && (
                  <div className="mt-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-center">
                    <p className="text-sm text-yellow-700">
                      {stripeRecon.missingLedgerEntries} Stripe transaction(s) missing from ledger
                      {stripeRecon.autoCreatedEntries > 0 && ` (${stripeRecon.autoCreatedEntries} auto-created)`}
                    </p>
                  </div>
                )}
                {stripeRecon.reconciled && (
                  <div className="mt-4 p-2 bg-green-50 border border-green-200 rounded text-center flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <p className="text-sm text-green-700">All Stripe transactions reconciled</p>
                  </div>
                )}
                {!stripeRecon.reconciled && (
                  <div className="mt-4 p-2 bg-red-50 border border-red-200 rounded text-center">
                    <p className="text-sm text-red-700">
                      Mismatch: {formatCurrency(stripeRecon.mismatchAmountCents)} (tolerance: {formatCurrency(stripeRecon.toleranceCents)})
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 text-center text-xs text-gray-500">
            <p>This report was generated from Closeout Run: {run.id}</p>
            <p>Status: {run.status.toUpperCase()} | Mode: {run.mode.toUpperCase()}</p>
            {run.completedAt && <p>Completed: {format(new Date(run.completedAt), "yyyy-MM-dd HH:mm:ss")}</p>}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #report-content, #report-content * {
            visibility: visible;
          }
          #report-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            margin: 0.5in;
            size: letter portrait;
          }
        }
      `}</style>
    </>
  );
}
