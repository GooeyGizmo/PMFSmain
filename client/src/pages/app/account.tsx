import { useState, useEffect } from 'react';
import { useSearch } from 'wouter';
import { motion } from 'framer-motion';
import { CreditCard, User, Settings, Wallet, Star } from 'lucide-react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { usePreferences } from '@/hooks/use-preferences';
import { AppShell } from '@/components/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import Subscription from '@/pages/customer/subscription';
import Profile from '@/pages/customer/profile';
import PaymentMethods from '@/pages/customer/payment-methods';
import Rewards from '@/pages/customer/referrals';

function PreferencesContent() {
  const { preferences, resetPreferences } = usePreferences();
  
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
      </div>
    </div>
  );
}

export default function AccountPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get('tab') || 'profile';
  
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
              Account
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your profile, subscription, and billing
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className={cn(
              "w-full justify-start",
              layout.isCompact && "overflow-x-auto flex-nowrap"
            )}>
              <TabsTrigger value="profile" className="gap-2" data-testid="tab-profile">
                <User className="w-4 h-4" />
                <span className={layout.isCompact ? "hidden sm:inline" : ""}>Profile</span>
              </TabsTrigger>
              <TabsTrigger value="subscription" className="gap-2" data-testid="tab-subscription">
                <CreditCard className="w-4 h-4" />
                <span className={layout.isCompact ? "hidden sm:inline" : ""}>Subscription</span>
              </TabsTrigger>
              <TabsTrigger value="billing" className="gap-2" data-testid="tab-billing">
                <Wallet className="w-4 h-4" />
                <span className={layout.isCompact ? "hidden sm:inline" : ""}>Billing</span>
              </TabsTrigger>
              <TabsTrigger value="preferences" className="gap-2" data-testid="tab-preferences">
                <Settings className="w-4 h-4" />
                <span className={layout.isCompact ? "hidden sm:inline" : ""}>Preferences</span>
              </TabsTrigger>
              <TabsTrigger value="rewards" className="gap-2" data-testid="tab-rewards">
                <Star className="w-4 h-4" />
                <span className={layout.isCompact ? "hidden sm:inline" : ""}>Rewards</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4">
              <Profile embedded />
            </TabsContent>

            <TabsContent value="subscription" className="mt-4">
              <Subscription embedded />
            </TabsContent>

            <TabsContent value="billing" className="mt-4">
              <PaymentMethods embedded />
            </TabsContent>

            <TabsContent value="preferences" className="mt-4">
              <PreferencesContent />
            </TabsContent>

            <TabsContent value="rewards" className="mt-4">
              <Rewards embedded />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </AppShell>
  );
}
