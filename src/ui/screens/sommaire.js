// Sommaire de maquette (?maquette dans l'adresse) : lien direct vers chaque écran et vers les états
// difficiles à provoquer. Les états de jeu sont fabriqués avec le vrai moteur ; l'annonce « À TOI » et la loupe,
// qui ne durent qu'un instant, restent figées jusqu'à la prochaine touche. Tout est en mémoire (données fictives de
// maquette.js) : la base du téléphone n'est jamais ouverte. Chargé seulement avec ?maquette (import dynamique).
import { store, startGame, freshUi, currentState, deletePlayer } from '../store.js';
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
import { setHomeVariant, homeVariant } from './home.js';
import { seasonMock } from '../maquette.js';
import { setHome2Variant } from './v2/home2.js';
import { presetStats2 } from './v2/stats2.js';
import { presetHistory2 } from './v2/history2.js';
import { presetSettings2 } from './settings.js';

// Lot 7 : jouer jusqu'au bout à 4 (301, sortie simple) ; après PO1, Guillaume, Mathilde et Karim sont à 80, Sacha à 301.
const PLAYON = () => ({ ...cfg(['p1', 'p2', 'p3', 'p4'], 301, 'single'), playOn: true });
const PO1 = 'T20 T20 T20  T20 T20 T20  T20 T20 T20  0 0 0  S20 S20 S1  S20 S20 S1  S20 S20 S1  0 0 0';
// Verres (lot 7.1 : avec leur place dans la partie, `at` = fléchettes jouées à ce moment)
const DRINKS = () => { const h = 3600e3, now = Date.now(); return { p1: [{ t: now - 2 * h, at: 0 }], p2: [{ t: now - h, at: 0 }, { t: now - 0.5 * h, at: 2 }, { t: now - 0.1 * h, at: 3 }] }; };
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

// Lot 7.8 (maquette de la refonte) : une saison de soirées et les nouveaux écrans (store.preview).
const v78 = (route, prep = () => {}) => () => { seasonMock(); setHome2Variant('tableau'); presetStats2(); presetHistory2(); presetSettings2(); prep(); return route; };

export const SCENES = {
  'v78-accueil': v78('#/'),
  'v78-accueil-console': v78('#/', () => setHome2Variant('console')),
  'v78-accueil-soiree': v78('#/', () => { store.soiree = { id: 's1', startedAt: Date.now() - 2 * 3600e3, players: ['p1', 'p2', 'p3'], drinks: {} }; }),
  'v78-console-soiree': v78('#/', () => { setHome2Variant('console'); store.soiree = { id: 's1', startedAt: Date.now() - 2 * 3600e3, players: ['p1', 'p2', 'p3'], drinks: {} }; }),
  'v78-stats': v78('#/stats/p1'),
  'v78-stats-info': v78('#/stats/p1', () => presetStats2({ info: ['score', 'courbe'] })),
  'v78-stats-zoom': v78('#/stats/p1', () => { presetStats2({ zoom: 4, metric: 'average' }); store.preview = true; }),
  'v78-stats-pire': v78('#/stats/p2', () => presetStats2({ metric: 'worstVisit', zoom: 2 })),
  'v78-stats-point': v78('#/stats/p1', () => { presetStats2({ zoom: 2 }); const g = store.games.find(x => x.config.players.includes('p1')); presetStats2({ zoom: 2, point: g.id }); }),
  'v78-stats-volees': v78('#/stats/p1', () => presetStats2({ folds: ['best', 'worst'] })),
  'v78-classement': v78('#/classement'),
  'v78-classement-info': v78('#/classement', () => presetStats2({ info: ['palmares', 'classement'], rank: 'worstVisit' })),
  'v78-classement-verres': v78('#/classement', () => presetStats2({ rank: 'drinks' })),
  'v78-historique': v78('#/historique'),
  'v78-historique-filtre': v78('#/historique', () => { const d = new Date(); presetHistory2({ player: 'p2', month: `${d.getFullYear()}-${d.getMonth()}` }); }),
  'v78-historique-tout': v78('#/historique', () => presetHistory2({ open: store.games.map(g => (g.soiree ? `s:${g.soiree}` : '')).filter(Boolean) })),
  'v78-historique-vide': v78('#/historique', () => presetHistory2({ player: 'p11', result: 'abandoned' })),
  'v78-reglages': v78('#/reglages'),
  'v78-reglages-ouverts': v78('#/reglages', () => presetSettings2({ info: ['aff', 'son', 'vib'], diag: true })),
  'v78-reglages-apk': v78('#/reglages', () => { store.mockApk = true; store.mockUpdate = { current: '0.7.7', latest: '0.7.8', available: true }; }),
  'v78-nouveautes': v78('#/nouveautes'),
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
  'nouvelle-vide': () => { store.players = []; store.current = null; store.setupDraft = null; return '#/nouvelle'; },
  'historique-vide': () => { store.games = []; return '#/historique'; },
  // Lot 3 : sauvegarde (aperçu d'un fichier, confirmations, fichier refusé)
  'sauvegarde-apercu': () => { presetBackup({ preview: mockBackup(), file: 'strela-20261030-2118.json' }); return '#/reglages'; },
  'sauvegarde-remplacer': () => { presetBackup({ preview: mockBackup(), file: 'strela-20261030-2118.json', ask: 'replace' }); return '#/reglages'; },
  'sauvegarde-fusionner': () => { presetBackup({ preview: mockBackup(), file: 'strela-20261030-2118.json', ask: 'merge' }); return '#/reglages'; },
  'sauvegarde-refus': () => { presetBackup({ error: 'Sauvegarde faite par une version plus récente de Strela (9.0.0) : mets l\'appli à jour avant de l\'importer.' }); return '#/reglages'; },
  // Lot 3 : suppression de parties (sélection par appui long, confirmation ; détail d'une partie)
  'histo-selection': () => { presetHistory({ ids: store.games.slice(0, 3).map(g => g.id) }); return '#/historique'; },
  'histo-selection-confirmer': () => { presetHistory({ ids: store.games.slice(0, 3).map(g => g.id), ask: true }); return '#/historique'; },
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
  'accueil-bande': () => { setHomeVariant('bande'); return '#/'; },
  'accueil-filet': () => { setHomeVariant('filet'); return '#/'; },
  'accueil-filet-reprendre': () => { setHomeVariant('filet'); setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20'); return '#/'; },
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
  reinit: () => { resetMock(); setHomeVariant('bande'); mockIssue({}); store.mockIssue = false; return '#/sommaire'; },
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
    <div class="pad"><div class="sec">Lot 7.8 · refonte (maquette)</div>
      <p class="note" style="margin-top:0">Saison fictive : 14 soirées de 3 à 6 parties. Seule la maquette montre la refonte ; l'appli installée garde les écrans actuels tant qu'elle n'est pas validée.</p></div>
    <nav class="toc">
      ${L('v78-accueil', '★ Accueil A « tableau de bord »', 'à parcourir')}
      ${L('v78-accueil-console', '★ Accueil B « console »')}
      ${L('v78-accueil-soiree', '★ Accueil A, soirée en cours')}
      ${L('v78-console-soiree', '★ Accueil B, soirée en cours')}
      ${L('v78-stats', '★ Stats : joueur', 'chiffres regroupés')}
      ${L('v78-stats-info', '★ Stats : explications (i) ouvertes')}
      ${L('v78-stats-zoom', '★ Stats : courbe zoomée ×4', 'valeurs sur les points')}
      ${L('v78-stats-pire', '★ Stats : courbe « Pire volée »', '×2')}
      ${L('v78-stats-point', '★ Stats : partie touchée sur la courbe')}
      ${L('v78-stats-volees', '★ Stats : volées dépliées', 'meilleures, pire de chaque partie')}
      ${L('v78-classement', '★ Classement', 'palmarès')}
      ${L('v78-classement-info', '★ Classement : pire volée', 'explications ouvertes')}
      ${L('v78-classement-verres', '★ Classement : verres')}
      ${L('v78-historique', '★ Historique', 'par soirée, filtres')}
      ${L('v78-historique-filtre', '★ Historique : Mathilde, ce mois-ci')}
      ${L('v78-historique-tout', '★ Historique : soirées dépliées')}
      ${L('v78-historique-vide', '★ Historique : aucun résultat')}
      ${L('v78-reglages', '★ Réglages', 'cartes')}
      ${L('v78-reglages-ouverts', '★ Réglages : explications et diagnostic ouverts')}
      ${L('v78-reglages-apk', '★ Réglages : appli Android', 'mise à jour disponible')}
      ${L('v78-nouveautes', '★ Nouveautés', 'changelog')}
    </nav>
    <div class="pad"><div class="sec">Écrans</div></div>
    <nav class="toc">
      ${H('#/', '1 · Accueil', `variante « ${homeVariant()} »`)}
      ${L('accueil-bande', '1 · Accueil, variante A « bande »', 'retenue')}
      ${L('accueil-filet', '1 · Accueil, variante B « filet »')}
      ${L('accueil-filet-reprendre', '1 · Variante B avec REPRENDRE')}
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
      ${L('verres-soiree', 'Verres de la soirée en jeu', 'panneau')}
      ${L('verres-soiree-jeu', 'Verres de la soirée en jeu', 'Mathilde x3')}
      ${L('verres-soiree-histo', 'Verres de la soirée dans l\'historique')}
      ${L('fin-tournee', 'Fin de partie : classement', 'le dernier paie')}
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
