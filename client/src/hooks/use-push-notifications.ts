import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface NotificationPreferences {
  orderUpdates: boolean;
  promotionalOffers: boolean;
  deliveryReminders: boolean;
  paymentAlerts: boolean;
}

export function usePushNotifications() {
  const queryClient = useQueryClient();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSupport = async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      setIsSupported(supported);
      
      if (supported) {
        setPermission(Notification.permission);
        
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        } catch (err) {
          console.error('Error checking subscription:', err);
        }
      }
      
      setIsLoading(false);
    };

    checkSupport();
  }, []);

  const { data: vapidKey } = useQuery<{ publicKey: string }>({
    queryKey: ['/api/push/vapid-key'],
    enabled: isSupported,
  });

  const { data: preferencesData } = useQuery<{ preferences: NotificationPreferences }>({
    queryKey: ['/api/push/preferences'],
  });

  const preferences = preferencesData?.preferences || {
    orderUpdates: true,
    promotionalOffers: true,
    deliveryReminders: true,
    paymentAlerts: true,
  };

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!vapidKey?.publicKey) {
        throw new Error('VAPID key not available');
      }

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      
      if (permissionResult !== 'granted') {
        throw new Error('Notification permission denied');
      }

      const registration = await navigator.serviceWorker.ready;
      
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey.publicKey)
        });
      }

      const subscriptionJson = subscription.toJSON();
      
      await apiRequest('POST', '/api/push/subscribe', {
        subscription: {
          endpoint: subscriptionJson.endpoint,
          keys: subscriptionJson.keys
        },
        userAgent: navigator.userAgent
      });

      return subscription;
    },
    onSuccess: () => {
      setIsSubscribed(true);
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await apiRequest('POST', '/api/push/unsubscribe', {
          endpoint: subscription.endpoint
        });
        
        await subscription.unsubscribe();
      }
    },
    onSuccess: () => {
      setIsSubscribed(false);
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (newPreferences: Partial<NotificationPreferences>) => {
      await apiRequest('PUT', '/api/push/preferences', newPreferences);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/push/preferences'] });
    },
  });

  const subscribe = useCallback(async () => {
    await subscribeMutation.mutateAsync();
  }, [subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    await unsubscribeMutation.mutateAsync();
  }, [unsubscribeMutation]);

  const updatePreferences = useCallback(async (newPreferences: Partial<NotificationPreferences>) => {
    await updatePreferencesMutation.mutateAsync(newPreferences);
  }, [updatePreferencesMutation]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    preferences,
    subscribe,
    unsubscribe,
    updatePreferences,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
    isUpdatingPreferences: updatePreferencesMutation.isPending,
    subscribeError: subscribeMutation.error,
    unsubscribeError: unsubscribeMutation.error,
  };
}
