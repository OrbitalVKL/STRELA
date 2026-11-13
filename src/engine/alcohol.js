// Strela — compteur de verres et alcoolémie estimée (lot 7), JS pur sans dépendance ni DOM.
//
// Estimation volontairement simple (formule de Widmark), pour le jeu : chaque verre est un verre standard (10 g
// d'alcool pur : un demi de bière, un verre de vin, un shot), absorbé d'un coup ; le corps en élimine 0,15 g/L par
// heure. Faute de poids et de sexe, on prend 70 kg et un coefficient de diffusion de 0,65 : un verre ≈ 0,22 g/L.
// Les verres comptent sur 24 heures, toutes parties confondues (une soirée de plusieurs parties s'additionne).
// Ce n'est pas une mesure : l'écran le dit, et rappelle les limites pour conduire.

export const GRAMS_PER_DRINK = 10;
export const WEIGHT_KG = 70;
export const DIFFUSION = 0.65;
export const ELIMINATION = 0.15; // g/L par heure
export const WINDOW_MS = 24 * 3600e3;
export const DRIVE_LIMIT = 0.5;   // g/L (France)
export const YOUNG_LIMIT = 0.2;   // g/L (permis probatoire)

const HOUR = 3600e3;
const PER_DRINK = GRAMS_PER_DRINK / (WEIGHT_KG * DIFFUSION);

/** Alcoolémie estimée (g/L) à `now` pour des verres pris aux instants `times` (ms). Les verres futurs sont ignorés. */
export function bac(times, now) {
  const list = (times || []).filter(t => Number.isFinite(t) && t <= now).sort((a, b) => a - b);
  let level = 0;
  let at = null;
  for (const t of list) {
    if (at !== null) level = Math.max(0, level - ELIMINATION * ((t - at) / HOUR));
    level += PER_DRINK;
    at = t;
  }
  if (at !== null) level = Math.max(0, level - ELIMINATION * ((now - at) / HOUR));
  return level;
}

// Version 0.8.2 : un verre (25 cl) ou une pinte (50 cl). La pinte porte `v: 0.5` ; sans `v`, c'est un verre de 25 cl
// (tous les verres d'avant). Tous les comptes sont en verres de 25 cl : une pinte compte pour 2 (drinkUnits). Le détail
// (« 1 verre + 2 pintes ») se lit avec drinkTally.
export const GLASS_L = 0.25;
export const PINT_L = 0.5;
export const isPint = d => !!d && typeof d === 'object' && d.v === PINT_L;
/** Ce que compte un verre enregistré : 1 (verre de 25 cl) ou 2 (pinte). */
export const drinkUnits = d => (isPint(d) ? 2 : 1);
/** Compte d'une liste de verres enregistrés, en verres de 25 cl. */
export const unitsOf = list => (Array.isArray(list) ? list.reduce((n, d) => n + drinkUnits(d), 0) : 0);
/** Détail d'une ou plusieurs listes : { units (verres de 25 cl), glasses, pints, liters }. */
export function drinkTally(...lists) {
  let glasses = 0, pints = 0;
  for (const list of lists) for (const d of (Array.isArray(list) ? list : [])) { if (isPint(d)) pints += 1; else glasses += 1; }
  return { units: glasses + 2 * pints, glasses, pints, liters: glasses * GLASS_L + pints * PINT_L };
}
/** « 1 verre + 2 pintes » ('' s'il n'y a rien). */
export function tallyText(t) {
  const parts = [];
  if (t.glasses) parts.push(`${t.glasses} verre${t.glasses > 1 ? 's' : ''}`);
  if (t.pints) parts.push(`${t.pints} pinte${t.pints > 1 ? 's' : ''}`);
  return parts.join(' + ');
}
/** « 1,25 L » (ou « 75 cl » sous le litre). */
export const litersText = l => (l < 1 ? `${Math.round(l * 100)} cl` : `${(Math.round(l * 100) / 100).toString().replace('.', ',')} L`);

// Un verre enregistré (lot 7.1) : { t: instant (ms), at: nombre de fléchettes jouées dans la partie à ce moment }. `at`
// le place dans l'historique de la partie, comme une fléchette. Les verres de la v0.7.0 sont de simples instants (pas
// de `at`) : ils restent lus, rangés à la dernière volée du joueur.
export const drinkTime = d => (typeof d === 'number' ? d : d && d.t);
export const drinkAt = d => (d && typeof d === 'object' && Number.isInteger(d.at) && d.at >= 0 ? d.at : null);

/** Instants des verres d'un joueur dans une liste de parties ({ drinks: { [id]: [verre] } }), sur les 24 dernières heures. */
export function drinkTimes(games, playerId, now) {
  const out = [];
  for (const g of games) {
    const list = g && g.drinks && g.drinks[playerId];
    if (!Array.isArray(list)) continue;
    for (const d of list) {
      const t = drinkTime(d);
      if (Number.isFinite(t) && t <= now && now - t <= WINDOW_MS) for (let k = drinkUnits(d); k > 0; k--) out.push(t); // pinte : 2 verres
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Verres d'une partie rangés dans son historique (lot 7.1) : pour chaque volée (rang dans state.visits) et pour la
 * volée en cours ('open'), { here: verres pris pendant cette volée ou juste avant (depuis la volée précédente du même
 * joueur), total: verres du joueur jusque-là dans la partie }. Un verre pris après la dernière volée du joueur (ou un
 * verre de la v0.7.0, sans place) va à sa volée en cours, sinon à sa dernière volée.
 *   drinks : g.drinks ; ids : config.players ; renvoie Map(clé → { here, total }) et totals[rang du joueur].
 *   before (lot 7.6) : g.drinksBefore, verres de la soirée avant la partie ({ [joueur]: n }) : le cumul part de là.
 */
export function drinksTimeline(state, drinks, ids, before = null) {
  const byVisit = new Map();
  const start = id => (before && Number.isInteger(before[id]) && before[id] > 0 ? before[id] : 0);
  const totals = ids.map(id => start(id));
  if (!drinks && !ids.some(id => start(id))) return { byVisit, totals };
  drinks = drinks || {};
  // Bornes de chaque volée dans la liste des fléchettes (les volées sont dans l'ordre du jeu).
  const mine = ids.map(() => []); // [{ key, end }] par joueur
  let pos = 0;
  state.visits.forEach((v, i) => { pos += v.darts.length; mine[v.player].push({ key: i, end: pos }); });
  if (state.visit && state.status === 'playing') mine[state.visit.player].push({ key: 'open', end: Infinity });
  ids.forEach((id, p) => {
    const list = Array.isArray(drinks[id]) ? drinks[id] : [];
    const slots = mine[p];
    if (!slots.length || (!list.length && !start(id))) { totals[p] = start(id) + unitsOf(list); return; }
    const here = new Array(slots.length).fill(0);
    for (const d of list) {
      const at = drinkAt(d);
      let k = at === null ? -1 : slots.findIndex(s => s.end >= at);
      if (k < 0) k = slots.length - 1;
      here[k] += drinkUnits(d); // 0.8.2 : en verres de 25 cl (une pinte : 2)
    }
    let total = start(id);
    slots.forEach((s, k) => { total += here[k]; byVisit.set(s.key, { here: here[k], total, player: p }); });
    totals[p] = start(id) + unitsOf(list);
  });
  return { byVisit, totals };
}

/** « 0,45 » (deux décimales, virgule). */
export const formatBac = x => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');

/** Niveau pour l'affichage : 'zero' (rien), 'ok' (sous 0,2), 'young' (0,2 à 0,5), 'over' (0,5 et plus). */
export const bacLevel = x => (x < 0.005 ? 'zero' : x < YOUNG_LIMIT ? 'ok' : x < DRIVE_LIMIT ? 'young' : 'over');

/** Champ `drinks` d'une partie nettoyé (identifiant → liste d'instants), ou null s'il est vide ou illisible. */
export function cleanDrinks(drinks) {
  if (!drinks || typeof drinks !== 'object' || Array.isArray(drinks)) return null;
  const out = {};
  for (const [id, list] of Object.entries(drinks)) {
    if (!Array.isArray(list)) continue;
    const ok = list.filter(d => Number.isFinite(drinkTime(d)))
      .map(d => {
        if (typeof d === 'number') return d;
        const out = drinkAt(d) === null ? { t: d.t } : { t: d.t, at: d.at };
        if (isPint(d)) out.v = PINT_L; // 0.8.2 : pinte
        return out;
      });
    if (ok.length) out[id] = ok;
  }
  return Object.keys(out).length ? out : null;
}
