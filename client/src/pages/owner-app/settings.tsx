import { useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "next-themes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { Settings, Radio, Home, LayoutDashboard, Sun, Moon, LogOut, UserCircle } from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import OpsNotifications from "@/pages/ops/notifications";
import DriverManagement from "@/pages/ops/driver-management";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const { preferences, setPreference } = usePreferences();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const isDark = theme === 'dark';
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  const handleLogout = () => {
    logout();
    navigate('/');
  };

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

  return (
    <OwnerShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure your business and app preferences</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
            <TabsTrigger value="notifications" data-testid="tab-notifications">Notifications</TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>
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
                  <LayoutDashboard className="w-5 h-5" />
                  Quick Navigation
                </CardTitle>
                <CardDescription>Switch between different views</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3"
                  onClick={() => navigate('/customer')}
                  data-testid="button-customer-view"
                >
                  <Home className="w-4 h-4" />
                  Customer View
                  <span className="text-xs text-muted-foreground ml-auto">See app as a customer</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3"
                  onClick={() => navigate('/ops')}
                  data-testid="button-full-dashboard"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Full Operations Dashboard
                  <span className="text-xs text-muted-foreground ml-auto">Legacy ops view</span>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  App Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-switch to Delivering Mode on mobile</Label>
                    <p className="text-sm text-muted-foreground">Automatically switch to operator view on small screens</p>
                  </div>
                  <Switch 
                    checked={preferences.autoSwitchOnMobile}
                    onCheckedChange={(checked) => setPreference('autoSwitchOnMobile', checked)}
                    data-testid="switch-auto-mobile"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Default Shell</Label>
                    <p className="text-sm text-muted-foreground">Which view to show by default</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPreference('preferredShell', preferences.preferredShell === 'owner' ? 'operator' : 'owner')}
                    data-testid="button-toggle-shell"
                  >
                    {preferences.preferredShell === 'owner' ? 'Owner Mode' : 'Delivering Mode'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                  Appearance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Dark Mode</Label>
                    <p className="text-sm text-muted-foreground">Toggle between light and dark theme</p>
                  </div>
                  <Switch 
                    checked={isDark}
                    onCheckedChange={toggleTheme}
                    data-testid="switch-dark-mode"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <UserCircle className="w-5 h-5" />
                  Account
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="destructive" 
                  onClick={handleLogout}
                  data-testid="button-sign-out"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
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
        </Tabs>
      </div>
    </OwnerShell>
  );
}
