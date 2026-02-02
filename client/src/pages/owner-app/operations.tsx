import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import OpsDispatch from "@/pages/ops/dispatch";
import OpsOrders from "@/pages/ops/orders";
import FleetManagement from "@/pages/ops/fleet";
import OpsCustomers from "@/pages/ops/customers";
import OpsCapacity from "@/pages/ops/capacity";

export default function OperationsPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get("tab");
  const validTabs = ["dispatch", "orders", "fleet", "customers", "capacity"];
  const initialTab = tabParam && validTabs.includes(tabParam) ? tabParam : "dispatch";
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
          <h1 className="font-display text-2xl font-bold">Operations</h1>
          <p className="text-muted-foreground">Manage daily operations, routes, fleet, and customers</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dispatch" data-testid="tab-dispatch">Dispatch</TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
            <TabsTrigger value="fleet" data-testid="tab-fleet">Fleet</TabsTrigger>
            <TabsTrigger value="customers" data-testid="tab-customers">Customers</TabsTrigger>
            <TabsTrigger value="capacity" data-testid="tab-capacity">Capacity</TabsTrigger>
          </TabsList>

          <TabsContent value="dispatch" className="mt-4">
            <OpsDispatch embedded />
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <OpsOrders embedded />
          </TabsContent>

          <TabsContent value="fleet" className="mt-4">
            <FleetManagement embedded />
          </TabsContent>

          <TabsContent value="customers" className="mt-4">
            <OpsCustomers embedded />
          </TabsContent>

          <TabsContent value="capacity" className="mt-4">
            <OpsCapacity embedded />
          </TabsContent>
        </Tabs>
      </div>
    </OwnerShell>
  );
}
