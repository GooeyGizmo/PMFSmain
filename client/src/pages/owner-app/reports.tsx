import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DollarSign, FileText, TrendingUp, Calculator, Receipt, Scale,
  Fuel, Truck, MapPin, ClipboardList, Users, BarChart3, Package,
  Search, ArrowRight, Building2, ShieldCheck, Landmark, BookOpen,
  PieChart, Activity, Target, Trash2,
} from "lucide-react";

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  color: string;
}

interface ReportCategory {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  reports: ReportCard[];
}

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: "financial",
    title: "Financial Reports",
    icon: DollarSign,
    color: "text-emerald-600",
    reports: [
      {
        id: "pnl",
        title: "Profit & Loss",
        description: "Live P&L statement with revenue, COGS, and net income breakdown",
        icon: TrendingUp,
        href: "/owner/finance?tab=command",
        color: "bg-emerald-500/10 text-emerald-600",
      },
      {
        id: "waterfall",
        title: "Cash Flow Waterfall",
        description: "9-bucket account allocation showing how revenue flows through your business",
        icon: BarChart3,
        href: "/owner/finance?tab=command",
        color: "bg-emerald-500/10 text-emerald-600",
      },
      {
        id: "revenue-gst",
        title: "Revenue & GST Summary",
        description: "Total revenue collected with GST breakdown by period",
        icon: Receipt,
        href: "/owner/finance?tab=command",
        color: "bg-emerald-500/10 text-emerald-600",
      },
      {
        id: "freedom-runway",
        title: "Freedom Runway Tracker",
        description: "Track how many months of operating expenses you have saved",
        icon: Target,
        href: "/owner/finance?tab=command",
        color: "bg-emerald-500/10 text-emerald-600",
      },
      {
        id: "profitability",
        title: "Profitability Calculator",
        description: "Model business waterfall projections with mandatory obligations and reserves",
        icon: Calculator,
        href: "/owner/finance?tab=calculators",
        color: "bg-emerald-500/10 text-emerald-600",
      },
      {
        id: "weekly-closeout",
        title: "Weekly Closeout Reports",
        description: "Completed weekly close periods with reconciliation and financial snapshots",
        icon: BookOpen,
        href: "/owner/finance?tab=closeout",
        color: "bg-emerald-500/10 text-emerald-600",
      },
    ],
  },
  {
    id: "cra",
    title: "CRA / Tax Reports",
    icon: Landmark,
    color: "text-blue-600",
    reports: [
      {
        id: "t2125",
        title: "T2125 Statement",
        description: "Statement of Business Activities organized by CRA line numbers for tax filing",
        icon: FileText,
        href: "/owner/finance?tab=cra&subtab=t2125",
        color: "bg-blue-500/10 text-blue-600",
      },
      {
        id: "gst34",
        title: "GST34 Filing Worksheet",
        description: "GST collected vs. ITCs claimed, ready for GST return filing",
        icon: Scale,
        href: "/owner/finance?tab=cra&subtab=gst",
        color: "bg-blue-500/10 text-blue-600",
      },
      {
        id: "cca",
        title: "CCA Schedule",
        description: "Capital Cost Allowance depreciation tracking by CRA asset class",
        icon: Building2,
        href: "/owner/finance?tab=cra&subtab=cca",
        color: "bg-blue-500/10 text-blue-600",
      },
      {
        id: "invoices",
        title: "Invoice Register",
        description: "All auto-generated CRA-compliant invoices with sequential numbering",
        icon: Receipt,
        href: "/owner/finance?tab=cra&subtab=invoices",
        color: "bg-blue-500/10 text-blue-600",
      },
      {
        id: "expenses",
        title: "Expense Summary",
        description: "Business expenses categorized by T2125 line with receipt tracking",
        icon: DollarSign,
        href: "/owner/finance?tab=cra&subtab=expenses",
        color: "bg-blue-500/10 text-blue-600",
      },
      {
        id: "fuel-ledger",
        title: "Fuel Ledger",
        description: "Complete fuel purchase-to-delivery tracking with weighted-average COGS",
        icon: Fuel,
        href: "/owner/finance?tab=cra&subtab=fuel",
        color: "bg-blue-500/10 text-blue-600",
      },
      {
        id: "cra-settings",
        title: "CRA Business Settings",
        description: "GST registration, business info, and invoice configuration",
        icon: ShieldCheck,
        href: "/owner/finance?tab=cra&subtab=settings",
        color: "bg-blue-500/10 text-blue-600",
      },
    ],
  },
  {
    id: "operations",
    title: "Operations Reports",
    icon: Truck,
    color: "text-orange-600",
    reports: [
      {
        id: "fuel-reconciliation",
        title: "Fuel Reconciliation",
        description: "Daily fuel tracking with shrinkage, spillage, and road fuel calculations",
        icon: Fuel,
        href: "/owner/operations?tab=fuel",
        color: "bg-orange-500/10 text-orange-600",
      },
      {
        id: "dispatch",
        title: "Dispatch & Orders",
        description: "Active orders, route assignments, and delivery status tracking",
        icon: ClipboardList,
        href: "/owner/operations?tab=dispatch",
        color: "bg-orange-500/10 text-orange-600",
      },
      {
        id: "order-history",
        title: "Order History",
        description: "Complete order history with filtering and search",
        icon: Package,
        href: "/owner/operations?tab=orders",
        color: "bg-orange-500/10 text-orange-600",
      },
      {
        id: "fleet",
        title: "Fleet Status",
        description: "Truck status, pre-trip inspections, and vehicle readiness",
        icon: Truck,
        href: "/owner/operations?tab=fleet",
        color: "bg-orange-500/10 text-orange-600",
      },
      {
        id: "capacity",
        title: "Capacity Planning",
        description: "Route capacity, slot availability, and tier reservations",
        icon: MapPin,
        href: "/owner/operations?tab=capacity",
        color: "bg-orange-500/10 text-orange-600",
      },
      {
        id: "verifications",
        title: "Heroes Verifications",
        description: "Review and manage Heroes tier verification requests",
        icon: ShieldCheck,
        href: "/owner/operations?tab=verifications",
        color: "bg-orange-500/10 text-orange-600",
      },
    ],
  },
  {
    id: "customer",
    title: "Customer Reports",
    icon: Users,
    color: "text-purple-600",
    reports: [
      {
        id: "analytics",
        title: "Business Analytics",
        description: "Order volume, revenue trends, customer metrics, and goal tracking",
        icon: PieChart,
        href: "/owner/business?tab=analytics",
        color: "bg-purple-500/10 text-purple-600",
      },
      {
        id: "customer-list",
        title: "Customer Directory",
        description: "All registered customers with subscription tier and contact info",
        icon: Users,
        href: "/owner/operations?tab=customers",
        color: "bg-purple-500/10 text-purple-600",
      },
      {
        id: "subscription-pricing",
        title: "Subscription Tiers",
        description: "Tier pricing, benefits, and subscriber counts",
        icon: Activity,
        href: "/owner/business?tab=subscription-pricing",
        color: "bg-purple-500/10 text-purple-600",
      },
      {
        id: "promos",
        title: "Promotions & Rewards",
        description: "Active promotions, promo codes, and reward program activity",
        icon: Target,
        href: "/owner/business?tab=promos",
        color: "bg-purple-500/10 text-purple-600",
      },
      {
        id: "deleted-orders",
        title: "Deleted & Voided Orders",
        description: "Cancelled and voided order records for audit trail",
        icon: Trash2,
        href: "/owner/business?tab=analytics",
        color: "bg-purple-500/10 text-purple-600",
      },
    ],
  },
];

export default function OwnerReports() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCategories = REPORT_CATEGORIES.map(cat => ({
    ...cat,
    reports: cat.reports.filter(r =>
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(cat => cat.reports.length > 0);

  const totalReports = REPORT_CATEGORIES.reduce((sum, cat) => sum + cat.reports.length, 0);

  return (
    <div className="space-y-6" data-testid="reports-center">
      <div>
        <h1 className="font-display text-2xl font-bold" data-testid="text-reports-title">Reports Center</h1>
        <p className="text-muted-foreground">
          Access all {totalReports} reports organized by category
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search reports..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-reports"
        />
      </div>

      {filteredCategories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No reports match your search</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {filteredCategories.map((category) => {
            const CategoryIcon = category.icon;
            return (
              <div key={category.id} data-testid={`category-${category.id}`}>
                <div className="flex items-center gap-2 mb-4">
                  <CategoryIcon className={`w-5 h-5 ${category.color}`} />
                  <h2 className="text-lg font-semibold">{category.title}</h2>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({category.reports.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {category.reports.map((report) => {
                    const ReportIcon = report.icon;
                    return (
                      <Card
                        key={report.id}
                        className="cursor-pointer hover:shadow-md hover:border-foreground/20 transition-all group"
                        onClick={() => navigate(report.href)}
                        data-testid={`report-card-${report.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg shrink-0 ${report.color}`}>
                              <ReportIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <h3 className="font-medium text-sm">{report.title}</h3>
                                <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {report.description}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
