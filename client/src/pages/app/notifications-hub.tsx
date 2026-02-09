import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/lib/auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Notification } from '@shared/schema';
import {
  Bell, BellRing, BellOff, Check, Package, CreditCard, Settings,
  AlertCircle, Truck, Shield, BarChart3, Users, Loader2, Megaphone
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { usePushNotifications } from '@/hooks/use-push-notifications';

const CATEGORY_CONFIG = {
  owner: { label: 'Owner', icon: Shield, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
  operations: { label: 'Operations', icon: BarChart3, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
  driver: { label: 'Driver', icon: Truck, color: 'text-green-600 bg-green-50 dark:bg-green-950/30' },
  customer: { label: 'Customer', icon: Users, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30' },
} as const;

function getNotificationIcon(type: string) {
  switch (type) {
    case 'order_update': return Package;
    case 'payment': return CreditCard;
    case 'subscription': return Settings;
    case 'system': return AlertCircle;
    default:
      if (type.startsWith('delivery')) return Truck;
      return Bell;
  }
}

function getNotificationColor(type: string) {
  switch (type) {
    case 'order_update': return 'bg-copper/10 text-copper';
    case 'payment': return 'bg-brass/10 text-brass';
    case 'subscription': return 'bg-sage/10 text-sage';
    case 'system': return 'bg-destructive/10 text-destructive';
    default:
      if (type.startsWith('delivery')) return 'bg-copper/10 text-copper';
      return 'bg-muted text-muted-foreground';
  }
}

function NotificationList({
  notifications,
  isLoading,
  onMarkRead,
  onMarkAllRead,
}: {
  notifications: Notification[];
  isLoading: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const unreadCount = notifications.filter(n => !n.read).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Bell className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">No notifications in this category</p>
      </div>
    );
  }

  return (
    <div>
      {unreadCount > 0 && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{unreadCount} unread</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllRead}
            className="text-xs h-7"
            data-testid="button-mark-all-read"
          >
            <Check className="w-3 h-3 mr-1" />
            Mark all read
          </Button>
        </div>
      )}
      <div className="space-y-1">
        {notifications.map((notification) => {
          const Icon = getNotificationIcon(notification.type);
          return (
            <button
              key={notification.id}
              onClick={() => !notification.read && onMarkRead(notification.id)}
              className={cn(
                "w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors",
                !notification.read && "bg-muted/30"
              )}
              data-testid={`notification-item-${notification.id}`}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  getNotificationColor(notification.type)
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-foreground">
                      {notification.title}
                    </p>
                    {!notification.read && (
                      <span className="w-2 h-2 rounded-full bg-copper flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PushNotificationsSettings() {
  const {
    isSupported,
    permission,
    isSubscribed,
    preferences,
    subscribe,
    unsubscribe,
    updatePreferences,
    isSubscribing,
    isUnsubscribing,
    isUpdatingPreferences,
  } = usePushNotifications();

  const handleTogglePush = async () => {
    try {
      if (isSubscribed) {
        await unsubscribe();
      } else {
        await subscribe();
      }
    } catch (err) {
      console.error('Failed to toggle push notifications:', err);
    }
  };

  const handlePreferenceChange = async (key: keyof typeof preferences, value: boolean) => {
    try {
      await updatePreferences({ [key]: value });
    } catch (err) {
      console.error('Failed to update preference:', err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="w-5 h-5 text-copper" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          Receive real-time updates on your device even when the app is closed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isSupported ? (
          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
            <BellOff className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Not Supported</p>
              <p className="text-sm text-muted-foreground">
                Push notifications are not supported in this browser
              </p>
            </div>
          </div>
        ) : permission === 'denied' ? (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-lg">
            <BellOff className="w-5 h-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Notifications Blocked</p>
              <p className="text-sm text-muted-foreground">
                Please enable notifications in your browser settings
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isSubscribed ? (
                <BellRing className="w-5 h-5 text-copper" />
              ) : (
                <BellOff className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">
                  {isSubscribed ? 'Push Notifications Enabled' : 'Enable Push Notifications'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isSubscribed
                    ? 'You will receive notifications on this device'
                    : 'Get instant updates about your deliveries'}
                </p>
              </div>
            </div>
            <Button
              variant={isSubscribed ? "outline" : "default"}
              onClick={handleTogglePush}
              disabled={isSubscribing || isUnsubscribing}
              data-testid="button-toggle-push"
            >
              {(isSubscribing || isUnsubscribing) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {isSubscribed ? 'Disable' : 'Enable'}
            </Button>
          </div>
        )}

        {isSubscribed && (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-4">Notification Types</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package className="w-4 h-4 text-copper" />
                  <Label htmlFor="pref-orders" className="cursor-pointer">
                    Order Updates
                    <p className="text-xs text-muted-foreground font-normal">
                      Status changes, delivery progress
                    </p>
                  </Label>
                </div>
                <Switch
                  id="pref-orders"
                  checked={preferences.orderUpdates}
                  onCheckedChange={(checked) => handlePreferenceChange('orderUpdates', checked)}
                  disabled={isUpdatingPreferences}
                  data-testid="switch-order-updates"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Truck className="w-4 h-4 text-sage" />
                  <Label htmlFor="pref-delivery" className="cursor-pointer">
                    Delivery Reminders
                    <p className="text-xs text-muted-foreground font-normal">
                      Upcoming delivery notifications
                    </p>
                  </Label>
                </div>
                <Switch
                  id="pref-delivery"
                  checked={preferences.deliveryReminders}
                  onCheckedChange={(checked) => handlePreferenceChange('deliveryReminders', checked)}
                  disabled={isUpdatingPreferences}
                  data-testid="switch-delivery-reminders"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-brass" />
                  <Label htmlFor="pref-payment" className="cursor-pointer">
                    Payment Alerts
                    <p className="text-xs text-muted-foreground font-normal">
                      Payment confirmations and issues
                    </p>
                  </Label>
                </div>
                <Switch
                  id="pref-payment"
                  checked={preferences.paymentAlerts}
                  onCheckedChange={(checked) => handlePreferenceChange('paymentAlerts', checked)}
                  disabled={isUpdatingPreferences}
                  data-testid="switch-payment-alerts"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Megaphone className="w-4 h-4 text-gold" />
                  <Label htmlFor="pref-promo" className="cursor-pointer">
                    Promotions & Offers
                    <p className="text-xs text-muted-foreground font-normal">
                      Special deals and announcements
                    </p>
                  </Label>
                </div>
                <Switch
                  id="pref-promo"
                  checked={preferences.promotionalOffers}
                  onCheckedChange={(checked) => handlePreferenceChange('promotionalOffers', checked)}
                  disabled={isUpdatingPreferences}
                  data-testid="switch-promotional-offers"
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface NotificationsHubProps {
  embedded?: boolean;
  forceCategories?: string[];
  showSettingsTab?: boolean;
}

export default function NotificationsHub({ embedded, forceCategories, showSettingsTab }: NotificationsHubProps) {
  const { user, isOwner, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isOwnerOrAdmin = isOwner || isAdmin;
  const isOperator = user?.role === 'operator';

  const defaultTabs = isOwnerOrAdmin
    ? ['owner', 'operations', 'driver', 'customer'] as const
    : isOperator
      ? ['operations', 'driver'] as const
      : ['customer'] as const;

  const availableTabs = forceCategories || defaultTabs;
  const defaultTab = availableTabs[0];
  const [activeTab, setActiveTab] = useState(defaultTab);

  const { data: allData, isLoading: allLoading } = useQuery<{ grouped: Record<string, Notification[]>; total: number }>({
    queryKey: ['/api/notifications/all-categories'],
    enabled: isOwnerOrAdmin,
  });

  const opsNotifications = useQuery<{ notifications: Notification[] }>({
    queryKey: ['/api/notifications', { category: 'operations' }],
    queryFn: () => fetch('/api/notifications?category=operations', { credentials: 'include' }).then(r => r.json()),
    enabled: isOperator,
  });

  const driverNotifications = useQuery<{ notifications: Notification[] }>({
    queryKey: ['/api/notifications', { category: 'driver' }],
    queryFn: () => fetch('/api/notifications?category=driver', { credentials: 'include' }).then(r => r.json()),
    enabled: isOperator,
  });

  const customerNotifications = useQuery<{ notifications: Notification[] }>({
    queryKey: ['/api/notifications', { category: 'customer' }],
    queryFn: () => fetch('/api/notifications?category=customer', { credentials: 'include' }).then(r => r.json()),
    enabled: !isOwnerOrAdmin && !isOperator,
  });

  const getNotificationsForTab = (tab: string): Notification[] => {
    if (isOwnerOrAdmin && allData?.grouped) {
      return (allData.grouped[tab] || []).map(n => ({ ...n, createdAt: new Date(n.createdAt) }));
    }
    if (isOperator) {
      const data = tab === 'operations' ? opsNotifications.data : driverNotifications.data;
      return (data?.notifications || []).map(n => ({ ...n, createdAt: new Date(n.createdAt) }));
    }
    return (customerNotifications.data?.notifications || []).map(n => ({ ...n, createdAt: new Date(n.createdAt) }));
  };

  const getUnreadForTab = (tab: string): number => {
    return getNotificationsForTab(tab).filter(n => !n.read).length;
  };

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/all-categories'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/all-categories'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const isLoading = isOwnerOrAdmin ? allLoading : isOperator ? (opsNotifications.isLoading || driverNotifications.isLoading) : customerNotifications.isLoading;

  const content = (
    <div>
      {!embedded && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Bell className="w-6 h-6 text-copper" />
            <h1 className="text-2xl font-display font-bold text-foreground">
              Notifications
            </h1>
          </div>
          <p className="text-muted-foreground mt-1">
            {isOwnerOrAdmin
              ? 'All notifications across your business, organized by area'
              : 'Your recent notifications and updates'}
          </p>
        </div>
      )}

      {availableTabs.length > 1 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            {availableTabs.map(tab => {
              const config = CATEGORY_CONFIG[tab as keyof typeof CATEGORY_CONFIG];
              const TabIcon = config.icon;
              const unread = getUnreadForTab(tab);
              return (
                <TabsTrigger key={tab} value={tab} className="gap-2" data-testid={`tab-notifications-${tab}`}>
                  <TabIcon className="w-4 h-4" />
                  <span>{config.label}</span>
                  {unread > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-copper/10 text-copper">
                      {unread}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
            {showSettingsTab && (
              <TabsTrigger value="settings" className="gap-2" data-testid="tab-notifications-settings">
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </TabsTrigger>
            )}
          </TabsList>

          {availableTabs.map(tab => (
            <TabsContent key={tab} value={tab} className="mt-4">
              <NotificationList
                notifications={getNotificationsForTab(tab)}
                isLoading={isLoading}
                onMarkRead={markAsRead}
                onMarkAllRead={markAllAsRead}
              />
            </TabsContent>
          ))}
          {showSettingsTab && (
            <TabsContent value="settings" className="mt-4">
              <PushNotificationsSettings />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <NotificationList
          notifications={getNotificationsForTab(availableTabs[0])}
          isLoading={isLoading}
          onMarkRead={markAsRead}
          onMarkAllRead={markAllAsRead}
        />
      )}
    </div>
  );

  return content;
}
