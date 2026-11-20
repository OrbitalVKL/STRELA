// Version 0.11.2 (Guillaume : « personne ne paie sa tournée ») : tournées notées retirées d'une soirée passée (et
// remises), verres de 25 cl et pintes comptés à part, verres pris entre deux parties comptés dans la soirée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, tourneeDrinks, applyTourneeFix, undoTourneeFix, tourneeFixed, startSoiree, soireeAddDrink, startGame, endSoiree } from '../src/ui/store.js';
import { drinksText, addTally, drinkTally } from '../src/engine/alcohol.js';
import { withDrinks } from '../src/data/db.js';
import { DEFIS } from '../src/engine/defis.js';
import { ds } from './helpers.js';

const cfg = players => ({ startScore: 301, outMode: 'double', legsToWin: 1, players });
const game = (id, at, drinks, players = ['A', 'B', 'C']) => ({ id, startedAt: at, endedAt: at + 1, soiree: 's', config: cfg(players), darts: [], validated: 0, drinks });
const counts = g => Object.fromEntries(Object.entries(g.drinks || {}).map(([k, v]) => [k, v.length]));

test('verres et pintes : comptés à part, en toutes lettres', () => {
  assert.equal(drinksText(drinkTally()), 'aucun verre');
  assert.equal(drinksText(drinkTally([{ t: 1 }, { t: 2 }, { t: 3, v: 0.5 }])), '2 verres · 1 pinte');
  assert.equal(drinksText(drinkTally([{ t: 3, v: 0.5 }, { t: 4, v: 0.5 }])), '2 pintes');
  assert.deepEqual(addTally(drinkTally([{ t: 1 }]), drinkTally([{ t: 2, v: 0.5 }])), { units: 3, glasses: 1, pints: 1, liters: 0.75 });
});

test('tournées notées : repérées (même instant, deux joueurs ou plus), retirées après coup, remises', () => {
  store.soiree = null;
  store.games = [
    // g1 : TOURNÉE SERVIE (t = 50, tous) ; A boit seul un verre (t = 10).
    game('g1', 1, { A: [{ t: 10, at: 2 }, { t: 50, at: 9 }], B: [{ t: 50, at: 9 }], C: [{ t: 50, at: 9 }] }),
    // g2 : gage « les autres boivent » en pintes (t = 80, B et C) ; C boit seul une pinte (t = 70).
    game('g2', 100, { B: [{ t: 80, at: 3, v: 0.5 }], C: [{ t: 70, at: 1, v: 0.5 }, { t: 80, at: 3, v: 0.5 }] }),
    // g3 : rien de commun.
    game('g3', 200, { A: [{ t: 90, at: 0 }], B: [{ t: 91, at: 0 }] }),
  ];
  const { groups, totals } = tourneeDrinks('s');
  assert.deepEqual(groups.map(x => [x.game, x.n, x.t, x.ids.sort(), x.pint]), [['g1', 1, 50, ['A', 'B', 'C'], false], ['g2', 2, 80, ['B', 'C'], true]]);
  assert.equal(drinksText(totals.C.before), '1 verre · 2 pintes');
  assert.equal(drinksText(totals.C.after), '1 pinte');
  assert.equal(drinksText(totals.A.after), '2 verres', 'les verres bus seul restent');
  assert.ok(!totals.D);
  applyTourneeFix('s');
  assert.deepEqual(store.games.map(counts), [{ A: 1 }, { C: 1 }, { A: 1, B: 1 }]);
  assert.deepEqual(store.games.map(g => g.drinksBefore || {}), [{}, { A: 1 }, { A: 1, C: 2 }], 'cumuls recalculés (une pinte compte pour 2)');
  assert.equal(tourneeFixed('s'), true);
  assert.equal(tourneeDrinks('s').groups.length, 0, 'plus rien à retirer');
  // Enregistré à part, sans migration.
  assert.deepEqual(withDrinks(store.games[0], {}).drinksTournee, { A: [{ t: 50, at: 9 }], B: [{ t: 50, at: 9 }], C: [{ t: 50, at: 9 }] });
  undoTourneeFix('s');
  assert.equal(tourneeFixed('s'), false);
  assert.deepEqual(store.games.map(counts), [{ A: 2, B: 1, C: 1 }, { B: 1, C: 2 }, { A: 1, B: 1 }]);
  assert.deepEqual(store.games[0].drinks.A, [{ t: 10, at: 2 }, { t: 50, at: 9 }], 'remis à leur place');
  assert.deepEqual(store.games.map(g => g.drinksBefore || {}), [{}, { A: 2, B: 1, C: 1 }, { A: 2, B: 3, C: 5 }]);
});

test('UN VERRE POUR TOUS : un instant par joueur (pas pris pour une tournée) ; plus aucun gage ni tournée en jeu', () => {
  const src = f => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
  assert.match(src('screens/game.js'), /addDrink\(id, now \+ i, pintMode\(\)\)/);
  assert.ok(!/defi-gage|tournee-serve|LE DERNIER PAIE/.test(src('screens/game.js') + src('screens/results.js')));
  assert.equal(DEFIS.tournee.text, 'MOINS DE 20, SINON UN VERRE');
});

test('verres pris entre deux parties : versés dans la partie suivante, ou dans la dernière à la fin de la soirée', () => {
  store.games = []; store.current = null; store.ck = null; store.soiree = null;
  startSoiree(['A', 'B', 'C'], 1);
  soireeAddDrink('A', 5); soireeAddDrink('A', 6, true); soireeAddDrink('C', 7);
  const g = startGame({ players: ['A', 'B'], startScore: 301, outMode: 'double', legsToWin: 1, shuffle: false });
  assert.deepEqual(g.drinks.A, [{ t: 5, at: 0 }, { t: 6, at: 0, v: 0.5 }], 'A : ses verres hors partie entrent dans la partie');
  assert.ok(!g.drinksBefore || !g.drinksBefore.A, 'pas comptés deux fois');
  assert.deepEqual(store.soiree.drinks.C.length, 1, 'C ne joue pas : ses verres attendent');
  g.darts = ds('S20'); // une fléchette : la partie est gardée (abandonnée) au lancement de la suivante
  // C joue la partie suivante, puis prend un verre après ; la soirée se termine.
  const g2 = startGame({ players: ['A', 'C'], startScore: 301, outMode: 'double', legsToWin: 1, shuffle: false });
  assert.equal(g2.drinks.C.length, 1);
  assert.deepEqual(g2.drinksBefore, { A: 3 }, 'A : verre + pinte de la partie 1');
  assert.equal(store.games[0].id, g.id);
  store.current.darts = ds('S20'); store.games.unshift(store.current); store.current = null;
  soireeAddDrink('C', 9);
  endSoiree();
  assert.equal(store.soiree, null);
  assert.deepEqual(g2.drinks.C.map(d => d.t), [7, 9], 'le verre d’après rejoint sa dernière partie');
  // Partie lancée sans fléchette puis remplacée : ses verres retournent à la soirée, la pinte reste une pinte.
  startSoiree(['A'], 20);
  startGame({ players: ['A'], startScore: 301, outMode: 'double', legsToWin: 1, shuffle: false });
  soireeAddDrink('A', 21, true);
  startGame({ players: ['A'], startScore: 301, outMode: 'double', legsToWin: 1, shuffle: false });
  assert.deepEqual(store.current.drinks.A, [{ t: 21, v: 0.5, at: 0 }]);
  store.current = null; store.soiree = null;
});
