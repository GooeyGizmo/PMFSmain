import { motion } from 'framer-motion';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { AppShell } from '@/components/app-shell';
import { cn } from '@/lib/utils';

import Deliveries from '@/pages/customer/deliveries';

export default function HistoryPage() {
  const layout = useLayoutMode();

  return (
    <AppShell forceShell="customer">
      <div className={cn(
        "max-w-6xl mx-auto px-4 py-6",
        layout.isCompact && "px-3 py-4"
      )}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Order History
            </h1>
            <p className="text-muted-foreground mt-1">
              View your past deliveries and receipts
            </p>
          </div>

          <Deliveries embedded />
        </motion.div>
      </div>
    </AppShell>
  );
}
