// Accueil : REPRENDRE en tête si une partie est en cours (jeu, fin de manche ou fin de partie pas encore rangée),
// NOUVELLE PARTIE, Joueurs, Historique, Stats, Réglages. Premier lancement (aucun joueur) : invitation à créer les
// joueurs.
// Lot 4 : titre en lettres latines (STRELA) et rouge d'accent, réservé aux écrans hors jeu (en jeu, le rouge ne
// sert qu'au bust). Deux variantes, comparées au sommaire de maquette : « bande » (retenue : bande de titre en aplat
// rouge) et « filet » (titre en texte rouge, filets rouges sous le titre et au-dessus du pied). Dans les deux, l'action
// principale de l'accueil est en aplat rouge, texte clair (--red-ink sur --red : 5,8:1, mêmes valeurs en clair).
import { store, activePlayers, currentState, playerById, resumeRoute } from '../store.js';
import { esc, ico, plural, OUT_SHORT, maquetteButtons } from '../dom.js';
import { BUILD } from '../build.js';
import { storageBanner } from './settings.js';

function resumeButton() {
  const s = currentState();
  if (!s) return '';
  const g = store.current;
  const head = `${g.config.startScore} · ${OUT_SHORT[g.config.outMode]}`;
  let line;
  if (s.status === 'finished') {
    line = `PARTIE TERMINÉE · <span class="nm">${esc(playerById(g.config.players[s.winner]).name)}</span> GAGNE`;
  } else {
    const p = playerById(g.config.players[s.currentPlayer]);
    line = `MANCHE ${s.legNumber}<br>À <span class="nm">${esc(p.name)}</span> · RESTE ${s.remaining[s.currentPlayer]}`;
  }
  return `<a class="btn primary resume" href="${resumeRoute()}">
      <span class="t">REPRENDRE</span>
      <small>${head} · ${line}</small>
      <span class="go">${ico('chev')}</span></a>`;
}

export const HOME_VARIANTS = Object.freeze(['bande', 'filet']);
let variant = 'bande';
/** Variante de l'accueil (sommaire de maquette seulement ; l'appli garde « bande »). */
export function setHomeVariant(v) { variant = HOME_VARIANTS.includes(v) ? v : 'bande'; }
export const homeVariant = () => variant;

export function home() {
  const resume = resumeButton();
  const n = activePlayers().length;
  const g = store.games.length;
  // Premier lancement : aucun joueur. L'accueil invite à les créer (une fois pour toutes).
  const welcome = !store.players.length && !resume
    ? `<section class="welcome" aria-label="Premier lancement"><b>BIENVENUE</b>
        <p>Crée d'abord les joueurs : un pseudo et un avatar (initiales, icône ou photo). Ils restent sur ce téléphone, d'une partie à l'autre.</p>
        <a class="btn accent big" href="#/joueur/nouveau">${ico('plus')} CRÉER LES JOUEURS</a></section>`
    : '';
  // NOUVELLE PARTIE : aplat rouge quand c'est l'action principale ; derrière REPRENDRE ou la création des joueurs, filet
  // rouge seulement (une seule action forte à l'écran).
  const newGame = `<a class="btn ${resume || welcome ? 'accent-line' : 'accent'} big" href="#/nouvelle">NOUVELLE PARTIE</a>`;
  const saved = store.maquette ? 'Maquette · données fictives'
    : store.db.error ? '<span class="red">Non enregistré</span>' : 'Enregistré sur ce téléphone';
  return `<div class="screen home v-${variant}">
    <header>
      <div class="home-head"><h1 class="home-title" data-shrink>STRELA</h1><span class="home-ver">v${esc(BUILD.version)}</span></div>
      <p class="home-sub">Compteur de fléchettes X01</p>
    </header>
    <main class="home-main">
      ${storageBanner()}${welcome}${resume}${newGame}
      <nav class="tiles" aria-label="Menu">
        <a class="tile" href="#/joueurs">${ico('players')}<div><b data-shrink>Joueurs</b><br><span data-shrink="2">${n ? plural(n, 'joueur', 'joueurs') : 'aucun joueur'}</span></div></a>
        <a class="tile" href="#/historique">${ico('history')}<div><b data-shrink>Historique</b><br><span data-shrink="2">${g ? plural(g, 'partie', 'parties') : 'aucune partie'}</span></div></a>
        <a class="tile" href="#/stats">${ico('stats')}<div><b data-shrink>Stats</b><br><span data-shrink="2">par joueur</span></div></a>
        <a class="tile" href="#/reglages">${ico('settings')}<div><b data-shrink>Réglages</b><br><span data-shrink="2">thème · nuit</span></div></a>
      </nav>
    </main>
    <footer class="home-foot"><span>${saved}</span><span>Orbital VKL</span></footer>
    ${store.maquette ? `<div class="mq-row">${maquetteButtons('mq')}</div>` : ''}
  </div>`;
}
