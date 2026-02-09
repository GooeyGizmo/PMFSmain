import { useState } from "react";
import { OperatorShell } from "@/components/app-shell/operator-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { User, Mail, Phone, Truck, FileText, Shield, Key, Star, Clock, CheckCircle2, AlertCircle, Loader2, LayoutDashboard, Users, Home, Settings, Bell } from "lucide-react";
import { format, parseISO, isValid, differenceInDays } from "date-fns";
import NotificationsHub from "@/pages/app/notifications-hub";

interface DriverRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  driversLicenseNumber?: string;
  driversLicenseIssueDate?: string;
  driversLicenseExpiryDate?: string;
  tdgCertificateNumber?: string;
  tdgCertificateIssueDate?: string;
  tdgCertificateExpiryDate?: string;
  lockoutLicenseNumber?: string;
  lockoutLicenseIssueDate?: string;
  lockoutLicenseExpiryDate?: string;
  assignedTruckId?: string;
  assignedTruck?: {
    id: string;
    unitNumber: string;
    name?: string;
    make: string;
    model: string;
  };
  rating?: string;
  totalDeliveries: number;
  isActive: boolean;
  createdAt: string;
}

function CertBadge({ expiryDate }: { expiryDate?: string }) {
  if (!expiryDate) return <Badge variant="outline" className="text-muted-foreground">Not set</Badge>;
  const parsed = parseISO(expiryDate);
  if (!isValid(parsed)) return <Badge variant="outline" className="text-muted-foreground">Not set</Badge>;
  const daysLeft = differenceInDays(parsed, new Date());
  if (daysLeft < 0) return <Badge variant="destructive">Expired</Badge>;
  if (daysLeft < 30) return <Badge className="bg-amber-500 text-white">Expiring Soon</Badge>;
  return <Badge className="bg-green-600 text-white">Valid</Badge>;
}

export default function OperatorSettingsPage() {
  const { user, isOwner, isAdmin } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get("tab");
  const validTabs = ["general", "notifications"];
  const initialTab = tabParam && validTabs.includes(tabParam) ? tabParam : "general";
  const [activeTab, setActiveTab] = useState(initialTab);

  const { data: driversData, isLoading } = useQuery<{ drivers: DriverRecord[] }>({
    queryKey: ['/api/ops/driver-management'],
  });

  const myDriver = driversData?.drivers?.find(
    d => d.email === user?.email || `${d.firstName} ${d.lastName}` === user?.name
  );

  return (
    <OperatorShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Your driver profile and credentials</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="general" className="gap-2" data-testid="tab-general">
              <Settings className="w-4 h-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2" data-testid="tab-notifications">
              <Bell className="w-4 h-4" />
              Notifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-6">
            <Card data-testid="card-profile-info">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-copper/10 flex items-center justify-center">
                      <User className="w-7 h-7 text-copper" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-display" data-testid="text-user-name">{user?.name}</CardTitle>
                      {myDriver?.rating && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span className="text-sm text-muted-foreground">{parseFloat(myDriver.rating).toFixed(1)} rating</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge className={myDriver?.isActive !== false ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}>
                    {myDriver?.isActive !== false ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span data-testid="text-user-email">{user?.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span data-testid="text-user-phone">{myDriver?.phone || user?.phone || 'Not set'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Truck className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span data-testid="text-assigned-truck">
                      {myDriver?.assignedTruck 
                        ? `Unit #${myDriver.assignedTruck.unitNumber} - ${myDriver.assignedTruck.make} ${myDriver.assignedTruck.model}`
                        : 'No truck assigned'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-border pt-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Credentials & Certifications</h3>

                  {isLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span>Driver's License</span>
                        </div>
                        <CertBadge expiryDate={myDriver?.driversLicenseExpiryDate} />
                      </div>
                      {myDriver?.driversLicenseNumber && (
                        <p className="text-xs text-muted-foreground ml-6">
                          #{myDriver.driversLicenseNumber}
                          {myDriver.driversLicenseExpiryDate && ` · Expires ${format(parseISO(myDriver.driversLicenseExpiryDate), 'MMM d, yyyy')}`}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          <Shield className="w-4 h-4 text-muted-foreground" />
                          <span>TDG Certificate</span>
                        </div>
                        <CertBadge expiryDate={myDriver?.tdgCertificateExpiryDate} />
                      </div>
                      {myDriver?.tdgCertificateNumber && (
                        <p className="text-xs text-muted-foreground ml-6">
                          #{myDriver.tdgCertificateNumber}
                          {myDriver.tdgCertificateExpiryDate && ` · Expires ${format(parseISO(myDriver.tdgCertificateExpiryDate), 'MMM d, yyyy')}`}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          <Key className="w-4 h-4 text-muted-foreground" />
                          <span>Lockout License</span>
                        </div>
                        <CertBadge expiryDate={myDriver?.lockoutLicenseExpiryDate} />
                      </div>
                      {myDriver?.lockoutLicenseNumber && (
                        <p className="text-xs text-muted-foreground ml-6">
                          #{myDriver.lockoutLicenseNumber}
                          {myDriver.lockoutLicenseExpiryDate && ` · Expires ${format(parseISO(myDriver.lockoutLicenseExpiryDate), 'MMM d, yyyy')}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>Total Deliveries</span>
                    </div>
                    <span className="text-sm font-medium" data-testid="text-delivery-count">
                      {myDriver?.totalDeliveries ?? 0}
                    </span>
                  </div>
                  {myDriver?.createdAt && (
                    <p className="text-xs text-muted-foreground mt-2 ml-6">
                      Added {format(parseISO(myDriver.createdAt), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {(isOwner || isAdmin) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutDashboard className="w-5 h-5" />
                    Quick Navigation
                  </CardTitle>
                  <CardDescription>Switch between different views</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3"
                    onClick={() => navigate("/owner")}
                    data-testid="button-back-to-dashboard"
                  >
                    <Settings className="w-4 h-4" />
                    Back to Dashboard
                    <span className="text-xs text-muted-foreground ml-auto">Return to owner view</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3"
                    onClick={() => navigate("/app")}
                    data-testid="button-customer-view"
                  >
                    <Home className="w-4 h-4" />
                    Customer View
                    <span className="text-xs text-muted-foreground ml-auto">See app as a customer</span>
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <NotificationsHub embedded forceCategories={['operations', 'driver']} showSettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </OperatorShell>
  );
}
