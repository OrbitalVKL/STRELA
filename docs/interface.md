# Interface — maquette des lots 1 et 1.1

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
| `src/ui/nav.js` | `go()`, `refresh()`, retour, vibrations (`buzz`), écran allumé (`keepAwake`, Wake Lock) |
| `src/ui/store.js` | état en mémoire : joueurs, parties, partie en cours, suppression d'un joueur, réglages (`strela.theme`, `strela.night`, `strela.vibrate`, `strela.anim`) |
| `src/ui/turn.js` | validation de chaque volée (pur, testé) : `pendingVisit()`, `validatedAfterUndo()` |
| `src/ui/roll.js` | chiffres en rouleau : `rollHtml()` au rendu, `animateRolls()` après ; `rollStrip()` pur, testé |
| `src/ui/board.js` | dessin SVG de la cible (impacts, carte de chaleur des stats), `impactsFor()` ; géométrie dans `src/engine/board.js` |
| `src/ui/mock.js` | données fictives : 5 joueurs (+1 archivé), 15 parties **jouées par le vrai moteur** (lanceur simulé, tirage reproductible) |
| `src/ui/avatars.js` | banque de 24 pictogrammes SVG (grille 48, trait 3, `currentColor`), initiales, avatar neutre du joueur supprimé, `avatarHtml()` |
| `src/ui/dom.js` | échappement, nombres et dates en français, pictogrammes d'interface, barre du haut |
| `src/ui/build.js` | version / tests / date / commit lus dans `<div id="build">` (rempli par le build) |
| `src/ui/screens/*.js` | un module par écran (accueil, joueurs, nouvelle partie, jeu, résultats, historique, stats, réglages, sommaire) |
| `assets/app.css` | styles des écrans ; **uniquement des jetons** de `theme.css` (vérifié par `tests/maquette.test.js`) |
| `manifest.webmanifest`, `sw.js` | PWA : deux orientations, plein écran ; service worker « réseau d'abord (3 s), copie sinon » |
| `tools/make-icons.mjs` | régénère les PNG d'icône depuis `assets/icon.svg` (poste avec Playwright ; PNG versionnés) |

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
  410 × 712 (Chrome + 3 boutons), en paysage 914 × 410 et 860 × 410.
- **Reste à faire** : la zone du reste est un conteneur de taille (`container-type: size`), le nombre prend la place
  qui reste (`min(44cqw, 100cqh − 10px)`) ; le pavé a une hauteur fixée par l'écran (`clamp(341px, 44dvh, 440px)`,
  touches ≥ 56 px). Chiffres mesurés : 152 px de haut (914), 152 (866), 145 (760), 121 (712 ; 117 avec 8 joueurs) ;
  en paysage 138 (914 × 410) et 122 (860 × 410). Sur un paysage étroit, la cible cède quelques pixels (`100vw − 480px`).
- **Bandeau du joueur actif** (80 px ; 72 / 66 px sur les petites hauteurs, 70 px en paysage) : aplat `--av-N`
  (couleur de fond de son avatar) et encre `--av-ink`, avatar 56 px cerclé, pseudo en Martian Mono étroite
  (`font-stretch: 75%`) de 46 px, réduit jusqu'à 40 px pour un pseudo long (capitales de 33 px au moins), puis « … ».
  Sous le pseudo : 3 carrés de 15 px (pleins = fléchettes lancées, encadré épais = la prochaine), « FLÉCHETTE n/3 »
  (ou « VOLÉE TERMINÉE », « BUST »), manche, manches gagnées. Le joueur suivant, dans la bande des autres : sa case
  en aplat de sa couleur + « SUIVANT ».
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
- **Cible** (`board.js`) : simples alternés fond / gris léger, triple et double alternés rouge (`--red`) / gris,
  25 gris, 50 rouge, filets `--faint`, numéros `--dim`. Anneaux élargis (voir moteur). Impacts : carré plein `--fg`
  numéroté (volée en cours ou volée choisie), petit carré `--dim` (volées précédentes du joueur dans la manche).
  Portrait : petite cible de 104 px (92 / 84 px sur les petites hauteurs) à droite des 3 cases ; un appui ouvre la
  cible agrandie (avec un lien vers l'historique de la partie).
- **Saisie sur la cible (paysage)** : `pointerdown` sur la cible → loupe carrée de 150 px (×2,5, réticule), nom de
  la zone en gros au-dessus ; placée en haut à gauche du doigt (la main vient d'en bas à droite), franchement à
  gauche si la place manque en haut ; `pointermove` ajuste, `pointerup` enregistre `segmentAt(x, y)` avec
  `pos: [x, y]` ; hors de la cible : rien, message « HORS CIBLE · RIEN N'EST COMPTÉ » 1,5 s. `touch-action: none`.
  Mesuré à 914 × 410 : cible de 398 px, anneaux triple et double de 25 px, T20 = 25 × 30 px, D20 = 25 × 49 px,
  50 = 25 px de diamètre ; dans la loupe, tout est 2,5 fois plus grand.
- **Historique de la partie en cours** : feuille plein écran (`ui.panel = 'history'`), même composant que le
  détail de l'historique (`gameLog()` dans `screens/history.js`) avec la volée commencée en dernier ; toucher une
  volée déplie sa cible. Fermer remet l'écran tel quel (rien d'autre ne change dans l'état).
- Bust : toute la zone du reste passe en aplat rouge (`.alert`) avec « BUST / RESTE n » ; les fléchettes
  restent visibles dessous (la fautive barrée).
- D / T armés : touche en vidéo inverse, préfixe D / T sur chaque nombre, trame hachurée sur la grille ;
  T grise le 25. Retoucher D / T désarme.
- Fin de manche / de partie : écrans séparés, avec la cible de la volée gagnante et « ANNULER LA DERNIÈRE
  FLÉCHETTE » (retour en jeu, volée de nouveau ouverte).
- REVANCHE : mêmes réglages, le premier lanceur passe au joueur suivant.
- Mode nuit : calque `multiply` de `--night` sur toute la page (comme Grafit), seulement en sombre.

## Joueurs : archiver ou supprimer

Fiche joueur, section « Archiver ou supprimer ». SUPPRIMER LE JOUEUR ouvre une confirmation (bandeau rouge `.alert`)
qui chiffre les conséquences (parties gardées et anonymisées, parties jouées seul effacées). Joueur de la partie en
cours : « SUPPRESSION IMPOSSIBLE », avec un lien vers la partie. Effet : `deletePlayer()` (`store.js` →
`src/engine/players.js`). Le joueur supprimé s'affiche « Joueur supprimé », avatar neutre (filet et barre oblique).

## Sommaire de maquette (`?maquette`)

États fabriqués avec le vrai moteur (`src/ui/screens/sommaire.js`, objet `SCENES`) : D armé, T armé, volée en
attente de validation (3 fléchettes, bust), annonce « À TOI » (figée), cible avec impacts, cible agrandie,
historique de la partie en cours, finition proposée, fin de manche, fin de partie, 8 joueurs, pseudo très long,
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
