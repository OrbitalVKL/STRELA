// Lot 9.2 : partie en ligne — moteur de synchronisation sans réseau (src/engine/online.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCode, cleanCode, hostPeerId, joinUrl, codeFromUrl, playerCard, createRoom, roomPlayers, hostReceive, hostCommit, hostStart,
  hostEnd, hostMemberStatus, hostExclude, hostOrder, hostSetup, createGuest, guestReceive, helloMsg, intentMsg, PROTO, MAX_PHONES } from '../src/engine/online.js';

const P = (id, name = id) => ({ id, name, avatar: { kind: 'initials' }, color: 2, extra: 'pas transmis' });
const host = () => createRoom({ code: 'BCD23', hostPeer: 'h', hostPlayer: P('pA', 'Guillaume') });
const join = (room, peer, player) => hostReceive(room, peer, helloMsg(createGuest(), player));
const game = (players, darts = []) => ({ id: 'g-1', config: { startScore: 501, outMode: 'double', legsToWin: 1, players }, darts, validated: 0 });

test('codes de salon : 5 caractères lisibles, nettoyés, liens', () => {
  const seq = [0, 0.1, 0.5, 0.9, 0.999];
  let i = 0;
  const c = makeCode(() => seq[i++ % seq.length]);
  assert.equal(c.length, 5);
  assert.match(c, /^[2-9BCDFGHJKMNPQRSTVWXZ]{5}$/);
  for (let k = 0; k < 200; k++) assert.ok(cleanCode(makeCode()), 'tout code fabriqué est valide');
  assert.equal(cleanCode(' bcd-23 '), 'BCD23');
  assert.equal(cleanCode('BCD2O'), null, 'pas de O');
  assert.equal(cleanCode('BCD2'), null);
  assert.equal(hostPeerId('BCD23'), 'strela-bcd23');
  assert.equal(joinUrl('BCD23'), 'https://orbitalvkl.github.io/STRELA/rejoindre.html#BCD23');
  assert.equal(codeFromUrl(joinUrl('BCD23')), 'BCD23');
  assert.equal(codeFromUrl('https://x/?salon=bcd23'), 'BCD23');
  assert.equal(codeFromUrl('https://x/'), null);
});

test('fiche transmise : seulement ce qu\'il faut', () => {
  const c = playerCard({ ...P('p1', 'Tsia'), turnAnim: 'ours', checkout: { double: 16 } });
  assert.deepEqual(Object.keys(c).sort(), ['avatar', 'checkout', 'color', 'id', 'name', 'turnAnim']);
  assert.equal(playerCard(null), null);
});

test('salon : arrivées, liste en direct, complet, même joueur refusé, version', () => {
  let r = host();
  let x = join(r, 'g1', P('pB', 'Mathilde'));
  r = x.room;
  assert.equal(r.members.length, 2);
  assert.equal(x.out[0].to, '*');
  assert.equal(x.out[0].msg.t, 'room');
  assert.equal(x.out[0].msg.seq, 1);
  assert.equal(r.members[1].player.extra, undefined);
  // Même joueur qu'un autre téléphone : refusé.
  x = join(r, 'g2', P('pB'));
  assert.equal(x.out[0].msg.t, 'kick');
  assert.equal(x.out[0].msg.reason, 'same-player');
  assert.equal(x.room.members.length, 2);
  // Autre version de Strela.
  x = hostReceive(r, 'g9', { ...helloMsg(createGuest(), P('pZ')), proto: PROTO + 1 });
  assert.equal(x.out[0].msg.reason, 'version');
  // Jusqu'à 4 téléphones.
  r = join(r, 'g2', P('pC')).room;
  r = join(r, 'g3', P('pD')).room;
  assert.equal(r.members.length, MAX_PHONES);
  assert.equal(join(r, 'g4', P('pE')).out[0].msg.reason, 'full');
  assert.deepEqual(roomPlayers(r), ['pA', 'pB', 'pC', 'pD']);
  // Ordre manuel, réglages, changement de joueur.
  r = hostOrder(r, ['pC', 'pA']).room;
  assert.deepEqual(roomPlayers(r), ['pC', 'pA', 'pB', 'pD']);
  r = hostSetup(r, { game: 'cricket', ckMode: 'sans' }).room;
  assert.equal(r.setup.game, 'cricket');
  r = hostReceive(r, 'g3', { t: 'pick', player: P('pF', 'Atila') }).room;
  assert.equal(r.members.find(m => m.peer === 'g3').player.name, 'Atila');
  // Départ dans le salon : retiré ; téléphone perdu dans le salon : retiré aussi.
  r = hostReceive(r, 'g3', { t: 'bye' }).room;
  r = hostMemberStatus(r, 'g2', 'lost').room;
  assert.deepEqual(r.members.map(m => m.peer), ['h', 'g1']);
});

test('en jeu : seul le lanceur saisit, annule, valide ; l\'hôte diffuse des opérations numérotées', () => {
  let r = join(host(), 'g1', P('pB')).room;
  let x = hostStart(r, game(['pA', 'pB']));
  r = x.room;
  assert.equal(r.phase, 'playing');
  const ctxB = { thrower: 'pB', pending: null, undoable: null };
  const ctxA = { thrower: 'pA', pending: null, undoable: null };
  // Ce n'est pas son tour.
  x = hostReceive(r, 'g1', intentMsg('dart', { segment: 20, multiplier: 3 }), ctxA);
  assert.equal(x.op, null);
  assert.equal(x.out[0].msg.t, 'reject');
  assert.equal(x.out[0].msg.reason, 'not-your-turn');
  // Son tour : accepté, l'hôte applique puis diffuse.
  x = hostReceive(r, 'g1', intentMsg('dart', { segment: 20, multiplier: 3, ring: 'in' }), ctxB);
  assert.deepEqual(x.op, { op: 'dart', dart: { segment: 20, multiplier: 3 }, by: 'pB' });
  const c = hostCommit(r, x.op, game(['pA', 'pB'], [{ segment: 20, multiplier: 3 }]));
  r = c.room;
  assert.equal(c.out[0].msg.n, 1);
  assert.equal(r.ops, 1);
  assert.equal(r.game.darts.length, 1);
  // Annuler : seulement le lanceur, tant que la volée n'est pas validée.
  assert.equal(hostReceive(r, 'g1', intentMsg('undo'), { undoable: 'pA' }).out[0].msg.reason, 'not-yours');
  assert.deepEqual(hostReceive(r, 'g1', intentMsg('undo'), { undoable: 'pB' }).op, { op: 'undo', by: 'pB' });
  assert.equal(hostReceive(r, 'g1', intentMsg('undo'), { undoable: null }).op, null);
  // Valider : le lanceur dont la volée attend.
  assert.deepEqual(hostReceive(r, 'g1', intentMsg('validate'), { pending: 'pB' }).op, { op: 'validate', by: 'pB' });
  // Inconnu, fléchette mal formée.
  assert.equal(hostReceive(r, 'zz', intentMsg('validate'), { pending: 'pB' }).out[0].msg.reason, 'unknown');
  assert.equal(hostReceive(r, 'g1', { t: 'intent', id: 'x', op: 'dart', dart: { segment: 'a' } }, ctxB).out[0].msg.reason, 'bad-dart');
});

test('invité : applique dans l\'ordre, ignore les doublons, redemande tout après un trou', () => {
  let g = createGuest();
  const room = { ...hostStart(join(host(), 'g1', P('pB')).room, game(['pA', 'pB'])).room, seq: 3 };
  let x = guestReceive(g, { t: 'room', seq: 3, room });
  assert.ok(x.snapshot, 'première partie reçue : adoptée');
  g = x.guest;
  x = guestReceive(g, { t: 'op', seq: 4, n: 1, op: 'dart', dart: { segment: 20, multiplier: 1 }, by: 'pA' });
  assert.deepEqual(x.apply, [{ op: 'dart', dart: { segment: 20, multiplier: 1 }, by: 'pA' }]);
  g = x.guest;
  // Doublon (même seq) : rien.
  assert.equal(guestReceive(g, { t: 'op', seq: 4, n: 1, op: 'dart', dart: { segment: 20, multiplier: 1 } }).apply.length, 0);
  // Trou (n = 3 au lieu de 2) : resync.
  x = guestReceive(g, { t: 'op', seq: 6, n: 3, op: 'validate', by: 'pA' });
  assert.equal(x.resync, true);
  assert.equal(x.apply.length, 0);
  // État complet au même point : rien à remplacer ; plus loin : adopté.
  const same = { ...room, ops: 1 };
  assert.equal(guestReceive(g, { t: 'room', seq: 7, room: same }).snapshot, null);
  assert.ok(guestReceive(g, { t: 'room', seq: 7, room: { ...room, ops: 3 } }).snapshot);
  // Refus et exclusion.
  assert.equal(guestReceive(g, { t: 'reject', seq: 1, id: 'a', reason: 'paused' }).reject, 'paused');
  assert.equal(guestReceive(g, { t: 'kick', seq: 0, reason: 'full' }).kick, 'full');
});

test('coupure : pause pour tous, reprise au retour, exclusion par l\'hôte, hôte qui garde la partie', () => {
  let r = join(join(host(), 'g1', P('pB')).room, 'g2', P('pC')).room;
  r = hostStart(r, game(['pA', 'pB', 'pC'])).room;
  r = hostMemberStatus(r, 'g1', 'lost').room;
  assert.deepEqual(r.paused, { peer: 'g1', player: 'pB' });
  assert.equal(r.members.length, 3, 'en jeu, un téléphone perdu reste membre');
  // Pendant la pause : tout est refusé.
  assert.equal(hostReceive(r, 'g2', intentMsg('dart', { segment: 1, multiplier: 1 }), { thrower: 'pC' }).out[0].msg.reason, 'paused');
  // Retour (nouvel identifiant de connexion, même joueur) : reprise, état complet envoyé.
  const x = hostReceive(r, 'g1-bis', helloMsg(createGuest(), P('pB')));
  assert.equal(x.room.paused, null);
  assert.equal(x.room.members.find(m => m.player.id === 'pB').peer, 'g1-bis');
  assert.equal(x.out[0].msg.t, 'room');
  assert.equal(x.out[0].msg.room.game.id, 'g-1');
  // Un inconnu ne peut pas entrer dans une partie lancée.
  assert.equal(hostReceive(r, 'g7', helloMsg(createGuest(), P('pZ'))).out[0].msg.reason, 'started');
  // Passer son tour : la partie reprend, jusqu'à son retour.
  let s2 = hostExclude(r, 'pB', { forever: false }).room;
  assert.equal(s2.paused, null);
  assert.deepEqual(s2.skip, ['pB']);
  s2 = hostReceive(s2, 'g1-ter', helloMsg(createGuest(), P('pB'))).room;
  assert.deepEqual(s2.skip, [], 'de retour, il rejoue');
  // Exclusion : la partie reprend sans lui, même s'il revient.
  r = hostExclude(r, 'pB').room;
  assert.equal(r.paused, null);
  assert.deepEqual(r.out, ['pB']);
  assert.deepEqual(hostReceive(r, 'g1-q', helloMsg(createGuest(), P('pB'))).room.out, ['pB']);
  // Fin : retour au salon, les perdus partent.
  r = hostEnd(r).room;
  assert.equal(r.phase, 'lobby');
  assert.equal(r.game, null);
  assert.deepEqual(r.members.map(m => m.peer), ['h', 'g2']);
  assert.equal(r.lastGame.id, 'g-1');
});

test('séquence : chaque diffusion de l\'hôte avance d\'un cran', () => {
  let r = host();
  const seqs = [];
  for (const f of [rr => join(rr, 'g1', P('pB')), rr => hostSetup(rr, { legsToWin: 2 }), rr => hostStart(rr, game(['pA', 'pB'])), rr => hostCommit(rr, { op: 'dart', dart: { segment: 5, multiplier: 1 }, by: 'pA' })]) {
    const x = f(r);
    r = x.room;
    seqs.push(x.out[0].msg.seq);
  }
  assert.deepEqual(seqs, [1, 2, 3, 4]);
});
