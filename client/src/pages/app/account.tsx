import { useState, useEffect } from 'react';
import { useSearch, Link } from 'wouter';
import { motion } from 'framer-motion';
import { CreditCard, User, Settings, Wallet, Star, HelpCircle, RefreshCw, LayoutDashboard, Bell } from 'lucide-react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { usePreferences } from '@/hooks/use-preferences';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import Subscription from '@/pages/customer/subscription';
import Profile from '@/pages/customer/profile';
import PaymentMethods from '@/pages/customer/payment-methods';
import Rewards from '@/pages/customer/referrals';
import Help from '@/pages/customer/help';
import Recurring from '@/pages/customer/recurring';
import Notifications from '@/pages/customer/notifications';

function PreferencesContent() {
  const { preferences, resetPreferences } = usePreferences();
  const { isAdmin } = useAuth();
  
  return (
    <div className="py-4">
      <div className="space-y-4">
        <div className="p-4 rounded-lg border bg-muted/30">
          <h3 className="font-medium mb-2">Saved Preferences</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Your app remembers your choices to make ordering faster.
          </p>
          <button 
            onClick={resetPreferences}
            className="text-sm text-destructive hover:underline"
          >
            Reset all preferences
          </button>
        </div>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5" />
                Quick Navigation
              </CardTitle>
              <CardDescription>Switch between different views</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/owner">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3"
                  data-testid="button-back-to-dashboard"
                >
                  <Settings className="w-4 h-4" />
                  Back to Dashboard
                  <span className="text-xs text-muted-foreground ml-auto">Return to owner view</span>
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get('tab') || 'preferences';
  
  const [activeTab, setActiveTab] = useState(tabParam);
  const layout = useLayoutMode();
  const { setPreference } = usePreferences();

  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setPreference('lastAccountTab', value);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <AppShell forceShell="customer">
      <div className={cn(
        "max-w-4xl mx-auto px-4 py-6",
        layout.isCompact && "px-3 py-4"
      )}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your preferences, profile, and billing
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
              <TabsTrigger value="preferences" className="gap-2" data-testid="tab-preferences">
                <Settings className="w-4 h-4" />
                <span>Preferences</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-2" data-testid="tab-profile">
                <User className="w-4 h-4" />
                <span>Profile</span>
              </TabsTrigger>
              <TabsTrigger value="subscription" className="gap-2" data-testid="tab-subscription">
                <CreditCard className="w-4 h-4" />
                <span>Subscription</span>
              </TabsTrigger>
              <TabsTrigger value="billing" className="gap-2" data-testid="tab-billing">
                <Wallet className="w-4 h-4" />
                <span>Payment Methods</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2" data-testid="tab-notifications">
                <Bell className="w-4 h-4" />
                <span>Notifications</span>
              </TabsTrigger>
              <TabsTrigger value="recurring" className="gap-2" data-testid="tab-recurring">
                <RefreshCw className="w-4 h-4" />
                <span>Recurring</span>
              </TabsTrigger>
              <TabsTrigger value="rewards" className="gap-2" data-testid="tab-rewards">
                <Star className="w-4 h-4" />
                <span>Rewards</span>
              </TabsTrigger>
              <TabsTrigger value="support" className="gap-2" data-testid="tab-support">
                <HelpCircle className="w-4 h-4" />
                <span>Support</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4">
              <Profile />
            </TabsContent>

            <TabsContent value="subscription" className="mt-4">
              <Subscription />
            </TabsContent>

            <TabsContent value="billing" className="mt-4">
              <PaymentMethods />
            </TabsContent>

            <TabsContent value="notifications" className="mt-4">
              <Notifications />
            </TabsContent>

            <TabsContent value="recurring" className="mt-4">
              <Recurring />
            </TabsContent>

            <TabsContent value="preferences" className="mt-4">
              <PreferencesContent />
            </TabsContent>

            <TabsContent value="rewards" className="mt-4">
              <Rewards />
            </TabsContent>

            <TabsContent value="support" className="mt-4">
              <Help />
            </TabsContent>

          </Tabs>
        </motion.div>
      </div>
    </AppShell>
  );
}
