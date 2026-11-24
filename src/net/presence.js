// Strela — présence des amis (lot 10, étape 6) : Supabase Realtime, canal privé « strela-presence », protocole Phoenix
// (JSON, vsn 1.0.0) écrit à la main, sans bibliothèque. Chaque téléphone connecté s'y annonce sous l'UUID de son
// profil avec son état ({ s: 'app' | 'jeu' }) ; le serveur renvoie l'état de tous (presence_state) puis les changements
// (presence_diff). L'appli ne garde que ses amis. Les politiques de supabase/schema.sql réservent le canal aux comptes.
//
//   openPresence({ url, key, token, me, state, onChange, WS }) → { track(state), untrack(), setToken(t), close(), keys() }
//   state null : on regarde sans s'annoncer (présence masquée dans les Réglages).

const TOPIC = 'realtime:strela-presence';

/** Applique un presence_diff (ou un presence_state, `replace`) à la table clé → [métas]. Pur (testé). */
export function applyPresence(map, msg, replace = false) {
  const next = replace ? {} : { ...map };
  if (replace) {
    for (const [k, v] of Object.entries(msg || {})) if (v && Array.isArray(v.metas) && v.metas.length) next[k] = [...v.metas];
    return next;
  }
  for (const [k, v] of Object.entries((msg && msg.leaves) || {})) {
    const gone = new Set(((v && v.metas) || []).map(m => m.phx_ref));
    const left = (next[k] || []).filter(m => !gone.has(m.phx_ref));
    if (left.length) next[k] = left; else delete next[k];
  }
  for (const [k, v] of Object.entries((msg && msg.joins) || {})) {
    const add = ((v && v.metas) || []).filter(m => !(next[k] || []).some(x => x.phx_ref === m.phx_ref));
    if (add.length) next[k] = [...(next[k] || []), ...add];
  }
  return next;
}

/** État affiché d'une clé : 'jeu' si un de ses téléphones est en partie, sinon 'app', ou null (absent). */
export const presenceState = metas => (!metas || !metas.length ? null : metas.some(m => m && m.s === 'jeu') ? 'jeu' : 'app');

export function realtimeUrl(url, key) {
  return `${url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
}

export function openPresence({ url, key, token, me, state = { s: 'app' }, onChange = () => {}, onClose = () => {}, WS = globalThis.WebSocket, heartbeatMs = 25000 }) {
  let ws;
  let ref = 0;
  let joinRef = null;
  let joined = false;
  let map = {};
  let mine = state;
  let hb = null;
  let closed = false;
  const send = (topic, event, payload) => {
    if (!ws || ws.readyState !== 1) return;
    ref += 1;
    try { ws.send(JSON.stringify({ topic, event, payload, ref: String(ref), join_ref: topic === TOPIC ? joinRef : undefined })); } catch (e) { /* */ }
  };
  const track = st => { mine = st; if (joined && st) send(TOPIC, 'presence', { type: 'presence', event: 'track', payload: st }); };
  const untrack = () => { mine = null; if (joined) send(TOPIC, 'presence', { type: 'presence', event: 'untrack' }); };
  try { ws = new WS(realtimeUrl(url, key)); } catch (e) { setTimeout(() => onClose(e), 0); return { track() {}, untrack() {}, setToken() {}, close() {}, keys: () => ({}) }; }
  ws.onopen = () => {
    joinRef = String(ref + 1);
    send(TOPIC, 'phx_join', { config: { broadcast: { self: false }, presence: { key: me }, private: true }, access_token: token });
    hb = setInterval(() => send('phoenix', 'heartbeat', {}), heartbeatMs);
  };
  ws.onmessage = ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || m.topic !== TOPIC) return;
    if (m.event === 'phx_reply' && m.ref === joinRef) {
      if (m.payload && m.payload.status === 'ok') { joined = true; if (mine) track(mine); } else { closed = true; try { ws.close(); } catch (e) { /* */ } }
    } else if (m.event === 'presence_state') { map = applyPresence(map, m.payload, true); onChange(map); }
    else if (m.event === 'presence_diff') { map = applyPresence(map, m.payload); onChange(map); }
    else if (m.event === 'phx_error' || m.event === 'phx_close') { try { ws.close(); } catch (e) { /* */ } }
  };
  ws.onclose = ev => { clearInterval(hb); joined = false; map = {}; onChange(map); if (!closed) onClose(ev); };
  ws.onerror = () => {};
  return {
    track, untrack,
    setToken(t) { token = t; if (joined) send(TOPIC, 'access_token', { access_token: t }); },
    close() { closed = true; clearInterval(hb); try { ws.close(); } catch (e) { /* */ } },
    keys: () => map,
    get joined() { return joined; },
  };
}
