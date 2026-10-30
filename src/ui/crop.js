// Strela — recadrage carré d'une photo d'avatar (JS pur, testé) : quelle partie de l'image garder.
// Cadrage = { iw, ih (taille de l'image en px), zoom (1 = le carré le plus grand possible, jusqu'à ZOOM_MAX),
// cx, cy (centre du carré gardé, en px de l'image) }. Le carré fait min(iw, ih) / zoom de côté et reste dans l'image.

export const ZOOM_MAX = 6;
export const AVATAR_PX = 256; // côté de la photo enregistrée

/** Côté du carré gardé, en px de l'image. */
export const side = c => Math.min(c.iw, c.ih) / c.zoom;

/** Ramène le cadrage dans les limites (zoom 1 … ZOOM_MAX, carré dans l'image). */
export function clampCrop(c) {
  const zoom = Math.min(ZOOM_MAX, Math.max(1, c.zoom));
  const s = Math.min(c.iw, c.ih) / zoom;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  return { ...c, zoom, cx: clamp(c.cx, s / 2, c.iw - s / 2), cy: clamp(c.cy, s / 2, c.ih - s / 2) };
}

/** Cadrage de départ : le plus grand carré, centré. */
export const initialCrop = (iw, ih) => ({ iw, ih, zoom: 1, cx: iw / 2, cy: ih / 2 });

/** Glisser de (dx, dy) px à l'écran dans un cadre de `frame` px de côté : l'image suit le doigt. */
export function panBy(c, dx, dy, frame) {
  const k = side(c) / frame; // px d'image par px d'écran
  return clampCrop({ ...c, cx: c.cx - dx * k, cy: c.cy - dy * k });
}

/** Zoom de `factor` autour du point (fx, fy) du cadre (px, depuis son coin haut gauche) : ce point ne bouge pas. */
export function zoomAt(c, factor, fx, fy, frame) {
  const s0 = side(c);
  const px = c.cx - s0 / 2 + (fx / frame) * s0; // point de l'image sous (fx, fy)
  const py = c.cy - s0 / 2 + (fy / frame) * s0;
  const z = Math.min(ZOOM_MAX, Math.max(1, c.zoom * factor));
  const s1 = Math.min(c.iw, c.ih) / z;
  return clampCrop({ ...c, zoom: z, cx: px - (fx / frame) * s1 + s1 / 2, cy: py - (fy / frame) * s1 + s1 / 2 });
}

/** Rectangle source du carré gardé : { sx, sy, size } en px de l'image. */
export function cropSource(c) {
  const s = side(c);
  return { sx: c.cx - s / 2, sy: c.cy - s / 2, size: s };
}

/** Place de l'image dans le cadre affiché : taille et décalage en px d'écran. */
export function imagePlacement(c, frame) {
  const { sx, sy, size } = cropSource(c);
  const k = frame / size;
  return { width: c.iw * k, height: c.ih * k, left: 0 - sx * k, top: 0 - sy * k };
}

/** Taille réduite pour travailler (la photo d'un téléphone fait 12 Mpx ; on n'en garde pas plus de `max` px de côté). */
export function fitWithin(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
