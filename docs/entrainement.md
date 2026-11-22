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

- Pavé : rangée `S INT. · S EXT. · D · T`. Par défaut, la zone de la cible visée (0.13.0) : T pour un triple, D pour un
  double, EXT. pour le simple extérieur, sinon simple intérieur ; une autre zone touchée vaut pour une fléchette, puis on
  revient au défaut (toucher le T ou le D par défaut arme le simple intérieur). Le 25 reste saisissable quand le T est
  armé d'office. Quand EXT. est armé, chaque nombre porte « EXT » et un trait en bas.
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
- Nombre d'alternances de haut contre bas et gauche contre droite (3 aujourd'hui).
