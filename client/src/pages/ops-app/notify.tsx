import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OperatorShell } from "@/components/app-shell/operator-shell";
import { Bell, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

export default function NotifyPage() {
  const [activeTab, setActiveTab] = useState("notifications");
  const [, navigate] = useLocation();

  return (
    <OperatorShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">Send notifications and manage communication</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="notifications" data-testid="tab-notifications">
              Send Notifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-copper/20 flex items-center justify-center">
                  <Bell className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <h3 className="font-medium text-lg">Send Notifications</h3>
                  <p className="text-muted-foreground">Send push notifications to customers</p>
                </div>
                <Button onClick={() => navigate("/ops/notifications")} data-testid="button-open-notifications">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Notifications
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OperatorShell>
  );
}
