-- Accounts and roles: manager, employee, account without profile, public.
-- Run with `supabase test db --linked`. Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- Fixtures (as the owner, RLS does not apply here).
-- Accounts: Julie and Thomas (employees), a manager, an account without profile.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'julie.test@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'thomas.test@example.com'),
  ('00000000-0000-0000-0000-0000000000b3', 'gerant.test@example.com'),
  ('00000000-0000-0000-0000-0000000000b4', 'sans.profil@example.com');

insert into public.profils (user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'employe'),
  ('00000000-0000-0000-0000-0000000000b2', 'employe'),
  ('00000000-0000-0000-0000-0000000000b3', 'gerant');

insert into public.prestations (id, nom, duree_minutes, prix, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Test coupe', 30, 20, true),
  ('00000000-0000-0000-0000-0000000000a2', 'Test ancienne', 30, 20, false);

insert into public.employes (id, nom, user_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Test Julie', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Test Thomas', '00000000-0000-0000-0000-0000000000b2');

insert into public.employe_prestations (employe_id, prestation_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

-- 2030-01-08 is a Tuesday.
insert into public.horaires (employe_id, jour_semaine, heure_debut, heure_fin) values
  ('00000000-0000-0000-0000-0000000000e1', 2, '09:00', '12:00'),
  ('00000000-0000-0000-0000-0000000000e2', 3, '09:00', '12:00');

insert into public.fermetures (date, employe_id) values
  ('2030-01-09', '00000000-0000-0000-0000-0000000000e2');

insert into public.clients (id, nom, telephone) values
  ('00000000-0000-0000-0000-0000000000c1', 'Client test', '0639989901');

-- Julie: 10:00 and 11:00 confirmed, 10:00 cancelled. Thomas: 10:00 confirmed.
insert into public.rendez_vous (id, client_id, prestation_id, employe_id, debut, fin, statut) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1',
   '2030-01-08 10:00 Europe/Paris', '2030-01-08 10:30 Europe/Paris', 'confirme'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1',
   '2030-01-08 11:00 Europe/Paris', '2030-01-08 11:30 Europe/Paris', 'confirme'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1',
   '2030-01-08 10:00 Europe/Paris', '2030-01-08 10:30 Europe/Paris', 'annule'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2',
   '2030-01-08 10:00 Europe/Paris', '2030-01-08 10:30 Europe/Paris', 'confirme');

-- Julie (employee)

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select is(
  (select count(*) from public.rendez_vous),
  3::bigint,
  'Julie voit ses 3 rendez-vous, et seulement les siens'
);

select is_empty(
  $$ select * from public.rendez_vous where employe_id = '00000000-0000-0000-0000-0000000000e2' $$,
  'Julie : une requête sur les rendez-vous de Thomas ne renvoie rien'
);

select is_empty($$ select * from public.clients $$, 'Julie ne lit pas les clients');
select is_empty($$ select * from public.creneaux $$, 'Julie ne lit pas les créneaux');
select is_empty($$ select * from public.fermetures $$, 'Julie ne lit pas les fermetures');
select is_empty($$ select * from public.employe_prestations $$, 'Julie ne lit pas employe_prestations');

select results_eq(
  $$ select id from public.employes $$,
  $$ values ('00000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'Julie ne voit que sa propre fiche employé'
);

select results_eq(
  $$ select employe_id, jour_semaine from public.horaires $$,
  $$ values ('00000000-0000-0000-0000-0000000000e1'::uuid, 2::smallint) $$,
  'Julie ne voit que ses propres horaires'
);

select results_eq(
  $$ select user_id, role from public.profils $$,
  $$ values ('00000000-0000-0000-0000-0000000000b1'::uuid, 'employe'::text) $$,
  'Julie ne lit que son propre profil'
);

select results_eq(
  $$ select debut, prestation, client_nom from public.mon_agenda('2030-01-08', '2030-01-08') $$,
  $$ values ('2030-01-08 10:00 Europe/Paris'::timestamptz, 'Test coupe'::text, 'Client test'::text),
            ('2030-01-08 11:00 Europe/Paris'::timestamptz, 'Test coupe'::text, 'Client test'::text) $$,
  'mon_agenda : rendez-vous confirmés de Julie, avec le nom du client'
);

select is_empty(
  $$ update public.rendez_vous set statut = 'annule'
     where id = '00000000-0000-0000-0000-0000000000d1' returning id $$,
  'Julie ne peut pas modifier ses rendez-vous'
);

select throws_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin) values
       ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000e1',
        '2030-01-08 09:00 Europe/Paris', '2030-01-08 09:30 Europe/Paris') $$,
  '42501',
  null,
  'Julie ne peut pas créer de rendez-vous directement'
);

select is_empty(
  $$ update public.profils set role = 'gerant' returning user_id $$,
  'Julie ne peut pas changer son rôle'
);

select is(public.est_gerant_connecte(), false, 'Julie n''est pas gérante');

-- Thomas (employee)

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

select is_empty(
  $$ select * from public.rendez_vous where employe_id = '00000000-0000-0000-0000-0000000000e1' $$,
  'Thomas ne voit pas les rendez-vous de Julie'
);

select results_eq(
  $$ select client_nom from public.mon_agenda('2030-01-08', '2030-01-08') $$,
  $$ values ('Client test'::text) $$,
  'mon_agenda de Thomas ne contient que son rendez-vous'
);

-- Account without profile: sees nothing

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);

select is_empty($$ select * from public.rendez_vous $$, 'Sans profil : aucun rendez-vous');
select is_empty($$ select * from public.employes $$, 'Sans profil : aucun employé');
select is_empty($$ select * from public.mon_agenda('2030-01-01', '2030-12-31') $$, 'Sans profil : agenda vide');
select is_empty(
  $$ select * from public.prestations where id = '00000000-0000-0000-0000-0000000000a2' $$,
  'Sans profil : pas de prestation désactivée'
);

-- Manager

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);

select is(
  (select count(*) from public.rendez_vous
   where employe_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2')),
  4::bigint,
  'Le gérant voit les rendez-vous de tous les employés'
);

select isnt_empty(
  $$ select * from public.clients where id = '00000000-0000-0000-0000-0000000000c1' $$,
  'Le gérant lit les clients'
);

select isnt_empty(
  $$ select * from public.prestations where id = '00000000-0000-0000-0000-0000000000a2' $$,
  'Le gérant voit les prestations désactivées'
);

select isnt_empty(
  $$ update public.rendez_vous set statut = 'annule'
     where id = '00000000-0000-0000-0000-0000000000d4' returning id $$,
  'Le gérant peut annuler un rendez-vous'
);

select is(public.est_gerant_connecte(), true, 'Le gérant est reconnu');

-- Public (anon)

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

select is_empty($$ select * from public.profils $$, 'anon ne lit pas les profils');

select throws_ok(
  $$ select * from public.mon_agenda('2030-01-08', '2030-01-08') $$,
  '42501',
  null,
  'anon ne peut pas appeler mon_agenda'
);

select lives_ok(
  $$ select * from public.creneaux_libres_employes('2030-01-08', '00000000-0000-0000-0000-0000000000a1') $$,
  'anon peut toujours chercher des créneaux libres'
);

reset role;

select * from finish();
rollback;
