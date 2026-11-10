// Strela — animations de tour (lot 7.4). Chaque joueur peut avoir une « animation de tour » (fiche joueur) jouée au
// début de chacune de ses volées : ours qui se balade, bonhomme en costume-cravate qui parle, carabine qui touche la
// cible, planète qui tourne dans les étoiles, étoile rouge qui brille ; « voyelles » = les voyelles de Tsia (vowels.js).
//
// Règles (choix de Guillaume) : à chaque volée ; par-dessus l'écran de jeu, dans un calque fixe hors de #app (#tfx) qui
// ne reçoit aucun appui (on lance pendant qu'elle se joue) ; arrêtée à la première fléchette de la volée ; jamais
// pendant une célébration (elle démarre quand on la ferme) ; une seule fois par volée (clé partie:rang de la volée) ;
// rien si le réglage Animations est sur NON ou si le téléphone demande moins d'animations.
// Mécanique : Web Animations API (element.animate) sur des pictogrammes SVG, jetons de couleur de theme.css seulement.
// Le rouge est réservé au bust en jeu : l'étoile rouge de Guillaume est l'exception demandée (même rouge, --red).
import { ICONS } from './avatars.js';
import { isTsia } from './vowels.js';
import { esc } from './dom.js';

/** Choix de la fiche joueur, dans l'ordre affiché. `icon` : pictogramme de la banque montré sur le bouton. */
export const TURN_ANIMS = Object.freeze([
  { key: 'aucune', label: 'AUCUNE', icon: null },
  { key: 'ours', label: 'OURS', icon: 'ours' },
  { key: 'cravate', label: 'CRAVATE', icon: 'cravate' },
  { key: 'carabine', label: 'CARABINE', icon: 'carabine' },
  { key: 'planete', label: 'PLANÈTE', icon: 'planete' },
  { key: 'etoile', label: 'ÉTOILE ROUGE', icon: 'etoile' },
  { key: 'voyelles', label: 'VOYELLES', icon: null },
]);
export const TURN_ANIM_KEYS = Object.freeze(TURN_ANIMS.map(a => a.key));

/** Animation de tour d'un joueur : son choix ; sans choix, « voyelles » pour Tsia (lot 7), sinon aucune. */
export function turnAnimOf(player) {
  const k = player && player.turnAnim;
  if (TURN_ANIM_KEYS.includes(k)) return k;
  return player && isTsia(player.name) ? 'voyelles' : 'aucune';
}

/** Une phrase du bonhomme en costume-cravate (humour beauf demandé par Guillaume). */
export const TIE_LINES = Object.freeze([
  'Alors, on n\'est pas bien là ?',
  'Bon, c\'est pas tout ça, mais y a la pétanque après.',
  'Tu veux que je te montre comment on fait, petit ?',
  'Moi, à ton âge, je mettais des cent quatre-vingts en tongs.',
  'Allez hop, on remet une petite tournée, c\'est moi qui régale !',
  'La fléchette, c\'est comme le barbecue : faut savoir allumer.',
  'Je lance comme je conduis : à l\'instinct.',
  'J\'ai pas mes lunettes, mais je le sens bien.',
  'C\'est du lourd, mon gars. Du très lourd.',
  'Elle est où la saucisse ? Y avait pas de saucisse ?',
  'Ça, c\'est mon côté artiste.',
  'Pastis à droite, fléchette à gauche. L\'équilibre.',
  'Faut viser avec le cœur, pas avec les yeux.',
  'Je suis comme le bon vin : je m\'améliore avec l\'apéro.',
  'Attention, ça va faire des étincelles. Reculez les enfants !',
  'Le triple vingt ? Je l\'ai inventé, le triple vingt.',
  'T\'inquiète, j\'ai fait un stage de team building.',
  'On rigole, on rigole, mais c\'est du sport de haut niveau.',
]);

/** Saynètes de l'ours (une tirée au sort à chaque volée). */
export const BEAR_SCENES = Object.freeze(['balade', 'renifle', 'gratte', 'dodo', 'attrape']);

/** Tirage sans répéter le précédent. */
function pick(list, last) {
  if (list.length < 2) return list[0];
  let x;
  do { x = list[Math.floor(Math.random() * list.length)]; } while (x === last);
  return x;
}

// ------------------------------------------------------------------ état : une animation à la fois
let played = null; // clé de la dernière volée animée (ou vue sans animation)
let running = null; // { nodes, anims, timers }
const lastPick = { ours: null, cravate: null };
/** Ce qui a été joué (lu par les tests) : { kind, scene?, line? }. */
export const turnFxLog = [];

/** Remet à zéro (tests, nouvelle partie). */
export function resetTurnFx() { stopTurnFx(true); played = null; }

/**
 * Après chaque rendu de l'écran de jeu (et à la fermeture d'une célébration). `info` : { key, kind, color, say } pour
 * une volée qui commence (aucune fléchette, pas de célébration), sinon null (l'animation en cours s'arrête).
 * Renvoie ce qui est joué ('ours'…) ou null.
 */
export function syncTurnFx(info, animate, deps = {}) {
  if (!info) { if (running) stopTurnFx(); return null; }
  if (info.key === played) return null;
  played = info.key;
  stopTurnFx(true);
  if (!animate || !PLAYERS[info.kind]) return null;
  const doc = deps.document || globalThis.document;
  if (!doc || !doc.body || typeof doc.body.animate !== 'function') return null;
  running = { nodes: [], anims: [], timers: [], preview: String(info.key).startsWith('apercu:') };
  const ctx = makeCtx(doc, info, running);
  const entry = { kind: info.kind };
  PLAYERS[info.kind](ctx, entry);
  turnFxLog.push(entry);
  if (turnFxLog.length > 30) turnFxLog.shift();
  // Filet de sécurité : tout est retiré à la fin, même sans événement d'animation (onglet en arrière-plan).
  const r = running;
  ctx.later(ctx.total + 200, () => { if (running === r) stopTurnFx(true); });
  return info.kind;
}

let previews = 0;
/** Aperçu depuis la fiche joueur (lot 7.4) : part de l'avatar de la fiche ; lot 7.5 : avec sons et voix (réglages). */
export function previewTurnFx(kind, color, { say = null, sound = null } = {}) {
  if (!PLAYERS[kind]) { stopTurnFx(true); return null; }
  return syncTurnFx({ key: `apercu:${++previews}`, kind, color: `var(--av-${Number.isInteger(color) ? color : 7})`, fromSel: '#app #preview .av', say, sound }, true);
}

/** Hors de l'écran de jeu : l'animation d'une volée s'arrête (l'aperçu de la fiche joueur continue). */
export function leaveGameFx() { if (running && !running.preview) stopTurnFx(true); }

/** Arrête l'animation en cours (fondu court, ou d'emblée avec `now`). */
export function stopTurnFx(now = false) {
  const r = running;
  if (!r) return;
  running = null;
  for (const t of r.timers) clearTimeout(t);
  const remove = () => { for (const a of r.anims) { try { a.cancel(); } catch (e) { /* déjà fini */ } } for (const n of r.nodes) n.remove(); };
  if (now) { remove(); return; }
  let left = r.nodes.length;
  if (!left) { remove(); return; }
  for (const n of r.nodes) {
    try {
      const a = n.animate([{ opacity: getComputedStyle(n).opacity }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      a.onfinish = () => { if (--left === 0) remove(); };
    } catch (e) { remove(); return; }
  }
  setTimeout(remove, 400);
}

/** Vrai pendant qu'une animation de tour se joue (tests). */
export const turnFxRunning = () => !!running;

// ------------------------------------------------------------------ outils de dessin
const SVG_ATTR = 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"';
// Pictogramme avec un liseré du fond autour (lisible sur la cible comme sur le fond de l'écran).
const haloed = (inner, vb = '0 0 48 48') => `<svg viewBox="${vb}" ${SVG_ATTR} aria-hidden="true"><g class="halo">${inner}</g><g>${inner}</g></svg>`;
const STAR4 = 'M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z';
const STAR5 = 'M24 4L29 18H44L32 27L36 42L24 33L12 42L16 27L4 18H19Z';
let uid = 0;

function layerOf(doc) {
  let el = doc.getElementById('tfx');
  if (!el) {
    el = doc.createElement('div');
    el.id = 'tfx';
    el.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(el);
  }
  return el;
}

function makeCtx(doc, info, run) {
  const win = doc.defaultView;
  const W = win.innerWidth, H = win.innerHeight;
  const layer = layerOf(doc);
  const rectOf = (sel, fb) => {
    const el = doc.querySelector(sel);
    const r = el && el.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? r : fb;
  };
  // Point de départ : l'avatar du bandeau ; cible : le centre de la cible de saisie (ou de la petite cible).
  const from = rectOf(info.fromSel || '#app .gband .av', { left: 16, top: 16, width: 56, height: 56 });
  const board = rectOf('#app #tboard svg', null) || rectOf('#app .mini-board svg', null);
  const target = board ? { x: board.left + board.width / 2, y: board.top + board.height / 2, r: board.width / 2 }
    : { x: W / 2, y: H * 0.55, r: Math.min(W, H) * 0.3 };
  const ctx = {
    doc, W, H, from, target, info, total: 0,
    /** Élément positionné en haut à gauche du calque (déplacé par transform). */
    node(cls, html, w, h) {
      const n = doc.createElement('div');
      n.className = `tfx-n ${cls}`;
      n.innerHTML = html;
      n.style.width = `${w}px`;
      if (h) n.style.height = `${h}px`;
      if (info.color) n.style.setProperty('--pc', info.color);
      layer.appendChild(n);
      run.nodes.push(n);
      return n;
    },
    anim(el, frames, opts) {
      const a = el.animate(frames, { fill: 'both', ...opts });
      run.anims.push(a);
      ctx.total = Math.max(ctx.total, (opts.delay || 0) + opts.duration * (Number.isFinite(opts.iterations) ? opts.iterations : 1));
      return a;
    },
    later(ms, fn) { run.timers.push(setTimeout(fn, ms)); },
    /** Une étiquette en lettres de la DA (texte sur le fond, filet), comme un tampon de console. */
    label(text, x, y, delay, duration = 900) {
      const n = ctx.node('tfx-lbl', esc(text), 'auto');
      n.style.width = '';
      ctx.anim(n, [
        { transform: `translate(${x}px, ${y}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${x}px, ${y - 6}px) scale(1)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${x}px, ${y - 10}px) scale(1)`, opacity: 1, offset: 0.8 },
        { transform: `translate(${x}px, ${y - 18}px) scale(1)`, opacity: 0 },
      ], { duration, delay, easing: 'ease-out' });
      return n;
    },
  };
  return ctx;
}

const T = (x, y, extra = '') => `translate(${Math.round(x)}px, ${Math.round(y)}px)${extra ? ` ${extra}` : ''}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ l'ours (Gilles)
function bear(ctx, entry) {
  const { W, H, from, target } = ctx;
  const S = 72;
  const scene = pick(BEAR_SCENES, lastPick.ours);
  lastPick.ours = scene;
  entry.scene = scene;
  const outer = ctx.node('tfx-bear', `<div class="tfx-in">${haloed(ICONS.ours[1])}</div>`, S, S);
  const inner = outer.firstChild;
  const ax = from.left + from.width / 2 - S / 2, ay = from.top + from.height / 2 - S / 2;
  const waddle = (delay, duration) => ctx.anim(inner, [
    { transform: 'rotate(-9deg) translateY(0)' }, { transform: 'rotate(0deg) translateY(-6px)' }, { transform: 'rotate(9deg) translateY(0)' },
    { transform: 'rotate(0deg) translateY(-6px)' }, { transform: 'rotate(-9deg) translateY(0)' },
  ], { duration: 520, delay, iterations: Math.max(1, Math.round(duration / 520)), fill: 'none' });
  const midY = clamp(H * 0.42, 90, H - S - 40);
  // Lot 7.5 : grognements et bruits de l'ours (si les sons sont sur OUI), calés sur la saynète.
  const sfx = (ms, k) => { if (typeof ctx.info.sound === 'function') ctx.later(ms, () => ctx.info.sound(k)); };
  ({
    balade: [[350, 'bear-growl'], [1500, 'bear-grunt'], [2500, 'bear-growl']],
    renifle: [[300, 'bear-grunt'], [1050, 'bear-sniff'], [1850, 'bear-grunt'], [2600, 'bear-growl']],
    gratte: [[300, 'bear-growl'], [1050, 'bear-scratch'], [1650, 'bear-scratch'], [2550, 'bear-grunt']],
    dodo: [[300, 'bear-grunt'], [1300, 'bear-snore'], [2950, 'bear-grunt']],
    attrape: [[650, 'bear-growl'], [1450, 'bear-chomp'], [2700, 'bear-grunt']],
  })[scene].forEach(([ms, k]) => sfx(ms, k));

  if (scene === 'balade') {
    ctx.anim(outer, [
      { transform: T(ax, ay, 'scale(0.6)') },
      { transform: T(ax + 20, midY - 40), offset: 0.12 },
      { transform: T(ax + 40, midY), offset: 0.2 },
      { transform: T(W * 0.5 - S / 2, midY + 14), offset: 0.6 },
      { transform: T(W + 20, midY - 10) },
    ], { duration: 3200, easing: 'linear' });
    waddle(500, 2700);
    ctx.label('PROMENADE', W * 0.5 - 50, midY - 34, 1300, 1100);
  } else if (scene === 'renifle') {
    const bx = clamp(target.x - S - 8, 4, W - S - 4), by = clamp(target.y - S / 2, 70, H - S - 20);
    ctx.anim(outer, [
      { transform: T(ax, ay, 'scale(0.6)') },
      { transform: T(bx, by), offset: 0.3 },
      { transform: T(bx + 6, by), offset: 0.72 },
      { transform: T(-S - 20, by + 30) },
    ], { duration: 3400, easing: 'ease-in-out' });
    waddle(0, 1000);
    ctx.anim(inner, [
      { transform: 'scale(1)' }, { transform: 'scale(1.1, 0.94) translateX(4px)' }, { transform: 'scale(1)' },
    ], { duration: 260, delay: 1050, iterations: 3, fill: 'none' });
    ctx.anim(inner, [
      { transform: 'rotate(0deg)' }, { transform: 'rotate(16deg) translateX(8px)' }, { transform: 'rotate(0deg)' },
    ], { duration: 280, delay: 1850, iterations: 2, fill: 'none' });
    ctx.label('SNIF SNIF', bx + S - 10, by - 18, 1000, 900);
    ctx.label('TOC TOC', bx + S - 4, by - 18, 1850, 700);
    waddle(2450, 950);
  } else if (scene === 'gratte') {
    const sx = W * 0.5 - S / 2, sy = midY;
    ctx.anim(outer, [
      { transform: T(ax, ay, 'scale(0.6)') },
      { transform: T(sx, sy), offset: 0.28 },
      { transform: T(sx, sy), offset: 0.74 },
      { transform: T(W + 20, sy + 20) },
    ], { duration: 3400, easing: 'ease-in-out' });
    waddle(0, 950);
    ctx.anim(inner, [
      { transform: 'scale(1, 1) translateY(0)' }, { transform: 'scale(1.06, 0.86) translateY(6px)', offset: 0.1 },
      { transform: 'scale(1.06, 0.86) translateY(6px) rotate(-5deg)', offset: 0.3 },
      { transform: 'scale(1.06, 0.86) translateY(6px) rotate(5deg)', offset: 0.5 },
      { transform: 'scale(1.06, 0.86) translateY(6px) rotate(-5deg)', offset: 0.7 },
      { transform: 'scale(1.06, 0.86) translateY(6px) rotate(5deg)', offset: 0.9 },
      { transform: 'scale(1, 1) translateY(0)' },
    ], { duration: 1500, delay: 960, fill: 'none' });
    ctx.label('GRAT GRAT', sx + S - 8, sy - 16, 1100, 1300);
    waddle(2520, 900);
  } else if (scene === 'dodo') {
    const dx = clamp(W * 0.68, 0, W - S - 10), dy = clamp(H * 0.5, 90, H - S - 40);
    ctx.anim(outer, [
      { transform: T(ax, ay, 'scale(0.6)') },
      { transform: T(dx, dy), offset: 0.26 },
      { transform: T(dx, dy), offset: 0.8 },
      { transform: T(W + 20, dy) },
    ], { duration: 3800, easing: 'ease-in-out' });
    waddle(0, 1000);
    ctx.anim(inner, [
      { transform: 'rotate(0deg) translateY(0)' }, { transform: 'rotate(-80deg) translateY(10px)', offset: 0.12 },
      { transform: 'rotate(-80deg) translateY(12px)', offset: 0.5 }, { transform: 'rotate(-80deg) translateY(10px)', offset: 0.85 },
      { transform: 'rotate(0deg) translateY(0)' },
    ], { duration: 2000, delay: 1000, fill: 'none' });
    ['Z', 'Z', 'Z'].forEach((z, i) => ctx.label(z, dx + S * 0.6 + i * 12, dy - 4 - i * 14, 1250 + i * 380, 900));
    ctx.label('ZZZ… HEIN ?', dx - 40, dy - 30, 2900, 700);
    waddle(3050, 750);
  } else {
    // attrape : une fléchette traverse l'écran, l'ours saute et la gobe au vol.
    const meetX = W * 0.5 - S / 2, meetY = clamp(H * 0.36, 80, H - S - 40);
    const D = 64;
    const dart = ctx.node('tfx-dart', haloed(ICONS.flechette[1]), D, D);
    ctx.anim(dart, [
      { transform: T(W + 10, meetY - 30, 'rotate(-135deg)'), opacity: 1 },
      { transform: T(meetX + S * 0.4, meetY + 4, 'rotate(-135deg)'), opacity: 1, offset: 0.96 },
      { transform: T(meetX + S * 0.3, meetY + 8, 'rotate(-135deg) scale(0.4)'), opacity: 0 },
    ], { duration: 900, delay: 500, easing: 'linear' });
    ctx.anim(outer, [
      { transform: T(ax, ay, 'scale(0.6)') },
      { transform: T(meetX - 30, meetY + 50), offset: 0.22 },
      { transform: T(meetX, meetY - 8), offset: 0.38 },
      { transform: T(meetX, meetY + 30), offset: 0.48 },
      { transform: T(meetX, meetY + 10), offset: 0.56 },
      { transform: T(meetX, meetY + 30), offset: 0.64 },
      { transform: T(meetX, meetY + 30), offset: 0.74 },
      { transform: T(-S - 20, meetY + 40) },
    ], { duration: 3600, easing: 'ease-in-out' });
    ctx.label('MIAM !', meetX + S - 6, meetY - 10, 1500, 1000);
    waddle(2700, 900);
  }
}

// ------------------------------------------------------------------ le bonhomme en costume-cravate (HPV)
// Grille 48 × 72 : tête carrée, col, veste à revers, cravate, bras (le droit ajuste la cravate), bouche qui parle.
const SUIT = {
  body: '<path d="M10 28H38L44 70H4Z"/><path d="M18 28L24 46L30 28" stroke-width="2.5"/><path d="M8 34L4 58M40 34L44 58" stroke-width="2.5"/>',
  tie: '<path d="M21.5 29H26.5L25.5 33H22.5Z" fill="currentColor" stroke="none"/><path d="M22.5 33L20.5 47L24 52L27.5 47L25.5 33" fill="currentColor" stroke-width="1.5"/>',
  head: '<rect x="15" y="4" width="18" height="18"/><path d="M19 11H22M26 11H29" stroke-width="3"/><path d="M15 8H33" stroke-width="2"/>',
  mouth: '<path d="M20 17H28" stroke-width="2.5"/>',
};

function suit(ctx, entry) {
  const { W, H, info } = ctx;
  const FW = 72, FH = 108;
  const line = pick(TIE_LINES, lastPick.cravate);
  lastPick.cravate = line;
  entry.line = line;
  const fig = ctx.node('tfx-suit', `<svg viewBox="0 0 48 72" ${SVG_ATTR} aria-hidden="true">
    <g class="halo">${SUIT.body}${SUIT.head}</g>
    <g>${SUIT.body}${SUIT.head}</g>
    <g class="tie">${SUIT.tie}</g>
    <g class="mouth">${SUIT.mouth}</g></svg>`, FW, FH);
  const fx = clamp(W * 0.06, 8, 40), fy = clamp(H * 0.3, 70, H - FH - 120);
  ctx.anim(fig, [
    { transform: T(-FW - 30, fy) }, { transform: T(fx, fy), offset: 0.14 },
    { transform: T(fx, fy), offset: 0.86 }, { transform: T(-FW - 30, fy) },
  ], { duration: 4200, easing: 'ease-in-out' });
  // Il ajuste sa cravate (petits à-coups), puis la bouche parle.
  const tie = fig.querySelector('.tie'), mouth = fig.querySelector('.mouth');
  ctx.anim(tie, [
    { transform: 'rotate(0deg)' }, { transform: 'rotate(-12deg) translateY(-1px)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(0deg)' },
  ], { duration: 520, delay: 650, iterations: 1, fill: 'none' });
  ctx.anim(mouth, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(3.2)' }, { transform: 'scaleY(1)' }],
    { duration: 220, delay: 1200, iterations: 10, fill: 'none' });
  const bx = fx + FW + 10;
  const bw = Math.min(280, W - bx - 12);
  const bub = ctx.node('tfx-bub', `<span>${esc(line)}</span>`, bw);
  ctx.anim(bub, [
    { transform: T(bx, fy + 2, 'scale(0.4)'), opacity: 0 }, { transform: T(bx, fy + 2), opacity: 1, offset: 0.08 },
    { transform: T(bx, fy + 2), opacity: 1, offset: 0.9 }, { transform: T(bx, fy + 2), opacity: 0 },
  ], { duration: 2900, delay: 1050, easing: 'ease-out' });
  // La voix de l'appli lit la réplique (si les annonces vocales sont sur OUI), voix d'homme (lot 7.5), après l'annonce
  // de la volée précédente (elle ne la coupe pas).
  if (typeof info.say === 'function') ctx.later(900, () => info.say(line, { style: 'homme' }));
}

// ------------------------------------------------------------------ la carabine (Patrick)
function rifle(ctx) {
  const { W, H, target, info } = ctx;
  const R = 128;
  const dir = target.x >= W / 2 - 1 ? 1 : -1; // vient du bord le plus loin de la cible
  const ml = dir > 0 ? [R * 46 / 48, R * 20 / 48] : [R * 2 / 48, R * 20 / 48]; // bouche du canon dans le dessin
  const mx = clamp(target.x - dir * Math.min(190, W * 0.44), 30, W - 30);
  const my = clamp(target.y - Math.min(110, target.r * 0.9), 70, H - 40);
  const ang = Math.atan2(target.y - my, target.x - mx) * 180 / Math.PI - (dir > 0 ? 0 : 180);
  const rx = mx - ml[0], ry = my - ml[1];
  const flip = dir > 0 ? '' : ' transform="translate(48 0) scale(-1 1)"';
  const gun = ctx.node('tfx-gun', `<svg viewBox="0 0 48 48" ${SVG_ATTR} aria-hidden="true"><g${flip}><g class="halo">${ICONS.carabine[1]}</g><g>${ICONS.carabine[1]}</g></g></svg>`, R, R);
  gun.style.transformOrigin = `${ml[0]}px ${ml[1]}px`;
  const back = dir * -14;
  const rad = ang * Math.PI / 180 + (dir > 0 ? 0 : Math.PI);
  const kx = Math.cos(rad) * back, ky = Math.sin(rad) * back;
  ctx.anim(gun, [
    { transform: T(rx - dir * 220, ry, 'rotate(0deg)') },
    { transform: T(rx, ry, `rotate(${ang}deg)`), offset: 0.2 },
    { transform: T(rx, ry, `rotate(${ang}deg)`), offset: 0.43 },
    { transform: T(rx + kx * dir, ry + ky * dir, `rotate(${ang - dir * 6}deg)`), offset: 0.46 },
    { transform: T(rx, ry, `rotate(${ang}deg)`), offset: 0.54 },
    { transform: T(rx, ry, `rotate(${ang}deg)`), offset: 0.7 },
    { transform: T(rx - dir * 240, ry + 20, 'rotate(0deg)') },
  ], { duration: 2800, easing: 'ease-in-out' });
  // Viseur qui se cale sur la cible.
  const V = Math.max(80, Math.min(140, target.r * 0.9));
  const sight = ctx.node('tfx-sight', haloed(ICONS.viseur[1]), V, V);
  ctx.anim(sight, [
    { transform: T(target.x - V / 2, target.y - V / 2, 'scale(2.2) rotate(90deg)'), opacity: 0 },
    { transform: T(target.x - V / 2, target.y - V / 2, 'scale(1) rotate(0deg)'), opacity: 1, offset: 0.5 },
    { transform: T(target.x - V / 2, target.y - V / 2, 'scale(1)'), opacity: 1, offset: 0.82 },
    { transform: T(target.x - V / 2, target.y - V / 2, 'scale(0.8)'), opacity: 0 },
  ], { duration: 1300, delay: 250, easing: 'ease-out' });
  // Coup de feu (1,2 s) : éclair à la bouche, balle, impact au centre.
  const SHOT = 1200;
  const flash = ctx.node('tfx-flash', `<svg viewBox="0 0 24 24" ${SVG_ATTR} aria-hidden="true"><path d="M12 2V7M12 17V22M2 12H7M17 12H22M5 5L8 8M16 16L19 19M5 19L8 16M16 8L19 5" stroke-width="2.5"/></svg>`, 36, 36);
  ctx.anim(flash, [
    { transform: T(mx - 18, my - 18, 'scale(0.4)'), opacity: 0 }, { transform: T(mx - 18, my - 18, 'scale(1.3)'), opacity: 1, offset: 0.3 },
    { transform: T(mx - 18, my - 18, 'scale(1.6)'), opacity: 0 },
  ], { duration: 220, delay: SHOT });
  const len = Math.hypot(target.x - mx, target.y - my);
  const bdeg = Math.atan2(target.y - my, target.x - mx) * 180 / Math.PI;
  const bullet = ctx.node('tfx-bullet', '', 14, 4);
  ctx.anim(bullet, [
    { transform: T(mx, my - 2, `rotate(${bdeg}deg)`), opacity: 1 },
    { transform: T(mx + (target.x - mx) * 0.98, my - 2 + (target.y - my) * 0.98, `rotate(${bdeg}deg)`), opacity: 1, offset: 0.98 },
    { transform: T(target.x, target.y - 2, `rotate(${bdeg}deg)`), opacity: 0 },
  ], { duration: clamp(len / 3, 60, 140), delay: SHOT + 20, easing: 'linear' });
  // Impact : trou sombre cerclé de clair, fêlures (couleurs de la cible, identiques dans les deux thèmes).
  const HOLE = 48;
  const CRACKS = 'M12 1L13 8M23 12L16 13M12 23L11 16M1 12L8 11M4 4L9 9M20 20L15 15M20 4L16 8';
  const hole = ctx.node('tfx-hole', `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${CRACKS}" stroke="var(--board-mark-ink)" stroke-width="3.5" fill="none"/><path d="${CRACKS}" stroke="var(--board-mark)" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="5" fill="var(--board-mark-ink)" stroke="var(--board-mark)" stroke-width="1.5"/></svg>`, HOLE, HOLE);
  const hx = target.x - HOLE / 2, hy = target.y - HOLE / 2;
  ctx.anim(hole, [
    { transform: T(hx, hy, 'scale(0)'), opacity: 1 }, { transform: T(hx, hy, 'scale(1.25)'), opacity: 1, offset: 0.06 },
    { transform: T(hx, hy, 'scale(1)'), opacity: 1, offset: 0.12 }, { transform: T(hx, hy, 'scale(1)'), opacity: 1, offset: 0.75 },
    { transform: T(hx, hy, 'scale(1)'), opacity: 0 },
  ], { duration: 1500, delay: SHOT + 140 });
  ctx.label('MOUCHE !', clamp(target.x - 40, 8, W - 110), target.y - V / 2 - 28, SHOT + 200, 1100);
  if (typeof info.sound === 'function') ctx.later(SHOT, () => info.sound('shot'));
}

// ------------------------------------------------------------------ la planète (Angelina)
function planet(ctx) {
  const { W, H, from } = ctx;
  const P = 104;
  const cx = W / 2, cy = clamp(H * 0.3, 110, H - 160);
  const ax = from.left + from.width / 2 - P / 2, ay = from.top + from.height / 2 - P / 2;
  // La planète fait deux tours d'orbite (ellipse) autour du centre de la scène, en se balançant un peu.
  const pl = ctx.node('tfx-planet', `<div class="tfx-in">${haloed(ICONS.planete[1])}</div>`, P, P);
  const RX = Math.min(W * 0.3, 150), RY = Math.min(H * 0.12, 60);
  const STEPS = 32, ORBIT = 2200, START = 600;
  const frames = [{ transform: T(ax, ay, 'scale(0.5)'), opacity: 0, offset: 0 }];
  for (let i = 0; i <= STEPS; i++) {
    const a = -Math.PI / 2 + (i / STEPS) * Math.PI * 4; // deux tours, départ en haut
    const k = Math.sin((i / STEPS) * Math.PI); // l'orbite s'ouvre puis se referme
    frames.push({
      transform: T(cx - P / 2 + Math.cos(a) * RX * k, cy - P / 2 + Math.sin(a) * RY * k, `scale(${(1 + Math.sin(a) * 0.12 * k).toFixed(3)})`),
      opacity: 1, offset: (START + (i / STEPS) * ORBIT) / 3400,
    });
  }
  frames.push({ transform: T(ax, ay, 'scale(0.5)'), opacity: 0, offset: 1 });
  ctx.anim(pl, frames, { duration: 3400, easing: 'linear' });
  ctx.anim(pl.firstChild, [{ transform: 'rotate(-14deg)' }, { transform: 'rotate(14deg)' }, { transform: 'rotate(-14deg)' }],
    { duration: 1100, delay: START, iterations: 2, easing: 'ease-in-out', fill: 'none' });
  // Lot 7.5 : son d'orbite (glissando qui chevrote), tintements des étoiles, souffle de l'étoile filante.
  if (typeof ctx.info.sound === 'function') {
    [[START, 'planet-orbit'], [900, 'planet-twinkle'], [1550, 'planet-twinkle'], [2150, 'planet-shoot']]
      .forEach(([ms, k]) => ctx.later(ms, () => ctx.info.sound(k)));
  }
  // Étoiles qui scintillent autour.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
    const d = Math.min(W * 0.3, 150) + 20 + Math.random() * 60;
    const s = 16 + Math.random() * 16;
    const x = clamp(cx + Math.cos(a) * d - s / 2, 4, W - s - 4), y = clamp(cy + Math.sin(a) * d * 0.8 - s / 2, 60, H - s - 4);
    const st = ctx.node('tfx-star', `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR4}" fill="var(--bg)" stroke="var(--bg)" stroke-width="3"/><path d="${STAR4}" fill="currentColor"/></svg>`, s, s);
    ctx.anim(st, [
      { transform: T(x, y, 'scale(0) rotate(0deg)'), opacity: 0 }, { transform: T(x, y, 'scale(1) rotate(45deg)'), opacity: 1, offset: 0.4 },
      { transform: T(x, y, 'scale(0) rotate(90deg)'), opacity: 0 },
    ], { duration: 650 + Math.random() * 300, delay: 450 + i * 190, iterations: 2, easing: 'ease-in-out' });
  }
  // Étoile filante pour finir.
  const SF = 120;
  const shoot = ctx.node('tfx-shoot', `<svg viewBox="0 0 120 24" aria-hidden="true"><path d="M0 12H96" stroke="currentColor" stroke-width="2" stroke-dasharray="4 5"/><path d="M96 12H104" stroke="currentColor" stroke-width="3"/><g transform="translate(98 2) scale(0.85)"><path d="${STAR4}" fill="currentColor"/></g></svg>`, SF, 24);
  const sx0 = W + 20, sy0 = clamp(cy - 120, 20, H), sx1 = W * 0.1 - SF, sy1 = cy + 90;
  const sdeg = Math.atan2(sy1 - sy0, sx1 - sx0) * 180 / Math.PI + 180;
  shoot.style.transformOrigin = '100% 50%';
  ctx.anim(shoot, [
    { transform: T(sx0 - SF, sy0, `rotate(${sdeg}deg)`), opacity: 0 }, { transform: T(sx0 - SF - 40, sy0 + 12, `rotate(${sdeg}deg)`), opacity: 1, offset: 0.1 },
    { transform: T(sx1, sy1, `rotate(${sdeg}deg)`), opacity: 0 },
  ], { duration: 750, delay: 2150, easing: 'ease-in' });
}

// ------------------------------------------------------------------ l'étoile rouge (Guillaume)
function redStar(ctx) {
  const { W, H, from } = ctx;
  const S = 128;
  const cx = W / 2, cy = clamp(H * 0.3, 110, H - 160);
  const ax = from.left + from.width / 2 - S / 2, ay = from.top + from.height / 2 - S / 2;
  const id = `tfxclip${++uid}`;
  // Branches de l'étoile : un éclat part de chaque pointe.
  const tips = [[24, 4], [44, 18], [36, 42], [12, 42], [4, 18]];
  const sparks = tips.map(([x, y]) => {
    const dx = x - 24, dy = y - 24.5, n = Math.hypot(dx, dy);
    return `<path class="spk" d="M${x + dx / n * 3} ${y + dy / n * 3}L${x + dx / n * 9} ${y + dy / n * 9}" stroke="var(--red-text)" stroke-width="2"/>`;
  }).join('');
  const star = ctx.node('tfx-red', `<svg viewBox="-8 -8 64 64" fill="none" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="${STAR5}"/></clipPath></defs>
    <path class="pulse p1" d="${STAR5}" stroke="var(--red)" stroke-width="2"/>
    <path class="pulse p2" d="${STAR5}" stroke="var(--red)" stroke-width="2"/>
    <path d="${STAR5}" fill="var(--bg)" stroke="var(--bg)" stroke-width="7"/>
    <path d="${STAR5}" fill="var(--red)" stroke="var(--red)" stroke-width="2"/>
    <path class="lamp" d="${STAR5}" fill="var(--red-text)" stroke="var(--red-text)" stroke-width="2"/>
    <g clip-path="url(#${id})"><path class="glint" d="M-6 48L10 0H18L2 48Z" fill="var(--red-ink)" opacity="0.55"/></g>
    <g class="spks">${sparks}</g></svg>`, S, S);
  ctx.anim(star, [
    { transform: T(ax, ay, 'scale(0.45) rotate(-72deg)'), opacity: 0 }, { transform: T(cx - S / 2, cy - S / 2, 'scale(1) rotate(0deg)'), opacity: 1, offset: 0.16 },
    { transform: T(cx - S / 2, cy - S / 2, 'scale(1)'), opacity: 1, offset: 0.84 }, { transform: T(ax, ay, 'scale(0.45) rotate(72deg)'), opacity: 0 },
  ], { duration: 3300, easing: 'ease-in-out' });
  // Le voyant s'allume : la teinte claire monte et redescend trois fois ; halos qui s'élargissent ; reflet qui passe.
  ctx.anim(star.querySelector('.lamp'), [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.15 }],
    { duration: 600, delay: 520, iterations: 3, easing: 'ease-in-out' });
  for (const [sel, delay] of [['.p1', 550], ['.p2', 850]]) {
    ctx.anim(star.querySelector(sel), [{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(1.7)', opacity: 0 }],
      { duration: 900, delay, iterations: 2, easing: 'ease-out' });
  }
  ctx.anim(star.querySelector('.glint'), [{ transform: 'translateX(-10px)' }, { transform: 'translateX(52px)' }],
    { duration: 650, delay: 1000, iterations: 2, easing: 'ease-in-out' });
  ctx.anim(star.querySelector('.spks'), [
    { transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.35)', opacity: 0 },
  ], { duration: 700, delay: 700, iterations: 3, easing: 'ease-out' });
}

const PLAYERS = { ours: bear, cravate: suit, carabine: rifle, planete: planet, etoile: redStar };
/** Animations jouées par ce module (« voyelles » est à part, dans vowels.js). */
export const FX_KINDS = Object.freeze(Object.keys(PLAYERS));
