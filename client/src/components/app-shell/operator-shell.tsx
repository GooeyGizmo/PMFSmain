import { ReactNode } from 'react';
import { CalendarClock, Truck, Users, Fuel, Settings } from 'lucide-react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { cn } from '@/lib/utils';
import { ShellNav, type NavItem } from './shell-nav';
import { ShellHeader } from './shell-header';
import type { ShellType } from '@/lib/capabilities';

const OPERATOR_NAV_ITEMS: NavItem[] = [
  { 
    href: '/operator', 
    icon: CalendarClock, 
    label: 'Today',
    isActive: (path) => path === '/operator' || path === '/operator/',
  },
  { 
    href: '/operator/fleet', 
    icon: Truck, 
    label: 'Fleet',
    isActive: (path) => path.startsWith('/operator/fleet'),
  },
  { 
    href: '/operator/fuel', 
    icon: Fuel, 
    label: 'Fuel',
    isActive: (path) => path.startsWith('/operator/fuel'),
  },
  { 
    href: '/operator/customers', 
    icon: Users, 
    label: 'Customers',
    isActive: (path) => path.startsWith('/operator/customers'),
  },
  { 
    href: '/operator/settings', 
    icon: Settings, 
    label: 'Settings',
    isActive: (path) => path.startsWith('/operator/settings'),
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

      <main className="flex-1 px-4 md:px-6 pt-4 pb-4">
        {children}
      </main>
    </div>
  );
}
