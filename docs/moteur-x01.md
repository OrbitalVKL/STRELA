# Moteur X01 — `src/engine/`

JavaScript pur (modules ES), sans dépendance ni affichage. Utilisable tel quel dans la page
(`<script type="module">`) et sous `node --test`.

| Fichier | Rôle |
|---|---|
| `darts.js` | la fléchette, commune à tous les jeux : validation, valeur, double, notation |
| `x01.js` | règles X01 : configuration, état recalculé, jouer, annuler |
| `checkout.js` | table de finitions (sortie simple / double, 1 à 3 fléchettes restantes, préférences du joueur) |
| `stats.js` | statistiques d'un joueur recalculées depuis les fléchettes ; résumé d'un joueur dans une partie |
| `board.js` | géométrie de la cible : position → segment (saisie au doigt), centre d'un segment (impacts), couleur de chaque zone |
| `players.js` | suppression d'un joueur : anonymisation de ses parties |
| `correct.js` | corriger une fléchette déjà jouée sans changer le déroulé de la partie (lot 3) |
| `index.js` | point d'entrée ; `GAMES` liste les jeux (X01 seul pour l'instant) |

## Fléchette

`{ segment, multiplier }` — segment 0 à 20 ou 25, multiplicateur 1 / 2 / 3. Une fléchette saisie sur la cible
porte en plus `pos: [x, y]` (repère de `board.js`) : le moteur l'ignore (il recopie segment et multiplicateur),
la liste enregistrée la garde pour marquer l'impact.

- `dartError(d)` → `null` ou un code : `NOT_A_DART`, `SEGMENT_INVALID` (21, −1, 2,5…),
  `MULTIPLIER_INVALID`, `TRIPLE_BULL` (T25), `MULTIPLIED_MISS` (D0, T0).
- `dartValue(d)`, `isDouble(d)` (D1–D20 et 50), `makeDart(segment, multiplier)`.
- `parseDart('T20' | 'D16' | 'S5' | '7' | '0' | '25' | '50')` → fléchette ou `null` ; `formatDart(d)` → notation.

## Partie

Configuration : `{ startScore: 301|501|701, outMode: 'single'|'double', legsToWin = 1, players: [ids] }`
(1 à 8 identifiants distincts dans l'ordre de jeu ; le moteur ne les interprète pas).

**Le seul état stocké est la liste ordonnée des fléchettes.** Tout le reste se recalcule :

- `computeState(config, darts)` → état (lève une erreur si une fléchette de la liste est invalide ou
  postérieure à la fin de partie : données corrompues).
- `throwDart(config, darts, dart)` → `{ ok, darts, state, error? }` ; refus sans exception
  (`error` = code de fléchette ou `MATCH_OVER`).
- `undoDart(config, darts)` → `{ darts, state }` : retire la dernière fléchette.
- `createX01(config, darts?)` : commodité à état (`.throw(d)`, `.undo()`, `.state`, `.darts`).

### État exposé

| Champ | Sens |
|---|---|
| `status` | `'playing'` ou `'finished'` ; `winner` = rang du gagnant ou `null` |
| `legNumber`, `legStarter` | manche en cours (1, 2…) et rang de son premier lanceur (tourne d'un cran par manche) |
| `currentPlayer` | rang du joueur actif (`null` si partie finie) |
| `dartNumber` | rang de la prochaine fléchette dans la volée, 1 à 3 (`null` si finie) |
| `remaining[]` | reste de chaque joueur |
| `legsWon[]` | manches gagnées |
| `visit` | volée en cours `{ player, startRemaining, darts[], total }` |
| `lastEvent` | `none`, `dart`, `visit_end`, `bust`, `leg_won`, `match_won` |
| `lastDart`, `lastVisit` | dernière fléchette, dernière volée close (pour afficher le bust ou la volée finie pendant ~1 s) |
| `visits[]` | volées closes : `{ leg, player, startRemaining, darts[], total, scored, remainingAfter, bust, finish }` (`scored` = 0 sur bust) |
| `legs[]` | `{ number, starter, winner, visits[], finalRemaining }` |
| `dartCount` | nombre de fléchettes |

Après une manche gagnée, l'état est déjà sur la manche suivante (restes remis au départ) ; les restes
de fin de manche sont dans `legs[k].finalRemaining`.

## Finitions (`checkout.js`)

`suggestCheckout(reste, outMode, fléchettesRestantes, préférences?)` → liste de fléchettes ou `null` (non jouable).
Tables calculées une fois par réglage (recherche exhaustive), puis gardées. Préférences du joueur (lot 4, fiche
joueur, `checkoutPrefs()`) : `{ double: 20, avoidBull: false }` par défaut. Choix, dans l'ordre :

1. « éviter le bull » : une route sans 25 ni 50 dès qu'il en existe une dans la volée (50 → S10 D20, 110 → T20 S10
   D20) ; sinon le bull reste (170 → T20 T20 50 ; 110 avec 2 fléchettes → T20 50) ;
2. le moins de fléchettes (40 → D20 même pour un joueur au D16) ;
3. sortie double : le double préféré, puis les plus classiques (D20, D16, D8, D18, D12…, 50 en dernier)
   (41 → S1 D20 au D20, S9 D16 au D16) ;
4. à valeur égale, une première fléchette qui laisse encore un double d'une fléchette (D1 à D20) si elle ne fait que
   le simple (raté le plus courant d'un triple) ; à défaut, une finition avec les fléchettes qui restent (67 → T17 D8 :
   S17 laisse 50 ; T9 D20 : S9 laisse 58, plus rien) ;
5. préparation simple plutôt que triple, gros triples d'abord, jouée de la plus grosse à la plus petite ; jamais de
   route qui ferait bust en chemin.

Ex. (défaut) 170 → T20 T20 50, 100 → T20 D20, 41 → S1 D20, 33 → S1 D16, 128 → T18 T14 D16. Les préférences changent la
route, jamais l'existence d'une finition (les stats, « chances de finition », appellent sans préférence).
`isCheckoutRoute()` vérifie une route.

## Statistiques (`stats.js`)

Partie enregistrée = `{ id, startedAt, config, darts[], abandoned }`. `playerStats(parties, idJoueur)` :
moyenne 3 fléchettes (bust = 0), 9 premières, taux de finition (volées gagnées / volées commencées sur une
finition jouable), taux de doubles (fléchettes qui finissent / fléchettes lancées quand une seule pouvait
finir), meilleure finition, manche la plus courte, 100+ / 140+ / 180, victoires, face-à-face (parties finies
seulement), carte des segments, évolution (moyenne par partie). `inPeriod(parties, '7j'|'30j'|'tout')`.
`faceToFace(parties, joueur, adversaire)` (lot 3) : bilan (gagnées, perdues, gagnées par un autre), bilan des manches,
parties communes de la plus récente à la plus ancienne, abandonnées à part. Définitions exactes :
[statistiques.md](statistiques.md).

## Corriger une fléchette (`correct.js`, lot 3)

`correctDart(config, fléchettes, rang, fléchette)` → `{ ok: true, darts, before, after, effects }` ou
`{ ok: false, error }` (`INVALID`, `OUT_OF_RANGE`, `SAME`, `CHANGES_FLOW`) ; la liste d'origine n'est jamais modifiée.
La fléchette n° `rang` est remplacée et toute la partie recalculée ; acceptée seulement si chaque fléchette suivante
reste au même joueur, dans la même volée de la même manche (`dartOwners()`), et si la partie en est au même point
(joueur à qui c'est le tour, manche, volée commencée, vainqueur). Un bust qui couperait une volée, une finition
avancée ou perdue sont donc refusés : on passe par ANNULER. `effects` : total de la volée avant / après (null = bust)
et reste du joueur avant / après (maintenant, ou à la fin de la manche si elle est finie). `locateDart()` et
`visitStart()` passent d'un rang dans la liste à une volée et inversement.

## Cible (`board.js`)

Repère : centre (0, 0), x vers la droite, **y vers le bas** (comme en SVG), rayon 1 = bord extérieur du double.
20 en haut, secteurs dans le sens des aiguilles d'une montre (`SECTORS`), 18° chacun, centrés sur leur axe.
Anneaux (`RINGS`) **élargis** par rapport à une vraie cible pour la saisie au doigt : 50 jusqu'à 0,075, 25 jusqu'à
0,17, simple jusqu'à 0,5, **triple 0,5–0,65**, simple jusqu'à 0,85, **double 0,85–1** ; numéros à 1,09, bord du
dessin à 1,18. (Une vraie cible a triple et double de 0,05 : intouchables au doigt sur un téléphone.)

- `segmentAt(x, y)` → fléchette ou `null` hors cible (au-delà de 1, numéros compris). Une limite appartient à la zone
  extérieure (0,5 → triple, 0,65 → simple), sauf le bord extérieur du double (1 → double) ; un bord de secteur
  exact va au secteur suivant dans le sens horaire (9° → 1).
- `dartPoint(fléchette)` : centre de la zone (simple : milieu du grand simple intérieur ; 25 : sur l'anneau du 25,
  en haut ; 50 : centre ; 0 → `null`, non marqué). `impactPoint()` : `pos` si elle correspond bien à la fléchette,
  sinon `dartPoint()`. `zoneLabel()` : « T20 », « D16 », « 5 », « 25 », « 50 ».
- `zoneTone(segment, multiplicateur)` (lot 1.2) : couleur réglementaire de la zone, `'black' | 'cream' | 'red' |
  'green'` (simple du 20 noir puis un secteur sur deux ; doubles et triples rouges sur les noirs, verts sur les crème ;
  25 vert, 50 rouge ; 0 → `null`). Le dessin (`src/ui/board.js`) en tire ses classes, les jetons `--board-*` les couleurs.

## Suppression d'un joueur (`players.js`)

`deletePlayer(joueurs, parties, id)` → `{ players, games, kept, removed }`, sans modifier les entrées. Dans chaque
partie où il a joué avec d'autres, son identifiant devient `~<rang>` (rang dans l'ordre de jeu : unique dans la
partie, `computeState` reste valide) ; une partie où il ne reste aucun joueur connu (jouée seul) est retirée.
`isDeletedId()` reconnaît ces identifiants. `playerStats` les ignore dans les face-à-face ; tout le reste (volées,
vainqueur, moyennes des autres) est inchangé. `deletionImpact()` donne les deux listes sans rien changer
(texte de la confirmation).

### Ajouter un jeu

Même forme : un module `src/engine/<jeu>.js` qui prend une configuration et la liste des fléchettes
et rend un état recalculé ; l'ajouter à `GAMES` dans `index.js`. `darts.js` est commun.

## Tests

`tests/darts.test.js`, `tests/x01.test.js`, `tests/checkout.test.js`, `tests/stats.test.js`, `tests/board.test.js`,
`tests/players.test.js` (aides dans `tests/helpers.js`, notation `ds('T20 T20 0 D16')`). Côté interface (purs) :
`tests/turn.test.js` (validation des volées, chiffres en rouleau), `tests/maquette.test.js`, `tests/theme.test.js`.
Couverts : 3 scores de départ, finitions simple / double / sur 50, bust par dépassement / reste 1 / 0 sans
double, bust et finition à chaque rang de fléchette, saisies invalides, rotation du premier joueur,
fin de partie à N manches, ANNULER dans tous les cas imposés, partie de 501 rejouée volée par volée,
8 joueurs, 120 parties aléatoires reproductibles (invariants + ANNULER = préfixe). Cible : ordre des secteurs,
bords de secteurs, limites des anneaux triple et double, 25 et 50, hors cible, aller-retour fléchette → centre →
fléchette pour les 62 zones. Suppression : parties gardées / effacées, entrées intactes, stats des autres inchangées,
plus de face-à-face avec le joueur supprimé, deux joueurs supprimés dans une même partie.
