// Strela — signalisation de la partie en ligne (lot 9.2 ; plusieurs services au lot 9.5) : comment deux téléphones se
// trouvent avant de se parler directement (WebRTC). Petite interface, la même pour chaque service :
//   const s = await openSignal(id, { service })  →  { id, service, send(dst, type, payload),
//                                                    onmessage = ({ type, src, payload }) => …, onclose = () => …, close() }
// Services (lot 9.5, A1 : le serveur public de PeerJS est souvent saturé ou en panne) :
//   1. PeerJS (0.peerjs.com), son protocole sans sa bibliothèque : WebSocket, OPEN / OFFER / ANSWER / CANDIDATE /
//      EXPIRE / ID-TAKEN / HEARTBEAT ;
//   2. et 3. repli : courtiers MQTT publics et gratuits (EMQX, HiveMQ), MQTT 3.1.1 sur WebSocket écrit à la main
//      (CONNECT, SUBSCRIBE, PUBLISH en QoS 0, PINGREQ). Chaque téléphone s'abonne à « strela/v1/<id> » ; un message à
//      `dst` est publié sur le sujet de `dst`. « Identifiant pris » : à l'ouverture, PROBE sur son propre sujet, celui
//      qui l'occupe déjà répond TAKEN. Pas d'EXPIRE : l'invité conclut « pas d'hôte » faute de réponse (link.js).
// L'hôte écoute sur tous les services à la fois (openSignals) ; l'invité les essaie dans l'ordre (link.js).
// Aucun ne voit passer la partie : seulement de quoi établir la connexion (adresses réseau, empreintes de chiffrement
// de WebRTC) ; ensuite tout va directement d'un téléphone à l'autre, chiffré. Rien n'est stocké.
// Autre serveur (tests : tools/lib/signal-server.mjs) : `?signal=ws://…/peerjs` ou une liste
// `?signal=peerjs:ws://…/peerjs,mqtt:ws://…/mqtt` dans l'adresse de la page.

import { log } from '../ui/journal.js';

export const SERVICES = Object.freeze([
  Object.freeze({ kind: 'peerjs', url: 'wss://0.peerjs.com/peerjs', name: 'PeerJS' }),
  Object.freeze({ kind: 'mqtt', url: 'wss://broker.emqx.io:8084/mqtt', name: 'EMQX' }),
  Object.freeze({ kind: 'mqtt', url: 'wss://broker.hivemq.com:8884/mqtt', name: 'HiveMQ' }),
]);
const KEY = 'peerjs';
export const TOPIC = 'strela/v1/';

/** Liste « peerjs:URL,mqtt:URL » (ou une URL seule, PeerJS) → services. Pur (testé). */
export function parseServices(text) {
  return String(text || '').split(',').map(s => s.trim()).filter(Boolean).map((s, i) => {
    const m = /^(peerjs|mqtt):(.*)$/.exec(s);
    const kind = m ? m[1] : 'peerjs';
    return { kind, url: m ? m[2] : s, name: `${kind === 'mqtt' ? 'MQTT' : 'PeerJS'} ${i + 1}` };
  }).filter(s => /^wss?:\/\//.test(s.url));
}

/** Services de signalisation : ceux donnés par la page (tests), sinon PeerJS puis les deux courtiers MQTT. */
export function signalServices() {
  try {
    const q = new URLSearchParams(location.search).get('signal');
    if (q) sessionStorage.setItem('strela.signal', q);
    const list = parseServices(sessionStorage.getItem('strela.signal'));
    if (list.length) return list;
  } catch (e) { /* */ }
  return SERVICES;
}
/** Compatibilité : adresse du premier service. */
export const signalUrl = () => signalServices()[0].url;

export class SignalError extends Error {
  constructor(code, message, step = 'signal') { super(message || code); this.code = code; this.step = step; }
}

const token = () => Math.random().toString(36).slice(2, 12);

/**
 * Ouvre la signalisation sous l'identifiant `id` sur un service (le premier par défaut). Rejette avec SignalError
 * 'taken' (identifiant déjà pris : code de salon occupé), 'network' (serveur injoignable) ou 'timeout'.
 */
export function openSignal(id, { service = signalServices()[0], timeout = 8000, WS = globalThis.WebSocket } = {}) {
  const t0 = Date.now();
  const p = service.kind === 'mqtt' ? openMqtt(id, service, timeout, WS) : openPeerjs(id, service, timeout, WS);
  return p.then(api => { log('enligne', `signalisation ouverte : ${service.name} (${Date.now() - t0} ms)`); return api; },
    e => { log('enligne', `signalisation refusée : ${service.name} → ${e && e.code}${e && e.message && e.message !== e.code ? ` (${e.message})` : ''} après ${Date.now() - t0} ms`); throw e; });
}

// ------------------------------------------------------------------ PeerJS
function openPeerjs(id, service, timeout, WS) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WS(`${service.url}?key=${KEY}&id=${encodeURIComponent(id)}&token=${token()}&version=1.5.4`); } catch (e) { reject(new SignalError('network', e && e.message)); return; }
    let opened = false;
    let beat = 0;
    const api = {
      id,
      service,
      onmessage: null,
      onclose: null,
      send(dst, type, payload) {
        if (ws.readyState !== 1) return false;
        ws.send(JSON.stringify({ type, dst, payload }));
        return true;
      },
      close() {
        clearInterval(beat);
        try { ws.close(); } catch (e) { /* */ }
      },
      get open() { return ws.readyState === 1; },
    };
    const timer = setTimeout(() => { if (!opened) { api.close(); reject(new SignalError('timeout')); } }, timeout);
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'OPEN') {
        opened = true;
        clearTimeout(timer);
        beat = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'HEARTBEAT' })); }, 5000);
        resolve(api);
        return;
      }
      if (m.type === 'ID-TAKEN') { clearTimeout(timer); api.close(); reject(new SignalError('taken')); return; }
      if (m.type === 'ERROR' && !opened) { clearTimeout(timer); api.close(); reject(new SignalError('network', m.payload && m.payload.msg)); return; }
      if (api.onmessage) api.onmessage({ type: m.type, src: m.src, payload: m.payload });
    };
    ws.onerror = () => { if (!opened) { clearTimeout(timer); reject(new SignalError('network')); } };
    ws.onclose = ev => { clearInterval(beat); if (!opened) { clearTimeout(timer); reject(new SignalError('network', ev && ev.code ? `fermé ${ev.code}` : '')); } else if (api.onclose) api.onclose(); };
  });
}

// ------------------------------------------------------------------ MQTT 3.1.1 (paquets, purs et testés)
const enc = new TextEncoder();
const dec = new TextDecoder();
const str = s => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
const varint = n => { const out = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0); return out; };
const packet = (head, body) => Uint8Array.from([head, ...varint(body.length), ...body]);
export const mqtt = Object.freeze({
  connect: (clientId, keepAlive = 60) => packet(0x10, [...str('MQTT'), 4, 0x02, keepAlive >> 8, keepAlive & 255, ...str(clientId)]),
  subscribe: (packetId, topic) => packet(0x82, [packetId >> 8, packetId & 255, ...str(topic), 0]),
  publish: (topic, text) => packet(0x30, [...str(topic), ...enc.encode(text)]),
  ping: () => Uint8Array.from([0xC0, 0]),
  disconnect: () => Uint8Array.from([0xE0, 0]),
  /** Paquets complets d'un tampon : { packets: [{ type, flags, body }], rest }. */
  read(buf) {
    const packets = [];
    let i = 0;
    while (i + 2 <= buf.length) {
      let len = 0, mul = 1, j = i + 1, ok = false;
      for (let k = 0; k < 4 && j < buf.length; k++, j++) { len += (buf[j] & 127) * mul; mul *= 128; if (!(buf[j] & 128)) { ok = true; j++; break; } }
      if (!ok || j + len > buf.length) break;
      packets.push({ type: buf[i] >> 4, flags: buf[i] & 15, body: buf.subarray(j, j + len) });
      i = j + len;
    }
    return { packets, rest: buf.subarray(i) };
  },
  /** Sujet et texte d'un PUBLISH (QoS 0). */
  message(p) {
    const tl = (p.body[0] << 8) | p.body[1];
    const qos = (p.flags >> 1) & 3;
    const start = 2 + tl + (qos ? 2 : 0);
    return { topic: dec.decode(p.body.subarray(2, 2 + tl)), text: dec.decode(p.body.subarray(start)) };
  },
});

function openMqtt(id, service, timeout, WS) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WS(service.url, ['mqtt']); } catch (e) { reject(new SignalError('network', e && e.message)); return; }
    ws.binaryType = 'arraybuffer';
    const nonce = token();
    const mine = TOPIC + id;
    let state = 'connecting'; // connecting → subscribing → probing → open | closed
    let buf = new Uint8Array(0);
    let beat = 0, probe = 0;
    const raw = bytes => { try { if (ws.readyState === 1) { ws.send(bytes); return true; } } catch (e) { /* */ } return false; };
    const api = {
      id,
      service,
      onmessage: null,
      onclose: null,
      send(dst, type, payload) { return state === 'open' && raw(mqtt.publish(TOPIC + dst, JSON.stringify({ type, src: id, payload }))); },
      close() {
        state = 'closed';
        clearInterval(beat); clearTimeout(probe);
        raw(mqtt.disconnect());
        try { ws.close(); } catch (e) { /* */ }
      },
      get open() { return state === 'open' && ws.readyState === 1; },
    };
    let settled = false;
    const fail = code => { if (settled) return; settled = true; clearTimeout(timer); api.close(); reject(new SignalError(code)); };
    const timer = setTimeout(() => fail('timeout'), timeout);
    ws.onopen = () => raw(mqtt.connect(`strela-${token()}`.slice(0, 23)));
    ws.onmessage = ev => {
      const chunk = new Uint8Array(ev.data instanceof ArrayBuffer ? ev.data : 0);
      const all = new Uint8Array(buf.length + chunk.length);
      all.set(buf); all.set(chunk, buf.length);
      const { packets, rest } = mqtt.read(all);
      buf = Uint8Array.from(rest);
      for (const p of packets) {
        if (p.type === 2) { // CONNACK
          if (p.body[1] !== 0) { fail('network'); return; }
          state = 'subscribing';
          raw(mqtt.subscribe(1, mine));
          beat = setInterval(() => raw(mqtt.ping()), 30000);
        } else if (p.type === 9 && state === 'subscribing') { // SUBACK
          if (p.body[2] === 0x80) { fail('network'); return; }
          state = 'probing';
          raw(mqtt.publish(mine, JSON.stringify({ type: 'PROBE', src: id, payload: { n: nonce } })));
          probe = setTimeout(() => { if (state !== 'probing') return; state = 'open'; settled = true; clearTimeout(timer); resolve(api); }, 1200);
        } else if (p.type === 3) { // PUBLISH
          let m;
          try { m = JSON.parse(mqtt.message(p).text); } catch (e) { continue; }
          if (!m || typeof m.type !== 'string') continue;
          if (m.type === 'PROBE') { if (m.payload && m.payload.n !== nonce && state === 'open') raw(mqtt.publish(mine, JSON.stringify({ type: 'TAKEN', src: id, payload: { n: m.payload.n } }))); continue; }
          if (m.type === 'TAKEN') { if (m.payload && m.payload.n === nonce && state === 'probing') fail('taken'); continue; }
          if (state === 'open' && api.onmessage && m.src !== id) api.onmessage({ type: m.type, src: m.src, payload: m.payload });
        }
      }
    };
    ws.onerror = () => { if (!settled) fail('network'); };
    ws.onclose = () => {
      clearInterval(beat); clearTimeout(probe);
      if (!settled) { fail('network'); return; }
      const was = state;
      state = 'closed';
      if (was === 'open' && api.onclose) api.onclose();
    };
  });
}

// ------------------------------------------------------------------ hôte : tous les services à la fois
/**
 * Hôte : écoute sous `id` sur tous les services. Résout dès que l'un est ouvert (les autres continuent de s'ouvrir) :
 * { id, send(dst, type, payload) (par le service d'où `dst` a écrit), onmessage, onstatus = (status) => …, status(),
 * close() } ; status() : [{ name, state: 'opening' | 'open' | 'down' }]. Un service tombé est rouvert toutes les 5 s.
 * Rejette avec 'taken' si un service dit le code pris avant toute ouverture, sinon 'network' quand tous ont échoué.
 */
export function openSignals(id, { services = signalServices(), timeout = 8000, WS = globalThis.WebSocket, retryMs = 5000 } = {}) {
  const slots = services.map(service => ({ service, state: 'opening', sig: null, retry: 0 }));
  const route = new Map(); // dst → slot
  let closed = false;
  const api = {
    id,
    onmessage: null,
    onstatus: null,
    send(dst, type, payload) {
      const s = route.get(dst);
      if (s && s.sig && s.state === 'open') return s.sig.send(dst, type, payload);
      let ok = false;
      for (const x of slots) if (x.sig && x.state === 'open') ok = x.sig.send(dst, type, payload) || ok;
      return ok;
    },
    status: () => slots.map(s => ({ name: s.service.name, state: s.state })),
    get open() { return slots.some(s => s.state === 'open'); },
    close() { closed = true; for (const s of slots) { clearTimeout(s.retry); if (s.sig) s.sig.close(); } },
  };
  const changed = () => { if (api.onstatus) api.onstatus(api.status()); };
  return new Promise((resolve, reject) => {
    let settled = false;
    const attempt = (s, first) => {
      if (closed) return;
      if (!first) { s.state = 'opening'; changed(); }
      openSignal(id, { service: s.service, timeout, WS }).then(sig => {
        if (closed) { sig.close(); return; }
        s.sig = sig; s.state = 'open';
        sig.onmessage = m => { if (m.src) route.set(m.src, s); if (api.onmessage) api.onmessage({ ...m, service: s.service.name }); };
        sig.onclose = () => { s.state = 'down'; s.sig = null; changed(); log('enligne', `signalisation perdue : ${s.service.name}`); s.retry = setTimeout(() => attempt(s, false), retryMs); };
        if (!settled) {
          settled = true;
          // Les services déjà tombés avant cette ouverture sont réessayés.
          for (const x of slots) if (x !== s && x.state === 'down' && !x.retry) x.retry = setTimeout(() => attempt(x, false), retryMs);
          resolve(api);
        }
        changed();
      }, e => {
        s.state = 'down';
        if (!settled && first && e && e.code === 'taken') { settled = true; api.close(); reject(e); return; }
        if (!settled && slots.every(x => x.state === 'down')) { settled = true; api.close(); reject(new SignalError('network')); return; }
        if (!settled) return; // pas encore de service ouvert : on attend les autres
        changed();
        if (!closed) s.retry = setTimeout(() => attempt(s, false), retryMs * (e && e.code === 'taken' ? 6 : 1));
      });
    };
    for (const s of slots) attempt(s, true);
  });
}
