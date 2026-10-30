// Jeu : branché sur le vrai moteur X01, en mémoire. Deux mises en page, même état (la rotation ne perd rien) :
// - portrait : bandeau du joueur actif (aplat de la couleur de son avatar), reste en très grand, 3 cases + total
//   et finition à côté d'une petite cible (impacts), autres joueurs (le suivant repéré), pavé S / D / T, 1 à 20,
//   25 · 50 · 0 · ANNULER ;
// - paysage : à gauche le même tableau de bord et RATÉ · ANNULER · VALIDER, à droite la cible, où l'on saisit au
//   doigt (loupe ×2,5 décalée, nom de la zone en gros, on glisse pour ajuster, on lâche pour compter ; un lâcher
//   hors de la cible ne compte rien).
// Après la 3e fléchette ou un bust, la volée reste affichée jusqu'à VALIDER (turn.js) ; ANNULER reste possible.
// À la validation, « À TOI, PSEUDO » occupe le haut de l'écran ~0,8 s, puis le bandeau du joueur glisse en place.
import { store, currentState, playerById, archiveCurrent, animationsOn } from '../store.js';
import { esc, ico, avg, OUT_SHORT, maquetteButtons } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { throwDart, undoDart } from '../../engine/x01.js';
import { makeDart, formatDart } from '../../engine/darts.js';
import { suggestCheckout } from '../../engine/checkout.js';
import { playerSummary } from '../../engine/stats.js';
import { segmentAt, zoneLabel, RINGS } from '../../engine/board.js';
import { boardSvg, plainBoard, impactsFor, markIcon } from '../board.js';
import { rollHtml } from '../roll.js';
import { pendingVisit, validatedAfterUndo } from '../turn.js';
import { go, refresh, buzz, BUZZ } from '../nav.js';
import { themeControls } from './settings.js';
import { gameLog } from './history.js';

export const ANNOUNCE_MS = 800;
const LENS = { size: 150, zoom: 2.5, gap: 26 };
const K = 100; // échelle du dessin de la cible (board.js)

let announceTimer = null;

export const isLandscape = () => { try { return matchMedia('(orientation: landscape)').matches; } catch (e) { return false; } };

const dartLabel = d => {
  const f = formatDart(d);
  return f === '0' ? '0' : f.replace(/^S/, '');
};
const colorOf = p => `var(--av-${Number.isInteger(p.avatar?.color) ? ((p.avatar.color % 8) + 8) % 8 : 7})`;

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
      <button type="button" class="pause" data-act="pause" aria-label="Pause">${ico('pause')}</button>
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

function visitBoxes(v) {
  const { darts, pend, bust } = v;
  const boxes = [0, 1, 2].map(i => {
    const d = darts[i];
    if (d) return `<div class="dart ${bust && i === darts.length - 1 ? 'bust' : 'done'}"><span data-shrink>${dartLabel(d)}</span></div>`;
    if (!pend && i === darts.length) return '<div class="dart todo" aria-label="Fléchette à jouer"></div>';
    return '<div class="dart"></div>';
  }).join('');
  return `<div class="visit">${boxes}<div class="total ${darts.length ? 'inv' : 'zero'}"><small>${pend && !bust ? 'VOLÉE' : 'TOTAL'}</small><span class="tv" data-shrink>${rollHtml(`t:${v.totalKey}`, v.total)}</span></div></div>`;
}

function checkoutLine(v) {
  const { pend, n, cfg, s, remaining } = v;
  if (pend) {
    return n > 1
      ? `<div class="co turn"><small>SUIVANT</small><span class="nm ell">${esc(playerById(cfg.players[v.next]).name)}</span></div>`
      : '<div class="co turn"><small>VOLÉE SUIVANTE</small></div>';
  }
  const route = suggestCheckout(remaining, cfg.outMode, 4 - s.dartNumber);
  if (route) return `<div class="co" data-shrink><small>FINITION</small><span class="route">${route.map(d => `<span>${dartLabel(d)}</span>`).join('')}</span></div>`;
  return '<div class="co"></div>';
}

function others(v) {
  const { n, cfg, s, shown, next } = v;
  if (n < 2) return '';
  const many = n > 4;
  const order = [];
  for (let k = 1; k < n; k++) order.push((shown + k) % n);
  return `<section class="others${many ? ' many' : ''}" aria-label="Autres joueurs">${order.map(i => {
    const p = playerById(cfg.players[i]);
    const isNext = i === next;
    return `<div class="op${isNext ? ' next' : ''}" style="--pc:${colorOf(p)}">${avatarHtml(p, many ? 20 : 34)}
      <div class="col"><span class="l1"><span class="nm ell">${esc(p.name)}</span>${isNext ? '<span class="tag-next">SUIVANT</span>' : ''}</span><span class="r">${rollHtml(`o:${s.legNumber}:${i}`, s.remaining[i])}</span></div></div>`;
  }).join('')}</section>`;
}

// VALIDER : le joueur suivant y est nommé en gros, avec le carré de sa couleur (c'est lui qui s'avance).
function validateButton(v, cls = '') {
  const np = playerById(v.cfg.players[v.next]);
  const label = v.n > 1 ? `<span class="vnext" style="--pc:${colorOf(np)}"><i></i>À <span class="nm">${esc(np.name)}</span></span>` : '<span class="vnext">VOLÉE SUIVANTE</span>';
  return `<button type="button" class="validate ${cls}" data-act="validate"${cls.includes('over') ? ' data-layer' : ' data-shrink'} ${v.pend ? '' : 'disabled'}>VALIDER${v.pend ? label : '<small>après 3 fléchettes</small>'}</button>`;
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
  return `<button type="button" class="mini-board" data-act="open-board" aria-label="Agrandir la cible">${boardSvg({ size: 104, impacts, label: 'Impacts de la volée' })}</button>`;
}

// ------------------------------------------------------------------ écran
export function game() {
  const g = store.current;
  if (!g) { go('#/', { replace: true }); return ''; }
  const s = currentState();
  if (s.status === 'finished') { go('#/fin', { replace: true }); return ''; }
  const v = view();
  const slide = v.ui.slide;
  v.ui.slide = false; // le glissement ne se joue qu'une fois
  const land = isLandscape();
  const overlays = `${v.ui.panel === 'board' ? boardSheet(v) : ''}${v.ui.panel === 'history' ? historySheet(v) : ''}${v.ui.pause ? pauseSheet() : ''}`;
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
    ${overlays}
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
    ${overlays}
  </div>`;
}

// Cible agrandie : bascule VOLÉE (volée en cours seule) / MANCHE (avec ses volées précédentes de la manche).
function boardSheet(v) {
  const leg = v.ui.boardView === 'leg';
  const impacts = impactsFor(v.g, v.s, v.visitIdx, { previous: leg });
  const b = (val, label) => `<button type="button" data-act="board-view" data-arg="${val}" aria-pressed="${(val === 'leg') === leg}">${label}</button>`;
  const empty = !v.darts.length ? '<br>Aucune fléchette dans cette volée pour l\'instant.' : '';
  return `<div class="sheet-bg" role="dialog" aria-label="Cible" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>Cible · <span class="nm">${esc(v.player.name)}</span></span></h1>${store.maquette ? maquetteButtons() : ''}<button type="button" class="act" data-act="close-panel" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body" style="padding-top:12px">
      <div class="seg" role="group" aria-label="Impacts montrés">${b('visit', 'Volée')}${b('leg', 'Manche')}</div>
      <button type="button" class="big-board" data-act="close-panel" aria-label="Fermer la cible">${boardSvg({ size: 380, impacts, label: 'Impacts' })}</button>
      <p class="note legend-marks">${markIcon(true)}volée ${v.pend ? 'jouée' : 'en cours'}, numérotée${leg ? `<br>${markIcon(false)}volées précédentes de la manche` : ''}${empty}<br>Une fléchette saisie au pavé est placée au centre de son segment ; le 0 n'est pas marqué.</p>
      <button type="button" class="btn ghost" data-act="open-history">${ico('history')} HISTORIQUE DE LA PARTIE</button>
    </div></div></div>`;
}

function historySheet(v) {
  return `<div class="sheet-bg" role="dialog" aria-label="Historique de la partie en cours" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>Partie en cours</span></h1>${store.maquette ? maquetteButtons() : ''}<button type="button" class="act" data-act="close-panel" aria-label="Fermer">${ico('close')}</button></header>
    ${gameLog(v.g, v.s, { live: true })}
    <div class="pad" style="margin-top:18px"><button type="button" class="btn primary" data-act="close-panel">${ico('play')} RETOUR À LA PARTIE</button></div>
  </div></div>`;
}

function pauseSheet() {
  const ui = store.current.ui;
  const abandon = ui.confirm
    ? `<div class="confirm"><p><b>Abandonner la partie ?</b></p><p class="small dim">Elle restera dans l'historique, marquée « abandonnée ».</p>
        <div class="btns two"><button type="button" class="btn" data-act="abandon-no">NON</button><button type="button" class="btn alert" data-act="abandon-yes">ABANDONNER</button></div></div>`
    : '<button type="button" class="btn danger" data-act="abandon">ABANDONNER LA PARTIE</button>';
  return `<div class="sheet-bg" role="dialog" aria-label="Pause" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>Pause</span></h1>${store.maquette ? '<a class="act mq" href="#/sommaire" aria-label="Sommaire de maquette">' + ico('menu') + '</a>' : ''}<button type="button" class="act" data-act="resume" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body" style="padding-top:16px">
      <button type="button" class="btn primary big" data-act="resume">${ico('play')} REPRENDRE</button>
      <button type="button" class="btn" data-act="open-history">${ico('history')} HISTORIQUE DE LA PARTIE</button>
      <div class="sec" style="margin-bottom:0">Réglages rapides</div>
      ${themeControls()}
      <div class="sec" style="margin-bottom:0">Partie</div>
      <a class="btn ghost" href="#/">ACCUEIL <small>la partie reste en cours</small></a>
      ${abandon}
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
  switch (r.state.lastEvent) {
    case 'visit_end': buzz(BUZZ.dart); break;
    case 'bust': buzz(BUZZ.bust); break;
    case 'leg_won': buzz(BUZZ.leg); go('#/manche'); return;
    case 'match_won': buzz(BUZZ.leg); go('#/fin'); return;
    default: buzz(BUZZ.dart);
  }
  refresh();
  flash(key);
}

/** ANNULER : retire la dernière fléchette (aussi depuis une volée en attente, une fin de manche ou de partie). */
export function undo() {
  const g = store.current;
  if (!g || !g.darts.length) return;
  stopAnnounce();
  g.darts = undoDart(g.config, g.darts).darts;
  g.validated = validatedAfterUndo(g.validated, g.darts.length);
  g.ui.mult = 1;
  buzz(BUZZ.undo);
}

/** VALIDER : la volée en attente est acquise, au joueur suivant (annonce « À TOI »). */
export function validate() {
  const g = store.current;
  if (!g) return;
  const s = currentState();
  if (!pendingVisit(s, g.validated)) return;
  g.validated = s.dartCount;
  g.ui.mult = 1;
  if (g.config.players.length > 1) { g.ui.announce = s.currentPlayer; g.ui.frozen = false; }
  buzz(BUZZ.dart);
  refresh();
}

/** Touche du pavé (appelée au pointerdown, pour une saisie sans délai). */
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
  'open-board'() { stopAnnounce(); store.current.ui.panel = 'board'; refresh(); },
  'open-history'() { stopAnnounce(); Object.assign(store.current.ui, { panel: 'history', pause: false, confirm: false }); refresh(); },
  'close-panel'() { store.current.ui.panel = null; refresh(); },
  'board-view'(val) { store.current.ui.boardView = val === 'leg' ? 'leg' : 'visit'; refresh(); },
  abandon() { store.current.ui.confirm = true; refresh(); },
  'abandon-no'() { store.current.ui.confirm = false; refresh(); },
  'abandon-yes'() { stopAnnounce(); archiveCurrent(true); go('#/'); },
};
