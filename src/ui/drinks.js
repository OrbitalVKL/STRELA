// Strela — verre (25 cl) ou pinte (50 cl) (version 0.8.2, demande de Guillaume). Partagé par tous les écrans où l'on
// ajoute des verres (panneau des verres et menu pause du jeu, écran Soirée, détail d'une partie) :
// - un choix « VERRE 25 CL · PINTE 50 CL » au-dessus de la liste : les boutons + ajoutent ce qui est choisi (une tournée
//   de pintes : on choisit PINTE une fois, puis + pour chacun) ; le choix dure le temps de la session ;
// - le compte reste « [verre] x5 », en verres de 25 cl : une pinte compte pour 2 ; s'il y a des pintes, le détail est
//   écrit dessous (« 1 verre + 2 pintes »).
import { ico } from './dom.js';
import { refresh } from './nav.js';
import { tallyText } from '../engine/alcohol.js';

let pint = false;
/** Les boutons + ajoutent une pinte (vrai) ou un verre de 25 cl. */
export const pintMode = () => pint;
/** Sommaire de maquette et tests. */
export function presetDrinkSize(p = false) { pint = !!p; }

/** Choix de la taille, au-dessus d'une liste de verres. */
export function drinkSizeSeg() {
  const b = (on, arg, icon, label) => `<button type="button" data-act="drink-size" data-arg="${arg}" aria-pressed="${on}">${ico(icon)} ${label}</button>`;
  return `<div class="seg dsize" role="group" aria-label="Taille du verre">${b(!pint, 'verre', 'glass', 'Verre 25 cl')}${b(pint, 'pinte', 'pint', 'Pinte 50 cl')}</div>`;
}
/** Intérieur d'un bouton + : « + [verre] » ou « + [pinte] ». */
export const plusDrink = () => `${ico('plus')}${ico(pint ? 'pint' : 'glass')}`;
/** Libellé d'un bouton + pour les lecteurs d'écran. */
export const plusLabel = name => (pint ? `Une pinte de plus pour ${name}` : `Un verre de plus pour ${name}`);

/** « [verre] x5 » et, s'il y a des pintes, le détail dessous. `units` : compte en verres de 25 cl ; `tally` : drinkTally. */
export function drinkCount(units, tally = null, cls = 'cnt') {
  const detail = tally && tally.pints ? `<small class="dkd">${tallyText(tally)}</small>` : '';
  return `<span class="${cls}" aria-label="${units} verre${units > 1 ? 's' : ''}${tally && tally.pints ? ` (${tallyText(tally)})` : ''}">${ico('glass')}<span class="x">x${units}</span></span>${detail}`;
}

export const actions = {
  'drink-size'(v) { pint = v === 'pinte'; refresh(); },
};
