// Strela — entraînement solo (lot 8) : exercices, cible visée, analyse des impacts, conseils du coach, niveau.
// JS pur, sans dépendance ni affichage (testé dans node). Comme pour X01, rien n'est stocké d'autre que la séance et
// ses fléchettes : tout se recalcule (docs/entrainement.md).
//
// Séance enregistrée : { id, startedAt, endedAt (null : en cours), player, setId (jeu de fléchettes ou null),
//   mode ('coach' | 'libre'), exercise (clé d'EXERCISES), blocks? (libre : [{ s, z, n }]), darts[], stopped? }
// Fléchette d'entraînement : { segment, multiplier, ring?, pos? }
//   ring : 'in' (simple intérieur, entre le 25 et le triple) ou 'out' (simple extérieur, entre le triple et le double),
//          seulement pour un simple de 1 à 20 ; pos : position touchée sur la cible (repère de board.js) ;
//   segment 0 = hors cible (pos au-delà du double si la fléchette a été posée sur la cible).
// Cible visée : { s (1 à 20, ou 25 pour le centre), z } avec z :
//   'any' (tout le secteur), 's' (simple, intérieur ou extérieur), 'si', 'se', 'd', 't' ; pour le centre :
//   'any' (25 ou 50), 's' (25), 'd' (50).

import { SECTORS, RINGS, sectorAngle, polar, segmentAt } from './board.js';
import { dartError, BULL, MISS } from './darts.js';

// ------------------------------------------------------------------ zones
export const ZONE_LABEL = Object.freeze({ any: 'TOUT LE SECTEUR', s: 'SIMPLE', si: 'SIMPLE INTÉRIEUR', se: 'SIMPLE EXTÉRIEUR', d: 'DOUBLE', t: 'TRIPLE' });
export const BULL_ZONE_LABEL = Object.freeze({ any: '25 OU 50', s: '25', d: '50' });
export const ZONES_FOR = s => (s === BULL ? ['any', 's', 'd'] : ['any', 's', 'si', 'se', 't', 'd']);

/** Erreur de saisie d'une fléchette d'entraînement, ou null. */
export function trainingDartError(d) {
  const e = dartError(d);
  if (e) return e;
  if (d.ring !== undefined && !((d.ring === 'in' || d.ring === 'out') && d.multiplier === 1 && d.segment >= 1 && d.segment <= 20)) return 'RING_INVALID';
  if (d.pos !== undefined && !(Array.isArray(d.pos) && d.pos.length === 2 && d.pos.every(Number.isFinite))) return 'POS_INVALID';
  return null;
}

/** Copie propre d'une fléchette (champs connus seulement). */
export function cleanTrainingDart(d) {
  const out = { segment: d.segment, multiplier: d.multiplier };
  if (d.ring === 'in' || d.ring === 'out') out.ring = d.ring;
  if (Array.isArray(d.pos) && d.pos.length === 2) out.pos = d.pos.map(c => Math.round(c * 1000) / 1000);
  return out;
}

const posHit = d => (Array.isArray(d.pos) && d.pos.length === 2 ? segmentAt(d.pos[0], d.pos[1]) : undefined);
/** La position est-elle cohérente avec la fléchette ? (même zone, ou au-delà du double pour un hors cible) */
function posOk(d) {
  const h = posHit(d);
  if (h === undefined) return false;
  if (d.segment === MISS) return h === null && Math.hypot(d.pos[0], d.pos[1]) <= RINGS.edge + 0.05;
  return !!h && h.segment === d.segment && h.multiplier === d.multiplier;
}

/** Zone d'une fléchette : 'off', '25', '50', 't', 'd', 'si', 'se' ou 's' (simple sans anneau connu). */
export function zoneOf(d) {
  if (d.segment === MISS) return 'off';
  if (d.segment === BULL) return d.multiplier === 2 ? '50' : '25';
  if (d.multiplier === 3) return 't';
  if (d.multiplier === 2) return 'd';
  if (d.ring === 'in') return 'si';
  if (d.ring === 'out') return 'se';
  if (posOk(d)) return Math.hypot(d.pos[0], d.pos[1]) < RINGS.tripleIn ? 'si' : 'se';
  return 's';
}

/** La fléchette est-elle dans la cible visée ? */
export function isHit(t, d) {
  if (t.s === BULL) {
    if (d.segment !== BULL) return false;
    return t.z === 'any' || (t.z === 'd' ? d.multiplier === 2 : d.multiplier === 1);
  }
  if (d.segment !== t.s) return false;
  const z = zoneOf(d);
  if (t.z === 'any') return true;
  if (t.z === 's') return z === 's' || z === 'si' || z === 'se';
  return z === t.z;
}

/** Points d'une fléchette (comme en partie). */
export const pointsOf = d => d.segment * d.multiplier;

/** Nom court d'une fléchette : « 20 INT. », « 20 EXT. », « T20 », « D16 », « 25 », « 50 », « HORS ». */
export function trainingDartLabel(d) {
  const z = zoneOf(d);
  if (z === 'off') return 'HORS';
  if (z === '25' || z === '50') return z;
  if (z === 't') return `T${d.segment}`;
  if (z === 'd') return `D${d.segment}`;
  return `${d.segment}${z === 'si' ? ' INT.' : z === 'se' ? ' EXT.' : ''}`;
}

/** Nom d'une cible visée : « 20 », « T20 », « D16 », « 20 INT. », « BULL », « 50 ». */
export function targetLabel(t) {
  if (t.s === BULL) return t.z === 'd' ? '50' : t.z === 's' ? '25' : 'BULL';
  return ({ any: '', s: 'S', si: '', se: '', d: 'D', t: 'T' }[t.z] || '') + t.s + (t.z === 'si' ? ' INT.' : t.z === 'se' ? ' EXT.' : '');
}
export const zoneLabelOf = t => (t.s === BULL ? BULL_ZONE_LABEL[t.z] : ZONE_LABEL[t.z]) || '';

/** Cible visée nettoyée, ou null. */
export function cleanTarget(t) {
  if (!t || typeof t !== 'object') return null;
  const s = Number(t.s);
  if (!(Number.isInteger(s) && ((s >= 1 && s <= 20) || s === BULL))) return null;
  const z = ZONES_FOR(s).includes(t.z) ? t.z : 'any';
  return { s, z };
}

// ------------------------------------------------------------------ géométrie réelle (mm)
// La cible de l'appli a des anneaux élargis (board.js) ; l'analyse se fait sur les cotes d'une vraie cible (rayons en mm
// d'une cible réglementaire) : les écarts et le groupement s'expriment en centimètres.
const APP_R = [0, RINGS.bull, RINGS.outerBull, RINGS.tripleIn, RINGS.tripleOut, RINGS.doubleIn, RINGS.doubleOut, RINGS.edge];
export const REAL_R = Object.freeze([0, 6.35, 15.9, 99, 107, 162, 170, 225]);
const realRadius = r => {
  for (let i = 1; i < APP_R.length; i++) if (r <= APP_R[i]) return REAL_R[i - 1] + ((r - APP_R[i - 1]) / (APP_R[i] - APP_R[i - 1])) * (REAL_R[i] - REAL_R[i - 1]);
  return REAL_R[REAL_R.length - 1] + (r - RINGS.edge) * 300;
};
const appRadius = m => {
  for (let i = 1; i < REAL_R.length; i++) if (m <= REAL_R[i]) return APP_R[i - 1] + ((m - REAL_R[i - 1]) / (REAL_R[i] - REAL_R[i - 1])) * (APP_R[i] - APP_R[i - 1]);
  return RINGS.edge + (m - REAL_R[REAL_R.length - 1]) / 300;
};
/** Point du repère de la cible de l'appli (board.js) pour un point en mm (dessin des écarts sur la cible). */
export function appPoint([x, y]) {
  const m = Math.hypot(x, y);
  if (m < 1e-9) return [0, 0];
  const k = appRadius(m) / m;
  return [x * k, y * k];
}
const mid = (a, b) => (REAL_R[a] + REAL_R[b]) / 2;
/** Rayon (mm) du milieu de chaque zone, et du point visé pour chaque zone de cible. */
const ZONE_R = Object.freeze({ si: mid(2, 3), s: mid(2, 3), t: mid(3, 4), se: mid(4, 5), d: mid(5, 6) });
const AIM_R = Object.freeze({ any: (ZONE_R.si + ZONE_R.se) / 2, s: (ZONE_R.si + ZONE_R.se) / 2, si: ZONE_R.si, se: ZONE_R.se, t: ZONE_R.t, d: ZONE_R.d });

/** Point d'impact (mm, x vers la droite, y vers le bas, centre 0) : position touchée si connue, sinon milieu de la zone. */
export function realPoint(d) {
  if (posOk(d)) {
    const [x, y] = d.pos;
    const r = Math.hypot(x, y);
    if (r < 1e-9) return [0, 0];
    const k = realRadius(r) / r;
    return [x * k, y * k];
  }
  const z = zoneOf(d);
  if (z === 'off') return null;
  if (z === '50') return [0, 0];
  if (z === '25') return polar(0, mid(1, 2));
  return polar(sectorAngle(d.segment), ZONE_R[z]);
}

/** Point visé (mm) d'une cible. */
export const aimPoint = t => (t.s === BULL ? [0, 0] : polar(sectorAngle(t.s), AIM_R[t.z] ?? AIM_R.any));

// ------------------------------------------------------------------ exercices
/** Niveau débutant (lot 8) ; pas d'exercice sur les doubles seuls pour l'instant. */
const rep = (list, n) => list.map(s => ({ s, z: 'any', n }));
export const EXERCISES = Object.freeze({
  groupement: { name: 'Groupement', short: '9 fléchettes sur le 20',
    goal: '9 fléchettes sur le 20 : combien tombent dans le secteur, et de quel côté partent les autres.',
    blocks: rep([20], 9), metric: 'rate' },
  horloge: { name: 'Tour de l\'horloge', short: '1 à 20 dans l\'ordre, en simples',
    goal: 'Du 1 au 20 dans l\'ordre ; toute zone du secteur compte. On passe au numéro suivant dès qu\'il est touché : le moins de fléchettes possible.',
    clock: true, metric: 'darts' },
  hautbas: { name: 'Haut contre bas', short: 'une volée sur le 20, une sur le 3',
    goal: 'Une volée sur le 20 (en haut), une sur le 3 (en bas), trois fois : la précision en haut et en bas, et vers où partent les fléchettes.',
    blocks: rep([20, 3, 20, 3, 20, 3], 3), metric: 'rate', pair: [20, 3] },
  gauchedroite: { name: 'Gauche contre droite', short: 'une volée sur le 11, une sur le 6',
    goal: 'Une volée sur le 11 (à gauche), une sur le 6 (à droite), trois fois : la précision de chaque côté.',
    blocks: rep([11, 6, 11, 6, 11, 6], 3), metric: 'rate', pair: [11, 6] },
  scorelibre: { name: 'Score libre', short: '10 volées en visant le 20',
    goal: '10 volées de 3 fléchettes en visant le 20 : la moyenne par volée et sa régularité.',
    blocks: rep([20], 30), metric: 'average' },
  bull: { name: 'Bull', short: '9 fléchettes au centre',
    goal: '9 fléchettes au centre : combien tombent près du centre (le 25, le 50 ou le simple intérieur).',
    blocks: [{ s: BULL, z: 'any', n: 9 }], metric: 'near' },
  vingt: { name: '20-19-18', short: '20 fléchettes sur chacun',
    goal: '20 fléchettes sur le 20, puis 20 sur le 19, puis 20 sur le 18 : la précision sur chacun et les triples.',
    blocks: rep([20, 19, 18], 20), metric: 'rate' },
  libre: { name: 'Libre', short: 'tes cibles, tes fléchettes',
    goal: 'Tu choisis la cible (secteur et zone) et le nombre de fléchettes ; l\'appli compare la cible visée et les impacts.',
    metric: 'rate' },
});
/** Exercices du coach, dans l'ordre proposé au débutant. */
export const COACH_ORDER = Object.freeze(['groupement', 'horloge', 'hautbas', 'gauchedroite', 'scorelibre', 'bull', 'vingt']);

/** Séries d'une séance (libre : celles choisies ; sinon celles de l'exercice). */
export function planOf(cfg) {
  if (cfg.exercise === 'libre') return (cfg.blocks || []).map(b => ({ ...cleanTarget(b), n: Math.max(1, Math.min(99, Number(b.n) || 9)) })).filter(b => b.s);
  const ex = EXERCISES[cfg.exercise];
  return ex && ex.blocks ? ex.blocks.map(b => ({ ...b })) : [];
}

/**
 * État d'une séance, recalculé depuis les fléchettes :
 *   blocks : [{ s, z, n (null : horloge, jusqu'à toucher), start, darts[], hits }]
 *   cur    : série en cours { i, s, z, n, k (fléchettes déjà lancées dans la série) } ou null si tout est lancé
 *   done, thrown, visitDarts (fléchettes de la volée en cours, 0 à 2 ; 3 = volée complète juste finie)
 */
export function trainingState(cfg, darts) {
  for (const d of darts) if (trainingDartError(d)) throw new Error('fléchette invalide');
  const blocks = [];
  if (EXERCISES[cfg.exercise] && EXERCISES[cfg.exercise].clock) {
    let num = 1;
    let b = { s: 1, z: 'any', n: null, start: 0, darts: [], hits: 0 };
    blocks.push(b);
    darts.forEach((d, i) => {
      if (num > 20) throw new Error('horloge déjà finie');
      b.darts.push(d);
      if (isHit(b, d)) {
        b.hits = 1;
        num++;
        if (num <= 20) { b = { s: num, z: 'any', n: null, start: i + 1, darts: [], hits: 0 }; blocks.push(b); }
      }
    });
    const done = num > 20;
    const last = blocks[blocks.length - 1];
    const cur = done ? null : { i: blocks.length - 1, s: last.s, z: 'any', n: null, k: last.darts.length };
    return { blocks, cur, done, thrown: darts.length, visitDarts: darts.length % 3, visitStart: darts.length - (darts.length % 3), clock: true };
  }
  const plan = planOf(cfg);
  let i = 0;
  for (const p of plan) {
    const b = { ...p, start: i, darts: darts.slice(i, i + p.n), hits: 0 };
    b.hits = b.darts.filter(d => isHit(b, d)).length;
    blocks.push(b);
    i += p.n;
  }
  if (darts.length > i) throw new Error('trop de fléchettes pour la séance');
  const ci = blocks.findIndex(b => b.darts.length < b.n);
  const cur = ci < 0 ? null : { i: ci, s: blocks[ci].s, z: blocks[ci].z, n: blocks[ci].n, k: blocks[ci].darts.length };
  // Volées de 3 fléchettes, comptées depuis le début de chaque série.
  const b = cur ? blocks[cur.i] : blocks[blocks.length - 1];
  const k = cur ? cur.k : 0;
  return { blocks, cur, done: ci < 0 && blocks.length > 0, thrown: darts.length, visitDarts: k % 3, visitStart: (b ? b.start : 0) + k - (k % 3), clock: false };
}

/** Fléchettes prévues (null pour l'horloge). */
export const plannedDarts = cfg => (EXERCISES[cfg.exercise] && EXERCISES[cfg.exercise].clock ? null : planOf(cfg).reduce((n, b) => n + b.n, 0));

// ------------------------------------------------------------------ analyse
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Mot de direction (écran) d'un vecteur ; `two` : aussi la seconde direction si elle compte (« en haut à gauche »). */
export function direction([x, y], two = true) {
  const ax = Math.abs(x), ay = Math.abs(y);
  const h = x < 0 ? 'gauche' : 'droite', v = y < 0 ? 'haut' : 'bas';
  if (ax >= ay) return two && ay >= 0.6 * ax ? `${v === 'haut' ? 'en haut' : 'en bas'} à ${h}` : `à ${h}`;
  return two && ax >= 0.6 * ay ? `${v === 'haut' ? 'en haut' : 'en bas'} à ${h}` : v === 'haut' ? 'en haut' : 'en bas';
}

/** Seuils de l'analyse (mm) : biais à partir de BIAS_MM d'écart moyen ; groupement large au-delà de SPREAD_WIDE. */
export const BIAS_MM = 9;
export const SPREAD_WIDE = 50;
export const SPREAD_TIGHT = 30;

/**
 * Écarts d'un ensemble de fléchettes à leurs cibles : biais moyen (mm, écran), groupement (mm), nombre de points, et
 * biais le long de deux axes : pour un secteur, `lat` (sens horaire) et `rad` (vers le bord) ; sinon x et y de l'écran.
 */
function deviation(pairs, axes = null) {
  const devs = [];
  for (const { t, d } of pairs) {
    const p = realPoint(d);
    if (!p) continue;
    const a = aimPoint(t);
    devs.push([p[0] - a[0], p[1] - a[1]]);
  }
  if (!devs.length) return { n: 0, bias: null, spread: null, axes: [] };
  const bias = [mean(devs.map(v => v[0])), mean(devs.map(v => v[1]))];
  const spread = mean(devs.map(v => dist(v, bias)));
  const ax = (axes || [[1, 0], [0, 1]]).map(u => ({ u, m: bias[0] * u[0] + bias[1] * u[1] }));
  return { n: devs.length, bias, spread, axes: ax };
}
/** Axes d'une cible : sens horaire et vers le bord du secteur (vecteurs unitaires à l'écran) ; null pour le centre. */
const axesOf = t => (t.s === BULL ? null : [polar(sectorAngle(t.s) + 90, 1), polar(sectorAngle(t.s), 1)]);

/** Voisins d'un secteur touchés : côté horaire (+) et anti-horaire (−), à 1 ou 2 secteurs. */
function neighbours(t, darts) {
  if (t.s === BULL) return { cw: 0, ccw: 0 };
  const i = SECTORS.indexOf(t.s);
  let cw = 0, ccw = 0;
  for (const d of darts) {
    const j = SECTORS.indexOf(d.segment);
    if (j < 0 || d.segment === t.s) continue;
    const k = ((j - i) % 20 + 20) % 20;
    if (k === 1 || k === 2) cw++;
    else if (k === 18 || k === 19) ccw++;
  }
  return { cw, ccw };
}

const zoneCounts = darts => {
  const c = { si: 0, se: 0, s: 0, t: 0, d: 0, 25: 0, 50: 0, off: 0 };
  for (const d of darts) c[zoneOf(d)]++;
  return c;
};

/** Volées de 3 fléchettes (points), dans l'ordre. */
const visitsOf = darts => { const out = []; for (let i = 0; i < darts.length; i += 3) out.push(darts.slice(i, i + 3).reduce((n, d) => n + pointsOf(d), 0)); return out; };

/**
 * Analyse d'une séance : chiffres, écarts, messages du coach et exercice suivant.
 *   { darts, hits, rate, off, perTarget: [{ s, z, darts, hits, rate, bias, spread, zones, cw, ccw }], bias, spread,
 *     value (chiffre principal de l'exercice), extra (propre à l'exercice), messages: [{ kind, text, tip?, sheet? }], next }
 */
export function analyze(rec) {
  const st = trainingState(rec, rec.darts);
  const pairs = [];
  for (const b of st.blocks) for (const d of b.darts) pairs.push({ t: b, d });
  const n = pairs.length;
  const hits = pairs.filter(p => isHit(p.t, p.d)).length;
  const off = pairs.filter(p => p.d.segment === MISS).length;
  // Par cible (une même cible visée dans plusieurs séries est regroupée).
  const groups = new Map();
  for (const p of pairs) {
    const k = `${p.t.s}|${p.t.z}`;
    if (!groups.has(k)) groups.set(k, { s: p.t.s, z: p.t.z, pairs: [] });
    groups.get(k).pairs.push(p);
  }
  const perTarget = [...groups.values()].map(g => {
    const ds = g.pairs.map(p => p.d);
    const dv = deviation(g.pairs, axesOf(g));
    const h = g.pairs.filter(p => isHit(p.t, p.d)).length;
    return { s: g.s, z: g.z, darts: ds.length, hits: h, rate: ds.length ? h / ds.length : null, bias: dv.bias, spread: dv.spread, n: dv.n, axes: dv.axes, zones: zoneCounts(ds), ...neighbours(g, ds) };
  });
  const single = groups.size === 1 ? [...groups.values()][0] : null;
  const all = deviation(pairs, single ? axesOf(single) : null);
  const ex = EXERCISES[rec.exercise] || EXERCISES.libre;
  const extra = {};
  let value = n ? hits / n : null;
  if (ex.clock) {
    extra.reached = st.done ? 20 : st.cur.s - 1;
    extra.perNumber = st.blocks.map(b => ({ s: b.s, darts: b.darts.length, hit: !!b.hits }));
    value = st.done ? n : null;
    extra.hardest = st.blocks.filter(b => b.hits).sort((a, b) => b.darts.length - a.darts.length).slice(0, 3).filter(b => b.darts.length > 1).map(b => ({ s: b.s, darts: b.darts.length }));
  } else if (ex.metric === 'average') {
    const v = visitsOf(pairs.map(p => p.d));
    const full = v.filter((_, i) => pairs.length >= (i + 1) * 3);
    extra.visits = v;
    extra.average = full.length ? mean(full) : null;
    extra.sd = full.length > 1 ? Math.sqrt(mean(full.map(x => (x - extra.average) ** 2))) : null;
    extra.best = full.length ? Math.max(...full) : null;
    extra.worst = full.length ? Math.min(...full) : null;
    value = extra.average;
  } else if (ex.metric === 'near') {
    extra.near = pairs.filter(p => ['25', '50', 'si'].includes(zoneOf(p.d)) && (p.d.segment === BULL || nearCentre(p.d))).length;
    extra.bulls = pairs.filter(p => p.d.segment === BULL).length;
    value = n ? extra.near / n : null;
  }
  if (rec.exercise === 'vingt' || rec.exercise === 'scorelibre' || rec.exercise === 'groupement') extra.triples = pairs.filter(p => p.d.multiplier === 3).length;
  const out = { darts: n, hits, rate: n ? hits / n : null, off, perTarget, bias: all.bias, spread: all.spread, axes: all.axes, points: all.n, value, extra, done: st.done, exercise: rec.exercise };
  out.messages = coachMessages(out, rec);
  out.next = nextFor(out, rec);
  return out;
}

/** Près du centre (exercice Bull) : 25, 50, ou simple intérieur à moins de 2 largeurs de secteur au bord du 25. */
function nearCentre(d) {
  if (d.segment === BULL) return true;
  const p = realPoint(d);
  if (!p) return false;
  // Sans position (pavé), un simple intérieur compte ; avec position, il faut être à moins de 50 mm du centre (le bord
  // du 25 plus deux largeurs de secteur mesurées à cet endroit, environ 2 × 17 mm).
  return !posOk(d) || Math.hypot(p[0], p[1]) <= 50;
}

const cm = mm => `${(Math.round(mm / 10 * 10) / 10).toFixed(1).replace('.', ',')} cm`;
const pctTxt = r => `${Math.round(r * 100)} %`;
const nameOf = t => (t.s === BULL ? 'centre' : String(t.s));
const du = t => (t.s === BULL ? 'du centre' : `du ${t.s}`);

/** Conseils liés à une direction d'écart (écran). */
export const TIPS = Object.freeze({
  gauche: { text: 'Aligne le pied avant, l\'épaule et le coude sur la cible ; pendant le lancer, le coude reste dans l\'axe et ne part pas vers l\'extérieur.', sheet: 'posture' },
  droite: { text: 'Aligne le pied avant, l\'épaule et le coude sur la cible ; la main finit le geste vers la cible, sans tourner le poignet.', sheet: 'posture' },
  haut: { text: 'Tu lâches un peu tôt, ou tu pousses trop fort : garde le même rythme et lâche quand l\'avant-bras arrive vers la cible.', sheet: 'lancer' },
  bas: { text: 'Tu lâches un peu tard, ou tu freines le geste : accompagne la main vers la cible jusqu\'au bout, bras tendu.', sheet: 'lancer' },
  spread: { text: 'Même prise, même place des pieds et tête immobile à chaque fléchette : la précision vient de la régularité, pas de la force.', sheet: 'prise' },
  clock: { text: 'Pour les numéros des côtés et du bas, ne bouge que le bras : les pieds et les épaules restent en place.', sheet: 'posture' },
});

/** Écarts qui comptent le long des axes : [{ word ('à gauche', 'en haut'…), mm, vertical }]. */
function biasList(axes, spread) {
  const out = [];
  for (const { u, m } of axes || []) {
    if (Math.abs(m) < BIAS_MM || (spread !== null && Math.abs(m) < 0.25 * spread)) continue;
    const word = direction([u[0] * m, u[1] * m], false);
    out.push({ word, mm: Math.abs(m), vertical: !/gauche|droite/.test(word) });
  }
  return out;
}

/** Messages courts du coach (le plus utile d'abord). */
export function coachMessages(a, rec) {
  const msgs = [];
  if (!a.darts) return msgs;
  const ex = EXERCISES[rec.exercise] || EXERCISES.libre;
  // Résultat de l'exercice.
  if (ex.clock) {
    msgs.push({ kind: 'result', text: a.done ? `Tour bouclé en ${a.darts} fléchettes.` : `Arrêté au ${a.extra.reached + 1}, après ${a.darts} fléchettes.` });
    if (a.extra.hardest.length) msgs.push({ kind: 'clock', text: `Le plus dur : ${a.extra.hardest.map(h => `le ${h.s} (${h.darts} fl.)`).join(', ')}.`, tip: TIPS.clock.text, sheet: TIPS.clock.sheet });
  } else if (ex.metric === 'average' && a.extra.average !== null) {
    msgs.push({ kind: 'result', text: `Moyenne ${avgTxt(a.extra.average)} par volée${a.extra.sd !== null ? `, régularité ± ${avgTxt(a.extra.sd)}` : ''}.` });
  } else if (ex.metric === 'near') {
    msgs.push({ kind: 'result', text: `${a.extra.near} fléchette${a.extra.near > 1 ? 's' : ''} sur ${a.darts} près du centre (dont ${a.extra.bulls} dans le 25 ou le 50).` });
  } else if (a.perTarget.length > 1 && ex.pair) {
    const [x, y] = ex.pair.map(s => a.perTarget.find(t => t.s === s));
    if (x && y) msgs.push({ kind: 'result', text: `${x.s} : ${x.hits}/${x.darts} · ${y.s} : ${y.hits}/${y.darts}.${Math.abs((x.rate || 0) - (y.rate || 0)) >= 0.2 ? ` Plus précis sur le ${(x.rate || 0) > (y.rate || 0) ? x.s : y.s}.` : ''}` });
  } else {
    msgs.push({ kind: 'result', text: a.perTarget.length > 1
      ? a.perTarget.map(t => `${nameOf(t)} : ${t.hits}/${t.darts}`).join(' · ') + '.'
      : `${a.hits} fléchette${a.hits > 1 ? 's' : ''} sur ${a.darts} dans ${a.perTarget[0] && a.perTarget[0].z !== 'any' ? 'la cible' : 'le secteur'} (${pctTxt(a.rate)}).` });
  }
  // Écarts : par cible quand il y en a plusieurs (haut / bas, gauche / droite, 20-19-18), sinon sur l'ensemble ; chaque
  // axe à part (sur le côté, en hauteur), chacun avec son conseil (une fois).
  const shown = new Set();
  const pushBias = (t, axes, sp, count) => {
    if (count < 3) return;
    for (const b of biasList(axes, sp)) {
      const tip = TIPS[b.word.replace(/^(à|en) /, '')];
      msgs.push({ kind: 'bias', dir: b.word, vertical: b.vertical, mm: b.mm, s: t ? t.s : null,
        text: `Tes fléchettes partent ${b.word} ${t ? du(t) : 'de la cible visée'} (${cm(b.mm)} en moyenne).`, tip: shown.has(tip) ? null : tip.text, sheet: tip.sheet });
      shown.add(tip);
    }
  };
  if (!ex.clock && a.perTarget.length > 1) for (const t of a.perTarget) pushBias(t, t.axes, t.spread, t.n);
  else pushBias(ex.clock ? null : a.perTarget[0], a.axes, a.spread, a.points);
  if (a.spread !== null && a.points >= 3) {
    if (a.spread > SPREAD_WIDE) msgs.push({ kind: 'spread', text: `Fléchettes dispersées : ${cm(a.spread)} en moyenne autour de leur centre.`, tip: TIPS.spread.text, sheet: TIPS.spread.sheet });
    else if (a.spread < SPREAD_TIGHT && !ex.clock) msgs.push({ kind: 'good', text: `Bon groupement : ${cm(a.spread)} en moyenne autour de leur centre.` });
  }
  if (a.off) msgs.push({ kind: 'off', text: `${a.off} fléchette${a.off > 1 ? 's' : ''} hors cible.` });
  return msgs;
}
const avgTxt = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

/** Exercice suivant proposé d'après la séance (null : l'ordre du coach décide, voir suggestNext). */
function nextFor(a, rec) {
  const bias = a.messages.find(m => m.kind === 'bias');
  if (bias && !bias.vertical && rec.exercise !== 'gauchedroite') return { key: 'gauchedroite', why: 'tes fléchettes partent sur le côté' };
  if (bias && bias.vertical && rec.exercise !== 'hautbas') return { key: 'hautbas', why: 'tes fléchettes partent en hauteur' };
  if (a.messages.some(m => m.kind === 'spread') && rec.exercise !== 'groupement') return { key: 'groupement', why: 'tes fléchettes sont dispersées' };
  if (rec.exercise === 'groupement' && a.rate !== null && a.rate >= LEVEL.rate) return { key: 'vingt', why: 'ton groupement tient : on l\'essaie sur trois secteurs' };
  return null;
}

// ------------------------------------------------------------------ coach : exercice proposé, niveau
/** Passage au niveau suivant (seuil simple, à affiner : docs/entrainement.md) : groupement ≥ 50 % sur 3 séances de suite. */
export const LEVEL = Object.freeze({ exercise: 'groupement', rate: 0.5, sessions: 3 });
export const LEVELS = Object.freeze({ debutant: 'DÉBUTANT', intermediaire: 'INTERMÉDIAIRE' });

/** Séances closes et complètes d'un joueur, de la plus ancienne à la plus récente. */
export const completeSessions = (list, player) => list.filter(r => r.player === player && r.endedAt !== null && r.endedAt !== undefined && !r.stopped)
  .sort((a, b) => a.startedAt - b.startedAt);

/** Niveau du joueur : { level, streak (séances de suite au-dessus du seuil), need } ; intermédiaire, une fois atteint, reste. */
export function levelOf(list, player) {
  const g = completeSessions(list, player).filter(r => r.exercise === LEVEL.exercise);
  let streak = 0, reached = false;
  for (const r of g) {
    const a = analyze(r);
    streak = a.rate !== null && a.rate >= LEVEL.rate ? streak + 1 : 0;
    if (streak >= LEVEL.sessions) reached = true;
  }
  return { level: reached ? 'intermediaire' : 'debutant', streak: Math.min(streak, LEVEL.sessions), need: LEVEL.sessions };
}

/**
 * Exercice proposé par le coach : celui que la dernière séance suggère (s'il n'a pas été fait depuis), sinon un
 * exercice jamais fait (dans l'ordre du coach), sinon celui fait le moins récemment. { key, why }.
 */
export function suggestNext(list, player) {
  const done = completeSessions(list, player).filter(r => r.mode === 'coach');
  const last = done[done.length - 1];
  if (last) {
    const n = analyze(last).next;
    if (n) return n;
  }
  const lastAt = new Map();
  for (const r of done) lastAt.set(r.exercise, r.startedAt);
  const never = COACH_ORDER.find(k => !lastAt.has(k));
  if (never) return { key: never, why: done.length ? 'pas encore fait' : 'pour commencer' };
  const oldest = [...COACH_ORDER].sort((a, b) => lastAt.get(a) - lastAt.get(b))[0];
  return { key: oldest, why: 'le moins récent' };
}

// ------------------------------------------------------------------ stats
/** Chiffre principal d'une séance pour sa courbe : { v, fmt: 'pct' | 'int' | 'avg', dir } ou null. */
export function sessionValue(rec, a = analyze(rec)) {
  const ex = EXERCISES[rec.exercise] || EXERCISES.libre;
  if (ex.clock) return a.done ? { v: a.darts, fmt: 'int', dir: -1, label: 'Fléchettes' } : null;
  if (ex.metric === 'average') return a.extra.average === null ? null : { v: a.extra.average, fmt: 'avg', dir: 1, label: 'Moyenne / volée' };
  if (ex.metric === 'near') return a.value === null ? null : { v: a.value, fmt: 'pct', dir: 1, label: 'Près du centre' };
  return a.rate === null ? null : { v: a.rate, fmt: 'pct', dir: 1, label: 'Dans la cible' };
}

/** Compte des impacts par zone (carte de chaleur) : clé de zone de la cible (« 20 », « T20 », « D20 », « 25 », « 50 »)
 *  et anneau ('i' / 'o' pour les simples ; '' sinon). Les simples sans anneau connu sont partagés entre les deux. */
export function heatCounts(darts) {
  const c = new Map();
  const add = (k, v) => c.set(k, (c.get(k) || 0) + v);
  let off = 0;
  for (const d of darts) {
    const z = zoneOf(d);
    if (z === 'off') off++;
    else if (z === '25' || z === '50') add(`${z}|`, 1);
    else if (z === 't') add(`T${d.segment}|`, 1);
    else if (z === 'd') add(`D${d.segment}|`, 1);
    else if (z === 'si') add(`${d.segment}|i`, 1);
    else if (z === 'se') add(`${d.segment}|o`, 1);
    else { add(`${d.segment}|i`, 0.5); add(`${d.segment}|o`, 0.5); }
  }
  return { get: (key, ring = '') => c.get(`${key}|${ring}`) || 0, off, total: darts.length };
}
