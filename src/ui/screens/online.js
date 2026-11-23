// Strela — écran « En ligne » (lot 9.2) : créer ou rejoindre un salon, puis le salon (code, QR code, téléphones
// connectés en direct, réglages de la partie chez l'hôte, ordre, LANCER LA PARTIE). Contrôleur : src/ui/online.js.

import { store, activePlayers, playerById } from '../store.js';
import { esc, ico, topBar, plural } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { refresh, go, backFrom } from '../nav.js';
import { qrSvg } from '../qr.js';
import { on, onlineSupport, createRoom, joinRoom, leave, hostLaunch, hostSetup, hostOrder, onlineGame, defaultMe, resumeOnline } from '../online.js';
import { cleanCode, joinUrl, roomPlayers, STATUS_LABEL, CODE_LENGTH, MAX_PHONES } from '../../engine/online.js';
import { START_SCORES } from '../../engine/x01.js';

const info = { open: false };
const sec = (t, n = '') => `<div class="sec">${t}${n !== '' ? ` <span class="n">${n}</span>` : ''}</div>`;

function playerChips(act, cur) {
  const list = activePlayers();
  if (!list.length) return `<p class="note">Crée d'abord ton joueur (pseudo, avatar) : <a href="#/joueur/nouveau">NOUVEAU JOUEUR</a>.</p>`;
  return `<div class="onpick">${list.map(p => `<button type="button" class="chip pl" data-act="${act}" data-arg="${esc(p.id)}" aria-pressed="${p.id === cur}">${avatarHtml(p, 28)}<span class="nm ell">${esc(p.name)}</span></button>`).join('')}</div>`;
}

const explain = () => `<button type="button" class="fold" data-act="on-info" aria-expanded="${info.open}">${ico('info')}<span>Comment ça marche</span>${ico(info.open ? 'up' : 'down')}</button>
  ${info.open ? `<div class="fold-body"><p class="note">Un joueur par téléphone, de 2 à 4 téléphones. L'hôte crée le salon et choisit le jeu ; les autres tapent le code ou scannent le QR code. Pendant la partie, seul le téléphone du joueur dont c'est le tour peut saisir (pavé, cible ou voix) ; les autres voient les fléchettes arriver une par une. Chaque téléphone garde la partie dans son historique, marquée « en ligne ».</p>
    <p class="note">Les téléphones se parlent directement (WebRTC, chiffré). Un service gratuit (PeerJS) sert seulement à les mettre en relation ; rien n'est stocké sur un serveur. Certains réseaux (4G d'opérateur, Wi-Fi d'entreprise) bloquent la connexion directe : sur le même Wi-Fi, ça marche presque toujours.</p>
    <p class="note">Coupure (veille, réseau) : la partie se met en pause pour tous et reprend d'elle-même au retour du joueur ; l'hôte peut passer ses volées ou l'exclure. Verres et animations de Tsia restent propres à chaque téléphone.</p></div>` : ''}`;

/** Écran d'entrée : choisir son joueur, créer ou rejoindre. */
function startScreen(code) {
  const sup = onlineSupport();
  const me = defaultMe();
  if (!on.me && me) on.me = me;
  if (code && !on.draftCode) on.draftCode = code;
  const busy = on.state === 'connecting';
  const g = onlineGame();
  return `<div class="screen online">${topBar('En ligne', backFrom('#/'))}
    <div class="pad">
      ${!sup.ok ? `<div class="banner alert" role="alert">${esc(sup.why)}</div>` : `
      ${g ? `<div class="banner" role="status">Partie en ligne en cours (salon ${esc(g.online.code)}). <button type="button" class="btn" data-act="on-resume">REPRENDRE</button></div>` : ''}
      ${sec('Ton joueur sur ce téléphone')}
      ${playerChips('on-me', on.me)}
      ${sec('Créer un salon')}
      <p class="note" style="margin-top:0">Tu es l'hôte : tu choisis le jeu et tu lances la partie.</p>
      <button type="button" class="btn primary big" data-act="on-create" ${busy || !on.me ? 'disabled' : ''}>${ico('plus')} CRÉER UN SALON</button>
      ${sec('Rejoindre un salon')}
      <label class="field oncode"><input class="input" data-input="on-code" id="oncode" value="${esc(on.draftCode)}" maxlength="${CODE_LENGTH + 2}" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" inputmode="text"></label>
      <button type="button" class="btn big" data-act="on-join" ${busy || !on.me ? 'disabled' : ''}>REJOINDRE</button>
      <p class="note">Ou scanne le QR code de l'hôte avec l'appareil photo du téléphone.</p>
      ${busy ? '<p class="banner" role="status">CONNEXION…</p>' : ''}
      ${on.state === 'error' && on.error ? `<p class="banner alert" role="alert">${esc(on.error)}</p>` : ''}`}
      ${explain()}
    </div></div>`;
}

function member(m, host) {
  const p = m.player ? playerById(m.player.id) : null;
  const st = m.host ? 'HÔTE' : STATUS_LABEL[m.status] || m.status;
  const mine = m.player && m.player.id === on.me;
  return `<li class="onm${m.status !== 'connected' ? ' off' : ''}">${p ? avatarHtml(p, 36) : ''}<span class="nm ell">${esc(p ? p.name : '?')}${mine ? ' <small>(toi)</small>' : ''}</span>
    <b class="st${m.status === 'lost' ? ' alert' : ''}">${st}</b>${host && on.room.setup.order === 'manual' ? `<button type="button" class="act" data-act="on-up" data-arg="${esc(m.player ? m.player.id : '')}" aria-label="Monter dans l'ordre">${ico('up')}</button>` : ''}</li>`;
}

function setupBlock(host) {
  const st = on.room.setup;
  const b = (act, v, label, cur) => `<button type="button" data-act="${act}" data-arg="${v}" aria-pressed="${cur === v}" ${host ? '' : 'disabled'}>${label}</button>`;
  const seg = (act, list, cur) => `<div class="seg">${list.map(([v, l]) => b(act, v, l, cur)).join('')}</div>`;
  const legs = seg('on-legs', [1, 2, 3, 5].map(n => [String(n), n === 1 ? '1 manche' : `${n}`]), String(st.legsToWin));
  return `${sec('Partie')}
    ${seg('on-game', [['x01', 'X01'], ['cricket', 'Cricket']], st.game)}
    ${st.game === 'cricket'
    ? `<div class="small dim caps" style="margin-top:8px">Mode</div>${seg('on-ck', [['points', 'Points'], ['sans', 'Sans points'], ['cutthroat', 'Cut-throat']], st.ckMode)}`
    : `<div class="small dim caps" style="margin-top:8px">Départ</div>${seg('on-start', START_SCORES.map(n => [String(n), String(n)]), String(st.startScore))}
       <div class="small dim caps" style="margin-top:8px">Sortie</div>${seg('on-out', [['double', 'Double'], ['single', 'Simple']], st.outMode)}`}
    <div class="small dim caps" style="margin-top:8px">Manches à gagner</div>${legs}
    <div class="small dim caps" style="margin-top:8px">Ordre</div>${seg('on-order', [['random', 'Tiré au sort'], ['manual', 'Comme la liste']], st.order)}`;
}

/** Le salon : code, QR code, téléphones, réglages, lancement. */
function lobby() {
  const host = on.role === 'host';
  const room = on.room;
  const ids = roomPlayers(room);
  const members = [...room.members].sort((a, b) => ids.indexOf(a.player?.id) - ids.indexOf(b.player?.id));
  const g = onlineGame();
  const playing = room.phase === 'playing' && g;
  const url = joinUrl(room.code);
  const lost = on.role === 'guest' && on.state !== 'open';
  return `<div class="screen online has-dock">${topBar(host ? 'Salon · hôte' : 'Salon', backFrom('#/'))}
    <div class="pad">
      ${lost ? '<p class="banner alert" role="alert">CONNEXION PERDUE · reconnexion…</p>' : ''}
      ${host && on.signal === 'offline' ? '<p class="banner" role="status">Service de mise en relation injoignable : les téléphones connectés continuent ; les nouveaux attendront.</p>' : ''}
      ${on.notice ? `<p class="banner" role="status">${esc(on.notice)}</p>` : ''}
      <div class="oncodebox"><div><small class="dim caps">Code du salon</small><b class="oncodebig" aria-label="Code ${esc(room.code.split('').join(' '))}">${esc(room.code)}</b>
        <button type="button" class="btn ghost" data-act="on-share">PARTAGER LE LIEN</button></div>
        <div class="onqr">${qrSvg(url, { label: `QR code du salon ${room.code}` })}</div></div>
      ${sec('Téléphones', `${room.members.length}/${MAX_PHONES}`)}
      <ul class="onmembers">${members.map(m => member(m, host)).join('')}</ul>
      ${room.members.length < 2 ? '<p class="note">En attente d\'un autre téléphone : il tape le code ou scanne le QR code.</p>' : ''}
      ${!host && room.phase === 'lobby' ? `${sec('Ton joueur')}${playerChips('on-pick', on.me)}` : ''}
      ${setupBlock(host)}
      ${!host && !playing ? '<p class="note">L\'hôte choisit le jeu et lance la partie.</p>' : ''}
      ${explain()}
      <button type="button" class="btn danger" style="margin-top:16px" data-act="on-leave">${host ? 'FERMER LE SALON' : 'QUITTER LE SALON'}</button>
    </div>
    <div class="dock" data-layer>${playing
    ? '<button type="button" class="btn primary big" data-act="on-resume">REPRENDRE LA PARTIE</button>'
    : host ? `<button type="button" class="btn primary big" data-act="on-launch" ${ids.length < 2 || room.members.some(m => m.status !== 'connected') ? 'disabled' : ''}>LANCER LA PARTIE <small>${plural(ids.length, 'joueur', 'joueurs')}</small></button>`
      : '<p class="note" style="margin:0;text-align:center">EN ATTENTE DE L\'HÔTE</p>'}</div>
  </div>`;
}

export function onlineScreen(arg) {
  const code = arg && arg.startsWith('rejoindre/') ? cleanCode(arg.slice(10)) : null;
  if (!on.role && onlineGame()) resumeOnline();
  if (on.role && on.room) return lobby();
  return startScreen(code);
}

export const inputs = {
  'on-code'(v) { on.draftCode = v; },
};

export const actions = {
  'on-info'() { info.open = !info.open; refresh(); },
  'on-me'(id) { on.me = id; refresh(); },
  'on-create'() { if (on.me) createRoom(on.me); },
  'on-join'() {
    const c = cleanCode(on.draftCode || (document.getElementById('oncode') || {}).value);
    if (!c) { on.state = 'error'; on.error = `Le code a ${CODE_LENGTH} caractères (lettres et chiffres, sans O ni 1).`; refresh(); return; }
    if (on.me) joinRoom(c, on.me);
  },
  'on-pick'(id) { on.me = id; if (on.link && on.role === 'guest') on.link.send({ t: 'pick', player: { ...playerById(id) } }); refresh(); },
  'on-leave'() { leave(true); go('#/enligne'); refresh(); },
  'on-launch'() { hostLaunch(); },
  'on-resume'() { const g = onlineGame(); if (g) go(g === store.ck ? '#/cricket' : '#/jeu'); },
  'on-game'(v) { hostSetup({ game: v === 'cricket' ? 'cricket' : 'x01' }); },
  'on-ck'(v) { hostSetup({ ckMode: v }); },
  'on-start'(v) { hostSetup({ startScore: Number(v) }); },
  'on-out'(v) { hostSetup({ outMode: v === 'single' ? 'single' : 'double' }); },
  'on-legs'(v) { hostSetup({ legsToWin: Number(v) || 1 }); },
  'on-order'(v) { hostSetup({ order: v === 'manual' ? 'manual' : 'random' }); },
  'on-up'(id) {
    const ids = roomPlayers(on.room);
    const i = ids.indexOf(id);
    if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; hostOrder(ids); }
  },
  async 'on-share'() {
    const url = joinUrl(on.room.code);
    const text = `Partie de fléchettes Strela : salon ${on.room.code}`;
    try { if (navigator.share) { await navigator.share({ title: 'Strela en ligne', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); on.notice = 'Lien copié.'; } catch (e) { on.notice = url; }
    refresh();
  },
};
