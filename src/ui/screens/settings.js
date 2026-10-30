// Réglages : thème Auto / Sombre / Clair (« strela.theme »), mode nuit (option du sombre : console en rouge
// atténué, comme Grafit), vibrations. Les mêmes commandes servent au menu pause du jeu.
import { store, saveSetting } from '../store.js';
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
  const b = (v, l) => `<button type="button" data-act="theme" data-arg="${v}" aria-pressed="${t === v}">${l}</button>`;
  return `<div class="seg" role="group" aria-label="Thème">${b('auto', 'Auto')}${b('dark', 'Sombre')}${b('light', 'Clair')}</div>
    <div>
      <div class="row"><div class="lbl"><b>Mode nuit</b><small>${dark ? 'Console en rouge atténué, pour la pénombre.' : 'Option du thème sombre.'}</small></div>${toggle('night', store.settings.night && dark, !dark)}</div>
      <div class="row"><div class="lbl"><b>Vibrations</b><small>Courte à chaque fléchette, longue sur un bust.</small></div>${toggle('vibrate', store.settings.vibrate)}</div>
    </div>`;
}

export function settingsScreen() {
  return `<div class="screen">${topBar('Réglages', '#/')}
    <div class="pad">
      <div class="sec">Affichage</div>
      ${themeControls()}
      <p class="note">Auto suit le réglage du téléphone. Le mode nuit ne s'applique qu'en sombre.</p>
      <div class="sec">Vibrations</div>
      <button type="button" class="btn ghost" data-act="test-vibrate">ESSAYER LES VIBRATIONS</button>
      <div class="sec">À propos</div>
      <div class="kv"><span>Version</span><b>${esc(BUILD.version)}</b></div>
      <div class="kv"><span>Tests du moteur</span><b>${esc(BUILD.pass)} / ${esc(BUILD.total)}</b></div>
      <div class="kv"><span>Construit le</span><b class="small" style="white-space:normal;text-align:right">${esc(BUILD.date)}</b></div>
      <div class="kv"><span>Commit</span><b>${esc(BUILD.commit)}</b></div>
      <p class="note">Maquette du lot 1 : les joueurs et les parties sont fictifs et rien n'est enregistré (sauf ces réglages). La sauvegarde arrive au lot 2.</p>
      <div style="margin-top:16px"><a class="btn ghost" href="#/sommaire">SOMMAIRE DE MAQUETTE</a></div>
    </div></div>`;
}

export const actions = {
  theme(v) { saveSetting('theme', v); applyTheme(); refresh(); },
  night(v) { saveSetting('night', v === '1'); applyTheme(); refresh(); },
  vibrate(v) { saveSetting('vibrate', v === '1'); if (v === '1') buzz(BUZZ.dart); refresh(); },
  'test-vibrate'() { buzz([12, 300, 12, 300, 450]); },
};
