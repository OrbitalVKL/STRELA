// Nouvelle partie : joueurs touchés dans l'ordre de passage (ordre visible et corrigeable), 301 / 501 / 701,
// sortie simple ou double, manches à gagner. Les derniers réglages sont repris. LANCER bien visible.
// Lot 10 : jeu X01 ou Cricket (mode avec points, sans points, cut-throat) ; le Cricket n'a ni score de départ, ni
// sortie, ni handicap, ni défis, ni « jusqu'au bout ».
import { store, activePlayers, playerById, startGame, currentState, startCricket, ckState } from '../store.js';
import { rulesText } from './cricket.js';
import { esc, ico, topBar } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { START_SCORES, MAX_PLAYERS } from '../../engine/x01.js';
import { go, refresh } from '../nav.js';

function draft() {
  if (store.setupDraft) return store.setupDraft;
  const last = { shuffle: true, playOn: false, ...(store.lastSetup || { players: [], startScore: 501, outMode: 'double', legsToWin: 1 }) };
  const active = new Set(activePlayers().map(p => p.id));
  // Lot 7.6 : pendant une soirée, ses joueurs sont proposés d'office (ceux de la dernière partie d'abord, dans leur ordre).
  const base = store.soiree
    ? [...last.players.filter(id => store.soiree.players.includes(id)), ...store.soiree.players.filter(id => !last.players.includes(id))]
    : last.players;
  store.setupDraft = { ...last, players: base.filter(id => active.has(id)), confirm: false };
  return store.setupDraft;
}

export function newGame() {
  const d = draft();
  const chosen = d.players.map(playerById);
  const pool = activePlayers().filter(p => !d.players.includes(p.id));
  const full = d.players.length >= MAX_PLAYERS;
  const seg = (act, value, label, cur) => `<button type="button" data-act="${act}" data-arg="${value}" aria-pressed="${value === cur}">${label}</button>`;

  // Lot 9 : handicap — un score de départ par joueur (301 / 501 / 701), touché pour passer au suivant.
  const hc = !!d.handicap;
  const startOf = id => (d.starts && d.starts[id]) || d.startScore;
  const order = chosen.length
    ? `<ol class="order">${chosen.map((p, i) => `<li>
        <span class="rank inv">${d.shuffle ? '?' : i + 1}</span>${avatarHtml(p, 40)}<span class="nm ell">${esc(p.name)}</span>
        ${hc ? `<button type="button" class="hcap${startOf(p.id) !== d.startScore ? ' on' : ''}" data-act="hcap" data-arg="${esc(p.id)}" aria-label="Score de départ de ${esc(p.name)} : ${startOf(p.id)}">${startOf(p.id)}</button>` : ''}
        ${d.shuffle ? '' : `<button type="button" class="mv" data-act="move-up" data-arg="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">${ico('up')}</button>
        <button type="button" class="mv" data-act="move-down" data-arg="${i}" ${i === chosen.length - 1 ? 'disabled' : ''} aria-label="Descendre">${ico('down')}</button>`}
        <button type="button" class="mv" data-act="remove" data-arg="${i}" aria-label="Retirer">${ico('close')}</button></li>`).join('')}</ol>`
    : `<p class="note" style="margin:0">${d.shuffle ? 'Touchez les joueurs de la partie.' : 'Touchez les joueurs dans l\'ordre où ils vont lancer.'}</p>`;

  const poolHtml = !store.players.some(p => !p.archived)
    ? (store.players.length
      // Tous archivés (lot 4) : le dire, et mener à la liste où RÉACTIVER les remet.
      ? `<div class="empty" style="padding:20px 0"><p style="margin:0 0 14px">Tous les joueurs sont archivés. Réactive-les dans la liste des joueurs, ou crées-en un.</p>
          <div class="btns"><a class="btn" href="#/joueurs">VOIR LES JOUEURS</a><a class="btn ghost" href="#/joueur/nouveau">${ico('plus')} CRÉER UN JOUEUR</a></div></div>`
      : `<div class="empty" style="padding:20px 0"><p style="margin:0 0 14px">Aucun joueur pour l'instant.</p><a class="btn" href="#/joueur/nouveau">${ico('plus')} CRÉER UN JOUEUR</a></div>`)
    : pool.length
      ? `<div class="pool">${pool.map(p => `<button type="button" data-act="add" data-arg="${esc(p.id)}" ${full ? 'disabled' : ''}>${avatarHtml(p, 48)}<span class="nm ell">${esc(p.name)}</span></button>`).join('')}
         <a class="btn ghost" href="#/joueur/nouveau" style="min-height:104px;flex-direction:column;gap:6px;font-size:11px">${ico('plus')}NOUVEAU</a></div>`
      : '<p class="note">Tous les joueurs sont dans la partie.</p>';

  const legs = d.legsToWin;
  const ok = d.players.length > 0;
  // Partie en cours : LANCER l'abandonne (elle reste dans l'historique), après une vraie confirmation (lot 3).
  const busy = gameBusy();
  if (!busy) d.confirm = false;
  const ck = d.game === 'cricket';
  const busyNote = busy
    ? `<div class="busy" role="note"><span class="small">Une partie est en cours.</span><a class="btn ghost" href="${store.ck ? '#/cricket' : '#/jeu'}">REPRENDRE</a></div>`
    : '';
  const launch = d.confirm
    ? `<div class="confirm" role="alertdialog" aria-label="Abandonner la partie en cours ?"><p class="alert-h">ABANDONNER LA PARTIE EN COURS ?</p>
        <p class="small">Elle restera dans l'historique, marquée « abandonnée », et la nouvelle partie commencera.</p>
        <div class="btns two"><button type="button" class="btn" data-act="launch-no">NON</button><button type="button" class="btn alert" data-act="launch-yes">ABANDONNER</button></div></div>`
    : `<button type="button" class="btn primary big" data-act="launch" ${ok ? '' : 'disabled'}>
      ${ok ? `LANCER <small>${ck ? 'CRICKET' : hc && d.players.some(id => startOf(id) !== d.startScore) ? 'HANDICAP' : d.startScore} · ${d.players.length === 1 ? 'SOLO' : `${d.players.length} JOUEURS`}</small>` : 'CHOISIR LES JOUEURS'}</button>`;
  const mode = d.ckMode || 'points';
  const legsHtml = `<div class="sec">Manches à gagner</div>
      <div class="stepper"><button type="button" data-act="legs" data-arg="-1" ${legs <= 1 ? 'disabled' : ''} aria-label="Moins">−</button>
        <output>${legs === 1 ? '1 MANCHE' : `PREMIER À ${legs} MANCHES`}</output>
        <button type="button" data-act="legs" data-arg="1" ${legs >= 9 ? 'disabled' : ''} aria-label="Plus">+</button></div>
      <p class="note">Le premier à lancer change à chaque manche.</p>`;
  const gameSeg = `<div class="sec">Jeu</div>
      <div class="seg">${seg('game', 'x01', '301 · 501 · 701', ck ? 'cricket' : 'x01')}${seg('game', 'cricket', 'Cricket', ck ? 'cricket' : 'x01')}</div>`;
  return `<div class="screen has-dock">${topBar('Nouvelle partie', '#/')}
    <div class="pad">
      ${busyNote}
      ${store.soiree ? `<a class="soiree-line" href="#/soiree">${ico('glass')}<span><b>SOIRÉE EN COURS</b><br>Ses joueurs sont proposés ; un joueur ajouté rejoint la soirée, et les verres continuent.</span>${ico('chev')}</a>` : ''}
      <div class="sec">${d.shuffle ? 'Joueurs' : 'Ordre de passage'} <span class="n">${d.players.length}/${MAX_PLAYERS}</span></div>
      ${order}
      <div class="seg" style="margin-top:12px">${seg('shuffle', 'oui', 'Tiré au sort', d.shuffle ? 'oui' : 'non')}${seg('shuffle', 'non', 'Dans cet ordre', d.shuffle ? 'oui' : 'non')}</div>
      ${pool.length || !activePlayers().length ? `<div class="sec">${chosen.length ? 'Ajouter' : 'Joueurs'}</div>${poolHtml}` : ''}
      ${full ? '<p class="note">8 joueurs au plus.</p>' : ''}
      ${gameSeg}
      ${ck ? `<div class="sec">Règles</div>
      <div class="seg">${seg('ckmode', 'points', 'Avec points', mode)}${seg('ckmode', 'sans', 'Sans points', mode)}${seg('ckmode', 'cutthroat', 'Cut-throat', mode)}</div>
      <p class="note">${rulesText(mode)}</p>
      ${legsHtml}` : `<div class="sec">Départ</div>
      <div class="seg">${START_SCORES.map(s => seg('score', s, s, d.startScore)).join('')}</div>
      <div class="sec">Handicap</div>
      <div class="seg">${seg('handicap', 'non', 'Non', hc ? 'oui' : 'non')}${seg('handicap', 'oui', 'Oui', hc ? 'oui' : 'non')}</div>
      <p class="note">${hc ? 'Touchez le score à côté d\'un joueur pour changer son départ (301, 501, 701) : les plus forts partent de plus loin.' : 'Oui : un score de départ par joueur, pour des parties serrées entre joueurs de niveaux différents.'}</p>
      <div class="sec">Sortie</div>
      <div class="seg">${seg('out', 'single', 'Simple', d.outMode)}${seg('out', 'double', 'Double', d.outMode)}</div>
      ${legsHtml}
      <div class="sec">Défis de soirée</div>
      <div class="seg">${seg('defis', 'non', 'Non', d.defis || 'non')}${seg('defis', 'parfois', 'Parfois', d.defis || 'non')}${seg('defis', 'souvent', 'Souvent', d.defis || 'non')}</div>
      <p class="note">${(d.defis || 'non') === 'non' ? 'Un défi tiré au sort de temps en temps (« un triple, sinon un verre »), annoncé à voix haute et vérifié tout seul.' : `Environ une volée sur ${d.defis === 'souvent' ? 4 : 8} ; le gage est indicatif : un appui le note dans les verres.`}</p>
      ${d.players.length > 2 ? `<div class="sec">Jouer jusqu'au bout</div>
      <div class="seg">${seg('playon', 'non', 'Non', d.playOn ? 'oui' : 'non')}${seg('playon', 'oui', 'Oui', d.playOn ? 'oui' : 'non')}</div>
      <p class="note">Oui : après le gagnant, les autres finissent pour les places ; le dernier paie sa tournée.</p>` : ''}`}
    </div>
    <div class="dock" data-layer>${launch}</div>
  </div>`;
}

export const actions = {
  add(id) { const d = draft(); if (d.players.length < MAX_PLAYERS && !d.players.includes(id)) d.players.push(id); refresh(); },
  remove(i) { draft().players.splice(Number(i), 1); refresh(); },
  'move-up'(i) { const p = draft().players; i = Number(i); if (i > 0) [p[i - 1], p[i]] = [p[i], p[i - 1]]; refresh(); },
  'move-down'(i) { const p = draft().players; i = Number(i); if (i < p.length - 1) [p[i + 1], p[i]] = [p[i], p[i + 1]]; refresh(); },
  score(v) { draft().startScore = Number(v); refresh(); },
  defis(v) { draft().defis = v; refresh(); },
  handicap(v) { const d = draft(); d.handicap = v === 'oui'; if (!d.starts) d.starts = {}; refresh(); },
  hcap(id) {
    const d = draft();
    d.starts = { ...(d.starts || {}) };
    const cur = d.starts[id] || d.startScore;
    d.starts[id] = START_SCORES[(START_SCORES.indexOf(cur) + 1) % START_SCORES.length];
    refresh();
  },
  out(v) { draft().outMode = v; refresh(); },
  shuffle(v) { draft().shuffle = v === 'oui'; refresh(); },
  playon(v) { draft().playOn = v === 'oui'; refresh(); },
  legs(delta) { const d = draft(); d.legsToWin = Math.min(9, Math.max(1, d.legsToWin + Number(delta))); refresh(); },
  game(v) { draft().game = v === 'cricket' ? 'cricket' : 'x01'; refresh(); },
  ckmode(v) { draft().ckMode = v; refresh(); },
  launch() {
    const d = draft();
    if (!d.players.length) return;
    if (gameBusy()) { d.confirm = true; refresh(); return; }
    launch(d);
  },
  'launch-no'() { draft().confirm = false; refresh(); },
  'launch-yes'() { const d = draft(); if (d.players.length) launch(d); },
};

/** Une partie (X01 ou Cricket) est-elle en cours, avec au moins une fléchette ? */
function gameBusy() {
  const cur = currentState();
  if (cur && cur.status === 'playing' && store.current.darts.length) return true;
  const ck = ckState();
  return !!(ck && ck.status === 'playing' && store.ck.darts.length);
}

function launch(d) {
  // Une partie en cours non finie est d'abord rangée, abandonnée.
  if (d.game === 'cricket') { startCricket({ players: d.players, ckMode: d.ckMode || 'points', legsToWin: d.legsToWin, shuffle: d.shuffle }); store.setupDraft = null; go('#/cricket'); return; }
  startGame(d);
  store.setupDraft = null;
  go('#/jeu');
}
