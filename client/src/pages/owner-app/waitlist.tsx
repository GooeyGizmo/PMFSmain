import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Search,
  Car,
  Mail,
  Phone,
  Calendar,
  Fuel,
} from "lucide-react";
import { format, parseISO } from "date-fns";

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
  createdAt: string;
  vehicles: WaitlistVehicle[];
}

interface WaitlistData {
  entries: WaitlistEntry[];
  count: number;
}

const FUEL_LABELS: Record<string, string> = {
  regular: "Regular 87",
  midgrade: "Mid-Grade 89",
  premium: "Premium 91",
  diesel: "Diesel",
};

interface OpsWaitlistProps {
  embedded?: boolean;
}

export default function OpsWaitlist({ embedded }: OpsWaitlistProps) {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<WaitlistData>({
    queryKey: ["/api/ops/waitlist"],
  });

  const entries = data?.entries ?? [];
  const totalCount = data?.count ?? 0;

  const filtered = entries.filter((entry) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const fullName = `${entry.firstName} ${entry.lastName}`.toLowerCase();
    return (
      fullName.includes(q) ||
      entry.email.toLowerCase().includes(q) ||
      (entry.phone && entry.phone.includes(q))
    );
  });

  const totalVehicles = entries.reduce((sum, e) => sum + e.vehicles.length, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
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
              <Car className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-vehicle-count">{totalVehicles}</p>
              <p className="text-xs text-muted-foreground">Vehicles</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          data-testid="input-waitlist-search"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading waitlist...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium">
              {search ? "No matching entries" : "No waitlist signups yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search
                ? "Try a different search term"
                : "Turn on Pre-Launch Mode in Settings to start collecting signups"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <Card key={entry.id} data-testid={`card-waitlist-entry-${entry.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-base" data-testid={`text-name-${entry.id}`}>
                      {entry.firstName} {entry.lastName}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
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
                  <div className="text-right">
                    <Badge variant="outline" className="text-xs">
                      #{entries.indexOf(entry) + 1}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(parseISO(entry.createdAt), "MMM d, yyyy")}
                    </p>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
