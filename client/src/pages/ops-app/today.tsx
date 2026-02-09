import { OperatorShell } from "@/components/app-shell/operator-shell";
import { useAuth } from "@/lib/auth";
import OpsDispatch from "@/pages/ops/dispatch";

export default function TodayPage() {
  const { user } = useAuth();

  return (
    <OperatorShell>
      <div className="space-y-4">
        <OpsDispatch 
          embedded 
          driverId={user?.id || undefined} 
          driverName={user?.name || undefined} 
        />
      </div>
    </OperatorShell>
  );
}
