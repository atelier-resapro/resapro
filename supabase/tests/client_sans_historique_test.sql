-- Exercise the actual Auth trigger as the Auth service, not as a table owner.
-- All account/profile/client fixtures are rolled back; no SMS is sent.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is_empty($$select id from public.clients where telephone = '0639989501'$$,
  'Le numéro de test ne possède aucune fiche ni aucun ancien rendez-vous');
set local role supabase_auth_admin;
select lives_ok($$insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000fa01', '33639989501')$$,
  'Auth peut provisionner un compte sans historique');
reset role;
select is_empty($$select user_id from public.profils
  where user_id = '00000000-0000-0000-0000-00000000fa01'$$,
  'Avant vérification le compte ne reçoit aucun profil');
select is_empty($$select id from public.clients where telephone = '0639989501'$$,
  'Avant vérification aucune fiche client n’est créée');

set local role supabase_auth_admin;
select lives_ok($$update auth.users set phone_confirmed_at = now(), last_sign_in_at = now()
  where id = '00000000-0000-0000-0000-00000000fa01'$$,
  'La première confirmation du téléphone sans rendez-vous ne bloque pas Auth');
reset role;
select ok((select phone_confirmed_at is not null from auth.users
  where id = '00000000-0000-0000-0000-00000000fa01'),
  'La confirmation du téléphone est enregistrée');
select is((select count(*) from public.clients where telephone = '0639989501'
  and user_id = '00000000-0000-0000-0000-00000000fa01'), 1::bigint,
  'Une unique fiche normalisée est créée et rattachée au nouveau compte');
select is((select role from public.profils where user_id = '00000000-0000-0000-0000-00000000fa01'),
  'client', 'Le compte reçoit le profil nécessaire à l’accès à l’espace client');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000fa01"}', true);
select is((select count(*) from public.clients), 1::bigint,
  'Le nouveau client connecté peut lire sa fiche avec la RLS');
select lives_ok($$select * from public.mes_rendez_vous()$$,
  'L’agenda du client sans historique se charge sans erreur');
select is_empty($$select * from public.mes_rendez_vous()$$,
  'L’espace client retourne une liste vide sans récupérer les rendez-vous d’autrui');
reset role;
select * from finish();
rollback;
