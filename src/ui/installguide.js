// Strela — guide d'installation de l'APK (lot 8 du 23/11/2026, 9.1 et 9.2), le même dans l'appli (#/installer :
// écran de bienvenue, Réglages) et sur la page web installer.html (publiée avec le site). Sans DOM ni magasin : du HTML
// et des dessins SVG (téléphone schématique, jetons de theme.css), pour que la page web l'utilise telle quelle.
// Lien stable : la dernière release du dépôt, fichier strela.apk (apk.yml publie chaque version en release apk-vX.Y.Z,
// la plus récente est la « latest » de GitHub) ; aucune migration : les données sont gardées d'une version à l'autre.

export const APK_LATEST = 'https://github.com/OrbitalVKL/STRELA/releases/latest/download/strela.apk';
export const INSTALL_PAGE = 'https://orbitalvkl.github.io/STRELA/installer.html';

const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Téléphone schématique : barre du haut, puis le contenu (`body`, SVG dans un cadre 200 × 300). */
const phone = (body, label) => `<svg class="igph" viewBox="0 0 220 340" role="img" aria-label="${escH(label)}">
  <rect class="ig-frame" x="4" y="4" width="212" height="332"/><rect class="ig-screen" x="14" y="24" width="192" height="292"/>
  <rect class="ig-notch" x="90" y="10" width="40" height="6"/>${body}</svg>`;
const txt = (x, y, s, cls = 'ig-t', anchor = 'start') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${escH(s)}</text>`;
const btn = (x, y, w, s, on = false) => `<rect class="ig-btn${on ? ' on' : ''}" x="${x}" y="${y}" width="${w}" height="26"/>${txt(x + w / 2, y + 17, s, on ? 'ig-bt on' : 'ig-bt', 'middle')}`;
const finger = (x, y) => `<g class="ig-finger"><circle cx="${x}" cy="${y}" r="9"/><circle cx="${x}" cy="${y}" r="15" class="ig-halo"/></g>`;

/** Les étapes du guide : { title, text, svg }. */
export function installSteps() {
  return [
    { title: 'Télécharger', text: 'Ouvre le lien sur le téléphone (Chrome) : strela.apk se télécharge. Touche la notification, ou Téléchargements › strela.apk.',
      svg: phone(`${txt(26, 52, 'Téléchargements', 'ig-h')}<rect class="ig-card" x="24" y="68" width="172" height="46"/>${txt(36, 88, 'strela.apk')}${txt(36, 104, 'Téléchargement terminé', 'ig-s')}${btn(118, 124, 78, 'OUVRIR', true)}${finger(160, 140)}`, 'Téléchargement de strela.apk') },
    { title: 'Autoriser cette source', text: 'La première fois, Android bloque : « Pour votre sécurité… ». Touche PARAMÈTRES, active « Autoriser cette source » (pour Chrome), puis reviens en arrière.',
      svg: phone(`<rect class="ig-card" x="24" y="60" width="172" height="120"/>${txt(36, 82, 'Pour votre sécurité,', 'ig-t')}${txt(36, 98, 'les applis inconnues', 'ig-s')}${txt(36, 112, 'de cette source sont', 'ig-s')}${txt(36, 126, 'bloquées.', 'ig-s')}${btn(36, 142, 70, 'ANNULER')}${btn(114, 142, 76, 'PARAMÈTRES', true)}${finger(152, 156)}
        <rect class="ig-card" x="24" y="200" width="172" height="44"/>${txt(36, 226, 'Autoriser')}<rect class="ig-sw on" x="160" y="214" width="26" height="14"/><circle class="ig-knob" cx="179" cy="221" r="6"/>`, 'Autoriser cette source') },
    { title: 'Play Protect', text: 'Si Play Protect affiche « Appli non analysée » ou « bloquée », touche PLUS D\'INFOS puis INSTALLER SANS ANALYSER. Strela ne vient pas du Play Store : c\'est normal.',
      svg: phone(`<rect class="ig-card" x="24" y="70" width="172" height="150"/>${txt(36, 94, 'Play Protect', 'ig-h')}${txt(36, 114, 'Appli non analysée', 'ig-t')}${txt(36, 132, 'Ce développeur n\'est', 'ig-s')}${txt(36, 146, 'pas connu de Google.', 'ig-s')}
        ${txt(36, 172, '▾ Plus d\'infos', 'ig-s')}${btn(36, 182, 154, 'INSTALLER SANS ANALYSER', true)}${finger(150, 196)}`, 'Play Protect : installer sans analyser') },
    { title: 'Installer', text: 'Touche INSTALLER. Les versions suivantes s\'installent depuis l\'appli (Réglages › Mises à jour), par-dessus : tes données restent.',
      svg: phone(`<rect class="ig-card" x="24" y="90" width="172" height="110"/>${txt(36, 116, 'Strela', 'ig-h')}${txt(36, 136, 'Voulez-vous installer', 'ig-s')}${txt(36, 150, 'cette application ?', 'ig-s')}${btn(36, 164, 70, 'ANNULER')}${btn(114, 164, 76, 'INSTALLER', true)}${finger(152, 178)}`, 'Installer') },
  ];
}

/** Guide complet en HTML (liste numérotée, un dessin par étape). `version` : version publiée, si connue. */
export function installGuideHtml({ version = '' } = {}) {
  return `<div class="iguide">
    <a class="btn accent big igdl" href="${APK_LATEST}" rel="noopener">TÉLÉCHARGER STRELA${version ? ` · v${escH(version)}` : ''}</a>
    <p class="note">Lien stable : il mène toujours à la dernière version (Android 11 ou plus). Pas de Play Store pour l'instant : l'appli s'installe à la main, une fois.</p>
    <ol class="igsteps">${installSteps().map((s, i) => `<li><div class="igtx"><b><span class="ign">${i + 1}</span>${escH(s.title)}</b><p>${escH(s.text)}</p></div>${s.svg}</li>`).join('')}</ol>
  </div>`;
}
