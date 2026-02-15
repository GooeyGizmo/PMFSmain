import { useState, useEffect } from 'react';
import { useHorizontalScroll } from "@/hooks/use-horizontal-scroll";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Package, CreditCard, AlertCircle, Settings, Check, Circle, BellRing, BellOff, Megaphone, Truck, Loader2, Mail, Smartphone, MessageSquare, CheckCircle, Navigation, Timer, Fuel, AlertTriangle, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { getNotificationRoute } from '@/lib/notification-routes';
import type { Notification } from '@shared/schema';

type StatusPreferenceKey = 
  | 'emailConfirmed' | 'emailEnRoute' | 'emailArriving' | 'emailFueling' | 'emailCompleted'
  | 'smsConfirmed' | 'smsEnRoute' | 'smsArriving' | 'smsFueling' | 'smsCompleted'
  | 'pushConfirmed' | 'pushEnRoute' | 'pushArriving' | 'pushFueling' | 'pushCompleted'
  | 'inAppConfirmed' | 'inAppEnRoute' | 'inAppArriving' | 'inAppFueling' | 'inAppCompleted';

interface StatusNotificationPreferences {
  emailConfirmed: boolean;
  emailEnRoute: boolean;
  emailArriving: boolean;
  emailFueling: boolean;
  emailCompleted: boolean;
  smsConfirmed: boolean;
  smsEnRoute: boolean;
  smsArriving: boolean;
  smsFueling: boolean;
  smsCompleted: boolean;
  pushConfirmed: boolean;
  pushEnRoute: boolean;
  pushArriving: boolean;
  pushFueling: boolean;
  pushCompleted: boolean;
  inAppConfirmed: boolean;
  inAppEnRoute: boolean;
  inAppArriving: boolean;
  inAppFueling: boolean;
  inAppCompleted: boolean;
}

const ORDER_STAGES = [
  { id: 'Confirmed', label: 'Order Confirmed', icon: CheckCircle, color: 'text-sage' },
  { id: 'EnRoute', label: 'On the Way', icon: Navigation, color: 'text-copper' },
  { id: 'Arriving', label: 'Arriving Soon', icon: Timer, color: 'text-brass' },
  { id: 'Fueling', label: 'Fueling', icon: Fuel, color: 'text-gold' },
  { id: 'Completed', label: 'Completed', icon: Check, color: 'text-sage' },
] as const;

const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail, description: 'Receive emails' },
  { id: 'sms', label: 'SMS', icon: MessageSquare, description: 'Text messages' },
  { id: 'push', label: 'Push', icon: Smartphone, description: 'Device notifications' },
  { id: 'inApp', label: 'In-App', icon: Bell, description: 'Show in app' },
] as const;

export default function Notifications() {
  const scrollRef = useHorizontalScroll();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
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

  const { data: statusPrefsData, isLoading: statusPrefsLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const res = await fetch('/api/notification-preferences');
      if (!res.ok) throw new Error('Failed to fetch preferences');
      return res.json();
    },
  });

  const { data: smsStatusData } = useQuery({
    queryKey: ['sms-status'],
    queryFn: async () => {
      const res = await fetch('/api/notification-preferences/sms-status');
      if (!res.ok) return { available: false };
      return res.json();
    },
  });

  const statusPrefs: StatusNotificationPreferences = statusPrefsData?.preferences ?? {
    emailConfirmed: true, emailEnRoute: true, emailArriving: true, emailFueling: false, emailCompleted: true,
    smsConfirmed: false, smsEnRoute: true, smsArriving: true, smsFueling: true, smsCompleted: false,
    pushConfirmed: true, pushEnRoute: true, pushArriving: true, pushFueling: true, pushCompleted: true,
    inAppConfirmed: true, inAppEnRoute: true, inAppArriving: true, inAppFueling: true, inAppCompleted: true,
  };

  const smsAvailable = smsStatusData?.available ?? false;

  const updateStatusPrefsMutation = useMutation({
    mutationFn: async (updates: Partial<StatusNotificationPreferences>) => {
      const res = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update preferences');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });

  const handleStatusPrefChange = (key: StatusPreferenceKey, value: boolean) => {
    updateStatusPrefsMutation.mutate({ [key]: value });
  };

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications.map((n: any) => ({
            ...n,
            createdAt: new Date(n.createdAt),
          })));
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchNotifications();
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order_update':
        return Package;
      case 'payment':
        return CreditCard;
      case 'subscription':
        return Settings;
      case 'system':
        return AlertCircle;
      default:
        if (type.startsWith('delivery_')) return Package;
        return Bell;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'order_update':
        return 'bg-copper/10 text-copper';
      case 'payment':
        return 'bg-brass/10 text-brass';
      case 'subscription':
        return 'bg-sage/10 text-sage';
      case 'system':
        return 'bg-destructive/10 text-destructive';
      default:
        if (type.startsWith('delivery_')) return 'bg-copper/10 text-copper';
        return 'bg-muted text-muted-foreground';
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    const route = getNotificationRoute(notification, 'user');
    if (route) {
      navigate(route);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

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
      <div className="space-y-6">
        <Tabs defaultValue="inbox" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="inbox" data-testid="tab-inbox">
              <Bell className="w-4 h-4 mr-2" />
              Inbox {unreadCount > 0 && `(${unreadCount})`}
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4">
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
                  <>
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
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-copper" />
                  Delivery Status Updates
                </CardTitle>
                <CardDescription>
                  Choose how you want to be notified at each stage of your fuel delivery
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {statusPrefsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {!smsAvailable && (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>SMS notifications are not yet configured. Contact support to enable text message alerts.</span>
                      </div>
                    )}

                    <div ref={scrollRef} tabIndex={0} className="overflow-x-auto scrollbar-none outline-none focus:ring-1 focus:ring-ring/30 focus:rounded" style={{ scrollbarWidth: "none" }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 pr-4 font-medium text-muted-foreground">Delivery Stage</th>
                            {CHANNELS.map((channel) => (
                              <th key={channel.id} className="text-center px-2 py-3 font-medium">
                                <div className="flex flex-col items-center gap-1">
                                  <channel.icon className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{channel.label}</span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ORDER_STAGES.map((stage) => (
                            <tr key={stage.id} className="border-b last:border-0">
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <stage.icon className={`w-4 h-4 ${stage.color}`} />
                                  <span className="font-medium">{stage.label}</span>
                                </div>
                              </td>
                              {CHANNELS.map((channel) => {
                                const prefKey = `${channel.id}${stage.id}` as StatusPreferenceKey;
                                const isDisabled = channel.id === 'sms' && !smsAvailable;
                                return (
                                  <td key={channel.id} className="text-center px-2 py-3">
                                    <Switch
                                      checked={statusPrefs[prefKey]}
                                      onCheckedChange={(checked) => handleStatusPrefChange(prefKey, checked)}
                                      disabled={updateStatusPrefsMutation.isPending || isDisabled}
                                      data-testid={`switch-${channel.id}-${stage.id.toLowerCase()}`}
                                      className={isDisabled ? 'opacity-50' : ''}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                      <p><strong>Email:</strong> Sent for confirmation, en-route, arriving, and completion stages.</p>
                      <p><strong>SMS:</strong> Best for real-time alerts when your delivery is nearby.</p>
                      <p><strong>Push:</strong> Instant notifications on your device.</p>
                      <p><strong>In-App:</strong> Always recorded in your notification history.</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inbox" className="space-y-4">
            {unreadCount > 0 && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={markAllAsRead} data-testid="button-mark-all-read">
                  <Check className="w-4 h-4 mr-2" />
                  Mark all read
                </Button>
              </div>
            )}

            <div className="space-y-3">
          {isLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="w-8 h-8 border-2 border-copper border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading notifications...</p>
              </CardContent>
            </Card>
          ) : notifications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-display text-lg font-semibold mb-2">No notifications</h3>
                <p className="text-muted-foreground">You're all caught up!</p>
              </CardContent>
            </Card>
          ) : (
            notifications.map((notification, i) => {
              const Icon = getNotificationIcon(notification.type);
              return (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Card 
                    className={`cursor-pointer transition-all ${notification.read ? 'bg-card' : 'bg-muted/30 border-copper/20'}`}
                    onClick={() => handleNotificationClick(notification)}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getNotificationColor(notification.type)}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-medium text-foreground">{notification.title}</h3>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!notification.read && (
                                <Circle className="w-2.5 h-2.5 fill-copper text-copper mt-1.5" />
                              )}
                              {getNotificationRoute(notification, 'user') && (
                                <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
  );
}
