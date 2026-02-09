import { OperatorShell } from "@/components/app-shell/operator-shell";
import { useAuth } from "@/lib/auth";
import OpsDispatch from "@/pages/ops/dispatch";
import { HeaderWeatherWidget } from "@/components/header-weather-widget";
import { format } from "date-fns";

export default function TodayPage() {
  const { user } = useAuth();

  return (
    <OperatorShell>
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Today's Dispatch</h1>
            <p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <HeaderWeatherWidget />
        </div>
        <OpsDispatch 
          embedded 
          driverId={user?.id || undefined} 
          driverName={user?.name || undefined} 
        />
      </div>
    </OperatorShell>
  );
}
