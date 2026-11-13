// Strela — règles du Cricket (lot 10). JS pur, sans dépendance ni affichage, comme x01.js : l'état se recalcule
// toujours depuis la configuration et la liste des fléchettes (rien d'autre n'est enregistré).
//
// Configuration : { game: 'cricket', players: [identifiants] (1 à 8), mode, legsToWin (1 par défaut) }
//   mode 'points' (par défaut) : au-delà de 3 marques sur une cible, la valeur compte tant qu'un adversaire ne l'a pas
//        fermée ; gagne celui qui a tout fermé avec au moins autant de points que chacun des autres ;
//   mode 'sans' : pas de points, le premier qui ferme tout gagne ;
//   mode 'cutthroat' : les points vont à chaque adversaire qui n'a pas fermé la cible ; gagne celui qui a tout fermé
//        avec au plus autant de points que chacun des autres.
// Cibles : 20 à 15 et le bull. Marques : simple 1, double 2, triple 3 ; bull : 25 = 1, 50 = 2. Toute autre fléchette
// (1 à 14, à côté) ne marque rien. Une volée = 3 fléchettes ; une manche gagnée arrête la volée.
// Tout le monde a tout fermé sans gagnant (on ne marque plus rien) : le meilleur score l'emporte (à égalité, celui qui
// vient de lancer).
// MPR (marques par volée de 3 fléchettes) : marques qui ferment une cible + marques qui rapportent des points.
import { dartError } from './darts.js';

export const CRICKET_TARGETS = Object.freeze([20, 19, 18, 17, 16, 15, 25]);
export const CRICKET_MODES = Object.freeze(['points', 'sans', 'cutthroat']);
export const MAX_CRICKET_PLAYERS = 8;

export class CricketError extends Error {
  constructor(code, message) { super(message); this.name = 'CricketError'; this.code = code; }
}

/** La partie est-elle un Cricket ? (absent ou autre = X01) */
export const isCricket = g => !!(g && g.config && g.config.game === 'cricket');

/** Configuration vérifiée et figée (erreur si invalide). */
export function normalizeCricket(config) {
  if (!config || typeof config !== 'object') throw new CricketError('CONFIG', 'configuration absente');
  const { players, mode = 'points', legsToWin = 1 } = config;
  if (config.game !== 'cricket') throw new CricketError('GAME', 'pas un cricket');
  if (!Array.isArray(players) || players.length < 1 || players.length > MAX_CRICKET_PLAYERS) throw new CricketError('PLAYERS', 'joueurs');
  if (new Set(players).size !== players.length) throw new CricketError('PLAYERS', 'joueur en double');
  if (!CRICKET_MODES.includes(mode)) throw new CricketError('MODE', `mode ${mode}`);
  if (!Number.isInteger(legsToWin) || legsToWin < 1 || legsToWin > 9) throw new CricketError('LEGS', `manches ${legsToWin}`);
  return Object.freeze({ game: 'cricket', players: Object.freeze([...players]), mode, legsToWin });
}

const fresh = n => ({ marks: Array.from({ length: n }, () => Object.fromEntries(CRICKET_TARGETS.map(t => [t, 0]))), scores: new Array(n).fill(0) });
const closedAll = m => CRICKET_TARGETS.every(t => m[t] >= 3);

/**
 * État :
 *   config, status ('playing' | 'finished'), winner (rang ou null), legNumber, legStarter, legsWon[]
 *   currentPlayer, dartNumber (1 à 3 ; null si fini)
 *   marks[] : par joueur, { 20: 0…, 25: … } (au plus 3 = fermé), scores[] (manche en cours ; à la fin, ceux de la
 *     dernière manche)
 *   visit : volée en cours { player, darts[], marks, points } ; visits[] : volées closes { leg, player, darts[],
 *     marks, points, closed: [cibles fermées par la volée] } ; legs[] : { number, starter, winner, visits[], scores }
 *   lastEvent : 'none' | 'dart' | 'visit_end' | 'leg_won' | 'match_won' ; lastVisit ; dartCount
 */
export function computeCricket(config, darts = []) {
  const cfg = normalizeCricket(config);
  if (!Array.isArray(darts)) throw new TypeError('darts doit être une liste');
  const n = cfg.players.length;
  let { marks, scores } = fresh(n);
  const legsWon = new Array(n).fill(0);
  const visits = [];
  const legs = [];
  let leg = { number: 1, starter: 0, winner: null, visits: [], scores: null };
  legs.push(leg);
  let current = 0;
  let open = null;
  let winner = null;
  let over = false;
  let lastEvent = 'none';
  let lastVisit = null;

  const close = () => {
    const rec = Object.freeze({ leg: leg.number, player: open.player, darts: Object.freeze(open.darts), marks: open.marks, points: open.points, closed: Object.freeze(open.closed) });
    visits.push(rec); leg.visits.push(rec); lastVisit = rec; open = null;
  };

  darts.forEach((d, i) => {
    if (over) throw new CricketError('OVER', `fléchette n° ${i + 1} après la fin de partie`);
    const err = dartError(d);
    if (err) throw new CricketError('DART', `fléchette n° ${i + 1} : ${err}`);
    if (!open) open = { player: current, darts: [], marks: 0, points: 0, closed: [] };
    open.darts.push(Object.freeze({ segment: d.segment, multiplier: d.multiplier }));
    const p = current;
    const t = CRICKET_TARGETS.includes(d.segment) ? d.segment : null;
    if (t !== null) {
      const value = t === 25 ? 25 : t;
      for (let k = 0; k < d.multiplier; k++) {
        if (marks[p][t] < 3) {
          marks[p] = { ...marks[p], [t]: marks[p][t] + 1 };
          open.marks += 1;
          if (marks[p][t] === 3) open.closed.push(t);
        } else if (cfg.mode === 'points') {
          if (marks.some((m, q) => q !== p && m[t] < 3)) { scores[p] += value; open.marks += 1; open.points += value; }
        } else if (cfg.mode === 'cutthroat') {
          const others = marks.map((m, q) => q).filter(q => q !== p && marks[q][t] < 3);
          if (others.length) { for (const q of others) scores[q] += value; open.marks += 1; open.points += value; }
        }
      }
    }
    lastEvent = 'dart';
    // Gagnant ?
    let won = false;
    if (closedAll(marks[p])) {
      const others = scores.filter((_, q) => q !== p);
      if (cfg.mode === 'sans' || !others.length) won = true;
      else if (cfg.mode === 'points') won = others.every(s => scores[p] >= s);
      else won = others.every(s => scores[p] <= s);
    }
    if (!won && marks.every(closedAll)) won = true; // plus rien à marquer : le meilleur score, voir plus bas
    if (won) {
      let w = p;
      if (!closedAll(marks[p]) || (cfg.mode !== 'sans' && marks.every(closedAll))) {
        const best = cfg.mode === 'cutthroat' ? Math.min(...scores) : Math.max(...scores);
        w = scores[p] === best ? p : scores.indexOf(best);
      }
      close();
      leg.winner = w; leg.scores = [...scores]; leg.marks = marks.map(m => ({ ...m }));
      legsWon[w] += 1;
      if (legsWon[w] >= cfg.legsToWin) { winner = w; over = true; lastEvent = 'match_won'; return; }
      lastEvent = 'leg_won';
      // Manche suivante : le premier à lancer change à chaque manche.
      ({ marks, scores } = fresh(n));
      const starter = leg.number % n;
      leg = { number: leg.number + 1, starter, winner: null, visits: [], scores: null };
      legs.push(leg);
      current = starter;
      return;
    }
    if (open.darts.length === 3) { close(); lastEvent = 'visit_end'; current = (current + 1) % n; }
  });

  return {
    config: cfg, status: over ? 'finished' : 'playing', winner,
    legNumber: leg.number, legStarter: leg.starter, legsWon,
    currentPlayer: over ? null : current, dartNumber: over ? null : (open ? open.darts.length + 1 : 1),
    marks, scores, visit: open ? { ...open } : { player: current, darts: [], marks: 0, points: 0, closed: [] },
    visits, legs, lastEvent, lastVisit, dartCount: darts.length,
  };
}

/** Rang d'arrivée de chaque joueur dans la dernière manche (gagnant d'abord ; puis cibles fermées, puis points). */
export function cricketStandings(state) {
  const legsOf = state.legsWon;
  const closed = state.marks.map(m => CRICKET_TARGETS.filter(t => m[t] >= 3).length);
  const better = state.config.mode === 'cutthroat' ? (a, b) => a - b : (a, b) => b - a;
  return state.config.players.map((_, p) => p).sort((a, b) => (a === state.winner ? -1 : b === state.winner ? 1 : 0)
    || legsOf[b] - legsOf[a] || closed[b] - closed[a] || better(state.scores[a], state.scores[b]));
}

/** Résumé d'un joueur dans une partie : { darts, marks, mpr, points, closed (cibles fermées en tout), best (meilleure volée en marques) }. */
export function cricketSummary(state, p) {
  const mine = state.visits.filter(v => v.player === p);
  const openMine = state.visit && state.visit.player === p ? [state.visit] : [];
  const all = [...mine, ...openMine];
  const darts = all.reduce((n, v) => n + v.darts.length, 0);
  const marks = all.reduce((n, v) => n + v.marks, 0);
  return { darts, marks, mpr: darts ? (marks / darts) * 3 : null, points: all.reduce((n, v) => n + v.points, 0),
    closed: all.reduce((n, v) => n + v.closed.length, 0), best: mine.reduce((m, v) => Math.max(m, v.marks), 0) };
}

/** Stats Cricket d'un joueur sur des parties closes : { played, won, mpr, best, darts, marks }. */
export function cricketPlayerStats(games, id) {
  let played = 0, won = 0, darts = 0, marks = 0, best = 0;
  for (const g of games) {
    const p = g.config.players.indexOf(id);
    if (p < 0) continue;
    let s;
    try { s = computeCricket(g.config, g.darts); } catch (e) { continue; }
    const sum = cricketSummary(s, p);
    if (!sum.darts) continue;
    played += 1;
    if (!g.abandoned && s.status === 'finished' && s.winner === p) won += 1;
    darts += sum.darts; marks += sum.marks; best = Math.max(best, sum.best);
  }
  return { played, won, darts, marks, mpr: darts ? (marks / darts) * 3 : null, best };
}
