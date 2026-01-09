import { ReactNode } from 'react';
import { useLocation, Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Home, Fuel, Truck, Car, User, Bell, Menu, LogOut, Settings, Droplets } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  { href: '/customer/subscription', icon: Settings, label: 'Subscription' },
  { href: '/customer/recurring', icon: Truck, label: 'Recurring Deliveries' },
  { href: '/customer/referrals', icon: User, label: 'Referrals' },
  { href: '/customer/receipts', icon: Fuel, label: 'Receipts' },
  { href: '/customer/help', icon: Bell, label: 'Help & Support' },
];

export default function CustomerLayout({ children }: CustomerLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout, isAdmin } = useAuth();

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/pmfs-logo.png" alt="PMFS Logo" className="w-9 h-9 object-contain" />
              <span className="font-display font-bold text-foreground hidden sm:block">Prairie Mobile Fuel Services</span>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/customer/notifications">
                <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                  <Bell className="w-5 h-5" />
                  <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center bg-copper text-white text-xs">
                    2
                  </Badge>
                </Button>
              </Link>

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

      <main className="flex-1">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border md:hidden">
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
