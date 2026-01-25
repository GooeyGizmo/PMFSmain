import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { WebSocketProvider } from "@/components/websocket-provider";
import { ScrollRestoration } from "@/lib/useScrollRestoration";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import CustomerHome from "@/pages/customer/home";
import BookDelivery from "@/pages/customer/book";
import Vehicles from "@/pages/customer/vehicles";
import Deliveries from "@/pages/customer/deliveries";
import Profile from "@/pages/customer/profile";
import Subscription from "@/pages/customer/subscription";
import Notifications from "@/pages/customer/notifications";
import Recurring from "@/pages/customer/recurring";
import Receipts from "@/pages/customer/receipts";
import Help from "@/pages/customer/help";
import PaymentMethods from "@/pages/customer/payment-methods";
import OpsDashboard from "@/pages/ops/dashboard";
import OpsPricing from "@/pages/ops/pricing";
import OpsOrders from "@/pages/ops/orders";
import OpsCustomers from "@/pages/ops/customers";
import LegacyCalculators from "@/pages/ops/financials/calculators/legacy";
import FuelMarkupCalculator from "@/pages/ops/financials/calculators/fuel-markup";
import ProfitabilityCalculator from "@/pages/ops/financials/calculators/profitability";
import FreedomRunwayCalculator from "@/pages/ops/financials/calculators/freedom-runway";
import OperatingCostsCalculator from "@/pages/ops/financials/calculators/operating-costs";
import TierEconomicsCalculator from "@/pages/ops/financials/calculators/tier-economics";
import NetMarginCalculator from "@/pages/ops/financials/calculators/net-margin";
import OpsDispatch from "@/pages/ops/dispatch";
import OpsFleet from "@/pages/ops/fleet";
import OpsShippingDocument from "@/pages/ops/shipping-document";
import OpsPreTripDocument from "@/pages/ops/pretrip-document";
import OpsFuelLog from "@/pages/ops/fuel-log";
import OpsInventory from "@/pages/ops/inventory";
import OpsAnalytics from "@/pages/ops/analytics";
import OpsEmergency from "@/pages/ops/emergency";
import OpsDriverManagement from "@/pages/ops/driver-management";
import OpsDeliveryConsole from "@/pages/ops/delivery-console";
import FinancialCommandCenter from "@/pages/ops/financials";
import OpsPromoCodes from "@/pages/ops/promo-codes";
import OpsNotifications from "@/pages/ops/notifications";
import OpsCloseout from "@/pages/ops/closeout";
import VerifyEmail from "@/pages/verify-email";

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
    return <Redirect to="/customer" />;
  }
  
  return <>{children}</>;
}

function Router() {
  return (
    <>
      <ScrollRestoration />
      <Switch>
      <Route path="/" component={Landing} />
      <Route path="/verify-email" component={VerifyEmail} />
      
      <Route path="/customer">
        <ProtectedRoute>
          <CustomerHome />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/book">
        <ProtectedRoute>
          <BookDelivery />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/vehicles">
        <ProtectedRoute>
          <Vehicles />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/deliveries">
        <ProtectedRoute>
          <Deliveries />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/profile">
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/subscription">
        <ProtectedRoute>
          <Subscription />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/notifications">
        <ProtectedRoute>
          <Notifications />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/recurring">
        <ProtectedRoute>
          <Recurring />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/receipts">
        <ProtectedRoute>
          <Receipts />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/help">
        <ProtectedRoute>
          <Help />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/payment-methods">
        <ProtectedRoute>
          <PaymentMethods />
        </ProtectedRoute>
      </Route>
      <Route path="/ops">
        <ProtectedRoute requireAdmin>
          <OpsDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/pricing">
        <ProtectedRoute requireAdmin>
          <OpsPricing />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/orders">
        <ProtectedRoute requireAdmin>
          <OpsOrders />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/customers">
        <ProtectedRoute requireAdmin>
          <OpsCustomers />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/financials/calculators/legacy">
        <ProtectedRoute requireAdmin>
          <LegacyCalculators />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/financials/calculators/fuel-markup">
        <ProtectedRoute requireAdmin>
          <FuelMarkupCalculator />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/financials/calculators/profitability">
        <ProtectedRoute requireAdmin>
          <ProfitabilityCalculator />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/financials/calculators/freedom-runway">
        <ProtectedRoute requireAdmin>
          <FreedomRunwayCalculator />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/financials/calculators/operating-costs">
        <ProtectedRoute requireAdmin>
          <OperatingCostsCalculator />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/financials/calculators/tier-economics">
        <ProtectedRoute requireAdmin>
          <TierEconomicsCalculator />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/financials/calculators/net-margin">
        <ProtectedRoute requireAdmin>
          <NetMarginCalculator />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/dispatch">
        <ProtectedRoute requireAdmin>
          <OpsDispatch />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/delivery-console">
        <ProtectedRoute requireAdmin>
          <OpsDeliveryConsole />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/fleet">
        <ProtectedRoute requireAdmin>
          <OpsFleet />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/shipping-document/:truckId">
        <ProtectedRoute requireAdmin>
          <OpsShippingDocument />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/pretrip-document/:truckId">
        <ProtectedRoute requireAdmin>
          <OpsPreTripDocument />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/fuel-log/:truckId">
        <ProtectedRoute requireAdmin>
          <OpsFuelLog />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/inventory">
        <ProtectedRoute requireAdmin>
          <OpsInventory />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/analytics">
        <ProtectedRoute requireAdmin>
          <OpsAnalytics />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/emergency">
        <ProtectedRoute requireAdmin>
          <OpsEmergency />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/drivers">
        <ProtectedRoute requireAdmin>
          <OpsDriverManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/financials">
        <ProtectedRoute requireAdmin>
          <FinancialCommandCenter />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/promo-codes">
        <ProtectedRoute requireAdmin>
          <OpsPromoCodes />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/notifications">
        <ProtectedRoute requireAdmin>
          <OpsNotifications />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/closeout">
        <ProtectedRoute requireAdmin>
          <OpsCloseout />
        </ProtectedRoute>
      </Route>
      
      <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="pmfs-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WebSocketProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </WebSocketProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
