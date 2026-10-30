// Strela — table de finitions X01 : quelle volée termine la manche depuis un reste donné ?
// JS pur, sans dépendance ni affichage. Tables calculées une fois par réglage (sortie simple ou double, 1 à 3
// fléchettes restantes, préférences du joueur), puis gardées.
//
// Préférences du joueur (lot 4, fiche joueur) : `double` = double de sortie préféré (D20 par défaut), `avoidBull` =
// éviter le bull (25 et 50) tant qu'une autre route existe avec les fléchettes qui restent.
//
// Règle de choix, dans l'ordre :
//   0. avec « éviter le bull » : une route sans 25 ni 50 dès qu'il en existe une (50 → S10 D20) ; sinon le bull
//      reste proposé (170 = T20 T20 50) ;
//   1. le moins de fléchettes possible ;
//   2. sortie double : le double final préféré du joueur, puis les plus « classiques » (D20, D16, D8, D18, D12…,
//      50 en dernier) ;
//   3. à valeur proche, une première fléchette qui laisse encore un double si elle ne fait que le simple (le raté le
//      plus courant d'un triple : T20 → S20) ;
//   4. fléchettes de préparation les plus simples (jouées de la plus grosse à la plus petite) : simple plutôt que
//      triple, gros triples (T20, T19…) quand il en faut, jamais de double ni de 50 en préparation sauf nécessité.
// Une route n'est jamais proposée si une fléchette intermédiaire provoquerait un bust. L'existence d'une finition
// (stats : « chance de finition ») ne dépend pas des préférences.

import { makeDart, dartValue, isDouble, SINGLE, DOUBLE, TRIPLE, BULL } from './darts.js';
import { isBust, OUT_SINGLE, OUT_DOUBLE, DARTS_PER_VISIT } from './x01.js';

// Toutes les fléchettes qui marquent (le 0 ne sert jamais dans une finition).
const ALL = [];
for (let s = 1; s <= 20; s++) for (const m of [SINGLE, DOUBLE, TRIPLE]) ALL.push(makeDart(s, m));
ALL.push(makeDart(BULL, SINGLE), makeDart(BULL, DOUBLE));

// Ordre de préférence des doubles de sortie (les plus joués d'abord, ils se « replient » bien : 40 → 20 → 10 → 5).
export const DOUBLE_RANK = Object.freeze([20, 16, 8, 18, 12, 10, 14, 6, 4, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1]);

/** Préférences par défaut d'un joueur (fiche joueur, lot 4). */
export const DEFAULT_PREFS = Object.freeze({ double: 20, avoidBull: false });

/** Préférences lues telles quelles (enregistrement, sauvegarde) : tout ce qui n'est pas valide reprend le défaut. */
export function checkoutPrefs(p) {
  const d = p && Number(p.double);
  return {
    double: Number.isInteger(d) && d >= 1 && d <= 20 ? d : DEFAULT_PREFS.double,
    avoidBull: !!(p && p.avoidBull === true),
  };
}

/** Rang des doubles pour un double préféré : le préféré d'abord, puis l'ordre classique. */
const rankFor = pref => (pref === DOUBLE_RANK[0] ? DOUBLE_RANK : [pref, ...DOUBLE_RANK.filter(d => d !== pref)]);

/** Coût d'une fléchette finale (plus petit = préféré). */
function finishCost(dart, outMode, rank) {
  if (outMode === OUT_DOUBLE) {
    if (dart.segment === BULL) return 30; // 50 : en dernier recours
    return rank.indexOf(dart.segment);
  }
  // Sortie simple : un simple, puis un triple, puis un double ; à type égal, le plus gros.
  const kind = dart.segment === BULL ? (dart.multiplier === DOUBLE ? 3 : 1) : { 1: 0, 3: 1, 2: 2 }[dart.multiplier];
  return kind * 30 + (25 - Math.min(dart.segment, 20));
}

/** Coût d'une fléchette de préparation (avant la dernière). */
function setupCost(dart) {
  if (dart.segment === BULL) return dart.multiplier === DOUBLE ? 60 : 40;
  if (dart.multiplier === SINGLE) return (20 - dart.segment) / 4;  // simple : peu importe lequel, le double final décide
  if (dart.multiplier === TRIPLE) return 20 + (20 - dart.segment); // triple : T20, T19, T18…
  return 80 + (20 - dart.segment);                                  // double : à éviter
}

const isBull = d => d.segment === BULL;

/**
 * Raté le plus courant de la première fléchette : un triple (ou un double, ou le 50) qui ne fait que le simple. Si le
 * reste laisse encore un double d'une fléchette (D1 à D20), rien ; s'il se finit encore avec les fléchettes qui restent, un peu ;
 * sinon, plus. Une première fléchette simple ne compte pas : le simple est ce qu'on vise.
 */
function missCost(remaining, route, outMode, dartsLeft) {
  const first = route[0];
  if (route.length < 2 || first.multiplier === SINGLE) return 0;
  const left = remaining - (isBull(first) ? BULL : first.segment);
  if (left !== 50 && finishable(left, outMode, 1)) return 0; // un double (le 50 n'en est pas un ici : trop petit)
  if (dartsLeft > 1 && finishable(left, outMode, dartsLeft - 1)) return 2;
  return 6;
}

function routeCost(route, outMode, rank) {
  return route.slice(0, -1).reduce((sum, d) => sum + setupCost(d), 0) + finishCost(route[route.length - 1], outMode, rank) * 5;
}

/** Vrai si la route termine exactement à 0 depuis `remaining`, sans bust en chemin. */
export function isCheckoutRoute(remaining, route, outMode) {
  if (!Array.isArray(route) || route.length < 1 || route.length > DARTS_PER_VISIT) return false;
  let left = remaining;
  for (const d of route) {
    if (isBust(left, d, outMode)) return false;
    left -= dartValue(d);
  }
  return left === 0;
}

const TABLES = new Map(); // `${outMode}:${darts}:${double}:${bull}` → Map(reste → route)

// Existence d'une finition (sans préférence) : reste → nombre minimal de fléchettes, par sortie.
const REACH = new Map();
function finishable(remaining, outMode, darts) {
  if (!REACH.has(outMode)) {
    const reach = new Map();
    const finals = ALL.filter(d => outMode === OUT_SINGLE || isDouble(d));
    const note = (route, n) => {
      const total = route.reduce((s, d) => s + dartValue(d), 0);
      if ((reach.get(total) ?? 9) > n && isCheckoutRoute(total, route, outMode)) reach.set(total, n);
    };
    for (const f of finals) {
      note([f], 1);
      for (const a of ALL) { note([a, f], 2); for (const b of ALL) note([a, b, f], 3); }
    }
    REACH.set(outMode, reach);
  }
  return (REACH.get(outMode).get(remaining) ?? 9) <= darts;
}

function buildTable(outMode, maxDarts, prefs) {
  const best = new Map();
  const rank = rankFor(prefs.double);
  const finals = ALL.filter(d => outMode === OUT_SINGLE || isDouble(d));
  const offer = raw => {
    // préparation dans l'ordre où on la joue d'habitude : la plus grosse d'abord (T20 S20 D20)
    const route = [...raw.slice(0, -1).sort((a, b) => dartValue(b) - dartValue(a)), raw[raw.length - 1]];
    const total = route.reduce((s, d) => s + dartValue(d), 0);
    const bull = prefs.avoidBull && route.some(isBull) ? 1e6 : 0;
    const cost = bull + route.length * 1000 + routeCost(route, outMode, rank) + missCost(total, route, outMode, maxDarts);
    const cur = best.get(total);
    if ((!cur || cost < cur.cost) && isCheckoutRoute(total, route, outMode)) best.set(total, { route, cost });
  };
  for (const f of finals) {
    offer([f]);
    if (maxDarts < 2) continue;
    for (const a of ALL) {
      offer([a, f]);
      if (maxDarts < 3) continue;
      for (const b of ALL) offer([a, b, f]);
    }
  }
  return new Map([...best].map(([k, v]) => [k, Object.freeze(v.route)]));
}

/**
 * Finition proposée : liste de 1 à `dartsLeft` fléchettes qui termine la manche depuis `remaining`,
 * ou null si ce n'est pas jouable avec les fléchettes qui restent dans la volée. `prefs` : préférences du joueur
 * ({ double, avoidBull }, voir checkoutPrefs) ; elles changent la route, jamais l'existence d'une finition.
 */
export function suggestCheckout(remaining, outMode = OUT_DOUBLE, dartsLeft = DARTS_PER_VISIT, prefs = DEFAULT_PREFS) {
  if (outMode !== OUT_SINGLE && outMode !== OUT_DOUBLE) return null;
  if (!Number.isInteger(remaining) || remaining < 1) return null;
  const n = Math.max(0, Math.min(DARTS_PER_VISIT, Math.floor(dartsLeft)));
  if (n === 0) return null;
  const pr = checkoutPrefs(prefs);
  const key = `${outMode}:${n}:${outMode === OUT_DOUBLE ? pr.double : 0}:${pr.avoidBull ? 1 : 0}`;
  if (!TABLES.has(key)) TABLES.set(key, buildTable(outMode, n, pr));
  return TABLES.get(key).get(remaining) || null;
}

/** Plus grande finition possible en 3 fléchettes (170 en sortie double, 180 en sortie simple). */
export const maxCheckout = outMode => (outMode === OUT_DOUBLE ? 170 : 180);
