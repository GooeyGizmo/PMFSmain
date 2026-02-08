import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useOrders, ACTIVE_ORDER_STATUSES } from '@/lib/api-hooks';
import { useWebSocket } from '@/hooks/use-websocket';
import type { Order, OrderItem } from '@shared/schema';
import { Truck, Clock, MapPin, Calendar, ChevronRight, X, CheckCircle, AlertCircle, Navigation, RefreshCw, Radio, Car, AlertTriangle, Receipt, FileText, Printer, Loader2, CreditCard, ShieldCheck, CalendarClock, Ban } from 'lucide-react';
import { useLocation } from 'wouter';
import { format, formatDistanceToNow } from 'date-fns';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

interface ReceiptOrder {
  id: string;
  orderNumber?: string;
  scheduledDate: string;
  address: string;
  city: string;
  total: string;
  fuelAmount: string;
  fuelType: string;
}

function ReceiptsContent() {
  const { data: ordersData, isLoading } = useQuery<{ orders: ReceiptOrder[] }>({
    queryKey: ['/api/orders'],
    select: (data: any) => ({
      orders: (data.orders || []).filter((o: any) => o.status === 'completed')
    })
  });
  const receipts = ordersData?.orders || [];

  const handleViewReceipt = (orderId: string) => {
    window.open(`/receipt/${orderId}`, '_blank');
  };

  const handlePrintReceipt = (orderId: string) => {
    window.open(`/receipt/${orderId}?print=true`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Receipt className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-display text-lg font-semibold mb-2">No receipts yet</h3>
          <p className="text-muted-foreground">Your delivery receipts will appear here after completed orders</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mb-4">
        <h3 className="font-semibold text-foreground">Your Receipts</h3>
        <p className="text-sm text-muted-foreground">View, download, or print receipts from your completed fuel deliveries</p>
      </div>

      {receipts.map((receipt, i) => (
        <motion.div
          key={receipt.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
        >
          <Card className="border-border hover:border-copper/30 transition-colors">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-copper/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-copper" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Order #{receipt.orderNumber || receipt.id.slice(0, 8)}</span>
                      <Badge variant="outline" className="text-xs capitalize">{receipt.fuelType}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(receipt.scheduledDate).toLocaleDateString('en-CA', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">{receipt.address}, {receipt.city}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <p className="font-semibold">${parseFloat(receipt.total).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{parseFloat(receipt.fuelAmount).toFixed(0)}L</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleViewReceipt(receipt.id)}
                    title="View Receipt"
                    data-testid={`view-receipt-${receipt.id}`}
                  >
                    <FileText className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePrintReceipt(receipt.id)}
                    title="Print Receipt"
                    data-testid={`print-receipt-${receipt.id}`}
                  >
                    <Printer className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

// Extended order type with order items and vehicle details
interface OrderItemWithVehicle extends OrderItem {
  vehicle: {
    id: string;
    year: string;
    make: string;
    model: string;
    licensePlate: string;
  } | null;
}

interface OrderWithItems extends Order {
  orderItems?: OrderItemWithVehicle[];
}

interface DeliveriesProps {
  embedded?: boolean;
}

interface CardPaymentFormProps {
  clientSecret: string;
  orderId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function CardPaymentForm({ clientSecret, orderId, onSuccess, onCancel }: CardPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setErrorMessage('Card input not found. Please refresh and try again.');
      setIsProcessing(false);
      return;
    }

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
      },
      setup_future_usage: 'off_session',
      return_url: window.location.href,
    });

    if (error) {
      setErrorMessage(error.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
    } else if (paymentIntent?.status === 'requires_capture' || paymentIntent?.status === 'succeeded') {
      toast({
        title: 'Card Saved & Payment Confirmed',
        description: 'Your card has been saved as your default payment method.',
      });
      const retryRes = await fetch(`/api/orders/${orderId}/retry-preauth`, {
        method: 'POST',
        credentials: 'include',
      });
      const retryData = await retryRes.json();
      if (retryData.success) {
        onSuccess();
      } else {
        setErrorMessage(retryData.message || 'Payment confirmed but order update failed.');
        setIsProcessing(false);
      }
    } else if (paymentIntent?.status === 'requires_action') {
      const { error: actionError } = await stripe.handleCardAction(clientSecret);
      if (actionError) {
        setErrorMessage(actionError.message || 'Verification failed.');
        setIsProcessing(false);
      } else {
        const retryRes = await fetch(`/api/orders/${orderId}/retry-preauth`, {
          method: 'POST',
          credentials: 'include',
        });
        const retryData = await retryRes.json();
        if (retryData.success) {
          onSuccess();
        } else {
          setErrorMessage(retryData.message || 'Verification completed but order update failed.');
          setIsProcessing(false);
        }
      }
    } else {
      setErrorMessage(`Unexpected payment status: ${paymentIntent?.status}`);
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg bg-background">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#333',
                '::placeholder': { color: '#aab7c4' },
              },
              invalid: { color: '#dc2626' },
            },
          }}
        />
      </div>
      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || isProcessing} className="flex-1 bg-copper hover:bg-copper/90">
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
          {isProcessing ? 'Processing...' : 'Save Card & Pay'}
        </Button>
      </div>
    </form>
  );
}

export default function Deliveries({ embedded = false }: DeliveriesProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isConnected } = useWebSocket();
  const [, navigate] = useLocation();
  
  // WebSocket handles real-time order updates via query invalidation
  // Also poll every 30 seconds as fallback for missed WebSocket updates
  const { orders, isLoading, dataUpdatedAt, refetch } = useOrders({ refetchInterval: 30000 });
  
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<OrderWithItems | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);
  const [retryingPayment, setRetryingPayment] = useState<string | null>(null);
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  const [handling3DS, setHandling3DS] = useState(false);

  // Load Stripe on mount
  useEffect(() => {
    const initStripe = async () => {
      try {
        const res = await fetch('/api/stripe/publishable-key');
        if (res.ok) {
          const { publishableKey } = await res.json();
          if (publishableKey) {
            const stripe = await loadStripe(publishableKey);
            setStripeInstance(stripe);
          }
        }
      } catch (error) {
        console.error('Failed to load Stripe:', error);
      }
    };
    initStripe();
  }, []);

  // Handler to retry pre-authorization for pending orders (with 3DS support)
  const handleRetryPreauth = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingPayment(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/retry-preauth`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      
      if (data.success) {
        toast({
          title: 'Payment Confirmed',
          description: data.message || 'Your payment has been pre-authorized successfully.',
        });
        refetch();
      } else if (data.status === 'requires_action' && data.clientSecret) {
        if (!stripeInstance) {
          // Stripe not loaded - show error with guidance
          toast({
            title: 'Verification Required',
            description: 'Please refresh the page and try again to complete card verification.',
            variant: 'destructive',
          });
          return;
        }
        // Handle 3DS authentication
        setHandling3DS(true);
        toast({
          title: 'Additional Verification Required',
          description: 'Please complete the card verification.',
        });
        
        const { error, paymentIntent } = await stripeInstance.handleCardAction(data.clientSecret);
        
        if (error) {
          toast({
            title: 'Verification Failed',
            description: error.message || 'Card verification failed. Please try again.',
            variant: 'destructive',
          });
        } else if (paymentIntent) {
          // 3DS completed, retry the preauth to finalize
          const retryRes = await fetch(`/api/orders/${orderId}/retry-preauth`, {
            method: 'POST',
            credentials: 'include',
          });
          const retryData = await retryRes.json();
          
          if (retryData.success) {
            toast({
              title: 'Payment Confirmed',
              description: 'Your payment has been verified and pre-authorized.',
            });
            refetch();
          } else {
            toast({
              title: 'Payment Issue',
              description: retryData.message || 'Could not complete the pre-authorization after verification.',
              variant: 'destructive',
            });
          }
        }
        setHandling3DS(false);
      } else if (data.status === 'needs_payment_method' && data.clientSecret) {
        // No payment method on file - open card collection dialog
        setPaymentClientSecret(data.clientSecret);
        setPaymentOrderId(orderId);
        setPaymentDialogOpen(true);
      } else if (data.status === 'requires_payment' || data.status === 'requires_payment_method') {
        // Payment method required but no client secret - redirect to account page
        toast({
          title: 'Payment Method Required',
          description: 'Please update your payment method and try again.',
          variant: 'destructive',
        });
        navigate('/app/account?tab=payment');
      } else {
        toast({
          title: 'Payment Issue',
          description: data.message || 'Could not complete the pre-authorization.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to retry payment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRetryingPayment(null);
    }
  };

  // Cast orders to include orderItems
  const ordersWithItems = orders as OrderWithItems[];
  const upcomingOrders = ordersWithItems.filter(o => ACTIVE_ORDER_STATUSES.includes(o.status));
  const completedOrders = ordersWithItems.filter(o => o.status === 'completed');
  const cancelledOrders = ordersWithItems.filter(o => o.status === 'cancelled');

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'scheduled': return { color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Calendar, label: 'Scheduled' };
      case 'confirmed': return { color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: CheckCircle, label: 'Confirmed' };
      case 'en_route': return { color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Navigation, label: 'En Route' };
      case 'arriving': return { color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Truck, label: 'Arriving' };
      case 'fueling': return { color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Truck, label: 'Fueling' };
      case 'completed': return { color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: CheckCircle, label: 'Completed' };
      case 'cancelled': return { color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: X, label: 'Cancelled' };
      default: return { color: 'bg-muted text-muted-foreground', icon: AlertCircle, label: status };
    }
  };

  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancelOrder = async () => {
    if (!orderToCancel) return;
    
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/orders/${orderToCancel.id}/customer-cancel`, {
        method: 'POST',
        credentials: 'include',
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        toast({ 
          title: 'Cannot cancel order', 
          description: data.message || 'Failed to cancel order.', 
          variant: 'destructive' 
        });
      } else {
        toast({ 
          title: 'Order cancelled', 
          description: 'Your order has been cancelled successfully.',
        });
        setSelectedOrder(null); // Close the order details dialog immediately
        refetch();
      }
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Failed to cancel order. Please try again.', 
        variant: 'destructive' 
      });
    } finally {
      setIsCancelling(false);
      setCancelDialogOpen(false);
      setOrderToCancel(null);
    }
  };

  const OrderCard = ({ order }: { order: OrderWithItems }) => {
    const statusConfig = getStatusConfig(order.status);
    const vehicleCount = order.orderItems?.length || 1;
    const needsRebooking = (order as any).needsRebooking;
    const hasPendingPayment = order.paymentStatus === 'pending' && order.stripePaymentIntentId;
    const isRetrying = retryingPayment === order.id;
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => setSelectedOrder(order)}
        className="cursor-pointer"
      >
        <Card className={`transition-all ${needsRebooking ? 'border-orange-500 bg-orange-50/30' : hasPendingPayment ? 'border-amber-500 bg-amber-50/30' : 'border-border hover:border-copper/30'}`}>
          <CardContent className="py-4">
            {needsRebooking && (
              <div className="bg-orange-100 border border-orange-300 rounded-lg p-3 mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-orange-800">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">This delivery needs to be rescheduled</span>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="text-orange-700 border-orange-400 hover:bg-orange-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/book');
                  }}
                >
                  Reschedule
                </Button>
              </div>
            )}
            {hasPendingPayment && !needsRebooking && (
              <div className="bg-amber-100 border border-amber-300 rounded-lg p-3 mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-800">
                  <CreditCard className="w-4 h-4" />
                  <span className="text-sm font-medium">Payment needs confirmation</span>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="text-amber-700 border-amber-400 hover:bg-amber-100"
                  disabled={isRetrying}
                  onClick={(e) => handleRetryPreauth(order.id, e)}
                  data-testid="button-retry-preauth"
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    'Confirm Payment'
                  )}
                </Button>
              </div>
            )}
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-display font-semibold text-foreground">
                  {format(order.scheduledDate, 'EEEE, MMMM d')}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{order.deliveryWindow}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={statusConfig.color} variant="outline">
                  <statusConfig.icon className="w-3 h-3 mr-1" />
                  {statusConfig.label}
                </Badge>
                {needsRebooking && (
                  <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
                    Needs Rebooking
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span>{order.address}, {order.city}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-foreground">
                  {order.fuelAmount}L{vehicleCount > 1 ? ` · ${vehicleCount} vehicles` : ''} · ${parseFloat(order.total.toString()).toFixed(2)}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  const OrderTimeline = ({ order }: { order: Order }) => {
    const stages = [
      { key: 'scheduled', label: 'Scheduled', description: 'Order placed' },
      { key: 'confirmed', label: 'Confirmed', description: 'Driver assigned' },
      { key: 'en_route', label: 'En Route', description: 'Driver on the way' },
      { key: 'arriving', label: 'Arriving', description: 'Almost there' },
      { key: 'fueling', label: 'Fueling', description: 'Filling up your vehicle' },
      { key: 'completed', label: 'Completed', description: 'All done!' },
    ];

    const currentIndex = stages.findIndex(s => s.key === order.status);

    return (
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const isComplete = i <= currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={stage.key} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isComplete ? 'bg-copper text-white' : 'bg-muted text-muted-foreground'
                } ${isCurrent ? 'ring-2 ring-copper ring-offset-2' : ''}`}>
                  {isComplete ? <CheckCircle className="w-4 h-4" /> : <div className="w-2 h-2 rounded-full bg-current" />}
                </div>
                {i < stages.length - 1 && (
                  <div className={`w-0.5 h-8 ${isComplete ? 'bg-copper' : 'bg-muted'}`} />
                )}
              </div>
              <div className="pt-1">
                <p className={`font-medium ${isCurrent ? 'text-copper' : isComplete ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {stage.label}
                </p>
                <p className="text-sm text-muted-foreground">{stage.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const content = (
    <div className={embedded ? "" : "max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6"}>
      {!embedded && (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold text-foreground">Deliveries</h1>
            {upcomingOrders.length > 0 && (
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <Badge variant="outline" className="text-xs border-green-500/50 text-green-600 bg-green-500/10">
                    <Radio className="w-3 h-3 mr-1 animate-pulse" />
                    Live Updates
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Polling
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Track and manage your fuel deliveries</p>
            {dataUpdatedAt && (
              <span className="text-xs text-muted-foreground/70">
                Updated {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      )}

        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="upcoming" className="gap-2" data-testid="tab-upcoming">
              <CalendarClock className="w-4 h-4" />
              <span>Upcoming</span>
              {upcomingOrders.length > 0 && (
                <Badge variant="secondary" className="ml-1">{upcomingOrders.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2" data-testid="tab-completed">
              <CheckCircle className="w-4 h-4" />
              <span>Completed</span>
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="gap-2" data-testid="tab-cancelled">
              <Ban className="w-4 h-4" />
              <span>Cancelled</span>
            </TabsTrigger>
            <TabsTrigger value="receipts" className="gap-2" data-testid="tab-receipts">
              <Receipt className="w-4 h-4" />
              <span>Receipts</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Truck className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-display text-lg font-semibold mb-2">No upcoming deliveries</h3>
                  <p className="text-muted-foreground">Book a delivery to get fuel brought to you</p>
                </CardContent>
              </Card>
            ) : (
              upcomingOrders.map(order => <OrderCard key={order.id} order={order} />)
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-display text-lg font-semibold mb-2">No completed deliveries</h3>
                  <p className="text-muted-foreground">Your completed orders will appear here</p>
                </CardContent>
              </Card>
            ) : (
              completedOrders.map(order => <OrderCard key={order.id} order={order} />)
            )}
          </TabsContent>

          <TabsContent value="cancelled" className="space-y-4">
            {cancelledOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <X className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-display text-lg font-semibold mb-2">No cancelled orders</h3>
                  <p className="text-muted-foreground">Cancelled orders will appear here</p>
                </CardContent>
              </Card>
            ) : (
              cancelledOrders.map(order => <OrderCard key={order.id} order={order} />)
            )}
          </TabsContent>

          <TabsContent value="receipts" className="space-y-4">
            <ReceiptsContent />
          </TabsContent>
        </Tabs>

        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Order Details</DialogTitle>
              <DialogDescription>
                {selectedOrder && format(selectedOrder.scheduledDate, 'EEEE, MMMM d, yyyy')}
              </DialogDescription>
            </DialogHeader>
            
            {selectedOrder && (
              <div className="space-y-6">
                {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                  <OrderTimeline order={selectedOrder} />
                )}

                <div className="space-y-3 text-sm border-t border-border pt-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery Window</span>
                    <span className="font-medium">{selectedOrder.deliveryWindow}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Address</span>
                    <span className="font-medium text-right">{selectedOrder.address}, {selectedOrder.city}</span>
                  </div>
                </div>

                {/* Per-vehicle fuel breakdown */}
                {selectedOrder.orderItems && selectedOrder.orderItems.length > 0 ? (
                  <div className="space-y-3 border-t border-border pt-4">
                    <p className="text-sm font-medium text-muted-foreground">Vehicles</p>
                    {selectedOrder.orderItems.map((item, index) => {
                      const fuelLabel = item.fuelType === 'regular' ? 'Regular' : 
                                       item.fuelType === 'premium' ? 'Premium' : 'Diesel';
                      const vehicleName = item.vehicle 
                        ? `${item.vehicle.year} ${item.vehicle.make} ${item.vehicle.model}`
                        : 'Vehicle';
                      const pricePerLitre = parseFloat(item.pricePerLitre.toString());
                      const fuelCost = parseFloat(item.fuelAmount.toString()) * pricePerLitre;
                      
                      return (
                        <div key={item.id || index} className="bg-muted/30 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Car className="w-4 h-4 text-copper" />
                            <span className="font-medium text-sm">{vehicleName}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm pl-6">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Fuel Type</span>
                              <span className="font-medium">{fuelLabel}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Amount</span>
                              <span className="font-medium">{item.fuelAmount}L</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Price/L</span>
                              <span className="font-medium">${pricePerLitre.toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Subtotal</span>
                              <span className="font-medium">${fuelCost.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Fallback for orders without orderItems (legacy single-vehicle orders)
                  <div className="space-y-3 text-sm border-t border-border pt-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fuel Amount</span>
                      <span className="font-medium">{selectedOrder.fuelAmount}L {selectedOrder.fuelType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Price per Litre</span>
                      <span className="font-medium">${parseFloat(selectedOrder.pricePerLitre.toString()).toFixed(4)}/L</span>
                    </div>
                  </div>
                )}

                <div className="space-y-2 border-t border-border pt-4">
                  {selectedOrder.orderItems && selectedOrder.orderItems.length > 0 ? (
                    // Show per-vehicle subtotals in pricing breakdown
                    <>
                      {selectedOrder.orderItems.map((item, index) => {
                        const vehicleName = item.vehicle 
                          ? `${item.vehicle.make} ${item.vehicle.model}`
                          : `Vehicle ${index + 1}`;
                        const pricePerLitre = parseFloat(item.pricePerLitre.toString());
                        const fuelCost = parseFloat(item.fuelAmount.toString()) * pricePerLitre;
                        return (
                          <div key={item.id || index} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{vehicleName} ({item.fuelAmount}L)</span>
                            <span>${fuelCost.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Fuel</span>
                      <span>${(parseFloat(selectedOrder.fuelAmount.toString()) * parseFloat(selectedOrder.pricePerLitre.toString())).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span>{parseFloat(selectedOrder.deliveryFee.toString()) === 0 ? 'FREE' : `$${parseFloat(selectedOrder.deliveryFee.toString()).toFixed(2)}`}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST (5%)</span>
                    <span>${parseFloat(selectedOrder.gstAmount.toString()).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-display font-bold text-lg pt-2 border-t border-border">
                    <span>Total</span>
                    <span>${parseFloat(selectedOrder.total.toString()).toFixed(2)}</span>
                  </div>
                </div>

                {['scheduled', 'confirmed'].includes(selectedOrder.status) && (
                  <Button
                    variant="outline"
                    className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => {
                      setOrderToCancel(selectedOrder);
                      setCancelDialogOpen(true);
                    }}
                  >
                    Cancel Order
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Cancel Order?</DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel this delivery? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={isCancelling}>Keep Order</Button>
              <Button variant="destructive" onClick={handleCancelOrder} disabled={isCancelling}>
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={paymentDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setPaymentDialogOpen(false);
            setPaymentClientSecret(null);
            setPaymentOrderId(null);
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-copper" />
                Add Payment Method
              </DialogTitle>
              <DialogDescription>
                Enter your card details to complete the payment. Your card will be saved for future orders.
              </DialogDescription>
            </DialogHeader>
            {stripeInstance && paymentClientSecret && paymentOrderId && (
              <Elements stripe={stripeInstance}>
                <CardPaymentForm
                  clientSecret={paymentClientSecret}
                  orderId={paymentOrderId}
                  onSuccess={() => {
                    setPaymentDialogOpen(false);
                    setPaymentClientSecret(null);
                    setPaymentOrderId(null);
                    refetch();
                  }}
                  onCancel={() => {
                    setPaymentDialogOpen(false);
                    setPaymentClientSecret(null);
                    setPaymentOrderId(null);
                  }}
                />
              </Elements>
            )}
          </DialogContent>
        </Dialog>
      </div>
  );

  return content;
}
