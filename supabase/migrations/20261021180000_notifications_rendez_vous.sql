-- Changes are recorded in the same transaction as the appointment. Browser roles
-- cannot read recipients, forge events or mark a delivery as successful.
create table public.notifications_rendez_vous (
  id uuid primary key default gen_random_uuid(),
  rendez_vous_id uuid not null references public.rendez_vous(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null check (type in ('deplacement', 'annulation')),
  destinataire text not null check (destinataire in ('client', 'employe')),
  telephone text,
  client_nom text not null,
  prestation text not null,
  ancien_debut timestamptz not null,
  debut timestamptz not null,
  cree_le timestamptz not null default now(),
  tentatives integer not null default 0,
  reserve_le timestamptz,
  reservation uuid,
  envoye_le timestamptz
);
alter table public.notifications_rendez_vous enable row level security;
revoke all on public.notifications_rendez_vous from public, anon, authenticated;
grant all on public.notifications_rendez_vous to service_role;
create policy "Le serveur gere les notifications" on public.notifications_rendez_vous
for all to service_role using (true) with check (true);
create index notifications_rendez_vous_attente_idx
on public.notifications_rendez_vous (rendez_vous_id, type) where envoye_le is null;

create function public.enregistrer_notifications_rendez_vous() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  if old.statut <> 'confirme' then return new; end if;
  if new.statut = 'annule' then v_type := 'annulation';
  elsif new.debut is distinct from old.debut then v_type := 'deplacement';
  else return new;
  end if;
  -- Keep personal delivery data no longer than 30 days.
  delete from public.notifications_rendez_vous where cree_le < now() - interval '30 days';
  insert into public.notifications_rendez_vous
    (rendez_vous_id, client_id, type, destinataire, telephone, client_nom, prestation, ancien_debut, debut)
  select new.id, new.client_id, v_type, d.role, d.telephone, c.nom, p.nom, old.debut, new.debut
  from public.clients c join public.prestations p on p.id = new.prestation_id
  join public.employes e on e.id = new.employe_id
  cross join lateral (values ('client', c.telephone), ('employe', e.telephone)) d(role, telephone)
  where c.id = new.client_id;
  return new;
end;
$$;
revoke all on function public.enregistrer_notifications_rendez_vous() from public, anon, authenticated;
create trigger notifications_rendez_vous after update of statut, debut on public.rendez_vous
for each row execute function public.enregistrer_notifications_rendez_vous();

-- Only the Edge Function may claim deliveries, after verifying the JWT. A
-- successful recipient is never claimed twice; concurrent calls skip locks.
create function public.reclamer_notifications_rendez_vous(p_rendez_vous_id uuid, p_type text, p_user_id uuid)
returns setof public.notifications_rendez_vous
language sql security definer set search_path = '' as $$
  update public.notifications_rendez_vous n
  set reserve_le = clock_timestamp(), reservation = gen_random_uuid(), tentatives = tentatives + 1
  where n.id in (
    select q.id from public.notifications_rendez_vous q
    where q.rendez_vous_id = p_rendez_vous_id and q.type = p_type
      and q.envoye_le is null and q.tentatives < 3
      and (q.reserve_le is null or q.reserve_le < now() - interval '5 minutes')
      and exists (select 1 from public.profils p where p.user_id = p_user_id
        and (p.role = 'gerant' or (p.role = 'client' and exists (
          select 1 from public.clients c where c.id = q.client_id and c.user_id = p_user_id))))
    order by q.cree_le, q.id limit 20 for update skip locked
  ) returning n.*;
$$;
revoke all on function public.reclamer_notifications_rendez_vous(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reclamer_notifications_rendez_vous(uuid, text, uuid) to service_role;
