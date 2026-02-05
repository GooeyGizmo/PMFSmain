import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { Menu, Sun, Moon, LogOut, Settings, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import NotificationBell from '@/components/notification-bell';
import { useAuth } from '@/lib/auth';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { cn } from '@/lib/utils';
import { ModeToggle } from './mode-toggle';
import type { ShellType } from '@/lib/capabilities';
import type { NavItem } from './shell-nav';

interface ShellHeaderProps {
  shellType: ShellType;
  currentMode?: ShellType;
  onModeChange?: (mode: ShellType) => void;
  showModeToggle?: boolean;
  moreItems?: NavItem[];
  className?: string;
}

export function ShellHeader({ 
  shellType, 
  currentMode,
  onModeChange,
  showModeToggle = false,
  moreItems = [],
  className 
}: ShellHeaderProps) {
  const { user, logout, isAdmin, isOwner } = useAuth();
  const { theme, setTheme } = useTheme();
  const [location, setLocation] = useLocation();
  const layout = useLayoutMode();

  const isDark = theme === 'dark';
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  const notificationVariant = shellType === 'customer' ? 'customer' : 'ops';

  return (
    <header 
      className={cn(
        "sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border",
        layout.isWide && "pl-64",
        layout.isMedium && "pl-16",
        className
      )}
      data-testid="shell-header"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <div className="flex items-center gap-3">
            {(layout.isCompact || layout.isTall || layout.isSquare) && (
              <img src="/pmfs-logo.png" alt="PMFS Logo" className="w-8 h-8 object-contain" />
            )}
            
            {showModeToggle && currentMode && onModeChange && (
              <ModeToggle 
                currentMode={currentMode} 
                onModeChange={onModeChange} 
              />
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell variant={notificationVariant} />

            {shellType !== 'owner' && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={toggleTheme}
                  data-testid="button-theme-toggle"
                >
                  {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleLogout}
                  className="text-destructive hover:text-destructive"
                  data-testid="button-signout-header"
                >
                  <LogOut className="w-5 h-5" />
                </Button>
              </>
            )}

            {shellType === 'owner' && layout.isWide && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
                    <span className="text-sm font-medium truncate max-w-[120px]">{user?.name}</span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="font-medium text-sm">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/owner/settings">
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {shellType === 'owner' && !layout.isWide && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-menu">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle className="font-display">Menu</SheetTitle>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(100vh-100px)] mt-6">
                    <div className="space-y-1">
                      <div className="px-3 py-4 mb-4 rounded-lg bg-muted/50">
                        <p className="font-medium text-foreground">{user?.name}</p>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                      </div>
                      <Link href="/owner/settings">
                        <Button variant="ghost" className="w-full justify-start gap-3">
                          <Settings className="w-4 h-4" />
                          Settings
                        </Button>
                      </Link>
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
