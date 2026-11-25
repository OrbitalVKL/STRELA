// Strela — stats d'entraînement (lot 8) : #/entrainement/stats.
// Filtres : source (ENTRAÎNEMENTS seuls, PARTIES seules, LES DEUX), joueur, jeu de fléchettes, exercice, période.
// Chiffres, carte de chaleur des impacts (simple intérieur et extérieur à part), courbe de progression (valeur écrite à
// côté de chaque point), comparaison par jeu de fléchettes et par exercice, liste des séances.
// Parties : les fléchettes du joueur dans ses parties X01 (sans cible visée connue : pas de précision ni d'écart) ; un
// jeu de fléchettes n'est noté que pour l'entraînement, le filtre « jeu » ne garde donc que les séances.
// 0.13.0 : une séance mise de côté n'y compte pas ; quand le jeu a changé pendant une séance, le filtre « jeu » et le
// tableau par jeu ne prennent que les fléchettes lancées avec ce jeu.
// 0.14.0 (demande de Guillaume) : la part de triples et de doubles et la carte de chaleur ne comptent que les fléchettes
// lancées « comme en partie » : jeux X01 et Cricket en solo, et parties. Sur un exercice (un secteur visé, l'horloge qui
// vise tout), la cible est imposée : ces chiffres n'y diraient rien. La précision et le groupement, à l'inverse, ne
// comptent que les exercices (un jeu n'a pas de cible imposée).
import { store, activePlayers, playerById, anySetById, setsOfPlayer, saveSetting, allGames, allTrainings, profilePlayer } from '../store.js';
import { esc, ico, topBar, plural, when } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { EXERCISES, ALL_EXERCISES, GAME_EXERCISES, analyze, sessionValue, zoneOf, pointsOf, setsUsed, setAt, isGameSession, gamePart } from '../../engine/training.js';
import { gameState } from '../../engine/stats.js';
import { refresh, backFrom, go } from '../nav.js';
import { infoBtn, infoBox } from '../info.js';
import { fmtValue, sessionCard, heatBoard } from './training.js';
import { trend, periodBounds, inPeriod, timeAxis, labelIndexes, isoDay } from '../../engine/trends.js';
import { heatLegend } from '../heat.js';
import { modeBand } from '../modeband.js';
import { trainBadgesGrid, honoursOf } from '../trainhonours.js';
import { buildAiExport, aiFileName } from '../../engine/aiexport.js';
import { drawTrainReport, trainReportBase } from '../trainreport.js';
import { heatScale } from '../heat.js';
import { heatCounts, levelOf, LEVELS, goalOf } from '../../engine/training.js';
import { TRAIN_BADGES, TIER_NAMES } from '../../engine/trainbadges.js';
import { dartSetSummary } from '../../engine/dartsets.js';
import { playerStats } from '../../engine/stats.js';
import { trainingDartLabel } from '../../engine/training.js';
import { deliverFile } from './printsheet.js';
import { pdfFromJpegs, sheetFonts } from '../sheet.js';
import { goalText } from './training.js';
import { HEAT_LABELS } from '../theme.js';

const dec1 = v => (v === null || v === undefined || Number.isNaN(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const dec2 = v => (v === null || v === undefined || Number.isNaN(v) ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ','));
const pctOf = v => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);
// Lot 8 du 23/11 (3.3) : période en raccourcis (7 jours, 30 jours, tout) ou plage libre au calendrier (`range`, jours
// « AAAA-MM-JJ ») ; les courbes, les chiffres et les exports suivent la même période (trainStatsPeriod).
const PERIODS = ['7j', '30j', 'tout', 'plage'];

// État de l'écran (gardé d'une visite à l'autre, comme les Stats).
const fresh = () => ({ source: 'entrainements', player: null, set: '', exercise: '', period: 'tout', range: { from: '', to: '' }, metric: null, folds: new Set() });
const ui = fresh();
export function presetTrainStats(state = {}) { Object.assign(ui, fresh(), state); }

const bounds = () => periodBounds(ui.period, ui.range);
/** Filtres de l'écran (période, source, joueur, jeu, exercice), pour les exports (8.2, 8.3) : mêmes séances que l'écran. */
export const trainStatsFilter = () => ({ source: ui.source, player: ui.player, set: ui.set, exercise: ui.exercise, period: ui.period, range: { ...ui.range }, bounds: bounds() });
const analysisCache = new Map();
const an = r => { const k = `${r.id}:${r.darts.length}:${(r.blocks || []).length}:${JSON.stringify(r.setChanges || [])}:${r.setId}`; if (!analysisCache.has(k)) analysisCache.set(k, analyze(r)); return analysisCache.get(k); };

/** Séances du joueur sur les filtres (lot 8 du 23/11, 3.4 : jamais une séance sans fléchette saisie). */
export function sessionsOf(pid, f = { set: ui.set, exercise: ui.exercise, bounds: bounds() }) {
  return allTrainings().filter(r => r.player === pid && !r.excluded && r.darts.length > 0 && inPeriod(r.startedAt, f.bounds) && (!f.set || setsUsed(r).includes(f.set)) && (!f.exercise || r.exercise === f.exercise))
    .sort((a, b) => a.startedAt - b.startedAt);
}
/** Rangs des fléchettes d'une séance lancées avec le jeu `setId` (toutes sans filtre, ou sans changement de jeu). */
const idxOfSet = (r, setId = ui.set || null) => r.darts.map((_, i) => i).filter(i => setId === null || !(r.setChanges || []).length || (setAt(r, i) || '') === setId);
/** Fléchettes d'une séance lancées avec le jeu filtré (toutes sans filtre). */
const dartsOfSet = r => idxOfSet(r).map(i => r.darts[i]);
/** Jeux en solo : chiffres des fléchettes lancées avec le jeu `setId` ({ value, counted, triples, doubles, off, n, fin, finHits }). */
function gameSetPart(r, setId = ui.set || null) {
  const a = an(r);
  const idx = idxOfSet(r, setId);
  const out = gamePart(r.exercise, idx.map(i => r.darts[i]), idx.map(i => a.extra.credit[i]));
  const ff = a.extra.finishFlags || [];
  out.fin = idx.filter(i => ff[i] > 0).length;
  out.finHits = idx.filter(i => ff[i] === 2).length;
  return out;
}
/** Valeur d'un jeu sur plusieurs séances : moyenne sur 3 fléchettes (X01) ou MPR (Cricket), pondérée par les fléchettes comptées. */
function gameValue(parts) {
  const n = parts.reduce((k, p) => k + p.counted, 0);
  return n ? parts.reduce((k, p) => k + (p.value || 0) * p.counted, 0) / n : null;
}
/** Chiffres d'une séance pour le jeu filtré : { darts, hits, spread, points } (la séance entière sans filtre ou sans changement de jeu). */
function setPart(r, a = an(r), setId = ui.set || null) {
  if (setId !== null && a.extra.bySet) {
    const x = a.extra.bySet.find(y => (y.setId || '') === setId);
    return x ? { darts: x.darts, hits: x.hits, spread: x.spread, points: x.points, rate: x.rate, dist: x.dist, distN: x.distN, approx: x.approx, offNoPos: x.offNoPos }
      : { darts: 0, hits: 0, spread: null, points: 0, rate: null, dist: null, distN: 0, approx: 0, offNoPos: 0 };
  }
  return { darts: a.darts, hits: a.hits, spread: a.spread, points: a.points, rate: a.rate, dist: a.dist, distN: a.distN, approx: a.approx, offNoPos: a.offNoPos };
}
/** Moyenne des distances de plusieurs séances, pondérée par les fléchettes mesurées (mm), ou null. */
const distOf = parts => { const n = parts.reduce((k, x) => k + (x.distN || 0), 0); return n ? parts.reduce((k, x) => k + (x.dist || 0) * (x.distN || 0), 0) / n : null; };
function gamesOf(pid) {
  if (ui.set || ui.exercise) return []; // une partie n'a ni jeu de fléchettes noté ni exercice
  const b = bounds();
  return allGames().filter(g => g.config.players.includes(pid) && inPeriod(g.startedAt, b)).sort((a, b2) => a.startedAt - b2.startedAt);
}
function gameDarts(g, pid) {
  const i = g.config.players.indexOf(pid);
  const out = [];
  try { for (const v of gameState(g).visits) if (v.player === i) out.push(...v.darts); } catch (e) { /* illisible */ }
  return out;
}

// ------------------------------------------------------------------ courbe (une séance ou une partie = un point)
const FREE_AIM = 'Jeux X01 et Cricket (mode Jeux) et parties seulement : sur un exercice, la cible est imposée.';
const METRICS = {
  // Lot 8 du 23/11 (3.4) : la précision est la distance au point visé (plus c'est bas, mieux c'est), hors cible posés
  // compris ; la part dans la cible reste à côté.
  prec: { label: 'Précision (cm)', fmt: v => dec1(v / 10), dir: -1, of: (r, a) => (isGameSession(r) ? null : setPart(r, a).dist), info: 'Distance moyenne entre chaque fléchette et le point visé, en centimètres sur une vraie cible, séance par séance : plus c\'est bas, plus c\'est précis. Un hors cible posé sur la cible compte avec sa distance ; un hors cible saisi au pavé (sans position) n\'en a pas. Saisie au pavé : la fléchette est placée au centre de sa case (distance approchée). Exercices seulement : un jeu n\'a pas de cible imposée.' },
  rate: { label: 'Dans la cible', fmt: pctOf, pct: true, of: (r, a) => (isGameSession(r) ? null : setPart(r, a).rate), info: 'Fléchettes dans la cible visée ÷ fléchettes lancées, séance par séance (exercices seulement : un jeu n\'a pas de cible imposée).' },
  spread: { label: 'Groupement (cm)', fmt: v => dec1(v / 10), dir: -1, of: (r, a) => { if (isGameSession(r)) return null; const x = setPart(r, a); return x.points >= 3 ? x.spread : null; }, info: 'Distance moyenne des fléchettes à leur centre, en centimètres sur une vraie cible : plus c\'est bas, plus elles sont groupées (exercices seulement).' },
  exercise: { label: 'Résultat', of: (r, a) => (isGameSession(r) ? gameSetPart(r).value : (v => (v ? v.v : null))(sessionValue(r, a))), info: 'Le résultat de l\'exercice : précision, fléchettes pour boucler l\'horloge, moyenne par volée, part près du centre ; en X01, la moyenne sur 3 fléchettes ; au Cricket, les marques par volée.' },
  average: { label: 'Moyenne', fmt: dec1, game: true, info: 'Moyenne sur 3 fléchettes dans chaque partie X01.' },
  triples: { label: 'Triples', fmt: pctOf, pct: true, free: true, info: `Fléchettes dans un triple ÷ fléchettes lancées. ${FREE_AIM}` },
  doubles: { label: 'Doubles', fmt: pctOf, pct: true, free: true, info: `Fléchettes dans un double (le 50 compris) ÷ fléchettes lancées. ${FREE_AIM}` },
  off: { label: 'Hors cible', fmt: pctOf, pct: true, both: true, info: 'Fléchettes à côté de la cible ÷ fléchettes lancées.' },
};
const exIsGame = () => GAME_EXERCISES.includes(ui.exercise);
const metricsFor = () => (ui.source === 'entrainements'
  ? (exIsGame() ? ['exercise', 'triples', 'doubles', 'off'] : ui.exercise ? ['prec', 'spread', 'exercise', 'rate', 'off'] : ['prec', 'spread', 'rate', 'triples', 'doubles', 'off'])
  : ui.source === 'parties' ? ['average', 'triples', 'doubles', 'off'] : ['triples', 'doubles', 'off']);

function exerciseFmt() {
  const ex = EXERCISES[ui.exercise];
  if (!ex) return pctOf;
  if (ex.metric === 'mpr') return dec2;
  if (ex.clock) return v => String(Math.round(v));
  if (ex.metric === 'average') return dec1;
  return pctOf;
}
/** Nom du chiffre de l'exercice filtré. */
function exerciseLabel() {
  const ex = EXERCISES[ui.exercise];
  if (ex.game === 'x01') return 'Moyenne / 3 fl.';
  if (ex.game === 'cricket') return 'Marques / volée';
  if (ex.clock) return ex.clock.max ? 'Doubles touchés' : 'Fléchettes';
  return ex.metric === 'average' ? 'Moyenne / volée' : ex.metric === 'near' ? 'Près du centre' : 'Résultat';
}

/** Points de la courbe : [{ at, v, id?, kind }]. */
function points(pid, mk) {
  const rate = (ds, f) => (ds.length ? ds.filter(f).length / ds.length : null);
  const items = [];
  if (ui.source !== 'parties') for (const r of sessionsOf(pid)) items.push({ at: r.startedAt, kind: 't', r, darts: dartsOfSet(r) });
  if (ui.source !== 'entrainements') for (const g of gamesOf(pid)) items.push({ at: g.startedAt, kind: 'g', g, darts: gameDarts(g, pid) });
  items.sort((a, b) => a.at - b.at);
  return items.map(x => {
    let v = null;
    if (METRICS[mk].free && x.kind === 't' && !isGameSession(x.r)) v = null; // triples, doubles : jeux et parties seulement
    else if (mk === 'triples') v = rate(x.darts, d => d.multiplier === 3);
    else if (mk === 'doubles') v = rate(x.darts, d => d.multiplier === 2);
    else if (mk === 'off') v = rate(x.darts, d => d.segment === 0);
    else if (mk === 'average') v = x.darts.length ? (x.darts.reduce((n, d) => n + pointsOf(d), 0) / x.darts.length) * 3 : null;
    else if (x.kind === 't') v = METRICS[mk].of(x.r, an(x.r));
    return { at: x.at, v, href: x.kind === 't' ? `#/entrainement/seance/${x.r.id}` : `#/partie/${x.g.id}` };
  }).filter(p => p.v !== null && p.v !== undefined);
}

/**
 * Courbe (lot 8 du 23/11, 3.2) : abscisses proportionnelles au temps réel (deux séances du même soir restent séparées
 * d'un écart minimal), une date seulement quand elle a la place (une sur deux ou trois), la valeur écrite au-dessus de
 * chaque point.
 */
function chart(pts, fmt, pct, key) {
  if (pts.length < 2) return '<p class="note">Il faut au moins deux séances (ou parties) avec ce chiffre pour tracer la courbe.</p>';
  const H = 190, T = 22, B = 20;
  const ax = timeAxis(pts.map(p => p.at), { left: 26, width: Math.max(250, (pts.length - 1) * 40), gap: 36 });
  const W = Math.max(300, ax.width + 52);
  const xs = ax.xs;
  const vals = pts.map(p => (pct ? p.v * 100 : p.v));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (pct) { lo = 0; hi = 100; } else { const pad = Math.max(1, (hi - lo) * 0.15); lo = Math.max(0, lo - pad); hi += pad; }
  const y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const line = vals.map((v, i) => `${xs[i].toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const show = new Set(labelIndexes(xs, 66));
  const day = at => { const d = new Date(at); return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const dots = pts.map((p, i) => `<rect class="pt" x="${(xs[i] - 3.5).toFixed(1)}" y="${(y(vals[i]) - 3.5).toFixed(1)}" width="7" height="7"/>
    <text class="pv" x="${xs[i].toFixed(1)}" y="${(y(vals[i]) - 8).toFixed(1)}" text-anchor="middle">${fmt(p.v)}</text>
    ${show.has(i) ? `<text x="${xs[i].toFixed(1)}" y="${H - 4}" text-anchor="middle">${day(p.at)}</text><line class="tick" x1="${xs[i].toFixed(1)}" x2="${xs[i].toFixed(1)}" y1="${H - B + 2}" y2="${H - B + 6}"/>` : ''}`).join('');
  return `<div class="chartbox"><div class="chscroll" data-hscroll="${esc(key)}"><svg class="chart2" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Courbe de progression">
      <line class="mean" x1="0" x2="${W}" y1="${y(mean).toFixed(1)}" y2="${y(mean).toFixed(1)}"/><polyline class="ln" points="${line}"/>${dots}</svg></div></div>
    <div class="chlegend"><span><i class="lg-ln"></i> ${plural(pts.length, 'point', 'points')}, placés selon leur date</span><span><i class="lg-mean"></i> moyenne ${pct ? `${Math.round(mean)} %` : fmt(mean)}</span></div>`;
}

// ------------------------------------------------------------------ tendances (lot 8 du 23/11, 3.1)
/** Flèche d'une tendance : sens de la valeur, et en toutes lettres si c'est mieux ou moins bien. */
export function trendBadge(t) {
  if (!t || t.arrow === null) return '<span class="trd na">—</span>';
  if (t.arrow === 'flat') return '<span class="trd flat">→ <small>stable</small></span>';
  return `<span class="trd ${t.better ? 'good' : 'bad'}">${t.arrow === 'up' ? '↗' : '↘'} <small>${t.better ? 'mieux' : 'moins bien'}</small></span>`;
}
/**
 * Tendances par exercice et au global : précision (distance au point visé) et groupement, moyenne et flèche sur les
 * dix dernières séances de la période (il en faut quatre pour une flèche).
 */
export function trendRows(sessions, part = r => setPart(r)) {
  const aimed = sessions.filter(r => !isGameSession(r));
  const one = (name, key, list) => {
    const parts = list.map(part);
    const prec = parts.map(x => x.dist), spr = parts.map(x => (x.points >= 3 ? x.spread : null));
    return { name, key, n: list.length, prec: trend(prec, -1), spread: trend(spr, -1) };
  };
  const rows = [one('Toutes', '', aimed)];
  for (const k of ALL_EXERCISES) {
    if (GAME_EXERCISES.includes(k)) continue;
    const list = aimed.filter(r => r.exercise === k);
    if (list.length) rows.push(one(EXERCISES[k].name, k, list));
  }
  return aimed.length ? rows : [];
}
function trendsBlock(sessions) {
  const rows = trendRows(sessions);
  if (!rows.length) return '';
  const cell = t => (t.mean === null ? '<td>—</td>' : `<td><b>${dec1(t.mean / 10)}</b> ${trendBadge(t)}</td>`);
  return `<div class="sec">Tendances${infoBtn('ts-trend')}</div>
    ${infoBox('ts-trend', 'Sur les dix dernières séances de la période (pour chaque exercice, et toutes ensemble) : la moyenne, en centimètres, et une flèche quand la progression dépasse 5 % (il faut au moins quatre séances). <b>Précision</b> : distance au point visé ; <b>groupement</b> : distance des fléchettes à leur centre. Pour les deux, plus bas = mieux : une flèche vers le bas est un progrès.')}
    <table class="sectab trtab trends"><thead><tr><th>Exercice</th><th>Préc. (cm)</th><th>Grp. (cm)</th></tr></thead><tbody>
    ${rows.map(r => `<tr${r.key ? '' : ' class="all"'}><th class="ell">${esc(r.name)} <small>${r.n}</small></th>${cell(r.prec)}${cell(r.spread)}</tr>`).join('')}</tbody></table>`;
}

// ------------------------------------------------------------------ écran
const segBtn = (act, v, cur, label) => `<button type="button" data-act="${act}" data-arg="${v}" aria-pressed="${cur === v}">${label}</button>`;

const setName = k => (k ? (anySetById(k) || { name: '?' }).name : 'Sans jeu noté');
/** Jeux en solo par jeu de fléchettes : fléchettes, moyenne X01, MPR, triples, doubles. */
function bySetGames(sessions) {
  const rows = new Map();
  for (const r of sessions) {
    for (const k of setsUsed(r).map(x => x || '')) {
      if (ui.set && k !== ui.set) continue;
      if (!rows.has(k)) rows.set(k, { k, x01: [], cricket: [], n: 0, t: 0, d: 0 });
      const x = rows.get(k), part = gameSetPart(r, (r.setChanges || []).length ? k : null);
      x[r.exercise].push(part); x.n += part.n; x.t += part.triples; x.d += part.doubles;
    }
  }
  if (!rows.size) return '';
  const list = [...rows.values()];
  const hasX = list.some(x => x.x01.length), hasC = list.some(x => x.cricket.length);
  return `<table class="sectab trtab"><thead><tr><th>Jeu</th>${hasX && hasC ? '' : '<th>Fl.</th>'}${hasX ? '<th>Moy.</th>' : ''}${hasC ? '<th>MPR</th>' : ''}<th>T %</th><th>D %</th></tr></thead><tbody>
    ${list.map(x => `<tr><th class="ell">${esc(setName(x.k))}</th>${hasX && hasC ? '' : `<td>${x.n}</td>`}${hasX ? `<td>${dec1(gameValue(x.x01))}</td>` : ''}${hasC ? `<td>${dec2(gameValue(x.cricket))}</td>` : ''}<td>${pctOf(x.n ? x.t / x.n : null)}</td><td>${pctOf(x.n ? x.d / x.n : null)}</td></tr>`).join('')}</tbody></table>`;
}

function bySet(sessions) {
  const rows = new Map();
  for (const r of sessions) {
    const a = an(r);
    for (const k of setsUsed(r).map(x => x || '')) {
      if (ui.set && k !== ui.set) continue;
      if (!rows.has(k)) rows.set(k, { k, n: 0, darts: 0, hits: 0, spread: [], parts: [] });
      const x = rows.get(k), part = setPart(r, a, a.extra.bySet ? k : null);
      x.n++; x.darts += part.darts; x.hits += part.hits; x.parts.push(part); if (part.points >= 3 && part.spread !== null) x.spread.push(part.spread);
    }
  }
  if (rows.size < 1) return '';
  return `<table class="sectab trtab"><thead><tr><th>Jeu</th><th>Séan.</th><th>Préc.</th><th>Cible</th><th>Grp.</th></tr></thead><tbody>
    ${[...rows.values()].map(x => { const d = distOf(x.parts); return `<tr><th class="ell">${esc(setName(x.k))}</th><td>${x.n}</td><td>${d === null ? '—' : dec1(d / 10)}</td><td>${pctOf(x.darts ? x.hits / x.darts : null)}</td><td>${x.spread.length ? dec1(x.spread.reduce((a, b) => a + b, 0) / x.spread.length / 10) : '—'}</td></tr>`; }).join('')}</tbody></table>`;
}

function byExercise(sessions) {
  const rows = ALL_EXERCISES.map(k => {
    const list = sessions.filter(r => r.exercise === k);
    if (!list.length) return '';
    const vals = list.map(r => sessionValue(r, an(r))).filter(Boolean);
    const last = vals[vals.length - 1];
    const best = vals.length ? vals.reduce((b, v) => ((v.dir > 0 ? v.v > b.v : v.v < b.v) ? v : b)) : null;
    return `<tr><th class="ell">${esc(EXERCISES[k].name)}</th><td>${list.length}</td><td>${fmtValue(last)}</td><td>${fmtValue(best)}</td></tr>`;
  }).join('');
  return rows ? `<table class="sectab trtab"><thead><tr><th>Exercice</th><th>Séan.</th><th>Dern.</th><th>Meill.</th></tr></thead><tbody>${rows}</tbody></table>` : '';
}

export function trainStatsScreen() {
  // Lot 10 : moi, mes amis, puis les joueurs du téléphone (sélecteur commun aux stats multijoueur).
  const players = activePlayers();
  const withTr = new Set(allTrainings().map(r => r.player));
  const me = profilePlayer();
  const rank = p => (me && p.id === me.id ? 0 : p.friend ? 1 : 2);
  const list = [...players, ...store.players.filter(p => p.archived && withTr.has(p.id))].map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(x => x.p);
  if (!list.length) return `<div class="screen">${topBar('Stats d\'entraînement', backFrom('#/entrainement'))}<div class="empty"><div class="big">AUCUN JOUEUR</div></div></div>`;
  const pid = list.some(p => p.id === ui.player) ? ui.player : (store.trSetup && list.some(p => p.id === store.trSetup.player) ? store.trSetup.player : list[0].id);
  ui.player = pid;
  // Lot 10 : jeux du joueur choisi (ceux d'un ami viennent de son profil) ; un filtre sur un jeu qu'il n'a pas (resté
  // d'un autre joueur) retombe sur TOUS, sinon l'écran restait vide sans moyen de choisir.
  const sets = setsOfPlayer(pid);
  if (ui.set && !sets.some(x => x.id === ui.set)) ui.set = '';
  const sessions = ui.source === 'parties' ? [] : sessionsOf(pid);
  const games = ui.source === 'entrainements' ? [] : gamesOf(pid);
  const tDarts = sessions.flatMap(dartsOfSet);
  const gDarts = games.flatMap(g => gameDarts(g, pid));
  const darts = [...tDarts, ...gDarts];
  // 0.14.0 : exercices (cible imposée) d'un côté, jeux en solo de l'autre ; triples, doubles et carte : jeux et parties.
  const aimed = sessions.filter(r => !isGameSession(r));
  const played = sessions.filter(isGameSession);
  const free = [...played.flatMap(dartsOfSet), ...gDarts];
  const parts = aimed.map(r => setPart(r));
  const hits = parts.reduce((n, a) => n + a.hits, 0), tN = parts.reduce((n, a) => n + a.darts, 0);
  const spreads = parts.filter(a => a.points >= 3 && a.spread !== null).map(a => a.spread);
  const k = (kk, label, value, cls = '') => `<div class="kpi ${cls}" data-k="${kk}"><small>${label}</small><b>${value}</b></div>`;
  const rate = f => (darts.length ? darts.filter(f).length / darts.length : null);
  const freeRate = f => (free.length ? free.filter(f).length / free.length : null);
  const kpis = [];
  if (ui.source !== 'parties' && exIsGame()) {
    const gp = played.map(r => gameSetPart(r));
    const fin = gp.reduce((n, x) => n + x.fin, 0), finHits = gp.reduce((n, x) => n + x.finHits, 0);
    kpis.push(ui.exercise === 'x01' ? k('average', 'Moyenne sur 3 fléchettes', dec1(gameValue(gp)), 'hero wide') : k('mpr', 'Marques par volée (MPR)', dec2(gameValue(gp)), 'hero wide'));
    kpis.push(k('sessions', 'Séances', String(sessions.length)));
    if (ui.exercise === 'x01') kpis.push(k('finish', 'Finition', fin ? `${pctOf(finHits / fin)}<small> · ${finHits}/${fin}</small>` : '—'));
  } else if (ui.source !== 'parties') {
    const d = distOf(parts);
    kpis.push(k('prec', 'Précision · écart moyen à la cible', d === null ? '—' : `${dec1(d / 10)}<small> cm</small>`, 'hero wide'));
    kpis.push(k('rate', 'Dans la cible', pctOf(tN ? hits / tN : null)));
    kpis.push(k('sessions', 'Séances', String(sessions.length)));
    kpis.push(k('spread', 'Groupement moyen', spreads.length ? `${dec1(spreads.reduce((a, b) => a + b, 0) / spreads.length / 10)}<small> cm</small>` : '—'));
  } else {
    const avg3 = gDarts.length ? (gDarts.reduce((n, d) => n + pointsOf(d), 0) / gDarts.length) * 3 : null;
    kpis.push(k('average', 'Moyenne sur 3 fléchettes', dec1(avg3), 'hero wide'));
    kpis.push(k('games', 'Parties', String(games.length)));
  }
  kpis.push(k('darts', 'Fléchettes', ui.source === 'deux' ? `${darts.length}<small> (${tDarts.length} + ${gDarts.length})</small>` : String(darts.length), ui.source === 'deux' ? 'wide' : ''));
  kpis.push(k('triples', 'Triples', pctOf(freeRate(d => d.multiplier === 3))));
  kpis.push(k('doubles', 'Doubles', pctOf(freeRate(d => d.multiplier === 2))));
  kpis.push(k('offr', 'Hors cible', pctOf(rate(d => d.segment === 0))));
  if (ui.source !== 'parties') {
    const zs = tDarts.map(zoneOf);
    const si = zs.filter(z => z === 'si').length, se = zs.filter(z => z === 'se').length;
    kpis.push(k('rings', 'Simples int. / ext.', si + se ? `${si}<small> / ${se}</small>` : '—'));
  }
  if (kpis.length % 2 === 0) kpis.push(k('bulls', 'Bulls (25 · 50)', String(darts.filter(d => d.segment === 25).length)));
  // Lot 8 du 23/11 (1.4) : la distance et le groupement d'une saisie au pavé partent du centre de la case.
  const approx = parts.reduce((n2, x) => n2 + (x.approx || 0), 0), noPos = parts.reduce((n2, x) => n2 + (x.offNoPos || 0), 0);
  const approxNote = ui.source !== 'parties' && (approx || noPos) ? `<p class="note approx">≈ ${approx ? `${plural(approx, 'fléchette saisie', 'fléchettes saisies')} au pavé, placée${approx > 1 ? 's' : ''} au centre de leur case : précision et groupement approchés.` : ''}${noPos ? ` ${plural(noPos, 'hors cible', 'hors cible')} au pavé, compté${noPos > 1 ? 's' : ''} sans distance.` : ''}</p>` : '';
  const freeNote = !free.length ? '<p class="note">Triples, doubles et carte de chaleur : seulement sur les jeux X01 et Cricket (mode Jeux) et les parties, où l\'on vise comme en partie. Sur un exercice, la cible est imposée.</p>' : '';

  const p = playerById(pid);
  const chips = list.length > 1 ? `<div class="chips">${list.map(q => `<button type="button" class="btn chip" data-act="ts-player" data-arg="${esc(q.id)}" aria-pressed="${q.id === pid}">${avatarHtml(q, 38)}<span class="nm">${esc(q.name.split(' ')[0])}</span></button>`).join('')}</div>` : '';
  const setChips = ui.source === 'parties' ? '' : `<span class="small dim caps">Jeu de fléchettes</span><div class="chips2">
    <button type="button" class="chip2" data-act="ts-set" data-arg="" aria-pressed="${!ui.set}">TOUS</button>
    ${sets.map(x => `<button type="button" class="chip2" data-act="ts-set" data-arg="${esc(x.id)}" aria-pressed="${ui.set === x.id}">${esc(x.name)}</button>`).join('')}</div>`;
  const exChips = ui.source === 'parties' ? '' : `<span class="small dim caps">Exercice</span><div class="chips2">
    <button type="button" class="chip2" data-act="ts-ex" data-arg="" aria-pressed="${!ui.exercise}">TOUS</button>
    ${ALL_EXERCISES.filter(x => x === ui.exercise || allTrainings().some(r => r.player === pid && r.exercise === x)).map(x => `<button type="button" class="chip2" data-act="ts-ex" data-arg="${x}" aria-pressed="${ui.exercise === x}">${esc(EXERCISES[x].name)}</button>`).join('')}</div>`;
  const filters = `<div class="seg tsrc">${segBtn('ts-source', 'entrainements', ui.source, 'Entraîn.')}${segBtn('ts-source', 'parties', ui.source, 'Parties')}${segBtn('ts-source', 'deux', ui.source, 'Les deux')}</div>
    ${setChips}${exChips}`;
  const per = `<div class="seg tper">${segBtn('ts-period', '7j', ui.period, '7 jours')}${segBtn('ts-period', '30j', ui.period, '30 jours')}${segBtn('ts-period', 'tout', ui.period, 'Tout')}<button type="button" data-act="ts-period" data-arg="plage" aria-pressed="${ui.period === 'plage'}" aria-label="Plage de dates">${ico('calendar')}</button></div>
    ${ui.period === 'plage' ? `<div class="trange"><label><small>DU</small><input type="date" class="input" data-input="ts-from" value="${esc(ui.range.from)}" max="${isoDay(Date.now())}"></label><label><small>AU</small><input type="date" class="input" data-input="ts-to" value="${esc(ui.range.to)}" max="${isoDay(Date.now())}"></label></div>` : ''}
    <p class="small dim tperl">Période : ${esc(bounds().label)}</p>`;
  const head = `${topBar('Stats d\'entraînement', backFrom('#/entrainement'))}${modeBand('train', { tabs: true, pid })}<div class="pad">${per}${chips}
    <div class="sec">Filtres${infoBtn('ts-filters')}</div>
    ${infoBox('ts-filters', '<b>Entraînements</b> : les séances seules. <b>Parties</b> : les fléchettes du joueur dans ses parties X01 (sans cible visée : ni précision, ni groupement). <b>Les deux</b> : séances et parties, pour les chiffres qui se comparent (triples, doubles, hors cible, carte). Le jeu de fléchettes et l\'exercice ne concernent que l\'entraînement. Triples, doubles et carte de chaleur ne comptent que les jeux X01 et Cricket (mode Jeux) et les parties ; précision et groupement, que les exercices.')}
    ${filters}</div>`;
  if (!darts.length) {
    return `<div class="screen trstats">${head}<div class="empty" style="padding-top:20px"><div class="big">RIEN À MONTRER</div>
      <p><span class="nm">${esc(p.name)}</span> n'a ${ui.source === 'parties' ? 'pas de partie' : 'pas de séance'} avec ces filtres.</p>
      ${ui.period !== 'tout' || ui.set || ui.exercise ? '<button type="button" class="btn primary" data-act="ts-reset">TOUT AFFICHER</button>' : '<a class="btn primary" href="#/entrainement">S\'ENTRAÎNER</a>'}</div></div>`;
  }
  const allowed = metricsFor();
  const mk = allowed.includes(ui.metric) ? ui.metric : allowed[0];
  const m = METRICS[mk];
  const fmt = mk === 'exercise' ? exerciseFmt() : m.fmt;
  const pct = mk === 'exercise' ? fmt === pctOf : !!m.pct;
  const hb = heatBoard(free);
  return `<div class="screen trstats">${head}
    <div class="pad">
      <div class="kpis">${kpis.join('')}</div>${approxNote}${freeNote}
      ${exportBlock()}
      <div class="sec">Progression${infoBtn('ts-curve')}</div>
      ${infoBox('ts-curve', esc(m.info) + ' Chaque point est une séance (ou une partie), dans l\'ordre ; la valeur est écrite au-dessus. Touchez la liste des séances plus bas pour en ouvrir une.')}
      <div class="chips2">${allowed.map(x => `<button type="button" class="chip2" data-act="ts-metric" data-arg="${x}" aria-pressed="${x === mk}">${esc(x === 'exercise' ? exerciseLabel() : METRICS[x].label)}</button>`).join('')}</div>
      ${chart(points(pid, mk), fmt, pct, `ts:${pid}:${ui.source}:${mk}`)}
      ${free.length ? `<div class="sec">Carte de chaleur <span class="n">${hb.total} fl.</span>${infoBtn('ts-heat')}</div>
      ${infoBox('ts-heat', `Chaque fléchette sur la cible, par zone : ${heatLegend()} (échelle au choix dans Réglages › Affichage). ${FREE_AIM} À l'entraînement, le simple intérieur et le simple extérieur sont comptés à part ; une fléchette de partie (simple sans anneau connu) compte pour moitié dans chacun.`)}
      <div class="heatbox">${hb.svg}</div><p class="note center">${plural(hb.off, 'fléchette', 'fléchettes')} hors cible, non dessinée${hb.off > 1 ? 's' : ''}.</p>` : ''}
      ${ui.source !== 'parties' && !exIsGame() ? trendsBlock(sessions) : ''}
      ${ui.source !== 'parties' ? `<div class="sec">Badges d'entraînement${infoBtn('ts-badges')}</div>
        ${infoBox('ts-badges', 'Bronze, argent, or : jours d\'affilée, fléchettes lancées, écart moyen à la cible, groupement, progrès sur un exercice, petits défis réussis en séance (volée parfaite, trio, même trou, œil de bœuf). Calculés sur tout l\'historique du joueur, quelle que soit la période choisie. Touchez un badge pour voir ce qu\'il veut dire et la séance où il a été gagné.')}
        ${trainBadgesGrid(pid)}` : ''}
      ${ui.source !== 'parties' && sessions.length ? `<div class="sec">Par jeu de fléchettes${infoBtn('ts-sets')}</div>
        ${infoBox('ts-sets', 'Pour comparer les jeux : sur les exercices, séances, fléchettes, précision (dans la cible visée) et groupement moyen (cm) ; sur les jeux X01 et Cricket, fléchettes, moyenne sur 3 fléchettes, MPR, part de triples et de doubles. Sur les filtres choisis.')}
        ${aimed.length ? bySet(aimed) : ''}${played.length ? `${aimed.length ? '<p class="small dim caps tsub">En jeu (X01, Cricket)</p>' : ''}${bySetGames(played)}` : ''}
        <div class="sec">Par exercice</div>${byExercise(sessions)}
        <div class="sec">Séances <span class="n">${sessions.length}</span></div>
        <ul class="trl">${[...sessions].reverse().slice(0, ui.folds.has('all') ? 200 : 10).map(sessionCard).join('')}</ul>
        ${sessions.length > 10 && !ui.folds.has('all') ? `<button type="button" class="btn ghost" data-act="ts-all">${ico('down')} LES ${sessions.length} SÉANCES</button>` : ''}` : ''}
    </div></div>`;
}

export const actions = {
  'ts-source'(v) { ui.source = ['entrainements', 'parties', 'deux'].includes(v) ? v : 'entrainements'; refresh(); },
  'ts-period'(v) { ui.period = PERIODS.includes(v) ? v : 'tout'; refresh(); },
  'ts-player'(id) { ui.player = id; refresh(); },
  'ts-set'(id) { ui.set = id || ''; refresh(); },
  'ts-ex'(k) { ui.exercise = EXERCISES[k] ? k : ''; if (ui.exercise) ui.metric = 'exercise'; refresh(); },
  'ts-metric'(k) { ui.metric = k; refresh(); },
  'ts-reset'() { Object.assign(ui, { period: 'tout', range: { from: '', to: '' }, set: '', exercise: '' }); refresh(); },
  'ts-all'() { ui.folds.add('all'); refresh(); },
  // Depuis les Stats d'un joueur : ses stats d'entraînement.
  'ts-open'(pid) { ui.player = pid; go('#/entrainement/stats'); },
  // Lot 9.5 (C1) : sélecteur Soirée / Entraînement du haut des stats (modeband.js) ; même joueur ; l'adresse est
  // remplacée (pas empilée) : le retour ramène à l'écran d'où l'on est venu aux stats.
  'stats-mode'(arg) {
    const [mode, pid] = String(arg).split(':');
    saveSetting('statsMode', mode === 'train' ? 'train' : 'soiree');
    if (mode === 'train') { if (pid) ui.player = pid; go('#/entrainement/stats', { replace: true }); }
    else go(pid && playerById(pid) && !playerById(pid).remote ? `#/stats/${pid}` : '#/stats', { replace: true });
  },
};

export const inputs = {
  'ts-from'(v) { ui.range = { ...ui.range, from: v || '' }; refresh(); },
  'ts-to'(v) { ui.range = { ...ui.range, to: v || '' }; refresh(); },
};

// ------------------------------------------------------------------ exports (lot 8 du 23/11, 8.2 et 8.3)
// Deux boutons côte à côte, aux noms bien différents : FEUILLE À PARTAGER (feuille KPI, image ou PDF) et EXPORT POUR UNE
// IA (fichier texte avec un prompt de coaching). Les deux suivent les filtres de l'écran (période, source, jeu, exercice).
const ex = { open: null, busy: false, msg: '' };
export function presetExports(state = {}) { Object.assign(ex, { open: null, busy: false, msg: '' }, state); }
function exportBlock() {
  const panel = ex.open === 'sheet'
    ? `<div class="btns two"><button type="button" class="btn" data-act="ts-sheet" data-arg="png" ${ex.busy ? 'disabled' : ''}>${ico('image')} IMAGE</button><button type="button" class="btn" data-act="ts-sheet" data-arg="pdf" ${ex.busy ? 'disabled' : ''}>${ico('download')} PDF</button></div>`
    : ex.open === 'ai'
      ? `<p class="note">Un fichier texte : en tête, la consigne pour l'IA (coach de fléchettes), puis tes chiffres sur la période choisie. Partage-le ou colle-le dans ChatGPT, Claude, Gemini…</p>
        <div class="btns two"><button type="button" class="btn" data-act="ts-ai" data-arg="share" ${ex.busy ? 'disabled' : ''}>${ico('download')} PARTAGER LE FICHIER</button><button type="button" class="btn ghost" data-act="ts-ai" data-arg="copy" ${ex.busy ? 'disabled' : ''}>COPIER LE TEXTE</button></div>` : '';
  return `<div class="sec">Exporter${infoBtn('ts-export')}</div>
    ${infoBox('ts-export', '<b>Feuille à partager</b> : une page A4 (image ou PDF) avec la précision, le groupement, la courbe, les tendances, les badges et la carte de chaleur. <b>Export pour une IA</b> : un fichier texte à donner à une IA pour qu\'elle t\'analyse et te propose un plan d\'entraînement. Les deux suivent les filtres choisis (période, entraînement ou parties, jeu, exercice).')}
    <div class="btns two xbtns"><button type="button" class="btn" data-act="ts-export" data-arg="sheet" aria-pressed="${ex.open === 'sheet'}">${ico('image')} FEUILLE À PARTAGER</button><button type="button" class="btn" data-act="ts-export" data-arg="ai" aria-pressed="${ex.open === 'ai'}">${ico('data')} EXPORT POUR UNE IA</button></div>
    ${panel}${ex.msg ? `<p class="note" role="status">${esc(ex.msg)}</p>` : ''}`;
}

/** Données des deux exports, sur les filtres de l'écran. */
export function exportData(pid = ui.player) {
  const p = playerById(pid);
  const b = bounds();
  const sessions = ui.source === 'parties' ? [] : sessionsOf(pid);
  const aimed = sessions.filter(r => !isGameSession(r));
  const parts = aimed.map(r => setPart(r));
  const hits = parts.reduce((n, a) => n + a.hits, 0), tN = parts.reduce((n, a) => n + a.darts, 0);
  const spreads = parts.filter(a => a.points >= 3 && a.spread !== null).map(a => a.spread);
  const spread = spreads.length ? spreads.reduce((a, c) => a + c, 0) / spreads.length : null;
  const games = ui.source === 'entrainements' ? [] : gamesOf(pid);
  const lv = levelOf(allTrainings(), pid).level;
  const h = honoursOf(pid);
  const free = [...sessions.filter(isGameSession).flatMap(dartsOfSet), ...games.flatMap(g => gameDarts(g, pid))];
  const approx = parts.reduce((n, x) => n + (x.approx || 0), 0), noPos = parts.reduce((n, x) => n + (x.offNoPos || 0), 0);
  const entryOf = r => { const withPos = r.darts.filter(d => Array.isArray(d.pos)).length; return withPos === r.darts.length ? 'cible' : withPos ? 'mixte' : 'pavé'; };
  const setsIds = [...new Set(sessions.flatMap(r => setsUsed(r)))].filter(Boolean);
  const ps = games.length ? playerStats(games, pid) : null;
  return {
    now: Date.now(), player: p.name, level: LEVELS[lv], period: b.label === 'tout' ? 'toute la période' : b.label, source: ui.source,
    sourceLabel: ui.source === 'parties' ? 'parties de soirée' : ui.source === 'deux' ? 'entraînement et soirée' : 'entraînement',
    sets: setsIds.map(id => anySetById(id)).filter(Boolean).map(x => ({ name: x.name, summary: dartSetSummary(x) })),
    summary: { sessions: sessions.length, darts: sessions.reduce((n, r) => n + dartsOfSet(r).length, 0), dist: distOf(parts), spread, rate: tN ? hits / tN : null, approx, noPos },
    trends: trendRows(sessions),
    exercises: ALL_EXERCISES.map(k => { const list = sessions.filter(r => r.exercise === k); if (!list.length) return null; const vals = list.map(r => sessionValue(r, an(r))).filter(Boolean); const best = vals.length ? vals.reduce((m, v) => ((v.dir > 0 ? v.v > m.v : v.v < m.v) ? v : m)) : null; return { name: EXERCISES[k].name, n: list.length, last: fmtValue(vals[vals.length - 1]), best: fmtValue(best), goal: goalOf(k, lv) ? goalText(k, lv) : '' }; }).filter(Boolean),
    sessions: sessions.map(r => { const a = an(r), x = setPart(r, a), bias = a.messages.find(m => m.kind === 'bias'); const sv = sessionValue(r, a);
      return { at: r.startedAt, title: (EXERCISES[r.exercise] || EXERCISES.libre).name, sets: setsUsed(r).map(id => (id ? (anySetById(id) || { name: '?' }).name : 'sans jeu noté')).join(' puis '), darts: r.darts.length,
        result: sv ? `${fmtValue(sv)} (${sv.label.toLowerCase()})` : '—', dist: x.dist, spread: x.points >= 3 ? x.spread : null, rate: x.rate, bias: bias ? bias.text.replace(/^Tes fléchettes partent /, '').replace(/\.$/, '') : '', entry: entryOf(r), notes: r.note || '',
        dartsText: r.darts.map(trainingDartLabel).join(' ') }; }),
    games: ps ? { n: games.length, average: ps.average, tripleRate: ps.tripleRate ?? null, doubleRate: (ds => (ds.length ? ds.filter(x => x.multiplier === 2).length / ds.length : null))(games.flatMap(g => gameDarts(g, pid))), finishRate: ps.doubleRate ?? null,
      list: games.map(g => { const s1 = playerStats([g], pid); return { at: g.startedAt, label: `${g.config.startScore} ${g.config.outMode === 'single' ? 'simple' : 'double'} · ${g.config.players.length} joueurs`, average: s1.average, result: s1.won ? 'gagnée' : g.abandoned ? 'abandonnée' : 'perdue' }; }) } : null,
    badges: h.badges.map(x => ({ name: TRAIN_BADGES[x.key].name, tier: x.tier, tierName: TIER_NAMES[x.tier], value: x.value === null ? '—' : String(Math.round(x.value * 100) / 100) })),
    kpis: [{ label: 'Précision', value: cm(distOf(parts)) }, { label: 'Groupement', value: cm(spread) }, { label: 'Dans la cible', value: pctOf(tN ? hits / tN : null) }, { label: 'Séances', value: String(sessions.length) }, { label: 'Fléchettes', value: String(sessions.reduce((n, r) => n + r.darts.length, 0)) }],
    curve: points(pid, 'prec').map(x => ({ at: x.at, v: x.v })),
    heatFree: free,
    approx: approx || noPos ? `≈ ${approx} fléchette(s) au pavé placée(s) au centre de leur case ; ${noPos} hors cible sans position.` : '',
  };
}
const cm = mm => (mm === null || mm === undefined ? '—' : `${dec1(mm / 10)} cm`);

const bytesOf = url => { const s = atob(url.slice(url.indexOf(',') + 1)); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
async function exportSheet(kind) {
  const d = exportData();
  const hc = heatCounts(d.heatFree);
  let max = 0;
  for (let s2 = 1; s2 <= 20; s2++) for (const [k, r] of [[`${s2}`, 'i'], [`${s2}`, 'o'], [`T${s2}`, ''], [`D${s2}`, '']]) max = Math.max(max, hc.get(k, r));
  max = Math.max(max, hc.get('25'), hc.get('50'));
  const scale = heatScale();
  await sheetFonts();
  const pages = drawTrainReport({ ...d, heat: (k, r) => { const c = hc.get(k, r); return max && c ? Math.pow(c / max, 0.6) : 0; }, heatTotal: hc.total - hc.off, scale,
    heatLegend: `Échelle : ${HEAT_LABELS[scale].toLowerCase()} ; gris tramé : jamais touché.`, badges: d.badges, trends: d.trends });
  const base = trainReportBase(d.now);
  const f = kind === 'pdf'
    ? { name: `${base}.pdf`, mime: 'application/pdf', bytes: pdfFromJpegs(pages.map(c => ({ jpeg: bytesOf(c.toDataURL('image/jpeg', 0.9)), w: c.width, h: c.height })), { title: 'Entraînement Strela' }) }
    : { name: `${base}.png`, mime: 'image/png', bytes: bytesOf(pages[0].toDataURL('image/png')) };
  return deliverFile(f);
}

Object.assign(actions, {
  'ts-export'(k) { ex.open = ex.open === k ? null : k; ex.msg = ''; refresh(); },
  async 'ts-sheet'(kind) {
    ex.busy = true; ex.msg = ''; refresh();
    try { const m = await exportSheet(kind === 'pdf' ? 'pdf' : 'png'); ex.msg = m || ''; } catch (e) { ex.msg = `Export impossible : ${(e && e.message) || e}.`; }
    ex.busy = false; refresh();
  },
  async 'ts-ai'(how) {
    const d = exportData();
    const text = buildAiExport({ ...d, player: { name: d.player, level: d.level } });
    ex.busy = true; ex.msg = ''; refresh();
    try {
      if (how === 'copy') { await navigator.clipboard.writeText(text); ex.msg = 'Texte copié : colle-le dans une IA.'; }
      else { const m = await deliverFile({ name: aiFileName(Date.now()), mime: 'text/plain', bytes: new TextEncoder().encode(text) }); ex.msg = m ? m.replace(/^Image enregistrée/, 'Fichier enregistré').replace(/^Image partagée/, 'Fichier partagé').replace(/^Image/, 'Fichier') : ''; }
    } catch (e) { ex.msg = `Export impossible : ${(e && e.message) || e}.`; }
    ex.busy = false; refresh();
  },
});
