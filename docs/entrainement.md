# Entraînement solo (lot 8, versions 0.12.0 et 0.13.0)

Cahier des charges : « Strela — Lot 8 : entraînement solo » (22/11/2026, document Claude de Guillaume). Tout ce qui
suit est dans l'appli depuis la 0.12.0, sauf ce qui est marqué 0.13.0 (demandes de Guillaume du 22/11 : couleurs des
pièces, niveau intermédiaire et seuils, dessin de la fléchette au choix du jeu, changer de jeu en pleine séance, gérer
une séance autrement qu'en la supprimant).

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/engine/training.js` | moteur pur : zones (dont simple intérieur / extérieur), cible visée, exercices, état d'une séance, analyse, messages du coach, exercice proposé, niveau, carte de chaleur |
| `src/engine/dartsets.js` | jeux de fléchettes : listes de choix, bornes, modèles fournis, jeux de Guillaume (`SEED_SETS`), résumé |
| `src/ui/screens/training.js` | écrans `#/entrainement` (choix), `#/entrainement/jeu` (saisie), `#/entrainement/fin`, `#/entrainement/seance/<id>` |
| `src/ui/screens/trainstats.js` | `#/entrainement/stats` |
| `src/ui/screens/arsenal.js` | armurerie `#/armurerie`, `#/armurerie/<id>`, `#/armurerie/nouveau[/<modèle>]` |
| `src/ui/screens/advice.js` | conseils `#/conseils`, `#/conseils/<clé>` ; dessin de la fléchette décomposée (`dartDiagram`) |
| `src/ui/boardinput.js` | saisie au doigt sur la cible (loupe), extraite de `screens/game.js`, commune au jeu et à l'entraînement |
| `src/ui/store.js` | section « entraînement solo » : `store.trainings`, `store.tr` (séance en cours), `store.dartSets`, `store.trSetup` |
| `tests/entrainement.test.js` | moteur, jeux, base (migration v3), sauvegarde |
| `tests/entrainement-parcours.test.js` | vraie appli : migration réelle v2 → v3, séance au pavé, rechargement, séance libre à la cible en paysage, armurerie |
| `tests/entrainement-0-13.test.js` | 0.13.0 : couleurs (jetons), exercices intermédiaires, objectifs, niveaux, jeu changé en cours, forme enregistrée, sauvegarde |
| `tests/entrainement-0-13-parcours.test.js` | 0.13.0 en vraie appli : couleurs, changer de jeu (pause), note, jeu corrigé, mise de côté, triple 20 au pavé, reprise |

## Données (aucune perte à la mise à jour)

- Base **version 3** : deux magasins nouveaux, `trainings` et `dartsets` (migration qui ne fait que les créer et y
  poser les deux jeux de Guillaume ; rien d'autre ne change — testé en vrai, `tests/entrainement-parcours.test.js`).
- Séance : `{ id, startedAt, endedAt (null : en cours), player, setId, mode ('coach' | 'libre'), exercise, blocks? (libre :
  [{ s, z, n }]), darts[], stopped? }` (`db.js › trainingRecord`). Une seule séance en cours, **indépendante** de la partie
  en cours (on peut avoir les deux).
- 0.13.0, champs facultatifs (base toujours en version 3, **aucune migration** ; une séance d'avant se lit telle
  quelle) : `setChanges?` `[{ at, setId }]` (jeu changé pendant la séance : `setId` vaut pour les fléchettes de rang
  `at` et suivantes ; `setId` de la séance = jeu du début ; moteur : `setRuns`, `setAt`, `setsUsed`, `cleanSetChanges`),
  `note?` (300 caractères au plus), `excluded?` (mise de côté : hors stats, niveau et exercice proposé). Une version
  plus ancienne de l'appli qui réécrirait la séance perdrait ces champs (pas de retour en arrière prévu).
- Jeu de fléchettes, 0.13.0 : `colors?` `{ point?, barrel?, shaft?, flight? }`, une clé de `DART_COLOR_NAMES`
  (dartsets.js) ; teintes dans `ui/theme.js › DART_COLORS` et jetons `--dart-<clé>` de theme.css (mêmes dans les deux
  thèmes, objet physique comme la cible ; testé).
- Fléchette : `{ segment, multiplier, ring?, pos? }` ; `ring` = `'in'` (simple intérieur) ou `'out'` (simple
  extérieur), seulement pour un simple de 1 à 20 ; `pos` = point touché (saisie sur la cible, repère de `board.js`) ;
  segment 0 = hors cible (avec `pos` s'il a été posé sur la couronne des numéros).
- Réglage `training` : derniers choix de l'écran (joueur, jeu, mode, cible libre).
- Sauvegarde : champs facultatifs `trainings` et `dartSets` (format toujours en version 1). Une sauvegarde d'avant le
  lot 8 n'en a pas : REMPLACER TOUT garde alors l'entraînement du téléphone ; FUSIONNER n'ajoute rien. Écran de secours
  et sauvegarde automatique les exportent aussi.
- Le code X01, Cricket, soirée, badges, records ne voit jamais l'entraînement (comme le Cricket ne voit pas X01).

## Saisie

Reprise de la partie (choix de Guillaume) : **portrait** = pavé, **paysage** = cible au doigt avec la loupe.

- Pavé (état depuis la 0.19.1, détail : docs/interface.md « Version 0.19.1 ») : deux modes, réglage `padRing`.
  **Secteur entier** (défaut) : rangée `S · D · T` (1, 2, 3 traits) puis le nombre, d'un appui ; zone visée armée
  d'office (T, D, sinon S), une autre zone vaut pour une fléchette ; simple sans couronne. **Secteur touché** : le nombre,
  puis sa zone (simple intérieur / extérieur, double, triple). Historique : 0.12–0.14 rangée `S INT. · S EXT. · D · T`
  puis le nombre ; 0.15–0.19.0 toujours le nombre puis sa zone (le réglage ne changeait que les choix proposés).
- `25`, `50`, `0 HORS CIBLE`, `ANNULER` (ANNULER défait aussi une série ajoutée et pas encore commencée).
- Cible : le simple pris sur la cible porte son anneau ; lâcher sur la couronne des numéros = hors cible (position
  gardée, pour l'écart) ; au-delà du dessin : rien.
- Pas de VALIDER (on est seul) : les 3 cases montrent la volée en cours, puis la précédente estompée jusqu'à la
  fléchette suivante. Dernière fléchette : écran de fin (analyse), la séance n'est enregistrée close qu'à TERMINER (ou
  ARRÊTER ET VOIR L'ANALYSE dans le menu pause : séance « arrêtée »). ANNULER LA DERNIÈRE FLÉCHETTE revient à la saisie.
- Écran allumé pendant la saisie ; retour d'Android = menu pause.
- 0.13.0 : menu pause → CHANGER DE JEU (dessin du jeu en cours) → liste des jeux avec leur dessin. Avant la première
  fléchette, c'est le jeu de la séance qui change ; ensuite un changement est noté au rang de la prochaine fléchette.
  ANNULER une fléchette ne défait pas un changement (la fléchette retirée avait été lancée avec l'ancien jeu). Le jeu
  choisi devient celui proposé pour la séance suivante.

## Exercices

| Clé | Exercice | Séries | Chiffre principal |
|---|---|---|---|
| groupement | Groupement | 9 sur le 20 | dans le secteur (%) |
| horloge | Tour de l'horloge en simples | 1 → 20, toute zone ; on passe au suivant dès qu'il est touché | fléchettes utilisées |
| hautbas | Haut contre bas | 20 / 3 / 20 / 3 / 20 / 3, une volée chacun | dans le secteur (%) |
| gauchedroite | Gauche contre droite | 11 / 6, trois fois | dans le secteur (%) |
| scorelibre | Score libre | 10 volées en visant le 20 | moyenne par volée (+ régularité ±) |
| bull | Bull | 9 au centre | part « près du centre » |
| vingt | 20-19-18 | 20 sur le 20, 20 sur le 19, 20 sur le 18 | dans le secteur (%) |
| triple20 *(intermédiaire)* | Triple 20 | 30 sur le T20 | triples (%) ; + bon secteur, moyenne par volée |
| triples *(intermédiaire)* | Triples 20 et 19 | T20 / T19, une volée chacun, 5 fois | triples (%) |
| doubles *(intermédiaire)* | Doubles de finition | 9 sur D20, D16, D8 | doubles (%) |
| horlogedoubles *(intermédiaire)* | Tour des doubles | D1 → D20, 3 fléchettes au plus par double | doubles touchés sur 20 |
| bull25 *(intermédiaire)* | Centre 25 / 50 | 15 au centre | 25 ou 50 (%) |
| libre | Libre | les séries choisies (secteur, zone, nombre) | dans la cible (%) |

`clock` d'un exercice : `{ z, max }` (horloge : toute zone, sans limite ; tour des doubles : doubles, 3 au plus).
Listes : `LEVEL_EXERCISES` (débutant = `COACH_ORDER` ; intermédiaire et confirmé = les cinq exercices + score libre),
`ALL_EXERCISES`. À l'écran Entraînement, les exercices du niveau du joueur, et ceux de l'autre niveau repliés (on peut
tout lancer).

Pas d'exercice sur les doubles seuls (cahier des charges). Haut contre bas et gauche contre droite : 3 alternances
(nombre non fixé par le cahier des charges). Bull : « à moins de deux secteurs » compris comme : le 25, le 50, ou le
simple intérieur (saisi au pavé) ; saisi sur la cible, un simple intérieur compte s'il est à moins de 5 cm du centre
(bord du 25 + deux largeurs de secteur à cet endroit). **À confirmer avec Guillaume.**

## Analyse

- Les impacts sont replacés sur les cotes d'une **vraie cible** (mm, `REAL_R`) : point touché (cible) ou milieu de la
  zone (pavé ; simple intérieur à 57 mm du centre, extérieur à 135 mm, triple 103, double 166).
- Point visé : milieu de la zone visée ; « tout le secteur » ou « simple » = entre le simple intérieur et l'extérieur
  (96 mm), pour que intérieur et extérieur pèsent pareil.
- Écart moyen décomposé, pour un secteur, en **côté** (sens horaire) et **hauteur** (vers le bord), puis dit à l'écran
  (« à gauche », « en haut »…) ; pour le centre, en x et y. Un écart compte s'il fait au moins 9 mm et au moins le quart
  du groupement (`BIAS_MM`). Plusieurs cibles (haut/bas, gauche/droite, 20-19-18) : un écart par cible.
- Groupement = distance moyenne des impacts à leur centre ; dispersé au-delà de 5 cm, bien groupé sous 3 cm.
- Conseils (`TIPS`) : écart sur le côté → alignement pied / épaule / coude (fiche Posture) ; trop haut → lâcher trop tôt,
  trop bas → trop tard ou geste freiné (fiche Lancer) ; dispersé → régularité de la prise (fiche Prise en main).
- Dessin : sur la cible de chaque cible visée, croix = point visé, carré = centre des impacts, trait = écart moyen.

## Coach : objectifs, niveau, exercice proposé (0.13.0)

Objectifs (`GOALS`, sur le chiffre principal de l'exercice), d'après les ordres de grandeur d'un joueur amateur : un
débutant met une fléchette sur deux dans le secteur visé et fait autour de 30 par volée ; un intermédiaire fait 45 de
moyenne, un triple 20 sur huit, un double sur cinq ; un confirmé 60, un triple sur cinq, un double sur trois. Les
objectifs se tiennent entre eux (un double sur cinq ≈ 9 doubles sur 20 au tour des doubles, 3 fléchettes chacun).

| Exercice | Débutant | Intermédiaire | Confirmé |
|---|---|---|---|
| Groupement (dans le secteur) | 50 % | 65 % | 80 % |
| Tour de l'horloge (fléchettes, au plus) | 60 | 40 | 30 |
| Haut contre bas, gauche contre droite, 20-19-18 | 45 % | 60 % | 75 % |
| Score libre (moyenne par volée) | 30 | 45 | 60 |
| Bull (près du centre) | 50 % | 70 % | 85 % |
| Triple 20, triples 20 et 19 | 5 % | 12 % | 20 % |
| Doubles de finition | 10 % | 20 % | 30 % |
| Tour des doubles (sur 20) | 5 | 9 | 13 |
| Centre 25 / 50 | 10 % | 20 % | 30 % |

- Passage de niveau (`LEVEL_UP`, `LEVEL_SESSIONS` = 3) : tenir l'objectif du niveau actuel sur 3 séances complètes de
  suite de chacun des exercices clés — débutant → intermédiaire : **groupement (50 %) et score libre (30)** ;
  intermédiaire → confirmé : **triple 20 (12 %), doubles de finition (20 %), score libre (45)**. Une séance sous
  l'objectif remet le compte de cet exercice à zéro ; un critère tenu une fois reste tenu, un niveau atteint reste.
  Séances arrêtées et mises de côté exclues. Changement par rapport à la 0.12.0 (groupement seul) : le score libre
  s'ajoute.
- Écran : carte NIVEAU avec, pour le niveau suivant, chaque critère et ses 3 cases ; « obj. » sur chaque exercice
  (✓ si la dernière séance le tient) ; à la fin et au détail d'une séance : OBJECTIF · NIVEAU … tenu / pas encore.
- Exercice suivant (`nextFor`, au niveau du joueur) : écart sur le côté → gauche contre droite ; en hauteur → haut
  contre bas ; dispersé → groupement ; groupement tenu → 20-19-18 (débutant) ou triple 20 ; triple 20 tenu → triples
  20 et 19 ; doubles sous l'objectif → tour des doubles ; sinon un exercice du niveau jamais fait (ordre de
  `LEVEL_EXERCISES`), sinon le moins récent.

## Gestion d'une séance (0.13.0)

Détail d'une séance close (`#/entrainement/seance/<id>`), sous l'analyse :
- **Note** (champ libre, enregistré au fil de la saisie ; « ✎ note » dans les listes).
- **Jeu de fléchettes** : une ligne par partie de la séance (avec son dessin), CHANGER corrige le jeu noté.
- **Reprendre** (séance arrêtée et pas finie) : elle redevient la séance en cours (une autre en cours est d'abord
  rangée arrêtée), puis on reprend là où elle s'était arrêtée.
- **Refaire**, **Mettre de côté / Remettre dans les stats**, **Changer de joueur** (s'il y en a plusieurs), **Supprimer**.
- Panneaux (jeu, joueur, suppression) : un seul ouvert, fermé par `tr-del-no` (déjà dans les fermetures du retour
  d'Android : back.js inchangé).

## Stats d'entraînement

0.13.0 : séances mises de côté exclues ; quand le jeu a changé pendant une séance, le filtre « jeu » et le tableau
par jeu ne prennent que les fléchettes lancées avec ce jeu (`analyze › extra.bySet`) ; filtre « exercice » : les
exercices déjà faits par le joueur.

Filtres (gardés d'une visite à l'autre) : source ENTRAÎN. / PARTIES / LES DEUX, joueur, jeu de fléchettes, exercice,
période (7, 30, 90 jours, tout). Parties = fléchettes du joueur dans ses parties X01 (sans cible visée : ni précision,
ni groupement ; pas de jeu de fléchettes noté, donc exclues dès qu'un jeu ou un exercice est filtré). Courbes : séance
par séance (ou partie), valeur écrite au-dessus de chaque point. Carte de chaleur : simple intérieur et extérieur à
part (un simple de partie compte pour moitié dans chacun). Tableaux par jeu (séances, fléchettes, précision, groupement)
et par exercice (séances, dernière, meilleure). Lien depuis les Stats d'un joueur (« STATS D'ENTRAÎNEMENT »).

## Jeux en solo : X01 et Cricket (0.14.0)

Demande de Guillaume : « des jeux classiques X01 et Cricket en solo pour tester de vraies configs de jeu ; le taux de
triple, de double et la carte de chaleur sont valables dans ce cas-là, pas pour les entraînements sur des secteurs ou
l'horloge qui vise tout ».

- **Hub** : troisième mode JEUX (`trSetup.mode = 'jeu'`, réglage `training.game = { kind, startScore, outMode, legs }`).
  X01 : départ 301 / 501 / 701, sortie simple / double, 1 / 3 / 5 manches ; Cricket : manches.
- **Séance** : `exercise` `'x01'` ou `'cricket'`, `mode: 'jeu'`, champ facultatif `game` (`cleanGame` : X01
  `{ startScore, outMode, legs }`, Cricket `{ legs }`). **Aucune migration** ; une sauvegarde 0.14 avec des jeux ne se
  relit pas dans une appli plus ancienne (séance refusée), c'est le seul sens qui ne marche pas.
- **Moteur** : `trainingState` passe la main aux moteurs des parties (`gameConfig` : un seul joueur `'solo'` ; Cricket en
  mode `sans`, seul on ferme sans points). `st.gs` = état du moteur ; pas de série ni de cible (`blocks: []`, `cur: null`).
- **Saisie** (`gameScreen`) : même pavé (zone par défaut S INT.) et même cible au doigt. En tête : X01 = reste,
  finition proposée (`suggestCheckout` avec la fiche du joueur), fléchettes de la manche ; Cricket = les 7 cibles avec
  leurs marques (`markSvg`), cibles fermées. Volée en cours (ou la précédente estompée, BUST affiché) ; ligne du bas :
  moyenne ou MPR, BUST · RETOUR À n, MANCHE n GAGNÉE.
- **Analyse** (`analyzeGame`) : X01 = chiffres de `playerStats` (mêmes définitions que les parties : moyenne, 9
  premières, finition = fléchettes lancées quand une seule pouvait finir, 100+, bust) ; Cricket = `cricketSummary` (MPR,
  marques utiles par cible). Par fléchette : `credit` (points comptés en X01 — 0 dans un bust, null dans une volée pas
  finie ; marques utiles au Cricket) et `finishFlags` (X01), pour les chiffres par jeu de fléchettes. Pas de précision
  ni d'écart (`rate: null`). Coach : `gameNext` propose les doubles de finition (moins de 20 % sur 3 fléchettes au
  moins) ou le triple 20 / les triples (moins de 6 % de triples).
- **Objectifs** (`GOALS`) : X01 30 / 45 / 60 de moyenne ; Cricket MPR 1 / 1,5 / 2,2. Les jeux ne comptent ni pour le
  niveau ni pour l'exercice proposé.
- **Fin** : chiffres, objectif, conseils, carte de chaleur de la séance, manches, par jeu de fléchettes ; REJOUER
  (`tr-finish-again`) relance les mêmes réglages ; le détail d'une séance a REFAIRE CETTE SÉANCE.

### Stats (0.14.0)

- Triples, **doubles** (nouveau : fléchettes dans un double, 50 compris) et carte de chaleur : seulement les fléchettes
  des jeux en solo et des parties (`free`). Sur un exercice seul : « — » et une phrase d'explication, pas de carte.
- Précision et groupement : seulement les exercices (`aimed`).
- Filtre exercice X01 / Cricket : chiffre principal = moyenne sur 3 fléchettes / MPR (pondérés par les fléchettes),
  finition (X01) ; courbe du résultat, des triples, des doubles, du hors cible.
- Par jeu de fléchettes : tableau des exercices (précision, groupement) et tableau « en jeu » (moyenne, MPR, T %, D %).

## Armurerie

Un jeu (0.13.0 : avec une couleur par pièce, carrés sous « Couleurs », AUCUNE = trait seul ; le dessin
`dartDiagram({ …, colors })` la reprend dans l'armurerie, au choix du jeu, au menu pause et au détail d'une séance) : nom, poids total, masse du fût, forme (droit, torpedo, bombé, fuselé), matière (laiton, nickel-argent,
tungstène + %), grip, longueur totale, tige (longueur, matière), empennage (forme, épaisseur), pointe. Six modèles
fournis ; les deux jeux de Guillaume créés par la migration (22 g torpedo 161 mm, 22 g fût droit 135 mm, empennages
standard 0,1 mm — le reste à compléter par lui). Un jeu utilisé par une séance s'archive (il ne se supprime pas).

## Conseils

Quatre fiches (`SHEETS`) : prise en main, posture, lancer, types de fléchettes (fléchette décomposée, formes de fût et
d'empennage). Ajouter une fiche = une entrée de `SHEETS` et un dessin dans `ILL`.

## Ouvert

- Objectifs et seuils de niveau : estimations d'amateur (0.13.0), à ajuster sur les chiffres réels de Guillaume.
- Pas d'exercice propre au niveau confirmé (les intermédiaires, avec des objectifs plus hauts).
- « À moins de deux secteurs » (exercice Bull) : interprétation à confirmer.
- Jeux en solo : pas de Cricket « avec points » (sans adversaire, rien ne rapporte) ; seuils de MPR à ajuster.
- Nombre d'alternances de haut contre bas et gauche contre droite (3 aujourd'hui).

## Lot 8 du 23/11 : saisie, règles et stats (0.15.0)

Cahier des charges « Strela — Lot 8 : entraînement, stats et distribution » (23/11/2026) ; avancement :
docs/lot-8-avancement.md. **Aucune migration** : champ facultatif `rules` des séances (2 pour les séances nouvelles),
réglage d'affichage `heatScale`.

### Saisie
- **Pavé (portrait)** : le nombre, puis sa zone dans un même choix (SIMPLE INT., SIMPLE EXT., DOUBLE, TRIPLE ; la zone de
  la cible visée est soulignée) ; AUTRE NOMBRE ou ANNULER revient au choix du nombre (`ui.pick`). 25, 50, 0 en un appui.
  Plus de zone « armée » (actions `tr-key` puis `tr-zonepick`).
- **Cible (paysage)** : zone de saisie jusqu'à `OFF_R` = 1,33 du repère (270 mm réels, 10 cm au-delà du double),
  dessinée en pointillés (`boardSvg({ margin: true })`). Un hors cible y garde sa position et sa distance ; au-delà : rien.
- **Marques** : disque `--red` semi-transparent, fin contour clair ; volée en cours 0,88, précédentes 0,5 ; numéros
  des secteurs dessinés après les marques.
- **Règle du moment** sous le titre (`RULES[k].now`) et (i) → panneau des règles complètes (`tr-rules`, fermé par
  `tr-rules-close`, dans les fermetures du retour d'Android). Compteur « VOLÉE n / total » (`volleyInfo`).

### Règles écrites (`RULES` de engine/training.js)
Chaque exercice : `flow` (déroulé), `success` (ce qui compte), `entry` (moment de la saisie), `now` (rappel court),
`advance` : `volley` (la cible change à la fin de la volée complète, saisie après les 3 fléchettes — toutes les séries
sont des multiples de 3), `hit` (tour de l'horloge, tour des doubles : la cible avance dès qu'elle est touchée, chaque case
de la volée porte sa cible), `game` (X01, Cricket). 20-19-18 passe à 21 fléchettes par numéro (`blocks` ; les séances
sans `rules` gardent `blocksV1`, 20). Libre : de 3 en 3.

### Précision et stats
- **Précision = distance moyenne au point visé** (mm sur une vraie cible, affichée en cm ; `aimDistance`,
  `precisionOf` → `dist`, `distN`, `approx` (points au centre de leur case, saisie au pavé), `offNoPos` (hors cible au
  pavé : comptés, sans distance)). « Dans la cible » (%) reste le résultat des exercices.
- Séances sans fléchette ignorées par les stats.
- Période : `7j`, `30j`, `tout`, `plage` (deux dates) — `engine/trends.js › periodBounds` ; `trainStatsFilter()` la
  donne aux exports.
- Courbes : `timeAxis` (abscisses selon les dates, 36 px au moins entre deux points), `labelIndexes` (une date tous les
  66 px au plus).
- Tendances : `trend(values, dir)` sur les 10 dernières séances (4 au moins), pente des moindres carrés ramenée à la
  moyenne, flèche au-delà de 5 % ; précision et groupement, toutes séances et par exercice.
- Carte de chaleur : `heatScale` (`clair` par défaut = comme avant, `fonce`, `couleur`), jetons `--heat-*`, zone jamais
  touchée tramée, chiffres à l'encre lisible (`inkOn`). src/ui/heat.js.
- Bandeau de mode (src/ui/modeband.js) : `train` (cible) et `soiree` (pinte), sous la barre du haut, jetons
  `--mode-train` / `--mode-soiree`.
- Listes : séances en cartes (`sessionCard`, détail volée par volée au toucher, `tr-card`) ; historique : une carte par
  soirée ou par jour, repliée, gagnant dans l'en-tête, AFFICHER LES RÉSULTATS en pied.

## Lot 8 du 23/11 : jeux de cible, défis, badges (0.16.0)

**Aucune migration** : nouvelles clés d'exercice, champ facultatif `defiDecl` des séances, `game.defis` du X01 solo.

### Jeux de cible (5.1) — src/engine/fun.js, à valider par Guillaume
Règles complètes dans `RULES` (training.js). Ne comptent pas pour le niveau ; dans les stats (précision et écarts sur
leurs cibles), objectifs dans `GOALS`. État : `funState(key, darts, seed)` ; dans la séance, présenté en séries
(`funTrainingState`). Tirages (Roulette, Killer) d'après l'identifiant de la séance.

| Clé | Jeu | Règle | Score | Cible change |
|---|---|---|---|---|
| serpent | Serpent | les 20 secteurs dans l'ordre de la cible depuis le 20 | fléchettes (−) | au toucher |
| rebours | Compte à rebours | du 20 au 1 | fléchettes (−) | au toucher |
| golf | Golf | trous 1 à 9, 3 fléchettes au plus ; triple 1, double 2, simple 3, manqué 5 | coups, par 27 (−) | au toucher |
| shanghai | Shanghai | volée n sur le n (1 à 7), numéro × multiplicateur ; S + D + T = +100 | points (+) | volée |
| moitie | Moitié | départ 40 ; 20, 19, 18, 17, 16, 15, bull ; volée ratée = total ÷ 2 | points (+) | volée |
| roulette | Roulette | 10 volées, cible tirée au sort ; 1 / 2 / 3 points | points sur 90 (+) | volée |
| mur60 | Mur de 60 | 10 volées sur le 20 ; 60 ou plus = une brique | briques sur 10 (+) | volée |
| plushaut | Plus haut | chaque volée bat la précédente, sinon une vie (3) ; 15 volées au plus | volées réussies (+) | volée |
| cent | Pile 100 | 100 tout juste ; une volée qui dépasse ne compte pas ; 20 volées au plus | fléchettes (−) | libre |
| killer | Killer solo | ton numéro jusqu'à 3 marques, puis 3 adversaires à 3 vies | fléchettes (−) | au toucher |

### Défis en X01 solo (5.2)
Réglage `training.game.defis` (aucun, parfois, souvent), gardé dans `game.defis` de la séance. `soloDefiGame(rec)` présente
la séance comme une partie à engine/defis.js (même tirage d'après l'identifiant et le rang de la volée, jeu de défis
`DEFI_SET`, même validation) ; « main gauche » se déclare (`defiDecl`). Bandeau sous la bande du titre (texte court, sans
gage) ; KPI « Défis réussis » et message dans l'analyse.

### Badges d'entraînement et petits défis (5.3, 5.4) — src/engine/trainbadges.js, src/ui/trainhonours.js
- Petits défis (`FEATS`, sur chaque volée complète d'un exercice ou d'un jeu de cible) : volée parfaite, trio, même trou,
  œil de bœuf. Fin et détail d'une séance : une pastille par défi ; fenêtre (signification, séance, volée).
- Badges à rangs (`TRAIN_BADGES`, seuils à valider) : Assidu 5 / 14 / 30 jours d'affilée ; Bras de fer 2 000 / 10 000 /
  30 000 fléchettes ; Tireur d'élite 4 / 3 / 2 cm d'écart moyen (18 fléchettes visées au moins) ; Mouchoir de poche 3 /
  2,2 / 1,5 cm de groupement (9 au moins) ; En progrès +15 / +30 / +50 % (5 dernières contre 5 premières séances d'un
  exercice, 10 au moins) ; Chasseur de défis 10 / 50 / 200 petits défis. Recalculés sur tout l'historique
  (`trainingHonours`), chaque rang garde la séance où il a été atteint. Vitrine dans les stats d'entraînement.
