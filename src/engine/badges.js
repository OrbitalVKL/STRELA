// Strela — badges et tableau d'honneur (lot 9, choix de Guillaume : vitrine dans les stats ET tableau d'honneur commun).
// JS pur, sans DOM. Tout est recalculé depuis les parties closes (aucune donnée en plus) :
// - un badge est gagné à la première partie qui remplit sa condition (date = début de cette partie) ; les badges du mois
//   (champion, roi du bust) se gagnent pour chaque mois fini et se comptent ;
// - lot 7.8 (retours du 20/11) : badges à rangs (bronze, argent, or) cumulés sur toutes les parties, rétroactifs (tout
//   est recalculé) ; chaque badge garde la partie et la volée où il a été gagné (fenêtre d'un badge) ;
// - les événements du tableau d'honneur : badges gagnés (chaque rang) et records battus (à partir de la 2e partie).
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
  // Lot 7.8 : badges à rangs, cumulés sur toutes les parties (seuils bronze, argent, or). `what` : ce qui est compté.
  { key: 'uns', name: 'Le Roi des Uns', desc: 'Fléchettes dans le 1', what: ['fléchette dans le 1', 'fléchettes dans le 1'], icon: 'crown', tiers: [50, 150, 400] },
  { key: 'sniper', name: 'Le Sniper', desc: 'Bulls (25 ou 50)', what: ['bull', 'bulls'], icon: 'sniper', tiers: [25, 100, 250] },
  { key: 'fermier', name: 'Le Fermier du 60', desc: 'Triples 20', what: ['triple 20', 'triples 20'], icon: 'fork', tiers: [50, 200, 500] },
  { key: 'notaire', name: 'Le Notaire', desc: 'Parties gagnées sur un double', what: ['partie gagnée sur un double', 'parties gagnées sur un double'], icon: 'seal', tiers: [10, 50, 150] },
  { key: 'feu', name: 'Le Feu d\'Artifice', desc: 'Volées à 180', what: ['volée à 180', 'volées à 180'], icon: 'burst', tiers: [1, 5, 20] },
  { key: 'deco', name: 'Décorateur de Murs', desc: 'Fléchettes hors cible', what: ['fléchette hors cible', 'fléchettes hors cible'], icon: 'wall', tiers: [20, 75, 200] },
  { key: 'plus', name: 'Monsieur Plus', desc: 'Bust', what: ['bust', 'bust'], icon: 'plusplus', tiers: [25, 100, 300] },
  // Lot 10 (validés par Guillaume le 24/11) : parties en ligne. « Ami » = joueur qui a un compte (moi ou un ami lié).
  { key: 'contact', name: 'Premier contact', desc: 'Finir une première partie en ligne', icon: 'phone', online: true },
  { key: 'distance', name: 'Longue distance', desc: 'Gagner en ligne contre un ami', icon: 'trophy', online: true },
  { key: 'revanche', name: 'Revanche', desc: 'Battre en ligne un ami qui t\'avait battu à la partie précédente', icon: 'up', online: true },
  { key: 'sangfroid', name: 'Sang-froid', desc: 'Gagner en ligne après avoir été dernier à mi-partie', icon: 'check', online: true },
  { key: 'reconnexion', name: 'Reconnexion héroïque', desc: 'Gagner une partie en ligne après une coupure réseau', icon: 'sync', online: true },
  { key: 'fidele', name: 'Fidèle au poste', desc: 'Parties en ligne', what: ['partie en ligne', 'parties en ligne'], icon: 'phone', tiers: [10, 50, 150], online: true },
]);
const BY_KEY = Object.fromEntries(BADGES.map(b => [b.key, b]));
export const badgeByKey = key => BY_KEY[key] || null;
/** Rangs des badges à rangs (1 : bronze, 2 : argent, 3 : or). */
export const TIER_NAMES = Object.freeze(['', 'bronze', 'argent', 'or']);
/** « Le Roi des Uns · argent » (rang 0 ou badge sans rang : le nom seul). */
export const badgeLabel = (key, tier = 0) => (BY_KEY[key] ? `${BY_KEY[key].name}${BY_KEY[key].tiers && tier ? ` · ${TIER_NAMES[tier]}` : ''}` : key);

/**
 * Ce que chaque volée apporte aux compteurs des badges à rangs (lot 7.8). `won` : volée qui gagne la partie (le
 * Notaire la compte si la dernière fléchette est un double, bull 50 compris).
 */
export function tierCounts(v, won = false) {
  const c = { uns: 0, sniper: 0, fermier: 0, notaire: 0, feu: 0, deco: 0, plus: 0 };
  for (const d of v.darts) {
    if (d.segment === 1) c.uns += 1;
    if (d.segment === 25) c.sniper += 1;
    if (d.segment === 20 && d.multiplier === 3) c.fermier += 1;
    if (d.segment === 0) c.deco += 1;
  }
  if (!v.bust && v.scored === 180) c.feu = 1;
  if (v.bust) c.plus = 1;
  const last = v.darts[v.darts.length - 1];
  if (won && last && last.multiplier === 2) c.notaire = 1;
  return c;
}

const monthKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthEnd = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 1).getTime() - 1; };
const eveningKey = ms => { const d = new Date(ms - 6 * 3600e3); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/**
 * Badges et événements de tous les joueurs : { byPlayer: { id: { key: { at, gameId, visit, count } } }, events: [{ at,
 * id, kind: 'badge' | 'record', key, label, value, before?, gameId?, visit?, tier? }], recordsAt: { id: { visit | avg |
 * leg | fin: date } }, totals: { id: { uns, sniper… } } } (événements du plus récent au plus ancien ; recordsAt : partie
 * où chaque record actuel a été établi). `visit` : rang de la volée dans la partie (state.visits) qui a fait gagner le
 * badge, ou null (badge de toute la partie). Badges à rangs (lot 7.8) : { at, gameId, visit, count: rang atteint, tier,
 * total, tiers: [{ tier, at, gameId, visit }] }. `now` : les mois pas encore finis ne donnent pas de badge du mois.
 */
/** Lot 10 : à mi-partie (la moitié des fléchettes jouées), le joueur `p` était-il seul dernier (moins de manches, puis
 *  le plus gros reste) ? */
export function lastAtHalf(g, p) {
  if (g.config.players.length < 2 || g.darts.length < 6) return false;
  let h;
  try { h = computeState(g.config, g.darts.slice(0, Math.floor(g.darts.length / 2))); } catch (e) { return false; }
  return g.config.players.every((_, q) => q === p || h.legsWon[p] < h.legsWon[q] || (h.legsWon[p] === h.legsWon[q] && h.remaining[p] > h.remaining[q]));
}

/**
 * `opts.accounts` (lot 10) : identifiants des joueurs qui ont un compte (mon profil et mes amis) — pour les badges en
 * ligne « contre un ami ».
 */
export function honours(games, now = Date.now(), { accounts = new Set() } = {}) {
  const gs = [...games].filter(g => g && g.config && Array.isArray(g.darts)).sort((a, b) => a.startedAt - b.startedAt);
  const byPlayer = {};
  const events = [];
  const recordsAt = {}; // joueur → record → date de la partie où il a été établi
  const earn = (id, key, at, gameId, visit = null) => {
    const mine = byPlayer[id] || (byPlayer[id] = {});
    if (mine[key] && !BY_KEY[key].monthly) return;
    mine[key] = { at, gameId, visit, count: ((mine[key] && mine[key].count) || 0) + 1 };
    events.push({ at, id, kind: 'badge', key, label: BY_KEY[key].name, value: BY_KEY[key].icon, gameId, visit });
  };
  // Lot 7.8 : compteurs cumulés des badges à rangs ; un rang est gagné à la volée qui franchit son seuil.
  const totals = {};
  const TIERED = BADGES.filter(b => b.tiers);
  const addTier = (id, counts, at, gameId, visit) => {
    const t = totals[id] || (totals[id] = Object.fromEntries(TIERED.map(b => [b.key, 0])));
    for (const b of TIERED) {
      const n = counts[b.key];
      if (!n) continue;
      const before = t[b.key];
      t[b.key] += n;
      b.tiers.forEach((th, k) => {
        if (before < th && t[b.key] >= th) {
          const mine = byPlayer[id] || (byPlayer[id] = {});
          const x = mine[b.key] || (mine[b.key] = { tiers: [] });
          x.tiers.push({ tier: k + 1, at, gameId, visit });
          Object.assign(x, { at, gameId, visit, tier: k + 1, count: k + 1 });
          events.push({ at, id, kind: 'badge', key: b.key, label: badgeLabel(b.key, k + 1), value: b.icon, gameId, visit, tier: k + 1 });
        }
      });
    }
  };
  const run = {}; // par joueur : parties, victoires, série, défis, meilleurs (records)
  const R = id => run[id] || (run[id] = { games: 0, wins: 0, streak: 0, defis: 0, best: { visit: 0, avg: null, leg: null, fin: 0 } });
  const months = {}; // mois → joueur → { wins, busts }
  const onlineIds = new Set(); // lot 10 : joueurs qui ont joué en ligne (leurs badges en ligne apparaissent)
  const lastWin = {}; // lot 10 : paire de joueurs → vainqueur de leur dernière partie commune (Revanche)
  const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const evenings = {}; // soir → joueur → parties
  for (const g of gs) {
    let s;
    try { s = computeState(g.config, g.darts); } catch (e) { continue; }
    const finished = s.status === STATUS.FINISHED && !g.abandoned;
    const winner = finished ? s.winner : null;
    const mk = monthKey(g.startedAt), ek = g.soiree ? `s:${g.soiree}` : `d:${eveningKey(g.startedAt)}`;
    const defis = gameDefis(g, s);
    // Lot 7.8 : rang de chaque volée dans la partie, et volée qui gagne la partie (la dernière finition du gagnant).
    const idx = new Map(s.visits.map((v, i) => [v, i]));
    const winVisit = winner === null ? null : s.visits.reduce((w, v, i) => (v.player === winner && v.finish ? i : w), null);
    if (g.online) for (const id of g.config.players) onlineIds.add(id);
    g.config.players.forEach((id, p) => {
      const mine = s.visits.filter(v => v.player === p);
      if (!mine.length || String(id).startsWith('~')) return; // joueur supprimé (anonymisé)
      const first = test => { const v = mine.find(test); return v ? idx.get(v) : null; };
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
      // Badges de la partie (lot 7.8 : avec la volée qui les fait gagner).
      if (top >= 140) earn(id, 'ton40', at, g.id, first(v => !v.bust && v.scored >= 140));
      if (mine.some(v => v.scored === 180)) earn(id, 'max', at, g.id, first(v => v.scored === 180));
      if (fin >= 100) earn(id, 'fin100', at, g.id, first(v => v.finish && v.startRemaining >= 100));
      if (mine.some(v => v.darts.filter(d => d.segment === 25).length === 3)) earn(id, 'bull3', at, g.id, first(v => v.darts.filter(d => d.segment === 25).length === 3));
      if ((g.config.startScore === 501 && !g.config.starts) && leg !== null && leg <= 15) {
        const short = s.legs.find(l => l.winner === p && l.visits.filter(v => v.player === p).reduce((n, v) => n + v.darts.length, 0) <= 15);
        earn(id, 'leg15', at, g.id, short ? idx.get(short.visits.filter(v => v.player === p && v.finish).pop()) ?? null : null);
      }
      if (finished && darts >= 9 && !mine.some(v => v.darts.some(d => d.segment === 0))) earn(id, 'clean', at, g.id);
      if (winner === p) {
        r.wins += 1; r.streak += 1;
        earn(id, 'win1', at, g.id, winVisit);
        if (r.wins >= 10) earn(id, 'win10', at, g.id, winVisit);
        if (r.streak >= 3) earn(id, 'streak3', at, g.id, winVisit);
        const drinks = ((g.drinksBefore && g.drinksBefore[id]) || 0) + unitsOf(g.drinks && g.drinks[id]);
        if (drinks >= 5) earn(id, 'drunkwin', at, g.id, winVisit);
        if (g.config.starts && g.config.starts.some((v, q) => q !== p && v < g.config.starts[p])) earn(id, 'handicap', at, g.id, winVisit);
      } else if (finished) r.streak = 0;
      const okDefis = defis.filter(d => d.player === p && d.ok);
      const before5 = r.defis;
      r.defis += okDefis.length;
      if (r.defis >= 5) earn(id, 'defis5', at, g.id, before5 < 5 ? okDefis[4 - before5].index : null);
      if (r.games >= 50) earn(id, 'games50', at, g.id);
      // Lot 10 : parties en ligne.
      if (g.online && finished) {
        earn(id, 'contact', at, g.id);
        addTier(id, { fidele: 1 }, at, g.id, null);
        const opps = g.config.players.filter((o, q) => q !== p && !String(o).startsWith('~'));
        if (winner === p) {
          if (opps.some(o => accounts.has(o))) earn(id, 'distance', at, g.id, winVisit);
          if (opps.some(o => accounts.has(o) && lastWin[pair(id, o)] === o)) earn(id, 'revanche', at, g.id, winVisit);
          if (lastAtHalf(g, p)) earn(id, 'sangfroid', at, g.id, winVisit);
          if (g.online.cut) earn(id, 'reconnexion', at, g.id, winVisit);
        }
      }
      const ev = evenings[ek] || (evenings[ek] = {});
      ev[id] = (ev[id] || 0) + 1;
      if (ev[id] >= 8) earn(id, 'marathon', at, g.id);
      // Badges à rangs (lot 7.8), volée par volée.
      for (const v of mine) addTier(id, tierCounts(v, idx.get(v) === winVisit), at, g.id, idx.get(v));
      const mo = months[mk] || (months[mk] = {});
      const m = mo[id] || (mo[id] = { wins: 0, busts: 0 });
      if (winner === p) m.wins += 1;
      m.busts += mine.filter(v => v.bust).length;
    });
    // Lot 10 : vainqueur de chaque paire (partie finie), pour la Revanche des parties suivantes.
    if (finished) {
      const ids = g.config.players;
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) lastWin[pair(ids[a], ids[b])] = winner === a ? ids[a] : winner === b ? ids[b] : null;
    }
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
  return { byPlayer, events, recordsAt, totals, onlineIds };
}

/**
 * Vitrine d'un joueur : tous les badges, gagnés ou non ({ ...badge, earned, at, count } ; badges à rangs : tier (0 à 3),
 * total, next (seuil suivant, ou null au rang or)).
 */
export function playerBadges(h, id) {
  const mine = h.byPlayer[id] || {};
  // Lot 10 : les badges en ligne n'apparaissent qu'une fois une partie en ligne jouée.
  const online = !!(h.onlineIds && h.onlineIds.has(id));
  return BADGES.filter(b => !b.online || online).map(b => {
    const x = mine[b.key];
    const out = { ...b, earned: !!x, at: x ? x.at : null, count: x ? x.count : 0 };
    if (b.tiers) {
      const total = (h.totals && h.totals[id] && h.totals[id][b.key]) || 0;
      out.tier = x ? x.tier : 0;
      out.total = total;
      out.next = b.tiers.find(t => t > total) ?? null;
    }
    return out;
  });
}

/** Badges gagnés grâce à la partie `gameId` : [{ id, key, name, tier?, visit }] (badges à rangs : chaque rang gagné). */
export function badgesOfGame(h, gameId) {
  const out = [];
  for (const [id, mine] of Object.entries(h.byPlayer)) {
    for (const [key, x] of Object.entries(mine)) {
      if (x.tiers) { for (const t of x.tiers) if (t.gameId === gameId) out.push({ id, key, name: badgeLabel(key, t.tier), tier: t.tier, visit: t.visit }); }
      else if (x.gameId === gameId) out.push({ id, key, name: BY_KEY[key].name, visit: x.visit ?? null });
    }
  }
  return out;
}

/**
 * Où un badge a été gagné : { at, gameId, visit, tier? } (badge à rangs : le rang `tier` demandé, sinon le dernier), ou
 * null s'il ne l'est pas.
 */
export function badgeWhere(h, id, key, tier = 0) {
  const x = h.byPlayer[id] && h.byPlayer[id][key];
  if (!x) return null;
  if (x.tiers) { const t = (tier && x.tiers.find(y => y.tier === tier)) || x.tiers[x.tiers.length - 1]; return t ? { ...t } : null; }
  return { at: x.at, gameId: x.gameId, visit: x.visit ?? null, count: x.count };
}

const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
