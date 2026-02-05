import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { Truck, ClipboardList, Car, Users, Gauge, Wrench } from "lucide-react";
import OpsDispatch from "@/pages/ops/dispatch";
import OpsOrders from "@/pages/ops/orders";
import FleetManagement from "@/pages/ops/fleet";
import OpsCustomers from "@/pages/ops/customers";
import OpsCapacity from "@/pages/ops/capacity";
import OpsParts from "@/pages/ops/parts";

export default function OperationsPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get("tab");
  const validTabs = ["dispatch", "orders", "fleet", "customers", "capacity", "parts"];
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

        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          const url = new URL(window.location.href);
          url.searchParams.set('tab', value);
          window.history.replaceState({}, '', url.toString());
        }}>
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="dispatch" className="gap-2" data-testid="tab-dispatch">
              <Truck className="w-4 h-4" />
              <span>Dispatch</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2" data-testid="tab-orders">
              <ClipboardList className="w-4 h-4" />
              <span>Orders</span>
            </TabsTrigger>
            <TabsTrigger value="fleet" className="gap-2" data-testid="tab-fleet">
              <Car className="w-4 h-4" />
              <span>Fleet</span>
            </TabsTrigger>
            <TabsTrigger value="customers" className="gap-2" data-testid="tab-customers">
              <Users className="w-4 h-4" />
              <span>Customers</span>
            </TabsTrigger>
            <TabsTrigger value="capacity" className="gap-2" data-testid="tab-capacity">
              <Gauge className="w-4 h-4" />
              <span>Capacity</span>
            </TabsTrigger>
            <TabsTrigger value="parts" className="gap-2" data-testid="tab-parts">
              <Wrench className="w-4 h-4" />
              <span>Parts</span>
            </TabsTrigger>
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

          <TabsContent value="parts" className="mt-4">
            <OpsParts embedded />
          </TabsContent>
        </Tabs>
      </div>
    </OwnerShell>
  );
}
