import { db } from './db';
import { fuelPriceHistory, marketPumpPrices } from '@shared/schema';
import { asc, and, eq, lt } from 'drizzle-orm';
import { storage } from './storage';

const DERIVED_SOURCE_LABEL = 'Derived from PMFS fuel_price_history (base_cost)';
const NRCAN_DERIVED_SOURCE_LABEL = 'Pre-history estimate (NRCan pump price proxy)';

// Maps PMFS fuel_price_history fuelType to market grade labels and categories
const FUEL_GRADE_MAP: Record<string, { fuelCategory: string; gradeLabel: string }> = {
  regular: { fuelCategory: 'regular', gradeLabel: 'Regular 87' },
  premium: { fuelCategory: 'premium', gradeLabel: 'Premium 91' },
  diesel: { fuelCategory: 'diesel', gradeLabel: 'Diesel' },
};

// Typical pump-to-wholesale margin used as a proxy when no UFA data is available
// (Alberta rack rates are typically 12–18¢/L below posted pump price)
const NRCAN_TO_WHOLESALE_MARGIN = 0.15;

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

/**
 * Reads fuel_price_history (SELECT only — never writes to it) and produces
 * derived market_wholesale_snapshots rows representing estimated UFA cost at
 * each date using step-interpolation (carry-last-known-value forward).
 *
 * Step 1 — Pre-history seeding:
 *   For any PMFS grade that has NRCan pump prices recorded BEFORE the first
 *   fuel_price_history row, produce wholesale estimates by subtracting a
 *   fixed pump-to-rack margin (15¢/L).
 *
 * Step 2 — Full date-range carry-forward:
 *   Walk every calendar day from the first history entry to today. If the day
 *   has a history entry, update the last-known cost. If not, carry the previous
 *   cost forward. Insert a snapshot for every day that doesn't already have one.
 *
 * This is idempotent: skips dates that already have a snapshot.
 */
export async function runMarketBackfill(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  try {
    const history = await db
      .select()
      .from(fuelPriceHistory)
      .orderBy(asc(fuelPriceHistory.recordedAt));

    // ── Step 1: Pre-history seeding from NRCan pump prices ─────────────────
    for (const [fuelType, gradeInfo] of Object.entries(FUEL_GRADE_MAP)) {
      const firstHistoryRow = history.find(r => r.fuelType === fuelType);
      if (!firstHistoryRow) continue;

      const firstHistoryDate = new Date(firstHistoryRow.recordedAt);
      firstHistoryDate.setHours(0, 0, 0, 0);

      // Find NRCan pump prices for this grade recorded before the first history row
      const preHistoryPrices = await db
        .select()
        .from(marketPumpPrices)
        .where(
          and(
            eq(marketPumpPrices.fuelCategory, gradeInfo.fuelCategory),
            eq(marketPumpPrices.sourceType, 'nrcan'),
            lt(marketPumpPrices.observedAt, firstHistoryDate)
          )
        )
        .orderBy(asc(marketPumpPrices.observedAt));

      for (const nrcanRow of preHistoryPrices) {
        const effectiveDate = new Date(nrcanRow.observedAt);
        effectiveDate.setHours(0, 0, 0, 0);

        const exists = await storage.getMarketWholesaleSnapshotExists(gradeInfo.fuelCategory, effectiveDate);
        if (exists) {
          skipped++;
          continue;
        }

        const pumpPrice = parseFloat(nrcanRow.pricePerLitre);
        const wholesaleEstimate = (pumpPrice - NRCAN_TO_WHOLESALE_MARGIN).toFixed(4);

        await storage.insertMarketWholesaleSnapshot({
          fuelCategory: gradeInfo.fuelCategory,
          gradeLabel: gradeInfo.gradeLabel,
          sourceLabel: NRCAN_DERIVED_SOURCE_LABEL,
          pricePerLitre: wholesaleEstimate,
          effectiveDate,
          sourceType: 'calculated',
          notes: `Estimated from NRCan pump price $${pumpPrice.toFixed(3)}/L minus ${(NRCAN_TO_WHOLESALE_MARGIN * 100).toFixed(0)}¢/L rack margin`,
        });
        inserted++;
      }
    }

    // ── Step 2: Full date-range step-interpolation from fuel_price_history ──
    if (history.length === 0) {
      console.log('[MarketBackfill] No fuel_price_history rows found — nothing to backfill');
      return { inserted, skipped };
    }

    // Group by fuel type
    const byType: Record<string, typeof history> = {};
    for (const row of history) {
      if (!byType[row.fuelType]) byType[row.fuelType] = [];
      byType[row.fuelType].push(row);
    }

    for (const [fuelType, rows] of Object.entries(byType)) {
      const gradeInfo = FUEL_GRADE_MAP[fuelType];
      if (!gradeInfo) continue;

      // Build a dateStr -> baseCost lookup from actual history rows
      const costByDay: Record<string, string> = {};
      for (const row of rows) {
        if (!row.baseCost) continue;
        const day = new Date(row.recordedAt);
        day.setHours(0, 0, 0, 0);
        costByDay[toDateStr(day)] = row.baseCost;
      }

      // Walk every calendar day from first history row to today
      const firstDate = new Date(rows[0].recordedAt);
      firstDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let lastKnownCost: string | null = null;
      let current = new Date(firstDate);

      while (current <= today) {
        const dayStr = toDateStr(current);

        // Advance carry-forward if this day has a direct history entry
        if (costByDay[dayStr]) {
          lastKnownCost = costByDay[dayStr];
        }

        if (lastKnownCost) {
          const exists = await storage.getMarketWholesaleSnapshotExists(gradeInfo.fuelCategory, new Date(current));
          if (exists) {
            skipped++;
          } else {
            await storage.insertMarketWholesaleSnapshot({
              fuelCategory: gradeInfo.fuelCategory,
              gradeLabel: gradeInfo.gradeLabel,
              sourceLabel: DERIVED_SOURCE_LABEL,
              pricePerLitre: lastKnownCost,
              effectiveDate: new Date(current),
              sourceType: 'calculated',
              notes: costByDay[dayStr]
                ? `Direct from fuel_price_history`
                : `Step-interpolated (carry-forward from last known PMFS base cost)`,
            });
            inserted++;
          }
        }

        current = addDays(current, 1);
      }
    }

    console.log(`[MarketBackfill] Done — inserted: ${inserted}, skipped (already existed): ${skipped}`);
  } catch (err) {
    console.error('[MarketBackfill] Error during backfill:', err);
  }

  return { inserted, skipped };
}

let backfillScheduled = false;

/**
 * Schedules the backfill to run nightly at 2 AM Calgary time to keep
 * gaps filled as new fuel_price_history rows appear.
 */
export function scheduleNightlyBackfill(): void {
  if (backfillScheduled) return;
  backfillScheduled = true;

  const CHECK_INTERVAL_MS = 60 * 1000; // check every minute
  const TARGET_HOUR = 2; // 2 AM Calgary time
  let lastRunDate: string | null = null;

  const getCalgaryHourAndDate = () => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
    return {
      hour: parseInt(get('hour'), 10),
      dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    };
  };

  setInterval(async () => {
    const { hour, dateStr } = getCalgaryHourAndDate();
    if (hour === TARGET_HOUR && lastRunDate !== dateStr) {
      lastRunDate = dateStr;
      console.log('[MarketBackfill] Running nightly backfill...');
      await runMarketBackfill().catch(err =>
        console.error('[MarketBackfill] Nightly run failed:', err)
      );
    }
  }, CHECK_INTERVAL_MS);

  console.log('[MarketBackfill] Nightly backfill scheduler initialized (runs at 2 AM Calgary time)');
}
