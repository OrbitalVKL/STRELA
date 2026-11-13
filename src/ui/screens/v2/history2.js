// Lot 7.8 (maquette, ?maquette seulement) : historique plus facile à parcourir quand les parties s'accumulent.
// - Filtres : joueur (une pastille par joueur), résultat (toutes, terminées, abandonnées), mois.
// - Parties rangées par soirée (parties d'une même soirée ensemble, avec ses verres) ou, hors soirée, par jour ;
//   chaque groupe se replie (les deux plus récents ouverts) ; titres de mois.
// - Lignes compactes : heure, jeu, avatars, vainqueur. Appui long : la sélection et la suppression de la liste
//   actuelle (history.js) reprennent la main.
import { store, playerById } from '../../store.js';
import { esc, ico, topBar, plural } from '../../dom.js';
import { avatarHtml } from '../../avatars.js';
import { gameState, gameWinner } from '../../../engine/stats.js';
import { refresh } from '../../nav.js';
import { historyList, selectingGames } from '../history.js';

const DAYS = ['DIM.', 'LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.'];
const MONTHS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
const MSHORT = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];

const f = { player: null, result: 'all', month: 'all', open: null, more: 0 };
/** Sommaire de maquette : filtres préparés. */
export function presetHistory2(state = {}) {
  Object.assign(f, { player: null, result: 'all', month: 'all', open: null, more: 0 }, state);
  if (state.open) f.open = new Set(state.open);
}

const hhmm = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const monthKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}`; };
const dayLabel = (ms, now = Date.now()) => {
  const d = new Date(ms), day = x => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y.getTime(); };
  // Une soirée qui finit après minuit compte pour la veille (on regarde le début de la première partie).
  const diff = Math.round((day(now) - day(ms)) / 86400000);
  if (diff === 0) return 'AUJOURD\'HUI';
  if (diff === 1) return 'HIER';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MSHORT[d.getMonth()]}`;
};
// Jour « de soirée » : une partie lancée avant 6 h du matin compte pour la veille.
const eveningDay = ms => { const d = new Date(ms - 6 * 3600000); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

function row(g) {
  const w = gameWinner(g);
  const s = gameState(g);
  const res = g.abandoned ? '<span class="tag red">ABANDON</span>'
    : w ? `<span class="win">${ico('trophy')}<span class="nm ell">${esc(playerById(w).name)}</span></span>` : '<span class="tag">EN COURS</span>';
  const legs = g.config.legsToWin > 1 ? ` · ${s.legsWon.join('–')}` : '';
  return `<li><a class="hrow" href="#/partie/${esc(g.id)}" data-long="select-game" data-arg="${esc(g.id)}">
    <span class="t">${hhmm(g.startedAt)}</span>
    <span class="g">${g.config.startScore}${g.config.outMode === 'single' ? ' S' : ''}${legs}</span>
    <span class="avs">${g.config.players.slice(0, 3).map(id => avatarHtml(playerById(id), 22)).join('')}${g.config.players.length > 3 ? `<small>+${g.config.players.length - 3}</small>` : ''}</span>
    <span class="r">${res}</span></a></li>`;
}

/** Groupes : une soirée (même identifiant) ou, hors soirée, un jour. Du plus récent au plus ancien. */
function groups(games) {
  const out = [];
  const byKey = new Map();
  for (const g of games) {
    const key = g.soiree ? `s:${g.soiree}` : `d:${eveningDay(g.startedAt)}`;
    let grp = byKey.get(key);
    if (!grp) { grp = { key, soiree: !!g.soiree, games: [] }; byKey.set(key, grp); out.push(grp); }
    grp.games.push(g);
  }
  return out;
}

export function history2List() {
  if (selectingGames()) return historyList();
  const all = [...store.games].sort((a, b) => b.startedAt - a.startedAt);
  if (!all.length) return historyList();
  const months = [...new Set(all.map(g => monthKey(g.startedAt)))];
  const games = all.filter(g => (!f.player || g.config.players.includes(f.player))
    && (f.result === 'all' || (f.result === 'abandoned' ? g.abandoned : !g.abandoned))
    && (f.month === 'all' || monthKey(g.startedAt) === f.month));
  const gs = groups(games);
  const open = f.open || new Set(gs.slice(0, 2).map(x => x.key));
  // Joueurs présents dans l'historique (actifs d'abord).
  const ids = [...new Set(all.flatMap(g => g.config.players))].filter(id => store.players.some(p => p.id === id));
  const pchip = id => {
    const p = playerById(id);
    return `<button type="button" class="pchip" data-act="h2-player" data-arg="${esc(id)}" aria-pressed="${f.player === id}">${avatarHtml(p, 30)}<span class="nm">${esc(p.name)}</span></button>`;
  };
  const r = (v, l) => `<button type="button" data-act="h2-result" data-arg="${v}" aria-pressed="${f.result === v}">${l}</button>`;
  const mchip = k => {
    const [y, m] = k.split('-').map(Number);
    const n = all.filter(g => monthKey(g.startedAt) === k).length;
    return `<button type="button" class="chip2" data-act="h2-month" data-arg="${k}" aria-pressed="${f.month === k}">${MSHORT[m]}${y !== new Date().getFullYear() ? ` ${y}` : ''} <small>· ${n}</small></button>`;
  };
  let body = '';
  let lastMonth = null;
  for (const grp of gs) {
    const first = grp.games[grp.games.length - 1]; // la plus ancienne du groupe : début de la soirée
    const mk = monthKey(first.startedAt);
    if (mk !== lastMonth) {
      const [y, m] = mk.split('-').map(Number);
      body += `<li class="hmonth">${MONTHS[m]} ${y}</li>`;
      lastMonth = mk;
    }
    const isOpen = open.has(grp.key);
    const drinks = grp.games.reduce((n, g) => n + (g.drinks ? Object.values(g.drinks).reduce((a, l) => a + l.length, 0) : 0), 0);
    const players = [...new Set(grp.games.flatMap(g => g.config.players))];
    const span = grp.games.length > 1 ? `${hhmm(first.startedAt)} – ${hhmm(grp.games[0].startedAt)}` : hhmm(first.startedAt);
    body += `<li class="hgroup${isOpen ? ' open' : ''}">
      <button type="button" class="hhead" data-act="h2-open" data-arg="${esc(grp.key)}" aria-expanded="${isOpen}">
        <span class="d">${grp.soiree ? `${ico('glass')} ` : ''}${dayLabel(first.startedAt)}</span>
        <span class="k">${grp.soiree ? 'SOIRÉE · ' : ''}${plural(grp.games.length, 'PARTIE', 'PARTIES')}${drinks ? ` · ${drinks} VERRES` : ''}</span>
        <span class="avs">${players.slice(0, 3).map(id => avatarHtml(playerById(id), 20)).join('')}${players.length > 3 ? `<small>+${players.length - 3}</small>` : ''}</span>
        <span class="sp">${span}</span>${ico(isOpen ? 'up' : 'down')}</button>
      ${isOpen ? `<ul class="hrows">${grp.games.map(row).join('')}</ul>` : ''}</li>`;
  }
  const filtered = f.player || f.result !== 'all' || f.month !== 'all';
  const empty = !gs.length ? `<div class="empty" style="padding:28px 16px"><div class="big">AUCUNE PARTIE</div><p>Aucune partie ne correspond à ces filtres.</p>
      <button type="button" class="btn primary" data-act="h2-clear">TOUT AFFICHER</button></div>` : '';
  return `<div class="screen history2">${topBar('Historique', '#/', `<span class="act dim" style="font-weight:600">${all.length}</span>`)}
    <div class="hfilters">
      <div class="pchips"><button type="button" class="pchip all" data-act="h2-player" data-arg="" aria-pressed="${!f.player}"><span class="allbox">${ico('players')}</span><span class="nm">TOUS</span></button>${ids.map(pchip).join('')}</div>
      <div class="pad"><div class="seg sm">${r('all', 'Toutes')}${r('done', 'Terminées')}${r('abandoned', 'Abandons')}</div></div>
      <div class="chips2 months"><button type="button" class="chip2" data-act="h2-month" data-arg="all" aria-pressed="${f.month === 'all'}">${ico('calendar')} TOUS LES MOIS</button>${months.map(mchip).join('')}</div>
    </div>
    <div class="hsum"><span>${filtered ? `${plural(games.length, 'partie', 'parties')} sur ${all.length}` : plural(all.length, 'partie', 'parties')} · ${plural(gs.length, 'groupe', 'groupes')}</span>
      <span class="ops"><button type="button" class="lnk" data-act="h2-all" data-arg="1">TOUT DÉPLIER</button><button type="button" class="lnk" data-act="h2-all" data-arg="0">TOUT REPLIER</button></span></div>
    ${empty || `<ul class="hlist">${body}</ul>`}
    <p class="note pad">Les parties d'une même soirée sont ensemble ; hors soirée, rangées par jour (une partie après minuit compte pour la veille). Appui long sur une partie pour en sélectionner plusieurs et les supprimer.</p></div>`;
}

export const actions = {
  'h2-player'(id) { f.player = id && f.player !== id ? id : null; f.open = null; refresh(); },
  'h2-result'(v) { f.result = v; f.open = null; refresh(); },
  'h2-month'(k) { f.month = k; f.open = null; refresh(); },
  'h2-clear'() { presetHistory2(); refresh(); },
  'h2-open'(key) {
    const all = [...store.games].sort((a, b) => b.startedAt - a.startedAt);
    if (!f.open) f.open = new Set(groups(all).slice(0, 2).map(x => x.key));
    if (f.open.has(key)) f.open.delete(key); else f.open.add(key);
    refresh();
  },
  'h2-all'(v) {
    f.open = v === '1' ? new Set(groups([...store.games]).map(x => x.key)) : new Set();
    refresh();
  },
};
