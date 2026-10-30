# Moteur X01 — `src/engine/`

JavaScript pur (modules ES), sans dépendance ni affichage. Utilisable tel quel dans la page
(`<script type="module">`) et sous `node --test`.

| Fichier | Rôle |
|---|---|
| `darts.js` | la fléchette, commune à tous les jeux : validation, valeur, double, notation |
| `x01.js` | règles X01 : configuration, état recalculé, jouer, annuler |
| `checkout.js` | table de finitions (sortie simple / double, 1 à 3 fléchettes restantes) |
| `stats.js` | statistiques d'un joueur recalculées depuis les fléchettes ; résumé d'un joueur dans une partie |
| `index.js` | point d'entrée ; `GAMES` liste les jeux (X01 seul pour l'instant) |

## Fléchette

`{ segment, multiplier }` — segment 0 à 20 ou 25, multiplicateur 1 / 2 / 3.

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

`suggestCheckout(reste, outMode, fléchettesRestantes)` → liste de fléchettes ou `null` (non jouable).
Table calculée une fois par recherche exhaustive. Choix : le moins de fléchettes ; en sortie double, le double
le plus classique (D20, D16, D8, D18, D12…, 50 en dernier) ; préparation simple plutôt que triple, gros triples
d'abord, jouée de la plus grosse à la plus petite ; jamais de route qui ferait bust en chemin.
Ex. 170 → T20 T20 50, 100 → T20 D20, 41 → S1 D20, 33 → S1 D16.
`isCheckoutRoute()` vérifie une route. À affiner au lot 4 (doubles préférés du joueur).

## Statistiques (`stats.js`)

Partie enregistrée = `{ id, startedAt, config, darts[], abandoned }`. `playerStats(parties, idJoueur)` :
moyenne 3 fléchettes (bust = 0), 9 premières, taux de finition (volées gagnées / volées commencées sur une
finition jouable), taux de doubles (fléchettes qui finissent / fléchettes lancées quand une seule pouvait
finir), meilleure finition, manche la plus courte, 100+ / 140+ / 180, victoires, face-à-face (parties finies
seulement), carte des segments, évolution (moyenne par partie). `inPeriod(parties, '7j'|'30j'|'tout')`.

### Ajouter un jeu

Même forme : un module `src/engine/<jeu>.js` qui prend une configuration et la liste des fléchettes
et rend un état recalculé ; l'ajouter à `GAMES` dans `index.js`. `darts.js` est commun.

## Tests

`tests/darts.test.js`, `tests/x01.test.js`, `tests/checkout.test.js`, `tests/stats.test.js` (aides dans `tests/helpers.js`, notation `ds('T20 T20 0 D16')`).
Couverts : 3 scores de départ, finitions simple / double / sur 50, bust par dépassement / reste 1 / 0 sans
double, bust et finition à chaque rang de fléchette, saisies invalides, rotation du premier joueur,
fin de partie à N manches, ANNULER dans tous les cas imposés, partie de 501 rejouée volée par volée,
8 joueurs, 120 parties aléatoires reproductibles (invariants + ANNULER = préfixe).
