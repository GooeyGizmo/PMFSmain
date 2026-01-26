import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OperatorShell } from "@/components/app-shell/operator-shell";
import { MapPin, ClipboardList, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

export default function RoutesPage() {
  const [activeTab, setActiveTab] = useState("dispatch");
  const [, navigate] = useLocation();

  return (
    <OperatorShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Routes & Orders</h1>
          <p className="text-muted-foreground">Manage dispatch routes and customer orders</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dispatch" data-testid="tab-dispatch">
              Dispatch Map
            </TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders">
              All Orders
            </TabsTrigger>
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
        </Tabs>
      </div>
    </OperatorShell>
  );
}
