// Stats joueur : 7 j / 30 j / tout ; moyenne 3 fléchettes, 9 premières, taux de finition, taux de doubles,
// meilleure finition, manche la plus courte, 100+ / 140+ / 180, victoires, face-à-face, carte des segments
// touchés (sur une cible), évolution de la moyenne. Tout est recalculé depuis les fléchettes.
import { store, playerById } from '../store.js';
import { esc, ico, topBar, avg, pct, int, shortDate, plural, when, OUT_SHORT } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { playerStats, inPeriod, faceToFace } from '../../engine/stats.js';
import { boardSvg } from '../board.js';
import { refresh } from '../nav.js';

let period = '30j';
let picked = { board: null, point: null };

// ------------------------------------------------------------------ cible (même dessin que le jeu, en carte de chaleur)
/** Nombre d'impacts d'une zone (« T20 », « D16 », « 5 », « 25 », « 50 »). */
const countOf = (seg, key) => (key === '25' ? seg[25][0] : key === '50' ? seg[25][1]
  : key[0] === 'T' ? seg[Number(key.slice(1))][2] : key[0] === 'D' ? seg[Number(key.slice(1))][1] : seg[Number(key)][0]);

function board(seg) {
  let max = 1;
  for (let s = 1; s <= 20; s++) max = Math.max(max, ...seg[s]);
  max = Math.max(max, seg[25][0], seg[25][1]);
  const op = c => Math.pow(c / max, 0.6); // 0 : zone jamais touchée, 1 : la plus touchée
  return boardSvg({ size: 380, heat: key => op(countOf(seg, key)), act: 'board', selected: picked.board, cls: 'board', label: 'Carte des segments touchés' });
}

// ------------------------------------------------------------------ évolution de la moyenne
function chart(timeline, mean) {
  if (timeline.length < 2) return '<p class="note">Il faut au moins deux parties sur la période pour tracer l\'évolution.</p>';
  const W = 360, H = 170, L = 34, Rt = 40, T = 14, B = 26;
  const vals = timeline.map(t => t.average);
  const lo = Math.floor((Math.min(...vals) - 4) / 10) * 10, hi = Math.ceil((Math.max(...vals) + 4) / 10) * 10;
  const t0 = timeline[0].at, t1 = timeline[timeline.length - 1].at;
  const x = at => L + ((at - t0) / Math.max(1, t1 - t0)) * (W - L - Rt);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const grid = [];
  for (let v = lo; v <= hi; v += (hi - lo) > 40 ? 20 : 10) grid.push(`<line class="ax" x1="${L}" x2="${W - Rt}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`);
  const line = timeline.map(t => `${x(t.at).toFixed(1)},${y(t.average).toFixed(1)}`).join(' ');
  const sel = picked.point;
  const pts = timeline.map((t, i) => `<rect class="pt" x="${(x(t.at) - 4).toFixed(1)}" y="${(y(t.average) - 4).toFixed(1)}" width="8" height="8"${i === sel ? ' style="fill:var(--fg)"' : ''}/>
    <rect x="${(x(t.at) - 14).toFixed(1)}" y="${T}" width="28" height="${H - T - B}" fill="transparent" data-act="point" data-arg="${i}"/>`).join('');
  const last = timeline[timeline.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Moyenne par partie">
    ${grid.join('')}
    <line class="mean" x1="${L}" x2="${W - Rt}" y1="${y(mean)}" y2="${y(mean)}"/><text x="${L + 4}" y="${y(mean) - 5}">moy. ${avg(mean)}</text>
    <polyline class="ln" points="${line}"/>${pts}
    <text x="${x(last.at) + 8}" y="${y(last.average) - 8}" style="fill:var(--fg);font-weight:700">${avg(last.average)}</text>
    <text x="${L}" y="${H - 6}">${shortDate(t0)}</text><text x="${W - Rt}" y="${H - 6}" text-anchor="end">${shortDate(t1)}</text>
  </svg>`;
}

// ------------------------------------------------------------------ écran
export function statsScreen(id) {
  const players = store.players.filter(p => !p.archived || store.games.some(g => g.config.players.includes(p.id)));
  if (!players.length) {
    return `<div class="screen">${topBar('Stats', '#/')}<div class="empty"><div class="big">AUCUN JOUEUR</div>
      <p>Les statistiques apparaissent dès qu'un joueur a joué une partie.</p><a class="btn primary" href="#/joueur/nouveau">NOUVEAU JOUEUR</a></div></div>`;
  }
  const pid = id && players.some(p => p.id === id) ? id : players[0].id;
  const p = playerById(pid);
  const games = inPeriod(store.games, period);
  const st = playerStats(games, pid);
  const seg = (v, l) => `<button type="button" data-act="period" data-arg="${v}" aria-pressed="${period === v}">${l}</button>`;
  const chips = `<div class="chips">${players.map(q => `<a class="btn chip" href="#/stats/${esc(q.id)}" aria-pressed="${q.id === pid}">${avatarHtml(q, 38)}<span class="nm">${esc(q.name.split(' ')[0])}</span></a>`).join('')}</div>`;
  const head = `${chips}<div class="pad" style="margin-top:10px"><div class="seg">${seg('7j', '7 jours')}${seg('30j', '30 jours')}${seg('tout', 'Tout')}</div></div>`;

  if (!st.played) {
    return `<div class="screen">${topBar('Stats', '#/')}${head}
      <div class="empty"><div class="big">AUCUNE PARTIE</div><p><span class="nm">${esc(p.name)}</span> n'a pas joué sur cette période.</p></div></div>`;
  }

  // Face-à-face : bilan en toutes lettres, un appui ouvre le détail (lot 3)
  const h2h = Object.entries(st.headToHead).sort((a, b) => b[1].played - a[1].played).map(([oid, h]) => {
    const o = playerById(oid);
    return `<li><a class="h2h-row" href="#/face/${esc(pid)}/${esc(oid)}">${avatarHtml(o, 32)}<span class="nm ell b">${esc(o.name)}</span>
      <span class="sc">${tally(h.won, h.lost)}</span>${ico('chev')}</a></li>`;
  }).join('');

  let readBoard = 'Touchez une case de la cible pour lire le nombre d\'impacts.';
  if (picked.board) readBoard = `<b>${picked.board}</b> : ${plural(countOf(st.segments, picked.board), 'impact', 'impacts')}`;
  const tl = st.timeline;
  let readPoint = 'Touchez un point pour lire la moyenne de la partie.';
  if (picked.point !== null && tl[picked.point]) readPoint = `<b>${shortDate(tl[picked.point].at)}</b> : moyenne ${avg(tl[picked.point].average)}`;

  return `<div class="screen">${topBar('Stats', '#/')}${head}
    <div class="pad">
      <div class="sec"><span class="nm">${esc(p.name)}</span> <span class="n">${plural(st.played, 'partie', 'parties')}</span></div>
      <div class="kpis">
        <div class="kpi hero wide" data-k="average"><small>Moyenne sur 3 fléchettes</small><b>${avg(st.average)}</b></div>
        <div class="kpi" data-k="first9"><small>9 premières</small><b>${avg(st.first9)}</b></div>
        <div class="kpi" data-k="won"><small>Victoires</small><b>${st.won}<small> / ${st.played}</small></b></div>
        <div class="kpi" data-k="checkout"><small>Taux de finition</small><b>${pct(st.checkoutRate)}</b></div>
        <div class="kpi" data-k="double"><small>Taux de doubles</small><b>${pct(st.doubleRate)}</b></div>
        <div class="kpi" data-k="bestFinish"><small>Meilleure finition</small><b>${int(st.bestFinish)}</b></div>
        <div class="kpi" data-k="shortest"><small>Manche la + courte</small><b>${st.shortestLeg ?? '—'}${st.shortestLeg ? '<small> fl.</small>' : ''}</b></div>
        <div class="kpi wide tons"><div data-k="ton"><small>100+</small><b>${st.ton}</b></div><div data-k="ton40"><small>140+</small><b>${st.ton40}</b></div><div data-k="max"><small>180</small><b>${st.max}</b></div></div>
      </div>
      <p class="note">Finition : volées gagnées quand la finition était jouable. Doubles : fléchettes qui ont fini quand une seule pouvait finir.</p>
      ${h2h ? `<div class="sec">Face-à-face</div><ul class="h2h">${h2h}</ul><p class="note">Touchez un adversaire pour le détail partie par partie.</p>` : ''}
      <div class="sec">Segments touchés <span class="n">${st.segments.total} fl.</span></div>
      ${board(st.segments)}
      <div class="legend"><span>peu</span><i style="--k:8%"></i><i style="--k:35%"></i><i style="--k:65%"></i><i></i><span>souvent</span> · à côté : ${st.segments.miss}</div>
      <p class="note center">${readBoard}</p>
      <div class="sec">Évolution de la moyenne</div>
      ${chart(tl, st.average)}
      <p class="note center">${readPoint}</p>
    </div></div>`;
}

// ------------------------------------------------------------------ face-à-face (lot 3)
const words = (n, one, many) => `${n} ${n > 1 ? many : one}`;
/** « 7 VICTOIRES · 3 DÉFAITES » (bilan en toutes lettres, sans s'appuyer sur la couleur). */
const tally = (won, lost) => `${words(won, 'VICTOIRE', 'VICTOIRES')} · ${words(lost, 'DÉFAITE', 'DÉFAITES')}`;

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

export function faceScreen(pid, oid) {
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
    : `<div class="empty" style="padding-top:24px"><div class="big">AUCUNE PARTIE</div><p>Pas de partie terminée entre eux sur cette période.</p></div>`;
  const ab = f.abandoned.length
    ? `<div class="sec">Abandonnées <span class="n">${f.abandoned.length}</span></div><p class="note" style="margin:0 0 10px">Elles ne comptent pas dans le bilan.</p>
       <ul class="flist">${f.abandoned.map(r => faceRow(r, me, op)).join('')}</ul>`
    : '';
  return `<div class="screen">${topBar('Face-à-face', `#/stats/${esc(pid)}`)}
    <div class="pad" style="padding-top:14px">
      <div class="faces">${side(me, 'fme')}<span class="vs">CONTRE</span>${side(op, 'fop')}</div>
      <div class="seg" style="margin-top:14px">${seg('7j', '7 jours')}${seg('30j', '30 jours')}${seg('tout', 'Tout')}</div>
      ${body}${ab}
    </div></div>`;
}

export const actions = {
  period(v) { period = v; picked = { board: null, point: null }; refresh(); },
  board(arg) { picked.board = picked.board === arg ? null : arg; refresh(); },
  point(i) { picked.point = picked.point === Number(i) ? null : Number(i); refresh(); },
};
