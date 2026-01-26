import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { 
  Settings, 
  Bell, 
  Users,
  Shield,
  ExternalLink 
} from "lucide-react";
import { useLocation } from "wouter";
import { usePreferences } from "@/hooks/use-preferences";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [, navigate] = useLocation();
  const { preferences, setPreference } = usePreferences();

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
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                  <Bell className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Notification Settings</h3>
                  <p className="text-muted-foreground">Configure push notification preferences</p>
                </div>
                <Button onClick={() => navigate("/ops/notifications")} data-testid="button-open-notifications">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Notifications
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                  <Users className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Driver Management</h3>
                  <p className="text-muted-foreground">Manage operators and driver accounts</p>
                </div>
                <Button onClick={() => navigate("/ops/driver-management")} data-testid="button-open-drivers">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Driver Management
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OwnerShell>
  );
}
