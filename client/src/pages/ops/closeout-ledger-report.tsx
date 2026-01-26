import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";

interface CloseoutRun {
  id: string;
  mode: string;
  dateStart: string;
  dateEnd: string;
  dryRun: boolean;
  status: string;
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
  revenueSubscriptionCents: number;
  revenueFuelCents: number;
  revenueOtherCents: number;
}

export default function CloseoutLedgerReport() {
  const [, params] = useRoute("/ops/closeout-ledger-report/:id");
  const runId = params?.id;

  const { data: closeoutData } = useQuery<{ run: CloseoutRun | null }>({
    queryKey: ["/api/ops/closeout", runId],
    queryFn: async () => {
      const res = await fetch(`/api/ops/closeout/${runId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch closeout run");
      return res.json();
    },
    enabled: !!runId
  });

  const run = closeoutData?.run;

  const { data: ledgerData, isLoading } = useQuery<{ entries: LedgerEntry[], total: number }>({
    queryKey: ["/api/ops/bookkeeping/ledger", run?.dateStart, run?.dateEnd],
    queryFn: async () => {
      const startDate = format(new Date(run!.dateStart), 'yyyy-MM-dd');
      const endDate = format(new Date(run!.dateEnd), 'yyyy-MM-dd');
      const res = await fetch(`/api/ops/bookkeeping/ledger?startDate=${startDate}&endDate=${endDate}&limit=1000`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ledger");
      return res.json();
    },
    enabled: !!run?.dateStart && !!run?.dateEnd
  });

  const entries = ledgerData?.entries || [];

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(cents / 100);
  };

  const totalGross = entries.reduce((sum, e) => sum + e.grossAmountCents, 0);
  const totalGst = entries.reduce((sum, e) => sum + e.gstCollectedCents, 0);
  const totalFees = entries.reduce((sum, e) => sum + e.stripeFeeCents, 0);
  const totalNet = entries.reduce((sum, e) => sum + e.netAmountCents, 0);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-copper border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      <div className="print:hidden bg-background p-4 flex items-center gap-4 border-b">
        <Link href="/ops/closeout">
          <Button variant="ghost" size="sm" data-testid="button-back-closeout">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Closeout
          </Button>
        </Link>
        <Button onClick={handlePrint} data-testid="button-print-ledger-report">
          <Printer className="w-4 h-4 mr-2" />
          Print Report
        </Button>
      </div>

      <div className="max-w-5xl mx-auto p-8 bg-white text-black print:p-4 print:max-w-none" id="report-content">
        <div className="border-2 border-black p-6 print:p-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase tracking-wide">Prairie Mobile Fuel Services</h1>
            <p className="text-sm text-gray-600">Financial Ledger</p>
            <div className="border-t border-b border-gray-300 my-4 py-2">
              <p className="font-medium">
                Period: {run ? format(new Date(run.dateStart), 'MMM d, yyyy') : ''} - {run ? format(new Date(run.dateEnd), 'MMM d, yyyy') : ''}
              </p>
              <p className="text-sm text-gray-500">Generated: {format(new Date(), 'MMMM d, yyyy h:mm a')}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6 text-center">
            <div className="border border-gray-300 p-3">
              <p className="text-xs text-gray-600">Gross Revenue</p>
              <p className="text-lg font-bold">{formatCurrency(totalGross)}</p>
            </div>
            <div className="border border-gray-300 p-3">
              <p className="text-xs text-gray-600">GST Collected</p>
              <p className="text-lg font-bold">{formatCurrency(totalGst)}</p>
            </div>
            <div className="border border-gray-300 p-3">
              <p className="text-xs text-gray-600">Stripe Fees</p>
              <p className="text-lg font-bold text-red-600">-{formatCurrency(totalFees)}</p>
            </div>
            <div className="border border-gray-300 p-3">
              <p className="text-xs text-gray-600">Net Revenue</p>
              <p className="text-lg font-bold">{formatCurrency(totalNet)}</p>
            </div>
          </div>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">Date</th>
                <th className="border border-gray-300 p-2 text-left">Category</th>
                <th className="border border-gray-300 p-2 text-left">Description</th>
                <th className="border border-gray-300 p-2 text-right">Gross</th>
                <th className="border border-gray-300 p-2 text-right">GST</th>
                <th className="border border-gray-300 p-2 text-right">Fees</th>
                <th className="border border-gray-300 p-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="border border-gray-300 p-2">{format(new Date(entry.eventDate), 'MMM d')}</td>
                  <td className="border border-gray-300 p-2 capitalize">{entry.category.replace(/_/g, ' ')}</td>
                  <td className="border border-gray-300 p-2 truncate max-w-[200px]">{entry.description}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(entry.grossAmountCents)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(entry.gstCollectedCents)}</td>
                  <td className="border border-gray-300 p-2 text-right text-red-600">-{formatCurrency(entry.stripeFeeCents)}</td>
                  <td className="border border-gray-300 p-2 text-right font-medium">{formatCurrency(entry.netAmountCents)}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="border border-gray-300 p-4 text-center text-gray-500">
                    No ledger entries in this period
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td colSpan={3} className="border border-gray-300 p-2">TOTALS ({entries.length} entries)</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(totalGross)}</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(totalGst)}</td>
                <td className="border border-gray-300 p-2 text-right text-red-600">-{formatCurrency(totalFees)}</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(totalNet)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-8 text-center text-xs text-gray-500">
            <p>Prairie Mobile Fuel Services - Confidential Business Document</p>
            <p>prairiemobilefuel.ca | (403) 430-0390</p>
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
            size: landscape;
          }
        }
      `}</style>
    </>
  );
}
