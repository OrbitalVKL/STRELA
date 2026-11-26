// Strela — état de l'appli : joueurs, historique, partie en cours, réglages (lot 2).
// L'écran se dessine toujours depuis cet état en mémoire ; chaque changement est aussi écrit dans la base du
// téléphone (src/data/db.js, IndexedDB), dans l'ordre :
//   joueur { id, name, avatar, archived }
//   partie { id, startedAt, endedAt, config, darts[], validated, abandoned } ; fléchette { segment, multiplier, pos? }
//   partie en cours = la même, endedAt null, écrite à chaque fléchette, à chaque ANNULER et à chaque VALIDER ;
//     `ui` (état d'affichage : multiplicateur armé, panneaux, vue de la cible…) n'est pas enregistré.
// Sommaire de maquette (?maquette) : aucune base, données fictives en mémoire (src/ui/maquette.js), rien n'est écrit.

import { log, journalText } from './journal.js';
import { shuffled } from '../engine/shuffle.js';
import { DEFI_SET } from '../engine/defis.js';
import { computeState, STATUS, EVENTS } from '../engine/x01.js';
import { deletePlayer as removePlayer, deletionImpact, isDeletedId } from '../engine/players.js';
import { openDb, currentRecord, closedRecord, playerRecord, deletionOps, gameDeletionOps, soireeRecord, trainingRecord, DB_VERSION } from '../data/db.js';
import { trainingState, cleanTrainingDart, cleanTarget, setRuns, setAt, setsUsed, cleanSetChanges, RULES_VERSION, trainingDartLabel } from '../engine/training.js';
import { dartSetRecord } from '../engine/dartsets.js';
import { makeBackup, importPlan } from '../data/backup.js';
import { bac, drinkTimes, drinkTime, drinkAt, isPint, unitsOf, drinkTally, PINT_L } from '../engine/alcohol.js';
import { computeCricket, isCricket } from '../engine/cricket.js';
import { rewireGame, rewireTraining } from '../engine/merge.js';

export const store = {
  players: [],
  games: [],
  current: null,     // { id, config, darts, startedAt, validated, ui: voir freshUi() }
  // Lot 10 : le Cricket est rangé à part (le code X01 — stats, records, badges, soirée — ne voit jamais une partie de
  // Cricket). Une seule partie en cours en tout : lancer l'un range l'autre (abandonnée si pas finie).
  ckGames: [],       // parties de Cricket closes
  ck: null,          // partie de Cricket en cours { id, config, darts, startedAt, validated, ui }
  lastSetup: null,   // derniers réglages de « Nouvelle partie »
  // Lot 8 : entraînement solo (à part des parties : rien du code X01 ni du Cricket ne le voit).
  trainings: [],     // séances closes, la plus récente d'abord
  tr: null,          // séance en cours { …enregistrement, ui } (une à la fois, indépendante de la partie en cours)
  dartSets: [],      // jeux de fléchettes (armurerie)
  trSetup: null,     // derniers choix de l'écran Entraînement (réglage « training »)
  trDraft: null,     // jeu de fléchettes en cours de modification
  soiree: null,      // soirée en cours (lot 7.6) : { id, startedAt, players, drinks } (db.js › soireeRecord)
  soireeDraft: null, // écran « Soirée » avant de la débuter : { players }
  draft: null,       // fiche joueur en cours de modification
  setupDraft: null,  // écran « Nouvelle partie » en cours
  crop: null,        // photo en cours de recadrage (screens/photo.js)
  // autoUpdate (lot 6) : recherche automatique de mise à jour (APK « github » seulement), OUI par défaut
  settings: { theme: 'auto', night: false, vibrate: true, anim: true, sound: true, voice: true, autoUpdate: true, autoBackup: true, heatScale: 'clair', padRing: false, zonePad: 'rangees', voiceInput: true, voiceAsked: false, journal: true, journalInBackup: true }, // journal, journalInBackup : lot 9.5 (journal de débogage) ; autoBackup : lot 9 ; heatScale, padRing, zonePad : lot 8 du 23/11 ; voiceInput, voiceAsked : lot 9.3 (saisie à la voix)
  maquette: false,
  // Lot 10 : compte en ligne. Le compte lui-même (identifiant, secret) est dans settings.cloudAccount (donc dans la
  // sauvegarde) ; la connexion (jetons) et l'état de la synchronisation sont propres au téléphone, jamais exportés.
  cloudAuth: null,   // réglage « cloudAuth » : { profileId, userId, access, refresh, expiresAt, attached }
  cloudSync: {},     // réglage « cloudSync » : { lastSync, friendCode, profileSent, … }
  // Étape 4 : parties et séances reçues où mon profil n'a pas joué (celles de mes amis entre eux, leurs séances) :
  // gardées à part (stats des amis, étape 5), jamais mêlées à mon historique ni à mes stats.
  friendGames: [],
  friendTrainings: [],
  // Base du téléphone : version, erreur éventuelle, stockage persistant (affichés dans le diagnostic des Réglages)
  db: { version: null, error: null, persisted: null, unreadable: 0, openCode: null, writeFail: null },
};

// ------------------------------------------------------------------ base du téléphone
let db = null; // null : rien n'est écrit (maquette, ou base indisponible)

/** Écritures en cours (les tests attendent qu'elles soient finies). */
export const saving = { pending: 0, done: 0 };

/** Lot 10 : une partie ou une séance vient d'être rangée (la synchronisation part en arrière-plan). */
let onClosed = () => {};
export const setClosedListener = fn => { onClosed = fn; };
const closed = () => { try { onClosed(); } catch (e) { /* */ } };
/** 0.25.1 : la dernière fléchette vient de finir la partie en cours (elle compte et part sans attendre ACCUEIL). */
export const gameFinished = () => closed();

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
    ...store.ckGames.map(g => ({ store: 'games', put: g })),
    ...(store.ck ? [{ store: 'games', put: currentRecord(store.ck) }] : []),
    { store: 'settings', key: 'display', put: { ...store.settings } },
    ...(store.lastSetup ? [{ store: 'settings', key: 'lastSetup', put: store.lastSetup }] : []),
    ...(store.soiree ? [{ store: 'settings', key: 'soiree', put: store.soiree }] : []),
    ...store.trainings.map(r => ({ store: 'trainings', put: trainingRecord(r) })),
    ...store.friendGames.map(g => ({ store: 'games', put: g })),
    ...store.friendTrainings.map(r => ({ store: 'trainings', put: trainingRecord(r) })),
    ...(store.tr ? [{ store: 'trainings', put: trainingRecord(store.tr) }] : []),
    ...store.dartSets.map(x => ({ store: 'dartsets', put: dartSetRecord(x) })),
    ...(store.trSetup ? [{ store: 'settings', key: 'training', put: store.trSetup }] : []),
  ];
  return write(ops);
}

/** La base peut-elle relire cette partie ? (une partie illisible est gardée dans la base, pas affichée) */
const readable = g => { try { if (isCricket(g)) computeCricket(g.config, g.darts); else computeState(g.config, g.darts); return true; } catch (e) { return false; } };

/**
 * Ouvre la base et charge tout (démarrage de l'appli). Réglages : la base fait foi ; au tout premier lancement, ceux
 * de la maquette (localStorage) y sont recopiés. `onVersionChange` : une version plus récente de l'appli ouvre la base.
 */
export async function openStorage({ onVersionChange } = {}) {
  db = await openDb({ onVersionChange: () => { db = null; if (onVersionChange) onVersionChange(); },
    onUpgrade: (from, to) => log('base', `migration de la base : version ${from} → ${to}`) });
  store.db.version = db.version;
  const data = await db.loadAll();
  store.players = data.players;
  const games = data.games.filter(readable);
  store.db.unreadable = data.games.length - games.length;
  store.games = games.filter(g => !isCricket(g));
  store.ckGames = games.filter(isCricket);
  if (data.stale.length) write(data.stale.map(g => ({ store: 'games', put: g })));
  const cur = data.current && readable(data.current) ? { ...data.current, ui: freshUi() } : null;
  store.current = cur && !isCricket(cur) ? cur : null;
  store.ck = cur && isCricket(cur) ? { ...cur, ui: freshCkUi() } : null;
  store.lastSetup = data.settings.lastSetup || null;
  store.soiree = soireeRecord(data.settings.soiree);
  // Lot 8 : entraînement (une séance illisible est gardée dans la base, pas affichée).
  const trOk = r => { const x = trainingRecord(r); if (!x) return null; try { trainingState(x, x.darts); return x; } catch (e) { return null; } };
  store.trainings = (data.trainings || []).map(trOk).filter(Boolean).sort((a, b) => b.startedAt - a.startedAt);
  if (data.trainingStale && data.trainingStale.length) write(data.trainingStale.map(r => ({ store: 'trainings', put: r })));
  const tr = data.training && trOk(data.training);
  store.tr = tr ? { ...tr, ui: freshTrUi() } : null;
  const trBad = (data.trainings || []).length - store.trainings.length;
  if (trBad) log('base', `${trBad} séance(s) d'entraînement illisible(s) : gardée(s) dans la base, non affichée(s)`);
  if (store.db.unreadable) log('base', `${store.db.unreadable} partie(s) illisible(s) : gardée(s) dans la base, non affichée(s)`);
  store.dartSets = (data.dartSets || []).map(dartSetRecord).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
  store.trSetup = data.settings.training && typeof data.settings.training === 'object' ? data.settings.training : null;
  if (data.settings.display) {
    Object.assign(store.settings, data.settings.display);
    mirrorSettings();
  } else {
    write([{ store: 'settings', key: 'display', put: { ...store.settings } }]);
  }
  store.db.storage = data.settings.storage || null;
  partitionReceived();
  repairOrphans();
  store.cloudAuth = data.settings.cloudAuth && typeof data.settings.cloudAuth === 'object' ? data.settings.cloudAuth : null;
  store.cloudSync = data.settings.cloudSync && typeof data.settings.cloudSync === 'object' ? data.settings.cloudSync : {};
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
export const activePlayers = () => store.players.filter(p => !p.archived && !p.remote);
/** Lot 9.2 : adversaires des parties en ligne, rangés à part (jamais proposés aux choix de joueurs). */
export const remotePlayers = () => store.players.filter(p => p.remote);

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

// ------------------------------------------------------------------ lot 9.2 : adversaires en ligne
/**
 * Joueur d'un autre téléphone (fiche reçue en ligne) : gardé à part (`remote`), mis à jour s'il change de pseudo ou
 * d'avatar. Un joueur de ce téléphone au même identifiant (sauvegarde importée…) reste tel quel.
 */
export function keepRemotePlayer(card) {
  if (!card || !card.id) return null;
  const old = store.players.find(q => q.id === card.id);
  if (old && !old.remote) return old;
  const p = { id: card.id, name: String(card.name || '?'), avatar: card.avatar || { kind: 'initials', color: 7 }, archived: false, remote: true,
    checkout: card.checkout, ...(card.turnAnim ? { turnAnim: card.turnAnim } : {}) };
  if (old) Object.assign(old, p); else store.players.push(p);
  write([{ store: 'players', put: playerRecord(old || p) }]);
  return old || p;
}

/**
 * Partie reçue de l'hôte (lot 9.2) : devient la partie en cours de ce téléphone (même identifiant, mêmes fléchettes),
 * X01 ou Cricket. Une autre partie en cours est d'abord rangée ; les verres et l'affichage de ce téléphone sont gardés
 * si c'est la même partie.
 */
export function adoptOnlineGame(rec, online) {
  const ck = rec.config && rec.config.game === 'cricket';
  const old = ck ? store.ck : store.current;
  const same = old && old.id === rec.id;
  if (!same) {
    if (store.current) archiveCurrent(currentState().status !== STATUS.FINISHED);
    if (store.ck) archiveCk(ckState().status !== 'finished');
  }
  const g = { id: rec.id, config: rec.config, darts: rec.darts.map(d => ({ segment: d.segment, multiplier: d.multiplier })), startedAt: rec.startedAt,
    validated: rec.validated, online, ui: same ? old.ui : (ck ? freshCkUi() : freshUi()) };
  for (const k of ['shuffled', 'defis', 'defiSet']) if (rec[k] !== undefined) g[k] = rec[k];
  if (same && old.drinks) g.drinks = old.drinks;
  if (ck) { store.ck = g; store.current = null; } else { store.current = g; store.ck = null; }
  write([{ store: 'games', put: currentRecord(g) }]);
  return g;
}

/** AJOUTER : un adversaire en ligne devient un joueur de ce téléphone. */
// ------------------------------------------------------------------ amis (lot 10, étape 2)
/** Amis : joueurs liés à un profil en ligne (lecture seule : pseudo, avatar, animation viennent de leur téléphone). */
export const friendPlayers = () => store.players.filter(p => p.friend);

/**
 * Applique la liste des amis acceptés (friendFromServer) : ami nouveau → joueur « u:<uuid> » ; ami connu → pseudo,
 * avatar, animation, jeux et dernière activité mis à jour ; ami qui n'est plus dans la liste (retiré) → redevient un
 * joueur local ordinaire (ses parties restent). Une seule transaction. Renvoie { added, updated, removed }.
 */
export function applyFriends(list) {
  const ops = [];
  const keep = new Set();
  const counts = { added: 0, updated: 0, removed: 0 };
  const put = (p, i) => { if (i < 0) store.players.push(p); else store.players[i] = p; ops.push({ store: 'players', put: playerRecord(p) }); };
  for (const f of list) {
    if (!f || f.state !== 'acceptee') continue;
    keep.add(f.id);
    const i = store.players.findIndex(p => p.friend === f.id);
    const cur = i >= 0 ? store.players[i] : null;
    const next = { ...(cur || { id: `u:${f.id}`, archived: false }), name: f.name, avatar: f.avatar, friend: f.id, seen: f.seen, sets: f.sets };
    if (f.anim) next.turnAnim = f.anim; else delete next.turnAnim;
    const rec = playerRecord(next);
    if (cur && JSON.stringify(playerRecord(cur)) === JSON.stringify(rec)) continue;
    put({ ...next, ...rec }, i);
    counts[cur ? 'updated' : 'added']++;
  }
  store.players.forEach((p, i) => {
    if (!p.friend || keep.has(p.friend)) return;
    const { friend, seen, sets, ...rest } = p;
    put(rest, i);
    counts.removed++;
  });
  write(ops);
  return counts;
}

// ------------------------------------------------------------------ parties partagées (lot 10, étape 4)
/** Suppressions à faire suivre en ligne : seulement ce qui y est déjà parti (`cloudSync.sent`). */
function noteDeleted(ids) {
  const sent = (store.cloudSync && store.cloudSync.sent) || {};
  const todo = ids.filter(id => sent[id]);
  if (!todo.length) return;
  const deleted = [...new Set([...((store.cloudSync && store.cloudSync.deleted) || []), ...todo])];
  saveCloudKey('cloudSync', { ...(store.cloudSync || {}), deleted });
}

/** Une partie ou séance reçue concerne-t-elle mon profil ? (sinon elle est rangée à part : celles de mes amis) */
const withMe = (rec, kind) => {
  const me = profilePlayer();
  if (!me) return false;
  return kind === 'training' ? rec.player === me.id : rec.config.players.includes(me.id);
};

/** Au chargement : les parties et séances reçues où je n'ai pas joué vont à part (store.friendGames, friendTrainings). */
function partitionReceived() {
  const isFriendOnly = (r, kind) => r.owner && !withMe(r, kind);
  store.friendGames = [...store.games, ...store.ckGames].filter(g => isFriendOnly(g, 'game'));
  store.games = store.games.filter(g => !isFriendOnly(g, 'game'));
  store.ckGames = store.ckGames.filter(g => !isFriendOnly(g, 'game'));
  store.friendTrainings = store.trainings.filter(r => isFriendOnly(r, 'training'));
  store.trainings = store.trainings.filter(r => !isFriendOnly(r, 'training'));
}

/**
 * 0.24.1 (lot 9.6 A) : parties et séances reçues restées sur « u:<uuid> » alors que cet ami a été rattaché à un joueur
 * local (fusion faite en 0.23.3 ou avant, qui ne reprenait pas ce qui était déjà reçu sans moi) : elles repassent au
 * joueur local. Sans ça, elles n'étaient plus à personne (la fiche « u:… » a disparu à la fusion). Renvoie le nombre.
 */
export function repairOrphans() {
  let n = 0;
  const ops = [];
  for (const p of [...store.players]) {
    if (!p.friend || p.id === `u:${p.friend}`) continue;
    const from = `u:${p.friend}`;
    const ghost = store.players.find(q => q.id === from);
    if (ghost && !ghost.remote) continue;
    const used = [...store.games, ...store.ckGames, ...store.friendGames].some(g => g.config.players.includes(from))
      || [...store.trainings, ...store.friendTrainings].some(r => r.player === from);
    if (!used && !ghost) continue;
    const rw = rewirePlayer(from, p.id);
    ops.push(...rw.ops);
    if (ghost) { store.players = store.players.filter(q => q.id !== from); ops.push({ store: 'players', del: from }); }
    n += rw.games.length + rw.trainings.length;
    log('cloud', `réparation : ${rw.games.length} partie(s) et ${rw.trainings.length} séance(s) reçues de « ${p.name} » rendues à son joueur (restées sur l'ancienne fiche d'ami)`);
  }
  if (ops.length) write(ops);
  return n;
}

/** Lot 10, étape 5 : toutes les parties connues (les miennes et celles de mes amis entre eux) pour les stats, badges,
 *  records et classements — chaque calcul filtre par joueur. X01 seulement / Cricket seulement / séances. */
// 0.25.1 : la partie (ou la séance) finie restée sur l'écran de fin compte déjà, dès la dernière fléchette.
const withOpen = (list, open) => (open ? [...list, open] : list);
export const allGames = () => withOpen(store.friendGames.length ? [...store.games, ...store.friendGames.filter(g => !isCricket(g))] : store.games, finishedOpenGame());
export const allCkGames = () => withOpen(store.friendGames.length ? [...store.ckGames, ...store.friendGames.filter(isCricket)] : store.ckGames, finishedOpenCk());
export const allTrainings = () => withOpen(store.friendTrainings.length ? [...store.trainings, ...store.friendTrainings] : store.trainings, finishedOpenTraining());

/** 0.25.1 : la partie (ou séance) en cours `id` est-elle finie mais pas encore rangée (écran de fin) ? */
export const isOpenFinished = id => !!id && [finishedOpenGame(), finishedOpenCk(), finishedOpenTraining()].some(r => r && r.id === id);

/** Est-ce une partie (ou séance) reçue d'un ami, en lecture seule ? */
export const isReceived = rec => !!(rec && rec.owner);

/** Qui a créé une partie reçue (pseudo de l'ami), pour le dire à l'écran. */
export function ownerName(rec) {
  if (!rec || !rec.owner) return '';
  const p = store.players.find(q => q.friend === rec.owner) || store.players.find(q => q.id === `u:${rec.owner}`);
  return p ? p.name : 'un ami';
}

/** Mention « lecture seule » d'une partie ou séance reçue (détail). */
export const receivedNote = (rec, what = 'partie') => `Cette ${what} vient du téléphone de ${ownerName(rec)} : lui seul peut la corriger ou la supprimer.`;

/**
 * Range ce que la synchronisation a reçu, en une transaction : items = résultats de fromCloud (engine/sync.js).
 * put : la partie ou séance (remplace la copie d'ici si elle vient d'un ami ou si elle est à moi mais absente) ;
 * delete : retirée d'ici si c'est une partie reçue (ou à moi, supprimée depuis mon autre téléphone) ; joueurs distants
 * créés ou renommés (jamais un joueur du téléphone). Renvoie { put, deleted }.
 */
export function applyReceived(items) {
  const ops = [];
  const counts = { put: 0, deleted: 0, games: 0, trainings: 0, skipped: [] };
  const skip = (it, why) => counts.skipped.push({ id: it.id, kind: it.kind || '?', why });
  const byId = new Map(store.players.map(p => [p.id, p]));
  for (const it of items) {
    if (it.action === 'delete') {
      const g = [...store.games, ...store.ckGames, ...store.friendGames].find(x => x.id === it.id);
      const r = [...store.trainings, ...store.friendTrainings].find(x => x.id === it.id);
      const rec = g || r;
      if (!rec || (!rec.owner && !it.mine)) continue; // une partie d'ici ne disparaît que si c'est moi qui l'ai supprimée
      if (g) { for (const k of ['games', 'ckGames', 'friendGames']) store[k] = store[k].filter(x => x.id !== it.id); ops.push({ store: 'games', del: it.id }); }
      if (r) { for (const k of ['trainings', 'friendTrainings']) store[k] = store[k].filter(x => x.id !== it.id); ops.push({ store: 'trainings', del: it.id }); }
      counts.deleted++;
      continue;
    }
    if (it.action === 'skip') { skip(it, it.why); continue; }
    if (it.action !== 'put') continue;
    for (const rp of it.remotes || []) {
      const cur = byId.get(rp.id);
      if (cur && !cur.remote) continue;
      const next = playerRecord({ ...(cur || { archived: false }), id: rp.id, name: String(rp.name || 'Joueur').slice(0, 40), avatar: rp.avatar && typeof rp.avatar === 'object' ? rp.avatar : { kind: 'initials', color: 7 }, remote: true });
      if (cur && JSON.stringify(playerRecord(cur)) === JSON.stringify(next)) continue;
      byId.set(rp.id, next);
      if (cur) store.players = store.players.map(p => (p.id === rp.id ? next : p)); else store.players.push(next);
      ops.push({ store: 'players', put: next });
    }
    if (it.kind === 'training') {
      const rec = trainingRecord(it.rec);
      if (!rec) { skip(it, 'illisible'); continue; }
      if (rec.endedAt === null) { skip(it, 'pas finie'); continue; }
      if (store.tr && store.tr.id === rec.id) continue; // la mienne, encore en cours ici (finie mais pas rangée)
      const local = store.trainings.find(x => x.id === rec.id);
      if (local && !local.owner && it.mine) continue; // la mienne, déjà ici : ce téléphone fait foi
      try { trainingState(rec, rec.darts); } catch (e) { skip(it, `fléchettes illisibles (${e.message})`); continue; }
      counts.trainings++;
      store.trainings = store.trainings.filter(x => x.id !== rec.id);
      store.friendTrainings = store.friendTrainings.filter(x => x.id !== rec.id);
      if (!rec.owner || withMe(rec, 'training')) store.trainings.push(rec); else store.friendTrainings.push(rec);
      ops.push({ store: 'trainings', put: rec });
    } else {
      const rec = closedRecord(it.rec, it.rec.abandoned, it.rec.endedAt ?? it.rec.startedAt);
      if (!readable(rec)) { skip(it, 'illisible'); continue; }
      const list = isCricket(rec) ? 'ckGames' : 'games';
      const local = [...store.games, ...store.ckGames, ...store.friendGames].find(x => x.id === rec.id);
      if (local && !local.owner && it.mine) continue;
      if ((store.current && store.current.id === rec.id) || (store.ck && store.ck.id === rec.id)) continue; // partie en ligne encore en cours ici
      store.games = store.games.filter(x => x.id !== rec.id);
      store.ckGames = store.ckGames.filter(x => x.id !== rec.id);
      store.friendGames = store.friendGames.filter(x => x.id !== rec.id);
      if (!rec.owner || withMe(rec, 'game')) store[list].unshift(rec); else store.friendGames.unshift(rec);
      ops.push({ store: 'games', put: rec });
      counts.games++;
    }
    counts.put++;
  }
  if (counts.put) {
    store.trainings.sort((a, b) => b.startedAt - a.startedAt);
    store.friendTrainings.sort((a, b) => b.startedAt - a.startedAt);
  }
  write(ops);
  return counts;
}

// ------------------------------------------------------------------ rattachement d'un joueur local à un ami (lot 10, étape 3)
/** Remplace `from` par `to` partout où un joueur est noté : parties (closes, en cours), séances, soirée, derniers réglages.
 *  Renvoie { ops, games: [ids], trainings: [ids] } ; l'état en mémoire suit. */
function rewirePlayer(from, to) {
  const ops = [];
  const out = { games: [], trainings: [] };
  const fixList = list => list.map(g => { const n = rewireGame(g, from, to); if (n && n !== g) { out.games.push(g.id); ops.push({ store: 'games', put: n.ui ? currentRecord(n) : n }); return n; } return g; });
  store.games = fixList(store.games);
  store.ckGames = fixList(store.ckGames);
  for (const k of ['current', 'ck']) {
    const g = store[k];
    const n = g && rewireGame(g, from, to);
    if (n && n !== g) { store[k] = n; out.games.push(g.id); ops.push({ store: 'games', put: currentRecord(n) }); }
  }
  // 0.23.4 : aussi ce qui est déjà reçu de lui et joué sans moi (fusion faite après une synchronisation) ; sinon ses
  // parties et séances de chez lui restaient sur l'ancien identifiant et sortaient de ses stats.
  store.friendGames = fixList(store.friendGames);
  const fixTr = list => list.map(r => { const n = rewireTraining(r, from, to); if (n !== r) { out.trainings.push(r.id); ops.push({ store: 'trainings', put: trainingRecord(n) }); } return n; });
  store.trainings = fixTr(store.trainings);
  store.friendTrainings = fixTr(store.friendTrainings);
  if (store.tr && store.tr.player === from) { store.tr = { ...store.tr, player: to }; out.trainings.push(store.tr.id); ops.push({ store: 'trainings', put: trainingRecord(store.tr) }); }
  if (store.soiree && store.soiree.players.includes(from)) {
    const d = { ...store.soiree.drinks };
    if (d[from]) { d[to] = [...(d[to] || []), ...d[from]]; delete d[from]; }
    store.soiree = { ...store.soiree, players: [...new Set(store.soiree.players.map(id => (id === from ? to : id)))], drinks: d };
    ops.push({ store: 'settings', key: 'soiree', put: store.soiree });
  }
  if (store.lastSetup && Array.isArray(store.lastSetup.players) && store.lastSetup.players.includes(from)) {
    store.lastSetup = { ...store.lastSetup, players: [...new Set(store.lastSetup.players.map(id => (id === from ? to : id)))] };
    ops.push({ store: 'settings', key: 'lastSetup', put: store.lastSetup });
  }
  if (store.settings.profile === from) { store.settings.profile = to; ops.push({ store: 'settings', key: 'display', put: { ...store.settings } }); }
  return { ops, ...out };
}

/**
 * Fusionne le joueur local `localId` dans l'ami `uuid` : le joueur local garde son identifiant (et son historique),
 * prend pseudo, avatar, animation et jeux de l'ami ; la fiche « u:<uuid> » disparaît, ses parties passent au joueur
 * local. Une seule transaction. Renvoie l'entrée du journal des fusions (pour annuler), ou null.
 */
export function mergeFriend(localId, uuid) {
  const L = store.players.find(p => p.id === localId);
  const F = store.players.find(p => p.friend === uuid);
  if (!L || !F || L.friend || L.remote || L.id === F.id) return null;
  const rw = rewirePlayer(F.id, L.id);
  const prev = { name: L.name, avatar: { ...L.avatar }, turnAnim: L.turnAnim ?? null, archived: !!L.archived };
  const merged = { ...L, name: F.name, avatar: { ...F.avatar }, friend: uuid, seen: F.seen, sets: F.sets, archived: false };
  if (F.turnAnim) merged.turnAnim = F.turnAnim; else delete merged.turnAnim;
  store.players = store.players.filter(p => p.id !== F.id).map(p => (p.id === L.id ? merged : p));
  rw.ops.push({ store: 'players', del: F.id }, { store: 'players', put: playerRecord(merged) });
  write(rw.ops);
  return { uuid, localId, friendId: F.id, prev, games: rw.games, trainings: rw.trainings, at: Date.now() };
}

/** Annule une fusion (entrée rendue par mergeFriend) : le joueur local redevient lui-même, la fiche de l'ami revient. */
export function undoMergeFriend(m) {
  const L = store.players.find(p => p.id === m.localId && p.friend === m.uuid);
  if (!L) return false;
  const friend = { id: m.friendId, name: L.name, avatar: { ...L.avatar }, archived: false, friend: m.uuid, seen: L.seen, sets: L.sets };
  if (L.turnAnim) friend.turnAnim = L.turnAnim;
  const back = { ...L, name: m.prev.name, avatar: { ...m.prev.avatar }, archived: !!m.prev.archived };
  delete back.friend; delete back.seen; delete back.sets;
  if (m.prev.turnAnim) back.turnAnim = m.prev.turnAnim; else delete back.turnAnim;
  store.players = store.players.map(p => (p.id === L.id ? back : p));
  store.players.push(friend);
  // Parties de la fiche de l'ami remises à son identifiant (seulement celles qui étaient à lui avant la fusion).
  const ops = [{ store: 'players', put: playerRecord(back) }, { store: 'players', put: playerRecord(friend) }];
  const games = new Set(m.games || []), trs = new Set(m.trainings || []);
  const fix = list => list.map(g => { if (!games.has(g.id)) return g; const n = rewireGame(g, L.id, friend.id); if (n && n !== g) { ops.push({ store: 'games', put: n }); return n; } return g; });
  store.games = fix(store.games);
  store.ckGames = fix(store.ckGames);
  store.friendGames = fix(store.friendGames);
  const fixTr = list => list.map(r => { if (!trs.has(r.id)) return r; const n = rewireTraining(r, L.id, friend.id); ops.push({ store: 'trainings', put: trainingRecord(n) }); return n; });
  store.trainings = fixTr(store.trainings);
  store.friendTrainings = fixTr(store.friendTrainings);
  write(ops);
  return true;
}

export function adoptRemote(id) {
  const p = store.players.find(q => q.id === id && q.remote);
  if (!p) return;
  delete p.remote;
  write([{ store: 'players', put: playerRecord(p) }]);
}

// ------------------------------------------------------------------ partie en cours
/** Enregistre la partie en cours telle quelle (à chaque fléchette, ANNULER, VALIDER, fin de manche validée). */
export function saveCurrent() {
  if (!store.current) return;
  let done = false;
  try { done = currentState().status === STATUS.FINISHED; } catch (e) { /* */ }
  stampFinish(store.current, done);
  write([{ store: 'games', put: currentRecord(store.current) }]);
}

/**
 * 0.25.1 : instant de la dernière fléchette d'une partie (ou séance) finie, gardé dans la base tant qu'elle reste ouverte
 * sur l'écran de fin ; effacé si ANNULER (ou ENCORE UNE SÉRIE) la rouvre. Il sert de fin à la copie comptée et envoyée
 * avant TERMINER / ACCUEIL, puis à l'enregistrement rangé (même empreinte : rien n'est renvoyé pour rien).
 */
function stampFinish(rec, done, now = Date.now()) {
  openRev += 1;
  if (done && !Number.isFinite(rec.finishedAt)) rec.finishedAt = now;
  else if (!done && rec.finishedAt !== undefined) delete rec.finishedAt;
}
const endOf = g => (Number.isFinite(g.finishedAt) ? g.finishedAt : Date.now());
/** Fin d'un enregistrement ouvert et fini qui n'a pas encore son instant (fini avant la 0.25.1) : noté une fois pour toutes. */
function ensureFinish(g, put) {
  if (Number.isFinite(g.finishedAt)) return g.finishedAt;
  g.finishedAt = Date.now();
  if (!store.maquette) write([put()]);
  return g.finishedAt;
}
// Copies closes des enregistrements ouverts, gardées tant que rien n'a changé (allGames() est appelé souvent par rendu,
// et une copie stable garde valables les caches des stats) : chaque enregistrement (save*) change la révision.
let openRev = 0;
const openCache = new Map();
function cachedOpen(kind, src, make) {
  if (!src) return null;
  const c = openCache.get(kind);
  if (c && c.src === src && c.rev === openRev && c.n === src.darts.length) return c.rec;
  const rec = make();
  openCache.set(kind, { src, rev: openRev, n: src.darts.length, rec });
  return rec;
}

/** 0.25.1 : la partie X01 en cours si elle est finie mais pas rangée (écran de fin), telle qu'elle sera rangée ; sinon null. */
export function finishedOpenGame() {
  const g = store.current;
  if (!g || !g.darts.length) return null;
  return cachedOpen('x01', g, () => {
    try { if (computeState(g.config, g.darts).status !== STATUS.FINISHED) return null; } catch (e) { return null; }
    return closedRecord(g, false, ensureFinish(g, () => ({ store: 'games', put: currentRecord(g) })));
  });
}

/** 0.25.1 : la partie de Cricket en cours si elle est finie mais pas rangée ; sinon null. */
export function finishedOpenCk() {
  const g = store.ck;
  if (!g || !g.darts.length) return null;
  return cachedOpen('ck', g, () => {
    try { if (computeCricket(g.config, g.darts).status !== 'finished') return null; } catch (e) { return null; }
    return closedRecord(g, false, ensureFinish(g, () => ({ store: 'games', put: currentRecord(g) })));
  });
}

// ------------------------------------------------------------------ verres (lot 7)
/** Un verre enregistré maintenant : `pint` vrai pour une pinte (50 cl), sinon un verre de 25 cl (0.8.2). */
const drinkRec = (t, at, pint) => { const d = at === null ? { t } : { t, at }; if (pint) d.v = PINT_L; return d; };

/** Ajoute un verre (maintenant) au joueur `id` dans la partie en cours ; `pint` : une pinte (compte pour 2). */
export function addDrink(id, now = Date.now(), pint = false) {
  const g = store.current;
  if (!g) return;
  // Lot 7.6 : un joueur de la partie qui n'est pas (ou plus) dans la soirée de la partie la rejoint.
  if (g.soiree && store.soiree && store.soiree.id === g.soiree && !store.soiree.players.includes(id)) joinSoiree([id]);
  g.drinks = { ...(g.drinks || {}) };
  // Lot 7.1 : le verre prend sa place dans l'historique de la partie (nombre de fléchettes jouées à ce moment).
  g.drinks[id] = [...(g.drinks[id] || []), drinkRec(now, g.darts.length, pint)];
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

/** Verres enregistrés du joueur dans la partie en cours (nombre de saisies : une pinte compte pour une). */
export const drinksHere = id => (store.current && store.current.drinks && store.current.drinks[id] ? store.current.drinks[id].length : 0);

/** Lot 7.6 : verres à afficher pour le joueur `id` dans la partie `g` : ceux de la soirée avant la partie (s'il y en a
 *  une) plus ceux de la partie. Sans soirée : ceux de la partie seulement (comme avant). */
export const gameDrinks = (g, id) => ((g && g.drinksBefore && g.drinksBefore[id]) || 0) + unitsOf(g && g.drinks && g.drinks[id]);

/** 0.8.2 : détail des verres du joueur `id` à montrer avec la partie `g` ({ units, glasses, pints, liters }) : ceux de
 *  la partie et, si elle est d'une soirée, ceux des parties d'avant de la même soirée (et les verres pris hors partie
 *  si c'est la soirée en cours). */
export function gameDrinkTally(g, id) {
  if (!g) return drinkTally();
  const lists = [g.drinks && g.drinks[id]];
  if (g.soiree) {
    for (const x of store.games) if (x !== g && x.soiree === g.soiree && x.startedAt < g.startedAt) lists.push(x.drinks && x.drinks[id]);
    if (store.soiree && store.soiree.id === g.soiree) lists.push(store.soiree.drinks[id]);
  }
  return drinkTally(...lists);
}

/** 0.11.2 : détail des verres de chaque joueur de la partie `g` pris avant elle dans sa soirée (parties d'avant, et
 *  verres pris hors partie si c'est la soirée en cours) : { [joueur]: drinkTally } ou null sans soirée. */
export function beforeTallies(g) {
  if (!g || !g.soiree) return null;
  const out = {};
  for (const id of g.config.players) {
    const lists = store.games.filter(x => x !== g && x.soiree === g.soiree && x.startedAt < g.startedAt).map(x => x.drinks && x.drinks[id]);
    if (store.current === g && store.soiree && store.soiree.id === g.soiree) lists.push(store.soiree.drinks[id]);
    out[id] = drinkTally(...lists);
  }
  return out;
}

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

/**
 * Lot 7.8 (dans l'appli depuis la 0.8.0) : range des parties de l'historique dans une soirée (`soireeId`), ou les en sort (null). Le
 * cumul des verres (`drinksBefore`) est recalculé dans l'ordre des parties pour chaque soirée touchée.
 * Renvoie l'identifiant de la soirée.
 */
export function setGamesSoiree(ids, soireeId) {
  const set = new Set(ids.filter(id => !store.games.some(g => g.id === id && g.owner))); // lot 10 : parties reçues en lecture seule
  const touched = new Set(soireeId ? [soireeId] : []);
  for (const g of store.games) if (set.has(g.id)) { if (g.soiree) touched.add(g.soiree); if (soireeId) g.soiree = soireeId; else delete g.soiree; }
  const changed = new Set(ids);
  for (const sid of touched) for (const g of recomputeSoiree(sid)) changed.add(g.id);
  write(store.games.filter(g => changed.has(g.id)).map(g => ({ store: 'games', put: closedRecord(g, g.abandoned, g.endedAt) })));
  return soireeId;
}

/** Nouvelle soirée pour des parties de l'historique (lot 7.8). */
export const newSoireeId = () => newId('s');

/** Verres d'avant chaque partie d'une soirée, recalculés dans l'ordre des parties ; renvoie ses parties. */
function recomputeSoiree(sid) {
  const games = store.games.filter(g => g.soiree === sid).sort((a, b) => a.startedAt - b.startedAt);
  const run = {};
  for (const g of games) {
    const before = {};
    for (const id of g.config.players) if (run[id]) before[id] = run[id];
    if (Object.keys(before).length) g.drinksBefore = before; else delete g.drinksBefore;
    for (const [id, l] of Object.entries(g.drinks || {})) run[id] = (run[id] || 0) + unitsOf(l);
  }
  return games;
}

const putGames = games => write(games.map(g => ({ store: 'games', put: closedRecord(g, g.abandoned, g.endedAt) })));

/**
 * Version 0.8.1 : corrige les verres d'une partie de l'historique (détail de la partie) : `delta` +1 ajoute un verre au
 * joueur `id` (à la fin de la partie), -1 retire son dernier verre. Les cumuls de sa soirée sont recalculés.
 */
export function editGameDrinks(gameId, id, delta, pint = false) {
  const g = store.games.find(x => x.id === gameId);
  if (!g || g.owner || !g.config.players.includes(id)) return; // lot 10 : partie reçue, en lecture seule
  const list = (g.drinks && g.drinks[id]) || [];
  if (delta < 0 && !list.length) return;
  const t = list.length ? drinkTime(list[list.length - 1]) : (g.endedAt || g.startedAt);
  g.drinks = { ...(g.drinks || {}), [id]: delta > 0 ? [...list, drinkRec(t, g.darts.length, pint)] : list.slice(0, -1) };
  if (!g.drinks[id].length) delete g.drinks[id];
  putGames(g.soiree ? recomputeSoiree(g.soiree) : [g]);
}

/**
 * Version 0.8.1 : verres « resaisis à chaque partie » (avant le mode soirée, il fallait reprendre dans chaque partie les
 * verres des parties d'avant). Pour chaque joueur, dans l'ordre des parties de la soirée : verres de la partie = verres
 * saisis − verres saisis dans sa partie précédente (on garde les derniers saisis) ; s'il en a saisi moins que la fois
 * d'avant, ils comptent tous (il a repris de zéro). Rien n'est enregistré : { id: { before, after } } par joueur et les
 * nouvelles listes par partie.
 */
export function cumulativeDrinksFix(sid) {
  const games = store.games.filter(g => g.soiree === sid).sort((a, b) => a.startedAt - b.startedAt);
  const prev = {};
  const lists = new Map();
  const totals = {};
  for (const g of games) {
    const out = {};
    for (const id of g.config.players) {
      const list = (g.drinks && g.drinks[id]) || [];
      const p = prev[id] || 0;
      const keep = list.length >= p ? list.slice(p) : list;
      if (keep.length) out[id] = keep;
      totals[id] = totals[id] || { before: 0, after: 0 };
      totals[id].before += unitsOf(list);
      totals[id].after += unitsOf(keep);
      prev[id] = list.length;
    }
    lists.set(g.id, out);
  }
  return { totals, lists };
}

/** Applique la correction « resaisis à chaque partie » (annulable : les verres d'avant restent dans `drinksRaw`). */
export function applyCumulativeFix(sid) {
  const { lists } = cumulativeDrinksFix(sid);
  for (const g of store.games) {
    if (!lists.has(g.id) || g.drinksRaw) continue;
    g.drinksRaw = g.drinks || {};
    const d = lists.get(g.id);
    if (Object.keys(d).length) g.drinks = d; else delete g.drinks;
  }
  putGames(recomputeSoiree(sid));
}

/** Annule la correction « resaisis à chaque partie » d'une soirée. */
export function undoCumulativeFix(sid) {
  for (const g of store.games) {
    if (g.soiree !== sid || !g.drinksRaw) continue;
    if (Object.keys(g.drinksRaw).length) g.drinks = g.drinksRaw; else delete g.drinks;
    delete g.drinksRaw;
  }
  putGames(recomputeSoiree(sid));
}

/** La correction « resaisis à chaque partie » a été faite sur cette soirée. */
export const cumulativeFixed = sid => store.games.some(g => g.soiree === sid && g.drinksRaw);

/**
 * 0.11.2 (Guillaume : « personne ne paie sa tournée ») : verres notés à plusieurs joueurs d'une partie au même instant,
 * à la milliseconde près — TOURNÉE SERVIE, gage d'un défi « tournée » ou « les autres boivent », et « UN VERRE POUR
 * TOUS » des versions d'avant (depuis la 0.11.2, chacun a son instant). Rien n'est enregistré : { groups, totals } —
 * groups = [{ game, n (rang de la partie dans la soirée), t, ids, pint }], totals = { [joueur]: { before, after } }
 * (drinkTally).
 */
export function tourneeDrinks(sid) {
  const games = store.games.filter(g => g.soiree === sid).sort((a, b) => a.startedAt - b.startedAt);
  const groups = [];
  const all = {}, removed = {};
  games.forEach((g, i) => {
    const byT = new Map();
    for (const [id, list] of Object.entries(g.drinks || {})) {
      (all[id] = all[id] || []).push(...list);
      for (const d of list) { const t = drinkTime(d); if (!byT.has(t)) byT.set(t, new Map()); byT.get(t).set(id, d); }
    }
    if (g.drinksTournee) return; // déjà corrigée
    for (const [t, m] of byT) {
      if (m.size < 2) continue;
      groups.push({ game: g.id, n: i + 1, t, ids: [...m.keys()], pint: [...m.values()].some(isPint) });
      for (const [id, d] of m) (removed[id] = removed[id] || []).push(d);
    }
  });
  const totals = {};
  for (const id of Object.keys(removed)) {
    const gone = new Set(removed[id]);
    totals[id] = { before: drinkTally(all[id]), after: drinkTally(all[id].filter(d => !gone.has(d))) };
  }
  return { groups, totals };
}

/** Retire les tournées notées d'une soirée (annulable : les verres retirés restent dans `drinksTournee`). */
export function applyTourneeFix(sid) {
  const { groups } = tourneeDrinks(sid);
  for (const grp of groups) {
    const g = store.games.find(x => x.id === grp.game);
    g.drinksTournee = { ...(g.drinksTournee || {}) };
    g.drinks = { ...(g.drinks || {}) };
    for (const id of grp.ids) {
      const list = g.drinks[id] || [];
      const out = list.filter(d => drinkTime(d) === grp.t);
      g.drinksTournee[id] = [...(g.drinksTournee[id] || []), ...out];
      const keep = list.filter(d => drinkTime(d) !== grp.t);
      if (keep.length) g.drinks[id] = keep; else delete g.drinks[id];
    }
    if (!Object.keys(g.drinks).length) delete g.drinks;
  }
  if (groups.length) putGames(recomputeSoiree(sid));
}

/** Remet les tournées retirées d'une soirée. */
export function undoTourneeFix(sid) {
  let any = false;
  for (const g of store.games) {
    if (g.soiree !== sid || !g.drinksTournee) continue;
    g.drinks = { ...(g.drinks || {}) };
    for (const [id, list] of Object.entries(g.drinksTournee)) {
      g.drinks[id] = [...(g.drinks[id] || []), ...list].sort((a, b) => ((drinkAt(a) ?? 0) - (drinkAt(b) ?? 0)) || (drinkTime(a) - drinkTime(b)));
    }
    if (!Object.keys(g.drinks).length) delete g.drinks;
    delete g.drinksTournee;
    any = true;
  }
  if (any) putGames(recomputeSoiree(sid));
}

/** Des tournées notées ont été retirées de cette soirée. */
export const tourneeFixed = sid => store.games.some(g => g.soiree === sid && g.drinksTournee);

/** Débute une soirée avec ces joueurs (une soirée précédente est terminée). */
export function startSoiree(players, now = Date.now()) {
  store.soiree = { id: newId('s'), startedAt: now, players: [...new Set(players)], drinks: {} };
  store.setupDraft = null; // « Nouvelle partie » reprendra les joueurs de la soirée
  saveSoiree();
  return store.soiree;
}

/** 0.11.2 : déplace les verres hors partie de ces joueurs (soirée en cours) dans la partie `g`, à la place `at`. */
function claimSoireeDrinks(g, ids, at = 0) {
  const s = store.soiree;
  let moved = false;
  for (const id of ids) {
    const own = s && s.drinks[id];
    if (!own || !own.length) continue;
    g.drinks = { ...(g.drinks || {}), [id]: [...own.map(d => (typeof d === 'number' ? { t: d, at } : { ...d, at })), ...((g.drinks && g.drinks[id]) || [])].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)) };
    s.drinks = { ...s.drinks };
    delete s.drinks[id];
    moved = true;
  }
  if (moved) saveSoiree();
  return moved;
}

/** Termine la soirée : les parties gardent leurs verres ; rien n'est effacé. 0.11.2 : les verres pris hors partie
 *  depuis la dernière partie de chacun vont dans cette dernière partie (sinon ils se perdaient). */
export function endSoiree() {
  const s = store.soiree;
  if (s) {
    const touched = [];
    for (const id of Object.keys(s.drinks || {})) {
      const g = [...store.games].filter(x => x.soiree === s.id && x.config.players.includes(id)).sort((a, b) => b.startedAt - a.startedAt)[0];
      if (g && claimSoireeDrinks(g, [id], g.darts.length) && !touched.includes(g)) touched.push(g);
    }
    if (touched.length) putGames(touched);
  }
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
  return unitsOf(s.drinks[id]) + soireeGames().reduce((n, g) => n + unitsOf(g.drinks && g.drinks[id]), 0);
}

/** 0.8.2 : détail des verres du joueur dans la soirée en cours ({ units, glasses, pints, liters }). */
export function soireeDrinkTally(id) {
  const s = store.soiree;
  return s ? drinkTally(s.drinks[id], ...soireeGames().map(g => g.drinks && g.drinks[id])) : drinkTally();
}

/** Total des verres de la soirée (tous les joueurs), en détail (0.11.2 : verres de 25 cl et pintes à part). */
export const soireeTotal = () => drinkTally(...(store.soiree ? store.soiree.players.flatMap(id => [store.soiree.drinks[id], ...soireeGames().map(g => g.drinks && g.drinks[id])]) : []));

/** La partie en cours appartient à la soirée en cours et `id` y joue : les verres vont dans la partie. */
const inSoireeGame = id => !!(store.soiree && store.current && store.current.soiree === store.soiree.id && store.current.config.players.includes(id));

/** Un verre de plus pour `id` depuis l'écran Soirée : dans la partie en cours s'il y joue, sinon hors partie. */
export function soireeAddDrink(id, now = Date.now(), pint = false) {
  const s = store.soiree;
  if (!s) return;
  if (inSoireeGame(id)) { addDrink(id, now, pint); return; }
  s.drinks = { ...s.drinks, [id]: [...(s.drinks[id] || []), drinkRec(now, null, pint)] };
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
  if (store.ck) archiveCk(ckState().status !== 'finished'); // lot 10 : une seule partie en cours
  // Lot 7 : ordre tiré au sort au lancement (`shuffle`) et jouer jusqu'au bout (`playOn`, 3 joueurs ou plus). Les derniers
  // réglages gardent l'ordre choisi ; seule la partie prend l'ordre tiré. Rien à migrer : réglages absents = valeurs par
  // défaut (tirage OUI, jusqu'au bout NON).
  const players = setup.shuffle ? shuffled(setup.players) : [...setup.players];
  const config = { startScore: setup.startScore, outMode: setup.outMode, legsToWin: setup.legsToWin, players };
  if (setup.playOn && players.length > 2) config.playOn = true;
  // Lot 9 : handicap (un score de départ par joueur, dans l'ordre de la partie).
  if (setup.handicap && setup.starts) {
    const starts = players.map(id => setup.starts[id] || setup.startScore);
    if (starts.some(v => v !== setup.startScore)) config.starts = starts;
  }
  store.lastSetup = { players: [...setup.players], startScore: setup.startScore, outMode: setup.outMode, legsToWin: setup.legsToWin,
    // REVANCHE (ni l'un ni l'autre donné) garde les préférences d'avant
    shuffle: setup.shuffle ?? store.lastSetup?.shuffle ?? true, playOn: setup.playOn ?? store.lastSetup?.playOn ?? false,
    handicap: setup.handicap ?? store.lastSetup?.handicap ?? false, starts: { ...(setup.starts ?? store.lastSetup?.starts ?? {}) },
    defis: setup.defis ?? store.lastSetup?.defis ?? 'non', game: 'x01', ckMode: store.lastSetup?.ckMode ?? 'points' };
  store.current = { id: newId('g'), config, darts: [], startedAt: Date.now(), validated: 0, ui: freshUi() };
  // Lot 7.6 : l'ordre tiré est noté dans la partie, pour que la REVANCHE tire de nouveau au sort.
  if (setup.shuffle && players.length > 1) store.current.shuffled = true;
  // Lot 7.6 : soirée en cours. Les joueurs de la partie la rejoignent ; la partie garde leurs verres d'avant.
  if (store.soiree) {
    joinSoiree(players);
    store.current.soiree = store.soiree.id;
    // 0.11.2 : les verres pris hors partie (écran Soirée) entrent dans cette partie, avant la première fléchette, pour
    // être comptés partout (tableau de bord, rapport, stats) et ne plus se perdre à la fin de la soirée.
    claimSoireeDrinks(store.current, players);
    const before = {};
    for (const id of players) { const n = soireeDrinks(id) - unitsOf(store.current.drinks && store.current.drinks[id]); if (n) before[id] = n; }
    if (Object.keys(before).length) store.current.drinksBefore = before;
  }
  // Lot 9 : défis de soirée (tirés au sort pendant la partie, voir engine/defis.js).
  if (setup.defis === 'parfois' || setup.defis === 'souvent') { store.current.defis = setup.defis; store.current.defiSet = DEFI_SET; } // lot 7.8 : 14 défis
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
/** Copie mélangée (Fisher-Yates sans biais, hasard du téléphone : engine/shuffle.js, vérifié au lot 7.8). */
export { shuffled };

export const freshUi = () => ({ mult: 1, pause: false, confirm: false, panel: null, boardView: 'visit', announce: null, slide: false, loupe: null, frozen: false, fix: null, cele: null, drinks: false });

export const currentState = () => (store.current ? computeState(store.current.config, store.current.darts) : null);

/** Fin de manche pas encore validée (MANCHE SUIVANTE) : l'écran de fin de manche sert de validation. */
export function legEndPending() {
  const s = currentState();
  return !!(s && s.status === STATUS.PLAYING && s.lastEvent === EVENTS.LEG_WON && store.current.validated !== s.dartCount);
}

/** Où reprendre la partie en cours : jeu, fin de manche (pas encore validée) ou fin de partie. */
export function resumeRoute() {
  if (store.ck) return ckState().status === 'finished' ? '#/cricket/fin' : '#/cricket';
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
    const rec = closedRecord(g, abandoned && s.status !== STATUS.FINISHED, s.status === STATUS.FINISHED ? endOf(g) : Date.now());
    store.games.unshift(rec);
    write([{ store: 'games', put: rec }]);
    closed();
  } else {
    // Lot 7.6 : partie sans fléchette effacée ; ses verres restent à la soirée (hors partie).
    const sv = store.soiree;
    if (sv && g.soiree === sv.id && g.drinks && Object.values(g.drinks).some(l => l.length)) {
      const drinks = { ...sv.drinks };
      for (const [id, list] of Object.entries(g.drinks)) if (list.length) drinks[id] = [...(drinks[id] || []), ...list.map(d => (isPint(d) ? { t: d.t, v: PINT_L } : { t: d.t ?? d }))]; // 0.11.2 : la pinte reste une pinte
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
  // Lot 10 : une partie reçue d'un ami (owner) ne se supprime pas ici ; les miennes, déjà parties en ligne, sont
  // notées pour disparaître aussi chez les amis (étape 4).
  const owned = new Set([...store.games, ...store.ckGames].filter(g => g.owner).map(g => g.id));
  const gone = new Set(ids.filter(id => !owned.has(id)));
  noteDeleted([...gone]);
  const before = store.games.length;
  const ckBefore = store.ckGames.length;
  store.games = store.games.filter(g => !gone.has(g.id));
  store.ckGames = store.ckGames.filter(g => !gone.has(g.id));
  write(gameDeletionOps([...gone]));
  return before - store.games.length + ckBefore - store.ckGames.length;
}

/** Supprime la partie en cours (partie d'essai) : elle n'entre pas dans l'historique. */
export function deleteCurrent() {
  const g = store.current;
  if (!g) return;
  store.current = null;
  noteDeleted([g.id]); // 0.25.1 : déjà envoyée si elle a été finie (puis rouverte par ANNULER)
  write(gameDeletionOps([g.id]));
}

// ------------------------------------------------------------------ sauvegarde : export / import (lot 3)
/** Sauvegarde complète de ce qui est sur le téléphone (src/data/backup.js). */
export function exportBackup(app) {
  const display = { ...store.settings };
  const b = makeBackup({ players: store.players, games: [...store.games, ...store.ckGames], current: store.current || store.ck, display, lastSetup: store.lastSetup,
    trainings: store.trainings, training: store.tr, dartSets: store.dartSets, soiree: store.soiree, trSetup: store.trSetup },
  { app, dbVersion: store.db.version });
  // Lot 9.5 (B) : journal de débogage joint si la case est cochée (texte ; ignoré à l'import).
  if (store.settings.journalInBackup !== false && store.settings.journal !== false) b.journal = journalText(`Strela v${app}`);
  return b;
}

/**
 * Importe une sauvegarde vérifiée (parseBackup) : 'replace' (tout remplacer) ou 'merge' (ajouter ce qui manque).
 * Une seule transaction ; l'état en mémoire suit. Renvoie les chiffres de l'import.
 */
const localData = () => ({ players: store.players, games: [...store.games, ...store.ckGames], current: store.current || store.ck, display: { ...store.settings }, lastSetup: store.lastSetup,
  trainings: store.trainings, training: store.tr, dartSets: store.dartSets });

/** Chiffres d'un import avant de le faire (texte des confirmations). */
export const importCounts = (backup, mode) => importPlan(localData(), backup, mode).counts;

export function applyImport(backup, mode) {
  const local = localData();
  const plan = importPlan(local, backup, mode);
  store.players = plan.state.players.map(p => ({ ...p }));
  store.games = plan.state.games.filter(g => !isCricket(g));
  store.ckGames = plan.state.games.filter(isCricket);
  const cur = plan.state.current
    ? (plan.state.current === local.current ? local.current : { ...plan.state.current, ui: isCricket(plan.state.current) ? freshCkUi() : freshUi() })
    : null;
  store.current = cur && !isCricket(cur) ? cur : null;
  store.ck = cur && isCricket(cur) ? cur : null;
  store.lastSetup = plan.state.lastSetup || null;
  store.setupDraft = null;
  store.draft = null;
  // Lot 8 : entraînement
  store.trainings = [...plan.state.trainings].sort((a, b) => b.startedAt - a.startedAt);
  store.tr = plan.state.training ? (plan.state.training === local.training ? local.training : { ...plan.state.training, ui: freshTrUi() }) : null;
  store.dartSets = [...plan.state.dartSets];
  store.trDraft = null;
  if (plan.state.soiree) store.soiree = plan.state.soiree; // lot 8 du 23/11 : soirée en cours de la sauvegarde
  if (plan.state.trSetup) store.trSetup = plan.state.trSetup;
  Object.assign(store.settings, plan.state.display);
  if (!store.maquette) mirrorSettings();
  write(plan.ops);
  // Lot 10 : parties reçues de la sauvegarde rangées comme au chargement ; celles des amis seront reçues de nouveau
  // (REMPLACER TOUT a vidé la base : tout est redemandé à la synchronisation suivante).
  if (mode === 'replace') { store.friendGames = []; store.friendTrainings = []; saveCloudKey('cloudSync', { ...(store.cloudSync || {}), friendsKey: '' }); }
  partitionReceived();
  return plan.counts;
}

// ------------------------------------------------------------------ suppression d'un joueur
/** Le joueur est-il dans la partie en cours ? (il ne peut alors pas être supprimé) */
export const inCurrentGame = id => !!((store.current && store.current.config.players.includes(id)) || (store.ck && store.ck.config.players.includes(id)));

/** Parties gardées (anonymisées) et effacées si l'on supprime ce joueur. */
export const deletionPreview = id => deletionImpact([...store.games, ...store.ckGames], id);

/** Supprime un joueur (fiche, stats) ; ses parties avec d'autres restent, anonymisées. Une seule transaction. */
export function deletePlayer(id) {
  if (inCurrentGame(id)) return false;
  const r = removePlayer(store.players, [...store.games, ...store.ckGames], id);
  store.players = r.players;
  store.games = r.games.filter(g => !isCricket(g));
  store.ckGames = r.games.filter(isCricket);
  if (store.lastSetup) store.lastSetup = { ...store.lastSetup, players: store.lastSetup.players.filter(p => p !== id) };
  if (store.setupDraft) store.setupDraft.players = store.setupDraft.players.filter(p => p !== id);
  write(deletionOps(id, r, store.lastSetup));
  return true;
}

// ------------------------------------------------------------------ réglages
// La base fait foi ; une copie de thème et mode nuit reste dans localStorage, lue par index.html avant l'affichage
// (pas d'éclair de la mauvaise couleur au lancement). Sommaire de maquette : lus là, jamais écrits.
const KEYS = { theme: 'strela.theme', night: 'strela.night', vibrate: 'strela.vibrate', anim: 'strela.anim', sound: 'strela.sound', voice: 'strela.voice', autoUpdate: 'strela.autoUpdate', autoBackup: 'strela.autoBackupOn' };

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
    store.settings.autoBackup = localStorage.getItem(KEYS.autoBackup) !== '0';
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

/** Lot 10 : connexion et état de la synchronisation (réglages « cloudAuth », « cloudSync », jamais exportés). */
export function saveCloudKey(key, value) {
  if (key !== 'cloudAuth' && key !== 'cloudSync') return Promise.resolve();
  store[key] = value;
  if (store.maquette) return Promise.resolve();
  return write([value === null ? { store: 'settings', del: key } : { store: 'settings', key, put: value }]);
}

/** Le téléphone demande moins d'animations (réglage d'accessibilité) : les animations sont coupées d'office. */
export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
export const animationsOn = () => store.settings.anim && !reducedMotion();

// ------------------------------------------------------------------ Cricket (lot 10)
/** État d'affichage d'une partie de Cricket (non enregistré) : multiplicateur armé, menu pause, présentation. */
export const freshCkUi = () => ({ mult: 1, pause: false, confirm: false, layout: null });

export const ckState = () => (store.ck ? computeCricket(store.ck.config, store.ck.darts) : null);

/** Enregistre la partie de Cricket en cours (à chaque fléchette, ANNULER, VALIDER). */
export function saveCk() {
  if (!store.ck) return;
  let done = false;
  try { done = ckState().status === 'finished'; } catch (e) { /* */ }
  stampFinish(store.ck, done);
  write([{ store: 'games', put: currentRecord(store.ck) }]);
}

/** Démarre un Cricket ({ players, ckMode, legsToWin, shuffle }) ; la partie en cours (X01 ou Cricket) est d'abord rangée. */
export function startCricket(setup) {
  if (store.current) archiveCurrent(currentState().status !== STATUS.FINISHED);
  if (store.ck) archiveCk(ckState().status !== 'finished');
  const players = setup.shuffle ? shuffled(setup.players) : [...setup.players];
  const mode = ['points', 'sans', 'cutthroat'].includes(setup.ckMode) ? setup.ckMode : 'points';
  const config = { game: 'cricket', players, mode, legsToWin: setup.legsToWin || 1 };
  store.lastSetup = { ...(store.lastSetup || { startScore: 501, outMode: 'double' }), players: [...setup.players], legsToWin: setup.legsToWin || 1,
    shuffle: setup.shuffle ?? store.lastSetup?.shuffle ?? true, game: 'cricket', ckMode: mode };
  store.ck = { id: newId('g'), config, darts: [], startedAt: Date.now(), validated: 0, ui: freshCkUi() };
  if (setup.shuffle && players.length > 1) store.ck.shuffled = true;
  write([{ store: 'games', put: currentRecord(store.ck) }, { store: 'settings', key: 'lastSetup', put: store.lastSetup }]);
  return store.ck;
}

/** Range la partie de Cricket en cours (finie ou abandonnée) ; sans fléchette, elle est oubliée. */
export function archiveCk(abandoned) {
  const g = store.ck;
  if (!g) return;
  store.ck = null;
  const s = computeCricket(g.config, g.darts);
  if (g.darts.length && (abandoned || s.status === 'finished')) {
    const rec = closedRecord(g, abandoned && s.status !== 'finished', s.status === 'finished' ? endOf(g) : Date.now());
    store.ckGames.unshift(rec);
    write([{ store: 'games', put: rec }]);
    closed();
  } else {
    write([{ store: 'games', del: g.id }]);
  }
}

/** Supprime la partie de Cricket en cours (partie d'essai). */
export function deleteCk() {
  const g = store.ck;
  if (!g) return;
  store.ck = null;
  noteDeleted([g.id]); // 0.25.1 : déjà envoyée si elle a été finie (puis rouverte par ANNULER)
  write(gameDeletionOps([g.id]));
}

// ------------------------------------------------------------------ entraînement solo (lot 8)
// Séances dans le magasin « trainings » (v3), jeux de fléchettes dans « dartsets » ; derniers choix dans le réglage
// « training ». La séance en cours est écrite à chaque fléchette et à chaque ANNULER, comme une partie.
/** État d'affichage d'une séance (non enregistré) : nombre choisi au pavé en attente de sa zone (23/11), règles ouvertes, menu, loupe figée. */
export const freshTrUi = () => ({ pick: null, zone: null, rules: false, pause: false, confirm: false, loupe: null, add: null, cele: null });

export const trState = () => (store.tr ? trainingState(store.tr, store.tr.darts) : null);

export function saveTr() {
  if (!store.tr) return;
  let done = false;
  try { done = trainingState(store.tr, store.tr.darts).done; } catch (e) { /* */ }
  stampFinish(store.tr, done && store.tr.darts.length > 0);
  write([{ store: 'trainings', put: trainingRecord(store.tr) }]);
}

/** Derniers choix de l'écran Entraînement (joueur, jeu, mode, exercice, cible libre). */
export function saveTrSetup(patch) {
  store.trSetup = { ...(store.trSetup || {}), ...patch };
  if (!store.maquette) write([{ store: 'settings', key: 'training', put: store.trSetup }]);
}

/** Démarre une séance ({ player, setId, mode, exercise, blocks? }) ; une séance en cours est d'abord rangée (arrêtée). */
export function startTraining(setup, now = Date.now()) {
  if (store.tr) closeTraining({ stopped: true });
  const rec = trainingRecord({ id: newId('t'), startedAt: now, endedAt: null, darts: [], rules: RULES_VERSION, ...setup });
  store.tr = { ...rec, ui: freshTrUi() };
  write([{ store: 'trainings', put: trainingRecord(store.tr) }]);
  return store.tr;
}

/** Ajoute une fléchette à la séance en cours ; false si la séance n'en attend plus. */
export function trThrow(dart) {
  const r = store.tr;
  if (!r) return false;
  const darts = [...r.darts, cleanTrainingDart(dart)];
  try { if (trainingState(r, r.darts).done) return false; trainingState(r, darts); } catch (e) { return false; }
  r.darts = darts;
  saveTr();
  logTrDart(r, darts);
  // 0.24.1 : séance finie (dernière fléchette) mais pas encore rangée (TERMINER) : elle part déjà chez les amis.
  try { if (trainingState(r, darts).done) closed(); } catch (e) { /* */ }
  return true;
}

/** 0.24.1 : la séance en cours si elle est finie (toutes ses fléchettes jouées) mais pas rangée, telle qu'envoyée. */
export function finishedOpenTraining() {
  const r = store.tr;
  if (!r || r.owner || !r.darts.length) return null;
  return cachedOpen('tr', r, () => {
    try { if (!trainingState(r, r.darts).done) return null; } catch (e) { return null; }
    return trainingRecord({ ...r, ...cleanSetChanges(r, r.darts.length), endedAt: ensureFinish(r, () => ({ store: 'trainings', put: trainingRecord(r) })) });
  });
}

/** Journal (lot 9.5) : fléchette d'entraînement ajoutée, et en X01 / Cricket solo la volée close (total, bust, reste). */
function logTrDart(r, darts) {
  const d = darts[darts.length - 1];
  let extra = '';
  try {
    const st = trainingState(r, darts);
    const gs = st.gs;
    const v = gs && !st.visitDarts && gs.visits.length ? gs.visits[gs.visits.length - 1] : null;
    if (v && r.exercise === 'x01') extra = ` · volée ${v.bust ? 'BUST' : v.scored}${v.finish ? ' · gagnée' : ` · reste ${v.remainingAfter}`}`;
    else if (v) extra = ` · volée ${v.marks} marque(s)`;
  } catch (e) { extra = ' · état illisible'; }
  log('saisie', `entraînement ${r.exercise} : fléchette ${darts.length} ${trainingDartLabel(d)}${extra}`);
}

export function trUndo() {
  const r = store.tr;
  if (!r) return false;
  // Libre : une série ajoutée et pas encore commencée est d'abord retirée (ANNULER défait le dernier geste).
  if (r.exercise === 'libre' && r.blocks && r.blocks.length > 1) {
    const st = trainingState(r, r.darts);
    if (!st.blocks[st.blocks.length - 1].darts.length) { r.blocks = r.blocks.slice(0, -1); saveTr(); return true; }
  }
  if (!r.darts.length) return false;
  log('saisie', `entraînement ${r.exercise} : ANNULER (fléchette ${r.darts.length} ${trainingDartLabel(r.darts[r.darts.length - 1])} retirée)`);
  r.darts = r.darts.slice(0, -1);
  saveTr();
  return true;
}

/** Libre : une série de plus dans la séance en cours (même écran). */
export function trAddBlock(target, n) {
  const r = store.tr;
  const t = cleanTarget(target);
  if (!r || r.exercise !== 'libre' || !t) return false;
  r.blocks = [...(r.blocks || []), { ...t, n: Math.max(1, Math.min(99, Math.round(n) || 9)) }];
  saveTr();
  return true;
}

/** Range la séance en cours ; sans fléchette, elle est oubliée. `stopped` : arrêtée avant la fin. Renvoie la séance rangée. */
export function closeTraining({ stopped = false } = {}, now = Date.now()) {
  const r = store.tr;
  if (!r) return null;
  store.tr = null;
  if (!r.darts.length) { write([{ store: 'trainings', del: r.id }]); return null; }
  const done = trainingState(r, r.darts).done;
  const rec = trainingRecord({ ...r, ...cleanSetChanges(r, r.darts.length), endedAt: done && Number.isFinite(r.finishedAt) ? r.finishedAt : now, stopped: stopped || !done });
  store.trainings.unshift(rec);
  write([{ store: 'trainings', put: rec }]);
  closed();
  return rec;
}

/** Supprime des séances (closes ou en cours). */
export function deleteTrainings(ids) {
  const owned = new Set(store.trainings.filter(r => r.owner).map(r => r.id));
  const gone = new Set(ids.filter(id => !owned.has(id)));
  noteDeleted([...gone]);
  const before = store.trainings.length + (store.tr ? 1 : 0);
  store.trainings = store.trainings.filter(r => !gone.has(r.id));
  if (store.tr && gone.has(store.tr.id)) store.tr = null;
  write([...gone].map(id => ({ store: 'trainings', del: id })));
  return before - store.trainings.length - (store.tr ? 1 : 0);
}

/**
 * Change de jeu de fléchettes pendant la séance en cours (0.13.0) : les fléchettes suivantes sont notées avec `setId`
 * (null : sans jeu). Avant la première fléchette, c'est le jeu de la séance qui change. Le jeu choisi devient aussi celui
 * proposé à la prochaine séance. false si rien ne change.
 */
export function trChangeSet(setId) {
  const r = store.tr;
  if (!r) return false;
  const id = setId || null;
  const at = r.darts.length;
  if (setAt(r, at) === id) return false;
  const ch = (r.setChanges || []).filter(c => c.at < at);
  const next = at === 0 ? { ...r, setId: id, setChanges: [] } : { ...r, setChanges: [...ch, { at, setId: id }] };
  const clean = cleanSetChanges(next);
  r.setId = clean.setId;
  if (clean.setChanges.length) r.setChanges = clean.setChanges; else delete r.setChanges;
  saveTr();
  saveTrSetup({ setId: id });
  return true;
}

/**
 * Gestion d'une séance close (0.13.0) : note, mise de côté (hors stats et niveau), joueur, jeu d'une partie de la séance
 * (`run` : rang dans setRuns, `setId`). Renvoie la séance modifiée, ou null.
 */
export function updateTraining(id, patch) {
  const i = store.trainings.findIndex(r => r.id === id);
  if (i < 0 || store.trainings[i].owner) return null; // lot 10 : séance reçue, en lecture seule
  let r = { ...store.trainings[i] };
  if ('note' in patch) r.note = String(patch.note || '');
  if ('excluded' in patch) { if (patch.excluded) r.excluded = true; else delete r.excluded; }
  if ('player' in patch && store.players.some(p => p.id === patch.player)) r.player = patch.player;
  if ('run' in patch) {
    const runs = setRuns(r);
    const k = Number(patch.run);
    if (runs[k]) {
      runs[k].setId = patch.setId || null;
      r = { ...r, setId: runs[0].setId, setChanges: runs.slice(1).map(x => ({ at: x.from, setId: x.setId })) };
      const clean = cleanSetChanges(r, r.darts.length);
      r.setId = clean.setId;
      r.setChanges = clean.setChanges;
    }
  }
  const rec = trainingRecord(r);
  if (!rec) return null;
  store.trainings[i] = rec;
  write([{ store: 'trainings', put: rec }]);
  return rec;
}

/** Reprend une séance arrêtée avant la fin (0.13.0) : elle redevient la séance en cours (une autre en cours est d'abord rangée). */
export function resumeTraining(id) {
  const r = store.trainings.find(x => x.id === id);
  if (!r || !r.stopped) return null;
  try { if (trainingState(r, r.darts).done) return null; } catch (e) { return null; }
  if (store.tr) closeTraining({ stopped: true });
  store.trainings = store.trainings.filter(x => x.id !== id);
  const { stopped, ...rest } = r;
  store.tr = { ...trainingRecord({ ...rest, endedAt: null }), ui: freshTrUi() };
  saveTr();
  return store.tr;
}

/** Séance par identifiant (lot 10 : aussi celles reçues d'un ami sans moi, en lecture seule : updateTraining et
 * deleteTrainings n'écrivent que dans store.trainings). */
export const trainingById = id => (store.tr && store.tr.id === id ? store.tr : store.trainings.find(r => r.id === id) || store.friendTrainings.find(r => r.id === id) || null);
export const dartSetById = id => store.dartSets.find(x => x.id === id) || null;
/** Lot 10 : jeu de fléchettes du téléphone, sinon celui d'un ami (`sets` de son profil, lecture seule) ; pour les noms et dessins. */
export const anySetById = id => dartSetById(id) || store.players.reduce((f, p) => f || (Array.isArray(p.sets) ? p.sets.find(x => x && x.id === id) : null), null) || null;
/** Jeux de fléchettes proposés au filtre des stats d'un joueur : ceux de son profil pour un ami, ceux du téléphone
 * sinon (sans les jeux mis de côté), plus tout jeu noté dans ses séances. */
export function setsOfPlayer(pid) {
  const p = playerById(pid);
  const own = p && p.friend ? (Array.isArray(p.sets) ? p.sets : []) : store.dartSets;
  const used = new Set(allTrainings().filter(r => r.player === pid).flatMap(setsUsed).filter(Boolean));
  const out = own.filter(x => x && x.id && (!x.archived || used.has(x.id)));
  for (const id of used) if (!out.some(x => x.id === id)) { const x = anySetById(id); if (x) out.push(x); }
  return out;
}
/** Séances (closes et en cours) qui utilisent un jeu. */
export const setUses = id => store.trainings.filter(r => setsUsed(r).includes(id) || r.setId === id).length + (store.tr && (setsUsed(store.tr).includes(id) || setAt(store.tr, store.tr.darts.length) === id) ? 1 : 0);

export function saveDartSet(x) {
  const rec = dartSetRecord(x);
  if (!rec) return null;
  const i = store.dartSets.findIndex(y => y.id === rec.id);
  if (i < 0) store.dartSets.push(rec); else store.dartSets[i] = rec;
  write([{ store: 'dartsets', put: rec }]);
  return rec;
}

/** Supprime un jeu jamais utilisé (sinon : l'archiver, ses séances le gardent). */
export function deleteDartSet(id) {
  if (setUses(id)) return false;
  store.dartSets = store.dartSets.filter(x => x.id !== id);
  if (store.trSetup && store.trSetup.setId === id) saveTrSetup({ setId: null });
  write([{ store: 'dartsets', del: id }]);
  return true;
}

// ------------------------------------------------------------------ modes de l'application, mise en place (lot 8 du 23/11)
/**
 * Modes de l'application (6.1) : { train, soiree }. Réglage `modes` ; sans réglage enregistré : l'entraînement, et la
 * soirée si le téléphone sert déjà aux soirées (parties, plusieurs joueurs, soirée en cours) — une installation d'avant
 * garde donc tout. Jamais les deux éteints. Les données restent toutes, quel que soit l'état des interrupteurs.
 */
export function appModes() {
  const m = store.settings.modes;
  // Lot 9.2 : « en ligne », activé par défaut (sauf réglage), indépendant des deux autres.
  const online = !(m && typeof m === 'object' && m.online === false);
  if (m && typeof m === 'object' && (m.train || m.soiree)) return { train: !!m.train, soiree: !!m.soiree, online };
  const used = store.games.length || store.ckGames.length || store.players.length > 1 || store.current || store.ck || store.soiree;
  return { train: true, soiree: !!used, online };
}
export function setMode(kind, on) {
  if (kind === 'online') { const m = { ...appModes(), online: !!on }; saveSetting('modes', m); return m; }
  const m = { ...appModes(), [kind === 'soiree' ? 'soiree' : 'train']: !!on };
  if (!m.train && !m.soiree) m[kind === 'soiree' ? 'train' : 'soiree'] = true; // jamais les deux éteints
  saveSetting('modes', m);
  return m;
}
/** Mise en place terminée (6.2) ? Réglage `setup` ; sans réglage : terminée si le téléphone a déjà des données. */
export function setupDone() {
  const s = store.settings.setup;
  if (s && typeof s === 'object') return !!s.done;
  return store.players.length > 0 || store.games.length > 0 || store.trainings.length > 0;
}
/** Premier lancement : rien sur le téléphone et mise en place jamais commencée. */
export const firstRun = () => !setupDone() && !(store.settings.setup && store.settings.setup.started);
export function saveSetup(patch) { saveSetting('setup', { ...(store.settings.setup || {}), ...patch }); }
/** Joueur du profil (Réglages › Profil, entraînement sans mode soirée) : réglage `profile`, sinon le premier joueur actif. */
export function profilePlayer() {
  const id = store.settings.profile;
  return store.players.find(p => p.id === id && !p.archived) || activePlayers()[0] || null;
}
/** Crée ou renomme le joueur du profil ; renvoie le joueur. */
export function saveProfile({ name, avatar } = {}) {
  const cur = profilePlayer();
  const p = cur ? { ...cur } : { id: newId('p'), name: 'Moi', avatar: { kind: 'initials', color: 0 }, archived: false };
  if (typeof name === 'string' && name.trim()) p.name = name.trim().slice(0, 24);
  if (avatar && typeof avatar === 'object') p.avatar = { ...p.avatar, ...avatar };
  const rec = playerRecord(p);
  savePlayer({ ...p, ...rec });
  saveSetting('profile', rec.id);
  return playerById(rec.id);
}
