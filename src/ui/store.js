// Strela — état de l'appli : joueurs, historique, partie en cours, réglages (lot 2).
// L'écran se dessine toujours depuis cet état en mémoire ; chaque changement est aussi écrit dans la base du
// téléphone (src/data/db.js, IndexedDB), dans l'ordre :
//   joueur { id, name, avatar, archived }
//   partie { id, startedAt, endedAt, config, darts[], validated, abandoned } ; fléchette { segment, multiplier, pos? }
//   partie en cours = la même, endedAt null, écrite à chaque fléchette, à chaque ANNULER et à chaque VALIDER ;
//     `ui` (état d'affichage : multiplicateur armé, panneaux, vue de la cible…) n'est pas enregistré.
// Sommaire de maquette (?maquette) : aucune base, données fictives en mémoire (src/ui/maquette.js), rien n'est écrit.

import { computeState, STATUS, EVENTS } from '../engine/x01.js';
import { deletePlayer as removePlayer, deletionImpact, isDeletedId } from '../engine/players.js';
import { openDb, currentRecord, closedRecord, playerRecord, deletionOps, gameDeletionOps, soireeRecord, DB_VERSION } from '../data/db.js';
import { makeBackup, importPlan } from '../data/backup.js';
import { bac, drinkTimes } from '../engine/alcohol.js';

export const store = {
  players: [],
  games: [],
  current: null,     // { id, config, darts, startedAt, validated, ui: voir freshUi() }
  lastSetup: null,   // derniers réglages de « Nouvelle partie »
  soiree: null,      // soirée en cours (lot 7.6) : { id, startedAt, players, drinks } (db.js › soireeRecord)
  soireeDraft: null, // écran « Soirée » avant de la débuter : { players }
  draft: null,       // fiche joueur en cours de modification
  setupDraft: null,  // écran « Nouvelle partie » en cours
  crop: null,        // photo en cours de recadrage (screens/photo.js)
  // autoUpdate (lot 6) : recherche automatique de mise à jour (APK « github » seulement), OUI par défaut
  settings: { theme: 'auto', night: false, vibrate: true, anim: true, sound: true, voice: true, autoUpdate: true },
  maquette: false,
  // Base du téléphone : version, erreur éventuelle, stockage persistant (affichés dans le diagnostic des Réglages)
  db: { version: null, error: null, persisted: null, unreadable: 0, openCode: null, writeFail: null },
};

// ------------------------------------------------------------------ base du téléphone
let db = null; // null : rien n'est écrit (maquette, ou base indisponible)

/** Écritures en cours (les tests attendent qu'elles soient finies). */
export const saving = { pending: 0, done: 0 };

/** Appelé quand une écriture échoue ou réussit de nouveau (l'appli redessine l'écran : alerte d'enregistrement). */
let onStorageChange = () => {};
export const setStorageListener = fn => { onStorageChange = fn; };

function write(ops) {
  if (!db || !ops.length) return Promise.resolve();
  saving.pending++;
  return db.write(ops).then(
    () => { const was = store.db.writeFail; store.db.error = null; store.db.writeFail = null; if (was) onStorageChange(); },
    e => {
      // Stockage plein (QuotaExceededError) ou écriture refusée : l'état en mémoire est gardé, l'écran le dit.
      const name = (e && e.name) || String(e);
      store.db.error = `écriture refusée (${name})`;
      store.db.writeFail = { full: /Quota/i.test(name) || /quota|space|full/i.test((e && e.message) || ''), name, at: Date.now() };
      onStorageChange();
    },
  ).finally(() => { saving.pending--; saving.done++; });
}

/**
 * Problème d'enregistrement à montrer (lot 4), ou null : 'newer' (base d'une version plus récente), 'open' (base
 * inaccessible : rien ne sera gardé), 'full' (stockage plein), 'write' (écriture refusée).
 */
export function storageIssue() {
  if (store.maquette && !store.mockIssue) return null;
  if (store.db.openCode === 'NEWER') return { kind: 'newer' };
  if (store.db.openCode) return { kind: 'open', detail: store.db.error };
  if (store.db.writeFail) return { kind: store.db.writeFail.full ? 'full' : 'write', detail: store.db.writeFail.name };
  return null;
}

/** RÉESSAYER après un stockage plein : tout ce qui est en mémoire est réécrit, en une seule transaction. */
export function resaveAll() {
  const ops = [
    ...store.players.map(p => ({ store: 'players', put: playerRecord(p) })),
    ...store.games.map(g => ({ store: 'games', put: g })),
    ...(store.current ? [{ store: 'games', put: currentRecord(store.current) }] : []),
    { store: 'settings', key: 'display', put: { ...store.settings } },
    ...(store.lastSetup ? [{ store: 'settings', key: 'lastSetup', put: store.lastSetup }] : []),
    ...(store.soiree ? [{ store: 'settings', key: 'soiree', put: store.soiree }] : []),
  ];
  return write(ops);
}

/** La base peut-elle relire cette partie ? (une partie illisible est gardée dans la base, pas affichée) */
const readable = g => { try { computeState(g.config, g.darts); return true; } catch (e) { return false; } };

/**
 * Ouvre la base et charge tout (démarrage de l'appli). Réglages : la base fait foi ; au tout premier lancement, ceux
 * de la maquette (localStorage) y sont recopiés. `onVersionChange` : une version plus récente de l'appli ouvre la base.
 */
export async function openStorage({ onVersionChange } = {}) {
  db = await openDb({ onVersionChange: () => { db = null; if (onVersionChange) onVersionChange(); } });
  store.db.version = db.version;
  const data = await db.loadAll();
  store.players = data.players;
  const games = data.games.filter(readable);
  store.db.unreadable = data.games.length - games.length;
  store.games = games;
  if (data.stale.length) write(data.stale.map(g => ({ store: 'games', put: g })));
  store.current = data.current && readable(data.current) ? { ...data.current, ui: freshUi() } : null;
  store.lastSetup = data.settings.lastSetup || null;
  store.soiree = soireeRecord(data.settings.soiree);
  if (data.settings.display) {
    Object.assign(store.settings, data.settings.display);
    mirrorSettings();
  } else {
    write([{ store: 'settings', key: 'display', put: { ...store.settings } }]);
  }
  store.db.storage = data.settings.storage || null;
  return data;
}

/**
 * Stockage persistant : sans lui, Chrome peut effacer les données d'un site quand la place manque. Demandé au
 * premier lancement (et tant qu'il n'est pas accordé ; Chrome répond sans rien demander à l'utilisateur).
 */
export async function requestPersistence() {
  const st = navigator.storage;
  if (!st || !st.persist) { store.db.persisted = 'absent'; return; }
  try {
    let ok = st.persisted ? await st.persisted() : false;
    if (!ok) ok = await st.persist();
    store.db.persisted = ok ? 'yes' : 'no';
    // Gardé dans la base (première demande, puis seulement si la réponse change).
    if (!store.db.storage || store.db.storage.persisted !== ok) {
      store.db.storage = { asked: true, persisted: ok, at: Date.now() };
      write([{ store: 'settings', key: 'storage', put: store.db.storage }]);
    }
  } catch (e) { store.db.persisted = 'error'; }
}

export const dbVersion = DB_VERSION;

// ------------------------------------------------------------------ joueurs
/** Joueur supprimé (identifiant anonyme « ~<rang> » dans une partie) : nom et avatar neutres. */
export const DELETED_PLAYER = Object.freeze({ name: 'Joueur supprimé', avatar: Object.freeze({ kind: 'deleted' }), deleted: true });

export const playerById = id => (isDeletedId(id) ? { id, ...DELETED_PLAYER }
  : store.players.find(p => p.id === id) || { id, name: '?', avatar: { kind: 'initials', color: 7 } });
export const activePlayers = () => store.players.filter(p => !p.archived);

/** Identifiant unique (l'heure en base 36 et un tirage) : jamais deux fois le même, même d'une session à l'autre. */
export function newId(prefix) {
  let r = '';
  try { r = [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(36).padStart(2, '0')).join(''); }
  catch (e) { r = Math.random().toString(36).slice(2, 10); }
  return `${prefix}${Date.now().toString(36)}${r}`;
}

/** Crée ou met à jour un joueur (fiche enregistrée). */
export function savePlayer(p) {
  const i = store.players.findIndex(q => q.id === p.id);
  if (i < 0) store.players.push(p); else store.players[i] = p;
  write([{ store: 'players', put: playerRecord(p) }]);
  return p;
}

export function setArchived(id, archived) {
  const p = store.players.find(q => q.id === id);
  if (!p) return;
  p.archived = archived;
  write([{ store: 'players', put: playerRecord(p) }]);
}

// ------------------------------------------------------------------ partie en cours
/** Enregistre la partie en cours telle quelle (à chaque fléchette, ANNULER, VALIDER, fin de manche validée). */
export function saveCurrent() {
  if (store.current) write([{ store: 'games', put: currentRecord(store.current) }]);
}

// ------------------------------------------------------------------ verres (lot 7)
/** Ajoute un verre (maintenant) au joueur `id` dans la partie en cours. */
export function addDrink(id, now = Date.now()) {
  const g = store.current;
  if (!g) return;
  // Lot 7.6 : un joueur de la partie qui n'est pas (ou plus) dans la soirée de la partie la rejoint.
  if (g.soiree && store.soiree && store.soiree.id === g.soiree && !store.soiree.players.includes(id)) joinSoiree([id]);
  g.drinks = { ...(g.drinks || {}) };
  // Lot 7.1 : le verre prend sa place dans l'historique de la partie (nombre de fléchettes jouées à ce moment).
  g.drinks[id] = [...(g.drinks[id] || []), { t: now, at: g.darts.length }];
  saveCurrent();
}

/** Retire le dernier verre du joueur `id` dans la partie en cours (ceux des parties d'avant ne bougent pas). */
export function removeDrink(id) {
  const g = store.current;
  const list = g && g.drinks && g.drinks[id];
  if (!list || !list.length) return;
  g.drinks = { ...g.drinks, [id]: list.slice(0, -1) };
  saveCurrent();
}

/** Verres du joueur dans la partie en cours. */
export const drinksHere = id => (store.current && store.current.drinks && store.current.drinks[id] ? store.current.drinks[id].length : 0);

/** Lot 7.6 : verres à afficher pour le joueur `id` dans la partie `g` : ceux de la soirée avant la partie (s'il y en a
 *  une) plus ceux de la partie. Sans soirée : ceux de la partie seulement (comme avant). */
export const gameDrinks = (g, id) => ((g && g.drinksBefore && g.drinksBefore[id]) || 0) + ((g && g.drinks && g.drinks[id] && g.drinks[id].length) || 0);

/** Un verre au moins à montrer dans la partie `g` (de la partie ou de la soirée avant elle). */
export const gameDrinking = g => !!(g && ((g.drinks && Object.values(g.drinks).some(l => l.length)) || (g.drinksBefore && Object.values(g.drinksBefore).some(n => n > 0))));

// ------------------------------------------------------------------ soirée (lot 7.6)
// Une soirée regroupe des parties : ses joueurs (on en ajoute en cours de route), et leurs verres, qui continuent
// d'une partie à l'autre. Enregistrée dans les réglages (clé « soiree ») tant qu'elle dure ; chaque partie lancée
// pendant la soirée garde l'identifiant de la soirée (`soiree`) et les verres d'avant (`drinksBefore`), pour que son
// historique et sa fiche de score montrent le cumul même une fois la soirée terminée. Aucune migration.
const saveSoiree = () => write([store.soiree ? { store: 'settings', key: 'soiree', put: store.soiree } : { store: 'settings', del: 'soiree' }]);

/** Parties de la soirée en cours (historique et partie en cours). */
const soireeGames = () => {
  if (!store.soiree) return [];
  const id = store.soiree.id;
  return [...store.games, ...(store.current ? [store.current] : [])].filter(g => g.soiree === id);
};

/** Débute une soirée avec ces joueurs (une soirée précédente est terminée). */
export function startSoiree(players, now = Date.now()) {
  store.soiree = { id: newId('s'), startedAt: now, players: [...new Set(players)], drinks: {} };
  store.setupDraft = null; // « Nouvelle partie » reprendra les joueurs de la soirée
  saveSoiree();
  return store.soiree;
}

/** Termine la soirée : les parties gardent leurs verres ; rien n'est effacé. */
export function endSoiree() {
  store.soiree = null;
  store.setupDraft = null;
  saveSoiree();
}

/** Ajoute des joueurs à la soirée en cours (ceux qui y sont déjà ne bougent pas). */
export function joinSoiree(ids) {
  const s = store.soiree;
  if (!s) return;
  const add = ids.filter(id => !s.players.includes(id));
  if (!add.length) return;
  s.players = [...s.players, ...add];
  saveSoiree();
}

/** Retire un joueur de la soirée (ses verres restent comptés s'il revient). */
export function leaveSoiree(id) {
  const s = store.soiree;
  if (!s || !s.players.includes(id)) return;
  s.players = s.players.filter(x => x !== id);
  saveSoiree();
}

/** Verres du joueur depuis le début de la soirée en cours (hors partie, et dans chaque partie de la soirée). */
export function soireeDrinks(id) {
  const s = store.soiree;
  if (!s) return 0;
  return ((s.drinks[id] && s.drinks[id].length) || 0)
    + soireeGames().reduce((n, g) => n + ((g.drinks && g.drinks[id] && g.drinks[id].length) || 0), 0);
}

/** Total des verres de la soirée (tous les joueurs). */
export const soireeTotal = () => (store.soiree ? store.soiree.players.reduce((n, id) => n + soireeDrinks(id), 0) : 0);

/** La partie en cours appartient à la soirée en cours et `id` y joue : les verres vont dans la partie. */
const inSoireeGame = id => !!(store.soiree && store.current && store.current.soiree === store.soiree.id && store.current.config.players.includes(id));

/** Un verre de plus pour `id` depuis l'écran Soirée : dans la partie en cours s'il y joue, sinon hors partie. */
export function soireeAddDrink(id, now = Date.now()) {
  const s = store.soiree;
  if (!s) return;
  if (inSoireeGame(id)) { addDrink(id, now); return; }
  s.drinks = { ...s.drinks, [id]: [...(s.drinks[id] || []), { t: now }] };
  saveSoiree();
}

/** Retire le dernier verre de `id` dans la soirée : partie en cours, sinon hors partie, sinon sa dernière partie de la
 *  soirée (correction d'un oubli). */
export function soireeRemoveDrink(id) {
  const s = store.soiree;
  if (!s) return;
  if (inSoireeGame(id) && drinksHere(id)) { removeDrink(id); return; }
  const own = s.drinks[id];
  if (own && own.length) { s.drinks = { ...s.drinks, [id]: own.slice(0, -1) }; saveSoiree(); return; }
  const g = store.games.filter(x => x.soiree === s.id && x.drinks && x.drinks[id] && x.drinks[id].length)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!g) return;
  g.drinks = { ...g.drinks, [id]: g.drinks[id].slice(0, -1) };
  write([{ store: 'games', put: closedRecord(g, g.abandoned, g.endedAt) }]);
}

/** Alcoolémie estimée (g/L) du joueur maintenant : ses verres des 24 dernières heures, toutes parties confondues. */
export function playerBac(id, now = Date.now()) {
  return bac(drinkTimes([...(store.current ? [store.current] : []), ...store.games], id, now), now);
}

/** Démarre une partie (la précédente, s'il y en a une, est d'abord rangée : abandonnée si elle n'était pas finie). */
export function startGame(setup) {
  if (store.current) archiveCurrent(currentState().status !== STATUS.FINISHED);
  // Lot 7 : ordre tiré au sort au lancement (`shuffle`) et jouer jusqu'au bout (`playOn`, 3 joueurs ou plus). Les derniers
  // réglages gardent l'ordre choisi ; seule la partie prend l'ordre tiré. Rien à migrer : réglages absents = valeurs par
  // défaut (tirage OUI, jusqu'au bout NON).
  const players = setup.shuffle ? shuffled(setup.players) : [...setup.players];
  const config = { startScore: setup.startScore, outMode: setup.outMode, legsToWin: setup.legsToWin, players };
  if (setup.playOn && players.length > 2) config.playOn = true;
  store.lastSetup = { players: [...setup.players], startScore: setup.startScore, outMode: setup.outMode, legsToWin: setup.legsToWin,
    // REVANCHE (ni l'un ni l'autre donné) garde les préférences d'avant
    shuffle: setup.shuffle ?? store.lastSetup?.shuffle ?? true, playOn: setup.playOn ?? store.lastSetup?.playOn ?? false };
  store.current = { id: newId('g'), config, darts: [], startedAt: Date.now(), validated: 0, ui: freshUi() };
  // Lot 7.6 : l'ordre tiré est noté dans la partie, pour que la REVANCHE tire de nouveau au sort.
  if (setup.shuffle && players.length > 1) store.current.shuffled = true;
  // Lot 7.6 : soirée en cours. Les joueurs de la partie la rejoignent ; la partie garde leurs verres d'avant.
  if (store.soiree) {
    joinSoiree(players);
    store.current.soiree = store.soiree.id;
    const before = {};
    for (const id of players) { const n = soireeDrinks(id); if (n) before[id] = n; }
    if (Object.keys(before).length) store.current.drinksBefore = before;
  }
  // Ordre tiré : « À TOI, PSEUDO » annonce le premier à lancer.
  if (setup.shuffle && players.length > 1) store.current.ui.announce = 0;
  write([{ store: 'games', put: currentRecord(store.current) }, { store: 'settings', key: 'lastSetup', put: store.lastSetup }]);
  return store.current;
}

/**
 * État d'affichage de la partie en cours (non enregistré) : multiplicateur armé, menu pause et confirmation,
 * panneau cible + historique ouvert ('board' | null), correction d'une fléchette en cours (`fix`), vue de la cible agrandie ('visit' | 'leg'), annonce du joueur suivant (rang), glissement du bandeau,
 * loupe figée du sommaire ({ x, y }), `frozen` : annonce figée (sommaire de maquette).
 */
/** Copie mélangée (Fisher-Yates ; hasard du téléphone si disponible). */
export function shuffled(list) {
  const out = [...list];
  const rnd = k => {
    try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % k; } catch (e) { return Math.floor(Math.random() * k); }
  };
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export const freshUi = () => ({ mult: 1, pause: false, confirm: false, panel: null, boardView: 'visit', announce: null, slide: false, loupe: null, frozen: false, fix: null, cele: null, drinks: false });

export const currentState = () => (store.current ? computeState(store.current.config, store.current.darts) : null);

/** Fin de manche pas encore validée (MANCHE SUIVANTE) : l'écran de fin de manche sert de validation. */
export function legEndPending() {
  const s = currentState();
  return !!(s && s.status === STATUS.PLAYING && s.lastEvent === EVENTS.LEG_WON && store.current.validated !== s.dartCount);
}

/** Où reprendre la partie en cours : jeu, fin de manche (pas encore validée) ou fin de partie. */
export function resumeRoute() {
  const s = currentState();
  if (!s) return '#/';
  if (s.status === STATUS.FINISHED) return '#/fin';
  return legEndPending() ? '#/manche' : '#/jeu';
}

/** Range la partie en cours dans l'historique (finie ou abandonnée) et la retire. Sans fléchette, elle est oubliée. */
export function archiveCurrent(abandoned) {
  const g = store.current;
  if (!g) return;
  store.current = null;
  const s = computeState(g.config, g.darts);
  if (g.darts.length && (abandoned || s.status === STATUS.FINISHED)) {
    const rec = closedRecord(g, abandoned && s.status !== STATUS.FINISHED, Date.now());
    store.games.unshift(rec);
    write([{ store: 'games', put: rec }]);
  } else {
    // Lot 7.6 : partie sans fléchette effacée ; ses verres restent à la soirée (hors partie).
    const sv = store.soiree;
    if (sv && g.soiree === sv.id && g.drinks && Object.values(g.drinks).some(l => l.length)) {
      const drinks = { ...sv.drinks };
      for (const [id, list] of Object.entries(g.drinks)) if (list.length) drinks[id] = [...(drinks[id] || []), ...list.map(d => ({ t: d.t ?? d }))];
      sv.drinks = drinks;
      saveSoiree();
    }
    write([{ store: 'games', del: g.id }]);
  }
}

// ------------------------------------------------------------------ suppression de parties (lot 3)
/**
 * Supprime des parties de l'historique, en une seule transaction. Les stats se recalculent d'elles-mêmes (elles ne
 * sont jamais stockées) ; les joueurs, et leurs photos d'avatar, ne sont jamais touchés. Renvoie le nombre supprimé.
 */
export function deleteGames(ids) {
  const gone = new Set(ids);
  const before = store.games.length;
  store.games = store.games.filter(g => !gone.has(g.id));
  write(gameDeletionOps([...gone]));
  return before - store.games.length;
}

/** Supprime la partie en cours (partie d'essai) : elle n'entre pas dans l'historique. */
export function deleteCurrent() {
  const g = store.current;
  if (!g) return;
  store.current = null;
  write(gameDeletionOps([g.id]));
}

// ------------------------------------------------------------------ sauvegarde : export / import (lot 3)
/** Sauvegarde complète de ce qui est sur le téléphone (src/data/backup.js). */
export function exportBackup(app) {
  const display = { ...store.settings };
  return makeBackup({ players: store.players, games: store.games, current: store.current, display, lastSetup: store.lastSetup },
    { app, dbVersion: store.db.version });
}

/**
 * Importe une sauvegarde vérifiée (parseBackup) : 'replace' (tout remplacer) ou 'merge' (ajouter ce qui manque).
 * Une seule transaction ; l'état en mémoire suit. Renvoie les chiffres de l'import.
 */
const localData = () => ({ players: store.players, games: store.games, current: store.current, display: { ...store.settings }, lastSetup: store.lastSetup });

/** Chiffres d'un import avant de le faire (texte des confirmations). */
export const importCounts = (backup, mode) => importPlan(localData(), backup, mode).counts;

export function applyImport(backup, mode) {
  const local = localData();
  const plan = importPlan(local, backup, mode);
  store.players = plan.state.players.map(p => ({ ...p }));
  store.games = plan.state.games;
  store.current = plan.state.current
    ? (plan.state.current === local.current ? local.current : { ...plan.state.current, ui: freshUi() })
    : null;
  store.lastSetup = plan.state.lastSetup || null;
  store.setupDraft = null;
  store.draft = null;
  Object.assign(store.settings, plan.state.display);
  if (!store.maquette) mirrorSettings();
  write(plan.ops);
  return plan.counts;
}

// ------------------------------------------------------------------ suppression d'un joueur
/** Le joueur est-il dans la partie en cours ? (il ne peut alors pas être supprimé) */
export const inCurrentGame = id => !!(store.current && store.current.config.players.includes(id));

/** Parties gardées (anonymisées) et effacées si l'on supprime ce joueur. */
export const deletionPreview = id => deletionImpact(store.games, id);

/** Supprime un joueur (fiche, stats) ; ses parties avec d'autres restent, anonymisées. Une seule transaction. */
export function deletePlayer(id) {
  if (inCurrentGame(id)) return false;
  const r = removePlayer(store.players, store.games, id);
  store.players = r.players;
  store.games = r.games;
  if (store.lastSetup) store.lastSetup = { ...store.lastSetup, players: store.lastSetup.players.filter(p => p !== id) };
  if (store.setupDraft) store.setupDraft.players = store.setupDraft.players.filter(p => p !== id);
  write(deletionOps(id, r, store.lastSetup));
  return true;
}

// ------------------------------------------------------------------ réglages
// La base fait foi ; une copie de thème et mode nuit reste dans localStorage, lue par index.html avant l'affichage
// (pas d'éclair de la mauvaise couleur au lancement). Sommaire de maquette : lus là, jamais écrits.
const KEYS = { theme: 'strela.theme', night: 'strela.night', vibrate: 'strela.vibrate', anim: 'strela.anim', sound: 'strela.sound', voice: 'strela.voice', autoUpdate: 'strela.autoUpdate' };

export function loadSettings() {
  try {
    const t = localStorage.getItem(KEYS.theme);
    if (t === 'dark' || t === 'light' || t === 'auto') store.settings.theme = t;
    store.settings.night = localStorage.getItem(KEYS.night) === '1';
    store.settings.vibrate = localStorage.getItem(KEYS.vibrate) !== '0';
    store.settings.anim = localStorage.getItem(KEYS.anim) !== '0';
    store.settings.sound = localStorage.getItem(KEYS.sound) !== '0';
    store.settings.voice = localStorage.getItem(KEYS.voice) !== '0';
    store.settings.autoUpdate = localStorage.getItem(KEYS.autoUpdate) !== '0';
  } catch (e) { /* stockage indisponible : réglages par défaut */ }
}

function mirrorSettings() {
  try {
    for (const [k, v] of Object.entries(store.settings)) if (KEYS[k]) localStorage.setItem(KEYS[k], typeof v === 'boolean' ? (v ? '1' : '0') : v);
  } catch (e) { /* tant pis : seul l'éclair au lancement en dépend */ }
}

export function saveSetting(key, value) {
  store.settings[key] = value;
  if (store.maquette) return;
  mirrorSettings();
  write([{ store: 'settings', key: 'display', put: { ...store.settings } }]);
}

/** Le téléphone demande moins d'animations (réglage d'accessibilité) : les animations sont coupées d'office. */
export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
export const animationsOn = () => store.settings.anim && !reducedMotion();
