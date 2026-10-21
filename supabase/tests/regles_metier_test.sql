-- Business rules that must hold whatever the pages do: no overlap, choice of
-- the hairdresser with "Indifférent", modification delay and access per role.
-- Each description starts with its rule ("chevauchement", "indifférent",
-- "délai", "accès"): `npm run test:db:sabotage` breaks each rule on purpose
-- and checks that tests of that rule, and only them, fail.
-- Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(35);

-- Rows that the current role can see (or change, with an update ... returning).
-- A refused privilege counts as nothing seen.
create function pg_temp.lignes_visibles(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('with q as (%s) select count(*) from q', q) into n;
  return n;
exception when insufficient_privilege then
  return 0;
end;
$$;

-- Fixtures. Two clients with a confirmed phone account (the Auth trigger
-- creates their fiche and profile), a manager, an employee (Alice) and an
-- account without profile. Alice and Bruno do "Règles coupe" (30 min) every
-- day 9:00-12:00. 2030-01-08 is a Tuesday.
insert into auth.users (id, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-00000000f001', '33639989811', now()),
  ('00000000-0000-0000-0000-00000000f002', '33639989812', now());
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f003', 'regles-gerant@example.com'),
  ('00000000-0000-0000-0000-00000000f004', 'regles-employe@example.com'),
  ('00000000-0000-0000-0000-00000000f005', 'regles-sans-profil@example.com');
insert into public.profils (user_id, role) values
  ('00000000-0000-0000-0000-00000000f003', 'gerant'),
  ('00000000-0000-0000-0000-00000000f004', 'employe');

insert into public.prestations (id, nom, duree_minutes, prix, active) values
  ('00000000-0000-0000-0000-00000000f0a1', 'Règles coupe', 30, 20, true),
  ('00000000-0000-0000-0000-00000000f0a2', 'Règles ancienne', 30, 20, false);
insert into public.employes (id, nom, user_id) values
  ('00000000-0000-0000-0000-00000000f0e1', 'Règles Alice', '00000000-0000-0000-0000-00000000f004'),
  ('00000000-0000-0000-0000-00000000f0e2', 'Règles Bruno', null);
insert into public.employe_prestations (employe_id, prestation_id) values
  ('00000000-0000-0000-0000-00000000f0e1', '00000000-0000-0000-0000-00000000f0a1'),
  ('00000000-0000-0000-0000-00000000f0e2', '00000000-0000-0000-0000-00000000f0a1');
insert into public.horaires (employe_id, jour_semaine, heure_debut, heure_fin)
select e, j, '09:00', '12:00'
from unnest(array['00000000-0000-0000-0000-00000000f0e1', '00000000-0000-0000-0000-00000000f0e2']::uuid[]) e,
     generate_series(1, 7) j;
update public.parametres_salon set delai_modification_heures = 24;

-- On 2030-01-08, Alice has two appointments (10:00 and 10:30), Bruno one (11:00).
insert into public.rendez_vous (id, client_id, prestation_id, employe_id, debut, fin)
select v.id, c.id, '00000000-0000-0000-0000-00000000f0a1', v.employe_id, v.debut, v.debut + interval '30 minutes'
from public.clients c, (values
  ('00000000-0000-0000-0000-00000000f101'::uuid, '00000000-0000-0000-0000-00000000f0e1'::uuid, '2030-01-08 10:00 Europe/Paris'::timestamptz),
  ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-00000000f0e1', '2030-01-08 10:30 Europe/Paris'),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000f0e2', '2030-01-08 11:00 Europe/Paris')
) v(id, employe_id, debut)
where c.user_id = '00000000-0000-0000-0000-00000000f001';

-- Client 1 also has appointments in 23, 25 and 30 hours (for the delay).
insert into public.rendez_vous (id, client_id, prestation_id, employe_id, debut, fin)
select v.id, c.id, '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-00000000f0e1',
  now() + v.dans, now() + v.dans + interval '30 minutes'
from public.clients c, (values
  ('00000000-0000-0000-0000-00000000f123'::uuid, interval '23 hours'),
  ('00000000-0000-0000-0000-00000000f125', interval '25 hours'),
  ('00000000-0000-0000-0000-00000000f130', interval '30 hours')
) v(id, dans)
where c.user_id = '00000000-0000-0000-0000-00000000f001';

-- Indifférent: bookings made by the public, checked in separate statements.

set local role anon;
do $$ begin
  perform set_config('regles.rdv_9h00', public.reserver_employe('Client règles', '06 39 98 98 13',
    '00000000-0000-0000-0000-00000000f0a1', null, '2030-01-08 09:00 Europe/Paris')::text, true);
end $$;
reset role;
select is(
  (select e.nom from public.rendez_vous r join public.employes e on e.id = r.employe_id
   where r.id = current_setting('regles.rdv_9h00')::uuid),
  'Règles Bruno',
  'indifférent : le coiffeur qui a le moins de rendez-vous ce jour-là est choisi'
);

-- Now two appointments each.
set local role anon;
do $$ begin
  perform set_config('regles.rdv_9h30', public.reserver_employe('Client règles', '06 39 98 98 13',
    '00000000-0000-0000-0000-00000000f0a1', null, '2030-01-08 09:30 Europe/Paris')::text, true);
end $$;
reset role;
select is(
  (select e.nom from public.rendez_vous r join public.employes e on e.id = r.employe_id
   where r.id = current_setting('regles.rdv_9h30')::uuid),
  'Règles Alice',
  'indifférent : à égalité, l''ordre alphabétique départage'
);

-- At 11:00 Bruno is busy: Alice is chosen although she has more appointments.
set local role anon;
do $$ begin
  perform set_config('regles.rdv_11h00', public.reserver_employe('Client règles', '06 39 98 98 13',
    '00000000-0000-0000-0000-00000000f0a1', null, '2030-01-08 11:00 Europe/Paris')::text, true);
end $$;
reset role;
select is(
  (select e.nom from public.rendez_vous r join public.employes e on e.id = r.employe_id
   where r.id = current_setting('regles.rdv_11h00')::uuid),
  'Règles Alice',
  'indifférent : seul le coiffeur libre à cet horaire peut être choisi'
);

set local role anon;
select throws_ok(
  $$ select public.reserver_employe('Client règles', '06 39 98 98 13',
       '00000000-0000-0000-0000-00000000f0a1', null, '2030-01-08 11:00 Europe/Paris') $$,
  'P0001', 'Ce créneau n''est plus disponible. Choisissez-en un autre.',
  'indifférent : quand personne n''est libre, la réservation est refusée'
);
reset role;

-- Chevauchement: the exclusion constraint is the last guard, even for
-- direct inserts. Alice now has 9:30, 10:00, 10:30 and 11:00.

select throws_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin)
     select id, '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-00000000f0e1',
       '2030-01-08 10:00 Europe/Paris', '2030-01-08 10:30 Europe/Paris'
     from public.clients where telephone = '0639989813' $$,
  '23P01', null,
  'chevauchement : le même horaire pour le même coiffeur est refusé par la base'
);

select throws_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin)
     select id, '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-00000000f0e1',
       '2030-01-08 10:15 Europe/Paris', '2030-01-08 10:45 Europe/Paris'
     from public.clients where telephone = '0639989813' $$,
  '23P01', null,
  'chevauchement : un horaire qui en recouvre un autre en partie est refusé par la base'
);

select lives_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin)
     select id, '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-00000000f0e2',
       '2030-01-08 10:00 Europe/Paris', '2030-01-08 10:30 Europe/Paris'
     from public.clients where telephone = '0639989813' $$,
  'chevauchement : un autre coiffeur peut avoir le même horaire'
);

select lives_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin)
     select id, '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-00000000f0e1',
       '2030-01-08 11:30 Europe/Paris', '2030-01-08 12:00 Europe/Paris'
     from public.clients where telephone = '0639989813' $$,
  'chevauchement : un rendez-vous qui commence à la fin d''un autre est accepté'
);

update public.rendez_vous set statut = 'annule' where id = '00000000-0000-0000-0000-00000000f101';
select lives_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin)
     select id, '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-00000000f0e1',
       '2030-01-08 10:00 Europe/Paris', '2030-01-08 10:30 Europe/Paris'
     from public.clients where telephone = '0639989813' $$,
  'chevauchement : un rendez-vous annulé libère l''horaire'
);

set local role anon;
select throws_ok(
  $$ select public.reserver_employe('Client règles', '06 39 98 98 13',
       '00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-00000000f0e1',
       '2030-01-08 10:30 Europe/Paris') $$,
  'P0001', 'Ce créneau n''est plus disponible. Choisissez-en un autre.',
  'chevauchement : la réservation publique refuse un coiffeur déjà occupé'
);
reset role;

-- Délai: checked by the database, with the delay set by the manager.

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f001"}', true);
select throws_ok(
  $$ select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000f123') $$,
  'P0001', 'Pour ce rendez-vous, appelez le salon',
  'délai : annulation refusée à moins de 24 heures du rendez-vous'
);
select throws_ok(
  $$ select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000f123', now() + interval '3 days') $$,
  'P0001', 'Pour ce rendez-vous, appelez le salon',
  'délai : déplacement refusé à moins de 24 heures du rendez-vous'
);
select lives_ok(
  $$ select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000f125') $$,
  'délai : annulation acceptée à plus de 24 heures du rendez-vous'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f003"}', true);
update public.parametres_salon set delai_modification_heures = 48;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f001"}', true);
select throws_ok(
  $$ select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000f130') $$,
  'P0001', 'Pour ce rendez-vous, appelez le salon',
  'délai : le délai de 48 heures réglé par le gérant s''applique (rendez-vous dans 30 heures)'
);
reset role;

-- Accès: what each role can read or change directly.

set local role anon;
select is(pg_temp.lignes_visibles($$ select 1 from public.prestations
  where id = '00000000-0000-0000-0000-00000000f0a1' $$), 1::bigint,
  'accès public : voit une prestation active');
select is(pg_temp.lignes_visibles($$ select 1 from public.prestations
  where id = '00000000-0000-0000-0000-00000000f0a2' $$), 0::bigint,
  'accès public : ne voit pas une prestation désactivée');
select is(pg_temp.lignes_visibles('select 1 from public.clients'), 0::bigint,
  'accès public : ne lit aucune fiche client');
select is(pg_temp.lignes_visibles('select 1 from public.rendez_vous'), 0::bigint,
  'accès public : ne lit aucun rendez-vous');
select is(pg_temp.lignes_visibles('select 1 from public.employes')
  + pg_temp.lignes_visibles('select 1 from public.horaires')
  + pg_temp.lignes_visibles('select 1 from public.profils')
  + pg_temp.lignes_visibles('select 1 from public.parametres_salon'), 0::bigint,
  'accès public : ne lit ni employés, ni horaires, ni profils, ni paramètres');
select throws_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin)
     values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f0a1',
       '00000000-0000-0000-0000-00000000f0e2', '2030-01-09 09:00 Europe/Paris', '2030-01-09 09:30 Europe/Paris') $$,
  '42501', null,
  'accès public : ne crée pas de rendez-vous sans passer par la réservation'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f001"}', true);
select ok(pg_temp.lignes_visibles('select 1 from public.rendez_vous') > 0,
  'accès client : voit ses rendez-vous');
select is(pg_temp.lignes_visibles($$ select 1 from public.rendez_vous
  where client_id is distinct from (select id from public.clients where user_id = auth.uid()) $$), 0::bigint,
  'accès client : ne voit pas les rendez-vous des autres clients');
select is(pg_temp.lignes_visibles('select 1 from public.clients where user_id is distinct from auth.uid()'), 0::bigint,
  'accès client : ne lit que sa propre fiche');
select is(pg_temp.lignes_visibles('select 1 from public.employes')
  + pg_temp.lignes_visibles('select 1 from public.horaires')
  + pg_temp.lignes_visibles('select 1 from public.parametres_salon'), 0::bigint,
  'accès client : ne lit ni employés, ni horaires, ni paramètres');
select is(pg_temp.lignes_visibles($$ update public.rendez_vous set statut = 'annule' returning 1 $$), 0::bigint,
  'accès client : ne modifie pas un rendez-vous sans passer par les fonctions vérifiées');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f002"}', true);
select is(pg_temp.lignes_visibles('select 1 from public.rendez_vous'), 0::bigint,
  'accès client : un autre client ne voit aucun de ces rendez-vous');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f004"}', true);
select ok(pg_temp.lignes_visibles($$ select 1 from public.rendez_vous
  where employe_id = '00000000-0000-0000-0000-00000000f0e1' $$) > 0,
  'accès employé : voit ses rendez-vous');
select is(pg_temp.lignes_visibles($$ select 1 from public.rendez_vous
  where employe_id <> '00000000-0000-0000-0000-00000000f0e1' $$), 0::bigint,
  'accès employé : ne voit pas les rendez-vous des autres coiffeurs');
select is(pg_temp.lignes_visibles('select 1 from public.clients'), 0::bigint,
  'accès employé : ne lit aucune fiche client');
select is(pg_temp.lignes_visibles($$ select 1 from public.employes
  where id <> '00000000-0000-0000-0000-00000000f0e1' $$), 0::bigint,
  'accès employé : ne lit que sa propre fiche employé');
select is(pg_temp.lignes_visibles($$ update public.rendez_vous set statut = 'annule' returning 1 $$), 0::bigint,
  'accès employé : ne modifie aucun rendez-vous');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f003"}', true);
select is(pg_temp.lignes_visibles($$ select distinct employe_id from public.rendez_vous
  where prestation_id = '00000000-0000-0000-0000-00000000f0a1' $$), 2::bigint,
  'accès gérant : voit les rendez-vous de tous les coiffeurs');
select is(pg_temp.lignes_visibles($$ select 1 from public.clients
  where user_id in ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f002') $$), 2::bigint,
  'accès gérant : lit les fiches clients');
select is(pg_temp.lignes_visibles($$ update public.rendez_vous set statut = 'annule'
  where id = '00000000-0000-0000-0000-00000000f102' returning 1 $$), 1::bigint,
  'accès gérant : annule un rendez-vous');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f005"}', true);
select is(pg_temp.lignes_visibles('select 1 from public.rendez_vous')
  + pg_temp.lignes_visibles('select 1 from public.clients')
  + pg_temp.lignes_visibles('select 1 from public.employes')
  + pg_temp.lignes_visibles('select 1 from public.horaires')
  + pg_temp.lignes_visibles('select 1 from public.parametres_salon'), 0::bigint,
  'accès sans profil : un compte connecté sans profil ne voit rien');
reset role;

select * from finish();
rollback;
