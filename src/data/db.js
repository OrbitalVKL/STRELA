// Strela — enregistrement sur le téléphone (IndexedDB), sans DOM (lot 2).
//
// Base « strela », versionnée : MIGRATIONS[i] fait passer la base de la version i à la version i + 1. À l'ouverture,
// seules les migrations manquantes sont jouées, dans l'ordre, dans la même transaction de mise à niveau (tout ou
// rien). Une migration ne supprime jamais de données : elle crée des magasins, des index, ou transforme des
// enregistrements. Ajouter une version = ajouter une fonction à la fin de la liste, sans toucher aux précédentes.
//
// Magasins (forme des données : docs/interface.md, « Enregistrement ») :
//   players   { id, name, avatar: { kind, icon?, color, photo? }, archived, checkout: { double, avoidBull } (v2, lot 4),
//             turnAnim? (lot 7.4, facultatif : animation de tour, valeurs TURN_ANIM_VALUES) }
//   games     { id, startedAt, endedAt, config, darts[], validated, abandoned, drinks? (lot 7) }
//             darts[] : { segment, multiplier, pos? } ; la partie en cours est celle dont endedAt vaut null ;
//             config.playOn (lot 7, jouer jusqu'au bout) et drinks { [joueur]: [instants] } facultatifs : aucune migration
//   settings  clés « display » { theme, night, vibrate, anim, sound, voice (lot 3, OUI si absents) }, « lastSetup » { players, startScore, outMode,
//             legsToWin, shuffle?, playOn? (lot 7) }, « storage » { asked, persisted } (demande de stockage persistant),
//             « soiree » (lot 7.6, soirée en cours : soireeRecord ; absente sinon)
//   games, lot 7.6 : shuffled?, soiree?, drinksBefore? facultatifs (withDrinks) : aucune migration
//   games, lot 7.8 : defiSet?, defiDecl? facultatifs (withDrinks) : aucune migration
//   games, 0.11.2 : drinksTournee? facultatif (tournées notées retirées, withDrinks) : aucune migration
//   trainings (v3, lot 8) { id, startedAt, endedAt, player, setId, mode, exercise, blocks?, darts[], stopped? }
//             séances d'entraînement solo (engine/training.js) ; la séance en cours a endedAt null
//   dartsets  (v3, lot 8) jeux de fléchettes (engine/dartsets.js › dartSetRecord) ; la migration y crée les deux jeux
//             de Guillaume (SEED_SETS)
//   settings, lot 8 : « training » (derniers choix de l'écran Entraînement : joueur, jeu, mode, exercice, cible libre)
//
// Toutes les écritures passent par write(ops) : une seule transaction pour la liste d'opérations, durabilité
// « strict » (écrite sur le disque avant d'être annoncée faite). Les transactions sont exécutées dans l'ordre où
// elles sont créées : enregistrer la partie à chaque fléchette garde donc l'ordre des fléchettes.

import { checkoutPrefs } from '../engine/checkout.js';
import { cleanDrinks } from '../engine/alcohol.js';
import { SEED_SETS, dartSetRecord } from '../engine/dartsets.js';
import { cleanTrainingDart, cleanTarget, cleanGame } from '../engine/training.js';

export const DB_NAME = 'strela';
export const STORES = Object.freeze(['players', 'games', 'settings', 'trainings', 'dartsets']);

export const MIGRATIONS = Object.freeze([
  // version 1 (lot 2) : joueurs, parties (en cours et terminées), réglages
  db => {
    db.createObjectStore('players', { keyPath: 'id' });
    db.createObjectStore('games', { keyPath: 'id' });
    db.createObjectStore('settings');
  },
  // version 2 (lot 4) : préférences de finition de chaque joueur (double préféré D20, bull non évité par défaut)
  (db, tx) => {
    const players = tx.objectStore('players');
    players.openCursor().onsuccess = ev => {
      const c = ev.target.result;
      if (!c) return;
      c.update(playerRecord(c.value));
      c.continue();
    };
  },
  // version 3 (lot 8) : séances d'entraînement et jeux de fléchettes (deux magasins nouveaux, rien d'autre ne change) ;
  // les deux jeux de Guillaume sont créés une fois ici (s'il les supprime, ils ne reviennent pas).
  db => {
    db.createObjectStore('trainings', { keyPath: 'id' });
    const sets = db.createObjectStore('dartsets', { keyPath: 'id' });
    for (const ds of SEED_SETS) sets.put(dartSetRecord(ds));
  },
]);

export const DB_VERSION = MIGRATIONS.length;

/** Joue les migrations de `oldVersion` à `migrations.length` (appelé pendant la mise à niveau). */
export function runMigrations(db, tx, oldVersion, migrations = MIGRATIONS) {
  for (let v = oldVersion; v < migrations.length; v++) migrations[v](db, tx, v);
}

const request = r => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const finished = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('écriture annulée'));
});

/** Erreur d'ouverture lisible (la base vient d'une version plus récente de l'appli, accès refusé…). */
export class DbError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'DbError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Ouvre (et met à niveau) la base. `onVersionChange` : une autre page ouvre une version plus récente (mise à jour
 * de l'appli) ; la connexion est fermée pour ne pas la bloquer, à l'appelant de recharger.
 */
export function openDb({ name = DB_NAME, migrations = MIGRATIONS, idb = globalThis.indexedDB, onVersionChange = null, onUpgrade = null } = {}) {
  if (!idb) return Promise.reject(new DbError('ABSENT', 'IndexedDB indisponible dans ce navigateur'));
  return new Promise((resolve, reject) => {
    let r;
    try { r = idb.open(name, migrations.length); } catch (e) { reject(new DbError('OPEN', String(e.message || e), e)); return; }
    r.onupgradeneeded = ev => { runMigrations(r.result, r.transaction, ev.oldVersion, migrations); if (onUpgrade) try { onUpgrade(ev.oldVersion, migrations.length); } catch (e) { /* */ } };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); if (onVersionChange) onVersionChange(); };
      resolve(new Database(db));
    };
    r.onerror = ev => {
      const e = r.error;
      if (ev && ev.preventDefault) ev.preventDefault();
      if (e && e.name === 'VersionError') reject(new DbError('NEWER', 'la base vient d\'une version plus récente de l\'appli', e));
      else reject(new DbError('OPEN', String((e && e.message) || e), e));
    };
  });
}

/** Efface une base (tests). */
export function deleteDb(name, idb = globalThis.indexedDB) {
  return request(idb.deleteDatabase(name));
}

export class Database {
  constructor(db) { this.db = db; }

  get version() { return this.db.version; }

  close() { this.db.close(); }

  /**
   * Tout relire : { players, games (terminées ou abandonnées), current (partie en cours ou null), settings,
   * trainings (closes), training (séance en cours ou null), trainingStale, dartSets } — les magasins du lot 8 ne sont lus
   * que s'ils existent (base d'une version plus ancienne ouverte par les tests).
   */
  async loadAll() {
    const has = n => this.db.objectStoreNames.contains(n);
    const names = STORES.filter(has);
    const tx = this.db.transaction(names, 'readonly');
    const all = n => (has(n) ? request(tx.objectStore(n).getAll()) : Promise.resolve([]));
    const [players, records, keys, values, trs, sets] = await Promise.all([
      request(tx.objectStore('players').getAll()),
      request(tx.objectStore('games').getAll()),
      request(tx.objectStore('settings').getAllKeys()),
      request(tx.objectStore('settings').getAll()),
      all('trainings'),
      all('dartsets'),
    ]);
    const settings = {};
    keys.forEach((k, i) => { settings[k] = values[i]; });
    // Plusieurs séances ouvertes (ne doit pas arriver) : les plus anciennes sont closes, « arrêtées ».
    const t = splitGames(trs);
    const stop = r => { const { abandoned, ...rest } = r; return abandoned ? { ...rest, stopped: true } : rest; };
    return { players, ...splitGames(records), settings, trainings: t.games.map(stop), training: t.current, trainingStale: t.stale.map(stop), dartSets: sets };
  }

  /**
   * Une transaction pour toute la liste : [{ store, put: valeur, key? } | { store, del: clé } | { store, clear: true }].
   * Tout est écrit, ou rien (une erreur annule la transaction entière).
   */
  write(ops) {
    if (!ops.length) return Promise.resolve();
    const names = [...new Set(ops.map(o => o.store))];
    let tx;
    try { tx = this.db.transaction(names, 'readwrite', { durability: 'strict' }); } catch (e) { return Promise.reject(e); }
    let thrown = null; // erreur levée par une opération (ex. QuotaExceededError) : c'est elle qu'on renvoie
    const done = finished(tx).catch(e => { throw thrown || e; });
    try {
      for (const o of ops) {
        const st = tx.objectStore(o.store);
        if (o.clear) st.clear();
        else if ('del' in o) st.delete(o.del);
        else if (o.key !== undefined) st.put(o.put, o.key);
        else st.put(o.put);
      }
    } catch (e) {
      thrown = e;
      try { tx.abort(); } catch (x) { /* déjà annulée */ }
    }
    return done;
  }
}

// ------------------------------------------------------------------ formes (JS pur, testé dans node)
/** Sépare les parties enregistrées : terminées / abandonnées, et la partie en cours (endedAt null, la plus récente). */
export function splitGames(records) {
  const open = records.filter(g => g.endedAt === null || g.endedAt === undefined).sort((a, b) => b.startedAt - a.startedAt);
  const games = records.filter(g => !(g.endedAt === null || g.endedAt === undefined));
  // Plusieurs parties ouvertes (ne doit pas arriver) : les plus anciennes comptent comme abandonnées.
  const stale = open.slice(1).map(g => ({ ...g, endedAt: g.startedAt, abandoned: true }));
  return { games: [...games, ...stale], current: open[0] || null, stale };
}

/** Enregistrement d'une partie en cours (sans l'état d'affichage `ui`). */
export const currentRecord = g => {
  const rec = withDrinks(g, {
    id: g.id, startedAt: g.startedAt, endedAt: null, config: g.config, darts: g.darts, validated: g.validated, abandoned: false,
  });
  // 0.25.1 (champ facultatif) : instant de la dernière fléchette d'une partie finie restée sur l'écran de fin.
  if (Number.isFinite(g.finishedAt)) rec.finishedAt = g.finishedAt;
  return rec;
};

/** Lot 7 : verres de la partie (champ facultatif, absent s'il n'y en a pas : aucune migration). Lot 7.6 : aussi les
 *  champs facultatifs `shuffled` (ordre tiré au sort, pour la REVANCHE), `soiree` (identifiant de la soirée) et
 *  `drinksBefore` ({ [joueur]: verres de la soirée avant cette partie }). */
export function withDrinks(g, rec) {
  const drinks = cleanDrinks(g.drinks);
  if (drinks) rec.drinks = drinks;
  if (g.shuffled === true) rec.shuffled = true;
  if (typeof g.soiree === 'string' && g.soiree) rec.soiree = g.soiree;
  if (g.defis === 'parfois' || g.defis === 'souvent') rec.defis = g.defis; // lot 9 : défis de soirée
  // Lot 7.8 : jeu de défis de la partie (absent = jeu 1, celui du lot 9) et déclarations « main gauche ».
  if (Number.isInteger(g.defiSet) && g.defiSet > 1) rec.defiSet = g.defiSet;
  const decl = cleanDecl(g.defiDecl);
  if (decl) rec.defiDecl = decl;
  const before = cleanBefore(g.drinksBefore);
  if (before) rec.drinksBefore = before;
  // Version 0.8.1 : verres d'avant la correction « resaisis à chaque partie » (pour pouvoir l'annuler) ; facultatif.
  if (g.drinksRaw && typeof g.drinksRaw === 'object') rec.drinksRaw = cleanDrinks(g.drinksRaw) || {};
  // 0.11.2 : tournées notées retirées d'une soirée (annulable), gardées à part.
  if (g.drinksTournee && typeof g.drinksTournee === 'object') rec.drinksTournee = cleanDrinks(g.drinksTournee) || {};
  // Lot 9.2 : partie en ligne { code, role: 'host' | 'guest', me, host } (facultatif ; aucune migration).
  const on = cleanOnline(g.online);
  if (on) rec.online = on;
  return withOwner(g, rec);
}

/** Lot 10 : partie ou séance reçue d'un ami (créateur = `owner`, UUID ; lecture seule) et sa version en ligne
 *  (`cloudMaj`, µs). Champs facultatifs : aucune migration. */
export function withOwner(g, rec) {
  if (typeof g.owner === 'string' && /^[0-9a-f-]{36}$/.test(g.owner)) rec.owner = g.owner;
  if (Number.isFinite(g.cloudMaj)) rec.cloudMaj = g.cloudMaj;
  return rec;
}

/** Marque « en ligne » d'une partie (lot 9.2), nettoyée, ou null. `room` (hôte, partie en cours) : salon à reprendre. */
export function cleanOnline(x) {
  if (!x || typeof x !== 'object' || typeof x.code !== 'string' || !/^[A-Z0-9]{3,8}$/.test(x.code)) return null;
  const out = { code: x.code, role: x.role === 'host' ? 'host' : 'guest' };
  if (typeof x.me === 'string') out.me = x.me;
  if (typeof x.host === 'string') out.host = x.host;
  if (x.room && typeof x.room === 'object') out.room = x.room;
  if (x.cut === true) out.cut = true; // lot 10 : coupure réseau pendant la partie
  return out;
}

/** Déclarations d'une partie (lot 7.8, défi « main gauche ») : { rang de volée: true | false } nettoyé, ou null. */
export function cleanDecl(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const out = {};
  for (const [k, v] of Object.entries(x)) if (/^\d+$/.test(k) && (v === true || v === false)) out[k] = v;
  return Object.keys(out).length ? out : null;
}

/** `drinksBefore` nettoyé (entiers positifs seulement), ou null. */
export function cleanBefore(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const out = {};
  for (const [id, n] of Object.entries(x)) if (Number.isInteger(n) && n > 0) out[id] = n;
  return Object.keys(out).length ? out : null;
}

/** Soirée (lot 7.6, réglage « soiree ») telle qu'enregistrée, ou null si illisible :
 *  { id, startedAt, players: [identifiants], drinks: { [joueur]: [{ t }] } (verres pris hors partie) }. */
export function soireeRecord(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !Number.isFinite(x.startedAt) || !Array.isArray(x.players)) return null;
  const players = [...new Set(x.players.filter(id => typeof id === 'string' && id))];
  return { id: x.id, startedAt: x.startedAt, players, drinks: cleanDrinks(x.drinks) || {} };
}

/** Enregistrement d'une partie close (terminée ou abandonnée). */
export const closedRecord = (g, abandoned, endedAt) => {
  const rec = withDrinks(g, {
    id: g.id, startedAt: g.startedAt, endedAt, config: g.config, darts: g.darts, validated: g.validated ?? g.darts.length, abandoned: !!abandoned,
  });
  if (rec.online) delete rec.online.room; // lot 9.2 : le salon ne sert qu'à reprendre une partie en cours
  return rec;
};

/**
 * Joueur tel qu'enregistré : rien d'autre que { id, name, avatar, archived, checkout, turnAnim? } (la photo seulement si
 * l'avatar en est une ; préférences de finition complétées par leurs valeurs par défaut).
 */
export function playerRecord(p) {
  const av = { ...(p.avatar || {}) };
  if (av.kind !== 'photo') delete av.photo;
  const rec = { id: p.id, name: p.name, avatar: av, archived: !!p.archived, checkout: checkoutPrefs(p.checkout) };
  // Lot 7.4 : animation de tour, champ facultatif (absent = choix par défaut, voir src/ui/turnfx.js) ; aucune migration.
  if (TURN_ANIM_VALUES.includes(p.turnAnim)) rec.turnAnim = p.turnAnim;
  // Lot 9.2 : adversaire d'une partie en ligne, rangé à part des joueurs du téléphone (facultatif).
  if (p.remote === true) rec.remote = true;
  // Lot 10 : ami (profil en ligne, lecture seule ; identifiant « u:<uuid> ») — champs facultatifs, aucune migration :
  // friend (UUID du profil), seen (dernière activité, ms), sets (ses jeux de fléchettes, tels que reçus).
  if (typeof p.friend === 'string' && /^[0-9a-f-]{36}$/.test(p.friend)) {
    rec.friend = p.friend;
    if (Number.isFinite(p.seen)) rec.seen = p.seen;
    if (Array.isArray(p.sets)) rec.sets = p.sets.slice(0, 30);
  }
  return rec;
}

/** Valeurs permises de `turnAnim` (lot 7.4) ; « aucune » est gardée pour qu'un choix explicite l'emporte sur le défaut. */
export const TURN_ANIM_VALUES = Object.freeze(['aucune', 'picto', 'ours', 'cravate', 'carabine', 'planete', 'etoile', 'voyelles']); // picto : lot 7.9

/**
 * Opérations de la suppression d'un joueur (résultat de deletePlayer() du moteur) : fiche retirée, parties
 * anonymisées réécrites, parties jouées seul effacées, derniers réglages sans lui. Une seule transaction.
 */
export function deletionOps(playerId, result, lastSetup) {
  const ops = [{ store: 'players', del: playerId }];
  for (const id of result.removed) ops.push({ store: 'games', del: id });
  const kept = new Set(result.kept);
  for (const g of result.games) if (kept.has(g.id)) ops.push({ store: 'games', put: g });
  if (lastSetup) ops.push({ store: 'settings', key: 'lastSetup', put: lastSetup });
  return ops;
}

/**
 * Séance d'entraînement telle qu'enregistrée (lot 8), ou null si elle est illisible. Les champs inconnus sont retirés ;
 * `endedAt` null = séance en cours ; `stopped` : arrêtée avant la fin (les chiffres restent, le niveau ne la compte pas).
 */
export function trainingRecord(r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || !Number.isFinite(r.startedAt) || !Array.isArray(r.darts)) return null;
  if (typeof r.player !== 'string' || !r.player || typeof r.exercise !== 'string') return null;
  const rec = {
    id: r.id, startedAt: r.startedAt, endedAt: Number.isFinite(r.endedAt) ? r.endedAt : null, player: r.player,
    setId: typeof r.setId === 'string' && r.setId ? r.setId : null, mode: r.mode === 'libre' || r.mode === 'jeu' ? r.mode : 'coach', exercise: r.exercise,
    darts: r.darts.map(cleanTrainingDart),
  };
  if (Array.isArray(r.blocks)) rec.blocks = r.blocks.map(b => { const t = cleanTarget(b); return t && { ...t, n: Math.max(1, Math.min(99, Math.round(Number(b.n)) || 9)) }; }).filter(Boolean);
  if (r.stopped === true) rec.stopped = true;
  // 0.25.1 (champ facultatif) : séance finie (dernière fléchette) mais pas encore rangée : instant de sa fin.
  if (rec.endedAt === null && Number.isFinite(r.finishedAt)) rec.finishedAt = r.finishedAt;
  // 0.13.0 (champs facultatifs, aucune migration) : jeu changé en cours de séance, note, séance mise de côté.
  if (Array.isArray(r.setChanges)) {
    const by = new Map();
    for (const c of r.setChanges) if (c && Number.isInteger(c.at) && c.at >= 1 && c.at <= 10000 && (c.setId === null || (typeof c.setId === 'string' && c.setId))) by.set(c.at, c.setId);
    const ch = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([at, setId]) => ({ at, setId }));
    if (ch.length) rec.setChanges = ch;
  }
  if (typeof r.note === 'string' && r.note.trim()) rec.note = r.note.slice(0, 300);
  if (r.excluded === true) rec.excluded = true;
  // 0.14.0 (champ facultatif) : réglages d'un jeu en solo (X01, Cricket).
  const g = cleanGame(r.exercise, r.game);
  if (g) rec.game = g;
  // Lot 8 du 23/11 (champ facultatif) : version des règles des exercices (2 : la cible change à la fin d'une volée ;
  // une séance d'avant, sans ce champ, garde ses règles, par exemple 20 fléchettes par numéro au 20-19-18).
  if (Number.isInteger(r.rules) && r.rules >= 2 && r.rules <= 99) rec.rules = r.rules;
  // Lot 8 du 23/11 (5.2) : déclarations des défis à déclarer (« main gauche ») d'un X01 solo, comme une partie.
  const decl = cleanDecl(r.defiDecl);
  if (decl) rec.defiDecl = decl;
  return withOwner(r, rec);
}

/** Opérations de la suppression de parties (lot 3) : une seule transaction ; joueurs (et leurs photos) jamais touchés. */
export const gameDeletionOps = ids => [...new Set(ids)].map(id => ({ store: 'games', del: id }));
