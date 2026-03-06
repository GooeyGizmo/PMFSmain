import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, DollarSign, Fuel, Save, RefreshCw, Calculator, TrendingUp, Loader2
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface FuelPricingData {
  fuelType: string;
  baseCost: string;
  markupPercent: string;
  markupFlat: string;
  customerPrice: string;
}

interface HistoryRecord {
  fuelType: string;
  customerPrice: string;
  baseCost: string | null;
  markupPercent: string | null;
  markupFlat: string | null;
  recordedAt: string;
}

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  regularBaseCost?: number;
  premiumBaseCost?: number;
  dieselBaseCost?: number;
  regularMarkup?: number;
  premiumMarkup?: number;
  dieselMarkup?: number;
  regularCustomerPrice?: number;
  premiumCustomerPrice?: number;
  dieselCustomerPrice?: number;
}

const fuelTypeConfig = {
  regular: { label: 'Regular 87 Gas', color: 'text-red-500', bgColor: 'bg-red-500/10' },
  premium: { label: 'Premium', color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  diesel: { label: 'Diesel', color: 'text-green-500', bgColor: 'bg-green-500/10' },
};

const CHART_COLORS = {
  regular: '#ef4444',
  premium: '#f59e0b',
  diesel: '#22c55e',
};

const DAY_OPTIONS = [
  { label: '30 Days', value: 30 },
  { label: '60 Days', value: 60 },
  { label: '90 Days', value: 90 },
];

function transformHistoryToChartData(history: HistoryRecord[]): ChartDataPoint[] {
  const grouped: Record<string, Record<string, HistoryRecord>> = {};

  for (const record of history) {
    const localDate = new Date(record.recordedAt);
    const date = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
    if (!grouped[date]) grouped[date] = {};
    grouped[date][record.fuelType] = record;
  }

  const sortedDates = Object.keys(grouped).sort();

  return sortedDates.map(date => {
    const [y, m, d] = date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dateLabel = dateObj.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    const point: ChartDataPoint = { date, dateLabel };
    const records = grouped[date];

    for (const fuelType of ['regular', 'premium', 'diesel'] as const) {
      const r = records[fuelType];
      if (!r) continue;

      const baseCost = parseFloat(r.baseCost || '0');
      const customerPrice = parseFloat(r.customerPrice || '0');
      const totalMarkup = customerPrice - baseCost;

      if (fuelType === 'regular') {
        point.regularBaseCost = baseCost;
        point.regularMarkup = totalMarkup;
        point.regularCustomerPrice = customerPrice;
      } else if (fuelType === 'premium') {
        point.premiumBaseCost = baseCost;
        point.premiumMarkup = totalMarkup;
        point.premiumCustomerPrice = customerPrice;
      } else {
        point.dieselBaseCost = baseCost;
        point.dieselMarkup = totalMarkup;
        point.dieselCustomerPrice = customerPrice;
      }
    }

    return point;
  });
}

function PriceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1.5">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">${entry.value?.toFixed(4)}</span>
        </div>
      ))}
    </div>
  );
}

export default function OpsPricing({ embedded }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pricing, setPricing] = useState<Record<string, FuelPricingData>>({
    regular: { fuelType: 'regular', baseCost: '1.2000', markupPercent: '10', markupFlat: '0.10', customerPrice: '1.4200' },
    premium: { fuelType: 'premium', baseCost: '1.4000', markupPercent: '10', markupFlat: '0.10', customerPrice: '1.6400' },
    diesel: { fuelType: 'diesel', baseCost: '1.3500', markupPercent: '10', markupFlat: '0.10', customerPrice: '1.5850' },
  });

  const [historyDays, setHistoryDays] = useState(30);
  const [historyData, setHistoryData] = useState<ChartDataPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    fetchPricing();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [historyDays]);

  const fetchPricing = async () => {
    try {
      const res = await fetch('/api/fuel-pricing', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.pricing && data.pricing.length > 0) {
          const pricingMap: Record<string, FuelPricingData> = {};
          data.pricing.forEach((p: any) => {
            pricingMap[p.fuelType] = {
              fuelType: p.fuelType,
              baseCost: p.baseCost,
              markupPercent: p.markupPercent,
              markupFlat: p.markupFlat,
              customerPrice: p.customerPrice,
            };
          });
          setPricing(prev => ({ ...prev, ...pricingMap }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/fuel-pricing/history?days=${historyDays}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const chartData = transformHistoryToChartData(data.history || []);
        setHistoryData(chartData);
      }
    } catch (error) {
      console.error('Failed to fetch price history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const updatePricing = (fuelType: string, field: keyof FuelPricingData, value: string) => {
    setPricing(prev => {
      const updated = { ...prev[fuelType], [field]: value };
      
      if (field === 'baseCost' || field === 'markupPercent' || field === 'markupFlat') {
        const baseCost = parseFloat(field === 'baseCost' ? value : updated.baseCost) || 0;
        const markupPercent = parseFloat(field === 'markupPercent' ? value : updated.markupPercent) || 0;
        const markupFlat = parseFloat(field === 'markupFlat' ? value : updated.markupFlat) || 0;
        
        const percentMarkup = baseCost * (markupPercent / 100);
        const customerPrice = baseCost + percentMarkup + markupFlat;
        updated.customerPrice = customerPrice.toFixed(4);
      }
      
      return { ...prev, [fuelType]: updated };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const pricingArray = Object.values(pricing);
      const res = await fetch('/api/ops/fuel-pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pricing: pricingArray }),
      });

      if (res.ok) {
        toast({ title: 'Pricing Updated', description: 'Fuel prices have been updated app-wide.' });
        fetchHistory();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.message || 'Failed to update pricing', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update pricing', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const content = (
    <div className="space-y-6">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        {!embedded && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <Link href="/ops">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <span className="font-display font-bold text-foreground">Pricing & Rates</span>
              </div>
            </div>
            <div>
              <motion.h1 
                className="font-display text-2xl font-bold text-foreground"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Fuel Pricing Management
              </motion.h1>
              <p className="text-muted-foreground mt-1">
                Set base costs, markups, and customer prices for each fuel type
              </p>
            </div>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Calculator className="w-5 h-5 text-copper" />
              Pricing Formula
            </CardTitle>
            <CardDescription>
              Customer Price = Base Cost + (Base Cost × Markup %) + Flat Markup
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <DollarSign className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">How pricing works</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Base Cost:</strong> Your wholesale cost per litre</li>
                  <li><strong>Markup %:</strong> Percentage added to base cost</li>
                  <li><strong>Flat Markup:</strong> Fixed amount added per litre</li>
                  <li><strong>Customer Price:</strong> What customers pay per litre</li>
                </ul>
              </div>
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
                        <Label htmlFor={`${fuelType}-baseCost`}>Base Cost ($/L)</Label>
                        <Input
                          id={`${fuelType}-baseCost`}
                          type="number"
                          step="0.001"
                          value={p.baseCost}
                          onChange={(e) => updatePricing(fuelType, 'baseCost', e.target.value)}
                          data-testid={`input-${fuelType}-baseCost`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${fuelType}-markupPercent`}>Markup %</Label>
                        <Input
                          id={`${fuelType}-markupPercent`}
                          type="number"
                          step="0.1"
                          value={p.markupPercent}
                          onChange={(e) => updatePricing(fuelType, 'markupPercent', e.target.value)}
                          data-testid={`input-${fuelType}-markupPercent`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${fuelType}-markupFlat`}>Flat Markup ($/L)</Label>
                        <Input
                          id={`${fuelType}-markupFlat`}
                          type="number"
                          step="0.001"
                          value={p.markupFlat}
                          onChange={(e) => updatePricing(fuelType, 'markupFlat', e.target.value)}
                          data-testid={`input-${fuelType}-markupFlat`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${fuelType}-customerPrice`}>Customer Price ($/L)</Label>
                        <Input
                          id={`${fuelType}-customerPrice`}
                          type="number"
                          step="0.001"
                          value={p.customerPrice}
                          onChange={(e) => updatePricing(fuelType, 'customerPrice', e.target.value)}
                          className="font-semibold"
                          data-testid={`input-${fuelType}-customerPrice`}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <div className="flex justify-end pt-4">
          <Button
            className="bg-copper hover:bg-copper/90"
            onClick={handleSave}
            disabled={isSaving}
            data-testid="button-save-pricing"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save All Pricing
              </>
            )}
          </Button>
        </div>

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-copper" />
              <h2 className="font-display text-xl font-bold">Price History</h2>
            </div>
            <div className="flex gap-1" data-testid="history-day-selector">
              {DAY_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  variant={historyDays === opt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setHistoryDays(opt.value)}
                  className={historyDays === opt.value ? 'bg-copper hover:bg-copper/90' : ''}
                  data-testid={`button-history-${opt.value}d`}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-copper" />
            </div>
          ) : historyData.length < 2 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Not enough price history yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Charts will appear after you update pricing on at least 2 different days.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-copper" />
                    Base Cost Trends (Wholesale $/L)
                  </CardTitle>
                  <CardDescription>Your wholesale cost per litre over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64" data-testid="chart-base-cost">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                        <Tooltip content={<PriceTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="regularBaseCost" name="Regular 87" stroke={CHART_COLORS.regular} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="premiumBaseCost" name="Premium" stroke={CHART_COLORS.premium} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="dieselBaseCost" name="Diesel" stroke={CHART_COLORS.diesel} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-copper" />
                    Markup Trends (Total $/L)
                  </CardTitle>
                  <CardDescription>Your combined markup per litre (% markup + flat markup)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64" data-testid="chart-markup">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                        <Tooltip content={<PriceTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="regularMarkup" name="Regular 87" stroke={CHART_COLORS.regular} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="premiumMarkup" name="Premium" stroke={CHART_COLORS.premium} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="dieselMarkup" name="Diesel" stroke={CHART_COLORS.diesel} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base flex items-center gap-2">
                    <Fuel className="w-4 h-4 text-copper" />
                    Customer Price Trends ($/L)
                  </CardTitle>
                  <CardDescription>What your customers pay per litre over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64" data-testid="chart-customer-price">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                        <Tooltip content={<PriceTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="regularCustomerPrice" name="Regular 87" stroke={CHART_COLORS.regular} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="premiumCustomerPrice" name="Premium" stroke={CHART_COLORS.premium} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="dieselCustomerPrice" name="Diesel" stroke={CHART_COLORS.diesel} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

      </main>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
