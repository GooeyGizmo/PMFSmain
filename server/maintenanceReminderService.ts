import { db } from './db';
import { users, pushSubscriptions, notificationPreferences } from '@shared/schema';
import { or, eq, and, inArray } from 'drizzle-orm';
import { storage } from './storage';
import { sendMaintenanceModeReminderEmail } from './emailService';
import { sendSmsNotification } from './smsService';
import { sendDirectPushToSubscriptions } from './pushService';

const INITIAL_THRESHOLD_HOURS = 2;
const REPEAT_HOURS = 6;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const MS_PER_HOUR = 60 * 60 * 1000;

let isRunning = false;

export const MAINTENANCE_ENABLED_AT_KEY = 'maintenanceModeEnabledAt';
export const MAINTENANCE_REMINDER_LAST_SENT_KEY = 'maintenanceReminderLastSentAt';

function parseTimestamp(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

async function isMaintenanceOn(): Promise<boolean> {
  const setting = await storage.getBusinessSetting('maintenanceMode');
  return setting === 'on';
}

function buildSmsBody(hoursOn: number): string {
  return (
    `Heads up: Maintenance mode has been ON for ${hoursOn.toFixed(1)}h. ` +
    `Customers can't place orders. Disable it in the admin panel when ready.`
  );
}

function buildPushPayload(hoursOn: number) {
  return {
    title: 'Maintenance Mode Still On',
    body:
      `Maintenance mode has been ON for ${hoursOn.toFixed(1)}h — orders are blocked. ` +
      `Tap to review.`,
    url: '/admin/settings',
    tag: 'maintenance-mode-reminder',
    renotify: true,
  };
}

export async function checkAndSendMaintenanceReminder(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const maintenanceOn = await isMaintenanceOn();
    if (!maintenanceOn) return;

    let enabledAt = parseTimestamp(await storage.getBusinessSetting(MAINTENANCE_ENABLED_AT_KEY));
    if (!enabledAt) {
      // Backfill: maintenance is on but we have no start timestamp
      // (e.g. it was enabled before this feature shipped). Stamp it now
      // so the threshold starts counting from this point forward.
      enabledAt = new Date();
      await storage.setBusinessSetting(MAINTENANCE_ENABLED_AT_KEY, enabledAt.toISOString());
      console.log('[MaintenanceReminder] Backfilled missing enabledAt timestamp');
      return;
    }

    const now = new Date();
    const hoursOn = (now.getTime() - enabledAt.getTime()) / MS_PER_HOUR;
    if (hoursOn < INITIAL_THRESHOLD_HOURS) return;

    const lastSent = parseTimestamp(await storage.getBusinessSetting(MAINTENANCE_REMINDER_LAST_SENT_KEY));
    if (lastSent) {
      const hoursSinceLast = (now.getTime() - lastSent.getTime()) / MS_PER_HOUR;
      if (hoursSinceLast < REPEAT_HOURS) return;
    }

    const adminRows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        maintenanceReminders: notificationPreferences.maintenanceReminders,
      })
      .from(users)
      .leftJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
      .where(or(eq(users.role, 'owner'), eq(users.role, 'admin')));

    // Skip users who explicitly opted out. Missing preference row = opted in (default true).
    const admins = adminRows.filter((a) => a.maintenanceReminders !== false);
    const optedOut = adminRows.length - admins.length;

    if (admins.length === 0) {
      console.log(
        `[MaintenanceReminder] No eligible owner/admin recipients` +
        `${optedOut ? ` (${optedOut} opted out)` : ''}`
      );
      return;
    }

    // ---- Email channel ----
    const emailRecipients = admins.filter((a) => a.email && a.email !== '');
    let emailSent = 0;
    let emailFailed = 0;
    for (const r of emailRecipients) {
      try {
        const result = await sendMaintenanceModeReminderEmail({
          to: r.email,
          name: r.name || 'Admin',
          hoursEnabled: hoursOn,
          enabledAt,
        });
        if (result.success) emailSent++;
        else emailFailed++;
      } catch (err) {
        emailFailed++;
        console.error('[MaintenanceReminder] Email send failed:', err);
      }
    }

    // ---- SMS channel ----
    const smsRecipients = admins.filter((a): a is typeof a & { phone: string } =>
      typeof a.phone === 'string' && a.phone.trim() !== ''
    );
    const smsBody = buildSmsBody(hoursOn);
    let smsSent = 0;
    let smsFailed = 0;
    for (const r of smsRecipients) {
      try {
        await sendSmsNotification({ phone: r.phone, message: smsBody });
        smsSent++;
      } catch (err) {
        smsFailed++;
        console.error(`[MaintenanceReminder] SMS send failed for user ${r.id}:`, err);
      }
    }

    // ---- Push channel ----
    let pushSent = 0;
    let pushFailed = 0;
    try {
      const adminIds = admins.map((a) => a.id);
      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, adminIds));

      if (subscriptions.length > 0) {
        const pushResult = await sendDirectPushToSubscriptions(subscriptions, buildPushPayload(hoursOn));
        pushSent = pushResult.sent;
        pushFailed = pushResult.failed;
      }
    } catch (err) {
      console.error('[MaintenanceReminder] Push fan-out failed:', err);
    }

    // Only mark the reminder as "sent" if at least one notification actually
    // went out across any channel. Otherwise (e.g. all providers down), leave
    // the timestamp alone so the next 5-minute tick will retry instead of
    // suppressing for 6 hours.
    const totalSent = emailSent + smsSent + pushSent;
    if (totalSent > 0) {
      await storage.setBusinessSetting(MAINTENANCE_REMINDER_LAST_SENT_KEY, now.toISOString());
    }

    console.log(
      `[MaintenanceReminder] Maintenance has been ON for ${hoursOn.toFixed(1)}h. ` +
      `Recipients: ${admins.length}` +
      `${optedOut ? ` (${optedOut} opted out)` : ''}, ` +
      `Email: ${emailSent}/${emailRecipients.length}` +
      `${emailFailed ? ` (${emailFailed} failed)` : ''}, ` +
      `SMS: ${smsSent}/${smsRecipients.length}` +
      `${smsFailed ? ` (${smsFailed} failed)` : ''}, ` +
      `Push: ${pushSent}` +
      `${pushFailed ? ` (${pushFailed} failed)` : ''}` +
      `${totalSent === 0 ? ' — will retry on next check.' : '.'}`
    );
  } catch (error) {
    console.error('[MaintenanceReminder] Check failed:', error);
  } finally {
    isRunning = false;
  }
}

export function scheduleMaintenanceReminder(): void {
  setInterval(() => {
    checkAndSendMaintenanceReminder().catch((err) => {
      console.error('[MaintenanceReminder] Scheduled check failed:', err);
    });
  }, CHECK_INTERVAL_MS);

  // Run once shortly after startup so we don't have to wait the full interval
  setTimeout(() => {
    checkAndSendMaintenanceReminder().catch((err) => {
      console.error('[MaintenanceReminder] Initial check failed:', err);
    });
  }, 30 * 1000);

  console.log(
    `[MaintenanceReminder] Scheduler initialized - checks every ${CHECK_INTERVAL_MS / 60000}m, ` +
    `first reminder after ${INITIAL_THRESHOLD_HOURS}h, repeats every ${REPEAT_HOURS}h`
  );
}
