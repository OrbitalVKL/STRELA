// Réglages : thème Auto / Sombre / Clair (« strela.theme »), mode nuit (option du sombre : console en rouge
// atténué, comme Grafit), sons et annonces vocales (lot 3), vibrations, animations (chiffres en rouleau, glissement du bandeau ; coupées d'office si le
// téléphone demande moins d'animations). Les mêmes commandes servent au menu pause du jeu.
import { store, saveSetting, reducedMotion, exportBackup, applyImport, importCounts } from '../store.js';
import { backupFileName, parseBackup, BackupError } from '../../data/backup.js';
import { esc, topBar, plural } from '../dom.js';
import { BUILD } from '../build.js';
import { refresh, buzz, BUZZ } from '../nav.js';
import { say, sound, voiceInfo } from '../feedback.js';

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
  sent: ['ENVOYÉE', 'La demande est partie vers le téléphone (3 impulsions). Rien senti ? Chrome ne vibre pas en mode silencieux, et Android coupe les vibrations des pages quand le retour haptique est désactivé : Réglages Android › Son et vibreur › Vibreur et retour haptique. Certains téléphones (Pixel) ne vibrent pas du tout pour une page web : l\'appli Android (lot 5) passera par le vibreur natif.'],
};

function displayMode() {
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
  const persist = { yes: 'persistant', no: 'non persistant (refusé par Chrome)', absent: 'persistant : fonction absente', error: 'persistant : erreur' }[d.persisted] || 'persistant : en attente';
  const base = d.error ? `base : ${d.error}` : `base v${d.version} · ${store.players.length} j. · ${store.games.length + (store.current ? 1 : 0)} p.`;
  return `${base}${d.unreadable ? ` · ${d.unreadable} illisible(s)` : ''} · stockage ${persist}`;
}

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
    const what = `${plural(sm.players, 'joueur', 'joueurs')} · ${plural(sm.games, 'partie', 'parties')}${sm.current ? ' · une partie en cours' : ''}`;
    const head = `<div class="bk-prev"><b>SAUVEGARDE DU ${esc(fmtDate(sm.exportedAt))}</b><span>${what}${sm.app ? ` · Strela v${esc(sm.app)}` : ''}</span><span class="small dim ell">${esc(bk.file)}</span></div>`;
    if (bk.ask === 'replace') {
      const nP = store.players.length, nG = store.games.length + (store.current ? 1 : 0);
      box = `${head}<div class="confirm" role="alertdialog" aria-label="Tout remplacer ?"><p class="alert-h">REMPLACER TOUTES LES DONNÉES ?</p>
        <p class="small">Les ${plural(nP, 'joueur', 'joueurs')} et ${plural(nG, 'partie', 'parties')} de ce téléphone seront effacés et remplacés par ceux de la sauvegarde (réglages compris).</p>
        <div class="btns two"><button type="button" class="btn" data-act="backup-no">NON</button><button type="button" class="btn alert" data-act="backup-yes">REMPLACER</button></div></div>`;
    } else if (bk.ask === 'merge') {
      const c = importCounts(bk.preview, 'merge');
      box = `${head}<div class="confirm warn" role="alertdialog" aria-label="Fusionner ?"><p><b>FUSIONNER ?</b></p>
        <p class="small">Ajoute ${plural(c.playersAdded, 'joueur', 'joueurs')} et ${plural(c.gamesAdded, 'partie', 'parties')} absents de ce téléphone. Rien n'est effacé ; ce qui existe déjà ici est gardé tel quel.${c.currentSkipped ? ' Une partie est déjà en cours ici : celle de la sauvegarde ira dans l\'historique, abandonnée.' : ''}</p>
        <div class="btns two"><button type="button" class="btn" data-act="backup-no">NON</button><button type="button" class="btn primary" data-act="backup-yes">FUSIONNER</button></div></div>`;
    } else {
      box = `${head}<div class="btns two"><button type="button" class="btn danger" data-act="backup-mode" data-arg="replace">REMPLACER TOUT</button><button type="button" class="btn" data-act="backup-mode" data-arg="merge">FUSIONNER</button></div>
        <button type="button" class="btn ghost" data-act="backup-cancel">ANNULER</button>`;
    }
  } else if (bk.done) {
    box = `<div class="vibe" role="status"><b>FAIT</b><span>${esc(bk.done)}</span></div>`;
  }
  return `<div class="btns two">${exp}${imp}</div>${box ? `<div class="bk" data-reveal>${box}</div>` : ''}
    <p class="note">EXPORTER : un fichier avec les joueurs (photos comprises), les parties et les réglages, à garder sur Drive ou ailleurs. IMPORTER : REMPLACER TOUT ou FUSIONNER (sans doublon), après un aperçu.</p>`;
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
  refresh();
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

export function settingsScreen() {
  const vr = vibeResult && VIBE_TEXT[vibeResult];
  return `<div class="screen">${topBar('Réglages', '#/')}
    <div class="pad">
      <div class="sec">Affichage</div>
      ${themeControls()}
      <p class="note">Auto suit le réglage du téléphone. Le mode nuit ne s'applique qu'en sombre.</p>
      <div class="sec">Son et voix</div>
      ${voiceBlock()}
      <div class="btns two" style="margin-top:10px"><button type="button" class="btn ghost" data-act="test-voice">TESTER LA VOIX</button><button type="button" class="btn ghost" data-act="test-sound">TESTER LES SONS</button></div>
      <div class="sec">Vibrations</div>
      <button type="button" class="btn ghost" data-act="test-vibrate">TESTER LA VIBRATION</button>
      ${vr ? `<div class="vibe ${vibeResult === 'sent' ? '' : 'bad'}" role="status"><b>${vr[0]}</b><span>${vr[1]}</span>${store.settings.vibrate ? '' : '<span>Le réglage « Vibrations » est sur NON : en partie, rien ne vibrera.</span>'}</div>` : ''}
      <div class="sec">Sauvegarde</div>
      ${backupBlock()}
      <div class="sec">À propos</div>
      <div class="kv"><span>Version</span><b>${esc(BUILD.version)}</b></div>
      <div class="kv"><span>Tests du moteur</span><b>${esc(BUILD.pass)} / ${esc(BUILD.total)}</b></div>
      <div class="kv"><span>Construit le</span><b class="small" style="white-space:normal;text-align:right">${esc(BUILD.date)}</b></div>
      <div class="kv"><span>Commit</span><b>${esc(BUILD.commit)}</b></div>
      <p class="note">${store.maquette
        ? 'Maquette : joueurs et parties fictifs, en mémoire. Rien n\'est enregistré, et les vraies données du téléphone ne sont pas touchées.'
        : 'Joueurs, parties et réglages sont enregistrés sur ce téléphone, à chaque fléchette. Le sommaire de maquette montre des données fictives sans toucher aux tiennes.'}</p>
      <div style="margin-top:16px"><a class="btn ghost" href="${store.maquette ? '#/sommaire' : '?maquette#/sommaire'}">SOMMAIRE DE MAQUETTE</a></div>
      <div class="sec">Diagnostic</div>
      <p class="diag" id="diag">${esc(diagnostic())}</p>
      <button type="button" class="btn ghost" data-act="copy-diag">COPIER LE DIAGNOSTIC</button>
    </div></div>`;
}

export const actions = {
  theme(v) { saveSetting('theme', v); applyTheme(); refresh(); },
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
  'backup-mode'(m) { bk.ask = m === 'replace' ? 'replace' : 'merge'; refresh(); },
  'backup-no'() { bk.ask = null; refresh(); },
  'backup-cancel'() { Object.assign(bk, { preview: null, ask: null }); refresh(); },
  'backup-yes'() {
    if (!bk.preview || !bk.ask) return;
    const c = applyImport(bk.preview, bk.ask);
    bk.done = bk.ask === 'replace'
      ? `Données remplacées : ${plural(store.players.length, 'joueur', 'joueurs')}, ${plural(store.games.length + (store.current ? 1 : 0), 'partie', 'parties')}.`
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
