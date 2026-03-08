import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ArrowLeft, TrendingUp, DollarSign, Calendar, Fuel, Truck, BarChart3,
  Users, Plus, X, ChevronDown, Target, Wallet, PiggyBank
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import {
  SUBSCRIPTION_MONTHLY_FEES,
  DELIVERY_FEES_BY_TIER,
  SUBSCRIPTION_DISPLAY_NAMES,
  GST_RATE,
  STRIPE_FEE_RATE,
  STRIPE_FEE_FLAT_CENTS,
  type SubscriptionTierId,
} from '@shared/pricing';

interface ProfitabilityCalculatorProps {
  embedded?: boolean;
}

interface Expense {
  id: string;
  name: string;
  amount: string;
  frequency: 'daily' | 'weekly' | 'monthly';
}

const TIER_COLORS: Record<SubscriptionTierId, string> = {
  payg: 'bg-gray-500',
  access: 'bg-cyan-600',
  heroes: 'bg-indigo-600',
  household: 'bg-sky-400',
  rural: 'bg-green-700',
  vip: 'bg-amber-600',
};

const TIER_ORDER: SubscriptionTierId[] = ['payg', 'access', 'heroes', 'household', 'rural', 'vip'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

interface BucketAllocation {
  accountType: string;
  name: string;
  fromFuelSales: number;
  fromDeliveryFees: number;
  fromSubscriptions: number;
  total: number;
  description: string;
}

const BUCKET_DISPLAY: Record<string, { name: string; description: string; color: string }> = {
  operating_chequing: { name: 'Operating Chequing', description: 'Main business operating account', color: 'text-blue-700' },
  gst_holding: { name: 'GST Holding', description: 'GST collected — set aside for CRA quarterly remittance', color: 'text-red-600' },
  fuel_cogs_payable: { name: 'Fuel COGS Payable (UFA)', description: 'Wholesale fuel cost owed to UFA Petroleum — cardlock account payable', color: 'text-amber-800' },
  deferred_subscription: { name: 'Deferred Subscription Revenue', description: '40% of subscriptions held for service obligation', color: 'text-purple-600' },
  income_tax_reserve: { name: 'Income Tax Reserve', description: 'Reserve for Alberta/Federal income tax', color: 'text-orange-600' },
  maintenance_reserve: { name: 'Maintenance & Replacement', description: 'Equipment maintenance and replacement fund', color: 'text-amber-700' },
  emergency_risk: { name: 'Emergency / Risk Fund', description: 'Emergency and risk buffer', color: 'text-rose-600' },
  growth_capital: { name: 'Growth / Capital Fund', description: 'Business expansion and capital', color: 'text-teal-600' },
  owner_draw_holding: { name: 'Owner Draw Holding', description: 'Available for owner compensation', color: 'text-sage' },
};

const BUCKET_ORDER = [
  'operating_chequing',
  'gst_holding',
  'fuel_cogs_payable',
  'deferred_subscription',
  'income_tax_reserve',
  'maintenance_reserve',
  'emergency_risk',
  'growth_capital',
  'owner_draw_holding',
];

type WeekPreset = '3day' | '6day';

const WEEK_PRESETS: Record<WeekPreset, {
  tierCounts: Record<SubscriptionTierId, string>;
  workDaysPerWeek: string;
  incomeTaxRate: string;
  fuelMix: { regular: string; diesel: string; premium: string };
  expenses: Expense[];
  discretionarySplit: { owner_draw_holding: string; growth_capital: string; maintenance_reserve: string; emergency_risk: string };
}> = {
  '3day': {
    tierCounts: { payg: '2', access: '3', heroes: '0', household: '10', rural: '0', vip: '0' },
    workDaysPerWeek: '3',
    incomeTaxRate: '25',
    fuelMix: { regular: '60', diesel: '40', premium: '0' },
    expenses: [
      { id: '1', name: 'Truck Fuel (Diesel)', amount: '50', frequency: 'daily' },
      { id: '2', name: 'Vehicle Insurance', amount: '275', frequency: 'monthly' },
      { id: '3', name: 'Phone/Data Plan', amount: '0', frequency: 'monthly' },
      { id: '4', name: 'Software Subscription', amount: '50', frequency: 'monthly' },
    ],
    discretionarySplit: { owner_draw_holding: '55', growth_capital: '25', maintenance_reserve: '10', emergency_risk: '10' },
  },
  '6day': {
    tierCounts: { payg: '5', access: '6', heroes: '0', household: '14', rural: '0', vip: '0' },
    workDaysPerWeek: '6',
    incomeTaxRate: '25',
    fuelMix: { regular: '60', diesel: '40', premium: '0' },
    expenses: [
      { id: '1', name: 'Truck Fuel (Diesel)', amount: '50', frequency: 'daily' },
      { id: '2', name: 'Vehicle Insurance', amount: '275', frequency: 'monthly' },
      { id: '3', name: 'Phone/Data Plan', amount: '0', frequency: 'monthly' },
      { id: '4', name: 'Software Subscription', amount: '50', frequency: 'monthly' },
    ],
    discretionarySplit: { owner_draw_holding: '55', growth_capital: '25', maintenance_reserve: '10', emergency_risk: '10' },
  },
};

export default function ProfitabilityCalculator({ embedded = false }: ProfitabilityCalculatorProps) {
  const { data: pricingData } = useQuery<{ pricing: any[] }>({
    queryKey: ['/api/fuel-pricing'],
  });

  const [activePreset, setActivePreset] = useState<WeekPreset>('3day');

  const applyPreset = (preset: WeekPreset) => {
    const p = WEEK_PRESETS[preset];
    setActivePreset(preset);
    setTierCounts(p.tierCounts);
    setWorkDaysPerWeek(p.workDaysPerWeek);
    setIncomeTaxRate(p.incomeTaxRate);
    setFuelMix(p.fuelMix);
    setExpenses(p.expenses.map(e => ({ ...e })));
    setDiscretionarySplit(p.discretionarySplit);
  };

  const [tierCounts, setTierCounts] = useState<Record<SubscriptionTierId, string>>({
    payg: '2',
    access: '3',
    heroes: '0',
    household: '10',
    rural: '0',
    vip: '0',
  });

  const [deliveriesPerMonth, setDeliveriesPerMonth] = useState<Record<SubscriptionTierId, string>>({
    payg: '1',
    access: '2',
    heroes: '4',
    household: '4',
    rural: '4',
    vip: '4',
  });

  const [avgLitresPerDelivery, setAvgLitresPerDelivery] = useState<Record<SubscriptionTierId, string>>({
    payg: '45',
    access: '50',
    heroes: '60',
    household: '65',
    rural: '120',
    vip: '100',
  });

  const [fuelMix, setFuelMix] = useState({
    regular: '60',
    diesel: '40',
    premium: '0',
  });

  const [workDaysPerWeek, setWorkDaysPerWeek] = useState('3');

  const [expenses, setExpenses] = useState<Expense[]>([
    { id: '1', name: 'Truck Fuel (Diesel)', amount: '50', frequency: 'daily' },
    { id: '2', name: 'Vehicle Insurance', amount: '275', frequency: 'monthly' },
    { id: '3', name: 'Phone/Data Plan', amount: '0', frequency: 'monthly' },
    { id: '4', name: 'Software Subscription', amount: '50', frequency: 'monthly' },
  ]);

  const [sectionsOpen, setSectionsOpen] = useState({
    tiers: true,
    fuel: true,
    expenses: true,
    waterfall: true,
  });

  const [incomeTaxRate, setIncomeTaxRate] = useState('25');

  const [discretionarySplit, setDiscretionarySplit] = useState({
    owner_draw_holding: '55',
    growth_capital: '25',
    maintenance_reserve: '10',
    emergency_risk: '10',
  });

  const addExpense = () => {
    setExpenses([...expenses, { id: crypto.randomUUID(), name: '', amount: '0', frequency: 'monthly' }]);
  };

  const removeExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  const updateExpense = (id: string, field: keyof Expense, value: string) => {
    setExpenses(expenses.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const livePricing = useMemo(() => {
    const pricing = pricingData?.pricing || [];
    return {
      regular: pricing.find((p: any) => p.fuelType === 'regular') || { baseCost: '1.2893', customerPrice: '1.4444' },
      diesel: pricing.find((p: any) => p.fuelType === 'diesel') || { baseCost: '1.2951', customerPrice: '1.6705' },
      premium: pricing.find((p: any) => p.fuelType === 'premium') || { baseCost: '1.3451', customerPrice: '1.7863' },
    };
  }, [pricingData]);

  const projections = useMemo(() => {
    const workDays = parseFloat(workDaysPerWeek) || 3;
    const regMix = parseFloat(fuelMix.regular) / 100 || 0;
    const dieselMix = parseFloat(fuelMix.diesel) / 100 || 0;
    const premiumMix = parseFloat(fuelMix.premium) / 100 || 0;

    const regPrice = parseFloat(livePricing.regular.customerPrice);
    const dieselPrice = parseFloat(livePricing.diesel.customerPrice);
    const premiumPrice = parseFloat(livePricing.premium.customerPrice);
    const regCost = parseFloat(livePricing.regular.baseCost);
    const dieselCost = parseFloat(livePricing.diesel.baseCost);
    const premiumCost = parseFloat(livePricing.premium.baseCost);

    let totalSubscriptionRevenue = 0;
    let totalDeliveryFeeRevenue = 0;
    let totalMonthlyDeliveries = 0;
    let totalMonthlyLitres = 0;
    let totalCustomers = 0;

    const tierBreakdown: Record<string, any> = {};

    TIER_ORDER.forEach((tierId) => {
      const count = parseInt(tierCounts[tierId]) || 0;
      const deliveries = parseFloat(deliveriesPerMonth[tierId]) || 0;
      const avgLitres = parseFloat(avgLitresPerDelivery[tierId]) || 0;

      const monthlyDeliveries = count * deliveries;
      const monthlyLitres = monthlyDeliveries * avgLitres;

      const subscriptionRevenue = count * SUBSCRIPTION_MONTHLY_FEES[tierId];
      const deliveryFeeRevenue = monthlyDeliveries * DELIVERY_FEES_BY_TIER[tierId];

      totalSubscriptionRevenue += subscriptionRevenue;
      totalDeliveryFeeRevenue += deliveryFeeRevenue;
      totalMonthlyDeliveries += monthlyDeliveries;
      totalMonthlyLitres += monthlyLitres;
      totalCustomers += count;

      tierBreakdown[tierId] = {
        count,
        deliveries,
        avgLitres,
        monthlyDeliveries,
        monthlyLitres,
        subscriptionRevenue,
        deliveryFeeRevenue,
        totalTierRevenue: subscriptionRevenue + deliveryFeeRevenue,
      };
    });

    const regularLitres = totalMonthlyLitres * regMix;
    const dieselLitres = totalMonthlyLitres * dieselMix;
    const premiumLitres = totalMonthlyLitres * premiumMix;

    const fuelByType = {
      regular: {
        litres: regularLitres,
        revenue: regularLitres * regPrice,
        cogs: regularLitres * regCost,
        margin: regularLitres * (regPrice - regCost),
        pricePerLitre: regPrice,
        costPerLitre: regCost,
        marginPerLitre: regPrice - regCost,
      },
      diesel: {
        litres: dieselLitres,
        revenue: dieselLitres * dieselPrice,
        cogs: dieselLitres * dieselCost,
        margin: dieselLitres * (dieselPrice - dieselCost),
        pricePerLitre: dieselPrice,
        costPerLitre: dieselCost,
        marginPerLitre: dieselPrice - dieselCost,
      },
      premium: {
        litres: premiumLitres,
        revenue: premiumLitres * premiumPrice,
        cogs: premiumLitres * premiumCost,
        margin: premiumLitres * (premiumPrice - premiumCost),
        pricePerLitre: premiumPrice,
        costPerLitre: premiumCost,
        marginPerLitre: premiumPrice - premiumCost,
      },
    };

    const totalFuelRevenue = fuelByType.regular.revenue + fuelByType.diesel.revenue + fuelByType.premium.revenue;
    const totalFuelCOGS = fuelByType.regular.cogs + fuelByType.diesel.cogs + fuelByType.premium.cogs;
    const totalFuelMargin = totalFuelRevenue - totalFuelCOGS;

    const totalGrossRevenue = totalSubscriptionRevenue + totalDeliveryFeeRevenue + totalFuelRevenue;

    let monthlyOpCost = 0;
    const expenseBreakdown = expenses.map(exp => {
      const amount = parseFloat(exp.amount) || 0;
      let monthly = 0;
      switch (exp.frequency) {
        case 'daily':
          monthly = amount * workDays * 4.33;
          break;
        case 'weekly':
          monthly = amount * 4.33;
          break;
        case 'monthly':
          monthly = amount;
          break;
      }
      monthlyOpCost += monthly;
      return { ...exp, monthly };
    });

    const grossMargin = totalGrossRevenue - totalFuelCOGS;
    const operatingProfit = grossMargin - monthlyOpCost;

    const subscribingCustomers = TIER_ORDER.reduce((sum, tierId) => {
      const count = parseInt(tierCounts[tierId]) || 0;
      return sum + (SUBSCRIPTION_MONTHLY_FEES[tierId] > 0 ? count : 0);
    }, 0);
    const subscriptionStripeFees = subscribingCustomers > 0
      ? subscribingCustomers * (STRIPE_FEE_FLAT_CENTS / 100) + totalSubscriptionRevenue * STRIPE_FEE_RATE
      : 0;
    const deliveryChargeRevenue = totalDeliveryFeeRevenue + totalFuelRevenue;
    const deliveryStripeFees = totalMonthlyDeliveries > 0
      ? totalMonthlyDeliveries * (STRIPE_FEE_FLAT_CENTS / 100) + deliveryChargeRevenue * STRIPE_FEE_RATE
      : 0;
    const estimatedStripeFees = subscriptionStripeFees + deliveryStripeFees;

    const gstCollected = totalGrossRevenue * GST_RATE;

    const grossMarginPct = totalGrossRevenue > 0 ? (grossMargin / totalGrossRevenue) * 100 : 0;
    const revenuePerCustomer = totalCustomers > 0 ? totalGrossRevenue / totalCustomers : 0;
    const costPerDelivery = totalMonthlyDeliveries > 0 ? (totalFuelCOGS + monthlyOpCost) / totalMonthlyDeliveries : 0;
    const profitPerDelivery = totalMonthlyDeliveries > 0
      ? (grossMargin - monthlyOpCost - estimatedStripeFees + totalSubscriptionRevenue) / totalMonthlyDeliveries
      : 0;
    const fixedCosts = monthlyOpCost + estimatedStripeFees;
    const breakEvenDeliveries = profitPerDelivery > 0
      ? Math.ceil(fixedCosts / profitPerDelivery)
      : 0;

    const operatingMarginPct = totalGrossRevenue > 0 ? (operatingProfit / totalGrossRevenue) * 100 : 0;
    const avgFuelMarkupPerLitre = totalMonthlyLitres > 0 ? totalFuelMargin / totalMonthlyLitres : 0;
    const revenuePerDelivery = totalMonthlyDeliveries > 0 ? totalGrossRevenue / totalMonthlyDeliveries : 0;
    const avgOrderValue = totalMonthlyDeliveries > 0
      ? (totalFuelRevenue + totalDeliveryFeeRevenue) / totalMonthlyDeliveries
      : 0;
    const recurringRevenueRatio = totalGrossRevenue > 0
      ? (totalSubscriptionRevenue / totalGrossRevenue) * 100
      : 0;
    const costPerLitreDelivered = totalMonthlyLitres > 0
      ? (totalFuelCOGS + monthlyOpCost + estimatedStripeFees) / totalMonthlyLitres
      : 0;
    const stripeFeesPct = totalGrossRevenue > 0
      ? (estimatedStripeFees / totalGrossRevenue) * 100
      : 0;
    const opexPctRevenue = totalGrossRevenue > 0
      ? (monthlyOpCost / totalGrossRevenue) * 100
      : 0;
    const deliveriesPerWorkDay = workDays > 0
      ? totalMonthlyDeliveries / (workDays * 4.33)
      : 0;
    const litresPerWorkDay = workDays > 0
      ? totalMonthlyLitres / (workDays * 4.33)
      : 0;
    const breakEvenRevenue = profitPerDelivery > 0 && revenuePerDelivery > 0
      ? breakEvenDeliveries * revenuePerDelivery
      : 0;
    const cogsPctRevenue = totalGrossRevenue > 0
      ? (totalFuelCOGS / totalGrossRevenue) * 100
      : 0;

    // ═══════════════════════════════════════════════════════════════
    // WATERFALL CALCULATION ENGINE — CRA-CORRECT ORDER
    // Starting point: Total Gross Revenue (what customers pay)
    // CRA calculates GST on GROSS revenue — Stripe fees don't reduce it.
    // Step 1: Gross Revenue (CRA's revenue figure)
    // Step 2: Mandatory Obligations (GST, Stripe, COGS, OpEx, Tax, Deferred)
    // Step 3: Distributable Profit = Gross - All Mandatory Obligations
    // Step 4: Discretionary Reserves (4 buckets split distributable profit)
    // ═══════════════════════════════════════════════════════════════

    // ─── MANDATORY OBLIGATION 1: GST (CRA) ───
    // Calculated on GROSS revenue (customer-paid amount).
    // Stripe fees do NOT reduce your GST obligation — CRA sees gross.
    const fuelSaleGross = totalFuelRevenue;
    const deliveryFeeGross = totalDeliveryFeeRevenue;
    const subscriptionGross = totalSubscriptionRevenue;
    const fuelSaleGST = fuelSaleGross - (fuelSaleGross / 1.05);
    const deliveryFeeGST = deliveryFeeGross - (deliveryFeeGross / 1.05);
    const subscriptionGST = subscriptionGross - (subscriptionGross / 1.05);
    const totalGST = fuelSaleGST + deliveryFeeGST + subscriptionGST;

    // ─── MANDATORY OBLIGATION 2: Stripe Processing Fees ───
    // Cost of accepting payments — a deductible business expense.
    // Already calculated as estimatedStripeFees
    const stripePayout = totalGrossRevenue - estimatedStripeFees;

    // ─── MANDATORY OBLIGATION 3: Fuel COGS (UFA Petroleum) ───
    // Already calculated as totalFuelCOGS

    // ─── MANDATORY OBLIGATION 4: Operating Expenses ───
    // Already calculated as monthlyOpCost

    // ─── MANDATORY OBLIGATION 5: Income Tax Reserve (CRA) ───
    // Tax base = Gross Revenue minus GST, Stripe, COGS, OpEx (all deductible)
    const taxRatePct = parseFloat(incomeTaxRate) / 100 || 0;
    const netBusinessIncome = totalGrossRevenue - totalGST - estimatedStripeFees - totalFuelCOGS - monthlyOpCost;
    const incomeTaxAmount = netBusinessIncome > 0 ? netBusinessIncome * taxRatePct : 0;

    // ─── MANDATORY OBLIGATION 6: Deferred Subscription Revenue ───
    const totalGrossForRatio = totalGrossRevenue || 1;
    const subscriptionStripeFeeShare = estimatedStripeFees * (subscriptionGross / totalGrossForRatio);
    const subscriptionNetAfterGSTStripe = (subscriptionGross / 1.05) - subscriptionStripeFeeShare;
    const subscriptionDeferred = Math.max(0, subscriptionNetAfterGSTStripe * 0.40);

    // ─── TOTAL MANDATORY OBLIGATIONS (everything subtracted from gross) ───
    const totalMandatoryObligations = totalGST + estimatedStripeFees + totalFuelCOGS + monthlyOpCost + incomeTaxAmount + subscriptionDeferred;

    // ═══════════════════════════════════════════════════════════════
    // DISTRIBUTABLE PROFIT
    // Gross Revenue minus ALL mandatory obligations.
    // If negative, the business cannot cover its obligations at this scale.
    // ═══════════════════════════════════════════════════════════════
    const distributableProfit = totalGrossRevenue - totalMandatoryObligations;
    const hasMandatoryShortfall = distributableProfit < 0;
    const mandatoryShortfall = hasMandatoryShortfall ? Math.abs(distributableProfit) : 0;
    const profitForSplit = Math.max(0, distributableProfit);

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: DISCRETIONARY RESERVES
    // 4 buckets split 100% of distributable profit.
    // ═══════════════════════════════════════════════════════════════
    const discOwnerDrawPct = parseFloat(discretionarySplit.owner_draw_holding) / 100 || 0;
    const discGrowthPct = parseFloat(discretionarySplit.growth_capital) / 100 || 0;
    const discMaintenancePct = parseFloat(discretionarySplit.maintenance_reserve) / 100 || 0;
    const discEmergencyPct = parseFloat(discretionarySplit.emergency_risk) / 100 || 0;

    const ownerDrawAmount = profitForSplit * discOwnerDrawPct;
    const growthAmount = profitForSplit * discGrowthPct;
    const maintenanceAmount = profitForSplit * discMaintenancePct;
    const emergencyAmount = profitForSplit * discEmergencyPct;
    const totalDiscretionary = ownerDrawAmount + growthAmount + maintenanceAmount + emergencyAmount;

    // Build bucket structure for display
    const buckets: Record<string, BucketAllocation> = {};
    BUCKET_ORDER.forEach(bt => {
      buckets[bt] = {
        accountType: bt,
        name: BUCKET_DISPLAY[bt]?.name || bt,
        fromFuelSales: 0,
        fromDeliveryFees: 0,
        fromSubscriptions: 0,
        total: 0,
        description: BUCKET_DISPLAY[bt]?.description || '',
      };
    });

    buckets.operating_chequing.total = stripePayout;
    buckets.gst_holding.fromFuelSales = fuelSaleGST;
    buckets.gst_holding.fromDeliveryFees = deliveryFeeGST;
    buckets.gst_holding.fromSubscriptions = subscriptionGST;
    buckets.gst_holding.total = totalGST;
    buckets.fuel_cogs_payable.fromFuelSales = totalFuelCOGS;
    buckets.fuel_cogs_payable.total = totalFuelCOGS;
    buckets.income_tax_reserve.total = incomeTaxAmount;
    buckets.deferred_subscription.fromSubscriptions = subscriptionDeferred;
    buckets.deferred_subscription.total = subscriptionDeferred;
    buckets.owner_draw_holding.total = ownerDrawAmount;
    buckets.growth_capital.total = growthAmount;
    buckets.maintenance_reserve.total = maintenanceAmount;
    buckets.emergency_risk.total = emergencyAmount;

    const waterfallSteps = {
      grossRevenue: totalGrossRevenue,
      stripeFees: estimatedStripeFees,
      stripePayout,
      gst: { fuel: fuelSaleGST, delivery: deliveryFeeGST, subscription: subscriptionGST, total: totalGST },
      fuelCOGS: totalFuelCOGS,
      incomeTaxAmount,
      netBusinessIncome,
      subscriptionDeferred,
      subscriptionNetAfterGSTStripe,
      totalMandatoryObligations,
      distributableProfit,
      hasMandatoryShortfall,
      mandatoryShortfall,
      profitForSplit,
      discretionary: {
        ownerDraw: { pct: discOwnerDrawPct, amount: ownerDrawAmount },
        growth: { pct: discGrowthPct, amount: growthAmount },
        maintenance: { pct: discMaintenancePct, amount: maintenanceAmount },
        emergency: { pct: discEmergencyPct, amount: emergencyAmount },
        total: totalDiscretionary,
      },
      buckets,
    };

    return {
      tierBreakdown,
      totalCustomers,
      totalMonthlyDeliveries,
      totalMonthlyLitres,
      totalSubscriptionRevenue,
      totalDeliveryFeeRevenue,
      fuelByType,
      totalFuelRevenue,
      totalFuelCOGS,
      totalFuelMargin,
      totalGrossRevenue,
      grossMargin,
      monthlyOpCost,
      expenseBreakdown,
      operatingProfit,
      estimatedStripeFees,
      subscriptionStripeFees,
      deliveryStripeFees,
      gstCollected,
      waterfallSteps,
      metrics: {
        grossMarginPct,
        operatingMarginPct,
        avgFuelMarkupPerLitre,
        revenuePerCustomer,
        revenuePerDelivery,
        avgOrderValue,
        recurringRevenueRatio,
        costPerDelivery,
        costPerLitreDelivered,
        stripeFeesPct,
        opexPctRevenue,
        cogsPctRevenue,
        deliveriesPerWorkDay,
        litresPerWorkDay,
        breakEvenDeliveries,
        breakEvenRevenue,
      },
    };
  }, [tierCounts, deliveriesPerMonth, avgLitresPerDelivery, fuelMix, expenses, livePricing, workDaysPerWeek, incomeTaxRate, discretionarySplit]);

  const content = (
    <main className={embedded ? "space-y-6 pb-24" : "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24 space-y-6"}>
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/owner/finance">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-sage" />
              <span className="font-display font-bold text-foreground">Profitability Projections</span>
            </div>
          </div>
          <div className="flex items-center rounded-lg border bg-muted/50 p-0.5" data-testid="toggle-week-preset">
            <button
              onClick={() => applyPreset('3day')}
              className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold transition-all ${activePreset === '3day' ? 'bg-white shadow-sm text-sage border border-sage/30' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="button-3day-preset"
            >
              3 Day Week
            </button>
            <button
              onClick={() => applyPreset('6day')}
              className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold transition-all ${activePreset === '6day' ? 'bg-white shadow-sm text-sage border border-sage/30' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="button-6day-preset"
            >
              6 Day Week
            </button>
          </div>
        </div>
      )}

      {embedded && (
        <div className="flex items-center justify-end mb-2">
          <div className="flex items-center rounded-lg border bg-muted/50 p-0.5" data-testid="toggle-week-preset-embedded">
            <button
              onClick={() => applyPreset('3day')}
              className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold transition-all ${activePreset === '3day' ? 'bg-white shadow-sm text-sage border border-sage/30' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="button-3day-preset-embedded"
            >
              3 Day Week
            </button>
            <button
              onClick={() => applyPreset('6day')}
              className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold transition-all ${activePreset === '6day' ? 'bg-white shadow-sm text-sage border border-sage/30' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="button-6day-preset-embedded"
            >
              6 Day Week
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card className="border-2 border-sage/30 bg-gradient-to-br from-sage/5 to-sage/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-sage" />
              <span className="text-sm text-muted-foreground">Weekly Owner Draw</span>
            </div>
            <p className={`font-display text-2xl sm:text-3xl font-bold ${(projections.waterfallSteps.discretionary.ownerDraw.amount) > 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-weekly-net-profit">
              {formatCurrency(projections.waterfallSteps.discretionary.ownerDraw.amount / 4.33)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">After all mandatory obligations</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-copper/30 bg-gradient-to-br from-copper/5 to-copper/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-copper" />
              <span className="text-sm text-muted-foreground">Monthly Owner Draw</span>
            </div>
            <p className={`font-display text-2xl sm:text-3xl font-bold ${(projections.waterfallSteps.discretionary.ownerDraw.amount) > 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-monthly-net-profit">
              {formatCurrency(projections.waterfallSteps.discretionary.ownerDraw.amount)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{projections.totalGrossRevenue > 0 ? (projections.waterfallSteps.discretionary.ownerDraw.amount / projections.totalGrossRevenue * 100).toFixed(1) : '0.0'}% of gross revenue</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-gold/30 bg-gradient-to-br from-gold/5 to-gold/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-gold" />
              <span className="text-sm text-muted-foreground">Yearly Projection</span>
            </div>
            <p className={`font-display text-2xl sm:text-3xl font-bold ${(projections.waterfallSteps.discretionary.ownerDraw.amount) > 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-yearly-net-profit">
              {formatCurrency(projections.waterfallSteps.discretionary.ownerDraw.amount * 12)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Annual owner income</p>
          </CardContent>
        </Card>
      </div>

      <Collapsible open={sectionsOpen.tiers} onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, tiers: open }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Users className="w-5 h-5 text-copper" />
                    Customer Base by Tier
                  </CardTitle>
                  <CardDescription>{projections.totalCustomers} customers · {projections.totalMonthlyDeliveries.toFixed(0)} deliveries/month</CardDescription>
                </div>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${sectionsOpen.tiers ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                  <div className="col-span-3">Tier</div>
                  <div className="col-span-2">Customers</div>
                  <div className="col-span-2">Del./Mo</div>
                  <div className="col-span-2">Avg L/Del.</div>
                  <div className="col-span-3 text-right">Monthly Revenue</div>
                </div>
                {TIER_ORDER.map((tierId) => {
                  const tier = projections.tierBreakdown[tierId];
                  return (
                    <div key={tierId} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${TIER_COLORS[tierId]}`} />
                        <span className="text-sm font-medium truncate">{SUBSCRIPTION_DISPLAY_NAMES[tierId]}</span>
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="0"
                          value={tierCounts[tierId]}
                          onChange={(e) => setTierCounts(prev => ({ ...prev, [tierId]: e.target.value }))}
                          className="h-8 text-sm"
                          data-testid={`input-tier-count-${tierId}`}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={deliveriesPerMonth[tierId]}
                          onChange={(e) => setDeliveriesPerMonth(prev => ({ ...prev, [tierId]: e.target.value }))}
                          className="h-8 text-sm"
                          data-testid={`input-tier-deliveries-${tierId}`}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="0"
                          value={avgLitresPerDelivery[tierId]}
                          onChange={(e) => setAvgLitresPerDelivery(prev => ({ ...prev, [tierId]: e.target.value }))}
                          className="h-8 text-sm"
                          data-testid={`input-tier-litres-${tierId}`}
                        />
                      </div>
                      <div className="col-span-3 text-right">
                        <div className="text-sm font-medium">{formatCurrency(tier.totalTierRevenue)}</div>
                        <div className="text-xs text-muted-foreground">
                          Sub: {formatCurrency(tier.subscriptionRevenue)} · Del: {formatCurrency(tier.deliveryFeeRevenue)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="grid grid-cols-12 gap-2 pt-3 border-t">
                  <div className="col-span-3 font-medium text-sm">Totals</div>
                  <div className="col-span-2 text-sm font-medium">{projections.totalCustomers}</div>
                  <div className="col-span-2 text-sm font-medium">{projections.totalMonthlyDeliveries.toFixed(0)}</div>
                  <div className="col-span-2 text-sm font-medium">{projections.totalMonthlyLitres.toFixed(0)}L</div>
                  <div className="col-span-3 text-right text-sm font-medium text-sage">
                    {formatCurrency(projections.totalSubscriptionRevenue + projections.totalDeliveryFeeRevenue)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1">
                  <div className="grid grid-cols-5 gap-2 font-medium">
                    {TIER_ORDER.map(t => (
                      <div key={t} className="text-center">
                        <div>{SUBSCRIPTION_DISPLAY_NAMES[t].split(' ')[0]}</div>
                        <div className="text-foreground">Sub: {formatCurrency(SUBSCRIPTION_MONTHLY_FEES[t])}</div>
                        <div className="text-foreground">Del: {formatCurrency(DELIVERY_FEES_BY_TIER[t])}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={sectionsOpen.fuel} onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, fuel: open }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Fuel className="w-5 h-5 text-copper" />
                    Fuel Economics
                  </CardTitle>
                  <CardDescription>
                    {projections.totalMonthlyLitres.toFixed(0)}L/month · Margin: {formatCurrency(projections.totalFuelMargin)}
                  </CardDescription>
                </div>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${sectionsOpen.fuel ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Fuel Mix (%)</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Regular 87</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={fuelMix.regular}
                      onChange={(e) => setFuelMix(prev => ({ ...prev, regular: e.target.value }))}
                      className="mt-1"
                      data-testid="input-fuel-mix-regular"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Diesel</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={fuelMix.diesel}
                      onChange={(e) => setFuelMix(prev => ({ ...prev, diesel: e.target.value }))}
                      className="mt-1"
                      data-testid="input-fuel-mix-diesel"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Premium 91</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={fuelMix.premium}
                      onChange={(e) => setFuelMix(prev => ({ ...prev, premium: e.target.value }))}
                      className="mt-1"
                      data-testid="input-fuel-mix-premium"
                    />
                  </div>
                </div>
                {(() => {
                  const total = (parseFloat(fuelMix.regular) || 0) + (parseFloat(fuelMix.diesel) || 0) + (parseFloat(fuelMix.premium) || 0);
                  if (Math.abs(total - 100) > 0.1) {
                    return (
                      <p className="text-xs text-red-500 mt-2" data-testid="text-fuel-mix-warning">
                        Fuel mix totals {total.toFixed(0)}% — should equal 100%
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Per-Litre Breakdown (Live Pricing)</h4>
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                  <div className="col-span-2">Type</div>
                  <div className="col-span-1 text-right">Mix</div>
                  <div className="col-span-2 text-right">Price/L</div>
                  <div className="col-span-2 text-right">Cost/L</div>
                  <div className="col-span-1 text-right">Margin/L</div>
                  <div className="col-span-2 text-right">Revenue</div>
                  <div className="col-span-2 text-right">COGS</div>
                </div>
                {(['regular', 'diesel', 'premium'] as const).map((type) => {
                  const f = projections.fuelByType[type];
                  const mixPct = fuelMix[type];
                  return (
                    <div key={type} className="grid grid-cols-12 gap-2 text-sm items-center">
                      <div className="col-span-2 capitalize font-medium">{type === 'regular' ? 'Regular 87' : type === 'premium' ? 'Premium 91' : 'Diesel'}</div>
                      <div className="col-span-1 text-right">{mixPct}%</div>
                      <div className="col-span-2 text-right">${f.pricePerLitre.toFixed(4)}</div>
                      <div className="col-span-2 text-right">${f.costPerLitre.toFixed(4)}</div>
                      <div className="col-span-1 text-right text-sage">${f.marginPerLitre.toFixed(4)}</div>
                      <div className="col-span-2 text-right">{formatCurrency(f.revenue)}</div>
                      <div className="col-span-2 text-right text-amber-600">{formatCurrency(f.cogs)}</div>
                    </div>
                  );
                })}
                <div className="grid grid-cols-12 gap-2 text-sm font-medium pt-2 border-t">
                  <div className="col-span-2">Totals</div>
                  <div className="col-span-1"></div>
                  <div className="col-span-2"></div>
                  <div className="col-span-2"></div>
                  <div className="col-span-1"></div>
                  <div className="col-span-2 text-right">{formatCurrency(projections.totalFuelRevenue)}</div>
                  <div className="col-span-2 text-right text-amber-600">{formatCurrency(projections.totalFuelCOGS)}</div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-sage/10 flex items-center justify-between">
                <span className="text-sm font-medium">Total Fuel Margin</span>
                <span className="font-display text-lg font-bold text-sage">{formatCurrency(projections.totalFuelMargin)}</span>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={sectionsOpen.expenses} onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, expenses: open }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Truck className="w-5 h-5 text-copper" />
                    Operating Expenses
                  </CardTitle>
                  <CardDescription>Monthly total: {formatCurrency(projections.monthlyOpCost)}</CardDescription>
                </div>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${sectionsOpen.expenses ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Work Days/Week</Label>
                  <Input
                    type="number"
                    min="1"
                    max="7"
                    value={workDaysPerWeek}
                    onChange={(e) => setWorkDaysPerWeek(e.target.value)}
                    className="mt-1"
                    data-testid="input-work-days"
                  />
                </div>
                <div className="pt-5">
                  <Button onClick={addExpense} variant="outline" size="sm" className="gap-1" data-testid="button-add-expense">
                    <Plus className="w-4 h-4" />
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                  <div className="col-span-4">Expense</div>
                  <div className="col-span-3">Amount ($)</div>
                  <div className="col-span-3">Frequency</div>
                  <div className="col-span-1 text-right">Monthly</div>
                  <div className="col-span-1"></div>
                </div>

                {projections.expenseBreakdown.map((expense) => (
                  <div key={expense.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Input
                        value={expense.name}
                        onChange={(e) => updateExpense(expense.id, 'name', e.target.value)}
                        placeholder="Expense name"
                        className="h-8 text-sm"
                        data-testid={`input-expense-name-${expense.id}`}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        value={expense.amount}
                        onChange={(e) => updateExpense(expense.id, 'amount', e.target.value)}
                        className="h-8 text-sm"
                        data-testid={`input-expense-amount-${expense.id}`}
                      />
                    </div>
                    <div className="col-span-3">
                      <Select
                        value={expense.frequency}
                        onValueChange={(v) => updateExpense(expense.id, 'frequency', v)}
                      >
                        <SelectTrigger className="h-8 text-sm" data-testid={`select-expense-freq-${expense.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 text-right text-sm">{formatCurrency(expense.monthly)}</div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExpense(expense.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        data-testid={`button-remove-expense-${expense.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-12 gap-2 pt-2 border-t font-medium text-sm">
                  <div className="col-span-4">Total Operating Expenses</div>
                  <div className="col-span-3"></div>
                  <div className="col-span-3"></div>
                  <div className="col-span-1 text-right text-amber-600">{formatCurrency(projections.monthlyOpCost)}</div>
                  <div className="col-span-1"></div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={sectionsOpen.waterfall} onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, waterfall: open }))}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-copper" />
                    Waterfall Configuration
                  </CardTitle>
                  <CardDescription>Income tax rate and discretionary profit split</CardDescription>
                </div>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${sectionsOpen.waterfall ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Income Tax Reserve Rate (%)</Label>
                <div className="max-w-[200px]">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={incomeTaxRate}
                    onChange={(e) => setIncomeTaxRate(e.target.value)}
                    className="h-8 text-sm"
                    data-testid="input-income-tax-rate"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Applied to net business income (gross minus GST, Stripe, COGS, and OpEx)</p>
              </div>
              <Separator />
              <div>
                <Label className="text-sm font-medium mb-2 block">Discretionary Profit Split (%)</Label>
                <p className="text-xs text-muted-foreground mb-3">After all mandatory obligations are met, the remaining distributable profit is split across these 4 buckets. Must total 100%.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Owner Draw</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={discretionarySplit.owner_draw_holding}
                      onChange={(e) => setDiscretionarySplit(prev => ({ ...prev, owner_draw_holding: e.target.value }))}
                      className="mt-1 h-8 text-sm"
                      data-testid="input-disc-owner-draw"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Growth/Capital</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={discretionarySplit.growth_capital}
                      onChange={(e) => setDiscretionarySplit(prev => ({ ...prev, growth_capital: e.target.value }))}
                      className="mt-1 h-8 text-sm"
                      data-testid="input-disc-growth"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Maintenance</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={discretionarySplit.maintenance_reserve}
                      onChange={(e) => setDiscretionarySplit(prev => ({ ...prev, maintenance_reserve: e.target.value }))}
                      className="mt-1 h-8 text-sm"
                      data-testid="input-disc-maintenance"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Emergency/Risk</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={discretionarySplit.emergency_risk}
                      onChange={(e) => setDiscretionarySplit(prev => ({ ...prev, emergency_risk: e.target.value }))}
                      className="mt-1 h-8 text-sm"
                      data-testid="input-disc-emergency"
                    />
                  </div>
                </div>
                {(() => {
                  const total = (parseFloat(discretionarySplit.owner_draw_holding) || 0) + (parseFloat(discretionarySplit.growth_capital) || 0) + (parseFloat(discretionarySplit.maintenance_reserve) || 0) + (parseFloat(discretionarySplit.emergency_risk) || 0);
                  if (Math.abs(total - 100) > 0.1) {
                    return (
                      <p className="text-xs text-red-500 mt-2" data-testid="text-disc-split-warning">
                        Discretionary split totals {total.toFixed(0)}% — must equal 100%
                      </p>
                    );
                  }
                  return <p className="text-xs text-sage mt-2">Split totals 100%</p>;
                })()}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card className="border-2 border-copper/20">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Wallet className="w-5 h-5 text-copper" />
            Monthly Profit & Loss Statement
          </CardTitle>
          <CardDescription>Pro forma income statement with waterfall allocation · Bank presentation ready</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">

          {/* ═══ SECTION 1: REVENUE RECOGNITION ═══ */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-2 pb-1">1. Revenue Recognition</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground">Subscription Revenue</span>
            <span className="text-sm font-medium" data-testid="text-pl-subscription">{formatCurrency(projections.totalSubscriptionRevenue)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground">Delivery Fee Revenue</span>
            <span className="text-sm font-medium" data-testid="text-pl-delivery-fees">{formatCurrency(projections.totalDeliveryFeeRevenue)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Regular 87 ({fuelMix.regular}% · {projections.fuelByType.regular.litres.toFixed(0)}L)</span>
            <span className="text-sm font-medium">{formatCurrency(projections.fuelByType.regular.revenue)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Diesel ({fuelMix.diesel}% · {projections.fuelByType.diesel.litres.toFixed(0)}L)</span>
            <span className="text-sm font-medium">{formatCurrency(projections.fuelByType.diesel.revenue)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Premium 91 ({fuelMix.premium}% · {projections.fuelByType.premium.litres.toFixed(0)}L)</span>
            <span className="text-sm font-medium">{formatCurrency(projections.fuelByType.premium.revenue)}</span>
          </div>
          <div className="flex justify-between py-2 px-2 border-t font-medium">
            <span className="text-sm">Total Gross Revenue (Customer-Paid)</span>
            <span className="text-sm" data-testid="text-pl-gross-revenue">{formatCurrency(projections.totalGrossRevenue)}</span>
          </div>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* MANDATORY OBLIGATIONS — Must be paid before any discretionary  */}
          {/* CRA sees GROSS revenue. Stripe fees don't reduce your GST.     */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div className="text-xs uppercase tracking-wider text-red-700 font-bold pt-6 pb-1 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-600" />
            MANDATORY OBLIGATIONS
          </div>
          <p className="text-xs text-muted-foreground px-2 mb-1">Subtracted from gross revenue. CRA calculates GST on what the customer pays — Stripe fees are a separate business expense.</p>

          {/* ─── 2A: GST ─── */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-3 pb-1">2A. GST (5% — CRA Liability, Quarterly Remittance)</div>
          <p className="text-xs text-muted-foreground px-2 mb-1">GST is calculated on <strong>gross revenue</strong> (customer-paid amount) using GST-inclusive method (gross / 1.05). Stripe fees do not reduce your GST obligation.</p>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">GST on Fuel Sales ({formatCurrency(projections.totalFuelRevenue)} gross)</span>
            <span className="text-sm font-medium text-red-600">-{formatCurrency(projections.waterfallSteps.gst.fuel)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">GST on Delivery Fees ({formatCurrency(projections.totalDeliveryFeeRevenue)} gross)</span>
            <span className="text-sm font-medium text-red-600">-{formatCurrency(projections.waterfallSteps.gst.delivery)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">GST on Subscriptions ({formatCurrency(projections.totalSubscriptionRevenue)} gross)</span>
            <span className="text-sm font-medium text-red-600">-{formatCurrency(projections.waterfallSteps.gst.subscription)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-red-500/10 rounded-lg font-medium mt-1">
            <div>
              <span className="text-sm">Total GST → GST Holding Account</span>
              <p className="text-[10px] text-red-600/70">Based on {formatCurrency(projections.totalGrossRevenue)} gross revenue</p>
            </div>
            <span className="text-sm text-red-600" data-testid="text-pl-gst-holding">-{formatCurrency(projections.waterfallSteps.gst.total)}</span>
          </div>

          {/* ─── 2B: STRIPE PROCESSING FEES ─── */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">2B. Stripe Processing Fees (Cost of Accepting Payments)</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Subscription billing ({TIER_ORDER.reduce((s, t) => s + (SUBSCRIPTION_MONTHLY_FEES[t] > 0 ? (parseInt(tierCounts[t]) || 0) : 0), 0)} charges x 2.9% + $0.30)</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.subscriptionStripeFees)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Delivery billing ({projections.totalMonthlyDeliveries.toFixed(0)} charges x 2.9% + $0.30)</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.deliveryStripeFees)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-amber-500/10 rounded-lg font-medium mt-1">
            <div>
              <span className="text-sm">Total Stripe Fees (deductible expense)</span>
              <p className="text-[10px] text-amber-600/70">Actual bank deposit: {formatCurrency(projections.waterfallSteps.stripePayout)}/mo</p>
            </div>
            <span className="text-sm text-amber-600">-{formatCurrency(projections.estimatedStripeFees)}</span>
          </div>

          {/* ─── 2C: FUEL COGS ─── */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">2C. Cost of Goods Sold (Wholesale Fuel — UFA Petroleum)</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Regular 87 ({projections.fuelByType.regular.litres.toFixed(0)}L x ${projections.fuelByType.regular.costPerLitre.toFixed(4)})</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.fuelByType.regular.cogs)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Diesel ({projections.fuelByType.diesel.litres.toFixed(0)}L x ${projections.fuelByType.diesel.costPerLitre.toFixed(4)})</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.fuelByType.diesel.cogs)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Premium 91 ({projections.fuelByType.premium.litres.toFixed(0)}L x ${projections.fuelByType.premium.costPerLitre.toFixed(4)})</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.fuelByType.premium.cogs)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-amber-500/10 rounded-lg font-medium mt-1">
            <span className="text-sm">Total COGS → Fuel COGS Payable (UFA)</span>
            <span className="text-sm text-amber-600" data-testid="text-pl-total-cogs">-{formatCurrency(projections.totalFuelCOGS)}</span>
          </div>

          {/* ─── 2D: OPERATING EXPENSES ─── */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">2D. Operating Expenses</div>
          {projections.expenseBreakdown.map((exp) => (
            <div key={exp.id} className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
              <span className="text-sm text-muted-foreground pl-4">{exp.name || 'Unnamed Expense'}</span>
              <span className="text-sm font-medium text-amber-600">-{formatCurrency(exp.monthly)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2.5 px-3 bg-amber-500/10 rounded-lg font-medium mt-1">
            <span className="text-sm">Total Operating Expenses</span>
            <span className="text-sm text-amber-600" data-testid="text-pl-total-opex">-{formatCurrency(projections.monthlyOpCost)}</span>
          </div>

          {/* ─── 2E: INCOME TAX RESERVE ─── */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">2E. Income Tax Reserve ({incomeTaxRate}% — CRA Obligation)</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Net Business Income (Gross - GST - Stripe - COGS - OpEx)</span>
            <span className="text-sm font-medium">{formatCurrency(projections.waterfallSteps.netBusinessIncome)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">{incomeTaxRate}% Tax Reserve</span>
            <span className="text-sm font-medium text-orange-600">-{formatCurrency(projections.waterfallSteps.incomeTaxAmount)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-orange-500/10 rounded-lg font-medium mt-1">
            <span className="text-sm">Income Tax → Tax Reserve Account</span>
            <span className="text-sm text-orange-600" data-testid="text-pl-income-tax">-{formatCurrency(projections.waterfallSteps.incomeTaxAmount)}</span>
          </div>

          {/* ─── 2F: DEFERRED SUBSCRIPTION ─── */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">2F. Deferred Subscription Revenue (40% — Service Obligation)</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Subscription Net (after GST & Stripe)</span>
            <span className="text-sm font-medium">{formatCurrency(projections.waterfallSteps.subscriptionNetAfterGSTStripe)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">40% Deferred (unearned revenue)</span>
            <span className="text-sm font-medium text-purple-600">-{formatCurrency(projections.waterfallSteps.subscriptionDeferred)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-purple-500/10 rounded-lg font-medium mt-1">
            <span className="text-sm">Deferred → Deferred Subscription Account</span>
            <span className="text-sm text-purple-600" data-testid="text-pl-deferred">-{formatCurrency(projections.waterfallSteps.subscriptionDeferred)}</span>
          </div>

          {/* ─── TOTAL MANDATORY OBLIGATIONS ─── */}
          <div className="flex justify-between py-2.5 px-3 bg-red-500/10 rounded-lg font-medium mt-4 border border-red-300">
            <div>
              <span className="text-sm text-red-700">Total Mandatory Obligations</span>
              <p className="text-[10px] text-red-600/70">GST + Stripe + COGS + OpEx + Tax + Deferred Subs</p>
            </div>
            <span className="text-sm font-bold text-red-700" data-testid="text-pl-total-mandatory">-{formatCurrency(projections.waterfallSteps.totalMandatoryObligations)}</span>
          </div>

          {/* ═══ DISTRIBUTABLE PROFIT ═══ */}
          <div className={`flex justify-between py-3 px-4 rounded-xl mt-3 border-2 ${projections.waterfallSteps.hasMandatoryShortfall ? 'bg-red-500/15 border-red-400' : 'bg-sage/15 border-sage/30'}`}>
            <div>
              <span className={`font-medium ${projections.waterfallSteps.hasMandatoryShortfall ? 'text-red-700' : ''}`}>
                Distributable Profit
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">Gross Revenue minus all mandatory obligations</p>
            </div>
            <span className={`font-display text-xl font-bold ${projections.waterfallSteps.distributableProfit >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-pl-distributable-profit">
              {formatCurrency(projections.waterfallSteps.distributableProfit)}
            </span>
          </div>

          {projections.waterfallSteps.hasMandatoryShortfall && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-300 mt-2">
              <p className="text-xs text-red-700 font-medium">
                Mandatory obligations exceed Stripe payout by {formatCurrency(projections.waterfallSteps.mandatoryShortfall)}/mo.
                The business cannot cover its basic costs at this customer count. Grow revenue or reduce operating expenses.
              </p>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* DISCRETIONARY RESERVES — Owner's choice on how to split profit */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div className="text-xs uppercase tracking-wider text-sage font-bold pt-6 pb-1 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sage" />
            DISCRETIONARY RESERVES
          </div>
          <p className="text-xs text-muted-foreground px-2 mb-2">Your choices on how to allocate the distributable profit. These 4 buckets split 100% of {formatCurrency(projections.waterfallSteps.profitForSplit)}.</p>

          <div className="border rounded-lg overflow-hidden">
            <div className="grid gap-1 px-3 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground border-b" style={{ gridTemplateColumns: '2.5fr 0.8fr 0.8fr 1fr 1fr' }}>
              <div>Reserve Bucket</div>
              <div className="text-right">Split %</div>
              <div className="text-right">Weekly</div>
              <div className="text-right">Monthly</div>
              <div className="text-right">Annual</div>
            </div>

            {([
              { key: 'maintenance_reserve', display: BUCKET_DISPLAY.maintenance_reserve, data: projections.waterfallSteps.discretionary.maintenance },
              { key: 'emergency_risk', display: BUCKET_DISPLAY.emergency_risk, data: projections.waterfallSteps.discretionary.emergency },
              { key: 'growth_capital', display: BUCKET_DISPLAY.growth_capital, data: projections.waterfallSteps.discretionary.growth },
              { key: 'owner_draw_holding', display: BUCKET_DISPLAY.owner_draw_holding, data: projections.waterfallSteps.discretionary.ownerDraw },
            ] as const).map(({ key, display, data }) => {
              const isOwnerDraw = key === 'owner_draw_holding';
              const weeklyAmount = data.amount * 12 / 52;
              return (
                <div
                  key={key}
                  className={`grid gap-1 px-3 py-2 text-xs items-center border-b border-border/30 ${isOwnerDraw ? 'bg-sage/10' : 'hover:bg-muted/30'}`}
                  style={{ gridTemplateColumns: '2.5fr 0.8fr 0.8fr 1fr 1fr' }}
                  data-testid={`bucket-row-${key}`}
                >
                  <div>
                    <div className={`font-medium ${display?.color || ''} ${isOwnerDraw ? 'text-sm' : ''}`}>{display?.name || key}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">{display?.description || ''}</div>
                  </div>
                  <div className={`text-right font-medium ${display?.color || ''}`}>{(data.pct * 100).toFixed(0)}%</div>
                  <div className={`text-right font-medium ${isOwnerDraw ? 'text-sage' : display?.color || ''}`}>{formatCurrency(weeklyAmount)}</div>
                  <div className={`text-right font-bold ${isOwnerDraw ? 'text-sage text-sm' : display?.color || ''}`}>{formatCurrency(data.amount)}</div>
                  <div className={`text-right font-semibold ${isOwnerDraw ? 'text-sage' : ''}`}>{formatCurrency(data.amount * 12)}</div>
                </div>
              );
            })}

            <div className="grid gap-1 px-3 py-2 text-xs font-bold border-t-2 border-sage/30 bg-sage/5" style={{ gridTemplateColumns: '2.5fr 0.8fr 0.8fr 1fr 1fr' }}>
              <div className="text-sage">Total Discretionary</div>
              <div className="text-right text-sage">100%</div>
              <div className="text-right text-sage">{formatCurrency(projections.waterfallSteps.discretionary.total * 12 / 52)}</div>
              <div className="text-right text-sage text-sm">{formatCurrency(projections.waterfallSteps.discretionary.total)}</div>
              <div className="text-right text-sage">{formatCurrency(projections.waterfallSteps.discretionary.total * 12)}</div>
            </div>
          </div>

          {/* ═══ RECONCILIATION ═══ */}
          <div className="text-xs text-muted-foreground px-2 mt-3 space-y-0.5">
            <p className="italic">
              Gross Revenue ({formatCurrency(projections.totalGrossRevenue)})
              → Mandatory Obligations (-{formatCurrency(projections.waterfallSteps.totalMandatoryObligations)})
              → Distributable Profit ({formatCurrency(projections.waterfallSteps.distributableProfit)})
              → 4 Discretionary Buckets ({formatCurrency(projections.waterfallSteps.discretionary.total)})
            </p>
            <p className="italic">Bank deposit: {formatCurrency(projections.waterfallSteps.stripePayout)}/mo (gross minus Stripe fees)</p>
          </div>

          {/* ═══ FINAL: OWNER DRAW (BOTTOM LINE) ═══ */}
          <div className="flex justify-between py-3 px-4 bg-sage/15 rounded-xl mt-4 border-2 border-sage/30">
            <div>
              <span className="font-medium">Owner Draw Holding ({(projections.waterfallSteps.discretionary.ownerDraw.pct * 100).toFixed(0)}% of distributable profit)</span>
              <p className="text-xs text-muted-foreground mt-0.5">Your take-home after all mandatory obligations are met</p>
            </div>
            <span className={`font-display text-xl font-bold ${projections.waterfallSteps.discretionary.ownerDraw.amount > 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-pl-net-profit">
              {formatCurrency(projections.waterfallSteps.discretionary.ownerDraw.amount)}
            </span>
          </div>

        </CardContent>
      </Card>

      <Card className="border-2 border-copper/20">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Target className="w-5 h-5 text-copper" />
            Key Business Metrics
          </CardTitle>
          <CardDescription>Comprehensive financial & operational KPIs for bank presentation and operations management</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-sage" />
              Profitability
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Gross Margin</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-gross-margin">{projections.metrics.grossMarginPct.toFixed(1)}%</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Revenue − COGS</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Operating Margin</div>
                <div className={`font-display text-xl font-bold ${projections.metrics.operatingMarginPct >= 0 ? '' : 'text-red-600'}`} data-testid="text-metric-operating-margin">
                  {projections.metrics.operatingMarginPct.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">After OpEx</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Owner Draw Margin</div>
                <div className={`font-display text-xl font-bold ${projections.waterfallSteps.discretionary.ownerDraw.amount > 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-metric-net-margin">
                  {projections.totalGrossRevenue > 0 ? ((projections.waterfallSteps.discretionary.ownerDraw.amount / projections.totalGrossRevenue) * 100).toFixed(1) : '0.0'}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">After all obligations</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Fuel Markup</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-fuel-markup">
                  ${projections.metrics.avgFuelMarkupPerLitre.toFixed(4)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Avg margin/litre</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-copper" />
              Revenue Analysis
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Revenue/Customer</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-rev-per-customer">
                  {formatCurrency(projections.metrics.revenuePerCustomer)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Monthly avg</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Revenue/Delivery</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-rev-per-delivery">
                  {formatCurrency(projections.metrics.revenuePerDelivery)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">All-in per stop</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Avg Order Value</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-avg-order">
                  {formatCurrency(projections.metrics.avgOrderValue)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Fuel + delivery fee</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Recurring Revenue</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-recurring-ratio">
                  {projections.metrics.recurringRevenueRatio.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Subscription share</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Cost & Efficiency
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">COGS % of Revenue</div>
                <div className="font-display text-xl font-bold text-amber-600" data-testid="text-metric-cogs-pct">
                  {projections.metrics.cogsPctRevenue.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Wholesale fuel cost</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Cost/Delivery</div>
                <div className="font-display text-xl font-bold text-amber-600" data-testid="text-metric-cost-per-delivery">
                  {formatCurrency(projections.metrics.costPerDelivery)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">COGS + OpEx per stop</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Total Cost/Litre</div>
                <div className="font-display text-xl font-bold text-amber-600" data-testid="text-metric-cost-per-litre">
                  ${projections.metrics.costPerLitreDelivered.toFixed(4)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">All costs ÷ litres</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Stripe Fees</div>
                <div className="font-display text-xl font-bold text-amber-600" data-testid="text-metric-stripe-pct">
                  {projections.metrics.stripeFeesPct.toFixed(2)}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{formatCurrency(projections.estimatedStripeFees)}/mo</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">OpEx % of Revenue</div>
                <div className="font-display text-xl font-bold text-amber-600" data-testid="text-metric-opex-pct">
                  {projections.metrics.opexPctRevenue.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{formatCurrency(projections.monthlyOpCost)}/mo</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              Operational Scale
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Total Deliveries</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-total-deliveries">
                  {projections.totalMonthlyDeliveries.toFixed(0)}/mo
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{projections.totalCustomers} customers</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Total Volume</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-total-litres">
                  {projections.totalMonthlyLitres.toFixed(0)}L/mo
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">All fuel types</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Deliveries/Work Day</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-del-per-day">
                  {projections.metrics.deliveriesPerWorkDay.toFixed(1)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{workDaysPerWeek} days/week</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Litres/Work Day</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-litres-per-day">
                  {projections.metrics.litresPerWorkDay.toFixed(0)}L
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Avg daily volume</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-sage" />
              Viability Indicators
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-sage/5 border border-sage/20 text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Break-Even Point</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-breakeven">
                  {projections.metrics.breakEvenDeliveries}/mo
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Deliveries needed</div>
              </div>
              <div className="p-3 rounded-xl bg-sage/5 border border-sage/20 text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Break-Even Revenue</div>
                <div className="font-display text-xl font-bold" data-testid="text-metric-breakeven-rev">
                  {formatCurrency(projections.metrics.breakEvenRevenue)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Monthly minimum</div>
              </div>
              <div className="p-3 rounded-xl bg-sage/5 border border-sage/20 text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Distributable Profit</div>
                <div className={`font-display text-xl font-bold ${projections.waterfallSteps.distributableProfit >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-metric-working-capital">
                  {formatCurrency(projections.waterfallSteps.distributableProfit)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">After mandatory obligations</div>
              </div>
              <div className="p-3 rounded-xl bg-sage/10 border-2 border-sage/30 text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Owner Draw %</div>
                <div className={`font-display text-xl font-bold ${projections.waterfallSteps.discretionary.ownerDraw.amount > 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-metric-owner-draw-pct">
                  {projections.totalGrossRevenue > 0 ? ((projections.waterfallSteps.discretionary.ownerDraw.amount / projections.totalGrossRevenue) * 100).toFixed(1) : '0.0'}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{formatCurrency(projections.waterfallSteps.discretionary.ownerDraw.amount)}/mo</div>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-copper" />
            Annual Projection Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-sage/10 to-sage/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual Revenue</div>
              <div className="font-display text-lg font-bold" data-testid="text-annual-revenue">{formatCurrency(projections.totalGrossRevenue * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-red-500/10 to-red-500/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual GST</div>
              <div className="font-display text-lg font-bold text-red-600" data-testid="text-annual-gst">{formatCurrency(projections.waterfallSteps.gst.total * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual Stripe Fees</div>
              <div className="font-display text-lg font-bold text-amber-600" data-testid="text-annual-stripe">{formatCurrency(projections.estimatedStripeFees * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual COGS</div>
              <div className="font-display text-lg font-bold text-amber-600">{formatCurrency(projections.totalFuelCOGS * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-copper/10 to-copper/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual OpEx</div>
              <div className="font-display text-lg font-bold text-amber-600">{formatCurrency(projections.monthlyOpCost * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual Tax Reserve</div>
              <div className="font-display text-lg font-bold text-orange-600" data-testid="text-annual-tax">{formatCurrency(projections.waterfallSteps.incomeTaxAmount * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-sage/15 to-sage/5 border-2 border-sage/30 text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual Owner Draw</div>
              <div className={`font-display text-lg font-bold ${projections.waterfallSteps.discretionary.ownerDraw.amount > 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-annual-net-profit">
                {formatCurrency(projections.waterfallSteps.discretionary.ownerDraw.amount * 12)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
