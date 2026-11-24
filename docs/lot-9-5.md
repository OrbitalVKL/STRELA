# Strela — Lot 9.5 : retours du 24/11/2026 (correctifs + stats d'entraînement)

## Prompt pour Claude Code

> Session sur OrbitalVKL/STRELA. Lis `CLAUDE.md` et `docs/`, puis ce cahier (à copier dans `docs/lot-9-5.md`). Fais A puis B puis C, en une ou deux demandes de fusion, publiées dès que la CI est verte ; si le lot 9 est en cours, mets-le en pause proprement et reprends-le après. Pour A3, commence par écrire un test qui reproduit la partie décrite (reste 40, bust à V11, victoire à V12) et identifie la cause exacte avant de corriger ; dis dans ton message ce qui l'expliquait. Tiens `CLAUDE.md` (« État ») et `docs/` à jour. Surveille ta limite d'utilisation : si tu en approches, pause propre (branche poussée, état dans `docs/lot-9-5-avancement.md`) puis reprise dès que possible. À la fin, message court à Guillaume : **Fait** / **À toi** (quoi tester, à un ou deux téléphones, et ce qui n'a pas pu être vérifié).

---

Dépôt : OrbitalVKL/STRELA. Règles habituelles : DA Strela (jetons de `assets/theme.css`, pas de bleu de lien), données conservées à la mise à jour, affichages qui ne se remettent pas à zéro en navigation, retour vers l'écran d'origine, (i) pour les explications. Claude est autonome : regrouper, publier dès que c'est vert.

**Ordre** : A (bugs) → B (journal de débogage, qui sert aussi à A1) → C (stats et résumé). À faire **avant** de poursuivre le lot 9 s'il est en cours.

---

## A. Bugs

### A1. Le mode en ligne n'arrive pas à se connecter
- Reproduire à deux téléphones (même Wi-Fi, puis 4G/Wi-Fi) et en Playwright.
- Pistes à vérifier : permission `INTERNET` sur la variante installée (play vs github), joignabilité du serveur de signalisation (PeerJS public : souvent saturé ou en panne → prévoir un second serveur ou un repli), STUN, CSP de la WebView qui bloquerait `wss://`, code de salon mal transmis (casse, espaces).
- Afficher à l'écran **l'étape qui échoue** (signalisation / négociation / canal de données) avec un message clair au lieu d'une attente infinie, et un délai d'abandon avec « Réessayer ».
- Tout tracer dans le journal (B).

### A2. Le clavier masque le champ du code de salon
- La saisie du code doit rester visible au-dessus du clavier : `windowSoftInputMode=adjustResize` côté Android et/ou `visualViewport` + `scrollIntoView` côté web. Vérifier tous les champs texte de l'appli (pseudo, nom de jeu de fléchettes, etc.).
- Champ du code : majuscules auto, pas d'autocorrection, collage accepté.

### A3. Historique fléchette par fléchette incohérent avec le score (X01 solo 501 simple, jeu Unicorn, séance du 23/11 à 21:57)
Grille affichée :

| Volée | F1 | F2 | F3 | Total affiché |
|---|---|---|---|---|
| V1 | 20 int. | T18 | 12 int. | 86 |
| V2 | 12 int. | 20 ext. | Hors | 32 |
| V3 | 8 int. | 1 ext. | D20 | 49 |
| V4 | 20 ext. | 20 ext. | D20 | 80 |
| V5 | 20 int. | 12 int. | Hors | 32 |
| V6 | 5 int. | 9 int. | D1 | 16 |
| V7 | 18 int. | 5 int. | T5 | 38 |
| V8 | T20 | 1 int. | 1 int. | 62 |
| V9 | 1 ext. | 12 int. | 12 ext. | 25 |
| V10 | 1 int. | 20 ext. | 20 int. | 41 |
| V11 | 18 int. | 20 ext. | T15 | bust |
| V12 | T20 | 20 int. | 20 ext. | 100 (?) |

Constat :
- Cumul à la fin de V10 = **461 → reste 40**.
- V11 : 18 → reste 22, 20 → reste 2, T15 → **bust**, retour à 40 (Guillaume confirme le bust).
- V12 affichée T20 + 20 + 20 = 100 : **impossible** (la T20 seule fait déjà bust depuis 40).
- Meilleure volée annoncée **84**, alors que la grille montre 86 (V1) et 100 (V12).
- Moyenne 41,8 = 501 / 12 → le moteur a bien enregistré une **victoire en 12 volées** : le score semble juste, c'est la **liste des fléchettes** qui ne l'est pas.

Hypothèses à vérifier dans le code : fléchettes annulées/corrigées (« annuler ») restées dans l'historique ; fléchettes jouées après un bust ou après la victoire conservées ; décalage entre la liste des fléchettes et la liste des volées ; libellé tiré de la position sur la cible (int./ext.) qui ne correspond pas au secteur enregistré.

À faire :
- Corriger la cause ; une seule source de vérité (les fléchettes validées) dont on **recalcule** totaux, bust, meilleure/pire volée et moyenne.
- Afficher le bust dans la grille (volée barrée ou marquée « BUST », total 0) et ne pas montrer les fléchettes non lancées après la victoire.
- Tests du moteur : bust en milieu de volée, victoire à la 1re/2e fléchette, annulation puis ressaisie, cohérence meilleure volée = max des totaux affichés.
- Vérifier aussi les parties déjà enregistrées : si elles sont réparables par recalcul, migration ; sinon les marquer « historique incomplet » sans les supprimer.

---

## B. Journal de débogage (pour la phase de lancement)
- Journal local horodaté : erreurs JS, étapes du mode en ligne, saisie (fléchette ajoutée / annulée / volée validée / bust), mises à jour, migrations de données.
- Taille bornée (rotation, ex. 7 jours ou 2 Mo), sans données personnelles hors pseudos.
- Dans **Réglages > Développement** : activer/désactiver (actif par défaut pour l'instant), voir, **exporter/partager** le fichier, vider.
- Joindre automatiquement le journal à l'export de données si coché.

---

## C. Stats et résumé de séance

### C1. Sélecteur Soirée / Entraînement tout en haut
- Le choix entre « Stats soirée » et « Stats entraînement » doit être **en haut de l'écran**, clair et toujours visible (onglets ou bandeau collant à deux moitiés : pinte + « Soirée » / cible + « Entraînement », teinte de fond par mode), **pas au milieu de la page**. Le choix est conservé en navigation.

### C2. Résumé de séance X01
- Afficher le **nombre de volées** (et de fléchettes) en en-tête du résumé.
- Ajouter **sous la cible** du résumé la **grille des volées** (V1…Vn, 3 fléchettes, total de la volée, reste après la volée, bust marqué), même style que la grille de la liste des séances.

### C3. Exercices par secteur (ex. serpent) : impacts par secteur visé
- Dans le tableau des valeurs du résumé, **toucher une ligne** (secteur visé) → la cible n'affiche plus que les impacts des fléchettes lancées sur ce secteur, secteur visé surligné ; toucher à nouveau (ou « Tous ») revient à l'ensemble.
- Même principe pour tout exercice à cibles successives (haut-bas, tour de l'horloge…).
