import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { motion } from 'framer-motion';
import { Car, MapPin, Package } from 'lucide-react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { usePreferences } from '@/hooks/use-preferences';
import { AppShell } from '@/components/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import Vehicles from '@/pages/customer/vehicles';

function AddressesContent() {
  return (
    <div className="py-4">
      <div className="text-center py-12 text-muted-foreground">
        <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Address management coming soon</p>
        <p className="text-sm mt-1">Your delivery addresses will appear here</p>
      </div>
    </div>
  );
}

function EquipmentContent() {
  return (
    <div className="py-4">
      <div className="text-center py-12 text-muted-foreground">
        <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Equipment management coming soon</p>
        <p className="text-sm mt-1">Generators, boats, and other fuel-consuming equipment</p>
      </div>
    </div>
  );
}

export default function MyStuffPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get('tab') || 'vehicles';
  
  const [activeTab, setActiveTab] = useState(tabParam);
  const layout = useLayoutMode();
  const { preferences, setPreference } = usePreferences();

  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setPreference('lastMyStuffTab', value);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <AppShell forceShell="customer">
      <div className={cn(
        "max-w-6xl mx-auto px-4 py-6",
        layout.isCompact && "px-3 py-4"
      )}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold text-foreground">
              My Stuff
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your vehicles, addresses, and equipment
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className={cn(
              "w-full justify-start",
              layout.isCompact && "overflow-x-auto"
            )}>
              <TabsTrigger value="vehicles" className="gap-2" data-testid="tab-vehicles">
                <Car className="w-4 h-4" />
                <span>Vehicles</span>
              </TabsTrigger>
              <TabsTrigger value="addresses" className="gap-2" data-testid="tab-addresses">
                <MapPin className="w-4 h-4" />
                <span>Addresses</span>
              </TabsTrigger>
              <TabsTrigger value="equipment" className="gap-2" data-testid="tab-equipment">
                <Package className="w-4 h-4" />
                <span>Equipment</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="vehicles" className="mt-4">
              <Vehicles embedded />
            </TabsContent>

            <TabsContent value="addresses" className="mt-4">
              <AddressesContent />
            </TabsContent>

            <TabsContent value="equipment" className="mt-4">
              <EquipmentContent />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </AppShell>
  );
}
