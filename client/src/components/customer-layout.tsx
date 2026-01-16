import { ReactNode } from 'react';
import { useLocation, Link } from 'wouter';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useAuth } from '@/lib/auth';
import { Home, Fuel, Truck, Car, User, Bell, Menu, LogOut, Settings, CreditCard, Receipt, HelpCircle, RefreshCw, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import NotificationBell from '@/components/notification-bell';

interface CustomerLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: '/customer', icon: Home, label: 'Home' },
  { href: '/customer/book', icon: Fuel, label: 'Book' },
  { href: '/customer/deliveries', icon: Truck, label: 'Deliveries' },
  { href: '/customer/vehicles', icon: Car, label: 'Vehicles' },
  { href: '/customer/profile', icon: User, label: 'Profile' },
];

const moreItems = [
  { href: '/customer/subscription', icon: CreditCard, label: 'Subscription' },
  { href: '/customer/recurring', icon: RefreshCw, label: 'Recurring Deliveries' },
  { href: '/customer/receipts', icon: Receipt, label: 'Receipts' },
  { href: '/customer/help', icon: HelpCircle, label: 'Help & Support' },
];

export default function CustomerLayout({ children }: CustomerLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  const isDark = theme === 'dark';
  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 lg:pb-0">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/pmfs-logo.png" alt="PMFS Logo" className="w-9 h-9 object-contain lg:hidden" />
              <span className="font-display font-bold text-foreground hidden sm:block lg:hidden">Prairie Mobile Fuel Services</span>
            </div>

            <div className="flex items-center gap-3">
              <NotificationBell variant="customer" />

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" data-testid="button-menu">
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
                        <Badge variant="secondary" className="mt-2 capitalize">{user?.subscriptionTier} Plan</Badge>
                      </div>

                      {moreItems.map((item) => (
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

                      {isAdmin && (
                        <>
                          <div className="my-4 border-t border-border" />
                          <Link href="/ops">
                            <Button variant="outline" className="w-full justify-start gap-3 border-copper/30 text-copper">
                              <Settings className="w-4 h-4" />
                              Operations Dashboard
                            </Button>
                          </Link>
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
                          data-testid="switch-dark-mode-mobile"
                        />
                      </div>

                      <div className="my-2" />
                      
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 text-destructive hover:text-destructive"
                        onClick={handleLogout}
                        data-testid="button-logout"
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
          <span className="font-display font-bold text-foreground text-sm">Prairie Mobile Fuel</span>
        </div>
        
        <ScrollArea className="flex-1 px-3 py-4">
          <div className="px-3 py-3 mb-4 rounded-lg bg-muted/50">
            <p className="font-medium text-foreground text-sm truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            <Badge variant="secondary" className="mt-2 capitalize text-xs">{user?.subscriptionTier} Plan</Badge>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={`w-full justify-start gap-3 ${isActive ? 'bg-copper/10 text-copper hover:bg-copper/20' : ''}`}
                    data-testid={`sidebar-${item.label.toLowerCase()}`}
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
                  >
                    <item.icon className={`w-4 h-4 ${isActive ? 'text-copper' : ''}`} />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>

          {isAdmin && (
            <>
              <Separator className="my-4" />
              <Link href="/ops">
                <Button variant="outline" className="w-full justify-start gap-3 border-copper/30 text-copper">
                  <Settings className="w-4 h-4" />
                  Operations Dashboard
                </Button>
              </Link>
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
              data-testid="switch-dark-mode-desktop"
            />
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
            data-testid="sidebar-logout"
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

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border lg:hidden">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <button
                  className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors ${
                    isActive ? 'text-copper' : 'text-muted-foreground'
                  }`}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
