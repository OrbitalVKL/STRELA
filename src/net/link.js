// Strela — liaison de la partie en ligne (lot 9.2) : WebRTC (canal de données) de téléphone à téléphone, établi par la
// signalisation (signal.js). L'hôte écoute sous l'identifiant du code de salon ; chaque invité l'appelle. Ensuite tout
// passe directement entre les téléphones (chiffré par WebRTC) : messages JSON, découpés s'ils sont longs, présence
// vérifiée toutes les 2 s (un téléphone muet 8 s est perdu). Pas de dépendance à la passerelle Android : la WebView et
// les navigateurs ont WebRTC.
// Serveurs STUN publics (Google, Cloudflare) pour trouver le chemin ; pas de relais TURN (aucun gratuit et fiable sans
// compte) : certains réseaux (4G d'opérateur, Wi-Fi d'entreprise) empêchent alors la connexion directe — docs/enligne.md.
// Lot 9.5 (A1) : chaque étape (signalisation, réponse de l'hôte, négociation, canal) est annoncée (`onStep`) et notée au
// journal, avec les types de candidats réseau (host / srflx / relay : jamais les adresses) ; délai d'abandon par étape.

import { openSignal, openSignals, signalServices, SignalError } from './signal.js';
import { log } from '../ui/journal.js';
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

/** Type d'un candidat ICE (« host », « srflx », « relay », « prflx ») : on ne garde jamais l'adresse. */
export const candidateType = c => { const m = / typ (\w+)/.exec(String((c && c.candidate) || c || '')); return m ? m[1] : '?'; };
const countTypes = () => ({ host: 0, srflx: 0, relay: 0, prflx: 0, '?': 0 });
const typesText = t => Object.entries(t).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ') || 'aucun';
const asJson = x => (x && x.toJSON ? x.toJSON() : x);

/**
 * Hôte : écoute sous le code `code`, sur tous les services de signalisation (signal.js › openSignals). `on` :
 * { open(peer), message(peer, msg), close(peer), signal(state, services) } ; state = 'online' | 'offline' (aucun
 * service joignable : les téléphones déjà connectés continuent ; les services sont réessayés toutes les 5 s) ;
 * services : [{ name, state }]. Rejette avec SignalError ('taken' : code déjà pris ; 'network' : aucun service).
 */
export async function hostLink(code, on) {
  const peers = new Map(); // peer → { pc, link, remote: types, local: types }
  const early = new Map(); // peer → candidats arrivés avant l'offre
  const sig = await openSignals(hostPeerId(code));
  let closed = false;
  const drop = peer => {
    const p = peers.get(peer);
    if (!p) return;
    peers.delete(peer);
    try { p.link && p.link.close(); } catch (e) { /* */ }
    try { p.pc.close(); } catch (e) { /* */ }
    on.close && on.close(peer);
  };
  async function onSignal({ type, src, payload, service }) {
    if (!src) return;
    if (type === 'OFFER' && payload && payload.sdp) {
      if (peers.has(src)) drop(src);
      log('enligne', `hôte : offre reçue de ${src.slice(-4)} par ${service || '?'}`);
      const pc = newPc();
      const entry = { pc, link: null, local: countTypes(), remote: countTypes() };
      peers.set(src, entry);
      pc.onicecandidate = ev => { if (ev.candidate) { entry.local[candidateType(ev.candidate)]++; sig.send(src, 'CANDIDATE', { candidate: asJson(ev.candidate) }); } };
      pc.ondatachannel = ev => {
        const ch = ev.channel;
        ch.onopen = () => {
          log('enligne', `hôte : canal ouvert avec ${src.slice(-4)} (candidats locaux ${typesText(entry.local)} ; distants ${typesText(entry.remote)})`);
          entry.link = wire(ch, msg => on.message && on.message(src, msg), () => drop(src));
          on.open && on.open(src);
        };
      };
      pc.onconnectionstatechange = () => {
        log('enligne', `hôte : liaison ${src.slice(-4)} ${pc.connectionState}`);
        if (pc.connectionState === 'failed') log('enligne', `hôte : échec de la négociation avec ${src.slice(-4)} (candidats locaux ${typesText(entry.local)} ; distants ${typesText(entry.remote)})`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(src);
      };
      try {
        await pc.setRemoteDescription(payload.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        sig.send(src, 'ANSWER', { sdp: asJson(pc.localDescription) });
        for (const c of early.get(src) || []) { entry.remote[candidateType(c)]++; try { await pc.addIceCandidate(c); } catch (e) { /* */ } }
        early.delete(src);
      } catch (e) { log('enligne', 'hôte : offre illisible', e); drop(src); }
    } else if (type === 'CANDIDATE' && payload && payload.candidate) {
      const p = peers.get(src);
      if (!p) { const l = early.get(src) || []; if (l.length < 40) l.push(payload.candidate); early.set(src, l); return; }
      p.remote[candidateType(payload.candidate)]++;
      try { await p.pc.addIceCandidate(payload.candidate); } catch (e) { /* */ }
    }
  }
  sig.onmessage = m => { onSignal(m); };
  let wasOnline = true;
  sig.onstatus = list => {
    if (closed) return;
    const online = list.some(s => s.state === 'open');
    if (online !== wasOnline) log('enligne', `hôte : signalisation ${online ? 'revenue' : 'perdue'} (${list.map(s => `${s.name} ${s.state}`).join(', ')})`);
    wasOnline = online;
    on.signal && on.signal(online ? 'online' : 'offline', list);
  };
  log('enligne', `hôte : salon ouvert (${sig.status().map(s => `${s.name} ${s.state}`).join(', ')})`);
  return {
    send(peer, msg) { const p = peers.get(peer); return !!(p && p.link && p.link.send(msg)); },
    broadcast(msg) { for (const p of peers.values()) if (p.link) p.link.send(msg); },
    drop,
    peers: () => [...peers.keys()].filter(k => peers.get(k).link),
    services: () => sig.status(),
    close() { closed = true; for (const k of [...peers.keys()]) drop(k); sig.close(); },
  };
}

/** Étapes de la connexion d'un invité, dans l'ordre (affichées à l'écran, lot 9.5). */
export const STEPS = Object.freeze(['signal', 'host', 'ice', 'channel']);
export const STEP_LABEL = Object.freeze({ signal: 'Serveur de mise en relation', host: 'Réponse de l\'hôte', ice: 'Négociation entre les téléphones', channel: 'Canal de données' });

/**
 * Invité : appelle l'hôte du salon `code`. Résout quand le canal est ouvert : { id, send(msg), close() } ; `on` :
 * { message(msg), close() }. Les services de signalisation sont essayés dans l'ordre : sur chacun, l'offre part et
 * on attend la réponse de l'hôte (`answerMs`) ; puis la négociation WebRTC (`iceMs`). `onStep({ step, service })` à
 * chaque étape ; `ctl.cancel()` abandonne. Rejette avec SignalError (code, step) : 'network' (aucun service joignable),
 * 'no-host' (pas d'hôte à ce code), 'unreachable' (négociation échouée), 'timeout', 'cancelled'.
 */
export async function guestLink(code, on, { onStep = () => {}, ctl = {}, services = signalServices(), signalMs = 8000, answerMs = 8000, iceMs = 20000 } = {}) {
  const myId = `strela-g-${Math.random().toString(36).slice(2, 10)}`;
  const dst = hostPeerId(code);
  const pc = newPc();
  const ch = pc.createDataChannel('strela', { ordered: true });
  const local = [];
  const lt = countTypes(), rt = countTypes();
  let sig = null;
  let link = null;
  let done = false;
  let step = 'signal';
  let wake = null; // réveil de l'attente en cours
  const close = () => { try { link && link.close(); } catch (e) { /* */ } try { pc.close(); } catch (e) { /* */ } if (sig) sig.close(); };
  const t0 = Date.now();
  log('enligne', `invité : connexion au salon ${code}`);
  pc.onicecandidate = ev => { if (ev.candidate) { lt[candidateType(ev.candidate)]++; const c = asJson(ev.candidate); local.push(c); if (sig) sig.send(dst, 'CANDIDATE', { candidate: c }); } };
  pc.onconnectionstatechange = () => { log('enligne', `invité : liaison ${pc.connectionState}`); if (pc.connectionState === 'failed' && wake) wake('failed'); };
  const opened = new Promise(res => { ch.onopen = () => res(); });
  const wait = (ms, extra) => new Promise(res => {
    const t = setTimeout(() => { wake = null; res('timeout'); }, ms);
    wake = r => { clearTimeout(t); wake = null; res(r); };
    if (extra) extra.then(() => wake && wake('open'));
  });
  ctl.cancel = () => { if (wake) wake('cancelled'); else done = true; };
  const fail = (codeErr, st, detail = '') => {
    done = true;
    log('enligne', `invité : échec à l'étape « ${STEP_LABEL[st] || st} » : ${codeErr}${detail ? ` (${detail})` : ''} ; candidats locaux ${typesText(lt)}, distants ${typesText(rt)} ; ${Date.now() - t0} ms`);
    close();
    throw new SignalError(codeErr, codeErr, st);
  };
  try { await pc.setLocalDescription(await pc.createOffer()); } catch (e) { fail('network', 'ice', e && e.message); }
  const offer = asJson(pc.localDescription);
  let reached = 0;
  for (const service of services) {
    if (done) fail('cancelled', step);
    step = 'signal';
    onStep({ step, service: service.name });
    let s;
    try { s = await openSignal(myId, { service, timeout: signalMs }); } catch (e) { continue; }
    if (done) { s.close(); fail('cancelled', step); }
    reached++;
    sig = s;
    step = 'host';
    onStep({ step, service: service.name });
    const answered = new Promise(res => {
      sig.onmessage = async ({ type, src, payload }) => {
        if (type === 'EXPIRE') { if (wake) wake('expire'); return; }
        if (src !== dst) return;
        try {
          if (type === 'ANSWER' && payload && payload.sdp) { await pc.setRemoteDescription(payload.sdp); res(); }
          else if (type === 'CANDIDATE' && payload && payload.candidate) { rt[candidateType(payload.candidate)]++; await pc.addIceCandidate(payload.candidate); }
        } catch (e) { /* candidat refusé : les autres suffisent */ }
      };
    });
    // Coupée en attendant l'hôte : service suivant tout de suite. Pendant la négociation, les candidats déjà passés
    // peuvent suffire : on laisse finir.
    sig.onclose = () => { log('enligne', `invité : signalisation coupée par ${service.name} (étape ${step})`); if (wake && step === 'host') wake('coupé'); };
    sig.send(dst, 'OFFER', { sdp: offer });
    for (const c of local) sig.send(dst, 'CANDIDATE', { candidate: c });
    const r = await wait(answerMs, answered);
    if (r === 'cancelled') fail('cancelled', step);
    if (r !== 'open') { log('enligne', `invité : pas de réponse de l'hôte par ${service.name} (${r})`); sig.onclose = null; sig.close(); sig = null; continue; }
    log('enligne', `invité : réponse de l'hôte par ${service.name} (${Date.now() - t0} ms)`);
    step = 'ice';
    onStep({ step, service: service.name });
    const r2 = await wait(iceMs, opened);
    if (r2 === 'cancelled') fail('cancelled', step);
    if (r2 === 'failed') fail('unreachable', 'ice');
    if (r2 !== 'open') fail('timeout', pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed' ? 'channel' : 'ice', `ICE ${pc.iceConnectionState}`);
    step = 'channel';
    onStep({ step, service: service.name, done: true });
    done = true;
    sig.onclose = null;
    sig.close(); sig = null; // plus besoin de la signalisation : tout passe par le canal
    log('enligne', `invité : canal ouvert (${Date.now() - t0} ms ; candidats locaux ${typesText(lt)}, distants ${typesText(rt)})`);
    link = wire(ch, msg => on.message && on.message(msg), () => { try { pc.close(); } catch (e) { /* */ } on.close && on.close(); });
    return { id: myId, send: msg => link.send(msg), close };
  }
  return fail(reached ? 'no-host' : 'network', reached ? 'host' : 'signal');
}
