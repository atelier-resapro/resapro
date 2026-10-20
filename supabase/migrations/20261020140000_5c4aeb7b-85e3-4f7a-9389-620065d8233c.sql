-- Accounts for employees. A profile links each account to its role.
-- Signed-in no longer means manager: rights come from the profile.
-- A signed-in account without a profile sees nothing.

create table public.profils (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('gerant', 'employe', 'client')),
  cree_le timestamptz default now()
);

alter table public.profils enable row level security;

-- Helpers for the policies. security definer: they read profils and employes
-- without going through RLS (no recursion between policies).

create or replace function public.est_gerant_connecte()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profils
    where user_id = auth.uid() and role = 'gerant'
  );
$$;

-- The employee row of the signed-in account, if it is active and has a staff role.
create or replace function public.mon_employe_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.employes e
  join public.profils pr on pr.user_id = e.user_id
  where e.user_id = auth.uid()
    and e.actif
    and pr.role in ('gerant', 'employe');
$$;

revoke all on function public.est_gerant_connecte() from public, anon;
grant execute on function public.est_gerant_connecte() to authenticated;
revoke all on function public.mon_employe_id() from public, anon;
grant execute on function public.mon_employe_id() to authenticated;

-- The current manager account becomes the 'gerant' profile.
insert into public.profils (user_id, role)
select user_id, 'gerant'
from public.employes
where est_gerant and user_id is not null;

-- Safety: if accounts exist but none is the manager, the new policies would lock
-- everybody out. Stop here (nothing is applied) so it can be fixed first.
do $$
begin
  if exists (select 1 from auth.users)
     and not exists (select 1 from public.profils where role = 'gerant') then
    raise exception 'Aucun compte gérant : renseignez employes.user_id pour le gérant avant cette migration.';
  end if;
end;
$$;

-- Policies: drop the old "signed-in = manager" ones.

drop policy "Le gerant gere les prestations" on public.prestations;
drop policy "Le gerant gere les creneaux" on public.creneaux;
drop policy "Le gerant gere les clients" on public.clients;
drop policy "Le gerant gere les rendez-vous" on public.rendez_vous;
drop policy "Le gerant gere les employes" on public.employes;
drop policy "Le gerant gere les horaires" on public.horaires;
drop policy "Le gerant gere les prestations des employes" on public.employe_prestations;
drop policy "Le gerant gere les fermetures" on public.fermetures;

-- Manager: full access everywhere. (select ...) is evaluated once per query.

create policy "Le gerant gere les prestations"
  on public.prestations for all
  to authenticated
  using ((select public.est_gerant_connecte()))
  with check ((select public.est_gerant_connecte()));

create policy "Le gerant gere les creneaux"
  on public.creneaux for all
  to authenticated
  using ((select public.est_gerant_connecte()))
  with check ((select public.est_gerant_connecte()));

create policy "Le gerant gere les clients"
  on public.clients for all
  to authenticated
  using ((select public.est_gerant_connecte()))
  with check ((select public.est_gerant_connecte()));

create policy "Le gerant gere les rendez-vous"
  on public.rendez_vous for all
  to authenticated
  using ((select public.est_gerant_connecte()))
  with check ((select public.est_gerant_connecte()));

create policy "Le gerant gere les employes"
  on public.employes for all
  to authenticated
  using ((select public.est_gerant_connecte()))
  with check ((select public.est_gerant_connecte()));

create policy "Le gerant gere les horaires"
  on public.horaires for all
  to authenticated
  using ((select public.est_gerant_connecte()))
  with check ((select public.est_gerant_connecte()));

create policy "Le gerant gere les prestations des employes"
  on public.employe_prestations for all
  to authenticated
  using ((select public.est_gerant_connecte()))
  with check ((select public.est_gerant_connecte()));

create policy "Le gerant gere les fermetures"
  on public.fermetures for all
  to authenticated
  using ((select public.est_gerant_connecte()))
  with check ((select public.est_gerant_connecte()));

create policy "Le gerant gere les profils"
  on public.profils for all
  to authenticated
  using ((select public.est_gerant_connecte()))
  with check ((select public.est_gerant_connecte()));

-- Every account: read only, and only what concerns it.

create policy "Les comptes lisent les prestations actives"
  on public.prestations for select
  to authenticated
  using (active = true);

create policy "Chacun lit son profil"
  on public.profils for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "L'employe lit sa fiche"
  on public.employes for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "L'employe lit ses horaires"
  on public.horaires for select
  to authenticated
  using (employe_id = (select public.mon_employe_id()));

-- Rows only: client data stays out of reach (no policy on clients).
create policy "L'employe lit ses rendez-vous"
  on public.rendez_vous for select
  to authenticated
  using (employe_id = (select public.mon_employe_id()));

-- Agenda of the signed-in employee, between two days (included, salon time).
-- Gives the client's name only: never the phone number.
create or replace function public.mon_agenda(p_debut date, p_fin date)
returns table (
  rendez_vous_id uuid,
  debut timestamptz,
  fin timestamptz,
  prestation text,
  client_nom text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.debut, r.fin, p.nom, c.nom
  from public.rendez_vous r
  join public.prestations p on p.id = r.prestation_id
  join public.clients c on c.id = r.client_id
  where r.employe_id = public.mon_employe_id()
    and r.statut = 'confirme'
    and r.debut >= p_debut::timestamp at time zone 'Europe/Paris'
    and r.debut < (p_fin + 1)::timestamp at time zone 'Europe/Paris'
  order by r.debut;
$$;

revoke all on function public.mon_agenda(date, date) from public, anon;
grant execute on function public.mon_agenda(date, date) to authenticated;
