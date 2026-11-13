// Lot 7.8 (maquette de la refonte) : pire volée sans les bust, taux de triples, tableau de bord d'une soirée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { playerStats } from '../src/engine/stats.js';
import { soireeModel } from '../src/engine/soiree.js';
import { CHANGELOG } from '../src/ui/changelog.js';

const cfg = (players, startScore = 301) => ({ startScore, outMode: 'double', legsToWin: 1, players });
// 301 double : A 180 → 121 ; B 1 1 1 (3) ; A 20 20 T20 = 100 → 21 ; B 20 20 20 ; A 20 → 1 : bust ; B 5 5 5 ; A 1 D10.
const G1 = { id: 'g1', startedAt: 1000, soiree: 's', config: cfg(['A', 'B']), darts: ds('T20 T20 T20  S1 S1 S1  S20 S20 T20  S20 S20 S20  S20  S5 S5 S5  S1 D10'),
  drinks: { B: [{ t: 1, at: 2 }, { t: 2, at: 8 }] } };
const G2 = { id: 'g2', startedAt: 5000, soiree: 's', config: cfg(['B', 'A']), darts: ds('T20 T20 T20  S1 S1 S1  T20 T11 D14') };

test('pire volée : ni les bust ni les finitions ; taux de triples', () => {
  const a = playerStats([G1], 'A');
  assert.equal(a.worstVisit, 100, 'le bust (20 → 1) ne compte pas, la finition non plus');
  assert.equal(a.busts, 1);
  assert.deepEqual(a.perGame.map(r => r.worst), [100]);
  // A : 7 fléchettes (T20 T20 T20, 20 20 T20, 20, 1 D10 = 3 + 3 + 1 + 2 = 9), triples : 4.
  assert.equal(a.darts, 9);
  assert.equal(a.triples, 4);
  assert.equal(a.tripleRate, 4 / 9);
  assert.equal(playerStats([G1], 'B').worstVisit, 3);
});

test('tableau de bord d’une soirée : classement, faits marquants, parties', () => {
  const m = soireeModel([G2, G1], id => ({ A: 'Alpha', B: 'Bravo' }[id]));
  assert.equal(m.games, 2);
  assert.equal(m.start, 1000);
  assert.equal(m.drinks, 2);
  assert.deepEqual(m.rows.map(r => [r.played, r.won]), [[2, 1], [2, 1]]);
  assert.equal(m.rows.reduce((n, r) => n + r.won, 0), 2, 'une victoire par partie');
  const hl = Object.fromEntries(m.highlights.map(h => [h.key, h]));
  assert.equal(hl.best.value, '180');
  assert.equal(hl.worst.value, '3', 'la pire volée de la soirée (B, 1 1 1), sans le bust de A');
  assert.equal(hl.worst.name, 'Bravo');
  assert.equal(hl.busts.name, 'Alpha');
  assert.equal(hl.drinks.value, 'x2');
  assert.deepEqual(m.list.map(x => x.id), ['g2', 'g1'], 'de la plus récente à la plus ancienne');
});

test('rapport de soirée en 3 feuilles : chronologie, verres, qui bat qui, secteurs, trophées', () => {
  const m = soireeModel([G2, G1], id => ({ A: 'Alpha', B: 'Bravo' }[id]));
  assert.deepEqual(m.timeline.map(t => [t.id, t.n]), [['g1', 1], ['g2', 2]], 'dans l’ordre du soir');
  const [t1, t2] = m.timeline;
  assert.equal(t1.winner, 'A'); assert.deepEqual(t1.last, ['B'], 'le dernier paie sa tournée');
  assert.equal(t2.winner, 'B'); assert.deepEqual(t2.last, ['A']);
  assert.equal(t1.end, 5000, 'sans fin enregistrée : jusqu’à la partie suivante');
  // A dans g1 : 180 + 100 + bust (0) + 21 = 301 points en 9 fléchettes.
  assert.equal(t1.avg.A, 301 / 9 * 3);
  assert.deepEqual(m.drinkTimes, { A: [], B: [1, 2] });
  assert.deepEqual(m.versus, { A: { B: 1 }, B: { A: 1 } });
  assert.deepEqual(m.together, { A: { B: 2 }, B: { A: 2 } });
  assert.equal(m.sectors.A[20], 7, 'A : T20 ×3, 20 20 T20, 20 → sept fléchettes dans le 20');
  assert.equal(m.sectors.A[10], 1); assert.equal(m.sectors.A.bull, 0);
  assert.ok(m.spread.A > 0 && m.spread.B > 0);
  const tr = Object.fromEntries(m.trophies.map(t => [t.key, t]));
  assert.equal(tr.best.value, '180'); assert.equal(tr.best.detail, 'partie 1');
  assert.equal(tr.worst.name, 'Bravo'); assert.equal(tr.worst.value, '3 points');
  assert.equal(tr.drinks.value, 'x2 verres');
  assert.ok(tr.king && tr.regular && tr.busts);
});

test('nouveautés : une entrée par version, de la plus récente à la plus ancienne', () => {
  const vs = CHANGELOG.map(e => e.v);
  assert.equal(new Set(vs).size, vs.length);
  const num = v => v.split('.').reduce((n, x) => n * 1000 + Number(x), 0);
  for (let i = 1; i < vs.length; i++) assert.ok(num(vs[i - 1]) > num(vs[i]), `${vs[i - 1]} avant ${vs[i]}`);
  for (const e of CHANGELOG) assert.ok(e.items.length && e.title, e.v);
});
