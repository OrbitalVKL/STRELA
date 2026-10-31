# Appli Android (lot 5)

Strela pour Android = la page web embarquée dans une coquille Java (WebView), sur le modèle de Grafit
(OrbitalVKL/GRAFIT, lecture seule). minSdk 30, compileSdk et targetSdk 36 (Android 16, lot 6), nom « Strela ».

## Deux variantes (lot 6)

| | github | play |
|---|---|---|
| Identifiant | `fr.orbitalvkl.strela` (inchangé : mise à jour en place depuis 0.5.0, données gardées) | `fr.orbitalvkl.strela.play` |
| Format, diffusion | APK signé, release GitHub `apk-vX.Y.Z` (`strela.apk`) | Android App Bundle signé (`strela-play.aab`), artefact de la CI, jamais publié ; à envoyer sur Google Play |
| Mise à jour | intégrée (`src/github` : `Updater`, `UpdateBridge`, `Flavor`) | aucune (Play Store) : ni code ni bouton (`src/play/Flavor.java`) |
| Permissions | VIBRATE, INTERNET, REQUEST_INSTALL_PACKAGES (`src/github/AndroidManifest.xml`) | VIBRATE seulement (vérifié dans le manifeste fusionné : `tests/android.test.js`) |

Les deux peuvent être installées ensemble (autorité du FileProvider : `${applicationId}.files`) ; leurs données sont
séparées. La page connaît la variante par `info().variant` (`BuildConfig.FLAVOR`) et par la présence des fonctions de
mise à jour dans la passerelle (`hasUpdater()` de native.js).

## Coquille (`android/`)

| Fichier | Rôle |
|---|---|
| `app/build.gradle` | version lue dans `package.json` (seule source ; `-PstrelaVersion` la force), versionCode = X·10000 + Y·100 + Z ; signature de la release par variables d'environnement (apk.yml) |
| `AndroidManifest.xml` | permissions : INTERNET (mise à jour seulement), VIBRATE, REQUEST_INSTALL_PACKAGES ; FileProvider `fr.orbitalvkl.strela.files` ; `configChanges` (rotation sans recharger), `screenOrientation="fullUser"` (suit le téléphone et son verrou de rotation) |
| `MainActivity.java` | WebView, WebViewAssetLoader (`https://appassets.androidplatform.net/assets/www/index.html`), liens externes dans le navigateur, encarts (barres, découpe, zone des gestes), sélecteur de fichiers (photo, sauvegarde), plein écran, écran allumé, retour |
| `Bridge.java` | passerelle `strelaNative` (ci-dessous) |
| `Speech.java` | voix française d'Android (TextToSpeech) |
| `src/github/…/Updater.java`, `UpdateBridge.java`, `Flavor.java` | variante github : mise à jour depuis l'appli (dernière release GitHub de OrbitalVKL/STRELA, PackageInstaller), recherche automatique (lot 6) |
| `src/play/…/Flavor.java` | variante play : rien en plus |
| `res/mipmap-anydpi/ic_launcher.xml`, `res/drawable/ic_launcher_fg.xml`, `ic_launcher_mono.xml` | icône adaptative « Soyouz » (lot 6) : calques vectoriels tirés de `assets/icon.svg` (fond `@color/icon_bg` `#0A0C0E`), monochrome pour les icônes à thème ; produits par `tools/make-icons.mjs`, vérifiés par `tests/icone.test.js` |

Page embarquée : `tools/apk-page.sh` copie le site construit (`_site/`, avec version, tests, date et commit) dans
`android/app/src/main/assets/www/` (ignoré par git), sans le service worker (la page ne l'enregistre pas dans l'APK).
Données : la base IndexedDB de la WebView, dans le dossier privé de l'appli ; une mise à jour la garde, une
désinstallation l'efface (dit dans les Réglages, avec EXPORTER).

## Passerelle `strelaNative` (`Bridge.java` ↔ `src/ui/native.js`)

La page cherche `window.strelaNative` ; sans elle (navigateur), elle garde les API web.

| Fonction | Rôle | Côté page |
|---|---|---|
| `info()` | `{ version, variant, package, sdk, model }` | diagnostic, À propos |
| `setBackHandled(oui)`, `backHandled()` | retour prédictif (lot 6) : rappel de retour enregistré ou non | après chaque rendu (`nativeBackHandled`) |
| `vibrate(motif)` | vibreur natif (VibratorManager, usage « média ») ; motif = ms ou `[vibre, pause, …]` (mêmes `BUZZ` que le web) ; `sent` / `absent` / `error` | `buzz()` de nav.js, TESTER LA VIBRATION |
| `speak(texte, appuyé)`, `stopSpeaking()`, `voice()` | annonces (coupent la précédente), état de la voix `{ state, name }` | `say()` / `voiceInfo()` de feedback.js |
| `saveBackup(nom, texte, partager)` | Téléchargements/Strela/`strela-AAAAMMJJ-HHMM.json` (MediaStore, sans permission), puis menu de partage (copie en cache, FileProvider) ; `{ ok, path }` | EXPORTER, écran de secours |
| `storage()` | `{ dir, bytes }` : où sont les données, taille | diagnostic |
| `keepScreenOn(oui)`, `immersive(oui)` | FLAG_KEEP_SCREEN_ON, barres masquées (rappel par geste) | `keepAwake()` : partie et fin de manche |
| `setDark(oui)` | fond de la fenêtre, icônes des barres système | `applyTheme()` |
| `gestureInset()` | zone des gestes en bas, px CSS (aussi posée dans `--gesture-native`) | marge basse du pavé |
| `checkUpdate()`, `autoCheckUpdate()`, `installUpdate()`, `updateState()` | variante github seulement : mise à jour ; recherche automatique (GitHub au plus une fois par 24 h, sinon état gardé) ; l'état arrive aussi par l'événement `strela-native` `{ update }` | Réglages › Appli Android, repère de l'accueil |

- **Sons** : Web Audio dans la WebView, sans geste préalable (`setMediaPlaybackRequiresUserGesture(false)`).
- **Fichiers** : IMPORTER ouvre le sélecteur de documents d'Android (`onShowFileChooser`, ACTION_OPEN_DOCUMENT) ;
  la page lit le fichier comme dans le navigateur. **Photo d'avatar** : PHOTO ouvre directement l'appareil photo
  d'Android (ACTION_IMAGE_CAPTURE, fichier du cache par FileProvider), GALERIE ouvre le sélecteur de photos avec
  l'appareil photo proposé à côté. L'appli ne déclare pas la permission caméra : c'est l'appareil photo d'Android qui
  prend la vue (avec sa propre permission) ; rien n'est donc demandé à Strela, ni au lancement ni ensuite.
- **Retour prédictif (lot 6, Android 16)** : le rappel `OnBackInvokedCallback` n'est enregistré que lorsque la page a
  quelque chose à faire du retour (`setBackHandled`) ; à l'accueil, il est retiré : Android joue son animation de
  retour à l'écran d'accueil du téléphone et met Strela en arrière-plan (activité gardée : vérifié sur émulateur
  Android 16, appli lancée comme par le lanceur). Lancée autrement (`am start -n` sans catégorie LAUNCHER), Android
  ferme l'activité à la place : la relance rouvre l'accueil, rien n'est perdu. Sur émulateur, une activité recréée dans
  le même processus garde la même adresse de débogage : `tools/android-check.mjs` relance donc un nouveau processus. Avec targetSdk 36, Android 16 n'appelle plus
  `onBackPressed` ni ne transmet la touche retour : tout passe par ce rappel (Android 13 et plus) ; `onBackPressed` et
  `dispatchKeyEvent` restent pour Android 11 et 12 (lint `GestureBackNavigation` mis en sourdine, expliqué).
- **Bord à bord** : imposé depuis Android 15, sans échappatoire en Android 16 : le cadre laisse la place des barres et
  de la découpe (encarts), la page ne passe ni dessous ni sous la barre de navigation (vérifié sur émulateur).
- **Retour** : la touche retour est prise par l'activité avant la WebView (`dispatchKeyEvent`, et
  `shouldOverrideKeyEvent` : sans cela la WebView la garde pour elle et rien ne se passe — vu sur l'émulateur) ; le
  geste retour arrive par `OnBackInvokedDispatcher` (Android 13 et plus, déclaré dans le manifeste) ou
  `onBackPressed()` (Android 11 et 12). Tous mènent à `goBack()`, qui appelle `window.strelaBack()` (`src/ui/back.js`) : ferme d'abord ce qui est ouvert
  (correction, confirmations, menu pause, panneau, sélection, aperçu d'import, recadrage), en partie ouvre le menu
  pause, sinon remonte d'un écran (lien Retour de la barre du haut, ou l'accueil) ; à l'accueil (ou sur l'écran de
  secours), la page répond `false` et Strela passe en arrière-plan. Jamais de sortie directe en pleine partie.
- **Zone des gestes** : `getInsets(mandatorySystemGestures)` au-delà de la marge déjà laissée aux barres, en px CSS,
  posée dans `--gesture-native` ; `--gesture-bottom = max(env(safe-area-inset-bottom), 16px, --gesture-native)`.
- **Thème** : thème Android DayNight (la WebView suit le téléphone en Auto) ; un changement de thème du téléphone
  recrée l'activité (la page se recharge, la partie est enregistrée à chaque fléchette).

- **Moteur de rendu arrêté** : quand Android arrête le moteur de rendu de la WebView (appli en arrière-plan derrière
  l'appareil photo ou le sélecteur de fichiers, mémoire), `onRenderProcessGone` crée une nouvelle WebView et recharge
  la page (sans cela, toute l'appli s'arrêtait : vu sur l'émulateur). La partie est enregistrée à chaque fléchette.
  Une sauvegarde choisie pendant ce temps n'est pas perdue : la coquille la relit et la remet à la page (événement
  `importFile`, aperçu dans les Réglages). Une photo, elle, est à reprendre.
- **Police** : la WebView applique la taille de police d'Android (comme Chrome) ; la page est vérifiée jusqu'à 130 %.

## Premier lancement et données

Les données de la version web (autre origine) ne passent pas d'elles-mêmes. Accueil de l'APK sans joueur ni partie :
« BIENVENUE DANS L'APPLI », IMPORTER UNE SAUVEGARDE DE LA VERSION WEB (import du lot 3 : aperçu dans les Réglages,
REMPLACER TOUT ou FUSIONNER) ou COMMENCER À ZÉRO. Stockage persistant demandé comme en web ; le diagnostic dit où
sont les données et leur taille.

## Compilation et publication

- Émulateur : après un lancement par adb, le focus des touches reste parfois au lanceur d'Android ; le script touche
  la page (sans effet) avant d'envoyer la touche retour. La bulle « plein écran » d'Android, montrée la première fois,
  est fermée comme le ferait l'utilisateur.
- `ci.yml`, à chaque demande de fusion (lot 6) : job `apk` (page sans relancer les tests ; `assembleGithubDebug`,
  `assemblePlayDebug`, `bundlePlayDebug`, lint des deux variantes ; manifeste fusionné de la variante play vérifié ;
  version 0.5.0 recompilée depuis le tag `apk-v0.5.0` avec la même clé de test ; artefact `strela-test-apk`, non
  publié) puis job `emulateur` sur **Android 14 et Android 16** (`tools/android-check.mjs` : mise à jour en place
  0.5.0 → version courante, joueurs et partie gardés ; bord à bord ; retour prédictif ; plein écran en partie ;
  variante play installée à côté, sans mise à jour intégrée ; et, comme au lot 5 : premier
  lancement, passerelle, partie, zone des gestes, rotation sans rechargement, retour = menu pause, export dans
  Téléchargements/Strela, import par le sélecteur, fermeture brutale et reprise ; rapport dans le résumé du job,
  captures en artefact `captures-emulateur`). L'APK de test a le débogage de la WebView ouvert ; la release, non.
- `apk.yml`, à chaque push sur `main` touchant l'appli : tests (bloquants), page embarquée, clé de signature :
  générée et chiffrée au premier passage (`android/signing.p12.enc`, AES-256-CBC, PBKDF2 600 000 tours, commit
  « [skip ci] »), puis déchiffrée avec le secret `STRELA_SIGNING_PASSPHRASE` ; `assembleGithubRelease` et
  `bundlePlayRelease` (lot 6) ; certificat de `strela.apk` comparé à celui du .aab et à celui de la release précédente
  (une autre signature arrête tout : la mise à jour en place serait refusée) ; release `apk-vX.Y.Z` avec `strela.apk` ;
  `strela-play.aab` en artefact `strela-play-aab-X.Y.Z` (90 jours), jamais publié. La clé actuelle devient la **clé
  d'importation** de Play App Signing. **Sans le secret** : APK et .aab de test non publiés (artefact) et avertissement.
- La phrase de passe ne doit jamais changer : une autre clé = une autre signature, et Android refuserait la mise à
  jour (il faudrait désinstaller, donc exporter avant).

## Mise à jour depuis l'appli (variante github)

**Recherche automatique** (lot 6) : au lancement, au premier écran hors partie, si Réglages › Appli Android ›
Recherche automatique est sur OUI (par défaut) ; GitHub n'est interrogé qu'une fois par 24 h au plus (heure de la
dernière recherche et résultat gardés dans les préférences de l'appli) ; sans réseau, rien n'est dit. Une version plus
récente : repère « MISE À JOUR vX.Y.Z DISPONIBLE » à l'accueil et en haut des Réglages. Rien n'est téléchargé sans
appui sur INSTALLER.

Réglages › Appli Android › RECHERCHER UNE MISE À JOUR : API GitHub (dernière release de OrbitalVKL/STRELA
seulement, fichier `strela.apk` téléchargé depuis `github.com/OrbitalVKL/STRELA/releases/download/` seulement),
INSTALLER LA VERSION X.Y.Z, téléchargement (progression), PackageInstaller ; Android demande d'autoriser « Installer
des applis inconnues » pour Strela la première fois, puis confirme. Même signature exigée ; données gardées.
Hors la recherche automatique (qui ne fait que lire la dernière release), rien ne part sur le réseau sans appui.

## Développement

- Compiler sur un poste : Android SDK (platform 36, build-tools 35 et 36), Java 17+, Gradle 8.13+ (plugin Android
  8.11.1) : `STRELA_SANS_TESTS=1 node tools/build-site.mjs && sh tools/apk-page.sh && (cd android && gradle
  assembleGithubDebug assemblePlayDebug bundlePlayDebug)`. Maven Central limite parfois les téléchargements (429) :
  relancer.
- Vérifier sur un émulateur ou un téléphone branché (adb, débogage USB) :
  `node tools/android-check.mjs github.apk [--ancienne=0.5.0.apk] [--play=play.apk]`.
