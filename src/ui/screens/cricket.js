// Strela — Cricket (lot 10, choix de Guillaume le 13/11 : A face à face pour 2 joueurs + B grille de 2 à 8).
// Écrans : jeu (#/cricket), fin de partie (#/cricket/fin), détail d'une partie close (#/cricket/partie/<id>).
// Saisie : SIMPLE / DOUBLE / TRIPLE armé puis 20 à 15, BULL ou RATÉ (le multiplicateur revient à simple après chaque
// fléchette, comme en X01) ; après 3 fléchettes, la volée attend VALIDER ; ANNULER retire la dernière fléchette.
// Marques : / (1), ✕ (2), ✕ cerclé (3 : fermé). Règles : engine/cricket.js.
import { store, playerById, ckState, saveCk, archiveCk, deleteCk, startCricket, deleteGames } from '../store.js';
import { esc, ico, topBar, plural, when, maquetteButtons } from '../dom.js';
import { avatarHtml, colorIndex } from '../avatars.js';
import { CRICKET_TARGETS, cricketStandings, cricketSummary, computeCricket } from '../../engine/cricket.js';
import { makeDart } from '../../engine/darts.js';
import { validatedAfterUndo } from '../turn.js';
import { go, refresh, buzz, BUZZ, backFrom } from '../nav.js';
import { sound, dartSound, say } from '../feedback.js';
import { turnFxKind } from '../turnfx.js';

export const CK_MODE_LABEL = Object.freeze({ points: 'AVEC POINTS', sans: 'SANS POINTS', cutthroat: 'CUT-THROAT' });
const colorOf = p => `var(--av-${colorIndex(p.avatar?.color)})`;
const tLabel = t => (t === 25 ? 'BULL' : String(t));
const dec2 = v => (v === null || v === undefined ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ','));

/** Marque dessinée : 1 = /, 2 = ✕, 3 = ✕ cerclé. */
export function markSvg(n) {
  if (!n) return '';
  const path = n === 1 ? '<path d="M8 20L16 4"/>' : n === 2 ? '<path d="M6 6L18 18M18 6L6 18"/>'
    : '<circle cx="12" cy="12" r="9.5"/><path d="M7.5 7.5L16.5 16.5M16.5 7.5L7.5 16.5"/>';
  return `<svg class="mk m${Math.min(n, 3)}" viewBox="0 0 24 24" aria-label="${Math.min(n, 3)} marque${n > 1 ? 's' : ''}">${path}</svg>`;
}

const pre = d => (d.multiplier === 3 ? 'T' : d.multiplier === 2 ? 'D' : '');
const dartText = d => (d.segment === 0 ? 'RATÉ' : d.segment === 25 ? (d.multiplier === 2 ? '50' : 'BULL') : `${pre(d)}${d.segment}`);

/** Volée close qui attend VALIDER (ou une manche gagnée qui attend MANCHE SUIVANTE). */
function pending(s, g) {
  if (!s || s.status !== 'playing') return null;
  if ((s.lastEvent === 'visit_end' || s.lastEvent === 'leg_won') && g.validated !== s.dartCount) return s.lastEvent;
  return null;
}

function view() {
  const g = store.ck;
  const s = ckState();
  const pend = pending(s, g);
  // Le joueur affiché : celui qui vient de lancer tant que sa volée attend VALIDER.
  const shown = pend ? s.lastVisit.player : s.currentPlayer;
  const players = g.config.players.map(playerById);
  const n = players.length;
  const legVisits = s.legs[s.legs.length - 1].visits.length;
  const turn = pend === 'leg_won' ? Math.ceil(s.legs[s.legs.length - 2].visits.length / n) : Math.floor(legVisits / n) + 1;
  const layout = g.ui.layout || (n === 2 ? 'face' : 'grille');
  return { g, s, pend, shown, players, n, turn, layout, mode: g.config.mode,
    darts: pend ? s.lastVisit.darts : s.visit.darts,
    // Marques et points affichés : ceux de la manche qui vient de finir tant que MANCHE SUIVANTE n'est pas touché.
    marks: pend === 'leg_won' ? s.legs[s.legs.length - 2].marks : s.marks,
    scores: pend === 'leg_won' ? s.legs[s.legs.length - 2].scores : s.scores };
}

const closedBy = (marks, t) => marks.filter(m => m[t] >= 3).length;
const dead = (marks, t) => closedBy(marks, t) === marks.length;
const scoreText = (v, p) => (v.mode === 'sans' ? `${CRICKET_TARGETS.filter(t => v.marks[p][t] >= 3).length}<small>/7</small>` : String(v.scores[p]));

function head(v) {
  const p = v.players[v.shown];
  const legs = v.g.config.legsToWin > 1 ? ` · M${v.s.legNumber}` : '';
  return `<header class="ckhead inv" data-layer>
    <span class="t">CRICKET${legs} · TOUR ${v.turn}</span>
    <span class="who" style="--pc:${colorOf(p)}">${v.n > 1 ? `À <b class="nm">${esc(p.name)}</b>` : CK_MODE_LABEL[v.mode]}</span>
    ${store.soiree ? `<a class="act" href="#/soiree" aria-label="Verres de la soirée">${ico('glass')}</a>` : ''}
    <button type="button" class="act" data-act="ck-pause" aria-label="Pause">${ico('pause')}</button>
  </header>`;
}

/** A · face à face (2 joueurs) : points en haut, marques de part et d'autre des numéros. */
function faceBoard(v) {
  const side = p => {
    const pl = v.players[p];
    return `<div class="cks${p === v.shown ? ' on' : ''}" style="--pc:${colorOf(pl)}">${avatarHtml(pl, 30)}<span class="nm ell">${esc(pl.name)}</span><b data-shrink>${scoreText(v, p)}</b></div>`;
  };
  const rows = CRICKET_TARGETS.map(t => `<div class="ckr${dead(v.marks, t) ? ' dead' : ''}">
      <span class="c">${markSvg(v.marks[0][t])}</span><span class="tg">${tLabel(t)}</span><span class="c">${markSvg(v.marks[1][t])}</span></div>`).join('');
  return `<section class="ckface" aria-label="Tableau">
    <div class="ckscore">${side(0)}<span class="mode">${CK_MODE_LABEL[v.mode].replace(' ', '<br>')}</span>${side(1)}</div>
    <div class="ckrows">${rows}</div></section>`;
}

/** B · grille (2 à 8 joueurs) : une colonne par joueur, une ligne par cible ; le lanceur en vidéo inverse. */
function gridBoard(v) {
  const cols = v.players.map((pl, p) => `<div class="ckc${p === v.shown ? ' on' : ''}" style="--pc:${colorOf(pl)}">${avatarHtml(pl, v.n > 5 ? 22 : 28)}<b data-shrink>${scoreText(v, p)}</b></div>`).join('');
  const rows = CRICKET_TARGETS.map(t => `<div class="ckr${dead(v.marks, t) ? ' dead' : ''}"><span class="tg">${tLabel(t)}</span>${v.marks.map((m, p) => `<span class="c${p === v.shown ? ' on' : ''}">${markSvg(m[t])}</span>`).join('')}</div>`).join('');
  return `<section class="ckgrid" style="--n:${v.n}" aria-label="Tableau">
    <div class="ckr hd"><span class="tg"></span>${cols}</div>${rows}</section>`;
}

function visitRow(v) {
  const cells = [0, 1, 2].map(i => {
    const d = v.darts[i];
    return `<div class="ckd${d ? ' done' : ''}${!d && i === v.darts.length && !v.pend ? ' todo' : ''}"><span data-shrink>${d ? dartText(d) : '–'}</span></div>`;
  }).join('');
  return `<div class="ckvisit">${cells}<button type="button" class="ckd undo" data-act="ck-undo" ${v.g.darts.length ? '' : 'disabled'} aria-label="Annuler la dernière fléchette">${ico('undo')}<small>ANNULER</small></button></div>`;
}

function pad(v) {
  const m = v.g.ui.mult;
  const wait = !!v.pend;
  const dis = wait ? 'disabled' : '';
  const pre = m === 3 ? 'T' : m === 2 ? 'D' : '';
  const key = t => `<button type="button" class="ckk" data-act="ck-hit" data-arg="${t}" ${dis || (t === 25 && m === 3 ? 'disabled' : '')}><span data-shrink>${t === 25 ? (m === 2 ? '50' : 'BULL') : `${pre}${t}`}</span></button>`;
  const mk = (val, label) => `<button type="button" class="ckk m" data-act="ck-mult" data-arg="${val}" aria-pressed="${!wait && m === val}" ${dis}>${label}</button>`;
  const over = v.pend === 'visit_end'
    ? `<button type="button" class="validate go over" data-act="ck-validate" data-layer style="--pc:${colorOf(v.players[v.shown])}"><span class="vl" data-shrink>VALIDER</span></button>`
    : v.pend === 'leg_won'
    ? `<div class="cklegwon over" role="status" data-layer><span>MANCHE GAGNÉE PAR <b class="nm">${esc(v.players[v.s.legs[v.s.legs.length - 2].winner].name)}</b></span>
        <button type="button" class="btn primary big" data-act="ck-next-leg">MANCHE SUIVANTE</button></div>` : '';
  return `<section class="ckpad${m > 1 && !wait ? ` armed m${m}` : ''}" aria-label="Saisie">
    <div class="krow">${[20, 19, 18, 17].map(key).join('')}</div>
    <div class="krow">${[16, 15, 25].map(key).join('')}<button type="button" class="ckk zero" data-act="ck-hit" data-arg="0" ${dis}><span data-shrink>RATÉ</span></button></div>
    <div class="krow mult">${mk(1, 'SIMPLE')}${mk(2, 'DOUBLE')}${mk(3, 'TRIPLE')}</div>
    ${over}
  </section>`;
}

function pauseSheet(v) {
  const ui = v.g.ui;
  const abandon = ui.confirm === 'abandon'
    ? `<div class="confirm" data-reveal><p><b>Abandonner la partie ?</b></p><p class="small dim">Elle restera dans l'historique, marquée « abandonnée ».</p>
        <div class="btns two"><button type="button" class="btn" data-act="ck-abandon-no">NON</button><button type="button" class="btn alert" data-act="ck-abandon-yes">ABANDONNER</button></div></div>`
    : '<button type="button" class="btn danger" data-act="ck-abandon">ABANDONNER LA PARTIE</button>';
  const del = ui.confirm === 'delete'
    ? `<div class="confirm" role="alert" data-reveal><p class="alert-h">SUPPRIMER LA PARTIE ?</p><p class="small">Elle disparaît complètement : ni historique, ni stats.</p>
        <div class="btns two"><button type="button" class="btn" data-act="ck-abandon-no">NON</button><button type="button" class="btn alert" data-act="ck-delete-yes">SUPPRIMER</button></div></div>`
    : '<button type="button" class="btn danger" data-act="ck-delete">SUPPRIMER LA PARTIE</button>';
  const seg = (val, label) => `<button type="button" data-act="ck-layout" data-arg="${val}" aria-pressed="${v.layout === val}">${label}</button>`;
  return `<div class="sheet-bg" role="dialog" aria-label="Pause" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>Pause</span></h1>${store.maquette ? `<a class="act mq" href="#/sommaire" aria-label="Sommaire de maquette">${ico('menu')}</a>` : ''}<button type="button" class="act" data-act="ck-resume" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body" style="padding-top:16px">
      <button type="button" class="btn primary big" data-act="ck-resume">${ico('play')} REPRENDRE</button>
      ${v.n === 2 ? `<div class="sec" style="margin-bottom:0">Présentation</div><div class="seg">${seg('face', 'Face à face')}${seg('grille', 'Grille')}</div>` : ''}
      <div class="sec" style="margin-bottom:0">Règles · ${CK_MODE_LABEL[v.mode].toLowerCase()}</div>
      <p class="note" style="margin:0">${rulesText(v.mode)}</p>
      <div class="sec" style="margin-bottom:0">Partie</div>
      <a class="btn ghost" href="#/">ACCUEIL <small>la partie reste en cours</small></a>
      ${abandon}
      ${del}
    </div></div></div>`;
}

export function rulesText(mode) {
  const base = 'Cibles : 20 à 15 et le bull (25 = 1 marque, 50 = 2). Simple = 1 marque, double = 2, triple = 3 ; 3 marques ferment la cible.';
  if (mode === 'sans') return `${base} Pas de points : le premier qui ferme tout gagne.`;
  if (mode === 'cutthroat') return `${base} Au-delà de 3 marques, la valeur va à chaque adversaire qui n'a pas fermé la cible ; gagne celui qui a tout fermé avec le moins de points.`;
  return `${base} Au-delà de 3 marques, vous marquez la valeur tant qu'un adversaire ne l'a pas fermée ; gagne celui qui a tout fermé avec au moins autant de points.`;
}

export function cricketScreen() {
  if (!store.ck) { go('#/', { replace: true }); return ''; }
  const v = view();
  if (v.s.status === 'finished') { go('#/cricket/fin', { replace: true }); return ''; }
  return `<div class="game ckgame ${v.layout}">
    ${head(v)}
    ${v.layout === 'face' ? faceBoard(v) : gridBoard(v)}
    ${visitRow(v)}
    ${pad(v)}
    ${v.g.ui.pause ? pauseSheet(v) : ''}
  </div>`;
}

/** Animation de tour (lot 7.9) au début d'une volée de Cricket : celle du joueur qui lance, sinon null (app.js). */
export function cricketTurnFx() {
  const g = store.ck;
  if (!g || g.ui.pause) return null;
  const s = ckState();
  if (s.status !== 'playing' || pending(s, g) || s.visit.darts.length) return null;
  const p = playerById(g.config.players[s.currentPlayer]);
  const kind = turnFxKind(p);
  if (kind === 'aucune' || kind === 'voyelles') return null;
  return { key: `${g.id}:${s.visits.length}`, kind, color: colorOf(p), fromSel: '#app .cks.on .av, #app .ckc.on .av', say: (t, o) => say(t, o), sound: k => sound(k) };
}

// ------------------------------------------------------------------ fin de partie et détail
function standingsTable(g, s) {
  const order = cricketStandings(s);
  const legs = g.config.legsToWin > 1;
  const rows = order.map((p, i) => {
    const pl = playerById(g.config.players[p]);
    const sum = cricketSummary(s, p);
    return `<tr${p === s.winner ? ' class="win"' : ''}><td><div class="pl"><b class="plc">${i + 1}</b>${avatarHtml(pl, 26)}<span class="nm ell">${esc(pl.name)}</span></div></td>
      ${legs ? `<td>${s.legsWon[p]}</td>` : ''}${g.config.mode === 'sans' ? '' : `<td>${s.scores[p]}</td>`}<td>${dec2(sum.mpr)}</td><td>${sum.best}</td></tr>`;
  }).join('');
  return `<table class="score-table rank-table ck-table"><thead><tr><th>Place · joueur</th>${legs ? '<th>Man.</th>' : ''}${g.config.mode === 'sans' ? '' : '<th>Pts</th>'}<th>MPR</th><th>Meil.</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">${legs ? 'Man. = manches gagnées · ' : ''}${g.config.mode === 'sans' ? '' : 'Pts = points de la dernière manche · '}MPR = marques par volée de 3 fléchettes · Meil. = meilleure volée, en marques.</p>`;
}

/** Tableau final (marques de la dernière manche) en grille, pour la fin de partie et le détail. */
function finalBoard(g, s) {
  const players = g.config.players.map(playerById);
  const leg = s.legs[s.legs.length - 1];
  const marks = leg.marks || s.marks;
  const rows = CRICKET_TARGETS.map(t => `<div class="ckr${dead(marks, t) ? ' dead' : ''}"><span class="tg">${tLabel(t)}</span>${marks.map(m => `<span class="c">${markSvg(m[t])}</span>`).join('')}</div>`).join('');
  const cols = players.map((pl, p) => `<div class="ckc${p === s.winner ? ' on' : ''}">${avatarHtml(pl, 24)}</div>`).join('');
  return `<section class="ckgrid small" style="--n:${players.length}" aria-label="Tableau final"><div class="ckr hd"><span class="tg"></span>${cols}</div>${rows}</section>`;
}

export function cricketEnd() {
  const g = store.ck;
  if (!g) { go('#/', { replace: true }); return ''; }
  const s = ckState();
  if (s.status !== 'finished') { go('#/cricket', { replace: true }); return ''; }
  const p = playerById(g.config.players[s.winner]);
  const legsTxt = g.config.legsToWin > 1 ? `${s.legsWon[s.winner]} MANCHES À ${Math.max(0, ...s.legsWon.filter((_, i) => i !== s.winner))}` : '';
  const next = playerById(g.config.players[1 % g.config.players.length]);
  return `<div class="screen has-dock">
    <div class="inv" style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
      <b class="caps" style="letter-spacing:.12em">Cricket terminé</b><span class="small b">${CK_MODE_LABEL[g.config.mode]}</span></div>
    <div class="result-head">${avatarHtml(p, 88)}<div style="min-width:0"><span class="t dim">VAINQUEUR</span><span class="nm">${esc(p.name)}</span>
      ${legsTxt ? `<span class="small b">${legsTxt}</span>` : ''}</div></div>
    <div class="pad">
      <div class="sec" style="margin-top:6px">Classement</div>
      ${standingsTable(g, s)}
      <div class="sec">Tableau final</div>
      ${finalBoard(g, s)}
      <button type="button" class="btn ghost" style="margin-top:14px" data-act="ck-undo-end">ANNULER LA DERNIÈRE FLÉCHETTE</button>
      ${store.maquette ? `<div class="mq-row">${maquetteButtons('mq')}</div>` : ''}
    </div>
    <div class="dock btns" data-layer>
      <button type="button" class="btn primary big" data-act="ck-rematch">REVANCHE <small>${g.config.players.length < 2 ? 'MÊMES RÉGLAGES' : g.shuffled ? 'ORDRE TIRÉ AU SORT' : `${esc(next.name).toUpperCase()} COMMENCE`}</small></button>
      <button type="button" class="btn" data-act="ck-home">ACCUEIL</button>
    </div>
  </div>`;
}

/** Détail d'une partie de Cricket close (historique) : classement, tableau final, volées. */
export function cricketDetail(id) {
  const g = store.ckGames.find(x => x.id === id);
  if (!g) return `<div class="screen">${topBar('Cricket', backFrom('#/historique'))}<div class="empty"><div class="big">PARTIE INTROUVABLE</div></div></div>`;
  const s = computeCricket(g.config, g.darts);
  const ui = detailUi;
  const vis = s.visits.map(x => {
    const pl = playerById(g.config.players[x.player]);
    return `<li><span class="nm ell">${esc(pl.name)}</span><span class="ds">${x.darts.map(dartText).join(' · ')}</span><b>${x.marks}</b></li>`;
  }).join('');
  const confirm = ui.del === id
    ? `<div class="confirm" role="alert" data-reveal><p class="alert-h">SUPPRIMER LA PARTIE ?</p><p class="small">Elle disparaît de l'historique et des stats. Les joueurs restent.</p>
        <div class="btns two"><button type="button" class="btn" data-act="ckd-del-no">NON</button><button type="button" class="btn alert" data-act="ckd-del-yes" data-arg="${esc(id)}">SUPPRIMER</button></div></div>`
    : `<button type="button" class="btn danger" data-act="ckd-del" data-arg="${esc(id)}">${ico('trash')} SUPPRIMER LA PARTIE</button>`;
  return `<div class="screen">${topBar('Cricket', backFrom('#/historique'))}
    <div class="pad">
      <p class="small dim" style="margin:12px 0 0">${when(g.startedAt)} · ${CK_MODE_LABEL[g.config.mode]}${g.config.legsToWin > 1 ? ` · ${g.config.legsToWin} MANCHES` : ''}${g.abandoned ? ' · ABANDONNÉE' : ''}</p>
      <div class="sec">Classement</div>
      ${standingsTable(g, s)}
      <div class="sec">Tableau final</div>
      ${finalBoard(g, s)}
      <div class="sec">Volées <span class="n">${s.visits.length}</span></div>
      <ul class="ckvis">${vis}</ul>
      <p class="note">Chiffre à droite : marques de la volée (celles qui ferment et celles qui rapportent des points).</p>
      ${confirm}
    </div></div>`;
}
const detailUi = { del: null };

// ------------------------------------------------------------------ actions
function hit(seg) {
  const g = store.ck;
  if (!g || g.ui.pause) return;
  const s = ckState();
  if (pending(s, g) || s.status !== 'playing') return;
  const m = g.ui.mult;
  const dart = seg === 0 ? makeDart(0, 1) : seg === 25 ? (m === 3 ? null : makeDart(25, m === 2 ? 2 : 1)) : makeDart(seg, m);
  if (!dart) return;
  g.darts = [...g.darts, dart];
  g.ui.mult = 1;
  saveCk();
  const after = ckState();
  buzz(BUZZ.dart);
  sound(dartSound(dart));
  if (after.status === 'finished') {
    sound('finish');
    say(`Partie, ${playerById(g.config.players[after.winner]).name} !`);
    go('#/cricket/fin');
    return;
  }
  if (after.lastEvent === 'leg_won') { sound('finish'); say(`Manche, ${playerById(g.config.players[after.legs[after.legs.length - 2].winner]).name} !`); }
  refresh();
}

function undoCk() {
  const g = store.ck;
  if (!g || !g.darts.length) return;
  g.darts = g.darts.slice(0, -1);
  g.validated = validatedAfterUndo(g.validated, g.darts.length);
  g.ui.mult = 1;
  saveCk();
  buzz(BUZZ.undo);
  sound('undo');
}

export const actions = {
  'ck-hit'(arg) { hit(Number(arg)); },
  'ck-mult'(arg) { const g = store.ck; if (!g) return; const m = Number(arg); g.ui.mult = g.ui.mult === m ? 1 : m; refresh(); },
  'ck-undo'() { undoCk(); refresh(); },
  'ck-validate'() {
    const g = store.ck;
    if (!g) return;
    const s = ckState();
    if (pending(s, g) !== 'visit_end') return;
    g.validated = s.dartCount;
    saveCk();
    buzz(BUZZ.dart); sound('validate');
    refresh();
  },
  'ck-next-leg'() {
    const g = store.ck;
    if (!g) return;
    const s = ckState();
    if (pending(s, g) !== 'leg_won') return;
    g.validated = s.dartCount;
    saveCk();
    refresh();
  },
  'ck-pause'() { if (store.ck) { store.ck.ui.pause = true; store.ck.ui.confirm = false; refresh(); } },
  'ck-resume'() { if (store.ck) { store.ck.ui.pause = false; store.ck.ui.confirm = false; refresh(); } },
  'ck-layout'(val) { if (store.ck) { store.ck.ui.layout = val === 'grille' ? 'grille' : 'face'; refresh(); } },
  'ck-abandon'() { store.ck.ui.confirm = 'abandon'; refresh(); },
  'ck-delete'() { store.ck.ui.confirm = 'delete'; refresh(); },
  'ck-abandon-no'() { store.ck.ui.confirm = false; refresh(); },
  'ck-abandon-yes'() { archiveCk(true); go('#/'); },
  'ck-delete-yes'() { deleteCk(); go('#/'); },
  'ck-undo-end'() { undoCk(); go('#/cricket', { replace: true }); },
  'ck-home'() { archiveCk(false); go('#/'); },
  'ck-rematch'() {
    const g = store.ck;
    if (!g) { go('#/', { replace: true }); return; }
    const c = g.config;
    const shuffled = !!g.shuffled;
    const players = shuffled ? [...c.players] : [...c.players.slice(1), c.players[0]];
    const layout = g.ui.layout;
    archiveCk(false);
    startCricket({ players, ckMode: c.mode, legsToWin: c.legsToWin, shuffle: shuffled });
    store.ck.ui.layout = layout;
    go('#/cricket', { replace: true });
  },
  'ckd-del'(id) { detailUi.del = id; refresh(); },
  'ckd-del-no'() { detailUi.del = null; refresh(); },
  'ckd-del-yes'(id) { detailUi.del = null; deleteGames([id]); go(backFrom('#/historique')); },
};

/** Ligne d'une partie de Cricket dans l'historique et à l'accueil : { title, line }. */
export function cricketRowText(g) {
  let s = null;
  try { s = computeCricket(g.config, g.darts); } catch (e) { /* illisible */ }
  const names = g.config.players.map(id => playerById(id).name);
  const win = s && s.status === 'finished' && !g.abandoned ? playerById(g.config.players[s.winner]).name : null;
  return { title: `CRICKET · ${CK_MODE_LABEL[g.config.mode]}`, win, names, players: plural(names.length, 'joueur', 'joueurs') };
}
