// Strela — première ouverture (lot 8 du 23/11/2026, 6.2, 6.3, 9.2) :
//   #/bienvenue[/<étape>]  mise en place guidée : modes, nom, avatar, jeu de fléchettes, fin ; chaque étape se passe
//                          (PASSER) ; tant qu'elle n'est pas finie, l'accueil garde la carte « Terminer la mise en place ».
//   #/tutoriel             quelques pages à faire défiler, les grands écrans et les grandes fonctions ; rouvrable depuis
//                          les Réglages (À propos) ; les détails restent derrière les (i) de chaque écran.
//   #/installer            installer Strela sur un autre téléphone : lien stable, version, mode d'emploi en images
//                          (le même que la page web installer.html, src/ui/installguide.js).
import { store, appModes, setMode, saveSetup, saveProfile, profilePlayer, saveTrSetup } from '../store.js';
import { esc, ico, topBar } from '../dom.js';
import { refresh, go, backFrom } from '../nav.js';
import { avatarHtml, ICON_GROUPS, AVATAR_COUNT } from '../avatars.js';
import { dartDiagram } from './advice.js';
import { dartSetSummary } from '../../engine/dartsets.js';
import { installGuideHtml, INSTALL_PAGE } from '../installguide.js';
import { BUILD } from '../build.js';

export const STEPS = Object.freeze(['modes', 'nom', 'avatar', 'jeu', 'fin']);
const LABELS = { modes: 'Modes', nom: 'Ton nom', avatar: 'Ton avatar', jeu: 'Tes fléchettes', fin: 'C\'est prêt' };
let draftName = null;

function stepBar(step) {
  const i = STEPS.indexOf(step);
  return `<ol class="wsteps" aria-label="Étapes">${STEPS.map((k, j) => `<li class="${j < i ? 'done' : j === i ? 'cur' : ''}"><i></i><span>${LABELS[k]}</span></li>`).join('')}</ol>`;
}
const nav = (step, { next = true, skip = true } = {}) => {
  const i = STEPS.indexOf(step);
  const to = STEPS[i + 1];
  return `<div class="btns two wnav">${skip && to ? `<a class="btn ghost" href="#/bienvenue/${to}">PASSER</a>` : '<span></span>'}${next && to ? `<button type="button" class="btn primary" data-act="setup-next" data-arg="${step}">SUIVANT</button>` : ''}</div>`;
};

export function welcomeScreen(step = 'modes') {
  if (!STEPS.includes(step)) step = 'modes';
  if (!store.maquette) saveSetupStarted(step);
  const me = profilePlayer();
  let body;
  if (step === 'modes') {
    const m = appModes();
    const sw = (k, on, label, sub) => `<button type="button" class="modepick" data-act="${k === 'train' ? 'mode-train' : 'mode-soiree'}" data-arg="${on ? 0 : 1}" aria-pressed="${on}">${ico(k === 'train' ? 'sniper' : 'glass')}<span><b>${label}</b><small>${sub}</small></span><i class="tick">${on ? ico('check') : ''}</i></button>`;
    body = `<h2 class="wtitle">Comment veux-tu te servir de Strela ?</h2>
      <p class="note">Un mode au moins ; ça se change à tout moment (Réglages › Modes de l'application), sans rien perdre.</p>
      <div class="modepicks">${sw('train', m.train, 'Entraînement', 'Seul : exercices, jeux de cible, stats, badges')}${sw('soiree', m.soiree, 'Soirée', 'À plusieurs : X01, Cricket, joueurs, verres, classement')}</div>${nav(step)}`;
  } else if (step === 'nom') {
    const v = draftName ?? (me ? me.name : '');
    body = `<h2 class="wtitle">Ton nom</h2><p class="note">Tes séances d'entraînement sont notées à ce nom (en soirée, c'est ton pseudo de joueur).</p>
      <label class="field"><input class="input nm" id="wname" data-input="setup-name" value="${esc(v)}" maxlength="24" placeholder="TON NOM" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done"></label>${nav(step)}`;
  } else if (step === 'avatar') {
    const cur = me && me.avatar && me.avatar.kind === 'icon' ? me.avatar.icon : null;
    const color = me && me.avatar ? me.avatar.color || 0 : 0;
    const icons = ICON_GROUPS.flatMap(g => g.keys).slice(0, 24);
    body = `<h2 class="wtitle">Ton avatar</h2><p class="note">Une icône sur un fond de couleur ; une photo se met dans ta fiche (Réglages › Profil).</p>
      ${me ? `<div class="wme">${avatarHtml(me, 56)}<b class="nm">${esc(me.name)}</b></div>` : ''}
      <div class="wicons">${icons.map(k => `<button type="button" class="wic" data-act="setup-icon" data-arg="${k}" aria-pressed="${cur === k}">${avatarHtml({ name: '', avatar: { kind: 'icon', icon: k, color } }, 44)}</button>`).join('')}</div>
      <div class="wcolors">${Array.from({ length: AVATAR_COUNT }, (_, c) => `<button type="button" class="wcol" data-act="setup-color" data-arg="${c}" aria-pressed="${color === c}" aria-label="Fond ${c + 1}"><i style="background:var(--av-${c})"></i></button>`).join('')}</div>${nav(step)}`;
  } else if (step === 'jeu') {
    const sel = store.trSetup && store.trSetup.setId;
    const sets = store.dartSets.filter(x => !x.archived);
    body = `<h2 class="wtitle">Tes fléchettes</h2><p class="note">Le jeu choisi est noté avec chaque séance, pour comparer tes jeux dans les stats. Choisis-en un, ou crée le tien (poids, fût, empennage) d'après un modèle.</p>
      <div class="setcards">${sets.map(x => `<button type="button" class="setc" data-act="setup-set" data-arg="${esc(x.id)}" aria-pressed="${sel === x.id}"><span class="setd" aria-hidden="true">${dartDiagram({ shape: x.shape, flight: x.flight, colors: x.colors, mini: true })}</span><b class="ell">${esc(x.name)}</b><small>${esc(dartSetSummary(x))}</small></button>`).join('')}</div>
      <a class="btn" href="#/armurerie/nouveau">${ico('plus')} CRÉER MON JEU</a>${nav(step)}`;
  } else {
    body = `<h2 class="wtitle">C'est prêt</h2><p class="note">Tout reste modifiable dans les Réglages. Les (i) de chaque écran expliquent les détails.</p>
      <a class="btn accent big" href="${appModes().train ? '#/entrainement' : '#/nouvelle'}" data-act="setup-done">${ico('play')} ${appModes().train ? 'PREMIER ENTRAÎNEMENT' : 'PREMIÈRE PARTIE'}</a>
      <div class="btns two"><a class="btn ghost" href="#/tutoriel" data-act="setup-done">TUTORIEL</a><a class="btn ghost" href="#/" data-act="setup-done">ACCUEIL</a></div>`;
  }
  return `<div class="screen welcome2">${topBar('Bienvenue', '#/')}<div class="pad">${stepBar(step)}${body}</div></div>`;
}
function saveSetupStarted(step) {
  const s = store.settings.setup || {};
  if (!s.started || s.step !== step) saveSetup({ started: true, step });
  if (step === 'fin' && !s.done) saveSetup({ done: true, started: true, step });
}

// ------------------------------------------------------------------ tutoriel
const PAGES = [
  ['target', 'Strela', 'Un compteur de fléchettes pour t\'entraîner seul et jouer à plusieurs. Deux modes, à allumer dans les Réglages : Entraînement et Soirée. Tout reste sur ton téléphone.'],
  ['sniper', 'L\'entraînement', 'Coaché : l\'appli propose un exercice et t\'explique où partent tes fléchettes. Libre : tu choisis la cible. Jeux : X01 ou Cricket seul, avec des défis si tu veux. Jeux de cible : Golf, Killer, Shanghai… pour varier.'],
  ['plusplus', 'La saisie', 'Lance tes 3 fléchettes, puis saisis-les. Téléphone debout : S, D ou T, puis le nombre (secteur entier, rapide) ; ou, en secteur touché, le nombre puis sa zone (simple intérieur ou extérieur, double, triple). Couché : touche la cible au doigt, la loupe aide à viser ; un hors cible se pose à côté de la cible.'],
  ['stats', 'Les stats', 'Précision (écart à la cible, en cm), groupement, tendances sur tes 10 dernières séances, carte de chaleur, badges. Choisis la période en haut ; exporte une feuille à partager, ou un fichier pour te faire coacher par une IA.'],
  ['glass', 'Les soirées', 'Mode Soirée : parties X01 et Cricket à plusieurs, joueurs avec leur avatar, verres, défis, classement et rapport de soirée.'],
  ['info', 'Les (i)', 'Partout, le petit (i) déplie une explication courte. Les règles de chaque exercice sont derrière le (i) de l\'exercice, et pendant la saisie.'],
];
export function tutorialScreen() {
  return `<div class="screen tuto">${topBar('Tutoriel', backFrom('#/'))}
    <div class="tpages" data-hscroll="tuto">${PAGES.map(([icon, title, text], i) => `<section class="tpage"><div class="tpi">${ico(icon)}</div><small>${i + 1} / ${PAGES.length}</small><h2>${esc(title)}</h2><p>${esc(text)}</p>
      ${i === PAGES.length - 1 ? `<a class="btn accent" href="#/" data-act="tuto-done">${ico('check')} C'EST PARTI</a>` : '<p class="tswipe">Fais défiler →</p>'}</section>`).join('')}</div>
    </div>`;
}

// ------------------------------------------------------------------ installer
export function installerScreen() {
  return `<div class="screen installer">${topBar('Installer Strela', backFrom('#/reglages'))}<div class="pad">
    <p class="note">Pour installer Strela sur un autre téléphone Android : envoie ce lien, ou ouvre-le sur le téléphone. Page complète : ${esc(INSTALL_PAGE.replace('https://', ''))}</p>
    <div class="btns two"><button type="button" class="btn" data-act="share-install">${ico('download')} PARTAGER LE LIEN</button><button type="button" class="btn ghost" data-act="copy-install">COPIER LE LIEN</button></div>
    ${shareMsg ? `<p class="note" role="status">${esc(shareMsg)}</p>` : ''}
    ${installGuideHtml({ version: BUILD.version })}
  </div></div>`;
}
let shareMsg = '';

export const inputs = {
  'setup-name'(v) { draftName = v; },
};
export const actions = {
  'setup-next'(step) {
    if (step === 'nom') { const n = (draftName ?? '').trim() || (document.getElementById('wname') || {}).value; if (n && n.trim()) saveProfile({ name: n }); draftName = null; }
    const i = STEPS.indexOf(step);
    go(`#/bienvenue/${STEPS[Math.min(STEPS.length - 1, i + 1)]}`);
  },
  'setup-icon'(k) { const me = profilePlayer(); saveProfile({ avatar: { kind: 'icon', icon: k, color: me && me.avatar ? me.avatar.color || 0 : 0 } }); refresh(); },
  'setup-color'(c) { const me = profilePlayer(); const av = me && me.avatar && me.avatar.kind === 'icon' ? me.avatar : { kind: 'initials' }; saveProfile({ avatar: { ...av, color: Number(c) || 0 } }); refresh(); },
  'setup-set'(id) { saveTrSetup({ setId: id }); refresh(); },
  'setup-done'(arg, el) { saveSetup({ done: true, started: true }); go(el && el.getAttribute('href') || '#/'); },
  'setup-skip'() { saveSetup({ started: true }); refresh(); },
  'tuto-done'(arg, el) { saveSetup({ tuto: true }); go(el && el.getAttribute('href') || '#/'); },
  async 'share-install'() {
    shareMsg = '';
    try { if (navigator.share) { await navigator.share({ title: 'Strela', text: 'Installer Strela (Android)', url: INSTALL_PAGE }); return; } } catch (e) { /* annulé */ }
    try { await navigator.clipboard.writeText(INSTALL_PAGE); shareMsg = 'Lien copié : colle-le dans un message.'; } catch (e) { shareMsg = INSTALL_PAGE; }
    refresh();
  },
  async 'copy-install'() { try { await navigator.clipboard.writeText(INSTALL_PAGE); shareMsg = 'Lien copié.'; } catch (e) { shareMsg = INSTALL_PAGE; } refresh(); },
};
