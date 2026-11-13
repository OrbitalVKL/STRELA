// Lot 7.8 (dans l'appli depuis la 0.8.0) : historique plus facile à parcourir quand les parties s'accumulent.
// - Filtres : joueur (une pastille par joueur), résultat (toutes, terminées, abandonnées), mois.
// - Parties rangées par soirée (parties d'une même soirée ensemble, avec ses verres) ou, hors soirée, par jour ;
//   chaque groupe se replie (les deux plus récents ouverts) ; titres de mois.
// - Lignes compactes : heure, jeu, avatars, vainqueur. Appui long : sélection (plusieurs parties), puis REGROUPER EN
//   SOIRÉE, AJOUTER À UNE SOIRÉE, SORTIR DE LA SOIRÉE ou SUPPRIMER. Un jour hors soirée : EN FAIRE UNE SOIRÉE.
//   Une soirée : TABLEAU DE BORD (#/soiree/<id>, soireedash.js).
import { store, playerById, deleteGames, setGamesSoiree, newSoireeId } from '../../store.js';
import { esc, ico, topBar, plural } from '../../dom.js';
import { avatarHtml } from '../../avatars.js';
import { gameState, gameWinner } from '../../../engine/stats.js';
import { unitsOf } from '../../../engine/alcohol.js';
import { refresh } from '../../nav.js';
import { historyEmpty } from '../history.js';

const DAYS = ['DIM.', 'LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.'];
const MONTHS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
const MSHORT = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];

const f = { player: null, result: 'all', month: 'all', open: null, more: 0 };
let sel = null;      // null, ou Set des parties cochées
let ask = null;      // null | 'delete' | 'attach' (choix de la soirée)
/** Sommaire de maquette : filtres et sélection préparés. */
/** En quittant l'historique : sélection et confirmations oubliées (app.js). */
export function leaveHistory2(path) { if (path !== '/historique') { sel = null; ask = null; } }

export function presetHistory2(state = {}) {
  Object.assign(f, { player: null, result: 'all', month: 'all', open: null, more: 0 }, state);
  if (state.open) f.open = new Set(state.open);
  sel = state.sel ? new Set(state.sel) : null;
  ask = state.ask || null;
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
  const inner = `<span class="t">${hhmm(g.startedAt)}</span>
    <span class="g">${g.config.startScore}${g.config.outMode === 'single' ? ' S' : ''}${legs}</span>
    <span class="avs">${g.config.players.slice(0, 3).map(id => avatarHtml(playerById(id), 22)).join('')}${g.config.players.length > 3 ? `<small>+${g.config.players.length - 3}</small>` : ''}</span>
    <span class="r">${res}</span>`;
  if (sel) {
    const on = sel.has(g.id);
    return `<li><button type="button" class="hrow pick" data-act="h2-pick" data-arg="${esc(g.id)}" aria-pressed="${on}"><span class="box" aria-hidden="true">${on ? ico('check') : ''}</span>${inner}</button></li>`;
  }
  return `<li><a class="hrow" href="#/partie/${esc(g.id)}" data-long="h2-select" data-arg="${esc(g.id)}">${inner}</a></li>`;
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

const soireeLabel = (sid) => {
  const gs = store.games.filter(g => g.soiree === sid);
  const first = gs.reduce((a, g) => (g.startedAt < a.startedAt ? g : a), gs[0]);
  return { at: first.startedAt, n: gs.length };
};

/** Bas de l'écran pendant la sélection : actions sur les parties cochées. */
function selDock() {
  const n = sel.size;
  const games = store.games.filter(g => sel.has(g.id));
  const inSoiree = games.some(g => g.soiree);
  if (ask === 'delete') {
    return `<div class="confirm" role="alertdialog" aria-label="Supprimer ?"><p class="alert-h">SUPPRIMER ${n > 1 ? `CES ${n} PARTIES` : 'CETTE PARTIE'} ?</p>
      <p class="small">Elles disparaissent de l'historique et des stats. Les joueurs restent.</p>
      <div class="btns two"><button type="button" class="btn" data-act="h2-ask" data-arg="">NON</button><button type="button" class="btn alert" data-act="h2-delete">SUPPRIMER</button></div></div>`;
  }
  if (ask === 'attach') {
    const sids = [...new Set(store.games.filter(g => g.soiree).sort((a, b) => b.startedAt - a.startedAt).map(g => g.soiree))].slice(0, 8);
    return `<div class="attach"><p class="alert-h">AJOUTER À QUELLE SOIRÉE ?</p>
      <ul>${sids.map(sid => { const l = soireeLabel(sid); return `<li><button type="button" class="btn ghost" data-act="h2-attach" data-arg="${esc(sid)}">${ico('glass')} ${dayLabel(l.at)} <small>${plural(l.n, 'partie', 'parties')}</small></button></li>`; }).join('')}</ul>
      <button type="button" class="btn" data-act="h2-ask" data-arg="">ANNULER</button></div>`;
  }
  return `<div class="btns two"><button type="button" class="btn primary" data-act="h2-group" ${n ? '' : 'disabled'}>${ico('glass')} REGROUPER EN SOIRÉE</button>
      <button type="button" class="btn" data-act="h2-ask" data-arg="attach" ${n ? '' : 'disabled'}>AJOUTER À UNE SOIRÉE</button></div>
    <div class="btns two"><button type="button" class="btn ghost" data-act="h2-detach" ${inSoiree ? '' : 'disabled'}>SORTIR DE LA SOIRÉE</button>
      <button type="button" class="btn danger" data-act="h2-ask" data-arg="delete" ${n ? '' : 'disabled'}>SUPPRIMER (${n})</button></div>`;
}

export function history2List() {
  const all = [...store.games].sort((a, b) => b.startedAt - a.startedAt);
  if (!all.length) { sel = null; ask = null; return historyEmpty(); }
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
    const drinks = grp.games.reduce((n, g) => n + (g.drinks ? Object.values(g.drinks).reduce((a, l) => a + unitsOf(l), 0) : 0), 0);
    const players = [...new Set(grp.games.flatMap(g => g.config.players))];
    const span = grp.games.length > 1 ? `${hhmm(first.startedAt)} – ${hhmm(grp.games[0].startedAt)}` : hhmm(first.startedAt);
    body += `<li class="hgroup${isOpen ? ' open' : ''}">
      <button type="button" class="hhead" data-act="h2-open" data-arg="${esc(grp.key)}" aria-expanded="${isOpen}">
        <span class="d">${grp.soiree ? `${ico('glass')} ` : ''}${dayLabel(first.startedAt)}</span>
        <span class="k">${grp.soiree ? 'SOIRÉE · ' : ''}${plural(grp.games.length, 'PARTIE', 'PARTIES')}${drinks ? ` · ${drinks} VERRES` : ''}</span>
        <span class="avs">${players.slice(0, 3).map(id => avatarHtml(playerById(id), 20)).join('')}${players.length > 3 ? `<small>+${players.length - 3}</small>` : ''}</span>
        <span class="sp">${span}</span>${ico(isOpen ? 'up' : 'down')}</button>
      ${isOpen ? `<ul class="hrows">${grp.games.map(row).join('')}</ul>
        ${sel ? '' : grp.soiree ? `<a class="hlink" href="#/soiree/${esc(grp.key.slice(2))}">${ico('stats')} TABLEAU DE BORD DE LA SOIRÉE${ico('chev')}</a>`
          : grp.games.length > 1 ? `<button type="button" class="hlink" data-act="h2-makesoiree" data-arg="${esc(grp.games.map(g => g.id).join(','))}">${ico('glass')} EN FAIRE UNE SOIRÉE</button>` : ''}` : ''}</li>`;
  }
  const filtered = f.player || f.result !== 'all' || f.month !== 'all';
  const empty = !gs.length ? `<div class="empty" style="padding:28px 16px"><div class="big">AUCUNE PARTIE</div><p>Aucune partie ne correspond à ces filtres.</p>
      <button type="button" class="btn primary" data-act="h2-clear">TOUT AFFICHER</button></div>` : '';
  if (sel) {
    return `<div class="screen history2 has-dock">${topBar(`${sel.size} sélectionnée${sel.size > 1 ? 's' : ''}`, null, `<button type="button" class="act" data-act="h2-cancel" aria-label="Annuler la sélection">${ico('close')}</button>`)}
      <p class="note pad">Cochez les parties, puis regroupez-les en soirée (leurs verres se cumulent alors d'une partie à l'autre), ajoutez-les à une soirée, sortez-les de leur soirée ou supprimez-les.</p>
      ${empty || `<ul class="hlist">${body}</ul>`}
      <div class="dock" data-layer>${selDock()}</div></div>`;
  }
  return `<div class="screen history2">${topBar('Historique', '#/', `<span class="act dim" style="font-weight:600">${all.length}</span>`)}
    <div class="hfilters">
      <div class="pchips"><button type="button" class="pchip all" data-act="h2-player" data-arg="" aria-pressed="${!f.player}"><span class="allbox">${ico('players')}</span><span class="nm">TOUS</span></button>${ids.map(pchip).join('')}</div>
      <div class="pad"><div class="seg sm">${r('all', 'Toutes')}${r('done', 'Terminées')}${r('abandoned', 'Abandons')}</div></div>
      <div class="chips2 months"><button type="button" class="chip2" data-act="h2-month" data-arg="all" aria-pressed="${f.month === 'all'}">${ico('calendar')} TOUS LES MOIS</button>${months.map(mchip).join('')}</div>
    </div>
    <div class="hsum"><span>${filtered ? `${plural(games.length, 'partie', 'parties')} sur ${all.length}` : plural(all.length, 'partie', 'parties')} · ${plural(gs.length, 'groupe', 'groupes')}</span>
      <span class="ops"><button type="button" class="lnk" data-act="h2-all" data-arg="1">TOUT DÉPLIER</button><button type="button" class="lnk" data-act="h2-all" data-arg="0">TOUT REPLIER</button></span></div>
    ${empty || `<ul class="hlist">${body}</ul>`}
    <p class="note pad">Les parties d'une même soirée sont ensemble ; hors soirée, rangées par jour (une partie après minuit compte pour la veille). Appui long sur une partie pour en sélectionner plusieurs : les regrouper en soirée, les ajouter à une soirée ou les supprimer.</p></div>`;
}

const openOnly = key => { f.open = new Set([key]); f.month = 'all'; };

export const actions = {
  'h2-select'(id) { sel = new Set([id]); ask = null; try { navigator.vibrate?.(20); } catch (e) { /* rien */ } refresh(); },
  'h2-pick'(id) { if (!sel) return; if (sel.has(id)) sel.delete(id); else sel.add(id); ask = null; refresh(); },
  'h2-cancel'() { sel = null; ask = null; refresh(); },
  'h2-ask'(v) { ask = v || null; refresh(); },
  'h2-group'() { const sid = setGamesSoiree([...sel], newSoireeId()); openOnly(`s:${sid}`); sel = null; ask = null; refresh(); },
  'h2-attach'(sid) { setGamesSoiree([...sel], sid); openOnly(`s:${sid}`); sel = null; ask = null; refresh(); },
  'h2-detach'() { setGamesSoiree([...sel], null); sel = null; ask = null; f.open = null; refresh(); },
  'h2-delete'() { deleteGames([...sel]); sel = null; ask = null; refresh(); },
  'h2-makesoiree'(arg) { const sid = setGamesSoiree(String(arg).split(','), newSoireeId()); openOnly(`s:${sid}`); refresh(); },
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
