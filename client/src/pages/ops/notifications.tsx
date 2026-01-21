import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { format } from 'date-fns';
import OpsLayout from '@/components/ops-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Bell, Send, Users, Smartphone, 
  CheckCircle, AlertCircle, Loader2 
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

export default function OpsNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const { data: statsData, isLoading: statsLoading } = useQuery<NotificationStats>({
    queryKey: ['/api/ops/push/stats'],
  });

  const { data: subscribersData, isLoading: subscribersLoading } = useQuery<{ subscribers: PushSubscriber[] }>({
    queryKey: ['/api/ops/push/subscribers'],
  });

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

  const subscribers = subscribersData?.subscribers || [];
  const stats = statsData || { totalSubscribers: 0, activeSubscribers: 0 };

  return (
    <OpsLayout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/ops">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-copper" />
              <h1 className="font-display text-xl font-bold text-foreground">Push Notifications</h1>
            </div>
            <p className="text-sm text-muted-foreground">Manage push notification subscribers and send broadcasts</p>
          </div>
        </div>

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
      </main>
    </OpsLayout>
  );
}
