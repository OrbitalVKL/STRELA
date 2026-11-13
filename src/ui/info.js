// Strela — explications repliées derrière un (i) (version 0.8.1, demande de Guillaume : « le texte explicatif à passer
// en i »). Un appui sur (i) déplie l'explication sous le titre, un second la replie. Partagé par le tableau de bord
// d'une soirée et le détail d'une partie (les Stats et les Réglages ont leur propre (i), même apparence : .ibtn,
// .infobox). L'état (clés dépliées) dure le temps de la session, il n'est pas enregistré.
import { ico } from './dom.js';
import { refresh } from './nav.js';

const open = new Set();

/** Bouton (i) pour l'explication `key`. */
export const infoBtn = key => `<button type="button" class="ibtn" data-act="info" data-arg="${key}" aria-pressed="${open.has(key)}" aria-label="Explication">${ico('info')}</button>`;
/** L'explication `key` si elle est dépliée (HTML déjà échappé). */
export const infoBox = (key, html) => (open.has(key) ? `<p class="infobox" role="note">${html}</p>` : '');
/** Titre de section avec son (i). */
export const infoSec = (title, key, extra = '') => `<div class="sec">${title}${extra}${infoBtn(key)}</div>`;
/** Sommaire de maquette et tests : explications dépliées d'avance. */
export function presetInfo(keys = []) { open.clear(); for (const k of keys) open.add(k); }

export const actions = {
  info(key) { if (open.has(key)) open.delete(key); else open.add(key); refresh(); },
};
