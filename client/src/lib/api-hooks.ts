import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Vehicle, Order } from '@shared/schema';

const ACTIVE_ORDER_STATUSES = ['scheduled', 'confirmed', 'en_route', 'arriving', 'fueling'];

function parseOrderDates(order: any): Order {
  return {
    ...order,
    scheduledDate: new Date(order.scheduledDate),
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
  };
}

// Vehicle hooks - using React Query for global cache management
export function useVehicles() {
  const queryClient = useQueryClient();
  
  const query = useQuery<Vehicle[], Error>({
    queryKey: ['/api/vehicles'],
    queryFn: async () => {
      const res = await fetch('/api/vehicles');
      if (!res.ok) throw new Error('Failed to fetch vehicles');
      const data = await res.json();
      return data.vehicles;
    },
    staleTime: 0,
  });

  const addVehicle = async (vehicle: Omit<Vehicle, 'id' | 'userId' | 'createdAt'>) => {
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicle),
      });

      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
        return { success: true };
      } else {
        return { success: false, error: 'Failed to add vehicle' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to add vehicle' };
    }
  };

  const updateVehicle = async (id: string, updates: Partial<Vehicle>) => {
    try {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
        return { success: true };
      } else {
        return { success: false, error: 'Failed to update vehicle' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to update vehicle' };
    }
  };

  const deleteVehicle = async (id: string) => {
    try {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
        return { success: true };
      } else {
        return { success: false, error: 'Failed to delete vehicle' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to delete vehicle' };
    }
  };

  return {
    vehicles: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    refetch: query.refetch,
  };
}

// Order hooks
export interface UseOrdersOptions {
  refetchInterval?: number | false | ((data: Order[] | undefined) => number | false);
}

export function useOrders(options: UseOrdersOptions = {}) {
  const { refetchInterval } = options;
  const queryClient = useQueryClient();

  const query = useQuery<Order[], Error>({
    queryKey: ['/api/orders'],
    queryFn: async () => {
      const res = await fetch('/api/orders');
      if (!res.ok) throw new Error('Failed to fetch orders');
      const data = await res.json();
      return data.orders.map(parseOrderDates);
    },
    refetchInterval: typeof refetchInterval === 'function' 
      ? (query) => refetchInterval(query.state.data)
      : refetchInterval,
    staleTime: 0,
  });

  const createOrder = async (order: Omit<Order, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });

      if (res.ok) {
        const data = await res.json();
        const newOrder = parseOrderDates(data.order);
        // Invalidate all order-related queries for instant updates across the app
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        queryClient.invalidateQueries({ queryKey: ['/api/orders/upcoming'] });
        queryClient.invalidateQueries({ queryKey: ['/api/ops/orders'] });
        return { success: true, order: newOrder };
      } else {
        return { success: false, error: 'Failed to create order' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to create order' };
    }
  };

  return {
    orders: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    createOrder,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

export { ACTIVE_ORDER_STATUSES };

export function useUpcomingOrders() {
  const query = useQuery<Order[], Error>({
    queryKey: ['/api/orders/upcoming'],
    queryFn: async () => {
      const res = await fetch('/api/orders/upcoming');
      if (!res.ok) throw new Error('Failed to fetch upcoming orders');
      const data = await res.json();
      return data.orders.map(parseOrderDates);
    },
    staleTime: 0,
  });

  return { 
    orders: query.data ?? [], 
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useOrder(orderId: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (res.ok) {
          const data = await res.json();
          setOrder({
            ...data.order,
            scheduledDate: new Date(data.order.scheduledDate),
            createdAt: new Date(data.order.createdAt),
            updatedAt: new Date(data.order.updatedAt),
          });
        }
      } catch (err) {
        console.error('Failed to fetch order:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  return { order, isLoading };
}

// Operations/Admin hooks
export function useAllOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/ops/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders.map((o: any) => ({
          ...o,
          scheduledDate: new Date(o.scheduledDate),
          createdAt: new Date(o.createdAt),
          updatedAt: new Date(o.updatedAt),
        })));
      }
    } catch (err) {
      console.error('Failed to fetch all orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        const data = await res.json();
        setOrders(orders.map(o => o.id === orderId ? {
          ...data.order,
          scheduledDate: new Date(data.order.scheduledDate),
          createdAt: new Date(data.order.createdAt),
          updatedAt: new Date(data.order.updatedAt),
        } : o));
        return { success: true };
      } else {
        return { success: false, error: 'Failed to update order status' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to update order status' };
    }
  };

  return { orders, isLoading, updateOrderStatus, refetch: fetchOrders };
}

// Fuel pricing hook
export interface FuelPricingData {
  fuelType: 'regular' | 'premium' | 'diesel';
  baseCost: string;
  markupPercent: string;
  markupFlat: string;
  customerPrice: string;
}

export function useFuelPricing() {
  const [pricing, setPricing] = useState<Record<string, FuelPricingData>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const res = await fetch('/api/fuel-pricing');
        if (res.ok) {
          const data = await res.json();
          const pricingMap: Record<string, FuelPricingData> = {};
          data.pricing.forEach((p: any) => {
            pricingMap[p.fuelType] = {
              fuelType: p.fuelType,
              baseCost: p.baseCost,
              markupPercent: p.markupPercent,
              markupFlat: p.markupFlat,
              customerPrice: p.customerPrice,
            };
          });
          setPricing(pricingMap);
        }
      } catch (err) {
        console.error('Failed to fetch fuel pricing:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPricing();
  }, []);

  const getFuelPrice = (fuelType: 'regular' | 'premium' | 'diesel'): number => {
    if (pricing[fuelType]) {
      return parseFloat(pricing[fuelType].customerPrice);
    }
    // Fallback prices
    const fallback = { regular: 1.4200, premium: 1.6400, diesel: 1.5850 };
    return fallback[fuelType];
  };

  return { pricing, isLoading, getFuelPrice };
}

// Route hooks for dispatch
export interface RouteWithDetails {
  route: {
    id: string;
    routeDate: string;
    routeNumber: number;
    driverName: string | null;
    driverId: string | null;
    status: string;
    orderCount: number;
    totalLitres: number;
    isOptimized: boolean;
    totalDistanceKm: string | null;
    avgStopDistanceKm: string | null;
    truckId: string | null;
    startTime: string | null;
    endTime: string | null;
  };
  orders: Array<{
    id: string;
    userId: string;
    vehicleId: string;
    address: string;
    city: string;
    scheduledDate: string;
    deliveryWindow: string;
    fuelType: string;
    fuelAmount: number;
    fillToFull: boolean;
    status: string;
    routePosition: number | null;
    estimatedArrival: string | null;
    latitude: string | null;
    longitude: string | null;
    pricePerLitre: string;
    tierDiscount: string;
    deliveryFee: string;
    total: string;
    user: { id: string; name: string; email: string; subscriptionTier: string } | null;
    vehicle: { id: string; year: string; make: string; model: string; color: string; licensePlate: string } | null;
  }>;
  driver: { id: string; name: string; email: string } | null;
}

export function useRoutes(date?: Date) {
  const [routes, setRoutes] = useState<RouteWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutes = async () => {
    try {
      setIsLoading(true);
      const url = date 
        ? `/api/ops/routes?date=${date.toISOString()}`
        : '/api/ops/routes';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setRoutes(data.routes || []);
        setError(null);
      } else {
        setError('Failed to fetch routes');
      }
    } catch (err) {
      setError('Failed to fetch routes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, [date?.toISOString()]);

  const optimizeRoute = async (routeId: string) => {
    try {
      const res = await fetch(`/api/ops/routes/${routeId}/optimize`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchRoutes();
        return { success: true };
      }
      return { success: false, error: 'Failed to optimize route' };
    } catch (err) {
      return { success: false, error: 'Failed to optimize route' };
    }
  };

  const updateRouteDriver = async (routeId: string, driverName: string) => {
    try {
      const res = await fetch(`/api/ops/routes/${routeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverName }),
      });
      if (res.ok) {
        await fetchRoutes();
        return { success: true };
      }
      return { success: false, error: 'Failed to update driver' };
    } catch (err) {
      return { success: false, error: 'Failed to update driver' };
    }
  };

  const reassignUnassigned = async () => {
    try {
      const res = await fetch('/api/ops/routes/reassign-unassigned', {
        method: 'POST',
      });
      if (res.ok) {
        await fetchRoutes();
        return { success: true };
      }
      return { success: false, error: 'Failed to reassign orders' };
    } catch (err) {
      return { success: false, error: 'Failed to reassign orders' };
    }
  };

  return {
    routes,
    isLoading,
    error,
    refetch: fetchRoutes,
    optimizeRoute,
    updateRouteDriver,
    reassignUnassigned,
  };
}
