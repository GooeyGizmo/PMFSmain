import { storage } from './storage';
import { XMLParser } from 'fast-xml-parser';

/**
 * NRCan weekly Calgary fuel price import service.
 * Runs every Monday at 8 AM Calgary time.
 *
 * Data source: NRCan webfeed RSS (webfeed_e.cfm) for Calgary (LocationID=66).
 * Prices are published weekly on Tuesdays, in $/L (e.g. "$1.815").
 *
 * NRCan Product IDs:
 *   1 = Regular Gasoline
 *   2 = Mid-Grade Gasoline
 *   3 = Premium Gasoline
 *   5 = Diesel
 */

const NRCAN_BASE_URL =
  'https://www2.nrcan-rncan.gc.ca/eneene/sources/pripri/webfeed_e.cfm';

// Calgary location ID on NRCan's system
const CALGARY_LOCATION_ID = 66;

const SOURCE_LABEL = 'NRCan Calgary Weekly Average';
const SOURCE_TYPE = 'nrcan';

interface FeedConfig {
  productId: number;
  fuelCategory: string;
  gradeLabel: string;
}

const FEED_CONFIGS: FeedConfig[] = [
  { productId: 1, fuelCategory: 'regular',  gradeLabel: 'Regular 87' },
  { productId: 2, fuelCategory: 'midgrade', gradeLabel: 'Mid-Grade 89' },
  { productId: 3, fuelCategory: 'premium',  gradeLabel: 'Premium 91' },
  { productId: 5, fuelCategory: 'diesel',   gradeLabel: 'Diesel' },
];

interface NrcanImportResult {
  success: boolean;
  inserted: number;
  skipped: number;
  error?: string;
}

/**
 * Fetches a single NRCan RSS feed and returns the latest price entry.
 * RSS <item> structure:
 *   <description>$1.815</description>
 *   <pubDate>Tue, 26 May 2026</pubDate>
 *
 * Prices are already in $/L — no conversion needed.
 */
async function fetchLatestPrice(
  config: FeedConfig,
  year: number,
  signal: AbortSignal
): Promise<{ pricePerLitre: string; observedAt: Date } | null> {
  const url =
    `${NRCAN_BASE_URL}?priceYear=${year}&productID=${config.productId}&locationID=${CALGARY_LOCATION_ID}`;

  let xmlText: string;
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) {
      console.warn(`[NRCanPrice] HTTP ${resp.status} for productID=${config.productId}`);
      return null;
    }
    xmlText = await resp.text();
  } catch (err: any) {
    console.warn(`[NRCanPrice] Fetch failed for productID=${config.productId}:`, err?.message ?? err);
    return null;
  }

  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const parsed = parser.parse(xmlText);

    const items = parsed?.rss?.channel?.item;
    if (!items) return null;

    const itemList: any[] = Array.isArray(items) ? items : [items];

    // Items are returned newest-first; pick the first valid one
    for (const item of itemList) {
      const rawDesc: string = String(item?.description ?? '').trim();
      const pubDateStr: string = String(item?.pubDate ?? '').trim();

      // Price is formatted as "$1.815" — strip the dollar sign
      const priceMatch = rawDesc.match(/\$?([\d.]+)/);
      if (!priceMatch) continue;

      const price = parseFloat(priceMatch[1]);
      if (isNaN(price) || price <= 0) continue;

      const observedAt = new Date(pubDateStr);
      if (isNaN(observedAt.getTime())) continue;

      // Prices are already in $/L
      return {
        pricePerLitre: price.toFixed(4),
        observedAt,
      };
    }

    return null;
  } catch (parseErr) {
    console.error(`[NRCanPrice] Parse error for productID=${config.productId}:`, parseErr);
    return null;
  }
}

/**
 * Fetches NRCan weekly Calgary prices for Regular, Mid-Grade, Premium, and
 * Diesel, then inserts new rows into market_pump_prices.
 * Idempotent — skips any row that already exists for that week.
 */
export async function triggerNrcanImport(): Promise<NrcanImportResult> {
  let inserted = 0;
  let skipped = 0;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const year = new Date().getFullYear();

    const results = await Promise.allSettled(
      FEED_CONFIGS.map(cfg => fetchLatestPrice(cfg, year, controller.signal))
    );

    clearTimeout(timeoutId);

    let anyExtracted = false;

    for (let i = 0; i < FEED_CONFIGS.length; i++) {
      const cfg = FEED_CONFIGS[i];
      const result = results[i];

      if (result.status === 'rejected' || result.value === null) {
        console.warn(`[NRCanPrice] No data for ${cfg.fuelCategory} (productID=${cfg.productId})`);
        continue;
      }

      anyExtracted = true;
      const { pricePerLitre, observedAt } = result.value;

      const exists = await storage.getMarketPumpPriceExists(
        cfg.fuelCategory,
        observedAt,
        SOURCE_TYPE
      );

      if (exists) {
        skipped++;
        continue;
      }

      await storage.insertMarketPumpPrice({
        fuelCategory: cfg.fuelCategory,
        gradeLabel: cfg.gradeLabel,
        sourceType: SOURCE_TYPE,
        sourceLabel: SOURCE_LABEL,
        pricePerLitre,
        observedAt,
        locationLabel: 'Calgary, AB',
        notes: 'Auto-imported from NRCan weekly RSS feed',
      });

      inserted++;
      console.log(`[NRCanPrice] Inserted ${cfg.gradeLabel}: $${pricePerLitre}/L for ${observedAt.toISOString().slice(0, 10)}`);
    }

    if (!anyExtracted) {
      console.warn('[NRCanPrice] No Calgary observations could be extracted from NRCan feeds');
      return { success: true, inserted: 0, skipped: 0 };
    }

    console.log(`[NRCanPrice] Import complete — inserted: ${inserted}, skipped: ${skipped}`);
    return { success: true, inserted, skipped };
  } catch (err: any) {
    console.error('[NRCanPrice] Import error (non-blocking):', err);
    return { success: false, inserted, skipped, error: String(err?.message ?? err) };
  }
}

let nrcanScheduled = false;

/**
 * Schedules NRCan import every Monday at 8 AM Calgary time.
 */
export function scheduleNrcanImport(): void {
  if (nrcanScheduled) return;
  nrcanScheduled = true;

  const CHECK_INTERVAL_MS = 60 * 1000;
  let lastRunDate: string | null = null;

  const getCalgaryInfo = () => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton',
      weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return {
      weekday: get('weekday'),
      hour: parseInt(get('hour'), 10),
      minute: parseInt(get('minute'), 10),
      dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    };
  };

  setInterval(async () => {
    const info = getCalgaryInfo();
    if (
      info.weekday === 'Mon' &&
      info.hour === 8 &&
      info.minute < 10 &&
      lastRunDate !== info.dateStr
    ) {
      lastRunDate = info.dateStr;
      console.log('[NRCanPrice] Running Monday scheduled import...');
      triggerNrcanImport().catch(err =>
        console.error('[NRCanPrice] Scheduled import failed:', err)
      );
    }
  }, CHECK_INTERVAL_MS);

  console.log('[NRCanPrice] Scheduler initialized — runs every Monday at 8 AM Calgary time');
}
