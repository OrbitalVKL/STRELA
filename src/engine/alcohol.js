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
    for (const d of list) { const t = drinkTime(d); if (Number.isFinite(t) && t <= now && now - t <= WINDOW_MS) out.push(t); }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Verres d'une partie rangés dans son historique (lot 7.1) : pour chaque volée (rang dans state.visits) et pour la
 * volée en cours ('open'), { here: verres pris pendant cette volée ou juste avant (depuis la volée précédente du même
 * joueur), total: verres du joueur jusque-là dans la partie }. Un verre pris après la dernière volée du joueur (ou un
 * verre de la v0.7.0, sans place) va à sa volée en cours, sinon à sa dernière volée.
 *   drinks : g.drinks ; ids : config.players ; renvoie Map(clé → { here, total }) et totals[rang du joueur].
 */
export function drinksTimeline(state, drinks, ids) {
  const byVisit = new Map();
  const totals = ids.map(() => 0);
  if (!drinks) return { byVisit, totals };
  // Bornes de chaque volée dans la liste des fléchettes (les volées sont dans l'ordre du jeu).
  const mine = ids.map(() => []); // [{ key, end }] par joueur
  let pos = 0;
  state.visits.forEach((v, i) => { pos += v.darts.length; mine[v.player].push({ key: i, end: pos }); });
  if (state.visit && state.status === 'playing') mine[state.visit.player].push({ key: 'open', end: Infinity });
  ids.forEach((id, p) => {
    const list = Array.isArray(drinks[id]) ? drinks[id] : [];
    const slots = mine[p];
    if (!list.length || !slots.length) { totals[p] = list.length; return; }
    const here = new Array(slots.length).fill(0);
    for (const d of list) {
      const at = drinkAt(d);
      let k = at === null ? -1 : slots.findIndex(s => s.end >= at);
      if (k < 0) k = slots.length - 1;
      here[k] += 1;
    }
    let total = 0;
    slots.forEach((s, k) => { total += here[k]; byVisit.set(s.key, { here: here[k], total, player: p }); });
    totals[p] = list.length;
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
      .map(d => (typeof d === 'number' ? d : drinkAt(d) === null ? { t: d.t } : { t: d.t, at: d.at }));
    if (ok.length) out[id] = ok;
  }
  return Object.keys(out).length ? out : null;
}
