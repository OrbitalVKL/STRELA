// Strela — enregistrement sur le téléphone (IndexedDB), sans DOM (lot 2).
//
// Base « strela », versionnée : MIGRATIONS[i] fait passer la base de la version i à la version i + 1. À l'ouverture,
// seules les migrations manquantes sont jouées, dans l'ordre, dans la même transaction de mise à niveau (tout ou
// rien). Une migration ne supprime jamais de données : elle crée des magasins, des index, ou transforme des
// enregistrements. Ajouter une version = ajouter une fonction à la fin de la liste, sans toucher aux précédentes.
//
// Magasins (forme des données : docs/interface.md, « Enregistrement ») :
//   players   { id, name, avatar: { kind, icon?, color, photo? }, archived }
//   games     { id, startedAt, endedAt, config, darts[], validated, abandoned }
//             darts[] : { segment, multiplier, pos? } ; la partie en cours est celle dont endedAt vaut null
//   settings  clés « display » { theme, night, vibrate, anim, sound, voice (lot 3, OUI si absents) }, « lastSetup » { players, startScore, outMode,
//             legsToWin }, « storage » { asked, persisted } (demande de stockage persistant)
//
// Toutes les écritures passent par write(ops) : une seule transaction pour la liste d'opérations, durabilité
// « strict » (écrite sur le disque avant d'être annoncée faite). Les transactions sont exécutées dans l'ordre où
// elles sont créées : enregistrer la partie à chaque fléchette garde donc l'ordre des fléchettes.

export const DB_NAME = 'strela';
export const STORES = Object.freeze(['players', 'games', 'settings']);

export const MIGRATIONS = Object.freeze([
  // version 1 (lot 2) : joueurs, parties (en cours et terminées), réglages
  db => {
    db.createObjectStore('players', { keyPath: 'id' });
    db.createObjectStore('games', { keyPath: 'id' });
    db.createObjectStore('settings');
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
export function openDb({ name = DB_NAME, migrations = MIGRATIONS, idb = globalThis.indexedDB, onVersionChange = null } = {}) {
  if (!idb) return Promise.reject(new DbError('ABSENT', 'IndexedDB indisponible dans ce navigateur'));
  return new Promise((resolve, reject) => {
    let r;
    try { r = idb.open(name, migrations.length); } catch (e) { reject(new DbError('OPEN', String(e.message || e), e)); return; }
    r.onupgradeneeded = ev => runMigrations(r.result, r.transaction, ev.oldVersion, migrations);
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

  /** Tout relire : { players, games (terminées ou abandonnées), current (partie en cours ou null), settings }. */
  async loadAll() {
    const tx = this.db.transaction(STORES, 'readonly');
    const [players, records, keys, values] = await Promise.all([
      request(tx.objectStore('players').getAll()),
      request(tx.objectStore('games').getAll()),
      request(tx.objectStore('settings').getAllKeys()),
      request(tx.objectStore('settings').getAll()),
    ]);
    const settings = {};
    keys.forEach((k, i) => { settings[k] = values[i]; });
    return { players, ...splitGames(records), settings };
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
    const done = finished(tx);
    try {
      for (const o of ops) {
        const st = tx.objectStore(o.store);
        if (o.clear) st.clear();
        else if ('del' in o) st.delete(o.del);
        else if (o.key !== undefined) st.put(o.put, o.key);
        else st.put(o.put);
      }
    } catch (e) {
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
export const currentRecord = g => ({
  id: g.id, startedAt: g.startedAt, endedAt: null, config: g.config, darts: g.darts, validated: g.validated, abandoned: false,
});

/** Enregistrement d'une partie close (terminée ou abandonnée). */
export const closedRecord = (g, abandoned, endedAt) => ({
  id: g.id, startedAt: g.startedAt, endedAt, config: g.config, darts: g.darts, validated: g.validated ?? g.darts.length, abandoned: !!abandoned,
});

/** Joueur tel qu'enregistré : rien d'autre que { id, name, avatar, archived } (la photo seulement si l'avatar en est une). */
export function playerRecord(p) {
  const av = { ...(p.avatar || {}) };
  if (av.kind !== 'photo') delete av.photo;
  return { id: p.id, name: p.name, avatar: av, archived: !!p.archived };
}

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

/** Opérations de la suppression de parties (lot 3) : une seule transaction ; joueurs (et leurs photos) jamais touchés. */
export const gameDeletionOps = ids => [...new Set(ids)].map(id => ({ store: 'games', del: id }));
