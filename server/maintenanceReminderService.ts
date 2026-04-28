import { db } from './db';
import { users } from '@shared/schema';
import { or, eq, isNotNull, and, ne } from 'drizzle-orm';
import { storage } from './storage';
import { sendMaintenanceModeReminderEmail } from './emailService';

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

    const recipients = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(
        and(
          or(eq(users.role, 'owner'), eq(users.role, 'admin')),
          isNotNull(users.email),
          ne(users.email, ''),
        ),
      );

    if (recipients.length === 0) {
      console.log('[MaintenanceReminder] No owner/admin recipients found');
      return;
    }

    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      const result = await sendMaintenanceModeReminderEmail({
        to: r.email,
        name: r.name || 'Admin',
        hoursEnabled: hoursOn,
        enabledAt,
      });
      if (result.success) sent++;
      else failed++;
    }

    // Only mark the reminder as "sent" if at least one email actually went
    // out. Otherwise (e.g. Resend outage), leave the timestamp alone so the
    // next 5-minute tick will retry instead of suppressing for 6 hours.
    if (sent > 0) {
      await storage.setBusinessSetting(MAINTENANCE_REMINDER_LAST_SENT_KEY, now.toISOString());
    }

    console.log(
      `[MaintenanceReminder] Maintenance has been ON for ${hoursOn.toFixed(1)}h. ` +
      `Reminder sent to ${sent}/${recipients.length} admin(s)` +
      `${failed ? `, ${failed} failed` : ''}` +
      `${sent === 0 ? ' — will retry on next check.' : '.'}`
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
