import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Bell, BellRing, Package, CreditCard, AlertCircle, Settings, Check, Shield, Truck, BarChart3, Users, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getNotificationRoute } from '@/lib/notification-routes';
import type { Notification } from '@shared/schema';

const CATEGORY_LABELS: Record<string, { label: string; icon: typeof Shield }> = {
  owner: { label: 'Owner', icon: Shield },
  operations: { label: 'Operations', icon: BarChart3 },
  driver: { label: 'Driver', icon: Truck },
  customer: { label: 'Customer', icon: Users },
};

interface NotificationBellProps {
  variant?: 'customer' | 'ops';
  shellType?: 'customer' | 'operator' | 'owner';
}

export default function NotificationBell({ variant = 'customer', shellType }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { isOwner, isAdmin, user } = useAuth();
  const isOwnerOrAdmin = isOwner || isAdmin;

  const userRole = (user?.role || 'user') as 'user' | 'operator' | 'admin' | 'owner';

  const getNotificationsPath = () => {
    if (shellType === 'owner') return '/owner/settings?tab=notifications';
    if (shellType === 'operator') return '/operator/settings?tab=notifications';
    if (shellType === 'customer') return '/app/account?tab=notifications';
    if (variant === 'ops') return isOwnerOrAdmin ? '/owner/settings?tab=notifications' : '/operator/settings?tab=notifications';
    return isOwnerOrAdmin ? '/owner/settings?tab=notifications' : '/app/account?tab=notifications';
  };
  const notificationsPath = getNotificationsPath();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['/api/notifications/unread-count'],
  });
  const unreadCount = unreadData?.count || 0;

  const { data: notificationsData, isLoading: notifLoading } = useQuery<{ notifications: Notification[] }>({
    queryKey: ['/api/notifications'],
    enabled: open && !isOwnerOrAdmin,
  });

  const { data: groupedData, isLoading: groupedLoading } = useQuery<{ grouped: Record<string, Notification[]>; total: number }>({
    queryKey: ['/api/notifications/all-categories'],
    enabled: open && isOwnerOrAdmin,
  });

  const isLoading = isOwnerOrAdmin ? groupedLoading : notifLoading;

  const notifications = isOwnerOrAdmin
    ? Object.values(groupedData?.grouped || {}).flat().sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8).map((n: any) => ({ ...n, createdAt: new Date(n.createdAt) }))
    : (notificationsData?.notifications || []).slice(0, 8).map((n: any) => ({ ...n, createdAt: new Date(n.createdAt) }));

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/all-categories'] });
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleNotificationClick = (notification: any) => {
    const route = getNotificationRoute(notification, userRole);
    setOpen(false);
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (route) {
      const [routePath] = route.split('?');
      const currentPath = window.location.pathname;
      if (currentPath === routePath) {
        const separator = route.includes('?') ? '&' : '?';
        navigate(route + separator + '_t=' + Date.now(), { replace: true });
      } else {
        navigate(route);
      }
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/all-categories'] });
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order_update': return Package;
      case 'payment': return CreditCard;
      case 'subscription': return Settings;
      case 'system': return AlertCircle;
      default:
        if (type.startsWith('delivery_')) return Package;
        return Bell;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'order_update': return 'bg-copper/10 text-copper';
      case 'payment': return 'bg-brass/10 text-brass';
      case 'subscription': return 'bg-sage/10 text-sage';
      case 'system': return 'bg-destructive/10 text-destructive';
      default:
        if (type.startsWith('delivery_')) return 'bg-copper/10 text-copper';
        return 'bg-muted text-muted-foreground';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'owner': return 'text-amber-600';
      case 'operations': return 'text-blue-600';
      case 'driver': return 'text-green-600';
      case 'customer': return 'text-purple-600';
      default: return 'text-muted-foreground';
    }
  };

  const groupedByCategory = isOwnerOrAdmin
    ? notifications.reduce((acc: Record<string, typeof notifications>, n: any) => {
        const cat = n.category || 'customer';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(n);
        return acc;
      }, {} as Record<string, typeof notifications>)
    : null;

  const sortedCategories = groupedByCategory
    ? ['owner', 'operations', 'driver', 'customer'].filter(c => groupedByCategory[c]?.length > 0)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notification-bell">
          {unreadCount > 0 ? (
            <BellRing className="w-5 h-5" />
          ) : (
            <Bell className="w-5 h-5" />
          )}
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center bg-copper text-white text-xs">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] sm:w-80 p-0 z-50 bg-popover shadow-xl border border-border rounded-lg overflow-hidden" align="end" sideOffset={8}>
        <div className="flex items-center justify-between p-3 border-b border-border bg-popover">
          <h3 className="font-display font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={markAllAsRead}
              className="text-xs h-7"
              data-testid="button-mark-all-read"
            >
              <Check className="w-3 h-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : isOwnerOrAdmin && sortedCategories ? (
            <div>
              {sortedCategories.map(cat => {
                const config = CATEGORY_LABELS[cat];
                const CatIcon = config?.icon || Bell;
                const catNotifications = groupedByCategory![cat] || [];
                return (
                  <div key={cat}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wide ${getCategoryColor(cat)} bg-muted/50 border-b border-border`}>
                      <CatIcon className="w-3 h-3" />
                      {config?.label || cat}
                    </div>
                    <div className="divide-y divide-border">
                      {catNotifications.map((notification: any) => {
                        const Icon = getNotificationIcon(notification.type);
                        const hasRoute = !!getNotificationRoute(notification, userRole);
                        return (
                          <button
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`w-full text-left p-3 hover:bg-muted/50 transition-colors cursor-pointer ${
                              !notification.read ? 'bg-muted/20' : 'bg-popover'
                            }`}
                            data-testid={`notification-item-${notification.id}`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${getNotificationColor(notification.type)}`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-start justify-between gap-1.5">
                                  <p className="font-medium text-sm text-foreground line-clamp-2 leading-tight">
                                    {notification.title}
                                  </p>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {!notification.read && (
                                      <span className="w-2 h-2 rounded-full bg-copper mt-1" />
                                    )}
                                    {hasRoute && (
                                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                  {notification.message}
                                </p>
                                <p className="text-[11px] text-muted-foreground/70 mt-1">
                                  {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                const hasRoute = !!getNotificationRoute(notification, userRole);
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition-colors cursor-pointer ${
                      !notification.read ? 'bg-muted/20' : 'bg-popover'
                    }`}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${getNotificationColor(notification.type)}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="font-medium text-sm text-foreground line-clamp-2 leading-tight">
                            {notification.title}
                          </p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {!notification.read && (
                              <span className="w-2 h-2 rounded-full bg-copper mt-1" />
                            )}
                            {hasRoute && (
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        
        <div className="p-2 border-t border-border">
          <Link href={notificationsPath}>
            <Button 
              variant="ghost" 
              className="w-full text-sm" 
              onClick={() => setOpen(false)}
              data-testid="link-view-all-notifications"
            >
              View all notifications
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
