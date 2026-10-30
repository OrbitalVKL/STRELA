# Interface — maquette du lot 1

Page unique (`index.html`) + modules ES dans `src/ui/`, sans framework ni dépendance. Chaque écran est une
fonction qui rend du HTML en chaîne ; les actions passent par des attributs `data-act` (délégation d'événements
dans `app.js`), le pavé de jeu par `data-key` (agit au `pointerdown`, sans attendre le relâchement).

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/ui/app.js` | point d'entrée : routes, rendu, délégation des événements, démarrage, service worker |
| `src/ui/nav.js` | `go()`, `refresh()`, retour, vibrations (`buzz`), écran allumé (`keepAwake`, Wake Lock) |
| `src/ui/store.js` | état en mémoire : joueurs, parties, partie en cours, réglages (`strela.theme`, `strela.night`, `strela.vibrate`) |
| `src/ui/mock.js` | données fictives : 5 joueurs (+1 archivé), 15 parties **jouées par le vrai moteur** (lanceur simulé, tirage reproductible) |
| `src/ui/avatars.js` | banque de 24 pictogrammes SVG (grille 48, trait 3, `currentColor`), initiales, `avatarHtml()` |
| `src/ui/dom.js` | échappement, nombres et dates en français, pictogrammes d'interface, barre du haut |
| `src/ui/build.js` | version / tests / date / commit lus dans `<div id="build">` (rempli par le build) |
| `src/ui/screens/*.js` | un module par écran (accueil, joueurs, nouvelle partie, jeu, résultats, historique, stats, réglages, sommaire) |
| `assets/app.css` | styles des écrans ; **uniquement des jetons** de `theme.css` (vérifié par `tests/maquette.test.js`) |
| `manifest.webmanifest`, `sw.js` | PWA : portrait, plein écran ; service worker « réseau d'abord (3 s), copie sinon » |
| `tools/make-icons.mjs` | régénère les PNG d'icône depuis `assets/icon.svg` (poste avec Playwright ; PNG versionnés) |

## Adresses

`#/` accueil · `#/joueurs` · `#/joueur/<id|nouveau>` fiche · `#/avatars` banque · `#/nouvelle` · `#/jeu` ·
`#/manche` fin de manche · `#/fin` fin de partie · `#/historique` · `#/partie/<id>` détail · `#/stats/<id>` ·
`#/reglages` · `#/sommaire`. `?maquette` dans l'adresse ouvre le sommaire et ajoute, en haut à droite de chaque
écran, la bascule de thème et le retour au sommaire (dans le menu pause pendant une partie).

## Écran de jeu (choix)

- Hauteur fixe `100dvh`, rien ne défile : vérifié en 410 × 914 (appli installée, plein écran) et 410 × 760
  (Chrome avec ses barres). Le reste fait 150 à 210 px de police (chiffres ≥ 123 px de haut).
- Pendant la pause de fin de volée (1 s) ou de bust (1,5 s), l'écran montre encore le joueur qui vient de
  lancer ; une touche pendant la pause l'interrompt et compte pour le joueur suivant (saisie rapide) ;
  ANNULER pendant la pause revient au joueur précédent.
- Bust : toute la zone du reste passe en aplat rouge (`.alert`) avec « BUST / RESTE n » ; les fléchettes
  restent visibles dessous (la fautive barrée).
- D / T armés : touche en vidéo inverse, préfixe D / T sur chaque nombre, trame hachurée sur la grille ;
  T grise le 25. Retoucher D / T désarme.
- Fin de manche / de partie : écrans séparés, avec « ANNULER LA DERNIÈRE FLÉCHETTE » (retour en jeu).
- REVANCHE : mêmes réglages, le premier lanceur passe au joueur suivant.
- Mode nuit : calque `multiply` de `--night` sur toute la page (comme Grafit), seulement en sombre.

## Sommaire de maquette (`?maquette`)

États fabriqués avec le vrai moteur (`src/ui/screens/sommaire.js`, objet `SCENES`) : D armé, T armé, bust et
volée finie (figés jusqu'à la touche suivante), finition proposée, fin de manche, fin de partie, 8 joueurs,
pseudo très long, joueur seul, pause, confirmation d'abandon, aucun joueur, historique vide, données rétablies.

## Pour le lot 2

- Remplacer `store.js` (mémoire) par IndexedDB **avec la même forme** : joueur `{ id, name, avatar, archived }`,
  partie `{ id, startedAt, config, darts[], abandoned }` (+ partie en cours enregistrée à chaque fléchette).
- `mock.js` ne doit plus être chargé en production (le garder pour le sommaire / les tests).
- Photo d'avatar : boutons présents (`data-act="photo"`), sélection et recadrage carré à faire.
- Les statistiques (`src/engine/stats.js`) et la table de finitions (`src/engine/checkout.js`) sont déjà prêtes.
