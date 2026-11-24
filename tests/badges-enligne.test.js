// Lot 10 (étape 5) : badges des parties en ligne (src/engine/badges.js) — Premier contact, Longue distance, Revanche,
// Sang-froid, Reconnexion héroïque, Fidèle au poste (bronze à 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { honours, playerBadges, lastAtHalf } from '../src/engine/badges.js';

const cfg = players => ({ startScore: 301, outMode: 'double', legsToWin: 1, players });
// A gagne : 180, puis 121 (T20 T11 D14) ; B fait 3 × 1 par volée.
const winA = 'T20 T20 T20  S1 S1 S1  T20 T11 D14';
// B gagne de la même façon (A lance en premier, fait 3 × 1).
const winB = 'S1 S1 S1  T20 T20 T20  S1 S1 S1  T20 T11 D14';
let t = Date.UTC(2026, 10, 1);
const game = (players, darts, extra = {}) => ({ id: `g${t}`, startedAt: (t += 3600e3), config: cfg(players), darts: ds(darts), ...extra });
const has = (h, id, key) => !!(h.byPlayer[id] && h.byPlayer[id][key]);

test('premier contact, longue distance (contre un compte seulement), reconnexion', () => {
  const games = [
    game(['A', 'B'], winA), // locale : rien
    game(['A', 'L'], winA, { online: { code: 'BCD23', role: 'host' } }), // en ligne contre un joueur sans compte
  ];
  let h = honours(games, Date.UTC(2026, 11, 1), { accounts: new Set(['A', 'B']) });
  assert.ok(has(h, 'A', 'contact'));
  assert.ok(has(h, 'L', 'contact'), 'Premier contact : finir, gagné ou non');
  assert.ok(!has(h, 'A', 'distance'), 'L n\'a pas de compte');
  assert.ok(!has(h, 'A', 'reconnexion'));
  games.push(game(['A', 'B'], winA, { online: { code: 'BCD24', role: 'host', cut: true } }));
  h = honours(games, Date.UTC(2026, 11, 1), { accounts: new Set(['A', 'B']) });
  assert.ok(has(h, 'A', 'distance'));
  assert.ok(has(h, 'A', 'reconnexion'));
  assert.ok(!has(h, 'B', 'distance'), 'B a perdu');
});

test('revanche : battre en ligne l\'ami qui avait gagné la partie précédente entre eux', () => {
  const games = [game(['A', 'B'], winB), game(['A', 'B'], winA, { online: { code: 'BCD25', role: 'host' } })];
  const h = honours(games, Date.UTC(2026, 11, 1), { accounts: new Set(['A', 'B']) });
  assert.ok(has(h, 'A', 'revanche'));
  const h2 = honours([game(['A', 'B'], winA), game(['A', 'B'], winA, { online: { code: 'BCD26', role: 'host' } })], Date.UTC(2026, 11, 1), { accounts: new Set(['A', 'B']) });
  assert.ok(!has(h2, 'A', 'revanche'), 'A avait déjà gagné la précédente');
});

test('sang-froid : dernier à mi-partie, puis vainqueur', () => {
  // B fait 180 d'entrée, A traîne ; A remonte et gagne.
  const darts = 'S1 S1 S1  T20 T20 T20  T20 T20 T20  S1 S1 S1  T20 S18 D20';
  const g = game(['A', 'B'], darts, { online: { code: 'BCD27', role: 'host' } });
  assert.equal(lastAtHalf(g, 0), true);
  assert.equal(lastAtHalf(g, 1), false);
  const h = honours([g], Date.UTC(2026, 11, 1), { accounts: new Set(['A', 'B']) });
  assert.ok(has(h, 'A', 'sangfroid'));
});

test('badges en ligne cachés tant que le joueur n\'a pas joué en ligne', () => {
  const h = honours([game(['A', 'B'], winA), game(['A', 'C'], winA, { online: { code: 'BCD29', role: 'host' } })], Date.UTC(2026, 11, 1));
  assert.ok(!playerBadges(h, 'B').some(b => b.key === 'contact'));
  assert.ok(playerBadges(h, 'C').some(b => b.key === 'contact' && b.earned));
});

test('fidèle au poste : bronze à 10 parties en ligne', () => {
  const games = Array.from({ length: 10 }, (_, i) => game(['A', 'B'], i % 2 ? winA : winB, { online: { code: 'BCD28', role: 'host' } }));
  const h = honours(games.slice(0, 9), Date.UTC(2026, 11, 1));
  assert.equal(playerBadges(h, 'A').find(b => b.key === 'fidele').tier, 0);
  const h10 = honours(games, Date.UTC(2026, 11, 1));
  const b = playerBadges(h10, 'A').find(x => x.key === 'fidele');
  assert.equal(b.tier, 1);
  assert.equal(b.total, 10);
  assert.equal(b.next, 50);
});
