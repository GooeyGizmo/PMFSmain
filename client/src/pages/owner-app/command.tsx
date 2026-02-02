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
  Truck
} from "lucide-react";
import { format, parseISO, isToday } from "date-fns";
import { useLocation } from "wouter";

interface Order {
  id: string;
  status: string;
  scheduledDate: string;
  total: string;
  fuelAmount: string;
}

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Command Center</h1>
            <p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <Button onClick={() => navigate("/ops")} variant="outline" data-testid="button-ops-dashboard">
            Full Dashboard
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
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
      </div>
    </OwnerShell>
  );
}
