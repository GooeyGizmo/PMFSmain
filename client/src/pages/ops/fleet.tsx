import { useState } from 'react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ArrowLeft, Truck, MapPin, Clock, Users, Fuel, 
  AlertTriangle, Phone, Mail, Plus, Minus, Droplets,
  FileText, Download, Calendar, Wrench, ChevronRight,
  AlertCircle, CheckCircle2, RefreshCw, ClipboardCheck,
  Edit, Trash2, XCircle
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/lib/auth';

interface PreTripStatus {
  truckId: string;
  hasInspection: boolean;
  vehicleRoadworthy: boolean;
}

interface Truck {
  id: string;
  unitNumber: string;
  name?: string;
  make: string;
  model: string;
  year: string;
  licensePlate: string;
  vinNumber?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverEmail?: string;
  regularCapacity: string;
  premiumCapacity: string;
  dieselCapacity: string;
  regularLevel: string;
  premiumLevel: string;
  dieselLevel: string;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  maintenanceNotes?: string;
  odometerReading?: number;
  isActive: boolean;
}

interface FuelTransaction {
  id: string;
  truckId: string;
  transactionType: 'fill' | 'dispense' | 'adjustment';
  fuelType: 'regular' | 'premium' | 'diesel';
  litres: string;
  previousLevel: string;
  newLevel: string;
  unNumber: string;
  properShippingName: string;
  dangerClass: string;
  packingGroup: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  orderId?: string;
  operatorId: string;
  operatorName: string;
  notes?: string;
  createdAt: string;
}

interface TDGInfo {
  fuelInfo: {
    regular: { unNumber: string; properShippingName: string; class: string; packingGroup: string; placard: string; ergGuide: string };
    premium: { unNumber: string; properShippingName: string; class: string; packingGroup: string; placard: string; ergGuide: string };
    diesel: { unNumber: string; properShippingName: string; class: string; packingGroup: string; placard: string; ergGuide: string };
  };
  canutec: { name: string; phone: string; phoneAlternate: string; available: string; purpose: string };
  emergencyContact: { name: string; title: string; company: string; email: string; phone: string };
}

export default function FleetManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [showAddTruck, setShowAddTruck] = useState(false);
  const [showEditTruck, setShowEditTruck] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [showFillDialog, setShowFillDialog] = useState(false);
  const [showEmergencyDialog, setShowEmergencyDialog] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [showPreTripDialog, setShowPreTripDialog] = useState(false);
  
  const [truckForm, setTruckForm] = useState({
    unitNumber: '',
    name: '',
    make: '',
    model: '',
    year: '',
    licensePlate: '',
    vinNumber: '',
    assignedDriverId: '',
    regularCapacity: '0',
    premiumCapacity: '0',
    dieselCapacity: '0',
  });
  const [fillFuelType, setFillFuelType] = useState<'regular' | 'premium' | 'diesel'>('regular');
  const [fillLitres, setFillLitres] = useState('');
  const [fillNotes, setFillNotes] = useState('');
  const [drainMode, setDrainMode] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<string>('all');
  const [transactionDate, setTransactionDate] = useState<string>(() => {
    const today = new Date();
    return format(today, 'yyyy-MM-dd');
  });
  
  // Pre-trip inspection form state
  // Truck fuel tank capacity (in litres) - hardcoded for now, could be per-truck in future
  const TRUCK_FUEL_TANK_CAPACITY = 118;
  
  const [preTripForm, setPreTripForm] = useState({
    lightsWorking: false,
    brakesWorking: false,
    tiresCondition: false,
    mirrorsClear: false,
    hornWorking: false,
    windshieldClear: false,
    wipersWorking: false,
    oilLevelOk: false,
    coolantLevelOk: false,
    washerFluidOk: false,
    fireExtinguisherPresent: false,
    firstAidKitPresent: false,
    spillKitPresent: false,
    tdgDocumentsPresent: false,
    odometerReading: '',
    regularFuelLevel: '',
    premiumFuelLevel: '',
    dieselFuelLevel: '',
    truckFuelLevel: '',
    truckFuelLevelSelection: '' as '' | 'E' | '1/4' | '1/2' | '3/4' | 'F',
    fuelEconomy: '',
    notes: '',
    defectsNoted: '',
  });
  
  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin';

  const { data: trucksData, isLoading: trucksLoading } = useQuery<{ trucks: Truck[] }>({
    queryKey: ['/api/ops/fleet/trucks'],
  });

  const { data: tdgInfo } = useQuery<TDGInfo>({
    queryKey: ['/api/ops/fleet/tdg-info'],
  });

  const { data: transactionsData } = useQuery<{ transactions: FuelTransaction[] }>({
    queryKey: ['/api/ops/fleet/trucks', selectedTruck?.id, 'transactions', transactionDate],
    enabled: !!selectedTruck && showTransactions,
    queryFn: () => {
      const startOfDay = `${transactionDate}T00:00:00.000Z`;
      const endOfDay = `${transactionDate}T23:59:59.999Z`;
      return apiRequest('GET', `/api/ops/fleet/trucks/${selectedTruck?.id}/transactions?startDate=${startOfDay}&endDate=${endOfDay}`).then(r => r.json());
    },
  });

  const { data: driversData } = useQuery<{ drivers: Array<{ id: string; name: string; role: string }> }>({
    queryKey: ['/api/ops/drivers'],
    enabled: isOwnerOrAdmin,
  });

  const { data: preTripStatusData } = useQuery<{ statuses: PreTripStatus[] }>({
    queryKey: ['/api/ops/fleet/pretrip-status'],
  });

  const preTripStatuses = preTripStatusData?.statuses || [];

  const getPreTripStatus = (truckId: string): PreTripStatus | undefined => {
    return preTripStatuses.find(s => s.truckId === truckId);
  };

  const createTruckMutation = useMutation({
    mutationFn: async (data: Partial<Truck>) => {
      const res = await apiRequest('POST', '/api/ops/fleet/trucks', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/fleet/trucks'] });
      setShowAddTruck(false);
      toast({ title: 'Truck added', description: 'New truck has been added to the fleet.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add truck.', variant: 'destructive' });
    },
  });

  const updateTruckMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Truck> }) => {
      const res = await apiRequest('PATCH', `/api/ops/fleet/trucks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/fleet/trucks'] });
      setShowEditTruck(false);
      setSelectedTruck(null);
      toast({ title: 'Truck updated', description: 'Truck information has been updated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update truck.', variant: 'destructive' });
    },
  });

  const deleteTruckMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/ops/fleet/trucks/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/fleet/trucks'] });
      setShowDeleteConfirm(false);
      setSelectedTruck(null);
      toast({ title: 'Truck deleted', description: 'Truck has been removed from the fleet.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete truck.', variant: 'destructive' });
    },
  });

  const emptyTruckMutation = useMutation({
    mutationFn: async (truckId: string) => {
      const res = await apiRequest('POST', `/api/ops/fleet/trucks/${truckId}/empty`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/fleet/trucks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/inventory'] });
      setShowEmptyConfirm(false);
      setSelectedTruck(null);
      toast({ title: 'Truck emptied', description: 'All fuel levels have been reset to 0.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to empty truck fuel.', variant: 'destructive' });
    },
  });

  const fillFuelMutation = useMutation({
    mutationFn: async ({ truckId, fuelType, litres, notes }: { truckId: string; fuelType: string; litres: string; notes: string }) => {
      const res = await apiRequest('POST', `/api/ops/fleet/trucks/${truckId}/fill`, { fuelType, litres, notes });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/fleet/trucks'] });
      setShowFillDialog(false);
      setFillLitres('');
      setFillNotes('');
      toast({ title: 'Fuel Added', description: `Added ${fillLitres}L of ${fillFuelType}. New level: ${data.newLevel}L` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to record fuel fill.', variant: 'destructive' });
    },
  });

  const drainFuelMutation = useMutation({
    mutationFn: async ({ truckId, fuelType, litres, notes }: { truckId: string; fuelType: string; litres: string; notes: string }) => {
      const res = await apiRequest('POST', `/api/ops/fleet/trucks/${truckId}/drain`, { fuelType, litres, notes });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/fleet/trucks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/inventory'] });
      setShowFillDialog(false);
      setFillLitres('');
      setFillNotes('');
      setDrainMode(false);
      toast({ title: 'Fuel Removed', description: `Removed ${fillLitres}L of ${fillFuelType}. New level: ${data.newLevel}L` });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to drain fuel.', variant: 'destructive' });
    },
  });

  const preTripMutation = useMutation({
    mutationFn: async (data: typeof preTripForm & { truckId: string }) => {
      const { truckId, ...formData } = data;
      const res = await apiRequest('POST', `/api/ops/fleet/trucks/${truckId}/pretrip`, {
        ...formData,
        odometerReading: parseInt(formData.odometerReading) || 0,
        regularFuelLevel: formData.regularFuelLevel ? parseFloat(formData.regularFuelLevel) : undefined,
        premiumFuelLevel: formData.premiumFuelLevel ? parseFloat(formData.premiumFuelLevel) : undefined,
        dieselFuelLevel: formData.dieselFuelLevel ? parseFloat(formData.dieselFuelLevel) : undefined,
        truckFuelLevel: formData.truckFuelLevel ? parseFloat(formData.truckFuelLevel) : undefined,
        fuelEconomy: formData.fuelEconomy ? parseFloat(formData.fuelEconomy) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/fleet/pretrip-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/fleet/trucks'] });
      setShowPreTripDialog(false);
      resetPreTripForm();
      toast({ title: 'Pre-Trip Complete', description: 'Daily inspection recorded successfully.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to submit pre-trip inspection.', variant: 'destructive' });
    },
  });

  const resetPreTripForm = () => {
    setPreTripForm({
      lightsWorking: false,
      brakesWorking: false,
      tiresCondition: false,
      mirrorsClear: false,
      hornWorking: false,
      windshieldClear: false,
      wipersWorking: false,
      oilLevelOk: false,
      coolantLevelOk: false,
      washerFluidOk: false,
      fireExtinguisherPresent: false,
      firstAidKitPresent: false,
      spillKitPresent: false,
      tdgDocumentsPresent: false,
      odometerReading: '',
      regularFuelLevel: '',
      premiumFuelLevel: '',
      dieselFuelLevel: '',
      truckFuelLevel: '',
      truckFuelLevelSelection: '',
      fuelEconomy: '',
      notes: '',
      defectsNoted: '',
    });
  };

  const trucks = trucksData?.trucks || [];
  const drivers = driversData?.drivers || [];
  const transactions = transactionsData?.transactions || [];

  const filteredTransactions = transactionFilter === 'all' 
    ? transactions 
    : transactions.filter(t => t.fuelType === transactionFilter);

  const handleExportPDF = () => {
    if (!selectedTruck) {
      toast({ title: 'No Truck Selected', description: 'Please select a truck first.', variant: 'destructive' });
      return;
    }

    // Navigate to the fuel log page with date and fuel type filters
    const params = new URLSearchParams();
    if (transactionFilter !== 'all') params.set('fuelType', transactionFilter);
    if (transactionDate) params.set('date', transactionDate);
    const queryString = params.toString();
    const url = `/ops/fuel-log/${selectedTruck.id}${queryString ? `?${queryString}` : ''}`;
    window.location.href = url;
  };

  const getFuelLevelPercent = (level: string, capacity: string) => {
    const lvl = parseFloat(level) || 0;
    const cap = parseFloat(capacity) || 1;
    return Math.min(100, Math.max(0, (lvl / cap) * 100));
  };

  const getFuelLevelColor = (percent: number) => {
    if (percent < 20) return 'bg-red-500';
    if (percent < 40) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const handleAddTruck = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createTruckMutation.mutate({
      unitNumber: formData.get('unitNumber') as string,
      name: formData.get('name') as string || undefined,
      make: formData.get('make') as string,
      model: formData.get('model') as string,
      year: formData.get('year') as string,
      licensePlate: formData.get('licensePlate') as string,
      vinNumber: formData.get('vinNumber') as string || undefined,
      assignedDriverId: formData.get('assignedDriverId') as string || undefined,
      regularCapacity: formData.get('regularCapacity') as string || '0',
      premiumCapacity: formData.get('premiumCapacity') as string || '0',
      dieselCapacity: formData.get('dieselCapacity') as string || '0',
    });
  };

  const openEditTruckDialog = (truck: Truck) => {
    setSelectedTruck(truck);
    setTruckForm({
      unitNumber: truck.unitNumber,
      name: truck.name || '',
      make: truck.make,
      model: truck.model,
      year: truck.year,
      licensePlate: truck.licensePlate,
      vinNumber: truck.vinNumber || '',
      assignedDriverId: truck.assignedDriverId || '',
      regularCapacity: truck.regularCapacity || '0',
      premiumCapacity: truck.premiumCapacity || '0',
      dieselCapacity: truck.dieselCapacity || '0',
    });
    setShowEditTruck(true);
  };

  const handleEditTruck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTruck) return;
    updateTruckMutation.mutate({
      id: selectedTruck.id,
      data: {
        unitNumber: truckForm.unitNumber,
        name: truckForm.name || undefined,
        make: truckForm.make,
        model: truckForm.model,
        year: truckForm.year,
        licensePlate: truckForm.licensePlate,
        vinNumber: truckForm.vinNumber || undefined,
        assignedDriverId: truckForm.assignedDriverId || undefined,
        regularCapacity: truckForm.regularCapacity || '0',
        premiumCapacity: truckForm.premiumCapacity || '0',
        dieselCapacity: truckForm.dieselCapacity || '0',
      },
    });
  };

  const openDeleteConfirm = (truck: Truck) => {
    setSelectedTruck(truck);
    setShowDeleteConfirm(true);
  };

  const openEmptyConfirm = (truck: Truck) => {
    setSelectedTruck(truck);
    setShowEmptyConfirm(true);
  };

  const getTotalFuelOnTruck = (truck: Truck): number => {
    return (parseFloat(truck.regularLevel) || 0) + 
           (parseFloat(truck.premiumLevel) || 0) + 
           (parseFloat(truck.dieselLevel) || 0);
  };

  const handleFillFuel = () => {
    if (!selectedTruck || !fillLitres) return;
    if (drainMode) {
      drainFuelMutation.mutate({
        truckId: selectedTruck.id,
        fuelType: fillFuelType,
        litres: fillLitres,
        notes: fillNotes,
      });
    } else {
      fillFuelMutation.mutate({
        truckId: selectedTruck.id,
        fuelType: fillFuelType,
        litres: fillLitres,
        notes: fillNotes,
      });
    }
  };

  const openPreTripDialog = async (truck: Truck) => {
    setSelectedTruck(truck);
    
    // Try to fetch last fuel economy from previous inspection
    let lastFuelEconomy = '';
    try {
      const res = await fetch(`/api/ops/fleet/trucks/${truck.id}/pretrip`);
      if (res.ok) {
        const data = await res.json();
        if (data.inspections && data.inspections.length > 0) {
          const lastInspection = data.inspections[0];
          if (lastInspection.fuelEconomy) {
            lastFuelEconomy = lastInspection.fuelEconomy.toString();
          }
        }
      }
    } catch (e) {
      // Ignore error, use blank default
    }
    
    setPreTripForm(prev => ({
      ...prev,
      regularFuelLevel: truck.regularLevel || '',
      premiumFuelLevel: truck.premiumLevel || '',
      dieselFuelLevel: truck.dieselLevel || '',
      odometerReading: truck.odometerReading?.toString() || '',
      fuelEconomy: lastFuelEconomy,
      truckFuelLevelSelection: '',
      truckFuelLevel: '',
    }));
    setShowPreTripDialog(true);
  };
  
  // Convert truck fuel level selection to litres
  const handleTruckFuelLevelSelect = (selection: '' | 'E' | '1/4' | '1/2' | '3/4' | 'F') => {
    let litres = '';
    switch (selection) {
      case 'E': litres = '0'; break;
      case '1/4': litres = Math.round(TRUCK_FUEL_TANK_CAPACITY * 0.25).toString(); break;
      case '1/2': litres = Math.round(TRUCK_FUEL_TANK_CAPACITY * 0.5).toString(); break;
      case '3/4': litres = Math.round(TRUCK_FUEL_TANK_CAPACITY * 0.75).toString(); break;
      case 'F': litres = TRUCK_FUEL_TANK_CAPACITY.toString(); break;
    }
    setPreTripForm(prev => ({ ...prev, truckFuelLevelSelection: selection, truckFuelLevel: litres }));
  };

  const handlePreTripSubmit = () => {
    if (!selectedTruck || !preTripForm.odometerReading) return;
    
    const hasDefects = !preTripForm.lightsWorking || !preTripForm.brakesWorking || 
      !preTripForm.tiresCondition || !preTripForm.mirrorsClear || !preTripForm.hornWorking ||
      !preTripForm.windshieldClear || !preTripForm.wipersWorking || !preTripForm.oilLevelOk ||
      !preTripForm.coolantLevelOk || !preTripForm.washerFluidOk || 
      !preTripForm.fireExtinguisherPresent || !preTripForm.firstAidKitPresent ||
      !preTripForm.spillKitPresent || !preTripForm.tdgDocumentsPresent;
    
    preTripMutation.mutate({
      ...preTripForm,
      truckId: selectedTruck.id,
      vehicleRoadworthy: !hasDefects,
    } as any);
  };

  return (
    <OpsLayout>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/ops">
              <Button variant="ghost" size="sm" data-testid="link-back-ops">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Fleet Management</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">TDG-compliant fuel tracking & truck management</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="destructive"
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white font-bold animate-pulse sm:size-default"
              onClick={() => setShowEmergencyDialog(true)}
              data-testid="button-emergency-contact"
            >
              <AlertTriangle className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">EMERGENCY</span>
            </Button>
            {isOwnerOrAdmin && (
              <Button size="sm" onClick={() => setShowAddTruck(true)} data-testid="button-add-truck" className="sm:size-default">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Add Truck</span>
              </Button>
            )}
          </div>
        </div>

        {trucksLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-prairie-600" />
          </div>
        ) : trucks.length === 0 ? (
          <Card className="p-12 text-center">
            <Truck className="h-16 w-16 mx-auto text-slate-300 mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No Trucks in Fleet</h3>
            <p className="text-slate-500 mb-4">Add your first truck to start tracking fuel and routes.</p>
            {isOwnerOrAdmin && (
              <Button onClick={() => setShowAddTruck(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Truck
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {trucks.map((truck) => {
              const regularPercent = getFuelLevelPercent(truck.regularLevel, truck.regularCapacity);
              const premiumPercent = getFuelLevelPercent(truck.premiumLevel, truck.premiumCapacity);
              const dieselPercent = getFuelLevelPercent(truck.dieselLevel, truck.dieselCapacity);
              const hasLowFuel = regularPercent < 20 || premiumPercent < 20 || dieselPercent < 20;
              const needsMaintenance = truck.nextMaintenanceDate && new Date(truck.nextMaintenanceDate) <= new Date();

              return (
                <motion.div
                  key={truck.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  data-testid={`card-truck-${truck.id}`}
                >
                  <Card className={`hover:shadow-lg transition-shadow ${hasLowFuel || needsMaintenance ? 'border-yellow-400' : ''}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Truck className="h-5 w-5 text-prairie-600" />
                            Unit #{truck.unitNumber}
                            {truck.name && <span className="text-slate-500 font-normal">({truck.name})</span>}
                          </CardTitle>
                          <CardDescription>
                            {truck.year} {truck.make} {truck.model} • {truck.licensePlate}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {(() => {
                            const status = getPreTripStatus(truck.id);
                            if (status?.hasInspection) {
                              return (
                                <Badge 
                                  variant="outline" 
                                  className={status.vehicleRoadworthy 
                                    ? "bg-green-50 text-green-700 border-green-300" 
                                    : "bg-orange-50 text-orange-700 border-orange-300"}
                                  data-testid={`badge-pretrip-${truck.id}`}
                                >
                                  <ClipboardCheck className="h-3 w-3 mr-1" />
                                  {status.vehicleRoadworthy ? 'Inspected' : 'Defects'}
                                </Badge>
                              );
                            }
                            return (
                              <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300" data-testid={`badge-pretrip-needed-${truck.id}`}>
                                <ClipboardCheck className="h-3 w-3 mr-1" />
                                Pre-Trip Needed
                              </Badge>
                            );
                          })()}
                          {hasLowFuel && (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                              <Fuel className="h-3 w-3 mr-1" />
                              Low
                            </Badge>
                          )}
                          {needsMaintenance && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                              <Wrench className="h-3 w-3 mr-1" />
                              Maint.
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Users className="h-4 w-4" />
                        <span>
                          {truck.assignedDriverName || 'No driver assigned'}
                        </span>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                          <Droplets className="h-4 w-4" />
                          On-Board Fuel Levels
                        </h4>
                        
                        {parseFloat(truck.regularCapacity) > 0 && (
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-600">87 Regular (UN1203)</span>
                              <span className="font-medium">{parseFloat(truck.regularLevel).toFixed(0)}L / {parseFloat(truck.regularCapacity).toFixed(0)}L</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all ${getFuelLevelColor(regularPercent)}`}
                                style={{ width: `${regularPercent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {parseFloat(truck.premiumCapacity) > 0 && (
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-600">91 Premium (UN1203)</span>
                              <span className="font-medium">{parseFloat(truck.premiumLevel).toFixed(0)}L / {parseFloat(truck.premiumCapacity).toFixed(0)}L</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all ${getFuelLevelColor(premiumPercent)}`}
                                style={{ width: `${premiumPercent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {parseFloat(truck.dieselCapacity) > 0 && (
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-600">Diesel (UN1202)</span>
                              <span className="font-medium">{parseFloat(truck.dieselLevel).toFixed(0)}L / {parseFloat(truck.dieselCapacity).toFixed(0)}L</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all ${getFuelLevelColor(dieselPercent)}`}
                                style={{ width: `${dieselPercent}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {truck.nextMaintenanceDate && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Wrench className="h-3 w-3" />
                          Next maintenance: {format(new Date(truck.nextMaintenanceDate), 'MMM d, yyyy')}
                        </div>
                      )}

                      <div className="flex gap-2 pt-2 flex-wrap">
                        <Button 
                          size="sm" 
                          variant="outline"
                          className={`flex-1 min-w-[80px] ${!getPreTripStatus(truck.id)?.hasInspection ? 'bg-amber-100 hover:bg-amber-200 border-amber-400 text-black font-medium' : 'text-prairie-700 border-prairie-300'}`}
                          onClick={() => openPreTripDialog(truck)}
                          data-testid={`button-pretrip-truck-${truck.id}`}
                        >
                          <ClipboardCheck className="h-3 w-3 mr-1" />
                          <span className="text-xs sm:text-sm text-black">Pre-Trip</span>
                        </Button>
                        <Button 
                          size="sm" 
                          className="flex-1 min-w-[80px]"
                          onClick={() => { setSelectedTruck(truck); setDrainMode(false); setShowFillDialog(true); }}
                          data-testid={`button-fill-truck-${truck.id}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          <span className="text-xs sm:text-sm">Fill</span>
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="flex-1 min-w-[80px] border-amber-500 text-amber-700 hover:bg-amber-50"
                          onClick={() => { setSelectedTruck(truck); setDrainMode(true); setShowFillDialog(true); }}
                          data-testid={`button-drain-truck-${truck.id}`}
                        >
                          <Minus className="h-3 w-3 mr-1" />
                          <span className="text-xs sm:text-sm">Drain</span>
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="flex-1 min-w-[80px]"
                          onClick={() => { setSelectedTruck(truck); setShowTransactions(true); }}
                          data-testid={`button-web-logs-truck-${truck.id}`}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          <span className="text-xs sm:text-sm">Web-Logs</span>
                        </Button>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Link href={`/ops/fuel-log/${truck.id}`} className="flex-1">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="w-full border-prairie-300 text-prairie-700 hover:bg-prairie-50"
                            data-testid={`button-log-truck-${truck.id}`}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            <span className="text-xs sm:text-sm">Log</span>
                          </Button>
                        </Link>
                        <Link href={`/ops/shipping-document/${truck.id}`} className="flex-1">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="w-full border-prairie-300 text-prairie-700 hover:bg-prairie-50 text-xs sm:text-sm"
                            data-testid={`button-shipping-doc-${truck.id}`}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            TDG Doc
                          </Button>
                        </Link>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="flex-1 border-red-400 text-red-600 hover:bg-red-50"
                          onClick={() => openEmptyConfirm(truck)}
                          data-testid={`button-empty-truck-${truck.id}`}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          <span className="text-xs sm:text-sm">Empty</span>
                        </Button>
                      </div>
                      {isOwnerOrAdmin && (
                        <div className="flex gap-2 mt-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="flex-1"
                            onClick={() => openEditTruckDialog(truck)}
                            data-testid={`button-edit-truck-${truck.id}`}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            <span className="text-xs sm:text-sm">Edit</span>
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="flex-1 border-red-400 text-red-600 hover:bg-red-50"
                            onClick={() => openDeleteConfirm(truck)}
                            data-testid={`button-delete-truck-${truck.id}`}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            <span className="text-xs sm:text-sm">Delete</span>
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        <Dialog open={showEmergencyDialog} onOpenChange={setShowEmergencyDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-6 w-6" />
                Emergency Contact Information
              </DialogTitle>
              <DialogDescription>
                Use these contacts in case of dangerous goods incidents, spills, or emergencies.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-red-800">🚨 Life-Threatening Emergency</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button 
                    variant="destructive" 
                    size="lg" 
                    className="w-full text-xl font-bold"
                    onClick={() => window.location.href = 'tel:911'}
                    data-testid="button-call-911"
                  >
                    <Phone className="h-6 w-6 mr-2" />
                    Call 911
                  </Button>
                  <p className="text-xs text-red-700 mt-2 text-center">
                    For fires, injuries, or immediate life-threatening situations
                  </p>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-orange-800">☢️ CANUTEC - Dangerous Goods Emergencies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-orange-700">
                    Transport Canada's 24/7 emergency response center for dangerous goods incidents.
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-100"
                      onClick={() => window.location.href = 'tel:1-888-226-8832'}
                      data-testid="button-call-canutec"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      1-888-226-8832
                    </Button>
                    <Button 
                      variant="outline" 
                      className="border-orange-300 text-orange-700 hover:bg-orange-100"
                      onClick={() => window.location.href = 'tel:*666'}
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      *666 (cell)
                    </Button>
                  </div>
                  <p className="text-xs text-orange-600 mt-2">
                    <strong>When to call:</strong> Fuel spills, leaks, container damage, accidents involving dangerous goods, or if you need technical guidance during an incident.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-prairie-200 bg-prairie-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-prairie-800">👤 Levi Ernst - Owner/Operator</CardTitle>
                  <CardDescription>Prairie Mobile Fuel Services</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1 border-prairie-300 text-prairie-700 hover:bg-prairie-100"
                      onClick={() => window.location.href = 'tel:587-890-8982'}
                      data-testid="button-call-owner"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      587-890-8982
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1 border-prairie-300 text-prairie-700 hover:bg-prairie-100"
                      onClick={() => window.location.href = 'mailto:levi.ernst@prairiemobilefuel.ca'}
                      data-testid="button-email-owner"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </Button>
                  </div>
                  <p className="text-xs text-prairie-600 mt-2">
                    <strong>When to contact:</strong> Operational issues, scheduling problems, customer concerns, equipment issues, or any situation requiring management decision.
                  </p>
                </CardContent>
              </Card>

              <div className="text-xs text-slate-500 text-center p-2 bg-slate-50 rounded">
                <strong>TDG ERG Guide 128</strong> - For gasoline and diesel fuel emergency response procedures
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEmergencyDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showFillDialog} onOpenChange={(open) => { setShowFillDialog(open); if (!open) setDrainMode(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{drainMode ? 'Remove Fuel from Truck' : 'Record Fuel Fill'}</DialogTitle>
              <DialogDescription>
                {selectedTruck && (drainMode 
                  ? `Removing fuel from Unit #${selectedTruck.unitNumber}` 
                  : `Adding fuel to Unit #${selectedTruck.unitNumber}`)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Fuel Type</Label>
                <Select value={fillFuelType} onValueChange={(v) => setFillFuelType(v as any)}>
                  <SelectTrigger data-testid="select-fill-fuel-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">87 Regular (UN1203)</SelectItem>
                    <SelectItem value="premium">91 Premium (UN1203)</SelectItem>
                    <SelectItem value="diesel">Diesel (UN1202)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{drainMode ? 'Litres Removed' : 'Litres Added'}</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={fillLitres}
                  onChange={(e) => setFillLitres(e.target.value)}
                  placeholder="Enter litres"
                  data-testid="input-fill-litres"
                />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea 
                  value={fillNotes}
                  onChange={(e) => setFillNotes(e.target.value)}
                  placeholder={drainMode ? "e.g., Returned to bulk tank" : "e.g., Filled at Shell station on 16th Ave"}
                  data-testid="input-fill-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFillDialog(false)}>Cancel</Button>
              <Button 
                onClick={handleFillFuel} 
                disabled={!fillLitres || fillFuelMutation.isPending || drainFuelMutation.isPending} 
                className={drainMode ? 'bg-amber-600 hover:bg-amber-700' : ''}
                data-testid="button-confirm-fill"
              >
                {(fillFuelMutation.isPending || drainFuelMutation.isPending) ? 'Recording...' : (drainMode ? 'Record Drain' : 'Record Fill')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showTransactions} onOpenChange={setShowTransactions}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Fuel Log - Unit #{selectedTruck?.unitNumber}
              </DialogTitle>
              <DialogDescription>
                TDG-compliant record of all fuel fills and dispensing
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                    className="w-40"
                    data-testid="input-transaction-date"
                  />
                </div>
                <Select value={transactionFilter} onValueChange={setTransactionFilter}>
                  <SelectTrigger className="w-40" data-testid="select-transaction-filter">
                    <SelectValue placeholder="Filter by fuel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Fuel Types</SelectItem>
                    <SelectItem value="regular">87 Regular</SelectItem>
                    <SelectItem value="premium">91 Premium</SelectItem>
                    <SelectItem value="diesel">Diesel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No fuel transactions recorded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTransactions.map((tx) => (
                    <Card key={tx.id} className="p-3" data-testid={`transaction-${tx.id}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${tx.transactionType === 'fill' ? 'bg-green-100' : 'bg-blue-100'}`}>
                            {tx.transactionType === 'fill' ? (
                              <Plus className="h-4 w-4 text-green-600" />
                            ) : (
                              <Fuel className="h-4 w-4 text-blue-600" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-sm">
                              {tx.transactionType === 'fill' ? 'Fuel Fill' : 'Dispensed to Customer'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {tx.properShippingName} ({tx.unNumber}) • Class {tx.dangerClass} • PG {tx.packingGroup}
                            </div>
                            {tx.deliveryAddress && (
                              <div className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                                <MapPin className="h-3 w-3" />
                                {tx.deliveryAddress}, {tx.deliveryCity}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${parseFloat(tx.litres) > 0 ? 'text-green-600' : 'text-blue-600'}`}>
                            {parseFloat(tx.litres) > 0 ? '+' : ''}{parseFloat(tx.litres).toFixed(1)}L
                          </div>
                          <div className="text-xs text-slate-500">
                            {parseFloat(tx.previousLevel).toFixed(0)} → {parseFloat(tx.newLevel).toFixed(0)}L
                          </div>
                          <div className="text-xs text-slate-400">
                            {format(new Date(tx.createdAt), 'MMM d, h:mm a')}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        By: {tx.operatorName}
                        {tx.notes && <span className="ml-2">• {tx.notes}</span>}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTransactions(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAddTruck} onOpenChange={setShowAddTruck}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Truck</DialogTitle>
              <DialogDescription>Add a new truck to the fleet</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddTruck} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Unit Number *</Label>
                  <Input name="unitNumber" required placeholder="e.g., 001" data-testid="input-unit-number" />
                </div>
                <div>
                  <Label>Nickname</Label>
                  <Input name="name" placeholder="e.g., Big Blue" data-testid="input-truck-name" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Year *</Label>
                  <Input name="year" required placeholder="2024" data-testid="input-year" />
                </div>
                <div>
                  <Label>Make *</Label>
                  <Input name="make" required placeholder="Ford" data-testid="input-make" />
                </div>
                <div>
                  <Label>Model *</Label>
                  <Input name="model" required placeholder="F-550" data-testid="input-model" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>License Plate *</Label>
                  <Input name="licensePlate" required placeholder="ABC-1234" data-testid="input-license" />
                </div>
                <div>
                  <Label>VIN (optional)</Label>
                  <Input name="vinNumber" placeholder="1FDUF5..." data-testid="input-vin" />
                </div>
              </div>
              <div>
                <Label>Assigned Driver</Label>
                <Select name="assignedDriverId">
                  <SelectTrigger data-testid="select-driver">
                    <SelectValue placeholder="Select driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Sellable Fuel Tank Capacities (Litres)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>87 Regular</Label>
                    <Input name="regularCapacity" type="number" placeholder="0" data-testid="input-regular-capacity" />
                  </div>
                  <div>
                    <Label>91 Premium</Label>
                    <Input name="premiumCapacity" type="number" placeholder="0" data-testid="input-premium-capacity" />
                  </div>
                  <div>
                    <Label>Diesel</Label>
                    <Input name="dieselCapacity" type="number" placeholder="0" data-testid="input-diesel-capacity" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAddTruck(false)}>Cancel</Button>
                <Button type="submit" disabled={createTruckMutation.isPending} data-testid="button-submit-truck">
                  {createTruckMutation.isPending ? 'Adding...' : 'Add Truck'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={showPreTripDialog} onOpenChange={setShowPreTripDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-prairie-600" />
                Daily Pre-Trip Inspection
              </DialogTitle>
              <DialogDescription>
                {selectedTruck && `Unit #${selectedTruck.unitNumber} - ${selectedTruck.year} ${selectedTruck.make} ${selectedTruck.model}`}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div>
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Vehicle Condition
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'lightsWorking', label: 'Lights Working' },
                    { key: 'brakesWorking', label: 'Brakes Working' },
                    { key: 'tiresCondition', label: 'Tires Good' },
                    { key: 'mirrorsClear', label: 'Mirrors Clear' },
                    { key: 'hornWorking', label: 'Horn Working' },
                    { key: 'windshieldClear', label: 'Windshield Clear' },
                    { key: 'wipersWorking', label: 'Wipers Working' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox
                        id={key}
                        checked={preTripForm[key as keyof typeof preTripForm] as boolean}
                        onCheckedChange={(checked) => setPreTripForm(prev => ({ ...prev, [key]: checked }))}
                        data-testid={`checkbox-${key}`}
                      />
                      <Label htmlFor={key} className="text-sm cursor-pointer">{label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-blue-600" />
                  Fluid Levels
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'oilLevelOk', label: 'Oil OK' },
                    { key: 'coolantLevelOk', label: 'Coolant OK' },
                    { key: 'washerFluidOk', label: 'Washer OK' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox
                        id={key}
                        checked={preTripForm[key as keyof typeof preTripForm] as boolean}
                        onCheckedChange={(checked) => setPreTripForm(prev => ({ ...prev, [key]: checked }))}
                        data-testid={`checkbox-${key}`}
                      />
                      <Label htmlFor={key} className="text-sm cursor-pointer">{label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  Safety Equipment (TDG Required)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'fireExtinguisherPresent', label: 'Fire Extinguisher' },
                    { key: 'firstAidKitPresent', label: 'First Aid Kit' },
                    { key: 'spillKitPresent', label: 'Spill Kit' },
                    { key: 'tdgDocumentsPresent', label: 'TDG Documents' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox
                        id={key}
                        checked={preTripForm[key as keyof typeof preTripForm] as boolean}
                        onCheckedChange={(checked) => setPreTripForm(prev => ({ ...prev, [key]: checked }))}
                        data-testid={`checkbox-${key}`}
                      />
                      <Label htmlFor={key} className="text-sm cursor-pointer">{label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-sm mb-3">Readings</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Odometer *</Label>
                    <Input 
                      type="number" 
                      value={preTripForm.odometerReading}
                      onChange={(e) => setPreTripForm(prev => ({ ...prev, odometerReading: e.target.value }))}
                      placeholder="km"
                      data-testid="input-odometer"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-xs">Truck Fuel Tank ({TRUCK_FUEL_TANK_CAPACITY}L capacity)</Label>
                    <div className="flex gap-1 mt-1">
                      {(['E', '1/4', '1/2', '3/4', 'F'] as const).map((level) => (
                        <Button
                          key={level}
                          type="button"
                          size="sm"
                          variant={preTripForm.truckFuelLevelSelection === level ? 'default' : 'outline'}
                          className={`flex-1 text-xs px-1 ${preTripForm.truckFuelLevelSelection === level ? 'bg-copper hover:bg-copper/90' : ''}`}
                          onClick={() => handleTruckFuelLevelSelect(level)}
                          data-testid={`button-fuel-level-${level}`}
                        >
                          {level}
                        </Button>
                      ))}
                    </div>
                    {preTripForm.truckFuelLevel && (
                      <p className="text-xs text-muted-foreground mt-1">{preTripForm.truckFuelLevel}L</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Fuel Economy (L/100km)</Label>
                    <Input 
                      type="number" 
                      step="0.1"
                      value={preTripForm.fuelEconomy}
                      onChange={(e) => setPreTripForm(prev => ({ ...prev, fuelEconomy: e.target.value }))}
                      placeholder="15"
                      data-testid="input-fuel-economy"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-sm mb-3">Sellable Fuel Levels (Litres)</h4>
                <div className="grid grid-cols-3 gap-4">
                  {selectedTruck && parseFloat(selectedTruck.regularCapacity) > 0 && (
                    <div>
                      <Label className="text-xs">87 Regular</Label>
                      <Input 
                        type="number" 
                        value={preTripForm.regularFuelLevel}
                        onChange={(e) => setPreTripForm(prev => ({ ...prev, regularFuelLevel: e.target.value }))}
                        placeholder="0"
                        data-testid="input-regular-level"
                      />
                    </div>
                  )}
                  {selectedTruck && parseFloat(selectedTruck.premiumCapacity) > 0 && (
                    <div>
                      <Label className="text-xs">91 Premium</Label>
                      <Input 
                        type="number" 
                        value={preTripForm.premiumFuelLevel}
                        onChange={(e) => setPreTripForm(prev => ({ ...prev, premiumFuelLevel: e.target.value }))}
                        placeholder="0"
                        data-testid="input-premium-level"
                      />
                    </div>
                  )}
                  {selectedTruck && parseFloat(selectedTruck.dieselCapacity) > 0 && (
                    <div>
                      <Label className="text-xs">Diesel</Label>
                      <Input 
                        type="number" 
                        value={preTripForm.dieselFuelLevel}
                        onChange={(e) => setPreTripForm(prev => ({ ...prev, dieselFuelLevel: e.target.value }))}
                        placeholder="0"
                        data-testid="input-diesel-level"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-xs">Defects Noted</Label>
                <Textarea 
                  value={preTripForm.defectsNoted}
                  onChange={(e) => setPreTripForm(prev => ({ ...prev, defectsNoted: e.target.value }))}
                  placeholder="Describe any defects or issues found..."
                  className="mt-1"
                  data-testid="input-defects"
                />
              </div>

              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea 
                  value={preTripForm.notes}
                  onChange={(e) => setPreTripForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  className="mt-1"
                  data-testid="input-pretrip-notes"
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => { setShowPreTripDialog(false); resetPreTripForm(); }}>
                Cancel
              </Button>
              <Button 
                onClick={handlePreTripSubmit} 
                disabled={!preTripForm.odometerReading || preTripMutation.isPending}
                data-testid="button-submit-pretrip"
              >
                {preTripMutation.isPending ? 'Submitting...' : 'Complete Inspection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditTruck} onOpenChange={setShowEditTruck}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Truck</DialogTitle>
              <DialogDescription>Update truck information</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditTruck} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Unit Number *</Label>
                  <Input 
                    value={truckForm.unitNumber}
                    onChange={(e) => setTruckForm(prev => ({ ...prev, unitNumber: e.target.value }))}
                    required 
                    data-testid="input-edit-unit-number" 
                  />
                </div>
                <div>
                  <Label>Nickname</Label>
                  <Input 
                    value={truckForm.name}
                    onChange={(e) => setTruckForm(prev => ({ ...prev, name: e.target.value }))}
                    data-testid="input-edit-truck-name" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Year *</Label>
                  <Input 
                    value={truckForm.year}
                    onChange={(e) => setTruckForm(prev => ({ ...prev, year: e.target.value }))}
                    required 
                    data-testid="input-edit-year" 
                  />
                </div>
                <div>
                  <Label>Make *</Label>
                  <Input 
                    value={truckForm.make}
                    onChange={(e) => setTruckForm(prev => ({ ...prev, make: e.target.value }))}
                    required 
                    data-testid="input-edit-make" 
                  />
                </div>
                <div>
                  <Label>Model *</Label>
                  <Input 
                    value={truckForm.model}
                    onChange={(e) => setTruckForm(prev => ({ ...prev, model: e.target.value }))}
                    required 
                    data-testid="input-edit-model" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>License Plate *</Label>
                  <Input 
                    value={truckForm.licensePlate}
                    onChange={(e) => setTruckForm(prev => ({ ...prev, licensePlate: e.target.value }))}
                    required 
                    data-testid="input-edit-license" 
                  />
                </div>
                <div>
                  <Label>VIN (optional)</Label>
                  <Input 
                    value={truckForm.vinNumber}
                    onChange={(e) => setTruckForm(prev => ({ ...prev, vinNumber: e.target.value }))}
                    data-testid="input-edit-vin" 
                  />
                </div>
              </div>
              <div>
                <Label>Assigned Driver</Label>
                <Select 
                  value={truckForm.assignedDriverId || 'none'} 
                  onValueChange={(v) => setTruckForm(prev => ({ ...prev, assignedDriverId: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger data-testid="select-edit-driver">
                    <SelectValue placeholder="Select driver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Driver</SelectItem>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Sellable Fuel Tank Capacities (Litres)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>87 Regular</Label>
                    <Input 
                      type="number" 
                      value={truckForm.regularCapacity}
                      onChange={(e) => setTruckForm(prev => ({ ...prev, regularCapacity: e.target.value }))}
                      data-testid="input-edit-regular-capacity" 
                    />
                  </div>
                  <div>
                    <Label>91 Premium</Label>
                    <Input 
                      type="number" 
                      value={truckForm.premiumCapacity}
                      onChange={(e) => setTruckForm(prev => ({ ...prev, premiumCapacity: e.target.value }))}
                      data-testid="input-edit-premium-capacity" 
                    />
                  </div>
                  <div>
                    <Label>Diesel</Label>
                    <Input 
                      type="number" 
                      value={truckForm.dieselCapacity}
                      onChange={(e) => setTruckForm(prev => ({ ...prev, dieselCapacity: e.target.value }))}
                      data-testid="input-edit-diesel-capacity" 
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowEditTruck(false)}>Cancel</Button>
                <Button type="submit" disabled={updateTruckMutation.isPending} data-testid="button-submit-edit-truck">
                  {updateTruckMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Delete Truck
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this truck from the fleet?
              </DialogDescription>
            </DialogHeader>
            {selectedTruck && (
              <div className="py-4">
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <p className="font-medium">Unit #{selectedTruck.unitNumber} {selectedTruck.name && `(${selectedTruck.name})`}</p>
                    <p className="text-sm text-muted-foreground">{selectedTruck.year} {selectedTruck.make} {selectedTruck.model}</p>
                    <p className="text-sm text-muted-foreground">{selectedTruck.licensePlate}</p>
                  </CardContent>
                </Card>
                <p className="text-sm text-red-600 mt-4">
                  This action cannot be undone. All associated fuel logs and records will be permanently deleted.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button 
                variant="destructive" 
                onClick={() => selectedTruck && deleteTruckMutation.mutate(selectedTruck.id)}
                disabled={deleteTruckMutation.isPending}
                data-testid="button-confirm-delete-truck"
              >
                {deleteTruckMutation.isPending ? 'Deleting...' : 'Delete Truck'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEmptyConfirm} onOpenChange={setShowEmptyConfirm}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Empty All Fuel
              </DialogTitle>
              <DialogDescription>
                This will reset all fuel levels on this truck to 0.
              </DialogDescription>
            </DialogHeader>
            {selectedTruck && (
              <div className="py-4">
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="pt-4">
                    <p className="font-medium text-red-800">Unit #{selectedTruck.unitNumber} {selectedTruck.name && `(${selectedTruck.name})`}</p>
                    <div className="mt-3 space-y-1 text-sm">
                      {parseFloat(selectedTruck.regularLevel) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-red-700">Regular</span>
                          <span className="font-medium text-red-800">{parseFloat(selectedTruck.regularLevel).toFixed(0)}L → 0L</span>
                        </div>
                      )}
                      {parseFloat(selectedTruck.premiumLevel) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-red-700">Premium</span>
                          <span className="font-medium text-red-800">{parseFloat(selectedTruck.premiumLevel).toFixed(0)}L → 0L</span>
                        </div>
                      )}
                      {parseFloat(selectedTruck.dieselLevel) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-red-700">Diesel</span>
                          <span className="font-medium text-red-800">{parseFloat(selectedTruck.dieselLevel).toFixed(0)}L → 0L</span>
                        </div>
                      )}
                      <div className="border-t border-red-300 pt-2 mt-2 flex justify-between font-bold">
                        <span className="text-red-700">Total Being Removed</span>
                        <span className="text-red-800">{getTotalFuelOnTruck(selectedTruck).toFixed(0)}L</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                  <p className="text-sm text-amber-800 font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Warning: This action cannot be undone
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    You are removing litres from your fleet inventory. These litres will be deducted from your total available deliverable fuel and cannot be recovered.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEmptyConfirm(false)}>Cancel</Button>
              <Button 
                variant="destructive" 
                onClick={() => selectedTruck && emptyTruckMutation.mutate(selectedTruck.id)}
                disabled={emptyTruckMutation.isPending}
                data-testid="button-confirm-empty-truck"
              >
                {emptyTruckMutation.isPending ? 'Emptying...' : 'Empty All Fuel'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </OpsLayout>
  );
}
