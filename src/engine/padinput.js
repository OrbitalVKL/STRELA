// Saisie au pavé, téléphone debout (correction du 23/11) : JS pur, sans DOM, testé (tests/saisie-pave.test.js).
//
// Deux modes, réglage `padRing` des réglages d'affichage (booléen gardé tel quel depuis la 0.17.0 : aucune migration) :
//   'entier'  (padRing absent ou false, défaut) — saisie rapide : la barre du haut arme le simple, le double ou le
//             triple, puis un appui sur le nombre enregistre la fléchette. Un simple n'a pas de couronne ({ segment,
//             multiplier: 1 }, sans `ring`) : stats approchées, milieu de sa case (training.js › realPoint).
//   'touche'  (padRing true) — saisie précise : le nombre, puis sa zone (zonePick de l'écran) : double, simple
//             extérieur, triple, simple intérieur. Le double et le triple n'ont pas de couronne.
// 25, 50 et 0 (hors cible) s'enregistrent d'un appui dans les deux modes.
import { MISS, BULL } from './darts.js';

export const PAD_MODES = Object.freeze(['entier', 'touche']);
export const PAD_MODE_LABELS = Object.freeze({ entier: 'Secteur entier', touche: 'Secteur touché' });

/** Mode du pavé d'après les réglages : seule la valeur `true` de `padRing` donne la saisie précise. */
export const padModeOf = settings => (settings && settings.padRing === true ? 'touche' : 'entier');
/** Valeur de `padRing` à enregistrer pour un mode. */
export const padRingFor = mode => mode === 'touche';

/** Zones de la barre du haut (saisie rapide) et leur multiplicateur. */
export const FAST_ZONES = Object.freeze(['s', 'd', 't']);
const MULT = { s: 1, d: 2, t: 3 };

/**
 * Zone armée d'office en saisie rapide : celle de la cible visée (double, triple), sinon le simple. `targetZone` : zone
 * de la cible ('any', 's', 'si', 'se', 'd', 't') ou rien (jeux, libre sans cible).
 */
export const fastDefault = targetZone => (targetZone === 'd' || targetZone === 't' ? targetZone : 's');

/**
 * Appui sur S, D ou T de la barre (saisie rapide). `cur` : zone armée (null = celle par défaut), `def` : zone par
 * défaut. Retourne la zone armée ensuite (null = retour au défaut). D ou T touché une seconde fois : retour au simple.
 */
export function fastToggle(cur, z, def = 's') {
  if (!FAST_ZONES.includes(z)) return cur;
  const now = cur || def;
  if ((z === 'd' || z === 't') && now === z) return def === z ? 's' : null;
  return z === def ? null : z;
}

/**
 * Appui sur une touche du pavé (« 0 », « 25 », « 50 », « 1 » à « 20 »).
 * - saisie rapide : `zone` armée ('s', 'd', 't') → { dart } ; 25 avec le triple armé → null (n'existe pas), avec le
 *   double armé → 50.
 * - saisie précise : un nombre → { pick: n } (choix de la zone ensuite) ; 25, 50, 0 → { dart }.
 * Toute autre touche → null.
 */
export function padPress(mode, key, { zone = 's' } = {}) {
  const k = String(key);
  if (k === '0') return { dart: { segment: MISS, multiplier: 1 } };
  if (k === '50') return { dart: { segment: BULL, multiplier: 2 } };
  const z = MULT[zone] ? zone : 's';
  if (k === '25') {
    if (mode !== 'touche' && z === 't') return null;
    return { dart: { segment: BULL, multiplier: mode !== 'touche' && z === 'd' ? 2 : 1 } };
  }
  const n = Number(k);
  if (!(Number.isInteger(n) && n >= 1 && n <= 20)) return null;
  if (mode === 'touche') return { pick: n };
  return { dart: { segment: n, multiplier: MULT[z] } };
}

/** Zones proposées après le nombre en saisie précise, du bord vers le bull. */
export const PRECISE_ZONES = Object.freeze(['d', 'out', 't', 'in']);

/**
 * Zone choisie après le nombre `n` (saisie précise) : 'in' / 'out' (simple intérieur / extérieur), 'd', 't' ; 's'
 * (simple sans couronne) reste accepté. → fléchette, ou null.
 */
export function zonePress(n, z) {
  if (!(Number.isInteger(n) && n >= 1 && n <= 20)) return null;
  if (z === 'd' || z === 't') return { segment: n, multiplier: MULT[z] };
  if (z === 'in' || z === 'out') return { segment: n, multiplier: 1, ring: z };
  if (z === 's') return { segment: n, multiplier: 1 };
  return null;
}

/** Zone de la cible visée à souligner dans le choix de la zone (saisie précise) : 'in', 'out', 'd', 't' ou null. */
export const preciseAim = targetZone => ({ si: 'in', se: 'out', d: 'd', t: 't' }[targetZone] || null);
