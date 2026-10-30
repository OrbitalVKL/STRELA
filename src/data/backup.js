// Strela — sauvegarde : export / import JSON (lot 3, avancé du lot 4), JS pur sans DOM (testé dans node).
//
// Fichier « strela-AAAAMMJJ-HHMM.json » :
//   { format: 'strela-sauvegarde', version: 1, app (version de l'appli), exportedAt (ISO), dbVersion,
//     players: [joueur (photo comprise, data: URL)], games: [partie (la partie en cours a endedAt null)],
//     settings: { display, lastSetup } }
// Les enregistrements ont exactement la forme de la base (src/data/db.js) : ce format sert aussi au passage de la
// page web à l'APK (lot 5). `storage` (réponse du navigateur au stockage persistant) est propre à l'appareil : il
// n'est pas exporté.
//
// Import : le fichier est entièrement vérifié avant toute écriture ; invalide ou d'une version future, il est
// refusé avec un message clair et rien n'est touché. Deux façons :
//   REMPLACER TOUT : la base devient exactement la sauvegarde (joueurs, parties, réglages) ;
//   FUSIONNER      : on ajoute les joueurs et les parties absents (par identifiant, sans doublon) ; ce qui existe
//                    déjà sur le téléphone est gardé tel quel, réglages compris.
// Les écritures d'un import tiennent dans une seule transaction (tout ou rien).

import { computeState } from '../engine/x01.js';
import { playerRecord } from './db.js';

export const BACKUP_FORMAT = 'strela-sauvegarde';
export const BACKUP_VERSION = 1;

const pad = n => String(n).padStart(2, '0');
/** Nom du fichier : strela-AAAAMMJJ-HHMM.json (heure du téléphone). */
export function backupFileName(date = new Date()) {
  return `strela-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

/** Enregistrement d'une partie tel qu'exporté (sans état d'affichage). */
const gameOut = g => ({
  id: g.id, startedAt: g.startedAt, endedAt: g.endedAt ?? null, config: g.config,
  darts: g.darts.map(d => (Array.isArray(d.pos) ? { segment: d.segment, multiplier: d.multiplier, pos: d.pos } : { segment: d.segment, multiplier: d.multiplier })),
  validated: g.validated ?? g.darts.length, abandoned: !!g.abandoned,
});

/** Sauvegarde complète : { players, games (closes), current (ou null), settings: { display, lastSetup } }. */
export function makeBackup({ players, games, current, display, lastSetup }, { app = 'dev', dbVersion = null, now = new Date() } = {}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app,
    exportedAt: now.toISOString(),
    dbVersion,
    players: players.map(playerRecord),
    games: [...games.map(g => gameOut({ ...g, endedAt: g.endedAt ?? g.startedAt })), ...(current ? [gameOut({ ...current, endedAt: null })] : [])],
    settings: { display: display ? { ...display } : null, lastSetup: lastSetup ? { ...lastSetup } : null },
  };
}

export class BackupError extends Error {
  constructor(message) { super(message); this.name = 'BackupError'; }
}

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isId = x => typeof x === 'string' && x.length > 0 && x.length <= 200;

/**
 * Lit et vérifie un fichier de sauvegarde (texte). Renvoie { players, games, current, settings, summary } ou lève
 * une BackupError au message clair (rien n'est touché).
 *   summary : { players, games (closes), current (vrai si une partie en cours), exportedAt, app }
 */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new BackupError('Ce fichier n\'est pas une sauvegarde Strela : son contenu est illisible.'); }
  if (!isObj(data) || data.format !== BACKUP_FORMAT) throw new BackupError('Ce fichier n\'est pas une sauvegarde Strela.');
  if (!Number.isInteger(data.version) || data.version < 1) throw new BackupError('Sauvegarde abîmée : version du format inconnue.');
  if (data.version > BACKUP_VERSION) {
    throw new BackupError(`Sauvegarde faite par une version plus récente de Strela${data.app ? ` (${data.app})` : ''} : mets l'appli à jour avant de l'importer.`);
  }
  if (!Array.isArray(data.players) || !Array.isArray(data.games)) throw new BackupError('Sauvegarde abîmée : joueurs ou parties manquants.');
  const ids = new Set();
  const players = data.players.map((p, i) => {
    if (!isObj(p) || !isId(p.id) || typeof p.name !== 'string' || !isObj(p.avatar)) throw new BackupError(`Sauvegarde abîmée : joueur n° ${i + 1} illisible.`);
    if (ids.has(p.id)) throw new BackupError(`Sauvegarde abîmée : joueur « ${p.name} » en double.`);
    if (p.avatar.kind === 'photo' && !(typeof p.avatar.photo === 'string' && p.avatar.photo.startsWith('data:image/'))) {
      throw new BackupError(`Sauvegarde abîmée : photo de « ${p.name} » illisible.`);
    }
    ids.add(p.id);
    return playerRecord(p);
  });
  const gameIds = new Set();
  const all = data.games.map((g, i) => {
    const bad = () => new BackupError(`Sauvegarde abîmée : partie n° ${i + 1} illisible.`);
    if (!isObj(g) || !isId(g.id) || !Number.isFinite(g.startedAt) || !isObj(g.config) || !Array.isArray(g.darts)) throw bad();
    if (!(g.endedAt === null || Number.isFinite(g.endedAt))) throw bad();
    if (gameIds.has(g.id)) throw new BackupError(`Sauvegarde abîmée : partie n° ${i + 1} en double.`);
    try { computeState(g.config, g.darts); } catch (e) { throw bad(); }
    gameIds.add(g.id);
    return gameOut(g);
  });
  const open = all.filter(g => g.endedAt === null);
  if (open.length > 1) throw new BackupError('Sauvegarde abîmée : plusieurs parties en cours.');
  const settings = isObj(data.settings) ? data.settings : {};
  const out = {
    players,
    games: all.filter(g => g.endedAt !== null),
    current: open[0] || null,
    settings: { display: isObj(settings.display) ? settings.display : null, lastSetup: isObj(settings.lastSetup) ? settings.lastSetup : null },
  };
  out.summary = { players: players.length, games: out.games.length, current: !!out.current, exportedAt: data.exportedAt || null, app: data.app || null };
  return out;
}

/**
 * Ce que l'import change (pur) : nouvel état { players, games, current, display, lastSetup }, opérations de base
 * (une seule transaction) et chiffres { playersAdded, gamesAdded, currentSkipped }.
 *   local : { players, games, current, display, lastSetup } (état du téléphone)
 *   mode  : 'replace' | 'merge'
 * Fusion : une partie en cours de la sauvegarde n'est reprise que si aucune partie n'est en cours sur le téléphone ;
 * sinon elle est rangée dans l'historique, abandonnée (comme deux parties ouvertes au démarrage, db.js).
 */
export function importPlan(local, backup, mode) {
  if (mode === 'replace') {
    const ops = [{ store: 'players', clear: true }, { store: 'games', clear: true }];
    for (const p of backup.players) ops.push({ store: 'players', put: p });
    for (const g of backup.games) ops.push({ store: 'games', put: g });
    if (backup.current) ops.push({ store: 'games', put: backup.current });
    const display = backup.settings.display ? { ...local.display, ...backup.settings.display } : local.display;
    ops.push({ store: 'settings', key: 'display', put: display });
    if (backup.settings.lastSetup) ops.push({ store: 'settings', key: 'lastSetup', put: backup.settings.lastSetup });
    else ops.push({ store: 'settings', del: 'lastSetup' });
    return {
      ops,
      state: { players: backup.players, games: backup.games, current: backup.current, display, lastSetup: backup.settings.lastSetup },
      counts: { playersAdded: backup.players.length, gamesAdded: backup.games.length + (backup.current ? 1 : 0), currentSkipped: false },
    };
  }
  const havePlayers = new Set(local.players.map(p => p.id));
  const haveGames = new Set([...local.games.map(g => g.id), ...(local.current ? [local.current.id] : [])]);
  const newPlayers = backup.players.filter(p => !havePlayers.has(p.id));
  const newGames = backup.games.filter(g => !haveGames.has(g.id));
  let current = local.current;
  let currentSkipped = false;
  if (backup.current && !haveGames.has(backup.current.id)) {
    if (current) { newGames.push({ ...backup.current, endedAt: backup.current.startedAt, abandoned: true }); currentSkipped = true; } else current = backup.current;
  }
  const ops = [
    ...newPlayers.map(p => ({ store: 'players', put: p })),
    ...newGames.map(g => ({ store: 'games', put: g })),
    ...(current && current !== local.current ? [{ store: 'games', put: current }] : []),
  ];
  return {
    ops,
    state: { players: [...local.players, ...newPlayers], games: [...local.games, ...newGames], current, display: local.display, lastSetup: local.lastSetup },
    counts: { playersAdded: newPlayers.length, gamesAdded: newGames.length + (current && current !== local.current ? 1 : 0), currentSkipped },
  };
}
