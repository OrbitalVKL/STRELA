# Strela — règles du projet

Appli Android de fléchettes (X01, Cricket depuis la 0.10.0, entraînement solo depuis la 0.12.0, niveau intermédiaire depuis la 0.13.0, X01 et Cricket en solo à l'entraînement depuis la 0.14.0, saisie à la voix depuis la 0.18.0, partie en ligne depuis la 0.19.0, compte en ligne et amis depuis la 0.21.0) pour Guillaume. Dépôt `OrbitalVKL/STRELA` (public, branche `main`).
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
                          Speech (voix), Listen (saisie à la voix, lot 9.3) ; page copiée dans app/src/main/assets/www/ par apk-page.sh. Lot 6 : variantes
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
                          src/ui/soireereport.js : rapport de soirée en 4 feuilles A4 (A podium, B chronologie, C duels,
                          D chiffres, défis et badges — 0.11.1)
src/ui/changelog.js       nouveautés de chaque version (écran #/nouveautes) ; src/ui/info.js : explications derrière (i) (0.8.1)
tools/animations.mjs      captures des animations de tour figées à plusieurs instants (lot 7.4)
src/ui/sheet.js           fiche de score : modèle, dessin sur canvas (demi-page A5 paysage ou A4, lot 7.3), PDF (lot 7.1) ; screens/printsheet.js : boutons et envoi
src/engine/records.js     records personnels (lot 9) ; src/ui/autobackup.js : sauvegarde automatique (APK, lot 9)
src/engine/defis.js       défis de soirée (lot 9, tirage déterministe) ; src/engine/badges.js : badges, tableau d'honneur
src/ui/screens/cricket.js écrans du Cricket (lot 10) : jeu (face à face / grille), fin, détail d'une partie
src/ui/honours.js         vitrine (Stats), tableau d'honneur #/honneur, badges de fin de partie ; src/ui/soireesummary.js :
                          résumé de soirée à partager (image 1080 × 1920)
src/engine/ranking.js     classement, joueur en tête, derniers (tournée), célébrations des nuls (lot 7), roi des uns (0.11)
src/engine/training.js    entraînement solo (lot 8, docs/entrainement.md) : exercices, analyse, coach, niveau ;
                          engine/dartsets.js : jeux de fléchettes (modèles, jeux de Guillaume)
src/ui/screens/training.js entraînement : choix, saisie (pavé S INT./S EXT., cible au doigt), fin, détail ;
                          trainstats.js (stats), arsenal.js (armurerie), advice.js (conseils illustrés) ;
                          src/ui/boardinput.js : saisie au doigt sur la cible (loupe), commune au jeu et à l'entraînement
src/engine/trends.js      tendances (10 dernières séances), période des stats, axe du temps des courbes (lot 8 du 23/11) ;
                          src/ui/heat.js : échelle des cartes de chaleur ; src/ui/modeband.js : bandeau des pages de stats
installer.html            page d'installation (lot 8 du 23/11), publiée sur Pages ; guide : src/ui/installguide.js
src/ui/screens/welcome.js bienvenue et mise en place guidée, tutoriel, installer ; src/ui/trainreport.js : feuille KPI ;
                          src/engine/aiexport.js : export pour une IA
src/engine/fun.js         jeux de cible solo (lot 8 du 23/11) ; src/engine/trainbadges.js : badges d'entraînement et petits
                          défis en séance ; src/ui/trainhonours.js : leur vitrine et leur fenêtre
src/engine/voice.js       saisie à la voix (lot 9.3) : phrase entendue → fléchettes et commandes (pur, tests/voix.test.js) ;
                          src/ui/voiceinput.js : micro, écoute (passerelle ou SpeechRecognition), phrase entendue
src/engine/online.js      partie en ligne (lot 9.2, docs/enligne.md) : salon, autorité de l'hôte, opérations numérotées (pur,
                          tests/enligne.test.js) ; src/net/ : signal.js (signalisation PeerJS), link.js (WebRTC) ;
                          src/ui/online.js (contrôleur), screens/online.js (#/enligne), qr.js (QR code) ; rejoindre.html
                          (page du QR code) ; tools/lib/signal-server.mjs (serveur local des tests) ;
                          tools/enligne-reel.mjs (essai sur les vrais serveurs, 0.20.1)
supabase/schema.sql       base en ligne (lot 10, docs/cloud.md) : tables, RLS, fonctions strela_* ; à coller dans Supabase
src/engine/cloud.js       compte en ligne, pur : identifiant, secret, code de récupération, code d'ami (tests/cloud.test.js)
src/net/supabase.js       client Supabase maison (connexion anonyme, jeton, rpc) ; src/net/cloudconfig.js : adresse et clé
                          publique (vides = synchronisation coupée) ; src/ui/cloud.js : compte invisible, syncNow, étapes ;
                          src/ui/screens/account.js : Réglages › Compte et amis, #/compte
tools/lib/pg.mjs          Postgres local jetable des tests (Supabase imité) ; tools/lib/fake-supabase.mjs : faux Supabase
                          (mêmes adresses, fonctions jouées dans ce Postgres) ; tools/supabase.mjs : réveil, copie, remise ;
                          .github/workflows/supabase.yml : réveil tous les 3 jours, copie chiffrée chaque lundi
src/ui/journal.js         journal de débogage (lot 9.5) : log(cat, msg), 7 jours / 1 Mo, Réglages › Développement ;
                          src/ui/keyboard.js : champ actif gardé visible au-dessus du clavier
src/engine/padinput.js    saisie au pavé debout (0.19.1) : secteur entier / secteur touché (pur, tests/saisie-pave.test.js)
src/engine/shuffle.js     tirage au sort de l'ordre (Fisher-Yates sans biais, 0.11.0 ; tests/tirage.test.js)
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
| 0.11.2 | Plus de tournées ni de gages notés, verres de 25 cl et pintes à part, retrait des tournées notées (v0.11.2) — **fait, en attente de validation sur le Pixel** |
| 0.11.1 | Tableau de bord de soirée repliable et sans débordement, chiffres enrichis, défis et badges (feuille D du rapport, stats du joueur) (v0.11.1) — **fait, en attente de validation sur le Pixel** |
| 0.11 | Retours de la soirée du 20/11 : VALIDER en un appui, bandeau du défi, pastilles de rang, Tsia (menus, dégrisement), HPV, Atila et la moto d'Angelina, badges (fenêtre, rangs, soirée, roi des uns), 6 défis et étoiles, tirage vérifié (v0.11.0) — **fait, en attente de validation sur le Pixel** |
| 8 | Entraînement solo : coaché (7 exercices débutant, analyse, conseils, niveau) et libre, saisie S INT. / S EXT., armurerie, stats entraînement / parties / les deux, conseils illustrés, base v3 (v0.12.0) — **fait, en attente de validation sur le Pixel** |
| 8.1 | Entraînement : couleurs des pièces, dessin au choix du jeu, changer de jeu en pleine séance, niveau intermédiaire (5 exercices) et objectifs par niveau, gestion des séances (note, jeu, joueur, mise de côté, reprise) (v0.13.0) — **fait, en attente de validation sur le Pixel** |
| 8.2 | Entraînement : mode JEUX, X01 et Cricket en solo aux vraies règles ; triples, doubles et carte de chaleur des stats réservés aux jeux et parties (v0.14.0) — **fait, en attente de validation sur le Pixel** |
| 8 (23/11) | Entraînement, stats et distribution (docs/lot-8-avancement.md) : 0.15.0 = saisie précise, règles, stats, listes en cartes — **fait** ; 0.16.0 = jeux de cible, défis en X01 solo, badges d'entraînement — **fait** ; 0.17.0 = modes, accueil, réglages, exports, installation — **fait** ; 0.17.1 = choix de la zone (rangées ou secteur) — **fait** |
| 9 (23/11) | Lot 9 (docs/lot-9-avancement.md) : 0.18.0 = 9.3 saisie à la voix — **fait** ; 0.19.0 = 9.2 partie en ligne — **fait** ; 9.1 (iPhone) et 9.4 (audio en ligne) reportés |
| 0.19.1 | Saisie verticale : secteur entier (rapide, d'un appui) / secteur touché (précis), réglage sur le pavé, traits S / D / T — **fait** |
| 0.20.1 | En ligne : messages à la forme exigée par le serveur PeerJS public (il coupait l'invité, l'hôte ne recevait rien) — **fait** |
| 9.5 | Retours du 24/11 (docs/lot-9-5.md) : en ligne par étapes avec repli MQTT, clavier, historique X01 solo juste, journal de débogage, sélecteur Soirée / Entraînement en haut des stats, résumé X01 (volées), impacts par secteur visé (v0.20.0) — **fait** |
| 10 (24/11) | Amis, synchronisation, stats partagées (docs/lot-10.md, docs/lot-10-avancement.md) : 0.21.0 = étape 1, infra Supabase et compte invisible — **fait** ; 0.22.0 = étapes 2 à 5, amis, rattachement, parties et stats partagées — **fait** ; 0.23.0 = étape 6, présence — **fait** ; 0.23.1 = relié au vrai projet Supabase — **fait** ; reste : essai à deux téléphones |
| 11 | Recette |

## État (version 0.23.3 : carte de mise à jour de l'accueil)

- **0.23.3** (25/11) : vu par Guillaume, accueil « MISE À JOUR v0.23.0 » et Réglages « v0.23.2 ». Cause : l'accueil est
  dessiné à l'ouverture avec la version de la recherche précédente (gardée par Updater.java), et l'arrivée du résultat
  de la nouvelle recherche ne redessinait que les Réglages (settings.js › onNative). L'accueil se redessine maintenant
  quand sa carte change (tests/passerelle.test.js). E-mail corrigé : orbitalvkl@gmail.com (« orbitavkl » était une
  coquille).

## État (version 0.23.2 : e-mail de contact)

- **0.23.2** (25/11) : e-mail de contact (`strela.contact` = orbitalvkl@gmail.com, donné par Guillaume) : politique de
  confidentialité et À propos le montrent au build. Comptes d'essai du 25/11 effacés par Guillaume ; projet en région
  Europe (confirmé). Bilan du lot pour Guillaume : document Claude « Strela — lot 10 : travaux faits et reste à faire ».

## État (version 0.23.1 : relié au vrai projet Supabase)

- **0.23.1** (25/11) : src/net/cloudconfig.js rempli (projet `zzpzaqhtqbttvvblzomc`, clé publishable). Schéma collé par
  Guillaume en trois blocs (sans commentaires) depuis son téléphone ; `alter table realtime.messages` retiré (#47 :
  refusé par Supabase, RLS déjà active). Secret `SUPABASE_SECRET_KEY` créé par Guillaume (copie du lundi).
- **Vérifié en vrai depuis la session** (deux Chromium par le proxy, comptes d'essai supprimés ensuite) : connexion
  anonyme, compte, code d'ami, demande et acceptation, partie envoyée et reçue chez l'ami, présence « en ligne » puis
  « en partie », suppression des données en ligne. Le WebSocket de Node ne passe pas le proxy : essayer la présence avec
  Chromium (comme tools/enligne-reel.mjs).
- Reste : essai à deux vrais téléphones (rattachement des anciens joueurs locaux, soirée sur un seul téléphone).

## État (version 0.23.0 : lot 10, étape 6 — présence ; lot 10 fini côté code)

- **0.23.0** (24/11) : présence par Supabase Realtime (src/net/presence.js, src/ui/presence.js), pastille sur les
  avatars d'amis, réglage Présence visible. Faux Realtime dans tools/lib/fake-supabase.mjs ; tests/presence-parcours.
- **Attendu de Guillaume** (toujours) : adresse du projet et clé publique (→ src/net/cloudconfig.js, puis publier),
  secret `SUPABASE_SECRET_KEY`. Puis essai à deux téléphones.

## État (version 0.22.0 : lot 10, étapes 2 à 5 — amis, rattachement, parties et stats partagées)

- **Reprise** : docs/lot-10-avancement.md (décisions de chaque étape, prochain geste : étape 6, présence).
- **0.22.0** (24/11) : écran Amis (#/amis : code + QR, demandes, retirer), joueurs en trois sections, ami = joueur
  `u:<uuid>` en lecture seule (`friend`, `seen`, `sets`) ; rattachement d'un joueur local (#/amis/rattacher/<uuid>,
  engine/merge.js, annulable) ; synchronisation des parties et séances (engine/sync.js, ui/gamesync.js : envoi par
  empreintes, réception traduite, suppression propagée) ; parties reçues `owner` en lecture seule, celles sans moi dans
  `store.friendGames` / `friendTrainings`. Aucune migration (champs facultatifs). Nouveaux fichiers : src/ui/friends.js,
  src/ui/screens/friends.js, src/ui/gamesync.js, src/engine/merge.js, src/engine/sync.js ; tests amis-parcours,
  rattachement(-parcours), synchro(-parcours), badges-enligne.
- Étape 5 : stats, badges, records, classement sur `allGames()` / `allCkGames()` / `allTrainings()` (store.js) ; sélecteur
  moi → amis → joueurs du téléphone ; bandeau « Multijoueur » ; 6 badges en ligne (`online: true`, visibles après une
  partie en ligne ; `online.cut` posé par ui/online.js).
- Corrigé en passant (0.21.0) : course de la saisie vocale (un « start » d'Android après la phrase rouvrait l'écoute),
  cause du test APK instable de voix-parcours.

## État (version 0.21.0 : lot 10, étape 1 — compte invisible)

- **Reprise** : lire docs/lot-10-avancement.md (étapes, décisions, prochain geste) et docs/cloud.md (architecture).
- **0.21.0** (24/11) : supabase/schema.sql complet (tables, RLS, fonctions des 6 étapes, présence), client maison,
  compte invisible (`settings.cloudAccount` : UUID + secret, dans la sauvegarde ; réglages `cloudAuth`, `cloudSync`
  non exportés), Réglages › Compte et amis, #/compte (code de récupération, retrouver, supprimer), action
  `supabase.yml` (réveil, copie chiffrée), confidentialité. Aucune migration de la base du téléphone.
- **Postgres** dans les sessions (`/usr/lib/postgresql/16`) et sur les machines de la CI : les tests jouent le vrai
  schéma (tools/lib/pg.mjs, sous root via `runuser -u postgres`).
- **Attendu de Guillaume** : adresse du projet et clé publique (→ src/net/cloudconfig.js) ; secret GitHub
  `SUPABASE_SECRET_KEY` (+ `STRELA_BACKUP_PASSPHRASE` facultatif) pour la copie. Tant que cloudconfig.js est vide,
  la synchronisation est coupée (« pas encore relié »).

## État (version 0.20.1 : la connexion en ligne)

- **0.20.1** (24/11) : cause du « pas de réponse de l'hôte » trouvée grâce au journal de Guillaume et reproduite sur le
  vrai serveur : 0.peerjs.com coupe la liaison de l'expéditeur si le message n'a pas la forme de sa bibliothèque
  (règles et détail : docs/enligne.md « 0.20.1 »). Aucune migration, rien de natif.
- **Les sessions peuvent joindre les vrais serveurs** (WebSocket par le proxy, port 443 seulement) :
  `node tools/enligne-reel.mjs [peerjs|tous]` essaie salon + invité + canal entre deux Chromium. EMQX (8084) et HiveMQ
  (8884) ne sortent pas d'ici : le repli MQTT reste non vérifié en vrai.
- À faire confirmer par Guillaume : la connexion à distance ; sinon le journal **des deux** téléphones.

## État (version 0.20.0 : lot 9.5, retours du 24/11)

- **0.20.0** (24/11) : tout le cahier docs/lot-9-5.md (détail : docs/interface.md « Version 0.20.0 », docs/enligne.md
  « Lot 9.5 », docs/lot-9-5-avancement.md). Aucune migration (réglages `journal`, `journalInBackup`, `statsMode` ;
  champ texte `journal` facultatif de la sauvegarde, ignoré à l'import). Coquille : place du clavier (encarts ime),
  ACCESS_NETWORK_STATE (github), Bridge.saveFile accepte `strela-journal-…txt`.
- **A3** : cause = la grille de la carte de séance regroupait les fléchettes 3 par 3 ; un bust à la 1re fléchette
  (T20 depuis 40) ferme la volée → 13 volées, pas 12. Score, moyenne, meilleure volée étaient justes (moteur). Le
  « 84 » de meilleure volée vu par Guillaume ne se reproduit pas avec les fléchettes de la grille (86 = V1) : à lui
  faire confirmer (capture).
- **A1** non reproduit d'ici (pas de WebSocket sortant dans les sessions) : étapes à l'écran, repli MQTT, journal pour
  savoir où ça casse chez lui. Si l'étape 3 échoue (négociation) même sur le même Wi-Fi : regarder les candidats au
  journal (types host / srflx).
- Choix faits sans Guillaume (à lui dire) : courtiers MQTT publics EMQX et HiveMQ en repli (sans compte) ; journal
  1 Mo au plus (le cahier disait « ex. 2 Mo ») ; journal joint à la sauvegarde par défaut pendant le lancement ;
  sélecteur des stats en deux moitiés (proposition décrite dans le cahier, pas de maquette) ; touche OK du clavier =
  REJOINDRE.
- Test instable de tests/voix-parcours.test.js « APK (passerelle simulée)… » : cause trouvée et corrigée en 0.21.0
  (voiceinput.js : `vs.gen` / `vs.doneGen`).

## État (version 0.19.1 : saisie verticale)

- **0.19.1** (23/11) : le pavé de l'entraînement suit enfin le réglage (docs/interface.md « Version 0.19.1 »). Cause : depuis
  la 0.15.0 la saisie passait toujours par « nombre puis zone », le réglage ne changeait que les choix proposés.
  Moteur pur src/engine/padinput.js (tests/saisie-pave.test.js). Aucune migration (valeur toujours dans `padRing`).
- Choix faits sans Guillaume (à lui dire) : secteur entier par défaut ; zone visée armée d'office (comme en 0.13) ;
  bascule ENTIER / TOUCHÉ en haut du pavé ; un trait sous S ajouté (n'existait pas : seuls D et T en avaient) et traits
  aussi en partie et au Cricket ; la partie reste en saisie rapide (couronne inutile pour ses chiffres) ; simple sans
  couronne placé au même point qu'avant (pas de changement des stats enregistrées).
- À vérifier sur le Pixel : vitesse de saisie, bascule lisible en haut du pavé, traits sur écran bas.

## État (version 0.19.0 : lot 9.2, partie en ligne)

- **Reprise** : lot 9 fini (9.1 et 9.4 reportés) ; docs/lot-9-avancement.md, docs/enligne.md.
- **0.19.0** (23/11) : partie en ligne (docs/enligne.md, docs/interface.md « Version 0.19.0 »). Aucune migration :
  champs facultatifs `online` (partie) et `remote` (joueur), réglage `modes.online`. Coquille : filtre d'intention
  `strela://rejoindre/CODE`. Nouvelle page publiée : rejoindre.html.
- Choix faits sans Guillaume (à lui dire) : signalisation par le serveur public de PeerJS (sans compte) ; pas de TURN
  (aucun gratuit sans compte) ; mode en ligne absent de la variante play ; « passer son tour » = ses volées passées
  jusqu'à son retour ; pas de correction de fléchette en ligne ; mode En ligne OUI par défaut.
- Non vérifié d'ici (les sessions ne laissent pas passer les WebSocket) : le vrai serveur PeerJS, deux vrais
  téléphones, le réseau mobile. Vérifié : deux navigateurs séparés reliés par WebRTC (tests/enligne-parcours.test.js).

## État (version 0.18.0 : lot 9.3, saisie à la voix)

- **0.18.0 publiée** (PR #39).
- **0.18.0** (23/11) : saisie à la voix (docs/interface.md « Version 0.18.0 », docs/android.md « Saisie à la voix »).
  Aucune migration (réglages `voiceInput`, `voiceAsked`). Coquille : Listen.java, RECORD_AUDIO (les deux variantes),
  `<queries>` RecognitionService ; passerelle `listenInfo` / `listenStart` / `listenStop` / `listenCancel`.
- Choix faits sans Guillaume (à lui dire) : un appui (pas un appui maintenu) ; touche VOIX dans la rangée S / D / T en
  X01 ; fléchettes en trop ignorées ; réglage OUI par défaut ; micro aussi dans la variante play.
- À vérifier sur le Pixel : reconnaissance en français dans le bruit, hors ligne (langue installée ?), mots mal
  reconnus à ajouter dans src/engine/voice.js (`WORDS`).

## État (version 0.17.1 : choix de la zone au pavé)

- **0.17.1** (23/11) : choix de la zone en « Rangées » (défaut) ou « Secteur », réglage `zonePad` (docs/interface.md
  « Version 0.17.1 »). Aucune migration. Choisi par Guillaume sur maquettes (B et C).

## État (version 0.17.0 : lot 8 du 23/11, fin)

- **0.17.0** (23/11) : sections 6 à 9 du cahier (docs/interface.md « Version 0.17.0 »). Aucune migration. Nouveaux
  fichiers : src/ui/screens/welcome.js (bienvenue, tutoriel, installer), src/ui/installguide.js (guide partagé avec
  installer.html), src/ui/trainreport.js (feuille KPI), src/engine/aiexport.js (export pour une IA),
  tests/lot8-appli*.test.js. Coquille Android : Updater (recherche à chaque ouverture, version importante), Bridge
  (noms de fichiers des deux exports).
- Choix faits sans Guillaume (à lui dire) : sans réglage, une installation qui a déjà des parties garde le mode soirée ;
  réglage « Simple intérieur / extérieur » du pavé désactivé par défaut (demande du 23/11 : « option activable ») ;
  essais du son, de la voix et des vibrations rangés dans « Développement » ; PLUS TARD masque 3 jours ; « [important] »
  dans les notes de la release marque une mise à jour importante.

## État (version 0.16.0 : lot 8 du 23/11, deuxième partie)

- **0.16.0** (23/11) : section 5 du cahier (docs/entrainement.md « jeux de cible, défis, badges »). Aucune migration.
  Nouveaux fichiers : src/engine/fun.js (10 jeux de cible), src/engine/trainbadges.js (badges, petits défis),
  src/ui/trainhonours.js (vitrine, pastilles, fenêtre), tests/lot8-jeux.test.js.
- À faire valider par Guillaume : la liste des 10 jeux (règles, scores), les seuils des badges, les libellés.

## État (version 0.15.0 : lot 8 du 23/11, première partie)

- **Reprise** : lire docs/lot-8-avancement.md (découpage, décisions, prochain geste) et le cahier des charges du 23/11.
- **0.15.0** (23/11) : sections 1 à 4 du cahier (détail : docs/entrainement.md « Lot 8 du 23/11 »). **Aucune migration** :
  champ facultatif `rules` des séances, réglage `heatScale`. Nouveaux fichiers : src/engine/trends.js (tendances,
  période, axe du temps), src/ui/heat.js, src/ui/modeband.js, tests/lot8-stats.test.js.
- Choix faits sans Guillaume (à lui dire) : précision = écart moyen à la cible visée en cm (« dans la cible » à côté) ;
  pavé : nombre puis un seul choix de zone (multiplicateur et couronne ensemble, deux appuis au lieu de trois) ;
  20-19-18 à 21 fléchettes ; marques rouges partout (aussi en partie) ; échelle de chaleur par défaut = celle d'avant ;
  historique : gagnant d'une soirée = le plus de victoires.

## État (version 0.14.0 : X01 et Cricket en solo)

- **0.14.0** (23/11) : mode JEUX de l'entraînement (docs/entrainement.md, « Jeux en solo »). **Aucune migration** :
  `mode: 'jeu'` et champ facultatif `game` des séances ; testés (tests/entrainement-0-14*.test.js), sauvegarde comprise.
- Choix faits sans Guillaume (à lui dire) : Cricket solo sans points (on ferme le 20 au 15 et le bull) ; « doubles » des
  stats = part des fléchettes dans un double (50 compris), la finition au double est un chiffre à part (X01) ; précision
  et groupement ne comptent plus que les exercices ; objectifs X01 30 / 45 / 60, MPR 1 / 1,5 / 2,2 ; les jeux ne
  comptent pas pour le niveau.
- À vérifier sur le Pixel : un 501 complet (finition proposée, bust), un Cricket, la fin (carte, manches), les stats.

## État (version 0.13.0 : entraînement, suite)

- **0.13.0** (22/11) : demandes de Guillaume après la 0.12.0, détail dans docs/entrainement.md (sections marquées
  0.13.0). **Aucune migration** (base toujours v3) : champs facultatifs `setChanges`, `note`, `excluded` des séances,
  `colors` des jeux ; testés (tests/entrainement-0-13*.test.js), sauvegarde comprise.
- Choix faits sans Guillaume (à lui dire) : objectifs et seuils d'après des ordres de grandeur d'amateur (tableau de
  docs/entrainement.md) ; passage débutant → intermédiaire = groupement 50 % **et** score libre 30 de moyenne, 3
  séances de suite chacun (la 0.12 ne demandait que le groupement) ; intermédiaire → confirmé = triple 20 12 %,
  doubles 20 %, score libre 45 ; le pavé arme d'office la zone visée (T, D, EXT.) ; mettre de côté plutôt qu'archiver ;
  13 couleurs de pièces (dont bleu : couleur d'objet, pas de lien).
- Pour la suite : ajouter un exercice = `EXERCISES` (+ `level`), `LEVEL_EXERCISES`, `GOALS` ; une couleur =
  `DART_COLOR_NAMES` + `DART_COLORS` + jeton `--dart-<clé>` (test de concordance).

## État (version 0.12.0 : entraînement solo, lot 8)

- **0.12.0** (22/11) : lot 8 en entier (docs/entrainement.md). Base en **version 3** : magasins `trainings` et
  `dartsets` (migration douce, testée en vrai v2 → v3) ; sauvegarde : champs facultatifs `trainings`, `dartSets`
  (une sauvegarde plus ancienne garde l'entraînement du téléphone). Réglage `training` (derniers choix).
- Choix faits sans Guillaume (à lui dire) : simple intérieur par défaut au pavé ; pas de VALIDER à l'entraînement ;
  haut/bas et gauche/droite en 3 alternances ; Bull « à moins de deux secteurs » = 25, 50 ou simple intérieur ; passage
  de niveau = groupement ≥ 50 % sur 3 séances de suite ; la séance en cours est indépendante de la partie en cours.
- À vérifier sur le Pixel : saisie S INT. / S EXT. au pavé, cible au doigt en paysage, analyse et messages du coach,
  stats (filtres, carte, courbes), armurerie (compléter ses deux jeux), fiches conseils.
- Pour la suite : un nouvel écran va dans `SCENES` (sommaire, section « Lot 8 ») ; ajouter un exercice = une entrée
  d'`EXERCISES` (+ `COACH_ORDER`) ; une fiche = `SHEETS` + `ILL` (advice.js).

## État (version 0.11.2 : verres et pintes, sans tournées)

- **0.11.2** (20/11) : plus aucune tournée (fin de partie, fiche, rapport, résumé), plus aucun gage de défi noté en
  verres, verres de 25 cl et pintes comptés à part partout, verres hors partie comptés, bouton RETIRER LES TOURNÉES
  NOTÉES au tableau de bord (annulable, `g.drinksTournee`). Détail : docs/interface.md « Version 0.11.2 ». Aucune migration.
- À vérifier sur le Pixel : tableau de bord de la soirée du 20/11 → section Verres → RETIRER LES TOURNÉES NOTÉES.

## État (version 0.11.1 : chiffres, défis et badges de la soirée)

- **0.11.1** (20/11) : tableau de bord de soirée en sections repliables, sans rien qui dépasse (cartes des joueurs,
  badges et défis en listes), chiffres enrichis ; rapport en **4 feuilles** (D : chiffres, défis, badges) ; stats du
  joueur : défis et badges. Détail : docs/interface.md « Version 0.11.1 ». Aucune migration.
- Compris de la demande : « feuilles de KPI » = le rapport à imprimer (et les chiffres du tableau de bord et des stats) ;
  « contenu des badges qui dépasse » = le tableau des badges de la soirée (défilait de côté) — à confirmer sur le Pixel.

## État (version 0.11.0 : retours de la soirée du 20/11)

- **0.11.0** (20/11) : tous les points du document « lot 7.8, retours de soirée du 20/11 » (détail : docs/interface.md
  « Version 0.11.0 »). Aucune migration (champs facultatifs `defiSet`, `defiDecl` des parties).
- Choix faits sans Guillaume (à lui dire, à changer s'il veut) : VALIDER ferme **tous** les bandeaux d'une volée (pas
  seulement les moqueries) ; bandeau du défi sous le bandeau du joueur (écran bas : serré, le reste rapetisse) ; défi
  « main gauche » non déclaré = raté ; « le voisin » réussi = les autres boivent ; Angelina reconnue à son pseudo (comme
  Tsia) ; badges à rangs comptés sur les parties X01 seulement ; pas de couleur de métal pour bronze / argent / or
  (carrés pleins, DA).
- Les parties d'avant gardent leurs défis (jeu 1) ; les nouvelles tirent dans les 14 (jeu 2) : ne jamais changer
  l'ordre de `DEFI_SETS` — ajouter un défi = un jeu 3.
- Tirage au sort : déjà juste avant (Fisher-Yates) ; rendu strictement sans biais et testé (tests/tirage.test.js).
- À vérifier sur le Pixel : bandeau du défi lisible de loin ; pastilles de rang ; moto et couronne ; fenêtre d'un badge
  et VOIR LA PARTIE ; badges à rangs gagnés rétroactivement (le tableau d'honneur se remplit d'anciens rangs datés).
- Questions toujours ouvertes : TOURNÉE SERVIE à chaque fin de manche ? Cricket : verres, défis, badges ?

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
- E-mail de contact donné le 25/11 (package.json `strela.contact` : orbitalvkl@gmail.com) ; nom Play limité à 30 caractères (proposé :
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
