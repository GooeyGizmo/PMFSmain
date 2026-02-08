import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronDown, Shield, TrendingUp, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface TaxCoverageResponse {
  period: { from: string; to: string };
  balances: Record<string, number>;
  profit: {
    recognized_revenue_ex_gst_ytd: number;
    fuel_cogs_ytd: number;
    profit_proxy_ytd: number;
    method: string;
    assumed_cogs_ratio: number | null;
  };
  tax_pool: {
    current_balance: number;
    included_buckets: string[];
    excluded_buckets: string[];
  };
  kpis: {
    effective_set_aside_pct: number | null;
    expected_tax_owing: number;
    coverage_ratio: number | null;
    tax_rate_used: number;
  };
  trend: {
    month: string;
    tax_safety_pool_end: number;
    profit_proxy_ytd_end: number;
    effective_set_aside_pct: number | null;
  }[];
}

const BUCKET_LABELS: Record<string, string> = {
  operating_chequing: 'Operating Chequing',
  gst_holding: 'GST Holding',
  deferred_subscription: 'Deferred Subscription',
  income_tax_reserve: 'Income Tax Reserve',
  maintenance_reserve: 'Maintenance Reserve',
  emergency_risk: 'Emergency/Risk Fund',
  growth_capital: 'Growth Capital',
  owner_draw_holding: 'Owner Draw Holding',
};

const BUCKET_COLORS: Record<string, string> = {
  income_tax_reserve: '#ef4444',
  maintenance_reserve: '#eab308',
  emergency_risk: '#84cc16',
  growth_capital: '#06b6d4',
  owner_draw_holding: '#8b5cf6',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function getEffectiveStatus(pct: number | null): { color: string; label: string; icon: React.ReactNode } {
  if (pct === null) return { color: 'text-muted-foreground', label: 'N/A', icon: <Info className="h-4 w-4" /> };
  if (pct >= 0.25) return { color: 'text-green-600', label: 'On Target', icon: <CheckCircle2 className="h-4 w-4" /> };
  if (pct >= 0.20) return { color: 'text-yellow-600', label: 'Close', icon: <AlertTriangle className="h-4 w-4" /> };
  return { color: 'text-red-600', label: 'Below Target', icon: <AlertTriangle className="h-4 w-4" /> };
}

function getCoverageStatus(ratio: number | null): { color: string; label: string } {
  if (ratio === null) return { color: 'text-muted-foreground', label: 'N/A' };
  if (ratio >= 1.0) return { color: 'text-green-600', label: 'Fully Covered' };
  if (ratio >= 0.8) return { color: 'text-yellow-600', label: 'Partial' };
  return { color: 'text-red-600', label: 'Underfunded' };
}

export function TaxCoverageHealthWidget() {
  const [includeOwnerDraw, setIncludeOwnerDraw] = useState(true);
  const [includeGrowth, setIncludeGrowth] = useState(true);
  const [taxRate, setTaxRate] = useState('0.25');
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  const queryParams = new URLSearchParams({
    includeOwnerDraw: includeOwnerDraw ? '1' : '0',
    includeGrowth: includeGrowth ? '1' : '0',
    taxRate,
  });

  const { data, isLoading, error } = useQuery<TaxCoverageResponse>({
    queryKey: ['/api/reports/tax-coverage', includeOwnerDraw, includeGrowth, taxRate],
    queryFn: async () => {
      const res = await fetch(`/api/reports/tax-coverage?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch tax coverage data');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Tax Coverage Health
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Tax Coverage Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">Failed to load tax coverage data</p>
        </CardContent>
      </Card>
    );
  }

  const effectiveStatus = getEffectiveStatus(data.kpis.effective_set_aside_pct);
  const coverageStatus = getCoverageStatus(data.kpis.coverage_ratio);

  const poolBuckets = data.tax_pool.included_buckets;
  const poolComposition = poolBuckets.map(bucket => ({
    key: bucket,
    label: BUCKET_LABELS[bucket] || bucket,
    value: data.balances[bucket] || 0,
    color: BUCKET_COLORS[bucket] || '#94a3b8',
  }));
  const totalPool = poolComposition.reduce((sum, b) => sum + b.value, 0);

  const effectivePct = data.kpis.effective_set_aside_pct;
  const gaugePosition = effectivePct !== null ? Math.min(Math.max(effectivePct * 100, 0), 50) : 0;

  return (
    <Card className="col-span-full" data-testid="tax-coverage-widget">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Tax Coverage Health
            </CardTitle>
            <CardDescription>
              YTD tax safety pool vs. 25% target ({data.period.from} to {data.period.to})
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="include-owner-draw"
                checked={includeOwnerDraw}
                onCheckedChange={setIncludeOwnerDraw}
                data-testid="toggle-owner-draw"
              />
              <Label htmlFor="include-owner-draw" className="text-sm">Owner Draw</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="include-growth"
                checked={includeGrowth}
                onCheckedChange={setIncludeGrowth}
                data-testid="toggle-growth"
              />
              <Label htmlFor="include-growth" className="text-sm">Growth Capital</Label>
            </div>
            <Select value={taxRate} onValueChange={setTaxRate}>
              <SelectTrigger className="w-24" data-testid="select-tax-rate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.20">20%</SelectItem>
                <SelectItem value="0.25">25%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Effective Tax Set-Aside %</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-bold ${effectiveStatus.color}`} data-testid="kpi-effective-pct">
                  {formatPercent(data.kpis.effective_set_aside_pct)}
                </span>
                <Badge variant={effectivePct !== null && effectivePct >= 0.25 ? "default" : "secondary"} className="flex items-center gap-1">
                  {effectiveStatus.icon}
                  {effectiveStatus.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Target: 25–30%</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Expected Tax Owing (YTD)</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold" data-testid="kpi-expected-tax">
                {formatCurrency(data.kpis.expected_tax_owing)}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                At {(parseFloat(taxRate) * 100).toFixed(0)}% rate on {formatCurrency(data.profit.profit_proxy_ytd)} profit
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Tax Coverage Ratio</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-bold ${coverageStatus.color}`} data-testid="kpi-coverage-ratio">
                  {data.kpis.coverage_ratio !== null ? `${data.kpis.coverage_ratio.toFixed(2)}x` : '—'}
                </span>
                <Badge variant={data.kpis.coverage_ratio !== null && data.kpis.coverage_ratio >= 1 ? "default" : "secondary"}>
                  {coverageStatus.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pool: {formatCurrency(data.tax_pool.current_balance)} / Expected: {formatCurrency(data.kpis.expected_tax_owing)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tax Safety vs Target (25–30% of Profit)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-12 bg-muted rounded-lg overflow-hidden" data-testid="gauge-container">
              <div className="absolute left-[50%] top-0 bottom-0 w-px bg-muted-foreground/30" />
              <div 
                className="absolute top-0 bottom-0 w-[10%] bg-green-200/50"
                style={{ left: '25%' }}
              />
              <div className="absolute left-[25%] top-0 bottom-0 w-px bg-green-600" />
              <div className="absolute left-[30%] top-0 bottom-0 w-px bg-green-600" />
              
              {effectivePct !== null && (
                <div 
                  className="absolute top-1 bottom-1 w-3 rounded-full transition-all duration-300"
                  style={{ 
                    left: `calc(${gaugePosition}% - 6px)`,
                    backgroundColor: effectivePct >= 0.25 ? '#16a34a' : effectivePct >= 0.20 ? '#ca8a04' : '#dc2626'
                  }}
                  data-testid="gauge-needle"
                />
              )}
              
              <div className="absolute top-full mt-1 left-0 text-xs text-muted-foreground">0%</div>
              <div className="absolute top-full mt-1 left-[25%] text-xs text-green-600 -translate-x-1/2">25%</div>
              <div className="absolute top-full mt-1 left-[30%] text-xs text-green-600 -translate-x-1/2">30%</div>
              <div className="absolute top-full mt-1 left-[50%] text-xs text-muted-foreground -translate-x-1/2">50%</div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tax Safety Pool Composition</CardTitle>
              <CardDescription>Total: {formatCurrency(totalPool)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {poolComposition.map(bucket => (
                  <div key={bucket.key} className="flex items-center gap-2" data-testid={`pool-bucket-${bucket.key}`}>
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: bucket.color }} />
                    <span className="flex-1 text-sm">{bucket.label}</span>
                    <span className="font-mono text-sm">{formatCurrency(bucket.value)}</span>
                    {totalPool > 0 && (
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {((bucket.value / totalPool) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="h-4 flex rounded overflow-hidden mt-4" data-testid="composition-bar">
                {poolComposition.map(bucket => (
                  totalPool > 0 && (
                    <div
                      key={bucket.key}
                      style={{ 
                        width: `${(bucket.value / totalPool) * 100}%`,
                        backgroundColor: bucket.color
                      }}
                      title={`${bucket.label}: ${formatCurrency(bucket.value)}`}
                    />
                  )
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Effective Tax Set-Aside % Trend (Monthly)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-48" data-testid="trendline-chart">
                <svg viewBox="0 0 400 180" className="w-full h-full">
                  <rect x="0" y="0" width="400" height="180" fill="transparent" />
                  
                  <rect x="40" y={180 - (25 * 3)} width="360" height={5 * 3} fill="rgba(34, 197, 94, 0.1)" />
                  <line x1="40" y1={180 - (25 * 3)} x2="400" y2={180 - (25 * 3)} stroke="#16a34a" strokeDasharray="4" strokeWidth="1" />
                  <line x1="40" y1={180 - (30 * 3)} x2="400" y2={180 - (30 * 3)} stroke="#16a34a" strokeDasharray="4" strokeWidth="1" />
                  
                  <line x1="40" y1="0" x2="40" y2="180" stroke="#e5e7eb" strokeWidth="1" />
                  <line x1="40" y1="180" x2="400" y2="180" stroke="#e5e7eb" strokeWidth="1" />
                  
                  <text x="35" y="10" fontSize="10" textAnchor="end" fill="#6b7280">50%</text>
                  <text x="35" y={180 - (25 * 3) + 4} fontSize="10" textAnchor="end" fill="#16a34a">25%</text>
                  <text x="35" y={180 - (30 * 3) + 4} fontSize="10" textAnchor="end" fill="#16a34a">30%</text>
                  <text x="35" y="180" fontSize="10" textAnchor="end" fill="#6b7280">0%</text>
                  
                  {data.trend.length > 0 && (
                    <>
                      <polyline
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        points={data.trend
                          .filter(t => t.effective_set_aside_pct !== null)
                          .map((t, i, arr) => {
                            const x = 40 + ((i / Math.max(arr.length - 1, 1)) * 360);
                            const y = 180 - ((t.effective_set_aside_pct || 0) * 100 * 3);
                            return `${x},${Math.max(0, Math.min(180, y))}`;
                          })
                          .join(' ')}
                      />
                      {data.trend.map((t, i) => {
                        if (t.effective_set_aside_pct === null) return null;
                        const validPoints = data.trend.filter(p => p.effective_set_aside_pct !== null);
                        const validIndex = validPoints.findIndex(p => p.month === t.month);
                        const x = 40 + ((validIndex / Math.max(validPoints.length - 1, 1)) * 360);
                        const y = 180 - (t.effective_set_aside_pct * 100 * 3);
                        const color = t.effective_set_aside_pct >= 0.25 ? '#16a34a' : t.effective_set_aside_pct >= 0.20 ? '#ca8a04' : '#dc2626';
                        return (
                          <g key={t.month}>
                            <circle cx={x} cy={Math.max(5, Math.min(175, y))} r="5" fill={color} />
                            <title>
                              {t.month}: {formatPercent(t.effective_set_aside_pct)}
                              Pool: {formatCurrency(t.tax_safety_pool_end)}
                              Profit YTD: {formatCurrency(t.profit_proxy_ytd_end)}
                            </title>
                          </g>
                        );
                      })}
                    </>
                  )}
                  
                  {data.trend.length > 0 && data.trend.map((t, i) => {
                    const validPoints = data.trend.filter(p => p.effective_set_aside_pct !== null);
                    if (!validPoints.find(p => p.month === t.month)) return null;
                    const validIndex = validPoints.findIndex(p => p.month === t.month);
                    const x = 40 + ((validIndex / Math.max(validPoints.length - 1, 1)) * 360);
                    const monthLabel = t.month.split('-')[1];
                    return (
                      <text key={`label-${t.month}`} x={x} y="195" fontSize="9" textAnchor="middle" fill="#6b7280">
                        {monthLabel}
                      </text>
                    );
                  })}
                </svg>
              </div>
              {data.trend.length === 0 && (
                <p className="text-sm text-muted-foreground text-center">No trend data available yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Collapsible open={isExplanationOpen} onOpenChange={setIsExplanationOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between" data-testid="button-toggle-explanation">
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                How this is calculated
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isExplanationOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-muted/50 rounded-lg p-4 mt-2 space-y-3 text-sm" data-testid="calculation-explanation">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <h4 className="font-semibold mb-1">Tax Safety Pool Composition</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    {poolComposition.map(b => (
                      <li key={b.key}>• {b.label}: {formatCurrency(b.value)}</li>
                    ))}
                    <li className="font-semibold text-foreground">Total: {formatCurrency(totalPool)}</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Profit Calculation</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• Recognized Revenue (ex GST): {formatCurrency(data.profit.recognized_revenue_ex_gst_ytd)}</li>
                    <li>• Fuel COGS: {formatCurrency(data.profit.fuel_cogs_ytd)}</li>
                    <li className="font-semibold text-foreground">• Profit Proxy YTD: {formatCurrency(data.profit.profit_proxy_ytd)}</li>
                  </ul>
                  <p className="mt-2 text-xs">
                    Method: <Badge variant="outline">{data.profit.method}</Badge>
                    {data.profit.assumed_cogs_ratio && (
                      <span className="ml-2">(COGS ratio: {(data.profit.assumed_cogs_ratio * 100).toFixed(0)}%)</span>
                    )}
                  </p>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Exclusions</h4>
                <p className="text-muted-foreground">
                  Always excluded from tax pool: <Badge variant="secondary">GST Holding</Badge>{' '}
                  <Badge variant="secondary">Deferred Subscription Revenue</Badge>
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Trendline Method</h4>
                <p className="text-muted-foreground">
                  Cumulative YTD-to-month-end: Each point shows (Tax Pool Balance at Month End) ÷ (Profit Proxy YTD as of Month End).
                  This matches the KPI definition and smooths monthly fluctuations.
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
