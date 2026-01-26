import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { 
  TrendingUp, 
  Tag, 
  DollarSign, 
  BarChart3,
  ExternalLink 
} from "lucide-react";
import { useLocation } from "wouter";

export default function BusinessPage() {
  const [activeTab, setActiveTab] = useState("analytics");
  const [, navigate] = useLocation();

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
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center">
                  <BarChart3 className="w-8 h-8 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Business Analytics</h3>
                  <p className="text-muted-foreground">Revenue trends, customer insights, and demand patterns</p>
                </div>
                <Button onClick={() => navigate("/ops/analytics")} data-testid="button-open-analytics">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Analytics
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Fuel Pricing</h3>
                  <p className="text-muted-foreground">Set and manage fuel prices across all types</p>
                </div>
                <Button onClick={() => navigate("/ops/pricing")} data-testid="button-open-pricing">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Pricing
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="promos" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Tag className="w-8 h-8 text-purple-500" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Promo Codes</h3>
                  <p className="text-muted-foreground">Create and manage promotional discounts</p>
                </div>
                <Button onClick={() => navigate("/ops/promo-codes")} data-testid="button-open-promos">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Promo Codes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OwnerShell>
  );
}
