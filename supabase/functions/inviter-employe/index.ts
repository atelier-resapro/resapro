// Edge Function (Deno): the manager invites an employee by e-mail.
// The employee receives a link, chooses a password and can then sign in.
//
// Secrets (set with `supabase secrets set`, never written in the code):
//   SITE_URL                  public address of the site; the invitation link leads to SITE_URL/mot-de-passe
// Provided by Supabase automatically:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Call from the app (manager only):
//   supabase.functions.invoke("inviter-employe", { body: { employe_id, email } })

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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const siteUrl = Deno.env.get("SITE_URL");
  if (!supabaseUrl || !serviceRoleKey || !siteUrl) {
    console.error("Missing configuration (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SITE_URL)");
    return json({ error: "Invitation non configurée" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Only a signed-in manager can invite.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Connexion requise" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Connexion requise" }, 401);

  const { data: profil } = await admin.from("profils").select("role").eq("user_id", auth.user.id).maybeSingle();
  if (profil?.role !== "gerant") return json({ error: "Réservé au gérant" }, 403);

  let payload: { employe_id?: unknown; email?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const { employe_id } = payload;
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (typeof employe_id !== "string" || !UUID_RE.test(employe_id)) {
    return json({ error: "employe_id invalide" }, 400);
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: "Adresse e-mail invalide." }, 400);
  }

  const { data: employe, error: lectureError } = await admin
    .from("employes")
    .select("id, actif, user_id")
    .eq("id", employe_id)
    .maybeSingle();
  if (lectureError) {
    console.error("Read error:", lectureError.message);
    return json({ error: "Lecture impossible" }, 500);
  }
  if (!employe || !employe.actif) return json({ error: "Employé introuvable ou inactif." }, 404);
  if (employe.user_id) return json({ error: "Cet employé a déjà un compte." }, 409);

  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl.replace(/\/$/, "")}/mot-de-passe`,
  });
  if (inviteError || !invite.user) {
    // Log the code only: no e-mail address.
    console.error("Invitation refused:", inviteError?.status, inviteError?.code);
    if (inviteError?.code === "email_exists" || inviteError?.status === 422) {
      return json({ error: "Cette adresse e-mail a déjà un compte." }, 409);
    }
    return json({ error: "L'invitation n'a pas pu être envoyée." }, 502);
  }
  const userId = invite.user.id;

  // Link the account to the employee (only if still free), then give the role.
  const { data: lie, error: lienError } = await admin
    .from("employes")
    .update({ user_id: userId })
    .eq("id", employe_id)
    .is("user_id", null)
    .select("id");
  const { error: profilError } =
    !lienError && lie?.length ? await admin.from("profils").insert({ user_id: userId, role: "employe" }) : { error: null };

  if (lienError || !lie?.length || profilError) {
    console.error("Link error:", lienError?.message ?? profilError?.message ?? "employee already linked");
    // Deleting the account also clears employes.user_id and the profile (foreign keys).
    await admin.auth.admin.deleteUser(userId);
    return json({ error: "L'invitation n'a pas pu être enregistrée." }, 500);
  }

  return json({ ok: true });
});
