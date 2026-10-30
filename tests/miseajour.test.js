// Mise à jour de l'appli (lot 2 ; Playwright, sauté s'il est absent) : une version A, installée avec son service worker
// (adresse localhost, comme en https), a des joueurs et une partie en cours ; on publie une version B dont la base
// passe en version 2 (une migration de plus). Une page de A reste ouverte pendant que B s'ouvre ailleurs. Rien n'est
// perdu ni cassé : B relit tout à l'identique (partie en cours comprise), la page de A se recharge en B, le service
// worker de B remplace celui de A et n'efface que les anciennes copies de fichiers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve, loadPlaywright, ROOT } from '../tools/lib/serve.mjs';
import { ready, readDb, settle, snapshot, throwDarts, validate, createPlayer, newGame } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();

/** Copie du site, version `tag` ; `v2` : la base gagne une migration (index des parties par date). */
function publish(dir, tag, { v2 = false } = {}) {
  for (const d of ['assets', 'src']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  cpSync(join(ROOT, 'manifest.webmanifest'), join(dir, 'manifest.webmanifest'));
  writeFileSync(join(dir, 'index.html'), readFileSync(join(ROOT, 'index.html'), 'utf8').replace(/<!--@version-->[\s\S]*?<!--\/@-->/, tag));
  writeFileSync(join(dir, 'sw.js'), readFileSync(join(ROOT, 'sw.js'), 'utf8').replace('__BUILD__', tag));
  if (v2) {
    const file = join(dir, 'src/data/db.js');
    const src = readFileSync(file, 'utf8');
    const end = "    db.createObjectStore('settings');\n  },\n]);";
    assert.ok(src.includes(end), 'fin de la liste des migrations repérée');
    writeFileSync(file, src.replace(end, "    db.createObjectStore('settings');\n  },\n  (db, tx) => { tx.objectStore('games').createIndex('startedAt', 'startedAt'); },\n]);"));
  }
}

const cacheKeys = page => page.evaluate(() => caches.keys());

test('mise à jour (service worker et base v2) : aucune donnée perdue ni cassée', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'strela-maj-'));
  const srv = await serve(dir);
  const url = srv.url.replace('127.0.0.1', 'localhost'); // service worker autorisé (contexte sûr)
  const browser = await pw.chromium.launch();
  try {
    publish(dir, 'maj-A');
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const errors = [];
    const pageA = await ctx.newPage();
    pageA.on('pageerror', e => errors.push(e.message));
    await pageA.goto(url);
    await ready(pageA);
    await pageA.waitForFunction(() => navigator.serviceWorker.controller !== null);
    assert.deepEqual(await cacheKeys(pageA), ['strela-maj-A']);

    await createPlayer(pageA, 'Alpha');
    await createPlayer(pageA, 'Bravo');
    await newGame(pageA, ['Alpha', 'Bravo']);
    await throwDarts(pageA, 'T20 T20 T20');
    await validate(pageA);
    await throwDarts(pageA, '20 5');
    await settle(pageA);
    const before = await readDb(pageA);
    const screen = await snapshot(pageA);
    assert.equal(before.version, 1);

    // Version B publiée ; la page de A reste ouverte (elle sera prévenue et se rechargera).
    publish(dir, 'maj-B', { v2: true });
    const reloaded = pageA.waitForEvent('load', { timeout: 30e3 }).catch(e => e);
    const pageB = await ctx.newPage();
    pageB.on('pageerror', e => errors.push(e.message));
    await pageB.goto(url);
    await ready(pageB);
    assert.equal(await pageB.innerText('.home-ver'), 'vmaj-B');
    assert.equal(await pageB.locator('a.resume').getAttribute('href'), '#/jeu', 'REPRENDRE la partie en cours');
    const after = await readDb(pageB);
    assert.equal(after.version, 2, 'base mise à niveau');
    assert.deepEqual({ ...after, version: 1 }, before, 'joueurs, parties, partie en cours et réglages identiques');
    await pageB.click('a.resume');
    await pageB.waitForSelector('.game');
    assert.deepEqual(await snapshot(pageB), screen, 'partie retrouvée à l’identique');

    await reloaded;
    await ready(pageA);
    assert.equal(await pageA.evaluate(() => document.querySelector('#build [data-k="version"]').textContent), 'maj-B', 'la page de A s’est rechargée en B');
    assert.deepEqual(await snapshot(pageA), screen);

    // Service worker de B : il prend la main et n'efface que l'ancienne copie de fichiers.
    await pageB.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await pageB.waitForFunction(async () => (await caches.keys()).join() === 'strela-maj-B', null, { polling: 200 });
    await pageB.reload();
    await ready(pageB);
    assert.deepEqual(await readDb(pageB), after, 'toujours intact après l’activation du nouveau service worker');
    assert.deepEqual(await snapshot(pageB), screen);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
