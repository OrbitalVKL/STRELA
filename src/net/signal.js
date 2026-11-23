// Strela — signalisation de la partie en ligne (lot 9.2) : comment deux téléphones se trouvent avant de se parler
// directement (WebRTC). Petite interface, pour pouvoir changer de service :
//   const s = await openSignal(id)  →  { id, send(dst, type, payload), onmessage = ({ type, src, payload }) => …,
//                                        onclose = () => …, close() }
// Service par défaut : le serveur public et gratuit de PeerJS (0.peerjs.com), sans compte ni carte, utilisé avec son
// protocole (WebSocket, messages OPEN / OFFER / ANSWER / CANDIDATE / EXPIRE / ID-TAKEN / HEARTBEAT), sans sa
// bibliothèque. Il ne voit passer que de quoi établir la connexion (adresses réseau, clés de chiffrement de WebRTC) ;
// les messages de la partie vont ensuite directement d'un téléphone à l'autre, chiffrés.
// Autre serveur (tests : tools/lib/signal-server.mjs) : `?signal=ws://…/peerjs` dans l'adresse de la page.

const DEFAULT_URL = 'wss://0.peerjs.com/peerjs';
const KEY = 'peerjs';

/** Adresse du serveur de signalisation : celle donnée par la page (tests), sinon le serveur public de PeerJS. */
export function signalUrl() {
  try {
    const q = new URLSearchParams(location.search).get('signal');
    if (q) sessionStorage.setItem('strela.signal', q);
    return sessionStorage.getItem('strela.signal') || DEFAULT_URL;
  } catch (e) { return DEFAULT_URL; }
}

export class SignalError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const token = () => Math.random().toString(36).slice(2, 12);

/**
 * Ouvre la signalisation sous l'identifiant `id`. Rejette avec SignalError 'taken' (identifiant déjà pris : code de
 * salon occupé), 'network' (serveur injoignable) ou 'timeout'.
 */
export function openSignal(id, { url = signalUrl(), timeout = 12000, WS = globalThis.WebSocket } = {}) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WS(`${url}?key=${KEY}&id=${encodeURIComponent(id)}&token=${token()}&version=1.5.4`); } catch (e) { reject(new SignalError('network')); return; }
    let opened = false;
    let beat = 0;
    const api = {
      id,
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
    ws.onclose = () => { clearInterval(beat); if (!opened) { clearTimeout(timer); reject(new SignalError('network')); } else if (api.onclose) api.onclose(); };
  });
}
