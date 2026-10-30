// Joueurs : liste (avatar, pseudo, chiffres clés), fiche création / modification, banque d'avatars.
// Archiver : le joueur n'est plus proposé, ses stats restent ; RÉACTIVER (liste ou fiche) le remet. Supprimer : il
// disparaît avec ses stats ; ses parties avec d'autres restent, où il devient « Joueur supprimé » (src/engine/players.js).
// Photo : appareil photo ou galerie (sélecteur d'images d'Android), puis recadrage carré (screens/photo.js).
import { store, newId, inCurrentGame, deletionPreview, deletePlayer, savePlayer, setArchived } from '../store.js';
import { esc, ico, topBar, avg, plural } from '../dom.js';
import { avatarHtml, iconSvg, ICONS, ICON_KEYS, AVATAR_COLOR_NAMES } from '../avatars.js';
import { playerStats } from '../../engine/stats.js';
import { checkoutPrefs, suggestCheckout } from '../../engine/checkout.js';
import { formatDart } from '../../engine/darts.js';
import { go, goBackTo, refresh } from '../nav.js';

export const NAME_MAX = 40;

function row(p) {
  const st = playerStats(store.games, p.id);
  const sub = st.played
    ? `moyenne ${avg(st.average)}<br>${plural(st.played, 'partie', 'parties')} · ${plural(st.won, 'victoire', 'victoires')}`
    : 'aucune partie';
  return `<a class="item${p.archived ? ' archived' : ''}" href="#/joueur/${esc(p.id)}">
    ${avatarHtml(p, 52)}
    <span class="main"><span class="name nm ell">${esc(p.name)}</span><span class="sub">${sub}</span></span>
    <span class="chev">${ico('chev')}</span></a>`;
}

export function playersList() {
  const active = store.players.filter(p => !p.archived);
  const archived = store.players.filter(p => p.archived);
  const add = `<a class="act" href="#/joueur/nouveau" aria-label="Nouveau joueur">${ico('plus')}</a>`;
  if (!store.players.length) {
    return `<div class="screen">${topBar('Joueurs', '#/', add)}
      <div class="empty"><div class="glyph">${iconSvg('cible')}</div><div class="big">AUCUN JOUEUR</div>
      <p>Crée les joueurs une fois : pseudo et avatar sont gardés d'une partie à l'autre.</p>
      <a class="btn primary" href="#/joueur/nouveau">${ico('plus')} NOUVEAU JOUEUR</a></div></div>`;
  }
  return `<div class="screen">${topBar('Joueurs', '#/', add)}
    <ul class="list">${active.map(p => `<li>${row(p)}</li>`).join('')}</ul>
    <div class="pad" style="margin-top:16px"><a class="btn" href="#/joueur/nouveau">${ico('plus')} NOUVEAU JOUEUR</a></div>
    ${archived.length ? `<div class="pad"><div class="sec">Archivés <span class="n">${archived.length}</span></div></div>
      <ul class="list">${archived.map(p => `<li class="arow">${row(p)}<button type="button" class="btn ghost react" data-act="unarchive-row" data-arg="${esc(p.id)}">RÉACTIVER</button></li>`).join('')}</ul>
      <p class="note pad">Un joueur archivé n'apparaît plus au lancement d'une partie ; ses parties et ses stats restent. RÉACTIVER le remet dans la liste.</p>` : ''}
  </div>`;
}

// ------------------------------------------------------------------ fiche
export function openDraft(id) {
  if (store.draft && store.draft.forId === id) return store.draft;
  const p = id === 'nouveau' ? null : store.players.find(q => q.id === id);
  const usedColors = store.players.map(q => q.avatar && q.avatar.color);
  const freeColor = [0, 1, 2, 3, 4, 5, 6, 7].find(c => !usedColors.includes(c)) ?? 0;
  store.draft = {
    forId: id,
    id: p ? p.id : null,
    name: p ? p.name : '',
    avatar: p ? { ...p.avatar } : { kind: 'initials', color: freeColor },
    archived: p ? !!p.archived : false,
    checkout: checkoutPrefs(p && p.checkout), // finition conseillée en jeu (lot 4)
    confirm: false,
    del: null, // null | 'ask' (confirmation) | 'refused' (joueur de la partie en cours)
    photoError: '', // photo trop lourde ou illisible
    error: '',
  };
  return store.draft;
}

const previewHtml = d => {
  const shown = { name: d.name || '?', avatar: d.avatar };
  return `${avatarHtml(shown, 96)}<div class="who"><b class="nm">${esc(d.name || 'Pseudo')}</b>
    <small>${d.avatar.kind === 'icon' ? esc(ICONS[d.avatar.icon]?.[0] || '') : d.avatar.kind === 'photo' ? 'PHOTO' : 'INITIALES'} · FOND ${AVATAR_COLOR_NAMES[d.avatar.color]}</small>
    <div class="mini">${avatarHtml(shown, 56)}${avatarHtml(shown, 40)}${avatarHtml(shown, 28)}</div></div>`;
};

export function playerForm(id) {
  if (id !== 'nouveau' && !store.players.some(p => p.id === id)) { go('#/joueurs', { replace: true }); return ''; }
  const d = openDraft(id);
  if (d.del === 'refused' && !inCurrentGame(d.id)) d.del = null; // la partie est finie depuis le refus
  const kind = d.avatar.kind === 'icon' && !d.avatar.icon ? 'initials' : d.avatar.kind;
  const segBtn = (k, label) => `<button type="button" data-act="avkind" data-arg="${k}" aria-pressed="${kind === k}">${label}</button>`;
  let source = '';
  if (kind === 'icon') {
    source = `<button type="button" class="btn pickicon" data-act="open-bank">${avatarHtml({ avatar: d.avatar }, 48)}<span class="grow">${esc(ICONS[d.avatar.icon]?.[0] || 'CHOISIR')}</span><small>CHANGER</small>${ico('chev')}</button>`;
  } else if (kind === 'photo') {
    // Deux sélecteurs d'images d'Android : l'appareil photo (capture) et la galerie. Le fichier choisi part au recadrage.
    const has = !!d.avatar.photo;
    source = `<div class="photo-row"><label class="btn ghost">${ico('camera')} PHOTO<input type="file" accept="image/*" capture="user" data-file="camera" hidden></label>
      <label class="btn ghost">${ico('image')} GALERIE<input type="file" accept="image/*" data-file="gallery" hidden></label></div>
      ${d.photoBusy ? '<p class="note" role="status">Chargement de la photo…</p>' : ''}
      ${d.photoError ? `<p class="note red" role="alert">${esc(d.photoError)}</p>` : ''}
      <p class="note">${has ? 'Photo recadrée au carré. Une autre photo la remplace.' : 'Prends une photo ou choisis-en une : tu la recadreras au carré. En attendant, l\'avatar garde les initiales.'}</p>`;
  } else {
    source = '<p class="note">Les deux premières lettres du pseudo, sur le fond choisi.</p>';
  }
  const isNew = !d.id;
  const archiveBlock = isNew || d.del ? '' : d.archived
    ? `<button type="button" class="btn" data-act="unarchive">RÉACTIVER LE JOUEUR</button>`
    : d.confirm
      ? `<div class="confirm"><p><b>Archiver ${esc(d.name)} ?</b></p><p class="small dim">Il n'apparaîtra plus au lancement d'une partie. Ses parties et ses stats sont gardées ; on peut le réactiver à tout moment.</p>
         <div class="btns two"><button type="button" class="btn" data-act="archive-no">NON</button><button type="button" class="btn alert" data-act="archive-yes">ARCHIVER</button></div></div>`
      : `<button type="button" class="btn ghost" data-act="archive">ARCHIVER</button><p class="note">Archiver garde ses parties et ses stats ; on peut le réactiver.</p>`;
  const deleteBlock = isNew || d.confirm ? '' : deleteHtml(d);

  return `<div class="screen has-dock">${topBar(isNew ? 'Nouveau joueur' : 'Modifier le joueur', '#/joueurs')}
    <div class="preview" id="preview">${previewHtml(d)}</div>
    <div class="pad">
      <div class="sec">Pseudo</div>
      <label class="field"><input class="input nm" id="name" data-input="name" value="${esc(d.name)}" maxlength="${NAME_MAX}" placeholder="PSEUDO" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done"></label>
      ${d.error ? `<p class="note red">${esc(d.error)}</p>` : ''}
      <div class="sec">Avatar</div>
      <div class="seg">${segBtn('initials', 'Initiales')}${segBtn('icon', 'Icône')}${segBtn('photo', 'Photo')}</div>
      <div style="margin-top:10px">${source}</div>
      <div class="sec">Fond</div>
      <div class="swatches">${AVATAR_COLOR_NAMES.map((n, i) => `<button type="button" class="swatch" style="background:var(--av-${i})" data-act="avcolor" data-arg="${i}" aria-pressed="${d.avatar.color === i}" aria-label="${n}">${n}</button>`).join('')}</div>
      <div class="sec">Finition</div>
      ${finishHtml(d)}
      ${archiveBlock || deleteBlock ? `<div class="sec">Archiver ou supprimer</div><div class="btns">${archiveBlock}${deleteBlock}</div>` : ''}
    </div>
    <div class="dock" data-layer><button type="button" class="btn primary" data-act="save-player">${isNew ? 'CRÉER LE JOUEUR' : 'ENREGISTRER'}</button></div>
  </div>`;
}

// Doubles proposés (les plus joués d'abord) ; les autres restent possibles par la sauvegarde, sans intérêt ici.
export const FINISH_DOUBLES = [20, 16, 8, 18, 12, 10, 14, 6, 4, 2];

/** Préférences de finition (lot 4) : double préféré, éviter le bull, et des exemples de ce que le jeu conseillera. */
function finishHtml(d) {
  const c = d.checkout;
  const ex = [41, 50, 76, 110].map(r => {
    const route = suggestCheckout(r, 'double', 3, c);
    return `<span class="ex"><b>${r}</b> ${route ? route.map(formatDart).join(' ') : '—'}</span>`;
  }).join('');
  return `<p class="small dim" style="margin:0 0 8px">Double préféré pour finir</p>
    <div class="dgrid" role="group" aria-label="Double préféré">${FINISH_DOUBLES.map(n => `<button type="button" data-act="fin-double" data-arg="${n}" aria-pressed="${c.double === n}">D${n}</button>`).join('')}</div>
    <div class="row"><div class="lbl"><b>Éviter le bull</b><small>Pas de 25 ni de 50 quand une autre finition tient dans la volée.</small></div>
      <div class="toggle"><button type="button" data-act="fin-bull" data-arg="1" aria-pressed="${c.avoidBull}">OUI</button><button type="button" data-act="fin-bull" data-arg="0" aria-pressed="${!c.avoidBull}">NON</button></div></div>
    <p class="note">En jeu, la finition conseillée en tient compte. Exemples (sortie double) :</p>
    <div class="fin-ex">${ex}</div>`;
}

/** SUPPRIMER, sa confirmation (conséquences chiffrées) ou le refus pendant une partie. */
function deleteHtml(d) {
  const name = esc(d.name);
  // La confirmation s'ouvre en bas de la fiche : on l'amène à l'écran une fois (data-reveal, lu par app.js).
  const reveal = d.reveal ? ' data-reveal' : '';
  d.reveal = false;
  if (d.del === 'refused') {
    return `<div class="confirm" role="alert"${reveal}><p class="alert-h">SUPPRESSION IMPOSSIBLE</p>
      <p><b class="nm">${name}</b> joue la partie en cours. Finis ou abandonne la partie d'abord, puis reviens ici.</p>
      <div class="btns two"><button type="button" class="btn" data-act="delete-no">FERMER</button><a class="btn primary" href="#/jeu">ALLER À LA PARTIE</a></div></div>`;
  }
  if (d.del === 'ask') {
    const { kept, removed } = deletionPreview(d.id);
    return `<div class="confirm" role="alert"${reveal}><p class="alert-h">SUPPRIMER ${name.toUpperCase()} ?</p>
      <ul class="cons">
        <li>Sa fiche et <b>toutes ses statistiques</b> disparaissent. C'est définitif.</li>
        <li>${kept.length ? `Ses <b>${plural(kept.length, 'partie', 'parties')}</b> avec d'autres joueurs restent dans l'historique : il y apparaît comme « Joueur supprimé ».` : 'Aucune partie avec d\'autres joueurs.'}</li>
        <li>${removed.length ? `Ses <b>${plural(removed.length, 'partie jouée', 'parties jouées')} seul</b> ${removed.length > 1 ? 'sont effacées' : 'est effacée'}.` : 'Aucune partie jouée seul.'}</li>
        <li>Les statistiques des autres ne changent pas ; il n'apparaît plus dans leurs face-à-face.</li>
      </ul>
      <p class="small dim">Pour seulement le retirer des nouvelles parties, archive-le plutôt.</p>
      <div class="btns two"><button type="button" class="btn" data-act="delete-no">NON</button><button type="button" class="btn alert" data-act="delete-yes">SUPPRIMER</button></div></div>`;
  }
  return '<button type="button" class="btn danger" data-act="delete">SUPPRIMER LE JOUEUR</button>';
}

// ------------------------------------------------------------------ banque d'avatars
export function avatarBank() {
  const d = store.draft || { name: 'Exemple', avatar: { kind: 'icon', icon: 'flechette', color: 0 }, forId: null };
  const back = d.forId ? `#/joueur/${d.forId}` : '#/';
  const color = d.avatar.color ?? 0;
  const cur = d.avatar.kind === 'icon' ? d.avatar.icon : null;
  return `<div class="screen">${topBar('Banque d\'avatars', back)}
    <div class="preview">${avatarHtml({ avatar: { kind: 'icon', icon: cur || 'flechette', color } }, 96)}
      <div class="who"><b>${esc(cur ? ICONS[cur][0] : 'CHOISIS UNE ICÔNE')}</b><small>24 pictogrammes dessinés pour Strela · fond ${AVATAR_COLOR_NAMES[color]}</small>
      <div class="mini">${avatarHtml({ avatar: { kind: 'icon', icon: cur || 'flechette', color } }, 40)}</div></div></div>
    <div class="pad" style="margin-top:14px">
      <div class="bank">${ICON_KEYS.map(k => `<button type="button" data-act="pick-icon" data-arg="${k}" aria-pressed="${k === cur}">
        ${avatarHtml({ avatar: { kind: 'icon', icon: k, color } }, 56)}<i>${esc(ICONS[k][0])}</i></button>`).join('')}</div>
      <p class="note">Touchez une icône pour la choisir. Le fond se règle sur la fiche du joueur.</p>
    </div></div>`;
}

export const actions = {
  avkind(kind) {
    const d = store.draft;
    d.avatar.kind = kind;
    if (kind === 'icon' && !d.avatar.icon) { go('#/avatars'); return; }
    refresh();
  },
  avcolor(i) { store.draft.avatar.color = Number(i); refresh(); },
  'fin-double'(n) { store.draft.checkout = checkoutPrefs({ ...store.draft.checkout, double: Number(n) }); refresh(); },
  'fin-bull'(v) { store.draft.checkout = checkoutPrefs({ ...store.draft.checkout, avoidBull: v === '1' }); refresh(); },
  'open-bank'() { go('#/avatars'); },
  'pick-icon'(key) {
    const d = store.draft;
    if (!d) return;
    d.avatar.kind = 'icon';
    d.avatar.icon = key;
    if (d.forId) goBackTo(`#/joueur/${d.forId}`); else refresh();
  },
  archive() { store.draft.confirm = true; store.draft.del = null; refresh(); },
  delete() { const d = store.draft; d.del = inCurrentGame(d.id) ? 'refused' : 'ask'; d.reveal = true; refresh(); },
  'delete-no'() { store.draft.del = null; refresh(); },
  'delete-yes'() {
    const d = store.draft;
    if (!deletePlayer(d.id)) { d.del = 'refused'; d.reveal = true; refresh(); return; }
    store.draft = null;
    go('#/joueurs');
  },
  'archive-no'() { store.draft.confirm = false; refresh(); },
  'archive-yes'() {
    setArchived(store.draft.id, true);
    store.draft = null;
    go('#/joueurs');
  },
  unarchive() {
    setArchived(store.draft.id, false);
    store.draft.archived = false;
    refresh();
  },
  'unarchive-row'(id) { setArchived(id, false); refresh(); },
  'save-player'() {
    const d = store.draft;
    const name = d.name.trim().replace(/\s+/g, ' ');
    if (!name) { d.error = 'Il faut un pseudo.'; refresh(); document.getElementById('name')?.focus(); return; }
    if (store.players.some(p => p.id !== d.id && p.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) {
      d.error = 'Ce pseudo existe déjà.'; refresh(); return;
    }
    const avatar = { ...d.avatar };
    if (avatar.kind === 'photo' && !avatar.photo) avatar.kind = 'initials'; // pas encore de photo : les initiales
    if (avatar.kind !== 'photo') delete avatar.photo;
    const old = d.id && store.players.find(p => p.id === d.id);
    const checkout = checkoutPrefs(d.checkout);
    savePlayer(old ? { ...old, name, avatar, checkout } : { id: newId('p'), name, avatar, archived: false, checkout });
    store.draft = null;
    go('#/joueurs');
  },
};

export const inputs = {
  name(value) {
    const d = store.draft;
    if (!d) return;
    d.name = value;
    d.error = '';
    const el = document.getElementById('preview');
    if (el) el.innerHTML = previewHtml(d);
  },
};
