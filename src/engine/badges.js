// Strela — badges et tableau d'honneur (lot 9, choix de Guillaume : vitrine dans les stats ET tableau d'honneur commun).
// JS pur, sans DOM. Tout est recalculé depuis les parties closes (aucune donnée en plus) :
// - un badge est gagné à la première partie qui remplit sa condition (date = début de cette partie) ; les badges du mois
//   (champion, roi du bust) se gagnent pour chaque mois fini et se comptent ;
// - les événements du tableau d'honneur : badges gagnés et records battus (à partir de la 2e partie du joueur).
import { computeState, STATUS } from './x01.js';
import { unitsOf } from './alcohol.js';
import { gameDefis } from './defis.js';

/** Les badges, dans l'ordre de la vitrine : clé, nom, ce qu'il faut faire, pictogramme (icônes de dom.js). */
export const BADGES = Object.freeze([
  { key: 'win1', name: 'Première victoire', desc: 'Gagner une partie', icon: 'trophy' },
  { key: 'win10', name: '10 victoires', desc: 'Gagner 10 parties', icon: 'trophy' },
  { key: 'streak3', name: '3 d\'affilée', desc: 'Gagner 3 parties de suite', icon: 'news' },
  { key: 'ton40', name: 'Premier 140+', desc: 'Une volée de 140 ou plus', icon: 'up' },
  { key: 'max', name: 'Premier 180', desc: 'Une volée de 180', icon: 'target' },
  { key: 'fin100', name: 'Finition 100+', desc: 'Finir 100 ou plus en une volée', icon: 'check' },
  { key: 'bull3', name: 'Bull ×3', desc: 'Trois bulls dans la même volée', icon: 'target' },
  { key: 'leg15', name: 'Éclair', desc: 'Gagner une manche de 501 en 15 fléchettes ou moins', icon: 'play' },
  { key: 'clean', name: 'Sans raté', desc: 'Une partie entière sans une fléchette à côté', icon: 'check' },
  { key: 'drunkwin', name: 'Bu et gagné', desc: 'Gagner une partie avec 5 verres ou plus dans le nez', icon: 'glass' },
  { key: 'handicap', name: 'Handicapé gagnant', desc: 'Gagner en partant de plus loin qu\'un autre', icon: 'up' },
  { key: 'defis5', name: 'Casse-cou', desc: 'Réussir 5 défis de soirée', icon: 'news' },
  { key: 'marathon', name: 'Marathon', desc: '8 parties le même soir', icon: 'calendar' },
  { key: 'games50', name: 'Habitué', desc: 'Jouer 50 parties', icon: 'history' },
  { key: 'champion', name: 'Champion du mois', desc: 'Le plus de victoires d\'un mois (3 au moins)', icon: 'trophy', monthly: true },
  { key: 'bustking', name: 'Roi du bust du mois', desc: 'Le plus de bust d\'un mois (3 au moins)', icon: 'close', monthly: true },
]);
const BY_KEY = Object.fromEntries(BADGES.map(b => [b.key, b]));

const monthKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthEnd = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 1).getTime() - 1; };
const eveningKey = ms => { const d = new Date(ms - 6 * 3600e3); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/**
 * Badges et événements de tous les joueurs : { byPlayer: { id: { key: { at, gameId, count } } }, events: [{ at, id,
 * kind: 'badge' | 'record', key, label, value, before? }], recordsAt: { id: { visit | avg | leg | fin: date } } }
 * (événements du plus récent au plus ancien ; recordsAt : partie où chaque record actuel a été établi).
 * `now` : les mois pas encore finis ne donnent pas de badge du mois.
 */
export function honours(games, now = Date.now()) {
  const gs = [...games].filter(g => g && g.config && Array.isArray(g.darts)).sort((a, b) => a.startedAt - b.startedAt);
  const byPlayer = {};
  const events = [];
  const recordsAt = {}; // joueur → record → date de la partie où il a été établi
  const earn = (id, key, at, gameId) => {
    const mine = byPlayer[id] || (byPlayer[id] = {});
    if (mine[key] && !BY_KEY[key].monthly) return;
    mine[key] = { at, gameId, count: ((mine[key] && mine[key].count) || 0) + 1 };
    events.push({ at, id, kind: 'badge', key, label: BY_KEY[key].name, value: BY_KEY[key].icon });
  };
  const run = {}; // par joueur : parties, victoires, série, défis, meilleurs (records)
  const R = id => run[id] || (run[id] = { games: 0, wins: 0, streak: 0, defis: 0, best: { visit: 0, avg: null, leg: null, fin: 0 } });
  const months = {}; // mois → joueur → { wins, busts }
  const evenings = {}; // soir → joueur → parties
  for (const g of gs) {
    let s;
    try { s = computeState(g.config, g.darts); } catch (e) { continue; }
    const finished = s.status === STATUS.FINISHED && !g.abandoned;
    const winner = finished ? s.winner : null;
    const mk = monthKey(g.startedAt), ek = g.soiree ? `s:${g.soiree}` : `d:${eveningKey(g.startedAt)}`;
    const defis = gameDefis(g, s);
    g.config.players.forEach((id, p) => {
      const mine = s.visits.filter(v => v.player === p);
      if (!mine.length || String(id).startsWith('~')) return; // joueur supprimé (anonymisé)
      const r = R(id);
      r.games += 1;
      const at = g.startedAt;
      // Records battus (à partir de la 2e partie), avant de mettre les meilleurs à jour.
      const top = mine.filter(v => !v.bust).reduce((m, v) => Math.max(m, v.scored), 0);
      const darts = mine.reduce((n, v) => n + v.darts.length, 0);
      const avg = finished && darts ? (mine.reduce((n, v) => n + v.scored, 0) / darts) * 3 : null;
      const legs = s.legs.filter(l => l.winner === p).map(l => l.visits.filter(v => v.player === p).reduce((n, v) => n + v.darts.length, 0));
      const leg = legs.length ? Math.min(...legs) : null;
      const fin = mine.filter(v => v.finish).reduce((m, v) => Math.max(m, v.startRemaining), 0);
      if (r.games > 1) {
        if (top > r.best.visit && top >= 60) events.push({ at, id, kind: 'record', key: 'visit', label: 'Meilleure volée', value: String(top), before: String(r.best.visit) });
        if (avg !== null && r.best.avg !== null && avg > r.best.avg) events.push({ at, id, kind: 'record', key: 'avg', label: 'Meilleure moyenne', value: fmt1(avg), before: fmt1(r.best.avg) });
        if (leg !== null && r.best.leg !== null && leg < r.best.leg) events.push({ at, id, kind: 'record', key: 'leg', label: 'Manche la plus courte', value: `${leg} fl.`, before: `${r.best.leg} fl.` });
        if (fin > r.best.fin && r.best.fin > 0) events.push({ at, id, kind: 'record', key: 'fin', label: 'Plus grosse finition', value: String(fin), before: String(r.best.fin) });
      }
      const ra = recordsAt[id] || (recordsAt[id] = {});
      if (top > r.best.visit) { r.best.visit = top; ra.visit = at; }
      if (avg !== null && (r.best.avg === null || avg > r.best.avg)) { r.best.avg = avg; ra.avg = at; }
      if (leg !== null && (r.best.leg === null || leg < r.best.leg)) { r.best.leg = leg; ra.leg = at; }
      if (fin > r.best.fin) { r.best.fin = fin; ra.fin = at; }
      // Badges de la partie.
      if (top >= 140) earn(id, 'ton40', at, g.id);
      if (mine.some(v => v.scored === 180)) earn(id, 'max', at, g.id);
      if (fin >= 100) earn(id, 'fin100', at, g.id);
      if (mine.some(v => v.darts.filter(d => d.segment === 25).length === 3)) earn(id, 'bull3', at, g.id);
      if ((g.config.startScore === 501 && !g.config.starts) && leg !== null && leg <= 15) earn(id, 'leg15', at, g.id);
      if (finished && darts >= 9 && !mine.some(v => v.darts.some(d => d.segment === 0))) earn(id, 'clean', at, g.id);
      if (winner === p) {
        r.wins += 1; r.streak += 1;
        earn(id, 'win1', at, g.id);
        if (r.wins >= 10) earn(id, 'win10', at, g.id);
        if (r.streak >= 3) earn(id, 'streak3', at, g.id);
        const drinks = ((g.drinksBefore && g.drinksBefore[id]) || 0) + unitsOf(g.drinks && g.drinks[id]);
        if (drinks >= 5) earn(id, 'drunkwin', at, g.id);
        if (g.config.starts && g.config.starts.some((v, q) => q !== p && v < g.config.starts[p])) earn(id, 'handicap', at, g.id);
      } else if (finished) r.streak = 0;
      r.defis += defis.filter(d => d.player === p && d.ok).length;
      if (r.defis >= 5) earn(id, 'defis5', at, g.id);
      if (r.games >= 50) earn(id, 'games50', at, g.id);
      const ev = evenings[ek] || (evenings[ek] = {});
      ev[id] = (ev[id] || 0) + 1;
      if (ev[id] >= 8) earn(id, 'marathon', at, g.id);
      const mo = months[mk] || (months[mk] = {});
      const m = mo[id] || (mo[id] = { wins: 0, busts: 0 });
      if (winner === p) m.wins += 1;
      m.busts += mine.filter(v => v.bust).length;
    });
  }
  // Badges du mois (mois finis seulement) : le meilleur, 3 au moins ; à égalité, chacun.
  const current = monthKey(now);
  for (const [mk, mo] of Object.entries(months).sort()) {
    if (mk >= current) continue;
    const at = monthEnd(mk);
    for (const [field, key] of [['wins', 'champion'], ['busts', 'bustking']]) {
      const top = Math.max(0, ...Object.values(mo).map(x => x[field]));
      if (top < 3) continue;
      for (const [id, x] of Object.entries(mo)) if (x[field] === top) earn(id, key, at, null);
    }
  }
  events.sort((a, b) => b.at - a.at);
  return { byPlayer, events, recordsAt };
}

/** Vitrine d'un joueur : tous les badges, gagnés ou non ({ ...badge, earned, at, count }). */
export function playerBadges(h, id) {
  const mine = h.byPlayer[id] || {};
  return BADGES.map(b => ({ ...b, earned: !!mine[b.key], at: mine[b.key] ? mine[b.key].at : null, count: mine[b.key] ? mine[b.key].count : 0 }));
}

/** Badges gagnés grâce à la partie `gameId` : [{ id, key, name }]. */
export function badgesOfGame(h, gameId) {
  const out = [];
  for (const [id, mine] of Object.entries(h.byPlayer)) for (const [key, x] of Object.entries(mine)) if (x.gameId === gameId) out.push({ id, key, name: BY_KEY[key].name });
  return out;
}

const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
