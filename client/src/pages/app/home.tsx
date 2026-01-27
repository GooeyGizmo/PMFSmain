import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Fuel, Clock, MapPin, ChevronRight, RefreshCw, Calendar, Truck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { usePreferences } from '@/hooks/use-preferences';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function CustomerHomePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const layout = useLayoutMode();
  const { preferences } = usePreferences();

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['/api/orders'],
    queryFn: async () => {
      const res = await fetch('/api/orders');
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ['/api/vehicles'],
    queryFn: async () => {
      const res = await fetch('/api/vehicles');
      if (!res.ok) throw new Error('Failed to fetch vehicles');
      return res.json();
    },
  });

  const ordersArray = orders?.orders || orders || [];
  const activeOrders = ordersArray?.filter((o: any) => 
    ['pending', 'confirmed', 'in_progress'].includes(o.status)
  ) || [];

  const lastCompletedOrder = ordersArray?.find((o: any) => o.status === 'completed');
  
  const nextDelivery = activeOrders[0];
  const hasLastOrder = !!lastCompletedOrder;

  const handleQuickReorder = () => {
    setLocation('/customer/book?reorder=true');
  };

  const handleScheduleFuel = () => {
    setLocation('/customer/book');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      case 'confirmed': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'in_progress': return 'bg-green-500/10 text-green-600 border-green-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <AppShell forceShell="customer">
      <div className={cn(
        "max-w-4xl mx-auto px-4 py-6",
        layout.isCompact && "px-3 py-4"
      )}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Welcome back, {user?.name?.split(' ')[0]}
            </h1>
            <p className="text-muted-foreground mt-1">
              Your fuel command center
            </p>
          </div>

          <Card className="mb-6 overflow-hidden border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Fuel className="w-5 h-5 text-primary" />
                  Quick Actions
                </CardTitle>
                <Badge variant="outline" className="capitalize">
                  {user?.subscriptionTier} Plan
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "grid gap-3",
                layout.isCompact ? "grid-cols-1" : "grid-cols-2"
              )}>
                {hasLastOrder ? (
                  <Button 
                    size="lg" 
                    className="h-auto py-4 flex-col gap-2"
                    onClick={handleQuickReorder}
                    data-testid="button-reorder-same"
                  >
                    <RefreshCw className="w-5 h-5" />
                    <span>Reorder Same</span>
                    <span className="text-xs opacity-80">2-tap repeat order</span>
                  </Button>
                ) : (
                  <Button 
                    size="lg" 
                    className="h-auto py-4 flex-col gap-2"
                    onClick={handleScheduleFuel}
                    data-testid="button-schedule-fuel"
                  >
                    <Calendar className="w-5 h-5" />
                    <span>Schedule Fuel</span>
                    <span className="text-xs opacity-80">Book a delivery</span>
                  </Button>
                )}
                
                <Button 
                  size="lg" 
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={() => setLocation('/app/my-stuff?tab=vehicles')}
                  data-testid="button-manage-vehicles"
                >
                  <Truck className="w-5 h-5" />
                  <span>My Vehicles</span>
                  <span className="text-xs opacity-60">{vehicles?.length || 0} registered</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {ordersLoading ? (
            <Card className="mb-6">
              <CardContent className="py-6">
                <Skeleton className="h-6 w-1/3 mb-4" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ) : nextDelivery ? (
            <Card className="mb-6 border-2 border-primary/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Upcoming Delivery</CardTitle>
                  <Badge className={getStatusColor(nextDelivery.status)}>
                    {nextDelivery.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {new Date(nextDelivery.scheduledDate).toLocaleDateString('en-CA', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {nextDelivery.timeWindow && ` • ${nextDelivery.timeWindow}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate">{nextDelivery.address}</span>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between mt-2"
                    onClick={() => setLocation('/app/history')}
                  >
                    View Details
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="mb-6 bg-muted/30">
              <CardContent className="py-8 text-center">
                <Fuel className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <CardTitle className="text-lg mb-2">No Upcoming Deliveries</CardTitle>
                <CardDescription className="mb-4">
                  Schedule your first fuel delivery today
                </CardDescription>
                <Button onClick={handleScheduleFuel} data-testid="button-schedule-first">
                  Schedule Fuel Delivery
                </Button>
              </CardContent>
            </Card>
          )}

          {activeOrders.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Other Active Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activeOrders.slice(1).map((order: any) => (
                    <div 
                      key={order.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <span className="font-medium">
                          {new Date(order.scheduledDate).toLocaleDateString('en-CA', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {order.timeWindow}
                        </span>
                      </div>
                      <Badge variant="outline" className={getStatusColor(order.status)}>
                        {order.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>
    </AppShell>
  );
}
