# Strela — Lot 9.6 : synchro entraînement des amis, stats contextuelles, sons contextuels (26/11/2026)

## Prompt pour Claude Code

> Session sur OrbitalVKL/STRELA. Lis `CLAUDE.md` et `docs/`, puis ce cahier (à copier dans `docs/lot-9-6.md`). Fais A puis B puis C, en une ou deux demandes de fusion, publiées dès que la CI est verte ; si un autre lot est en cours, mets-le en pause proprement et reprends-le après. Pour A, commence par écrire un test qui reproduit le cas (ami lié, armurerie reçue, séances d'entraînement absentes) et identifie la cause exacte avant de corriger ; dis dans ton message ce qui l'expliquait. Tiens `CLAUDE.md` (« État ») et `docs/` à jour. Surveille ta limite d'utilisation : si tu en approches, pause propre (branche poussée, état dans `docs/lot-9-6-avancement.md`) puis reprise dès que possible. À la fin, message court à Guillaume : **Fait** / **À toi** (quoi tester, à un ou deux téléphones, et ce qui n'a pas pu être vérifié).

---

Dépôt : OrbitalVKL/STRELA. Règles habituelles : DA Strela (jetons de `assets/theme.css`, pas de bleu de lien), données conservées à la mise à jour, affichages qui ne se remettent pas à zéro en navigation, retour vers l'écran d'origine, (i) pour les explications, valeurs à côté des points des courbes. Claude est autonome : regrouper, publier dès que c'est vert.

**Ordre** : A (bug de synchro) → B (stats) → C (sons).

---

## A. Bug : les séances d'entraînement d'un ami lié n'arrivent pas

**Constat (Guillaume, 26/11)** : profil d'un ami lié ; Guillaume lui a envoyé les stats de soirée qu'il avait stockées pour lui. Les stats d'entraînement de l'ami étaient illisibles faute de ses jeux de fléchettes dans l'armurerie ; l'armurerie a depuis été synchronisée (les jeux apparaissent), mais **aucune stat d'entraînement** de l'ami ne s'affiche, alors qu'il a fait des séances depuis. Même version de l'appli des deux côtés, appli ouverte des deux côtés après ses entraînements.

À vérifier :
- Envoi : les séances d'entraînement sont-elles bien poussées vers la base en ligne depuis le téléphone de l'ami (y compris celles faites **avant** le lien d'amitié, ou avant la réception de l'armurerie) ? Rattrapage de l'historique à la création du lien.
- Réception : sont-elles reçues mais filtrées à l'affichage (jeu de fléchettes inconnu au moment de la réception, identifiant de jeu différent entre les deux téléphones, filtre de période, filtre « mon profil » seulement) ?
- Dépendance armurerie → séances : une séance dont le jeu est inconnu doit être **gardée** et affichée (jeu « inconnu », rattaché automatiquement quand le jeu arrive), jamais ignorée.
- Partage complet entre amis (règle déjà validée) : stats multijoueur **et** stats d'entraînement.

À faire :
- Corriger la cause, avec resynchronisation complète au prochain lancement pour les liens existants (sans doublons).
- Dans la fiche de l'ami : date de dernière synchro et nombre de séances reçues, bouton « Resynchroniser ».
- Tracer dans le journal de débogage : séances envoyées / reçues / rejetées avec la raison.
- Tests : séance avant le lien, séance avec jeu inconnu puis jeu reçu, séance faite hors ligne puis synchro.

---

## B. Stats contextuelles

**Principe** : chaque mode et chaque exercice a ses propres stats, celles qui ont du sens pour lui. Pas de précision en X01 solo (on ne vise rien à l'avance) ; pas de stats X01 dans un exercice à cible. Chaque stat a un (i) qui l'explique en une phrase. En haut de chaque écran, un **résumé en clair** du type « En progrès sur ta moyenne, en recul sur les busts ». Toutes les tendances suivent le filtre de période existant.

### B1. Libellés compréhensibles
- « 9 premières » → « Moyenne des 9 premières fléchettes » avec (i) : « Ton niveau de scoring en début de partie, avant que la fin de partie compte. » Revoir de même tous les libellés abrégés.

### B2. X01 en solo (301, 501…) : fiche « Évolution »
Comparaison partie après partie, chaque valeur avec flèche verte (mieux) / rouge (moins bien) par rapport à la moyenne des parties précédentes de la période, et courbe dans le temps :
- Moyenne par volée.
- Nombre de volées (et de fléchettes) pour finir.
- **Répartition des volées** par paliers adaptés au niveau actuel : moins de 20, 20–39, 40–59, 60 et plus (paliers ajustables plus tard ; ne pas mettre en avant 100+ pour l'instant).
- Fléchettes hors cible (nombre et % par partie).
- Régularité : écart entre bonnes et mauvaises volées (formulé simplement, ex. « tes volées varient de ±18 points »).
- Busts : nombre, et **ce qu'ils coûtent** — volées perdues et effet sur la moyenne (moyenne avec / sans les volées bust).
- Fin de partie : moyenne au-dessus de 100 restants comparée à celle en dessous ; taux de réussite sur les doubles de fin (tentatives / réussites).
- Garder meilleure et pire volée.

### B3. Exercices à cible (serpent, haut-bas, tour de l'horloge…)
- Précision **par secteur visé** (tableau existant conservé), avec tendance d'une séance à l'autre pour le même exercice.
- Secteur le plus raté et secteur le plus réussi de la séance.
- **Groupement / dérive** : les fléchettes partent-elles plutôt à gauche, à droite, en haut ou en bas de la cible visée (flèche sur la cible + phrase simple, ex. « tu tires souvent sous la cible »). Mention d'approximation pour les saisies verticales (centre de la case), comme prévu au lot 8.
- Fléchettes hors cible.
- Score de l'exercice comparé aux séances précédentes du même exercice.

### B4. Multijoueur (soirées, parties en ligne, amis)
- Mise en avant de ce qui se compare entre joueurs : moyenne, meilleure volée, busts, taux de victoire.
- **Forme du soir** : la moyenne de la soirée comparée à la moyenne habituelle du joueur.
- Comparaison avec un ami lié (ses stats reçues via A).

---

## C. Sons contextuels

**Principe** : chaque jeu ou exercice donne un **verdict** à chaque fléchette — réussie, neutre ou ratée **par rapport à l'objectif du moment** — et le son suit ce verdict, pas la valeur brute. Exemple : un simple 7 en serpent quand le 7 est visé = son de réussite (aujourd'hui il sonne comme un mauvais point de X01). Un module central (`verdict` → `son`) utilisé par tous les modes, pour que chaque nouvel exercice n'ait qu'à fournir son verdict.

Sons à prévoir (courts, discrets, dans l'esprit de la DA, réglables) :
- Fléchette : réussie (petit carillon), neutre, ratée ; double ou triple **voulu** réussi = son plus riche ; hors cible.
- Série : montée de ton sur des réussites consécutives.
- Volée : bonne volée selon les paliers de B2, bust (existant, gardé).
- Fin : jingle de fin de partie / d'exercice qui varie selon le résultat ; victoire ; nouveau record personnel.
- **Défi** : signal bien reconnaissable à l'**arrivée** d'un défi (le joueur concentré sur le jeu ne le voit pas toujours), puis son de défi réussi / raté.
- **Badge** : petite fanfare à l'obtention, plus grande pour un rang en or.
- Conserver les sons de touches existants et les sons des animations de tour (lot 7.5) ; pas de chevauchement criard (priorité : record > badge > défi > fléchette).

Réglages (section Son) : volume général, et activation par famille (touches, verdicts, défis/badges, fin de partie). Pas de son pendant un appel en ligne si l'audio est actif plus tard.

Tests : table verdict attendu par mode/exercice (X01, serpent, haut-bas, tour de l'horloge, défis), vérifiée en test unitaire.
