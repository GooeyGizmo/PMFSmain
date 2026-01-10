import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Package, CreditCard, AlertCircle, Settings, Check, Circle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '@shared/schema';

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
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

  return (
    <CustomerLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Notifications</h1>
            <p className="text-muted-foreground mt-1">
              {isLoading ? 'Loading...' : unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead} data-testid="button-mark-all-read">
              <Check className="w-4 h-4 mr-2" />
              Mark all read
            </Button>
          )}
        </div>

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
      </div>
    </CustomerLayout>
  );
}
