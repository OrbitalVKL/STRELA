// Couche de stockage (src/data/db.js, lot 2) dans un vrai navigateur (IndexedDB de Chromium ; Playwright, sauté s'il
// est absent) : écriture et relecture, migrations (données gardées, version suivante qui transforme), transaction de
// suppression d'un joueur (tout ou rien), partie en cours après rechargement, mise à niveau pendant qu'une autre page
// a la base ouverte. Les formes pures (sans navigateur) sont testées dans tests/db.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

async function withPages(fn) {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext();
    const open = async () => {
      const page = await ctx.newPage();
      // Une page de l'appli en maquette : elle n'ouvre pas la base, on y charge le module à la main.
      await page.goto(`${srv.url}?maquette#/sommaire`);
      await page.waitForFunction(() => window.__strela);
      return page;
    };
    await fn(open);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
}

const DB = '/src/data/db.js';

test('base : écriture et relecture, partie en cours après rechargement', { skip, timeout: 60e3 }, () => withPages(async open => {
  const page = await open();
  const written = await page.evaluate(async DB => {
    const m = await import(DB);
    await m.deleteDb('t-rw');
    const db = await m.openDb({ name: 't-rw' });
    const players = [
      { id: 'a', name: 'Alpha', avatar: { kind: 'icon', icon: 'renard', color: 0 }, archived: false },
      { id: 'b', name: 'Bravo', avatar: { kind: 'photo', photo: 'data:image/jpeg;base64,AAAA', color: 3 }, archived: true },
    ];
    const config = { startScore: 501, outMode: 'double', legsToWin: 2, players: ['a', 'b'] };
    const done = { id: 'g1', startedAt: 1000, endedAt: 2000, config, darts: [{ segment: 20, multiplier: 3 }], validated: 1, abandoned: true };
    const current = m.currentRecord({ id: 'g2', startedAt: 3000, config, darts: [{ segment: 20, multiplier: 3, pos: [0.01, -0.6] }, { segment: 5, multiplier: 1 }], validated: 0, ui: { mult: 2 } });
    await db.write([
      ...players.map(p => ({ store: 'players', put: m.playerRecord(p) })),
      { store: 'games', put: done }, { store: 'games', put: current },
      { store: 'settings', key: 'display', put: { theme: 'light', night: false, vibrate: true, anim: false } },
      { store: 'settings', key: 'lastSetup', put: { players: ['a', 'b'], startScore: 501, outMode: 'double', legsToWin: 2 } },
    ]);
    db.close();
    return { players, done, current };
  }, DB);
  assert.equal(written.current.ui, undefined, 'l’état d’affichage n’est pas enregistré');
  assert.equal(written.current.endedAt, null);
  await page.reload();
  await page.waitForFunction(() => window.__strela);
  const back = await page.evaluate(async DB => {
    const m = await import(DB);
    const db = await m.openDb({ name: 't-rw' });
    const all = await db.loadAll();
    db.close();
    return { ...all, version: db.version };
  }, DB);
  assert.equal(back.version, 1);
  assert.deepEqual(back.players.sort((x, y) => x.id.localeCompare(y.id)), written.players);
  assert.deepEqual(back.games, [written.done]);
  assert.deepEqual(back.current, written.current, 'partie en cours relue à l’identique (pos, validated)');
  assert.deepEqual(back.settings.display, { theme: 'light', night: false, vibrate: true, anim: false });
  assert.deepEqual(back.settings.lastSetup.players, ['a', 'b']);
}));

test('base : migrations jouées dans l’ordre, données gardées, base plus récente refusée proprement', { skip, timeout: 60e3 }, () => withPages(async open => {
  const page = await open();
  const r = await page.evaluate(async DB => {
    const m = await import(DB);
    await m.deleteDb('t-mig');
    // Version 1 (celle de l'appli) avec des données…
    const v1 = await m.openDb({ name: 't-mig' });
    await v1.write([
      { store: 'players', put: { id: 'a', name: 'Alpha', avatar: { kind: 'initials', color: 1 }, archived: false } },
      { store: 'games', put: { id: 'g', startedAt: 5, endedAt: 9, config: { startScore: 301, outMode: 'single', legsToWin: 1, players: ['a'] }, darts: [], validated: 0, abandoned: false } },
    ]);
    v1.close();
    // … puis une version 2 imaginaire : un index et une transformation des joueurs.
    const migrations = [...m.MIGRATIONS, (db, tx) => {
      tx.objectStore('games').createIndex('startedAt', 'startedAt');
      const cur = tx.objectStore('players').openCursor();
      cur.onsuccess = () => { const c = cur.result; if (c) { c.update({ ...c.value, name: c.value.name.toUpperCase() }); c.continue(); } };
    }];
    const v2 = await m.openDb({ name: 't-mig', migrations });
    const all = await v2.loadAll();
    const idx = [...v2.db.transaction('games').objectStore('games').indexNames];
    v2.close();
    // L'appli d'avant (version 1) face à la base en version 2 : erreur claire, rien d'effacé.
    let newer = null;
    try { (await m.openDb({ name: 't-mig' })).close(); } catch (e) { newer = e.code; }
    const again = await m.openDb({ name: 't-mig', migrations });
    const still = await again.loadAll();
    again.close();
    // Base neuve : toutes les migrations d'un coup.
    await m.deleteDb('t-new');
    const fresh = await m.openDb({ name: 't-new', migrations });
    const stores = [...fresh.db.objectStoreNames];
    fresh.close();
    return { version: v2.version, all, idx, newer, still, stores };
  }, DB);
  assert.equal(r.version, 2);
  assert.deepEqual(r.all.players.map(p => p.name), ['ALPHA'], 'transformation de la version 2 appliquée');
  assert.equal(r.all.games.length, 1, 'parties gardées');
  assert.deepEqual(r.idx, ['startedAt']);
  assert.equal(r.newer, 'NEWER');
  assert.equal(r.still.games.length, 1);
  assert.deepEqual(r.stores.sort(), ['games', 'players', 'settings']);
}));

test('base : suppression d’un joueur en une seule transaction (tout ou rien)', { skip, timeout: 60e3 }, () => withPages(async open => {
  const page = await open();
  const r = await page.evaluate(async DB => {
    const m = await import(DB);
    const { deletePlayer } = await import('/src/engine/players.js');
    await m.deleteDb('t-del');
    const db = await m.openDb({ name: 't-del' });
    const P = (id, name) => ({ id, name, avatar: { kind: 'initials', color: 0 }, archived: false });
    const G = (id, players) => ({ id, startedAt: 1, endedAt: 2, config: { startScore: 301, outMode: 'double', legsToWin: 1, players }, darts: [], validated: 0, abandoned: false });
    const players = [P('a', 'Alpha'), P('b', 'Bravo')];
    const games = [G('ab', ['a', 'b']), G('a', ['a']), G('b', ['b'])];
    await db.write([...players.map(p => ({ store: 'players', put: p })), ...games.map(g => ({ store: 'games', put: g }))]);
    const res = deletePlayer(players, games, 'a');
    const lastSetup = { players: ['b'], startScore: 301, outMode: 'double', legsToWin: 1 };
    // Une opération invalide (partie sans identifiant) au milieu : toute la transaction est annulée.
    const bad = m.deletionOps('a', res, lastSetup);
    bad.splice(2, 0, { store: 'games', put: { nope: true } });
    let failed = false;
    try { await db.write(bad); } catch (e) { failed = true; }
    const afterFail = await db.loadAll();
    await db.write(m.deletionOps('a', res, lastSetup));
    const after = await db.loadAll();
    db.close();
    return { failed, afterFail, after, res: { kept: res.kept, removed: res.removed } };
  }, DB);
  assert.equal(r.failed, true);
  assert.deepEqual(r.afterFail.players.map(p => p.id).sort(), ['a', 'b'], 'écriture ratée : rien n’a bougé');
  assert.equal(r.afterFail.games.length, 3);
  assert.deepEqual(r.res, { kept: ['ab'], removed: ['a'] });
  assert.deepEqual(r.after.players.map(p => p.id), ['b']);
  assert.deepEqual(r.after.games.map(g => [g.id, g.config.players]).sort(), [['ab', ['~0', 'b']], ['b', ['b']]]);
  assert.deepEqual(r.after.settings.lastSetup.players, ['b']);
}));

test('base : une nouvelle version ouverte ailleurs ferme la connexion de l’ancienne (mise à niveau jamais bloquée)', { skip, timeout: 60e3 }, () => withPages(async open => {
  const oldPage = await open();
  const newPage = await open();
  await oldPage.evaluate(async DB => {
    const m = await import(DB);
    await m.deleteDb('t-vc');
    window.__vc = 0;
    window.__old = await m.openDb({ name: 't-vc', onVersionChange: () => { window.__vc++; } });
    await window.__old.write([{ store: 'players', put: { id: 'a', name: 'Alpha', avatar: { kind: 'initials', color: 0 }, archived: false } }]);
  }, DB);
  const v = await newPage.evaluate(async DB => {
    const m = await import(DB);
    const db = await m.openDb({ name: 't-vc', migrations: [...m.MIGRATIONS, () => {}] });
    const all = await db.loadAll();
    db.close();
    return { version: db.version, players: all.players.length };
  }, DB);
  assert.deepEqual(v, { version: 2, players: 1 });
  assert.equal(await oldPage.evaluate(() => window.__vc), 1, 'l’ancienne page a été prévenue (elle se recharge)');
}));
