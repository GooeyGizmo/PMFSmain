import { ReactNode } from 'react';
import { useLocation, Link } from 'wouter';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { 
  LayoutDashboard, Package, UserCog, Truck, Users, Fuel, AlertTriangle, 
  DollarSign, BarChart3, Menu, LogOut, Sun, Moon, Radio, Home, Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import NotificationBell from '@/components/notification-bell';
import DailyPricePrompt from '@/components/daily-price-prompt';

interface OpsLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: '/ops', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/ops/delivery-console', icon: Truck, label: 'Delivery Console' },
  { href: '/ops/orders', icon: Package, label: 'Orders' },
  { href: '/ops/customers', icon: UserCog, label: 'Customers' },
  { href: '/ops/drivers', icon: Users, label: 'Drivers' },
];

const moreItems = [
  { href: '/ops/fleet', icon: Fuel, label: 'Fleet & TDG' },
  { href: '/ops/emergency', icon: AlertTriangle, label: 'Emergency' },
  { href: '/ops/inventory', icon: Fuel, label: 'Inventory' },
  { href: '/ops/pricing', icon: DollarSign, label: 'Pricing' },
  { href: '/ops/financials', icon: Wallet, label: 'Financials', highlight: true },
  { href: '/ops/analytics', icon: BarChart3, label: 'Analytics' },
];

export default function OpsLayout({ children }: OpsLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout, isOwner } = useAuth();
  const { theme, setTheme } = useTheme();
  const { data: appModeData } = useQuery({
    queryKey: ['/api/ops/app-mode'],
    queryFn: async () => {
      const res = await fetch('/api/ops/app-mode', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch app mode');
      return res.json();
    },
  });

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  const isDark = theme === 'dark';
  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const allNavItems = [...navItems, ...moreItems];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DailyPricePrompt />
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/pmfs-logo.png" alt="PMFS Logo" className="w-9 h-9 object-contain lg:hidden" />
              <div className="lg:hidden">
                <span className="font-display font-bold text-foreground text-sm">Prairie Mobile Fuel</span>
                <Badge variant="outline" className="ml-2 text-xs border-copper/30 text-copper">Ops</Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <NotificationBell variant="ops" shellType="operator" />

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" data-testid="ops-menu-button">
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
                        {isOwner && <Badge variant="secondary" className="mt-2">Owner</Badge>}
                      </div>

                      {allNavItems.map((item) => (
                        <Link key={item.href} href={item.href}>
                          <Button
                            variant={location === item.href ? 'secondary' : 'ghost'}
                            className="w-full justify-start gap-3"
                          >
                            <item.icon className="w-4 h-4" />
                            {item.label}
                          </Button>
                        </Link>
                      ))}

                      <div className="my-4 border-t border-border" />

                      <Link href="/customer">
                        <Button
                          variant="ghost"
                          className="w-full justify-start gap-3 text-copper hover:text-copper hover:bg-copper/10"
                        >
                          <Home className="w-4 h-4" />
                          Customer View
                        </Button>
                      </Link>

                      {isOwner && (
                        <>
                          <div className="my-4 border-t border-border" />
                          <div className="px-3 py-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-3">
                              <Radio className={`w-4 h-4 ${appModeData?.appMode === 'live' ? 'text-sage' : appModeData?.appMode === 'pre-launch' ? 'text-copper' : 'text-amber-500'}`} />
                              <div>
                                <span className="text-sm font-medium">App Mode</span>
                                <p className="text-xs text-muted-foreground">
                                  {appModeData?.appMode === 'live' ? 'Public access' : appModeData?.appMode === 'pre-launch' ? 'Waitlist active' : 'Staff only'}
                                </p>
                              </div>
                            </div>
                            <Badge 
                              variant="secondary"
                              className={`mt-2 ${appModeData?.appMode === 'live' ? 'bg-sage text-white' : appModeData?.appMode === 'pre-launch' ? 'bg-copper text-white' : 'bg-amber-100 text-amber-800'}`}
                            >
                              {appModeData?.appMode === 'live' ? 'LIVE' : appModeData?.appMode === 'pre-launch' ? 'PRE-LAUNCH' : 'TEST'}
                            </Badge>
                          </div>
                        </>
                      )}

                      <div className="my-4 border-t border-border" />

                      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                          <span className="text-sm font-medium">Dark Mode</span>
                        </div>
                        <Switch
                          checked={isDark}
                          onCheckedChange={toggleTheme}
                          data-testid="ops-switch-dark-mode-mobile"
                        />
                      </div>

                      <div className="my-2" />
                      
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 text-destructive hover:text-destructive"
                        onClick={handleLogout}
                        data-testid="ops-button-logout-mobile"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </Button>
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:bg-background lg:border-r lg:border-border lg:z-40">
        <div className="flex items-center gap-3 h-16 px-6 border-b border-border">
          <img src="/pmfs-logo.png" alt="PMFS Logo" className="w-9 h-9 object-contain" />
          <div>
            <span className="font-display font-bold text-foreground text-sm">Prairie Mobile Fuel</span>
            <Badge variant="outline" className="ml-1 text-[10px] border-copper/30 text-copper">Ops</Badge>
          </div>
        </div>
        
        <ScrollArea className="flex-1 px-3 py-4">
          <div className="px-3 py-3 mb-4 rounded-lg bg-muted/50">
            <p className="font-medium text-foreground text-sm truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            {isOwner && <Badge variant="secondary" className="mt-2 text-xs">Owner</Badge>}
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={`w-full justify-start gap-3 ${isActive ? 'bg-copper/10 text-copper hover:bg-copper/20' : ''}`}
                    data-testid={`ops-sidebar-${item.label.toLowerCase()}`}
                  >
                    <item.icon className={`w-4 h-4 ${isActive ? 'text-copper' : ''}`} />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>

          <Separator className="my-4" />
          
          <p className="px-3 text-xs font-medium text-muted-foreground mb-2">More</p>
          <nav className="space-y-1">
            {moreItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={`w-full justify-start gap-3 text-sm ${isActive ? 'bg-copper/10 text-copper hover:bg-copper/20' : ''}`}
                    data-testid={`ops-sidebar-${item.label.toLowerCase()}`}
                  >
                    <item.icon className={`w-4 h-4 ${isActive ? 'text-copper' : ''}`} />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>

          <Separator className="my-4" />
          
          <Link href="/customer">
            <Button variant="outline" className="w-full justify-start gap-3 border-copper/30 text-copper hover:bg-copper/10">
              <Home className="w-4 h-4" />
              Customer View
            </Button>
          </Link>

          {isOwner && (
            <>
              <Separator className="my-4" />
              <div className="px-3 py-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Radio className={`w-4 h-4 ${appModeData?.appMode === 'live' ? 'text-sage' : appModeData?.appMode === 'pre-launch' ? 'text-copper' : 'text-amber-500'}`} />
                  <div>
                    <span className="text-xs font-medium">App Mode</span>
                    <p className="text-[10px] text-muted-foreground">
                      {appModeData?.appMode === 'live' ? 'Public access' : appModeData?.appMode === 'pre-launch' ? 'Waitlist active' : 'Staff only'}
                    </p>
                  </div>
                </div>
                <Badge 
                  variant="secondary"
                  className={`mt-2 text-xs ${appModeData?.appMode === 'live' ? 'bg-sage text-white' : appModeData?.appMode === 'pre-launch' ? 'bg-copper text-white' : 'bg-amber-100 text-amber-800'}`}
                >
                  {appModeData?.appMode === 'live' ? 'LIVE' : appModeData?.appMode === 'pre-launch' ? 'PRE-LAUNCH' : 'TEST'}
                </Badge>
              </div>
            </>
          )}
        </ScrollArea>

        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50">
            <div className="flex items-center gap-3">
              {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              <span className="text-sm font-medium">Dark Mode</span>
            </div>
            <Switch
              checked={isDark}
              onCheckedChange={toggleTheme}
              data-testid="ops-switch-dark-mode"
            />
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
            data-testid="ops-sidebar-logout"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1 lg:ml-64">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
