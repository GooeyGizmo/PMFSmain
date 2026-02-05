import { useState, useEffect } from 'react';
import { useSearch } from 'wouter';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Car, MapPin, Package, Plus, Pencil, Trash2, Star, Loader2 } from 'lucide-react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { usePreferences } from '@/hooks/use-preferences';
import { useVehicles } from '@/lib/api-hooks';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';

import Vehicles from '@/pages/customer/vehicles';

interface UserAddress {
  id: string;
  userId: string;
  label: string;
  address: string;
  city: string;
  isDefault: boolean;
  latitude: string | null;
  longitude: string | null;
  createdAt: string;
}

function AddressesContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);
  const [form, setForm] = useState({
    label: '',
    address: '',
    city: '',
  });

  const { data: addressesData, isLoading } = useQuery<{ addresses: UserAddress[] }>({
    queryKey: ['/api/addresses'],
  });
  const addresses = addressesData?.addresses || [];
  const [hasAutoCreated, setHasAutoCreated] = useState(false);

  const autoCreateFromProfileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/addresses', {
        label: 'Default Address',
        address: user?.defaultAddress || '',
        city: user?.defaultCity || '',
        isDefault: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/addresses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
  });

  useEffect(() => {
    if (!isLoading && !hasAutoCreated && addresses.length === 0 && user?.defaultAddress && user?.defaultCity) {
      setHasAutoCreated(true);
      autoCreateFromProfileMutation.mutate();
    }
  }, [isLoading, addresses.length, user?.defaultAddress, user?.defaultCity, hasAutoCreated]);

  const resetForm = () => {
    setForm({ label: '', address: '', city: '' });
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest('POST', '/api/addresses', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Address added successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/addresses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setIsAddOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) => {
      const res = await apiRequest('PATCH', `/api/addresses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Address updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/addresses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setEditingAddress(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/addresses/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Address deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/addresses'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/addresses/${id}/set-default`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Default address updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/addresses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    if (editingAddress) {
      updateMutation.mutate({ id: editingAddress.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const openEdit = (addr: UserAddress) => {
    setEditingAddress(addr);
    setForm({
      label: addr.label,
      address: addr.address,
      city: addr.city,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="py-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-semibold text-foreground">Delivery Addresses</h3>
          <p className="text-sm text-muted-foreground">Saved locations for fuel deliveries</p>
        </div>
        <Button className="bg-copper hover:bg-copper/90" onClick={() => { resetForm(); setIsAddOpen(true); }} data-testid="add-address-btn">
          <Plus className="w-4 h-4 mr-2" />
          Add Address
        </Button>
      </div>

      {addresses.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="mb-4">No saved addresses yet</p>
              <Button className="bg-copper hover:bg-copper/90" onClick={() => { resetForm(); setIsAddOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Address
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {addresses.map((addr) => (
            <Card key={addr.id} className={cn("border-border", addr.isDefault && "border-copper/50")}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      addr.isDefault ? "bg-copper/20" : "bg-muted"
                    )}>
                      {addr.isDefault ? (
                        <Star className="w-5 h-5 text-copper fill-current" />
                      ) : (
                        <MapPin className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {addr.isDefault ? (
                          <Badge className="bg-copper/20 text-copper text-sm font-medium">
                            <Star className="w-3 h-3 mr-1 fill-current" />
                            Default Address
                          </Badge>
                        ) : (
                          <span className="font-medium">{addr.label}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{addr.address}</p>
                      <p className="text-xs text-muted-foreground">{addr.city}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!addr.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultMutation.mutate(addr.id)}
                        disabled={setDefaultMutation.isPending}
                        data-testid={`set-default-${addr.id}`}
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(addr)}
                      data-testid={`edit-address-${addr.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {addresses.length > 1 && !addr.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this address?')) {
                            deleteMutation.mutate(addr.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`delete-address-${addr.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isAddOpen || !!editingAddress} onOpenChange={(open) => {
        if (!open) {
          setIsAddOpen(false);
          setEditingAddress(null);
          resetForm();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAddress ? 'Edit Address' : 'Add New Address'}</DialogTitle>
            <DialogDescription>
              {editingAddress ? 'Update your saved address' : 'Add a new delivery address'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                placeholder="e.g. Home, Work, Farm"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                data-testid="input-address-label"
              />
            </div>
            <div>
              <Label htmlFor="address">Street Address</Label>
              <Input
                id="address"
                placeholder="123 Main St"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                data-testid="input-address-street"
              />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="Calgary, AB"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                data-testid="input-address-city"
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!form.label || !form.address || !form.city || createMutation.isPending || updateMutation.isPending}
              className="w-full"
              data-testid="submit-address-btn"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingAddress ? 'Update Address' : 'Add Address'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MyStuffPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get('tab') || 'vehicles';
  
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
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
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
              <Vehicles embedded filter="vehicles" />
            </TabsContent>

            <TabsContent value="addresses" className="mt-4">
              <AddressesContent />
            </TabsContent>

            <TabsContent value="equipment" className="mt-4">
              <Vehicles embedded filter="equipment" />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </AppShell>
  );
}
