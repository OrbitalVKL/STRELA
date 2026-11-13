// Version 0.8.1 : verres d'une soirée corrigés (verres resaisis à chaque partie, avant le mode soirée), verres d'une
// partie de l'historique corrigés à la main, et nom des fichiers du rapport accepté par l'APK (Bridge.saveFile).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, cumulativeDrinksFix, applyCumulativeFix, undoCumulativeFix, cumulativeFixed, editGameDrinks, gameDrinks, gameDrinkTally } from '../src/ui/store.js';
import { drinkTally, tallyText, litersText, unitsOf, cleanDrinks, drinksTimeline, drinkTimes } from '../src/engine/alcohol.js';
import { computeState } from '../src/engine/x01.js';
import { soireeModel } from '../src/engine/soiree.js';
import { ds } from './helpers.js';
import { reportFileBase } from '../src/ui/soireereport.js';
import { sheetFileName } from '../src/ui/sheet.js';
import { summaryFileName, summaryTiles } from '../src/ui/soireesummary.js';

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
  assert.match(summaryFileName(at), re, 'résumé à partager (lot 9)');
  assert.equal(summaryFileName(at), 'strela-resume-20261112-2041.png');
});

// ------------------------------------------------------------------ 0.8.2 : verre (25 cl) ou pinte (50 cl)
const P = (t, at = 0) => ({ t, at, v: 0.5 });
const V = (t, at = 0) => ({ t, at });

test('pinte : compte pour 2 verres, détail et litres ; gardée à l’enregistrement', () => {
  const list = [V(1), P(2), P(3)];
  assert.equal(unitsOf(list), 5);
  const t = drinkTally(list, [V(4)]);
  assert.deepEqual(t, { units: 6, glasses: 2, pints: 2, liters: 1.5 });
  assert.equal(tallyText(t), '2 verres + 2 pintes');
  assert.equal(tallyText(drinkTally([P(1)])), '1 pinte');
  assert.equal(litersText(1.5), '1,5 L'); assert.equal(litersText(0.75), '75 cl');
  assert.deepEqual(cleanDrinks({ A: [V(1, 2), P(2, 3), { t: 3, v: 0.33 }, 7] }), { A: [{ t: 1, at: 2 }, { t: 2, at: 3, v: 0.5 }, { t: 3 }, 7] },
    'seule la pinte porte une taille ; le reste est un verre de 25 cl');
  // Alcoolémie estimée : une pinte vaut deux verres standard.
  assert.deepEqual(drinkTimes([{ drinks: { A: [V(10), P(20)] } }], 'A', 100), [10, 20, 20]);
});

test('pinte : cumul dans l’historique de la partie, cumul de la soirée, modèle du rapport', () => {
  // 301 : A lance 3 volées, B 2 ; A prend une pinte avant sa 2e volée (4 fléchettes jouées), B un verre au début.
  const config = { startScore: 301, outMode: 'double', legsToWin: 1, players: ['A', 'B'] };
  const darts = ds('S20 S20 S20  S1 S1 S1  S20 S20 S20  S1 S1 S1  S20');
  const st = computeState(config, darts);
  const tl = drinksTimeline(st, { A: [P(1, 4)], B: [V(1, 0)] }, config.players, { A: 1 });
  assert.deepEqual(tl.totals, [3, 1], 'A : 1 verre de la soirée + une pinte = 3');
  assert.deepEqual(tl.byVisit.get(2), { here: 2, total: 3, player: 0 }, 'la pinte tombe à la 2e volée de A et y compte 2');
  store.soiree = null;
  store.games = [game('g1', 1, { A: [V(1), P(2)] }), game('g2', 2, { A: [P(3)], B: [V(3)] })];
  editGameDrinks('g2', 'B', 1, true); // une pinte ajoutée à la main
  assert.equal(gameDrinks(store.games[1], 'A'), 5, '3 d’avant (verre + pinte) + une pinte');
  assert.deepEqual(store.games[1].drinksBefore, { A: 3 });
  assert.deepEqual(gameDrinkTally(store.games[1], 'A'), { units: 5, glasses: 1, pints: 2, liters: 1.25 });
  assert.deepEqual(gameDrinkTally(store.games[1], 'B'), { units: 3, glasses: 1, pints: 1, liters: 0.75 });
  const m = soireeModel(store.games.map(g => ({ ...g, darts: ds('S20') })), id => id);
  const row = Object.fromEntries(m.rows.map(r => [r.id, r]));
  assert.equal(row.A.drinks, 5); assert.equal(row.A.tally.pints, 2);
  assert.equal(m.drinks, 8); assert.equal(m.liters, 2);
  assert.deepEqual(m.drinkList.A, [{ t: 1, pint: false }, { t: 2, pint: true }, { t: 3, pint: true }]);
  const tr = m.trophies.find(t => t.key === 'drinks');
  assert.equal(tr.value, 'x5 verres'); assert.equal(tr.detail, '1 verre + 2 pintes');
});

test('résumé à partager (lot 9) : six cases au plus, record de la soirée, tournées partagées', () => {
  const config = { startScore: 301, outMode: 'single', legsToWin: 1, players: ['A', 'B', 'C'] };
  const g = (id, t, darts, drinks) => ({ id, startedAt: t, soiree: 's', config, darts: ds(darts), drinks });
  const games = [
    g('g1', 1000, 'T20 T20 T20  S5 S5 S5  S1 S1 S1  T20 T20 S1', { B: [{ t: 1, at: 0 }, { t: 2, at: 0, v: 0.5 }] }),
    g('g2', 5000, 'T20 T20 T20  S1 S1 S1  S5 S5 S5  T20 T20 S1', {}),
  ];
  const m = soireeModel(games);
  const tiles = summaryTiles(m, { id: 'A', label: 'volée', value: '62' });
  assert.ok(tiles.length <= 6);
  assert.deepEqual(tiles.map(t => t.label).slice(0, 2), ['Meilleure volée', 'Pire volée']);
  assert.deepEqual(tiles.find(t => t.label === 'Le plus assoiffé'), { label: 'Le plus assoiffé', id: 'B', value: 'x3' });
  assert.ok(tiles.some(t => t.label === 'Record · volée' && t.value === '62'));
  assert.deepEqual(tiles.find(t => t.label === 'Tournées').value, 'x1', 'C puis B : une tournée chacun');
});
