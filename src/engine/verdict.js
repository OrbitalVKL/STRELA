// Strela — verdict de chaque fléchette (lot 9.6 C, docs/lot-9-6.md), JS pur (tests/verdict.test.js).
//
// Chaque mode dit si la fléchette est réussie, neutre ou ratée PAR RAPPORT À L'OBJECTIF DU MOMENT, et le son suit ce
// verdict (src/ui/feedback.js › verdictSound), pas la valeur brute : un simple 7 en serpent quand le 7 est visé sonne
// comme une réussite. Un nouveau mode ou exercice n'a qu'à fournir son verdict.
//   { v: 'hit' | 'neutral' | 'miss' | 'off', rich: bool (double ou triple voulu réussi, finition), why }

import { MISS, BULL } from './darts.js';
import { isHit } from './training.js';
import { suggestCheckout, maxCheckout } from './checkout.js';

export const VERDICTS = Object.freeze(['hit', 'neutral', 'miss', 'off']);
const out = (v, rich = false, why = '') => ({ v, rich, why });

/**
 * X01 : `before` = reste avant la fléchette, `after` = reste après (sans bust), `bust`, `finish`, `outMode`,
 * `dartsLeft` = fléchettes restant dans la volée avant celle-ci (3, 2, 1).
 * Finition : réussie ; bust : ratée. Zone de finition : réussie si la fléchette laisse une finition possible avec ce qui
 * reste de la volée (ou, à la dernière fléchette, un reste qui se finit d’une fléchette), neutre sinon. Scoring : triple = réussi (riche dès le T15),
 * double ou 15 points et plus = neutre, moins = raté.
 */
export function x01Verdict({ dart, before, after, bust = false, finish = false, outMode = 'double', dartsLeft = 3 }) {
  if (dart.segment === MISS) return out('off', false, 'hors cible');
  if (finish) return out('hit', true, 'finition');
  if (bust) return out('miss', false, 'bust');
  const pts = dart.segment * dart.multiplier;
  if (Number.isInteger(before) && before <= maxCheckout(outMode) && suggestCheckout(before, outMode, dartsLeft)) {
    const left = dartsLeft - 1;
    const keeps = Number.isInteger(after) && after > 0 && (left > 0 ? !!suggestCheckout(after, outMode, left) : !!suggestCheckout(after, outMode, 1));
    return keeps ? out('hit', dart.multiplier > 1, 'finition préparée') : out('neutral', false, 'finition manquée');
  }
  if (dart.multiplier === 3) return out('hit', dart.segment >= 15 || dart.segment === BULL, 'triple');
  if (dart.segment === BULL) return out('hit', dart.multiplier === 2, 'bull');
  if (dart.multiplier === 2 || pts >= 15) return out('neutral', false, 'points');
  return out('miss', false, 'petit score');
}

/**
 * Cricket : `marks` = marques comptées par cette fléchette (ouvrir, fermer ou marquer des points), `target` = la
 * fléchette tombe-t-elle sur un numéro du Cricket (15 à 20, bull). Marque : réussie (riche à 2 ou 3 marques) ; numéro
 * du Cricket déjà fermé partout : neutre ; ailleurs : ratée.
 */
export function cricketVerdict({ dart, marks = 0, target = false }) {
  if (dart.segment === MISS) return out('off', false, 'hors cible');
  if (marks > 0) return out('hit', marks >= 2, `${marks} marque(s)`);
  if (target) return out('neutral', false, 'cible fermée');
  return out('miss', false, 'hors des cibles du Cricket');
}

/**
 * Exercice à cible (serpent, haut-bas, tour de l'horloge, 20-19-18…) : `t` = cible visée { s, z }. Dans la cible :
 * réussie (riche si le double, le triple ou le 50 était visé) ; bon secteur, mauvaise zone : neutre ; ailleurs : ratée.
 */
export function targetVerdict({ dart, t }) {
  if (dart.segment === MISS) return out('off', false, 'hors cible');
  if (!t || !t.s) return out(dart.multiplier > 1 ? 'hit' : 'neutral', dart.multiplier === 3, 'sans cible');
  if (isHit(t, dart)) return out('hit', t.z === 't' || t.z === 'd' || (t.s === BULL && t.z === 'd'), 'dans la cible');
  if (dart.segment === t.s) return out('neutral', false, 'bon secteur');
  return out('miss', false, 'à côté');
}

/** Son d'un verdict (feedback.js › SOUNDS). */
export const verdictSoundKey = vd => (vd.v === 'hit' ? (vd.rich ? 'v-rich' : 'v-hit') : vd.v === 'neutral' ? 'v-neutral' : vd.v === 'miss' ? 'v-miss' : 'v-off');

/** Série : réussites de suite (0 si la fléchette n'est pas réussie) ; le ton monte d'un demi-ton par réussite, 7 au plus. */
export const nextStreak = (streak, vd) => (vd.v === 'hit' ? streak + 1 : 0);
export const streakStep = streak => Math.max(0, Math.min(7, streak - 1));

/** Son d'un défi : arrivée ('in'), réussi (true), raté (false). */
export const defiSound = x => (x === 'in' ? 'defi-in' : x ? 'defi-ok' : 'defi-ko');

/** Priorités des sons (le plus haut coupe les plus bas pendant qu'il joue). */
export const PRIORITY = Object.freeze({ record: 4, badge: 3, defi: 2, dart: 1, key: 0 });

/** Bonne volée (X01) : 60 points et plus — le haut des paliers de la fiche Évolution (engine/evolution.js › TIERS). */
export const GOOD_VISIT = 60;
