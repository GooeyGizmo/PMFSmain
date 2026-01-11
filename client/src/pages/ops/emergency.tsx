import React from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { 
  AlertTriangle, 
  Fuel, 
  Key, 
  Battery, 
  MapPin, 
  Phone, 
  Mail,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  User,
  Zap,
  ArrowLeft
} from 'lucide-react';

interface ServiceRequest {
  id: string;
  userId: string;
  vehicleId: string | null;
  serviceType: string;
  status: string;
  address: string;
  city: string;
  latitude: string | null;
  longitude: string | null;
  notes: string | null;
  fuelType: string | null;
  fuelAmount: number | null;
  serviceFee: string;
  fuelCost: string;
  gstAmount: string;
  total: string;
  creditUsed: boolean;
  paymentStatus: string;
  requestedAt: string;
  dispatchedAt: string | null;
  completedAt: string | null;
  userName: string;
  userEmail: string;
  userPhone: string;
  vehicleInfo: string | null;
}

const serviceIcons: Record<string, React.ElementType> = {
  emergency_fuel: Fuel,
  lockout: Key,
  boost: Battery,
};

const serviceColors: Record<string, string> = {
  emergency_fuel: 'text-copper bg-copper/10',
  lockout: 'text-brass bg-brass/10',
  boost: 'text-gold bg-gold/10',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  dispatched: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  en_route: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  on_site: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  cancelled: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  dispatched: 'Dispatched',
  en_route: 'En Route',
  on_site: 'On Site',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function OpsEmergencyPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<string>('active');

  const { data, isLoading } = useQuery<{ requests: ServiceRequest[] }>({
    queryKey: ['/api/ops/emergency/requests', statusFilter === 'active' ? 'pending' : undefined],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest('PATCH', `/api/ops/emergency/requests/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Status Updated', description: 'Service request status has been updated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/emergency/requests'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const requests = data?.requests || [];
  const filteredRequests = statusFilter === 'active' 
    ? requests.filter(r => !['completed', 'cancelled'].includes(r.status))
    : statusFilter === 'all' 
      ? requests 
      : requests.filter(r => r.status === statusFilter);

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const activeCount = requests.filter(r => !['completed', 'cancelled'].includes(r.status)).length;

  const getNextStatuses = (currentStatus: string): string[] => {
    switch (currentStatus) {
      case 'pending': return ['dispatched', 'cancelled'];
      case 'dispatched': return ['en_route', 'cancelled'];
      case 'en_route': return ['on_site', 'cancelled'];
      case 'on_site': return ['completed', 'cancelled'];
      default: return [];
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-copper" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/ops">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-copper" />
                <span className="font-display font-bold text-foreground">Emergency Requests</span>
                <Badge variant="outline" className="text-xs border-copper/30 text-copper">Operations</Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {pendingCount > 0 && (
                <Badge className="bg-amber-500 text-white animate-pulse">
                  {pendingCount} Pending
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div>
              <h1 className="font-display text-2xl font-bold">Emergency Service Requests</h1>
              <p className="text-muted-foreground">Manage after-hours emergency and roadside assistance</p>
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active ({activeCount})</SelectItem>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="dispatched">Dispatched</SelectItem>
                <SelectItem value="en_route">En Route</SelectItem>
                <SelectItem value="on_site">On Site</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="font-display text-xl font-bold">{requests.filter(r => r.status === 'pending').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">In Progress</p>
                    <p className="font-display text-xl font-bold">{requests.filter(r => ['dispatched', 'en_route', 'on_site'].includes(r.status)).length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Completed Today</p>
                    <p className="font-display text-xl font-bold">
                      {requests.filter(r => r.status === 'completed' && r.completedAt && 
                        new Date(r.completedAt).toDateString() === new Date().toDateString()).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-copper/10 flex items-center justify-center text-copper">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Active</p>
                    <p className="font-display text-xl font-bold">{activeCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {filteredRequests.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg mb-2">No Emergency Requests</h3>
                <p className="text-muted-foreground">
                  {statusFilter === 'active' ? 'No active emergency requests at this time.' : 'No requests match the selected filter.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((request, index) => {
                const Icon = serviceIcons[request.serviceType] || Zap;
                const colorClass = serviceColors[request.serviceType] || 'text-copper bg-copper/10';
                const nextStatuses = getNextStatuses(request.status);

                return (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className={request.status === 'pending' ? 'border-amber-500/50' : ''}>
                      <CardContent className="py-4">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClass}`}>
                              <Icon className="w-6 h-6" />
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold capitalize">
                                  {request.serviceType.replace('_', ' ')}
                                </h3>
                                <Badge className={statusColors[request.status]}>
                                  {statusLabels[request.status]}
                                </Badge>
                                {request.creditUsed && (
                                  <Badge variant="outline" className="text-xs">Credit Used</Badge>
                                )}
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <User className="w-4 h-4" />
                                  <span>{request.userName}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Phone className="w-4 h-4" />
                                  <span>{request.userPhone || 'No phone'}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Mail className="w-4 h-4" />
                                  <span>{request.userEmail}</span>
                                </div>
                              </div>

                              <div className="flex items-start gap-1 text-sm">
                                <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                                <span>{request.address}, {request.city}</span>
                              </div>

                              {request.vehicleInfo && (
                                <p className="text-sm text-muted-foreground">Vehicle: {request.vehicleInfo}</p>
                              )}

                              {request.notes && (
                                <p className="text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                                  {request.notes}
                                </p>
                              )}

                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>Requested: {format(new Date(request.requestedAt), 'MMM d, h:mm a')}</span>
                                {request.dispatchedAt && (
                                  <span>Dispatched: {format(new Date(request.dispatchedAt), 'h:mm a')}</span>
                                )}
                                {request.completedAt && (
                                  <span>Completed: {format(new Date(request.completedAt), 'h:mm a')}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-3">
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Total</p>
                              <p className="font-display text-xl font-bold">${request.total}</p>
                              {request.creditUsed && (
                                <p className="text-xs text-green-600">Free (Credit Applied)</p>
                              )}
                            </div>

                            {nextStatuses.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {nextStatuses.map(status => (
                                  <Button
                                    key={status}
                                    size="sm"
                                    variant={status === 'cancelled' ? 'destructive' : 'default'}
                                    className={status !== 'cancelled' ? 'bg-copper hover:bg-copper/90' : ''}
                                    onClick={() => updateStatusMutation.mutate({ id: request.id, status })}
                                    disabled={updateStatusMutation.isPending}
                                    data-testid={`button-status-${status}-${request.id}`}
                                  >
                                    {status === 'dispatched' && <Truck className="w-4 h-4 mr-1" />}
                                    {status === 'completed' && <CheckCircle2 className="w-4 h-4 mr-1" />}
                                    {status === 'cancelled' && <XCircle className="w-4 h-4 mr-1" />}
                                    {statusLabels[status]}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
