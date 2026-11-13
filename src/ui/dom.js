// Strela — petites aides d'affichage communes aux écrans (texte échappé, nombres et dates en français,
// pictogrammes d'interface). Les écrans rendent du HTML en chaîne ; les actions passent par data-act.

import { store } from './store.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Moyenne : 55,3 ; « — » si rien. */
export const avg = v => (v === null || v === undefined || Number.isNaN(v) ? '—' : nf1.format(v));
/** Pourcentage arrondi : 32 % ; « — » si rien. */
export const pct = v => (v === null || v === undefined ? '—' : `${nf0.format(v * 100)} %`);
export const int = v => (v === null || v === undefined ? '—' : String(v));
export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

const DAYS = ['DIM.', 'LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.'];
const MONTHS = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Date courte d'une partie : « AUJ. 21:18 », « HIER 20:42 », « LUN. 27 OCT. 20:42 ». */
export function when(ms, now = Date.now()) {
  const d = new Date(ms);
  const day = x => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y.getTime(); };
  const diff = Math.round((day(now) - day(ms)) / 86400000);
  if (diff === 0) return `AUJ. ${hhmm(d)}`;
  if (diff === 1) return `HIER ${hhmm(d)}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${hhmm(d)}`;
}
export const shortDate = ms => { const d = new Date(ms); return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

export const OUT_LABEL = { single: 'SORTIE SIMPLE', double: 'SORTIE DOUBLE' };
export const OUT_SHORT = { single: 'SIMPLE', double: 'DOUBLE' };

/** Pictogrammes d'interface (trait 2, angles droits), 24 × 24. */
const I = {
  back: '<path d="M15 4L7 12L15 20"/>',
  chev: '<path d="M9 4L17 12L9 20"/>',
  pause: '<path d="M8 4V20M16 4V20" stroke-width="3"/>',
  undo: '<path d="M9 5L4 10L9 15"/><path d="M4 10H15C18 10 20 12.5 20 15.5S18 21 15 21H11"/>',
  players: '<path d="M3 21V17L7 14H11L15 17V21"/><path d="M6 6H12V12H6Z"/><path d="M15 7H19V11H15ZM17 14L21 16.5V21H18"/>',
  history: '<path d="M4 4H20V20H4Z"/><path d="M8 9H16M8 13H16M8 17H12"/>',
  stats: '<path d="M4 20H20"/><path d="M6 20V13H9V20M11 20V6H14V20M16 20V10H19V20"/>',
  settings: '<path d="M4 7H20M4 17H20"/><path d="M8 4V10H11V4ZM14 14V20H17V14Z"/>',
  plus: '<path d="M12 4V20M4 12H20"/>',
  minus: '<path d="M4 12H20"/>',
  glass: '<path d="M6 3H18L16.5 21H7.5Z"/><path d="M6.7 9H17.3"/>',
  pint: '<path d="M5 4H16V21H5Z"/><path d="M16 8H20V16H16"/><path d="M5 9H16"/>', // 0.8.2 : pinte (chope à anse)
  download: '<path d="M12 3V15M7 10L12 15L17 10"/><path d="M4 20H20"/>',
  up: '<path d="M5 15L12 8L19 15"/>',
  down: '<path d="M5 9L12 16L19 9"/>',
  close: '<path d="M5 5L19 19M19 5L5 19"/>',
  theme: '<path d="M4 4H20V20H4Z"/><path d="M12 4V20" /><path d="M12 4H20V20H12Z" fill="currentColor"/>',
  menu: '<path d="M4 6H20M4 12H20M4 18H20"/>',
  camera: '<path d="M3 7H8L10 4H14L16 7H21V20H3Z"/><path d="M9 13.5A3 3 0 1 0 15 13.5A3 3 0 1 0 9 13.5"/>',
  image: '<path d="M3 4H21V20H3Z"/><path d="M3 16L9 11L14 16L17 13L21 17"/><path d="M15 8H17V10H15Z"/>',
  target: '<path d="M12 3A9 9 0 1 0 12.01 3M12 8A4 4 0 1 0 12.01 8"/>',
  play: '<path d="M7 4L19 12L7 20Z"/>',
  check: '<path d="M4 12L10 18L20 6" stroke-width="3"/>',
  trash: '<path d="M4 6H20M9 6V3H15V6M6 6L7 21H17L18 6"/><path d="M10 10V17M14 10V17"/>',
  // Lot 7.8 (maquette)
  info: '<path d="M3 3H21V21H3Z"/><path d="M10.8 10H13.2V18H10.8ZM10.8 5.5H13.2V8H10.8Z" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M7 3H17V9C17 12 14.8 14 12 14S7 12 7 9Z"/><path d="M7 5H3V8C3 10 5 11 7 11M17 5H21V8C21 10 19 11 17 11"/><path d="M12 14V18M8 21H16V18H8Z"/>',
  news: '<path d="M12 2L14.2 9.8L22 12L14.2 14.2L12 22L9.8 14.2L2 12L9.8 9.8Z"/>',
  filter: '<path d="M3 4H21L14 12V20L10 18V12Z"/>',
  zoomin: '<path d="M10 3A7 7 0 1 0 10.01 3M15 15L21 21"/><path d="M7 10H13M10 7V13"/>',
  zoomout: '<path d="M10 3A7 7 0 1 0 10.01 3M15 15L21 21"/><path d="M7 10H13"/>',
  calendar: '<path d="M3 5H21V21H3Z"/><path d="M3 10H21M8 3V7M16 3V7"/>',
  data: '<path d="M4 5C4 3.5 20 3.5 20 5V19C20 20.5 4 20.5 4 19Z"/><path d="M4 5C4 6.5 20 6.5 20 5M4 12C4 13.5 20 13.5 20 12"/>',
  sound: '<path d="M3 9H7L12 4V20L7 15H3Z"/><path d="M16 8C17.5 9.5 17.5 14.5 16 16M19 5C22 8 22 16 19 19"/>',
  phone: '<path d="M6 2H18V22H6Z"/><path d="M10 18H14"/>',
  wrench: '<path d="M14 3A5 5 0 0 0 9.5 10L3 16.5L7.5 21L14 14.5A5 5 0 0 0 21 10L17.5 13.5L13 12L11.5 7.5L15 4Z"/>',
};
export const ico = (name, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[name] || ''}</svg>`;

/** Barre du haut : retour (lien), titre, action facultative (HTML). */
export function topBar(title, backHref = '#/', action = '') {
  const back = backHref === null ? '' : `<a class="back" href="${backHref}" aria-label="Retour">${ico('back')}</a>`;
  return `<header class="top" data-layer>${back}<h1><span>${esc(title)}</span></h1>${action}${store.maquette ? maquetteButtons() : ''}</header>`;
}

/** Maquette (?maquette) : bascule du thème et retour au sommaire, présents sur tous les écrans. */
export function maquetteButtons(cls = 'act mq') {
  return `<button type="button" class="${cls}" data-act="flip-theme" aria-label="Basculer le thème">${ico('theme')}</button>`
    + `<a class="${cls}" href="#/sommaire" aria-label="Sommaire de maquette">${ico('menu')}</a>`;
}
