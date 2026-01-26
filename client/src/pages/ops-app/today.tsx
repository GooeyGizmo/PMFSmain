import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Truck, Clock, ChevronRight, Fuel, Users } from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { useLocation } from "wouter";
import { OperatorShell } from "@/components/app-shell/operator-shell";

interface Order {
  id: string;
  address: string;
  city: string;
  scheduledDate: string;
  deliveryWindow: string;
  fuelType: string;
  fuelAmount: string;
  status: string;
  routeId: string | null;
}

interface Route {
  id: string;
  name: string;
  date: string;
  status: string;
  truckId: string | null;
}

export default function TodayPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("orders");

  const { data: ordersData } = useQuery<{ orders: Order[] }>({
    queryKey: ["/api/ops/orders"],
  });

  const { data: routesData } = useQuery<{ routes: Route[] }>({
    queryKey: ["/api/ops/routes"],
  });

  const todayOrders = ordersData?.orders?.filter(o => {
    const date = parseISO(o.scheduledDate);
    return isToday(date) && o.status !== 'cancelled';
  }) || [];

  const tomorrowOrders = ordersData?.orders?.filter(o => {
    const date = parseISO(o.scheduledDate);
    return isTomorrow(date) && o.status !== 'cancelled';
  }) || [];

  const todayRoutes = routesData?.routes?.filter(r => {
    const date = parseISO(r.date);
    return isToday(date);
  }) || [];

  const pendingOrders = todayOrders.filter(o => o.status === 'pending' || o.status === 'confirmed');
  const inProgressOrders = todayOrders.filter(o => o.status === 'in_progress');
  const completedOrders = todayOrders.filter(o => o.status === 'completed');

  return (
    <OperatorShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Today</h1>
            <p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <Button onClick={() => navigate("/ops/dispatch")} data-testid="button-open-dispatch">
            <MapPin className="w-4 h-4 mr-2" />
            Open Dispatch
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingOrders.length}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{inProgressOrders.length}</p>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <Fuel className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{completedOrders.length}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{tomorrowOrders.length}</p>
                  <p className="text-xs text-muted-foreground">Tomorrow</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="orders" data-testid="tab-orders">
              Orders ({todayOrders.length})
            </TabsTrigger>
            <TabsTrigger value="routes" data-testid="tab-routes">
              Routes ({todayRoutes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-3 mt-4">
            {todayOrders.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No deliveries scheduled for today
                </CardContent>
              </Card>
            ) : (
              todayOrders.map(order => (
                <Card 
                  key={order.id} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/ops/orders?highlight=${order.id}`)}
                  data-testid={`card-order-${order.id}`}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{order.address}</span>
                          <Badge variant={
                            order.status === 'completed' ? 'default' :
                            order.status === 'in_progress' ? 'secondary' : 'outline'
                          }>
                            {order.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {order.deliveryWindow}
                          </span>
                          <span className="flex items-center gap-1">
                            <Fuel className="w-3 h-3" />
                            {order.fuelAmount}L {order.fuelType}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="routes" className="space-y-3 mt-4">
            {todayRoutes.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No routes created for today
                </CardContent>
              </Card>
            ) : (
              todayRoutes.map(route => (
                <Card 
                  key={route.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/ops/dispatch?route=${route.id}`)}
                  data-testid={`card-route-${route.id}`}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{route.name}</span>
                          <Badge variant={route.status === 'completed' ? 'default' : 'outline'}>
                            {route.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {route.truckId ? 'Truck assigned' : 'No truck assigned'}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </OperatorShell>
  );
}
