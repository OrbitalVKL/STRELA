// Accueil : NOUVELLE PARTIE, REPRENDRE (si une partie est en cours), Joueurs, Historique, Stats, Réglages.
import { store, activePlayers, currentState, playerById } from '../store.js';
import { esc, ico, plural, OUT_SHORT, maquetteButtons } from '../dom.js';
import { BUILD } from '../build.js';

export function home() {
  const s = currentState();
  let resume = '';
  if (s && s.status === 'playing') {
    const p = playerById(store.current.config.players[s.currentPlayer]);
    resume = `<a class="btn resume" href="#/jeu">
      <span class="t">REPRENDRE</span>
      <small>${store.current.config.startScore} · ${OUT_SHORT[store.current.config.outMode]} · MANCHE ${s.legNumber}<br>À <span class="nm">${esc(p.name)}</span> · RESTE ${s.remaining[s.currentPlayer]}</small>
      <span class="go">${ico('chev')}</span></a>`;
  }
  const n = activePlayers().length;
  const g = store.games.length;
  return `<div class="screen">
    <header>
      <div class="home-head inv"><h1 class="home-title" data-shrink>СТРЕЛА</h1><span class="home-ver">v${esc(BUILD.version)}</span></div>
      <p class="home-sub">Strela · compteur de fléchettes X01</p>
    </header>
    <main class="home-main">
      <a class="btn primary big" href="#/nouvelle">NOUVELLE PARTIE</a>
      ${resume}
      <nav class="tiles" aria-label="Menu">
        <a class="tile" href="#/joueurs">${ico('players')}<div><b data-shrink>Joueurs</b><br><span>${n ? plural(n, 'joueur', 'joueurs') : 'aucun joueur'}</span></div></a>
        <a class="tile" href="#/historique">${ico('history')}<div><b data-shrink>Historique</b><br><span>${g ? plural(g, 'partie', 'parties') : 'aucune partie'}</span></div></a>
        <a class="tile" href="#/stats">${ico('stats')}<div><b data-shrink>Stats</b><br><span>par joueur</span></div></a>
        <a class="tile" href="#/reglages">${ico('settings')}<div><b data-shrink>Réglages</b><br><span>thème · nuit</span></div></a>
      </nav>
    </main>
    <footer class="home-foot"><span>Maquette · rien n'est enregistré</span><span>Orbital VKL</span></footer>
    ${store.maquette ? `<div class="mq-row">${maquetteButtons('mq')}</div>` : ''}
  </div>`;
}
