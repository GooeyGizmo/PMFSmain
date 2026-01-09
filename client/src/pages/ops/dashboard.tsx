import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Droplets, Users, Truck, DollarSign, TrendingUp, Calendar, 
  Settings, MapPin, Clock, ArrowRight, Bell, LogOut, LayoutDashboard,
  Package, UserCog, BarChart3, Fuel
} from 'lucide-react';
import { useLocation } from 'wouter';

export default function OpsDashboard() {
  const { user, logout, isOwner } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  const stats = [
    { label: "Today's Deliveries", value: '12', change: '+3', icon: Truck, color: 'text-copper' },
    { label: 'Active Customers', value: '847', change: '+24', icon: Users, color: 'text-sage' },
    { label: "Today's Revenue", value: '$2,847', change: '+18%', icon: DollarSign, color: 'text-brass' },
    { label: 'Fuel Delivered', value: '1,245L', change: '+156L', icon: Fuel, color: 'text-copper' },
  ];

  const upcomingDeliveries = [
    { id: '1', customer: 'John Smith', address: '123 Main St SW, Calgary', time: '9:00 AM', status: 'confirmed', fuel: '60L Regular' },
    { id: '2', customer: 'Sarah Johnson', address: '456 Oak Ave NW, Calgary', time: '10:30 AM', status: 'en_route', fuel: '45L Premium' },
    { id: '3', customer: 'Mike Wilson', address: '789 Elm Rd, Airdrie', time: '1:00 PM', status: 'scheduled', fuel: '80L Diesel' },
    { id: '4', customer: 'Prairie Ranch', address: '1234 Rural Rte 5, Okotoks', time: '3:00 PM', status: 'scheduled', fuel: '200L Diesel' },
  ];

  const opsModules = [
    { name: 'Order Management', icon: Package, description: 'View and manage all orders', href: '/ops/orders' },
    { name: 'Customer Management', icon: UserCog, description: 'Customer profiles and subscriptions', href: '/ops/customers' },
    { name: 'Driver Dispatch', icon: Truck, description: 'Assign and track drivers', href: '/ops/dispatch' },
    { name: 'Fuel Inventory', icon: Fuel, description: 'Track fuel levels and orders', href: '/ops/inventory' },
    { name: 'Pricing & Rates', icon: DollarSign, description: 'Manage fuel prices and fees', href: '/ops/pricing' },
    { name: 'Analytics', icon: BarChart3, description: 'Reports and insights', href: '/ops/analytics' },
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
              <img src="/attached_assets/file_000000001a7871f594d47881aac7b189_1767992393711.png" alt="PMFS Logo" className="w-9 h-9 object-contain" />
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
              <Button variant="ghost" size="icon">
                <Bell className="w-5 h-5" />
              </Button>
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
                  {upcomingDeliveries.map((delivery, i) => (
                    <motion.div
                      key={delivery.id}
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
                          <p className="font-medium text-foreground">{delivery.customer}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="w-3.5 h-3.5" />
                            {delivery.address}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-display font-semibold">{delivery.time}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-muted-foreground">{delivery.fuel}</span>
                          <Badge className={getStatusColor(delivery.status)} variant="secondary">
                            {delivery.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {opsModules.slice(0, 4).map((module, i) => (
                  <motion.div
                    key={module.name}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Button 
                      variant="outline" 
                      className="w-full justify-start h-auto py-3"
                      onClick={() => setLocation(module.href)}
                    >
                      <module.icon className="w-4 h-4 mr-3 text-copper" />
                      <div className="text-left">
                        <p className="font-medium">{module.name}</p>
                        <p className="text-xs text-muted-foreground">{module.description}</p>
                      </div>
                    </Button>
                  </motion.div>
                ))}
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
