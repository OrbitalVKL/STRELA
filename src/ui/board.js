// Strela — dessin de la cible (SVG, DA console : filets fins, segments sobres, double et triple en rouge sourd
// un secteur sur deux, numéros autour, 20 en haut). Géométrie : src/engine/board.js (rayon 1 = bord du double).
// Sert partout : petite cible du jeu (portrait), grande cible de saisie (paysage), détail de l'historique,
// fins de manche, carte des segments des stats (mode « chaleur »).
import { SECTORS, RINGS, polar, impactPoint } from '../engine/board.js';

// Le dessin est à l'échelle K (rayon du double = 100) : évite les polices de moins de 1 px dans le SVG.
const K = 100;
const f = n => (n * K).toFixed(2).replace(/\.?0+$/, '');
const pt = (a, r) => polar(a, r).map(f).join(' ');

/** Chemin d'un secteur d'anneau entre les rayons r0 et r1, les angles a0 et a1 (degrés, 0 = haut, sens horaire). */
function sector(r0, r1, a0, a1) {
  return `M${pt(a0, r0)}L${pt(a0, r1)}A${f(r1)} ${f(r1)} 0 0 1 ${pt(a1, r1)}L${pt(a1, r0)}A${f(r0)} ${f(r0)} 0 0 0 ${pt(a0, r0)}Z`;
}

/** Les 82 zones de la cible : { key ('T20', '5', 'D16', '25', '50'), path | circle, kind, odd, segment, ring }. */
function zones() {
  const out = [];
  SECTORS.forEach((s, i) => {
    const a0 = i * 18 - 9, a1 = i * 18 + 9, odd = i % 2 === 1;
    out.push({ key: `${s}`, ring: 0, kind: 'single', odd, segment: s, d: sector(RINGS.outerBull, RINGS.tripleIn, a0, a1) });
    out.push({ key: `T${s}`, ring: 2, kind: 'treble', odd, segment: s, d: sector(RINGS.tripleIn, RINGS.tripleOut, a0, a1) });
    out.push({ key: `${s}`, ring: 0, kind: 'single', odd, segment: s, d: sector(RINGS.tripleOut, RINGS.doubleIn, a0, a1) });
    out.push({ key: `D${s}`, ring: 1, kind: 'double', odd, segment: s, d: sector(RINGS.doubleIn, RINGS.doubleOut, a0, a1) });
  });
  out.push({ key: '25', ring: 0, kind: 'outer', odd: true, segment: 25, r: RINGS.outerBull });
  out.push({ key: '50', ring: 1, kind: 'bull', odd: false, segment: 25, r: RINGS.bull });
  return out;
}
const ZONES = zones();

const shape = (z, attrs) => (z.d ? `<path d="${z.d}" ${attrs}/>` : `<circle r="${f(z.r)}" ${attrs}/>`);

/** Classe de remplissage d'une zone : simples alternés fond / gris très léger, double et triple rouge / gris. */
const zoneClass = z => (z.kind === 'single' ? (z.odd ? 'z-s1' : 'z-s0')
  : z.kind === 'outer' ? 'z-m1' : z.kind === 'bull' ? 'z-m0' : z.odd ? 'z-m1' : 'z-m0');

function numbers(r) {
  return SECTORS.map((s, i) => {
    const [x, y] = polar(i * 18, r);
    return `<text x="${f(x)}" y="${f(y)}" dy="0.36em" text-anchor="middle">${s}</text>`;
  }).join('');
}

/**
 * Cible SVG.
 *   size     : taille d'affichage approximative en px (règle la taille des marques d'impact)
 *   labels   : numéros autour (par défaut si size ≥ 150)
 *   impacts  : [{ dart, n? (1, 2, 3 : volée en cours, numérotée), old? (volées précédentes, discret) }]
 *   heat     : (key, zone) → opacité 0..1 (carte des segments) ; act : data-act des zones (avec data-arg = clé)
 *   cls, id, label (texte pour les lecteurs d'écran), selected : clé de zone entourée
 */
export function boardSvg({ size = 300, labels = size >= 150, impacts = [], heat = null, act = null, cls = '', id = '', label = 'Cible', selected = null } = {}) {
  const edge = labels ? RINGS.edge : RINGS.doubleOut + 0.02;
  const vb = `${f(-edge)} ${f(-edge)} ${f(2 * edge)} ${f(2 * edge)}`;
  const unit = (2 * edge) / size; // unités du repère par px affiché
  const parts = [];
  for (const z of ZONES) {
    if (heat) {
      const arg = act ? ` data-act="${act}" data-arg="${z.key}"` : '';
      parts.push(shape(z, `class="z-heat${selected === z.key ? ' sel' : ''}" style="fill-opacity:${heat(z.key, z).toFixed(3)}"${arg}`));
    } else parts.push(shape(z, `class="${zoneClass(z)}"`));
  }
  parts.push(`<circle class="rim" r="${f(RINGS.doubleOut)}"/>`);
  if (labels) parts.push(`<g class="num" style="font-size:${f(0.115)}px">${numbers(RINGS.labels)}</g>`);
  // Impacts : d'abord les anciens (discrets), puis la volée en cours, numérotée.
  const old = impacts.filter(i => i.old), cur = impacts.filter(i => !i.old);
  for (const i of old) {
    const p = impactPoint(i.dart);
    if (!p) continue;
    const s = 7 * unit;
    parts.push(`<rect class="imp-old" x="${f(p[0] - s / 2)}" y="${f(p[1] - s / 2)}" width="${f(s)}" height="${f(s)}"/>`);
  }
  for (const i of cur) {
    const p = impactPoint(i.dart);
    if (!p) continue;
    const s = (size < 150 ? 13 : 18) * unit;
    parts.push(`<g class="imp"><rect x="${f(p[0] - s / 2)}" y="${f(p[1] - s / 2)}" width="${f(s)}" height="${f(s)}"/>`
      + (i.n ? `<text x="${f(p[0])}" y="${f(p[1])}" dy="0.37em" text-anchor="middle" style="font-size:${f(s * 0.78)}px">${i.n}</text>` : '') + '</g>');
  }
  return `<svg class="tgt ${cls}"${id ? ` id="${id}"` : ''} viewBox="${vb}" role="img" aria-label="${label}">${parts.join('')}</svg>`;
}

/** Cible nue (sans impacts), pour la loupe de saisie. */
export const plainBoard = () => boardSvg({ size: 400, labels: true, label: 'Loupe' });

/**
 * Impacts à montrer pour un joueur dans une manche : volée choisie numérotée 1, 2, 3, ses volées précédentes
 * de la manche en discret. `game` = { darts[] } (positions réelles en `pos`), `state` = état X01 recalculé.
 *   visitIdx : rang de la volée dans state.visits, ou 'open' pour la volée en cours.
 */
export function impactsFor(game, state, visitIdx) {
  const starts = [];
  let k = 0;
  for (const v of state.visits) { starts.push(k); k += v.darts.length; }
  const openStart = k;
  const realDarts = i => game.darts[i];
  let visit, start, idx;
  if (visitIdx === 'open') {
    visit = state.visit; start = openStart; idx = state.visits.length;
    if (!visit) return [];
  } else {
    visit = state.visits[visitIdx]; start = starts[visitIdx]; idx = visitIdx;
    if (!visit) return [];
  }
  const leg = visitIdx === 'open' ? state.legNumber : visit.leg;
  const out = [];
  state.visits.forEach((v, j) => {
    if (j >= idx || v.player !== visit.player || v.leg !== leg) return;
    v.darts.forEach((_, n) => out.push({ dart: realDarts(starts[j] + n), old: true }));
  });
  visit.darts.forEach((_, n) => out.push({ dart: realDarts(start + n), n: n + 1 }));
  return out;
}
