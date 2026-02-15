import type { Notification } from '@shared/schema';

type UserRole = 'user' | 'operator' | 'admin' | 'owner';

interface ParsedMetadata {
  orderId?: string;
  action?: string;
  decision?: string;
  requestUserId?: string;
  status?: string;
  reason?: string;
  [key: string]: any;
}

function parseMetadata(metadata: string | null | undefined): ParsedMetadata {
  if (!metadata) return {};
  try {
    return typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
  } catch {
    return {};
  }
}

function isVerificationNotification(title: string, meta: ParsedMetadata): boolean {
  return (
    meta.action === 'verification_request' ||
    meta.action === 'verification_decision' ||
    meta.action === 'verification_reset' ||
    title.includes('verification approved') ||
    title.includes('verification denied') ||
    title.includes('verification reset') ||
    title.includes('verification request')
  );
}

export function getNotificationRoute(
  notification: Notification,
  role: UserRole
): string | null {
  const meta = parseMetadata(notification.metadata);
  const type = notification.type;
  const title = notification.title?.toLowerCase() || '';
  const category = notification.category || 'customer';

  if (role === 'user') {
    return getCustomerRoute(type, meta, title);
  }

  if (role === 'owner' || role === 'admin') {
    return getOwnerRoute(type, meta, title, category);
  }

  if (role === 'operator') {
    return getOperatorRoute(type, meta, title, category);
  }

  return null;
}

function getCustomerRoute(type: string, meta: ParsedMetadata, title: string): string | null {
  if (isVerificationNotification(title, meta)) {
    return '/customer/subscription';
  }

  if (type === 'order_update' || type === 'delivery') {
    return '/customer/deliveries';
  }

  if (type === 'payment' || type === 'payment_failed') {
    return '/customer/payment-methods';
  }

  if (type === 'subscription') {
    return '/customer/subscription';
  }

  return '/customer/deliveries';
}

function getOwnerRoute(type: string, meta: ParsedMetadata, title: string, category: string): string | null {
  if (isVerificationNotification(title, meta)) {
    return '/owner/operations?tab=verifications';
  }

  if (type === 'delivery' || type === 'delivery_completed') {
    return '/owner/operations?tab=dispatch';
  }

  if (type === 'order_update') {
    return '/owner/operations?tab=orders';
  }

  if (category === 'operations') {
    if (type === 'route_assigned' || type === 'route_completed' || type === 'dispatch') {
      return '/owner/operations?tab=dispatch';
    }
    if (type === 'fuel_inventory') {
      return '/owner/operations?tab=fuel';
    }
    if (type === 'fleet' || type === 'inspection') {
      return '/owner/operations?tab=fleet';
    }
    return '/owner/operations';
  }

  if (category === 'owner') {
    if (type === 'payment_failed' || type === 'revenue' || type === 'reconciliation') {
      return '/owner/finance';
    }
    if (type === 'weekly_close') {
      return '/owner/finance';
    }
    if (type === 'gst_filing' || type === 'tax') {
      return '/owner/finance';
    }
    if (type === 'subscription_cancelled') {
      return '/owner/business';
    }
    return '/owner';
  }

  if (category === 'customer') {
    if (type === 'order_update' || type === 'delivery') {
      return '/owner/operations?tab=orders';
    }
    return '/owner/operations?tab=customers';
  }

  if (category === 'driver') {
    return '/owner/operations?tab=dispatch';
  }

  return '/owner';
}

function getOperatorRoute(type: string, meta: ParsedMetadata, title: string, category: string): string | null {
  if (type === 'order_update' || type === 'delivery' || type === 'delivery_assigned' || type === 'delivery_started' || type === 'delivery_completed') {
    return '/operator';
  }

  if (type === 'route_assigned' || type === 'route_completed' || type === 'dispatch') {
    return '/operator';
  }

  if (type === 'fleet' || type === 'inspection' || type === 'truck_assigned') {
    return '/operator/fleet';
  }

  if (type === 'fuel_inventory') {
    return '/operator/fuel';
  }

  return '/operator';
}
