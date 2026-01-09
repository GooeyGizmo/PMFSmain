import { useState } from 'react';
import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { generateMockVehicles, subscriptionTiers } from '@/lib/mockData';
import { Calendar, Plus, Pause, Play, Trash2, RefreshCw } from 'lucide-react';

interface Schedule {
  id: string;
  vehicleId: string;
  vehicleName: string;
  frequency: 'weekly' | 'bi-weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  fuelAmount: number;
  active: boolean;
}

export default function Recurring() {
  const { user } = useAuth();
  const { toast } = useToast();
  const vehicles = generateMockVehicles(user?.id || '');
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);
  const canUseRecurring = currentTier?.slug === 'household' || currentTier?.slug === 'rural';

  const [schedules, setSchedules] = useState<Schedule[]>([
    {
      id: '1',
      vehicleId: 'v1',
      vehicleName: '2022 Ford F-150',
      frequency: 'bi-weekly',
      dayOfWeek: 1,
      fuelAmount: 60,
      active: true,
    },
  ]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    vehicleId: '',
    frequency: 'weekly' as 'weekly' | 'bi-weekly' | 'monthly',
    dayOfWeek: '1',
    dayOfMonth: '1',
    fuelAmount: '50',
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const handleAddSchedule = () => {
    const vehicle = vehicles.find(v => v.id === form.vehicleId);
    if (!vehicle) return;

    const newSchedule: Schedule = {
      id: crypto.randomUUID(),
      vehicleId: form.vehicleId,
      vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      frequency: form.frequency,
      dayOfWeek: form.frequency !== 'monthly' ? parseInt(form.dayOfWeek) : undefined,
      dayOfMonth: form.frequency === 'monthly' ? parseInt(form.dayOfMonth) : undefined,
      fuelAmount: parseInt(form.fuelAmount),
      active: true,
    };

    setSchedules(prev => [...prev, newSchedule]);
    setIsAddOpen(false);
    setForm({ vehicleId: '', frequency: 'weekly', dayOfWeek: '1', dayOfMonth: '1', fuelAmount: '50' });
    toast({ title: 'Schedule created', description: 'Your recurring delivery has been set up.' });
  };

  const toggleSchedule = (id: string) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const deleteSchedule = (id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
    toast({ title: 'Schedule deleted', description: 'The recurring delivery has been removed.' });
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
                      {vehicles.map(v => (
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
                  <Label>Fuel Amount (Litres)</Label>
                  <Select value={form.fuelAmount} onValueChange={(v) => setForm(prev => ({ ...prev, fuelAmount: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[30, 40, 50, 60, 70, 80, 90, 100].map(amount => (
                        <SelectItem key={amount} value={amount.toString()}>{amount}L</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full bg-copper hover:bg-copper/90" onClick={handleAddSchedule} disabled={!form.vehicleId}>
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
            {schedules.map((schedule, i) => (
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
                          <h3 className="font-medium text-foreground">{schedule.vehicleName}</h3>
                          <p className="text-sm text-muted-foreground">
                            {schedule.frequency === 'weekly' && `Every ${dayNames[schedule.dayOfWeek!]}`}
                            {schedule.frequency === 'bi-weekly' && `Every other ${dayNames[schedule.dayOfWeek!]}`}
                            {schedule.frequency === 'monthly' && `${schedule.dayOfMonth}${['st', 'nd', 'rd'][schedule.dayOfMonth! - 1] || 'th'} of each month`}
                            {' · '}{schedule.fuelAmount}L
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={schedule.active ? 'default' : 'secondary'} className={schedule.active ? 'bg-sage' : ''}>
                          {schedule.active ? 'Active' : 'Paused'}
                        </Badge>
                        <Button variant="ghost" size="icon" onClick={() => toggleSchedule(schedule.id)}>
                          {schedule.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteSchedule(schedule.id)}>
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
      </div>
    </CustomerLayout>
  );
}
