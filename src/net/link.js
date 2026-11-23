// Strela — liaison de la partie en ligne (lot 9.2) : WebRTC (canal de données) de téléphone à téléphone, établi par la
// signalisation (signal.js). L'hôte écoute sous l'identifiant du code de salon ; chaque invité l'appelle. Ensuite tout
// passe directement entre les téléphones (chiffré par WebRTC) : messages JSON, découpés s'ils sont longs, présence
// vérifiée toutes les 2 s (un téléphone muet 8 s est perdu). Pas de dépendance à la passerelle Android : la WebView et
// les navigateurs ont WebRTC.
// Serveurs STUN publics (Google, Cloudflare) pour trouver le chemin ; pas de relais TURN (aucun gratuit et fiable sans
// compte) : certains réseaux (4G d'opérateur, Wi-Fi d'entreprise) empêchent alors la connexion directe — docs/enligne.md.

import { openSignal, SignalError } from './signal.js';
import { hostPeerId } from '../engine/online.js';

export const ICE_SERVERS = Object.freeze([
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
]);
const PING_MS = 2000;
const LOST_MS = 8000;
const CHUNK = 15000;

export const webrtcAvailable = () => typeof globalThis.RTCPeerConnection === 'function';

/** Canal de données : envoi (découpé au-delà de 15 000 caractères), réception recomposée, présence. */
function wire(ch, onMessage, onDead) {
  let last = Date.now();
  const parts = new Map();
  const ping = setInterval(() => {
    if (Date.now() - last > LOST_MS) { stop(); onDead(); return; }
    try { if (ch.readyState === 'open') ch.send('{"t":"ping"}'); } catch (e) { /* */ }
  }, PING_MS);
  let stopped = false;
  function stop() { if (stopped) return; stopped = true; clearInterval(ping); }
  ch.onmessage = ev => {
    last = Date.now();
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'ping') return;
    if (m.t === 'part') {
      const p = parts.get(m.id) || [];
      p[m.i] = m.d;
      parts.set(m.id, p);
      if (p.filter(x => x !== undefined).length === m.n) {
        parts.delete(m.id);
        try { m = JSON.parse(p.join('')); } catch (e) { return; }
      } else return;
    }
    onMessage(m);
  };
  ch.onclose = () => { stop(); onDead(); };
  return {
    send(msg) {
      if (ch.readyState !== 'open') return false;
      const s = JSON.stringify(msg);
      try {
        if (s.length <= CHUNK) ch.send(s);
        else {
          const id = Math.random().toString(36).slice(2, 9);
          const n = Math.ceil(s.length / CHUNK);
          for (let i = 0; i < n; i++) ch.send(JSON.stringify({ t: 'part', id, i, n, d: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
        }
        return true;
      } catch (e) { return false; }
    },
    close() { stop(); try { ch.close(); } catch (e) { /* */ } },
  };
}

function newPc() { return new RTCPeerConnection({ iceServers: ICE_SERVERS }); }

/**
 * Hôte : écoute sous le code `code`. `on` : { open(peer), message(peer, msg), close(peer), signal(state) } ; state =
 * 'online' | 'offline' (la signalisation est tombée : les téléphones déjà connectés continuent, une reconnexion attend
 * qu'elle revienne, essayée toutes les 5 s). Rejette avec SignalError ('taken' : code déjà pris).
 */
export async function hostLink(code, on) {
  const peers = new Map(); // peer → { pc, link, pending: [candidats arrivés avant l'offre] }
  let sig = await openSignal(hostPeerId(code));
  let closed = false;
  let retry = 0;
  const drop = peer => {
    const p = peers.get(peer);
    if (!p) return;
    peers.delete(peer);
    try { p.link && p.link.close(); } catch (e) { /* */ }
    try { p.pc.close(); } catch (e) { /* */ }
    on.close && on.close(peer);
  };
  async function onSignal({ type, src, payload }) {
    if (!src) return;
    if (type === 'OFFER' && payload && payload.sdp) {
      if (peers.has(src)) drop(src);
      const pc = newPc();
      const entry = { pc, link: null };
      peers.set(src, entry);
      pc.onicecandidate = ev => { if (ev.candidate) sig.send(src, 'CANDIDATE', { candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate }); };
      pc.ondatachannel = ev => {
        const ch = ev.channel;
        ch.onopen = () => {
          entry.link = wire(ch, msg => on.message && on.message(src, msg), () => drop(src));
          on.open && on.open(src);
        };
      };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(src); };
      try {
        await pc.setRemoteDescription(payload.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        sig.send(src, 'ANSWER', { sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription });
      } catch (e) { drop(src); }
    } else if (type === 'CANDIDATE' && payload && payload.candidate) {
      const p = peers.get(src);
      if (p) try { await p.pc.addIceCandidate(payload.candidate); } catch (e) { /* */ }
    }
  }
  function watch() {
    sig.onmessage = m => { onSignal(m); };
    sig.onclose = () => {
      if (closed) return;
      on.signal && on.signal('offline');
      clearTimeout(retry);
      const again = () => {
        if (closed) return;
        openSignal(hostPeerId(code)).then(s => { sig = s; watch(); on.signal && on.signal('online'); })
          .catch(() => { retry = setTimeout(again, 5000); });
      };
      retry = setTimeout(again, 2000);
    };
  }
  watch();
  return {
    send(peer, msg) { const p = peers.get(peer); return !!(p && p.link && p.link.send(msg)); },
    broadcast(msg) { for (const p of peers.values()) if (p.link) p.link.send(msg); },
    drop,
    peers: () => [...peers.keys()].filter(k => peers.get(k).link),
    close() { closed = true; clearTimeout(retry); for (const k of [...peers.keys()]) drop(k); sig.close(); },
  };
}

/**
 * Invité : appelle l'hôte du salon `code`. Résout quand le canal est ouvert : { id, send(msg), close() } ; `on` :
 * { message(msg), close() }. Rejette avec SignalError : 'network', 'no-host' (pas d'hôte à ce code), 'timeout'.
 */
export async function guestLink(code, on, { timeout = 20000 } = {}) {
  const myId = `strela-g-${Math.random().toString(36).slice(2, 10)}`;
  const sig = await openSignal(myId);
  const dst = hostPeerId(code);
  const pc = newPc();
  const ch = pc.createDataChannel('strela', { ordered: true });
  let done = false;
  let link = null;
  const close = () => { try { link && link.close(); } catch (e) { /* */ } try { pc.close(); } catch (e) { /* */ } sig.close(); };
  return new Promise((resolve, reject) => {
    const fail = code2 => { if (done) return; done = true; clearTimeout(timer); close(); reject(new SignalError(code2)); };
    const timer = setTimeout(() => fail('timeout'), timeout);
    sig.onmessage = async ({ type, src, payload }) => {
      if (type === 'EXPIRE' || (type === 'ERROR' && !done)) { fail('no-host'); return; }
      if (src !== dst) return;
      try {
        if (type === 'ANSWER' && payload && payload.sdp) await pc.setRemoteDescription(payload.sdp);
        else if (type === 'CANDIDATE' && payload && payload.candidate) await pc.addIceCandidate(payload.candidate);
      } catch (e) { /* candidat refusé : les autres suffisent */ }
    };
    pc.onicecandidate = ev => { if (ev.candidate) sig.send(dst, 'CANDIDATE', { candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') fail('unreachable'); };
    ch.onopen = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sig.close(); // plus besoin de la signalisation : tout passe par le canal
      link = wire(ch, msg => on.message && on.message(msg), () => { try { pc.close(); } catch (e) { /* */ } on.close && on.close(); });
      resolve({ id: myId, send: msg => link.send(msg), close });
    };
    (async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer());
        sig.send(dst, 'OFFER', { sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription });
      } catch (e) { fail('network'); }
    })();
  });
}
