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
  household: 'bg-sky-400',
  rural: 'bg-green-700',
  vip: 'bg-amber-500',
};

const TIER_ORDER: SubscriptionTierId[] = ['payg', 'access', 'household', 'rural', 'vip'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

interface AllocationRule {
  id: string;
  revenueType: string;
  accountType: string;
  percentage: string;
  isActive: boolean;
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
  'deferred_subscription',
  'income_tax_reserve',
  'maintenance_reserve',
  'emergency_risk',
  'growth_capital',
  'owner_draw_holding',
];

export default function ProfitabilityCalculator({ embedded = false }: ProfitabilityCalculatorProps) {
  const { data: pricingData } = useQuery<{ pricing: any[] }>({
    queryKey: ['/api/fuel-pricing'],
  });

  const { data: rulesData } = useQuery<{ rules: AllocationRule[] }>({
    queryKey: ['/api/ops/waterfall/rules'],
  });

  const [tierCounts, setTierCounts] = useState<Record<SubscriptionTierId, string>>({
    payg: '1',
    access: '3',
    household: '5',
    rural: '1',
    vip: '0',
  });

  const [deliveriesPerMonth, setDeliveriesPerMonth] = useState<Record<SubscriptionTierId, string>>({
    payg: '1',
    access: '2',
    household: '4',
    rural: '4',
    vip: '4',
  });

  const [avgLitresPerDelivery, setAvgLitresPerDelivery] = useState<Record<SubscriptionTierId, string>>({
    payg: '45',
    access: '50',
    household: '65',
    rural: '120',
    vip: '100',
  });

  const [fuelMix, setFuelMix] = useState({
    regular: '60',
    diesel: '40',
    premium: '0',
  });

  const [taxReserveRate, setTaxReserveRate] = useState('25');
  const [workDaysPerWeek, setWorkDaysPerWeek] = useState('3');

  const [expenses, setExpenses] = useState<Expense[]>([
    { id: '1', name: 'Truck Fuel (Diesel)', amount: '50', frequency: 'daily' },
    { id: '2', name: 'Vehicle Insurance', amount: '275', frequency: 'monthly' },
    { id: '3', name: 'Maintenance Reserve', amount: '150', frequency: 'monthly' },
    { id: '4', name: 'Phone/Data Plan', amount: '0', frequency: 'monthly' },
    { id: '5', name: 'Software Subscription', amount: '50', frequency: 'monthly' },
    { id: '6', name: 'Fuel Tank Rental', amount: '0', frequency: 'monthly' },
  ]);

  const [sectionsOpen, setSectionsOpen] = useState({
    tiers: true,
    fuel: true,
    expenses: true,
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

  const allocationRules = useMemo(() => {
    const rules = rulesData?.rules?.filter(r => r.isActive) || [];
    return {
      fuel_sale: rules.filter(r => r.revenueType === 'fuel_sale'),
      delivery_fee: rules.filter(r => r.revenueType === 'delivery_fee'),
      subscription_fee: rules.filter(r => r.revenueType === 'subscription_fee'),
    };
  }, [rulesData]);

  const projections = useMemo(() => {
    const workDays = parseFloat(workDaysPerWeek) || 3;
    const taxRate = parseFloat(taxReserveRate) / 100 || 0.30;
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

    const profitBeforeTax = operatingProfit - estimatedStripeFees;
    const taxReserve = Math.max(0, profitBeforeTax * taxRate);
    const netProfit = profitBeforeTax - taxReserve;

    const weeklyNetProfit = netProfit / 4.33;
    const yearlyNetProfit = netProfit * 12;

    const gstCollected = totalGrossRevenue * GST_RATE;

    const grossMarginPct = totalGrossRevenue > 0 ? (grossMargin / totalGrossRevenue) * 100 : 0;
    const netMarginPct = totalGrossRevenue > 0 ? (netProfit / totalGrossRevenue) * 100 : 0;
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
    // WATERFALL BUCKET ALLOCATION ENGINE
    // Follows Alberta/CRA financial ordering and PMFS waterfall logic
    // ═══════════════════════════════════════════════════════════════

    // STEP 1: Stripe processes payments. Stripe payout = gross - Stripe fees.
    // This is the actual daily deposit into Operating Chequing.
    const stripePayout = totalGrossRevenue - estimatedStripeFees;

    // STEP 2: GST Extraction (CRA requirement — GST-inclusive method)
    // GST is embedded in customer-paid prices. Extract using gross / 1.05.
    // Per Alberta/CRA rules, GST is collected on behalf of the government.
    const fuelSaleGross = totalFuelRevenue;
    const deliveryFeeGross = totalDeliveryFeeRevenue;
    const subscriptionGross = totalSubscriptionRevenue;

    const fuelSaleGST = fuelSaleGross - (fuelSaleGross / 1.05);
    const deliveryFeeGST = deliveryFeeGross - (deliveryFeeGross / 1.05);
    const subscriptionGST = subscriptionGross - (subscriptionGross / 1.05);
    const totalGST = fuelSaleGST + deliveryFeeGST + subscriptionGST;

    // Net after GST extraction per revenue stream
    const fuelSaleNetAfterGST = fuelSaleGross / 1.05;
    const deliveryFeeNetAfterGST = deliveryFeeGross / 1.05;
    const subscriptionNetAfterGST = subscriptionGross / 1.05;

    // STEP 3: Stripe fees deducted per revenue stream (proportional)
    const totalGrossForRatio = totalGrossRevenue || 1;
    const fuelStripeFee = estimatedStripeFees * (fuelSaleGross / totalGrossForRatio);
    const deliveryStripeFee = estimatedStripeFees * (deliveryFeeGross / totalGrossForRatio);
    const subscriptionStripeFee = estimatedStripeFees * (subscriptionGross / totalGrossForRatio);

    // Net after GST AND Stripe per stream — this is what's available for allocation
    const fuelNetAfterGSTStripe = fuelSaleNetAfterGST - fuelStripeFee;
    const deliveryNetAfterGSTStripe = deliveryFeeNetAfterGST - deliveryStripeFee;
    const subscriptionNetAfterGSTStripe = subscriptionNetAfterGST - subscriptionStripeFee;

    // STEP 4: Fuel COGS deduction — margin is what gets allocated from fuel sales
    const fuelMarginForAllocation = fuelNetAfterGSTStripe - totalFuelCOGS;

    // STEP 5: Subscription deferral — 40% held for service obligation (not yet earned)
    const subscriptionDeferred = subscriptionNetAfterGSTStripe * 0.40;
    const subscriptionUsable = subscriptionNetAfterGSTStripe - subscriptionDeferred;

    // STEP 6: Allocate remaining amounts from each revenue stream into buckets
    // using the live allocation rule percentages from the database
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

    // GST Holding: receives all extracted GST
    buckets.gst_holding.fromFuelSales = fuelSaleGST;
    buckets.gst_holding.fromDeliveryFees = deliveryFeeGST;
    buckets.gst_holding.fromSubscriptions = subscriptionGST;
    buckets.gst_holding.total = totalGST;

    // Deferred Subscription: receives 40% of subscription net
    buckets.deferred_subscription.fromSubscriptions = subscriptionDeferred;
    buckets.deferred_subscription.total = subscriptionDeferred;

    // Fuel sale margin allocation
    const fuelRules = allocationRules.fuel_sale;
    if (fuelRules.length > 0) {
      fuelRules.forEach(rule => {
        const pct = parseFloat(rule.percentage) / 100;
        const amount = fuelMarginForAllocation * pct;
        if (buckets[rule.accountType]) {
          buckets[rule.accountType].fromFuelSales += amount;
        }
      });
    } else {
      buckets.owner_draw_holding.fromFuelSales = fuelMarginForAllocation;
    }

    // Delivery fee net allocation
    const deliveryRules = allocationRules.delivery_fee;
    if (deliveryRules.length > 0) {
      deliveryRules.forEach(rule => {
        const pct = parseFloat(rule.percentage) / 100;
        const amount = deliveryNetAfterGSTStripe * pct;
        if (buckets[rule.accountType]) {
          buckets[rule.accountType].fromDeliveryFees += amount;
        }
      });
    } else {
      buckets.owner_draw_holding.fromDeliveryFees = deliveryNetAfterGSTStripe;
    }

    // Subscription usable (60%) allocation
    const subRules = allocationRules.subscription_fee.filter(r => r.accountType !== 'deferred_subscription');
    if (subRules.length > 0) {
      subRules.forEach(rule => {
        const pct = parseFloat(rule.percentage) / 100;
        const amount = subscriptionUsable * pct;
        if (buckets[rule.accountType]) {
          buckets[rule.accountType].fromSubscriptions += amount;
        }
      });
    } else {
      buckets.owner_draw_holding.fromSubscriptions = subscriptionUsable;
    }

    // Operating Chequing: receives Stripe payout, pays out everything else
    // Its net balance = payout - all outflows (GST + COGS + deferred + allocations + OpEx)
    const totalAllocatedToBuckets = BUCKET_ORDER
      .filter(bt => bt !== 'operating_chequing')
      .reduce((sum, bt) => sum + buckets[bt].fromFuelSales + buckets[bt].fromDeliveryFees + buckets[bt].fromSubscriptions, 0);
    buckets.operating_chequing.total = stripePayout - totalAllocatedToBuckets - totalFuelCOGS - monthlyOpCost;

    // Update totals for each bucket (except gst_holding, deferred, and operating_chequing which are already set)
    BUCKET_ORDER.forEach(bt => {
      if (bt !== 'gst_holding' && bt !== 'deferred_subscription' && bt !== 'operating_chequing') {
        buckets[bt].total = buckets[bt].fromFuelSales + buckets[bt].fromDeliveryFees + buckets[bt].fromSubscriptions;
      }
    });

    // Waterfall step detail for the P&L display
    const waterfallSteps = {
      grossRevenue: totalGrossRevenue,
      stripeFees: estimatedStripeFees,
      stripePayout,
      gst: { fuel: fuelSaleGST, delivery: deliveryFeeGST, subscription: subscriptionGST, total: totalGST },
      netAfterGST: { fuel: fuelSaleNetAfterGST, delivery: deliveryFeeNetAfterGST, subscription: subscriptionNetAfterGST },
      stripeFeesByStream: { fuel: fuelStripeFee, delivery: deliveryStripeFee, subscription: subscriptionStripeFee },
      netAfterGSTStripe: { fuel: fuelNetAfterGSTStripe, delivery: deliveryNetAfterGSTStripe, subscription: subscriptionNetAfterGSTStripe },
      fuelCOGS: totalFuelCOGS,
      fuelMarginForAllocation,
      subscriptionDeferred,
      subscriptionUsable,
      deliveryNetForAllocation: deliveryNetAfterGSTStripe,
      buckets,
      totalAllocatedToBuckets,
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
      profitBeforeTax,
      taxReserve,
      netProfit,
      weeklyNetProfit,
      yearlyNetProfit,
      waterfallSteps,
      metrics: {
        grossMarginPct,
        netMarginPct,
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
  }, [tierCounts, deliveriesPerMonth, avgLitresPerDelivery, fuelMix, expenses, livePricing, taxReserveRate, workDaysPerWeek, allocationRules]);

  const content = (
    <main className={embedded ? "space-y-6 pb-24" : "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24 space-y-6"}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
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
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card className="border-2 border-sage/30 bg-gradient-to-br from-sage/5 to-sage/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-sage" />
              <span className="text-sm text-muted-foreground">Weekly Owner Draw</span>
            </div>
            <p className={`font-display text-2xl sm:text-3xl font-bold ${(projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-weekly-net-profit">
              {formatCurrency((projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) / 4.33)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">After all bucket allocations</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-copper/30 bg-gradient-to-br from-copper/5 to-copper/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-copper" />
              <span className="text-sm text-muted-foreground">Monthly Owner Draw</span>
            </div>
            <p className={`font-display text-2xl sm:text-3xl font-bold ${(projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-monthly-net-profit">
              {formatCurrency(projections.waterfallSteps.buckets.owner_draw_holding?.total || 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{projections.metrics.netMarginPct.toFixed(1)}% net margin</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-gold/30 bg-gradient-to-br from-gold/5 to-gold/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-gold" />
              <span className="text-sm text-muted-foreground">Yearly Projection</span>
            </div>
            <p className={`font-display text-2xl sm:text-3xl font-bold ${(projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-yearly-net-profit">
              {formatCurrency((projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) * 12)}
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
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Tax Reserve %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={taxReserveRate}
                    onChange={(e) => setTaxReserveRate(e.target.value)}
                    className="mt-1"
                    data-testid="input-tax-rate"
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

      <Card className="border-2 border-copper/20">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Wallet className="w-5 h-5 text-copper" />
            Monthly Profit & Loss Statement
          </CardTitle>
          <CardDescription>Pro forma income statement with 9-bucket waterfall allocation · Bank presentation ready</CardDescription>
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

          {/* ═══ SECTION 2: STRIPE PROCESSING — DEDUCTED BEFORE DEPOSIT ═══ */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">2. Payment Processing (Deducted Before Bank Deposit)</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Subscription billing ({TIER_ORDER.reduce((s, t) => s + (SUBSCRIPTION_MONTHLY_FEES[t] > 0 ? (parseInt(tierCounts[t]) || 0) : 0), 0)} charges × 2.9% + $0.30)</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.subscriptionStripeFees)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Delivery billing ({projections.totalMonthlyDeliveries.toFixed(0)} charges × 2.9% + $0.30)</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.deliveryStripeFees)}</span>
          </div>
          <div className="flex justify-between py-2 px-2 border-t font-medium">
            <span className="text-sm">Total Stripe Processing Fees</span>
            <span className="text-sm text-amber-600">-{formatCurrency(projections.estimatedStripeFees)}</span>
          </div>

          <div className="flex justify-between py-2.5 px-3 bg-blue-700/10 rounded-lg font-medium mt-1">
            <span className="text-sm">Stripe Monthly Payout → Operating Chequing</span>
            <span className="text-sm text-blue-700" data-testid="text-pl-stripe-payout">{formatCurrency(projections.waterfallSteps.stripePayout)}</span>
          </div>
          <p className="text-xs text-muted-foreground px-3 italic">This is the actual amount deposited into your business bank account each month.</p>

          {/* ═══ SECTION 3: GST EXTRACTION — CRA LIABILITY ═══ */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">3. GST Extraction (5% — CRA Liability, Quarterly Remittance)</div>
          <p className="text-xs text-muted-foreground px-2 mb-1">GST is embedded in all customer-paid prices. Extracted using GST-inclusive method (gross ÷ 1.05) per Canada Revenue Agency rules.</p>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">GST on Fuel Sales</span>
            <span className="text-sm font-medium text-red-600">{formatCurrency(projections.waterfallSteps.gst.fuel)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">GST on Delivery Fees</span>
            <span className="text-sm font-medium text-red-600">{formatCurrency(projections.waterfallSteps.gst.delivery)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">GST on Subscriptions</span>
            <span className="text-sm font-medium text-red-600">{formatCurrency(projections.waterfallSteps.gst.subscription)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-red-500/10 rounded-lg font-medium mt-1">
            <span className="text-sm">Total GST → GST Holding Account</span>
            <span className="text-sm text-red-600" data-testid="text-pl-gst-holding">{formatCurrency(projections.waterfallSteps.gst.total)}</span>
          </div>
          <p className="text-xs text-muted-foreground px-3 italic">Set aside for CRA quarterly GST remittance. This is not business revenue — it is a government liability.</p>

          {/* ═══ SECTION 4: COST OF GOODS SOLD ═══ */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">4. Cost of Goods Sold (Wholesale Fuel)</div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Regular 87 COGS ({projections.fuelByType.regular.litres.toFixed(0)}L × ${projections.fuelByType.regular.costPerLitre.toFixed(4)})</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.fuelByType.regular.cogs)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Diesel COGS ({projections.fuelByType.diesel.litres.toFixed(0)}L × ${projections.fuelByType.diesel.costPerLitre.toFixed(4)})</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.fuelByType.diesel.cogs)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Premium 91 COGS ({projections.fuelByType.premium.litres.toFixed(0)}L × ${projections.fuelByType.premium.costPerLitre.toFixed(4)})</span>
            <span className="text-sm font-medium text-amber-600">-{formatCurrency(projections.fuelByType.premium.cogs)}</span>
          </div>
          <div className="flex justify-between py-2 px-2 border-t font-medium">
            <span className="text-sm">Total COGS</span>
            <span className="text-sm text-amber-600" data-testid="text-pl-total-cogs">-{formatCurrency(projections.totalFuelCOGS)}</span>
          </div>

          <div className="flex justify-between py-2.5 px-3 bg-blue-500/10 rounded-lg font-medium">
            <span className="text-sm">Gross Margin (Revenue - COGS)</span>
            <span className="text-sm" data-testid="text-pl-gross-margin">{formatCurrency(projections.grossMargin)}</span>
          </div>

          {/* ═══ SECTION 5: SUBSCRIPTION DEFERRAL ═══ */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">5. Subscription Revenue Deferral (Service Obligation)</div>
          <p className="text-xs text-muted-foreground px-2 mb-1">Per accrual accounting principles, 40% of subscription revenue is deferred until service is delivered.</p>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">Subscription Net (after GST & Stripe)</span>
            <span className="text-sm font-medium">{formatCurrency(projections.waterfallSteps.netAfterGSTStripe.subscription)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">40% Deferred (service obligation)</span>
            <span className="text-sm font-medium text-purple-600">-{formatCurrency(projections.waterfallSteps.subscriptionDeferred)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-purple-500/10 rounded-lg font-medium mt-1">
            <span className="text-sm">Deferred → Deferred Subscription Account</span>
            <span className="text-sm text-purple-600" data-testid="text-pl-deferred">{formatCurrency(projections.waterfallSteps.subscriptionDeferred)}</span>
          </div>
          <div className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
            <span className="text-sm text-muted-foreground pl-4">60% Usable (available for allocation)</span>
            <span className="text-sm font-medium">{formatCurrency(projections.waterfallSteps.subscriptionUsable)}</span>
          </div>

          {/* ═══ SECTION 6: OPERATING EXPENSES ═══ */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">6. Operating Expenses (Paid from Operating Chequing)</div>
          {projections.expenseBreakdown.map((exp) => (
            <div key={exp.id} className="flex justify-between py-1.5 px-2 rounded hover:bg-muted/30">
              <span className="text-sm text-muted-foreground pl-4">{exp.name || 'Unnamed Expense'}</span>
              <span className="text-sm font-medium text-amber-600">-{formatCurrency(exp.monthly)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 px-2 border-t font-medium">
            <span className="text-sm">Total Operating Expenses</span>
            <span className="text-sm text-amber-600" data-testid="text-pl-total-opex">-{formatCurrency(projections.monthlyOpCost)}</span>
          </div>

          <div className="flex justify-between py-2.5 px-3 bg-copper/10 rounded-lg font-medium">
            <span className="text-sm">Operating Profit (Margin - OpEx)</span>
            <span className={`text-sm ${projections.operatingProfit >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-pl-operating-profit">
              {formatCurrency(projections.operatingProfit)}
            </span>
          </div>

          {/* ═══ SECTION 7: WATERFALL BUCKET ALLOCATIONS ═══ */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-4 pb-1">7. Waterfall Bucket Allocations</div>
          <p className="text-xs text-muted-foreground px-2 mb-2">Remaining net revenue from each stream is allocated into reserve buckets using configured percentages.</p>

          <div className="space-y-3">
            {/* Fuel Sale Margin Allocation */}
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <div className="flex justify-between items-center pb-1 border-b border-border/50">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fuel Sale Margin Allocation</span>
                <span className="text-xs font-medium">Pool: {formatCurrency(projections.waterfallSteps.fuelMarginForAllocation)}</span>
              </div>
              {allocationRules.fuel_sale.map(rule => {
                const pct = parseFloat(rule.percentage);
                const amount = projections.waterfallSteps.fuelMarginForAllocation * (pct / 100);
                return (
                  <div key={rule.id} className="flex justify-between py-0.5 px-1">
                    <span className={`text-xs ${BUCKET_DISPLAY[rule.accountType]?.color || ''}`}>
                      {BUCKET_DISPLAY[rule.accountType]?.name || rule.accountType} ({pct}%)
                    </span>
                    <span className={`text-xs font-medium ${BUCKET_DISPLAY[rule.accountType]?.color || ''}`}>{formatCurrency(amount)}</span>
                  </div>
                );
              })}
            </div>

            {/* Delivery Fee Net Allocation */}
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <div className="flex justify-between items-center pb-1 border-b border-border/50">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery Fee Allocation</span>
                <span className="text-xs font-medium">Pool: {formatCurrency(projections.waterfallSteps.deliveryNetForAllocation)}</span>
              </div>
              {allocationRules.delivery_fee.map(rule => {
                const pct = parseFloat(rule.percentage);
                const amount = projections.waterfallSteps.deliveryNetForAllocation * (pct / 100);
                return (
                  <div key={rule.id} className="flex justify-between py-0.5 px-1">
                    <span className={`text-xs ${BUCKET_DISPLAY[rule.accountType]?.color || ''}`}>
                      {BUCKET_DISPLAY[rule.accountType]?.name || rule.accountType} ({pct}%)
                    </span>
                    <span className={`text-xs font-medium ${BUCKET_DISPLAY[rule.accountType]?.color || ''}`}>{formatCurrency(amount)}</span>
                  </div>
                );
              })}
            </div>

            {/* Subscription Usable (60%) Allocation */}
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <div className="flex justify-between items-center pb-1 border-b border-border/50">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription Usable (60%) Allocation</span>
                <span className="text-xs font-medium">Pool: {formatCurrency(projections.waterfallSteps.subscriptionUsable)}</span>
              </div>
              {allocationRules.subscription_fee.filter(r => r.accountType !== 'deferred_subscription').map(rule => {
                const pct = parseFloat(rule.percentage);
                const amount = projections.waterfallSteps.subscriptionUsable * (pct / 100);
                return (
                  <div key={rule.id} className="flex justify-between py-0.5 px-1">
                    <span className={`text-xs ${BUCKET_DISPLAY[rule.accountType]?.color || ''}`}>
                      {BUCKET_DISPLAY[rule.accountType]?.name || rule.accountType} ({pct}%)
                    </span>
                    <span className={`text-xs font-medium ${BUCKET_DISPLAY[rule.accountType]?.color || ''}`}>{formatCurrency(amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═══ SECTION 8: PROJECTED MONTHLY ACCOUNT BALANCES ═══ */}
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium pt-6 pb-2">8. Projected Monthly Account Balances</div>
          <p className="text-xs text-muted-foreground px-2 mb-2">Where every projected dollar lands across the 9-bucket system. All revenue streams combined.</p>

          <div className="border rounded-lg overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid gap-1 px-3 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground border-b" style={{ gridTemplateColumns: '2.5fr repeat(5, 1fr)' }}>
                <div>Account</div>
                <div className="text-right">Fuel</div>
                <div className="text-right">Delivery</div>
                <div className="text-right">Subs</div>
                <div className="text-right">Total</div>
                <div className="text-right">Year End</div>
              </div>
              {BUCKET_ORDER.map((bt) => {
                const bucket = projections.waterfallSteps.buckets[bt];
                if (!bucket) return null;
                const display = BUCKET_DISPLAY[bt];
                const isHighlight = bt === 'owner_draw_holding';
                const isOperating = bt === 'operating_chequing';
                const yearEndTotal = bucket.total * 12;
                return (
                  <div
                    key={bt}
                    className={`grid gap-1 px-3 py-2 text-xs items-center ${
                      isHighlight ? 'bg-sage/10 border-t-2 border-sage/30' :
                      isOperating ? 'bg-blue-500/5' :
                      'hover:bg-muted/30'
                    } ${bt !== BUCKET_ORDER[BUCKET_ORDER.length - 1] ? 'border-b border-border/30' : ''}`}
                    style={{ gridTemplateColumns: '2.5fr repeat(5, 1fr)' }}
                    data-testid={`bucket-row-${bt}`}
                  >
                    <div>
                      <div className={`font-medium ${display?.color || ''} ${isHighlight ? 'text-sm' : ''}`}>{display?.name || bt}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{display?.description || ''}</div>
                    </div>
                    <div className={`text-right font-medium ${display?.color || ''}`}>
                      {bucket.fromFuelSales !== 0 ? formatCurrency(bucket.fromFuelSales) : '—'}
                    </div>
                    <div className={`text-right font-medium ${display?.color || ''}`}>
                      {bucket.fromDeliveryFees !== 0 ? formatCurrency(bucket.fromDeliveryFees) : '—'}
                    </div>
                    <div className={`text-right font-medium ${display?.color || ''}`}>
                      {bucket.fromSubscriptions !== 0 ? formatCurrency(bucket.fromSubscriptions) : '—'}
                    </div>
                    <div className={`text-right font-bold ${isHighlight ? 'text-sage text-sm' : display?.color || ''}`}>
                      {formatCurrency(bucket.total)}
                    </div>
                    <div className={`text-right font-semibold ${isHighlight ? 'text-sage' : ''}`}>
                      {formatCurrency(yearEndTotal)}
                    </div>
                  </div>
                );
              })}
              <div className="grid gap-1 px-3 py-2.5 bg-muted/50 text-xs font-bold border-t-2" style={{ gridTemplateColumns: '2.5fr repeat(5, 1fr)' }}>
                <div style={{ gridColumn: 'span 4' }}>Reconciliation: Bucket Totals + COGS + OpEx = Stripe Payout</div>
                <div className="text-right">
                  {formatCurrency(projections.waterfallSteps.stripePayout)}
                </div>
                <div className="text-right">
                  {formatCurrency(projections.waterfallSteps.stripePayout * 12)}
                </div>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground px-2 mt-2 space-y-0.5">
            <p className="italic">All 9 bucket balances ({formatCurrency(BUCKET_ORDER.reduce((sum, bt) => sum + (projections.waterfallSteps.buckets[bt]?.total || 0), 0))}) + COGS ({formatCurrency(projections.totalFuelCOGS)}) + OpEx ({formatCurrency(projections.monthlyOpCost)}) = Stripe Payout ({formatCurrency(projections.waterfallSteps.stripePayout)})</p>
            <p className="italic">Operating Chequing holds unallocated residuals — working capital available for discretionary use.</p>
          </div>

          {/* ═══ FINAL: OWNER DRAW (BOTTOM LINE) ═══ */}
          <div className="flex justify-between py-3 px-4 bg-sage/15 rounded-xl mt-4 border-2 border-sage/30">
            <div>
              <span className="font-medium">Net Profit → Owner Draw Holding</span>
              <p className="text-xs text-muted-foreground mt-0.5">Available for owner compensation after all obligations</p>
            </div>
            <span className={`font-display text-xl font-bold ${(projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-pl-net-profit">
              {formatCurrency(projections.waterfallSteps.buckets.owner_draw_holding?.total || 0)}
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
                <div className={`font-display text-xl font-bold ${(projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-metric-net-margin">
                  {projections.totalGrossRevenue > 0 ? (((projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) / projections.totalGrossRevenue) * 100).toFixed(1) : '0.0'}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">After all allocations</div>
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
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Working Capital</div>
                <div className={`font-display text-xl font-bold ${(projections.waterfallSteps.buckets.operating_chequing?.total || 0) >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-metric-working-capital">
                  {formatCurrency(projections.waterfallSteps.buckets.operating_chequing?.total || 0)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Operating Chequing</div>
              </div>
              <div className="p-3 rounded-xl bg-sage/10 border-2 border-sage/30 text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Owner Draw %</div>
                <div className={`font-display text-xl font-bold ${(projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-metric-owner-draw-pct">
                  {projections.totalGrossRevenue > 0 ? (((projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) / projections.totalGrossRevenue) * 100).toFixed(1) : '0.0'}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{formatCurrency(projections.waterfallSteps.buckets.owner_draw_holding?.total || 0)}/mo</div>
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
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual COGS</div>
              <div className="font-display text-lg font-bold text-amber-600">{formatCurrency(projections.totalFuelCOGS * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-copper/10 to-copper/5 border text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual OpEx</div>
              <div className="font-display text-lg font-bold text-amber-600">{formatCurrency(projections.monthlyOpCost * 12)}</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-sage/15 to-sage/5 border-2 border-sage/30 text-center">
              <div className="text-xs text-muted-foreground mb-1">Annual Owner Draw</div>
              <div className={`font-display text-lg font-bold ${(projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) >= 0 ? 'text-sage' : 'text-red-600'}`} data-testid="text-annual-net-profit">
                {formatCurrency((projections.waterfallSteps.buckets.owner_draw_holding?.total || 0) * 12)}
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
