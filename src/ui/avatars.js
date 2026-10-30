// Strela — avatars : banque de 24 pictogrammes originaux (dessinés pour Strela, DA « console Soyuz » :
// traits droits, angles vifs, monochromes), 8 fonds sourds, initiales par défaut.
// Grille 48 × 48, trait de 3 (lisible de 40 px à 96 px). Tout est en `currentColor`.
//
// Un avatar = { kind: 'icon' | 'initials' | 'photo', icon?: clé de ICONS, color: 0..7, photo?: URL }.

// Fonds : jetons --av-0 … --av-7 de assets/theme.css (mêmes valeurs que AVATAR_COLORS de theme.js).
export const AVATAR_COLOR_NAMES = Object.freeze(['ARDOISE', 'SAPIN', 'OLIVE', 'OCRE', 'BRIQUE', 'PRUNE', 'PÉTROLE', 'GRAPHITE']);

// Chaque pictogramme : [nom affiché, contenu SVG]. `s` = trait, `f` = plein.
const P = (d, extra = '') => `<path d="${d}"${extra}/>`;
const F = d => `<path d="${d}" fill="currentColor" stroke="none"/>`;

export const ICONS = Object.freeze({
  flechette: ['FLÉCHETTE', `<g transform="rotate(-45 24 24)">${P('M36 24H46', ' stroke-width="2.5"')}${F('M24 20H37V28H24Z')}${P('M12 24H24', ' stroke-width="3"')}${F('M17 24L9 13H2L6 24L2 35H9Z')}</g>`],
  cible: ['CIBLE', `<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="10"/>${F('M21 21H27V27H21Z')}${P('M24 2V8M24 40V46M2 24H8M40 24H46', ' stroke-width="2"')}`],
  renard: ['RENARD', `${P('M8 7L18 17H30L40 7L41 24L24 41L7 24Z')}${P('M15 24H20M28 24H33')}${F('M21 33H27L24 37Z')}`],
  ours: ['OURS', `${P('M8 13V7H15M33 7H40V13')}${P('M14 10H34L41 17V33L34 40H14L7 33V17Z')}${P('M18 24V25M30 24V25', ' stroke-width="4"')}${P('M19 30H29V36H19Z')}${F('M22 30H26V33H22Z')}`],
  hibou: ['HIBOU', `${P('M9 7L17 13H31L39 7V31L24 42L9 31Z')}<circle cx="18" cy="22" r="4.5"/><circle cx="30" cy="22" r="4.5"/>${P('M21 29L24 34L27 29')}`],
  chat: ['CHAT', `${P('M9 7L18 15H30L39 7V31L32 40H16L9 31Z')}${P('M16 24L20 26M32 24L28 26')}${F('M22 30H26L24 33Z')}${P('M2 30H12M2 35L12 33M46 30H36M46 35L36 33', ' stroke-width="2"')}`],
  corbeau: ['CORBEAU', `${P('M4 19L13 15L19 9H29L37 15V25L44 40H30L22 32H14L19 22Z')}${F('M23 14H27V18H23Z')}${P('M4 19L15 21')}`],
  poisson: ['POISSON', `${P('M5 24L15 13H31L39 24L31 35H15Z')}${P('M39 24L46 15V33Z')}${F('M13 21H17V25H13Z')}${P('M24 15V33', ' stroke-width="2"')}`],
  cerf: ['CERF', `${P('M17 19L12 13V5M12 13L6 9M12 13L17 7M31 19L36 13V5M36 13L42 9M36 13L31 7')}${P('M15 19H33L31 33L24 43L17 33Z')}${P('M20 26V27M28 26V27', ' stroke-width="4"')}`],
  lievre: ['LIÈVRE', `${P('M15 21L12 3H19L21 19M33 21L36 3H29L27 19')}${P('M12 21H36L40 31L32 42H16L8 31Z')}${P('M18 29V30M30 29V30', ' stroke-width="4"')}${F('M22 34H26L24 37Z')}`],
  tortue: ['TORTUE', `${P('M24 10L36 17V31L24 38L12 31V17Z')}${P('M24 17L30 21V27L24 31L18 27V21Z', ' stroke-width="2"')}${P('M20 10L24 3L28 10M12 17L5 14M36 17L43 14M12 31L5 34M36 31L43 34M22 38L24 45L26 38')}`],
  rocket: ['FUSÉE', `${P('M24 3L31 13V33H17V13Z')}${P('M17 25L9 33V39H17M31 25L39 33V39H31')}${P('M21 39V45M27 39V45', ' stroke-width="2.5"')}${P('M21 18H27', ' stroke-width="2.5"')}`],
  spoutnik: ['SPOUTNIK', `<circle cx="18" cy="18" r="9"/>${P('M25 25L45 45M25 22L45 32M22 25L32 45', ' stroke-width="2"')}${P('M13 15L18 13', ' stroke-width="2"')}`],
  etoile: ['ÉTOILE', P('M24 4L29 18H44L32 27L36 42L24 33L12 42L16 27L4 18H19Z')],
  couronne: ['COURONNE', `${P('M6 14L15 25L24 10L33 25L42 14L38 36H10Z')}${P('M10 42H38')}`],
  eclair: ['ÉCLAIR', P('M28 3L10 27H23L19 45L38 19H25Z')],
  ancre: ['ANCRE', `${P('M24 12V42M16 18H32')}<rect x="20" y="4" width="8" height="8"/>${P('M7 28L7 33L24 42L41 33V28')}${P('M3 31L7 26L11 31M37 31L41 26L45 31', ' stroke-width="2.5"')}`],
  chope: ['CHOPE', `${P('M9 13H31V43H9Z')}${P('M31 19H39V35H31')}${P('M15 19V37M21 19V37M27 19V37', ' stroke-width="2"')}${P('M8 13L11 6H19L22 9L28 6L32 13')}`],
  de: ['DÉ', `<rect x="7" y="7" width="34" height="34"/>${F('M13 13H19V19H13ZM29 13H35V19H29ZM21 21H27V27H21ZM13 29H19V35H13ZM29 29H35V35H29Z')}`],
  boussole: ['BOUSSOLE', `${P('M24 3L29 19L45 24L29 29L24 45L19 29L3 24L19 19Z')}${F('M24 3L29 19L24 24L19 19Z')}${P('M12 12L17 17M36 12L31 17M12 36L17 31M36 36L31 31', ' stroke-width="2"')}`],
  montagne: ['MONTAGNE', `${P('M2 40L17 14L25 27L31 18L46 40Z')}${P('M12 23L17 26L21 21M27 24L31 26L34 22', ' stroke-width="2"')}`],
  flamme: ['FLAMME', `${P('M24 3L33 17L36 29L31 40L24 45L17 40L12 29L15 19L21 26Z')}${P('M24 26L28 33L24 39L20 33Z', ' stroke-width="2"')}`],
  planete: ['PLANÈTE', `<circle cx="24" cy="24" r="11"/>${P('M3 33L45 15', ' stroke-width="3"')}${F('M38 4H42V8H38ZM6 38H9V41H6Z')}`],
  pique: ['PIQUE', `${P('M24 4L40 22L35 31H28L24 26L20 31H13L8 22Z')}${P('M24 26L28 43H20Z')}`],
});

export const ICON_KEYS = Object.freeze(Object.keys(ICONS));

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Initiales d'un pseudo : 2 lettres (« Jean-Paul » → JP, « Karim » → KA). */
export function initials(name) {
  const words = String(name || '').trim().split(/[\s\-_.']+/).filter(Boolean);
  if (!words.length) return '?';
  const raw = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return raw.toLocaleUpperCase('fr-FR');
}

/** SVG d'un pictogramme seul (taille fixée par le CSS du conteneur). */
export function iconSvg(key) {
  const icon = ICONS[key];
  if (!icon) return '';
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${icon[1]}</svg>`;
}

/**
 * Avatar d'un joueur : carré, fond sourd, pictogramme ou initiales.
 * `size` en px (le CSS .av gère le reste), `extra` = classes supplémentaires.
 */
export function avatarHtml(player, size = 40, extra = '') {
  const av = (player && player.avatar) || {};
  const color = Number.isInteger(av.color) ? ((av.color % 8) + 8) % 8 : 7;
  const style = `--s:${size}px;background:var(--av-${color})`;
  let inner;
  if (av.kind === 'photo' && av.photo) inner = `<img src="${esc(av.photo)}" alt="">`;
  else if (av.kind === 'icon' && ICONS[av.icon]) inner = iconSvg(av.icon);
  else inner = `<b>${esc(initials(player && player.name))}</b>`;
  return `<span class="av ${extra}" style="${style}" aria-hidden="true">${inner}</span>`;
}
