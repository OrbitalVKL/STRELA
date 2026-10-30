// Strela — mesure de la hauteur des chiffres du reste à faire (encre réelle d'un « 0 », en px CSS) dans la page.
export function restDigitHeight() {
  const el = document.querySelector('.rest .big');
  if (!el) return null;
  const s = getComputedStyle(el);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  const m = ctx.measureText('0');
  return Math.round(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
}
