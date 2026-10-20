// Edge Function (Deno): sends a confirmation or cancellation SMS through Brevo.
//
// Secrets (set with `supabase secrets set`, never written in the code):
//   SMS_API_KEY               Brevo API key
//   SITE_URL                  (optional) public address of the site, added to the cancellation SMS
// Provided by Supabase automatically:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Call from the app:
//   supabase.functions.invoke("envoyer-sms", { body: { rendez_vous_id, type: "confirmation" | "annulation" } })

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A confirmation SMS is only sent for an appointment created in the last minutes:
// the booking page is public, so this limits what a stranger could trigger.
const CONFIRMATION_WINDOW_MS = 15 * 60 * 1000;

/** 0612345678 -> 33612345678 (international format expected by Brevo) */
function versInternational(telephone: string): string {
  return "33" + telephone.replace(/^0/, "");
}

/** "2026-10-21" -> "mercredi 21 octobre" */
function formatJour(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** "10:00:00" -> "10 h 00" */
function formatHeure(heure: string): string {
  const [h, m] = heure.split(":");
  return `${Number(h)} h ${m}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  let payload: { rendez_vous_id?: unknown; type?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const { rendez_vous_id, type } = payload;
  if (typeof rendez_vous_id !== "string" || !UUID_RE.test(rendez_vous_id)) {
    return json({ error: "rendez_vous_id invalide" }, 400);
  }
  if (type !== "confirmation" && type !== "annulation") {
    return json({ error: "type invalide" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const smsApiKey = Deno.env.get("SMS_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !smsApiKey) {
    console.error("Missing configuration (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SMS_API_KEY)");
    return json({ error: "Service SMS non configuré" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // A cancellation can only be triggered by the signed-in manager.
  if (type === "annulation") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Connexion requise" }, 401);
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: "Connexion requise" }, 401);
  }

  // The appointment and the phone number are read here, on the server.
  const { data: rdv, error: lectureError } = await admin
    .from("rendez_vous")
    .select("id, statut, cree_le, clients(nom, telephone), prestations(nom), creneaux(date, heure_debut)")
    .eq("id", rendez_vous_id)
    .maybeSingle();
  if (lectureError) {
    console.error("Read error:", lectureError.message);
    return json({ error: "Lecture impossible" }, 500);
  }
  if (!rdv) return json({ error: "Rendez-vous introuvable" }, 404);

  // deno-lint-ignore no-explicit-any
  const { clients, prestations, creneaux } = rdv as any;

  if (type === "confirmation") {
    const age = Date.now() - new Date(rdv.cree_le).getTime();
    if (rdv.statut !== "confirme" || age > CONFIRMATION_WINDOW_MS) {
      return json({ error: "Envoi non autorisé" }, 403);
    }
  } else if (rdv.statut !== "annule") {
    return json({ error: "Ce rendez-vous n'est pas annulé" }, 409);
  }

  const jour = formatJour(creneaux.date);
  const heure = formatHeure(creneaux.heure_debut);
  const siteUrl = Deno.env.get("SITE_URL");

  const contenu =
    type === "confirmation"
      ? `RésaPro : votre rendez-vous ${prestations.nom} du ${jour} à ${heure} est confirmé.`
      : `RésaPro : votre rendez-vous ${prestations.nom} du ${jour} à ${heure} est annulé. ` +
        (siteUrl ? `Pour reprendre rendez-vous : ${siteUrl}` : "Pour reprendre rendez-vous, rendez-vous sur le site RésaPro.");

  const reponse = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: {
      "api-key": smsApiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: "RESAPRO",
      recipient: versInternational(clients.telephone),
      content: contenu,
      type: "transactional",
    }),
  });

  if (!reponse.ok) {
    // Log the status only: no phone number, no key.
    console.error("Brevo refused the SMS, status", reponse.status);
    return json({ error: "Envoi du SMS refusé" }, 502);
  }

  return json({ ok: true });
});
