import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: number | string;
  isActive?: (pathname: string) => boolean;
}

interface ShellNavProps {
  items: NavItem[];
  position: 'bottom' | 'left' | 'rail';
  className?: string;
}

export function ShellNav({ items, position, className }: ShellNavProps) {
  const [location] = useLocation();
  const layout = useLayoutMode();

  const isActive = (item: NavItem) => {
    if (item.isActive) return item.isActive(location);
    return location === item.href || location.startsWith(item.href + '/') || location.startsWith(item.href + '?');
  };

  if (position === 'bottom') {
    return (
      <nav 
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border",
          "safe-area-inset-bottom",
          className
        )}
        data-testid="nav-bottom"
      >
        <div className="flex items-center justify-evenly h-16 px-1 max-w-full">
          {items.slice(0, 5).map((item) => {
            const active = isActive(item);
            return (
              <Link key={item.href} href={item.href}>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 px-1.5 py-2 rounded-lg min-w-0 flex-1 max-w-[72px] min-h-[44px]",
                    "transition-colors duration-200",
                    active 
                      ? "text-primary bg-primary/10" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                  data-testid={`nav-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="relative">
                    <item.icon className={cn("w-5 h-5", active && "text-primary")} />
                    {item.badge !== undefined && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "text-[9px] font-medium truncate max-w-full text-center",
                    layout.isSquare && "hidden"
                  )}>
                    {item.label}
                  </span>
                </motion.button>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  if (position === 'rail') {
    return (
      <nav 
        className={cn(
          "fixed left-0 top-0 bottom-0 z-40 w-16 bg-background border-r border-border",
          "flex flex-col items-center py-4 gap-2",
          className
        )}
        data-testid="nav-rail"
      >
        <div className="w-10 h-10 mb-4">
          <img src="/pmfs-logo.png" alt="PMFS" className="w-full h-full object-contain" />
        </div>
        
        <div className="flex-1 flex flex-col items-center gap-1 w-full px-2">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <Link key={item.href} href={item.href}>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 p-2 rounded-lg w-12 h-12",
                    "transition-colors duration-200",
                    active 
                      ? "text-primary bg-primary/10" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                  title={item.label}
                  data-testid={`nav-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="relative">
                    <item.icon className="w-5 h-5" />
                    {item.badge !== undefined && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </motion.button>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav 
      className={cn(
        "fixed left-0 top-0 bottom-0 z-40 w-64 bg-background border-r border-border",
        "flex flex-col py-4",
        className
      )}
      data-testid="nav-sidebar"
    >
      <div className="flex items-center gap-3 px-4 mb-6">
        <img src="/pmfs-logo.png" alt="PMFS" className="w-10 h-10 object-contain" />
        <div>
          <span className="font-display font-bold text-foreground block">PMFS</span>
          <span className="text-xs text-muted-foreground">Prairie Mobile Fuel</span>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col gap-1 px-3">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link key={item.href} href={item.href}>
              <motion.button
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left",
                  "transition-colors duration-200",
                  active 
                    ? "text-primary bg-primary/10 font-medium" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                data-testid={`nav-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="relative">
                  <item.icon className="w-5 h-5" />
                  {item.badge !== undefined && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-sm">{item.label}</span>
              </motion.button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
