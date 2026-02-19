import { db } from './db';
import { notificationPreferences, users, orders as ordersTable } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storage } from './storage';
import { sendOrderStatusUpdate as sendPushNotification } from './pushService';

type OrderStatus = 'confirmed' | 'en_route' | 'arriving' | 'fueling' | 'completed';

interface NotificationPrefs {
  emailConfirmed: boolean;
  emailEnRoute: boolean;
  emailArriving: boolean;
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

const DEFAULT_PREFS: NotificationPrefs = {
  emailConfirmed: true,
  emailEnRoute: true,
  emailArriving: true,
  emailCompleted: true,
  smsConfirmed: true,
  smsEnRoute: true,
  smsArriving: true,
  smsFueling: true,
  smsCompleted: true,
  pushConfirmed: true,
  pushEnRoute: true,
  pushArriving: true,
  pushFueling: true,
  pushCompleted: true,
  inAppConfirmed: true,
  inAppEnRoute: true,
  inAppArriving: true,
  inAppFueling: true,
  inAppCompleted: true,
};

const STATUS_MESSAGES: Record<OrderStatus, { title: string; body: string }> = {
  confirmed: {
    title: 'Order Confirmed',
    body: 'Your fuel delivery order has been confirmed and assigned to a driver.',
  },
  en_route: {
    title: 'Driver On The Way',
    body: 'Your driver is now en route to your location.',
  },
  arriving: {
    title: 'Driver Arriving Soon',
    body: 'Your driver is almost there! Please ensure access to your vehicle.',
  },
  fueling: {
    title: 'Fueling In Progress',
    body: 'Your vehicle is currently being fueled.',
  },
  completed: {
    title: 'Delivery Complete',
    body: 'Your fuel delivery has been completed successfully. Thank you!',
  },
};

async function getUserNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const prefs = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (prefs.length === 0) {
    return DEFAULT_PREFS;
  }

  const p = prefs[0];
  return {
    emailConfirmed: p.emailConfirmed ?? true,
    emailEnRoute: p.emailEnRoute ?? true,
    emailArriving: p.emailArriving ?? true,
    emailCompleted: p.emailCompleted ?? true,
    smsConfirmed: p.smsConfirmed ?? true,
    smsEnRoute: p.smsEnRoute ?? true,
    smsArriving: p.smsArriving ?? true,
    smsFueling: p.smsFueling ?? true,
    smsCompleted: p.smsCompleted ?? true,
    pushConfirmed: p.pushConfirmed ?? true,
    pushEnRoute: p.pushEnRoute ?? true,
    pushArriving: p.pushArriving ?? true,
    pushFueling: p.pushFueling ?? true,
    pushCompleted: p.pushCompleted ?? true,
    inAppConfirmed: p.inAppConfirmed ?? true,
    inAppEnRoute: p.inAppEnRoute ?? true,
    inAppArriving: p.inAppArriving ?? true,
    inAppFueling: p.inAppFueling ?? true,
    inAppCompleted: p.inAppCompleted ?? true,
  };
}

function getPrefKey(type: 'email' | 'sms' | 'push' | 'inApp', status: OrderStatus): keyof NotificationPrefs {
  const statusMap: Record<OrderStatus, string> = {
    confirmed: 'Confirmed',
    en_route: 'EnRoute',
    arriving: 'Arriving',
    fueling: 'Fueling',
    completed: 'Completed',
  };
  return `${type}${statusMap[status]}` as keyof NotificationPrefs;
}

async function sendEmailNotification(
  userId: string,
  orderId: string,
  status: OrderStatus,
  message: { title: string; body: string }
): Promise<boolean> {
  try {
    const { sendStatusUpdateEmail } = await import('./emailService');
    const user = await storage.getUser(userId);
    if (!user?.email) return false;

    await sendStatusUpdateEmail({
      userEmail: user.email,
      userName: user.name,
      orderId,
      status,
      title: message.title,
      body: message.body,
    });
    console.log(`[OrderNotify] Email sent to ${user.email} for status ${status}`);
    return true;
  } catch (error) {
    console.error('[OrderNotify] Email send failed:', error);
    return false;
  }
}

async function sendSmsNotification(
  userId: string,
  orderId: string,
  status: OrderStatus,
  message: { title: string; body: string }
): Promise<boolean> {
  try {
    const { sendSmsNotification: sendSms } = await import('./smsService');
    const user = await storage.getUser(userId);
    if (!user?.phone) return false;

    await sendSms({
      phone: user.phone,
      message: `${message.title}: ${message.body}`,
    });
    console.log(`[OrderNotify] SMS sent to ${user.phone} for status ${status}`);
    return true;
  } catch (error: any) {
    if (error.message?.includes('not configured') || error.message?.includes('not connected')) {
      console.log('[OrderNotify] SMS service not configured, skipping');
    } else {
      console.error('[OrderNotify] SMS send failed:', error);
    }
    return false;
  }
}

async function sendInAppNotification(
  userId: string,
  orderId: string,
  status: OrderStatus,
  message: { title: string; body: string },
  isSystemLevel: boolean = false
): Promise<boolean> {
  try {
    await storage.createNotification({
      userId,
      type: 'order_update',
      title: message.title,
      message: message.body,
      orderId,
      metadata: { status, isSystemLevel },
    });
    console.log(`[OrderNotify] In-app notification created for ${userId}, status ${status}`);
    return true;
  } catch (error) {
    console.error('[OrderNotify] In-app notification failed:', error);
    return false;
  }
}

export async function sendOrderStatusNotifications(
  userId: string,
  orderId: string,
  status: OrderStatus,
  etaMinutes?: number
): Promise<{
  email: boolean;
  sms: boolean;
  push: boolean;
  inApp: boolean;
}> {
  const prefs = await getUserNotificationPrefs(userId);
  const baseMessage = STATUS_MESSAGES[status];
  
  const message = { ...baseMessage };
  if (etaMinutes !== undefined && etaMinutes > 0) {
    if (status === 'en_route') {
      message.body = `Your driver is now en route. Estimated arrival in about ${etaMinutes} minutes.`;
    } else if (status === 'arriving') {
      message.body = `Your driver is almost there! Arriving in about ${etaMinutes} minutes. Please ensure access to your vehicle.`;
    }
  }
  
  const results = {
    email: false,
    sms: false,
    push: false,
    inApp: false,
  };

  const emailEnabled = status !== 'fueling' && prefs[getPrefKey('email', status)];
  if (emailEnabled) {
    results.email = await sendEmailNotification(userId, orderId, status, message);
  }

  const smsEnabled = prefs[getPrefKey('sms', status)];
  if (smsEnabled) {
    results.sms = await sendSmsNotification(userId, orderId, status, message);
  }

  const pushEnabled = prefs[getPrefKey('push', status)];
  if (pushEnabled) {
    try {
      await sendPushNotification(userId, orderId, status, message.body);
      results.push = true;
      console.log(`[OrderNotify] Push sent for ${userId}, status ${status}`);
    } catch (error) {
      console.error('[OrderNotify] Push send failed:', error);
    }
  }

  results.inApp = await sendInAppNotification(userId, orderId, status, message, true);

  console.log(`[OrderNotify] Status ${status} notifications for order ${orderId}:`, results);
  return results;
}

export async function updateNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPrefs>
): Promise<void> {
  const existing = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db.update(notificationPreferences)
      .set({
        ...preferences,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.userId, userId));
  } else {
    await db.insert(notificationPreferences).values({
      userId,
      ...DEFAULT_PREFS,
      ...preferences,
    });
  }
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPrefs> {
  return getUserNotificationPrefs(userId);
}
