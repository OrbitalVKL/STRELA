// Strela — tendances et périodes des stats (lot 8 du 23/11/2026, 3.1 et 3.3). JS pur, sans dépendance ni affichage.
//
// Tendance : sur les TREND_WINDOW dernières séances (dix), la pente d'une droite des moindres carrés (rang de la séance
// en abscisse), ramenée à l'écart entre la première et la dernière séance de la fenêtre puis à la moyenne : c'est la
// part de progression sur la fenêtre. Au-delà de TREND_FLAT (5 %), flèche vers le haut ou vers le bas ; le sens
// « mieux » dépend du chiffre (`dir` 1 : plus haut est mieux ; −1 : plus bas est mieux, comme une distance).
// Il faut au moins TREND_MIN séances (quatre) pour dire quelque chose.
//
// Période : raccourcis '7j', '30j', 'tout', ou plage libre { from: 'AAAA-MM-JJ', to: 'AAAA-MM-JJ' } (jours entiers, heure
// locale, bornes comprises). Même filtre pour les courbes, les chiffres et les exports.

export const TREND_WINDOW = 10;
export const TREND_MIN = 4;
export const TREND_FLAT = 0.05;

/**
 * Tendance d'une suite de valeurs (de la plus ancienne à la plus récente ; null ignorées) :
 * { n, mean, slope, change (part sur la fenêtre, signée), arrow ('up' | 'down' | 'flat' | null), better (true : en
 * progrès, false : en recul, null : stable ou pas assez de séances) }.
 */
export function trend(values, dir = 1, { window = TREND_WINDOW, min = TREND_MIN, flat = TREND_FLAT } = {}) {
  const v = values.filter(x => x !== null && x !== undefined && Number.isFinite(x)).slice(-window);
  const n = v.length;
  if (!n) return { n: 0, mean: null, slope: null, change: null, arrow: null, better: null };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  if (n < min) return { n, mean, slope: null, change: null, arrow: null, better: null };
  const xm = (n - 1) / 2;
  let num = 0, den = 0;
  v.forEach((y, i) => { num += (i - xm) * (y - mean); den += (i - xm) ** 2; });
  const slope = den ? num / den : 0;
  const scale = Math.abs(mean) > 1e-9 ? Math.abs(mean) : 1;
  const change = (slope * (n - 1)) / scale;
  if (Math.abs(change) < flat) return { n, mean, slope, change, arrow: 'flat', better: null };
  return { n, mean, slope, change, arrow: change > 0 ? 'up' : 'down', better: (change > 0) === (dir > 0) };
}

export const DAY = 86400000;
export const PERIOD_KEYS = Object.freeze(['7j', '30j', 'tout']);
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Début du jour (heure locale) d'une date « AAAA-MM-JJ », ou null. */
export function dayStart(iso) {
  const m = ISO.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[3]) ? null : d.getTime();
}
/** « AAAA-MM-JJ » d'un instant (heure locale). */
export function isoDay(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Bornes d'une période : { from, to } en ms (to exclu), et `label` (« 7 derniers jours », « du 3/11 au 20/11 »…).
 *   period : '7j' | '30j' | 'tout' | 'plage' ; range : { from, to } pour 'plage' (une borne manquante : sans limite).
 * Une plage à l'envers est remise dans l'ordre.
 */
export function periodBounds(period, range = {}, now = Date.now()) {
  if (period === '7j' || period === '30j') {
    const days = period === '7j' ? 7 : 30;
    return { from: now - days * DAY, to: Infinity, label: `${days} derniers jours`, key: period };
  }
  if (period === 'plage') {
    let a = dayStart(range && range.from), b = dayStart(range && range.to);
    if (a !== null && b !== null && a > b) [a, b] = [b, a];
    const from = a === null ? -Infinity : a;
    const to = b === null ? Infinity : b + DAY;
    const short = ms => { const d = new Date(ms); return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
    const label = a === null && b === null ? 'tout' : a === null ? `jusqu'au ${short(b)}` : b === null ? `depuis le ${short(a)}` : a === b ? `le ${short(a)}` : `du ${short(a)} au ${short(b)}`;
    return { from, to, label, key: 'plage' };
  }
  return { from: -Infinity, to: Infinity, label: 'tout', key: 'tout' };
}
/** L'instant `ms` est-il dans la période (bornes de periodBounds) ? */
export const inPeriod = (ms, b) => Number.isFinite(ms) && ms >= b.from && ms < b.to;

/**
 * Abscisses d'une courbe proportionnelles au temps (3.2) : `times` croissants → x de `left` à `left + width`, avec un
 * écart d'au moins `gap` entre deux points (les séances d'un même soir ne se chevauchent pas). Renvoie { xs, width }
 * (largeur utile finale, qui grandit si les écarts minimaux l'exigent).
 */
export function timeAxis(times, { left = 24, width = 260, gap = 30 } = {}) {
  const n = times.length;
  if (!n) return { xs: [], width };
  if (n === 1) return { xs: [left + width / 2], width };
  const t0 = times[0], span = times[n - 1] - t0;
  const raw = times.map(t => (span > 0 ? ((t - t0) / span) * width : 0));
  const xs = [];
  raw.forEach((x, i) => { xs.push(i ? Math.max(x, xs[i - 1] + gap) : 0); });
  const used = Math.max(width, xs[n - 1]);
  return { xs: xs.map(x => left + x), width: used };
}

/** Rangs des étiquettes de date à écrire : une seule tous les `minGap` px (la dernière toujours, si elle a la place). */
export function labelIndexes(xs, minGap = 60) {
  const out = [];
  let last = -Infinity;
  xs.forEach((x, i) => { if (x - last >= minGap) { out.push(i); last = x; } });
  const n = xs.length - 1;
  if (n > 0 && out[out.length - 1] !== n) {
    if (xs[n] - xs[out[out.length - 1]] >= minGap) out.push(n);
    else if (out.length > 1) { out[out.length - 1] = n; }
  }
  return out;
}
