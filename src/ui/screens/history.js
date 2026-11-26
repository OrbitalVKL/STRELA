// Historique : la liste est celle de la version 0.8.0 (screens/v2/history2.js) ; ici, l'écran vide et le détail.
// Détail : manche par manche, un tableau tour par tour (une colonne par joueur), fléchettes et impacts de chaque volée
// sur la cible (gameLog, partagé avec le panneau « Partie en cours » du jeu).
import { store, playerById, deleteGames, editGameDrinks, beforeTallies, receivedNote } from '../store.js';
import { infoSec, infoBox } from '../info.js';
import { esc, ico, topBar, when, avg, plural, OUT_LABEL } from '../dom.js';
import { avatarHtml, iconSvg } from '../avatars.js';
import { gameState, gameWinner, playerSummary } from '../../engine/stats.js';
import { formatDart } from '../../engine/darts.js';
import { boardSvg, impactsFor, markIcon } from '../board.js';
import { legTable, cellHtml } from '../table.js';
import { gameDefis, defiOf, DEFIS } from '../../engine/defis.js';
import { drinksTimeline, drinkTally, drinksText, addTally } from '../../engine/alcohol.js';
import { drinkSizeSeg, plusDrink, plusLabel, pintMode, drinkCount } from '../drinks.js';
import { sheetSection } from './printsheet.js';
import { go, refresh, backFrom } from '../nav.js';

const dl = d => { const f = formatDart(d); return f.replace(/^S/, ''); };

// Suppression demandée depuis le détail d'une partie (lot 3). La liste (version 0.8.0) est screens/v2/history2.js,
// avec sa propre sélection (appui long) ; ici, son écran vide.
let askDetail = null;   // identifiant de la partie dont la suppression est demandée (détail)

/** En changeant d'écran (`path` : nouvel écran) : confirmation oubliée ailleurs que sur son détail (app.js). */
export function leaveHistory(path) {
  if (path !== `/partie/${askDetail}`) askDetail = null;
}

/** Sommaire de maquette : suppression demandée au détail. */
export function presetHistory({ detail = null } = {}) {
  askDetail = detail;
}

/** Historique sans aucune partie. */
export function historyEmpty() {
  return `<div class="screen">${topBar('Historique', '#/')}
      <div class="empty"><div class="glyph">${iconSvg('flechette')}</div><div class="big">AUCUNE PARTIE</div>
      <p>Les parties terminées ou abandonnées s'afficheront ici, avec le détail de chaque fléchette.</p>
      <a class="btn primary" href="#/nouvelle">NOUVELLE PARTIE</a></div></div>`;
}

// 0.26.0 : « #/partie/<id>/v<n> » ouvre la partie sur sa n-ième volée (depuis une stat, un record, un point de courbe) ;
// la case n'est ouverte qu'en arrivant sur l'adresse (un appui sur une autre case reste possible ensuite).
let lastVisitArg = null;
export function historyDetail(arg) {
  const m = /^(.+)\/v(\d+)$/.exec(arg);
  const id = m ? m[1] : arg;
  if (m && lastVisitArg !== arg) selectLogCell(`${id}|${Number(m[2]) - 1}`, true);
  lastVisitArg = m ? arg : null;
  const g = store.games.find(x => x.id === id) || store.friendGames.find(x => x.id === id); // lot 10 : partie d'amis (badges, stats)
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
  const del = g.owner ? `<p class="note">${esc(receivedNote(g))}</p>` : askDetail === id
    ? `<div class="confirm" role="alert" data-reveal><p class="alert-h">SUPPRIMER CETTE PARTIE ?</p>
        <p class="small">Elle disparaît de l'historique et des stats de chacun. Les joueurs et leurs photos restent.</p>
        <div class="btns two"><button type="button" class="btn" data-act="del-game-no">NON</button><button type="button" class="btn alert" data-act="del-game-yes" data-arg="${esc(id)}">SUPPRIMER</button></div></div>`
    : `<button type="button" class="btn danger" data-act="del-game" data-arg="${esc(id)}">SUPPRIMER CETTE PARTIE</button>`;
  // Version 0.8.1 : verres de la partie, corrigeables (oubli, erreur, verres resaisis d'une partie à l'autre).
  const drinkRows = g.config.players.map(pid => {
    const p = playerById(pid);
    const here = drinkTally(g.drinks && g.drinks[pid]);
    const before = g.soiree ? (beforeTallies(g) || {})[pid] : null; // 0.11.2 : verres et pintes à part
    const records = (g.drinks && g.drinks[pid] && g.drinks[pid].length) || 0;
    return `<li>${avatarHtml(p, 32)}<div class="col"><span class="nm ell">${esc(p.name)}</span>
        ${drinkCount(here)}${before && (before.glasses || before.pints) ? `<small class="dkd">${drinksText(addTally(before, here))} depuis le début de la soirée</small>` : ''}</div>
      <button type="button" class="mv" data-act="gdrink-minus" data-arg="${esc(`${g.id}|${pid}`)}" ${records ? '' : 'disabled'} aria-label="Retirer le dernier verre de ${esc(p.name)}">${ico('minus')}</button>
      <button type="button" class="mv add" data-act="gdrink-plus" data-arg="${esc(`${g.id}|${pid}`)}" aria-label="${esc(plusLabel(p.name))}">${plusDrink()}</button></li>`;
  }).join('');
  const drinks = `<div class="pad" style="margin-top:18px">${infoSec('Verres', 'detail-drinks')}${infoBox('detail-drinks', 'Les verres pris pendant cette partie, à corriger avec − et + (un verre ajouté ici compte à la fin de la partie). Verre de 25 cl ou pinte de 50 cl, comptés à part. Dans une soirée, les parties suivantes reprennent le nouveau cumul.')}
    ${drinkSizeSeg()}<ul class="drinks">${drinkRows}</ul></div>`;
  return `<div class="screen">${topBar('Détail de la partie', backFrom('#/historique'))}${head}${table}${gameLog(g, s, { abandoned: g.abandoned })}${drinks}
    <div class="pad" style="margin-top:22px">${sheetSection(g)}</div>
    <div class="pad" style="margin-top:22px">${del}</div></div>`;
}

// ------------------------------------------------------------------ tableau des manches (partagé)
// Sert au détail d'une partie de l'historique et au panneau « Partie en cours » du jeu. Pour chaque manche : une
// colonne par joueur (avatar et pseudo en tête), une ligne par tour ; chaque case donne les 3 fléchettes du tour, le
// total de la volée en gros et le reste après la volée en petit (table.js, cellHtml). Toucher une case montre ses 3 fléchettes et leur place sur la cible.
let openRow = null; // « idPartie|rangVolée » ou « idPartie|open »
let revealRow = false; // lot 7.8 : case ouverte depuis la fenêtre d'un badge, à faire défiler jusqu'à l'écran une fois

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
  // Lot 7.8 : défi de la volée, en entier, et son résultat.
  const df = c.defi ? `<span class="small vdefi ${c.defi.ok === true ? 'ok' : c.defi.ok === false ? 'ko' : ''}">${ico(c.defi.ok === true ? 'starf' : 'star')}${esc(c.defi.text)}${c.defi.ok === true ? ' · RÉUSSI' : c.defi.ok === false ? ' · RATÉ' : ''}</span>` : '';
  const reveal = revealRow ? ' data-reveal' : '';
  revealRow = false;
  return `<div class="vdet${c.bust ? ' bust' : ''}"${reveal}><div class="vb">${boardSvg({ size: 200, impacts: impactsFor(g, s, c.visitIdx, { previous: false }), label: 'Impacts de la volée' })}
    <div class="vtxt"><span class="small dim caps">Tour ${round}</span><span class="nm ell b">${esc(p.name)}</span>
      <div class="vdarts">${darts}</div><span class="small">${sum}</span>${df}
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
  const timeline = drinksTimeline(s, g.drinks, g.config.players, g.drinksBefore, beforeTallies(g)); // lot 7.1 : verres dans le tableau ; 0.11.2 : verres et pintes
  const defis = defiMap(g, s, live); // lot 7.8 : défi de chaque volée et son résultat
  const shown = s.legs.filter(l => l.visits.length || (live && l.number === s.legNumber));
  const legs = (reverse ? [...shown].reverse() : shown).map(l => {
    const t = legTable(s, l.number, { live, drinks: timeline.byVisit, defis });
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
  // Version 0.8.1 : l'explication est derrière le (i) du titre.
  return `<div class="pad">${infoSec('Tour par tour', 'log')}${infoBox('log', `Chaque case : les fléchettes du tour, le total de la volée en gros, le reste après la volée en petit${g.drinks || g.drinksBefore ? ', les verres du joueur jusque-là (encadrés : pris pendant ce tour)' : ''}${g.drinksBefore ? ' — soirée comprise' : ''}${g.defis ? ' ; une volée avec un défi le rappelle en bas de sa case, avec une étoile rouge pleine s\'il est réussi, grise et vide s\'il est raté' : ''}${live ? ' ; la ligne en inverse est le tour en cours' : ''}. Touchez une case pour voir ses fléchettes sur la cible${details ? '' : ' au-dessus'}.`)}</div>${legs}`;
}

/** Lot 7.8 : défis d'une partie pour le tableau : Map(rang de volée ou 'open' → { short, text, ok }). */
function defiMap(g, s, live) {
  if (!g.defis) return null;
  const out = new Map();
  for (const d of gameDefis(g, s)) {
    const pending = d.declare && d.declared === undefined && live && d.index === s.visits.length - 1;
    out.set(d.index, { short: DEFIS[d.key].short, text: DEFIS[d.key].text, ok: pending ? null : d.ok });
  }
  if (live && s.status === 'playing' && s.visit) {
    const key = defiOf(g, s.visits.length, s.visit.darts.length ? s.visit.startRemaining : s.remaining[s.currentPlayer]);
    if (key) out.set('open', { short: DEFIS[key].short, text: DEFIS[key].text, ok: null });
  }
  return out;
}

/** Case ouverte d'avance (sommaire de maquette, ouverture du panneau du jeu, fenêtre d'un badge) : « idPartie|rangVolée »,
 *  ou null ; `reveal` : l'écran défile jusqu'à elle au prochain affichage. */
export const selectLogCell = (key, reveal = false) => { openRow = key; revealRow = !!(key && reveal); };
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
  // Verres d'une partie de l'historique (0.8.1)
  'gdrink-plus'(arg) { const [gid, pid] = String(arg).split('|'); editGameDrinks(gid, pid, 1, pintMode()); refresh(); },
  'gdrink-minus'(arg) { const [gid, pid] = String(arg).split('|'); editGameDrinks(gid, pid, -1); refresh(); },
};
