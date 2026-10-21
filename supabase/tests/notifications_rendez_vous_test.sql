begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Appointment exists before the first verified login (no account yet).
insert into public.clients (id, nom, telephone) values
('00000000-0000-0000-0000-00000000ec01', 'Ancienne cliente', '0639989601');
insert into public.prestations (id, nom, duree_minutes, prix) values
('00000000-0000-0000-0000-00000000eb01', 'Coupe notifications', 30, 35);
insert into public.employes (id, nom, telephone) values
('00000000-0000-0000-0000-00000000ee01', 'Employée notifications', '0739989602');
insert into public.rendez_vous (id, client_id, prestation_id, employe_id, debut, fin) values
('00000000-0000-0000-0000-00000000ed01', '00000000-0000-0000-0000-00000000ec01',
 '00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-00000000ee01',
 now() - interval '10 days', now() - interval '10 days' + interval '30 minutes');
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-00000000ea01', '33639989601');
select is((select user_id from public.clients where telephone = '0639989601'), null::uuid,
  'Sans vérification aucun rendez-vous ancien n’est revendiqué');
update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000ea01';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ea01"}', true);
select results_eq($$select id from public.mes_rendez_vous()$$,
  $$values ('00000000-0000-0000-0000-00000000ed01'::uuid)$$,
  'Le rendez-vous antérieur à la connexion apparaît dans le bon espace client');
select results_eq($$select id from public.rendez_vous$$,
  $$values ('00000000-0000-0000-0000-00000000ed01'::uuid)$$, 'RLS : même rattachement en lecture directe');
select throws_ok($$select * from public.notifications_rendez_vous$$, '42501', null,
  'Le client ne lit pas les destinataires des SMS');
select throws_ok($$select public.reclamer_notifications_rendez_vous(
  '00000000-0000-0000-0000-00000000ed01', 'annulation', '00000000-0000-0000-0000-00000000ea01')$$,
  '42501', null, 'Le navigateur ne peut pas réclamer les SMS directement');
reset role;
select is((select count(*) from public.notifications_rendez_vous
  where rendez_vous_id = '00000000-0000-0000-0000-00000000ed01'), 0::bigint,
  'Le rattachement ne déclenche pas de SMS');
update public.rendez_vous set debut = debut + interval '20 days', fin = fin + interval '20 days'
where id = '00000000-0000-0000-0000-00000000ed01';
select is((select count(*) from public.notifications_rendez_vous
  where rendez_vous_id = '00000000-0000-0000-0000-00000000ed01' and type = 'deplacement'), 2::bigint,
  'Un déplacement produit exactement deux notifications');
select results_eq($$select telephone from public.notifications_rendez_vous
  where rendez_vous_id = '00000000-0000-0000-0000-00000000ed01' order by destinataire$$,
  $$values ('0639989601'::text), ('0739989602'::text)$$, 'Client et employé sont les destinataires');
select is_empty($$select * from public.reclamer_notifications_rendez_vous(
  '00000000-0000-0000-0000-00000000ed01', 'deplacement', '00000000-0000-0000-0000-00000000ea02')$$,
  'Une identité sans droit ne peut réclamer les SMS');
set local role service_role;
select is((select count(*) from public.reclamer_notifications_rendez_vous(
  '00000000-0000-0000-0000-00000000ed01', 'deplacement', '00000000-0000-0000-0000-00000000ea01')), 2::bigint,
  'La fonction serveur réclame les deux SMS du propriétaire');
select is_empty($$select * from public.reclamer_notifications_rendez_vous(
  '00000000-0000-0000-0000-00000000ed01', 'deplacement', '00000000-0000-0000-0000-00000000ea01')$$,
  'Un appel répété ne renvoie pas les SMS en cours');
update public.notifications_rendez_vous set envoye_le = now()
where rendez_vous_id = '00000000-0000-0000-0000-00000000ed01' and destinataire = 'client';
update public.notifications_rendez_vous set reserve_le = now() - interval '6 minutes'
where rendez_vous_id = '00000000-0000-0000-0000-00000000ed01';
select is((select count(*) from public.reclamer_notifications_rendez_vous(
  '00000000-0000-0000-0000-00000000ed01', 'deplacement', '00000000-0000-0000-0000-00000000ea01')), 1::bigint,
  'Seul le destinataire en échec est repris après cinq minutes');
reset role;
update public.rendez_vous set statut = 'annule' where id = '00000000-0000-0000-0000-00000000ed01';
update public.rendez_vous set statut = 'annule' where id = '00000000-0000-0000-0000-00000000ed01';
select is((select count(*) from public.notifications_rendez_vous
  where rendez_vous_id = '00000000-0000-0000-0000-00000000ed01' and type = 'annulation'), 2::bigint,
  'Une annulation produit deux SMS, répéter le même statut ne produit pas de doublon');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications_rendez_vous'::regclass),
  'RLS activée sur les notifications');
set local role anon;
select throws_ok($$select * from public.notifications_rendez_vous$$, '42501', null,
  'Le public ne lit aucun numéro ou historique SMS');
reset role;
select * from finish();
rollback;
