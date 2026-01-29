import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { 
  DollarSign, 
  Calculator, 
  FileText
} from "lucide-react";
import { useLocation } from "wouter";
import FinancialCommandCenter from "@/pages/ops/financials";
import CloseoutPage from "@/pages/ops/closeout";

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState("command");
  const [, navigate] = useLocation();

  return (
    <OwnerShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Finance</h1>
          <p className="text-muted-foreground">Financial command center, reports, and closeout</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="command" data-testid="tab-command">Command Center</TabsTrigger>
            <TabsTrigger value="closeout" data-testid="tab-closeout">Closeout</TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
            <TabsTrigger value="calculators" data-testid="tab-calculators">Calculators</TabsTrigger>
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
              <Card>
                <CardContent className="py-6 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                    <Calculator className="w-6 h-6 text-copper" />
                  </div>
                  <div>
                    <h3 className="font-medium">Fuel Markup</h3>
                    <p className="text-sm text-muted-foreground">Calculate optimal pricing</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate("/ops/financials/calculators/fuel-markup")} data-testid="button-calc-fuel-markup">
                    Open Calculator
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-6 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                    <Calculator className="w-6 h-6 text-copper" />
                  </div>
                  <div>
                    <h3 className="font-medium">Profitability</h3>
                    <p className="text-sm text-muted-foreground">Analyze profit margins</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate("/ops/financials/calculators/profitability")} data-testid="button-calc-profitability">
                    Open Calculator
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-6 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                    <Calculator className="w-6 h-6 text-copper" />
                  </div>
                  <div>
                    <h3 className="font-medium">Freedom Runway</h3>
                    <p className="text-sm text-muted-foreground">Track financial independence</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate("/ops/financials/calculators/freedom-runway")} data-testid="button-calc-freedom-runway">
                    Open Calculator
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-6 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                    <Calculator className="w-6 h-6 text-copper" />
                  </div>
                  <div>
                    <h3 className="font-medium">Net Margin</h3>
                    <p className="text-sm text-muted-foreground">Calculate net margins</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate("/ops/financials/calculators/net-margin")} data-testid="button-calc-net-margin">
                    Open Calculator
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </OwnerShell>
  );
}
