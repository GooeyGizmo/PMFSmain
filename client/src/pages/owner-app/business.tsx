import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import OpsAnalytics from "@/pages/ops/analytics";
import OpsPricing from "@/pages/ops/pricing";
import OpsPromoCodes from "@/pages/ops/promo-codes";

export default function BusinessPage() {
  const [activeTab, setActiveTab] = useState("analytics");

  return (
    <OwnerShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Business</h1>
          <p className="text-muted-foreground">Analytics, pricing, and promotional tools</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
            <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing</TabsTrigger>
            <TabsTrigger value="promos" data-testid="tab-promos">Promo Codes</TabsTrigger>
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
        </Tabs>
      </div>
    </OwnerShell>
  );
}
