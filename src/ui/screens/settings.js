// Réglages : thème Auto / Sombre / Clair (« strela.theme »), mode nuit (option du sombre : console en rouge
// atténué, comme Grafit), vibrations, animations (chiffres en rouleau, glissement du bandeau ; coupées d'office si le
// téléphone demande moins d'animations). Les mêmes commandes servent au menu pause du jeu.
import { store, saveSetting, reducedMotion } from '../store.js';
import { esc, topBar } from '../dom.js';
import { BUILD } from '../build.js';
import { refresh, buzz, BUZZ } from '../nav.js';

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
      <div class="row"><div class="lbl"><b>Vibrations</b><small>Courte à chaque fléchette, longue sur un bust.</small></div>${toggle('vibrate', store.settings.vibrate)}</div>
      <div class="row"><div class="lbl"><b>Animations</b><small>${reduced ? 'Coupées : le téléphone demande moins d\'animations.' : 'Chiffres qui roulent, bandeau du joueur qui glisse.'}</small></div>${toggle('anim', store.settings.anim && !reduced, reduced)}</div>
    </div>`;
}

// ------------------------------------------------------------------ test de vibration et diagnostic (lot 1.2)
let vibeResult = null; // dernier résultat de TESTER LA VIBRATION

const VIBE_TEXT = {
  absent: ['FONCTION ABSENTE', 'Ce navigateur ne sait pas faire vibrer le téléphone. L\'appli Android (lot 5) utilisera le vibreur natif.'],
  refused: ['REFUSÉE', 'Chrome a refusé la demande (navigator.vibrate a répondu « non ») : page pas encore touchée, ou onglet en arrière-plan.'],
  sent: ['ENVOYÉE', 'La demande est partie vers le téléphone (3 impulsions). Rien senti ? Chrome ne vibre pas en mode silencieux, et Android coupe les vibrations des pages quand le retour haptique est désactivé : Réglages Android › Son et vibreur › Vibreur et retour haptique.'],
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

/** Ligne de diagnostic : orientation, taille de l'écran en px CSS, police, mode d'affichage, version. */
export function diagnostic() {
  let orient = 'inconnue';
  try { orient = matchMedia('(orientation: landscape)').matches ? 'paysage' : 'portrait'; } catch (e) { /* rien */ }
  const type = (screen.orientation && screen.orientation.type) || '';
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  const fs = Math.round(fontScale() * 100);
  return `${orient}${type ? ` (${type})` : ''} · écran ${window.innerWidth}×${window.innerHeight} px · ×${String(dpr).replace('.', ',')}`
    + ` · police ${fs} % · ${displayMode()} · v${BUILD.version}`;
}

export function settingsScreen() {
  const vr = vibeResult && VIBE_TEXT[vibeResult];
  return `<div class="screen">${topBar('Réglages', '#/')}
    <div class="pad">
      <div class="sec">Affichage</div>
      ${themeControls()}
      <p class="note">Auto suit le réglage du téléphone. Le mode nuit ne s'applique qu'en sombre.</p>
      <div class="sec">Vibrations</div>
      <button type="button" class="btn ghost" data-act="test-vibrate">TESTER LA VIBRATION</button>
      ${vr ? `<div class="vibe ${vibeResult === 'sent' ? '' : 'bad'}" role="status"><b>${vr[0]}</b><span>${vr[1]}</span>${store.settings.vibrate ? '' : '<span>Le réglage « Vibrations » est sur NON : en partie, rien ne vibrera.</span>'}</div>` : ''}
      <div class="sec">À propos</div>
      <div class="kv"><span>Version</span><b>${esc(BUILD.version)}</b></div>
      <div class="kv"><span>Tests du moteur</span><b>${esc(BUILD.pass)} / ${esc(BUILD.total)}</b></div>
      <div class="kv"><span>Construit le</span><b class="small" style="white-space:normal;text-align:right">${esc(BUILD.date)}</b></div>
      <div class="kv"><span>Commit</span><b>${esc(BUILD.commit)}</b></div>
      <p class="note">Maquette (lot 1.2) : les joueurs et les parties sont fictifs et rien n'est enregistré (sauf ces réglages). La sauvegarde arrive au lot 2.</p>
      <div style="margin-top:16px"><a class="btn ghost" href="#/sommaire">SOMMAIRE DE MAQUETTE</a></div>
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
  // Appelé dans le clic (geste de l'utilisateur), sans tenir compte du réglage : on veut savoir si le téléphone vibre.
  'test-vibrate'() { vibeResult = buzz(BUZZ.test, { force: true }); refresh(); },
  async 'copy-diag'(arg, el) {
    const text = diagnostic();
    try { await navigator.clipboard.writeText(text); el.textContent = 'COPIÉ'; } catch (e) { el.textContent = 'COPIE IMPOSSIBLE : RECOPIER LA LIGNE'; }
  },
};
