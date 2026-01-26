import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { OwnerShell } from "@/components/app-shell/owner-shell";
import { Settings } from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";
import OpsNotifications from "@/pages/ops/notifications";
import DriverManagement from "@/pages/ops/driver-management";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
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
