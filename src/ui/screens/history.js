// Historique : parties de la plus récente à la plus ancienne (date, jeu, joueurs, vainqueur, « abandonnée »).
// Détail : manche par manche, volée par volée, fléchette par fléchette.
import { store, playerById } from '../store.js';
import { esc, topBar, when, avg, plural, OUT_LABEL, OUT_SHORT } from '../dom.js';
import { avatarHtml, iconSvg } from '../avatars.js';
import { gameState, gameWinner, playerSummary } from '../../engine/stats.js';
import { formatDart } from '../../engine/darts.js';
import { go } from '../nav.js';

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

  const legs = s.legs.filter(l => l.visits.length).map(l => {
    const winner = l.winner !== null ? players[l.winner] : null;
    const wd = winner ? l.visits.filter(v => v.player === l.winner).reduce((n, v) => n + v.darts.length, 0) : 0;
    const info = winner ? `<span class="nm">${esc(winner.name)}</span> en ${wd} fl.` : g.abandoned ? 'interrompue' : 'en cours';
    const rows = l.visits.map(v => {
      const p = players[v.player];
      const cells = [0, 1, 2].map(k => `<td class="d">${v.darts[k] ? dl(v.darts[k]) : ''}</td>`).join('');
      return `<tr class="${v.bust ? 'bust' : v.finish ? 'fin' : ''}"><td>${avatarHtml(p, 24)}</td>${cells}
        <td class="tot">${v.bust ? 'BUST' : v.total}</td><td class="rem">${v.finish ? 'GAGNÉ' : v.remainingAfter}</td></tr>`;
    }).join('');
    return `<div class="leg-h"><b>MANCHE ${l.number}</b><span>${info}</span></div>
      <table class="visits"><tbody>${rows}</tbody></table>`;
  }).join('');
  return `<div class="screen">${topBar('Détail de la partie', '#/historique')}${head}${table}
    <div class="pad"><div class="sec" style="margin-bottom:0">Volée par volée</div></div>${legs}
    <p class="note pad">Chaque ligne : joueur, ses 3 fléchettes, total de la volée, reste après la volée.</p></div>`;
}
