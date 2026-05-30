import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { 
  DollarSign, 
  Fuel, 
  Users, 
  TrendingUp, 
  AlertTriangle,
  ChevronRight,
  Clock,
  Truck,
  ClipboardList,
  BarChart2
} from "lucide-react";
import { format, parseISO, isToday } from "date-fns";
import { useLocation } from "wouter";
import { HeaderWeatherWidget } from "@/components/header-weather-widget";

interface Order {
  id: string;
  status: string;
  scheduledDate: string;
  total: string;
  fuelAmount: string;
}

interface MarketSummary {
  grades: Array<{
    fuelCategory: string;
    gradeLabel: string;
    latestPrice: string | null;
    sourceLabel: string | null;
    observedAt: string | null;
    delta7d: string | null;
    pmfsCustomerPrice: string | null;
  }>;
  lastNrcanImport: string | null;
  totalObservations: number;
}

interface IndicatorBucket {
  unit: string;
  sourceLabel: string;
  latest: { value: string; effectiveDate: string } | null;
  points: Array<{ effectiveDate: string; value: string }>;
}
interface ExternalIndicators {
  byType: Record<string, IndicatorBucket>;
}

const CATEGORY_DOT: Record<string, string> = {
  regular: "bg-red-500",
  midgrade: "bg-orange-500",
  premium: "bg-amber-500",
  ultra: "bg-purple-500",
  diesel: "bg-emerald-600",
  e85: "bg-cyan-500",
  e10: "bg-blue-500",
  other: "bg-gray-500",
};

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalLitres: number;
}

export default function CommandPage() {
  const [, navigate] = useLocation();

  const { data: ordersData } = useQuery<{ orders: Order[] }>({
    queryKey: ["/api/ops/orders"],
  });

  const { data: marketSummary } = useQuery<MarketSummary>({
    queryKey: ["/api/owner/market/summary"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: marketIndicators } = useQuery<ExternalIndicators>({
    queryKey: ["/api/owner/market/external-indicators", 30],
    queryFn: () => fetch(`/api/owner/market/external-indicators?days=30`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Count grades where the market pump price has dropped below PMFS (competitive risk)
  const marketAlertCount = (marketSummary?.grades ?? []).filter(g =>
    g.latestPrice != null && g.pmfsCustomerPrice != null &&
    parseFloat(g.latestPrice) < parseFloat(g.pmfsCustomerPrice)
  ).length;

  const indicatorBrief = (type: string) => {
    const b = marketIndicators?.byType?.[type];
    if (!b?.latest) return null;
    const latest = parseFloat(b.latest.value);
    const first = b.points.length ? parseFloat(b.points[0].value) : null;
    const pct = first && first !== 0 ? ((latest - first) / first) * 100 : null;
    return { latest, pct };
  };
  const wtiBrief = indicatorBrief("wti_crude");
  const fxBrief = indicatorBrief("usd_cad");

  const { data: analyticsData } = useQuery<DashboardStats>({
    queryKey: ["/api/ops/analytics/summary"],
  });

  const { data: closeoutData } = useQuery<{ runs: any[] }>({
    queryKey: ["/api/ops/closeout/runs"],
  });

  const todayOrders = ordersData?.orders?.filter(o => {
    const date = parseISO(o.scheduledDate);
    return isToday(date) && o.status !== 'cancelled';
  }) || [];

  const pendingOrders = todayOrders.filter(o => o.status === 'pending' || o.status === 'confirmed');
  const completedToday = todayOrders.filter(o => o.status === 'completed');

  const todayRevenue = completedToday.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
  const todayLitres = completedToday.reduce((sum, o) => sum + parseFloat(o.fuelAmount || '0'), 0);

  const lastCloseout = closeoutData?.runs?.[0];

  return (
    <OwnerShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Command Center</h1>
            <p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <HeaderWeatherWidget />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">${todayRevenue.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">Today's Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Fuel className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{todayLitres.toFixed(0)}L</p>
                  <p className="text-xs text-muted-foreground">Litres Delivered</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingOrders.length}</p>
                  <p className="text-xs text-muted-foreground">Pending Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{completedToday.length}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-between"
                onClick={() => navigate("/owner/operations?tab=dispatch")}
                data-testid="button-dispatch"
              >
                <span className="flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Open Dispatch
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-between"
                onClick={() => navigate("/owner/business?tab=pricing")}
                data-testid="button-pricing"
              >
                <span className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Update Fuel Prices
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-between"
                onClick={() => navigate("/owner/market")}
                data-testid="button-market-intelligence"
              >
                <span className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4" />
                  Market Intelligence
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-between"
                onClick={() => navigate("/owner/finance?tab=closeout")}
                data-testid="button-closeout"
              >
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Weekly Closeout
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-between"
                onClick={() => navigate("/owner/finance?tab=command")}
                data-testid="button-financials"
              >
                <span className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Financial Command
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-between"
                onClick={() => navigate("/owner/business?tab=waitlist")}
                data-testid="button-waitlist"
              >
                <span className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  View Waitlist
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Alerts & Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingOrders.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg">
                  <span className="text-sm">{pendingOrders.length} orders need attention</span>
                  <Badge variant="outline">Pending</Badge>
                </div>
              )}
              {lastCloseout ? (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm">Last closeout: {format(parseISO(lastCloseout.createdAt), 'MMM d')}</span>
                  <Badge variant={lastCloseout.status === 'completed' ? 'default' : 'secondary'}>
                    {lastCloseout.status}
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm">No closeout runs yet</span>
                  <Badge variant="outline">Setup Needed</Badge>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg">
                <span className="text-sm">System operational</span>
                <Badge className="bg-green-500">Online</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Market Pulse Card — placed directly below Alerts & Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-copper" />
              Market Pulse
              {marketAlertCount > 0 && (
                <Badge variant="destructive" className="text-xs" data-testid="badge-market-alert">
                  {marketAlertCount} alert{marketAlertCount > 1 ? 's' : ''}
                </Badge>
              )}
              <Badge variant="outline" className="ml-auto text-muted-foreground font-normal text-xs">Calgary</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!marketSummary || marketSummary.totalObservations === 0 ? (
              <div className="text-center py-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  No market data yet — set up NRCan auto-import or log your first observation.
                </p>
                <Button size="sm" variant="outline" onClick={() => navigate("/owner/market?tab=log")} data-testid="button-market-setup">
                  Set Up
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Always show exactly Regular 87, Premium 91, Diesel — in that order */}
                {(['regular', 'premium', 'diesel'] as const).map(cat => {
                  const g = marketSummary.grades.find(x => x.fuelCategory === cat);
                  return (
                    <div key={cat} className="flex items-center justify-between" data-testid={`market-row-${cat}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_DOT[cat]}`} />
                        <span className="text-sm font-medium truncate">
                          {cat === 'regular' ? 'Regular 87' : cat === 'premium' ? 'Premium 91' : 'Diesel'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                        {/* 7-day delta */}
                        {g?.delta7d != null && (
                          <span className={`text-xs font-medium ${parseFloat(g.delta7d) > 0 ? 'text-red-500' : parseFloat(g.delta7d) < 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                            {parseFloat(g.delta7d) > 0 ? '↑' : parseFloat(g.delta7d) < 0 ? '↓' : '—'}
                            {Math.abs(parseFloat(g.delta7d)).toFixed(3)}
                          </span>
                        )}
                        {/* Pump price */}
                        {g?.latestPrice ? (
                          <span className="text-sm font-mono font-semibold">
                            ${parseFloat(g.latestPrice).toFixed(3)}/L
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                        {/* PMFS customer price spread */}
                        {g?.latestPrice && g?.pmfsCustomerPrice && (
                          <span className={`text-xs font-medium ${
                            parseFloat(g.pmfsCustomerPrice) >= parseFloat(g.latestPrice)
                              ? 'text-green-600'
                              : 'text-amber-500'
                          }`}>
                            PMFS ${parseFloat(g.pmfsCustomerPrice).toFixed(3)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Crude & FX context */}
                {(wtiBrief || fxBrief) && (
                  <div className="flex items-center gap-4 pt-2 border-t" data-testid="market-pulse-indicators">
                    {wtiBrief && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">WTI</span>
                        <span className="text-xs font-mono font-semibold">${wtiBrief.latest.toFixed(2)}</span>
                        {wtiBrief.pct != null && (
                          <span className={`text-xs ${wtiBrief.pct > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {wtiBrief.pct >= 0 ? '↑' : '↓'}{Math.abs(wtiBrief.pct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    )}
                    {fxBrief && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">USD/CAD</span>
                        <span className="text-xs font-mono font-semibold">{fxBrief.latest.toFixed(4)}</span>
                        {fxBrief.pct != null && (
                          <span className={`text-xs ${fxBrief.pct > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {fxBrief.pct >= 0 ? '↑' : '↓'}{Math.abs(fxBrief.pct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="pt-1 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between text-muted-foreground hover:text-foreground h-8"
                    onClick={() => navigate("/owner/market")}
                    data-testid="button-view-market-data"
                  >
                    <span className="text-xs">View Market Data</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </OwnerShell>
  );
}
