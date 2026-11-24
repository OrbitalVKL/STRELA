# Lot 10 (amis, synchronisation, stats partagées) — avancement

Cahier : [docs/lot-10.md](lot-10.md) ; architecture : [docs/cloud.md](cloud.md). Lot 9.5 et 0.20.1 étaient finis et
publiés : rien à terminer avant.

| Étape | Version | Contenu | État |
|---|---|---|---|
| 1 | 0.21.0 | infra Supabase (schéma SQL complet, client, faux serveur de test sur vrai Postgres), compte invisible, Réglages › Compte et amis, réveil et copie de la base (action GitHub), confidentialité | fait |
| 2 | 0.22.0 | amis : écran Amis (QR + code, scanner / saisir), demandes, liste de joueurs en trois sections, amis en lecture seule | fait |
| 3 | 0.22.0 | rattachement des joueurs locaux aux amis (fusion annulable, journalisée) — regroupé avec l'étape 2 (une seule demande de fusion) | fait |
| 4 | 0.22.0 | synchronisation des parties et séances (envoi par empreintes, réception, suppression propagée, format) — regroupée avec 2 et 3 | fait |
| 5 | 0.22.0 | stats partagées (sélecteur de joueur, Stats multijoueur / entraînement, badges en ligne) — regroupée avec 2 à 4 | fait |
| 6 | 0.23.0 | présence (Realtime) | à faire |

## Décisions (prises sans Guillaume, à lui dire)

- Toutes les écritures passent par des fonctions SQL (« security definer ») ; les tables ne sont lisibles qu'à travers la
  RLS et ne s'écrivent jamais directement.
- Identifiant du compte = UUID tiré par le téléphone + secret ; plusieurs connexions anonymes peuvent s'y rattacher
  (second téléphone, réinstallation, base restaurée). Code de récupération de 47 caractères (rare à taper : la
  sauvegarde le contient).
- Parties en ligne : une seule ligne `partie` avec la partie entière en JSON (`donnees`), comme sur le téléphone, plus
  une table `participation` (profils, joueurs locaux) pour les droits ; pas de table de volées séparée.
- Partie supprimée : purge 60 jours après la suppression douce.
- Supprimer ses données en ligne coupe la synchronisation ; la rallumer crée un nouveau compte (nouveau code d'ami).
  Si un second téléphone partage le compte, il le recrée à sa prochaine synchronisation (limite acceptée).
- « Retrouver un compte » sur un téléphone qui avait déjà le sien : l'ancien profil reste en ligne, orphelin.
- Signalisation du mode en ligne : PeerJS gardé (voir docs/cloud.md).
- Copie hebdomadaire chiffrée dans les artefacts de l'action (le dépôt est public), 90 jours.

## Étape 2 — décisions

- Ami accepté = joueur `u:<uuid>` dans `players` avec `friend` (UUID), `seen`, `sets` (store.js › applyFriends) :
  lecture seule (fiche #/joueur/u:… = friendSheet), proposé partout comme un joueur. Ami retiré (par moi ou par lui) :
  le champ `friend` tombe, il redevient un joueur local (ses parties restent).
- Demandes (reçues, envoyées, refusées) : `cloudSync.requests` (pas exportées).
- QR code : `rejoindre.html#CODE` (6 caractères = code d'ami, 5 = salon) → `strela://rejoindre/CODE` → l'appli
  route vers `#/amis/ajouter/CODE` (aucune modification native : MainActivity accepte déjà 3 à 8 caractères).
- Scanner dans l'appli : seulement dans le navigateur s'il a BarcodeDetector ; dans l'APK, l'appareil photo du
  téléphone (le scanner intégré demanderait la permission CAMERA et un changement de la coquille).
- Pas de maquettes en images pour l'écran Amis (cahier précis, cartes habituelles) : à faire valider sur le Pixel.

## Étape 3 — décisions

- Fusion (store.js › mergeFriend, engine/merge.js) : le joueur local **garde son identifiant** (tout son historique),
  prend `friend`, pseudo, avatar, animation, jeux ; la fiche `u:<uuid>` disparaît et ses parties (jouées entre
  l'acceptation et la fusion) passent à l'identifiant local (rewireGame : joueurs, verres, en ligne ; séances, soirée,
  derniers réglages).
- Proposée pour tout nouvel ami (fiche `u:…` sans décision) si le téléphone a des joueurs locaux : juste après
  ACCEPTER, sinon bandeau en tête de Joueurs et Amis ; « AUCUN » enregistré ; RATTACHER UN JOUEUR LOCAL reste dans la
  fiche de l'ami. Pseudos proches : identiques sans casse ni accents, préfixe de 3 lettres, 1 ou 2 lettres d'écart.
- Décisions et journal des fusions : `cloudSync.mergeDecided`, `cloudSync.merges` (pas exportés ; la fusion elle-même
  est dans `players`, donc dans la sauvegarde). Annulable tant que `sentAt` manque (posé par l'étape 4 quand ses
  parties sont parties).
- Symétrie : chacun répond chez lui (A rattache sa « Mathilde », B son « Guillaume ») ; plusieurs téléphones peuvent
  rattacher le même joueur local, chacun envoie ses parties (identifiants différents, pas de doublon).

## Étape 4 — décisions

- Pas de file d'envoi à tenir à la main : à chaque synchronisation, chaque partie ou séance **créée ici** est mise en
  forme (engine/sync.js › toCloud) et comparée à l'empreinte déjà envoyée (`cloudSync.sent`) ; ce qui a changé part
  (corrections, fusions, verres, profil d'un ami… sans crochet dans chaque écran). Paquets de 20.
- Pas envoyées : parties reçues (`owner`), copie d'un invité d'une partie en ligne (l'hôte l'envoie), parties en cours.
- Suppressions : seulement celles faites ici, d'une partie déjà partie (`cloudSync.deleted`) — jamais une partie
  simplement absente (une sauvegarde importée ne supprime rien chez les amis).
- Réception : curseur (maj µs, id) ; tout reprendre quand la liste d'amis change ou quand le format lisible augmente.
  Traduction : UUID → mon joueur de profil / l'ami (fusionné ou `u:`) ; inconnus → joueurs distants (`remote`, comme
  le lot 9.2). Une partie reçue a `owner` (créateur) et `cloudMaj` (champs facultatifs, aucune migration).
- Rangement : reçue **avec mon profil** → historique et stats (store.games, ckGames, trainings) ; sans moi →
  `store.friendGames` / `friendTrainings` (pour les stats des amis, étape 5). Partition refaite au chargement.
- Lecture seule : pas de suppression (deleteGames, deleteTrainings l'ignorent), pas de verres ni de soirée modifiés,
  séance non modifiable ; l'écran dit « vient du téléphone de X ».
- Sync à la fin d'une partie ou séance : crochet `setClosedListener` (store.js) posé par cloud.js.
- Format trop récent : compté (`tooNewCount`), message « Mets à jour Strela… » (Réglages, Amis).

## Étape 5 — décisions

- Sources des stats : `allGames()`, `allCkGames()`, `allTrainings()` (store.js) = les miennes + celles de mes amis entre
  eux ; chaque calcul filtre par joueur, donc les stats, records, badges (même date, même partie, même volée) d'un ami
  sont les mêmes que chez lui dès que toutes ses parties sont arrivées. Classement et tableau d'honneur aussi.
- Sélecteur (stats multijoueur et entraînement) : moi, puis mes amis, puis les joueurs du téléphone ; jamais les
  joueurs distants (classement compris : `!p.remote`).
- Bandeau : « Multijoueur » / « Entraînement » (modeband.js). Filtre Toutes / Locales / En ligne gardé.
- Badges en ligne (engine/badges.js, `online: true`) : n'apparaissent dans la vitrine qu'après une partie en ligne
  (`h.onlineIds`), pour ne pas encombrer celle des joueurs qui n'y jouent pas. « Ami » = joueur qui a un compte
  (`accounts` : mon profil et mes amis). Sang-froid : seul dernier (moins de manches, puis plus gros reste) après la
  moitié des fléchettes. Reconnexion héroïque : `online.cut` posé par ui/online.js à chaque coupure (hôte qui perd un
  invité, invité qui perd l'hôte, hôte qui reprend son salon). Fidèle au poste : badge à rangs 10 / 50 / 150.
- Synchronisation : une demande pendant une passe en cours en programme une seule autre et en attend le résultat
  (cloud.js › syncNow).

## Prochain geste

Étape 6 (présence) : Supabase Realtime, canal privé `strela-presence` (politiques déjà dans schema.sql) ; client
WebSocket maison (protocole Phoenix : phx_join avec `config.presence.key` = mon UUID, `presence_state` /
`presence_diff`, heartbeat 25 s, jeton d'accès en `access_token`) ; état « en ligne » / « en partie » (partie ou séance
en cours) ; pastille sur la liste d'amis et les avatars d'amis ; réglage `presence` (Réglages › Compte et amis) ;
dernière activité sinon (« vu il y a 2 h », déjà là). Faux serveur Realtime à ajouter à tools/lib/fake-supabase.mjs.
