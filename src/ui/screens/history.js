// Historique : parties de la plus récente à la plus ancienne (date, jeu, joueurs, vainqueur, « abandonnée »).
// Détail : manche par manche, un tableau tour par tour (une colonne par joueur), fléchettes et impacts de chaque volée
// sur la cible (gameLog, partagé avec le panneau « Partie en cours » du jeu).
import { store, playerById, deleteGames } from '../store.js';
import { esc, ico, topBar, when, avg, plural, OUT_LABEL, OUT_SHORT } from '../dom.js';
import { avatarHtml, iconSvg } from '../avatars.js';
import { gameState, gameWinner, playerSummary } from '../../engine/stats.js';
import { formatDart } from '../../engine/darts.js';
import { boardSvg, impactsFor, markIcon } from '../board.js';
import { legTable, cellHtml } from '../table.js';
import { go, refresh } from '../nav.js';

const dl = d => { const f = formatDart(d); return f.replace(/^S/, ''); };

// Sélection (lot 3) : un appui long sur une partie entre en sélection ; on coche, puis SUPPRIMER (n), confirmé.
let picked = null;      // null (liste normale) ou Set des identifiants cochés
let askList = false;    // confirmation de SUPPRIMER (n)
let askDetail = null;   // identifiant de la partie dont la suppression est demandée (détail)

/** En changeant d'écran (`path` : nouvel écran) : sélection et confirmations oubliées ailleurs que là où elles sont (app.js). */
export function leaveHistory(path) {
  if (path !== '/historique') { picked = null; askList = false; }
  if (path !== `/partie/${askDetail}`) askDetail = null;
}

/** Sommaire de maquette : liste en sélection (`ids` cochés, `ask` : confirmation ouverte), ou suppression demandée au détail. */
export function presetHistory({ ids = null, ask = false, detail = null } = {}) {
  picked = ids ? new Set(ids) : null;
  askList = ask;
  askDetail = detail;
}

function gameRow(g, selecting) {
  const w = gameWinner(g);
  const s = gameState(g);
  const result = g.abandoned
    ? '<span class="tag red">ABANDONNÉE</span>'
    : w ? `<span class="dim small">VAINQUEUR</span> <span class="nm ell">${esc(playerById(w).name)}</span>` : '<span class="tag">EN COURS</span>';
  const legs = g.config.legsToWin > 1 ? ` · ${s.legsWon.join('–')}` : '';
  const body = `<div class="l1"><span>${when(g.startedAt)}</span><span>${g.config.startScore} · ${OUT_SHORT[g.config.outMode]}${legs}</span></div>
        <div class="l2"><span class="avs">${g.config.players.map(id => avatarHtml(playerById(id), 28)).join('')}</span>
          <span class="small dim ell nm" style="margin-left:6px">${g.config.players.map(id => esc(playerById(id).name)).join(' · ')}</span></div>
        <div class="l3">${result}</div>`;
  if (selecting) {
    const on = picked.has(g.id);
    return `<li><button type="button" class="gitem pick" data-act="pick-game" data-arg="${esc(g.id)}" aria-pressed="${on}">
      <span class="box" aria-hidden="true">${on ? ico('check') : ''}</span><span class="gbody">${body}</span></button></li>`;
  }
  return `<li><a class="gitem" href="#/partie/${esc(g.id)}" data-long="select-game" data-arg="${esc(g.id)}">${body}</a></li>`;
}

export function historyList() {
  const games = [...store.games].sort((a, b) => b.startedAt - a.startedAt);
  if (!games.length) {
    picked = null;
    return `<div class="screen">${topBar('Historique', '#/')}
      <div class="empty"><div class="glyph">${iconSvg('flechette')}</div><div class="big">AUCUNE PARTIE</div>
      <p>Les parties terminées ou abandonnées s'afficheront ici, avec le détail de chaque fléchette.</p>
      <a class="btn primary" href="#/nouvelle">NOUVELLE PARTIE</a></div></div>`;
  }
  if (picked) {
    const n = picked.size;
    const all = n === games.length;
    const dock = askList
      ? `<div class="confirm" role="alertdialog" aria-label="Supprimer les parties ?"><p class="alert-h">SUPPRIMER ${n > 1 ? `CES ${n} PARTIES` : 'CETTE PARTIE'} ?</p>
          <p class="small">Elles disparaissent de l'historique et des stats. Les joueurs et leurs photos restent.</p>
          <div class="btns two"><button type="button" class="btn" data-act="pick-no">NON</button><button type="button" class="btn alert" data-act="pick-yes">SUPPRIMER</button></div></div>`
      : `<div class="btns pick-dock"><button type="button" class="btn" data-act="pick-all">${all ? 'AUCUNE' : 'TOUTES'}</button>
          <button type="button" class="btn alert" data-act="pick-delete" ${n ? '' : 'disabled'}>SUPPRIMER (${n})</button></div>`;
    return `<div class="screen has-dock">${topBar('Sélection', null,
      `<button type="button" class="act" data-act="pick-cancel" aria-label="Annuler la sélection">${ico('close')}</button>`)}
      <ul class="list">${games.map(g => gameRow(g, true)).join('')}</ul>
      <div class="dock" data-layer>${dock}</div></div>`;
  }
  return `<div class="screen">${topBar('Historique', '#/', `<span class="act dim" style="font-weight:600">${games.length}</span>`)}
    <ul class="list">${games.map(g => gameRow(g, false)).join('')}</ul>
    <p class="note pad">Appui long sur une partie pour en sélectionner plusieurs et les supprimer.</p></div>`;
}

export function historyDetail(id) {
  const g = store.games.find(x => x.id === id);
  if (!g) { go('#/historique', { replace: true }); return ''; }
  const s = gameState(g);
  const w = gameWinner(g);
  const players = g.config.players.map(playerById);
  const head = `<div class="pad" style="padding-top:14px">
      <div class="l1 small dim caps" style="display:flex;justify-content:space-between"><span>${when(g.startedAt)}</span><span>${plural(g.darts.length, 'fléchette', 'fléchettes')}</span></div>
      <div style="margin-top:6px;font-size:20px;font-weight:800">${g.config.startScore} · ${OUT_LABEL[g.config.outMode]}</div>
      <div class="small dim caps">${g.config.legsToWin > 1 ? `Premier à ${g.config.legsToWin} manches` : '1 manche'}
        ${g.abandoned ? ' · <span class="tag red">Abandonnée</span>' : ''}</div>
    </div>`;
  const table = `<div class="pad"><div class="sec">Joueurs</div>
    <table class="score-table"><thead><tr><th>Joueur</th><th>Man.</th><th>Moy.</th><th>Fl.</th><th>Meil.</th></tr></thead><tbody>
    ${players.map((p, i) => { const sum = playerSummary(s, i); return `<tr${w === p.id ? ' class="win"' : ''}><td><div class="pl">${avatarHtml(p, 28)}<span class="nm">${esc(p.name)}</span></div></td>
      <td>${s.legsWon[i]}</td><td>${avg(sum.average)}</td><td>${sum.darts}</td><td>${sum.best}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  const del = askDetail === id
    ? `<div class="confirm" role="alert" data-reveal><p class="alert-h">SUPPRIMER CETTE PARTIE ?</p>
        <p class="small">Elle disparaît de l'historique et des stats de chacun. Les joueurs et leurs photos restent.</p>
        <div class="btns two"><button type="button" class="btn" data-act="del-game-no">NON</button><button type="button" class="btn alert" data-act="del-game-yes" data-arg="${esc(id)}">SUPPRIMER</button></div></div>`
    : `<button type="button" class="btn danger" data-act="del-game" data-arg="${esc(id)}">SUPPRIMER CETTE PARTIE</button>`;
  return `<div class="screen">${topBar('Détail de la partie', '#/historique')}${head}${table}${gameLog(g, s, { abandoned: g.abandoned })}
    <div class="pad" style="margin-top:22px">${del}</div></div>`;
}

// ------------------------------------------------------------------ tableau des manches (partagé)
// Sert au détail d'une partie de l'historique et au panneau « Partie en cours » du jeu. Pour chaque manche : une
// colonne par joueur (avatar et pseudo en tête), une ligne par tour ; chaque case donne les 3 fléchettes du tour, le
// total de la volée en gros et le reste après la volée en petit (table.js, cellHtml). Toucher une case montre ses 3 fléchettes et leur place sur la cible.
let openRow = null; // « idPartie|rangVolée » ou « idPartie|open »

const cell = (g, c) => {
  const key = c ? `${g.id}|${c.visitIdx}` : '';
  return cellHtml(c, { key, selected: !!c && openRow === key });
};

function detail(g, s, t, players) {
  const found = t.rows.flatMap(r => r.cells.map(c => (c && openRow === `${g.id}|${c.visitIdx}` ? { c, round: r.round } : null))).find(Boolean);
  if (!found) return '';
  const { c, round } = found;
  const p = players[c.player];
  const darts = [0, 1, 2].map(k => `<span>${c.darts[k] ? dl(c.darts[k]) : '–'}</span>`).join('');
  const sum = c.bust ? '<b class="red">BUST</b> · aucun point' : c.finish ? `<b>${c.total}</b> · manche gagnée` : `<b>${c.total}</b> · reste ${c.remaining}`;
  return `<div class="vdet${c.bust ? ' bust' : ''}"><div class="vb">${boardSvg({ size: 200, impacts: impactsFor(g, s, c.visitIdx, { previous: false }), label: 'Impacts de la volée' })}
    <div class="vtxt"><span class="small dim caps">Tour ${round}</span><span class="nm ell b">${esc(p.name)}</span>
      <div class="vdarts">${darts}</div><span class="small">${sum}</span>
      <p class="note">${markIcon(true)}fléchette 1, 2, 3<br>Pavé : centre du segment.</p></div></div></div>`;
}

/**
 * Manches d'une partie en tableaux.
 *   live : partie en cours (la volée commencée et le tour en cours sont repérés) ; abandoned : partie abandonnée ;
 *   reverse : manche en cours d'abord (panneau du jeu) ; details : fléchettes de la case touchée sous le tableau
 *   (le panneau du jeu les montre sur sa cible, au-dessus).
 */
export function gameLog(g, s, { live = false, abandoned = false, reverse = false, details = true } = {}) {
  const players = g.config.players.map(playerById);
  const shown = s.legs.filter(l => l.visits.length || (live && l.number === s.legNumber));
  const legs = (reverse ? [...shown].reverse() : shown).map(l => {
    const t = legTable(s, l.number, { live });
    const winner = l.winner !== null ? players[l.winner] : null;
    const wd = winner ? l.visits.filter(v => v.player === l.winner).reduce((n, v) => n + v.darts.length, 0) : 0;
    const info = winner ? `<span class="nm">${esc(winner.name)}</span> en ${wd} fl.` : abandoned ? 'interrompue' : 'en cours';
    const head = t.columns.map(i => `<th class="pc" scope="col">${avatarHtml(players[i], 24, live ? 'mono' : '')}<span class="nm ell">${esc(players[i].name)}</span></th>`).join('');
    const body = t.rows.map(r => `<tr${r.round === t.currentRound ? ' class="cur"' : ''}><th class="rd" scope="row">${r.round}</th>${r.cells.map(c => cell(g, c)).join('')}</tr>`).join('');
    const table = t.rows.length
      ? `<div class="lt-wrap"><table class="lt" style="--cols:${t.columns.length}" data-fit-same><thead><tr><th class="rd" scope="col">TOUR</th>${head}</tr></thead><tbody>${body}</tbody></table></div>${details ? detail(g, s, t, players) : ''}`
      : '<p class="note pad">Aucune volée pour l\'instant.</p>';
    return `<div class="leg-h"><b>MANCHE ${l.number}</b><span>${info}</span></div>${table}`;
  }).join('');
  return `<div class="pad"><div class="sec" style="margin-bottom:0">Tour par tour</div></div>${legs}
    <p class="note pad">Chaque case : les fléchettes du tour, le total de la volée en gros, le reste après la volée en petit${live ? ' ; la ligne en inverse est le tour en cours' : ''}. Touchez une case pour voir ses fléchettes sur la cible${details ? '' : ' au-dessus'}.</p>`;
}

/** Case ouverte d'avance (sommaire de maquette, ouverture du panneau du jeu) : « idPartie|rangVolée », ou null. */
export const selectLogCell = key => { openRow = key; };
/** Case touchée (« idPartie|rangVolée » ou « idPartie|open »), ou null. */
export const selectedLogCell = () => openRow;

export const actions = {
  'log-visit'(key) {
    openRow = openRow === key ? null : key;
    if (store.current) store.current.ui.fix = null; // une autre case : la correction en cours est abandonnée
    refresh();
  },
  // Suppression depuis le détail
  'del-game'(id) { askDetail = id; refresh(); },
  'del-game-no'() { askDetail = null; refresh(); },
  'del-game-yes'(id) { askDetail = null; deleteGames([id]); go('#/historique', { replace: true }); },
  // Sélection dans la liste (appui long)
  'select-game'(id) {
    picked = new Set([id]);
    askList = false;
    try { navigator.vibrate?.(20); } catch (e) { /* rien */ }
    refresh();
  },
  'pick-game'(id) { if (!picked) return; if (picked.has(id)) picked.delete(id); else picked.add(id); askList = false; refresh(); },
  'pick-all'() { if (!picked) return; picked = picked.size === store.games.length ? new Set() : new Set(store.games.map(g => g.id)); askList = false; refresh(); },
  'pick-cancel'() { picked = null; askList = false; refresh(); },
  'pick-delete'() { if (picked && picked.size) { askList = true; refresh(); } },
  'pick-no'() { askList = false; refresh(); },
  'pick-yes'() { if (picked) deleteGames([...picked]); picked = null; askList = false; refresh(); },
};
