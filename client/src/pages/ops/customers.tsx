import { useState } from 'react';
import { Link } from 'wouter';
import { useHorizontalScroll } from "@/hooks/use-horizontal-scroll";
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, User, Search, Filter, DollarSign, Calendar,
  Mail, Phone, MapPin, Car, Package, CreditCard, AlertCircle,
  ChevronUp, ChevronDown, Users, Crown, Shield, ShieldAlert, KeyRound, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import OpsLayout from '@/components/ops-layout';
import { COMPANY_EMAILS } from '@shared/schema';

interface CustomerWithStats {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subscriptionTier: string;
  defaultAddress: string | null;
  defaultCity: string | null;
  paymentBlocked: boolean;
  paymentBlockedReason: string | null;
  createdAt: string;
  totalOrders: number;
  ordersThisMonth: number;
  totalSpent: number;
}

interface CustomerDetails {
  customer: CustomerWithStats;
  vehicles: {
    id: string;
    year: string;
    make: string;
    model: string;
    color: string;
    licensePlate: string;
    fuelType: string;
    tankCapacity: number;
  }[];
  recentOrders: {
    id: string;
    scheduledDate: string;
    status: string;
    fuelType: string;
    fuelAmount: number;
    total: string;
    address: string;
    city: string;
  }[];
}

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  payg: { label: 'PAYG', color: 'bg-gray-500 text-white' },
  access: { label: 'ACCESS', color: 'bg-cyan-600 text-white' },
  household: { label: 'HOUSEHOLD', color: 'bg-sky-400 text-white' },
  rural: { label: 'RURAL', color: 'bg-green-700 text-white' },
  vip: { label: 'VIP', color: 'bg-amber-600 text-white' },
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-slate-500/10 text-slate-600',
  confirmed: 'bg-blue-500/10 text-blue-600',
  en_route: 'bg-amber-500/10 text-amber-600',
  arriving: 'bg-orange-500/10 text-orange-600',
  fueling: 'bg-purple-500/10 text-purple-600',
  completed: 'bg-green-500/10 text-green-600',
  cancelled: 'bg-red-500/10 text-red-600',
};

type SortField = 'name' | 'totalOrders' | 'totalSpent' | 'createdAt';
type SortDirection = 'asc' | 'desc';

interface OpsCustomersProps {
  embedded?: boolean;
}

export default function OpsCustomers({ embedded = false }: OpsCustomersProps) {
  const scrollRef = useHorizontalScroll();
  const { user, isOwner } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const { data: customersData, isLoading } = useQuery<{ customers: CustomerWithStats[] }>({
    queryKey: ['/api/ops/customers'],
  });

  const { data: customerDetails, isLoading: detailsLoading } = useQuery<CustomerDetails>({
    queryKey: ['/api/ops/customers', selectedCustomerId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ops/customers/${selectedCustomerId}`);
      return res.json();
    },
    enabled: !!selectedCustomerId,
  });

  const togglePaymentBlockMutation = useMutation({
    mutationFn: async ({ customerId, blocked, reason }: { customerId: string; blocked: boolean; reason?: string }) => {
      const res = await apiRequest('PATCH', `/api/ops/customers/${customerId}/payment-block`, { blocked, reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/customers'] });
      toast({
        title: 'Payment status updated',
        description: 'Customer payment status has been updated.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update payment status.',
        variant: 'destructive',
      });
    },
  });

  const changeTierMutation = useMutation({
    mutationFn: async ({ customerId, tierId }: { customerId: string; tierId: string }) => {
      const res = await apiRequest('PATCH', `/api/ops/customers/${customerId}/tier`, { tierId });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/customers', selectedCustomerId] });
      toast({
        title: 'Tier updated',
        description: data.message || 'Customer tier has been updated.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update customer tier.',
        variant: 'destructive',
      });
    },
  });

  const customers: CustomerWithStats[] = customersData?.customers || [];

  const filteredCustomers = customers
    .filter(customer => {
      const matchesSearch = searchQuery === '' ||
        customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTier = tierFilter === 'all' || customer.subscriptionTier === tierFilter;
      
      return matchesSearch && matchesTier;
    })
    .sort((a, b) => {
      let aVal: string | number = a[sortField];
      let bVal: string | number = b[sortField];
      
      if (sortField === 'createdAt') {
        aVal = new Date(a.createdAt).getTime();
        bVal = new Date(b.createdAt).getTime();
      }
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4 ml-1" /> : 
      <ChevronDown className="w-4 h-4 ml-1" />;
  };

  const content = (
    <div className={embedded ? "space-y-4" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6"}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/ops">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-display font-bold text-lg text-foreground">Customer Management</h1>
              <p className="text-sm text-muted-foreground">View and manage all customers</p>
            </div>
          </div>
          <Badge variant="outline" className="border-copper/30 text-copper">
            {customers.length} customers
          </Badge>
        </div>
      )}

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-tier-filter">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="payg">PAYG</SelectItem>
              <SelectItem value="access">ACCESS</SelectItem>
              <SelectItem value="household">HOUSEHOLD</SelectItem>
              <SelectItem value="rural">RURAL</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <div ref={scrollRef} tabIndex={0} className="overflow-x-auto scrollbar-none outline-none focus:ring-1 focus:ring-ring/30 focus:rounded" style={{ scrollbarWidth: "none" }}>
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="text-left p-4">
                      <button
                        className="flex items-center font-medium text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => handleSort('name')}
                        data-testid="button-sort-name"
                      >
                        Customer
                        <SortIcon field="name" />
                      </button>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-medium text-sm text-muted-foreground">Tier</span>
                    </th>
                    <th className="text-left p-4">
                      <button
                        className="flex items-center font-medium text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => handleSort('totalOrders')}
                        data-testid="button-sort-orders"
                      >
                        Orders
                        <SortIcon field="totalOrders" />
                      </button>
                    </th>
                    <th className="text-left p-4">
                      <button
                        className="flex items-center font-medium text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => handleSort('totalSpent')}
                        data-testid="button-sort-spent"
                      >
                        Total Spent
                        <SortIcon field="totalSpent" />
                      </button>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-medium text-sm text-muted-foreground">Payment</span>
                    </th>
                    <th className="text-left p-4">
                      <button
                        className="flex items-center font-medium text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => handleSort('createdAt')}
                        data-testid="button-sort-joined"
                      >
                        Member Since
                        <SortIcon field="createdAt" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        Loading customers...
                      </td>
                    </tr>
                  ) : filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        No customers found
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((customer, index) => (
                      <motion.tr
                        key={customer.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setSelectedCustomerId(customer.id)}
                        data-testid={`row-customer-${customer.id}`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-copper/10 flex items-center justify-center">
                              <User className="w-5 h-5 text-copper" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{customer.name}</p>
                              <p className="text-sm text-muted-foreground">{customer.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge className={TIER_LABELS[customer.subscriptionTier]?.color || ''}>
                            {TIER_LABELS[customer.subscriptionTier]?.label || customer.subscriptionTier}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <div>
                            <p className="font-medium text-foreground">{customer.totalOrders}</p>
                            <p className="text-xs text-muted-foreground">
                              {customer.ordersThisMonth} this month
                            </p>
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="font-display font-semibold text-foreground">
                            ${customer.totalSpent.toFixed(2)}
                          </p>
                        </td>
                        <td className="p-4">
                          {customer.paymentBlocked ? (
                            <Badge variant="destructive" className="gap-1">
                              <ShieldAlert className="w-3 h-3" />
                              Blocked
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-green-500/10 text-green-600 gap-1">
                              <Shield className="w-3 h-3" />
                              Active
                            </Badge>
                          )}
                        </td>
                        <td className="p-4">
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(customer.createdAt), 'MMM d, yyyy')}
                          </p>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

      <Dialog open={!!selectedCustomerId} onOpenChange={(open) => !open && setSelectedCustomerId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <User className="w-5 h-5 text-copper" />
              Customer Details
            </DialogTitle>
            <DialogDescription>
              View customer information, vehicles, and order history
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[70vh] pr-4">
            {detailsLoading ? (
              <div className="py-8 text-center text-muted-foreground">Loading...</div>
            ) : customerDetails ? (
              <div className="space-y-6">
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-copper/10 flex items-center justify-center">
                        <User className="w-6 h-6 text-copper" />
                      </div>
                      <div>
                        <p className="font-display text-xl font-bold">{customerDetails.customer.name}</p>
                        <Badge className={TIER_LABELS[customerDetails.customer.subscriptionTier]?.color || ''}>
                          {TIER_LABELS[customerDetails.customer.subscriptionTier]?.label}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Admin Tier Change - hidden in embedded/operator view */}
                  {!embedded && (isOwner || user?.role === 'admin') && (
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Crown className="w-4 h-4 text-amber-500" />
                        <Label className="font-medium">Change Subscription Tier</Label>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        {customerDetails.customer.email.toLowerCase().endsWith(COMPANY_EMAILS.INTERNAL_DOMAIN)
                          ? 'Internal account - tier changes are always free (no billing)'
                          : 'Customer account - no charge until next billing cycle'}
                      </p>
                      <div className="flex items-center gap-2">
                        <Select
                          value={customerDetails.customer.subscriptionTier}
                          onValueChange={(value) => {
                            if (value !== customerDetails.customer.subscriptionTier) {
                              if (confirm(
                                customerDetails.customer.email.toLowerCase().endsWith(COMPANY_EMAILS.INTERNAL_DOMAIN)
                                  ? `Change tier to ${TIER_LABELS[value]?.label || value}?\n\nThis is an internal account - no billing will occur.`
                                  : `Change tier to ${TIER_LABELS[value]?.label || value}?\n\nThe customer will NOT be charged immediately. Their new tier billing will start on their next billing cycle date.`
                              )) {
                                changeTierMutation.mutate({
                                  customerId: customerDetails.customer.id,
                                  tierId: value,
                                });
                              }
                            }
                          }}
                          disabled={changeTierMutation.isPending}
                        >
                          <SelectTrigger className="w-[180px]" data-testid="select-tier-change">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="payg">PAYG (Pay As You Go)</SelectItem>
                            <SelectItem value="access">Access ($24.99/mo)</SelectItem>
                            <SelectItem value="household">Household ($49.99/mo)</SelectItem>
                            <SelectItem value="rural">Rural ($99.99/mo)</SelectItem>
                            <SelectItem value="vip">VIP ($249.99/mo)</SelectItem>
                          </SelectContent>
                        </Select>
                        {changeTierMutation.isPending && (
                          <span className="text-sm text-muted-foreground">Updating...</span>
                        )}
                      </div>
                    </div>
                  )}

                  {!embedded && (isOwner || user?.role === 'admin') && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!confirm(`Send a password reset email to ${customerDetails.customer.email}?`)) return;
                          try {
                            const res = await apiRequest('POST', '/api/auth/force-reset', { userId: customerDetails.customer.id });
                            const data = await res.json();
                            toast({ title: 'Reset email sent', description: data.message || `Password reset email sent to ${customerDetails.customer.email}` });
                          } catch {
                            toast({ title: 'Error', description: 'Failed to send reset email.', variant: 'destructive' });
                          }
                        }}
                        data-testid="button-force-reset"
                      >
                        <KeyRound className="w-4 h-4 mr-2" />
                        Send Password Reset
                      </Button>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>{customerDetails.customer.email}</span>
                    </div>
                    {customerDetails.customer.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{customerDetails.customer.phone}</span>
                      </div>
                    )}
                    {customerDetails.customer.defaultAddress && (
                      <div className="flex items-center gap-2 text-sm sm:col-span-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span>
                          {customerDetails.customer.defaultAddress}, {customerDetails.customer.defaultCity}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>Member since {format(new Date(customerDetails.customer.createdAt), 'MMMM d, yyyy')}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <Package className="w-5 h-5 mx-auto mb-1 text-copper" />
                        <p className="font-display text-2xl font-bold">{customerDetails.customer.totalOrders}</p>
                        <p className="text-xs text-muted-foreground">Total Orders</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <Calendar className="w-5 h-5 mx-auto mb-1 text-sage" />
                        <p className="font-display text-2xl font-bold">{customerDetails.customer.ordersThisMonth}</p>
                        <p className="text-xs text-muted-foreground">This Month</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <DollarSign className="w-5 h-5 mx-auto mb-1 text-brass" />
                        <p className="font-display text-2xl font-bold">${customerDetails.customer.totalSpent.toFixed(0)}</p>
                        <p className="text-xs text-muted-foreground">Total Spent</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {customerDetails.customer.paymentBlocked ? (
                      <ShieldAlert className="w-5 h-5 text-destructive" />
                    ) : (
                      <Shield className="w-5 h-5 text-green-600" />
                    )}
                    <div>
                      <Label htmlFor="payment-block">Payment Status</Label>
                      <p className="text-sm text-muted-foreground">
                        {customerDetails.customer.paymentBlocked 
                          ? customerDetails.customer.paymentBlockedReason || 'Payment blocked'
                          : 'Payments are active'}
                      </p>
                    </div>
                  </div>
                  {!embedded && (isOwner || user?.role === 'admin') && (
                    <Switch
                      id="payment-block"
                      checked={customerDetails.customer.paymentBlocked}
                      onCheckedChange={(checked) => {
                        togglePaymentBlockMutation.mutate({
                          customerId: customerDetails.customer.id,
                          blocked: checked,
                          reason: checked ? 'Blocked by admin' : undefined,
                        });
                      }}
                      data-testid="switch-payment-block"
                    />
                  )}
                </div>

                <Separator />

                <div>
                  <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
                    <Car className="w-4 h-4 text-copper" />
                    Vehicles ({customerDetails.vehicles.length})
                  </h3>
                  {customerDetails.vehicles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No vehicles registered</p>
                  ) : (
                    <div className="space-y-2">
                      {customerDetails.vehicles.map((vehicle) => (
                        <div
                          key={vehicle.id}
                          className="p-3 rounded-lg border border-border bg-muted/30"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                {vehicle.year} {vehicle.make} {vehicle.model}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {vehicle.color} • {vehicle.licensePlate} • {vehicle.fuelType} • {vehicle.tankCapacity}L tank
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-copper" />
                    Recent Orders ({customerDetails.recentOrders.length})
                  </h3>
                  {customerDetails.recentOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders yet</p>
                  ) : (
                    <div className="space-y-2">
                      {customerDetails.recentOrders.map((order) => (
                        <div
                          key={order.id}
                          className="p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{order.fuelAmount}L {order.fuelType}</p>
                                <Badge className={STATUS_COLORS[order.status] || ''} variant="secondary">
                                  {order.status.replace('_', ' ')}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {order.address}, {order.city}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(order.scheduledDate), 'MMM d, yyyy')}
                              </p>
                            </div>
                            <p className="font-display font-semibold">${parseFloat(order.total).toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
