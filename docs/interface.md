# Interface — maquette des lots 1, 1.1 et 1.2

Page unique (`index.html`) + modules ES dans `src/ui/`, sans framework ni dépendance. Chaque écran est une
fonction qui rend du HTML en chaîne ; les actions passent par des attributs `data-act` (délégation d'événements
dans `app.js`), le pavé de jeu par `data-key` (agit au `pointerdown`, sans attendre le relâchement).

Un clic `data-act` ne compte que si le doigt s'est posé sur la même commande (`app.js`) : une touche du pavé agit
dès l'appui et redessine l'écran, et le clic qui suit tomberait sinon sur ce qui vient d'apparaître dessous (VALIDER
après la 3e fléchette). Les clics clavier ou programmés (`detail === 0`) passent toujours.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/ui/app.js` | point d'entrée : routes, rendu, délégation des événements, rotation, démarrage, service worker |
| `src/ui/nav.js` | `go()`, `refresh()`, retour, vibrations (`buzz`, qui dit ce qui s'est passé), écran allumé (`keepAwake`, Wake Lock) |
| `src/ui/store.js` | état en mémoire : joueurs, parties, partie en cours, suppression d'un joueur, réglages (`strela.theme`, `strela.night`, `strela.vibrate`, `strela.anim`) |
| `src/ui/turn.js` | validation de chaque volée (pur, testé) : `pendingVisit()`, `validatedAfterUndo()` |
| `src/ui/roll.js` | chiffres en rouleau : `rollHtml()` au rendu, `animateRolls()` après ; `rollStrip()` pur, testé |
| `src/ui/board.js` | dessin SVG de la cible aux couleurs réglementaires (marques rondes, carte des stats), `impactsFor()`, `markIcon()` ; géométrie et couleur des zones dans `src/engine/board.js` |
| `src/ui/table.js` | historique en tableau (pur, testé) : `legTable()` = colonnes par joueur, lignes par tour |
| `src/ui/fit.js` | après chaque rendu : `data-fit` (compaction par paliers `fit1…n`), `data-shrink` (texte qui rapetisse pour tenir) |
| `src/ui/mock.js` | données fictives : 5 joueurs (+1 archivé), 15 parties **jouées par le vrai moteur** (lanceur simulé, tirage reproductible) |
| `src/ui/avatars.js` | banque de 24 pictogrammes SVG (grille 48, trait 3, `currentColor`), initiales, avatar neutre du joueur supprimé, `avatarHtml()` |
| `src/ui/dom.js` | échappement, nombres et dates en français, pictogrammes d'interface, barre du haut |
| `src/ui/build.js` | version / tests / date / commit lus dans `<div id="build">` (rempli par le build) |
| `src/ui/screens/*.js` | un module par écran (accueil, joueurs, nouvelle partie, jeu, résultats, historique, stats, réglages, sommaire) |
| `assets/app.css` | styles des écrans ; **uniquement des jetons** de `theme.css` (vérifié par `tests/maquette.test.js`) |
| `manifest.webmanifest`, `sw.js` | PWA : deux orientations, plein écran ; service worker « réseau d'abord (3 s), copie sinon » |
| `tools/make-icons.mjs` | régénère les PNG d'icône depuis `assets/icon.svg` (poste avec Playwright ; PNG versionnés) |
| `tools/check-layout.mjs`, `tools/lib/layout.mjs` | test de chevauchement (aussi `tests/chevauchement.test.js`) |
| `tools/captures.mjs`, `tools/geste.mjs` | captures d'écran ; saisie au doigt en paysage (aussi `tests/geste.test.js`) |

## Adresses

`#/` accueil · `#/joueurs` · `#/joueur/<id|nouveau>` fiche · `#/avatars` banque · `#/nouvelle` · `#/jeu` ·
`#/manche` fin de manche · `#/fin` fin de partie · `#/historique` · `#/partie/<id>` détail · `#/stats/<id>` ·
`#/reglages` · `#/sommaire`. `?maquette` dans l'adresse ouvre le sommaire et ajoute, en haut à droite de chaque
écran, la bascule de thème et le retour au sommaire (dans le menu pause pendant une partie).

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
  retirés, « FLÉCHETTE 2/3 » en « FL. 2/3 ». Le joueur suivant, dans la bande des autres : sa case en aplat de sa
  couleur + « SUIVANT » sur la ligne du pseudo (plus de superposition). 5 à 8 joueurs : avatar au-dessus du reste.
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
  En portrait, VALIDER (vidéo inverse) couvre la moitié haute du pavé, avec « À PSEUDO » du joueur suivant en 24 px
  et le carré de sa couleur ; le reste du pavé est éteint et hachuré, ANNULER reste actif. En paysage, VALIDER est le 3e bouton du bas et la cible s'estompe.
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
  par tour (numéro en tête de ligne). Case : total de la volée en gros, reste après la volée en petit ; bust : texte
  rouge, filet rouge à gauche, « BUST » et le reste inchangé ; finition : vidéo inverse, « GAGNÉ ». En cours : la
  volée commencée a une case en pointillés (« 2/3 », « À JOUER ») et le numéro du tour en cours est en vidéo
  inverse. Toucher une case l'entoure et montre sous le tableau ses 3 fléchettes et leur place sur la cible. Colonnes
  de 74 px au moins : à 5 joueurs et plus, le tableau défile de côté, la colonne des tours reste fixe. Fermer remet
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

## Joueurs : archiver ou supprimer

Fiche joueur, section « Archiver ou supprimer ». SUPPRIMER LE JOUEUR ouvre une confirmation (bandeau rouge `.alert`)
qui chiffre les conséquences (parties gardées et anonymisées, parties jouées seul effacées). Joueur de la partie en
cours : « SUPPRESSION IMPOSSIBLE », avec un lien vers la partie. Effet : `deletePlayer()` (`store.js` →
`src/engine/players.js`). Le joueur supprimé s'affiche « Joueur supprimé », avatar neutre (filet et barre oblique).

## Sommaire de maquette (`?maquette`)

États fabriqués avec le vrai moteur (`src/ui/screens/sommaire.js`, objet `SCENES`) : D armé, T armé, volée en
attente de validation (3 fléchettes, bust), annonce « À TOI » (figée), petite cible au 1er et au 2e tour, cible
agrandie (VOLÉE, MANCHE), cible seule, manches gagnées (premier à 3), historique de la partie en cours, historique à
2 joueurs (bust ouvert, finition), à 8 joueurs (en cours ; terminé, finition ouverte), finition proposée, fin de manche, fin de partie, 8 joueurs, pseudo très long,
joueur seul, pause, confirmation d'abandon, suppression d'un joueur (confirmation, refus pendant une partie, partie
avec un joueur supprimé), paysage (saisie sur la cible, loupe figée sur T20, volée en attente), aucun joueur,
historique vide, données rétablies. Les états paysage s'affichent en paysage : tourner le téléphone.

## Pour le lot 2

- Remplacer `store.js` (mémoire) par IndexedDB **avec la même forme** : joueur `{ id, name, avatar, archived }`,
  partie `{ id, startedAt, config, darts[], abandoned }`, fléchette `{ segment, multiplier, pos? }` ;
  partie en cours `{ id, startedAt, config, darts[], validated }` enregistrée à chaque fléchette **et à chaque
  VALIDER** (sinon une volée validée redeviendrait en attente après une fermeture). `ui` n'est pas enregistré.
- Suppression d'un joueur : enregistrer tel quel le résultat de `deletePlayer()` (fiche retirée, parties
  anonymisées `~<rang>`, parties seul retirées), dans une seule transaction.
- `mock.js` ne doit plus être chargé en production (le garder pour le sommaire / les tests).
- Photo d'avatar : boutons présents (`data-act="photo"`), sélection et recadrage carré à faire.
- Les statistiques (`src/engine/stats.js`) et la table de finitions (`src/engine/checkout.js`) sont déjà prêtes.
- Tout nouvel écran ou état doit figurer au sommaire (`SCENES` ou `ROUTES` de `tools/lib/layout.mjs`) pour passer
  dans le test de chevauchement ; un texte qui peut s'allonger prend `.ell`, `data-shrink` ou un palier `data-fit`.
