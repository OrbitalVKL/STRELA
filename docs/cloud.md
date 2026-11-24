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
`?cloud=URL|CLÉ` (gardé pour la session).

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
