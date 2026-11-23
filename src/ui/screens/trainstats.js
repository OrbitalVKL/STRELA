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
import { store, activePlayers, playerById, dartSetById } from '../store.js';
import { esc, ico, topBar, plural, when } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { EXERCISES, ALL_EXERCISES, GAME_EXERCISES, analyze, sessionValue, zoneOf, pointsOf, setsUsed, setAt, isGameSession, gamePart } from '../../engine/training.js';
import { gameState } from '../../engine/stats.js';
import { refresh, backFrom, go } from '../nav.js';
import { infoBtn, infoBox } from '../info.js';
import { fmtValue, sessionTitle, sessionFlags, heatBoard } from './training.js';

const dec1 = v => (v === null || v === undefined || Number.isNaN(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const dec2 = v => (v === null || v === undefined || Number.isNaN(v) ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ','));
const pctOf = v => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);
const DAY = 86400000;
const PERIODS = { '7j': 7, '30j': 30, '90j': 90, tout: null };

// État de l'écran (gardé d'une visite à l'autre, comme les Stats).
const ui = { source: 'entrainements', player: null, set: '', exercise: '', period: 'tout', metric: null, folds: new Set() };
export function presetTrainStats(state = {}) { Object.assign(ui, { source: 'entrainements', player: null, set: '', exercise: '', period: 'tout', metric: null, folds: new Set() }, state); }

const since = () => (PERIODS[ui.period] ? Date.now() - PERIODS[ui.period] * DAY : -Infinity);
const analysisCache = new Map();
const an = r => { const k = `${r.id}:${r.darts.length}:${(r.blocks || []).length}:${JSON.stringify(r.setChanges || [])}:${r.setId}`; if (!analysisCache.has(k)) analysisCache.set(k, analyze(r)); return analysisCache.get(k); };

function sessionsOf(pid) {
  return store.trainings.filter(r => r.player === pid && !r.excluded && r.startedAt >= since() && (!ui.set || setsUsed(r).includes(ui.set)) && (!ui.exercise || r.exercise === ui.exercise))
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
    return x ? { darts: x.darts, hits: x.hits, spread: x.spread, points: x.points, rate: x.rate } : { darts: 0, hits: 0, spread: null, points: 0, rate: null };
  }
  return { darts: a.darts, hits: a.hits, spread: a.spread, points: a.points, rate: a.rate };
}
function gamesOf(pid) {
  if (ui.set || ui.exercise) return []; // une partie n'a ni jeu de fléchettes noté ni exercice
  return store.games.filter(g => g.config.players.includes(pid) && g.startedAt >= since()).sort((a, b) => a.startedAt - b.startedAt);
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
  rate: { label: 'Précision', fmt: pctOf, pct: true, of: (r, a) => (isGameSession(r) ? null : setPart(r, a).rate), info: 'Fléchettes dans la cible visée ÷ fléchettes lancées, séance par séance (exercices seulement : un jeu n\'a pas de cible imposée).' },
  spread: { label: 'Groupement (cm)', fmt: v => dec1(v / 10), of: (r, a) => { if (isGameSession(r)) return null; const x = setPart(r, a); return x.points >= 3 ? x.spread : null; }, info: 'Distance moyenne des fléchettes à leur centre, en centimètres sur une vraie cible : plus c\'est bas, plus elles sont groupées (exercices seulement).' },
  exercise: { label: 'Résultat', of: (r, a) => (isGameSession(r) ? gameSetPart(r).value : (v => (v ? v.v : null))(sessionValue(r, a))), info: 'Le résultat de l\'exercice : précision, fléchettes pour boucler l\'horloge, moyenne par volée, part près du centre ; en X01, la moyenne sur 3 fléchettes ; au Cricket, les marques par volée.' },
  average: { label: 'Moyenne', fmt: dec1, game: true, info: 'Moyenne sur 3 fléchettes dans chaque partie X01.' },
  triples: { label: 'Triples', fmt: pctOf, pct: true, free: true, info: `Fléchettes dans un triple ÷ fléchettes lancées. ${FREE_AIM}` },
  doubles: { label: 'Doubles', fmt: pctOf, pct: true, free: true, info: `Fléchettes dans un double (le 50 compris) ÷ fléchettes lancées. ${FREE_AIM}` },
  off: { label: 'Hors cible', fmt: pctOf, pct: true, both: true, info: 'Fléchettes à côté de la cible ÷ fléchettes lancées.' },
};
const exIsGame = () => GAME_EXERCISES.includes(ui.exercise);
const metricsFor = () => (ui.source === 'entrainements'
  ? (exIsGame() ? ['exercise', 'triples', 'doubles', 'off'] : ui.exercise ? ['rate', 'spread', 'exercise', 'off'] : ['rate', 'spread', 'triples', 'doubles', 'off'])
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

function chart(pts, fmt, pct, key) {
  if (pts.length < 2) return '<p class="note">Il faut au moins deux séances (ou parties) avec ce chiffre pour tracer la courbe.</p>';
  const H = 180, T = 22, B = 18;
  const step = 44;
  const W = Math.max(300, 48 + (pts.length - 1) * step);
  const xs = i => 24 + i * step;
  const vals = pts.map(p => (pct ? p.v * 100 : p.v));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (pct) { lo = 0; hi = 100; } else { const pad = Math.max(1, (hi - lo) * 0.15); lo = Math.max(0, lo - pad); hi += pad; }
  const y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const line = vals.map((v, i) => `${xs(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const dots = pts.map((p, i) => `<rect class="pt" x="${(xs(i) - 3.5).toFixed(1)}" y="${(y(vals[i]) - 3.5).toFixed(1)}" width="7" height="7"/>
    <text class="pv" x="${xs(i).toFixed(1)}" y="${(y(vals[i]) - 8).toFixed(1)}" text-anchor="middle">${fmt(p.v)}</text>
    <text x="${xs(i).toFixed(1)}" y="${H - 4}" text-anchor="middle">${new Date(p.at).getDate()}/${String(new Date(p.at).getMonth() + 1).padStart(2, '0')}</text>`).join('');
  return `<div class="chartbox"><div class="chscroll" data-hscroll="${esc(key)}"><svg class="chart2" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Courbe de progression">
      <line class="mean" x1="0" x2="${W}" y1="${y(mean).toFixed(1)}" y2="${y(mean).toFixed(1)}"/><polyline class="ln" points="${line}"/>${dots}</svg></div></div>
    <div class="chlegend"><span><i class="lg-ln"></i> ${plural(pts.length, 'point', 'points')}, du plus ancien au plus récent</span><span><i class="lg-mean"></i> moyenne ${pct ? `${Math.round(mean)} %` : fmt(mean)}</span></div>`;
}

// ------------------------------------------------------------------ écran
const segBtn = (act, v, cur, label) => `<button type="button" data-act="${act}" data-arg="${v}" aria-pressed="${cur === v}">${label}</button>`;

const setName = k => (k ? (dartSetById(k) || { name: '?' }).name : 'Sans jeu noté');
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
      if (!rows.has(k)) rows.set(k, { k, n: 0, darts: 0, hits: 0, spread: [] });
      const x = rows.get(k), part = setPart(r, a, a.extra.bySet ? k : null);
      x.n++; x.darts += part.darts; x.hits += part.hits; if (part.points >= 3 && part.spread !== null) x.spread.push(part.spread);
    }
  }
  if (rows.size < 1) return '';
  return `<table class="sectab trtab"><thead><tr><th>Jeu</th><th>Séan.</th><th>Fl.</th><th>Préc.</th><th>Grp.</th></tr></thead><tbody>
    ${[...rows.values()].map(x => `<tr><th class="ell">${esc(setName(x.k))}</th><td>${x.n}</td><td>${x.darts}</td><td>${pctOf(x.darts ? x.hits / x.darts : null)}</td><td>${x.spread.length ? dec1(x.spread.reduce((a, b) => a + b, 0) / x.spread.length / 10) : '—'}</td></tr>`).join('')}</tbody></table>`;
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
  const players = activePlayers();
  const withTr = new Set(store.trainings.map(r => r.player));
  const list = [...players, ...store.players.filter(p => p.archived && withTr.has(p.id))];
  if (!list.length) return `<div class="screen">${topBar('Stats d\'entraînement', backFrom('#/entrainement'))}<div class="empty"><div class="big">AUCUN JOUEUR</div></div></div>`;
  const pid = list.some(p => p.id === ui.player) ? ui.player : (store.trSetup && list.some(p => p.id === store.trSetup.player) ? store.trSetup.player : list[0].id);
  ui.player = pid;
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
    kpis.push(k('rate', 'Précision', pctOf(tN ? hits / tN : null), 'hero wide'));
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
  const freeNote = !free.length ? '<p class="note">Triples, doubles et carte de chaleur : seulement sur les jeux X01 et Cricket (mode Jeux) et les parties, où l\'on vise comme en partie. Sur un exercice, la cible est imposée.</p>' : '';

  const p = playerById(pid);
  const chips = list.length > 1 ? `<div class="chips">${list.map(q => `<button type="button" class="btn chip" data-act="ts-player" data-arg="${esc(q.id)}" aria-pressed="${q.id === pid}">${avatarHtml(q, 38)}<span class="nm">${esc(q.name.split(' ')[0])}</span></button>`).join('')}</div>` : '';
  const sets = store.dartSets.filter(x => !x.archived || store.trainings.some(r => setsUsed(r).includes(x.id)));
  const setChips = ui.source === 'parties' ? '' : `<span class="small dim caps">Jeu de fléchettes</span><div class="chips2">
    <button type="button" class="chip2" data-act="ts-set" data-arg="" aria-pressed="${!ui.set}">TOUS</button>
    ${sets.map(x => `<button type="button" class="chip2" data-act="ts-set" data-arg="${esc(x.id)}" aria-pressed="${ui.set === x.id}">${esc(x.name)}</button>`).join('')}</div>`;
  const exChips = ui.source === 'parties' ? '' : `<span class="small dim caps">Exercice</span><div class="chips2">
    <button type="button" class="chip2" data-act="ts-ex" data-arg="" aria-pressed="${!ui.exercise}">TOUS</button>
    ${ALL_EXERCISES.filter(x => x === ui.exercise || store.trainings.some(r => r.player === pid && r.exercise === x)).map(x => `<button type="button" class="chip2" data-act="ts-ex" data-arg="${x}" aria-pressed="${ui.exercise === x}">${esc(EXERCISES[x].name)}</button>`).join('')}</div>`;
  const filters = `<div class="seg tsrc">${segBtn('ts-source', 'entrainements', ui.source, 'Entraîn.')}${segBtn('ts-source', 'parties', ui.source, 'Parties')}${segBtn('ts-source', 'deux', ui.source, 'Les deux')}</div>
    <div class="seg tper">${segBtn('ts-period', '7j', ui.period, '7 j')}${segBtn('ts-period', '30j', ui.period, '30 j')}${segBtn('ts-period', '90j', ui.period, '90 j')}${segBtn('ts-period', 'tout', ui.period, 'Tout')}</div>
    ${setChips}${exChips}`;
  const head = `${topBar('Stats d\'entraînement', backFrom('#/entrainement'))}<div class="pad">${chips}
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
      <div class="kpis">${kpis.join('')}</div>${freeNote}
      <div class="sec">Progression${infoBtn('ts-curve')}</div>
      ${infoBox('ts-curve', esc(m.info) + ' Chaque point est une séance (ou une partie), dans l\'ordre ; la valeur est écrite au-dessus. Touchez la liste des séances plus bas pour en ouvrir une.')}
      <div class="chips2">${allowed.map(x => `<button type="button" class="chip2" data-act="ts-metric" data-arg="${x}" aria-pressed="${x === mk}">${esc(x === 'exercise' ? exerciseLabel() : METRICS[x].label)}</button>`).join('')}</div>
      ${chart(points(pid, mk), fmt, pct, `ts:${pid}:${ui.source}:${mk}`)}
      ${free.length ? `<div class="sec">Carte de chaleur <span class="n">${hb.total} fl.</span>${infoBtn('ts-heat')}</div>
      ${infoBox('ts-heat', `Chaque fléchette sur la cible, par zone : plus la zone est claire, plus elle a été touchée. ${FREE_AIM} À l'entraînement, le simple intérieur et le simple extérieur sont comptés à part ; une fléchette de partie (simple sans anneau connu) compte pour moitié dans chacun.`)}
      <div class="heatbox">${hb.svg}</div><p class="note center">${plural(hb.off, 'fléchette', 'fléchettes')} hors cible, non dessinée${hb.off > 1 ? 's' : ''}.</p>` : ''}
      ${ui.source !== 'parties' && sessions.length ? `<div class="sec">Par jeu de fléchettes${infoBtn('ts-sets')}</div>
        ${infoBox('ts-sets', 'Pour comparer les jeux : sur les exercices, séances, fléchettes, précision (dans la cible visée) et groupement moyen (cm) ; sur les jeux X01 et Cricket, fléchettes, moyenne sur 3 fléchettes, MPR, part de triples et de doubles. Sur les filtres choisis.')}
        ${aimed.length ? bySet(aimed) : ''}${played.length ? `${aimed.length ? '<p class="small dim caps tsub">En jeu (X01, Cricket)</p>' : ''}${bySetGames(played)}` : ''}
        <div class="sec">Par exercice</div>${byExercise(sessions)}
        <div class="sec">Séances <span class="n">${sessions.length}</span></div>
        <ul class="trl">${[...sessions].reverse().slice(0, ui.folds.has('all') ? 200 : 10).map(r => `<li><a class="trow" href="#/entrainement/seance/${esc(r.id)}"><span class="l1"><b class="ell">${esc(sessionTitle(r))}</b><span>${when(r.startedAt)}</span></span>
          <span class="l2"><span class="ell">${esc(sessionFlags(r))}</span><b>${fmtValue(sessionValue(r, an(r)))}</b></span></a></li>`).join('')}</ul>
        ${sessions.length > 10 && !ui.folds.has('all') ? `<button type="button" class="btn ghost" data-act="ts-all">${ico('down')} LES ${sessions.length} SÉANCES</button>` : ''}` : ''}
    </div></div>`;
}

export const actions = {
  'ts-source'(v) { ui.source = ['entrainements', 'parties', 'deux'].includes(v) ? v : 'entrainements'; refresh(); },
  'ts-period'(v) { ui.period = Object.hasOwn(PERIODS, v) ? v : 'tout'; refresh(); },
  'ts-player'(id) { ui.player = id; refresh(); },
  'ts-set'(id) { ui.set = id || ''; refresh(); },
  'ts-ex'(k) { ui.exercise = EXERCISES[k] ? k : ''; if (ui.exercise) ui.metric = 'exercise'; refresh(); },
  'ts-metric'(k) { ui.metric = k; refresh(); },
  'ts-reset'() { Object.assign(ui, { period: 'tout', set: '', exercise: '' }); refresh(); },
  'ts-all'() { ui.folds.add('all'); refresh(); },
  // Depuis les Stats d'un joueur : ses stats d'entraînement.
  'ts-open'(pid) { ui.player = pid; go('#/entrainement/stats'); },
};
