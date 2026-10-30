// Strela — règles X01 (301 / 501 / 701), sans dépendance ni affichage.
//
// Principe : l'état d'une partie n'est jamais stocké, il se recalcule entièrement à partir de
// sa configuration et de la liste ordonnée de ses fléchettes. ANNULER = retirer la dernière
// fléchette et recalculer ; cela traverse sans cas particulier les changements de joueur, les
// bust, les fins de manche et la fin de partie (une partie finie redevient en cours).
//
// Règles : entrée libre ; volée de 3 fléchettes au plus, close après la 3e, sur une finition ou
// sur un bust. Sortie simple : gagné à 0 exactement, bust si le reste devient négatif. Sortie
// double : bust aussi si le reste vaut 1 ou tombe à 0 sur autre chose qu'un double (D1–D20, 50).
// Bust : la volée s'arrête, le joueur revient au reste du début de volée, la main passe.
// Manche gagnée : manche suivante, le premier à lancer tourne d'un cran à chaque manche.
// Partie gagnée dès qu'un joueur atteint N manches.

import { dartError, dartValue, isDouble, makeDart } from './darts.js';

export const START_SCORES = Object.freeze([301, 501, 701]);
export const OUT_SINGLE = 'single';
export const OUT_DOUBLE = 'double';
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;
export const DARTS_PER_VISIT = 3;

export const STATUS = Object.freeze({ PLAYING: 'playing', FINISHED: 'finished' });

// Ce qui vient de se passer avec la dernière fléchette (un seul événement, le plus fort).
export const EVENTS = Object.freeze({
  NONE: 'none',           // aucune fléchette encore
  DART: 'dart',           // fléchette normale, la volée continue
  VISIT_END: 'visit_end', // 3e fléchette sans bust ni finition : la main passe
  BUST: 'bust',           // bust : retour au reste du début de volée, la main passe
  LEG_WON: 'leg_won',     // finition : manche gagnée, manche suivante commencée
  MATCH_WON: 'match_won', // finition qui donne la partie
});

export const X01_ERRORS = Object.freeze({
  CONFIG_INVALID: 'CONFIG_INVALID',
  START_SCORE_INVALID: 'START_SCORE_INVALID',
  OUT_MODE_INVALID: 'OUT_MODE_INVALID',
  LEGS_INVALID: 'LEGS_INVALID',
  PLAYERS_INVALID: 'PLAYERS_INVALID',
  MATCH_OVER: 'MATCH_OVER', // fléchette après la fin de partie
});

export class X01Error extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'X01Error';
    this.code = code;
  }
}

/**
 * Configuration validée et figée.
 *   startScore : 301 | 501 | 701
 *   outMode    : 'single' | 'double'
 *   legsToWin  : entier ≥ 1 (1 par défaut)
 *   players    : 1 à 8 identifiants distincts, dans l'ordre de jeu (le moteur ne les interprète pas)
 */
export function normalizeConfig(config) {
  if (config === null || typeof config !== 'object') throw new X01Error(X01_ERRORS.CONFIG_INVALID);
  const { startScore, outMode, legsToWin = 1, players } = config;
  if (!START_SCORES.includes(startScore)) throw new X01Error(X01_ERRORS.START_SCORE_INVALID, `score de départ ${startScore}`);
  if (outMode !== OUT_SINGLE && outMode !== OUT_DOUBLE) throw new X01Error(X01_ERRORS.OUT_MODE_INVALID, `sortie ${outMode}`);
  if (!Number.isInteger(legsToWin) || legsToWin < 1) throw new X01Error(X01_ERRORS.LEGS_INVALID, `manches ${legsToWin}`);
  if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS
      || new Set(players).size !== players.length) {
    throw new X01Error(X01_ERRORS.PLAYERS_INVALID, 'joueurs : 1 à 8, sans doublon');
  }
  return Object.freeze({ startScore, outMode, legsToWin, players: Object.freeze([...players]) });
}

/** Vrai si, depuis `remaining`, la fléchette provoque un bust. */
export function isBust(remaining, dart, outMode) {
  const left = remaining - dartValue(dart);
  if (left < 0) return true;
  if (outMode === OUT_DOUBLE) return left === 1 || (left === 0 && !isDouble(dart));
  return false;
}

/**
 * État complet de la partie après `darts` (liste ordonnée de { segment, multiplier }).
 * Lève une X01Error / Error si la configuration ou une fléchette est invalide, ou s'il reste des
 * fléchettes après la fin de partie (données corrompues) : l'interface passe par throwDart().
 *
 * État renvoyé :
 *   config, status ('playing' | 'finished'), winner (rang du joueur ou null)
 *   legNumber (1, 2…), legStarter (rang du premier à lancer de la manche en cours)
 *   currentPlayer (rang, null si partie finie), dartNumber (1 à 3 : rang de la prochaine fléchette
 *     dans la volée, null si partie finie)
 *   remaining[]   reste de chaque joueur (dans la manche en cours ; à la fin de partie, reste final)
 *   legsWon[]     manches gagnées par joueur
 *   visit         volée en cours { player, startRemaining, darts[], total } (darts vide si aucune)
 *   lastEvent     voir EVENTS ; lastDart : dernière fléchette ou null
 *   lastVisit     dernière volée close (utile pour afficher la volée finie ou le bust), ou null
 *   visits[]      toutes les volées closes : { leg, player, startRemaining, darts[], total, scored,
 *                 remainingAfter, bust, finish } (scored = 0 sur un bust)
 *   legs[]        manches : { number, starter, winner (null si en cours), visits[], finalRemaining
 *                 (restes à la fin de la manche, null si en cours) }
 *   dartCount     nombre de fléchettes jouées
 */
export function computeState(config, darts = []) {
  const cfg = normalizeConfig(config);
  if (!Array.isArray(darts)) throw new TypeError('darts doit être une liste');
  const n = cfg.players.length;
  const remaining = new Array(n).fill(cfg.startScore);
  const legsWon = new Array(n).fill(0);
  const visits = [];
  const legs = [];
  let leg = openLeg(legs, 1, 0);
  let current = 0;
  let open = null; // volée en cours
  let winner = null;
  let lastEvent = EVENTS.NONE;
  let lastDart = null;
  let lastVisit = null;

  const close = (bust, finish) => {
    const total = open.darts.reduce((sum, d) => sum + dartValue(d), 0);
    const record = Object.freeze({
      leg: leg.number,
      player: open.player,
      startRemaining: open.startRemaining,
      darts: Object.freeze(open.darts),
      total,
      scored: bust ? 0 : total,
      remainingAfter: bust ? open.startRemaining : open.startRemaining - total,
      bust,
      finish,
    });
    visits.push(record);
    leg.visits.push(record);
    lastVisit = record;
    open = null;
  };

  darts.forEach((raw, i) => {
    if (winner !== null) throw new X01Error(X01_ERRORS.MATCH_OVER, `fléchette n° ${i + 1} après la fin de partie`);
    const err = dartError(raw);
    if (err) throw new X01Error(err, `fléchette n° ${i + 1} invalide`);
    const dart = makeDart(raw.segment, raw.multiplier);
    lastDart = dart;
    if (!open) open = { player: current, startRemaining: remaining[current], darts: [] };
    open.darts.push(dart);

    if (isBust(remaining[current], dart, cfg.outMode)) {
      remaining[current] = open.startRemaining;
      close(true, false);
      current = (current + 1) % n;
      lastEvent = EVENTS.BUST;
      return;
    }
    remaining[current] -= dartValue(dart);
    if (remaining[current] === 0) {
      close(false, true);
      legsWon[current] += 1;
      leg.winner = current;
      leg.finalRemaining = Object.freeze([...remaining]);
      if (legsWon[current] >= cfg.legsToWin) {
        winner = current;
        lastEvent = EVENTS.MATCH_WON;
        return;
      }
      leg = openLeg(legs, leg.number + 1, leg.number % n);
      remaining.fill(cfg.startScore);
      current = leg.starter;
      lastEvent = EVENTS.LEG_WON;
      return;
    }
    if (open.darts.length === DARTS_PER_VISIT) {
      close(false, false);
      current = (current + 1) % n;
      lastEvent = EVENTS.VISIT_END;
      return;
    }
    lastEvent = EVENTS.DART;
  });

  const finished = winner !== null;
  const visitDarts = open ? [...open.darts] : [];
  return {
    config: cfg,
    status: finished ? STATUS.FINISHED : STATUS.PLAYING,
    winner,
    legNumber: leg.number,
    legStarter: leg.starter,
    currentPlayer: finished ? null : current,
    dartNumber: finished ? null : visitDarts.length + 1,
    remaining: [...remaining],
    legsWon: [...legsWon],
    visit: finished ? null : {
      player: current,
      startRemaining: open ? open.startRemaining : remaining[current],
      darts: visitDarts,
      total: visitDarts.reduce((sum, d) => sum + dartValue(d), 0),
    },
    lastEvent,
    lastDart,
    lastVisit,
    visits,
    legs: legs.map(l => ({ ...l, visits: [...l.visits] })),
    dartCount: darts.length,
  };
}

function openLeg(legs, number, starter) {
  const leg = { number, starter, winner: null, visits: [], finalRemaining: null };
  legs.push(leg);
  return leg;
}

/**
 * Joue une fléchette. Ne lève pas d'erreur pour une saisie refusée :
 *   { ok: true,  darts: nouvelle liste, state }
 *   { ok: false, error: code (DART_ERRORS ou MATCH_OVER), darts: liste inchangée, state }
 */
export function throwDart(config, darts, dart) {
  const before = computeState(config, darts);
  const err = dartError(dart);
  if (err) return { ok: false, error: err, darts, state: before };
  if (before.status === STATUS.FINISHED) return { ok: false, error: X01_ERRORS.MATCH_OVER, darts, state: before };
  const next = [...darts, makeDart(dart.segment, dart.multiplier)];
  return { ok: true, darts: next, state: computeState(config, next) };
}

/** ANNULER : retire la dernière fléchette (sans effet sur une partie vide). */
export function undoDart(config, darts) {
  const next = darts.slice(0, -1);
  return { darts: next, state: computeState(config, next) };
}

/** Commodité à état : garde la liste des fléchettes et l'état recalculé. */
export function createX01(config, darts = []) {
  const cfg = normalizeConfig(config);
  let list = [...darts];
  let state = computeState(cfg, list);
  return {
    get config() { return cfg; },
    get darts() { return [...list]; },
    get state() { return state; },
    throw(dart) {
      const r = throwDart(cfg, list, dart);
      if (r.ok) { list = r.darts; state = r.state; }
      return r;
    },
    undo() {
      const r = undoDart(cfg, list);
      list = r.darts; state = r.state;
      return r;
    },
  };
}
