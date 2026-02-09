import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { Input } from "@/components/ui/input";
import { Settings, Radio, Home, LayoutDashboard, Building, Phone, Mail, MapPin, User, Save, Loader2, Bell, UsersRound, Construction, AlertCircle, ChevronRight, Fuel, CreditCard, FileText, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import OpsNotifications from "@/pages/ops/notifications";
import DriverManagement from "@/pages/ops/driver-management";

export default function SettingsPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get("tab");
  const validTabs = ["general", "notifications", "team", "dev-notes"];
  const initialTab = tabParam && validTabs.includes(tabParam) ? tabParam : "general";
  const [activeTab, setActiveTab] = useState(initialTab);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const { data: launchModeData } = useQuery({
    queryKey: ['/api/ops/launch-mode'],
    queryFn: async () => {
      const res = await fetch('/api/ops/launch-mode');
      if (!res.ok) throw new Error('Failed to fetch launch mode');
      return res.json();
    },
  });

  const launchModeMutation = useMutation({
    mutationFn: async (mode: 'live' | 'test') => {
      const res = await fetch('/api/ops/launch-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update launch mode');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/launch-mode'] });
      toast({ 
        title: data.isLive ? 'App is LIVE!' : 'App in TEST mode',
        description: data.message 
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Company Information
  const { data: companyInfo } = useQuery({
    queryKey: ['/api/company-info'],
    queryFn: async () => {
      const res = await fetch('/api/company-info');
      if (!res.ok) throw new Error('Failed to fetch company info');
      return res.json();
    },
  });

  const [companyForm, setCompanyForm] = useState({
    companyName: '',
    companyPhone: '',
    companyEmail: '',
    companyAddress: '',
    ownerName: '',
    ownerEmail: '',
    ownerTitle: '',
  });

  // Hydrate form when company info loads
  const [formHydrated, setFormHydrated] = useState(false);
  
  useEffect(() => {
    if (companyInfo && !formHydrated) {
      setCompanyForm({
        companyName: companyInfo.companyName || '',
        companyPhone: companyInfo.companyPhone || '',
        companyEmail: companyInfo.companyEmail || '',
        companyAddress: companyInfo.companyAddress || '',
        ownerName: companyInfo.ownerName || '',
        ownerEmail: companyInfo.ownerEmail || '',
        ownerTitle: companyInfo.ownerTitle || '',
      });
      setFormHydrated(true);
    }
  }, [companyInfo, formHydrated]);

  const companyMutation = useMutation({
    mutationFn: async (data: typeof companyForm) => {
      const settings = Object.entries(data).map(([key, value]) => ({ key, value }));
      const res = await fetch('/api/ops/settings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error('Failed to save company info');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-info'] });
      toast({ title: 'Saved', description: 'Company information updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <OwnerShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure your business and app preferences</p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          const url = new URL(window.location.href);
          url.searchParams.set('tab', value);
          window.history.replaceState({}, '', url.toString());
        }}>
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="general" className="gap-2" data-testid="tab-general">
              <Settings className="w-4 h-4" />
              <span>General</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2" data-testid="tab-notifications">
              <Bell className="w-4 h-4" />
              <span>Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2" data-testid="tab-team">
              <UsersRound className="w-4 h-4" />
              <span>Team</span>
            </TabsTrigger>
            <TabsTrigger value="dev-notes" className="gap-2" data-testid="tab-dev-notes">
              <Construction className="w-4 h-4" />
              <span>Dev Notes</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="w-5 h-5" />
                  Launch Mode
                </CardTitle>
                <CardDescription>Control public access to your app</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>App Status</Label>
                    <p className="text-sm text-muted-foreground">
                      {launchModeData?.isLive ? 'Public access enabled' : 'Staff only access'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={launchModeData?.isLive ? 'default' : 'secondary'} 
                      className={launchModeData?.isLive ? 'bg-sage text-white' : 'bg-amber-100 text-amber-800'}
                    >
                      {launchModeData?.isLive ? 'LIVE' : 'TEST'}
                    </Badge>
                    <Switch
                      checked={launchModeData?.isLive || false}
                      onCheckedChange={(checked) => launchModeMutation.mutate(checked ? 'live' : 'test')}
                      disabled={launchModeMutation.isPending}
                      data-testid="switch-launch-mode"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="w-5 h-5" />
                  Company Information
                </CardTitle>
                <CardDescription>Business details shown on documents and communications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="flex items-center gap-2">
                      <Building className="w-4 h-4" />
                      Company Name
                    </Label>
                    <Input
                      id="companyName"
                      value={companyForm.companyName}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, companyName: e.target.value }))}
                      placeholder="Prairie Mobile Fuel Services"
                      data-testid="input-company-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone" className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Company Phone
                    </Label>
                    <Input
                      id="companyPhone"
                      value={companyForm.companyPhone}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, companyPhone: e.target.value }))}
                      placeholder="403-430-0390"
                      data-testid="input-company-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail" className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Company Email
                    </Label>
                    <Input
                      id="companyEmail"
                      type="email"
                      value={companyForm.companyEmail}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, companyEmail: e.target.value }))}
                      placeholder="info@prairiemobilefuel.ca"
                      data-testid="input-company-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyAddress" className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Company Address
                    </Label>
                    <Input
                      id="companyAddress"
                      value={companyForm.companyAddress}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, companyAddress: e.target.value }))}
                      placeholder="Calgary, Alberta"
                      data-testid="input-company-address"
                    />
                  </div>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ownerName" className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Owner Name
                    </Label>
                    <Input
                      id="ownerName"
                      value={companyForm.ownerName}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, ownerName: e.target.value }))}
                      placeholder="Levi Ernst"
                      data-testid="input-owner-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ownerEmail" className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Owner Email
                    </Label>
                    <Input
                      id="ownerEmail"
                      type="email"
                      value={companyForm.ownerEmail}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, ownerEmail: e.target.value }))}
                      placeholder="owner@prairiemobilefuel.ca"
                      data-testid="input-owner-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ownerTitle" className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Owner Title
                    </Label>
                    <Input
                      id="ownerTitle"
                      value={companyForm.ownerTitle}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, ownerTitle: e.target.value }))}
                      placeholder="Owner/Operator"
                      data-testid="input-owner-title"
                    />
                  </div>
                </div>

                <Button
                  onClick={() => companyMutation.mutate(companyForm)}
                  disabled={companyMutation.isPending}
                  className="w-full md:w-auto"
                  data-testid="button-save-company"
                >
                  {companyMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Company Information
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutDashboard className="w-5 h-5" />
                  Quick Navigation
                </CardTitle>
                <CardDescription>Switch between different views</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3"
                  onClick={() => navigate('/app')}
                  data-testid="button-customer-view"
                >
                  <Home className="w-4 h-4" />
                  Customer View
                  <span className="text-xs text-muted-foreground ml-auto">See app as a customer</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3"
                  onClick={() => navigate('/operator')}
                  data-testid="button-operator-view"
                >
                  <Truck className="w-4 h-4" />
                  Driver/Operator View
                  <span className="text-xs text-muted-foreground ml-auto">See app as a driver/operator</span>
                </Button>
              </CardContent>
            </Card>

          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <OpsNotifications embedded />
          </TabsContent>

          <TabsContent value="team" className="mt-4">
            <DriverManagement embedded />
          </TabsContent>

          <TabsContent value="dev-notes" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Construction className="w-5 h-5" />
                  Pages Pending Migration
                </CardTitle>
                <CardDescription>Features still being built or migrated. Use this to track what needs finishing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border p-4 flex items-start gap-3" data-testid="dev-note-emergency">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Emergency & After-Hours Services</div>
                    <p className="text-sm text-muted-foreground mt-1">Emergency fuel delivery, lockout assistance, boost services. Currently shows "Coming Soon" in Business tab. Needs full implementation: service selection, pricing, booking flow, operator dispatch.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">Pending</Badge>
                </div>
                <div className="rounded-lg border p-4 flex items-start gap-3" data-testid="dev-note-recurring">
                  <Fuel className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Recurring Delivery Automation</div>
                    <p className="text-sm text-muted-foreground mt-1">Auto-scheduling of weekly/bi-weekly/monthly deliveries. Customer can set up recurring orders but the automated dispatch and charging flow needs completion.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">In Progress</Badge>
                </div>
                <div className="rounded-lg border p-4 flex items-start gap-3" data-testid="dev-note-stripe-bookkeeping">
                  <CreditCard className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Stripe Bookkeeping Reconciliation</div>
                    <p className="text-sm text-muted-foreground mt-1">Stripe-led financial tracking with ledger entries, webhook integration, and automated reconciliation against internal records.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">In Progress</Badge>
                </div>
                <div className="rounded-lg border p-4 flex items-start gap-3" data-testid="dev-note-cra-reports">
                  <FileText className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">CRA Report Generation</div>
                    <p className="text-sm text-muted-foreground mt-1">T2125, CCA schedule, GST34 filing — report export/PDF generation for accountant handoff.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">In Progress</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OwnerShell>
  );
}
