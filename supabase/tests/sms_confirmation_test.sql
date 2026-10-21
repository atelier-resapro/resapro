begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.clients (id, nom, telephone) values
('00000000-0000-0000-0000-00000000fc01', 'Cliente confirmation', '0639989701');
insert into public.prestations (id, nom, duree_minutes, prix) values
('00000000-0000-0000-0000-00000000fb01', 'Coupe confirmation', 30, 35);
insert into public.employes (id, nom) values
('00000000-0000-0000-0000-00000000fe01', 'Employée confirmation');
-- A new booking, an old booking and a cancelled booking.
insert into public.rendez_vous (id, client_id, prestation_id, employe_id, debut, fin, statut, cree_le) values
('00000000-0000-0000-0000-00000000fd01', '00000000-0000-0000-0000-00000000fc01',
 '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fe01',
 now() + interval '2 days', now() + interval '2 days 30 minutes', 'confirme', now()),
('00000000-0000-0000-0000-00000000fd02', '00000000-0000-0000-0000-00000000fc01',
 '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fe01',
 now() + interval '3 days', now() + interval '3 days 30 minutes', 'confirme', now() - interval '1 hour'),
('00000000-0000-0000-0000-00000000fd03', '00000000-0000-0000-0000-00000000fc01',
 '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fe01',
 now() + interval '4 days', now() + interval '4 days 30 minutes', 'annule', now());

set local role anon;
select throws_ok($$select * from public.reclamer_confirmation_sms('00000000-0000-0000-0000-00000000fd01')$$,
  '42501', null, 'Le public ne peut pas réclamer la confirmation directement');
reset role;
set local role authenticated;
select throws_ok($$select * from public.reclamer_confirmation_sms('00000000-0000-0000-0000-00000000fd01')$$,
  '42501', null, 'Un compte connecté ne peut pas réclamer la confirmation directement');
reset role;

set local role service_role;
select results_eq($$select telephone, prestation from public.reclamer_confirmation_sms('00000000-0000-0000-0000-00000000fd01')$$,
  $$values ('0639989701'::text, 'Coupe confirmation'::text)$$,
  'La première réclamation donne le téléphone et la prestation');
select is_empty($$select * from public.reclamer_confirmation_sms('00000000-0000-0000-0000-00000000fd01')$$,
  'Une deuxième réclamation ne donne rien : un seul SMS par réservation');
select is_empty($$select * from public.reclamer_confirmation_sms('00000000-0000-0000-0000-00000000fd02')$$,
  'Une réservation de plus de 15 minutes ne donne rien');
select is_empty($$select * from public.reclamer_confirmation_sms('00000000-0000-0000-0000-00000000fd03')$$,
  'Une réservation annulée ne donne rien');
select is_empty($$select * from public.reclamer_confirmation_sms('00000000-0000-0000-0000-00000000fd99')$$,
  'Une réservation inconnue ne donne rien');
reset role;

select isnt((select confirmation_sms_le from public.rendez_vous
  where id = '00000000-0000-0000-0000-00000000fd01'), null::timestamptz,
  'L’envoi est enregistré sur la réservation');
select * from finish();
rollback;
