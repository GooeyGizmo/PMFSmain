import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface Order {
  id: string;
  userId: string;
  status: string;
  scheduledDate: string;
  deliveryWindow: string;
  address: string;
  city: string;
  fuelType: string;
  fuelAmount: string;
  actualLitresDelivered?: string;
  fillToFull?: boolean;
  subtotal?: string;
  deliveryFee?: string;
  gstAmount?: string;
  total?: string;
  createdAt: string;
}

export default function ReceiptPrint() {
  const [, params] = useRoute("/customer/receipts/:orderId/print");
  const orderId = params?.orderId;
  const { user } = useAuth();

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order");
      const data = await res.json();
      return data.order;
    },
    enabled: !!orderId
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-copper border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Receipt not found</p>
      </div>
    );
  }

  const subtotal = parseFloat(order.subtotal?.toString() || '0');
  const deliveryFee = parseFloat(order.deliveryFee?.toString() || '0');
  const gstAmount = parseFloat(order.gstAmount?.toString() || '0');
  const total = parseFloat(order.total?.toString() || '0');
  const actualLitres = parseFloat((order.actualLitresDelivered || order.fuelAmount)?.toString() || '0');

  return (
    <>
      <div className="print:hidden bg-background p-4 flex items-center gap-4 border-b">
        <Link href="/customer/receipts">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Receipts
          </Button>
        </Link>
        <Button onClick={handlePrint} data-testid="button-print-receipt">
          <Printer className="w-4 h-4 mr-2" />
          Print Receipt
        </Button>
      </div>

      <div className="max-w-md mx-auto p-8 bg-white text-black print:p-4" id="receipt-content">
        <div className="border border-gray-300 p-6 print:p-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold">PRAIRIE MOBILE FUEL</h1>
            <p className="text-sm text-gray-600">SERVICES</p>
            <div className="border-t border-b border-gray-300 my-4 py-2">
              <p className="font-bold">DELIVERY RECEIPT</p>
            </div>
          </div>

          <div className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Order #:</span>
              <span className="font-mono font-bold">{order.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Date:</span>
              <span>{format(new Date(order.scheduledDate), 'MMMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Time:</span>
              <span>{order.deliveryWindow}</span>
            </div>
          </div>

          <div className="border-t border-gray-300 my-4 pt-4">
            <p className="text-xs text-gray-500 uppercase font-bold mb-2">Delivery Address</p>
            <p>{order.address}</p>
            <p>{order.city}</p>
          </div>

          <div className="border-t border-gray-300 my-4 pt-4">
            <p className="text-xs text-gray-500 uppercase font-bold mb-2">Order Details</p>
            <div className="flex justify-between text-sm">
              <span>Fuel Type:</span>
              <span className="font-medium">{order.fuelType.charAt(0).toUpperCase() + order.fuelType.slice(1)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Amount:</span>
              <span className="font-medium">{actualLitres} Litres{order.fillToFull ? ' (Fill to Full)' : ''}</span>
            </div>
          </div>

          <div className="border-t-2 border-black my-4 pt-4">
            <p className="text-xs text-gray-500 uppercase font-bold mb-2">Payment Summary</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Fee:</span>
                <span>{deliveryFee === 0 ? 'FREE' : '$' + deliveryFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST (5%):</span>
                <span>${gstAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-black">
                <span>TOTAL:</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-300 my-4 pt-4 text-center text-sm text-gray-600">
            <p className="font-medium">Thank you for choosing</p>
            <p className="font-bold text-black">Prairie Mobile Fuel Services!</p>
            <div className="mt-4 text-xs">
              <p>Questions? Call (403) 430-0390</p>
              <p>prairiemobilefuel.ca</p>
            </div>
          </div>

          <div className="text-center text-xs text-gray-400 mt-6">
            <p>Generated: {format(new Date(), 'yyyy-MM-dd HH:mm')}</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #receipt-content, #receipt-content * {
            visibility: visible;
          }
          #receipt-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            margin: 0.5in;
            size: 80mm auto;
          }
        }
      `}</style>
    </>
  );
}
