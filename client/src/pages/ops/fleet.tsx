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
  AlertTriangle, Phone, Mail, Plus, Droplets,
  FileText, Download, Calendar, Wrench, ChevronRight,
  AlertCircle, CheckCircle2, RefreshCw, ClipboardCheck
} from 'lucide-react';
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
  const [showFillDialog, setShowFillDialog] = useState(false);
  const [showEmergencyDialog, setShowEmergencyDialog] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [showPreTripDialog, setShowPreTripDialog] = useState(false);
  const [fillFuelType, setFillFuelType] = useState<'regular' | 'premium' | 'diesel'>('regular');
  const [fillLitres, setFillLitres] = useState('');
  const [fillNotes, setFillNotes] = useState('');
  const [transactionFilter, setTransactionFilter] = useState<string>('all');
  
  // Pre-trip inspection form state
  const [preTripForm, setPreTripForm] = useState({
    lightsWorking: true,
    brakesWorking: true,
    tiresCondition: true,
    mirrorsClear: true,
    hornWorking: true,
    windshieldClear: true,
    wipersWorking: true,
    oilLevelOk: true,
    coolantLevelOk: true,
    washerFluidOk: true,
    fireExtinguisherPresent: true,
    firstAidKitPresent: true,
    spillKitPresent: true,
    tdgDocumentsPresent: true,
    odometerReading: '',
    regularFuelLevel: '',
    premiumFuelLevel: '',
    dieselFuelLevel: '',
    truckFuelLevel: '',
    fuelEconomy: '15',
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
    queryKey: ['/api/ops/fleet/trucks', selectedTruck?.id, 'transactions'],
    enabled: !!selectedTruck && showTransactions,
    queryFn: () => apiRequest('GET', `/api/ops/fleet/trucks/${selectedTruck?.id}/transactions`).then(r => r.json()),
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
      lightsWorking: true,
      brakesWorking: true,
      tiresCondition: true,
      mirrorsClear: true,
      hornWorking: true,
      windshieldClear: true,
      wipersWorking: true,
      oilLevelOk: true,
      coolantLevelOk: true,
      washerFluidOk: true,
      fireExtinguisherPresent: true,
      firstAidKitPresent: true,
      spillKitPresent: true,
      tdgDocumentsPresent: true,
      odometerReading: '',
      regularFuelLevel: '',
      premiumFuelLevel: '',
      dieselFuelLevel: '',
      truckFuelLevel: '',
      fuelEconomy: '15',
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

  const handleFillFuel = () => {
    if (!selectedTruck || !fillLitres) return;
    fillFuelMutation.mutate({
      truckId: selectedTruck.id,
      fuelType: fillFuelType,
      litres: fillLitres,
      notes: fillNotes,
    });
  };

  const openPreTripDialog = (truck: Truck) => {
    setSelectedTruck(truck);
    setPreTripForm(prev => ({
      ...prev,
      regularFuelLevel: truck.regularLevel || '',
      premiumFuelLevel: truck.premiumLevel || '',
      dieselFuelLevel: truck.dieselLevel || '',
      odometerReading: truck.odometerReading?.toString() || '',
    }));
    setShowPreTripDialog(true);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-prairie-50">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/ops">
              <Button variant="ghost" size="sm" data-testid="link-back-ops">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Fleet Management</h1>
              <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">TDG-compliant fuel tracking & truck management</p>
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
                          variant={getPreTripStatus(truck.id)?.hasInspection ? "outline" : "default"}
                          className={`flex-1 min-w-[80px] ${!getPreTripStatus(truck.id)?.hasInspection ? 'bg-prairie-600 hover:bg-prairie-700' : ''}`}
                          onClick={() => openPreTripDialog(truck)}
                          data-testid={`button-pretrip-truck-${truck.id}`}
                        >
                          <ClipboardCheck className="h-3 w-3 mr-1" />
                          <span className="text-xs sm:text-sm">Pre-Trip</span>
                        </Button>
                        <Button 
                          size="sm" 
                          className="flex-1 min-w-[80px]"
                          onClick={() => { setSelectedTruck(truck); setShowFillDialog(true); }}
                          data-testid={`button-fill-truck-${truck.id}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          <span className="text-xs sm:text-sm">Fill</span>
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="flex-1 min-w-[80px]"
                          onClick={() => { setSelectedTruck(truck); setShowTransactions(true); }}
                          data-testid={`button-log-truck-${truck.id}`}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          <span className="text-xs sm:text-sm">Log</span>
                        </Button>
                      </div>
                      <Link href={`/ops/shipping-document/${truck.id}`}>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="w-full mt-2 border-prairie-300 text-prairie-700 hover:bg-prairie-50 text-xs sm:text-sm"
                          data-testid={`button-shipping-doc-${truck.id}`}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          TDG Doc
                        </Button>
                      </Link>
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

        <Dialog open={showFillDialog} onOpenChange={setShowFillDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Fuel Fill</DialogTitle>
              <DialogDescription>
                {selectedTruck && `Adding fuel to Unit #${selectedTruck.unitNumber}`}
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
                <Label>Litres Added</Label>
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
                  placeholder="e.g., Filled at Shell station on 16th Ave"
                  data-testid="input-fill-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFillDialog(false)}>Cancel</Button>
              <Button onClick={handleFillFuel} disabled={!fillLitres || fillFuelMutation.isPending} data-testid="button-confirm-fill">
                {fillFuelMutation.isPending ? 'Recording...' : 'Record Fill'}
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
              <div className="flex gap-2">
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
                <Button variant="outline" size="sm" data-testid="button-download-pdf">
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
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
                  <div>
                    <Label className="text-xs">Truck Fuel Tank (L)</Label>
                    <Input 
                      type="number" 
                      value={preTripForm.truckFuelLevel}
                      onChange={(e) => setPreTripForm(prev => ({ ...prev, truckFuelLevel: e.target.value }))}
                      placeholder="Litres"
                      data-testid="input-truck-fuel"
                    />
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
      </div>
    </div>
  );
}
