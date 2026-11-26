// Accueil (version 0.8.0, refonte du lot 7.8 ; variante A « tableau de bord » retenue par Guillaume le 13/11/2026 —
// la B « console » est abandonnée) et page des nouveautés (changelog).
// 0.26.0 (refonte des infos, proposition A « deux espaces ») : bande rouge STRELA, bascule PARTIES | ENTRAÎNEMENT,
// REPRENDRE ou accueil du premier lancement, action principale de l'espace, six tuiles (pictogramme et nom), Réglages et
// version en bas de page (un appui ouvre les nouveautés) ; repère NOUVEAU tant que la page de la version installée n'a
// pas été ouverte (localStorage « strela.news »).
import { store, soireeTotal, appModes, setupDone, firstRun, profilePlayer } from '../../store.js';
import { currentSpace, spaceSwitch } from '../infos.js';
import { onlineGame, onlineSupport } from '../../online.js';
import { isApk } from '../../native.js';
import { drinksText } from '../../../engine/alcohol.js';
import { backFrom } from '../../nav.js';
import { esc, ico, plural, topBar, maquetteButtons } from '../../dom.js';
import { BUILD } from '../../build.js';
import { storageBanner, updateBadge } from '../settings.js';
import { CHANGELOG } from '../../changelog.js';
import { resumeButtonHtml, welcomeHtml } from '../home.js';

const NEWS_KEY = 'strela.news';
const newsSeen = () => { try { return localStorage.getItem(NEWS_KEY) === BUILD.version; } catch (e) { return true; } };
const markNewsSeen = () => { try { localStorage.setItem(NEWS_KEY, BUILD.version); } catch (e) { /* stockage refusé */ } };

const newsDot = () => `<span class="newdot" aria-label="Nouveau">NOUVEAU</span>`;

/**
 * Bienvenue (lot 8 du 23/11, 6.2) : au premier lancement, sur l'accueil, le choix des modes puis la mise en place guidée
 * (#/bienvenue) ; tant qu'elle n'est pas terminée, une carte « Terminer la mise en place ». L'appli Android propose aussi
 * d'importer une sauvegarde (de la version web ou d'un autre téléphone).
 */
function welcomeCard() {
  const m = appModes();
  const sw = (k, on, label, sub) => `<button type="button" class="modepick" data-act="${k === 'train' ? 'mode-train' : 'mode-soiree'}" data-arg="${on ? 0 : 1}" aria-pressed="${on}">${ico(k === 'train' ? 'sniper' : 'glass')}<span><b>${label}</b><small>${sub}</small></span><i class="tick">${on ? ico('check') : ''}</i></button>`;
  return `<section class="welcome w2" aria-label="Bienvenue"><b>BIENVENUE DANS STRELA</b>
    <p>Choisis comment tu veux t'en servir ; ça se change à tout moment dans les Réglages, sans rien perdre.</p>
    <div class="modepicks">${sw('train', m.train, 'Entraînement', 'Seul, pour progresser : exercices, jeux de cible, stats')}${sw('soiree', m.soiree, 'Soirée', 'À plusieurs : X01, Cricket, joueurs, verres, classement')}</div>
    <a class="btn accent big" href="#/bienvenue/nom">${ico('play')} COMMENCER LA MISE EN PLACE</a>
    <div class="btns two"><a class="btn ghost" href="#/tutoriel">TUTORIEL</a><button type="button" class="btn ghost" data-act="setup-skip">PLUS TARD</button></div>
    ${isApk() || store.mockApk ? '<label class="btn ghost wrap">IMPORTER UNE SAUVEGARDE<input type="file" accept="application/json,.json" data-backup hidden></label>' : ''}</section>`;
}
const setupCard = () => `<a class="btn setup-card" href="#/bienvenue">${ico('flag')}<span><b>TERMINER LA MISE EN PLACE</b><small>Ton nom, ton avatar, ton jeu de fléchettes</small></span>${ico('chev')}</a>`;

/** Lot 9.2 : entrée « En ligne » (partie en cours : REPRENDRE la mène au salon). */
function onlineEntry(og) {
  return og
    ? `<a class="btn online-btn on" href="#/enligne"><span class="t">${ico('phone')} PARTIE EN LIGNE</span><small>SALON ${esc(og.online.code)}</small><span class="go">${ico('chev')}</span></a>`
    : `<a class="btn ghost online-btn" href="#/enligne"><span class="t">${ico('phone')} EN LIGNE</span></a>`;
}

export function home2() {
  const modes = appModes();
  const first = firstRun();
  const resume = resumeButtonHtml();
  const welcome = modes.soiree && !first ? welcomeHtml(resume) : { html: '', first: false };
  const lead = first ? welcomeCard() : setupDone() ? '' : setupCard();
  const strong = resume || welcome.html || lead;
  // 0.26.0 (refonte des infos, proposition A « deux espaces », choix de Guillaume le 26/11 : « un menu d'accueil clair
  // avec le minimum d'infos ») : bascule PARTIES | ENTRAÎNEMENT, l'action principale de l'espace, puis six tuiles rangées
  // à l'identique des deux côtés (pictogramme et nom seulement).
  const sp = currentSpace();
  const og = onlineGame();
  let actions;
  if (sp === 'p') {
    const newGame = `<a class="btn ${strong ? 'accent-line' : 'accent'} big" href="#/nouvelle">${ico('target')} NOUVELLE PARTIE</a>`;
    const soiree = store.soiree
      ? `<a class="btn soiree-btn on" href="#/soiree"><span class="t">${ico('glass')} SOIRÉE EN COURS</span><small>${plural(store.soiree.players.length, 'JOUEUR', 'JOUEURS')} · ${drinksText(soireeTotal()).toUpperCase()}</small><span class="go">${ico('chev')}</span></a>`
      : welcome.first ? '' : `<a class="btn ghost" href="#/soiree">${ico('glass')} SOIRÉE</a>`;
    const online = og ? onlineEntry(og) : modes.online && onlineSupport().ok && !welcome.first ? `<a class="btn ghost" href="#/enligne">${ico('phone')} EN LIGNE</a>` : '';
    // Une séance d'entraînement en cours reste à un appui, même dans l'espace Parties.
    const tr = store.tr && modes.train ? `<a class="btn tr-btn on" href="#/entrainement"><span class="t">${ico('sniper')} ENTRAÎNEMENT EN COURS</span><small>${plural(store.tr.darts.length, 'FLÉCHETTE', 'FLÉCHETTES')}</small><span class="go">${ico('chev')}</span></a>` : '';
    actions = `${newGame}${store.soiree || og ? `${soiree}${online}` : soiree || online ? `<div class="btns two hduo">${soiree}${online}</div>` : ''}${tr}`;
  } else {
    actions = store.tr
      ? `<a class="btn tr-btn on" href="#/entrainement"><span class="t">${ico('sniper')} ENTRAÎNEMENT EN COURS</span><small>${plural(store.tr.darts.length, 'FLÉCHETTE', 'FLÉCHETTES')}</small><span class="go">${ico('chev')}</span></a>`
      : `<a class="btn ${strong ? 'accent-line' : 'accent'} big tr-btn" href="#/entrainement">${ico('sniper')} S'ENTRAÎNER</a>`;
  }
  const me = profilePlayer();
  const badges = me ? `#/joueur/${esc(me.id)}/badges` : '#/honneur';
  const items = sp === 'p'
    ? [['#/historique', 'history', 'Historique'], ['#/tableau/p', 'stats', 'Stats'], ['#/records/p', 'trophy', 'Records'],
      [badges, 'star', 'Badges'], ['#/joueurs', 'players', 'Joueurs'], ['#/classement', 'glass', 'Classement']]
    : [['#/seances', 'history', 'Séances'], ['#/tableau/e', 'stats', 'Stats'], ['#/records/e', 'trophy', 'Records'],
      [badges, 'star', 'Badges'], ['#/armurerie', 'wrench', 'Armurerie'], ['#/conseils', 'info', 'Conseils']];
  const tiles = items.map(([href, icon, label]) => `<a class="tile3" href="${href}">${ico(icon)}<b data-shrink>${label}</b></a>`).join('');
  // Version en bas de page (demande de Guillaume), un appui ouvre les nouveautés.
  const foot = `<footer class="home-foot"><a class="hset" href="#/reglages">${ico('settings')} RÉGLAGES</a><span class="hver">${!newsSeen() ? newsDot() : ''}<a class="home-ver" href="#/nouveautes">v${esc(BUILD.version)}</a></span></footer>
    ${store.maquette ? `<div class="mq-row">${maquetteButtons('mq')}</div>` : ''}`;
  return `<div class="screen home2 v-tableau">
    <header class="t-head"><h1 class="home-title" data-shrink>STRELA</h1><p>${sp === 'p' ? 'Compteur de fléchettes · X01 · Cricket' : 'Entraînement aux fléchettes'}</p></header>
    <main class="t-main">${storageBanner()}${updateBadge()}
      ${lead}${welcome.html}${spaceSwitch(sp)}${resume}${actions}
      <nav class="tiles3" aria-label="Menu">${tiles}</nav>
    </main>${foot}</div>`;
}

// ------------------------------------------------------------------ nouveautés
const DATE = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][m - 1]} ${y}`; };

export function changelogScreen() {
  const cur = BUILD.version;
  markNewsSeen();
  return `<div class="screen news2">${topBar('Nouveautés', backFrom('#/'))}
    <div class="pad">
      <p class="note">Installée : <b>v${esc(cur)}</b>. Ce qui change à chaque version, de la plus récente à la plus ancienne.</p>
      <ol class="clog">${CHANGELOG.map(e => `<li class="${e.v === cur ? 'cur' : ''}${e.date ? '' : ' nodate'}">
        <div class="ch"><b class="v">v${esc(e.v)}</b><span class="t">${esc(e.title)}</span>${e.v === cur ? '<span class="tag inv">INSTALLÉE</span>' : !e.date && e.v > cur ? '<span class="tag">À VENIR</span>' : ''}</div>
        ${e.date ? `<span class="d">${DATE(e.date)}</span>` : ''}
        <ul>${e.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></li>`).join('')}</ol>
    </div></div>`;
}
