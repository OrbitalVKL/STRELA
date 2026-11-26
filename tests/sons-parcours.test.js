// Lot 9.6 C : sons contextuels en vraie appli — à l'entraînement, une fléchette dans la cible visée sonne comme une
// réussite (avant : le son d'un simple de X01), à côté comme un raté ; série ; familles coupées dans les Réglages ;
// volume.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, createPlayer, settle } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

test('sons : verdict par rapport à la cible visée, familles, volume', { skip, timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.click('[data-act="pad-ring"][data-arg="1"]');
    await createPlayer(page, 'Alpha');
    const sounds = () => page.evaluate(() => window.__strelaFeedback().sounds);
    const key = async k => {
      await page.click(`[data-act="tr-key"][data-arg="${k}"]`);
      if (await page.locator('[data-act="tr-zonepick"]').count()) await page.click('[data-act="tr-zonepick"] >> nth=0');
    };
    await page.evaluate(() => { location.hash = '#/entrainement'; });
    await page.waitForSelector('.trhub');
    await page.click('.propose + .btn[data-act="tr-start"]');
    await page.waitForSelector('.game.train');
    // La cible visée de la première série (secteur au bandeau).
    const target = await page.evaluate(() => window.__strelaTrTarget && window.__strelaTrTarget());
    assert.ok(target && target.s, `cible visée : ${JSON.stringify(target)}`);
    const other = target.s === 5 ? 1 : 5;
    await key(String(target.s));
    await key(String(target.s));
    await key(String(other));
    const s = await sounds();
    assert.deepEqual(s.slice(-3), ['v-hit', 'v-hit', 'v-miss'], `sons : ${s.join(', ')}`);
    // Famille « Fléchettes » coupée : plus rien à la fléchette suivante ; volume noté.
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.click('[data-act="snd-fam-verdicts"][data-arg="0"]');
    await page.click('[data-act="snd-vol"][data-arg="0.5"]');
    await settle(page);
    const n = (await sounds()).length;
    await page.evaluate(() => { location.hash = '#/entrainement/jeu'; });
    await page.waitForSelector('.game.train');
    await key(String(target.s));
    assert.equal((await sounds()).length, n, 'famille coupée : pas de son');
    const set = await page.evaluate(() => window.__strelaSettings ? window.__strelaSettings() : null);
    if (set) { assert.equal(set.soundVolume, 0.5); assert.equal(set.soundFamilies.verdicts, false); }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
