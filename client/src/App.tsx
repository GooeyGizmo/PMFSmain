import { Switch, Route, Redirect, useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { AuthProvider, useAuth } from "@/lib/auth";
import { WebSocketProvider } from "@/components/websocket-provider";
import { ScrollRestoration } from "@/lib/useScrollRestoration";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import BookDelivery from "@/pages/customer/book";
import ReceiptPrint from "@/pages/customer/receipt-print";
import AppHome from "@/pages/app/home";
import AppAccountNotifications from "@/pages/app/account-notifications";
import AppMyStuff from "@/pages/app/my-stuff";
import AppHistory from "@/pages/app/history";
import AppAccount from "@/pages/app/account";
import AppSupport from "@/pages/app/support";
import OpsAppToday from "@/pages/ops-app/today";
import OpsAppFleet from "@/pages/ops-app/fleet";
import OpsAppCustomers from "@/pages/ops-app/customers";
import OpsAppFuel from "@/pages/ops-app/fuel";
import OpsAppSettings from "@/pages/ops-app/settings";
import OwnerCommand from "@/pages/owner-app/command";
import OwnerOperations from "@/pages/owner-app/operations";
import OwnerFinance from "@/pages/owner-app/finance";
import OwnerBusiness from "@/pages/owner-app/business";
import OwnerSettings from "@/pages/owner-app/settings";
import OwnerReports from "@/pages/owner-app/reports";
import OpsDashboard from "@/pages/ops/dashboard";
import OpsShippingDocument from "@/pages/ops/shipping-document";
import OpsPreTripDocument from "@/pages/ops/pretrip-document";
import OpsFuelLog from "@/pages/ops/fuel-log";
import OpsCloseoutReport from "@/pages/ops/closeout-report";
import OpsLedgerReport from "@/pages/ops/ledger-report";
import OpsGstReport from "@/pages/ops/gst-report";
import OpsOrdersReport from "@/pages/ops/orders-report";
import OpsCloseoutLedgerReport from "@/pages/ops/closeout-ledger-report";
import OpsCloseoutGstReport from "@/pages/ops/closeout-gst-report";
import VerifyEmail from "@/pages/verify-email";
import ResetPassword from "@/pages/reset-password";
import ActivatePage from "@/pages/activate";
import QuickPricing from "@/pages/quick-pricing";
import WaitlistAnalytics from "@/pages/ops/waitlist-analytics";

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, isLoading, isAdmin } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-copper border-t-transparent rounded-full" />
      </div>
    );
  }
  
  if (!user) {
    return <Redirect to="/" />;
  }
  
  if (requireAdmin && !isAdmin) {
    return <Redirect to="/app" />;
  }
  
  return <>{children}</>;
}

function OpsRedirect() {
  const { user } = useAuth();
  
  if (user?.role === 'operator') {
    return <Redirect to="/operator" />;
  }
  return <OpsDashboard />;
}

function CustomerRedirect() {
  return <Redirect to="/app" />;
}

function Router() {
  return (
    <>
      <ScrollRestoration />
      <Switch>
      <Route path="/" component={Landing} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/activate" component={ActivatePage} />
      
      {/* Legacy customer route - redirect to new app */}
      <Route path="/customer">
        <ProtectedRoute>
          <Redirect to="/app" />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/book">
        <ProtectedRoute>
          <BookDelivery />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/vehicles">
        <Redirect to="/app/my-stuff" />
      </Route>
      <Route path="/customer/deliveries">
        <Redirect to="/app/history" />
      </Route>
      <Route path="/customer/profile">
        <Redirect to="/app/account?tab=profile" />
      </Route>
      <Route path="/customer/subscription">
        <Redirect to="/app/account?tab=subscription" />
      </Route>
      <Route path="/customer/notifications">
        <Redirect to="/app/account/notifications" />
      </Route>
      <Route path="/customer/recurring">
        <Redirect to="/app/account?tab=recurring" />
      </Route>
      <Route path="/customer/receipts/:orderId/print">
        <ProtectedRoute>
          <ReceiptPrint />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/receipts">
        <Redirect to="/app/history?tab=receipts" />
      </Route>
      <Route path="/customer/help">
        <Redirect to="/app/account?tab=support" />
      </Route>
      <Route path="/customer/payment-methods">
        <Redirect to="/app/account?tab=billing" />
      </Route>
      <Route path="/customer/emergency">
        <Redirect to="/app/account?tab=todo" />
      </Route>
      
      {/* New consolidated customer destination pages */}
      <Route path="/app">
        <ProtectedRoute>
          <AppHome />
        </ProtectedRoute>
      </Route>
      <Route path="/app/my-stuff">
        <ProtectedRoute>
          <AppMyStuff />
        </ProtectedRoute>
      </Route>
      <Route path="/app/history">
        <ProtectedRoute>
          <AppHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/app/account/notifications">
        <ProtectedRoute>
          <AppAccountNotifications />
        </ProtectedRoute>
      </Route>
      <Route path="/app/account">
        <ProtectedRoute>
          <AppAccount />
        </ProtectedRoute>
      </Route>
      <Route path="/app/support">
        <Redirect to="/app/account?tab=support" />
      </Route>
      
      {/* Operator consolidated destination pages */}
      <Route path="/operator">
        <ProtectedRoute requireAdmin>
          <OpsAppToday />
        </ProtectedRoute>
      </Route>
      <Route path="/operator/fuel">
        <ProtectedRoute requireAdmin>
          <OpsAppFuel />
        </ProtectedRoute>
      </Route>
      <Route path="/operator/fleet">
        <ProtectedRoute requireAdmin>
          <OpsAppFleet />
        </ProtectedRoute>
      </Route>
      <Route path="/operator/customers">
        <ProtectedRoute requireAdmin>
          <OpsAppCustomers />
        </ProtectedRoute>
      </Route>
      <Route path="/operator/settings">
        <ProtectedRoute requireAdmin>
          <OpsAppSettings />
        </ProtectedRoute>
      </Route>
      
      {/* Owner consolidated destination pages */}
      <Route path="/owner">
        <ProtectedRoute requireAdmin>
          <OwnerCommand />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/operations">
        <ProtectedRoute requireAdmin>
          <OwnerOperations />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/finance">
        <ProtectedRoute requireAdmin>
          <OwnerFinance />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/business">
        <ProtectedRoute requireAdmin>
          <OwnerBusiness />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/settings">
        <ProtectedRoute requireAdmin>
          <OwnerSettings />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/reports">
        <ProtectedRoute requireAdmin>
          <OwnerReports />
        </ProtectedRoute>
      </Route>
      
      {/* Quick pricing page for admin push notification */}
      <Route path="/quick-pricing">
        <ProtectedRoute requireAdmin>
          <QuickPricing />
        </ProtectedRoute>
      </Route>
      
      <Route path="/owner/waitlist-analytics">
        <ProtectedRoute requireAdmin>
          <WaitlistAnalytics />
        </ProtectedRoute>
      </Route>
      
      {/* Legacy ops route - redirect to new owner dashboard */}
      <Route path="/ops">
        <ProtectedRoute requireAdmin>
          <OpsRedirect />
        </ProtectedRoute>
      </Route>
      
      {/* Owner operations detail pages */}
      <Route path="/owner/operations/shipping-document/:truckId">
        <ProtectedRoute requireAdmin>
          <OpsShippingDocument />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/operations/pretrip-document/:truckId">
        <ProtectedRoute requireAdmin>
          <OpsPreTripDocument />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/operations/fuel-log/:truckId">
        <ProtectedRoute requireAdmin>
          <OpsFuelLog />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/operations/closeout-report/:id">
        <ProtectedRoute requireAdmin>
          <OpsCloseoutReport />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/operations/orders-report/:id">
        <ProtectedRoute requireAdmin>
          <OpsOrdersReport />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/operations/closeout-ledger-report/:id">
        <ProtectedRoute requireAdmin>
          <OpsCloseoutLedgerReport />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/operations/closeout-gst-report/:id">
        <ProtectedRoute requireAdmin>
          <OpsCloseoutGstReport />
        </ProtectedRoute>
      </Route>
      
      {/* Owner finance report pages */}
      <Route path="/owner/finance/ledger-report">
        <ProtectedRoute requireAdmin>
          <OpsLedgerReport />
        </ProtectedRoute>
      </Route>
      <Route path="/owner/finance/gst-report">
        <ProtectedRoute requireAdmin>
          <OpsGstReport />
        </ProtectedRoute>
      </Route>
      
      <Route component={NotFound} />
      </Switch>
    </>
  );
}

function AdminMaintenanceBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('admin-maintenance-banner-dismissed') === '1';
  });

  useEffect(() => {
    if (dismissed && typeof window !== 'undefined') {
      window.sessionStorage.setItem('admin-maintenance-banner-dismissed', '1');
    }
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 shadow-sm"
      data-testid="banner-admin-maintenance"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-3 text-sm">
        <svg
          className="w-4 h-4 flex-shrink-0 text-amber-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span className="flex-1">
          <strong className="font-semibold">Maintenance mode is ON</strong> — public visitors see the maintenance screen.{' '}
          <Link
            href="/owner/settings"
            className="underline font-medium hover:no-underline"
            data-testid="link-admin-maintenance-settings"
          >
            Toggle off in Owner Settings
          </Link>
          .
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 text-amber-800 hover:text-amber-950 transition-colors p-1 -mr-1"
          aria-label="Dismiss maintenance banner"
          data-testid="button-dismiss-admin-maintenance-banner"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { user, login, logout } = useAuth();
  const [location] = useLocation();
  const { toast } = useToast();
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin';
  const { data: appModeData } = useQuery<{ maintenanceMode?: boolean }>({
    queryKey: ['/api/public/app-mode'],
    queryFn: async () => {
      const res = await fetch('/api/public/app-mode');
      if (!res.ok) return { maintenanceMode: false };
      return res.json();
    },
  });

  // Allow only account-flow routes through during maintenance for unauthenticated users.
  // The home page ('/') is intentionally NOT exempt — it must show the maintenance screen too.
  const isAccountFlowRoute = location === '/verify-email' || location === '/activate';

  // Reset the admin banner dismissal whenever maintenance mode turns off, so the
  // banner reappears for the next maintenance window instead of staying suppressed.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (appModeData?.maintenanceMode === false) {
      window.sessionStorage.removeItem('admin-maintenance-banner-dismissed');
    }
  }, [appModeData?.maintenanceMode]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await login(adminEmail, adminPassword);
      if (result.success) {
        toast({ title: 'Welcome back!', description: 'Successfully logged in.' });
        setAdminEmail('');
        setAdminPassword('');
        setShowAdminLogin(false);
      } else if (result.needsVerification) {
        toast({
          title: 'Email verification required',
          description: result.message || 'Please verify your email to continue.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Login failed',
          description: result.message || 'Invalid email or password.',
          variant: 'destructive',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (appModeData?.maintenanceMode && isOwnerOrAdmin) {
    return (
      <>
        <AdminMaintenanceBanner />
        {children}
      </>
    );
  }

  if (appModeData?.maintenanceMode && !isOwnerOrAdmin) {
    if (isAccountFlowRoute && !user) {
      return <>{children}</>;
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md w-full space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">We'll Be Back Shortly</h1>
          <p className="text-muted-foreground">
            Prairie Mobile Fuel Services is currently undergoing scheduled maintenance.
            We'll be back up and running soon.
          </p>
          <p className="text-sm text-muted-foreground">
            Thank you for your patience.
          </p>
          {user && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Logged in as {user.email} — your account doesn't have maintenance access.
              </p>
              <button
                onClick={() => logout()}
                className="text-xs text-primary underline hover:no-underline"
                data-testid="button-maintenance-logout"
              >
                Log out
              </button>
            </div>
          )}
          {!user && !showAdminLogin && (
            <button
              onClick={() => setShowAdminLogin(true)}
              className="mt-8 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              data-testid="button-admin-access"
            >
              Admin Access
            </button>
          )}
          {!user && showAdminLogin && (
            <div className="mt-6 mx-auto max-w-sm rounded-lg border border-border bg-card p-5 text-left shadow-sm">
              <h2 className="text-sm font-semibold text-foreground mb-1">Admin Sign In</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Owners and admins can sign in to bypass maintenance mode.
              </p>
              <form onSubmit={handleAdminLogin} className="space-y-3">
                <div>
                  <label htmlFor="maintenance-admin-email" className="block text-xs font-medium text-foreground mb-1">
                    Email
                  </label>
                  <input
                    id="maintenance-admin-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    data-testid="input-maintenance-admin-email"
                  />
                </div>
                <div>
                  <label htmlFor="maintenance-admin-password" className="block text-xs font-medium text-foreground mb-1">
                    Password
                  </label>
                  <input
                    id="maintenance-admin-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    data-testid="input-maintenance-admin-password"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-copper text-white hover:bg-copper/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    data-testid="button-maintenance-admin-signin"
                  >
                    {submitting ? 'Signing in…' : 'Sign In'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminLogin(false);
                      setAdminEmail('');
                      setAdminPassword('');
                    }}
                    disabled={submitting}
                    className="px-3 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-60 transition-colors"
                    data-testid="button-maintenance-admin-cancel"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="pmfs-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WebSocketProvider>
            <TooltipProvider>
              <Toaster />
              <MaintenanceGate>
                <Router />
              </MaintenanceGate>
            </TooltipProvider>
          </WebSocketProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
