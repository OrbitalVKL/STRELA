// Strela — témoin de présence des amis (lot 10, étape 6). Réseau : src/net/presence.js (Supabase Realtime).
//
// Connexion ouverte quand l'appli est au premier plan et que le compte est rattaché (après une synchronisation, qui
// fournit un jeton frais) ; fermée en arrière-plan. Mon état : « en partie » (partie ou séance en cours, à l'écran de
// jeu) ou « en ligne » (appli ouverte) ; rien si la présence est masquée (Réglages › Compte et amis), mais on voit
// toujours celle des amis. Sinon, la dernière activité (« vu il y a 2 h ») reste affichée.

import { store } from './store.js';
import { refresh } from './nav.js';
import { log } from './journal.js';
import { cloudSupport, cloudConfig, cloudAccount, addSyncStep, syncSoon } from './cloud.js';
import { openPresence, presenceState } from '../net/presence.js';

export const pres = { map: {}, state: null };
let conn = null;
let retry = 0;
let retryTimer = null;
let tokenTimer = null;

const visible = () => { try { return document.visibilityState !== 'hidden'; } catch (e) { return true; } };
const shown = () => store.settings.presence !== false;

/** Mon état : 'jeu' pendant une partie ou une séance (à l'écran de jeu), sinon 'app'. */
export function myPresence() {
  const h = (typeof location !== 'undefined' && location.hash) || '';
  if ((store.current || store.ck) && /^#\/(jeu|manche|cricket)$/.test(h)) return 'jeu';
  if (store.tr && h === '#/entrainement/jeu') return 'jeu';
  return 'app';
}

/** État d'un ami (UUID) : 'jeu', 'app' ou null. */
export const presenceOf = uuid => (uuid ? presenceState(pres.map[uuid]) : null);

function redraw() {
  try { if (/^#\/(amis|joueurs|joueur\/u:)/.test(location.hash) || /^#\/joueur\//.test(location.hash)) refresh(); } catch (e) { /* */ }
}

function connect() {
  if (conn || store.maquette || !visible() || !cloudSupport().ok) return;
  const auth = store.cloudAuth;
  const acct = cloudAccount();
  if (!auth || !auth.access || auth.attached !== acct.profileId || typeof globalThis.WebSocket !== 'function') return;
  const cfg = cloudConfig();
  pres.state = shown() ? myPresence() : null;
  conn = openPresence({
    url: cfg.url, key: cfg.key, token: auth.access, me: acct.profileId, state: pres.state ? { s: pres.state } : null,
    onChange: m => { pres.map = m; retry = 0; redraw(); },
    onClose: () => {
      conn = null;
      if (!visible()) return;
      clearTimeout(retryTimer);
      retry = Math.min(retry + 1, 6);
      retryTimer = setTimeout(() => syncSoon('présence', 100), 5000 * 2 ** (retry - 1)); // une synchronisation rafraîchit le jeton, puis reconnecte
    },
  });
  log('cloud', 'présence : connexion');
}

function disconnect() {
  clearTimeout(retryTimer);
  if (conn) { conn.close(); conn = null; }
  pres.map = {};
}

/** À chaque affichage (app.js) : mon état suit l'écran ; la présence masquée retire mon annonce. */
export function presenceTick() {
  if (!conn) return;
  const next = shown() ? myPresence() : null;
  if (next === pres.state) return;
  pres.state = next;
  if (next) conn.track({ s: next }); else conn.untrack();
}

// Après chaque synchronisation : connexion ouverte (ou jeton renouvelé sur la connexion en cours).
addSyncStep('presence', async () => {
  if (conn) { if (store.cloudAuth && store.cloudAuth.access) conn.setToken(store.cloudAuth.access); } else connect();
});

let started = false;
export function startPresence() {
  if (started || store.maquette) return;
  started = true;
  try {
    document.addEventListener('visibilitychange', () => { if (visible()) syncSoon('présence', 500); else disconnect(); });
  } catch (e) { /* */ }
  // Le jeton d'accès dure une heure : une synchronisation toutes les 25 minutes le renouvelle (au premier plan).
  tokenTimer = setInterval(() => { if (visible() && conn) syncSoon('jeton', 100); }, 25 * 60000);
}

/** Pour les tests et le réglage : refaire l'annonce tout de suite. */
export function presenceRefresh() { pres.state = undefined; presenceTick(); }
export const presenceConnected = () => !!(conn && conn.joined);
export const stopPresenceTimers = () => clearInterval(tokenTimer);
