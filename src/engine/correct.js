// Strela — corriger une fléchette déjà jouée (lot 3), JS pur sans dépendance ni affichage.
//
// La fléchette n° `index` de la liste est remplacée, puis toute la partie est recalculée (computeState). La
// correction n'est acceptée que si elle ne change pas le déroulé de la partie : chaque fléchette suivante reste
// attribuée au même joueur, dans la même volée de la même manche, et la partie en est au même point (joueur à qui
// c'est le tour, manche, volée commencée, partie finie ou non). Sinon (un bust qui coupe une volée, une finition qui
// clôt une manche plus tôt, une volée qui ne finit plus la manche…), elle est refusée : on passe par ANNULER.

import { dartError, makeDart, dartValue } from './darts.js';
import { computeState } from './x01.js';

export const CORRECT_ERRORS = Object.freeze({
  INVALID: 'INVALID',             // fléchette invalide (T25, D0…)
  OUT_OF_RANGE: 'OUT_OF_RANGE',   // pas de fléchette à ce rang
  SAME: 'SAME',                   // la même fléchette : rien à corriger
  CHANGES_FLOW: 'CHANGES_FLOW',   // le déroulé de la partie changerait
});

/** Pour chaque fléchette de la liste : rang de sa volée (dans visits, la volée ouverte en dernier), joueur, manche. */
export function dartOwners(state) {
  const out = [];
  state.visits.forEach((v, k) => v.darts.forEach(() => out.push({ visit: k, player: v.player, leg: v.leg })));
  if (state.visit) state.visit.darts.forEach(() => out.push({ visit: state.visits.length, player: state.visit.player, leg: state.legNumber }));
  return out;
}

/** Volée (rang dans state.visits, ou 'open') et rang dans la volée de la fléchette n° `index`. */
export function locateDart(state, index) {
  const owners = dartOwners(state);
  const o = owners[index];
  if (!o) return null;
  const first = owners.findIndex(x => x.visit === o.visit);
  return { visitIdx: o.visit === state.visits.length ? 'open' : o.visit, n: index - first, player: o.player, leg: o.leg };
}

/** Rang, dans la liste des fléchettes, de la première fléchette de la volée `visitIdx` (rang ou 'open'). */
export function visitStart(state, visitIdx) {
  const upto = visitIdx === 'open' ? state.visits.length : visitIdx;
  let k = 0;
  for (let i = 0; i < upto; i++) k += state.visits[i].darts.length;
  return k;
}

const sameFlow = (a, b) => a.status === b.status && a.currentPlayer === b.currentPlayer && a.legNumber === b.legNumber
  && a.visits.length === b.visits.length && a.dartNumber === b.dartNumber && a.winner === b.winner;

/**
 * Corrige la fléchette n° `index` (0 = la première) : { ok: true, darts (nouvelle liste), before, after (états),
 * effects } ou { ok: false, error } — la liste d'origine n'est jamais modifiée. `dart` peut porter `pos` (saisie sur
 * la cible) ; sinon la fléchette corrigée n'a plus de position (elle sera marquée au centre de son segment).
 * effects : { player, leg, visitIdx, visit: [total avant, total après] (null = bust), remaining: [avant, après] (reste
 * du joueur maintenant, ou à la fin de la manche si elle est finie) }.
 */
export function correctDart(config, darts, index, dart) {
  if (dartError(dart)) return { ok: false, error: CORRECT_ERRORS.INVALID };
  if (!Number.isInteger(index) || index < 0 || index >= darts.length) return { ok: false, error: CORRECT_ERRORS.OUT_OF_RANGE };
  const old = darts[index];
  if (old.segment === dart.segment && old.multiplier === dart.multiplier) return { ok: false, error: CORRECT_ERRORS.SAME };
  const fixed = { ...makeDart(dart.segment, dart.multiplier) };
  if (Array.isArray(dart.pos)) fixed.pos = dart.pos;
  const next = darts.map((d, i) => (i === index ? fixed : d));
  const before = computeState(config, darts);
  let after;
  try { after = computeState(config, next); } catch (e) { return { ok: false, error: CORRECT_ERRORS.CHANGES_FLOW }; }
  const a = dartOwners(before), b = dartOwners(after);
  const moved = a.length !== b.length || a.some((o, i) => i >= index && (o.visit !== b[i].visit || o.player !== b[i].player || o.leg !== b[i].leg));
  if (moved || !sameFlow(before, after)) return { ok: false, error: CORRECT_ERRORS.CHANGES_FLOW };
  const where = locateDart(before, index);
  const visitOf = s => (where.visitIdx === 'open' ? s.visit : s.visits[where.visitIdx]);
  const vb = visitOf(before), va = visitOf(after);
  const shown = v => (v.bust ? null : v.darts.reduce((n, d) => n + dartValue(d), 0));
  const restOf = s => {
    if (where.leg === s.legNumber && s.status === 'playing') return s.remaining[where.player];
    const leg = s.legs.find(l => l.number === where.leg);
    return leg && leg.finalRemaining ? leg.finalRemaining[where.player] : s.remaining[where.player];
  };
  return {
    ok: true, darts: next, before, after,
    effects: { player: where.player, leg: where.leg, visitIdx: where.visitIdx, visit: [shown(vb), shown(va)], remaining: [restOf(before), restOf(after)] },
  };
}
