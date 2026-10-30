// Strela — table de finitions X01 : quelle volée termine la manche depuis un reste donné ?
// JS pur, sans dépendance ni affichage. Table simple, calculée une fois (sortie simple et double,
// 1 à 3 fléchettes restantes) ; affinée au lot 4 (préférences du joueur, double préféré…).
//
// Règle de choix, dans l'ordre :
//   1. le moins de fléchettes possible ;
//   2. sortie double : le double final le plus « classique » (D20, D16, D8, D18, D12…, 50 en dernier) ;
//   3. fléchettes de préparation les plus simples (jouées de la plus grosse à la plus petite) : simple plutôt que triple, gros triples (T20, T19…)
//      quand il en faut, jamais de double ni de 50 en préparation sauf nécessité (ex. 170 = T20 T20 50).
// Une route n'est jamais proposée si une fléchette intermédiaire provoquerait un bust.

import { makeDart, dartValue, isDouble, SINGLE, DOUBLE, TRIPLE, BULL } from './darts.js';
import { isBust, OUT_SINGLE, OUT_DOUBLE, DARTS_PER_VISIT } from './x01.js';

// Toutes les fléchettes qui marquent (le 0 ne sert jamais dans une finition).
const ALL = [];
for (let s = 1; s <= 20; s++) for (const m of [SINGLE, DOUBLE, TRIPLE]) ALL.push(makeDart(s, m));
ALL.push(makeDart(BULL, SINGLE), makeDart(BULL, DOUBLE));

// Ordre de préférence des doubles de sortie (les plus joués d'abord, ils se « replient » bien : 40 → 20 → 10 → 5).
const DOUBLE_RANK = [20, 16, 8, 18, 12, 10, 14, 6, 4, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];

/** Coût d'une fléchette finale (plus petit = préféré). */
function finishCost(dart, outMode) {
  if (outMode === OUT_DOUBLE) {
    if (dart.segment === BULL) return 30; // 50 : en dernier recours
    return DOUBLE_RANK.indexOf(dart.segment);
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

const routeCost = (route, outMode) =>
  route.slice(0, -1).reduce((sum, d) => sum + setupCost(d), 0) + finishCost(route[route.length - 1], outMode) * 5;

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

const TABLES = new Map(); // `${outMode}:${darts}` → Map(reste → route)

function buildTable(outMode, maxDarts) {
  const best = new Map();
  const finals = ALL.filter(d => outMode === OUT_SINGLE || isDouble(d));
  const offer = raw => {
    // préparation dans l'ordre où on la joue d'habitude : la plus grosse d'abord (T20 S20 D20)
    const route = [...raw.slice(0, -1).sort((a, b) => dartValue(b) - dartValue(a)), raw[raw.length - 1]];
    const total = route.reduce((s, d) => s + dartValue(d), 0);
    const cost = route.length * 1000 + routeCost(route, outMode);
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
 * ou null si ce n'est pas jouable avec les fléchettes qui restent dans la volée.
 */
export function suggestCheckout(remaining, outMode = OUT_DOUBLE, dartsLeft = DARTS_PER_VISIT) {
  if (outMode !== OUT_SINGLE && outMode !== OUT_DOUBLE) return null;
  if (!Number.isInteger(remaining) || remaining < 1) return null;
  const n = Math.max(0, Math.min(DARTS_PER_VISIT, Math.floor(dartsLeft)));
  if (n === 0) return null;
  const key = `${outMode}:${n}`;
  if (!TABLES.has(key)) TABLES.set(key, buildTable(outMode, n));
  return TABLES.get(key).get(remaining) || null;
}

/** Plus grande finition possible en 3 fléchettes (170 en sortie double, 180 en sortie simple). */
export const maxCheckout = outMode => (outMode === OUT_DOUBLE ? 170 : 180);
