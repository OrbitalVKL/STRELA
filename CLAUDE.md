# Strela — règles du projet

Appli Android de fléchettes (X01, et Cricket depuis la 0.10.0) pour Guillaume. Dépôt `OrbitalVKL/STRELA` (public, branche `main`).
Cahier des charges : [docs/cahier-des-charges.md](docs/cahier-des-charges.md).

## Méthode de travail

- **Guillaume ne lit pas le code.** Messages haut niveau : ce qui est fait, ce qu'il doit faire (quoi
  installer, quoi ouvrir, quoi tester), rien d'autre.
- **Chaque lot se fait dans une session neuve.** Tout ce qu'une session suivante doit savoir va dans ce
  fichier et dans `docs/`. Mettre à jour « État » ci-dessous à la fin de chaque lot.
- Travailler sur la branche de session, ouvrir une demande de fusion vers `main`, la fusionner dès que tout est vert
  (CI `ci / tests` et les 4 `ci / grille`) — voir « Aller vite » pour l'accord de Guillaume.
- **Plus d'architecte (10/11/2026)** : Claude est autonome sur le projet — il décide des choix techniques, tient ce
  fichier et `docs/` à jour (c'est là que va ce qu'une session suivante doit savoir), et ne pose à Guillaume que les
  questions qui sont vraiment les siennes (goûts, usage, contenu).
- **Aller vite (13/11/2026, demande de Guillaume)** :
  - **Proposer en images d'abord** : pour un choix de présentation, faire 2 ou 3 propositions en images (page HTML/SVG
    hors dépôt, capture Playwright, envoyées à Guillaume) au lieu de coder la maquette ; ne coder que ce qu'il retient.
  - **Regrouper** : plusieurs demandes dans une même branche et une seule publication.
  - **Publier** : Guillaume a demandé que je publie dès que c'est vert, mais l'outil refuse encore la fusion tant qu'il ne
    l'a pas écrit dans la conversation : lui demander « publie » dès que la CI est verte (une phrase, sans rapport).
  - **CI** : la grille de chevauchement complète tourne en 4 parts parallèles (job `grille`) ; le job `tests` ne la lance
    pas (`STRELA_GRILLE=aucune`) ; l'émulateur ne tourne sur une demande de fusion que si elle touche la partie native
    (android/, native.js, back.js, android-check, manifeste, sw.js, ci.yml) ; Pages et APK prennent la grille réduite
    (`STRELA_GRILLE=reduite`). Sur le poste : `node --test` (grille réduite) suffit avant d'envoyer.
- Fin de lot : message court en deux parties — **Fait**, **À toi** (adresse à ouvrir sur son Pixel 10 Pro et quoi y
  vérifier). Plus de « Rapport pour l'architecte ».
- **Interface entièrement en français.** Titre de l'appli en lettres latines : **STRELA** (lot 4 ; plus de titre russe).
  Le code (identifiants) est en anglais, les commentaires et la doc en français.
- Grafit (`OrbitalVKL/GRAFIT`) est la référence de DA et de chaîne APK : **lecture seule, ne jamais le modifier.**

## Direction artistique

« Console Soyuz » reprise de Grafit, détail dans [docs/direction-artistique.md](docs/direction-artistique.md).
Résumé : sombre `#0A0C0E` / texte `#CFD2D4` ; clair `#ECEDEE` / texte `#14171A` ; atténué = 62 % du texte
mélangé au fond, discret = 30 % ; rouge `#9E4A4A`, texte rouge `#C26A6A` (en clair : `#9E4A4A`) ; vidéo inverse.
Cible aux couleurs d'une vraie cible, identiques dans les deux thèmes (jetons `--board-*`).
Rouge d'accent (lot 4) : accueil et écran de secours seulement (variante « bande » : bande de titre et action principale en
aplat rouge) ; en jeu, le rouge reste réservé au bust. Thème Auto / Sombre / Clair (Auto par défaut). Police Martian Mono **embarquée** (`assets/fonts/`, OFL),
filets fins, angles droits, rien d'arrondi. Utiliser les jetons CSS de `assets/theme.css`, jamais de couleur en dur.

## Structure du dépôt

```
index.html                l'appli (page unique). Marques <!--@clé-->…<!--/@--> remplies au build (bloc #build)
manifest.webmanifest      PWA : portrait et paysage, plein écran ; sw.js : service worker « réseau d'abord »
assets/theme.css          thème (jetons CSS sombre / clair, fonds d'avatar --av-0…15, --night, @font-face)
assets/app.css            styles des écrans (jetons uniquement)
assets/fonts/             Martian Mono woff2 (latin, latin-ext, cyrillique) + OFL.txt
assets/icon.svg           icône « Soyouz » (lot 6, grille 108) ; tools/make-icons.mjs en tire icon-192/512/maskable-512.png,
                          icon-mono.svg, les calques vectoriels d'Android (res/drawable) et docs/play/icone-512.png
confidentialite.html      politique de confidentialité (lot 6), publiée sur Pages ; liée depuis À propos
android/                  coquille Android (lot 5, docs/android.md) : MainActivity, Bridge (passerelle strelaNative),
                          Speech (voix) ; page copiée dans app/src/main/assets/www/ par apk-page.sh. Lot 6 : variantes
                          src/github (Updater, UpdateBridge, Flavor : mise à jour, INTERNET) et src/play (Flavor vide)
src/data/db.js            base du téléphone (IndexedDB) : migrations, relecture, écritures en une transaction ; sans DOM
src/data/backup.js        sauvegarde JSON (lot 3) : format, vérification, REMPLACER TOUT / FUSIONNER ; sans DOM
src/engine/               moteur de règles, JS pur sans dépendance ni DOM (docs/moteur-x01.md)
  darts.js                la fléchette (commune à tous les jeux)
  x01.js                  règles X01 : état recalculé depuis config + liste des fléchettes
  cricket.js              règles du Cricket (lot 10, docs/moteur-cricket.md) ; index.js › stateOf : l'un ou l'autre
  checkout.js             table de finitions
  stats.js                statistiques recalculées depuis les fléchettes
  board.js                géométrie de la cible (position → segment, centre d'un segment, couleur de chaque zone)
  players.js              suppression d'un joueur (anonymisation « ~rang » de ses parties)
  correct.js              corriger une fléchette jouée sans changer le déroulé (lot 3)
  index.js                point d'entrée, registre GAMES
src/ui/                   interface (docs/interface.md) : app.js, nav.js, store.js (état + écritures dans la base),
                          avatars.js, screens/ (dont photo.js : recadrage), crop.js (calculs du recadrage),
                          board.js (dessin de la cible), roll.js (chiffres en rouleau), turn.js (validation des volées),
                          table.js (historique en tableau), fit.js (compaction des blocs trop chargés),
                          feedback.js (sons Web Audio et annonces vocales, lot 3),
                          rescue.js (écran de secours, script classique chargé avant l'appli, lot 4),
                          native.js (passerelle de l'APK, lot 5 ; variante, retour prédictif, lot 6), back.js (retour),
                          screens/about.js (À propos, lot 6),
                          mock.js + maquette.js (données fictives : sommaire ?maquette et tests seulement)
src/ui/theme.js           palette (source de vérité des couleurs), contraste
src/ui/vowels.js          voyelles qui tombent quand Tsia lance (lot 7)
src/ui/turnfx.js          animations de tour par joueur (lot 7.4) : ours, cravate, carabine, planète, étoile rouge ; sons et voix (lot 7.5)
src/ui/pictofx.js         une animation par pictogramme d'avatar (lot 7.9) : 37 saynètes ; tools/pictos.mjs : leurs captures
src/ui/screens/soiree.js  soirée (lot 7.6) : joueurs de la soirée, verres cumulés d'une partie à l'autre
src/ui/screens/v2/        écrans de la refonte (lot 7.8, dans l'appli depuis la 0.8.0) : home2.js, stats2.js (+ classement), history2.js,
                          soireedash.js (tableau de bord d'une soirée) ; engine/soiree.js : son modèle (pur, testé) ;
                          src/ui/soireereport.js : rapport de soirée en 3 feuilles A4 (A podium, B chronologie, C duels)
src/ui/changelog.js       nouveautés de chaque version (écran #/nouveautes) ; src/ui/info.js : explications derrière (i) (0.8.1)
tools/animations.mjs      captures des animations de tour figées à plusieurs instants (lot 7.4)
src/ui/sheet.js           fiche de score : modèle, dessin sur canvas (demi-page A5 paysage ou A4, lot 7.3), PDF (lot 7.1) ; screens/printsheet.js : boutons et envoi
src/engine/records.js     records personnels (lot 9) ; src/ui/autobackup.js : sauvegarde automatique (APK, lot 9)
src/engine/defis.js       défis de soirée (lot 9, tirage déterministe) ; src/engine/badges.js : badges, tableau d'honneur
src/ui/screens/cricket.js écrans du Cricket (lot 10) : jeu (face à face / grille), fin, détail d'une partie
src/ui/honours.js         vitrine (Stats), tableau d'honneur #/honneur, badges de fin de partie ; src/ui/soireesummary.js :
                          résumé de soirée à partager (image 1080 × 1920)
src/engine/ranking.js     classement, joueur en tête, derniers (tournée), célébrations des nuls (lot 7)
src/engine/alcohol.js     verres : comptes (verre 25 cl, pinte 50 cl = 2 verres, 0.8.2), place dans la partie, alcoolémie estimée (lot 7) ;
                          src/ui/drinks.js : choix verre / pinte et affichage du compte (0.8.2)
tests/                    tests node:test (*.test.js) ; helpers.js = aides (notation ds('T20 D16'))
                          Playwright (sautés s'il est absent) : chevauchement, couleurs, geste, stockage (base),
                          parcours (vraie appli, rechargements), photo, miseajour (service worker + base v2) ;
                          lot 3 : saisie (touches au relâcher), suppression, panneau (+ correction), annonces,
                          sauvegarde (aller-retour), chiffres (stats contre un calcul à la main) ;
                          lot 4 : finition (double préféré en vraie appli), secours (écran de secours, stockage plein) ;
                          lot 5 : passerelle (APK simulé, et navigateur) ; lot 6 : android (variantes, manifeste fusionné
                          play), icone (calques à jour), play (fiche : longueurs, images)
tools/build-site.mjs      construit _site/ : lance les tests (sauf STRELA_SANS_TESTS=1), remplit la page, copie assets/ et src/
tools/apk-page.sh         copie le site construit dans l'APK ; tools/android-check.mjs : essai de l'APK sur émulateur (adb),
                          mise à jour en place, variante play ; tools/play-assets.mjs : captures et image de la fiche Play
tools/check-layout.mjs    test de chevauchement en ligne de commande ; tools/captures.mjs : captures ; tools/geste.mjs :
                          saisie au doigt en paysage ; tools/lib/ : serveur, contrôle de mise en page, geste,
                          app.mjs (pilotage de la vraie appli : saisie, lecture de la base, instantané de l'écran)
.github/workflows/ci.yml     tests sur chaque demande de fusion et sur main
.github/workflows/pages.yml  build + déploiement GitHub Pages à chaque push sur main
.github/workflows/apk.yml    tests, page embarquée, APK github signé publié en release apk-vX.Y.Z (strela.apk) à chaque push
                             sur main ; .aab play signé en artefact (jamais publié) ; signature comparée à la release d'avant
docs/                     cahier des charges, DA, moteur, interface, statistiques (définitions exactes), android ;
                          docs/play/ : fiche Google Play prête (textes, formulaires, images, checklist.md)
package.json              version de l'appli (champ "version"), contact (strela.contact, vide = « [E-MAIL DE CONTACT] »),
                          scripts ; aucune dépendance
```

Les tests sont dans `tests/` (et non `test/`) : avec `node --test`, tout fichier `.js` d'un dossier
`test/` est pris pour un fichier de tests, y compris les aides.

## Commandes

- Tests : `node --test` (ou `npm test`) ; détail lisible : `node --test --test-reporter=spec`. Sur le poste, le test de
  chevauchement prend une grille réduite ; `STRELA_GRILLE=complete node --test` pour la grille de la CI ;
  `STRELA_GRILLE=aucune` pour la sauter, `STRELA_GRILLE_PART=2/4` pour une part seulement.
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
- Version : `package.json` → affichée sur la page et lue par l'APK (`android/app/build.gradle`).
- APK : `STRELA_SANS_TESTS=1 node tools/build-site.mjs && sh tools/apk-page.sh && (cd android && gradle assembleGithubDebug
  assemblePlayDebug bundlePlayDebug)` (lot 6 : SDK Android 36 — `sdkmanager "platforms;android-36" "build-tools;36.0.0"`
  si absent —, Java 17+, Gradle 8.13+ ; Maven Central répond parfois 429 : relancer). Pas d'émulateur dans les sessions
  (pas de KVM) : la CI l'essaie sur émulateur Android 14 et 16 (job `emulateur`). Détail : docs/android.md.
- Icône : `node tools/make-icons.mjs` ; images de la fiche Play : `node tools/play-assets.mjs`.

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
| 1.3 | Corrections : 3 fléchettes par case d'historique, une seule couleur de joueur en jeu, VALIDER à la couleur du lanceur — **fait, design validé** |
| 2 | Partie jouable et enregistrée (IndexedDB, reprise), vrais joueurs et photo d'avatar, VALIDER sans le suivant — **fait** |
| 3 | Corrections de jeu, historique, stats et sauvegarde (touches au relâcher, suppression de parties, face-à-face, panneau cible + historique, finition dans les cases, voix, célébrations, sons, correction d'une fléchette, export / import, chiffres vérifiés) — **fait** |
| 4 | Finitions : titre STRELA + rouge d'accent (accueil), finition au double préféré (base v2), écrans vides et erreurs, écran de secours — **fait** |
| 5 | APK (coquille Java WebView `fr.orbitalvkl.strela`, minSdk 30, passerelle native, release signée, mise à jour dans l'appli) — **fait, validé sur le Pixel** |
| 6 | Icône « Soyouz », 16 fonds et 40 pictogrammes d'avatar, recherche de mise à jour automatique, variantes github / play (Android 16), À propos et confidentialité, fiche Play prête (v0.6.0) — **fait, en attente de validation sur le Pixel** |
| 7 | Soirée : voyelles qui tombent (Tsia), ordre tiré au sort, joueur en tête, célébrations des nuls, jouer jusqu'au bout, classement, tournée du dernier, verres et alcoolémie estimée (v0.7.0) — **fait, en attente de validation sur le Pixel** |
| 7.1 | Célébrations affichées jusqu'à un appui, verres dans l'historique de la partie, fiche de score en image et PDF (v0.7.1) — **fait, en attente de validation sur le Pixel** |
| 7.2 | Verres affichés « [verre] x3 » partout, sans équivalent en alcool (v0.7.2) — **fait, en attente de validation sur le Pixel** |
| 7.3 | Fiche de score allégée (vainqueur, classement avec verres, tournée, scores), demi-page A4 paysage si la partie est courte (v0.7.3) — **fait, en attente de validation sur le Pixel** |
| 7.4 | Animations de tour par joueur (fiche joueur) : ours, costume-cravate, carabine, planète, étoile rouge ; pictogramme cravate (v0.7.4) — **fait, en attente de validation sur le Pixel** |
| 7.5 | Sons de l'ours et de la planète, voix d'homme et répliques beauf de HPV, Tsia qui marmonne (voix pâteuse), moqueries dès une volée sous 20 et variées (v0.7.5) — **fait, en attente de validation sur le Pixel** |
| 7.6 | Tirage au sort revu (REVANCHE retirée au sort), bande du tour (TOUR n, qui a lancé), mode soirée (joueurs, verres cumulés d'une partie à l'autre), bouton verre en jeu, volée parmi les 3 meilleures / pires de la soirée, pavé double / triple bien distincts (v0.7.6) — **fait, en attente de validation sur le Pixel** |
| 7.7 | Stats : meilleure et pire volée, pire volée de chaque partie ; moqueries plus cyniques ; 22 répliques de HPV en plus (v0.7.7) — **fait, en attente de validation sur le Pixel** |
| 7.8 | Refonte (13/11/2026) : accueil A « tableau de bord », stats (courbe de n'importe quel chiffre, zoomable, explications (i), volées repliées, triples, cible chiffrée), classement global, historique (soirées, filtres, regrouper en soirée), tableau de bord et rapport de soirée en 3 feuilles, réglages en cartes, nouveautés ; CI plus rapide (v0.8.0) — **fait, en attente de validation sur le Pixel** |
| 7.9 | Une animation de tour par pictogramme d'avatar, toutes différentes (41), jouée d'office pour un avatar à pictogramme, aussi au Cricket (publié avec la v0.10.0) — **fait, en attente de validation sur le Pixel** |
| 9 | Idées retenues le 13/11 (docs/idees.md) : tournée, moyenne au fil des verres, défis (B), résumé à partager (A), handicap, records et badges (A + B), comparer deux joueurs, sauvegarde automatique (v0.9.0) — **fait, en attente de validation sur le Pixel** |
| 10 | Cricket : A face à face (2 joueurs) + B grille (2 à 8), avec points / sans points / cut-throat (v0.10.0) — **fait, en attente de validation sur le Pixel** |
| 8 | Recette |

## État (version 0.8.0 : la refonte dans l'appli)

- **Version 0.8.0** (13/11) : Guillaume retient l'accueil A et fait publier toute la refonte. Plus de drapeau `preview` :
  les écrans de src/ui/screens/v2/ (home2, stats2 + classement, history2, soireedash) et `settings2Screen` sont ceux
  de l'appli ; anciens accueil, stats, réglages et liste de l'historique retirés. Détail : docs/interface.md
  « Version 0.8.0 » (et « Lot 7.8 » pour les écrans eux-mêmes).
- Rapport de soirée : 3 feuilles A4 (soireereport.js) — A podium et cartes, B chronologie, C duels et cibles ; aperçu,
  IMAGE (les 3 empilées), PDF (3 pages).
- Sommaire : section « Version 0.8.0 » (scènes v78-… sur une saison fictive de 14 soirées, `seasonMock`).
- Nouveautés : src/ui/changelog.js, une entrée par version (à tenir à chaque publication).
- Aucune migration. Pire volée sans les bust ; taux de finition calculé mais plus affiché (taux de triples à la place).
- À vérifier sur le Pixel : tout le parcours de la refonte avec les vraies données (historique groupé, regrouper en
  soirée, rapport de soirée en PDF partagé, classement, réglages, nouveautés).
- **0.8.1** (13/11) : export du rapport accepté par l'APK, correction des verres (détail d'une partie ; soirée aux verres
  resaisis à chaque partie, annulable), retour vers l'écran d'origine (`backFrom`), explications derrière (i) au
  tableau de bord et au détail de partie, valeurs sur les courbes. Détail : docs/interface.md « Version 0.8.1 ».
- **0.8.2** (13/11) : verre (25 cl) ou pinte (50 cl, `v: 0.5`, compte pour 2 verres partout ; src/ui/drinks.js),
  défilements gardés d'un rendu à l'autre et au retour (app.js › draw), plus aucun lien en bleu souligné. Détail :
  docs/interface.md « Version 0.8.2 ». Idées d'amélioration proposées à Guillaume le 13/11 (à lui de choisir) :
  docs/idees.md.
- **0.9.0** (13/11, lot 9 première partie) : tournée (+1 pour tous, TOURNÉE SERVIE indicative), moyenne au fil des
  verres, handicap, records personnels en direct et en fin de partie, comparer deux joueurs, sauvegarde automatique.
  Puis, sur images (« B, A, AB, AB ») : défis de soirée (tirage plein écran, src/engine/defis.js), résumé à partager
  (affiche 1080 × 1920, src/ui/soireesummary.js), badges et tableau d'honneur (src/engine/badges.js, src/ui/honours.js,
  `#/honneur`). Détail : docs/interface.md « Version 0.9.0 ». Bridge.saveFile accepte `strela-resume-…png`.
- **0.10.0** (13/11, lot 10) : **Cricket** — moteur src/engine/cricket.js (docs/moteur-cricket.md), écrans
  src/ui/screens/cricket.js (`#/cricket`, `#/cricket/fin`, `#/cricket/partie/<id>`), parties rangées à part
  (`store.ckGames`, `store.ck` ; `config.game: 'cricket'`, aucune migration). Détail : docs/interface.md « Version 0.10.0 ».
  Pas encore pour le Cricket : verres dans la partie, défis, badges, records, rapport de soirée (à proposer si
  Guillaume le veut).
- Question ouverte à Guillaume : TOURNÉE SERVIE aussi à chaque fin de manche (aujourd'hui en fin de partie seulement) ?
- **Lot 7.9** (13/11, dans la 0.10.0) : une animation de tour par pictogramme — src/ui/pictofx.js (37 saynètes + les 4
  d'origine = 41), choix « SON PICTO » dans la fiche, d'office sans choix pour un avatar à pictogramme, aussi au
  Cricket ; sons `fx-…`. Détail : docs/interface.md « Lot 7.9 ». Outil : tools/pictos.mjs.
- Ensuite : recette (lot 8), ou ce que Guillaume demandera après essai (Cricket : verres, défis, badges ?).

## État (fin du lot 7.7)

- Version 0.7.7. Aucune migration (tout est recalculé). Détail : docs/interface.md « Lot 7.7 », définitions :
  docs/statistiques.md.
- « Pires scores de chaque partie » compris comme la pire volée du joueur dans chaque partie (liste dans ses stats).
- À vérifier sur le Pixel : les nouvelles cases des Stats ; les moqueries (assez cyniques ?) et HPV.

## État (fin du lot 7.6, pour mémoire)

- Version 0.7.6. Aucune migration (champs facultatifs `shuffled`, `soiree`, `drinksBefore` des parties ; réglage
  `soiree`). Détail : docs/interface.md « Lot 7.6 ».
- « Numéro de manche » de Guillaume compris comme le **tour** (la manche était déjà au bandeau) : bande du tour sous les
  cases (TOUR n + joueurs dans l'ordre du tour, depuis le premier de la manche), avec le bouton verre (« +1 »).
- Tirage : l'algorithme était bon ; la REVANCHE ne retirait pas au sort, c'est corrigé.
- Soirée : `#/soiree`, accueil ; écran src/ui/screens/soiree.js, données dans store.js (section « soirée »).
- Au résultat d'une volée : « MEILLEURE / 2E PIRE… VOLÉE DE LA SOIRÉE » si elle est parmi les 3 meilleures ou pires
  (`visitStanding`, ranking.js). Pavé : double = fond gris + 2 traits, triple = vidéo inverse + 3 traits.
- À vérifier sur le Pixel : lisibilité de la bande du tour de loin ; le bouton verre ; une vraie soirée de plusieurs
  parties (cumul juste après REVANCHE et Nouvelle partie).
- Plus tard (lot 7.9) : une animation par pictogramme d'avatar, toutes différentes (les 41 pictogrammes,
  src/ui/avatars.js) — à cadrer avec Guillaume (remplace-t-elle l'animation choisie dans la fiche ?).

## État (fin du lot 7.5, pour mémoire)

- Version 0.7.5. Aucune migration. Détail : docs/interface.md « Lot 7.5 ».
- Sons Web Audio de l'ours (grognements, reniflements, grattage, ronflement, mastication) et de la planète (orbite,
  étoiles, étoile filante) ; rien pour l'étoile rouge (demande de Guillaume).
- Voix des personnages : `say(texte, { style: 'homme' | 'ivre' })`, après l'annonce en cours ; APK : `Bridge.speakAs`
  (nouvelle méthode native, voix d'homme du moteur si présente). HPV : répliques beauf, voix d'homme. Tsia :
  `SPEECH.drunk()` au début de chaque volée, voix pâteuse.
- Moqueries : volée sous 20 (au lieu de 10), plusieurs phrases par cas tirées au sort (`FLOP_LINES`).
- À vérifier sur le Pixel : la voix d'homme existe-t-elle dans le moteur Google (sinon la voix habituelle, plus grave) ;
  grognements audibles sur le haut-parleur.

## État (fin du lot 7.4, pour mémoire)

- Version 0.7.4. Base v2, sauvegarde v1 : **aucune migration** (champ facultatif `turnAnim` du joueur).
- Animations de tour (détail : docs/interface.md « Lot 7.4 ») : choix dans la fiche joueur (aperçu à l'appui), jouées
  au début de chaque volée par-dessus le jeu (`src/ui/turnfx.js`, calque `#tfx`), non bloquantes, arrêtées à la première
  fléchette, jamais pendant une célébration, coupées avec le réglage Animations. Défaut : voyelles pour Tsia, rien
  sinon. Pictogramme **cravate** (41 dans la banque). Son `shot` (carabine). L'étoile rouge prend `--red` en jeu
  (exception à la DA demandée par Guillaume).
- À régler par Guillaume sur le Pixel : choisir l'animation dans la fiche de Gilles (OURS), HPV (CRAVATE), Patrick
  (CARABINE), Angelina (PLANÈTE) et la sienne (ÉTOILE ROUGE) ; les pseudos ne déclenchent rien d'eux-mêmes (sauf Tsia).
- Ouvert : répliques de HPV à compléter si Guillaume en donne (`TIE_LINES`) ; toujours les points ouverts du lot 7.3.

## État (fin du lot 7.3, pour mémoire)

- Version 0.7.3. Fiche de score allégée : vainqueur, classement (place, joueur, manches si plusieurs, verres), tournée,
  scores de chaque manche ; plus de titre, de légendes ni de pied de page. Demi-feuille A4 paysage (A5) si la partie
  tient (6 joueurs ou moins), sinon une page A4 (réduite jusqu'à 62 %), sinon des pages A4. IMAGE et PDF gardés
  (choix de Guillaume). Détail : docs/interface.md « Lot 7.3 ».
- Toujours ouvert : célébrations vues partir seules (à confirmer en 0.7.2 ou plus) ; contrôle « retour en partie » de
  l'émulateur 34 (le lanceur garde le focus).

## État (fin du lot 7.2, pour mémoire)

- Version 0.7.2. Verres affichés « [verre] x3 » (jeu, menu pause, fin de partie, historique, fiche) ; plus d'alcoolémie
  en g/L à l'écran (demande de Guillaume). Aucune migration.
- Ouvert : Guillaume voit les célébrations partir seules ; non reproduit en 0.7.1 (voir docs/interface.md « Lot 7.2 »).
  À confirmer avec la version affichée dans Réglages.

## État (fin du lot 7.1, pour mémoire)

- Version 0.7.1. Base v2, sauvegarde v1 : toujours aucune migration. Un verre est maintenant `{ t, at }` (`at` : place
  dans la partie) ; les verres de la v0.7.0 (instants seuls) restent lus.
- Lot 7.1 (détail : docs/interface.md « Lot 7.1 ») :
  - **Célébrations** : restent jusqu'au premier appui, qui ne fait que les fermer (tests : `ack(page)`).
  - **Verres dans l'historique** : chaque case du tableau (cumul, encadré s'il a bu pendant ce tour) ; le joueur qui
    lance voit ses verres au-dessus du reste (`drinksTimeline`, alcohol.js).
  - **Fiche de score** IMAGE / PDF (fin de partie, détail d'une partie) : `src/ui/sheet.js`, `screens/printsheet.js`,
    `Bridge.saveFile` (Téléchargements/Strela + partage).
- Ouvert : impression directe par le service d'impression d'Android (aujourd'hui : menu de partage, puis l'appli
  choisie imprime) ; le reste comme au lot 7.

## État (fin du lot 7, pour mémoire)

- Version 0.7.0. Base toujours en version 2, sauvegarde au format 1 : **aucune migration** (demande de Guillaume : les
  données de l'appli doivent survivre à la mise à jour). Nouveaux champs facultatifs : `config.playOn`,
  `games.drinks`, `lastSetup.shuffle` / `playOn`.
- Lot 7 (détail : docs/interface.md « Lot 7 », moteur : docs/moteur-x01.md « Jouer jusqu'au bout ») :
  - **Voyelles qui tombent** quand le joueur au pseudo Tsia lance (`src/ui/vowels.js`, tout l'écran de jeu).
  - **Ordre tiré au sort** au lancement (Nouvelle partie, OUI par défaut).
  - **Joueur en tête** (reste en vidéo inverse dans la bande, « EN TÊTE » au bandeau).
  - **Célébrations des nuls** : 0, sous 10, bust, série (`src/engine/ranking.js` › `flop`), son de trombone, annonce moqueuse.
  - **Jouer jusqu'au bout** (option à partir de 3 joueurs) : moteur X01 (`playOn`, événement `placed`, `finishOrder`).
  - **Classement** en fin de partie et **le dernier paie sa tournée**.
  - **Verres** (menu pause) et **alcoolémie estimée** (`src/engine/alcohol.js`, Widmark simplifié, 24 h).
- Choix (réponses de Guillaume) : alcoolémie = compteur de verres (pas de gag calculé) ; nuls = 0, sous 10, bust, série ;
  voyelles = pseudo Tsia, tout l'écran ; jusqu'au bout = option au lancement.
- Ouvert : poids et sexe par joueur pour une estimation plus juste (pas demandé : 70 kg pour tous) ; e-mail de contact
  (package.json `strela.contact`) ; ligne de la fiche Play sur l'alcool (le compteur de verres s'ajoute aux pictogrammes
  chope et verre pour le questionnaire IARC).

## État (fin du lot 6, pour mémoire)

- Version 0.6.1 (6.1 : recherche de mise à jour qui passe par la page web des releases quand l'API de GitHub refuse,
  limite de 60 demandes par heure et par IP, vu sur le Pixel : « GitHub a répondu 403 »). Avant : 0.6.0. Base toujours en version 2 (aucune migration : le réglage `autoUpdate` s'ajoute aux réglages
  d'affichage avec sa valeur par défaut, et une couleur d'avatar 8 à 15 tient dans le même champ). Sauvegarde au format 1.
- Décisions prises sur le lot 5 : vibreur en usage MEDIA ; photo perdue si le moteur de rendu meurt pendant la prise de
  vue (accepté) ; diagnostic des Réglages gardé ; accueil variante A.
- Lot 6 :
  - **Icône « Soyouz »** (assets/icon.svg, grille 108) déclinée en PWA, icône adaptative et monochrome d'Android
    (vecteurs), icône Play ; aperçu au sommaire (section « Icône d'appli »).
  - **Avatars** : 16 fonds (≥ 14 de CIEDE2000 entre les 16, ≥ 20 entre les 8 d'origine : 20 sur 16 est impossible,
    voir theme.js), 40 pictogrammes dont la carabine, banque rangée par thème.
  - **Mise à jour automatique** (APK github) : au lancement, hors partie, au plus une fois par 24 h, réglage pour la
    couper ; repère à l'accueil et dans les Réglages ; rien n'est téléchargé sans appui.
  - **Variantes** github (`fr.orbitalvkl.strela`, APK, release) et play (`fr.orbitalvkl.strela.play`, .aab en
    artefact, sans mise à jour ni INTERNET) ; compileSdk / targetSdk 36 ; retour prédictif (rappel retiré à l'accueil) ;
    plugin Android 8.11.1, Gradle 8.14.3 en CI.
  - **À propos** (`#/apropos`) et **confidentialite.html** ; **docs/play/** (fiche, sécurité des données,
    classification, captures, image de présentation, icône, checklist).
- CI : émulateur Android 14 et 16, mise à jour en place 0.5.0 → 0.6.0 (APK de test, même clé), variante play à côté.
  apk.yml compare le certificat de la nouvelle release à celui de la précédente avant de publier.
- Ouvert : e-mail de contact à fournir (package.json `strela.contact`) ; nom Play limité à 30 caractères (proposé :
  « Strela, compteur de fléchettes ») ; pictogrammes chope et verre = « références à l'alcool » au questionnaire IARC.
- Pour la suite : tout nouvel écran ou état va dans `SCENES` ; une fonction native nouvelle va dans `Bridge.java` (ou
  `UpdateBridge.java` si propre à la variante github), `src/ui/native.js` et la passerelle simulée de
  `tests/passerelle.test.js`.

## État (fin du lot 5, pour mémoire)

- Version 0.5.0. Base en version 2 (inchangée au lot 5). APK : docs/android.md.
- Lot 5 : coquille `android/` (WebView, page embarquée sur appassets.androidplatform.net, rotation sans rechargement,
  retour = page, plein écran et écran allumé en partie, zone des gestes) ; passerelle `strelaNative` (vibreur, voix
  d'Android, export Téléchargements/Strela + partage, import et photo par les sélecteurs d'Android, mise à jour) ;
  premier lancement : IMPORTER UNE SAUVEGARDE DE LA VERSION WEB ; Réglages › Appli Android (mise à jour, désinstaller
  efface les données) ; `apk.yml` (release `apk-vX.Y.Z`, `strela.apk`) ; CI : APK de test + essai sur émulateur.
- Secret `STRELA_SIGNING_PASSPHRASE` (créé par Guillaume) : sans lui, `apk.yml` ne publie rien (APK de test en artefact).
  Au premier passage avec le secret, la clé est générée et `android/signing.p12.enc` est poussé sur `main` par le bot.
- Vérifié sur émulateur Android 14 en CI (`tools/android-check.mjs`) : page servie sur appassets, passerelle, voix
  et vibreur répondent, retour (Réglages → accueil ; en partie → menu pause, pas de sortie), partie enregistrée,
  rotation sans rechargement, export dans Téléchargements/Strela, fermeture brutale puis reprise. Import par le
  sélecteur de documents : non piloté jusqu'au bout par l'automatisation (vérifié dans le navigateur et avec la
  passerelle simulée). Corrigé grâce à l'émulateur : WebView qui gardait la touche retour, plantage quand Android
  arrête le moteur de rendu en arrière-plan, API trop récentes pour Android 11 (lint en CI).
- À vérifier sur le Pixel (impossible sur l'émulateur) : vibrations ressenties, voix française, sons, appareil photo,
  geste depuis le bas pendant la saisie, import depuis Téléchargements, mise à jour depuis l'appli (à partir de la
  version suivante).
- Pour le lot 6 (recette) : tout nouvel écran ou état va dans `SCENES` ; une fonction native nouvelle va dans
  `Bridge.java`, `src/ui/native.js` (repli web) et la passerelle simulée de `tests/passerelle.test.js`.

## État (fin du lot 4, pour mémoire)

- Version 0.4.0. Base en **version 2** (migration : préférences de finition `checkout: { double, avoidBull }` ajoutées à
  chaque joueur ; rien d'autre ne change). Sauvegarde toujours au format 1 (une sauvegarde sans préférences prend les
  valeurs par défaut). Détail : docs/interface.md, « Lot 4 ».
- Lot 4 :
  - **Accueil** : STRELA en lettres latines partout ; rouge d'accent, variante A « bande » retenue (B « filet » au
    sommaire) ; NOUVELLE PARTIE en aplat rouge quand c'est l'action principale.
  - **Finition** : fiche joueur (double préféré, éviter le bull), table de finitions selon le joueur qui lance, et à
    valeur égale une première fléchette qui laisse un double si elle ne fait que le simple (docs/moteur-x01.md).
  - **Écrans vides et erreurs** : action utile sur chaque écran vide ; alertes d'enregistrement (base inaccessible,
    plus récente, stockage plein : RÉESSAYER / EXPORTER) ; écran de secours (RECHARGER, EXPORTER LA SAUVEGARDE).
- Mode nuit et vibrations : déjà en place (lot 1.2) ; les vibrations passent par le vibreur natif dans l'APK (lot 5).

## État (fin du lot 3, pour mémoire)

- Version 0.3.0. Base toujours en **version 1** (aucune migration au lot 3 ; `write()` sait maintenant vider un magasin,
  `{ store, clear: true }`, pour REMPLACER TOUT). Détail du lot : docs/interface.md, « Lot 3 » ; définitions des
  statistiques : docs/statistiques.md.
- Lot 3 :
  - **A** : pavé, VALIDER, pause et petite cible agissent au relâcher (≤ 10 px de glissé, pas de `pointercancel`) ;
    marge basse `--gesture-bottom` (16 px au moins : la zone des gestes n'est pas mesurable en web ; l'APK pourra la lire).
  - **B** : supprimer une partie (détail, appui long + sélection, menu pause), confirmations, une transaction.
  - **C** : face-à-face `#/face/<joueur>/<adversaire>`, bilan en toutes lettres, parties communes, abandonnées à part.
  - **D + I** : un seul panneau cible + historique en jeu ; correction d'une fléchette (`src/engine/correct.js`),
    refusée si le déroulé change.
  - **E** : fléchette dessinée dans chaque case vide + segment conseillé de la finition ; ligne FINITION retirée.
  - **F / G / H** : annonces vocales, célébrations 100+ / 140+ / 180 / finition, sons Web Audio ; réglages Sons et
    Annonces vocales (OUI par défaut), TESTER LA VOIX, TESTER LES SONS.
  - **J** : sauvegarde JSON (Réglages › Sauvegarde) ; format `strela-sauvegarde` version 1, prévu pour le passage à l'APK.
  - **K** : « SUIVANT PSEUDO » gardé ; LANCER pendant une partie = vraie confirmation.
  - **L** : chiffres vérifiés de bout en bout contre un calcul à la main (aucun écart).
- Tests : 138 (dont 9 nouveaux fichiers du lot 3, voir Structure).
- À vérifier par Guillaume sur le Pixel : la voix française (si les Réglages disent « aucune voix française », installer
  les données vocales Google en français) ; le partage du fichier de sauvegarde (Chrome ne propose peut-être pas le menu
  de partage pour un .json : il est alors téléchargé) ; la marge basse face aux gestes.
- Pour le lot 4 : propositions de finition affinées (doubles préférés), mode nuit, vibrations. Un nouvel écran ou état
  va dans `SCENES` (sommaire) et, pour un état de jeu, dans `SCENES` de `tests/couleurs.test.js`.
