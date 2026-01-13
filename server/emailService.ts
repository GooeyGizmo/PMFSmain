import { Resend } from 'resend';

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

async function getResendClient() {
  const { apiKey } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: connectionSettings.settings.from_email || 'orders@prairiemobilefuel.ca'
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
    
    const verificationUrl = `https://prairiemobilefuel.ca/verify-email?token=${user.verificationToken}`;

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
