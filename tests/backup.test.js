// Sauvegarde : export / import JSON (lot 3, J) — format, vérification, REMPLACER TOUT et FUSIONNER (src/data/backup.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, parseBackup, importPlan, backupFileName, BackupError, BACKUP_VERSION } from '../src/data/backup.js';
import { ds } from './helpers.js';

const P = [
  { id: 'a', name: 'Alpha', avatar: { kind: 'photo', color: 1, photo: 'data:image/jpeg;base64,AAAA' }, archived: false, checkout: { double: 16, avoidBull: true } },
  { id: 'b', name: 'Bravo', avatar: { kind: 'icon', icon: 'renard', color: 3 }, archived: true, checkout: { double: 20, avoidBull: false } },
];
const config = { startScore: 301, outMode: 'double', legsToWin: 1, players: ['a', 'b'] };
const G = [{ id: 'g1', startedAt: 1000, endedAt: 2000, config, darts: ds('T20 T20 T20 20 20 20'), validated: 6, abandoned: true }];
const CUR = { id: 'g2', startedAt: 3000, endedAt: null, config, darts: [{ segment: 20, multiplier: 3, pos: [0.01, -0.57] }], validated: 0, abandoned: false, ui: { mult: 2 } };
const LOCAL = { players: P, games: G, current: CUR, display: { theme: 'light', night: false, vibrate: true, anim: true, sound: false, voice: true }, lastSetup: { players: ['b', 'a'], startScore: 501, outMode: 'single', legsToWin: 2 } };
const EMPTY = { players: [], games: [], current: null, display: { theme: 'auto', night: false, vibrate: true, anim: true, sound: true, voice: true }, lastSetup: null };

test('nom du fichier : strela-AAAAMMJJ-HHMM.json', () => {
  assert.equal(backupFileName(new Date(2026, 9, 30, 9, 5)), 'strela-20261030-0905.json');
});

test('aller-retour : export, base vide, REMPLACER TOUT → données identiques (photo, position, partie en cours, réglages)', () => {
  const file = JSON.stringify(makeBackup(LOCAL, { app: '0.3.0', dbVersion: 1, now: new Date(Date.UTC(2026, 9, 30)) }));
  const b = parseBackup(file);
  assert.deepEqual(b.summary, { players: 2, games: 1, current: true, exportedAt: '2026-10-30T00:00:00.000Z', app: '0.3.0' });
  const plan = importPlan(EMPTY, b, 'replace');
  assert.deepEqual(plan.state.players, P);
  assert.deepEqual(plan.state.games, G);
  const { ui, ...cur } = CUR;
  assert.deepEqual(plan.state.current, cur, 'partie en cours, sans l’état d’affichage');
  assert.deepEqual(plan.state.display, LOCAL.display);
  assert.deepEqual(plan.state.lastSetup, LOCAL.lastSetup);
  assert.deepEqual(plan.ops.slice(0, 2), [{ store: 'players', clear: true }, { store: 'games', clear: true }], 'tout est remplacé, en une transaction');
  assert.ok(!file.includes('"ui"'));
});

test('FUSIONNER : ajoute ce qui manque, sans doublon ; garde ce qui existe ici', () => {
  const b = parseBackup(JSON.stringify(makeBackup(LOCAL)));
  const local = { ...EMPTY, players: [{ ...P[0], name: 'Alpha (ici)' }], games: [] };
  const plan = importPlan(local, b, 'merge');
  assert.deepEqual(plan.state.players.map(p => p.name), ['Alpha (ici)', 'Bravo']);
  assert.deepEqual(plan.counts, { playersAdded: 1, gamesAdded: 2, currentSkipped: false });
  assert.equal(plan.state.current.id, 'g2', 'pas de partie en cours ici : celle de la sauvegarde est reprise');
  assert.deepEqual(plan.state.display, EMPTY.display, 'réglages d’ici gardés');
  // Deuxième fusion du même fichier : rien de plus.
  const again = importPlan(plan.state, b, 'merge');
  assert.deepEqual(again.counts, { playersAdded: 0, gamesAdded: 0, currentSkipped: false });
  assert.deepEqual(again.ops, []);
  // Une partie déjà en cours ici : celle de la sauvegarde va dans l'historique, abandonnée.
  const busy = importPlan({ ...EMPTY, current: { ...CUR, id: 'gx' } }, b, 'merge');
  assert.equal(busy.state.current.id, 'gx');
  assert.equal(busy.counts.currentSkipped, true);
  assert.deepEqual(busy.state.games.find(g => g.id === 'g2').abandoned, true);
});

test('fichier refusé avec un message clair : illisible, pas Strela, version future, partie ou joueur abîmé', () => {
  const ok = makeBackup(LOCAL);
  const refuse = (data, re) => assert.throws(() => parseBackup(typeof data === 'string' ? data : JSON.stringify(data)), e => e instanceof BackupError && re.test(e.message));
  refuse('{pas du json', /illisible/);
  refuse({ hello: 1 }, /pas une sauvegarde Strela/);
  refuse({ ...ok, version: BACKUP_VERSION + 1, app: '9.0.0' }, /version plus récente de Strela \(9\.0\.0\)/);
  refuse({ ...ok, games: [{ ...ok.games[0], darts: [{ segment: 25, multiplier: 3 }] }] }, /partie n° 1 illisible/);
  refuse({ ...ok, games: [{ ...ok.games[0], config: { ...config, startScore: 400 } }] }, /partie n° 1 illisible/);
  refuse({ ...ok, players: [ok.players[0], ok.players[0]] }, /en double/);
  refuse({ ...ok, players: [{ ...ok.players[0], avatar: { kind: 'photo', color: 1, photo: 'javascript:alert(1)' } }] }, /photo/);
  refuse({ ...ok, games: [ok.games[1], { ...ok.games[1], id: 'g9' }] }, /plusieurs parties en cours/);
});

test('sauvegarde d\'avant le lot 4 (sans préférences de finition) : valeurs par défaut', () => {
  const old = makeBackup(LOCAL, { app: '0.3.0' });
  for (const p of old.players) delete p.checkout;
  const b = parseBackup(JSON.stringify(old));
  assert.deepEqual(b.players.map(p => p.checkout), [{ double: 20, avoidBull: false }, { double: 20, avoidBull: false }]);
});

