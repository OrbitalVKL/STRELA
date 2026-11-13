// Strela — records personnels (lot 9, demande de Guillaume : « record battu annoncé en direct »). JS pur, sans DOM.
// Un record ne compte qu'à partir de la 2e partie terminée du joueur (sinon tout serait un record à la première).
//   - meilleure volée : plus grand total d'une volée (sans bust) ;
//   - meilleure moyenne d'une partie (sur 3 fléchettes, partie terminée) ;
//   - manche la plus courte : moins de fléchettes pour gagner une manche ;
//   - plus grosse finition : plus grand reste fini en une volée.
import { computeState, STATUS } from './x01.js';

const best0 = () => ({ games: 0, bestVisit: 0, bestAverage: null, shortestLeg: null, bestFinish: 0 });

/** Records d'un joueur sur une liste de parties closes (abandonnées comprises pour les volées). */
export function playerRecords(games, playerId) {
  const r = best0();
  for (const g of games) {
    const p = g.config.players.indexOf(playerId);
    if (p < 0) continue;
    let s;
    try { s = computeState(g.config, g.darts); } catch (e) { continue; }
    const mine = s.visits.filter(v => v.player === p);
    if (!mine.length) continue;
    r.games += 1;
    for (const v of mine) {
      if (!v.bust && v.scored > r.bestVisit) r.bestVisit = v.scored;
      if (v.finish && v.startRemaining > r.bestFinish) r.bestFinish = v.startRemaining;
    }
    if (s.status === STATUS.FINISHED && !g.abandoned) {
      const darts = mine.reduce((n, v) => n + v.darts.length, 0);
      const avg = darts ? (mine.reduce((n, v) => n + v.scored, 0) / darts) * 3 : null;
      if (avg !== null && (r.bestAverage === null || avg > r.bestAverage)) r.bestAverage = avg;
    }
    for (const leg of s.legs) {
      if (leg.winner !== p) continue;
      const d = leg.visits.filter(v => v.player === p).reduce((n, v) => n + v.darts.length, 0);
      if (r.shortestLeg === null || d < r.shortestLeg) r.shortestLeg = d;
    }
  }
  return r;
}

/** La volée close `v` bat-elle la meilleure volée du joueur (records `rec`) ? */
export const isVisitRecord = (rec, v) => !!rec && rec.games >= 1 && !v.bust && v.scored > rec.bestVisit && v.scored >= 60;

/**
 * Records battus dans une partie terminée (état `s`, rang du joueur `p`) par rapport à ses parties d'avant (`rec`) :
 * liste de { key, label, value, before } (vide si aucun, ou s'il n'avait pas encore de partie).
 */
export function gameRecords(rec, s, p) {
  if (!rec || rec.games < 1) return [];
  const out = [];
  const mine = s.visits.filter(v => v.player === p);
  const top = mine.filter(v => !v.bust).reduce((m, v) => Math.max(m, v.scored), 0);
  if (top > rec.bestVisit && top >= 60) out.push({ key: 'visit', label: 'Meilleure volée', value: String(top), before: String(rec.bestVisit) });
  if (s.status === STATUS.FINISHED) {
    const darts = mine.reduce((n, v) => n + v.darts.length, 0);
    const avg = darts ? (mine.reduce((n, v) => n + v.scored, 0) / darts) * 3 : null;
    if (avg !== null && rec.bestAverage !== null && avg > rec.bestAverage) out.push({ key: 'average', label: 'Meilleure moyenne', value: fmt1(avg), before: fmt1(rec.bestAverage) });
  }
  for (const leg of s.legs) {
    if (leg.winner !== p) continue;
    const d = leg.visits.filter(v => v.player === p).reduce((n, v) => n + v.darts.length, 0);
    if (rec.shortestLeg !== null && d < rec.shortestLeg) { out.push({ key: 'leg', label: 'Manche la plus courte', value: `${d} fl.`, before: `${rec.shortestLeg} fl.` }); break; }
  }
  const fin = mine.filter(v => v.finish).reduce((m, v) => Math.max(m, v.startRemaining), 0);
  if (fin > rec.bestFinish && rec.bestFinish > 0) out.push({ key: 'finish', label: 'Plus grosse finition', value: String(fin), before: String(rec.bestFinish) });
  return out;
}

const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
