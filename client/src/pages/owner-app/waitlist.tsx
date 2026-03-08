import { useState } from "react";
import { Link } from "wouter";
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
  Crown,
  BarChart3,
  Star,
  Pencil,
  Save,
  X,
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
  postalCode: string | null;
  preferredTier: string | null;
  referralSource: string | null;
  referralDetail: string | null;
  estimatedMonthlyUsage: string | null;
  vehicleCount: number | null;
  priorityScore: number;
  invitedAt: string | null;
  convertedAt: string | null;
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

interface VipWaitlistEntry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  userId: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface VipWaitlistData {
  entries: VipWaitlistEntry[];
  count: number;
  statusCounts: Record<string, number>;
  activeVipCount: number;
  maxCapacity: number;
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
  const [activeTab, setActiveTab] = useState<"customer" | "vip">("customer");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    postalCode: string; phone: string; address: string; city: string;
    preferredTier: string; referralSource: string; referralDetail: string;
    estimatedMonthlyUsage: string; vehicleCount: string;
  }>({ postalCode: '', phone: '', address: '', city: '', preferredTier: '', referralSource: '', referralDetail: '', estimatedMonthlyUsage: '', vehicleCount: '' });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<WaitlistData>({
    queryKey: ["/api/ops/waitlist"],
  });

  const { data: vipData, isLoading: vipLoading } = useQuery<VipWaitlistData>({
    queryKey: ["/api/ops/vip-waitlist"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; status?: string; notes?: string; postalCode?: string; phone?: string | null; address?: string | null; city?: string | null; preferredTier?: string | null; referralSource?: string | null; referralDetail?: string | null; estimatedMonthlyUsage?: string | null; vehicleCount?: number | null }) => {
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

  const vipUpdateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; status?: string; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/ops/vip-waitlist/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/vip-waitlist"] });
      toast({ title: "VIP entry updated" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const vipConvertMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/ops/vip-waitlist/${id}/convert`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/vip-waitlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/vip-capacity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/customers"] });
      toast({ title: "VIP member activated", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Failed to convert", description: error?.message || "VIP may be at capacity", variant: "destructive" });
    },
  });

  const vipInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/ops/vip-waitlist/${id}/invite`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/vip-waitlist"] });
      toast({ title: "VIP invitation sent", description: data.message });
    },
    onError: () => {
      toast({ title: "Failed to send invitation", variant: "destructive" });
    },
  });

  const vipDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/ops/vip-waitlist/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/vip-waitlist"] });
      toast({ title: "VIP entry deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete", variant: "destructive" });
    },
  });

  const handleTabChange = (tab: "customer" | "vip") => {
    setActiveTab(tab);
    setSearch("");
    setStatusFilter("all");
    setExpandedId(null);
    setEditingNotes({});
  };

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
  }).sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));

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

  const vipEntries = vipData?.entries ?? [];
  const vipCount = vipData?.count ?? 0;
  const vipStatusCounts = vipData?.statusCounts ?? { new: 0, contacted: 0, invited: 0, converted: 0, declined: 0 };
  const activeVipCount = vipData?.activeVipCount ?? 0;
  const maxVipCapacity = vipData?.maxCapacity ?? 10;

  const vipFiltered = vipEntries.filter((entry) => {
    if (statusFilter !== "all" && entry.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      entry.name.toLowerCase().includes(q) ||
      entry.email.toLowerCase().includes(q) ||
      (entry.phone && entry.phone.includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b">
        <button
          onClick={() => handleTabChange("customer")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "customer"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-customer-waitlist"
        >
          <Users className="w-4 h-4 inline mr-1.5" />
          Customer Waitlist
          {totalCount > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">{totalCount}</Badge>
          )}
        </button>
        <button
          onClick={() => handleTabChange("vip")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "vip"
              ? "border-amber-500 text-amber-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-vip-waitlist"
        >
          <Crown className="w-4 h-4 inline mr-1.5" />
          VIP Waitlist
          {vipCount > 0 && (
            <Badge className="ml-2 text-xs bg-amber-100 text-amber-700 border-amber-300">{vipCount}</Badge>
          )}
        </button>
      </div>

      {activeTab === "customer" ? (
        <>
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
            <Link href="/ops/waitlist-analytics">
              <Button variant="outline" size="sm" data-testid="button-waitlist-analytics">
                <BarChart3 className="w-4 h-4 mr-1" />
                Analytics
              </Button>
            </Link>
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
                    : "Set App Mode to Pre-Launch in Settings to start collecting signups"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((entry) => {
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
                            {entry.priorityScore > 0 && (
                              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50" data-testid={`badge-priority-${entry.id}`}>
                                <Star className="w-3 h-3 mr-0.5 fill-amber-400 text-amber-400" />
                                {entry.priorityScore}
                              </Badge>
                            )}
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
                          {editingId === entry.id ? (
                            <div className="space-y-3" data-testid={`form-edit-${entry.id}`}>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">Postal Code <span className="text-red-500">*</span></label>
                                  <Input
                                    value={editForm.postalCode}
                                    onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })}
                                    placeholder="T2X 1A2"
                                    className="h-8 text-sm"
                                    data-testid={`input-edit-postal-${entry.id}`}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">Phone</label>
                                  <Input
                                    value={editForm.phone}
                                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                    placeholder="(403) 555-1234"
                                    className="h-8 text-sm"
                                    data-testid={`input-edit-phone-${entry.id}`}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">Address</label>
                                  <Input
                                    value={editForm.address}
                                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                    placeholder="123 Main St"
                                    className="h-8 text-sm"
                                    data-testid={`input-edit-address-${entry.id}`}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">City</label>
                                  <Input
                                    value={editForm.city}
                                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                                    placeholder="Calgary"
                                    className="h-8 text-sm"
                                    data-testid={`input-edit-city-${entry.id}`}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">Preferred Tier</label>
                                  <Select
                                    value={editForm.preferredTier || "none"}
                                    onValueChange={(val) => setEditForm({ ...editForm, preferredTier: val === "none" ? "" : val })}
                                  >
                                    <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-tier-${entry.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Not selected</SelectItem>
                                      {Object.entries(TIER_LABELS).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>{label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">Vehicle Count</label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={editForm.vehicleCount}
                                    onChange={(e) => setEditForm({ ...editForm, vehicleCount: e.target.value })}
                                    placeholder="0"
                                    className="h-8 text-sm"
                                    data-testid={`input-edit-vehicles-${entry.id}`}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">Referral Source</label>
                                  <Select
                                    value={editForm.referralSource || "none"}
                                    onValueChange={(val) => setEditForm({ ...editForm, referralSource: val === "none" ? "" : val })}
                                  >
                                    <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-referral-${entry.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Not specified</SelectItem>
                                      <SelectItem value="google">Google Search</SelectItem>
                                      <SelectItem value="social_media">Social Media</SelectItem>
                                      <SelectItem value="word_of_mouth">Word of Mouth</SelectItem>
                                      <SelectItem value="flyer">Flyer/Print Ad</SelectItem>
                                      <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">Est. Monthly Usage</label>
                                  <Select
                                    value={editForm.estimatedMonthlyUsage || "none"}
                                    onValueChange={(val) => setEditForm({ ...editForm, estimatedMonthlyUsage: val === "none" ? "" : val })}
                                  >
                                    <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-usage-${entry.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Not specified</SelectItem>
                                      <SelectItem value="1_tank">~1 fill-up/month</SelectItem>
                                      <SelectItem value="2_3_tanks">2-3 fill-ups/month</SelectItem>
                                      <SelectItem value="4_plus_tanks">4+ fill-ups/month</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              {editForm.referralSource === "other" && (
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground">Referral Detail</label>
                                  <Input
                                    value={editForm.referralDetail}
                                    onChange={(e) => setEditForm({ ...editForm, referralDetail: e.target.value })}
                                    placeholder="Please specify..."
                                    className="h-8 text-sm"
                                    data-testid={`input-edit-referral-detail-${entry.id}`}
                                  />
                                </div>
                              )}
                              <div className="flex items-center gap-2 pt-1">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if (!editForm.postalCode.trim()) {
                                      toast({ title: 'Postal code required', description: 'Postal code cannot be empty.', variant: 'destructive' });
                                      return;
                                    }
                                    updateMutation.mutate({
                                      id: entry.id,
                                      postalCode: editForm.postalCode.trim(),
                                      phone: editForm.phone || null,
                                      address: editForm.address || null,
                                      city: editForm.city || null,
                                      preferredTier: editForm.preferredTier || null,
                                      referralSource: editForm.referralSource || null,
                                      referralDetail: editForm.referralDetail || null,
                                      estimatedMonthlyUsage: editForm.estimatedMonthlyUsage || null,
                                      vehicleCount: editForm.vehicleCount ? Number(editForm.vehicleCount) : null,
                                    });
                                    setEditingId(null);
                                  }}
                                  disabled={updateMutation.isPending}
                                  data-testid={`button-save-edit-${entry.id}`}
                                >
                                  <Save className="w-3.5 h-3.5 mr-1" />
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingId(null)}
                                  data-testid={`button-cancel-edit-${entry.id}`}
                                >
                                  <X className="w-3.5 h-3.5 mr-1" />
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                          {entry.address && (
                            <p className="text-sm text-muted-foreground">
                              <MapPin className="w-3.5 h-3.5 inline mr-1" />
                              {entry.address}{entry.city ? `, ${entry.city}` : ""}
                            </p>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(entry.id);
                              setEditForm({
                                postalCode: entry.postalCode || '',
                                phone: entry.phone || '',
                                address: entry.address || '',
                                city: entry.city || '',
                                preferredTier: entry.preferredTier || '',
                                referralSource: entry.referralSource || '',
                                referralDetail: entry.referralDetail || '',
                                estimatedMonthlyUsage: entry.estimatedMonthlyUsage || '',
                                vehicleCount: entry.vehicleCount != null ? String(entry.vehicleCount) : '',
                              });
                            }}
                            data-testid={`button-edit-${entry.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" />
                            Edit Details
                          </Button>

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
                            </>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Crown className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-vip-active-count">{activeVipCount}</p>
                  <p className="text-xs text-muted-foreground">Active VIPs</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Users className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-vip-capacity">
                    {activeVipCount}/{maxVipCapacity}
                  </p>
                  <p className="text-xs text-muted-foreground">Capacity</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-vip-waitlist-count">{vipCount}</p>
                  <p className="text-xs text-muted-foreground">On Waitlist</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${activeVipCount >= maxVipCapacity ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                  {activeVipCount >= maxVipCapacity ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-vip-available">
                    {Math.max(0, maxVipCapacity - activeVipCount)}
                  </p>
                  <p className="text-xs text-muted-foreground">Spots Open</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {activeVipCount >= maxVipCapacity && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4 flex items-center gap-3">
                <Crown className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                  VIP is at full capacity ({maxVipCapacity} members). To activate more members, increase the capacity in Settings.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "All", count: vipCount },
              { key: "new", label: "New", count: vipStatusCounts.new || 0 },
              { key: "contacted", label: "Contacted", count: vipStatusCounts.contacted || 0 },
              { key: "invited", label: "Invited", count: vipStatusCounts.invited || 0 },
              { key: "converted", label: "Activated", count: vipStatusCounts.converted || 0 },
              { key: "declined", label: "Declined", count: vipStatusCounts.declined || 0 },
            ].map((filter) => (
              <Button
                key={filter.key}
                variant={statusFilter === filter.key ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(filter.key)}
                data-testid={`button-vip-filter-${filter.key}`}
              >
                {filter.label} ({filter.count})
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-vip-waitlist-search"
              />
            </div>
          </div>

          {vipLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading VIP waitlist...</div>
          ) : vipFiltered.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Crown className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-lg font-medium">
                  {search || statusFilter !== "all" ? "No matching entries" : "No VIP waitlist entries yet"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search || statusFilter !== "all"
                    ? "Try a different search or filter"
                    : "People who request VIP when it's at capacity will appear here"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {vipFiltered.map((entry, idx) => {
                const isExpanded = expandedId === entry.id;
                const StatusIcon = STATUS_CONFIG[entry.status]?.icon || Clock;
                return (
                  <Card key={entry.id} className="border-amber-100" data-testid={`card-vip-waitlist-entry-${entry.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Crown className="w-4 h-4 text-amber-500" />
                            <p className="font-semibold text-base" data-testid={`text-vip-name-${entry.id}`}>
                              {entry.name}
                            </p>
                            <Badge className={`text-xs border ${STATUS_CONFIG[entry.status]?.color || ""}`} data-testid={`badge-vip-status-${entry.id}`}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {entry.status === 'converted' ? 'Activated' : (STATUS_CONFIG[entry.status]?.label || entry.status)}
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
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                            #{vipEntries.indexOf(entry) + 1}
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
                            data-testid={`button-vip-expand-${entry.id}`}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Status:</span>
                            <Select
                              value={entry.status}
                              onValueChange={(val) => vipUpdateMutation.mutate({ id: entry.id, status: val })}
                              disabled={entry.status === "converted"}
                            >
                              <SelectTrigger className="w-[160px] h-8" data-testid={`select-vip-status-${entry.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="contacted">Contacted</SelectItem>
                                <SelectItem value="invited">Invited</SelectItem>
                                <SelectItem value="converted">Activated</SelectItem>
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
                              placeholder="Add notes about this VIP prospect..."
                              className="text-sm"
                              rows={2}
                              data-testid={`textarea-vip-notes-${entry.id}`}
                            />
                            {(editingNotes[entry.id] !== undefined && editingNotes[entry.id] !== (entry.notes ?? "")) && (
                              <Button
                                size="sm"
                                className="mt-2"
                                onClick={() => {
                                  vipUpdateMutation.mutate({ id: entry.id, notes: editingNotes[entry.id] });
                                  const copy = { ...editingNotes };
                                  delete copy[entry.id];
                                  setEditingNotes(copy);
                                }}
                                disabled={vipUpdateMutation.isPending}
                                data-testid={`button-vip-save-notes-${entry.id}`}
                              >
                                Save Notes
                              </Button>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {entry.status !== "converted" && entry.status !== "invited" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (confirm(`Send a VIP invitation email to ${entry.name}?`)) {
                                    vipInviteMutation.mutate(entry.id);
                                  }
                                }}
                                disabled={vipInviteMutation.isPending}
                                data-testid={`button-vip-invite-${entry.id}`}
                              >
                                <Send className="w-4 h-4 mr-1" />
                                Send Invite
                              </Button>
                            )}
                            {entry.status !== "converted" && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => {
                                  if (activeVipCount >= maxVipCapacity) {
                                    toast({
                                      title: "VIP at capacity",
                                      description: `All ${maxVipCapacity} VIP spots are filled. Increase capacity in Settings first.`,
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  if (confirm(`Activate VIP membership for ${entry.name}? This will create their account with VIP tier and send an activation email.`)) {
                                    vipConvertMutation.mutate(entry.id);
                                  }
                                }}
                                disabled={vipConvertMutation.isPending || activeVipCount >= maxVipCapacity}
                                data-testid={`button-vip-activate-${entry.id}`}
                              >
                                <Crown className="w-4 h-4 mr-1" />
                                Activate VIP
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                if (confirm(`Remove ${entry.name} from the VIP waitlist? This cannot be undone.`)) {
                                  vipDeleteMutation.mutate(entry.id);
                                }
                              }}
                              disabled={vipDeleteMutation.isPending}
                              data-testid={`button-vip-delete-${entry.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Remove
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
        </>
      )}
    </div>
  );
}
