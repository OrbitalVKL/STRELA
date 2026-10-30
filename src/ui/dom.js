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
  up: '<path d="M5 15L12 8L19 15"/>',
  down: '<path d="M5 9L12 16L19 9"/>',
  close: '<path d="M5 5L19 19M19 5L5 19"/>',
  theme: '<path d="M4 4H20V20H4Z"/><path d="M12 4V20" /><path d="M12 4H20V20H12Z" fill="currentColor"/>',
  menu: '<path d="M4 6H20M4 12H20M4 18H20"/>',
  camera: '<path d="M3 7H8L10 4H14L16 7H21V20H3Z"/><path d="M9 13.5A3 3 0 1 0 15 13.5A3 3 0 1 0 9 13.5"/>',
  image: '<path d="M3 4H21V20H3Z"/><path d="M3 16L9 11L14 16L17 13L21 17"/><path d="M15 8H17V10H15Z"/>',
  target: '<path d="M12 3A9 9 0 1 0 12.01 3M12 8A4 4 0 1 0 12.01 8"/>',
  play: '<path d="M7 4L19 12L7 20Z"/>',
};
export const ico = (name, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[name] || ''}</svg>`;

/** Barre du haut : retour (lien), titre, action facultative (HTML). */
export function topBar(title, backHref = '#/', action = '') {
  const back = backHref === null ? '' : `<a class="back" href="${backHref}" aria-label="Retour">${ico('back')}</a>`;
  return `<header class="top">${back}<h1><span>${esc(title)}</span></h1>${action}${store.maquette ? maquetteButtons() : ''}</header>`;
}

/** Maquette (?maquette) : bascule du thème et retour au sommaire, présents sur tous les écrans. */
export function maquetteButtons(cls = 'act mq') {
  return `<button type="button" class="${cls}" data-act="flip-theme" aria-label="Basculer le thème">${ico('theme')}</button>`
    + `<a class="${cls}" href="#/sommaire" aria-label="Sommaire de maquette">${ico('menu')}</a>`;
}
