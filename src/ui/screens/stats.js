// Stats : période (7 j / 30 j / tout), carte des segments touchés (sur une cible), face-à-face (#/face/…). L'écran
// des stats d'un joueur est celui de la version 0.8.0 (screens/v2/stats2.js), qui reprend ces morceaux.
import { store, playerById } from '../store.js';
import { esc, topBar, avg, when, OUT_SHORT } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { inPeriod, faceToFace } from '../../engine/stats.js';
import { boardSvg } from '../board.js';
import { refresh, go, backFrom } from '../nav.js';
import { isDeletedId } from '../../engine/players.js';

let period = '30j';
/** Lot 7.8 : partagés avec la refonte (screens/v2/stats2.js). */
export const currentPeriod = () => period;
export const pickedBoard = () => picked.board;
let picked = { board: null };

// ------------------------------------------------------------------ cible (même dessin que le jeu, en carte de chaleur)
/** Nombre d'impacts d'une zone (« T20 », « D16 », « 5 », « 25 », « 50 »). */
export const countOf = (seg, key) => (key === '25' ? seg[25][0] : key === '50' ? seg[25][1]
  : key[0] === 'T' ? seg[Number(key.slice(1))][2] : key[0] === 'D' ? seg[Number(key.slice(1))][1] : seg[Number(key)][0]);

export function board(seg, { counts = false } = {}) {
  let max = 1;
  for (let s = 1; s <= 20; s++) max = Math.max(max, ...seg[s]);
  max = Math.max(max, seg[25][0], seg[25][1]);
  const op = c => Math.pow(c / max, 0.6); // 0 : zone jamais touchée, 1 : la plus touchée
  return boardSvg({ size: 380, heat: key => op(countOf(seg, key)), act: 'board', selected: picked.board, cls: 'board', label: 'Carte des segments touchés',
    counts: counts ? sct => seg[sct].reduce((a, b) => a + b, 0) : null });
}

// ------------------------------------------------------------------ face-à-face (lot 3)
const words = (n, one, many) => `${n} ${n > 1 ? many : one}`;
/** « 7 VICTOIRES · 3 DÉFAITES » (bilan en toutes lettres, sans s'appuyer sur la couleur). */
export const tally = (won, lost) => `${words(won, 'VICTOIRE', 'VICTOIRES')} · ${words(lost, 'DÉFAITE', 'DÉFAITES')}`;

/** Une partie commune : date, GAGNÉ / PERDU / GAGNÉE PAR …, score en manches, moyenne de chacun. */
function faceRow(r, me, op) {
  const verdict = r.result === 'won' ? '<b class="verdict won">GAGNÉ</b>'
    : r.result === 'lost' ? '<b class="verdict lost">PERDU</b>'
      : r.result === 'other' ? `<b class="verdict other">GAGNÉE PAR <span class="nm">${esc(playerById(r.winner).name)}</span></b>`
        : '<b class="verdict other">ABANDONNÉE</b>';
  return `<li><a class="frow" href="#/partie/${esc(r.id)}">
    <span class="l1"><span>${when(r.at)}</span><span>${r.config.startScore} · ${OUT_SHORT[r.config.outMode]}${r.config.players.length > 2 ? ` · ${r.config.players.length} J.` : ''}</span></span>
    <span class="l2">${verdict}<span class="legs" aria-label="Manches : ${r.legs[0]} à ${r.legs[1]}">MANCHES <b>${r.legs[0]} – ${r.legs[1]}</b></span></span>
    <span class="l3"><span class="ell">MOY. <span class="nm">${esc(me.name)}</span> <b>${avg(r.average[0])}</b></span><span class="ell"><span class="nm">${esc(op.name)}</span> <b>${avg(r.average[1])}</b></span></span>
  </a></li>`;
}

/** Face-à-face sans partie commune (lot 4) : élargir la période, ou lancer une partie entre eux. */
function faceEmpty(pid, oid, f) {
  const ever = faceToFace(store.games, pid, oid).games.length;
  const can = !isDeletedId(oid) && !isDeletedId(pid) && [pid, oid].every(id => !playerById(id).archived);
  const action = ever && period !== 'tout'
    ? '<button type="button" class="btn primary" data-act="period" data-arg="tout">VOIR DEPUIS TOUJOURS</button>'
    : can ? `<button type="button" class="btn primary" data-act="face-play" data-arg="${esc(pid)}|${esc(oid)}">JOUER UNE PARTIE ENTRE EUX</button>` : '';
  const why = ever ? 'Pas de partie terminée entre eux sur cette période.'
    : `Ils n'ont encore terminé aucune partie ensemble${f.abandoned.length ? ' (les abandonnées ne comptent pas)' : ''}.`;
  return `<div class="empty" style="padding-top:24px"><div class="big">AUCUNE PARTIE</div><p>${why}</p>${action}</div>`;
}

export function faceScreen(pid, oid) {
  const known = id => isDeletedId(id) || store.players.some(p => p.id === id);
  if (!known(pid) || !known(oid)) { go(known(pid) ? `#/stats/${pid}` : '#/stats', { replace: true }); return ''; }
  const me = playerById(pid), op = playerById(oid);
  const f = faceToFace(inPeriod(store.games, period), pid, oid);
  const seg = (v, l) => `<button type="button" data-act="period" data-arg="${v}" aria-pressed="${period === v}">${l}</button>`;
  const side = (p, cls) => `<div class="fside ${cls}">${avatarHtml(p, 64)}<span class="nm" data-shrink>${esc(p.name)}</span></div>`;
  const played = f.games.length;
  const body = played
    ? `<div class="fbilan" role="status"><span class="small dim caps">Bilan de <span class="nm">${esc(me.name)}</span></span>
        <b data-shrink>${tally(f.won, f.lost)}</b>${f.other ? `<span class="small">${words(f.other, 'partie gagnée par un autre joueur', 'parties gagnées par un autre joueur')}</span>` : ''}
        <span class="fl">MANCHES : <b>${words(f.legsWon, 'GAGNÉE', 'GAGNÉES')} · ${words(f.legsLost, 'PERDUE', 'PERDUES')}</b></span></div>
       <div class="sec">Parties communes <span class="n">${played}</span></div>
       <ul class="flist">${f.games.map(r => faceRow(r, me, op)).join('')}</ul>`
    : faceEmpty(pid, oid, f);
  const ab = f.abandoned.length
    ? `<div class="sec">Abandonnées <span class="n">${f.abandoned.length}</span></div><p class="note" style="margin:0 0 10px">Elles ne comptent pas dans le bilan.</p>
       <ul class="flist">${f.abandoned.map(r => faceRow(r, me, op)).join('')}</ul>`
    : '';
  return `<div class="screen">${topBar('Face-à-face', backFrom(`#/stats/${esc(pid)}`))}
    <div class="pad" style="padding-top:14px">
      <div class="faces">${side(me, 'fme')}<span class="vs">CONTRE</span>${side(op, 'fop')}</div>
      <div class="seg" style="margin-top:14px">${seg('7j', '7 jours')}${seg('30j', '30 jours')}${seg('tout', 'Tout')}</div>
      ${body}${ab}
    </div></div>`;
}

export const actions = {
  period(v) { period = v; picked = { board: null }; refresh(); },
  // Nouvelle partie préparée avec les deux joueurs du face-à-face (derniers réglages de départ et de sortie).
  'face-play'(arg) {
    const players = String(arg).split('|');
    const last = store.lastSetup || {};
    store.setupDraft = { startScore: last.startScore || 501, outMode: last.outMode || 'double', legsToWin: last.legsToWin || 1, players, confirm: false };
    go('#/nouvelle');
  },
  board(arg) { picked.board = picked.board === arg ? null : arg; refresh(); },
};
