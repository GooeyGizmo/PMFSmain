import type { UserRole } from './auth';

export const CAPABILITIES = {
  canDeliverOrders: 'canDeliverOrders',
  canDispatchRoutes: 'canDispatchRoutes',
  canManageFleet: 'canManageFleet',
  canManagePricing: 'canManagePricing',
  canViewFinance: 'canViewFinance',
  canRunCloseout: 'canRunCloseout',
  canViewReports: 'canViewReports',
  canRefundPayments: 'canRefundPayments',
  canManageCustomers: 'canManageCustomers',
  canSendNotifications: 'canSendNotifications',
  canManageDrivers: 'canManageDrivers',
  canManagePromoCodes: 'canManagePromoCodes',
  canManageSubscriptions: 'canManageSubscriptions',
  canViewAnalytics: 'canViewAnalytics',
  canManageEmergency: 'canManageEmergency',
  canManageInventory: 'canManageInventory',
  canAccessSettings: 'canAccessSettings',
} as const;

export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES];

const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  user: [],
  
  operator: [
    CAPABILITIES.canDeliverOrders,
    CAPABILITIES.canManageFleet,
    CAPABILITIES.canSendNotifications,
  ],
  
  admin: [
    CAPABILITIES.canDeliverOrders,
    CAPABILITIES.canDispatchRoutes,
    CAPABILITIES.canManageFleet,
    CAPABILITIES.canManagePricing,
    CAPABILITIES.canManageCustomers,
    CAPABILITIES.canSendNotifications,
    CAPABILITIES.canManageDrivers,
    CAPABILITIES.canManagePromoCodes,
    CAPABILITIES.canViewAnalytics,
    CAPABILITIES.canManageEmergency,
    CAPABILITIES.canManageInventory,
  ],
  
  owner: [
    CAPABILITIES.canDeliverOrders,
    CAPABILITIES.canDispatchRoutes,
    CAPABILITIES.canManageFleet,
    CAPABILITIES.canManagePricing,
    CAPABILITIES.canViewFinance,
    CAPABILITIES.canRunCloseout,
    CAPABILITIES.canViewReports,
    CAPABILITIES.canRefundPayments,
    CAPABILITIES.canManageCustomers,
    CAPABILITIES.canSendNotifications,
    CAPABILITIES.canManageDrivers,
    CAPABILITIES.canManagePromoCodes,
    CAPABILITIES.canManageSubscriptions,
    CAPABILITIES.canViewAnalytics,
    CAPABILITIES.canManageEmergency,
    CAPABILITIES.canManageInventory,
    CAPABILITIES.canAccessSettings,
  ],
};

export function hasCapability(role: UserRole | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function hasAnyCapability(role: UserRole | undefined, capabilities: Capability[]): boolean {
  if (!role) return false;
  return capabilities.some(cap => hasCapability(role, cap));
}

export function hasAllCapabilities(role: UserRole | undefined, capabilities: Capability[]): boolean {
  if (!role) return false;
  return capabilities.every(cap => hasCapability(role, cap));
}

export function getCapabilities(role: UserRole | undefined): Capability[] {
  if (!role) return [];
  return ROLE_CAPABILITIES[role] ?? [];
}

export type ShellType = 'customer' | 'operator' | 'owner';

export function getDefaultShell(role: UserRole | undefined): ShellType {
  if (!role || role === 'user') return 'customer';
  if (role === 'operator') return 'operator';
  return 'owner';
}

export function getAvailableShells(role: UserRole | undefined): ShellType[] {
  if (!role || role === 'user') return ['customer'];
  if (role === 'operator') return ['operator'];
  if (role === 'admin') return ['owner'];
  return ['owner', 'operator'];
}

export function canSwitchShell(role: UserRole | undefined): boolean {
  return role === 'owner';
}
