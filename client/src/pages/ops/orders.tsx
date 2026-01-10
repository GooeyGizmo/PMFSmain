import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { 
  Truck, Package, MapPin, Clock, ArrowLeft, User, Calendar,
  Fuel, DollarSign, ChevronDown, ChevronUp, Play, CheckCircle,
  AlertCircle, Navigation, Droplets, Search, Filter
} from 'lucide-react';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';

interface OrderWithDetails {
  id: string;
  userId: string;
  vehicleId: string;
  fuelType: string;
  fuelAmount: number;
  fillToFull: boolean;
  status: string;
  scheduledDate: string;
  deliveryWindow: string;
  address: string;
  city: string;
  notes: string | null;
  total: string;
  routeId: string | null;
  routePosition: number | null;
  tierPriority: number;
  user: { id: string; name: string; email: string; subscriptionTier: string } | null;
  vehicle: { id: string; make: string; model: string; year: number; plateNumber: string } | null;
}

interface Route {
  id: string;
  routeDate: string;
  routeNumber: number;
  driverId: string | null;
  status: string;
  orderCount: number;
  totalLitres: number;
  isOptimized: boolean;
}

interface RouteWithDetails {
  route: Route;
  orders: OrderWithDetails[];
  driver: { id: string; name: string; role: string } | null;
}

interface Driver {
  id: string;
  name: string;
  role: string;
}

const STATUS_FLOW = ['scheduled', 'confirmed', 'en_route', 'arriving', 'fueling', 'completed'];

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  en_route: 'En Route',
  arriving: 'Arriving',
  fueling: 'Fueling',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-slate-500/10 text-slate-600',
  confirmed: 'bg-blue-500/10 text-blue-600',
  en_route: 'bg-amber-500/10 text-amber-600',
  arriving: 'bg-orange-500/10 text-orange-600',
  fueling: 'bg-purple-500/10 text-purple-600',
  completed: 'bg-green-500/10 text-green-600',
  cancelled: 'bg-red-500/10 text-red-600',
};

const TIER_LABELS: Record<string, string> = {
  payg: 'PAYG',
  access: 'ACCESS',
  household: 'HOUSEHOLD',
  rural: 'RURAL',
};

export default function OpsOrders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());

  const { data: ordersData, isLoading: ordersLoading } = useQuery<{ orders: OrderWithDetails[] }>({
    queryKey: ['/api/ops/orders/detailed'],
  });

  const { data: routesData, isLoading: routesLoading } = useQuery<{ routes: RouteWithDetails[] }>({
    queryKey: ['/api/ops/routes', selectedDate],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ops/routes?date=${selectedDate}`);
      return res.json();
    },
  });

  const { data: driversData } = useQuery<{ drivers: Driver[] }>({
    queryKey: ['/api/ops/drivers'],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const res = await apiRequest('PATCH', `/api/orders/${orderId}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
    },
  });

  const assignDriverMutation = useMutation({
    mutationFn: async ({ routeId, driverId }: { routeId: string; driverId: string }) => {
      const res = await apiRequest('POST', `/api/ops/routes/${routeId}/assign-driver`, { driverId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
    },
  });

  const optimizeRouteMutation = useMutation({
    mutationFn: async (routeId: string) => {
      const res = await apiRequest('POST', `/api/ops/routes/${routeId}/optimize`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
    },
  });

  const orders: OrderWithDetails[] = ordersData?.orders || [];
  const routes: RouteWithDetails[] = routesData?.routes || [];
  const drivers: Driver[] = driversData?.drivers || [];

  const filteredOrders = orders.filter(order => {
    const matchesSearch = searchQuery === '' || 
      order.user?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.city.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const toggleRoute = (routeId: string) => {
    const newExpanded = new Set(expandedRoutes);
    if (newExpanded.has(routeId)) {
      newExpanded.delete(routeId);
    } else {
      newExpanded.add(routeId);
    }
    setExpandedRoutes(newExpanded);
  };

  const advanceStatus = (order: OrderWithDetails) => {
    const currentIndex = STATUS_FLOW.indexOf(order.status);
    if (currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1) {
      updateStatusMutation.mutate({ orderId: order.id, status: STATUS_FLOW[currentIndex + 1] });
    }
  };

  const getNextStatusLabel = (status: string) => {
    const currentIndex = STATUS_FLOW.indexOf(status);
    if (currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1) {
      return STATUS_LABELS[STATUS_FLOW[currentIndex + 1]];
    }
    return null;
  };

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d, yyyy');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/ops">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="font-display font-bold text-lg text-foreground">Order Management</h1>
                <p className="text-sm text-muted-foreground">Manage orders, routes, and deliveries</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
                data-testid="input-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40"
              data-testid="input-date"
            />
          </div>
        </div>

        <Tabs defaultValue="routes" className="w-full">
          <TabsList>
            <TabsTrigger value="routes" data-testid="tab-routes">
              <Truck className="w-4 h-4 mr-2" />
              Routes ({routes.length})
            </TabsTrigger>
            <TabsTrigger value="all-orders" data-testid="tab-all-orders">
              <Package className="w-4 h-4 mr-2" />
              All Orders ({filteredOrders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="routes" className="space-y-4 mt-4">
            {routes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Truck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No routes for this date</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Routes are created automatically when orders are placed
                  </p>
                </CardContent>
              </Card>
            ) : (
              routes.map((routeData, idx) => (
                <motion.div
                  key={routeData.route.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-copper/10 flex items-center justify-center">
                            <Truck className="w-5 h-5 text-copper" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">Route #{routeData.route.routeNumber}</CardTitle>
                            <CardDescription>
                              {getDateLabel(routeData.route.routeDate)} • {routeData.orders.length} orders • {routeData.route.totalLitres}L total
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={STATUS_COLORS[routeData.route.status]}>
                            {routeData.route.status === 'pending' && 'Pending'}
                            {routeData.route.status === 'in_progress' && 'In Progress'}
                            {routeData.route.status === 'completed' && 'Completed'}
                          </Badge>
                          {routeData.route.isOptimized && (
                            <Badge variant="outline" className="text-sage border-sage">Optimized</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-3 items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            {routeData.driver ? (
                              <span className="text-sm font-medium">{routeData.driver.name}</span>
                            ) : (
                              <Select 
                                onValueChange={(driverId) => assignDriverMutation.mutate({ routeId: routeData.route.id, driverId })}
                              >
                                <SelectTrigger className="w-40 h-8" data-testid={`select-driver-${routeData.route.id}`}>
                                  <SelectValue placeholder="Assign driver" />
                                </SelectTrigger>
                                <SelectContent>
                                  {drivers.map(driver => (
                                    <SelectItem key={driver.id} value={driver.id}>
                                      {driver.name} ({driver.role})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {!routeData.route.isOptimized && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => optimizeRouteMutation.mutate(routeData.route.id)}
                              disabled={optimizeRouteMutation.isPending}
                              data-testid={`button-optimize-${routeData.route.id}`}
                            >
                              <Navigation className="w-4 h-4 mr-1" />
                              Optimize
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRoute(routeData.route.id)}
                            data-testid={`button-expand-${routeData.route.id}`}
                          >
                            {expandedRoutes.has(routeData.route.id) ? (
                              <><ChevronUp className="w-4 h-4 mr-1" /> Hide Orders</>
                            ) : (
                              <><ChevronDown className="w-4 h-4 mr-1" /> Show Orders</>
                            )}
                          </Button>
                        </div>
                      </div>

                      {expandedRoutes.has(routeData.route.id) && (
                        <div className="space-y-2 border-t pt-4">
                          {routeData.orders
                            .sort((a, b) => (a.routePosition || 0) - (b.routePosition || 0))
                            .map((order, orderIdx) => (
                              <OrderCard 
                                key={order.id} 
                                order={order} 
                                position={orderIdx + 1}
                                onAdvanceStatus={() => advanceStatus(order)}
                                getNextStatusLabel={getNextStatusLabel}
                                isPending={updateStatusMutation.isPending}
                              />
                            ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </TabsContent>

          <TabsContent value="all-orders" className="space-y-3 mt-4">
            {filteredOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No orders found</p>
                </CardContent>
              </Card>
            ) : (
              filteredOrders.map((order, idx) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                >
                  <OrderCard 
                    order={order}
                    onAdvanceStatus={() => advanceStatus(order)}
                    getNextStatusLabel={getNextStatusLabel}
                    isPending={updateStatusMutation.isPending}
                    showDate
                  />
                </motion.div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function OrderCard({ 
  order, 
  position, 
  onAdvanceStatus, 
  getNextStatusLabel, 
  isPending,
  showDate = false 
}: { 
  order: OrderWithDetails; 
  position?: number;
  onAdvanceStatus: () => void;
  getNextStatusLabel: (status: string) => string | null;
  isPending: boolean;
  showDate?: boolean;
}) {
  const nextStatus = getNextStatusLabel(order.status);

  return (
    <Card className="border-l-4" style={{ borderLeftColor: order.tierPriority === 1 ? '#22c55e' : order.tierPriority === 2 ? '#3b82f6' : order.tierPriority === 3 ? '#f59e0b' : '#94a3b8' }}>
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            {position && (
              <div className="w-8 h-8 rounded-full bg-copper/10 flex items-center justify-center text-copper font-bold text-sm">
                {position}
              </div>
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium" data-testid={`text-customer-${order.id}`}>{order.user?.name || 'Unknown Customer'}</span>
                <Badge variant="outline" className="text-xs">
                  {TIER_LABELS[order.user?.subscriptionTier || 'payg']}
                </Badge>
                <Badge className={STATUS_COLORS[order.status]} data-testid={`status-${order.id}`}>
                  {STATUS_LABELS[order.status]}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {order.address}, {order.city}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {order.deliveryWindow}
                </span>
                {showDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(parseISO(order.scheduledDate), 'MMM d')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1">
                  <Droplets className="w-3 h-3 text-copper" />
                  {order.fuelAmount}L {order.fuelType}
                  {order.fillToFull && <Badge variant="secondary" className="text-xs ml-1">Fill to Full</Badge>}
                </span>
                {order.vehicle && (
                  <span className="text-muted-foreground">
                    {order.vehicle.year} {order.vehicle.make} {order.vehicle.model}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 lg:ml-auto">
            <div className="text-right">
              <p className="font-medium text-lg">${parseFloat(order.total).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">inc. GST</p>
            </div>
            {nextStatus && order.status !== 'cancelled' && (
              <Button 
                size="sm" 
                onClick={onAdvanceStatus}
                disabled={isPending}
                data-testid={`button-advance-${order.id}`}
              >
                {order.status === 'scheduled' && <CheckCircle className="w-4 h-4 mr-1" />}
                {order.status === 'confirmed' && <Play className="w-4 h-4 mr-1" />}
                {order.status === 'en_route' && <Navigation className="w-4 h-4 mr-1" />}
                {order.status === 'arriving' && <Fuel className="w-4 h-4 mr-1" />}
                {order.status === 'fueling' && <CheckCircle className="w-4 h-4 mr-1" />}
                {nextStatus}
              </Button>
            )}
            {order.status === 'completed' && (
              <Badge className="bg-green-500/10 text-green-600">
                <CheckCircle className="w-3 h-3 mr-1" />
                Completed
              </Badge>
            )}
          </div>
        </div>
        {order.notes && (
          <div className="mt-3 p-2 bg-muted/50 rounded text-sm text-muted-foreground">
            <AlertCircle className="w-3 h-3 inline mr-1" />
            {order.notes}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
