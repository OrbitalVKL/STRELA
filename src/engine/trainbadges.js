// Strela — badges d'entraînement et petits défis en séance (lot 8 du 23/11/2026, 5.3 et 5.4). JS pur, sans DOM.
// Tout se recalcule depuis les séances enregistrées : les badges sont donc gagnés rétroactivement sur tout l'historique,
// et chaque rang garde la séance (et la volée) où il a été atteint, pour la fenêtre qui l'explique.
//
// Petits défis en séance (FEATS) : vérifiés sur chaque volée complète d'un exercice ou d'un jeu de cible (pas sur les
// jeux X01 et Cricket, qui ont leurs défis de soirée) ; chacun est une petite récompense, montrée à la fin de la séance.
// Badges à rangs (TRAIN_BADGES) : bronze, argent, or, seuils volontairement hauts (à ajuster sur les vrais chiffres).
import { analyze, trainingState, isHit, zoneOf, isGameSession, sessionValue, EXERCISES } from './training.js';
import { MISS, BULL } from './darts.js';

const sameCase = (a, b) => a.segment === b.segment && a.multiplier === b.multiplier && zoneOf(a) === zoneOf(b);

/** Petits défis d'une volée de 3 fléchettes (cibles visées `targets`, une par fléchette, ou null). */
export const FEATS = Object.freeze({
  parfaite: { name: 'Volée parfaite', icon: 'target', text: 'Les trois fléchettes de la volée dans la cible visée.',
    ok: (ds, ts) => ts.every(t => t && t.s) && ds.every((d, i) => isHit(ts[i], d)) },
  trio: { name: 'Trio', icon: 'burst', text: 'Les trois fléchettes de la volée dans le même secteur (simple, double ou triple).',
    ok: ds => ds[0].segment !== MISS && ds[0].segment !== BULL && ds.every(d => d.segment === ds[0].segment) },
  memecase: { name: 'Même trou', icon: 'sniper', text: 'Les trois fléchettes dans la même case de la cible (même secteur, même anneau).',
    ok: ds => ds[0].segment !== MISS && ds.every(d => sameCase(d, ds[0])) },
  bulls: { name: 'Œil de bœuf', icon: 'crown', text: 'Au moins deux fléchettes au centre (25 ou 50) dans la même volée.',
    ok: ds => ds.filter(d => d.segment === BULL).length >= 2 },
});
export const FEAT_KEYS = Object.freeze(Object.keys(FEATS));

/**
 * Petits défis réussis d'une séance : [{ key, volley (1, 2…), start (rang de la 1re fléchette) }]. Une volée peut en
 * réussir plusieurs. Rien pour les jeux X01 et Cricket.
 */
export function sessionFeats(rec) {
  if (!rec || isGameSession(rec) || !Array.isArray(rec.darts)) return [];
  let st;
  try { st = trainingState(rec, rec.darts); } catch (e) { return []; }
  const targetOf = i => { for (const b of st.blocks) if (i >= b.start && i < b.start + b.darts.length) return b; return null; };
  const out = [];
  for (let i = 0; i + 3 <= rec.darts.length; i += 3) {
    const ds = rec.darts.slice(i, i + 3), ts = [i, i + 1, i + 2].map(targetOf);
    for (const k of FEAT_KEYS) if (FEATS[k].ok(ds, ts)) out.push({ key: k, volley: i / 3 + 1, start: i });
  }
  return out;
}

export const TIER_NAMES = Object.freeze(['', 'bronze', 'argent', 'or']);
/**
 * Badges d'entraînement à rangs : `tiers` (bronze, argent, or), `dir` (1 : il faut au moins ; −1 : au plus), `unit`.
 * Seuils volontairement hauts (cahier des charges) ; distances en mm sur une vraie cible.
 */
export const TRAIN_BADGES = Object.freeze({
  assidu: { name: 'Assidu', icon: 'calendar', tiers: [5, 14, 30], dir: 1, unit: 'jours',
    text: 'Des jours d\'entraînement d\'affilée (au moins une séance chaque jour).' },
  volume: { name: 'Bras de fer', icon: 'plusplus', tiers: [2000, 10000, 30000], dir: 1, unit: 'fléchettes',
    text: 'Des fléchettes lancées à l\'entraînement, toutes séances comptées.' },
  elite: { name: 'Tireur d\'élite', icon: 'sniper', tiers: [40, 30, 20], dir: -1, unit: 'mm',
    text: 'Une séance d\'au moins 18 fléchettes visées avec un écart moyen à la cible aussi petit.' },
  mouchoir: { name: 'Mouchoir de poche', icon: 'target', tiers: [30, 22, 15], dir: -1, unit: 'mm',
    text: 'Une séance d\'au moins 9 fléchettes groupées à ce point autour de leur centre.' },
  progres: { name: 'En progrès', icon: 'up', tiers: [0.15, 0.3, 0.5], dir: 1, unit: 'part',
    text: 'Sur un même exercice, les 5 dernières séances meilleures que les 5 premières d\'autant (il en faut 10).' },
  defis: { name: 'Chasseur de défis', icon: 'flag', tiers: [10, 50, 200], dir: 1, unit: 'défis',
    text: 'Des petits défis réussis en séance (volée parfaite, trio, même trou, œil de bœuf).' },
});
export const TRAIN_BADGE_KEYS = Object.freeze(Object.keys(TRAIN_BADGES));

/** Rang atteint par une valeur (0 : aucun). */
export function tierOf(key, v) {
  const b = TRAIN_BADGES[key];
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  let t = 0;
  b.tiers.forEach((x, i) => { if (b.dir > 0 ? v >= x - 1e-9 : v <= x + 1e-9) t = i + 1; });
  return t;
}

const dayNum = ms => { const d = new Date(ms); return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000); };

/**
 * Badges d'entraînement d'un joueur, recalculés sur toutes ses séances closes (mises de côté exclues), de la plus
 * ancienne à la plus récente : { badges: [{ key, value, tier, got: [{ tier, sessionId, at }] }], feats: [{ key,
 * sessionId, volley, at }] }. `analyzeFn` : pour réutiliser un cache.
 */
export function trainingHonours(list, player, analyzeFn = analyze) {
  const ses = list.filter(r => r.player === player && r.endedAt !== null && r.endedAt !== undefined && !r.excluded && r.darts && r.darts.length)
    .sort((a, b) => a.startedAt - b.startedAt);
  const best = Object.fromEntries(TRAIN_BADGE_KEYS.map(k => [k, { value: null, tier: 0, got: [] }]));
  const bump = (k, v, r) => {
    const b = best[k], def = TRAIN_BADGES[k];
    if (v === null || v === undefined || !Number.isFinite(v)) return;
    if (b.value === null || (def.dir > 0 ? v > b.value : v < b.value)) b.value = v;
    const t = tierOf(k, b.value);
    for (let x = b.tier + 1; x <= t; x++) b.got.push({ tier: x, sessionId: r.id, at: r.startedAt });
    b.tier = Math.max(b.tier, t);
  };
  const feats = [];
  let darts = 0, streak = 0, lastDay = null;
  const byEx = new Map();
  for (const r of ses) {
    // Jours d'affilée.
    const dn = dayNum(r.startedAt);
    if (lastDay === null || dn > lastDay) { streak = lastDay !== null && dn === lastDay + 1 ? streak + 1 : 1; lastDay = dn; }
    bump('assidu', streak, r);
    darts += r.darts.length;
    bump('volume', darts, r);
    let a = null;
    try { a = analyzeFn(r); } catch (e) { a = null; }
    if (a && !a.game) {
      if (a.distN >= 18) bump('elite', a.dist, r);
      if (a.points >= 9 && a.spread !== null) bump('mouchoir', a.spread, r);
      const sv = sessionValue(r, a);
      if (sv && !r.stopped) {
        if (!byEx.has(r.exercise)) byEx.set(r.exercise, []);
        const vals = byEx.get(r.exercise);
        vals.push(sv);
        if (vals.length >= 10) {
          const m = xs => xs.reduce((s, x) => s + x.v, 0) / xs.length;
          const first = m(vals.slice(0, 5)), last = m(vals.slice(-5));
          if (Math.abs(first) > 1e-9) bump('progres', ((last - first) / Math.abs(first)) * sv.dir, r);
        }
      }
    }
    for (const f of sessionFeats(r)) feats.push({ ...f, sessionId: r.id, at: r.startedAt });
    bump('defis', feats.length, r);
  }
  return { badges: TRAIN_BADGE_KEYS.map(k => ({ key: k, ...best[k] })), feats, sessions: ses.length };
}

/** Valeur lisible d'un badge : « 14 jours », « 3,2 cm », « +32 % ». */
export function badgeValueText(key, v) {
  if (v === null || v === undefined) return '—';
  const b = TRAIN_BADGES[key];
  if (b.unit === 'mm') return `${(Math.round(v / 10 * 10) / 10).toFixed(1).replace('.', ',')} cm`;
  if (b.unit === 'part') return `${v >= 0 ? '+' : ''}${Math.round(v * 100)} %`;
  return `${Math.round(v)} ${b.unit}`;
}
/** Seuil d'un rang, lisible. */
export const tierText = (key, tier) => badgeValueText(key, TRAIN_BADGES[key].tiers[tier - 1]);
/** Nom d'un exercice pour la fenêtre d'un badge. */
export const exerciseName = k => (EXERCISES[k] || EXERCISES.libre).name;
