// Lot 7.8 (maquette, ?maquette seulement) : accueil redessiné, et page des nouveautés (changelog).
// Deux variantes à comparer au sommaire :
// - A « tableau de bord » : bande rouge STRELA, action principale, soirée, deux cartes vivantes (dernière partie,
//   en tête du classement sur 30 jours), puis six raccourcis avec un chiffre chacun.
// - B « console » : titre en grand, menu en lignes numérotées façon pupitre (01 JOUEURS ……… 6), action principale
//   en bas, sous le pouce.
// Mêmes liens et mêmes actions que l'accueil actuel (home.js) ; rien de neuf n'est enregistré.
import { store, activePlayers, playerById, soireeTotal } from '../../store.js';
import { esc, ico, plural, when, topBar, avg, maquetteButtons } from '../../dom.js';
import { avatarHtml } from '../../avatars.js';
import { BUILD } from '../../build.js';
import { playerStats, inPeriod, gameWinner } from '../../../engine/stats.js';
import { storageBanner, updateBadge } from '../settings.js';
import { CHANGELOG } from '../../changelog.js';
import { resumeButtonHtml } from '../home.js';

export const HOME2_VARIANTS = Object.freeze(['tableau', 'console']);
let variant = 'tableau';
export function setHome2Variant(v) { variant = HOME2_VARIANTS.includes(v) ? v : 'tableau'; }
export const home2Variant = () => variant;

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

export function home2() {
  const resume = resumeButtonHtml();
  const n = activePlayers().length;
  const g = store.games.length;
  const newGame = `<a class="btn ${resume ? 'accent-line' : 'accent'} big" href="#/nouvelle">${ico('target')} NOUVELLE PARTIE</a>`;
  const soiree = store.soiree
    ? `<a class="btn soiree-btn on" href="#/soiree"><span class="t">${ico('glass')} SOIRÉE EN COURS</span><small>${plural(store.soiree.players.length, 'JOUEUR', 'JOUEURS')} · ${plural(soireeTotal(), 'VERRE', 'VERRES')}</small><span class="go">${ico('chev')}</span></a>`
    : `<a class="btn ghost soiree-btn" href="#/soiree"><span class="t">${ico('glass')} DÉBUTER UNE SOIRÉE</span></a>`;
  const lastAt = g ? [...store.games].sort((a, b) => b.startedAt - a.startedAt)[0].startedAt : null;
  const items = [
    ['#/joueurs', 'players', 'Joueurs', n ? plural(n, 'joueur', 'joueurs') : 'aucun'],
    ['#/historique', 'history', 'Historique', g ? plural(g, 'partie', 'parties') : 'aucune partie'],
    ['#/stats', 'stats', 'Stats', 'par joueur'],
    ['#/classement', 'trophy', 'Classement', 'palmarès'],
    ['#/reglages', 'settings', 'Réglages', 'thème · son'],
    ['#/nouveautes', 'news', 'Nouveautés', 'ce qui change'],
  ];
  // Version en bas de page (demande de Guillaume), un appui ouvre les nouveautés.
  const foot = `<footer class="home-foot foot2"><a class="foot-ver" href="#/nouveautes">VERSION ${esc(BUILD.version)}</a><span>${store.maquette ? 'Maquette · données fictives' : 'Enregistré sur ce téléphone'} · Orbital VKL</span></footer>
    ${store.maquette ? `<div class="mq-row">${maquetteButtons('mq')}</div>` : ''}`;

  if (variant === 'console') {
    const rows = items.map(([href, icon, label, sub], i) => `<li><a href="${href}"><span class="no">${String(i + 1).padStart(2, '0')}</span>${ico(icon)}<b>${label}</b><span class="lead" aria-hidden="true"></span><span class="sub">${sub}</span>${href === '#/nouveautes' ? newsDot() : ''}</a></li>`).join('');
    return `<div class="screen home2 v-console">
      <header class="c-head"><h1 class="home-title" data-shrink>STRELA</h1><div class="c-meta"><span>COMPTEUR DE FLÉCHETTES X01</span></div></header>
      <main class="c-main">${storageBanner()}${updateBadge()}
        <div class="c-status"><span>${lastAt ? `DERNIÈRE PARTIE · ${when(lastAt)}` : 'AUCUNE PARTIE'}</span>${store.soiree ? '<span class="on">SOIRÉE EN COURS</span>' : ''}</div>
        <ol class="c-menu">${rows}</ol>
        <div class="c-actions">${resume}${soiree}${newGame}</div>
      </main>${foot}</div>`;
  }
  const tiles = items.map(([href, icon, label, sub]) => `<a class="tile2" href="${href}">${ico(icon)}<b data-shrink>${label}</b><span data-shrink>${sub}</span>${href === '#/nouveautes' ? newsDot() : ''}</a>`).join('');
  return `<div class="screen home2 v-tableau">
    <header class="t-head"><h1 class="home-title" data-shrink>STRELA</h1><p>Compteur de fléchettes X01</p></header>
    <main class="t-main">${storageBanner()}${updateBadge()}
      ${resume}${newGame}${soiree}
      <div class="hcards">${lastGameCard()}${leaderCard()}</div>
      <nav class="tiles2" aria-label="Menu">${tiles}</nav>
    </main>${foot}</div>`;
}

// ------------------------------------------------------------------ nouveautés
const DATE = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][m - 1]} ${y}`; };

export function changelogScreen() {
  const cur = BUILD.version;
  return `<div class="screen news2">${topBar('Nouveautés', '#/')}
    <div class="pad">
      <p class="note">Installée : <b>v${esc(cur)}</b>. Ce qui change à chaque version, de la plus récente à la plus ancienne.</p>
      <ol class="clog">${CHANGELOG.map(e => `<li class="${e.v === cur ? 'cur' : ''}${e.date ? '' : ' nodate'}">
        <div class="ch"><b class="v">v${esc(e.v)}</b><span class="t">${esc(e.title)}</span>${e.v === cur ? '<span class="tag inv">INSTALLÉE</span>' : !e.date && e.v > cur ? '<span class="tag">À VENIR</span>' : ''}</div>
        ${e.date ? `<span class="d">${DATE(e.date)}</span>` : ''}
        <ul>${e.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></li>`).join('')}</ol>
    </div></div>`;
}
