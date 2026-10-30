// Strela — palette de la DA « console Soyuz » (reprise de Grafit), en sombre et en clair.
// Source de vérité des couleurs : assets/theme.css doit reprendre exactement ces valeurs
// (vérifié par tests/theme.test.js). Atténué = 62 % du texte mélangé au fond, discret = 30 %.

const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const rgb = h => h.replace('#', '').match(/../g).map(x => parseInt(x, 16));

/** Mélange `a` × couleur + (1 − a) × fond, composante par composante, arrondi (comme Grafit). */
export const mix = (color, a, bg) => hex(rgb(color).map((v, i) => Math.round(v * a + rgb(bg)[i] * (1 - a))));

const build = ({ bg, fg, redText, invFg, invBg }) => Object.freeze({
  bg,
  fg,
  dim: mix(fg, 0.62, bg),
  faint: mix(fg, 0.30, bg),
  red: '#9E4A4A',
  redText,
  redInk: '#F6ECEC', // texte sur aplat rouge (bandeau BUST)
  invFg,
  invBg,
});

export const THEMES = Object.freeze({
  dark: build({ bg: '#0A0C0E', fg: '#CFD2D4', redText: '#C26A6A', invFg: '#0C0F12', invBg: '#CFD2D4' }),
  // Clair : #C26A6A sur #ECEDEE n'offre que 3,2:1 ; le texte rouge prend le rouge de base (5,1:1).
  light: build({ bg: '#ECEDEE', fg: '#14171A', redText: '#9E4A4A', invFg: '#ECEDEE', invBg: '#14171A' }),
});

// Fonds d'avatar : 8 couleurs sourdes, identiques en sombre et en clair (l'avatar est une identité),
// pictogramme ou initiales en AVATAR_INK par-dessus. Jetons --av-0 … --av-7 et --av-ink de theme.css.
// Lot 1.2 : retouchées pour que deux couleurs ne se confondent jamais (écart CIEDE2000 d'au moins 20 entre deux
// fonds, contre 6,4 avant pour ardoise / graphite et 9,3 pour sapin / pétrole) ; ordre : ardoise, sapin, olive,
// ocre, brique, prune, pétrole, graphite.
export const AVATAR_COLORS = Object.freeze(['#234870', '#3F7352', '#464415', '#8B6135', '#6D312C', '#57385E', '#0D7281', '#69686B']);
export const AVATAR_INK = '#ECEDEE';

// Cible (lot 1.2) : couleurs d'une cible réglementaire, légèrement désaturées mais franchement rouge et vert.
// La cible est un objet physique : mêmes couleurs en sombre et en clair (jetons --board-* de theme.css).
//   simples : noir (secteur du 20 et un sur deux) / crème ; doubles et triples : rouge sur les noirs, vert sur les
//   crème ; 25 vert, 50 rouge ; couronne noire et numéros blancs ; fils métalliques entre les zones ;
//   marques d'impact claires cerclées de sombre (lisibles sur toutes les couleurs).
export const BOARD_COLORS = Object.freeze({
  black: '#1E2022',
  cream: '#E4D9BC',
  red: '#B0443D',
  green: '#2F7D50',
  ring: '#151719',
  num: '#F2F0EA',
  wire: '#A2A7AC',
  mark: '#FAF8F2',
  'mark-ink': '#0E1012',
});

// Mode nuit (option du thème sombre, comme Grafit) : calque « multiply » de cette couleur sur tout l'écran.
export const NIGHT_FILTER = '#B21400';

export const THEME_CHOICES = Object.freeze(['auto', 'dark', 'light']); // Auto par défaut
export const THEME_LABELS = Object.freeze({ auto: 'AUTO', dark: 'SOMBRE', light: 'CLAIR' });

/** Rapport de contraste WCAG entre deux couleurs '#RRGGBB'. */
export function contrast(a, b) {
  const lum = h => {
    const [r, g, bl] = rgb(h).map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ------------------------------------------------------------------ écart de couleur (CIEDE2000)
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** Couleur '#RRGGBB' en CIELAB (D65). */
export function toLab(h) {
  const [r, g, b] = rgb(h).map(lin);
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Écart perçu entre deux couleurs (CIEDE2000) : sous 10, deux fonds se confondent de loin. */
export function deltaE(c1, c2) {
  const [L1, a1, b1] = toLab(c1), [L2, a2, b2] = toLab(c2);
  const rad = Math.PI / 180;
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2);
  const h1 = (Math.atan2(b1, a1p) / rad + 360) % 360, h2 = (Math.atan2(b2, a2p) / rad + 360) % 360;
  let dh = C1 * C2 === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh * rad) / 2);
  const Lm = (L1 + L2) / 2, Cmp = (C1 + C2) / 2;
  let hm = h1 + h2;
  if (C1 * C2 !== 0) hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(2 * 30 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad) * 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
