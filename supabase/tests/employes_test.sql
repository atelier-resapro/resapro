-- Employees, working hours and overlapping appointments.
-- Run with `supabase test db`. Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Fixtures: one 30-minute service, two employees working Tuesday 9:00-12:00.
-- 2030-01-08 is a Tuesday.
insert into public.prestations (id, nom, duree_minutes, prix) values
  ('00000000-0000-0000-0000-0000000000a1', 'Test coupe', 30, 20);

insert into public.employes (id, nom) values
  ('00000000-0000-0000-0000-0000000000e1', 'Test Alice'),
  ('00000000-0000-0000-0000-0000000000e2', 'Test Bruno');

insert into public.employe_prestations (employe_id, prestation_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

insert into public.horaires (employe_id, jour_semaine, heure_debut, heure_fin) values
  ('00000000-0000-0000-0000-0000000000e1', 2, '09:00', '12:00'),
  ('00000000-0000-0000-0000-0000000000e2', 2, '09:00', '12:00');

insert into public.clients (id, nom, telephone) values
  ('00000000-0000-0000-0000-0000000000c1', 'Client test', '0639989901');

-- Alice: 10:00-10:30
insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000e1',
   '2030-01-08 10:00 Europe/Paris', '2030-01-08 10:30 Europe/Paris');

-- Overlap

select throws_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin) values
       ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000e1',
        '2030-01-08 10:15 Europe/Paris', '2030-01-08 10:45 Europe/Paris') $$,
  '23P01',
  null,
  'Deux rendez-vous confirmés qui se chevauchent pour le même employé sont refusés'
);

select lives_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin) values
       ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000e2',
        '2030-01-08 10:00 Europe/Paris', '2030-01-08 10:30 Europe/Paris') $$,
  'Même horaire pour un autre employé : accepté'
);

select lives_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin, statut) values
       ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000e1',
        '2030-01-08 10:00 Europe/Paris', '2030-01-08 10:30 Europe/Paris', 'annule') $$,
  'Un rendez-vous annulé peut chevaucher'
);

select lives_ok(
  $$ insert into public.rendez_vous (client_id, prestation_id, employe_id, debut, fin) values
       ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000e1',
        '2030-01-08 10:30 Europe/Paris', '2030-01-08 11:00 Europe/Paris') $$,
  'Un rendez-vous qui commence à la fin du précédent est accepté'
);

-- Free slots

select is(
  (select count(*) from public.creneaux_libres_employes(
     '2030-01-08', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1')
   where debut in ('2030-01-08 09:45 Europe/Paris', '2030-01-08 10:00 Europe/Paris',
                   '2030-01-08 10:15 Europe/Paris', '2030-01-08 10:45 Europe/Paris')),
  0::bigint,
  'Les débuts qui chevauchent un rendez-vous ne sont pas libres'
);

select is(
  (select array_agg(debut order by debut) from public.creneaux_libres_employes(
     '2030-01-08', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1')
   where debut >= '2030-01-08 11:00 Europe/Paris'),
  array['2030-01-08 11:00 Europe/Paris', '2030-01-08 11:15 Europe/Paris',
        '2030-01-08 11:30 Europe/Paris']::timestamptz[],
  'Pas de 15 minutes, la prestation finit avant la fin de la plage'
);

-- New booking function

select isnt(
  public.reserver_employe('Client deux', '06 39 98 99 02',
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2',
    '2030-01-08 11:00 Europe/Paris'),
  null,
  'reserver_employe crée un rendez-vous'
);

select is(
  (select fin from public.rendez_vous r
   join public.clients c on c.id = r.client_id
   where c.telephone = '0639989902'),
  '2030-01-08 11:30 Europe/Paris'::timestamptz,
  'La fin est calculée avec la durée de la prestation'
);

select throws_ok(
  $$ select public.reserver_employe('Client trois', '0639989903',
       '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2',
       '2030-01-08 11:15 Europe/Paris') $$,
  'P0001',
  'Ce créneau n''est plus disponible. Choisissez-en un autre.',
  'reserver_employe refuse un créneau déjà pris'
);

select results_eq(
  $$ select r.jour, r.heure from public.rendez_vous rv
     join public.clients c on c.id = rv.client_id
     cross join lateral public.recapitulatif(rv.id) r
     where c.telephone = '0639989902' $$,
  $$ values ('2030-01-08'::date, '11:00'::time) $$,
  'recapitulatif donne le jour et l''heure du salon'
);

-- Old booking function, on the manager's agenda

insert into public.creneaux (id, date, heure_debut) values
  ('00000000-0000-0000-0000-0000000000f1', '2030-01-09', '09:00');

do $$
begin
  perform public.reserver('Client quatre', '0639989904',
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1');
end;
$$;

select results_eq(
  $$ select e.est_gerant, r.debut, r.fin from public.rendez_vous r
     join public.employes e on e.id = r.employe_id
     where r.creneau_id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values (true, '2030-01-09 09:00 Europe/Paris'::timestamptz,
             '2030-01-09 09:30 Europe/Paris'::timestamptz) $$,
  'reserver (ancien) rattache le rendez-vous au gérant avec début et fin'
);

-- Closure

insert into public.fermetures (date) values ('2030-01-08');

select is_empty(
  $$ select * from public.creneaux_libres_employes(
       '2030-01-08', '00000000-0000-0000-0000-0000000000a1') $$,
  'Un jour de fermeture du salon n''a aucun créneau libre'
);

-- The public reads none of the new tables

set local role anon;

select is_empty($$ select * from public.employes $$, 'anon ne lit pas employes');
select is_empty($$ select * from public.horaires $$, 'anon ne lit pas horaires');
select is_empty($$ select * from public.employe_prestations $$, 'anon ne lit pas employe_prestations');
select is_empty($$ select * from public.fermetures $$, 'anon ne lit pas fermetures');

reset role;

select * from finish();
rollback;
