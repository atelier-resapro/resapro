# Welcome to your project

## Project info

This project was generated for a salon booking app (RésaPro).

## How can I edit this code?

You need Node.js and npm installed.

```sh
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Go to the project directory
cd resapro

# Step 3: Install the dependencies
npm install

# Step 4: Start the development server (http://localhost:8080)
npm run dev
```

## What technologies are used for this project?

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase

## Connexion client par SMS

La page `/client/connexion` accepte les mobiles français (06/07, +33 ou 0033).
Le serveur vérifie Cloudflare Turnstile et limite chaque numéro à **3 demandes
par heure glissante**, espacées d’au moins **60 secondes**. Le code est généré
et vérifié par Supabase Auth. Les inscriptions publiques restent désactivées :
la fonction serveur crée uniquement un compte téléphone non confirmé.
Après vérification du code, un trigger rattache la fiche client par téléphone
et crée le rôle `client`. Le nom d’une fiche existante et les rôles du personnel
sont conservés. Les clients ne peuvent lire que leur propre fiche.

Les connexions et invitations du gérant et des employés ne sont pas modifiées.
Le CAPTCHA est propre au parcours client : ne pas activer le CAPTCHA global
Auth pour cette fonctionnalité, car il s’appliquerait aussi aux mots de passe.

### Essai local sans vrai SMS

Prérequis : Docker démarré, Node.js 24+, dépendances installées.

1. `npx supabase start` applique les migrations à la création de la pile locale.
   Pour une pile déjà initialisée, appliquer les nouvelles migrations avec
   `npx supabase migration up --local` (sans réinitialiser les données).
2. Copier `supabase/functions/.env.example` vers
   `supabase/functions/.env.local`. Il contient uniquement les clés factices
   officielles de Turnstile, aucune clé Brevo.
3. Lancer `npx supabase functions serve demander-code-client --env-file supabase/functions/.env.local`.
4. Dans `.env.local`, utiliser l’URL **locale** `http://127.0.0.1:54321`, sa clé
   publique (`npx supabase status`) et
   `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA`. Ne pas écraser les valeurs
   du projet distant si elles servent déjà : utiliser un fichier de mode Vite
   distinct et démarrer avec `npm run dev -- --mode <mode>`.
5. Ouvrir `/client/connexion` : **06 39 98 99 01**, code **123456**.
   Le code **000000** doit afficher « Code incorrect ou expiré ».
   Autre numéro local : **06 39 98 99 02**, code **654321**.

Ces numéros sont définis dans `[auth.sms.test_otp]` et ne déclenchent aucun SMS.
Le fournisseur Twilio du TOML est une configuration locale factice exigée par
la CLI ; le hook SQL remplace l’envoi. Ne pas recopier ces paramètres de test
dans un projet de production. Avec la clé secrète de test exacte, le serveur
accepte aussi la réponse Turnstile `hostname=example.com` et
`metadata.result_with_testing_key=true` (booléen, sans champ `action` requis)
sur un projet hébergé de test. L’absence de
code produit par le hook n’est tolérée que pour les numéros du secret serveur
`TEST_PHONE_NUMBERS` (liste séparée par des virgules, format `33639981234`, sans
`+`). Sans ce secret, aucun numéro n’est implicitement autorisé. Les mêmes
numéros doivent être configurés dans les numéros de test de Supabase Auth sur
ce projet. Le fichier d’exemple local reprend les deux numéros ci-dessus.
Aucun secret réel ne va dans un fichier `VITE_*`.

### Tests

```sh
npm test                 # validation des numéros et messages d’erreur
npm run lint
npm run build
npm run test:e2e:ui       # formulaire dans Chrome, API et CAPTCHA simulés
npm run test:db          # pgTAP : rattachement, RLS, rôles, quotas, hook
```

`npm run test:e2e` inclut aussi le scénario avec **le vrai Supabase local**,
son Auth et Turnstile en mode test. Démarrer la pile et la fonction comme
ci-dessus, définir `SUPABASE_TEST_ANON_KEY` avec sa clé publique locale, puis
lancer cette commande. Chrome doit être installé. Le serveur Vite des tests
utilise exclusivement `127.0.0.1:54321` et le port 4179 ; il ne contacte pas le
projet distant. Le scénario essaie d’abord le mauvais code, puis le bon,
vérifie le succès, le maintien de session après rechargement et la déconnexion.
Pour le rejouer immédiatement, attendre le délai ou utiliser une base locale
de test neuve : les tests ne désactivent pas le quota serveur.

### Mise en service sur Supabase hébergé

Le TOML ne configure pas automatiquement Auth sur le projet hébergé.
Après application de la migration et déploiement de `demander-code-client` :

- Activer le fournisseur **Phone**, conserver les inscriptions publiques
  désactivées et exiger la confirmation du téléphone (pas d’auto-confirmation).
- Dans Auth → Hooks → **Send SMS**, sélectionner la fonction PostgreSQL
  `public.sms_client_auth_hook`. Ce hook est indispensable : il bloque les
  appels directs à Auth dépourvus du permis obtenu après CAPTCHA, puis dépose
  le code pour l’envoi par la fonction serveur.
- Configurer la longueur OTP à **6 chiffres**, l’expiration souhaitée et un
  délai d’envoi d’au moins 60 secondes dans les paramètres Phone. Conserver
  aussi les limites Auth sur les tentatives de vérification.
- Créer un widget Turnstile pour le domaine du site, puis définir
  `VITE_TURNSTILE_SITE_KEY` avec sa clé publique. Dans les **secrets Supabase**,
  définir `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME` (nom de domaine sans
  protocole ni chemin) et `SMS_API_KEY` (Brevo, comme pour les notifications).
- Ne pas ajouter les codes fixes de test au projet de production. Pour une
  recette distante, utiliser un projet Supabase de test séparé ; le parcours
  automatisé fourni ici vise la pile locale.

La table interne `envois_codes_clients` est inaccessible aux rôles navigateur.
Elle stocke le compteur par numéro et temporairement le code du hook, effacé
avant l’appel Brevo. Les compteurs inactifs depuis 24 heures sont supprimés
lors des demandes suivantes. Les logs n’incluent ni numéros, ni codes, ni clés.
Un échec d’envoi consomme le quota, pour empêcher les réessais en boucle.

Références : [connexion téléphone Supabase](https://supabase.com/docs/guides/auth/phone-login),
[Send SMS hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook),
[clés de test Turnstile](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

### Espace client et délai de modification

Après connexion, `/client` présente les rendez-vous à venir puis les passés,
avec les annulations conservées en dessous. Le gérant règle le délai minimum
dans `/gerant/parametres` (24 heures initialement, en heures entières).
Ce réglage s’applique immédiatement aux réservations existantes.
Sous le délai, les actions disparaissent et le client est invité à appeler le salon.
Les dates et heures des rendez-vous sont affichées dans le fuseau Europe/Paris.

La migration `20261021160000_espace_client.sql` doit être appliquée avant de
mettre cette interface en service. `mes_rendez_vous` ne retourne que les
rendez-vous du client connecté ; la RLS protège aussi les lectures directes.
Les écritures directes restent interdites au client.
`modifier_mon_rendez_vous` verrouille le rendez-vous, vérifie son propriétaire,
son statut et le délai, puis annule ou déplace. Un déplacement conserve la
prestation, l’employé et la durée initiale ; les disponibilités excluent seulement
le rendez-vous déplacé et respectent les horaires, fermetures et chevauchements.
Les contraintes de la base protègent aussi contre les réservations simultanées.
Le déplacement d’un ancien rendez-vous à créneau fixe le fait passer dans le
système d’agenda par employé (`creneau_id` devient nul).

`supabase/tests/espace_client_test.sql` vérifie l’isolation entre clients,
les modifications autorisées et refusées, les fermetures et les paramètres.
Exécuter `npm run test:db` avec la pile Supabase locale démarrée.
`npm run test:e2e:ui` inclut les parcours client et gérant avec API simulée,
ainsi qu’un contrôle mobile 375 × 667 montrant deux rendez-vous à venir sans
défilement. Au-delà de la hauteur disponible, la liste reste défilable.
