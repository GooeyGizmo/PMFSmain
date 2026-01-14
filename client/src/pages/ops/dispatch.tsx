import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  Navigation, Phone, Mail, CheckCircle2, AlertCircle, Edit2,
  Gauge, DollarSign, TrendingUp, Timer
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { format, startOfDay, addDays, isToday, isTomorrow, addMinutes } from 'date-fns';
import { useRoutes, type RouteWithDetails } from '@/lib/api-hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// Helper to format route date (stored as midnight UTC representing Calgary calendar date)
// We format in UTC since the date is already normalized to represent the Calgary calendar day
const formatRouteDate = (date: Date | string): string => {
  const d = new Date(date);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Intl.DateTimeFormat('en-CA', options).format(d);
};

// Get short date for route circle badge (day number only)
const getRouteDateShort = (date: Date | string): string => {
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    day: 'numeric',
  }).format(d);
};

// ETA data for each waypoint
export interface ETAData {
  waypointIndex: number;
  distanceFromPrev: number; // km
  durationFromPrev: number; // minutes
  cumulativeDistance: number; // km from start
  cumulativeDuration: number; // minutes from start
  eta: Date; // estimated arrival time
}

// Component for road routing using OSRM (free OpenStreetMap routing)
function RoutingMachine({ 
  waypoints, 
  color = '#B87333',
  showInstructions = false,
  routeId = 'default'
}: { 
  waypoints: [number, number][]; 
  color?: string;
  showInstructions?: boolean;
  routeId?: string;
}) {
  const map = useMap();
  const routingControlRef = useRef<any>(null);
  const lastWaypointsKeyRef = useRef<string>('');

  // Memoize waypoints string to prevent unnecessary re-renders
  const waypointsKey = useMemo(() => 
    routeId + '|' + waypoints.map(wp => `${wp[0].toFixed(4)},${wp[1].toFixed(4)}`).join('|'),
    [waypoints, routeId]
  );

  useEffect(() => {
    if (!map || waypoints.length < 2) return;
    
    // Skip if waypoints haven't changed
    if (lastWaypointsKeyRef.current === waypointsKey && routingControlRef.current) {
      return;
    }
    lastWaypointsKeyRef.current = waypointsKey;

    // Clean up existing control first
    if (routingControlRef.current) {
      try {
        map.removeControl(routingControlRef.current);
      } catch (e) {
        // Ignore cleanup errors
      }
      routingControlRef.current = null;
    }

    // Using 'as any' to bypass TypeScript issues with leaflet-routing-machine types
    const routingControl = (L.Routing as any).control({
      waypoints: waypoints.map(wp => L.latLng(wp[0], wp[1])),
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: false,
      showAlternatives: false,
      show: showInstructions,
      lineOptions: {
        styles: [{ color, weight: 4, opacity: 0.8 }],
        extendToWaypoints: true,
        missingRouteTolerance: 0
      },
      createMarker: () => null, // Don't create default markers, we have our own
      router: (L.Routing as any).osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        profile: 'driving'
      })
    });

    routingControl.addTo(map);
    routingControlRef.current = routingControl;

    // Hide the routing control panel if not showing instructions
    if (!showInstructions) {
      setTimeout(() => {
        const containers = document.querySelectorAll('.leaflet-routing-container');
        containers.forEach(container => {
          (container as HTMLElement).style.display = 'none';
        });
      }, 100);
    }

    return () => {
      if (routingControlRef.current && map) {
        try {
          map.removeControl(routingControlRef.current);
        } catch (e) {
          // Ignore cleanup errors - control may already be removed
        }
        routingControlRef.current = null;
      }
    };
  }, [map, waypointsKey, color, showInstructions]);

  return null;
}

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
    html: `<div style="background-color: #d97706; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; border: 3px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4);">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

const createTruckMarker = () => {
  return L.divIcon({
    className: 'truck-marker',
    html: `<div style="background-color: #d97706; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.5);">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><path d="M15 18H9"/><circle cx="17" cy="18" r="2"/>
      </svg>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

const createNextStopMarker = (number: number) => {
  return L.divIcon({
    className: 'next-stop-marker',
    html: `<div style="background-color: #16a34a; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 13px; border: 3px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4); animation: gentle-pulse 3s ease-in-out infinite;">${number}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const CALGARY_CENTER: [number, number] = [51.0447, -114.0719];

const ROUTE_COLOR = '#2563eb'; // Blue for all routes
const NEXT_STOP_COLOR = '#16a34a'; // Green for next en_route stop
const TRUCK_COLOR = '#d97706'; // Amber/orange for truck

// Zoom to fit all markers when tracking starts or when there are multiple delivery stops
function ZoomToFitHandler({ 
  shouldZoom, 
  onZoomComplete, 
  positions,
  hasMultipleStops
}: { 
  shouldZoom: boolean; 
  onZoomComplete: () => void; 
  positions: [number, number][];
  hasMultipleStops: boolean;
}) {
  const map = useMap();
  const hasAutoFit = useRef(false);
  
  useEffect(() => {
    // Explicit zoom trigger (e.g., tracking started)
    if (shouldZoom && positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      onZoomComplete();
    }
  }, [shouldZoom, positions, map, onZoomComplete]);
  
  // Auto-fit only once when there are multiple delivery stops (not just depot)
  useEffect(() => {
    if (hasMultipleStops && positions.length >= 2 && !hasAutoFit.current) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      hasAutoFit.current = true;
    }
  }, [hasMultipleStops, positions, map]);
  
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

// Parse delivery window string to get start hour (e.g., "6:00 PM - 7:30 PM" -> 18)
const parseDeliveryWindowStartHour = (window: string): number => {
  const match = window.match(/(\d+):?(\d*)\s*(AM|PM)?/i);
  if (match) {
    let hour = parseInt(match[1]);
    const isPM = match[3]?.toUpperCase() === 'PM';
    const isAM = match[3]?.toUpperCase() === 'AM';
    if (isPM && hour !== 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    return hour;
  }
  return 8; // Default fallback
};

const generateEstimatedTimes = (orders: RouteWithDetails['orders']) => {
  // Find the earliest delivery window start time from all orders
  let earliestHour = 23;
  for (const order of orders) {
    if (order.deliveryWindow) {
      const windowStart = parseDeliveryWindowStartHour(order.deliveryWindow);
      if (windowStart < earliestHour) {
        earliestHour = windowStart;
      }
    }
  }
  // If no valid windows found, default to 8 AM
  if (earliestHour === 23) earliestHour = 8;
  
  const baseDate = new Date();
  baseDate.setHours(earliestHour, 0, 0, 0);
  
  return orders.map((order, index) => {
    const minutesPerStop = 15 + Math.floor(order.fuelAmount / 30) * 5;
    const arrivalTime = addMinutes(baseDate, index * (minutesPerStop + 10));
    return {
      ...order,
      estimatedTime: arrivalTime,
    };
  });
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
  
  const color = ROUTE_COLOR;
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
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: color }}
            >
              {getRouteDateShort(routeData.route.routeDate)}
            </div>
            <div>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                {formatRouteDate(routeData.route.routeDate)}
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
                          {order.deliveryWindow}
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
  const { routes: allRoutes, isLoading: allRoutesLoading, refetch: refetchAllRoutes } = useRoutes();
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('list');
  const [reassigning, setReassigning] = useState(false);
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<Date | null>(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [shouldZoomToFit, setShouldZoomToFit] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdminOrOwner = user?.role === 'admin' || user?.role === 'owner';

  // Geocoding mutation for orders with missing coordinates
  const geocodeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ops/geocode-orders', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to geocode orders');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Geocoding Complete',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      refetch();
    },
    onError: () => {
      toast({
        title: 'Geocoding Failed',
        description: 'Could not geocode order addresses.',
        variant: 'destructive',
      });
    },
  });

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

  // Fetch trucks for fuel economy data, fuel levels, and location
  const { data: trucksData } = useQuery<{ trucks: Array<{ 
    id: string; 
    unitNumber: string; 
    fuelEconomy: string | null;
    regularLevel: string;
    regularCapacity: string;
    premiumLevel: string;
    premiumCapacity: string;
    dieselLevel: string;
    dieselCapacity: string;
    lastLatitude: string | null;
    lastLongitude: string | null;
    lastLocationUpdate: string | null;
    assignedDriverId: string | null;
  }> }>({
    queryKey: ['/api/ops/fleet/trucks'],
  });

  // Fetch fuel pricing for cost calculations
  const { data: fuelPricingData } = useQuery<{ pricing: Array<{ fuelType: string; baseCost: string }> }>({
    queryKey: ['/api/fuel-pricing'],
  });

  // Calculate route metrics
  const routeMetrics = useMemo(() => {
    const totalDistanceKm = routes.reduce((sum, r) => sum + parseFloat(r.route.totalDistanceKm || '0'), 0);
    const avgStopDistanceKm = routes.length > 0 
      ? routes.reduce((sum, r) => sum + parseFloat(r.route.avgStopDistanceKm || '0'), 0) / routes.length 
      : 0;
    
    // Get average truck fuel economy (L/100km) - use 15 L/100km as default
    const trucks = trucksData?.trucks || [];
    const trucksWithEconomy = trucks.filter(t => t.fuelEconomy && parseFloat(t.fuelEconomy) > 0);
    const avgFuelEconomy = trucksWithEconomy.length > 0
      ? trucksWithEconomy.reduce((sum, t) => sum + parseFloat(t.fuelEconomy!), 0) / trucksWithEconomy.length
      : 15; // Default 15 L/100km for diesel trucks
    
    // Calculate fuel use: (distance / 100) * L/100km
    const estimatedFuelUse = (totalDistanceKm / 100) * avgFuelEconomy;
    
    // Get diesel cost per litre for fuel cost estimate (delivery trucks use diesel)
    const pricing = fuelPricingData?.pricing || [];
    const dieselPricing = pricing.find(p => p.fuelType === 'diesel');
    const dieselCostPerLitre = dieselPricing ? parseFloat(dieselPricing.baseCost) : 1.45;
    
    const estimatedFuelCost = estimatedFuelUse * dieselCostPerLitre;
    
    return {
      totalDistanceKm,
      avgStopDistanceKm,
      avgFuelEconomy,
      estimatedFuelUse,
      estimatedFuelCost,
    };
  }, [routes, trucksData, fuelPricingData]);

  // Throttle location updates to prevent excessive API calls
  const lastLocationUpdateRef = useRef<number>(0);
  const LOCATION_UPDATE_THROTTLE_MS = 5000; // Only update every 5 seconds

  // Driver location tracking using Geolocation API
  // skipThrottle=true for initial position, false for continuous updates
  const updateDriverLocationOnServer = useCallback(async (lat: number, lng: number, skipThrottle: boolean = false) => {
    // Validate coordinates before sending
    if (typeof lat !== 'number' || typeof lng !== 'number' || 
        isNaN(lat) || isNaN(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn('Invalid coordinates, skipping update:', { lat, lng });
      return;
    }
    
    // Throttle updates (unless skipping for initial position)
    if (!skipThrottle) {
      const now = Date.now();
      if (now - lastLocationUpdateRef.current < LOCATION_UPDATE_THROTTLE_MS) {
        return;
      }
      lastLocationUpdateRef.current = now;
    } else {
      // Reset throttle for initial update
      lastLocationUpdateRef.current = Date.now();
    }
    
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

  // Start tracking with proper error handling
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setTrackingError('Geolocation is not supported by your browser');
      toast({
        title: 'Location Not Supported',
        description: 'Your browser does not support location services.',
        variant: 'destructive',
      });
      return;
    }

    setTrackingLoading(true);
    setTrackingError(null);

    // First, get a single position to verify it works
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setDriverLocation([latitude, longitude]);
        setLastLocationUpdate(new Date());
        updateDriverLocationOnServer(latitude, longitude, true); // Skip throttle for initial position
        setTrackingEnabled(true);
        setTrackingLoading(false);
        setShouldZoomToFit(true);
        toast({
          title: 'Tracking Active',
          description: 'Your location is now being tracked on the map.',
        });
      },
      (error) => {
        setTrackingLoading(false);
        let errorMessage = 'Unable to get your location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please allow location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable. Try opening in a new browser tab.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            break;
        }
        setTrackingError(errorMessage);
        toast({
          title: 'Location Error',
          description: errorMessage,
          variant: 'destructive',
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [toast, updateDriverLocationOnServer]);

  // Continuous tracking when enabled
  useEffect(() => {
    if (!trackingEnabled || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setDriverLocation([latitude, longitude]);
        setLastLocationUpdate(new Date());
        updateDriverLocationOnServer(latitude, longitude);
      },
      (error) => {
        console.error('Geolocation watch error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          setTrackingEnabled(false);
          setTrackingError('Location permission was revoked');
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [trackingEnabled, updateDriverLocationOnServer]);

  const stopTracking = useCallback(() => {
    setTrackingEnabled(false);
    setDriverLocation(null);
    lastLocationUpdateRef.current = 0; // Reset throttle for next session
    toast({
      title: 'Tracking Stopped',
      description: 'Location tracking has been disabled.',
    });
  }, [toast]);
  
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
    { date: startOfDay(addDays(new Date(), 3)), label: format(addDays(new Date(), 3), 'EEE, MMM d') },
    { date: startOfDay(addDays(new Date(), 4)), label: format(addDays(new Date(), 4), 'EEE, MMM d') },
    { date: startOfDay(addDays(new Date(), 5)), label: format(addDays(new Date(), 5), 'EEE, MMM d') },
    { date: startOfDay(addDays(new Date(), 6)), label: format(addDays(new Date(), 6), 'EEE, MMM d') },
    { date: startOfDay(addDays(new Date(), 7)), label: format(addDays(new Date(), 7), 'EEE, MMM d') },
  ];
  
  const totalOrders = routes.reduce((sum, r) => sum + r.route.orderCount, 0);
  const totalLitres = routes.reduce((sum, r) => sum + r.route.totalLitres, 0);
  const completedOrders = routes.reduce((sum, r) => 
    sum + r.orders.filter(o => o.status === 'completed').length, 0
  );
  
  // Count orders missing coordinates
  const ordersWithoutCoords = routes.flatMap(r => r.orders).filter(o => !o.latitude || !o.longitude).length;
  
  const allPositions: [number, number][] = routes.flatMap((routeData) =>
    routeData.orders
      .filter(order => order.latitude && order.longitude)
      .map(order => [parseFloat(order.latitude!), parseFloat(order.longitude!)] as [number, number])
  );

  // Include depot in bounds if available
  const allPositionsWithDepot = depotCoords 
    ? [...allPositions, depotCoords]
    : allPositions;
    
  // All positions including driver location for zoom-to-fit
  const allPositionsForZoom = useMemo(() => {
    const positions: [number, number][] = [...allPositionsWithDepot];
    if (driverLocation) {
      positions.push(driverLocation);
    }
    // Add truck positions from trucksData
    const trucks = trucksData?.trucks || [];
    trucks.forEach(truck => {
      if (truck.lastLatitude && truck.lastLongitude) {
        positions.push([parseFloat(truck.lastLatitude), parseFloat(truck.lastLongitude)]);
      }
    });
    return positions;
  }, [allPositionsWithDepot, driverLocation, trucksData]);
  
  // Callback to reset zoom flag
  const handleZoomComplete = useCallback(() => {
    setShouldZoomToFit(false);
  }, []);
  
  const handleReassign = async () => {
    setReassigning(true);
    await reassignUnassigned();
    setReassigning(false);
  };

  return (
    <OpsLayout>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/ops">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-copper" />
              <span className="font-display font-bold text-foreground">Dispatch Management</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto max-w-[600px] pb-1">
            {dateOptions.map((opt) => (
              <Button
                key={opt.date.toISOString()}
                variant={selectedDate.toISOString() === opt.date.toISOString() ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDate(opt.date)}
                className="whitespace-nowrap flex-shrink-0"
                data-testid={`button-date-${opt.label.toLowerCase().replace(/[^a-z]/g, '-')}`}
              >
                <Calendar className="w-4 h-4 mr-1" />
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
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

        {/* Route Efficiency Metrics */}
        {routeMetrics.totalDistanceKm > 0 && (
          <Card className="mb-6" data-testid="route-efficiency-metrics">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-copper" />
                Route Efficiency Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Navigation className="w-4 h-4 text-blue-500" />
                  </div>
                  <p className="text-lg font-bold">{routeMetrics.totalDistanceKm.toFixed(1)} km</p>
                  <p className="text-xs text-muted-foreground">Total Distance</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <MapPin className="w-4 h-4 text-sage" />
                  </div>
                  <p className="text-lg font-bold">{routeMetrics.avgStopDistanceKm.toFixed(1)} km</p>
                  <p className="text-xs text-muted-foreground">Avg Stop Distance</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Gauge className="w-4 h-4 text-amber-500" />
                  </div>
                  <p className="text-lg font-bold">{routeMetrics.avgFuelEconomy.toFixed(1)} L/100km</p>
                  <p className="text-xs text-muted-foreground">Fuel Economy</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Fuel className="w-4 h-4 text-brass" />
                  </div>
                  <p className="text-lg font-bold">{routeMetrics.estimatedFuelUse.toFixed(1)} L</p>
                  <p className="text-xs text-muted-foreground">Est. Fuel Use</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <DollarSign className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-lg font-bold">${routeMetrics.estimatedFuelCost.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Est. Fuel Cost</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
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
              <Button variant="outline" size="sm" onClick={() => { refetch(); refetchAllRoutes(); }} data-testid="button-refresh">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
          
          <TabsContent value="list" className="space-y-4">
            {allRoutesLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-copper" />
              </div>
            ) : allRoutes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Truck className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="font-medium mb-1">No Routes Available</h3>
                  <p className="text-sm text-muted-foreground">
                    No delivery routes have been created yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              allRoutes.map((routeData, index) => (
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
            {ordersWithoutCoords > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-amber-700">
                    {ordersWithoutCoords} order{ordersWithoutCoords > 1 ? 's' : ''} missing map coordinates
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => geocodeMutation.mutate()}
                  disabled={geocodeMutation.isPending}
                  className="border-amber-500/50 text-amber-700 hover:bg-amber-500/20"
                  data-testid="button-geocode-orders"
                >
                  {geocodeMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4 mr-2" />
                  )}
                  {geocodeMutation.isPending ? 'Geocoding...' : 'Fix Locations'}
                </Button>
              </div>
            )}
            
            <div className="mb-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant={trackingEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={trackingEnabled ? stopTracking : startTracking}
                    disabled={trackingLoading}
                    className={trackingEnabled ? "bg-green-600 hover:bg-green-700" : ""}
                    data-testid="button-toggle-tracking"
                  >
                    {trackingLoading ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Navigation className={`w-4 h-4 mr-2 ${trackingEnabled ? 'animate-pulse' : ''}`} />
                    )}
                    {trackingLoading ? 'Getting Location...' : trackingEnabled ? 'Stop Tracking' : 'Start Tracking'}
                  </Button>
                  {driverLocation && (
                    <Badge variant="outline" className="text-xs border-green-500/50 text-green-700">
                      <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                      Live: {driverLocation[0].toFixed(4)}, {driverLocation[1].toFixed(4)}
                    </Badge>
                  )}
                </div>
              </div>
              {trackingError && (
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="text-sm text-red-700">{trackingError}</span>
                </div>
              )}
            </div>
            
            {/* ETA Summary Panel */}
            {(() => {
              const nextStopOrders = routes.flatMap(r => 
                r.orders.filter(o => o.latitude && o.longitude && o.status !== 'completed' && o.status !== 'cancelled')
              ).sort((a, b) => (a.routePosition || 99) - (b.routePosition || 99));
              const nextStop = nextStopOrders[0];
              
              if (nextStop) {
                const startPoint = driverLocation || depotCoords;
                let etaMinutes: number | null = null;
                let etaTime: Date | null = null;
                
                if (startPoint) {
                  const nextPos: [number, number] = [parseFloat(nextStop.latitude!), parseFloat(nextStop.longitude!)];
                  const R = 6371;
                  const dLat = (nextPos[0] - startPoint[0]) * Math.PI / 180;
                  const dLon = (nextPos[1] - startPoint[1]) * Math.PI / 180;
                  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                            Math.cos(startPoint[0] * Math.PI / 180) * Math.cos(nextPos[0] * Math.PI / 180) *
                            Math.sin(dLon/2) * Math.sin(dLon/2);
                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                  const distance = R * c * 1.3;
                  const avgSpeedKmH = 40;
                  etaMinutes = Math.round((distance / avgSpeedKmH) * 60);
                  etaTime = addMinutes(new Date(), etaMinutes);
                }
                
                if (etaTime) {
                  return (
                    <Card className="mb-4 border-green-500/30 bg-green-50/50" data-testid="eta-summary-panel">
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">
                              1
                            </div>
                            <div>
                              <h4 className="font-medium text-green-800">Next Stop: {nextStop.user?.name || 'Unknown'}</h4>
                              <p className="text-sm text-green-600">{nextStop.address}, {nextStop.city}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-2 text-lg font-bold text-green-700">
                              <Timer className="w-5 h-5" />
                              {etaMinutes} min
                            </div>
                            <p className="text-sm text-green-600">
                              ETA: {format(etaTime, 'h:mm a')}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
              }
              return null;
            })()}
            
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="h-[600px]">
                  <MapContainer
                    center={CALGARY_CENTER}
                    zoom={10}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    
                    {/* MapBoundsHandler removed - map stays at initial zoom level 10 showing Calgary */}
                    
                    <ZoomToFitHandler 
                      shouldZoom={shouldZoomToFit} 
                      onZoomComplete={handleZoomComplete}
                      positions={allPositionsForZoom}
                      hasMultipleStops={routes.flatMap(r => r.orders.filter(o => o.latitude && o.longitude && o.status !== 'completed' && o.status !== 'cancelled')).length > 0}
                    />
                    
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
                    
                    {(() => {
                      const DEADHEAD_COLOR = '#8b1a1a';
                      
                      const allIncompleteOrders = routes.flatMap(r => 
                        r.orders.filter(o => o.latitude && o.longitude && o.status !== 'completed' && o.status !== 'cancelled')
                      ).sort((a, b) => (a.routePosition || 99) - (b.routePosition || 99));
                      
                      const nextStopOrder = allIncompleteOrders[0];
                      const nextStopId = nextStopOrder?.id;
                      const lastStopOrder = allIncompleteOrders[allIncompleteOrders.length - 1];
                      
                      const calculateETA = (orderIndex: number): { etaTime: string | null; timeToArrive: number | null } => {
                        if (orderIndex < 0 || allIncompleteOrders.length === 0) return { etaTime: null, timeToArrive: null };
                        
                        const startPoint = driverLocation || depotCoords;
                        if (!startPoint) return { etaTime: null, timeToArrive: null };
                        
                        let totalDistance = 0;
                        let prevPoint = startPoint;
                        
                        for (let i = 0; i <= orderIndex; i++) {
                          const order = allIncompleteOrders[i];
                          const orderPos: [number, number] = [parseFloat(order.latitude!), parseFloat(order.longitude!)];
                          const R = 6371;
                          const dLat = (orderPos[0] - prevPoint[0]) * Math.PI / 180;
                          const dLon = (orderPos[1] - prevPoint[1]) * Math.PI / 180;
                          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                                    Math.cos(prevPoint[0] * Math.PI / 180) * Math.cos(orderPos[0] * Math.PI / 180) *
                                    Math.sin(dLon/2) * Math.sin(dLon/2);
                          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                          totalDistance += R * c * 1.3;
                          prevPoint = orderPos;
                        }
                        
                        const avgSpeedKmH = 40;
                        const stopTimeMin = 10;
                        const travelTimeMin = (totalDistance / avgSpeedKmH) * 60;
                        const totalTimeMin = travelTimeMin + (orderIndex * stopTimeMin);
                        const eta = addMinutes(new Date(), totalTimeMin);
                        
                        return {
                          etaTime: format(eta, 'h:mm a'),
                          timeToArrive: Math.round(totalTimeMin)
                        };
                      };
                      
                      // Render truck markers - admin/owner sees all trucks, others see only first truck
                      const allTrucks = trucksData?.trucks || [];
                      const trucksToShow = isAdminOrOwner ? allTrucks : allTrucks.slice(0, 1);
                      
                      // Helper to get fuel bar color based on percentage
                      const getFuelBarColor = (pct: number): string => {
                        if (pct <= 20) return 'bg-red-500';
                        if (pct <= 65) return 'bg-amber-500';
                        return 'bg-green-500';
                      };
                      
                      // Helper to render a truck popup
                      const renderTruckPopup = (
                        truck: typeof allTrucks[0], 
                        truckIndex: number, 
                        locationStatus: 'live' | 'last_known' | 'depot' = 'depot',
                        isMyTruck: boolean = false
                      ) => {
                        const fuelTypes = [
                          { key: 'regular', label: '87 Regular', level: parseFloat(truck.regularLevel) || 0, capacity: parseFloat(truck.regularCapacity) || 0 },
                          { key: 'premium', label: '91 Premium', level: parseFloat(truck.premiumLevel) || 0, capacity: parseFloat(truck.premiumCapacity) || 0 },
                          { key: 'diesel', label: 'Diesel', level: parseFloat(truck.dieselLevel) || 0, capacity: parseFloat(truck.dieselCapacity) || 0 },
                        ];
                        
                        // Find the route assigned to this truck (by matching driver/truck)
                        const assignedRoute = routes.find(r => r.route.truckId === truck.id);
                        const driverName = assignedRoute?.route?.driverName || 'Unassigned';
                        
                        // Calculate location status text and last known info
                        let locationText = 'At depot';
                        let lastKnownInfo = '';
                        
                        if (locationStatus === 'live' && lastLocationUpdate) {
                          const secondsAgo = Math.round((Date.now() - lastLocationUpdate.getTime()) / 1000);
                          locationText = `Live tracking - ${secondsAgo}s ago`;
                        } else if (locationStatus === 'last_known' && truck.lastLocationUpdate) {
                          // Truck is at last known location during business hours
                          const lastUpdate = new Date(truck.lastLocationUpdate);
                          const minutesAgo = Math.round((Date.now() - lastUpdate.getTime()) / 60000);
                          const timeText = minutesAgo < 60 
                            ? `${minutesAgo}m ago` 
                            : `${Math.round(minutesAgo / 60)}h ago`;
                          
                          locationText = `Last known location (${timeText})`;
                        } else {
                          locationText = 'At depot';
                        }
                        
                        return (
                          <div className="min-w-[200px]">
                            <h4 className="font-bold text-amber-600 text-base">Unit #{truck.unitNumber}</h4>
                            <p className="text-xs text-gray-600 mb-2">Driver: {driverName}</p>
                            <div className="space-y-2">
                              {fuelTypes.map(fuel => {
                                const pct = fuel.capacity > 0 ? Math.round((fuel.level / fuel.capacity) * 100) : 0;
                                const barColor = getFuelBarColor(pct);
                                return (
                                  <div key={fuel.key} className="text-xs">
                                    <div className="flex justify-between mb-0.5">
                                      <span className="text-gray-700 font-medium">{fuel.label}</span>
                                      <span className="text-gray-600">{Math.round(fuel.level)}L / {Math.round(fuel.capacity)}L</span>
                                    </div>
                                    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                                      <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <div className="text-right text-[10px] text-gray-500 mt-0.5">{pct}% full</div>
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t">
                              {locationText}
                            </p>
                          </div>
                        );
                      };
                      
                      return (
                        <>
                          {/* Truck markers */}
                          {trucksToShow.map((truck, truckIndex) => {
                            // Determine if this is the current user's truck
                            const isMyTruck = truck.assignedDriverId === user?.id;
                            let truckPosition: [number, number] | null = null;
                            let locationStatus: 'live' | 'last_known' | 'depot' = 'depot';
                            
                            // Check if it's off-hours (before 7am or after 6pm Calgary time)
                            const now = new Date();
                            const calgaryTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
                            const calgaryHour = calgaryTime.getHours();
                            const isOffHours = calgaryHour < 7 || calgaryHour >= 18;
                            
                            // Calculate fixed parking spot for this truck (15m from depot, arranged in a row)
                            // Each truck gets a unique parking spot based on its index
                            // Row is oriented east-west, 15m north of depot
                            const getParkingSpot = (index: number): [number, number] => {
                              if (!depotCoords) return CALGARY_CENTER;
                              const offsetNorthDeg = 0.000135; // ~15m north
                              const spacingEastWestDeg = 0.00008; // ~8m spacing between trucks
                              const totalTrucks = trucksToShow.length;
                              const startOffset = -((totalTrucks - 1) / 2) * spacingEastWestDeg;
                              return [
                                depotCoords[0] + offsetNorthDeg,
                                depotCoords[1] + startOffset + (index * spacingEastWestDeg)
                              ];
                            };
                            
                            if (isMyTruck && trackingEnabled && driverLocation) {
                              // My truck with active tracking - always use live GPS regardless of time
                              truckPosition = driverLocation;
                              locationStatus = 'live';
                            } else if (isOffHours || !truck.assignedDriverId) {
                              // Off-hours OR no driver assigned - show at parking spot
                              truckPosition = getParkingSpot(truckIndex);
                              locationStatus = 'depot';
                            } else if (truck.lastLatitude && truck.lastLongitude) {
                              // Business hours with driver, not tracking - use last known location
                              truckPosition = [parseFloat(truck.lastLatitude), parseFloat(truck.lastLongitude)];
                              locationStatus = 'last_known';
                            } else {
                              // No last known location, fallback to parking spot
                              truckPosition = getParkingSpot(truckIndex);
                              locationStatus = 'depot';
                            }
                            
                            if (!truckPosition) return null;
                            
                            return (
                              <Marker key={truck.id} position={truckPosition} icon={createTruckMarker()}>
                                <Popup>{renderTruckPopup(truck, truckIndex, locationStatus, isMyTruck)}</Popup>
                              </Marker>
                            );
                          })}
                          
                          {/* Route from driver to next stop */}
                          {driverLocation && nextStopOrder && (
                            <RoutingMachine
                              waypoints={[driverLocation, [parseFloat(nextStopOrder.latitude!), parseFloat(nextStopOrder.longitude!)]]}
                              color="#16a34a"
                              showInstructions={false}
                              routeId="driver-to-next"
                            />
                          )}
                          
                          {allIncompleteOrders.length >= 2 && (
                            <RoutingMachine
                              waypoints={allIncompleteOrders.map(order => 
                                [parseFloat(order.latitude!), parseFloat(order.longitude!)] as [number, number]
                              )}
                              color={ROUTE_COLOR}
                              showInstructions={false}
                              routeId="stops-route"
                            />
                          )}
                          
                          {lastStopOrder && depotCoords && (
                            <RoutingMachine
                              waypoints={[
                                [parseFloat(lastStopOrder.latitude!), parseFloat(lastStopOrder.longitude!)],
                                depotCoords
                              ]}
                              color={DEADHEAD_COLOR}
                              showInstructions={false}
                              routeId="deadhead-to-depot"
                            />
                          )}
                          
                          {allIncompleteOrders.map((order, orderIndex) => {
                            const position: [number, number] = [
                              parseFloat(order.latitude!), 
                              parseFloat(order.longitude!)
                            ];
                            
                            const isNextStop = order.id === nextStopId;
                            const isArriving = order.status === 'arriving';
                            
                            const { etaTime, timeToArrive } = calculateETA(orderIndex);
                            
                            // Use stored routePosition for stop number (persists even after other stops complete)
                            const stopNumber = order.routePosition || (orderIndex + 1);
                            
                            let markerIcon;
                            if (isNextStop) {
                              if (isArriving) {
                                markerIcon = createColoredMarker(TRUCK_COLOR, stopNumber);
                              } else {
                                markerIcon = createNextStopMarker(stopNumber);
                              }
                            } else {
                              markerIcon = createColoredMarker(ROUTE_COLOR, stopNumber);
                            }
                            
                            return (
                              <Marker
                                key={order.id}
                                position={position}
                                icon={markerIcon}
                              >
                                <Popup>
                                  <div className="min-w-[200px]">
                                    <h4 className="font-medium">{order.user?.name || 'Unknown'}</h4>
                                    <p className="text-sm text-gray-600">{order.address}</p>
                                    <p className="text-sm mt-1">
                                      <strong>{order.fuelAmount}L</strong> {order.fuelType}
                                    </p>
                                    <p className="text-sm">Window: {order.deliveryWindow}</p>
                                    {etaTime && (
                                      <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                                        <div className="flex items-center gap-1 font-medium text-blue-700">
                                          <Timer className="w-3 h-3" />
                                          ETA: {etaTime}
                                        </div>
                                        {timeToArrive !== null && (
                                          <p className="text-xs text-blue-600 mt-0.5">
                                            ~{timeToArrive} min from now
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    <Badge className={`mt-2 ${getStatusColor(order.status)}`}>
                                      {order.status}
                                    </Badge>
                                  </div>
                                </Popup>
                              </Marker>
                            );
                          })}
                        </>
                      );
                    })()}
                  </MapContainer>
                </div>
              </CardContent>
            </Card>
            
            <div className="mt-4 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: TRUCK_COLOR }} />
                <span className="text-sm">Depot</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 rounded" style={{ backgroundColor: '#16a34a' }} />
                <span className="text-sm">To Next Stop</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 rounded" style={{ backgroundColor: ROUTE_COLOR }} />
                <span className="text-sm">Route</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 rounded" style={{ backgroundColor: '#8b1a1a' }} />
                <span className="text-sm">Deadhead (Return)</span>
              </div>
              {driverLocation && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: NEXT_STOP_COLOR }} />
                  <span className="text-sm">Next Stop</span>
                </div>
              )}
            </div>
            
            {/* Export Route Buttons */}
            {(() => {
              const allOrders = routes.flatMap(r => 
                r.orders.filter(o => o.latitude && o.longitude && o.status !== 'completed' && o.status !== 'cancelled')
              ).sort((a, b) => (a.routePosition || 99) - (b.routePosition || 99));
              
              if (allOrders.length === 0) return null;
              
              const addresses = allOrders.map(o => encodeURIComponent(`${o.address}, ${o.city}`));
              const coords = allOrders.map(o => ({ lat: o.latitude!, lng: o.longitude! }));
              
              const openGoogleMaps = () => {
                const origin = driverLocation 
                  ? `${driverLocation[0]},${driverLocation[1]}`
                  : depotCoords ? `${depotCoords[0]},${depotCoords[1]}` : addresses[0];
                const destination = addresses[addresses.length - 1];
                const waypoints = addresses.slice(0, -1).join('|');
                const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}&travelmode=driving`;
                window.open(url, '_blank');
              };
              
              const openWaze = () => {
                const firstStop = coords[0];
                const url = `https://waze.com/ul?ll=${firstStop.lat},${firstStop.lng}&navigate=yes`;
                window.open(url, '_blank');
              };
              
              const openAppleMaps = () => {
                const origin = driverLocation 
                  ? `${driverLocation[0]},${driverLocation[1]}`
                  : depotCoords ? `${depotCoords[0]},${depotCoords[1]}` : '';
                const destination = `${coords[coords.length - 1].lat},${coords[coords.length - 1].lng}`;
                const waypoints = coords.slice(0, -1).map(c => `${c.lat},${c.lng}`).join('/');
                const url = origin 
                  ? `https://maps.apple.com/?saddr=${origin}&daddr=${waypoints}/${destination}&dirflg=d`
                  : `https://maps.apple.com/?daddr=${destination}&dirflg=d`;
                window.open(url, '_blank');
              };
              
              return (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm font-medium">Export Route:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openGoogleMaps}
                    data-testid="button-export-google-maps"
                  >
                    <MapPin className="w-4 h-4 mr-1" />
                    Google Maps
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openWaze}
                    data-testid="button-export-waze"
                  >
                    <Navigation className="w-4 h-4 mr-1" />
                    Waze
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openAppleMaps}
                    data-testid="button-export-apple-maps"
                  >
                    <MapPin className="w-4 h-4 mr-1" />
                    Apple Maps
                  </Button>
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>
      </main>
    </OpsLayout>
  );
}
