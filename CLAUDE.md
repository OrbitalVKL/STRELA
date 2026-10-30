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
                          chevauchement.test.js, couleurs.test.js et geste.test.js : Playwright (sautés s'il est absent)
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
| 1.2 | Corrections : rotation de l'appli installée, vibrations, mini-cible, historique en tableau, vraie cible, superpositions — **fait** |
| 1.3 | Corrections : 3 fléchettes par case d'historique, une seule couleur de joueur en jeu, VALIDER à la couleur du lanceur — **fait, en attente de validation** |
| 2 | Partie jouable + joueurs et avatars |
| 3 | Historique et stats |
| 4 | Finitions : propositions de finition, mode nuit, vibrations, export / import (validation des fonctions) |
| 5 | APK (coquille Java WebView `fr.orbitalvkl.strela`, minSdk 30, release signée, mise à jour dans l'appli) |
| 6 | Recette |

## État (fin du lot 1.3)

- Maquette corrigée publiée (version 0.1.3), sommaire : `https://orbitalvkl.github.io/STRELA/?maquette`.
  Détail : docs/interface.md ; décisions : docs/cahier-des-charges.md (§ 4) et docs/direction-artistique.md.
- Lot 1.3 :
  - **Historique** : chaque case montre les fléchettes du tour (« T20 · 5 · 1 », « 0 » = raté), puis le total en gros,
    puis le reste en petit ; bust (fautive barrée) et finition comme avant. Contenu pur et testé : `cellView()` /
    `cellHtml()` de `src/ui/table.js`. Fléchettes jamais coupées : paliers `fit1…3` de `.ds` (séparateurs resserrés,
    deux lignes, plus petit), même palier pour tout un tableau (`data-fit-same`, nouveau dans `fit.js`).
  - **Une seule couleur de joueur en jeu** : celle du joueur en cours. Bande des autres neutre (avatars `mono`, sans
    fond) ; le suivant, en tête de bande : filet de 3 px en haut + « SUIVANT » (flèche si le pseudo serait coupé).
    `tests/couleurs.test.js` scanne les écrans de jeu (portrait / paysage, sombre / clair) : aucune couleur d'avatar
    hors de celle du joueur en cours.
  - **VALIDER** : aplat de la couleur du lanceur, encre `--av-ink` (≥ 4,5:1 sur les 8 fonds, testé dans le navigateur
    sur les 8 couleurs via `__strela.scene('volee-8', k)`), « VALIDER » puis « suivant : PSEUDO » ; solo : VALIDER seul.
  - `fit.js` : ordre paliers → rapetissement → paliers (une étiquette abrégée libère la place avant qu'un voisin
    rapetisse).
  - Nouvelles scènes : `volee-4`, `volee-8`, `solo-attente` ; `histo-deux` a des ratés.
  - Points tranchés par l'architecte : grille du test de chevauchement à 360 px minimum (sauf si la ligne de diagnostic
    de Guillaume montre plus étroit) ; pseudos coupés en « … » dans le tableau à 8 joueurs acceptés.
- Lot 1.2 (rappel) : test de chevauchement (`tests/chevauchement.test.js`, grille complète en CI), `buzz()` qui dit ce
  qui s'est passé + TESTER LA VIBRATION, diagnostic en bas des Réglages, manifeste `orientation: any` (réinstaller
  l'appli installée avant 1.1), cible réglementaire, historique en tableau, palette d'avatar (CIEDE2000 ≥ 20).
- Toujours en mémoire : rien n'est enregistré sauf les réglages d'affichage (`strela.theme`, `strela.night`,
  `strela.vibrate`, `strela.anim`) ; données fictives recréées à chaque chargement.
- Tests : 99 (dont cible, tableau, cases, palette, couleurs, chevauchement, geste). Captures et geste : `tools/`.
- Toujours en attente de Guillaume : la ligne de diagnostic des Réglages et le résultat de TESTER LA VIBRATION.
- À faire au lot 2 (une fois le design validé) : IndexedDB avec la même forme de données que `store.js`
  (y compris `pos` des fléchettes et `validated`), enregistrement à chaque fléchette et à chaque VALIDER,
  suppression d'un joueur en une transaction, photo d'avatar (en jeu, la bande des autres la montre en gris),
  retrait des données fictives hors sommaire.
  Tout nouvel écran ou état : l'ajouter au sommaire (`SCENES`) pour qu'il passe dans le test de chevauchement ; tout
  état de jeu : l'ajouter aussi à `SCENES` de `tests/couleurs.test.js`.
