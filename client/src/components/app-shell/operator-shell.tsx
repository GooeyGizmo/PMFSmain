import { ReactNode } from 'react';
import { CalendarClock, Route, Truck, Users, Bell } from 'lucide-react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { cn } from '@/lib/utils';
import { ShellNav, type NavItem } from './shell-nav';
import { ShellHeader } from './shell-header';
import type { ShellType } from '@/lib/capabilities';

const OPERATOR_NAV_ITEMS: NavItem[] = [
  { 
    href: '/ops/today', 
    icon: CalendarClock, 
    label: 'Today',
    isActive: (path) => path === '/ops/today' || path === '/ops' || path === '/ops/' || path.startsWith('/ops/delivery'),
  },
  { 
    href: '/ops/routes', 
    icon: Route, 
    label: 'Routes',
    isActive: (path) => path.startsWith('/ops/routes') || path.startsWith('/ops/dispatch'),
  },
  { 
    href: '/ops/fleet', 
    icon: Truck, 
    label: 'Fleet',
    isActive: (path) => path.startsWith('/ops/fleet') || path.startsWith('/ops/pretrip') || path.startsWith('/ops/fuel-log') || path.startsWith('/ops/shipping'),
  },
  { 
    href: '/ops/customers', 
    icon: Users, 
    label: 'Customers',
    isActive: (path) => path === '/ops/customers',
  },
  { 
    href: '/ops/notify', 
    icon: Bell, 
    label: 'Notify',
    isActive: (path) => path.startsWith('/ops/notify') || path.startsWith('/ops/notifications'),
  },
];

interface OperatorShellProps {
  children: ReactNode;
  currentMode?: ShellType;
  onModeChange?: (mode: ShellType) => void;
  showModeToggle?: boolean;
}

export function OperatorShell({ 
  children, 
  currentMode,
  onModeChange,
  showModeToggle = false,
}: OperatorShellProps) {
  const layout = useLayoutMode();

  const navPosition = layout.isWide ? 'left' : layout.isMedium ? 'rail' : 'bottom';
  
  const contentPadding = cn(
    "min-h-screen bg-background",
    layout.isWide && "pl-64",
    layout.isMedium && "pl-16",
    (layout.isCompact || layout.isTall || layout.isSquare) && "pb-20",
  );

  return (
    <div className={contentPadding} data-testid="operator-shell">
      <ShellNav items={OPERATOR_NAV_ITEMS} position={navPosition} />
      
      <ShellHeader 
        shellType="operator"
        currentMode={currentMode}
        onModeChange={onModeChange}
        showModeToggle={showModeToggle}
      />

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
