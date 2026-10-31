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
import { store, currentState, playerById, archiveCurrent, deleteCurrent, animationsOn, saveCurrent, legEndPending } from '../store.js';
import { esc, ico, avg, OUT_SHORT, maquetteButtons } from '../dom.js';
import { avatarHtml, colorIndex } from '../avatars.js';
import { throwDart, undoDart } from '../../engine/x01.js';
import { makeDart, formatDart } from '../../engine/darts.js';
import { suggestCheckout } from '../../engine/checkout.js';
import { playerSummary } from '../../engine/stats.js';
import { segmentAt, zoneLabel, RINGS } from '../../engine/board.js';
import { boardSvg, plainBoard, impactsFor, markIcon } from '../board.js';
import { rollHtml } from '../roll.js';
import { pendingVisit, validatedAfterUndo } from '../turn.js';
import { go, refresh, buzz, BUZZ } from '../nav.js';
import { themeControls, storageBanner } from './settings.js';
import { gameLog, selectLogCell, selectedLogCell } from './history.js';
import { sound, dartSound, say, SPEECH } from '../feedback.js';
import { correctDart, locateDart, visitStart, CORRECT_ERRORS } from '../../engine/correct.js';

export const ANNOUNCE_MS = 800;
const LENS = { size: 150, zoom: 2.5, gap: 26 };
const K = 100; // échelle du dessin de la cible (board.js)

let announceTimer = null;

export const isLandscape = () => { try { return matchMedia('(orientation: landscape)').matches; } catch (e) { return false; } };

const dartLabel = d => {
  const f = formatDart(d);
  return f === '0' ? '0' : f.replace(/^S/, '');
};
const colorOf = p => `var(--av-${colorIndex(p.avatar?.color)})`;

/** Retour visuel : la touche appuyée passe en inverse un court instant (même après redessin). */
function flash(key) {
  if (!key) return;
  const el = document.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  el.classList.add('hit');
  setTimeout(() => el.classList.remove('hit'), 140);
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
    next: pend ? s.currentPlayer : (s.currentPlayer + 1) % n,
    visitIdx: pend ? s.visits.length - 1 : 'open',
    totalKey: pend ? s.visits.length - 1 : s.visits.length,
  };
}

// ------------------------------------------------------------------ morceaux communes aux deux mises en page
// Bandeau : la ligne sous le pseudo se compacte par paliers si elle ne tient pas (fit.js) : manches gagnées en
// « 1/2 », « MANCHE 2 » en « M2 », carrés de fléchettes retirés, « FLÉCHETTE 2/3 » en « FL. 2/3 ».
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
  const state = `<span class="dn" aria-hidden="true">${squares}</span>`
    + (pend ? (pend.bust ? '<b>BUST</b>' : '<b><span class="lg">VOLÉE </span>TERMINÉE</b>')
      : `<b><span class="lg">FLÉCHETTE</span><span class="sh">FL.</span> ${s.dartNumber}/3</b>`);
  return `<header class="gband${slide ? ' slide' : ''}" style="--pc:${colorOf(player)};--n:${[...player.name].length}">
      ${avatarHtml(player, 56)}
      <div class="who"><span class="nm" data-shrink>${esc(player.name)}</span>
        <span class="legs" data-fit="4">${state}<span class="mn"><span class="lg">MANCHE </span><span class="sh">M</span>${s.legNumber}</span>${legs}</span></div>
      <button type="button" class="pause" data-act="pause" data-press aria-label="Pause">${ico('pause')}</button>
    </header>`;
}

function rest(v) {
  const { cfg, player, remaining, s, shown } = v;
  if (v.bust) {
    return `<section class="rest alert" role="alert" aria-label="Bust">
      <div class="meta"><span class="ell">${esc(player.name)}</span><span>AUCUN POINT</span></div>
      <b class="bust-word" data-shrink>BUST</b><span class="bust-rest">RESTE ${remaining}</span><span id="remaining" hidden>${remaining}</span>
    </section>`;
  }
  const legAvg = playerSummary(s, shown, s.legNumber).average;
  return `<section class="rest" aria-label="Reste à faire">
      <div class="meta"><span class="ell">${cfg.startScore} · ${OUT_SHORT[cfg.outMode]}</span><span>MOY. ${avg(legAvg)}</span></div>
      <div class="big" id="remaining" aria-label="${remaining}" data-shrink>${rollHtml(`r:${s.legNumber}:${shown}`, remaining)}</div>
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
  return `<section class="others${many ? ' many' : ''}" aria-label="Autres joueurs">${order.map(i => {
    const p = playerById(cfg.players[i]);
    const isNext = i === next;
    return `<div class="op${isNext ? ' next' : ''}"${isNext ? ' aria-label="Joueur suivant"' : ''}>${avatarHtml(p, many ? 20 : 34, 'mono')}
      <div class="col"><span class="l1"><span class="nm ell"${isNext ? ' data-fit="1"' : ''}>${esc(p.name)}</span>${isNext ? `<span class="tag-next"><span class="lg">SUIVANT</span><span class="sh">${ico('chev')}</span></span>` : ''}</span><span class="r" data-shrink>${rollHtml(`o:${s.legNumber}:${i}`, s.remaining[i])}</span></div></div>`;
  }).join('')}</section>`;
}

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
  const overlays = `${v.ui.panel ? livePanel(v) : ''}${v.ui.pause ? pauseSheet() : ''}`;
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
  const mk = (k, label, word) => `<button type="button" class="key m" data-key="${k}" aria-pressed="${!wait && m === { S: 1, D: 2, T: 3 }[k]}" ${dis}><span class="kl" data-shrink>${label}<small>${word}</small></span></button>`;
  const pad = `<section class="pad-k${m > 1 && !wait ? ' armed' : ''}${wait ? ' wait' : ''}" aria-label="Saisie">
      <div class="krow mult">${mk('S', 'S', 'SIMPLE')}${mk('D', 'D', 'DOUBLE')}${mk('T', 'T', 'TRIPLE')}</div>
      ${nums.join('')}
      <div class="krow last">
        <button type="button" class="key bull" data-key="25" ${m === 3 || wait ? 'disabled' : ''}><span class="kl" data-shrink>${m === 2 && !wait ? '<sup>D</sup>' : ''}25</span></button>
        <button type="button" class="key" data-key="50" ${dis}><span class="kl" data-shrink>50</span></button>
        <button type="button" class="key zero" data-key="0" ${dis}>0<small>RATÉ</small></button>
        <button type="button" class="key undo" data-key="undo" ${g.darts.length ? '' : 'disabled'}>${ico('undo')}<span class="kl" data-shrink>ANNULER</span></button>
      </div>
      ${wait ? validateButton(v, 'over') : ''}
    </section>`;

  return `<div class="game port">
    <div class="toparea">${band(v, slide)}${rest(v)}${announce(v)}</div>
    <div class="vblock"><div class="vcol">${visitBoxes(v)}${checkoutLine(v)}</div>${smallBoard(v)}</div>
    ${others(v)}${pad}
    ${overlays}${celebrationHtml()}
  </div>`;
}

function landscape(v, slide, overlays) {
  const g = v.g;
  const wait = !!v.pend;
  const impacts = impactsFor(g, v.s, v.visitIdx, { previous: false }); // comme la petite cible : la volée seule
  return `<div class="game land">
    <div class="lcol">
      <div class="toparea">${band(v, slide)}
        <div class="mid">${rest(v)}<div class="side">${visitBoxes(v)}${checkoutLine(v)}</div></div>
        ${announce(v)}</div>
      ${others(v)}
      <div class="lbtns">
        <button type="button" class="key zero" data-key="0" ${wait ? 'disabled' : ''}>0<small>RATÉ</small></button>
        <button type="button" class="key undo" data-key="undo" ${g.darts.length ? '' : 'disabled'}>${ico('undo')}<span class="kl" data-shrink>ANNULER</span></button>
        ${validateButton(v)}
      </div>
    </div>
    <div class="rcol">
      <div class="bwrap${wait ? ' wait' : ''}" id="tboard">${boardSvg({ size: 400, impacts, label: 'Cible : touchez pour saisir' })}</div>
      <p class="bhint alert" id="bhint" role="status" data-layer hidden></p>
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
    body = `<div class="fx-pad${m > 1 ? ' armed' : ''}">
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
      <div class="sec" style="margin-bottom:0">Réglages rapides</div>
      ${themeControls()}
      <div class="sec" style="margin-bottom:0">Partie</div>
      <a class="btn ghost" href="#/">ACCUEIL <small>la partie reste en cours</small></a>
      ${abandon}
      ${del}
      <p class="note" style="margin:0">Abandonner : la partie reste dans l'historique et compte dans les moyennes. Supprimer (partie d'essai) : elle disparaît complètement.</p>
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
    // Loupe figée (sommaire de maquette) : comme si le doigt était posé en (x, y).
    const svg = wrap.querySelector('svg');
    const r = svg.getBoundingClientRect();
    const scale = r.width / 2 / RINGS.edge;
    showLoupe(ui.loupe.x, ui.loupe.y, r.left + r.width / 2 + ui.loupe.x * scale, r.top + r.height / 2 + ui.loupe.y * scale, scale);
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
  const svg = wrap.querySelector('svg');
  let active = null;
  let geo = null;
  const toBoard = ev => {
    const x = (ev.clientX - geo.cx) / geo.scale, y = (ev.clientY - geo.cy) / geo.scale;
    return { x, y };
  };
  wrap.addEventListener('pointerdown', ev => {
    const g = store.current;
    if (!g || g.ui.pause || g.ui.panel || pendingVisit(currentState(), g.validated)) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    stopAnnounce(true);
    g.ui.loupe = null;
    const r = svg.getBoundingClientRect();
    geo = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, scale: r.width / 2 / RINGS.edge };
    active = ev.pointerId;
    try { wrap.setPointerCapture(ev.pointerId); } catch (e) { /* rien */ }
    const p = toBoard(ev);
    showLoupe(p.x, p.y, ev.clientX, ev.clientY, geo.scale);
  });
  wrap.addEventListener('pointermove', ev => {
    if (ev.pointerId !== active) return;
    const p = toBoard(ev);
    showLoupe(p.x, p.y, ev.clientX, ev.clientY, geo.scale);
  });
  wrap.addEventListener('pointerup', ev => {
    if (ev.pointerId !== active) return;
    active = null;
    const p = toBoard(ev);
    hideLoupe();
    const dart = segmentAt(p.x, p.y);
    if (dart) play(dart, null, [p.x, p.y]);
    else { buzz(BUZZ.undo); hint('HORS CIBLE · RIEN N\'EST COMPTÉ'); }
  });
  const cancel = ev => { if (ev.pointerId === active) { active = null; hideLoupe(); } };
  wrap.addEventListener('pointercancel', cancel);
  wrap.addEventListener('lostpointercapture', cancel);
}

let hintTimer = null;
function hint(text) {
  const el = document.getElementById('bhint');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { el.hidden = true; }, 1500);
}

/** Loupe : zone sous le doigt agrandie ×2,5, en haut à gauche du doigt (la main vient d'en bas). */
function showLoupe(x, y, clientX, clientY, scale) {
  const el = document.getElementById('loupe');
  const box = el && el.parentElement.getBoundingClientRect();
  if (!el) return;
  const w = LENS.size / (scale * LENS.zoom);
  el.querySelector('svg').setAttribute('viewBox', `${((x - w / 2) * K).toFixed(1)} ${((y - w / 2) * K).toFixed(1)} ${(w * K).toFixed(1)} ${(w * K).toFixed(1)}`);
  const dart = segmentAt(x, y);
  const lz = el.querySelector('.lz');
  lz.textContent = dart ? zoneLabel(dart) : 'HORS CIBLE';
  el.classList.toggle('out', !dart);
  el.hidden = false;
  const fx = clientX - box.left, fy = clientY - box.top;
  const h = el.offsetHeight || LENS.size + 52;
  const wd = el.offsetWidth || LENS.size;
  let left = fx - wd - LENS.gap;
  let top = fy - h - LENS.gap;
  if (top < 6) { top = 6; left = fx - wd - LENS.gap * 2.2; } // pas la place au-dessus : franchement à gauche
  left = Math.max(6, left);
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function hideLoupe() {
  const el = document.getElementById('loupe');
  if (el) el.hidden = true;
}

// ------------------------------------------------------------------ saisie
function play(dart, key, pos = null) {
  const g = store.current;
  if (!g) return;
  stopAnnounce();
  const r = throwDart(g.config, g.darts, dart);
  if (!r.ok) { buzz(BUZZ.undo); return; }
  g.darts = r.darts;
  // Position réelle du doigt (paysage), gardée avec la fléchette pour marquer l'impact.
  if (pos) g.darts[g.darts.length - 1] = { segment: dart.segment, multiplier: dart.multiplier, pos: pos.map(c => Math.round(c * 1000) / 1000) };
  g.ui.mult = 1;
  saveCurrent();
  // Retours (lot 3) : son, annonce vocale et célébration ; jamais d'attente (l'annonce part après le rendu).
  const st = r.state;
  const v = st.lastVisit;
  const name = i => playerById(g.config.players[i]).name;
  switch (st.lastEvent) {
    case 'visit_end':
      buzz(BUZZ.dart);
      sound(v.total === 180 ? 'max' : dartSound(dart));
      later(() => say(SPEECH.total(v.total), { strong: v.total === 180 }));
      if (v.total >= 100) celebrate(v.total === 180 ? 'max' : v.total >= 140 ? 'ton40' : 'ton', v.total, v.player);
      break;
    case 'bust': buzz(BUZZ.bust); sound('bust'); later(() => say(SPEECH.bust())); break;
    case 'leg_won':
    case 'match_won':
      buzz(BUZZ.leg);
      sound('finish');
      celebrate(v.startRemaining >= 100 ? 'finish-big' : 'finish', v.startRemaining, v.player);
      later(() => say(st.lastEvent === 'leg_won' ? SPEECH.leg(name(v.player)) : SPEECH.match(name(v.player))));
      go(st.lastEvent === 'leg_won' ? '#/manche' : '#/fin');
      return;
    default: buzz(BUZZ.dart); sound(dartSound(dart));
  }
  refresh();
  flash(key);
}

/** Après le rendu : l'annonce vocale ne passe jamais avant l'écran. */
const later = fn => setTimeout(fn, 0);

// ------------------------------------------------------------------ célébration 100+ / 140+ / 180 / finition (lot 3)
// Bandeau en haut de l'écran, gradué : discret en vidéo inverse pour 100+, plus haut à la couleur du joueur pour 140+,
// la moitié haute de l'écran pour 180 ; un bandeau pour chaque finition (à la couleur du joueur si elle fait 100 ou
// plus). Jamais le rouge (réservé au bust). Il ne capte aucun appui (la saisie continue dessous) et le premier appui le
// ferme. Sans animation si le réglage Animations est sur NON ou si le téléphone demande moins d'animations.
export const CELE_MS = Object.freeze({ ton: 1200, ton40: 1400, max: 1600, finish: 1500, 'finish-big': 1700 });
const CELE_TEXT = { ton: '100 +', ton40: '140 +', max: 'CENT QUATRE-VINGTS', finish: 'FINITION', 'finish-big': 'GROSSE FINITION' };
let celeTimer = null;

export function celebrate(kind, value, player, { frozen = false } = {}) {
  const g = store.current;
  if (!g) return;
  g.ui.cele = { kind, value, player, fresh: true, frozen };
  clearTimeout(celeTimer);
  if (!frozen) celeTimer = setTimeout(endCele, CELE_MS[kind]);
}

function endCele() {
  celeTimer = null;
  const g = store.current;
  if (g) g.ui.cele = null;
  document.querySelector('.cele')?.remove();
}
// Un appui n'importe où ferme le bandeau (sans rien bloquer : l'appui fait aussi ce qu'il devait faire).
window.addEventListener('pointerdown', () => { if (store.current && store.current.ui.cele) { clearTimeout(celeTimer); endCele(); } }, true);

/** Bandeau en cours (jeu, fin de manche, fin de partie), ou ''. */
export function celebrationHtml() {
  const g = store.current;
  const c = g && g.ui.cele;
  if (!c) return '';
  const p = playerById(g.config.players[c.player]);
  const enter = c.fresh && animationsOn() ? ' enter' : '';
  c.fresh = false;
  return `<div class="cele ${c.kind}${enter}" role="status" aria-live="polite" data-layer style="--pc:${colorOf(p)}">
    <small>${CELE_TEXT[c.kind]}</small><b data-shrink>${c.value}</b><span class="nm ell">${esc(p.name)}</span></div>`;
}

/** ANNULER : retire la dernière fléchette (aussi depuis une volée en attente, une fin de manche ou de partie). */
export function undo() {
  const g = store.current;
  if (!g || !g.darts.length) return;
  stopAnnounce();
  g.darts = undoDart(g.config, g.darts).darts;
  g.validated = validatedAfterUndo(g.validated, g.darts.length);
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
  if (!g || g.ui.pause || g.ui.panel) return;
  const ui = g.ui;
  if (k === 'undo') { undo(); refresh(); flash('undo'); return; }
  if (pendingVisit(currentState(), g.validated)) return; // volée en attente : seuls ANNULER et VALIDER
  if (k === 'S' || k === 'D' || k === 'T') {
    const m = { S: 1, D: 2, T: 3 }[k];
    ui.mult = ui.mult === m ? 1 : m;
    stopAnnounce();
    refresh(); flash(k); return;
  }
  if (k === '0') return play(makeDart(0, 1), k);
  if (k === '50') return play(makeDart(25, 2), k);
  if (k === '25') { if (ui.mult === 3) return; return play(makeDart(25, ui.mult === 2 ? 2 : 1), k); }
  const n = Number(k);
  if (n >= 1 && n <= 20) play(makeDart(n, ui.mult), k);
}

export const actions = {
  validate() { validate(); },
  pause() { stopAnnounce(); store.current.ui.pause = true; store.current.ui.confirm = false; refresh(); },
  resume() { store.current.ui.pause = false; store.current.ui.confirm = false; refresh(); },
  'open-board'() { openPanel(); },
  'open-history'() { openPanel(); },
  'close-panel'() { Object.assign(store.current.ui, { panel: null, fix: null }); refresh(); },
  'board-view'(val) { store.current.ui.boardView = val === 'leg' ? 'leg' : 'visit'; refresh(); },
  // Correction d'une fléchette (lot 3, I)
  'fix-dart'(i) { store.current.ui.fix = { index: Number(i), mult: 1, pick: null, result: null }; refresh(); },
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
  abandon() { store.current.ui.confirm = 'abandon'; refresh(); },
  'delete-current'() { store.current.ui.confirm = 'delete'; refresh(); },
  'delete-current-yes'() { stopAnnounce(); deleteCurrent(); go('#/'); },
  'abandon-no'() { store.current.ui.confirm = false; refresh(); },
  'abandon-yes'() { stopAnnounce(); archiveCurrent(true); go('#/'); },
};
