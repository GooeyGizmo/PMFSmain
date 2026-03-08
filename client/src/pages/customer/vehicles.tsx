import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useVehicles } from '@/lib/api-hooks';
import type { Vehicle } from '@shared/schema';
import { Car, Plus, Pencil, Trash2, Fuel, Ship, Caravan, Bike, Plug, Wrench, Tractor, Construction, Droplets, Flame, Wind, SprayCan, TreeDeciduous, AlertTriangle } from 'lucide-react';
import { Truck as PhosphorTruck } from '@phosphor-icons/react';

const PickupTruck = ({ className }: { className?: string }) => {
  const sizeMatch = className?.match(/[wh]-(\d+)/);
  const size = sizeMatch ? parseInt(sizeMatch[1]) * 4 : 24;
  return <PhosphorTruck size={size} weight="regular" className={className} />;
};

type EquipmentType = 'vehicle' | 'boat' | 'rv' | 'quads_toys' | 'generator' | 'tractor' | 'excavator' | 'skid_steer' | 'pump' | 'heater' | 'compressor' | 'pressure_washer' | 'lawn_equipment' | 'other';
type BodyStyle = 'car' | 'truck' | 'suv' | 'van' | 'sedan' | null;

const VEHICLE_TYPES: EquipmentType[] = ['vehicle', 'boat', 'rv', 'quads_toys'];
const EQUIPMENT_ONLY_TYPES: EquipmentType[] = ['generator', 'tractor', 'excavator', 'skid_steer', 'pump', 'heater', 'compressor', 'pressure_washer', 'lawn_equipment', 'other'];

const BODY_STYLES: { value: BodyStyle; label: string }[] = [
  { value: 'truck', label: 'Truck / Pickup' },
  { value: 'suv', label: 'SUV / Crossover' },
  { value: 'car', label: 'Car / Sedan' },
  { value: 'van', label: 'Van / Minivan' },
  { value: 'sedan', label: 'Sedan / Coupe' },
];

const ALL_TYPES: { value: EquipmentType; label: string; icon: typeof Car; category: 'vehicle' | 'equipment' }[] = [
  { value: 'vehicle', label: 'Vehicle', icon: Car, category: 'vehicle' },
  { value: 'boat', label: 'Boat', icon: Ship, category: 'vehicle' },
  { value: 'rv', label: 'RV', icon: Caravan, category: 'vehicle' },
  { value: 'quads_toys', label: 'Quads / Toys', icon: Bike, category: 'vehicle' },
  { value: 'generator', label: 'Generator', icon: Plug, category: 'equipment' },
  { value: 'tractor', label: 'Tractor', icon: Tractor, category: 'equipment' },
  { value: 'excavator', label: 'Excavator / Heavy Equipment', icon: Construction, category: 'equipment' },
  { value: 'skid_steer', label: 'Skid Steer / Loader', icon: Construction, category: 'equipment' },
  { value: 'pump', label: 'Pump', icon: Droplets, category: 'equipment' },
  { value: 'heater', label: 'Heater', icon: Flame, category: 'equipment' },
  { value: 'compressor', label: 'Air Compressor', icon: Wind, category: 'equipment' },
  { value: 'pressure_washer', label: 'Pressure Washer', icon: SprayCan, category: 'equipment' },
  { value: 'lawn_equipment', label: 'Lawn Equipment', icon: TreeDeciduous, category: 'equipment' },
  { value: 'other', label: 'Other Equipment', icon: Wrench, category: 'equipment' },
];

const getTypeInfo = (type: EquipmentType) => {
  return ALL_TYPES.find(e => e.value === type) || ALL_TYPES[0];
};

const getEquipmentIcon = (type: EquipmentType, bodyStyle?: BodyStyle): React.ComponentType<{ className?: string }> => {
  if (type === 'vehicle') {
    switch (bodyStyle) {
      case 'truck': return PickupTruck;
      case 'suv': return Car;
      case 'van': return Car;
      case 'car': 
      case 'sedan': return Car;
      default: return Car;
    }
  }
  return getTypeInfo(type).icon;
};

export { getEquipmentIcon };

const getEquipmentLabel = (type: EquipmentType) => {
  return getTypeInfo(type).label;
};

interface VehiclesProps {
  embedded?: boolean;
  filter?: 'vehicles' | 'equipment';
}

export default function Vehicles({ embedded = false, filter = 'vehicles' }: VehiclesProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { vehicles: allVehicles, isLoading, addVehicle, updateVehicle, deleteVehicle } = useVehicles();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  const allowedTypes = filter === 'vehicles' ? VEHICLE_TYPES : EQUIPMENT_ONLY_TYPES;
  const vehicles = allVehicles.filter(v => allowedTypes.includes((v.equipmentType || 'vehicle') as EquipmentType));
  const selectableTypes = ALL_TYPES.filter(t => allowedTypes.includes(t.value));
  
  const categoryLabel = filter === 'vehicles' ? 'Vehicle' : 'Equipment';
  const categoryLabelPlural = filter === 'vehicles' ? 'Vehicles' : 'Equipment';

  const [form, setForm] = useState({
    equipmentType: (filter === 'vehicles' ? 'vehicle' : 'generator') as EquipmentType,
    bodyStyle: null as BodyStyle,
    year: '',
    make: '',
    model: '',
    color: '',
    licensePlate: '',
    hullId: '',
    nickname: '',
    fuelType: 'regular' as 'regular' | 'premium' | 'diesel',
    tankCapacity: '',
  });

  const [tankAutoFilled, setTankAutoFilled] = useState(false);
  const lookupTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (editingVehicle) return;
    if (!form.make || !form.model || !form.fuelType) return;
    if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
    lookupTimeoutRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          make: form.make,
          model: form.model,
          fuelType: form.fuelType,
        });
        if (form.year) params.set('year', form.year);
        const res = await fetch(`/api/vehicles/tank-capacity?${params}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.capacity) {
            setForm(prev => ({ ...prev, tankCapacity: String(data.capacity) }));
            setTankAutoFilled(true);
          }
        }
      } catch {}
    }, 400);
    return () => { if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current); };
  }, [form.year, form.make, form.model, form.fuelType, editingVehicle]);

  const resetForm = () => {
    setTankAutoFilled(false);
    setForm({
      equipmentType: filter === 'vehicles' ? 'vehicle' : 'generator',
      bodyStyle: null,
      year: '',
      make: '',
      model: '',
      color: '',
      licensePlate: '',
      hullId: '',
      nickname: '',
      fuelType: 'regular',
      tankCapacity: '',
    });
  };

  const handleAddVehicle = async () => {
    const result = await addVehicle({
      equipmentType: form.equipmentType,
      bodyStyle: form.equipmentType === 'vehicle' ? form.bodyStyle : null,
      year: form.year || null,
      make: form.make,
      model: form.model,
      color: form.color || null,
      licensePlate: form.licensePlate || null,
      hullId: form.hullId || null,
      nickname: form.nickname || null,
      fuelType: form.fuelType,
      tankCapacity: parseInt(form.tankCapacity),
    });
    
    if (result.success) {
      setIsAddOpen(false);
      resetForm();
      const displayName = form.nickname || `${form.make} ${form.model}`;
      toast({ title: `${getEquipmentLabel(form.equipmentType)} added`, description: `${displayName} has been added.` });
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to add equipment', variant: 'destructive' });
    }
  };

  const handleEditVehicle = async () => {
    if (!editingVehicle) return;
    
    const result = await updateVehicle(editingVehicle.id, {
      equipmentType: form.equipmentType,
      bodyStyle: form.equipmentType === 'vehicle' ? form.bodyStyle : null,
      year: form.year || null,
      make: form.make,
      model: form.model,
      color: form.color || null,
      licensePlate: form.licensePlate || null,
      hullId: form.hullId || null,
      nickname: form.nickname || null,
      fuelType: form.fuelType,
      tankCapacity: parseInt(form.tankCapacity),
    });
    
    if (result.success) {
      setEditingVehicle(null);
      resetForm();
      toast({ title: 'Updated', description: 'Your equipment information has been updated.' });
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to update equipment', variant: 'destructive' });
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    const result = await deleteVehicle(id);
    if (result.success) {
      toast({ title: 'Removed', description: 'The equipment has been removed from your account.' });
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to delete equipment', variant: 'destructive' });
    }
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setForm({
      equipmentType: (vehicle.equipmentType || 'vehicle') as EquipmentType,
      bodyStyle: ((vehicle as any).bodyStyle || null) as BodyStyle,
      year: vehicle.year?.toString() || '',
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color || '',
      licensePlate: vehicle.licensePlate || '',
      hullId: (vehicle as any).hullId || '',
      nickname: (vehicle as any).nickname || '',
      fuelType: vehicle.fuelType,
      tankCapacity: vehicle.tankCapacity.toString(),
    });
  };

  const showYear = ['vehicle', 'boat', 'rv'].includes(form.equipmentType);
  const showColor = ['vehicle', 'rv'].includes(form.equipmentType);
  const showLicensePlate = ['vehicle', 'rv'].includes(form.equipmentType);
  const showHullId = form.equipmentType === 'boat';
  const showBodyStyle = form.equipmentType === 'vehicle';

  const renderFormFields = () => (
    <>
      <div className="space-y-2">
        <Label htmlFor="equipmentType">{categoryLabel} Type</Label>
        <Select 
          value={form.equipmentType} 
          onValueChange={(v) => setForm(prev => ({ ...prev, equipmentType: v as EquipmentType }))}
        >
          <SelectTrigger data-testid="select-equipment-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectableTypes.map(type => (
              <SelectItem key={type.value} value={type.value}>
                <div className="flex items-center gap-2">
                  <type.icon className="w-4 h-4" />
                  {type.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showBodyStyle && (
        <div className="space-y-2">
          <Label htmlFor="bodyStyle">Body Style</Label>
          <Select 
            value={form.bodyStyle || ''} 
            onValueChange={(v) => setForm(prev => ({ ...prev, bodyStyle: v as BodyStyle }))}
          >
            <SelectTrigger data-testid="select-body-style">
              <SelectValue placeholder="Select body style..." />
            </SelectTrigger>
            <SelectContent>
              {BODY_STYLES.map(style => (
                <SelectItem key={style.value} value={style.value || ''}>
                  {style.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="nickname">Nickname (optional)</Label>
        <Input
          id="nickname"
          placeholder="My Farm Truck"
          value={form.nickname}
          onChange={(e) => setForm(prev => ({ ...prev, nickname: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {showYear && (
          <div className="space-y-2">
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              type="number"
              placeholder="2023"
              value={form.year}
              onChange={(e) => setForm(prev => ({ ...prev, year: e.target.value }))}
            />
          </div>
        )}
        <div className={`space-y-2 ${!showYear ? 'col-span-2' : ''}`}>
          <Label htmlFor="make">Make</Label>
          <Input
            id="make"
            placeholder={form.equipmentType === 'generator' ? 'Honda' : 'Ford'}
            value={form.make}
            onChange={(e) => setForm(prev => ({ ...prev, make: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            placeholder={form.equipmentType === 'generator' ? 'EU2200i' : form.equipmentType === 'boat' ? 'Tracker Pro' : 'F-150'}
            value={form.model}
            onChange={(e) => setForm(prev => ({ ...prev, model: e.target.value }))}
          />
        </div>
        {showColor && (
          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <Input
              id="color"
              placeholder="White"
              value={form.color}
              onChange={(e) => setForm(prev => ({ ...prev, color: e.target.value }))}
            />
          </div>
        )}
      </div>

      {showLicensePlate && (
        <div className="space-y-2">
          <Label htmlFor="licensePlate">License Plate</Label>
          <Input
            id="licensePlate"
            placeholder="ABC 123"
            value={form.licensePlate}
            onChange={(e) => setForm(prev => ({ ...prev, licensePlate: e.target.value }))}
          />
        </div>
      )}

      {showHullId && (
        <div className="space-y-2">
          <Label htmlFor="hullId">Hull ID</Label>
          <Input
            id="hullId"
            placeholder="ABC12345D707"
            value={form.hullId}
            onChange={(e) => setForm(prev => ({ ...prev, hullId: e.target.value }))}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fuelType">Fuel Type</Label>
          <Select value={form.fuelType} onValueChange={(v) => setForm(prev => ({ ...prev, fuelType: v as any }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="regular">Regular 87 Gas</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="diesel">Diesel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tankCapacity">Tank Capacity (L)</Label>
          <Input
            id="tankCapacity"
            data-testid="input-tank-capacity"
            type="number"
            placeholder={form.equipmentType === 'generator' ? '3.6' : '60'}
            value={form.tankCapacity}
            onChange={(e) => { setForm(prev => ({ ...prev, tankCapacity: e.target.value })); setTankAutoFilled(false); }}
            className={tankAutoFilled ? 'border-green-400 bg-green-50' : ''}
          />
          {tankAutoFilled && (
            <p className="text-xs text-green-600">Auto-filled based on vehicle specs</p>
          )}
        </div>
      </div>
    </>
  );

  const getDisplayName = (vehicle: Vehicle) => {
    const v = vehicle as any;
    if (v.nickname) return v.nickname;
    if (vehicle.year) return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    return `${vehicle.make} ${vehicle.model}`;
  };

  const getSubtext = (vehicle: Vehicle) => {
    const v = vehicle as any;
    if (v.nickname && vehicle.year) return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    if (v.nickname) return `${vehicle.make} ${vehicle.model}`;
    return vehicle.color || getEquipmentLabel((v.equipmentType || 'vehicle') as EquipmentType);
  };

  const content = (
    <div className={embedded ? "" : "max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6"}>
      <div className="flex items-center justify-between mb-6">
        {!embedded && (
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">My Equipment</h1>
            <p className="text-muted-foreground mt-1">Manage your vehicles, boats, generators, and other equipment</p>
          </div>
        )}
        {embedded && (
          <div>
            <h3 className="font-semibold text-foreground">
              {filter === 'vehicles' ? 'Your Vehicles' : 'Your Equipment'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {filter === 'vehicles' 
                ? 'Manage your registered vehicles' 
                : 'Manage your registered equipment'}
            </p>
          </div>
        )}
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-copper hover:bg-copper/90" data-testid="button-add-vehicle">
              <Plus className="w-4 h-4 mr-2" />
                Add {categoryLabel}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Add New {categoryLabel}</DialogTitle>
                <DialogDescription>
                  {filter === 'vehicles' 
                    ? 'Enter details for your vehicle, boat, RV, or recreational equipment' 
                    : 'Enter details for your generator or other fuel-consuming equipment'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {renderFormFields()}
                <Button className="w-full bg-copper hover:bg-copper/90" onClick={handleAddVehicle}>
                  Add {categoryLabel}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {filter === 'vehicles' && vehicles.filter(v => !v.licensePlate).length > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {vehicles.filter(v => !v.licensePlate).length === 1 ? '1 vehicle needs' : `${vehicles.filter(v => !v.licensePlate).length} vehicles need`} a license plate
                </p>
                <p className="text-xs text-amber-600">Tap edit on the vehicle to add the missing info before booking a delivery</p>
              </div>
            </CardContent>
          </Card>
        )}

        {vehicles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              {filter === 'vehicles' ? (
                <Car className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              ) : (
                <Plug className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              )}
              <h3 className="font-display text-lg font-semibold mb-2">No {categoryLabelPlural.toLowerCase()} yet</h3>
              <p className="text-muted-foreground mb-4">
                {filter === 'vehicles' 
                  ? 'Add your first vehicle, boat, or RV to start booking fuel deliveries' 
                  : 'Add your first generator or other equipment to start booking fuel deliveries'}
              </p>
              <Button className="bg-copper hover:bg-copper/90" onClick={() => setIsAddOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First {categoryLabel}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {vehicles.map((vehicle, i) => {
              const v = vehicle as any;
              const equipType = (v.equipmentType || 'vehicle') as EquipmentType;
              const bodyStyle = (v.bodyStyle || null) as BodyStyle;
              const Icon = getEquipmentIcon(equipType, bodyStyle);
              return (
                <motion.div
                  key={vehicle.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="border-border hover:border-copper/30 transition-colors">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-copper/10 flex items-center justify-center">
                            <Icon className="w-6 h-6 text-copper" />
                          </div>
                          <div>
                            <h3 className="font-display font-semibold text-foreground">
                              {getDisplayName(vehicle)}
                            </h3>
                            <p className="text-sm text-muted-foreground">{getSubtext(vehicle)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(vehicle)}
                            data-testid={`button-edit-vehicle-${vehicle.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteVehicle(vehicle.id)}
                            data-testid={`button-delete-vehicle-${vehicle.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {vehicle.licensePlate ? (
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-muted-foreground text-xs mb-1">License Plate</p>
                            <p className="font-medium">{vehicle.licensePlate}</p>
                          </div>
                        ) : filter === 'vehicles' && (v.equipmentType === 'vehicle' || !v.equipmentType) ? (
                          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 cursor-pointer" onClick={() => openEditDialog(vehicle)}>
                            <p className="text-amber-600 text-xs mb-1">License Plate</p>
                            <p className="font-medium text-amber-700 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" /> Required
                            </p>
                          </div>
                        ) : null}
                        {v.hullId && (
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-muted-foreground text-xs mb-1">Hull ID</p>
                            <p className="font-medium">{v.hullId}</p>
                          </div>
                        )}
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-muted-foreground text-xs mb-1">Fuel Type</p>
                          <p className="font-medium capitalize">{vehicle.fuelType}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-muted-foreground text-xs mb-1">Tank Capacity</p>
                          <p className="font-medium">{vehicle.tankCapacity}L</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        <Dialog open={!!editingVehicle} onOpenChange={(open) => { if (!open) { setEditingVehicle(null); resetForm(); } }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Edit {categoryLabel}</DialogTitle>
              <DialogDescription>Update your {categoryLabel.toLowerCase()} details</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {renderFormFields()}
              <Button className="w-full bg-copper hover:bg-copper/90" onClick={handleEditVehicle}>
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );

  return content;
}
