import { Resend } from 'resend';
import { COMPANY_EMAILS } from '@shared/schema';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

/**
 * Get Resend client with configured from email.
 * Note: The from_email comes from the Resend integration (verified domain).
 * COMPANY_EMAILS.BILLING is the fallback for billing/order-related outbound emails.
 * The semantic routing (support@, billing@, info@) happens in the 'to' field
 * for internal notifications, while customer-facing emails use the verified sender.
 */
async function getResendClient() {
  const { apiKey } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: connectionSettings.settings.from_email || COMPANY_EMAILS.BILLING
  };
}

export async function sendOrderConfirmationEmail(order: {
  id: string;
  userEmail: string;
  userName: string;
  scheduledDate: Date;
  deliveryWindow: string;
  address: string;
  city: string;
  fuelType: string;
  fuelAmount: number;
  fillToFull: boolean;
  total: string;
}) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const formattedDate = order.scheduledDate.toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Edmonton',
    });

    await client.emails.send({
      from: fromEmail,
      to: order.userEmail,
      subject: `Order Confirmed - ${formattedDate}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #C67D4A 0%, #B8860B 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
            .detail-label { color: #666; }
            .detail-value { font-weight: 600; color: #333; }
            .total-row { font-size: 20px; color: #C67D4A; margin-top: 20px; padding-top: 20px; border-top: 2px solid #C67D4A; }
            .footer { background: #f9f9f9; padding: 20px; text-align: center; color: #666; font-size: 14px; }
            .cta-button { display: inline-block; background: #C67D4A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Prairie Mobile Fuel Services</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Order Confirmation</p>
            </div>
            <div class="content">
              <p>Hi ${order.userName},</p>
              <p>Your fuel delivery has been confirmed! Here are the details:</p>
              
              <div class="detail-row">
                <span class="detail-label">Order ID</span>
                <span class="detail-value">#${order.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Date</span>
                <span class="detail-value">${formattedDate}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Time Window</span>
                <span class="detail-value">${order.deliveryWindow}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Address</span>
                <span class="detail-value">${order.address}, ${order.city}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Fuel</span>
                <span class="detail-value">${order.fillToFull ? 'Fill to Full' : `${order.fuelAmount}L`} ${order.fuelType.charAt(0).toUpperCase() + order.fuelType.slice(1)}</span>
              </div>
              <div class="detail-row total-row">
                <span>Total (inc. GST)</span>
                <span>$${parseFloat(order.total).toFixed(2)}</span>
              </div>
              
              <p style="margin-top: 20px; color: #666;">
                ${order.fillToFull ? 'Note: Final charge will be based on actual litres delivered.' : ''}
              </p>
              
              <center>
                <a href="https://prairiemobilefuel.ca/customer/deliveries" class="cta-button">Track Your Delivery</a>
              </center>
            </div>
            <div class="footer">
              <p>Questions? Call us at (403) 430-0390</p>
              <p>Prairie Mobile Fuel Services · Calgary, Alberta</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    
    console.log(`Order confirmation email sent for order ${order.id}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send order confirmation email:', error);
    return { success: false, error };
  }
}

export async function sendVerificationEmail(user: {
  email: string;
  name: string;
  verificationToken: string;
}) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://prairiemobilefuel.ca'
      : `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'prairiemobilefuel.ca'}`;
    const verificationUrl = `${baseUrl}/verify-email?token=${user.verificationToken}`;

    await client.emails.send({
      from: fromEmail,
      to: user.email,
      subject: 'Verify Your Email - Prairie Mobile Fuel Services',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #C67D4A 0%, #B8860B 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; text-align: center; }
            .verify-button { display: inline-block; background: #C67D4A; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-size: 16px; font-weight: 600; }
            .verify-button:hover { background: #B8860B; }
            .footer { background: #f9f9f9; padding: 20px; text-align: center; color: #666; font-size: 14px; }
            .link-text { word-break: break-all; color: #666; font-size: 12px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Prairie Mobile Fuel Services</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Email Verification</p>
            </div>
            <div class="content">
              <p>Hi ${user.name},</p>
              <p>Welcome to Prairie Mobile Fuel Services! Please verify your email address to complete your registration.</p>
              
              <a href="${verificationUrl}" class="verify-button">Verify My Email</a>
              
              <p style="color: #666; font-size: 14px; margin-top: 20px;">
                This link will expire in 24 hours.
              </p>
              
              <p class="link-text">
                If the button doesn't work, copy and paste this link into your browser:<br>
                ${verificationUrl}
              </p>
            </div>
            <div class="footer">
              <p>If you didn't create an account with us, you can safely ignore this email.</p>
              <p>Prairie Mobile Fuel Services · Calgary, Alberta</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    
    console.log(`Verification email sent to ${user.email}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return { success: false, error };
  }
}

export async function sendPaymentFailureEmail(order: {
  id: string;
  userEmail: string;
  userName: string;
  scheduledDate: Date;
  deliveryWindow: string;
  address: string;
  city: string;
  total: string;
}) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const formattedDate = order.scheduledDate.toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Edmonton',
    });

    await client.emails.send({
      from: fromEmail,
      to: order.userEmail,
      subject: `Action Required: Payment Issue with Your Order - #${order.id.slice(0, 8).toUpperCase()}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
            .detail-label { color: #666; }
            .detail-value { font-weight: 600; color: #333; }
            .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0; color: #991b1b; }
            .contact-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0; }
            .footer { background: #f9f9f9; padding: 20px; text-align: center; color: #666; font-size: 14px; }
            .warning-icon { font-size: 48px; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="warning-icon">⚠️</div>
              <h1>Payment Issue</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Action Required</p>
            </div>
            <div class="content">
              <p>Hi ${order.userName},</p>
              
              <div class="alert-box">
                <strong>We were unable to process the payment for your upcoming fuel delivery.</strong>
                <p style="margin: 10px 0 0 0;">Your order is currently on hold until the payment issue is resolved.</p>
              </div>
              
              <h3 style="color: #333;">Order Details</h3>
              
              <div class="detail-row">
                <span class="detail-label">Order ID</span>
                <span class="detail-value">#${order.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Scheduled Date</span>
                <span class="detail-value">${formattedDate}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Time Window</span>
                <span class="detail-value">${order.deliveryWindow}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Address</span>
                <span class="detail-value">${order.address}, ${order.city}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Amount</span>
                <span class="detail-value">$${parseFloat(order.total).toFixed(2)}</span>
              </div>
              
              <div class="contact-box">
                <strong>Please contact us to resolve this issue:</strong>
                <p style="margin: 10px 0 0 0;">
                  📧 Email: <a href="mailto:${COMPANY_EMAILS.SUPPORT}">${COMPANY_EMAILS.SUPPORT}</a><br>
                  📞 Phone: (403) 430-0390
                </p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
                  You can also update your payment method by logging into your account at prairiemobilefuel.ca
                </p>
              </div>
            </div>
            <div class="footer">
              <p>Prairie Mobile Fuel Services · Calgary, Alberta</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    
    console.log(`Payment failure email sent for order ${order.id} to ${order.userEmail}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send payment failure email:', error);
    return { success: false, error };
  }
}

export async function sendDeliveryReceiptEmail(order: {
  id: string;
  userEmail: string;
  userName: string;
  scheduledDate: Date;
  deliveryWindow: string;
  address: string;
  city: string;
  fuelType: string;
  fuelAmount: number;
  actualLitresDelivered: number;
  fillToFull: boolean;
  pricePerLitre: string;
  tierDiscount: string;
  deliveryFee: string;
  gstAmount: string;
  total: string;
}) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const formattedDate = order.scheduledDate.toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Edmonton',
    });

    const actualLitres = order.actualLitresDelivered || order.fuelAmount;
    const pricePerLitre = parseFloat(order.pricePerLitre);
    const tierDiscount = parseFloat(order.tierDiscount);
    const fuelCost = actualLitres * pricePerLitre;
    const discountAmount = actualLitres * tierDiscount;

    await client.emails.send({
      from: fromEmail,
      to: order.userEmail,
      subject: `Delivery Receipt - ${formattedDate}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
            .detail-label { color: #666; }
            .detail-value { font-weight: 600; color: #333; text-align: right; }
            .discount { color: #22c55e; }
            .total-row { font-size: 20px; color: #333; margin-top: 20px; padding-top: 20px; border-top: 2px solid #22c55e; }
            .footer { background: #f9f9f9; padding: 20px; text-align: center; color: #666; font-size: 14px; }
            .checkmark { font-size: 48px; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="checkmark">✓</div>
              <h1>Delivery Complete!</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for choosing Prairie Mobile Fuel</p>
            </div>
            <div class="content">
              <p>Hi ${order.userName},</p>
              <p>Your fuel delivery has been completed. Here's your receipt:</p>
              
              <div class="detail-row">
                <span class="detail-label">Order ID</span>
                <span class="detail-value">#${order.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Date</span>
                <span class="detail-value">${formattedDate}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Address</span>
                <span class="detail-value">${order.address}, ${order.city}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Fuel Delivered</span>
                <span class="detail-value">${actualLitres}L ${order.fuelType.charAt(0).toUpperCase() + order.fuelType.slice(1)}${order.fillToFull ? ' (Fill to Full)' : ''}</span>
              </div>
              
              <h3 style="margin-top: 30px; color: #333;">Payment Summary</h3>
              
              <div class="detail-row">
                <span class="detail-label">Fuel (${actualLitres}L × $${pricePerLitre.toFixed(4)}/L)</span>
                <span class="detail-value">$${fuelCost.toFixed(2)}</span>
              </div>
              ${discountAmount > 0 ? `
              <div class="detail-row">
                <span class="detail-label">Member Discount</span>
                <span class="detail-value discount">-$${discountAmount.toFixed(2)}</span>
              </div>
              ` : ''}
              <div class="detail-row">
                <span class="detail-label">Delivery Fee</span>
                <span class="detail-value">${parseFloat(order.deliveryFee) === 0 ? 'FREE' : '$' + parseFloat(order.deliveryFee).toFixed(2)}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">GST (5%)</span>
                <span class="detail-value">$${parseFloat(order.gstAmount).toFixed(2)}</span>
              </div>
              <div class="detail-row total-row">
                <span><strong>Total Charged</strong></span>
                <span><strong>$${parseFloat(order.total).toFixed(2)}</strong></span>
              </div>
            </div>
            <div class="footer">
              <p>Questions? Call us at (403) 430-0390</p>
              <p>Prairie Mobile Fuel Services · Calgary, Alberta</p>
              <p style="margin-top: 15px; font-size: 12px; color: #999;">
                This receipt was sent to ${order.userEmail}
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    
    console.log(`Delivery receipt email sent for order ${order.id}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send delivery receipt email:', error);
    return { success: false, error };
  }
}

export async function sendStatusUpdateEmail(params: {
  userEmail: string;
  userName: string;
  orderId: string;
  status: string;
  title: string;
  body: string;
}) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const statusColors: Record<string, string> = {
      confirmed: '#3B82F6',
      en_route: '#10B981',
      arriving: '#F59E0B',
      fueling: '#8B5CF6',
      completed: '#22C55E',
    };
    
    const color = statusColors[params.status] || '#C67D4A';

    await client.emails.send({
      from: fromEmail,
      to: params.userEmail,
      subject: `${params.title} - Order #${params.orderId.slice(0, 8).toUpperCase()}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, ${color} 0%, ${color}CC 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .status-badge { display: inline-block; background: ${color}20; color: ${color}; padding: 8px 16px; border-radius: 20px; font-weight: 600; margin: 15px 0; }
            .footer { background: #f9f9f9; padding: 20px; text-align: center; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Prairie Mobile Fuel Services</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Order Update</p>
            </div>
            <div class="content">
              <p>Hi ${params.userName},</p>
              <div class="status-badge">${params.title}</div>
              <p>${params.body}</p>
              <p style="color: #666; font-size: 14px;">Order ID: #${params.orderId.slice(0, 8).toUpperCase()}</p>
            </div>
            <div class="footer">
              <p>Prairie Mobile Fuel Services</p>
              <p style="font-size: 12px; color: #999;">
                This is an automated notification. Please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    
    console.log(`Status update email sent to ${params.userEmail} for order ${params.orderId}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send status update email:', error);
    throw error;
  }
}

export async function sendSupportContactEmail(params: {
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
}) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    await client.emails.send({
      from: fromEmail,
      to: COMPANY_EMAILS.SUPPORT,
      replyTo: params.userEmail,
      subject: `[Support] ${params.subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #C67D4A 0%, #B8860B 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .message-box { background: #f9f9f9; border-left: 4px solid #C67D4A; padding: 15px; margin: 20px 0; }
            .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Support Message</h1>
            </div>
            <div class="content">
              <p><strong>From:</strong> ${params.userName}</p>
              <p><strong>Email:</strong> <a href="mailto:${params.userEmail}">${params.userEmail}</a></p>
              <p><strong>Subject:</strong> ${params.subject}</p>
              
              <div class="message-box">
                <p style="margin: 0; white-space: pre-wrap;">${params.message}</p>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                Reply directly to this email to respond to the customer.
              </p>
            </div>
            <div class="footer">
              <p>This message was sent from the Prairie Mobile Fuel Services app.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    
    console.log(`Support contact email sent from ${params.userEmail}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send support contact email:', error);
    throw error;
  }
}

export async function sendPriceChangeNotificationEmail(params: {
  userEmail: string;
  userName: string;
  tierName: string;
  oldMonthlyPrice: string;
  newMonthlyPrice: string;
  oldDeliveryFee: string;
  newDeliveryFee: string;
  effectiveDate: string;
}) {
  try {
    const { client, fromEmail } = await getResendClient();

    const monthlyChanged = params.oldMonthlyPrice !== params.newMonthlyPrice;
    const deliveryChanged = params.oldDeliveryFee !== params.newDeliveryFee;

    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://prairiemobilefuel.ca'
      : `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'prairiemobilefuel.ca'}`;
    const manageUrl = `${baseUrl}/app/account?tab=subscription`;

    let changesHtml = '';
    if (monthlyChanged) {
      changesHtml += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">Monthly Subscription</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-decoration: line-through; color: #999;">$${params.oldMonthlyPrice}/mo</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: 600;">$${params.newMonthlyPrice}/mo</td>
        </tr>`;
    }
    if (deliveryChanged) {
      changesHtml += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">Delivery Fee</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-decoration: line-through; color: #999;">$${params.oldDeliveryFee}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: 600;">$${params.newDeliveryFee}</td>
        </tr>`;
    }

    await client.emails.send({
      from: fromEmail,
      to: params.userEmail,
      subject: `Pricing Update for Your ${params.tierName} Subscription - Prairie Mobile Fuel`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #8B7355, #A0926B); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 22px; }
            .content { padding: 30px; }
            .btn { display: inline-block; background: #8B7355; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Subscription Pricing Update</h1>
            </div>
            <div class="content">
              <p>Hi ${params.userName},</p>
              <p>We're writing to let you know about an upcoming change to your <strong>${params.tierName}</strong> subscription pricing.</p>

              <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
                <thead>
                  <tr style="background: #f9f9f9;">
                    <th style="padding: 10px 12px; text-align: left;">Item</th>
                    <th style="padding: 10px 12px; text-align: left;">Current</th>
                    <th style="padding: 10px 12px; text-align: left;">New Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${changesHtml}
                </tbody>
              </table>

              <div style="background: #FFF8F0; border-left: 4px solid #8B7355; padding: 16px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px;"><strong>When does this take effect?</strong></p>
                <p style="margin: 8px 0 0; font-size: 14px;">The new pricing will apply at your next billing cycle. Your current rate remains in effect until then.</p>
              </div>

              <p>You have several options:</p>
              <ul style="font-size: 14px; line-height: 1.8;">
                <li><strong>Stay on your plan</strong> — no action needed, the new pricing applies automatically</li>
                <li><strong>Switch to a different tier</strong> — you can upgrade or downgrade at any time</li>
                <li><strong>Cancel your subscription</strong> — you can cancel before your next billing date</li>
              </ul>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${manageUrl}" class="btn">Manage My Subscription</a>
              </div>

              <p style="font-size: 13px; color: #666;">If you have any questions about these changes, please don't hesitate to reach out to our support team at ${COMPANY_EMAILS.SUPPORT}.</p>

              <p>Thank you for being a valued customer.</p>
              <p><strong>Prairie Mobile Fuel Services</strong></p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`Price change notification sent to ${params.userEmail} for ${params.tierName}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send price change notification email:', error);
    throw error;
  }
}
