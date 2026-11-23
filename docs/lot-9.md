# Strela — Lot 9 : saisie à la voix, puis partie en ligne (cadré le 23/11/2026)

Dépôt : OrbitalVKL/STRELA. Règles habituelles : DA Strela (jetons de `assets/theme.css`, pas de bleu de lien), données conservées à la mise à jour, affichages qui ne se remettent pas à zéro en navigation, retour vers l'écran d'origine, textes explicatifs repliés derrière un (i). Claude est autonome : regrouper, publier dès que c'est vert.

**À faire maintenant, dans cet ordre** : 9.3 saisie à la voix → 9.2 partie en ligne (score partagé).
**Reportés** (décision du 23/11/2026) : 9.1 version iPhone et 9.4 audio en ligne, en fin de document, à ne pas faire pour l'instant.
**Contrainte** : aucun compte payant (ni serveur payant, ni carte bancaire).

---

## 9.3 Saisie à la voix — en premier, ≈ 2 à 3 séances

**Principe** : le joueur annonce **chaque fléchette avec sa position précise**, avec option de préciser simple intérieur / extérieur. Fonctionne en partie, en soirée et à l'entraînement.

- **Déclenchement** : bouton micro bien visible sur l'écran de saisie — **appuyer pour parler** (pas d'écoute permanente, à cause du bruit). Une phrase peut contenir 1 à 3 fléchettes.
- **Vocabulaire (français)** :
  - « vingt » ou « simple vingt » = simple 20 ; « double seize », « triple vingt » ;
  - option « simple vingt intérieur » / « extérieur » (couronne de simple, comme la saisie verticale) ;
  - « bull », « centre », « cinquante », « double bull » = 50 ; « vingt-cinq », « demi-bull » = 25 ;
  - « dehors », « raté », « zéro », « à côté » = hors cible ;
  - commandes : « annuler » (dernière fléchette), « valider » (la volée).
  - Tolérer les variantes de reconnaissance (« vin », « 20 » en chiffres, « tripe »…) ; refuser ce qui est ambigu plutôt que deviner.
- **Retour visuel** : les fléchettes reconnues apparaissent comme une saisie au doigt (corrigeables au doigt), avec la phrase entendue en petit ; rien n'est validé sans « valider » ou appui. Annonce vocale de confirmation si les annonces sont actives (sans que l'appli s'écoute elle-même).
- **Technique** : Android → `SpeechRecognizer` natif via la passerelle (`RECORD_AUDIO`, demande de permission expliquée, reconnaissance hors ligne préférée, français). Moteur d'analyse de la phrase en JS pur, testé (`src/engine/`). Prévoir un repli `webkitSpeechRecognition` pour la future version web (bouton absent si indisponible).
- **Stats** : une saisie vocale est traitée comme la saisie verticale (centre de la case, mention d'approximation pour le groupement).
- **Réglage** : activer / désactiver la saisie vocale dans les réglages.
- **Plus tard (9.4)** : la saisie vocale sera désactivée pendant un appel audio en ligne ; prévoir le point d'accroche.

## 9.2 Partie en ligne — score partagé, ensuite, ≈ 5 à 7 séances

**Principe** : un joueur par téléphone. Viser 2 téléphones, conçu pour aller jusqu'à 4. Rester compatible avec une future version web iPhone (pas de dépendance à la passerelle Android pour la connexion).

- **Connexion** : WebRTC (canal de données) de téléphone à téléphone. Signalisation par un service gratuit **sans compte si possible** (ex. serveur public PeerJS), sinon un service gratuit sans carte bancaire ; garder la signalisation derrière une petite interface pour pouvoir en changer. STUN publics ; si un relais TURN gratuit fiable existe, l'ajouter, sinon documenter la limite (certains réseaux 4G / Wi-Fi d'entreprise bloquent).
- **Salon** : l'hôte crée un salon → code court (5–6 caractères) + QR code ; les autres le saisissent ou le scannent. Chacun choisit le joueur de son téléphone (fiche existante : pseudo, avatar, animation de tour). Liste des connectés en direct avec état (connecté / en attente / perdu).
- **Hôte** : choisit le jeu et ses options (X01 et Cricket, mêmes réglages qu'une partie locale), l'ordre (tirage au sort ou manuel), lance la partie. L'hôte fait autorité : il valide chaque volée et diffuse l'état ; les autres appliquent ce qu'il envoie.
- **En jeu** : seul le téléphone du joueur dont c'est le tour peut saisir (cible, saisie verticale ou voix) ; les autres voient les fléchettes arriver **une par une en direct**, le score, le rang, la manche. Annuler une fléchette : seulement par le lanceur, avant validation. Défis tirés par l'hôte et affichés partout ; moqueries, célébrations et animations de tour jouées sur tous les téléphones ; verres et voyelles de Tsia restent locaux.
- **Robustesse** : numéro de séquence sur chaque message, état complet renvoyé à la reconnexion ; téléphone en veille ou réseau perdu → joueur « déconnecté », partie en pause pour tous, reprise automatique à son retour ; option pour l'hôte de passer son tour ou de l'exclure. Hôte perdu → partie suspendue, reprise possible quand il revient (état gardé localement chez tous).
- **Historique et stats** : chaque téléphone enregistre la partie complète dans son historique, marquée « en ligne » ; les adversaires distants sont rangés à part (pas mélangés à la liste de joueurs locale sauf choix explicite) ; stats filtrables local / en ligne. Données conservées à la mise à jour, incluses dans la sauvegarde et l'export.
- **Android** : la variante github a déjà INTERNET ; la variante play n'a pas d'accès réseau → l'ajouter ou désactiver le mode en ligne sur cette variante (au choix du dev, l'indiquer). Mettre à jour `confidentialite.html` (ce qui transite, rien n'est stocké sur un serveur).
- **Tests** : deux navigateurs Playwright dans le même test (création de salon, partie complète, coupure et reprise) ; tests du moteur de synchronisation sans réseau. Le vrai test se fera à deux téléphones par Guillaume.
- **Accueil** : nouvelle entrée « En ligne » à côté de partie / soirée / entraînement ; activable dans les réglages des modes (cf. lot 8).

---

## Reportés — ne pas faire pour l'instant

### 9.1 Version iPhone (appli web installable)
Page GitHub Pages utilisable sur iPhone, ajoutée à l'écran d'accueil (pas d'iPhone, de Mac ni de compte Apple). À prévoir : repli sans `strelaNative` (vibreur absent, `speechSynthesis`, `wakeLock`, partage de fichiers), zones sûres, retour visible dans l'appli, mise à jour par le service worker, `navigator.storage.persist()` et rappel de sauvegarde, guide d'installation iPhone, Web Audio débloqué au premier appui, captures Playwright WebKit aux tailles iPhone.

### 9.4 Audio en ligne
Piste audio WebRTC sur la connexion de la partie ; micro coupé par défaut, boutons micro / haut-parleur ; suppression d'écho ; permission micro de la WebView ; saisie vocale désactivée pendant l'appel.

---

## Prompt pour Claude Code

> Session neuve sur OrbitalVKL/STRELA. Lis `CLAUDE.md` et `docs/`, puis le cahier du lot 9 ci-dessous (à copier dans `docs/lot-9.md`). Réalise **seulement** 9.3 (saisie à la voix) puis 9.2 (partie en ligne), chacun dans sa branche et sa demande de fusion, publiés dès que la CI est verte ; 9.1 et 9.4 sont reportés. Aucun service payant ni compte avec carte bancaire. Tiens `CLAUDE.md` (« État ») et `docs/` à jour à la fin de chaque sous-lot pour qu'une session suivante reprenne sans contexte. Surveille ta limite d'utilisation : si tu en approches, mets le travail en pause proprement (branche poussée, état noté dans `docs/lot-9-avancement.md`) et reprends dès que c'est de nouveau disponible. À la fin de chaque sous-lot, message court à Guillaume : **Fait** / **À toi** (quoi installer, quoi tester, à un ou deux téléphones, et ce qui n'a pas pu être vérifié).
