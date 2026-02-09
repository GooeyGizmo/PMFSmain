import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Truck, MapPin, Clock, Fuel, ArrowLeft,
  ChevronRight, ChevronDown, Calendar, Zap, RefreshCw,
  Navigation, Phone, CheckCircle2, AlertCircle, Play,
  Timer, DollarSign, ChevronLeft, CheckCircle, X, MoreVertical, Unlock
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { WeatherBadge } from '@/components/weather-badge';
import { format, startOfDay, addDays, addMinutes } from 'date-fns';
import { useRoutes, type RouteWithDetails } from '@/lib/api-hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { apiRequest } from '@/lib/queryClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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
  vip: 'VIP',
};

const formatRouteDate = (date: Date | string): string => {
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(d);
};

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

  const waypointsKey = useMemo(() => 
    routeId + '|' + waypoints.map(wp => `${wp[0].toFixed(4)},${wp[1].toFixed(4)}`).join('|'),
    [waypoints, routeId]
  );

  useEffect(() => {
    if (!map || waypoints.length < 2) return;
    
    if (lastWaypointsKeyRef.current === waypointsKey && routingControlRef.current) {
      return;
    }
    lastWaypointsKeyRef.current = waypointsKey;

    if (routingControlRef.current) {
      try {
        map.removeControl(routingControlRef.current);
      } catch (e) {}
      routingControlRef.current = null;
    }

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
      createMarker: () => null,
      router: (L.Routing as any).osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        profile: 'driving'
      })
    });

    routingControl.addTo(map);
    routingControlRef.current = routingControl;

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
        } catch (e) {}
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

const createTruckMarker = (isCurrentUser: boolean = false) => {
  const bgColor = isCurrentUser ? '#16a34a' : '#d97706';
  return L.divIcon({
    className: 'truck-marker',
    html: `<div style="background-color: ${bgColor}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.5);">
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
const ROUTE_COLOR = '#2563eb';
const NEXT_STOP_COLOR = '#16a34a';

function MapBoundsHandler({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const hasFitBounds = useRef(false);
  
  useEffect(() => {
    if (positions.length > 0 && !hasFitBounds.current) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
      hasFitBounds.current = true;
    }
  }, [positions, map]);
  
  return null;
}

const getNextStatus = (currentStatus: string): string | null => {
  const currentIndex = STATUS_FLOW.indexOf(currentStatus);
  if (currentIndex === -1 || currentIndex >= STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[currentIndex + 1];
};

export default function DeliveryConsole() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isOwner = user?.role === 'owner';
  const isAdminOrOwner = user?.role === 'admin' || user?.role === 'owner';
  
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<Date | null>(null);
  
  const { routes, isLoading, optimizeRoute, refetch } = useRoutes(selectedDate);
  
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

  const { data: trucksData } = useQuery<{ trucks: Array<{ 
    id: string; 
    unitNumber: string; 
    name: string | null;
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
    assignedDriverName: string | null;
  }> }>({
    queryKey: ['/api/ops/fleet/trucks'],
  });

  const updateLocationMutation = useMutation({
    mutationFn: async ({ lat, lng }: { lat: number; lng: number }) => {
      const res = await fetch('/api/ops/driver-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
      if (!res.ok) throw new Error('Failed to update location');
      return res.json();
    },
  });

  const updateDriverLocationOnServer = useCallback((lat: number, lng: number) => {
    updateLocationMutation.mutate({ lat, lng });
  }, [updateLocationMutation]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: 'Error', description: 'Geolocation not supported', variant: 'destructive' });
      return;
    }
    setTrackingLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setDriverLocation([latitude, longitude]);
        setLastLocationUpdate(new Date());
        setTrackingEnabled(true);
        setTrackingLoading(false);
        updateDriverLocationOnServer(latitude, longitude);
        toast({ title: 'Tracking Active', description: 'Your location is now being tracked.' });
      },
      (error) => {
        setTrackingLoading(false);
        toast({ title: 'Location Error', description: 'Unable to get your location', variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [toast, updateDriverLocationOnServer]);

  useEffect(() => {
    if (!trackingEnabled || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setDriverLocation([latitude, longitude]);
        setLastLocationUpdate(new Date());
        updateDriverLocationOnServer(latitude, longitude);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [trackingEnabled, updateDriverLocationOnServer]);

  const stopTracking = useCallback(() => {
    setTrackingEnabled(false);
    setDriverLocation(null);
    toast({ title: 'Tracking Stopped' });
  }, [toast]);

  const filteredRoutes = useMemo(() => {
    if (isOwner) {
      const ownerRoutes = routes.filter(r => r.route.driverId === user?.id);
      const otherRoutes = routes.filter(r => r.route.driverId !== user?.id);
      return [...ownerRoutes, ...otherRoutes];
    }
    return routes.filter(r => r.route.driverId === user?.id || !r.route.driverId);
  }, [routes, user?.id, isOwner]);

  useEffect(() => {
    if (filteredRoutes.length > 0 && !selectedRouteId) {
      setSelectedRouteId(filteredRoutes[0].route.id);
    }
  }, [filteredRoutes, selectedRouteId]);

  const selectedRoute = filteredRoutes.find(r => r.route.id === selectedRouteId);
  
  const ordersForSelectedRoute = useMemo(() => {
    if (!selectedRoute) return [];
    return [...selectedRoute.orders].sort((a, b) => (a.routePosition || 99) - (b.routePosition || 99));
  }, [selectedRoute]);

  const incompleteOrders = ordersForSelectedRoute.filter(o => 
    o.status !== 'completed' && o.status !== 'cancelled'
  );

  const allPositions: [number, number][] = useMemo(() => {
    const positions: [number, number][] = [];
    ordersForSelectedRoute.forEach(o => {
      if (o.latitude && o.longitude) {
        positions.push([parseFloat(o.latitude), parseFloat(o.longitude)]);
      }
    });
    if (depotCoords) positions.push(depotCoords);
    if (driverLocation) positions.push(driverLocation);
    return positions;
  }, [ordersForSelectedRoute, depotCoords, driverLocation]);

  const allTrucks = trucksData?.trucks || [];
  const trucksToShow = isAdminOrOwner ? allTrucks : allTrucks.filter(t => t.assignedDriverId === user?.id);

  const dateOptions = [
    { date: startOfDay(new Date()), label: 'Today' },
    { date: startOfDay(addDays(new Date(), 1)), label: 'Tomorrow' },
    { date: startOfDay(addDays(new Date(), 2)), label: format(addDays(new Date(), 2), 'EEE') },
  ];

  return (
    <OpsLayout>
      <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)]">
        <div className="w-full lg:w-[420px] xl:w-[480px] flex-shrink-0 border-r flex flex-col bg-background">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link href="/ops">
                  <Button variant="ghost" size="icon" data-testid="button-back">
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                </Link>
                <h1 className="font-display font-bold text-lg flex items-center gap-2">
                  <Truck className="w-5 h-5 text-copper" />
                  Delivery Console
                </h1>
              </div>
              <Button variant="ghost" size="icon" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex gap-1">
              {dateOptions.map((opt) => (
                <Button
                  key={opt.date.toISOString()}
                  variant={selectedDate.toISOString() === opt.date.toISOString() ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDate(opt.date)}
                  className="flex-1"
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            {filteredRoutes.length > 1 && (
              <Select value={selectedRouteId || ''} onValueChange={setSelectedRouteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select route" />
                </SelectTrigger>
                <SelectContent>
                  {filteredRoutes.map((r) => (
                    <SelectItem key={r.route.id} value={r.route.id}>
                      {formatRouteDate(r.route.routeDate)} - {r.route.driverName || 'Unassigned'} ({r.route.orderCount} stops)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedRoute && (
            <div className="p-3 border-b bg-muted/30">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <span className="font-medium">{selectedRoute.route.orderCount} stops</span>
                  <span className="text-muted-foreground">{selectedRoute.route.totalLitres}L</span>
                </div>
                <Badge variant="outline" className={selectedRoute.route.isOptimized ? 'border-green-500 text-green-600' : ''}>
                  {selectedRoute.route.isOptimized ? <><Zap className="w-3 h-3 mr-1" />Optimized</> : 'Not optimized'}
                </Badge>
              </div>
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-copper" />
                </div>
              ) : ordersForSelectedRoute.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No stops for this route</p>
                </div>
              ) : (
                ordersForSelectedRoute.map((order, index) => (
                  <OrderStopCard 
                    key={order.id} 
                    order={order} 
                    position={order.routePosition || index + 1}
                    isNext={incompleteOrders[0]?.id === order.id}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col min-h-[400px] lg:min-h-0">
          <div className="p-3 border-b flex items-center justify-between bg-background">
            <div className="flex items-center gap-2">
              <Button
                variant={trackingEnabled ? "default" : "outline"}
                size="sm"
                onClick={trackingEnabled ? stopTracking : startTracking}
                disabled={trackingLoading}
                className={trackingEnabled ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {trackingLoading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Navigation className={`w-4 h-4 mr-2 ${trackingEnabled ? 'animate-pulse' : ''}`} />
                )}
                {trackingLoading ? 'Locating...' : trackingEnabled ? 'Stop Tracking' : 'Start Tracking'}
              </Button>
              {driverLocation && (
                <Badge variant="outline" className="text-xs border-green-500/50 text-green-700">
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                  Live
                </Badge>
              )}
            </div>
            
            {incompleteOrders[0] && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Next:</span>
                <span className="font-medium">{incompleteOrders[0].user?.name}</span>
              </div>
            )}
          </div>

          <div className="flex-1 relative">
            <MapContainer
              center={CALGARY_CENTER}
              zoom={11}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {allPositions.length > 0 && <MapBoundsHandler positions={allPositions} />}
              
              {depotCoords && (
                <Marker position={depotCoords} icon={createDepotMarker()}>
                  <Popup>
                    <div className="min-w-[150px]">
                      <h4 className="font-bold text-amber-800">Fuel Depot</h4>
                      <p className="text-sm text-gray-600">Route starting point</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {trucksToShow.map((truck) => {
                const isMyTruck = truck.assignedDriverId === user?.id;
                let truckPosition: [number, number] | null = null;
                
                if (isMyTruck && trackingEnabled && driverLocation) {
                  truckPosition = driverLocation;
                } else if (truck.lastLatitude && truck.lastLongitude) {
                  truckPosition = [parseFloat(truck.lastLatitude), parseFloat(truck.lastLongitude)];
                } else if (depotCoords) {
                  const angle = Math.random() * 2 * Math.PI;
                  const offsetDeg = 0.0001;
                  truckPosition = [
                    depotCoords[0] + offsetDeg * Math.cos(angle),
                    depotCoords[1] + offsetDeg * Math.sin(angle)
                  ];
                }
                
                if (!truckPosition) return null;
                
                return (
                  <Marker key={truck.id} position={truckPosition} icon={createTruckMarker(isMyTruck)}>
                    <Popup>
                      <div className="min-w-[160px]">
                        <h4 className="font-bold text-sm">
                          {truck.name || `Unit #${truck.unitNumber}`}
                        </h4>
                        <p className="text-xs text-gray-600">{truck.assignedDriverName || 'Unassigned'}</p>
                        {isMyTruck && trackingEnabled && (
                          <Badge className="mt-1 text-xs bg-green-500">Live</Badge>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {driverLocation && incompleteOrders[0]?.latitude && incompleteOrders[0]?.longitude && (
                <RoutingMachine
                  waypoints={[driverLocation, [parseFloat(incompleteOrders[0].latitude), parseFloat(incompleteOrders[0].longitude)]]}
                  color="#16a34a"
                  routeId="to-next"
                />
              )}

              {incompleteOrders.length >= 2 && (
                <RoutingMachine
                  waypoints={incompleteOrders.filter(o => o.latitude && o.longitude).map(o => 
                    [parseFloat(o.latitude!), parseFloat(o.longitude!)] as [number, number]
                  )}
                  color={ROUTE_COLOR}
                  routeId="main-route"
                />
              )}

              {incompleteOrders.map((order, idx) => {
                if (!order.latitude || !order.longitude) return null;
                const position: [number, number] = [parseFloat(order.latitude), parseFloat(order.longitude)];
                const isNext = idx === 0;
                const stopNumber = order.routePosition || idx + 1;
                
                const markerIcon = isNext 
                  ? createNextStopMarker(stopNumber)
                  : createColoredMarker(ROUTE_COLOR, stopNumber);
                
                return (
                  <Marker key={order.id} position={position} icon={markerIcon}>
                    <Popup>
                      <div className="min-w-[180px]">
                        <h4 className="font-medium">{order.user?.name || 'Unknown'}</h4>
                        <p className="text-sm text-gray-600">{order.address}</p>
                        <p className="text-sm mt-1">
                          <strong>{order.fuelAmount}L</strong> {order.fuelType}
                        </p>
                        <p className="text-sm">Window: {order.deliveryWindow}</p>
                        <Badge className={`mt-2 ${STATUS_COLORS[order.status]}`}>
                          {STATUS_LABELS[order.status]}
                        </Badge>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>

          <div className="p-2 border-t bg-background flex items-center gap-4 text-xs flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-600" />
              <span>Your Truck</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-amber-600" />
              <span>Other Trucks</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-1 rounded bg-green-600" />
              <span>To Next Stop</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-1 rounded bg-blue-600" />
              <span>Route</span>
            </div>
          </div>
        </div>
      </div>
    </OpsLayout>
  );
}

interface OrderStopCardProps {
  order: RouteWithDetails['orders'][0];
  position: number;
  isNext: boolean;
}

function OrderStopCard({ order, position, isNext }: OrderStopCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(order.status);
  const [actualLitres, setActualLitres] = useState<string>(order.fuelAmount.toString());
  const [itemActuals, setItemActuals] = useState<Record<string, string>>({});

  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin';
  const isOperator = user?.role === 'operator';
  const canManageOrders = isOwnerOrAdmin || isOperator;
  const isCompleted = order.status === 'completed';
  const isCancelled = order.status === 'cancelled';
  const nextStatus = getNextStatus(order.status);
  
  const ALL_STATUSES = ['scheduled', 'confirmed', 'en_route', 'arriving', 'fueling', 'completed', 'cancelled'];

  const orderItems = (order as any).orderItems || [];

  const advanceStatusMutation = useMutation({
    mutationFn: async () => {
      if (!nextStatus) return;
      const res = await apiRequest('PATCH', `/api/orders/${order.id}/status`, { status: nextStatus });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      toast({ title: 'Status Updated', description: `Order marked as ${nextStatus}` });
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/ledger'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/reports/revenue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/reports/gst'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/bookkeeping/reports/cashflow'] });
      setCompletionDialogOpen(false);
      toast({ title: 'Order Completed', description: 'Payment captured successfully' });
    },
  });

  const changeStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await apiRequest('PATCH', `/api/orders/${order.id}/status`, { status: newStatus });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to change status');
      }
      return res.json();
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      setStatusDialogOpen(false);
      toast({ title: 'Status Updated', description: `Order changed to ${STATUS_LABELS[newStatus]}` });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/orders/${order.id}/status`, { status: 'cancelled' });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to cancel order');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      toast({ title: 'Order Cancelled', description: 'Order has been cancelled' });
    },
  });

  const releaseVipTimeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/ops/vip-release-time/${order.id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to release VIP time');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vip-blocked-times'] });
      toast({ title: 'VIP Time Released', description: 'The remaining blocked time is now available for other bookings' });
    },
    onError: (error: Error) => {
      toast({ title: 'Release Failed', description: error.message, variant: 'destructive' });
    },
  });

  const isVipExclusive = (order as any).bookingType === 'vip_exclusive';
  const vipTimeAlreadyReleased = !!(order as any).vipTimeReleased;

  const validatePaymentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/orders/${order.id}/validate-payment`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to validate payment');
      }
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
      if (result.valid) {
        toast({ title: 'Payment Validated', description: 'Pre-authorization confirmed successfully' });
      } else {
        toast({ 
          title: 'Payment Issue', 
          description: result.error || 'Pre-authorization failed. Customer has been notified.',
          variant: 'destructive'
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Validation Error', description: error.message, variant: 'destructive' });
    },
  });

  // Determine payment validation status for scheduled orders
  const needsPaymentValidation = order.status === 'scheduled';
  const paymentStatus = order.paymentStatus || 'pending';

  const handleOpenCompletionDialog = async () => {
    setActualLitres(order.fuelAmount.toString());
    if (orderItems.length > 0) {
      const initialActuals: Record<string, string> = {};
      orderItems.forEach((item: any) => {
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
    if (pricing.totalLitres <= 0) return;
    
    const itemActualsNumeric: Record<string, number> = {};
    Object.entries(itemActuals).forEach(([id, val]) => {
      itemActualsNumeric[id] = parseFloat(val) || 0;
    });
    
    capturePaymentMutation.mutate({
      actualLitresDelivered: pricing.totalLitres,
      itemActuals: Object.keys(itemActualsNumeric).length > 0 ? itemActualsNumeric : undefined,
    });
  };

  const handleAdvanceStatus = () => {
    if (order.status === 'fueling') {
      handleOpenCompletionDialog();
    } else {
      advanceStatusMutation.mutate();
    }
  };

  return (
    <>
      <Card className={`${isCompleted ? 'opacity-60' : ''} ${isCancelled ? 'opacity-40 border-red-200' : ''} ${isNext ? 'ring-2 ring-green-500' : ''}`}>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${isNext ? 'bg-green-600' : 'bg-blue-600'}`}>
              {position}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm truncate">{order.user?.name || 'Unknown'}</span>
                {order.user?.subscriptionTier && (
                  <Badge variant="outline" className="text-[10px] px-1">
                    {TIER_LABELS[order.user.subscriptionTier]}
                  </Badge>
                )}
                {isVipExclusive && (
                  <Badge className="text-[10px] px-1 bg-purple-600 text-white">
                    VIP Exclusive
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{order.address}</span>
                <WeatherBadge
                  lat={order.latitude ? parseFloat(order.latitude) : null}
                  lng={order.longitude ? parseFloat(order.longitude) : null}
                  variant="compact"
                />
              </div>
              
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <Fuel className="w-3 h-3 text-copper" />
                  {order.fuelAmount}L
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-sage" />
                  {order.deliveryWindow}
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-brass" />
                  ${parseFloat(order.total).toFixed(2)}
                </span>
              </div>
              
              {/* Payment status indicator for scheduled orders */}
              {needsPaymentValidation && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] ${
                      paymentStatus === 'preauthorized' 
                        ? 'bg-green-50 text-green-700 border-green-300' 
                        : paymentStatus === 'failed' 
                        ? 'bg-red-50 text-red-700 border-red-300'
                        : 'bg-yellow-50 text-yellow-700 border-yellow-300'
                    }`}
                  >
                    {paymentStatus === 'preauthorized' ? '✓ Payment Ready' : paymentStatus === 'failed' ? '✗ Payment Failed' : '⏳ Awaiting Payment'}
                  </Badge>
                  {paymentStatus !== 'preauthorized' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => validatePaymentMutation.mutate()}
                      disabled={validatePaymentMutation.isPending}
                      className="h-5 text-[10px] px-2"
                      data-testid="button-validate-payment"
                    >
                      {validatePaymentMutation.isPending ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        'Validate'
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                <Badge className={`text-[10px] ${STATUS_COLORS[order.status]}`}>
                  {STATUS_LABELS[order.status]}
                </Badge>
                
                {canManageOrders && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setDetailsDialogOpen(true)}>
                        <AlertCircle className="w-4 h-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      {needsPaymentValidation && paymentStatus !== 'preauthorized' && (
                        <DropdownMenuItem 
                          onClick={() => validatePaymentMutation.mutate()}
                          disabled={validatePaymentMutation.isPending}
                          className="text-blue-600 focus:text-blue-600"
                        >
                          <DollarSign className="w-4 h-4 mr-2" />
                          Validate Payment
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => {
                        setSelectedStatus(order.status);
                        setStatusDialogOpen(true);
                      }}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Change Status
                      </DropdownMenuItem>
                      {isVipExclusive && !vipTimeAlreadyReleased && !isCancelled && !isCompleted && (
                        <DropdownMenuItem 
                          onClick={() => releaseVipTimeMutation.mutate()}
                          disabled={releaseVipTimeMutation.isPending}
                          className="text-purple-600 focus:text-purple-600"
                        >
                          <Unlock className="w-4 h-4 mr-2" />
                          Release Remaining Time
                        </DropdownMenuItem>
                      )}
                      {!isCancelled && (
                        <DropdownMenuItem 
                          onClick={() => cancelOrderMutation.mutate()}
                          className="text-red-600 focus:text-red-600"
                        >
                          <X className="w-4 h-4 mr-2" />
                          Cancel Order
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              
              {!isCompleted && !isCancelled && nextStatus && (
                <Button
                  size="sm"
                  onClick={handleAdvanceStatus}
                  disabled={advanceStatusMutation.isPending}
                  className={`h-7 text-xs ${order.status === 'fueling' ? 'bg-green-600 hover:bg-green-700' : 'bg-copper hover:bg-copper/90'}`}
                >
                  {advanceStatusMutation.isPending ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : order.status === 'fueling' ? (
                    <>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Complete
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 mr-1" />
                      {STATUS_LABELS[nextStatus]}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Order & Capture Payment</DialogTitle>
            <DialogDescription>
              Enter actual litres delivered to calculate final amount
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {orderItems.length > 0 ? (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Actual Litres per Vehicle</Label>
                {orderItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {item.vehicle ? `${item.vehicle.year} ${item.vehicle.make} ${item.vehicle.model}` : 'Vehicle'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.fuelType} • Requested: {item.fuelAmount}L
                      </p>
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={itemActuals[item.id] || item.fuelAmount.toString()}
                        onChange={(e) => setItemActuals(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="text-right h-8"
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
                <div className="border rounded p-3 space-y-2 bg-muted/30 text-sm">
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
                  <div className="pt-2 border-t mt-2">
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>Pre-Authorized:</span>
                      <span>${pricing.preAuthAmount.toFixed(2)}</span>
                    </div>
                    <div className={`flex justify-between text-xs font-medium ${difference > 0 ? 'text-amber-600' : difference < 0 ? 'text-green-600' : ''}`}>
                      <span>Difference:</span>
                      <span>{difference !== 0 ? `${difference > 0 ? '+' : ''}$${difference.toFixed(2)}` : 'No change'}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {capturePaymentMutation.isError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
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
            >
              {capturePaymentMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Capture ${calculateFinalPricing().total.toFixed(2)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Order #{order.id.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Customer</p>
                <p className="font-medium">{order.user?.name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge className={STATUS_COLORS[order.status]}>
                  {STATUS_LABELS[order.status]}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Address</p>
                <p className="font-medium">{order.address}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Weather</p>
                <WeatherBadge
                  lat={order.latitude ? parseFloat(order.latitude) : null}
                  lng={order.longitude ? parseFloat(order.longitude) : null}
                  variant="inline"
                />
              </div>
              <div>
                <p className="text-muted-foreground">Delivery Window</p>
                <p className="font-medium">{order.deliveryWindow}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Fuel Type</p>
                <p className="font-medium capitalize">{order.fuelType}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Amount</p>
                <p className="font-medium">{order.fuelAmount}L</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tier</p>
                <p className="font-medium">{order.user?.subscriptionTier ? TIER_LABELS[order.user.subscriptionTier] : 'N/A'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Fill to Full</p>
                <p className="font-medium">{order.fillToFull ? 'Yes' : 'No'}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Pricing</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price per Litre:</span>
                  <span>${parseFloat(order.pricePerLitre).toFixed(3)}/L</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery Fee:</span>
                  <span>${parseFloat(order.deliveryFee).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t">
                  <span>Total (incl. GST):</span>
                  <span>${parseFloat(order.total).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {order.user?.email && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Contact</h4>
                <p className="text-sm">{order.user.email}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Order Status</DialogTitle>
            <DialogDescription>
              Select a new status for this order
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        status === 'cancelled' ? 'bg-red-500' :
                        status === 'completed' ? 'bg-green-500' :
                        status === 'fueling' ? 'bg-purple-500' :
                        status === 'arriving' ? 'bg-orange-500' :
                        status === 'en_route' ? 'bg-amber-500' :
                        status === 'confirmed' ? 'bg-blue-500' : 'bg-slate-500'
                      }`} />
                      {STATUS_LABELS[status]}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {changeStatusMutation.isError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                {(changeStatusMutation.error as Error)?.message || 'Failed to change status'}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => changeStatusMutation.mutate(selectedStatus)}
              disabled={changeStatusMutation.isPending || selectedStatus === order.status}
              className="bg-copper hover:bg-copper/90"
            >
              {changeStatusMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Status'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
