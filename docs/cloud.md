# Base en ligne, compte invisible, synchronisation (lot 10)

Cahier : [docs/lot-10.md](lot-10.md) ; avancement : [docs/lot-10-avancement.md](lot-10-avancement.md).

## Choix

- **Supabase, offre gratuite, sans carte bancaire** (Guillaume crée le projet lui-même). Volume : 2 à 5 joueurs.
- **Aucune bibliothèque** : client maison (`src/net/supabase.js`) — connexion anonyme (GoTrue `/auth/v1/signup`),
  renouvellement du jeton (`/auth/v1/token?grant_type=refresh_token`), appels de fonctions (`/rest/v1/rpc/…`).
- **L'appli ne touche jamais les tables** : elle n'appelle que les fonctions `strela_*` de `supabase/schema.sql`
  (« security definer », elles vérifient `auth.uid()`). Les tables ont la sécurité par ligne (RLS) : lecture de ses
  données et de celles de ses amis acceptés, aucune écriture directe (droits retirés à `anon` et `authenticated`).
- **Compte = profil, distinct de la connexion.** Le téléphone tire l'identifiant du profil (UUID) et un secret de
  20 caractères (`settings.cloudAccount`, donc dans la sauvegarde et l'export). La base ne garde que l'empreinte
  (sha256) du secret. Chaque connexion anonyme (téléphone, réinstallation, second téléphone, base restaurée) se
  rattache au profil par `strela_compte(profil, secret)` (table `appareil` : connexion → profil). L'identifiant du
  compte ne change donc jamais, même si Supabase oublie la connexion anonyme.
- **Récupération** : le code de récupération (Réglages › Compte et amis › Mon compte) = identifiant + secret +
  contrôle CRC-8, 47 caractères en base 32 de Crockford par groupes de 5 (`src/engine/cloud.js`). Aussi dans chaque
  sauvegarde ; REMPLACER TOUT reprend le compte de la sauvegarde, FUSIONNER garde celui du téléphone.
- Connexion et état de la synchronisation : réglages `cloudAuth` et `cloudSync` (base du téléphone), jamais exportés.
- **Hors ligne d'abord** : synchronisation en arrière-plan (`src/ui/cloud.js` › `syncNow`) à l'ouverture, au retour
  du réseau (`online`), au retour dans l'appli après 5 min, sur demande (SYNCHRONISER MAINTENANT) ; les étapes
  suivantes du lot s'y ajoutent par `addSyncStep`. Une erreur ne bloque rien ; elle est notée (Réglages, journal
  « SYNCHRO »).
- **Variante play** : pas d'INTERNET → `cloudSupport()` coupe tout proprement (message dans les Réglages).
- **Signalisation du mode en ligne** : gardée sur PeerJS + repli MQTT (0.20.1 corrigée, essayée sur le vrai serveur) ;
  Supabase Realtime n'est pas pris pour elle (une seule chose à la fois ; à reconsidérer si PeerJS lâche).

## Configuration

`src/net/cloudconfig.js` : `url` (https://<projet>.supabase.co) et `key` (clé **publique** : `sb_publishable_…` ou
l'ancienne `anon`, JWT). Vides : synchronisation coupée, « pas encore relié » dans les Réglages. Tests : la page prend
`?cloud=URL|CLÉ` (gardé pour la session). **Navigateur piloté** (`navigator.webdriver` : Playwright, captures, CI) sans
`?cloud` : synchronisation coupée, jamais le vrai projet (le 25/11, une série de tests lancée avant cette règle y a créé
24 comptes d'essai ; test de non-régression dans tests/cloud-parcours.test.js).

Côté Supabase (Guillaume) : projet en région UE (Paris `eu-west-3` ou Francfort), Authentication › Sign In / Providers
› **Allow anonymous sign-ins** activé ; SQL Editor : coller `supabase/schema.sql`, Run. Le fichier est rejouable : une
version plus récente se colle par-dessus.

## Fonctions (supabase/schema.sql)

| Fonction | Rôle |
|---|---|
| `strela_compte(p_profil, p_secret)` | crée le profil (code d'ami tiré) ou rattache la connexion ; `nouveau` vrai si le profil vient d'être créé (base reconstruite : le téléphone renvoie tout) |
| `strela_mon_compte()` | mon profil et mon code d'ami (note aussi la dernière activité) |
| `strela_profil(p)` | pseudo, avatar (photo ≤ 300 ko), animation, jeux de fléchettes, `extra` (champs à venir), `fmt` |
| `strela_supprimer_compte()` | tout ce qui est en ligne pour ce compte (cascade) et ses connexions anonymes |
| `strela_amis()` / `strela_demander_ami(code)` / `strela_repondre_ami(autre, oui)` / `strela_retirer_ami(autre)` | amis (étape 2) |
| `strela_envoyer(parties)` / `strela_supprimer(ids)` / `strela_recevoir(depuis_us, apres_id, seulement)` | parties (étape 4) ; seul le créateur écrit ; suppression douce (`etat = supprimee`, `donnees` vidées), purge après 60 jours ; curseur (maj en µs, id) |
| `strela_ping()` | réveil (seule fonction ouverte à `anon`) et purge |

Présence : canal Realtime privé `strela-presence`, politiques sur `realtime.messages` (posées seulement si Realtime est
là).

## Amis, parties, stats, présence (étapes 2 à 6)

Décisions détaillées par étape : docs/lot-10-avancement.md. Fichiers : src/ui/friends.js et screens/friends.js (amis,
rattachement), src/engine/merge.js (fusion), src/engine/sync.js et src/ui/gamesync.js (parties), store.js
(`applyFriends`, `mergeFriend`, `applyReceived`, `allGames`…), src/engine/badges.js (badges en ligne),
src/net/presence.js et src/ui/presence.js (présence). Ordre des étapes d'une synchronisation : compte, profil, amis,
parties (envoi, suppressions, réception), présence.

### Fin de partie (0.26.0)

- **Cause du 26/11** (journal du téléphone de Patrick) : un 501 en solo, volée de 135, laissé sur « SÉANCE FINIE » sans
  TERMINER : la séance n'était pas rangée, donc absente de ses stats. Même piège pour une vraie partie X01 ou Cricket :
  rangée seulement par ACCUEIL ou REVANCHE (le retour d'Android sur l'écran de fin la laissait « en cours »).
- **Dès la dernière fléchette** : l'enregistrement en cours garde `finishedAt` (instant de la fin, écrit dans la base par
  `saveCurrent` / `saveCk` / `saveTr`, effacé si ANNULER ou ENCORE UNE SÉRIE le rouvre ; noté une fois au besoin pour
  un enregistrement fini avant la 0.26.0). `finishedOpenGame()`, `finishedOpenCk()`, `finishedOpenTraining()` en donnent
  la copie close (`endedAt = finishedAt`) : `allGames()` / `allCkGames()` / `allTrainings()` l'ajoutent (stats, records,
  badges, classement) et `ownRecords()` l'envoie ; `gameFinished()` lance la synchronisation à la dernière fléchette.
- Le rangement (ACCUEIL, REVANCHE, TERMINER…) garde `endedAt = finishedAt` : même empreinte, rien n'est renvoyé.
- La partie en cours est exclue de ses propres records en direct (`recordsOf`, game.js) ; supprimer la partie en cours
  déjà envoyée est propagé (`noteDeleted`). Historique : la partie n'y entre qu'une fois rangée (inchangé).
- Test : tests/fin-poussee-parcours.test.js.

### Séances d'un ami (0.24.1, lot 9.6 A)

- **Cause du 26/11** (journal du Pixel de Guillaume) : Patrick ajouté en ami à 21:09, 4 parties ou séances reçues de chez
  lui sur la fiche « u:<uuid> » ; 20 s plus tard, son joueur local « Patrick » est rattaché (0.23.3). La fusion de la
  0.23.3 ne reprenait que les parties avec moi : les séances de chez lui (store.friendTrainings) restaient sur
  « u:<uuid> », fiche supprimée à la fusion — à personne, invisibles. La 0.23.4 a corrigé la fusion, pas les données
  déjà faites ; et rien ne les faisait recevoir de nouveau (curseur passé, `friendsKey` inchangé).
- **Réparation** (store.js › `repairOrphans`, à chaque lancement, sans réseau) : tout ce qui est noté « u:<uuid> » alors
  qu'un joueur local porte `friend = uuid` lui revient.
- **Reprise complète une fois** (gamesync.js › `RESYNC`) : au premier passage d'une version ≥ 0.24.1, chaque téléphone
  renvoie tout (`resent`) et reçoit tout depuis le début (`resync`) ; chaque reçue remplace la copie de même
  identifiant (aucun doublon). Monter `RESYNC` refait la même chose chez tous. Bouton RESYNCHRONISER du profil d'un ami
  (`resyncAll` : `sent` vidé, `full`).
- **Séance finie restée ouverte** (écran de fin sans TERMINER, appli quittée) : elle part quand même
  (`finishedOpenTraining`) et la synchronisation part dès la dernière fléchette. Depuis la 0.26.0 : fin = `finishedAt`
  (instant de la dernière fléchette, gardé dans la base), TERMINER la range avec cette même fin, sans renvoi ; elle compte
  aussi dans les stats du téléphone (« Fin de partie » ci-dessus). La copie reçue de sa propre séance en cours est ignorée.
- **Jeu de fléchettes inconnu** : jamais un motif de rejet (le jeu n'est lu qu'à l'affichage, `anySetById`) ; affiché
  « Jeu inconnu », nommé dès que les jeux de l'ami arrivent avec son profil.
- **Journal** (SYNCHRO) : « envoi : N partie(s), M séance(s) », « envoi refusé : … », « réception : … (tout repris) »,
  « réception rejetée : séance <id> (raison) » (illisible, pas finie, fléchettes illisibles), « séances en ligne de
  « X » vues : N », « réparation : … ». Test : tests/seances-ami-parcours.test.js.

## Robustesse

- **Format** : colonne `fmt` (profil, partie) = `CLOUD_FORMAT` (1). Une appli plus ancienne ignore les champs qu'elle ne
  connaît pas ; si `fmt` est plus récent qu'elle, elle garde la donnée de côté et dit « Mets à jour Strela… » (étape 4).
- **Mise en veille** (projet gratuit inactif ~1 semaine) : action `.github/workflows/supabase.yml`, tâche `reveil`
  tous les 3 jours (`node tools/supabase.mjs ping`, clé publique). Reprise à la main si le projet est quand même en
  pause : tableau de bord Supabase › le projet › **Restore project** (gratuit), puis rien d'autre : les téléphones
  renvoient ce qui manque à la synchronisation suivante.
- **Sauvegarde de la base** : même action, tâche `copie` chaque lundi (ou Run workflow avec « copie ») : toutes les
  tables (`node tools/supabase.mjs export`), compressées et chiffrées (AES-256, `openssl enc -pbkdf2`), en artefact
  gardé 90 jours. Secrets GitHub : `SUPABASE_SECRET_KEY` (clé secrète `sb_secret_…` ou `service_role`, Project Settings
  › API Keys) et `STRELA_BACKUP_PASSPHRASE` (sinon `STRELA_SIGNING_PASSPHRASE`). Sans clé secrète, la tâche ne fait rien.

### Restaurer la base

1. Actions › supabase › la dernière exécution › artefact `strela-base-AAAAMMJJ.json.gz.enc` ; le télécharger et le
   dézipper.
2. `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in strela-base-….json.gz.enc -out base.json.gz -pass pass:'PHRASE'`
   puis `gunzip base.json.gz`.
3. Projet (neuf ou vidé) : SQL Editor › `supabase/schema.sql` › Run ; activer la connexion anonyme.
4. `SUPABASE_URL=https://….supabase.co SUPABASE_KEY=<clé publique> SUPABASE_SECRET_KEY=<clé secrète> node tools/supabase.mjs restore base.json`
5. Nouveau projet : mettre la nouvelle adresse et clé dans `src/net/cloudconfig.js` et publier. Les téléphones se
   reconnectent (connexion anonyme neuve) et se rattachent avec leur secret.

Sans copie : la base se reconstruit depuis les téléphones (chacun garde tout) : au rattachement, `nouveau` = vrai et
le téléphone renvoie ses parties (étape 4) ; les amitiés sont à refaire.

## Tests

- `tests/cloud.test.js` : fonctions pures, client avec un faux `fetch` (jetons, erreurs).
- `tests/cloud-sql.test.js` : `supabase/schema.sql` joué dans un **vrai Postgres** local (`tools/lib/pg.mjs` : base
  jetable, rôles et `auth.uid()` de Supabase imités) ; droits, comptes, amis, parties, copie et remise.
- `tests/cloud-parcours.test.js` : la vraie appli (Chromium) contre `tools/lib/fake-supabase.mjs` (mêmes adresses que
  Supabase, fonctions exécutées par le Postgres local). Sautés sans Postgres sur le poste ; en CI, son absence est une
  erreur (les machines Ubuntu de GitHub l'ont).
- Non vérifiable d'ici : le vrai projet Supabase (adresse inconnue tant que Guillaume ne l'a pas donnée), sa connexion
  anonyme réelle, Realtime.
