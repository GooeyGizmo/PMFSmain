import { useState } from 'react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, Users, Phone, Mail, Plus, Truck, 
  FileText, Calendar, AlertCircle, CheckCircle2, 
  Shield, Key, IdCard, Star, Clock, Edit, Trash2
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { format, differenceInDays, parseISO, isValid } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  driversLicenseNumber?: string;
  driversLicenseIssueDate?: string;
  driversLicenseExpiryDate?: string;
  tdgCertificateNumber?: string;
  tdgCertificateIssueDate?: string;
  tdgCertificateExpiryDate?: string;
  lockoutLicenseNumber?: string;
  lockoutLicenseIssueDate?: string;
  lockoutLicenseExpiryDate?: string;
  assignedTruckId?: string;
  assignedTruck?: {
    id: string;
    unitNumber: string;
    name?: string;
    make: string;
    model: string;
  };
  rating?: string;
  totalDeliveries: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Truck {
  id: string;
  unitNumber: string;
  name?: string;
  make: string;
  model: string;
}

export default function DriverManagement({ embedded }: { embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showEditDriver, setShowEditDriver] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [driverForm, setDriverForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    driversLicenseNumber: '',
    driversLicenseIssueDate: '',
    driversLicenseExpiryDate: '',
    tdgCertificateNumber: '',
    tdgCertificateIssueDate: '',
    tdgCertificateExpiryDate: '',
    lockoutLicenseNumber: '',
    lockoutLicenseIssueDate: '',
    lockoutLicenseExpiryDate: '',
    assignedTruckId: '',
    isActive: true,
  });

  const { data: driversData, isLoading: loadingDrivers } = useQuery<{ drivers: Driver[] }>({
    queryKey: ['/api/ops/driver-management'],
  });

  const { data: trucksData } = useQuery<{ trucks: Truck[] }>({
    queryKey: ['/api/ops/fleet/trucks'],
  });

  const drivers: Driver[] = driversData?.drivers || [];
  const trucks: Truck[] = trucksData?.trucks || [];

  const createDriverMutation = useMutation({
    mutationFn: async (data: typeof driverForm) => {
      return await apiRequest('POST', '/api/ops/driver-management', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/driver-management'] });
      setShowAddDriver(false);
      resetForm();
      toast({ title: 'Driver added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add driver', description: error.message, variant: 'destructive' });
    },
  });

  const updateDriverMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof driverForm }) => {
      return await apiRequest('PATCH', `/api/ops/driver-management/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/driver-management'] });
      setShowEditDriver(false);
      setSelectedDriver(null);
      resetForm();
      toast({ title: 'Driver updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update driver', description: error.message, variant: 'destructive' });
    },
  });

  const deleteDriverMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/ops/driver-management/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/driver-management'] });
      setShowDeleteConfirm(false);
      setSelectedDriver(null);
      toast({ title: 'Driver deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete driver', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setDriverForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      driversLicenseNumber: '',
      driversLicenseIssueDate: '',
      driversLicenseExpiryDate: '',
      tdgCertificateNumber: '',
      tdgCertificateIssueDate: '',
      tdgCertificateExpiryDate: '',
      lockoutLicenseNumber: '',
      lockoutLicenseIssueDate: '',
      lockoutLicenseExpiryDate: '',
      assignedTruckId: '',
      isActive: true,
    });
  };

  const formatDateForInput = (dateValue?: string | null): string => {
    if (!dateValue) return '';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const openEditDialog = (driver: Driver) => {
    setSelectedDriver(driver);
    setDriverForm({
      firstName: driver.firstName,
      lastName: driver.lastName,
      email: driver.email,
      phone: driver.phone,
      driversLicenseNumber: driver.driversLicenseNumber || '',
      driversLicenseIssueDate: formatDateForInput(driver.driversLicenseIssueDate),
      driversLicenseExpiryDate: formatDateForInput(driver.driversLicenseExpiryDate),
      tdgCertificateNumber: driver.tdgCertificateNumber || '',
      tdgCertificateIssueDate: formatDateForInput(driver.tdgCertificateIssueDate),
      tdgCertificateExpiryDate: formatDateForInput(driver.tdgCertificateExpiryDate),
      lockoutLicenseNumber: driver.lockoutLicenseNumber || '',
      lockoutLicenseIssueDate: formatDateForInput(driver.lockoutLicenseIssueDate),
      lockoutLicenseExpiryDate: formatDateForInput(driver.lockoutLicenseExpiryDate),
      assignedTruckId: driver.assignedTruckId || '',
      isActive: driver.isActive,
    });
    setShowEditDriver(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showEditDriver && selectedDriver) {
      updateDriverMutation.mutate({ id: selectedDriver.id, data: driverForm });
    } else {
      createDriverMutation.mutate(driverForm);
    }
  };

  const getExpiryStatus = (expiryDate?: string): { status: 'valid' | 'warning' | 'expired' | 'none'; daysLeft: number } => {
    if (!expiryDate) return { status: 'none', daysLeft: 0 };
    const date = parseISO(expiryDate);
    if (!isValid(date)) return { status: 'none', daysLeft: 0 };
    
    const daysLeft = differenceInDays(date, new Date());
    if (daysLeft < 0) return { status: 'expired', daysLeft };
    if (daysLeft <= 30) return { status: 'warning', daysLeft };
    return { status: 'valid', daysLeft };
  };

  const getExpiryBadge = (expiryDate?: string) => {
    const { status, daysLeft } = getExpiryStatus(expiryDate);
    switch (status) {
      case 'expired':
        return <Badge variant="destructive" className="text-xs">Expired</Badge>;
      case 'warning':
        return <Badge className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">Expires in {daysLeft} days</Badge>;
      case 'valid':
        return <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/30">Valid</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Not set</Badge>;
    }
  };

  const hasAnyExpiredOrWarning = (driver: Driver): boolean => {
    const checks = [
      getExpiryStatus(driver.driversLicenseExpiryDate),
      getExpiryStatus(driver.tdgCertificateExpiryDate),
      getExpiryStatus(driver.lockoutLicenseExpiryDate),
    ];
    return checks.some(c => c.status === 'expired' || c.status === 'warning');
  };

  const content = (
    <div className="space-y-6">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          {!embedded && (
            <div className="flex items-center gap-3">
              <Link href="/ops">
                <Button variant="ghost" size="icon" data-testid="back-button">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="font-display font-bold text-foreground">Driver Management</h1>
                <p className="text-xs text-muted-foreground">Manage driver licenses and certifications</p>
              </div>
            </div>
          )}
          <Button onClick={() => { resetForm(); setShowAddDriver(true); }} data-testid="add-driver-button">
            <Plus className="w-4 h-4 mr-2" />
            Add Driver
          </Button>
        </div>
        {loadingDrivers ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-copper border-t-transparent rounded-full" />
          </div>
        ) : drivers.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Drivers Yet</h3>
              <p className="text-muted-foreground mb-4">Add your first driver to start managing your team.</p>
              <Button onClick={() => { resetForm(); setShowAddDriver(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Driver
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {drivers.map((driver) => (
                <motion.div
                  key={driver.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <Card 
                    className={`cursor-pointer hover:shadow-md transition-shadow ${!driver.isActive ? 'opacity-60' : ''} ${hasAnyExpiredOrWarning(driver) ? 'border-amber-500/50' : ''}`}
                    onClick={() => openEditDialog(driver)}
                    data-testid={`driver-card-${driver.id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-copper/10 flex items-center justify-center">
                            <Users className="w-5 h-5 text-copper" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{driver.firstName} {driver.lastName}</CardTitle>
                            <CardDescription className="flex items-center gap-1 text-xs">
                              <Star className="w-3 h-3" />
                              {driver.rating || 'N/A'} rating
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant={driver.isActive ? 'default' : 'secondary'}>
                          {driver.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="w-4 h-4" />
                        <span className="truncate">{driver.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-4 h-4" />
                        <span>{driver.phone}</span>
                      </div>
                      {driver.assignedTruck && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Truck className="w-4 h-4" />
                          <span>Unit #{driver.assignedTruck.unitNumber} - {driver.assignedTruck.make} {driver.assignedTruck.model}</span>
                        </div>
                      )}
                      
                      <div className="pt-2 border-t space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <IdCard className="w-3 h-3" /> Driver's License
                          </span>
                          {getExpiryBadge(driver.driversLicenseExpiryDate)}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Shield className="w-3 h-3" /> TDG Certificate
                          </span>
                          {getExpiryBadge(driver.tdgCertificateExpiryDate)}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Key className="w-3 h-3" /> Lockout License
                          </span>
                          {getExpiryBadge(driver.lockoutLicenseExpiryDate)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                        <span>{driver.totalDeliveries} deliveries</span>
                        <span>Added {format(new Date(driver.createdAt), 'MMM d, yyyy')}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <Dialog open={showAddDriver || showEditDriver} onOpenChange={(open) => { 
        if (!open) { setShowAddDriver(false); setShowEditDriver(false); resetForm(); } 
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{showEditDriver ? 'Edit Driver' : 'Add New Driver'}</DialogTitle>
            <DialogDescription>
              {showEditDriver ? 'Update driver information and certifications.' : 'Enter driver information and certification details.'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={driverForm.firstName}
                    onChange={(e) => setDriverForm({ ...driverForm, firstName: e.target.value })}
                    required
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={driverForm.lastName}
                    onChange={(e) => setDriverForm({ ...driverForm, lastName: e.target.value })}
                    required
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={driverForm.email}
                    onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={driverForm.phone}
                    onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
                    required
                    data-testid="input-phone"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignedTruckId">Assigned Truck</Label>
                <Select 
                  value={driverForm.assignedTruckId} 
                  onValueChange={(value) => setDriverForm({ ...driverForm, assignedTruckId: value === 'none' ? '' : value })}
                >
                  <SelectTrigger data-testid="select-truck">
                    <SelectValue placeholder="Select a truck" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No truck assigned</SelectItem>
                    {trucks.map((truck) => (
                      <SelectItem key={truck.id} value={truck.id}>
                        Unit #{truck.unitNumber} - {truck.make} {truck.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 p-4 rounded-lg bg-muted/50">
                <h4 className="font-medium flex items-center gap-2">
                  <IdCard className="w-4 h-4" />
                  Driver's License
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="driversLicenseNumber">License Number</Label>
                    <Input
                      id="driversLicenseNumber"
                      value={driverForm.driversLicenseNumber}
                      onChange={(e) => setDriverForm({ ...driverForm, driversLicenseNumber: e.target.value })}
                      data-testid="input-dl-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="driversLicenseIssueDate">Issue Date</Label>
                    <Input
                      id="driversLicenseIssueDate"
                      type="date"
                      value={driverForm.driversLicenseIssueDate}
                      onChange={(e) => setDriverForm({ ...driverForm, driversLicenseIssueDate: e.target.value })}
                      data-testid="input-dl-issue"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="driversLicenseExpiryDate">Expiry Date</Label>
                    <Input
                      id="driversLicenseExpiryDate"
                      type="date"
                      value={driverForm.driversLicenseExpiryDate}
                      onChange={(e) => setDriverForm({ ...driverForm, driversLicenseExpiryDate: e.target.value })}
                      data-testid="input-dl-expiry"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4 rounded-lg bg-muted/50">
                <h4 className="font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  TDG Certificate
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tdgCertificateNumber">Certificate Number</Label>
                    <Input
                      id="tdgCertificateNumber"
                      value={driverForm.tdgCertificateNumber}
                      onChange={(e) => setDriverForm({ ...driverForm, tdgCertificateNumber: e.target.value })}
                      data-testid="input-tdg-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tdgCertificateIssueDate">Issue Date</Label>
                    <Input
                      id="tdgCertificateIssueDate"
                      type="date"
                      value={driverForm.tdgCertificateIssueDate}
                      onChange={(e) => setDriverForm({ ...driverForm, tdgCertificateIssueDate: e.target.value })}
                      data-testid="input-tdg-issue"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tdgCertificateExpiryDate">Expiry Date</Label>
                    <Input
                      id="tdgCertificateExpiryDate"
                      type="date"
                      value={driverForm.tdgCertificateExpiryDate}
                      onChange={(e) => setDriverForm({ ...driverForm, tdgCertificateExpiryDate: e.target.value })}
                      data-testid="input-tdg-expiry"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4 rounded-lg bg-muted/50">
                <h4 className="font-medium flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Lockout License
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lockoutLicenseNumber">License Number</Label>
                    <Input
                      id="lockoutLicenseNumber"
                      value={driverForm.lockoutLicenseNumber}
                      onChange={(e) => setDriverForm({ ...driverForm, lockoutLicenseNumber: e.target.value })}
                      data-testid="input-lockout-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lockoutLicenseIssueDate">Issue Date</Label>
                    <Input
                      id="lockoutLicenseIssueDate"
                      type="date"
                      value={driverForm.lockoutLicenseIssueDate}
                      onChange={(e) => setDriverForm({ ...driverForm, lockoutLicenseIssueDate: e.target.value })}
                      data-testid="input-lockout-issue"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lockoutLicenseExpiryDate">Expiry Date</Label>
                    <Input
                      id="lockoutLicenseExpiryDate"
                      type="date"
                      value={driverForm.lockoutLicenseExpiryDate}
                      onChange={(e) => setDriverForm({ ...driverForm, lockoutLicenseExpiryDate: e.target.value })}
                      data-testid="input-lockout-expiry"
                    />
                  </div>
                </div>
              </div>
            </form>
          </ScrollArea>
          <DialogFooter className="flex justify-between">
            {showEditDriver && selectedDriver && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="delete-driver-button"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={() => { setShowAddDriver(false); setShowEditDriver(false); resetForm(); }}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={createDriverMutation.isPending || updateDriverMutation.isPending}
                data-testid="save-driver-button"
              >
                {(createDriverMutation.isPending || updateDriverMutation.isPending) ? 'Saving...' : (showEditDriver ? 'Save Changes' : 'Add Driver')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Driver</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedDriver?.firstName} {selectedDriver?.lastName}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => selectedDriver && deleteDriverMutation.mutate(selectedDriver.id)}
              disabled={deleteDriverMutation.isPending}
              data-testid="confirm-delete-button"
            >
              {deleteDriverMutation.isPending ? 'Deleting...' : 'Delete Driver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
