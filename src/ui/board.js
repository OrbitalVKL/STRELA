// Strela — dessin de la cible (SVG) aux couleurs d'une cible réglementaire (lot 1.2) : simples noir / crème,
// doubles et triples rouge / vert, 25 vert, 50 rouge, couronne noire et numéros blancs, fils métalliques fins.
// La cible est un objet physique : mêmes couleurs en sombre et en clair (jetons --board-* de theme.css).
// Géométrie et couleur de chaque zone : src/engine/board.js (rayon 1 = bord du double, anneaux élargis).
// Sert partout : petite cible du jeu (portrait), cible agrandie, saisie en paysage (et sa loupe), historique,
// fins de manche, carte des segments des stats (mode « chaleur »).
import { SECTORS, RINGS, OFF_R, polar, impactPoint, zoneTone } from '../engine/board.js';

// Le dessin est à l'échelle K (rayon du double = 100) : évite les polices de moins de 1 px dans le SVG.
const K = 100;
const f = n => (n * K).toFixed(2).replace(/\.?0+$/, '');
/** Coordonnée du repère (rayon 1 = bord du double) dans l'échelle du dessin (lot 8 : tracés ajoutés par-dessus). */
export const svgN = f;
const pt = (a, r) => polar(a, r).map(f).join(' ');

/** Chemin d'un secteur d'anneau entre les rayons r0 et r1, les angles a0 et a1 (degrés, 0 = haut, sens horaire). */
function sector(r0, r1, a0, a1) {
  return `M${pt(a0, r0)}L${pt(a0, r1)}A${f(r1)} ${f(r1)} 0 0 1 ${pt(a1, r1)}L${pt(a1, r0)}A${f(r0)} ${f(r0)} 0 0 0 ${pt(a0, r0)}Z`;
}

/** Les 82 zones de la cible : { key ('T20', '5', 'D16', '25', '50'), d (chemin) | r (cercle), tone }. */
function zones() {
  const out = [];
  SECTORS.forEach((s, i) => {
    const a0 = i * 18 - 9, a1 = i * 18 + 9;
    // ring (lot 8) : 'i' simple intérieur, 'o' simple extérieur (même clé de zone, la carte de l'entraînement les sépare)
    out.push({ key: `${s}`, ring: 'i', s, z: 'si', tone: zoneTone(s, 1), d: sector(RINGS.outerBull, RINGS.tripleIn, a0, a1) });
    out.push({ key: `T${s}`, ring: '', s, z: 't', tone: zoneTone(s, 3), d: sector(RINGS.tripleIn, RINGS.tripleOut, a0, a1) });
    out.push({ key: `${s}`, ring: 'o', s, z: 'se', tone: zoneTone(s, 1), d: sector(RINGS.tripleOut, RINGS.doubleIn, a0, a1) });
    out.push({ key: `D${s}`, ring: '', s, z: 'd', tone: zoneTone(s, 2), d: sector(RINGS.doubleIn, RINGS.doubleOut, a0, a1) });
  });
  out.push({ key: '25', ring: '', s: 25, z: 's', tone: zoneTone(25, 1), r: RINGS.outerBull });
  out.push({ key: '50', ring: '', s: 25, z: 'd', tone: zoneTone(25, 2), r: RINGS.bull });
  return out;
}
const ZONES = zones();

const shape = (z, attrs) => (z.d ? `<path d="${z.d}" ${attrs}/>` : `<circle r="${f(z.r)}" ${attrs}/>`);

function numbers(r) {
  return SECTORS.map((s, i) => {
    const [x, y] = polar(i * 18, r);
    return `<text x="${f(x)}" y="${f(y)}" dy="0.36em" text-anchor="middle">${s}</text>`;
  }).join('');
}

/** Rayons des marques d'impact, en px affichés : volée en cours (pleine, numérotée) et volées précédentes. */
export const MARK = Object.freeze({ small: 7, big: 9.5, old: 4.5 });

/**
 * Marque d'impact (centre x, y dans le repère ; r en unités). Lot 8 du 23/11 (1.5) : petit disque rouge Strela (--red)
 * semi-transparent, fin contour clair, numéro clair ; les numéros des secteurs sont dessinés par-dessus (jamais masqués).
 */
function mark(x, y, r, n) {
  const ring = Math.max(r * 0.12, 0.005);
  return `<g class="imp"><circle class="imp-o" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/><circle class="imp-i" cx="${f(x)}" cy="${f(y)}" r="${f(r - ring)}"/>`
    + (n ? `<text x="${f(x)}" y="${f(y)}" dy="0.36em" text-anchor="middle" style="font-size:${f(r * 1.2)}px">${n}</text>` : '') + '</g>';
}

/**
 * Marques trop proches (deux fléchettes dans la même zone) : écartées juste assez pour que chaque numéro reste
 * lisible ; la suivante glisse à côté de la précédente (sur le côté si elles sont au même point).
 */
function spread(marks, R) {
  const out = marks.map(m => ({ ...m, p: [...m.p] }));
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 1; j < out.length; j++) {
      for (let i = 0; i < j; i++) {
        const dx = out[j].p[0] - out[i].p[0], dy = out[j].p[1] - out[i].p[1];
        const d = Math.hypot(dx, dy), need = 2 * R * 1.02;
        if (d >= need) continue;
        const [ux, uy] = d > 1e-6 ? [dx / d, dy / d] : [1, 0];
        out[j].p = [out[i].p[0] + ux * need, out[i].p[1] + uy * need];
      }
    }
  }
  return out;
}

/**
 * Cible SVG.
 *   size     : taille d'affichage approximative en px (règle la taille des marques d'impact et des fils)
 *   labels   : couronne des numéros (par défaut si size ≥ 150)
 *   impacts  : [{ dart, n? (1, 2, 3 : volée en cours, numérotée), old? (volées précédentes, discret) }]
 *   heat     : (key) → 0..1 (carte des segments : plus une zone est claire, plus elle a été touchée) ; act : data-act
 *   cls, id, label (texte pour les lecteurs d'écran), selected : clé de zone entourée
 *   counts   : lot 7.8 — (secteur 1…20 | 25) → nombre d'impacts, écrit sur chaque secteur (simple extérieur) et au centre
 *   aim      : lot 8 — cible visée { s, z } (engine/training.js), entourée ; extra : SVG ajouté par-dessus (échelle K)
 *   heat     : reçoit aussi l'anneau ('i' / 'o' pour les simples) en second argument (lot 8)
 */
export function boardSvg({ size = 300, labels = size >= 150, impacts = [], heat = null, act = null, cls = '', id = '', label = 'Cible', selected = null, counts = null, aim = null, extra = '', margin = null } = {}) {
  // Lot 8 du 23/11 (1.2) : `margin` (saisie au doigt de l'entraînement) montre la zone autour de la cible où l'on pose un
  // hors cible (jusqu'à OFF_R) ; d'office quand un impact est posé au-delà du dessin.
  const wide = margin ?? (labels && impacts.some(i => { const p = impactPoint(i.dart); return p && Math.hypot(p[0], p[1]) > RINGS.edge; }));
  const edge = wide ? OFF_R : labels ? RINGS.edge : RINGS.doubleOut + 0.04;
  const vb = `${f(-edge)} ${f(-edge)} ${f(2 * edge)} ${f(2 * edge)}`;
  const unit = (2 * edge) / size; // unités du repère par px affiché
  const parts = wide ? [`<circle class="offz" r="${f(OFF_R)}"/>`, `<circle class="ring" r="${f(RINGS.edge)}"/>`] : [`<circle class="ring" r="${f(edge)}"/>`];
  for (const z of ZONES) parts.push(shape(z, `class="z z-${z.tone}"`));
  if (heat) {
    // Carte des segments : la cible est assombrie, chaque zone s'éclaire d'autant plus qu'elle a été touchée.
    parts.push(`<circle class="veil" r="${f(RINGS.doubleOut)}"/>`);
    for (const z of ZONES) {
      const arg = act ? ` data-act="${act}" data-arg="${z.key}"` : '';
      parts.push(shape(z, `class="heat" style="fill-opacity:${(0.92 * heat(z.key, z.ring)).toFixed(3)}"${arg}`));
    }
    for (const z of ZONES) if (z.key === selected) parts.push(shape(z, 'class="sel"'));
  }
  if (aim) {
    // Cible visée : chaque zone qui compte, entourée d'un trait clair doublé de sombre (lisible sur les 4 couleurs).
    const inAim = z => z.s === aim.s && (aim.z === 'any' || aim.z === z.z || (aim.z === 's' && (z.z === 'si' || z.z === 'se')));
    const sel = ZONES.filter(inAim);
    parts.push(`<g class="aim">${sel.map(z => shape(z, 'class="aim-o"')).join('')}${sel.map(z => shape(z, 'class="aim-i"')).join('')}</g>`);
  }
  if (counts) {
    // Nombre d'impacts de chaque secteur sur une plaquette sombre, au milieu du simple extérieur ; bull au centre.
    const r = (RINGS.tripleOut + RINGS.doubleIn) / 2;
    const plate = (x, y, n) => {
      const w = 0.05 + 0.047 * String(n).length;
      return `<rect x="${f(x - w / 2)}" y="${f(y - 0.055)}" width="${f(w)}" height="${f(0.11)}"/><text x="${f(x)}" y="${f(y)}" dy="0.36em" text-anchor="middle">${n}</text>`;
    };
    const cells = SECTORS.map((sct, i) => { const n = counts(sct); if (!n) return ''; const [x, y] = polar(i * 18, r); return plate(x, y, n); });
    const nb = counts(25);
    parts.push(`<g class="cnt" style="font-size:${f(0.082)}px" aria-hidden="true">${cells.join('')}${nb ? plate(0, 0, nb) : ''}</g>`);
  }
  // Impacts : d'abord les anciens (discrets), puis la volée en cours, numérotée.
  const old = impacts.filter(i => i.old), cur = impacts.filter(i => !i.old);
  for (const i of old) {
    const p = impactPoint(i.dart);
    if (p) parts.push(`<circle class="imp-old" cx="${f(p[0])}" cy="${f(p[1])}" r="${f(MARK.old * unit)}"/>`);
  }
  const R = (size < 150 ? MARK.small : MARK.big) * unit;
  for (const m of spread(cur.map(i => ({ p: impactPoint(i.dart), n: i.n })).filter(m => m.p), R)) parts.push(mark(m.p[0], m.p[1], R, m.n));
  // Numéros des secteurs au premier plan (lot 8 du 23/11, 1.5) : une marque posée sur la couronne ne les cache plus.
  if (labels) parts.push(`<g class="num" style="font-size:${f(0.115)}px">${numbers(RINGS.labels)}</g>`);
  if (extra) parts.push(extra);
  return `<svg class="tgt${size < 150 ? ' sm' : ''} ${cls}"${id ? ` id="${id}"` : ''} viewBox="${vb}" role="img" aria-label="${label}">${parts.join('')}</svg>`;
}

/** Cible nue (sans impacts), pour la loupe de saisie ; `margin` : avec la zone autour (hors cible posé, entraînement). */
export const plainBoard = (margin = false) => boardSvg({ size: 400, labels: true, label: 'Loupe', margin });

/** Légende des marques (pastilles SVG) : `full` = volée en cours, sinon volées précédentes. */
export function markIcon(full = true) {
  return full
    ? '<svg class="mk" viewBox="-12 -12 24 24" aria-hidden="true"><g class="imp"><circle class="imp-o" r="11"/><circle class="imp-i" r="9"/><text dy="0.36em" text-anchor="middle" style="font-size:14px">1</text></g></svg>'
    : '<svg class="mk" viewBox="-12 -12 24 24" aria-hidden="true"><circle class="imp-old" r="5"/></svg>';
}

/**
 * Impacts à montrer pour un joueur dans une manche : volée choisie numérotée 1, 2, 3 et, si `previous`, ses volées
 * précédentes de la manche en discret. `game` = { darts[] } (positions réelles en `pos`), `state` = état X01.
 *   visitIdx : rang de la volée dans state.visits, ou 'open' pour la volée en cours.
 * La petite cible du jeu ne montre que la volée en cours (`previous: false`) : elle se vide à chaque volée.
 */
export function impactsFor(game, state, visitIdx, { previous = true } = {}) {
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
  if (previous) {
    state.visits.forEach((v, j) => {
      if (j >= idx || v.player !== visit.player || v.leg !== leg) return;
      v.darts.forEach((_, n) => out.push({ dart: realDarts(starts[j] + n), old: true }));
    });
  }
  visit.darts.forEach((_, n) => out.push({ dart: realDarts(start + n), n: n + 1 }));
  return out;
}
