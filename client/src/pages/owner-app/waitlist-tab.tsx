import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Users, Mail, UserPlus, Clock, Search, Send, CheckCircle2, XCircle, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';

interface WaitlistEntry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  interestedTier: string | null;
  vehicles: string | null;
  status: 'pending' | 'invited' | 'signed_up' | 'declined';
  positionNumber: number;
  createdAt: string;
}

interface WaitlistStats {
  total: number;
  pending: number;
  invited: number;
  signedUp: number;
}

interface WaitlistResponse {
  entries: WaitlistEntry[];
  stats: WaitlistStats;
}

const apiRequest = async (method: string, url: string, body?: any) => {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Something went wrong');
  }
  return res.json();
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  pending: { label: 'Pending', variant: 'outline', className: 'border-yellow-500 text-yellow-700 bg-yellow-50' },
  invited: { label: 'Invited', variant: 'default', className: 'bg-blue-500 text-white' },
  signed_up: { label: 'Signed Up', variant: 'default', className: 'bg-green-500 text-white' },
  declined: { label: 'Declined', variant: 'destructive', className: '' },
};

export default function WaitlistTab({ embedded }: { embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<WaitlistResponse>({
    queryKey: ['/api/admin/waitlist'],
    queryFn: () => apiRequest('GET', '/api/admin/waitlist'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest('PATCH', `/api/admin/waitlist/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/waitlist'] });
      toast({ title: 'Status updated', description: 'Waitlist entry status has been updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const bulkInviteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest('POST', '/api/admin/waitlist/bulk-invite', { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/waitlist'] });
      setSelectedIds(new Set());
      toast({ title: 'Invitations sent', description: 'Selected entries have been invited.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const entries = data?.entries ?? [];
  const stats = data?.stats ?? { total: 0, pending: 0, invited: 0, signedUp: 0 };

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      !search ||
      `${entry.firstName} ${entry.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      entry.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingFilteredIds = filteredEntries
    .filter((e) => e.status === 'pending')
    .map((e) => e.id);

  const allPendingSelected =
    pendingFilteredIds.length > 0 && pendingFilteredIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingFilteredIds));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const parseVehicles = (vehiclesJson: string | null) => {
    if (!vehiclesJson) return [];
    try {
      return JSON.parse(vehiclesJson);
    } catch {
      return [];
    }
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.pending;
    return (
      <Badge variant={config.variant} className={config.className} data-testid={`badge-status-${status}`}>
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="waitlist-loading">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="waitlist-tab">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="stat-total">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total Signups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="stat-total-value">{stats.total}</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-pending">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600" data-testid="stat-pending-value">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-invited">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Invited
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600" data-testid="stat-invited-value">{stats.invited}</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-signed-up">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Signed Up
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600" data-testid="stat-signed-up-value">{stats.signedUp}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-waitlist"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="signed_up">Signed Up</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => bulkInviteMutation.mutate(Array.from(selectedIds))}
          disabled={selectedIds.size === 0 || bulkInviteMutation.isPending}
          data-testid="button-bulk-invite"
        >
          <Send className="w-4 h-4 mr-2" />
          Invite Selected ({selectedIds.size})
        </Button>
      </div>

      {filteredEntries.length === 0 ? (
        <Card data-testid="waitlist-empty">
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium">No waitlist entries found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {entries.length === 0
                ? 'No one has signed up for the waitlist yet.'
                : 'No entries match your current filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="waitlist-table">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left w-10">
                    <Checkbox
                      checked={allPendingSelected}
                      onCheckedChange={toggleSelectAll}
                      disabled={pendingFilteredIds.length === 0}
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">#</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Phone</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Tier</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Vehicles</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const vehicles = parseVehicles(entry.vehicles);
                  return (
                    <tr key={entry.id} className="border-b hover:bg-muted/30" data-testid={`row-waitlist-${entry.id}`}>
                      <td className="p-3">
                        {entry.status === 'pending' ? (
                          <Checkbox
                            checked={selectedIds.has(entry.id)}
                            onCheckedChange={() => toggleSelect(entry.id)}
                            data-testid={`checkbox-entry-${entry.id}`}
                          />
                        ) : (
                          <div className="w-4" />
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground" data-testid={`text-position-${entry.id}`}>
                        {entry.positionNumber}
                      </td>
                      <td className="p-3 font-medium" data-testid={`text-name-${entry.id}`}>
                        {entry.firstName} {entry.lastName}
                      </td>
                      <td className="p-3 text-muted-foreground" data-testid={`text-email-${entry.id}`}>
                        {entry.email}
                      </td>
                      <td className="p-3 text-muted-foreground" data-testid={`text-phone-${entry.id}`}>
                        {entry.phone || '—'}
                      </td>
                      <td className="p-3" data-testid={`text-tier-${entry.id}`}>
                        {entry.interestedTier ? (
                          <Badge variant="secondary">{entry.interestedTier.toUpperCase()}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3" data-testid={`text-vehicles-${entry.id}`}>
                        {vehicles.length > 0 ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-auto py-1 px-2" data-testid={`button-vehicles-${entry.id}`}>
                                {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64" align="start">
                              <div className="space-y-2">
                                <p className="font-medium text-sm">Vehicles</p>
                                {vehicles.map((v: any, i: number) => (
                                  <div key={i} className="text-sm text-muted-foreground border-t pt-1">
                                    {v.year && `${v.year} `}{v.make} {v.model}
                                    {v.fuelType && <span className="ml-1 text-xs">({v.fuelType})</span>}
                                  </div>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="p-3">
                        {getStatusBadge(entry.status)}
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap" data-testid={`text-date-${entry.id}`}>
                        {format(new Date(entry.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {entry.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatusMutation.mutate({ id: entry.id, status: 'invited' })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-invite-${entry.id}`}
                            >
                              <Send className="w-3 h-3 mr-1" />
                              Invite
                            </Button>
                          )}
                          {entry.status === 'invited' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatusMutation.mutate({ id: entry.id, status: 'invited' })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-resend-${entry.id}`}
                            >
                              <Mail className="w-3 h-3 mr-1" />
                              Resend
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-actions-${entry.id}`}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => updateStatusMutation.mutate({ id: entry.id, status: 'pending' })}
                                data-testid={`action-pending-${entry.id}`}
                              >
                                <Clock className="w-4 h-4 mr-2" />
                                Set Pending
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateStatusMutation.mutate({ id: entry.id, status: 'invited' })}
                                data-testid={`action-invited-${entry.id}`}
                              >
                                <Send className="w-4 h-4 mr-2" />
                                Set Invited
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateStatusMutation.mutate({ id: entry.id, status: 'signed_up' })}
                                data-testid={`action-signed-up-${entry.id}`}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Set Signed Up
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateStatusMutation.mutate({ id: entry.id, status: 'declined' })}
                                data-testid={`action-declined-${entry.id}`}
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Set Declined
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
