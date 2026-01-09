import { useState, useEffect } from 'react';
import type { Vehicle, Order } from '@shared/schema';

// Vehicle hooks
export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicles = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/vehicles');
      if (res.ok) {
        const data = await res.json();
        setVehicles(data.vehicles);
        setError(null);
      } else {
        setError('Failed to fetch vehicles');
      }
    } catch (err) {
      setError('Failed to fetch vehicles');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const addVehicle = async (vehicle: Omit<Vehicle, 'id' | 'userId' | 'createdAt'>) => {
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicle),
      });

      if (res.ok) {
        const data = await res.json();
        setVehicles([...vehicles, data.vehicle]);
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
        const data = await res.json();
        setVehicles(vehicles.map(v => v.id === id ? data.vehicle : v));
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
        setVehicles(vehicles.filter(v => v.id !== id));
        return { success: true };
      } else {
        return { success: false, error: 'Failed to delete vehicle' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to delete vehicle' };
    }
  };

  return {
    vehicles,
    isLoading,
    error,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    refetch: fetchVehicles,
  };
}

// Order hooks
export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders.map((o: any) => ({
          ...o,
          scheduledDate: new Date(o.scheduledDate),
          createdAt: new Date(o.createdAt),
          updatedAt: new Date(o.updatedAt),
        })));
        setError(null);
      } else {
        setError('Failed to fetch orders');
      }
    } catch (err) {
      setError('Failed to fetch orders');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const createOrder = async (order: Omit<Order, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });

      if (res.ok) {
        const data = await res.json();
        const newOrder = {
          ...data.order,
          scheduledDate: new Date(data.order.scheduledDate),
          createdAt: new Date(data.order.createdAt),
          updatedAt: new Date(data.order.updatedAt),
        };
        setOrders([newOrder, ...orders]);
        return { success: true, order: newOrder };
      } else {
        return { success: false, error: 'Failed to create order' };
      }
    } catch (err) {
      return { success: false, error: 'Failed to create order' };
    }
  };

  return {
    orders,
    isLoading,
    error,
    createOrder,
    refetch: fetchOrders,
  };
}

export function useUpcomingOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await fetch('/api/orders/upcoming');
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
        console.error('Failed to fetch upcoming orders:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, []);

  return { orders, isLoading };
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
    const fallback = { regular: 1.429, premium: 1.629, diesel: 1.549 };
    return fallback[fuelType];
  };

  return { pricing, isLoading, getFuelPrice };
}
