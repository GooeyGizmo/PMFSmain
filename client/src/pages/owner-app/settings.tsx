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
import { Settings, Radio, Home, LayoutDashboard, Building, Phone, Mail, MapPin, User, Save, Loader2, Bell, UsersRound, Construction, AlertCircle, ChevronRight, Fuel, CreditCard, FileText, Truck, CheckCircle2, Clock, CloudSun, Route, Shield, Receipt, Calculator, BarChart3 } from "lucide-react";
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

  const { data: waitlistModeData } = useQuery({
    queryKey: ['/api/ops/waitlist-mode'],
    queryFn: async () => {
      const res = await fetch('/api/ops/waitlist-mode', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch waitlist mode');
      return res.json();
    },
  });

  const waitlistModeMutation = useMutation({
    mutationFn: async (mode: 'on' | 'off') => {
      const res = await fetch('/api/ops/waitlist-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update waitlist mode');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/waitlist-mode'] });
      toast({ 
        title: data.isWaitlistActive ? 'Waitlist Active' : 'Waitlist Off',
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
                  <UsersRound className="w-5 h-5" />
                  Waitlist Mode
                </CardTitle>
                <CardDescription>Control whether visitors see the waitlist signup or normal homepage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Homepage Display</Label>
                    <p className="text-sm text-muted-foreground">
                      {waitlistModeData?.isWaitlistActive ? 'Showing waitlist signup page' : 'Showing normal homepage'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={waitlistModeData?.isWaitlistActive ? 'default' : 'secondary'} 
                      className={waitlistModeData?.isWaitlistActive ? 'bg-copper text-white' : ''}
                    >
                      {waitlistModeData?.isWaitlistActive ? 'WAITLIST' : 'NORMAL'}
                    </Badge>
                    <Switch
                      checked={waitlistModeData?.isWaitlistActive || false}
                      onCheckedChange={(checked) => waitlistModeMutation.mutate(checked ? 'on' : 'off')}
                      disabled={waitlistModeMutation.isPending}
                      data-testid="switch-waitlist-mode"
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

          <TabsContent value="dev-notes" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Completed Features
                </CardTitle>
                <CardDescription>Features that are fully built and operational.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 flex items-start gap-3" data-testid="dev-note-orders">
                  <Fuel className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Multi-Vehicle Order Management</div>
                    <p className="text-sm text-muted-foreground mt-1">Full booking flow with multi-vehicle support, per-vehicle fuel type/amount, fill-to-full, and VIP auto-fill. Quick re-order for frequent combinations.</p>
                  </div>
                  <Badge className="shrink-0 bg-green-100 text-green-700 border-green-300">Done</Badge>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 flex items-start gap-3" data-testid="dev-note-payments">
                  <CreditCard className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Stripe Payment System</div>
                    <p className="text-sm text-muted-foreground mt-1">Pre-authorization with smart tank-based estimates, capture on delivery, subscription billing with proration, and payment failure handling with 3-day grace period.</p>
                  </div>
                  <Badge className="shrink-0 bg-green-100 text-green-700 border-green-300">Done</Badge>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 flex items-start gap-3" data-testid="dev-note-routing">
                  <Route className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Route Optimization & Fuel Guardrails</div>
                    <p className="text-sm text-muted-foreground mt-1">OSRM-based route optimization with ETA, fuel capacity validation, depot refuel detection, and route start enforcement.</p>
                  </div>
                  <Badge className="shrink-0 bg-green-100 text-green-700 border-green-300">Done</Badge>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 flex items-start gap-3" data-testid="dev-note-recurring">
                  <Clock className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Recurring Delivery Automation</div>
                    <p className="text-sm text-muted-foreground mt-1">Auto-scheduling of weekly/bi-weekly/monthly deliveries with automated order creation, payment processing, and next-date calculation. Runs daily at 5 AM Calgary time.</p>
                  </div>
                  <Badge className="shrink-0 bg-green-100 text-green-700 border-green-300">Done</Badge>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 flex items-start gap-3" data-testid="dev-note-pretripinspections">
                  <Shield className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Pre-Trip Inspections</div>
                    <p className="text-sm text-muted-foreground mt-1">Daily pre-trip inspection forms for trucks with compliance tracking, visible on fleet page.</p>
                  </div>
                  <Badge className="shrink-0 bg-green-100 text-green-700 border-green-300">Done</Badge>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 flex items-start gap-3" data-testid="dev-note-invoices">
                  <Receipt className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">CRA-Compliant Invoices</div>
                    <p className="text-sm text-muted-foreground mt-1">Auto-generated sequential invoices on order completion with business info, GST registration, line items, and PDF export.</p>
                  </div>
                  <Badge className="shrink-0 bg-green-100 text-green-700 border-green-300">Done</Badge>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 flex items-start gap-3" data-testid="dev-note-ledger">
                  <BarChart3 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Financial Ledger & 9-Bucket System</div>
                    <p className="text-sm text-muted-foreground mt-1">Ledger entries, financial accounts with allocation rules, Cash Flow Waterfall, Freedom Runway Tracker, and weekly close doctrine.</p>
                  </div>
                  <Badge className="shrink-0 bg-green-100 text-green-700 border-green-300">Done</Badge>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 flex items-start gap-3" data-testid="dev-note-weather">
                  <CloudSun className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Weather Conditions</div>
                    <p className="text-sm text-muted-foreground mt-1">Live weather display on dashboard headers using user's location. Auto-refreshes every 15 minutes.</p>
                  </div>
                  <Badge className="shrink-0 bg-green-100 text-green-700 border-green-300">Done</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Construction className="w-5 h-5 text-amber-500" />
                  In Progress
                </CardTitle>
                <CardDescription>Features partially built — need additional work to complete.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3" data-testid="dev-note-stripe-bookkeeping">
                  <CreditCard className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Stripe Bookkeeping Reconciliation</div>
                    <p className="text-sm text-muted-foreground mt-1">Reconciliation service exists with ledger integration. Needs: automated daily sync, discrepancy alerting, and reconciliation dashboard in Finance tab.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700">In Progress</Badge>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3" data-testid="dev-note-cra-reports">
                  <FileText className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">CRA Report Export</div>
                    <p className="text-sm text-muted-foreground mt-1">CRA compliance pages, GST filing workspace, T2125, and CCA tracking are built. Needs: polished PDF export for accountant handoff and CCA depreciation calculations.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700">In Progress</Badge>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3" data-testid="dev-note-profitability">
                  <Calculator className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Profitability Calculator</div>
                    <p className="text-sm text-muted-foreground mt-1">Business waterfall model exists. Needs: integration with real financial data and scenario modeling.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700">In Progress</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  Not Started
                </CardTitle>
                <CardDescription>Features planned but not yet built.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 flex items-start gap-3" data-testid="dev-note-emergency">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Emergency & After-Hours Services</div>
                    <p className="text-sm text-muted-foreground mt-1">API endpoints for info and subscription exist. Needs: full customer booking flow, operator dispatch integration, service tracking, and after-hours pricing.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-red-400 text-red-700">Not Started</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OwnerShell>
  );
}
