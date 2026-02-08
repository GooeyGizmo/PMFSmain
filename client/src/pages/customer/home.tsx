import React from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useVehicles, useOrders, useUpcomingOrders, useFuelPricing } from '@/lib/api-hooks';
import { subscriptionTiers } from '@/lib/mockData';
import { Fuel, Calendar, Truck, ChevronRight, ArrowRight, Clock, MapPin, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PriceHistoryItem {
  id: string;
  fuelType: string;
  customerPrice: string;
  recordedAt: string;
}

export default function CustomerHome() {
  const { user } = useAuth();
  const { vehicles, isLoading: vehiclesLoading } = useVehicles();
  const { orders, isLoading: ordersLoading } = useOrders();
  const { orders: upcomingOrders, isLoading: upcomingLoading } = useUpcomingOrders();
  const { getFuelPrice } = useFuelPricing();
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);

  const { data: priceHistoryData } = useQuery<{ history: PriceHistoryItem[] }>({
    queryKey: ['/api/fuel-pricing/history'],
  });

  const { data: frequentOrderData } = useQuery<{ hasPattern: boolean; pattern?: { vehicles: Array<{ vehicleId: string; make: string; model: string; year: string; licensePlate: string; equipmentType: string; fuelType: string; fuelAmount: number; fillToFull: boolean; tankCapacity: number }>; address: string; city: string; orderCount: number } }>({
    queryKey: ['/api/orders/frequent'],
  });

  const chartData = React.useMemo(() => {
    if (!priceHistoryData?.history) return [];
    
    const grouped: Record<string, { date: string; regular?: number; premium?: number; diesel?: number }> = {};
    
    priceHistoryData.history.forEach(item => {
      const dateKey = format(new Date(item.recordedAt), 'MMM d');
      if (!grouped[dateKey]) {
        grouped[dateKey] = { date: dateKey };
      }
      grouped[dateKey][item.fuelType as 'regular' | 'premium' | 'diesel'] = parseFloat(item.customerPrice);
    });
    
    return Object.values(grouped);
  }, [priceHistoryData]);

  const getPriceTrend = (fuelType: 'regular' | 'premium' | 'diesel') => {
    if (chartData.length < 2) return null;
    const latest = chartData[chartData.length - 1]?.[fuelType];
    const previous = chartData[chartData.length - 2]?.[fuelType];
    if (!latest || !previous) return null;
    return latest > previous ? 'up' : latest < previous ? 'down' : 'stable';
  };

  const completedOrders = orders.filter(o => o.status === 'completed');
  const totalSpent = completedOrders.reduce((acc, o) => acc + parseFloat(o.total.toString()), 0);
  const totalLitres = completedOrders.reduce((acc, o) => acc + parseFloat(o.fuelAmount.toString()), 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'confirmed': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'en_route': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'completed': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'cancelled': return 'bg-red-500/10 text-red-600 border-red-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <motion.h1 
            className="font-display text-2xl sm:text-3xl font-bold text-foreground"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Welcome back, {user?.name?.split(' ')[0]}
          </motion.h1>
          <p className="text-muted-foreground mt-1">Manage your fuel deliveries</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Upcoming', value: upcomingOrders.length, icon: Calendar, color: 'text-blue-500' },
            { label: 'Vehicles', value: vehicles.length, icon: Truck, color: 'text-copper' },
            { label: 'Total Spent', value: `$${totalSpent.toFixed(0)}`, icon: Fuel, color: 'text-brass' },
            { label: 'Litres Ordered', value: `${totalLitres}L`, icon: Fuel, color: 'text-sage' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="border-border">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center ${stat.color}`}>
                      <stat.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="font-display text-xl font-bold text-foreground">{stat.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <Card className="border-copper/20 bg-gradient-to-r from-copper/5 to-brass/5">
          <CardContent className="py-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-foreground">Need Fuel?</h3>
                <p className="text-sm text-muted-foreground">Schedule a delivery in minutes</p>
              </div>
              <Link href="/customer/book">
                <Button className="bg-copper hover:bg-copper/90 text-white font-medium" data-testid="button-book-delivery">
                  Book Delivery
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {frequentOrderData?.hasPattern && frequentOrderData.pattern && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-green-500/5">
              <CardContent className="py-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-foreground">Quick Re-Order</h3>
                      <p className="text-sm text-muted-foreground">
                        {frequentOrderData.pattern.vehicles.map(v => 
                          v.year ? `${v.year} ${v.make} ${v.model}` : `${v.make} ${v.model}`
                        ).join(' + ')}
                      </p>
                    </div>
                  </div>
                  <Link href="/customer/book?quickOrder=true">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium" data-testid="button-quick-reorder">
                      Re-Order Now
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-lg">Today's Fuel Prices</CardTitle>
              <span className="text-xs text-muted-foreground">Updated hourly</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {[
                { type: 'Regular 87 Gas', fuelKey: 'regular' as const, color: 'bg-red-500/20 text-red-500' },
                { type: 'Premium', fuelKey: 'premium' as const, color: 'bg-brass/20 text-brass' },
                { type: 'Diesel', fuelKey: 'diesel' as const, color: 'bg-sage/20 text-sage' },
              ].map((fuel) => (
                <div key={fuel.type} className="text-center p-3 rounded-xl bg-muted/50">
                  <div className={`w-8 h-8 rounded-lg ${fuel.color} mx-auto mb-2 flex items-center justify-center`}>
                    <Fuel className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{fuel.type}</p>
                  <p className="font-display font-bold text-foreground">${getFuelPrice(fuel.fuelKey).toFixed(4)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-xs text-muted-foreground">
                Prices include a convenience premium for mobile delivery direct to your location. 
                {currentTier?.deliveryFee === 0 ? (
                  <span className="font-medium text-sage"> Your {currentTier.name} plan includes free delivery!</span>
                ) : (
                  <span> Delivery fee: ${currentTier?.deliveryFee?.toFixed(2) || '24.99'}</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {chartData.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-display text-lg">Fuel Price Trends</CardTitle>
                <span className="text-xs text-muted-foreground">Last 30 days</span>
              </div>
              <div className="flex items-center gap-4 mt-2">
                {[
                  { type: 'Regular', key: 'regular' as const, color: '#ef4444' },
                  { type: 'Premium', key: 'premium' as const, color: '#d4a574' },
                  { type: 'Diesel', key: 'diesel' as const, color: '#6b9080' },
                ].map(fuel => {
                  const trend = getPriceTrend(fuel.key);
                  return (
                    <div key={fuel.key} className="flex items-center gap-1 text-xs">
                      <span style={{ color: fuel.color }}>{fuel.type}</span>
                      {trend === 'up' && <TrendingUp className="w-3 h-3 text-red-500" />}
                      {trend === 'down' && <TrendingDown className="w-3 h-3 text-green-500" />}
                    </div>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }}
                      domain={['auto', 'auto']}
                      tickFormatter={(value) => `$${value.toFixed(2)}`}
                      className="text-muted-foreground"
                    />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toFixed(4)}/L`, '']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="regular" 
                      stroke="#ef4444" 
                      strokeWidth={2}
                      dot={false}
                      name="Regular 87"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="premium" 
                      stroke="#d4a574" 
                      strokeWidth={2}
                      dot={false}
                      name="Premium"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="diesel" 
                      stroke="#6b9080" 
                      strokeWidth={2}
                      dot={false}
                      name="Diesel"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Prices shown include mobile delivery convenience premium
              </p>
            </CardContent>
          </Card>
        )}

        {upcomingOrders.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-display text-lg">Upcoming Deliveries</CardTitle>
                <Link href="/app/history">
                  <Button variant="ghost" size="sm" className="text-copper">
                    View All
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingOrders.slice(0, 2).map((order) => (
                <div
                  key={order.id}
                  className="p-4 rounded-xl border border-border bg-card hover:border-copper/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {format(order.scheduledDate, 'EEEE, MMMM d')}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{order.deliveryWindow}</span>
                      </div>
                    </div>
                    <Badge className={getStatusColor(order.status)} variant="outline">
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{order.address}</span>
                    </div>
                    <span className="font-display font-semibold text-foreground">
                      {order.fuelAmount}L · ${parseFloat(order.total.toString()).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

      </div>
  );
}
