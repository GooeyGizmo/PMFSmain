import { getStripeSync } from './stripeClient';
import { subscriptionService } from './subscriptionService';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }

  static async handleStripeEvent(event: any): Promise<void> {
    const { type, data } = event;
    
    switch (type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await subscriptionService.handleSubscriptionUpdated(data.object);
        break;
      case 'invoice.payment_failed':
        await subscriptionService.handleInvoicePaymentFailed(data.object);
        break;
      case 'invoice.payment_succeeded':
        await subscriptionService.handleInvoicePaymentSucceeded(data.object);
        break;
      default:
        console.log(`Unhandled Stripe event: ${type}`);
    }
  }
}
