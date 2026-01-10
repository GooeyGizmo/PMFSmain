import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, Truck, MapPin, Clock, Users, Fuel, 
  ChevronRight, ChevronDown, Calendar, Zap, RefreshCw,
  Navigation, Phone, Mail, CheckCircle2, AlertCircle, Edit2
} from 'lucide-react';
import { format, startOfDay, addDays, isToday, isTomorrow, addMinutes } from 'date-fns';
import { useRoutes, type RouteWithDetails } from '@/lib/api-hooks';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

const createColoredMarker = (color: string, number: number) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

const createDepotMarker = () => {
  return L.divIcon({
    className: 'depot-marker',
    html: `<div style="background-color: #1e40af; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; border: 3px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4);">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 22h18"/><path d="M6 18v-7"/><path d="M18 18v-7"/><path d="M6 11h12"/><path d="M12 11V6l-3 5"/><path d="M12 6l3 5"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

const createTruckMarker = () => {
  return L.divIcon({
    className: 'truck-marker',
    html: `<div style="background-color: #16a34a; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.5); animation: pulse 2s infinite;">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><path d="M15 18H9"/><circle cx="17" cy="18" r="2"/>
      </svg>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

const CALGARY_CENTER: [number, number] = [51.0447, -114.0719];

const ROUTE_COLORS = [
  '#B87333', // copper
  '#C5944E', // brass
  '#87907D', // sage
  '#8B7355', // brown
  '#4A90A4', // blue
];

function MapBoundsHandler({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  
  useMemo(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [positions, map]);
  
  return null;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'confirmed': return 'bg-blue-500/10 text-blue-600';
    case 'en_route': return 'bg-amber-500/10 text-amber-600';
    case 'arriving': return 'bg-orange-500/10 text-orange-600';
    case 'fueling': return 'bg-purple-500/10 text-purple-600';
    case 'completed': return 'bg-green-500/10 text-green-600';
    case 'cancelled': return 'bg-red-500/10 text-red-600';
    case 'scheduled': return 'bg-muted text-muted-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getTierBadge = (tier: string) => {
  switch (tier) {
    case 'rural': return 'bg-copper/20 text-copper';
    case 'household': return 'bg-brass/20 text-brass';
    case 'access': return 'bg-sage/20 text-sage';
    default: return 'bg-muted text-muted-foreground';
  }
};

const generateEstimatedTimes = (orders: RouteWithDetails['orders'], startHour: number = 8) => {
  const baseDate = new Date();
  baseDate.setHours(startHour, 0, 0, 0);
  
  return orders.map((order, index) => {
    const minutesPerStop = 15 + Math.floor(order.fuelAmount / 30) * 5;
    const arrivalTime = addMinutes(baseDate, index * (minutesPerStop + 10));
    return {
      ...order,
      estimatedTime: arrivalTime,
    };
  });
};

const mockCoordinates = (index: number, routeIndex: number): [number, number] => {
  const baseOffset = routeIndex * 0.02;
  const offsets: [number, number][] = [
    [0.01, 0.02], [0.02, -0.01], [-0.01, 0.03], [0.03, 0.01],
    [-0.02, -0.02], [0.015, 0.025], [-0.025, 0.01], [0.008, -0.015],
  ];
  const offset = offsets[index % offsets.length];
  return [
    CALGARY_CENTER[0] + offset[0] + baseOffset,
    CALGARY_CENTER[1] + offset[1] - baseOffset,
  ];
};

interface RouteCardProps {
  routeData: RouteWithDetails;
  routeIndex: number;
  expanded: boolean;
  onToggle: () => void;
  onOptimize: (routeId: string) => Promise<any>;
  onUpdateDriver: (routeId: string, name: string) => Promise<any>;
}

function RouteCard({ routeData, routeIndex, expanded, onToggle, onOptimize, onUpdateDriver }: RouteCardProps) {
  const [editingDriver, setEditingDriver] = useState(false);
  const [driverName, setDriverName] = useState(routeData.route.driverName || '');
  const [optimizing, setOptimizing] = useState(false);
  
  const ordersWithTimes = generateEstimatedTimes(
    routeData.orders.sort((a, b) => (a.routePosition || 99) - (b.routePosition || 99))
  );
  
  const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
  const completedCount = routeData.orders.filter(o => o.status === 'completed').length;
  const progress = routeData.orders.length > 0 
    ? Math.round((completedCount / routeData.orders.length) * 100) 
    : 0;
  
  const handleOptimize = async () => {
    setOptimizing(true);
    await onOptimize(routeData.route.id);
    setOptimizing(false);
  };
  
  const handleSaveDriver = async () => {
    await onUpdateDriver(routeData.route.id, driverName);
    setEditingDriver(false);
  };

  return (
    <Card className="overflow-hidden" data-testid={`card-route-${routeData.route.routeNumber}`}>
      <CardHeader 
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: color }}
            >
              {routeData.route.routeNumber}
            </div>
            <div>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                Route {routeData.route.routeNumber}
                {routeData.route.isOptimized && (
                  <Badge variant="outline" className="text-xs border-sage/50 text-sage">
                    <Zap className="w-3 h-3 mr-1" />
                    Optimized
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                {editingDriver ? (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Input 
                      value={driverName}
                      onChange={e => setDriverName(e.target.value)}
                      placeholder="Driver name"
                      className="h-7 w-40 text-xs"
                      data-testid={`input-driver-${routeData.route.routeNumber}`}
                    />
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 px-2"
                      onClick={handleSaveDriver}
                      data-testid={`button-save-driver-${routeData.route.routeNumber}`}
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <>
                    <Users className="w-3.5 h-3.5" />
                    <span>{routeData.route.driverName || 'Unassigned'}</span>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-5 w-5 p-0"
                      onClick={(e) => { e.stopPropagation(); setEditingDriver(true); }}
                      data-testid={`button-edit-driver-${routeData.route.routeNumber}`}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">{routeData.route.orderCount} stops</div>
              <div className="text-xs text-muted-foreground">{routeData.route.totalLitres}L total</div>
            </div>
            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-500"
                style={{ width: `${progress}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8">{progress}%</span>
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </div>
        </div>
      </CardHeader>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="border-t">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium">Stop Sequence</h4>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleOptimize}
                  disabled={optimizing}
                  data-testid={`button-optimize-${routeData.route.routeNumber}`}
                >
                  {optimizing ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Optimize Route
                </Button>
              </div>
              
              <div className="space-y-3">
                {ordersWithTimes.map((order, index) => (
                  <div 
                    key={order.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    data-testid={`stop-${order.id}`}
                  >
                    <div 
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {index + 1}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">
                          {order.user?.name || 'Unknown Customer'}
                        </span>
                        {order.user?.subscriptionTier && (
                          <Badge className={`text-xs ${getTierBadge(order.user.subscriptionTier)}`}>
                            {order.user.subscriptionTier.toUpperCase()}
                          </Badge>
                        )}
                        <Badge className={`text-xs ${getStatusColor(order.status)}`}>
                          {order.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{order.address}, {order.city}</span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-copper" />
                          {format(order.estimatedTime, 'h:mm a')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Fuel className="w-3 h-3 text-sage" />
                          {order.fuelAmount}L {order.fuelType}
                        </span>
                        {order.vehicle && (
                          <span className="text-muted-foreground">
                            {order.vehicle.year} {order.vehicle.make} {order.vehicle.model}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Navigation className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Phone className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {ordersWithTimes.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No stops assigned to this route</p>
                  </div>
                )}
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default function OpsDispatch() {
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const { routes, isLoading, optimizeRoute, updateRouteDriver, reassignUnassigned, refetch } = useRoutes(selectedDate);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('list');
  const [reassigning, setReassigning] = useState(false);
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  // Fetch depot coordinates (ops only)
  const { data: depotData } = useQuery({
    queryKey: ['/api/ops/depot'],
    queryFn: async () => {
      const res = await fetch('/api/ops/depot', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
  });
  const depotCoords: [number, number] | null = depotData?.depot 
    ? [depotData.depot.lat, depotData.depot.lng] 
    : null;

  // Driver location tracking using Geolocation API
  const updateDriverLocationOnServer = useCallback(async (lat: number, lng: number) => {
    try {
      await fetch('/api/ops/driver-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lat, lng }),
      });
    } catch (error) {
      console.error('Failed to update driver location:', error);
    }
  }, []);

  useEffect(() => {
    if (!trackingEnabled || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setDriverLocation([latitude, longitude]);
        updateDriverLocationOnServer(latitude, longitude);
      },
      (error) => {
        console.error('Geolocation error:', error);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [trackingEnabled, updateDriverLocationOnServer]);
  
  const toggleRoute = (routeId: string) => {
    setExpandedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) {
        next.delete(routeId);
      } else {
        next.add(routeId);
      }
      return next;
    });
  };
  
  const dateOptions = [
    { date: startOfDay(new Date()), label: 'Today' },
    { date: startOfDay(addDays(new Date(), 1)), label: 'Tomorrow' },
    { date: startOfDay(addDays(new Date(), 2)), label: format(addDays(new Date(), 2), 'EEE, MMM d') },
  ];
  
  const totalOrders = routes.reduce((sum, r) => sum + r.route.orderCount, 0);
  const totalLitres = routes.reduce((sum, r) => sum + r.route.totalLitres, 0);
  const completedOrders = routes.reduce((sum, r) => 
    sum + r.orders.filter(o => o.status === 'completed').length, 0
  );
  
  const allPositions: [number, number][] = routes.flatMap((routeData, routeIndex) =>
    routeData.orders.map((order, orderIndex) => {
      if (order.latitude && order.longitude) {
        return [parseFloat(order.latitude), parseFloat(order.longitude)] as [number, number];
      }
      return mockCoordinates(orderIndex, routeIndex);
    })
  );

  // Include depot in bounds if available
  const allPositionsWithDepot = depotCoords 
    ? [...allPositions, depotCoords]
    : allPositions;
  
  const handleReassign = async () => {
    setReassigning(true);
    await reassignUnassigned();
    setReassigning(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/ops">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-copper" />
                <span className="font-display font-bold text-foreground">Driver Dispatch</span>
                <Badge variant="outline" className="text-xs border-copper/30 text-copper">Operations</Badge>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {dateOptions.map((opt) => (
                <Button
                  key={opt.date.toISOString()}
                  variant={selectedDate.toISOString() === opt.date.toISOString() ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDate(opt.date)}
                  data-testid={`button-date-${opt.label.toLowerCase().replace(/[^a-z]/g, '-')}`}
                >
                  <Calendar className="w-4 h-4 mr-1" />
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card data-testid="stat-routes">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-copper/10 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-copper" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{routes.length}</p>
                  <p className="text-xs text-muted-foreground">Active Routes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="stat-stops">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sage/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-sage" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalOrders}</p>
                  <p className="text-xs text-muted-foreground">Total Stops</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="stat-fuel">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brass/10 flex items-center justify-center">
                  <Fuel className="w-5 h-5 text-brass" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalLitres}L</p>
                  <p className="text-xs text-muted-foreground">Total Fuel</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="stat-completed">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{completedOrders}/{totalOrders}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="list" data-testid="tab-list">
                <Users className="w-4 h-4 mr-2" />
                Route List
              </TabsTrigger>
              <TabsTrigger value="map" data-testid="tab-map">
                <MapPin className="w-4 h-4 mr-2" />
                Map View
              </TabsTrigger>
            </TabsList>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleReassign}
                disabled={reassigning}
                data-testid="button-reassign"
              >
                {reassigning ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Reassign Unassigned
              </Button>
              <Button variant="outline" size="sm" onClick={refetch} data-testid="button-refresh">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
          
          <TabsContent value="list" className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-copper" />
              </div>
            ) : routes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Truck className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="font-medium mb-1">No Routes for This Date</h3>
                  <p className="text-sm text-muted-foreground">
                    {isToday(selectedDate) 
                      ? "No deliveries are scheduled for today."
                      : `No deliveries scheduled for ${format(selectedDate, 'MMMM d, yyyy')}.`
                    }
                  </p>
                </CardContent>
              </Card>
            ) : (
              routes.map((routeData, index) => (
                <RouteCard
                  key={routeData.route.id}
                  routeData={routeData}
                  routeIndex={index}
                  expanded={expandedRoutes.has(routeData.route.id)}
                  onToggle={() => toggleRoute(routeData.route.id)}
                  onOptimize={optimizeRoute}
                  onUpdateDriver={updateRouteDriver}
                />
              ))
            )}
          </TabsContent>
          
          <TabsContent value="map">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant={trackingEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTrackingEnabled(!trackingEnabled)}
                  className={trackingEnabled ? "bg-green-600 hover:bg-green-700" : ""}
                  data-testid="button-toggle-tracking"
                >
                  <Navigation className={`w-4 h-4 mr-2 ${trackingEnabled ? 'animate-pulse' : ''}`} />
                  {trackingEnabled ? 'Tracking Active' : 'Start Tracking'}
                </Button>
                {driverLocation && (
                  <span className="text-xs text-muted-foreground">
                    Location: {driverLocation[0].toFixed(4)}, {driverLocation[1].toFixed(4)}
                  </span>
                )}
              </div>
            </div>
            
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="h-[600px]">
                  <MapContainer
                    center={CALGARY_CENTER}
                    zoom={11}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    
                    {allPositionsWithDepot.length > 0 && <MapBoundsHandler positions={allPositionsWithDepot} />}
                    
                    {depotCoords && (
                      <Marker position={depotCoords} icon={createDepotMarker()}>
                        <Popup>
                          <div className="min-w-[150px]">
                            <h4 className="font-bold text-blue-800">Fuel Depot</h4>
                            <p className="text-sm text-gray-600">Route starting point</p>
                          </div>
                        </Popup>
                      </Marker>
                    )}
                    
                    {driverLocation && (
                      <Marker position={driverLocation} icon={createTruckMarker()}>
                        <Popup>
                          <div className="min-w-[150px]">
                            <h4 className="font-bold text-green-700">Your Location</h4>
                            <p className="text-sm text-gray-600">Live tracking active</p>
                          </div>
                        </Popup>
                      </Marker>
                    )}
                    
                    {routes.map((routeData, routeIndex) => {
                      const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
                      const sortedOrders = [...routeData.orders].sort(
                        (a, b) => (a.routePosition || 99) - (b.routePosition || 99)
                      );
                      
                      const positions: [number, number][] = sortedOrders.map((order, orderIndex) => {
                        if (order.latitude && order.longitude) {
                          return [parseFloat(order.latitude), parseFloat(order.longitude)];
                        }
                        return mockCoordinates(orderIndex, routeIndex);
                      });
                      
                      return (
                        <div key={routeData.route.id}>
                          <Polyline
                            positions={positions}
                            color={color}
                            weight={3}
                            opacity={0.7}
                          />
                          
                          {sortedOrders.map((order, orderIndex) => {
                            const position: [number, number] = order.latitude && order.longitude
                              ? [parseFloat(order.latitude), parseFloat(order.longitude)]
                              : mockCoordinates(orderIndex, routeIndex);
                            
                            return (
                              <Marker
                                key={order.id}
                                position={position}
                                icon={createColoredMarker(color, orderIndex + 1)}
                              >
                                <Popup>
                                  <div className="min-w-[200px]">
                                    <h4 className="font-medium">{order.user?.name || 'Unknown'}</h4>
                                    <p className="text-sm text-gray-600">{order.address}</p>
                                    <p className="text-sm mt-1">
                                      <strong>{order.fuelAmount}L</strong> {order.fuelType}
                                    </p>
                                    <p className="text-sm">Window: {order.deliveryWindow}</p>
                                    <Badge className={`mt-2 ${getStatusColor(order.status)}`}>
                                      {order.status}
                                    </Badge>
                                  </div>
                                </Popup>
                              </Marker>
                            );
                          })}
                        </div>
                      );
                    })}
                  </MapContainer>
                </div>
              </CardContent>
            </Card>
            
            <div className="mt-4 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-800" />
                <span className="text-sm">Depot</span>
              </div>
              {driverLocation && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-600" />
                  <span className="text-sm">Your Location</span>
                </div>
              )}
              {routes.map((routeData, index) => (
                <div key={routeData.route.id} className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }}
                  />
                  <span className="text-sm">
                    Route {routeData.route.routeNumber} ({routeData.route.driverName || 'Unassigned'})
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
