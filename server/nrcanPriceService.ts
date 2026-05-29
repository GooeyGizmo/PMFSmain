import { storage } from './storage';
// fast-xml-parser is available in this project
import { XMLParser } from 'fast-xml-parser';

/**
 * NRCan weekly Calgary fuel price import service.
 * Runs every Monday at 8 AM Calgary time.
 * Fetches NRCan's weekly XML feed and upserts into market_pump_prices.
 * Never throws — failures are logged silently.
 */

const NRCAN_XML_URL =
  'https://natural-resources.canada.ca/sites/nrcan/files/energy/fuel_prices/fuel_pricesXML_e.xml';

const SOURCE_LABEL = 'NRCan Calgary Weekly Average';
const SOURCE_TYPE = 'nrcan';

// NRCan city name for Calgary
const CALGARY_CITY = 'Calgary';

// Grade mapping from NRCan product names to our categories
const NRCAN_GRADE_MAP: Array<{
  nrcanProduct: string;
  fuelCategory: string;
  gradeLabel: string;
}> = [
  { nrcanProduct: 'regular', fuelCategory: 'regular', gradeLabel: 'Regular 87' },
  { nrcanProduct: 'premium', fuelCategory: 'premium', gradeLabel: 'Premium 91' },
  { nrcanProduct: 'diesel', fuelCategory: 'diesel', gradeLabel: 'Diesel' },
  { nrcanProduct: 'midgrade', fuelCategory: 'midgrade', gradeLabel: 'Mid-Grade 89' },
];

interface NrcanImportResult {
  success: boolean;
  inserted: number;
  skipped: number;
  error?: string;
}

/**
 * Parses NRCan XML and extracts Calgary weekly prices.
 * Returns an array of observations (fuelCategory, gradeLabel, price, observedAt).
 */
function parseNrcanXml(xmlText: string): Array<{
  fuelCategory: string;
  gradeLabel: string;
  pricePerLitre: string;
  observedAt: Date;
}> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const result = parser.parse(xmlText);

  const observations: Array<{
    fuelCategory: string;
    gradeLabel: string;
    pricePerLitre: string;
    observedAt: Date;
  }> = [];

  try {
    // NRCan XML structure: <Prices> <Products> <Product type="..."> <City name="..."> <Price date="...">...</Price>
    const products = result?.Prices?.Products?.Product;
    if (!products) return observations;

    const productList = Array.isArray(products) ? products : [products];

    for (const product of productList) {
      const productType: string = (product['@_type'] ?? '').toLowerCase().trim();
      const gradeInfo = NRCAN_GRADE_MAP.find(
        g => g.nrcanProduct === productType || productType.includes(g.nrcanProduct)
      );
      if (!gradeInfo) continue;

      const cities = product?.City;
      if (!cities) continue;
      const cityList = Array.isArray(cities) ? cities : [cities];

      for (const city of cityList) {
        const cityName: string = city['@_name'] ?? '';
        if (!cityName.toLowerCase().includes(CALGARY_CITY.toLowerCase())) continue;

        // Get most recent price entry
        const prices = city?.Price;
        if (!prices) continue;
        const priceList = Array.isArray(prices) ? prices : [prices];

        // Sort by date descending and take the latest
        const sorted = priceList
          .filter((p: any) => p['@_date'] && p['#text'])
          .sort((a: any, b: any) =>
            new Date(b['@_date']).getTime() - new Date(a['@_date']).getTime()
          );

        if (sorted.length === 0) continue;
        const latest = sorted[0];
        const rawPrice = parseFloat(String(latest['#text']));
        if (isNaN(rawPrice) || rawPrice <= 0) continue;

        // NRCan prices are in cents/litre — convert to $/L
        const pricePerLitre = (rawPrice / 100).toFixed(4);
        const observedAt = new Date(latest['@_date']);

        observations.push({
          fuelCategory: gradeInfo.fuelCategory,
          gradeLabel: gradeInfo.gradeLabel,
          pricePerLitre,
          observedAt,
        });
      }
    }
  } catch (parseErr) {
    console.error('[NRCanPrice] XML parse error:', parseErr);
  }

  return observations;
}

/**
 * Fetches NRCan weekly Calgary prices and inserts new rows into
 * market_pump_prices. Idempotent — skips if row already exists for that week.
 */
export async function triggerNrcanImport(): Promise<NrcanImportResult> {
  let inserted = 0;
  let skipped = 0;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let xmlText: string;
    try {
      const resp = await fetch(NRCAN_XML_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!resp.ok) {
        return { success: false, inserted: 0, skipped: 0, error: `HTTP ${resp.status}` };
      }
      xmlText = await resp.text();
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      const msg = fetchErr?.name === 'AbortError' ? 'Request timed out' : String(fetchErr?.message ?? fetchErr);
      console.warn('[NRCanPrice] Fetch failed (non-blocking):', msg);
      return { success: false, inserted: 0, skipped: 0, error: msg };
    }

    const observations = parseNrcanXml(xmlText);

    if (observations.length === 0) {
      console.warn('[NRCanPrice] No Calgary observations extracted from XML');
      return { success: true, inserted: 0, skipped: 0 };
    }

    for (const obs of observations) {
      const exists = await storage.getMarketPumpPriceExists(obs.fuelCategory, obs.observedAt, SOURCE_TYPE);
      if (exists) {
        skipped++;
        continue;
      }

      await storage.insertMarketPumpPrice({
        fuelCategory: obs.fuelCategory,
        gradeLabel: obs.gradeLabel,
        sourceType: SOURCE_TYPE,
        sourceLabel: SOURCE_LABEL,
        pricePerLitre: obs.pricePerLitre,
        observedAt: obs.observedAt,
        locationLabel: 'Calgary, AB',
        notes: 'Imported from NRCan weekly XML feed',
      });
      inserted++;
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
      weekday: get('weekday'), // Mon, Tue, etc.
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
