// Fin de manche (vainqueur, fléchettes, moyenne, meilleure volée ; MANCHE SUIVANTE) et
// fin de partie (vainqueur, résumé par joueur ; REVANCHE, ACCUEIL). ANNULER reste possible depuis les deux.
// Les deux montrent la cible : volée de la finition numérotée, volées précédentes du vainqueur dans la manche en discret.
// La fin de manche sert de validation de la volée gagnante (pas de VALIDER en jeu pour une finition) : MANCHE SUIVANTE
// l'enregistre (`validated`), une reprise avant cela revient sur cet écran.
import { store, currentState, playerById, archiveCurrent, startGame, saveCurrent } from '../store.js';
import { esc, avg, int, OUT_LABEL, maquetteButtons } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { formatDart } from '../../engine/darts.js';
import { playerSummary } from '../../engine/stats.js';
import { boardSvg, impactsFor, markIcon } from '../board.js';
import { go } from '../nav.js';
import { undo, celebrationHtml, placeLabel } from './game.js';
import { standings, lastPlaces } from '../../engine/ranking.js';

const route = v => v.darts.map(d => formatDart(d).replace(/^S/, '')).join(' · ');

export function legEnd() {
  const g = store.current;
  if (!g) { go('#/', { replace: true }); return ''; }
  const s = currentState();
  if (s.status === 'finished') { go('#/fin', { replace: true }); return ''; }
  const leg = [...s.legs].reverse().find(l => l.winner !== null);
  // Seulement juste après une finition (sinon MANCHE SUIVANTE validerait une volée en attente).
  if (!leg || s.lastEvent !== 'leg_won') { go('#/jeu', { replace: true }); return ''; }
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
    ${finishBoard(g, s, fin, p)}
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
    <div class="dock" data-layer><button type="button" class="btn primary big" data-act="next-leg">MANCHE SUIVANTE</button></div>
    ${celebrationHtml()}
  </div>`;
}

export function matchEnd() {
  const g = store.current;
  if (!g) { go('#/', { replace: true }); return ''; }
  const s = currentState();
  if (s.status !== 'finished') { go('#/jeu', { replace: true }); return ''; }
  const w = s.winner;
  const p = playerById(g.config.players[w]);
  // Lot 7 : résumé dans l'ordre du classement (place en première colonne) et le dernier, qui paie sa tournée.
  const ranked = standings(s);
  const rows = ranked.map(r => ({ i: r.player, place: r.place, p: playerById(g.config.players[r.player]), sum: playerSummary(s, r.player) }));
  const multi = g.config.players.length > 1;
  const payers = lastPlaces(s).map(i => playerById(g.config.players[i]));
  const winVisit = [...s.visits].reverse().find(v => v.finish && v.player === w);
  const legsTxt = g.config.legsToWin > 1 ? `${s.legsWon[w]} MANCHES À ${Math.max(...s.legsWon.filter((_, i) => i !== w), 0)}` : '';
  const nextFirst = playerById(g.config.players[1 % g.config.players.length]);
  return `<div class="screen has-dock">
    <div class="inv" style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
      <b class="caps" style="letter-spacing:.12em">Partie terminée</b><span class="small b">${g.config.startScore} · ${OUT_LABEL[g.config.outMode]}</span></div>
    <div class="result-head">${avatarHtml(p, 88)}<div style="min-width:0"><span class="t dim">VAINQUEUR</span><span class="nm">${esc(p.name)}</span>
      ${legsTxt ? `<span class="small b">${legsTxt}</span>` : ''}</div></div>
    ${payers.length ? tourneeHtml(payers) : ''}
    ${finishBoard(g, s, winVisit, p)}
    <div class="pad">
      <div class="sec" style="margin-top:6px">${multi ? 'Classement' : 'Résumé'}</div>
      <table class="score-table rank-table"><thead><tr><th>${multi ? 'Place · joueur' : 'Joueur'}</th><th>Man.</th><th>Moy.</th><th>Fl.</th><th>Meil.</th><th>Fin.</th></tr></thead>
      <tbody>${rows.map(r => `<tr${r.i === w ? ' class="win"' : ''}><td><div class="pl">${multi ? `<b class="plc">${placeLabel(r.place)}</b>` : avatarHtml(r.p, 28)}<span class="nm">${esc(r.p.name)}</span></div></td>
        <td>${s.legsWon[r.i]}</td><td>${avg(r.sum.average)}</td><td>${r.sum.darts}</td><td>${r.sum.best}</td><td>${int(r.sum.bestFinish)}</td></tr>`).join('')}</tbody></table>
      <p class="note">Man. = manches gagnées · Moy. = moyenne sur 3 fléchettes · Meil. = meilleure volée · Fin. = plus grosse finition.</p>
      <button type="button" class="btn ghost" style="margin-top:14px" data-act="undo-end">ANNULER LA DERNIÈRE FLÉCHETTE</button>
      ${store.maquette ? `<div class="mq-row">${maquetteButtons('mq')}</div>` : ''}
    </div>
    <div class="dock btns" data-layer>
      <button type="button" class="btn primary big" data-act="rematch">REVANCHE <small>${g.config.players.length > 1 ? `${esc(nextFirst.name).toUpperCase()} COMMENCE` : 'MÊMES RÉGLAGES'}</small></button>
      <button type="button" class="btn" data-act="finish-home">ACCUEIL</button>
    </div>
    ${celebrationHtml()}
  </div>`;
}

/** Le dernier paie sa tournée (lot 7) ; à égalité, ils la partagent. */
function tourneeHtml(payers) {
  const one = payers.length === 1;
  return `<div class="tournee inv" role="note">
    <span class="t">${one ? 'LE DERNIER PAIE SA TOURNÉE' : 'DERNIERS À ÉGALITÉ : ILS PARTAGENT LA TOURNÉE'}</span>
    <div class="who">${payers.map(q => `<span class="pl">${avatarHtml(q, 40)}<b class="nm">${esc(q.name)}</b></span>`).join('')}</div>
  </div>`;
}

/** Cible de la finition : la volée gagnante numérotée, les volées précédentes du vainqueur dans la manche. */
function finishBoard(g, s, fin, p) {
  const idx = s.visits.indexOf(fin);
  if (idx < 0) return '';
  return `<div class="pad"><div class="sec">Cible · manche ${fin.leg}</div>
    <div class="fin-board">${boardSvg({ size: 200, impacts: impactsFor(g, s, idx), label: 'Impacts du vainqueur' })}
      <p class="note"><span class="nm">${esc(p.name)}</span><br>${markIcon(true)}volée de la finition<br>${markIcon(false)}ses volées précédentes</p></div></div>`;
}

export const actions = {
  'undo-end'() { undo(); go('#/jeu', { replace: true }); },
  'next-leg'() {
    // La fin de manche est validée (enregistrée : une reprise ne la remontre pas) ; annonce du premier lanceur de la
    // nouvelle manche, comme après une validation.
    const g = store.current;
    if (!g) { go('#/', { replace: true }); return; }
    if (currentState().lastEvent === 'leg_won') { g.validated = g.darts.length; saveCurrent(); }
    if (g.config.players.length > 1) { g.ui.announce = currentState().currentPlayer; g.ui.frozen = false; }
    go('#/jeu', { replace: true });
  },
  rematch() {
    if (!store.current) { go('#/', { replace: true }); return; }
    const c = store.current.config;
    archiveCurrent(false);
    // Mêmes réglages ; le premier à lancer passe au joueur suivant.
    const players = [...c.players.slice(1), c.players[0]];
    startGame({ players, startScore: c.startScore, outMode: c.outMode, legsToWin: c.legsToWin, playOn: !!c.playOn });
    go('#/jeu', { replace: true });
  },
  'finish-home'() { archiveCurrent(false); go('#/'); },
};
