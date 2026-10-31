// Strela — passerelle de l'APK (lot 5) : objet « strelaNative » posé par la coquille Android (android/, Bridge.java).
// La page le cherche et s'en sert à la place des API web (vibreur, voix, fichiers, écran allumé, plein écran, mise à
// jour) ; sans lui (navigateur), les API web restent en place. Les réponses de la passerelle sont des chaînes (JSON
// quand il y a plusieurs valeurs) ; ce qu'elle envoie d'elle-même arrive par l'événement « strela-native ».

/** La passerelle, ou null dans le navigateur. */
export const bridge = () => globalThis.strelaNative || null;
export const isApk = () => !!bridge();

/** Appelle une fonction de la passerelle ; undefined si elle manque ou échoue (la page reprend l'API web). */
export function call(name, ...args) {
  const b = bridge();
  if (!b || typeof b[name] !== 'function') return undefined;
  try { return b[name](...args); } catch (e) { return undefined; }
}

/** Idem, réponse JSON lue (null si absente ou illisible). */
export function callJson(name, ...args) {
  const r = call(name, ...args);
  if (typeof r !== 'string') return null;
  try { return JSON.parse(r); } catch (e) { return null; }
}

// Messages de la coquille (mise à jour…) : { update: {…} }
const listeners = new Set();
export const onNative = fn => { listeners.add(fn); return () => listeners.delete(fn); };
globalThis.addEventListener?.('strela-native', ev => { for (const fn of listeners) fn(ev.detail || {}); });

// Écran allumé et plein écran immersif, pilotés par la page (partie et fin de manche) : appels seulement au changement.
let screenOn = null;
/** En partie : écran allumé (FLAG_KEEP_SCREEN_ON) et barres système masquées (rappel par un geste). */
export function gameScreen(on) {
  if (!isApk() || screenOn === on) return false;
  screenOn = on;
  call('keepScreenOn', on);
  call('immersive', on);
  return true;
}

let dark = null;
/** Thème de la page → fond de la fenêtre et icônes des barres système. */
export function nativeTheme(isDark) {
  if (!isApk() || dark === isDark) return;
  dark = isDark;
  call('setDark', isDark);
}

// ------------------------------------------------------------------ variante, mise à jour, retour (lot 6)
let infoCache;
/** { version, variant, package, sdk, model } de la coquille, ou null dans le navigateur. */
export function nativeInfo() {
  if (infoCache === undefined || (infoCache === null && isApk())) infoCache = callJson('info');
  return infoCache;
}

/** Variante : 'web' (navigateur), 'github' (APK publié en release GitHub) ou 'play' (Google Play). */
export function variant() {
  if (!isApk()) return 'web';
  const v = nativeInfo() && nativeInfo().variant;
  return v === 'play' ? 'play' : 'github'; // APK du lot 5 (sans variante) : github
}

/** La coquille sait-elle se mettre à jour (variante github) ? La variante play n'a ni code ni bouton pour cela. */
export const hasUpdater = () => { const b = bridge(); return !!b && typeof b.checkUpdate === 'function'; };

let back = null;
/** Retour prédictif : la page dit à la coquille si elle a quelque chose à faire du retour (appel au changement). */
export function nativeBackHandled(on) {
  if (!isApk() || back === on) return;
  back = on;
  call('setBackHandled', on);
}
