// Sauvegarde de bout en bout dans la vraie appli (lot 3, J) : EXPORTER (fichier téléchargé), base du téléphone
// effacée, IMPORTER › REMPLACER TOUT → base identique (joueurs avec photo, parties, partie en cours, réglages) ;
// FUSIONNER le même fichier n'ajoute rien ; un fichier d'une version future est refusé sans rien toucher.
// Playwright (sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, reload, readDb, settle, throwDarts, validate, createPlayer, newGame } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const keep = db => ({ players: [...db.players].sort((a, b) => a.id.localeCompare(b.id)), games: [...db.games].sort((a, b) => a.id.localeCompare(b.id)), current: db.current, display: db.settings.display, lastSetup: db.settings.lastSetup });

test('exporter, effacer, importer : base identique ; fusion sans doublon ; version future refusée', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const dir = mkdtempSync(join(tmpdir(), 'strela-'));
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha', { icon: 'renard', color: 4 });
    await createPlayer(page, 'Bravo');
    // Photo d'avatar de Bravo, écrite dans la base (le recadrage est vérifié par photo.test.js)
    await settle(page);
    await page.evaluate(photo => new Promise(res => {
      const r = indexedDB.open('strela');
      r.onsuccess = () => {
        const tx = r.result.transaction('players', 'readwrite');
        const st = tx.objectStore('players');
        st.getAll().onsuccess = e => { const b = e.target.result.find(p => p.name === 'Bravo'); st.put({ ...b, avatar: { kind: 'photo', color: 2, photo } }); };
        tx.oncomplete = () => { r.result.close(); res(); };
      };
    }), PHOTO);
    await reload(page);
    await newGame(page, ['Alpha', 'Bravo'], { startScore: 301 });
    for (const v of ['T20 T20 T20', '20 20 20', 'T20 T11 D14']) { await throwDarts(page, v); if (!v.includes('D14')) await validate(page); }
    await page.click('[data-act="rematch"]');
    await page.waitForSelector('.game');
    await throwDarts(page, 'T19 5');
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.click('[data-act="theme"][data-arg="light"]');
    await page.click('[data-act="sound"][data-arg="0"]');
    await settle(page);
    const before = keep(await readDb(page));
    assert.equal(before.games.length, 1);
    assert.ok(before.current && before.current.darts.length === 2);

    // EXPORTER : fichier téléchargé (pas de partage dans Chromium sans écran).
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup-export"]')]);
    assert.match(dl.suggestedFilename(), /^strela-\d{8}-\d{4}\.json$/);
    const file = join(dir, dl.suggestedFilename());
    await dl.saveAs(file);
    const json = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(json.format, 'strela-sauvegarde');
    assert.equal(json.players.find(p => p.name === 'Bravo').avatar.photo, PHOTO, 'photo comprise');
    assert.match(await page.innerText('.bk'), /enregistré dans les téléchargements/);

    // Base effacée (comme une nouvelle installation) : l'appli se recharge, vide.
    // (la page ouverte ferme sa connexion et se recharge, comme lors d'une mise à jour de l'appli)
    await Promise.all([page.waitForEvent('load'), page.evaluate(() => new Promise(res => { const r = indexedDB.deleteDatabase('strela'); r.onsuccess = r.onerror = () => res(); }))]);
    await openApp(page, srv.url, '#/reglages');
    let db = await readDb(page);
    assert.equal(db.players.length + db.games.length, 0, 'base vide');

    // IMPORTER › aperçu › REMPLACER TOUT › confirmation.
    await page.setInputFiles('[data-backup]', file);
    await page.waitForSelector('.bk-prev');
    assert.match(await page.innerText('.bk-prev'), /2\sjoueurs\s·\s1\spartie\s·\sune\spartie\sen\scours/);
    await page.click('[data-act="backup-mode"][data-arg="replace"]');
    assert.match(await page.innerText('.bk'), /REMPLACER TOUTES LES DONNÉES/);
    await page.click('[data-act="backup-yes"]');
    await settle(page);
    db = await readDb(page);
    assert.deepEqual(keep(db), before, 'base identique après l’aller-retour');
    await reload(page);
    assert.deepEqual(keep(await readDb(page)), before, 'toujours identique après rechargement');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'réglages repris');

    // FUSIONNER le même fichier : rien de plus, rien en double.
    await page.setInputFiles('[data-backup]', file);
    await page.click('[data-act="backup-mode"][data-arg="merge"]');
    assert.match(await page.innerText('.bk'), /Ajoute\s0\sjoueur\set\s0\spartie/);
    await page.click('[data-act="backup-yes"]');
    await settle(page);
    assert.deepEqual(keep(await readDb(page)), before);

    // Version future : refusée, rien de touché.
    const future = join(dir, 'futur.json');
    writeFileSync(future, JSON.stringify({ ...json, version: 99, app: '9.9.9' }));
    await page.setInputFiles('[data-backup]', future);
    await page.waitForSelector('.bk .vibe.bad');
    assert.match(await page.innerText('.bk'), /FICHIER REFUSÉ[\s\S]*version plus récente de Strela/);
    assert.equal(await page.locator('[data-act="backup-mode"]').count(), 0);
    await settle(page);
    assert.deepEqual(keep(await readDb(page)), before);
    // REPRENDRE ramène à la partie importée.
    await page.evaluate(() => { location.hash = '#/'; });
    await page.click('a.resume');
    await page.waitForSelector('.game');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
