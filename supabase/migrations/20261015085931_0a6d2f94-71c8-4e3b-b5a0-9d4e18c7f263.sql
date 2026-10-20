-- Summary shown on the confirmation screen.
-- Returns the service, the day, the time and the price. NEVER the phone number
-- or the name of the client.

create or replace function public.recapitulatif(p_rendez_vous_id uuid)
returns table (prestation text, jour date, heure time, prix numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.nom, c.date, c.heure_debut, p.prix
  from public.rendez_vous r
  join public.prestations p on p.id = r.prestation_id
  join public.creneaux c on c.id = r.creneau_id
  where r.id = p_rendez_vous_id
    and r.statut = 'confirme';
$$;

revoke all on function public.recapitulatif(uuid) from public;
grant execute on function public.recapitulatif(uuid) to anon, authenticated;
