// Strela — stats contextuelles (lot 9.6 B, docs/lot-9-6.md), JS pur (tests/evolution.test.js).
//
// Chaque mode a ses chiffres : X01 en solo (fiche « Évolution » : partie après partie, comparée aux parties précédentes
// de la période), exercices à cible (précision par secteur visé, dérive, score de l'exercice), multijoueur (ce qui se
// compare entre joueurs, forme du soir). Chaque chiffre a un libellé en clair, une phrase d'explication (i) et un sens
// (`dir` : +1 plus haut = mieux, −1 plus bas = mieux) ; `summaryLine` en tire le résumé en tête d'écran
// (« En progrès sur ta moyenne, en recul sur les busts. »).

import { trainingState, analyze, direction, BIAS_MM, isHit, zoneLabelOf } from './training.js';
import { MISS, BULL } from './darts.js';
import { trend } from './trends.js';

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = xs => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(mean(xs.map(x => (x - m) ** 2))) : null; };
/** Points pour 3 fléchettes d'un ensemble de volées (un bust compte 0). */
const per3 = vs => { const n = vs.reduce((k, v) => k + v.darts.length, 0); return n ? (vs.reduce((k, v) => k + v.scored, 0) / n) * 3 : null; };

// ------------------------------------------------------------------ X01 en solo
/** Paliers de la répartition des volées (adaptés au niveau actuel, ajustables plus tard ; pas de 100+ mis en avant). */
export const TIERS = Object.freeze([
  { k: 't0', from: 0, to: 19, label: 'moins de 20' },
  { k: 't20', from: 20, to: 39, label: '20 à 39' },
  { k: 't40', from: 40, to: 59, label: '40 à 59' },
  { k: 't60', from: 60, to: Infinity, label: '60 et plus' },
]);
export const tierOf = points => TIERS.findIndex(t => points >= t.from && points <= t.to);

/** Seuil de la fin de partie : moyenne au-dessus de ce reste, comparée à celle en dessous. */
export const ENDGAME_FROM = 100;

/**
 * Chiffres d'une partie de X01 en solo (séance `exercise: 'x01'`) :
 * { done, avg, avgNoBust, bustCost, visits, darts, finishVisits, finishDarts, tiers [4], off, offRate, spread, busts,
 *   high, low, finAtt, finHits, finRate, best, worst } — null quand un chiffre n'a pas de sens (rien de mesuré).
 */
export function x01SoloMetrics(rec) {
  const st = trainingState(rec, rec.darts);
  const gs = st.gs;
  const vs = gs.visits;
  const full = vs.filter(v => !v.bust);
  const fullVisits = full.filter(v => v.darts.length === 3 || v.finish);
  const tiers = TIERS.map(() => 0);
  for (const v of full) tiers[tierOf(v.scored)]++;
  const off = rec.darts.filter(d => d.segment === MISS).length;
  const a = analyze(rec);
  const x = a.extra;
  const avg = per3(vs);
  const avgNoBust = per3(full);
  const busts = vs.filter(v => v.bust).length;
  const high = vs.filter(v => v.startRemaining > ENDGAME_FROM);
  const low = vs.filter(v => v.startRemaining <= ENDGAME_FROM);
  const n = rec.darts.length;
  const sdv = sd(fullVisits.filter(v => v.darts.length === 3).map(v => v.scored));
  return {
    done: st.done,
    avg,
    avgNoBust,
    bustCost: busts && avg !== null && avgNoBust !== null ? avgNoBust - avg : busts ? 0 : 0,
    visits: vs.length,
    darts: n,
    finishVisits: st.done ? vs.length : null,
    finishDarts: st.done ? n : null,
    tiers,
    off,
    offRate: n ? off / n : null,
    spread: sdv,
    busts,
    high: per3(high),
    low: per3(low),
    finAtt: x.finishDarts || 0,
    finHits: x.finishHits || 0,
    finRate: x.finishDarts ? x.finishHits / x.finishDarts : null,
    best: full.length ? Math.max(...full.map(v => v.scored)) : null,
    worst: fullVisits.filter(v => v.darts.length === 3).length ? Math.min(...fullVisits.filter(v => v.darts.length === 3).map(v => v.scored)) : null,
  };
}

/**
 * Chiffres comparés partie après partie (X01 en solo) : clé, libellé, explication (i), sens, format, forme courte pour
 * le résumé, écart sous lequel on dit « pareil ».
 */
export const X01_METRICS = Object.freeze([
  { k: 'avg', label: 'Moyenne par volée', short: 'ta moyenne', dir: 1, fmt: 'dec1', eps: 0.5,
    info: 'Points marqués pour 3 fléchettes, sur toute la partie (une volée bust compte 0).' },
  { k: 'finishVisits', label: 'Volées pour finir', short: 'le nombre de volées pour finir', dir: -1, fmt: 'int', eps: 0.5,
    info: 'Combien de volées il t\'a fallu pour finir la partie (seulement les parties finies).' },
  { k: 'finishDarts', label: 'Fléchettes pour finir', short: 'les fléchettes pour finir', dir: -1, fmt: 'int', eps: 1,
    info: 'Combien de fléchettes il t\'a fallu pour finir la partie (seulement les parties finies).' },
  { k: 'offRate', label: 'Fléchettes hors cible', short: 'le hors cible', dir: -1, fmt: 'pct', eps: 0.02,
    info: 'Part des fléchettes tombées hors de la cible (à côté, sur le bord ou par terre).' },
  { k: 'spread', label: 'Régularité', short: 'ta régularité', dir: -1, fmt: 'pm', eps: 1,
    info: 'De combien tes volées s\'écartent de ta moyenne, en points (écart type des volées complètes, sans les bust) : plus c\'est petit, plus tu es régulier.' },
  { k: 'busts', label: 'Busts', short: 'les busts', dir: -1, fmt: 'int', eps: 0.5,
    info: 'Volées perdues parce que tu as dépassé le reste (ou laissé 1 en sortie double) : elles comptent 0.' },
  { k: 'bustCost', label: 'Ce que coûtent les busts', short: 'le coût des busts', dir: -1, fmt: 'dec1', eps: 0.5,
    info: 'Points de moyenne perdus à cause des busts : ta moyenne sans les volées bust, moins ta vraie moyenne.' },
  { k: 'high', label: `Moyenne au-dessus de ${ENDGAME_FROM} restants`, short: `ta moyenne au-dessus de ${ENDGAME_FROM}`, dir: 1, fmt: 'dec1', eps: 0.5,
    info: `Points pour 3 fléchettes tant qu'il te reste plus de ${ENDGAME_FROM} : ton scoring.` },
  { k: 'low', label: `Moyenne à ${ENDGAME_FROM} restants ou moins`, short: 'ta fin de partie', dir: 1, fmt: 'dec1', eps: 0.5,
    info: `Points pour 3 fléchettes quand il te reste ${ENDGAME_FROM} ou moins : là où il faut viser la finition plutôt que le gros score.` },
  { k: 'finRate', label: 'Réussite aux doubles de fin', short: 'tes doubles de fin', dir: 1, fmt: 'pct', eps: 0.03,
    info: 'Fléchettes lancées quand une seule pouvait finir (un double en sortie double), et la part qui a fini.' },
  { k: 'best', label: 'Meilleure volée', short: 'ta meilleure volée', dir: 1, fmt: 'int', eps: 0.5,
    info: 'Ta volée la plus haute de la partie.' },
  { k: 'worst', label: 'Pire volée', short: 'ta pire volée', dir: 1, fmt: 'int', eps: 0.5,
    info: 'Ta volée complète la plus basse (sans les bust, comptés à part).' },
]);

/** Valeur de référence d'un chiffre : moyenne des valeurs connues (null si aucune). */
export const refOf = (list, k) => mean(list.map(m => m[k]).filter(v => v !== null && v !== undefined && Number.isFinite(v)));

/** Verdict d'un écart : 'better' | 'worse' | 'same' | null (pas de référence). */
export function verdictOf(value, ref, { dir, eps = 0 }) {
  if (value === null || value === undefined || ref === null || ref === undefined) return null;
  const d = value - ref;
  if (Math.abs(d) <= eps) return 'same';
  return (d > 0) === (dir > 0) ? 'better' : 'worse';
}

/** Une partie comparée aux précédentes de la période : [{ k, value, ref, state }] dans l'ordre de X01_METRICS. */
export function compareX01(cur, previous) {
  return X01_METRICS.map(m => ({ ...m, value: cur[m.k], ref: refOf(previous, m.k), state: verdictOf(cur[m.k], refOf(previous, m.k), m) }));
}

/** Tendance de chaque chiffre sur une suite de parties (la plus ancienne d'abord) : [{ …métrique, t (trends.js) }]. */
export function trendsOf(list, metrics) {
  return metrics.map(m => ({ ...m, t: trend(list.map(x => x[m.k]), m.dir) }));
}

const joinFr = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`);
/**
 * Résumé en clair : rows = [{ short, state ('better' | 'worse' | …) }] ou [{ short, t: { better } }] ; au plus deux
 * progrès et deux reculs, dans l'ordre donné. '' si rien ne bouge.
 */
export function summaryLine(rows, { max = 2 } = {}) {
  const st = r => (r.state ? r.state : r.t ? (r.t.better === true ? 'better' : r.t.better === false ? 'worse' : null) : null);
  const up = rows.filter(r => st(r) === 'better').slice(0, max).map(r => r.short);
  const down = rows.filter(r => st(r) === 'worse').slice(0, max).map(r => r.short);
  if (!up.length && !down.length) return '';
  const parts = [];
  if (up.length) parts.push(`en progrès sur ${joinFr(up)}`);
  if (down.length) parts.push(`en recul sur ${joinFr(down)}`);
  const s = parts.join(', ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

/** Régularité en clair : « tes volées varient de ±18 points ». */
export const spreadText = v => (v === null || v === undefined ? '' : `tes volées varient de ±${Math.round(v)} points`);

// ------------------------------------------------------------------ exercices à cible
const DRIFT_WORDS = Object.freeze({
  'en haut': 'au-dessus de la cible', 'en bas': 'sous la cible', 'à gauche': 'à gauche de la cible', 'à droite': 'à droite de la cible',
  'en haut à gauche': 'au-dessus et à gauche de la cible', 'en haut à droite': 'au-dessus et à droite de la cible',
  'en bas à gauche': 'sous la cible et à gauche', 'en bas à droite': 'sous la cible et à droite',
});

/** Dérive d'une séance (biais moyen à l'écran, mm) : { dx, dy, mm, words, text } ou null (trop peu, ou centré). */
export function driftOf(a) {
  if (!a || !a.bias || a.points < 3) return null;
  const [dx, dy] = a.bias;
  const mm = Math.hypot(dx, dy);
  if (mm < BIAS_MM) return { dx, dy, mm, words: null, text: 'Tes fléchettes sont bien centrées sur la cible visée : pas de dérive nette.' };
  const words = DRIFT_WORDS[direction([dx, dy])] || direction([dx, dy]);
  return { dx, dy, mm, words, text: `Tu tires souvent ${words} (de ${(Math.round(mm / 10 * 10) / 10).toFixed(1).replace('.', ',')} cm en moyenne).` };
}

const tName = t => (t.s === BULL ? 'Centre' : `${t.s}`);
/** Nom d'une cible visée pour les phrases : « 20 », « triple 20 », « centre ». */
export const targetName = t => `${zoneLabelOf(t) && t.z !== 'any' ? `${zoneLabelOf(t).toLowerCase()} ` : ''}${t.s === BULL ? 'centre' : t.s}`.replace(/^25 ou 50 centre$/, 'centre');

/**
 * Séance d'un exercice à cible comparée aux séances précédentes du même exercice (`previous`, analyses ou séances) :
 * { rate, value, off, offRate, sectors: [{ s, z, darts, hits, rate, prev, state }], best, worst, drift, approx, points,
 *   valueRef, valueState, valueDir }.
 */
export function targetSession(rec, previous = []) {
  const a = analyze(rec);
  const prevA = previous.map(p => (p && p.perTarget ? p : analyze(p)));
  const sectors = a.perTarget.map(t => {
    const last = prevA.length ? prevA[prevA.length - 1].perTarget.find(x => x.s === t.s && x.z === t.z) : null;
    const prev = last ? last.rate : null;
    return { s: t.s, z: t.z, darts: t.darts, hits: t.hits, rate: t.rate, prev, state: verdictOf(t.rate, prev, { dir: 1, eps: 0.05 }) };
  });
  const ranked = sectors.filter(x => x.darts >= 3 && x.rate !== null).sort((p, q) => q.rate - p.rate);
  const valueDir = valueDirOf(rec.exercise);
  const valueRef = mean(prevA.map(p => p.value).filter(v => v !== null && v !== undefined));
  return {
    rate: a.rate, value: a.value, off: a.off, offRate: a.darts ? a.off / a.darts : null, darts: a.darts,
    sectors,
    best: ranked.length > 1 ? ranked[0] : null,
    worst: ranked.length > 1 && ranked[ranked.length - 1].rate < ranked[0].rate ? ranked[ranked.length - 1] : null,
    drift: driftOf(a), approx: a.approx, points: a.points,
    valueRef, valueDir, valueState: verdictOf(a.value, valueRef, { dir: valueDir, eps: valueEps(rec.exercise, a.value) }),
    prevCount: prevA.length,
  };
}

/** Sens du chiffre principal d'un exercice : le tour de l'horloge sans limite se compte en fléchettes (moins = mieux). */
export function valueDirOf(exercise) { return exercise === 'horloge' ? -1 : 1; }
const valueEps = (exercise, v) => (v !== null && v !== undefined && Math.abs(v) <= 1 ? 0.03 : 0.5);

/** Phrase des secteurs le plus et le moins réussis. */
export function sectorsText(ts) {
  if (!ts.best) return '';
  const pc = r => `${Math.round(r * 100)} %`;
  return `Le plus réussi : ${targetName(ts.best)} (${pc(ts.best.rate)})${ts.worst ? ` · le plus raté : ${targetName(ts.worst)} (${pc(ts.worst.rate)})` : ''}.`;
}
export { tName, isHit };

// ------------------------------------------------------------------ multijoueur
/**
 * Chiffres qui se comparent entre joueurs (parties X01) : moyenne, meilleure volée, busts par partie, taux de victoire.
 * `ps` = playerStats(games, id) (stats.js).
 */
export const VERSUS_METRICS = Object.freeze([
  { k: 'average', label: 'Moyenne par volée', short: 'ta moyenne', dir: 1, fmt: 'dec1', info: 'Points marqués pour 3 fléchettes, sur toutes les parties de la période.' },
  { k: 'bestVisit', label: 'Meilleure volée', short: 'ta meilleure volée', dir: 1, fmt: 'int', info: 'La volée la plus haute de la période.' },
  { k: 'bustsPerGame', label: 'Busts par partie', short: 'les busts', dir: -1, fmt: 'dec1', info: 'Volées bust (comptées 0) en moyenne par partie.' },
  { k: 'winRate', label: 'Taux de victoire', short: 'tes victoires', dir: 1, fmt: 'pct', info: 'Part des parties gagnées (partie finie, première place).' },
]);
export function versusOf(ps) {
  return {
    average: ps.average, bestVisit: ps.played ? ps.bestVisit : null,
    bustsPerGame: ps.played ? ps.busts / ps.played : null, winRate: ps.played ? ps.won / ps.played : null, played: ps.played,
  };
}

/**
 * Forme du soir : moyenne d'une soirée comparée à la moyenne habituelle du joueur (ses autres parties de la période).
 * { tonight, usual, diff, state, games } ou null (pas de soirée ou rien à comparer).
 */
export function eveningForm(tonightAvg, usualAvg, games = 0) {
  if (tonightAvg === null || tonightAvg === undefined || usualAvg === null || usualAvg === undefined) return null;
  const diff = tonightAvg - usualAvg;
  return { tonight: tonightAvg, usual: usualAvg, diff, games, state: verdictOf(tonightAvg, usualAvg, { dir: 1, eps: 1 }) };
}
export function eveningText(f) {
  if (!f) return '';
  const d = Math.abs(f.diff).toFixed(1).replace('.', ',');
  return f.state === 'better' ? `Soir de forme : ${d} points au-dessus de ta moyenne habituelle.`
    : f.state === 'worse' ? `Soir difficile : ${d} points sous ta moyenne habituelle.`
      : 'Ce soir, tu joues à ton niveau habituel.';
}
