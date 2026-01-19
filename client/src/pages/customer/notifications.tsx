import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Package, CreditCard, AlertCircle, Settings, Check, Circle, BellRing, BellOff, Megaphone, Truck, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import type { Notification } from '@shared/schema';

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
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
    <CustomerLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground mt-1">Manage your notifications and preferences</p>
        </div>

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
                    onClick={() => !notification.read && markAsRead(notification.id)}
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
                            {!notification.read && (
                              <Circle className="w-2.5 h-2.5 fill-copper text-copper flex-shrink-0 mt-1.5" />
                            )}
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
    </CustomerLayout>
  );
}
