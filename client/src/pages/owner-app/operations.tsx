import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { Truck, ClipboardList, Car, Users, Gauge, Wrench, ShieldCheck, Fuel, AlertTriangle, Phone, Mail, Navigation } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { COMPANY_EMAILS } from "@shared/schema";
import OpsDispatch from "@/pages/ops/dispatch";
import OpsOrders from "@/pages/ops/orders";
import FleetManagement from "@/pages/ops/fleet";
import OpsCustomers from "@/pages/ops/customers";
import OpsVerifications from "@/pages/ops/verifications";
import OpsCapacity from "@/pages/ops/capacity";
import OpsParts from "@/pages/ops/parts";
import FuelManagement from "@/pages/ops/fuel-management";
import RoutePlanner from "@/pages/ops/route-planner";

export default function OperationsPage() {
  const search = useSearch();
  const validTabs = ["dispatch", "orders", "route-planner", "fleet", "fuel", "customers", "verifications", "capacity", "parts"];

  const getTabFromSearch = (searchStr: string) => {
    const params = new URLSearchParams(searchStr);
    const tab = params.get("tab");
    return tab && validTabs.includes(tab) ? tab : "dispatch";
  };

  const [activeTab, setActiveTab] = useState(() => getTabFromSearch(search));
  const [showEmergencyDialog, setShowEmergencyDialog] = useState(false);

  const { data: companyInfo } = useQuery<{
    ownerName: string;
    ownerTitle: string;
    ownerEmail: string;
    companyName: string;
    companyPhone: string;
  }>({
    queryKey: ['/api/company-info'],
  });
  
  useEffect(() => {
    setActiveTab(getTabFromSearch(search));
  }, [search]);

  return (
    <OwnerShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Operations</h1>
            <p className="text-muted-foreground">Manage daily operations, routes, fleet, and customers</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white font-bold animate-pulse flex-shrink-0"
            onClick={() => setShowEmergencyDialog(true)}
            data-testid="button-emergency-contact"
          >
            <AlertTriangle className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">EMERGENCY</span>
          </Button>
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
            <TabsTrigger value="route-planner" className="gap-2" data-testid="tab-route-planner">
              <Navigation className="w-4 h-4" />
              <span>Route Planner</span>
            </TabsTrigger>
            <TabsTrigger value="fleet" className="gap-2" data-testid="tab-fleet">
              <Car className="w-4 h-4" />
              <span>Fleet</span>
            </TabsTrigger>
            <TabsTrigger value="fuel" className="gap-2" data-testid="tab-fuel">
              <Fuel className="w-4 h-4" />
              <span>Fuel</span>
            </TabsTrigger>
            <TabsTrigger value="customers" className="gap-2" data-testid="tab-customers">
              <Users className="w-4 h-4" />
              <span>Customers</span>
            </TabsTrigger>
            <TabsTrigger value="verifications" className="gap-2" data-testid="tab-verifications">
              <ShieldCheck className="w-4 h-4" />
              <span>Verifications</span>
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

          <TabsContent value="route-planner" className="mt-4">
            <RoutePlanner />
          </TabsContent>

          <TabsContent value="fleet" className="mt-4">
            <FleetManagement embedded />
          </TabsContent>

          <TabsContent value="fuel" className="mt-4">
            <FuelManagement embedded />
          </TabsContent>

          <TabsContent value="customers" className="mt-4">
            <OpsCustomers embedded />
          </TabsContent>

          <TabsContent value="verifications" className="mt-4">
            <OpsVerifications embedded />
          </TabsContent>

          <TabsContent value="capacity" className="mt-4">
            <OpsCapacity embedded />
          </TabsContent>

          <TabsContent value="parts" className="mt-4">
            <OpsParts embedded />
          </TabsContent>
        </Tabs>

        <Dialog open={showEmergencyDialog} onOpenChange={setShowEmergencyDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-6 w-6" />
                Emergency Contact Information
              </DialogTitle>
              <DialogDescription>
                Use these contacts in case of dangerous goods incidents, spills, or emergencies.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-red-800">Life-Threatening Emergency</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button 
                    variant="destructive" 
                    size="lg" 
                    className="w-full text-xl font-bold"
                    onClick={() => window.location.href = 'tel:911'}
                    data-testid="button-call-911"
                  >
                    <Phone className="h-6 w-6 mr-2" />
                    Call 911
                  </Button>
                  <p className="text-xs text-red-700 mt-2 text-center">
                    For fires, injuries, or immediate life-threatening situations
                  </p>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-orange-800">CANUTEC - Dangerous Goods Emergencies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-orange-700">
                    Transport Canada's 24/7 emergency response center for dangerous goods incidents.
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-100"
                      onClick={() => window.location.href = 'tel:1-888-226-8832'}
                      data-testid="button-call-canutec"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      1-888-226-8832
                    </Button>
                    <Button 
                      variant="outline" 
                      className="border-orange-300 text-orange-700 hover:bg-orange-100"
                      onClick={() => window.location.href = 'tel:*666'}
                      data-testid="button-call-canutec-cell"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      *666 (cell)
                    </Button>
                  </div>
                  <p className="text-xs text-orange-600 mt-2">
                    <strong>When to call:</strong> Fuel spills, leaks, container damage, accidents involving dangerous goods, or if you need technical guidance during an incident.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-prairie-200 bg-prairie-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-prairie-800">{companyInfo?.ownerName || "Owner/Operator"} - {companyInfo?.ownerTitle || "Owner/Operator"}</CardTitle>
                  <CardDescription>{companyInfo?.companyName || "Prairie Mobile Fuel Services"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1 border-prairie-300 text-prairie-700 hover:bg-prairie-100"
                      onClick={() => window.location.href = `tel:${companyInfo?.companyPhone || '403-430-0390'}`}
                      data-testid="button-call-owner"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      {companyInfo?.companyPhone || "403-430-0390"}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1 border-prairie-300 text-prairie-700 hover:bg-prairie-100"
                      onClick={() => window.location.href = `mailto:${companyInfo?.ownerEmail || COMPANY_EMAILS.OWNER}`}
                      data-testid="button-email-owner"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </Button>
                  </div>
                  <p className="text-xs text-prairie-600 mt-2">
                    <strong>When to contact:</strong> Operational issues, scheduling problems, customer concerns, equipment issues, or any situation requiring management decision.
                  </p>
                </CardContent>
              </Card>

              <div className="text-xs text-slate-500 text-center p-2 bg-slate-50 rounded">
                <strong>TDG ERG Guide 128</strong> - For gasoline and diesel fuel emergency response procedures
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEmergencyDialog(false)} data-testid="button-close-emergency">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OwnerShell>
  );
}
