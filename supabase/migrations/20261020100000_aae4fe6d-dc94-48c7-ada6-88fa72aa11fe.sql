-- Several employees: employees, working hours, skills and closures.
-- An appointment now has an employee, a start and an end. Free slots are
-- computed from working hours, closures and appointments.
-- The old slot system (creneaux, creneau_id, creneaux_libres, reserver) keeps
-- working in parallel, on the manager's agenda, until the pages are migrated.

create extension if not exists btree_gist with schema extensions;

-- Tables

create table public.employes (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(btrim(nom)) between 2 and 80),
  telephone text check (telephone ~ '^0[1-9][0-9]{8}$'),
  actif boolean not null default true,
  user_id uuid unique references auth.users(id) on delete set null,
  -- Only identifies the manager for the old slot system; grants no rights.
  est_gerant boolean not null default false,
  cree_le timestamptz default now()
);

create unique index employes_un_seul_gerant
  on public.employes (est_gerant)
  where est_gerant;

create table public.horaires (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employes(id) on delete cascade,
  -- ISO day of week, like extract(isodow ...): 1 = Monday, 7 = Sunday.
  jour_semaine smallint not null check (jour_semaine between 1 and 7),
  heure_debut time not null,
  heure_fin time not null,
  check (heure_fin > heure_debut)
);

create index horaires_employe_jour_idx on public.horaires (employe_id, jour_semaine);

create table public.employe_prestations (
  employe_id uuid not null references public.employes(id) on delete cascade,
  prestation_id uuid not null references public.prestations(id) on delete cascade,
  primary key (employe_id, prestation_id)
);

create index employe_prestations_prestation_id_idx on public.employe_prestations (prestation_id);

create table public.fermetures (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  -- null = the whole salon is closed that day.
  employe_id uuid references public.employes(id) on delete cascade,
  motif text,
  unique nulls not distinct (date, employe_id)
);

create index fermetures_employe_id_idx on public.fermetures (employe_id);

-- Row Level Security: signed-in user = the manager (sign-ups are disabled).
-- The public goes through security definer functions only.
alter table public.employes enable row level security;
alter table public.horaires enable row level security;
alter table public.employe_prestations enable row level security;
alter table public.fermetures enable row level security;

create policy "Le gerant gere les employes"
  on public.employes for all
  to authenticated
  using (true) with check (true);

create policy "Le gerant gere les horaires"
  on public.horaires for all
  to authenticated
  using (true) with check (true);

create policy "Le gerant gere les prestations des employes"
  on public.employe_prestations for all
  to authenticated
  using (true) with check (true);

create policy "Le gerant gere les fermetures"
  on public.fermetures for all
  to authenticated
  using (true) with check (true);

-- The manager is the first employee, linked to the oldest account if any.
-- Rename them from the dashboard.
insert into public.employes (nom, est_gerant, user_id)
values ('Gérant', true, (select id from auth.users order by created_at limit 1));

-- Same hours as the current slots: Tuesday to Saturday, 9:00 to 18:00.
insert into public.horaires (employe_id, jour_semaine, heure_debut, heure_fin)
select e.id, j, '09:00', '18:00'
from public.employes e
cross join generate_series(2, 6) as j
where e.est_gerant;

insert into public.employe_prestations (employe_id, prestation_id)
select e.id, p.id
from public.employes e
cross join public.prestations p
where e.est_gerant;

-- A day whose slots are all closed becomes a salon closure.
insert into public.fermetures (date)
select c.date
from public.creneaux c
group by c.date
having not bool_or(c.ouvert);

-- Appointments: employee, start and end

alter table public.rendez_vous
  add column employe_id uuid references public.employes(id) on delete restrict,
  add column debut timestamptz,
  add column fin timestamptz;

-- Existing appointments go to the manager. Their end is the service duration,
-- cut at the start of the next confirmed appointment so that old bookings
-- never overlap.
with base as (
  select r.id,
         r.statut,
         (c.date + c.heure_debut) at time zone 'Europe/Paris' as debut,
         make_interval(mins => p.duree_minutes) as duree
  from public.rendez_vous r
  join public.creneaux c on c.id = r.creneau_id
  join public.prestations p on p.id = r.prestation_id
),
suivant as (
  select id, lead(debut) over (order by debut) as debut_suivant
  from base
  where statut = 'confirme'
)
update public.rendez_vous r
set employe_id = (select id from public.employes where est_gerant),
    debut = b.debut,
    -- least() ignores null: no next appointment = full duration.
    fin = least(b.debut + b.duree, s.debut_suivant)
from base b
left join suivant s on s.id = b.id
where r.id = b.id;

alter table public.rendez_vous
  alter column employe_id set not null,
  alter column debut set not null,
  alter column fin set not null,
  alter column creneau_id drop not null,
  add constraint rendez_vous_fin_apres_debut check (fin > debut);

-- No two confirmed appointments overlapping for the same employee,
-- even if two people book at the same second.
alter table public.rendez_vous
  add constraint rendez_vous_sans_chevauchement
  exclude using gist (employe_id with =, tstzrange(debut, fin) with &&)
  where (statut = 'confirme');

create index rendez_vous_employe_debut_idx on public.rendez_vous (employe_id, debut);

-- Phone: 06 12 34 56 78, 0612345678, +33612345678, 0033612345678 -> 0612345678.
-- Internal helper, used by the booking functions only.
create or replace function public.normaliser_telephone(p_telephone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tel text := regexp_replace(coalesce(p_telephone, ''), '[\s.-]', '', 'g');
begin
  if v_tel ~ '^\+33[1-9][0-9]{8}$' then
    v_tel := '0' || substr(v_tel, 4);
  elsif v_tel ~ '^0033[1-9][0-9]{8}$' then
    v_tel := '0' || substr(v_tel, 5);
  end if;
  if v_tel !~ '^0[1-9][0-9]{8}$' then
    raise exception 'Numéro de téléphone invalide. Exemple : 06 12 34 56 78.';
  end if;
  return v_tel;
end;
$$;

revoke all on function public.normaliser_telephone(text) from public, anon, authenticated;

-- Old slot system, same signatures, now on the manager's agenda.

-- A slot is taken when it falls inside a confirmed appointment of the manager.
create or replace function public.creneaux_libres(p_date date)
returns table (creneau_id uuid, heure_debut time)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.heure_debut
  from public.creneaux c
  where c.date = p_date
    and c.ouvert
    and not exists (
      select 1
      from public.rendez_vous r
      join public.employes e on e.id = r.employe_id and e.est_gerant
      where r.statut = 'confirme'
        and (c.date + c.heure_debut) at time zone 'Europe/Paris' >= r.debut
        and (c.date + c.heure_debut) at time zone 'Europe/Paris' < r.fin
    )
    -- no slot in the past (salon time)
    and (c.date + c.heure_debut) > (now() at time zone 'Europe/Paris')
  order by c.heure_debut;
$$;

create or replace function public.reserver(
  p_nom text,
  p_telephone text,
  p_prestation_id uuid,
  p_creneau_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text := btrim(coalesce(p_nom, ''));
  v_tel text;
  v_creneau public.creneaux%rowtype;
  v_duree interval;
  v_debut timestamptz;
  v_gerant_id uuid;
  v_client_id uuid;
  v_rdv_id uuid;
begin
  -- Name
  if char_length(v_nom) < 2 or char_length(v_nom) > 80 then
    raise exception 'Merci d''indiquer votre nom (2 caractères minimum).';
  end if;

  v_tel := public.normaliser_telephone(p_telephone);

  -- Service must exist and be active
  select make_interval(mins => duree_minutes) into v_duree
  from public.prestations where id = p_prestation_id and active;
  if not found then
    raise exception 'Cette prestation n''est plus proposée.';
  end if;

  -- Slot must exist, be open and not be in the past
  select * into v_creneau from public.creneaux where id = p_creneau_id;
  if not found or not v_creneau.ouvert then
    raise exception 'Ce créneau n''est plus disponible. Choisissez-en un autre.';
  end if;
  if (v_creneau.date + v_creneau.heure_debut) <= (now() at time zone 'Europe/Paris') then
    raise exception 'Ce créneau est déjà passé. Choisissez-en un autre.';
  end if;
  v_debut := (v_creneau.date + v_creneau.heure_debut) at time zone 'Europe/Paris';

  select id into v_gerant_id from public.employes where est_gerant;
  if not found then
    raise exception 'Ce créneau n''est plus disponible. Choisissez-en un autre.';
  end if;

  -- Client: created or found by phone, name updated
  insert into public.clients (nom, telephone)
  values (v_nom, v_tel)
  on conflict (telephone) do update set nom = excluded.nom
  returning id into v_client_id;

  -- Appointment: the unique index (same slot) and the exclusion constraint
  -- (overlap) refuse a second confirmed appointment, even at the same second.
  begin
    insert into public.rendez_vous (client_id, prestation_id, creneau_id, employe_id, debut, fin)
    values (v_client_id, p_prestation_id, p_creneau_id, v_gerant_id, v_debut, v_debut + v_duree)
    returning id into v_rdv_id;
  exception
    when unique_violation or exclusion_violation then
      raise exception 'Ce créneau vient d''être réservé. Choisissez-en un autre.';
  end;

  return v_rdv_id;
end;
$$;

-- Works for both systems: day and time come from the start (salon time).
create or replace function public.recapitulatif(p_rendez_vous_id uuid)
returns table (prestation text, jour date, heure time, prix numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.nom,
         (r.debut at time zone 'Europe/Paris')::date,
         (r.debut at time zone 'Europe/Paris')::time,
         p.prix
  from public.rendez_vous r
  join public.prestations p on p.id = r.prestation_id
  where r.id = p_rendez_vous_id
    and r.statut = 'confirme';
$$;

-- New system

-- Free start times for a service on a day, every 15 minutes, per employee.
-- Returns ONLY the employee id and name and the start: no client data.
create or replace function public.creneaux_libres_employes(
  p_date date,
  p_prestation_id uuid,
  p_employe_id uuid default null
)
returns table (employe_id uuid, employe_nom text, debut timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct e.id, e.nom, g.heure_locale at time zone 'Europe/Paris'
  from public.prestations p
  join public.employe_prestations ep on ep.prestation_id = p.id
  join public.employes e on e.id = ep.employe_id
  join public.horaires h
    on h.employe_id = e.id
   and h.jour_semaine = extract(isodow from p_date)
  cross join lateral generate_series(
    p_date + h.heure_debut,
    p_date + h.heure_fin - make_interval(mins => p.duree_minutes),
    interval '15 minutes'
  ) as g (heure_locale)
  where p.id = p_prestation_id
    and p.active
    and e.actif
    and (p_employe_id is null or e.id = p_employe_id)
    -- salon or employee closed that day
    and not exists (
      select 1
      from public.fermetures f
      where f.date = p_date
        and (f.employe_id is null or f.employe_id = e.id)
    )
    -- no slot in the past (salon time)
    and g.heure_locale > (now() at time zone 'Europe/Paris')
    and not exists (
      select 1
      from public.rendez_vous r
      where r.employe_id = e.id
        and r.statut = 'confirme'
        and tstzrange(r.debut, r.fin) && tstzrange(
          g.heure_locale at time zone 'Europe/Paris',
          (g.heure_locale + make_interval(mins => p.duree_minutes)) at time zone 'Europe/Paris'
        )
    )
  order by 3, 2;
$$;

revoke all on function public.creneaux_libres_employes(date, uuid, uuid) from public;
grant execute on function public.creneaux_libres_employes(date, uuid, uuid) to anon, authenticated;

-- Booking with an employee: the start must be one of the free start times.
create or replace function public.reserver_employe(
  p_nom text,
  p_telephone text,
  p_prestation_id uuid,
  p_employe_id uuid,
  p_debut timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text := btrim(coalesce(p_nom, ''));
  v_tel text;
  v_duree interval;
  v_client_id uuid;
  v_rdv_id uuid;
begin
  -- Name
  if char_length(v_nom) < 2 or char_length(v_nom) > 80 then
    raise exception 'Merci d''indiquer votre nom (2 caractères minimum).';
  end if;

  v_tel := public.normaliser_telephone(p_telephone);

  -- Service must exist and be active
  select make_interval(mins => duree_minutes) into v_duree
  from public.prestations where id = p_prestation_id and active;
  if not found then
    raise exception 'Cette prestation n''est plus proposée.';
  end if;

  -- Same rules as the list shown to the client: hours, closures, past, overlap.
  if not exists (
    select 1
    from public.creneaux_libres_employes(
      (p_debut at time zone 'Europe/Paris')::date, p_prestation_id, p_employe_id
    ) l
    where l.debut = p_debut
  ) then
    raise exception 'Ce créneau n''est plus disponible. Choisissez-en un autre.';
  end if;

  -- Client: created or found by phone, name updated
  insert into public.clients (nom, telephone)
  values (v_nom, v_tel)
  on conflict (telephone) do update set nom = excluded.nom
  returning id into v_client_id;

  -- Appointment: the exclusion constraint refuses an overlap, even at the same second.
  begin
    insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin)
    values (v_client_id, p_prestation_id, p_employe_id, p_debut, p_debut + v_duree)
    returning id into v_rdv_id;
  exception
    when exclusion_violation then
      raise exception 'Ce créneau vient d''être réservé. Choisissez-en un autre.';
  end;

  return v_rdv_id;
end;
$$;

revoke all on function public.reserver_employe(text, text, uuid, uuid, timestamptz) from public;
grant execute on function public.reserver_employe(text, text, uuid, uuid, timestamptz) to anon, authenticated;
