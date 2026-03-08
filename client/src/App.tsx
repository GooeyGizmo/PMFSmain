import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
      
      <Route path="/ops/waitlist-analytics">
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

function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin';
  const { data: appModeData } = useQuery({
    queryKey: ['/api/public/app-mode'],
    queryFn: async () => {
      const res = await fetch('/api/public/app-mode');
      if (!res.ok) return { maintenanceMode: false };
      return res.json();
    },
  });

  const isAuthRoute = location === '/' || location === '/verify-email' || location === '/activate';

  if (appModeData?.maintenanceMode && !isOwnerOrAdmin) {
    if (isAuthRoute && !user) {
      return <>{children}</>;
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md space-y-4">
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
          {!user && (
            <button
              onClick={() => setLocation('/')}
              className="mt-8 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              data-testid="button-admin-login"
            >
              Admin Access
            </button>
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
