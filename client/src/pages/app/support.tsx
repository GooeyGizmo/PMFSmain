import { motion } from 'framer-motion';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { AppShell } from '@/components/app-shell';
import { cn } from '@/lib/utils';

import Help from '@/pages/customer/help';

export default function SupportPage() {
  const layout = useLayoutMode();

  return (
    <AppShell forceShell="customer">
      <div className={cn(
        "max-w-4xl mx-auto px-4 py-6",
        layout.isCompact && "px-3 py-4"
      )}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Help & Support
            </h1>
            <p className="text-muted-foreground mt-1">
              Get help with your account and deliveries
            </p>
          </div>

          <Help embedded />
        </motion.div>
      </div>
    </AppShell>
  );
}
