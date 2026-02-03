import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BarChart3, TrendingUp, TrendingDown, Calendar, LineChart } from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';

type NetMarginPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all';

interface NetMarginDataPointRaw {
  date: string;
  netMarginPercent: number;
  totalRevenue: number;
  netProfit: number;
  ordersCompleted: number;
}

interface NetMarginDataPoint {
  date: string;
  label: string;
  netMarginPct: number;
  totalRevenue: number;
  netProfit: number;
  ordersCompleted: number;
}

interface NetMarginCalculatorProps {
  embedded?: boolean;
}

export default function NetMarginCalculator({ embedded = false }: NetMarginCalculatorProps) {
  const [period, setPeriod] = useState<NetMarginPeriod>('monthly');

  const { data: netMarginDataRaw, isLoading } = useQuery<{ 
    period: string; 
    data: NetMarginDataPointRaw[];
    businessStartDate: string;
  }>({
    queryKey: ['/api/ops/analytics/net-margin', period],
    queryFn: async () => {
      const res = await fetch(`/api/ops/analytics/net-margin?period=${period}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch net margin data');
      return res.json();
    },
  });

  const formatDateLabel = (date: string, p: NetMarginPeriod): string => {
    if (p === 'monthly') {
      const [year, month] = date.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
    }
    if (p === 'weekly') {
      const d = new Date(date);
      return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (p === 'yearly' || p === 'all' || p === 'daily') {
      const d = new Date(date);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return date;
  };

  const netMarginData = useMemo(() => {
    if (!netMarginDataRaw) return null;
    return {
      ...netMarginDataRaw,
      data: netMarginDataRaw.data.map((d) => ({
        date: d.date,
        label: formatDateLabel(d.date, period),
        netMarginPct: d.netMarginPercent,
        totalRevenue: d.totalRevenue,
        netProfit: d.netProfit,
        ordersCompleted: d.ordersCompleted,
      })) as NetMarginDataPoint[],
    };
  }, [netMarginDataRaw, period]);

  const stats = useMemo(() => {
    if (!netMarginData?.data || netMarginData.data.length === 0) {
      return { avg: 0, min: 0, max: 0, current: 0, trend: 'neutral' as const, totalRevenue: 0, totalProfit: 0 };
    }

    const margins = netMarginData.data.map(d => d.netMarginPct);
    const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
    const min = Math.min(...margins);
    const max = Math.max(...margins);
    const current = margins[margins.length - 1];
    const totalRevenue = netMarginData.data.reduce((sum, d) => sum + d.totalRevenue, 0);
    const totalProfit = netMarginData.data.reduce((sum, d) => sum + d.netProfit, 0);

    let trend: 'up' | 'down' | 'neutral' = 'neutral';
    if (margins.length >= 2) {
      const recent = margins.slice(-3);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const earlier = margins.slice(0, -3);
      if (earlier.length > 0) {
        const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
        if (recentAvg > earlierAvg + 1) trend = 'up';
        else if (recentAvg < earlierAvg - 1) trend = 'down';
      }
    }

    return { avg, min, max, current, trend, totalRevenue, totalProfit };
  }, [netMarginData]);

  const content = (
    <main className={embedded ? "space-y-6" : "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6"}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <Link href="/owner/finance">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-copper" />
            <span className="font-display font-bold text-foreground">Net Margin Tracker</span>
          </div>
        </div>
      )}

        <div className="grid md:grid-cols-4 gap-4">
          <Card className={`border-2 ${stats.current >= 0 ? 'border-sage/30 bg-gradient-to-br from-sage/5 to-sage/10' : 'border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10'}`}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                {stats.current >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-sage" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-amber-500" />
                )}
                <span className="text-sm text-muted-foreground">Current</span>
              </div>
              <p className={`font-display text-3xl font-bold ${stats.current >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                {stats.current.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-copper" />
                <span className="text-sm text-muted-foreground">Average</span>
              </div>
              <p className="font-display text-3xl font-bold">{stats.avg.toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">Min</span>
              </div>
              <p className="font-display text-3xl font-bold">{stats.min.toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-sage" />
                <span className="text-sm text-muted-foreground">Max</span>
              </div>
              <p className="font-display text-3xl font-bold">{stats.max.toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="font-display flex items-center gap-2">
                <LineChart className="w-5 h-5 text-sage" />
                Net Margin History
              </CardTitle>
              <CardDescription>Track profitability trends over time</CardDescription>
            </div>
            <div className="flex gap-1">
              {(['daily', 'weekly', 'monthly', 'yearly', 'all'] as NetMarginPeriod[]).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPeriod(p)}
                  className={period === p ? 'bg-prairie-600 hover:bg-prairie-700' : ''}
                  data-testid={`btn-period-${p}`}
                >
                  {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-80 flex items-center justify-center">
                <div className="text-muted-foreground">Loading chart data...</div>
              </div>
            ) : netMarginData?.data && netMarginData.data.length > 0 ? (
              <div className="h-80" data-testid="netmargin-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={netMarginData.data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="positiveArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6b9e71" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6b9e71" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="negativeArea" x1="0" y1="1" x2="0" y2="0">
                        <stop offset="5%" stopColor="#d97706" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 12 }} 
                      tickLine={false}
                      axisLine={{ stroke: '#e5e5e5' }}
                    />
                    <YAxis 
                      tickFormatter={(value) => `${value}%`}
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e5e5' }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      formatter={(value: number, name: string) => {
                        if (name === 'netMarginPct') return [`${value.toFixed(1)}%`, 'Net Margin'];
                        return [value, name];
                      }}
                      labelFormatter={(label) => label}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <ReferenceLine y={0} stroke="#888" strokeWidth={2} strokeDasharray="5 5" />
                    <Area
                      type="monotone"
                      dataKey="netMarginPct"
                      stroke="none"
                      fill="url(#positiveArea)"
                      fillOpacity={1}
                    />
                    <Line
                      type="monotone"
                      dataKey="netMarginPct"
                      stroke="#6b9e71"
                      strokeWidth={3}
                      dot={{ fill: '#6b9e71', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: '#6b9e71', strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center text-muted-foreground">
                <LineChart className="w-12 h-12 mb-3 opacity-50" />
                <p>No data available for this period</p>
                <p className="text-xs mt-1">Net margin data is logged daily at 10pm Calgary time</p>
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-4 flex items-center gap-4">
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-sage" />
                Positive margin (profitable)
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-amber-600" />
                Negative margin (loss)
              </span>
              <span className="ml-auto text-muted-foreground/70">
                Data logged daily at 10pm Calgary time
              </span>
            </div>
          </CardContent>
        </Card>

        {netMarginData?.data && netMarginData.data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Calendar className="w-5 h-5 text-copper" />
                Period Summary
              </CardTitle>
              <CardDescription>Aggregated metrics for the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-muted">
                  <div className="text-sm text-muted-foreground mb-1">Total Revenue</div>
                  <div className="font-display text-xl font-bold">${stats.totalRevenue.toFixed(0)}</div>
                </div>
                <div className="p-4 rounded-xl bg-muted">
                  <div className="text-sm text-muted-foreground mb-1">Total Profit</div>
                  <div className={`font-display text-xl font-bold ${stats.totalProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                    ${stats.totalProfit.toFixed(0)}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-muted">
                  <div className="text-sm text-muted-foreground mb-1">Data Points</div>
                  <div className="font-display text-xl font-bold">{netMarginData.data.length}</div>
                </div>
                <div className="p-4 rounded-xl bg-muted">
                  <div className="text-sm text-muted-foreground mb-1">Trend</div>
                  <div className="flex items-center gap-2">
                    {stats.trend === 'up' && <TrendingUp className="w-5 h-5 text-sage" />}
                    {stats.trend === 'down' && <TrendingDown className="w-5 h-5 text-amber-500" />}
                    {stats.trend === 'neutral' && <BarChart3 className="w-5 h-5 text-muted-foreground" />}
                    <Badge className={
                      stats.trend === 'up' ? 'bg-sage' : 
                      stats.trend === 'down' ? 'bg-amber-500' : 
                      'bg-muted-foreground'
                    }>
                      {stats.trend === 'up' ? 'Improving' : stats.trend === 'down' ? 'Declining' : 'Stable'}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {netMarginData?.data && netMarginData.data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Historical Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-right py-2 px-3">Net Margin</th>
                      <th className="text-right py-2 px-3">Revenue</th>
                      <th className="text-right py-2 px-3">Profit</th>
                      <th className="text-right py-2 px-3">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...netMarginData.data].reverse().map((row, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2 px-3">{row.label}</td>
                        <td className={`text-right py-2 px-3 font-medium ${row.netMarginPct >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                          {row.netMarginPct.toFixed(1)}%
                        </td>
                        <td className="text-right py-2 px-3">${row.totalRevenue.toFixed(0)}</td>
                        <td className={`text-right py-2 px-3 ${row.netProfit >= 0 ? 'text-sage' : 'text-amber-600'}`}>
                          ${row.netProfit.toFixed(0)}
                        </td>
                        <td className="text-right py-2 px-3">{row.ordersCompleted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
    </main>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
