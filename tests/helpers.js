// Aides communes aux tests du moteur (aucun test ici).
import { parseDart } from '../src/engine/darts.js';
import { computeState, OUT_DOUBLE } from '../src/engine/x01.js';

/** 'T20 T20 0 D16 50' → liste de fléchettes. Lève si une notation est invalide. */
export function ds(text) {
  return text.trim().split(/\s+/).filter(Boolean).map(t => {
    const d = parseDart(t);
    if (!d) throw new Error(`notation invalide dans le test : ${t}`);
    return d;
  });
}

export const cfg = (over = {}) => ({ startScore: 501, outMode: OUT_DOUBLE, legsToWin: 1, players: ['A', 'B'], ...over });

/** Une volée ratée (3 fléchettes à 0). */
export const MISS3 = '0 0 0';

/** Fléchette qui rapproche au mieux de la finition (règles respectées, jamais de bust). */
export function bestDart(remaining, outMode) {
  if (remaining > 61) return 'T20';
  if (remaining === 61) return outMode === OUT_DOUBLE ? 'S20' : 'T20';
  if (outMode === OUT_DOUBLE) {
    if (remaining === 50) return '50';
    if (remaining <= 40 && remaining % 2 === 0) return `D${remaining / 2}`;
    if (remaining > 40) return `S${remaining - 40}`;
    return 'S1'; // impair ≤ 39 : laisse un pair ≥ 2
  }
  if (remaining <= 20) return `S${remaining}`;
  if (remaining === 25) return '25';
  if (remaining === 50) return '50';
  if (remaining % 3 === 0 && remaining / 3 <= 20) return `T${remaining / 3}`;
  if (remaining % 2 === 0 && remaining / 2 <= 20) return `D${remaining / 2}`;
  return 'S20';
}

/**
 * Fait gagner la manche en cours au joueur `winner` : il vise la finition, les autres ratent.
 * Renvoie la liste complétée.
 */
export function winLeg(config, darts, winner) {
  const list = [...darts];
  const start = computeState(config, list);
  for (let guard = 0; guard < 500; guard++) {
    const s = computeState(config, list);
    if (s.status === 'finished' || s.legNumber !== start.legNumber) return list;
    const p = s.currentPlayer;
    list.push(...ds(p === winner ? bestDart(s.remaining[p], s.config.outMode) : '0'));
  }
  throw new Error('winLeg : la manche ne se termine pas');
}
