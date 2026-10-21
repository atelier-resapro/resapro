# RésaPro — instructions pour l'agent

## Projet
Application de prise de rendez-vous pour un salon de coiffure.
Rôles : gérant, employé, client. Public France : textes en français, RGPD.

## Technologies
React + TypeScript + Vite. Supabase (PostgreSQL, Auth, Edge Functions).

## Commandes
- npm run dev : lancer l'application
- npm run test : tests unitaires
- npm run test:e2e : tests de bout en bout
- supabase db push : appliquer les migrations

## Règles
- Aucune clé secrète dans le code ni dans le navigateur. Les secrets vont dans les secrets Supabase.
- Toute table a une règle d'accès (RLS) activée et testée.
- Toute modification de la base passe par une nouvelle migration dans supabase/migrations.
- Les règles métier sont vérifiées côté serveur ou dans la base, jamais seulement dans la page.
- Une branche par évolution. Ne jamais pousser directement sur main.
- Avant de dire « terminé » : lancer les tests et montrer le résultat.

## Architecture

### Security model (the core design constraint)

- Auth sign-ups are disabled. The manager account is created by hand in the Supabase dashboard; employees are invited by the manager through the `inviter-employe` Edge Function (service role, server side).
- Clients connect at `/client/connexion` with a French mobile and a Supabase Auth SMS OTP. `demander-code-client` verifies Turnstile server-side, reserves an atomic quota (60 seconds between requests, 3 per rolling hour), provisions an unconfirmed phone account with the Admin API, then requests the Auth OTP. Public sign-ups remain disabled; the phone provider is enabled. `sms_client_auth_hook` (Send SMS hook, Auth admin only) refuses real OTP delivery without the CAPTCHA permit. The gateway sends the deposited OTP through Brevo and clears it; native local test numbers never send SMS. The Auth trigger links `clients.user_id` and creates the `client` profile only once `phone_confirmed_at` is set. It preserves existing names and staff roles. Clients can read their own linked client row only; `envois_codes_clients` is server-only. Do not enable global Auth CAPTCHA (it would also affect staff password sign-ins). See README for setup and tests.
- Rights come from `profils` (`user_id` → `auth.users`, `role` = `gerant` | `employe` | `client`), **not** from being `authenticated`. A signed-in account without a profile sees nothing.
  - Helpers for policies (`security definer`, granted to `authenticated` only): `est_gerant_connecte()` and `mon_employe_id()` (the active employee row linked to `auth.uid()`). Use them as `(select public.est_gerant_connecte())` in policies.
  - Manager: full access to every table. Employee: read only on own `rendez_vous` and `horaires`, own `employes` row, own profile, active `prestations`; never `clients`.
  - `mon_agenda(p_debut, p_fin)` → the employee's confirmed appointments with the client's **name only** (no phone).
  - Page guards (`GerantLayout`, `EmployeLayout`) only route by role; RLS is what protects the data.
- The `anon` role can only `select` active `prestations`. Everything else the public does goes through `security definer` SQL functions that expose only the minimum:
  - `creneaux_libres(p_date)` → free, open, future slots (id + time only).
  - `reserver(...)` → the only way to create an appointment. Validates name and French phone, normalises the phone to `0612345678`, upserts the client by phone, inserts the appointment.
  - `recapitulatif(p_rendez_vous_id)` → service/day/time/price for the confirmation page, never client data.
  - `creneaux_libres_employes(p_date, p_prestation_id, p_employe_id?)` → free start times (every 15 min) per employee, from `horaires`, `fermetures` and appointments.
  - `reserver_employe(...)` → booking with an employee and a start; the start must be returned by `creneaux_libres_employes`. With `p_employe_id` null ("Indifférent"), it picks the free employee with the fewest confirmed appointments that day (then by name), and tries the next one if that one was just taken.
  - `employes_prestation(p_prestation_id)` → active employees who do an active service (id + name only), for the hairdresser choice.
  - `recapitulatif` also returns the hairdresser's name (`coiffeur`).
- New public features must follow the same pattern (a narrow `security definer` function with `revoke all ... from public` + `grant execute ... to anon, authenticated`), not a new `anon` RLS policy that exposes rows.
- Double booking is prevented by the exclusion constraint `rendez_vous_sans_chevauchement` (no two `confirme` appointments overlapping for the same employee, `btree_gist`); the old partial unique index `rendez_vous_un_confirme_par_creneau` is still there for the slot system. The booking functions turn violations into a friendly message.
- `normaliser_telephone(text)` is an internal helper (no grant) used by both booking functions.
- Transition: the old slot system (`creneaux`, `creneau_id`, `creneaux_libres`, `reserver`) still works, on the manager's agenda (`employes.est_gerant`), until the pages use the new functions. The public booking page already uses the new ones; the manager pages do not yet. Closing a day through `creneaux.ouvert` does not create a `fermetures` row.
- "Now" in SQL is salon time: `now() at time zone 'Europe/Paris'`.

### Data model

`clients` (unique `telephone`), `prestations` (`active` soft-delete flag), `creneaux` (one row per `date` + `heure_debut`, `ouvert` flag; closing a day = setting `ouvert = false` on all its slots), `rendez_vous` (`statut` is `'confirme'` or `'annule'`; cancelling is an update, not a delete; `employe_id`, `debut`, `fin` timestamptz; `creneau_id` only for the old system).
`profils` (role of each account), `employes` (`actif`, `user_id` → `auth.users`, one `est_gerant`), `horaires` (`jour_semaine` 1 = Monday like `isodow`, several ranges per day allowed), `employe_prestations`, `fermetures` (`employe_id` null = whole salon).

### Tests

Database tests are pgTAP files in `supabase/tests`, run with `supabase test db` (needs Docker). They create their own fixtures (including `auth.users` rows) and end with `rollback`, so they can also be pasted into the SQL editor of the remote project. Roles are simulated with `set local role authenticated` + `set_config('request.jwt.claims', '{"sub":"…"}', true)`.

### Duplicated rules (keep in sync)

- Phone validation/normalisation exists in both `reserver` (SQL) and `src/lib/phone.ts`.
- Day/time formatting exists in `src/lib/dates.ts` and again inside the Edge Function.
- Open days are Tuesday–Saturday in `src/lib/dates.ts` (`estJourOuvrable`) and in `seed.sql`.

### SMS (`supabase/functions/envoyer-sms`)

Called via `envoyerSms()` in `src/lib/sms.ts`, which never throws: an SMS failure must never block a booking or cancellation. `verify_jwt = false`, so the function checks callers itself: `confirmation` only for a `confirme` appointment created less than 15 minutes ago (the booking page is public); `annulation` and `deplacement` require a valid manager JWT or the owning client. A database trigger records two server-only delivery rows in `notifications_rendez_vous` for each actual change (client and employee, with old/new start times). The service-only RPC `reclamer_notifications_rendez_vous` atomically claims them, with a five-minute lease and at most three attempts per recipient. Successful recipients are not retried. The UI invokes the function after the write and warns on partial failures; retries require another invocation, no scheduled worker is configured. The manager sets employee mobiles on `/gerant/employes`. Delivery snapshots are pruned after 30 days on the next change. Phone numbers and `SMS_API_KEY` stay server-side during delivery; logs must not contain phone numbers or keys.

### Frontend

- Routes in `src/App.tsx`. Public: `/`, `/reserver`, `/confirmation/:id`. Manager pages under `/gerant/*` are lazy-loaded and wrapped by `GerantLayout`, which redirects to `/gerant/connexion` when there is no session (`useSession`).
- Data access: read hooks in `src/hooks/` wrap `supabase.from(...)`/`supabase.rpc(...)` in `useQuery`; writes are done in the pages/components, followed by `invalidateQueries`. Query key conventions: `["prestations", ...]`, `["creneaux-libres", date]`, `["recapitulatif", id]`, and every manager query starts with `"gerant"` (so `invalidateQueries({ queryKey: ["gerant"] })` refreshes them all). Any write that changes slot availability must also invalidate `["creneaux-libres"]`.
- Dates are handled as `"YYYY-MM-DD"` strings in local time; use `toISODate`/`fromISODate` from `src/lib/dates.ts`, never `toISOString()` (it shifts the day).
- `@/` is an alias for `src/`. Use `cn()` from `src/lib/utils.ts` for class names.
