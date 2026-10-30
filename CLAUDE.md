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
Thème Auto / Sombre / Clair (Auto par défaut). Police Martian Mono **embarquée** (`assets/fonts/`, OFL),
filets fins, angles droits, rien d'arrondi. Utiliser les jetons CSS de `assets/theme.css`, jamais de couleur en dur.

## Structure du dépôt

```
index.html                l'appli (page unique). Marques <!--@clé-->…<!--/@--> remplies au build (bloc #build)
manifest.webmanifest      PWA : portrait, plein écran ; sw.js : service worker « réseau d'abord »
assets/theme.css          thème (jetons CSS sombre / clair, fonds d'avatar --av-0…7, --night, @font-face)
assets/app.css            styles des écrans (jetons uniquement)
assets/fonts/             Martian Mono woff2 (latin, latin-ext, cyrillique) + OFL.txt
assets/icon.svg           icône (+ icon-192/512/maskable-512.png générés par tools/make-icons.mjs)
src/engine/               moteur de règles, JS pur sans dépendance ni DOM (docs/moteur-x01.md)
  darts.js                la fléchette (commune à tous les jeux)
  x01.js                  règles X01 : état recalculé depuis config + liste des fléchettes
  checkout.js             table de finitions
  stats.js                statistiques recalculées depuis les fléchettes
  index.js                point d'entrée, registre GAMES
src/ui/                   interface (docs/interface.md) : app.js, nav.js, store.js, mock.js, avatars.js, screens/
src/ui/theme.js           palette (source de vérité des couleurs), contraste
tests/                    tests node:test (*.test.js) ; helpers.js = aides (notation ds('T20 D16'))
tools/build-site.mjs      construit _site/ : lance les tests, remplit la page, copie assets/ et src/
.github/workflows/ci.yml     tests sur chaque demande de fusion et sur main
.github/workflows/pages.yml  build + déploiement GitHub Pages à chaque push sur main
docs/                     cahier des charges, DA, moteur, interface
package.json              version de l'appli (champ "version"), scripts ; aucune dépendance
```

Les tests sont dans `tests/` (et non `test/`) : avec `node --test`, tout fichier `.js` d'un dossier
`test/` est pris pour un fichier de tests, y compris les aides.

## Commandes

- Tests : `node --test` (ou `npm test`) ; détail lisible : `node --test --test-reporter=spec`.
- Site : `node tools/build-site.mjs` → `_site/` (ignoré par git). Servir `_site/` en HTTP pour le voir
  (les modules ES et les polices ne marchent pas en `file://`).
- Node 22 en CI ; aucune installation (`npm install` inutile).
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
| 1 | Maquette de tous les écrans, sombre et clair (validation du design) — **fait, en attente de validation** |
| 2 | Partie jouable + joueurs et avatars |
| 3 | Historique et stats |
| 4 | Finitions : propositions de finition, mode nuit, vibrations, export / import (validation des fonctions) |
| 5 | APK (coquille Java WebView `fr.orbitalvkl.strela`, minSdk 30, release signée, mise à jour dans l'appli) |
| 6 | Recette |

## État (fin du lot 1)

- Maquette complète publiée (version 0.1.0) : tous les écrans, sombre et clair, navigation réelle.
  Sommaire des écrans et états : `https://orbitalvkl.github.io/STRELA/?maquette`. Détail : docs/interface.md.
- Jeu branché sur le vrai moteur, en mémoire (bust, ANNULER, manches, revanche, abandon). Rien n'est enregistré
  sauf les réglages d'affichage (`strela.theme`, `strela.night`, `strela.vibrate`) ; données fictives recréées
  à chaque chargement (`src/ui/mock.js`, parties jouées par le moteur).
- Nouveaux modules purs testés : `checkout.js` (finitions), `stats.js` (statistiques). 70 tests.
- PWA : manifeste + service worker réseau d'abord ; Wake Lock et vibrations pendant la partie.
- Vérification visuelle : captures Playwright 410 × 914 et 410 × 760 (scripts hors dépôt), relecture de l'écran
  de jeu par un second agent, corrections faites.
- À faire au lot 2 : IndexedDB avec la même forme de données que `store.js`, enregistrement à chaque fléchette,
  photo d'avatar, retrait des données fictives hors sommaire. Attendre la validation du design par Guillaume.
