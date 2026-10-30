// Strela — statistiques d'un joueur, toujours recalculées à partir des fléchettes (jamais stockées).
// JS pur, sans dépendance ni affichage.
//
// Une partie enregistrée = { id, startedAt (ms), config (X01), darts[], abandoned? }.
// Les joueurs de `config.players` sont des identifiants ; les statistiques se demandent par identifiant.
// Un joueur supprimé y figure sous un identifiant anonyme « ~<rang> » (players.js).

import { computeState, STATUS } from './x01.js';
import { dartValue } from './darts.js';
import { suggestCheckout } from './checkout.js';
import { isDeletedId } from './players.js';

export const PERIODS = Object.freeze({ '7j': 7, '30j': 30, tout: null });
const DAY = 86400000;

/** Parties de la période (7j, 30j, tout) comptées depuis `now`. */
export function inPeriod(games, period, now = Date.now()) {
  const days = PERIODS[period];
  return days ? games.filter(g => g.startedAt >= now - days * DAY) : [...games];
}

/** État X01 d'une partie (mis en cache sur l'objet, la liste des fléchettes ne change pas). */
export function gameState(game) {
  if (!game._state || game._state.dartCount !== game.darts.length) {
    Object.defineProperty(game, '_state', { value: computeState(game.config, game.darts), configurable: true, writable: true });
  }
  return game._state;
}

/** Gagnant d'une partie (identifiant) ou null (abandonnée ou en cours). */
export function gameWinner(game) {
  const s = gameState(game);
  return !game.abandoned && s.status === STATUS.FINISHED ? game.config.players[s.winner] : null;
}

/** Moyenne sur 3 fléchettes d'une liste de volées (les bust comptent 0). */
const avg3 = visits => {
  const darts = visits.reduce((n, v) => n + v.darts.length, 0);
  return darts ? (visits.reduce((n, v) => n + v.scored, 0) / darts) * 3 : null;
};

/** Résumé d'un joueur (rang `p`) dans une partie : sert à l'écran de fin et à l'historique. */
export function playerSummary(state, p, legNumber = null) {
  const visits = state.visits.filter(v => v.player === p && (legNumber === null || v.leg === legNumber));
  const finishes = visits.filter(v => v.finish);
  return {
    darts: visits.reduce((n, v) => n + v.darts.length, 0),
    average: avg3(visits),
    best: visits.reduce((m, v) => Math.max(m, v.scored), 0),
    bestFinish: finishes.reduce((m, v) => Math.max(m, v.startRemaining), 0) || null,
    legsWon: state.legsWon[p],
    visits: visits.length,
  };
}

/**
 * Statistiques d'un joueur sur une liste de parties (déjà filtrées par période).
 *   average, first9, checkoutRate, doubleRate, bestFinish, shortestLeg, ton (100–139), ton40 (140–179),
 *   max (180), played, won, legsPlayed, legsWon, segments (carte des impacts), timeline (moyenne par partie),
 *   headToHead (par adversaire : { played, won, lost }).
 */
export function playerStats(games, playerId) {
  const out = {
    played: 0, won: 0, legsPlayed: 0, legsWon: 0, darts: 0, points: 0,
    average: null, first9: null, checkoutRate: null, doubleRate: null,
    checkoutChances: 0, checkouts: 0, doubleDarts: 0, doubleHits: 0,
    bestFinish: null, shortestLeg: null, ton: 0, ton40: 0, max: 0, bestVisit: 0,
    segments: emptySegments(), timeline: [], headToHead: {},
  };
  let f9Points = 0, f9Darts = 0;
  const sorted = [...games].sort((a, b) => a.startedAt - b.startedAt);

  for (const game of sorted) {
    const p = game.config.players.indexOf(playerId);
    if (p < 0) continue;
    const s = gameState(game);
    const outMode = s.config.outMode;
    out.played += 1;
    const winner = gameWinner(game);
    if (winner === playerId) out.won += 1;
    if (winner !== null) {
      for (const other of game.config.players) {
        // un joueur supprimé n'est plus un adversaire (ses parties restent, la victoire ou la défaite aussi)
        if (other === playerId || isDeletedId(other)) continue;
        const h = out.headToHead[other] || (out.headToHead[other] = { played: 0, won: 0, lost: 0 });
        h.played += 1;
        if (winner === playerId) h.won += 1;
        else if (winner === other) h.lost += 1;
      }
    }
    const mine = s.visits.filter(v => v.player === p);
    const g = avg3(mine);
    if (g !== null) out.timeline.push({ at: game.startedAt, average: g, gameId: game.id });

    for (const leg of s.legs) {
      const legVisits = leg.visits.filter(v => v.player === p);
      if (!legVisits.length) continue;
      if (leg.winner !== null) out.legsPlayed += 1;
      if (leg.winner === p) {
        out.legsWon += 1;
        const n = legVisits.reduce((k, v) => k + v.darts.length, 0);
        out.shortestLeg = out.shortestLeg === null ? n : Math.min(out.shortestLeg, n);
      }
      legVisits.slice(0, 3).forEach(v => { f9Points += v.scored; f9Darts += v.darts.length; });
    }

    for (const v of mine) {
      out.darts += v.darts.length;
      out.points += v.scored;
      out.bestVisit = Math.max(out.bestVisit, v.scored);
      if (v.scored === 180) out.max += 1;
      else if (v.scored >= 140) out.ton40 += 1;
      else if (v.scored >= 100) out.ton += 1;
      if (suggestCheckout(v.startRemaining, outMode, 3)) {
        out.checkoutChances += 1;
        if (v.finish) out.checkouts += 1;
      }
      if (v.finish) out.bestFinish = Math.max(out.bestFinish || 0, v.startRemaining);
      // fléchettes « à la finition » : celles lancées quand une seule fléchette pouvait finir (un double en sortie double)
      let left = v.startRemaining;
      v.darts.forEach((d, i) => {
        if (suggestCheckout(left, outMode, 1)) {
          out.doubleDarts += 1;
          if (v.finish && i === v.darts.length - 1) out.doubleHits += 1;
        }
        left -= dartValue(d);
        addSegment(out.segments, d);
      });
    }
  }
  out.average = out.darts ? (out.points / out.darts) * 3 : null;
  out.first9 = f9Darts ? (f9Points / f9Darts) * 3 : null;
  out.checkoutRate = out.checkoutChances ? out.checkouts / out.checkoutChances : null;
  out.doubleRate = out.doubleDarts ? out.doubleHits / out.doubleDarts : null;
  return out;
}

// Carte des segments : { 1…20: [simple, double, triple], 25: [25, 50, –], miss, total }
function emptySegments() {
  const s = { total: 0, miss: 0 };
  for (let i = 1; i <= 20; i++) s[i] = [0, 0, 0];
  s[25] = [0, 0, 0];
  return s;
}

function addSegment(map, d) {
  map.total += 1;
  if (d.segment === 0) map.miss += 1;
  else map[d.segment][d.multiplier - 1] += 1;
}

/**
 * Face-à-face (lot 3) : `playerId` contre `opponentId`, sur leurs parties communes, de la plus récente à la plus
 * ancienne. Partie terminée : `result` = 'won' (gagnée par le joueur), 'lost' (par l'adversaire) ou 'other' (par un
 * troisième joueur) ; elle compte dans le bilan (won, lost, other) et dans le bilan des manches (manches gagnées par
 * l'un et par l'autre dans ces parties). Partie abandonnée : listée à part (`abandoned`), elle ne compte pas.
 * Chaque ligne : { id, at, config, legs: [joueur, adversaire], average: [joueur, adversaire], winner (identifiant), result }.
 */
export function faceToFace(games, playerId, opponentId) {
  const out = { won: 0, lost: 0, other: 0, legsWon: 0, legsLost: 0, games: [], abandoned: [] };
  for (const g of [...games].sort((x, y) => y.startedAt - x.startedAt)) {
    const ids = g.config.players;
    const a = ids.indexOf(playerId), b = ids.indexOf(opponentId);
    if (a < 0 || b < 0 || a === b) continue;
    const s = gameState(g);
    const row = {
      id: g.id, at: g.startedAt, config: g.config,
      legs: [s.legsWon[a], s.legsWon[b]],
      average: [playerSummary(s, a).average, playerSummary(s, b).average],
      winner: null, result: null,
    };
    if (g.abandoned || s.status !== STATUS.FINISHED) { out.abandoned.push(row); continue; }
    row.winner = ids[s.winner];
    row.result = s.winner === a ? 'won' : s.winner === b ? 'lost' : 'other';
    out[row.result] += 1;
    out.legsWon += row.legs[0];
    out.legsLost += row.legs[1];
    out.games.push(row);
  }
  return out;
}
