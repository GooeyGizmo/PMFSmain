import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import OpsLayout from '@/components/ops-layout';
import { useAuth } from '@/lib/auth';
import { getNotificationRoute } from '@/lib/notification-routes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import type { Notification } from '@shared/schema';
import { 
  ArrowLeft, Bell, Send, Users, Smartphone, 
  CheckCircle, AlertCircle, Loader2, Settings, Check,
  Circle, BellRing, BellOff, Megaphone, Package, CreditCard, Truck, ChevronRight
} from 'lucide-react';

interface PushSubscriber {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  createdAt: string;
  lastActive?: string;
}

interface NotificationStats {
  totalSubscribers: number;
  activeSubscribers: number;
}

export default function OpsNotifications({ embedded }: { embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const userRole = (user?.role || 'user') as 'user' | 'operator' | 'admin' | 'owner';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

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

  const { data: statsData, isLoading: statsLoading } = useQuery<NotificationStats>({
    queryKey: ['/api/ops/push/stats'],
  });

  const { data: subscribersData, isLoading: subscribersLoading } = useQuery<{ subscribers: PushSubscriber[] }>({
    queryKey: ['/api/ops/push/subscribers'],
  });

  const { data: notificationsData, isLoading: isLoadingNotifications } = useQuery<{ notifications: any[] }>({
    queryKey: ['/api/notifications'],
  });

  const notifications: Notification[] = (notificationsData?.notifications || []).map((n: any) => ({
    ...n,
    createdAt: new Date(n.createdAt),
  }));

  const sendNotificationMutation = useMutation({
    mutationFn: async ({ title, body }: { title: string; body: string }) => {
      const res = await fetch('/api/ops/push/promotional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to send notification');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/push/stats'] });
      toast({ 
        title: 'Notification Sent', 
        description: `Sent to ${data.sentCount || 0} subscribers` 
      });
      setTitle('');
      setBody('');
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to Send', description: err.message, variant: 'destructive' });
    },
  });

  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: 'Missing Fields', description: 'Please enter both title and message', variant: 'destructive' });
      return;
    }
    sendNotificationMutation.mutate({ title: title.trim(), body: body.trim() });
  };

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
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
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    const route = getNotificationRoute(notification, userRole);
    if (route) {
      navigate(route);
    }
  };

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

  const getNotificationCategory = (type: string) => {
    if (['order_update', 'payment', 'subscription'].includes(type) || type.startsWith('delivery_')) {
      return 'customer';
    }
    return 'operations';
  };

  const subscribers = subscribersData?.subscribers || [];
  const stats = statsData || { totalSubscribers: 0, activeSubscribers: 0 };
  const unreadCount = notifications.filter(n => !n.read).length;

  const content = (
    <div className="space-y-6">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        {!embedded && (
          <div className="flex items-center gap-3">
            <Link href="/ops">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-copper" />
                <h1 className="font-display text-xl font-bold text-foreground">Notifications</h1>
              </div>
              <p className="text-sm text-muted-foreground">View your notifications and manage push settings</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="inbox" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="inbox" data-testid="tab-inbox">
              <Bell className="w-4 h-4 mr-2" />
              Inbox {unreadCount > 0 && `(${unreadCount})`}
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="broadcast" data-testid="tab-broadcast">
              <Send className="w-4 h-4 mr-2" />
              Broadcast
            </TabsTrigger>
          </TabsList>

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
              {isLoadingNotifications ? (
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
                  const category = getNotificationCategory(notification.type);
                  const hasRoute = !!getNotificationRoute(notification, userRole);
                  return (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <Card 
                        className={`cursor-pointer transition-all hover:shadow-md active:scale-[0.99] ${notification.read ? 'bg-card' : 'bg-muted/30 border-copper/20'}`}
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
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-medium text-foreground">{notification.title}</h3>
                                  <Badge variant="outline" className="text-xs">
                                    {category === 'customer' ? 'Customer' : 'Operations'}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {!notification.read && (
                                    <Circle className="w-2.5 h-2.5 fill-copper text-copper mt-1.5" />
                                  )}
                                  {hasRoute && (
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
                            : 'Get instant updates about orders and operations'}
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
          </TabsContent>

          <TabsContent value="broadcast" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Total Subscribers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <p className="text-3xl font-bold" data-testid="text-total-subscribers">
                      {stats.totalSubscribers}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Active Devices
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <p className="text-3xl font-bold" data-testid="text-active-subscribers">
                      {stats.activeSubscribers}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  Send Broadcast Notification
                </CardTitle>
                <CardDescription>
                  Send a promotional push notification to all subscribed customers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="notification-title">Title</Label>
                  <Input
                    id="notification-title"
                    placeholder="e.g., Special Offer This Weekend!"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    data-testid="input-notification-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notification-body">Message</Label>
                  <Textarea
                    id="notification-body"
                    placeholder="Enter your notification message..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={3}
                    data-testid="input-notification-body"
                  />
                </div>
                <Button 
                  onClick={handleSend}
                  disabled={sendNotificationMutation.isPending || !title.trim() || !body.trim()}
                  className="gap-2"
                  data-testid="button-send-notification"
                >
                  {sendNotificationMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send to All Subscribers
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Subscribers
                </CardTitle>
                <CardDescription>
                  Customers who have enabled push notifications
                </CardDescription>
              </CardHeader>
              <CardContent>
                {subscribersLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : subscribers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bell className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>No push notification subscribers yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {subscribers.map((sub) => (
                      <div 
                        key={sub.id} 
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`subscriber-${sub.id}`}
                      >
                        <div>
                          <p className="font-medium">{sub.userName || 'Unknown User'}</p>
                          <p className="text-sm text-muted-foreground">{sub.userEmail}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="gap-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            Subscribed
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            Since {format(new Date(sub.createdAt), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
