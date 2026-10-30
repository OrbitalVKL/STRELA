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
