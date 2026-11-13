// Lot 9 : handicap (un score de départ par joueur), la moyenne au fil des verres, records personnels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { computeState, normalizeConfig } from '../src/engine/x01.js';
import { averageByDrinks } from '../src/engine/alcohol.js';
import { playerRecords, isVisitRecord, gameRecords } from '../src/engine/records.js';

test('handicap : chacun part de son score, à chaque manche ; sans écart, rien n’est gardé', () => {
  const cfg = { startScore: 301, outMode: 'single', legsToWin: 2, players: ['A', 'B'], starts: [301, 101 + 200] };
  assert.equal(normalizeConfig(cfg).starts, undefined, 'mêmes scores : pas de handicap');
  const h = { startScore: 301, outMode: 'single', legsToWin: 2, players: ['A', 'B'], starts: [501, 301] };
  let s = computeState(h, []);
  assert.deepEqual(s.remaining, [501, 301]);
  // B finit 301 en 6 volées de T20 T20 T20 ? Non : 180 + 121 (T20 T20 1). A joue 3 volées de 1.
  s = computeState(h, ds('S1 S1 S1  T20 T20 T20  S1 S1 S1  T20 T20 S1'));
  assert.equal(s.legsWon[1], 1, 'B gagne la manche 1 depuis 301');
  assert.deepEqual(s.remaining, [501, 301], 'manche 2 : chacun repart de son score');
  assert.throws(() => normalizeConfig({ ...h, starts: [501] }));
  assert.throws(() => normalizeConfig({ ...h, starts: [501, 250] }));
});

test('la moyenne au fil des verres : chaque volée à son niveau (soirée comprise, pinte = 2)', () => {
  const config = { startScore: 501, outMode: 'double', legsToWin: 1, players: ['A', 'B'] };
  // A : volée 1 (60) à jeun ; pinte avant la volée 2 (à 6 fléchettes jouées) → volées 2 (120) et 3 (30) à 2 verres.
  const darts = ds('S20 S20 S20  S1 S1 S1  T20 T20 S20  S1 S1 S1  S10 S10 S10');
  const game = { config, darts, drinks: { A: [{ t: 1, at: 6, v: 0.5 }] } };
  const lv = averageByDrinks([{ state: computeState(config, darts), game }], 'A');
  assert.equal(lv.levels[0].darts, 3); assert.equal(lv.levels[0].average, 60);
  assert.equal(lv.levels[2].darts, 6); assert.equal(lv.levels[2].average, (140 + 30) / 6 * 3);
  assert.equal(lv.levels[1].darts, 0);
  assert.equal(lv.best, null, 'moins de 9 fléchettes à chaque niveau : pas de meilleur niveau');
  // Une partie suivante de la soirée commence à 2 verres (drinksBefore) ; 5 verres et plus vont ensemble.
  const g2 = { config, darts: ds('T20 T20 T20  S1 S1 S1  T20 T20 T20'), drinksBefore: { A: 7 } };
  const lv2 = averageByDrinks([{ state: computeState(config, darts), game }, { state: computeState(config, g2.darts), game: g2 }], 'A');
  assert.equal(lv2.levels[5].darts, 6); assert.equal(lv2.levels[5].average, 180);
  assert.equal(lv2.levels[5].label, '5 verres et +');
});

test('records : meilleure volée, moyenne, manche la plus courte, finition ; rien à la première partie', () => {
  const config = { startScore: 301, outMode: 'single', legsToWin: 1, players: ['A', 'B'] };
  // Partie 1 : A fait 140, 140, puis finit 21 (S1 S20) : 8 fléchettes.
  const g1 = { id: 'g1', config, darts: ds('T20 T20 S20  S1 S1 S1  T20 T20 S20  S1 S1 S1  S1 S20'), abandoned: false };
  const rec = playerRecords([g1], 'A');
  assert.equal(rec.games, 1); assert.equal(rec.bestVisit, 140); assert.equal(rec.shortestLeg, 8);
  assert.equal(rec.bestFinish, 21);
  assert.equal(Math.round(rec.bestAverage * 10), Math.round(301 / 8 * 3 * 10));
  assert.equal(isVisitRecord(rec, { scored: 180, bust: false }), true);
  assert.equal(isVisitRecord(rec, { scored: 140, bust: false }), false, 'égaler n’est pas battre');
  assert.equal(isVisitRecord(playerRecords([], 'A'), { scored: 180, bust: false }), false, 'pas de record sans partie d’avant');
  // Partie 2 : A fait 180 puis finit 121 en 6 fléchettes.
  const s2 = computeState(config, ds('T20 T20 T20  S1 S1 S1  T20 T20 S1'));
  const got = gameRecords(rec, s2, 0).map(r => r.key);
  assert.deepEqual(got, ['visit', 'average', 'leg', 'finish']);
  assert.deepEqual(gameRecords(rec, s2, 1), [], 'B n’avait pas de partie : rien');
});
