import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pendingVisit, validatedAfterUndo } from '../src/ui/turn.js';
import { rollStrip, digitsOf } from '../src/ui/roll.js';
import { computeState } from '../src/engine/x01.js';
import { cfg, ds } from './helpers.js';

const C = cfg({ startScore: 301 });
const st = n => computeState(C, ds('T20 T20 T20  20 20 20  T20 S20 T20  S1 S1').slice(0, n));

describe('validation de chaque volée', () => {
  test('la volée close attend VALIDER ; une volée commencée ou validée non', () => {
    assert.equal(pendingVisit(st(0), 0), null);
    assert.equal(pendingVisit(st(2), 0), null);
    const p = pendingVisit(st(3), 0);
    assert.equal(p.player, 0);
    assert.equal(p.total, 180);
    assert.equal(pendingVisit(st(3), 3), null, 'validée');
    assert.equal(pendingVisit(st(4), 3), null, 'joueur suivant en cours');
  });

  test('bust en attente, puis ANNULER puis rejouer la même fléchette : de nouveau en attente', () => {
    // A : 180 (reste 121), B : 60, puis A : T20 S20 (reste 41) et T20 → bust à la 3e fléchette
    const s9 = st(9);
    assert.equal(s9.lastEvent, 'bust');
    assert.equal(pendingVisit(s9, 6).bust, true);
    let validated = 6;
    validated = validatedAfterUndo(validated, 8); // ANNULER avant de valider
    assert.equal(validated, 6);
    assert.equal(pendingVisit(st(8), validated), null);
    assert.ok(pendingVisit(st(9), validated), 'la fléchette rejouée remet la volée en attente');
    // validé à 9, ANNULER deux fois puis rejouer : la validation « dans le futur » ne compte plus
    validated = 9;
    validated = validatedAfterUndo(validated, 8);
    validated = validatedAfterUndo(validated, 7);
    assert.equal(validated, 7);
    assert.ok(pendingVisit(st(9), validated));
    // ANNULER au début de la volée suivante (après validation) : pas de nouvelle attente
    assert.equal(pendingVisit(st(9), validatedAfterUndo(9, 9)), null);
  });

  test('finition : pas d’attente (l’écran de fin de manche valide)', () => {
    const c = cfg({ startScore: 301, legsToWin: 2 });
    const s = computeState(c, ds('T20 T20 T20  S1 S1 S1  T20 T11 D14'));
    assert.equal(s.lastEvent, 'leg_won');
    assert.equal(pendingVisit(s, 0), null);
    const end = computeState(cfg({ startScore: 301 }), ds('T20 T20 T20  S1 S1 S1  T20 T11 D14'));
    assert.equal(pendingVisit(end, 0), null);
  });
});

describe('chiffres en rouleau', () => {
  test('bande de chiffres traversés, en descendant ou en montant', () => {
    assert.deepEqual(rollStrip('5', '4', true), ['5', '4']);
    assert.deepEqual(rollStrip('0', '4', true), ['0', '9', '8', '7', '6', '5', '4']);
    assert.deepEqual(rollStrip('4', '0', false), ['4', '5', '6', '7', '8', '9', '0']);
    assert.deepEqual(rollStrip('7', '7', true), ['7']);
    assert.deepEqual(rollStrip('1', '', true), ['1', '']);
    assert.deepEqual(rollStrip('', '6', false), ['', '6']);
    assert.ok(rollStrip('3', '4', true).length <= 10);
  });
  test('chiffres alignés à droite', () => {
    assert.deepEqual(digitsOf(60, 3), ['', '6', '0']);
    assert.deepEqual(digitsOf(501, 3), ['5', '0', '1']);
  });
});
