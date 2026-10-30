// Jeu (portrait) : branché sur le vrai moteur X01, en mémoire.
// Haut, lisible de loin : bandeau du joueur actif en vidéo inverse, reste en très grand, 3 cases de fléchettes,
// total, finition proposée, autres joueurs (le suivant repéré). Bas, pour taper : S / D / T, 1 à 20,
// 25 · 50 · 0 · ANNULER. Bust : bandeau rouge 1,5 s + vibration longue. Volée finie : ~1 s puis joueur suivant.
import { store, currentState, playerById, archiveCurrent } from '../store.js';
import { esc, ico, avg, OUT_SHORT } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { throwDart, undoDart } from '../../engine/x01.js';
import { makeDart, formatDart } from '../../engine/darts.js';
import { suggestCheckout } from '../../engine/checkout.js';
import { playerSummary } from '../../engine/stats.js';
import { go, refresh, buzz, BUZZ } from '../nav.js';
import { themeControls } from './settings.js';

export const HOLD_MS = { visit: 1000, bust: 1500 };
let holdTimer = null;

const dartLabel = d => {
  const f = formatDart(d);
  return f === '0' ? '0' : f.replace(/^S/, '');
};

function clearHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
  if (store.current) store.current.ui.hold = null;
}

function setHold(kind, visit) {
  const ui = store.current.ui;
  ui.hold = { kind, visit };
  if (ui.frozen) return; // état figé du sommaire de maquette
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    holdTimer = null;
    if (store.current) store.current.ui.hold = null;
    if (location.hash === '#/jeu') refresh();
  }, HOLD_MS[kind]);
}

/** Retour visuel : la touche appuyée passe en inverse un court instant (même après redessin). */
function flash(key) {
  const el = document.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  el.classList.add('hit');
  setTimeout(() => el.classList.remove('hit'), 140);
}

export function game() {
  const g = store.current;
  if (!g) { go('#/', { replace: true }); return ''; }
  const s = currentState();
  if (s.status === 'finished') { go('#/fin', { replace: true }); return ''; }
  const ui = g.ui;
  const cfg = g.config;
  const n = cfg.players.length;
  const hold = ui.hold;
  const shown = hold ? hold.visit.player : s.currentPlayer;
  const player = playerById(cfg.players[shown]);
  const remaining = hold ? hold.visit.remainingAfter : s.remaining[shown];
  const darts = hold ? hold.visit.darts : s.visit.darts;
  const total = hold ? hold.visit.total : s.visit.total;
  const bust = hold && hold.kind === 'bust';
  const next = hold ? s.currentPlayer : (s.currentPlayer + 1) % n;
  const legAvg = playerSummary(s, shown, s.legNumber).average;

  // Bandeau du joueur actif
  const legs = cfg.legsToWin > 1
    ? Array.from({ length: cfg.legsToWin }, (_, i) => `<i class="${i < s.legsWon[shown] ? 'on' : ''}"></i>`).join('')
    : '';
  const band = `<header class="gband inv">
      ${avatarHtml(player, 46)}
      <div class="who"><span class="nm">${esc(player.name)}</span>
        <span class="legs">MANCHE ${s.legNumber}${legs ? ` · GAGNÉES ${legs}` : ''}</span></div>
      <button type="button" class="pause" data-act="pause" aria-label="Pause">${ico('pause')}</button>
    </header>`;

  // Reste
  const rest = bust
    ? `<section class="rest alert" role="alert" aria-label="Bust">
      <div class="meta"><span>${esc(player.name)}</span><span>AUCUN POINT</span></div>
      <b class="bust-word">BUST</b><span class="bust-rest">RESTE ${remaining}</span><span id="remaining" hidden>${remaining}</span>
    </section>`
    : `<section class="rest" aria-label="Reste à faire">
      <div class="meta"><span>${cfg.startScore} · ${OUT_SHORT[cfg.outMode]}</span><span>MOY. ${avg(legAvg)}</span></div>
      <div class="big" id="remaining">${remaining}</div>
    </section>`;

  // Volée : 3 cases + total
  const boxes = [0, 1, 2].map(i => {
    const d = darts[i];
    if (d) return `<div class="dart ${bust && i === darts.length - 1 ? 'bust' : 'done'}">${dartLabel(d)}</div>`;
    if (!hold && i === darts.length) return '<div class="dart todo" aria-label="Fléchette à jouer"></div>';
    return '<div class="dart"></div>';
  }).join('');
  const totalBox = `<div class="total ${darts.length ? 'inv' : 'zero'}"><small>${hold && !bust ? 'VOLÉE' : 'TOTAL'}</small><span>${bust ? 0 : total}</span></div>`;

  // Finition proposée (ou annonce du joueur suivant pendant la pause de fin de volée)
  let co = '<div class="co"></div>';
  if (hold && !bust && n > 1) {
    co = `<div class="co turn"><small>À TOI</small><span class="nm ell">${esc(playerById(cfg.players[next]).name)}</span></div>`;
  } else if (!hold) {
    const route = suggestCheckout(remaining, cfg.outMode, 4 - s.dartNumber);
    if (route) co = `<div class="co"><small>FINITION</small><span class="route">${route.map(d => `<span>${dartLabel(d)}</span>`).join('')}</span></div>`;
  }

  // Autres joueurs, dans l'ordre de passage à partir du suivant
  let others = '';
  if (n > 1) {
    const order = [];
    for (let k = 1; k < n; k++) order.push((shown + k) % n);
    others = `<section class="others${n > 4 ? ' many' : ''}" aria-label="Autres joueurs">${order.map(i => {
      const p = playerById(cfg.players[i]);
      return `<div class="op${i === next ? ' next' + (n > 4 ? ' inv' : '') : ''}">${avatarHtml(p, n > 4 ? 26 : 34)}
        <div class="col"><span class="nm ell">${i === next ? 'SUIVANT · ' : ''}${esc(p.name)}</span><span class="r">${s.remaining[i]}</span></div></div>`;
    }).join('')}</section>`;
  }

  // Pavé
  const m = ui.mult;
  const pre = m === 2 ? '<sup>D</sup>' : m === 3 ? '<sup>T</sup>' : '';
  const nums = [];
  for (let r = 0; r < 4; r++) {
    nums.push(`<div class="krow nums">${[1, 2, 3, 4, 5].map(c => {
      const v = r * 5 + c;
      return `<button type="button" class="key" data-key="${v}">${pre}${v}</button>`;
    }).join('')}</div>`);
  }
  const mk = (k, label, word) => `<button type="button" class="key m" data-key="${k}" aria-pressed="${m === { S: 1, D: 2, T: 3 }[k]}">${label}<small>${word}</small></button>`;
  const pad = `<section class="pad-k${m > 1 ? ' armed' : ''}" aria-label="Saisie">
      <div class="krow mult">${mk('S', 'S', 'SIMPLE')}${mk('D', 'D', 'DOUBLE')}${mk('T', 'T', 'TRIPLE')}</div>
      ${nums.join('')}
      <div class="krow last">
        <button type="button" class="key bull" data-key="25" ${m === 3 ? 'disabled' : ''}>${m === 2 ? '<sup>D</sup>' : ''}25</button>
        <button type="button" class="key" data-key="50">50</button>
        <button type="button" class="key zero" data-key="0">0<small>RATÉ</small></button>
        <button type="button" class="key undo" data-key="undo" ${g.darts.length ? '' : 'disabled'}>${ico('undo')}ANNULER</button>
      </div>
    </section>`;

  return `<div class="game">
    ${band}${rest}
    <div style="position:relative;flex:0 0 auto;display:flex;flex-direction:column;gap:4px">
      <div class="visit">${boxes}${totalBox}</div>${co}
    </div>
    ${others}${pad}
    ${ui.pause ? pauseSheet() : ''}
  </div>`;
}

function pauseSheet() {
  const ui = store.current.ui;
  const abandon = ui.confirm
    ? `<div class="confirm"><p><b>Abandonner la partie ?</b></p><p class="small dim">Elle restera dans l'historique, marquée « abandonnée ».</p>
        <div class="btns two"><button type="button" class="btn" data-act="abandon-no">NON</button><button type="button" class="btn alert" data-act="abandon-yes">ABANDONNER</button></div></div>`
    : '<button type="button" class="btn danger" data-act="abandon">ABANDONNER LA PARTIE</button>';
  return `<div class="sheet-bg" role="dialog" aria-label="Pause"><div class="sheet">
    <header class="top"><h1><span>Pause</span></h1>${store.maquette ? '<a class="act mq" href="#/sommaire" aria-label="Sommaire de maquette">' + ico('menu') + '</a>' : ''}<button type="button" class="act" data-act="resume" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body" style="padding-top:16px">
      <button type="button" class="btn primary big" data-act="resume">${ico('play')} REPRENDRE</button>
      <div class="sec" style="margin-bottom:0">Réglages rapides</div>
      ${themeControls()}
      <div class="sec" style="margin-bottom:0">Partie</div>
      <a class="btn ghost" href="#/">ACCUEIL <small>la partie reste en cours</small></a>
      ${abandon}
    </div></div></div>`;
}

// ------------------------------------------------------------------ saisie
function play(dart, key) {
  const g = store.current;
  if (!g) return;
  clearHold();
  g.ui.frozen = false;
  const r = throwDart(g.config, g.darts, dart);
  if (!r.ok) { buzz(BUZZ.undo); return; }
  g.darts = r.darts;
  g.ui.mult = 1;
  const s = r.state;
  switch (s.lastEvent) {
    case 'visit_end': buzz(BUZZ.dart); setHold('visit', s.lastVisit); break;
    case 'bust': buzz(BUZZ.bust); setHold('bust', s.lastVisit); break;
    case 'leg_won': buzz(BUZZ.leg); go('#/manche'); return;
    case 'match_won': buzz(BUZZ.leg); go('#/fin'); return;
    default: buzz(BUZZ.dart);
  }
  refresh();
  flash(key);
}

export function undo() {
  const g = store.current;
  if (!g || !g.darts.length) return;
  clearHold();
  g.ui.frozen = false;
  g.darts = undoDart(g.config, g.darts).darts;
  g.ui.mult = 1;
  buzz(BUZZ.undo);
}

/** Touche du pavé (appelée au pointerdown, pour une saisie sans délai). */
export function key(k) {
  const g = store.current;
  if (!g || g.ui.pause) return;
  const ui = g.ui;
  if (k === 'S' || k === 'D' || k === 'T') {
    const m = { S: 1, D: 2, T: 3 }[k];
    ui.mult = ui.mult === m ? 1 : m;
    refresh(); flash(k); return;
  }
  if (k === 'undo') { undo(); refresh(); flash('undo'); return; }
  if (k === '0') return play(makeDart(0, 1), k);
  if (k === '50') return play(makeDart(25, 2), k);
  if (k === '25') { if (ui.mult === 3) return; return play(makeDart(25, ui.mult === 2 ? 2 : 1), k); }
  const v = Number(k);
  if (v >= 1 && v <= 20) play(makeDart(v, ui.mult), k);
}

export const actions = {
  pause() { clearHold(); store.current.ui.pause = true; store.current.ui.confirm = false; refresh(); },
  resume() { store.current.ui.pause = false; store.current.ui.confirm = false; refresh(); },
  abandon() { store.current.ui.confirm = true; refresh(); },
  'abandon-no'() { store.current.ui.confirm = false; refresh(); },
  'abandon-yes'() { archiveCurrent(true); go('#/'); },
};

export { clearHold };
