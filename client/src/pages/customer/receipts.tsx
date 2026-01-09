import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { generateMockOrders } from '@/lib/mockData';
import { Receipt, Download, FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function Receipts() {
  const { user } = useAuth();
  const orders = generateMockOrders(user?.id || '').filter(o => o.status === 'completed');

  const downloadReceipt = (order: typeof orders[0]) => {
    const receipt = `
=====================================
    PRAIRIE MOBILE FUEL SERVICES
         DELIVERY RECEIPT
=====================================

Order #: ${order.id.toUpperCase()}
Date: ${format(order.scheduledDate, 'MMMM d, yyyy')}
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
Amount: ${order.fuelAmount} Litres

-------------------------------------
PAYMENT SUMMARY
-------------------------------------
Subtotal:       $${order.subtotal.toFixed(2)}
Delivery Fee:   ${order.deliveryFee === 0 ? 'FREE' : '$' + order.deliveryFee.toFixed(2)}
${order.discount > 0 ? `Discount:       -$${order.discount.toFixed(2)}` : ''}
-------------------------------------
TOTAL:          $${order.total.toFixed(2)}
-------------------------------------

Driver: ${order.driverName || 'N/A'}

Thank you for choosing Prairie Mobile Fuel Services!
Questions? Call (403) 430-0390 or visit prairiemobilefuel.ca

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
    <CustomerLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Receipts</h1>
          <p className="text-muted-foreground mt-1">Download receipts for completed deliveries</p>
        </div>

        {orders.length === 0 ? (
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
                            {format(order.scheduledDate, 'MMMM d, yyyy')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {order.fuelAmount}L {order.fuelType} · ${order.total.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadReceipt(order)}
                        data-testid={`button-download-receipt-${order.id}`}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
