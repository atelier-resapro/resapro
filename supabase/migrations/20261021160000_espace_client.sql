-- Client access is derived from the confirmed phone account and its profile.
create function public.mon_client_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.clients c
  join public.profils p on p.user_id = c.user_id and p.role = 'client'
  where c.user_id = (select auth.uid());
$$;
revoke all on function public.mon_client_id() from public, anon;
grant execute on function public.mon_client_id() to authenticated;

create policy "Le client lit ses rendez-vous" on public.rendez_vous
for select to authenticated using (client_id = (select public.mon_client_id()));
create index rendez_vous_client_debut_idx on public.rendez_vous (client_id, debut);
-- No client UPDATE policy: every write must use the checked functions below.

create table public.parametres_salon (
  id boolean primary key default true check (id),
  delai_modification_heures integer not null default 24
    check (delai_modification_heures between 0 and 8760)
);
insert into public.parametres_salon (id) values (true);
alter table public.parametres_salon enable row level security;
revoke all on public.parametres_salon from public, anon, authenticated;
grant select, update on public.parametres_salon to authenticated;
create policy "Le gerant lit les parametres" on public.parametres_salon
for select to authenticated using ((select public.est_gerant_connecte()));
create policy "Le gerant modifie les parametres" on public.parametres_salon
for update to authenticated using ((select public.est_gerant_connecte()))
with check ((select public.est_gerant_connecte()));

create function public.mes_rendez_vous()
returns table (id uuid, debut timestamptz, fin timestamptz, statut text,
  prestation text, coiffeur text, prix numeric, modification_jusqua timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.debut, r.fin, r.statut, p.nom, e.nom, p.prix,
    r.debut - make_interval(hours => s.delai_modification_heures)
  from public.rendez_vous r
  join public.prestations p on p.id = r.prestation_id
  join public.employes e on e.id = r.employe_id
  cross join public.parametres_salon s
  where r.client_id = public.mon_client_id()
  order by r.debut;
$$;
revoke all on function public.mes_rendez_vous() from public, anon;
grant execute on function public.mes_rendez_vous() to authenticated;

-- Same availability rules as booking, retaining the appointment's duration.
-- Ignore only this appointment, so a partially overlapping move is possible.
create function public.creneaux_deplacement_client(p_rendez_vous_id uuid, p_date date)
returns table (debut timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct g.heure_locale at time zone 'Europe/Paris'
  from public.rendez_vous rdv
  join public.employes e on e.id = rdv.employe_id and e.actif
  join public.prestations p on p.id = rdv.prestation_id and p.active
  join public.employe_prestations ep on ep.employe_id = e.id and ep.prestation_id = p.id
  join public.horaires h on h.employe_id = e.id
    and h.jour_semaine = extract(isodow from p_date)
  cross join public.parametres_salon s
  cross join lateral generate_series(p_date + h.heure_debut,
    p_date + h.heure_fin - (rdv.fin - rdv.debut), interval '15 minutes') g(heure_locale)
  where rdv.id = p_rendez_vous_id and rdv.client_id = public.mon_client_id()
    and rdv.statut = 'confirme'
    and rdv.debut > statement_timestamp()
    and rdv.debut >= statement_timestamp() + make_interval(hours => s.delai_modification_heures)
    and (g.heure_locale at time zone 'Europe/Paris') > statement_timestamp()
    and not exists (select 1 from public.fermetures f where f.date = p_date
      and (f.employe_id is null or f.employe_id = e.id))
    and not exists (select 1 from public.rendez_vous r where r.employe_id = e.id
      and r.id <> rdv.id and r.statut = 'confirme'
      and tstzrange(r.debut, r.fin) && tstzrange(g.heure_locale at time zone 'Europe/Paris',
        (g.heure_locale at time zone 'Europe/Paris') + (rdv.fin - rdv.debut)))
  order by 1;
$$;
revoke all on function public.creneaux_deplacement_client(uuid, date) from public, anon;
grant execute on function public.creneaux_deplacement_client(uuid, date) to authenticated;

-- A single checked operation; no client-controlled employee, service or status.
create function public.modifier_mon_rendez_vous(p_rendez_vous_id uuid, p_debut timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_rdv public.rendez_vous%rowtype;
  v_delai integer;
begin
  -- Serialize with changes to the salon setting, then lock the owned appointment.
  select delai_modification_heures into strict v_delai from public.parametres_salon for share;
  select * into v_rdv from public.rendez_vous
  where id = p_rendez_vous_id and client_id = public.mon_client_id() for update;
  if not found then raise exception 'Rendez-vous introuvable.'; end if;
  if v_rdv.statut <> 'confirme' then raise exception 'Ce rendez-vous est déjà annulé.'; end if;
  if v_rdv.debut <= clock_timestamp()
    or v_rdv.debut < clock_timestamp() + make_interval(hours => 0) then
    raise exception 'Pour ce rendez-vous, appelez le salon';
  end if;
  if p_debut is null then
    update public.rendez_vous set statut = 'annule' where id = v_rdv.id;
  else
    if not exists (select 1 from public.creneaux_deplacement_client(v_rdv.id,
      (p_debut at time zone 'Europe/Paris')::date) c where c.debut = p_debut) then
      raise exception 'Ce créneau n''est plus disponible. Choisissez-en un autre.';
    end if;
    begin
      update public.rendez_vous set debut = p_debut, fin = p_debut + (v_rdv.fin - v_rdv.debut),
        creneau_id = null where id = v_rdv.id;
    exception when exclusion_violation or unique_violation then
      raise exception 'Ce créneau vient d''être réservé. Choisissez-en un autre.';
    end;
  end if;
end;
$$;
revoke all on function public.modifier_mon_rendez_vous(uuid, timestamptz) from public, anon;
grant execute on function public.modifier_mon_rendez_vous(uuid, timestamptz) to authenticated;
