import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";

interface Order {
  id: string;
  userId: string;
  address: string;
  city: string;
  scheduledDate: string;
  deliveryWindow: string;
  fuelType: string;
  fuelAmount: string;
  actualLitresDelivered: string | null;
  status: string;
  subtotal: string;
  deliveryFee: string;
  gstAmount: string;
  total: string;
}

interface CloseoutRun {
  id: string;
  mode: string;
  dateStart: string;
  dateEnd: string;
  dryRun: boolean;
  status: string;
  createdAt: string;
}

export default function OrdersReport() {
  const [, params] = useRoute("/ops/orders-report/:id");
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

  const { data: ordersData, isLoading } = useQuery<{ orders: Order[] }>({
    queryKey: ["/api/ops/orders"],
    queryFn: async () => {
      const res = await fetch(`/api/ops/orders`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
    enabled: !!run
  });

  const allOrders = ordersData?.orders || [];
  
  const completedOrders = allOrders.filter(o => {
    if (o.status !== 'completed') return false;
    if (!run) return false;
    const orderDate = new Date(o.scheduledDate);
    const startDate = new Date(run.dateStart);
    const endDate = new Date(run.dateEnd);
    return orderDate >= startDate && orderDate <= endDate;
  });

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(num);
  };

  const totalRevenue = completedOrders.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
  const totalLitres = completedOrders.reduce((sum, o) => sum + parseFloat(o.actualLitresDelivered || o.fuelAmount || '0'), 0);
  const totalGst = completedOrders.reduce((sum, o) => sum + parseFloat(o.gstAmount || '0'), 0);

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
        <Button onClick={handlePrint} data-testid="button-print-orders-report">
          <Printer className="w-4 h-4 mr-2" />
          Print Report
        </Button>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white text-black print:p-4 print:max-w-none" id="report-content">
        <div className="border-2 border-black p-6 print:p-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase tracking-wide">Prairie Mobile Fuel Services</h1>
            <p className="text-sm text-gray-600">Orders Report</p>
            <div className="border-t border-b border-gray-300 my-4 py-2">
              <p className="font-medium">
                Period: {run ? format(new Date(run.dateStart), 'MMM d, yyyy') : ''} - {run ? format(new Date(run.dateEnd), 'MMM d, yyyy') : ''}
              </p>
              <p className="text-sm text-gray-500">Generated: {format(new Date(), 'MMMM d, yyyy h:mm a')}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6 text-center">
            <div className="border border-gray-300 p-3">
              <p className="text-sm text-gray-600">Total Orders</p>
              <p className="text-xl font-bold">{completedOrders.length}</p>
            </div>
            <div className="border border-gray-300 p-3">
              <p className="text-sm text-gray-600">Total Litres</p>
              <p className="text-xl font-bold">{totalLitres.toFixed(1)} L</p>
            </div>
            <div className="border border-gray-300 p-3">
              <p className="text-sm text-gray-600">Total Revenue</p>
              <p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p>
            </div>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">Date</th>
                <th className="border border-gray-300 p-2 text-left">Order ID</th>
                <th className="border border-gray-300 p-2 text-left">Location</th>
                <th className="border border-gray-300 p-2 text-left">Fuel</th>
                <th className="border border-gray-300 p-2 text-right">Litres</th>
                <th className="border border-gray-300 p-2 text-right">Subtotal</th>
                <th className="border border-gray-300 p-2 text-right">GST</th>
                <th className="border border-gray-300 p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {completedOrders.map((order) => (
                <tr key={order.id}>
                  <td className="border border-gray-300 p-2">{format(new Date(order.scheduledDate), 'MMM d')}</td>
                  <td className="border border-gray-300 p-2 font-mono text-xs">{order.id.slice(0, 8)}</td>
                  <td className="border border-gray-300 p-2">{order.city}</td>
                  <td className="border border-gray-300 p-2 capitalize">{order.fuelType}</td>
                  <td className="border border-gray-300 p-2 text-right">{parseFloat(order.actualLitresDelivered || order.fuelAmount).toFixed(1)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(order.subtotal)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(order.gstAmount)}</td>
                  <td className="border border-gray-300 p-2 text-right font-medium">{formatCurrency(order.total)}</td>
                </tr>
              ))}
              {completedOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="border border-gray-300 p-4 text-center text-gray-500">
                    No completed orders in this period
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td colSpan={4} className="border border-gray-300 p-2">TOTALS</td>
                <td className="border border-gray-300 p-2 text-right">{totalLitres.toFixed(1)} L</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(totalRevenue - totalGst)}</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(totalGst)}</td>
                <td className="border border-gray-300 p-2 text-right">{formatCurrency(totalRevenue)}</td>
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
