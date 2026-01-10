import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { WebSocketProvider } from "@/components/websocket-provider";
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
import Referrals from "@/pages/customer/referrals";
import Receipts from "@/pages/customer/receipts";
import Help from "@/pages/customer/help";
import PaymentMethods from "@/pages/customer/payment-methods";
import OpsDashboard from "@/pages/ops/dashboard";
import OpsPricing from "@/pages/ops/pricing";
import OpsOrders from "@/pages/ops/orders";
import OpsCustomers from "@/pages/ops/customers";
import OpsCalculators from "@/pages/ops/calculators";
import OpsDispatch from "@/pages/ops/dispatch";
import OpsInventory from "@/pages/ops/inventory";
import OpsAnalytics from "@/pages/ops/analytics";

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
    <Switch>
      <Route path="/" component={Landing} />
      
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
      <Route path="/customer/referrals">
        <ProtectedRoute>
          <Referrals />
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
      <Route path="/ops/calculators">
        <ProtectedRoute requireAdmin>
          <OpsCalculators />
        </ProtectedRoute>
      </Route>
      <Route path="/ops/dispatch">
        <ProtectedRoute requireAdmin>
          <OpsDispatch />
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
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
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
  );
}

export default App;
