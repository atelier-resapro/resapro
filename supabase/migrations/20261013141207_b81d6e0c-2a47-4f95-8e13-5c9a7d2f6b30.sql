-- Free slots for a given day. Returns ONLY the slot id and its start time:
-- no client data, no appointment data.

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
      where r.creneau_id = c.id
        and r.statut = 'confirme'
    )
    -- no slot in the past (salon time)
    and (c.date + c.heure_debut) > (now() at time zone 'Europe/Paris')
  order by c.heure_debut;
$$;

revoke all on function public.creneaux_libres(date) from public;
grant execute on function public.creneaux_libres(date) to anon, authenticated;
