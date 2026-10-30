// Écrans d'erreur (lot 4) dans la vraie appli : erreur inattendue → écran de secours (RECHARGER, EXPORTER LA
// SAUVEGARDE relue de la base), module qui ne se charge pas → écran de secours au lieu d'une page vide, stockage plein
// → alerte avec RÉESSAYER (rien de perdu), base inaccessible → alerte. Playwright (sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, readDb, settle, createPlayer, newGame, throwDarts } from '../tools/lib/app.mjs';
import { parseBackup } from '../src/data/backup.js';

const pw = await loadPlaywright();
const VIEW = { viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', acceptDownloads: true };
const skip = !pw && 'Playwright absent';

test('erreur inattendue : écran de secours, export relu de la base, RECHARGER', { skip, timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const page = await (await browser.newContext(VIEW)).newPage();
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha');
    await createPlayer(page, 'Bravo');
    await newGame(page, ['Alpha', 'Bravo'], { startScore: 301 });
    await throwDarts(page, 'T20 S5');
    await settle(page);
    // Une erreur de programmation dans un gestionnaire d'événement
    await page.evaluate(() => { setTimeout(() => { null.boom(); }, 0); });
    await page.waitForSelector('.rescue');
    assert.match(await page.textContent('.rescue'), /UNE ERREUR INATTENDUE/);
    assert.match(await page.textContent('.rescue-msg'), /null|boom/);
    // Le pavé ne réagit plus (l'appli en panne ne reçoit plus les touches)
    assert.equal(await page.$('[data-key]'), null);
    const dir = mkdtempSync(join(tmpdir(), 'strela-secours-'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.rescue button:has-text("EXPORTER")')]);
    const file = join(dir, dl.suggestedFilename());
    await dl.saveAs(file);
    assert.match(dl.suggestedFilename(), /^strela-\d{8}-\d{4}\.json$/);
    const back = parseBackup(readFileSync(file, 'utf8'));
    assert.deepEqual(back.players.map(p => p.name).sort(), ['Alpha', 'Bravo']);
    assert.equal(back.current.darts.length, 2, 'partie en cours comprise');
    await page.waitForFunction(() => /2 joueurs, 1 partie/.test(document.getElementById('rescue-status').textContent));
    await page.click('.rescue button:has-text("RECHARGER")');
    await page.waitForSelector('.game');
    assert.equal(await page.textContent('#remaining'), '236', 'la partie reprend où elle en était');
  } finally {
    await browser.close();
    await srv.close();
  }
});

test('appli qui ne se charge pas : écran de secours, jamais une page vide', { skip, timeout: 60e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const page = await (await browser.newContext(VIEW)).newPage();
    await page.route(/src\/ui\/app\.js/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export const x = ;' }));
    await page.goto(srv.url);
    await page.waitForSelector('.rescue', { timeout: 20e3 });
    assert.match(await page.textContent('.rescue-msg'), /Unexpected token|démarrage impossible/);
  } finally {
    await browser.close();
    await srv.close();
  }
});

test('stockage plein : alerte, RÉESSAYER réécrit tout ; base inaccessible : alerte', { skip, timeout: 90e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const page = await (await browser.newContext(VIEW)).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha');
    await settle(page);
    // Le téléphone refuse d'écrire (place épuisée)
    await page.evaluate(() => {
      window.__put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () { throw new DOMException('plus de place', 'QuotaExceededError'); };
    });
    await createPlayer(page, 'Bravo');
    await settle(page);
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('.issue');
    assert.match(await page.textContent('.issue'), /STOCKAGE PLEIN/);
    assert.deepEqual((await readDb(page)).players.map(p => p.name), ['Alpha'], 'Bravo pas encore enregistré');
    // Place libérée : RÉESSAYER
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.__put; });
    await page.click('[data-act="issue-retry"]');
    await settle(page);
    await page.waitForFunction(() => !document.querySelector('.issue'));
    assert.deepEqual((await readDb(page)).players.map(p => p.name).sort(), ['Alpha', 'Bravo']);
    assert.deepEqual(errors, []);

    // Base inaccessible dès l'ouverture
    const p2 = await (await browser.newContext(VIEW)).newPage();
    await p2.addInitScript(() => { IDBFactory.prototype.open = function () { throw new DOMException('refusé', 'UnknownError'); }; });
    await p2.goto(srv.url);
    await p2.waitForSelector('.issue');
    assert.match(await p2.textContent('.issue'), /DONNÉES NON ENREGISTRÉES/);
    assert.ok(await p2.$('[data-act="issue-reload"]'));
  } finally {
    await browser.close();
    await srv.close();
  }
});
