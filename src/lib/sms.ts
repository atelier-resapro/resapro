/**
 * Sends the SMS straight from the browser with the SMS service key.
 * The key comes from a VITE_ variable, so Vite copies it into the published JavaScript.
 */
const SMS_API_KEY = import.meta.env.VITE_SMS_API_KEY;

export async function envoyerSms(rendezVousId: string, type: "confirmation" | "annulation" | "deplacement"): Promise<boolean> {
  try {
    const reponse = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
      method: "POST",
      headers: { "api-key": SMS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: "RESAPRO", type: "transactional", tag: `${type}-${rendezVousId}` }),
    });
    return reponse.ok;
  } catch (e) {
    console.warn("SMS not sent:", e);
    return false;
  }
}
