-- The public confirmation SMS is sent at most once per booking. The Edge
-- Function claims it here; a repeated or concurrent call gets no row.
alter table public.rendez_vous add column confirmation_sms_le timestamptz;

-- One atomic update: a concurrent second call waits for the row lock, then
-- sees confirmation_sms_le already set and returns nothing.
create function public.reclamer_confirmation_sms(p_rendez_vous_id uuid)
returns table (telephone text, prestation text, debut timestamptz)
language sql security definer set search_path = '' as $$
  update public.rendez_vous r
  set confirmation_sms_le = clock_timestamp()
  from public.clients c, public.prestations p
  where r.id = p_rendez_vous_id
    and c.id = r.client_id and p.id = r.prestation_id
    and r.statut = 'confirme'
    and r.confirmation_sms_le is null
    -- The booking page is public: only a booking made in the last minutes.
    and r.cree_le between now() - interval '15 minutes' and now()
  returning c.telephone, p.nom, r.debut;
$$;
revoke all on function public.reclamer_confirmation_sms(uuid) from public, anon, authenticated;
grant execute on function public.reclamer_confirmation_sms(uuid) to service_role;
