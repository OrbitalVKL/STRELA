// Strela — point d'entrée du moteur. Un module par jeu ; la fléchette (darts.js) est commune.
// Pour ajouter un jeu (Cricket…) : nouveau module avec la même forme (config + liste de fléchettes
// → état recalculé), ajouté à GAMES.
import * as darts from './darts.js';
import * as x01 from './x01.js';

export { darts, x01 };
export const GAMES = Object.freeze({ x01 });
