import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Fuel, Plus, AlertTriangle, History, Loader2, TrendingUp, TrendingDown, Minus, Droplets } from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { format } from 'date-fns';

const fuelTypeConfig = {
  regular: { label: 'Regular 87 Gas', color: 'text-red-500', bgColor: 'bg-red-500/10', progressColor: 'bg-red-500' },
  premium: { label: 'Premium', color: 'text-amber-500', bgColor: 'bg-amber-500/10', progressColor: 'bg-amber-500' },
  diesel: { label: 'Diesel', color: 'text-green-500', bgColor: 'bg-green-500/10', progressColor: 'bg-green-500' },
};

const transactionTypeConfig = {
  purchase: { label: 'Purchase', icon: Plus, color: 'text-sage' },
  delivery: { label: 'Delivery', icon: TrendingDown, color: 'text-blue-500' },
  adjustment: { label: 'Adjustment', icon: TrendingUp, color: 'text-amber-500' },
  spill: { label: 'Spill/Loss', icon: Droplets, color: 'text-red-500' },
};

export default function OpsInventory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    fuelType: 'regular',
    type: 'purchase' as 'purchase' | 'adjustment' | 'spill',
    quantity: '',
    notes: '',
  });

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery<{ inventory: any[] }>({
    queryKey: ['/api/ops/inventory'],
  });

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery<{ transactions: any[] }>({
    queryKey: ['/api/ops/inventory/transactions'],
  });

  const { data: trucksData, isLoading: trucksLoading } = useQuery<{ trucks: any[] }>({
    queryKey: ['/api/ops/fleet/trucks'],
  });

  const inventory = inventoryData?.inventory || [];
  const transactions = transactionsData?.transactions || [];
  const trucks = trucksData?.trucks || [];
  const isLoading = inventoryLoading || transactionsLoading || trucksLoading;

  const fleetFuelSummary = {
    regular: {
      current: trucks.reduce((sum, t) => sum + (parseFloat(t.regularLevel) || 0), 0),
      capacity: trucks.reduce((sum, t) => sum + (parseFloat(t.regularCapacity) || 0), 0),
    },
    premium: {
      current: trucks.reduce((sum, t) => sum + (parseFloat(t.premiumLevel) || 0), 0),
      capacity: trucks.reduce((sum, t) => sum + (parseFloat(t.premiumCapacity) || 0), 0),
    },
    diesel: {
      current: trucks.reduce((sum, t) => sum + (parseFloat(t.dieselLevel) || 0), 0),
      capacity: trucks.reduce((sum, t) => sum + (parseFloat(t.dieselCapacity) || 0), 0),
    },
  };

  const addTransactionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/ops/inventory/transaction', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/inventory/transactions'] });
      setIsAddOpen(false);
      setForm({ fuelType: 'regular', type: 'purchase', quantity: '', notes: '' });
      toast({ title: 'Transaction recorded', description: 'Inventory has been updated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to record transaction.', variant: 'destructive' });
    }
  });

  const handleAddTransaction = () => {
    const quantity = form.type === 'purchase' 
      ? Math.abs(parseFloat(form.quantity)) 
      : -Math.abs(parseFloat(form.quantity));
    
    addTransactionMutation.mutate({
      fuelType: form.fuelType,
      type: form.type,
      quantity,
      notes: form.notes,
    });
  };

  const getInventoryForFuel = (fuelType: string) => {
    return inventory.find((i: any) => i.fuelType === fuelType);
  };

  const lowStockItems = (['regular', 'premium', 'diesel'] as const).filter((fuelType) => {
    const summary = fleetFuelSummary[fuelType];
    const threshold = summary.capacity * 0.2;
    return summary.current < threshold && summary.capacity > 0;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-copper" />
      </div>
    );
  }

  return (
    <OpsLayout>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/ops">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-copper" />
              <span className="font-display font-bold text-foreground">Fuel Inventory</span>
            </div>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-copper hover:bg-copper/90" data-testid="button-add-transaction">
                <Plus className="w-4 h-4 mr-2" />
                Add Transaction
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Record Inventory Transaction</DialogTitle>
                <DialogDescription>Add or remove fuel from inventory</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Fuel Type</Label>
                  <Select value={form.fuelType} onValueChange={(v) => setForm(prev => ({ ...prev, fuelType: v }))}>
                    <SelectTrigger data-testid="select-fuelType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(fuelTypeConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Transaction Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm(prev => ({ ...prev, type: v as any }))}>
                    <SelectTrigger data-testid="select-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase">Purchase (Add Fuel)</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                      <SelectItem value="spill">Spill / Loss</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantity (Litres)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.quantity}
                    onChange={(e) => setForm(prev => ({ ...prev, quantity: e.target.value }))}
                    placeholder={form.type === 'purchase' ? 'e.g., 500' : 'e.g., 50'}
                    data-testid="input-quantity"
                  />
                  <p className="text-xs text-muted-foreground">
                    {form.type === 'purchase' ? 'Amount to add' : 'Amount to subtract'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="e.g., Supplier invoice #12345"
                    data-testid="input-notes"
                  />
                </div>
                <Button 
                  className="w-full bg-copper hover:bg-copper/90" 
                  onClick={handleAddTransaction}
                  disabled={!form.quantity || addTransactionMutation.isPending}
                  data-testid="button-submit-transaction"
                >
                  {addTransactionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Record Transaction
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div>
          <motion.h1 
            className="font-display text-2xl font-bold text-foreground"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Fuel Inventory Management
          </motion.h1>
          <p className="text-muted-foreground mt-1">Track stock levels and manage fuel inventory</p>
        </div>

        {lowStockItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="font-medium text-foreground">Low Stock Alert</p>
                    <p className="text-sm text-muted-foreground">
                      {lowStockItems.map((fuelType) => fuelTypeConfig[fuelType]?.label).join(', ')} 
                      {' '}below 20% capacity threshold
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid gap-4">
          {(['regular', 'premium', 'diesel'] as const).map((fuelType, i) => {
            const config = fuelTypeConfig[fuelType];
            const summary = fleetFuelSummary[fuelType];
            const stock = summary.current;
            const maxCapacity = summary.capacity;
            const threshold = maxCapacity * 0.2;
            const isLow = stock < threshold && maxCapacity > 0;
            const percentage = maxCapacity > 0 ? Math.min((stock / maxCapacity) * 100, 100) : 0;
            
            return (
              <motion.div
                key={fuelType}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={isLow ? 'border-amber-500/30' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-display flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                          <Fuel className={`w-4 h-4 ${config.color}`} />
                        </div>
                        {config.label}
                      </CardTitle>
                      {isLow && (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Low Stock
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Combined Fleet Stock</p>
                        <p className="font-display text-3xl font-bold text-foreground">{stock.toFixed(0)}L</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Capacity: {maxCapacity.toFixed(0)}L</p>
                        <p className="text-xs text-muted-foreground">20% threshold: {threshold.toFixed(0)}L</p>
                      </div>
                    </div>
                    <div className="relative w-full h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`absolute inset-y-0 left-0 ${config.progressColor} rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      {trucks.length} truck{trucks.length !== 1 ? 's' : ''} in fleet
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <History className="w-5 h-5 text-copper" />
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No transactions recorded yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.slice(0, 20).map((tx: any, i: number) => {
                  const typeConfig = transactionTypeConfig[tx.type as keyof typeof transactionTypeConfig];
                  const fuelConfig = fuelTypeConfig[tx.fuelType as keyof typeof fuelTypeConfig];
                  const Icon = typeConfig?.icon || History;
                  const quantity = parseFloat(tx.quantity);
                  
                  return (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center justify-between p-4 rounded-xl bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${fuelConfig?.bgColor || 'bg-muted'}`}>
                          <Icon className={`w-5 h-5 ${typeConfig?.color || 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">
                            {typeConfig?.label || tx.type} - {fuelConfig?.label || tx.fuelType}
                            {tx.orderId && (
                              <span className="ml-2 text-xs bg-copper/20 text-copper px-2 py-0.5 rounded-full font-mono">
                                #{tx.orderId.slice(0, 8).toUpperCase()}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(tx.createdAt), 'MMM d, yyyy h:mm a')}
                            {tx.notes && ` · ${tx.notes}`}
                          </p>
                        </div>
                      </div>
                      <span className={`font-display font-bold ${quantity >= 0 ? 'text-sage' : 'text-destructive'}`}>
                        {quantity >= 0 ? '+' : ''}{quantity.toFixed(1)}L
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </OpsLayout>
  );
}
