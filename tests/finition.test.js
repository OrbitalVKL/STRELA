// Préférences de finition (lot 4) dans la vraie appli : fiche joueur (double préféré, éviter le bull) enregistrée dans
// la base, gardée au rechargement ; la finition conseillée dans les cases de la volée en tient compte (41 : S1 D20 pour
// un joueur au réglage par défaut, S9 D16 pour un joueur au D16). Playwright (sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, readDb, settle, reload, throwDarts, validate, createPlayer, newGame } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const VIEW = { viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' };
const hints = page => page.$$eval('.visit .dart .cs', els => els.map(e => e.textContent.trim()));

test('finition : double préféré et bull évité, enregistrés, conseillés en jeu', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const page = await (await browser.newContext(VIEW)).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha');
    await createPlayer(page, 'Bravo');
    // Bravo : D16, bull évité
    await page.click('.list .item:has(.name:text-is("Bravo"))');
    await page.waitForSelector('.dgrid');
    assert.equal(await page.getAttribute('[data-act="fin-double"][data-arg="20"]', 'aria-pressed'), 'true', 'D20 par défaut');
    await page.click('[data-act="fin-double"][data-arg="16"]');
    await page.click('[data-act="fin-bull"][data-arg="1"]');
    assert.match(await page.textContent('.fin-ex'), /41 S9 D16/);
    assert.match(await page.textContent('.fin-ex'), /50 S10 D16|50 S18 D16/);
    await page.click('[data-act="save-player"]');
    await page.waitForSelector('.list');
    await settle(page);
    let db = await readDb(page);
    const byName = Object.fromEntries(db.players.map(p => [p.name, p]));
    assert.deepEqual(byName.Bravo.checkout, { double: 16, avoidBull: true });
    assert.deepEqual(byName.Alpha.checkout, { double: 20, avoidBull: false });
    await reload(page);
    await page.evaluate(id => { location.hash = `#/joueur/${id}`; }, byName.Bravo.id);
    await page.waitForSelector('.dgrid');
    assert.equal(await page.getAttribute('[data-act="fin-double"][data-arg="16"]', 'aria-pressed'), 'true', 'gardé au rechargement');
    assert.equal(await page.getAttribute('[data-act="fin-bull"][data-arg="1"]', 'aria-pressed'), 'true');

    // 301 : chacun arrive à 41 ; conseils différents selon le joueur
    await newGame(page, ['Alpha', 'Bravo'], { startScore: 301 });
    for (const v of ['T20 T20 T20', 'T20 T20 T20', 'T20 S20 0', 'T20 S20 0']) { await throwDarts(page, v); await validate(page); }
    assert.deepEqual(await hints(page), ['1', 'D20'], 'Alpha (défaut) : S1 D20');
    await throwDarts(page, '0 0 0');
    await validate(page);
    assert.deepEqual(await hints(page), ['9', 'D16'], 'Bravo (D16) : S9 D16');
    await throwDarts(page, 'S9 0 0'); // Bravo : 41 → 32
    await validate(page);
    assert.deepEqual(await hints(page), ['1', 'D20'], 'Alpha toujours à 41');
    await throwDarts(page, 'S1 0 0'); // Alpha : 41 → 40
    await validate(page);
    assert.deepEqual(await hints(page), ['D16'], 'Bravo à 32 : D16');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
