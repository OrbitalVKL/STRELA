// Lot 10 : une partie de Cricket dans la vraie appli (Playwright, sauté s'il est absent) — lancée depuis « Nouvelle
// partie », saisie au pavé, rechargement en plein jeu, VALIDER, fin de partie, rangée dans l'historique et la base,
// détail ; puis un X01 se lance normalement (les écrans X01 ne voient pas le Cricket).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, reload, readDb, settle, createPlayer, newGame } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

const hit = async (page, notation) => {
  for (const t of notation.trim().split(/\s+/)) {
    const m = /^([DT]?)(\d+|R)$/.exec(t);
    if (m[1]) await page.click(`[data-act="ck-mult"][data-arg="${m[1] === 'T' ? 3 : 2}"]`);
    await page.click(`[data-act="ck-hit"][data-arg="${m[2] === 'R' ? 0 : m[2]}"]`);
  }
};
const marks = page => page.evaluate(() => [...document.querySelectorAll('.ckface .ckr')].map(r => [...r.querySelectorAll('.c')].map(c => (c.querySelector('.mk') ? Number(c.querySelector('.mk').getAttribute('class').match(/m(\d)/)[1]) : 0))));

test('Cricket de bout en bout : saisie, rechargement, VALIDER, fin, historique', { skip, timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha', { color: 0 });
    await createPlayer(page, 'Bravo', { color: 3 });
    await page.evaluate(() => { location.hash = '#/nouvelle'; });
    await page.waitForSelector('[data-act="launch"]');
    for (const n of ['Alpha', 'Bravo']) await page.click(`.pool button[data-act="add"]:has(.nm:text-is("${n}"))`);
    await page.click('[data-act="shuffle"][data-arg="non"]');
    await page.click('[data-act="game"][data-arg="cricket"]');
    await page.click('[data-act="ckmode"][data-arg="sans"]');
    await page.click('[data-act="launch"]');
    await page.waitForSelector('.ckgame.face');

    await hit(page, 'T20 D19');
    assert.deepEqual((await marks(page)).slice(0, 2), [[3, 0], [2, 0]]);
    await reload(page);
    assert.equal(await page.evaluate(() => location.hash), '#/cricket');
    assert.deepEqual((await marks(page)).slice(0, 2), [[3, 0], [2, 0]], 'marques retrouvées après rechargement');
    await hit(page, '19');
    await page.waitForSelector('[data-act="ck-validate"]');
    assert.equal(await page.locator('[data-act="ck-hit"]:not([disabled])').count(), 0, 'volée en attente : pavé coupé');
    await page.click('[data-act="ck-validate"]');
    await hit(page, 'R R R');
    await page.click('[data-act="ck-validate"]');
    // ANNULER revient sur la volée validée.
    await page.click('[data-act="ck-undo"]');
    await page.waitForSelector('[data-act="ck-validate"]', { state: 'detached' });
    await hit(page, 'R');
    await page.click('[data-act="ck-validate"]');
    await hit(page, 'T18 T17 T16'); await page.click('[data-act="ck-validate"]');
    await hit(page, 'R R R'); await page.click('[data-act="ck-validate"]');
    await hit(page, 'T15 25 D25');
    await page.waitForSelector('.result-head');
    assert.equal(await page.evaluate(() => location.hash), '#/cricket/fin');
    assert.match(await page.textContent('.result-head'), /Alpha/i);
    await page.click('[data-act="ck-home"]');
    await settle(page);
    const db = await readDb(page);
    const g = db.games.find(x => x.config.game === 'cricket');
    assert.ok(g && !g.abandoned && db.current === null, 'partie rangée, terminée');
    assert.deepEqual(g.config, { game: 'cricket', players: g.config.players, mode: 'sans', legsToWin: 1 });
    assert.equal(g.darts.length, 15);
    await page.evaluate(() => { location.hash = '#/historique'; });
    await page.waitForSelector('a.hrow[href^="#/cricket/partie/"]');
    await page.click('a.hrow[href^="#/cricket/partie/"]');
    await page.waitForSelector('.ckvis');
    assert.equal(await page.locator('.ckvis li').count(), 5);
    // Un X01 ensuite : rien de cassé.
    await newGame(page, ['Alpha', 'Bravo']);
    assert.ok(await page.locator('.game.port').count());
    await page.evaluate(() => { location.hash = '#/stats'; });
    await page.waitForSelector('[data-k="ckmpr"]');
    assert.deepEqual(errors, [], 'aucune erreur JS');
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
