# Moteur du Cricket (lot 10)

`src/engine/cricket.js`, JS pur, sans DOM, comme `x01.js` : l'état se recalcule toujours depuis la configuration et
la liste des fléchettes (format commun `{ segment, multiplier }`, `darts.js`). Tests : `tests/cricket.test.js`.

## Configuration

`{ game: 'cricket', players: [ids] (1 à 8), mode: 'points' | 'sans' | 'cutthroat', legsToWin: 1 à 9 }`.
`config.game === 'cricket'` distingue une partie de Cricket ; absent = X01 (aucune migration : les anciennes parties
n'ont pas ce champ). `isCricket(g)`.

## Règles

- Cibles : 20 à 15 et le bull. Simple = 1 marque, double = 2, triple = 3 ; bull : 25 = 1, 50 = 2. 1 à 14 et RATÉ ne
  marquent rien. 3 marques ferment la cible pour le joueur.
- **Avec points** : au-delà de 3 marques, la valeur (25 pour le bull) va au joueur tant qu'au moins un adversaire n'a pas
  fermé la cible ; gagne celui qui a tout fermé avec au moins autant de points que chacun des autres.
- **Sans points** : le premier qui ferme tout gagne.
- **Cut-throat** : au-delà de 3 marques, la valeur va à chaque adversaire qui n'a pas fermé la cible ; gagne celui qui a
  tout fermé avec au plus autant de points que chacun des autres.
- Vérifié après chaque fléchette : une manche gagnée arrête la volée. Si tout le monde a tout fermé sans gagnant (plus
  rien à marquer), le meilleur score gagne (le plus bas en cut-throat ; à égalité, celui qui vient de lancer).
- Manches : tout repart à zéro, le premier lanceur change à chaque manche.

## État

`computeCricket(config, darts)` → `{ status, winner, legNumber, legsWon, currentPlayer, dartNumber, marks[p][cible],
scores[], visit, visits[] { leg, player, darts, marks, points, closed }, legs[] { winner, scores, marks }, lastEvent
('dart' | 'visit_end' | 'leg_won' | 'match_won'), lastVisit, dartCount }`.

MPR (marques par volée de 3 fléchettes) : marques qui ferment + marques qui rapportent des points (`cricketSummary`,
`cricketPlayerStats`). Classement de fin : `cricketStandings` (vainqueur, manches, cibles fermées, points).

## Rangement

Dans la même base (magasin `games`), mais `store.ckGames` / `store.ck` à part de `store.games` / `store.current` : le code
X01 (stats, records, badges, soirée, rapport) ne voit jamais un Cricket. Une seule partie en cours en tout (lancer l'un
range l'autre). Sauvegarde : les deux dans `games` ; `parseBackup` vérifie chaque partie avec son moteur.
