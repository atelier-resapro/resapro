-- Phone accounts are provisioned by the CAPTCHA gateway, with sign-ups closed.
alter table public.clients add column user_id uuid unique references auth.users(id) on delete set null;

create policy "Le client lit sa fiche"
on public.clients for select to authenticated
using (user_id = (select auth.uid()) and exists (
  select 1 from public.profils where user_id = (select auth.uid()) and role = 'client'
));

-- No identity or role is taken from user_metadata. Auth confirms the phone first.
create function public.rattacher_client_sms() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tel text;
begin
  if new.phone_confirmed_at is null or new.phone !~ '^\+?33[67][0-9]{8}$' then
    return new;
  end if;
  if exists (select 1 from public.profils where user_id = new.id and role <> 'client') then
    return new; -- Never change a staff profile.
  end if;
  v_tel := public.normaliser_telephone('+' || ltrim(new.phone, '+'));
  if exists (select 1 from public.clients where user_id = new.id and telephone <> v_tel) then
    raise exception 'Le changement de téléphone nécessite de contacter le salon.';
  end if;
  insert into public.clients (nom, telephone, user_id)
  values ('Client', v_tel, new.id)
  on conflict (telephone) do update set user_id = excluded.user_id
  where clients.user_id is null or clients.user_id = excluded.user_id;
  if not found then
    raise exception 'Cette fiche est déjà rattachée à un compte. Contactez le salon.';
  end if;
  insert into public.profils (user_id, role) values (new.id, 'client')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.rattacher_client_sms() from public, anon, authenticated;
create trigger rattacher_client_sms after insert or update of phone, phone_confirmed_at
on auth.users for each row execute function public.rattacher_client_sms();

-- Internal delivery gate. No browser role (including manager) can access OTPs.
-- At most 3 requests in a rolling hour, at least 60 seconds between requests.
create table public.envois_codes_clients (
  telephone text primary key check (telephone ~ '^33[67][0-9]{8}$'),
  demandes timestamptz[] not null default '{}',
  autorise_jusqua timestamptz,
  code text
);
alter table public.envois_codes_clients enable row level security;
revoke all on public.envois_codes_clients from public, anon, authenticated;
grant all on public.envois_codes_clients to service_role;
create policy "Le serveur gere les envois" on public.envois_codes_clients
for all to service_role using (true) with check (true);

create function public.autoriser_code_client(p_telephone text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_demandes timestamptz[];
  v_now timestamptz := clock_timestamp();
begin
  -- Data retention: expired counters and pending codes are removed on requests.
  delete from public.envois_codes_clients
  where demandes[array_length(demandes, 1)] < v_now - interval '24 hours';
  insert into public.envois_codes_clients (telephone) values (p_telephone)
  on conflict do nothing;
  select demandes into v_demandes from public.envois_codes_clients
  where telephone = p_telephone for update;
  select coalesce(array_agg(d), '{}') into v_demandes
  from unnest(v_demandes) d where d > v_now - interval '1 hour';
  if cardinality(v_demandes) >= 3 or exists (
    select 1 from unnest(v_demandes) d where d > v_now - interval '60 seconds'
  ) then return false; end if;
  update public.envois_codes_clients
  set demandes = array_append(v_demandes, v_now),
      autorise_jusqua = v_now + interval '30 seconds', code = null
  where telephone = p_telephone;
  return true;
end;
$$;
revoke all on function public.autoriser_code_client(text) from public, anon, authenticated;
grant execute on function public.autoriser_code_client(text) to service_role;

-- Supabase Send SMS hook. A direct /auth/v1/otp call cannot send a real SMS
-- without a short-lived permit issued after server-side CAPTCHA verification.
create function public.sms_client_auth_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.envois_codes_clients
  set code = event->'sms'->>'otp', autorise_jusqua = null
  where telephone = ltrim(event->'user'->>'phone', '+')
    and autorise_jusqua > clock_timestamp();
  if not found then
    return '{"error":{"http_code":403,"message":"Veuillez utiliser le formulaire de connexion client."}}'::jsonb;
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.sms_client_auth_hook(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.sms_client_auth_hook(jsonb) to supabase_auth_admin;
