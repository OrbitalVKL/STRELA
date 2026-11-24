// Lot 10 (étape 4) : synchronisation des parties, moteur pur (src/engine/sync.js) : forme envoyée, traduction des
// identifiants à la réception, suppression, format trop récent, empreintes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCloud, fromCloud, fingerprint, mapRecordIds, cloudType } from '../src/engine/sync.js';
import { CLOUD_FORMAT } from '../src/engine/cloud.js';

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const MATH = 'bbbbbbbb-0000-4000-8000-000000000002';
const OTHER = 'cccccccc-0000-4000-8000-000000000003';
const game = { id: 'g1', startedAt: 1000, endedAt: 2000, config: { startScore: 301, outMode: 'double', legsToWin: 1, players: ['pG', 'u:' + MATH, 'pTsia'] },
  darts: [{ segment: 20, multiplier: 3 }], validated: 1, abandoned: false, drinks: { pTsia: [{ t: 5 }] } };

test('envoi : liens vers les profils, noms des joueurs sans compte, participations', () => {
  const row = toCloud({ ...game, ui: { x: 1 }, owner: undefined }, 'game', {
    links: { pG: ME, ['u:' + MATH]: MATH },
    names: { pTsia: { name: 'Tsia', avatar: { kind: 'initials', color: 2 } }, pAutre: { name: 'X' } },
  });
  assert.equal(row.id, 'g1');
  assert.equal(row.type, 'soiree');
  assert.equal(row.jeu, 'x01');
  assert.equal(row.fmt, CLOUD_FORMAT);
  assert.equal(row.etat, 'terminee');
  assert.deepEqual(row.donnees.links, { pG: ME, ['u:' + MATH]: MATH });
  assert.deepEqual(Object.keys(row.donnees.names), ['pTsia'], 'seulement les joueurs de la partie');
  assert.equal(row.donnees.rec.ui, undefined, 'pas d\'état d\'affichage');
  assert.deepEqual(row.joueurs, [{ ordre: 0, profil: ME, local: 'pG' }, { ordre: 1, profil: MATH, local: 'u:' + MATH }, { ordre: 2, local: 'pTsia' }]);
  assert.equal(cloudType({ online: { code: 'X' } }, 'game'), 'enligne');
  assert.equal(toCloud({ ...game, abandoned: true }, 'game').etat, 'abandonnee');
  const tr = toCloud({ id: 't1', startedAt: 1, endedAt: 2, player: 'pG', exercise: 'groupement', darts: [], stopped: true }, 'training', { links: { pG: ME } });
  assert.equal(tr.type, 'entrainement');
  assert.equal(tr.jeu, 'groupement');
  assert.equal(tr.etat, 'abandonnee');
});

test('réception chez Mathilde : elle-même, son ami, un joueur sans compte, un inconnu', () => {
  const row = { ...toCloud(game, 'game', { links: { pG: ME, ['u:' + MATH]: MATH }, names: { pTsia: { name: 'Tsia', avatar: { kind: 'initials', color: 2 } } } }), createur: ME, maj: 123 };
  // Chez Mathilde : son joueur de profil s'appelle « m1 » ; Guillaume est un ami fusionné dans son joueur local « mG ».
  const r = fromCloud(row, { me: MATH, meLocal: 'm1', friends: { [ME]: 'mG' } });
  assert.equal(r.action, 'put');
  assert.deepEqual(r.rec.config.players, ['mG', 'm1', 'pTsia']);
  assert.deepEqual(r.rec.drinks, { pTsia: [{ t: 5 }] });
  assert.equal(r.rec.owner, ME, 'créée par Guillaume : en lecture seule chez elle');
  assert.equal(r.rec.cloudMaj, 123);
  assert.deepEqual(r.remotes, [{ id: 'pTsia', name: 'Tsia', avatar: { kind: 'initials', color: 2 } }]);
  // Chez un troisième (ami de Guillaume, pas de Mathilde) : Mathilde inconnue → « u:<uuid> » distant.
  const r3 = fromCloud(row, { me: OTHER, meLocal: 'o1', friends: { [ME]: 'u:' + ME } });
  assert.deepEqual(r3.rec.config.players, ['u:' + ME, 'u:' + MATH, 'pTsia']);
  assert.deepEqual(r3.remotes.map(x => x.id), ['u:' + MATH, 'pTsia']);
  // Ma propre partie (autre téléphone du même compte) : pas de créateur.
  const mine = fromCloud(row, { me: ME, meLocal: 'pG2', friends: { [MATH]: 'u:' + MATH } });
  assert.equal(mine.rec.owner, undefined);
  assert.equal(mine.mine, true);
  assert.deepEqual(mine.rec.config.players, ['pG2', 'u:' + MATH, 'pTsia']);
});

test('réception : suppression, format trop récent, illisible', () => {
  assert.deepEqual(fromCloud({ id: 'g1', etat: 'supprimee', createur: ME, donnees: null }, { me: MATH }), { action: 'delete', id: 'g1', createur: ME });
  assert.deepEqual(fromCloud({ id: 'g2', etat: 'terminee', fmt: CLOUD_FORMAT + 1, donnees: {} }, { me: MATH }), { action: 'tooNew', id: 'g2', fmt: CLOUD_FORMAT + 1 });
  assert.equal(fromCloud({ id: 'g3', etat: 'terminee', fmt: 1, donnees: { kind: 'game', rec: { id: 'autre' } } }, { me: MATH }).action, 'skip');
  assert.equal(fromCloud({ id: 'g4', etat: 'terminee', fmt: 1, donnees: { kind: 'game', rec: { id: 'g4', config: {} } } }, { me: MATH }).action, 'skip');
  assert.equal(fromCloud(null).action, 'skip');
});

test('empreintes et traduction', () => {
  assert.equal(fingerprint({ a: 1 }), fingerprint({ a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
  const t = mapRecordIds({ id: 't', player: 'a' }, 'training', { a: 'b' });
  assert.equal(t.player, 'b');
  const g = mapRecordIds({ ...game, online: { code: 'BCD23', me: 'pG', host: 'pTsia' } }, 'game', { pG: 'x', pTsia: 'y' });
  assert.deepEqual(g.online, { code: 'BCD23', me: 'x', host: 'y' });
  assert.deepEqual(g.drinks, { y: [{ t: 5 }] });
});
