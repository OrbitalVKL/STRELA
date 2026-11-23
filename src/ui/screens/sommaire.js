// Sommaire de maquette (?maquette dans l'adresse) : lien direct vers chaque écran et vers les états
// difficiles à provoquer. Les états de jeu sont fabriqués avec le vrai moteur ; l'annonce « À TOI » et la loupe,
// qui ne durent qu'un instant, restent figées jusqu'à la prochaine touche. Tout est en mémoire (données fictives de
// maquette.js) : la base du téléphone n'est jamais ouverte. Chargé seulement avec ?maquette (import dynamique).
import { store, startGame, freshUi, currentState, deletePlayer, startCricket, freshCkUi } from '../store.js';
import { resetMock, ensureExtraPlayers, givePhoto, SAMPLE_PHOTO, SAMPLE_SIZE } from '../maquette.js';
import { openCrop, PHOTO_ERRORS } from './photo.js';
import { polar, sectorAngle, RINGS } from '../../engine/board.js';
import { isDeletedId } from '../../engine/players.js';
import { openDraft } from './players.js';
import { selectLogCell, presetHistory } from './history.js';
import { celebrate } from './game.js';
import { resetVowels } from '../vowels.js';
import { computeState } from '../../engine/x01.js';
import { correctDart } from '../../engine/correct.js';
import { topBar, ico } from '../dom.js';
import { parseDart } from '../../engine/darts.js';
import { simulateGame, MOCK_PLAYERS, EXTRA_PLAYERS } from '../mock.js';
import { go } from '../nav.js';
import { isDark, applyTheme, presetBackup } from './settings.js';
import { makeBackup, parseBackup } from '../../data/backup.js';
import { saveSetting } from '../store.js';
import { seasonMock } from '../maquette.js';
import { presetStats2 } from './v2/stats2.js';
import { presetHonour, presetBadgeSheet } from '../honours.js';
import { presetDashFolds, presetDashTourAsk } from './v2/soireedash.js';
import { presetHistory2 } from './v2/history2.js';
import { presetSettings2 } from './settings.js';
import { startTraining, freshTrUi } from '../store.js';
import { trainingState as trainingStateFn } from '../../engine/training.js';
import { presetTraining, presetDetail } from './training.js';
import { presetTrainStats } from './trainstats.js';
import { presetTrainSheet } from '../trainhonours.js';
import { presetInfo } from '../info.js';
import { aimedDart, rng, simulateSoloX01, simulateSoloCricket } from '../mock.js';

// Lot 7 : jouer jusqu'au bout à 4 (301, sortie simple) ; après PO1, Guillaume, Mathilde et Karim sont à 80, Sacha à 301.
const PLAYON = () => ({ ...cfg(['p1', 'p2', 'p3', 'p4'], 301, 'single'), playOn: true });
const PO1 = 'T20 T20 T20  T20 T20 T20  T20 T20 T20  0 0 0  S20 S20 S1  S20 S20 S1  S20 S20 S1  0 0 0';
// Verres (lot 7.1 : avec leur place dans la partie, `at` = fléchettes jouées à ce moment)
const DRINKS = () => { const h = 3600e3, now = Date.now(); return { p1: [{ t: now - 2 * h, at: 0 }], p2: [{ t: now - h, at: 0 }, { t: now - 0.5 * h, at: 2, v: 0.5 }, { t: now - 0.1 * h, at: 3 }] }; }; // p2 : une pinte (0.8.2)
const ds = text => text.trim().split(/\s+/).filter(Boolean).map(parseDart);
const cfg = (players, startScore = 501, outMode = 'double', legsToWin = 1) => ({ players, startScore, outMode, legsToWin });

/** Partie fabriquée ; `pending` : la dernière volée close attend VALIDER (sinon elle est déjà validée). */
function setGame(setup, notation, ui = {}, pending = false) {
  ensureExtraPlayers(setup.players);
  store.soiree = null; // lot 7.6 : la partie fabriquée n'est d'aucune soirée (mockSoiree() l'y met)
  store.current = null; // la partie fabriquée remplace la précédente sans la ranger dans l'historique
  startGame(setup);
  store.current.darts = Array.isArray(notation) ? notation : ds(notation);
  store.current.validated = pending ? 0 : store.current.darts.length;
  store.current.ui = { ...freshUi(), ...ui };
  return currentState();
}

// Lot 10 : une partie de Cricket fabriquée (remplace celle en cours, sans rien ranger).
function setCk(players, notation, { mode = 'points', legsToWin = 1, ui = {}, pending = false } = {}) {
  ensureExtraPlayers(players);
  store.current = null;
  store.ck = null;
  store.soiree = null;
  startCricket({ players, ckMode: mode, legsToWin, shuffle: false });
  store.ck.darts = ds(notation);
  store.ck.validated = pending ? 0 : store.ck.darts.length;
  store.ck.ui = { ...freshCkUi(), ...ui };
  return '#/cricket';
}
const CK2 = 'T20 S20 0  T19 S19 0  T18 D20 S17  S20 S20 S19  S16 D18 0  T17 0 S1';
const CK4 = 'T20 S20 0  T19 S19 0  T18 D20 S17  S20 S20 S19  S16 D18 0  T17 0 S1  S25 0 0  D16 S16 0  S15 S15 S15  0 0 0  T19';

// Impacts réels (saisie sur la cible) : volée de Guillaume T20 · 20 · T5 en position, Mathilde T19 · 19 · 3.
const at = (seg, r, da = 0) => polar(sectorAngle(seg) + da, r).map(v => Math.round(v * 1000) / 1000);
const withPos = (notation, points) => ds(notation).map((d, i) => (points[i] ? { ...d, pos: points[i] } : d));
const MID_T = (RINGS.tripleIn + RINGS.tripleOut) / 2;
const LIVE = () => withPos('T20 S20 T5 T19 S19 S3 T20 S20', [
  at(20, MID_T, -3), at(20, 0.3, 4), at(5, MID_T + 0.03, 2), at(19, MID_T - 0.02, -2), at(19, 0.75), at(3, 0.32, 3), at(20, MID_T + 0.02, 1.5), at(20, 0.72, -4),
]);

// Partie à 2 terminée (301, sortie double) avec des ratés (0), un bust (Guillaume : 20 puis 19, il reste 1) et une
// finition D20.
const TWO = 'T20 T20 T20 20 0 20 T20 S20 S1 T20 T20 S1 S20 S19 T20 0 0 D20';
// 8 joueurs, 2 manches à gagner : la première jouée par le lanceur simulé (tirage 14 : 3 bust), puis 2 tours.
const EIGHT = ['p1', 'p2', 'p3', 'p4', 'p5', 'p7', 'p8', 'p9'];
const eightGame = () => {
  const config = cfg(EIGHT, 301, 'double', 2);
  const leg1 = simulateGame({ ...config, legsToWin: 1 }, EIGHT.map(() => 0.35), 14);
  return { config, darts: [...leg1, ...ds('T20 S20 S5  S20 S1 S5  T19 S19 S3  S20 S20 S20  S5 S5 S1  T20 T20 S20  S1 S1 S1  S20 S5 S20  T20 S1')] };
};
/** Range une partie terminée dans l'historique (sommaire) et renvoie son identifiant. */
function storeGame(id, config, darts) {
  ensureExtraPlayers(config.players);
  store.games = [{ id, startedAt: Date.now() - 3600e3, config, darts, abandoned: false }, ...store.games.filter(g => g.id !== id)];
  return id;
}
/** Sauvegarde fictive (les données de la maquette, plus un joueur et une partie absents d'ici). */
function mockBackup() {
  const extra = { id: 'px', name: 'Nadia', avatar: { kind: 'initials', color: 5 }, archived: false };
  const g = { id: 'gx-import', startedAt: Date.now() - 86400e3 * 40, endedAt: Date.now() - 86400e3 * 40 + 1800e3, config: cfg(['p1', 'px'], 301), darts: ds('T20 T20 T20 20 20 20 T20 T11 D14'), validated: 9, abandoned: false };
  return parseBackup(JSON.stringify(makeBackup({ players: [...store.players, extra], games: [...store.games, g], current: null, display: { ...store.settings }, lastSetup: null }, { app: '0.3.0', now: new Date(2026, 9, 30, 21, 18) })));
}
/** Problème d'enregistrement simulé (le sommaire n'a pas de base : storageIssue() le montre quand même). */
function mockIssue(db) {
  Object.assign(store.db, { openCode: null, writeFail: null, error: null }, db);
  store.mockIssue = true;
}

/** Écran de secours (src/ui/rescue.js), montré comme un écran ordinaire : RECHARGER, EXPORTER LA SAUVEGARDE. */
export const secours = () => (window.strelaRescueHtml ? window.strelaRescueHtml('TypeError: exemple d\'erreur inattendue (maquette)') : '');

/** Soirée fictive (lot 7.6) : 4 joueurs depuis 2 h, deux parties déjà jouées avec des verres, un verre hors partie.
 *  `game` : la partie en cours (déjà fabriquée) en fait partie, avec les verres d'avant. */
function mockSoiree({ game = false } = {}) {
  const now = Date.now(), h = 3600e3;
  ensureExtraPlayers(['p1', 'p2', 'p3', 'p4']);
  store.soiree = { id: 'soiree-1', startedAt: now - 2 * h, players: ['p1', 'p2', 'p3', 'p4'], drinks: { p3: [{ t: now - 1.5 * h }] } };
  const played = [
    { id: 'gs1', startedAt: now - 1.8 * h, endedAt: now - 1.4 * h, config: cfg(['p1', 'p2', 'p3'], 301), darts: ds('T20 T20 T20 20 1 5 T19 S7 S3 T20 T11 D14'), validated: 12, abandoned: false, soiree: 'soiree-1',
      drinks: { p1: [{ t: now - 1.7 * h, at: 3 }, { t: now - 1.5 * h, at: 9 }], p2: [{ t: now - 1.6 * h, at: 6 }] } },
    { id: 'gs2', startedAt: now - 1.2 * h, endedAt: now - 0.8 * h, config: cfg(['p2', 'p4'], 301), darts: ds('T20 T20 T20 20 20 20 T20 T11 D14'), validated: 9, abandoned: false, soiree: 'soiree-1',
      drinks: { p2: [{ t: now - h, at: 3 }], p4: [{ t: now - 0.9 * h, at: 6 }] } },
  ];
  store.games = [...played, ...store.games.filter(g => !g.soiree)];
  if (game && store.current) {
    store.current.soiree = 'soiree-1';
    store.current.drinksBefore = { p1: 2, p2: 2, p3: 1 };
  }
}

/** Préférences de finition d'un joueur fictif : D16 et bull évité. */
const prefer = id => { const p = store.players.find(q => q.id === id); if (p) p.checkout = { double: 16, avoidBull: true }; };
const visitIndex = (config, darts, pick) => computeState(config, darts).visits.findIndex(pick);

// Lot 7.8 (refonte, dans l'appli depuis la 0.8.0) : une saison de soirées, pour voir les nouveaux écrans remplis.
/** 0.11.2 : une TOURNÉE SERVIE (même instant pour tous) dans la première partie de la soirée `sid` (données fictives). */
function mockTournee(sid) {
  const g = store.games.filter(x => x.soiree === sid).sort((a, b) => a.startedAt - b.startedAt)[0];
  if (!g) return;
  const t = g.startedAt + 1234;
  g.drinks = { ...(g.drinks || {}) };
  for (const id of g.config.players) g.drinks[id] = [...(g.drinks[id] || []), { t, at: g.darts.length }];
}
const v78 = (route, prep = () => {}) => () => { seasonMock(); presetStats2(); presetHistory2(); presetSettings2(); prep(); return route; };

// Lot 8 : séance d'entraînement fabriquée (remplace celle en cours) ; `n` fléchettes tirées autour des cibles, ou la notation.
function setTr(exercise, n, { blocks = null, ui = {}, darts = null } = {}) {
  store.tr = null;
  store.trSetup = { player: 'p1', setId: 'ds-torpedo-22', mode: exercise === 'libre' ? 'libre' : 'coach' };
  startTraining({ player: 'p1', setId: 'ds-torpedo-22', mode: exercise === 'libre' ? 'libre' : 'coach', exercise, ...(blocks ? { blocks } : {}) }, Date.now() - 600e3);
  const r = rng(42);
  if (darts) store.tr.darts = darts;
  else {
    let num = 1;
    for (let i = 0; i < n; i++) {
      const st = trStateOf();
      if (!st.cur) break;
      const t = st.blocks[st.cur.i];
      const d = aimedDart(r, t, { pos: i % 2 === 0 });
      store.tr.darts.push(d);
      if (exercise === 'horloge' && d.segment === num) num++;
    }
  }
  store.tr.ui = { ...freshTrUi(), ...ui };
  presetTraining();
  presetInfo();
  return '#/entrainement/jeu';
}
const trStateOf = () => trainingStateFn(store.tr, store.tr.darts);
// 0.13.0 : séances qui font passer p1 au niveau intermédiaire (groupement et score libre à l'objectif, 3 fois chacun).
function interMock() {
  const t0 = Date.now() - 40 * 86400e3;
  const mk = (i, exercise, darts) => ({ id: `ti${i}`, startedAt: t0 + i * 3600e3, endedAt: t0 + i * 3600e3 + 600e3, player: 'p1', setId: 'ds-torpedo-22', mode: 'coach', exercise, darts });
  const alt = (n, s) => Array.from({ length: n }, (_, j) => ({ segment: s, multiplier: 1, ring: j % 2 ? 'in' : 'out' }));
  const extra = [0, 1, 2].map(i => mk(i, 'groupement', alt(9, 20))).concat([3, 4, 5].map(i => mk(i, 'scorelibre', alt(30, 20))));
  store.trainings = [...store.trainings, ...extra].sort((a, b) => b.startedAt - a.startedAt);
}
const LIBRE = [{ s: 20, z: 't', n: 9 }];
// 0.14.0 : jeu en solo fabriqué (X01 ou Cricket) ; `n` fléchettes de la partie simulée, ou jusqu'à `until` (état) vrai.
function setSolo(exercise, game, { n = null, cut = 0, until = null, ui = {}, seed = 7 } = {}) {
  store.tr = null;
  store.trSetup = { player: 'p1', setId: 'ds-torpedo-22', mode: 'jeu', game: { kind: exercise, ...game } };
  startTraining({ player: 'p1', setId: 'ds-torpedo-22', mode: 'jeu', exercise, game }, Date.now() - 900e3);
  const opt = { bias: [-0.03, 0.03], spread: 0.45, pos: true };
  const all = exercise === 'x01' ? simulateSoloX01(store.tr.game, rng(seed), opt) : simulateSoloCricket(store.tr.game, rng(seed), opt);
  let k = n === null ? all.length - cut : Math.min(n, all.length);
  if (until) { k = 1; while (k < all.length && !until(trainingStateFn(store.tr, all.slice(0, k)))) k++; }
  store.tr.darts = all.slice(0, k);
  store.tr.ui = { ...freshTrUi(), ...ui };
  presetTraining();
  presetInfo();
  return '#/entrainement/jeu';
}
const X501 = { startScore: 501, outMode: 'double', legs: 1 };

export const SCENES = {
  // 0.14.0 : jeux en solo.
  'tr-hub-jeux': () => { store.tr = null; store.trSetup = { player: 'p1', setId: 'ds-torpedo-22', mode: 'jeu', game: { kind: 'x01', ...X501 } }; presetInfo(); return '#/entrainement'; },
  'tr-hub-jeux-info': () => { store.tr = null; store.trSetup = { player: 'p1', setId: 'ds-torpedo-22', mode: 'jeu', game: { kind: 'x01', ...X501 } }; presetInfo(['tr-game', 'tr-mode']); return '#/entrainement'; },
  'tr-hub-cricket': () => { store.tr = null; store.trSetup = { player: 'p1', setId: 'ds-droit-22', mode: 'jeu', game: { kind: 'cricket', legs: 3 } }; presetInfo(); return '#/entrainement'; },
  'tr-x01-debut': () => setSolo('x01', X501, { n: 0 }),
  'tr-x01': () => setSolo('x01', X501, { n: 11 }),
  'tr-x01-finition': () => setSolo('x01', X501, { until: st => st.gs.remaining[0] <= 100 && st.visitDarts === 0 }),
  'tr-x01-bust': () => setSolo('x01', X501, { until: st => st.gs.lastEvent === 'bust' }),
  'tr-x01-manche': () => setSolo('x01', { startScore: 301, outMode: 'double', legs: 3 }, { until: st => st.gs.lastEvent === 'leg_won' }),
  'tr-x01-pause': () => setSolo('x01', X501, { n: 11, ui: { pause: true } }),
  'tr-cricket': () => setSolo('cricket', { legs: 1 }, { n: 14 }),
  'tr-cricket-debut': () => setSolo('cricket', { legs: 3 }, { n: 0 }),
  'tr-cricket-fin-proche': () => setSolo('cricket', { legs: 1 }, { cut: 2 }),
  'tr-fin-x01': () => { setSolo('x01', X501); return '#/entrainement/fin'; },
  'tr-fin-x01-manches': () => { setSolo('x01', { startScore: 301, outMode: 'single', legs: 3 }, { seed: 11 }); return '#/entrainement/fin'; },
  'tr-fin-x01-info': () => { setSolo('x01', X501); presetInfo(['tr-an-fin']); return '#/entrainement/fin'; },
  'tr-fin-cricket': () => { setSolo('cricket', { legs: 1 }); return '#/entrainement/fin'; },
  'tr-fin-cricket-jeux': () => { setSolo('cricket', { legs: 3 }, { seed: 5 }); store.tr.setChanges = [{ at: 30, setId: 'ds-droit-22' }]; return '#/entrainement/fin'; },
  'tr-seance-x01': () => { store.tr = null; presetInfo(); presetDetail(); return `#/entrainement/seance/${store.trainings.find(x => x.exercise === 'x01').id}`; },
  'tr-seance-cricket': () => { store.tr = null; presetInfo(); presetDetail(); return `#/entrainement/seance/${store.trainings.find(x => x.exercise === 'cricket').id}`; },
  'tr-stats-x01': () => { presetTrainStats({ exercise: 'x01', metric: 'exercise' }); presetInfo(); return '#/entrainement/stats'; },
  'tr-stats-cricket': () => { presetTrainStats({ exercise: 'cricket', metric: 'exercise' }); presetInfo(); return '#/entrainement/stats'; },
  'tr-stats-secteur': () => { presetTrainStats({ exercise: 'vingt' }); presetInfo(['ts-filters']); return '#/entrainement/stats'; },
  'tr-stats-jeux-info': () => { presetTrainStats({ metric: 'doubles' }); presetInfo(['ts-heat', 'ts-sets']); return '#/entrainement/stats'; },
  // Lot 8 : entraînement solo
  'tr-hub': () => { store.tr = null; store.trSetup = { player: 'p1', setId: 'ds-torpedo-22', mode: 'coach' }; presetInfo(); return '#/entrainement'; },
  'tr-hub-info': () => { store.tr = null; store.trSetup = { player: 'p1', setId: 'ds-torpedo-22', mode: 'coach' }; presetInfo(['tr-level', 'tr-exs', 'tr-ex-groupement', 'tr-set', 'tr-mode']); return '#/entrainement'; },
  'tr-hub-libre': () => { store.tr = null; store.trSetup = { player: 'p1', setId: 'ds-droit-22', mode: 'libre', free: { s: 19, z: 't', n: 15 } }; presetInfo(); return '#/entrainement'; },
  'tr-hub-vide': () => { store.tr = null; store.trainings = []; store.trSetup = null; presetInfo(); return '#/entrainement'; },
  'tr-hub-reprendre': () => { setTr('groupement', 4); return '#/entrainement'; },
  // 0.13.0
  'tr-hub-autres': () => { store.tr = null; store.trSetup = { player: 'p1', setId: 'ds-torpedo-22', mode: 'coach' }; presetTraining({ others: true }); presetInfo(); return '#/entrainement'; },
  'tr-hub-inter': () => { store.tr = null; interMock(); store.trSetup = { player: 'p1', setId: 'ds-droit-22', mode: 'coach' }; presetInfo(['tr-level']); return '#/entrainement'; },
  'tr-jeu-pause-jeu': () => setTr('groupement', 4, { ui: { pause: true, confirm: 'set' } }),
  'tr-jeu-t20': () => { interMock(); return setTr('triple20', 7); },
  'tr-jeu-tourdoubles': () => { interMock(); return setTr('horlogedoubles', 8); },
  'tr-fin-t20': () => { interMock(); setTr('triple20', 30); return '#/entrainement/fin'; },
  'tr-fin-triples': () => { interMock(); setTr('triples', 30); return '#/entrainement/fin'; },
  'tr-fin-doubles': () => { interMock(); setTr('doubles', 27); return '#/entrainement/fin'; },
  'tr-fin-tourdoubles': () => { interMock(); setTr('horlogedoubles', 60); return '#/entrainement/fin'; },
  'tr-fin-bull25': () => { interMock(); setTr('bull25', 15); return '#/entrainement/fin'; },
  'tr-fin-changement': () => { setTr('groupement', 9); store.tr.setChanges = [{ at: 5, setId: 'ds-droit-22' }]; return '#/entrainement/fin'; },
  'tr-seance-note': () => { store.tr = null; presetInfo(); presetDetail(); return `#/entrainement/seance/${store.trainings.find(x => x.note && !x.excluded).id}`; },
  'tr-seance-cote': () => { store.tr = null; presetInfo(['tr-manage']); presetDetail(); return `#/entrainement/seance/${store.trainings.find(x => x.excluded).id}`; },
  'tr-seance-jeu': () => { store.tr = null; presetInfo(); const r = store.trainings.find(x => x.exercise === 'vingt'); presetDetail({ id: r.id, kind: 'set', run: 1 }); return `#/entrainement/seance/${r.id}`; },
  'tr-seance-joueur': () => { store.tr = null; presetInfo(); const r = store.trainings[0]; presetDetail({ id: r.id, kind: 'player' }); return `#/entrainement/seance/${r.id}`; },
  'tr-seance-arretee': () => {
    store.tr = null; presetInfo(); presetDetail();
    const g = store.trainings.find(x => x.exercise === 'groupement');
    const r = { ...g, id: 't-arretee', startedAt: g.startedAt + 3600e3, endedAt: g.startedAt + 3900e3, darts: g.darts.slice(0, 5), stopped: true };
    store.trainings = [r, ...store.trainings].sort((a, b) => b.startedAt - a.startedAt);
    return '#/entrainement/seance/t-arretee';
  },
  'tr-accueil': () => { setTr('groupement', 4); return '#/'; },
  'tr-jeu': () => setTr('groupement', 4),
  'tr-jeu-debut': () => setTr('groupement', 0),
  'tr-jeu-ext': () => setTr('groupement', 2, { ui: { pick: 20 } }),
  'tr-jeu-triple': () => setTr('triple20', 3, { ui: { pick: 20 } }),
  'tr-jeu-double': () => setTr('libre', 1, { blocks: [{ s: 16, z: 'd', n: 9 }], ui: { pick: 16 } }),
  'tr-jeu-regles': () => setTr('horloge', 5, { ui: { rules: true } }),
  'tr-jeu-horshors': () => setTr('groupement', 2, { darts: [{ segment: 0, multiplier: 1, pos: [0.2, -1.27] }, { segment: 20, multiplier: 1, ring: 'out', pos: [0.02, -0.75] }] }),
  'tr-jeu-horloge': () => setTr('horloge', 23),
  // Lot 8 du 23/11 (5.1) : jeux de cible.
  'tr-hub-cible': () => { store.tr = null; store.trSetup = { player: 'p1', setId: 'ds-torpedo-22', mode: 'coach' }; presetTraining({ fun: true }); presetInfo(['tr-ex-killer']); return '#/entrainement'; },
  'tr-jeu-golf': () => setTr('golf', 7),
  'tr-fin-golf': () => { setTr('golf', 40); return '#/entrainement/fin'; },
  'tr-fin-defi': () => { setTr('groupement', 9, { darts: [{ segment: 20, multiplier: 1, ring: 'in' }, { segment: 20, multiplier: 3 }, { segment: 20, multiplier: 1, ring: 'out' }, ...Array.from({ length: 6 }, (_, i) => ({ segment: i % 2 ? 5 : 20, multiplier: 1, ring: 'in' }))] }); presetTrainSheet({ kind: 'feat', key: 'parfaite', sessionId: store.tr.id, start: 0 }); return '#/entrainement/fin'; },
  'tr-stats-badges': () => { presetTrainStats(); presetInfo(['ts-badges']); return '#/entrainement/stats'; },
  'tr-stats-badge-fenetre': () => { presetTrainStats(); presetInfo(); presetTrainSheet({ kind: 'badge', key: 'elite', pid: 'p1' }); return '#/entrainement/stats'; },
  'tr-jeu-killer': () => setTr('killer', 4),
  'tr-jeu-shanghai': () => setTr('shanghai', 10),
  'tr-jeu-moitie': () => setTr('moitie', 9),
  'tr-jeu-cent': () => setTr('cent', 0, { darts: [{ segment: 20, multiplier: 3 }, { segment: 5, multiplier: 1, ring: 'in' }, { segment: 1, multiplier: 1, ring: 'out' }, { segment: 20, multiplier: 1, ring: 'in' }] }),
  'tr-jeu-hautbas': () => setTr('hautbas', 4),
  'tr-jeu-bull': () => setTr('bull', 5),
  'tr-jeu-score': () => setTr('scorelibre', 13),
  'tr-jeu-pause': () => setTr('groupement', 4, { ui: { pause: true } }),
  'tr-jeu-pause-suppr': () => setTr('groupement', 4, { ui: { pause: true, confirm: 'delete' } }),
  'tr-jeu-loupe': () => setTr('groupement', 2, { ui: { loupe: { x: 0.05, y: -0.6 } } }),
  'tr-fin': () => { setTr('groupement', 9); return '#/entrainement/fin'; },
  'tr-fin-info': () => { setTr('groupement', 9); presetInfo(['tr-an-fin']); return '#/entrainement/fin'; },
  'tr-fin-horloge': () => { setTr('horloge', 200); return '#/entrainement/fin'; },
  'tr-fin-hautbas': () => { setTr('hautbas', 18); return '#/entrainement/fin'; },
  'tr-fin-score': () => { setTr('scorelibre', 30); return '#/entrainement/fin'; },
  'tr-fin-vingt': () => { setTr('vingt', 60); return '#/entrainement/fin'; },
  'tr-fin-bull': () => { setTr('bull', 9); return '#/entrainement/fin'; },
  'tr-fin-libre': () => { setTr('libre', 9, { blocks: LIBRE }); return '#/entrainement/fin'; },
  'tr-fin-libre-ajout': () => { setTr('libre', 9, { blocks: LIBRE }); presetTraining({ add: { s: 19, z: 'si', n: 12 } }); return '#/entrainement/fin'; },
  'tr-seance': () => { store.tr = null; presetInfo(); presetDetail(); return `#/entrainement/seance/${store.trainings[0].id}`; },
  'tr-seance-vingt': () => { store.tr = null; presetInfo(); presetDetail(); const r = store.trainings.find(x => x.exercise === 'vingt'); return `#/entrainement/seance/${r.id}`; },
  'tr-seance-horloge': () => { store.tr = null; presetInfo(); presetDetail(); const r = store.trainings.find(x => x.exercise === 'horloge'); return `#/entrainement/seance/${r.id}`; },
  'tr-seance-suppr': () => { store.tr = null; presetInfo(); presetDetail({ id: store.trainings[1].id, kind: 'delete' }); return `#/entrainement/seance/${store.trainings[1].id}`; },
  'tr-stats': () => { presetTrainStats(); presetInfo(); return '#/entrainement/stats'; },
  'tr-stats-info': () => { presetTrainStats(); presetInfo(['ts-filters', 'ts-curve', 'ts-heat', 'ts-sets']); return '#/entrainement/stats'; },
  'tr-stats-groupement': () => { presetTrainStats({ exercise: 'groupement', metric: 'exercise' }); presetInfo(); return '#/entrainement/stats'; },
  'tr-stats-jeu': () => { presetTrainStats({ set: 'ds-droit-22' }); presetInfo(); return '#/entrainement/stats'; },
  'tr-stats-parties': () => { presetTrainStats({ source: 'parties' }); presetInfo(); return '#/entrainement/stats'; },
  'tr-stats-deux': () => { presetTrainStats({ source: 'deux' }); presetInfo(); return '#/entrainement/stats'; },
  'tr-stats-vide': () => { presetTrainStats({ period: '7j', exercise: 'bull' }); store.trainings = store.trainings.filter(r => r.exercise !== 'bull'); presetInfo(); return '#/entrainement/stats'; },
  armurerie: () => { store.trDraft = null; return '#/armurerie'; },
  'armurerie-jeu': () => { store.trDraft = null; return '#/armurerie/ds-torpedo-22'; },
  'armurerie-modele': () => { store.trDraft = null; return '#/armurerie/nouveau/fusele-20'; },
  'armurerie-vierge': () => { store.trDraft = null; return '#/armurerie/nouveau'; },
  conseils: () => '#/conseils',
  'conseils-prise': () => '#/conseils/prise',
  'conseils-posture': () => '#/conseils/posture',
  'conseils-lancer': () => '#/conseils/lancer',
  'conseils-types': () => '#/conseils/types',

  'v78-accueil': v78('#/'),
  'v78-accueil-soiree': v78('#/', () => { store.soiree = { id: 's1', startedAt: Date.now() - 2 * 3600e3, players: ['p1', 'p2', 'p3'], drinks: {} }; }),
  'v78-stats': v78('#/stats/p1'),
  'v78-stats-info': v78('#/stats/p1', () => presetStats2({ info: ['score', 'courbe'] })),
  'v78-stats-zoom': v78('#/stats/p1', () => { presetStats2({ zoom: 4, metric: 'average' }); }),
  'v78-stats-pire': v78('#/stats/p2', () => presetStats2({ metric: 'worstVisit', zoom: 2 })),
  'v78-stats-point': v78('#/stats/p1', () => { presetStats2({ zoom: 2 }); const g = store.games.find(x => x.config.players.includes('p1')); presetStats2({ zoom: 2, point: g.id }); }),
  'v78-stats-compare': v78('#/stats/p1', () => presetStats2({ compare: 'p2', zoom: 2 })), // lot 9
  'v78-stats-volees': v78('#/stats/p1', () => presetStats2({ folds: ['best', 'worst'] })),
  'v78-classement': v78('#/classement'),
  'v78-classement-info': v78('#/classement', () => presetStats2({ info: ['palmares', 'classement'], rank: 'worstVisit' })),
  'v78-classement-verres': v78('#/classement', () => presetStats2({ rank: 'drinks' })),
  // Lot 10 : Cricket
  'ck-nouvelle': () => { store.current = null; store.ck = null; store.setupDraft = { ...store.lastSetup, players: ['p1', 'p2', 'p3'], shuffle: false, game: 'cricket', ckMode: 'points', confirm: false }; return '#/nouvelle'; },
  'ck-face': () => setCk(['p1', 'p2'], CK2),
  'ck-face-valider': () => setCk(['p1', 'p2'], `${CK2}  S15 T15 S20`, { pending: true }),
  'ck-face-triple': () => setCk(['p1', 'p2'], CK2, { ui: { mult: 3 } }),
  'ck-face-grille': () => setCk(['p1', 'p2'], CK2, { ui: { layout: 'grille' } }),
  'ck-grille': () => setCk(['p1', 'p2', 'p3', 'p4'], CK4),
  'ck-grille-8': () => setCk(['p1', 'p2', 'p3', 'p4', 'p5', 'p7', 'p8', 'p10'], CK4, { mode: 'cutthroat' }),
  'ck-sans': () => setCk(['p1', 'p2', 'p3'], CK4, { mode: 'sans' }),
  'ck-manche': () => setCk(['p1', 'p2'], 'T20 T19 T18  0 0 0  T17 T16 T15  0 0 0  S25 D25', { mode: 'sans', legsToWin: 2, pending: true }),
  'ck-pause': () => setCk(['p1', 'p2'], CK2, { ui: { pause: true } }),
  'ck-fin': () => { setCk(['p1', 'p2', 'p3'], 'T20 T19 T18  S20 0 0  S5 0 0  T17 T16 T15  0 0 0  0 S19 0  S25 D25'); return '#/cricket/fin'; },
  'ck-accueil': () => { setCk(['p1', 'p2'], CK2); return '#/'; },
  'ck-detail': () => '#/cricket/partie/c2',
  'ck-historique': () => { presetHistory2({ open: [] }); presetHistory2(); return '#/historique'; },
  'ck-stats': () => { presetStats2({ info: ['cricket'] }); return '#/stats/p1'; },
  'v78-honneur': v78('#/honneur', () => presetHonour({ kind: 'tout' })), // lot 9 : tableau d'honneur
  'v78-honneur-badges': v78('#/honneur', () => presetHonour({ kind: 'badge' })),
  'v78-stats-vitrine': v78('#/stats/p1', () => presetStats2({ info: ['vitrine'], folds: ['badges'] })), // 0.11.1 : badges dépliés
  'v78-historique': v78('#/historique'),
  'v78-historique-filtre': v78('#/historique', () => { const d = new Date(); presetHistory2({ player: 'p2', month: `${d.getFullYear()}-${d.getMonth()}` }); }),
  'v78-historique-tout': v78('#/historique', () => presetHistory2({ open: store.games.map(g => (g.soiree ? `s:${g.soiree}` : '')).filter(Boolean) })),
  'v78-historique-vide': v78('#/historique', () => presetHistory2({ player: 'p11', result: 'abandoned' })),
  'v78-reglages': v78('#/reglages'),
  'v78-reglages-ouverts': v78('#/reglages', () => presetSettings2({ info: ['aff', 'son', 'vib'], diag: true })),
  'v78-reglages-apk': v78('#/reglages', () => { store.mockApk = true; store.mockUpdate = { current: '0.7.7', latest: '0.7.8', available: true }; }),
  'v78-nouveautes': v78('#/nouveautes'),
  'v78-soiree-dash': v78('#/soiree/s1', () => presetDashFolds()),
  'v78-soiree-dash-tout': v78('#/soiree/s1', () => presetDashFolds({ all: true })), // 0.11.1 : toutes les sections dépliées
  // 0.11.2 : une tournée notée par l'ancienne version (même instant pour tous) dans la première partie de la soirée.
  'v78-soiree-dash-tournees': v78('#/soiree/s1', () => { mockTournee('s1'); presetDashFolds({ open: ['dash-drinks'] }); }),
  'v78-soiree-dash-tournees-ok': v78('#/soiree/s1', () => { mockTournee('s1'); presetDashFolds({ open: ['dash-drinks'] }); presetDashTourAsk('s1'); }),
  'v78-soiree-dash-ancienne': v78('#/soiree/s6'),
  'v78-historique-selection': v78('#/historique', () => { const ids = store.games.filter(g => !g.soiree).slice(0, 2).map(g => g.id); presetHistory2({ sel: [...ids, store.games[0].id], open: ['s:s1'] }); }),
  'v78-historique-ajouter': v78('#/historique', () => { presetHistory2({ sel: [store.games.find(g => !g.soiree).id], ask: 'attach' }); }),
  'v78-historique-jour': v78('#/historique', () => { const d = new Date(); d.setDate(d.getDate() - 4); d.setHours(19, 0, 0, 0); const players = ['p1', 'p2']; for (let i = 0; i < 2; i++) store.games.push({ id: `jour${i}`, startedAt: d.getTime() + i * 2400e3, config: { startScore: 301, outMode: 'double', legsToWin: 1, players }, darts: simulateGame({ startScore: 301, outMode: 'double', legsToWin: 1, players }, [0.4, 0.4], 70 + i), abandoned: false }); const k = `d:${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; presetHistory2({ open: [k] }); }),
  'v78-stats-cible': v78('#/stats/p1', () => presetStats2({ folds: ['board'] })),
  jeu: () => { setGame(cfg(['p1', 'p2']), ''); return '#/jeu'; },
  reprendre: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20'); return '#/'; },
  'arme-d': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { mult: 2 }); return '#/jeu'; },
  'arme-t': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { mult: 3 }); return '#/jeu'; },
  bust: () => { setGame(cfg(['p1', 'p2'], 301), 'T20 T20 T20 20 20 20 T19 S20 S12 20 20 20 S20 S16', {}, true); return '#/jeu'; },
  volee: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S1 S20 S20 S20 T20 T20 S20', {}, true); return '#/jeu'; },
  // Volée en attente à 4 et à 8 joueurs ; `k` (8 joueurs) = rang de la volée en attente, donc du joueur qui vient de
  // lancer (k % 8) : le test des couleurs fait passer VALIDER par les 16 couleurs d'avatar (k de 8 à 15 : les 8 joueurs
  // prennent les fonds 8 à 15, lot 6 ; sinon leurs fonds d'origine, 0 à 7).
  'volee-4': () => { setGame(cfg(['p1', 'p2', 'p3', 'p4']), 'T20 S20 S1  S20 S5 S20  T19 S7 S3  S20 S1 S20  T20 T20 S5', {}, true); return '#/jeu'; },
  'volee-8': (k = 3) => {
    const visits = ['T20 S20 S1', 'S20 S5 S20', 'T19 S7 0', 'S20 S1 S20', 'S5 S5 S1', 'T20 S20 S5', 'S1 0 S1', 'S20 S5 S20'];
    setGame(cfg(EIGHT), Array.from({ length: (k % 8) + 1 }, (_, i) => visits[i % 8]).join(' '), {}, true);
    EIGHT.forEach((id, i) => {
      const p = store.players.find(q => q.id === id);
      const orig = [...MOCK_PLAYERS, ...EXTRA_PLAYERS].find(q => q.id === id);
      if (p && p.avatar.kind !== 'photo') p.avatar.color = k >= 8 ? 8 + i : orig.avatar.color;
    });
    return '#/jeu';
  },
  // Lot 7 : Tsia lance, les voyelles de l'écran tombent (au sommaire, la chute se rejoue à chaque ouverture)
  tsia: () => { setGame(cfg(['p1', 'p11']), 'T20 S20 S5 S20'); resetVowels(); return '#/jeu'; },
  'tsia-volee': () => { setGame(cfg(['p1', 'p11']), 'T20 S20 S5 S20 S5 S1', {}, true); resetVowels(); return '#/jeu'; },
  annonce: () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S1 S20 S20 S20 T20 T20 S20', { announce: 0, frozen: true }); return '#/jeu'; },
  cible: () => { setGame(cfg(['p1', 'p2']), LIVE()); return '#/jeu'; },
  'cible-tour1': () => { setGame(cfg(['p1', 'p2']), LIVE().slice(0, 2)); return '#/jeu'; },
  'cible-seule': () => { setGame(cfg(['p1', 'p2']), '', { panel: 'board' }); return '#/jeu'; },
  'cible-manche': () => { setGame(cfg(['p1', 'p2']), LIVE(), { panel: 'board', boardView: 'leg' }); return '#/jeu'; },
  manches: () => {
    const config = cfg(['p1', 'p2'], 301, 'double', 3);
    setGame(config, [...simulateGame({ ...config, legsToWin: 1 }, [0.45, 0.3], 3), ...ds('S20 S1 S5 T20 T20 S20 S20 S5')]);
    return '#/jeu';
  },
  'histo-deux': () => {
    const config = cfg(['p1', 'p2'], 301);
    const darts = ds(TWO);
    selectLogCell(`gx2|${visitIndex(config, darts, v => v.bust)}`);
    return `#/partie/${storeGame('gx2', config, darts)}`;
  },
  'histo-huit': () => { const { config, darts } = eightGame(); setGame(config, darts, { panel: 'board' }); selectLogCell(null); return '#/jeu'; },
  'histo-huit-detail': () => {
    const config = cfg(EIGHT, 301, 'double', 2);
    const full = simulateGame(config, EIGHT.map(() => 0.35), 14);
    selectLogCell(`gx8|${visitIndex(config, full, v => v.finish)}`);
    return `#/partie/${storeGame('gx8', config, full)}`;
  },
  // Lot 3 : panneau cible + historique, correction d'une fléchette (sélecteur, confirmation, refus)
  'panneau-case': () => {
    const config = cfg(['p1', 'p2'], 301, 'double', 2);
    const darts = [...simulateGame({ ...config, legsToWin: 1 }, [0.45, 0.45], 12), ...ds('T20 S20 S5 T19 S7')];
    setGame(config, darts, { panel: 'board' });
    selectLogCell(`${store.current.id}|2`);
    return '#/jeu';
  },
  correction: () => { setGame(cfg(['p1', 'p2']), LIVE(), { panel: 'board', fix: { index: 1, mult: 1, pick: null, result: null } }); selectLogCell(`${store.current.id}|0`); return '#/jeu'; },
  'correction-confirmer': () => {
    setGame(cfg(['p1', 'p2']), LIVE(), { panel: 'board' });
    const pick = parseDart('T20');
    store.current.ui.fix = { index: 1, mult: 1, pick, result: correctDart(store.current.config, store.current.darts, 1, pick) };
    selectLogCell(`${store.current.id}|0`);
    return '#/jeu';
  },
  'correction-refus': () => {
    setGame(cfg(['p1', 'p2'], 301), 'T20 T20 T20  20 20 20  T20 S20 S1  20', { panel: 'board' });
    const pick = parseDart('T20'); // 2e fléchette S20 → T20 : reste 1, bust, la volée serait coupée
    store.current.ui.fix = { index: 7, mult: 1, pick, result: correctDart(store.current.config, store.current.darts, 7, pick) };
    selectLogCell(`${store.current.id}|2`);
    return '#/jeu';
  },
  // Lot 3 : célébrations (figées jusqu'au prochain appui)
  'fete-100': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S20', {}, true); celebrate('ton', 100, 0); return '#/jeu'; },
  'fete-140': () => { setGame(cfg(['p1', 'p2']), 'T20 T20 S20', {}, true); celebrate('ton40', 140, 0); return '#/jeu'; },
  'fete-180': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 T20 T20', {}, true); celebrate('max', 180, 0); return '#/jeu'; },
  'fete-180-paysage': () => { setGame(cfg(['p1', 'p2']), 'T20 T20 T20', {}, true); celebrate('max', 180, 0); return '#/jeu'; },
  'fete-finition': () => {
    setGame(cfg(['p1', 'p2'], 301, 'double', 2), 'T20 T20 T20  20 1 5  T20 S20 0  1 1 1  S1 D20');
    celebrate('finish', 41, 0);
    return '#/manche';
  },
  'fete-finition-100': () => { setGame(cfg(['p1', 'p2'], 301, 'double', 2), 'T20 T20 T20 20 1 5 T20 T11 D14'); celebrate('finish-big', 121, 0); return '#/manche'; },
  'cible-grande': () => { setGame(cfg(['p1', 'p2']), LIVE(), { panel: 'board' }); return '#/jeu'; },
  'histo-cours': () => {
    const config = cfg(['p1', 'p2'], 301, 'double', 2);
    setGame(config, [...simulateGame({ ...config, legsToWin: 1 }, [0.45, 0.45], 12), ...ds('T20 S20 S5 T19 S7')], { panel: 'board' });
    return '#/jeu';
  },
  paysage: () => { setGame(cfg(['p1', 'p2', 'p3']), LIVE()); return '#/jeu'; },
  loupe: () => { const [x, y] = at(20, MID_T, 2); setGame(cfg(['p1', 'p2']), LIVE().slice(0, 7), { loupe: { x, y } }); return '#/jeu'; },
  'paysage-attente': () => { setGame(cfg(['p1', 'p2']), LIVE().slice(0, 6), {}, true); return '#/jeu'; },
  finition: () => { setGame(cfg(['p1', 'p2']), 'T20 T20 T20 S5 S1 S20 T20 T20 T20 S20 S20 S20 S20 S20 S1 S19 S3 S17'); return '#/jeu'; },
  // Lot 7 : joueur en tête, célébrations des nuls, jouer jusqu'au bout, classement et tournée
  'en-tete': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 T20 T20  S20 S5 S1  T19 S7 S3'); return '#/jeu'; },
  'en-tete-autre': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 T20 T20  S20 S5 S1'); return '#/jeu'; },
  'nul-zero': () => { setGame(cfg(['p1', 'p2']), '0 0 0', {}, true); celebrate('nul-zero', 0, 0); return '#/jeu'; },
  'nul-bas': () => { setGame(cfg(['p1', 'p2']), 'S1 S5 S1', {}, true); celebrate('nul-low', 7, 0); return '#/jeu'; },
  'nul-bust': () => { setGame(cfg(['p1', 'p2'], 301), 'T20 T20 T20 20 20 20 T19 S20 S12 20 20 20 S20 S16', {}, true); celebrate('nul-bust', 'BUST', 0); return '#/jeu'; },
  'nul-serie': () => { setGame(cfg(['p1', 'p2']), 'S5 S5 S5  T20 T20 T20  S1 S1 S1  T20 T20 T20  S2 S2 S2', {}, true); celebrate('nul-serie', 3, 0); return '#/jeu'; },
  'jusquau-bout': () => { setGame(PLAYON(), `${PO1} T20 S20`); return '#/jeu'; },
  'jusquau-bout-place': () => { setGame(PLAYON(), `${PO1} T20 S20  T20 S20`, {}, true); return '#/jeu'; },
  'fin-tournee': () => { setGame(PLAYON(), `${PO1} T20 S20  T20 S20  0 0 0  0 0 0  T20 S20`); return '#/fin'; },
  'fin-egalite': () => { setGame(cfg(['p1', 'p2', 'p3'], 301, 'single'), 'T20 T20 T20  0 0 0  0 0 0  T20 T20 S1'); return '#/fin'; },
  // Verres : Guillaume 1 verre il y a 2 h, Mathilde 3 en une heure (au-dessus de 0,5 g/L), Karim aucun
  verres: () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5', { pause: true }); store.current.drinks = DRINKS(); return '#/jeu'; },
  'verres-jeu': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 T20 T20', {}); store.current.drinks = DRINKS(); return '#/jeu'; },
  'verres-histo': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 T5  T19 S19 S3  T20 S20 S1  S20 S5', { panel: 'board' }); store.current.drinks = DRINKS(); selectLogCell(null); return '#/jeu'; },
  'verres-huit': () => { const { config, darts } = eightGame(); setGame(config, darts, { panel: 'board' }); store.current.drinks = Object.fromEntries(config.players.map((id, i) => [id, Array.from({ length: i + 1 }, (_, k) => ({ t: Date.now() - (8 - k) * 600e3, at: k * 9 }))])); selectLogCell(null); return '#/jeu'; },
  // Lot 7.6 : soirée (avant, en cours, accueil, nouvelle partie), panneau des verres en jeu (bouton du bandeau)
  'soiree-debut': () => { store.current = null; store.soireeDraft = null; return '#/soiree'; },
  soiree: () => { store.current = null; mockSoiree(); return '#/soiree'; },
  'soiree-partie': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5'); mockSoiree({ game: true }); return '#/soiree'; },
  'accueil-soiree': () => { store.current = null; mockSoiree(); return '#/'; },
  'nouvelle-soiree': () => { store.current = null; mockSoiree(); store.setupDraft = null; return '#/nouvelle'; },
  'verres-panneau': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5', { drinks: true }); store.current.drinks = DRINKS(); return '#/jeu'; },
  'verres-soiree': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5  T19 S19 S3', { drinks: true }); mockSoiree({ game: true }); store.current.drinks = { p2: [{ t: Date.now(), at: 4 }] }; return '#/jeu'; },
  'verres-soiree-jeu': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5  T19 S19 S3'); mockSoiree({ game: true }); store.current.drinks = { p2: [{ t: Date.now(), at: 4 }] }; return '#/jeu'; },
  'verres-soiree-histo': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5  T19 S19 S3  T20 S20 S1', { panel: 'board' }); mockSoiree({ game: true }); store.current.drinks = { p2: [{ t: Date.now(), at: 4 }] }; selectLogCell(null); return '#/jeu'; },
  // Lot 7.6 : volée parmi les 3 meilleures / pires de la soirée, au résultat (en attente de VALIDER)
  'volee-meilleure': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5  T19 S19 S3  T20 S20 S1  T20 T20 T20', {}, true); mockSoiree({ game: true }); return '#/jeu'; },
  'volee-pire': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5  T19 S19 S3  T20 S20 S1  S1 S1 S1', {}, true); mockSoiree({ game: true }); return '#/jeu'; },
  'volee-pire-bust': () => { setGame(cfg(['p1', 'p2', 'p3'], 301), 'T20 T20 T20  T19 S19 S3  T20 S20 S1  T20 T20', {}, true); mockSoiree({ game: true }); return '#/jeu'; },
  'volee-troisieme': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5  T19 S19 S3  T20 S20 S1  T20 T20 S20', {}, true); mockSoiree({ game: true }); return '#/jeu'; },
  'fin-verres': () => { setGame(PLAYON(), `${PO1} T20 S20  T20 S20  0 0 0  0 0 0  T20 S20`); store.current.drinks = DRINKS(); return '#/fin'; },
  'fin-manche': () => { setGame(cfg(['p1', 'p2'], 301, 'double', 2), 'T20 T20 T20 20 1 5 T20 T11 D14'); return '#/manche'; },
  'fin-partie': () => { setGame(cfg(['p1', 'p2', 'p3'], 301), 'T20 T20 T20 20 1 5 T19 S7 S3 T20 T11 D14'); return '#/fin'; },
  huit: () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p7', 'p8', 'p9'];
    const config = cfg(players);
    setGame(config, simulateGame(config, players.map(() => 0.3), 77, 26));
    return '#/jeu';
  },
  long: () => {
    const players = ['p10', 'p1', 'p2'];
    const config = cfg(players, 501, 'double', 3);
    setGame(config, simulateGame(config, [0.3, 0.3, 0.3], 5, 10));
    return '#/jeu';
  },
  'long-fiche': () => { ensureExtraPlayers(['p10']); store.draft = null; return '#/joueur/p10'; },
  pause: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { pause: true }); return '#/jeu'; },
  abandon: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { pause: true, confirm: 'abandon' }); return '#/jeu'; },
  'supprimer-en-cours': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { pause: true, confirm: 'delete' }); return '#/jeu'; },
  solo: () => { setGame(cfg(['p2'], 301), 'T20 T20 S20 S19 S7 S3'); return '#/jeu'; },
  'solo-attente': () => { setGame(cfg(['p2'], 301), 'T20 T20 S20 S19 S7 S3', {}, true); return '#/jeu'; },
  'aucun-joueur': () => { store.players = []; store.current = null; store.setupDraft = null; return '#/joueurs'; },
  // Lot 9 : handicap (Karim et Mathilde partent de 701, les autres de 501), et une partie en handicap.
  'nouvelle-handicap': () => { store.current = null; store.setupDraft = { ...store.lastSetup, players: ['p1', 'p2', 'p3', 'p4'], shuffle: false, handicap: true, starts: { p1: 701, p2: 301 }, confirm: false }; return '#/nouvelle'; },
  // Lot 9 : défi tiré (partie « defi21 », volée 2 : « le 20 trois fois ou une pinte »), puis raté (en attente de VALIDER).
  // Lot 7.8 : partie « defi30 » (14 défis), volée 2 : « le 20 trois fois ou une pinte » ; bandeau pendant toute la volée.
  'jeu-defi': () => { setGame({ ...cfg(['p1', 'p2']), defis: 'souvent' }, 'T20 S20 S5'); store.current.id = 'defi30'; return '#/jeu'; },
  'jeu-defi-rappel': () => { setGame({ ...cfg(['p1', 'p2']), defis: 'souvent' }, 'T20 S20 S5  S20'); store.current.id = 'defi30'; return '#/jeu'; },
  'jeu-defi-resultat': () => { setGame({ ...cfg(['p1', 'p2']), defis: 'souvent' }, 'T20 S20 S5  S20 S20 S1', {}, true); store.current.validated = 3; store.current.id = 'defi30'; return '#/jeu'; },
  'jeu-defi-reussi': () => { setGame({ ...cfg(['p1', 'p2']), defis: 'souvent' }, 'T20 S20 S5  S20 T20 S20', {}, true); store.current.validated = 3; store.current.id = 'defi30'; celebrate('ton', 100, 1); return '#/jeu'; },
  'jeu-defi-ecart': () => { setGame({ ...cfg(['p1', 'p2']), defis: 'souvent' }, 'T20 S20 S5'); store.current.id = 'defi16'; return '#/jeu'; },
  'jeu-defi-gauche': () => { setGame({ ...cfg(['p1', 'p2']), defis: 'souvent' }, 'T20 S20 S5  S20 S1 S5', {}, true); store.current.validated = 3; store.current.id = 'defi31'; return '#/jeu'; },
  'jeu-defi-tsia': () => { setGame({ ...cfg(['p1', 'p11']), defis: 'souvent' }, 'T20 S20 S5'); store.current.id = 'defi9'; resetVowels(); return '#/jeu'; },
  'jeu-defi-paysage': () => { setGame({ ...cfg(['p1', 'p2', 'p3']), defis: 'souvent' }, 'T20 S20 S5'); store.current.id = 'defi16'; return '#/jeu'; },
  'jeu-defi-histo': () => {
    setGame({ ...cfg(['p1', 'p2']), defis: 'souvent' }, 'T20 S20 S5  S20 S20 S1  T20 T20 S20  S20 T20 S20');
    store.current.id = 'defi30';
    Object.assign(store.current.ui, { panel: 'board' });
    return '#/jeu';
  },
  // Lot 7.8 : moqueries (Atila, le roi des uns ; la moto d'Angelina)
  'nul-uns': () => { setGame(cfg(['p1', 'p2']), 'S1 S1 S5', {}, true); celebrate('nul-uns', 7, 0); return '#/jeu'; },
  'nul-moto': () => { setGame(cfg(['p12', 'p2']), 'S5 S3 S1', {}, true); celebrate('nul-moto', 9, 0); return '#/jeu'; },
  // Lot 7.8 : pastilles de rang (4 joueurs en cours de partie)
  'jeu-rangs': () => { setGame(cfg(['p1', 'p2', 'p3', 'p4']), 'T20 S20 S5  S20 S20 S1  T19 S19 S3  S1 S5 S20  T20 T20 S20'); return '#/jeu'; },
  // Lot 7.8 : fenêtre d'un badge (badge à rangs, puis badge simple)
  'v78-badge-rangs': v78('#/honneur', () => { presetHonour({ kind: 'badge' }); presetBadgeSheet({ pid: 'p1', key: 'fermier', tier: 0 }); }),
  'v78-badge-180': v78('#/stats/p1', () => { presetStats2({}); presetBadgeSheet({ pid: 'p1', key: 'max', tier: 0 }); }),
  'jeu-handicap': () => { setGame({ ...cfg(['p1', 'p2']), starts: [701, 301] }, 'T20 S20 S5'); return '#/jeu'; },
  'nouvelle-vide': () => { store.players = []; store.current = null; store.setupDraft = null; return '#/nouvelle'; },
  'historique-vide': () => { store.games = []; return '#/historique'; },
  // Lot 3 : sauvegarde (aperçu d'un fichier, confirmations, fichier refusé)
  'sauvegarde-apercu': () => { presetBackup({ preview: mockBackup(), file: 'strela-20261030-2118.json' }); return '#/reglages'; },
  'sauvegarde-remplacer': () => { presetBackup({ preview: mockBackup(), file: 'strela-20261030-2118.json', ask: 'replace' }); return '#/reglages'; },
  'sauvegarde-fusionner': () => { presetBackup({ preview: mockBackup(), file: 'strela-20261030-2118.json', ask: 'merge' }); return '#/reglages'; },
  'sauvegarde-refus': () => { presetBackup({ error: 'Sauvegarde faite par une version plus récente de Strela (9.0.0) : mets l\'appli à jour avant de l\'importer.' }); return '#/reglages'; },
  // Lot 3 : suppression de parties (sélection par appui long, confirmation ; détail d'une partie)
  'histo-selection': () => { presetHistory2({ sel: store.games.slice(0, 3).map(g => g.id) }); return '#/historique'; },
  'histo-selection-confirmer': () => { presetHistory2({ sel: store.games.slice(0, 3).map(g => g.id), ask: 'delete' }); return '#/historique'; },
  'partie-supprimer': () => { presetHistory({ detail: 'g1' }); return '#/partie/g1'; },
  'fiche-new': () => { store.draft = null; return '#/joueur/nouveau'; },
  // Lot 6 : banque de 40 pictogrammes (carabine choisie, sur un des nouveaux fonds) et fiche avec les 16 fonds
  'banque-carabine': () => { store.draft = null; Object.assign(openDraft('p2').avatar, { kind: 'icon', icon: 'carabine', color: 15 }); return '#/avatars'; },
  'fiche-fonds': () => { store.draft = null; Object.assign(openDraft('p3').avatar, { color: 8 }); return '#/joueur/p3'; },
  'fiche-edit': () => { store.draft = null; return '#/joueur/p2'; },
  // Lot 7.4 : animation de tour choisie (un appui sur un choix la montre, comme en jeu)
  'fiche-animation': () => { store.draft = null; Object.assign(openDraft('p2'), { turnAnim: 'cravate' }); return '#/joueur/p2'; },
  suppression: () => { store.current = null; store.draft = null; Object.assign(openDraft('p4'), { del: 'ask', reveal: true }); return '#/joueur/p4'; },
  'suppression-refus': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5'); store.draft = null; Object.assign(openDraft('p1'), { del: 'refused', reveal: true }); return '#/joueur/p1'; },
  'joueur-supprime': () => {
    resetMock();
    deletePlayer('p4');
    const g = store.games.find(x => x.config.players.some(isDeletedId));
    return g ? `#/partie/${g.id}` : '#/historique';
  },
  // Lot 2 : premier lancement, reprise d'une fin de manche ou de partie, photo d'avatar (recadrage, erreur, en jeu)
  // Lot 4 : deux variantes du rouge d'accent de l'accueil (« bande » retenue)
  accueil: () => '#/',
  'accueil-reprendre': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20'); return '#/'; },
  // Lot 5 : premier lancement de l'APK (import de la sauvegarde de la version web, ou à zéro)
  'premier-lancement-apk': () => { store.players = []; store.games = []; store.current = null; store.lastSetup = null; store.mockApk = true; return '#/'; },
  'reglages-apk': () => { store.mockApk = true; store.mockUpdate = { current: '0.6.0', latest: '0.6.0', available: false, state: 'idle', msg: 'Strela est à jour.' }; return '#/reglages'; },
  // Lot 6 : mise à jour trouvée par la recherche automatique (repère à l'accueil et dans les Réglages), variante Play,
  // écran À propos (web, APK GitHub, Google Play)
  'maj-disponible': () => { store.mockApk = true; store.mockUpdate = { current: '0.6.0', latest: '0.6.1', available: true, state: 'idle', msg: 'Version 0.6.1 disponible.', auto: true }; return '#/'; },
  'reglages-maj': () => { store.mockApk = true; store.mockUpdate = { current: '0.6.0', latest: '0.6.1', available: true, state: 'idle', msg: 'Version 0.6.1 disponible.' }; return '#/reglages'; },
  'reglages-maj-telechargement': () => { store.mockApk = true; store.mockUpdate = { current: '0.6.0', latest: '0.6.1', available: true, state: 'downloading', progress: 42 }; return '#/reglages'; },
  'reglages-play': () => { store.mockApk = 'play'; store.mockUpdate = null; return '#/reglages'; },
  'apropos-apk': () => { store.mockApk = true; return '#/apropos'; },
  'apropos-play': () => { store.mockApk = 'play'; return '#/apropos'; },
  'premier-lancement': () => { store.players = []; store.games = []; store.current = null; store.lastSetup = null; return '#/'; },
  'reprendre-manche': () => { setGame(cfg(['p1', 'p2'], 301, 'double', 2), 'T20 T20 T20 20 1 5 T20 T11 D14'); store.current.validated = 6; return '#/'; },
  'reprendre-fin': () => { setGame(cfg(['p1', 'p2', 'p3'], 301), 'T20 T20 T20 20 1 5 T19 S7 S3 T20 T11 D14'); return '#/'; },
  'nouvelle-en-cours': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20'); store.setupDraft = null; return '#/nouvelle'; },
  'nouvelle-confirmer': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20'); store.setupDraft = { ...store.lastSetup, confirm: true }; return '#/nouvelle'; },
  recadrage: () => { store.draft = null; openDraft('p2'); openCrop(SAMPLE_PHOTO, SAMPLE_SIZE.w, SAMPLE_SIZE.h, 'p2'); return '#/recadrage'; },
  'recadrage-zoom': () => {
    store.draft = null; openDraft('p2'); openCrop(SAMPLE_PHOTO, SAMPLE_SIZE.w, SAMPLE_SIZE.h, 'p2');
    Object.assign(store.crop, { zoom: 2.5, cx: 320, cy: 266 });
    return '#/recadrage';
  },
  'fiche-photo': () => { givePhoto('p2'); store.draft = null; return '#/joueur/p2'; },
  'photo-erreur': () => {
    store.draft = null;
    Object.assign(openDraft('p2'), { photoError: PHOTO_ERRORS.heavy(31.4 * 1048576) });
    store.draft.avatar.kind = 'photo';
    return '#/joueur/p2';
  },
  // Guillaume (photo) dans la bande des autres : en gris ; Mathilde (photo) au bandeau : en couleur.
  'photo-jeu': () => { givePhoto('p1'); givePhoto('p2'); setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5'); return '#/jeu'; },
  // Lot 4 : préférences de finition (Mathilde : D16, bull évité) dans la fiche et en jeu (41 → S9 D16)
  'fiche-finition': () => { prefer('p2'); store.draft = null; return '#/joueur/p2'; },
  'finition-preferee': () => { prefer('p2'); setGame(cfg(['p2', 'p1'], 301), 'T20 T20 T20 20 20 20 T20 S20 0 20 20 20'); return '#/jeu'; },
  // Lot 4 : écrans vides et erreurs
  secours: () => '#/secours',
  'stats-vide': () => { const p = store.players.find(q => q.id === 'p5'); store.games = store.games.filter(g => !g.config.players.includes('p5')); return p ? '#/stats/p5' : '#/stats'; },
  'face-vide': () => { store.games = store.games.filter(g => !(g.config.players.includes('p1') && g.config.players.includes('p4'))); return '#/face/p1/p4'; },
  'nouvelle-archives': () => { store.current = null; store.setupDraft = null; store.players.forEach(p => { p.archived = true; }); return '#/nouvelle'; },
  'base-inaccessible': () => { mockIssue({ openCode: 'OPEN', error: 'base indisponible (UnknownError)' }); return '#/'; },
  'base-recente': () => { mockIssue({ openCode: 'NEWER', error: 'base plus récente que l\'appli' }); return '#/'; },
  'stockage-plein': () => { mockIssue({ writeFail: { full: true, name: 'QuotaExceededError', at: Date.now() } }); return '#/'; },
  'stockage-plein-jeu': () => { mockIssue({ writeFail: { full: true, name: 'QuotaExceededError', at: Date.now() } }); setGame(cfg(['p1', 'p2']), 'T20 S20 S5', { pause: true }); return '#/jeu'; },
  reinit: () => { resetMock(); mockIssue({}); store.mockIssue = false; return '#/sommaire'; },
};

const L = (scene, label, hint = '') => `<a href="#/sommaire" data-act="scene" data-arg="${scene}"><span>${label}</span><span>${hint}</span></a>`;
const H = (href, label, hint = '') => `<a href="${href}"><span>${label}</span><span>${hint}</span></a>`;

export function sommaire() {
  const dark = isDark();
  return `<div class="screen">${topBar('Maquette', '#/')}
    <div class="pad" style="padding-top:14px">
      <button type="button" class="btn primary" data-act="flip-theme">${ico('theme')} PASSER EN ${dark ? 'CLAIR' : 'SOMBRE'}</button>
      <p class="note">Sur chaque écran, ${ico('theme')} en haut à droite bascule le thème et ${ico('menu')} revient ici (en partie : menu pause).
        Données fictives, en mémoire : la maquette ne touche jamais aux joueurs et aux parties enregistrés sur le téléphone.</p>
    </div>
    <div class="pad"><div class="sec">Version 0.8.0 · refonte</div>
      <p class="note" style="margin-top:0">La refonte est dans l'appli depuis la 0.8.0 (accueil A). Ici, sur une saison fictive de 14 soirées : ouvrez l'accueil puis naviguez normalement (Stats, Classement, Historique, Réglages, Nouveautés).</p>
      <button type="button" class="btn primary" data-act="scene" data-arg="v78-accueil" style="margin-bottom:12px">ACCUEIL, SAISON FICTIVE</button></div>
    <div class="pad"><div class="sec">Lot 8 · entraînement solo</div></div>
    <nav class="toc">
      ${L('tr-hub', '◆ Entraînement : coaché', 'exercice proposé, niveau')}
      ${L('tr-hub-info', '◆ Entraînement : explications (i)')}
      ${L('tr-hub-libre', '◆ Entraînement : libre', 'T19 · 15 fléchettes')}
      ${L('tr-hub-vide', '◆ Entraînement : première fois')}
      ${L('tr-hub-reprendre', '◆ Entraînement : séance en cours')}
      ${L('tr-accueil', '◆ Accueil : entraînement en cours')}
      ${L('tr-jeu-debut', '◆ Saisie : début', 'groupement')}
      ${L('tr-jeu', '◆ Saisie : en cours', 'pavé en portrait, cible en paysage')}
      ${L('tr-jeu-ext', '◆ Saisie : zone du 20 à choisir', 'nombre puis zone (23/11)')}
      ${L('tr-jeu-triple', '◆ Saisie : triple 20, zone du 20')}
      ${L('tr-jeu-double', '◆ Saisie : libre, D16, zone du 16')}
      ${L('tr-jeu-regles', '◆ Saisie : règles de l\'exercice', 'horloge')}
      ${L('tr-jeu-horshors', '◆ Saisie : hors cible posé', 'à côté de la cible, en paysage')}
      ${L('tr-jeu-horloge', '◆ Saisie : tour de l\'horloge')}
      ${L('tr-hub-cible', '◆ Entraînement : jeux de cible', 'les 10, règles du Killer')}
      ${L('tr-jeu-golf', '◆ Saisie : golf')}
      ${L('tr-fin-golf', '◆ Fin : golf')}
      ${L('tr-fin-defi', '◆ Fin : petit défi (fenêtre)', 'volée parfaite')}
      ${L('tr-stats-badges', '◆ Stats : badges d\'entraînement')}
      ${L('tr-stats-badge-fenetre', '◆ Stats : fenêtre d\'un badge', 'tireur d\'élite')}
      ${L('tr-jeu-killer', '◆ Saisie : Killer solo')}
      ${L('tr-jeu-shanghai', '◆ Saisie : Shanghai')}
      ${L('tr-jeu-moitie', '◆ Saisie : Moitié')}
      ${L('tr-jeu-cent', '◆ Saisie : Pile 100')}
      ${L('tr-jeu-hautbas', '◆ Saisie : haut contre bas')}
      ${L('tr-jeu-bull', '◆ Saisie : bull')}
      ${L('tr-jeu-score', '◆ Saisie : score libre')}
      ${L('tr-jeu-pause', '◆ Saisie : pause')}
      ${L('tr-jeu-pause-suppr', '◆ Saisie : supprimer la séance')}
      ${L('tr-jeu-loupe', '◆ Saisie : loupe', 'paysage')}
      ${L('tr-fin', '◆ Fin : groupement', 'analyse du coach')}
      ${L('tr-fin-info', '◆ Fin : explication (i)')}
      ${L('tr-fin-horloge', '◆ Fin : horloge')}
      ${L('tr-fin-hautbas', '◆ Fin : haut contre bas', 'deux cibles')}
      ${L('tr-fin-score', '◆ Fin : score libre')}
      ${L('tr-fin-vingt', '◆ Fin : 20-19-18', 'trois cibles')}
      ${L('tr-fin-bull', '◆ Fin : bull')}
      ${L('tr-fin-libre', '◆ Fin : libre')}
      ${L('tr-fin-libre-ajout', '◆ Fin : libre, série suivante')}
      ${L('tr-seance', '◆ Détail d\'une séance')}
      ${L('tr-seance-vingt', '◆ Détail : 20-19-18')}
      ${L('tr-seance-horloge', '◆ Détail : horloge')}
      ${L('tr-stats', '◆ Stats d\'entraînement')}
      ${L('tr-stats-info', '◆ Stats : explications (i)')}
      ${L('tr-stats-groupement', '◆ Stats : exercice groupement')}
      ${L('tr-stats-jeu', '◆ Stats : un jeu de fléchettes')}
      ${L('tr-stats-parties', '◆ Stats : parties seules')}
      ${L('tr-stats-deux', '◆ Stats : les deux')}
      ${L('tr-stats-vide', '◆ Stats : rien avec ces filtres')}
      ${L('armurerie', '◆ Armurerie')}
      ${L('armurerie-jeu', '◆ Armurerie : un jeu')}
      ${L('armurerie-modele', '◆ Armurerie : nouveau jeu d\'après un modèle')}
      ${L('armurerie-vierge', '◆ Armurerie : nouveau jeu vierge')}
      ${L('conseils', '◆ Conseils')}
      ${L('conseils-prise', '◆ Conseils : prise en main')}
      ${L('conseils-posture', '◆ Conseils : posture')}
      ${L('conseils-lancer', '◆ Conseils : lancer')}
      ${L('conseils-types', '◆ Conseils : types de fléchettes')}
    </nav>
    <div class="pad"><div class="sec">Version 0.14.0 · jeux en solo</div></div>
    <nav class="toc">
      ${L('tr-hub-jeux', '◆ Entraînement : jeux', 'X01 501, sortie double')}
      ${L('tr-hub-jeux-info', '◆ Jeux : explications (i)')}
      ${L('tr-hub-cricket', '◆ Jeux : Cricket, 3 manches')}
      ${L('tr-x01-debut', '◆ X01 solo : début')}
      ${L('tr-x01', '◆ X01 solo : en cours', 'pavé en portrait, cible en paysage')}
      ${L('tr-x01-finition', '◆ X01 solo : finition proposée')}
      ${L('tr-x01-bust', '◆ X01 solo : bust')}
      ${L('tr-x01-manche', '◆ X01 solo : manche gagnée', '301, 3 manches')}
      ${L('tr-x01-pause', '◆ X01 solo : pause')}
      ${L('tr-cricket-debut', '◆ Cricket solo : début')}
      ${L('tr-cricket', '◆ Cricket solo : en cours')}
      ${L('tr-cricket-fin-proche', '◆ Cricket solo : presque fermé')}
      ${L('tr-fin-x01', '◆ Fin : X01 solo', 'moyenne, finition, carte')}
      ${L('tr-fin-x01-info', '◆ Fin : X01, explications (i)')}
      ${L('tr-fin-x01-manches', '◆ Fin : 301 sortie simple, 3 manches')}
      ${L('tr-fin-cricket', '◆ Fin : Cricket solo')}
      ${L('tr-fin-cricket-jeux', '◆ Fin : Cricket, 3 manches, jeu changé')}
      ${L('tr-seance-x01', '◆ Séance : X01 solo')}
      ${L('tr-seance-cricket', '◆ Séance : Cricket solo')}
      ${L('tr-stats', '◆ Stats : triples, doubles, carte', 'jeux et parties seulement')}
      ${L('tr-stats-jeux-info', '◆ Stats : courbe des doubles, (i)')}
      ${L('tr-stats-x01', '◆ Stats : X01 solo')}
      ${L('tr-stats-cricket', '◆ Stats : Cricket solo')}
      ${L('tr-stats-secteur', '◆ Stats : un exercice', 'ni triples ni carte')}
    </nav>
    <div class="pad"><div class="sec">Version 0.13.0 · entraînement</div></div>
    <nav class="toc">
      ${L('tr-hub', '◆ Choix du jeu', 'dessin de chaque jeu, en couleurs')}
      ${L('tr-hub-autres', '◆ Exercices des autres niveaux', 'dépliés')}
      ${L('tr-hub-inter', '◆ Niveau intermédiaire', 'critères vers confirmé')}
      ${L('tr-jeu-pause', '◆ Pause : changer de jeu')}
      ${L('tr-jeu-pause-jeu', '◆ Pause : choix du nouveau jeu')}
      ${L('tr-jeu-t20', '◆ Saisie : triple 20', 'T armé d\'office')}
      ${L('tr-jeu-tourdoubles', '◆ Saisie : tour des doubles')}
      ${L('tr-fin-t20', '◆ Fin : triple 20', 'objectif du niveau')}
      ${L('tr-fin-triples', '◆ Fin : triples 20 et 19')}
      ${L('tr-fin-doubles', '◆ Fin : doubles de finition')}
      ${L('tr-fin-tourdoubles', '◆ Fin : tour des doubles')}
      ${L('tr-fin-bull25', '◆ Fin : centre 25 / 50')}
      ${L('tr-fin-changement', '◆ Fin : jeu changé en cours', 'par jeu de fléchettes')}
      ${L('tr-seance-vingt', '◆ Séance : deux jeux')}
      ${L('tr-seance-jeu', '◆ Séance : corriger le jeu noté')}
      ${L('tr-seance-joueur', '◆ Séance : changer de joueur')}
      ${L('tr-seance-note', '◆ Séance : avec une note')}
      ${L('tr-seance-cote', '◆ Séance : mise de côté')}
      ${L('tr-seance-arretee', '◆ Séance arrêtée : reprendre')}
      ${L('tr-seance-suppr', '◆ Séance : supprimer')}
      ${L('armurerie-jeu', '◆ Armurerie : couleurs des pièces')}
    </nav>
    <nav class="toc">
      ${L('v78-accueil', '★ Accueil', 'saison fictive, à parcourir')}
      ${L('v78-accueil-soiree', '★ Accueil, soirée en cours')}
      ${L('v78-stats', '★ Stats : joueur', 'chiffres regroupés')}
      ${L('v78-stats-info', '★ Stats : explications (i) ouvertes')}
      ${L('v78-stats-zoom', '★ Stats : courbe zoomée ×4', 'valeurs sur les points')}
      ${L('v78-stats-pire', '★ Stats : courbe « Pire volée »', '×2')}
      ${L('v78-stats-point', '★ Stats : partie touchée sur la courbe')}
      ${L('v78-stats-compare', '★ Stats : comparer deux joueurs', 'lot 9')}
      ${L('v78-stats-volees', '★ Stats : volées dépliées', 'meilleures, pire de chaque partie')}
      ${L('v78-classement', '★ Classement', 'palmarès')}
      ${L('v78-classement-info', '★ Classement : pire volée', 'explications ouvertes')}
      ${L('v78-classement-verres', '★ Classement : verres')}
      ${L('ck-nouvelle', '★ Cricket : nouvelle partie', 'lot 10')}
      ${L('ck-face', '★ Cricket : face à face', '2 joueurs, avec points')}
      ${L('ck-face-valider', '★ Cricket : volée à valider')}
      ${L('ck-face-triple', '★ Cricket : triple armé')}
      ${L('ck-face-grille', '★ Cricket : 2 joueurs en grille')}
      ${L('ck-grille', '★ Cricket : grille à 4')}
      ${L('ck-grille-8', '★ Cricket : grille à 8', 'cut-throat')}
      ${L('ck-sans', '★ Cricket : sans points', '3 joueurs')}
      ${L('ck-manche', '★ Cricket : manche gagnée', 'en 2 manches')}
      ${L('ck-pause', '★ Cricket : pause')}
      ${L('ck-fin', '★ Cricket : fin de partie')}
      ${L('ck-accueil', '★ Cricket : REPRENDRE à l\'accueil')}
      ${L('ck-detail', '★ Cricket : détail d\'une partie', 'historique')}
      ${L('ck-historique', '★ Historique avec Cricket')}
      ${L('ck-stats', '★ Stats : Cricket', 'MPR')}
      ${L('v78-honneur', '★ Tableau d\'honneur', 'badges et records, lot 9')}
      ${L('v78-honneur-badges', '★ Tableau d\'honneur : badges seuls')}
      ${L('v78-stats-vitrine', '★ Stats : records et badges', 'vitrine, lot 9')}
      ${L('v78-badge-rangs', '★ Fenêtre d\'un badge à rangs', 'lot 7.8')}
      ${L('v78-badge-180', '★ Fenêtre d\'un badge', 'lot 7.8 : partie et volée')}
      ${L('v78-historique', '★ Historique', 'par soirée, filtres')}
      ${L('v78-historique-filtre', '★ Historique : Mathilde, ce mois-ci')}
      ${L('v78-historique-tout', '★ Historique : soirées dépliées')}
      ${L('v78-historique-vide', '★ Historique : aucun résultat')}
      ${L('v78-reglages', '★ Réglages', 'cartes')}
      ${L('v78-reglages-ouverts', '★ Réglages : explications et diagnostic ouverts')}
      ${L('v78-reglages-apk', '★ Réglages : appli Android', 'mise à jour disponible')}
      ${L('v78-nouveautes', '★ Nouveautés', 'changelog')}
      ${L('v78-soiree-dash', '★ Tableau de bord d\'une soirée', 'hier soir, à imprimer')}
      ${L('v78-soiree-dash-tout', '★ Tableau de bord : tout déplié', '0.11.1 : défis, badges, chiffres')}
      ${L('v78-soiree-dash-tournees', '★ Tableau de bord : tournées notées', '0.11.2 : RETIRER LES TOURNÉES NOTÉES')}
      ${L('v78-soiree-dash-tournees-ok', '★ Tableau de bord : retirer les tournées ?', '0.11.2 : avant → après')}
      ${L('v78-soiree-dash-ancienne', '★ Tableau de bord d\'une soirée plus ancienne')}
      ${L('v78-historique-selection', '★ Historique : sélection', 'regrouper en soirée')}
      ${L('v78-historique-ajouter', '★ Historique : ajouter à une soirée')}
      ${L('v78-historique-jour', '★ Historique : jour hors soirée', 'EN FAIRE UNE SOIRÉE')}
      ${L('v78-stats-cible', '★ Stats : cible chiffrée', 'impacts par secteur')}
    </nav>
    <div class="pad"><div class="sec">Écrans</div></div>
    <nav class="toc">
      ${H('#/', '1 · Accueil')}
      ${L('accueil-reprendre', '1 · Accueil avec REPRENDRE')}
      ${L('premier-lancement', '1 · Accueil au premier lancement', 'aucun joueur')}
      ${L('premier-lancement-apk', '1 · Premier lancement de l\'appli Android', 'importer la version web')}
      ${L('reprendre', '1 · Accueil avec REPRENDRE', 'partie en cours')}
      ${L('reprendre-manche', '1 · REPRENDRE une fin de manche', 'pas encore validée')}
      ${L('reprendre-fin', '1 · REPRENDRE une fin de partie', 'pas encore rangée')}
      ${H('#/joueurs', '2 · Joueurs', 'liste')}
      ${L('fiche-new', '2 · Fiche : création')}
      ${L('fiche-edit', '2 · Fiche : modification', 'archiver')}
      ${L('fiche-photo', '2 · Fiche : avatar photo')}
      ${L('photo-erreur', '2 · Fiche : photo refusée', 'trop lourde')}
      ${L('fiche-finition', '2 · Fiche : finition', 'D16, bull évité')}
      ${L('fiche-animation', '2 · Fiche : animation de tour', 'appui = aperçu')}
      ${L('recadrage', '2 · Recadrage de la photo', 'glisser, pincer')}
      ${L('recadrage-zoom', '2 · Recadrage : zoom ×2,5')}
      ${L('suppression', '2 · Supprimer un joueur', 'confirmation')}
      ${L('suppression-refus', '2 · Supprimer pendant une partie', 'refusé')}
      ${L('joueur-supprime', '8 · Partie avec un joueur supprimé', 'Sacha supprimé')}
      ${H('#/avatars', '3 · Banque d\'avatars', '41 icônes par thème')}
      ${L('banque-carabine', '3 · Banque : carabine choisie', 'fond bordeaux')}
      ${L('fiche-fonds', '2 · Fiche : 16 fonds', 'fond lavande')}
      ${H('#/nouvelle', '4 · Nouvelle partie', 'derniers réglages')}
      ${L('nouvelle-en-cours', '4 · Nouvelle partie', 'une partie en cours')}
      ${L('nouvelle-confirmer', '4 · LANCER pendant une partie', 'confirmation')}
      ${L('jeu', '5 · Jeu : début de partie', '501 · 2 joueurs')}
      ${L('pause', '5 · Jeu : menu pause')}
      ${L('abandon', '5 · Jeu : abandonner ?', 'confirmation')}
      ${L('supprimer-en-cours', '5 · Jeu : supprimer la partie ?', 'partie d\'essai')}
      ${L('fin-manche', '6 · Fin de manche')}
      ${L('fin-partie', '7 · Fin de partie', 'revanche')}
      ${H('#/historique', '8 · Historique')}
      ${H('#/partie/g1', '8 · Détail d\'une partie', 'volée par volée')}
      ${L('partie-supprimer', '8 · Supprimer une partie', 'confirmation')}
      ${L('histo-selection', '8 · Historique : sélection', 'appui long')}
      ${L('histo-selection-confirmer', '8 · Supprimer 3 parties', 'confirmation')}
      ${H('#/stats/p1', '9 · Stats joueur')}
      ${H('#/face/p1/p2', '9 · Face-à-face', 'Guillaume contre Mathilde')}
      ${H('#/face/p3/p1', '9 · Face-à-face', 'à 3 et 4 joueurs')}
      ${H('#/reglages', '10 · Réglages')}
      ${L('reglages-apk', '10 · Réglages de l\'appli Android', 'mise à jour, désinstallation')}
      ${L('maj-disponible', '1 · Accueil : mise à jour disponible', 'repère discret')}
      ${L('reglages-maj', '10 · Réglages : mise à jour disponible', 'INSTALLER')}
      ${L('reglages-maj-telechargement', '10 · Réglages : téléchargement', '42 %')}
      ${L('reglages-play', '10 · Réglages de la version Google Play', 'sans mise à jour intégrée')}
      ${H('#/apropos', '11 · À propos', 'version web')}
      ${L('apropos-apk', '11 · À propos : appli Android', 'GitHub')}
      ${L('apropos-play', '11 · À propos : version Google Play')}
      ${L('sauvegarde-apercu', '10 · Importer : aperçu', 'REMPLACER / FUSIONNER')}
      ${L('sauvegarde-remplacer', '10 · Importer : tout remplacer ?', 'confirmation')}
      ${L('sauvegarde-fusionner', '10 · Importer : fusionner ?', 'confirmation')}
      ${L('sauvegarde-refus', '10 · Importer : fichier refusé', 'version future')}
    </nav>
    <div class="pad"><div class="sec">États de jeu</div></div>
    <nav class="toc">
      ${L('arme-d', 'D armé', 'double')}
      ${L('arme-t', 'T armé', 'triple · 25 grisé')}
      ${L('volee', 'Volée en attente de validation', '3 fléchettes')}
      ${L('volee-4', 'Volée en attente : 4 joueurs', 'VALIDER')}
      ${L('volee-8', 'Volée en attente : 8 joueurs', 'VALIDER')}
      ${L('bust', 'Bust en attente de validation', 'ANNULER possible')}
      ${L('annonce', 'Annonce « À TOI »', 'figée')}
      ${L('tsia', 'Tsia lance', 'les voyelles tombent')}
      ${L('tsia-volee', 'Volée de Tsia en attente', 'voyelles déjà tombées')}
      ${L('cible-tour1', 'Petite cible au 1er tour', 'volée en cours seule')}
      ${L('cible', 'Petite cible au 2e tour', 'vidée à chaque volée')}
      ${L('cible-grande', 'Cible agrandie', 'VOLÉE')}
      ${L('cible-manche', 'Cible agrandie', 'MANCHE')}
      ${L('cible-seule', 'Cible seule', 'couleurs réglementaires')}
      ${L('manches', 'Manches gagnées', 'premier à 3')}
      ${L('histo-cours', 'Historique de la partie en cours', 'panneau')}
      ${L('panneau-case', 'Panneau : case d\'une manche précédente', 'sur la cible')}
      ${L('correction', 'Corriger une fléchette', 'sélecteur')}
      ${L('correction-confirmer', 'Corriger une fléchette', 'confirmation')}
      ${L('correction-refus', 'Corriger une fléchette', 'refusée')}
      ${L('histo-deux', 'Historique : 2 joueurs', 'ratés, bust ouvert, finition')}
      ${L('histo-huit', 'Historique en cours : 8 joueurs', 'défile de côté')}
      ${L('histo-huit-detail', 'Historique terminé : 8 joueurs', 'finition ouverte')}
      ${L('finition', 'Finition proposée', 'reste 100')}
      ${L('finition-preferee', 'Finition au double préféré', '41 : S9 D16')}
      ${L('en-tete', 'Joueur en tête', 'il lance')}
      ${L('en-tete-autre', 'Joueur en tête', 'dans la bande')}
      ${L('nul-zero', 'Célébration d\'un nul : 0', 'ironique')}
      ${L('nul-bas', 'Célébration d\'un nul : sous 10')}
      ${L('nul-bust', 'Célébration d\'un nul : bust')}
      ${L('nul-serie', 'Célébration d\'un nul : série')}
      ${L('jusquau-bout', 'Jusqu\'au bout', 'le gagnant a fini')}
      ${L('jusquau-bout-place', 'Jusqu\'au bout : 2e place', 'en attente')}
      ${L('verres', 'Verres et alcoolémie', 'menu pause')}
      ${L('verres-jeu', 'Alcoolémie en jeu', 'Mathilde lance')}
      ${L('verres-histo', 'Verres dans l\'historique', 'partie en cours')}
      ${L('verres-huit', 'Verres dans l\'historique', '8 joueurs')}
      ${L('fin-verres', 'Fin de partie : verres')}
      ${L('volee-meilleure', 'Volée : meilleure de la soirée', 'au résultat')}
      ${L('volee-troisieme', 'Volée : 3e meilleure de la soirée', '140')}
      ${L('volee-pire', 'Volée : pire de la soirée')}
      ${L('volee-pire-bust', 'Volée : bust parmi les pires')}
      ${L('verres-panneau', 'Verres : panneau du bandeau', 'sans la pause')}
      ${L('soiree-debut', 'Soirée : débuter', 'choix des joueurs')}
      ${L('soiree', 'Soirée en cours', '2 parties jouées')}
      ${L('soiree-partie', 'Soirée pendant une partie')}
      ${L('accueil-soiree', 'Accueil avec une soirée')}
      ${L('nouvelle-soiree', 'Nouvelle partie pendant la soirée')}
      ${L('nouvelle-handicap', '2 · Nouvelle partie : handicap', 'lot 9')}
      ${L('jeu-defi', '3 · Défi tiré au sort', 'carte, lot 9')}
      ${L('jeu-defi-rappel', '3 · Défi : rappel pendant la volée')}
      ${L('jeu-defi-resultat', '3 · Défi raté : gage à noter')}
      ${L('jeu-defi-reussi', '3 · Défi réussi (avec un 100+)', 'lot 7.8 : VALIDER ferme aussi le bandeau')}
      ${L('jeu-defi-ecart', '3 · Défi « grand écart »', 'lot 7.8, précision sous le texte')}
      ${L('jeu-defi-gauche', '3 · Défi « main gauche » à déclarer', 'lot 7.8')}
      ${L('jeu-defi-tsia', '3 · Défi de Tsia : dégrisement express', 'lot 7.8')}
      ${L('jeu-defi-paysage', '3 · Défi en paysage', 'lot 7.8')}
      ${L('jeu-defi-histo', '3 · Défis dans le tableau de la partie', 'lot 7.8 : étoiles')}
      ${L('jeu-rangs', 'Pastilles de rang', 'lot 7.8, 4 joueurs')}
      ${L('nul-uns', 'Atila, le roi des uns', 'lot 7.8')}
      ${L('nul-moto', 'Angelina dans le fossé', 'lot 7.8')}
      ${L('jeu-handicap', '3 · Partie en handicap', 'départ 701 / 301')}
      ${L('verres-soiree', 'Verres de la soirée en jeu', 'panneau')}
      ${L('verres-soiree-jeu', 'Verres de la soirée en jeu', 'Mathilde x3')}
      ${L('verres-soiree-histo', 'Verres de la soirée dans l\'historique')}
      ${L('fin-tournee', 'Fin de partie : classement', 'jusqu\'au bout')}
      ${L('fin-egalite', 'Fin de partie : derniers à égalité')}
      ${L('fete-100', 'Célébration 100+', 'discrète')}
      ${L('fete-140', 'Célébration 140+', 'couleur du joueur')}
      ${L('fete-180', 'Célébration 180', 'moitié de l\'écran')}
      ${L('fete-finition', 'Célébration d\'une finition', 'fin de manche')}
      ${L('fete-finition-100', 'Célébration d\'une finition de 100+', 'fin de manche')}
      ${L('huit', '8 joueurs')}
      ${L('long', 'Pseudo très long', 'en jeu')}
      ${L('long-fiche', 'Pseudo très long', 'fiche')}
      ${L('solo', 'Un seul joueur', 'entraînement')}
      ${L('solo-attente', 'Un seul joueur : volée en attente', 'VALIDER seul')}
      ${L('photo-jeu', 'Avatars photo en jeu', 'les autres en gris')}
    </nav>
    <div class="pad"><div class="sec">Paysage</div><p class="note" style="margin-top:0">Tourne le téléphone : l'écran de jeu passe en paysage, saisie sur la cible.</p></div>
    <nav class="toc">
      ${L('paysage', 'Paysage', 'saisie sur la cible')}
      ${L('loupe', 'Loupe active sur T20', 'figée')}
      ${L('paysage-attente', 'Paysage : volée en attente', 'VALIDER')}
      ${L('fete-180-paysage', 'Paysage : célébration 180', 'saisie possible dessous')}
    </nav>
    <div class="pad"><div class="sec">Données</div></div>
    <nav class="toc">
      ${L('aucun-joueur', 'Aucun joueur', 'liste vide')}
      ${L('nouvelle-vide', 'Aucun joueur', 'nouvelle partie')}
      ${L('historique-vide', 'Historique vide')}
      ${L('stats-vide', 'Stats sans partie', 'NOUVELLE PARTIE')}
      ${L('face-vide', 'Face-à-face sans partie commune', 'jouer entre eux')}
      ${L('nouvelle-archives', 'Nouvelle partie : tous archivés')}
      ${L('base-inaccessible', 'Base inaccessible', 'accueil')}
      ${L('base-recente', 'Base d\'une version plus récente', 'accueil')}
      ${L('stockage-plein', 'Stockage plein', 'RÉESSAYER · EXPORTER')}
      ${L('stockage-plein-jeu', 'Stockage plein en partie', 'menu pause')}
      ${L('sauvegarde-refus', 'Import : fichier refusé')}
      ${L('photo-erreur', 'Photo illisible ou trop lourde')}
      ${L('secours', 'Écran de secours', 'erreur inattendue')}
      ${L('reinit', 'Rétablir les données fictives', '5 joueurs · 15 parties')}
      ${H('./', 'Quitter la maquette', 'vraies données')}
    </nav>
    <div class="pad"><div class="sec">Icône d'appli</div>
      <div class="icon-show" aria-label="Icône Strela en grand et en petit">
        <figure><img src="assets/icon-512.png" width="160" height="160" alt="Icône Strela"><figcaption>160 px</figcaption></figure>
        <figure><span class="ic-adaptive" style="--s:72px"><img src="assets/icon-maskable-512.png" alt=""></span><figcaption>Android</figcaption></figure>
        <figure><span class="ic-adaptive mono" style="--s:72px"><i style="-webkit-mask-image:url(assets/icon-mono.svg);mask-image:url(assets/icon-mono.svg)"></i></span><figcaption>à thème</figcaption></figure>
        <figure><img src="assets/icon-192.png" width="48" height="48" alt=""><figcaption>48 px</figcaption></figure>
        <figure><img src="assets/icon-192.png" width="24" height="24" alt=""><figcaption>24 px</figcaption></figure>
      </div>
      <p class="note">« Soyouz » : fléchette verticale, pointe en haut, fût clair strié, ailettes rouges (стрела = flèche).
        Android découpe l'icône (ici en rond) ; l'icône à thème d'Android 13 et plus en garde la silhouette, teintée.</p>
    </div>
  </div>`;
}

export const actions = {
  scene(name, el, ev) {
    if (ev) ev.preventDefault();
    const target = SCENES[name] ? SCENES[name]() : '#/sommaire';
    go(target);
  },
  'flip-theme'() {
    saveSetting('theme', isDark() ? 'light' : 'dark');
    applyTheme();
    go(location.hash || '#/', { replace: true });
  },
};
