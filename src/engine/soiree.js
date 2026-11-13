// Strela — tableau de bord d'une soirée (lot 7.8, maquette) : ce que montre l'écran et la feuille à imprimer.
// JS pur, sans affichage. Pire volée : sans les bust ni les volées de finition (comme les Stats).
import { playerStats, gameState, gameWinner, playerSummary } from './stats.js';
import { standings, lastPlaces } from './ranking.js';
import { drinkTime } from './alcohol.js';

const pad2 = n => String(n).padStart(2, '0');
const hhmm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const avg = v => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));

/**
 * Ce que montre le tableau de bord d'une soirée : games = ses parties ; name(id) → pseudo.
 * { start, end, games, drinks, rows: [{ id, played, won, average, best, worst, tons, max, busts, tripleRate, drinks }],
 *   highlights: [{ key, label, id, value, detail }], list: [{ id, at, startScore, winner, players, abandoned }],
 *   (lot 7.8, rapport en 3 feuilles) timeline: [{ id, n, at, end, startScore, players, winner, last: [ids], avg: {id},
 *   abandoned }] dans l'ordre du soir ; drinkTimes: {id: [instants]} ; versus: {a: {b: parties où a a fini devant b}} ;
 *   together: {a: {b: parties jouées ensemble}} ; sectors: {id: {1…20, bull}} (fléchettes) ; spread: {id: écart type des
 *   moyennes par partie, null sous 2 parties} ; trophies: [{ key, label, id, name, value, detail }] }
 * Les parties abandonnées ne comptent ni dans « qui bat qui » ni dans la tournée.
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
  // Rapport en 3 feuilles (lot 7.8) : la soirée dans l'ordre, verres horodatés, duels, secteurs, trophées.
  const timeline = gs.map((g, k) => {
    const st = gameState(g);
    const players = g.config.players;
    const a = {};
    players.forEach((id, p) => { a[id] = playerSummary(st, p).average; });
    const next = gs[k + 1];
    const end = g.endedAt || (next ? next.startedAt : g.startedAt + 25 * 60e3);
    return { id: g.id, n: k + 1, at: g.startedAt, end: Math.max(end, g.startedAt), startScore: g.config.startScore, players,
      winner: gameWinner(g), last: g.abandoned ? [] : lastPlaces(st).map(p => players[p]), avg: a, abandoned: !!g.abandoned };
  });
  const drinkTimes = Object.fromEntries(ids.map(id => [id, gs.flatMap(g => (g.drinks && g.drinks[id]) || []).map(drinkTime)
    .filter(t => Number.isFinite(t)).sort((x, y) => x - y)]));
  const versus = Object.fromEntries(ids.map(a => [a, Object.fromEntries(ids.filter(b => b !== a).map(b => [b, 0]))]));
  const together = JSON.parse(JSON.stringify(versus));
  for (const g of gs) {
    if (g.abandoned) continue;
    const place = {};
    for (const r of standings(gameState(g))) place[g.config.players[r.player]] = r.place;
    for (const a of g.config.players) for (const b of g.config.players) {
      if (a === b) continue;
      together[a][b] += 1;
      if (place[a] < place[b]) versus[a][b] += 1;
    }
  }
  const sectors = Object.fromEntries(ids.map(id => {
    const seg = playerStats(gs, id).segments;
    const o = { bull: seg[25][0] + seg[25][1] };
    for (let n = 1; n <= 20; n++) o[n] = seg[n][0] + seg[n][1] + seg[n][2];
    return [id, o];
  }));
  const spread = Object.fromEntries(ids.map(id => {
    const v = timeline.map(t => t.avg[id]).filter(x => x !== undefined && x !== null);
    if (v.length < 2) return [id, null];
    const mu = v.reduce((s, x) => s + x, 0) / v.length;
    return [id, Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / v.length)];
  }));
  const gameNo = g => gs.indexOf(g) + 1;
  const trophies = [];
  const trophy = (key, label, id, value, detail = '') => { if (id !== undefined && id !== null) trophies.push({ key, label, id, name: name(id), value, detail }); };
  if (rows[0] && rows[0].won) trophy('king', 'Roi de la soirée', rows[0].id, `${rows[0].won} victoire${rows[0].won > 1 ? 's' : ''}`);
  if (top) trophy('best', 'Meilleure volée', top.id, String(top.v.scored), `partie ${gameNo(top.g)}`);
  if (low) trophy('worst', 'Pire volée', low.id, `${low.v.scored} point${low.v.scored > 1 ? 's' : ''}`, `partie ${gameNo(low.g)}`);
  const maxOf = key => rows.reduce((a, x) => (x[key] !== null && (!a || x[key] > a[key]) ? x : a), null);
  const bu = maxOf('busts'); if (bu && bu.busts) trophy('busts', 'Roi du bust', bu.id, `${bu.busts} bust`);
  const dr = maxOf('drinks'); if (dr && dr.drinks) trophy('drinks', 'Le plus assoiffé', dr.id, `x${dr.drinks} verres`);
  const reg = ids.filter(id => spread[id] !== null).sort((x, y) => spread[x] - spread[y])[0];
  if (reg) trophy('regular', 'Le plus régulier', reg, `écart ${avg(spread[reg])} pts`);
  const list = [...gs].reverse().map(g => ({ id: g.id, at: g.startedAt, startScore: g.config.startScore, winner: gameWinner(g), players: g.config.players, abandoned: !!g.abandoned }));
  return { start: gs.length ? gs[0].startedAt : null, end: gs.length ? gs[gs.length - 1].startedAt : null, games: gs.length,
    drinks: rows.reduce((n, r) => n + r.drinks, 0), rows, highlights: hl, list,
    timeline, drinkTimes, versus, together, sectors, spread, trophies };
}

