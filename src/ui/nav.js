// Strela — navigation et retours physiques, partagés par les écrans (évite les imports circulaires avec app.js).
import { store } from './store.js';
import { isApk, call, gameScreen } from './native.js';

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
export function noteRoute(hash) { if (hash !== cur) { prev = cur; cur = hash; } trackFamily(hash); }

// Version 0.8.1 : « d'où l'on vient », par famille d'écrans (premier mot de l'adresse : stats, partie, soiree…).
// Ouvrir une famille l'empile ; y revenir dépile ce qui a été ouvert depuis ; changer d'écran dans une famille (un autre
// joueur dans les Stats) ne change pas d'où elle a été ouverte. Le retour d'un écran de détail (backFrom) revient à
// l'écran d'avant sa famille : des Stats ouvertes depuis le tableau de bord d'une soirée y reviennent, au lieu de
// l'accueil. Jamais vers le jeu (on n'y revient que par REPRENDRE).
const FAMILY_ALIAS = { classement: 'stats' }; // onglets Joueur / Classement des Stats
const NO_RETURN = new Set(['jeu', 'manche', 'fin', 'nouvelle', 'recadrage']);
const family = h => { const f = String(h).replace(/^#\/?/, '').split(/[/?]/)[0]; return FAMILY_ALIAS[f] || f; };
const stack = [];
function trackFamily(hash) {
  const f = family(hash);
  if (f === '') { stack.length = 0; stack.push({ f, hash }); return; }
  const i = stack.findIndex(e => e.f === f);
  if (i >= 0) { stack.length = i + 1; stack[i].hash = hash; } else stack.push({ f, hash });
}
/** Adresse du lien Retour d'un écran de détail : l'écran d'où sa famille a été ouverte, sinon `fallback`. */
export function backFrom(fallback) {
  const from = stack[stack.length - 2];
  return from && !NO_RETURN.has(from.f) ? from.hash : fallback;
}
export function goBackTo(hash) {
  if (prev === hash) history.back();
  else go(hash, { replace: true });
}

/**
 * Vibration : 'absent' (le navigateur ne sait pas faire), 'off' (réglage sur NON), 'refused' (navigator.vibrate a
 * renvoyé false : Chrome refuse tant que l'utilisateur n'a pas encore touché la page, ou motif invalide), 'sent'
 * (demande transmise). « Transmise » ne veut pas dire « ressentie » : Chrome sur Android ne fait rien quand le
 * téléphone est en mode silencieux, et Android coupe les vibrations des pages quand le retour haptique est désactivé.
 * Lot 5 : dans l'APK, le vibreur natif d'Android (Bridge.vibrate, mêmes motifs) : 'native' (confiée au vibreur),
 * 'absent' (pas de vibreur), 'refused' (erreur).
 */
export function buzz(pattern, { force = false } = {}) {
  if (!force && !store.settings.vibrate) return isApk() || typeof navigator.vibrate === 'function' ? 'off' : 'absent';
  if (isApk()) {
    const r = call('vibrate', JSON.stringify(pattern));
    return r === 'sent' ? 'native' : r === 'absent' ? 'absent' : 'refused';
  }
  if (typeof navigator.vibrate !== 'function') return 'absent';
  let ok = false;
  try { ok = navigator.vibrate(pattern); } catch (e) { ok = false; }
  return ok ? 'sent' : 'refused';
}
// Durées en ms. Une impulsion de moins de ~20 ms se sent à peine sur les moteurs linéaires des Pixel.
export const BUZZ = Object.freeze({ dart: 25, bust: 450, leg: [60, 70, 60, 70, 160], undo: [15, 50, 15], test: [40, 120, 40, 120, 300] });

// Écran toujours allumé pendant la partie (Wake Lock), libéré en quittant le jeu. Dans l'APK (lot 5) :
// FLAG_KEEP_SCREEN_ON et plein écran immersif, pilotés par la page à travers la passerelle.
let lock = null;
let wanted = false;
export async function keepAwake(on) {
  wanted = on;
  if (isApk()) { gameScreen(on); return; }
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
