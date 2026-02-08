import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import {
  ShoppingCart, ArrowLeftRight, Fuel, Droplets, Loader2, Truck, AlertTriangle
} from 'lucide-react';

interface Truck {
  id: string;
  unitNumber: string;
  name?: string;
  regularCapacity: string;
  premiumCapacity: string;
  dieselCapacity: string;
  regularLevel: string;
  premiumLevel: string;
  dieselLevel: string;
  isActive: boolean;
}

interface FuelManagementProps {
  embedded?: boolean;
}

const fuelTypeColors = {
  regular: { bar: 'bg-green-500', bg: 'bg-green-500/10', text: 'text-green-600', label: 'Regular' },
  premium: { bar: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-600', label: 'Premium' },
  diesel: { bar: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-600', label: 'Diesel' },
};

const transactionTypeBadge: Record<string, { label: string; variant: string; className: string }> = {
  purchase: { label: 'Purchase', variant: 'default', className: 'bg-green-500/10 text-green-700 border-green-500/30' },
  supplier_purchase: { label: 'Purchase', variant: 'default', className: 'bg-green-500/10 text-green-700 border-green-500/30' },
  internal_transfer: { label: 'Transfer', variant: 'default', className: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  road_fuel: { label: 'Road Fuel', variant: 'default', className: 'bg-purple-500/10 text-purple-700 border-purple-500/30' },
  spillage: { label: 'Spillage', variant: 'default', className: 'bg-red-500/10 text-red-700 border-red-500/30' },
  adjustment: { label: 'Adjustment', variant: 'default', className: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
};

export default function FuelManagement({ embedded = false }: FuelManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showPurchase, setShowPurchase] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showRoadFuel, setShowRoadFuel] = useState(false);
  const [showSpillage, setShowSpillage] = useState(false);

  const [purchaseForm, setPurchaseForm] = useState({
    truckId: '',
    fuelType: 'regular',
    litres: '',
    costPerLitre: '',
    supplierName: '',
    invoiceNumber: '',
    notes: '',
  });

  const [transferForm, setTransferForm] = useState({
    sourceTruckId: '',
    destinationTruckId: '',
    fuelType: 'regular',
    litres: '',
    reason: '',
    emergency: false,
  });

  const [roadFuelForm, setRoadFuelForm] = useState({
    truckId: '',
    fuelType: 'regular',
    litres: '',
    reason: '',
    emergency: false,
  });

  const [spillageForm, setSpillageForm] = useState({
    truckId: '',
    fuelType: 'regular',
    litres: '',
    reason: '',
    notes: '',
  });

  const { data: trucksData, isLoading: trucksLoading } = useQuery<{ trucks: Truck[] }>({
    queryKey: ['/api/ops/fleet/trucks'],
  });

  const { data: suppliersData } = useQuery<{ suppliers: any[] }>({
    queryKey: ['/api/cra/fuel/suppliers'],
  });

  const { data: lifecycleData, isLoading: lifecycleLoading } = useQuery<{ transactions: any[] }>({
    queryKey: ['/api/cra/fuel/lifecycle'],
  });

  const trucks = trucksData?.trucks?.filter(t => t.isActive) || [];
  const suppliers = suppliersData?.suppliers || [];
  const recentTransactions = (lifecycleData?.transactions || []).slice(0, 25);

  const totalCost = useMemo(() => {
    const litres = parseFloat(purchaseForm.litres) || 0;
    const costPerLitre = parseFloat(purchaseForm.costPerLitre) || 0;
    return (litres * costPerLitre).toFixed(2);
  }, [purchaseForm.litres, purchaseForm.costPerLitre]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/ops/fleet/trucks'] });
    queryClient.invalidateQueries({ queryKey: ['/api/cra/fuel/lifecycle'] });
    queryClient.invalidateQueries({ queryKey: ['/api/cra/fuel/suppliers'] });
    queryClient.invalidateQueries({ queryKey: ['/api/ops/inventory'] });
  };

  const purchaseMutation = useMutation({
    mutationFn: async (data: typeof purchaseForm) => {
      const res = await apiRequest('POST', '/api/cra/fuel/purchase', {
        truckId: data.truckId,
        fuelType: data.fuelType,
        litres: parseFloat(data.litres),
        costPerLitre: parseFloat(data.costPerLitre),
        totalCost: parseFloat(data.litres) * parseFloat(data.costPerLitre),
        supplierName: data.supplierName,
        invoiceNumber: data.invoiceNumber,
        notes: data.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setShowPurchase(false);
      setPurchaseForm({ truckId: '', fuelType: 'regular', litres: '', costPerLitre: '', supplierName: '', invoiceNumber: '', notes: '' });
      toast({ title: 'Purchase recorded', description: 'Fuel purchase has been logged successfully.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message || 'Failed to record purchase.', variant: 'destructive' });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async (data: typeof transferForm) => {
      const res = await apiRequest('POST', '/api/cra/fuel/internal-transfer', {
        sourceTruckId: data.sourceTruckId,
        destinationTruckId: data.destinationTruckId,
        fuelType: data.fuelType,
        litres: parseFloat(data.litres),
        reason: data.reason,
        emergency: data.emergency,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setShowTransfer(false);
      setTransferForm({ sourceTruckId: '', destinationTruckId: '', fuelType: 'regular', litres: '', reason: '', emergency: false });
      toast({ title: 'Transfer recorded', description: 'Internal fuel transfer has been logged.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message || 'Failed to record transfer.', variant: 'destructive' });
    },
  });

  const roadFuelMutation = useMutation({
    mutationFn: async (data: typeof roadFuelForm) => {
      const res = await apiRequest('POST', '/api/cra/fuel/road-fuel', {
        truckId: data.truckId,
        fuelType: data.fuelType,
        litres: parseFloat(data.litres),
        reason: data.reason,
        emergency: data.emergency,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setShowRoadFuel(false);
      setRoadFuelForm({ truckId: '', fuelType: 'regular', litres: '', reason: '', emergency: false });
      toast({ title: 'Road fuel recorded', description: 'Road fuel usage has been logged.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message || 'Failed to record road fuel.', variant: 'destructive' });
    },
  });

  const spillageMutation = useMutation({
    mutationFn: async (data: typeof spillageForm) => {
      const res = await apiRequest('POST', '/api/cra/fuel/spillage', {
        truckId: data.truckId,
        fuelType: data.fuelType,
        litres: parseFloat(data.litres),
        reason: data.reason,
        notes: data.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setShowSpillage(false);
      setSpillageForm({ truckId: '', fuelType: 'regular', litres: '', reason: '', notes: '' });
      toast({ title: 'Spillage reported', description: 'Fuel spillage has been logged.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message || 'Failed to report spillage.', variant: 'destructive' });
    },
  });

  const getTruckLabel = (truck: Truck) => truck.name || `Unit ${truck.unitNumber}`;

  const getTruckById = (id: string) => trucks.find(t => t.id === id);

  const renderTankBar = (level: number, capacity: number, type: 'regular' | 'premium' | 'diesel') => {
    const pct = capacity > 0 ? Math.min((level / capacity) * 100, 100) : 0;
    const colors = fuelTypeColors[type];
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className={`font-medium ${colors.text}`}>{colors.label}</span>
          <span className="text-muted-foreground">{Math.round(level)}L / {Math.round(capacity)}L</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${colors.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  const renderTruckSelector = (value: string, onChange: (v: string) => void, testId: string, excludeId?: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder="Select truck" />
      </SelectTrigger>
      <SelectContent>
        {trucks.filter(t => t.id !== excludeId).map(truck => (
          <SelectItem key={truck.id} value={truck.id}>{getTruckLabel(truck)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderFuelTypeSelector = (value: string, onChange: (v: string) => void, testId: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="regular">Regular</SelectItem>
        <SelectItem value="premium">Premium</SelectItem>
        <SelectItem value="diesel">Diesel</SelectItem>
      </SelectContent>
    </Select>
  );

  if (trucksLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-copper" />
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6'}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          className="cursor-pointer hover:border-green-500/50 transition-colors"
          onClick={() => setShowPurchase(true)}
          data-testid="card-record-purchase"
        >
          <CardContent className="pt-4 pb-4 flex flex-col items-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-green-500/10">
              <ShoppingCart className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm font-medium">Record Purchase</span>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-blue-500/50 transition-colors"
          onClick={() => setShowTransfer(true)}
          data-testid="card-transfer-fuel"
        >
          <CardContent className="pt-4 pb-4 flex flex-col items-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium">Transfer Fuel</span>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-purple-500/50 transition-colors"
          onClick={() => setShowRoadFuel(true)}
          data-testid="card-record-road-fuel"
        >
          <CardContent className="pt-4 pb-4 flex flex-col items-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Fuel className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm font-medium">Record Road Fuel</span>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-red-500/50 transition-colors"
          onClick={() => setShowSpillage(true)}
          data-testid="card-report-spillage"
        >
          <CardContent className="pt-4 pb-4 flex flex-col items-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-red-500/10">
              <Droplets className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-sm font-medium">Report Spillage</span>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="font-display text-lg font-bold mb-3 flex items-center gap-2">
          <Truck className="w-5 h-5 text-copper" />
          Fleet Fuel Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {trucks.map(truck => (
            <Card key={truck.id} data-testid={`card-truck-fuel-${truck.id}`}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">{getTruckLabel(truck)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {renderTankBar(parseFloat(truck.regularLevel) || 0, parseFloat(truck.regularCapacity) || 0, 'regular')}
                {renderTankBar(parseFloat(truck.premiumLevel) || 0, parseFloat(truck.premiumCapacity) || 0, 'premium')}
                {renderTankBar(parseFloat(truck.dieselLevel) || 0, parseFloat(truck.dieselCapacity) || 0, 'diesel')}
              </CardContent>
            </Card>
          ))}
          {trucks.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="py-8 text-center text-muted-foreground">
                No active trucks found
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div>
        <h2 className="font-display text-lg font-bold mb-3">Recent Transactions</h2>
        {lifecycleLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : recentTransactions.length > 0 ? (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Truck</TableHead>
                    <TableHead>Fuel</TableHead>
                    <TableHead className="text-right">Litres</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Operator</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.map((tx: any, idx: number) => {
                    const typeConfig = transactionTypeBadge[tx.transactionType || tx.type] || { label: tx.transactionType || tx.type || 'Unknown', className: 'bg-gray-500/10 text-gray-700 border-gray-500/30' };
                    const truckInfo = getTruckById(tx.truckId);
                    return (
                      <TableRow key={tx.id || idx} data-testid={`row-transaction-${idx}`}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {tx.createdAt ? format(new Date(tx.createdAt), 'MMM d, h:mm a') : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${typeConfig.className}`}>
                            {typeConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {truckInfo ? getTruckLabel(truckInfo) : tx.truckName || '-'}
                        </TableCell>
                        <TableCell>
                          {tx.fuelType && (
                            <span className={`text-xs font-medium ${fuelTypeColors[tx.fuelType as keyof typeof fuelTypeColors]?.text || ''}`}>
                              {fuelTypeColors[tx.fuelType as keyof typeof fuelTypeColors]?.label || tx.fuelType}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">
                          {tx.litres ? `${parseFloat(tx.litres).toFixed(1)}L` : '-'}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">
                          {tx.totalCost ? `$${parseFloat(tx.totalCost).toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className="text-sm">{tx.supplierName || '-'}</TableCell>
                        <TableCell className="text-sm">{tx.operatorName || '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No recent transactions found
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showPurchase} onOpenChange={setShowPurchase}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Record Fuel Purchase</DialogTitle>
            <DialogDescription>Log a fuel fill-up from a supplier</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Truck</Label>
              {renderTruckSelector(purchaseForm.truckId, (v) => setPurchaseForm(p => ({ ...p, truckId: v })), 'select-purchase-truck')}
            </div>
            <div className="space-y-2">
              <Label>Fuel Type</Label>
              {renderFuelTypeSelector(purchaseForm.fuelType, (v) => setPurchaseForm(p => ({ ...p, fuelType: v })), 'select-purchase-fuel-type')}
            </div>
            <div className="space-y-2">
              <Label>Litres</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={purchaseForm.litres}
                onChange={(e) => setPurchaseForm(p => ({ ...p, litres: e.target.value }))}
                placeholder="e.g., 500"
                data-testid="input-purchase-litres"
              />
            </div>
            <div className="space-y-2">
              <Label>Cost per Litre ($)</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={purchaseForm.costPerLitre}
                onChange={(e) => setPurchaseForm(p => ({ ...p, costPerLitre: e.target.value }))}
                placeholder="e.g., 1.25"
                data-testid="input-purchase-cost-per-litre"
              />
            </div>
            {purchaseForm.litres && purchaseForm.costPerLitre && (
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Cost</span>
                  <span className="text-lg font-bold font-mono" data-testid="text-purchase-total">${totalCost}</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Supplier Name</Label>
              <Input
                value={purchaseForm.supplierName}
                onChange={(e) => setPurchaseForm(p => ({ ...p, supplierName: e.target.value }))}
                placeholder="e.g., Shell Canada"
                list="supplier-suggestions"
                data-testid="input-purchase-supplier"
              />
              {suppliers.length > 0 && (
                <datalist id="supplier-suggestions">
                  {suppliers.map((s: any, i: number) => (
                    <option key={i} value={s.name || s.supplierName || s} />
                  ))}
                </datalist>
              )}
            </div>
            <div className="space-y-2">
              <Label>Supplier Invoice #</Label>
              <Input
                value={purchaseForm.invoiceNumber}
                onChange={(e) => setPurchaseForm(p => ({ ...p, invoiceNumber: e.target.value }))}
                placeholder="e.g., INV-2026-0042"
                data-testid="input-purchase-invoice"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={purchaseForm.notes}
                onChange={(e) => setPurchaseForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes"
                data-testid="input-purchase-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchase(false)} data-testid="button-purchase-cancel">Cancel</Button>
            <Button
              onClick={() => purchaseMutation.mutate(purchaseForm)}
              disabled={!purchaseForm.truckId || !purchaseForm.litres || !purchaseForm.costPerLitre || purchaseMutation.isPending}
              data-testid="button-purchase-submit"
            >
              {purchaseMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Transfer Fuel</DialogTitle>
            <DialogDescription>Move fuel between trucks</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Source Truck</Label>
              {renderTruckSelector(transferForm.sourceTruckId, (v) => setTransferForm(p => ({ ...p, sourceTruckId: v })), 'select-transfer-source', transferForm.destinationTruckId)}
            </div>
            <div className="space-y-2">
              <Label>Destination Truck</Label>
              {renderTruckSelector(transferForm.destinationTruckId, (v) => setTransferForm(p => ({ ...p, destinationTruckId: v })), 'select-transfer-destination', transferForm.sourceTruckId)}
            </div>
            <div className="space-y-2">
              <Label>Fuel Type</Label>
              {renderFuelTypeSelector(transferForm.fuelType, (v) => setTransferForm(p => ({ ...p, fuelType: v })), 'select-transfer-fuel-type')}
            </div>
            <div className="space-y-2">
              <Label>Litres to Transfer</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={transferForm.litres}
                onChange={(e) => setTransferForm(p => ({ ...p, litres: e.target.value }))}
                placeholder="e.g., 100"
                data-testid="input-transfer-litres"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={transferForm.reason}
                onChange={(e) => setTransferForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="e.g., Rebalancing tanks"
                data-testid="input-transfer-reason"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="transfer-emergency" className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Emergency Transfer
              </Label>
              <Switch
                id="transfer-emergency"
                checked={transferForm.emergency}
                onCheckedChange={(v) => setTransferForm(p => ({ ...p, emergency: v }))}
                data-testid="switch-transfer-emergency"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)} data-testid="button-transfer-cancel">Cancel</Button>
            <Button
              onClick={() => transferMutation.mutate(transferForm)}
              disabled={!transferForm.sourceTruckId || !transferForm.destinationTruckId || !transferForm.litres || transferForm.sourceTruckId === transferForm.destinationTruckId || transferMutation.isPending}
              data-testid="button-transfer-submit"
            >
              {transferMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Transfer Fuel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRoadFuel} onOpenChange={setShowRoadFuel}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Record Road Fuel</DialogTitle>
            <DialogDescription>Log when a truck uses sellable fuel for driving</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Truck</Label>
              {renderTruckSelector(roadFuelForm.truckId, (v) => setRoadFuelForm(p => ({ ...p, truckId: v })), 'select-road-fuel-truck')}
            </div>
            <div className="space-y-2">
              <Label>Fuel Type</Label>
              {renderFuelTypeSelector(roadFuelForm.fuelType, (v) => setRoadFuelForm(p => ({ ...p, fuelType: v })), 'select-road-fuel-type')}
            </div>
            <div className="space-y-2">
              <Label>Litres Used</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={roadFuelForm.litres}
                onChange={(e) => setRoadFuelForm(p => ({ ...p, litres: e.target.value }))}
                placeholder="e.g., 25"
                data-testid="input-road-fuel-litres"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={roadFuelForm.reason}
                onChange={(e) => setRoadFuelForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="e.g., Long-haul delivery route"
                data-testid="input-road-fuel-reason"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="road-fuel-emergency" className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Emergency
              </Label>
              <Switch
                id="road-fuel-emergency"
                checked={roadFuelForm.emergency}
                onCheckedChange={(v) => setRoadFuelForm(p => ({ ...p, emergency: v }))}
                data-testid="switch-road-fuel-emergency"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoadFuel(false)} data-testid="button-road-fuel-cancel">Cancel</Button>
            <Button
              onClick={() => roadFuelMutation.mutate(roadFuelForm)}
              disabled={!roadFuelForm.truckId || !roadFuelForm.litres || roadFuelMutation.isPending}
              data-testid="button-road-fuel-submit"
            >
              {roadFuelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Road Fuel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSpillage} onOpenChange={setShowSpillage}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Report Fuel Spillage</DialogTitle>
            <DialogDescription>Report accidental fuel loss</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Truck</Label>
              {renderTruckSelector(spillageForm.truckId, (v) => setSpillageForm(p => ({ ...p, truckId: v })), 'select-spillage-truck')}
            </div>
            <div className="space-y-2">
              <Label>Fuel Type</Label>
              {renderFuelTypeSelector(spillageForm.fuelType, (v) => setSpillageForm(p => ({ ...p, fuelType: v })), 'select-spillage-fuel-type')}
            </div>
            <div className="space-y-2">
              <Label>Litres Lost</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={spillageForm.litres}
                onChange={(e) => setSpillageForm(p => ({ ...p, litres: e.target.value }))}
                placeholder="e.g., 5"
                data-testid="input-spillage-litres"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Input
                value={spillageForm.reason}
                onChange={(e) => setSpillageForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="e.g., Hose connection failure"
                data-testid="input-spillage-reason"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={spillageForm.notes}
                onChange={(e) => setSpillageForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Additional details about the spillage"
                data-testid="input-spillage-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSpillage(false)} data-testid="button-spillage-cancel">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => spillageMutation.mutate(spillageForm)}
              disabled={!spillageForm.truckId || !spillageForm.litres || !spillageForm.reason || spillageMutation.isPending}
              data-testid="button-spillage-submit"
            >
              {spillageMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Report Spillage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
