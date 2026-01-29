import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface GstSummary {
  year: number;
  month: number;
  gstCollected: number;
  gstPaid: number;
  netGstOwing: number;
  needsReviewCount: number;
}

export default function GstReport() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const { data: monthlyData = [], isLoading } = useQuery<GstSummary[]>({
    queryKey: ["/api/ops/bookkeeping/reports/gst", selectedYear],
    queryFn: async () => {
      const results: GstSummary[] = [];
      for (let month = 1; month <= 12; month++) {
        const res = await fetch(`/api/ops/bookkeeping/reports/gst?year=${selectedYear}&month=${month}`, {
          credentials: "include"
        });
        if (res.ok) {
          const data = await res.json();
          results.push({
            year: selectedYear,
            month,
            gstCollected: data.gstCollected || 0,
            gstPaid: data.gstPaid || 0,
            netGstOwing: data.netGstOwing || 0,
            needsReviewCount: data.needsReviewCount || 0
          });
        }
      }
      return results;
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

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const totals = monthlyData.reduce((acc, m) => ({
    collected: acc.collected + m.gstCollected,
    paid: acc.paid + m.gstPaid,
    owing: acc.owing + m.netGstOwing,
    needsReview: acc.needsReview + m.needsReviewCount
  }), { collected: 0, paid: 0, owing: 0, needsReview: 0 });

  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <>
      <div className="print:hidden bg-background p-4 flex items-center gap-4 border-b">
        <Link href="/owner/finance?tab=reports">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Reports
          </Button>
        </Link>
        <div className="flex-1 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label>Year:</Label>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handlePrint} data-testid="button-print-gst">
          <Printer className="w-4 h-4 mr-2" />
          Print Report
        </Button>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white text-black print:p-4" id="report-content">
        <div className="border-2 border-black p-6 print:p-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase tracking-wide">Prairie Mobile Fuel Services</h1>
            <h2 className="text-xl font-bold">GST Summary Report</h2>
            <p className="text-sm mt-2">
              Tax Year: {selectedYear}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Generated: {format(new Date(), "MMMM d, yyyy h:mm a")}
            </p>
            <div className="mt-3 text-xs text-gray-500 flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" />
              <span>CRA GST/HST Filing Reference</span>
            </div>
          </div>

          <div className="border-2 border-black mb-6">
            <div className="bg-black text-white p-2 font-bold uppercase text-center">
              Annual Summary
            </div>
            <div className="grid grid-cols-4 gap-4 p-4 text-center">
              <div>
                <p className="text-xs font-bold uppercase text-gray-600">GST Collected</p>
                <p className="text-xl font-mono font-bold">{formatCurrency(totals.collected)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-gray-600">GST Paid (ITCs)</p>
                <p className="text-xl font-mono">{formatCurrency(totals.paid)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-gray-600">Net GST Owing</p>
                <p className={`text-xl font-mono font-bold ${totals.owing > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(totals.owing)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-gray-600">Items for Review</p>
                <p className={`text-xl font-mono ${totals.needsReview > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {totals.needsReview}
                </p>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-copper border-t-transparent rounded-full mx-auto" />
            </div>
          ) : (
            <div className="border-2 border-black">
              <div className="bg-black text-white p-2 font-bold uppercase text-center">
                Monthly Breakdown
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-black bg-gray-100">
                    <th className="p-3 text-left">Month</th>
                    <th className="p-3 text-right">GST Collected</th>
                    <th className="p-3 text-right">GST Paid (ITCs)</th>
                    <th className="p-3 text-right">Net GST Owing</th>
                    <th className="p-3 text-center">Review Items</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((data) => (
                    <tr key={data.month} className="border-b border-gray-200">
                      <td className="p-3 font-medium">{monthNames[data.month - 1]}</td>
                      <td className="p-3 text-right font-mono">{formatCurrency(data.gstCollected)}</td>
                      <td className="p-3 text-right font-mono">{formatCurrency(data.gstPaid)}</td>
                      <td className={`p-3 text-right font-mono font-bold ${data.netGstOwing > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(data.netGstOwing)}
                      </td>
                      <td className="p-3 text-center">
                        {data.needsReviewCount > 0 ? (
                          <span className="text-yellow-600 font-bold">{data.needsReviewCount}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-bold border-t-2 border-black">
                    <td className="p-3">ANNUAL TOTAL</td>
                    <td className="p-3 text-right font-mono">{formatCurrency(totals.collected)}</td>
                    <td className="p-3 text-right font-mono">{formatCurrency(totals.paid)}</td>
                    <td className={`p-3 text-right font-mono ${totals.owing > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(totals.owing)}
                    </td>
                    <td className="p-3 text-center">{totals.needsReview}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="border-2 border-gray-400 p-4 mt-6 bg-gray-50">
            <h3 className="font-bold text-sm uppercase mb-2">Filing Notes</h3>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• GST Registration Number: [Your GST Number]</li>
              <li>• Business Number: [Your BN]</li>
              <li>• Filing Frequency: [Annual/Quarterly]</li>
              <li>• GST Rate Applied: 5% (Alberta - no PST)</li>
            </ul>
          </div>

          <div className="mt-6 text-center text-xs text-gray-500">
            <p>Prairie Mobile Fuel Services - GST Summary Report</p>
            <p>Tax Year: {selectedYear} | This report is for reference purposes only.</p>
            <p>Consult with a tax professional for official CRA filings.</p>
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
