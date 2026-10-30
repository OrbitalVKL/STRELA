import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { suggestCheckout, isCheckoutRoute, maxCheckout, checkoutPrefs, DEFAULT_PREFS } from '../src/engine/checkout.js';
import { formatDart, dartValue, isDouble } from '../src/engine/darts.js';
import { computeState, OUT_SINGLE, OUT_DOUBLE } from '../src/engine/x01.js';
import { ds } from './helpers.js';

const fmt = (r, out = OUT_DOUBLE, n = 3, prefs) => {
  const route = suggestCheckout(r, out, n, prefs);
  return route ? route.map(formatDart).join(' ') : null;
};

// Fléchettes minimales pour finir `r` (recherche exhaustive indépendante de la table).
function minDarts(r, out) {
  const all = [];
  for (let s = 1; s <= 20; s++) for (const m of [1, 2, 3]) all.push({ segment: s, multiplier: m });
  all.push({ segment: 25, multiplier: 1 }, { segment: 25, multiplier: 2 });
  for (let n = 1; n <= 3; n++) {
    const rec = (left, k) => {
      if (k === 0) return left === 0;
      return all.some(d => {
        const after = left - dartValue(d);
        if (after < 0) return false;
        if (k === 1) return after === 0 && (out === OUT_SINGLE || isDouble(d));
        if (out === OUT_DOUBLE && after <= 1) return false;
        return rec(after, k - 1);
      });
    };
    if (rec(r, n)) return n;
  }
  return null;
}

describe('table de finitions', () => {
  test('finitions de référence en sortie double', () => {
    assert.equal(fmt(170), 'T20 T20 50');
    assert.equal(fmt(167), 'T20 T19 50');
    assert.equal(fmt(160), 'T20 T20 D20');
    assert.equal(fmt(110), 'T20 50');
    assert.equal(fmt(100), 'T20 D20');
    assert.equal(fmt(60), 'S20 D20');
    assert.equal(fmt(50), '50');
    assert.equal(fmt(40), 'D20');
    assert.equal(fmt(32), 'D16');
    assert.equal(fmt(33), 'S1 D16');
    assert.equal(fmt(2), 'D1');
    assert.equal(fmt(3), 'S1 D1');
  });

  test('aucune finition impossible en sortie double', () => {
    for (const r of [169, 168, 166, 165, 163, 162, 159, 171, 180, 501, 1, 0, -4]) assert.equal(fmt(r), null, `reste ${r}`);
    assert.equal(maxCheckout(OUT_DOUBLE), 170);
  });

  test('sortie simple : jusqu’à 180, et 1 se finit', () => {
    assert.equal(fmt(180, OUT_SINGLE), 'T20 T20 T20');
    assert.equal(fmt(60, OUT_SINGLE), 'T20');
    assert.equal(fmt(20, OUT_SINGLE), 'S20');
    assert.equal(fmt(1, OUT_SINGLE), 'S1');
    assert.equal(fmt(25, OUT_SINGLE), '25');
    assert.equal(fmt(179, OUT_SINGLE), null);
    assert.equal(maxCheckout(OUT_SINGLE), 180);
  });

  test('fléchettes restantes dans la volée prises en compte', () => {
    assert.equal(fmt(100, OUT_DOUBLE, 2), 'T20 D20');
    assert.equal(fmt(101, OUT_DOUBLE, 2), 'T17 50');
    assert.equal(fmt(99, OUT_DOUBLE, 2), null);
    assert.ok(fmt(99, OUT_DOUBLE, 3));
    assert.equal(fmt(40, OUT_DOUBLE, 1), 'D20');
    assert.equal(fmt(41, OUT_DOUBLE, 1), null);
    assert.equal(fmt(60, OUT_DOUBLE, 0), null);
    assert.equal(fmt(60, OUT_SINGLE, 1), 'T20');
  });

  test('chaque route proposée est jouable, exacte et la plus courte (2 à 180, 1 à 3 fléchettes)', () => {
    for (const out of [OUT_SINGLE, OUT_DOUBLE]) {
      for (let n = 1; n <= 3; n++) {
        for (let r = 1; r <= 181; r++) {
          const route = suggestCheckout(r, out, n);
          const need = minDarts(r, out);
          if (need === null || need > n) { assert.equal(route, null, `${out} ${r} en ${n}`); continue; }
          assert.ok(route, `${out} ${r} en ${n} : finition attendue`);
          assert.equal(route.length, need, `${out} ${r} : ${need} fléchette(s) suffisent`);
          assert.ok(isCheckoutRoute(r, route, out), `${out} ${r} : route invalide`);
        }
      }
    }
  });

  test('rejouée dans le moteur X01, la route proposée gagne la manche', () => {
    const config = { startScore: 301, outMode: OUT_DOUBLE, players: ['A'] };
    for (const [setup, r] of [['T20 T20 S11', 170], ['T20 T20 T20 S20 S1 0', 100], ['T20 T20 T20 T20 S20 0', 41],
      ['T20 T20 T20 T20 T19 S2', 2]]) {
      const before = computeState(config, ds(setup));
      assert.equal(before.remaining[0], r);
      const route = suggestCheckout(r, OUT_DOUBLE, 4 - before.dartNumber);
      const after = computeState(config, [...ds(setup), ...route]);
      assert.equal(after.status, 'finished', `reste ${r} : ${route.map(formatDart).join(' ')}`);
    }
  });

  test('isCheckoutRoute refuse les routes fausses', () => {
    assert.equal(isCheckoutRoute(40, ds('S20 S20'), OUT_DOUBLE), false); // finit sur un simple
    assert.equal(isCheckoutRoute(40, ds('S20 S20'), OUT_SINGLE), true);
    assert.equal(isCheckoutRoute(41, ds('S20 S20'), OUT_SINGLE), false); // ne finit pas
    assert.equal(isCheckoutRoute(22, ds('S20 D1'), OUT_DOUBLE), true);
    assert.equal(isCheckoutRoute(21, ds('S20 D1'), OUT_DOUBLE), false); // reste 1 = bust
    assert.equal(isCheckoutRoute(10, [], OUT_DOUBLE), false);
    assert.equal(isCheckoutRoute(10, ds('S1 S1 S1 D2'), OUT_SINGLE), false); // 4 fléchettes
  });

  // Lot 4 : préférences du joueur (fiche joueur) et raté le plus courant de la première fléchette.
  test('double préféré : 41 = S1 D20 (D20, défaut) ou S9 D16 (D16)', () => {
    assert.equal(fmt(41), 'S1 D20');
    assert.equal(fmt(41, OUT_DOUBLE, 3, { double: 20 }), 'S1 D20');
    assert.equal(fmt(41, OUT_DOUBLE, 3, { double: 16 }), 'S9 D16');
    assert.equal(fmt(52, OUT_DOUBLE, 3, { double: 16 }), 'S20 D16');
    assert.equal(fmt(56, OUT_DOUBLE, 3, { double: 18 }), 'S20 D18');
    assert.equal(fmt(48, OUT_DOUBLE, 3, { double: 10 }), 'S8 D20', 'le moins de fléchettes d\'abord : 28 n\'est pas un simple');
    assert.equal(fmt(33, OUT_DOUBLE, 3, { double: 10 }), 'S13 D10');
    assert.equal(fmt(33), 'S1 D16');
    assert.equal(fmt(40, OUT_DOUBLE, 3, { double: 16 }), 'D20', 'une fléchette vaut mieux que deux');
    assert.equal(fmt(100, OUT_DOUBLE, 3, { double: 16 }), 'T20 D20');
  });

  test('170, avec ou sans « éviter le bull » : T20 T20 50 (seule route)', () => {
    assert.equal(fmt(170), 'T20 T20 50');
    assert.equal(fmt(170, OUT_DOUBLE, 3, { avoidBull: true }), 'T20 T20 50');
    assert.equal(fmt(167, OUT_DOUBLE, 3, { avoidBull: true }), 'T20 T19 50');
  });

  test('50 avec et sans le bull ; le bull évité tant qu\'une autre route tient dans la volée', () => {
    assert.equal(fmt(50), '50');
    assert.equal(fmt(50, OUT_DOUBLE, 3, { avoidBull: true }), 'S10 D20');
    assert.equal(fmt(50, OUT_DOUBLE, 1, { avoidBull: true }), '50', 'une seule fléchette : le bull reste la seule finition');
    assert.equal(fmt(110), 'T20 50');
    assert.equal(fmt(110, OUT_DOUBLE, 3, { avoidBull: true }), 'T20 S10 D20');
    assert.equal(fmt(110, OUT_DOUBLE, 2, { avoidBull: true }), 'T20 50');
    assert.equal(fmt(25, OUT_SINGLE, 3, { avoidBull: true }), 'S5 S20');
    assert.equal(fmt(25, OUT_SINGLE), '25');
    for (let r = 2; r <= 170; r++) {
      const route = suggestCheckout(r, OUT_DOUBLE, 3, { avoidBull: true });
      if (route && route.some(d => d.segment === 25)) {
        const any = suggestCheckout(r, OUT_DOUBLE, 3);
        assert.ok(any.some(d => d.segment === 25), `${r} : bull proposé alors qu'on pouvait l'éviter`);
      }
    }
  });

  test('à valeur égale, la première fléchette laisse un double si elle ne fait que le simple', () => {
    // 67 : T17 D8 (S17 raté → 50, encore jouable) plutôt que T9 D20 (S9 → 58, plus rien en une fléchette)
    assert.equal(fmt(67, OUT_DOUBLE, 2), 'T17 D8');
    assert.equal(fmt(63, OUT_DOUBLE, 2), 'T13 D12');
    // 128 : T18 T14 D16 (S18 → 110 : T20 50) plutôt que T20 T12 D16 (S20 → 108 : plus de finition en 2)
    assert.equal(fmt(128), 'T18 T14 D16');
    // une première fléchette simple ne se « rate » pas : 60 = S20 D20, inchangé
    assert.equal(fmt(60), 'S20 D20');
  });

  test('les préférences changent la route, jamais l\'existence d\'une finition', () => {
    const variants = [{ double: 16 }, { double: 8, avoidBull: true }, { double: 1 }, { avoidBull: true }];
    for (const out of [OUT_SINGLE, OUT_DOUBLE]) {
      for (let n = 1; n <= 3; n++) {
        for (let r = 1; r <= 181; r++) {
          const base = suggestCheckout(r, out, n);
          for (const p of variants) {
            const route = suggestCheckout(r, out, n, p);
            assert.equal(!!route, !!base, `${out} ${r} en ${n} ${JSON.stringify(p)}`);
            if (route) {
              assert.ok(isCheckoutRoute(r, route, out));
              if (p.avoidBull) assert.ok(route.length >= base.length);
              else assert.equal(route.length, base.length, 'toujours le moins de fléchettes');
            }
          }
        }
      }
    }
  });

  test('préférences lues avec des valeurs par défaut', () => {
    assert.deepEqual(checkoutPrefs(undefined), DEFAULT_PREFS);
    assert.deepEqual(checkoutPrefs({ double: 16, avoidBull: true }), { double: 16, avoidBull: true });
    assert.deepEqual(checkoutPrefs({ double: 25, avoidBull: 'oui' }), { double: 20, avoidBull: false });
    assert.deepEqual(checkoutPrefs({ double: '8' }), { double: 8, avoidBull: false });
  });
});
