import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Search,
  Car,
  Mail,
  Phone,
  Calendar,
  Fuel,
  Download,
  Send,
  UserPlus,
  MessageSquare,
  MapPin,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  MailOpen,
  UserCheck,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { TIER_COLORS as TIER_COLOR_CONFIG } from "@/lib/colors";

interface WaitlistVehicle {
  id: string;
  entryId: string;
  year: string;
  make: string;
  model: string;
  fuelType: string;
}

interface WaitlistEntry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  preferredTier: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  vehicles: WaitlistVehicle[];
}

interface WaitlistData {
  entries: WaitlistEntry[];
  count: number;
  statusCounts: Record<string, number>;
}

const FUEL_LABELS: Record<string, string> = {
  regular: "Regular 87",
  midgrade: "Mid-Grade 89",
  premium: "Premium 91",
  diesel: "Diesel",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock },
  contacted: { label: "Contacted", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: MailOpen },
  invited: { label: "Invited", color: "bg-purple-100 text-purple-700 border-purple-200", icon: Send },
  converted: { label: "Converted", color: "bg-green-100 text-green-700 border-green-200", icon: UserCheck },
  declined: { label: "Declined", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
};

const TIER_LABELS: Record<string, string> = {
  payg: "Pay As You Go",
  access: "Access",
  heroes: "Seniors & Service Members",
  household: "Household",
  rural: "Rural",
  vip: "VIP Fuel Concierge",
  undecided: "Undecided",
};

interface OpsWaitlistProps {
  embedded?: boolean;
}

export default function OpsWaitlist({ embedded }: OpsWaitlistProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<WaitlistData>({
    queryKey: ["/api/ops/waitlist"],
    refetchOnMount: 'always',
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; status?: string; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/ops/waitlist/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/waitlist"] });
      toast({ title: "Entry updated" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/ops/waitlist/${id}/convert`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/waitlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription-tiers"] });
      toast({ title: "Customer converted", description: data.message });
    },
    onError: () => {
      toast({ title: "Failed to convert", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/ops/waitlist/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/waitlist"] });
      toast({ title: "Entry deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete", variant: "destructive" });
    },
  });

  const launchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ops/waitlist/notify-launch");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/waitlist"] });
      toast({ title: "Launch emails sent", description: `${data.sent} sent, ${data.failed} failed` });
    },
    onError: () => {
      toast({ title: "Failed to send launch emails", variant: "destructive" });
    },
  });

  const bulkConvertMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ops/waitlist/bulk-convert");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/waitlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription-tiers"] });
      toast({
        title: "Bulk conversion complete",
        description: `${data.converted} converted, ${data.skipped} already had accounts, ${data.failed} failed`,
      });
    },
    onError: () => {
      toast({ title: "Failed to bulk convert", variant: "destructive" });
    },
  });

  const entries = data?.entries ?? [];
  const totalCount = data?.count ?? 0;
  const statusCounts = data?.statusCounts ?? { new: 0, contacted: 0, invited: 0, converted: 0, declined: 0 };

  const filtered = entries.filter((entry) => {
    if (statusFilter !== "all" && entry.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const fullName = `${entry.firstName} ${entry.lastName}`.toLowerCase();
    return (
      fullName.includes(q) ||
      entry.email.toLowerCase().includes(q) ||
      (entry.phone && entry.phone.includes(q)) ||
      (entry.city && entry.city.toLowerCase().includes(q))
    );
  });

  const totalVehicles = entries.reduce((sum, e) => sum + e.vehicles.length, 0);

  const tierDistribution = entries.reduce((acc, e) => {
    const tier = e.preferredTier || "undecided";
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const TIER_ORDER = ["payg", "access", "heroes", "household", "rural", "vip", "undecided"];
  const TIER_BAR_COLORS: Record<string, string> = {
    payg: TIER_COLOR_CONFIG.payg?.bg || "bg-gray-500",
    access: TIER_COLOR_CONFIG.access?.bg || "bg-cyan-600",
    heroes: TIER_COLOR_CONFIG.heroes?.bg || "bg-blue-600",
    household: TIER_COLOR_CONFIG.household?.bg || "bg-sky-400",
    rural: TIER_COLOR_CONFIG.rural?.bg || "bg-green-700",
    vip: TIER_COLOR_CONFIG.vip?.bg || "bg-amber-600",
    undecided: "bg-muted-foreground/40",
  };
  const TIER_BADGE_STYLES: Record<string, string> = {
    payg: "bg-gray-100 text-gray-700 border-gray-300",
    access: "bg-cyan-50 text-cyan-700 border-cyan-300",
    heroes: "bg-blue-50 text-blue-700 border-blue-300",
    household: "bg-sky-50 text-sky-600 border-sky-300",
    rural: "bg-green-50 text-green-700 border-green-300",
    vip: "bg-amber-50 text-amber-700 border-amber-300",
  };

  const handleExport = () => {
    window.open("/api/ops/waitlist/export", "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-waitlist-count">{totalCount}</p>
              <p className="text-xs text-muted-foreground">Total Signups</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-new-count">{statusCounts.new || 0}</p>
              <p className="text-xs text-muted-foreground">New</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-converted-count">{statusCounts.converted || 0}</p>
              <p className="text-xs text-muted-foreground">Converted</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Car className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-vehicle-count">{totalVehicles}</p>
              <p className="text-xs text-muted-foreground">Vehicles</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {totalCount > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">Membership Interest</p>
            {totalCount > 0 && (
              <div className="flex h-4 rounded-full overflow-hidden mb-3">
                {TIER_ORDER.filter(t => tierDistribution[t]).map(tier => (
                  <div
                    key={tier}
                    className={`${TIER_BAR_COLORS[tier]} transition-all`}
                    style={{ width: `${(tierDistribution[tier] / totalCount) * 100}%` }}
                    title={`${TIER_LABELS[tier] || "Undecided"}: ${tierDistribution[tier]}`}
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {TIER_ORDER.filter(t => tierDistribution[t]).map(tier => (
                <div key={tier} className="flex items-center gap-1.5 text-xs">
                  <div className={`w-2.5 h-2.5 rounded-full ${TIER_BAR_COLORS[tier]}`} />
                  <span className="text-muted-foreground">{TIER_LABELS[tier] || "Undecided"}</span>
                  <span className="font-semibold">{tierDistribution[tier]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "All", count: totalCount },
          { key: "new", label: "New", count: statusCounts.new || 0 },
          { key: "contacted", label: "Contacted", count: statusCounts.contacted || 0 },
          { key: "invited", label: "Invited", count: statusCounts.invited || 0 },
          { key: "converted", label: "Converted", count: statusCounts.converted || 0 },
          { key: "declined", label: "Declined", count: statusCounts.declined || 0 },
        ].map((filter) => (
          <Button
            key={filter.key}
            variant={statusFilter === filter.key ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(filter.key)}
            data-testid={`button-filter-${filter.key}`}
          >
            {filter.label} ({filter.count})
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-waitlist-search"
          />
        </div>
        <Button variant="outline" size="icon" onClick={handleExport} title="Export CSV" data-testid="button-export-csv">
          <Download className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm("Send launch notification emails to all eligible waitlist members?")) {
              launchMutation.mutate();
            }
          }}
          disabled={launchMutation.isPending}
          data-testid="button-notify-launch"
        >
          <Send className="w-4 h-4 mr-1" />
          Notify Launch
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const eligibleCount = entries.filter(e => e.status !== 'declined' && e.status !== 'converted').length;
            if (eligibleCount === 0) {
              toast({ title: "No eligible entries", description: "All entries are already converted or declined." });
              return;
            }
            if (confirm(`Convert ${eligibleCount} eligible waitlist entries into accounts and send activation emails? This will create accounts for all entries that haven't been declined or already converted.`)) {
              bulkConvertMutation.mutate();
            }
          }}
          disabled={bulkConvertMutation.isPending}
          data-testid="button-bulk-convert"
        >
          {bulkConvertMutation.isPending ? (
            <>Converting...</>
          ) : (
            <>
              <UserPlus className="w-4 h-4 mr-1" />
              Launch & Convert All
            </>
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading waitlist...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium">
              {search || statusFilter !== "all" ? "No matching entries" : "No waitlist signups yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter !== "all"
                ? "Try a different search or filter"
                : "Turn on Pre-Launch Mode in Settings to start collecting signups"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry, idx) => {
            const isExpanded = expandedId === entry.id;
            const StatusIcon = STATUS_CONFIG[entry.status]?.icon || Clock;
            return (
              <Card key={entry.id} data-testid={`card-waitlist-entry-${entry.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-base" data-testid={`text-name-${entry.id}`}>
                          {entry.firstName} {entry.lastName}
                        </p>
                        <Badge className={`text-xs border ${STATUS_CONFIG[entry.status]?.color || ""}`} data-testid={`badge-status-${entry.id}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {STATUS_CONFIG[entry.status]?.label || entry.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          {entry.email}
                        </span>
                        {entry.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            {entry.phone}
                          </span>
                        )}
                        {entry.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {entry.city}
                          </span>
                        )}
                        {entry.preferredTier && (
                          <Badge variant="outline" className={`text-xs ${TIER_BADGE_STYLES[entry.preferredTier] || ''}`}>
                            {TIER_LABELS[entry.preferredTier] || entry.preferredTier}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-xs">
                        #{entries.indexOf(entry) + 1}
                      </Badge>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(parseISO(entry.createdAt), "MMM d, yyyy")}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        data-testid={`button-expand-${entry.id}`}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {entry.vehicles.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Vehicles ({entry.vehicles.length})
                      </p>
                      {entry.vehicles.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-3 py-2"
                          data-testid={`text-vehicle-${v.id}`}
                        >
                          <Car className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">
                            {v.year} {v.make} {v.model}
                          </span>
                          <Badge variant="secondary" className="ml-auto text-xs flex items-center gap-1">
                            <Fuel className="w-3 h-3" />
                            {FUEL_LABELS[v.fuelType] || v.fuelType}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      {entry.address && (
                        <p className="text-sm text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 inline mr-1" />
                          {entry.address}{entry.city ? `, ${entry.city}` : ""}
                        </p>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Status:</span>
                        <Select
                          value={entry.status}
                          onValueChange={(val) => updateMutation.mutate({ id: entry.id, status: val })}
                          disabled={entry.status === "converted"}
                        >
                          <SelectTrigger className="w-[160px] h-8" data-testid={`select-status-${entry.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="invited">Invited</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                            <SelectItem value="declined">Declined</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <p className="text-sm font-medium mb-1 flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" /> Notes
                        </p>
                        <Textarea
                          value={editingNotes[entry.id] ?? entry.notes ?? ""}
                          onChange={(e) => setEditingNotes({ ...editingNotes, [entry.id]: e.target.value })}
                          placeholder="Add notes about this lead..."
                          className="text-sm"
                          rows={2}
                          data-testid={`textarea-notes-${entry.id}`}
                        />
                        {(editingNotes[entry.id] !== undefined && editingNotes[entry.id] !== (entry.notes ?? "")) && (
                          <Button
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              updateMutation.mutate({ id: entry.id, notes: editingNotes[entry.id] });
                              const copy = { ...editingNotes };
                              delete copy[entry.id];
                              setEditingNotes(copy);
                            }}
                            disabled={updateMutation.isPending}
                            data-testid={`button-save-notes-${entry.id}`}
                          >
                            Save Notes
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {entry.status !== "converted" && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              if (confirm(`Convert ${entry.firstName} ${entry.lastName} to a customer? This will create their account and send an invite email.`)) {
                                convertMutation.mutate(entry.id);
                              }
                            }}
                            disabled={convertMutation.isPending}
                            data-testid={`button-convert-${entry.id}`}
                          >
                            <UserPlus className="w-4 h-4 mr-1" />
                            Convert to Customer
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm(`Delete ${entry.firstName} ${entry.lastName} from the waitlist? This cannot be undone.`)) {
                              deleteMutation.mutate(entry.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${entry.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
