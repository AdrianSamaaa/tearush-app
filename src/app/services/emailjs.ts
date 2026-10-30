/**
 * Sends an email through EmailJS (https://www.emailjs.com/docs/rest-api/send/).
 * Used in on-device mode for verification codes.
 */
export const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';

/**
 * Template variables for a verification email. Both our names (to_email, code) and the ones
 * EmailJS's built-in "One-Time Password" template uses (email, passcode, time) are filled,
 * so either template style works. Keep in sync with server/src/mailer.js.
 */
export function verificationParams(email: string, name: string, code: string, validMinutes = 10): Record<string, string> {
  const expires = new Date(Date.now() + validMinutes * 60_000).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  });
  const first = name.split(' ')[0];
  return { to_email: email, email, to_name: first, name: first, code, passcode: code, time: expires, app_name: 'TeaRush' };
}

export interface EmailJsKeys {
  serviceId: string;
  templateId: string;
  publicKey: string;
  /** Optional. Only needed if "Use Private Key" is turned on in EmailJS → Account → Security. */
  privateKey?: string;
}

export async function sendEmailJs(keys: EmailJsKeys, params: Record<string, string>): Promise<void> {
  let res: Response;
  try {
    res = await fetch(EMAILJS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: keys.serviceId,
        template_id: keys.templateId,
        user_id: keys.publicKey,
        template_params: params,
        ...(keys.privateKey ? { accessToken: keys.privateKey } : {}),
      }),
    });
  } catch {
    throw new Error("Couldn't reach EmailJS. Check your internet connection.");
  }
  if (!res.ok) throw new Error(`EmailJS said: ${(await res.text()) || `HTTP ${res.status}`}`);
}
