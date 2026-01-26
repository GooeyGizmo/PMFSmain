import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OperatorShell } from "@/components/app-shell/operator-shell";
import { Truck, Package, FileText, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

export default function FleetPage() {
  const [activeTab, setActiveTab] = useState("trucks");
  const [, navigate] = useLocation();

  return (
    <OperatorShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Fleet & Inventory</h1>
          <p className="text-muted-foreground">Manage trucks, fuel inventory, and logs</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="trucks" data-testid="tab-trucks">
              Trucks
            </TabsTrigger>
            <TabsTrigger value="inventory" data-testid="tab-inventory">
              Inventory
            </TabsTrigger>
            <TabsTrigger value="fuel-log" data-testid="tab-fuel-log">
              Fuel Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trucks" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                  <Truck className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Fleet Management</h3>
                  <p className="text-muted-foreground">Manage trucks and pre-trip inspections</p>
                </div>
                <Button onClick={() => navigate("/ops/fleet")} data-testid="button-open-fleet">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Fleet
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inventory" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                  <Package className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Fuel Inventory</h3>
                  <p className="text-muted-foreground">Track fuel levels across trucks</p>
                </div>
                <Button onClick={() => navigate("/ops/inventory")} data-testid="button-open-inventory">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Inventory
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fuel-log" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Fuel Log</h3>
                  <p className="text-muted-foreground">View fuel transaction history</p>
                </div>
                <Button onClick={() => navigate("/ops/fuel-log")} data-testid="button-open-fuel-log">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Fuel Log
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OperatorShell>
  );
}
