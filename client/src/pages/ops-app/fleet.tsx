import { OperatorShell } from "@/components/app-shell/operator-shell";
import FleetManagement from "@/pages/ops/fleet";

export default function FleetPage() {
  return (
    <OperatorShell>
      <FleetManagement embedded />
    </OperatorShell>
  );
}
