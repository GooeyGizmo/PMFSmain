import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useAuth } from '@/lib/auth';
import { useAllOrders } from '@/lib/api-hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { 
  Users, Truck, DollarSign, TrendingUp,
  MapPin, Clock, ArrowRight, LogOut, LayoutDashboard,
  Package, UserCog, BarChart3, Fuel, Calculator, Menu, Sun, Moon, AlertTriangle, Radio
} from 'lucide-react';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import NotificationBell from '@/components/notification-bell';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

// Helper to get Calgary date string (YYYY-MM-DD) from a Date
function getCalgaryDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Check if a scheduledDate (stored as noon UTC) is today in Calgary
function isScheduledForToday(scheduledDate: Date | string): boolean {
  const orderDate = new Date(scheduledDate);
  // Since scheduledDate is stored as noon UTC, get the UTC date portion
  const orderDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(orderDate);
  
  // Get today's date in Calgary timezone
  const todayInCalgary = getCalgaryDateString(new Date());
  
  return orderDateStr === todayInCalgary;
}

// Check if a scheduledDate is on or after today in Calgary
function isScheduledTodayOrLater(scheduledDate: Date | string): boolean {
  const orderDate = new Date(scheduledDate);
  // Get the UTC date portion of the order (stored as noon UTC)
  const orderDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(orderDate);
  
  // Get today's date in Calgary timezone
  const todayInCalgary = getCalgaryDateString(new Date());
  
  return orderDateStr >= todayInCalgary;
}

export default function OpsDashboard() {
  const { user, logout, isOwner } = useAuth();
  const [, setLocation] = useLocation();
  const { orders, isLoading } = useAllOrders();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: launchModeData } = useQuery({
    queryKey: ['/api/ops/launch-mode'],
    queryFn: async () => {
      const res = await fetch('/api/ops/launch-mode');
      if (!res.ok) throw new Error('Failed to fetch launch mode');
      return res.json();
    },
  });

  const launchModeMutation = useMutation({
    mutationFn: async (mode: 'live' | 'test') => {
      const res = await fetch('/api/ops/launch-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update launch mode');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/launch-mode'] });
      toast({ 
        title: data.isLive ? 'App is LIVE!' : 'App in TEST mode',
        description: data.message 
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  const isDark = theme === 'dark';
  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  // Active orders exclude cancelled and completed
  const activeOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'completed');
  const todayActiveOrders = activeOrders.filter(o => isScheduledForToday(o.scheduledDate));
  const completedOrders = orders.filter(o => o.status === 'completed');
  const upcomingOrders = orders.filter(o => 
    ['scheduled', 'confirmed', 'en_route'].includes(o.status) && 
    isScheduledTodayOrLater(o.scheduledDate)
  ).slice(0, 4);

  const totalRevenue = completedOrders.reduce((sum, o) => sum + parseFloat(o.total.toString()), 0);
  const totalFuel = completedOrders.reduce((sum, o) => sum + o.fuelAmount, 0);

  const stats = [
    { label: "Today's Deliveries", value: todayActiveOrders.length.toString(), change: '+3', icon: Truck, color: 'text-copper' },
    { label: 'Active Orders', value: activeOrders.length.toString(), change: '+24', icon: Users, color: 'text-sage' },
    { label: "Total Revenue", value: `$${totalRevenue.toFixed(0)}`, change: '+18%', icon: DollarSign, color: 'text-brass' },
    { label: 'Fuel Delivered', value: `${totalFuel}L`, change: '+156L', icon: Fuel, color: 'text-copper' },
  ];

  const opsModules = [
    { name: 'Order Management', icon: Package, description: 'View and manage all orders', href: '/ops/orders' },
    { name: 'Customer Management', icon: UserCog, description: 'Customer profiles and subscriptions', href: '/ops/customers' },
    { name: 'Dispatch Management', icon: Truck, description: 'Assign and track drivers', href: '/ops/dispatch' },
    { name: 'Fleet & TDG', icon: Fuel, description: 'Fleet management & fuel logs', href: '/ops/fleet' },
    { name: 'Emergency Requests', icon: AlertTriangle, description: 'After-hours emergency services', href: '/ops/emergency' },
    { name: 'Driver Management', icon: Users, description: 'Driver licenses and certifications', href: '/ops/drivers' },
    { name: 'Fuel Inventory', icon: Fuel, description: 'Track bulk inventory levels', href: '/ops/inventory' },
    { name: 'Pricing & Rates', icon: DollarSign, description: 'Manage fuel prices and fees', href: '/ops/pricing' },
    { name: 'Analytics', icon: BarChart3, description: 'Reports and insights', href: '/ops/analytics' },
    { name: 'Calculators', icon: Calculator, description: 'Business calculators', href: '/ops/calculators' },
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/pmfs-logo.png" alt="PMFS Logo" className="w-9 h-9 object-contain" />
              <div>
                <span className="font-display font-bold text-foreground">Prairie Mobile Fuel Services</span>
                <Badge variant="outline" className="ml-2 text-xs border-copper/30 text-copper">Operations</Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <NotificationBell variant="ops" />
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="ops-menu-button">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle className="font-display">Menu</SheetTitle>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(100vh-100px)] mt-6">
                    <div className="space-y-1">
                      <div className="px-3 py-4 mb-4 rounded-lg bg-muted/50">
                        <p className="font-medium text-foreground">{user?.name}</p>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                        {isOwner && <Badge variant="secondary" className="mt-2">Owner</Badge>}
                      </div>

                      {opsModules.map((item) => (
                        <Link key={item.href} href={item.href}>
                          <Button
                            variant="ghost"
                            className="w-full justify-start gap-3"
                          >
                            <item.icon className="w-4 h-4" />
                            {item.name}
                          </Button>
                        </Link>
                      ))}

                      <div className="my-4 border-t border-border" />

                      <Link href="/customer">
                        <Button
                          variant="ghost"
                          className="w-full justify-start gap-3 text-copper hover:text-copper hover:bg-copper/10"
                        >
                          <LayoutDashboard className="w-4 h-4" />
                          Customer View
                        </Button>
                      </Link>

                      {isOwner && (
                        <>
                          <div className="my-4 border-t border-border" />
                          <div className="px-3 py-3 rounded-lg bg-muted/50">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Radio className={`w-4 h-4 ${launchModeData?.isLive ? 'text-sage' : 'text-amber-500'}`} />
                                <div>
                                  <span className="text-sm font-medium">Launch Mode</span>
                                  <p className="text-xs text-muted-foreground">
                                    {launchModeData?.isLive ? 'Public access enabled' : 'Staff only (@prairiemobilefuel.ca)'}
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={launchModeData?.isLive || false}
                                onCheckedChange={(checked) => launchModeMutation.mutate(checked ? 'live' : 'test')}
                                disabled={launchModeMutation.isPending}
                                data-testid="ops-switch-launch-mode"
                              />
                            </div>
                            <div className="mt-2">
                              <Badge 
                                variant={launchModeData?.isLive ? 'default' : 'secondary'} 
                                className={launchModeData?.isLive ? 'bg-sage text-white' : 'bg-amber-100 text-amber-800'}
                              >
                                {launchModeData?.isLive ? 'LIVE' : 'TEST'}
                              </Badge>
                            </div>
                          </div>
                        </>
                      )}

                      <div className="my-4 border-t border-border" />

                      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                          <span className="text-sm font-medium">Dark Mode</span>
                        </div>
                        <Switch
                          checked={isDark}
                          onCheckedChange={toggleTheme}
                          data-testid="ops-switch-dark-mode"
                        />
                      </div>

                      <div className="my-2" />
                      
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 text-destructive hover:text-destructive"
                        onClick={handleLogout}
                        data-testid="ops-button-logout"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </Button>
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <motion.h1 
            className="font-display text-3xl font-bold text-foreground"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Operations Dashboard
          </motion.h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {user?.name}
            {isOwner && <Badge variant="secondary" className="ml-2">Owner</Badge>}
          </p>
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
                  <div className="flex items-center justify-between mb-2">
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    <Badge variant="secondary" className="text-xs bg-sage/10 text-sage">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      {stat.change}
                    </Badge>
                  </div>
                  <p className="font-display text-3xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="font-display">Today's Schedule</CardTitle>
                  <CardDescription>Upcoming deliveries for today</CardDescription>
                </div>
                <Link href="/ops/dispatch">
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
                          <Badge className={getStatusColor(order.status)} variant="secondary">
                            {order.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
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
    </div>
  );
}
