// Historique : parties de la plus récente à la plus ancienne (date, jeu, joueurs, vainqueur, « abandonnée »).
// Détail : manche par manche, volée par volée, fléchette par fléchette, impacts sur la cible (gameLog, partagé avec
// le panneau « Partie en cours » du jeu).
import { store, playerById } from '../store.js';
import { esc, topBar, when, avg, plural, OUT_LABEL, OUT_SHORT } from '../dom.js';
import { avatarHtml, iconSvg } from '../avatars.js';
import { gameState, gameWinner, playerSummary } from '../../engine/stats.js';
import { formatDart } from '../../engine/darts.js';
import { boardSvg, impactsFor } from '../board.js';
import { go, refresh } from '../nav.js';

const dl = d => { const f = formatDart(d); return f.replace(/^S/, ''); };

export function historyList() {
  const games = [...store.games].sort((a, b) => b.startedAt - a.startedAt);
  if (!games.length) {
    return `<div class="screen">${topBar('Historique', '#/')}
      <div class="empty"><div class="glyph">${iconSvg('flechette')}</div><div class="big">AUCUNE PARTIE</div>
      <p>Les parties terminées ou abandonnées s'afficheront ici, avec le détail de chaque fléchette.</p>
      <a class="btn primary" href="#/nouvelle">NOUVELLE PARTIE</a></div></div>`;
  }
  return `<div class="screen">${topBar('Historique', '#/', `<span class="act dim" style="font-weight:600">${games.length}</span>`)}
    <ul class="list">${games.map(g => {
      const w = gameWinner(g);
      const s = gameState(g);
      const result = g.abandoned
        ? '<span class="tag red">ABANDONNÉE</span>'
        : w ? `<span class="dim small">VAINQUEUR</span> <span class="nm ell">${esc(playerById(w).name)}</span>` : '<span class="tag">EN COURS</span>';
      const legs = g.config.legsToWin > 1 ? ` · ${s.legsWon.join('–')}` : '';
      return `<li><a class="gitem" href="#/partie/${esc(g.id)}">
        <div class="l1"><span>${when(g.startedAt)}</span><span>${g.config.startScore} · ${OUT_SHORT[g.config.outMode]}${legs}</span></div>
        <div class="l2"><span class="avs">${g.config.players.map(id => avatarHtml(playerById(id), 28)).join('')}</span>
          <span class="small dim ell nm" style="margin-left:6px">${g.config.players.map(id => esc(playerById(id).name)).join(' · ')}</span></div>
        <div class="l3">${result}</div></a></li>`;
    }).join('')}</ul></div>`;
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
  return `<div class="screen">${topBar('Détail de la partie', '#/historique')}${head}${table}${gameLog(g, s, { abandoned: g.abandoned })}</div>`;
}

// ------------------------------------------------------------------ détail volée par volée (partagé)
// Sert au détail d'une partie de l'historique et au panneau « Partie en cours » du jeu. Toucher une volée
// déplie sous elle la cible avec ses impacts (numérotés) et, en discret, les volées précédentes du joueur.
let openRow = null; // « idPartie|rangVolée » ou « idPartie|open »

/**
 * Manches, volées et fléchettes d'une partie, avec le reste après chaque volée.
 *   live : partie en cours (la volée commencée s'affiche en dernier) ; abandoned : partie abandonnée.
 */
export function gameLog(g, s, { live = false, abandoned = false } = {}) {
  const players = g.config.players.map(playerById);
  const row = (v, idx, open) => {
    const key = `${g.id}|${idx}`;
    const p = players[v.player];
    const cells = [0, 1, 2].map(k => `<td class="d">${v.darts[k] ? dl(v.darts[k]) : ''}</td>`).join('');
    const cls = open ? 'cur' : v.bust ? 'bust' : v.finish ? 'fin' : '';
    const tot = open ? v.total : v.bust ? 'BUST' : v.total;
    const rem = open ? '…' : v.finish ? 'GAGNÉ' : v.remainingAfter;
    const sel = openRow === key;
    let html = `<tr class="${cls}${sel ? ' sel' : ''}" data-act="log-visit" data-arg="${esc(key)}" aria-expanded="${sel}"><td>${avatarHtml(p, 24)}</td>${cells}
      <td class="tot">${tot}</td><td class="rem">${rem}</td></tr>`;
    if (sel) {
      html += `<tr class="vboard"><td colspan="6"><div class="vb">${boardSvg({ size: 210, impacts: impactsFor(g, s, idx), label: 'Impacts de la volée' })}
        <p class="note"><span class="nm">${esc(p.name)}</span><br><b class="sq"></b> cette volée<br><b class="sq old"></b> ses volées précédentes de la manche<br>Pavé : centre du segment.</p></div></td></tr>`;
    }
    return html;
  };
  const legs = s.legs.filter(l => l.visits.length || (live && l.number === s.legNumber)).map(l => {
    const winner = l.winner !== null ? players[l.winner] : null;
    const wd = winner ? l.visits.filter(v => v.player === l.winner).reduce((n, v) => n + v.darts.length, 0) : 0;
    const info = winner ? `<span class="nm">${esc(winner.name)}</span> en ${wd} fl.` : abandoned ? 'interrompue' : 'en cours';
    const rows = l.visits.map(v => row(v, s.visits.indexOf(v), false));
    if (live && l.number === s.legNumber && s.visit && s.visit.darts.length) rows.push(row(s.visit, 'open', true));
    return `<div class="leg-h"><b>MANCHE ${l.number}</b><span>${info}</span></div>
      ${rows.length ? `<table class="visits"><tbody>${rows.join('')}</tbody></table>` : '<p class="note pad">Aucune volée pour l\'instant.</p>'}`;
  }).join('');
  return `<div class="pad"><div class="sec" style="margin-bottom:0">Volée par volée</div></div>${legs}
    <p class="note pad">Chaque ligne : joueur, ses 3 fléchettes, total de la volée, reste après la volée. Touchez une volée pour voir ses impacts sur la cible.</p>`;
}

export const actions = {
  'log-visit'(key) { openRow = openRow === key ? null : key; refresh(); },
};
