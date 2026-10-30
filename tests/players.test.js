import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deletePlayer, deletionImpact, isDeletedId, deletedId } from '../src/engine/players.js';
import { playerStats, gameWinner, gameState } from '../src/engine/stats.js';
import { computeState } from '../src/engine/x01.js';
import { ds } from './helpers.js';

const NOW = Date.UTC(2026, 9, 30, 20);
const game = (id, players, notation, over = {}) => ({
  id, startedAt: NOW - (over.daysAgo ?? 0) * 86400000, abandoned: !!over.abandoned,
  config: { startScore: 301, outMode: 'double', legsToWin: 1, players },
  darts: ds(notation),
});
const PLAYERS = ['A', 'B', 'C'].map(id => ({ id, name: id, avatar: { kind: 'initials', color: 0 }, archived: false }));
// G1 : A bat B. G2 : B bat A (bust de A). G3 : A, B, C — B gagne. G4 : B seul. G5 : C bat B.
const G1 = game('g1', ['A', 'B'], 'T20 T20 T20  S20 S20 S20  T20 T11 D14');
const G2 = game('g2', ['A', 'B'], 'T20 T20 T20  T20 T20 T20  T19 S20 S12  T20 S19 S1  S20 S16  S9 D16', { daysAgo: 2 });
const G3 = game('g3', ['A', 'B', 'C'], 'S20 S20 S20  T20 T20 T20  S1 S1 S1  S20 S20 S20  T20 T11 D14', { daysAgo: 3 });
const G4 = game('g4', ['B'], 'T20 T20 T20  T20 T11 D14', { daysAgo: 4 });
const G5 = game('g5', ['C', 'B'], 'T20 T20 T20  S1 S1 S1  T20 T11 D14', { daysAgo: 5 });
const GAMES = [G1, G2, G3, G4, G5];

describe('suppression d’un joueur', () => {
  test('impact : parties gardées (avec d’autres) et effacées (seul)', () => {
    assert.deepEqual(deletionImpact(GAMES, 'B'), { kept: ['g1', 'g2', 'g3', 'g5'], removed: ['g4'] });
    assert.deepEqual(deletionImpact(GAMES, 'A'), { kept: ['g1', 'g2', 'g3'], removed: [] });
  });

  test('le joueur disparaît, ses parties seul aussi ; les autres parties sont anonymisées ; rien n’est modifié en place', () => {
    const before = JSON.stringify(GAMES);
    const r = deletePlayer(PLAYERS, GAMES, 'B');
    assert.deepEqual(r.players.map(p => p.id), ['A', 'C']);
    assert.deepEqual(r.games.map(g => g.id), ['g1', 'g2', 'g3', 'g5']);
    assert.deepEqual(r.games.find(g => g.id === 'g1').config.players, ['A', '~1']);
    assert.deepEqual(r.games.find(g => g.id === 'g5').config.players, ['C', '~1']);
    assert.ok(r.games.every(g => !g.config.players.includes('B')));
    assert.equal(JSON.stringify(GAMES), before, 'entrées intactes');
    assert.equal(PLAYERS.length, 3);
    // volées et fléchettes intactes, la partie se recalcule toujours (identifiants distincts)
    for (const g of r.games) assert.deepEqual(computeState(g.config, g.darts).legsWon, gameState(GAMES.find(x => x.id === g.id)).legsWon);
    assert.ok(isDeletedId('~1') && !isDeletedId('B') && !isDeletedId(null));
    assert.equal(deletedId(2), '~2');
  });

  test('stats des autres : justes, sans le joueur supprimé dans les face-à-face', () => {
    const r = deletePlayer(PLAYERS, GAMES, 'B');
    for (const id of ['A', 'C']) {
      const before = playerStats(GAMES, id);
      const after = playerStats(r.games, id);
      for (const k of ['played', 'won', 'average', 'first9', 'darts', 'points', 'checkoutRate', 'doubleRate', 'bestFinish', 'shortestLeg', 'max', 'legsWon']) {
        assert.deepEqual(after[k], before[k], `${id} : ${k}`);
      }
      assert.deepEqual(after.segments, before.segments);
      assert.ok(before.headToHead.B, `${id} avait B en face-à-face`);
      assert.equal(after.headToHead.B, undefined);
      assert.ok(Object.keys(after.headToHead).every(k => !isDeletedId(k)), 'aucun « joueur supprimé » en face-à-face');
    }
    // A garde C en face-à-face (G3), avec le même bilan
    assert.deepEqual(playerStats(r.games, 'A').headToHead.C, playerStats(GAMES, 'A').headToHead.C);
    // une partie gagnée par le joueur supprimé reste perdue pour les autres
    assert.equal(gameWinner(r.games.find(g => g.id === 'g2')), '~1');
    assert.equal(playerStats(r.games, 'A').won, 1);
    // ses stats ont disparu : son ancien identifiant ne joue plus nulle part
    assert.equal(playerStats(r.games, 'B').played, 0);
  });

  test('deux joueurs supprimés dans la même partie ; partie sans plus aucun joueur connu effacée', () => {
    const one = deletePlayer(PLAYERS, GAMES, 'B');
    const two = deletePlayer(one.players, one.games, 'C');
    assert.deepEqual(two.games.find(g => g.id === 'g3').config.players, ['A', '~1', '~2']);
    assert.equal(two.games.some(g => g.id === 'g5'), false, 'g5 : C et B supprimés, plus personne');
    assert.deepEqual(two.removed, ['g5']);
    const s = computeState(two.games.find(g => g.id === 'g3').config, G3.darts);
    assert.equal(s.status, 'finished');
    assert.deepEqual(Object.keys(playerStats(two.games, 'A').headToHead), []);
  });
});
