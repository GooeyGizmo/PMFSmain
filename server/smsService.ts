let twilioClient: any = null;
let twilioPhoneNumber: string | null = null;

async function getTwilioCredentials(): Promise<{ accountSid: string; authToken: string; phoneNumber: string } | null> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken || !hostname) {
      return null;
    }

    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );
    
    const data = await response.json();
    const connectionSettings = data.items?.[0];

    if (!connectionSettings?.settings?.account_sid || !connectionSettings?.settings?.auth_token) {
      return null;
    }

    return {
      accountSid: connectionSettings.settings.account_sid,
      authToken: connectionSettings.settings.auth_token,
      phoneNumber: connectionSettings.settings.phone_number || connectionSettings.settings.from_phone || '',
    };
  } catch (error) {
    console.error('[SmsService] Failed to get Twilio credentials:', error);
    return null;
  }
}

async function initTwilioClient(): Promise<boolean> {
  if (twilioClient) return true;

  const creds = await getTwilioCredentials();
  if (!creds) {
    console.log('[SmsService] Twilio not configured');
    return false;
  }

  try {
    const twilio = await import('twilio');
    twilioClient = twilio.default(creds.accountSid, creds.authToken);
    twilioPhoneNumber = creds.phoneNumber;
    console.log('[SmsService] Twilio client initialized');
    return true;
  } catch (error) {
    console.error('[SmsService] Failed to initialize Twilio:', error);
    return false;
  }
}

export async function sendSmsNotification(params: {
  phone: string;
  message: string;
}): Promise<void> {
  const initialized = await initTwilioClient();
  if (!initialized) {
    throw new Error('SMS service not configured');
  }

  if (!twilioPhoneNumber) {
    throw new Error('Twilio phone number not configured');
  }

  let formattedPhone = params.phone.replace(/\D/g, '');
  if (formattedPhone.length === 10) {
    formattedPhone = '+1' + formattedPhone;
  } else if (!formattedPhone.startsWith('+')) {
    formattedPhone = '+' + formattedPhone;
  }

  try {
    await twilioClient.messages.create({
      body: params.message,
      from: twilioPhoneNumber,
      to: formattedPhone,
    });
    console.log(`[SmsService] SMS sent to ${formattedPhone}`);
  } catch (error: any) {
    console.error('[SmsService] Failed to send SMS:', error.message);
    throw error;
  }
}

export async function isSmsConfigured(): Promise<boolean> {
  const creds = await getTwilioCredentials();
  return creds !== null && !!creds.accountSid && !!creds.authToken;
}
