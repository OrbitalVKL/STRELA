// Strela — écran Amis (lot 10, étape 2) : #/amis, #/amis/ajouter/CODE.
// Mon code (QR code + 6 caractères, PARTAGER), ajouter un ami (code tapé ; scanner dans le navigateur s'il sait lire
// un QR code, sinon l'appareil photo du téléphone ouvre la page rejoindre.html qui ramène ici), demandes reçues
// (ACCEPTER / REFUSER) et envoyées (ANNULER), amis (dernière activité, RETIRER).

import { store, friendPlayers } from '../store.js';
import { esc, ico, topBar, plural } from '../dom.js';
import { refresh, backFrom, go } from '../nav.js';
import { avatarHtml } from '../avatars.js';
import { isApk } from '../native.js';
import { qrSvg } from '../qr.js';
import { cloud, cloudSupport, syncNow } from '../cloud.js';
import { presenceOf } from '../presence.js';
import { resyncAll, friendTrainingCount, fullSyncAt } from '../gamesync.js';
import { fr, pendingRequests, requestFriend, answerRequest, removeFriend, mergeAsks, candidatesFor, decideMerge, undoMerge, undoableMerge } from '../friends.js';
import { friendUrl, agoText, cleanFriendCode } from '../../engine/cloud.js';

export const presetFriends = (state = {}) => { Object.assign(fr, { draft: '', busy: false, msg: '', bad: false, confirm: null, info: new Set(), pick: null }, state); };

const ibtn = key => `<button type="button" class="ibtn" data-act="fr-info" data-arg="${key}" aria-pressed="${fr.info.has(key)}" aria-label="Explication">${ico('info')}</button>`;
const ibox = (key, text) => (fr.info.has(key) ? `<p class="infobox" role="note">${text}</p>` : '');
const canScan = () => !isApk() && typeof globalThis.BarcodeDetector === 'function' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/** « vu il y a 2 h », ou la présence en direct (étape 6) : « en partie », « en ligne ». */
export const seenText = p => {
  const now = p && presenceOf(p.friend);
  if (now === 'jeu') return 'en partie';
  if (now === 'app') return 'en ligne';
  return p && p.seen ? `vu ${agoText(p.seen)}` : 'jamais vu en ligne';
};

/** Pastille de présence (carré plein : en partie ; carré vide : en ligne ; rien sinon). */
export function presenceDot(p) {
  const now = p && presenceOf(p.friend);
  return now ? `<span class="pdot ${now}" data-layer role="img" aria-label="${now === 'jeu' ? 'en partie' : 'en ligne'}"></span>` : '';
}

function friendRow(p) {
  const ask = fr.confirm === p.friend;
  return `<li class="frow"><a class="frmain" href="#/joueur/${esc(p.id)}"><span class="pav">${avatarHtml(p, 44)}${presenceDot(p)}</span><span class="main"><b class="nm ell">${esc(p.name)}</b><small>${esc(seenText(p))}</small></span></a>
    ${ask ? `<div class="btns two frconfirm"><button type="button" class="btn danger" data-act="fr-remove" data-arg="${esc(p.friend)}" ${fr.busy ? 'disabled' : ''}>RETIRER</button><button type="button" class="btn ghost" data-act="fr-confirm" data-arg="">GARDER</button></div>`
    : `<button type="button" class="btn ghost frbtn" data-act="fr-confirm" data-arg="${esc(p.friend)}" aria-label="Retirer ${esc(p.name)} de mes amis">RETIRER</button>`}</li>`;
}

function requestRow(r) {
  const who = `${avatarHtml({ name: r.name, avatar: r.avatar }, 44)}<span class="main"><b class="nm ell">${esc(r.name)}</b><small>${r.state === 'refusee' ? 'a refusé' : r.dir === 'recue' ? `te demande, ${esc(agoText(r.since))}` : `en attente, ${esc(agoText(r.since))}`}</small></span>`;
  const btns = r.dir === 'recue'
    ? `<div class="btns two"><button type="button" class="btn" data-act="fr-answer" data-arg="${esc(r.id)}:1" ${fr.busy ? 'disabled' : ''}>ACCEPTER</button><button type="button" class="btn ghost" data-act="fr-answer" data-arg="${esc(r.id)}:0" ${fr.busy ? 'disabled' : ''}>REFUSER</button></div>`
    : `<button type="button" class="btn ghost frbtn" data-act="fr-remove" data-arg="${esc(r.id)}" ${fr.busy ? 'disabled' : ''}>${r.state === 'refusee' ? 'EFFACER' : 'ANNULER'}</button>`;
  return `<li class="frow${r.dir === 'recue' ? ' frreq' : ''}"><div class="frmain">${who}</div>${btns}</li>`;
}

/** Bandeau « à rattacher » (écran Amis, Joueurs). */
export function mergeBanner() {
  const asks = mergeAsks();
  if (!asks.length) return '';
  return `<div class="frmerge" role="status">${asks.map(p => `<a class="lrow" href="#/amis/rattacher/${esc(p.friend)}">${avatarHtml(p, 36)}<span><b>Rattacher ${esc(p.name)}</b><small>Avait-il déjà un joueur sur ce téléphone ?</small></span>${ico('chev')}</a>`).join('')}</div>`;
}

const games = id => { const n = store.games.filter(g => g.config.players.includes(id)).length + store.ckGames.filter(g => g.config.players.includes(id)).length; return n; };

/** #/amis/rattacher/<uuid> : « Ce joueur de ta liste locale, c'est lui ? ». */
function mergeScreen(uuid) {
  const f = store.players.find(p => p.friend === uuid);
  const top = topBar('Rattacher', backFrom('#/amis'));
  if (!f) return `<div class="screen friends">${top}<div class="pad"><p class="note">Cet ami n'est plus dans ta liste.</p><a class="btn" href="#/amis">AMIS</a></div></div>`;
  if (!f.id.startsWith('u:')) return `<div class="screen friends">${top}<div class="pad"><p class="note">${esc(f.name)} est déjà rattaché à un joueur de ce téléphone.</p><a class="btn" href="#/joueur/${esc(f.id)}">SA FICHE</a></div></div>`;
  const { suggested, others } = candidatesFor(f);
  const pick = fr.pick && [...suggested, ...others].find(p => p.id === fr.pick);
  const rowOf = p => `<li class="frow"><button type="button" class="frmain frpick" data-act="fr-pick" data-arg="${esc(p.id)}" aria-pressed="${fr.pick === p.id}">${avatarHtml(p, 44)}<span class="main"><b class="nm ell">${esc(p.name)}</b><small>${p.archived ? 'archivé · ' : ''}${plural(games(p.id), 'partie', 'parties')}${trs(p.id) ? ` · ${plural(trs(p.id), 'séance', 'séances')}` : ''}</small></span></button></li>`;
  return `<div class="screen friends">${top}
    <div class="pad">
      <div class="frwho">${avatarHtml(f, 56)}<div><b class="nm">${esc(f.name)}</b><small>est dans tes amis. Un joueur de ce téléphone, c'était déjà cette personne ?</small></div></div>
      <p class="note">Choisis ce joueur : il devient ${esc(f.name)}, avec tout son historique d'ici (parties, séances, stats, badges), qui partira chez lui. Annulable tant que rien n'est parti en ligne.</p>
      ${suggested.length ? `<div class="sec">Pseudo proche</div><ul class="frlist">${suggested.map(rowOf).join('')}</ul>` : ''}
      ${others.length ? `<div class="sec">${suggested.length ? 'Autres joueurs du téléphone' : 'Joueurs du téléphone'}</div><ul class="frlist">${others.map(rowOf).join('')}</ul>` : ''}
      ${pick ? `<div class="confirm"><p><b>Ton joueur « ${esc(pick.name)} » est ton ami ${esc(f.name)} ?</b></p><p class="small dim">Il prend le pseudo et l'avatar de ton ami ; ses ${plural(games(pick.id), 'partie', 'parties')} d'ici lui sont rattachées.</p>
        <div class="btns two"><button type="button" class="btn" data-act="fr-pick" data-arg="">NON</button><button type="button" class="btn primary" data-act="fr-merge" data-arg="${esc(uuid)}">OUI, FUSIONNER</button></div></div>` : ''}
      <button type="button" class="btn ghost" data-act="fr-nomerge" data-arg="${esc(uuid)}">AUCUN DE CES JOUEURS</button>
    </div></div>`;
}
const trs = id => store.trainings.filter(r => r.player === id).length;

export function friendsScreen(arg = '') {
  const mm = /^rattacher\/([0-9a-f-]{36})$/.exec(arg || '');
  if (mm) return mergeScreen(mm[1]);
  const m = /^ajouter\/(.+)$/.exec(arg || '');
  if (m && !fr.draft && cleanFriendCode(m[1])) fr.draft = cleanFriendCode(m[1]);
  const sup = cloudSupport();
  const top = topBar('Amis', backFrom('#/joueurs'));
  if (!sup.ok) {
    return `<div class="screen friends">${top}<div class="pad"><p class="note">${esc(sup.why)}</p>
      ${sup.off ? '<a class="btn" href="#/reglages">RÉGLAGES › COMPTE ET AMIS</a>' : ''}</div></div>`;
  }
  const code = (store.cloudSync || {}).friendCode || '';
  const friends = friendPlayers().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const reqs = pendingRequests();
  const recv = reqs.filter(r => r.dir === 'recue' && r.state === 'attente');
  const sent = reqs.filter(r => r.dir === 'envoyee');
  const scanHelp = isApk()
    ? 'Pour scanner : ouvre l\'appareil photo du téléphone et vise le QR code de ton ami ; touche le lien, puis OUVRIR DANS L\'APPLI : Strela s\'ouvre ici, code rempli.'
    : 'Pour scanner sans l\'appli : l\'appareil photo du téléphone ouvre la page du QR code, qui ramène ici.';
  return `<div class="screen friends">${top}
    <div class="pad">
      ${mergeBanner()}
      ${(store.cloudSync || {}).tooNewCount ? '<p class="note red" role="status">Mets à jour Strela pour voir les parties de tes amis : certaines viennent d\'une version plus récente.</p>' : ''}
      ${recv.length ? `<div class="sec">Demandes reçues <span class="n">${recv.length}</span></div><ul class="frlist">${recv.map(requestRow).join('')}</ul>` : ''}
      <section class="card2"><h2>${ico('players')}<span>Mon code d'ami</span>${ibtn('code')}</h2>
        ${ibox('code', 'Ton ami tape ce code dans son écran Amis, ou scanne le QR code. Tu acceptes sa demande ici ; dès lors, tout est partagé entre vous deux : parties de soirée et en ligne, séances d\'entraînement, stats et badges. Une partie jouée sur un seul téléphone apparaît chez chaque ami qui y a joué.')}
        ${code ? `<div class="oncodebox"><div><b class="oncodebig" aria-label="Code ${esc(code.split('').join(' '))}">${esc(code)}</b>
          <button type="button" class="btn ghost" data-act="fr-share">PARTAGER</button></div>
          <div class="onqr">${qrSvg(friendUrl(code), { label: `QR code de mon code d'ami ${code}` })}</div></div>`
    : `<p class="note">${cloud.status === 'offline' ? 'Hors ligne : le code arrive avec le réseau.' : 'Le code arrive à la première synchronisation.'}</p>
          <button type="button" class="btn ghost" data-act="fr-sync" ${cloud.busy ? 'disabled' : ''}>SYNCHRONISER</button>`}
      </section>
      <section class="card2"><h2>${ico('plus')}<span>Ajouter un ami</span>${ibtn('ajout')}</h2>
        ${ibox('ajout', `Le code de ton ami (6 caractères), puis ENVOYER : il voit ta demande et l'accepte. ${scanHelp}`)}
        <label class="field"><input class="input frcode" data-input="fr-code" id="frcode" value="${esc(fr.draft)}" maxlength="20" placeholder="CODE" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="send" aria-label="Code d'ami (6 caractères)"></label>
        <div class="btns${canScan() ? ' two' : ''}"><button type="button" class="btn" data-act="fr-send" ${fr.busy ? 'disabled' : ''}>ENVOYER LA DEMANDE</button>${canScan() ? `<button type="button" class="btn ghost" data-act="fr-scan">${ico('camera')} SCANNER</button>` : ''}</div>
        ${fr.scanning ? '<div class="frscan"><video id="frvideo" playsinline muted></video><button type="button" class="btn ghost" data-act="fr-scan-stop">ARRÊTER</button></div>' : ''}
      </section>
      ${fr.msg ? `<div class="vibe${fr.bad ? ' bad' : ''}" role="status"><b>AMIS</b><span>${esc(fr.msg)}</span></div>` : ''}
      <div class="sec">Mes amis <span class="n">${friends.length}</span></div>
      ${friends.length ? `<ul class="frlist">${friends.map(friendRow).join('')}</ul>` : '<p class="note">Pas encore d\'ami : donne ton code, ou tape celui d\'un ami.</p>'}
      ${sent.length ? `<div class="sec">Demandes envoyées <span class="n">${sent.length}</span></div><ul class="frlist">${sent.map(requestRow).join('')}</ul>` : ''}
      <p class="note">${plural(friends.length, 'ami', 'amis')} · synchronisé ${esc(agoText((store.cloudSync || {}).lastSync))}. Retirer un ami coupe le lien ; vos parties communes restent dans l'historique de chacun.</p>
    </div></div>`;
}

let scan = null;
function stopScan() {
  if (scan) { scan.stop = true; try { scan.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* */ } }
  scan = null; fr.scanning = false;
}
async function startScan() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    fr.scanning = true; refresh();
    const det = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
    const video = document.getElementById('frvideo');
    if (!video) { stream.getTracks().forEach(t => t.stop()); fr.scanning = false; return; }
    video.srcObject = stream;
    await video.play();
    scan = { stream, stop: false };
    const me = scan;
    const tick = async () => {
      if (me.stop) return;
      try {
        const found = await det.detect(video);
        const raw = found && found[0] && found[0].rawValue;
        const code = raw && cleanFriendCode((/#([A-Za-z0-9]{6})$/.exec(raw) || [])[1] || raw);
        if (code) { stopScan(); fr.draft = code; refresh(); requestFriend(code); return; }
      } catch (e) { /* image pas prête */ }
      setTimeout(tick, 250);
    };
    tick();
  } catch (e) {
    stopScan();
    fr.msg = 'Appareil photo indisponible : tape le code de ton ami.'; fr.bad = true; refresh();
  }
}

export const inputs = {
  'fr-code'(v, el) {
    const up = v.toUpperCase();
    const fromLink = /rejoindre\.html#([A-Za-z0-9]{6})/.exec(v);
    fr.draft = fromLink ? fromLink[1].toUpperCase() : up;
    if (el && el.value !== fr.draft) { const p = el.selectionStart; el.value = fr.draft; try { el.setSelectionRange(p, p); } catch (e) { /* */ } }
  },
};

export const actions = {
  'fr-info'(k) { if (fr.info.has(k)) fr.info.delete(k); else fr.info.add(k); refresh(); },
  'fr-send'() { requestFriend(fr.draft || (document.getElementById('frcode') || {}).value || ''); },
  async 'fr-answer'(arg) {
    const [id, yes] = String(arg).split(':');
    const ok = await answerRequest(id, yes === '1');
    // Étape 3 : un nouvel ami qui avait peut-être déjà un joueur sur ce téléphone.
    if (ok && yes === '1' && mergeAsks().some(p => p.friend === id)) { fr.pick = null; go(`#/amis/rattacher/${id}`); }
  },
  'fr-pick'(id) { fr.pick = id || null; refresh(); },
  'fr-merge'(uuid) {
    const r = decideMerge(uuid, fr.pick);
    fr.pick = null; fr.msg = r.msg; fr.bad = !r.ok;
    const p = store.players.find(q => q.friend === uuid);
    go(p ? `#/joueur/${p.id}` : '#/amis', { replace: true });
  },
  'fr-nomerge'(uuid) { const r = decideMerge(uuid, null); fr.pick = null; fr.msg = r.msg; fr.bad = false; go('#/amis', { replace: true }); },
  'fr-unmerge'(uuid) { const r = undoMerge(uuid); fr.msg = r.msg; fr.bad = !r.ok; const p = store.players.find(q => q.friend === uuid); go(p ? `#/joueur/${p.id}` : '#/amis', { replace: true }); },
  'fr-confirm'(id) { fr.confirm = id || null; refresh(); },
  async 'fr-remove'(id) {
    fr.confirm = null;
    const onSheet = /^#\/joueur\//.test(location.hash); // fiche de l'ami : il n'en est plus un, retour à l'écran Amis
    if (await removeFriend(id) && onSheet) go('#/amis', { replace: true });
  },
  async 'fr-sync'() { const p = syncNow('amis'); refresh(); await p; refresh(); },
  async 'fr-resync'() {
    resyncAll();
    const p = syncNow('resynchronisation'); refresh();
    const ok = await p;
    fr.msg = ok ? 'Tout est repris : ce qui est en ligne est ici, sans doublon.' : `Pas resynchronisé : ${cloud.error || 'pas de réseau'}. Ça reprendra à la prochaine synchronisation.`;
    fr.bad = !ok;
    refresh();
  },
  'fr-scan'() { startScan(); },
  'fr-scan-stop'() { stopScan(); refresh(); },
  async 'fr-share'() {
    const code = (store.cloudSync || {}).friendCode;
    if (!code) return;
    const url = friendUrl(code);
    const text = `Ajoute-moi en ami dans Strela : code ${code}`;
    try { if (navigator.share) { await navigator.share({ title: 'Strela, ami', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text} — ${url}`); fr.msg = 'Lien copié.'; fr.bad = false; } catch (e) { fr.msg = url; }
    refresh();
  },
};

/**
 * Bloc « Ami » du profil d'un ami (0.24.0 ; avant : sa fiche) : ce qui vient de son téléphone, ses jeux, rattacher un
 * joueur local, annuler une fusion, RETIRER.
 */
/** 0.24.1 (lot 9.6 A) : où en est la synchronisation avec cet ami, et RESYNCHRONISER (tout renvoyer, tout recevoir). */
function friendSyncHtml(p) {
  const cs = store.cloudSync || {};
  const nTr = friendTrainingCount(p);
  const nGames = [...store.games, ...store.ckGames, ...store.friendGames].filter(g => g.owner === p.friend).length;
  const full = fullSyncAt();
  return `<div class="sec">Synchronisation</div>
      <ul class="pline frsync">
        <li>${ico('phone')}<span>Ce téléphone</span><small data-k="last">synchronisé ${esc(agoText(cs.lastSync))}</small></li>
        <li>${ico('sync')}<span>Son téléphone</span><small data-k="seen">${esc(p.seen ? `vu ${agoText(p.seen)}` : 'jamais vu en ligne')}</small></li>
        <li>${ico('target')}<span>Séances reçues</span><small data-k="trainings">${nTr}</small></li>
        <li>${ico('history')}<span>Parties reçues</span><small data-k="games">${nGames}</small></li>
      </ul>
      <p class="note">Une séance part de son téléphone dès qu'elle est finie, appli ouverte et réseau présent ; elle arrive ici à ta prochaine synchronisation.${full ? ` Dernière reprise complète : ${esc(agoText(full))}.` : ''}</p>
      <button type="button" class="btn ghost" data-act="fr-resync" ${cloud.busy ? 'disabled' : ''}>${ico('sync')}RESYNCHRONISER</button>`;
}

export function friendBlock(p) {
  const ask = fr.confirm === p.friend;
  const sets = Array.isArray(p.sets) ? p.sets.filter(s => s && !s.archived && typeof s.name === 'string') : [];
  return `<div class="sec">Ami</div>
      <p class="note">Pseudo, avatar, animation de tour et jeux de fléchettes viennent de son téléphone : lui seul les change. Il s'ajoute à une partie comme n'importe quel joueur. Ses stats comptent ses parties avec toi et celles jouées chez lui.</p>
      ${p.id.startsWith('u:') ? `<a class="lrow" href="#/amis/rattacher/${esc(p.friend)}">${ico('players')}<span><b>Rattacher un joueur local</b><small>S'il avait déjà un joueur sur ce téléphone</small></span>${ico('chev')}</a>` : ''}
      ${undoableMerge(p.friend) ? `<div class="vibe" role="status"><b>FUSIONNÉ</b><span>Avec ton joueur local « ${esc(undoableMerge(p.friend).prev.name)} ». Rien n'est encore parti en ligne : la fusion s'annule.</span></div>
        <button type="button" class="btn ghost" data-act="fr-unmerge" data-arg="${esc(p.friend)}">ANNULER LA FUSION</button>` : ''}
      ${friendSyncHtml(p)}
      ${sets.length ? `<div class="sec">Ses jeux de fléchettes <span class="n">${sets.length}</span></div><ul class="frlist">${sets.map(s => `<li class="frow"><span class="main"><b class="ell">${esc(s.name)}</b>${Number.isFinite(s.weight) ? `<small>${esc(s.weight)} g</small>` : ''}</span></li>`).join('')}</ul>` : ''}
      ${fr.msg ? `<div class="vibe${fr.bad ? ' bad' : ''}" role="status"><b>AMIS</b><span>${esc(fr.msg)}</span></div>` : ''}
      ${ask ? `<div class="confirm"><p><b>Retirer ${esc(p.name)} de tes amis ?</b></p><p class="small dim">Le lien est coupé dans les deux sens ; vos parties communes restent dans l'historique de chacun. Il redevient un joueur de ce téléphone.</p>
        <div class="btns two"><button type="button" class="btn" data-act="fr-confirm" data-arg="">GARDER</button><button type="button" class="btn alert" data-act="fr-remove" data-arg="${esc(p.friend)}" ${fr.busy ? 'disabled' : ''}>RETIRER</button></div></div>`
    : `<button type="button" class="btn ghost" data-act="fr-confirm" data-arg="${esc(p.friend)}">RETIRER DE MES AMIS</button>`}`;
}
