// Jeu : branché sur le vrai moteur X01 ; la partie est enregistrée à chaque fléchette, ANNULER et VALIDER (store.js).
// Deux mises en page, même état (la rotation ne perd rien) :
// - portrait : bandeau du joueur actif (aplat de la couleur de son avatar, seule couleur de joueur à l'écran), reste
//   en très grand, 3 cases + total et finition à côté d'une petite cible (impacts), autres joueurs (neutres, le
//   suivant repéré), pavé S / D / T, 1 à 20,
//   25 · 50 · 0 · ANNULER ;
// - paysage : à gauche le même tableau de bord et RATÉ · ANNULER · VALIDER, à droite la cible, où l'on saisit au
//   doigt (loupe ×2,5 décalée, nom de la zone en gros, on glisse pour ajuster, on lâche pour compter ; un lâcher
//   hors de la cible ne compte rien).
// Après la 3e fléchette ou un bust, la volée reste affichée jusqu'à VALIDER (turn.js) ; ANNULER reste possible.
// À la validation, « À TOI, PSEUDO » occupe le haut de l'écran ~0,8 s, puis le bandeau du joueur glisse en place.
import { store, allGames, currentState, playerById, archiveCurrent, deleteCurrent, animationsOn, saveCurrent, legEndPending, addDrink, removeDrink, drinksHere, gameDrinking, gameDrinkTally, gameFinished } from '../store.js';
import { drinkSizeSeg, plusDrink, plusLabel, pintMode, drinkCount, drinkPair } from '../drinks.js';
import { esc, ico, avg, OUT_SHORT, maquetteButtons } from '../dom.js';
import { avatarHtml, colorIndex } from '../avatars.js';
import { throwDart, undoDart, computeState } from '../../engine/x01.js';
import { makeDart, formatDart } from '../../engine/darts.js';
import { suggestCheckout } from '../../engine/checkout.js';
import { playerSummary } from '../../engine/stats.js';
import { segmentAt, RINGS } from '../../engine/board.js';
import { boardSvg, plainBoard, impactsFor, markIcon } from '../board.js';
import { rollHtml } from '../roll.js';
import { pendingVisit, validatedAfterUndo } from '../turn.js';
import { go, refresh, buzz, BUZZ } from '../nav.js';
import { themeControls, storageBanner } from './settings.js';
import { gameLog, selectLogCell, selectedLogCell } from './history.js';
import { sound, dartSound, say, SPEECH, verdictSound } from '../feedback.js';
import { x01Verdict, defiSound, GOOD_VISIT } from '../../engine/verdict.js';
import { correctDart, locateDart, visitStart, CORRECT_ERRORS } from '../../engine/correct.js';
import { turnAnimOf, turnFxKind, syncTurnFx } from '../turnfx.js';
import { leader, flop, visitStanding, standings } from '../../engine/ranking.js';
import { playerRecords, isVisitRecord } from '../../engine/records.js';
import { defiOf, defiResult, DEFIS } from '../../engine/defis.js';
import { gameBadgesSay, gameBadgesSound } from '../honours.js';
import { bindBoardInput, boardHint, frozenLoupe } from '../boardinput.js';
import { micKey, registerVoice } from '../voiceinput.js';
import { log } from '../journal.js';
import { registerOnlineGame, input as onlineInput, onlineGame, turnInfo, hostPass, onlineQuit, on as online } from '../online.js';

export const ANNOUNCE_MS = 800;

let announceTimer = null;

export const isLandscape = () => { try { return matchMedia('(orientation: landscape)').matches; } catch (e) { return false; } };

const dartLabel = d => {
  const f = formatDart(d);
  return f === '0' ? '0' : f.replace(/^S/, '');
};
const colorOf = p => `var(--av-${colorIndex(p.avatar?.color)})`;

// Pastille de rang (lot 7.8, retours du 20/11) : sur chaque avatar de l'écran de jeu, la place du joueur en ce moment
// (classement de ranking.js : manches gagnées, puis reste ; mise à jour à chaque fléchette). Rien tant que tout le
// monde est à égalité (début de manche) ni en solo.
export function placesOf(s) {
  if (s.config.players.length < 2) return null;
  const st = standings(s);
  if (st.every(r => r.place === 1)) return null;
  const out = [];
  for (const r of st) out[r.player] = r.place;
  return out;
}
const withRank = (av, places, i) => (places
  ? `<span class="avr">${av}<i class="rkp${places[i] === 1 ? ' first' : ''}" data-layer aria-label="${places[i] === 1 ? '1er' : `${places[i]}e`}">${places[i]}</i></span>` : av);

/** Retour visuel : la touche appuyée passe en inverse un court instant (même après redessin). */
function flash(key) {
  if (!key) return;
  const el = document.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  el.classList.add('hit');
  setTimeout(() => el.classList.remove('hit'), 140);
}

/** Joueur suivant après `i`, en sautant ceux qui ont déjà fini (jouer jusqu'au bout, lot 7). */
function nextActive(s, i) {
  const n = s.config.players.length;
  const done = new Set(s.placing ? s.finishOrder : []);
  let k = (i + 1) % n;
  for (let j = 0; j < n && done.has(k); j++) k = (k + 1) % n;
  return k;
}

/** Ce que l'écran montre : le joueur qui vient de lancer tant que sa volée attend VALIDER, sinon le joueur actif. */
function view() {
  const g = store.current;
  const s = currentState();
  const cfg = g.config;
  const n = cfg.players.length;
  const pend = pendingVisit(s, g.validated);
  const shown = pend ? pend.player : s.currentPlayer;
  return {
    g, s, cfg, n, ui: g.ui, pend, shown,
    player: playerById(cfg.players[shown]),
    remaining: pend ? pend.remainingAfter : s.remaining[shown],
    darts: pend ? pend.darts : s.visit.darts,
    total: pend ? (pend.bust ? 0 : pend.total) : s.visit.total,
    bust: !!(pend && pend.bust),
    next: pend ? s.currentPlayer : nextActive(s, s.currentPlayer),
    visitIdx: pend ? s.visits.length - 1 : 'open',
    totalKey: pend ? s.visits.length - 1 : s.visits.length,
  };
}

/** Voyelles qui tombent (lot 7) : clé de la volée de Tsia montrée à l'écran (en cours ou en attente de VALIDER), sinon
 *  null. La volée en attente garde la clé qu'elle avait ouverte (son rang dans `visits`). */
export function vowelKey() {
  const g = store.current;
  if (!g) return null;
  const s = currentState();
  if (s.status === 'finished') return null;
  const v = view();
  if (!v.player || turnAnimOf(v.player) !== 'voyelles') return null;
  return `${g.id}:${v.pend ? s.visits.length - 1 : s.visits.length}`;
}

/** Animation de tour (lot 7.4, turnfx.js) : la volée qui commence (aucune fléchette, pas de célébration ouverte), avec
 *  l'animation du joueur, sinon null. Les voyelles de Tsia sont à part (vowelKey). */
export function turnFx() {
  const g = store.current;
  if (!g || g.ui.frozen || g.ui.cele) return null;
  const s = currentState();
  if (s.status === 'finished') return null;
  const v = view();
  if (!v.player || v.pend || v.darts.length) return null;
  const kind = turnFxKind(v.player); // lot 7.9 : « picto » = l'animation du pictogramme de son avatar
  if (kind === 'aucune' || kind === 'voyelles') return null;
  return { key: `${g.id}:${s.visits.length}`, kind, color: colorOf(v.player), say: (text, o) => say(text, o), sound: k => sound(k) };
}

// ------------------------------------------------------------------ morceaux communes aux deux mises en page
// Bandeau : la ligne sous le pseudo se compacte par paliers si elle ne tient pas (fit.js) : manches gagnées en
// « 1/2 », « MANCHE 2 » en « M2 », carrés de fléchettes retirés, « FLÉCHETTE 2/3 » en « FL. 2/3 » ;
// lot 7 : « EN TÊTE » devient « 1ER » dès le palier 1 et disparaît au palier 5.
function band(v, slide) {
  const { s, cfg, player, pend } = v;
  const won = s.legsWon[v.shown];
  const legs = cfg.legsToWin > 1
    ? `<span class="won" aria-hidden="true">${Array.from({ length: cfg.legsToWin }, (_, i) => `<i class="${i < won ? 'on' : ''}"></i>`).join('')}</span>`
      + `<span class="wn" aria-label="Manches gagnées : ${won} sur ${cfg.legsToWin}">${won}/${cfg.legsToWin}</span>`
    : '';
  // Compteur de fléchettes lisible de loin : 3 carrés, pleins pour les fléchettes lancées, encadré pour la prochaine.
  const thrown = pend ? pend.darts.length : s.dartNumber - 1;
  const squares = [0, 1, 2].map(i => `<i class="${i < thrown ? 'on' : !pend && i === thrown ? 'now' : ''}"></i>`).join('');
  const place = pend && pend.finish ? s.finishOrder.indexOf(v.shown) + 1 : 0;
  const state = `<span class="dn" aria-hidden="true">${squares}</span>`
    + (pend ? (pend.bust ? '<b>BUST</b>' : place ? `<b>${placeLabel(place)}</b>` : '<b><span class="lg">VOLÉE </span>TERMINÉE</b>')
      : `<b><span class="lg">FLÉCHETTE</span><span class="sh">FL.</span> ${s.dartNumber}/3</b>`);
  return `<header class="gband${slide ? ' slide' : ''}" style="--pc:${colorOf(player)};--n:${[...player.name].length}">
      ${withRank(avatarHtml(player, 56), placesOf(s), v.shown)}
      <div class="who"><span class="nm" data-shrink>${esc(player.name)}</span>
        <span class="legs" data-fit="5">${leader(s) === v.shown && !pend ? '<b class="ld"><span class="lg">EN TÊTE</span><span class="sh">1ER</span></b>' : ''}${state}<span class="mn"><span class="lg">MANCHE </span><span class="sh">M</span>${s.legNumber}</span>${legs}</span></div>
      <button type="button" class="pause" data-act="pause" data-press aria-label="Pause">${ico('pause')}</button>
    </header>`;
}

// Lot 7.6 (demande de Guillaume) : au résultat de la volée (en attente de VALIDER), dire si elle est parmi les 3
// meilleures ou les 3 pires de la soirée (toutes les volées des parties de la soirée), ou de la partie hors soirée.
// Rang = 1 + nombre d'autres volées strictement meilleures (ou pires) : à égalité, on partage le rang. Points d'une
// volée = `scored` (un bust vaut 0). Calcul : ranking.js › visitStanding.
const scoreCache = new Map(); // partie close → points de ses volées
function scoresOf(g) {
  const key = `${g.id}:${g.darts.length}`;
  if (!scoreCache.has(key)) {
    let list = [];
    try { list = computeState(g.config, g.darts).visits.map(x => x.scored); } catch (e) { /* partie illisible : ignorée */ }
    scoreCache.set(key, list);
  }
  return scoreCache.get(key);
}
export function visitRank(g, s) {
  const idx = s.visits.length - 1;
  if (idx < 0) return null;
  const x = s.visits[idx].scored;
  const others = s.visits.filter((_, i) => i !== idx).map(y => y.scored);
  if (g.soiree) for (const h of store.games) if (h.soiree === g.soiree && h.id !== g.id) others.push(...scoresOf(h));
  const r = visitStanding(x, others);
  return r && { ...r, scope: g.soiree ? 'soiree' : 'partie' };
}
// Lot 9 : record personnel battu (meilleure volée de toutes ses parties d'avant), montré à la place du rang de la soirée.
const recCache = new Map(); // joueur → { key (parties closes), rec }
// Lot 10 : sur toutes ses parties connues (allGames : aussi celles d'un ami jouées chez lui), comme ses stats ; sinon
// un ami pouvait battre ici un « record » qu'il avait déjà dépassé chez lui.
export function recordsOf(id) {
  // 0.26.0 : sans la partie en cours, même finie (elle compte déjà dans allGames dès sa dernière fléchette).
  const cur = store.current && store.current.id;
  const all = allGames().filter(g => g.id !== cur);
  const key = `${all.length}:${all.reduce((n, g) => n + g.darts.length, 0)}`;
  const c = recCache.get(id);
  if (c && c.key === key) return c.rec;
  const rec = playerRecords(all, id);
  recCache.set(id, { key, rec });
  return rec;
}
export function visitIsRecord(g, s) {
  const v = s.visits[s.visits.length - 1];
  if (!v) return false;
  const id = g.config.players[v.player];
  const rec = recordsOf(id);
  // Pas un record si une autre volée de la partie en cours faisait déjà mieux ou aussi bien.
  const here = s.visits.slice(0, -1).filter(x => x.player === v.player && !x.bust).reduce((m, x) => Math.max(m, x.scored), 0);
  return isVisitRecord(rec, v) && v.scored > here;
}
function rankBadge(v) {
  if (v.pend && !v.bust && visitIsRecord(v.g, v.s)) {
    return `<div class="vr best rec" role="status" data-fit="3">${ico('trophy')}<span class="vt">RECORD<span class="l1"> PERSO</span><span class="l2"> : MEILLEURE VOLÉE</span><span class="s2"> · PERSO</span></span></div>`;
  }
  const r = v.pend ? visitRank(v.g, v.s) : null;
  if (!r) return '';
  const word = r.kind === 'best' ? 'MEILLEURE' : 'PIRE';
  const where = r.scope === 'soiree' ? 'SOIRÉE' : 'PARTIE';
  const n = r.rank > 1 ? `<b>${r.rank}E</b> ` : '';
  return `<div class="vr ${r.kind}" role="status" data-fit="3">${ico(r.kind === 'best' ? 'up' : 'down')}<span class="vt">${n}${word}<span class="l1"> VOLÉE</span><span class="l2"> DE LA ${where}</span><span class="s2"> · ${where}</span></span></div>`;
}

function rest(v) {
  const { cfg, player, remaining, s, shown } = v;
  const badge = rankBadge(v);
  if (v.bust) {
    // Bust classé (lot 7.6) : le classement prend la place de « AUCUN POINT » (le bloc rouge est déjà plein).
    return `<section class="rest alert" role="alert" aria-label="Bust">
      <div class="meta"><span class="ell">${esc(player.name)}</span>${badge ? badge.replace('class="vr', 'class="vr in-meta') : '<span>AUCUN POINT</span>'}</div>
      <b class="bust-word" data-shrink>BUST</b><span class="bust-rest" data-shrink>RESTE ${remaining}</span><span id="remaining" hidden>${remaining}</span>
    </section>`;
  }
  const legAvg = playerSummary(s, shown, s.legNumber).average;
  // Lot 7 : alcoolémie estimée du joueur, dès son premier verre (le détail et les verres sont au menu pause).
  // Lot 7.1 : et ses verres de la partie, dès qu'un joueur en a pris un (on voit aussi « 0 » pour ceux qui n'ont rien bu).
  const id = cfg.players[shown];
  // Lot 7.6 : avec une soirée, les verres d'avant la partie comptent aussi.
  const drinking = gameDrinking(store.current);
  // Lot 7.2 (demande de Guillaume) : des verres, pas leur équivalent en alcool ; 0.11.2 : verres et pintes à part.
  const alc = drinking ? `${drinkPair(gameDrinkTally(store.current, id), 'dk dpair')} · ` : '';
  return `<section class="rest${badge ? ' ranked' : ''}" aria-label="Reste à faire">
      <div class="meta"><span class="ell">${cfg.starts ? `DÉPART ${cfg.starts[shown]}` : cfg.startScore} · ${OUT_SHORT[cfg.outMode]}</span><span>${alc}MOY. ${avg(legAvg)}</span></div>
      <div class="big" id="remaining" aria-label="${remaining}" data-shrink>${rollHtml(`r:${s.legNumber}:${shown}`, remaining)}</div>${badge}
    </section>`;
}

// Fléchette dessinée (lot 3) : chaque case vide en montre une, qui laisse place au score une fois tirée ; on voit
// d'un coup d'œil combien il en reste. Pointe en bas à gauche, empennage en haut à droite (trait, angles droits).
export const DART_ICON = '<svg class="dico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21L7.5 16.5"/><path d="M7.5 16.5L13.5 10.5" stroke-width="4"/><path d="M13.5 10.5L17 7"/><path d="M15.5 8.5V2.5L21.5 8.5Z" fill="currentColor" stroke-width="1.5"/></svg>';

// 3 cases + total. Case vide : la fléchette dessinée et, quand une finition est jouable avec les fléchettes qui
// restent, le segment conseillé pour cette fléchette (ex. T20 · T20 · D20 pour 140), recalculé après chaque fléchette.
function visitBoxes(v) {
  const { darts, pend, bust, cfg, remaining } = v;
  // Préférences du joueur qui lance (fiche joueur : double préféré, éviter le bull)
  const route = pend ? null : suggestCheckout(remaining, cfg.outMode, 3 - darts.length, v.player.checkout);
  const boxes = [0, 1, 2].map(i => {
    const d = darts[i];
    if (d) return `<div class="dart ${bust && i === darts.length - 1 ? 'bust' : 'done'}"><span class="sv" data-shrink>${dartLabel(d)}</span></div>`;
    if (pend) return '<div class="dart"></div>';
    const seg = route && route[i - darts.length];
    const todo = i === darts.length;
    const label = `${todo ? 'Fléchette à jouer' : 'Fléchette restante'}${seg ? `, finition : ${dartLabel(seg)}` : ''}`;
    return `<div class="dart left${todo ? ' todo' : ''}${seg ? ' hint' : ''}" aria-label="${label}">${DART_ICON}${seg ? `<small class="cs" data-shrink>${dartLabel(seg)}</small>` : ''}</div>`;
  }).join('');
  return `<div class="visit">${boxes}<div class="total ${darts.length ? 'inv' : 'zero'}"><small>${pend && !bust ? 'VOLÉE' : 'TOTAL'}</small><span class="tv" data-shrink>${rollHtml(`t:${v.totalKey}`, v.total)}</span></div></div>`;
}

// Sous les cases : « SUIVANT PSEUDO » quand la volée attend VALIDER (repère voulu en portrait). La finition, elle,
// est dans les cases vides (lot 3) : l'ancienne ligne FINITION aurait répété la même chose.
function checkoutLine(v) {
  const { pend, n, cfg } = v;
  if (pend) {
    return n > 1
      ? `<div class="co turn"><small>SUIVANT</small><span class="nm ell">${esc(playerById(cfg.players[v.next]).name)}</span></div>`
      : '<div class="co turn"><small>VOLÉE SUIVANTE</small></div>';
  }
  return '<div class="co"></div>';
}

// Autres joueurs : tous neutres (avatar sans sa couleur), la seule couleur de joueur à l'écran étant celle du joueur
// en cours (lot 1.3). Le suivant, toujours en tête de la bande, est repéré par un filet en haut et « SUIVANT ».
function others(v) {
  const { n, cfg, s, shown, next } = v;
  if (n < 2) return '';
  const many = n > 4;
  const order = [];
  for (let k = 1; k < n; k++) order.push((shown + k) % n);
  // Lot 7 : le joueur en tête a son reste en vidéo inverse ; un joueur qui a fini (jouer jusqu'au bout) montre sa place.
  const lead = leader(s);
  const placed = s.placing ? s.finishOrder : [];
  const places = placesOf(s);
  return `<section class="others${many ? ' many' : ''}" aria-label="Autres joueurs">${order.map(i => {
    const p = playerById(cfg.players[i]);
    const isNext = i === next;
    const pl = placed.indexOf(i) + 1;
    const label = isNext ? 'Joueur suivant' : i === lead ? 'En tête' : pl ? `Fini, ${placeLabel(pl).toLowerCase()}` : '';
    const score = pl ? `<span class="r place">${placeLabel(pl)}</span>`
      : `<span class="r" data-shrink>${rollHtml(`o:${s.legNumber}:${i}`, s.remaining[i])}</span>`;
    return `<div class="op${isNext ? ' next' : ''}${i === lead ? ' lead' : ''}${pl ? ' out' : ''}"${label ? ` aria-label="${label}"` : ''}>${withRank(avatarHtml(p, many ? 20 : 34, 'mono'), places, i)}
      <div class="col"><span class="l1"><span class="nm ell"${isNext ? ' data-fit="1"' : ''}>${esc(p.name)}</span>${isNext ? `<span class="tag-next"><span class="lg">SUIVANT</span><span class="sh">${ico('chev')}</span></span>` : ''}</span>${score}</div></div>`;
  }).join('')}</section>`;
}

/** Tour en cours (lot 7.6) : celui de la volée montrée (en cours, ou en attente de VALIDER). */
const tourOf = v => roundOf(v.s, v.pend ? v.s.visits.length - 1 : 'open');

// ------------------------------------------------------------------ défis de soirée (lot 9 ; bandeau : lot 7.8)
/** Défi de la volée montrée : { id, key, player, index, open (pas encore close), result? } ou null. */
export function defiNow(v) {
  const g = v.g;
  if (!g.defis) return null;
  const s = v.s;
  if (v.pend) {
    const idx = s.visits.length - 1;
    const r = defiResult(g, s, idx);
    return r ? { id: `${g.id}:${idx}`, key: r.key, player: r.player, index: idx, open: false, result: r } : null;
  }
  if (s.status !== 'playing' || s.currentPlayer === null) return null;
  const idx = s.visits.length;
  const key = defiOf(g, idx, s.visit && s.visit.darts.length ? s.visit.startRemaining : s.remaining[s.currentPlayer]);
  return key ? { id: `${g.id}:${idx}`, key, player: s.currentPlayer, index: idx, open: true } : null;
}

/** Annonce à voix haute du défi, une fois, au début de la volée. */
function sayDefiStart(v, d) {
  if (!d || !d.open || v.darts.length || v.ui.defiSaid === d.id) return;
  v.ui.defiSaid = d.id;
  const p = playerById(v.cfg.players[d.player]);
  sound(defiSound('in')); // lot 9.6 C : signal bien reconnaissable à l'arrivée d'un défi
  setTimeout(() => say(`Défi pour ${p.name} : ${DEFIS[d.key].say}`), 400);
}

/**
 * Bandeau du défi (lot 7.8, retours du 20/11) : sous le bandeau du joueur, de tout le début de la volée (avant la 1re
 * fléchette, le reste du joueur visible dessous) jusqu'à VALIDER, texte en grand ; une fois la volée close, le résultat
 * (étoile rouge pleine : réussi ; grise vide : raté) ; 0.11.2 : plus de gage à noter. « Main gauche » se déclare : FAIT /
 * PAS FAIT. Quand Tsia lance, DÉGRISEMENT EXPRESS (kombucha au gingembre) rend ses voyelles au texte du défi.
 */
function defiBand(v) {
  const d = defiNow(v);
  if (!d) return '';
  sayDefiStart(v, d);
  const def = DEFIS[d.key];
  const sober = v.ui.degrise === d.id;
  const keep = sober ? ' data-vkeep' : '';
  const kombu = vowelKey() ? `<button type="button" class="kombu" data-act="degrise" data-arg="${esc(d.id)}" aria-pressed="${sober}" data-vkeep
      aria-label="Dégrisement express : les voyelles du défi reviennent">${ico('kombucha')}<span>${sober ? 'DÉGRISÉ' : 'DÉGRISEMENT EXPRESS'}</span></button>` : '';
  if (d.open) {
    return `<section class="dfb open" role="status" aria-label="Défi : ${esc(def.text)}">
      <div class="dfc"><b class="dft"${keep} data-shrink><span class="dfl">${ico('flag')}DÉFI</span> ${esc(def.text)}</b>${def.hint ? `<small class="dfh"${keep}>${esc(def.hint)}</small>` : ''}</div>${kombu}</section>`;
  }
  const r = d.result;
  if (r.declare && r.declared === undefined) {
    return `<section class="dfb res ask" role="status" aria-label="Défi à déclarer">${ico('star', 'ico dfs')}
      <div class="dfc"><small class="dfl">DÉFI À DÉCLARER</small><b class="dft"${keep} data-shrink>${esc(def.short)} ?</b></div>
      <div class="dfask"><button type="button" data-act="defi-decl" data-arg="${esc(`${d.id}|1`)}">FAIT</button><button type="button" data-act="defi-decl" data-arg="${esc(`${d.id}|0`)}">PAS FAIT</button></div>${kombu}</section>`;
  }
  // 0.11.2 (demande de Guillaume) : plus de gage à noter d'un appui ; le résultat seul.
  const change = r.declare ? `<button type="button" class="dfchg" data-act="defi-decl" data-arg="${esc(`${d.id}|x`)}" aria-label="Changer la déclaration">${ico('undo')}</button>` : '';
  return `<section class="dfb res ${r.ok ? 'ok' : 'ko'}" role="status" aria-label="Défi ${r.ok ? 'réussi' : 'raté'} : ${esc(def.text)}">${ico(r.ok ? 'starf' : 'star', 'ico dfs')}
    <div class="dfc"><small class="dfl">${r.ok ? 'DÉFI RÉUSSI' : 'DÉFI RATÉ'}</small><b class="dft"${keep} data-shrink>${esc(def.short)}</b></div>${change}${kombu}</section>`;
}

/**
 * Bande du tour (lot 7.6, demande de Guillaume) : « TOUR 5 » puis tous les joueurs dans l'ordre du tour, à partir du
 * premier à lancer de la manche. Plein = a déjà lancé ce tour-ci ; encadré = lance maintenant ; filet = lance encore
 * ce tour-ci ; barré = a fini (jouer jusqu'au bout). Un joueur a lancé ce tour-ci s'il a déjà autant de volées dans la
 * manche que le numéro du tour (robuste aux joueurs sautés).
 */
function roundStrip(v) {
  const { s, n, cfg, shown } = v;
  const r = tourOf(v);
  // Verres (lot 7.6) : un appui ouvre le panneau des verres, sans passer par la pause.
  const glass = `<button type="button" class="glass" data-act="drinks-open" data-press aria-label="Verres">${ico('glass')}<span>+1</span></button>`;
  // Lot 7.8 : le défi n'est plus ici mais dans son bandeau, sous celui du joueur (defiBand).
  if (n < 2) return `<section class="round" aria-label="Tour ${r}"><b class="rt">TOUR ${r}</b>${glass}</section>`;
  const count = new Array(n).fill(0);
  for (const x of s.visits) if (x.leg === s.legNumber) count[x.player] += 1;
  const placed = s.placing ? s.finishOrder : [];
  const places = placesOf(s);
  const cells = [];
  let left = 0;
  for (let k = 0; k < n; k++) {
    const i = (s.legStarter + k) % n;
    const p = playerById(cfg.players[i]);
    const out = placed.includes(i);
    const now = i === shown && !v.pend;
    const done = !out && !now && count[i] >= r;
    if (!out && !done && !now) left += 1;
    const st = out ? 'out' : now ? 'now' : done ? 'done' : 'todo';
    const label = { out: 'a fini', now: 'lance', done: 'a lancé', todo: 'à lancer' }[st];
    cells.push(`<li class="rd ${st}" aria-label="${esc(p.name)} : ${label}">${withRank(avatarHtml(p, n > 5 ? 19 : 22, 'mono'), places, i)}</li>`);
  }
  const tail = left ? `<span class="rl"><span class="lg">ENCORE </span><span class="sh">+</span>${left}</span>` : '<span class="rl"><span class="lg">DERNIER</span><span class="sh">FIN</span></span>';
  return `<section class="round${n > 5 ? ' many' : ''}${v.pend ? ' wait' : ''}" aria-label="Tour ${r}" data-fit="4"><b class="rt"><span class="lg">TOUR </span><span class="sh">T</span>${r}</b><ol class="rds">${cells.join('')}</ol>${v.pend ? '' : tail}${glass}</section>`;
}

/** « 1ER », « 2E »… */
export const placeLabel = n => (n === 1 ? '1ER' : `${n}E`);

// VALIDER (lot 2) : aplat de la couleur du joueur qui vient de lancer (le joueur en cours, encore au bandeau), encre
// --av-ink (contraste vérifié sur les 8 couleurs) ; « VALIDER » seul, sur une ligne, aussi grand que la place le
// permet. Le joueur suivant n'est indiqué qu'une fois : dans la bande des autres (« SUIVANT »).
function validateButton(v, cls = '') {
  const over = cls.includes('over');
  if (!v.pend) return `<button type="button" class="validate ${cls}" data-act="validate" data-press${over ? ' data-layer' : ' data-shrink'} disabled>VALIDER<small>après 3 fléchettes</small></button>`;
  return `<button type="button" class="validate go ${cls}" data-act="validate" data-press${over ? ' data-layer' : ''} style="--pc:${colorOf(v.player)}"><span class="vl" data-shrink>VALIDER</span></button>`;
}

function announce(v) {
  const a = v.ui.announce;
  if (a === null || a !== v.s.currentPlayer || v.pend) return '';
  const p = playerById(v.cfg.players[a]);
  const longest = Math.max(4, ...p.name.split(/\s+/).map(w => [...w].length));
  return `<div class="announce" role="status" data-layer style="--pc:${colorOf(p)};--w:${longest}">${avatarHtml(p, 72)}
    <div class="msg"><small>À TOI,</small><b class="nm" data-shrink="2">${esc(p.name)}</b></div></div>`;
}

// Petite cible : seulement la volée en cours (marques rondes 1, 2, 3) ; elle se vide à chaque nouvelle volée.
function smallBoard(v) {
  const impacts = impactsFor(v.g, v.s, v.visitIdx, { previous: false });
  return `<button type="button" class="mini-board" data-act="open-board" data-press aria-label="Agrandir la cible">${boardSvg({ size: 104, impacts, label: 'Impacts de la volée' })}</button>`;
}

// ------------------------------------------------------------------ écran
export function game() {
  const g = store.current;
  if (!g) { go('#/', { replace: true }); return ''; }
  const s = currentState();
  if (s.status === 'finished') { go('#/fin', { replace: true }); return ''; }
  if (legEndPending()) { go('#/manche', { replace: true }); return ''; } // reprise : fin de manche pas encore validée
  const v = view();
  const slide = v.ui.slide;
  v.ui.slide = false; // le glissement ne se joue qu'une fois
  const land = isLandscape();
  const overlays = `${v.ui.panel ? livePanel(v) : ''}${v.ui.pause ? pauseSheet() : ''}${v.ui.drinks ? drinksSheet(v) : ''}`;
  if (land) return landscape(v, slide, overlays);

  // Pavé (portrait)
  const m = v.ui.mult;
  const wait = !!v.pend;
  const dis = wait ? 'disabled' : '';
  const pre = m === 2 ? '<sup>D</sup>' : m === 3 ? '<sup>T</sup>' : '';
  const nums = [];
  for (let r = 0; r < 4; r++) {
    nums.push(`<div class="krow nums">${[1, 2, 3, 4, 5].map(c => {
      const k = r * 5 + c;
      return `<button type="button" class="key" data-key="${k}" ${dis}><span class="kl" data-shrink>${wait ? '' : pre}${k}</span></button>`;
    }).join('')}</div>`);
  }
  const mk = (k, label, word) => `<button type="button" class="key m tb${{ S: 1, D: 2, T: 3 }[k]}" data-key="${k}" aria-pressed="${!wait && m === { S: 1, D: 2, T: 3 }[k]}" ${dis}><span class="kl" data-shrink>${label}<small>${word}</small></span></button>`;
  const mic = micKey(); // lot 9.3 : saisie à la voix
  const pad = `<section class="pad-k${m > 1 && !wait ? ` armed m${m}` : ''}${wait ? ' wait' : ''}" aria-label="Saisie">
      <div class="krow mult${mic ? ' with-mic' : ''}">${mk('S', 'S', 'SIMPLE')}${mk('D', 'D', 'DOUBLE')}${mk('T', 'T', 'TRIPLE')}${mic}</div>
      ${nums.join('')}
      <div class="krow last">
        <button type="button" class="key bull" data-key="25" ${m === 3 || wait ? 'disabled' : ''}><span class="kl" data-shrink>${m === 2 && !wait ? '<sup>D</sup>' : ''}25</span></button>
        <button type="button" class="key" data-key="50" ${dis}><span class="kl" data-shrink>50</span></button>
        <button type="button" class="key zero" data-key="0" ${dis}>0<small>RATÉ</small></button>
        <button type="button" class="key undo" data-key="undo" ${g.darts.length ? '' : 'disabled'}>${ico('undo')}<span class="kl" data-shrink>ANNULER</span></button>
      </div>
      ${wait ? validateButton(v, 'over') : ''}
      ${onlineCover()}
    </section>`;

  return `<div class="game port">
    <div class="toparea">${band(v, slide)}${defiBand(v)}${rest(v)}${announce(v)}</div>
    <div class="vblock"><div class="vcol">${visitBoxes(v)}${checkoutLine(v)}</div>${smallBoard(v)}</div>
    ${roundStrip(v)}${others(v)}${pad}
    ${overlays}${celebrationHtml()}
  </div>`;
}

function landscape(v, slide, overlays) {
  const g = v.g;
  const wait = !!v.pend;
  const impacts = impactsFor(g, v.s, v.visitIdx, { previous: false }); // comme la petite cible : la volée seule
  const mic = micKey(); // lot 9.3
  return `<div class="game land">
    <div class="lcol">
      <div class="toparea">${band(v, slide)}${defiBand(v)}
        <div class="mid">${rest(v)}<div class="side">${visitBoxes(v)}${checkoutLine(v)}</div></div>
        ${announce(v)}</div>
      ${roundStrip(v)}${others(v)}
      <div class="lbtns${mic ? ' with-mic' : ''}">
        <button type="button" class="key zero" data-key="0" ${wait ? 'disabled' : ''}>0<small>RATÉ</small></button>
        <button type="button" class="key undo" data-key="undo" ${g.darts.length ? '' : 'disabled'}>${ico('undo')}<span class="kl" data-shrink>ANNULER</span></button>
        ${mic}${validateButton(v)}
      </div>
    </div>
    <div class="rcol">
      <div class="bwrap${wait ? ' wait' : ''}" id="tboard">${boardSvg({ size: 400, impacts, label: 'Cible : touchez pour saisir' })}</div>
      <p class="bhint alert" id="bhint" role="status" data-layer hidden></p>
      ${onlineCover()}
    </div>
    <div class="loupe" id="loupe" data-layer hidden><b class="lz"></b><div class="lens">${plainBoard()}<i class="cross"></i></div></div>
    ${overlays}${celebrationHtml()}
  </div>`;
}

// ------------------------------------------------------------------ panneau « cible + historique » (lot 3)
// Un seul panneau, ouvert par la petite cible ou par HISTORIQUE DE LA PARTIE : la cible en grand en haut (bascule
// VOLÉE / MANCHE ; collée en haut pendant que le tableau défile), puis le tableau de la partie, manche en cours
// d'abord. Une case touchée montre ses fléchettes sur la cible ; une fléchette touchée sous la cible s'ouvre au
// sélecteur de correction (correct.js : acceptée seulement si le déroulé de la partie ne change pas).
const cellKey = (g, idx) => `${g.id}|${idx}`;

/** Volée montrée sur la cible du panneau : la case touchée, sinon la volée en cours (ou en attente). */
function panelVisit(v) {
  const sel = selectedLogCell();
  const [gid, raw] = sel ? sel.split('|') : [];
  let idx = v.visitIdx;
  if (gid === v.g.id) idx = raw === 'open' ? 'open' : Number(raw);
  const visit = idx === 'open' ? v.s.visit : v.s.visits[idx];
  if (!visit) return { idx: v.visitIdx, visit: v.visitIdx === 'open' ? v.s.visit : v.s.visits[v.visitIdx], selected: false };
  return { idx, visit, selected: !!sel && gid === v.g.id };
}

/** Tour (numéro de ligne du tableau) d'une volée : nombre de volées du joueur dans la manche, celle-ci comprise. */
function roundOf(s, idx) {
  const visit = idx === 'open' ? s.visit : s.visits[idx];
  const leg = idx === 'open' ? s.legNumber : visit.leg;
  const upto = idx === 'open' ? s.visits.length : idx + 1;
  return s.visits.slice(0, upto).filter(x => x.player === visit.player && x.leg === leg).length + (idx === 'open' ? 1 : 0);
}

function livePanel(v) {
  const { g, s, ui } = v;
  const leg = ui.boardView === 'leg';
  const pv = panelVisit(v);
  const who = playerById(g.config.players[pv.visit.player]);
  const vleg = pv.idx === 'open' ? s.legNumber : pv.visit.leg;
  const caption = pv.idx === 'open' && !pv.visit.darts.length ? 'VOLÉE À JOUER'
    : `TOUR ${roundOf(s, pv.idx)}${vleg !== s.legNumber ? ` · MANCHE ${vleg}` : ''}`;
  const impacts = impactsFor(g, s, pv.idx, { previous: leg });
  const b = (val, label) => `<button type="button" data-act="board-view" data-arg="${val}" aria-pressed="${(val === 'leg') === leg}">${label}</button>`;
  const start = visitStart(s, pv.idx);
  const fix = ui.fix;
  const darts = [0, 1, 2].map(n => {
    const d = pv.visit.darts[n];
    if (!d) return '<span class="fd none">–</span>';
    const i = start + n;
    return `<button type="button" class="fd${fix && fix.index === i ? ' on' : ''}" data-act="fix-dart" data-arg="${i}" aria-label="Corriger la fléchette ${n + 1} : ${dartLabel(d)}">${dartLabel(d)}</button>`;
  }).join('');
  const boardBox = `<div class="lb-svg${fix ? ' pick' : ''}"${fix ? ' data-act="fix-board"' : ''}>${boardSvg({ size: 380, impacts, label: fix ? 'Cible : touchez la zone de la fléchette corrigée' : 'Impacts' })}</div>`;
  return `<div class="sheet-bg" role="dialog" aria-label="Cible et historique de la partie" data-layer><div class="sheet live${fix ? ' fixing' : ''}">
    <header class="top" data-layer><h1><span>Partie en cours</span></h1>${store.maquette ? maquetteButtons() : ''}<button type="button" class="act" data-act="close-panel" aria-label="Fermer">${ico('close')}</button></header>
    <div class="live-grid">
      <section class="live-board" aria-label="Cible">
        <div class="seg" role="group" aria-label="Impacts montrés">${b('visit', 'Volée')}${b('leg', 'Manche')}</div>
        <div class="lb-cap"><span class="nm ell">${esc(who.name)}</span><span>${caption}</span></div>
        ${boardBox}
        <div class="lb-darts">${darts}</div>
        <p class="note lb-note">${fix ? 'Choisissez la bonne fléchette ci-dessous, ou touchez sa zone sur la cible.'
          : pv.visit.darts.length ? 'Touchez une fléchette pour la corriger.' : `${markIcon(true)}volée numérotée${leg ? ` · ${markIcon(false)}volées précédentes` : ''}`}</p>
      </section>
      <section class="live-log">
        ${gameLog(g, s, { live: true, reverse: true, details: false })}
        <div class="pad" style="margin-top:18px"><button type="button" class="btn primary" data-act="close-panel">${ico('play')} RETOUR À LA PARTIE</button></div>
      </section>
    </div>
    ${fix ? fixer(v, fix) : ''}
  </div></div>`;
}

// Sélecteur de correction : S / D / T, 1 à 20, 25, 50, 0 (ou la cible au-dessus) ; puis l'effet, à confirmer.
function fixer(v, fix) {
  const { g, s } = v;
  const where = locateDart(s, fix.index);
  const who = playerById(g.config.players[where.player]);
  const old = g.darts[fix.index];
  const head = `<div class="fx-h"><b>CORRIGER ${dartLabel(old)}</b><span class="small"><span class="nm">${esc(who.name)}</span> · fléchette ${where.n + 1}</span></div>`;
  let body;
  if (fix.result && !fix.result.ok) {
    const msg = fix.result.error === CORRECT_ERRORS.SAME ? 'c\'est déjà cette fléchette, rien à corriger.'
      : 'cette correction change le déroulé de la partie : utilise ANNULER.';
    body = `<div class="confirm" role="alert"><p class="alert-h">CORRECTION IMPOSSIBLE</p><p><b>${dartLabel(old)} → ${dartLabel(fix.pick)}</b> : ${msg}</p><p class="small dim">Rien n'a été modifié.</p>
      <div class="btns two"><button type="button" class="btn" data-act="fix-cancel">FERMER</button><button type="button" class="btn" data-act="fix-again">AUTRE CHOIX</button></div></div>`;
  } else if (fix.result) {
    const e = fix.result.effects;
    const vt = x => (x === null ? 'BUST' : String(x));
    const restLine = e.leg === s.legNumber
      ? `Reste de <span class="nm">${esc(who.name)}</span> : <b>${e.remaining[0]} → ${e.remaining[1]}</b>`
      : `Manche ${e.leg}, reste de <span class="nm">${esc(who.name)}</span> à la fin : <b>${e.remaining[0]} → ${e.remaining[1]}</b>`;
    body = `<div class="confirm warn" role="alertdialog" aria-label="Confirmer la correction"><p class="fx-swap"><b>${dartLabel(old)}</b> → <b>${dartLabel(fix.pick)}</b></p>
      <p>Volée : <b>${vt(e.visit[0])} → ${vt(e.visit[1])}</b><br>${restLine}</p>
      <div class="btns two"><button type="button" class="btn" data-act="fix-again">NON</button><button type="button" class="btn primary" data-act="fix-yes">CORRIGER</button></div></div>`;
  } else {
    const m = fix.mult;
    const k = (val, label, dis = false) => `<button type="button" class="key" data-act="fix-key" data-arg="${val}"${dis ? ' disabled' : ''}><span class="kl" data-shrink>${label}</span></button>`;
    const mk = (val, label) => `<button type="button" class="key m" data-act="fix-mult" data-arg="${val}" aria-pressed="${m === val}"><span class="kl" data-shrink>${label}</span></button>`;
    const pre = m === 2 ? 'D' : m === 3 ? 'T' : '';
    const nums = [];
    for (let r = 0; r < 4; r++) nums.push(`<div class="krow nums">${[1, 2, 3, 4, 5].map(c => k(r * 5 + c, `${pre}${r * 5 + c}`)).join('')}</div>`);
    body = `<div class="fx-pad${m > 1 ? ` armed m${m}` : ''}">
      <div class="krow mult">${mk(1, 'S')}${mk(2, 'D')}${mk(3, 'T')}</div>${nums.join('')}
      <div class="krow last">${k(25, m === 2 ? 'D25' : '25', m === 3)}${k(50, '50')}${k(0, '0')}<button type="button" class="key undo" data-act="fix-cancel"><span class="kl" data-shrink>FERMER</span></button></div></div>`;
  }
  return `<div class="fixer" data-layer role="dialog" aria-label="Corriger une fléchette">${head}${body}</div>`;
}

function pauseSheet() {
  const ui = store.current.ui;
  // ABANDONNER (la partie reste dans l'historique) et SUPPRIMER (partie d'essai : effacée), chacun avec sa confirmation.
  const abandon = ui.confirm === 'abandon'
    ? `<div class="confirm" data-reveal><p><b>Abandonner la partie ?</b></p><p class="small dim">Elle restera dans l'historique, marquée « abandonnée ».</p>
        <div class="btns two"><button type="button" class="btn" data-act="abandon-no">NON</button><button type="button" class="btn alert" data-act="abandon-yes">ABANDONNER</button></div></div>`
    : '<button type="button" class="btn danger" data-act="abandon">ABANDONNER LA PARTIE</button>';
  const og = onlineGame(); // lot 9.2 : partie en ligne
  if (og) {
    const host = online.role === 'host';
    const q = ui.confirm === 'abandon'
      ? `<div class="confirm" data-reveal><p><b>${host ? 'Arrêter la partie pour tous ?' : 'Quitter la partie en ligne ?'}</b></p><p class="small dim">${host ? 'Elle reste dans l\'historique de chaque téléphone, marquée « abandonnée » ; tout le monde revient au salon.' : 'Elle reste dans ton historique, marquée « abandonnée ». L\'hôte pourra passer tes volées ou t\'exclure.'}</p>
        <div class="btns two"><button type="button" class="btn" data-act="abandon-no">NON</button><button type="button" class="btn alert" data-act="abandon-yes">${host ? 'ARRÊTER' : 'QUITTER'}</button></div></div>`
      : `<button type="button" class="btn danger" data-act="abandon">${host ? 'ARRÊTER LA PARTIE POUR TOUS' : 'QUITTER LA PARTIE EN LIGNE'}</button>`;
    return `<div class="sheet-bg" role="dialog" aria-label="Pause" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>Pause</span></h1><button type="button" class="act" data-act="resume" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body" style="padding-top:16px">
      ${storageBanner()}
      <button type="button" class="btn primary big" data-act="resume">${ico('play')} REPRENDRE</button>
      <button type="button" class="btn" data-act="open-history">${ico('history')} HISTORIQUE DE LA PARTIE</button>
      ${drinksSection(store.current.config.players.filter(id => !playerById(id).remote))}
      <div class="sec" style="margin-bottom:0">Réglages rapides</div>
      ${themeControls()}
      <div class="sec" style="margin-bottom:0">Partie en ligne · salon ${esc(og.online.code)}</div>
      <a class="btn ghost" href="#/enligne">SALON <small>${host ? 'tu es l\'hôte' : 'joueurs connectés'}</small></a>
      ${q}
    </div></div></div>`;
  }
  const del = ui.confirm === 'delete'
    ? `<div class="confirm" role="alert" data-reveal><p class="alert-h">SUPPRIMER LA PARTIE ?</p><p class="small">Elle disparaît complètement : ni historique, ni stats. Les joueurs et leurs photos restent.</p>
        <div class="btns two"><button type="button" class="btn" data-act="abandon-no">NON</button><button type="button" class="btn alert" data-act="delete-current-yes">SUPPRIMER</button></div></div>`
    : '<button type="button" class="btn danger" data-act="delete-current">SUPPRIMER LA PARTIE</button>';
  return `<div class="sheet-bg" role="dialog" aria-label="Pause" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>Pause</span></h1>${store.maquette ? '<a class="act mq" href="#/sommaire" aria-label="Sommaire de maquette">' + ico('menu') + '</a>' : ''}<button type="button" class="act" data-act="resume" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body" style="padding-top:16px">
      ${storageBanner()}
      <button type="button" class="btn primary big" data-act="resume">${ico('play')} REPRENDRE</button>
      <button type="button" class="btn" data-act="open-history">${ico('history')} HISTORIQUE DE LA PARTIE</button>
      ${drinksSection(store.current.config.players)}
      <div class="sec" style="margin-bottom:0">Réglages rapides</div>
      ${themeControls()}
      <div class="sec" style="margin-bottom:0">Partie</div>
      <a class="btn ghost" href="#/">ACCUEIL <small>la partie reste en cours</small></a>
      ${abandon}
      ${del}
      <p class="note" style="margin:0">Abandonner : la partie reste dans l'historique et compte dans les moyennes. Supprimer (partie d'essai) : elle disparaît complètement.</p>
    </div></div></div>`;
}

/**
 * Verres et alcoolémie (lot 7) : pour chaque joueur, ses verres dans la partie (− / + VERRE) et son alcoolémie estimée
 * (verres des 24 dernières heures, toutes parties confondues). Aussi sur l'écran de fin de partie (sans les boutons).
 */
export function drinksSection(ids, { edit = true, title = true } = {}) {
  const g = store.current;
  const rows = ids.map(id => {
    const p = playerById(id);
    const buttons = edit ? `<button type="button" class="mv" data-act="drink-minus" data-arg="${esc(id)}" ${drinksHere(id) ? '' : 'disabled'} aria-label="Retirer le dernier verre de ${esc(p.name)}">${ico('minus')}</button>
        <button type="button" class="mv add" data-act="drink-plus" data-arg="${esc(id)}" aria-label="${esc(plusLabel(p.name))}">${plusDrink()}</button>` : '';
    return `<li>${avatarHtml(p, 32)}<div class="col"><span class="nm ell">${esc(p.name)}</span>
        ${drinkCount(gameDrinkTally(g, id))}</div>${buttons}</li>`;
  }).join('');
  const soiree = g && g.soiree ? ' Les verres de la soirée continuent d\'une partie à l\'autre.' : '';
  // 0.8.2 : verre de 25 cl ou pinte de 50 cl (elle compte pour 2), choisi au-dessus de la liste.
  return `${title ? `<div class="sec" style="margin-bottom:0">${g && g.soiree ? 'Verres de la soirée' : 'Verres'}</div>` : ''}
    ${edit ? drinkSizeSeg() : ''}
    <ul class="drinks">${rows}</ul>
    ${edit && ids.length > 1 ? `<button type="button" class="btn ghost all-drinks" data-act="drink-all">${plusDrink()} ${pintMode() ? 'UNE PINTE' : 'UN VERRE'} POUR TOUS</button>` : ''}
    <p class="note" style="margin:0">Les verres de 25 cl et les pintes sont comptés à part. Chaque verre est noté dans l'historique de la partie, au tour où il a été pris.${soiree} Qui a bu ne conduit pas.</p>`;
}

/** Panneau des verres (lot 7.6) : ouvert par le bouton verre du bandeau, sans passer par la pause. Le joueur qui lance
 *  en premier, puis les autres dans l'ordre de la partie. */
function drinksSheet(v) {
  const ids = v.cfg.players.map((_, k) => v.cfg.players[(v.shown + k) % v.n]);
  return `<div class="sheet-bg" role="dialog" aria-label="Verres" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>${v.g.soiree ? 'Verres de la soirée' : 'Verres'}</span></h1><button type="button" class="act" data-act="drinks-close" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body" style="padding-top:12px">
      ${drinksSection(ids, { title: false })}
      <button type="button" class="btn primary big" data-act="drinks-close">${ico('play')} RETOUR AU JEU</button>
    </div></div></div>`;
}

// ------------------------------------------------------------------ après le rendu : annonce, saisie sur la cible
/** Appelé par app.js après chaque rendu de l'écran de jeu. */
export function mountGame() {
  const g = store.current;
  if (!g) return;
  const ui = g.ui;
  if (ui.announce !== null && !ui.frozen && !announceTimer) announceTimer = setTimeout(endAnnounce, ANNOUNCE_MS);
  const wrap = document.getElementById('tboard');
  if (!wrap) return;
  bindBoard(wrap);
  if (ui.loupe) {
    frozenLoupe(wrap, ui.loupe); // loupe figée (sommaire de maquette) : comme si le doigt était posé en (x, y)
  }
}

function endAnnounce() {
  announceTimer = null;
  const g = store.current;
  if (!g || g.ui.announce === null) return;
  g.ui.announce = null;
  g.ui.slide = animationsOn();
  if (location.hash === '#/jeu') refresh();
}

/** Coupe l'annonce (une saisie ne l'attend jamais) ; `dom` : la retire de l'écran sans tout redessiner. */
function stopAnnounce(dom = false) {
  clearTimeout(announceTimer);
  announceTimer = null;
  const ui = store.current && store.current.ui;
  if (!ui) return;
  ui.frozen = false;
  if (ui.announce !== null) {
    ui.announce = null;
    if (dom) document.querySelector('.announce')?.remove();
  }
}

function bindBoard(wrap) {
  bindBoardInput(wrap, {
    canStart: () => { const g = store.current; return !!g && !g.ui.pause && !g.ui.panel && !g.ui.drinks && !pendingVisit(currentState(), g.validated); },
    onStart: () => { stopAnnounce(true); store.current.ui.loupe = null; },
    onRelease: (x, y) => {
      const dart = segmentAt(x, y);
      if (dart) enter(dart, null, [x, y]);
      else { buzz(BUZZ.undo); hint('HORS CIBLE · RIEN N\'EST COMPTÉ'); }
    },
  });
}
const hint = boardHint;

// ------------------------------------------------------------------ saisie
/** Lot 9.6 C : verdict de la fléchette qui vient d'être jouée (X01), d'après la volée où elle tombe. */
export function x01DartVerdict(g, st, dart) {
  const v = st.lastEvent === 'dart' ? st.visit : st.lastVisit;
  if (!v || !v.darts || !v.darts.length) return null;
  const k = v.darts.length;
  const before = v.startRemaining - v.darts.slice(0, k - 1).reduce((n, d) => n + d.segment * d.multiplier, 0);
  return x01Verdict({ dart, before, after: before - dart.segment * dart.multiplier, bust: st.lastEvent === 'bust' || !!v.bust,
    finish: ['leg_won', 'match_won', 'placed'].includes(st.lastEvent) || !!v.finish, outMode: g.config.outMode, dartsLeft: 4 - k });
}

function play(dart, key, pos = null) {
  const g = store.current;
  if (!g) return false;
  stopAnnounce();
  const r = throwDart(g.config, g.darts, dart);
  if (!r.ok) { buzz(BUZZ.undo); return false; }
  g.darts = r.darts;
  // Position réelle du doigt (paysage), gardée avec la fléchette pour marquer l'impact.
  if (pos) g.darts[g.darts.length - 1] = { segment: dart.segment, multiplier: dart.multiplier, pos: pos.map(c => Math.round(c * 1000) / 1000) };
  g.ui.mult = 1;
  saveCurrent();
  // Retours (lot 3) : son, annonce vocale et célébration ; jamais d'attente (l'annonce part après le rendu).
  const st = r.state;
  const v = st.lastVisit;
  // Journal (lot 9.5) : la fléchette, et la volée close (total, bust, reste).
  log('saisie', `X01 : fléchette ${g.darts.length} ${formatDart(dart)}${st.lastEvent === 'dart' || !v ? '' : ` · volée ${v.bust ? 'BUST' : v.scored}${v.finish ? ' · manche gagnée' : ` · reste ${v.remainingAfter}`}`}`);
  const name = i => playerById(g.config.players[i]).name;
  // Lot 7 : célébration des nuls (volée à 0, sous 10, bust, série de mauvaises volées), ironique : bandeau, son de
  // trombone, annonce moqueuse à la place du total. Lot 7.8 : « Atila, le roi des uns » (ranking.js) ; Angelina, sous
  // 20 points, part en moto dans le fossé (le roi des uns passe avant).
  const f = motoFlop(flop(st), v, name);
  switch (st.lastEvent) {
    case 'visit_end':
      buzz(BUZZ.dart);
      // Lot 9.6 C : 180, nuls (inchangés), bonne volée (60 et plus), sinon le verdict de la dernière fléchette.
      if (v.total === 180 || f) sound(v.total === 180 ? 'max' : f.kind === 'moto' || f.kind === 'uns' ? f.kind : 'flop');
      else if (v.total >= GOOD_VISIT) { verdictSound(x01DartVerdict(g, st, dart), v.player); sound('visit-good'); }
      else verdictSound(x01DartVerdict(g, st, dart), v.player);
      later(() => say(f ? SPEECH.flop(f.kind, name(v.player), f.value) : SPEECH.total(v.total), { strong: v.total === 180 }));
      // Lot 9 : record personnel (meilleure volée de toutes ses parties) annoncé après le total ; puis le défi.
      if (!v.bust && visitIsRecord(g, st)) { sound('record'); later(() => say(`Record personnel pour ${name(v.player)} !`, { strong: true })); }
      sayDefi(g, st);
      if (v.total >= 100) celebrate(v.total === 180 ? 'max' : v.total >= 140 ? 'ton40' : 'ton', v.total, v.player);
      else if (f) celebrate(`nul-${f.kind}`, f.kind === 'serie' ? f.value : v.total, v.player);
      break;
    case 'bust':
      buzz(BUZZ.bust);
      sound('bust');
      sayDefi(g, st);
      later(() => say(f ? SPEECH.flop(f.kind, name(v.player), f.value) : SPEECH.bust()));
      if (f) celebrate(`nul-${f.kind}`, f.kind === 'serie' ? f.value : 'BUST', v.player);
      break;
    case 'placed': { // jouer jusqu'au bout (lot 7) : une place gagnée, la volée attend VALIDER, la partie continue
      const place = st.finishOrder.length;
      buzz(BUZZ.leg);
      sound('finish');
      celebrate(place === 1 ? (v.startRemaining >= 100 ? 'finish-big' : 'finish') : 'place', place === 1 ? v.startRemaining : placeLabel(place), v.player);
      later(() => say(place === 1 ? SPEECH.match(name(v.player)) : SPEECH.place(place, name(v.player))));
      break;
    }
    case 'leg_won':
    case 'match_won':
      buzz(BUZZ.leg);
      sound('finish');
      celebrate(v.startRemaining >= 100 ? 'finish-big' : 'finish', v.startRemaining, v.player);
      if (st.lastEvent === 'leg_won') later(() => say(SPEECH.leg(name(v.player))));
      else {
        // Lot 7 : en jouant jusqu'au bout, la dernière finition donne une place (le gagnant est déjà connu) ; puis le
        // dernier paie sa tournée.
        const place = st.finishOrder.indexOf(v.player) + 1;
        later(() => say(place > 1 ? SPEECH.place(place, name(v.player)) : SPEECH.match(name(v.player))));
        const payers = []; // 0.11.2 : plus de tournée du dernier (personne ne la paie)
        const badges = gameBadgesSay(g); // lot 9 : badges gagnés dans la partie
        const bs = gameBadgesSound(g);
        if (badges) setTimeout(() => { if (bs) sound(bs); say(badges); }, payers.length ? 5200 : 2600);
      }
      if (st.status === 'finished') gameFinished(); // 0.26.0 : comptée et envoyée sans attendre ACCUEIL ou REVANCHE
      go(st.lastEvent === 'leg_won' ? '#/manche' : '#/fin');
      return true;
    default: { buzz(BUZZ.dart); const vd = x01DartVerdict(g, st, dart); if (vd) verdictSound(vd, st.visit ? st.visit.player : null); else sound(dartSound(dart)); }
  }
  refresh();
  flash(key);
  return true;
}

// Lot 9.3 : saisie à la voix (voiceinput.js) — comme le pavé : rien pendant une volée en attente de VALIDER.
registerVoice('#/jeu', {
  ready: () => { const g = store.current; return !!g && !g.ui.pause && !g.ui.panel && !g.ui.drinks; },
  play: d => {
    const g = store.current;
    if (!g || pendingVisit(currentState(), g.validated)) return false;
    if (onlineGame()) return onlineInput('dart', d);
    return play(makeDart(d.segment, d.multiplier), null);
  },
  undo: () => { const g = store.current; if (!g || !g.darts.length) return false; if (onlineGame()) return onlineInput('undo'); undo(); refresh(); return true; },
  validate: () => { const g = store.current; if (!g || !pendingVisit(currentState(), g.validated)) return false; if (onlineGame()) return onlineInput('validate'); validate(); return true; },
});

/** Après le rendu : l'annonce vocale ne passe jamais avant l'écran. */
const later = fn => setTimeout(fn, 0);

/** Lot 7.8 : le pseudo Angelina (sans tenir compte de la casse, des accents ni des espaces autour). */
export const isAngelina = name => String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'angelina';

/** Lot 7.8 : la moquerie d'Angelina (volée sous 20, hors bust) devient la moto dans le fossé ; le roi des uns d'abord. */
export function motoFlop(f, v, name) {
  if (!f || !v || v.bust || f.kind === 'uns' || f.kind === 'bust' || v.scored >= 20) return f;
  return isAngelina(name(v.player)) ? { kind: 'moto', value: v.scored } : f;
}

// ------------------------------------------------------------------ célébration 100+ / 140+ / 180 / finition (lot 3)
// Bandeau en haut de l'écran, gradué : discret en vidéo inverse pour 100+, plus haut à la couleur du joueur pour 140+,
// la moitié haute de l'écran pour 180 ; un bandeau pour chaque finition (à la couleur du joueur si elle fait 100 ou
// plus). Jamais le rouge (réservé au bust). Sans animation si le réglage Animations est sur NON ou si le téléphone
// demande moins d'animations.
// Lot 7.1 (demande de Guillaume : « on n'a pas le temps de les voir ») : plus de minuterie, le bandeau reste jusqu'à
// ce qu'on l'acquitte. Le premier appui, n'importe où, le ferme et ne fait rien d'autre (ni fléchette, ni VALIDER, ni
// ANNULER) : il est avalé de l'appui au relâcher.
// Lot 7 : les nuls ont aussi leur bandeau (vidéo inverse, chiffre qui tangue) ; jamais le rouge non plus.
const CELE_TEXT = { ton: '100 +', ton40: '140 +', max: 'CENT QUATRE-VINGTS', finish: 'FINITION', 'finish-big': 'GROSSE FINITION',
  place: 'FINI · PLACE', 'nul-zero': 'BRAVO ! ZÉRO POINT', 'nul-low': 'QUEL TALENT', 'nul-bust': 'BUST · ON APPLAUDIT',
  'nul-serie': 'VOLÉES NULLES D\'AFFILÉE', 'nul-uns': 'ATILA, LE ROI DES UNS', 'nul-moto': 'MOTO DANS LE FOSSÉ' };

// Lot 7.8 : saynètes des bandeaux (trait à l'encre du bandeau, angles droits). Animées à l'entrée du bandeau
// (classe enter), sinon montrées à leur dernière image : la moto renversée dans le fossé, la couronne posée sur le 1.
const MOTO_SCENE = `<svg class="cscene moto-sc" viewBox="0 0 260 74" aria-hidden="true">
  <path class="road" d="M0 40H168L184 66H226L240 40H260"/><path class="grass" d="M176 54L180 50M232 52L236 48M214 66V60M196 66V61"/>
  <g class="moto"><g class="bike">
    <path d="M-14 0A7 7 0 1 0 -13.99 0M16 0A7 7 0 1 0 16.01 0"/>
    <path d="M-14 0L-4 -9H10L16 0M-4 -9L2 0H10M10 -9L13 -16H17"/>
    <path d="M-2 -10L2 -22L9 -18L6 -10"/><path d="M0 -28H7V-22H0Z" class="helmet"/>
  </g></g>
  <g class="dust"><path d="M190 56H194V60H190ZM204 50H207V53H204ZM218 56H222V60H218ZM198 44H200V46H198Z"/></g>
</svg>`;
const CROWN_SCENE = `<svg class="cscene crown-sc" viewBox="0 0 120 74" aria-hidden="true">
  <g class="crown"><path d="M38 30L40 10L52 22L60 6L68 22L80 10L82 30Z"/><path d="M38 35H82"/></g>
  <path class="one" d="M52 46L62 40V72M52 72H72"/>
</svg>`;

export function celebrate(kind, value, player) {
  const g = store.current;
  if (!g) return;
  g.ui.cele = { kind, value, player, fresh: true };
}

function endCele() {
  const g = store.current;
  if (g) g.ui.cele = null;
  document.querySelector('.cele')?.remove();
  // Lot 7.4 : l'animation de tour attendait la fermeture du bandeau.
  if (location.hash === '#/jeu') syncTurnFx(turnFx(), animationsOn());
}

// Acquittement : l'appui est arrêté avant l'appli (phase de capture sur window), puis son relâcher et son clic aussi ;
// le bandeau se ferme au relâcher (rien n'apparaît dessous pendant que le doigt est posé).
let ackPointer = null;
const swallowEv = ev => { ev.preventDefault(); ev.stopImmediatePropagation(); };
window.addEventListener('pointerdown', ev => {
  if (!(store.current && store.current.ui.cele)) return;
  if (!document.querySelector('.cele')) { endCele(); return; } // on a quitté l'écran : la fête est passée
  // Lot 7.8 (retours du 20/11) : un appui sur VALIDER ferme le bandeau ET valide la volée, en un seul appui ; l'appui
  // continue vers VALIDER (app.js, au relâcher).
  const val = ev.target && ev.target.closest && ev.target.closest('.validate.go');
  if (val && !val.disabled) { store.current.ui.cele = null; document.querySelector('.cele')?.remove(); return; }
  ackPointer = ev.pointerId;
  swallowEv(ev);
}, true);
window.addEventListener('pointerup', ev => {
  if (ev.pointerId !== ackPointer) return;
  ackPointer = null;
  swallowEv(ev);
  endCele();
  ackClick = Date.now();
}, true);
window.addEventListener('pointercancel', ev => { if (ev.pointerId === ackPointer) { ackPointer = null; endCele(); } }, true);
let ackClick = 0;
window.addEventListener('click', ev => { if (Date.now() - ackClick < 600) { ackClick = 0; swallowEv(ev); } }, true);
// Clavier (ordinateur, tests) : Entrée, Espace ou Échap ferment aussi le bandeau, sans autre effet.
window.addEventListener('keydown', ev => {
  if (store.current && store.current.ui.cele && document.querySelector('.cele') && ['Enter', ' ', 'Escape'].includes(ev.key)) { swallowEv(ev); endCele(); }
}, true);

/** Bandeau en cours (jeu, fin de manche, fin de partie), ou ''. */
export function celebrationHtml() {
  const g = store.current;
  const c = g && g.ui.cele;
  if (!c) return '';
  const p = playerById(g.config.players[c.player]);
  const enter = c.fresh && animationsOn() ? ' enter' : '';
  c.fresh = false;
  const nul = c.kind.startsWith('nul-') ? ' nul' : '';
  const scene = c.kind === 'nul-moto' ? MOTO_SCENE : c.kind === 'nul-uns' ? CROWN_SCENE : '';
  return `<div class="cele ${c.kind}${nul}${scene ? ' scene' : ''}${enter}" role="status" aria-live="polite" data-layer style="--pc:${colorOf(p)}">
    <small>${CELE_TEXT[c.kind]}</small><b data-shrink>${c.value}</b><span class="nm ell">${esc(p.name)}</span>${scene}
    <span class="ok" aria-hidden="true">${location.hash === '#/jeu' && store.current && pendingVisit(currentState(), store.current.validated) ? 'VALIDER, OU TOUCHER POUR FERMER' : 'TOUCHER POUR CONTINUER'}</span></div>`;
}

/** Lot 9 : résultat du défi de la volée qui vient de se fermer, dit après le total. */
function sayDefi(g, st) {
  if (!g.defis) return;
  const r = defiResult(g, st, st.visits.length - 1);
  if (!r) return;
  const n = playerById(g.config.players[r.player]).name;
  if (r.declare && r.declared === undefined) { setTimeout(() => say(`${n}, ${DEFIS[r.key].short.toLowerCase()} : fait, ou pas fait ?`), 1800); return; }
  setTimeout(() => sound(defiSound(!!r.ok)), 900);
  const txt = r.ok ? (r.gage === 'autres' ? `Défi réussi ! Les autres boivent.` : `Défi réussi, ${n} !`)
    : `Défi raté. ${r.gage === 'pinte' ? 'Une pinte' : 'Un verre'} pour ${n} !`;
  setTimeout(() => say(txt), 1800);
}

/** ANNULER : retire la dernière fléchette (aussi depuis une volée en attente, une fin de manche ou de partie). */
export function undo() {
  const g = store.current;
  if (!g || !g.darts.length) return;
  stopAnnounce();
  log('saisie', `X01 : ANNULER (fléchette ${g.darts.length} ${formatDart(g.darts[g.darts.length - 1])} retirée)`);
  g.darts = undoDart(g.config, g.darts).darts;
  g.validated = validatedAfterUndo(g.validated, g.darts.length);
  // Lot 7.8 : une volée rouverte perd sa déclaration (« main gauche »).
  if (g.defiDecl) {
    const closed = currentState().visits.length;
    for (const k of Object.keys(g.defiDecl)) if (Number(k) >= closed) delete g.defiDecl[k];
  }
  g.ui.mult = 1;
  g.ui.cele = null;
  saveCurrent();
  buzz(BUZZ.undo);
  sound('undo');
}

/** VALIDER : la volée en attente est acquise, au joueur suivant (annonce « À TOI »). */
export function validate() {
  const g = store.current;
  if (!g) return;
  const s = currentState();
  if (!pendingVisit(s, g.validated)) return;
  log('saisie', `X01 : VALIDER (${s.dartCount} fléchettes)`);
  g.validated = s.dartCount;
  g.ui.mult = 1;
  saveCurrent();
  if (g.config.players.length > 1) { g.ui.announce = s.currentPlayer; g.ui.frozen = false; }
  buzz(BUZZ.dart);
  sound('validate');
  // Le joueur qui commence son tour avec une finition jouable : « PSEUDO, il reste quarante ».
  const rest = s.remaining[s.currentPlayer];
  if (suggestCheckout(rest, g.config.outMode, 3)) later(() => say(SPEECH.checkout(playerById(g.config.players[s.currentPlayer]).name, rest)));
  refresh();
}

/** Ouvre le panneau cible + historique sur la volée en cours. */
function openPanel() {
  stopAnnounce();
  selectLogCell(null);
  Object.assign(store.current.ui, { panel: 'board', pause: false, confirm: false, fix: null });
  refresh();
}

/** Fléchette choisie dans le sélecteur : correction calculée (rien n'est modifié avant CORRIGER). */
function proposeFix(f, dart) {
  const g = store.current;
  f.pick = dart;
  f.result = correctDart(g.config, g.darts, f.index, dart);
  refresh();
}

/** Touche du pavé (appelée au relâcher, si le doigt n'a pas glissé : app.js). */
export function key(k) {
  const g = store.current;
  if (!g || g.ui.pause || g.ui.panel || g.ui.drinks) return;
  const ui = g.ui;
  if (k === 'undo') { if (onlineGame()) { onlineInput('undo'); flash('undo'); return; } undo(); refresh(); flash('undo'); return; }
  if (pendingVisit(currentState(), g.validated)) return; // volée en attente : seuls ANNULER et VALIDER
  if (k === 'S' || k === 'D' || k === 'T') {
    const m = { S: 1, D: 2, T: 3 }[k];
    ui.mult = ui.mult === m ? 1 : m;
    stopAnnounce();
    refresh(); flash(k); return;
  }
  if (k === '0') return enter(makeDart(0, 1), k);
  if (k === '50') return enter(makeDart(25, 2), k);
  if (k === '25') { if (ui.mult === 3) return; return enter(makeDart(25, ui.mult === 2 ? 2 : 1), k); }
  const n = Number(k);
  if (n >= 1 && n <= 20) enter(makeDart(n, ui.mult), k);
}

/** Fléchette saisie sur ce téléphone : jouée ici, ou, en ligne (lot 9.2), demandée à l'hôte (seul le lanceur saisit). */
function enter(dart, key = null, pos = null) {
  if (onlineGame()) { if (onlineInput('dart', dart)) { store.current.ui.mult = 1; flash(key); } return true; }
  return play(dart, key, pos);
}

// Lot 9.2 : partie en ligne. Les opérations acceptées par l'hôte sont jouées ici comme une saisie locale.
registerOnlineGame('x01', {
  apply(op) {
    const g = store.current;
    if (!g) return false;
    if (op.op === 'dart') return play(makeDart(op.dart.segment, op.dart.multiplier), null);
    if (op.op === 'undo') {
      if (!g.darts.length) return false;
      undo();
      if (location.hash !== '#/jeu') go('#/jeu', { replace: true }); else refresh();
      return true;
    }
    if (op.op === 'validate') {
      if (legEndPending()) {
        g.validated = g.darts.length;
        saveCurrent();
        if (g.config.players.length > 1) { g.ui.announce = currentState().currentPlayer; g.ui.frozen = false; }
        go('#/jeu', { replace: true });
        return true;
      }
      if (!pendingVisit(currentState(), g.validated)) return false;
      validate();
      return true;
    }
    return false;
  },
  ctx() {
    const g = store.current;
    const s = currentState();
    if (!g || !s) return {};
    const ids = g.config.players;
    const pend = pendingVisit(s, g.validated);
    const legEnd = legEndPending();
    const finished = s.status !== 'playing';
    const last = s.lastVisit ? ids[s.lastVisit.player] : null;
    const undoable = g.darts.length > (g.validated || 0) ? (finished || pend || legEnd ? last : s.dartNumber > 1 ? ids[s.currentPlayer] : null) : null;
    return { thrower: finished || pend || legEnd ? null : ids[s.currentPlayer], pending: finished ? null : pend || legEnd ? last : null, undoable };
  },
});

/**
 * Lot 9.2 : sur un téléphone qui n'a pas la main (autre lanceur, pause, connexion perdue), un cache sur le pavé (ou la
 * cible) dit qui lance ; l'hôte y trouve PASSER SON TOUR et EXCLURE quand un joueur a perdu la connexion.
 */
export function onlineCover() {
  const t = turnInfo();
  if (!t) return '';
  let body;
  if (!t.connected) body = `<b>${t.role === 'host' ? 'EN ATTENTE DES JOUEURS' : 'RECONNEXION À L\'HÔTE…'}</b><small>${t.role === 'host' ? 'Les autres téléphones reviennent d\'eux-mêmes.' : 'Partie suspendue : elle reprend dès que l\'hôte répond.'}</small>`;
  else if (t.paused) {
    const name = esc(playerById(t.paused).name);
    body = `<b>PAUSE</b><small><span class="nm">${name}</span> a perdu la connexion : la partie reprend à son retour.</small>${t.role === 'host'
      ? `<div class="btns two"><button type="button" class="btn" data-act="on-pass" data-arg="0">PASSER SON TOUR</button><button type="button" class="btn" data-act="on-pass" data-arg="1">EXCLURE</button></div>` : ''}`;
  } else if (t.mine) return '';
  else if (t.who) body = `<b>À <span class="nm">${esc(playerById(t.who).name)}</span></b><small>Sur son téléphone. Ses fléchettes arrivent ici une par une.</small>`;
  else return '';
  return `<div class="oncover" role="status" data-layer>${body}</div>`;
}

export const actions = {
  validate() { if (onlineGame()) { onlineInput('validate'); return; } validate(); },
  'on-pass'(v) { hostPass(v === '1'); }, // lot 9.2 : joueur perdu
  pause() { stopAnnounce(); store.current.ui.pause = true; store.current.ui.confirm = false; refresh(); },
  resume() { store.current.ui.pause = false; store.current.ui.confirm = false; refresh(); },
  'open-board'() { openPanel(); },
  'open-history'() { openPanel(); },
  'close-panel'() { Object.assign(store.current.ui, { panel: null, fix: null }); refresh(); },
  'board-view'(val) { store.current.ui.boardView = val === 'leg' ? 'leg' : 'visit'; refresh(); },
  // Correction d'une fléchette (lot 3, I)
  'fix-dart'(i) { if (onlineGame()) return; store.current.ui.fix = { index: Number(i), mult: 1, pick: null, result: null }; refresh(); }, // lot 9.2 : pas de correction en ligne
  'fix-mult'(m) { const f = store.current.ui.fix; if (f) { f.mult = f.mult === Number(m) ? 1 : Number(m); refresh(); } },
  'fix-key'(k) {
    const f = store.current.ui.fix;
    if (!f) return;
    const n = Number(k);
    const dart = n === 50 ? makeDart(25, 2) : n === 0 ? makeDart(0, 1) : n === 25 ? (f.mult === 3 ? null : makeDart(25, f.mult === 2 ? 2 : 1)) : makeDart(n, f.mult);
    if (dart) proposeFix(f, dart);
  },
  'fix-board'(arg, el, ev) {
    const f = store.current.ui.fix;
    const svg = el && el.querySelector('svg');
    if (!f || !svg || !ev) return;
    const r = svg.getBoundingClientRect();
    const scale = r.width / 2 / RINGS.edge;
    const x = (ev.clientX - r.left - r.width / 2) / scale, y = (ev.clientY - r.top - r.height / 2) / scale;
    const dart = segmentAt(x, y);
    if (dart) proposeFix(f, { segment: dart.segment, multiplier: dart.multiplier, pos: [x, y].map(c => Math.round(c * 1000) / 1000) });
  },
  'fix-again'() { const f = store.current.ui.fix; if (f) { Object.assign(f, { pick: null, result: null, mult: 1 }); refresh(); } },
  'fix-cancel'() { store.current.ui.fix = null; refresh(); },
  'fix-yes'() {
    const g = store.current;
    const f = g.ui.fix;
    if (!f || !f.result || !f.result.ok) return;
    g.darts = f.result.darts;
    g.ui.fix = null;
    saveCurrent();
    buzz(BUZZ.dart);
    refresh();
  },
  'drink-plus'(id) { addDrink(id, Date.now(), pintMode()); buzz(BUZZ.dart); refresh(); },
  // Lot 9 : un verre (ou une pinte) pour chaque joueur de la partie, d'un appui (tournée servie).
  // Lot 7.8 : DÉGRISEMENT EXPRESS (Tsia) : les voyelles du défi reviennent, le temps de la volée.
  degrise(id) {
    const g = store.current;
    if (!g || g.ui.degrise === id) return;
    g.ui.degrise = id;
    buzz(BUZZ.dart);
    sound('fx-gulp');
    later(() => say('Kombucha au gingembre. Ça dégrise !'));
    refresh();
  },
  // Lot 7.8 : défi « main gauche », déclaré par le joueur (1 : fait, 0 : pas fait, x : à redéclarer).
  'defi-decl'(arg) {
    const g = store.current;
    const [id, val] = String(arg).split('|');
    const d = g && defiNow(view());
    if (!d || d.id !== id || d.open || !DEFIS[d.key].declare) return;
    g.defiDecl = { ...(g.defiDecl || {}) };
    if (val === 'x') delete g.defiDecl[d.index]; else g.defiDecl[d.index] = val === '1';
    saveCurrent();
    buzz(BUZZ.dart);
    if (val === '1') later(() => say(`Défi réussi, ${playerById(g.config.players[d.player]).name} !`));
    else if (val === '0') later(() => say(`Défi raté. Un verre pour ${playerById(g.config.players[d.player]).name} !`));
    refresh();
  },
  // 0.11.2 : un instant différent (à la milliseconde) pour chacun, pour ne pas être pris pour une tournée notée par
  // l'ancienne version (même instant pour tous, voir store.js › tourneeDrinks).
  'drink-all'() { const now = Date.now(); store.current.config.players.forEach((id, i) => addDrink(id, now + i, pintMode())); buzz(BUZZ.dart); refresh(); },
  'drinks-open'() { stopAnnounce(); store.current.ui.drinks = true; refresh(); },
  'drinks-close'() { store.current.ui.drinks = false; refresh(); },
  'drink-minus'(id) { removeDrink(id); buzz(BUZZ.undo); refresh(); },
  abandon() { store.current.ui.confirm = 'abandon'; refresh(); },
  'delete-current'() { store.current.ui.confirm = 'delete'; refresh(); },
  'delete-current-yes'() { stopAnnounce(); deleteCurrent(); go('#/'); },
  'abandon-no'() { store.current.ui.confirm = false; refresh(); },
  'abandon-yes'() {
    stopAnnounce();
    if (onlineGame()) { onlineQuit(); return; } // lot 9.2
    archiveCurrent(true); go('#/');
  },
};
