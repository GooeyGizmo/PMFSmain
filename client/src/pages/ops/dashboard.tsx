import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useAllOrders } from '@/lib/api-hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, Truck, DollarSign, TrendingUp,
  MapPin, Clock, ArrowRight, LogOut, LayoutDashboard,
  Package, UserCog, BarChart3, Fuel, Calculator
} from 'lucide-react';
import { useLocation } from 'wouter';
import { format, isToday, isAfter } from 'date-fns';
import NotificationBell from '@/components/notification-bell';

export default function OpsDashboard() {
  const { user, logout, isOwner } = useAuth();
  const [, setLocation] = useLocation();
  const { orders, isLoading } = useAllOrders();

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  const todayOrders = orders.filter(o => isToday(o.scheduledDate));
  const completedOrders = orders.filter(o => o.status === 'completed');
  const upcomingOrders = orders.filter(o => 
    ['scheduled', 'confirmed', 'en_route'].includes(o.status) && 
    isAfter(o.scheduledDate, new Date())
  ).slice(0, 4);

  const totalRevenue = completedOrders.reduce((sum, o) => sum + parseFloat(o.total.toString()), 0);
  const totalFuel = completedOrders.reduce((sum, o) => sum + o.fuelAmount, 0);

  const stats = [
    { label: "Today's Deliveries", value: todayOrders.length.toString(), change: '+3', icon: Truck, color: 'text-copper' },
    { label: 'Total Orders', value: orders.length.toString(), change: '+24', icon: Users, color: 'text-sage' },
    { label: "Total Revenue", value: `$${totalRevenue.toFixed(0)}`, change: '+18%', icon: DollarSign, color: 'text-brass' },
    { label: 'Fuel Delivered', value: `${totalFuel}L`, change: '+156L', icon: Fuel, color: 'text-copper' },
  ];

  const opsModules = [
    { name: 'Order Management', icon: Package, description: 'View and manage all orders', href: '/ops/orders' },
    { name: 'Customer Management', icon: UserCog, description: 'Customer profiles and subscriptions', href: '/ops/customers' },
    { name: 'Driver Dispatch', icon: Truck, description: 'Assign and track drivers', href: '/ops/dispatch' },
    { name: 'Fuel Inventory', icon: Fuel, description: 'Track fuel levels and orders', href: '/ops/inventory' },
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
              <Link href="/customer">
                <Button variant="outline" size="sm">
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Customer View
                </Button>
              </Link>
              <NotificationBell variant="ops" />
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="w-5 h-5" />
              </Button>
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
                <Button variant="outline" size="sm">
                  View All
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
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
                            <p className="font-medium text-foreground">{format(order.scheduledDate, 'h:mm a')}</p>
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
