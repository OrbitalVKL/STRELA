// Strela — partie en ligne (lot 9.2) : le salon et sa synchronisation, sans réseau ni DOM (testé sous node --test).
//
// Un téléphone par joueur, 2 à 4 téléphones. L'hôte fait autorité : il tient le salon (membres, réglages, partie), reçoit
// les demandes des autres (une fléchette, annuler, valider), les accepte ou les refuse, et diffuse ce qu'il a accepté sous
// forme d'opérations numérotées (n = 1, 2, 3…). Chaque téléphone applique les opérations dans l'ordre, par les mêmes
// fonctions que la saisie locale (sons, annonces, célébrations, animations de tour jouées partout). Chaque message de
// l'hôte porte un numéro de séquence ; un trou, une reconnexion ou un doute → l'état complet est renvoyé (snapshot).
//
// Messages (objets JSON ; `t` = type) :
//   invité → hôte : hello { proto, player, lastSeq, gameId }   (arrivée ou retour)
//                   intent { id, op, dart? }                    (op : 'dart' | 'undo' | 'validate')
//                   pick { player }                             (changer de joueur dans le salon)
//                   bye {}                                      (départ volontaire)
//   hôte → invité : room { seq, room }                          (état complet : salon + partie + nombre d'opérations)
//                   op { seq, n, op, dart?, by }                (une opération acceptée, à appliquer)
//                   reject { seq, id, reason }                  (demande refusée)
//                   kick { seq, reason }                        (exclu du salon)

export const PROTO = 1;
export const MAX_PHONES = 4;

/** Alphabet des codes de salon : sans 0 / O, 1 / I / L, ni voyelles (pas de mots). */
const CODE_CHARS = '23456789BCDFGHJKMNPQRSTVWXZ';
export const CODE_LENGTH = 5;

/** Code de salon court (5 caractères), à lire ou à taper. `rnd` : nombres dans [0, 1[ (tests). */
export function makeCode(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_CHARS[Math.floor(rnd() * CODE_CHARS.length) % CODE_CHARS.length];
  return s;
}

/** Code tapé → code propre (majuscules, sans espace ni tiret), ou null s'il n'a pas la forme d'un code. */
export function cleanCode(text) {
  const s = String(text ?? '').toUpperCase().replace(/[\s-]+/g, '');
  return s.length === CODE_LENGTH && [...s].every(c => CODE_CHARS.includes(c)) ? s : null;
}

/** Identifiant de l'hôte auprès du service de signalisation. */
export const hostPeerId = code => `strela-${String(code).toLowerCase()}`;

/** Lien du salon (QR code, partage) : ouvre la page de la version web, ou l'appli Android si elle est installée. */
export const joinUrl = (code, base = 'https://orbitalvkl.github.io/STRELA/') => `${base}rejoindre.html#${code}`;

/** Code lu dans un lien de salon (…/rejoindre.html#CODE ou ?salon=CODE), ou null. */
export function codeFromUrl(url) {
  const m = /rejoindre(?:\.html)?#([A-Za-z0-9-]+)/.exec(String(url ?? '')) || /[?&]salon=([A-Za-z0-9-]+)/.exec(String(url ?? ''));
  return m ? cleanCode(m[1]) : null;
}

// ------------------------------------------------------------------ joueur transmis
/** Ce qu'on envoie d'un joueur (fiche existante) : pseudo, avatar, animation de tour, préférences de finition. */
export function playerCard(p) {
  if (!p) return null;
  const out = { id: String(p.id), name: String(p.name ?? '').slice(0, 40) };
  if (p.avatar) out.avatar = p.avatar;
  if (p.color !== undefined) out.color = p.color;
  if (p.turnAnim) out.turnAnim = p.turnAnim;
  if (p.checkout) out.checkout = p.checkout;
  return out;
}

// ------------------------------------------------------------------ salon (hôte)
/**
 * Salon neuf, tenu par l'hôte. `setup` : { game: 'x01' | 'cricket', startScore, outMode, legsToWin, ckMode, order:
 * 'random' | 'manual', defis }.
 */
export function createRoom({ code, hostPeer, hostPlayer, setup = {} }) {
  return {
    proto: PROTO, code, seq: 0, phase: 'lobby',
    members: [{ peer: hostPeer, host: true, status: 'connected', player: playerCard(hostPlayer) }],
    setup: { game: 'x01', startScore: 501, outMode: 'double', legsToWin: 1, ckMode: 'points', order: 'random', defis: 'non', ...setup },
    order: [],            // ordre manuel des joueurs (identifiants), sinon l'ordre d'arrivée
    game: null,           // partie : l'enregistrement complet (config, darts, validated…), copie de celle de l'hôte
    ops: 0,               // opérations appliquées à la partie
    paused: null,         // { peer, player } : un joueur de la partie a perdu la connexion
    skip: [],             // joueurs exclus de la partie : leurs volées sont passées (3 hors cible) par l'hôte
  };
}

const clone = o => JSON.parse(JSON.stringify(o));
const memberOf = (room, peer) => room.members.find(m => m.peer === peer) || null;
/** Joueurs de la partie (identifiants) dans l'ordre du salon : membres connectés ou non, ordre manuel s'il y en a un. */
export function roomPlayers(room) {
  const ids = room.members.filter(m => m.player).map(m => m.player.id);
  const manual = room.order.filter(id => ids.includes(id));
  return [...manual, ...ids.filter(id => !manual.includes(id))];
}

/** Recalcule la pause : un joueur de la partie (non exclu) dont le téléphone n'est pas connecté. */
function repause(room) {
  if (room.phase !== 'playing' || !room.game) { room.paused = null; return room; }
  const lost = room.members.find(m => !m.host && m.player && m.status !== 'connected' && room.game.config.players.includes(m.player.id) && !room.skip.includes(m.player.id));
  room.paused = lost ? { peer: lost.peer, player: lost.player.id } : null;
  return room;
}

const send = (to, msg) => ({ to, msg });
const snapshot = (room, to) => send(to, { t: 'room', seq: room.seq, room: clone(room) });
const bump = room => { room.seq++; return room; };

/** L'hôte diffuse l'état complet du salon à tous. */
export function broadcastRoom(room) {
  bump(room);
  return snapshot(room, '*');
}

/**
 * L'hôte reçoit un message d'un invité. `ctx` (pendant la partie, fourni par l'écran de jeu) :
 *   thrower  : joueur qui lance maintenant (null si la volée attend VALIDER ou la manche est finie)
 *   pending  : joueur dont la volée attend VALIDER (ou null)
 *   undoable : joueur de la dernière fléchette, si elle peut être annulée (volée pas encore validée), sinon null
 * Renvoie { room, out: [{ to: peer | '*', msg }], op: opération à appliquer chez l'hôte (puis à diffuser) | null }.
 */
export function hostReceive(roomIn, peer, msg, ctx = {}) {
  const room = clone(roomIn);
  const out = [];
  const m = memberOf(room, peer);
  if (!msg || typeof msg !== 'object') return { room: roomIn, out, op: null };
  switch (msg.t) {
    case 'hello': {
      if (msg.proto !== PROTO) { out.push(send(peer, { t: 'kick', seq: room.seq, reason: 'version' })); return { room: roomIn, out, op: null }; }
      const card = playerCard(msg.player);
      if (m) { // retour d'un téléphone connu (reconnexion) : il reprend sa place
        m.status = 'connected';
        if (card && room.phase === 'lobby') m.player = card;
      } else {
        if (room.members.length >= MAX_PHONES) { out.push(send(peer, { t: 'kick', seq: room.seq, reason: 'full' })); return { room: roomIn, out, op: null }; }
        // Partie lancée : seul un joueur de la partie peut revenir (autre téléphone, appli réinstallée…).
        if (room.phase !== 'lobby') {
          const old = card && room.members.find(x => x.player && x.player.id === card.id && !x.host);
          if (!old) { out.push(send(peer, { t: 'kick', seq: room.seq, reason: 'started' })); return { room: roomIn, out, op: null }; }
          old.peer = peer;
          old.status = 'connected';
        } else {
          if (card && room.members.some(x => x.player && x.player.id === card.id)) { out.push(send(peer, { t: 'kick', seq: room.seq, reason: 'same-player' })); return { room: roomIn, out, op: null }; }
          room.members.push({ peer, host: false, status: 'connected', player: card });
        }
      }
      repause(room);
      out.push(broadcastRoom(room));
      return { room, out, op: null };
    }
    case 'pick': {
      if (!m || room.phase !== 'lobby') return { room: roomIn, out, op: null };
      const card = playerCard(msg.player);
      if (card && room.members.some(x => x !== m && x.player && x.player.id === card.id)) { out.push(send(peer, { t: 'reject', seq: room.seq, id: null, reason: 'same-player' })); return { room: roomIn, out, op: null }; }
      m.player = card;
      out.push(broadcastRoom(room));
      return { room, out, op: null };
    }
    case 'bye': {
      if (!m) return { room: roomIn, out, op: null };
      if (room.phase === 'lobby') room.members = room.members.filter(x => x !== m);
      else m.status = 'lost';
      repause(room);
      out.push(broadcastRoom(room));
      return { room, out, op: null };
    }
    case 'intent': {
      const reason = refuse(room, m, msg, ctx);
      if (reason) { out.push(send(peer, { t: 'reject', seq: room.seq, id: msg.id ?? null, reason })); return { room: roomIn, out, op: null }; }
      return { room: roomIn, out, op: makeOp(msg, m.player.id) };
    }
    default: return { room: roomIn, out, op: null };
  }
}

/** Raison de refuser une demande, ou null. */
function refuse(room, m, msg, ctx) {
  if (!m || !m.player) return 'unknown';
  if (room.phase !== 'playing' || !room.game) return 'not-playing';
  if (room.paused) return 'paused';
  const me = m.player.id;
  if (msg.op === 'dart') {
    if (!msg.dart || !Number.isInteger(msg.dart.segment) || !Number.isInteger(msg.dart.multiplier)) return 'bad-dart';
    return ctx.thrower === me ? null : 'not-your-turn';
  }
  if (msg.op === 'undo') return ctx.undoable === me ? null : 'not-yours';
  if (msg.op === 'validate') return ctx.pending === me ? null : 'not-yours';
  return 'unknown-op';
}

const makeOp = (msg, by) => (msg.op === 'dart' ? { op: 'dart', dart: { segment: msg.dart.segment, multiplier: msg.dart.multiplier }, by } : { op: msg.op, by });

/** L'hôte a appliqué une opération (la sienne ou celle d'un invité) : elle part à tous, numérotée. */
export function hostCommit(roomIn, op, game) {
  const room = clone(roomIn);
  room.ops++;
  if (game) room.game = clone(game);
  bump(room);
  return { room, out: [send('*', { t: 'op', seq: room.seq, n: room.ops, ...op })] };
}

/** L'hôte lance la partie : `game` = l'enregistrement créé chez lui (même identifiant partout). */
export function hostStart(roomIn, game) {
  const room = clone(roomIn);
  room.phase = 'playing';
  room.game = clone(game);
  room.ops = 0;
  room.skip = [];
  repause(room);
  return { room, out: [broadcastRoom(room)] };
}

/** Partie finie (ou abandonnée) : le salon revient à l'attente (REVANCHE possible). */
export function hostEnd(roomIn, { abandoned = false } = {}) {
  const room = clone(roomIn);
  room.phase = 'lobby';
  room.lastGame = room.game ? { id: room.game.id, abandoned } : null;
  room.game = null;
  room.ops = 0;
  room.paused = null;
  room.skip = [];
  room.members = room.members.filter(m => m.host || m.status === 'connected');
  return { room, out: [broadcastRoom(room)] };
}

/** État d'un téléphone vu par l'hôte (canal ouvert, fermé…) : 'connected' | 'waiting' | 'lost'. */
export function hostMemberStatus(roomIn, peer, status) {
  const room = clone(roomIn);
  const m = memberOf(room, peer);
  if (!m || m.host || m.status === status) return { room: roomIn, out: [] };
  if (room.phase === 'lobby' && status === 'lost') room.members = room.members.filter(x => x !== m);
  else m.status = status;
  repause(room);
  return { room, out: [broadcastRoom(room)] };
}

/** L'hôte exclut un joueur perdu : ses volées seront passées ; la partie reprend. */
export function hostExclude(roomIn, playerId) {
  const room = clone(roomIn);
  if (!room.skip.includes(playerId)) room.skip.push(playerId);
  repause(room);
  return { room, out: [broadcastRoom(room)] };
}

/** L'hôte réordonne les joueurs (ordre manuel), dans le salon. */
export function hostOrder(roomIn, ids) {
  const room = clone(roomIn);
  room.order = ids.filter(id => roomPlayers(room).includes(id));
  return { room, out: [broadcastRoom(room)] };
}

/** L'hôte change les réglages de la partie (dans le salon). */
export function hostSetup(roomIn, patch) {
  const room = clone(roomIn);
  room.setup = { ...room.setup, ...patch };
  return { room, out: [broadcastRoom(room)] };
}

// ------------------------------------------------------------------ invité
/** Ce que tient un invité : dernier numéro de séquence, salon reçu, opérations appliquées. */
export const createGuest = () => ({ seq: 0, room: null, ops: 0 });

/**
 * Un invité reçoit un message de l'hôte. Renvoie { guest, apply: [opérations à appliquer dans l'ordre], snapshot: salon
 * complet à adopter (remplace la partie locale) | null, resync: vrai s'il faut redemander l'état complet, reject, kick }.
 */
export function guestReceive(gIn, msg, localOps = gIn.ops) {
  const g = { ...gIn };
  const res = { guest: g, apply: [], snapshot: null, resync: false, reject: null, kick: null };
  if (!msg || typeof msg !== 'object') return res;
  if (typeof msg.seq === 'number' && msg.t !== 'reject' && msg.seq <= g.seq && msg.t !== 'kick') return res; // déjà vu (ou en retard)
  switch (msg.t) {
    case 'room':
      g.seq = msg.seq;
      g.room = msg.room;
      // La partie locale suit l'état complet si elle n'en est pas exactement au même point.
      if (msg.room.game && (localOps !== msg.room.ops || !gIn.room || !gIn.room.game || gIn.room.game.id !== msg.room.game.id)) res.snapshot = msg.room;
      g.ops = msg.room.ops;
      return res;
    case 'op':
      if (msg.n !== localOps + 1) { res.resync = true; return res; } // un trou : on redemande tout
      g.seq = msg.seq;
      g.ops = msg.n;
      if (g.room) g.room = { ...g.room, ops: msg.n };
      res.apply.push(msg.op === 'dart' ? { op: 'dart', dart: msg.dart, by: msg.by } : { op: msg.op, by: msg.by });
      return res;
    case 'reject': res.reject = msg.reason; return res;
    case 'kick': res.kick = msg.reason; return res;
    default: return res;
  }
}

/** Message de départ ou de retour d'un invité. */
export const helloMsg = (guest, player, gameId = null) => ({ t: 'hello', proto: PROTO, player: playerCard(player), lastSeq: guest.seq, gameId });

let intentN = 0;
/** Demande d'un invité (identifiant unique pour reconnaître un refus). */
export const intentMsg = (op, dart = null) => ({ t: 'intent', id: `${Date.now().toString(36)}-${++intentN}`, op, ...(dart ? { dart: { segment: dart.segment, multiplier: dart.multiplier } } : {}) });

// ------------------------------------------------------------------ libellés
export const STATUS_LABEL = Object.freeze({ connected: 'CONNECTÉ', waiting: 'EN ATTENTE', lost: 'PERDU' });
export const REASON_TEXT = Object.freeze({
  version: 'Versions de Strela différentes : mettez l\'appli à jour sur les deux téléphones.',
  full: 'Salon complet (4 téléphones au plus).',
  started: 'La partie a déjà commencé.',
  'same-player': 'Ce joueur est déjà dans le salon : choisis-en un autre.',
  'not-your-turn': 'Ce n\'est pas ton tour.',
  'not-yours': 'Seul le lanceur peut le faire.',
  paused: 'Partie en pause : un joueur a perdu la connexion.',
  'not-playing': 'La partie n\'a pas commencé.',
  'bad-dart': 'Fléchette refusée.',
  unknown: 'Téléphone inconnu du salon.',
  'unknown-op': 'Demande inconnue.',
  closed: 'L\'hôte a fermé le salon.',
});
