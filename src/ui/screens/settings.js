// Réglages : thème Auto / Sombre / Clair (« strela.theme »), mode nuit (option du sombre : console en rouge
// atténué, comme Grafit), sons et annonces vocales (lot 3), vibrations, animations (chiffres en rouleau, glissement du bandeau ; coupées d'office si le
// téléphone demande moins d'animations). Les mêmes commandes servent au menu pause du jeu.
import { heatScale, heatLegend, heatPreview } from '../heat.js';
import { HEAT_SCALES, HEAT_LABELS } from '../theme.js';
import { store, saveSetting, reducedMotion, exportBackup, applyImport, importCounts, storageIssue, resaveAll, appModes, setMode, setupDone, profilePlayer, activePlayers } from '../store.js';
import { avatarHtml } from '../avatars.js';
import { backupFileName, parseBackup, BackupError } from '../../data/backup.js';
import { esc, ico, topBar, plural } from '../dom.js';
import { lastAutoBackup } from '../autobackup.js';
import { BUILD } from '../build.js';
import { refresh, buzz, BUZZ, go } from '../nav.js';
import { say, sound, voiceInfo } from '../feedback.js';
import { isApk, call, callJson, onNative, nativeTheme, hasUpdater, nativeInfo } from '../native.js';
import { voiceEngine } from '../voiceinput.js';
import { onlineSupport } from '../online.js';
import { padModeOf } from '../../engine/padinput.js';
import { log, setJournal, journalLines, journalText, journalFileName, clearJournal, journalSize, stamp, CATS } from '../journal.js';
import { deliverFile } from './printsheet.js';
import { accountCard } from './account.js';

const prefersLight = () => { try { return matchMedia('(prefers-color-scheme: light)').matches; } catch (e) { return false; } };
export const isDark = () => store.settings.theme === 'dark' || (store.settings.theme === 'auto' && !prefersLight());

/** Applique thème et mode nuit à la page (et la couleur de la barre système). */
export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = store.settings.theme;
  root.classList.toggle('night', store.settings.night && isDark());
  root.classList.toggle('still', !(store.settings.anim && !reducedMotion()));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#0A0C0E';
  nativeTheme(isDark()); // APK : fond de la fenêtre et icônes des barres système
}

const toggle = (act, on, disabled = false) => `<div class="toggle">
  <button type="button" data-act="${act}" data-arg="1" aria-pressed="${on}" ${disabled ? 'disabled' : ''}>OUI</button>
  <button type="button" data-act="${act}" data-arg="0" aria-pressed="${!on}" ${disabled ? 'disabled' : ''}>NON</button></div>`;

/** Thème, mode nuit, vibrations : bloc commun aux réglages et au menu pause. */
export function themeControls() {
  const t = store.settings.theme;
  const dark = isDark();
  const reduced = reducedMotion();
  const b = (v, l) => `<button type="button" data-act="theme" data-arg="${v}" aria-pressed="${t === v}">${l}</button>`;
  return `<div class="seg" role="group" aria-label="Thème">${b('auto', 'Auto')}${b('dark', 'Sombre')}${b('light', 'Clair')}</div>
    <div>
      <div class="row"><div class="lbl"><b>Mode nuit</b><small>${dark ? 'Console en rouge atténué, pour la pénombre.' : 'Option du thème sombre.'}</small></div>${toggle('night', store.settings.night && dark, !dark)}</div>
      <div class="row"><div class="lbl"><b>Sons</b><small>Clic à chaque fléchette, sons du bust, de la validation et de la finition.</small></div>${toggle('sound', store.settings.sound)}</div>
      <div class="row"><div class="lbl"><b>Annonces vocales</b><small>Total de la volée, bust, finition jouable, manche et partie.</small></div>${toggle('voice', store.settings.voice)}</div>
      <div class="row"><div class="lbl"><b>Vibrations</b><small>Courte à chaque fléchette, longue sur un bust.</small></div>${toggle('vibrate', store.settings.vibrate)}</div>
      <div class="row"><div class="lbl"><b>Animations</b><small>${reduced ? 'Coupées : le téléphone demande moins d\'animations.' : 'Chiffres qui roulent, bandeau du joueur qui glisse.'}</small></div>${toggle('anim', store.settings.anim && !reduced, reduced)}</div>
    </div>`;
}

// ------------------------------------------------------------------ test de vibration et diagnostic (lot 1.2)
let vibeResult = null; // dernier résultat de TESTER LA VIBRATION

const VIBE_TEXT = {
  absent: ['FONCTION ABSENTE', 'Ce navigateur ne sait pas faire vibrer le téléphone. L\'appli Android (lot 5) utilisera le vibreur natif.'],
  refused: ['REFUSÉE', 'Chrome a refusé la demande (navigator.vibrate a répondu « non ») : page pas encore touchée, ou onglet en arrière-plan.'],
  native: ['VIBREUR D\'ANDROID', 'Trois impulsions envoyées au vibreur du téléphone. Rien senti ? Réglages Android › Son et vibreur › Vibreur et retour haptique : vérifier « Vibreur pour les contenus multimédias ».'],
  sent: ['ENVOYÉE', 'La demande est partie vers le téléphone (3 impulsions). Rien senti ? Chrome ne vibre pas en mode silencieux, et Android coupe les vibrations des pages quand le retour haptique est désactivé : Réglages Android › Son et vibreur › Vibreur et retour haptique. Certains téléphones (Pixel) ne vibrent pas du tout pour une page web : l\'appli Android (lot 5) passera par le vibreur natif.'],
};

function displayMode() {
  if (isApk()) { const i = nativeInfo(); return `appli Android${i ? ` ${i.version}${i.variant ? ` (${i.variant})` : ''} · Android SDK ${i.sdk} · ${i.model}` : ''}`; }
  const m = ['fullscreen', 'standalone', 'minimal-ui'].find(d => { try { return matchMedia(`(display-mode: ${d})`).matches; } catch (e) { return false; } });
  return m ? `appli installée (${m === 'fullscreen' ? 'plein écran' : m})` : 'onglet du navigateur';
}

/** Taille de police effective : hauteur rendue d'un texte de 100 px (le réglage de police d'Android l'agrandit). */
function fontScale() {
  const probe = document.createElement('span');
  probe.textContent = '0';
  probe.style.cssText = 'position:absolute;visibility:hidden;font-size:100px;line-height:1;white-space:nowrap';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h / 100;
}

/** Base du téléphone : version, contenu, stockage persistant (demandé au lancement). */
export function storageLine() {
  if (store.maquette) return 'maquette (en mémoire, base non ouverte)';
  const d = store.db;
  if (isApk()) {
    // Lot 5 : la base est dans le dossier privé de l'appli (WebView) : Android ne l'efface qu'à la désinstallation.
    const s = callJson('storage');
    const base = d.error ? `base : ${d.error}` : `base v${d.version} · ${store.players.length} j. · ${store.games.length + store.ckGames.length + (store.current || store.ck ? 1 : 0)} p.`;
    return `${base}${d.unreadable ? ` · ${d.unreadable} illisible(s)` : ''} · données dans l'appli${s ? ` (${s.dir}, ${mo(s.bytes)})` : ''} · stockage ${d.persisted === 'yes' ? 'persistant' : 'privé de l\'appli'}`;
  }
  const persist = { yes: 'persistant', no: 'non persistant (refusé par Chrome)', absent: 'persistant : fonction absente', error: 'persistant : erreur' }[d.persisted] || 'persistant : en attente';
  const base = d.error ? `base : ${d.error}` : `base v${d.version} · ${store.players.length} j. · ${store.games.length + store.ckGames.length + (store.current || store.ck ? 1 : 0)} p.`;
  return `${base}${d.unreadable ? ` · ${d.unreadable} illisible(s)` : ''} · stockage ${persist}`;
}

const mo = b => `${(Math.round((b || 0) / 104857.6) / 10).toString().replace('.', ',')} Mo`;

/** Ligne de diagnostic : orientation, taille de l'écran en px CSS, police, mode d'affichage, base, version. */
export function diagnostic() {
  let orient = 'inconnue';
  try { orient = matchMedia('(orientation: landscape)').matches ? 'paysage' : 'portrait'; } catch (e) { /* rien */ }
  const type = (screen.orientation && screen.orientation.type) || '';
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  const fs = Math.round(fontScale() * 100);
  return `${orient}${type ? ` (${type})` : ''} · écran ${window.innerWidth}×${window.innerHeight} px · ×${String(dpr).replace('.', ',')}`
    + ` · police ${fs} % · ${displayMode()} · ${storageLine()} · v${BUILD.version}`;
}

/** État de la voix française du téléphone (annonces vocales, lot 3). */
function voiceBlock() {
  const v = voiceInfo();
  if (v.state === 'ok') return `<div class="kv"><span>Voix</span><b class="small ell">${esc(v.name)}</b></div>`;
  const text = {
    absent: ['PAS DE SYNTHÈSE VOCALE', 'Ce navigateur ne sait pas parler : les annonces vocales sont impossibles ici.'],
    loading: ['VOIX EN COURS DE RECHERCHE', 'Le téléphone n\'a pas encore donné la liste de ses voix. Touchez TESTER LA VOIX, puis revenez sur cet écran.'],
    none: ['AUCUNE VOIX FRANÇAISE', 'Aucune voix française n\'est installée sur ce téléphone. Réglages Android › Système › Langues › Synthèse vocale : moteur Google, puis installer les données vocales en français.'],
  }[v.state];
  return `<div class="vibe bad" role="status"><b>${text[0]}</b><span>${text[1]}</span></div>`;
}

// ------------------------------------------------------------------ appli Android (lot 5)
// État de la mise à jour, envoyé par la coquille (Updater.java) : { current, latest, available, state, progress, msg }.
let upd = null;
onNative(d => {
  if (d.update) {
    // Journal (lot 9.5) : chaque changement d'état de la mise à jour (recherche, téléchargement, erreur).
    if (!upd || upd.state !== d.update.state || upd.latest !== d.update.latest) log('maj', `mise à jour : ${d.update.state || '?'}${d.update.latest ? ` (dernière ${d.update.latest}, ici ${d.update.current || '?'})` : ''}${d.update.msg ? ` — ${d.update.msg}` : ''}`);
    // Accueil (0.23.3) : la carte « MISE À JOUR » est dessinée à l'ouverture avec la version de la recherche précédente
    // (gardée par la coquille) ; redessiner l'accueil quand la recherche du jour la change (vu : v0.23.0 à l'accueil,
    // v0.23.2 dans les Réglages). Seulement si la carte change : pas de rendu à chaque pour-cent du téléchargement.
    const home = !location.hash || location.hash === '#/' || location.hash === '#';
    const before = home ? updateBadge() : '';
    upd = d.update;
    if (location.hash === '#/reglages' || (home && updateBadge() !== before)) refresh();
  }
  // Sauvegarde choisie pendant qu'Android avait fermé l'appli (sélecteur de fichiers) : relue par la coquille.
  if (d.importFile && typeof d.importFile.text === 'string') {
    onBackupFile(new File([d.importFile.text], String(d.importFile.name || 'sauvegarde.json'), { type: 'application/json' }));
  }
});

/** Mise à jour depuis l'appli possible (APK « github », ou sommaire de maquette : mockApk = true) ? */
const updatable = () => hasUpdater() || store.mockApk === true;
/** Dernier état de la mise à jour : envoyé par la coquille, ou demandé ; dans la maquette, store.mockUpdate. */
export function updateInfo() {
  if (!updatable()) return {};
  return upd || (store.maquette ? store.mockUpdate : callJson('updateState')) || {};
}
const updateBusy = u => u.state === 'checking' || u.state === 'downloading' || u.state === 'installing';
let revealUpdate = false; // repère de l'accueil touché : les Réglages s'ouvrent sur la mise à jour


/**
 * Mise à jour (lot 8 du 23/11, 7.2) : recherche à chaque ouverture (coquille Android, au plus une fois par 10 min), sans
 * erreur ni blocage hors connexion. Une version disponible : carte bien visible à l'accueil et en tête des Réglages,
 * bouton en rouge Strela (léger battement si les animations sont permises) ; PLUS TARD la masque 3 jours, sauf si la
 * version est marquée importante. Rien n'est téléchargé sans appui.
 */
const SNOOZE_DAYS = 3;
const snoozed = u => { const z = store.settings.updSnooze; return !u.important && z && z.v === u.latest && Date.now() < z.until; };
/** Carte de l'accueil quand une version est disponible (et pas masquée), sinon ''. */
export function updateBadge() {
  const u = updateInfo();
  if (!u.available || updateBusy(u) || snoozed(u)) return '';
  return `<section class="updcard" role="status"><div><b>MISE À JOUR v${esc(u.latest || '')}${u.important ? ' · IMPORTANTE' : ''}</b><span>Nouvelle version de Strela ; tes données sont gardées.</span></div>
    <div class="btns two"><button type="button" class="btn upd-go" data-act="show-update">${ico('download')} METTRE À JOUR</button>${u.important ? '' : '<button type="button" class="btn ghost" data-act="update-snooze">PLUS TARD</button>'}</div></section>`;
}

/** Carte « Mises à jour » en tête des Réglages. */
function updateCardHtml() {
  if (!isApk() && !store.mockApk) {
    return card('download', 'Mises à jour', null, `<div class="kv"><span>Version</span><b>${esc(BUILD.version)}</b></div>
      <p class="note">Version web : elle se met à jour toute seule. Pour l'appli Android, voir « Installer Strela » plus bas.</p>`);
  }
  if (!updatable()) {
    return card('download', 'Mises à jour', null, `<div class="kv"><span>Version installée</span><b>${esc((nativeInfo() || {}).version || BUILD.version)}</b></div>
      <p class="note">Version Google Play : les mises à jour arrivent par le Play Store.</p>`);
  }
  const u = updateInfo();
  const busy = updateBusy(u);
  const status = u.state === 'checking' ? 'Recherche en cours…'
    : u.state === 'downloading' ? `Téléchargement : ${u.progress || 0} %`
    : u.state === 'installing' ? 'Installation : confirme dans la fenêtre d\'Android.'
    : u.msg || '';
  const btn = u.available && !busy
    ? `<button type="button" class="btn upd-go big" data-act="update-install">${ico('download')} INSTALLER LA VERSION ${esc(u.latest || '')}</button>`
    : `<button type="button" class="btn" data-act="update-check" ${busy ? 'disabled' : ''}>RECHERCHER UNE MISE À JOUR</button>`;
  const reveal = revealUpdate ? ' data-reveal' : '';
  revealUpdate = false;
  return `<section class="card2 updc${u.available ? ' on' : ''}" id="maj"${reveal}><h2>${ico('download')}<span>Mises à jour</span></h2>
    <div class="kv"><span>Version installée</span><b>${esc(u.current || BUILD.version)}</b></div>
    ${u.available && !busy ? `<p class="upd-line" role="status">MISE À JOUR v${esc(u.latest || '')} DISPONIBLE${u.important ? ' · IMPORTANTE' : ''}</p>` : ''}
    ${btn}
    ${status && !(u.available && /disponible/.test(status)) ? `<p class="note${u.state === 'error' ? ' red' : ''}" role="status">${esc(status)}</p>` : ''}
    <div class="rows">${srow('auto-update', 'Recherche automatique', 'À chaque ouverture, jamais pendant une partie. Sans connexion : rien ne s\'affiche.', store.settings.autoUpdate)}</div>
    <p class="note">Dernière version publiée sur GitHub (OrbitalVKL/STRELA), installée par-dessus : joueurs, parties, séances et réglages sont gardés.</p></section>`;
}

/** Données de l'appli Android (désinstallation) ; rien dans le navigateur. */
function apkDataBlock() {
  if (!isApk() && !store.mockApk) return '';
  return `<div class="issue warn"><b>DÉSINSTALLER EFFACE LES DONNÉES</b><span>Joueurs, parties, séances et réglages sont dans l'appli : désinstaller Strela les efface. Exporte une sauvegarde avant (elle va dans Téléchargements/Strela).</span></div>`;
}

// ------------------------------------------------------------------ problème d'enregistrement (lot 4)
const ISSUE_TEXT = {
  newer: ['BASE PLUS RÉCENTE QUE L\'APPLI', 'Les données ont été enregistrées par une version plus récente de Strela. Rien n\'est effacé : recharge (en ligne) pour retrouver la dernière version, puis tout réapparaît.'],
  open: ['DONNÉES NON ENREGISTRÉES', 'La base du téléphone est inaccessible : tu peux jouer, mais rien ne sera gardé à la fermeture. Causes possibles : navigation privée, stockage du site bloqué ou effacé pendant l\'utilisation. RECHARGER réessaie.'],
  full: ['STOCKAGE PLEIN', 'Le téléphone n\'a plus de place : les dernières modifications ne sont pas enregistrées (elles restent à l\'écran). Libère de la place (Réglages Android › Stockage) ou supprime de vieilles parties, puis RÉESSAYER. EXPORTER garde une copie de tout.'],
  write: ['ENREGISTREMENT REFUSÉ', 'Le téléphone a refusé d\'enregistrer les dernières modifications (elles restent à l\'écran). RÉESSAYER les réécrit ; EXPORTER garde une copie de tout.'],
};

/** Alerte d'enregistrement (accueil, réglages, menu pause), avec l'action utile ; vide s'il n'y a pas de problème. */
export function storageBanner() {
  const issue = storageIssue();
  if (!issue) return '';
  const [title, text] = ISSUE_TEXT[issue.kind];
  const acts = issue.kind === 'full' || issue.kind === 'write'
    ? '<button type="button" class="btn" data-act="issue-retry">RÉESSAYER</button><button type="button" class="btn ghost" data-act="issue-export">EXPORTER</button>'
    : '<button type="button" class="btn" data-act="issue-reload">RECHARGER</button>';
  return `<section class="issue" role="alert"><b>${title}</b><span>${text}</span>${issue.detail ? `<span class="small dim ell">${esc(issue.detail)}</span>` : ''}<div class="btns two">${acts}</div></section>`;
}

// ------------------------------------------------------------------ sauvegarde : export / import (lot 3)
// bk.preview : sauvegarde lue et vérifiée (parseBackup), en attente d'un choix ; bk.ask : 'replace' | 'merge'
// (confirmation) ; bk.error : fichier refusé ; bk.done : compte rendu du dernier export ou import.
const bk = { preview: null, file: '', ask: null, error: '', done: '' };

/** Sommaire de maquette : sauvegarde lue d'avance, confirmation ou refus affichés. */
export function presetBackup(state) { Object.assign(bk, { preview: null, file: '', ask: null, error: '', done: '' }, state); }

const fmtDate = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date inconnue';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function backupBlock() {
  const exp = `<button type="button" class="btn" data-act="backup-export">EXPORTER</button>`;
  const imp = `<label class="btn ghost">IMPORTER<input type="file" accept="application/json,.json" data-backup hidden></label>`;
  let box = '';
  if (bk.error) {
    box = `<div class="vibe bad" role="alert"><b>FICHIER REFUSÉ</b><span>${esc(bk.error)}</span><span>Rien n'a été modifié.</span></div>`;
  } else if (bk.preview) {
    const sm = bk.preview.summary;
    const what = `${plural(sm.players, 'joueur', 'joueurs')} · ${plural(sm.games, 'partie', 'parties')}${sm.current ? ' · une partie en cours' : ''}${sm.trainings ? ` · ${plural(sm.trainings, 'séance', 'séances')} d'entraînement` : ''}`;
    const head = `<div class="bk-prev"><b>SAUVEGARDE DU ${esc(fmtDate(sm.exportedAt))}</b><span>${what}${sm.app ? ` · Strela v${esc(sm.app)}` : ''}</span><span class="small dim ell">${esc(bk.file)}</span></div>`;
    if (bk.ask === 'replace') {
      const nP = store.players.length, nG = store.games.length + store.ckGames.length + (store.current || store.ck ? 1 : 0);
      box = `${head}<div class="confirm" role="alertdialog" aria-label="Tout remplacer ?"><p class="alert-h">REMPLACER TOUTES LES DONNÉES ?</p>
        <p class="small">Les ${plural(nP, 'joueur', 'joueurs')} et ${plural(nG, 'partie', 'parties')} de ce téléphone seront effacés et remplacés par ceux de la sauvegarde (réglages compris).${bk.preview.trainings ? ' Les séances d\'entraînement et les jeux de fléchettes aussi.' : ' Les séances d\'entraînement de ce téléphone sont gardées (la sauvegarde n\'en a pas).'}</p>
        <div class="btns two"><button type="button" class="btn" data-act="backup-no">NON</button><button type="button" class="btn alert" data-act="backup-yes">REMPLACER</button></div></div>`;
    } else if (bk.ask === 'merge') {
      const c = importCounts(bk.preview, 'merge');
      box = `${head}<div class="confirm warn" role="alertdialog" aria-label="Fusionner ?"><p><b>FUSIONNER ?</b></p>
        <p class="small">Ajoute ${plural(c.playersAdded, 'joueur', 'joueurs')} et ${plural(c.gamesAdded, 'partie', 'parties')}${c.trainingsAdded ? `, ${plural(c.trainingsAdded, 'séance', 'séances')} d'entraînement` : ''} absents de ce téléphone. Rien n'est effacé ; ce qui existe déjà ici est gardé tel quel.${c.currentSkipped ? ' Une partie est déjà en cours ici : celle de la sauvegarde ira dans l\'historique, abandonnée.' : ''}</p>
        <div class="btns two"><button type="button" class="btn" data-act="backup-no">NON</button><button type="button" class="btn primary" data-act="backup-yes">FUSIONNER</button></div></div>`;
    } else {
      box = `${head}<div class="btns two"><button type="button" class="btn danger" data-act="backup-mode" data-arg="replace">REMPLACER TOUT</button><button type="button" class="btn" data-act="backup-mode" data-arg="merge">FUSIONNER</button></div>
        <button type="button" class="btn ghost" data-act="backup-cancel">ANNULER</button>`;
    }
  } else if (bk.done) {
    box = `<div class="vibe" role="status"><b>FAIT</b><span>${esc(bk.done)}</span></div>`;
  }
  return `<div class="btns two">${exp}${imp}</div>${box ? `<div class="bk" data-reveal>${box}</div>` : ''}
    <p class="note">EXPORTER : un fichier avec les joueurs (photos comprises), les parties, l'entraînement et les réglages, à garder sur Drive ou ailleurs. IMPORTER : REMPLACER TOUT ou FUSIONNER (sans doublon), après un aperçu.</p>`;
}

/** Fichier de sauvegarde choisi (IMPORTER) : lu et vérifié en entier avant tout choix ; rien n'est encore écrit. */
export async function onBackupFile(file) {
  Object.assign(bk, { preview: null, ask: null, error: '', done: '', file: file.name });
  try {
    if (file.size > 200 * 1048576) throw new BackupError('Fichier trop lourd pour une sauvegarde Strela.');
    bk.preview = parseBackup(await file.text());
  } catch (e) {
    bk.error = e instanceof BackupError ? e.message : `Lecture impossible (${(e && e.message) || e}).`;
  }
  // Choisi depuis l'accueil (premier lancement de l'APK) : l'aperçu est dans les Réglages.
  if (location.hash !== '#/reglages') go('#/reglages'); else refresh();
}

/** Téléchargement du fichier (repli quand le partage d'Android n'est pas proposé). */
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ------------------------------------------------------------------ réglages (version 0.8.0, refonte du lot 7.8)
// Les options de toujours (aucune retirée), regroupées en cartes (Affichage, Son et voix, Vibrations, Sauvegarde, Appli Android,
// À propos), descriptions courtes, explications longues derrière (i), diagnostic replié.
const s2 = { info: new Set(), diag: false };
export function presetSettings2(state = {}) { s2.info = new Set(state.info || []); s2.diag = !!state.diag; }
const s2info = key => `<button type="button" class="ibtn" data-act="s2-info" data-arg="${key}" aria-pressed="${s2.info.has(key)}" aria-label="Explication">${ico('info')}</button>`;
const s2box = (key, text) => (s2.info.has(key) ? `<p class="infobox" role="note">${text}</p>` : '');
const card = (icon, title, key, body) => `<section class="card2"><h2>${ico(icon)}<span>${title}</span>${key ? s2info(key) : ''}</h2>${body}</section>`;
/** Lot 9.5 (B) : journal de débogage (Réglages › Développement) : allumé, joint à l'export, voir, exporter, vider. */
const jr = { view: false, msg: '' };
function journalBlock() {
  const on = store.settings.journal !== false;
  const lines = journalLines();
  const ko = Math.max(1, Math.round(journalSize() / 1024));
  const view = jr.view ? `<pre class="journal" aria-label="Journal, 300 dernières lignes">${esc(lines.slice(-300).reverse().map(([t, c, m]) => `${stamp(t).slice(5)} ${CATS[c] || c}  ${m}`).join('\n') || 'Journal vide.')}</pre>` : '';
  return `<div class="sec">Journal de débogage${s2info('jr')}</div>
    ${s2box('jr', 'Ce qui se passe sur ce téléphone, heure par heure : erreurs de l\'appli, étapes du mode en ligne, saisie (fléchette ajoutée, annulée, volée validée, bust), mises à jour, migrations de la base. Gardé 7 jours (1 Mo au plus) sur ce téléphone seulement ; rien de personnel hors les pseudos (pas d\'adresse réseau). Rien ne part sans EXPORTER, ou la case « joindre à la sauvegarde ».')}
    <div class="rows">${srow('journal', 'Journal', on ? `${plural(lines.length, 'ligne', 'lignes')} · ${ko} Ko` : 'Coupé : rien n\'est noté', on)}
      ${srow('journal-backup', 'Joindre à la sauvegarde', 'Le journal part avec EXPORTER (Données)', store.settings.journalInBackup !== false && on, !on)}</div>
    <div class="btns two"><button type="button" class="btn ghost" data-act="journal-view" aria-pressed="${jr.view}">${jr.view ? 'MASQUER' : 'VOIR'}</button><button type="button" class="btn ghost" data-act="journal-export" ${lines.length ? '' : 'disabled'}>EXPORTER</button></div>
    <button type="button" class="btn ghost" data-act="journal-clear" ${lines.length ? '' : 'disabled'}>VIDER LE JOURNAL</button>
    ${jr.msg ? `<div class="vibe" role="status"><b>JOURNAL</b><span>${esc(jr.msg)}</span></div>` : ''}${view}`;
}

const srow = (act, title, desc, on, disabled = false) => `<div class="row"><div class="lbl"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</div>${toggle(act, on, disabled)}</div>`;

/** Lot 9 : dernière sauvegarde automatique, en clair. */
function autoLine() {
  const l = lastAutoBackup();
  if (!l) return 'Fin de soirée et chaque semaine';
  const d = new Date(l.at), p2 = n => String(n).padStart(2, '0');
  return `Dernière : ${p2(d.getDate())}/${p2(d.getMonth() + 1)} à ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/**
 * Saisie au pavé (correction du 23/11, engine/padinput.js) : secteur entier (rapide, défaut) ou secteur touché (précis).
 * Valeur gardée dans `padRing` (true = touché), comme depuis la 0.17.0 : commandes `pad-ring` 0 / 1.
 */
function padModeSetting() {
  const cur = padModeOf(store.settings);
  const b = (m, l) => `<button type="button" data-act="pad-ring" data-arg="${m === 'touche' ? 1 : 0}" aria-pressed="${cur === m}">${l}</button>`;
  return `<div class="heatset"><span class="small dim caps">Saisie au pavé</span>
    <div class="seg" role="group" aria-label="Saisie au pavé">${b('entier', 'Secteur entier')}${b('touche', 'Secteur touché')}</div></div>`;
}

/** Présentation du choix de la zone au pavé (23/11) : rangées (B) ou secteur (C) ; voir training.js › zonePick. */
const ZONE_PAD_LABELS = { rangees: 'Rangées', secteur: 'Secteur' };
function zonePadSetting() {
  const cur = store.settings.zonePad === 'secteur' ? 'secteur' : 'rangees';
  return `<div class="heatset"><span class="small dim caps">Choix de la zone (secteur touché)</span>
    <div class="seg" role="group" aria-label="Choix de la zone">${Object.entries(ZONE_PAD_LABELS).map(([k, l]) => `<button type="button" data-act="zone-pad" data-arg="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div></div>`;
}

/** Échelle des cartes de chaleur (lot 8 du 23/11, 3.5), avec l'aperçu en direct. */
function heatSetting() {
  const cur = heatScale();
  return `<div class="heatset"><span class="small dim caps">Cartes de chaleur</span>
    <div class="seg" role="group" aria-label="Échelle des cartes de chaleur">${HEAT_SCALES.map(k => `<button type="button" data-act="heat-scale" data-arg="${k}" aria-pressed="${cur === k}">${esc(HEAT_LABELS[k])}</button>`).join('')}</div>
    <div class="heatprev">${heatPreview(cur)}<p class="small dim">${esc(heatLegend(cur))}. Pour les cartes de l'entraînement et des soirées.</p></div></div>`;
}

/**
 * Réglages (lot 8 du 23/11, 7.1 : refonte pour la prod) : Mises à jour en tête, puis Profil, Modes de l'application,
 * Matériel, Affichage, Son et animations, Données et sauvegarde, À propos ; tout ce qui sert au développement et aux
 * essais (tests du son, de la voix, des vibrations, sommaire de maquette, diagnostic) dans « Développement », replié en
 * bas, sans rien supprimer. Les données (sauvegarde, restauration, export) ne sont jamais rangées là.
 */
export function settings2Screen() {
  const t = store.settings.theme;
  const dark = isDark();
  const reduced = reducedMotion();
  const vr = vibeResult && VIBE_TEXT[vibeResult];
  const b = (v, l) => `<button type="button" data-act="theme" data-arg="${v}" aria-pressed="${t === v}">${l}</button>`;
  const v = voiceInfo();
  const voice = v.state === 'ok' ? `<div class="kv"><span>Voix du téléphone</span><b class="small ell">${esc(v.name)}</b></div>` : voiceBlock();
  const modes = appModes();
  const me = profilePlayer();
  const sets = store.dartSets.filter(x => !x.archived).length;
  return `<div class="screen settings2">${topBar('Réglages', '#/')}
    <div class="pad">
      ${storageBanner()}
      ${updateCardHtml()}
      ${card('players', 'Profil', 'prof', `
        ${s2box('prof', 'Ton nom et ton avatar : les séances d\'entraînement sont notées à ce nom. En mode soirée, les autres joueurs se gèrent dans Joueurs.')}
        ${me ? `<a class="lrow" href="#/joueur/${esc(me.id)}">${avatarHtml(me, 36)}<span><b class="nm">${esc(me.name)}</b><small>Nom, avatar, finition préférée</small></span>${ico('chev')}</a>`
    : `<a class="lrow" href="#/bienvenue/nom">${ico('plus')}<span><b>Créer mon profil</b><small>Un nom et un avatar</small></span>${ico('chev')}</a>`}
        ${modes.soiree ? `<a class="lrow" href="#/joueurs">${ico('players')}<span><b>Joueurs</b><small>${plural(activePlayers().length, 'joueur', 'joueurs')}</small></span>${ico('chev')}</a>` : ''}
        ${setupDone() ? '' : `<a class="lrow" href="#/bienvenue">${ico('flag')}<span><b>Terminer la mise en place</b><small>Modes, nom, avatar, jeu de fléchettes</small></span>${ico('chev')}</a>`}`)}
      ${accountCard()}
      ${card('target', 'Modes de l\'application', 'modes', `
        ${s2box('modes', '<b>Entraînement</b> : exercices, jeux de cible, stats et badges d\'entraînement. <b>Soirée</b> : parties à plusieurs (X01, Cricket), joueurs, verres, moqueries, classement. Éteindre un mode le retire de l\'écran, sans rien effacer : ses données restent et reviennent dès qu\'on le rallume. Un mode au moins reste allumé.')}
        <div class="rows">
          ${srow('mode-train', 'Entraînement', 'Seul, pour progresser', modes.train)}
          ${srow('mode-soiree', 'Soirée', 'À plusieurs : joueurs, verres, classement', modes.soiree)}
          ${onlineSupport().ok ? srow('mode-online', 'En ligne', 'Un joueur par téléphone, à distance', modes.online) : ''}
        </div>`)}
      ${card('wrench', 'Matériel', null, `
        <a class="lrow" href="#/armurerie">${ico('wrench')}<span><b>Armurerie</b><small>${plural(sets, 'jeu de fléchettes', 'jeux de fléchettes')}</small></span>${ico('chev')}</a>
        <a class="lrow" href="#/conseils">${ico('info')}<span><b>Conseils</b><small>Prise en main, posture, lancer, types de fléchettes</small></span>${ico('chev')}</a>`)}
      ${card('target', 'Saisie', 'saisie', `
        ${s2box('saisie', 'Pavé de l\'entraînement (téléphone debout). <b>Secteur entier</b> (rapide) : S, D ou T dans la barre du haut (1, 2 ou 3 traits ; la zone visée est armée d\'office), puis le nombre : la fléchette est notée d\'un appui. Le simple n\'a pas de couronne : il est placé au milieu de sa case, précision et groupement sont alors approchés (mention ≈ dans les stats). <b>Secteur touché</b> (précis) : le nombre, puis sa zone — simple intérieur (entre le centre et le triple) ou extérieur (entre le triple et le double), double, triple. Le mode se change aussi sur le pavé même (SECTEUR ENTIER / TOUCHÉ, en haut). Couché, sur la cible au doigt, la zone exacte est toujours gardée. En partie, le pavé reste S / D / T puis le nombre. Choix de la zone (secteur touché) : <b>Rangées</b>, une touche par zone, du bord (double) vers le bull, la tranche du secteur à gauche ; <b>Secteur</b>, la part de cible dessinée en grand, on touche la bande. Double : 2 barres ; triple : 3 barres. <b>Saisie à la voix</b> : un appui sur le micro (en haut, à côté de la pause), puis on annonce ses fléchettes, « triple vingt, double seize, vingt-cinq » ; « vingt intérieur » ou « extérieur » pour la couronne du simple ; bull, centre ou cinquante (50) ; demi-bull (25) ; dehors, raté, à côté ; « annuler », « valider ». Les fléchettes reconnues s\'affichent comme au pavé et se corrigent au doigt ; rien n\'est validé sans « valider » ou un appui. Strela n\'écoute que le temps d\'une phrase et n\'enregistre rien.')}
        ${padModeSetting()}
        ${zonePadSetting()}
        <div class="rows">${srow('voice-input', 'Saisie à la voix', voiceEngine() ? 'Bouton micro en jeu et à l\'entraînement' : 'Pas de reconnaissance vocale sur cet appareil', store.settings.voiceInput !== false && !!voiceEngine(), !voiceEngine())}</div>`)}
      ${card('theme', 'Affichage', 'aff', `
        ${s2box('aff', 'Auto suit le réglage du téléphone (sombre ou clair). Le mode nuit passe la console en rouge atténué, pour la pénombre ; il ne s\'applique qu\'en sombre.')}
        <div class="seg" role="group" aria-label="Thème">${b('auto', 'Auto')}${b('dark', 'Sombre')}${b('light', 'Clair')}</div>
        <div class="rows">${srow('night', 'Mode nuit', dark ? 'Rouge atténué' : 'En thème sombre seulement', store.settings.night && dark, !dark)}</div>
        ${heatSetting()}`)}
      ${card('sound', 'Son et animations', 'son', `
        ${s2box('son', 'Sons : clic à chaque fléchette, bust, validation et finition. Annonces vocales : total de la volée, bust, finition jouable, manche et partie, moqueries et répliques des personnages. Vibrations : courte à chaque fléchette, longue sur un bust. Animations : chiffres qui roulent, bandeau du joueur qui glisse, animations de tour ; coupées d\'office si le téléphone demande moins d\'animations.')}
        <div class="rows">
          ${srow('sound', 'Sons', null, store.settings.sound)}
          ${srow('voice', 'Annonces vocales', null, store.settings.voice)}
          ${srow('vibrate', 'Vibrations', null, store.settings.vibrate)}
          ${srow('anim', 'Animations', reduced ? 'Coupées par le téléphone' : null, store.settings.anim && !reduced, reduced)}
        </div>`)}
      ${card('data', 'Données et sauvegarde', 'auto', `${s2box('auto', 'Tout est sur ce téléphone : joueurs, parties, soirées, séances d\'entraînement, jeux de fléchettes, réglages. EXPORTER écrit une sauvegarde complète (un fichier) ; IMPORTER la relit sur un autre téléphone. Appli Android : une sauvegarde automatique va dans Téléchargements/Strela à la fin de chaque soirée, et au lancement si la dernière a plus d\'une semaine.')}
        ${(isApk() || store.mockApk) ? `<div class="rows">${srow('autoBackup', 'Sauvegarde automatique', autoLine(), store.settings.autoBackup)}</div>` : ''}
        ${backupBlock()}
        ${apkDataBlock()}`)}
      ${card('info', 'À propos', null, `
        <a class="lrow" href="#/nouveautes">${ico('news')}<span><b>Nouveautés</b><small>Ce qui change à chaque version</small></span><b class="v">v${esc(BUILD.version)}</b>${ico('chev')}</a>
        <a class="lrow" href="#/tutoriel">${ico('play')}<span><b>Tutoriel</b><small>Les grands écrans en quelques pages</small></span>${ico('chev')}</a>
        <a class="lrow" href="#/installer">${ico('phone')}<span><b>Installer Strela</b><small>Sur un autre téléphone : lien et mode d'emploi</small></span>${ico('chev')}</a>
        <a class="lrow" href="#/apropos">${ico('info')}<span><b>À propos de Strela</b><small>Licences, confidentialité, contact</small></span>${ico('chev')}</a>`)}
      <button type="button" class="fold" data-act="s2-diag" aria-expanded="${s2.diag}">${ico('wrench')}<span>Développement</span>${ico(s2.diag ? 'up' : 'down')}</button>
      ${s2.diag ? `<div class="fold-body dev">
        <p class="note">Essais et outils : rien ici ne touche aux données.</p>
        ${voice}
        <div class="btns two"><button type="button" class="btn ghost" data-act="test-voice">TESTER LA VOIX</button><button type="button" class="btn ghost" data-act="test-sound">TESTER LES SONS</button></div>
        <button type="button" class="btn ghost" data-act="test-vibrate">TESTER LA VIBRATION</button>
        ${vr ? `<div class="vibe ${vibeResult === 'sent' ? '' : 'bad'}" role="status"><b>${vr[0]}</b><span>${vr[1]}</span>${store.settings.vibrate ? '' : '<span>Le réglage « Vibrations » est sur NON : en partie, rien ne vibrera.</span>'}</div>` : ''}
        <a class="lrow" href="${store.maquette ? '#/sommaire' : '?maquette#/sommaire'}">${ico('menu')}<span><b>Sommaire de maquette</b><small>Données fictives, sans toucher aux tiennes</small></span>${ico('chev')}</a>
        ${journalBlock()}
        <div class="sec">Diagnostic</div><p class="diag" id="diag">${esc(diagnostic())}</p><button type="button" class="btn ghost" data-act="copy-diag">COPIER LE DIAGNOSTIC</button></div>` : ''}
      <p class="note">${store.maquette ? 'Maquette : rien n\'est enregistré.' : 'Tout est enregistré sur ce téléphone, à chaque fléchette.'}</p>
    </div></div>`;
}

export const actions = {
  journal(v) { saveSetting('journal', v === '1'); setJournal(v === '1'); if (v === '1') log('appli', 'journal allumé'); refresh(); },
  'journal-backup'(v) { saveSetting('journalInBackup', v === '1'); refresh(); },
  'journal-view'() { jr.view = !jr.view; refresh(); },
  'journal-clear'() { clearJournal(); jr.msg = 'Journal vidé.'; refresh(); },
  async 'journal-export'() {
    const text = journalText(`Strela v${BUILD.version} · ${diagnostic()}`);
    const m = await deliverFile({ name: journalFileName(), mime: 'text/plain', bytes: new TextEncoder().encode(text) });
    jr.msg = m ? m.replace(/^Image enregistrée/, 'Fichier enregistré').replace(/^Image partagée/, 'Fichier partagé').replace(/^Image/, 'Fichier') : '';
    refresh();
  },
  's2-info'(k) { if (s2.info.has(k)) s2.info.delete(k); else s2.info.add(k); refresh(); },
  's2-diag'() { s2.diag = !s2.diag; refresh(); },
  theme(v) { saveSetting('theme', v); applyTheme(); refresh(); },
  'heat-scale'(v) { if (HEAT_SCALES.includes(v)) saveSetting('heatScale', v); refresh(); },
  night(v) { saveSetting('night', v === '1'); applyTheme(); refresh(); },
  anim(v) { saveSetting('anim', v === '1'); applyTheme(); refresh(); },
  vibrate(v) { saveSetting('vibrate', v === '1'); if (v === '1') buzz(BUZZ.dart); refresh(); },
  sound(v) { saveSetting('sound', v === '1'); if (v === '1') sound('validate'); refresh(); },
  voice(v) { saveSetting('voice', v === '1'); if (v === '1') say('Annonces vocales activées'); refresh(); },
  // Dans le clic (geste de l'utilisateur), même si le réglage est sur NON : on veut entendre.
  'test-voice'() { say('Strela. Guillaume, il reste quarante. Cent quatre-vingts !', { force: true }); setTimeout(refresh, 600); },
  'test-sound'() { ['single', 'double', 'triple', 'miss', 'bust', 'validate', 'finish'].forEach((k, i) => setTimeout(() => sound(k, { force: true }), i * 420)); },
  // Appelé dans le clic (geste de l'utilisateur), sans tenir compte du réglage : on veut savoir si le téléphone vibre.
  'test-vibrate'() { vibeResult = buzz(BUZZ.test, { force: true }); refresh(); },
  // Sauvegarde : partagée par le menu d'Android (Drive…) si le téléphone le propose pour ce fichier, sinon téléchargée.
  async 'backup-export'() {
    const name = backupFileName();
    const data = exportBackup(BUILD.version);
    const text = JSON.stringify(data);
    const blob = new Blob([text], { type: 'application/json' });
    const sm = `${plural(data.players.length, 'joueur', 'joueurs')} et ${plural(data.games.length, 'partie', 'parties')}`;
    Object.assign(bk, { preview: null, ask: null, error: '' });
    // Lot 5 : dans l'APK, Téléchargements/Strela/<nom> puis menu de partage d'Android (Drive, mail…).
    if (isApk()) {
      const r = callJson('saveBackup', name, text, true);
      bk.done = r && r.ok ? `${r.path} enregistré (${sm}). Menu de partage ouvert.` : `Export impossible : ${(r && r.error) || 'passerelle muette'}.`;
      if (location.hash !== '#/reglages') go('#/reglages'); else refresh();
      return;
    }
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        bk.done = `${name} partagé (${sm}).`;
        refresh();
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // partage annulé
    }
    download(blob, name);
    bk.done = `${name} enregistré dans les téléchargements (${sm}).`;
    refresh();
  },
  async 'issue-retry'() { await resaveAll(); refresh(); },
  'issue-reload'() { location.reload(); },
  async 'issue-export'() { await actions['backup-export'](); go('#/reglages'); },
  'update-check'() { call('checkUpdate'); upd = { ...(upd || {}), state: 'checking', msg: '' }; refresh(); },
  'update-install'() { call('installUpdate'); },
  'auto-update'(v) { saveSetting('autoUpdate', v === '1'); refresh(); },
  'update-snooze'() { const u = updateInfo(); saveSetting('updSnooze', { v: u.latest || '', until: Date.now() + SNOOZE_DAYS * 86400000 }); refresh(); },
  'pad-ring'(v) { saveSetting('padRing', v === '1'); refresh(); },
  'voice-input'(v) { saveSetting('voiceInput', v === '1'); refresh(); }, // lot 9.3
  'zone-pad'(v) { if (v === 'rangees' || v === 'secteur') saveSetting('zonePad', v); refresh(); },
  'mode-train'(v) { setMode('train', v === '1'); refresh(); },
  'mode-soiree'(v) { setMode('soiree', v === '1'); refresh(); },
  'mode-online'(v) { setMode('online', v === '1'); refresh(); }, // lot 9.2
  autoBackup(v) { saveSetting('autoBackup', v === '1'); refresh(); }, // lot 9
  'show-update'() {
    revealUpdate = true;
    if (location.hash !== '#/reglages') go('#/reglages'); else refresh();
  },
  'backup-mode'(m) { bk.ask = m === 'replace' ? 'replace' : 'merge'; refresh(); },
  'backup-no'() { bk.ask = null; refresh(); },
  'backup-cancel'() { Object.assign(bk, { preview: null, ask: null }); refresh(); },
  'backup-yes'() {
    if (!bk.preview || !bk.ask) return;
    const c = applyImport(bk.preview, bk.ask);
    bk.done = bk.ask === 'replace'
      ? `Données remplacées : ${plural(store.players.length, 'joueur', 'joueurs')}, ${plural(store.games.length + store.ckGames.length + (store.current || store.ck ? 1 : 0), 'partie', 'parties')}.`
      : `Fusion faite : ${plural(c.playersAdded, 'joueur ajouté', 'joueurs ajoutés')}, ${plural(c.gamesAdded, 'partie ajoutée', 'parties ajoutées')}.`;
    Object.assign(bk, { preview: null, ask: null });
    applyTheme();
    refresh();
  },
  async 'copy-diag'(arg, el) {
    const text = diagnostic();
    try { await navigator.clipboard.writeText(text); el.textContent = 'COPIÉ'; } catch (e) { el.textContent = 'COPIE IMPOSSIBLE : RECOPIER LA LIGNE'; }
  },
};
