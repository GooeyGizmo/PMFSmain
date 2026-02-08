import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'wouter';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Notifications from '@/pages/customer/notifications';

export default function AccountNotificationsPage() {
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
          <div className="mb-4">
            <Link href="/app/account?tab=profile">
              <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-2" data-testid="button-back-to-account">
                <ChevronLeft className="w-4 h-4" />
                Back to Account
              </Button>
            </Link>
          </div>

          <Notifications embedded />
        </motion.div>
      </div>
    </AppShell>
  );
}
