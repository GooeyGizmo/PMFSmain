import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useAllOrders } from '@/lib/api-hooks';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Users, Truck, DollarSign,
  MapPin, Clock, ArrowRight, LayoutDashboard,
  Package, UserCog, BarChart3, Fuel, Calculator, AlertTriangle, Ticket, PiggyBank,
  Crown, Home, AlertOctagon, ClipboardCheck, UserPlus, TrendingUp
} from 'lucide-react';
import { useLocation } from 'wouter';
import OpsLayout from '@/components/ops-layout';

function getCalgaryDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isScheduledForToday(scheduledDate: Date | string): boolean {
  const orderDate = new Date(scheduledDate);
  const orderDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(orderDate);
  
  const todayInCalgary = getCalgaryDateString(new Date());
  
  return orderDateStr === todayInCalgary;
}

function isScheduledTodayOrLater(scheduledDate: Date | string): boolean {
  const orderDate = new Date(scheduledDate);
  const orderDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(orderDate);
  
  const todayInCalgary = getCalgaryDateString(new Date());
  
  return orderDateStr >= todayInCalgary;
}

interface VipCapacity {
  activeCount: number;
  maxCapacity: number;
  availableSlots: number;
  atCapacity: boolean;
  waitlist: { id: string; name: string; email: string; phone?: string; joinedAt: string }[];
}

interface HouseholdUsage {
  totalHouseholdUsers: number;
  overUsageCount: number;
  excessiveUsageCount: number;
  users: { id: string; name: string; email: string; ordersThisMonth: number; usageFlag: string }[];
}

export default function OpsDashboard() {
  const { user, isOwner } = useAuth();
  const [, setLocation] = useLocation();
  const { orders, isLoading } = useAllOrders();

  const { data: vipCapacity } = useQuery<VipCapacity>({
    queryKey: ['/api/ops/vip-capacity'],
  });

  const { data: householdUsage } = useQuery<HouseholdUsage>({
    queryKey: ['/api/ops/household-usage'],
  });

  const { data: waitlistAnalytics } = useQuery<{
    summary: { total: number; conversionRate: number };
    statusCounts: Record<string, number>;
    signupTrend: { date: string; count: number }[];
  }>({
    queryKey: ['/api/ops/waitlist/analytics'],
  });

  const activeOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'completed');
  const todayActiveOrders = activeOrders.filter(o => isScheduledForToday(o.scheduledDate));
  const completedOrders = orders.filter(o => o.status === 'completed');
  const upcomingOrders = orders.filter(o => 
    ['scheduled', 'confirmed', 'en_route'].includes(o.status) && 
    isScheduledTodayOrLater(o.scheduledDate)
  ).slice(0, 4);

  const totalRevenue = completedOrders.reduce((sum, o) => sum + parseFloat(o.total.toString()), 0);
  const totalFuel = completedOrders.reduce((sum, o) => sum + parseFloat(o.fuelAmount.toString()), 0);

  const stats = [
    { label: "Today's Deliveries", value: todayActiveOrders.length.toString(), icon: Truck, color: 'text-copper' },
    { label: 'Active Orders', value: activeOrders.length.toString(), icon: Users, color: 'text-sage' },
    { label: "Total Revenue", value: `$${totalRevenue.toFixed(0)}`, icon: DollarSign, color: 'text-brass' },
    { label: 'Fuel Delivered', value: `${totalFuel.toFixed(0)}L`, icon: Fuel, color: 'text-copper' },
  ];

  const opsModules = [
    { name: 'Delivery Console', icon: Truck, description: 'Live map & delivery workflow', href: '/ops/delivery-console' },
    { name: 'Order Management', icon: Package, description: 'View and manage all orders', href: '/ops/orders' },
    { name: 'Customer Management', icon: UserCog, description: 'Customer profiles and subscriptions', href: '/ops/customers' },
    { name: 'Dispatch Management', icon: Truck, description: 'Assign and track drivers', href: '/ops/dispatch' },
    { name: 'Driver Management', icon: Users, description: 'Driver licenses and certifications', href: '/ops/drivers' },
    { name: 'Fleet & TDG', icon: Fuel, description: 'Fleet management & fuel logs', href: '/ops/fleet' },
    { name: 'Emergency Requests', icon: AlertTriangle, description: 'After-hours emergency services', href: '/ops/emergency' },
    { name: 'Fuel Inventory', icon: Fuel, description: 'Track bulk inventory levels', href: '/ops/inventory' },
    { name: 'Pricing & Rates', icon: DollarSign, description: 'Manage fuel prices and fees', href: '/ops/pricing' },
    { name: 'Financial Command Center', icon: PiggyBank, description: 'Financials, analytics, ledger & GST', href: '/ops/financials' },
    { name: 'Promo Codes', icon: Ticket, description: 'Create promotional codes', href: '/ops/promo-codes' },
    { name: 'Closeouts', icon: ClipboardCheck, description: 'Weekly closeout & reconciliation', href: '/ops/closeout' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-blue-500/10 text-blue-600';
      case 'en_route': return 'bg-amber-500/10 text-amber-600';
      case 'scheduled': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <OpsLayout>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        <div>
          <motion.h1 
            className="font-display text-3xl font-bold text-foreground"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Operations Dashboard
          </motion.h1>
          <div className="text-muted-foreground mt-1 flex items-center gap-1">
            Welcome back, {user?.name}
            {isOwner && <Badge variant="secondary" className="ml-2">Owner</Badge>}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center mb-2">
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <p className="font-display text-3xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* VIP & Household Monitoring Widgets */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* VIP Capacity Widget */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-amber-500/30">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <CardTitle className="font-display text-lg">VIP</CardTitle>
                </div>
                <CardDescription>Exclusive tier capacity status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Active Members</span>
                  <span className="font-display text-2xl font-bold">
                    {vipCapacity?.activeCount ?? 0}<span className="text-muted-foreground text-base">/{vipCapacity?.maxCapacity ?? 10}</span>
                  </span>
                </div>
                <Progress 
                  value={((vipCapacity?.activeCount ?? 0) / (vipCapacity?.maxCapacity ?? 10)) * 100} 
                  className="h-2"
                />
                <div className="flex items-center justify-between text-sm">
                  <span className={vipCapacity?.atCapacity ? 'text-red-500 font-medium' : 'text-green-600'}>
                    {vipCapacity?.atCapacity ? 'At Capacity' : `${vipCapacity?.availableSlots ?? vipCapacity?.maxCapacity ?? 10} slots available`}
                  </span>
                  {(vipCapacity?.waitlist?.length ?? 0) > 0 && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                      {vipCapacity?.waitlist.length} on waitlist
                    </Badge>
                  )}
                </div>
                {(vipCapacity?.waitlist?.length ?? 0) > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Waitlist</p>
                    <div className="space-y-1">
                      {vipCapacity?.waitlist.slice(0, 3).map((w, i) => (
                        <div key={w.id} className="text-sm flex items-center gap-2">
                          <span className="w-5 text-muted-foreground">{i + 1}.</span>
                          <span>{w.name}</span>
                          <span className="text-muted-foreground text-xs">{w.email}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Household Usage Monitor */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <Card className={householdUsage?.excessiveUsageCount ? 'border-red-500/30' : householdUsage?.overUsageCount ? 'border-orange-500/30' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Home className="w-5 h-5 text-sky-500" />
                  <CardTitle className="font-display text-lg">Household Usage Monitor</CardTitle>
                </div>
                <CardDescription>Track household tier delivery patterns</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="font-display text-2xl font-bold">{householdUsage?.totalHouseholdUsers ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Total Members</p>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold text-orange-500">{householdUsage?.overUsageCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Over Usage (&gt;8)</p>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold text-red-500">{householdUsage?.excessiveUsageCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Excessive (&gt;12)</p>
                  </div>
                </div>
                {(householdUsage?.users?.length ?? 0) > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Flagged Users This Month</p>
                    <div className="space-y-2">
                      {householdUsage?.users.slice(0, 4).map((u) => (
                        <div key={u.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {u.usageFlag === 'excessive_usage' ? (
                              <AlertOctagon className="w-4 h-4 text-red-500" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-orange-500" />
                            )}
                            <span>{u.name}</span>
                          </div>
                          <Badge 
                            variant="secondary" 
                            className={u.usageFlag === 'excessive_usage' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}
                          >
                            {u.ordersThisMonth} orders
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(householdUsage?.users?.length ?? 0) === 0 && (
                  <p className="text-sm text-center text-green-600 py-2">All household users within normal limits</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="font-display">Today's Schedule</CardTitle>
                  <CardDescription>Upcoming deliveries for today</CardDescription>
                </div>
                <Link href="/owner/operations?tab=dispatch">
                  <Button variant="outline" size="sm" data-testid="button-view-all-schedule">
                    View All
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {upcomingOrders.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No upcoming deliveries</p>
                  ) : (
                    upcomingOrders.map((order, i) => (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-copper/30 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                            <Clock className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{order.deliveryWindow}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="w-3.5 h-3.5" />
                              {order.address}, {order.city}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-display font-semibold">{order.fuelAmount}L {order.fuelType}</p>
                          <div className="flex items-center gap-1 justify-end">
                            {order.isRecurring && (
                              <Badge variant="outline" className="text-xs border-sage text-sage">
                                Recurring
                              </Badge>
                            )}
                            <Badge className={getStatusColor(order.status)} variant="secondary">
                              {order.status.replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card data-testid="card-waitlist-summary">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="font-display">Waitlist</CardTitle>
                  <CardDescription>Signup pipeline</CardDescription>
                </div>
                <Link href="/owner/waitlist-analytics">
                  <Button variant="outline" size="sm" data-testid="button-view-waitlist-analytics">
                    Analytics
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {waitlistAnalytics ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="font-display text-2xl font-bold" data-testid="text-waitlist-total">
                          {waitlistAnalytics.summary.total}
                        </p>
                        <p className="text-xs text-muted-foreground">Total Signups</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="font-display text-2xl font-bold" data-testid="text-waitlist-conversion">
                          {waitlistAnalytics.summary.conversionRate.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">Converted</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5">
                        <UserPlus className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-muted-foreground">New</span>
                        <span className="font-medium">{waitlistAnalytics.statusCounts?.new ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-muted-foreground">Invited</span>
                        <span className="font-medium">{waitlistAnalytics.statusCounts?.invited ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-muted-foreground">Converted</span>
                        <span className="font-medium">{waitlistAnalytics.statusCounts?.converted ?? 0}</span>
                      </div>
                    </div>
                    {waitlistAnalytics.signupTrend.length > 0 && (() => {
                      const last7 = waitlistAnalytics.signupTrend.slice(-7);
                      const recentSignups = last7.reduce((sum, d) => sum + d.count, 0);
                      return recentSignups > 0 ? (
                        <p className="text-xs text-muted-foreground text-center">
                          {recentSignups} signup{recentSignups !== 1 ? 's' : ''} in the last 7 days
                        </p>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">Loading...</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Operations Modules</CardTitle>
            <CardDescription>Access all operations features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {opsModules.map((module, i) => (
                <motion.div
                  key={module.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setLocation(module.href)}
                  className="p-4 rounded-xl border border-border hover:border-copper/30 hover:bg-muted/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-copper/10 flex items-center justify-center group-hover:bg-copper/20 transition-colors">
                      <module.icon className="w-5 h-5 text-copper" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{module.name}</p>
                      <p className="text-sm text-muted-foreground">{module.description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </OpsLayout>
  );
}
