// Strela — navigation et retours physiques, partagés par les écrans (évite les imports circulaires avec app.js).
import { store } from './store.js';

let renderer = () => {};
export const setRenderer = fn => { renderer = fn; };

/** Redessine l'écran courant. */
export const refresh = () => renderer();

/** Va à une adresse interne (« #/jeu ») ; `replace` évite d'empiler l'historique du navigateur. */
export function go(hash, { replace = false } = {}) {
  if (location.hash === hash) { refresh(); return; }
  if (replace) { history.replaceState(null, '', hash); refresh(); }
  else location.hash = hash;
}

// Adresse précédente (tenue par app.js) : un « retour » revient en arrière si c'est d'où l'on vient.
let prev = '';
let cur = '';
export function noteRoute(hash) { if (hash !== cur) { prev = cur; cur = hash; } }
export function goBackTo(hash) {
  if (prev === hash) history.back();
  else go(hash, { replace: true });
}

/** Vibration, si le réglage la permet et si le téléphone sait faire. */
export function buzz(pattern) {
  if (!store.settings.vibrate || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (e) { /* rien */ }
}
export const BUZZ = Object.freeze({ dart: 12, bust: 450, leg: [60, 70, 60, 70, 160], undo: [8, 40, 8] });

// Écran toujours allumé pendant la partie (Wake Lock), libéré en quittant le jeu.
let lock = null;
let wanted = false;
export async function keepAwake(on) {
  wanted = on;
  try {
    if (on && !lock && navigator.wakeLock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) {
      const l = lock; lock = null; await l.release();
    }
  } catch (e) { lock = null; }
}
// Le verrou saute quand l'appli passe en arrière-plan : on le reprend au retour.
document.addEventListener('visibilitychange', () => { if (wanted && document.visibilityState === 'visible') keepAwake(true); });
export const isAwake = () => !!lock;
