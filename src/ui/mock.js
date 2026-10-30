// Strela — données fictives de la maquette (lot 1) : joueurs, parties simulées avec le vrai moteur.
// Rien n'est enregistré : tout est recréé à chaque chargement (persistance au lot 2).
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
