import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Calculator, Fuel, TrendingUp, Route, DollarSign } from 'lucide-react';

const fuelTypeConfig = {
  regular: { label: 'Regular 87 Gas', color: 'text-red-500', bgColor: 'bg-red-500/10' },
  premium: { label: 'Premium', color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  diesel: { label: 'Diesel', color: 'text-green-500', bgColor: 'bg-green-500/10' },
};

const tierConfig = {
  payg: { name: 'Pay As You Go', deliveryFee: 19.99, discount: 0.00, monthlyFee: 0 },
  access: { name: 'ACCESS', deliveryFee: 12.49, discount: 0.03, monthlyFee: 24.99 },
  household: { name: 'HOUSEHOLD', deliveryFee: 0, discount: 0.05, monthlyFee: 49.99 },
  rural: { name: 'RURAL', deliveryFee: 0, discount: 0.07, monthlyFee: 99.99 },
};

interface DeliveryPricingData {
  fuelType: string;
  litres: string;
  pricePerLitre: string;
  subtotal: string;
}

export default function OpsCalculators() {
  const [pricing, setPricing] = useState<Record<string, DeliveryPricingData>>({
    regular: { fuelType: 'regular', litres: '60', pricePerLitre: '1.4200', subtotal: '85.20' },
    premium: { fuelType: 'premium', litres: '0', pricePerLitre: '1.6400', subtotal: '0.00' },
    diesel: { fuelType: 'diesel', litres: '0', pricePerLitre: '1.5850', subtotal: '0.00' },
  });

  const [tier, setTier] = useState<keyof typeof tierConfig>('payg');
  const [profitCalc, setProfitCalc] = useState({
    revenue: '5000',
    fuelCost: '3500',
    laborCost: '500',
    vehicleCost: '200',
    otherCost: '100',
  });

  const [routeCalc, setRouteCalc] = useState({
    totalStops: '12',
    totalDistance: '85',
    totalLitresDelivered: '720',
    fuelConsumed: '25',
    hoursWorked: '6',
  });

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      const res = await fetch('/api/fuel-pricing', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.pricing && data.pricing.length > 0) {
          data.pricing.forEach((p: any) => {
            setPricing(prev => ({
              ...prev,
              [p.fuelType]: {
                ...prev[p.fuelType],
                pricePerLitre: p.customerPrice,
              },
            }));
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
    }
  };

  const updatePricing = (fuelType: string, field: keyof DeliveryPricingData, value: string) => {
    setPricing(prev => {
      const updated = { ...prev[fuelType], [field]: value };
      if (field === 'litres' || field === 'pricePerLitre') {
        const litres = parseFloat(field === 'litres' ? value : updated.litres) || 0;
        const price = parseFloat(field === 'pricePerLitre' ? value : updated.pricePerLitre) || 0;
        updated.subtotal = (litres * price).toFixed(2);
      }
      return { ...prev, [fuelType]: updated };
    });
  };

  const tierData = tierConfig[tier];
  const totalLitres = Object.values(pricing).reduce((sum, p) => sum + (parseFloat(p.litres) || 0), 0);
  const fuelSubtotal = Object.values(pricing).reduce((sum, p) => sum + (parseFloat(p.subtotal) || 0), 0);
  const tierDiscount = totalLitres * tierData.discount;
  const deliveryFee = tierData.deliveryFee;
  const subtotalAfterDiscount = fuelSubtotal - tierDiscount + deliveryFee;
  const gst = subtotalAfterDiscount * 0.05;
  const grandTotal = subtotalAfterDiscount + gst;

  const revenue = parseFloat(profitCalc.revenue) || 0;
  const totalCosts = parseFloat(profitCalc.fuelCost) + parseFloat(profitCalc.laborCost) + parseFloat(profitCalc.vehicleCost) + parseFloat(profitCalc.otherCost);
  const grossProfit = revenue - totalCosts;
  const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const totalStops = parseFloat(routeCalc.totalStops) || 0;
  const totalDistance = parseFloat(routeCalc.totalDistance) || 0;
  const totalLitresDelivered = parseFloat(routeCalc.totalLitresDelivered) || 0;
  const fuelConsumed = parseFloat(routeCalc.fuelConsumed) || 0;
  const hoursWorked = parseFloat(routeCalc.hoursWorked) || 0;
  const avgStopsPerHour = hoursWorked > 0 ? totalStops / hoursWorked : 0;
  const avgLitresPerStop = totalStops > 0 ? totalLitresDelivered / totalStops : 0;
  const avgDistancePerStop = totalStops > 0 ? totalDistance / totalStops : 0;
  const deliveryEfficiency = fuelConsumed > 0 ? totalLitresDelivered / fuelConsumed : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/ops">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-copper" />
                <span className="font-display font-bold text-foreground">Business Calculators</span>
                <Badge variant="outline" className="text-xs border-copper/30 text-copper">Operations</Badge>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Tabs defaultValue="delivery" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="delivery" className="flex items-center gap-2">
              <Fuel className="w-4 h-4" />
              Delivery Pricing
            </TabsTrigger>
            <TabsTrigger value="profit" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Profit Margin
            </TabsTrigger>
            <TabsTrigger value="route" className="flex items-center gap-2">
              <Route className="w-4 h-4" />
              Route Efficiency
            </TabsTrigger>
          </TabsList>

          <TabsContent value="delivery" className="space-y-6 mt-6">
            <div>
              <motion.h1 
                className="font-display text-2xl font-bold text-foreground"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Delivery Pricing Calculator
              </motion.h1>
              <p className="text-muted-foreground mt-1">
                Calculate order totals with tier discounts, delivery fees, and GST
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-copper" />
                  Pricing Formula
                </CardTitle>
                <CardDescription>
                  Total = (Litres x Price/L) - Tier Discount + Delivery Fee + 5% GST
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Customer Subscription Tier</Label>
                  <Select value={tier} onValueChange={(v) => setTier(v as any)}>
                    <SelectTrigger data-testid="select-tier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(tierConfig).map(([key, t]) => (
                        <SelectItem key={key} value={key}>
                          {t.name} - ${t.monthlyFee}/mo
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {(['regular', 'premium', 'diesel'] as const).map((fuelType, i) => {
                const config = fuelTypeConfig[fuelType];
                const p = pricing[fuelType];
                
                return (
                  <motion.div
                    key={fuelType}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Card>
                      <CardHeader>
                        <CardTitle className="font-display flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                            <Fuel className={`w-4 h-4 ${config.color}`} />
                          </div>
                          {config.label}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={`${fuelType}-litres`}>Litres</Label>
                            <Input
                              id={`${fuelType}-litres`}
                              type="number"
                              step="1"
                              value={p.litres}
                              onChange={(e) => updatePricing(fuelType, 'litres', e.target.value)}
                              data-testid={`input-${fuelType}-litres`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`${fuelType}-pricePerLitre`}>Price/Litre ($)</Label>
                            <Input
                              id={`${fuelType}-pricePerLitre`}
                              type="number"
                              step="0.001"
                              value={p.pricePerLitre}
                              onChange={(e) => updatePricing(fuelType, 'pricePerLitre', e.target.value)}
                              data-testid={`input-${fuelType}-pricePerLitre`}
                            />
                          </div>
                          <div className="space-y-2 col-span-2">
                            <Label htmlFor={`${fuelType}-subtotal`}>Subtotal ($)</Label>
                            <Input
                              id={`${fuelType}-subtotal`}
                              type="text"
                              value={p.subtotal}
                              readOnly
                              className="font-semibold bg-muted"
                              data-testid={`input-${fuelType}-subtotal`}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            <Card className="bg-gradient-to-r from-copper/5 to-brass/5 border-copper/30">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-copper" />
                  Order Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fuel Subtotal ({totalLitres}L)</span>
                    <span className="font-medium">${fuelSubtotal.toFixed(2)}</span>
                  </div>
                  {tierDiscount > 0 && (
                    <div className="flex justify-between text-sm text-sage">
                      <span>Tier Discount ({tierData.name}: -{(tierData.discount * 100).toFixed(0)}c/L)</span>
                      <span>-${tierDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span className="font-medium">{deliveryFee > 0 ? `$${deliveryFee.toFixed(2)}` : 'FREE'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST (5%)</span>
                    <span className="font-medium">${gst.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between text-lg font-display">
                    <span className="font-semibold">Grand Total</span>
                    <span className="font-bold text-copper">${grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profit" className="space-y-6 mt-6">
            <div>
              <motion.h1 
                className="font-display text-2xl font-bold text-foreground"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Profit Margin Calculator
              </motion.h1>
              <p className="text-muted-foreground mt-1">
                Calculate gross profit and profit margin from revenue and costs
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display">Revenue</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Total Revenue ($)</Label>
                    <Input
                      type="number"
                      value={profitCalc.revenue}
                      onChange={(e) => setProfitCalc(prev => ({ ...prev, revenue: e.target.value }))}
                      data-testid="input-revenue"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-display">Costs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Fuel Cost ($)</Label>
                    <Input
                      type="number"
                      value={profitCalc.fuelCost}
                      onChange={(e) => setProfitCalc(prev => ({ ...prev, fuelCost: e.target.value }))}
                      data-testid="input-fuelCost"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Labor Cost ($)</Label>
                    <Input
                      type="number"
                      value={profitCalc.laborCost}
                      onChange={(e) => setProfitCalc(prev => ({ ...prev, laborCost: e.target.value }))}
                      data-testid="input-laborCost"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vehicle/Maintenance ($)</Label>
                    <Input
                      type="number"
                      value={profitCalc.vehicleCost}
                      onChange={(e) => setProfitCalc(prev => ({ ...prev, vehicleCost: e.target.value }))}
                      data-testid="input-vehicleCost"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Other Expenses ($)</Label>
                    <Input
                      type="number"
                      value={profitCalc.otherCost}
                      onChange={(e) => setProfitCalc(prev => ({ ...prev, otherCost: e.target.value }))}
                      data-testid="input-otherCost"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-gradient-to-r from-copper/5 to-brass/5 border-copper/30">
              <CardHeader>
                <CardTitle className="font-display">Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Costs</p>
                    <p className="font-display text-2xl font-bold text-foreground">${totalCosts.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Gross Profit</p>
                    <p className={`font-display text-2xl font-bold ${grossProfit >= 0 ? 'text-sage' : 'text-destructive'}`}>
                      ${grossProfit.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Profit Margin</p>
                    <p className={`font-display text-2xl font-bold ${profitMargin >= 0 ? 'text-copper' : 'text-destructive'}`}>
                      {profitMargin.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="route" className="space-y-6 mt-6">
            <div>
              <motion.h1 
                className="font-display text-2xl font-bold text-foreground"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Route Efficiency Calculator
              </motion.h1>
              <p className="text-muted-foreground mt-1">
                Analyze route performance metrics for optimization
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-display">Route Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Total Stops</Label>
                    <Input
                      type="number"
                      value={routeCalc.totalStops}
                      onChange={(e) => setRouteCalc(prev => ({ ...prev, totalStops: e.target.value }))}
                      data-testid="input-totalStops"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Distance (km)</Label>
                    <Input
                      type="number"
                      value={routeCalc.totalDistance}
                      onChange={(e) => setRouteCalc(prev => ({ ...prev, totalDistance: e.target.value }))}
                      data-testid="input-totalDistance"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Litres Delivered</Label>
                    <Input
                      type="number"
                      value={routeCalc.totalLitresDelivered}
                      onChange={(e) => setRouteCalc(prev => ({ ...prev, totalLitresDelivered: e.target.value }))}
                      data-testid="input-totalLitresDelivered"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fuel Consumed (L)</Label>
                    <Input
                      type="number"
                      value={routeCalc.fuelConsumed}
                      onChange={(e) => setRouteCalc(prev => ({ ...prev, fuelConsumed: e.target.value }))}
                      data-testid="input-fuelConsumed"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Hours Worked</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={routeCalc.hoursWorked}
                      onChange={(e) => setRouteCalc(prev => ({ ...prev, hoursWorked: e.target.value }))}
                      data-testid="input-hoursWorked"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-copper/5 to-brass/5 border-copper/30">
              <CardHeader>
                <CardTitle className="font-display">Efficiency Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Stops/Hour</p>
                    <p className="font-display text-2xl font-bold text-foreground">{avgStopsPerHour.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg L/Stop</p>
                    <p className="font-display text-2xl font-bold text-foreground">{avgLitresPerStop.toFixed(1)}L</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg km/Stop</p>
                    <p className="font-display text-2xl font-bold text-foreground">{avgDistancePerStop.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Delivery Ratio</p>
                    <p className="font-display text-2xl font-bold text-copper">{deliveryEfficiency.toFixed(1)}:1</p>
                    <p className="text-xs text-muted-foreground">L delivered per L consumed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
