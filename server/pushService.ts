import webPush from 'web-push';
import { db } from './db';
import { pushSubscriptions, notificationPreferences, users, COMPANY_EMAILS } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = `mailto:${COMPANY_EMAILS.SUPPORT}`;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('[PushService] VAPID keys configured');
} else {
  console.warn('[PushService] VAPID keys not configured - push notifications will be disabled');
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  renotify?: boolean;
  actions?: Array<{ action: string; title: string }>;
}

export async function getVapidPublicKey(): Promise<string> {
  return VAPID_PUBLIC_KEY;
}

export async function saveSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
): Promise<void> {
  const existing = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
    .limit(1);

  if (existing.length > 0) {
    await db.update(pushSubscriptions)
      .set({
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
        lastUsedAt: new Date()
      })
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
  } else {
    await db.insert(pushSubscriptions).values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent
    });
  }
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function removeUserSubscriptions(userId: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

export async function getUserPreferences(userId: string): Promise<{
  orderUpdates: boolean;
  promotionalOffers: boolean;
  deliveryReminders: boolean;
  paymentAlerts: boolean;
} | null> {
  const prefs = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (prefs.length === 0) {
    return {
      orderUpdates: true,
      promotionalOffers: true,
      deliveryReminders: true,
      paymentAlerts: true
    };
  }

  return {
    orderUpdates: prefs[0].orderUpdates,
    promotionalOffers: prefs[0].promotionalOffers,
    deliveryReminders: prefs[0].deliveryReminders,
    paymentAlerts: prefs[0].paymentAlerts
  };
}

export async function updateUserPreferences(
  userId: string,
  preferences: {
    orderUpdates?: boolean;
    promotionalOffers?: boolean;
    deliveryReminders?: boolean;
    paymentAlerts?: boolean;
  }
): Promise<void> {
  const existing = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db.update(notificationPreferences)
      .set({
        ...preferences,
        updatedAt: new Date()
      })
      .where(eq(notificationPreferences.userId, userId));
  } else {
    await db.insert(notificationPreferences).values({
      userId,
      orderUpdates: preferences.orderUpdates ?? true,
      promotionalOffers: preferences.promotionalOffers ?? true,
      deliveryReminders: preferences.deliveryReminders ?? true,
      paymentAlerts: preferences.paymentAlerts ?? true
    });
  }
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  notificationType: 'orderUpdates' | 'promotionalOffers' | 'deliveryReminders' | 'paymentAlerts'
): Promise<{ sent: number; failed: number }> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[PushService] Cannot send push - VAPID keys not configured');
    return { sent: 0, failed: 0 };
  }

  const prefs = await getUserPreferences(userId);
  if (prefs && !prefs[notificationType]) {
    console.log(`[PushService] User ${userId} has disabled ${notificationType}`);
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      await webPush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
        {
          TTL: 86400,
          urgency: 'high'
        }
      );

      await db.update(pushSubscriptions)
        .set({ lastUsedAt: new Date() })
        .where(eq(pushSubscriptions.id, sub.id));

      sent++;
    } catch (error: any) {
      console.error(`[PushService] Failed to send to ${sub.endpoint}:`, error.message);
      
      if (error.statusCode === 404 || error.statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        console.log(`[PushService] Removed expired subscription ${sub.id}`);
      }
      
      failed++;
    }
  }

  return { sent, failed };
}

export async function sendOrderStatusUpdate(
  userId: string,
  orderId: string,
  status: string,
  message: string
): Promise<void> {
  const statusMessages: Record<string, { title: string; icon?: string }> = {
    confirmed: { title: 'Order Confirmed' },
    en_route: { title: 'Driver On The Way' },
    arriving: { title: 'Driver Arriving Soon' },
    fueling: { title: 'Fueling In Progress' },
    completed: { title: 'Delivery Complete' },
    cancelled: { title: 'Order Cancelled' }
  };

  const statusInfo = statusMessages[status] || { title: 'Order Update' };

  await sendPushToUser(userId, {
    title: statusInfo.title,
    body: message,
    url: `/customer/orders/${orderId}`,
    tag: `order-${orderId}`,
    renotify: true
  }, 'orderUpdates');
}

export async function sendPromotionalNotification(
  userIds: string[],
  title: string,
  body: string,
  url?: string
): Promise<{ totalSent: number; totalFailed: number }> {
  let totalSent = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    const result = await sendPushToUser(userId, {
      title,
      body,
      url: url || '/customer/dashboard',
      tag: 'promotional'
    }, 'promotionalOffers');

    totalSent += result.sent;
    totalFailed += result.failed;
  }

  return { totalSent, totalFailed };
}

export async function sendDeliveryReminder(
  userId: string,
  scheduledDate: Date,
  address: string
): Promise<void> {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Edmonton'
  }).format(scheduledDate);

  await sendPushToUser(userId, {
    title: 'Delivery Reminder',
    body: `Your fuel delivery to ${address} is scheduled for ${dateStr}`,
    url: '/customer/orders',
    tag: 'delivery-reminder'
  }, 'deliveryReminders');
}

export async function sendPaymentAlert(
  userId: string,
  type: 'success' | 'failed' | 'refunded',
  amount: string,
  orderId?: string
): Promise<void> {
  const messages = {
    success: { title: 'Payment Successful', body: `Your payment of ${amount} has been processed` },
    failed: { title: 'Payment Failed', body: `We couldn't process your payment of ${amount}. Please update your payment method.` },
    refunded: { title: 'Refund Issued', body: `A refund of ${amount} has been issued to your account` }
  };

  const msg = messages[type];

  await sendPushToUser(userId, {
    title: msg.title,
    body: msg.body,
    url: orderId ? `/customer/orders/${orderId}` : '/customer/dashboard',
    tag: `payment-${type}`
  }, 'paymentAlerts');
}
