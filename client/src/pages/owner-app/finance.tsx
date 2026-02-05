import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { 
  DollarSign, 
  Calculator, 
  FileText,
  X,
  Fuel,
  TrendingUp,
  Target,
  BarChart3,
  LayoutDashboard,
  CheckSquare
} from "lucide-react";
import { useLocation } from "wouter";
import FinancialCommandCenter from "@/pages/ops/financials";
import CloseoutPage from "@/pages/ops/closeout";
import FuelMarkupCalculator from "@/pages/ops/financials/calculators/fuel-markup";
import ProfitabilityCalculator from "@/pages/ops/financials/calculators/profitability";
import FreedomRunwayCalculator from "@/pages/ops/financials/calculators/freedom-runway";
import NetMarginCalculator from "@/pages/ops/financials/calculators/net-margin";

type CalculatorType = 'fuel-markup' | 'profitability' | 'freedom-runway' | 'net-margin' | null;

export default function FinancePage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get("tab");
  const validTabs = ["command", "closeout", "reports", "calculators"];
  const initialTab = tabParam && validTabs.includes(tabParam) ? tabParam : "command";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [, navigate] = useLocation();
  const [openCalculator, setOpenCalculator] = useState<CalculatorType>(null);
  
  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const calculatorConfig = {
    'fuel-markup': {
      title: 'Fuel Markup Calculator',
      icon: Fuel,
      iconColor: 'text-amber-500',
      description: 'Calculate optimal pricing',
      component: FuelMarkupCalculator,
    },
    'profitability': {
      title: 'Profitability Projections',
      icon: TrendingUp,
      iconColor: 'text-sage',
      description: 'Analyze profit margins',
      component: ProfitabilityCalculator,
    },
    'freedom-runway': {
      title: 'Freedom Runway Planner',
      icon: Target,
      iconColor: 'text-pink-500',
      description: 'Track financial independence',
      component: FreedomRunwayCalculator,
    },
    'net-margin': {
      title: 'Net Margin Tracker',
      icon: BarChart3,
      iconColor: 'text-copper',
      description: 'Calculate net margins',
      component: NetMarginCalculator,
    },
  };

  const CurrentCalculator = openCalculator ? calculatorConfig[openCalculator].component : null;

  return (
    <OwnerShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Finance</h1>
          <p className="text-muted-foreground">Financial command center, reports, and closeout</p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          const url = new URL(window.location.href);
          url.searchParams.set('tab', value);
          window.history.replaceState({}, '', url.toString());
        }}>
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="command" className="gap-2" data-testid="tab-command">
              <LayoutDashboard className="w-4 h-4" />
              <span>Command Center</span>
            </TabsTrigger>
            <TabsTrigger value="closeout" className="gap-2" data-testid="tab-closeout">
              <CheckSquare className="w-4 h-4" />
              <span>Closeout</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2" data-testid="tab-reports">
              <FileText className="w-4 h-4" />
              <span>Reports</span>
            </TabsTrigger>
            <TabsTrigger value="calculators" className="gap-2" data-testid="tab-calculators">
              <Calculator className="w-4 h-4" />
              <span>Calculators</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="command" className="mt-4">
            <FinancialCommandCenter embedded />
          </TabsContent>

          <TabsContent value="closeout" className="mt-4">
            <CloseoutPage embedded />
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="py-6 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-medium">Ledger Report</h3>
                    <p className="text-sm text-muted-foreground">View all ledger entries</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate("/owner/finance/ledger-report")} data-testid="button-ledger-report">
                    Open Report
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-6 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-medium">GST Report</h3>
                    <p className="text-sm text-muted-foreground">CRA-ready GST summary</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate("/owner/finance/gst-report")} data-testid="button-gst-report">
                    Open Report
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="calculators" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              {(Object.keys(calculatorConfig) as CalculatorType[]).filter(Boolean).map((key) => {
                const config = calculatorConfig[key!];
                const Icon = config.icon;
                return (
                  <Card key={key} className="cursor-pointer hover:border-copper/50 transition-colors" onClick={() => setOpenCalculator(key)}>
                    <CardContent className="py-6 text-center space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                        <Icon className={`w-6 h-6 ${config.iconColor}`} />
                      </div>
                      <div>
                        <h3 className="font-medium">{config.title}</h3>
                        <p className="text-sm text-muted-foreground">{config.description}</p>
                      </div>
                      <Button variant="outline" size="sm" data-testid={`button-calc-${key}`}>
                        Open Calculator
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={openCalculator !== null} onOpenChange={(open) => !open && setOpenCalculator(null)}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
          <SheetHeader className="flex flex-row items-center justify-between border-b pb-4 mb-4">
            <SheetTitle className="flex items-center gap-2">
              {openCalculator && (
                <>
                  {(() => {
                    const Icon = calculatorConfig[openCalculator].icon;
                    return <Icon className={`w-5 h-5 ${calculatorConfig[openCalculator].iconColor}`} />;
                  })()}
                  {calculatorConfig[openCalculator].title}
                </>
              )}
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => setOpenCalculator(null)} data-testid="button-close-calculator">
              <X className="w-5 h-5" />
            </Button>
          </SheetHeader>
          {CurrentCalculator && <CurrentCalculator embedded />}
        </SheetContent>
      </Sheet>
    </OwnerShell>
  );
}
