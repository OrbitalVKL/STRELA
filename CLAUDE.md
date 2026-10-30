# Strela (СТРЕЛА) — règles du projet

Appli Android de fléchettes X01 pour Guillaume. Dépôt `OrbitalVKL/STRELA` (public, branche `main`).
Cahier des charges : [docs/cahier-des-charges.md](docs/cahier-des-charges.md).

## Méthode de travail

- **Guillaume ne lit pas le code.** Messages haut niveau : ce qui est fait, ce qu'il doit faire (quoi
  installer, quoi ouvrir, quoi tester), rien d'autre.
- **Chaque lot se fait dans une session neuve.** Tout ce qu'une session suivante doit savoir va dans ce
  fichier et dans `docs/`. Mettre à jour « État » ci-dessous à la fin de chaque lot.
- Travailler sur la branche de session, ouvrir une demande de fusion vers `main`, **la fusionner soi-même dès
  que tout est vert** (CI `ci / tests`).
- Fin de lot : message court en trois parties — **Fait**, **À toi** (adresse à ouvrir sur son Pixel 10 Pro et
  quoi y vérifier), **Rapport pour l'architecte** (bloc à copier : état du dépôt, choix et raisons, écarts au
  cahier des charges, questions ouvertes, à savoir avant le lot suivant).
- **Interface entièrement en français.** Seul le titre de l'appli reste en russe : **СТРЕЛА**.
  Le code (identifiants) est en anglais, les commentaires et la doc en français.
- Grafit (`OrbitalVKL/GRAFIT`) est la référence de DA et de chaîne APK : **lecture seule, ne jamais le modifier.**

## Direction artistique

« Console Soyuz » reprise de Grafit, détail dans [docs/direction-artistique.md](docs/direction-artistique.md).
Résumé : sombre `#0A0C0E` / texte `#CFD2D4` ; clair `#ECEDEE` / texte `#14171A` ; atténué = 62 % du texte
mélangé au fond, discret = 30 % ; rouge `#9E4A4A`, texte rouge `#C26A6A` (en clair : `#9E4A4A`) ; vidéo inverse.
Cible aux couleurs d'une vraie cible, identiques dans les deux thèmes (jetons `--board-*`).
Thème Auto / Sombre / Clair (Auto par défaut). Police Martian Mono **embarquée** (`assets/fonts/`, OFL),
filets fins, angles droits, rien d'arrondi. Utiliser les jetons CSS de `assets/theme.css`, jamais de couleur en dur.

## Structure du dépôt

```
index.html                l'appli (page unique). Marques <!--@clé-->…<!--/@--> remplies au build (bloc #build)
manifest.webmanifest      PWA : portrait et paysage, plein écran ; sw.js : service worker « réseau d'abord »
assets/theme.css          thème (jetons CSS sombre / clair, fonds d'avatar --av-0…7, --night, @font-face)
assets/app.css            styles des écrans (jetons uniquement)
assets/fonts/             Martian Mono woff2 (latin, latin-ext, cyrillique) + OFL.txt
assets/icon.svg           icône (+ icon-192/512/maskable-512.png générés par tools/make-icons.mjs)
src/engine/               moteur de règles, JS pur sans dépendance ni DOM (docs/moteur-x01.md)
  darts.js                la fléchette (commune à tous les jeux)
  x01.js                  règles X01 : état recalculé depuis config + liste des fléchettes
  checkout.js             table de finitions
  stats.js                statistiques recalculées depuis les fléchettes
  board.js                géométrie de la cible (position → segment, centre d'un segment, couleur de chaque zone)
  players.js              suppression d'un joueur (anonymisation « ~rang » de ses parties)
  index.js                point d'entrée, registre GAMES
src/ui/                   interface (docs/interface.md) : app.js, nav.js, store.js, mock.js, avatars.js, screens/,
                          board.js (dessin de la cible), roll.js (chiffres en rouleau), turn.js (validation des volées),
                          table.js (historique en tableau), fit.js (compaction des blocs trop chargés)
src/ui/theme.js           palette (source de vérité des couleurs), contraste
tests/                    tests node:test (*.test.js) ; helpers.js = aides (notation ds('T20 D16'))
                          chevauchement.test.js et geste.test.js : Playwright (sautés s'il est absent)
tools/build-site.mjs      construit _site/ : lance les tests, remplit la page, copie assets/ et src/
tools/check-layout.mjs    test de chevauchement en ligne de commande ; tools/captures.mjs : captures ; tools/geste.mjs :
                          saisie au doigt en paysage ; tools/lib/ : serveur, contrôle de mise en page, geste
.github/workflows/ci.yml     tests sur chaque demande de fusion et sur main
.github/workflows/pages.yml  build + déploiement GitHub Pages à chaque push sur main
docs/                     cahier des charges, DA, moteur, interface
package.json              version de l'appli (champ "version"), scripts ; aucune dépendance
```

Les tests sont dans `tests/` (et non `test/`) : avec `node --test`, tout fichier `.js` d'un dossier
`test/` est pris pour un fichier de tests, y compris les aides.

## Commandes

- Tests : `node --test` (ou `npm test`) ; détail lisible : `node --test --test-reporter=spec`. Sur le poste, le test de
  chevauchement prend une grille réduite ; `STRELA_GRILLE=complete node --test` pour la grille de la CI.
- Mise en page (Playwright, déjà présent dans les sessions ; sinon `npm install --no-save playwright` puis
  `npx playwright install chromium`) :
  `node tools/check-layout.mjs [--vite] [--clair] [--taille=410x914] [--police=1.3] [--etat=huit,#/reglages]` liste
  chevauchements et débordements ; `node tools/captures.mjs` (jeu de captures du lot, sombre et clair) ou
  `node tools/captures.mjs --etat=cible,histo-huit --taille=410x712,914x410 [--police=1.3] [--clair] [--entier]` →
  `captures/` (ignoré par git), à regarder avant de rendre ; `node tools/geste.mjs` : 10 zones touchées au doigt.
- Site : `node tools/build-site.mjs` → `_site/` (ignoré par git). Servir `_site/` en HTTP pour le voir
  (les modules ES et les polices ne marchent pas en `file://`).
- Node 22 en CI ; le projet n'a aucune dépendance. La CI (et le build de Pages) installe seulement Playwright et
  Chromium (`npm install --no-save playwright@1.63.0`) pour les tests de chevauchement et de geste.
- Version : `package.json` → affichée sur la page. Au lot 5, l'APK lira cette même version.

## Page publiée

GitHub Pages, source « GitHub Actions » : https://orbitalvkl.github.io/STRELA/
Le build affiche version, tests réussis / total, date (heure de Paris), commit ; `_site/tests.json` donne le même résumé.
Pages s'active **à la main** (Settings → Pages → Source : GitHub Actions) : le jeton des Actions n'a pas le droit
de le faire (`configure-pages` avec `enablement` échoue en « Resource not accessible by integration »), et
la session n'a pas d'accès à l'API Pages. Après activation : Actions → pages → Run workflow.

## Plan des lots

| Lot | Contenu |
|---|---|
| 0 | Fondations : cahier des charges, CLAUDE.md, moteur X01 + tests, CI, page d'attente Pages — **fait** |
| 1 | Maquette de tous les écrans, sombre et clair (validation du design) — **fait** |
| 1.1 | Corrections de la maquette après essai sur le Pixel (suppression, VALIDER, rouleaux, cible, paysage) — **fait** |
| 1.2 | Corrections : rotation de l'appli installée, vibrations, mini-cible, historique en tableau, vraie cible, superpositions — **fait, en attente de validation** |
| 2 | Partie jouable + joueurs et avatars |
| 3 | Historique et stats |
| 4 | Finitions : propositions de finition, mode nuit, vibrations, export / import (validation des fonctions) |
| 5 | APK (coquille Java WebView `fr.orbitalvkl.strela`, minSdk 30, release signée, mise à jour dans l'appli) |
| 6 | Recette |

## État (fin du lot 1.2)

- Maquette corrigée publiée (version 0.1.2), sommaire : `https://orbitalvkl.github.io/STRELA/?maquette`.
  Détail : docs/interface.md ; décisions : docs/cahier-des-charges.md (§ 4) et docs/direction-artistique.md.
- Lot 1.2 :
  - **Superpositions** (cause : la ligne sous le pseudo — carrés de fléchettes, FLÉCHETTE n/3, MANCHE n, carrés de
    manches gagnées — fait 295 px pour 259 à 410 px de large dès qu'on joue en plusieurs manches ; cet état n'avait
    jamais été capturé ; même défaut avec une police agrandie). Correctif général : `src/ui/fit.js` après chaque
    rendu (`data-fit` = compaction par paliers, `data-shrink` = texte qui rapetisse pour tenir), hauteurs minimales au
    lieu de hauteurs fixes, reste à faire qui absorbe. Test `tests/chevauchement.test.js` (tools/lib/layout.mjs) :
    tous les écrans et états du sommaire, portrait 360–430 × 640–930, paysage 640×360 à 930×430, police 100/115/130 %
    (simulée en multipliant les tailles calculées), sombre et clair : aucun chevauchement, rien hors de l'écran,
    aucun texte coupé sans « … ». Grille complète en CI (~3 min).
  - **Vibrations** : rien à corriger côté appel (geste de l'utilisateur déjà là, réglage par défaut OUI), mais Chrome
    ne vibre pas en mode silencieux et Android coupe les vibrations des pages quand le retour haptique est désactivé ;
    `buzz()` renvoie maintenant 'absent' | 'off' | 'refused' | 'sent', impulsion par fléchette portée à 25 ms.
    Réglages : TESTER LA VIBRATION (dit ce qui s'est passé). L'APK utilisera le vibreur natif.
  - **Rotation** : manifeste `orientation: any` (depuis 1.1), aucun verrouillage dans le code ; l'appli installée avec
    l'ancien manifeste « portrait » doit être désinstallée puis réinstallée depuis Chrome. Le build date l'adresse du
    manifeste (`?v=version-commit`). Diagnostic en bas des Réglages (orientation, taille en px, police, mode, version).
  - Mini-cible : volée en cours seule, marques rondes 1-2-3, vidée à chaque volée (aussi la cible de saisie en
    paysage) ; cible agrandie avec bascule VOLÉE / MANCHE. Cible aux couleurs réglementaires (`zoneTone()`,
    `--board-*`), partout. Historique en tableau (`src/ui/table.js`, `legTable()`), case → fléchettes et cible.
  - Palette d'avatar retouchée (écart CIEDE2000 ≥ 20 entre deux fonds, `deltaE()` dans theme.js, testé).
  - 8 joueurs à 410 × 712 : 122 px (bande des autres compactée). Mesures du reste : 152 px (914, 866), 146 (760),
    122 (712) ; paysage 133 (914 × 410), 120 (860 × 410).
- Toujours en mémoire : rien n'est enregistré sauf les réglages d'affichage (`strela.theme`, `strela.night`,
  `strela.vibrate`, `strela.anim`) ; données fictives recréées à chaque chargement.
- Tests : 96 (dont cible, tableau, palette, chevauchement, geste). Captures et geste : `tools/` (voir Commandes).
- À faire au lot 2 (une fois le design validé) : IndexedDB avec la même forme de données que `store.js`
  (y compris `pos` des fléchettes et `validated`), enregistrement à chaque fléchette et à chaque VALIDER,
  suppression d'un joueur en une transaction, photo d'avatar, retrait des données fictives hors sommaire.
  Tout nouvel écran ou état : l'ajouter au sommaire (`SCENES`) pour qu'il passe dans le test de chevauchement.
