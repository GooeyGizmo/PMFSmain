import { ReactNode } from 'react';
import { LayoutDashboard, Settings2, Wallet, Briefcase, Settings } from 'lucide-react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { cn } from '@/lib/utils';
import { ShellNav, type NavItem } from './shell-nav';
import { ShellHeader } from './shell-header';
import DailyPricePrompt from '@/components/daily-price-prompt';
import type { ShellType } from '@/lib/capabilities';

const OWNER_NAV_ITEMS: NavItem[] = [
  { 
    href: '/owner', 
    icon: LayoutDashboard, 
    label: 'Command',
    isActive: (path) => path === '/owner' || path === '/owner/',
  },
  { 
    href: '/owner/operations', 
    icon: Settings2, 
    label: 'Operations',
    isActive: (path) => path.startsWith('/owner/operations') || 
      path.startsWith('/ops/dispatch') || 
      path.startsWith('/ops/orders') ||
      path.startsWith('/ops/fleet') ||
      path.startsWith('/ops/inventory') ||
      path.startsWith('/ops/emergency'),
  },
  { 
    href: '/owner/finance', 
    icon: Wallet, 
    label: 'Finance',
    isActive: (path) => path.startsWith('/owner/finance') || 
      path.startsWith('/ops/financials') || 
      path.startsWith('/ops/closeout') ||
      path.startsWith('/ops/analytics') ||
      path.includes('report'),
  },
  { 
    href: '/owner/business', 
    icon: Briefcase, 
    label: 'Business',
    isActive: (path) => path.startsWith('/owner/business') || 
      path.startsWith('/ops/pricing') || 
      path.startsWith('/ops/customers') ||
      path.startsWith('/ops/drivers') ||
      path.startsWith('/ops/promo'),
  },
  { 
    href: '/owner/settings', 
    icon: Settings, 
    label: 'Settings',
    isActive: (path) => path.startsWith('/owner/settings'),
  },
];

const OWNER_MORE_ITEMS: NavItem[] = [];

interface OwnerShellProps {
  children: ReactNode;
  currentMode?: ShellType;
  onModeChange?: (mode: ShellType) => void;
  showModeToggle?: boolean;
}

export function OwnerShell({ 
  children, 
  currentMode,
  onModeChange,
  showModeToggle = false,
}: OwnerShellProps) {
  const layout = useLayoutMode();

  const navPosition = layout.isWide ? 'left' : layout.isMedium ? 'rail' : 'bottom';
  
  const contentPadding = cn(
    "min-h-screen bg-background",
    layout.isWide && "pl-64",
    layout.isMedium && "pl-16",
    (layout.isCompact || layout.isTall || layout.isSquare) && "pb-20",
  );

  return (
    <div className={contentPadding} data-testid="owner-shell">
      <DailyPricePrompt />
      
      <ShellNav items={OWNER_NAV_ITEMS} position={navPosition} />
      
      <ShellHeader 
        shellType="owner"
        currentMode={currentMode}
        onModeChange={onModeChange}
        showModeToggle={showModeToggle}
        moreItems={OWNER_MORE_ITEMS}
      />

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
