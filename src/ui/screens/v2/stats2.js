// Lot 7.8 (dans l'appli depuis la 0.8.0) : refonte des Stats et classement global des joueurs.
// - Stats d'un joueur : chiffres regroupés (Score, Finition, Volées, Résultats), explications derrière une icône (i),
//   courbe de n'importe quel chiffre partie par partie (une partie = un point, jours séparés, zoom ×1 à ×8 et
//   défilement horizontal), meilleures volées et pire volée de chaque partie repliées.
// - Classement (#/classement) : palmarès (le meilleur et le pire de chaque chiffre) et classement complet par chiffre.
// Tout est recalculé depuis les fléchettes (engine/stats.js), comme les Stats actuelles.
import { store, playerById } from '../../store.js';
import { esc, ico, topBar, avg, pct, int, plural, when, OUT_SHORT } from '../../dom.js';
import { avatarHtml } from '../../avatars.js';
import { playerStats, inPeriod, gameState } from '../../../engine/stats.js';
import { unitsOf, drinkTally, tallyText, averageByDrinks } from '../../../engine/alcohol.js';
import { refresh, backFrom } from '../../nav.js';
import { board, countOf, tally, currentPeriod, pickedBoard } from '../stats.js';

const dec1 = v => (v === null || v === undefined || Number.isNaN(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const DAYS = ['DIM.', 'LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.'];

/**
 * Chiffres : `game` (valeur d'une partie, pour la courbe ; absent = pas de courbe), `all` (sur la période, pour le
 * classement), `fmt`, `dir` (1 : plus haut = mieux ; 0 : ni mieux ni pire, les verres), `info` (explication).
 */
export const METRICS = Object.freeze([
  { k: 'average', label: 'Moyenne', fmt: avg, dir: 1, game: s => s.average, all: s => s.average,
    info: 'Moyenne sur 3 fléchettes : points marqués ÷ fléchettes lancées × 3. Un bust compte 0.' },
  { k: 'first9', label: '9 premières', fmt: avg, dir: 1, game: s => s.first9, all: s => s.first9,
    info: 'Même calcul, sur les 3 premières volées de chaque manche : le niveau quand la cible est grande ouverte.' },
  { k: 'winRate', label: 'Victoires', fmt: pct, dir: 1, all: s => (s.played ? s.won / s.played : null),
    info: 'Parties gagnées ÷ parties jouées (abandonnées comprises).' },
  { k: 'bestVisit', label: 'Meilleure volée', fmt: int, dir: 1, game: s => s.bestVisit, all: s => s.bestVisit,
    info: 'Plus grand total d\'une volée.' },
  { k: 'worstVisit', label: 'Pire volée', fmt: int, dir: 1, game: s => s.worstVisit,
    all: s => (s.perGame.length ? s.perGame.reduce((n, r) => n + r.worst, 0) / s.perGame.length : null), allFmt: dec1, unit: 'moy. par partie',
    info: 'Plus petit total d\'une volée, sans les bust (un bust n\'est pas une volée à 0) ni les volées de finition. Au classement : moyenne de la pire volée de chaque partie.' },
  { k: 'tripleRate', label: 'Triples', fmt: pct, dir: 1, pct: true, game: s => s.tripleRate, all: s => s.tripleRate,
    info: 'Fléchettes tombées dans un triple ÷ fléchettes lancées.' },
  { k: 'doubleRate', label: 'Doubles', fmt: pct, dir: 1, pct: true, game: s => s.doubleRate, all: s => s.doubleRate,
    info: 'Fléchettes qui ont fini la manche ÷ fléchettes lancées quand une seule pouvait finir.' },
  { k: 'tons', label: '100+', fmt: dec1, dir: 1, game: s => s.ton + s.ton40 + s.max, all: s => (s.played ? (s.ton + s.ton40 + s.max) / s.played : null),
    gameFmt: int, unit: '/ partie', info: 'Volées de 100 et plus (180 compris). Au classement : par partie jouée.' },
  { k: 'busts', label: 'Bust', fmt: dec1, dir: -1, game: s => s.busts, gameFmt: int, all: s => (s.played ? s.busts / s.played : null), unit: '/ partie',
    info: 'Volées en bust (le reste repasse au-dessus de zéro, ou à 1 en sortie double). Moins il y en a, mieux c\'est. Au classement : par partie jouée.' },
  { k: 'max', label: '180', fmt: int, dir: 1, all: s => s.max, info: 'Nombre de 180 sur la période.' },
  { k: 'bestFinish', label: 'Meilleure finition', fmt: int, dir: 1, all: s => s.bestFinish, info: 'Plus grand reste fini en une volée.' },
  { k: 'drinks', label: 'Verres', fmt: dec1, dir: 0, game: (s, g, id) => unitsOf(g.drinks && g.drinks[id]),
    all: (s, games, id) => (s.played ? games.reduce((n, g) => n + unitsOf(g.drinks && g.drinks[id]), 0) / s.played : null),
    gameFmt: int, unit: '/ partie', info: 'Verres notés pendant les parties, en verres de 25 cl (une pinte de 50 cl compte pour 2). Au classement : par partie jouée. Ni mieux ni pire.' },
]);
const metric = k => METRICS.find(m => m.k === k) || METRICS[0];

// ------------------------------------------------------------------ état de l'écran
const ui = {
  info: new Set(),     // explications ouvertes (clés)
  folds: new Set(),    // sections dépliées
  metric: 'average',   // chiffre de la courbe
  zoom: 1,             // ×1, ×2, ×4, ×8
  point: null,         // partie touchée sur la courbe (identifiant)
  rank: 'average',     // chiffre du classement complet
  compare: null,       // lot 9 : joueur comparé sur la courbe (identifiant), ou null
};
/** Sommaire de maquette : état préparé. */
export function presetStats2(state = {}) {
  Object.assign(ui, { info: new Set(), folds: new Set(), metric: 'average', zoom: 1, point: null, rank: 'average', compare: null }, state);
  if (state.info) ui.info = new Set(state.info);
  if (state.folds) ui.folds = new Set(state.folds);
}

const infoBtn = key => `<button type="button" class="ibtn" data-act="v2-info" data-arg="${key}" aria-pressed="${ui.info.has(key)}" aria-label="Explication">${ico('info')}</button>`;
const infoBox = (key, html) => (ui.info.has(key) ? `<p class="infobox" role="note">${html}</p>` : '');
const sec = (title, key, extra = '') => `<div class="sec">${title}${extra}${key ? infoBtn(key) : ''}</div>`;

function fold(key, title, count, body) {
  const open = ui.folds.has(key);
  return `<button type="button" class="fold" data-act="v2-fold" data-arg="${key}" aria-expanded="${open}">
      <span>${title}</span><span class="n">${count}</span>${ico(open ? 'up' : 'down')}</button>
    ${open ? `<div class="fold-body">${body}</div>` : ''}`;
}

const tabs = active => `<div class="pad tabs2"><div class="seg">
    <a href="#/stats" role="button" aria-pressed="${active === 'joueur'}">Joueur</a>
    <a href="#/classement" role="button" aria-pressed="${active === 'classement'}">${ico('trophy')} Classement</a></div></div>`;

const periodSeg = () => {
  const p = currentPeriod();
  const b = (v, l) => `<button type="button" data-act="period" data-arg="${v}" aria-pressed="${p === v}">${l}</button>`;
  return `<div class="seg">${b('7j', '7 jours')}${b('30j', '30 jours')}${b('tout', 'Tout')}</div>`;
};

// ------------------------------------------------------------------ courbe
/** Parties du joueur sur la période (de la plus ancienne à la plus récente), avec la valeur du chiffre `m`. */
function series(games, pid, m, cmp = null) {
  // Lot 9 : avec un joueur comparé, les parties de l'un ou de l'autre ; v (joueur) et v2 (comparé), null s'il n'y a pas joué.
  const val = (g, id) => (g.config.players.includes(id) ? m.game(playerStats([g], id), g, id) : null);
  return games.filter(g => g.config.players.includes(pid) || (cmp && g.config.players.includes(cmp))).sort((a, b) => a.startedAt - b.startedAt)
    .map(g => ({ g, v: val(g, pid), v2: cmp ? val(g, cmp) : null }));
}

const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const hhmm = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function chart(pts, m, pid) {
  const vals = pts.filter(p => p.v !== null && p.v !== undefined);
  if (vals.length < 2) return '<p class="note">Il faut au moins deux parties avec ce chiffre sur la période pour tracer la courbe.</p>';
  const scale = v => (m.pct ? v * 100 : v);
  const H = 196, T = 26, B = 22, VIEW = 326; // VIEW : largeur visible (px CSS) de la zone de tracé
  const n = pts.length;
  const base = Math.max(8, (VIEW - 24) / Math.max(1, n - 1));
  const step = base * ui.zoom;
  const W = Math.max(VIEW, 12 + (n - 1) * step + 12);
  const xs = i => 12 + i * step;
  const ys = vals.map(p => scale(p.v));
  const ys2 = pts.filter(p => p.v2 !== null && p.v2 !== undefined).map(p => scale(p.v2));
  let lo = Math.min(...ys, ...ys2), hi = Math.max(...ys, ...ys2);
  if (m.pct) { lo = 0; hi = 100; } else {
    const pad = Math.max(2, (hi - lo) * 0.12);
    lo = Math.max(0, Math.floor((lo - pad) / 5) * 5); hi = Math.ceil((hi + pad) / 5) * 5;
    if (hi === lo) hi = lo + 5;
  }
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [];
  const span = hi - lo, stepT = span > 120 ? 50 : span > 60 ? 20 : span > 25 ? 10 : 5;
  for (let v = Math.ceil(lo / stepT) * stepT; v <= hi; v += stepT) ticks.push(v);
  // Jours : séparateur et date au début de chaque journée (si la place le permet).
  const days = [];
  pts.forEach((p, i) => {
    const k = dayKey(p.g.startedAt);
    if (!days.length || days[days.length - 1].k !== k) days.push({ k, i0: i, i1: i, at: p.g.startedAt });
    else days[days.length - 1].i1 = i;
  });
  const dayMarks = days.map((d, j) => {
    const x0 = j ? (xs(d.i0) + xs(days[j - 1].i1)) / 2 : 0;
    const x1 = j < days.length - 1 ? (xs(d.i1) + xs(days[j + 1].i0)) / 2 : W;
    const dt = new Date(d.at);
    const count = d.i1 - d.i0 + 1;
    // Largeur d'un caractère de Martian Mono à 10 px ≈ 6,6 px (+ espacement) : on prend l'étiquette la plus longue qui tient.
    const fits = t => t.length * 7 + 8 <= x1 - x0;
    const dd = `${dt.getDate()}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const label = [`${DAYS[dt.getDay()]} ${dd} ·${count}`, `${DAYS[dt.getDay()]} ${dd}`, dd, `${dt.getDate()}`].find(fits) || '';
    return `${j ? `<line class="day" x1="${x0.toFixed(1)}" x2="${x0.toFixed(1)}" y1="${T - 18}" y2="${H - B}"/>` : ''}
      ${j % 2 ? `<rect class="dayband" x="${x0.toFixed(1)}" y="${T - 18}" width="${(x1 - x0).toFixed(1)}" height="${H - B - T + 18}"/>` : ''}
      ${label ? `<text class="dl" x="${((x0 + x1) / 2).toFixed(1)}" y="${T - 7}" text-anchor="middle">${label}</text>` : ''}`;
  }).join('');
  const meanV = ys.reduce((a, b) => a + b, 0) / ys.length;
  const line = pts.map((p, i) => (p.v === null || p.v === undefined ? null : `${xs(i).toFixed(1)},${y(scale(p.v)).toFixed(1)}`)).filter(Boolean).join(' ');
  const sel = ui.point;
  // Version 0.8.1 : la valeur écrite à côté des points (demande de Guillaume) ; quand les points sont serrés, un sur
  // `every` (le dernier et celui touché toujours) — zoomer les montre tous.
  const every = Math.max(1, Math.ceil(30 / step));
  const has = v => v !== null && v !== undefined;
  const line2 = pts.map((p, i) => (has(p.v2) ? `${xs(i).toFixed(1)},${y(scale(p.v2)).toFixed(1)}` : null)).filter(Boolean).join(' ');
  const dots = pts.map((p, i) => {
    if (!has(p.v) && !has(p.v2)) return '';
    const on = p.g.id === sel;
    const cx = xs(i);
    const r = ui.zoom >= 4 ? 4.5 : 3.5;
    const hit = Math.max(14, Math.min(40, step));
    const label = i % every === 0 || i === n - 1 || on;
    let out = '';
    if (has(p.v)) {
      const cy = y(scale(p.v));
      out += `<rect class="pt${on ? ' on' : ''}" x="${(cx - r).toFixed(1)}" y="${(cy - r).toFixed(1)}" width="${2 * r}" height="${2 * r}"/>
      ${label ? `<text class="pv${on ? ' on' : ''}" x="${cx.toFixed(1)}" y="${(cy - 8).toFixed(1)}" text-anchor="middle">${(m.gameFmt || m.fmt)(p.v)}</text>` : ''}`;
    }
    // Lot 9 : joueur comparé — carré creux, valeur sous le point.
    if (has(p.v2)) {
      const cy = y(scale(p.v2));
      out += `<rect class="pt2" x="${(cx - r + 0.75).toFixed(1)}" y="${(cy - r + 0.75).toFixed(1)}" width="${2 * r - 1.5}" height="${2 * r - 1.5}"/>
      ${label ? `<text class="pv2" x="${cx.toFixed(1)}" y="${(cy + 15).toFixed(1)}" text-anchor="middle">${(m.gameFmt || m.fmt)(p.v2)}</text>` : ''}`;
    }
    return `${out}<rect x="${(cx - hit / 2).toFixed(1)}" y="${T - 18}" width="${hit.toFixed(1)}" height="${H - T + 18}" fill="transparent" data-act="v2-point" data-arg="${esc(p.g.id)}"/>`;
  }).join('');
  const axis = `<svg class="chart2 axis" viewBox="0 0 34 ${H}" width="34" height="${H}" aria-hidden="true">
    ${ticks.map(v => `<text x="30" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${v}${m.pct ? '' : ''}</text>`).join('')}
    ${m.pct ? `<text x="30" y="${T - 7}" text-anchor="end">%</text>` : ''}</svg>`;
  const plot = `<svg class="chart2" viewBox="0 0 ${W.toFixed(0)} ${H}" width="${W.toFixed(0)}" height="${H}" role="img" aria-label="${esc(m.label)} partie par partie">
    ${dayMarks}
    ${ticks.map(v => `<line class="ax" x1="0" x2="${W.toFixed(0)}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`).join('')}
    <line class="mean" x1="0" x2="${W.toFixed(0)}" y1="${y(meanV).toFixed(1)}" y2="${y(meanV).toFixed(1)}"/>
    ${line2 ? `<polyline class="ln2" points="${line2}"/>` : ''}<polyline class="ln" points="${line}"/>${dots}
  </svg>`;
  return `<div class="chartbox">${axis}<div class="chscroll" data-hscroll="${esc(`courbe:${pid}`)}">${plot}</div></div>
    <div class="chlegend"><span><i class="lg-ln"></i> ${ui.compare ? `<span class="nm">${esc(playerById(pid).name)}</span>` : 'partie par partie'}</span>${ui.compare ? `<span><i class="lg-ln2"></i> <span class="nm">${esc(playerById(ui.compare).name)}</span></span>` : ''}<span><i class="lg-mean"></i> moyenne ${m.pct ? `${Math.round(meanV)} %` : dec1(meanV)}</span><span>${plural(n, 'partie', 'parties')} · ${plural(days.length, 'jour', 'jours')}</span></div>`;
}

function chartBlock(games, pid) {
  const m = metric(ui.metric);
  // Lot 9 : comparer avec un autre joueur (deux courbes sur le même graphique).
  const others = [...new Set(games.flatMap(g => g.config.players))].filter(id => id !== pid && store.players.some(p => p.id === id && !p.archived));
  if (ui.compare === pid || (ui.compare && !others.includes(ui.compare))) ui.compare = null;
  const pts = series(games, pid, m, ui.compare);
  const chip = x => `<button type="button" class="chip2" data-act="v2-metric" data-arg="${x.k}" aria-pressed="${x.k === m.k}">${esc(x.label)}</button>`;
  const z = ui.zoom;
  const zoom = `<div class="zoom" role="group" aria-label="Zoom">
      <button type="button" data-act="v2-zoom" data-arg="out" ${z <= 1 ? 'disabled' : ''} aria-label="Dézoomer">${ico('zoomout')}</button>
      <b>×${z}</b>
      <button type="button" data-act="v2-zoom" data-arg="in" ${z >= 8 ? 'disabled' : ''} aria-label="Zoomer">${ico('zoomin')}</button></div>`;
  const picked = pts.find(p => p.g.id === ui.point);
  const read = picked
    ? `<a class="chread" href="#/partie/${esc(picked.g.id)}"><span><b>${when(picked.g.startedAt)}</b><small>${picked.g.config.startScore} · ${OUT_SHORT[picked.g.config.outMode]} · ${plural(picked.g.config.players.length, 'joueur', 'joueurs')}</small></span>
        <span>${esc(m.label)} <b>${(m.gameFmt || m.fmt)(picked.v)}</b></span>${ico('chev')}</a>`
    : '<p class="note center">Touchez un point pour lire la partie (heure, chiffre) et l\'ouvrir.</p>';
  return `${sec('Courbe', 'courbe')}
    ${infoBox('courbe', 'Chaque point est une partie, dans l\'ordre où elles ont été jouées : plusieurs parties du même soir ne s\'entassent plus. Les jours sont séparés par un filet et une bande grisée. La valeur est écrite au-dessus des points ; quand ils sont serrés, un sur deux ou trois : zoomez (×2 à ×8) pour les voir tous, puis faites glisser la courbe du doigt.')}
    <div class="chips2">${METRICS.filter(x => x.game).map(chip).join('')}</div>
    <div class="chtools"><span class="small dim caps">${esc(m.label)}${m.pct ? ' (%)' : ''}</span>${zoom}</div>
    ${chart(pts, m, pid)}
    ${others.length ? `<div class="cmp"><span class="small dim caps">Comparer avec</span><div class="chips2">
      <button type="button" class="chip2" data-act="v2-compare" data-arg="" aria-pressed="${!ui.compare}">PERSONNE</button>
      ${others.map(id => { const q = playerById(id); return `<button type="button" class="chip2 pc" data-act="v2-compare" data-arg="${esc(id)}" aria-pressed="${ui.compare === id}">${avatarHtml(q, 20)}<span class="nm">${esc(q.name)}</span></button>`; }).join('')}</div></div>` : ''}
    ${read}`;
}

// ------------------------------------------------------------------ lot 9 : la moyenne au fil des verres
/** Barres : moyenne du joueur selon le nombre de verres déjà bus quand il lance (0, 1, 2, 3, 4, 5 et +). */
export function drinksLevelsHtml(lv) {
  const shown = lv.levels.filter(L => L.darts);
  const max = Math.max(1, ...shown.map(L => L.average));
  const sober = lv.sober;
  return `<ul class="dlev">${lv.levels.map(L => {
    if (!L.darts) return `<li class="none"><span class="lb">${esc(L.label)}</span><span class="bar"></span><b>—</b></li>`;
    const d = sober !== null && L.level > 0 && L.darts >= 9 ? L.average - sober : null;
    return `<li class="${L.level === lv.best ? 'best' : ''}${L.darts < 9 ? ' few' : ''}"><span class="lb">${esc(L.label)}</span>
      <span class="bar"><i style="width:${Math.round((L.average / max) * 100)}%"></i></span><b>${dec1(L.average)}</b>
      <small>${d === null ? `${L.visits} vol.` : `${d >= 0 ? '+' : '−'}${dec1(Math.abs(d))}`}</small></li>`;
  }).join('')}</ul>`;
}
/** Phrase du meilleur niveau et de l'écart après 4 verres et plus (rien si trop peu de volées). */
export function drinksLevelsLine(lv) {
  const parts = [];
  if (lv.best !== null) parts.push(`Meilleur niveau : <b>${esc(lv.levels[lv.best].label)}</b> (${dec1(lv.levels[lv.best].average)})`);
  const heavy = lv.levels.slice(4).reduce((a, L) => ({ darts: a.darts + L.darts, points: a.points + L.points }), { darts: 0, points: 0 });
  if (lv.sober !== null && heavy.darts >= 9) {
    const d = (heavy.points / heavy.darts) * 3 - lv.sober;
    parts.push(`à partir de 4 verres : <b>${d >= 0 ? '+' : '−'}${dec1(Math.abs(d))} points</b> par rapport à jeun`);
  }
  return parts.length ? `<p class="note">${parts.join(' ; ')}.</p>` : '';
}
function drinksBlock(games, pid) {
  const mine = games.filter(g => g.config.players.includes(pid));
  if (!mine.some(g => (g.drinks && g.drinks[pid] && g.drinks[pid].length) || (g.drinksBefore && g.drinksBefore[pid]))) return '';
  const lv = averageByDrinks(mine.map(g => ({ state: gameState(g), game: g })), pid);
  return `${sec('Au fil des verres', 'verres')}
    ${infoBox('verres', 'Moyenne sur 3 fléchettes selon le nombre de verres déjà bus au moment de lancer (ceux de la soirée avant la partie compris ; une pinte compte pour 2). À droite : l\'écart avec la moyenne à jeun (ou le nombre de volées s\'il y en a trop peu). En gras : le niveau où il joue le mieux (9 fléchettes au moins).')}
    ${drinksLevelsHtml(lv)}${drinksLevelsLine(lv)}`;
}

// ------------------------------------------------------------------ volées repliées
function visitsOf(games, pid) {
  const out = [];
  for (const g of games) {
    const p = g.config.players.indexOf(pid);
    if (p < 0) continue;
    for (const v of gameState(g).visits) if (v.player === p) out.push({ g, v });
  }
  return out;
}

function bestList(games, pid) {
  const top = visitsOf(games, pid).sort((a, b) => b.v.scored - a.v.scored || b.g.startedAt - a.g.startedAt).slice(0, 10);
  return `<ol class="vlist">${top.map((x, i) => `<li><a href="#/partie/${esc(x.g.id)}"><span class="rk">${i + 1}</span><b class="sc">${x.v.scored}</b>
      <span class="dl">${when(x.g.startedAt)}</span><span class="g">${x.g.config.startScore}</span>${ico('chev')}</a></li>`).join('')}</ol>`;
}

function worstPerGame(rows) {
  return `<ul class="worst">${rows.slice(0, 30).map(r => `<li><a href="#/partie/${esc(r.gameId)}"><span class="d">${when(r.at)}</span><span class="g">${r.startScore}</span>
      <span class="w"><small>PIRE</small><b>${r.worst}</b></span><span class="bv"><small>MEILL.</small><b>${r.best}</b></span>${ico('chev')}</a></li>`).join('')}</ul>
    ${rows.length > 30 ? '<p class="note">Les 30 parties les plus récentes de la période.</p>' : ''}`;
}

/** Secteurs les plus touchés : tableau S / D / T / total (les 8 premiers, puis le bull). */
function sectorTable(seg) {
  const rows = [];
  for (let i = 1; i <= 20; i++) rows.push({ k: String(i), s: seg[i][0], d: seg[i][1], t: seg[i][2] });
  rows.sort((a, b) => (b.s + b.d + b.t) - (a.s + a.d + a.t));
  const top = rows.slice(0, 8);
  const bull = { k: 'BULL', s: seg[25][0], d: seg[25][1], t: null };
  const tr = r => `<tr><th>${r.k}</th><td>${r.s}</td><td>${r.d}</td><td>${r.t ?? '—'}</td><td><b>${r.s + r.d + (r.t || 0)}</b></td></tr>`;
  return `<table class="sectab"><thead><tr><th>Secteur</th><th>S</th><th>D</th><th>T</th><th>Total</th></tr></thead>
    <tbody>${top.map(tr).join('')}${tr(bull)}</tbody></table>`;
}

// ------------------------------------------------------------------ écran Stats (joueur)
export function stats2Screen(id) {
  const players = store.players.filter(p => !p.archived || store.games.some(g => g.config.players.includes(p.id)));
  if (!players.length) return `<div class="screen">${topBar('Stats', '#/')}<div class="empty"><div class="big">AUCUN JOUEUR</div></div></div>`;
  const pid = id && players.some(p => p.id === id) ? id : players[0].id;
  const p = playerById(pid);
  const games = inPeriod(store.games, currentPeriod());
  const st = playerStats(games, pid);
  const chips = `<div class="chips">${players.map(q => `<a class="btn chip" href="#/stats/${esc(q.id)}" aria-pressed="${q.id === pid}">${avatarHtml(q, 38)}<span class="nm">${esc(q.name.split(' ')[0])}</span></a>`).join('')}</div>`;
  const head = `${topBar('Stats', backFrom('#/'))}${tabs('joueur')}${chips}<div class="pad" style="margin-top:10px">${periodSeg()}</div>`;
  if (!st.played) {
    return `<div class="screen">${head}<div class="empty"><div class="big">AUCUNE PARTIE</div><p><span class="nm">${esc(p.name)}</span> n'a pas joué sur cette période.</p>
      <button type="button" class="btn primary" data-act="period" data-arg="tout">VOIR DEPUIS TOUJOURS</button></div></div>`;
  }
  const k = (key, label, value, cls = '') => `<div class="kpi ${cls}" data-k="${key}"><small>${label}</small><b>${value}</b></div>`;
  const drinkT = drinkTally(...games.filter(g => g.config.players.includes(pid)).map(g => g.drinks && g.drinks[pid]));
  const drinks = drinkT.units;
  const h2h = Object.entries(st.headToHead).sort((a, b) => b[1].played - a[1].played).map(([oid, h]) => {
    const o = playerById(oid);
    return `<li><a class="h2h-row" href="#/face/${esc(pid)}/${esc(oid)}">${avatarHtml(o, 32)}<span class="nm ell b">${esc(o.name)}</span><span class="sc">${tally(h.won, h.lost)}</span>${ico('chev')}</a></li>`;
  }).join('');
  const pb = pickedBoard();
  const readBoard = pb ? `<b>${pb}</b> : ${plural(countOf(st.segments, pb), 'impact', 'impacts')}` : 'Touchez une case de la cible pour lire le nombre d\'impacts.';
  return `<div class="screen stats2">${head}
    <div class="pad">
      <div class="who2">${avatarHtml(p, 44)}<div><b class="nm">${esc(p.name)}</b><span>${plural(st.played, 'partie', 'parties')} · ${plural(st.won, 'victoire', 'victoires')}</span></div></div>
      ${sec('Score', 'score')}
      ${infoBox('score', `<b>Moyenne</b> : ${metric('average').info} <b>9 premières</b> : ${metric('first9').info} <b>Pire volée</b> : ${metric('worstVisit').info}`)}
      <div class="kpis">
        ${k('average', 'Moyenne sur 3 fléchettes', avg(st.average), 'hero wide')}
        ${k('first9', '9 premières', avg(st.first9))}${k('won', 'Victoires', `${st.won}<small> / ${st.played}</small>`)}
        ${k('bestVisit', 'Meilleure volée', st.bestVisit)}${k('worstVisit', 'Pire volée', st.worstVisit ?? '—')}
      </div>
      ${sec('Précision', 'precision')}
      ${infoBox('precision', `<b>Triples</b> : ${metric('tripleRate').info} <b>Doubles</b> : ${metric('doubleRate').info}`)}
      <div class="kpis">${k('triple', 'Taux de triples', pct(st.tripleRate))}${k('double', 'Taux de doubles', pct(st.doubleRate))}</div>
      ${sec('Finition', null)}
      <div class="kpis">${k('bestFinish', 'Meilleure finition', int(st.bestFinish))}${k('shortest', 'Manche la + courte', `${st.shortestLeg ?? '—'}${st.shortestLeg ? '<small> fl.</small>' : ''}`)}</div>
      ${sec('Volées', null)}
      <div class="kpis"><div class="kpi wide tons"><div data-k="ton"><small>100+</small><b>${st.ton}</b></div><div data-k="ton40"><small>140+</small><b>${st.ton40}</b></div><div data-k="max"><small>180</small><b>${st.max}</b></div><div data-k="busts"><small>Bust</small><b>${st.busts}</b></div></div>
        ${k('drinks', `Verres${drinkT.pints ? ` · ${tallyText(drinkT)}` : ''}`, `${drinks}<small> en ${plural(st.played, 'partie', 'parties')}</small>`, 'wide')}</div>
      ${chartBlock(games, pid)}
      ${drinksBlock(games, pid)}
      ${sec('Meilleures et pires volées', 'volees')}
      ${infoBox('volees', 'Les 10 meilleures volées de la période, et la pire volée de chaque partie (sans les bust ni les volées de finition). Touchez une ligne pour ouvrir la partie.')}
      ${fold('best', 'Meilleures volées', 10, bestList(games, pid))}
      ${fold('worst', 'Pire volée de chaque partie', st.perGame.length, worstPerGame(st.perGame))}
      ${h2h ? `${sec('Face-à-face', null)}<ul class="h2h">${h2h}</ul>` : ''}
      ${sec('Segments touchés', 'cible', `<span class="n">${st.segments.total} fl.</span>`)}
      ${infoBox('cible', 'Chaque fléchette lancée sur la période, par zone : plus la case est foncée, plus elle a été touchée.')}
      ${fold('board', 'Carte de la cible', `${st.segments.miss} à côté`, `${board(st.segments, { counts: true })}
        <p class="note center">Chiffre sur chaque secteur : impacts dans ce secteur (simple, double et triple), au centre : le bull (25 et 50). ${readBoard}</p>
        ${sectorTable(st.segments)}`)}
    </div></div>`;
}

// ------------------------------------------------------------------ classement global
function rankingData(games) {
  const ids = [...new Set(games.flatMap(g => g.config.players))].filter(id => store.players.some(p => p.id === id));
  return ids.map(id => {
    const s = playerStats(games, id);
    const vals = {};
    for (const m of METRICS) vals[m.k] = m.all(s, games, id);
    return { id, s, vals };
  }).filter(r => r.s.played > 0);
}

/** Classés du meilleur au moins bon (verres : du plus au moins) ; valeurs absentes à la fin. */
function ranked(rows, m) {
  return [...rows].sort((a, b) => {
    const x = a.vals[m.k], y = b.vals[m.k];
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (m.dir < 0 ? x - y : y - x) || b.s.played - a.s.played;
  });
}

export function rankingScreen() {
  const games = inPeriod(store.games, currentPeriod());
  const rows = rankingData(games);
  const head = `${topBar('Classement', backFrom('#/'))}${tabs('classement')}<div class="pad" style="margin-top:10px">${periodSeg()}</div>`;
  if (rows.length < 2) {
    return `<div class="screen">${head}<div class="empty"><div class="big">PAS ASSEZ DE JOUEURS</div><p>Il faut au moins deux joueurs avec une partie sur la période.</p>
      <button type="button" class="btn primary" data-act="period" data-arg="tout">VOIR DEPUIS TOUJOURS</button></div></div>`;
  }
  const who = (r, size = 26) => { const p = playerById(r.id); return `${avatarHtml(p, size)}<span class="nm ell">${esc(p.name)}</span>`; };
  const cards = METRICS.map(m => {
    const list = ranked(rows, m).filter(r => r.vals[m.k] !== null && r.vals[m.k] !== undefined);
    if (list.length < 2) return '';
    const top = list[0], low = list[list.length - 1];
    if (top.vals[m.k] === low.vals[m.k]) return ''; // tout le monde pareil (aucun 180…) : rien à dire
    const [a, b] = m.dir ? ['MEILLEUR', 'PIRE'] : ['LE PLUS', 'LE MOINS']; // bust (dir -1) : classés du moins au plus
    return `<li class="palm"><button type="button" data-act="v2-rank" data-arg="${m.k}" aria-pressed="${ui.rank === m.k}">
      <span class="pl">${esc(m.label)}${m.unit ? ` <small>${m.unit}</small>` : ''}</span>
      <span class="pr best"><small>${ico('up')} ${a}</small>${who(top)}<b>${(m.allFmt || m.fmt)(top.vals[m.k])}</b></span>
      <span class="pr worst"><small>${ico('down')} ${b}</small>${who(low)}<b>${(m.allFmt || m.fmt)(low.vals[m.k])}</b></span></button></li>`;
  }).join('');
  const m = metric(ui.rank);
  const list = ranked(rows, m);
  const last = list.filter(r => r.vals[m.k] !== null && r.vals[m.k] !== undefined).length - 1;
  const chip = x => `<button type="button" class="chip2" data-act="v2-rank" data-arg="${x.k}" aria-pressed="${x.k === m.k}">${esc(x.label)}</button>`;
  const table = list.map((r, i) => {
    const v = r.vals[m.k];
    const tag = i === 0 && v !== null ? `<span class="tag inv">${m.dir ? 'EN TÊTE' : 'LE PLUS'}</span>` : i === last && i > 0 ? `<span class="tag">${m.dir ? 'LANTERNE ROUGE' : 'LE MOINS'}</span>` : '';
    const p = playerById(r.id);
    return `<li class="${i === 0 ? 'first' : ''}"><a href="#/stats/${esc(r.id)}"><span class="rk">${v === null || v === undefined ? '–' : i + 1}</span>${avatarHtml(p, 34)}
      <span class="nmc"><span class="nm ell">${esc(p.name)}</span>${tag}</span>
      <span class="meta"><b>${(m.allFmt || m.fmt)(v)}</b><small>${plural(r.s.played, 'partie', 'parties')}</small></span>${ico('chev')}</a></li>`;
  }).join('');
  return `<div class="screen ranking2">${head}
    <div class="pad">
      ${sec('Palmarès', 'palmares')}
      ${infoBox('palmares', 'Pour chaque chiffre, le meilleur et le pire joueur sur la période (au moins une partie jouée). Touchez une carte pour voir le classement complet de ce chiffre en dessous.')}
      <ul class="palms">${cards}</ul>
      ${sec('Classement', 'classement', `<span class="n">${rows.length}</span>`)}
      ${infoBox('classement', `<b>${esc(m.label)}</b> : ${m.info}`)}
      <div class="chips2">${METRICS.map(chip).join('')}</div>
      <ol class="rank2">${table}</ol>
    </div></div>`;
}

export const actions = {
  'v2-info'(k) { if (ui.info.has(k)) ui.info.delete(k); else ui.info.add(k); refresh(); },
  'v2-fold'(k) { if (ui.folds.has(k)) ui.folds.delete(k); else ui.folds.add(k); refresh(); },
  'v2-metric'(k) { ui.metric = k; ui.point = null; refresh(); },
  'v2-zoom'(d) { ui.zoom = Math.min(8, Math.max(1, d === 'in' ? ui.zoom * 2 : ui.zoom / 2)); refresh(); },
  'v2-point'(id) { ui.point = ui.point === id ? null : id; refresh(); },
  'v2-rank'(k) { ui.rank = k; refresh(); },
  'v2-compare'(id) { ui.compare = id || null; refresh(); },
};
