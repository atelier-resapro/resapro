// Edge Function (Deno): sends appointment SMS through Brevo, server-side only.
//
// Secrets (set with `supabase secrets set`, never written in the code):
//   SMS_API_KEY               Brevo API key
//   SITE_URL                  optional public booking URL for cancellations
// Provided by Supabase automatically:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Call from the app:
//   body: { rendez_vous_id, type: "confirmation" | "annulation" | "deplacement" }

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

/** 0612345678 -> 33612345678 (international format expected by Brevo) */
function versInternational(telephone: string): string {
  return "33" + telephone.replace(/^0/, "");
}

/** Start of the appointment -> "mercredi 21 octobre" (salon time) */
function formatJour(debut: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  }).format(debut);
}

/** Start of the appointment -> "10 h 00" (salon time) */
function formatHeure(debut: Date): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Paris",
  }).formatToParts(debut);
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${Number(h)} h ${m}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  let payload: { rendez_vous_id?: unknown; type?: unknown };
  try {
    payload = await req.json();
    if (!payload || typeof payload !== "object") return json({ error: "Requête invalide" }, 400);
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const { rendez_vous_id, type } = payload;
  if (typeof rendez_vous_id !== "string" || !UUID_RE.test(rendez_vous_id)) {
    return json({ error: "rendez_vous_id invalide" }, 400);
  }
  if (type !== "confirmation" && type !== "annulation" && type !== "deplacement") {
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

  // The database records real changes, including their old/new start times.
  // The caller supplies neither recipients nor message content.
  if (type !== "confirmation") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Connexion requise" }, 401);
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: "Connexion requise" }, 401);
    const { data: profil } = await admin.from("profils").select("role").eq("user_id", data.user.id).maybeSingle();
    if (profil?.role !== "gerant" && profil?.role !== "client") return json({ error: "Envoi non autorisé" }, 403);
    // Check ownership even when no pending event exists (no information leak).
    if (profil.role === "client") {
      const { data: owned } = await admin.from("rendez_vous")
        .select("clients!inner(user_id)").eq("id", rendez_vous_id)
        .eq("clients.user_id", data.user.id).maybeSingle();
      if (!owned) return json({ error: "Envoi non autorisé" }, 403);
    }
    const { data: notifications, error: claimError } = await admin.rpc("reclamer_notifications_rendez_vous", {
      p_rendez_vous_id: rendez_vous_id, p_type: type, p_user_id: data.user.id,
    });
    if (claimError) return json({ error: "Lecture impossible" }, 500);
    const results = await Promise.all((notifications ?? []).map(async (n: {
      id: string; reservation: string; telephone: string | null; destinataire: string;
      client_nom: string; prestation: string; ancien_debut: string; debut: string;
    }) => {
      if (!n.telephone) return false;
      const ancien = `${formatJour(new Date(n.ancien_debut))} à ${formatHeure(new Date(n.ancien_debut))}`;
      const nouveau = `${formatJour(new Date(n.debut))} à ${formatHeure(new Date(n.debut))}`;
      const sujet = n.destinataire === "client" ? "votre rendez-vous" : `le rendez-vous de ${n.client_nom}`;
      const siteUrl = Deno.env.get("SITE_URL");
      const reprise = type === "annulation" && n.destinataire === "client"
        ? (siteUrl ? ` Pour reprendre rendez-vous : ${siteUrl}` : " Pour reprendre rendez-vous, rendez-vous sur le site RésaPro.")
        : "";
      const content = type === "deplacement"
        ? `RésaPro : ${sujet} ${n.prestation} du ${ancien} est déplacé au ${nouveau}.`
        : `RésaPro : ${sujet} ${n.prestation} du ${ancien} est annulé.${reprise}`;
      try {
        const response = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
          method: "POST", signal: AbortSignal.timeout(10000),
          headers: { "api-key": smsApiKey, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ sender: "RESAPRO", recipient: versInternational(n.telephone), content, type: "transactional" }),
        });
        if (!response.ok) { console.error("Brevo refused SMS, status", response.status); return false; }
        const { error: saveError } = await admin.from("notifications_rendez_vous")
          .update({ envoye_le: new Date().toISOString() }).eq("id", n.id).eq("reservation", n.reservation);
        return !saveError;
      } catch {
        console.error("SMS delivery unavailable");
        return false;
      }
    }));
    if (results.some(ok => !ok)) return json({ error: "Certains SMS n'ont pas pu être envoyés" }, 502);
    // Empty claims may also mean another call is in progress or retries exhausted.
    const { data: pending, error: pendingError } = await admin.from("notifications_rendez_vous")
      .select("id").eq("rendez_vous_id", rendez_vous_id).eq("type", type).is("envoye_le", null).limit(1);
    if (pendingError || pending?.length) return json({ error: "Des SMS restent en attente" }, 503);
    return json({ ok: true });
  }

  // The database claims the confirmation once: a confirmed booking made in the
  // last 15 minutes, never confirmed before. The phone is read on the server.
  // Unknown, old, cancelled or already confirmed: same answer, no information leak.
  const { data: confirmations, error: claimError } = await admin.rpc("reclamer_confirmation_sms", {
    p_rendez_vous_id: rendez_vous_id,
  });
  if (claimError) {
    console.error("Confirmation claim failed");
    return json({ error: "Lecture impossible" }, 500);
  }
  const rdv = (confirmations as { telephone: string; prestation: string; debut: string }[] | null)?.[0];
  if (!rdv) return json({ error: "Envoi non autorisé" }, 403);

  // The start works for both systems (old slots and employees).
  const jour = formatJour(new Date(rdv.debut));
  const heure = formatHeure(new Date(rdv.debut));
  const contenu = `RésaPro : votre rendez-vous ${rdv.prestation} du ${jour} à ${heure} est confirmé.`;

  const reponse = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: {
      "api-key": smsApiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: "RESAPRO",
      recipient: versInternational(rdv.telephone),
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
