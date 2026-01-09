import { useState } from 'react';
import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
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
import { Car, Plus, Pencil, Trash2, Fuel } from 'lucide-react';

export default function Vehicles() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { vehicles, isLoading, addVehicle, updateVehicle, deleteVehicle } = useVehicles();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  const [form, setForm] = useState({
    year: '',
    make: '',
    model: '',
    color: '',
    licensePlate: '',
    fuelType: 'regular' as 'regular' | 'premium' | 'diesel',
    tankCapacity: '',
  });

  const resetForm = () => {
    setForm({ year: '', make: '', model: '', color: '', licensePlate: '', fuelType: 'regular', tankCapacity: '' });
  };

  const handleAddVehicle = async () => {
    const result = await addVehicle({
      year: form.year,
      make: form.make,
      model: form.model,
      color: form.color,
      licensePlate: form.licensePlate,
      fuelType: form.fuelType,
      tankCapacity: parseInt(form.tankCapacity),
    });
    
    if (result.success) {
      setIsAddOpen(false);
      resetForm();
      toast({ title: 'Vehicle added', description: `${form.year} ${form.make} ${form.model} has been added.` });
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to add vehicle', variant: 'destructive' });
    }
  };

  const handleEditVehicle = async () => {
    if (!editingVehicle) return;
    
    const result = await updateVehicle(editingVehicle.id, {
      year: form.year,
      make: form.make,
      model: form.model,
      color: form.color,
      licensePlate: form.licensePlate,
      fuelType: form.fuelType,
      tankCapacity: parseInt(form.tankCapacity),
    });
    
    if (result.success) {
      setEditingVehicle(null);
      resetForm();
      toast({ title: 'Vehicle updated', description: 'Your vehicle information has been updated.' });
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to update vehicle', variant: 'destructive' });
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    const result = await deleteVehicle(id);
    if (result.success) {
      toast({ title: 'Vehicle removed', description: 'The vehicle has been removed from your account.' });
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to delete vehicle', variant: 'destructive' });
    }
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setForm({
      year: vehicle.year.toString(),
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      licensePlate: vehicle.licensePlate,
      fuelType: vehicle.fuelType,
      tankCapacity: vehicle.tankCapacity.toString(),
    });
  };

  const VehicleForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
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
        <div className="space-y-2">
          <Label htmlFor="make">Make</Label>
          <Input
            id="make"
            placeholder="Ford"
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
            placeholder="F-150"
            value={form.model}
            onChange={(e) => setForm(prev => ({ ...prev, model: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="color">Color</Label>
          <Input
            id="color"
            placeholder="White"
            value={form.color}
            onChange={(e) => setForm(prev => ({ ...prev, color: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="licensePlate">License Plate</Label>
        <Input
          id="licensePlate"
          placeholder="ABC 123"
          value={form.licensePlate}
          onChange={(e) => setForm(prev => ({ ...prev, licensePlate: e.target.value }))}
        />
      </div>
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
            type="number"
            placeholder="60"
            value={form.tankCapacity}
            onChange={(e) => setForm(prev => ({ ...prev, tankCapacity: e.target.value }))}
          />
        </div>
      </div>
      <Button className="w-full bg-copper hover:bg-copper/90" onClick={onSubmit}>
        {submitLabel}
      </Button>
    </div>
  );

  return (
    <CustomerLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">My Vehicles</h1>
            <p className="text-muted-foreground mt-1">Manage your registered vehicles</p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-copper hover:bg-copper/90" data-testid="button-add-vehicle">
                <Plus className="w-4 h-4 mr-2" />
                Add Vehicle
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Add New Vehicle</DialogTitle>
                <DialogDescription>Enter your vehicle details</DialogDescription>
              </DialogHeader>
              <VehicleForm onSubmit={handleAddVehicle} submitLabel="Add Vehicle" />
            </DialogContent>
          </Dialog>
        </div>

        {vehicles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Car className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-display text-lg font-semibold mb-2">No vehicles yet</h3>
              <p className="text-muted-foreground mb-4">Add your first vehicle to start booking deliveries</p>
              <Button className="bg-copper hover:bg-copper/90" onClick={() => setIsAddOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Vehicle
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {vehicles.map((vehicle, i) => (
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
                          <Car className="w-6 h-6 text-copper" />
                        </div>
                        <div>
                          <h3 className="font-display font-semibold text-foreground">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </h3>
                          <p className="text-sm text-muted-foreground">{vehicle.color}</p>
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
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-muted-foreground text-xs mb-1">License Plate</p>
                        <p className="font-medium">{vehicle.licensePlate}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-muted-foreground text-xs mb-1">Fuel Type</p>
                        <p className="font-medium capitalize">{vehicle.fuelType}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                        <p className="text-muted-foreground text-xs mb-1">Tank Capacity</p>
                        <p className="font-medium">{vehicle.tankCapacity}L</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        <Dialog open={!!editingVehicle} onOpenChange={(open) => !open && setEditingVehicle(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Edit Vehicle</DialogTitle>
              <DialogDescription>Update your vehicle details</DialogDescription>
            </DialogHeader>
            <VehicleForm onSubmit={handleEditVehicle} submitLabel="Save Changes" />
          </DialogContent>
        </Dialog>
      </div>
    </CustomerLayout>
  );
}
