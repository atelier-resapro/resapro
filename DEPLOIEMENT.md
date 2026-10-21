# Déployer RésaPro

RésaPro se publie en trois parties, dans cet ordre : **migrations PostgreSQL →
configuration Supabase et Edge Functions → site statique Vite**. Le dépôt ne
contient pas de déploiement automatique : `.github/workflows/tests.yml` vérifie
le projet, mais ne le publie pas.

Les valeurs entre `<…>` sont à remplacer. Les commandes se lancent à la racine
du dépôt. Ce guide ne déclenche lui-même aucune opération en production.

## 1. Préparer la version et les environnements

1. Travailler sur une branche dédiée, ouvrir une pull request et attendre la
   réussite du workflow `Tests` avant fusion. Ne jamais pousser directement sur
   `main`. Noter le SHA Git exact à publier.
2. Utiliser Node.js **24** et une CLI Supabase compatible avec celle de la CI
   (**2.121.0** dans le workflow actuel). La dépendance npm Supabase peut être
   plus ancienne : vérifier `supabase --version` et employer la CLI validée.
3. Créer un projet Supabase de production distinct du projet de test, dans une
   région adaptée au public français. Relever sa référence, son URL et sa clé
   publique dans le tableau de bord. Le `project_id` du TOML ne suffit pas à
   identifier la cible des commandes distantes.
4. Réserver le domaine public et son certificat HTTPS. Dans les exemples,
   l'adresse canonique est `https://reservation.salon.fr`.
5. Utiliser un **clone réservé aux déploiements**, positionné sur le SHA validé,
   pour y lier la production. Conserver le clone de développement lié au projet
   de test : les tests de base utilisent par défaut le projet lié.
6. Avant toute mise à jour d'une production existante, vérifier la disponibilité
   d'une sauvegarde restaurable et, si prévu par l'offre, du PITR. Noter l'heure
   et tester la restauration sur un environnement séparé. Conserver aussi le
   précédent artefact du site, le SHA des fonctions et les réglages Auth.

Dans le clone de développement ou de recette, avec la configuration de test
du [README](README.md) et de [.env.tests.example](.env.tests.example) :

```sh
npm ci
npm run lint
npm run build
npm test
npm run test:db
npm run test:db:sabotage
npm run test:e2e
npm run test:e2e:parcours
```

Les tests navigateur et Auth réels demandent les prérequis décrits dans le
README ; la CI les prépare sur une pile Supabase locale jetable. **Ne lancer
aucune de ces suites contre la production**, même celles avec `rollback` : le
parcours client crée et supprime réellement ses données et la contre-épreuve
modifie temporairement les protections de la base.

## 2. Variables d'environnement

### Chez l'hébergeur du site

Configurer ces trois variables pour la compilation de production :

| Variable | Valeur attendue |
| --- | --- |
| `VITE_SUPABASE_URL` | URL du projet de production : `https://<reference-production>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé publique du même projet ; jamais une clé secrète ou `service_role` |
| `VITE_TURNSTILE_SITE_KEY` | Clé publique du widget Cloudflare Turnstile de production |

Vite intègre ces valeurs dans les fichiers envoyés au navigateur. Toute
modification demande une **nouvelle compilation et publication**. Ne définir
aucun secret dans une variable `VITE_*`. Les déploiements de recette utilisent
leur propre projet Supabase et leur propre configuration Turnstile.

### Dans les secrets des Edge Functions Supabase

| Variable | Valeur / usage |
| --- | --- |
| `SITE_URL` | `https://reservation.salon.fr` ; invitations vers `/mot-de-passe` et lien des SMS d'annulation |
| `SMS_API_KEY` | Clé API Brevo pour les codes de connexion et les notifications de rendez-vous |
| `TURNSTILE_SECRET_KEY` | Clé secrète réelle du widget Turnstile correspondant à la clé publique du site |
| `TURNSTILE_HOSTNAME` | Domaine exact du site, par exemple `reservation.salon.fr`, sans protocole, port ni chemin |
| `SUPABASE_URL` | Fournie automatiquement par Supabase aux fonctions hébergées |
| `SUPABASE_SERVICE_ROLE_KEY` | Fournie automatiquement par Supabase ; usage serveur exclusivement |

Saisir les quatre premières valeurs dans les secrets du tableau de bord, ou
préparer un fichier privé `supabase/functions/.env.production.local` contenant
uniquement ces valeurs, puis exécuter :

```sh
supabase secrets set --project-ref <reference-production> --env-file supabase/functions/.env.production.local
```

Ce fichier est ignoré par Git ; le conserver dans un emplacement protégé ou le
retirer après usage. Ne pas inscrire de clés réelles dans des commandes
conservées dans l'historique, dans le dépôt ou dans les logs.

**Ne pas configurer `TEST_PHONE_NUMBERS`, de codes OTP fixes ni de clés Turnstile
de test en production.** Le fichier `supabase/functions/.env.example` est
réservé aux tests locaux. Les variables de `.env.tests.example` ne sont pas
des variables de publication.

## 3. Appliquer les migrations en production

Dans le clone réservé aux déploiements :

```sh
supabase login
supabase link --project-ref <reference-production>
supabase migration list --linked
supabase db push --linked --dry-run
```

Vérifier dans le tableau de bord la référence de production et comparer
l'historique distant à la liste suivante. La CLI applique les migrations
manquantes par ordre de leur préfixe, pas selon la date du jour.

| Ordre | Fichier dans `supabase/migrations/` | Objet |
| --- | --- | --- |
| 1 | `20261012093512_4f7c1a52-8d3e-4b6a-9c21-7e5d0a3b8f14.sql` | Tables initiales, RLS et réservation par créneaux |
| 2 | `20261013141207_b81d6e0c-2a47-4f95-8e13-5c9a7d2f6b30.sql` | Disponibilités des créneaux |
| 3 | `20261014102845_e3a95c17-6b0d-42f8-a4d6-1f8c2b7e9d05.sql` | Validation de la réservation |
| 4 | `20261015085931_0a6d2f94-71c8-4e3b-b5a0-9d4e18c7f263.sql` | Récapitulatif public |
| 5 | `20261020100000_aae4fe6d-dc94-48c7-ada6-88fa72aa11fe.sql` | Employés, horaires, fermetures, reprise des rendez-vous et contrainte anti-chevauchement |
| 6 | `20261020140000_5c4aeb7b-85e3-4f7a-9389-620065d8233c.sql` | Profils, droits par rôle et agenda employé |
| 7 | `20261020160000_a982a297-6509-4cae-b9eb-a3a4cb0b6605.sql` | Choix du coiffeur et attribution « Indifférent » |
| 8 | `20261021120000_connexion_client_sms.sql` | Rattachement client, quotas OTP et hook SMS Auth |
| 9 | `20261021160000_espace_client.sql` | Espace client, paramètres et délai de modification |
| 10 | `20261021180000_notifications_rendez_vous.sql` | Notifications d'annulation et de déplacement |
| 11 | `20261022090000_sms_confirmation_unique.sql` | Réclamation atomique du SMS de confirmation |

Pour une nouvelle base, créer **uniquement le compte gérant** à la main dans
Supabase Auth avant ce premier passage. La migration 5 le rattache au gérant
en choisissant le plus ancien compte ; la migration 6 lui attribue le profil
`gerant`. Pour une base existante, vérifier ce rattachement avant publication.
Si la migration 5 est déjà appliquée, vérifier `employes.user_id` sur la ligne
`est_gerant = true` avant la migration 6. Cette dernière refuse de continuer si
des comptes existent sans profil gérant initialisable. Ne pas attribuer ce rôle
à un compte client ou à un employé pour contourner l'erreur.

Sur une base contenant déjà des rendez-vous, répéter d'abord la migration 5
sur une copie protégée : elle convertit les anciens créneaux en dates
Europe/Paris et peut raccourcir une durée à l'heure du rendez-vous suivant.
Comparer les horaires et les durées avant et après.

Quand la cible, la sauvegarde et la simulation sont vérifiées :

```sh
supabase db push --linked
supabase migration list --linked
```

Ne pas ajouter `--include-seed` : `supabase/seed.sql` contient des clients,
employés et rendez-vous fictifs. Ne pas utiliser `db reset` en production.
Ne pas modifier une migration déjà appliquée ni forcer l'historique avec
`migration repair` pour masquer une différence. En cas d'échec, arrêter la
publication, vérifier l'état et l'historique avant toute reprise.

## 4. Configurer Supabase Auth et les fournisseurs

Le fichier [supabase/config.toml](supabase/config.toml) décrit notamment la pile
locale. Son application ne remplace pas les réglages du projet hébergé.

Dans le tableau de bord du projet de production :

1. Régler l'URL du site Auth sur `https://reservation.salon.fr` et autoriser la
   redirection exacte `https://reservation.salon.fr/mot-de-passe`.
2. Garder les **inscriptions publiques désactivées**. Le gérant est créé à la
   main, les employés sont invités par le gérant et les comptes téléphoniques
   sont provisionnés uniquement par la fonction serveur.
3. Activer le fournisseur **Phone** et exiger la confirmation téléphonique.
   Configurer des OTP de **6 chiffres**, leur expiration et au moins **60
   secondes** entre envois ; garder les limites Auth de vérification actives.
4. Dans Auth → Hooks → **Send SMS**, sélectionner la fonction PostgreSQL
   `public.sms_client_auth_hook`. Elle exige le permis obtenu après CAPTCHA.
   Ne pas ouvrir la connexion client tant que ce hook n'est pas activé.
5. Ne pas activer le CAPTCHA global Auth : le contrôle Turnstile est propre à
   `demander-code-client` et ne doit pas affecter les connexions du personnel.
6. Configurer un SMTP de production pour les invitations du personnel et
   vérifier l'expéditeur et la délivrabilité. Les identifiants SMTP se règlent
   dans Auth, pas dans les variables Vite ni dans `SMS_API_KEY`.
7. Dans Cloudflare, autoriser le domaine canonique du site sur le widget
   Turnstile. Le serveur vérifie son hostname et l'action `connexion-client`.
   Rediriger les variantes du domaine vers le domaine canonique.
8. Dans Brevo, vérifier l'envoi transactionnel avec l'expéditeur `RESAPRO`, les
   crédits et le plafond de dépenses ; désactiver toute recharge automatique
   non plafonnée. Le code ne configure pas ces paramètres du fournisseur.

Ne pas recopier le fournisseur Twilio factice ni les numéros de test du TOML
local dans le projet hébergé : l'envoi réel passe par le hook puis Brevo.

Après les migrations et l'enregistrement des secrets, déployer les trois
fonctions depuis le SHA validé :

```sh
supabase functions deploy demander-code-client --project-ref <reference-production>
supabase functions deploy inviter-employe --project-ref <reference-production>
supabase functions deploy envoyer-sms --project-ref <reference-production>
```

Le TOML fixe `verify_jwt = false` pour ces fonctions : elles contrôlent leurs
appels elles-mêmes. `inviter-employe` exige un gérant authentifié ; les SMS de
modification exigent un gérant ou le client propriétaire. La demande OTP et
la confirmation de réservation sont accessibles avant connexion, avec leurs
protections serveur. Conserver ce comportement au déploiement.

## 5. Publier le site et mettre le salon en service

Configurer chez l'hébergeur statique :

| Paramètre | Valeur |
| --- | --- |
| Version de Node.js | 24 |
| Installation | `npm ci` |
| Compilation | `npm run build` |
| Répertoire à publier | `dist/` |
| Domaine | Domaine canonique en HTTPS |
| Routage | Servir les fichiers existants ; réécrire les autres chemins vers `/index.html` avec statut 200 |

Cette réécriture est nécessaire à `BrowserRouter` : un rechargement direct sur
`/client`, `/gerant/connexion` ou `/mot-de-passe` doit charger l'application.
Utiliser le mécanisme de réécriture de l'hébergeur ; le dépôt n'en fournit pas
de configuration spécifique. Publier uniquement `dist/`, jamais les fichiers
d'environnement ou le répertoire du dépôt. `npm run preview` sert à la recette
locale du build, pas à l'hébergement de production.

Pour une mise à jour, valider d'abord la compatibilité de l'ancien site avec
les nouvelles migrations et fonctions. Si elle n'est pas garantie, prévoir
une fenêtre de maintenance et suspendre les écritures au niveau serveur ; une
simple page de maintenance ne bloque pas les appels directs aux API.

Après publication :

1. Vérifier le profil `gerant` et le lien vers son compte dans `employes`, puis
   se connecter sur `/gerant/connexion`.
2. Renseigner les prestations et tarifs réels, les employés, leurs mobiles,
   horaires et prestations autorisées ; inviter un employé et vérifier le lien
   `/mot-de-passe`. Sur une base neuve sans seed, associer explicitement chaque
   prestation au gérant ou aux employés qui la réalisent.
3. Régler le délai de modification dans `/gerant/parametres` (24 heures par
   défaut) et contrôler les jours de fermeture. L'agenda public utilise
   `horaires` et `fermetures` ; fermer les anciens `creneaux` ne crée pas une
   fermeture dans ce nouvel agenda.
4. Faire une recette manuelle avec des comptes et un mobile de contrôle :
   réservation, SMS de confirmation, connexion OTP, historique client,
   déplacement et annulation au-delà du délai. Vérifier les notifications au
   client et à l'employé, puis l'absence d'accès aux données d'un autre compte.
   Ces contrôles peuvent envoyer de vrais SMS ; annuler les rendez-vous de
   contrôle ensuite, sans supprimer l'historique.
5. Contrôler les rechargements des routes, les heures Europe/Paris et les logs
   des fonctions. Aucun téléphone, code OTP ni secret ne doit être journalisé.
   Vérifier aussi les informations de confidentialité et les coordonnées
   réelles du salon avant l'ouverture au public.
6. Consigner le SHA du site et des fonctions, l'historique des migrations,
   l'heure de publication et le résultat de la recette dans le suivi de version.

Un échec SMS ne doit pas annuler une réservation ou une modification réussie.
Pour annulations et déplacements, un nouvel appel autorisé à `envoyer-sms`
après le bail de cinq minutes reprend les destinataires en échec, au maximum
trois tentatives ; aucun traitement planifié n'est configuré. La confirmation
est réclamée une seule fois, même si Brevo échoue ensuite : ne pas effacer son
marqueur pour forcer un renvoi. Il n'existe pas de rappel automatique la veille.

## 6. Revenir en arrière

### Site ou Edge Function défectueux, données intactes

1. Noter l'incident, le SHA et l'heure ; limiter les écritures si nécessaire.
2. Republier l'artefact précédent depuis l'hébergeur. S'assurer qu'il contient
   les bonnes variables publiques de production. Si une recompilation est
   nécessaire, repartir du SHA précédent avec la même configuration de build.
3. Pour une fonction, utiliser un clone au SHA précédent et redéployer uniquement
   la fonction concernée avec `--project-ref <reference-production>`, après
   vérification de sa compatibilité avec le schéma actuel. Reprendre les
   commandes de la section 4 ; ne pas déployer une ancienne version qui retire
   une protection de sécurité.
4. Si la cause est un réglage, rétablir sa dernière valeur validée dans Auth ou
   les secrets Supabase. Les secrets et réglages distants ne reviennent pas en
   arrière avec Git. Une clé compromise doit être remplacée, pas restaurée.
5. Refaire la recette ciblée avant réouverture et contrôler les rendez-vous
   créés pendant l'incident. Garder les migrations déjà appliquées si elles
   sont compatibles avec la version rétablie.

### Migration défectueuse ou données altérées

Les migrations du dépôt n'ont pas de procédure inverse fournie. Un retour Git
ne restaure pas la base ; `migration repair` ne restaure ni schéma ni données.

1. Suspendre les écritures, y compris les appels directs de réservation et les
   fonctions concernées. Conserver l'état courant et les journaux utiles à la
   réconciliation, dans un emplacement à accès restreint.
2. Privilégier une **nouvelle migration corrective**, relue et testée sur une
   copie, qui conserve les rendez-vous, la RLS et les contraintes métier.
   L'appliquer selon la section 3 puis déployer le code compatible.
3. Si une restauration est indispensable, choisir la sauvegarde ou le point
   PITR antérieur à l'incident et appliquer la procédure de restauration du
   projet Supabase. Vérifier d'abord la restauration sur une cible isolée.
   Toute écriture postérieure à ce point peut être perdue : identifier les
   rendez-vous concernés et prévoir leur réconciliation avant la bascule.
4. Contrôler l'historique des migrations restauré, les comptes Auth, profils,
   liens clients, rendez-vous et contraintes. Réappliquer seulement les
   migrations validées manquantes et rétablir des versions compatibles du site
   et des fonctions. Reconfigurer si nécessaire URL, clés, secrets et hook Auth,
   notamment lorsque la restauration utilise un autre projet.
5. Vérifier les notifications avant toute reprise d'envoi : un SMS déjà accepté
   par Brevo ne peut pas être annulé et une restauration peut faire perdre son
   marqueur d'envoi. Éviter de rejouer les envois déjà effectués.
6. Refaire la recette et consigner les éventuelles pertes ou corrections de
   données avant de rouvrir le service.

Ne jamais supprimer à l'aveugle des tables ou colonnes pour « annuler » une
migration, désactiver la RLS pour débloquer l'interface, ou exécuter les seeds et
tests sur la production pendant la réparation.
