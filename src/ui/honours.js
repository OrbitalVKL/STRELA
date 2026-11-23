// Lot 9 (2e partie, choix de Guillaume : badges A + B) : vitrine des records et badges d'un joueur (Stats), tableau
// d'honneur commun (#/honneur, onglet des Stats) et badges gagnés annoncés en fin de partie.
// Tout vient de engine/badges.js, recalculé depuis les parties closes (mis en cache tant qu'elles ne changent pas).
// Lot 7.8 (retours du 20/11) : un appui sur un badge (tableau d'honneur, vitrine, fin de partie, soirée) ouvre sa
// fenêtre : ce qu'il veut dire, la partie et la volée où il a été gagné (VOIR LA PARTIE ouvre le détail sur cette
// volée) ; badges à rangs (bronze, argent, or) ; badges gagnés pendant une soirée (tableau de bord).
import { modeBand } from './modeband.js';
import { store, playerById } from './store.js';
import { esc, ico, topBar, plural, shortDate, when, OUT_SHORT } from './dom.js';
import { avatarHtml } from './avatars.js';
import { honours, playerBadges, badgesOfGame, badgeWhere, badgeByKey, badgeLabel, BADGES, TIER_NAMES } from '../engine/badges.js';
import { playerRecords } from '../engine/records.js';
import { gameState } from '../engine/stats.js';
import { formatDart } from '../engine/darts.js';
import { selectLogCell } from './screens/history.js';
import { refresh, backFrom, go } from './nav.js';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const fmt1 = x => (x === null || x === undefined ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ','));

let cache = null;
/** Badges et événements de toutes les parties closes (et de `extra`, la partie qui vient de finir, si elle n'y est pas). */
export function allHonours(extra = null) {
  const games = extra && !store.games.some(g => g.id === extra.id) ? [...store.games, extra] : store.games;
  const key = `${games.length}:${games.reduce((n, g) => n + g.darts.length, 0)}:${extra ? extra.id : ''}:${new Date().getMonth()}`;
  if (cache && cache.key === key) return cache.h;
  const h = honours(games);
  cache = { key, h };
  return h;
}

/** Rang d'un badge à rangs : trois carrés (pleins jusqu'au rang) et le nom du rang. */
export const tierHtml = (tier, cls = 'tier') => `<span class="${cls}" aria-label="Rang ${TIER_NAMES[tier] || 'aucun'}"><span class="sq">${[1, 2, 3].map(k => `<i class="${k <= tier ? 'on' : ''}"></i>`).join('')}</span>${tier ? `<span class="tn">${TIER_NAMES[tier].toUpperCase()}</span>` : ''}</span>`;

/** Attributs d'un élément qui ouvre la fenêtre du badge `key` du joueur `pid` (rang `tier` d'un badge à rangs). */
export const badgeOpen = (pid, key, tier = 0) => `data-act="badge-open" data-arg="${esc(`${pid}|${key}|${tier || 0}`)}"`;

const tile = (pid, b) => {
  const sub = b.tiers
    ? (b.earned ? `${b.total}${b.next ? ` / ${b.next}` : ''}` : `${b.total} / ${b.tiers[0]} · ${esc(b.desc.toLowerCase())}`)
    : b.earned ? `${shortDate(b.at)}${b.count > 1 ? ` · ×${b.count}` : ''}` : esc(b.desc);
  return `<li class="${b.earned ? 'on' : 'off'}${b.tiers ? ' tiered' : ''}" data-badge="${b.key}"><button type="button" ${badgeOpen(pid, b.key)} aria-label="${esc(badgeLabel(b.key, b.tier || 0))}">
  ${ico(b.icon)}<b>${esc(b.name)}</b>${b.tiers ? tierHtml(b.tier) : ''}<small>${sub}</small></button></li>`;
};

/** Vitrine d'un joueur (Stats) : ses records avec la date, puis ses badges (non gagnés en discret). */
export function vitrineHtml(pid, sec, infoBox, fold = null) {
  const h = allHonours();
  const badges = playerBadges(h, pid);
  const got = badges.filter(b => b.earned).length;
  const rec = playerRecords(store.games, pid);
  const dateOf = key => { const at = h.recordsAt[pid] && h.recordsAt[pid][key]; return at ? shortDate(at) : ''; };
  const row = (label, value, key) => (value === null || value === undefined || value === 0 ? ''
    : `<li><span class="rl">${label}</span><b>${value}</b><small>${dateOf(key)}</small></li>`);
  const recs = [row('Meilleure volée', rec.bestVisit, 'visit'), row('Meilleure moyenne', rec.bestAverage === null ? null : fmt1(rec.bestAverage), 'avg'),
    row('Manche la plus courte', rec.shortestLeg === null ? null : `${rec.shortestLeg} fl.`, 'leg'), row('Plus grosse finition', rec.bestFinish, 'fin')].join('');
  return `${sec('Records et badges', 'vitrine', `<span class="n">${got} / ${BADGES.length}</span>`)}
    ${infoBox('vitrine', 'Depuis toujours, quelle que soit la période choisie. Date d\'un record : la partie où il a été établi. Badges du mois : gagnés à la fin du mois, ×n s\'il a été gagné plusieurs fois. Badges à rangs (carrés) : bronze, argent puis or, cumulés sur toutes les parties ; le chiffre est le total, puis le seuil du rang suivant. Les badges pas encore gagnés sont en discret, avec ce qu\'il faut faire. Touchez BADGES pour les déplier, puis un badge pour sa signification, et la partie et la volée où il a été gagné.')}
    ${recs ? `<ul class="vrecs">${recs}</ul>` : ''}
    ${fold ? fold('badges', 'Badges', `${got} / ${BADGES.length}`, `<ul class="badges">${badges.map(b => tile(pid, b)).join('')}</ul>`) // 0.11.1 : repliable
      : `<ul class="badges">${badges.map(b => tile(pid, b)).join('')}</ul>`}
    <a class="btn ghost honour-link" href="#/honneur">${ico('trophy')} TABLEAU D'HONNEUR</a>`;
}

/** Badges gagnés pendant la partie qui vient de finir (fin de partie). */
export function gameBadgesHtml(g) {
  if (!g || g.abandoned) return '';
  const list = badgesOfGame(allHonours(g), g.id);
  if (!list.length) return '';
  const byKey = Object.fromEntries(BADGES.map(b => [b.key, b]));
  return `<div class="pad"><div class="sec">Badges gagnés</div><ul class="recs gbadges">${list.map(x => {
    const p = playerById(x.id);
    return `<li><button type="button" ${badgeOpen(x.id, x.key, x.tier)}>${avatarHtml(p, 28)}<span class="nm ell">${esc(p.name)}</span><span class="rl">${esc(x.name)}</span><b>${ico(byKey[x.key].icon)}</b><small>${x.tier ? 'nouveau rang' : 'nouveau badge'}</small></button></li>`;
  }).join('')}</ul></div>`;
}

/** Texte annoncé à la voix pour les badges de la partie (ou ''). */
export function gameBadgesSay(g) {
  if (!g || g.abandoned) return '';
  const list = badgesOfGame(allHonours(g), g.id);
  return list.map(x => `${playerById(x.id).name} gagne le badge ${x.name.replace(' · ', ', ')}`).join('. ');
}

// ------------------------------------------------------------------ tableau d'honneur
const ui = { kind: 'tout', all: false };
const SHOWN = 30; // événements montrés avant VOIR TOUT
/** Maquette : état de l'écran (filtre). */
export function presetHonour(state = {}) { ui.kind = state.kind || 'tout'; ui.all = !!state.all; }
const monthLabel = ms => { const d = new Date(ms); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export function honourScreen() {
  const h = allHonours();
  const known = id => store.players.some(p => p.id === id);
  const events = h.events.filter(e => known(e.id) && (ui.kind === 'tout' || e.kind === ui.kind));
  const b = (v, l) => `<button type="button" data-act="honour-kind" data-arg="${v}" aria-pressed="${ui.kind === v}">${l}</button>`;
  const head = `${topBar('Tableau d\'honneur', backFrom('#/'))}${modeBand('soiree')}<div class="pad tabs2"><div class="seg">
    <a href="#/stats" role="button" aria-pressed="false">Joueur</a>
    <a href="#/classement" role="button" aria-pressed="false">Classement</a>
    <a href="#/honneur" role="button" aria-pressed="true">Honneur</a></div></div>
    <div class="pad" style="margin-top:10px"><div class="seg">${b('tout', 'Tout')}${b('badge', 'Badges')}${b('record', 'Records')}</div></div>`;
  if (!events.length) {
    return `<div class="screen">${head}<div class="empty"><div class="big">RIEN POUR L'INSTANT</div>
      <p>Les badges gagnés et les records battus de tous les joueurs apparaîtront ici, du plus récent au plus ancien.</p>
      <a class="btn primary" href="#/nouvelle">NOUVELLE PARTIE</a></div></div>`;
  }
  // Champions : le plus de badges (tous joueurs).
  const counts = Object.entries(h.byPlayer).filter(([id]) => known(id)).map(([id, m]) => [id, Object.values(m).reduce((n, x) => n + x.count, 0)])
    .sort((a, c) => c[1] - a[1]);
  const top = counts.slice(0, 3).map(([id, n], i) => { const p = playerById(id); return `<li><span class="rk">${i + 1}</span>${avatarHtml(p, 30)}<span class="nm ell">${esc(p.name)}</span><b>${n}</b></li>`; }).join('');
  const groups = [];
  const shown = ui.all ? events : events.slice(0, SHOWN);
  for (const e of shown) {
    const label = monthLabel(e.at);
    let gr = groups[groups.length - 1];
    if (!gr || gr.label !== label) groups.push(gr = { label, items: [] });
    gr.items.push(e);
  }
  const byKey = Object.fromEntries(BADGES.map(x => [x.key, x]));
  const item = e => {
    const p = playerById(e.id);
    const inner = `${avatarHtml(p, 30)}<span class="nm ell">${esc(p.name)}</span><span class="rl">${esc(e.label)} · ${shortDate(e.at)}</span>`;
    // Lot 7.8 : un badge ouvre sa fenêtre (signification, partie, volée) ; un record ouvre les stats du joueur.
    if (e.kind === 'badge') return `<li class="badge"><button type="button" ${badgeOpen(e.id, e.key, e.tier)}>${inner}<b class="bi">${ico(byKey[e.key].icon)}</b><small>${e.tier ? TIER_NAMES[e.tier] : 'badge'}</small></button></li>`;
    return `<li class="${e.kind}"><a href="#/stats/${esc(e.id)}">${inner}<b>${esc(e.value)}</b><small>avant : ${esc(e.before)}</small></a></li>`;
  };
  return `<div class="screen honour">${head}
    <div class="pad">
      <div class="sec">Le plus de badges<span class="n">${plural(counts.length, 'joueur', 'joueurs')}</span></div>
      <ol class="htop">${top}</ol>
      ${groups.map(gr => `<div class="sec">${esc(gr.label)}</div><ul class="recs hlist">${gr.items.map(item).join('')}</ul>`).join('')}
      ${shown.length < events.length ? `<button type="button" class="btn ghost more" data-act="honour-all">VOIR TOUT <small>${events.length - shown.length} DE PLUS</small></button>` : ''}
    </div></div>`;
}

// ------------------------------------------------------------------ fenêtre d'un badge (lot 7.8)
let sheet = null; // { pid, key, tier, path (écran où elle a été ouverte) } ou null
const here = () => decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
/** Fenêtre ouverte d'avance (sommaire de maquette, tests ; elle se rattache au prochain écran affiché), ou fermée (null). */
export function presetBadgeSheet(x = null) { sheet = x ? { ...x, path: undefined } : null; }
/** En changeant d'écran, la fenêtre se ferme (app.js, `path` : le nouvel écran). */
export function closeBadgeSheet(path) { if (sheet && sheet.path !== undefined && sheet.path !== path) sheet = null; }

const gameById = id => store.games.find(g => g.id === id) || (store.current && store.current.id === id ? store.current : null);
const MONTHS2 = MONTHS.map(m => m.toUpperCase());

/** Ce qu'un badge veut dire (une phrase). */
export function badgeMeaning(b) {
  if (b.tiers) return `${b.desc}, cumulés sur toutes les parties : bronze à ${b.tiers[0]}, argent à ${b.tiers[1]}, or à ${b.tiers[2]}.`;
  if (b.monthly) return `${b.desc}. Gagné à la fin du mois ; il peut l'être plusieurs fois.`;
  return `${b.desc}. Gagné une fois pour toutes, à la première partie qui le remplit.`;
}

/** La volée de rang `idx` d'une partie, en clair : { leg, tour, darts, score, legs }, ou null. */
export function visitInfo(g, idx) {
  if (!g || idx === null || idx === undefined) return null;
  let s;
  try { s = gameState(g); } catch (e) { return null; }
  const v = s.visits[idx];
  if (!v) return null;
  const tour = s.visits.slice(0, idx + 1).filter(x => x.player === v.player && x.leg === v.leg).length;
  return { leg: v.leg, tour, legs: s.legs.length, darts: v.darts.map(d => formatDart(d).replace(/^S/, '')).join(' '), score: v.bust ? 'BUST' : String(v.scored), finish: v.finish };
}

function whereHtml(where, b) {
  if (!where) return '';
  if (!where.gameId) { // badge du mois
    const d = new Date(where.at);
    return `<ul class="bkv"><li><span>Mois</span><b>${MONTHS2[d.getMonth()]} ${d.getFullYear()}</b></li>${where.count > 1 ? `<li><span>Gagné</span><b>${where.count} fois</b></li>` : ''}</ul>`;
  }
  const g = gameById(where.gameId);
  if (!g) return `<ul class="bkv"><li><span>Date</span><b>${esc(when(where.at))}</b></li><li><span>Partie</span><b>supprimée</b></li></ul>`;
  const others = g.config.players.map(id => playerById(id).name).join(', ');
  const vi = visitInfo(g, where.visit);
  const rows = [
    `<li><span>Date</span><b>${esc(when(g.startedAt))}</b></li>`,
    `<li><span>Partie</span><b>${g.config.startScore} · ${OUT_SHORT[g.config.outMode] || ''}</b></li>`,
    `<li><span>Joueurs</span><b class="ell">${esc(others)}</b></li>`,
    vi ? `<li><span>Volée</span><b>${vi.legs > 1 ? `MANCHE ${vi.leg} · ` : ''}TOUR ${vi.tour}</b></li><li><span>Fléchettes</span><b>${esc(vi.darts) || '–'} <em>= ${vi.score}</em></b></li>`
      : `<li><span>Volée</span><b>${b.key === 'clean' || b.key === 'marathon' || b.key === 'games50' ? 'toute la partie' : '—'}</b></li>`,
  ];
  // La partie qui vient de finir n'est pas encore dans l'historique (elle y entre en quittant la fin de partie).
  const listed = store.games.some(x => x.id === g.id);
  return `<ul class="bkv">${rows.join('')}</ul>
    ${listed ? `<button type="button" class="btn" data-act="badge-game" data-arg="${esc(`${g.id}|${vi ? where.visit : ''}`)}">${ico('history')} VOIR LA PARTIE${vi ? ' À CETTE VOLÉE' : ''}</button>` : ''}`;
}

/** La fenêtre du badge ouvert, ou '' (ajoutée par app.js à l'écran affiché). */
export function badgeSheetHtml() {
  if (!sheet) return '';
  if (sheet.path === undefined) sheet.path = here();
  const b = badgeByKey(sheet.key);
  const p = playerById(sheet.pid);
  if (!b || !p) return '';
  const h = allHonours();
  const mine = playerBadges(h, sheet.pid).find(x => x.key === b.key);
  const tier = b.tiers ? (sheet.tier || mine.tier || 0) : 0;
  const where = badgeWhere(h, sheet.pid, b.key, tier);
  const what = n => (b.what ? `${n} ${n > 1 ? b.what[1] : b.what[0]}` : String(n));
  let body = `<p class="bmean">${esc(badgeMeaning(b))}</p>`;
  if (b.tiers) {
    const x = h.byPlayer[sheet.pid] && h.byPlayer[sheet.pid][b.key];
    const got = x ? x.tiers : [];
    body += `<div class="sec">Rangs<span class="n">${esc(what(mine.total))}</span></div><ul class="btiers">${[1, 2, 3].map(k => {
      const t = got.find(y => y.tier === k);
      return `<li class="${t ? 'on' : ''}${k === tier ? ' cur' : ''}">${tierHtml(k)}<span class="th">${b.tiers[k - 1]}</span><small>${t ? shortDate(t.at) : mine.total < b.tiers[k - 1] ? `encore ${b.tiers[k - 1] - mine.total}` : ''}</small>
        ${t && k !== tier ? `<button type="button" class="tsee" ${badgeOpen(sheet.pid, b.key, k)} aria-label="Voir où le rang ${TIER_NAMES[k]} a été gagné">${ico('chev')}</button>` : ''}</li>`;
    }).join('')}</ul>`;
  }
  body += where ? `<div class="sec">${b.tiers ? `Rang ${TIER_NAMES[where.tier]} gagné` : 'Gagné'}</div>${whereHtml(where, b)}`
    : '<div class="sec">Pas encore gagné</div><p class="note">Il apparaîtra ici avec la partie et la volée où il aura été gagné.</p>';
  return `<div class="sheet-bg bsheet" role="dialog" aria-label="Badge : ${esc(b.name)}" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>Badge</span></h1><button type="button" class="act" data-act="badge-close" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body">
      <div class="bhero ${mine && mine.earned ? 'on' : 'off'}">${ico(b.icon)}<b>${esc(b.name)}</b>${b.tiers ? tierHtml(tier) : ''}</div>
      <div class="bwho">${avatarHtml(p, 32)}<span class="nm ell">${esc(p.name)}</span></div>
      ${body}
      <button type="button" class="btn primary" data-act="badge-close">FERMER</button>
    </div></div></div>`;
}

export const actions = {
  'honour-kind'(k) { ui.kind = k; refresh(); },
  'honour-all'() { ui.all = true; refresh(); },
  'badge-open'(arg) { const [pid, key, tier] = String(arg).split('|'); sheet = { pid, key, tier: Number(tier) || 0, path: here() }; refresh(); },
  'badge-close'() { sheet = null; refresh(); },
  'badge-game'(arg) {
    const [gid, visit] = String(arg).split('|');
    sheet = null;
    selectLogCell(visit === '' || visit === undefined ? null : `${gid}|${visit}`, true);
    go(`#/partie/${gid}`);
  },
};
