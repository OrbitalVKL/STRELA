// Corriger une fléchette déjà jouée (lot 3, I) : src/engine/correct.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctDart, locateDart, visitStart, CORRECT_ERRORS } from '../src/engine/correct.js';
import { computeState } from '../src/engine/x01.js';
import { parseDart } from '../src/engine/darts.js';
import { ds, cfg } from './helpers.js';

const C = cfg({ startScore: 501 });
const P = s => parseDart(s);

test('correction simple dans une volée passée : la partie est recalculée, les suivantes ne bougent pas', () => {
  const darts = ds('T20 T20 T20  20 20 20  T20 S20 S20');
  const r = correctDart(C, darts, 1, P('T19')); // 2e fléchette de A : T20 → T19
  assert.equal(r.ok, true);
  assert.deepEqual(r.darts[1], { segment: 19, multiplier: 3 });
  assert.deepEqual(darts[1], P('T20'), 'liste d’origine intacte');
  assert.equal(r.after.remaining[0], 501 - 180 + 3 - 100);
  assert.deepEqual(r.effects.visit, [180, 177]);
  assert.deepEqual(r.effects.remaining, [221, 224]);
  assert.equal(r.effects.player, 0);
  assert.equal(r.effects.visitIdx, 0);
});

test('correction refusée : elle crée un bust qui coupe la volée (les fléchettes suivantes changeraient de volée)', () => {
  // A est à 41 ; sa volée « 1 D20 » finit la manche. Corriger le 1 en T20 ferait bust dès la 1re fléchette.
  const start = ds('T20 T20 T20  0 0 0  T20 T20 T20  0 0 0  T20 S20 S20  0 0 0');
  const s0 = computeState(C, start);
  assert.equal(s0.remaining[0], 41);
  const darts = [...start, ...ds('1 S20 S10')];
  const r = correctDart(C, darts, start.length, P('T20'));
  assert.equal(r.ok, false);
  assert.equal(r.error, CORRECT_ERRORS.CHANGES_FLOW);
  // La même fléchette corrigée sans bust (5 au lieu de 1) passe.
  assert.equal(correctDart(C, darts, start.length, P('5')).ok, true);
});

test('correction de la volée en cours', () => {
  const darts = ds('T20 T20 T20  20 20 20  T20 5');
  const s = computeState(C, darts);
  assert.equal(locateDart(s, 7).visitIdx, 'open');
  assert.equal(visitStart(s, 'open'), 6);
  const r = correctDart(C, darts, 7, P('T20'));
  assert.equal(r.ok, true);
  assert.equal(r.after.visit.total, 120);
  assert.deepEqual(r.effects.remaining, [501 - 180 - 65, 501 - 180 - 120]);
  assert.deepEqual(r.effects.visit, [65, 120]);
  // Bust dans la volée en cours : la volée se fermerait et la main passerait → refusé.
  const low = ds('T20 T20 T20  0 0 0  T20 T20 T20  0 0 0  T20 S20 S20  0 0 0  S20');
  assert.equal(computeState(C, low).remaining[0], 21);
  assert.equal(correctDart(C, low, low.length - 1, P('T20')).error, CORRECT_ERRORS.CHANGES_FLOW);
  assert.equal(correctDart(C, low, low.length - 1, P('S19')).ok, true);
});

test('correction dans une manche précédente : les restes de la manche sont recalculés, la manche en cours ne bouge pas', () => {
  const C2 = cfg({ startScore: 301, legsToWin: 2 });
  // Manche 1 : A gagne (T20 T20 T20 / 0 0 0 / T20 T11 D14) ; manche 2 commencée par B.
  const darts = ds('T20 T20 T20  0 0 0  T20 T11 D14  20 20');
  const s = computeState(C2, darts);
  assert.equal(s.legNumber, 2);
  const r = correctDart(C2, darts, 3, P('T20')); // B, manche 1 : 0 → T20
  assert.equal(r.ok, true);
  assert.deepEqual(r.effects.remaining, [301, 241], 'reste de B à la fin de la manche 1');
  assert.deepEqual(r.after.remaining, s.remaining, 'manche 2 inchangée');
  // La finition de la manche 1 ne peut pas changer : D14 → 14 ne finit plus la manche.
  assert.equal(correctDart(C2, darts, 8, P('14')).error, CORRECT_ERRORS.CHANGES_FLOW);
});

test('refus sans changement : fléchette identique, invalide, rang inexistant', () => {
  const darts = ds('T20 20');
  assert.equal(correctDart(C, darts, 0, P('T20')).error, CORRECT_ERRORS.SAME);
  assert.equal(correctDart(C, darts, 0, { segment: 25, multiplier: 3 }).error, CORRECT_ERRORS.INVALID);
  assert.equal(correctDart(C, darts, 5, P('T20')).error, CORRECT_ERRORS.OUT_OF_RANGE);
  const withPos = correctDart(C, darts, 0, { ...P('T5'), pos: [0.1, 0.2] });
  assert.deepEqual(withPos.darts[0], { segment: 5, multiplier: 3, pos: [0.1, 0.2] }, 'position gardée si la correction vient de la cible');
});
