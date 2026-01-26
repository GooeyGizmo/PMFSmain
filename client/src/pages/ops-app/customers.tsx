import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OperatorShell } from "@/components/app-shell/operator-shell";
import { Users, AlertTriangle, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

export default function CustomersPage() {
  const [activeTab, setActiveTab] = useState("customers");
  const [, navigate] = useLocation();

  return (
    <OperatorShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground">Manage customer accounts and service requests</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="customers" data-testid="tab-customers">
              All Customers
            </TabsTrigger>
            <TabsTrigger value="emergency" data-testid="tab-emergency">
              Emergency Services
            </TabsTrigger>
          </TabsList>

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

          <TabsContent value="emergency" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Emergency Services</h3>
                  <p className="text-muted-foreground">Manage emergency service requests</p>
                </div>
                <Button onClick={() => navigate("/ops/emergency")} data-testid="button-open-emergency">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Emergency
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OperatorShell>
  );
}
