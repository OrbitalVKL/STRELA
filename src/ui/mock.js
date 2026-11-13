// Strela — données fictives (sommaire ?maquette et tests seulement) : joueurs, parties simulées avec le vrai moteur.
// Rien n'est enregistré : tout est recréé à chaque chargement (la vraie appli lit la base du téléphone).
// Les parties sont jouées par un lanceur simulé (adresse propre à chaque joueur) et un tirage reproductible :
// historique, détail fléchette par fléchette et statistiques sont donc cohérents entre eux.

import { computeState } from '../engine/x01.js';
import { suggestCheckout } from '../engine/checkout.js';
import { makeDart } from '../engine/darts.js';
import { SECTORS } from '../engine/board.js';

// Ordre des secteurs sur la cible (voisins pour les fléchettes ratées).
export const BOARD = SECTORS;

export const MOCK_PLAYERS = Object.freeze([
  { id: 'p1', name: 'Guillaume', avatar: { kind: 'icon', icon: 'flechette', color: 0 }, skill: 0.42 },
  { id: 'p2', name: 'Mathilde', avatar: { kind: 'icon', icon: 'renard', color: 3 }, skill: 0.48 },
  { id: 'p3', name: 'Karim', avatar: { kind: 'initials', color: 6 }, skill: 0.33 },
  { id: 'p4', name: 'Sacha', avatar: { kind: 'icon', icon: 'hibou', color: 5 }, skill: 0.26 },
  { id: 'p5', name: 'Le Grand Jacques', avatar: { kind: 'icon', icon: 'ours', color: 1 }, skill: 0.2 },
  { id: 'p6', name: 'Bertrand', avatar: { kind: 'initials', color: 4 }, skill: 0.22, archived: true },
]);

// Joueurs d'appoint pour l'état « 8 joueurs » et « pseudo très long » du sommaire.
export const EXTRA_PLAYERS = Object.freeze([
  { id: 'p7', name: 'Inès', avatar: { kind: 'icon', icon: 'etoile', color: 2 }, skill: 0.3 },
  { id: 'p8', name: 'Paulo', avatar: { kind: 'icon', icon: 'chope', color: 7 }, skill: 0.25 },
  { id: 'p9', name: 'Nadia', avatar: { kind: 'icon', icon: 'rocket', color: 4 }, skill: 0.35 },
  { id: 'p10', name: 'Jean-Christophe de La Tour-Maubourg', avatar: { kind: 'icon', icon: 'couronne', color: 6 }, skill: 0.3 },
  { id: 'p11', name: 'Tsia', avatar: { kind: 'icon', icon: 'etoile', color: 5 }, skill: 0.3 }, // lot 7 : voyelles qui tombent
]);

/** Tirage reproductible (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const neighbour = (seg, r) => {
  const i = BOARD.indexOf(seg);
  return BOARD[(i + (r() < 0.5 ? 1 : BOARD.length - 1)) % BOARD.length];
};

/** Ce que vise le lanceur : la finition proposée, sinon T20 (ou un simple qui laisse un double). */
function aim(remaining, outMode, dartsLeft) {
  const route = suggestCheckout(remaining, outMode, dartsLeft);
  if (route) return route[0];
  if (remaining > 60) return makeDart(20, 3);
  if (outMode === 'double') {
    const leave = remaining > 40 ? remaining - 32 : remaining % 2 ? 1 : 2;
    return makeDart(Math.min(20, Math.max(1, leave)), 1);
  }
  return makeDart(Math.min(20, remaining), 1);
}

/** Où tombe la fléchette, selon l'adresse du joueur. */
function land(target, skill, r) {
  const x = r();
  const { segment: s, multiplier: m } = target;
  if (s === 25) {
    if (x < skill * (m === 2 ? 0.5 : 0.9)) return target;
    if (x < 0.6) return makeDart(25, 1);
    return makeDart(BOARD[Math.floor(r() * 20)], 1);
  }
  if (m === 3) {
    if (x < skill * 0.32) return target;
    if (x < 0.62) return makeDart(s, 1);
    if (x < 0.9) return makeDart(neighbour(s, r), 1);
    if (x < 0.95) return makeDart(BOARD[Math.floor(r() * 20)], 1);
    return makeDart(neighbour(s, r), r() < 0.5 ? 3 : 1);
  }
  if (m === 2) {
    if (x < skill * 0.5) return target;
    if (x < 0.55) return makeDart(0, 1);
    if (x < 0.85) return makeDart(s, 1);
    return makeDart(neighbour(s, r), 2);
  }
  if (x < 0.6 + skill * 0.4) return target;
  if (x < 0.92) return makeDart(neighbour(s, r), 1);
  return makeDart(s, r() < 0.5 ? 3 : 2);
}

/** Simule une partie entière ; `stopAt` (fraction) l'interrompt pour une partie abandonnée. */
export function simulateGame(config, skills, seed, stopAt = null) {
  const r = rng(seed);
  const darts = [];
  let s = computeState(config, darts);
  const limit = stopAt === null ? Infinity : Math.floor(stopAt);
  for (let guard = 0; s.status === 'playing' && guard < 4000 && darts.length < limit; guard++) {
    const p = s.currentPlayer;
    const target = aim(s.remaining[p], config.outMode, 4 - s.dartNumber);
    darts.push(land(target, skills[p], r));
    s = computeState(config, darts);
  }
  return darts;
}

/** Une quinzaine de parties réparties sur les 6 dernières semaines (la plus récente il y a quelques heures). */
export function mockGames(players, now = Date.now()) {
  const skill = Object.fromEntries(players.map(p => [p.id, p.skill ?? 0.3]));
  const plan = [
    // [jours, heure, départ, sortie, manches, joueurs, abandon]
    [0, 21.3, 501, 'double', 2, ['p1', 'p2'], null],
    [1, 20.7, 301, 'double', 1, ['p3', 'p1', 'p4'], null],
    [2, 22.1, 501, 'double', 1, ['p2', 'p5'], null],
    [3, 19.8, 301, 'single', 2, ['p4', 'p5', 'p3', 'p1'], null],
    [5, 21.0, 701, 'double', 1, ['p1', 'p2', 'p3'], 70],
    [6, 20.2, 501, 'double', 3, ['p1', 'p3'], null],
    [9, 21.6, 301, 'double', 1, ['p2', 'p4'], null],
    [12, 18.9, 501, 'double', 1, ['p5', 'p1', 'p2', 'p6'], null],
    [15, 20.4, 301, 'single', 1, ['p3', 'p4'], null],
    [18, 21.8, 501, 'double', 2, ['p2', 'p1'], null],
    [22, 20.0, 701, 'double', 1, ['p1', 'p5'], null],
    [26, 19.5, 301, 'double', 2, ['p4', 'p2', 'p6'], null],
    [31, 21.2, 501, 'double', 1, ['p1', 'p3', 'p5'], null],
    [36, 20.6, 301, 'double', 1, ['p6', 'p1'], null],
    [42, 22.4, 501, 'double', 1, ['p2', 'p3'], null],
  ];
  return plan.map(([days, hour, startScore, outMode, legsToWin, ids, stop], i) => {
    const d = new Date(now - days * 86400000);
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    if (d.getTime() > now) d.setTime(now - 3 * 3600000);
    const config = { startScore, outMode, legsToWin, players: ids };
    const darts = simulateGame(config, ids.map(id => skill[id]), 1000 + i * 37, stop);
    return { id: `g${i + 1}`, startedAt: d.getTime(), config, darts, abandoned: stop !== null };
  });
}

/**
 * Lot 7.8 (maquette) : une saison de soirées sur ~9 semaines — 14 soirées de 3 à 6 parties le même soir (20 h – 1 h),
 * plus quelques parties isolées ; joueurs tirés parmi `players`, verres pendant les parties (cumul de la soirée dans
 * `drinksBefore`), quelques abandons. Reproductible.
 */
export function mockSeason(players, now = Date.now()) {
  const r = rng(78);
  const skill = Object.fromEntries(players.map(p => [p.id, p.skill ?? 0.3]));
  const ids = players.map(p => p.id);
  const games = [];
  const pickPlayers = (n) => { const pool = [...ids]; const out = []; while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]); return out; };
  const evenings = [1, 2, 5, 7, 9, 13, 16, 20, 23, 28, 34, 41, 49, 58];
  let n = 0;
  for (const [k, days] of evenings.entries()) {
    const soiree = `s${k + 1}`;
    const crew = pickPlayers(3 + Math.floor(r() * 3));
    const count = k === 0 ? 4 : 3 + Math.floor(r() * 4);
    let t = new Date(now - days * 86400000);
    t.setHours(20, 30 + Math.floor(r() * 20), 0, 0);
    if (t.getTime() > now) t = new Date(now - 4 * 3600000);
    const before = {};
    for (let i = 0; i < count; i++) {
      const who = crew.filter(() => r() < 0.85);
      const playing = who.length >= 2 ? who : crew.slice(0, 2);
      const order = [...playing].sort(() => r() - 0.5);
      const startScore = r() < 0.7 ? 501 : 301;
      const config = { startScore, outMode: r() < 0.85 ? 'double' : 'single', legsToWin: 1, players: order };
      const stop = r() < 0.08 ? 40 : null;
      const darts = simulateGame(config, order.map(id => skill[id]), 5000 + n * 13, stop);
      const startedAt = t.getTime();
      const drinks = {};
      for (const id of order) {
        const c = Math.floor(r() * 2.4);
        if (c) drinks[id] = Array.from({ length: c }, (_, j) => ({ t: startedAt + (j + 1) * 600000, at: Math.min(darts.length, Math.floor(darts.length * (j + 1) / (c + 1))) }));
      }
      const g = { id: `s${k + 1}g${i + 1}`, startedAt, config, darts, abandoned: stop !== null, soiree };
      const b = {}; for (const id of order) if (before[id]) b[id] = before[id];
      if (Object.keys(b).length) g.drinksBefore = b;
      if (Object.keys(drinks).length) g.drinks = drinks;
      for (const [id, l] of Object.entries(drinks)) before[id] = (before[id] || 0) + l.length;
      games.push(g);
      n += 1;
      t = new Date(startedAt + (25 + Math.floor(r() * 25)) * 60000);
    }
  }
  // Quelques parties isolées (sans soirée), en semaine.
  for (const days of [11, 26, 38, 45]) {
    const order = pickPlayers(2);
    const t = new Date(now - days * 86400000); t.setHours(18, 40, 0, 0);
    const config = { startScore: 501, outMode: 'double', legsToWin: 2, players: order };
    games.push({ id: `iso${days}`, startedAt: t.getTime(), config, darts: simulateGame(config, order.map(id => skill[id]), 9000 + days), abandoned: false });
  }
  return games.sort((a, b) => b.startedAt - a.startedAt);
}
