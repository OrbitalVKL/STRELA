// Accueil (version 0.8.0, refonte du lot 7.8 ; variante A « tableau de bord » retenue par Guillaume le 13/11/2026 —
// la B « console » est abandonnée) et page des nouveautés (changelog).
// Bande rouge STRELA, REPRENDRE ou accueil du premier lancement, action principale, soirée, deux cartes vivantes
// (dernière partie, en tête du classement sur 30 jours), puis six raccourcis avec un chiffre chacun. Version en bas
// de page (un appui ouvre les nouveautés) ; repère NOUVEAU sur Nouveautés tant que la page de la version installée
// n'a pas été ouverte (localStorage « strela.news »).
import { store, activePlayers, playerById, soireeTotal, appModes, setupDone, firstRun } from '../../store.js';
import { isApk } from '../../native.js';
import { sessionValue, EXERCISES } from '../../../engine/training.js';
import { fmtValue, sessionTitle } from '../training.js';
import { drinksText } from '../../../engine/alcohol.js';
import { backFrom } from '../../nav.js';
import { esc, ico, plural, when, topBar, avg, maquetteButtons } from '../../dom.js';
import { avatarHtml } from '../../avatars.js';
import { BUILD } from '../../build.js';
import { playerStats, inPeriod, gameWinner } from '../../../engine/stats.js';
import { storageBanner, updateBadge } from '../settings.js';
import { CHANGELOG } from '../../changelog.js';
import { resumeButtonHtml, welcomeHtml, savedLabel } from '../home.js';

const NEWS_KEY = 'strela.news';
const newsSeen = () => { try { return localStorage.getItem(NEWS_KEY) === BUILD.version; } catch (e) { return true; } };
const markNewsSeen = () => { try { localStorage.setItem(NEWS_KEY, BUILD.version); } catch (e) { /* stockage refusé */ } };

/** Joueur en tête (meilleure moyenne sur 30 jours, au moins 2 parties), ou null. */
function leader() {
  const games = inPeriod(store.games, '30j');
  let best = null;
  for (const p of activePlayers()) {
    const s = playerStats(games, p.id);
    if (s.played >= 2 && s.average !== null && (!best || s.average > best.avg)) best = { p, avg: s.average, played: s.played };
  }
  return best;
}

function lastGameCard() {
  const g = [...store.games].sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!g) return '';
  const w = gameWinner(g);
  return `<a class="hcard" href="#/partie/${esc(g.id)}"><small>DERNIÈRE PARTIE</small>
    <span class="avs">${g.config.players.slice(0, 3).map(id => avatarHtml(playerById(id), 26)).join('')}${g.config.players.length > 3 ? `<small>+${g.config.players.length - 3}</small>` : ''}</span>
    <b>${w ? `${ico('trophy')} <span class="nm ell">${esc(playerById(w).name)}</span>` : g.abandoned ? 'ABANDONNÉE' : 'EN COURS'}</b>
    <span class="d">${when(g.startedAt)} · ${g.config.startScore}</span></a>`;
}

function leaderCard() {
  const l = leader();
  if (!l) return '';
  return `<a class="hcard" href="#/classement"><small>EN TÊTE · 30 JOURS</small>
    <span class="avs">${avatarHtml(l.p, 26)}</span>
    <b><span class="nm ell">${esc(l.p.name)}</span></b>
    <span class="d">MOY. ${avg(l.avg)} · ${plural(l.played, 'partie', 'parties')}</span></a>`;
}

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

/** Dernière séance d'entraînement (accueil en mode entraînement). */
function lastSessionCard() {
  const r = store.trainings[0];
  if (!r) return '';
  const sv = sessionValue(r);
  return `<a class="hcard" href="#/entrainement/seance/${esc(r.id)}"><small>DERNIÈRE SÉANCE</small>
    <b class="ell">${esc(sessionTitle(r))}</b><span class="d">${when(r.startedAt)}${sv ? ` · ${fmtValue(sv)}` : ''}</span></a>`;
}

export function home2() {
  const modes = appModes();
  const first = firstRun();
  const resume = resumeButtonHtml();
  const welcome = modes.soiree && !first ? welcomeHtml(resume) : { html: '', first: false };
  const n = activePlayers().length;
  const g = store.games.length;
  const lead = first ? welcomeCard() : setupDone() ? '' : setupCard();
  const strong = resume || welcome.html || lead;
  // Une seule action forte en aplat rouge : NOUVELLE PARTIE (soirée) ou ENTRAÎNEMENT (entraînement seul), sauf derrière
  // REPRENDRE ou l'accueil du premier lancement.
  const newGame = modes.soiree ? `<a class="btn ${strong ? 'accent-line' : 'accent'} big" href="#/nouvelle">${ico('target')} NOUVELLE PARTIE</a>` : '';
  const soiree = !modes.soiree ? '' : store.soiree
    ? `<a class="btn soiree-btn on" href="#/soiree"><span class="t">${ico('glass')} SOIRÉE EN COURS</span><small>${plural(store.soiree.players.length, 'JOUEUR', 'JOUEURS')} · ${drinksText(soireeTotal()).toUpperCase()}</small><span class="go">${ico('chev')}</span></a>`
    : welcome.first ? '' : `<a class="btn ghost soiree-btn" href="#/soiree"><span class="t">${ico('glass')} DÉBUTER UNE SOIRÉE</span></a>`;
  // Lot 8 : entraînement solo, à côté de la partie et de la soirée ; seul mode : l'action principale.
  const trainMain = modes.train && !modes.soiree;
  const train = !modes.train ? '' : store.tr
    ? `<a class="btn tr-btn on" href="#/entrainement"><span class="t">${ico('sniper')} ENTRAÎNEMENT EN COURS</span><small>${plural(store.tr.darts.length, 'FLÉCHETTE', 'FLÉCHETTES')}</small><span class="go">${ico('chev')}</span></a>`
    : trainMain ? `<a class="btn ${strong ? 'accent-line' : 'accent'} big tr-btn" href="#/entrainement">${ico('sniper')} S'ENTRAÎNER</a>`
      : welcome.first ? '' : `<a class="btn ghost tr-btn" href="#/entrainement"><span class="t">${ico('sniper')} ENTRAÎNEMENT SOLO</span></a>`;
  const nt = store.trainings.length;
  const items = modes.soiree
    ? [
      ['#/joueurs', 'players', 'Joueurs', n ? plural(n, 'joueur', 'joueurs') : 'aucun'],
      ['#/historique', 'history', 'Historique', g ? plural(g, 'partie', 'parties') : 'aucune partie'],
      ['#/stats', 'stats', 'Stats', 'par joueur'],
      ['#/classement', 'trophy', 'Classement', 'palmarès'],
      ['#/reglages', 'settings', 'Réglages', 'modes · thème'],
      ['#/nouveautes', 'news', 'Nouveautés', 'ce qui change'],
    ]
    : [
      ['#/entrainement/stats', 'stats', 'Stats', nt ? plural(nt, 'séance', 'séances') : 'aucune séance'],
      ['#/armurerie', 'wrench', 'Armurerie', plural(store.dartSets.filter(x => !x.archived).length, 'jeu', 'jeux')],
      ['#/conseils', 'info', 'Conseils', '4 fiches'],
      ['#/tutoriel', 'play', 'Tutoriel', 'en 6 pages'],
      ['#/reglages', 'settings', 'Réglages', 'modes · thème'],
      ['#/nouveautes', 'news', 'Nouveautés', 'ce qui change'],
    ];
  // Version en bas de page (demande de Guillaume), un appui ouvre les nouveautés.
  const foot = `<footer class="home-foot"><span>${savedLabel()} · Orbital VKL</span><a class="home-ver" href="#/nouveautes">v${esc(BUILD.version)}</a></footer>
    ${store.maquette ? `<div class="mq-row">${maquetteButtons('mq')}</div>` : ''}`;

  const tiles = items.map(([href, icon, label, sub]) => `<a class="tile2" href="${href}">${ico(icon)}<b data-shrink>${label}</b><span data-shrink>${sub}</span>${href === '#/nouveautes' && !newsSeen() ? newsDot() : ''}</a>`).join('');
  const cards = modes.soiree ? `${lastGameCard()}${leaderCard()}` : lastSessionCard();
  return `<div class="screen home2 v-tableau">
    <header class="t-head"><h1 class="home-title" data-shrink>STRELA</h1><p>${modes.soiree ? 'Compteur de fléchettes · X01 · Cricket' : 'Entraînement aux fléchettes'}</p></header>
    <main class="t-main">${storageBanner()}${updateBadge()}
      ${lead}${welcome.html}${resume}${trainMain ? `${train}${newGame}` : `${newGame}${soiree}${train}`}
      <div class="hcards">${cards}</div>
      <nav class="tiles2" aria-label="Menu">${tiles}</nav>
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
