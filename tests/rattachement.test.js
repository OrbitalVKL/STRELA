// Lot 10 (étape 3) : rattachement d'un joueur local à un ami — pseudos proches, candidats, réécriture des parties
// (src/engine/merge.js, pur).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normName, nameScore, mergeCandidates, rewireGame, rewireTraining } from '../src/engine/merge.js';

test('pseudos : identiques sans casse ni accents, préfixe, une ou deux lettres', () => {
  assert.equal(normName(' Mathîlde-2 '), 'mathilde2');
  assert.equal(nameScore('Mathilde', 'mathilde'), 0);
  assert.equal(nameScore('Hélène', 'HELENE'), 0);
  assert.equal(nameScore('Math', 'Mathilde'), 1);
  assert.equal(nameScore('Guillaume', 'Guilaume'), 2);
  assert.equal(nameScore('Tsia', 'Tsya'), 2);
  assert.equal(nameScore('Tsia', 'Gilles'), null);
  assert.equal(nameScore('Al', 'Alice'), null, 'deux lettres ne suffisent pas');
  assert.equal(nameScore('Atila', 'Anita'), null, 'deux lettres de différence sur un pseudo court : pas proche');
  assert.equal(nameScore('', 'x'), null);
});

test('candidats : proches d\'abord, jamais le profil, un ami ni un adversaire en ligne', () => {
  const players = [
    { id: 'p1', name: 'Guillaume' },
    { id: 'p2', name: 'Tsia' },
    { id: 'p3', name: 'tsia' },
    { id: 'p4', name: 'Gilles' },
    { id: 'p5', name: 'Tsiaa', archived: true },
    { id: 'u:x', name: 'Tsia', friend: 'x' },
    { id: 'r1', name: 'Tsia', remote: true },
    { id: 'p6', name: 'Bertrand', archived: true },
  ];
  const c = mergeCandidates(players, 'Tsia', { meId: 'p1' });
  assert.deepEqual(c.suggested.map(p => p.id), ['p3', 'p2', 'p5']); // identiques (ordre alphabétique), puis préfixe
  assert.deepEqual(c.others.map(p => p.id), ['p4', 'p6']);
});

test('réécriture d\'une partie : joueurs, verres, en ligne ; refus si les deux y sont', () => {
  const g = { id: 'g1', config: { players: ['p1', 'u:x'] }, drinks: { 'u:x': [{ t: 1 }], p1: [] }, drinksBefore: { 'u:x': 2 }, online: { code: 'BCD23', me: 'u:x', host: 'p1' } };
  const n = rewireGame(g, 'u:x', 'p2');
  assert.deepEqual(n.config.players, ['p1', 'p2']);
  assert.deepEqual(Object.keys(n.drinks), ['p2', 'p1']);
  assert.deepEqual(n.drinksBefore, { p2: 2 });
  assert.equal(n.online.me, 'p2');
  assert.deepEqual(g.config.players, ['p1', 'u:x'], 'l\'original n\'est pas touché');
  assert.equal(rewireGame(g, 'p9', 'p2'), g, 'sans ce joueur : la même partie');
  assert.equal(rewireGame(g, 'u:x', 'p1'), null);
  assert.deepEqual(rewireTraining({ id: 't', player: 'u:x' }, 'u:x', 'p2'), { id: 't', player: 'p2' });
});
