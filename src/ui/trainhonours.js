// Strela — badges d'entraînement et petits défis en séance, à l'écran (lot 8 du 23/11/2026, 5.3 et 5.4) :
// - vitrine des badges d'un joueur (stats d'entraînement) : un carré par badge, ses rangs bronze / argent / or ;
// - petits défis réussis d'une séance (fin, détail) : une pastille par défi ;
// - fenêtre (par-dessus l'écran, comme celle des badges de soirée) : ce que veut dire le badge ou le défi, la séance et la
//   volée concernées, VOIR LA SÉANCE. Calculs : engine/trainbadges.js.
import { store, playerById, trainingById } from './store.js';
import { esc, ico, when } from './dom.js';
import { refresh, go } from './nav.js';
import { FEATS, TRAIN_BADGES, TRAIN_BADGE_KEYS, TIER_NAMES, trainingHonours, sessionFeats, badgeValueText, tierText } from '../engine/trainbadges.js';
import { analyze, EXERCISES, trainingDartLabel } from '../engine/training.js';
import { tierHtml } from './honours.js';

let win = null; // { kind: 'badge' | 'feat', key, pid?, sessionId?, volley?, start?, path }
const shortDay = ms => { const d = new Date(ms); return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`; };
const here = () => decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
/** En changeant d'écran, la fenêtre se ferme (app.js). */
export function closeTrainSheet(path) { if (win && win.path !== undefined && win.path !== path) win = null; }
export function presetTrainSheet(w = null) { win = w ? { ...w, path: undefined } : null; }

const cache = new Map();
const an = r => { const k = `${r.id}:${r.darts.length}`; if (!cache.has(k)) cache.set(k, analyze(r)); return cache.get(k); };
/** Badges et petits défis d'un joueur (toutes ses séances). */
export const honoursOf = pid => trainingHonours(store.trainings, pid, an);

/** Vitrine des badges d'entraînement d'un joueur. */
export function trainBadgesGrid(pid) {
  const h = honoursOf(pid);
  if (!h.sessions) return '';
  const feats = h.feats.length;
  return `<ul class="badges tbadges">${h.badges.map(b => {
    const def = TRAIN_BADGES[b.key];
    return `<li class="${b.tier ? 'on' : 'off'} tiered"><button type="button" data-act="tb-open" data-arg="badge|${b.key}|${esc(pid)}" aria-label="${esc(def.name)}">${ico(def.icon)}<b>${esc(def.name)}</b>${tierHtml(b.tier)}<small>${esc(badgeValueText(b.key, b.value))}</small></button></li>`;
  }).join('')}</ul>
    <p class="note">${feats ? `${feats} petit${feats > 1 ? 's' : ''} défi${feats > 1 ? 's' : ''} réussi${feats > 1 ? 's' : ''} en séance.` : 'Aucun petit défi réussi en séance pour l\'instant.'} Les badges se calculent sur tout l'historique.</p>`;
}

/** Petits défis réussis d'une séance (fin, détail). */
export function featChips(r) {
  const list = sessionFeats(r);
  if (!list.length) return '';
  return `<div class="sec">Petits défis réussis <span class="n">${list.length}</span></div>
    <div class="chips2 feats">${list.map(f => `<button type="button" class="chip2" data-act="tb-open" data-arg="feat|${f.key}|${esc(r.id)}|${f.start}">${ico(FEATS[f.key].icon)} ${esc(FEATS[f.key].name)} <small>· volée ${f.volley}</small></button>`).join('')}</div>`;
}

/** La fenêtre ouverte, ou '' (ajoutée par app.js à l'écran affiché). */
export function trainSheetHtml() {
  if (!win) return '';
  if (win.path === undefined) win.path = here();
  let head, body;
  if (win.kind === 'badge') {
    const def = TRAIN_BADGES[win.key];
    const p = playerById(win.pid);
    if (!def || !p) return '';
    const b = honoursOf(win.pid).badges.find(x => x.key === win.key);
    head = `<div class="bhero ${b.tier ? 'on' : 'off'}">${ico(def.icon)}<b>${esc(def.name)}</b>${tierHtml(b.tier)}</div>`;
    body = `<p class="bmean">${esc(def.text)}</p>
      <div class="sec">Rangs<span class="n">${esc(badgeValueText(win.key, b.value))}</span></div>
      <ul class="btiers">${[1, 2, 3].map(k => { const g = b.got.find(x => x.tier === k); return `<li class="${g ? 'on' : ''}">${tierHtml(k)}<span class="th">${esc(tierText(win.key, k))}</span><small>${g ? esc(shortDay(g.at)) : ''}</small>
        ${g && trainingById(g.sessionId) ? `<button type="button" class="tsee" data-act="tb-session" data-arg="${esc(g.sessionId)}" aria-label="Voir la séance du rang ${TIER_NAMES[k]}">${ico('chev')}</button>` : ''}</li>`; }).join('')}</ul>
      <p class="note">Seuils volontairement hauts ; calculés sur toutes les séances (une séance mise de côté ne compte pas).</p>`;
  } else {
    const def = FEATS[win.key];
    const r = trainingById(win.sessionId);
    if (!def || !r) return '';
    const ds = r.darts.slice(win.start, win.start + 3).map(trainingDartLabel).join(' · ');
    head = `<div class="bhero on">${ico(def.icon)}<b>${esc(def.name)}</b><span class="tn">PETIT DÉFI</span></div>`;
    body = `<p class="bmean">${esc(def.text)}</p>
      <ul class="bkv"><li><span>Séance</span><b class="ell">${esc((EXERCISES[r.exercise] || EXERCISES.libre).name)}</b></li><li><span>Date</span><b>${esc(when(r.startedAt))}</b></li>
        <li><span>Volée</span><b>${win.start / 3 + 1}</b></li><li><span>Fléchettes</span><b>${esc(ds)}</b></li></ul>
      ${store.tr && store.tr.id === r.id ? '' : `<button type="button" class="btn" data-act="tb-session" data-arg="${esc(r.id)}">${ico('stats')} VOIR LA SÉANCE</button>`}`;
  }
  return `<div class="sheet-bg bsheet" role="dialog" aria-label="Badge" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>${win.kind === 'badge' ? 'Badge d\'entraînement' : 'Petit défi'}</span></h1><button type="button" class="act" data-act="tb-close" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body">${head}${body}<button type="button" class="btn primary" data-act="tb-close">FERMER</button></div></div></div>`;
}

export const actions = {
  'tb-open'(arg) {
    const [kind, key, a, b] = String(arg).split('|');
    win = kind === 'badge' ? { kind, key, pid: a, path: here() } : { kind: 'feat', key, sessionId: a, start: Number(b) || 0, path: here() };
    refresh();
  },
  'tb-close'() { win = null; refresh(); },
  'tb-session'(id) { win = null; go(`#/entrainement/seance/${id}`); },
};
export { TRAIN_BADGE_KEYS };
