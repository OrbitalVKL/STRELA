// Lot 7 : jouer jusqu'au bout (moteur X01), classement, joueur en tête, le dernier qui paie sa tournée, célébrations
// des nuls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds, cfg } from './helpers.js';
import { computeState, normalizeConfig, throwDart, EVENTS, STATUS, OUT_SINGLE } from '../src/engine/x01.js';
import { standings, leader, lastPlaces, flop } from '../src/engine/ranking.js';

// 301 sortie simple : T20 T20 T20 S20 S20 S1 (= 241, reste 60) puis T20 (= finition depuis 60).
const three = (over = {}) => cfg({ startScore: 301, outMode: OUT_SINGLE, players: ['A', 'B', 'C'], ...over });
const V = { big: 'T20 T20 T20', mid: 'S20 S20 S1', miss: '0 0 0' };

test('configuration : playOn gardé seulement s’il est vrai et à 3 joueurs ou plus', () => {
  assert.equal(normalizeConfig(three({ playOn: true })).playOn, true);
  assert.ok(!('playOn' in normalizeConfig(three())));
  assert.ok(!('playOn' in normalizeConfig(three({ playOn: false }))));
  assert.ok(!('playOn' in normalizeConfig(cfg({ playOn: true }))), 'à 2 joueurs, le second est forcément dernier');
});

test('sans jouer jusqu’au bout : la partie s’arrête au premier qui finit', () => {
  const darts = ds(`${V.big} ${V.miss} ${V.miss}  T20 T20 S1`);
  const s = computeState(three(), darts);
  assert.equal(s.status, STATUS.FINISHED);
  assert.equal(s.winner, 0);
  assert.deepEqual(s.finishOrder, [0]);
  assert.equal(s.placing, false);
  assert.deepEqual(standings(s).map(r => [r.player, r.place]), [[0, 1], [1, 2], [2, 2]], 'B et C à égalité (301)');
  assert.deepEqual(lastPlaces(s), [1, 2], 'ils partagent la tournée');
});

test('jouer jusqu’au bout : les autres finissent, le finisseur est sauté, le dernier reste', () => {
  const c = three({ playOn: true });
  // Tour 1 : A 180 (121), B 41 (260), C 180 (121). Tour 2 : A 41 (80), B 0, C 41 (80). Tour 3 : A T20 S20 → finit.
  let darts = ds(`${V.big} ${V.mid} ${V.big}  ${V.mid} ${V.miss} ${V.mid}  T20 S20`);
  let s = computeState(c, darts);
  assert.equal(s.lastEvent, EVENTS.PLACED);
  assert.equal(s.status, STATUS.PLAYING, 'la partie continue');
  assert.equal(s.winner, 0);
  assert.equal(s.placing, true);
  assert.deepEqual(s.finishOrder, [0]);
  assert.equal(s.currentPlayer, 1);
  assert.equal(leader(s), null, 'plus de « en tête » une fois la partie gagnée');
  // B rate, C finit (2e) : B reste seul → partie finie, B dernier.
  darts = [...darts, ...ds(`${V.miss}  T20 S20`)];
  s = computeState(c, darts);
  assert.equal(s.status, STATUS.FINISHED);
  assert.equal(s.lastEvent, EVENTS.MATCH_WON);
  assert.deepEqual(s.finishOrder, [0, 2, 1]);
  assert.deepEqual(standings(s).map(r => [r.player, r.place]), [[0, 1], [2, 2], [1, 3]]);
  assert.deepEqual(lastPlaces(s), [1]);
  assert.equal(s.legsWon[0], 1);
  assert.equal(s.legsWon[2], 0, 'les places ne donnent pas de manche');
  assert.ok(s.legs[0].finalRemaining, 'restes finaux gardés à la vraie fin');
  // Plus rien n'est accepté ; ANNULER rouvre la partie.
  assert.equal(throwDart(c, darts, { segment: 20, multiplier: 1 }).ok, false);
  assert.equal(computeState(c, darts.slice(0, -1)).status, STATUS.PLAYING);
});

test('jouer jusqu’au bout à 4 : on saute chaque joueur fini', () => {
  const c = cfg({ startScore: 301, outMode: OUT_SINGLE, players: ['A', 'B', 'C', 'D'], playOn: true });
  // Tour 1 : A, B, C 180 ; D 0. Tour 2 : A 41, B 41, C 41, D 0. Tour 3 : A finit (T20 S20 = 80).
  const t1 = `${V.big} ${V.big} ${V.big} ${V.miss}`;
  const t2 = `${V.mid} ${V.mid} ${V.mid} ${V.miss}`;
  let s = computeState(c, ds(`${t1} ${t2} T20 S20`));
  assert.equal(s.currentPlayer, 1);
  s = computeState(c, ds(`${t1} ${t2} T20 S20  T20 S20`));
  assert.deepEqual(s.finishOrder, [0, 1]);
  assert.equal(s.currentPlayer, 2);
  s = computeState(c, ds(`${t1} ${t2} T20 S20  T20 S20  ${V.miss}  ${V.miss}`));
  assert.equal(s.currentPlayer, 2, 'après D, retour à C (A et B sautés)');
});

test('plusieurs manches : jouer jusqu’au bout seulement après la manche qui donne la partie', () => {
  const c = three({ playOn: true, legsToWin: 2 });
  const leg1 = `${V.big} ${V.mid} ${V.mid}  ${V.mid} ${V.miss} ${V.miss}  T20 S20`; // A gagne la manche 1
  const s1 = computeState(c, ds(leg1));
  assert.equal(s1.lastEvent, EVENTS.LEG_WON);
  assert.equal(s1.placing, false);
});

test('en tête : manches puis reste ; personne au départ ni en cas d’égalité', () => {
  const c = three();
  assert.equal(leader(computeState(c, [])), null);
  assert.equal(leader(computeState(c, ds('T20'))), 0);
  assert.equal(leader(computeState(c, ds(`${V.big} ${V.big}`))), null, 'A et B à égalité');
  assert.equal(leader(computeState(c, ds(`S20 S20 S20  ${V.big}  S1`))), 1, 'B plus bas');
  assert.equal(leader(computeState(cfg({ players: ['A'] }), ds('T20'))), null, 'solo');
});

test('célébrations des nuls : 0, sous 20 (lot 7.5), bust, série', () => {
  const c = cfg({ startScore: 501, players: ['A', 'B'] });
  assert.deepEqual(flop(computeState(c, ds('0 0 0'))), { kind: 'zero', value: 0 });
  assert.deepEqual(flop(computeState(c, ds('S1 S2 S3'))), { kind: 'low', value: 6 });
  assert.deepEqual(flop(computeState(c, ds('S5 S5 S5'))), { kind: 'low', value: 15 }, '15 : moquerie (lot 7.5 : sous 20)');
  assert.equal(flop(computeState(c, ds('S10 S5 S5'))), null, '20 : rien');
  assert.equal(flop(computeState(c, ds('S1 S2'))), null, 'volée pas finie');
  // A : 3 volées sous 20 d'affilée (B joue bien) → série à la 3e.
  const a3 = 'S5 S5 S5  T20 T20 T20  S1 S1 S1  T20 T20 T20  S2 S2 S2';
  assert.deepEqual(flop(computeState(c, ds(a3))), { kind: 'serie', value: 3 });
  // Bust (sortie double, reste 1 interdit) ; près de la fin, peu de points ne compte pas.
  const near = cfg({ startScore: 301 });
  const to41 = 'T20 T20 T20  0 0 0  T20 S20 0  0 0 0'; // A : 301 → 121 → 41
  assert.deepEqual(flop(computeState(near, ds(`${to41} S20 S20`))), { kind: 'bust', value: 41 });
  assert.equal(flop(computeState(near, ds(`${to41} S1 S2 S3`))), null, 'reste 41 : 6 points, rien');
  assert.deepEqual(flop(computeState(near, ds(`${to41} 0 0 0`))), { kind: 'zero', value: 0 });
});
