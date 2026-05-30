import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import {
  TrendingUp, BarChart2, RefreshCw, Plus, Trash2, Building2,
  Download, Clock, Database, Fuel, ChevronRight, AlertCircle, Lock
} from "lucide-react";
import { format, formatDistanceToNow, parseISO, subDays } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PumpPrice {
  id: string;
  fuelCategory: string;
  gradeLabel: string;
  sourceType: string;
  sourceLabel: string;
  pricePerLitre: string;
  observedAt: string;
  locationLabel?: string;
  notes?: string;
}

interface WholesaleSnapshot {
  id: string;
  fuelCategory: string;
  gradeLabel: string;
  sourceLabel: string;
  pricePerLitre: string;
  effectiveDate: string;
  sourceType: string;
}

interface Station {
  id: string;
  name: string;
  brand?: string;
  address?: string;
  postalCode?: string;
  isActive: boolean;
  notes?: string;
}

interface MarketSummary {
  grades: Array<{
    fuelCategory: string;
    gradeLabel: string;
    latestPrice: string | null;
    sourceLabel: string | null;
    observedAt: string | null;
    delta7d: string | null;
    pmfsCustomerPrice: string | null;
  }>;
  lastNrcanImport: string | null;
  totalObservations: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FUEL_GRADES = [
  { category: "regular", label: "Regular 87" },
  { category: "midgrade", label: "Mid-Grade 89" },
  { category: "premium", label: "Premium 91" },
  { category: "ultra", label: "Ultra 94" },
  { category: "diesel", label: "Diesel" },
  { category: "e85", label: "E85" },
  { category: "e10", label: "E10" },
  { category: "other", label: "Other / Custom" },
];

const CATEGORY_COLORS: Record<string, string> = {
  regular: "#ef4444",
  midgrade: "#f97316",
  premium: "#f59e0b",
  ultra: "#a855f7",
  diesel: "#22c55e",
  e85: "#06b6d4",
  e10: "#3b82f6",
  other: "#6b7280",
};

const CATEGORY_DOT: Record<string, string> = {
  regular: "bg-red-500",
  midgrade: "bg-orange-500",
  premium: "bg-amber-500",
  ultra: "bg-purple-500",
  diesel: "bg-emerald-600",
  e85: "bg-cyan-500",
  e10: "bg-blue-500",
  other: "bg-gray-500",
};

const DATE_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1yr", days: 365 },
  { label: "All", days: 3650 },
];

// ─── Custom tooltips ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm min-w-[160px]">
      <p className="font-medium mb-1.5 text-muted-foreground">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground text-xs">{entry.name}</span>
          </div>
          <span className="font-semibold">{typeof entry.value === 'number' ? `$${entry.value.toFixed(3)}/L` : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function SpreadChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  // Group keys by grade name — keys are "Grade (cost)" and "Grade (pump)"
  const byGrade: Record<string, { cost?: number; pump?: number; costColor?: string; pumpColor?: string }> = {};
  for (const entry of payload) {
    if (typeof entry.value !== 'number') continue;
    const costMatch = (entry.name as string).match(/^(.+) \(cost\)$/);
    const pumpMatch = (entry.name as string).match(/^(.+) \(pump\)$/);
    if (costMatch) {
      const grade = costMatch[1];
      if (!byGrade[grade]) byGrade[grade] = {};
      byGrade[grade].cost = entry.value;
      byGrade[grade].costColor = entry.color;
    } else if (pumpMatch) {
      const grade = pumpMatch[1];
      if (!byGrade[grade]) byGrade[grade] = {};
      byGrade[grade].pump = entry.value;
      byGrade[grade].pumpColor = entry.color;
    }
  }

  const gradeEntries = Object.entries(byGrade);

  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm min-w-[200px]">
      <p className="font-medium mb-2 text-muted-foreground">{label}</p>
      {gradeEntries.map(([grade, vals]) => {
        const spread = vals.pump !== undefined && vals.cost !== undefined
          ? vals.pump - vals.cost
          : null;
        return (
          <div key={grade} className="mb-2 last:mb-0">
            <p className="text-xs font-semibold text-foreground mb-1">{grade}</p>
            {vals.cost !== undefined && (
              <div className="flex justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: vals.costColor }} />
                  <span className="text-muted-foreground text-xs">UFA cost</span>
                </div>
                <span className="font-mono text-xs">${vals.cost.toFixed(3)}/L</span>
              </div>
            )}
            {vals.pump !== undefined && (
              <div className="flex justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: vals.pumpColor }} />
                  <span className="text-muted-foreground text-xs">Pump avg</span>
                </div>
                <span className="font-mono text-xs">${vals.pump.toFixed(3)}/L</span>
              </div>
            )}
            {spread !== null && (
              <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-border">
                <span className="text-muted-foreground text-xs">Station margin</span>
                <span className={`font-semibold text-xs ${spread >= 0 ? 'text-green-600' : 'text-amber-500'}`}>
                  {spread >= 0 ? '+' : ''}{(spread * 100).toFixed(1)}¢/L
                </span>
              </div>
            )}
          </div>
        );
      })}
      {gradeEntries.length === 0 && payload.map((entry: any, i: number) => (
        <div key={i} className="flex justify-between gap-4">
          <span className="text-muted-foreground text-xs">{entry.name}</span>
          <span className="font-mono text-xs">${entry.value?.toFixed(3)}/L</span>
        </div>
      ))}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [rangeDays, setRangeDays] = useState(30);

  const { data: summaryData } = useQuery<MarketSummary>({
    queryKey: ["/api/owner/market/summary"],
  });

  const { data: trendData } = useQuery<{ prices: PumpPrice[] }>({
    queryKey: ["/api/owner/market/pump-prices/trend", rangeDays],
    queryFn: () => fetch(`/api/owner/market/pump-prices/trend?days=${rangeDays}`).then(r => r.json()),
  });

  const { data: wholesaleData } = useQuery<{ snapshots: WholesaleSnapshot[] }>({
    queryKey: ["/api/owner/market/wholesale", rangeDays],
    queryFn: () => fetch(`/api/owner/market/wholesale?days=${rangeDays}`).then(r => r.json()),
  });

  const { data: recentData } = useQuery<{ prices: PumpPrice[] }>({
    queryKey: ["/api/owner/market/pump-prices", "recent"],
    queryFn: () => fetch(`/api/owner/market/pump-prices?limit=20`).then(r => r.json()),
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/owner/market/pump-prices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/pump-prices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/summary"] });
      toast({ title: "Observation deleted" });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err?.message, variant: "destructive" }),
  });

  // Build trend chart data
  const trendChartData = useMemo(() => {
    if (!trendData?.prices?.length) return [];
    const prices = trendData.prices;
    const byDate: Record<string, Record<string, number>> = {};
    for (const p of prices) {
      const day = format(new Date(p.observedAt), "MMM d");
      if (!byDate[day]) byDate[day] = {};
      // Use earliest price per day per category (so chart makes sense)
      if (byDate[day][p.gradeLabel] === undefined) {
        byDate[day][p.gradeLabel] = parseFloat(p.pricePerLitre);
      }
    }
    return Object.entries(byDate)
      .map(([date, vals]) => ({ date, ...vals }))
      .slice(-60); // max 60 data points
  }, [trendData]);

  // Unique grade labels in the trend data
  const trendGrades = useMemo(() => {
    if (!trendData?.prices?.length) return [];
    const seen: Record<string, boolean> = {};
    for (const p of trendData.prices) seen[p.gradeLabel] = true;
    return Object.keys(seen);
  }, [trendData]);

  // Build spread chart data (UFA base cost vs pump average for PMFS grades)
  const spreadChartData = useMemo(() => {
    if (!wholesaleData?.snapshots?.length || !trendData?.prices?.length) return [];

    const wholesaleByDate: Record<string, Record<string, number>> = {};
    for (const s of wholesaleData.snapshots) {
      const day = format(new Date(s.effectiveDate), "MMM d");
      if (!wholesaleByDate[day]) wholesaleByDate[day] = {};
      wholesaleByDate[day][`${s.gradeLabel} (cost)`] = parseFloat(s.pricePerLitre);
    }

    const pumpByDate: Record<string, Record<string, number>> = {};
    for (const p of trendData.prices) {
      if (!['regular', 'premium', 'diesel'].includes(p.fuelCategory)) continue;
      const day = format(new Date(p.observedAt), "MMM d");
      if (!pumpByDate[day]) pumpByDate[day] = {};
      if (pumpByDate[day][`${p.gradeLabel} (pump)`] === undefined) {
        pumpByDate[day][`${p.gradeLabel} (pump)`] = parseFloat(p.pricePerLitre);
      }
    }

    const dateSet: Record<string, boolean> = {};
    for (const d of Object.keys(wholesaleByDate)) dateSet[d] = true;
    for (const d of Object.keys(pumpByDate)) dateSet[d] = true;
    const allDates = Object.keys(dateSet);
    return allDates.map(date => ({
      date,
      ...(wholesaleByDate[date] ?? {}),
      ...(pumpByDate[date] ?? {}),
    })).slice(-60);
  }, [wholesaleData, trendData]);

  // KPI row — just show the first few grades that have data
  const kpiGrades = summaryData?.grades?.filter(g => g.latestPrice) ?? [];
  const regularGrade = summaryData?.grades?.find(g => g.fuelCategory === 'regular');
  const dieselGrade = summaryData?.grades?.find(g => g.fuelCategory === 'diesel');

  const nrcanFreshness = summaryData?.lastNrcanImport
    ? formatDistanceToNow(new Date(summaryData.lastNrcanImport), { addSuffix: true })
    : null;

  if (!summaryData?.totalObservations) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <BarChart2 className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">No market data yet</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-xs">
            Switch to the Log Entry tab to record your first observation or trigger an NRCan import.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {regularGrade?.latestPrice && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Regular 87 (pump)</p>
              <p className="text-xl font-bold">${parseFloat(regularGrade.latestPrice).toFixed(3)}/L</p>
              {regularGrade.delta7d && (
                <p className={`text-xs ${parseFloat(regularGrade.delta7d) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {parseFloat(regularGrade.delta7d) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(regularGrade.delta7d)).toFixed(3)} vs 7d ago
                </p>
              )}
            </CardContent>
          </Card>
        )}
        {dieselGrade?.latestPrice && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Diesel (pump)</p>
              <p className="text-xl font-bold">${parseFloat(dieselGrade.latestPrice).toFixed(3)}/L</p>
              {dieselGrade.delta7d && (
                <p className={`text-xs ${parseFloat(dieselGrade.delta7d) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {parseFloat(dieselGrade.delta7d) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(dieselGrade.delta7d)).toFixed(3)} vs 7d ago
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground font-medium mb-2">Pump Spread</p>
            {[
              { grade: regularGrade, label: "Reg 87" },
              { grade: dieselGrade, label: "Diesel" },
            ].map(({ grade, label }) => {
              if (!grade?.latestPrice || !grade?.pmfsCustomerPrice) {
                return (
                  <div key={label} className="flex items-center justify-between mb-1.5 last:mb-0">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">—</span>
                  </div>
                );
              }
              const spread = parseFloat(grade.latestPrice) - parseFloat(grade.pmfsCustomerPrice);
              const isNegative = spread < 0;
              return (
                <div key={label} className="flex items-center justify-between mb-1.5 last:mb-0">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className={`text-sm font-bold ${isNegative ? 'text-amber-500' : 'text-green-600'}`}
                    title={isNegative ? "Pump price is below PMFS — competitive risk" : "Pump is pricier than PMFS"}>
                    {spread >= 0 ? '+' : ''}{(spread * 100).toFixed(1)}¢/L
                    {isNegative && <AlertCircle className="w-3 h-3 inline ml-1 text-amber-500" />}
                  </span>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground mt-1.5">pump avg − PMFS price</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">NRCan data freshness</p>
            <p className="text-xl font-bold">{nrcanFreshness ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{summaryData.totalObservations} total observations</p>
          </CardContent>
        </Card>
      </div>

      {/* Date range picker */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Range:</span>
        {DATE_RANGES.map(r => (
          <Button
            key={r.label}
            size="sm"
            variant={rangeDays === r.days ? "default" : "outline"}
            className="h-7 text-xs px-2.5"
            onClick={() => setRangeDays(r.days)}
            data-testid={`button-range-${r.label}`}
          >
            {r.label}
          </Button>
        ))}
      </div>

      {/* Pump Price Trend Chart */}
      {trendChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pump Price Trend</CardTitle>
            <CardDescription>
              Observed grades at the pump vs PMFS customer price (dashed) — $/litre
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendChartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* Pump price series */}
                {trendGrades.map(grade => {
                  const cat = FUEL_GRADES.find(g => g.label === grade)?.category ?? 'other';
                  return (
                    <Line
                      key={grade}
                      type="monotone"
                      dataKey={grade}
                      stroke={CATEGORY_COLORS[cat] ?? '#6b7280'}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  );
                })}
                {/* PMFS customer price reference lines (dashed horizontal) */}
                {(['regular', 'premium', 'diesel'] as const).map(cat => {
                  const gradeInfo = summaryData?.grades?.find(g => g.fuelCategory === cat);
                  if (!gradeInfo?.pmfsCustomerPrice) return null;
                  const price = parseFloat(gradeInfo.pmfsCustomerPrice);
                  const color = CATEGORY_COLORS[cat];
                  const label = cat === 'regular' ? 'Reg87 PMFS' : cat === 'premium' ? 'Prem91 PMFS' : 'Diesel PMFS';
                  return (
                    <ReferenceLine
                      key={`pmfs-${cat}`}
                      y={price}
                      stroke={color}
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                      label={{ value: label, fontSize: 10, fill: color, position: 'insideTopRight' }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Wholesale vs Pump Spread Chart */}
      {spreadChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Wholesale vs Pump Spread</CardTitle>
            <CardDescription>UFA base cost (derived) vs NRCan Calgary pump average — shows station-level margin</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={spreadChartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} domain={['auto', 'auto']} />
                <Tooltip content={<SpreadChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {Object.keys(spreadChartData[0] ?? {}).filter(k => k !== 'date').map((key, i) => {
                  const colors = ['#ef4444', '#ef444466', '#22c55e', '#22c55e66', '#f59e0b', '#f59e0b66'];
                  return (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={colors[i % colors.length]}
                      fill={colors[i % colors.length]}
                      fillOpacity={0.08}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Observations Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Observations</CardTitle>
          <CardDescription>Last 20 recorded pump price data points</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Grade</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Price</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Source</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {(recentData?.prices ?? []).map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[p.fuelCategory] ?? 'bg-gray-400'}`} />
                        {p.gradeLabel}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono font-medium">
                      ${parseFloat(p.pricePerLitre).toFixed(3)}/L
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      <Badge variant="outline" className="text-xs">
                        {p.sourceType}
                      </Badge>
                      <span className="ml-1.5">{p.sourceLabel}</span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {format(new Date(p.observedAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-2">
                      {p.sourceType === "manual" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(p.id)}
                          data-testid={`button-delete-price-${p.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!recentData?.prices?.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No observations recorded yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Log Entry Tab ────────────────────────────────────────────────────────────

function LogEntryTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fuelCategory, setFuelCategory] = useState("regular");
  const [gradeLabel, setGradeLabel] = useState("Regular 87");
  const [customGradeLabel, setCustomGradeLabel] = useState("");
  const [pricePerLitre, setPricePerLitre] = useState("");
  const [stationId, setStationId] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [observedAt, setObservedAt] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [notes, setNotes] = useState("");

  const { data: summaryData } = useQuery<MarketSummary>({
    queryKey: ["/api/owner/market/summary"],
  });

  const { data: stationsData } = useQuery<{ stations: Station[] }>({
    queryKey: ["/api/owner/market/stations"],
  });

  const saveMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/owner/market/pump-prices", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/pump-prices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/summary"] });
      toast({ title: "Observation saved" });
      setPricePerLitre("");
      setNotes("");
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message, variant: "destructive" }),
  });

  const nrcanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/owner/market/nrcan-refresh").then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/pump-prices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/summary"] });
      toast({
        title: "NRCan import complete",
        description: `Inserted: ${data.inserted ?? 0}, Skipped (already existed): ${data.skipped ?? 0}`,
      });
    },
    onError: (err: any) => toast({ title: "NRCan import failed", description: err?.message, variant: "destructive" }),
  });

  const handleGradeSelect = (cat: string) => {
    setFuelCategory(cat);
    const match = FUEL_GRADES.find(g => g.category === cat);
    if (match && cat !== "other") setGradeLabel(match.label);
    if (cat === "other") setGradeLabel(customGradeLabel);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalLabel = fuelCategory === "other" ? customGradeLabel : gradeLabel;
    if (!finalLabel) { toast({ title: "Please enter a grade label", variant: "destructive" }); return; }
    const price = parseFloat(pricePerLitre);
    if (isNaN(price) || price <= 0) { toast({ title: "Enter a valid price", variant: "destructive" }); return; }

    saveMutation.mutate({
      fuelCategory,
      gradeLabel: finalLabel,
      pricePerLitre: price.toFixed(4),
      observedAt,
      stationId: stationId || undefined,
      locationLabel: locationLabel || undefined,
      notes: notes || undefined,
    });
  };

  const nrcanFreshness = summaryData?.lastNrcanImport
    ? format(new Date(summaryData.lastNrcanImport), "MMM d, yyyy h:mm a")
    : null;

  return (
    <div className="space-y-6 max-w-xl">
      {/* Manual log form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Log Pump Price Observation
          </CardTitle>
          <CardDescription>Record any fuel grade at any station</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Fuel grade */}
            <div className="space-y-1.5">
              <Label htmlFor="fuel-category">Fuel Grade</Label>
              <Select value={fuelCategory} onValueChange={handleGradeSelect}>
                <SelectTrigger id="fuel-category" data-testid="select-fuel-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUEL_GRADES.map(g => (
                    <SelectItem key={g.category} value={g.category}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[g.category] ?? 'bg-gray-400'}`} />
                        {g.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {fuelCategory === "other" && (
              <div className="space-y-1.5">
                <Label htmlFor="custom-grade">Custom Grade Label</Label>
                <Input
                  id="custom-grade"
                  placeholder="e.g. B20 Biodiesel, Propane, etc."
                  value={customGradeLabel}
                  onChange={e => setCustomGradeLabel(e.target.value)}
                  data-testid="input-custom-grade"
                />
              </div>
            )}

            {/* Price */}
            <div className="space-y-1.5">
              <Label htmlFor="price-per-litre">Price per Litre ($/L)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="price-per-litre"
                  type="number"
                  step="0.001"
                  min="0.01"
                  max="5.00"
                  placeholder="1.459"
                  value={pricePerLitre}
                  onChange={e => setPricePerLitre(e.target.value)}
                  className="pl-7"
                  data-testid="input-price-per-litre"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">/L</span>
              </div>
              {pricePerLitre && !isNaN(parseFloat(pricePerLitre)) && (
                <p className="text-xs text-muted-foreground">
                  = {(parseFloat(pricePerLitre) * 100).toFixed(1)}¢/L
                </p>
              )}
            </div>

            {/* Station */}
            <div className="space-y-1.5">
              <Label htmlFor="station">Station (optional)</Label>
              <Select value={stationId} onValueChange={val => {
                setStationId(val === "__other__" ? "" : val);
                if (val === "__other__") setLocationLabel("");
              }}>
                <SelectTrigger id="station" data-testid="select-station">
                  <SelectValue placeholder="Select saved station or one-off" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__other__">One-off / other (enter below)</SelectItem>
                  {(stationsData?.stations ?? []).filter(s => s.isActive).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!stationId && (
              <div className="space-y-1.5">
                <Label htmlFor="location">Location / Station Name</Label>
                <Input
                  id="location"
                  placeholder="e.g. Costco Deerfoot, Esso Deerfoot"
                  value={locationLabel}
                  onChange={e => setLocationLabel(e.target.value)}
                  data-testid="input-location"
                />
              </div>
            )}

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="observed-at">Observed Date & Time</Label>
              <Input
                id="observed-at"
                type="datetime-local"
                value={observedAt}
                onChange={e => setObservedAt(e.target.value)}
                data-testid="input-observed-at"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any additional context..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                data-testid="input-notes"
              />
            </div>

            <Button type="submit" disabled={saveMutation.isPending} className="w-full" data-testid="button-save-observation">
              {saveMutation.isPending ? "Saving..." : "Save Observation"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* NRCan trigger */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4" />
            NRCan Auto-Import
          </CardTitle>
          <CardDescription>
            Pulls weekly Calgary averages for Regular 87, Mid-Grade 89, Premium 91, and Diesel from Natural Resources Canada.
            Runs automatically every Monday at 8 AM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-nrcan-last-import">
            <Clock className="w-4 h-4" />
            Last import: {nrcanFreshness ?? "Never"}
          </div>
          <Button
            variant="outline"
            onClick={() => nrcanMutation.mutate()}
            disabled={nrcanMutation.isPending}
            data-testid="button-nrcan-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${nrcanMutation.isPending ? 'animate-spin' : ''}`} />
            {nrcanMutation.isPending ? "Importing..." : "Trigger NRCan Import Now"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newStation, setNewStation] = useState({ name: "", brand: "", address: "", postalCode: "", notes: "" });
  const [showAdd, setShowAdd] = useState(false);

  const { data: stationsData, isLoading: stationsLoading } = useQuery<{ stations: Station[] }>({
    queryKey: ["/api/owner/market/stations"],
  });

  const { data: backfillStatus } = useQuery<{ totalSnapshots: number }>({
    queryKey: ["/api/owner/market/backfill/status"],
  });

  const addStationMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/owner/market/stations", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/stations"] });
      toast({ title: "Station added" });
      setNewStation({ name: "", brand: "", address: "", postalCode: "", notes: "" });
      setShowAdd(false);
    },
    onError: (err: any) => toast({ title: "Failed to add station", description: err?.message, variant: "destructive" }),
  });

  const deleteStationMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/owner/market/stations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/stations"] });
      toast({ title: "Station removed" });
    },
    onError: (err: any) => toast({ title: "Failed to remove station", description: err?.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/owner/market/stations/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/owner/market/stations"] }),
  });

  const backfillMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/owner/market/backfill").then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/backfill/status"] });
      toast({
        title: "Backfill complete",
        description: `Inserted ${data.inserted ?? 0} new wholesale snapshots, skipped ${data.skipped ?? 0} existing.`,
      });
    },
    onError: (err: any) => toast({ title: "Backfill failed", description: err?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 max-w-xl">
      {/* Station directory */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Station Directory
              </CardTitle>
              <CardDescription className="mt-0.5">Stations you track regularly</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-station">
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAdd && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="stn-name">Station Name *</Label>
                  <Input id="stn-name" placeholder="Costco Deerfoot" value={newStation.name}
                    onChange={e => setNewStation(s => ({ ...s, name: e.target.value }))} data-testid="input-station-name" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="stn-brand">Brand</Label>
                  <Input id="stn-brand" placeholder="Costco, Shell, Esso…" value={newStation.brand}
                    onChange={e => setNewStation(s => ({ ...s, brand: e.target.value }))} data-testid="input-station-brand" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="stn-address">Address</Label>
                  <Input id="stn-address" placeholder="901 64 Ave NE" value={newStation.address}
                    onChange={e => setNewStation(s => ({ ...s, address: e.target.value }))} data-testid="input-station-address" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="stn-postal">Postal Code</Label>
                  <Input id="stn-postal" placeholder="T2E 7P4" value={newStation.postalCode}
                    onChange={e => setNewStation(s => ({ ...s, postalCode: e.target.value }))} data-testid="input-station-postal" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="stn-notes">Notes</Label>
                <Input id="stn-notes" placeholder="Any notes…" value={newStation.notes}
                  onChange={e => setNewStation(s => ({ ...s, notes: e.target.value }))} data-testid="input-station-notes" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => addStationMutation.mutate(newStation)} disabled={!newStation.name || addStationMutation.isPending} data-testid="button-save-station">
                  {addStationMutation.isPending ? "Saving…" : "Save Station"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} data-testid="button-cancel-station">Cancel</Button>
              </div>
            </div>
          )}

          {stationsLoading && <p className="text-sm text-muted-foreground py-2">Loading stations…</p>}
          {!stationsLoading && !stationsData?.stations?.length && !showAdd && (
            <p className="text-sm text-muted-foreground py-2">No stations saved yet. Add one above.</p>
          )}
          {(stationsData?.stations ?? []).map(s => (
            <div key={s.id} className="flex items-start justify-between border rounded-lg px-3 py-2.5" data-testid={`card-station-${s.id}`}>
              <div>
                <p className="font-medium text-sm">{s.name}</p>
                {s.brand && <p className="text-xs text-muted-foreground">{s.brand}</p>}
                {s.address && <p className="text-xs text-muted-foreground">{s.address}</p>}
                {!s.isActive && <Badge variant="outline" className="text-xs mt-1">Inactive</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => toggleActiveMutation.mutate({ id: s.id, isActive: !s.isActive })}
                  data-testid={`button-toggle-station-${s.id}`}>
                  {s.isActive ? "✓" : "○"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteStationMutation.mutate(s.id)}
                  data-testid={`button-delete-station-${s.id}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Back-extrapolation status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" />
            Historical Backfill
          </CardTitle>
          <CardDescription>
            Derives wholesale cost snapshots from PMFS fuel price history (base_cost). Read-only access — never modifies your pricing data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Wholesale snapshots:</span>
            <span className="font-medium">{backfillStatus?.totalSnapshots ?? 0}</span>
          </div>
          <Button
            variant="outline"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
            data-testid="button-run-backfill"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${backfillMutation.isPending ? 'animate-spin' : ''}`} />
            {backfillMutation.isPending ? "Running…" : "Re-run Backfill"}
          </Button>
        </CardContent>
      </Card>

      {/* Coming soon placeholders */}
      <div className="grid gap-4">
        <Card className="opacity-60">
          <CardContent className="py-5 flex items-center gap-4">
            <Lock className="w-8 h-8 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">GasBuddy API <Badge variant="secondary" className="ml-1 text-xs">Coming Soon</Badge></p>
              <p className="text-xs text-muted-foreground mt-0.5">Real-time crowd-sourced prices from GasBuddy for any station.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="opacity-60">
          <CardContent className="py-5 flex items-center gap-4">
            <Lock className="w-8 h-8 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">Custom Data Source <Badge variant="secondary" className="ml-1 text-xs">Coming Soon</Badge></p>
              <p className="text-xs text-muted-foreground mt-0.5">Connect any CSV feed, webhook, or third-party API for automated price ingestion.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MarketIntelligencePage() {
  return (
    <OwnerShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-copper" />
              Market Intelligence
            </h1>
            <p className="text-muted-foreground mt-0.5">
              Calgary pump prices, Alberta wholesale rack, and PMFS spread analysis
            </p>
          </div>
          <Badge variant="outline" className="text-muted-foreground mt-1">Calgary</Badge>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview" className="gap-2" data-testid="tab-market-overview">
              <BarChart2 className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="log" className="gap-2" data-testid="tab-market-log">
              <Plus className="w-4 h-4" />
              Log Entry
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2" data-testid="tab-market-settings">
              <Database className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="log" className="mt-4">
            <LogEntryTab />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </OwnerShell>
  );
}
