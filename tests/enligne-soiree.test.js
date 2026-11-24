// 0.20.2 : une partie en ligne est une partie de soirée comme une autre, de chaque côté. Question de Guillaume après
// son premier essai réussi (24/11) : « est-ce que le lien est bien fait pour les stats, badges… ? ». Ici : la partie
// reçue de l'hôte entre dans la soirée en cours de l'invité (avant : jamais) ; chez l'hôte, l'adversaire en ligne ne
// rejoint pas sa soirée (ses verres sont sur son téléphone) ; « Nouvelle partie » garde ses derniers réglages ; la
// partie finie compte dans les records, les badges et le tableau de bord de la soirée du joueur de ce téléphone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store, startGame, startCricket, adoptOnlineGame, startSoiree, archiveCurrent } from '../src/ui/store.js';
import { playerRecords } from '../src/engine/records.js';
import { honours, playerBadges } from '../src/engine/badges.js';
import { soireeModel } from '../src/engine/soiree.js';
import { ds } from './helpers.js';

const reset = () => {
  store.players = [{ id: 'moi', name: 'Guillaume' }, { id: 'loin', name: 'Mathilde', remote: true }];
  store.games = []; store.ckGames = []; store.current = null; store.ck = null; store.soiree = null;
  store.lastSetup = { players: ['moi'], startScore: 501, outMode: 'double', legsToWin: 1, shuffle: true, game: 'x01' };
};

test('hôte : la partie en ligne entre dans sa soirée, sans l\'adversaire distant ; derniers réglages intacts', () => {
  reset();
  startSoiree(['moi']);
  store.soiree.drinks = { moi: [{ t: 5 }] }; // un verre pris avant la partie (écran Soirée)
  const before = JSON.stringify(store.lastSetup);
  const g = startGame({ players: ['moi', 'loin'], startScore: 301, outMode: 'single', legsToWin: 1, shuffle: false, online: true });
  assert.equal(g.soiree, store.soiree.id);
  assert.deepEqual(store.soiree.players, ['moi'], 'Mathilde (autre téléphone) ne rejoint pas la soirée d\'ici');
  assert.equal(g.drinks.moi.length, 1, 'le verre d\'avant entre dans la partie');
  assert.equal(JSON.stringify(store.lastSetup), before, 'NOUVELLE PARTIE reprend les réglages d\'avant');
  // Cricket en ligne : derniers réglages intacts aussi.
  startCricket({ players: ['moi', 'loin'], ckMode: 'points', legsToWin: 1, shuffle: false, online: true });
  assert.equal(JSON.stringify(store.lastSetup), before);
});

test('invité : la partie reçue entre dans sa soirée ; finie, elle compte dans ses records, badges et sa soirée', () => {
  reset();
  startSoiree(['moi']);
  const rec = { id: 'g-ligne', config: { startScore: 301, outMode: 'single', legsToWin: 1, players: ['loin', 'moi'] }, darts: [], startedAt: Date.now(), validated: 0 };
  const g = adoptOnlineGame(rec, { code: 'BCDFG', role: 'guest', me: 'moi', host: 'loin' });
  assert.equal(g.soiree, store.soiree.id, 'avant la 0.20.2 : pas de soirée côté invité');
  assert.deepEqual(store.soiree.players, ['moi']);
  // La même partie renvoyée par l'hôte (reprise) garde sa soirée.
  const again = adoptOnlineGame({ ...rec, darts: ds('S1 S1 S1') }, g.online);
  assert.equal(again.soiree, g.soiree);
  // Mathilde 3 fléchettes, Guillaume 180 puis finit (T20 T20 S1) : partie finie.
  again.darts = ds('S1 S1 S1  T20 T20 T20  S1 S1 S1  T20 T20 S1');
  again.validated = again.darts.length;
  archiveCurrent(false);
  const done = store.games.find(x => x.id === 'g-ligne');
  assert.ok(done && done.online && done.soiree === store.soiree.id);
  const r = playerRecords(store.games, 'moi');
  assert.equal(r.bestVisit, 180, 'record de volée : le 180 de la partie en ligne');
  assert.equal(r.bestFinish, 121);
  const h = honours(store.games);
  const earned = playerBadges(h, 'moi').filter(b => b.earned).map(b => b.key);
  assert.ok(earned.includes('max') && earned.includes('win1'), `badges gagnés : ${earned.join(', ')}`); // 180, 1re victoire
  const m = soireeModel(store.games.filter(x => x.soiree === store.soiree.id), id => (store.players.find(p => p.id === id) || {}).name);
  assert.equal(m.list.length, 1, 'au tableau de bord de la soirée');
});
