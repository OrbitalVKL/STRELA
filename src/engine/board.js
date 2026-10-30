// Strela — géométrie de la cible, commune à l'affichage (impacts) et à la saisie au doigt (paysage).
// JS pur, sans dépendance ni affichage.
//
// Repère : centre de la cible en (0, 0), x vers la droite, y vers le BAS (comme en SVG), rayon 1 = bord
// extérieur de l'anneau double. Le 20 est en haut ; les secteurs tournent dans le sens des aiguilles d'une montre.
//
// Anneaux élargis par rapport à une vraie cible (triple et double de 0,15 au lieu de 0,05) : la cible sert à
// saisir au doigt et à lire les impacts sur un téléphone, pas à reproduire les cotes réglementaires.

import { makeDart, BULL, SINGLE, DOUBLE, TRIPLE, MISS } from './darts.js';

/** Ordre des secteurs, en partant du haut, dans le sens des aiguilles d'une montre. */
export const SECTORS = Object.freeze([20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]);

/** Rayons des limites d'anneaux (bord extérieur de chaque zone). */
export const RINGS = Object.freeze({
  bull: 0.075,     // 50 (double bull)
  outerBull: 0.17, // 25
  tripleIn: 0.5,   // simple intérieur jusqu'ici
  tripleOut: 0.65, // triple
  doubleIn: 0.85,  // simple extérieur
  doubleOut: 1,    // double ; au-delà : hors cible
  labels: 1.09,    // rayon des numéros (hors zone de score)
  edge: 1.18,      // bord du dessin
});

const SECTOR_DEG = 360 / SECTORS.length;

/** Angle (degrés, 0 = haut, sens horaire, 0 ≤ a < 360) d'un point du repère. */
export function angleOf(x, y) {
  const a = (Math.atan2(y, x) * 180) / Math.PI + 90;
  return ((a % 360) + 360) % 360;
}

/** Rang du secteur (0 = 20) sous un angle : chaque secteur couvre ±9° autour de son axe ; un bord exact va au suivant. */
export function sectorIndexAt(angle) {
  return Math.floor((((angle + SECTOR_DEG / 2) % 360) + 360) % 360 / SECTOR_DEG) % SECTORS.length;
}

/**
 * Fléchette sous le point (x, y), ou null hors cible (au-delà de l'anneau double).
 * Les limites appartiennent à la zone extérieure, sauf le bord de l'anneau double qui compte encore double.
 */
export function segmentAt(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const r = Math.hypot(x, y);
  if (r > RINGS.doubleOut) return null;
  if (r < RINGS.bull) return makeDart(BULL, DOUBLE);
  if (r < RINGS.outerBull) return makeDart(BULL, SINGLE);
  const segment = SECTORS[sectorIndexAt(angleOf(x, y))];
  if (r < RINGS.tripleIn) return makeDart(segment, SINGLE);
  if (r < RINGS.tripleOut) return makeDart(segment, TRIPLE);
  if (r < RINGS.doubleIn) return makeDart(segment, SINGLE);
  return makeDart(segment, DOUBLE);
}

/** Point du repère à un angle (degrés, 0 = haut, sens horaire) et un rayon donnés. */
export function polar(angle, r) {
  const a = ((angle - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

/** Axe (degrés) du secteur d'un numéro 1 à 20. */
export const sectorAngle = segment => SECTORS.indexOf(segment) * SECTOR_DEG;

/**
 * Centre de la zone d'une fléchette saisie au pavé (sans position réelle) : milieu du segment, dans le grand
 * simple intérieur pour un simple ; 25 sur l'anneau du 25 côté haut ; 50 au centre ; 0 → null (non marqué).
 */
export function dartPoint(dart) {
  if (!dart || dart.segment === MISS) return null;
  if (dart.segment === BULL) return dart.multiplier === DOUBLE ? [0, 0] : polar(0, (RINGS.bull + RINGS.outerBull) / 2);
  const a = sectorAngle(dart.segment);
  if (a < 0) return null;
  const r = dart.multiplier === TRIPLE ? (RINGS.tripleIn + RINGS.tripleOut) / 2
    : dart.multiplier === DOUBLE ? (RINGS.doubleIn + RINGS.doubleOut) / 2
      : (RINGS.outerBull + RINGS.tripleIn) / 2;
  return polar(a, r);
}

/**
 * Point d'impact d'une fléchette : sa position réelle `pos` (saisie sur la cible) si elle est cohérente avec
 * la fléchette, sinon le centre de son segment.
 */
export function impactPoint(dart) {
  if (dart && Array.isArray(dart.pos) && dart.pos.length === 2) {
    const hit = segmentAt(dart.pos[0], dart.pos[1]);
    if (hit && hit.segment === dart.segment && hit.multiplier === dart.multiplier) return [dart.pos[0], dart.pos[1]];
  }
  return dartPoint(dart);
}

/**
 * Couleur réglementaire d'une zone (lot 1.2) : 'black' | 'cream' | 'red' | 'green'.
 * Simples : noir pour le 20 puis un secteur sur deux (sens horaire), crème pour les autres ; doubles et triples :
 * rouge sur les secteurs noirs, vert sur les crème ; 25 vert, 50 rouge. Le 0 n'a pas de zone (null).
 */
export function zoneTone(segment, multiplier = SINGLE) {
  if (segment === BULL) return multiplier === DOUBLE ? 'red' : 'green';
  const i = SECTORS.indexOf(segment);
  if (i < 0) return null;
  const dark = i % 2 === 0;
  if (multiplier === SINGLE) return dark ? 'black' : 'cream';
  return dark ? 'red' : 'green';
}

/** Nom affiché d'une zone : « T20 », « D16 », « 5 », « 25 », « 50 », « 0 ». */
export function zoneLabel(dart) {
  if (!dart) return '';
  if (dart.segment === MISS) return '0';
  if (dart.segment === BULL) return dart.multiplier === DOUBLE ? '50' : '25';
  return (dart.multiplier === TRIPLE ? 'T' : dart.multiplier === DOUBLE ? 'D' : '') + dart.segment;
}
