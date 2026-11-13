// Strela — une animation de tour par pictogramme d'avatar (lot 7.9, demande de Guillaume : « toutes différentes »).
// 37 saynètes ici ; l'ours, la cravate, la carabine et la planète gardent les leurs (turnfx.js), ce qui fait une
// animation pour chacun des 41 pictogrammes de la banque. Chaque saynète part de l'avatar du joueur, dure 3 secondes
// environ et n'utilise que le pictogramme lui-même, de petits dessins d'appoint au trait et une étiquette en lettres.
// Mêmes règles que turnfx.js : par-dessus le jeu sans prendre d'appui, arrêtée à la première fléchette, couleurs de la
// DA seulement (aucun rouge). `ctx` : outils de turnfx.js (node, anim, later, label, W, H, from, target, info).
import { ICONS } from './avatars.js';

const SVG_ATTR = 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"';
const haloed = (inner, vb = '0 0 48 48') => `<svg viewBox="${vb}" ${SVG_ATTR} aria-hidden="true"><g class="halo">${inner}</g><g>${inner}</g></svg>`;
const T = (x, y, extra = '') => `translate(${Math.round(x)}px, ${Math.round(y)}px)${extra ? ` ${extra}` : ''}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const STAR4 = '<path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z" fill="currentColor" stroke="none"/>';
const DOT = '<path d="M8 8H16V16H8Z" fill="currentColor" stroke="none"/>';
const RING = '<circle cx="12" cy="12" r="8" stroke-width="2.5"/>';
const WAVE = '<path d="M3 21A18 18 0 0 1 21 3" stroke-width="2.5"/>';

/** Le pictogramme du joueur, en grand : { o (déplacé), i (dedans : balancements), S, ax, ay (avatar), cx, cy (scène) }. */
function hero(ctx, key, size = 96) {
  const S = Math.round(size * clamp(Math.min(ctx.W, ctx.H) / 340, 1, 1.5)); // plus grand sur un grand écran
  const o = ctx.node(`tfx-pic tfx-${key}`, `<div class="tfx-in">${haloed(ICONS[key][1])}</div>`, S, S);
  const { from, W, H } = ctx;
  return { o, i: o.firstChild, S, ax: from.left + from.width / 2 - S / 2, ay: from.top + from.height / 2 - S / 2,
    cx: W / 2 - S / 2, cy: clamp(H * 0.3, 110, H - 160) - S / 2 };
}
/** Trajet : [[moment 0…1, x, y, transformation en plus, opacité], …]. */
const go = (ctx, el, pts, duration, opts = {}) => ctx.anim(el, pts.map(([offset, x, y, extra = '', opacity = 1]) => ({ offset: Math.min(1, Math.round(offset * 1000) / 1000), transform: T(x, y, extra), opacity })),
  { duration, easing: 'ease-in-out', ...opts });
/** Mouvement sur place du dessin (balancement, battement…), sans toucher au trajet. */
const sway = (ctx, el, frames, duration, delay = 0, iterations = 1) => ctx.anim(el, frames.map(f => (typeof f === 'string' ? { transform: f } : f)),
  { duration, delay, iterations, fill: 'none', easing: 'ease-in-out' });
/** Petit dessin d'appoint. */
const bit = (ctx, inner, s, vb = '0 0 24 24') => ctx.node('tfx-bit', haloed(inner, vb), s, s);
/** Éclat : apparaît, grossit, disparaît à (x, y). */
function pop(ctx, inner, x, y, s, delay, duration = 600, spin = 0) {
  const n = bit(ctx, inner, s);
  ctx.anim(n, [
    { transform: T(x - s / 2, y - s / 2, 'scale(0)'), opacity: 0 }, { transform: T(x - s / 2, y - s / 2, `scale(1) rotate(${spin / 2}deg)`), opacity: 1, offset: 0.35 },
    { transform: T(x - s / 2, y - s / 2, `scale(1.5) rotate(${spin}deg)`), opacity: 0 },
  ], { duration, delay, easing: 'ease-out' });
  return n;
}
/** Dessin d'appoint qui file d'un point à un autre. */
function fly(ctx, inner, s, [x0, y0], [x1, y1], delay, duration, extra = '') {
  const n = bit(ctx, inner, s);
  ctx.anim(n, [
    { transform: T(x0 - s / 2, y0 - s / 2, extra), opacity: 0 }, { transform: T(x0 - s / 2, y0 - s / 2, extra), opacity: 1, offset: 0.08 },
    { transform: T(x1 - s / 2, y1 - s / 2, extra), opacity: 1, offset: 0.85 }, { transform: T(x1 - s / 2, y1 - s / 2, extra), opacity: 0 },
  ], { duration, delay, easing: 'ease-out' });
  return n;
}
const snd = (ctx, ms, k) => { if (typeof ctx.info.sound === 'function') ctx.later(ms, () => ctx.info.sound(k)); };
const IN = h => [0, h.ax, h.ay, 'scale(0.5)', 0];
const OUT = h => [1, h.ax, h.ay, 'scale(0.5)', 0];

// ------------------------------------------------------------------ tir et jeu
/** La fléchette fait un looping et se plante au centre de la cible. */
function flechette(ctx) {
  const h = hero(ctx, 'flechette', 84);
  const { target } = ctx;
  const tx = target.x - 39.6 * h.S / 48, ty = target.y - 8.4 * h.S / 48; // la pointe au centre
  go(ctx, h.o, [IN(h), [0.18, tx - 150, ty + 60, 'rotate(40deg)'], [0.36, tx - 70, ty + 170, 'rotate(-320deg)'], [0.44, tx - 60, ty + 60, 'rotate(-360deg)'],
    [0.5, tx, ty, 'rotate(-360deg)'], [0.86, tx, ty, 'rotate(-360deg)'], [1, tx, ty, 'rotate(-360deg) scale(0.7)', 0]], 3000);
  sway(ctx, h.i, ['rotate(0deg)', 'rotate(-7deg)', 'rotate(6deg)', 'rotate(-4deg)', 'rotate(2deg)', 'rotate(0deg)'], 520, 1500);
  pop(ctx, RING, target.x, target.y, 60, 1480, 500);
  ctx.label('TCHAC !', clamp(target.x + 20, 8, ctx.W - 100), target.y - 60, 1550, 1000);
  snd(ctx, 600, 'fx-whoosh'); snd(ctx, 1480, 'fx-thud');
}

/** La cible se pose, trois petites fléchettes viennent s'y planter. */
function cible(ctx) {
  const h = hero(ctx, 'cible', 120);
  go(ctx, h.o, [IN(h), [0.16, h.cx, h.cy, 'rotate(180deg)'], [0.8, h.cx, h.cy, 'rotate(180deg)'], [1, h.cx, h.cy, 'rotate(540deg) scale(0)', 0]], 3300);
  const mx = h.cx + h.S / 2, my = h.cy + h.S / 2;
  [[-18, -14], [16, -4], [-2, 18]].forEach(([dx, dy], k) => {
    const d = bit(ctx, ICONS.flechette[1], 44, '0 0 48 48');
    const x = mx + dx - 36, y = my + dy - 8, t0 = 700 + k * 420;
    ctx.anim(d, [{ transform: T(x - 190, y + 190), opacity: 0 }, { transform: T(x - 150, y + 150), opacity: 1, offset: 0.1 }, { transform: T(x, y), opacity: 1, offset: 0.5 },
      { transform: T(x, y), opacity: 1, offset: 0.9 }, { transform: T(x, y), opacity: 0 }], { duration: 2640 - t0 + 400, delay: t0, easing: 'ease-out' });
    sway(ctx, h.i, ['scale(1)', 'scale(0.94)', 'scale(1.03)', 'scale(1)'], 220, t0 + 620);
    snd(ctx, t0 + 620, 'fx-thud');
  });
  ctx.label('TROIS DANS LE MILLE', clamp(h.cx - 20, 8, ctx.W - 230), h.cy - 34, 2000, 1000);
}

/** Le viseur cherche partout, puis se verrouille sur la cible. */
function viseur(ctx) {
  const h = hero(ctx, 'viseur', 104);
  const { W, H, target } = ctx;
  const tx = target.x - h.S / 2, ty = target.y - h.S / 2;
  go(ctx, h.o, [IN(h), [0.14, W * 0.7 - 52, H * 0.2], [0.28, W * 0.12, H * 0.34], [0.42, W * 0.72 - 52, H * 0.46], [0.54, tx - 30, ty - 20],
    [0.62, tx, ty, 'scale(1.25)'], [0.68, tx, ty, 'scale(0.9)'], [0.74, tx, ty], [0.88, tx, ty], [1, tx, ty, 'scale(1.6)', 0]], 3200);
  [0, 1, 2].forEach(k => pop(ctx, RING, target.x, target.y, 110, 2050 + k * 200, 520));
  ctx.label('VERROUILLÉ', clamp(target.x - 60, 8, W - 150), target.y - h.S / 2 - 30, 2150, 900);
  [450, 900, 1350].forEach(ms => snd(ctx, ms, 'fx-tick')); snd(ctx, 2050, 'fx-beep');
}

/** L'arc se bande et décoche une flèche qui traverse l'écran. */
function arc(ctx) {
  const h = hero(ctx, 'arc', 108);
  const { W } = ctx;
  const x = clamp(W * 0.08, 6, 60), y = h.cy;
  go(ctx, h.o, [IN(h), [0.18, x, y], [0.82, x, y], [1, -h.S - 20, y, '', 0]], 3200);
  sway(ctx, h.i, ['scaleX(1)', { transform: 'scaleX(0.72) translateX(-8px)', offset: 0.7 }, { transform: 'scaleX(1.12)', offset: 0.78 }, 'scaleX(1)'], 1100, 650);
  const ARROW = '<path d="M2 12H40" stroke-width="2.5"/><path d="M46 12L38 7V17Z" fill="currentColor" stroke="none"/><path d="M2 12L6 7M2 12L6 17" stroke-width="2"/>';
  const a = ctx.node('tfx-bit', haloed(ARROW, '0 0 48 24'), 96, 48);
  ctx.anim(a, [{ transform: T(x + 40, y + 30), opacity: 0 }, { transform: T(x + 60, y + 30), opacity: 1, offset: 0.05 }, { transform: T(W + 30, y + 10), opacity: 1 }],
    { duration: 520, delay: 1500, easing: 'ease-in' });
  ctx.label('FFFT', x + h.S + 10, y, 1500, 800);
  snd(ctx, 700, 'fx-creak'); snd(ctx, 1500, 'fx-whoosh');
}

/** La médaille pend au bout de son ruban et se balance en brillant. */
function medaille(ctx) {
  const h = hero(ctx, 'medaille', 112);
  h.i.style.transformOrigin = '50% 0';
  go(ctx, h.o, [IN(h), [0.12, h.cx, -h.S], [0.26, h.cx, h.cy - 30], [0.84, h.cx, h.cy - 30], [1, h.cx, -h.S - 20]], 3400);
  sway(ctx, h.i, ['rotate(0deg)', 'rotate(26deg)', 'rotate(-22deg)', 'rotate(16deg)', 'rotate(-10deg)', 'rotate(5deg)', 'rotate(0deg)'], 1900, 850);
  [[-0.25, 0.6, 1100], [0.8, 0.85, 1500], [0.2, 1.1, 1900], [0.95, 0.35, 2250]].forEach(([dx, dy, t]) => pop(ctx, STAR4, h.cx + dx * h.S, h.cy + dy * h.S, 22, t, 600, 90));
  ctx.label('CHAMPION', h.cx - 6, h.cy + h.S + 6, 1500, 1200);
  [1100, 1500, 1900].forEach(ms => snd(ctx, ms, 'fx-ding'));
}

/** Le dé roule en travers de l'écran, s'arrête : six. */
function de(ctx) {
  const h = hero(ctx, 'de', 80);
  const { W } = ctx;
  const y = h.cy + 30, x1 = clamp(W * 0.62, 0, W - h.S - 10);
  go(ctx, h.o, [IN(h), [0.1, -h.S, y - 60, 'rotate(-90deg)'], [0.22, W * 0.14, y, 'rotate(90deg)'], [0.32, W * 0.3, y - 46, 'rotate(230deg)'], [0.42, W * 0.44, y, 'rotate(360deg)'],
    [0.5, x1 - 20, y - 22, 'rotate(470deg)'], [0.58, x1, y, 'rotate(540deg)'], [0.86, x1, y, 'rotate(540deg)'], [1, x1, y, 'rotate(540deg) scale(0)', 0]], 3200, { easing: 'linear' });
  ctx.label('SIX !', x1 + 8, y - 34, 1900, 1000);
  [700, 1340, 1850].forEach(ms => snd(ctx, ms, 'fx-tick')); snd(ctx, 1950, 'fx-ding');
}

/** La bille roule, cogne le bord, revient et repart. */
function bille(ctx) {
  const h = hero(ctx, 'bille', 72);
  const { W } = ctx;
  const y = h.cy + 40;
  go(ctx, h.o, [IN(h), [0.14, 10, y, 'rotate(0deg)'], [0.42, W - h.S - 6, y, 'rotate(540deg)'], [0.46, W - h.S - 14, y, 'rotate(520deg) scaleX(0.86)'], [0.74, 6, y, 'rotate(0deg)'],
    [0.78, 14, y, 'rotate(20deg) scaleX(0.86)'], [1, W + 20, y, 'rotate(720deg)']], 3400, { easing: 'linear' });
  pop(ctx, DOT, W - 14, y + 36, 26, 1430, 400, 45); pop(ctx, DOT, 14, y + 36, 26, 2520, 400, 45);
  ctx.label('TOC', W - 90, y - 26, 1440, 700); ctx.label('TOC', 20, y - 26, 2530, 700);
  snd(ctx, 1430, 'fx-tick'); snd(ctx, 2520, 'fx-tick');
}

/** Le pique tombe du haut comme une carte qu'on retourne. */
function pique(ctx) {
  const h = hero(ctx, 'pique', 104);
  go(ctx, h.o, [IN(h), [0.1, h.cx, -h.S], [0.34, h.cx - 40, h.cy - 60, 'rotate(-14deg)'], [0.5, h.cx + 20, h.cy, 'rotate(8deg)'], [0.58, h.cx, h.cy + 10], [0.84, h.cx, h.cy + 10],
    [1, h.cx, h.cy + 10, 'scale(0)', 0]], 3200);
  sway(ctx, h.i, ['scaleX(1)', 'scaleX(-1)', 'scaleX(1)', 'scaleX(-1)', 'scaleX(1)'], 1200, 380);
  ctx.label('AS DE PIQUE', h.cx - 16, h.cy - 28, 1900, 1000);
  snd(ctx, 500, 'fx-whoosh'); snd(ctx, 1850, 'fx-pop');
}

/** Le cœur bat, de petits cœurs s'envolent. */
function coeur(ctx) {
  const h = hero(ctx, 'coeur', 108);
  h.i.style.transformOrigin = '50% 50%';
  go(ctx, h.o, [IN(h), [0.16, h.cx, h.cy], [0.84, h.cx, h.cy], OUT(h)], 3300);
  sway(ctx, h.i, ['scale(1)', { transform: 'scale(1.22)', offset: 0.12 }, { transform: 'scale(1)', offset: 0.26 }, { transform: 'scale(1.16)', offset: 0.38 }, { transform: 'scale(1)', offset: 0.55 }, 'scale(1)'], 760, 600, 3);
  [[-0.15, 0], [0.65, 250], [1.1, 520], [0.22, 800], [0.9, 1100]].forEach(([dx, d], k) =>
    fly(ctx, ICONS.coeur[1].replace('<path', '<path stroke-width="4"'), 28, [h.cx + dx * h.S, h.cy + 10], [h.cx + dx * h.S + (k % 2 ? 14 : -14), h.cy - 110], 800 + d, 1100));
  ctx.label('BOUM BOUM', h.cx - 4, h.cy + h.S + 8, 900, 1500);
  [600, 890, 1360, 1650, 2120, 2410].forEach(ms => snd(ctx, ms, 'fx-thud'));
}

/** Le trèfle descend en feuille morte, d'un bord à l'autre. */
function trefle(ctx) {
  const h = hero(ctx, 'trefle', 92);
  const { W } = ctx;
  const l = W * 0.16, r = W * 0.84 - h.S;
  go(ctx, h.o, [IN(h), [0.1, r, 40, 'rotate(20deg)'], [0.3, l, h.cy - 60, 'rotate(-24deg)'], [0.5, r, h.cy, 'rotate(24deg)'], [0.7, l + 40, h.cy + 60, 'rotate(-18deg)'],
    [0.86, h.cx, h.cy + 90, 'rotate(0deg)'], [1, h.cx, h.cy + 90, 'scale(0)', 0]], 3600, { easing: 'ease-in-out' });
  ctx.label('CHANCE', h.cx, h.cy + 60, 2700, 800);
  [400, 1100, 1800].forEach(ms => snd(ctx, ms, 'fx-whoosh')); snd(ctx, 2900, 'fx-ding');
}

/** La couronne descend se poser sur l'avatar du joueur. */
function couronne(ctx) {
  const h = hero(ctx, 'couronne', 88);
  const { from } = ctx;
  const x = from.left + from.width / 2 - h.S / 2, y = Math.max(-10, from.top - h.S * 0.62);
  go(ctx, h.o, [[0, h.cx, -h.S, '', 0], [0.12, h.cx, h.cy - 20, 'rotate(-8deg)'], [0.3, h.cx, h.cy - 20, 'rotate(8deg)'], [0.56, x, y - 26, 'rotate(0deg) scale(0.9)'], [0.64, x, y, 'scale(0.8)'],
    [0.9, x, y, 'scale(0.8)'], [1, x, y, 'scale(0.8)', 0]], 3400);
  sway(ctx, h.i, ['translateY(0)', 'translateY(-5px)', 'translateY(0)'], 260, 2180, 2);
  [[-8, 6, 2250], [h.S * 0.72, 0, 2450], [h.S * 0.32, -14, 2650]].forEach(([dx, dy, t]) => pop(ctx, STAR4, x + dx, y + dy, 20, t, 520, 90));
  ctx.label('VIVE LE ROI', clamp(x + h.S, 8, ctx.W - 150), y + 40, 2250, 1000);
  snd(ctx, 2180, 'fx-ding'); snd(ctx, 2450, 'fx-ding');
}

// ------------------------------------------------------------------ espace
/** La fusée : 3, 2, 1, elle tremble et décolle. */
function rocket(ctx) {
  const h = hero(ctx, 'rocket', 104);
  const { H } = ctx;
  const y = clamp(H * 0.42, 150, H - 220);
  go(ctx, h.o, [IN(h), [0.14, h.cx, y], [0.52, h.cx, y], [0.6, h.cx, y + 8], [1, h.cx, -h.S - 60]], 3300, { easing: 'ease-in' });
  sway(ctx, h.i, ['translateX(-2px)', 'translateX(2px)'], 70, 1150, 9);
  ['3', '2', '1'].forEach((n, k) => ctx.label(n, h.cx + h.S + 6, y + 20, 380 + k * 340, 420));
  ctx.label('DÉCOLLAGE', h.cx - 14, y + h.S + 30, 1500, 1000);
  const FLAME = '<path d="M6 2L12 22L18 2" stroke-width="2.5"/><path d="M10 2L12 12L14 2" stroke-width="2"/>';
  const f = bit(ctx, FLAME, 44);
  const fx = h.cx + h.S / 2 - 22;
  ctx.anim(f, [{ transform: T(fx, y + h.S - 8, 'scaleY(0.2)'), opacity: 0 }, { transform: T(fx, y + h.S - 4, 'scaleY(1)'), opacity: 1, offset: 0.2 },
    { transform: T(fx, y + h.S + 4, 'scaleY(1.5)'), opacity: 1, offset: 0.45 }, { transform: T(fx, -40, 'scaleY(1.8)'), opacity: 0 }], { duration: 2100, delay: 1150, easing: 'ease-in' });
  [380, 720, 1060].forEach(ms => snd(ctx, ms, 'fx-beep')); snd(ctx, 1400, 'fx-rumble');
}

/** Le Spoutnik passe en ondulant : bip, bip, bip. */
function spoutnik(ctx) {
  const h = hero(ctx, 'spoutnik', 88);
  const { W } = ctx;
  const pts = [IN(h)];
  for (let k = 0; k <= 10; k++) pts.push([0.12 + k * 0.088, -h.S + (W + h.S * 2) * (k / 10), h.cy + Math.sin(k * 1.25) * 36, `rotate(${Math.round(Math.sin(k * 1.25) * 10)}deg)`]);
  go(ctx, h.o, pts, 3600, { easing: 'linear' });
  [0.3, 0.52, 0.74].forEach((p, k) => {
    const t = 3600 * (0.12 + p * 0.88);
    ctx.label('BIP', (W + h.S) * p - 10, h.cy - 40 + (k % 2) * 16, t, 600);
    pop(ctx, WAVE, (W + h.S) * p + 30, h.cy - 10, 40, t, 500);
    snd(ctx, t, 'fx-beep');
  });
}

/** Le satellite tourne autour de la cible en envoyant son signal. */
function satellite(ctx) {
  const h = hero(ctx, 'satellite', 80);
  const { W, H, target } = ctx;
  const R = clamp(target.r * 0.95, 70, Math.min(W, H) * 0.36);
  const pts = [IN(h)];
  for (let k = 0; k <= 18; k++) {
    const a = -Math.PI / 2 + (k / 18) * Math.PI * 3;
    pts.push([0.14 + k * 0.04, clamp(target.x + Math.cos(a) * R - h.S / 2, 0, W - h.S), clamp(target.y + Math.sin(a) * R * 0.8 - h.S / 2, 50, H - h.S), `rotate(${Math.round((k / 18) * 180)}deg)`]);
  }
  pts.push([1, W + 30, 60, 'rotate(260deg)', 0]);
  go(ctx, h.o, pts, 3600, { easing: 'linear' });
  [900, 1600, 2300].forEach(t => { pop(ctx, RING, target.x, target.y, 70, t, 700); snd(ctx, t, 'fx-beep'); });
  ctx.label('SIGNAL REÇU', clamp(target.x - 70, 8, W - 170), target.y - 12, 2300, 900);
}

/** Le casque flotte en apesanteur, en tournant lentement sur lui-même. */
function casque(ctx) {
  const h = hero(ctx, 'casque', 100);
  h.i.style.transformOrigin = '50% 50%';
  const { W } = ctx;
  go(ctx, h.o, [IN(h), [0.2, W * 0.2, h.cy + 30], [0.5, h.cx + 10, h.cy - 40], [0.8, W * 0.8 - h.S, h.cy + 20], [1, W + 20, h.cy - 60]], 4000, { easing: 'linear' });
  sway(ctx, h.i, ['rotate(-20deg)', 'rotate(340deg)'], 3600, 300);
  [[0.25, 30], [0.5, -50], [0.72, 60]].forEach(([p, dy], k) => pop(ctx, STAR4, W * p, h.cy + dy, 18, 700 + k * 800, 700, 90));
  ctx.label('ZÉRO G', h.cx + 6, h.cy + h.S + 20, 1500, 1300);
  snd(ctx, 600, 'fx-hum');
}

/** L'antenne balaie le ciel et lance ses ondes. */
function antenne(ctx) {
  const h = hero(ctx, 'antenne', 108);
  const { W } = ctx;
  const x = clamp(W * 0.1, 6, 60), y = h.cy + 20;
  go(ctx, h.o, [IN(h), [0.16, x, y], [0.84, x, y], [1, -h.S - 20, y, '', 0]], 3400);
  sway(ctx, h.i, ['rotate(0deg)', 'rotate(-16deg)', 'rotate(10deg)', 'rotate(-8deg)', 'rotate(0deg)'], 1600, 600);
  [0, 1, 2, 3].forEach(k => {
    const t = 900 + k * 380, s = 60;
    const n = bit(ctx, WAVE, s);
    ctx.anim(n, [{ transform: T(x + 60, y - 20, 'rotate(90deg) scale(0.4)'), opacity: 0 }, { transform: T(x + 90, y - 50, 'rotate(90deg) scale(1)'), opacity: 1, offset: 0.3 },
      { transform: T(x + 190, y - 150, 'rotate(90deg) scale(2.4)'), opacity: 0 }], { duration: 900, delay: t, easing: 'ease-out' });
    snd(ctx, t, 'fx-beep');
  });
  ctx.label('ALLÔ LA TERRE ?', x + 40, y + h.S + 6, 1300, 1300);
}

/** La lune se lève, traverse le ciel en arc et se couche. */
function lune(ctx) {
  const h = hero(ctx, 'lune', 92);
  const { W } = ctx;
  const pts = [IN(h)];
  for (let k = 0; k <= 12; k++) { const p = k / 12; pts.push([0.1 + p * 0.9, -h.S + (W + h.S * 2) * p, h.cy + 110 - Math.sin(p * Math.PI) * 170, `rotate(${Math.round(-30 + p * 60)}deg)`]); }
  go(ctx, h.o, pts, 3800, { easing: 'linear' });
  [[0.2, 10], [0.4, -70], [0.62, -40], [0.8, 30], [0.52, 60]].forEach(([p, dy], k) => pop(ctx, STAR4, W * p, h.cy + dy, 16 + (k % 2) * 8, 600 + k * 520, 800, 90));
  ctx.label('BONNE NUIT', h.cx - 10, h.cy + 130, 1500, 1300);
  [700, 1500, 2300].forEach(ms => snd(ctx, ms, 'fx-ding'));
}

/** L'étoile file, laisse une traînée et éclate en cinq petites étoiles. */
function etoile(ctx) {
  const h = hero(ctx, 'etoile', 84);
  h.i.style.transformOrigin = '50% 50%';
  const { W } = ctx;
  const ex = W * 0.7 - h.S / 2, ey = h.cy + 20;
  go(ctx, h.o, [IN(h), [0.14, -h.S, h.cy + 150, 'rotate(0deg)'], [0.52, ex, ey, 'rotate(360deg)'], [0.6, ex, ey, 'rotate(396deg) scale(1.35)'], [0.66, ex, ey, 'rotate(432deg) scale(0)', 0], [1, ex, ey, 'scale(0)', 0]], 3200, { easing: 'ease-in' });
  [0.25, 0.4, 0.55, 0.7, 0.85].forEach((p, k) => pop(ctx, STAR4, -h.S + (ex + h.S * 1.5) * p, h.cy + 150 + (ey - h.cy - 150) * p + 30, 16, 560 + k * 230, 600, 45));
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + k * Math.PI * 2 / 5, cx = ex + h.S / 2, cy = ey + h.S / 2;
    fly(ctx, ICONS.etoile[1], 34, [cx, cy], [cx + Math.cos(a) * 110, cy + Math.sin(a) * 110], 2000, 900);
  }
  ctx.label('FAIS UN VŒU', clamp(ex - 40, 8, W - 150), ey - 70, 2100, 900);
  snd(ctx, 500, 'fx-whoosh'); snd(ctx, 2000, 'fx-pop'); snd(ctx, 2100, 'fx-ding');
}

// ------------------------------------------------------------------ animaux
/** Le renard se faufile, s'arrête, guette, puis file comme une flèche. */
function renard(ctx) {
  const h = hero(ctx, 'renard', 88);
  const { W } = ctx;
  const y = h.cy + 30;
  go(ctx, h.o, [IN(h), [0.1, -h.S, y], [0.3, W * 0.22, y], [0.36, W * 0.24, y + 6, 'scaleY(0.86)'], [0.6, W * 0.24, y + 6, 'scaleY(0.86)'], [0.66, W * 0.2, y, 'scaleX(0.9)'], [0.8, W + 30, y - 10, 'scaleX(1.25)'], [1, W + 30, y, '', 0]], 3200);
  sway(ctx, h.i, ['rotate(0deg)', 'rotate(-14deg)', 'rotate(14deg)', 'rotate(0deg)'], 620, 1180);
  ctx.label('RUSÉ…', W * 0.24 + h.S, y - 20, 1200, 800);
  [0, 1, 2].forEach(k => pop(ctx, DOT, W * 0.3 + k * 46, y + h.S - 10, 18, 2150 + k * 70, 400));
  snd(ctx, 1200, 'fx-tick'); snd(ctx, 2100, 'fx-whoosh');
}

/** Le loup lève la tête et hurle à la lune. */
function loup(ctx) {
  const h = hero(ctx, 'loup', 100);
  const { W } = ctx;
  const x = W * 0.3 - h.S / 2, y = h.cy + 50;
  go(ctx, h.o, [IN(h), [0.16, x, y], [0.84, x, y], [1, -h.S - 20, y, '', 0]], 3600);
  sway(ctx, h.i, ['rotate(0deg)', { transform: 'rotate(24deg) translateY(-4px)', offset: 0.2 }, { transform: 'rotate(28deg) translateY(-6px)', offset: 0.8 }, 'rotate(0deg)'], 1800, 800);
  const m = bit(ctx, ICONS.lune[1], 64, '0 0 48 48');
  ctx.anim(m, [{ transform: T(W * 0.72, y - 30, 'scale(0.4)'), opacity: 0 }, { transform: T(W * 0.72, y - 120), opacity: 1, offset: 0.25 }, { transform: T(W * 0.72, y - 130), opacity: 1, offset: 0.8 }, { transform: T(W * 0.72, y - 130), opacity: 0 }],
    { duration: 2800, delay: 300, easing: 'ease-out' });
  ctx.label('AOUUUUH', x + h.S * 0.7, y - 34, 1000, 1500);
  snd(ctx, 950, 'fx-howl');
}

/** Le sanglier recule, gratte le sol et charge à travers l'écran. */
function sanglier(ctx) {
  const h = hero(ctx, 'sanglier', 96);
  const { W } = ctx;
  const y = h.cy + 30, x0 = W - h.S - 10;
  go(ctx, h.o, [IN(h), [0.14, x0, y], [0.3, x0 + 16, y], [0.46, x0 + 16, y], [0.5, x0 + 26, y, 'scaleX(0.9)'], [0.72, -h.S - 40, y, 'scaleX(1.2)'], [1, -h.S - 40, y, '', 0]], 3200);
  sway(ctx, h.i, ['rotate(0deg)', 'rotate(-10deg) translateY(4px)', 'rotate(0deg)'], 240, 950, 2);
  [0, 1, 2, 3].forEach(k => pop(ctx, DOT, x0 + h.S - 10 - k * 70, y + h.S - 6, 22, 1620 + k * 110, 500, 45));
  ctx.label('GROIN GROIN', x0 - 130, y - 20, 950, 800);
  ctx.label('ÇA CHARGE', W * 0.3, y - 30, 1750, 900);
  snd(ctx, 950, 'fx-grunt'); snd(ctx, 1600, 'fx-rumble');
}

/** Le cerf avance d'un pas noble, salue de ses bois et brame. */
function cerf(ctx) {
  const h = hero(ctx, 'cerf', 104);
  go(ctx, h.o, [IN(h), [0.1, -h.S, h.cy + 20], [0.34, h.cx, h.cy + 20], [0.82, h.cx, h.cy + 20], [1, ctx.W + 20, h.cy + 20]], 3800);
  sway(ctx, h.i, ['translateY(0)', 'translateY(-5px)', 'translateY(0)'], 420, 380, 2);
  sway(ctx, h.i, ['rotate(0deg)', { transform: 'rotate(22deg) translateY(8px)', offset: 0.3 }, { transform: 'rotate(22deg) translateY(8px)', offset: 0.6 }, 'rotate(0deg)'], 900, 1350);
  sway(ctx, h.i, ['rotate(-4deg)', 'rotate(4deg)'], 110, 2350, 6);
  ctx.label('BRAAAME', h.cx + h.S - 10, h.cy, 2350, 800);
  snd(ctx, 2350, 'fx-howl');
}

/** Le bélier fonce tête baissée sur la cible, rebondit et recommence. */
function belier(ctx) {
  const h = hero(ctx, 'belier', 92);
  const { target, W } = ctx;
  const y = target.y - h.S / 2, hit = clamp(target.x - h.S - 10, 0, W - h.S * 2), far = clamp(hit - 130, -20, W);
  go(ctx, h.o, [IN(h), [0.14, far, y], [0.3, far - 14, y], [0.38, hit, y, 'rotate(10deg)'], [0.46, far + 30, y, 'rotate(-8deg)'], [0.56, far, y], [0.64, hit, y, 'rotate(10deg)'],
    [0.72, far + 40, y - 10, 'rotate(-16deg)'], [0.84, far + 40, y], [1, -h.S - 30, y, '', 0]], 3400);
  [1290, 2180].forEach((t, k) => {
    pop(ctx, STAR4, hit + h.S + 6, y + 20, 28, t, 500, 90); pop(ctx, STAR4, hit + h.S + 20, y + 54, 20, t + 60, 500, -90);
    ctx.label(k ? 'BONG !' : 'BONG', hit + h.S - 20, y - 30, t, 650);
    snd(ctx, t, 'fx-thud');
  });
}

/** Le lièvre traverse l'écran en trois grands bonds. */
function lievre(ctx) {
  const h = hero(ctx, 'lievre', 84);
  const { W } = ctx;
  const y = h.cy + 70, hop = (W + h.S) / 3;
  const pts = [IN(h), [0.1, -h.S, y]];
  for (let k = 0; k < 3; k++) {
    const x = -h.S + hop * k, o = 0.12 + k * 0.24;
    pts.push([o, x, y, 'scale(1.1, 0.8)'], [o + 0.11, x + hop / 2, y - 130, 'scale(0.92, 1.14) rotate(-8deg)'], [o + 0.22, x + hop, y, 'scale(1.1, 0.8)']);
    pop(ctx, DOT, x + hop + h.S / 2, y + h.S - 4, 20, 3000 * (o + 0.22), 400);
    ctx.label('BOING', x + hop / 2, y - 150, 3000 * (o + 0.03), 500);
    snd(ctx, 3000 * o, 'fx-boing');
  }
  pts.push([0.9, W + 30, y - 40], [1, W + 30, y, '', 0]);
  go(ctx, h.o, pts, 3000, { easing: 'ease-in-out' });
}

/** Le chat sort du bas de l'écran, regarde à gauche, à droite, s'étire et repart. */
function chat(ctx) {
  const h = hero(ctx, 'chat', 104);
  const { W, H } = ctx;
  const x = W * 0.62 - h.S / 2, low = H + 10, peek = clamp(H * 0.5, 200, H - 150);
  go(ctx, h.o, [IN(h), [0.08, x, low, '', 0], [0.12, x, low], [0.26, x, peek + 50], [0.62, x, peek + 50], [0.7, x, peek, 'scale(1.2, 0.84)'], [0.8, x, peek + 50], [1, x, low]], 3600);
  sway(ctx, h.i, ['rotate(0deg)', 'rotate(-18deg)', 'rotate(-18deg)', 'rotate(18deg)', 'rotate(18deg)', 'rotate(0deg)'], 1200, 1000);
  ctx.label('MIAOU ?', x - 60, peek + 10, 1250, 900);
  ctx.label('RRRR', x + h.S - 10, peek - 10, 2500, 700);
  snd(ctx, 1250, 'fx-meow');
}

/** Le hibou se pose en haut, tourne la tête presque tout autour et cligne des yeux. */
function hibou(ctx) {
  const h = hero(ctx, 'hibou', 100);
  h.i.style.transformOrigin = '50% 50%';
  const y = h.cy - 30;
  go(ctx, h.o, [IN(h), [0.16, h.cx, y], [0.84, h.cx, y], [1, h.cx, -h.S - 20]], 3600);
  sway(ctx, h.i, ['rotate(0deg)', { transform: 'rotate(160deg)', offset: 0.4 }, { transform: 'rotate(160deg)', offset: 0.6 }, 'rotate(0deg)'], 1500, 700);
  sway(ctx, h.i, ['scaleY(1)', 'scaleY(0.82)', 'scaleY(1)'], 180, 2300, 2);
  ctx.label('HOU', h.cx - 50, y + 20, 900, 600); ctx.label('HOU', h.cx + h.S + 4, y + 20, 1500, 600);
  snd(ctx, 900, 'fx-hoot'); snd(ctx, 1500, 'fx-hoot');
}

/** L'aigle plane en grand cercle, puis pique sur la cible. */
function aigle(ctx) {
  const h = hero(ctx, 'aigle', 112);
  h.i.style.transformOrigin = '50% 50%';
  const { W, target } = ctx;
  const pts = [IN(h)];
  for (let k = 0; k <= 10; k++) { const a = Math.PI + (k / 10) * Math.PI * 2; pts.push([0.12 + k * 0.05, h.cx + Math.cos(a) * W * 0.3, h.cy - 10 + Math.sin(a) * 60, `rotate(${Math.round(Math.cos(a) * -14)}deg)`]); }
  pts.push([0.7, h.cx, h.cy - 90, 'rotate(0deg) scale(0.8)'], [0.8, target.x - h.S / 2, target.y - h.S / 2, 'scale(1.15)'], [0.88, target.x - h.S / 2, target.y - h.S / 2 - 30], [1, W + 40, 40, 'scale(0.7)', 0]);
  go(ctx, h.o, pts, 3600, { easing: 'linear' });
  sway(ctx, h.i, ['scaleY(1)', 'scaleY(0.8)', 'scaleY(1)'], 500, 400, 4);
  pop(ctx, RING, target.x, target.y, 80, 2880, 500);
  ctx.label('PIQUÉ !', clamp(target.x + 30, 8, W - 110), target.y - 70, 2700, 800);
  snd(ctx, 500, 'fx-screech'); snd(ctx, 2600, 'fx-whoosh');
}

/** Le corbeau arrive en battant des ailes, se pose et picore trois fois. */
function corbeau(ctx) {
  const h = hero(ctx, 'corbeau', 96);
  const { W } = ctx;
  const x = W * 0.56 - h.S / 2, y = h.cy + 40;
  go(ctx, h.o, [IN(h), [0.1, W + 20, y - 120], [0.2, W * 0.8, y - 60], [0.34, x, y], [0.8, x, y], [0.9, x - 60, y - 70], [1, -h.S - 30, y - 160]], 3600);
  sway(ctx, h.i, ['scaleY(1) translateY(0)', 'scaleY(0.82) translateY(-8px)', 'scaleY(1) translateY(0)'], 220, 300, 4);
  sway(ctx, h.i, ['rotate(0deg)', 'rotate(-24deg) translate(-6px, 6px)', 'rotate(0deg)'], 300, 1350, 3);
  [1500, 1800, 2100].forEach((t, k) => { pop(ctx, DOT, x - 4, y + h.S * 0.62, 14, t, 300); if (k < 2) snd(ctx, t, 'fx-tick'); });
  ctx.label('CROA', x + h.S - 6, y - 20, 2400, 700);
  snd(ctx, 2400, 'fx-caw');
}

/** Le poisson nage en ondulant, des bulles montent derrière lui. */
function poisson(ctx) {
  const h = hero(ctx, 'poisson', 92);
  const { W } = ctx;
  const pts = [IN(h)];
  for (let k = 0; k <= 12; k++) pts.push([0.1 + k * 0.075, W + 10 - (W + h.S + 30) * (k / 12), h.cy + 30 + Math.sin(k * 1.1) * 30, `rotate(${Math.round(Math.cos(k * 1.1) * -12)}deg)`]);
  go(ctx, h.o, pts, 3600, { easing: 'linear' });
  sway(ctx, h.i, ['scaleX(1)', 'scaleX(0.9)', 'scaleX(1)'], 300, 360, 10);
  [0.78, 0.6, 0.42, 0.26].forEach((p, k) => {
    const t = 900 + k * 520, x = W * p + 40;
    fly(ctx, RING, 14 + (k % 2) * 8, [x, h.cy + 50], [x + 10, h.cy - 60], t, 900);
    snd(ctx, t, 'fx-pop');
  });
  ctx.label('BLOUP', W * 0.5, h.cy - 40, 1700, 900);
}

/** La tortue avance tout doucement… et rentre dans sa carapace. */
function tortue(ctx) {
  const h = hero(ctx, 'tortue', 96);
  h.i.style.transformOrigin = '50% 50%';
  const { W } = ctx;
  const y = h.cy + 40, x0 = W * 0.2 - h.S / 2;
  go(ctx, h.o, [IN(h), [0.12, x0, y, 'rotate(90deg)'], [0.7, x0 + 110, y, 'rotate(90deg)'], [0.9, x0 + 110, y, 'rotate(90deg)'], [1, x0 + 110, y, 'rotate(90deg) scale(0)', 0]], 4000, { easing: 'linear' });
  sway(ctx, h.i, ['rotate(-5deg)', 'rotate(5deg)', 'rotate(-5deg)'], 580, 480, 4);
  sway(ctx, h.i, ['scale(1)', 'scale(0.78)', 'scale(0.78)', 'scale(1)'], 760, 2850);
  ctx.label('… J\'ARRIVE …', x0 + h.S + 110, y + 30, 900, 1700);
  ctx.label('OUF', x0 + h.S + 110, y + 30, 2900, 700);
  [600, 1200, 1800, 2400].forEach(ms => snd(ctx, ms, 'fx-tick'));
}

// ------------------------------------------------------------------ bar et objets
/** La chope glisse sur le comptoir, s'arrête net, la mousse saute : santé. */
function chope(ctx) {
  const h = hero(ctx, 'chope', 100);
  const { W } = ctx;
  const y = h.cy + 30, x1 = clamp(W * 0.6 - h.S / 2, 0, W - h.S - 10);
  const bar = ctx.node('tfx-line', '', W, 3);
  ctx.anim(bar, [{ transform: T(0, y + h.S - 2), opacity: 0 }, { transform: T(0, y + h.S - 2), opacity: 1, offset: 0.1 }, { transform: T(0, y + h.S - 2), opacity: 1, offset: 0.88 }, { transform: T(0, y + h.S - 2), opacity: 0 }], { duration: 3300 });
  go(ctx, h.o, [IN(h), [0.1, -h.S, y], [0.4, x1 + 14, y, 'skewX(-8deg)'], [0.46, x1, y, 'skewX(5deg)'], [0.52, x1, y], [0.62, x1, y - 26, 'rotate(-24deg)'], [0.76, x1, y - 26, 'rotate(-24deg)'], [0.84, x1, y], [1, x1, y, 'scale(0)', 0]], 3300);
  [[0.2, -6], [0.44, -18], [0.66, -4]].forEach(([dx, dy], k) => fly(ctx, DOT, 16, [x1 + dx * h.S, y + 8], [x1 + dx * h.S + (k - 1) * 22, y + dy - 44], 1480 + k * 60, 520));
  ctx.label('SANTÉ !', x1 - 30, y - 60, 2050, 900);
  snd(ctx, 400, 'fx-slide'); snd(ctx, 1480, 'fx-thud'); snd(ctx, 2100, 'fx-gulp');
}

/** Deux verres s'inclinent et trinquent : tchin. */
function verre(ctx) {
  const h = hero(ctx, 'verre', 96);
  const { W } = ctx;
  const y = h.cy + 20, lx = W / 2 - h.S + 6, rx = W / 2 - 6;
  go(ctx, h.o, [IN(h), [0.18, lx - 60, y], [0.42, lx - 60, y, 'rotate(-12deg)'], [0.5, lx, y, 'rotate(16deg)'], [0.56, lx - 16, y, 'rotate(6deg)'], [0.82, lx - 16, y], OUT(h)], 3300);
  const o = ctx.node('tfx-pic', `<div class="tfx-in">${haloed(ICONS.verre[1])}</div>`, h.S, h.S);
  o.firstChild.style.transform = 'scaleX(-1)';
  go(ctx, o, [[0, W + 20, y, '', 0], [0.18, rx + 60, y], [0.42, rx + 60, y, 'rotate(12deg)'], [0.5, rx, y, 'rotate(-16deg)'], [0.56, rx + 16, y, 'rotate(-6deg)'], [0.82, rx + 16, y], [1, W + 20, y, '', 0]], 3300);
  [[0, -14, 0], [-22, 6, 60], [22, 6, 60], [0, -44, 120]].forEach(([dx, dy, d]) => pop(ctx, STAR4, W / 2 + dx, y + 14 + dy, 22, 1650 + d, 560, 90));
  ctx.label('TCHIN !', W / 2 - 40, y - 50, 1700, 1000);
  snd(ctx, 1650, 'fx-clink');
}

/** L'ancre tombe au bout de sa chaîne : plouf, elle se balance. */
function ancre(ctx) {
  const h = hero(ctx, 'ancre', 100);
  h.i.style.transformOrigin = '50% 0';
  const { H } = ctx;
  const y = clamp(H * 0.44, 160, H - 220);
  const chain = ctx.node('tfx-chain', '', 4, y + 10);
  ctx.anim(chain, [{ transform: T(h.cx + h.S / 2 - 2, -y - 20), opacity: 1 }, { transform: T(h.cx + h.S / 2 - 2, 0), opacity: 1, offset: 0.3 }, { transform: T(h.cx + h.S / 2 - 2, 0), opacity: 1, offset: 0.84 }, { transform: T(h.cx + h.S / 2 - 2, -y - 40), opacity: 1 }],
    { duration: 3400, easing: 'ease-in' });
  go(ctx, h.o, [[0, h.cx, -h.S - 20], [0.3, h.cx, y], [0.34, h.cx, y - 12], [0.38, h.cx, y], [0.84, h.cx, y], [1, h.cx, -h.S - 40]], 3400, { easing: 'ease-in' });
  sway(ctx, h.i, ['rotate(0deg)', 'rotate(12deg)', 'rotate(-9deg)', 'rotate(5deg)', 'rotate(0deg)'], 1500, 1300);
  [-1, 1].forEach(d => [0, 1, 2].forEach(k => fly(ctx, DOT, 14, [h.cx + h.S / 2 + d * 20, y + h.S - 10], [h.cx + h.S / 2 + d * (50 + k * 26), y + h.S - 60 - k * 18], 1020 + k * 40, 520)));
  ctx.label('PLOUF', h.cx + h.S + 4, y + 30, 1050, 900);
  snd(ctx, 300, 'fx-slide'); snd(ctx, 1020, 'fx-splash');
}

/** La boussole s'affole, puis son aiguille se cale : cap sur le 20. */
function boussole(ctx) {
  const h = hero(ctx, 'boussole', 108);
  h.i.style.transformOrigin = '50% 50%';
  go(ctx, h.o, [IN(h), [0.16, h.cx, h.cy], [0.86, h.cx, h.cy], OUT(h)], 3400);
  sway(ctx, h.i, ['rotate(0deg)', { transform: 'rotate(1080deg)', offset: 0.5 }, { transform: 'rotate(1050deg)', offset: 0.62 }, { transform: 'rotate(1100deg)', offset: 0.74 }, { transform: 'rotate(1072deg)', offset: 0.86 }, 'rotate(1080deg)'], 2200, 550);
  ctx.label('N', h.cx + h.S / 2 - 8, h.cy - 34, 2500, 800);
  ctx.label('CAP SUR LE 20', h.cx - 26, h.cy + h.S + 8, 2450, 900);
  [600, 800, 1000, 1200, 1400].forEach(ms => snd(ctx, ms, 'fx-tick')); snd(ctx, 2500, 'fx-ding');
}

/** La montagne sort de terre, un drapeau se plante au sommet. */
function montagne(ctx) {
  const h = hero(ctx, 'montagne', 132);
  const { H } = ctx;
  const y = clamp(H * 0.36, 130, H - 240);
  go(ctx, h.o, [[0, h.cx, y + 200, 'scaleY(0.2)', 0], [0.1, h.cx, y + 120, 'scaleY(0.4)'], [0.34, h.cx, y], [0.86, h.cx, y], [1, h.cx, y + 200, 'scaleY(0.2)', 0]], 3600);
  sway(ctx, h.i, ['translateX(-2px)', 'translateX(2px)'], 80, 300, 10);
  const FLAG = '<path d="M6 23V2"/><path d="M6 3H19L15 8L19 13H6" fill="currentColor" stroke="none"/>';
  const sx = h.cx + h.S * 17 / 48, sy = y + h.S * 14 / 48;
  const f = bit(ctx, FLAG, 40);
  ctx.anim(f, [{ transform: T(sx - 10, sy - 120), opacity: 0 }, { transform: T(sx - 10, sy - 90), opacity: 1, offset: 0.2 }, { transform: T(sx - 10, sy - 38), opacity: 1, offset: 0.4 }, { transform: T(sx - 10, sy - 38), opacity: 1, offset: 0.9 },
    { transform: T(sx - 10, sy - 38), opacity: 0 }], { duration: 1700, delay: 1350, easing: 'ease-in' });
  ctx.label('SOMMET !', sx + 34, sy - 60, 2050, 900);
  snd(ctx, 300, 'fx-rumble'); snd(ctx, 2030, 'fx-thud'); snd(ctx, 2150, 'fx-ding');
}

/** La flamme vacille, grandit, crache des étincelles et s'éteint dans un souffle. */
function flamme(ctx) {
  const h = hero(ctx, 'flamme', 104);
  h.i.style.transformOrigin = '50% 100%';
  go(ctx, h.o, [IN(h), [0.16, h.cx, h.cy + 20], [0.86, h.cx, h.cy + 20], [1, h.cx, h.cy + 20, 'scale(1.3, 0.1)', 0]], 3400);
  sway(ctx, h.i, ['scale(1) skewX(0deg)', 'scale(0.94, 1.1) skewX(-6deg)', 'scale(1.06, 0.95) skewX(5deg)', 'scale(0.97, 1.16) skewX(-3deg)', 'scale(1) skewX(0deg)'], 520, 550, 4);
  sway(ctx, h.i, ['scale(1)', 'scale(1.35, 1.5)', 'scale(1)'], 500, 2630);
  [[0.1, 700], [0.8, 950], [0.4, 1250], [0.92, 1500], [0.22, 1800], [0.6, 2100]].forEach(([dx, t], k) => fly(ctx, DOT, 12, [h.cx + dx * h.S, h.cy + 30], [h.cx + dx * h.S + (k % 2 ? 16 : -16), h.cy - 80], t, 800));
  ctx.label('ÇA CHAUFFE', h.cx - 10, h.cy + h.S + 28, 1300, 1200);
  ctx.label('PFFF', h.cx + h.S, h.cy, 2950, 500);
  snd(ctx, 550, 'fx-crackle'); snd(ctx, 2900, 'fx-whoosh');
}

/** L'éclair tombe deux fois, tout l'écran tressaille. */
function eclair(ctx) {
  const h = hero(ctx, 'eclair', 120);
  const { W } = ctx;
  const a = W * 0.26 - h.S / 2, b = W * 0.68 - h.S / 2, y = h.cy + 10;
  ctx.anim(h.o, [
    { transform: T(a, -h.S), opacity: 0, offset: 0 }, { transform: T(a, -h.S), opacity: 0, offset: 0.14 }, { transform: T(a, y), opacity: 1, offset: 0.17 }, { transform: T(a, y), opacity: 1, offset: 0.27 },
    { transform: T(a, y), opacity: 0, offset: 0.3 }, { transform: T(b, -h.S), opacity: 0, offset: 0.46 }, { transform: T(b, y + 30, 'scale(1.25)'), opacity: 1, offset: 0.49 }, { transform: T(b, y + 30, 'scale(1.25)'), opacity: 0.3, offset: 0.53 },
    { transform: T(b, y + 30, 'scale(1.25)'), opacity: 1, offset: 0.57 }, { transform: T(b, y + 30, 'scale(1.25)'), opacity: 1, offset: 0.7 }, { transform: T(b, y + 30, 'scale(1.25)'), opacity: 0, offset: 0.78 }, { transform: T(b, y + 30), opacity: 0, offset: 1 },
  ], { duration: 3000, easing: 'linear' });
  const flash = ctx.node('tfx-flashbg', '', W, ctx.H);
  ctx.anim(flash, [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.16 }, { opacity: 0.2, offset: 0.175 }, { opacity: 0, offset: 0.22 }, { opacity: 0, offset: 0.48 }, { opacity: 0.28, offset: 0.495 }, { opacity: 0, offset: 0.56 }, { opacity: 0, offset: 1 }], { duration: 3000 });
  ctx.label('CRAC', a + h.S - 10, y + 20, 520, 600); ctx.label('BOUM !', b - 80, y + 50, 1480, 800);
  [[a, y, 520], [b, y + 30, 1480]].forEach(([x, yy, t]) => [-1, 0, 1].forEach(k => pop(ctx, DOT, x + h.S / 2 + k * 30, yy + h.S + 4, 16, t + 20, 420, 45)));
  snd(ctx, 510, 'fx-zap'); snd(ctx, 1470, 'fx-zap'); snd(ctx, 1600, 'fx-rumble');
}

/** Les saynètes, par pictogramme (ours, cravate, carabine et planète : dans turnfx.js). */
export const PICTO_FX = Object.freeze({
  flechette, cible, viseur, arc, medaille, de, bille, pique, coeur, trefle, couronne,
  rocket, spoutnik, satellite, casque, antenne, lune, etoile,
  renard, loup, sanglier, cerf, belier, lievre, chat, hibou, aigle, corbeau, poisson, tortue,
  chope, verre, ancre, boussole, montagne, flamme, eclair,
});
