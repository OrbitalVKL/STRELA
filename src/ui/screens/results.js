// Fin de manche (vainqueur, fléchettes, moyenne, meilleure volée ; MANCHE SUIVANTE) et
// fin de partie (vainqueur, résumé par joueur ; REVANCHE, ACCUEIL). ANNULER reste possible depuis les deux.
import { store, currentState, playerById, archiveCurrent, startGame } from '../store.js';
import { esc, avg, int, OUT_LABEL, maquetteButtons } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { formatDart } from '../../engine/darts.js';
import { playerSummary } from '../../engine/stats.js';
import { go } from '../nav.js';
import { undo } from './game.js';

const route = v => v.darts.map(d => formatDart(d).replace(/^S/, '')).join(' · ');

export function legEnd() {
  const g = store.current;
  if (!g) { go('#/', { replace: true }); return ''; }
  const s = currentState();
  if (s.status === 'finished') { go('#/fin', { replace: true }); return ''; }
  const leg = [...s.legs].reverse().find(l => l.winner !== null);
  if (!leg) { go('#/jeu', { replace: true }); return ''; }
  const w = leg.winner;
  const p = playerById(g.config.players[w]);
  const sum = playerSummary(s, w, leg.number);
  const fin = leg.visits[leg.visits.length - 1];
  const starter = playerById(g.config.players[s.legStarter]);
  return `<div class="screen has-dock">
    <div class="inv" style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
      <b class="caps" style="letter-spacing:.12em">Manche ${leg.number} gagnée</b><span class="small b">${g.config.startScore} · PREMIER À ${g.config.legsToWin}</span></div>
    <div class="result-head">${avatarHtml(p, 88)}<div style="min-width:0"><span class="t dim">VAINQUEUR</span><span class="nm">${esc(p.name)}</span></div></div>
    <div class="bigstats">
      <div><small>Fléchettes</small><b>${sum.darts}</b></div>
      <div><small>Moyenne 3 fl.</small><b>${avg(sum.average)}</b></div>
      <div><small>Meilleure volée</small><b>${sum.best}</b></div>
      <div><small>Finition</small><b>${fin.startRemaining}</b><span class="small dim">${esc(route(fin))}</span></div>
    </div>
    <div class="pad">
      <div class="sec">Manches</div>
      <table class="score-table"><tbody>${g.config.players.map((id, i) => {
        const q = playerById(id);
        return `<tr${i === w ? ' class="win"' : ''}><td><div class="pl">${avatarHtml(q, 32)}<span class="nm">${esc(q.name)}</span></div></td><td style="font-size:22px">${s.legsWon[i]}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="note">Manche ${s.legNumber} : <span class="nm">${esc(starter.name)}</span> commence.</p>
      <button type="button" class="btn ghost" style="margin-top:14px" data-act="undo-end">ANNULER LA DERNIÈRE FLÉCHETTE</button>
      ${store.maquette ? `<div class="mq-row">${maquetteButtons('mq')}</div>` : ''}
    </div>
    <div class="dock"><a class="btn primary big" href="#/jeu">MANCHE SUIVANTE</a></div>
  </div>`;
}

export function matchEnd() {
  const g = store.current;
  if (!g) { go('#/', { replace: true }); return ''; }
  const s = currentState();
  if (s.status !== 'finished') { go('#/jeu', { replace: true }); return ''; }
  const w = s.winner;
  const p = playerById(g.config.players[w]);
  const rows = g.config.players.map((id, i) => ({ i, p: playerById(id), sum: playerSummary(s, i) }));
  const legsTxt = g.config.legsToWin > 1 ? `${s.legsWon[w]} MANCHES À ${Math.max(...s.legsWon.filter((_, i) => i !== w), 0)}` : '';
  const nextFirst = playerById(g.config.players[1 % g.config.players.length]);
  return `<div class="screen has-dock">
    <div class="inv" style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
      <b class="caps" style="letter-spacing:.12em">Partie terminée</b><span class="small b">${g.config.startScore} · ${OUT_LABEL[g.config.outMode]}</span></div>
    <div class="result-head">${avatarHtml(p, 88)}<div style="min-width:0"><span class="t dim">VAINQUEUR</span><span class="nm">${esc(p.name)}</span>
      ${legsTxt ? `<span class="small b">${legsTxt}</span>` : ''}</div></div>
    <div class="pad">
      <div class="sec" style="margin-top:6px">Résumé</div>
      <table class="score-table"><thead><tr><th>Joueur</th><th>Man.</th><th>Moy.</th><th>Fl.</th><th>Meil.</th><th>Fin.</th></tr></thead>
      <tbody>${rows.map(r => `<tr${r.i === w ? ' class="win"' : ''}><td><div class="pl">${avatarHtml(r.p, 28)}<span class="nm">${esc(r.p.name)}</span></div></td>
        <td>${s.legsWon[r.i]}</td><td>${avg(r.sum.average)}</td><td>${r.sum.darts}</td><td>${r.sum.best}</td><td>${int(r.sum.bestFinish)}</td></tr>`).join('')}</tbody></table>
      <p class="note">Man. = manches gagnées · Moy. = moyenne sur 3 fléchettes · Meil. = meilleure volée · Fin. = plus grosse finition.</p>
      <button type="button" class="btn ghost" style="margin-top:14px" data-act="undo-end">ANNULER LA DERNIÈRE FLÉCHETTE</button>
      ${store.maquette ? `<div class="mq-row">${maquetteButtons('mq')}</div>` : ''}
    </div>
    <div class="dock btns">
      <button type="button" class="btn primary big" data-act="rematch">REVANCHE <small>${g.config.players.length > 1 ? `${esc(nextFirst.name).toUpperCase()} COMMENCE` : 'MÊMES RÉGLAGES'}</small></button>
      <button type="button" class="btn" data-act="finish-home">ACCUEIL</button>
    </div>
  </div>`;
}

export const actions = {
  'undo-end'() { undo(); go('#/jeu', { replace: true }); },
  rematch() {
    const c = store.current.config;
    archiveCurrent(false);
    // Mêmes réglages ; le premier à lancer passe au joueur suivant.
    const players = [...c.players.slice(1), c.players[0]];
    startGame({ players, startScore: c.startScore, outMode: c.outMode, legsToWin: c.legsToWin });
    go('#/jeu', { replace: true });
  },
  'finish-home'() { archiveCurrent(false); go('#/'); },
};
