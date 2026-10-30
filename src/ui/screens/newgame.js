// Nouvelle partie : joueurs touchés dans l'ordre de passage (ordre visible et corrigeable), 301 / 501 / 701,
// sortie simple ou double, manches à gagner. Les derniers réglages sont repris. LANCER bien visible.
import { store, activePlayers, playerById, startGame, ensureExtraPlayers } from '../store.js';
import { esc, ico, topBar } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { START_SCORES, MAX_PLAYERS } from '../../engine/x01.js';
import { go, refresh } from '../nav.js';

function draft() {
  if (store.setupDraft) return store.setupDraft;
  const last = store.lastSetup || { players: [], startScore: 501, outMode: 'double', legsToWin: 1 };
  const active = new Set(activePlayers().map(p => p.id));
  store.setupDraft = { ...last, players: last.players.filter(id => active.has(id)) };
  return store.setupDraft;
}

export function newGame() {
  const d = draft();
  const chosen = d.players.map(playerById);
  const pool = activePlayers().filter(p => !d.players.includes(p.id));
  const full = d.players.length >= MAX_PLAYERS;
  const seg = (act, value, label, cur) => `<button type="button" data-act="${act}" data-arg="${value}" aria-pressed="${value === cur}">${label}</button>`;

  const order = chosen.length
    ? `<ol class="order">${chosen.map((p, i) => `<li>
        <span class="rank inv">${i + 1}</span>${avatarHtml(p, 40)}<span class="nm ell">${esc(p.name)}</span>
        <button type="button" class="mv" data-act="move-up" data-arg="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">${ico('up')}</button>
        <button type="button" class="mv" data-act="move-down" data-arg="${i}" ${i === chosen.length - 1 ? 'disabled' : ''} aria-label="Descendre">${ico('down')}</button>
        <button type="button" class="mv" data-act="remove" data-arg="${i}" aria-label="Retirer">${ico('close')}</button></li>`).join('')}</ol>`
    : '<p class="note" style="margin:0">Touchez les joueurs dans l\'ordre où ils vont lancer.</p>';

  const poolHtml = !store.players.some(p => !p.archived)
    ? `<div class="empty" style="padding:20px 0"><p style="margin:0 0 14px">Aucun joueur pour l'instant.</p><a class="btn" href="#/joueur/nouveau">${ico('plus')} CRÉER UN JOUEUR</a></div>`
    : pool.length
      ? `<div class="pool">${pool.map(p => `<button type="button" data-act="add" data-arg="${esc(p.id)}" ${full ? 'disabled' : ''}>${avatarHtml(p, 48)}<span class="nm ell">${esc(p.name)}</span></button>`).join('')}
         <a class="btn ghost" href="#/joueur/nouveau" style="min-height:104px;flex-direction:column;gap:6px;font-size:11px">${ico('plus')}NOUVEAU</a></div>`
      : '<p class="note">Tous les joueurs sont dans la partie.</p>';

  const legs = d.legsToWin;
  const ok = d.players.length > 0;
  return `<div class="screen has-dock">${topBar('Nouvelle partie', '#/')}
    <div class="pad">
      <div class="sec">Ordre de passage <span class="n">${d.players.length}/${MAX_PLAYERS}</span></div>
      ${order}
      ${pool.length || !store.players.length ? `<div class="sec">${chosen.length ? 'Ajouter' : 'Joueurs'}</div>${poolHtml}` : ''}
      ${full ? '<p class="note">8 joueurs au plus.</p>' : ''}
      <div class="sec">Jeu</div>
      <div class="seg">${START_SCORES.map(s => seg('score', s, s, d.startScore)).join('')}</div>
      <div class="sec">Sortie</div>
      <div class="seg">${seg('out', 'single', 'Simple', d.outMode)}${seg('out', 'double', 'Double', d.outMode)}</div>
      <div class="sec">Manches à gagner</div>
      <div class="stepper"><button type="button" data-act="legs" data-arg="-1" ${legs <= 1 ? 'disabled' : ''} aria-label="Moins">−</button>
        <output>${legs === 1 ? '1 MANCHE' : `PREMIER À ${legs} MANCHES`}</output>
        <button type="button" data-act="legs" data-arg="1" ${legs >= 9 ? 'disabled' : ''} aria-label="Plus">+</button></div>
      <p class="note">Le premier à lancer change à chaque manche.</p>
    </div>
    <div class="dock"><button type="button" class="btn primary big" data-act="launch" ${ok ? '' : 'disabled'}>
      ${ok ? `LANCER <small>${d.startScore} · ${d.players.length === 1 ? 'SOLO' : `${d.players.length} JOUEURS`}</small>` : 'CHOISIR LES JOUEURS'}</button></div>
  </div>`;
}

export const actions = {
  add(id) { const d = draft(); if (d.players.length < MAX_PLAYERS && !d.players.includes(id)) d.players.push(id); refresh(); },
  remove(i) { draft().players.splice(Number(i), 1); refresh(); },
  'move-up'(i) { const p = draft().players; i = Number(i); if (i > 0) [p[i - 1], p[i]] = [p[i], p[i - 1]]; refresh(); },
  'move-down'(i) { const p = draft().players; i = Number(i); if (i < p.length - 1) [p[i + 1], p[i]] = [p[i], p[i + 1]]; refresh(); },
  score(v) { draft().startScore = Number(v); refresh(); },
  out(v) { draft().outMode = v; refresh(); },
  legs(delta) { const d = draft(); d.legsToWin = Math.min(9, Math.max(1, d.legsToWin + Number(delta))); refresh(); },
  launch() {
    const d = draft();
    if (!d.players.length) return;
    ensureExtraPlayers(d.players);
    startGame(d);
    store.setupDraft = null;
    go('#/jeu');
  },
};
