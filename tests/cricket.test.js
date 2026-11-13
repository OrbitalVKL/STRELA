// Lot 10 : règles du Cricket (engine/cricket.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { computeCricket, normalizeCricket, cricketStandings, cricketSummary, cricketPlayerStats, isCricket } from '../src/engine/cricket.js';

const cfg = (mode = 'points', players = ['A', 'B'], legsToWin = 1) => ({ game: 'cricket', players, mode, legsToWin });

test('configuration : jeu, joueurs, mode, manches', () => {
  assert.equal(normalizeCricket(cfg()).mode, 'points');
  assert.equal(normalizeCricket({ game: 'cricket', players: ['A'] }).legsToWin, 1);
  assert.throws(() => normalizeCricket({ ...cfg(), mode: 'autre' }));
  assert.throws(() => normalizeCricket({ ...cfg(), players: [] }));
  assert.throws(() => normalizeCricket({ ...cfg(), players: ['A', 'A'] }));
  assert.throws(() => normalizeCricket({ players: ['A'], startScore: 501 }));
  assert.ok(isCricket({ config: cfg() }));
  assert.ok(!isCricket({ config: { startScore: 501, players: ['A'] } }));
});

test('marques : simple, double, triple, bull 25 / 50 ; les autres numéros ne marquent rien', () => {
  const s = computeCricket(cfg(), ds('T20 D19 S18'));
  assert.deepEqual([s.marks[0][20], s.marks[0][19], s.marks[0][18]], [3, 2, 1]);
  assert.equal(s.currentPlayer, 1, 'volée de 3 fléchettes : au suivant');
  assert.deepEqual(s.visits[0].closed, [20]);
  assert.equal(s.visits[0].marks, 6);
  const b = computeCricket(cfg(), ds('S25 D25 T14'));
  assert.equal(b.marks[0][25], 3);
  assert.equal(b.visits[0].marks, 3, 'T14 ne compte pas');
});

test('avec points : la valeur compte au-delà de 3 marques, tant qu’un adversaire n’a pas fermé', () => {
  // A ferme le 20 et marque 40 ; B ferme le 20 ; A n'y marque plus rien.
  let s = computeCricket(cfg(), ds('T20 D20 0  T20 0 0  T20 0 0'));
  assert.deepEqual(s.scores, [40, 0]);
  assert.equal(s.visits[2].points, 0, 'le 20 est fermé des deux côtés');
  assert.equal(s.visits[0].marks, 5, 'MPR : 3 marques pour fermer + 2 qui rapportent');
  // Cut-throat : les points vont à l'adversaire qui n'a pas fermé.
  s = computeCricket(cfg('cutthroat'), ds('T20 D20 0'));
  assert.deepEqual(s.scores, [0, 40]);
  // Sans points : rien.
  s = computeCricket(cfg('sans'), ds('T20 D20 0'));
  assert.deepEqual(s.scores, [0, 0]);
});

const closeAll = 'T20 T19 T18  T17 T16 T15  S25 D25';

test('gagner : tout fermé avec autant de points ou plus (avec points), le premier qui ferme (sans points)', () => {
  // A ferme tout en 3 volées (B rate tout) : 0 point chacun, A gagne.
  let s = computeCricket(cfg(), ds(`T20 T19 T18  0 0 0  T17 T16 T15  0 0 0  S25 D25`));
  assert.equal(s.status, 'finished'); assert.equal(s.winner, 0); assert.equal(s.lastEvent, 'match_won');
  assert.equal(s.currentPlayer, null);
  // B a des points d'avance : A ferme tout mais doit encore marquer.
  s = computeCricket(cfg(), ds('0 0 0  T20 T20 0  T20 T19 T18  0 0 0  T17 T16 T15  0 0 0  S25 D25'));
  assert.deepEqual(s.scores, [0, 60]);
  assert.equal(s.status, 'playing', 'A a tout fermé mais 0 point contre 60');
  // A marque sur le 19 (B ne l'a pas fermé) jusqu'à rattraper : 3 × 19 = 57, puis 60+ avec T19 de plus.
  s = computeCricket(cfg(), ds('0 0 0  T20 T20 0  T20 T19 T18  0 0 0  T17 T16 T15  0 0 0  S25 D25 T19  0 0 0  T19'));
  assert.equal(s.scores[0], 114); assert.equal(s.winner, 0);
  // Sans points : le premier qui ferme tout gagne.
  s = computeCricket(cfg('sans'), ds('0 0 0  T20 T20 0  T20 T19 T18  0 0 0  T17 T16 T15  0 0 0  S25 D25'));
  assert.equal(s.winner, 0);
  assert.throws(() => computeCricket(cfg('sans'), [...ds('0 0 0  T20 T20 0  T20 T19 T18  0 0 0  T17 T16 T15  0 0 0  S25 D25'), ...ds('S1')]));
});

test('cut-throat : tout fermé avec le moins de points', () => {
  // A ferme tout en donnant 0 point ; B a reçu 0 aussi : A gagne.
  const s = computeCricket(cfg('cutthroat'), ds(`T20 T19 T18  0 0 0  T17 T16 T15  0 0 0  S25 D25`));
  assert.equal(s.winner, 0);
});

test('manches : la manche gagnée remet tout à zéro, le premier lanceur change', () => {
  const s = computeCricket(cfg('sans', ['A', 'B'], 2), ds(`T20 T19 T18  0 0 0  T17 T16 T15  0 0 0  S25 D25`));
  assert.equal(s.status, 'playing'); assert.equal(s.lastEvent, 'leg_won');
  assert.deepEqual(s.legsWon, [1, 0]);
  assert.equal(s.legNumber, 2); assert.equal(s.currentPlayer, 1, 'B commence la manche 2');
  assert.equal(s.marks[0][20], 0);
  assert.equal(s.legs[0].winner, 0);
});

test('classement, résumé (MPR) et stats d’un joueur', () => {
  const darts = ds(`T20 T19 T18  S20 0 0  T17 T16 T15  0 0 0  S25 D25`);
  const s = computeCricket(cfg(), darts);
  assert.deepEqual(cricketStandings(s), [0, 1]);
  const a = cricketSummary(s, 0);
  assert.equal(a.darts, 8); assert.equal(a.marks, 21); assert.equal(a.mpr, 21 / 8 * 3); assert.equal(a.best, 9);
  const st = cricketPlayerStats([{ config: cfg(), darts, abandoned: false }], 'A');
  assert.deepEqual([st.played, st.won, st.best], [1, 1, 9]);
  assert.equal(cricketPlayerStats([{ config: cfg(), darts }], 'B').won, 0);
});

// ------------------------------------------------------------------ rangement à part (store, sauvegarde)
import { store, startCricket, archiveCk, startGame, ckState, exportBackup, deletePlayer, currentState } from '../src/ui/store.js';
import { parseBackup } from '../src/data/backup.js';
import { playerStats } from '../src/engine/stats.js';

test('Cricket rangé à part : jamais dans les parties X01, une seule partie en cours, sauvegarde et suppression d’un joueur', () => {
  Object.assign(store, { players: [{ id: 'A', name: 'A', avatar: { kind: 'initials', color: 0 } }, { id: 'B', name: 'B', avatar: { kind: 'initials', color: 1 } }],
    games: [], ckGames: [], current: null, ck: null, soiree: null, lastSetup: null, maquette: true });
  startCricket({ players: ['A', 'B'], ckMode: 'sans', legsToWin: 1, shuffle: false });
  store.ck.darts = ds('T20 T19 T18  0 0 0  T17 T16 T15  0 0 0  S25 D25');
  assert.equal(ckState().winner, 0);
  assert.equal(store.lastSetup.game, 'cricket');
  archiveCk(false);
  assert.equal(store.ckGames.length, 1); assert.equal(store.games.length, 0); assert.equal(store.ck, null);
  assert.equal(playerStats(store.games, 'A').played, 0, 'les stats X01 ne voient pas le Cricket');
  // Lancer un Cricket puis un X01 : le Cricket entamé est rangé, abandonné.
  startCricket({ players: ['A', 'B'], ckMode: 'points', legsToWin: 1, shuffle: false });
  store.ck.darts = ds('T20');
  startGame({ players: ['A', 'B'], startScore: 501, outMode: 'double', legsToWin: 1, shuffle: false });
  assert.equal(store.ck, null); assert.ok(currentState());
  assert.equal(store.ckGames.length, 2); assert.ok(store.ckGames[0].abandoned);
  // Sauvegarde : les parties de Cricket y sont et se relisent.
  const b = parseBackup(JSON.stringify(exportBackup('test')));
  assert.equal(b.games.filter(g => g.config.game === 'cricket').length, 2);
  // Suppression d'un joueur : ses parties de Cricket sont anonymisées comme les autres.
  store.current = null;
  assert.ok(deletePlayer('B'));
  assert.ok(store.ckGames.every(g => !g.config.players.includes('B')));
  assert.ok(store.ckGames.every(g => g.config.game === 'cricket'));
});
