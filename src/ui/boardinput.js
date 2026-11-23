// Strela — saisie au doigt sur la cible (paysage), commune au jeu et à l'entraînement (lot 8 ; extrait de
// screens/game.js) : loupe ×2,5 décalée en haut à gauche du doigt, nom de la zone en gros, on glisse pour ajuster, on
// lâche pour compter. Ce que fait le lâcher (fléchette, ou rien hors de la cible) est décidé par l'écran.
import { segmentAt, zoneLabel, RINGS } from '../engine/board.js';

export const LENS = { size: 150, zoom: 2.5, gap: 26 };
const K = 100; // échelle du dessin de la cible (board.js)

/**
 * Branche la saisie sur le bloc `wrap` (qui contient le SVG de la cible).
 *   canStart()          : faux pour ignorer l'appui (menu ouvert, volée en attente…)
 *   onStart()           : appelé à l'appui (couper une annonce…)
 *   onRelease(x, y)     : point du repère de la cible au lâcher (rayon 1 = bord du double)
 *   label(x, y)         : nom affiché dans la loupe (par défaut : la zone, ou HORS CIBLE)
 */
export function bindBoardInput(wrap, { canStart = () => true, onStart = () => {}, onRelease, label = null, edge = RINGS.edge }) {
  // edge : rayon du repère au bord du dessin (OFF_R quand la cible montre la zone autour, lot 8 du 23/11).
  const svg = wrap.querySelector('svg');
  let active = null;
  let geo = null;
  const toBoard = ev => ({ x: (ev.clientX - geo.cx) / geo.scale, y: (ev.clientY - geo.cy) / geo.scale });
  wrap.addEventListener('pointerdown', ev => {
    if (!canStart()) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    onStart();
    const r = svg.getBoundingClientRect();
    geo = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, scale: r.width / 2 / edge };
    active = ev.pointerId;
    try { wrap.setPointerCapture(ev.pointerId); } catch (e) { /* rien */ }
    const p = toBoard(ev);
    showLoupe(p.x, p.y, ev.clientX, ev.clientY, geo.scale, label);
  });
  wrap.addEventListener('pointermove', ev => {
    if (ev.pointerId !== active) return;
    const p = toBoard(ev);
    showLoupe(p.x, p.y, ev.clientX, ev.clientY, geo.scale, label);
  });
  wrap.addEventListener('pointerup', ev => {
    if (ev.pointerId !== active) return;
    active = null;
    const p = toBoard(ev);
    hideLoupe();
    onRelease(p.x, p.y);
  });
  const cancel = ev => { if (ev.pointerId === active) { active = null; hideLoupe(); } };
  wrap.addEventListener('pointercancel', cancel);
  wrap.addEventListener('lostpointercapture', cancel);
}

let hintTimer = null;
/** Message bref sur la cible (#bhint). */
export function boardHint(text) {
  const el = document.getElementById('bhint');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { el.hidden = true; }, 1500);
}

/** Loupe : zone sous le doigt agrandie ×2,5, en haut à gauche du doigt (la main vient d'en bas). */
export function showLoupe(x, y, clientX, clientY, scale, label = null) {
  const el = document.getElementById('loupe');
  const box = el && el.parentElement.getBoundingClientRect();
  if (!el) return;
  const w = LENS.size / (scale * LENS.zoom);
  el.querySelector('svg').setAttribute('viewBox', `${((x - w / 2) * K).toFixed(1)} ${((y - w / 2) * K).toFixed(1)} ${(w * K).toFixed(1)} ${(w * K).toFixed(1)}`);
  const dart = segmentAt(x, y);
  const lz = el.querySelector('.lz');
  lz.textContent = label ? label(x, y) : dart ? zoneLabel(dart) : 'HORS CIBLE';
  el.classList.toggle('out', !dart);
  el.hidden = false;
  const fx = clientX - box.left, fy = clientY - box.top;
  const h = el.offsetHeight || LENS.size + 52;
  const wd = el.offsetWidth || LENS.size;
  let left = fx - wd - LENS.gap;
  let top = fy - h - LENS.gap;
  if (top < 6) { top = 6; left = fx - wd - LENS.gap * 2.2; } // pas la place au-dessus : franchement à gauche
  left = Math.max(6, left);
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function hideLoupe() {
  const el = document.getElementById('loupe');
  if (el) el.hidden = true;
}

/** Loupe figée (sommaire de maquette) : comme si le doigt était posé en (x, y) sur la cible de `wrap`. */
export function frozenLoupe(wrap, at, label = null, edge = RINGS.edge) {
  const svg = wrap.querySelector('svg');
  const r = svg.getBoundingClientRect();
  const scale = r.width / 2 / edge;
  showLoupe(at.x, at.y, r.left + r.width / 2 + at.x * scale, r.top + r.height / 2 + at.y * scale, scale, label);
}
