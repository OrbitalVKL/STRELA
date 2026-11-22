// Strela — stats d'entraînement (lot 8) : #/entrainement/stats.
// Filtres : source (ENTRAÎNEMENTS seuls, PARTIES seules, LES DEUX), joueur, jeu de fléchettes, exercice, période.
// Chiffres, carte de chaleur des impacts (simple intérieur et extérieur à part), courbe de progression (valeur écrite à
// côté de chaque point), comparaison par jeu de fléchettes et par exercice, liste des séances.
// Parties : les fléchettes du joueur dans ses parties X01 (sans cible visée connue : pas de précision ni d'écart) ; un
// jeu de fléchettes n'est noté que pour l'entraînement, le filtre « jeu » ne garde donc que les séances.
import { store, activePlayers, playerById, dartSetById } from '../store.js';
import { esc, ico, topBar, plural, when } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { EXERCISES, COACH_ORDER, analyze, sessionValue, heatCounts, zoneOf, pointsOf } from '../../engine/training.js';
import { gameState } from '../../engine/stats.js';
import { boardSvg } from '../board.js';
import { refresh, backFrom, go } from '../nav.js';
import { infoBtn, infoBox } from '../info.js';
import { fmtValue, sessionTitle } from './training.js';

const dec1 = v => (v === null || v === undefined || Number.isNaN(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const pctOf = v => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);
const DAY = 86400000;
const PERIODS = { '7j': 7, '30j': 30, '90j': 90, tout: null };

// État de l'écran (gardé d'une visite à l'autre, comme les Stats).
const ui = { source: 'entrainements', player: null, set: '', exercise: '', period: 'tout', metric: null, folds: new Set() };
export function presetTrainStats(state = {}) { Object.assign(ui, { source: 'entrainements', player: null, set: '', exercise: '', period: 'tout', metric: null, folds: new Set() }, state); }

const since = () => (PERIODS[ui.period] ? Date.now() - PERIODS[ui.period] * DAY : -Infinity);
const analysisCache = new Map();
const an = r => { const k = `${r.id}:${r.darts.length}:${(r.blocks || []).length}`; if (!analysisCache.has(k)) analysisCache.set(k, analyze(r)); return analysisCache.get(k); };

function sessionsOf(pid) {
  return store.trainings.filter(r => r.player === pid && r.startedAt >= since() && (!ui.set || r.setId === ui.set) && (!ui.exercise || r.exercise === ui.exercise))
    .sort((a, b) => a.startedAt - b.startedAt);
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
const METRICS = {
  rate: { label: 'Précision', fmt: pctOf, pct: true, of: (r, a) => a.rate, info: 'Fléchettes dans la cible visée ÷ fléchettes lancées, séance par séance.' },
  spread: { label: 'Groupement (cm)', fmt: v => dec1(v / 10), of: (r, a) => (a.points >= 3 ? a.spread : null), info: 'Distance moyenne des fléchettes à leur centre, en centimètres sur une vraie cible : plus c\'est bas, plus elles sont groupées.' },
  exercise: { label: 'Résultat', of: (r, a) => { const v = sessionValue(r, a); return v ? v.v : null; }, info: 'Le résultat de l\'exercice : précision, fléchettes pour boucler l\'horloge, moyenne par volée, ou part près du centre.' },
  average: { label: 'Moyenne', fmt: dec1, game: true, info: 'Moyenne sur 3 fléchettes dans chaque partie X01.' },
  triples: { label: 'Triples', fmt: pctOf, pct: true, both: true, info: 'Fléchettes dans un triple ÷ fléchettes lancées.' },
  off: { label: 'Hors cible', fmt: pctOf, pct: true, both: true, info: 'Fléchettes à côté de la cible ÷ fléchettes lancées.' },
};
const metricsFor = () => (ui.source === 'entrainements' ? ['rate', 'spread', ...(ui.exercise ? ['exercise'] : []), 'triples', 'off']
  : ui.source === 'parties' ? ['average', 'triples', 'off'] : ['triples', 'off']);

function exerciseFmt() {
  const ex = EXERCISES[ui.exercise];
  if (!ex) return pctOf;
  if (ex.clock) return v => String(Math.round(v));
  if (ex.metric === 'average') return dec1;
  return pctOf;
}

/** Points de la courbe : [{ at, v, id?, kind }]. */
function points(pid, mk) {
  const rate = (ds, f) => (ds.length ? ds.filter(f).length / ds.length : null);
  const items = [];
  if (ui.source !== 'parties') for (const r of sessionsOf(pid)) items.push({ at: r.startedAt, kind: 't', r, darts: r.darts });
  if (ui.source !== 'entrainements') for (const g of gamesOf(pid)) items.push({ at: g.startedAt, kind: 'g', g, darts: gameDarts(g, pid) });
  items.sort((a, b) => a.at - b.at);
  return items.map(x => {
    let v = null;
    if (mk === 'triples') v = rate(x.darts, d => d.multiplier === 3);
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

function heatBoard(darts) {
  const h = heatCounts(darts);
  let max = 0;
  const keys = [];
  for (let s = 1; s <= 20; s++) keys.push([`${s}`, 'i'], [`${s}`, 'o'], [`T${s}`, ''], [`D${s}`, '']);
  keys.push(['25', ''], ['50', '']);
  for (const [k, r] of keys) max = Math.max(max, h.get(k, r));
  const op = c => (max ? Math.pow(c / max, 0.6) : 0);
  return { svg: boardSvg({ size: 380, heat: (k, r) => op(h.get(k, r)), cls: 'board', label: 'Carte de chaleur des impacts' }), off: h.off, total: h.total };
}

function bySet(sessions) {
  const rows = new Map();
  for (const r of sessions) {
    const k = r.setId || '';
    if (!rows.has(k)) rows.set(k, { k, n: 0, darts: 0, hits: 0, spread: [], });
    const x = rows.get(k), a = an(r);
    x.n++; x.darts += a.darts; x.hits += a.hits; if (a.points >= 3 && a.spread !== null) x.spread.push(a.spread);
  }
  if (rows.size < 1) return '';
  const name = k => (k ? (dartSetById(k) || { name: '?' }).name : 'Sans jeu noté');
  return `<table class="sectab trtab"><thead><tr><th>Jeu</th><th>Séan.</th><th>Fl.</th><th>Préc.</th><th>Grp.</th></tr></thead><tbody>
    ${[...rows.values()].map(x => `<tr><th class="ell">${esc(name(x.k))}</th><td>${x.n}</td><td>${x.darts}</td><td>${pctOf(x.darts ? x.hits / x.darts : null)}</td><td>${x.spread.length ? dec1(x.spread.reduce((a, b) => a + b, 0) / x.spread.length / 10) : '—'}</td></tr>`).join('')}</tbody></table>`;
}

function byExercise(sessions) {
  const rows = [...COACH_ORDER, 'libre'].map(k => {
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
  const tDarts = sessions.flatMap(r => r.darts);
  const gDarts = games.flatMap(g => gameDarts(g, pid));
  const darts = [...tDarts, ...gDarts];
  const analyses = sessions.map(an);
  const hits = analyses.reduce((n, a) => n + a.hits, 0), tN = analyses.reduce((n, a) => n + a.darts, 0);
  const spreads = analyses.filter(a => a.points >= 3 && a.spread !== null).map(a => a.spread);
  const k = (kk, label, value, cls = '') => `<div class="kpi ${cls}" data-k="${kk}"><small>${label}</small><b>${value}</b></div>`;
  const rate = f => (darts.length ? darts.filter(f).length / darts.length : null);
  const kpis = [];
  if (ui.source !== 'parties') {
    kpis.push(k('rate', 'Précision', pctOf(tN ? hits / tN : null), 'hero wide'));
    kpis.push(k('sessions', 'Séances', String(sessions.length)));
    kpis.push(k('spread', 'Groupement moyen', spreads.length ? `${dec1(spreads.reduce((a, b) => a + b, 0) / spreads.length / 10)}<small> cm</small>` : '—'));
  } else {
    const avg3 = gDarts.length ? (gDarts.reduce((n, d) => n + pointsOf(d), 0) / gDarts.length) * 3 : null;
    kpis.push(k('average', 'Moyenne sur 3 fléchettes', dec1(avg3), 'hero wide'));
    kpis.push(k('games', 'Parties', String(games.length)));
  }
  kpis.push(k('darts', 'Fléchettes', ui.source === 'deux' ? `${darts.length}<small> (${tDarts.length} + ${gDarts.length})</small>` : String(darts.length), ui.source === 'deux' ? 'wide' : ''));
  kpis.push(k('triples', 'Triples', pctOf(rate(d => d.multiplier === 3))));
  kpis.push(k('offr', 'Hors cible', pctOf(rate(d => d.segment === 0))));
  if (ui.source !== 'parties') {
    const zs = tDarts.map(zoneOf);
    const si = zs.filter(z => z === 'si').length, se = zs.filter(z => z === 'se').length;
    kpis.push(k('rings', 'Simples int. / ext.', si + se ? `${si}<small> / ${se}</small>` : '—'));
  }
  if (kpis.length % 2 === 0) kpis.push(k('bulls', 'Bulls (25 · 50)', String(darts.filter(d => d.segment === 25).length)));

  const p = playerById(pid);
  const chips = list.length > 1 ? `<div class="chips">${list.map(q => `<button type="button" class="btn chip" data-act="ts-player" data-arg="${esc(q.id)}" aria-pressed="${q.id === pid}">${avatarHtml(q, 38)}<span class="nm">${esc(q.name.split(' ')[0])}</span></button>`).join('')}</div>` : '';
  const sets = store.dartSets.filter(x => !x.archived || store.trainings.some(r => r.setId === x.id));
  const setChips = ui.source === 'parties' ? '' : `<span class="small dim caps">Jeu de fléchettes</span><div class="chips2">
    <button type="button" class="chip2" data-act="ts-set" data-arg="" aria-pressed="${!ui.set}">TOUS</button>
    ${sets.map(x => `<button type="button" class="chip2" data-act="ts-set" data-arg="${esc(x.id)}" aria-pressed="${ui.set === x.id}">${esc(x.name)}</button>`).join('')}</div>`;
  const exChips = ui.source === 'parties' ? '' : `<span class="small dim caps">Exercice</span><div class="chips2">
    <button type="button" class="chip2" data-act="ts-ex" data-arg="" aria-pressed="${!ui.exercise}">TOUS</button>
    ${[...COACH_ORDER, 'libre'].map(x => `<button type="button" class="chip2" data-act="ts-ex" data-arg="${x}" aria-pressed="${ui.exercise === x}">${esc(EXERCISES[x].name)}</button>`).join('')}</div>`;
  const filters = `<div class="seg tsrc">${segBtn('ts-source', 'entrainements', ui.source, 'Entraîn.')}${segBtn('ts-source', 'parties', ui.source, 'Parties')}${segBtn('ts-source', 'deux', ui.source, 'Les deux')}</div>
    <div class="seg tper">${segBtn('ts-period', '7j', ui.period, '7 j')}${segBtn('ts-period', '30j', ui.period, '30 j')}${segBtn('ts-period', '90j', ui.period, '90 j')}${segBtn('ts-period', 'tout', ui.period, 'Tout')}</div>
    ${setChips}${exChips}`;
  const head = `${topBar('Stats d\'entraînement', backFrom('#/entrainement'))}<div class="pad">${chips}
    <div class="sec">Filtres${infoBtn('ts-filters')}</div>
    ${infoBox('ts-filters', '<b>Entraînements</b> : les séances seules. <b>Parties</b> : les fléchettes du joueur dans ses parties X01 (sans cible visée : ni précision, ni groupement). <b>Les deux</b> : toutes les fléchettes, pour les chiffres qui se comparent (triples, hors cible, carte). Le jeu de fléchettes et l\'exercice ne concernent que l\'entraînement.')}
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
  const hb = heatBoard(darts);
  return `<div class="screen trstats">${head}
    <div class="pad">
      <div class="kpis">${kpis.join('')}</div>
      <div class="sec">Progression${infoBtn('ts-curve')}</div>
      ${infoBox('ts-curve', esc(m.info) + ' Chaque point est une séance (ou une partie), dans l\'ordre ; la valeur est écrite au-dessus. Touchez la liste des séances plus bas pour en ouvrir une.')}
      <div class="chips2">${allowed.map(x => `<button type="button" class="chip2" data-act="ts-metric" data-arg="${x}" aria-pressed="${x === mk}">${esc(x === 'exercise' ? (EXERCISES[ui.exercise].clock ? 'Fléchettes' : EXERCISES[ui.exercise].metric === 'average' ? 'Moyenne / volée' : EXERCISES[ui.exercise].metric === 'near' ? 'Près du centre' : 'Résultat') : METRICS[x].label)}</button>`).join('')}</div>
      ${chart(points(pid, mk), fmt, pct, `ts:${pid}:${ui.source}:${mk}`)}
      <div class="sec">Carte de chaleur <span class="n">${hb.total} fl.</span>${infoBtn('ts-heat')}</div>
      ${infoBox('ts-heat', 'Chaque fléchette sur la cible, par zone : plus la zone est claire, plus elle a été touchée. À l\'entraînement, le simple intérieur et le simple extérieur sont comptés à part ; une fléchette de partie (simple sans anneau connu) compte pour moitié dans chacun.')}
      <div class="heatbox">${hb.svg}</div><p class="note center">${plural(hb.off, 'fléchette', 'fléchettes')} hors cible, non dessinée${hb.off > 1 ? 's' : ''}.</p>
      ${ui.source !== 'parties' && sessions.length ? `<div class="sec">Par jeu de fléchettes${infoBtn('ts-sets')}</div>
        ${infoBox('ts-sets', 'Pour comparer les jeux : séances, fléchettes, précision (dans la cible visée) et groupement moyen (cm) avec chaque jeu, sur les filtres choisis.')}${bySet(sessions)}
        <div class="sec">Par exercice</div>${byExercise(sessions)}
        <div class="sec">Séances <span class="n">${sessions.length}</span></div>
        <ul class="trl">${[...sessions].reverse().slice(0, ui.folds.has('all') ? 200 : 10).map(r => `<li><a class="trow" href="#/entrainement/seance/${esc(r.id)}"><span class="l1"><b class="ell">${esc(sessionTitle(r))}</b><span>${when(r.startedAt)}</span></span>
          <span class="l2"><span class="ell">${r.setId && dartSetById(r.setId) ? esc(dartSetById(r.setId).name) : 'sans jeu noté'}${r.stopped ? ' · arrêtée' : ''}</span><b>${fmtValue(sessionValue(r, an(r)))}</b></span></a></li>`).join('')}</ul>
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
