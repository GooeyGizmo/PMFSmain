import { OperatorShell } from "@/components/app-shell/operator-shell";
import FuelManagement from "@/pages/ops/fuel-management";

export default function FuelPage() {
  return (
    <OperatorShell>
      <FuelManagement embedded />
    </OperatorShell>
  );
}
