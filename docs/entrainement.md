# Entraînement solo (lot 8, version 0.12.0)

Cahier des charges : « Strela — Lot 8 : entraînement solo » (22/11/2026, document Claude de Guillaume). Tout ce qui
suit est dans l'appli depuis la 0.12.0.

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

## Données (aucune perte à la mise à jour)

- Base **version 3** : deux magasins nouveaux, `trainings` et `dartsets` (migration qui ne fait que les créer et y
  poser les deux jeux de Guillaume ; rien d'autre ne change — testé en vrai, `tests/entrainement-parcours.test.js`).
- Séance : `{ id, startedAt, endedAt (null : en cours), player, setId, mode ('coach' | 'libre'), exercise, blocks? (libre :
  [{ s, z, n }]), darts[], stopped? }` (`db.js › trainingRecord`). Une seule séance en cours, **indépendante** de la partie
  en cours (on peut avoir les deux).
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

- Pavé : rangée `S INT. · S EXT. · D · T`. Simple intérieur par défaut (comme le simple en partie) ; EXT., D ou T valent
  pour une fléchette, puis on revient au simple intérieur. Exception : si la cible visée est le simple extérieur, le
  défaut est EXT. Quand EXT. est armé, chaque nombre porte « EXT » et un trait en bas.
- `25`, `50`, `0 HORS CIBLE`, `ANNULER` (ANNULER défait aussi une série ajoutée et pas encore commencée).
- Cible : le simple pris sur la cible porte son anneau ; lâcher sur la couronne des numéros = hors cible (position
  gardée, pour l'écart) ; au-delà du dessin : rien.
- Pas de VALIDER (on est seul) : les 3 cases montrent la volée en cours, puis la précédente estompée jusqu'à la
  fléchette suivante. Dernière fléchette : écran de fin (analyse), la séance n'est enregistrée close qu'à TERMINER (ou
  ARRÊTER ET VOIR L'ANALYSE dans le menu pause : séance « arrêtée »). ANNULER LA DERNIÈRE FLÉCHETTE revient à la saisie.
- Écran allumé pendant la saisie ; retour d'Android = menu pause.

## Exercices (niveau débutant)

| Clé | Exercice | Séries | Chiffre principal |
|---|---|---|---|
| groupement | Groupement | 9 sur le 20 | dans le secteur (%) |
| horloge | Tour de l'horloge en simples | 1 → 20, toute zone ; on passe au suivant dès qu'il est touché | fléchettes utilisées |
| hautbas | Haut contre bas | 20 / 3 / 20 / 3 / 20 / 3, une volée chacun | dans le secteur (%) |
| gauchedroite | Gauche contre droite | 11 / 6, trois fois | dans le secteur (%) |
| scorelibre | Score libre | 10 volées en visant le 20 | moyenne par volée (+ régularité ±) |
| bull | Bull | 9 au centre | part « près du centre » |
| vingt | 20-19-18 | 20 sur le 20, 20 sur le 19, 20 sur le 18 | dans le secteur (%) |
| libre | Libre | les séries choisies (secteur, zone, nombre) | dans la cible (%) |

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

## Coach : exercice proposé, niveau

- Exercice suivant : écart sur le côté → gauche contre droite ; en hauteur → haut contre bas ; dispersé → groupement ;
  groupement réussi (≥ seuil) → 20-19-18 ; sinon un exercice jamais fait (ordre du coach), sinon le moins récent.
- Niveau : débutant → intermédiaire quand le groupement atteint **50 % sur 3 séances de suite** (`LEVEL`), séances
  complètes seulement ; un niveau atteint reste. Les exercices intermédiaires viendront plus tard. **Seuils à affiner
  avec Guillaume** (question ouverte du cahier des charges).

## Stats d'entraînement

Filtres (gardés d'une visite à l'autre) : source ENTRAÎN. / PARTIES / LES DEUX, joueur, jeu de fléchettes, exercice,
période (7, 30, 90 jours, tout). Parties = fléchettes du joueur dans ses parties X01 (sans cible visée : ni précision,
ni groupement ; pas de jeu de fléchettes noté, donc exclues dès qu'un jeu ou un exercice est filtré). Courbes : séance
par séance (ou partie), valeur écrite au-dessus de chaque point. Carte de chaleur : simple intérieur et extérieur à
part (un simple de partie compte pour moitié dans chacun). Tableaux par jeu (séances, fléchettes, précision, groupement)
et par exercice (séances, dernière, meilleure). Lien depuis les Stats d'un joueur (« STATS D'ENTRAÎNEMENT »).

## Armurerie

Un jeu : nom, poids total, masse du fût, forme (droit, torpedo, bombé, fuselé), matière (laiton, nickel-argent,
tungstène + %), grip, longueur totale, tige (longueur, matière), empennage (forme, épaisseur), pointe. Six modèles
fournis ; les deux jeux de Guillaume créés par la migration (22 g torpedo 161 mm, 22 g fût droit 135 mm, empennages
standard 0,1 mm — le reste à compléter par lui). Un jeu utilisé par une séance s'archive (il ne se supprime pas).

## Conseils

Quatre fiches (`SHEETS`) : prise en main, posture, lancer, types de fléchettes (fléchette décomposée, formes de fût et
d'empennage). Ajouter une fiche = une entrée de `SHEETS` et un dessin dans `ILL`.

## Ouvert

- Seuils exacts de progression entre niveaux ; exercices du niveau intermédiaire.
- « À moins de deux secteurs » (exercice Bull) : interprétation à confirmer.
- Nombre d'alternances de haut contre bas et gauche contre droite (3 aujourd'hui).
