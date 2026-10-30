import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { playerStats, playerSummary, inPeriod, gameWinner, gameState } from '../src/engine/stats.js';
import { computeState } from '../src/engine/x01.js';
import { ds } from './helpers.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 30, 20);
const game = (id, players, notation, over = {}) => ({
  id, startedAt: NOW - (over.daysAgo ?? 0) * DAY, abandoned: !!over.abandoned,
  config: { startScore: over.startScore ?? 301, outMode: over.outMode ?? 'double', legsToWin: over.legsToWin ?? 1, players },
  darts: ds(notation),
});

// A gagne en 6 fléchettes : 180 (reste 121), B marque 60, puis A finit 121 par T20 T11 D14.
const G1 = game('g1', ['A', 'B'], 'T20 T20 T20  S20 S20 S20  T20 T11 D14');
// B gagne : A fait un bust à 32 (S20 S16), B finit 41 (S9 D16).
const G2 = game('g2', ['A', 'B'], 'T20 T20 T20  T20 T20 T20  T19 S20 S12  T20 S19 S1  S20 S16  S9 D16', { daysAgo: 10 });
const G3 = game('g3', ['A', 'C'], 'T20 S20', { daysAgo: 40, abandoned: true });

describe('statistiques', () => {
  test('vainqueur d’une partie, partie abandonnée sans vainqueur', () => {
    assert.equal(gameWinner(G1), 'A');
    assert.equal(gameWinner(G2), 'B');
    assert.equal(gameWinner(G3), null);
    assert.equal(gameState(G1).status, 'finished');
  });

  test('moyenne sur 3 fléchettes, bust compté 0, 9 premières', () => {
    const a = playerStats([G1], 'A');
    assert.equal(a.darts, 6);
    assert.equal(a.points, 301);
    assert.equal(a.average.toFixed(2), (301 / 6 * 3).toFixed(2));
    const a2 = playerStats([G2], 'A');
    // A : 180 + 89 (T19 S20 S12) + bust (compté 0) sur 8 fléchettes
    assert.equal(a2.points, 180 + 89);
    assert.equal(a2.darts, 3 + 3 + 2);
    assert.equal(a2.first9.toFixed(2), ((180 + 89) / 8 * 3).toFixed(2));
  });

  test('100+ / 140+ / 180, meilleure finition, manche la plus courte', () => {
    const a = playerStats([G1, G2], 'A');
    assert.equal(a.max, 2);
    assert.equal(a.ton40, 0);
    assert.equal(a.bestFinish, 121);
    assert.equal(a.shortestLeg, 6);
    const b = playerStats([G1, G2], 'B');
    assert.equal(b.max, 1);
    assert.equal(b.ton, 0);
    assert.equal(b.bestFinish, 41);
  });

  test('taux de finition et de doubles', () => {
    const a = playerStats([G1, G2], 'A');
    // volées commencées sur une finition jouable : 121 (G1, gagnée), 121 et 32 (G2 : ratée, bust)
    assert.equal(a.checkoutChances, 3);
    assert.equal(a.checkouts, 1);
    // fléchettes lancées quand une seule pouvait finir : D14 (28) dans G1 ; à 32 puis à 12 dans G2
    assert.equal(a.doubleDarts, 3);
    assert.equal(a.doubleHits, 1);
  });

  test('victoires, face-à-face, période', () => {
    const all = [G1, G2, G3];
    const a = playerStats(all, 'A');
    assert.equal(a.played, 3);
    assert.equal(a.won, 1);
    assert.deepEqual(a.headToHead.B, { played: 2, won: 1, lost: 1 });
    assert.equal(a.headToHead.C, undefined, 'partie abandonnée : pas de face-à-face');
    assert.equal(inPeriod(all, '7j', NOW).length, 1);
    assert.equal(inPeriod(all, '30j', NOW).length, 2);
    assert.equal(inPeriod(all, 'tout', NOW).length, 3);
    // la partie abandonnée n'a aucune volée close : pas de point sur la courbe
    assert.equal(a.timeline.length, 2);
    assert.ok(a.timeline[0].at < a.timeline[1].at, 'évolution dans l’ordre chronologique');
  });

  test('carte des segments', () => {
    const a = playerStats([G1], 'A');
    assert.equal(a.segments.total, 6);
    assert.equal(a.segments[20][2], 4);
    assert.equal(a.segments[11][2], 1);
    assert.equal(a.segments[14][1], 1);
  });

  test('résumé d’un joueur dans une manche', () => {
    const s = computeState(G1.config, G1.darts);
    const sum = playerSummary(s, 0, 1);
    assert.equal(sum.darts, 6);
    assert.equal(sum.best, 180);
    assert.equal(sum.bestFinish, 121);
    assert.equal(sum.legsWon, 1);
  });
});
