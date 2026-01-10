import { useState } from 'react';
import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useOrders, ACTIVE_ORDER_STATUSES } from '@/lib/api-hooks';
import type { Order } from '@shared/schema';
import { Truck, Clock, MapPin, Calendar, ChevronRight, X, CheckCircle, AlertCircle, Navigation, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export default function Deliveries() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { orders, isLoading, dataUpdatedAt } = useOrders({
    refetchInterval: (data) => {
      const hasActiveOrders = data?.some(o => ACTIVE_ORDER_STATUSES.includes(o.status));
      return hasActiveOrders ? 5000 : false;
    },
  });
  
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

  const upcomingOrders = orders.filter(o => ACTIVE_ORDER_STATUSES.includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'completed');
  const cancelledOrders = orders.filter(o => o.status === 'cancelled');

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

  const handleCancelOrder = () => {
    toast({ 
      title: 'Cancellation unavailable', 
      description: 'Please contact support to cancel your order.', 
      variant: 'destructive' 
    });
    setCancelDialogOpen(false);
    setOrderToCancel(null);
  };

  const OrderCard = ({ order }: { order: Order }) => {
    const statusConfig = getStatusConfig(order.status);
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => setSelectedOrder(order)}
        className="cursor-pointer"
      >
        <Card className="border-border hover:border-copper/30 transition-all">
          <CardContent className="py-4">
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
              <Badge className={statusConfig.color} variant="outline">
                <statusConfig.icon className="w-3 h-3 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span>{order.address}, {order.city}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-foreground">
                  {order.fuelAmount}L · ${parseFloat(order.total.toString()).toFixed(2)}
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

  return (
    <CustomerLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground">Deliveries</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Track and manage your fuel deliveries</p>
            {upcomingOrders.length > 0 && dataUpdatedAt && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
                <RefreshCw className="w-3 h-3 animate-spin-slow" />
                Updated {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
              </span>
            )}
          </div>
        </div>

        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upcoming">
              Upcoming
              {upcomingOrders.length > 0 && (
                <Badge variant="secondary" className="ml-2">{upcomingOrders.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
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
        </Tabs>

        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="max-w-md">
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fuel Amount</span>
                    <span className="font-medium">{selectedOrder.fuelAmount}L {selectedOrder.fuelType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price per Litre</span>
                    <span className="font-medium">${parseFloat(selectedOrder.pricePerLitre.toString()).toFixed(4)}/L</span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fuel</span>
                    <span>${(selectedOrder.fuelAmount * parseFloat(selectedOrder.pricePerLitre.toString())).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span>{parseFloat(selectedOrder.deliveryFee.toString()) === 0 ? 'FREE' : `$${parseFloat(selectedOrder.deliveryFee.toString()).toFixed(2)}`}</span>
                  </div>
                  <div className="flex justify-between font-display font-bold text-lg pt-2 border-t border-border">
                    <span>Total</span>
                    <span>${parseFloat(selectedOrder.total.toString()).toFixed(2)}</span>
                  </div>
                </div>

                {selectedOrder.status === 'scheduled' && (
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
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Keep Order</Button>
              <Button variant="destructive" onClick={handleCancelOrder}>Yes, Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CustomerLayout>
  );
}
