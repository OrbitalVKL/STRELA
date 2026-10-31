# Strela — règles du projet

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
| 7 | Recette |

## État (fin du lot 6)

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
