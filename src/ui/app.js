// Strela — point d'entrée de la page : routes, rendu, actions, thème, écran allumé, base du téléphone, service worker.
// Adresses internes en « #/… » ; « ?maquette » ouvre le sommaire de maquette (données fictives en mémoire, la base du
// téléphone n'est pas ouverte ; sommaire et données fictives ne sont chargés que dans ce cas).
import { store, loadSettings, animationsOn, openStorage, requestPersistence, saving, setStorageListener, exportBackup } from './store.js';
import { BUILD } from './build.js';
import { setRenderer, noteRoute, keepAwake, go } from './nav.js';
import { playersList, playerForm, avatarBank, actions as playerActions, inputs as playerInputs } from './screens/players.js';
import { newGame, actions as newGameActions } from './screens/newgame.js';
import { game, key, mountGame, vowelKey, turnFx, actions as gameActions } from './screens/game.js';
import { applyVowels } from './vowels.js';
import { syncTurnFx, leaveGameFx } from './turnfx.js';
import { legEnd, matchEnd, actions as resultActions } from './screens/results.js';
import { historyDetail, leaveHistory, actions as historyActions } from './screens/history.js';
import { faceScreen, actions as statsActions } from './screens/stats.js';
import { applyTheme, onBackupFile, actions as settingsActions } from './screens/settings.js';
import { cropScreen, mountCrop, onPhotoFile, actions as photoActions } from './screens/photo.js';
import { animateRolls, rollScope } from './roll.js';
import { fitAll } from './fit.js';
import { sayLog, soundLog, say, SPEECH } from './feedback.js';
import { handleBack, backHandled } from './back.js';
import { isApk, nativeBackHandled, hasUpdater, call } from './native.js';
import { aboutScreen, actions as aboutActions } from './screens/about.js';
import { actions as sheetActions } from './screens/printsheet.js';
import { soireeScreen, actions as soireeActions } from './screens/soiree.js';
import { settings2Screen } from './screens/settings.js';
import { stats2Screen, rankingScreen, actions as stats2Actions } from './screens/v2/stats2.js';
import { history2List, leaveHistory2, actions as history2Actions } from './screens/v2/history2.js';
import { home2, changelogScreen } from './screens/v2/home2.js';
import { soireeDashScreen, actions as dashActions } from './screens/v2/soireedash.js';
import { actions as infoActions } from './info.js';
import { actions as drinkActions } from './drinks.js';
import { weeklyAutoBackup } from './autobackup.js';

// Version 0.8.0 : la refonte (lot 7.8, écrans de screens/v2/) remplace l'accueil, l'historique, les stats et les
// réglages ; accueil A « tableau de bord » (choix de Guillaume, 13/11/2026).

const ROUTES = [
  [/^\/?$/, home2],
  [/^\/joueurs$/, playersList],
  [/^\/joueur\/(.+)$/, playerForm],
  [/^\/avatars$/, avatarBank],
  [/^\/nouvelle$/, newGame],
  [/^\/jeu$/, game],
  [/^\/manche$/, legEnd],
  [/^\/fin$/, matchEnd],
  [/^\/historique$/, history2List],
  [/^\/partie\/(.+)$/, historyDetail],
  [/^\/stats(?:\/(.+))?$/, stats2Screen],
  [/^\/classement$/, rankingScreen],
  [/^\/nouveautes$/, changelogScreen],
  [/^\/face\/([^/]+)\/(.+)$/, faceScreen],
  [/^\/reglages$/, settings2Screen],
  [/^\/recadrage$/, cropScreen],
  [/^\/apropos$/, aboutScreen],
  [/^\/soiree$/, soireeScreen],
  [/^\/soiree\/(.+)$/, soireeDashScreen],
];

const ACTIONS = {
  ...playerActions, ...newGameActions, ...gameActions, ...resultActions,
  ...statsActions, ...settingsActions, ...historyActions, ...photoActions, ...aboutActions, ...sheetActions, ...soireeActions,
  ...stats2Actions, ...history2Actions, ...dashActions, ...infoActions, ...drinkActions,
};
const INPUTS = { ...playerInputs };

const app = document.getElementById('app');
let lastPath = null;
let started = false; // rien n'est dessiné avant la lecture de la base (ou des données fictives)
let drunkKey = null; // volée de Tsia déjà « marmonnée » (lot 7.5)

function render() {
  if (!started || document.body.dataset.rescue) return;
  // Filet de sécurité (lot 4) : une erreur pendant le rendu mène à l'écran de secours (src/ui/rescue.js), jamais à
  // une page vide.
  try { draw(); } catch (e) { if (window.strelaRescue) window.strelaRescue(e); else throw e; }
}

// Version 0.8.2 (demande de Guillaume : « les affichages ne doivent pas se remettre à zéro pendant la navigation ») :
// - d'un rendu à l'autre du même écran (une action, un autre joueur dans les Stats), la page et tout bloc qui défile
//   (rangée de pastilles, tableau, panneau) gardent leur position ;
// - en revenant à un écran déjà ouvert (retour), la page reprend là où on l'avait laissée ; en avançant, elle part du haut ;
// - la courbe ([data-hscroll]) garde le même endroit sous le doigt, même quand sa largeur change (zoom) ; la première
//   fois, elle est calée à droite (les parties les plus récentes).
let lastScreen = -1;       // rang, dans ROUTES, de l'écran dessiné
let lastHash = null;
const pageY = new Map();   // adresse → défilement de la page en la quittant
const sig = el => `${el.tagName}|${el.getAttribute('class') || ''}`;
/** Positions de défilement des blocs de l'écran : clé = balise, classes et rang parmi ses semblables. */
function scrollsOf(root) {
  const out = new Map();
  const seen = new Map();
  for (const el of root.querySelectorAll('*')) {
    const k = sig(el);
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    if (el.scrollLeft || el.scrollTop) out.set(`${k}#${n}`, { left: el.scrollLeft, top: el.scrollTop });
  }
  return out;
}
function restoreScrolls(root, saved) {
  if (!saved.size) return;
  const seen = new Map();
  for (const el of root.querySelectorAll('*')) {
    const k = sig(el);
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    const s = saved.get(`${k}#${n}`);
    if (s && !el.dataset.hscroll) { el.scrollLeft = s.left; el.scrollTop = s.top; }
  }
}

function draw() {
  const path = decodeURIComponent(location.hash.replace(/^#/, ''));
  const returning = noteRoute(location.hash || '#/');
  if (path !== lastPath) { leaveHistory(path); leaveHistory2(path); } // sélection et confirmations de l'historique oubliées en changeant d'écran
  let html = null;
  let screenIdx = -1;
  for (const [i, [re, screen]] of ROUTES.entries()) {
    const m = re.exec(path);
    if (m) { html = screen(...m.slice(1)); screenIdx = i; break; }
  }
  if (html === null) { go('#/', { replace: true }); return; }
  if (!html) return; // l'écran a redirigé
  const sameScreen = screenIdx === lastScreen;
  const y = window.scrollY;
  if (lastHash !== null) pageY.set(lastHash, y);
  const blocks = sameScreen ? scrollsOf(app) : new Map();
  const hs = new Map([...app.querySelectorAll('[data-hscroll]')].map(e => [e.dataset.hscroll, { left: e.scrollLeft, sw: e.scrollWidth, cw: e.clientWidth }]));
  app.innerHTML = html;
  for (const e of app.querySelectorAll('[data-hscroll]')) {
    const s = hs.get(e.dataset.hscroll);
    // Même endroit au centre du bloc (à largeur égale : même position) ; jamais vu, ou il ne défilait pas encore
    // (zoom ×1) : calé à droite.
    e.scrollLeft = !s || s.sw <= s.cw + 1 ? e.scrollWidth : s.sw === e.scrollWidth ? s.left : ((s.left + s.cw / 2) / s.sw) * e.scrollWidth - e.clientWidth / 2;
  }
  restoreScrolls(app, blocks);
  const hash = location.hash || '#/';
  window.scrollTo(0, sameScreen ? y : returning ? (pageY.get(hash) || 0) : 0);
  lastPath = path;
  lastScreen = screenIdx;
  lastHash = hash;
  // Chiffres en rouleau (reste, total, autres joueurs) : animés depuis la valeur affichée au rendu précédent.
  rollScope(store.current ? store.current.id : null);
  animateRolls(app, animationsOn());
  fitAll(app); // blocs compactés ou rapetissés s'ils ne tiennent pas (taille d'affichage, police du téléphone)
  if (path === '/jeu') {
    // Lot 7 : quand Tsia lance, les voyelles tombent (vowels.js) ; retirées d'emblée, le texte raccourci est remis à l'échelle.
    const vk = vowelKey();
    if (applyVowels(app, vk, animationsOn()) === 'gone') fitAll(app);
    // Lot 7.5 : au début de sa volée, Tsia marmonne des mots pâteux (voix « ivre », après l'annonce en cours).
    if (vk && vk !== drunkKey) setTimeout(() => say(SPEECH.drunk(), { style: 'ivre' }), 600);
    drunkKey = vk;
    mountGame();
  }
  // Lot 7.4 : animation de tour au début de chaque volée ; arrêtée à la première fléchette ou en quittant l'écran de jeu.
  if (path === '/jeu') syncTurnFx(turnFx(), animationsOn()); else leaveGameFx();
  if (path === '/recadrage') mountCrop();
  app.querySelector('[data-reveal]')?.scrollIntoView({ block: 'center' });
  keepAwake(path === '/jeu' || path === '/manche'); // écran allumé pendant la partie, relâché en la quittant
  document.title = path === '/jeu' ? 'STRELA · partie' : 'STRELA';
  nativeBackHandled(backHandled(app)); // APK : retour prédictif (lot 6)
  autoUpdateCheck(path);
}

// Recherche automatique de mise à jour (lot 6, APK « github ») : une fois par lancement, au premier écran hors partie,
// si le réglage le permet ; la coquille n'interroge GitHub qu'une fois par 24 h au plus (sinon, état gardé).
let autoChecked = false;
const IN_GAME = new Set(['/jeu', '/manche', '/fin', '/recadrage']);
function autoUpdateCheck(path) {
  if (!weeklyChecked && !store.maquette && !IN_GAME.has(path)) { weeklyChecked = true; weeklyAutoBackup(); } // lot 9
  if (autoChecked || store.maquette || !hasUpdater() || IN_GAME.has(path)) return;
  autoChecked = true;
  if (store.settings.autoUpdate) call('autoCheckUpdate');
}
let weeklyChecked = false;
setRenderer(render);
setStorageListener(() => render());
// Sauvegarde de ce que l'appli a en mémoire (écran de secours, si la base ne se relit pas).
window.__strelaExport = () => exportBackup(BUILD.version);

// ------------------------------------------------------------------ événements (délégués)
// Un clic ne compte que si le doigt s'est posé sur la même commande : après une touche du pavé (qui redessine
// l'écran), le clic qui suit tomberait sinon sur ce qui est apparu dessous.
let downAct = null;
const actKey = el => (el ? `${el.dataset.act}|${el.dataset.arg ?? ''}` : null);
app.addEventListener('pointerdown', ev => { downAct = actKey(ev.target.closest('[data-act]')); }, true);
app.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (ev.detail !== 0 && el.matches('[data-press]')) return; // déjà traité au relâcher (ci-dessous)
  if (ev.detail !== 0 && actKey(el) !== downAct) return; // detail 0 : clavier ou clic programmé
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') ev.preventDefault();
  fn(el.dataset.arg, el, ev);
});

// Touches « au relâcher » (lot 3) : pavé (data-key), VALIDER, pause et petite cible du jeu (data-press). Retour
// visuel dès l'appui (classe hit) ; l'action part au relâcher, seulement si le doigt n'a pas glissé de plus de
// PRESS_SLOP px et qu'aucun pointercancel n'est arrivé : Android en envoie un quand il prend le geste (remonter du bas
// de l'écran pour les applis récentes), et rien n'est alors saisi. La saisie reste immédiate au relâcher.
export const PRESS_SLOP = 10;
const presses = new Map(); // pointerId → { el, sel, x, y }
const pressSel = el => (el.dataset.key !== undefined ? `[data-key="${el.dataset.key}"]`
  : `[data-act="${el.dataset.act}"]${el.dataset.arg !== undefined ? `[data-arg="${el.dataset.arg}"]` : ''}`);
const drop = id => {
  const p = presses.get(id);
  if (p) { p.el.classList.remove('hit'); presses.delete(id); }
  return p;
};
app.addEventListener('pointerdown', ev => {
  const el = ev.target.closest('[data-key], [data-press]');
  if (!el || el.disabled || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  ev.preventDefault();
  drop(ev.pointerId);
  presses.set(ev.pointerId, { el, sel: pressSel(el), x: ev.clientX, y: ev.clientY });
  el.classList.add('hit');
});
const moved = (p, ev) => Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > PRESS_SLOP;
window.addEventListener('pointermove', ev => { const p = presses.get(ev.pointerId); if (p && moved(p, ev)) drop(ev.pointerId); }, true);
window.addEventListener('pointercancel', ev => { drop(ev.pointerId); }, true);
window.addEventListener('pointerup', ev => {
  const p = drop(ev.pointerId);
  if (!p || moved(p, ev)) return;
  // L'écran a pu être redessiné entre l'appui et le relâcher (fin de l'annonce « À TOI ») : même commande, nouvel élément.
  const el = p.el.isConnected ? p.el : app.querySelector(p.sel);
  if (!el || el.disabled) return;
  if (el.dataset.key !== undefined) { key(el.dataset.key); return; }
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el.dataset.arg, el, null);
}, true);
// Appui long (lot 3) : [data-long="action"] agit après LONG_MS sans glisser (sélection dans l'historique) ; le clic qui
// suit est avalé (pas d'ouverture du détail), et le menu du navigateur sur les liens est coupé.
export const LONG_MS = 500;
let long = null;
let swallow = false;
const stopLong = () => { if (long) { clearTimeout(long.timer); long = null; } };
app.addEventListener('pointerdown', ev => {
  swallow = false;
  stopLong();
  const el = ev.target.closest('[data-long]');
  if (!el || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  long = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, timer: setTimeout(() => {
    long = null;
    swallow = true;
    const fn = ACTIONS[el.dataset.long];
    if (fn) fn(el.dataset.arg, el, null);
  }, LONG_MS) };
}, true);
window.addEventListener('pointermove', ev => { if (long && long.id === ev.pointerId && moved(long, ev)) stopLong(); }, true);
window.addEventListener('pointerup', stopLong, true);
window.addEventListener('pointercancel', stopLong, true);
app.addEventListener('click', ev => { if (swallow) { swallow = false; ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);
app.addEventListener('contextmenu', ev => { if (ev.target.closest('[data-long]')) ev.preventDefault(); });
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
  // Sauvegarde choisie (Réglages › IMPORTER) : lue et vérifiée, puis aperçu.
  const bf = ev.target.closest('[data-backup]');
  if (bf && bf.files && bf.files[0]) onBackupFile(bf.files[0]);
  if (bf) bf.value = '';
});
window.addEventListener('hashchange', render);
// Bouton retour d'Android (lot 5, APK) : la coquille appelle strelaBack() ; false = à l'accueil, l'appli peut sortir.
window.strelaBack = () => handleBack(ACTIONS, go);
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
  ROUTES.push([/^\/sommaire$/, mq.sommaire], [/^\/secours$/, mq.secours]);
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
    store.db.openCode = (e && e.code) || 'OPEN';
    store.db.error = e && e.code === 'NEWER'
      ? 'base plus récente que l\'appli : recharger la page'
      : `base indisponible (${(e && e.message) || e})`;
  }
  applyTheme();
  requestPersistence();
  // Écritures en cours (lu par les tests de parcours avant un rechargement : 0 = tout est sur le disque).
  window.__strelaSaving = () => saving.pending;
  // Annonces vocales et sons joués (lus par les tests).
  window.__strelaFeedback = () => ({ said: [...sayLog], sounds: [...soundLog] });
  // Ouverture sans adresse (appli installée) : l'accueil, avec REPRENDRE si une partie est en cours.
}
started = true;
render();
document.body.dataset.ready = '1';

// Service worker « réseau d'abord » : appli installable, toujours la dernière version quand le réseau répond.
// Il ne touche qu'à ses copies de fichiers (caches « strela-… ») : jamais à la base du téléphone.
// Pas dans l'APK (lot 5) : la page y est embarquée (WebViewAssetLoader), toujours à jour et hors ligne.
if ('serviceWorker' in navigator && !isApk() && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
