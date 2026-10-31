// Strela — icône (lot 6) : lecture de assets/icon.svg (formes pleines seulement, grille de 108) et déclinaisons sans
// navigateur : calques vectoriels de l'icône adaptative d'Android (premier plan en couleurs, monochrome pour les icônes
// à thème d'Android 13 et plus). tools/make-icons.mjs les écrit ; tests/icone.test.js vérifie qu'ils suivent le SVG.

/** Formes du SVG : [{ id, d, fill }], dans l'ordre du dessin. */
export function iconPaths(svg) {
  return [...svg.matchAll(/<path\b([^>]*)\/>/g)].map(m => {
    const attr = k => (new RegExp(`\\b${k}="([^"]*)"`).exec(m[1]) || [])[1] || '';
    return { id: attr('id'), d: attr('d'), fill: attr('fill') };
  });
}

/** Calque vectoriel d'Android (108 dp) : la fléchette sans le fond ; `mono` : toute en blanc (silhouette). */
export function vectorDrawable(svg, { mono = false } = {}) {
  const paths = iconPaths(svg).filter(p => p.id !== 'fond');
  const body = paths.map(p => `    <path android:fillColor="${mono ? '#FFFFFFFF' : `#FF${p.fill.replace('#', '').toUpperCase()}`}" android:pathData="${p.d}" />`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par tools/make-icons.mjs à partir de assets/icon.svg (ne pas modifier à la main) : ${mono
    ? 'silhouette monochrome de la fléchette (icônes à thème d\'Android 13 et plus ; Android la teinte)'
    : 'premier plan de l\'icône adaptative (fond : @color/icon_bg)'}. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
${body}
</vector>
`;
}

/** Couleur du fond de l'icône (forme id="fond"). */
export const iconBackground = svg => iconPaths(svg).find(p => p.id === 'fond')?.fill || '#0A0C0E';

/** Le même SVG recadré (viewBox) : icônes « any » (PWA, fiche Play), où la zone sûre d'Android n'a pas lieu d'être. */
export const cropped = (svg, [x, y, w, h]) => svg.replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`)
  .replace(/(<path id="fond" d=")[^"]*"/, `$1M${x} ${y}H${x + w}V${y + h}H${x}Z"`);

/** Silhouette seule (sans fond, en noir) : masque CSS de l'aperçu de l'icône à thème (sommaire de maquette). */
export function monoSvg(svg) {
  const paths = iconPaths(svg).filter(p => p.id !== 'fond').map(p => `<path d="${p.d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><!-- Produit par tools/make-icons.mjs (assets/icon.svg) --><g fill="#000">${paths}</g></svg>\n`;
}
