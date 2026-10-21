import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  try {
    const { phone, captchaToken } = await req.json();
    if (typeof phone !== 'string' || !/^\+33[67]\d{8}$/.test(phone)) {
      return json({ error: 'Indiquez un numéro mobile français valide (06 ou 07).' }, 400);
    }
    if (typeof captchaToken !== 'string' || !captchaToken || captchaToken.length > 2048) {
      return json({ error: 'Veuillez valider la protection anti-robot.' }, 400);
    }
    const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
    const hostname = Deno.env.get('TURNSTILE_HOSTNAME');
    if (!secret || !hostname) return json({ error: 'Connexion SMS non configurée.' }, 503);
    const captchaResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: captchaToken }),
    });
    const captcha = await captchaResponse.json();
    const usingTestSecret = secret === '1x0000000000000000000000000000000AA';
    const localTests = usingTestSecret
      && /^http:\/\/(kong|127\.0\.0\.1|localhost)(:|\/)/.test(Deno.env.get('SUPABASE_URL') ?? '');
    const hostedTests = usingTestSecret
      && captcha.hostname === 'example.com' && captcha.metadata?.result_with_testing_key === true;
    const testCaptcha = localTests || hostedTests;
    if (!captcha.success || (!testCaptcha && (captcha.hostname !== hostname || captcha.action !== 'connexion-client'))) {
      return json({ error: 'Vérification anti-robot refusée. Veuillez réessayer.' }, 403);
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const telephone = phone.slice(1);
    const { data: allowed, error: limitError } = await admin.rpc('autoriser_code_client', { p_telephone: telephone });
    if (limitError) return json({ error: 'Connexion indisponible.' }, 503);
    if (!allowed) return json({ error: 'Limite atteinte : 60 secondes entre deux envois et 3 codes par heure. Patientez avant de réessayer.' }, 429);

    // Admin provisioning does not confirm the phone. Public sign-ups stay closed.
    const { error: creationError } = await admin.auth.admin.createUser({ phone, phone_confirm: false });
    if (creationError && creationError.code !== 'phone_exists') {
      return json({ error: 'Connexion indisponible.' }, 503);
    }
    // Auth routes OTP requests for unconfirmed users through signup, which is
    // deliberately disabled. Resend the confirmation of our admin-created user
    // instead; verifyOtp(type: 'sms') completes the same native Auth flow.
    let otpResult = creationError
      ? await admin.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } })
      : await admin.auth.resend({ phone, type: 'sms' });
    if (otpResult.error?.code === 'signup_disabled') {
      otpResult = await admin.auth.resend({ phone, type: 'sms' });
    }
    const otpError = otpResult.error;
    if (otpError) return json({ error: 'Envoi impossible. Patientez avant de réessayer.' }, 429);

    // The SQL hook deposits a real OTP only after consuming our CAPTCHA permit.
    // Native Supabase test numbers bypass the hook and never reach Brevo.
    const { data: delivery, error: readError } = await admin.from('envois_codes_clients')
      .select('code').eq('telephone', telephone).single();
    const { error: clearError } = await admin.from('envois_codes_clients')
      .update({ code: null, autorise_jusqua: null }).eq('telephone', telephone);
    if (readError || clearError) return json({ error: 'Envoi impossible.' }, 503);
    const testPhoneNumbers = (Deno.env.get('TEST_PHONE_NUMBERS') ?? '').split(',')
      .map((number) => number.trim()).filter((number) => /^33[67]\d{8}$/.test(number));
    const testPhone = testCaptcha && testPhoneNumbers.includes(telephone);
    if (!delivery?.code && !testPhone) return json({ error: 'Service SMS non configuré : hook Auth requis.' }, 503);
    if (delivery?.code) {
      const apiKey = Deno.env.get('SMS_API_KEY');
      if (!apiKey) return json({ error: 'Service SMS non configuré.' }, 503);
      const sms = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'RESAPRO', recipient: telephone,
          content: `RésaPro : votre code de connexion est ${delivery.code}. Ne le partagez pas.`,
          type: 'transactional' }),
      });
      if (!sms.ok) return json({ error: 'Envoi du SMS impossible. Réessayez plus tard.' }, 502);
    }
    return json({ ok: true });
  } catch {
    // Never log Auth responses, OTPs, phone numbers or secrets.
    return json({ error: 'Service de connexion indisponible. Veuillez réessayer.' }, 503);
  }
});
