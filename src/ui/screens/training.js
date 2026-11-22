// Strela — entraînement solo (lot 8, docs/entrainement.md). Écrans :
//   #/entrainement            choix : joueur, jeu de fléchettes, COACHÉ (exercice proposé, niveau) ou LIBRE (cible et
//                             nombre de fléchettes), dernières séances, raccourcis (stats, conseils, armurerie)
//   #/entrainement/jeu        saisie : comme en partie — pavé en portrait (avec SIMPLE INTÉRIEUR / EXTÉRIEUR), cible
//                             au doigt en paysage (loupe) ; HORS CIBLE saisissable ; ANNULER
//   #/entrainement/fin        séance finie (pas encore enregistrée) : analyse, TERMINER, ENCORE UNE SÉRIE (libre)
//   #/entrainement/seance/<id> détail d'une séance close : analyse, et sa gestion (0.13.0) : note, refaire, reprendre
//                             (arrêtée), joueur, jeu de fléchettes de chaque partie de la séance, mettre de côté, supprimer
// Moteur : engine/training.js (exercices, analyse, coach) ; données : store.js (section « entraînement solo »).
import { store, activePlayers, playerById, trState, startTraining, trThrow, trUndo, trAddBlock, closeTraining, deleteTrainings, trainingById, dartSetById, saveTrSetup,
  trChangeSet, updateTraining, resumeTraining } from '../store.js';
import { esc, ico, topBar, plural, when } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { EXERCISES, analyze, suggestNext, nextFor, levelOf, LEVELS, LEVEL_EXERCISES, ALL_EXERCISES, exerciseLevel, goalOf, goalMet, setRuns, setAt, setsUsed, trainingDartLabel, targetLabel, zoneLabelOf, ZONES_FOR, ZONE_LABEL, BULL_ZONE_LABEL,
  isHit, sessionValue, cleanTarget, aimPoint, appPoint, pointsOf, trainingState } from '../../engine/training.js';
import { dartSetSummary } from '../../engine/dartsets.js';
import { dartDiagram } from './advice.js';
import { makeDart } from '../../engine/darts.js';
import { segmentAt, RINGS } from '../../engine/board.js';
import { boardSvg, plainBoard, svgN } from '../board.js';
import { go, refresh, buzz, BUZZ, backFrom } from '../nav.js';
import { sound, dartSound } from '../feedback.js';
import { bindBoardInput, boardHint, frozenLoupe } from '../boardinput.js';
import { isLandscape } from './game.js';
import { infoBtn, infoBox } from '../info.js';

const dec1 = v => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const pctOf = v => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);
const cmOf = mm => (mm === null || mm === undefined ? '—' : `${dec1(mm / 10)} cm`);
/** Valeur affichée d'un chiffre de séance (sessionValue). */
export const fmtValue = sv => (!sv ? '—' : sv.fmt === 'pct' ? pctOf(sv.v) : sv.fmt === 'avg' ? dec1(sv.v) : String(Math.round(sv.v)));

// ------------------------------------------------------------------ choix (derniers choix gardés : réglage « training »)
/** Choix effectifs de l'écran Entraînement (joueur actif, jeu non archivé, cible libre valide). */
export function trSetup() {
  const s = store.trSetup || {};
  const players = activePlayers();
  const player = players.find(p => p.id === s.player) ? s.player : (players[0] ? players[0].id : null);
  const set = store.dartSets.find(x => x.id === s.setId && !x.archived);
  const free = cleanTarget(s.free) || { s: 20, z: 'any' };
  return { player, setId: set ? set.id : null, mode: s.mode === 'libre' ? 'libre' : 'coach', free: { ...free, n: Math.max(1, Math.min(99, Number(s.free && s.free.n) || 9)) } };
}

// Sommaire et tests : choix préparés sans base.
let addDraft = null; // libre : série ajoutée en fin de séance { s, z, n }
export function presetTraining({ add = null, others = false } = {}) { addDraft = add; othersOpen = others; }

function playersChips(su) {
  const players = activePlayers();
  if (players.length < 2) return '';
  return `<div class="sec">Joueur</div><div class="chips">${players.map(p => `<button type="button" class="btn chip" data-act="tr-player" data-arg="${esc(p.id)}" aria-pressed="${p.id === su.player}">${avatarHtml(p, 38)}<span class="nm">${esc(p.name.split(' ')[0])}</span></button>`).join('')}</div>`;
}

/** Choix d'un jeu de fléchettes (avec son dessin) : `act` = commande, `cur` = jeu choisi ('' : sans jeu). */
export function setCards(act, cur, { withNone = true } = {}) {
  const sets = store.dartSets.filter(x => !x.archived || x.id === cur);
  const card = (id, x) => `<button type="button" class="setc" data-act="${act}" data-arg="${esc(id)}" aria-pressed="${(cur || '') === id}">
    <span class="setd" aria-hidden="true">${x ? dartDiagram({ shape: x.shape, flight: x.flight, colors: x.colors, mini: true }) : ''}</span>
    <b class="ell">${esc(x ? x.name : 'Sans jeu noté')}</b>${x ? `<small>${esc(dartSetSummary(x)) || 'à compléter dans l\'armurerie'}</small>` : '<small>la séance ne compte pour aucun jeu</small>'}</button>`;
  return `<div class="setcards">${sets.map(x => card(x.id, x)).join('')}${withNone ? card('', null) : ''}</div>`;
}

function setChips(su) {
  return `<div class="sec">Jeu de fléchettes${infoBtn('tr-set')}</div>
    ${infoBox('tr-set', 'Le jeu utilisé est noté avec la séance : les stats d\'entraînement se comparent d\'un jeu à l\'autre. En pleine séance, le menu pause permet d\'en changer (les fléchettes suivantes sont notées avec le nouveau jeu). Les jeux, leurs pièces et leurs couleurs se règlent dans l\'armurerie.')}
    ${setCards('tr-set', su.setId || '')}
    <a class="btn ghost small-btn" href="#/armurerie">${ico('wrench')} ARMURERIE</a>`;
}
/** Noms des jeux d'une séance : « 22 g torpedo », « 22 g torpedo puis 22 g fût droit », « sans jeu noté ». */
export function setsText(r) {
  const names = setRuns(r).filter((x, i) => i === 0 || x.from < r.darts.length).map(x => (x.setId ? (dartSetById(x.setId) || { name: '?' }).name : 'sans jeu noté'));
  return names.join(' puis ');
}

/** Sélecteur de cible (libre) : secteur, zone, nombre de fléchettes. `who` : 'setup' (écran de choix) ou 'add' (série en plus). */
export function targetPicker(t, who) {
  const nums = [];
  for (let i = 1; i <= 20; i++) nums.push(i);
  nums.push(25);
  const cell = n => `<button type="button" class="tpk" data-act="tr-pick" data-arg="${who}|s|${n}" aria-pressed="${t.s === n}">${n === 25 ? 'BULL' : n}</button>`;
  const zones = ZONES_FOR(t.s).map(z => `<button type="button" class="chip2" data-act="tr-pick" data-arg="${who}|z|${z}" aria-pressed="${t.z === z}">${esc((t.s === 25 ? BULL_ZONE_LABEL : ZONE_LABEL)[z])}</button>`).join('');
  const preset = [3, 9, 15, 30].map(n => `<button type="button" class="chip2" data-act="tr-pick" data-arg="${who}|n|${n}" aria-pressed="${t.n === n}">${n}</button>`).join('');
  return `<div class="tpick">
      <span class="small dim caps">Secteur</span><div class="tpk-grid">${nums.map(cell).join('')}</div>
      <span class="small dim caps">Zone</span><div class="chips2">${zones}</div>
      <span class="small dim caps">Fléchettes</span>
      <div class="tpk-n"><button type="button" class="btn" data-act="tr-pick" data-arg="${who}|n|${Math.max(1, t.n - 1)}" aria-label="Une de moins" ${t.n <= 1 ? 'disabled' : ''}>${ico('minus')}</button><b>${t.n}</b><button type="button" class="btn" data-act="tr-pick" data-arg="${who}|n|${Math.min(99, t.n + 1)}" aria-label="Une de plus" ${t.n >= 99 ? 'disabled' : ''}>${ico('plus')}</button></div>
      <div class="chips2">${preset}</div>
    </div>`;
}

/** Objectif affiché : « 50 % », « 60 fl. au plus », « 30 de moyenne », « 9 doubles ». */
export function goalText(key, level) {
  const g = goalOf(key, level);
  if (!g) return '';
  const ex = EXERCISES[key];
  if (ex.clock && ex.clock.max) return `${g.v} doubles sur 20`;
  if (ex.clock) return `${g.v} fl. au plus`;
  if (ex.metric === 'average') return `${g.v} de moyenne`;
  return pctOf(g.v);
}

function levelCard(pid) {
  const lv = levelOf(allSessions(), pid);
  const crit = lv.criteria.map(c => `<li class="${c.met ? 'met' : ''}"><span class="ell">${esc(EXERCISES[c.exercise].name)} · ${esc(goalText(c.exercise, lv.level))}</span>
    <span class="lvs" aria-label="${c.met ? 'tenu' : `${c.streak} séance${c.streak > 1 ? 's' : ''} sur ${c.need}`}">${Array.from({ length: c.need }, (_, i) => `<i class="${c.met || i < c.streak ? 'on' : ''}"></i>`).join('')}</span></li>`).join('');
  const info = lv.next
    ? `Pour passer au niveau ${esc(LEVELS[lv.next].toLowerCase())} : tenir l'objectif de ton niveau sur ${lv.criteria[0].need} séances complètes de suite, pour chacun de ces exercices (une séance sous l'objectif remet son compte à zéro ; un exercice tenu une fois reste tenu). Les objectifs sont ceux d'un joueur amateur de ce niveau ; chaque exercice affiche le sien.`
    : 'Dernier niveau atteint : les objectifs affichés sont ceux d\'un joueur confirmé. Continue les exercices pour les tenir sur la durée.';
  return `<div class="lvl"><span class="lvt"><small>NIVEAU</small><b>${LEVELS[lv.level]}</b></span>${infoBtn('tr-level')}</div>
    ${infoBox('tr-level', info)}
    ${crit ? `<ul class="lvc"><li class="lvh">POUR PASSER ${LEVELS[lv.next]}</li>${crit}</ul>` : ''}`;
}

/** Séances closes et en cours. */
const allSessions = () => [...store.trainings, ...(store.tr ? [store.tr] : [])];
const lastOf = (pid, key) => store.trainings.find(r => r.player === pid && r.exercise === key && !r.stopped && !r.excluded);

function exerciseRows(pid, proposed, keys, level) {
  return `<ul class="exl">${keys.map(k => {
    const ex = EXERCISES[k];
    const last = lastOf(pid, k);
    const sv = last ? sessionValue(last) : null;
    const ok = last ? goalMet(last, analyze(last), level) : null;
    const goal = goalText(k, level);
    const info = infoBox(`tr-ex-${k}`, esc(ex.goal) + (goal ? ` <b>Objectif</b> (niveau ${esc(LEVELS[level].toLowerCase())}) : ${esc(goal)}.` : ''));
    return `<li class="${k === proposed ? 'on' : ''}"><button type="button" class="exr" data-act="tr-start" data-arg="${k}">
      <span class="t"><b>${esc(ex.name)}</b><small>${esc(ex.short)}${goal ? ` · obj. ${esc(goal)}` : ''}</small></span>
      <span class="v">${sv ? `<small>DERNIÈRE</small><b>${fmtValue(sv)}${ok ? ' ✓' : ''}</b>` : '<small>JAMAIS</small>'}</span>${ico('play')}</button>
      ${infoBtn(`tr-ex-${k}`)}</li>${info ? `<li class="exi">${info}</li>` : ''}`;
  }).join('')}</ul>`;
}

let othersOpen = false; // exercices des autres niveaux, repliés

function sessionRow(r) {
  const ex = EXERCISES[r.exercise] || EXERCISES.libre;
  const sv = sessionValue(r);
  const what = r.exercise === 'libre' ? libreLabel(r) : ex.name;
  return `<li><a class="trow${r.excluded ? ' excl' : ''}" href="#/entrainement/seance/${esc(r.id)}"><span class="l1"><b class="ell">${esc(what)}</b><span>${when(r.startedAt)}</span></span>
    <span class="l2"><span class="ell">${esc(sessionFlags(r))}</span><b>${fmtValue(sv)}</b></span></a></li>`;
}
/** Deuxième ligne d'une séance dans une liste : jeux, arrêtée, mise de côté, note. */
export const sessionFlags = r => [setsText(r), r.stopped ? 'arrêtée' : '', r.excluded ? 'mise de côté' : '', r.note ? '✎ note' : ''].filter(Boolean).join(' · ');
/** Libre : « T20 ×9 · 19 ×9 ». */
export const libreLabel = r => (r.blocks || []).map(b => `${targetLabel(b)} ×${b.n}`).join(' · ') || 'Libre';

export function trainingHub() {
  const su = trSetup();
  if (!su.player) {
    return `<div class="screen">${topBar('Entraînement', backFrom('#/'))}<div class="empty"><div class="big">AUCUN JOUEUR</div>
      <p>L'entraînement se note au nom d'un joueur : crée d'abord le tien.</p><a class="btn primary" href="#/joueur/nouveau">${ico('plus')} NOUVEAU JOUEUR</a></div></div>`;
  }
  const p = playerById(su.player);
  const st = store.tr ? trState() : null;
  const resume = store.tr
    ? `<a class="btn accent big resume tr-resume" href="${st.done ? '#/entrainement/fin' : '#/entrainement/jeu'}">${ico('play')} ${st.done ? 'SÉANCE FINIE : VOIR' : 'REPRENDRE LA SÉANCE'}<small>${esc(sessionTitle(store.tr))} · ${plural(store.tr.darts.length, 'fléchette', 'fléchettes')}</small></a>`
    : '';
  const mode = `<div class="seg trmode"><button type="button" data-act="tr-mode" data-arg="coach" aria-pressed="${su.mode === 'coach'}">Coaché</button><button type="button" data-act="tr-mode" data-arg="libre" aria-pressed="${su.mode === 'libre'}">Libre</button></div>`;
  let body;
  if (su.mode === 'coach') {
    const level = levelOf(allSessions(), su.player).level;
    const next = suggestNext(allSessions(), su.player, level);
    const ex = EXERCISES[next.key];
    const mineKeys = LEVEL_EXERCISES[level];
    const others = ALL_EXERCISES.filter(k => k !== 'libre' && !mineKeys.includes(k));
    body = `${levelCard(su.player)}
      <div class="propose"><small>EXERCICE PROPOSÉ</small><b>${esc(ex.name)}</b><span>${esc(ex.short)} · ${esc(next.why)}</span></div>
      <button type="button" class="btn ${resume ? 'accent-line' : 'accent'} big" data-act="tr-start" data-arg="${next.key}">${ico('target')} COMMENCER</button>
      <div class="sec">Exercices · niveau ${esc(LEVELS[level].toLowerCase())}${infoBtn('tr-exs')}</div>
      ${infoBox('tr-exs', 'Le coach propose un exercice d\'après la dernière séance (un écart à corriger, un objectif tenu), sinon un exercice de ton niveau pas encore fait, ou le moins récent. Touchez un autre exercice pour le lancer ; (i) donne son but et son objectif ; ✓ : la dernière séance tient l\'objectif.')}
      ${exerciseRows(su.player, next.key, mineKeys, level)}
      <button type="button" class="fold" data-act="tr-fold" aria-expanded="${othersOpen}"><span>${level === 'debutant' ? 'Exercices du niveau intermédiaire' : 'Exercices du niveau débutant'}</span><span class="n">${others.length}</span>${ico(othersOpen ? 'up' : 'down')}</button>
      ${othersOpen ? exerciseRows(su.player, next.key, others, level) : ''}`;
  } else {
    const t = su.free;
    body = `<div class="sec">Cible${infoBtn('tr-free')}</div>
      ${infoBox('tr-free', 'Choisis le secteur, la zone et le nombre de fléchettes. Pendant la séance, l\'appli compare la cible visée et les impacts : précision, et vers où partent les fléchettes. À la fin, ENCORE UNE SÉRIE ajoute une autre cible à la même séance.')}
      ${targetPicker(t, 'setup')}
      <button type="button" class="btn ${resume ? 'accent-line' : 'accent'} big" data-act="tr-start" data-arg="libre">${ico('target')} VISER ${esc(targetLabel(t))} · ${t.n} FL.</button>`;
  }
  const mine = store.trainings.filter(r => r.player === su.player);
  const tiles = [
    ['#/entrainement/stats', 'stats', 'Stats', mine.length ? plural(mine.length, 'séance', 'séances') : 'aucune séance'],
    ['#/conseils', 'info', 'Conseils', '4 fiches'],
    ['#/armurerie', 'wrench', 'Armurerie', plural(store.dartSets.filter(x => !x.archived).length, 'jeu', 'jeux')],
  ];
  return `<div class="screen trhub">${topBar('Entraînement', backFrom('#/'))}
    <div class="pad">${resume}
      ${playersChips(su)}
      ${activePlayers().length < 2 ? `<div class="who2" style="margin-top:14px">${avatarHtml(p, 44)}<div><b class="nm">${esc(p.name)}</b><span>${plural(mine.length, 'séance', 'séances')}</span></div></div>` : ''}
      ${setChips(su)}
      <div class="sec">Mode${infoBtn('tr-mode')}</div>
      ${infoBox('tr-mode', '<b>Coaché</b> : l\'appli propose un exercice, analyse tes fléchettes et propose corrections, conseils et exercice suivant. <b>Libre</b> : tu fixes tes cibles (secteur, zone, nombre de fléchettes) ; l\'appli montre les écarts.')}
      ${mode}${body}
      <nav class="tiles2 trtiles" aria-label="Entraînement">${tiles.map(([h, i, l, s]) => `<a class="tile2" href="${h}">${ico(i)}<b data-shrink>${l}</b><span data-shrink>${s}</span></a>`).join('')}</nav>
      ${mine.length ? `<div class="sec">Dernières séances <span class="n">${mine.length}</span></div><ul class="trl">${mine.slice(0, 8).map(sessionRow).join('')}</ul>
        ${mine.length > 8 ? '<a class="btn ghost" href="#/entrainement/stats">TOUTES LES SÉANCES DANS LES STATS</a>' : ''}` : ''}
    </div></div>`;
}

export const sessionTitle = r => (r.exercise === 'libre' ? `Libre · ${libreLabel(r)}` : (EXERCISES[r.exercise] || EXERCISES.libre).name);

function startFrom(key) {
  const su = trSetup();
  if (!su.player) return;
  const setup = { player: su.player, setId: su.setId, mode: key === 'libre' ? 'libre' : 'coach', exercise: key };
  if (key === 'libre') setup.blocks = [{ s: su.free.s, z: su.free.z, n: su.free.n }];
  startTraining(setup);
  sound('validate');
  buzz(BUZZ.dart);
  go('#/entrainement/jeu');
}

// ------------------------------------------------------------------ saisie
const tr = () => store.tr;
/** Zone armée par défaut : celle de la cible visée (simple extérieur, double, triple), sinon simple intérieur. */
const defaultZone = st => (st && st.cur && st.cur.s !== 25 ? ({ se: 'out', d: 'd', t: 't' }[st.cur.z] || 'in') : 'in');

/** Fléchettes de la volée affichée : celle en cours, ou la précédente (estompée) tant que la suivante n'a pas commencé. */
function shownVisit(r, st) {
  if (st.visitDarts || !r.darts.length) return { darts: r.darts.slice(st.visitStart, st.visitStart + st.visitDarts), start: st.visitStart, prev: false };
  const start = Math.max(0, r.darts.length - 3);
  // La volée précédente commence au début de sa série si la série en avait moins de 3.
  const b = st.blocks.find(x => r.darts.length - 1 >= x.start && r.darts.length - 1 < x.start + x.darts.length) || st.blocks[st.blocks.length - 1];
  const s0 = b ? Math.max(start, b.start + Math.floor((r.darts.length - 1 - b.start) / 3) * 3) : start;
  return { darts: r.darts.slice(s0), start: s0, prev: true };
}

/** Cible d'une fléchette de la séance (rang dans r.darts). */
function targetAt(st, i) {
  for (const b of st.blocks) if (i >= b.start && i < b.start + b.darts.length) return b;
  return st.cur ? st.blocks[st.cur.i] : null;
}

function aimHead(r, st) {
  const ex = EXERCISES[r.exercise] || EXERCISES.libre;
  const cur = st.cur;
  const t = cur ? st.blocks[cur.i] : st.blocks[st.blocks.length - 1];
  const nb = st.blocks.length;
  let prog;
  if (st.clock && st.clockMax) prog = `<b>${cur ? cur.k + 1 : st.clockMax}<small>/${st.clockMax}</small></b><span>DOUBLE ${cur ? cur.s : 20}/20<br>${st.blocks.filter(b => b.hits).length} TOUCHÉ${st.blocks.filter(b => b.hits).length > 1 ? 'S' : ''}</span>`;
  else if (st.clock) prog = `<b>${st.blocks.filter(b => b.hits).length}<small>/20</small></b><span>FAITS · ${r.darts.length} FL.${cur && cur.k ? `<br>${cur.k} SUR LE ${cur.s}` : ''}</span>`;
  else prog = `<b>${cur ? cur.k + 1 : t.n}<small>/${t.n}</small></b><span>${nb > 1 ? `SÉRIE ${cur ? cur.i + 1 : nb}/${nb}` : 'FLÉCHETTE'}</span>`;
  return `<section class="taim" aria-label="Cible visée"><div class="tl"><small>VISE</small><b class="tg" data-shrink>${esc(targetLabel(t))}</b><span class="zl ell">${esc(zoneLabelOf(t))}</span></div>
    <div class="tp">${prog}</div></section>`;
}

function liveLine(r, st) {
  const ex = EXERCISES[r.exercise] || EXERCISES.libre;
  if (st.clock) {
    const hits = st.blocks.filter(b => b.hits).length;
    if (st.clockMax) return `<p class="tlive">${r.darts.length ? `${plural(hits, 'DOUBLE TOUCHÉ', 'DOUBLES TOUCHÉS')} · ${r.darts.length} FL.` : `${st.clockMax} FLÉCHETTES AU PLUS PAR DOUBLE`}</p>`;
    return `<p class="tlive">${hits ? `${plural(hits, 'NUMÉRO', 'NUMÉROS')} EN ${r.darts.length} FL.` : 'TOUTE ZONE DU SECTEUR COMPTE'}</p>`;
  }
  if (ex.metric === 'average') {
    const v = []; for (let i = 0; i + 3 <= r.darts.length; i += 3) v.push(r.darts.slice(i, i + 3).reduce((n, d) => n + pointsOf(d), 0));
    return `<p class="tlive">${v.length ? `${plural(v.length, 'VOLÉE', 'VOLÉES')} · MOY. ${dec1(v.reduce((a, b) => a + b, 0) / v.length)}` : 'POINTS DE CHAQUE VOLÉE'}</p>`;
  }
  const hits = st.blocks.reduce((n, b) => n + b.hits, 0);
  const n = r.darts.length;
  return `<p class="tlive">${n ? `DANS LA CIBLE <b>${hits}/${n}</b> · ${pctOf(hits / n)}` : 'DANS LA CIBLE : —'}</p>`;
}

function visitBoxes(r, st) {
  const v = shownVisit(r, st);
  const ex = EXERCISES[r.exercise] || EXERCISES.libre;
  const boxes = [0, 1, 2].map(i => {
    const d = v.darts[i];
    if (!d) return `<div class="dart left${!v.prev && i === v.darts.length ? ' todo' : ''}"></div>`;
    const t = targetAt(st, v.start + i);
    const hit = t && isHit(t, d);
    return `<div class="dart done${hit ? ' hit' : ' miss'}"><span class="sv" data-shrink>${esc(trainingDartLabel(d))}</span></div>`;
  }).join('');
  const total = ex.metric === 'average' ? v.darts.reduce((n, d) => n + pointsOf(d), 0)
    : `${v.darts.filter((d, i) => { const t = targetAt(st, v.start + i); return t && isHit(t, d); }).length}<small>/${v.darts.length || 0}</small>`;
  return `<div class="visit${v.prev ? ' prev' : ''}">${boxes}<div class="total ${v.darts.length ? 'inv' : 'zero'}"><small>${ex.metric === 'average' ? 'VOLÉE' : 'DEDANS'}</small><span class="tv" data-shrink>${total}</span></div></div>`;
}

/** Impacts de la série en cours (volée en cours numérotée, le reste de la série en discret). */
function blockImpacts(r, st) {
  const v = shownVisit(r, st);
  const b = st.cur ? st.blocks[st.cur.i] : st.blocks[st.blocks.length - 1];
  const out = [];
  if (b) for (let i = b.start; i < v.start; i++) if (r.darts[i]) out.push({ dart: r.darts[i], old: true });
  v.darts.forEach((d, i) => out.push({ dart: d, n: i + 1 }));
  return out;
}

function pauseSheet(r) {
  const ui = r.ui;
  const curSet = setAt(r, r.darts.length);
  const curSetObj = curSet ? dartSetById(curSet) : null;
  if (ui.confirm === 'set') {
    return `<div class="sheet-bg" role="dialog" aria-label="Changer de jeu" data-layer><div class="sheet">
      <header class="top" data-layer><h1><span>Changer de jeu</span></h1><button type="button" class="act" data-act="tr-confirm-no" aria-label="Retour">${ico('close')}</button></header>
      <div class="body" style="padding-top:12px">
        <p class="note" style="margin-top:0">${r.darts.length ? `Les ${plural(r.darts.length, 'fléchette', 'fléchettes').replace(/^1 fléchette$/, 'la fléchette')} déjà ${r.darts.length > 1 ? 'lancées restent notées' : 'lancée reste notée'} avec leur jeu ; les suivantes le seront avec celui-ci.` : 'Aucune fléchette lancée : c\'est le jeu de toute la séance qui change.'}</p>
        ${setCards('tr-set-now', curSet || '')}
        <button type="button" class="btn" data-act="tr-confirm-no">RETOUR</button>
      </div></div></div>`;
  }
  const del = ui.confirm === 'delete'
    ? `<div class="confirm" role="alert" data-reveal><p class="alert-h">SUPPRIMER LA SÉANCE ?</p><p class="small">Elle disparaît complètement, avec ses fléchettes.</p>
        <div class="btns two"><button type="button" class="btn" data-act="tr-confirm-no">NON</button><button type="button" class="btn alert" data-act="tr-delete-yes">SUPPRIMER</button></div></div>`
    : '<button type="button" class="btn danger" data-act="tr-delete">SUPPRIMER LA SÉANCE</button>';
  return `<div class="sheet-bg" role="dialog" aria-label="Pause" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>Pause</span></h1>${store.maquette ? `<a class="act mq" href="#/sommaire" aria-label="Sommaire de maquette">${ico('menu')}</a>` : ''}<button type="button" class="act" data-act="tr-resume" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body" style="padding-top:16px">
      <button type="button" class="btn primary big" data-act="tr-resume">${ico('play')} REPRENDRE</button>
      <button type="button" class="btn trsetbtn" data-act="tr-change-set"><span class="setd" aria-hidden="true">${curSetObj ? dartDiagram({ shape: curSetObj.shape, flight: curSetObj.flight, colors: curSetObj.colors, mini: true }) : ''}</span><span class="ell">CHANGER DE JEU<small>${esc(curSetObj ? curSetObj.name : 'sans jeu noté')}</small></span></button>
      <button type="button" class="btn" data-act="tr-stop">${ico('stats')} ARRÊTER ET VOIR L'ANALYSE</button>
      <a class="btn ghost" href="#/conseils">${ico('info')} CONSEILS</a>
      <a class="btn ghost" href="#/entrainement">ENTRAÎNEMENT <small>la séance reste en cours</small></a>
      ${del}
      <p class="note" style="margin:0">Arrêter : la séance est enregistrée telle quelle (« arrêtée ») ; elle compte dans les stats, pas dans le niveau.</p>
    </div></div></div>`;
}

function keyPad(r, st) {
  const z = r.ui.zone || defaultZone(st);
  const mult = z === 'd' ? 2 : z === 't' ? 3 : 1;
  const pre = z === 'd' ? '<sup>D</sup>' : z === 't' ? '<sup>T</sup>' : '';
  // Simple intérieur (par défaut) : touches nues ; extérieur armé : « EXT » sous chaque nombre et un trait en bas.
  const suf = z === 'out' ? '<sub>EXT</sub>' : '';
  const nums = [];
  for (let row = 0; row < 4; row++) {
    nums.push(`<div class="krow nums">${[1, 2, 3, 4, 5].map(c => {
      const k = row * 5 + c;
      return `<button type="button" class="key" data-act="tr-key" data-arg="${k}" data-press><span class="kl" data-shrink>${pre}${k}${suf}</span></button>`;
    }).join('')}</div>`);
  }
  const mk = (k, label, word) => `<button type="button" class="key m" data-act="tr-zone" data-arg="${k}" data-press aria-pressed="${z === k}"><span class="kl" data-shrink>${label}<small>${word}</small></span></button>`;
  return `<section class="pad-k trpad${mult > 1 ? ` armed m${mult}` : ` ring-${z}`}" aria-label="Saisie">
      <div class="krow mult four">${mk('in', 'S', 'INT.')}${mk('out', 'S', 'EXT.')}${mk('d', 'D', 'DOUBLE')}${mk('t', 'T', 'TRIPLE')}</div>
      ${nums.join('')}
      <div class="krow last">
        <button type="button" class="key bull" data-act="tr-key" data-arg="25" data-press ${mult === 3 && r.ui.zone === 't' ? 'disabled' : ''}><span class="kl" data-shrink>${r.ui.zone === 'd' ? '<sup>D</sup>' : ''}25</span></button>
        <button type="button" class="key" data-act="tr-key" data-arg="50" data-press><span class="kl" data-shrink>50</span></button>
        <button type="button" class="key zero" data-act="tr-key" data-arg="0" data-press>0<small>HORS CIBLE</small></button>
        <button type="button" class="key undo" data-act="tr-undo" data-press ${r.darts.length || (r.blocks && r.blocks.length > 1) ? '' : 'disabled'}>${ico('undo')}<span class="kl" data-shrink>ANNULER</span></button>
      </div>
    </section>`;
}

function band(r) {
  return `<header class="tband" data-layer><span class="t ell">ENTRAÎNEMENT · ${esc(r.exercise === 'libre' ? 'LIBRE' : EXERCISES[r.exercise].name.toUpperCase())}</span>
    <button type="button" class="pause" data-act="tr-pause" data-press aria-label="Pause">${ico('pause')}</button></header>`;
}

export function trainingScreen() {
  const r = tr();
  if (!r) { go('#/entrainement', { replace: true }); return ''; }
  const st = trState();
  if (st.done) { go('#/entrainement/fin', { replace: true }); return ''; }
  const t = st.blocks[st.cur.i];
  const overlays = r.ui.pause ? pauseSheet(r) : '';
  if (isLandscape()) {
    return `<div class="game land train">
      <div class="lcol">${band(r)}${aimHead(r, st)}${visitBoxes(r, st)}${liveLine(r, st)}
        <div class="lbtns two">
          <button type="button" class="key zero" data-act="tr-key" data-arg="0" data-press>0<small>HORS CIBLE</small></button>
          <button type="button" class="key undo" data-act="tr-undo" data-press ${r.darts.length || (r.blocks && r.blocks.length > 1) ? '' : 'disabled'}>${ico('undo')}<span class="kl" data-shrink>ANNULER</span></button>
        </div>
      </div>
      <div class="rcol">
        <div class="bwrap" id="tboard">${boardSvg({ size: 400, impacts: blockImpacts(r, st), aim: t, label: 'Cible : touchez pour saisir' })}</div>
        <p class="bhint alert" id="bhint" role="status" data-layer hidden></p>
      </div>
      <div class="loupe" id="loupe" data-layer hidden><b class="lz"></b><div class="lens">${plainBoard()}<i class="cross"></i></div></div>
      ${overlays}</div>`;
  }
  return `<div class="game port train">
    <div class="toparea">${band(r)}${aimHead(r, st)}</div>
    <div class="vblock"><div class="vcol">${visitBoxes(r, st)}${liveLine(r, st)}</div>
      <div class="mini-board" aria-hidden="true">${boardSvg({ size: 104, impacts: blockImpacts(r, st), aim: t, label: 'Impacts de la série' })}</div></div>
    ${keyPad(r, st)}${overlays}</div>`;
}

/** Fléchette saisie (pavé ou cible). */
function play(dart) {
  const r = tr();
  if (!r || r.ui.pause) return;
  if (!trThrow(dart)) { buzz(BUZZ.undo); return; }
  r.ui.zone = null;
  r.ui.loupe = null;
  const st = trState();
  buzz(BUZZ.dart);
  if (st.done) { sound('finish'); go('#/entrainement/fin'); return; }
  sound(dartSound(dart));
  refresh();
}

/** Appelé par app.js après le rendu de l'écran de saisie : cible au doigt (paysage). */
export function mountTraining() {
  const r = tr();
  const wrap = document.getElementById('tboard');
  if (!r || !wrap) return;
  const label = (x, y) => { const d = segmentAt(x, y); return d ? trainingDartLabel(withRing(d, [x, y])) : Math.hypot(x, y) <= RINGS.edge ? 'HORS CIBLE' : 'RIEN'; };
  bindBoardInput(wrap, {
    canStart: () => !!tr() && !tr().ui.pause,
    onStart: () => { tr().ui.loupe = null; },
    label,
    onRelease: (x, y) => {
      const d = segmentAt(x, y);
      const pos = [x, y].map(c => Math.round(c * 1000) / 1000);
      if (d) play({ ...withRing(d, pos), pos });
      else if (Math.hypot(x, y) <= RINGS.edge) play({ segment: 0, multiplier: 1, pos });
      else { buzz(BUZZ.undo); boardHint('EN DEHORS DU DESSIN · RIEN N\'EST COMPTÉ'); }
    },
  });
  if (r.ui.loupe) frozenLoupe(wrap, r.ui.loupe, label);
}
/** Un simple pris sur la cible porte son anneau (intérieur / extérieur). */
const withRing = (d, [x, y]) => (d.multiplier === 1 && d.segment >= 1 && d.segment <= 20
  ? { segment: d.segment, multiplier: 1, ring: Math.hypot(x, y) < RINGS.tripleIn ? 'in' : 'out' } : { segment: d.segment, multiplier: d.multiplier });

// ------------------------------------------------------------------ analyse (fin de séance, détail)
/** Cible d'un groupe d'impacts, avec l'écart moyen dessiné : point visé (croix) → centre des impacts (carré). */
function analysisBoard(t, darts, bias, size = 220, label = '') {
  let extra = '';
  if (bias) {
    const a = aimPoint(t);
    const pa = appPoint(a), pb = appPoint([a[0] + bias[0], a[1] + bias[1]]);
    const c = 0.045;
    extra = `<g class="dev"><path class="dev-l" d="M${svgN(pa[0])} ${svgN(pa[1])}L${svgN(pb[0])} ${svgN(pb[1])}"/>
      <path class="dev-x" d="M${svgN(pa[0] - c)} ${svgN(pa[1] - c)}L${svgN(pa[0] + c)} ${svgN(pa[1] + c)}M${svgN(pa[0] + c)} ${svgN(pa[1] - c)}L${svgN(pa[0] - c)} ${svgN(pa[1] + c)}"/>
      <rect class="dev-c" x="${svgN(pb[0] - c * 0.8)}" y="${svgN(pb[1] - c * 0.8)}" width="${svgN(c * 1.6)}" height="${svgN(c * 1.6)}"/></g>`;
  }
  return boardSvg({ size, impacts: darts.map(d => ({ dart: d, old: true })), aim: t.s ? t : null, extra, label: label || 'Impacts et écart moyen' });
}

function messagesHtml(a) {
  return `<ul class="coach">${a.messages.map(m => `<li class="${m.kind}"><span class="mt">${esc(m.text)}</span>${m.tip ? `<span class="mtip">${esc(m.tip)}</span>` : ''}
    ${m.sheet ? `<a class="mlink" href="#/conseils/${m.sheet}">FICHE ${esc(SHEET_NAMES[m.sheet])} ${ico('chev')}</a>` : ''}</li>`).join('')}</ul>`;
}
const SHEET_NAMES = { prise: 'PRISE EN MAIN', posture: 'POSTURE', lancer: 'LANCER', types: 'TYPES DE FLÉCHETTES' };

/** Corps de l'analyse d'une séance (fin et détail). */
function analysisHtml(r, a, key) {
  const ex = EXERCISES[r.exercise] || EXERCISES.libre;
  const sv = sessionValue(r, a);
  const k = (kk, label, value, cls = '') => `<div class="kpi ${cls}" data-k="${kk}"><small>${label}</small><b>${value}</b></div>`;
  const kpis = [];
  kpis.push(k('value', sv ? sv.label : 'Résultat', sv ? fmtValue(sv) + (sv.fmt === 'int' ? '<small> fl.</small>' : '') : a.done ? '—' : 'INCOMPLET', 'hero wide'));
  kpis.push(k('darts', 'Fléchettes', String(a.darts)));
  if (ex.clock && ex.clock.max) kpis.push(k('reached', 'Atteint', `D${a.extra.reached}`));
  else if (ex.clock) kpis.push(k('reached', 'Atteint', `${a.extra.reached}<small> / 20</small>`));
  else if (!sv || sv.label !== 'Dans la cible') kpis.push(k('hits', 'Dans la cible', `${a.hits}<small> / ${a.darts}</small>`));
  else kpis[0] = k('value', 'Dans la cible', `${fmtValue(sv)}<small> · ${a.hits} / ${a.darts}</small>`, 'hero wide');
  kpis.push(k('spread', 'Groupement', cmOf(a.spread)));
  kpis.push(k('off', 'Hors cible', String(a.off)));
  if (a.extra.triples !== undefined) kpis.push(k('triples', 'Triples', String(a.extra.triples)));
  if (ex.metric === 'average' && a.extra.sd !== null) kpis.push(k('sd', 'Régularité', `± ${dec1(a.extra.sd)}`));
  if (a.extra.sector !== undefined) kpis.push(k('sector', 'Bon secteur', pctOf(a.extra.sector)));
  if (a.extra.average !== undefined && ex.metric !== 'average') kpis.push(k('avg', 'Moyenne / volée', dec1(a.extra.average)));
  if (kpis.length % 2 === 0) kpis.push(k('pts', 'Points marqués', String(r.darts.reduce((n, d) => n + pointsOf(d), 0))));
  // Cibles : une par cible visée (horloge : une seule, toutes les fléchettes).
  const groups = ex.clock ? [{ s: 0, z: 'any', darts: r.darts, bias: null, label: 'Toutes les fléchettes' }]
    : a.perTarget.map(t => ({ ...t, darts: dartsOfTarget(r, t), label: `${targetLabel(t)} : ${t.hits}/${t.darts}` }));
  const boards = `<div class="tboards n${Math.min(groups.length, 3)}">${groups.map(g => `<figure>${analysisBoard(g, g.darts, g.bias, groups.length > 1 ? 160 : 260, g.label)}<figcaption>${esc(g.label)}</figcaption></figure>`).join('')}</div>`;
  let detail = '';
  if (ex.clock) {
    detail = ex.clock.max
      ? `<div class="sec">Doubles</div><div class="clockg">${a.extra.perNumber.map(x => `<span class="${x.hit ? '' : 'open'}"><small>D${x.s}</small><b>${x.hit ? `✓${x.darts}` : '—'}</b></span>`).join('')}</div>`
      : `<div class="sec">Fléchettes par numéro</div><div class="clockg">${a.extra.perNumber.map(x => `<span class="${x.hit ? '' : 'open'}"><small>${x.s}</small><b>${x.darts}</b></span>`).join('')}</div>`;
  } else if (ex.metric === 'average') {
    detail = `<div class="sec">Volées</div><div class="clockg">${a.extra.visits.map((v, i) => `<span><small>${i + 1}</small><b>${v}</b></span>`).join('')}</div>`;
  }
  // Objectif du niveau du joueur (0.13.0).
  const level = levelOf(allSessions(), r.player).level;
  const g = goalText(r.exercise, level);
  const ok = goalMet(r, a, level);
  const goal = g ? `<p class="goalline${ok ? ' ok' : ''}"><small>OBJECTIF · NIVEAU ${LEVELS[level]}</small><b>${esc(g)}</b><span>${ok === null ? 'séance incomplète' : ok ? '✓ TENU' : 'pas encore'}</span></p>` : '';
  // Par jeu de fléchettes, quand il a changé pendant la séance.
  const bySet = a.extra.bySet ? `<div class="sec">Par jeu de fléchettes</div><table class="sectab trtab"><thead><tr><th>Jeu</th><th>Fl.</th><th>Préc.</th><th>Grp.</th></tr></thead><tbody>
    ${a.extra.bySet.map(x => `<tr><th class="ell">${esc(x.setId ? (dartSetById(x.setId) || { name: '?' }).name : 'Sans jeu noté')}</th><td>${x.darts}</td><td>${pctOf(x.rate)}</td><td>${x.points >= 3 && x.spread !== null ? dec1(x.spread / 10) : '—'}</td></tr>`).join('')}</tbody></table>` : '';
  return `<div class="kpis">${kpis.join('')}</div>${goal}
    ${`<div class="sec">Analyse du coach${infoBtn(`tr-an-${key}`)}</div>`}
    ${infoBox(`tr-an-${key}`, 'Écarts mesurés sur une vraie cible (en centimètres) : chaque fléchette est placée au point touché (saisie sur la cible) ou au milieu de sa zone (saisie au pavé). <b>Croix</b> : point visé ; <b>carré</b> : centre des impacts ; le trait entre les deux est l\'écart moyen. <b>Groupement</b> : distance moyenne des fléchettes à leur centre (plus c\'est petit, plus elles sont groupées).')}
    ${messagesHtml(a)}
    ${boards}${detail}${bySet}`;
}

/** Fléchettes visées sur une cible (toutes séries confondues). */
function dartsOfTarget(r, t) {
  const st = trainingStateOf(r);
  const out = [];
  for (const b of st.blocks) if (b.s === t.s && b.z === t.z) out.push(...b.darts);
  return out;
}
const trainingStateOf = r => trainingState(r, r.darts);

function nextCard(r, a, closeFirst) {
  const list = [...store.trainings.filter(x => x.id !== r.id), { ...r, endedAt: r.endedAt ?? Date.now() }];
  const level = levelOf(list, r.player).level;
  const n = r.mode === 'coach' ? (nextFor(a, r, level) || suggestNext(list, r.player, level)) : null;
  if (!n) return '';
  const ex = EXERCISES[n.key];
  return `<div class="propose"><small>EXERCICE SUIVANT</small><b>${esc(ex.name)}</b><span>${esc(ex.short)} · ${esc(n.why)}</span></div>
    <button type="button" class="btn accent big" data-act="${closeFirst ? 'tr-finish-next' : 'tr-start'}" data-arg="${n.key}">${ico('target')} ${esc(ex.name.toUpperCase())}</button>`;
}

export function trainingEnd() {
  const r = tr();
  if (!r) { go('#/entrainement', { replace: true }); return ''; }
  const st = trState();
  if (!st.done) { go('#/entrainement/jeu', { replace: true }); return ''; }
  const a = analyze(r);
  const add = addDraft;
  const libre = r.exercise === 'libre';
  const addBox = libre ? (add
    ? `<div class="sec">Série suivante</div>${targetPicker(add, 'add')}
       <div class="btns two"><button type="button" class="btn" data-act="tr-add-cancel">ANNULER</button><button type="button" class="btn primary" data-act="tr-add-go">VISER ${esc(targetLabel(add))} · ${add.n} FL.</button></div>`
    : `<button type="button" class="btn" data-act="tr-add">${ico('plus')} ENCORE UNE SÉRIE</button>`) : '';
  return `<div class="screen trend">${topBar('Séance finie', '#/entrainement')}
    <div class="pad">
      <div class="trhead"><b>${esc(sessionTitle(r))}</b><span>${esc(playerById(r.player).name)} · ${esc(setsText(r))} · ${when(r.startedAt)}</span></div>
      ${analysisHtml(r, a, 'fin')}
      <div class="sec">Et maintenant</div>
      <div class="endbtns">
        ${nextCard(r, a, true)}
        <button type="button" class="btn ${r.mode === 'coach' ? '' : 'accent big'}" data-act="tr-finish">${ico('check')} TERMINER LA SÉANCE</button>
        ${addBox}
        <button type="button" class="btn ghost" data-act="tr-undo-end">${ico('undo')} ANNULER LA DERNIÈRE FLÉCHETTE</button>
      </div>
    </div></div>`;
}

// Détail : panneau ouvert { id, kind: 'delete' | 'player' | 'set', run? } (un seul à la fois ; fermé par tr-del-no).
let detPanel = null;
export function presetDetail(panel = null) { detPanel = panel; }

function managePanel(r) {
  const p = detPanel && detPanel.id === r.id ? detPanel : null;
  const close = '<button type="button" class="btn" data-act="tr-del-no">ANNULER</button>';
  const runs = setRuns(r).filter((x, i) => i === 0 || x.from < r.darts.length);
  // Note : enregistrée au fil de la saisie.
  const note = `<div class="sec">Note${infoBtn('tr-note')}</div>${infoBox('tr-note', 'Une remarque pour plus tard : fatigue, nouvelle prise, autre lieu, réglage du jeu… Elle s\'affiche dans la liste des séances (✎).')}
    <label class="field"><textarea class="input trnote" data-input="tr-note" data-id="${esc(r.id)}" maxlength="300" rows="3" placeholder="Une remarque sur cette séance" spellcheck="true">${esc(r.note || '')}</textarea></label>`;
  // Jeu(x) de fléchettes : corriger celui noté (par partie de séance si le jeu a changé en cours).
  const setRows = runs.map((x, i) => {
    const o = x.setId ? dartSetById(x.setId) : null;
    const span = runs.length > 1 ? `fléchettes ${x.from + 1} à ${Math.min(x.to, r.darts.length)}` : 'toute la séance';
    return `<li><span class="setd" aria-hidden="true">${o ? dartDiagram({ shape: o.shape, flight: o.flight, colors: o.colors, mini: true }) : ''}</span><span class="t"><b class="ell">${esc(o ? o.name : 'Sans jeu noté')}</b><small>${span}</small></span>
      <button type="button" class="btn small-btn" data-act="tr-det-edit" data-arg="${esc(r.id)}|set|${i}">CHANGER</button></li>`;
  }).join('');
  let panel = '';
  if (p && p.kind === 'set') {
    const x = runs[p.run];
    panel = x ? `<div class="confirm" role="alert" data-reveal><p class="alert-h">JEU DE ${runs.length > 1 ? `LA PARTIE ${p.run + 1}` : 'LA SÉANCE'}</p>${setCards('tr-run-set', x.setId || '')}${close}</div>` : '';
  } else if (p && p.kind === 'player') {
    panel = `<div class="confirm" role="alert" data-reveal><p class="alert-h">QUI A LANCÉ ?</p><p class="small">La séance passe au joueur choisi (ses stats et son niveau).</p>
      <div class="chips">${activePlayers().map(q => `<button type="button" class="btn chip" data-act="tr-det-player" data-arg="${esc(q.id)}" aria-pressed="${q.id === r.player}">${avatarHtml(q, 38)}<span class="nm">${esc(q.name.split(' ')[0])}</span></button>`).join('')}</div>${close}</div>`;
  } else if (p && p.kind === 'delete') {
    panel = `<div class="confirm" role="alert" data-reveal><p class="alert-h">SUPPRIMER LA SÉANCE ?</p><p class="small">Elle disparaît des stats, avec ses fléchettes. Pour seulement la sortir des stats, mieux vaut la mettre de côté.</p>
        <div class="btns two"><button type="button" class="btn" data-act="tr-del-no">NON</button><button type="button" class="btn alert" data-act="tr-del-yes" data-arg="${esc(r.id)}">SUPPRIMER</button></div></div>`;
  }
  const st = trainingState(r, r.darts);
  const again = r.exercise === 'libre'
    ? `<button type="button" class="btn" data-act="tr-again" data-arg="${esc(r.id)}">${ico('target')} REFAIRE CETTE SÉANCE</button>`
    : `<button type="button" class="btn" data-act="tr-start" data-arg="${r.exercise}">${ico('target')} REFAIRE : ${esc(EXERCISES[r.exercise].name.toUpperCase())}</button>`;
  const resume = r.stopped && !st.done ? `<button type="button" class="btn accent stack" data-act="tr-reopen" data-arg="${esc(r.id)}">${ico('play')} REPRENDRE CETTE SÉANCE<small>${store.tr ? 'la séance en cours sera arrêtée' : `il reste ${st.clock ? 'des numéros' : plural(st.blocks.reduce((n, b) => n + b.n, 0) - r.darts.length, 'fléchette', 'fléchettes')}`}</small></button>` : '';
  const who = activePlayers().length > 1 || !activePlayers().some(q => q.id === r.player)
    ? `<button type="button" class="btn ghost" data-act="tr-det-edit" data-arg="${esc(r.id)}|player">${ico('players')} CHANGER DE JOUEUR</button>` : '';
  return `${note}
    <div class="sec">Jeu de fléchettes${runs.length > 1 ? ` <span class="n">${runs.length}</span>` : ''}</div><ul class="detsets">${setRows}</ul>
    ${panel}
    <div class="sec">Séance${infoBtn('tr-manage')}</div>
    ${infoBox('tr-manage', '<b>Mettre de côté</b> : la séance reste dans la liste mais ne compte plus dans les stats, ni pour le niveau ni pour l\'exercice proposé (une séance de test, un soir de fatigue, quelqu\'un d\'autre qui a lancé). Elle se remet dans les stats à tout moment. <b>Reprendre</b> (séance arrêtée) : elle redevient la séance en cours, là où elle s\'était arrêtée.')}
    <div class="endbtns">${resume}${again}
      <button type="button" class="btn stack" data-act="tr-exclude" data-arg="${esc(r.id)}">${r.excluded ? `${ico('check')} REMETTRE DANS LES STATS` : 'METTRE DE CÔTÉ<small>hors stats et hors niveau</small>'}</button>
      ${who}
      ${p && p.kind === 'delete' ? '' : `<button type="button" class="btn danger" data-act="tr-del" data-arg="${esc(r.id)}">${ico('trash')} SUPPRIMER LA SÉANCE</button>`}
    </div>`;
}

export function trainingDetail(id) {
  const r = trainingById(id);
  if (!r) { go('#/entrainement', { replace: true }); return ''; }
  if (store.tr && store.tr.id === id) { go(trState().done ? '#/entrainement/fin' : '#/entrainement/jeu', { replace: true }); return ''; }
  if (detPanel && detPanel.id !== id) detPanel = null;
  const a = analyze(r);
  return `<div class="screen trend">${topBar('Séance', backFrom('#/entrainement'))}
    <div class="pad">
      <div class="trhead"><b>${esc(sessionTitle(r))}</b><span>${esc(playerById(r.player).name)} · ${esc(setsText(r))} · ${when(r.startedAt)}${r.stopped ? ' · arrêtée avant la fin' : ''}</span>
        ${r.excluded ? '<span class="excl-tag">MISE DE CÔTÉ · HORS STATS</span>' : ''}</div>
      ${analysisHtml(r, a, 'detail')}
      ${managePanel(r)}
    </div></div>`;
}

export const inputs = {
  'tr-note'(value, el) { updateTraining(el.dataset.id, { note: value }); },
};

// ------------------------------------------------------------------ actions
export const actions = {
  'tr-player'(id) { saveTrSetup({ player: id }); refresh(); },
  'tr-set'(id) { saveTrSetup({ setId: id || null }); refresh(); },
  'tr-fold'() { othersOpen = !othersOpen; refresh(); },
  'tr-change-set'() { const r = tr(); if (r) { r.ui.confirm = 'set'; refresh(); } },
  'tr-set-now'(id) { const r = tr(); if (!r) return; if (trChangeSet(id || null)) { buzz(BUZZ.dart); sound('validate'); } r.ui.confirm = false; r.ui.pause = false; refresh(); },
  'tr-mode'(m) { saveTrSetup({ mode: m === 'libre' ? 'libre' : 'coach' }); refresh(); },
  'tr-pick'(arg) {
    const [who, field, val] = String(arg).split('|');
    const t = who === 'add' ? addDraft : { ...trSetup().free };
    if (!t) return;
    if (field === 's') { t.s = Number(val); if (!ZONES_FOR(t.s).includes(t.z)) t.z = 'any'; }
    else if (field === 'z') t.z = val;
    else if (field === 'n') t.n = Math.max(1, Math.min(99, Number(val) || 9));
    if (who === 'setup') saveTrSetup({ free: t });
    refresh();
  },
  'tr-start'(key) { if (EXERCISES[key]) startFrom(key); },
  'tr-key'(k) {
    const r = tr();
    if (!r || r.ui.pause) return;
    const st = trState();
    const z = r.ui.zone || defaultZone(st);
    const n = Number(k);
    if (k === '0') return play(makeDart(0, 1));
    if (k === '50') return play(makeDart(25, 2));
    if (k === '25') { if (r.ui.zone === 't') return; return play(makeDart(25, r.ui.zone === 'd' ? 2 : 1)); }
    if (n >= 1 && n <= 20) {
      if (z === 'd' || z === 't') return play(makeDart(n, z === 'd' ? 2 : 3));
      return play({ segment: n, multiplier: 1, ring: z });
    }
  },
  'tr-zone'(z) {
    const r = tr();
    if (!r) return;
    const cur = r.ui.zone || defaultZone(trState());
    // D ou T touché deux fois : retour au simple par défaut ; INT. / EXT. : on choisit l'anneau.
    // Si D ou T est déjà la zone par défaut (cible visée), le toucher de nouveau arme le simple intérieur.
    r.ui.zone = (z === 'd' || z === 't') && cur === z ? (defaultZone(trState()) === z ? 'in' : null) : z;
    refresh();
  },
  'tr-undo'() { if (trUndo()) { buzz(BUZZ.undo); sound('undo'); if (tr()) tr().ui.zone = null; } refresh(); },
  'tr-undo-end'() { trUndo(); buzz(BUZZ.undo); sound('undo'); addDraft = null; go('#/entrainement/jeu'); },
  'tr-pause'() { const r = tr(); if (r) { r.ui.pause = true; r.ui.confirm = false; refresh(); } },
  'tr-resume'() { const r = tr(); if (r) { r.ui.pause = false; r.ui.confirm = false; refresh(); } },
  'tr-delete'() { const r = tr(); if (r) { r.ui.confirm = 'delete'; refresh(); } },
  'tr-confirm-no'() { const r = tr(); if (r) { r.ui.confirm = false; refresh(); } },
  'tr-delete-yes'() { const r = tr(); if (r) deleteTrainings([r.id]); go('#/entrainement'); },
  'tr-stop'() { const rec = closeTraining({ stopped: true }); go(rec ? `#/entrainement/seance/${rec.id}` : '#/entrainement'); },
  'tr-finish'() { closeTraining(); addDraft = null; sound('validate'); go('#/entrainement'); },
  'tr-finish-next'(key) { closeTraining(); addDraft = null; startFrom(key); },
  'tr-add'() { const st = trState(); const last = st.blocks[st.blocks.length - 1]; addDraft = { s: last.s, z: last.z, n: last.n }; refresh(); },
  'tr-add-cancel'() { addDraft = null; refresh(); },
  'tr-add-go'() { if (addDraft && trAddBlock(addDraft, addDraft.n)) { addDraft = null; go('#/entrainement/jeu'); } },
  'tr-again'(id) {
    const r = trainingById(id);
    if (!r) return;
    const su = trSetup();
    startTraining({ player: r.player, setId: su.setId, mode: 'libre', exercise: 'libre', blocks: r.blocks });
    go('#/entrainement/jeu');
  },
  'tr-del'(id) { detPanel = { id, kind: 'delete' }; refresh(); },
  'tr-del-no'() { detPanel = null; refresh(); },
  'tr-del-yes'(id) { deleteTrainings([id]); detPanel = null; go(backFrom('#/entrainement'), { replace: true }); },
  'tr-det-edit'(arg) { const [id, kind, run] = String(arg).split('|'); detPanel = { id, kind, run: Number(run) || 0 }; refresh(); },
  'tr-run-set'(setId) { if (detPanel && detPanel.kind === 'set') updateTraining(detPanel.id, { run: detPanel.run, setId: setId || null }); detPanel = null; refresh(); },
  'tr-det-player'(pid) { if (detPanel && detPanel.kind === 'player') updateTraining(detPanel.id, { player: pid }); detPanel = null; refresh(); },
  'tr-exclude'(id) { const r = trainingById(id); if (r) updateTraining(id, { excluded: !r.excluded }); detPanel = null; refresh(); },
  'tr-reopen'(id) { if (resumeTraining(id)) { detPanel = null; sound('validate'); go('#/entrainement/jeu'); } },
};
