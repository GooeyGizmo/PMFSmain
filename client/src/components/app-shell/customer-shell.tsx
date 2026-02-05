import { ReactNode } from 'react';
import { Home, Package, Clock, User, HelpCircle, CreditCard, RefreshCw, Receipt, CalendarPlus } from 'lucide-react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { cn } from '@/lib/utils';
import { ShellNav, type NavItem } from './shell-nav';
import { ShellHeader } from './shell-header';

const CUSTOMER_NAV_ITEMS: NavItem[] = [
  { 
    href: '/app', 
    icon: Home, 
    label: 'Home',
    isActive: (path) => path === '/app' || path === '/app/' || path === '/customer' || path === '/customer/',
  },
  { 
    href: '/customer/book', 
    icon: CalendarPlus, 
    label: 'Book',
    isActive: (path) => path.startsWith('/customer/book'),
  },
  { 
    href: '/app/my-stuff', 
    icon: Package, 
    label: 'My Stuff',
    isActive: (path) => path.startsWith('/app/my-stuff') || path.startsWith('/customer/vehicles'),
  },
  { 
    href: '/app/history', 
    icon: Clock, 
    label: 'History',
    isActive: (path) => path.startsWith('/app/history') || path.startsWith('/customer/deliveries') || path.startsWith('/customer/receipts'),
  },
  { 
    href: '/app/account', 
    icon: User, 
    label: 'Account',
    isActive: (path) => path.startsWith('/app/account') || path.startsWith('/customer/profile') || path.startsWith('/customer/subscription') || path.startsWith('/app/support') || path.startsWith('/customer/help'),
  },
];

const CUSTOMER_MORE_ITEMS: NavItem[] = [
  { href: '/app/account?tab=subscription', icon: CreditCard, label: 'Subscription' },
  { href: '/app/account?tab=recurring', icon: RefreshCw, label: 'Recurring Deliveries' },
  { href: '/app/history?tab=receipts', icon: Receipt, label: 'Receipts' },
  { href: '/app/account?tab=support', icon: HelpCircle, label: 'Support' },
];

interface CustomerShellProps {
  children: ReactNode;
}

export function CustomerShell({ children }: CustomerShellProps) {
  const layout = useLayoutMode();

  const navPosition = layout.isWide ? 'left' : layout.isMedium ? 'rail' : 'bottom';
  const hasBottomNav = navPosition === 'bottom';

  return (
    <div 
      className={cn(
        "h-screen flex flex-col bg-background overflow-hidden",
        layout.isWide && "pl-64",
        layout.isMedium && "pl-16",
      )}
      data-testid="customer-shell"
    >
      <ShellNav items={CUSTOMER_NAV_ITEMS} position={navPosition} />
      
      <ShellHeader 
        shellType="customer"
        moreItems={CUSTOMER_MORE_ITEMS}
      />

      <main className={cn(
        "flex-1 overflow-y-auto px-4 md:px-6 pt-4",
        hasBottomNav ? "pb-24" : "pb-4"
      )}>
        {children}
      </main>
    </div>
  );
}
