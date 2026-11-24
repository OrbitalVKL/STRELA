// Strela — bandeau de mode des pages de stats (lot 8 du 23/11/2026, 3.6) : collé sous la barre du haut, pictogramme et
// libellé, une teinte de fond par mode (jetons --mode-train, --mode-soiree de theme.css).
// Lot 9.5 (C1) : c'est aussi le sélecteur Soirée / Entraînement, tout en haut et toujours visible : deux moitiés (pinte
// + « Soirée », cible + « Entraînement »), la moitié choisie à la teinte de son mode ; toucher l'autre ouvre ses stats
// (même joueur, sans empiler l'historique : le retour ramène à l'écran d'origine). Un seul mode allumé : un seul bandeau.
import { ico, esc } from './dom.js';
import { appModes } from './store.js';

const MODES = { soiree: ['pint', 'Soirée', 'Stats soirée'], train: ['target', 'Entraînement', 'Stats entraînement'] };
/**
 * Bandeau du mode `kind` ('train' ou 'soiree') ; `tabs` : sélecteur des deux modes (pages principales des stats) ;
 * `pid` : joueur affiché, gardé en changeant de mode.
 */
export function modeBand(kind, { tabs = false, pid = '' } = {}) {
  const k = kind in MODES ? kind : 'soiree';
  const m = appModes();
  if (!tabs || !(m.train && m.soiree)) {
    const [icon, , label] = MODES[k];
    return `<div class="modeband ${k}" role="note" data-layer>${ico(icon)}<b>${label}</b></div>`;
  }
  return `<div class="modeband two" role="tablist" aria-label="Stats" data-layer>${Object.entries(MODES).map(([key, [icon, label]]) => `<button type="button" role="tab" class="mb ${key}" aria-selected="${key === k}" data-act="stats-mode" data-arg="${key}:${esc(pid || '')}">${ico(icon)}<b>${label}</b></button>`).join('')}</div>`;
}
