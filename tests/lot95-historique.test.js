// Lot 9.5 (A3) : historique fléchette par fléchette d'un X01 solo cohérent avec le score.
// Partie de Guillaume du 23/11 à 21:57 (501 sortie simple) : reste 40 après V10, bust à V11 (18, 20, T15), puis la
// carte de la séance montrait « V12 : T20, 20, 20 » (impossible depuis 40). Cause : la carte regroupait les fléchettes
// 3 par 3, alors que la T20 depuis 40 est un bust à la 1re fléchette (la volée s'arrête là) ; la victoire vient à la
// volée suivante en 2 fléchettes (20, 20). Le moteur, lui, avait juste : 36 fléchettes, 501 points, 41,8 de moyenne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { sessionVolleys, sessionVolleysSafe, analyzeGame, trainingState } from '../src/engine/training.js';

const rec = darts => ({ id: 't-a3', startedAt: 1, endedAt: 2, player: 'p', mode: 'jeu', exercise: 'x01', game: { startScore: 501, outMode: 'single', legs: 1 }, darts });
const PARTIE = 'S20 T18 S12  S12 S20 0  S8 S1 D20  S20 S20 D20  S20 S12 0  S5 S9 D1  S18 S5 T5  T20 S1 S1  S1 S12 S12  S1 S20 S20  S18 S20 T15  T20 S20 S20';
const pts = v => v.darts.map(d => d.segment * d.multiplier);

test('A3 : la partie du 23/11 se rejoue telle quelle (reste 40, bust à V11, bust T20 à V12, victoire à V13)', () => {
  const r = rec(ds(PARTIE));
  assert.equal(r.darts.length, 36);
  // L'ancienne carte (3 par 3) montrait 12 volées, dont « T20 20 20 » : c'est ce regroupement qui était faux.
  const naive = []; r.darts.forEach((d, i) => { if (i % 3 === 0) naive.push([]); naive[naive.length - 1].push(d.segment * d.multiplier); });
  assert.deepEqual(naive[11], [60, 20, 20]);
  const v = sessionVolleys(r);
  assert.equal(v.length, 13);
  assert.equal(v[9].rest, 40, 'reste 40 après V10');
  assert.deepEqual(pts(v[10]), [18, 20, 45]); assert.equal(v[10].bust, true); assert.equal(v[10].total, 0); assert.equal(v[10].rest, 40);
  assert.deepEqual(pts(v[11]), [60]); assert.equal(v[11].bust, true); assert.equal(v[11].rest, 40);
  assert.deepEqual(pts(v[12]), [20, 20]); assert.equal(v[12].finish, true); assert.equal(v[12].rest, 0);
  // Une seule source : toutes les fléchettes sont dans une volée, dans l'ordre.
  assert.deepEqual(v.flatMap(x => x.darts), r.darts);
  // Totaux, moyenne, meilleure volée, bust : recalculés depuis les mêmes volées.
  const a = analyzeGame(r);
  assert.equal(v.reduce((k, x) => k + x.total, 0), 501);
  assert.equal(Math.round(a.extra.average * 10) / 10, 41.8);
  assert.equal(a.extra.bestVisit, Math.max(...v.map(x => x.total)));
  assert.equal(a.extra.busts, v.filter(x => x.bust).length);
  assert.equal(trainingState(r, r.darts).done, true);
});

test('A3 : bust en milieu de volée, victoire à la 1re et à la 2e fléchette', () => {
  const g = darts => ({ ...rec(ds(darts)), game: { startScore: 301, outMode: 'single', legs: 1 } });
  // 301 − 180 = 121 ; T20 T20 = 120 (reste 1) puis T20 : bust à la 3e fléchette.
  let v = sessionVolleys(g('T20 T20 T20  T20 T20 T20'));
  assert.equal(v[1].bust, true); assert.equal(v[1].darts.length, 3); assert.equal(v[1].total, 0); assert.equal(v[1].rest, 121);
  // Reste 60 ; S20 puis T20 : bust à la 2e fléchette, la volée s'arrête là ; puis S20 D20 : victoire à la 2e.
  v = sessionVolleys(g('T20 T20 T20  T20 S1 0  S20 T20  S20 D20'));
  assert.deepEqual(v.map(x => x.darts.length), [3, 3, 2, 2]);
  assert.equal(v[2].bust, true); assert.equal(v[2].rest, 60);
  assert.equal(v[3].finish, true); assert.equal(v[3].rest, 0); assert.equal(v[3].total, 60);
  // Victoire à la 1re fléchette d'une volée : reste 60, T20.
  v = sessionVolleys(g('T20 T20 T20  T20 S1 0  T20'));
  assert.equal(v.length, 3); assert.equal(v[2].darts.length, 1); assert.equal(v[2].finish, true); assert.equal(v[2].rest, 0);
  // Sortie double : reste 2, D20 → bust à la 1re fléchette ; puis D1 gagne.
  const dbl = d => ({ ...rec(ds(d)), game: { startScore: 301, outMode: 'double', legs: 1 } });
  v = sessionVolleys(dbl('T20 T20 T20  T20 S20 S1  S19 S19 0  D20  D1'));
  assert.deepEqual(v.map(x => x.darts.length), [3, 3, 3, 1, 1]);
  assert.equal(v[2].rest, 2);
  assert.equal(v[3].bust, true); assert.equal(v[3].rest, 2);
  assert.equal(v[4].finish, true); assert.equal(v[4].rest, 0);
  // Volée en cours : marquée ouverte, reste provisoire.
  v = sessionVolleys(dbl('T20 T20 T20  T20'));
  assert.equal(v[1].open, true); assert.equal(v[1].rest, 61);
});

test('A3 : annuler puis ressaisir ne laisse aucune trace ; la meilleure volée = le plus grand total affiché', () => {
  const base = ds('T20 T20 T20  S20');
  const undone = [...base.slice(0, -1), ...ds('S5')];
  const v = sessionVolleys(rec(undone));
  assert.deepEqual(v.flatMap(x => x.darts), undone);
  assert.deepEqual(pts(v[1]), [5]); assert.equal(v[1].open, true);
  const r = rec(ds('S20 T18 S12  T20 T20 S20  S1 S1 S1'));
  assert.equal(analyzeGame(r).extra.bestVisit, Math.max(...sessionVolleys(r).map(x => x.total)));
});

test('A3 : plusieurs manches, Cricket, exercices et séance abîmée', () => {
  const two = { ...rec(ds('T20 T20 T20  T20 T20 S1  T20 T20 T20  T20 T20 S1')), game: { startScore: 301, outMode: 'single', legs: 2 } };
  const v = sessionVolleys(two);
  assert.deepEqual(v.map(x => `${x.leg}.${x.n}`), ['1.1', '1.2', '2.1', '2.2']);
  // Cricket : la volée qui ferme tout s'arrête à la fléchette gagnante.
  const ck = { id: 'c', startedAt: 1, player: 'p', mode: 'jeu', exercise: 'cricket', game: { legs: 1 }, darts: ds('T20 T19 T18  T17 T16 T15  50 25') };
  const cv = sessionVolleys(ck);
  assert.equal(cv.length, 3); assert.equal(cv[2].finish, true); assert.equal(cv[0].total, 9);
  // Exercice : volées comptées depuis le début de chaque série.
  const ex = { id: 'e', startedAt: 1, player: 'p', mode: 'libre', exercise: 'libre', blocks: [{ s: 20, z: 't', n: 4 }, { s: 19, z: 'any', n: 3 }], darts: ds('T20 S20 S1 S5  S19 S19 S3') };
  const ev = sessionVolleys(ex);
  assert.deepEqual(ev.map(x => x.darts.length), [3, 1, 3]);
  assert.deepEqual(ev[2].targets[0], { s: 19, z: 'any' });
  // Fléchette après la victoire (donnée corrompue) : pas d'exception, historique marqué incomplet, rien de perdu.
  const bad = { ...rec(ds('T20 T20 T20  T20 T20 S1  S5')), game: { startScore: 301, outMode: 'single', legs: 1 } };
  const s = sessionVolleysSafe(bad);
  assert.equal(s.broken, true);
  assert.equal(s.volleys.flatMap(x => x.darts).length, 7);
});
