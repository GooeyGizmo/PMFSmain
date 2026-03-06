import { db } from './db';
import { users, pushSubscriptions } from '@shared/schema';
import { eq, or, inArray } from 'drizzle-orm';
import { sendDirectPushToSubscriptions } from './pushService';

let lastSentDate: string | null = null;

function getCalgaryDateParts(): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function getCalgaryDateString(): string {
  const p = getCalgaryDateParts();
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

async function sendFuelPriceReminder(): Promise<void> {
  const adminUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.role, 'owner'), eq(users.role, 'admin')));

  if (adminUsers.length === 0) {
    console.log('[FuelPriceReminder] No admin/owner users found');
    return;
  }

  const adminIds = adminUsers.map(u => u.id);

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, adminIds));

  if (subscriptions.length === 0) {
    console.log('[FuelPriceReminder] No push subscriptions found for admin/owner users');
    return;
  }

  const payload = {
    title: "Update Today's Fuel Prices",
    body: 'Tap to quickly update base costs for Regular, Premium, and Diesel',
    url: '/quick-pricing',
    tag: 'daily-fuel-pricing',
    renotify: true,
  };

  const result = await sendDirectPushToSubscriptions(subscriptions, payload);
  console.log(`[FuelPriceReminder] Sent: ${result.sent}, Failed: ${result.failed}`);
}

export function scheduleFuelPriceReminder(): void {
  const REMINDER_HOUR = 7;

  const checkAndSend = async () => {
    const { hour, minute } = getCalgaryDateParts();
    const todayStr = getCalgaryDateString();

    if (hour === REMINDER_HOUR && minute < 10 && lastSentDate !== todayStr) {
      console.log('[FuelPriceReminder] Sending daily fuel price reminder...');
      lastSentDate = todayStr;
      try {
        await sendFuelPriceReminder();
      } catch (error) {
        console.error('[FuelPriceReminder] Failed to send reminder:', error);
        lastSentDate = null;
      }
    }
  };

  setInterval(checkAndSend, 60 * 1000);
  console.log('[FuelPriceReminder] Scheduler initialized - will remind at 7am Calgary time daily');
}
