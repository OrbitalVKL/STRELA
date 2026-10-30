// Strela — état de la maquette, en mémoire (lot 1) : joueurs, historique, partie en cours, réglages.
// Seuls les réglages d'affichage sont gardés dans le navigateur (strela.theme, strela.night, strela.vibrate).
// Au lot 2, joueurs et parties passeront dans IndexedDB avec la même forme.

import { computeState, STATUS } from '../engine/x01.js';
import { MOCK_PLAYERS, EXTRA_PLAYERS, mockGames } from './mock.js';

const clone = o => JSON.parse(JSON.stringify(o));

export const store = {
  players: [],
  games: [],
  current: null,     // { id, config, darts, startedAt, ui: { mult, hold, frozen, pause, confirm } }
  lastSetup: null,   // derniers réglages de « Nouvelle partie »
  draft: null,       // fiche joueur en cours de modification
  setupDraft: null,  // écran « Nouvelle partie » en cours
  settings: { theme: 'auto', night: false, vibrate: true },
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

export const playerById = id => store.players.find(p => p.id === id)
  || EXTRA_PLAYERS.find(p => p.id === id) || { id, name: '?', avatar: { kind: 'initials', color: 7 } };
export const activePlayers = () => store.players.filter(p => !p.archived);

let seq = 100;
export const newId = prefix => `${prefix}${++seq}${Date.now().toString(36).slice(-3)}`;

/** Démarre une partie en mémoire. */
export function startGame(setup) {
  const config = { startScore: setup.startScore, outMode: setup.outMode, legsToWin: setup.legsToWin, players: [...setup.players] };
  store.lastSetup = { ...setup, players: [...setup.players] };
  store.current = { id: newId('g'), config, darts: [], startedAt: Date.now(), ui: freshUi() };
  return store.current;
}

export const freshUi = () => ({ mult: 1, hold: null, frozen: false, pause: false, confirm: false });

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

// ------------------------------------------------------------------ réglages
const KEYS = { theme: 'strela.theme', night: 'strela.night', vibrate: 'strela.vibrate' };

export function loadSettings() {
  try {
    const t = localStorage.getItem(KEYS.theme);
    if (t === 'dark' || t === 'light' || t === 'auto') store.settings.theme = t;
    store.settings.night = localStorage.getItem(KEYS.night) === '1';
    store.settings.vibrate = localStorage.getItem(KEYS.vibrate) !== '0';
  } catch (e) { /* stockage indisponible : réglages par défaut */ }
}

export function saveSetting(key, value) {
  store.settings[key] = value;
  try {
    localStorage.setItem(KEYS[key], typeof value === 'boolean' ? (value ? '1' : '0') : value);
  } catch (e) { /* tant pis */ }
}
