-- Choice of the hairdresser on the public booking page.
-- The client sees the employees who do the chosen service, plus "Indifférent".
-- With "Indifférent", the server picks the free employee with the fewest
-- appointments that day.

-- Employees who do a service: id and name only (the public cannot read employes).
create or replace function public.employes_prestation(p_prestation_id uuid)
returns table (employe_id uuid, employe_nom text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nom
  from public.prestations p
  join public.employe_prestations ep on ep.prestation_id = p.id
  join public.employes e on e.id = ep.employe_id
  where p.id = p_prestation_id
    and p.active
    and e.actif
  order by e.nom, e.id;
$$;

revoke all on function public.employes_prestation(uuid) from public;
grant execute on function public.employes_prestation(uuid) to anon, authenticated;

-- Booking with an employee, or with p_employe_id null ("Indifférent").
-- The start must be one of the free start times.
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
  v_date date := (p_debut at time zone 'Europe/Paris')::date;
  v_client_id uuid;
  v_candidat uuid;
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
    from public.creneaux_libres_employes(v_date, p_prestation_id, p_employe_id) l
    where l.debut = p_debut
  ) then
    raise exception 'Ce créneau n''est plus disponible. Choisissez-en un autre.';
  end if;

  -- Client: created or found by phone, name updated
  insert into public.clients (nom, telephone)
  values (v_nom, v_tel)
  on conflict (telephone) do update set nom = excluded.nom
  returning id into v_client_id;

  -- Candidates: the chosen employee, or every free employee at that start,
  -- the one with the fewest appointments that day first (then by name).
  -- If a candidate has just been taken by someone else, the next one is tried.
  for v_candidat in
    select l.employe_id
    from public.creneaux_libres_employes(v_date, p_prestation_id, p_employe_id) l
    where l.debut = p_debut
    order by (
      select count(*)
      from public.rendez_vous r
      where r.employe_id = l.employe_id
        and r.statut = 'confirme'
        and r.debut >= v_date::timestamp at time zone 'Europe/Paris'
        and r.debut < (v_date + 1)::timestamp at time zone 'Europe/Paris'
    ), l.employe_nom, l.employe_id
  loop
    -- Appointment: the exclusion constraint refuses an overlap, even at the same second.
    begin
      insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin)
      values (v_client_id, p_prestation_id, v_candidat, p_debut, p_debut + v_duree)
      returning id into v_rdv_id;
      return v_rdv_id;
    exception
      when exclusion_violation then
        null; -- taken in the meantime: try the next candidate
    end;
  end loop;

  raise exception 'Ce créneau vient d''être réservé. Choisissez-en un autre.';
end;
$$;

revoke all on function public.reserver_employe(text, text, uuid, uuid, timestamptz) from public;
grant execute on function public.reserver_employe(text, text, uuid, uuid, timestamptz) to anon, authenticated;

-- Summary of the confirmation page: now with the hairdresser's name.
-- Still NEVER the name or the phone number of the client.
-- The return type changes, so the function is dropped and created again.
drop function public.recapitulatif(uuid);

create function public.recapitulatif(p_rendez_vous_id uuid)
returns table (prestation text, jour date, heure time, prix numeric, coiffeur text)
language sql
stable
security definer
set search_path = public
as $$
  select p.nom,
         (r.debut at time zone 'Europe/Paris')::date,
         (r.debut at time zone 'Europe/Paris')::time,
         p.prix,
         e.nom
  from public.rendez_vous r
  join public.prestations p on p.id = r.prestation_id
  join public.employes e on e.id = r.employe_id
  where r.id = p_rendez_vous_id
    and r.statut = 'confirme';
$$;

revoke all on function public.recapitulatif(uuid) from public;
grant execute on function public.recapitulatif(uuid) to anon, authenticated;
