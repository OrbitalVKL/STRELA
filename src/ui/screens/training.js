// Strela — entraînement solo (lot 8, docs/entrainement.md). Écrans :
//   #/entrainement            choix : joueur, jeu de fléchettes, COACHÉ (exercice proposé, niveau) ou LIBRE (cible et
//                             nombre de fléchettes), dernières séances, raccourcis (stats, conseils, armurerie)
//   #/entrainement/jeu        saisie : comme en partie — pavé en portrait (avec SIMPLE INTÉRIEUR / EXTÉRIEUR), cible
//                             au doigt en paysage (loupe) ; HORS CIBLE saisissable ; ANNULER
//   #/entrainement/fin        séance finie (pas encore enregistrée) : analyse, TERMINER, ENCORE UNE SÉRIE (libre)
//   #/entrainement/seance/<id> détail d'une séance close : analyse, et sa gestion (0.13.0) : note, refaire, reprendre
//                             (arrêtée), joueur, jeu de fléchettes de chaque partie de la séance, mettre de côté, supprimer
// 0.14.0 : mode JEUX — X01 et Cricket en solo, aux vraies règles (même saisie ; en tête, le reste et la finition
// proposée, ou les cibles du Cricket ; analyse du jeu et carte de chaleur à la fin).
// Moteur : engine/training.js (exercices, analyse, coach) ; données : store.js (section « entraînement solo »).
import { store, activePlayers, playerById, trState, startTraining, trThrow, trUndo, trAddBlock, closeTraining, deleteTrainings, trainingById, dartSetById, saveTrSetup,
  trChangeSet, updateTraining, resumeTraining, saveTr, appModes, profilePlayer } from '../store.js';
import { esc, ico, topBar, plural, when } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { EXERCISES, analyze, suggestNext, nextFor, levelOf, LEVELS, LEVEL_EXERCISES, ALL_EXERCISES, exerciseLevel, goalOf, goalMet, setRuns, setAt, setsUsed, trainingDartLabel, targetLabel, zoneLabelOf, ZONES_FOR, ZONE_LABEL, BULL_ZONE_LABEL,
  isHit, sessionValue, cleanTarget, aimPoint, appPoint, pointsOf, trainingState, GAME_EXERCISES, GAME_LEGS, isGameSession, cleanGame, gameLabel, heatCounts,
  rulesOf, volleyInfo, OFF_R, FUN_KEYS, isFunSession, soloDefiNow } from '../../engine/training.js';
import { DEFIS } from '../../engine/defis.js';
import { FUN } from '../../engine/fun.js';
import { START_SCORES } from '../../engine/x01.js';
import { CRICKET_TARGETS } from '../../engine/cricket.js';
import { suggestCheckout, checkoutPrefs } from '../../engine/checkout.js';
import { markSvg } from './cricket.js';
import { dartSetSummary } from '../../engine/dartsets.js';
import { dartDiagram } from './advice.js';
import { makeDart } from '../../engine/darts.js';
import { segmentAt, RINGS, zoneTone } from '../../engine/board.js';
import { boardSvg, plainBoard, svgN } from '../board.js';
import { go, refresh, buzz, BUZZ, backFrom } from '../nav.js';
import { sound, dartSound } from '../feedback.js';
import { bindBoardInput, boardHint, frozenLoupe } from '../boardinput.js';
import { isLandscape } from './game.js';
import { infoBtn, infoBox } from '../info.js';
import { heatScale } from '../heat.js';
import { featChips } from '../trainhonours.js';

const dec1 = v => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const pctOf = v => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);
const dec2 = v => (v === null || v === undefined ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ','));
const cmOf = mm => (mm === null || mm === undefined ? '—' : `${dec1(mm / 10)} cm`);
/** Valeur affichée d'un chiffre de séance (sessionValue). */
export const fmtValue = sv => (!sv ? '—' : sv.fmt === 'pct' ? pctOf(sv.v) : sv.fmt === 'avg' ? dec1(sv.v) : sv.fmt === 'mpr' ? dec2(sv.v) : String(Math.round(sv.v)));

// ------------------------------------------------------------------ choix (derniers choix gardés : réglage « training »)
/** Choix effectifs de l'écran Entraînement (joueur actif, jeu non archivé, cible libre valide). */
export function trSetup() {
  const s = store.trSetup || {};
  const players = activePlayers();
  // Lot 8 du 23/11 (6.1) : sans le mode soirée, l'entraînement est au nom du profil (pas de choix de joueur).
  const me = profilePlayer();
  const player = appModes().soiree && players.find(p => p.id === s.player) ? s.player : (me ? me.id : players[0] ? players[0].id : null);
  const set = store.dartSets.find(x => x.id === s.setId && !x.archived);
  const free = cleanTarget(s.free) || { s: 20, z: 'any' };
  // Jeux en solo (0.14.0) : jeu choisi et ses réglages (départ et sortie du X01 ; manches, communes aux deux).
  const kind = s.game && s.game.kind === 'cricket' ? 'cricket' : 'x01';
  const game = { kind, ...cleanGame('x01', s.game) };
  return { player, setId: set ? set.id : null, mode: ['libre', 'jeu'].includes(s.mode) ? s.mode : 'coach', free: { ...free, n: volleyCount(s.free && s.free.n) }, game };
}
/** Nombre de fléchettes d'une série libre : un multiple de 3 (lot 8 du 23/11, 1.6 : la cible change à la fin d'une volée), de 3 à 99. */
export const volleyCount = v => Math.max(3, Math.min(99, Math.round((Number(v) || 9) / 3) * 3));

// Sommaire et tests : choix préparés sans base.
let addDraft = null; // libre : série ajoutée en fin de séance { s, z, n }
export function presetTraining({ add = null, others = false, fun = false } = {}) { addDraft = add; othersOpen = others; funOpen = fun; }

function playersChips(su) {
  const players = activePlayers();
  if (players.length < 2 || !appModes().soiree) return '';
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
      <div class="tpk-n"><button type="button" class="btn" data-act="tr-pick" data-arg="${who}|n|${Math.max(3, t.n - 3)}" aria-label="Une volée de moins" ${t.n <= 3 ? 'disabled' : ''}>${ico('minus')}</button><b>${t.n}</b><button type="button" class="btn" data-act="tr-pick" data-arg="${who}|n|${Math.min(99, t.n + 3)}" aria-label="Une volée de plus" ${t.n >= 99 ? 'disabled' : ''}>${ico('plus')}</button></div>
      <div class="chips2">${preset}</div>
    </div>`;
}

/** Objectif affiché : « 50 % », « 60 fl. au plus », « 30 de moyenne », « 9 doubles ». */
export function goalText(key, level) {
  const g = goalOf(key, level);
  if (!g) return '';
  const ex = EXERCISES[key];
  if (ex.fun) return `${g.v} ${FUN[key].unit}${g.dir < 0 ? ' au plus' : ''}`;
  if (ex.metric === 'mpr') return `MPR ${String(g.v).replace('.', ',')}`;
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
    // Lot 8 du 23/11 (2.1) : l'encart « Règles » : objectif, déroulé, réussi, moment de la saisie, et l'objectif chiffré.
    const info = infoBox(`tr-ex-${k}`, `<b>Règles</b>${rulesHtml(k)}${goal ? `<b>Objectif chiffré</b> (niveau ${esc(LEVELS[level].toLowerCase())}) : ${esc(goal)}.` : ''}`);
    return `<li class="${k === proposed ? 'on' : ''}"><button type="button" class="exr" data-act="tr-start" data-arg="${k}">
      <span class="t"><b>${esc(ex.name)}</b><small>${esc(ex.short)}${goal ? ` · obj. ${esc(goal)}` : ''}</small></span>
      <span class="v">${sv ? `<small>DERNIÈRE</small><b>${fmtValue(sv)}${ok ? ' ✓' : ''}</b>` : '<small>JAMAIS</small>'}</span>${ico('play')}</button>
      ${infoBtn(`tr-ex-${k}`)}</li>${info ? `<li class="exi">${info}</li>` : ''}`;
  }).join('')}</ul>`;
}

let othersOpen = false; // exercices des autres niveaux, repliés
let funOpen = false;    // jeux de cible (lot 8 du 23/11), repliés

// Lot 8 du 23/11 (4.3) : chaque séance est une carte — en-tête : date, exercice, jeu de fléchettes, résultat clé ; le
// détail fléchette par fléchette (volée par volée, avec la cible visée) se déplie au toucher ; VOIR LA SÉANCE ouvre
// l'analyse. Cartes dépliées : gardées le temps de la session.
const openCards = new Set();
export function presetCards(ids = []) { openCards.clear(); for (const id of ids) openCards.add(id); }
/** Volées d'une séance pour le détail d'une carte : [{ n, darts: [{ label, hit, target }] }]. */
function volleysOf(r) {
  const st = trainingState(r, r.darts);
  const out = [];
  r.darts.forEach((d, i) => {
    const t = st.game ? null : targetAt(st, i);
    if (i % 3 === 0) out.push({ n: out.length + 1, darts: [] });
    out[out.length - 1].darts.push({ label: trainingDartLabel(d), hit: t ? isHit(t, d) : null, target: t ? targetLabel(t) : '' });
  });
  return out;
}
export function sessionCard(r) {
  const ex = EXERCISES[r.exercise] || EXERCISES.libre;
  const sv = sessionValue(r);
  const what = r.exercise === 'libre' ? libreLabel(r) : isGameSession(r) ? sessionTitle(r) : ex.name;
  const open = openCards.has(r.id);
  const body = open ? `<ol class="tvol">${volleysOf(r).map(v => `<li><small>V${v.n}</small>${v.darts.map(d => `<span class="${d.hit === null ? '' : d.hit ? 'hit' : 'miss'}"${d.target ? ` title="cible ${esc(d.target)}"` : ''}>${d.target && d.hit !== null ? `<i>${esc(d.target)}</i>` : ''}${esc(d.label)}</span>`).join('')}</li>`).join('')}</ol>
    <a class="btn ghost tcfoot" href="#/entrainement/seance/${esc(r.id)}">${ico('stats')} VOIR LA SÉANCE</a>` : '';
  return `<li class="tcard${open ? ' open' : ''}${r.excluded ? ' excl' : ''}"><button type="button" class="trow" data-act="tr-card" data-arg="${esc(r.id)}" aria-expanded="${open}">
    <span class="l1"><b class="ell">${esc(what)}</b><span>${when(r.startedAt)}</span></span>
    <span class="l2"><span class="ell">${esc(sessionFlags(r))}</span><b>${sv ? `<small>${esc(sv.label)}</small> ` : ''}${fmtValue(sv)}</b>${ico(open ? 'up' : 'down')}</span></button>${body}</li>`;
}
const sessionRow = sessionCard;
/** Deuxième ligne d'une séance dans une liste : jeux, arrêtée, mise de côté, note. */
export const sessionFlags = r => [setsText(r), r.stopped ? 'arrêtée' : '', r.excluded ? 'mise de côté' : '', r.note ? '✎ note' : ''].filter(Boolean).join(' · ');
/** Libre : « T20 ×9 · 19 ×9 ». */
export const libreLabel = r => (r.blocks || []).map(b => `${targetLabel(b)} ×${b.n}`).join(' · ') || 'Libre';

export function trainingHub() {
  const su = trSetup();
  if (!su.player) {
    return `<div class="screen">${topBar('Entraînement', backFrom('#/'))}<div class="empty"><div class="big">AUCUN JOUEUR</div>
      <p>L'entraînement se note à ton nom : crée d'abord ton profil.</p><a class="btn primary" href="#/bienvenue/nom">${ico('plus')} CRÉER MON PROFIL</a></div></div>`;
  }
  const p = playerById(su.player);
  const st = store.tr ? trState() : null;
  const resume = store.tr
    ? `<a class="btn accent big resume tr-resume" href="${st.done ? '#/entrainement/fin' : '#/entrainement/jeu'}">${ico('play')} ${st.done ? 'SÉANCE FINIE : VOIR' : 'REPRENDRE LA SÉANCE'}<small>${esc(sessionTitle(store.tr))} · ${plural(store.tr.darts.length, 'fléchette', 'fléchettes')}</small></a>`
    : '';
  const mode = `<div class="seg trmode">${[['coach', 'Coaché'], ['libre', 'Libre'], ['jeu', 'Jeux']].map(([k, l]) => `<button type="button" data-act="tr-mode" data-arg="${k}" aria-pressed="${su.mode === k}">${l}</button>`).join('')}</div>`;
  let body;
  if (su.mode === 'coach') {
    const level = levelOf(allSessions(), su.player).level;
    const next = suggestNext(allSessions(), su.player, level);
    const ex = EXERCISES[next.key];
    const mineKeys = LEVEL_EXERCISES[level];
    const others = ALL_EXERCISES.filter(k => k !== 'libre' && !GAME_EXERCISES.includes(k) && !FUN_KEYS.includes(k) && !mineKeys.includes(k));
    body = `${levelCard(su.player)}
      <div class="propose"><small>EXERCICE PROPOSÉ</small><b>${esc(ex.name)}</b><span>${esc(ex.short)} · ${esc(next.why)}</span></div>
      <button type="button" class="btn ${resume ? 'accent-line' : 'accent'} big" data-act="tr-start" data-arg="${next.key}">${ico('target')} COMMENCER</button>
      <div class="sec">Exercices · niveau ${esc(LEVELS[level].toLowerCase())}${infoBtn('tr-exs')}</div>
      ${infoBox('tr-exs', 'Le coach propose un exercice d\'après la dernière séance (un écart à corriger, un objectif tenu), sinon un exercice de ton niveau pas encore fait, ou le moins récent. Touchez un autre exercice pour le lancer ; (i) donne son but et son objectif ; ✓ : la dernière séance tient l\'objectif.')}
      ${exerciseRows(su.player, next.key, mineKeys, level)}
      <button type="button" class="fold" data-act="tr-fold" aria-expanded="${othersOpen}"><span>${level === 'debutant' ? 'Exercices du niveau intermédiaire' : 'Exercices du niveau débutant'}</span><span class="n">${others.length}</span>${ico(othersOpen ? 'up' : 'down')}</button>
      ${othersOpen ? exerciseRows(su.player, next.key, others, level) : ''}
      <button type="button" class="fold" data-act="tr-fold-fun" aria-expanded="${funOpen}"><span>Jeux de cible</span><span class="n">${FUN_KEYS.length}</span>${ico(funOpen ? 'up' : 'down')}</button>
      ${funOpen ? `<p class="note">Plus ludiques : parcours, golf, Shanghai, Killer… Ils comptent dans les stats (précision, écarts), pas pour le niveau.</p>${exerciseRows(su.player, next.key, FUN_KEYS, level)}` : ''}`;
  } else if (su.mode === 'jeu') {
    body = gamePicker(su, resume);
  } else {
    const t = su.free;
    body = `<div class="sec">Cible${infoBtn('tr-free')}</div>
      ${infoBox('tr-free', `Choisis le secteur, la zone et le nombre de fléchettes (par volées de 3). Pendant la séance, l'appli compare la cible visée et les impacts : précision, et vers où partent les fléchettes. À la fin, ENCORE UNE SÉRIE ajoute une autre cible à la même séance. <b>Règles</b>${rulesHtml('libre')}`)}
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
      ${activePlayers().length < 2 || !appModes().soiree ? `<div class="who2" style="margin-top:14px">${avatarHtml(p, 44)}<div><b class="nm">${esc(p.name)}</b><span>${plural(mine.length, 'séance', 'séances')}</span></div></div>` : ''}
      ${setChips(su)}
      <div class="sec">Mode${infoBtn('tr-mode')}</div>
      ${infoBox('tr-mode', '<b>Coaché</b> : l\'appli propose un exercice, analyse tes fléchettes et propose corrections, conseils et exercice suivant. <b>Libre</b> : tu fixes tes cibles (secteur, zone, nombre de fléchettes) ; l\'appli montre les écarts. <b>Jeux</b> : une vraie partie de X01 ou de Cricket, seul, aux règles du jeu, pour essayer un jeu de fléchettes en conditions réelles.')}
      ${mode}${body}
      <nav class="tiles2 trtiles" aria-label="Entraînement">${tiles.map(([h, i, l, s]) => `<a class="tile2" href="${h}">${ico(i)}<b data-shrink>${l}</b><span data-shrink>${s}</span></a>`).join('')}</nav>
      ${mine.length ? `<div class="sec">Dernières séances <span class="n">${mine.length}</span></div><ul class="trl">${mine.slice(0, 8).map(sessionRow).join('')}</ul>
        ${mine.length > 8 ? '<a class="btn ghost" href="#/entrainement/stats">TOUTES LES SÉANCES DANS LES STATS</a>' : ''}` : ''}
    </div></div>`;
}

export const sessionTitle = r => (r.exercise === 'libre' ? `Libre · ${libreLabel(r)}` : isGameSession(r) ? [EXERCISES[r.exercise].name, gameLabel(r)].filter(Boolean).join(' · ') : (EXERCISES[r.exercise] || EXERCISES.libre).name);

/** Choix d'un jeu en solo (0.14.0) : X01 (départ, sortie, manches) ou Cricket (manches). */
function gamePicker(su, resume) {
  const g = su.game;
  const chip = (field, v, label, cur) => `<button type="button" class="chip2" data-act="tr-game" data-arg="${field}|${v}" aria-pressed="${cur === v}">${label}</button>`;
  const level = levelOf(allSessions(), su.player).level;
  const last = lastOf(su.player, g.kind);
  const sv = last ? sessionValue(last) : null;
  const goal = goalText(g.kind, level);
  const rec = { exercise: g.kind, game: g };
  return `<div class="sec">Jeu${infoBtn('tr-game')}</div>
    ${infoBox('tr-game', `Seul, on vise comme en partie : c'est là que comptent, dans les stats, la part de triples et de doubles et la carte de chaleur (sur un exercice, la cible est imposée). La finition proposée en X01 suit ta fiche joueur. <b>Règles · ${g.kind === 'x01' ? 'X01' : 'Cricket'}</b>${rulesHtml(g.kind)}`)}
    <div class="seg trgame">${[['x01', 'X01'], ['cricket', 'Cricket']].map(([k, l]) => `<button type="button" data-act="tr-game" data-arg="kind|${k}" aria-pressed="${g.kind === k}">${l}</button>`).join('')}</div>
    <div class="tpick">
      ${g.kind === 'x01' ? `<span class="small dim caps">Départ</span><div class="chips2">${START_SCORES.map(v => chip('start', v, v, g.startScore)).join('')}</div>
      <span class="small dim caps">Sortie</span><div class="chips2">${chip('out', 'single', 'SIMPLE', g.outMode)}${chip('out', 'double', 'DOUBLE', g.outMode)}</div>
      <span class="small dim caps">Défis${infoBtn('tr-defis')}</span>${infoBox('tr-defis', 'Les défis des soirées, tirés de la même façon et vérifiés de la même façon : un défi tombe sur une volée de temps en temps (parfois : une sur 8 environ ; souvent : une sur 4), annoncé en haut de l\'écran avant la volée, puis réussi ou raté. Seul, pas de gage : le compte des défis réussis est dans l\'analyse.')}
      <div class="chips2">${chip('defis', 'aucun', 'AUCUN', g.defis || 'aucun')}${chip('defis', 'parfois', 'PARFOIS', g.defis || 'aucun')}${chip('defis', 'souvent', 'SOUVENT', g.defis || 'aucun')}</div>` : ''}
      <span class="small dim caps">Manches</span><div class="chips2">${GAME_LEGS.map(v => chip('legs', v, v, g.legs)).join('')}</div>
    </div>
    <p class="note">${sv ? `Dernière : <b>${fmtValue(sv)}</b> ${esc(sv.label.toLowerCase())}` : 'Jamais joué'}${goal ? ` · objectif (niveau ${esc(LEVELS[level].toLowerCase())}) : ${esc(goal)}` : ''}</p>
    <button type="button" class="btn ${resume ? 'accent-line' : 'accent'} big" data-act="tr-start" data-arg="${g.kind}">${ico('play')} JOUER · ${esc((g.kind === 'x01' ? gameLabel(rec) : ['CRICKET', gameLabel(rec)].filter(Boolean).join(' · ')).toUpperCase())}</button>`;
}

function startFrom(key, game = null) {
  const su = trSetup();
  if (!su.player) return;
  const isGame = GAME_EXERCISES.includes(key);
  const setup = { player: su.player, setId: su.setId, mode: key === 'libre' ? 'libre' : isGame ? 'jeu' : 'coach', exercise: key };
  if (key === 'libre') setup.blocks = [{ s: su.free.s, z: su.free.z, n: su.free.n }];
  if (isGame) setup.game = cleanGame(key, game || su.game);
  startTraining(setup);
  sound('validate');
  buzz(BUZZ.dart);
  go('#/entrainement/jeu');
}

// ------------------------------------------------------------------ saisie
const tr = () => store.tr;
/** Zone de la cible visée, à souligner dans le choix de la zone (pavé, 23/11) : 'in', 'out', 'd', 't', ou null. */
const aimedZone = st => (st && st.cur && st.cur.s !== 25 ? (padRing() ? ({ si: 'in', se: 'out', d: 'd', t: 't' }[st.cur.z] || null) : ({ s: 's', si: 's', se: 's', d: 'd', t: 't' }[st.cur.z] || null)) : null);
/** Le pavé demande-t-il simple intérieur ou extérieur ? (réglage `padRing`, désactivé par défaut) */
export const padRing = () => store.settings.padRing === true;

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

/** En-tête d'un jeu de cible : la cible (ou le reste à faire), le score en cours, la volée. */
function funHead(r, st) {
  const fs = st.fun, f = FUN[r.exercise], x = fs.extra;
  const v = volleyInfo(st);
  const t = st.cur ? st.blocks[st.cur.i] : null;
  const big = r.exercise === 'cent' ? String(x.remaining) : t ? targetLabel(t) : '—';
  const small = r.exercise === 'cent' ? 'À FAIRE' : r.exercise === 'killer' ? (x.killer ? 'ADVERSAIRE' : 'TON NUMÉRO') : r.exercise === 'golf' ? `TROU ${t ? t.s : 9}` : 'VISE';
  const zl = r.exercise === 'killer' ? (x.killer ? `VIES ${x.lives.map(l => l).join(' · ')}` : `${x.marks}/3 MARQUES`) : r.exercise === 'moitie' && t && t.s === 25 ? '25 OU 50' : r.exercise === 'cent' ? 'VISE CE QUE TU VEUX' : 'TOUT LE SECTEUR';
  return `<section class="taim" aria-label="Cible visée"><div class="tl"><small>${small}</small><b class="tg" data-shrink>${esc(big)}</b><span class="zl ell">${esc(zl)}</span></div>
    <div class="tp"><b>${f.unit === 'fl.' ? r.darts.length : fs.live}<small> ${esc(f.unit)}</small></b><span>VOLÉE ${v.n}${v.total ? `/${v.total}` : ''}</span></div></section>`;
}

function aimHead(r, st) {
  if (st.fun) return funHead(r, st);
  const ex = EXERCISES[r.exercise] || EXERCISES.libre;
  const cur = st.cur;
  const t = cur ? st.blocks[cur.i] : st.blocks[st.blocks.length - 1];
  const nb = st.blocks.length;
  let prog;
  if (st.clock && st.clockMax) prog = `<b>${cur ? cur.k + 1 : st.clockMax}<small>/${st.clockMax}</small></b><span>DOUBLE ${cur ? cur.s : 20}/20<br>VOLÉE ${volleyInfo(st).n}</span>`;
  else if (st.clock) prog = `<b>${st.blocks.filter(b => b.hits).length}<small>/20</small></b><span>FAITS · ${r.darts.length} FL.<br>VOLÉE ${volleyInfo(st).n}</span>`;
  else {
    // Lot 8 du 23/11 (2.2) : où l'on en est, en volées (« volée 2 sur 5 ») ; la série quand il y en a plusieurs.
    const v = volleyInfo(st);
    prog = `<b>${v.n}<small>/${v.total}</small></b><span>VOLÉE${nb > 1 ? `<br>SÉRIE ${cur ? cur.i + 1 : nb}/${nb}` : ''}</span>`;
  }
  return `<section class="taim" aria-label="Cible visée"><div class="tl"><small>VISE</small><b class="tg" data-shrink>${esc(targetLabel(t))}</b><span class="zl ell">${esc(zoneLabelOf(t))}</span></div>
    <div class="tp">${prog}</div></section>`;
}

/**
 * Rappel de la règle du moment sous le titre (lot 8 du 23/11, 2.2), avec son (i) : les règles complètes de l'exercice
 * (2.1), dans un panneau par-dessus la saisie.
 */
function ruleLine(r) {
  return `<p class="trule"><span class="ell">${esc(rulesOf(r.exercise).now)}</span><button type="button" class="ibtn" data-act="tr-rules" aria-pressed="${!!r.ui.rules}" aria-label="Règles de l'exercice">${ico('info')}</button></p>`;
}
/** Les règles d'un exercice (encart (i) du choix, panneau de la saisie) : objectif, déroulé, réussi, saisie. */
export function rulesHtml(key) {
  const ex = EXERCISES[key] || EXERCISES.libre;
  const ru = rulesOf(key);
  return `<dl class="rules"><dt>Objectif</dt><dd>${esc(ex.goal)}</dd><dt>Déroulé</dt><dd>${esc(ru.flow)}</dd><dt>Réussi</dt><dd>${esc(ru.success)}</dd><dt>Saisie</dt><dd>${esc(ru.entry)}</dd></dl>`;
}
function rulesSheet(r) {
  const ex = EXERCISES[r.exercise] || EXERCISES.libre;
  return `<div class="sheet-bg" role="dialog" aria-label="Règles" data-layer><div class="sheet">
    <header class="top" data-layer><h1><span>Règles · ${esc(ex.name)}</span></h1><button type="button" class="act" data-act="tr-rules-close" aria-label="Fermer">${ico('close')}</button></header>
    <div class="body" style="padding-top:12px">${rulesHtml(r.exercise)}<button type="button" class="btn primary" data-act="tr-rules-close">${ico('play')} REPRENDRE</button></div></div></div>`;
}

function liveLine(r, st) {
  const ex = EXERCISES[r.exercise] || EXERCISES.libre;
  if (st.fun) return `<p class="tlive">${esc(st.fun.status)}</p>`;
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
  // Lot 8 du 23/11 (2.2) : quand la cible avance dès qu'elle est touchée (horloge), chaque case porte sa cible ; la case
  // à saisir montre le nombre choisi au pavé en attendant sa zone.
  const perDart = rulesOf(r.exercise).advance === 'hit';
  const tag = t => (perDart && t ? `<small class="dt">${esc(targetLabel(t))}</small>` : '');
  const boxes = [0, 1, 2].map(i => {
    const d = v.darts[i];
    const todo = !v.prev && i === v.darts.length;
    if (!d) return `<div class="dart left${todo ? ' todo' : ''}">${todo ? tag(st.cur && st.blocks[st.cur.i]) : ''}${todo && r.ui.pick ? `<span class="sv pk" data-shrink>${r.ui.pick}…</span>` : ''}</div>`;
    const t = targetAt(st, v.start + i);
    const hit = t && t.s && isHit(t, d);
    return `<div class="dart done${!t || !t.s ? '' : hit ? ' hit' : ' miss'}">${tag(t)}<span class="sv" data-shrink>${esc(trainingDartLabel(d))}</span></div>`;
  }).join('');
  const total = ex.metric === 'average' || ex.fun ? v.darts.reduce((n, d) => n + pointsOf(d), 0)
    : `${v.darts.filter((d, i) => { const t = targetAt(st, v.start + i); return t && isHit(t, d); }).length}<small>/${v.darts.length || 0}</small>`;
  return `<div class="visit${v.prev ? ' prev' : ''}">${boxes}<div class="total ${v.darts.length ? 'inv' : 'zero'}"><small>${ex.metric === 'average' || ex.fun ? 'VOLÉE' : 'DEDANS'}</small><span class="tv" data-shrink>${total}</span></div></div>`;
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

/** Présentation du choix de la zone (réglage `zonePad`, 23/11) : 'rangees' (B, par défaut) ou 'secteur' (C). */
export const ZONE_PADS = ['rangees', 'secteur'];
export const zonePad = () => (store.settings.zonePad === 'secteur' ? 'secteur' : 'rangees');

/**
 * Choix de la zone du nombre `n` (pavé, après le nombre ; demande de Guillaume du 23/11, versions B et C retenues).
 * Toujours des commandes tr-zonepick ('in', 'out' ou 's', 'd', 't'), dans l'ordre de la cible, du bord vers le bull.
 * - B « rangées » : une rangée par zone, la tranche du secteur à gauche aux couleurs de la cible ; double gris à
 *   2 barres, triple noir à 3 barres, barres rouges ou vertes comme les doubles et triples du secteur.
 * - C « secteur » : la part de cible dessinée en grand, aux vraies couleurs, et on touche la bande ; 2 et 3 barres.
 * `az` : zone visée (soulignée en tirets), ou null.
 */
function zonePick(n, az) {
  const ring = padRing();
  const cream = zoneTone(n, 1) === 'cream';
  const zones = ring
    ? [['d', `D${n}`, 'DOUBLE', 2, ''], ['out', String(n), 'SIMPLE EXT.', 0, 'CÔTÉ DOUBLE'], ['t', `T${n}`, 'TRIPLE', 3, ''], ['in', String(n), 'SIMPLE INT.', 0, 'CÔTÉ BULL']]
    : [['d', `D${n}`, 'DOUBLE', 2, ''], ['s', String(n), 'SIMPLE', 0, ''], ['t', `T${n}`, 'TRIPLE', 3, '']];
  const back = `<button type="button" class="key pback" data-act="tr-pick-cancel" data-press>${ico('undo')}<span class="kl" data-shrink>AUTRE NOMBRE</span></button>`;
  const cls = `pickp${cream ? ' zcream' : ''}`;
  const isMult = z => z === 'd' || z === 't';
  if (zonePad() === 'rangees') {
    const N = zones.length;
    // Tranche du secteur : un trapèze continu, large au bord (en haut), découpé en une part par rangée.
    const slice = (i, z) => {
      const w0 = 40 - i * (24 / N), w1 = 40 - (i + 1) * (24 / N);
      return `<span class="zsl" aria-hidden="true"><svg viewBox="0 0 46 100" preserveAspectRatio="none"><path class="${isMult(z) ? 'zm' : 'zs'}" d="M${23 - w0 / 2} 0L${23 + w0 / 2} 0L${23 + w1 / 2} 100L${23 - w1 / 2} 100Z"/></svg></span>`;
    };
    return `<div class="${cls} zrows" style="--zn:${N}" role="group" aria-label="Zone du ${n}">${zones.map(([z, big, word, bars, dir], i) => `<button type="button" class="key zr z-${z}${az === z || (az === 's' && z === 's') ? ' aimz' : ''}" data-act="tr-zonepick" data-arg="${z}" data-press aria-label="${word} ${n}">${slice(i, z)}<span class="zlab"><b>${big}</b><span class="zw"><small>${word}</small>${dir ? `<small class="zdir">${dir}</small>` : ''}</span></span><span class="zbars">${'<i></i>'.repeat(bars)}</span></button>`).join('')}${back}</div>`;
  }
  // C : bandes d'une part de cible (pointe vers le bull, sous l'écran), de l'intérieur vers le bord.
  const W = 480, H = 236, RS = 511, cx = 240, cy = 486, A = 0.5;
  const band = (r0, r1) => {
    const p = (r, k) => [cx + Math.sin(k * A) * r * RS, cy - Math.cos(k * A) * r * RS].map(v => v.toFixed(1)).join(' ');
    return `M${p(r0, -1)}L${p(r1, -1)}A${(r1 * RS).toFixed(1)} ${(r1 * RS).toFixed(1)} 0 0 1 ${p(r1, 1)}L${p(r0, 1)}A${(r0 * RS).toFixed(1)} ${(r0 * RS).toFixed(1)} 0 0 0 ${p(r0, -1)}Z`;
  };
  const sTone = cream ? 'cream' : 'black', mTone = cream ? 'green' : 'red';
  const byZ = Object.fromEntries(zones.map(z => [z[0], z]));
  const order = ring ? ['in', 't', 'out', 'd'] : ['s', 't', 's', 'd'];
  const R = [[0.5, 0.61], [0.61, 0.72], [0.72, 0.83], [0.83, 0.94]];
  const body = order.map((z, i) => {
    const [, big, word, bars] = byZ[z];
    const [r0, r1] = R[i];
    const tone = isMult(z) ? mTone : sTone;
    const ink = tone === 'cream' ? 'zi-d' : 'zi-l';
    const y = cy - ((r0 + r1) / 2) * RS;
    const x = bars ? cx - 22 : cx;
    return `<path class="zb t-${tone}${az === z ? ' aimz' : ''}" d="${band(r0, r1)}" data-act="tr-zonepick" data-arg="${z}" data-press role="button" aria-label="${word} ${n}"/>
      <text class="zt ${ink}" x="${x}" y="${(y + 2).toFixed(1)}" text-anchor="middle">${big}</text>
      <text class="zt zt-w ${ink}" x="${x}" y="${(y + 17).toFixed(1)}" text-anchor="middle">${word}</text>
      ${Array.from({ length: bars }, (_, j) => `<rect class="${ink}" x="${cx + 30}" y="${(y - 8 - (bars - 2) * 3 + j * 7).toFixed(1)}" width="30" height="4"/>`).join('')}`;
  }).join('');
  return `<div class="${cls} zsec" role="group" aria-label="Zone du ${n}"><svg class="zwedge" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>${back}</div>`;
}

/**
 * Pavé (portrait). Lot 8 du 23/11 (1.3) : saisie en deux temps, précise à la case — le nombre, puis sa zone (zonePick :
 * rangées ou secteur) : simple (intérieur ou extérieur si réglé), double, triple. 25, 50 et HORS CIBLE
 * en un appui ; un hors cible au pavé n'a pas de position (compté, sans distance). ANNULER pendant le choix de la zone
 * revient au choix du nombre.
 */
function keyPad(r, st) {
  const pick = r.ui.pick;
  let grid;
  if (pick) grid = zonePick(pick, aimedZone(st));
  else {
    const rows = [];
    for (let row = 0; row < 4; row++) {
      rows.push(`<div class="krow nums">${[1, 2, 3, 4, 5].map(c => {
        const k = row * 5 + c;
        return `<button type="button" class="key" data-act="tr-key" data-arg="${k}" data-press><span class="kl" data-shrink>${k}</span></button>`;
      }).join('')}</div>`);
    }
    grid = rows.join('');
  }
  const canUndo = pick || r.darts.length || (r.blocks && r.blocks.length > 1);
  return `<section class="pad-k trpad two-step${pick ? ' picking' : ''}" aria-label="Saisie">
      <p class="pstep">${pick ? `<b>${pick}</b> · CHOISIS LA ZONE` : 'NOMBRE, PUIS SA ZONE'}</p>
      ${grid}
      <div class="krow last">
        <button type="button" class="key bull" data-act="tr-key" data-arg="25" data-press><span class="kl" data-shrink>25</span></button>
        <button type="button" class="key" data-act="tr-key" data-arg="50" data-press><span class="kl" data-shrink>50</span></button>
        <button type="button" class="key zero" data-act="tr-key" data-arg="0" data-press>0<small>HORS CIBLE</small></button>
        <button type="button" class="key undo" data-act="tr-undo" data-press ${canUndo ? '' : 'disabled'}>${ico('undo')}<span class="kl" data-shrink>ANNULER</span></button>
      </div>
    </section>`;
}

function band(r) {
  const g = cleanGame(r.exercise, r.game);
  const what = r.exercise === 'libre' ? 'LIBRE' : r.exercise === 'x01' ? `${g.startScore} · ${g.outMode === 'double' ? 'DOUBLE' : 'SIMPLE'}` : r.exercise === 'cricket' ? 'CRICKET' : EXERCISES[r.exercise].name.toUpperCase();
  return `<header class="tband" data-layer><span class="t ell">ENTRAÎNEMENT · ${esc(what)}</span>
    <button type="button" class="pause" data-act="tr-pause" data-press aria-label="Pause">${ico('pause')}</button></header>`;
}

export function trainingScreen() {
  const r = tr();
  if (!r) { go('#/entrainement', { replace: true }); return ''; }
  const st = trState();
  if (st.done) { go('#/entrainement/fin', { replace: true }); return ''; }
  if (st.game) return gameScreen(r, st);
  const t = st.blocks[st.cur.i];
  const overlays = r.ui.pause ? pauseSheet(r) : r.ui.rules ? rulesSheet(r) : '';
  if (isLandscape()) {
    return `<div class="game land train">
      <div class="lcol">${band(r)}${ruleLine(r)}${aimHead(r, st)}${visitBoxes(r, st)}${liveLine(r, st)}
        <div class="lbtns two">
          <button type="button" class="key zero" data-act="tr-key" data-arg="0" data-press>0<small>HORS CIBLE</small></button>
          <button type="button" class="key undo" data-act="tr-undo" data-press ${r.darts.length || (r.blocks && r.blocks.length > 1) ? '' : 'disabled'}>${ico('undo')}<span class="kl" data-shrink>ANNULER</span></button>
        </div>
      </div>
      <div class="rcol">
        <div class="bwrap" id="tboard">${boardSvg({ size: 400, impacts: blockImpacts(r, st), aim: t, margin: true, label: 'Cible : touchez pour saisir' })}</div>
        <p class="bhint alert" id="bhint" role="status" data-layer hidden></p>
      </div>
      <div class="loupe" id="loupe" data-layer hidden><b class="lz"></b><div class="lens">${plainBoard(true)}<i class="cross"></i></div></div>
      ${overlays}</div>`;
  }
  return `<div class="game port train">
    <div class="toparea">${band(r)}${ruleLine(r)}${aimHead(r, st)}</div>
    <div class="vblock"><div class="vcol">${visitBoxes(r, st)}${liveLine(r, st)}</div>
      <div class="mini-board" aria-hidden="true">${boardSvg({ size: 104, impacts: blockImpacts(r, st), aim: t, label: 'Impacts de la série' })}</div></div>
    ${keyPad(r, st)}${overlays}</div>`;
}

// ------------------------------------------------------------------ jeux en solo (0.14.0) : saisie
const routeText = route => route.map(d => (d.segment === 25 ? (d.multiplier === 2 ? '50' : '25') : `${d.multiplier === 3 ? 'T' : d.multiplier === 2 ? 'D' : ''}${d.segment}`)).join(' · ');
/** Fléchettes de la manche en cours (volée en cours comprise). */
const legDarts = st => st.gs.legs[st.gs.legs.length - 1].visits.reduce((k, v) => k + v.darts.length, 0) + st.visitDarts;

function gameHead(r, st) {
  const gs = st.gs, g = st.setup;
  const legTxt = g.legs > 1 ? `MANCHE ${gs.legNumber}/${g.legs}` : 'MANCHE';
  if (st.game === 'x01') {
    const rem = gs.remaining[0];
    const p = playerById(r.player);
    const route = suggestCheckout(rem, g.outMode, 3 - st.visitDarts, checkoutPrefs(p && p.checkout));
    return `<section class="taim tgame" aria-label="Reste"><div class="tl"><small>RESTE</small><b class="tg" data-shrink>${rem}</b><span class="zl ell">${route ? `FINITION ${esc(routeText(route))}` : `${g.startScore} · SORTIE ${g.outMode === 'double' ? 'DOUBLE' : 'SIMPLE'}`}</span></div>
      <div class="tp"><b>${legDarts(st)}<small> FL.</small></b><span>${legTxt}</span></div></section>`;
  }
  const m = gs.marks[0];
  const closed = CRICKET_TARGETS.filter(t => m[t] >= 3).length;
  const rounds = gs.legs[gs.legs.length - 1].visits.length + 1;
  return `<section class="taim tgame tck" aria-label="Cibles du Cricket"><div class="ckline">${CRICKET_TARGETS.map(t => `<span class="${m[t] >= 3 ? 'shut' : ''}"><small>${t === 25 ? 'B' : t}</small><i>${markSvg(m[t])}</i></span>`).join('')}</div>
    <div class="tp"><b>${closed}<small>/7</small></b><span>FERMÉES<br>${g.legs > 1 ? legTxt : `VOLÉE ${rounds}`}</span></div></section>`;
}

/** Volée affichée d'un jeu : celle en cours, ou la précédente (estompée) tant que la suivante n'a pas commencé. */
function gameShown(r, st) {
  const gs = st.gs;
  if (st.visitDarts || !gs.lastVisit) return { darts: r.darts.slice(st.visitStart), start: st.visitStart, prev: false, v: gs.visit };
  const k = gs.lastVisit.darts.length;
  return { darts: r.darts.slice(r.darts.length - k), start: r.darts.length - k, prev: true, v: gs.lastVisit };
}

function gameVisit(r, st, a) {
  const x = gameShown(r, st);
  const ck = st.game === 'cricket';
  const boxes = [0, 1, 2].map(i => {
    const d = x.darts[i];
    if (!d) return `<div class="dart left${!x.prev && i === x.darts.length ? ' todo' : ''}"></div>`;
    const hit = ck && a.extra.credit[x.start + i] > 0;
    return `<div class="dart done${ck ? (hit ? ' hit' : ' miss') : ''}"><span class="sv" data-shrink>${esc(trainingDartLabel(d))}</span></div>`;
  }).join('');
  const v = x.v || { total: 0, marks: 0 };
  const total = ck ? (v.marks || 0) : v.bust ? 'BUST' : (v.total || 0);
  return `<div class="visit${x.prev ? ' prev' : ''}">${boxes}<div class="total ${x.darts.length ? 'inv' : 'zero'}"><small>${ck ? 'MARQ.' : 'VOLÉE'}</small><span class="tv" data-shrink>${total}</span></div></div>`;
}

function gameLive(r, st, a) {
  const gs = st.gs, x = a.extra;
  const fresh = !st.visitDarts;
  if (st.game === 'x01') {
    if (fresh && gs.lastEvent === 'bust') return `<p class="tlive">BUST · RETOUR À <b>${gs.remaining[0]}</b></p>`;
    if (fresh && gs.lastEvent === 'leg_won') { const l = x.legs[x.legs.length - 1]; return `<p class="tlive">MANCHE ${l.number} GAGNÉE EN <b>${l.darts}</b> FL.</p>`; }
    return `<p class="tlive">${x.average !== null ? `MOY. <b>${dec1(x.average)}</b> · ${r.darts.length} FL.` : 'MOYENNE SUR 3 FLÉCHETTES'}</p>`;
  }
  if (fresh && gs.lastEvent === 'leg_won') { const l = x.legs[x.legs.length - 1]; return `<p class="tlive">MANCHE ${l.number} GAGNÉE EN <b>${l.rounds}</b> VOLÉES</p>`; }
  return `<p class="tlive">${r.darts.length ? `MPR <b>${dec2(x.mpr)}</b> · ${r.darts.length} FL.` : 'MARQUES PAR VOLÉE (MPR)'}</p>`;
}

/**
 * Bandeau du défi d'un X01 solo (lot 8 du 23/11, 5.2) : le défi de la volée (texte court, sans gage : on est seul),
 * puis son résultat jusqu'à la volée suivante ; « main gauche » se déclare (FAIT / PAS FAIT), comme en soirée.
 */
function soloDefiBand(r, st) {
  const d = soloDefiNow(r, st);
  if (!d) return '';
  const def = DEFIS[d.key];
  if (d.open) return `<section class="dfb open" role="status" aria-label="Défi : ${esc(def.short)}"><div class="dfc"><b class="dft" data-shrink><span class="dfl">${ico('flag')}DÉFI</span> ${esc(def.short)}</b>${def.hint ? `<small class="dfh">${esc(def.hint)}</small>` : ''}</div></section>`;
  const x = d.result;
  if (x.declare && x.declared === undefined) {
    return `<section class="dfb res ask" role="status" aria-label="Défi à déclarer">${ico('star', 'ico dfs')}<div class="dfc"><small class="dfl">DÉFI À DÉCLARER</small><b class="dft" data-shrink>${esc(def.short)} ?</b></div>
      <div class="dfask"><button type="button" data-act="tr-defi-decl" data-arg="${d.index}|1">FAIT</button><button type="button" data-act="tr-defi-decl" data-arg="${d.index}|0">PAS FAIT</button></div></section>`;
  }
  return `<section class="dfb res ${x.ok ? 'ok' : 'ko'}" role="status" aria-label="Défi ${x.ok ? 'réussi' : 'raté'}">${ico(x.ok ? 'starf' : 'star', 'ico dfs')}<div class="dfc"><small class="dfl">${x.ok ? 'DÉFI RÉUSSI' : 'DÉFI RATÉ'}</small><b class="dft" data-shrink>${esc(def.short)}</b></div></section>`;
}

function gameScreen(r, st) {
  const a = analyze(r);
  const x = gameShown(r, st);
  const impacts = x.darts.map((d, i) => (x.prev ? { dart: d, old: true } : { dart: d, n: i + 1 }));
  const overlays = r.ui.pause ? pauseSheet(r) : r.ui.rules ? rulesSheet(r) : '';
  if (isLandscape()) {
    return `<div class="game land train trgame">
      <div class="lcol">${band(r)}${soloDefiBand(r, st) || ruleLine(r)}${gameHead(r, st)}${gameVisit(r, st, a)}${gameLive(r, st, a)}
        <div class="lbtns two">
          <button type="button" class="key zero" data-act="tr-key" data-arg="0" data-press>0<small>HORS CIBLE</small></button>
          <button type="button" class="key undo" data-act="tr-undo" data-press ${r.darts.length ? '' : 'disabled'}>${ico('undo')}<span class="kl" data-shrink>ANNULER</span></button>
        </div>
      </div>
      <div class="rcol">
        <div class="bwrap" id="tboard">${boardSvg({ size: 400, impacts, margin: true, label: 'Cible : touchez pour saisir' })}</div>
        <p class="bhint alert" id="bhint" role="status" data-layer hidden></p>
      </div>
      <div class="loupe" id="loupe" data-layer hidden><b class="lz"></b><div class="lens">${plainBoard(true)}<i class="cross"></i></div></div>
      ${overlays}</div>`;
  }
  return `<div class="game port train trgame">
    <div class="toparea">${band(r)}${soloDefiBand(r, st) || ruleLine(r)}${gameHead(r, st)}</div>
    <div class="vblock"><div class="vcol">${gameVisit(r, st, a)}${gameLive(r, st, a)}</div>
      <div class="mini-board" aria-hidden="true">${boardSvg({ size: 104, impacts, label: 'Impacts de la volée' })}</div></div>
    ${keyPad(r, st)}${overlays}</div>`;
}

/** Carte de chaleur d'un ensemble de fléchettes (stats, fin d'un jeu) : { svg, off, total }. */
export function heatBoard(darts, size = 380) {
  const h = heatCounts(darts);
  let max = 0;
  const keys = [];
  for (let s = 1; s <= 20; s++) keys.push([`${s}`, 'i'], [`${s}`, 'o'], [`T${s}`, ''], [`D${s}`, '']);
  keys.push(['25', ''], ['50', '']);
  for (const [k, r] of keys) max = Math.max(max, h.get(k, r));
  const op = c => (max ? Math.pow(c / max, 0.6) : 0);
  return { svg: boardSvg({ size, heat: (k, r) => op(h.get(k, r)), heatScale: heatScale(), cls: 'board', label: 'Carte de chaleur des impacts' }), off: h.off, total: h.total };
}

/** Fléchette saisie (pavé ou cible). */
function play(dart) {
  const r = tr();
  if (!r || r.ui.pause) return;
  if (!trThrow(dart)) { buzz(BUZZ.undo); return; }
  r.ui.pick = null;
  r.ui.loupe = null;
  const st = trState();
  buzz(BUZZ.dart);
  if (st.done) { sound('finish'); go('#/entrainement/fin'); return; }
  if (st.game && st.gs.lastEvent === 'bust') sound('bust');
  else if (st.game && st.gs.lastEvent === 'leg_won') sound('finish');
  else sound(dartSound(dart));
  refresh();
}

/** Appelé par app.js après le rendu de l'écran de saisie : cible au doigt (paysage). */
export function mountTraining() {
  const r = tr();
  const wrap = document.getElementById('tboard');
  if (!r || !wrap) return;
  const label = (x, y) => { const d = segmentAt(x, y); return d ? trainingDartLabel(withRing(d, [x, y])) : Math.hypot(x, y) <= OFF_R ? 'HORS CIBLE' : 'RIEN'; };
  bindBoardInput(wrap, {
    edge: OFF_R,
    canStart: () => !!tr() && !tr().ui.pause && !tr().ui.rules,
    onStart: () => { tr().ui.loupe = null; },
    label,
    onRelease: (x, y) => {
      const d = segmentAt(x, y);
      const pos = [x, y].map(c => Math.round(c * 1000) / 1000);
      if (d) play({ ...withRing(d, pos), pos });
      else if (Math.hypot(x, y) <= OFF_R) play({ segment: 0, multiplier: 1, pos });
      else { buzz(BUZZ.undo); boardHint('EN DEHORS DU DESSIN · RIEN N\'EST COMPTÉ'); }
    },
  });
  if (r.ui.loupe) frozenLoupe(wrap, r.ui.loupe, label, OFF_R);
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

/** Objectif du niveau du joueur (0.13.0) : ligne sous les chiffres. */
function goalLine(r, a) {
  const level = levelOf(allSessions(), r.player).level;
  const g = goalText(r.exercise, level);
  const ok = goalMet(r, a, level);
  return g ? `<p class="goalline${ok ? ' ok' : ''}"><small>OBJECTIF · NIVEAU ${LEVELS[level]}</small><b>${esc(g)}</b><span>${ok === null ? 'séance incomplète' : ok ? '✓ TENU' : 'pas encore'}</span></p>` : '';
}

/** Analyse d'un jeu en solo (0.14.0) : chiffres du jeu, conseils, carte de chaleur, manches, par jeu de fléchettes. */
function gameAnalysisHtml(r, a, key) {
  const x = a.extra;
  const k = (kk, label, value, cls = '') => `<div class="kpi ${cls}" data-k="${kk}"><small>${label}</small><b>${value}</b></div>`;
  const sv = sessionValue(r, a);
  const kpis = [k('value', sv ? sv.label : 'Résultat', sv ? fmtValue(sv) : '—', 'hero wide'), k('darts', 'Fléchettes', String(a.darts))];
  const legsDone = x.legs.filter(l => l.done).length;
  if (x.game === 'x01') {
    kpis.push(k('legs', 'Manches', `${legsDone}<small> / ${x.setup.legs}</small>`));
    kpis.push(k('finish', x.setup.outMode === 'double' ? 'Finition au double' : 'Finition', x.finishDarts ? `${pctOf(x.finishRate)}<small> · ${x.finishHits}/${x.finishDarts}</small>` : '—'));
    kpis.push(k('triples', 'Triples', pctOf(x.tripleRate)));
    kpis.push(k('doubles', 'Doubles', pctOf(x.doubleRate)));
    kpis.push(k('best', 'Meilleure volée', String(x.bestVisit)));
    kpis.push(k('tons', '100 et plus', String(x.ton + x.ton40 + x.max)));
    kpis.push(k('first9', '9 premières (moy.)', dec1(x.first9)));
    kpis.push(k('busts', 'Bust', String(x.busts)));
    if (x.defis && x.defis.length) kpis.push(k('defis', 'Défis réussis', `${x.defis.filter(d => d.ok).length}<small> / ${x.defis.length}</small>`));
  } else {
    kpis.push(k('rounds', 'Volées', String(x.legs.reduce((n, l) => n + l.rounds, 0))));
    kpis.push(k('legs', 'Manches', `${legsDone}<small> / ${x.setup.legs}</small>`));
    kpis.push(k('marks', 'Marques', String(x.marks)));
    kpis.push(k('triples', 'Triples', pctOf(x.tripleRate)));
    kpis.push(k('doubles', 'Doubles', pctOf(x.doubleRate)));
    kpis.push(k('best', 'Meilleure volée', `${x.bestVisit}<small> marques</small>`));
    kpis.push(k('bulls', 'Bulls (25 · 50)', String(x.bulls)));
  }
  kpis.push(k('off', 'Hors cible', String(a.off)));
  if (kpis.length % 2 === 0) kpis.push(k('pts', 'Points marqués', String(r.darts.reduce((n, d) => n + pointsOf(d), 0))));
  const hb = heatBoard(r.darts, 260);
  const legs = x.game === 'x01'
    ? `<table class="sectab trtab"><thead><tr><th>Manche</th><th>Fl.</th><th>Moy.</th><th>Finition</th></tr></thead><tbody>${x.legs.map(l => `<tr><th>${l.number}</th><td>${l.darts}</td><td>${dec1(l.average)}</td><td>${l.done ? l.finish : '—'}</td></tr>`).join('')}</tbody></table>`
    : `<table class="sectab trtab"><thead><tr><th>Manche</th><th>Volées</th><th>Fl.</th><th>MPR</th></tr></thead><tbody>${x.legs.map(l => `<tr><th>${l.number}${l.done ? '' : ' …'}</th><td>${l.rounds}</td><td>${l.darts}</td><td>${dec2(l.mpr)}</td></tr>`).join('')}</tbody></table>
       <div class="sec">Marques par cible</div><div class="clockg">${CRICKET_TARGETS.map(t => `<span><small>${t === 25 ? 'B' : t}</small><b>${x.marksByTarget[t]}</b></span>`).join('')}</div>`;
  const bySet = x.bySet ? `<div class="sec">Par jeu de fléchettes</div><table class="sectab trtab"><thead><tr><th>Jeu</th><th>Fl.</th><th>${x.game === 'x01' ? 'Moy.' : 'MPR'}</th><th>T %</th><th>D %</th></tr></thead><tbody>
    ${x.bySet.map(y => `<tr><th class="ell">${esc(y.setId ? (dartSetById(y.setId) || { name: '?' }).name : 'Sans jeu noté')}</th><td>${y.darts}</td><td>${x.game === 'x01' ? dec1(y.value) : dec2(y.value)}</td><td>${pctOf(y.triples / y.n)}</td><td>${pctOf(y.doubles / y.n)}</td></tr>`).join('')}</tbody></table>` : '';
  return `<div class="kpis">${kpis.join('')}</div>${goalLine(r, a)}
    <div class="sec">Analyse du coach${infoBtn(`tr-an-${key}`)}</div>
    ${infoBox(`tr-an-${key}`, x.game === 'x01'
      ? '<b>Moyenne</b> : points marqués pour 3 fléchettes (un bust compte 0). <b>Finition</b> : fléchettes lancées quand une seule pouvait finir (un double en sortie double), et combien ont fini. <b>Triples</b>, <b>doubles</b> : part des fléchettes dans un triple, dans un double (le 50 compte comme double).'
      : '<b>MPR</b> : marques par volée de 3 fléchettes ; seules comptent celles qui ferment une cible (seul, rien ne rapporte de points). <b>Triples</b>, <b>doubles</b> : part des fléchettes dans un triple, dans un double (le 50 compte comme double).')}
    ${messagesHtml(a)}
    <div class="sec">Carte de chaleur <span class="n">${hb.total} fl.</span></div>
    <div class="heatbox">${hb.svg}</div>${hb.off ? `<p class="note center">${plural(hb.off, 'fléchette', 'fléchettes')} hors cible, non dessinée${hb.off > 1 ? 's' : ''}.</p>` : ''}
    <div class="sec">Manches</div>${legs}${bySet}`;
}

/** Corps de l'analyse d'une séance (fin et détail). */
function analysisHtml(r, a, key) {
  if (a.game) return gameAnalysisHtml(r, a, key);
  const ex = EXERCISES[r.exercise] || EXERCISES.libre;
  const sv = sessionValue(r, a);
  const k = (kk, label, value, cls = '') => `<div class="kpi ${cls}" data-k="${kk}"><small>${label}</small><b>${value}</b></div>`;
  const kpis = [];
  const unit = ex.fun ? FUN[r.exercise].unit : 'fl.';
  kpis.push(k('value', sv ? sv.label : 'Résultat', sv ? fmtValue(sv) + (sv.fmt === 'int' ? `<small> ${esc(unit)}</small>` : '') : a.done ? '—' : 'INCOMPLET', 'hero wide'));
  kpis.push(k('darts', 'Fléchettes', String(a.darts)));
  if (ex.fun) { /* le score du jeu est le chiffre principal */ }
  else if (ex.clock && ex.clock.max) kpis.push(k('reached', 'Atteint', `D${a.extra.reached}`));
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
  const groups = ex.clock || ex.fun ? [{ s: 0, z: 'any', darts: r.darts, bias: null, label: 'Toutes les fléchettes' }]
    : a.perTarget.map(t => ({ ...t, darts: dartsOfTarget(r, t), label: `${targetLabel(t)} : ${t.hits}/${t.darts}` }));
  const boards = `<div class="tboards n${Math.min(groups.length, 3)}">${groups.map(g => `<figure>${analysisBoard(g, g.darts, g.bias, groups.length > 1 ? 160 : 260, g.label)}<figcaption>${esc(g.label)}</figcaption></figure>`).join('')}</div>`;
  let detail = '';
  if (ex.fun) detail = funDetail(r, a);
  else if (ex.clock) {
    detail = ex.clock.max
      ? `<div class="sec">Doubles</div><div class="clockg">${a.extra.perNumber.map(x => `<span class="${x.hit ? '' : 'open'}"><small>D${x.s}</small><b>${x.hit ? `✓${x.darts}` : '—'}</b></span>`).join('')}</div>`
      : `<div class="sec">Fléchettes par numéro</div><div class="clockg">${a.extra.perNumber.map(x => `<span class="${x.hit ? '' : 'open'}"><small>${x.s}</small><b>${x.darts}</b></span>`).join('')}</div>`;
  } else if (ex.metric === 'average') {
    detail = `<div class="sec">Volées</div><div class="clockg">${a.extra.visits.map((v, i) => `<span><small>${i + 1}</small><b>${v}</b></span>`).join('')}</div>`;
  }
  const goal = goalLine(r, a);
  // Par jeu de fléchettes, quand il a changé pendant la séance.
  const bySet = a.extra.bySet ? `<div class="sec">Par jeu de fléchettes</div><table class="sectab trtab"><thead><tr><th>Jeu</th><th>Fl.</th><th>Préc.</th><th>Grp.</th></tr></thead><tbody>
    ${a.extra.bySet.map(x => `<tr><th class="ell">${esc(x.setId ? (dartSetById(x.setId) || { name: '?' }).name : 'Sans jeu noté')}</th><td>${x.darts}</td><td>${pctOf(x.rate)}</td><td>${x.points >= 3 && x.spread !== null ? dec1(x.spread / 10) : '—'}</td></tr>`).join('')}</tbody></table>` : '';
  return `<div class="kpis">${kpis.join('')}</div>${goal}
    ${`<div class="sec">Analyse du coach${infoBtn(`tr-an-${key}`)}</div>`}
    ${infoBox(`tr-an-${key}`, 'Écarts mesurés sur une vraie cible (en centimètres) : chaque fléchette est placée au point touché (saisie sur la cible) ou au milieu de sa zone (saisie au pavé). <b>Croix</b> : point visé ; <b>carré</b> : centre des impacts ; le trait entre les deux est l\'écart moyen. <b>Groupement</b> : distance moyenne des fléchettes à leur centre (plus c\'est petit, plus elles sont groupées).')}
    ${messagesHtml(a)}
    ${boards}${detail}${bySet}`;
}

/** Détail d'un jeu de cible : une case par secteur, trou, manche ou volée. */
function funDetail(r, a) {
  const x = a.extra.fun.extra;
  const cell = (k, v, open = false) => `<span class="${open ? 'open' : ''}"><small>${k}</small><b>${v}</b></span>`;
  switch (r.exercise) {
    case 'serpent': case 'rebours': return `<div class="sec">Fléchettes par secteur</div><div class="clockg">${x.per.filter(p => p.darts).map(p => cell(p.s, p.darts, !p.hit)).join('')}</div>`;
    case 'golf': return `<div class="sec">Trous</div><div class="clockg">${x.holes.map(h => cell(`T${h.s}`, h.strokes, h.strokes === 5)).join('')}</div>`;
    case 'shanghai': return `<div class="sec">Manches</div><div class="clockg">${x.rounds.map(m => cell(m.s, `${m.points}${m.shanghai ? '+100' : ''}`)).join('')}</div>`;
    case 'moitie': return `<div class="sec">Volées (total après chacune)</div><div class="clockg">${x.rounds.map(m => cell(m.s === 25 ? 'B' : m.s, m.halved ? `÷2 ${m.total}` : m.total, m.halved)).join('')}</div>`;
    case 'roulette': return `<div class="sec">Volées</div><div class="clockg">${x.rounds.map(m => cell(m.s, m.points, !m.points)).join('')}</div>`;
    case 'mur60': return `<div class="sec">Volées</div><div class="clockg">${x.rounds.map((m, i) => cell(i + 1, m.points, !m.brick)).join('')}</div>`;
    case 'plushaut': return `<div class="sec">Volées</div><div class="clockg">${x.rounds.map((m, i) => cell(i + 1, m.points, m.ok === false)).join('')}</div>`;
    case 'killer': return `<div class="sec">Numéros</div><div class="clockg">${cell(`TOI ${x.mine}`, `${x.marks}/3`)}${x.foes.map((f, i) => cell(f, x.lives[i] ? `${x.lives[i]} ♥` : '✕', !!x.lives[i])).join('')}</div>`;
    default: return '';
  }
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
  const n = r.mode === 'coach' ? (nextFor(a, r, level) || suggestNext(list, r.player, level)) : a.game ? a.next : null;
  if (!n) return '';
  const ex = EXERCISES[n.key];
  return `<div class="propose"><small>${a.game ? 'À TRAVAILLER' : 'EXERCICE SUIVANT'}</small><b>${esc(ex.name)}</b><span>${esc(ex.short)} · ${esc(n.why)}</span></div>
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
      ${featChips(r)}
      <div class="sec">Et maintenant</div>
      <div class="endbtns">
        ${nextCard(r, a, true)}
        <button type="button" class="btn ${r.mode === 'coach' || (a.game && a.next) ? '' : 'accent big'}" data-act="tr-finish">${ico('check')} TERMINER LA SÉANCE</button>
        ${a.game ? `<button type="button" class="btn" data-act="tr-finish-again">${ico('play')} REJOUER${gameLabel(r) ? ` · ${esc(gameLabel(r).toUpperCase())}` : ''}</button>` : ''}
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
  const again = r.exercise === 'libre' || isGameSession(r)
    ? `<button type="button" class="btn" data-act="tr-again" data-arg="${esc(r.id)}">${ico('target')} REFAIRE CETTE SÉANCE</button>`
    : `<button type="button" class="btn" data-act="tr-start" data-arg="${r.exercise}">${ico('target')} REFAIRE : ${esc(EXERCISES[r.exercise].name.toUpperCase())}</button>`;
  const resume = r.stopped && !st.done ? `<button type="button" class="btn accent stack" data-act="tr-reopen" data-arg="${esc(r.id)}">${ico('play')} REPRENDRE CETTE SÉANCE<small>${store.tr ? 'la séance en cours sera arrêtée' : `${st.game ? 'la partie reprend où elle s\'était arrêtée' : `il reste ${st.clock ? 'des numéros' : plural(st.blocks.reduce((n, b) => n + b.n, 0) - r.darts.length, 'fléchette', 'fléchettes')}`}`}</small></button>` : '';
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
      ${featChips(r)}
      ${managePanel(r)}
    </div></div>`;
}

export const inputs = {
  'tr-note'(value, el) { updateTraining(el.dataset.id, { note: value }); },
};

// ------------------------------------------------------------------ actions
export const actions = {
  'tr-player'(id) { saveTrSetup({ player: id }); refresh(); },
  'tr-card'(id) { if (openCards.has(id)) openCards.delete(id); else openCards.add(id); refresh(); },
  'tr-set'(id) { saveTrSetup({ setId: id || null }); refresh(); },
  'tr-fold'() { othersOpen = !othersOpen; refresh(); },
  'tr-fold-fun'() { funOpen = !funOpen; refresh(); },
  'tr-change-set'() { const r = tr(); if (r) { r.ui.confirm = 'set'; refresh(); } },
  'tr-set-now'(id) { const r = tr(); if (!r) return; if (trChangeSet(id || null)) { buzz(BUZZ.dart); sound('validate'); } r.ui.confirm = false; r.ui.pause = false; refresh(); },
  'tr-mode'(m) { saveTrSetup({ mode: ['libre', 'jeu'].includes(m) ? m : 'coach' }); refresh(); },
  'tr-game'(arg) {
    const [field, val] = String(arg).split('|');
    const g = { ...trSetup().game };
    if (field === 'kind') g.kind = val === 'cricket' ? 'cricket' : 'x01';
    else if (field === 'start') g.startScore = Number(val);
    else if (field === 'out') g.outMode = val === 'single' ? 'single' : 'double';
    else if (field === 'legs') g.legs = Number(val);
    else if (field === 'defis') { if (val === 'aucun') delete g.defis; else g.defis = val; }
    saveTrSetup({ game: { kind: g.kind, ...cleanGame('x01', g) } });
    refresh();
  },
  'tr-pick'(arg) {
    const [who, field, val] = String(arg).split('|');
    const t = who === 'add' ? addDraft : { ...trSetup().free };
    if (!t) return;
    if (field === 's') { t.s = Number(val); if (!ZONES_FOR(t.s).includes(t.z)) t.z = 'any'; }
    else if (field === 'z') t.z = val;
    else if (field === 'n') t.n = volleyCount(val);
    if (who === 'setup') saveTrSetup({ free: t });
    refresh();
  },
  'tr-start'(key) { if (EXERCISES[key]) startFrom(key); },
  'tr-key'(k) {
    const r = tr();
    if (!r || r.ui.pause) return;
    const n = Number(k);
    if (k === '0') return play(makeDart(0, 1));
    if (k === '50') return play(makeDart(25, 2));
    if (k === '25') return play(makeDart(25, 1));
    // Lot 8 du 23/11 (1.3) : un nombre de 1 à 20, puis sa zone (tr-zonepick).
    if (n >= 1 && n <= 20) { r.ui.pick = n; buzz(BUZZ.dart); refresh(); }
  },
  'tr-defi-decl'(arg) {
    const r = tr();
    if (!r) return;
    const [i, v] = String(arg).split('|');
    r.defiDecl = { ...(r.defiDecl || {}), [i]: v === '1' };
    saveTr();
    refresh();
  },
  'tr-zonepick'(z) {
    const r = tr();
    if (!r || r.ui.pause || !r.ui.pick) return;
    const n = r.ui.pick;
    if (z === 'd' || z === 't') return play(makeDart(n, z === 'd' ? 2 : 3));
    if (z === 'in' || z === 'out') return play({ segment: n, multiplier: 1, ring: z });
    if (z === 's') return play({ segment: n, multiplier: 1 });
  },
  'tr-pick-cancel'() { const r = tr(); if (r) { r.ui.pick = null; refresh(); } },
  'tr-rules'() { const r = tr(); if (r) { r.ui.rules = !r.ui.rules; r.ui.pause = false; refresh(); } },
  'tr-rules-close'() { const r = tr(); if (r) { r.ui.rules = false; refresh(); } },
  'tr-undo'() {
    const r = tr();
    if (r && r.ui.pick) { r.ui.pick = null; buzz(BUZZ.undo); refresh(); return; }
    if (trUndo()) { buzz(BUZZ.undo); sound('undo'); }
    refresh();
  },
  'tr-undo-end'() { trUndo(); buzz(BUZZ.undo); sound('undo'); addDraft = null; go('#/entrainement/jeu'); },
  'tr-pause'() { const r = tr(); if (r) { r.ui.pause = true; r.ui.confirm = false; refresh(); } },
  'tr-resume'() { const r = tr(); if (r) { r.ui.pause = false; r.ui.confirm = false; refresh(); } },
  'tr-delete'() { const r = tr(); if (r) { r.ui.confirm = 'delete'; refresh(); } },
  'tr-confirm-no'() { const r = tr(); if (r) { r.ui.confirm = false; refresh(); } },
  'tr-delete-yes'() { const r = tr(); if (r) deleteTrainings([r.id]); go('#/entrainement'); },
  'tr-stop'() { const rec = closeTraining({ stopped: true }); go(rec ? `#/entrainement/seance/${rec.id}` : '#/entrainement'); },
  'tr-finish'() { closeTraining(); addDraft = null; sound('validate'); go('#/entrainement'); },
  'tr-finish-next'(key) { closeTraining(); addDraft = null; startFrom(key); },
  'tr-finish-again'() { const r = tr(); if (!r || !isGameSession(r)) return; closeTraining(); startFrom(r.exercise, r.game); },
  'tr-add'() { const st = trState(); const last = st.blocks[st.blocks.length - 1]; addDraft = { s: last.s, z: last.z, n: volleyCount(last.n) }; refresh(); },
  'tr-add-cancel'() { addDraft = null; refresh(); },
  'tr-add-go'() { if (addDraft && trAddBlock(addDraft, addDraft.n)) { addDraft = null; go('#/entrainement/jeu'); } },
  'tr-again'(id) {
    const r = trainingById(id);
    if (!r) return;
    if (isGameSession(r)) { startFrom(r.exercise, r.game); return; }
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
