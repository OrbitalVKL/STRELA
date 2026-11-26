// Strela — indicateurs communs aux parties et à l'entraînement (refonte des infos, 0.26.0, docs/refonte-infos.md).
// JS pur, sans DOM. Un X01 (ou un Cricket) en solo à l'entraînement est lu comme une partie à un joueur : mêmes calculs,
// mêmes définitions qu'une partie (engine/stats.js › playerStats), donc mêmes chiffres des deux côtés.
// Chaque meilleure ou pire valeur garde sa source : { kind: 'game' | 'ck' | 'training', id, visit } (visit : rang de la
// volée dans state.visits, à partir de 0 ; absent quand la valeur porte sur toute la partie).

import { computeCricket } from './cricket.js';
import { playerStats, gameState } from './stats.js';
import { gameConfig, sessionValue, EXERCISES } from './training.js';

const byAt = (a, b) => a.startedAt - b.startedAt;

// Une séance de jeu (X01, Cricket) vue comme une partie : même objet d'une fois sur l'autre tant que ses fléchettes ne
// changent pas (le cache d'état de stats.js › gameState reste valable).
const asGameCache = new WeakMap();
/** Séance X01 ou Cricket en solo → partie à un joueur { id, startedAt, config, darts, abandoned } ; null sinon. */
export function asGame(r) {
  if (!r || (r.exercise !== 'x01' && r.exercise !== 'cricket')) return null;
  const c = asGameCache.get(r);
  if (c && c.n === r.darts.length) return c.g;
  const cfg = gameConfig(r);
  if (!cfg) return null;
  const g = { id: r.id, startedAt: r.startedAt, endedAt: r.endedAt, config: { ...cfg, players: [r.player] }, darts: r.darts, abandoned: !!r.stopped };
  asGameCache.set(r, { n: r.darts.length, g });
  return g;
}

/**
 * Sources X01 d'un joueur : parties (`games`, liste X01) ou séances X01 en solo (`trainings`), selon l'espace
 * ('p' : parties, 'e' : entraînement). Séances mises de côté exclues (comme dans les stats d'entraînement).
 * Chaque source : { kind, game }.
 */
export function x01Sources(space, { games = [], trainings = [] }, pid) {
  if (space === 'e') return trainings.filter(r => r.player === pid && r.exercise === 'x01' && !r.excluded && r.darts.length).map(r => ({ kind: 'training', game: asGame(r) })).filter(s => s.game);
  return games.filter(g => g.config.players.includes(pid) && g.darts.length).map(g => ({ kind: 'game', game: g }));
}
/** Sources Cricket : parties de Cricket ('p') ou séances de Cricket en solo ('e'). */
export function cricketSources(space, { ckGames = [], trainings = [] }, pid) {
  if (space === 'e') return trainings.filter(r => r.player === pid && r.exercise === 'cricket' && !r.excluded && r.darts.length).map(r => ({ kind: 'training', game: asGame(r) })).filter(s => s.game);
  return ckGames.filter(g => g.config.players.includes(pid) && g.darts.length).map(g => ({ kind: 'ck', game: g }));
}

const rate = (n, d) => (d ? n / d : null);
const top = (list, n, cmp) => [...list].sort(cmp).slice(0, n);

/**
 * Indicateurs X01 d'un joueur sur ses sources (déjà filtrées par période).
 * Valeurs (playerStats) : average, first9, checkoutRate (réussite au double de fin, par chance), checkouts,
 * checkoutChances, ton (100–139), ton40 (140–179), max (180), busts, tripleRate, doubleHitRate (fléchettes dans un double,
 * 50 compris), bulls (25 + 50), offRate (hors cible), darts, played, won.
 * Avec source : bestVisit, worstVisit (hors bust et hors volée de finition, 3 fléchettes), bestFinish, shortestLeg,
 * bestAverage (partie ou séance finie), bestFirst9 ; topVisits / worstVisits (5) ; series (une ligne par source, de la plus
 * ancienne à la plus récente).
 */
export function x01Indicators(sources, pid) {
  const list = [...sources].sort((a, b) => byAt(a.game, b.game));
  const st = playerStats(list.map(s => s.game), pid);
  const seg = st.segments;
  let doubles = seg[25][1];
  for (let i = 1; i <= 20; i++) doubles += seg[i][1];
  const out = {
    played: st.played, won: st.won, darts: st.darts, average: st.average, first9: st.first9,
    checkoutRate: st.checkoutRate, checkouts: st.checkouts, checkoutChances: st.checkoutChances,
    ton: st.ton, ton40: st.ton40, max: st.max, tons: st.ton + st.ton40 + st.max, busts: st.busts,
    bustsPerGame: st.played ? st.busts / st.played : null,
    tripleRate: st.tripleRate, doubleHitRate: rate(doubles, st.darts), bulls: seg[25][0] + seg[25][1], offRate: rate(seg.miss, seg.total),
    bestVisit: null, worstVisit: null, bestFinish: null, shortestLeg: null, bestAverage: null, bestFirst9: null,
    topVisits: [], worstVisits: [], series: [],
  };
  const visits = [];
  for (const s of list) {
    const g = s.game;
    const p = g.config.players.indexOf(pid);
    if (p < 0) continue;
    let state;
    try { state = gameState(g); } catch (e) { continue; }
    const ref = i => (i === undefined ? { kind: s.kind, id: g.id } : { kind: s.kind, id: g.id, visit: i });
    let any = false;
    const tours = {};
    state.visits.forEach((v, i) => {
      if (v.player !== p) return;
      any = true;
      // Tour du joueur dans sa manche (1, 2…) : « volée n » d'une séance, « tour n » d'une partie.
      tours[v.leg] = (tours[v.leg] || 0) + 1;
      const where = { leg: v.leg, legs: g.config.legsToWin > 1, tour: tours[v.leg], startScore: g.config.startScore };
      if (!v.bust) visits.push({ value: v.scored, darts: v.darts, at: g.startedAt, finish: !!v.finish, ref: ref(i), ...where });
      if (v.finish && (!out.bestFinish || v.startRemaining > out.bestFinish.value)) out.bestFinish = { value: v.startRemaining, darts: v.darts, at: g.startedAt, ref: ref(i), ...where };
    });
    if (!any) continue;
    for (const leg of state.legs) {
      if (leg.winner !== p) continue;
      const mine = leg.visits.filter(v => v.player === p);
      const n = mine.reduce((k, v) => k + v.darts.length, 0);
      const last = state.visits.indexOf(mine[mine.length - 1]);
      if (!out.shortestLeg || n < out.shortestLeg.value) out.shortestLeg = { value: n, at: g.startedAt, ref: ref(last), leg: leg.number, legs: g.config.legsToWin > 1, tour: mine.length, startScore: g.config.startScore };
    }
    const one = playerStats([g], pid);
    const finished = state.status === 'finished' && !g.abandoned;
    const whole = { at: g.startedAt, ref: ref(), startScore: g.config.startScore };
    if (finished && one.average !== null && (!out.bestAverage || one.average > out.bestAverage.value)) out.bestAverage = { value: one.average, ...whole };
    if (one.first9 !== null && (!out.bestFirst9 || one.first9 > out.bestFirst9.value)) out.bestFirst9 = { value: one.first9, ...whole };
    const s9 = one.segments;
    let d2 = s9[25][1];
    for (let i = 1; i <= 20; i++) d2 += s9[i][1];
    out.series.push({
      ref: ref(), at: g.startedAt, startScore: g.config.startScore, won: finished && state.winner === p,
      average: one.average, first9: one.first9, best: one.bestVisit, worst: one.worstVisit, busts: one.busts,
      tons: one.ton + one.ton40 + one.max, checkoutRate: one.checkoutRate, tripleRate: one.tripleRate, doubleHitRate: rate(d2, one.darts),
    });
  }
  const desc = (a, b) => b.value - a.value || b.at - a.at;
  const asc = (a, b) => a.value - b.value || b.at - a.at;
  out.topVisits = top(visits, 5, desc);
  out.bestVisit = out.topVisits[0] || null;
  const complete = visits.filter(v => !v.finish && v.darts.length === 3);
  out.worstVisits = top(complete, 5, asc);
  out.worstVisit = out.worstVisits[0] || null;
  return out;
}

/** Indicateurs Cricket : mpr (marques par volée), marks, darts, played, won, bestVisit (marques, avec source), series. */
export function cricketIndicators(sources, pid) {
  const out = { played: 0, won: 0, darts: 0, marks: 0, mpr: null, bestVisit: null, topVisits: [], series: [] };
  const visits = [];
  for (const s of [...sources].sort((a, b) => byAt(a.game, b.game))) {
    const g = s.game;
    const p = g.config.players.indexOf(pid);
    if (p < 0) continue;
    let state;
    try { state = computeCricket(g.config, g.darts); } catch (e) { continue; }
    let darts = 0, marks = 0;
    const tours = {};
    state.visits.forEach((v, i) => {
      if (v.player !== p) return;
      darts += v.darts.length; marks += v.marks || 0;
      tours[v.leg] = (tours[v.leg] || 0) + 1;
      visits.push({ value: v.marks || 0, darts: v.darts, at: g.startedAt, ref: { kind: s.kind, id: g.id, visit: i }, leg: v.leg, legs: g.config.legsToWin > 1, tour: tours[v.leg] });
    });
    if (!darts) continue;
    out.played += 1;
    if (!g.abandoned && state.status === 'finished' && state.winner === p) out.won += 1;
    out.darts += darts; out.marks += marks;
    out.series.push({ ref: { kind: s.kind, id: g.id }, at: g.startedAt, mpr: (marks / darts) * 3, best: Math.max(0, ...visits.filter(v => v.ref.id === g.id).map(v => v.value)) });
  }
  out.mpr = out.darts ? (out.marks / out.darts) * 3 : null;
  out.topVisits = top(visits, 5, (a, b) => b.value - a.value || b.at - a.at);
  out.bestVisit = out.topVisits[0] || null;
  return out;
}

/**
 * Exercices et jeux de cible d'un joueur (entraînement seulement) : une ligne par exercice pratiqué, la plus récente
 * d'abord : { key, name, count, last: { value, at, ref }, best: { value, at, ref }, label, fmt, dir }. Valeur de chaque
 * séance : training.js › sessionValue (celle de la liste des séances) ; `dir` 1 : plus c'est mieux, -1 : moins.
 * Séances mises de côté ou arrêtées avant la fin exclues.
 */
export function exerciseBests(trainings, pid, value = sessionValue) {
  const by = new Map();
  for (const r of [...trainings].sort(byAt)) {
    if (r.player !== pid || r.excluded || r.stopped || !r.darts.length) continue;
    const ex = EXERCISES[r.exercise];
    if (!ex || ex.game) continue;
    let sv;
    try { sv = value(r); } catch (e) { sv = null; }
    if (!sv || sv.v === null || sv.v === undefined) continue;
    const cur = { value: sv.v, at: r.startedAt, ref: { kind: 'training', id: r.id } };
    const row = by.get(r.exercise) || { key: r.exercise, name: ex.name, count: 0, last: null, best: null, label: sv.label, fmt: sv.fmt, dir: sv.dir };
    row.count += 1;
    row.last = cur;
    if (!row.best || (sv.dir < 0 ? cur.value < row.best.value : cur.value > row.best.value)) row.best = cur;
    by.set(r.exercise, row);
  }
  return [...by.values()].sort((a, b) => b.last.at - a.last.at);
}
