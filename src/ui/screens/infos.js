// Strela — refonte des infos (0.26.0, proposition A « deux espaces » choisie par Guillaume le 26/11/2026,
// docs/refonte-infos.md). Deux espaces rangés à l'identique : PARTIES ('p') et ENTRAÎNEMENT ('e').
//   #/tableau/<p|e>[/<joueur>[/<famille>]]   stats en tuiles, une famille par onglet
//   #/indicateur/<p|e>/<joueur>/<clé>        fiche d'un indicateur : valeur, courbe, meilleures et pires, chacune vers
//                                            sa partie (ou séance) ouverte sur la volée
//   #/records/<p|e>[/<joueur>]               records, chacun vers sa volée
//   #/seances                                historique des séances (même rangement que l'historique des parties)
// Les chiffres X01 et Cricket viennent du même calcul des deux côtés (engine/indicators.js) : un X01 en solo à
// l'entraînement est lu comme une partie à un joueur.
import { store, playerById, allGames, allCkGames, allTrainings, profilePlayer, appModes, saveSetting } from '../store.js';
import { esc, ico, topBar, avg, pct, plural, shortDate, when } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { go, refresh, backFrom } from '../nav.js';
import { inPeriod } from '../../engine/stats.js';
import { x01Sources, cricketSources, x01Indicators, cricketIndicators, exerciseBests } from '../../engine/indicators.js';
import { levelOf, LEVELS, sessionValue, isGameSession, EXERCISES } from '../../engine/training.js';
import { statsPlayers } from './v2/stats2.js';
import { aimKpis, trainPlayers } from './trainstats.js';
import { fmtValue, sessionTitle, sessionFlags } from './training.js';

// ------------------------------------------------------------------ espace (réglage « statsMode » : 'soiree' | 'train')
/** Espace affiché : 'p' (parties) ou 'e' (entraînement), d'après les modes allumés et le dernier choix. */
export function currentSpace() {
  const m = appModes();
  if (!m.train) return 'p';
  if (!m.soiree) return 'e';
  return store.settings.statsMode === 'train' ? 'e' : 'p';
}
const setSpace = sp => saveSetting('statsMode', sp === 'e' ? 'train' : 'soiree');
const SPACE = { p: 'Parties', e: 'Entraînement' };

/** Bascule PARTIES | ENTRAÎNEMENT (rien si un seul mode est allumé). `href(sp)` : adresse de l'autre espace (ou action). */
export function spaceSwitch(sp, href = null, cls = '') {
  const m = appModes();
  if (!(m.train && m.soiree)) return '';
  const one = (k, icon) => (href
    ? `<a role="tab" class="${k === sp ? 'on' : ''}" aria-selected="${k === sp}" href="${href(k)}">${ico(icon)} ${SPACE[k].toUpperCase()}</a>`
    : `<button type="button" role="tab" class="${k === sp ? 'on' : ''}" aria-selected="${k === sp}" data-act="space" data-arg="${k}">${ico(icon)} ${SPACE[k].toUpperCase()}</button>`);
  return `<nav class="space ${cls}" role="tablist" aria-label="Espace">${one('p', 'target')}${one('e', 'sniper')}</nav>`;
}

// ------------------------------------------------------------------ données
/** Adresse d'une source (partie, Cricket, séance), ouverte sur sa volée quand il y en a une. */
export function refHref(ref) {
  if (!ref) return '';
  const v = ref.visit !== undefined ? `/v${ref.visit + 1}` : '';
  if (ref.kind === 'game') return `#/partie/${ref.id}${v}`;
  if (ref.kind === 'ck') return `#/cricket/partie/${ref.id}`;
  return `#/entrainement/seance/${ref.id}${v}`;
}
/** « 25/11 · 501 · tour 4 » (partie) ou « 25/11 · 501 · volée 2 » (séance). */
function srcText(x, sp) {
  if (!x) return '';
  const parts = [shortDate(x.at)];
  if (x.startScore) parts.push(String(x.startScore));
  if (x.legs && x.leg) parts.push(`manche ${x.leg}`);
  if (x.tour) parts.push(`${sp === 'e' ? 'volée' : 'tour'} ${x.tour}`);
  return parts.join(' · ');
}
const PERIODS = [['7j', '7 J'], ['30j', '30 J'], ['tout', 'TOUT']];
const ui = { period: 'tout' };

function playersOf(sp) {
  return sp === 'e' ? trainPlayers() : statsPlayers();
}
function pickPlayer(sp, id) {
  const list = playersOf(sp);
  if (id && list.some(p => p.id === id)) return id;
  const me = profilePlayer();
  if (me && list.some(p => p.id === me.id)) return me.id;
  return list[0] ? list[0].id : null;
}

/** Tous les chiffres d'un joueur dans un espace, sur la période choisie (`period` : '7j', '30j', 'tout'). */
function dataOf(sp, pid, period = ui.period) {
  const trs = inPeriod(allTrainings(), period);
  const src = { games: inPeriod(allGames(), period), ckGames: inPeriod(allCkGames(), period), trainings: trs };
  const x = x01Indicators(x01Sources(sp, src, pid), pid);
  const c = cricketIndicators(cricketSources(sp, src, pid), pid);
  const mine = trs.filter(r => r.player === pid && !r.excluded);
  return { sp, pid, x, c, ex: sp === 'e' ? exerciseBests(mine, pid) : [], aim: sp === 'e' ? aimKpis(mine) : null, sessions: mine.length };
}

// ------------------------------------------------------------------ indicateurs
const n1 = v => avg(v);
const n0 = v => (v === null || v === undefined ? '—' : String(Math.round(v)));
const dist = v => (v === null || v === undefined ? '—' : `${avg(v / 10)}<small> cm</small>`);
// fam : famille ; label ; v(d) : valeur affichée ; sub(d) : ligne du bas ; ser : clé de la série (courbe) ; dir : 1 plus c'est
// mieux, -1 moins c'est mieux ; rec(d) : valeur avec sa source ; list : 'visits' (meilleures et pires volées), 'ck' ;
// sp : espace où elle existe (les deux sinon) ; info : explication de la fiche.
const IND = {
  average: { fam: 'score', label: 'Moyenne / 3 fl.', v: d => n1(d.x.average), ser: 'average', dir: 1, fmt: n1, sub: d => (d.x.played ? plural(d.x.played, d.sp === 'e' ? 'séance' : 'partie', d.sp === 'e' ? 'séances' : 'parties') : 'aucune'), info: 'Points marqués pour 3 fléchettes, sur toutes les volées (un bust compte 0).' },
  first9: { fam: 'score', label: '9 premières fl.', v: d => n1(d.x.first9), ser: 'first9', dir: 1, fmt: n1, sub: () => 'moyenne / 3 fl.', info: 'Moyenne sur 3 fléchettes des 3 premières volées de chaque manche : le rythme du début, avant la finition.' },
  bestAverage: { fam: 'score', label: 'Meilleure moyenne', v: d => (d.x.bestAverage ? n1(d.x.bestAverage.value) : '—'), rec: d => d.x.bestAverage, ser: 'average', dir: 1, fmt: n1, info: 'La meilleure moyenne sur 3 fléchettes d\'une partie finie.' },
  bestFirst9: { fam: 'score', label: 'Meilleur départ', v: d => (d.x.bestFirst9 ? n1(d.x.bestFirst9.value) : '—'), rec: d => d.x.bestFirst9, ser: 'first9', dir: 1, fmt: n1, info: 'La meilleure moyenne des 9 premières fléchettes d\'une partie.' },
  bestVisit: { fam: 'volees', label: 'Meilleure volée', v: d => (d.x.bestVisit ? String(d.x.bestVisit.value) : '—'), rec: d => d.x.bestVisit, ser: 'best', dir: 1, fmt: n0, list: 'visits', info: 'La volée de 3 fléchettes qui a rapporté le plus (bust exclus).' },
  tons: { fam: 'volees', label: '100+ · 140+ · 180', v: d => `${d.x.ton} · ${d.x.ton40} · ${d.x.max}`, sub: d => `${plural(d.x.tons, 'volée', 'volées')} à 100 ou plus`, ser: 'tons', dir: 1, fmt: n0, small: true, info: 'Volées de 100 à 139, de 140 à 179, et à 180 (le maximum).' },
  worstVisit: { fam: 'volees', label: 'Pire volée', v: d => (d.x.worstVisit ? String(d.x.worstVisit.value) : '—'), rec: d => d.x.worstVisit, ser: 'worst', dir: 1, fmt: n0, list: 'worst', info: 'La volée complète (3 fléchettes) la plus basse, sans les bust ni la volée de finition.' },
  busts: { fam: 'volees', label: 'Bust', v: d => String(d.x.busts), sub: d => (d.x.bustsPerGame === null ? '' : `${avg(d.x.bustsPerGame)} par ${d.sp === 'e' ? 'séance' : 'partie'}`), ser: 'busts', dir: -1, fmt: n0, info: 'Volées annulées pour avoir dépassé le reste (ou laissé 1 en sortie double).' },
  checkout: { fam: 'finition', label: 'Réussite au double de fin', v: d => pct(d.x.checkoutRate), sub: d => `${d.x.checkouts} sur ${plural(d.x.checkoutChances, 'chance', 'chances')}`, ser: 'checkoutRate', dir: 1, fmt: pct, info: 'Volées commencées avec un reste qu\'on pouvait finir en 3 fléchettes, et part de celles qui ont fini.' },
  bestFinish: { fam: 'finition', label: 'Plus grosse finition', v: d => (d.x.bestFinish ? String(d.x.bestFinish.value) : '—'), rec: d => d.x.bestFinish, dir: 1, fmt: n0, info: 'Le plus grand reste fini en une volée.' },
  shortestLeg: { fam: 'finition', label: 'Manche la plus courte', v: d => (d.x.shortestLeg ? `${d.x.shortestLeg.value}<small> fl.</small>` : '—'), rec: d => d.x.shortestLeg, dir: -1, fmt: n0, info: 'Le moins de fléchettes pour gagner une manche.' },
  triples: { fam: 'precision', label: 'Triples', v: d => pct(d.x.tripleRate), sub: () => 'des fléchettes', ser: 'tripleRate', dir: 1, fmt: pct, info: 'Part des fléchettes plantées dans un triple.' },
  doubles: { fam: 'precision', label: 'Doubles touchés', v: d => pct(d.x.doubleHitRate), sub: () => 'des fléchettes (50 compris)', ser: 'doubleHitRate', dir: 1, fmt: pct, info: 'Part des fléchettes plantées dans un double, le 50 compris (la réussite au double de fin est un autre chiffre, famille Finition).' },
  bulls: { fam: 'precision', label: 'Bulls (25 · 50)', v: d => String(d.x.bulls), sub: () => 'fléchettes au centre', dir: 1, fmt: n0, info: 'Fléchettes dans le 25 ou le 50.' },
  off: { fam: 'precision', label: 'Hors cible', v: d => pct(d.x.offRate), sub: () => 'des fléchettes', dir: -1, fmt: pct, info: 'Part des fléchettes tombées hors de la cible.' },
  mpr: { fam: 'cricket', label: 'MPR (marques / volée)', v: d => (d.c.mpr === null ? '—' : d.c.mpr.toFixed(2).replace('.', ',')), sub: d => plural(d.c.played, d.sp === 'e' ? 'séance' : 'partie', d.sp === 'e' ? 'séances' : 'parties'), ser: 'mpr', cser: true, dir: 1, fmt: v => (v === null ? '—' : v.toFixed(2).replace('.', ',')), info: 'Marques par volée de 3 fléchettes au Cricket.' },
  ckBest: { fam: 'cricket', label: 'Meilleure volée', v: d => (d.c.bestVisit ? `${d.c.bestVisit.value}<small> marq.</small>` : '—'), rec: d => d.c.bestVisit, ser: 'best', cser: true, dir: 1, fmt: n0, list: 'ck', info: 'La volée de Cricket qui a donné le plus de marques.' },
  ckWon: { fam: 'cricket', sp: 'p', label: 'Victoires au Cricket', v: d => (d.c.played ? pct(d.c.won / d.c.played) : '—'), sub: d => `${d.c.won} sur ${d.c.played}`, info: 'Parties de Cricket gagnées.' },
  won: { fam: 'resultats', sp: 'p', label: 'Victoires', v: d => (d.x.played ? pct(d.x.won / d.x.played) : '—'), sub: d => `${d.x.won} sur ${plural(d.x.played, 'partie', 'parties')} X01`, info: 'Parties X01 gagnées.' },
  played: { fam: 'resultats', sp: 'p', label: 'Parties jouées', v: d => String(d.x.played + d.c.played), sub: d => `${d.x.played} X01 · ${d.c.played} Cricket` },
  level: { fam: 'exercices', sp: 'e', label: 'Niveau', v: d => `<span class="lvw">${LEVELS[levelOf(allTrainings(), d.pid).level]}</span>`, sub: d => plural(d.sessions, 'séance', 'séances'), href: () => '#/entrainement', info: 'Le niveau de l\'entraînement coaché.' },
  prec: { fam: 'exercices', sp: 'e', label: 'Précision', v: d => dist(d.aim.prec), sub: () => 'écart moyen à la cible', dir: -1 },
  rate: { fam: 'exercices', sp: 'e', label: 'Dans la cible', v: d => pct(d.aim.rate), sub: d => plural(d.aim.n, 'exercice', 'exercices'), dir: 1 },
  spread: { fam: 'exercices', sp: 'e', label: 'Groupement', v: d => dist(d.aim.spread), sub: () => 'moyen', dir: -1 },
};
const FAMS = {
  p: [['score', 'Score'], ['volees', 'Volées'], ['finition', 'Finition'], ['precision', 'Précision'], ['cricket', 'Cricket'], ['resultats', 'Résultats']],
  e: [['score', 'Score'], ['volees', 'Volées'], ['finition', 'Finition'], ['precision', 'Précision'], ['cricket', 'Cricket'], ['exercices', 'Exercices']],
};
const keysOf = (sp, fam) => Object.keys(IND).filter(k => IND[k].fam === fam && (!IND[k].sp || IND[k].sp === sp));

/** Série d'un indicateur (une valeur par partie ou séance, de la plus ancienne à la plus récente). */
function seriesOf(d, k) {
  const def = IND[k];
  if (!def || !def.ser) return [];
  return (def.cser ? d.c.series : d.x.series).filter(s => s[def.ser] !== null && s[def.ser] !== undefined).map(s => ({ v: s[def.ser], at: s.at, ref: s.ref, startScore: s.startScore }));
}
/** Tendance : moyenne des 3 dernières contre celles d'avant (au moins 2 avant). */
function trend(ser, dir) {
  if (ser.length < 5) return '';
  const m = l => l.reduce((a, s) => a + s.v, 0) / l.length;
  const d = m(ser.slice(-3)) - m(ser.slice(0, -3));
  if (Math.abs(d) < 1e-9) return '';
  const good = d * dir > 0;
  return `<span class="ktr ${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${good ? 'mieux' : 'moins bien'}</span>`;
}
function spark(ser) {
  if (ser.length < 2) return '';
  const vals = ser.slice(-12).map(s => s.v);
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1, w = 160, h = 28;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - mn) / r) * (h - 6)).toFixed(1)}`);
  const [lx, ly] = pts[pts.length - 1].split(',').map(Number);
  return `<svg class="kspark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--dim)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><rect x="${lx - 3}" y="${ly - 3}" width="6" height="6" fill="var(--fg)"/></svg>`;
}
function tile(d, k) {
  const def = IND[k];
  const ser = seriesOf(d, k);
  const r = def.rec ? def.rec(d) : null;
  const sub = r ? srcText(r, d.sp) : def.sub ? def.sub(d) : '';
  const href = def.href ? def.href(d) : `#/indicateur/${d.sp}/${encodeURIComponent(d.pid)}/${k}`;
  return `<a class="ktile${def.small ? ' sm' : ''}" href="${href}" data-k="${k}"><small>${def.label}</small><b>${def.v(d)}</b>${def.dir && !def.rec ? trend(ser, def.dir) : ''}${spark(ser)}<span class="ksrc"><span class="ell">${sub}</span>${ico('chev')}</span></a>`;
}
function exTile(d, row) {
  return `<a class="ktile" href="#/indicateur/e/${encodeURIComponent(d.pid)}/ex-${row.key}" data-k="ex-${row.key}"><small>${esc(row.name)}</small><b>${fmtValue({ v: row.last.value, fmt: row.fmt })}</b>
    <span class="ktr">meilleur : ${fmtValue({ v: row.best.value, fmt: row.fmt })}</span><span class="ksrc"><span class="ell">${esc(row.label)} · ${plural(row.count, 'séance', 'séances')}</span>${ico('chev')}</span></a>`;
}

// ------------------------------------------------------------------ en-tête commun (bascule, joueur, période)
function playerChips(sp, pid, base) {
  const list = playersOf(sp);
  if (list.length < 2) return '';
  return `<div class="pchips kchips">${list.map(p => `<a class="pchip" href="${base(p.id)}" aria-pressed="${p.id === pid}">${avatarHtml(p, 30)}<span class="nm">${esc(p.name)}</span></a>`).join('')}</div>`;
}
const periodSeg = () => `<div class="seg sm kper">${PERIODS.map(([k, l]) => `<button type="button" data-act="ind-period" data-arg="${k}" aria-pressed="${ui.period === k}">${l}</button>`).join('')}</div>`;
const noPlayer = title => `<div class="screen">${topBar(title, '#/')}<div class="empty"><div class="big">AUCUN JOUEUR</div><p>Crée d'abord un joueur.</p><a class="btn primary" href="#/joueur/nouveau">CRÉER UN JOUEUR</a></div></div>`;

// ------------------------------------------------------------------ #/tableau
/** Stats en tuiles : « p|e[/joueur[/famille]] ». */
export function dashboardScreen(arg = '') {
  const [spArg, pidArg, famArg] = String(arg || '').split('/').map(decodeURIComponent);
  const sp = spArg === 'e' || spArg === 'p' ? spArg : currentSpace();
  const pid = pickPlayer(sp, pidArg);
  if (!pid) return noPlayer('Stats');
  if (spArg !== sp || pidArg !== pid) { go(`#/tableau/${sp}/${encodeURIComponent(pid)}${famArg ? `/${famArg}` : ''}`, { replace: true }); return ''; }
  if (currentSpace() !== sp && appModes().train && appModes().soiree) setSpace(sp);
  const fams = FAMS[sp];
  const fam = fams.some(f => f[0] === famArg) ? famArg : 'score';
  const d = dataOf(sp, pid);
  const base = id => `#/tableau/${sp}/${encodeURIComponent(id)}/${fam}`;
  const tabs = `<nav class="kfams" role="tablist">${fams.map(([k, l]) => `<a role="tab" href="#/tableau/${sp}/${encodeURIComponent(pid)}/${k}" aria-selected="${k === fam}">${l.toUpperCase()}</a>`).join('')}</nav>`;
  const tiles = [...keysOf(sp, fam).map(k => tile(d, k)), ...(fam === 'exercices' ? d.ex.map(row => exTile(d, row)) : [])];
  const empty = fam === 'cricket' && !d.c.played ? `Aucun Cricket ${sp === 'e' ? 'en solo' : ''} sur la période.`
    : fam === 'exercices' && !d.sessions ? 'Aucune séance sur la période.'
      : !['cricket', 'exercices', 'resultats'].includes(fam) && !d.x.played ? `Aucun X01 ${sp === 'e' ? 'en solo' : ''} sur la période.` : '';
  const detail = sp === 'e' ? `#/joueur/${encodeURIComponent(pid)}/entrainement` : `#/joueur/${encodeURIComponent(pid)}/parties`;
  return `<div class="screen dash">${topBar('Stats', backFrom('#/'), `<a class="act" href="#/records/${sp}/${encodeURIComponent(pid)}">${ico('trophy')}</a>`)}
    <div class="dhead">${spaceSwitch(sp, k => `#/tableau/${k}/${encodeURIComponent(pid)}/${fam}`, 'sm')}${playerChips(sp, pid, base)}${periodSeg()}</div>
    ${tabs}
    ${empty ? `<p class="note pad">${empty}</p>` : ''}
    <div class="kgrid">${tiles.join('')}</div>
    <div class="pad"><a class="btn ghost dmore" href="${detail}">${ico('stats')} TOUT LE DÉTAIL</a></div></div>`;
}

// ------------------------------------------------------------------ #/indicateur
function chartSvg(ser, fmt, dir) {
  if (ser.length < 2) return '';
  const w = 360, h = 160, vals = ser.map(s => s.v);
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (mn === mx) { mn -= 1; mx += 1; }
  const x = i => 14 + (i / (ser.length - 1)) * (w - 28), y = v => h - 18 - ((v - mn) / (mx - mn)) * (h - 40);
  const bestI = vals.indexOf(dir < 0 ? Math.min(...vals) : Math.max(...vals));
  const line = ser.map((s, i) => `${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ');
  const dots = ser.map((s, i) => {
    const big = i === bestI;
    const ly = y(s.v) < 22 ? y(s.v) + 20 : y(s.v) - 9;
    const lab = big ? `<text x="${x(i) + (i > ser.length / 2 ? -9 : 9)}" y="${ly}" text-anchor="${i > ser.length / 2 ? 'end' : 'start'}" class="clab">${esc(String(fmt(s.v)).replace(/<[^>]+>/g, ''))}</text>` : '';
    return `<a href="${refHref(s.ref)}" aria-label="${esc(shortDate(s.at))}"><rect x="${x(i) - 11}" y="${y(s.v) - 11}" width="22" height="22" fill="transparent"/><rect x="${x(i) - (big ? 6 : 3.5)}" y="${y(s.v) - (big ? 6 : 3.5)}" width="${big ? 12 : 7}" height="${big ? 12 : 7}" class="${big ? 'cbig' : 'cdot'}"/></a>${lab}`;
  }).join('');
  return `<div class="kchart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Courbe"><polyline points="${line}" fill="none" stroke="var(--fg)" stroke-width="1.5"/>${dots}</svg>
    <div class="kax"><span>${shortDate(ser[0].at)}</span><span>${shortDate(ser[ser.length - 1].at)}</span></div>
    <p class="note">Un point par ${'partie ou séance'} : un appui l'ouvre.</p></div>`;
}
const visitLine = (x, sp, fmt = n0) => `<li><a href="${refHref(x.ref)}"><b class="kn">${fmt(x.value)}</b><span class="kt">${esc(x.darts ? x.darts.map(dartText).join(' ') : '')}<small>${srcText(x, sp)}</small></span>${ico('chev')}</a></li>`;
const gameLine = (s, sp, fmt) => `<li><a href="${refHref(s.ref)}"><b class="kn">${fmt(s.v)}</b><span class="kt">${sp === 'e' ? 'Séance' : 'Partie'}${s.startScore ? ` · ${s.startScore}` : ''}<small>${esc(when(s.at))}</small></span>${ico('chev')}</a></li>`;
function dartText(d) {
  if (!d || d.segment === 0) return '0';
  if (d.segment === 25) return d.multiplier === 2 ? '50' : '25';
  return `${d.multiplier === 3 ? 'T' : d.multiplier === 2 ? 'D' : 'S'}${d.segment}`;
}

/** Fiche d'un indicateur : « p|e/joueur/clé ». */
export function indicatorScreen(arg = '') {
  const [sp0, pid0, key] = String(arg || '').split('/').map(decodeURIComponent);
  const sp = sp0 === 'e' ? 'e' : 'p';
  const pid = pickPlayer(sp, pid0);
  if (!pid) return noPlayer('Stats');
  const d = dataOf(sp, pid);
  const back = backFrom(`#/tableau/${sp}/${encodeURIComponent(pid)}`);
  const who = `${esc(playerById(pid).name).toUpperCase()} · ${SPACE[sp].toUpperCase()}`;
  if (key && key.startsWith('ex-')) return exerciseScreen(d, key.slice(3), back, who);
  const def = IND[key];
  if (!def) { go(`#/tableau/${sp}/${encodeURIComponent(pid)}`, { replace: true }); return ''; }
  const r = def.rec ? def.rec(d) : null;
  const ser = seriesOf(d, key);
  const hero = `<div class="khero"><small>${who}</small><b>${def.v(d)}</b>
    ${r ? `<a class="kgo" href="${refHref(r.ref)}">${r.ref.visit !== undefined ? 'VOIR LA VOLÉE' : sp === 'e' ? 'VOIR LA SÉANCE' : 'VOIR LA PARTIE'} ${ico('chev')}<span>${srcText(r, sp)}</span></a>` : def.sub ? `<span class="ksub">${def.sub(d)}</span>` : ''}</div>`;
  let lists = '';
  if (def.list === 'visits' || def.list === 'worst') {
    // Peu de volées : une même volée ne figure pas dans les deux listes (elle reste dans celle de la fiche).
    const key = x => `${x.ref.id}|${x.ref.visit}`;
    const inTop = new Set(d.x.topVisits.map(key)), inWorst = new Set(d.x.worstVisits.map(key));
    const best = d.x.topVisits.filter(x => def.list !== 'worst' || !inWorst.has(key(x))).map(x => visitLine(x, sp)).join('');
    const worst = d.x.worstVisits.filter(x => def.list === 'worst' || !inTop.has(key(x))).map(x => visitLine(x, sp)).join('');
    lists = def.list === 'worst' ? `<div class="sec">Pires volées</div><ul class="klist">${worst}</ul>${best ? `<div class="sec">Meilleures volées</div><ul class="klist">${best}</ul>` : ''}`
      : `<div class="sec">Meilleures volées</div><ul class="klist">${best}</ul>${worst ? `<div class="sec">Pires volées</div><ul class="klist">${worst}</ul>` : ''}`;
  } else if (def.list === 'ck') {
    lists = `<div class="sec">Meilleures volées</div><ul class="klist">${d.c.topVisits.map(x => visitLine(x, sp, v => `${v}`)).join('')}</ul>`;
  } else if (ser.length) {
    const sorted = [...ser].sort((a, b) => (b.v - a.v) * (def.dir || 1) || b.at - a.at).slice(0, 5);
    const recent = [...ser].reverse().slice(0, 5);
    lists = `<div class="sec">Les meilleures</div><ul class="klist">${sorted.map(s => gameLine(s, sp, def.fmt)).join('')}</ul>
      <div class="sec">Les dernières</div><ul class="klist">${recent.map(s => gameLine(s, sp, def.fmt)).join('')}</ul>`;
  } else if (r) {
    lists = '';
  }
  return `<div class="screen kfiche">${topBar(def.label, back, `<span class="act dim">${PERIODS.find(p => p[0] === ui.period)[1]}</span>`)}
    <div class="pad">${hero}${chartSvg(ser, def.fmt || n1, def.dir || 1)}
      ${def.info ? `<p class="note">${def.info}</p>` : ''}${lists}</div></div>`;
}
function exerciseScreen(d, key, back, who) {
  const row = d.ex.find(x => x.key === key);
  const name = (EXERCISES[key] || {}).name || 'Exercice';
  if (!row) return `<div class="screen kfiche">${topBar(name, back)}<p class="note pad">Aucune séance de cet exercice sur la période.</p></div>`;
  const ser = allTrainings().filter(r => r.player === d.pid && r.exercise === key && !r.excluded && !r.stopped && inPeriod([r], ui.period).length)
    .sort((a, b) => a.startedAt - b.startedAt).map(r => { const sv = sessionValue(r); return sv ? { v: sv.v, at: r.startedAt, ref: { kind: 'training', id: r.id } } : null; }).filter(Boolean);
  const fmt = v => fmtValue({ v, fmt: row.fmt });
  const sorted = [...ser].sort((a, b) => (b.v - a.v) * row.dir || b.at - a.at).slice(0, 5);
  return `<div class="screen kfiche">${topBar(name, back)}
    <div class="pad"><div class="khero"><small>${who} · ${esc(row.label).toUpperCase()}</small><b>${fmt(row.best.value)}</b>
      <a class="kgo" href="${refHref(row.best.ref)}">VOIR LA SÉANCE ${ico('chev')}<span>meilleur · ${shortDate(row.best.at)} · dernier : ${fmt(row.last.value)}</span></a></div>
      ${chartSvg(ser, fmt, row.dir)}
      <div class="sec">Les meilleures</div><ul class="klist">${sorted.map(s => gameLine(s, 'e', fmt)).join('')}</ul>
      <div class="sec">Les dernières</div><ul class="klist">${[...ser].reverse().slice(0, 5).map(s => gameLine(s, 'e', fmt)).join('')}</ul></div></div>`;
}

// ------------------------------------------------------------------ #/records
/** Records d'un joueur dans un espace (depuis toujours), chacun vers sa volée, sa partie ou sa séance. */
export function recordsScreen(arg = '') {
  const [spArg, pidArg] = String(arg || '').split('/').map(decodeURIComponent);
  const sp = spArg === 'e' || spArg === 'p' ? spArg : currentSpace();
  const pid = pickPlayer(sp, pidArg);
  if (!pid) return noPlayer('Records');
  if (spArg !== sp || pidArg !== pid) { go(`#/records/${sp}/${encodeURIComponent(pid)}`, { replace: true }); return ''; }
  const d = dataOf(sp, pid, 'tout');
  const bestOf = (ser, k) => ser.filter(s => s[k] !== null && s[k] !== undefined).reduce((m, s) => (!m || s[k] > m[k] ? s : m), null);
  const recs = [];
  const add = (label, value, x, go2 = null) => { if (x) recs.push({ label, value, sub: srcText(x, sp) || shortDate(x.at), href: refHref(x.ref), go: go2 || (x.ref.visit !== undefined ? 'VOIR LA VOLÉE' : sp === 'e' ? 'VOIR LA SÉANCE' : 'VOIR LA PARTIE') }); };
  add('Meilleure volée', d.x.bestVisit && String(d.x.bestVisit.value), d.x.bestVisit);
  add('Meilleure moyenne', d.x.bestAverage && n1(d.x.bestAverage.value), d.x.bestAverage);
  add('Plus grosse finition', d.x.bestFinish && String(d.x.bestFinish.value), d.x.bestFinish);
  add('Manche la plus courte', d.x.shortestLeg && `${d.x.shortestLeg.value}<small> fl.</small>`, d.x.shortestLeg);
  add('Meilleur départ (9 fl.)', d.x.bestFirst9 && n1(d.x.bestFirst9.value), d.x.bestFirst9);
  const tons = bestOf(d.x.series, 'tons');
  if (tons && tons.tons > 0) add(`Le plus de 100+ ${sp === 'e' ? 'en une séance' : 'en une partie'}`, String(tons.tons), { at: tons.at, ref: tons.ref, startScore: tons.startScore });
  add('Cricket · meilleure volée', d.c.bestVisit && `${d.c.bestVisit.value}<small> marq.</small>`, d.c.bestVisit);
  const ck = bestOf(d.c.series, 'mpr');
  if (ck) add('Cricket · meilleur MPR', ck.mpr.toFixed(2).replace('.', ','), { at: ck.at, ref: ck.ref });
  for (const row of d.ex) add(row.name, fmtValue({ v: row.best.value, fmt: row.fmt }), row.best, 'VOIR LA SÉANCE');
  const base = id => `#/records/${sp}/${encodeURIComponent(id)}`;
  return `<div class="screen dash">${topBar('Records', backFrom('#/'))}
    <div class="dhead">${spaceSwitch(sp, k => `#/records/${k}/${encodeURIComponent(pid)}`, 'sm')}${playerChips(sp, pid, base)}</div>
    ${recs.length ? `<div class="kgrid recs">${recs.map(x => `<a class="ktile rec" href="${x.href}"><small>${x.label}</small><b>${x.value}</b><span class="kd">${x.sub}</span><span class="ksrc go"><span>${x.go}</span>${ico('chev')}</span></a>`).join('')}</div>
      <p class="note pad">Depuis toujours. Chaque record ouvre ${sp === 'e' ? 'la séance' : 'la partie'} où il a été fait, sur la volée quand il y en a une.</p>`
    : `<div class="empty"><div class="big">AUCUN RECORD</div><p>${sp === 'e' ? 'Fais une séance pour commencer.' : 'Joue une partie pour commencer.'}</p></div>`}</div>`;
}

// ------------------------------------------------------------------ #/seances
const DAYS = ['DIM.', 'LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.'];
const MSHORT = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];
const MONTHS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
const hhmm = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const monthKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}`; };
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(ms, now = Date.now()) {
  const day = x => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y.getTime(); };
  const diff = Math.round((day(now) - day(ms)) / 86400000);
  if (diff === 0) return 'AUJOURD\'HUI';
  if (diff === 1) return 'HIER';
  const d = new Date(ms);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MSHORT[d.getMonth()]}`;
}
const TYPES = [['all', 'Toutes'], ['x01', 'X01'], ['cricket', 'Cricket'], ['ex', 'Exercices'], ['fun', 'Jeux de cible']];
const typeOf = r => (r.exercise === 'x01' || r.exercise === 'cricket' ? r.exercise : (EXERCISES[r.exercise] || {}).fun ? 'fun' : 'ex');
const sf = { player: null, type: 'all', month: 'all', open: null };

/** Historique des séances : groupées par jour, mêmes filtres que l'historique des parties (joueur, type, mois). */
export function sessionsScreen() {
  const all = allTrainings().filter(r => r.darts.length).sort((a, b) => b.startedAt - a.startedAt);
  if (!all.length) {
    return `<div class="screen history2">${topBar('Séances', backFrom('#/'))}<div class="empty"><div class="big">AUCUNE SÉANCE</div><p>Les séances d'entraînement s'afficheront ici, jour par jour.</p><a class="btn primary" href="#/entrainement">${ico('sniper')} S'ENTRAÎNER</a></div></div>`;
  }
  const months = [...new Set(all.map(r => monthKey(r.startedAt)))];
  const list = all.filter(r => (!sf.player || r.player === sf.player) && (sf.type === 'all' || typeOf(r) === sf.type) && (sf.month === 'all' || monthKey(r.startedAt) === sf.month));
  const groups = [];
  for (const r of list) {
    const k = dayKey(r.startedAt);
    if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, rows: [] });
    groups[groups.length - 1].rows.push(r);
  }
  const open = sf.open || new Set(groups.slice(0, 2).map(g => g.key));
  const ids = [...new Set(all.map(r => r.player))].filter(id => store.players.some(p => p.id === id));
  const pchip = id => { const p = playerById(id); return `<button type="button" class="pchip" data-act="se-player" data-arg="${esc(id)}" aria-pressed="${sf.player === id}">${avatarHtml(p, 30)}<span class="nm">${esc(p.name)}</span></button>`; };
  const mchip = k => { const [, m] = k.split('-').map(Number); return `<button type="button" class="chip2" data-act="se-month" data-arg="${k}" aria-pressed="${sf.month === k}">${MSHORT[m]} <small>· ${all.filter(r => monthKey(r.startedAt) === k).length}</small></button>`; };
  let body = '', lastMonth = null;
  for (const g of groups) {
    const first = g.rows[g.rows.length - 1];
    const mk = monthKey(first.startedAt);
    if (mk !== lastMonth) { const [y, m] = mk.split('-').map(Number); body += `<li class="hmonth">${MONTHS[m]} ${y}</li>`; lastMonth = mk; }
    const isOpen = open.has(g.key);
    const who = [...new Set(g.rows.map(r => r.player))];
    const span = g.rows.length > 1 ? `${hhmm(first.startedAt)} – ${hhmm(g.rows[0].startedAt)}` : hhmm(first.startedAt);
    body += `<li class="hgroup card${isOpen ? ' open' : ''}">
      <button type="button" class="hhead" data-act="se-open" data-arg="${esc(g.key)}" aria-expanded="${isOpen}">
        <span class="d">${dayLabel(first.startedAt)}</span><span class="k">${plural(g.rows.length, 'SÉANCE', 'SÉANCES')}</span>
        <span class="avs">${who.slice(0, 3).map(id => avatarHtml(playerById(id), 20)).join('')}</span><span class="sp">${span}</span>${ico(isOpen ? 'up' : 'down')}</button>
      ${isOpen ? `<ul class="hrows">${g.rows.map(sessionRow).join('')}</ul>` : ''}</li>`;
  }
  const filtered = sf.player || sf.type !== 'all' || sf.month !== 'all';
  return `<div class="screen history2">${topBar('Séances', backFrom('#/'), `<span class="act dim" style="font-weight:600">${all.length}</span>`)}
    <div class="hfilters">
      ${ids.length > 1 ? `<div class="pchips"><button type="button" class="pchip all" data-act="se-player" data-arg="" aria-pressed="${!sf.player}"><span class="allbox">${ico('players')}</span><span class="nm">TOUS</span></button>${ids.map(pchip).join('')}</div>` : ''}
      <div class="chips2"><span class="seg-l"></span>${TYPES.map(([k, l]) => `<button type="button" class="chip2" data-act="se-type" data-arg="${k}" aria-pressed="${sf.type === k}">${l.toUpperCase()}</button>`).join('')}</div>
      <div class="chips2 months"><button type="button" class="chip2" data-act="se-month" data-arg="all" aria-pressed="${sf.month === 'all'}">${ico('calendar')} TOUS LES MOIS</button>${months.map(mchip).join('')}</div>
    </div>
    <div class="hsum"><span>${filtered ? `${plural(list.length, 'séance', 'séances')} sur ${all.length}` : plural(all.length, 'séance', 'séances')} · ${plural(groups.length, 'jour', 'jours')}</span>
      <span class="ops"><button type="button" class="lnk" data-act="se-all" data-arg="1">TOUT DÉPLIER</button><button type="button" class="lnk" data-act="se-all" data-arg="0">TOUT REPLIER</button></span></div>
    ${groups.length ? `<ul class="hlist">${body}</ul>` : `<div class="empty" style="padding:28px 16px"><div class="big">AUCUNE SÉANCE</div><p>Aucune séance ne correspond à ces filtres.</p><button type="button" class="btn primary" data-act="se-clear">TOUT AFFICHER</button></div>`}
    <p class="note pad">Une ligne ouvre la séance : ses volées, sa cible, son analyse.</p></div>`;
}
function sessionRow(r) {
  let sv = null;
  try { sv = sessionValue(r); } catch (e) { /* illisible */ }
  const flags = sessionFlags(r);
  return `<li><a class="hrow srow" href="#/entrainement/seance/${esc(r.id)}"><span class="t">${hhmm(r.startedAt)}</span>
    <span class="g ell">${esc(sessionTitle(r))}${flags ? `<small class="ell">${esc(flags)}</small>` : ''}</span>
    <span class="avs">${avatarHtml(playerById(r.player), 22)}</span>
    <span class="r">${sv ? `<b>${fmtValue(sv)}</b>` : isGameSession(r) ? '' : ''}</span></a></li>`;
}

// ------------------------------------------------------------------ actions
export const actions = {
  space(sp) { setSpace(sp); refresh(); },
  'ind-period'(k) { if (PERIODS.some(p => p[0] === k)) ui.period = k; refresh(); },
  'se-player'(id) { sf.player = id && sf.player !== id ? id : null; sf.open = null; refresh(); },
  'se-type'(k) { sf.type = k; sf.open = null; refresh(); },
  'se-month'(k) { sf.month = k; sf.open = null; refresh(); },
  'se-clear'() { sf.player = null; sf.type = 'all'; sf.month = 'all'; sf.open = null; refresh(); },
  'se-open'(key) {
    if (!sf.open) {
      const all = allTrainings().filter(r => r.darts.length).sort((a, b) => b.startedAt - a.startedAt);
      sf.open = new Set([...new Set(all.map(r => dayKey(r.startedAt)))].slice(0, 2));
    }
    if (sf.open.has(key)) sf.open.delete(key); else sf.open.add(key);
    refresh();
  },
  'se-all'(v) { sf.open = v === '1' ? new Set(allTrainings().map(r => dayKey(r.startedAt))) : new Set(); refresh(); },
};
