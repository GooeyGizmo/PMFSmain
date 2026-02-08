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
  category: string;
  description: string;
  grossAmountCents: number;
  gstCollectedCents: number;
  gstNeedsReview: boolean;
}

export default function CloseoutGstReport() {
  const [, params] = useRoute("/owner/operations/closeout-gst-report/:id");
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

  const { data: entries = [], isLoading } = useQuery<LedgerEntry[]>({
    queryKey: ["/api/ops/bookkeeping/ledger/gst", run?.dateStart, run?.dateEnd],
    queryFn: async () => {
      const startDate = format(new Date(run!.dateStart), 'yyyy-MM-dd');
      const endDate = format(new Date(run!.dateEnd), 'yyyy-MM-dd');
      const res = await fetch(`/api/ops/bookkeeping/ledger?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ledger");
      const allEntries: LedgerEntry[] = await res.json();
      return allEntries.filter(e => e.gstCollectedCents > 0);
    },
    enabled: !!run?.dateStart && !!run?.dateEnd
  });

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(cents / 100);
  };

  const totalGstCollected = entries.reduce((sum, e) => sum + e.gstCollectedCents, 0);
  const entriesNeedingReview = entries.filter(e => e.gstNeedsReview).length;

  const gstByCategory = entries.reduce((acc, e) => {
    const cat = e.category || 'other';
    acc[cat] = (acc[cat] || 0) + e.gstCollectedCents;
    return acc;
  }, {} as Record<string, number>);

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
        <Link href="/owner/finance?tab=closeout">
          <Button variant="ghost" size="sm" data-testid="button-back-closeout">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Closeout
          </Button>
        </Link>
        <Button onClick={handlePrint} data-testid="button-print-gst-report">
          <Printer className="w-4 h-4 mr-2" />
          Print Report
        </Button>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white text-black print:p-4 print:max-w-none" id="report-content">
        <div className="border-2 border-black p-6 print:p-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase tracking-wide">Prairie Mobile Fuel Services</h1>
            <p className="text-sm text-gray-600">GST Summary Report</p>
            <p className="text-xs text-gray-500 mt-1">For Canada Revenue Agency Filing</p>
            <div className="border-t border-b border-gray-300 my-4 py-2">
              <p className="font-medium">
                Period: {run ? format(new Date(run.dateStart), 'MMM d, yyyy') : ''} - {run ? format(new Date(run.dateEnd), 'MMM d, yyyy') : ''}
              </p>
              <p className="text-sm text-gray-500">Generated: {format(new Date(), 'MMMM d, yyyy h:mm a')}</p>
            </div>
          </div>

          <div className="bg-gray-50 border-2 border-gray-400 p-6 mb-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Total GST Collected</p>
              <p className="text-4xl font-bold">{formatCurrency(totalGstCollected)}</p>
              <p className="text-sm text-gray-500 mt-2">{entries.length} transactions with GST</p>
              {entriesNeedingReview > 0 && (
                <p className="text-sm text-amber-600 mt-1">{entriesNeedingReview} entries need review</p>
              )}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-bold text-sm uppercase text-gray-600 mb-3">GST by Category</h3>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">Category</th>
                  <th className="border border-gray-300 p-2 text-right">GST Collected</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(gstByCategory).map(([category, amount]) => (
                  <tr key={category}>
                    <td className="border border-gray-300 p-2 capitalize">{category.replace(/_/g, ' ')}</td>
                    <td className="border border-gray-300 p-2 text-right font-medium">{formatCurrency(amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td className="border border-gray-300 p-2">TOTAL</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(totalGstCollected)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mb-6">
            <h3 className="font-bold text-sm uppercase text-gray-600 mb-3">Transaction Detail</h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">Date</th>
                  <th className="border border-gray-300 p-2 text-left">Category</th>
                  <th className="border border-gray-300 p-2 text-left">Description</th>
                  <th className="border border-gray-300 p-2 text-right">Gross</th>
                  <th className="border border-gray-300 p-2 text-right">GST (5%)</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className={entry.gstNeedsReview ? 'bg-amber-50' : ''}>
                    <td className="border border-gray-300 p-2">{format(new Date(entry.eventDate), 'MMM d')}</td>
                    <td className="border border-gray-300 p-2 capitalize">{entry.category.replace(/_/g, ' ')}</td>
                    <td className="border border-gray-300 p-2 truncate max-w-[200px]">{entry.description}</td>
                    <td className="border border-gray-300 p-2 text-right">{formatCurrency(entry.grossAmountCents)}</td>
                    <td className="border border-gray-300 p-2 text-right font-medium">{formatCurrency(entry.gstCollectedCents)}</td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border border-gray-300 p-4 text-center text-gray-500">
                      No GST transactions in this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t-2 border-black pt-4 mt-8">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">GST Registration Number:</p>
                <p className="font-mono font-bold">71223 8161 RT0001</p>
              </div>
              <div>
                <p className="text-gray-600">Prepared By:</p>
                <p className="font-mono font-bold">_____________________</p>
              </div>
            </div>
          </div>

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
            size: portrait;
          }
        }
      `}</style>
    </>
  );
}
