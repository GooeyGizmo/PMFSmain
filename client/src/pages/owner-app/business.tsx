import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { Siren, Clock, Fuel, Battery, KeyRound, BarChart3, DollarSign, Tag } from "lucide-react";
import OpsAnalytics from "@/pages/ops/analytics";
import OpsPricing from "@/pages/ops/pricing";
import OpsPromoCodes from "@/pages/ops/promo-codes";

export default function BusinessPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get("tab");
  const validTabs = ["analytics", "pricing", "promos", "emergency"];
  const initialTab = tabParam && validTabs.includes(tabParam) ? tabParam : "analytics";
  const [activeTab, setActiveTab] = useState(initialTab);
  
  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  return (
    <OwnerShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Business</h1>
          <p className="text-muted-foreground">Analytics, pricing, and promotional tools</p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          const url = new URL(window.location.href);
          url.searchParams.set('tab', value);
          window.history.replaceState({}, '', url.toString());
        }}>
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="analytics" className="gap-2" data-testid="tab-analytics">
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="pricing" className="gap-2" data-testid="tab-pricing">
              <DollarSign className="w-4 h-4" />
              <span>Pricing</span>
            </TabsTrigger>
            <TabsTrigger value="promos" className="gap-2" data-testid="tab-promos">
              <Tag className="w-4 h-4" />
              <span>Promo Codes</span>
            </TabsTrigger>
            <TabsTrigger value="emergency" className="gap-2" data-testid="tab-emergency">
              <Siren className="w-4 h-4" />
              <span>Emergency</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-4">
            <OpsAnalytics embedded />
          </TabsContent>

          <TabsContent value="pricing" className="mt-4">
            <OpsPricing embedded />
          </TabsContent>

          <TabsContent value="promos" className="mt-4">
            <OpsPromoCodes embedded />
          </TabsContent>

          <TabsContent value="emergency" className="mt-4">
            <Card className="border-2 border-dashed border-amber-500/30">
              <CardHeader className="text-center pb-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
                  <Siren className="w-8 h-8 text-amber-500" />
                </div>
                <CardTitle className="font-display text-xl">Emergency & After-Hours Services</CardTitle>
                <Badge variant="outline" className="w-fit mx-auto mt-2">Coming Soon</Badge>
              </CardHeader>
              <CardContent className="text-center space-y-6">
                <CardDescription className="text-base max-w-md mx-auto">
                  Premium emergency services for customers who need fuel delivery, boost services, 
                  or lockout assistance outside of regular operating hours.
                </CardDescription>
                
                <div className="grid sm:grid-cols-3 gap-4 pt-4">
                  <div className="p-4 rounded-xl bg-muted/50 space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
                      <Fuel className="w-5 h-5 text-red-500" />
                    </div>
                    <h4 className="font-medium text-sm">Emergency Fuel</h4>
                    <p className="text-xs text-muted-foreground">After-hours fuel delivery</p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50 space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Battery className="w-5 h-5 text-blue-500" />
                    </div>
                    <h4 className="font-medium text-sm">Boost Services</h4>
                    <p className="text-xs text-muted-foreground">Battery jump starts</p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50 space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center">
                      <KeyRound className="w-5 h-5 text-purple-500" />
                    </div>
                    <h4 className="font-medium text-sm">Lockout Assist</h4>
                    <p className="text-xs text-muted-foreground">Vehicle lockout help</p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-4">
                  <Clock className="w-4 h-4" />
                  <span>This feature will be available in a future update</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OwnerShell>
  );
}
