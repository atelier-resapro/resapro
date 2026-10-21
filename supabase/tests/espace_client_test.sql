begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, phone, phone_confirmed_at) values
('00000000-0000-0000-0000-00000000da01', '33639989701', now()),
('00000000-0000-0000-0000-00000000da02', '33639989702', now());
insert into auth.users (id, email) values
('00000000-0000-0000-0000-00000000da03', 'parametres-test@example.com'),
('00000000-0000-0000-0000-00000000da04', 'sans-profil-test@example.com');
insert into public.profils (user_id, role) values ('00000000-0000-0000-0000-00000000da03', 'gerant');
insert into public.prestations (id, nom, duree_minutes, prix) values
('00000000-0000-0000-0000-00000000db01', 'Coupe espace client', 30, 35);
insert into public.employes (id, nom) values ('00000000-0000-0000-0000-00000000de01', 'Sophie test');
insert into public.employe_prestations values ('00000000-0000-0000-0000-00000000de01', '00000000-0000-0000-0000-00000000db01');
insert into public.horaires (employe_id, jour_semaine, heure_debut, heure_fin)
select '00000000-0000-0000-0000-00000000de01', j, '09:00', '18:00' from generate_series(1,7) j;
insert into public.rendez_vous (id, client_id, prestation_id, employe_id, debut, fin)
select '00000000-0000-0000-0000-00000000dd01', c.id,
  '00000000-0000-0000-0000-00000000db01', '00000000-0000-0000-0000-00000000de01',
  ((now() at time zone 'Europe/Paris')::date + 7 + time '10:00') at time zone 'Europe/Paris',
  ((now() at time zone 'Europe/Paris')::date + 7 + time '10:30') at time zone 'Europe/Paris'
from public.clients c where user_id = '00000000-0000-0000-0000-00000000da01';
insert into public.rendez_vous (id, client_id, prestation_id, employe_id, debut, fin)
select '00000000-0000-0000-0000-00000000dd02', client_id, prestation_id, employe_id,
  debut + interval '1 hour', fin + interval '1 hour' from public.rendez_vous
where id = '00000000-0000-0000-0000-00000000dd01';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000da02"}', true);
select is_empty($$select * from public.rendez_vous$$, 'Un autre client ne voit pas le rendez-vous (RLS)');
select is_empty($$select * from public.mes_rendez_vous()$$, 'Un autre client ne voit pas le récapitulatif');
select is_empty($$select * from public.creneaux_deplacement_client('00000000-0000-0000-0000-00000000dd01', current_date + 7)$$,
  'Un autre client ne peut pas consulter les déplacements');
select throws_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd01')$$,
  'P0001', 'Rendez-vous introuvable.', 'Un autre client ne peut pas annuler');
select throws_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd01', now() + interval '8 days')$$,
  'P0001', 'Rendez-vous introuvable.', 'Un autre client ne peut pas déplacer');
select is_empty($$select * from public.parametres_salon$$, 'Le client ne lit pas les paramètres');
select is_empty($$update public.parametres_salon set delai_modification_heures = 0 returning id$$,
  'Le client ne change pas le délai');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000da01"}', true);
select is((select count(*) from public.mes_rendez_vous()), 2::bigint, 'Le propriétaire voit ses rendez-vous');
select is_empty($$update public.rendez_vous set statut = 'annule' returning id$$,
  'Même le propriétaire ne peut pas contourner les fonctions SQL');
select throws_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd01',
  (select debut from public.rendez_vous where id = '00000000-0000-0000-0000-00000000dd02'))$$,
  'P0001', 'Ce créneau n''est plus disponible. Choisissez-en un autre.', 'Un horaire occupé est refusé');
select throws_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd01',
  (((now() at time zone 'Europe/Paris')::date + 7) + time '08:00') at time zone 'Europe/Paris')$$,
  'P0001', 'Ce créneau n''est plus disponible. Choisissez-en un autre.', 'Un horaire hors ouverture est refusé');
select lives_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd01',
  (select debut + interval '15 minutes' from public.rendez_vous where id = '00000000-0000-0000-0000-00000000dd01'))$$,
  'Le client déplace son rendez-vous, même avec chevauchement de son ancien horaire');
select is((select (fin - debut) from public.rendez_vous where id = '00000000-0000-0000-0000-00000000dd01'),
  interval '30 minutes', 'La durée est conservée');
select is((select prestation_id from public.rendez_vous where id = '00000000-0000-0000-0000-00000000dd01'),
  '00000000-0000-0000-0000-00000000db01'::uuid, 'La prestation est conservée');
select is((select employe_id from public.rendez_vous where id = '00000000-0000-0000-0000-00000000dd01'),
  '00000000-0000-0000-0000-00000000de01'::uuid, 'Le coiffeur est conservé');
select lives_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd01')$$,
  'Le client annule après avoir déplacé');
select is((select statut from public.rendez_vous where id = '00000000-0000-0000-0000-00000000dd01'), 'annule',
  'Le rendez-vous est conservé comme annulé');
select throws_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd01')$$,
  'P0001', 'Ce rendez-vous est déjà annulé.', 'Une seconde annulation est refusée');

reset role;
update public.rendez_vous set debut = now() + interval '23 hours', fin = now() + interval '23 hours 30 minutes'
where id = '00000000-0000-0000-0000-00000000dd02';
set local role authenticated;
select throws_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd02')$$,
  'P0001', 'Pour ce rendez-vous, appelez le salon', 'Annulation sous 24 heures refusée côté serveur');
select throws_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd02', now() + interval '7 days')$$,
  'P0001', 'Pour ce rendez-vous, appelez le salon', 'Déplacement sous 24 heures refusé côté serveur');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000da03"}', true);
select lives_ok($$update public.parametres_salon set delai_modification_heures = 12$$, 'Le gérant modifie le délai');
select throws_ok($$update public.parametres_salon set delai_modification_heures = -1$$, '23514', null, 'Délai négatif refusé');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000da01"}', true);
select lives_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd02')$$,
  'Le nouveau délai s’applique aux réservations existantes');

reset role;
update public.rendez_vous set statut = 'confirme',
  debut = (((now() at time zone 'Europe/Paris')::date + 8) + time '10:00') at time zone 'Europe/Paris',
  fin = (((now() at time zone 'Europe/Paris')::date + 8) + time '10:30') at time zone 'Europe/Paris'
where id = '00000000-0000-0000-0000-00000000dd01';
insert into public.fermetures (date, employe_id) values
((now() at time zone 'Europe/Paris')::date + 9, '00000000-0000-0000-0000-00000000de01');
insert into public.fermetures (date) values ((now() at time zone 'Europe/Paris')::date + 10);
set local role authenticated;
select is_empty($$select * from public.creneaux_deplacement_client('00000000-0000-0000-0000-00000000dd01',
  (now() at time zone 'Europe/Paris')::date + 9)$$, 'Fermeture employé respectée');
select throws_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd01',
  (((now() at time zone 'Europe/Paris')::date + 10) + time '10:00') at time zone 'Europe/Paris')$$,
  'P0001', 'Ce créneau n''est plus disponible. Choisissez-en un autre.', 'Fermeture salon respectée côté serveur');
reset role;
update public.parametres_salon set delai_modification_heures = 0;
update public.rendez_vous set debut = now() - interval '2 hours', fin = now() - interval '90 minutes'
where id = '00000000-0000-0000-0000-00000000dd01';
set local role authenticated;
select throws_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd01')$$,
  'P0001', 'Pour ce rendez-vous, appelez le salon', 'Même avec un délai nul, un rendez-vous passé est protégé');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000da04"}', true);
select is_empty($$select * from public.mes_rendez_vous()$$, 'Un compte sans profil ne voit rien');
set local role anon;
select throws_ok($$select public.mes_rendez_vous()$$, '42501', null, 'Le public ne lit pas les rendez-vous clients');
select throws_ok($$select public.modifier_mon_rendez_vous('00000000-0000-0000-0000-00000000dd01')$$,
  '42501', null, 'Le public ne modifie pas les rendez-vous clients');
reset role;
select ok((select relrowsecurity from pg_class where oid = 'public.parametres_salon'::regclass), 'RLS des paramètres activée');
select * from finish();
rollback;
