// Strela — la fléchette, commune à tous les jeux (X01 aujourd'hui, Cricket ou autre plus tard).
// Aucune dépendance, aucun affichage : utilisable dans la page et sous `node --test`.
//
// Une fléchette = { segment, multiplier }
//   segment    : 0 (à côté), 1 à 20, ou 25 (bull)
//   multiplier : 1 simple, 2 double, 3 triple
//   25 n'existe qu'en simple (25) ou double (50, qui compte comme un double). 0 n'existe qu'en simple.

export const SINGLE = 1;
export const DOUBLE = 2;
export const TRIPLE = 3;
export const BULL = 25;
export const MISS = 0;

// Codes d'erreur de saisie (l'interface les traduit en français).
export const DART_ERRORS = Object.freeze({
  NOT_A_DART: 'NOT_A_DART',               // pas un objet { segment, multiplier }
  SEGMENT_INVALID: 'SEGMENT_INVALID',     // segment hors 0..20 et 25 (ex. 21, -1, 2.5)
  MULTIPLIER_INVALID: 'MULTIPLIER_INVALID', // multiplicateur hors 1, 2, 3
  TRIPLE_BULL: 'TRIPLE_BULL',             // T25 n'existe pas
  MULTIPLIED_MISS: 'MULTIPLIED_MISS',     // D0 / T0 n'existent pas
});

/** Code d'erreur si la fléchette est invalide, sinon null. */
export function dartError(dart) {
  if (dart === null || typeof dart !== 'object') return DART_ERRORS.NOT_A_DART;
  const { segment, multiplier } = dart;
  if (!Number.isInteger(segment) || !((segment >= 0 && segment <= 20) || segment === BULL)) return DART_ERRORS.SEGMENT_INVALID;
  if (!Number.isInteger(multiplier) || multiplier < SINGLE || multiplier > TRIPLE) return DART_ERRORS.MULTIPLIER_INVALID;
  if (segment === BULL && multiplier === TRIPLE) return DART_ERRORS.TRIPLE_BULL;
  if (segment === MISS && multiplier !== SINGLE) return DART_ERRORS.MULTIPLIED_MISS;
  return null;
}

export const isValidDart = dart => dartError(dart) === null;

/** Points marqués (0 à 60). La fléchette doit être valide. */
export const dartValue = dart => dart.segment * dart.multiplier;

/** Vrai pour D1 à D20 et pour 50 (double bull). */
export const isDouble = dart => dart.multiplier === DOUBLE;

/** Copie propre, sans champ superflu, figée. */
export const makeDart = (segment, multiplier = SINGLE) => Object.freeze({ segment, multiplier });

/**
 * Notation courte → fléchette : '0', '20', 'S20', 'D16', 'T19', '25', 'S25', '50', 'D25', 'BULL'.
 * Renvoie null si la notation ne correspond à aucune fléchette valide (ex. 'T25', 'D0', '21').
 */
export function parseDart(text) {
  const s = String(text).trim().toUpperCase();
  let dart;
  if (s === '50' || s === 'BULL' || s === 'DB') dart = makeDart(BULL, DOUBLE);
  else {
    const m = /^([SDT]?)(\d{1,2})$/.exec(s);
    if (!m) return null;
    const mult = m[1] === 'D' ? DOUBLE : m[1] === 'T' ? TRIPLE : SINGLE;
    dart = makeDart(Number(m[2]), mult);
  }
  return isValidDart(dart) ? dart : null;
}

/** Fléchette → notation courte : '0', 'S20', 'D16', 'T19', '25', '50'. */
export function formatDart(dart) {
  if (dart.segment === MISS) return '0';
  if (dart.segment === BULL) return dart.multiplier === DOUBLE ? '50' : '25';
  return (dart.multiplier === TRIPLE ? 'T' : dart.multiplier === DOUBLE ? 'D' : 'S') + dart.segment;
}
