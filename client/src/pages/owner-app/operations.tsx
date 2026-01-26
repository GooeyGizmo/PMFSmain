import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { MapPin, ClipboardList, Truck, Users, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

export default function OperationsPage() {
  const [activeTab, setActiveTab] = useState("dispatch");
  const [, navigate] = useLocation();

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
          </TabsList>

          <TabsContent value="dispatch" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Dispatch Map</h3>
                  <p className="text-muted-foreground">View routes, assign orders, and track deliveries</p>
                </div>
                <Button onClick={() => navigate("/ops/dispatch")} data-testid="button-open-dispatch">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Dispatch Map
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                  <ClipboardList className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">All Orders</h3>
                  <p className="text-muted-foreground">View and manage all customer orders</p>
                </div>
                <Button onClick={() => navigate("/ops/orders")} data-testid="button-open-orders">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Orders
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fleet" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                  <Truck className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Fleet Management</h3>
                  <p className="text-muted-foreground">Manage trucks, inspections, and fuel inventory</p>
                </div>
                <Button onClick={() => navigate("/ops/fleet")} data-testid="button-open-fleet">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Fleet
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                  <Users className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Customer Management</h3>
                  <p className="text-muted-foreground">View and manage customer accounts</p>
                </div>
                <Button onClick={() => navigate("/ops/customers")} data-testid="button-open-customers">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Customers
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OwnerShell>
  );
}
