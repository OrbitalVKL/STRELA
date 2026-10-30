// Strela — état de la maquette, en mémoire (lot 1) : joueurs, historique, partie en cours, réglages.
// Seuls les réglages d'affichage sont gardés dans le navigateur (strela.theme, strela.night, strela.vibrate,
// strela.anim). Au lot 2, joueurs et parties passeront dans IndexedDB avec la même forme :
//   joueur { id, name, avatar, archived }
//   partie { id, startedAt, config, darts[], abandoned } ; fléchette { segment, multiplier, pos? } (pos = point
//     touché sur la cible en paysage, repère de src/engine/board.js)
//   partie en cours { id, startedAt, config, darts[], validated } (validated : voir turn.js) + ui (non enregistré)

import { computeState, STATUS } from '../engine/x01.js';
import { MOCK_PLAYERS, EXTRA_PLAYERS, mockGames } from './mock.js';
import { deletePlayer as removePlayer, deletionImpact, isDeletedId } from '../engine/players.js';

const clone = o => JSON.parse(JSON.stringify(o));

export const store = {
  players: [],
  games: [],
  current: null,     // { id, config, darts, startedAt, validated, ui: voir freshUi() }
  lastSetup: null,   // derniers réglages de « Nouvelle partie »
  draft: null,       // fiche joueur en cours de modification
  setupDraft: null,  // écran « Nouvelle partie » en cours
  settings: { theme: 'auto', night: false, vibrate: true, anim: true },
  maquette: false,
};

export function resetMock() {
  const players = MOCK_PLAYERS.map(clone);
  store.players = players;
  store.games = mockGames(players);
  store.current = null;
  store.draft = null;
  store.setupDraft = null;
  // Derniers réglages : ceux de la partie la plus récente.
  const last = store.games[0];
  store.lastSetup = { players: [...last.config.players], startScore: last.config.startScore, outMode: last.config.outMode, legsToWin: last.config.legsToWin };
}

export function ensureExtraPlayers(ids) {
  for (const p of EXTRA_PLAYERS) if (ids.includes(p.id) && !store.players.some(q => q.id === p.id)) store.players.push(clone(p));
}

/** Joueur supprimé (identifiant anonyme « ~<rang> » dans une partie) : nom et avatar neutres. */
export const DELETED_PLAYER = Object.freeze({ name: 'Joueur supprimé', avatar: Object.freeze({ kind: 'deleted' }), deleted: true });

export const playerById = id => (isDeletedId(id) ? { id, ...DELETED_PLAYER }
  : store.players.find(p => p.id === id) || EXTRA_PLAYERS.find(p => p.id === id) || { id, name: '?', avatar: { kind: 'initials', color: 7 } });
export const activePlayers = () => store.players.filter(p => !p.archived);

let seq = 100;
export const newId = prefix => `${prefix}${++seq}${Date.now().toString(36).slice(-3)}`;

/** Démarre une partie en mémoire. */
export function startGame(setup) {
  const config = { startScore: setup.startScore, outMode: setup.outMode, legsToWin: setup.legsToWin, players: [...setup.players] };
  store.lastSetup = { ...setup, players: [...setup.players] };
  store.current = { id: newId('g'), config, darts: [], startedAt: Date.now(), validated: 0, ui: freshUi() };
  return store.current;
}

/**
 * État d'affichage de la partie en cours (non enregistré) : multiplicateur armé, menu pause et confirmation,
 * panneau ouvert ('history' | 'board' | null), vue de la cible agrandie ('visit' | 'leg'), annonce du joueur suivant (rang), glissement du bandeau,
 * loupe figée du sommaire ({ x, y }), `frozen` : annonce figée (sommaire de maquette).
 */
export const freshUi = () => ({ mult: 1, pause: false, confirm: false, panel: null, boardView: 'visit', announce: null, slide: false, loupe: null, frozen: false });

export const currentState = () => (store.current ? computeState(store.current.config, store.current.darts) : null);

/** Range la partie en cours dans l'historique (finie ou abandonnée) et la retire. */
export function archiveCurrent(abandoned) {
  const g = store.current;
  if (!g) return;
  const s = currentState();
  if (g.darts.length && (abandoned || s.status === STATUS.FINISHED)) {
    store.games.unshift({ id: g.id, startedAt: g.startedAt, config: g.config, darts: [...g.darts], abandoned: !!abandoned });
  }
  store.current = null;
}

// ------------------------------------------------------------------ suppression d'un joueur
/** Le joueur est-il dans la partie en cours ? (il ne peut alors pas être supprimé) */
export const inCurrentGame = id => !!(store.current && store.current.config.players.includes(id));

/** Parties gardées (anonymisées) et effacées si l'on supprime ce joueur. */
export const deletionPreview = id => deletionImpact(store.games, id);

/** Supprime un joueur (fiche, stats) ; ses parties avec d'autres restent, anonymisées. */
export function deletePlayer(id) {
  if (inCurrentGame(id)) return false;
  const r = removePlayer(store.players, store.games, id);
  store.players = r.players;
  store.games = r.games;
  if (store.lastSetup) store.lastSetup = { ...store.lastSetup, players: store.lastSetup.players.filter(p => p !== id) };
  if (store.setupDraft) store.setupDraft.players = store.setupDraft.players.filter(p => p !== id);
  return true;
}

// ------------------------------------------------------------------ réglages
const KEYS = { theme: 'strela.theme', night: 'strela.night', vibrate: 'strela.vibrate', anim: 'strela.anim' };

export function loadSettings() {
  try {
    const t = localStorage.getItem(KEYS.theme);
    if (t === 'dark' || t === 'light' || t === 'auto') store.settings.theme = t;
    store.settings.night = localStorage.getItem(KEYS.night) === '1';
    store.settings.vibrate = localStorage.getItem(KEYS.vibrate) !== '0';
    store.settings.anim = localStorage.getItem(KEYS.anim) !== '0';
  } catch (e) { /* stockage indisponible : réglages par défaut */ }
}

export function saveSetting(key, value) {
  store.settings[key] = value;
  try {
    localStorage.setItem(KEYS[key], typeof value === 'boolean' ? (value ? '1' : '0') : value);
  } catch (e) { /* tant pis */ }
}

/** Le téléphone demande moins d'animations (réglage d'accessibilité) : les animations sont coupées d'office. */
export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
export const animationsOn = () => store.settings.anim && !reducedMotion();
