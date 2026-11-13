// Soirée (lot 7.6, demande de Guillaume) : on débute la soirée avec ses joueurs ; « Nouvelle partie » les reprend, et
// leurs verres continuent d'une partie à l'autre (plus besoin de recompter les verres des parties d'avant). On ajoute
// des joueurs en cours de soirée (ici, ou en les ajoutant à une nouvelle partie). TERMINER LA SOIRÉE ne supprime rien :
// les parties gardent leurs verres et le cumul de la soirée (store.js, « soirée »).
import {
  store, activePlayers, playerById, currentState, resumeRoute, startSoiree, endSoiree, joinSoiree, leaveSoiree,
  soireeDrinks, soireeTotal, soireeAddDrink, soireeRemoveDrink,
} from '../store.js';
import { esc, ico, topBar, plural } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { go, refresh, buzz, BUZZ } from '../nav.js';
import { glassCount } from './game.js';

let ending = false; // confirmation de TERMINER LA SOIRÉE

const hhmm = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')} H ${String(d.getMinutes()).padStart(2, '0')}`; };

function draft() {
  if (!store.soireeDraft) {
    // Proposés d'office : les joueurs de la dernière partie (encore actifs).
    const active = new Set(activePlayers().map(p => p.id));
    store.soireeDraft = { players: ((store.lastSetup && store.lastSetup.players) || []).filter(id => active.has(id)) };
  }
  return store.soireeDraft;
}

const poolHtml = (ids, act) => {
  const pool = activePlayers().filter(p => !ids.includes(p.id));
  if (!store.players.length) return `<div class="empty" style="padding:20px 0"><p style="margin:0 0 14px">Aucun joueur pour l'instant.</p><a class="btn" href="#/joueur/nouveau">${ico('plus')} CRÉER UN JOUEUR</a></div>`;
  return pool.length
    ? `<div class="pool">${pool.map(p => `<button type="button" data-act="${act}" data-arg="${esc(p.id)}">${avatarHtml(p, 48)}<span class="nm ell">${esc(p.name)}</span></button>`).join('')}
       <a class="btn ghost" href="#/joueur/nouveau" style="min-height:104px;flex-direction:column;gap:6px;font-size:11px">${ico('plus')}NOUVEAU</a></div>`
    : '<p class="note">Tous les joueurs sont dans la soirée.</p>';
};

export function soireeScreen() {
  return store.soiree ? running() : before();
}

/** Avant : choisir les joueurs, DÉBUTER LA SOIRÉE. */
function before() {
  ending = false;
  const d = draft();
  const chosen = d.players.map(playerById);
  const list = chosen.length
    ? `<ol class="order">${chosen.map((p, i) => `<li>${avatarHtml(p, 40)}<span class="nm ell">${esc(p.name)}</span>
        <button type="button" class="mv" data-act="soiree-unpick" data-arg="${i}" aria-label="Retirer ${esc(p.name)}">${ico('close')}</button></li>`).join('')}</ol>`
    : '<p class="note" style="margin:0">Touchez les joueurs de la soirée.</p>';
  return `<div class="screen has-dock">${topBar('Soirée', '#/')}
    <div class="pad">
      <p class="note" style="margin-top:0">Une soirée regroupe plusieurs parties : ses joueurs sont repris à chaque nouvelle partie, et leurs verres continuent d'une partie à l'autre. D'autres joueurs peuvent la rejoindre en cours de route.</p>
      <div class="sec">Joueurs de la soirée <span class="n">${chosen.length}</span></div>
      ${list}
      <div class="sec">${chosen.length ? 'Ajouter' : 'Joueurs'}</div>
      ${poolHtml(d.players, 'soiree-pick')}
    </div>
    <div class="dock" data-layer><button type="button" class="btn primary big" data-act="soiree-start" ${chosen.length ? '' : 'disabled'}>${chosen.length ? `DÉBUTER LA SOIRÉE <small>${plural(chosen.length, 'JOUEUR', 'JOUEURS')}</small>` : 'CHOISIR LES JOUEURS'}</button></div>
  </div>`;
}

/** Pendant : verres de chacun depuis le début de la soirée (− / + VERRE), ajout de joueurs, fin de la soirée. */
function running() {
  const sv = store.soiree;
  const games = [...store.games, ...(store.current ? [store.current] : [])].filter(g => g.soiree === sv.id && g.darts && g.darts.length).length;
  const rows = sv.players.map(id => {
    const p = playerById(id);
    const n = soireeDrinks(id);
    return `<li>${avatarHtml(p, 32)}<div class="col"><span class="nm ell">${esc(p.name)}</span>${glassCount(n, 'cnt')}</div>
      <button type="button" class="mv" data-act="soiree-minus" data-arg="${esc(id)}" ${n ? '' : 'disabled'} aria-label="Retirer un verre à ${esc(p.name)}">${ico('minus')}</button>
      <button type="button" class="mv add" data-act="soiree-plus" data-arg="${esc(id)}" aria-label="Un verre de plus pour ${esc(p.name)}">${ico('plus')}${ico('glass')}</button>
      <button type="button" class="mv out" data-act="soiree-leave" data-arg="${esc(id)}" aria-label="${esc(p.name)} quitte la soirée">${ico('close')}</button></li>`;
  }).join('');
  const end = ending
    ? `<div class="confirm" role="alertdialog" aria-label="Terminer la soirée ?"><p class="alert-h">TERMINER LA SOIRÉE ?</p>
        <p class="small">Les parties restent dans l'historique avec leurs verres. La prochaine partie repartira de zéro verre.</p>
        <div class="btns two"><button type="button" class="btn" data-act="soiree-end-no">NON</button><button type="button" class="btn alert" data-act="soiree-end-yes">TERMINER</button></div></div>`
    : '<button type="button" class="btn danger" data-act="soiree-end">TERMINER LA SOIRÉE</button>';
  const s = currentState();
  const playing = s && store.current.darts.length && s.status === 'playing';
  const main = store.current
    ? `<a class="btn primary big" href="${resumeRoute()}">REPRENDRE LA PARTIE</a>`
    : '<a class="btn primary big" href="#/nouvelle">NOUVELLE PARTIE</a>';
  return `<div class="screen has-dock">${topBar('Soirée', '#/')}
    <div class="soiree-head inv"><b>SOIRÉE EN COURS</b><span>DEPUIS ${hhmm(sv.startedAt)} · ${plural(games, 'PARTIE', 'PARTIES')} · ${glassCount(soireeTotal())}</span></div>
    <div class="pad">
      <div class="sec" style="margin-bottom:0">Joueurs et verres <span class="n">${sv.players.length}</span></div>
      ${sv.players.length ? `<ul class="drinks soiree">${rows}</ul>` : '<p class="note">Plus personne dans la soirée : ajoutez des joueurs.</p>'}
      <p class="note" style="margin:0">${playing ? 'Pendant la partie, un verre d\'un joueur de la partie y est noté, au tour où il a été pris.' : 'Les verres comptent depuis le début de la soirée, toutes parties confondues.'} Qui a bu ne conduit pas.</p>
      <div class="sec">Ajouter à la soirée</div>
      ${poolHtml(sv.players, 'soiree-join')}
      <p class="note">Un joueur ajouté à une nouvelle partie rejoint aussi la soirée. ✕ : le joueur quitte la soirée (ses verres restent comptés s'il revient).</p>
      ${store.games.some(g => g.soiree === sv.id) ? `<a class="btn" href="#/soiree/${esc(sv.id)}" style="margin-top:16px">${ico('stats')} TABLEAU DE BORD DE LA SOIRÉE</a>` : ''}
      <div class="sec">Fin de soirée</div>
      ${end}
    </div>
    <div class="dock" data-layer>${main}</div>
  </div>`;
}

export const actions = {
  'soiree-pick'(id) { const d = draft(); if (!d.players.includes(id)) d.players.push(id); refresh(); },
  'soiree-unpick'(i) { draft().players.splice(Number(i), 1); refresh(); },
  'soiree-start'() { const d = draft(); if (!d.players.length) return; startSoiree(d.players); store.soireeDraft = null; buzz(BUZZ.dart); refresh(); },
  'soiree-join'(id) { joinSoiree([id]); store.setupDraft = null; refresh(); },
  'soiree-leave'(id) { leaveSoiree(id); store.setupDraft = null; refresh(); },
  'soiree-plus'(id) { soireeAddDrink(id); buzz(BUZZ.dart); refresh(); },
  'soiree-minus'(id) { soireeRemoveDrink(id); buzz(BUZZ.undo); refresh(); },
  'soiree-end'() { ending = true; refresh(); },
  'soiree-end-no'() { ending = false; refresh(); },
  'soiree-end-yes'() { ending = false; endSoiree(); go('#/'); },
};
