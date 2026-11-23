// Strela — partie en ligne (lot 9.2), côté appli : le salon, la liaison avec les autres téléphones et le lien avec
// l'écran de jeu. Règles du salon et de la synchronisation : src/engine/online.js (pur, testé) ; transport :
// src/net/link.js (WebRTC) et src/net/signal.js (signalisation). Détail : docs/enligne.md.
//
// Chaque écran de jeu (X01, Cricket) s'inscrit avec registerOnlineGame(kind, { apply(op), ctx() }) : `apply` joue une
// opération par les mêmes fonctions que la saisie locale (sons, annonces, célébrations, animations de tour partout) ;
// `ctx` dit qui lance, qui doit valider, qui peut annuler. La saisie locale d'une partie en ligne passe par input().

import { store, saveCurrent, saveCk, keepRemotePlayer, playerById, startGame, startCricket, adoptOnlineGame, archiveCurrent, archiveCk,
  profilePlayer, activePlayers, currentState, ckState } from './store.js';
import { refresh, go, buzz, BUZZ } from './nav.js';
import { variant, onNative } from './native.js';
import { say } from './feedback.js';
import { blockVoice } from './voiceinput.js';
import * as E from '../engine/online.js';
import { hostLink, guestLink, webrtcAvailable } from '../net/link.js';

export const HOST_PEER = 'host';

// Lien d'un salon ouvert dans l'APK (strela://rejoindre/CODE, page rejoindre.html du QR code) : écran En ligne, code prêt.
onNative(d => { if (d && typeof d.join === 'string') { const c = E.cleanCode(d.join); if (c) { on.draftCode = c; go(`#/enligne/rejoindre/${c}`); } } });

/** État de la session en ligne de ce téléphone (en mémoire ; la partie, elle, est enregistrée avec sa marque `online`). */
export const on = {
  role: null,           // 'host' | 'guest' | null
  code: null,
  me: null,             // joueur de ce téléphone
  room: null,           // salon : celui de l'hôte (autorité) ou le dernier reçu
  guest: E.createGuest(),
  link: null,
  state: 'idle',        // idle | connecting | open | lost (liaison coupée, reconnexion en cours) | error
  error: '',
  notice: '',           // message bref (demande refusée…)
  signal: 'online',     // hôte : signalisation joignable ou non
  draftCode: '',
};
/** Sommaire de maquette et tests : état imposé (sans liaison) ; sans argument, remis à zéro. */
export function presetOnline(st = {}) {
  clearTimeout(retryTimer);
  Object.assign(on, { role: null, code: null, me: null, room: null, guest: E.createGuest(), link: null, state: 'idle', error: '', notice: '', signal: 'online', draftCode: '' }, st);
}
let retryTimer = 0;
let noticeTimer = 0;

/** Le mode en ligne est-il possible ici ? Variante play (sans accès réseau) : non ; navigateur sans WebRTC : non. */
export function onlineSupport() {
  if (variant() === 'play') return { ok: false, why: 'La version Google Play de Strela n\'a pas d\'accès à Internet : la partie en ligne est dans la version GitHub (APK) et la version web.' };
  if (!webrtcAvailable()) return { ok: false, why: 'Ce navigateur ne sait pas relier deux téléphones (WebRTC absent).' };
  return { ok: true, why: '' };
}

function notice(text) {
  on.notice = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { on.notice = ''; refresh(); }, 4000);
  refresh();
}

// ------------------------------------------------------------------ écrans de jeu
const games = new Map();
export const registerOnlineGame = (kind, api) => games.set(kind, api);
const kindOf = room => (room && room.setup && room.setup.game === 'cricket' ? 'cricket' : 'x01');
/** Partie en cours de ce téléphone, si elle est en ligne. */
export function onlineGame() {
  const g = store.ck || store.current;
  return g && g.online ? g : null;
}
const localOps = () => on.guest.ops;

/** Fiche transmise du joueur de ce téléphone. */
const myCard = () => E.playerCard(playerById(on.me));

/** Les autres joueurs du salon sont gardés sur ce téléphone (à part), pour l'historique. */
function keepPlayers(room) {
  if (!room) return;
  for (const m of room.members) if (m.player && m.player.id !== on.me) keepRemotePlayer(m.player);
}

// ------------------------------------------------------------------ hôte
function deliver(out) {
  for (const { to, msg } of out) {
    if (to === '*') on.link && on.link.broadcast(msg);
    else if (to !== HOST_PEER) on.link && on.link.send(to, msg);
  }
}
function setRoom(room) {
  on.room = room;
  keepPlayers(room);
  const g = onlineGame();
  if (on.role === 'host' && g) { g.online = { ...g.online, room: { ...room, game: null } }; save(g); }
}
const save = g => (g === store.ck ? saveCk() : saveCurrent());

function gameCtx() {
  const api = games.get(kindOf(on.room));
  return api && onlineGame() ? api.ctx() : {};
}

async function openHost(code, room) {
  on.link = await hostLink(code, {
    open: () => {},
    message: (peer, msg) => hostMessage(peer, msg),
    close: peer => { const r = E.hostMemberStatus(on.room, peer, 'lost'); setRoom(r.room); deliver(r.out); afterChange(); refresh(); },
    signal: st => { on.signal = st; refresh(); },
  });
  on.role = 'host';
  on.code = code;
  on.state = 'open';
  on.signal = 'online';
  setRoom(room);
  blockVoice('enligne-hote', false);
}

/** CRÉER UN SALON : un code libre (nouveau tirage s'il est pris), l'hôte attend les autres. */
export async function createRoom(me) {
  leave(false);
  on.me = me;
  on.state = 'connecting';
  on.error = '';
  refresh();
  for (let k = 0; k < 4; k++) {
    const code = E.makeCode();
    try {
      await openHost(code, E.createRoom({ code, hostPeer: HOST_PEER, hostPlayer: playerById(me) }));
      refresh();
      return true;
    } catch (e) {
      if (e && e.code === 'taken') continue;
      on.state = 'error';
      on.error = signalError(e);
      refresh();
      return false;
    }
  }
  on.state = 'error';
  on.error = 'Pas de code de salon libre : réessaie.';
  refresh();
  return false;
}

function hostMessage(peer, msg) {
  const r = E.hostReceive(on.room, peer, msg, gameCtx());
  setRoom(r.room);
  deliver(r.out);
  if (r.op) commitOp(r.op);
  if (msg && msg.t === 'hello') afterChange();
  refresh();
}

/** L'hôte joue une opération chez lui, puis la diffuse. */
function commitOp(op) {
  const api = games.get(kindOf(on.room));
  if (!api || !api.apply(op)) return false;
  const g = onlineGame();
  const c = E.hostCommit(on.room, op, g ? wireGame(g) : null);
  setRoom(c.room);
  deliver(c.out);
  afterChange();
  return true;
}

/** Après chaque changement chez l'hôte : volées des joueurs exclus passées d'office. */
function afterChange() {
  if (on.role !== 'host' || !on.room || on.room.phase !== 'playing' || on.room.paused) return;
  for (let guard = 0; guard < 12; guard++) {
    const ctx = gameCtx();
    const who = ctx.thrower || ctx.pending;
    if (!who || !E.passed(on.room, who)) return;
    const op = ctx.thrower ? { op: 'dart', dart: { segment: 0, multiplier: 1 }, by: who } : { op: 'validate', by: who };
    if (!commitOp(op)) return;
  }
}

/** Ce qu'on envoie de la partie (sans l'état d'affichage, ni les verres, qui restent sur chaque téléphone). */
function wireGame(g) {
  const out = { id: g.id, config: g.config, darts: g.darts, startedAt: g.startedAt, validated: g.validated };
  for (const k of ['shuffled', 'defis', 'defiSet']) if (g[k] !== undefined) out[k] = g[k];
  return JSON.parse(JSON.stringify(out));
}

/** LANCER LA PARTIE (hôte) : même identifiant de partie sur tous les téléphones. */
export function hostLaunch() {
  if (on.role !== 'host' || !on.room) return false;
  const players = E.roomPlayers(on.room);
  if (players.length < 2) return false;
  const st = on.room.setup;
  const shuffle = st.order !== 'manual';
  const g = st.game === 'cricket'
    ? startCricket({ players, ckMode: st.ckMode, legsToWin: st.legsToWin, shuffle })
    : startGame({ players, startScore: st.startScore, outMode: st.outMode, legsToWin: st.legsToWin, shuffle, defis: st.defis });
  g.online = { code: on.code, role: 'host', me: on.me, host: on.me };
  const r = E.hostStart(on.room, wireGame(g));
  setRoom(r.room);
  deliver(r.out);
  go(st.game === 'cricket' ? '#/cricket' : '#/jeu');
  return true;
}

export function hostSetup(patch) {
  if (on.role !== 'host') return;
  const r = E.hostSetup(on.room, patch);
  setRoom(r.room);
  deliver(r.out);
  refresh();
}
export function hostOrder(ids) {
  if (on.role !== 'host') return;
  const r = E.hostOrder(on.room, ids);
  setRoom(r.room);
  deliver(r.out);
  refresh();
}

/** Partie finie ou abandonnée (hôte) : rangée dans l'historique, retour au salon pour tous. */
export function hostBackToLobby({ abandoned = false } = {}) {
  const g = onlineGame();
  if (g) { if (g === store.ck) archiveCk(abandoned); else archiveCurrent(abandoned); }
  if (on.role === 'host' && on.room) {
    const r = E.hostEnd(on.room, { abandoned });
    setRoom(r.room);
    deliver(r.out);
  }
  go('#/enligne');
}

/** Joueur perdu : PASSER SON TOUR (ses volées, jusqu'à son retour) ou EXCLURE (jusqu'à la fin de la partie). */
export function hostPass(forever) {
  if (on.role !== 'host' || !on.room || !on.room.paused) return;
  const r = E.hostExclude(on.room, on.room.paused.player, { forever });
  setRoom(r.room);
  deliver(r.out);
  afterChange();
  refresh();
}

// ------------------------------------------------------------------ invité
/** REJOINDRE : appelle l'hôte du code ; `quiet` : reconnexion automatique (sans écran d'erreur). */
export async function joinRoom(code, me, { quiet = false } = {}) {
  if (on.link && on.role === 'guest' && on.state === 'open' && on.code === code) return true;
  closeLink();
  on.role = 'guest';
  on.code = code;
  on.me = me;
  on.state = quiet ? 'lost' : 'connecting';
  on.error = '';
  refresh();
  try {
    on.link = await guestLink(code, { message: guestMessage, close: () => { if (on.role === 'guest') { on.state = 'lost'; on.link = null; refresh(); scheduleRetry(); } } });
  } catch (e) {
    if (quiet) { scheduleRetry(); return false; }
    on.state = 'error';
    on.error = signalError(e);
    on.role = null;
    refresh();
    return false;
  }
  on.state = 'open';
  const g = onlineGame();
  on.link.send(E.helloMsg(on.guest, playerById(me), g ? g.id : null));
  refresh();
  return true;
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  if (on.role !== 'guest' || !on.code) return;
  retryTimer = setTimeout(() => { if (on.role === 'guest' && on.state !== 'open') joinRoom(on.code, on.me, { quiet: true }); }, 3000);
}

function guestMessage(msg) {
  const r = E.guestReceive(on.guest, msg, localOps());
  on.guest = r.guest;
  if (r.guest.room) { on.room = r.guest.room; keepPlayers(on.room); }
  if (r.kick) {
    on.state = 'error';
    on.error = E.REASON_TEXT[r.kick] || 'Refusé par l\'hôte.';
    const code = on.code;
    leave(false);
    on.error = E.REASON_TEXT[r.kick] || 'Refusé par l\'hôte.';
    on.state = 'error';
    on.draftCode = code || '';
    refresh();
    return;
  }
  if (r.reject) notice(E.REASON_TEXT[r.reject] || 'Refusé.');
  if (r.resync) { on.guest = { ...on.guest, ops: -1 }; on.link && on.link.send(E.helloMsg({ seq: 0 }, playerById(on.me), onlineGame()?.id)); return; }
  if (r.snapshot) adopt(r.snapshot);
  const api = games.get(kindOf(on.room));
  for (const op of r.apply) if (api) api.apply(op);
  // Partie finie chez l'hôte (retour au salon) : la partie de ce téléphone est rangée.
  const g = onlineGame();
  if (on.room && on.room.phase === 'lobby' && g && on.room.lastGame && on.room.lastGame.id === g.id) {
    if (g === store.ck) archiveCk(on.room.lastGame.abandoned); else archiveCurrent(on.room.lastGame.abandoned);
    if (/^#\/(jeu|manche|fin|cricket)/.test(location.hash)) go('#/enligne');
  }
  refresh();
}

/** État complet reçu : la partie de l'hôte remplace celle de ce téléphone (même identifiant, mêmes fléchettes). */
function adopt(room) {
  if (!room.game) return;
  adoptOnlineGame(room.game, { code: on.code, role: 'guest', me: on.me, host: room.members.find(m => m.host)?.player?.id });
  on.guest = { ...on.guest, ops: room.ops };
  const target = room.game.config.game === 'cricket' ? '#/cricket' : '#/jeu';
  if (!location.hash.startsWith(target) && !/^#\/(manche|fin|cricket\/fin)/.test(location.hash)) go(target);
}

// ------------------------------------------------------------------ saisie locale d'une partie en ligne
/**
 * Saisie sur ce téléphone pendant une partie en ligne. Renvoie vrai si elle est partie (ou appliquée, chez l'hôte) ;
 * faux (avec un message) si ce n'est pas à ce téléphone de jouer.
 */
export function input(op, dart = null) {
  if (!on.room || on.state !== 'open' && on.role === 'guest') { notice('Connexion perdue : reconnexion en cours…'); return false; }
  const ctx = gameCtx();
  const mine = op === 'dart' ? ctx.thrower === on.me : op === 'undo' ? ctx.undoable === on.me : ctx.pending === on.me;
  if (!mine) {
    const who = op === 'dart' ? ctx.thrower : ctx.pending;
    notice(who ? `C'est à ${playerById(who).name}.` : 'Seul le lanceur peut le faire.');
    buzz(BUZZ.undo);
    return false;
  }
  if (on.room.paused) { notice('Partie en pause : un joueur a perdu la connexion.'); return false; }
  if (on.role === 'host') {
    const r = E.hostReceive(on.room, HOST_PEER, E.intentMsg(op, dart), ctx);
    if (r.op) return commitOp(r.op);
    notice(E.REASON_TEXT[r.out[0]?.msg?.reason] || 'Refusé.');
    return false;
  }
  on.link.send(E.intentMsg(op, dart));
  return true;
}

/** Ce téléphone peut-il saisir maintenant ? (cache du pavé sinon) — { mine, who, paused, lost } */
export function turnInfo() {
  const g = onlineGame();
  if (!g) return null;
  const connected = on.role && on.code === g.online.code && (on.role === 'host' || on.state === 'open');
  const ctx = connected ? gameCtx() : {};
  const who = ctx.thrower || ctx.pending || null;
  return {
    connected, who, mine: !!connected && (ctx.thrower === on.me || ctx.pending === on.me),
    paused: on.room && on.room.paused ? on.room.paused.player : null,
    role: on.role, code: g.online.code, signal: on.signal,
  };
}

// ------------------------------------------------------------------ reprise, départ
/**
 * Au lancement (ou en rouvrant la partie) : une partie en ligne en cours reprend sa liaison d'elle-même. Hôte : salon
 * relu de la partie enregistrée, téléphones « en attente » jusqu'à leur retour ; invité : reconnexion à l'hôte.
 */
export async function resumeOnline() {
  const g = onlineGame();
  if (!g || on.role) return;
  const o = g.online;
  if (o.role === 'host' && o.room) {
    const room = { ...o.room, phase: 'playing', game: wireGame(g), members: o.room.members.map(m => (m.host ? m : { ...m, status: 'waiting' })) };
    room.paused = null;
    on.me = o.me;
    try { await openHost(o.code, room); } catch (e) {
      on.role = 'host'; on.code = o.code; on.me = o.me; on.room = room; on.state = 'lost';
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { on.role = null; resumeOnline(); }, 5000);
      refresh();
      return;
    }
    const r = E.broadcastRoom(on.room);
    deliver([r]);
    refresh();
  } else if (o.role === 'guest') {
    on.guest = E.createGuest();
    joinRoom(o.code, o.me, { quiet: true });
  }
}

/** Fin de partie : RETOUR AU SALON (hôte : pour tous, la partie est rangée partout ; invité : rangée ici). */
export function onlineFinish() {
  if (on.role === 'host') { hostBackToLobby(); return; }
  const g = onlineGame();
  if (g) { if (g === store.ck) archiveCk(false); else archiveCurrent(false); }
  go('#/enligne');
}

/** Arrêter (hôte : pour tous, retour au salon) ou quitter (invité) la partie en ligne en cours ; rangée « abandonnée ». */
export function onlineQuit() {
  if (on.role === 'host') { hostBackToLobby({ abandoned: true }); return; }
  const g = onlineGame();
  leave(true);
  if (g) { if (g === store.ck) archiveCk(true); else archiveCurrent(true); }
  go('#/enligne');
}

function closeLink() {
  clearTimeout(retryTimer);
  try { on.link && on.link.close(); } catch (e) { /* */ }
  on.link = null;
}

/** QUITTER LE SALON (ou fin de session) ; `bye` : prévenir l'hôte. */
export function leave(bye = true) {
  if (bye && on.role === 'guest' && on.link) on.link.send({ t: 'bye' });
  if (bye && on.role === 'host' && on.link) on.link.broadcast({ t: 'kick', seq: (on.room?.seq || 0) + 1, reason: 'closed' });
  closeLink();
  Object.assign(on, { role: null, code: null, room: null, guest: E.createGuest(), state: 'idle', error: '', notice: '', signal: 'online' });
}

function signalError(e) {
  const c = e && e.code;
  if (c === 'no-host') return 'Aucun salon à ce code (ou l\'hôte n\'est plus là). Vérifie le code.';
  if (c === 'timeout' || c === 'unreachable') return 'Impossible de joindre l\'autre téléphone. Essayez sur le même Wi-Fi : certains réseaux (4G, Wi-Fi d\'entreprise) bloquent la connexion directe.';
  return 'Pas de connexion au service de mise en relation. Vérifie Internet et réessaie.';
}

/** Message bref (demande refusée, « c'est à … ») sur les écrans de jeu. */
export function onlineToastHtml() {
  if (!on.notice || !/^#\/(jeu|manche|fin|cricket)/.test(location.hash)) return '';
  return `<p class="ontoast" role="status" data-layer>${on.notice.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</p>`;
}

/** Joueur proposé pour ce téléphone : le profil, sinon le premier joueur. */
export const defaultMe = () => on.me || (profilePlayer() && profilePlayer().id) || (activePlayers()[0] && activePlayers()[0].id) || null;
export const sayOnline = text => say(text);
