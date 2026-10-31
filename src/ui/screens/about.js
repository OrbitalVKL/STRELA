// À propos (lot 6), depuis les Réglages : version et variante (web, appli Android GitHub ou Google Play), build,
// confidentialité (résumé + lien vers la politique publiée sur GitHub Pages, confidentialite.html), licences (police
// Martian Mono sous licence OFL, lisible dans l'appli ; bibliothèques AndroidX de l'APK), contact.
import { esc, topBar } from '../dom.js';
import { BUILD } from '../build.js';
import { store } from '../store.js';
import { refresh } from '../nav.js';
import { variant, nativeInfo, isApk } from '../native.js';

/** Politique de confidentialité publiée (adresse à donner à Google Play). */
export const PRIVACY_URL = 'https://orbitalvkl.github.io/STRELA/confidentialite.html';
/** Contact : champ « strela.contact » de package.json (rempli au build) ; à défaut, la marque à remplacer. */
export const CONTACT_PLACEHOLDER = '[E-MAIL DE CONTACT]';

export const VARIANT_LABELS = Object.freeze({
  web: 'Version web (navigateur)',
  github: 'Appli Android · GitHub',
  play: 'Appli Android · Google Play',
});

/** Variante affichée : celle de la coquille ; au sommaire de maquette, celle simulée (mockApk). */
export function shownVariant() {
  if (store.maquette && store.mockApk) return store.mockApk === 'play' ? 'play' : 'github';
  return variant();
}

const PRIVACY_TEXT = {
  web: 'La page est servie par GitHub Pages ; tes données ne quittent pas le navigateur.',
  github: 'Seule la recherche de mise à jour contacte GitHub (api.github.com) : elle ne transmet aucune de tes données, et se désactive dans les Réglages.',
  play: 'Cette version n\'a aucun accès à Internet.',
};

let licence = { open: false, text: '' };

export function aboutScreen() {
  const v = shownVariant();
  const info = isApk() ? nativeInfo() : null;
  const contact = BUILD.contact && BUILD.contact !== CONTACT_PLACEHOLDER ? BUILD.contact : '';
  // Dans l'APK, la politique s'ouvre dans le navigateur du téléphone (adresse publique) ; sur le web, à côté de la page.
  const privacyHref = v === 'web' ? 'confidentialite.html' : PRIVACY_URL;
  return `<div class="screen">${topBar('À propos', '#/reglages')}
    <div class="pad about">
      <div class="about-head"><img src="assets/icon-192.png" width="64" height="64" alt="">
        <div><b>STRELA</b><small>Compteur de fléchettes X01 · стрела = flèche</small></div></div>
      <div class="sec">Version</div>
      <div class="kv"><span>Version</span><b>${esc(BUILD.version)}</b></div>
      <div class="kv"><span>Variante</span><b class="ell">${esc(VARIANT_LABELS[v])}</b></div>
      ${info ? `<div class="kv"><span>Paquet</span><b class="small ell">${esc(info.package || '')}</b></div>` : ''}
      <div class="kv"><span>Tests</span><b>${esc(BUILD.pass)} / ${esc(BUILD.total)}</b></div>
      <div class="kv"><span>Construit le</span><b class="small" style="white-space:normal;text-align:right">${esc(BUILD.date)}</b></div>
      <div class="kv"><span>Commit</span><b>${esc(BUILD.commit)}</b></div>
      <div class="sec">Confidentialité</div>
      <p><b>Strela ne collecte, ne transmet ni ne partage aucune donnée.</b> Joueurs, photos, parties et réglages restent sur ce téléphone ; une sauvegarde ne part que si tu l'exportes toi-même.</p>
      <p class="dim">${esc(PRIVACY_TEXT[v])}</p>
      <a class="btn ghost" href="${privacyHref}" target="_blank" rel="noopener">POLITIQUE DE CONFIDENTIALITÉ</a>
      <div class="sec">Licences</div>
      <p><b>Martian Mono</b>, la police de Strela : © 2020 The Martian Mono Project Authors, sous licence SIL Open Font License 1.1 (OFL), embarquée telle quelle.</p>
      <button type="button" class="btn ghost" data-act="about-licence" aria-expanded="${licence.open}">${licence.open ? 'FERMER LA LICENCE' : 'LIRE LA LICENCE OFL'}</button>
      ${licence.open ? `<pre class="licence" tabindex="0">${esc(licence.text || 'Chargement…')}</pre>` : ''}
      ${v === 'web' ? '' : '<p>Appli Android : bibliothèques AndroidX Core et WebKit, © The Android Open Source Project, sous licence Apache 2.0.</p>'}
      <p>Strela, son icône et ses pictogrammes : dessinés pour Strela, © Orbital VKL.</p>
      <div class="sec">Contact</div>
      <div class="kv"><span>E-mail</span><b class="ell">${contact ? `<a href="mailto:${esc(contact)}">${esc(contact)}</a>` : esc(CONTACT_PLACEHOLDER)}</b></div>
    </div></div>`;
}

export const actions = {
  async 'about-licence'() {
    licence.open = !licence.open;
    refresh();
    if (licence.open && !licence.text) {
      try { licence.text = await (await fetch('assets/fonts/OFL.txt')).text(); } catch (e) { licence.text = 'Licence illisible ici : voir assets/fonts/OFL.txt.'; }
      refresh();
    }
  },
};
