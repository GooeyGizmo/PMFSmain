import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import CustomerLayout from '@/components/customer-layout';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useVehicles } from '@/lib/api-hooks';
import { subscriptionTiers } from '@/lib/mockData';
import { Calendar, Plus, Pause, Play, Trash2, RefreshCw, Loader2, Car, Fuel, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';

interface VehicleFuelSetting {
  vehicleId: string;
  fuelType: 'regular' | 'premium' | 'diesel';
  fuelAmount: string;
  fillToFull: boolean;
}

interface RecurringProps {
  embedded?: boolean;
}

export default function Recurring({ embedded = false }: RecurringProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);
  const canUseRecurring = currentTier?.slug === 'household' || currentTier?.slug === 'rural' || currentTier?.slug === 'vip';

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    frequency: 'weekly' as 'weekly' | 'bi-weekly' | 'monthly',
    dayOfWeek: '1',
    dayOfMonth: '1',
    preferredWindow: '9:00 AM - 10:30 AM',
  });
  const [selectedVehicles, setSelectedVehicles] = useState<VehicleFuelSetting[]>([]);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const deliveryWindows = [
    '6:00 AM - 7:30 AM',
    '7:30 AM - 9:00 AM',
    '9:00 AM - 10:30 AM',
    '10:30 AM - 12:00 PM',
    '12:00 PM - 1:30 PM',
    '1:30 PM - 3:00 PM',
    '3:00 PM - 4:30 PM',
    '4:30 PM - 6:00 PM',
    '6:00 PM - 7:30 PM',
  ];

  const { vehicles, isLoading: vehiclesLoading, refetch: refetchVehicles } = useVehicles();
  
  // Refetch vehicles when dialog opens to ensure fresh data
  const handleOpenDialog = () => {
    setIsAddOpen(true);
    refetchVehicles();
  };

  const { data: schedulesData, isLoading } = useQuery<{ schedules: any[] }>({
    queryKey: ['/api/recurring-schedules'],
  });
  const schedules = schedulesData?.schedules || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/recurring-schedules', data);
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest('PATCH', `/api/recurring-schedules/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-schedules'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/recurring-schedules/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-schedules'] });
      toast({ title: 'Schedule deleted', description: 'The recurring delivery has been removed.' });
    }
  });

  const handleVehicleToggle = (vehicle: any, checked: boolean) => {
    if (checked) {
      setSelectedVehicles(prev => [...prev, {
        vehicleId: vehicle.id,
        fuelType: vehicle.fuelType || 'regular',
        fuelAmount: '40',
        fillToFull: false,
      }]);
    } else {
      setSelectedVehicles(prev => prev.filter(v => v.vehicleId !== vehicle.id));
    }
  };

  const updateVehicleSetting = (vehicleId: string, field: keyof VehicleFuelSetting, value: any) => {
    setSelectedVehicles(prev => prev.map(v => {
      if (v.vehicleId !== vehicleId) return v;
      
      if (field === 'fillToFull' && value === true) {
        return { ...v, fillToFull: true, fuelAmount: '150' };
      }
      if (field === 'fillToFull' && value === false) {
        return { ...v, fillToFull: false, fuelAmount: '40' };
      }
      return { ...v, [field]: value };
    }));
  };

  const handleAddSchedule = async () => {
    if (selectedVehicles.length === 0) {
      toast({ title: 'No vehicles selected', description: 'Please select at least one vehicle.', variant: 'destructive' });
      return;
    }

    for (const sv of selectedVehicles) {
      if (!sv.fillToFull) {
        const amount = parseFloat(sv.fuelAmount);
        if (isNaN(amount) || amount < 20 || amount > 200) {
          const vehicle = vehicles.find((v: any) => v.id === sv.vehicleId);
          toast({ 
            title: 'Invalid fuel amount', 
            description: `Please enter a valid amount (20-200L) for ${vehicle?.year} ${vehicle?.make} ${vehicle?.model}.`, 
            variant: 'destructive' 
          });
          return;
        }
      }
    }

    let successCount = 0;
    let failCount = 0;
    
    for (const sv of selectedVehicles) {
      try {
        await createMutation.mutateAsync({
          vehicleId: sv.vehicleId,
          frequency: form.frequency,
          dayOfWeek: form.frequency !== 'monthly' ? parseInt(form.dayOfWeek) : undefined,
          dayOfMonth: form.frequency === 'monthly' ? parseInt(form.dayOfMonth) : undefined,
          preferredWindow: form.preferredWindow,
          fuelType: sv.fuelType,
          fuelAmount: sv.fillToFull ? '150' : parseFloat(sv.fuelAmount).toString(),
          fillToFull: sv.fillToFull,
        });
        successCount++;
      } catch (error) {
        failCount++;
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ['/api/recurring-schedules'] });
    
    if (failCount === 0) {
      toast({ 
        title: 'Schedules created', 
        description: `${successCount} recurring ${successCount === 1 ? 'delivery' : 'deliveries'} set up successfully.` 
      });
      setIsAddOpen(false);
      setForm({ frequency: 'weekly', dayOfWeek: '1', dayOfMonth: '1', preferredWindow: '9:00 AM - 10:30 AM' });
      setSelectedVehicles([]);
    } else if (successCount > 0) {
      toast({ 
        title: 'Partial success', 
        description: `${successCount} created, ${failCount} failed. Please try again for failed vehicles.`,
        variant: 'destructive'
      });
    } else {
      toast({ 
        title: 'Error', 
        description: 'Failed to create schedules. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const getVehicleName = (vehicleId: string) => {
    const vehicle = vehicles.find((v: any) => v.id === vehicleId);
    return vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown Vehicle';
  };

  const getVehicleById = (vehicleId: string) => {
    return vehicles.find((v: any) => v.id === vehicleId);
  };

  const Wrapper = embedded ? ({ children }: { children: React.ReactNode }) => <>{children}</> : CustomerLayout;

  if (!canUseRecurring) {
    return (
      <Wrapper>
        <div className={embedded ? "py-4" : "max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6"}>
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-display text-lg font-semibold mb-2">Upgrade Required</h3>
              <p className="text-muted-foreground mb-4">
                Recurring deliveries are available on Household and Rural plans.
              </p>
              <Button className="bg-copper hover:bg-copper/90" onClick={() => window.location.href = '/app/account?tab=subscription'}>
                View Plans
              </Button>
            </CardContent>
          </Card>
        </div>
      </Wrapper>
    );
  }

  if (isLoading) {
    return (
      <Wrapper>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-copper" />
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <div className={embedded ? "py-4 space-y-6" : "max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Recurring Deliveries</h1>
            <p className="text-muted-foreground mt-1">Set up automatic fuel deliveries</p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={(open) => {
            setIsAddOpen(open);
            if (open) {
              refetchVehicles();
            } else {
              setSelectedVehicles([]);
              setForm({ frequency: 'weekly', dayOfWeek: '1', dayOfMonth: '1', preferredWindow: '9:00 AM - 10:30 AM' });
            }
          }}>
            <DialogTrigger asChild>
              <Button className="bg-copper hover:bg-copper/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">New Recurring Delivery</DialogTitle>
                <DialogDescription>Select vehicles and set up automatic fuel deliveries</DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-base font-medium">Select Vehicles</Label>
                  {vehiclesLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : vehicles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No vehicles found. Add a vehicle first.</p>
                  ) : (
                    <div className="space-y-2">
                      {vehicles.map((vehicle: any) => {
                        const isSelected = selectedVehicles.some(v => v.vehicleId === vehicle.id);
                        const vehicleSetting = selectedVehicles.find(v => v.vehicleId === vehicle.id);
                        
                        return (
                          <div key={vehicle.id} className="border rounded-lg p-3 space-y-3">
                            <div className="flex items-center gap-3">
                              <Checkbox 
                                id={`vehicle-${vehicle.id}`}
                                checked={isSelected}
                                onCheckedChange={(checked) => handleVehicleToggle(vehicle, checked as boolean)}
                              />
                              <label 
                                htmlFor={`vehicle-${vehicle.id}`}
                                className="flex items-center gap-2 cursor-pointer flex-1"
                              >
                                <Car className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium">{vehicle.year} {vehicle.make} {vehicle.model}</span>
                                <Badge variant="outline" className="text-xs">{vehicle.fuelType}</Badge>
                              </label>
                            </div>
                            
                            {isSelected && vehicleSetting && (
                              <div className="pl-7 space-y-3 border-t pt-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Fuel Type</Label>
                                    <Select 
                                      value={vehicleSetting.fuelType} 
                                      onValueChange={(v) => updateVehicleSetting(vehicle.id, 'fuelType', v)}
                                    >
                                      <SelectTrigger className="h-9">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="regular">Regular</SelectItem>
                                        <SelectItem value="premium">Premium</SelectItem>
                                        <SelectItem value="diesel">Diesel</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Amount (Litres)</Label>
                                    <Input
                                      type="number"
                                      step="0.1"
                                      min="20"
                                      max="200"
                                      placeholder="e.g. 45.50"
                                      value={vehicleSetting.fuelAmount}
                                      onChange={(e) => updateVehicleSetting(vehicle.id, 'fuelAmount', e.target.value)}
                                      disabled={vehicleSetting.fillToFull}
                                      className="h-9"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <Label className="text-xs">Fill to Full (150L)</Label>
                                  </div>
                                  <Switch 
                                    checked={vehicleSetting.fillToFull} 
                                    onCheckedChange={(c) => updateVehicleSetting(vehicle.id, 'fillToFull', c)} 
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedVehicles.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select value={form.frequency} onValueChange={(v) => setForm(prev => ({ ...prev, frequency: v as any }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="bi-weekly">Every 2 Weeks</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {form.frequency !== 'monthly' ? (
                      <div className="space-y-2">
                        <Label>Day of Week</Label>
                        <Select value={form.dayOfWeek} onValueChange={(v) => setForm(prev => ({ ...prev, dayOfWeek: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {dayNames.map((day, i) => (
                              <SelectItem key={i} value={i.toString()}>{day}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Day of Month</Label>
                        <Select value={form.dayOfMonth} onValueChange={(v) => setForm(prev => ({ ...prev, dayOfMonth: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                              <SelectItem key={day} value={day.toString()}>{day}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <Label>Preferred Delivery Window</Label>
                      <Select value={form.preferredWindow} onValueChange={(v) => setForm(prev => ({ ...prev, preferredWindow: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {deliveryWindows.map(window => (
                            <SelectItem key={window} value={window}>{window}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <Button 
                  className="w-full bg-copper hover:bg-copper/90" 
                  onClick={handleAddSchedule} 
                  disabled={selectedVehicles.length === 0 || createMutation.isPending}
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Create Schedule{selectedVehicles.length > 1 ? 's' : ''} ({selectedVehicles.length} vehicle{selectedVehicles.length !== 1 ? 's' : ''})
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {schedules.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-display text-lg font-semibold mb-2">No recurring deliveries</h3>
              <p className="text-muted-foreground mb-4">Set up automatic fuel deliveries on a schedule</p>
              <Button className="bg-copper hover:bg-copper/90" onClick={handleOpenDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Schedule
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule: any, i: number) => (
              <motion.div
                key={schedule.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className={`border-border ${!schedule.active ? 'opacity-60' : ''}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${schedule.active ? 'bg-copper/10 text-copper' : 'bg-muted text-muted-foreground'}`}>
                          <RefreshCw className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-medium text-foreground">{getVehicleName(schedule.vehicleId)}</h3>
                          <p className="text-sm text-muted-foreground">
                            {schedule.frequency === 'weekly' && `Every ${dayNames[schedule.dayOfWeek]}`}
                            {schedule.frequency === 'bi-weekly' && `Every other ${dayNames[schedule.dayOfWeek]}`}
                            {schedule.frequency === 'monthly' && `${schedule.dayOfMonth}${['st', 'nd', 'rd'][schedule.dayOfMonth - 1] || 'th'} of each month`}
                            {' · '}{schedule.fuelType && <span className="capitalize">{schedule.fuelType}</span>}
                            {' · '}{schedule.fillToFull ? 'Fill to Full (150L)' : `${schedule.fuelAmount}L`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{schedule.preferredWindow}</p>
                          {schedule.lastOrderDate && schedule.active && new Date(schedule.lastOrderDate) >= new Date() && (
                            <p className="text-xs text-copper mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Upcoming delivery: {format(parseISO(schedule.lastOrderDate), 'EEEE, MMMM d, yyyy')}
                            </p>
                          )}
                          {schedule.nextOrderDate && schedule.active && (
                            <p className="text-xs text-muted-foreground/70 mt-0.5">
                              Next scheduled: {format(parseISO(schedule.nextOrderDate), 'MMM d, yyyy')}
                            </p>
                          )}
                          {schedule.lastOrderDate && new Date(schedule.lastOrderDate) < new Date() && (
                            <p className="text-xs text-muted-foreground/70 mt-0.5">
                              Last delivery: {format(parseISO(schedule.lastOrderDate), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={schedule.active ? 'default' : 'secondary'} className={schedule.active ? 'bg-sage' : ''}>
                          {schedule.active ? 'Active' : 'Paused'}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => toggleMutation.mutate({ id: schedule.id, active: !schedule.active })}
                          disabled={toggleMutation.isPending}
                        >
                          {schedule.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive" 
                          onClick={() => deleteMutation.mutate(schedule.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">How Recurring Deliveries Work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { step: 1, title: 'Select Your Vehicles', description: 'Choose one or more vehicles and set fuel type and amount for each' },
                { step: 2, title: 'Set Your Schedule', description: 'Choose weekly, bi-weekly, or monthly deliveries' },
                { step: 3, title: 'Automatic Orders', description: 'Orders are created automatically before your scheduled day' },
                { step: 4, title: 'Flexibility', description: 'Pause, modify, or cancel your recurring schedule anytime' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-copper text-white flex items-center justify-center font-display font-bold text-sm flex-shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Wrapper>
  );
}
