import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  gstPaidCents: number;
  revenueSubscriptionCents: number;
  revenueFuelCents: number;
  revenueOtherCents: number;
  cogsFuelCents: number;
  expenseOtherCents: number;
}

export default function LedgerReport() {
  const [period, setPeriod] = useState<'month' | 'custom'>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [customStart, setCustomStart] = useState(() => format(subMonths(new Date(), 1), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const getDateRange = () => {
    if (period === 'month') {
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = startOfMonth(new Date(year, month - 1));
      const end = endOfMonth(new Date(year, month - 1));
      return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') };
    }
    return { startDate: customStart, endDate: customEnd };
  };

  const { startDate, endDate } = getDateRange();

  const { data: entries = [], isLoading } = useQuery<LedgerEntry[]>({
    queryKey: ["/api/ops/bookkeeping/ledger", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/ops/bookkeeping/ledger?startDate=${startDate}&endDate=${endDate}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to fetch ledger");
      const data = await res.json();
      return data.entries || [];
    },
  });

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2
    }).format(cents / 100);
  };

  const totals = entries.reduce((acc, e) => ({
    gross: acc.gross + e.grossAmountCents,
    net: acc.net + e.netAmountCents,
    stripeFees: acc.stripeFees + e.stripeFeeCents,
    gstCollected: acc.gstCollected + e.gstCollectedCents,
    gstPaid: acc.gstPaid + e.gstPaidCents,
    revenueSub: acc.revenueSub + e.revenueSubscriptionCents,
    revenueFuel: acc.revenueFuel + e.revenueFuelCents,
    revenueOther: acc.revenueOther + e.revenueOtherCents,
    cogsFuel: acc.cogsFuel + e.cogsFuelCents,
    expenseOther: acc.expenseOther + e.expenseOtherCents,
  }), {
    gross: 0, net: 0, stripeFees: 0, gstCollected: 0, gstPaid: 0,
    revenueSub: 0, revenueFuel: 0, revenueOther: 0, cogsFuel: 0, expenseOther: 0
  });

  return (
    <>
      <div className="print:hidden bg-background p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-4 border-b">
        <Link href="/owner/finance?tab=reports">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
            Back to Reports
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Label className="text-xs sm:text-sm">Period:</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as 'month' | 'custom')}>
            <SelectTrigger className="w-28 sm:w-32 h-8 sm:h-10 text-xs sm:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === 'month' && (
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-36 sm:w-40 h-8 sm:h-10 text-xs sm:text-sm"
          />
        )}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-32 sm:w-40 h-8 sm:h-10 text-xs sm:text-sm"
            />
            <span className="text-xs">to</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-32 sm:w-40 h-8 sm:h-10 text-xs sm:text-sm"
            />
          </div>
        )}
        <Button onClick={handlePrint} size="sm" className="ml-auto" data-testid="button-print-ledger">
          <Printer className="w-4 h-4 mr-1 sm:mr-2" />
          Print Report
        </Button>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-8 bg-white text-black print:p-4 print:max-w-none" id="report-content">
        <div className="border-2 border-black p-3 sm:p-6 print:p-4">
          <div className="text-center mb-4 sm:mb-6">
            <h1 className="text-lg sm:text-2xl font-bold uppercase tracking-wide">Prairie Mobile Fuel Services</h1>
            <h2 className="text-base sm:text-xl font-bold">Financial Ledger Report</h2>
            <p className="text-sm mt-2 flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4" />
              {format(new Date(startDate), "MMMM d, yyyy")} - {format(new Date(endDate), "MMMM d, yyyy")}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Generated: {format(new Date(), "MMMM d, yyyy h:mm a")} | {entries.length} entries
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-copper border-t-transparent rounded-full mx-auto" />
            </div>
          ) : (
            <>
              <div className="border-2 border-black mb-4 sm:mb-6">
                <div className="bg-black text-white p-2 font-bold uppercase text-center text-sm sm:text-base">
                  Summary Totals
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 p-3 sm:p-4 text-sm">
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold uppercase text-gray-600">Gross Revenue</p>
                    <p className="text-sm sm:text-lg font-mono">{formatCurrency(totals.gross)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold uppercase text-gray-600">GST Collected</p>
                    <p className="text-sm sm:text-lg font-mono">{formatCurrency(totals.gstCollected)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold uppercase text-gray-600">Stripe Fees</p>
                    <p className="text-sm sm:text-lg font-mono text-red-600">({formatCurrency(totals.stripeFees)})</p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold uppercase text-gray-600">COGS (Fuel)</p>
                    <p className="text-sm sm:text-lg font-mono text-red-600">({formatCurrency(totals.cogsFuel)})</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-[10px] sm:text-xs font-bold uppercase text-gray-600">Net Revenue</p>
                    <p className="text-sm sm:text-lg font-mono font-bold">{formatCurrency(totals.net)}</p>
                  </div>
                </div>
                <div className="border-t border-black grid grid-cols-3 gap-2 sm:gap-4 p-3 sm:p-4 text-sm bg-gray-50">
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold uppercase text-gray-600">Subscriptions</p>
                    <p className="text-xs sm:text-base font-mono">{formatCurrency(totals.revenueSub)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold uppercase text-gray-600">Fuel Revenue</p>
                    <p className="text-xs sm:text-base font-mono">{formatCurrency(totals.revenueFuel)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold uppercase text-gray-600">Other Revenue</p>
                    <p className="text-xs sm:text-base font-mono">{formatCurrency(totals.revenueOther)}</p>
                  </div>
                </div>
              </div>

              <div className="border-2 border-black">
                <div className="bg-black text-white p-2 font-bold uppercase text-center text-sm sm:text-base">
                  Transaction Details
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] sm:text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b-2 border-black bg-gray-100">
                        <th className="p-1.5 sm:p-2 text-left whitespace-nowrap">Date</th>
                        <th className="p-1.5 sm:p-2 text-left">Description</th>
                        <th className="p-1.5 sm:p-2 text-left whitespace-nowrap">Type</th>
                        <th className="p-1.5 sm:p-2 text-right whitespace-nowrap">Gross</th>
                        <th className="p-1.5 sm:p-2 text-right whitespace-nowrap">GST</th>
                        <th className="p-1.5 sm:p-2 text-right whitespace-nowrap">Fees</th>
                        <th className="p-1.5 sm:p-2 text-right whitespace-nowrap">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id} className="border-b border-gray-200">
                          <td className="p-1.5 sm:p-2 font-mono whitespace-nowrap">{format(new Date(entry.eventDate), "MM/dd")}</td>
                          <td className="p-1.5 sm:p-2 max-w-[120px] sm:max-w-[200px] truncate" title={entry.description}>
                            {entry.description}
                          </td>
                          <td className="p-1.5 sm:p-2 whitespace-nowrap">{entry.sourceType}</td>
                          <td className="p-1.5 sm:p-2 text-right font-mono whitespace-nowrap">{formatCurrency(entry.grossAmountCents)}</td>
                          <td className="p-1.5 sm:p-2 text-right font-mono whitespace-nowrap">{formatCurrency(entry.gstCollectedCents)}</td>
                          <td className="p-1.5 sm:p-2 text-right font-mono text-red-600 whitespace-nowrap">
                            {entry.stripeFeeCents > 0 ? `(${formatCurrency(entry.stripeFeeCents)})` : '-'}
                          </td>
                          <td className="p-1.5 sm:p-2 text-right font-mono font-bold whitespace-nowrap">{formatCurrency(entry.netAmountCents)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-bold border-t-2 border-black">
                        <td className="p-1.5 sm:p-2" colSpan={3}>TOTALS</td>
                        <td className="p-1.5 sm:p-2 text-right font-mono whitespace-nowrap">{formatCurrency(totals.gross)}</td>
                        <td className="p-1.5 sm:p-2 text-right font-mono whitespace-nowrap">{formatCurrency(totals.gstCollected)}</td>
                        <td className="p-1.5 sm:p-2 text-right font-mono text-red-600 whitespace-nowrap">({formatCurrency(totals.stripeFees)})</td>
                        <td className="p-1.5 sm:p-2 text-right font-mono whitespace-nowrap">{formatCurrency(totals.net)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 text-center text-xs text-gray-500">
                <p>Prairie Mobile Fuel Services - Financial Ledger Report</p>
                <p>Period: {startDate} to {endDate} | Entries: {entries.length}</p>
              </div>
            </>
          )}
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
            size: letter landscape;
          }
          table {
            font-size: 9pt;
          }
        }
      `}</style>
    </>
  );
}
