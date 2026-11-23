// Strela — bandeau de mode des pages de stats (lot 8 du 23/11/2026, 3.6) : fin (44 px), collé sous la barre du haut,
// pictogramme et libellé, une teinte de fond par mode (jetons --mode-train, --mode-soiree de theme.css). On sait d'un
// coup d'œil si l'on regarde les chiffres de l'entraînement ou ceux des soirées.
import { ico } from './dom.js';

const MODES = { train: ['target', 'Stats entraînement'], soiree: ['pint', 'Stats soirée'] };
/** Bandeau du mode `kind` ('train' ou 'soiree'). */
export function modeBand(kind) {
  const [icon, label] = MODES[kind] || MODES.soiree;
  return `<div class="modeband ${kind in MODES ? kind : 'soiree'}" role="note" data-layer>${ico(icon)}<b>${label}</b></div>`;
}
