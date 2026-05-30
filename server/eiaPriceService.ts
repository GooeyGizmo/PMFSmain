import { storage } from './storage';

/**
 * US EIA open-data market feed (Market Intelligence subsystem only).
 *
 * Pulls reference benchmarks that influence Calgary fuel prices:
 *   - WTI crude spot (RWTC, $/bbl, daily)
 *   - Brent crude spot (RBRTE, $/bbl, daily)
 *   - US regular retail gasoline (EMM_EPMR_PTE_NUS_DPG, $/gal, weekly)
 *   - US No.2 diesel retail (EMD_EPD2D_PTE_NUS_DPG, $/gal, weekly)
 *
 * Requires a free API key in the EIA_API_KEY secret. If the key is missing the
 * service no-ops with a clear log message (never throws).
 *
 * STRICT SEPARATION: writes only to market_external_indicators. Never touches
 * PMFS pricing.
 */

const EIA_BASE = 'https://api.eia.gov/v2';

interface EiaSeries {
  indicatorType: string;
  unit: string;
  // EIA v2 dataset path + series facet id
  path: string;       // e.g. "petroleum/pri/spt"
  seriesId: string;   // e.g. "RWTC"
  frequency: 'daily' | 'weekly';
}

const EIA_SERIES: EiaSeries[] = [
  { indicatorType: 'wti_crude',   unit: 'USD/bbl', path: 'petroleum/pri/spt', seriesId: 'RWTC',  frequency: 'daily' },
  { indicatorType: 'brent_crude', unit: 'USD/bbl', path: 'petroleum/pri/spt', seriesId: 'RBRTE', frequency: 'daily' },
  { indicatorType: 'us_gasoline', unit: 'USD/gal', path: 'petroleum/pri/gnd', seriesId: 'EMM_EPMR_PTE_NUS_DPG', frequency: 'weekly' },
  { indicatorType: 'us_diesel',   unit: 'USD/gal', path: 'petroleum/pri/gnd', seriesId: 'EMD_EPD2D_PTE_NUS_DPG', frequency: 'weekly' },
];

const SOURCE_TYPE = 'eia';
const SOURCE_LABEL = 'US EIA';

interface EiaImportResult {
  success: boolean;
  inserted: number;
  skipped: number;
  error?: string;
}

interface SeriesPoint {
  effectiveDate: Date;
  value: number;
}

/** Fetches recent observations for a single EIA series. Returns [] on any failure. */
async function fetchSeries(series: EiaSeries, apiKey: string, signal: AbortSignal): Promise<SeriesPoint[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    frequency: series.frequency,
    'data[0]': 'value',
    'facets[series][]': series.seriesId,
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '120',
  });
  const url = `${EIA_BASE}/${series.path}/data/?${params.toString()}`;

  let json: any;
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) {
      console.warn(`[EIA] HTTP ${resp.status} for ${series.indicatorType}`);
      return [];
    }
    json = await resp.json();
  } catch (err: any) {
    console.warn(`[EIA] Fetch failed for ${series.indicatorType}:`, err?.message ?? err);
    return [];
  }

  try {
    const rows: any[] = json?.response?.data ?? [];
    const points: SeriesPoint[] = [];
    for (const row of rows) {
      const period = String(row?.period ?? '').trim();
      const rawVal = row?.value;
      if (!period) continue;
      const value = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
      if (!Number.isFinite(value) || value <= 0) continue;
      // period is "YYYY-MM-DD" (daily) or "YYYY-MM-DD" (weekly week-ending)
      const effectiveDate = new Date(`${period}T00:00:00Z`);
      if (isNaN(effectiveDate.getTime())) continue;
      points.push({ effectiveDate, value });
    }
    return points;
  } catch (parseErr) {
    console.error(`[EIA] Parse error for ${series.indicatorType}:`, parseErr);
    return [];
  }
}

async function insertPoints(series: EiaSeries, points: SeriesPoint[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const { effectiveDate, value } of points) {
    const created = await storage.insertMarketExternalIndicator({
      indicatorType: series.indicatorType,
      value: value.toFixed(6),
      unit: series.unit,
      effectiveDate,
      sourceType: SOURCE_TYPE,
      sourceLabel: SOURCE_LABEL,
      notes: `EIA series ${series.seriesId}`,
    });
    if (created) inserted++; else skipped++;
  }
  return { inserted, skipped };
}

/**
 * Pulls all configured EIA series and stores new observations.
 * Idempotent — skips dates already stored. No-ops if EIA_API_KEY is missing.
 */
export async function triggerEiaImport(): Promise<EiaImportResult> {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    console.log('[EIA] EIA_API_KEY not configured — skipping EIA import (no-op)');
    return { success: false, inserted: 0, skipped: 0, error: 'EIA_API_KEY not configured' };
  }

  let inserted = 0;
  let skipped = 0;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const results = await Promise.allSettled(
      EIA_SERIES.map(s => fetchSeries(s, apiKey, controller.signal))
    );

    for (let i = 0; i < EIA_SERIES.length; i++) {
      const series = EIA_SERIES[i];
      const result = results[i];
      if (result.status === 'rejected' || result.value.length === 0) {
        console.warn(`[EIA] No data for ${series.indicatorType}`);
        continue;
      }
      const counts = await insertPoints(series, result.value);
      inserted += counts.inserted;
      skipped += counts.skipped;
    }

    clearTimeout(timeoutId);
    console.log(`[EIA] Import complete — inserted: ${inserted}, skipped: ${skipped}`);
    return { success: true, inserted, skipped };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error('[EIA] Import error (non-blocking):', err);
    return { success: false, inserted, skipped, error: String(err?.message ?? err) };
  }
}

let eiaScheduled = false;

/** Schedules the EIA import daily at 9 AM Calgary time. */
export function scheduleEiaImport(): void {
  if (eiaScheduled) return;
  eiaScheduled = true;

  const CHECK_INTERVAL_MS = 60 * 1000;
  const TARGET_HOUR = 9;
  let lastRunDate: string | null = null;

  const getCalgaryInfo = () => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
    return { hour: parseInt(get('hour'), 10), dateStr: `${get('year')}-${get('month')}-${get('day')}` };
  };

  setInterval(async () => {
    const { hour, dateStr } = getCalgaryInfo();
    if (hour === TARGET_HOUR && lastRunDate !== dateStr) {
      lastRunDate = dateStr;
      console.log('[EIA] Running daily scheduled import...');
      triggerEiaImport().catch(err => console.error('[EIA] Scheduled import failed:', err));
    }
  }, CHECK_INTERVAL_MS);

  console.log('[EIA] Scheduler initialized — runs daily at 9 AM Calgary time (no-op without EIA_API_KEY)');
}
