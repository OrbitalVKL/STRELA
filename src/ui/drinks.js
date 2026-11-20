// Strela — verre (25 cl) ou pinte (50 cl) (version 0.8.2, demande de Guillaume). Partagé par tous les écrans où l'on
// ajoute des verres (panneau des verres et menu pause du jeu, écran Soirée, détail d'une partie) :
// - un choix « VERRE 25 CL · PINTE 50 CL » au-dessus de la liste : les boutons + ajoutent ce qui est choisi (une tournée
//   de pintes : on choisit PINTE une fois, puis + pour chacun) ; le choix dure le temps de la session ;
// - 0.11.2 : le compte montre les verres de 25 cl et les pintes à part (« [verre] x3 [pinte] x1 ») ; les équivalents
//   en verres de 25 cl (une pinte = 2) ne servent plus qu'au badge « Bu et gagné » et à la moyenne au fil des verres.
import { ico } from './dom.js';
import { refresh } from './nav.js';
import { drinksText } from '../engine/alcohol.js';

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

/** 0.11.2 (demande de Guillaume) : verres de 25 cl et pintes comptés à part : « [verre] x3 [pinte] x1 » (la pinte
 *  seulement s'il y en a). `tally` : drinkTally. */
export function drinkPair(tally, cls = 'dpair') {
  const t = tally || { glasses: 0, pints: 0 };
  return `<span class="${cls}" aria-label="${drinksText(t)}"><span class="dg">${ico('glass')}<span class="x">x${t.glasses}</span></span>${t.pints ? `<span class="dp">${ico('pint')}<span class="x">x${t.pints}</span></span>` : ''}</span>`;
}
/** Le compte d'une liste de verres : la paire verres / pintes (0.11.2 ; avant : « x5 » en verres de 25 cl). */
export function drinkCount(tally, cls = 'cnt') {
  return drinkPair(tally, `${cls} dpair`);
}

export const actions = {
  'drink-size'(v) { pint = v === 'pinte'; refresh(); },
};
