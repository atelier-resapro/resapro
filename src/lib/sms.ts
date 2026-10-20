import { supabase } from "@/integrations/supabase/client";

/**
 * Asks the `envoyer-sms` Edge Function to text the client.
 * A sending error must NEVER block a booking or a cancellation:
 * this function never throws, it only tells whether it worked.
 */
export async function envoyerSms(rendezVousId: string, type: "confirmation" | "annulation"): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke("envoyer-sms", {
      body: { rendez_vous_id: rendezVousId, type },
    });
    if (error) {
      console.warn("SMS not sent:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("SMS not sent:", e);
    return false;
  }
}
