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

/**
 * Vibration : 'absent' (le navigateur ne sait pas faire), 'off' (réglage sur NON), 'refused' (navigator.vibrate a
 * renvoyé false : Chrome refuse tant que l'utilisateur n'a pas encore touché la page, ou motif invalide), 'sent'
 * (demande transmise). « Transmise » ne veut pas dire « ressentie » : Chrome sur Android ne fait rien quand le
 * téléphone est en mode silencieux, et Android coupe les vibrations des pages quand le retour haptique est désactivé.
 * L'APK (lot 5) passera par le vibreur natif d'Android.
 */
export function buzz(pattern, { force = false } = {}) {
  if (typeof navigator.vibrate !== 'function') return 'absent';
  if (!force && !store.settings.vibrate) return 'off';
  let ok = false;
  try { ok = navigator.vibrate(pattern); } catch (e) { ok = false; }
  return ok ? 'sent' : 'refused';
}
// Durées en ms. Une impulsion de moins de ~20 ms se sent à peine sur les moteurs linéaires des Pixel.
export const BUZZ = Object.freeze({ dart: 25, bust: 450, leg: [60, 70, 60, 70, 160], undo: [15, 50, 15], test: [40, 120, 40, 120, 300] });

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
