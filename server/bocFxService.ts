import { storage } from './storage';

/**
 * Bank of Canada Valet FX feed (Market Intelligence subsystem only).
 *
 * Pulls the daily USD/CAD exchange rate (series FXUSDCAD = Canadian dollars per
 * 1 US dollar). Free, no API key required.
 *
 * STRICT SEPARATION: writes only to market_external_indicators. Never touches
 * PMFS pricing.
 */

const BOC_SERIES = 'FXUSDCAD';
const BOC_URL = `https://www.bankofcanada.ca/valet/observations/${BOC_SERIES}/json?recent=60`;
const INDICATOR_TYPE = 'usd_cad';
const SOURCE_TYPE = 'boc';
const SOURCE_LABEL = 'Bank of Canada Valet';

interface BocImportResult {
  success: boolean;
  inserted: number;
  skipped: number;
  error?: string;
}

interface FxPoint {
  effectiveDate: Date;
  value: number;
}

function parseObservations(json: any): FxPoint[] {
  const observations: any[] = json?.observations ?? [];
  const points: FxPoint[] = [];
  for (const obs of observations) {
    const dateStr = String(obs?.d ?? '').trim();
    const rawVal = obs?.[BOC_SERIES]?.v;
    if (!dateStr || rawVal === undefined || rawVal === null) continue;
    const value = parseFloat(String(rawVal));
    if (!Number.isFinite(value) || value <= 0) continue;
    const effectiveDate = new Date(`${dateStr}T00:00:00Z`);
    if (isNaN(effectiveDate.getTime())) continue;
    points.push({ effectiveDate, value });
  }
  return points;
}

/**
 * Pulls recent USD/CAD rates and stores new observations.
 * Idempotent — skips dates already stored.
 */
export async function triggerBocFxImport(): Promise<BocImportResult> {
  let inserted = 0;
  let skipped = 0;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    let json: any;
    try {
      const resp = await fetch(BOC_URL, { signal: controller.signal });
      if (!resp.ok) {
        clearTimeout(timeoutId);
        console.warn(`[BoC FX] HTTP ${resp.status}`);
        return { success: false, inserted: 0, skipped: 0, error: `HTTP ${resp.status}` };
      }
      json = await resp.json();
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn('[BoC FX] Fetch failed:', err?.message ?? err);
      return { success: false, inserted: 0, skipped: 0, error: String(err?.message ?? err) };
    }

    const points = parseObservations(json);
    for (const { effectiveDate, value } of points) {
      const created = await storage.insertMarketExternalIndicator({
        indicatorType: INDICATOR_TYPE,
        value: value.toFixed(6),
        unit: 'CAD per USD',
        effectiveDate,
        sourceType: SOURCE_TYPE,
        sourceLabel: SOURCE_LABEL,
        notes: `Bank of Canada series ${BOC_SERIES}`,
      });
      if (created) inserted++; else skipped++;
    }

    clearTimeout(timeoutId);
    console.log(`[BoC FX] Import complete — inserted: ${inserted}, skipped: ${skipped}`);
    return { success: true, inserted, skipped };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error('[BoC FX] Import error (non-blocking):', err);
    return { success: false, inserted, skipped, error: String(err?.message ?? err) };
  }
}

let bocScheduled = false;

/** Schedules the FX import daily at 9 AM Calgary time. */
export function scheduleBocFxImport(): void {
  if (bocScheduled) return;
  bocScheduled = true;

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
      console.log('[BoC FX] Running daily scheduled import...');
      triggerBocFxImport().catch(err => console.error('[BoC FX] Scheduled import failed:', err));
    }
  }, CHECK_INTERVAL_MS);

  console.log('[BoC FX] Scheduler initialized — runs daily at 9 AM Calgary time');
}
