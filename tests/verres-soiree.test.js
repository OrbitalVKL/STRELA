// Version 0.8.1 : verres d'une soirée corrigés (verres resaisis à chaque partie, avant le mode soirée), verres d'une
// partie de l'historique corrigés à la main, et nom des fichiers du rapport accepté par l'APK (Bridge.saveFile).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, cumulativeDrinksFix, applyCumulativeFix, undoCumulativeFix, cumulativeFixed, editGameDrinks } from '../src/ui/store.js';
import { reportFileBase } from '../src/ui/soireereport.js';
import { sheetFileName } from '../src/ui/sheet.js';

const D = n => Array.from({ length: n }, (_, i) => ({ t: 1000 + i, at: 0 }));
const game = (id, at, drinks, players = ['A', 'B']) => ({ id, startedAt: at, soiree: 's', config: { startScore: 301, outMode: 'double', legsToWin: 1, players }, darts: [], drinks });
const counts = g => Object.fromEntries(Object.entries(g.drinks || {}).map(([k, v]) => [k, v.length]));

test('verres resaisis à chaque partie : seuls les nouveaux comptent, et la correction s’annule', () => {
  // A a bu 2, puis 1, puis 2 : saisi 2, 3, 5. B a bu 1 verre en tout, resaisi dans la partie 2.
  store.games = [game('g1', 1, { A: D(2), B: D(1) }), game('g2', 2, { A: D(3), B: D(1) }), game('g3', 3, { A: D(5) }, ['A'])];
  assert.deepEqual(cumulativeDrinksFix('s').totals, { A: { before: 10, after: 5 }, B: { before: 2, after: 1 } });
  applyCumulativeFix('s');
  assert.deepEqual(store.games.map(counts), [{ A: 2, B: 1 }, { A: 1 }, { A: 2 }]);
  assert.deepEqual(store.games.map(g => g.drinksBefore || {}), [{}, { A: 2, B: 1 }, { A: 3 }], 'cumuls de la soirée recalculés');
  assert.equal(cumulativeFixed('s'), true);
  applyCumulativeFix('s'); // une seconde fois : rien ne bouge
  assert.deepEqual(store.games.map(counts), [{ A: 2, B: 1 }, { A: 1 }, { A: 2 }]);
  undoCumulativeFix('s');
  assert.deepEqual(store.games.map(counts), [{ A: 2, B: 1 }, { A: 3, B: 1 }, { A: 5 }]);
  assert.equal(cumulativeFixed('s'), false);
});

test('verres d’une partie de l’historique : + et −, cumuls de la soirée suivis', () => {
  store.games = [game('g1', 1, { A: D(1) }), game('g2', 2, {})];
  editGameDrinks('g1', 'B', 1);
  editGameDrinks('g1', 'A', -1);
  editGameDrinks('g1', 'A', -1); // déjà à zéro : rien
  assert.deepEqual(counts(store.games[0]), { B: 1 });
  assert.deepEqual(store.games[1].drinksBefore, { B: 1 });
  editGameDrinks('g1', 'Z', 1); // pas dans la partie : rien
  assert.deepEqual(counts(store.games[0]), { B: 1 });
});

test('noms des fichiers du rapport et de la fiche : acceptés par l’APK', () => {
  const java = readFileSync(new URL('../android/app/src/main/java/fr/orbitalvkl/strela/Bridge.java', import.meta.url), 'utf8');
  const m = /public String saveFile[\s\S]*?name\.matches\("([^"]+)"\)/.exec(java);
  assert.ok(m, 'motif de Bridge.saveFile');
  const re = new RegExp(`^${m[1].replace(/\\\\/g, '\\')}$`);
  const at = new Date(2026, 10, 12, 20, 41).getTime();
  for (const ext of ['png', 'pdf']) {
    assert.match(`${reportFileBase(at)}.${ext}`, re);
    assert.match(sheetFileName(at, ext), re);
  }
  assert.equal(`${reportFileBase(at)}.pdf`, 'strela-soiree-20261112-2041.pdf');
});
