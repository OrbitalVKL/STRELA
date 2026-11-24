# Partie en ligne (lot 9.2, version 0.19.0)

Un joueur par téléphone, 2 à 4 téléphones (conçu pour 4, essayé à 2). Cahier : docs/lot-9.md (9.2).

## Architecture

| Couche | Fichier | Rôle |
|---|---|---|
| Règles du salon et synchronisation | `src/engine/online.js` | pur, sans réseau ni DOM ; `tests/enligne.test.js` |
| Signalisation | `src/net/signal.js` | trouver l'autre téléphone : serveur public PeerJS (`wss://0.peerjs.com/peerjs`), sans compte, avec son protocole mais sans sa bibliothèque ; en repli (lot 9.5) deux courtiers MQTT publics (EMQX, HiveMQ) ; petite interface `openSignal(id, { service })`, `openSignals` pour l'hôte |
| Liaison | `src/net/link.js` | WebRTC, canal de données (`hostLink`, `guestLink`) ; messages JSON découpés au-delà de 15 000 caractères ; présence (ping 2 s, perdu après 8 s) |
| Contrôleur | `src/ui/online.js` | salon, hôte / invité, reprise, lien avec les écrans de jeu |
| Écran | `src/ui/screens/online.js` | `#/enligne` (créer, rejoindre, salon), `#/enligne/rejoindre/CODE` |
| QR code | `src/ui/qr.js` | encodeur maison (mode octets, correction M, versions 1 à 10) ; `tests/qr.test.js` le relit |
| Tests | `tools/lib/signal-server.mjs`, `tests/enligne-parcours.test.js` | serveur de signalisation local au même protocole (WebSocket écrit à la main) ; deux navigateurs séparés |

Aucune dépendance à la passerelle Android : la WebView et les navigateurs ont WebRTC (compatible avec une future
version web pour iPhone, lot 9.1 reporté).

## Salon

- L'hôte crée un salon : code de 5 caractères (alphabet sans 0/O, 1/I/L ni voyelles), identifiant
  `strela-<code>` chez PeerJS ; un code déjà pris → nouveau tirage. QR code du lien
  `https://orbitalvkl.github.io/STRELA/rejoindre.html#CODE` et bouton PARTAGER LE LIEN.
- `rejoindre.html` (Pages) : OUVRIR DANS L'APPLI (lien `intent://…#Intent;scheme=strela;package=fr.orbitalvkl.strela`,
  filtre d'intention `strela://rejoindre/CODE` de MainActivity → événement `{ join }` → `#/enligne/rejoindre/CODE`) ou
  CONTINUER DANS LE NAVIGATEUR (version web). Un lien https n'ouvre plus une appli non vérifiée depuis Android 12
  (il faudrait `assetlinks.json` à la racine de orbitalvkl.github.io) : d'où ce détour.
- Chacun choisit le joueur de son téléphone (fiche existante : pseudo, avatar, animation de tour, finition) ; deux
  téléphones ne peuvent pas prendre le même joueur. Liste en direct : HÔTE, CONNECTÉ, EN ATTENTE, PERDU.
- L'hôte choisit X01 (départ, sortie, manches) ou Cricket (mode, manches), l'ordre (tiré au sort ou comme la liste,
  flèche pour monter un joueur) et lance (2 joueurs au moins, tous connectés). Les invités voient les réglages.

## Partie

- L'hôte crée la partie chez lui (`startGame` / `startCricket`, même identifiant partout) et l'envoie entière ; chaque
  téléphone l'adopte (`adoptOnlineGame`, store.js ; une autre partie en cours est d'abord rangée).
- Saisie : seul le téléphone du joueur dont c'est le tour peut saisir (pavé, cible, voix). La demande part à l'hôte
  (`intent`), qui vérifie (son tour ? volée en attente ? pause ?) et diffuse une opération numérotée (`op`, n = 1, 2…)
  que tous appliquent par les mêmes fonctions qu'une saisie locale (`registerOnlineGame` dans game.js et cricket.js) :
  fléchettes une par une, sons, annonces, célébrations, moqueries, animations de tour sur tous les téléphones. Les
  défis sont tirés de la même façon partout (tirage déterministe sur l'identifiant de la partie). Verres, voyelles de
  Tsia : propres à chaque téléphone.
- ANNULER : seulement le lanceur, avant VALIDER. VALIDER, MANCHE SUIVANTE : le lanceur. Pas de correction d'une
  fléchette en ligne. Les autres téléphones ont le pavé (ou la cible) couvert : « À <joueur> ».
- Fin : chaque téléphone range la partie dans son historique, marquée `online: { code, role, me, host }` ; RETOUR AU
  SALON (l'hôte ramène tout le monde au salon et peut relancer). Pause › ARRÊTER LA PARTIE POUR TOUS (hôte : rangée
  « abandonnée » partout) ou QUITTER LA PARTIE EN LIGNE (invité).

## Robustesse

- Chaque message de l'hôte porte un numéro de séquence ; un invité ignore les doublons et, devant un trou, redemande
  l'état complet (`room` : salon + partie + nombre d'opérations). À chaque (re)connexion, l'hôte renvoie l'état complet.
- Téléphone perdu (canal fermé, veille, réseau) : « PERDU », la partie se met en pause pour tous ; l'invité se
  reconnecte de lui-même toutes les 3 s (et au lancement de l'appli : `resumeOnline`, la partie en cours garde sa
  marque) ; à son retour la pause se lève. L'hôte peut PASSER SON TOUR (ses volées passées, 3 hors cible, jusqu'à son
  retour) ou l'EXCLURE (jusqu'à la fin de la partie).
- Hôte perdu : les invités voient « RECONNEXION À L'HÔTE… », la partie est suspendue (gardée chez tous). L'hôte qui
  rouvre l'appli reprend son salon (enregistré avec la partie, `online.room`) sous le même code ; les invités
  reviennent.
- Signalisation tombée chez l'hôte : les téléphones déjà reliés continuent ; nouvelle tentative toutes les 5 s.

## Réseau et limites

- STUN publics (Google, Cloudflare) ; **pas de relais TURN** : aucun gratuit, fiable et sans compte n'existe
  (Open Relay demande maintenant un compte). Sans TURN, certains réseaux empêchent la connexion directe (4G
  d'opérateur avec NAT symétrique, Wi-Fi d'entreprise ou d'hôtel) : « Impossible de joindre l'autre téléphone ». Sur
  le même Wi-Fi, ça passe presque toujours. Si un service TURN est choisi un jour, l'ajouter à `ICE_SERVERS`.
- Le serveur PeerJS ne voit que la mise en relation (adresses réseau, empreintes de chiffrement) ; les messages de la
  partie vont directement d'un téléphone à l'autre (DTLS). Rien n'est stocké sur un serveur.
- Variante **play** : pas d'accès réseau (pas de permission INTERNET) → mode en ligne absent (message à la place).
  Variante github et version web : disponible. Réglages › Modes › En ligne (OUI par défaut).
- Les sessions Claude ne laissent pas passer les WebSocket : le vrai serveur PeerJS n'a pas pu être essayé d'ici
  (seulement le serveur local au même protocole). À vérifier par Guillaume à deux téléphones.

## Joueurs distants, stats, sauvegarde

- Les joueurs des autres téléphones sont gardés dans `players` avec `remote: true` (champ facultatif, aucune
  migration) : absents des choix de joueurs, des stats et du classement, rangés dans Joueurs › Adversaires en ligne
  (AJOUTER en fait un joueur du téléphone). Un joueur local au même identifiant (sauvegarde importée) reste tel quel.
- Stats et classement : filtre TOUTES / LOCALES / EN LIGNE (affiché dès qu'une partie en ligne existe).
- Sauvegarde, export, mise à jour : les champs `online` (partie) et `remote` (joueur) passent par `withDrinks` et
  `playerRecord` (db.js), donc dans la base, la sauvegarde et l'import.

## Lot 9.5 (0.20.0) : « le mode en ligne n'arrive pas à se connecter »

Non reproduit d'ici en 0.20.0 (à tort : le WebSocket sort bien par le proxy, voir 0.20.1). Ce qui a été corrigé ou
ajouté, pour que la prochaine panne dise où elle est :

- **Étapes** : 1 serveur de mise en relation, 2 réponse de l'hôte, 3 négociation entre les téléphones (ICE),
  4 canal de données. Chacune a son délai (8 s pour ouvrir un service, 8 s pour la réponse de l'hôte sur ce service,
  20 s pour la négociation), affichée à l'écran avec ✓ / … / ✗, et l'échec dit laquelle a lâché.
- **Repli de signalisation** : PeerJS, puis `wss://broker.emqx.io:8084/mqtt`, puis `wss://broker.hivemq.com:8884/mqtt`
  (MQTT 3.1.1 sur WebSocket écrit à la main, QoS 0, sujet `strela/v1/<id>`). L'hôte écoute sur les trois à la fois
  (`openSignals` ; un service tombé est réessayé toutes les 5 s ; il répond par le service d'où l'offre est venue) ;
  l'invité les essaie dans l'ordre et renvoie son offre et ses candidats sur le suivant. « Code pris » sur MQTT :
  PROBE / TAKEN sur son propre sujet. Les sujets MQTT sont publics : quelqu'un qui devine le code peut lire la mise en
  relation (adresses réseau, empreintes) comme le serveur PeerJS ; la partie, elle, reste chiffrée de bout en bout.
- **Candidats arrivés avant l'offre** chez l'hôte : gardés puis ajoutés (ils étaient perdus).
- **ACCESS_NETWORK_STATE** (variante github) : la WebView en a besoin pour énumérer les réseaux du téléphone quand
  WebRTC cherche un chemin.
- **Journal** : chaque étape, le service utilisé, les types de candidats (host / srflx / relay, jamais les adresses),
  l'état ICE à l'échec. Sans candidat `srflx` d'un côté : STUN bloqué ; `srflx` des deux côtés mais échec : NAT
  symétrique (4G) → il faudrait un relais TURN (aucun gratuit sans compte).
- Tests : tests/lot95-signal.test.js (MQTT, repli, journal, dans node contre tools/lib/signal-server.mjs, qui fait aussi
  courtier MQTT sur /mqtt) ; tests/enligne-parcours.test.js (2e test : PeerJS en panne, étapes, mauvais code, lien collé,
  RÉESSAYER, journal, deux navigateurs).
- URL de test : `?signal=peerjs:ws://…/peerjs,mqtt:ws://…/mqtt`.

## 0.20.1 : la vraie cause (journal de Guillaume du 24/11, deux téléphones à distance)

Journal : comme hôte, aucune « offre reçue » en 5 minutes sur aucun des trois services ; comme invité, « pas de
réponse de l'hôte » par PeerJS, puis EMQX, puis HiveMQ, échec « Réponse de l'hôte » (no-host). Pas d'EXPIRE de PeerJS :
l'hôte était donc bien connecté au serveur.

**Cause, reproduite sur le vrai serveur** (`node tools/enligne-reel.mjs` : deux Chromium, le vrai 0.peerjs.com, le
code de src/net/link.js) : le serveur public de PeerJS vérifie maintenant la forme des messages et **coupe la liaison
de l'expéditeur (code 1000) sans rien relayer** si elle ne ressemble pas à ce qu'envoie sa bibliothèque. Nos messages
(`{ sdp }`, `{ candidate }`) étaient refusés : l'offre de l'invité n'arrivait jamais. Règles relevées à la main le 24/11
(src/net/signal.js › `peerjsValid`, aussi appliquées par tools/lib/signal-server.mjs pour que les tests le voient) :

- seuls OFFER, ANSWER, CANDIDATE (et HEARTBEAT) sont relayés ; tout autre type (EXPIRE, LEAVE envoyés par un client…)
  fait couper ;
- contenu : `type` ('data' ou 'media') et `connectionId` toujours ; une offre 'data' veut aussi `label`, `reliable`,
  `serialization` ;
- `sdp` : un objet `{ type: 'offer' | 'answer', sdp: 'v=0\r\n…' }` (« v=0 » sans retour à la ligne est refusé, une
  réponse dans une OFFER aussi) ; `candidate` : un objet (candidat vide accepté).

Correction : `peerjsPayload` ajoute ces champs à chaque message PeerJS (noms réservés : Strela ne transporte que `sdp`
et `candidate`), et un message qui serait refusé n'est pas envoyé (noté au journal). Avant / après sur le vrai
serveur : 0.20.0 « no-host » en 8,6 s (le même journal que Guillaume), 0.20.1 canal ouvert en 0,9 s.

Aussi : l'invité passe au service suivant dès que la signalisation est coupée pendant l'attente (au lieu de 8 s) ;
une fermeture voulue (quitter le salon) n'est plus notée « signalisation perdue » ; une coupure par le serveur PeerJS
est notée avec son code.

**MQTT (EMQX, HiveMQ) : non vérifié.** D'ici, seul le port 443 sort : 8084 et 8884 ne répondent pas. Chez Guillaume les
deux s'ouvrent, mais rien n'est passé par eux non plus. Hypothèse : le réseau de l'autre téléphone bloque ces ports
(courant en 4G et sur les Wi-Fi publics) ; à confirmer avec le journal de l'autre téléphone si PeerJS lâche encore. Pas
de courtier MQTT public trouvé sur le port 443 qui réponde d'ici (mqtt.eclipseprojects.io, test.mosquitto.org, flespi :
non).

**Tester depuis une session** : le WebSocket sortant passe par le proxy (`HTTPS_PROXY`) — Chromium lancé avec
`proxy: { server: HTTPS_PROXY, bypass: '127.0.0.1,localhost' }` et `ignoreHTTPSErrors` (tools/enligne-reel.mjs) ; dans
node, undici (`ProxyAgent`, CA /root/.ccr/ca-bundle.crt) en `--no-save` hors du dépôt.
