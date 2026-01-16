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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { subscriptionTiers } from '@/lib/mockData';
import { Calendar, Plus, Pause, Play, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function Recurring() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);
  const canUseRecurring = currentTier?.slug === 'household' || currentTier?.slug === 'rural';

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    vehicleId: '',
    frequency: 'weekly' as 'weekly' | 'bi-weekly' | 'monthly',
    dayOfWeek: '1',
    dayOfMonth: '1',
    preferredWindow: '9:00 AM - 10:30 AM',
    fuelAmount: '40',
    fillToFull: false,
  });

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

  const { data: vehiclesData } = useQuery<{ vehicles: any[] }>({
    queryKey: ['/api/vehicles'],
  });
  const vehicles = vehiclesData?.vehicles || [];

  const { data: schedulesData, isLoading } = useQuery<{ schedules: any[] }>({
    queryKey: ['/api/recurring-schedules'],
  });
  const schedules = schedulesData?.schedules || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/recurring-schedules', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-schedules'] });
      setIsAddOpen(false);
      setForm({ vehicleId: '', frequency: 'weekly', dayOfWeek: '1', dayOfMonth: '1', preferredWindow: '9:00 AM - 10:30 AM', fuelAmount: '40', fillToFull: false });
      toast({ title: 'Schedule created', description: 'Your recurring delivery has been set up.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create schedule.', variant: 'destructive' });
    }
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

  const handleAddSchedule = () => {
    if (!form.fillToFull) {
      const amount = parseFloat(form.fuelAmount);
      if (isNaN(amount) || amount < 20 || amount > 200) {
        toast({ title: 'Invalid fuel amount', description: 'Please enter a valid amount between 20 and 200 litres.', variant: 'destructive' });
        return;
      }
    }
    createMutation.mutate({
      vehicleId: form.vehicleId,
      frequency: form.frequency,
      dayOfWeek: form.frequency !== 'monthly' ? parseInt(form.dayOfWeek) : undefined,
      dayOfMonth: form.frequency === 'monthly' ? parseInt(form.dayOfMonth) : undefined,
      preferredWindow: form.preferredWindow,
      fuelAmount: form.fillToFull ? '0' : parseFloat(form.fuelAmount).toString(),
      fillToFull: form.fillToFull,
    });
  };

  const getVehicleName = (vehicleId: string) => {
    const vehicle = vehicles.find((v: any) => v.id === vehicleId);
    return vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown Vehicle';
  };

  if (!canUseRecurring) {
    return (
      <CustomerLayout>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-display text-lg font-semibold mb-2">Upgrade Required</h3>
              <p className="text-muted-foreground mb-4">
                Recurring deliveries are available on Household and Rural plans.
              </p>
              <Button className="bg-copper hover:bg-copper/90" onClick={() => window.location.href = '/customer/subscription'}>
                View Plans
              </Button>
            </CardContent>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  if (isLoading) {
    return (
      <CustomerLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-copper" />
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Recurring Deliveries</h1>
            <p className="text-muted-foreground mt-1">Set up automatic fuel deliveries</p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-copper hover:bg-copper/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">New Recurring Delivery</DialogTitle>
                <DialogDescription>Set up automatic fuel deliveries</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Vehicle</Label>
                  <Select value={form.vehicleId} onValueChange={(v) => setForm(prev => ({ ...prev, vehicleId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.year} {v.make} {v.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                <div className="space-y-2">
                  <Label>Fuel Amount (Litres)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="20"
                    max="200"
                    placeholder="e.g. 45.50"
                    value={form.fuelAmount}
                    onChange={(e) => setForm(prev => ({ ...prev, fuelAmount: e.target.value }))}
                    disabled={form.fillToFull}
                  />
                  <p className="text-xs text-muted-foreground">Enter amount in litres (e.g. 45.50)</p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Fill to Full</Label>
                    <p className="text-xs text-muted-foreground">Fill tank completely instead of set amount</p>
                  </div>
                  <Switch 
                    checked={form.fillToFull} 
                    onCheckedChange={(c) => setForm(prev => ({ ...prev, fillToFull: c }))} 
                  />
                </div>
                <Button 
                  className="w-full bg-copper hover:bg-copper/90" 
                  onClick={handleAddSchedule} 
                  disabled={!form.vehicleId || createMutation.isPending}
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Create Schedule
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
              <Button className="bg-copper hover:bg-copper/90" onClick={() => setIsAddOpen(true)}>
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
                            {' · '}{schedule.fillToFull ? 'Fill to Full' : `${schedule.fuelAmount}L`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{schedule.preferredWindow}</p>
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
                { step: 1, title: 'Set Your Schedule', description: 'Choose weekly, bi-weekly, or monthly deliveries' },
                { step: 2, title: 'Automatic Orders', description: 'Orders are created automatically before your scheduled day' },
                { step: 3, title: 'Get Notified', description: 'You\'ll receive a notification before each scheduled delivery' },
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
    </CustomerLayout>
  );
}
