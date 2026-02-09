import { useLocation } from 'wouter';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor, LogOut, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
            <NotificationBell variant={notificationVariant} shellType={shellType} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  data-testid="button-theme-toggle"
                >
                  {theme === 'dark' ? <Moon className="w-5 h-5" /> : theme === 'light' ? <Sun className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme('light')} data-testid="menu-theme-light">
                  <Sun className="w-4 h-4 mr-2" />
                  Light
                  {theme === 'light' && <Check className="w-4 h-4 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')} data-testid="menu-theme-dark">
                  <Moon className="w-4 h-4 mr-2" />
                  Dark
                  {theme === 'dark' && <Check className="w-4 h-4 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')} data-testid="menu-theme-system">
                  <Monitor className="w-4 h-4 mr-2" />
                  System
                  {theme === 'system' && <Check className="w-4 h-4 ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout}
              className="text-destructive hover:text-destructive"
              data-testid="button-signout-header"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
