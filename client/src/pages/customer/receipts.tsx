import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOrders } from '@/lib/api-hooks';
import { Receipt, Download, FileText, Printer } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';

export default function Receipts() {
  const { user } = useAuth();
  const { orders: allOrders, isLoading } = useOrders();
  const orders = allOrders.filter(o => o.status === 'completed');

  const downloadReceipt = (order: typeof orders[0]) => {
    const subtotal = parseFloat(order.subtotal?.toString() || '0');
    const deliveryFee = parseFloat(order.deliveryFee?.toString() || '0');
    const total = parseFloat(order.total?.toString() || '0');
    const actualLitres = parseFloat((order.actualLitresDelivered || order.fuelAmount)?.toString() || '0');
    
    const receipt = `
=====================================
    PRAIRIE MOBILE FUEL SERVICES
         DELIVERY RECEIPT
=====================================

Order #: ${order.id.slice(0, 8).toUpperCase()}
Date: ${format(new Date(order.scheduledDate), 'MMMM d, yyyy')}
Time: ${order.deliveryWindow}

-------------------------------------
DELIVERY ADDRESS
-------------------------------------
${order.address}
${order.city}

-------------------------------------
ORDER DETAILS
-------------------------------------
Fuel Type: ${order.fuelType.charAt(0).toUpperCase() + order.fuelType.slice(1)}
Amount: ${actualLitres} Litres${order.fillToFull ? ' (Fill to Full)' : ''}

-------------------------------------
PAYMENT SUMMARY
-------------------------------------
Subtotal:       $${subtotal.toFixed(2)}
Delivery Fee:   ${deliveryFee === 0 ? 'FREE' : '$' + deliveryFee.toFixed(2)}
GST (5%):       $${parseFloat(order.gstAmount?.toString() || '0').toFixed(2)}
-------------------------------------
TOTAL:          $${total.toFixed(2)}
-------------------------------------

Thank you for choosing
Prairie Mobile Fuel Services!

Questions? Call (403) 430-0390
or visit prairiemobilefuel.ca

=====================================
    `;

    const blob = new Blob([receipt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PMF-Receipt-${order.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Receipts</h1>
          <p className="text-muted-foreground mt-1">Download receipts for completed deliveries</p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-copper border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Loading receipts...</p>
            </CardContent>
          </Card>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Receipt className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-display text-lg font-semibold mb-2">No receipts yet</h3>
              <p className="text-muted-foreground">Completed orders will appear here with downloadable receipts</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {orders.map((order, i) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="border-border hover:border-copper/30 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                          <FileText className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {format(new Date(order.scheduledDate), 'MMMM d, yyyy')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {order.actualLitresDelivered || order.fuelAmount}L {order.fuelType} · ${parseFloat(order.total?.toString() || '0').toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/customer/receipts/${order.id}/print`}>
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`button-print-receipt-${order.id}`}
                          >
                            <Printer className="w-4 h-4 mr-2" />
                            Print
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadReceipt(order)}
                          data-testid={`button-download-receipt-${order.id}`}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          TXT
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
  );
}
