// Joueurs : liste (avatar, pseudo, chiffres clés), fiche création / modification, banque d'avatars.
// Les joueurs sont archivés, jamais supprimés (leurs statistiques restent).
import { store, newId } from '../store.js';
import { esc, ico, topBar, avg, plural } from '../dom.js';
import { avatarHtml, iconSvg, ICONS, ICON_KEYS, AVATAR_COLOR_NAMES } from '../avatars.js';
import { playerStats } from '../../engine/stats.js';
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
      <ul class="list">${archived.map(p => `<li>${row(p)}</li>`).join('')}</ul>
      <p class="note pad">Un joueur archivé n'apparaît plus au lancement d'une partie ; ses parties et ses stats restent.</p>` : ''}
  </div>`;
}

// ------------------------------------------------------------------ fiche
function openDraft(id) {
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
    confirm: false,
    photoNote: false,
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
  const kind = d.avatar.kind === 'icon' && !d.avatar.icon ? 'initials' : d.avatar.kind;
  const segBtn = (k, label) => `<button type="button" data-act="avkind" data-arg="${k}" aria-pressed="${kind === k}">${label}</button>`;
  let source = '';
  if (kind === 'icon') {
    source = `<button type="button" class="btn pickicon" data-act="open-bank">${avatarHtml({ avatar: d.avatar }, 48)}<span class="grow">${esc(ICONS[d.avatar.icon]?.[0] || 'CHOISIR')}</span><small>CHANGER</small>${ico('chev')}</button>`;
  } else if (kind === 'photo') {
    source = `<div class="photo-row"><button type="button" class="btn ghost" data-act="photo">${ico('camera')} PHOTO</button>
      <button type="button" class="btn ghost" data-act="photo">${ico('image')} GALERIE</button></div>
      <p class="note">${d.photoNote ? '<b>Maquette :</b> la prise de photo et la galerie arrivent au lot 2 (recadrage au carré). ' : ''}En attendant, l'avatar garde les initiales.</p>`;
  } else {
    source = '<p class="note">Les deux premières lettres du pseudo, sur le fond choisi.</p>';
  }
  const isNew = !d.id;
  const archiveBlock = isNew ? '' : d.archived
    ? `<button type="button" class="btn" data-act="unarchive">RÉACTIVER LE JOUEUR</button>`
    : d.confirm
      ? `<div class="confirm"><p><b>Archiver ${esc(d.name)} ?</b></p><p class="small dim">Il n'apparaîtra plus au lancement d'une partie. Ses parties et ses stats sont gardées ; on peut le réactiver à tout moment.</p>
         <div class="btns two"><button type="button" class="btn" data-act="archive-no">NON</button><button type="button" class="btn alert" data-act="archive-yes">ARCHIVER</button></div></div>`
      : `<button type="button" class="btn ghost" data-act="archive">ARCHIVER</button><p class="note">Un joueur n'est jamais supprimé : ses statistiques restent.</p>`;

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
      ${archiveBlock ? `<div class="sec">Archivage</div><div class="btns">${archiveBlock}</div>` : ''}
    </div>
    <div class="dock"><button type="button" class="btn primary" data-act="save-player">${isNew ? 'CRÉER LE JOUEUR' : 'ENREGISTRER'}</button></div>
  </div>`;
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
  'open-bank'() { go('#/avatars'); },
  photo() { store.draft.photoNote = true; refresh(); },
  'pick-icon'(key) {
    const d = store.draft;
    if (!d) return;
    d.avatar.kind = 'icon';
    d.avatar.icon = key;
    if (d.forId) goBackTo(`#/joueur/${d.forId}`); else refresh();
  },
  archive() { store.draft.confirm = true; refresh(); },
  'archive-no'() { store.draft.confirm = false; refresh(); },
  'archive-yes'() {
    const p = store.players.find(q => q.id === store.draft.id);
    if (p) p.archived = true;
    store.draft = null;
    go('#/joueurs');
  },
  unarchive() {
    const p = store.players.find(q => q.id === store.draft.id);
    if (p) p.archived = false;
    store.draft.archived = false;
    refresh();
  },
  'save-player'() {
    const d = store.draft;
    const name = d.name.trim().replace(/\s+/g, ' ');
    if (!name) { d.error = 'Il faut un pseudo.'; refresh(); document.getElementById('name')?.focus(); return; }
    if (store.players.some(p => p.id !== d.id && p.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) {
      d.error = 'Ce pseudo existe déjà.'; refresh(); return;
    }
    const avatar = { ...d.avatar };
    if (avatar.kind === 'photo') avatar.kind = 'initials';
    if (d.id) Object.assign(store.players.find(p => p.id === d.id), { name, avatar });
    else store.players.push({ id: newId('p'), name, avatar, skill: 0.3 });
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
