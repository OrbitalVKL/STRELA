// Strela — échelle des cartes de chaleur (lot 8 du 23/11/2026, 3.5) : réglage d'affichage `heatScale`, commun aux cartes
// de l'entraînement et de la soirée (et à la feuille KPI de l'entraînement). Couleurs : theme.js › HEAT_COLORS.
import { store } from './store.js';
import { HEAT_SCALES } from './theme.js';
import { boardSvg } from './board.js';
import { SECTORS } from '../engine/board.js';

/** Échelle choisie : 'clair' (plus clair = plus touché, comme avant), 'fonce' (l'inverse) ou 'couleur' (jaune → rouge). */
export const heatScale = () => (HEAT_SCALES.includes(store.settings.heatScale) ? store.settings.heatScale : 'clair');
/** Phrase de légende de l'échelle choisie. */
export const heatLegend = (s = heatScale()) => (s === 'fonce' ? 'plus la zone est foncée, plus elle a été touchée'
  : s === 'couleur' ? 'du jaune pâle (peu touchée) au rouge (très touchée)' : 'plus la zone est claire, plus elle a été touchée')
  + ' ; une zone jamais touchée reste grise et tramée';

/** Aperçu en direct (Réglages) : une carte fictive, dense autour du 20, des zones jamais touchées, des chiffres. */
export function heatPreview(scale = heatScale()) {
  const near = s => { const i = SECTORS.indexOf(s); const d = Math.min(i, 20 - i); return d; };
  const v = (key, ring) => {
    const s = key === '25' || key === '50' ? 0 : Number(String(key).replace(/^[TD]/, ''));
    if (key === '50') return 0.35;
    if (key === '25') return 0.5;
    const d = near(s);
    if (d > 4) return 0;
    const base = 1 - d * 0.24;
    return key[0] === 'T' ? base * 0.7 : key[0] === 'D' ? (d ? 0 : 0.3) : ring === 'i' ? base : base * 0.8;
  };
  return boardSvg({ size: 200, heat: v, heatScale: scale, counts: s => (s === 25 ? 3 : near(s) <= 4 ? 12 - near(s) * 2 : 0), cls: 'board', label: 'Aperçu de la carte de chaleur' });
}
