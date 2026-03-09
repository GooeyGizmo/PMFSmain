import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import {
  Navigation, MapPin, Clock, Fuel, Truck, AlertTriangle,
  ChevronDown, ChevronRight, Sun, Cloud, CloudRain, Snowflake,
  CloudLightning, CloudDrizzle, CloudFog, Loader2, Route, Thermometer,
  Wind, Droplets, ArrowRight, CircleDot, Timer
} from 'lucide-react';
import { format, addDays } from 'date-fns';

interface DailyForecast {
  date: string;
  weatherCode: number;
  description: string;
  icon: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  windMax: number;
  severity: 'good' | 'caution' | 'warning';
}

interface PlannerStop {
  orderId: string;
  customerName: string;
  address: string;
  city: string;
  postalArea: string;
  fuelType: string;
  fuelAmount: string;
  eta: string;
  driveMinutesFromPrev: number;
  distanceKmFromPrev: number;
  lat: number | null;
  lng: number | null;
  status: string;
  routeId: string;
}

interface PlannerWindow {
  windowLabel: string;
  windowStart: number;
  stops: PlannerStop[];
}

interface PlannerResult {
  date: string;
  weather: DailyForecast | null;
  summary: {
    totalStops: number;
    totalDistanceKm: number;
    totalDriveMinutes: number;
    estimatedStartTime: string | null;
    estimatedEndTime: string | null;
  };
  windows: PlannerWindow[];
}

const FUEL_COLORS: Record<string, string> = {
  regular: 'bg-red-500',
  premium: 'bg-amber-500',
  diesel: 'bg-emerald-600',
};

const FUEL_LABELS: Record<string, string> = {
  regular: 'Regular 87',
  premium: 'Premium 91',
  diesel: 'Diesel',
};

const POSTAL_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-rose-100 text-rose-700 border-rose-200',
];

function getWeatherIcon(icon: string) {
  switch (icon) {
    case 'sun': return <Sun className="w-4 h-4 text-amber-500" />;
    case 'cloud-sun': return <Cloud className="w-4 h-4 text-amber-400" />;
    case 'cloud': return <Cloud className="w-4 h-4 text-gray-500" />;
    case 'cloud-rain': return <CloudRain className="w-4 h-4 text-blue-500" />;
    case 'cloud-drizzle': return <CloudDrizzle className="w-4 h-4 text-blue-400" />;
    case 'snowflake': return <Snowflake className="w-4 h-4 text-cyan-500" />;
    case 'cloud-lightning': return <CloudLightning className="w-4 h-4 text-yellow-600" />;
    case 'cloud-fog': return <CloudFog className="w-4 h-4 text-gray-400" />;
    default: return <Cloud className="w-4 h-4 text-gray-500" />;
  }
}

function getSeverityBadge(severity: 'good' | 'caution' | 'warning') {
  switch (severity) {
    case 'good': return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Good</Badge>;
    case 'caution': return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Caution</Badge>;
    case 'warning': return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Warning</Badge>;
  }
}

export default function RoutePlanner() {
  const { toast } = useToast();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(today);
  const [planResult, setPlanResult] = useState<PlannerResult | null>(null);
  const [expandedWindows, setExpandedWindows] = useState<Set<string>>(new Set());

  const { data: forecastData, isLoading: forecastLoading } = useQuery<{ forecast: DailyForecast[] }>({
    queryKey: ['/api/weather/forecast', { days: 7 }],
  });

  const optimizeMutation = useMutation({
    mutationFn: async (date: string) => {
      const res = await fetch('/api/ops/route-planner/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Failed to optimize');
      return res.json() as Promise<PlannerResult>;
    },
    onSuccess: (data) => {
      setPlanResult(data);
      const allWindowKeys = new Set(data.windows.map(w => w.windowLabel));
      setExpandedWindows(allWindowKeys);
      if (data.summary.totalStops === 0) {
        toast({ title: 'No deliveries scheduled', description: `No active deliveries found for ${data.date}` });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Optimization failed', description: err.message, variant: 'destructive' });
    },
  });

  const [applyingRoutes, setApplyingRoutes] = useState(false);

  const applyAllRoutes = async (routeIds: string[]) => {
    setApplyingRoutes(true);
    let succeeded = 0;
    let failed = 0;
    for (const id of routeIds) {
      try {
        const res = await fetch(`/api/ops/routes/${id}/optimize`, {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) succeeded++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setApplyingRoutes(false);
    if (failed === 0) {
      toast({ title: 'Routes applied', description: `${succeeded} route${succeeded !== 1 ? 's' : ''} optimized and saved` });
    } else {
      toast({ title: 'Partial success', description: `${succeeded} applied, ${failed} failed`, variant: 'destructive' });
    }
  };

  const forecast = forecastData?.forecast || [];
  const selectedForecast = forecast.find(f => f.date === selectedDate);

  const postalAreaColorMap = new Map<string, string>();
  let colorIdx = 0;
  if (planResult) {
    for (const w of planResult.windows) {
      for (const s of w.stops) {
        if (!postalAreaColorMap.has(s.postalArea)) {
          postalAreaColorMap.set(s.postalArea, POSTAL_COLORS[colorIdx % POSTAL_COLORS.length]);
          colorIdx++;
        }
      }
    }
  }

  const toggleWindow = (key: string) => {
    setExpandedWindows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const uniqueRouteIds = planResult ? [...new Set(planResult.windows.flatMap(w => w.stops.map(s => s.routeId)).filter(Boolean))] : [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2">
          <Navigation className="w-5 h-5 text-copper" />
          Smart Route Planner
        </h2>
        <p className="text-sm text-muted-foreground">Plan optimized delivery routes with weather awareness</p>
      </div>

      <Card data-testid="forecast-strip">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <Thermometer className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">7-Day Forecast</span>
          </div>
          {forecastLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {forecast.map((day) => {
                const isSelected = day.date === selectedDate;
                const dayDate = new Date(day.date + 'T12:00:00');
                const isToday = day.date === today;
                return (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={`flex flex-col items-center p-2 rounded-lg border transition-all text-center ${
                      isSelected
                        ? 'border-copper bg-copper/10 ring-1 ring-copper/30'
                        : 'border-border hover:border-copper/30 hover:bg-muted/30'
                    }`}
                    data-testid={`forecast-day-${day.date}`}
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {isToday ? 'Today' : format(dayDate, 'EEE')}
                    </span>
                    <span className="text-xs font-bold">{format(dayDate, 'MMM d')}</span>
                    <div className="my-1">{getWeatherIcon(day.icon)}</div>
                    <div className="text-[10px]">
                      <span className="font-medium">{Math.round(day.tempMax)}°</span>
                      <span className="text-muted-foreground">/{Math.round(day.tempMin)}°</span>
                    </div>
                    {getSeverityBadge(day.severity)}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedForecast && (selectedForecast.severity === 'caution' || selectedForecast.severity === 'warning') && (
        <div
          className={`flex items-start gap-3 p-3 rounded-lg border ${
            selectedForecast.severity === 'warning'
              ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
              : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
          }`}
          data-testid="weather-alert-banner"
        >
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
            selectedForecast.severity === 'warning' ? 'text-red-600' : 'text-amber-600'
          }`} />
          <div>
            <p className={`text-sm font-medium ${
              selectedForecast.severity === 'warning' ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'
            }`}>
              {selectedForecast.severity === 'warning' ? 'Weather Warning' : 'Weather Caution'} — {selectedForecast.description}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {Math.round(selectedForecast.tempMax)}°C high · {selectedForecast.precipitation}mm precipitation · {Math.round(selectedForecast.windMax)} km/h winds
              {selectedForecast.severity === 'warning' && ' · Consider rescheduling non-essential deliveries'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={() => optimizeMutation.mutate(selectedDate)}
          disabled={optimizeMutation.isPending}
          className="bg-copper hover:bg-copper/90"
          data-testid="btn-plan-route"
        >
          {optimizeMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Route className="w-4 h-4 mr-2" />
          )}
          Plan Route for {selectedDate === today ? 'Today' : format(new Date(selectedDate + 'T12:00:00'), 'MMM d')}
        </Button>
        {planResult && uniqueRouteIds.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={applyingRoutes}
            onClick={() => applyAllRoutes(uniqueRouteIds)}
            data-testid="btn-apply-route"
          >
            {applyingRoutes ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Truck className="w-3 h-3 mr-1" />}
            Apply to {uniqueRouteIds.length} Route{uniqueRouteIds.length !== 1 ? 's' : ''}
          </Button>
        )}
      </div>

      {planResult && (
        <div className="space-y-4" data-testid="plan-result">
          <Card className="border-2 border-copper/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Route className="w-4 h-4 text-copper" />
                Route Summary
              </CardTitle>
              <CardDescription>
                {format(new Date(planResult.date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
                {planResult.weather && (
                  <span className="ml-2 inline-flex items-center gap-1">
                    · {getWeatherIcon(planResult.weather.icon)} {planResult.weather.description}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {planResult.summary.totalStops === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No active deliveries scheduled for this date</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-2xl font-bold text-copper" data-testid="summary-stops">{planResult.summary.totalStops}</div>
                    <div className="text-xs text-muted-foreground">Stops</div>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-2xl font-bold text-copper" data-testid="summary-distance">{planResult.summary.totalDistanceKm}</div>
                    <div className="text-xs text-muted-foreground">km Total</div>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-2xl font-bold text-copper" data-testid="summary-drive-time">{planResult.summary.totalDriveMinutes}</div>
                    <div className="text-xs text-muted-foreground">min Drive Time</div>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm font-medium" data-testid="summary-time-range">
                      {planResult.summary.estimatedStartTime && format(new Date(planResult.summary.estimatedStartTime), 'h:mm a')}
                      {' → '}
                      {planResult.summary.estimatedEndTime && format(new Date(planResult.summary.estimatedEndTime), 'h:mm a')}
                    </div>
                    <div className="text-xs text-muted-foreground">Est. Window</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {planResult.windows.map((window, wIdx) => {
            const isExpanded = expandedWindows.has(window.windowLabel);
            return (
              <Collapsible key={window.windowLabel} open={isExpanded} onOpenChange={() => toggleWindow(window.windowLabel)}>
                <Card data-testid={`window-${wIdx}`}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="pb-2 cursor-pointer hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <Clock className="w-4 h-4 text-copper" />
                          <CardTitle className="text-sm font-display">{window.windowLabel}</CardTitle>
                          <Badge variant="outline" className="text-xs">{window.stops.length} stop{window.stops.length !== 1 ? 's' : ''}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {[...new Set(window.stops.map(s => s.postalArea))].map(area => (
                            <Badge key={area} className={`text-[10px] border ${postalAreaColorMap.get(area) || ''}`}>
                              {area}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-1">
                      {window.stops.map((stop, sIdx) => {
                        const globalIdx = planResult.windows.slice(0, wIdx).reduce((acc, w) => acc + w.stops.length, 0) + sIdx + 1;
                        return (
                          <div key={stop.orderId} data-testid={`stop-${stop.orderId}`}>
                            {sIdx > 0 && stop.driveMinutesFromPrev > 0 && (
                              <div className="flex items-center gap-2 py-1 pl-6">
                                <div className="w-px h-4 bg-border ml-2" />
                                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground">
                                  {stop.driveMinutesFromPrev} min · {stop.distanceKmFromPrev} km
                                </span>
                              </div>
                            )}
                            <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 border border-transparent hover:border-border/50 transition-all">
                              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-copper/10 text-copper flex items-center justify-center text-xs font-bold">
                                {globalIdx}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium" data-testid={`stop-name-${stop.orderId}`}>{stop.customerName}</span>
                                  <Badge className={`text-[10px] border ${postalAreaColorMap.get(stop.postalArea) || ''}`} data-testid={`stop-postal-${stop.orderId}`}>
                                    {stop.postalArea}
                                  </Badge>
                                  <div className="flex items-center gap-1">
                                    <div className={`w-2 h-2 rounded-full ${FUEL_COLORS[stop.fuelType] || 'bg-gray-400'}`} />
                                    <span className="text-[10px] text-muted-foreground">{FUEL_LABELS[stop.fuelType] || stop.fuelType}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                  <span className="text-xs text-muted-foreground truncate">{stop.address}, {stop.city}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                  <div className="flex items-center gap-1">
                                    <Timer className="w-3 h-3 text-copper" />
                                    <span className="text-xs font-medium text-copper" data-testid={`stop-eta-${stop.orderId}`}>
                                      ETA {format(new Date(stop.eta), 'h:mm a')}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Fuel className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">{parseFloat(stop.fuelAmount).toFixed(0)}L</span>
                                  </div>
                                  {sIdx === 0 && wIdx === 0 && stop.driveMinutesFromPrev > 0 && (
                                    <div className="flex items-center gap-1">
                                      <CircleDot className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-[10px] text-muted-foreground">{stop.driveMinutesFromPrev} min from depot</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
