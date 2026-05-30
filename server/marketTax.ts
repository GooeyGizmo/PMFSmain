import { storage } from './storage';

/**
 * Market Intelligence tax & carbon configuration + price decomposition.
 *
 * IMPORTANT — STRICT SEPARATION FROM PMFS PRICING:
 * This module is an ANALYTICAL tool inside the Market Intelligence subsystem.
 * It decomposes an observed *market* pump price into its tax/margin components
 * for display only. It NEVER reads, writes, or influences PMFS's own customer
 * pricing. The config lives under its own business_settings key
 * (`market_tax_config`), separate from any PMFS pricing settings.
 */

const TAX_CONFIG_KEY = 'market_tax_config';

export interface FuelTaxRates {
  federalExcisePerL: number;   // CRA federal excise tax ($/L)
  provincialFuelTaxPerL: number; // Alberta provincial fuel tax ($/L)
  carbonChargePerL: number;    // Federal carbon charge ($/L)
}

export interface MarketTaxConfig {
  gstPercent: number;          // e.g. 0.05 for 5%
  gasoline: FuelTaxRates;
  diesel: FuelTaxRates;
}

/**
 * Canada / Alberta defaults (2026).
 * - Federal excise: gasoline 10¢/L, diesel 4¢/L
 * - Alberta provincial fuel tax: 13¢/L (gasoline & diesel)
 * - Federal consumer carbon charge: $0 (removed April 1 2025) — configurable
 * - GST: 5%
 * All values are editable later from the Market page's own Settings tab.
 */
export const DEFAULT_TAX_CONFIG: MarketTaxConfig = {
  gstPercent: 0.05,
  gasoline: { federalExcisePerL: 0.10, provincialFuelTaxPerL: 0.13, carbonChargePerL: 0 },
  diesel: { federalExcisePerL: 0.04, provincialFuelTaxPerL: 0.13, carbonChargePerL: 0 },
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function mergeRates(base: FuelTaxRates, override: any): FuelTaxRates {
  if (!override || typeof override !== 'object') return { ...base };
  return {
    federalExcisePerL: isFiniteNumber(override.federalExcisePerL) ? override.federalExcisePerL : base.federalExcisePerL,
    provincialFuelTaxPerL: isFiniteNumber(override.provincialFuelTaxPerL) ? override.provincialFuelTaxPerL : base.provincialFuelTaxPerL,
    carbonChargePerL: isFiniteNumber(override.carbonChargePerL) ? override.carbonChargePerL : base.carbonChargePerL,
  };
}

/** Reads the stored config, falling back to defaults for any missing field. */
export async function getMarketTaxConfig(): Promise<MarketTaxConfig> {
  try {
    const raw = await storage.getBusinessSetting(TAX_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_TAX_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      gstPercent: isFiniteNumber(parsed.gstPercent) ? parsed.gstPercent : DEFAULT_TAX_CONFIG.gstPercent,
      gasoline: mergeRates(DEFAULT_TAX_CONFIG.gasoline, parsed.gasoline),
      diesel: mergeRates(DEFAULT_TAX_CONFIG.diesel, parsed.diesel),
    };
  } catch (err) {
    console.warn('[MarketTax] Failed to read tax config, using defaults:', (err as any)?.message ?? err);
    return { ...DEFAULT_TAX_CONFIG };
  }
}

/** Persists a full tax config (validated/clamped) to business_settings. */
export async function setMarketTaxConfig(input: Partial<MarketTaxConfig>, updatedBy?: string): Promise<MarketTaxConfig> {
  const current = await getMarketTaxConfig();
  const merged: MarketTaxConfig = {
    gstPercent: isFiniteNumber(input.gstPercent) ? Math.max(0, input.gstPercent!) : current.gstPercent,
    gasoline: mergeRates(current.gasoline, input.gasoline),
    diesel: mergeRates(current.diesel, input.diesel),
  };
  await storage.setBusinessSetting(TAX_CONFIG_KEY, JSON.stringify(merged), updatedBy);
  return merged;
}

export interface PriceDecomposition {
  fuelCategory: string;
  pricePerLitre: number;
  gst: number;
  federalExcise: number;
  provincialFuelTax: number;
  carbonCharge: number;
  // base wholesale + retail margin combined when no wholesale reference is given
  fuelAndMargin: number;
  baseCost: number | null;     // wholesale reference, when available
  retailMargin: number | null; // fuelAndMargin - baseCost, when available
  components: Array<{ key: string; label: string; amount: number }>;
}

/**
 * Decomposes an observed pump price into base/margin/excise/provincial/carbon/GST.
 * Canadian fuel taxes are embedded in the posted price and GST is charged on top
 * of all of them (tax-on-tax), so GST is backed out first, then the per-litre
 * taxes are subtracted to leave wholesale + retail margin.
 *
 * `wholesalePerLitre` (optional) lets the caller split fuelAndMargin into a base
 * (wholesale) cost and the retailer's margin.
 */
export function decomposePumpPrice(
  pricePerLitre: number,
  fuelCategory: string,
  config: MarketTaxConfig,
  wholesalePerLitre?: number | null,
): PriceDecomposition {
  const isDiesel = (fuelCategory || '').toLowerCase() === 'diesel';
  const rates = isDiesel ? config.diesel : config.gasoline;

  const price = Math.max(0, pricePerLitre);
  const gst = price - price / (1 + config.gstPercent);
  const preGst = price - gst;
  const federalExcise = rates.federalExcisePerL;
  const provincialFuelTax = rates.provincialFuelTaxPerL;
  const carbonCharge = rates.carbonChargePerL;
  const fuelAndMargin = preGst - federalExcise - provincialFuelTax - carbonCharge;

  let baseCost: number | null = null;
  let retailMargin: number | null = null;
  if (isFiniteNumber(wholesalePerLitre) && wholesalePerLitre! > 0) {
    baseCost = wholesalePerLitre!;
    retailMargin = fuelAndMargin - wholesalePerLitre!;
  }

  const round = (n: number) => Math.round(n * 10000) / 10000;

  const components = baseCost !== null
    ? [
        { key: 'baseCost', label: 'Base / Wholesale Cost', amount: round(baseCost) },
        { key: 'retailMargin', label: 'Retail Margin', amount: round(retailMargin!) },
        { key: 'federalExcise', label: 'Federal Excise Tax', amount: round(federalExcise) },
        { key: 'provincialFuelTax', label: 'Provincial Fuel Tax', amount: round(provincialFuelTax) },
        { key: 'carbonCharge', label: 'Carbon Charge', amount: round(carbonCharge) },
        { key: 'gst', label: 'GST (5%)', amount: round(gst) },
      ]
    : [
        { key: 'fuelAndMargin', label: 'Fuel Cost + Retail Margin', amount: round(fuelAndMargin) },
        { key: 'federalExcise', label: 'Federal Excise Tax', amount: round(federalExcise) },
        { key: 'provincialFuelTax', label: 'Provincial Fuel Tax', amount: round(provincialFuelTax) },
        { key: 'carbonCharge', label: 'Carbon Charge', amount: round(carbonCharge) },
        { key: 'gst', label: 'GST (5%)', amount: round(gst) },
      ];

  return {
    fuelCategory,
    pricePerLitre: round(price),
    gst: round(gst),
    federalExcise: round(federalExcise),
    provincialFuelTax: round(provincialFuelTax),
    carbonCharge: round(carbonCharge),
    fuelAndMargin: round(fuelAndMargin),
    baseCost: baseCost !== null ? round(baseCost) : null,
    retailMargin: retailMargin !== null ? round(retailMargin) : null,
    components,
  };
}
