import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useVehicles } from '@/lib/api-hooks';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { 
  AlertTriangle, 
  Fuel, 
  Key, 
  Battery, 
  Clock, 
  Shield, 
  CheckCircle2, 
  ChevronRight,
  MapPin,
  Phone,
  Zap,
  Star
} from 'lucide-react';

interface EmergencyInfo {
  hasEmergencyAccess: boolean;
  emergencyCreditsRemaining: number;
  emergencyCreditYearStart: string | null;
  isWithinBusinessHours: boolean;
  calgaryTime: string;
  pricing: {
    monthlyFee: number;
    serviceFee: number;
    annualCredits: number;
  };
  services: {
    type: string;
    name: string;
    description: string;
  }[];
}

interface ServiceRequest {
  id: string;
  serviceType: string;
  status: string;
  address: string;
  city: string;
  total: string;
  creditUsed: boolean;
  requestedAt: string;
  completedAt: string | null;
}

const serviceIcons: Record<string, React.ElementType> = {
  emergency_fuel: Fuel,
  lockout: Key,
  boost: Battery,
};

const serviceColors: Record<string, string> = {
  emergency_fuel: 'text-copper',
  lockout: 'text-brass',
  boost: 'text-gold',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  dispatched: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  en_route: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  on_site: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  cancelled: 'bg-red-500/10 text-red-600 border-red-500/20',
};

export default function EmergencyServicesPage({ embedded }: { embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { vehicles } = useVehicles();
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [formData, setFormData] = useState({
    vehicleId: '',
    address: '',
    city: '',
    notes: '',
    fuelAmount: '',
  });

  const { data: emergencyInfo, isLoading } = useQuery<EmergencyInfo>({
    queryKey: ['/api/emergency/info'],
  });

  const { data: requestsData } = useQuery<{ requests: ServiceRequest[] }>({
    queryKey: ['/api/emergency/requests'],
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/emergency/subscribe');
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Success', description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/info'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createRequestMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/emergency/requests', data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Service Requested', description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/info'] });
      setShowRequestForm(false);
      setSelectedService(null);
      setFormData({ vehicleId: '', address: '', city: '', notes: '', fuelAmount: '' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmitRequest = () => {
    if (!selectedService || !formData.address || !formData.city) {
      toast({ title: 'Missing Info', description: 'Please fill in the address and city.', variant: 'destructive' });
      return;
    }

    createRequestMutation.mutate({
      serviceType: selectedService,
      vehicleId: formData.vehicleId || undefined,
      address: formData.address,
      city: formData.city,
      notes: formData.notes || undefined,
      fuelAmount: selectedService === 'emergency_fuel' ? parseInt(formData.fuelAmount) || 20 : undefined,
    });
  };

  if (isLoading) {
    const loader = (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-copper" />
        </div>
    );
    if (embedded) return loader;
    return (
      <AppShell forceShell="customer">
        {loader}
      </AppShell>
    );
  }

  const hasAccess = emergencyInfo?.hasEmergencyAccess;
  const credits = emergencyInfo?.emergencyCreditsRemaining || 0;
  const requests = requestsData?.requests || [];
  const activeRequest = requests.find(r => !['completed', 'cancelled'].includes(r.status));

  const content = (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-copper to-brass flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
                After-Hours Emergency
              </h1>
              <p className="text-muted-foreground">Get help when you need it most</p>
            </div>
          </div>
        </motion.div>

        {!emergencyInfo?.isWithinBusinessHours && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-700">After-Hours Service Active</p>
                  <p className="text-sm text-amber-600">Our office is closed, but emergency services are available for Emergency Access members.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!hasAccess ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-copper/30 bg-gradient-to-br from-copper/5 to-brass/5">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Shield className="w-8 h-8 text-copper" />
                  <div>
                    <CardTitle className="font-display text-xl">Emergency Access Add-On</CardTitle>
                    <CardDescription>24/7 roadside assistance when you need it</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span>Emergency fuel delivery</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span>Vehicle lockout assistance</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span>Battery boost service</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Star className="w-5 h-5 text-gold" />
                    <span>1 free service call per year</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 pt-2">
                  <span className="font-display text-3xl font-bold text-copper">${emergencyInfo?.pricing.monthlyFee}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Additional service calls: ${emergencyInfo?.pricing.serviceFee} each (+ fuel cost for emergency fuel)
                </p>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full bg-copper hover:bg-copper/90"
                  onClick={() => subscribeMutation.mutate()}
                  disabled={subscribeMutation.isPending}
                  data-testid="button-subscribe-emergency"
                >
                  {subscribeMutation.isPending ? 'Activating...' : 'Add Emergency Access'}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-green-500/30 bg-green-500/5">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shield className="w-6 h-6 text-green-600" />
                      <div>
                        <p className="font-medium text-green-700">Emergency Access Active</p>
                        <p className="text-sm text-green-600">
                          {credits > 0 
                            ? `You have ${credits} free service credit${credits > 1 ? 's' : ''} remaining` 
                            : 'Service calls are $29.99 each'}
                        </p>
                      </div>
                    </div>
                    {credits > 0 && (
                      <Badge className="bg-gold/20 text-gold border-gold/30">
                        {credits} Credit{credits > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {activeRequest && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border-blue-500/30 bg-blue-500/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Active Service Request</CardTitle>
                      <Badge className={statusColors[activeRequest.status]}>
                        {activeRequest.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        {React.createElement(serviceIcons[activeRequest.serviceType] || Zap, { className: 'w-4 h-4' })}
                        <span className="capitalize">{activeRequest.serviceType.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        <span>{activeRequest.address}, {activeRequest.city}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        A technician is on the way. If you need to contact us, call our emergency line.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {!activeRequest && !showRequestForm && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
              >
                <h2 className="font-display text-lg font-semibold">Request Emergency Service</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {emergencyInfo?.services.map((service) => {
                    const Icon = serviceIcons[service.type] || Zap;
                    const color = serviceColors[service.type] || 'text-copper';
                    return (
                      <Card 
                        key={service.type}
                        className="cursor-pointer hover:border-copper/50 transition-colors"
                        onClick={() => {
                          setSelectedService(service.type);
                          setShowRequestForm(true);
                        }}
                        data-testid={`card-service-${service.type}`}
                      >
                        <CardContent className="pt-6 pb-4">
                          <div className="flex flex-col items-center text-center gap-3">
                            <div className={`w-14 h-14 rounded-xl bg-muted flex items-center justify-center ${color}`}>
                              <Icon className="w-7 h-7" />
                            </div>
                            <div>
                              <h3 className="font-semibold">{service.name}</h3>
                              <p className="text-xs text-muted-foreground mt-1">{service.description}</p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {showRequestForm && selectedService && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {React.createElement(serviceIcons[selectedService] || Zap, { className: 'w-5 h-5' })}
                      Request {selectedService.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </CardTitle>
                    <CardDescription>Tell us where you are and we'll send help</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {vehicles.length > 0 && (
                      <div className="space-y-2">
                        <Label>Vehicle (optional)</Label>
                        <Select value={formData.vehicleId} onValueChange={(v) => setFormData({ ...formData, vehicleId: v })}>
                          <SelectTrigger data-testid="select-vehicle">
                            <SelectValue placeholder="Select a vehicle" />
                          </SelectTrigger>
                          <SelectContent>
                            {vehicles.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.year} {v.make} {v.model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Street Address *</Label>
                      <Input
                        placeholder="e.g., 123 Main St"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        data-testid="input-address"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>City *</Label>
                      <Input
                        placeholder="e.g., Calgary"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        data-testid="input-city"
                      />
                    </div>

                    {selectedService === 'emergency_fuel' && (
                      <div className="space-y-2">
                        <Label>Fuel Amount (Litres)</Label>
                        <Input
                          type="number"
                          placeholder="20"
                          value={formData.fuelAmount}
                          onChange={(e) => setFormData({ ...formData, fuelAmount: e.target.value })}
                          data-testid="input-fuel-amount"
                        />
                        <p className="text-xs text-muted-foreground">Minimum 10L, just enough to get you to a gas station</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Notes (optional)</Label>
                      <Textarea
                        placeholder="Any additional details..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        data-testid="input-notes"
                      />
                    </div>

                    <Card className="bg-muted/50">
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Estimated Cost:</span>
                          <span className="font-semibold">
                            {credits > 0 ? (
                              <span className="text-green-600">FREE (using credit)</span>
                            ) : (
                              `$${(emergencyInfo?.pricing.serviceFee || 29.99).toFixed(2)} + GST`
                            )}
                          </span>
                        </div>
                        {selectedService === 'emergency_fuel' && (
                          <p className="text-xs text-muted-foreground mt-1">+ fuel cost based on current prices</p>
                        )}
                      </CardContent>
                    </Card>
                  </CardContent>
                  <CardFooter className="flex gap-3">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setShowRequestForm(false);
                        setSelectedService(null);
                      }}
                      data-testid="button-cancel-request"
                    >
                      Cancel
                    </Button>
                    <Button 
                      className="flex-1 bg-copper hover:bg-copper/90"
                      onClick={handleSubmitRequest}
                      disabled={createRequestMutation.isPending}
                      data-testid="button-submit-request"
                    >
                      {createRequestMutation.isPending ? 'Requesting...' : 'Request Service Now'}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )}

            {requests.length > 0 && !showRequestForm && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h2 className="font-display text-lg font-semibold mb-4">Service History</h2>
                <div className="space-y-3">
                  {requests.slice(0, 5).map((request) => (
                    <Card key={request.id} className="hover:border-muted-foreground/30 transition-colors">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {React.createElement(serviceIcons[request.serviceType] || Zap, { 
                              className: `w-5 h-5 ${serviceColors[request.serviceType] || 'text-copper'}` 
                            })}
                            <div>
                              <p className="font-medium capitalize">
                                {request.serviceType.replace('_', ' ')}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(request.requestedAt), 'MMM d, yyyy h:mm a')}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge className={statusColors[request.status]}>
                              {request.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                            <p className="text-sm font-medium mt-1">
                              {request.creditUsed ? 'Free (Credit)' : `$${request.total}`}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}

        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-copper" />
              <div>
                <p className="font-medium">Emergency Line</p>
                <p className="text-sm text-muted-foreground">For urgent assistance, call: <span className="font-medium">(403) 555-FUEL</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );

  if (embedded) return content;
  return <AppShell forceShell="customer">{content}</AppShell>;
}
