// Strela — classement d'une partie X01 (lot 7), JS pur sans dépendance ni DOM. Tout se déduit de l'état du moteur.
//
// Ordre : d'abord les joueurs qui ont fini la dernière manche, dans l'ordre où ils ont fini (le gagnant en premier ;
// en jouant jusqu'au bout, tout le monde y est à la fin) ; puis les autres, par manches gagnées (le plus en tête), puis
// par reste dans la manche en cours ou finale (le plus petit en tête). Deux joueurs encore à égalité (mêmes manches,
// même reste) partagent la place.

/**
 * Classement : [{ player (rang dans la configuration), place (1, 2…), finished, legsWon, remaining }], du premier au
 * dernier.
 */
export function standings(state) {
  const n = state.config.players.length;
  const finished = new Set(state.finishOrder || []);
  const rows = [];
  (state.finishOrder || []).forEach((p, i) => rows.push({ player: p, place: i + 1, finished: true, legsWon: state.legsWon[p], remaining: state.remaining[p] }));
  const rest = [];
  for (let p = 0; p < n; p++) if (!finished.has(p)) rest.push({ player: p, finished: false, legsWon: state.legsWon[p], remaining: state.remaining[p] });
  rest.sort((a, b) => b.legsWon - a.legsWon || a.remaining - b.remaining || a.player - b.player);
  rest.forEach((r, i) => {
    const prev = rest[i - 1];
    r.place = prev && prev.legsWon === r.legsWon && prev.remaining === r.remaining ? prev.place : rows.length + i + 1;
  });
  return [...rows, ...rest];
}

/**
 * Joueur en tête pendant la partie (rang), ou null : seul en tête (pas d'égalité à la première place) et seulement
 * tant que personne n'a gagné. Personne n'est en tête au départ (tout le monde au même reste) ni en solo.
 */
export function leader(state) {
  if (state.config.players.length < 2 || state.winner !== null) return null;
  const s = standings(state);
  return s[0].place === 1 && s[1].place !== 1 ? s[0].player : null;
}

/**
 * Le dernier, qui paie sa tournée (partie terminée, 2 joueurs ou plus) : liste des rangs à la dernière place (plusieurs
 * en cas d'égalité, ils partagent la tournée) ; [] sinon.
 */
export function lastPlaces(state) {
  if (state.status !== 'finished' || state.config.players.length < 2) return [];
  const s = standings(state);
  const last = s[s.length - 1].place;
  if (last === 1) return [];
  return s.filter(r => r.place === last).map(r => r.player);
}

// ------------------------------------------------------------------ célébrations des nuls
// Après chaque volée close (sans finition), la pire chose qui vient d'arriver au joueur, s'il y en a une :
//   'serie' : 3 mauvaises volées d'affilée ou plus dans la manche (mauvaise = moins de 20 points, bust compris) ;
//   'bust'  : bust ;
//   'zero'  : volée à 0 point ;
//   'low'   : volée sous 20 points (sous 10 jusqu'au lot 7.4 ; relevé au lot 7.5, demande de Guillaume).
// Près de la fin (reste de départ de la volée sous 60), marquer peu est normal : seuls le bust et le 0 comptent, et la
// volée ne compte ni pour ni contre une série.
export const FLOP_BAD = 20;
export const FLOP_LOW = 20;
export const FLOP_SERIES = 3;
export const FLOP_NEAR = 60;

const counts = v => v.startRemaining >= FLOP_NEAR;
const bad = v => v.bust || v.scored < FLOP_BAD;

/** { kind, value } pour la dernière volée close de `state` (value : points, ou longueur de la série), ou null. */
export function flop(state) {
  const v = state.lastVisit;
  if (!v || v.finish || (state.lastEvent !== 'visit_end' && state.lastEvent !== 'bust')) return null;
  if (counts(v) && bad(v)) {
    let run = 0;
    const mine = state.visits.filter(x => x.player === v.player && x.leg === v.leg && counts(x));
    for (let i = mine.length - 1; i >= 0 && bad(mine[i]); i--) run += 1;
    if (run >= FLOP_SERIES) return { kind: 'serie', value: run };
  }
  if (v.bust) return { kind: 'bust', value: v.startRemaining };
  if (v.scored === 0) return { kind: 'zero', value: 0 };
  if (counts(v) && v.scored < FLOP_LOW) return { kind: 'low', value: v.scored };
  return null;
}

// Lot 7.6 : place d'une volée parmi d'autres (celles de la soirée, ou de la partie hors soirée), au résultat.
export const VISIT_RANK_MIN = 9; // volées en tout (celle-ci comprise) avant de classer quoi que ce soit
export const VISIT_RANK_TOP = 3;

/**
 * { kind: 'best' | 'worst', rank } si la volée qui vaut `x` points est parmi les 3 meilleures ou les 3 pires de
 * `others` + elle-même, sinon null. Rang = 1 + autres volées strictement meilleures (ou pires) : à égalité, on partage le
 * rang. Rien avant VISIT_RANK_MIN volées en tout, ni si elle est à la fois parmi les meilleures et les pires.
 */
export function visitStanding(x, others) {
  if (!Number.isFinite(x) || others.length + 1 < VISIT_RANK_MIN) return null;
  const best = 1 + others.filter(y => y > x).length;
  const worst = 1 + others.filter(y => y < x).length;
  if (best <= VISIT_RANK_TOP && worst <= VISIT_RANK_TOP) return null;
  if (best <= VISIT_RANK_TOP) return { kind: 'best', rank: best };
  if (worst <= VISIT_RANK_TOP) return { kind: 'worst', rank: worst };
  return null;
}
