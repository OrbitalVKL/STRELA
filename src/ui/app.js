// Strela — point d'entrée de la page : routes, rendu, actions, thème, écran allumé, service worker.
// Adresses internes en « #/… » ; « ?maquette » ouvre le sommaire de maquette.
import { store, resetMock, loadSettings, animationsOn } from './store.js';
import { setRenderer, noteRoute, keepAwake, go } from './nav.js';
import { home } from './screens/home.js';
import { playersList, playerForm, avatarBank, actions as playerActions, inputs as playerInputs } from './screens/players.js';
import { newGame, actions as newGameActions } from './screens/newgame.js';
import { game, key, mountGame, actions as gameActions } from './screens/game.js';
import { legEnd, matchEnd, actions as resultActions } from './screens/results.js';
import { historyList, historyDetail, actions as historyActions } from './screens/history.js';
import { statsScreen, actions as statsActions } from './screens/stats.js';
import { settingsScreen, applyTheme, actions as settingsActions } from './screens/settings.js';
import { sommaire, actions as sommaireActions } from './screens/sommaire.js';
import { animateRolls, rollScope } from './roll.js';
import { fitAll } from './fit.js';
import { SCENES } from './screens/sommaire.js';

const ROUTES = [
  [/^\/?$/, home],
  [/^\/joueurs$/, playersList],
  [/^\/joueur\/(.+)$/, playerForm],
  [/^\/avatars$/, avatarBank],
  [/^\/nouvelle$/, newGame],
  [/^\/jeu$/, game],
  [/^\/manche$/, legEnd],
  [/^\/fin$/, matchEnd],
  [/^\/historique$/, historyList],
  [/^\/partie\/(.+)$/, historyDetail],
  [/^\/stats(?:\/(.+))?$/, statsScreen],
  [/^\/reglages$/, settingsScreen],
  [/^\/sommaire$/, sommaire],
];

const ACTIONS = {
  ...playerActions, ...newGameActions, ...gameActions, ...resultActions,
  ...statsActions, ...settingsActions, ...sommaireActions, ...historyActions,
};
const INPUTS = { ...playerInputs };

const app = document.getElementById('app');
let lastPath = null;

function render() {
  const path = decodeURIComponent(location.hash.replace(/^#/, ''));
  noteRoute(location.hash || '#/');
  let html = null;
  for (const [re, screen] of ROUTES) {
    const m = re.exec(path);
    if (m) { html = screen(m[1]); break; }
  }
  if (html === null) { go('#/', { replace: true }); return; }
  if (!html) return; // l'écran a redirigé
  const samePage = path === lastPath;
  const y = window.scrollY;
  app.innerHTML = html;
  window.scrollTo(0, samePage ? y : 0);
  lastPath = path;
  // Chiffres en rouleau (reste, total, autres joueurs) : animés depuis la valeur affichée au rendu précédent.
  rollScope(store.current ? store.current.id : null);
  animateRolls(app, animationsOn());
  fitAll(app); // blocs compactés ou rapetissés s'ils ne tiennent pas (taille d'affichage, police du téléphone)
  if (path === '/jeu') mountGame();
  app.querySelector('[data-reveal]')?.scrollIntoView({ block: 'center' });
  keepAwake(path === '/jeu');
  document.title = path === '/jeu' ? 'СТРЕЛА · partie' : 'СТРЕЛА · Strela';
}
setRenderer(render);

// ------------------------------------------------------------------ événements (délégués)
// Un clic ne compte que si le doigt s'est posé sur la même commande : après une touche du pavé (qui agit dès
// l'appui et redessine l'écran), le clic qui suit tomberait sinon sur ce qui est apparu dessous (VALIDER).
let downAct = null;
const actKey = el => (el ? `${el.dataset.act}|${el.dataset.arg ?? ''}` : null);
app.addEventListener('pointerdown', ev => { downAct = actKey(ev.target.closest('[data-act]')); }, true);
app.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (ev.detail !== 0 && actKey(el) !== downAct) return; // detail 0 : clavier ou clic programmé
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') ev.preventDefault();
  fn(el.dataset.arg, el, ev);
});
// Pavé de jeu : la touche agit dès l'appui (pas d'attente du relâchement).
app.addEventListener('pointerdown', ev => {
  const el = ev.target.closest('[data-key]');
  if (!el || el.disabled || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  ev.preventDefault();
  key(el.dataset.key);
});
app.addEventListener('keydown', ev => {
  const el = ev.target.closest('[data-key]');
  if (el && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); key(el.dataset.key); }
});
app.addEventListener('input', ev => {
  const el = ev.target.closest('[data-input]');
  if (el && INPUTS[el.dataset.input]) INPUTS[el.dataset.input](el.value, el);
});
app.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.input === 'name') ev.target.blur();
});
window.addEventListener('hashchange', render);
// Rotation : l'écran de jeu change de mise en page (pavé en portrait, cible en paysage), l'état reste.
try { matchMedia('(orientation: landscape)').addEventListener('change', () => { if (location.hash === '#/jeu') render(); }); } catch (e) { /* vieux navigateur */ }
// Taille de la fenêtre (barres de Chrome, clavier, police) : l'écran de jeu se redessine, les autres se réajustent.
let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { if (location.hash === '#/jeu') render(); else fitAll(app); });
});
try { document.fonts.ready.then(() => fitAll(app)); } catch (e) { /* vieux navigateur */ }
try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { applyTheme(); render(); }); } catch (e) { /* vieux navigateur */ }

// ------------------------------------------------------------------ démarrage
loadSettings();
applyTheme();
resetMock();
if (new URLSearchParams(location.search).has('maquette')) {
  store.maquette = true;
  // Accès des scripts de vérification (tools/) : états du sommaire et réajustement après un changement de police.
  window.__strela = {
    scene(name, arg) { const target = SCENES[name] ? SCENES[name](arg) : null; if (target) { history.replaceState(null, '', target); render(); } return target; },
    scenes: () => Object.keys(SCENES),
    reset: () => resetMock(),
    darts: () => (store.current ? store.current.darts.map(d => ({ ...d })) : null),
    fit: () => fitAll(app),
    render,
  };
  if (!location.hash || location.hash === '#/' || location.hash === '#') history.replaceState(null, '', '#/sommaire');
}
render();

// Service worker « réseau d'abord » : appli installable, toujours la dernière version quand le réseau répond.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
