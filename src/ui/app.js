// Strela — point d'entrée de la page : routes, rendu, actions, thème, écran allumé, base du téléphone, service worker.
// Adresses internes en « #/… » ; « ?maquette » ouvre le sommaire de maquette (données fictives en mémoire, la base du
// téléphone n'est pas ouverte ; sommaire et données fictives ne sont chargés que dans ce cas).
import { store, loadSettings, animationsOn, openStorage, requestPersistence, saving } from './store.js';
import { setRenderer, noteRoute, keepAwake, go } from './nav.js';
import { home } from './screens/home.js';
import { playersList, playerForm, avatarBank, actions as playerActions, inputs as playerInputs } from './screens/players.js';
import { newGame, actions as newGameActions } from './screens/newgame.js';
import { game, key, mountGame, actions as gameActions } from './screens/game.js';
import { legEnd, matchEnd, actions as resultActions } from './screens/results.js';
import { historyList, historyDetail, actions as historyActions } from './screens/history.js';
import { statsScreen, actions as statsActions } from './screens/stats.js';
import { settingsScreen, applyTheme, actions as settingsActions } from './screens/settings.js';
import { cropScreen, mountCrop, onPhotoFile, actions as photoActions } from './screens/photo.js';
import { animateRolls, rollScope } from './roll.js';
import { fitAll } from './fit.js';

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
  [/^\/recadrage$/, cropScreen],
];

const ACTIONS = {
  ...playerActions, ...newGameActions, ...gameActions, ...resultActions,
  ...statsActions, ...settingsActions, ...historyActions, ...photoActions,
};
const INPUTS = { ...playerInputs };

const app = document.getElementById('app');
let lastPath = null;
let started = false; // rien n'est dessiné avant la lecture de la base (ou des données fictives)

function render() {
  if (!started) return;
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
  if (path === '/recadrage') mountCrop();
  app.querySelector('[data-reveal]')?.scrollIntoView({ block: 'center' });
  keepAwake(path === '/jeu' || path === '/manche'); // écran allumé pendant la partie, relâché en la quittant
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
// Photo d'avatar choisie (appareil photo ou galerie) : chargée, puis écran de recadrage.
app.addEventListener('change', ev => {
  const el = ev.target.closest('[data-file]');
  if (el && el.files && el.files[0]) onPhotoFile(el.files[0]);
  if (el) el.value = '';
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
if (new URLSearchParams(location.search).has('maquette')) {
  store.maquette = true;
  const [{ resetMock }, mq] = await Promise.all([import('./maquette.js'), import('./screens/sommaire.js')]);
  ROUTES.push([/^\/sommaire$/, mq.sommaire]);
  Object.assign(ACTIONS, mq.actions);
  resetMock();
  // Accès des scripts de vérification (tools/) : états du sommaire et réajustement après un changement de police.
  window.__strela = {
    scene(name, arg) { const target = mq.SCENES[name] ? mq.SCENES[name](arg) : null; if (target) { history.replaceState(null, '', target); render(); } return target; },
    scenes: () => Object.keys(mq.SCENES),
    reset: () => resetMock(),
    darts: () => (store.current ? store.current.darts.map(d => ({ ...d })) : null),
    fit: () => fitAll(app),
    render,
  };
  if (!location.hash || location.hash === '#/' || location.hash === '#') history.replaceState(null, '', '#/sommaire');
} else {
  // Base du téléphone : tout est relu avant le premier affichage. Si une version plus récente de l'appli ouvre la
  // base (mise à jour), cette page se recharge : tout est déjà écrit.
  try {
    await openStorage({ onVersionChange: () => location.reload() });
  } catch (e) {
    store.db.error = e && e.code === 'NEWER'
      ? 'base plus récente que l\'appli : recharger la page'
      : `base indisponible (${(e && e.message) || e})`;
  }
  applyTheme();
  requestPersistence();
  // Écritures en cours (lu par les tests de parcours avant un rechargement : 0 = tout est sur le disque).
  window.__strelaSaving = () => saving.pending;
  // Ouverture sans adresse (appli installée) : l'accueil, avec REPRENDRE si une partie est en cours.
}
started = true;
render();
document.body.dataset.ready = '1';

// Service worker « réseau d'abord » : appli installable, toujours la dernière version quand le réseau répond.
// Il ne touche qu'à ses copies de fichiers (caches « strela-… ») : jamais à la base du téléphone.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
