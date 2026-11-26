// Lot 9.6 B : stats contextuelles (src/engine/evolution.js), chiffres calculés à la main.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { x01SoloMetrics, compareX01, summaryLine, tierOf, driftOf, targetSession, eveningForm, eveningText, versusOf, spreadText, X01_METRICS } from '../src/engine/evolution.js';

const d = (segment, multiplier = 1) => ({ segment, multiplier });
const MISS = d(0, 1);
const x01 = (darts, extra = {}) => ({ id: `x${Math.random()}`, startedAt: 1, endedAt: 2, player: 'p', mode: 'jeu', exercise: 'x01', game: { startScore: 301, outMode: 'double', legs: 1 }, darts, ...extra });
// 301 : 180 (reste 121), 41 (80), T20 puis 20 = bust (80), raté 20 20 (40), D20.
const GAME = x01([d(20, 3), d(20, 3), d(20, 3), d(20), d(20), d(1), d(20, 3), d(20), MISS, d(20), d(20), d(20, 2)]);

describe('X01 en solo : fiche Évolution', () => {
  test('chiffres d\'une partie', () => {
    const m = x01SoloMetrics(GAME);
    assert.equal(m.done, true);
    assert.equal(m.visits, 5);
    assert.equal(m.finishVisits, 5);
    assert.equal(m.finishDarts, 12);
    assert.equal(m.busts, 1);
    assert.ok(Math.abs(m.avg - 75.25) < 1e-9, `moyenne ${m.avg}`);
    assert.ok(Math.abs(m.avgNoBust - 90.3) < 1e-9);
    assert.ok(Math.abs(m.bustCost - 15.05) < 1e-9);
    assert.deepEqual(m.tiers, [0, 0, 3, 1]);
    assert.equal(m.off, 1);
    assert.ok(Math.abs(m.offRate - 1 / 12) < 1e-9);
    assert.ok(Math.abs(m.spread - Math.sqrt((93 ** 2 + 46 ** 2 + 47 ** 2) / 3)) < 1e-9);
    assert.ok(Math.abs(m.high - 110.5) < 1e-9, `au-dessus de 100 : ${m.high}`);
    assert.ok(Math.abs(m.low - 40) < 1e-9, `100 ou moins : ${m.low}`);
    assert.equal(m.finAtt, 2);
    assert.equal(m.finHits, 1);
    assert.equal(m.best, 180);
    assert.equal(m.worst, 40);
    assert.equal(spreadText(m.spread), 'tes volées varient de ±66 points');
  });
  test('paliers', () => {
    assert.deepEqual([0, 19, 20, 39, 40, 59, 60, 180].map(tierOf), [0, 0, 1, 1, 2, 2, 3, 3]);
  });
  test('partie arrêtée : pas de « pour finir »', () => {
    const m = x01SoloMetrics({ ...GAME, darts: GAME.darts.slice(0, 6), stopped: true });
    assert.equal(m.done, false);
    assert.equal(m.finishDarts, null);
    assert.equal(m.busts, 0);
  });
  test('comparaison aux parties précédentes et résumé', () => {
    const cur = { avg: 50, busts: 0, offRate: 0.2, spread: 10, finishVisits: 10 };
    const prev = [{ avg: 40, busts: 2, offRate: 0.1, spread: 10, finishVisits: 12 }, { avg: 42, busts: 2, offRate: 0.1, spread: 10.5, finishVisits: 12 }];
    const c = Object.fromEntries(compareX01(cur, prev).map(x => [x.k, x]));
    assert.equal(c.avg.ref, 41);
    assert.equal(c.avg.state, 'better');
    assert.equal(c.busts.state, 'better', 'moins de busts = mieux');
    assert.equal(c.offRate.state, 'worse');
    assert.equal(c.spread.state, 'same');
    assert.equal(c.finRate.state, null, 'sans référence');
    assert.equal(summaryLine(compareX01(cur, prev)), 'En progrès sur ta moyenne et le nombre de volées pour finir, en recul sur le hors cible.');
    assert.equal(summaryLine([]), '');
  });
  test('chaque chiffre a un libellé en clair et une explication', () => {
    for (const m of X01_METRICS) { assert.ok(m.label.length > 3 && !/\./.test(m.label), m.label); assert.match(m.info, /\.$/); }
  });
});

describe('exercices à cible', () => {
  // Cible : 20, tout le secteur ; fléchettes au pavé sous la cible (simples extérieurs → plus bas que le point visé ? non :
  // le 20 est en haut, « vers le bord » = vers le haut). Dérive mesurée avec des positions posées.
  const ser = (darts, extra = {}) => ({ id: `s${Math.random()}`, startedAt: 1, endedAt: 2, player: 'p', mode: 'libre', exercise: 'libre', blocks: [{ s: 20, z: 'any', n: darts.length }], darts, ...extra });
  test('dérive : sous la cible', () => {
    const low = Array.from({ length: 6 }, () => ({ segment: 20, multiplier: 1, ring: 'in', pos: [0, -0.35] }));
    const t = targetSession(ser(low));
    assert.ok(t.drift && t.drift.words, JSON.stringify(t.drift));
    assert.match(t.drift.text, /^Tu tires souvent sous la cible/);
    assert.equal(t.rate, 1);
  });
  test('secteurs comparés à la séance précédente du même exercice', () => {
    const a = ser([d(20), d(20), d(5)]);
    const b = ser([d(20), d(20), d(20)]);
    const t = targetSession(b, [a]);
    assert.equal(t.sectors[0].prev, 2 / 3);
    assert.equal(t.sectors[0].state, 'better');
    assert.equal(t.valueState, 'better');
    assert.equal(driftOf(null), null);
  });
});

describe('multijoueur', () => {
  test('forme du soir', () => {
    assert.equal(eveningForm(null, 40), null);
    const f = eveningForm(45.5, 40, 3);
    assert.equal(f.state, 'better');
    assert.equal(eveningText(f), 'Soir de forme : 5,5 points au-dessus de ta moyenne habituelle.');
    assert.equal(eveningText(eveningForm(40.4, 40)), 'Ce soir, tu joues à ton niveau habituel.');
  });
  test('chiffres comparables', () => {
    assert.deepEqual(versusOf({ played: 4, won: 1, average: 40, bestVisit: 100, busts: 2 }), { average: 40, bestVisit: 100, bustsPerGame: 0.5, winRate: 0.25, played: 4 });
  });
});
