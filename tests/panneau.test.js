// Panneau cible + historique (lot 3, D) et correction d'une fléchette validée (I), dans la vraie appli : la petite
// cible et HISTORIQUE DE LA PARTIE ouvrent le même panneau ; une case touchée montre ses fléchettes sur la cible ;
// une fléchette corrigée (au pavé du sélecteur ou sur la cible) est enregistrée et la partie recalculée ; une
// correction qui change le déroulé est refusée sans rien toucher. Playwright (sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, readDb, settle, throwDarts, validate, createPlayer, newGame, snapshot } from '../tools/lib/app.mjs';
import { ds } from './helpers.js';
import { polar, sectorAngle, RINGS } from '../src/engine/board.js';

const pw = await loadPlaywright();

test('panneau unique, case sur la cible, correction acceptée puis refusée', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha');
    await createPlayer(page, 'Bravo');
    await newGame(page, ['Alpha', 'Bravo'], { startScore: 301 });
    await throwDarts(page, 'T20 T20 T20');
    await validate(page);
    await throwDarts(page, '20 20 20');
    await validate(page);
    await throwDarts(page, 'T20 20'); // Alpha : 121 → 41 ; volée en cours

    // La petite cible et le menu pause ouvrent le même panneau : cible en haut, tableau dessous.
    await page.click('.mini-board');
    await page.waitForSelector('.live .live-board svg');
    assert.ok(await page.locator('.live .lt').count(), 'le tableau est dans le même panneau');
    assert.match(await page.innerText('.lb-cap'), /ALPHA[\s\S]*TOUR 2/);
    await page.click('[data-act="close-panel"] >> nth=0');
    await page.click('[data-act="pause"]');
    await page.click('[data-act="open-history"]');
    await page.waitForSelector('.live .live-board svg');
    const legs = await page.$$eval('.live .leg-h b', bs => bs.map(b => b.textContent));
    assert.deepEqual(legs, ['MANCHE 1']);

    // Une case du tableau : ses fléchettes sur la cible au-dessus, sans changer de page.
    await page.click('.lt td.c[aria-label^="20, 20, 20"]');
    assert.match(await page.innerText('.lb-cap'), /BRAVO[\s\S]*TOUR 1/);
    assert.deepEqual(await page.$$eval('.lb-darts .fd', b => b.map(x => x.textContent)), ['20', '20', '20']);
    assert.equal(await page.locator('.live-board .imp').count(), 3, '3 marques sur la cible');
    assert.equal(await page.evaluate(() => location.hash), '#/jeu');

    // Correction acceptée (Bravo, 2e fléchette 20 → T19), au pavé du sélecteur, avec confirmation.
    await page.click('.lb-darts .fd >> nth=1');
    await page.click('[data-act="fix-mult"][data-arg="3"]');
    await page.click('[data-act="fix-key"][data-arg="19"]');
    const conf = await page.innerText('.fixer');
    assert.match(conf, /20 → T19/);
    assert.match(conf, /Reste de BRAVO : 241 → 204/);
    await page.click('[data-act="fix-yes"]');
    await settle(page);
    let db = await readDb(page);
    assert.deepEqual(db.current.darts, ds('T20 T20 T20 20 T19 20 T20 20'));

    // Correction refusée : Alpha (121 au début de la volée en cours, T20 20) ; sa 2e fléchette en T20 laisserait 1 :
    // bust, la volée serait coupée et la main passerait.
    await page.click('.lt td.c.open');
    await page.click('.lb-darts .fd >> nth=1');
    await page.click('[data-act="fix-mult"][data-arg="3"]');
    await page.click('[data-act="fix-key"][data-arg="20"]');
    assert.match(await page.innerText('.fixer'), /change le déroulé de la partie : utilise ANNULER/);
    await page.click('[data-act="fix-cancel"]');
    await settle(page);
    assert.deepEqual((await readDb(page)).current.darts, db.current.darts, 'rien n’a été modifié');



    // Correction sur la cible : la 1re fléchette d'Alpha (T20) devient D20 en touchant la zone.
    await page.click('.lt td.c[aria-label^="T20, T20, T20"]');
    await page.click('.lb-darts .fd >> nth=0');
    const [x, y] = polar(sectorAngle(20), (RINGS.doubleIn + RINGS.doubleOut) / 2);
    const at = await page.evaluate(([bx, by, edge]) => {
      const r = document.querySelector('.lb-svg svg').getBoundingClientRect();
      const k = r.width / 2 / edge;
      return [r.left + r.width / 2 + bx * k, r.top + r.height / 2 + by * k];
    }, [x, y, RINGS.edge]);
    await page.mouse.click(...at);
    assert.match(await page.innerText('.fixer'), /T20 → D20/);
    await page.click('[data-act="fix-yes"]');
    await settle(page);
    db = await readDb(page);
    assert.deepEqual(db.current.darts.slice(0, 3).map(d => [d.segment, d.multiplier]), [[20, 2], [20, 3], [20, 3]]);
    assert.ok(Array.isArray(db.current.darts[0].pos), 'position touchée gardée');

    // Retour à la partie : tout est recalculé.
    await page.click('.live [data-act="close-panel"].btn');
    const s = await snapshot(page);
    assert.equal(s.player, 'Alpha');
    assert.equal(s.remaining, String(301 - 160 - 80));
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
