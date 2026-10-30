// Strela — tour de jeu côté interface (JS pur, testé) : validation de chaque volée.
// Après la 3e fléchette ou un bust, la volée reste affichée jusqu'à VALIDER. Le moteur ne change pas : la partie
// en cours garde seulement `validated` = nombre de fléchettes au moment de la dernière validation. Ce champ est
// enregistré avec la partie (lot 2) : une volée en attente le reste après une fermeture de l'appli.
// Une finition ne passe pas par là : l'écran de fin de manche sert de validation.
import { EVENTS } from '../engine/x01.js';

/** Volée close qui attend VALIDER, ou null. */
export function pendingVisit(state, validated) {
  if (!state || state.status !== 'playing') return null;
  const closed = state.lastEvent === EVENTS.VISIT_END || state.lastEvent === EVENTS.BUST;
  return closed && validated !== state.dartCount ? state.lastVisit : null;
}

/**
 * `validated` après ANNULER (liste ramenée à `length` fléchettes) : on ne garde pas une validation « dans le
 * futur », sinon rejouer la même fléchette passerait sans VALIDER.
 */
export const validatedAfterUndo = (validated, length) => Math.min(validated, length);
