import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import OpsLayout from '@/components/ops-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { 
  Calendar, ChevronLeft, ChevronRight, Settings, Clock, 
  Users, Fuel, AlertCircle, Crown, Shield, Loader2, 
  Check, X, Edit2, Save
} from 'lucide-react';

interface TierInventory {
  tier: string;
  reserved: number;
  booked: number;
  remaining: number;
}

interface SlotInfo {
  id: string;
  startTime: string;
  endTime: string;
  label: string;
  slotType: 'standard' | 'vip';
  capacity: number;
  reservedCount: number;
  available: boolean;
  spotsLeft: number;
  isFull: boolean;
  isPast: boolean;
  hasVipConflict?: boolean;
}

interface DayCapacity {
  date: string;
  effectiveMode: 'soft_launch' | 'full_time';
  maxBlocks: number;
  blocksUsed: number;
  blocksRemaining: number;
  vipMaxCount: number;
  vipUsed: number;
  isClosed: boolean;
  tierInventory: TierInventory[];
  overflowUsed: number;
  standardSlots: SlotInfo[];
  config: {
    id?: string;
    date?: string;
    maxBlocks?: number;
    vipMaxCount?: number;
    standardReservations?: string;
    isClosed?: boolean;
    notes?: string;
    modeOverride?: string;
  } | null;
}

interface DayConfig {
  maxBlocks: number;
  vipMaxCount: number;
  standardReservations: Record<string, number>;
  isClosed: boolean;
  notes: string;
  modeOverride: string | null;
}

const TIER_LABELS: Record<string, string> = {
  rural: 'Rural/Fleet',
  household: 'Household',
  access: 'Access',
  payg: 'Pay-As-You-Go',
};

const TIER_COLORS: Record<string, string> = {
  rural: 'bg-emerald-500',
  household: 'bg-blue-500',
  access: 'bg-amber-500',
  payg: 'bg-gray-500',
};

function getDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

interface CapacityManagementProps {
  embedded?: boolean;
}

export default function CapacityManagement({ embedded = false }: CapacityManagementProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);
  const [editConfig, setEditConfig] = useState<DayConfig>({
    maxBlocks: 6,
    vipMaxCount: 1,
    standardReservations: { rural: 2, household: 4, access: 2, payg: 1 },
    isClosed: false,
    notes: '',
    modeOverride: null,
  });

  const isOwner = user?.role === 'owner';
  const isAdmin = user?.role === 'admin' || isOwner;

  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(weekStart, { weekStartsOn: 1 }),
  });

  const { data: dayCapacity, isLoading, refetch } = useQuery<DayCapacity>({
    queryKey: ['capacity', getDateString(selectedDate)],
    queryFn: async () => {
      const res = await fetch(`/api/ops/capacity/${getDateString(selectedDate)}`);
      if (!res.ok) throw new Error('Failed to fetch capacity');
      return res.json();
    },
    enabled: isAdmin,
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (config: DayConfig) => {
      const res = await fetch(`/api/ops/capacity/${getDateString(selectedDate)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update configuration');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Configuration Updated', description: 'Day capacity settings saved successfully.' });
      queryClient.invalidateQueries({ queryKey: ['capacity'] });
      setEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Update Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Reset formInitialized when dialog closes
  useEffect(() => {
    if (!editDialogOpen) {
      setFormInitialized(false);
    }
  }, [editDialogOpen]);

  // Only initialize form once when dialog opens and data is available
  useEffect(() => {
    if (editDialogOpen && dayCapacity && !formInitialized) {
      if (dayCapacity.config) {
        const config = dayCapacity.config;
        let reservations: Record<string, number> = { rural: 2, household: 4, access: 2, payg: 1 };
        try {
          if (config.standardReservations) {
            reservations = JSON.parse(config.standardReservations);
          }
        } catch {}
        
        setEditConfig({
          maxBlocks: config.maxBlocks ?? dayCapacity.maxBlocks,
          vipMaxCount: config.vipMaxCount ?? dayCapacity.vipMaxCount,
          standardReservations: reservations,
          isClosed: config.isClosed ?? false,
          notes: config.notes ?? '',
          modeOverride: config.modeOverride ?? null,
        });
      } else {
        const reservations: Record<string, number> = {};
        dayCapacity.tierInventory.forEach(ti => {
          reservations[ti.tier] = ti.reserved;
        });
        
        setEditConfig({
          maxBlocks: dayCapacity.maxBlocks,
          vipMaxCount: dayCapacity.vipMaxCount,
          standardReservations: reservations,
          isClosed: dayCapacity.isClosed,
          notes: '',
          modeOverride: null,
        });
      }
      setFormInitialized(true);
    }
  }, [editDialogOpen, dayCapacity, formInitialized]);

  const handlePrevWeek = () => {
    setWeekStart(addDays(weekStart, -7));
  };

  const handleNextWeek = () => {
    setWeekStart(addDays(weekStart, 7));
  };

  const handleSaveConfig = () => {
    updateConfigMutation.mutate(editConfig);
  };

  const blocksUsedPercent = dayCapacity ? (dayCapacity.blocksUsed / dayCapacity.maxBlocks) * 100 : 0;
  const totalInventory = dayCapacity ? dayCapacity.tierInventory.reduce((sum, ti) => sum + ti.reserved, 0) : 0;
  const bookedInventory = dayCapacity ? dayCapacity.tierInventory.reduce((sum, ti) => sum + ti.booked, 0) : 0;

  const Wrapper = embedded ? ({ children }: { children: React.ReactNode }) => <>{children}</> : OpsLayout;

  if (!isAdmin) {
    return (
      <Wrapper>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You need admin or owner permissions to view this page.</p>
          </div>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">Capacity & Schedule</h1>
            <p className="text-muted-foreground">Manage daily booking capacity and tier reservations</p>
          </div>
          {dayCapacity && (
            <Badge variant={dayCapacity.effectiveMode === 'full_time' ? 'default' : 'secondary'} className="text-sm">
              {dayCapacity.effectiveMode === 'full_time' ? 'Full-Time Mode' : 'Soft Launch Mode'}
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Week View</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handlePrevWeek} data-testid="btn-prev-week">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[180px] text-center">
                  {format(weekStart, 'MMM d')} - {format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}
                </span>
                <Button variant="outline" size="icon" onClick={handleNextWeek} data-testid="btn-next-week">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                const isSunday = day.getDay() === 0;
                
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      isSelected 
                        ? 'border-copper bg-copper/10 ring-2 ring-copper/30' 
                        : isToday 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-border hover:border-copper/50'
                    } ${isSunday ? 'bg-amber-50' : ''}`}
                    data-testid={`day-btn-${format(day, 'yyyy-MM-dd')}`}
                  >
                    <div className="text-xs font-medium text-muted-foreground">{format(day, 'EEE')}</div>
                    <div className={`text-lg font-bold ${isSelected ? 'text-copper' : ''}`}>{format(day, 'd')}</div>
                    {isSunday && (
                      <Crown className="h-3 w-3 text-amber-600 mx-auto mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-copper" />
          </div>
        ) : dayCapacity ? (
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-copper" />
                    {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                  </CardTitle>
                  {isOwner && (
                    <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)} data-testid="btn-edit-config">
                      <Edit2 className="h-4 w-4 mr-1" />
                      Configure
                    </Button>
                  )}
                </div>
                {dayCapacity.isClosed && (
                  <Badge variant="destructive" className="w-fit">Day Closed</Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Block Budget</span>
                    <span className="text-sm text-muted-foreground">
                      {dayCapacity.blocksUsed} / {dayCapacity.maxBlocks} blocks used
                    </span>
                  </div>
                  <Progress value={blocksUsedPercent} className="h-3" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {dayCapacity.blocksRemaining} blocks remaining
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      VIP Slots
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {dayCapacity.vipUsed} / {dayCapacity.vipMaxCount} booked
                    </span>
                  </div>
                  <Progress 
                    value={(dayCapacity.vipUsed / dayCapacity.vipMaxCount) * 100} 
                    className="h-3"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Tier Inventory</span>
                    <span className="text-sm text-muted-foreground">
                      {bookedInventory} / {totalInventory} slots booked
                    </span>
                  </div>
                  <div className="space-y-2">
                    {dayCapacity.tierInventory.map((ti) => (
                      <div key={ti.tier} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${TIER_COLORS[ti.tier]}`} />
                        <span className="text-sm flex-1">{TIER_LABELS[ti.tier]}</span>
                        <span className="text-sm text-muted-foreground">
                          {ti.booked}/{ti.reserved}
                        </span>
                        <Progress 
                          value={ti.reserved > 0 ? (ti.booked / ti.reserved) * 100 : 0} 
                          className="w-20 h-2"
                        />
                      </div>
                    ))}
                  </div>
                  {dayCapacity.overflowUsed > 0 && (
                    <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {dayCapacity.overflowUsed} overflow booking(s) from higher tiers
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-copper" />
                  Time Slots
                </CardTitle>
                <CardDescription>90-minute booking windows</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {dayCapacity.standardSlots.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No standard slots for this day</p>
                      {selectedDate.getDay() === 0 && (
                        <p className="text-sm mt-1">Sundays are VIP-only</p>
                      )}
                    </div>
                  ) : (
                    dayCapacity.standardSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className={`p-3 rounded-lg border ${
                          slot.isPast 
                            ? 'bg-muted/50 border-muted' 
                            : slot.isFull 
                              ? 'bg-red-50 border-red-200' 
                              : slot.hasVipConflict 
                                ? 'bg-amber-50 border-amber-200' 
                                : 'border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${slot.isPast ? 'text-muted-foreground' : ''}`}>
                            {slot.label}
                          </span>
                          <div className="flex items-center gap-2">
                            {slot.isPast && <Badge variant="secondary" className="text-xs">Past</Badge>}
                            {slot.hasVipConflict && !slot.isPast && (
                              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                <Crown className="h-3 w-3 mr-1" />
                                VIP Block
                              </Badge>
                            )}
                            {slot.isFull && !slot.isPast && !slot.hasVipConflict && (
                              <Badge variant="destructive" className="text-xs">Full</Badge>
                            )}
                            {slot.available && (
                              <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                                {slot.spotsLeft} spot{slot.spotsLeft !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span>{slot.reservedCount}/{slot.capacity} booked</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="p-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">Unable to load capacity data</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
              Retry
            </Button>
          </Card>
        )}

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Configure {format(selectedDate, 'MMMM d, yyyy')}</DialogTitle>
              <DialogDescription>
                Adjust capacity settings for this day. Only owners can modify these settings.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="isClosed">Close Day</Label>
                <Switch
                  id="isClosed"
                  checked={editConfig.isClosed}
                  onCheckedChange={(checked) => setEditConfig(prev => ({ ...prev, isClosed: checked }))}
                  data-testid="switch-close-day"
                />
              </div>

              <div className="space-y-2">
                <Label>Max Blocks</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={editConfig.maxBlocks}
                  onChange={(e) => setEditConfig(prev => ({ ...prev, maxBlocks: parseInt(e.target.value) || 6 }))}
                  data-testid="input-max-blocks"
                />
                <p className="text-xs text-muted-foreground">Maximum booking blocks for the day</p>
              </div>

              <div className="space-y-2">
                <Label>VIP Max Count</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={editConfig.vipMaxCount}
                  onChange={(e) => setEditConfig(prev => ({ ...prev, vipMaxCount: parseInt(e.target.value) || 1 }))}
                  data-testid="input-vip-max"
                />
                <p className="text-xs text-muted-foreground">Maximum VIP exclusive bookings</p>
              </div>

              <div className="space-y-3">
                <Label>Tier Reservations</Label>
                {['rural', 'household', 'access', 'payg'].map((tier) => (
                  <div key={tier} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${TIER_COLORS[tier]}`} />
                    <span className="text-sm flex-1">{TIER_LABELS[tier]}</span>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={editConfig.standardReservations[tier] || 0}
                      onChange={(e) => setEditConfig(prev => ({
                        ...prev,
                        standardReservations: {
                          ...prev.standardReservations,
                          [tier]: parseInt(e.target.value) || 0,
                        }
                      }))}
                      className="w-20"
                      data-testid={`input-tier-${tier}`}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={editConfig.notes}
                  onChange={(e) => setEditConfig(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes for this day..."
                  data-testid="input-notes"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveConfig} 
                disabled={updateConfigMutation.isPending}
                data-testid="btn-save-config"
              >
                {updateConfigMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Wrapper>
  );
}
