import { useState, useEffect } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Truck, Package, MapPin, Clock, ArrowLeft, User, Calendar,
  Fuel, DollarSign, ChevronDown, ChevronUp, Play, CheckCircle,
  AlertCircle, Navigation, Droplets, Search, Filter, Edit, X, MoreVertical, RefreshCw, Archive, Trash2
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
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
  pricePerLitre: string;
  tierDiscount: string;
  deliveryFee: string;
  paymentStatus: string | null;
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
    queryKey: ['/api/ops/routes'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ops/routes`);
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

  const reassignUnassignedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/ops/routes/reassign-unassigned');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
    },
  });

  const deleteRouteMutation = useMutation({
    mutationFn: async (routeId: string) => {
      const res = await apiRequest('DELETE', `/api/ops/routes/${routeId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
    },
  });

  const cleanupPastRoutesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/ops/routes/cleanup-past');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
    },
  });

  // Auto-cleanup past routes on page load
  useEffect(() => {
    cleanupPastRoutesMutation.mutate();
  }, []);

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

  // Separate active orders from archived (cancelled/completed)
  const activeOrders = filteredOrders.filter(order => 
    order.status !== 'cancelled' && order.status !== 'completed'
  );
  const archivedOrders = filteredOrders.filter(order => 
    order.status === 'cancelled' || order.status === 'completed'
  ).sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
  
  // Count unassigned active orders (not in any route)
  const unassignedOrders = activeOrders.filter(order => !order.routeId);

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

  // Format route date in UTC (since route dates are stored as normalized noon UTC representing Calgary calendar day)
  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    // Use Intl.DateTimeFormat with UTC timezone to get the correct date
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return formatter.format(date);
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
              Active Orders ({activeOrders.length})
            </TabsTrigger>
            <TabsTrigger value="archived" data-testid="tab-archived">
              <Archive className="w-4 h-4 mr-2" />
              Archived ({archivedOrders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="routes" className="space-y-4 mt-4">
            {unassignedOrders.length > 0 && (
              <Card className="border-amber-500 bg-amber-500/5">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-500" />
                      <div>
                        <p className="font-medium text-amber-700">{unassignedOrders.length} order{unassignedOrders.length > 1 ? 's' : ''} not assigned to routes</p>
                        <p className="text-sm text-muted-foreground">These orders need to be added to routes for delivery</p>
                      </div>
                    </div>
                    <Button 
                      onClick={() => reassignUnassignedMutation.mutate()}
                      disabled={reassignUnassignedMutation.isPending}
                      data-testid="button-reassign-orders"
                    >
                      {reassignUnassignedMutation.isPending ? 'Assigning...' : 'Assign to Routes'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
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
                            <CardTitle className="text-lg">{getDateLabel(routeData.route.routeDate)}</CardTitle>
                            <CardDescription>
                              {routeData.orders.length} orders • {routeData.route.totalLitres}L total
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
                          {!routeData.route.isOptimized && routeData.orders.length > 0 && (
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
                          {(() => {
                            const activeOrdersInRoute = routeData.orders.filter(o => 
                              o.status !== 'cancelled' && o.status !== 'completed'
                            );
                            const canDelete = activeOrdersInRoute.length === 0;
                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteRouteMutation.mutate(routeData.route.id)}
                                disabled={!canDelete || deleteRouteMutation.isPending}
                                className={canDelete ? "text-red-500 hover:text-red-600 hover:bg-red-50" : "text-muted-foreground"}
                                title={canDelete ? "Delete this route" : "Cannot delete route with active orders"}
                                data-testid={`button-delete-route-${routeData.route.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            );
                          })()}
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
            {activeOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No active orders found</p>
                </CardContent>
              </Card>
            ) : (
              activeOrders.map((order, idx) => (
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

          <TabsContent value="archived" className="space-y-3 mt-4">
            {archivedOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Archive className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No archived orders</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Cancelled and completed orders will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              archivedOrders.map((order, idx) => (
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
  const queryClient = useQueryClient();
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(order.status);
  const [actualLitres, setActualLitres] = useState(order.fuelAmount);
  const [orderItemsActuals, setOrderItemsActuals] = useState<Record<string, number>>({});
  const [shameError, setShameError] = useState<string | null>(null);
  
  // The Hall of Shame messages - sassy, nuclear, and unforgettable
  const SHAME_MESSAGES = [
    "Zero litres? So you drove out there, parked, and... what, admired the scenery? Either the pump broke or someone forgot what job they're getting paid for. Try again when you've actually delivered some fuel, champ. 🙄",
    "Wow. 0 litres delivered. Incredible work ethic. Did you at least wave at the customer, or was that too much effort too?",
    "Congratulations, you've achieved the impossible: a fuel delivery with no fuel. Should I add 'motivational speaker' to your job title?",
    "Zero litres delivered? Fascinating. Did you just... sit in the truck and contemplate your life choices? Because same, honestly.",
    "Ah, the legendary 0L delivery. Tell me, did the customer at least offer you a snack for wasting their time, or did you speedrun the disappointment?",
    "Hold on, let me get this straight — you drove out, used company fuel, and delivered... nothing? That's not a delivery, that's a field trip. Field trips don't pay the bills, sweetie. 💅",
    "Delivering zero litres is certainly a choice. A bold, confusing, slightly concerning choice. Are you okay? Blink twice if you need help. 👀",
    "0 litres. Zero. Zilch. Nada. The only thing you delivered today was disappointment. Try again when you remember how pumps work.",
  ];
  
  const getRandomShameMessage = () => {
    return SHAME_MESSAGES[Math.floor(Math.random() * SHAME_MESSAGES.length)];
  };
  
  // Fetch order items when capture dialog opens
  const { data: orderItemsData, refetch: refetchOrderItems } = useQuery<{ orderItems: Array<{
    id: string;
    vehicleId: string;
    fuelType: string;
    fuelAmount: number;
    fillToFull: boolean;
    pricePerLitre: string;
    subtotal: string;
    actualLitresDelivered: number | null;
    vehicle?: { id: string; make: string; model: string; year: number; plateNumber: string };
  }> }>({
    queryKey: ['/api/orders', order.id, 'items'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/orders/${order.id}`);
      return res.json();
    },
    enabled: captureDialogOpen,
  });

  const orderItems = orderItemsData?.orderItems || [];
  const hasMultipleVehicles = orderItems.length > 1;
  
  // Initialize actuals when order items load
  useEffect(() => {
    if (orderItems.length > 0 && Object.keys(orderItemsActuals).length === 0) {
      const initActuals: Record<string, number> = {};
      orderItems.forEach(item => {
        initActuals[item.id] = item.fuelAmount;
      });
      setOrderItemsActuals(initActuals);
    }
  }, [orderItems]);
  
  const [editForm, setEditForm] = useState({
    scheduledDate: format(parseISO(order.scheduledDate), 'yyyy-MM-dd'),
    deliveryWindow: order.deliveryWindow,
    address: order.address,
    city: order.city,
    notes: order.notes || '',
    fuelAmount: order.fuelAmount,
    fillToFull: order.fillToFull,
  });
  const [cancelReason, setCancelReason] = useState('');
  
  // Fetch slot availability for the selected date
  const { data: slotAvailability } = useQuery({
    queryKey: ['/api/slots/availability', editForm.scheduledDate],
    queryFn: async () => {
      const res = await fetch(`/api/slots/availability?date=${editForm.scheduledDate}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch availability');
      return res.json();
    },
    enabled: editDialogOpen && !!editForm.scheduledDate,
  });

  const capturePaymentMutation = useMutation({
    mutationFn: async ({ orderId, actualLitresDelivered, itemActuals }: { 
      orderId: string; 
      actualLitresDelivered: number;
      itemActuals?: Record<string, number>;
    }) => {
      const res = await apiRequest('POST', `/api/orders/${orderId}/capture-payment`, { 
        actualLitresDelivered,
        itemActuals, 
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      setCaptureDialogOpen(false);
      setOrderItemsActuals({});
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const res = await apiRequest('PATCH', `/api/orders/${order.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      setEditDialogOpen(false);
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await apiRequest('POST', `/api/orders/${order.id}/cancel`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      setCancelDialogOpen(false);
      setCancelReason('');
    },
  });

  const changeStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await apiRequest('PATCH', `/api/orders/${order.id}/status`, { status: newStatus });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      setStatusDialogOpen(false);
    },
  });

  // Allow modifying all orders during testing phase
  const canModify = true;

  const nextStatus = getNextStatusLabel(order.status);

  const pricePerLitre = parseFloat(order.pricePerLitre || '0');
  const tierDiscount = parseFloat(order.tierDiscount || '0');
  const deliveryFee = parseFloat(order.deliveryFee || '0');

  // Calculate final charge based on whether we have order items or not
  const calculateFinalCharge = () => {
    if (orderItems.length > 0) {
      // Multi-vehicle: sum each item's fuel cost
      let totalFuelCost = 0;
      let totalLitres = 0;
      orderItems.forEach(item => {
        const itemLitres = orderItemsActuals[item.id] || item.fuelAmount;
        const itemPrice = parseFloat(item.pricePerLitre || '0');
        totalFuelCost += itemLitres * itemPrice;
        totalLitres += itemLitres;
      });
      const discountAmount = totalLitres * tierDiscount;
      const subtotal = totalFuelCost - discountAmount + deliveryFee;
      const gst = subtotal * 0.05;
      return subtotal + gst;
    } else {
      // Single vehicle fallback
      const fuelCost = actualLitres * pricePerLitre;
      const discountAmount = actualLitres * tierDiscount;
      const subtotal = fuelCost - discountAmount + deliveryFee;
      const gst = subtotal * 0.05;
      return subtotal + gst;
    }
  };

  const getTotalActualLitres = () => {
    if (orderItems.length > 0) {
      return orderItems.reduce((sum, item) => sum + (orderItemsActuals[item.id] ?? item.fuelAmount), 0);
    }
    return actualLitres;
  };

  const finalCharge = calculateFinalCharge();

  // Mutation to record shame events
  const recordShameMutation = useMutation({
    mutationFn: async ({ message, orderId }: { message: string; orderId: string }) => {
      const res = await apiRequest('POST', '/api/shame-events', { message, orderId });
      return res.json();
    },
  });

  const handleCapturePayment = () => {
    const totalLitres = getTotalActualLitres();
    
    // Check if ALL values are 0 or less - shame time!
    const allZeroOrNegative = orderItems.length > 0 
      ? orderItems.every(item => (orderItemsActuals[item.id] ?? item.fuelAmount) <= 0)
      : actualLitres <= 0;
    
    if (allZeroOrNegative) {
      const message = getRandomShameMessage();
      setShameError(message);
      // Record the shame event for the Hall of Shame
      recordShameMutation.mutate({ message, orderId: order.id });
      return;
    }
    
    // Check for any negative values
    const hasNegative = orderItems.length > 0
      ? orderItems.some(item => (orderItemsActuals[item.id] ?? item.fuelAmount) < 0)
      : actualLitres < 0;
    
    if (hasNegative) {
      setShameError("Negative litres? What are you doing, sucking fuel out of the tank? Values can't be less than zero.");
      return;
    }
    
    setShameError(null);
    capturePaymentMutation.mutate({ 
      orderId: order.id, 
      actualLitresDelivered: totalLitres,
      itemActuals: orderItems.length > 0 ? orderItemsActuals : undefined,
    });
  };

  return (
    <>
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
              {nextStatus && order.status !== 'cancelled' && order.status !== 'fueling' && (
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
                  {nextStatus}
                </Button>
              )}
              {order.status === 'fueling' && (
                <Button 
                  size="sm" 
                  onClick={() => setCaptureDialogOpen(true)}
                  data-testid={`button-complete-delivery-${order.id}`}
                >
                  <DollarSign className="w-4 h-4 mr-1" />
                  Complete Delivery
                </Button>
              )}
              {order.status === 'completed' && (
                <Badge className="bg-green-500/10 text-green-600">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Completed
                </Badge>
              )}
              {order.status === 'cancelled' && (
                <Badge className="bg-red-500/10 text-red-600">
                  <X className="w-3 h-3 mr-1" />
                  Cancelled
                </Badge>
              )}
              {canModify && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid={`button-order-menu-${order.id}`}>
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditDialogOpen(true)} data-testid={`button-edit-order-${order.id}`}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Order
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSelectedStatus(order.status); setStatusDialogOpen(true); }} data-testid={`button-change-status-${order.id}`}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Change Status
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setCancelDialogOpen(true)} 
                      className="text-destructive"
                      data-testid={`button-cancel-order-${order.id}`}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel Order
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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

      <Dialog open={captureDialogOpen} onOpenChange={setCaptureDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Delivery</DialogTitle>
            <DialogDescription>
              Enter the actual amount of fuel delivered and capture payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Per-vehicle inputs for multi-vehicle orders */}
            {orderItems.length > 0 ? (
              <div className="space-y-4">
                {orderItems.map((item, idx) => {
                  const fuelTypeLabels: Record<string, string> = {
                    regular: 'Regular 87',
                    diesel: 'Diesel',
                    premium: 'Premium 91',
                  };
                  const itemActual = orderItemsActuals[item.id] ?? item.fuelAmount;
                  const itemPrice = parseFloat(item.pricePerLitre || '0');
                  return (
                    <div key={item.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {item.vehicle ? `${item.vehicle.year} ${item.vehicle.make} ${item.vehicle.model}` : `Vehicle ${idx + 1}`}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {fuelTypeLabels[item.fuelType] || item.fuelType}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`actual-litres-${item.id}`} className="text-xs text-muted-foreground whitespace-nowrap">
                          Actual L:
                        </Label>
                        <Input
                          id={`actual-litres-${item.id}`}
                          type="number"
                          value={orderItemsActuals[item.id] !== undefined ? orderItemsActuals[item.id] : item.fuelAmount}
                          onChange={(e) => setOrderItemsActuals(prev => ({
                            ...prev,
                            [item.id]: e.target.value === '' ? 0 : parseFloat(e.target.value)
                          }))}
                          step={0.1}
                          className="h-8"
                          data-testid={`input-actual-litres-${item.id}`}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Ordered: {item.fuelAmount}L {item.fillToFull && '(Fill to Full)'}</span>
                        <span>${itemPrice.toFixed(4)}/L</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Subtotal</span>
                        <span>${(itemActual * itemPrice).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="actual-litres">Actual Litres Delivered</Label>
                <Input
                  id="actual-litres"
                  type="number"
                  value={actualLitres}
                  onChange={(e) => setActualLitres(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                  step={0.1}
                  data-testid="input-actual-litres"
                />
                <p className="text-xs text-muted-foreground">
                  Originally ordered: {order.fuelAmount}L {order.fillToFull && '(Fill to Full)'}
                </p>
              </div>
            )}
            
            {/* Summary section */}
            <div className="border-t pt-4 space-y-2">
              {orderItems.length > 0 ? (
                <>
                  {orderItems.map(item => {
                    const itemActual = orderItemsActuals[item.id] ?? item.fuelAmount;
                    const itemPrice = parseFloat(item.pricePerLitre || '0');
                    const fuelTypeLabels: Record<string, string> = {
                      regular: 'Regular 87',
                      diesel: 'Diesel',
                      premium: 'Premium 91',
                    };
                    return (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{fuelTypeLabels[item.fuelType] || item.fuelType} ({itemActual}L × ${itemPrice.toFixed(4)}/L)</span>
                        <span>${(itemActual * itemPrice).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="flex justify-between text-sm">
                  <span>Fuel ({actualLitres}L × ${pricePerLitre.toFixed(4)}/L)</span>
                  <span>${(actualLitres * pricePerLitre).toFixed(2)}</span>
                </div>
              )}
              {tierDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Tier Discount ({getTotalActualLitres()}L × ${tierDiscount.toFixed(4)}/L)</span>
                  <span>-${(getTotalActualLitres() * tierDiscount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>Delivery Fee</span>
                <span>${deliveryFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>GST (5%)</span>
                <span>${(calculateFinalCharge() / 1.05 * 0.05).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total Charge</span>
                <span data-testid="text-final-charge">${finalCharge.toFixed(2)}</span>
              </div>
            </div>
            
            {/* Shame Error Message - The Hall of Shame in action */}
            {shameError && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm" data-testid="shame-error">
                <p className="font-medium mb-1">🚨 Nice try...</p>
                <p>{shameError}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCaptureDialogOpen(false); setShameError(null); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleCapturePayment}
              disabled={capturePaymentMutation.isPending}
              data-testid="button-capture-payment"
            >
              {capturePaymentMutation.isPending ? 'Processing...' : 'Capture Payment & Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Order</DialogTitle>
            <DialogDescription>
              Modify order details. Customer will be notified of changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-date">Delivery Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editForm.scheduledDate}
                  onChange={(e) => setEditForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                  data-testid="input-edit-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-window">Delivery Window</Label>
                <Select 
                  value={editForm.deliveryWindow} 
                  onValueChange={(value) => setEditForm(prev => ({ ...prev, deliveryWindow: value }))}
                >
                  <SelectTrigger id="edit-window" data-testid="select-edit-window">
                    <SelectValue placeholder="Select time window" />
                  </SelectTrigger>
                  <SelectContent>
                    {slotAvailability?.availability?.map((slot: { id: string; label: string; available: boolean; spotsLeft: number; currentBookings: number }) => {
                      // Consider current order's slot as available even if it's at capacity
                      const isCurrentSlot = order.deliveryWindow === slot.label;
                      const isAvailable = slot.available || isCurrentSlot;
                      return (
                        <SelectItem 
                          key={slot.id} 
                          value={slot.label}
                          disabled={!isAvailable}
                          className={!isAvailable ? 'text-muted-foreground opacity-50' : ''}
                        >
                          {slot.label} {!isAvailable ? '(Unavailable)' : slot.spotsLeft <= 1 && !isCurrentSlot ? `(${slot.spotsLeft} left)` : ''}
                        </SelectItem>
                      );
                    }) || (
                      <>
                        <SelectItem value="6:00 AM - 7:30 AM">6:00 AM - 7:30 AM</SelectItem>
                        <SelectItem value="7:30 AM - 9:00 AM">7:30 AM - 9:00 AM</SelectItem>
                        <SelectItem value="9:00 AM - 10:30 AM">9:00 AM - 10:30 AM</SelectItem>
                        <SelectItem value="10:30 AM - 12:00 PM">10:30 AM - 12:00 PM</SelectItem>
                        <SelectItem value="12:00 PM - 1:30 PM">12:00 PM - 1:30 PM</SelectItem>
                        <SelectItem value="1:30 PM - 3:00 PM">1:30 PM - 3:00 PM</SelectItem>
                        <SelectItem value="3:00 PM - 4:30 PM">3:00 PM - 4:30 PM</SelectItem>
                        <SelectItem value="4:30 PM - 6:00 PM">4:30 PM - 6:00 PM</SelectItem>
                        <SelectItem value="6:00 PM - 7:30 PM">6:00 PM - 7:30 PM</SelectItem>
                        <SelectItem value="7:30 PM - 9:00 PM">7:30 PM - 9:00 PM</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={editForm.address}
                onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                data-testid="input-edit-address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-city">City</Label>
              <Input
                id="edit-city"
                value={editForm.city}
                onChange={(e) => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                data-testid="input-edit-city"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-fuel">Fuel Amount (L)</Label>
                <Input
                  id="edit-fuel"
                  type="number"
                  value={editForm.fuelAmount}
                  onChange={(e) => setEditForm(prev => ({ ...prev, fuelAmount: parseFloat(e.target.value) || 0 }))}
                  min={0}
                  data-testid="input-edit-fuel"
                />
              </div>
              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.fillToFull}
                    onChange={(e) => setEditForm(prev => ({ ...prev, fillToFull: e.target.checked }))}
                    className="w-4 h-4"
                    data-testid="checkbox-edit-fill-to-full"
                  />
                  <span className="text-sm">Fill to Full</span>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Special instructions or notes..."
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => updateOrderMutation.mutate(editForm)}
              disabled={updateOrderMutation.isPending}
              data-testid="button-save-order"
            >
              {updateOrderMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this order? This action cannot be undone.
              {order.paymentStatus === 'preauthorized' && (
                <span className="block mt-2 text-amber-600">
                  The pre-authorized payment will be released back to the customer.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Reason for Cancellation (optional)</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason for cancelling this order..."
                data-testid="input-cancel-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Order
            </Button>
            <Button 
              variant="destructive"
              onClick={() => cancelOrderMutation.mutate(cancelReason)}
              disabled={cancelOrderMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelOrderMutation.isPending ? 'Cancelling...' : 'Cancel Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Order Status</DialogTitle>
            <DialogDescription>
              Select a new status for this order. Current status: {STATUS_LABELS[order.status]}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-status">New Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger id="new-status" data-testid="select-new-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value} data-testid={`status-option-${value}`}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => changeStatusMutation.mutate(selectedStatus)}
              disabled={changeStatusMutation.isPending || selectedStatus === order.status}
              data-testid="button-confirm-status-change"
            >
              {changeStatusMutation.isPending ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
