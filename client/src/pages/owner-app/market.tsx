import { useState, useMemo, useEffect } from "react";
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
  TrendingUp, TrendingDown, BarChart2, RefreshCw, Plus, Trash2, Building2,
  Download, Clock, Database, Fuel, ChevronRight, AlertCircle, Lock,
  Droplet, DollarSign, Flag, Activity, Layers, Bell, LineChart as LineChartIcon,
  Gauge, ArrowRight, Sparkles, SlidersHorizontal
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { apiRequest } from "@/lib/queryClient";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine, ComposedChart, Cell
} from "recharts";

// Calgary timezone — all displayed dates are in Mountain (America/Edmonton) time.
const CALGARY_TZ = "America/Edmonton";
const tzFormat = (d: Date | string, fmt: string) =>
  formatInTimeZone(typeof d === "string" ? new Date(d) : d, CALGARY_TZ, fmt);

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
  postalCode?: string;
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

interface IndicatorPoint { effectiveDate: string; value: string; }
interface IndicatorBucket {
  unit: string;
  sourceLabel: string;
  latest: { value: string; effectiveDate: string } | null;
  points: IndicatorPoint[];
}
interface ExternalIndicators {
  byType: Record<string, IndicatorBucket>;
}

interface MarginTrend {
  series: Array<{
    fuelCategory: string;
    gradeLabel: string;
    points: Array<{ observedAt: string; pumpPrice: number; pmfsPrice: number | null; spread: number | null }>;
  }>;
}

interface TaxConfig {
  gstPercent: number;
  gasoline: { federalExcisePerL: number; provincialFuelTaxPerL: number; carbonChargePerL: number };
  diesel: { federalExcisePerL: number; provincialFuelTaxPerL: number; carbonChargePerL: number };
}

interface Decomposition {
  fuelCategory: string;
  pricePerLitre: number;
  gst: number;
  federalExcise: number;
  provincialFuelTax: number;
  carbonCharge: number;
  fuelAndMargin: number;
  baseCost: number | null;
  retailMargin: number | null;
  components: Array<{ key: string; label: string; amount: number }>;
  taxConfig: TaxConfig;
}

interface Forecast {
  fuelCategory: string;
  method: string;
  slopePerDay?: number;
  note?: string;
  history: Array<{ observedAt: string; price: number }>;
  projection: Array<{ effectiveDate: string; price: number }>;
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

// External indicator presentation
const INDICATOR_META: Record<string, { label: string; short: string; color: string }> = {
  wti_crude: { label: "WTI Crude", short: "WTI", color: "#0ea5e9" },
  brent_crude: { label: "Brent Crude", short: "Brent", color: "#6366f1" },
  usd_cad: { label: "USD / CAD", short: "USD/CAD", color: "#14b8a6" },
  us_gasoline: { label: "US Gasoline", short: "US Gas", color: "#ec4899" },
  us_diesel: { label: "US Diesel", short: "US Diesel", color: "#8b5cf6" },
};

// Decomposition component colors (keyed by component key)
const COMPONENT_COLORS: Record<string, string> = {
  baseCost: "#3b82f6",
  fuelAndMargin: "#3b82f6",
  retailMargin: "#22c55e",
  federalExcise: "#f59e0b",
  provincialFuelTax: "#ef4444",
  carbonCharge: "#14b8a6",
  gst: "#a855f7",
};

const DATE_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1yr", days: 365 },
  { label: "All", days: 3650 },
];

const US_GAL_PER_LITRE = 3.78541;

// ─── Alert thresholds (frontend-only, persisted in localStorage) ──────────────

interface AlertThresholds {
  pumpBelowPmfs: boolean;      // alert when pump avg < PMFS price (competitive risk)
  marginCompressionCents: number; // alert when PMFS spread drops below this (¢/L)
  crudeMovePct: number;        // alert when crude moves more than this % over the range
  pumpMovePct: number;         // alert when pump moves more than this % over 7d
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  pumpBelowPmfs: true,
  marginCompressionCents: 2,
  crudeMovePct: 5,
  pumpMovePct: 4,
};

const THRESHOLDS_KEY = "market_alert_thresholds";

function loadThresholds(): AlertThresholds {
  try {
    const raw = localStorage.getItem(THRESHOLDS_KEY);
    if (!raw) return { ...DEFAULT_THRESHOLDS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_THRESHOLDS, ...parsed };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

function useAlertThresholds(): [AlertThresholds, (t: AlertThresholds) => void] {
  const [thresholds, setThresholds] = useState<AlertThresholds>(loadThresholds);
  const save = (t: AlertThresholds) => {
    setThresholds(t);
    try { localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(t)); } catch { /* ignore */ }
  };
  return [thresholds, save];
}

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

// Generic tooltip that renders raw values with optional per-series unit
function GenericTooltip({ active, payload, label, unitMap }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm min-w-[180px]">
      <p className="font-medium mb-1.5 text-muted-foreground">{label}</p>
      {payload.map((entry: any, i: number) => {
        if (entry.value == null) return null;
        const unit = unitMap?.[entry.dataKey] ?? "";
        return (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground text-xs">{entry.name}</span>
            </div>
            <span className="font-semibold text-xs font-mono">
              {typeof entry.value === 'number' ? entry.value.toFixed(unit.includes("/L") || unit === "" ? 3 : 2) : entry.value}{unit ? ` ${unit}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SpreadChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

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

// ─── Small presentational helpers ─────────────────────────────────────────────

function SectionHeading({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <Icon className="w-4 h-4 text-copper" />
      <div>
        <h2 className="font-display text-sm font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function KpiTile({
  label, value, sub, accentColor, delta, deltaIsBad, testId,
}: {
  label: string; value: string; sub?: string; accentColor?: string;
  delta?: number | null; deltaIsBad?: (d: number) => boolean; testId?: string;
}) {
  const showDelta = typeof delta === "number" && !isNaN(delta);
  const bad = showDelta && (deltaIsBad ? deltaIsBad(delta!) : delta! > 0);
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-1.5">
          {accentColor && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />}
          <p className="text-xs text-muted-foreground truncate">{label}</p>
        </div>
        <p className="text-xl font-bold mt-0.5">{value}</p>
        {showDelta && (
          <p className={`text-xs ${bad ? 'text-red-500' : 'text-green-500'}`}>
            {delta! >= 0 ? '↑' : '↓'} {Math.abs(delta!).toFixed(delta! >= 100 ? 1 : 3)}
          </p>
        )}
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Math helpers ──────────────────────────────────────────────────────────────

function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    if (!slice.length) return null;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function rollingStdDev(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    if (slice.length < 2) return null;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    return Math.sqrt(variance);
  });
}

function pctChange(first: number | null, last: number | null): number | null {
  if (first == null || last == null || first === 0) return null;
  return ((last - first) / first) * 100;
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [rangeDays, setRangeDays] = useState(30);
  const [decompGrade, setDecompGrade] = useState("regular");
  const [forecastGrade, setForecastGrade] = useState("regular");
  const [maGrade, setMaGrade] = useState("regular");
  const [thresholds] = useAlertThresholds();

  // Source toggles — let the owner filter what's shown
  const [sources, setSources] = useState({
    crude: true,
    fx: true,
    usBenchmark: true,
    competitor: true,
  });
  const toggleSource = (key: keyof typeof sources) =>
    setSources(s => ({ ...s, [key]: !s[key] }));

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

  const { data: indicatorData } = useQuery<ExternalIndicators>({
    queryKey: ["/api/owner/market/external-indicators", rangeDays],
    queryFn: () => fetch(`/api/owner/market/external-indicators?days=${rangeDays}`).then(r => r.json()),
  });

  const { data: marginTrendData } = useQuery<MarginTrend>({
    queryKey: ["/api/owner/market/margin-trend", rangeDays],
    queryFn: () => fetch(`/api/owner/market/margin-trend?days=${rangeDays}`).then(r => r.json()),
  });

  const { data: decompData } = useQuery<Decomposition>({
    queryKey: ["/api/owner/market/decomposition", decompGrade],
    queryFn: () => fetch(`/api/owner/market/decomposition?fuelCategory=${decompGrade}`).then(r => {
      if (!r.ok) return null;
      return r.json();
    }),
  });

  const { data: forecastData } = useQuery<Forecast>({
    queryKey: ["/api/owner/market/forecast", forecastGrade, rangeDays],
    queryFn: () => fetch(`/api/owner/market/forecast?fuelCategory=${forecastGrade}&days=${rangeDays}&horizon=14`).then(r => r.json()),
  });

  const { data: recentData } = useQuery<{ prices: PumpPrice[] }>({
    queryKey: ["/api/owner/market/pump-prices", "recent-200"],
    queryFn: () => fetch(`/api/owner/market/pump-prices?limit=200`).then(r => r.json()),
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

  // ── Pump trend keyed by gradeLabel (for the main line chart) ──
  const trendChartData = useMemo(() => {
    if (!trendData?.prices?.length) return [];
    const byDate: Record<string, Record<string, number>> = {};
    for (const p of trendData.prices) {
      const day = tzFormat(p.observedAt, "MMM d");
      if (!byDate[day]) byDate[day] = {};
      if (byDate[day][p.gradeLabel] === undefined) {
        byDate[day][p.gradeLabel] = parseFloat(p.pricePerLitre);
      }
    }
    return Object.entries(byDate)
      .map(([date, vals]) => ({ date, ...vals }))
      .slice(-60);
  }, [trendData]);

  const trendGrades = useMemo(() => {
    if (!trendData?.prices?.length) return [];
    const seen: Record<string, boolean> = {};
    for (const p of trendData.prices) seen[p.gradeLabel] = true;
    return Object.keys(seen);
  }, [trendData]);

  // ── Pump trend keyed by category + date (for spreads / crude overlay / MA) ──
  const pumpByCatDate = useMemo(() => {
    // returns { dates: string[], byCat: Record<cat, Record<date, number>> } in chrono order
    const out: { date: string; ts: number; cats: Record<string, number> }[] = [];
    if (!trendData?.prices?.length) return out;
    const map: Record<string, { ts: number; cats: Record<string, number> }> = {};
    for (const p of trendData.prices) {
      const day = tzFormat(p.observedAt, "MMM d");
      const ts = new Date(p.observedAt).getTime();
      if (!map[day]) map[day] = { ts, cats: {} };
      if (map[day].cats[p.fuelCategory] === undefined) map[day].cats[p.fuelCategory] = parseFloat(p.pricePerLitre);
    }
    return Object.entries(map)
      .map(([date, v]) => ({ date, ts: v.ts, cats: v.cats }))
      .sort((a, b) => a.ts - b.ts)
      .slice(-90);
  }, [trendData]);

  // ── Spread chart (wholesale vs pump) ──
  const spreadChartData = useMemo(() => {
    if (!wholesaleData?.snapshots?.length || !trendData?.prices?.length) return [];
    const wholesaleByDate: Record<string, Record<string, number>> = {};
    for (const s of wholesaleData.snapshots) {
      const day = tzFormat(s.effectiveDate, "MMM d");
      if (!wholesaleByDate[day]) wholesaleByDate[day] = {};
      wholesaleByDate[day][`${s.gradeLabel} (cost)`] = parseFloat(s.pricePerLitre);
    }
    const pumpByDate: Record<string, Record<string, number>> = {};
    for (const p of trendData.prices) {
      if (!['regular', 'premium', 'diesel'].includes(p.fuelCategory)) continue;
      const day = tzFormat(p.observedAt, "MMM d");
      if (!pumpByDate[day]) pumpByDate[day] = {};
      if (pumpByDate[day][`${p.gradeLabel} (pump)`] === undefined) {
        pumpByDate[day][`${p.gradeLabel} (pump)`] = parseFloat(p.pricePerLitre);
      }
    }
    const dateSet: Record<string, boolean> = {};
    for (const d of Object.keys(wholesaleByDate)) dateSet[d] = true;
    for (const d of Object.keys(pumpByDate)) dateSet[d] = true;
    return Object.keys(dateSet).map(date => ({
      date,
      ...(wholesaleByDate[date] ?? {}),
      ...(pumpByDate[date] ?? {}),
    })).slice(-60);
  }, [wholesaleData, trendData]);

  // ── Crude vs pump (dual axis) ──
  const crudePumpData = useMemo(() => {
    if (!pumpByCatDate.length) return [];
    const wti = indicatorData?.byType?.wti_crude?.points ?? [];
    const brent = indicatorData?.byType?.brent_crude?.points ?? [];
    const wtiByDate: Record<string, number> = {};
    for (const pt of wti) wtiByDate[tzFormat(pt.effectiveDate, "MMM d")] = parseFloat(pt.value);
    const brentByDate: Record<string, number> = {};
    for (const pt of brent) brentByDate[tzFormat(pt.effectiveDate, "MMM d")] = parseFloat(pt.value);
    return pumpByCatDate.map(row => ({
      date: row.date,
      regular: row.cats.regular ?? null,
      diesel: row.cats.diesel ?? null,
      wti: wtiByDate[row.date] ?? null,
      brent: brentByDate[row.date] ?? null,
    }));
  }, [pumpByCatDate, indicatorData]);

  // ── USD/CAD overlay on pump ──
  const fxPumpData = useMemo(() => {
    if (!pumpByCatDate.length) return [];
    const fx = indicatorData?.byType?.usd_cad?.points ?? [];
    const fxByDate: Record<string, number> = {};
    for (const pt of fx) fxByDate[tzFormat(pt.effectiveDate, "MMM d")] = parseFloat(pt.value);
    return pumpByCatDate.map(row => ({
      date: row.date,
      regular: row.cats.regular ?? null,
      usdCad: fxByDate[row.date] ?? null,
    }));
  }, [pumpByCatDate, indicatorData]);

  // ── US vs Calgary benchmark (US converted to CAD/L) ──
  const usBenchmarkData = useMemo(() => {
    if (!pumpByCatDate.length) return [];
    const usGas = indicatorData?.byType?.us_gasoline?.points ?? [];
    const usDsl = indicatorData?.byType?.us_diesel?.points ?? [];
    const fx = indicatorData?.byType?.usd_cad?.points ?? [];
    const latestFx = fx.length ? parseFloat(fx[fx.length - 1].value) : null;
    const usGasByDate: Record<string, number> = {};
    const usDslByDate: Record<string, number> = {};
    const fxByDate: Record<string, number> = {};
    for (const pt of fx) fxByDate[tzFormat(pt.effectiveDate, "MMM d")] = parseFloat(pt.value);
    const toCadPerL = (usdPerGal: number, date: string) => {
      const rate = fxByDate[date] ?? latestFx;
      if (!rate) return null;
      return (usdPerGal / US_GAL_PER_LITRE) * rate;
    };
    for (const pt of usGas) {
      const d = tzFormat(pt.effectiveDate, "MMM d");
      const v = toCadPerL(parseFloat(pt.value), d);
      if (v != null) usGasByDate[d] = v;
    }
    for (const pt of usDsl) {
      const d = tzFormat(pt.effectiveDate, "MMM d");
      const v = toCadPerL(parseFloat(pt.value), d);
      if (v != null) usDslByDate[d] = v;
    }
    return pumpByCatDate.map(row => ({
      date: row.date,
      calgaryReg: row.cats.regular ?? null,
      calgaryDsl: row.cats.diesel ?? null,
      usReg: usGasByDate[row.date] ?? null,
      usDsl: usDslByDate[row.date] ?? null,
    }));
  }, [pumpByCatDate, indicatorData]);

  // ── Margin trend (PMFS spread) with compression highlight ──
  const marginChartData = useMemo(() => {
    if (!marginTrendData?.series?.length) return [];
    const byDate: Record<string, any> = {};
    for (const s of marginTrendData.series) {
      for (const pt of s.points) {
        if (pt.spread == null) continue;
        const day = tzFormat(pt.observedAt, "MMM d");
        if (!byDate[day]) byDate[day] = { date: day, ts: new Date(pt.observedAt).getTime() };
        // spread in cents/L for readability
        byDate[day][s.fuelCategory] = Number((pt.spread * 100).toFixed(2));
      }
    }
    return Object.values(byDate).sort((a: any, b: any) => a.ts - b.ts).slice(-60);
  }, [marginTrendData]);

  const marginCategories = useMemo(
    () => (marginTrendData?.series ?? []).map(s => s.fuelCategory),
    [marginTrendData]
  );

  // ── Grade spread (premium/ultra/midgrade uplift over regular) ──
  const gradeSpreadData = useMemo(() => {
    if (!pumpByCatDate.length) return [];
    return pumpByCatDate
      .map(row => {
        const reg = row.cats.regular;
        if (reg == null) return null;
        const out: any = { date: row.date };
        if (row.cats.premium != null) out["Premium − Regular"] = Number(((row.cats.premium - reg) * 100).toFixed(1));
        if (row.cats.midgrade != null) out["Mid − Regular"] = Number(((row.cats.midgrade - reg) * 100).toFixed(1));
        if (row.cats.ultra != null) out["Ultra − Regular"] = Number(((row.cats.ultra - reg) * 100).toFixed(1));
        return Object.keys(out).length > 1 ? out : null;
      })
      .filter(Boolean)
      .slice(-60);
  }, [pumpByCatDate]);

  const gradeSpreadKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of gradeSpreadData as any[]) {
      Object.keys(row).forEach(k => { if (k !== "date") keys.add(k); });
    }
    return Array.from(keys);
  }, [gradeSpreadData]);

  // ── Moving average + volatility band for selected grade ──
  const maChartData = useMemo(() => {
    if (!pumpByCatDate.length) return [];
    const vals = pumpByCatDate.map(r => r.cats[maGrade] ?? null);
    const ma = movingAverage(vals, 7);
    const sd = rollingStdDev(vals, 7);
    return pumpByCatDate.map((r, i) => {
      const m = ma[i];
      const s = sd[i];
      return {
        date: r.date,
        price: vals[i],
        ma: m != null ? Number(m.toFixed(4)) : null,
        upper: m != null && s != null ? Number((m + s).toFixed(4)) : null,
        lower: m != null && s != null ? Number((m - s).toFixed(4)) : null,
        band: m != null && s != null ? Number((2 * s).toFixed(4)) : null,
      };
    });
  }, [pumpByCatDate, maGrade]);

  const latestVolatility = useMemo(() => {
    const vals = pumpByCatDate.map(r => r.cats[maGrade] ?? null);
    const sd = rollingStdDev(vals, 7);
    for (let i = sd.length - 1; i >= 0; i--) if (sd[i] != null) return sd[i]!;
    return null;
  }, [pumpByCatDate, maGrade]);

  // ── Forecast chart (history + projection) ──
  const forecastChartData = useMemo(() => {
    if (!forecastData) return [];
    const rows: any[] = [];
    const hist = forecastData.history ?? [];
    for (const h of hist) {
      rows.push({ date: tzFormat(h.observedAt, "MMM d"), actual: h.price });
    }
    // bridge: last actual also seeds projected so the lines connect
    if (hist.length && forecastData.projection?.length) {
      rows[rows.length - 1].projected = hist[hist.length - 1].price;
    }
    for (const p of forecastData.projection ?? []) {
      rows.push({ date: tzFormat(p.effectiveDate, "MMM d"), projected: p.price });
    }
    return rows.slice(-60);
  }, [forecastData]);

  const forecastEndpoint = forecastData?.projection?.length
    ? forecastData.projection[forecastData.projection.length - 1].price
    : null;
  const forecastStart = forecastData?.history?.length
    ? forecastData.history[forecastData.history.length - 1].price
    : null;

  // ── Competitor comparison (latest manual price per station per grade) ──
  const competitorRows = useMemo(() => {
    if (!recentData?.prices?.length) return [];
    // group by source/location label, keep latest per (station, category)
    const byStation: Record<string, { label: string; grades: Record<string, { price: number; observedAt: string }> }> = {};
    for (const p of recentData.prices) {
      const label = p.locationLabel || p.sourceLabel;
      if (!label || p.sourceType === "nrcan") continue; // competitors are manually tracked stations
      if (!byStation[label]) byStation[label] = { label, grades: {} };
      const existing = byStation[label].grades[p.fuelCategory];
      if (!existing || new Date(p.observedAt) > new Date(existing.observedAt)) {
        byStation[label].grades[p.fuelCategory] = { price: parseFloat(p.pricePerLitre), observedAt: p.observedAt };
      }
    }
    return Object.values(byStation).sort((a, b) => a.label.localeCompare(b.label));
  }, [recentData]);

  const pmfsByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of summaryData?.grades ?? []) {
      if (g.pmfsCustomerPrice) map[g.fuelCategory] = parseFloat(g.pmfsCustomerPrice);
    }
    return map;
  }, [summaryData]);

  // ── KPI helpers ──
  const regularGrade = summaryData?.grades?.find(g => g.fuelCategory === 'regular');
  const dieselGrade = summaryData?.grades?.find(g => g.fuelCategory === 'diesel');

  const indicatorTile = (type: string) => {
    const bucket = indicatorData?.byType?.[type];
    const meta = INDICATOR_META[type];
    if (!bucket?.latest || !meta) return null;
    const latest = parseFloat(bucket.latest.value);
    const first = bucket.points.length ? parseFloat(bucket.points[0].value) : null;
    const change = pctChange(first, latest);
    return { meta, latest, unit: bucket.unit, change, effectiveDate: bucket.latest.effectiveDate };
  };

  const wti = indicatorTile("wti_crude");
  const brent = indicatorTile("brent_crude");
  const fx = indicatorTile("usd_cad");
  const usGas = indicatorTile("us_gasoline");

  // ── Alerts ──
  const alerts = useMemo(() => {
    const out: Array<{ id: string; severity: "warning" | "info" | "danger"; title: string; detail: string }> = [];

    // Pump below PMFS (competitive risk)
    if (thresholds.pumpBelowPmfs) {
      for (const cat of ['regular', 'diesel', 'premium'] as const) {
        const g = summaryData?.grades?.find(x => x.fuelCategory === cat);
        if (g?.latestPrice && g?.pmfsCustomerPrice) {
          const diff = parseFloat(g.latestPrice) - parseFloat(g.pmfsCustomerPrice);
          if (diff < 0) {
            out.push({
              id: `below-${cat}`,
              severity: "danger",
              title: `${g.gradeLabel}: pump below PMFS`,
              detail: `Market pump is ${(Math.abs(diff) * 100).toFixed(1)}¢/L cheaper than PMFS — competitive risk.`,
            });
          }
        }
      }
    }

    // Margin compression
    for (const s of marginTrendData?.series ?? []) {
      const valid = s.points.filter(p => p.spread != null);
      if (!valid.length) continue;
      const latestSpread = valid[valid.length - 1].spread! * 100; // cents
      if (latestSpread < thresholds.marginCompressionCents) {
        out.push({
          id: `margin-${s.fuelCategory}`,
          severity: "warning",
          title: `${s.gradeLabel}: margin compressed`,
          detail: `PMFS spread is ${latestSpread.toFixed(1)}¢/L, below your ${thresholds.marginCompressionCents}¢/L threshold.`,
        });
      }
    }

    // Sharp crude move
    for (const type of ['wti_crude', 'brent_crude'] as const) {
      const t = indicatorTile(type);
      if (t?.change != null && Math.abs(t.change) >= thresholds.crudeMovePct) {
        out.push({
          id: `crude-${type}`,
          severity: "info",
          title: `${t.meta.label} moved ${t.change >= 0 ? '+' : ''}${t.change.toFixed(1)}%`,
          detail: `Over the selected range — crude swings typically lead pump prices.`,
        });
      }
    }

    // Sharp pump move (7d delta from summary)
    for (const cat of ['regular', 'diesel'] as const) {
      const g = summaryData?.grades?.find(x => x.fuelCategory === cat);
      if (g?.latestPrice && g?.delta7d) {
        const base = parseFloat(g.latestPrice) - parseFloat(g.delta7d);
        const pct = pctChange(base, parseFloat(g.latestPrice));
        if (pct != null && Math.abs(pct) >= thresholds.pumpMovePct) {
          out.push({
            id: `pump-${cat}`,
            severity: "info",
            title: `${g.gradeLabel} pump ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% (7d)`,
            detail: `Moved ${(Math.abs(parseFloat(g.delta7d)) * 100).toFixed(1)}¢/L over the last week.`,
          });
        }
      }
    }

    return out;
  }, [thresholds, summaryData, marginTrendData, indicatorData]);

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
    <div className="space-y-5">
      {/* ── Controls: date range + source toggles ── */}
      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Range</span>
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><SlidersHorizontal className="w-3.5 h-3.5" /> Sources</span>
            {([
              { key: 'crude', label: 'Crude' },
              { key: 'fx', label: 'USD/CAD' },
              { key: 'usBenchmark', label: 'US Benchmark' },
              { key: 'competitor', label: 'Competitors' },
            ] as const).map(s => (
              <Button
                key={s.key}
                size="sm"
                variant={sources[s.key] ? "default" : "outline"}
                className="h-7 text-xs px-2.5"
                onClick={() => toggleSource(s.key)}
                data-testid={`toggle-source-${s.key}`}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {regularGrade?.latestPrice && (
          <KpiTile
            label="Regular 87 (pump)"
            value={`$${parseFloat(regularGrade.latestPrice).toFixed(3)}/L`}
            accentColor={CATEGORY_COLORS.regular}
            delta={regularGrade.delta7d ? parseFloat(regularGrade.delta7d) : null}
            sub="vs 7d ago"
            testId="kpi-regular-pump"
          />
        )}
        {dieselGrade?.latestPrice && (
          <KpiTile
            label="Diesel (pump)"
            value={`$${parseFloat(dieselGrade.latestPrice).toFixed(3)}/L`}
            accentColor={CATEGORY_COLORS.diesel}
            delta={dieselGrade.delta7d ? parseFloat(dieselGrade.delta7d) : null}
            sub="vs 7d ago"
            testId="kpi-diesel-pump"
          />
        )}
        {/* PMFS margin */}
        <Card data-testid="kpi-pmfs-margin">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5" /> PMFS Margin
            </p>
            {[
              { grade: regularGrade, label: "Reg 87" },
              { grade: dieselGrade, label: "Diesel" },
            ].map(({ grade, label }) => {
              if (!grade?.latestPrice || !grade?.pmfsCustomerPrice) {
                return (
                  <div key={label} className="flex items-center justify-between mb-1 last:mb-0">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">—</span>
                  </div>
                );
              }
              const spread = parseFloat(grade.latestPrice) - parseFloat(grade.pmfsCustomerPrice);
              const isNegative = spread < 0;
              return (
                <div key={label} className="flex items-center justify-between mb-1 last:mb-0">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className={`text-sm font-bold ${isNegative ? 'text-amber-500' : 'text-green-600'}`}>
                    {spread >= 0 ? '+' : ''}{(spread * 100).toFixed(1)}¢/L
                    {isNegative && <AlertCircle className="w-3 h-3 inline ml-1 text-amber-500" />}
                  </span>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground mt-1">pump − PMFS</p>
          </CardContent>
        </Card>
        {sources.crude && wti && (
          <KpiTile
            label="WTI Crude"
            value={`$${wti.latest.toFixed(2)}`}
            sub={wti.unit}
            accentColor={wti.meta.color}
            delta={wti.change}
            deltaIsBad={(d) => d > 0}
            testId="kpi-wti"
          />
        )}
        {sources.crude && brent && (
          <KpiTile
            label="Brent Crude"
            value={`$${brent.latest.toFixed(2)}`}
            sub={brent.unit}
            accentColor={brent.meta.color}
            delta={brent.change}
            deltaIsBad={(d) => d > 0}
            testId="kpi-brent"
          />
        )}
        {sources.fx && fx && (
          <KpiTile
            label="USD / CAD"
            value={fx.latest.toFixed(4)}
            sub={fx.unit}
            accentColor={fx.meta.color}
            delta={fx.change}
            deltaIsBad={(d) => d > 0}
            testId="kpi-usdcad"
          />
        )}
        {sources.usBenchmark && usGas && (
          <KpiTile
            label="US Gasoline"
            value={`$${usGas.latest.toFixed(3)}`}
            sub={usGas.unit}
            accentColor={usGas.meta.color}
            delta={usGas.change}
            deltaIsBad={(d) => d > 0}
            testId="kpi-us-gasoline"
          />
        )}
        {/* Data freshness — multi source */}
        <Card data-testid="kpi-freshness">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
              <Database className="w-3.5 h-3.5" /> Data Freshness
            </p>
            <div className="space-y-1">
              {[
                { label: "NRCan", date: summaryData.lastNrcanImport },
                { label: "Crude", date: wti?.effectiveDate ?? null },
                { label: "FX", date: fx?.effectiveDate ?? null },
                { label: "US", date: usGas?.effectiveDate ?? null },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <span className="text-xs font-medium">
                    {s.date ? formatDistanceToNow(new Date(s.date), { addSuffix: true }) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Market Alerts ── */}
      <Card data-testid="card-market-alerts">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-copper" /> Market Alerts
            {alerts.length > 0 && <Badge variant="destructive" className="ml-1">{alerts.length}</Badge>}
          </CardTitle>
          <CardDescription>Notable conditions using your configurable thresholds (edit in Settings)</CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-600" data-testid="text-no-alerts">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              All clear — no thresholds breached in the current view.
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map(a => (
                <div
                  key={a.id}
                  className={`flex items-start gap-2 p-2.5 rounded-lg text-sm ${
                    a.severity === 'danger' ? 'bg-red-500/10' : a.severity === 'warning' ? 'bg-amber-500/10' : 'bg-blue-500/10'
                  }`}
                  data-testid={`alert-${a.id}`}
                >
                  <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    a.severity === 'danger' ? 'text-red-500' : a.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'
                  }`} />
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════ MARKET TRENDS ════════════ */}
      <SectionHeading icon={LineChartIcon} title="Market Trends" subtitle="Pump prices and the external signals that drive them" />

      {/* Pump Price Trend Chart */}
      {trendChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pump Price Trend</CardTitle>
            <CardDescription>Observed grades at the pump vs PMFS customer price (dashed) — $/litre</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendChartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {trendGrades.map(grade => {
                  const cat = FUEL_GRADES.find(g => g.label === grade)?.category ?? 'other';
                  return (
                    <Line key={grade} type="monotone" dataKey={grade}
                      stroke={CATEGORY_COLORS[cat] ?? '#6b7280'} strokeWidth={2} dot={false} connectNulls />
                  );
                })}
                {(['regular', 'premium', 'diesel'] as const).map(cat => {
                  const gradeInfo = summaryData?.grades?.find(g => g.fuelCategory === cat);
                  if (!gradeInfo?.pmfsCustomerPrice) return null;
                  const price = parseFloat(gradeInfo.pmfsCustomerPrice);
                  const color = CATEGORY_COLORS[cat];
                  const label = cat === 'regular' ? 'Reg87 PMFS' : cat === 'premium' ? 'Prem91 PMFS' : 'Diesel PMFS';
                  return (
                    <ReferenceLine key={`pmfs-${cat}`} y={price} stroke={color} strokeDasharray="5 3" strokeWidth={1.5}
                      label={{ value: label, fontSize: 10, fill: color, position: 'insideTopRight' }} />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Crude vs Pump */}
        {sources.crude && crudePumpData.some(d => d.wti != null || d.brent != null) && (
          <Card data-testid="card-crude-vs-pump">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Droplet className="w-4 h-4 text-sky-500" /> Crude vs Calgary Pump</CardTitle>
              <CardDescription>WTI/Brent (USD/bbl, right) overlaid on pump price (left) — crude usually leads the pump</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={crudePumpData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="pump" tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} domain={['auto', 'auto']} />
                  <YAxis yAxisId="crude" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(0)}`} domain={['auto', 'auto']} />
                  <Tooltip content={<GenericTooltip unitMap={{ regular: '$/L', diesel: '$/L', wti: 'USD/bbl', brent: 'USD/bbl' }} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="pump" type="monotone" dataKey="regular" name="Regular 87" stroke={CATEGORY_COLORS.regular} strokeWidth={2} dot={false} connectNulls />
                  <Line yAxisId="pump" type="monotone" dataKey="diesel" name="Diesel" stroke={CATEGORY_COLORS.diesel} strokeWidth={2} dot={false} connectNulls />
                  <Line yAxisId="crude" type="monotone" dataKey="wti" name="WTI" stroke={INDICATOR_META.wti_crude.color} strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls />
                  <Line yAxisId="crude" type="monotone" dataKey="brent" name="Brent" stroke={INDICATOR_META.brent_crude.color} strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* USD/CAD overlay */}
        {sources.fx && fxPumpData.some(d => d.usdCad != null) && (
          <Card data-testid="card-fx-overlay">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4 text-teal-500" /> USD/CAD vs Pump</CardTitle>
              <CardDescription>A weaker loonie (higher USD/CAD, right) tends to push imported fuel costs up</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={fxPumpData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="pump" tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} domain={['auto', 'auto']} />
                  <YAxis yAxisId="fx" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(3)} domain={['auto', 'auto']} />
                  <Tooltip content={<GenericTooltip unitMap={{ regular: '$/L', usdCad: 'CAD/USD' }} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="pump" type="monotone" dataKey="regular" name="Regular 87" stroke={CATEGORY_COLORS.regular} strokeWidth={2} dot={false} connectNulls />
                  <Line yAxisId="fx" type="monotone" dataKey="usdCad" name="USD/CAD" stroke={INDICATOR_META.usd_cad.color} strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* US vs Calgary benchmark */}
        {sources.usBenchmark && usBenchmarkData.some(d => d.usReg != null || d.usDsl != null) && (
          <Card data-testid="card-us-benchmark">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Flag className="w-4 h-4 text-pink-500" /> US vs Calgary Benchmark</CardTitle>
              <CardDescription>US prices converted to CAD/L at current FX — a cross-border cost reference</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={usBenchmarkData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} domain={['auto', 'auto']} />
                  <Tooltip content={<GenericTooltip unitMap={{ calgaryReg: 'CAD/L', calgaryDsl: 'CAD/L', usReg: 'CAD/L', usDsl: 'CAD/L' }} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="calgaryReg" name="Calgary Reg" stroke={CATEGORY_COLORS.regular} strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="usReg" name="US Reg (CAD/L)" stroke={INDICATOR_META.us_gasoline.color} strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls />
                  <Line type="monotone" dataKey="calgaryDsl" name="Calgary Diesel" stroke={CATEGORY_COLORS.diesel} strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="usDsl" name="US Diesel (CAD/L)" stroke={INDICATOR_META.us_diesel.color} strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Moving average / volatility */}
        {maChartData.some(d => d.ma != null) && (
          <Card data-testid="card-moving-average">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500" /> Moving Average & Volatility</CardTitle>
                  <CardDescription>7-point moving average with ±1σ volatility band</CardDescription>
                </div>
                <Select value={maGrade} onValueChange={setMaGrade}>
                  <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-ma-grade"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FUEL_GRADES.filter(g => g.category !== 'other').map(g => (
                      <SelectItem key={g.category} value={g.category}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {latestVolatility != null && (
                <p className="text-xs text-muted-foreground mb-1">
                  Current volatility (σ): <span className="font-semibold text-foreground">{(latestVolatility * 100).toFixed(2)}¢/L</span>
                </p>
              )}
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={maChartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} domain={['auto', 'auto']} />
                  <Tooltip content={<GenericTooltip unitMap={{ price: '$/L', ma: '$/L', lower: '$/L', upper: '$/L' }} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="lower" name="−1σ" stackId="band" stroke="none" fill="transparent" connectNulls />
                  <Area type="monotone" dataKey="band" name="±1σ band" stackId="band" stroke="none" fill={INDICATOR_META.usd_cad.color} fillOpacity={0.12} connectNulls />
                  <Line type="monotone" dataKey="price" name="Pump" stroke={CATEGORY_COLORS[maGrade] ?? '#6b7280'} strokeWidth={1.5} dot={false} connectNulls />
                  <Line type="monotone" dataKey="ma" name="7-pt MA" stroke="#6366f1" strokeWidth={2.5} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ════════════ PRICING & MARGIN ════════════ */}
      <SectionHeading icon={Gauge} title="Pricing & Margin" subtitle="Where PMFS sits against the market" />

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Margin trend with compression highlight */}
        {marginChartData.length > 0 && (
          <Card data-testid="card-margin-trend">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">PMFS Margin Trend</CardTitle>
              <CardDescription>PMFS price minus pump average (¢/L). Shaded zone = margin compression (below threshold).</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={marginChartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v.toFixed(0)}¢`} domain={['auto', 'auto']} />
                  <Tooltip content={<GenericTooltip unitMap={{ regular: '¢/L', premium: '¢/L', diesel: '¢/L' }} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="2 2" />
                  <ReferenceLine y={thresholds.marginCompressionCents} stroke="#f59e0b" strokeDasharray="4 2"
                    label={{ value: `${thresholds.marginCompressionCents}¢ floor`, fontSize: 9, fill: '#f59e0b', position: 'insideBottomRight' }} />
                  {marginCategories.map(cat => (
                    <Line key={cat} type="monotone" dataKey={cat} name={cat.charAt(0).toUpperCase() + cat.slice(1)}
                      stroke={CATEGORY_COLORS[cat] ?? '#6b7280'} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Grade spread */}
        {gradeSpreadData.length > 0 && (
          <Card data-testid="card-grade-spread">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4 text-amber-500" /> Grade Spread</CardTitle>
              <CardDescription>Premium uplift over regular (¢/L) — the pricing gap between grades</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={gradeSpreadData as any[]} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v.toFixed(0)}¢`} domain={['auto', 'auto']} />
                  <Tooltip content={<GenericTooltip unitMap={Object.fromEntries(gradeSpreadKeys.map(k => [k, '¢/L']))} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {gradeSpreadKeys.map((k, i) => {
                    const colors = [CATEGORY_COLORS.premium, CATEGORY_COLORS.midgrade, CATEGORY_COLORS.ultra];
                    return <Line key={k} type="monotone" dataKey={k} name={k} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} connectNulls />;
                  })}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

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
                    <Area key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]}
                      fill={colors[i % colors.length]} fillOpacity={0.08} strokeWidth={2} dot={false} connectNulls />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ════════════ COSTS & TAXES ════════════ */}
      <SectionHeading icon={Layers} title="Costs & Taxes" subtitle="What makes up the price at the pump (analysis only — never changes PMFS pricing)" />

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Decomposition */}
        <Card data-testid="card-decomposition">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Pump Price Breakdown</CardTitle>
                <CardDescription>Latest observed price split into cost, margin & taxes</CardDescription>
              </div>
              <Select value={decompGrade} onValueChange={setDecompGrade}>
                <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-decomp-grade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUEL_GRADES.filter(g => g.category !== 'other').map(g => (
                    <SelectItem key={g.category} value={g.category}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {!decompData ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No observed price for this grade yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Pump price</span>
                  <span className="text-xl font-bold">${decompData.pricePerLitre.toFixed(3)}/L</span>
                </div>
                {/* Stacked bar */}
                <div className="flex h-6 w-full rounded-md overflow-hidden border" data-testid="bar-decomposition">
                  {decompData.components.map(c => {
                    const pct = decompData.pricePerLitre > 0 ? Math.max(0, (c.amount / decompData.pricePerLitre) * 100) : 0;
                    if (pct <= 0) return null;
                    return (
                      <div key={c.key} style={{ width: `${pct}%`, backgroundColor: COMPONENT_COLORS[c.key] ?? '#6b7280' }}
                        title={`${c.label}: $${c.amount.toFixed(4)}/L`} />
                    );
                  })}
                </div>
                {/* Legend list */}
                <div className="space-y-1.5">
                  {decompData.components.map(c => {
                    const pct = decompData.pricePerLitre > 0 ? (c.amount / decompData.pricePerLitre) * 100 : 0;
                    return (
                      <div key={c.key} className="flex items-center justify-between text-sm" data-testid={`decomp-row-${c.key}`}>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COMPONENT_COLORS[c.key] ?? '#6b7280' }} />
                          <span className="text-muted-foreground">{c.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono">{(c.amount * 100).toFixed(1)}¢</span>
                          <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground pt-1 border-t">
                  Taxes embedded in the posted price; GST applied on top (tax-on-tax). Rates editable in Settings.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Forecast */}
        <Card data-testid="card-forecast">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /> Forward Projection</CardTitle>
                <CardDescription>14-day trend estimate — <span className="font-medium text-amber-500">an estimate, not a guarantee</span></CardDescription>
              </div>
              <Select value={forecastGrade} onValueChange={setForecastGrade}>
                <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-forecast-grade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUEL_GRADES.filter(g => g.category !== 'other').map(g => (
                    <SelectItem key={g.category} value={g.category}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {forecastData?.method === "insufficient-data" || forecastChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Not enough observations to project a trend yet.
              </p>
            ) : (
              <>
                {forecastStart != null && forecastEndpoint != null && (
                  <div className="flex items-center gap-2 mb-1 text-sm">
                    <span className="font-mono">${forecastStart.toFixed(3)}</span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono font-semibold">${forecastEndpoint.toFixed(3)}</span>
                    <Badge variant="outline" className={`ml-1 text-xs ${forecastEndpoint >= forecastStart ? 'text-red-500' : 'text-green-600'}`}>
                      {forecastEndpoint >= forecastStart ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                      {((forecastEndpoint - forecastStart) * 100 >= 0 ? '+' : '')}{((forecastEndpoint - forecastStart) * 100).toFixed(1)}¢ in 14d
                    </Badge>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={forecastChartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} domain={['auto', 'auto']} />
                    <Tooltip content={<GenericTooltip unitMap={{ actual: '$/L', projected: '$/L' }} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="actual" name="Observed" stroke={CATEGORY_COLORS[forecastGrade] ?? '#6b7280'} strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="projected" name="Projected" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ════════════ COMPETITORS ════════════ */}
      {sources.competitor && (
        <>
          <SectionHeading icon={Building2} title="Competitor Comparison" subtitle="Tracked stations' manually entered prices vs PMFS (read-only)" />
          <Card data-testid="card-competitor">
            <CardContent className="p-0">
              {competitorRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No competitor observations yet. Log station prices from the Log Entry tab.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Station</th>
                        {(['regular', 'premium', 'diesel'] as const).map(cat => (
                          <th key={cat} className="text-right px-4 py-2 font-medium text-muted-foreground">
                            {cat === 'regular' ? 'Reg 87' : cat === 'premium' ? 'Prem 91' : 'Diesel'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* PMFS reference row */}
                      <tr className="border-b bg-muted/40">
                        <td className="px-4 py-2 font-semibold flex items-center gap-2">
                          <Fuel className="w-3.5 h-3.5 text-copper" /> PMFS price
                        </td>
                        {(['regular', 'premium', 'diesel'] as const).map(cat => (
                          <td key={cat} className="px-4 py-2 text-right font-mono font-semibold">
                            {pmfsByCat[cat] != null ? `$${pmfsByCat[cat].toFixed(3)}` : '—'}
                          </td>
                        ))}
                      </tr>
                      {competitorRows.map(row => (
                        <tr key={row.label} className="border-b last:border-0 hover:bg-muted/30" data-testid={`competitor-row-${row.label}`}>
                          <td className="px-4 py-2">{row.label}</td>
                          {(['regular', 'premium', 'diesel'] as const).map(cat => {
                            const entry = row.grades[cat];
                            if (!entry) return <td key={cat} className="px-4 py-2 text-right text-muted-foreground">—</td>;
                            const pmfs = pmfsByCat[cat];
                            const diff = pmfs != null ? entry.price - pmfs : null;
                            return (
                              <td key={cat} className="px-4 py-2 text-right">
                                <span className="font-mono">${entry.price.toFixed(3)}</span>
                                {diff != null && (
                                  <span className={`block text-xs ${diff >= 0 ? 'text-green-600' : 'text-amber-500'}`}>
                                    {diff >= 0 ? '+' : ''}{(diff * 100).toFixed(1)}¢ vs PMFS
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Recent Observations Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Observations</CardTitle>
          <CardDescription>Last recorded pump price data points</CardDescription>
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
                {(recentData?.prices ?? []).slice(0, 20).map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[p.fuelCategory] ?? 'bg-gray-400'}`} />
                        {p.gradeLabel}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono font-medium">${parseFloat(p.pricePerLitre).toFixed(3)}/L</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      <Badge variant="outline" className="text-xs">{p.sourceType}</Badge>
                      <span className="ml-1.5">{p.sourceLabel}</span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{tzFormat(p.observedAt, "MMM d, yyyy")}</td>
                    <td className="px-4 py-2">
                      {p.sourceType === "manual" && (
                        <Button size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(p.id)}
                          data-testid={`button-delete-price-${p.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!recentData?.prices?.length && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No observations recorded yet</td></tr>
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

  const nrcanBackfillMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/owner/market/nrcan-refresh", { backfill: true }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/pump-prices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/summary"] });
      toast({
        title: "NRCan backfill complete",
        description: `Inserted: ${data.inserted ?? 0} entries (current + prior year). Skipped: ${data.skipped ?? 0} (already existed).`,
      });
    },
    onError: (err: any) => toast({ title: "NRCan backfill failed", description: err?.message, variant: "destructive" }),
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
    ? tzFormat(summaryData.lastNrcanImport, "MMM d, yyyy h:mm a")
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => nrcanMutation.mutate()}
              disabled={nrcanMutation.isPending || nrcanBackfillMutation.isPending}
              data-testid="button-nrcan-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${nrcanMutation.isPending ? 'animate-spin' : ''}`} />
              {nrcanMutation.isPending ? "Importing..." : "Import This Week"}
            </Button>
            <Button
              variant="outline"
              onClick={() => nrcanBackfillMutation.mutate()}
              disabled={nrcanMutation.isPending || nrcanBackfillMutation.isPending}
              data-testid="button-nrcan-backfill"
            >
              <Download className={`w-4 h-4 mr-2 ${nrcanBackfillMutation.isPending ? 'animate-spin' : ''}`} />
              {nrcanBackfillMutation.isPending ? "Backfilling..." : "Backfill Prior Year"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function TaxCarbonEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config } = useQuery<TaxConfig>({ queryKey: ["/api/owner/market/tax-config"] });

  const [draft, setDraft] = useState<TaxConfig | null>(null);
  useEffect(() => { if (config && !draft) setDraft(config); }, [config]);

  const saveMutation = useMutation({
    mutationFn: (body: TaxConfig) => apiRequest("PUT", "/api/owner/market/tax-config", body).then(r => r.json()),
    onSuccess: (data: TaxConfig) => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/tax-config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/decomposition"] });
      setDraft(data);
      toast({ title: "Tax & carbon rates saved" });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message, variant: "destructive" }),
  });

  if (!draft) {
    return (
      <Card><CardContent className="py-6 text-sm text-muted-foreground">Loading tax configuration…</CardContent></Card>
    );
  }

  const setRate = (fuel: "gasoline" | "diesel", key: keyof TaxConfig["gasoline"], val: string) => {
    const num = parseFloat(val);
    setDraft(d => d ? { ...d, [fuel]: { ...d[fuel], [key]: isNaN(num) ? 0 : num } } : d);
  };

  const rateRow = (fuel: "gasoline" | "diesel") => (
    <div className="space-y-2">
      <p className="text-sm font-medium capitalize">{fuel}</p>
      <div className="grid grid-cols-3 gap-2">
        {([
          { key: "federalExcisePerL", label: "Federal Excise" },
          { key: "provincialFuelTaxPerL", label: "Provincial Tax" },
          { key: "carbonChargePerL", label: "Carbon Charge" },
        ] as const).map(f => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{f.label} ($/L)</Label>
            <Input
              type="number" step="0.001" min="0" max="5"
              value={draft[fuel][f.key]}
              onChange={e => setRate(fuel, f.key, e.target.value)}
              data-testid={`input-tax-${fuel}-${f.key}`}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Tax & Carbon Rates
        </CardTitle>
        <CardDescription>
          Used only by the Market Intelligence price breakdown. These never affect PMFS customer pricing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">GST (%)</Label>
          <Input
            type="number" step="0.1" min="0" max="100"
            value={(draft.gstPercent * 100).toFixed(1)}
            onChange={e => {
              const num = parseFloat(e.target.value);
              setDraft(d => d ? { ...d, gstPercent: isNaN(num) ? 0 : num / 100 } : d);
            }}
            className="max-w-[120px]"
            data-testid="input-tax-gst"
          />
        </div>
        {rateRow("gasoline")}
        {rateRow("diesel")}
        <Button
          onClick={() => draft && saveMutation.mutate(draft)}
          disabled={saveMutation.isPending}
          data-testid="button-save-tax-config"
        >
          {saveMutation.isPending ? "Saving…" : "Save Tax & Carbon Rates"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AlertThresholdEditor() {
  const { toast } = useToast();
  const [thresholds, save] = useAlertThresholds();
  const [draft, setDraft] = useState<AlertThresholds>(thresholds);

  const handleSave = () => {
    save(draft);
    toast({ title: "Alert thresholds saved" });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Alert Thresholds
        </CardTitle>
        <CardDescription>Control which market conditions surface in the Overview alerts panel.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Pump below PMFS</p>
            <p className="text-xs text-muted-foreground">Alert when a pump price drops below PMFS (competitive risk)</p>
          </div>
          <Button
            size="sm"
            variant={draft.pumpBelowPmfs ? "default" : "outline"}
            onClick={() => setDraft(d => ({ ...d, pumpBelowPmfs: !d.pumpBelowPmfs }))}
            data-testid="toggle-alert-pump-below-pmfs"
          >
            {draft.pumpBelowPmfs ? "On" : "Off"}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Margin floor (¢/L)</Label>
            <Input type="number" step="0.1" min="0" value={draft.marginCompressionCents}
              onChange={e => setDraft(d => ({ ...d, marginCompressionCents: parseFloat(e.target.value) || 0 }))}
              data-testid="input-alert-margin" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Crude move (%)</Label>
            <Input type="number" step="0.5" min="0" value={draft.crudeMovePct}
              onChange={e => setDraft(d => ({ ...d, crudeMovePct: parseFloat(e.target.value) || 0 }))}
              data-testid="input-alert-crude" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pump move 7d (%)</Label>
            <Input type="number" step="0.5" min="0" value={draft.pumpMovePct}
              onChange={e => setDraft(d => ({ ...d, pumpMovePct: parseFloat(e.target.value) || 0 }))}
              data-testid="input-alert-pump" />
          </div>
        </div>
        <Button onClick={handleSave} data-testid="button-save-alert-thresholds">Save Thresholds</Button>
      </CardContent>
    </Card>
  );
}

function ExternalDataRefresh() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const eiaMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/owner/market/external-indicators/refresh-eia").then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/external-indicators"] });
      toast({ title: "EIA refresh complete", description: `Inserted ${data.inserted ?? 0}, updated ${data.updated ?? 0}.` });
    },
    onError: (err: any) => toast({ title: "EIA refresh failed", description: err?.message, variant: "destructive" }),
  });

  const fxMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/owner/market/external-indicators/refresh-fx").then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/market/external-indicators"] });
      toast({ title: "FX refresh complete", description: `Inserted ${data.inserted ?? 0}, updated ${data.updated ?? 0}.` });
    },
    onError: (err: any) => toast({ title: "FX refresh failed", description: err?.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Droplet className="w-4 h-4" />
          External Market Data
        </CardTitle>
        <CardDescription>
          Crude oil &amp; US benchmarks (US EIA) and USD/CAD (Bank of Canada). Imported automatically; refresh on demand here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => eiaMutation.mutate()} disabled={eiaMutation.isPending} data-testid="button-refresh-eia">
          <RefreshCw className={`w-4 h-4 mr-2 ${eiaMutation.isPending ? 'animate-spin' : ''}`} />
          {eiaMutation.isPending ? "Refreshing…" : "Refresh Crude / US (EIA)"}
        </Button>
        <Button variant="outline" onClick={() => fxMutation.mutate()} disabled={fxMutation.isPending} data-testid="button-refresh-fx">
          <RefreshCw className={`w-4 h-4 mr-2 ${fxMutation.isPending ? 'animate-spin' : ''}`} />
          {fxMutation.isPending ? "Refreshing…" : "Refresh USD/CAD (BoC)"}
        </Button>
      </CardContent>
    </Card>
  );
}

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
      {/* Tax & carbon editor */}
      <TaxCarbonEditor />

      {/* Alert thresholds */}
      <AlertThresholdEditor />

      {/* External data refresh */}
      <ExternalDataRefresh />

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
              Market Command Center
            </h1>
            <p className="text-muted-foreground mt-0.5">
              Calgary pump prices, crude &amp; FX signals, taxes, margins, and forecasts
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
