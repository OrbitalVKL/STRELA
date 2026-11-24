// Lot 9.5 (A1, B) : signalisation à plusieurs services (PeerJS, puis courtiers MQTT en repli) et journal de débogage.
// Dans node (WebSocket de Node 22) contre le serveur local de tools/lib/signal-server.mjs (PeerJS et MQTT).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signalServer } from '../tools/lib/signal-server.mjs';
import { openSignal, openSignals, parseServices, mqtt, SERVICES, SignalError, peerjsPayload, peerjsValid } from '../src/net/signal.js';
import { candidateType } from '../src/net/link.js';
import { log, trim, journalLines, journalText, journalFileName, clearJournal, setJournal, resetJournalForTests, brief, KEEP_MS } from '../src/ui/journal.js';

const hasWS = typeof globalThis.WebSocket === 'function';
const next = (sig, type) => new Promise(res => { sig.onmessage = m => { if (m.type === type) res(m); }; });
const OFFER = { sdp: { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' } };
const ANSWER = { sdp: { type: 'answer', sdp: 'v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\n' } };

test('services : PeerJS d\'abord, puis deux courtiers MQTT ; liste donnée par la page', () => {
  assert.deepEqual(SERVICES.map(s => s.kind), ['peerjs', 'mqtt', 'mqtt']);
  assert.ok(SERVICES.every(s => s.url.startsWith('wss://')));
  assert.deepEqual(parseServices('ws://a/peerjs').map(s => [s.kind, s.url]), [['peerjs', 'ws://a/peerjs']]);
  assert.deepEqual(parseServices('peerjs:ws://a/peerjs, mqtt:ws://b/mqtt').map(s => s.kind), ['peerjs', 'mqtt']);
  assert.deepEqual(parseServices('n\'importe quoi'), []);
});

test('MQTT : paquets CONNECT, SUBSCRIBE, PUBLISH relus', () => {
  const c = mqtt.connect('strela-abc');
  assert.equal(c[0], 0x10);
  const pub = mqtt.publish('strela/v1/x', 'é{"a":1}');
  const both = new Uint8Array([...pub, ...mqtt.ping(), 0x30]); // un paquet incomplet à la fin
  const { packets, rest } = mqtt.read(both);
  assert.equal(packets.length, 2);
  assert.deepEqual(mqtt.message(packets[0]), { topic: 'strela/v1/x', text: 'é{"a":1}' });
  assert.equal(packets[1].type, 12);
  assert.equal(rest.length, 1);
  // Longueur sur deux octets (plus de 127).
  const long = mqtt.publish('t', 'x'.repeat(300));
  assert.equal(mqtt.message(mqtt.read(long).packets[0]).text.length, 300);
});

test('PeerJS : forme des messages exigée par le serveur public (relevée le 24/11 sur 0.peerjs.com)', () => {
  const m = (type, payload) => ({ type, dst: 'strela-x', payload });
  // Ce qu'envoyait la 0.20.0 : refusé (le serveur coupait la liaison de l'invité, l'hôte ne recevait rien).
  assert.equal(peerjsValid(m('OFFER', OFFER)), false);
  assert.equal(peerjsValid(m('ANSWER', ANSWER)), false);
  assert.equal(peerjsValid(m('CANDIDATE', { candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host' } })), false);
  // Avec les champs de la bibliothèque officielle : accepté.
  assert.equal(peerjsValid(m('OFFER', peerjsPayload(OFFER, 'dc_a'))), true);
  assert.equal(peerjsValid(m('ANSWER', peerjsPayload(ANSWER, 'dc_a'))), true);
  assert.equal(peerjsValid(m('CANDIDATE', peerjsPayload({ candidate: { candidate: '' } }, 'dc_a'))), true);
  // Règles relevées : offre sans libellé, SDP mal formée, type de réponse inversé, autre type de message → refusé.
  assert.equal(peerjsValid(m('OFFER', { ...OFFER, type: 'data', connectionId: 'dc_a' })), false);
  assert.equal(peerjsValid(m('OFFER', peerjsPayload({ sdp: { type: 'offer', sdp: 'v=0' } }, 'dc_a'))), false);
  assert.equal(peerjsValid(m('OFFER', peerjsPayload(ANSWER, 'dc_a'))), false);
  assert.equal(peerjsValid(m('EXPIRE', peerjsPayload({}, 'dc_a'))), false);
  assert.equal(peerjsValid(m('PROBE', peerjsPayload({}, 'dc_a'))), false);
  // Les champs de Strela restent lisibles à l'arrivée.
  assert.deepEqual(peerjsPayload(OFFER, 'dc_a').sdp, OFFER.sdp);
});

test('candidats : seul le type est gardé (jamais l\'adresse)', () => {
  assert.equal(candidateType({ candidate: 'candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host generation 0' }), 'host');
  assert.equal(candidateType('candidate:2 1 udp 1686052607 90.1.2.3 6000 typ srflx raddr 0.0.0.0 rport 0'), 'srflx');
  assert.equal(candidateType({}), '?');
});

test('signalisation MQTT : relais, code déjà pris', { skip: !hasWS && 'WebSocket absent' }, async () => {
  const srv = await signalServer();
  const service = { kind: 'mqtt', url: srv.mqttUrl, name: 'MQTT local' };
  try {
    const host = await openSignal('strela-bcdfg', { service });
    await assert.rejects(openSignal('strela-bcdfg', { service }), e => e instanceof SignalError && e.code === 'taken');
    const guest = await openSignal('strela-g-1', { service });
    const got = next(host, 'OFFER');
    guest.send('strela-bcdfg', 'OFFER', { sdp: { type: 'offer', sdp: 'v=0' } });
    const m = await got;
    assert.equal(m.src, 'strela-g-1');
    assert.equal(m.payload.sdp.sdp, 'v=0');
    const back = next(guest, 'ANSWER');
    host.send(m.src, 'ANSWER', { sdp: { type: 'answer' } });
    assert.equal((await back).src, 'strela-bcdfg');
    host.close(); guest.close();
  } finally { await srv.close(); }
});

test('hôte sur tous les services ; PeerJS en panne : l\'invité passe par MQTT', { skip: !hasWS && 'WebSocket absent' }, async () => {
  const srv = await signalServer();
  const services = [{ kind: 'peerjs', url: srv.url, name: 'PeerJS local' }, { kind: 'mqtt', url: srv.mqttUrl, name: 'MQTT local' }];
  try {
    srv.peerjsDown = true;
    const host = await openSignals('strela-hjkmn', { services, timeout: 3000, retryMs: 300 });
    assert.deepEqual(host.status().map(s => s.state), ['down', 'open']);
    // Le PeerJS revient : l'hôte s'y rebranche de lui-même.
    srv.peerjsDown = false;
    await new Promise(r => { const t = setInterval(() => { if (host.status()[0].state === 'open') { clearInterval(t); r(); } }, 50); });
    // Un invité par chacun des deux services ; la réponse repart par le service d'où l'offre est venue.
    for (const service of services) {
      const g = await openSignal(`strela-g-${service.kind}`, { service });
      const got = next(host, 'OFFER');
      assert.equal(g.send('strela-hjkmn', 'OFFER', OFFER), true);
      const m = await got;
      assert.equal(m.service, service.name);
      assert.deepEqual(m.payload.sdp, OFFER.sdp);
      const back = next(g, 'ANSWER');
      host.send(m.src, 'ANSWER', ANSWER);
      assert.deepEqual((await back).payload.sdp, ANSWER.sdp);
      g.close();
    }
    assert.equal(srv.cut, 0, 'aucun message refusé par le serveur');
    // Un message à l'ancienne forme, envoyé à la main : le serveur coupe la liaison de l'expéditeur, rien n'arrive.
    const raw = new WebSocket(`${srv.url}?key=peerjs&id=strela-g-brut&token=t`);
    await new Promise(r => { raw.onmessage = r; });
    const cut = new Promise(r => { raw.onclose = ev => r(ev.code); });
    raw.send(JSON.stringify({ type: 'OFFER', dst: 'strela-hjkmn', payload: OFFER }));
    assert.equal(await cut, 1000);
    assert.equal(srv.cut, 1);
    host.close();
    // Aucun service : 'network'.
    srv.peerjsDown = true;
    await assert.rejects(openSignals('strela-x', { services: [services[0]], timeout: 2000 }), e => e.code === 'network');
  } finally { await srv.close(); }
});

test('journal : borné à 7 jours et en taille, texte exporté, coupé = rien noté', () => {
  resetJournalForTests();
  clearJournal();
  log('enligne', 'étape 1', { a: 1 });
  log('erreur', 'boum', new Error('x'));
  const l = journalLines();
  assert.equal(l.length, 2);
  assert.match(l[0][2], /étape 1 \{"a":1\}/);
  assert.match(l[1][2], /Error: x/);
  const txt = journalText('Strela v0', l);
  assert.match(txt, /^Strela v0\n\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}  EN LIGNE +étape 1/);
  assert.match(journalFileName(new Date(2026, 10, 24, 9, 5)), /^strela-journal-20261124-0905\.txt$/);
  const now = 10 * KEEP_MS;
  const old = [[now - KEEP_MS - 1, 'appli', 'vieux'], [now - 5, 'appli', 'a'.repeat(100)], [now, 'appli', 'b'.repeat(100)]];
  assert.deepEqual(trim(old, now).map(x => x[2][0]), ['a', 'b']);
  assert.deepEqual(trim(old, now, 150).map(x => x[2][0]), ['b']);
  assert.equal(brief({ x: 'y'.repeat(1000) }).length, 601);
  setJournal(false);
  log('saisie', 'rien');
  assert.equal(journalLines().length, 2);
  setJournal(true);
  clearJournal();
});
