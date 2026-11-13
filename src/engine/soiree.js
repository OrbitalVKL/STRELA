// Strela — tableau de bord d'une soirée (lot 7.8, maquette) : ce que montre l'écran et la feuille à imprimer.
// JS pur, sans affichage. Pire volée : sans les bust ni les volées de finition (comme les Stats).
import { playerStats, gameState, gameWinner } from './stats.js';

const pad2 = n => String(n).padStart(2, '0');
const hhmm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const avg = v => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));

/**
 * Ce que montre le tableau de bord d'une soirée : games = ses parties ; name(id) → pseudo.
 * { start, end, games, drinks, rows: [{ id, played, won, average, best, worst, tons, max, busts, tripleRate, drinks }],
 *   highlights: [{ key, label, id, value, detail }], list: [{ id, at, startScore, winner, players, abandoned }] }
 */
export function soireeModel(games, name = id => id) {
  const gs = [...games].sort((a, b) => a.startedAt - b.startedAt);
  const ids = [...new Set(gs.flatMap(g => g.config.players))];
  const drinksOf = id => gs.reduce((n, g) => n + (g.drinks && g.drinks[id] ? g.drinks[id].length : 0), 0);
  const rows = ids.map(id => {
    const s = playerStats(gs, id);
    return { id, name: name(id), played: s.played, won: s.won, average: s.average, best: s.bestVisit, worst: s.worstVisit,
      tons: s.ton + s.ton40 + s.max, max: s.max, busts: s.busts, tripleRate: s.tripleRate, drinks: drinksOf(id) };
  }).sort((a, b) => b.won - a.won || (b.average ?? -1) - (a.average ?? -1));
  // Volées de la soirée (pour la meilleure et la pire, avec la partie et l'heure).
  const visits = [];
  for (const g of gs) {
    const st = gameState(g);
    for (const v of st.visits) visits.push({ g, v, id: g.config.players[v.player] });
  }
  const hl = [];
  const top = visits.reduce((a, x) => (!a || x.v.scored > a.v.scored ? x : a), null);
  if (top) hl.push({ key: 'best', label: 'Meilleure volée', id: top.id, value: String(top.v.scored), detail: hhmm(top.g.startedAt) });
  const low = visits.filter(x => !x.v.bust && !x.v.finish).reduce((a, x) => (!a || x.v.scored < a.v.scored ? x : a), null);
  if (low) hl.push({ key: 'worst', label: 'Pire volée', id: low.id, value: String(low.v.scored), detail: hhmm(low.g.startedAt) });
  const most = (key, label, fmt = String, min = 1) => {
    const r = rows.reduce((a, x) => (x[key] !== null && (!a || x[key] > a[key]) ? x : a), null);
    if (r && r[key] >= min) hl.push({ key, label, id: r.id, value: fmt(r[key]) });
  };
  const bestAvg = rows.reduce((a, x) => (x.average !== null && (!a || x.average > a.average) ? x : a), null);
  if (bestAvg) hl.push({ key: 'average', label: 'Meilleure moyenne', id: bestAvg.id, value: avg(bestAvg.average) });
  most('max', 'Le plus de 180');
  most('busts', 'Le plus de bust');
  most('drinks', 'Le plus de verres', n => `x${n}`);
  for (const h of hl) h.name = name(h.id);
  const list = [...gs].reverse().map(g => ({ id: g.id, at: g.startedAt, startScore: g.config.startScore, winner: gameWinner(g), players: g.config.players, abandoned: !!g.abandoned }));
  return { start: gs.length ? gs[0].startedAt : null, end: gs.length ? gs[gs.length - 1].startedAt : null, games: gs.length,
    drinks: rows.reduce((n, r) => n + r.drinks, 0), rows, highlights: hl, list };
}

