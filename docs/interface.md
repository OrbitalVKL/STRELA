# Interface — lots 1 à 1.3 (maquette), lot 2 (partie jouable et enregistrée), lot 3 (corrections, historique, stats, sauvegarde), lot 4 (finitions)

Page unique (`index.html`) + modules ES dans `src/ui/`, sans framework ni dépendance. Chaque écran est une
fonction qui rend du HTML en chaîne ; les actions passent par des attributs `data-act` (délégation d'événements
dans `app.js`), le pavé de jeu par `data-key`.

**Touches du jeu au relâcher** (lot 3) : le pavé (`data-key`), VALIDER, pause et petite cible (`data-press`) montrent
l'appui aussitôt (classe `hit`) mais n'agissent qu'au **relâcher**, et seulement si le doigt n'a pas glissé de plus de
10 px (`PRESS_SLOP`) et qu'aucun `pointercancel` n'est arrivé : Android en envoie un quand il prend le geste
« remonter du bas de l'écran » (applis récentes), et rien n'est alors saisi (avant le lot 3, le pavé agissait dès
l'appui : un 0 ou un ANNULER partait au début du geste). La saisie reste immédiate au relâcher. Un clic `data-act`
ne compte que si le doigt s'est posé sur la même commande (le clic qui suit une touche tomberait sinon sur ce qui
vient d'apparaître dessous). Les clics clavier ou programmés (`detail === 0`) passent toujours. Appui long
(`data-long`, 500 ms sans glisser) : sélection dans l'historique, le clic qui suit est avalé.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/ui/app.js` | point d'entrée : routes, rendu, délégation des événements, rotation, démarrage (base du téléphone ou, avec `?maquette`, données fictives chargées à la demande), service worker |
| `src/ui/nav.js` | `go()`, `refresh()`, retour, vibrations (`buzz`, qui dit ce qui s'est passé), écran allumé (`keepAwake`, Wake Lock) |
| `src/data/db.js` | **base du téléphone** (IndexedDB, lot 2), sans DOM : ouverture et migrations, `loadAll()`, `write(ops)` (une transaction), formes des enregistrements |
| `src/ui/store.js` | état de l'appli en mémoire (l'écran s'en dessine) + écriture de chaque changement dans la base : joueurs, parties, partie en cours, suppression d'un joueur, réglages, stockage persistant |
| `src/ui/maquette.js` | données fictives du sommaire (`resetMock`, joueurs d'appoint, photo d'exemple) ; chargé seulement avec `?maquette` |
| `src/ui/crop.js` | recadrage carré d'une photo (pur, testé) : glisser, zoomer autour d'un point, rectangle gardé |
| `src/ui/screens/photo.js` | photo d'avatar : contrôle du fichier (poids, type, lisibilité), image de travail, écran de recadrage, photo 256 × 256 |
| `src/ui/rescue.js` | **lot 4** : écran de secours (script classique, hors modules) : RECHARGER, EXPORTER LA SAUVEGARDE relue de la base |
| `src/ui/feedback.js` | **lot 3** : sons (Web Audio, générés, aucun fichier) et annonces vocales (`speechSynthesis`, voix française) ; textes des annonces (`SPEECH`) |
| `src/data/backup.js` | **lot 3** : sauvegarde JSON (format, vérification complète, REMPLACER TOUT / FUSIONNER), sans DOM, testé |
| `src/ui/turn.js` | validation de chaque volée (pur, testé) : `pendingVisit()`, `validatedAfterUndo()` |
| `src/ui/roll.js` | chiffres en rouleau : `rollHtml()` au rendu, `animateRolls()` après ; `rollStrip()` pur, testé |
| `src/ui/board.js` | dessin SVG de la cible aux couleurs réglementaires (marques rondes, carte des stats), `impactsFor()`, `markIcon()` ; géométrie et couleur des zones dans `src/engine/board.js` |
| `src/ui/table.js` | historique en tableau (pur, testé) : `legTable()` = colonnes par joueur, lignes par tour ; `cellView()` / `cellHtml()` = contenu d'une case (fléchettes, total, reste) |
| `src/ui/fit.js` | après chaque rendu : `data-fit` (compaction par paliers `fit1…n`), `data-shrink` (texte qui rapetisse pour tenir), `data-fit-same` (même palier pour tout un groupe) |
| `src/ui/mock.js` | données fictives (sommaire et tests seulement) : 5 joueurs (+1 archivé), 15 parties **jouées par le vrai moteur** (lanceur simulé, tirage reproductible) |
| `src/ui/avatars.js` | banque de 24 pictogrammes SVG (grille 48, trait 3, `currentColor`), initiales, avatar neutre du joueur supprimé, `avatarHtml()` |
| `src/ui/dom.js` | échappement, nombres et dates en français, pictogrammes d'interface, barre du haut |
| `src/ui/build.js` | version / tests / date / commit lus dans `<div id="build">` (rempli par le build) |
| `src/ui/screens/*.js` | un module par écran (accueil, joueurs, nouvelle partie, jeu, résultats, historique, stats, réglages, sommaire) |
| `assets/app.css` | styles des écrans ; **uniquement des jetons** de `theme.css` (vérifié par `tests/maquette.test.js`) |
| `manifest.webmanifest`, `sw.js` | PWA : deux orientations, plein écran ; service worker « réseau d'abord (3 s), copie sinon » |
| `tools/make-icons.mjs` | régénère les PNG d'icône depuis `assets/icon.svg` (poste avec Playwright ; PNG versionnés) |
| `tools/check-layout.mjs`, `tools/lib/layout.mjs` | test de chevauchement (aussi `tests/chevauchement.test.js`) |
| `tools/lib/app.mjs` | pilotage de la vraie appli pour les tests de parcours : saisie au pavé, lecture de la base, instantané de l'écran, création de joueurs |
| `tools/captures.mjs`, `tools/geste.mjs` | captures d'écran ; saisie au doigt en paysage (aussi `tests/geste.test.js`) |

## Adresses

`#/` accueil · `#/joueurs` · `#/joueur/<id|nouveau>` fiche · `#/avatars` banque · `#/nouvelle` · `#/jeu` ·
`#/manche` fin de manche · `#/fin` fin de partie · `#/historique` · `#/partie/<id>` détail · `#/stats/<id>` ·
`#/face/<joueur>/<adversaire>` face-à-face (lot 3) ·
`#/reglages` · `#/recadrage` (photo d'avatar) · `#/sommaire` (maquette seulement). `?maquette` dans l'adresse ouvre le
sommaire et ajoute, en haut à droite de chaque écran, la bascule de thème et le retour au sommaire (dans le menu pause
pendant une partie). Sans `?maquette` : la vraie appli, sur la base du téléphone ; l'appli installée s'ouvre sur
l'accueil.

## Écran de jeu (choix)

Deux mises en page rendues par `screens/game.js` selon `(orientation: landscape)` ; `app.js` redessine à la
rotation, l'état (`store.current`) ne bouge pas.

- **Hauteur fixe `100dvh`**, rien ne défile, zones sûres (`env(safe-area-inset-*)`) des quatre côtés.
  Vérifié en portrait 410 × 914 (appli installée), 410 × 866 (appli + navigation à 3 boutons), 410 × 760 (Chrome),
  410 × 712 (Chrome + 3 boutons), en paysage 914 × 410 et 860 × 410 ; et par le test de chevauchement (ci-dessous).
- **Rien ne se chevauche** (lot 1.2), quels que soient la taille de l'écran et les réglages de taille d'affichage et
  de police : hauteurs minimales (et non fixes) pour le bandeau, les cases, la finition, la bande des autres ; le
  haut de l'écran (`.toparea`, base 0) prend ce qui reste, le reste à faire garde 96 px au moins, et c'est le pavé
  qui cède en dernier (341 px, jusqu'à 250 px sur un très petit écran à grande police). `fit.js` rapetisse les textes
  qui débordent (reste, BUST, total, cases, finition, touches, pseudo jusqu'à 40 px puis « … »).
- **Reste à faire** : la zone du reste est un conteneur de taille (`container-type: size`) ; la ligne du haut (jeu,
  moyenne) est dans le flux, le nombre prend la hauteur qui reste (`min(44cqw, (100cqh − 21px) / 0,9)`, l'encre des
  chiffres de Martian Mono occupant 0,08 à 0,92 em de la ligne, marges négatives en conséquence) ; le pavé a une
  hauteur fixée par l'écran (`clamp(341px, 44dvh, 440px)`, touches ≥ 56 px). Chiffres mesurés (encre d'un « 0 ») :
  152 px de haut (914), 152 (866), 146 (760), 122 (712, aussi avec 8 joueurs) ; en paysage 133 (914 × 410) et
  120 (860 × 410). En paysage, la cible cède quelques pixels (`100vw − 490px`) sans descendre sous 44 % de la largeur.
- **Bandeau du joueur actif** (80 px au moins ; 72 / 66 px sur les petites hauteurs, 70 px en paysage, 60 en paysage
  bas) : aplat `--av-N` (couleur de fond de son avatar) et encre `--av-ink`, avatar 56 px cerclé, pseudo en Martian
  Mono étroite (`font-stretch: 75%`) de 46 px, réduit jusqu'à 40 px pour un pseudo long (capitales de 33 px au moins),
  puis « … ». Sous le pseudo : 3 carrés de 14 px (pleins = fléchettes lancées, encadré épais = la prochaine),
  « FLÉCHETTE n/3 » (ou « VOLÉE TERMINÉE », « BUST »), manche, manches gagnées. Si la ligne ne tient pas (`data-fit`),
  elle se compacte par paliers : manches gagnées en « 1/2 » encadré, « MANCHE 2 » en « M2 », carrés de fléchettes
  retirés, « FLÉCHETTE 2/3 » en « FL. 2/3 ». **Bande des autres joueurs neutre** (lot 1.3) : avatars sans fond
  (`avatarHtml(p, n, 'mono')`), aucune couleur de joueur ; le suivant, toujours en tête de bande, a un filet de 3 px en
  haut de sa case et « SUIVANT » sur la ligne du pseudo (une flèche si le pseudo serait coupé : palier `fit1` du
  pseudo). 5 à 8 joueurs : avatar au-dessus du reste, sans pseudo (le filet seul repère le suivant).
- **Accents** : une coupe « … » (`overflow: hidden`) coupe aussi en hauteur ; tout texte coupé a un interligne
  ≥ 1,24 (`.ell` : 1,3) pour garder les accents des capitales (É, È).
- Relecture par un second agent (point « à qui c'est de jouer ») : corrigé — accents coupés, compteur de fléchettes
  illisible de loin (carrés), joueur suivant peu visible (aplat), nom du suivant trop petit sous VALIDER (24 px +
  carré de sa couleur), annonce à peine plus grande que le bandeau (avatar au-dessus, pseudo jusqu'à 92 px).
  Laissé ouvert : couleurs d'avatar trop proches deux à deux (ardoise / graphite, sapin / pétrole) ; poids du pseudo
  face au reste (37 px contre 145 px).
- **Volée en attente** (`turn.js`) : la partie en cours garde `validated` = nombre de fléchettes à la dernière
  validation. La volée close attend si `lastEvent` vaut `visit_end` ou `bust` et `validated ≠ dartCount`. ANNULER
  ramène `validated` à `min(validated, longueur)`, pour qu'une fléchette rejouée remette la volée en attente.
  En portrait, VALIDER couvre la moitié haute du pavé ; le reste du pavé est éteint et hachuré, ANNULER reste actif.
  En paysage, VALIDER est le 3e bouton du bas et la cible s'estompe. **VALIDER** (lot 2) : aplat de la couleur du
  joueur qui vient de lancer (`.validate.go`, `--pc`, encre `--av-ink`), « VALIDER » seul sur une ligne, en grand
  (54 px en portrait, 28 px en paysage, rapetissé par `data-shrink` si la place manque) ; le joueur suivant n'est plus
  écrit dessus (il apparaissait deux fois) : il est repéré par « SUIVANT » dans la bande des autres. En portrait, la
  ligne sous les cases dit aussi « SUIVANT PSEUDO » (inchangée, lot 1.3). Contraste et couleurs : `tests/couleurs.test.js`.
- **Annonce** « À TOI, PSEUDO » : aplat de la couleur du joueur sur le haut de l'écran (bandeau + reste), avatar
  72 px au-dessus du pseudo (jusqu'à 92 px, ajusté au mot le plus long, 2 lignes au plus), 800 ms
  (`ANNOUNCE_MS`), puis le bandeau glisse depuis la gauche (280 ms). Aussi au début d'une manche (MANCHE SUIVANTE).
  Pas d'annonce en solo. Une saisie ou une pause pendant l'annonce l'arrête.
- **Chiffres en rouleau** (`roll.js`) : chaque nombre roulant a une clé (`r:manche:joueur` pour le reste,
  `t:rangVolée` pour le total, `o:manche:joueur` pour les autres) ; après chaque rendu, ceux dont la valeur a changé
  depuis le rendu précédent roulent (Web Animations, 300 ms), chiffre par chiffre, en passant par les chiffres
  intermédiaires. Un nouveau rendu remplace le précédent : rien n'attend l'animation. Réglage « Animations » ;
  coupé d'office avec `prefers-reduced-motion` (classe `still` sur `<html>`).
- **Cible** (`board.js`, lot 1.2) : couleurs d'une cible réglementaire, les mêmes en sombre et en clair (voir DA) ;
  anneaux élargis (0,15 du rayon, voir moteur). **Marques rondes** : disque clair cerclé de sombre, numéro 1, 2, 3
  (volée en cours ou volée choisie) ; deux marques trop proches sont écartées juste assez pour rester lisibles.
  Petit point sombre cerclé de clair : volées précédentes du joueur dans la manche (cible agrandie en vue MANCHE et
  fins de manche seulement). Portrait : petite cible de 104 px (92 / 84 px sur les petites hauteurs) à droite des
  3 cases, **avec la volée en cours seule** (vidée à chaque nouvelle volée) ; un appui ouvre la cible agrandie :
  bascule **VOLÉE / MANCHE**, légende, lien vers l'historique de la partie.
- **Saisie sur la cible (paysage)** : `pointerdown` sur la cible → loupe carrée de 150 px (×2,5, réticule), nom de
  la zone en gros au-dessus ; placée en haut à gauche du doigt (la main vient d'en bas à droite), franchement à
  gauche si la place manque en haut ; `pointermove` ajuste, `pointerup` enregistre `segmentAt(x, y)` avec
  `pos: [x, y]` ; hors de la cible : rien, message « HORS CIBLE · RIEN N'EST COMPTÉ » 1,5 s. `touch-action: none`.
  Mesuré à 914 × 410 : cible de 398 px, anneaux triple et double de 25 px, T20 = 25 × 30 px, D20 = 25 × 49 px,
  50 = 25 px de diamètre ; dans la loupe, tout est 2,5 fois plus grand. La cible de saisie montre, comme la petite,
  la volée en cours seule. En paysage, « SUIVANT » sous la volée est retiré (le suivant est dans la bande des autres
  et sur VALIDER). Geste vérifié par `tests/geste.test.js` (10 zones, 914 × 410 et 640 × 360).
- **Historique en tableau** (lot 1.2), dans la feuille « Partie en cours » (`ui.panel = 'history'`) comme dans le
  détail d'une partie terminée (`gameLog()` dans `screens/history.js`, données par `legTable()`) : pour chaque
  manche, une colonne par joueur dans l'ordre où ils lancent dans cette manche (avatar et pseudo en tête), une ligne
  par tour (numéro en tête de ligne). **Case** (lot 1.3, `cellHtml()` de `table.js`) : les fléchettes du tour en
  premier (« T20 · 5 · 1 », « 0 » pour un raté), puis le total de la volée en gros, puis le reste après la volée en
  petit ; bust : texte rouge, filet rouge à gauche, fléchette fautive barrée, « BUST » et le reste inchangé ;
  finition : vidéo inverse, « GAGNÉ ». Les fléchettes ne sont jamais coupées : si la ligne déborde, elle passe par les
  paliers de `.ds` (séparateurs resserrés, puis deux lignes sans séparateur, puis plus petit), le même pour toutes les
  cases d'un tableau (`data-fit-same`) ; la case grandit en hauteur (66 px au moins). En cours : la
  volée commencée a une case en pointillés (« 2/3 », « À JOUER ») et le numéro du tour en cours est en vidéo
  inverse. Toucher une case l'entoure et montre sous le tableau ses 3 fléchettes et leur place sur la cible. Colonnes
  de 74 px au moins (pseudos d'en-tête coupés en « … » à 8 joueurs : accepté, l'avatar identifie le joueur) : à 5 joueurs et plus, le tableau défile de côté, la colonne des tours reste fixe. Fermer remet
  l'écran tel quel.
- Bust : toute la zone du reste passe en aplat rouge (`.alert`) avec « BUST / RESTE n » ; les fléchettes
  restent visibles dessous (la fautive barrée).
- D / T armés : touche en vidéo inverse, préfixe D / T sur chaque nombre, trame hachurée sur la grille ;
  T grise le 25. Retoucher D / T désarme.
- Fin de manche / de partie : écrans séparés, avec la cible de la volée gagnante et « ANNULER LA DERNIÈRE
  FLÉCHETTE » (retour en jeu, volée de nouveau ouverte).
- REVANCHE : mêmes réglages, le premier lanceur passe au joueur suivant.
- Mode nuit : calque `multiply` de `--night` sur toute la page (comme Grafit), seulement en sombre.

## Réglages : vibrations et diagnostic (lot 1.2)

- **Lot 2 : sur le Pixel 10 Pro de Guillaume, rien ne vibre**, même avec TESTER LA VIBRATION (appli installée, retour
  haptique activé). On ne cherche pas plus loin côté web : appels et bouton de test gardés ; **le lot 5 passera par le
  vibreur natif d'Android via la coquille APK** (`Vibrator` / `VibrationEffect`, appelé par la page à travers une
  interface Java de la WebView ; `buzz()` de `nav.js` est le seul point d'appel à rebrancher).
- **TESTER LA VIBRATION** (dans le clic, donc avec un geste de l'utilisateur, même si le réglage est sur NON) : dit
  ce qui s'est passé. FONCTION ABSENTE (pas de `navigator.vibrate`), REFUSÉE (`vibrate` a répondu `false` : page pas
  encore touchée, onglet caché), ENVOYÉE (demande transmise : si rien ne vibre, c'est le téléphone).
- Causes trouvées pour « pas de vibrations » : l'appel est bien fait pendant un geste (sauf à la toute première
  touche d'une page rechargée en pleine partie : Chrome exige que la page ait déjà été touchée), le réglage vaut
  OUI par défaut ; mais Chrome sur Android ne vibre pas quand le téléphone est en mode silencieux, et Android coupe les
  vibrations des pages web quand le retour haptique est désactivé (Réglages Android › Son et vibreur › Vibreur et
  retour haptique). Impulsion par fléchette portée de 12 à 25 ms (12 ms se sent à peine). **L'APK du lot 5 utilisera
  le vibreur natif d'Android** (`Vibrator`, avec ses attributs d'usage), plus fiable.
- **Diagnostic** en bas des Réglages, avec COPIER : orientation détectée (et `screen.orientation.type`), taille de la
  fenêtre en px CSS, rapport de pixels, taille de police effective (hauteur rendue d'un texte de 100 px : 100 % sans
  agrandissement), mode d'affichage (appli installée plein écran / onglet), version.

## Rotation de l'appli installée (lot 1.2)

Le manifeste est en `orientation: any` depuis le lot 1.1 et aucun code ne verrouille l'orientation. Une appli
installée avec l'ancien manifeste (« portrait ») garde son orientation tant que Chrome n'a pas régénéré l'appli
(vérification au plus une fois par jour, au lancement, en ligne, et parfois bien plus lente) : **la désinstaller puis
la réinstaller depuis Chrome** (menu ⋮ › Installer l'appli / Ajouter à l'écran d'accueil). L'identifiant (`id: "./"`)
ne change pas, pour qu'une réinstallation reste la même appli ; le build ajoute `?v=version-commit` à l'adresse du
manifeste pour que Chrome relise toujours le dernier.

## Test de chevauchement (lot 1.2)

`tests/chevauchement.test.js` (et `node tools/check-layout.mjs`) ouvre chaque écran et chaque état du sommaire
(`SCENES`), sur la grille portrait 360/384/410/430 × 640/712/800/866/930, paysage 640×360, 740×360, 800×384, 860×410,
914×410, 930×430, police 100 / 115 / 130 %, sombre et clair, et vérifie : aucune boîte de texte (encre réelle, mesurée
au canevas) ni élément visible (filet, fond, image, dessin) n'en recouvre un autre hors parent / enfant ; rien ne sort
de l'écran (côtés ; bas aussi sur l'écran de jeu) ; aucun texte coupé sans « … » ; pas de défilement de côté.
Les calques voulus portent `data-layer` (feuilles, annonce, loupe, VALIDER sur le pavé, barres collantes du haut et
du bas) : ce qu'ils couvrent n'est pas comparé. La police agrandie est simulée en multipliant la taille calculée de
chaque élément qui fixe la sienne, puis `fit.js` repasse. En CI (`CI=true`) : grille complète ; sur un poste : grille
réduite (`STRELA_GRILLE=complete` pour tout).

## Test des couleurs (lot 1.3)

`tests/couleurs.test.js` ouvre les états de jeu du sommaire (portrait 410 × 914 et paysage 914 × 410, sombre et
clair) et relève les couleurs calculées de chaque élément visible (fond, texte, filets, ombres, contour, remplissage
SVG) : aucune ne doit être la couleur d'avatar d'un autre joueur que celui du bandeau. Puis VALIDER, pour une volée en
attente lancée tour à tour par 8 joueurs aux 8 couleurs : fond = couleur du lanceur, contraste du texte ≥ 4,5:1,
« VALIDER » suivi de « suivant : … » ; en solo, « VALIDER » seul.

## Joueurs : archiver ou supprimer

Fiche joueur, section « Archiver ou supprimer ». SUPPRIMER LE JOUEUR ouvre une confirmation (bandeau rouge `.alert`)
qui chiffre les conséquences (parties gardées et anonymisées, parties jouées seul effacées). Joueur de la partie en
cours : « SUPPRESSION IMPOSSIBLE », avec un lien vers la partie. Effet : `deletePlayer()` (`store.js` →
`src/engine/players.js`). Le joueur supprimé s'affiche « Joueur supprimé », avatar neutre (filet et barre oblique).

## Sommaire de maquette (`?maquette`)

États fabriqués avec le vrai moteur (`src/ui/screens/sommaire.js`, objet `SCENES`) : D armé, T armé, volée en
attente de validation (3 fléchettes à 2, 4 et 8 joueurs — `volee-8` prend en option le rang de la volée, donc du
lanceur : `__strela.scene('volee-8', k)` —, bust, solo), annonce « À TOI » (figée), petite cible au 1er et au 2e tour, cible
agrandie (VOLÉE, MANCHE), cible seule, manches gagnées (premier à 3), historique de la partie en cours, historique à
2 joueurs (ratés, bust ouvert, finition), à 8 joueurs (en cours ; terminé, finition ouverte), finition proposée, fin de manche, fin de partie, 8 joueurs, pseudo très long,
joueur seul, pause, confirmation d'abandon, suppression d'un joueur (confirmation, refus pendant une partie, partie
avec un joueur supprimé), paysage (saisie sur la cible, loupe figée sur T20, volée en attente), aucun joueur,
historique vide, données rétablies. Lot 2 : accueil au premier lancement, REPRENDRE une fin de manche ou une fin de
partie, nouvelle partie avec une partie en cours, fiche avec avatar photo, photo refusée, recadrage (×1 et ×2,5),
avatars photo en jeu. Les états paysage s'affichent en paysage : tourner le téléphone.

## Enregistrement sur le téléphone (lot 2)

- **Base** `strela` (IndexedDB), module `src/data/db.js` sans DOM. Versionnée : `MIGRATIONS[i]` passe de la version i
  à i + 1 ; à l'ouverture, les migrations manquantes sont jouées dans l'ordre, dans la transaction de mise à niveau
  (tout ou rien). Ajouter une version = ajouter une fonction en fin de liste, sans toucher aux précédentes ni effacer
  de données. Version actuelle : **1** (magasins `players`, `games`, `settings`). Une base plus récente que l'appli
  (retour à une vieille version) n'est pas touchée : l'appli le dit (diagnostic, pied de l'accueil « NON ENREGISTRÉ »).
- **Forme** (celle de la maquette) : joueur `{ id, name, avatar: { kind, icon?, color, photo? }, archived }` ;
  partie `{ id, startedAt, endedAt, config, darts[], validated, abandoned }`, fléchette `{ segment, multiplier, pos? }` ;
  **la partie en cours est celle dont `endedAt` vaut `null`** ; réglages : `display` `{ theme, night, vibrate, anim }`,
  `lastSetup` (derniers réglages de partie), `storage` (réponse à la demande de stockage persistant). `ui` (état
  d'affichage : D/T armé, panneaux, vue de la cible) n'est jamais enregistré.
- **Écritures** : `store.js` garde tout en mémoire (l'écran se dessine sans attendre) et écrit chaque changement par
  `write(ops)` : une transaction par changement, durabilité `strict`, exécutées dans l'ordre. Partie en cours écrite
  entière à chaque fléchette, ANNULER, VALIDER et MANCHE SUIVANTE (`validated` = nombre de fléchettes validées ; il
  sert aussi à la fin de manche : tant qu'elle n'est pas passée, une reprise y revient). Une fermeture brutale ne
  perd au plus que l'écriture en cours. Suppression d'un joueur : fiche, parties anonymisées, parties seul effacées et
  derniers réglages dans **une seule transaction** (`deletionOps()`).
- **Démarrage** : `openStorage()` relit tout avant le premier affichage. Partie illisible (ne doit pas arriver) :
  gardée dans la base, pas affichée, comptée dans le diagnostic. Réglages : la base fait foi ; thème et mode nuit sont
  recopiés dans `localStorage` (lus par `index.html` avant l'affichage, pas d'éclair de couleur) ; au premier lancement,
  les réglages de la maquette (localStorage) passent dans la base.
- **Stockage persistant** : `navigator.storage.persist()` demandé au lancement tant qu'il n'est pas accordé (Chrome
  répond sans rien demander à l'utilisateur ; une appli installée l'obtient en général). Résultat dans la ligne de
  diagnostic des Réglages (« stockage persistant » / « non persistant ») avec la version de la base et son contenu.
- **Mise à jour de l'appli** : le service worker ne touche qu'à ses copies de fichiers (caches `strela-…`), jamais à la
  base. Si une version plus récente ouvre la base pendant qu'une ancienne page est ouverte, l'ancienne ferme sa
  connexion (pas de blocage) et se recharge. Testé de bout en bout : `tests/miseajour.test.js`.
- **Sommaire de maquette** (`?maquette`) : n'ouvre jamais la base ; données fictives en mémoire ; ne réécrit pas les
  réglages. `mock.js`, `maquette.js` et `sommaire.js` sont chargés à la demande (import dynamique), jamais par la vraie
  appli (vérifié par `tests/maquette.test.js`). Lien depuis les Réglages ; « Quitter la maquette » en bas du sommaire.

## Partie de bout en bout (lot 2)

- **Premier lancement** (aucun joueur) : l'accueil montre « BIENVENUE » et CRÉER LES JOUEURS en tête.
- **Accueil** : partie en cours → **REPRENDRE** en tête (aplat), NOUVELLE PARTIE en dessous. REPRENDRE va où l'on
  s'était arrêté (`resumeRoute()`) : jeu (joueur, fléchettes de la volée, volée en attente, bust en attente), fin de
  manche pas encore validée, ou fin de partie pas encore rangée (« PARTIE TERMINÉE · X GAGNE »).
- **Nouvelle partie** : derniers réglages repris (enregistrés). Si une partie est en cours, un encadré le dit : LANCER
  l'abandonne (elle reste dans l'historique, « abandonnée »), avec un lien pour la reprendre.
- **Abandon** (menu pause) : partie rangée `abandoned: true`, fléchettes comptées dans les moyennes, aucune victoire.
  Partie sans aucune fléchette : oubliée. REVANCHE et ACCUEIL (fin de partie) rangent la partie terminée.
- **Écran allumé** pendant le jeu et la fin de manche (Wake Lock), repris au retour dans l'appli (`visibilitychange`),
  relâché en quittant (vérifié avec un verrou simulé : `tests/parcours.test.js`).
- **Joueurs** : création, modification, archivage, **RÉACTIVER directement dans la liste** (et sur la fiche),
  suppression (refusée pendant la partie du joueur).
- **Photo d'avatar** : boutons PHOTO (`capture="user"` : appareil photo) et GALERIE (`accept="image/*"` : sélecteur
  d'images d'Android). Fichier refusé avec un message clair : plus de 20 Mo (« Photo trop lourde : 23,4 Mo, 20 Mo au
  plus »), pas une image, image illisible. Sinon : décodée (orientation EXIF comprise), réduite à 1600 px de côté pour
  le travail, puis **écran de recadrage** : cadre carré = l'avatar exact ; glisser pour cadrer, pincer pour zoomer
  (×1 à ×6, autour du point pincé), − / + et molette aussi ; ANNULER / VALIDER. VALIDER garde un JPEG 256 × 256
  (~15–30 ko, `data:` URL dans `avatar.photo`). À l'affichage, la photo passe par une adresse `blob:` créée une fois
  (pas de recopie de l'image dans le HTML de chaque écran). En jeu, la photo d'un autre joueur est en gris
  (`.av.mono img`, `grayscale(1)`), comme les pictogrammes.
- **Historique et stats** lisent les vraies parties avec les écrans existants (vérification fine des chiffres au lot 3).

## Tests du lot 2

| Fichier | Ce qui est vérifié |
|---|---|
| `tests/db.test.js` | formes des enregistrements, séparation partie en cours / closes, opérations de suppression, ordre des migrations ; calculs du recadrage |
| `tests/stockage.test.js` | dans Chromium : écriture et relecture, migrations (données gardées, transformation, base plus récente refusée), suppression tout ou rien (une opération invalide annule tout), partie en cours après rechargement, nouvelle version ouverte ailleurs |
| `tests/parcours.test.js` | vraie appli : premiers joueurs ; rechargement **en milieu de volée, volée en attente, juste après un bust, après ANNULER, fin de manche** (écran et base identiques) ; REPRENDRE depuis l'accueil ; abandon ; 501 à 2 joueurs jusqu'au bout puis retrouvée case par case dans l'historique ; REVANCHE ; archivage, réactivation, suppression ; écran allumé |
| `tests/photo.test.js` | image test chargée par le sélecteur, pincer, zoom, glisser, VALIDER : JPEG 256 × 256 du bon carré, en couleur hors jeu, en gris en jeu ; trop lourde, pas une image, abîmée |
| `tests/miseajour.test.js` | version A installée (service worker, `localhost`) avec une partie en cours, puis version B avec une base en version 2 : rien de perdu, l'ancienne page se recharge, le nouveau service worker n'efface que l'ancien cache |

## Lot 3 : corrections de jeu, historique, stats, sauvegarde

- **A. Saisies parasites** : touches du jeu au relâcher (voir en tête). Marge basse du jeu `--gesture-bottom` =
  `max(env(safe-area-inset-bottom), 16px)` en portrait et en paysage : la page web ne peut pas mesurer la zone des
  gestes d'Android (en plein écran avec la navigation par gestes, l'encart du bas vaut souvent 0) ; l'APK (lot 5)
  pourra lire `getMandatorySystemGestureInsets()`. Saisie sur la cible (paysage) : un `pointercancel` retire la loupe
  et ne compte rien (c'était déjà le cas, maintenant testé). Tests : `tests/saisie.test.js` (vrais événements tactiles :
  appui puis pointercancel, appui puis glissé vers le haut, appui-relâcher normal, VALIDER, cible).
- **B. Supprimer une partie** : détail d'une partie (SUPPRIMER CETTE PARTIE), liste de l'historique (appui long →
  sélection, cases à cocher, TOUTES / AUCUNE, SUPPRIMER (n)), menu pause (SUPPRIMER LA PARTIE, pour les essais,
  distinct d'ABANDONNER) ; chaque fois une confirmation. Une seule transaction (`deleteGames()` / `deleteCurrent()`
  de `store.js`, `gameDeletionOps()` de `db.js`) ; les joueurs (et leurs photos) ne sont jamais touchés ; les stats se
  recalculent d'elles-mêmes. Test : `tests/suppression.test.js`.
- **C. Face-à-face** (`#/face/<joueur>/<adversaire>`, depuis les stats) : du point de vue du joueur dont on regarde les
  stats, les deux avatars et pseudos face à face, le bilan en toutes lettres (« 7 VICTOIRES · 3 DÉFAITES ») et en
  manches, puis les parties communes (date, GAGNÉ / PERDU / GAGNÉE PAR …, manches, moyenne de chacun), les abandonnées
  à part. Rien ne repose sur la couleur. Calcul : `faceToFace()` de `src/engine/stats.js` ; définitions :
  [statistiques.md](statistiques.md).
- **D. Panneau cible + historique** (`ui.panel = 'board'`) : un seul panneau, ouvert par la petite cible comme par
  HISTORIQUE DE LA PARTIE. En haut, la cible en grand (VOLÉE / MANCHE), collée pendant que le tableau défile dessous ;
  le tableau de la partie, manche en cours d'abord. Un appui sur une case montre ses fléchettes sur la cible
  au-dessus. En paysage : cible à gauche, tableau à droite. Dans ce panneau, les avatars du tableau sont neutres (une
  seule couleur de joueur en jeu).
- **E. Cases de la volée** : chaque case vide montre une fléchette dessinée (`DART_ICON` de `game.js`, trait, angles
  droits), remplacée par le score une fois tirée. Finition jouable : chaque case vide porte en plus, en atténué, le
  segment conseillé pour cette fléchette (T20 · T20 · D20 pour 140), recalculé après chaque fléchette. L'ancienne ligne
  FINITION faisait double emploi : retirée (décidé sur captures) ; la ligne sous les cases ne sert plus qu'à
  « SUIVANT PSEUDO » quand une volée attend VALIDER (gardé, décision du lot 2). Pareil en paysage.
- **F. Annonces vocales** (`feedback.js`, réglage « Annonces vocales », OUI par défaut) : total de chaque volée
  (« 140 », lu « cent quarante » par la voix française), « Bust », « PSEUDO, il reste 40 » quand un joueur commence son
  tour (à VALIDER) avec une finition jouable, « Manche, PSEUDO ! », « Partie, PSEUDO ! », « Cent quatre-vingts ! »
  appuyé (plus lent, plus aigu). Une annonce part après le rendu et coupe la précédente (`cancel()`). Réglages : la voix
  trouvée, ou un encadré si aucune voix française n'est installée (avec le chemin dans les réglages d'Android) ;
  TESTER LA VOIX.
- **G. Célébrations** (`celebrate()` de `game.js`, `ui.cele`) : bandeau en haut de l'écran, gradué : 100+ discret
  (vidéo inverse, 1,2 s), 140+ plus haut à la couleur du joueur (1,4 s), 180 sur la moitié haute de l'écran, chiffres
  géants et filets obliques (1,6 s) ; chaque finition (vidéo inverse, ou couleur du joueur si 100 ou plus), sur l'écran
  de fin de manche ou de partie. Jamais le rouge (bust). `pointer-events: none` : la saisie continue dessous, et le
  premier appui le ferme. Sans animation si Animations = NON ou si le téléphone demande moins d'animations.
- **H. Sons** (`feedback.js`, réglage « Sons », OUI par défaut) : clic court à chaque fléchette (plus aigu pour un
  double, double clic pour un triple, sourd pour un 0), sons distincts pour bust, VALIDER, finition, 180, ANNULER.
  Générés par Web Audio sur l'horloge audio : rien n'attend. TESTER LES SONS. Ils remplacent les vibrations (sans effet
  en web sur le Pixel) jusqu'à l'APK.
- **I. Corriger une fléchette** (panneau D, partie en cours) : sous la cible, les 3 fléchettes de la volée montrée ;
  un appui ouvre le sélecteur (S / D / T, 1 à 20, 25, 50, 0, ou un appui sur la zone de la cible au-dessus). Le moteur
  (`src/engine/correct.js`, `correctDart()`) remplace la fléchette et recalcule toute la partie ; la correction n'est
  acceptée que si chaque fléchette suivante reste au même joueur, dans la même volée et la même manche, et que la
  partie en est au même point. Sinon : « cette correction change le déroulé de la partie : utilise ANNULER », rien
  n'est modifié. Avant d'appliquer : « T20 → T19 · Volée : 180 → 177 · Reste de PSEUDO : 221 → 224 » (ou le reste à la
  fin d'une manche précédente), CORRIGER / NON. Enregistrée comme une fléchette normale. Tests : `tests/correct.test.js`
  (simple, refusée car bust, volée en cours, manche précédente) et `tests/panneau.test.js` (vraie appli).
- **J. Sauvegarde** (Réglages › Sauvegarde, `src/data/backup.js`) : EXPORTER = `strela-AAAAMMJJ-HHMM.json` (joueurs avec
  photos, parties dont celle en cours, réglages `display` et `lastSetup`, version du format), proposé au menu de
  partage d'Android quand le téléphone accepte ce type de fichier (`navigator.canShare`), téléchargé sinon. IMPORTER :
  fichier lu et vérifié en entier (format, version, chaque joueur, chaque partie rejouée par le moteur) ; refusé avec
  un message clair sinon (version future : « mets l'appli à jour »), sans rien toucher. Aperçu (date, joueurs, parties),
  puis REMPLACER TOUT ou FUSIONNER (par identifiant, sans doublon ; ce qui existe ici est gardé ; une partie en cours
  de la sauvegarde va dans l'historique, abandonnée, si une partie est déjà en cours ici), avec confirmation. Une
  seule transaction (`{ store, clear: true }` ajouté à `write()`, pas de changement de schéma : base toujours v1).
  Tests : `tests/backup.test.js` (format, refus, fusion) et `tests/sauvegarde.test.js` (export téléchargé, base
  effacée, import, base identique ; fusion sans doublon ; version future refusée).
- **K.** « SUIVANT PSEUDO » sous les cases en portrait : gardé. LANCER pendant une partie en cours : vraie confirmation
  « ABANDONNER LA PARTIE EN COURS ? » dans la barre du bas (NON / ABANDONNER), et un rappel discret en haut avec
  REPRENDRE.
- **L. Chiffres vérifiés** : `tests/chiffres.test.js` joue trois parties scriptées (bust, abandon, joueur supprimé) dans
  la vraie appli et compare l'historique et chaque statistique à un calcul à la main ; aucun écart trouvé.
  Définitions : [statistiques.md](statistiques.md). Correction au passage : la légende de la cible des fins de manche
  et de partie (les pastilles prenaient la taille de la cible).

## Lot 4 : finitions

- **Titre STRELA et rouge d'accent** (`screens/home.js`) : titre en lettres latines partout (accueil, `<title>`,
  manifeste « Strela »). Deux variantes au sommaire (`accueil-bande`, `accueil-filet`, `accueil-filet-reprendre`),
  `setHomeVariant()` ; l'appli garde **A « bande »** (choix et raisons : direction-artistique.md). Classes
  `.btn.accent` (aplat rouge, `--red-ink`) et `.btn.accent-line` (filet rouge) : accueil et écran de secours seulement.
- **Finition au double préféré** : fiche joueur, section FINITION (`finishHtml()` de `screens/players.js`) : grille
  des 10 doubles les plus joués (D20 par défaut), ÉVITER LE BULL oui / non, et quatre exemples (41, 50, 76, 110)
  recalculés à chaque choix. Enregistré dans le joueur (`checkout: { double, avoidBull }`), **base en version 2** :
  la migration ajoute les valeurs par défaut à chaque joueur (`MIGRATIONS[1]` de `db.js`, rien d'autre ne change ;
  testé par `tests/stockage.test.js`). La sauvegarde garde le format version 1 : une sauvegarde sans préférences
  prend les valeurs par défaut à l'import. En jeu, les cases vides conseillent la route du joueur qui lance
  (`suggestCheckout(…, player.checkout)`). Règle de choix : moteur-x01.md. Tests : `tests/checkout.test.js` (41, 170,
  50 avec et sans bull, raté du triple, existence inchangée), `tests/finition.test.js` (vraie appli : fiche, base,
  rechargement, conseils de deux joueurs différents).
- **Écrans vides** : chaque écran vide dit ce qui manque et propose l'action utile. Stats sans partie : VOIR DEPUIS
  TOUJOURS (s'il a joué avant) ou NOUVELLE PARTIE ; face-à-face sans partie commune : VOIR DEPUIS TOUJOURS ou JOUER UNE
  PARTIE ENTRE EUX (nouvelle partie préparée avec les deux joueurs) ; face-à-face d'un joueur inconnu : retour aux
  stats ; nouvelle partie quand tous les joueurs sont archivés : VOIR LES JOUEURS (RÉACTIVER) ou CRÉER UN JOUEUR.
  Inchangés (déjà clairs) : aucun joueur, historique vide, import refusé, photo refusée.
- **Problèmes d'enregistrement** (`storageIssue()` / `resaveAll()` de `store.js`, `storageBanner()` de
  `screens/settings.js`) : encadré sur l'accueil, en tête des Réglages et du menu pause. Base inaccessible
  (« DONNÉES NON ENREGISTRÉES », RECHARGER), base d'une version plus récente (RECHARGER), stockage plein
  (`QuotaExceededError`, « STOCKAGE PLEIN ») ou écriture refusée : RÉESSAYER réécrit tout ce qui est en mémoire en une
  transaction, EXPORTER enregistre la sauvegarde (puis Réglages). L'écran garde toujours l'état en mémoire : rien de ce
  qui est affiché n'est perdu. `db.write()` renvoie l'erreur de l'opération qui a échoué (avant : celle de l'annulation).
- **Écran de secours** (`src/ui/rescue.js`, script classique chargé avant l'appli) : une erreur de programmation non
  rattrapée (événement `error`, promesse rejetée par un `TypeError`, `ReferenceError`…), une erreur pendant le rendu
  (`render()` l'attrape), ou un démarrage qui n'aboutit pas en 10 s (module introuvable) remplacent l'appli par un écran
  STRELA : « UNE ERREUR INATTENDUE », RECHARGER, EXPORTER LA SAUVEGARDE, détail de l'erreur. L'export relit la base
  telle qu'elle est sur le disque (sans la créer ni la mettre à niveau), sinon ce que l'appli a en mémoire
  (`window.__strelaExport`) ; même format que la sauvegarde (IMPORTER le relit). Les refus ordinaires du navigateur
  (partage annulé, autorisation refusée) ne déclenchent rien. Au sommaire : `#/secours` (scène `secours`).
- Nouvelles scènes du sommaire : `accueil-bande`, `accueil-filet`, `accueil-filet-reprendre`, `fiche-finition`,
  `finition-preferee` (aussi dans `tests/couleurs.test.js`), `secours`, `stats-vide`, `face-vide`,
  `nouvelle-archives`, `base-inaccessible`, `base-recente`, `stockage-plein`, `stockage-plein-jeu`.
- Tests : `tests/secours.test.js` (erreur dans un gestionnaire → écran de secours, export relu de la base et accepté
  par l'import, RECHARGER reprend la partie ; module en erreur → écran de secours ; stockage plein simulé → alerte,
  RÉESSAYER ; base inaccessible → alerte).

## Lot 5 : APK Android

Détail de la coquille, de la passerelle et de la chaîne de publication : [android.md](android.md). Côté page :
`src/ui/native.js` (passerelle, repli web), `src/ui/back.js` (retour d'Android), `buzz()` / `keepAwake()` de nav.js,
`say()` / `voiceInfo()` de feedback.js, EXPORTER et section « Appli Android » de settings.js, premier lancement de
l'APK dans home.js (scène `premier-lancement-apk`). Pas de service worker dans l'APK. Tests : `tests/passerelle.test.js`.

## Pour le lot 4

- Les écrans Historique et Stats lisent `store.games` (parties closes) ; la partie en cours est à part (`store.current`).
  Une partie abandonnée a `abandoned: true` et un `endedAt`.
- Base en **version 2** depuis le lot 4 ; pour un index (par date, par joueur) : ajouter une migration (version 3) à
  `MIGRATIONS` de `src/data/db.js`.
- Le format de sauvegarde (`src/data/backup.js`, version 1) servira au passage vers l'APK (lot 5) : exporter dans la
  page web, importer dans l'appli Android.
- Tout nouvel écran ou état : l'ajouter au sommaire (`SCENES`) pour le test de chevauchement ; tout état de jeu : aussi à
  `SCENES` de `tests/couleurs.test.js` ; un texte qui peut s'allonger prend `.ell`, `data-shrink` ou un palier `data-fit`.
