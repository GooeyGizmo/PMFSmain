import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users, TrendingUp, Clock, Star, Megaphone, Fuel as FuelIcon,
  Loader2, MapPin, ArrowRight, Car, BarChart3
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { TIER_COLORS } from '@/lib/colors';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

interface AnalyticsData {
  summary: {
    total: number;
    recentSignups: number;
    conversionRate: number;
    avgDaysToConvert: number;
    avgPriorityScore: number;
    topReferral: string;
    estimatedMonthlyVolume: number;
    totalVehicles: number;
    avgVehiclesPerEntry: number;
  };
  statusCounts: Record<string, number>;
  signupTrend: Array<{ date: string; count: number; cumulative: number }>;
  geographicDistribution: Array<{ postalPrefix: string; count: number; percentage: number }>;
  cityCounts: Array<{ city: string; count: number }>;
  tierInterest: Array<{ tier: string; count: number; percentage: number }>;
  referralSources: Array<{ source: string; count: number; percentage: number }>;
  usageEstimates: Array<{ usage: string; count: number; percentage: number }>;
  fuelTypeDistribution: Array<{ fuelType: string; count: number; percentage: number }>;
  utmCampaigns: Array<{ source: string; campaign: string; count: number }>;
  priorityDistribution: Array<{ range: string; count: number }>;
  conversionFunnel: Array<{ stage: string; count: number; percentage: number }>;
}

const TIER_CHART_COLORS: Record<string, string> = {
  'Pay As You Go': '#6b7280',
  'Access': '#0891b2',
  'Seniors & Service': '#2563eb',
  'Household': '#38bdf8',
  'Rural': '#15803d',
  'VIP Concierge': '#d97706',
};

const FUEL_CHART_COLORS: Record<string, string> = {
  regular: '#ef4444',
  premium: '#f59e0b',
  diesel: '#22c55e',
};

const FUNNEL_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e'];

const POSTAL_HEAT_COLORS = [
  'bg-copper/10 text-copper border-copper/20',
  'bg-copper/20 text-copper border-copper/30',
  'bg-copper/30 text-copper border-copper/40',
  'bg-copper/50 text-white border-copper/60',
  'bg-copper/70 text-white border-copper/80',
  'bg-copper text-white border-copper',
];

function getHeatLevel(count: number, max: number): number {
  if (max <= 0) return 0;
  const ratio = count / max;
  if (ratio > 0.8) return 5;
  if (ratio > 0.6) return 4;
  if (ratio > 0.4) return 3;
  if (ratio > 0.2) return 2;
  if (ratio > 0.1) return 1;
  return 0;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1.5">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function WaitlistAnalytics() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/ops/waitlist/analytics'],
  });

  if (isLoading || !data) {
    return (
      <OpsLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-copper" />
            <p className="text-sm text-muted-foreground">Loading waitlist analytics...</p>
          </div>
        </div>
      </OpsLayout>
    );
  }

  const { summary, signupTrend, conversionFunnel, geographicDistribution, tierInterest, referralSources, usageEstimates, fuelTypeDistribution, utmCampaigns, priorityDistribution } = data;

  const maxPostalCount = geographicDistribution.length > 0 ? geographicDistribution[0].count : 0;

  const trendData = signupTrend.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
    signups: d.count,
    cumulative: d.cumulative,
  }));

  const tierPieData = tierInterest.map(t => ({
    name: t.tier,
    value: t.count,
    color: TIER_CHART_COLORS[t.tier] || '#6b7280',
  }));

  const fuelPieData = fuelTypeDistribution.map(f => ({
    name: f.fuelType.charAt(0).toUpperCase() + f.fuelType.slice(1),
    value: f.count,
    color: FUEL_CHART_COLORS[f.fuelType] || '#6b7280',
  }));

  return (
    <OpsLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground" data-testid="text-waitlist-analytics-title">
            Waitlist Analytics
          </h1>
          <p className="text-muted-foreground mt-1">Comprehensive insights into your waitlist pipeline</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="waitlist-kpi-cards">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-copper" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Signups</span>
              </div>
              <p className="font-display text-xl font-bold" data-testid="text-total-signups">{summary.total}</p>
              <p className="text-[10px] text-muted-foreground">{summary.recentSignups} last 7 days</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-sage" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Conversion</span>
              </div>
              <p className="font-display text-xl font-bold text-sage" data-testid="text-conversion-rate">{summary.conversionRate}%</p>
              <p className="text-[10px] text-muted-foreground">of total signups</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Days</span>
              </div>
              <p className="font-display text-xl font-bold" data-testid="text-avg-days">{summary.avgDaysToConvert}</p>
              <p className="text-[10px] text-muted-foreground">to convert</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Priority</span>
              </div>
              <p className="font-display text-xl font-bold" data-testid="text-avg-priority">{summary.avgPriorityScore}</p>
              <p className="text-[10px] text-muted-foreground">score</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Megaphone className="w-4 h-4 text-purple-500" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Top Referral</span>
              </div>
              <p className="font-display text-sm font-bold truncate" data-testid="text-top-referral">{summary.topReferral}</p>
              <p className="text-[10px] text-muted-foreground">source</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <FuelIcon className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Volume</span>
              </div>
              <p className="font-display text-xl font-bold" data-testid="text-est-volume">{summary.estimatedMonthlyVolume.toLocaleString()}L</p>
              <p className="text-[10px] text-muted-foreground">monthly</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-copper" />
                Signup Trend (Last 90 Days)
              </CardTitle>
              <CardDescription>Daily signups with cumulative total</CardDescription>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <div className="h-64" data-testid="chart-signup-trend">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="signups" name="Daily Signups" stroke="#b87333" fill="#b87333" fillOpacity={0.3} strokeWidth={2} />
                      <Area yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                  No signup data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-copper" />
                Conversion Funnel
              </CardTitle>
              <CardDescription>Pipeline progression</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3" data-testid="conversion-funnel">
                {conversionFunnel.map((stage, i) => {
                  const width = Math.max(stage.percentage, 8);
                  return (
                    <div key={stage.stage}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{stage.stage}</span>
                        <span className="text-xs text-muted-foreground">{stage.count} ({stage.percentage}%)</span>
                      </div>
                      <div className="h-6 w-full bg-muted/30 rounded-md overflow-hidden">
                        <div
                          className="h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2"
                          style={{ width: `${width}%`, backgroundColor: FUNNEL_COLORS[i] }}
                        >
                          {stage.count > 0 && (
                            <span className="text-[10px] font-semibold text-white">{stage.count}</span>
                          )}
                        </div>
                      </div>
                      {i < conversionFunnel.length - 1 && conversionFunnel[i].count > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {Math.round((conversionFunnel[i + 1].count / conversionFunnel[i].count) * 100)}% progress to next
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-copper" />
                Geographic Distribution
              </CardTitle>
              <CardDescription>Postal code zones by signup count</CardDescription>
            </CardHeader>
            <CardContent>
              {geographicDistribution.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2 mb-4" data-testid="geographic-heat-map">
                    {geographicDistribution.map(g => {
                      const level = getHeatLevel(g.count, maxPostalCount);
                      return (
                        <div
                          key={g.postalPrefix}
                          className={`px-3 py-2 rounded-lg border text-center min-w-[70px] ${POSTAL_HEAT_COLORS[level]}`}
                          data-testid={`postal-zone-${g.postalPrefix}`}
                        >
                          <p className="font-mono text-sm font-bold">{g.postalPrefix}</p>
                          <p className="text-[10px]">{g.count} ({g.percentage}%)</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">By Postal Prefix</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {geographicDistribution.map(g => (
                        <div key={g.postalPrefix} className="flex items-center justify-between text-xs">
                          <span className="font-mono">{g.postalPrefix}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-copper rounded-full" style={{ width: `${g.percentage}%` }} />
                            </div>
                            <span className="text-muted-foreground w-12 text-right">{g.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                  No postal code data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-copper" />
                Tier Interest
              </CardTitle>
              <CardDescription>Preferred subscription tier</CardDescription>
            </CardHeader>
            <CardContent>
              {tierPieData.length > 0 ? (
                <div className="h-56" data-testid="chart-tier-interest">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={tierPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {tierPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                  No tier data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-copper" />
                Referral Sources
              </CardTitle>
              <CardDescription>How people found you</CardDescription>
            </CardHeader>
            <CardContent>
              {referralSources.length > 0 ? (
                <div className="h-56" data-testid="chart-referral-sources">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={referralSources} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="source" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Signups" fill="#b87333" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                  No referral data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <FuelIcon className="w-4 h-4 text-copper" />
                Monthly Usage Estimates
              </CardTitle>
              <CardDescription>Expected fuel consumption</CardDescription>
            </CardHeader>
            <CardContent>
              {usageEstimates.length > 0 ? (
                <div className="h-56" data-testid="chart-usage-estimates">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usageEstimates} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="usage" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Signups" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                  No usage data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <Car className="w-4 h-4 text-copper" />
                Vehicle & Fuel Stats
              </CardTitle>
              <CardDescription>
                Avg {summary.avgVehiclesPerEntry} vehicles per lead · {summary.totalVehicles} total
              </CardDescription>
            </CardHeader>
            <CardContent>
              {fuelPieData.length > 0 ? (
                <div className="h-56" data-testid="chart-fuel-distribution">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={fuelPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {fuelPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                  No vehicle data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <Star className="w-4 h-4 text-copper" />
                Priority Score Distribution
              </CardTitle>
              <CardDescription>Who to invite next</CardDescription>
            </CardHeader>
            <CardContent>
              {priorityDistribution.length > 0 ? (
                <div className="h-56" data-testid="chart-priority-distribution">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={priorityDistribution} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Entries" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                  No priority data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {utmCampaigns.length > 0 && (
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-copper" />
                UTM Campaign Performance
              </CardTitle>
              <CardDescription>Signups by marketing campaign</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-56" data-testid="chart-utm-campaigns">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={utmCampaigns.slice(0, 10)}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="campaign" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Signups" fill="#b87333" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto" data-testid="table-utm-campaigns">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Source</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Campaign</th>
                        <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Signups</th>
                      </tr>
                    </thead>
                    <tbody>
                      {utmCampaigns.map((utm, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 px-2 text-xs">{utm.source}</td>
                          <td className="py-2 px-2 text-xs">
                            <Badge variant="outline" className="text-[10px]">{utm.campaign}</Badge>
                          </td>
                          <td className="py-2 px-2 text-xs text-right font-semibold">{utm.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </OpsLayout>
  );
}
