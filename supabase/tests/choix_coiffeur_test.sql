-- Choice of the hairdresser: employees of a service, booking with and without choice.
-- Run with `supabase test db`. Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- Fixtures: two 30-minute services. Alice and Bruno do the first one,
-- only Alice does the second one. Both work Tuesday 9:00-12:00.
-- 2030-01-08 and 2030-01-15 are Tuesdays. Bruno is off on 2030-01-15.
insert into public.prestations (id, nom, duree_minutes, prix) values
  ('00000000-0000-0000-0000-0000000000a1', 'Test coupe', 30, 20),
  ('00000000-0000-0000-0000-0000000000a2', 'Test couleur', 30, 50);

insert into public.employes (id, nom) values
  ('00000000-0000-0000-0000-0000000000e1', 'Test Alice'),
  ('00000000-0000-0000-0000-0000000000e2', 'Test Bruno');

insert into public.employe_prestations (employe_id, prestation_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2');

insert into public.horaires (employe_id, jour_semaine, heure_debut, heure_fin) values
  ('00000000-0000-0000-0000-0000000000e1', 2, '09:00', '12:00'),
  ('00000000-0000-0000-0000-0000000000e2', 2, '09:00', '12:00');

insert into public.fermetures (date, employe_id) values
  ('2030-01-15', '00000000-0000-0000-0000-0000000000e2');

insert into public.clients (id, nom, telephone) values
  ('00000000-0000-0000-0000-0000000000c1', 'Client test', '0639989901');

-- Alice already has two appointments on 2030-01-08: 10:00 and 11:00.
insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000e1',
   '2030-01-08 10:00 Europe/Paris', '2030-01-08 10:30 Europe/Paris'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000e1',
   '2030-01-08 11:00 Europe/Paris', '2030-01-08 11:30 Europe/Paris');

-- Employees of a service

select results_eq(
  $$ select employe_nom from public.employes_prestation('00000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('Test Alice'), ('Test Bruno') $$,
  'employes_prestation liste les employés qui font la prestation'
);

select results_eq(
  $$ select employe_nom from public.employes_prestation('00000000-0000-0000-0000-0000000000a2') $$,
  $$ values ('Test Alice') $$,
  'Une prestation qu''un seul employé sait faire ne propose que lui'
);

select is(
  (select array_agg(distinct employe_id) from public.creneaux_libres_employes(
     '2030-01-08', '00000000-0000-0000-0000-0000000000a2')),
  array['00000000-0000-0000-0000-0000000000e1']::uuid[],
  'Avec « indifférent », les créneaux de cette prestation sont tous ceux de cet employé'
);

-- Closure of one employee

select is_empty(
  $$ select * from public.creneaux_libres_employes(
       '2030-01-15', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2') $$,
  'Un employé en fermeture ne propose aucun créneau'
);

select is(
  (select count(*) from public.creneaux_libres_employes(
     '2030-01-15', '00000000-0000-0000-0000-0000000000a1')
   where employe_id = '00000000-0000-0000-0000-0000000000e2'),
  0::bigint,
  'Avec « indifférent », l''employé en fermeture n''apparaît pas'
);

-- Bookings, in this order (a statement does not see the rows it inserts,
-- so the checks are separate statements, by phone number):
--   0639989905: "Indifférent" on 2030-01-15 9:00, Bruno is off.
--   0639989902: Alice chosen on 2030-01-08 9:00 (Alice now has 3 appointments that day).
--   0639989903: "Indifférent" at 9:30, Alice and Bruno free, Bruno has none.
--   0639989904: "Indifférent" at 10:00, Alice busy.
do $$
begin
  perform public.reserver_employe('Client fermeture', '0639989905',
    '00000000-0000-0000-0000-0000000000a1', null, '2030-01-15 09:00 Europe/Paris');
  perform public.reserver_employe('Client choix', '0639989902',
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1',
    '2030-01-08 09:00 Europe/Paris');
  perform public.reserver_employe('Client indifferent', '0639989903',
    '00000000-0000-0000-0000-0000000000a1', null, '2030-01-08 09:30 Europe/Paris');
  perform public.reserver_employe('Client dix heures', '0639989904',
    '00000000-0000-0000-0000-0000000000a1', null, '2030-01-08 10:00 Europe/Paris');
end;
$$;

select is(
  (select r.employe_id from public.rendez_vous r
   join public.clients c on c.id = r.client_id where c.telephone = '0639989905'),
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  'Avec « indifférent », l''employé en fermeture n''est jamais choisi'
);

select is(
  (select r.employe_id from public.rendez_vous r
   join public.clients c on c.id = r.client_id where c.telephone = '0639989902'),
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  'Réservation avec choix du coiffeur : le rendez-vous est pour lui'
);

select is(
  (select r.employe_id from public.rendez_vous r
   join public.clients c on c.id = r.client_id where c.telephone = '0639989903'),
  '00000000-0000-0000-0000-0000000000e2'::uuid,
  'Réservation sans choix : l''employé qui a le moins de rendez-vous ce jour-là'
);

select is(
  (select r.employe_id from public.rendez_vous r
   join public.clients c on c.id = r.client_id where c.telephone = '0639989904'),
  '00000000-0000-0000-0000-0000000000e2'::uuid,
  'Réservation sans choix : seul un employé libre est choisi'
);

-- Both busy at 10:00 now.
select throws_ok(
  $$ select public.reserver_employe('Client trop tard', '0639989906',
       '00000000-0000-0000-0000-0000000000a1', null, '2030-01-08 10:00 Europe/Paris') $$,
  'P0001',
  'Ce créneau n''est plus disponible. Choisissez-en un autre.',
  'Réservation sans choix refusée avec un message clair quand plus personne n''est libre'
);

select throws_ok(
  $$ select public.reserver_employe('Client mauvais choix', '0639989907',
       '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e2',
       '2030-01-08 09:30 Europe/Paris') $$,
  'P0001',
  'Ce créneau n''est plus disponible. Choisissez-en un autre.',
  'Un employé qui ne fait pas la prestation ne peut pas être réservé'
);

-- Confirmation page

select results_eq(
  $$ select r.coiffeur, r.heure from public.rendez_vous rv
     join public.clients c on c.id = rv.client_id
     cross join lateral public.recapitulatif(rv.id) r
     where c.telephone = '0639989903' $$,
  $$ values ('Test Bruno'::text, '09:30'::time) $$,
  'recapitulatif donne le prénom du coiffeur'
);

-- The public: the function only, never the tables

set local role anon;

select results_eq(
  $$ select employe_nom from public.employes_prestation('00000000-0000-0000-0000-0000000000a2') $$,
  $$ values ('Test Alice') $$,
  'anon peut appeler employes_prestation'
);

select is_empty($$ select * from public.employes $$, 'anon ne lit toujours pas employes');

reset role;

select * from finish();
rollback;
