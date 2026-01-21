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
import OpsLayout from '@/components/ops-layout';

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
  finalAmount: string | null;
  finalGstAmount: string | null;
  actualLitresDelivered: string | null;
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

interface OrderItem {
  id: string;
  orderId: string;
  vehicleId: string;
  fuelType: string;
  fuelAmount: number;
  fillToFull: boolean;
  pricePerLitre: string;
  subtotal: string;
  actualLitresDelivered: number | null;
  vehicle?: { id: string; make: string; model: string; year: number; plateNumber: string };
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

  const activeOrders = filteredOrders.filter(order => 
    order.status !== 'cancelled' && order.status !== 'completed'
  );
  const archivedOrders = filteredOrders.filter(order => 
    order.status === 'cancelled' || order.status === 'completed'
  ).sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
  
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

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return formatter.format(date);
  };

  return (
    <OpsLayout>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
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
    </OpsLayout>
  );
}

interface OrderCardProps {
  order: OrderWithDetails;
  position?: number;
  onAdvanceStatus: () => void;
  getNextStatusLabel: (status: string) => string | null;
  isPending: boolean;
  showDate?: boolean;
}

function OrderCard({ order, position, onAdvanceStatus, getNextStatusLabel, isPending, showDate }: OrderCardProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedOrder, setEditedOrder] = useState({
    fuelAmount: order.fuelAmount.toString(),
    notes: order.notes || '',
    address: order.address,
    city: order.city,
  });
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(order.status);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [actualLitres, setActualLitres] = useState<string>(order.fuelAmount.toString());
  const [itemActuals, setItemActuals] = useState<Record<string, string>>({});

  const { data: orderItemsData, refetch: refetchOrderItems } = useQuery<{ items: OrderItem[] }>({
    queryKey: ['/api/orders', order.id, 'items'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/orders/${order.id}/items`);
      return res.json();
    },
    enabled: false,
  });

  const orderItems = orderItemsData?.items || [];

  const capturePaymentMutation = useMutation({
    mutationFn: async (data: { actualLitresDelivered: number; itemActuals?: Record<string, number> }) => {
      const res = await apiRequest('POST', `/api/orders/${order.id}/capture-payment`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to capture payment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/ledger'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/reports/revenue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/reports/gst'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/reports/cashflow'] });
      setCompletionDialogOpen(false);
    },
  });

  const handleOpenCompletionDialog = async () => {
    await refetchOrderItems();
    setActualLitres(order.fuelAmount.toString());
    if (orderItemsData?.items) {
      const initialActuals: Record<string, string> = {};
      orderItemsData.items.forEach(item => {
        initialActuals[item.id] = item.fuelAmount.toString();
      });
      setItemActuals(initialActuals);
    }
    setCompletionDialogOpen(true);
  };

  const calculateFinalPricing = () => {
    const pricePerLitre = parseFloat(order.pricePerLitre);
    const tierDiscount = parseFloat(order.tierDiscount);
    const deliveryFee = parseFloat(order.deliveryFee);
    
    let totalLitres = 0;
    let subtotalBeforeDiscount = 0;
    
    if (orderItems.length > 0) {
      for (const item of orderItems) {
        const litres = parseFloat(itemActuals[item.id] || item.fuelAmount.toString()) || 0;
        totalLitres += litres;
        subtotalBeforeDiscount += litres * parseFloat(item.pricePerLitre);
      }
    } else {
      totalLitres = parseFloat(actualLitres) || 0;
      subtotalBeforeDiscount = totalLitres * pricePerLitre;
    }
    
    const discount = totalLitres * tierDiscount;
    const subtotal = subtotalBeforeDiscount - discount + deliveryFee;
    const gst = subtotal * 0.05;
    const total = subtotal + gst;
    
    return {
      totalLitres,
      subtotalBeforeDiscount,
      discount,
      deliveryFee,
      subtotal,
      gst,
      total,
      preAuthAmount: parseFloat(order.total),
    };
  };

  const handleCapturePayment = () => {
    const pricing = calculateFinalPricing();
    if (pricing.totalLitres <= 0) {
      return;
    }
    
    const itemActualsNumeric: Record<string, number> = {};
    Object.entries(itemActuals).forEach(([id, val]) => {
      itemActualsNumeric[id] = parseFloat(val) || 0;
    });
    
    capturePaymentMutation.mutate({
      actualLitresDelivered: pricing.totalLitres,
      itemActuals: Object.keys(itemActualsNumeric).length > 0 ? itemActualsNumeric : undefined,
    });
  };

  const updateOrderMutation = useMutation({
    mutationFn: async (data: Partial<OrderWithDetails>) => {
      const res = await apiRequest('PATCH', `/api/ops/orders/${order.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      setEditMode(false);
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/orders/${order.id}/status`, { status: 'cancelled' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      setCancelDialogOpen(false);
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest('PATCH', `/api/orders/${order.id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      setStatusDialogOpen(false);
    },
  });

  const handleSave = () => {
    updateOrderMutation.mutate({
      fuelAmount: parseFloat(editedOrder.fuelAmount),
      notes: editedOrder.notes,
      address: editedOrder.address,
      city: editedOrder.city,
    });
  };

  const nextStatus = getNextStatusLabel(order.status);
  const isCompleted = order.status === 'completed';
  const isCancelled = order.status === 'cancelled';

  const getDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    });
    return formatter.format(date);
  };

  return (
    <>
      <Card className={`${isCompleted ? 'opacity-70' : ''} ${isCancelled ? 'opacity-50 border-red-200' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {position && (
                <div className="w-8 h-8 rounded-full bg-copper text-white flex items-center justify-center text-sm font-bold">
                  {position}
                </div>
              )}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{order.user?.name || 'Unknown Customer'}</span>
                  {order.user?.subscriptionTier && (
                    <Badge variant="outline" className="text-xs">
                      {TIER_LABELS[order.user.subscriptionTier] || order.user.subscriptionTier}
                    </Badge>
                  )}
                  <Badge className={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{order.address}, {order.city}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Fuel className="w-3.5 h-3.5 text-copper" />
                    {order.fuelAmount}L {order.fuelType}
                    {order.fillToFull && <span className="text-xs text-muted-foreground">(Fill)</span>}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sage" />
                    {order.deliveryWindow}
                  </span>
                  {showDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-brass" />
                      {getDateDisplay(order.scheduledDate)}
                    </span>
                  )}
                  <span className="flex items-center gap-1 font-medium">
                    <DollarSign className="w-3.5 h-3.5 text-brass" />
                    ${parseFloat(order.total).toFixed(2)}
                  </span>
                </div>
                {order.vehicle && (
                  <div className="text-xs text-muted-foreground">
                    {order.vehicle.year} {order.vehicle.make} {order.vehicle.model} • {order.vehicle.plateNumber}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isCompleted && !isCancelled && order.status === 'fueling' && (
                <Button
                  size="sm"
                  onClick={handleOpenCompletionDialog}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid={`button-complete-capture-${order.id}`}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  Complete & Capture
                </Button>
              )}
              {!isCompleted && !isCancelled && nextStatus && order.status !== 'fueling' && (
                <Button
                  size="sm"
                  onClick={onAdvanceStatus}
                  disabled={isPending}
                  className="bg-copper hover:bg-copper/90"
                  data-testid={`button-advance-${order.id}`}
                >
                  <Play className="w-3.5 h-3.5 mr-1" />
                  {nextStatus}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setExpanded(!expanded)}>
                    {expanded ? 'Hide Details' : 'View Details'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEditMode(true)}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Order
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusDialogOpen(true)}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Set Status
                  </DropdownMenuItem>
                  {!isCancelled && !isCompleted && order.status === 'fueling' && (
                    <DropdownMenuItem onClick={handleOpenCompletionDialog} className="text-green-600">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Complete & Capture
                    </DropdownMenuItem>
                  )}
                  {!isCancelled && !isCompleted && (
                    <DropdownMenuItem 
                      onClick={() => setCancelDialogOpen(true)}
                      className="text-red-600"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel Order
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {expanded && (
            <div className="mt-4 pt-4 border-t space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">Price per Litre</p>
                  <p className="font-medium">${parseFloat(order.pricePerLitre).toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Delivery Fee</p>
                  <p className="font-medium">${parseFloat(order.deliveryFee).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Status</p>
                  <p className="font-medium">{order.paymentStatus || 'Pending'}</p>
                </div>
              </div>
              {order.notes && (
                <div className="mt-2">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="font-medium">{order.notes}</p>
                </div>
              )}
              {order.actualLitresDelivered && (
                <div className="mt-2">
                  <p className="text-muted-foreground">Actual Litres Delivered</p>
                  <p className="font-medium">{order.actualLitresDelivered}L</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editMode} onOpenChange={setEditMode}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Order</DialogTitle>
            <DialogDescription>Update order details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fuel Amount (Litres)</Label>
              <Input
                type="number"
                value={editedOrder.fuelAmount}
                onChange={(e) => setEditedOrder({ ...editedOrder, fuelAmount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={editedOrder.address}
                onChange={(e) => setEditedOrder({ ...editedOrder, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                value={editedOrder.city}
                onChange={(e) => setEditedOrder({ ...editedOrder, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editedOrder.notes}
                onChange={(e) => setEditedOrder({ ...editedOrder, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateOrderMutation.isPending}>
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
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>No, Keep Order</Button>
            <Button 
              variant="destructive" 
              onClick={() => cancelOrderMutation.mutate()}
              disabled={cancelOrderMutation.isPending}
            >
              {cancelOrderMutation.isPending ? 'Cancelling...' : 'Yes, Cancel Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Order Status</DialogTitle>
            <DialogDescription>Change the status of this order</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).filter(([value]) => value !== 'completed').map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              To mark as Completed, use the "Complete & Capture" button which allows entering actual litres delivered.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => setStatusMutation.mutate(selectedStatus)}
              disabled={setStatusMutation.isPending || selectedStatus === 'completed'}
            >
              {setStatusMutation.isPending ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete Order & Capture Payment</DialogTitle>
            <DialogDescription>
              Enter actual litres delivered to calculate final amount and capture payment
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {orderItems.length > 0 ? (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Actual Litres per Vehicle</Label>
                {orderItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {item.vehicle ? `${item.vehicle.year} ${item.vehicle.make} ${item.vehicle.model}` : 'Vehicle'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.fuelType} • Requested: {item.fuelAmount}L {item.fillToFull && '(Fill to full)'}
                      </p>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={itemActuals[item.id] || item.fuelAmount.toString()}
                        onChange={(e) => setItemActuals(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="text-right"
                        data-testid={`input-actual-litres-${item.id}`}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">L</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Actual Litres Delivered</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={actualLitres}
                    onChange={(e) => setActualLitres(e.target.value)}
                    className="text-right"
                    data-testid="input-actual-litres"
                  />
                  <span className="text-muted-foreground">L</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Requested: {order.fuelAmount}L {order.fillToFull && '(Fill to full)'}
                </p>
              </div>
            )}

            {(() => {
              const pricing = calculateFinalPricing();
              const difference = pricing.total - pricing.preAuthAmount;
              return (
                <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
                  <h4 className="font-medium text-sm">Payment Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Litres:</span>
                      <span>{pricing.totalLitres.toFixed(1)}L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span>${pricing.subtotalBeforeDiscount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivery Fee:</span>
                      <span>${pricing.deliveryFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST (5%):</span>
                      <span>${pricing.gst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-2 border-t">
                      <span>Final Total:</span>
                      <span>${pricing.total.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t mt-2 space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Pre-Authorized:</span>
                      <span>${pricing.preAuthAmount.toFixed(2)}</span>
                    </div>
                    <div className={`flex justify-between font-medium ${difference > 0 ? 'text-amber-600' : difference < 0 ? 'text-green-600' : ''}`}>
                      <span>Difference:</span>
                      <span>{difference > 0 ? '+' : ''}{difference !== 0 ? `$${difference.toFixed(2)}` : 'No change'}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {capturePaymentMutation.isError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {(capturePaymentMutation.error as Error)?.message || 'Failed to capture payment'}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompletionDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCapturePayment}
              disabled={capturePaymentMutation.isPending || calculateFinalPricing().totalLitres <= 0}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-capture-payment"
            >
              {capturePaymentMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Capture ${calculateFinalPricing().total.toFixed(2)} & Complete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
