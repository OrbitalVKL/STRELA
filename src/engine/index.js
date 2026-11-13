// Strela — point d'entrée du moteur. Un module par jeu ; la fléchette (darts.js) est commune.
// Pour ajouter un jeu (Cricket…) : nouveau module avec la même forme (config + liste de fléchettes
// → état recalculé), ajouté à GAMES.
import * as darts from './darts.js';
import * as x01 from './x01.js';
import * as checkout from './checkout.js';
import * as stats from './stats.js';
import * as board from './board.js';
import * as players from './players.js';
import * as cricket from './cricket.js';

export { darts, x01, checkout, stats, board, players, cricket };
export const GAMES = Object.freeze({ x01, cricket });

/** État d'une partie, quel que soit le jeu (lot 10 : config.game === 'cricket', sinon X01). */
export const stateOf = (config, list) => (config && config.game === 'cricket' ? cricket.computeCricket(config, list) : x01.computeState(config, list));
