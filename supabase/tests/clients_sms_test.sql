-- Run with supabase test db. All fixtures and counter changes are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.clients (id, nom, telephone) values
('00000000-0000-0000-0000-00000000cc01', 'Nom conservé', '0639989801');
insert into auth.users (id, phone, raw_user_meta_data) values
('00000000-0000-0000-0000-00000000ca01', '33639989801', '{"role":"gerant"}');
select is_empty($$select * from public.profils where user_id = '00000000-0000-0000-0000-00000000ca01'$$,
  'Un téléphone non confirmé ne reçoit pas de rôle');
select is((select user_id from public.clients where telephone = '0639989801'), null::uuid,
  'Un téléphone non confirmé ne revendique pas une fiche');

update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000ca01';
select is((select role from public.profils where user_id = '00000000-0000-0000-0000-00000000ca01'), 'client',
  'Le téléphone confirmé reçoit le rôle client malgré les métadonnées forgées');
select is((select user_id from public.clients where id = '00000000-0000-0000-0000-00000000cc01'),
  '00000000-0000-0000-0000-00000000ca01'::uuid, 'La fiche existante est rattachée');
select is((select nom from public.clients where telephone = '0639989801'), 'Nom conservé', 'Le nom existant est conservé');
update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000ca01';
select is((select count(*) from public.clients where telephone = '0639989801'), 1::bigint, 'Le rattachement est idempotent');

insert into auth.users (id, phone, phone_confirmed_at) values
('00000000-0000-0000-0000-00000000ca02', '33739989802', now());
select is((select telephone from public.clients where user_id = '00000000-0000-0000-0000-00000000ca02'),
  '0739989802', 'Une nouvelle fiche normalise le téléphone confirmé');

insert into auth.users (id, email) values
('00000000-0000-0000-0000-00000000ca03', 'staff-sms-test@example.com');
insert into public.profils (user_id, role) values ('00000000-0000-0000-0000-00000000ca03', 'employe');
update auth.users set phone = '33639989803', phone_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000ca03';
select is((select role from public.profils where user_id = '00000000-0000-0000-0000-00000000ca03'), 'employe',
  'Le rôle employé est préservé');
select is_empty($$select * from public.clients where user_id = '00000000-0000-0000-0000-00000000ca03'$$,
  'Aucune fiche client créée pour un employé');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ca01"}', true);
select results_eq($$select id from public.clients$$,
  $$values ('00000000-0000-0000-0000-00000000cc01'::uuid)$$, 'Le client lit uniquement sa fiche');
select is_empty($$select * from public.employes$$, 'Le client ne lit pas les employés');
select is_empty($$select * from public.rendez_vous$$, 'Aucun accès supplémentaire aux rendez-vous');
select throws_ok($$insert into public.profils (user_id, role) values ('00000000-0000-0000-0000-00000000ca01', 'gerant')$$,
  '42501', null, 'Le client ne peut pas se promouvoir');
select throws_ok($$select * from public.envois_codes_clients$$, '42501', null, 'Le client ne lit pas les codes');
select throws_ok($$select public.autoriser_code_client('33639989801')$$, '42501', null, 'Le client ne contourne pas le quota');
select throws_ok($$select public.sms_client_auth_hook('{}')$$, '42501', null, 'Le client ne peut pas invoquer le hook');
select is_empty($$update public.clients set user_id = '00000000-0000-0000-0000-00000000ca01'
  where telephone = '0739989802' returning id$$, 'Le client ne peut pas voler une fiche');

set local role anon;
select throws_ok($$select public.autoriser_code_client('33639989801')$$, '42501', null, 'Le public ne crée pas de permis');
select throws_ok($$select * from public.envois_codes_clients$$, '42501', null, 'Le public ne lit pas les codes');
reset role;

select ok(public.autoriser_code_client('33639989801'), 'Le premier envoi est autorisé');
select ok(not public.autoriser_code_client('33639989801'), 'Le deuxième envoi immédiat est refusé');
update public.envois_codes_clients set demandes = array[now() - interval '4 minutes', now() - interval '2 minutes']
where telephone = '33639989801';
select ok(public.autoriser_code_client('33639989801'), 'Le troisième envoi dans une heure est autorisé');
update public.envois_codes_clients set demandes = array[now() - interval '6 minutes', now() - interval '4 minutes', now() - interval '2 minutes']
where telephone = '33639989801';
select ok(not public.autoriser_code_client('33639989801'), 'Le quatrième envoi est refusé même après 60 secondes');
update public.envois_codes_clients set demandes = array[now() - interval '61 minutes'] where telephone = '33639989801';
select ok(public.autoriser_code_client('33639989801'), 'Le quota se libère après une heure');

set local role supabase_auth_admin;
select is(public.sms_client_auth_hook('{"user":{"phone":"33639989801"},"sms":{"otp":"123456"}}'),
  '{}'::jsonb, 'Auth peut déposer le code après autorisation');
select ok(public.sms_client_auth_hook('{"user":{"phone":"33639989801"},"sms":{"otp":"654321"}}') ? 'error',
  'Un permis ne sert qu’une fois');
select ok(public.sms_client_auth_hook('{"user":{"phone":"33639989802"},"sms":{"otp":"123456"}}') ? 'error',
  'Un appel Auth direct sans CAPTCHA est refusé');
reset role;
select is((select code from public.envois_codes_clients where telephone = '33639989801'), '123456',
  'Le code reste accessible uniquement au serveur');
select ok((select relrowsecurity from pg_class where oid = 'public.envois_codes_clients'::regclass), 'RLS activée sur les compteurs');

select * from finish();
rollback;
