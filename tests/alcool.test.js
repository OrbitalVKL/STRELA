// Lot 7 : compteur de verres et alcoolémie estimée (formule de Widmark simplifiée), enregistrement des verres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { bac, drinkTimes, formatBac, bacLevel, cleanDrinks, GRAMS_PER_DRINK, WEIGHT_KG, DIFFUSION, ELIMINATION } from '../src/engine/alcohol.js';
import { currentRecord, closedRecord } from '../src/data/db.js';
import { deletePlayer } from '../src/engine/players.js';

const H = 3600e3;
const ONE = GRAMS_PER_DRINK / (WEIGHT_KG * DIFFUSION);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('un verre ≈ 0,22 g/L, éliminé à 0,15 g/L par heure', () => {
  close(bac([0], 0), ONE);
  assert.equal(formatBac(bac([0], 0)), '0,22');
  close(bac([0], H), ONE - ELIMINATION);
  assert.equal(bac([0], 3 * H), 0, 'jamais négatif');
  assert.equal(bac([], 0), 0);
  assert.equal(bac([5 * H], 0), 0, 'un verre à venir ne compte pas');
});

test('plusieurs verres : l’élimination ne descend pas sous zéro entre deux verres', () => {
  close(bac([0, 0, 0], 0), 3 * ONE);
  close(bac([0, H], H), 2 * ONE - ELIMINATION);
  // Verre, 5 h sans rien (tout éliminé), puis un autre : on repart de zéro.
  close(bac([0, 5 * H], 5 * H), ONE);
});

test('verres sur 24 h, toutes parties confondues', () => {
  const now = 30 * H;
  const games = [{ drinks: { a: [now - H, now - 2 * H], b: [now] } }, { drinks: { a: [now - 25 * H] } }, {}, { drinks: null }];
  assert.deepEqual(drinkTimes(games, 'a', now), [now - 2 * H, now - H]);
  assert.deepEqual(drinkTimes(games, 'c', now), []);
});

test('niveaux affichés', () => {
  assert.equal(bacLevel(0), 'zero');
  assert.equal(bacLevel(0.1), 'ok');
  assert.equal(bacLevel(0.3), 'young');
  assert.equal(bacLevel(0.5), 'over');
});

test('enregistrement : champ facultatif, absent sans verre (aucune migration), nettoyé', () => {
  const g = { id: 'g1', startedAt: 1, config: {}, darts: [], validated: 0 };
  assert.ok(!('drinks' in currentRecord(g)));
  assert.ok(!('drinks' in currentRecord({ ...g, drinks: { a: [] } })));
  assert.deepEqual(currentRecord({ ...g, drinks: { a: [5, 'x'], b: 'bad' } }).drinks, { a: [5] });
  assert.deepEqual(closedRecord({ ...g, drinks: { a: [5] } }, false, 9).drinks, { a: [5] });
  assert.equal(cleanDrinks([1, 2]), null);
});

test('joueur supprimé : ses verres prennent son identifiant anonyme', () => {
  const games = [{ id: 'g', config: { players: ['a', 'b'] }, darts: [], drinks: { a: [1], b: [2] } }];
  const out = deletePlayer([{ id: 'a' }, { id: 'b' }], games, 'a');
  assert.deepEqual(out.games[0].drinks, { b: [2], '~0': [1] });
});

test('lot 7.1 : verres rangés dans l’historique de la partie (cumul par volée, verre pris pendant le tour)', async () => {
  const { drinksTimeline } = await import('../src/engine/alcohol.js');
  const { computeState } = await import('../src/engine/x01.js');
  const config = { startScore: 501, outMode: 'double', legsToWin: 1, players: ['a', 'b'] };
  // a : volée 0 (fléchettes 0-2), b : volée 1 (3-5), a : volée 2 (6-8), b : volée en cours (9-).
  const s = computeState(config, ds('T20 T20 T20  S1 S1 S1  S5 S5 S5  S20'));
  const drinks = {
    a: [{ t: 1, at: 1 }, { t: 2, at: 4 }, 7],          // pendant sa volée 0 ; pendant celle de b (→ sa volée 2) ; ancien format (→ dernière)
    b: [{ t: 3, at: 0 }, { t: 4, at: 10 }],           // avant sa première volée ; pendant sa volée en cours
  };
  const { byVisit, totals } = drinksTimeline(s, drinks, ['a', 'b']);
  assert.deepEqual(byVisit.get(0), { here: 1, total: 1, player: 0 });
  assert.deepEqual(byVisit.get(2), { here: 2, total: 3, player: 0 });
  assert.deepEqual(byVisit.get(1), { here: 1, total: 1, player: 1 });
  assert.deepEqual(byVisit.get('open'), { here: 1, total: 2, player: 1 });
  assert.deepEqual(totals, [3, 2]);
  assert.equal(drinksTimeline(s, null, ['a', 'b']).byVisit.size, 0);
  // Enregistrement : la place est gardée, l'ancien format aussi.
  assert.deepEqual(cleanDrinks({ a: [{ t: 5, at: 2 }, { t: 6 }, 7, { at: 3 }] }), { a: [{ t: 5, at: 2 }, { t: 6 }, 7] });
});
