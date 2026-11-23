// Entraînement 0.14.0 dans la vraie appli (Playwright, sauté s'il est absent) :
// - mode JEUX : X01 301 sortie simple joué seul jusqu'au bout, enregistré avec ses réglages, REJOUER ;
// - Cricket solo arrêté en cours puis visible dans le détail ;
// - stats : triples et carte de chaleur ne comptent que les jeux (pas un exercice lancé tout en triples).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, reload, readDb, settle, createPlayer } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

// Lot 8 du 23/11 : au pavé, le nombre puis sa zone (simple intérieur si rien n'est demandé avant, comme `zone`).
let armed = null;
const zone = async (page, z) => { armed = z; };
async function key(page, k) {
  await page.click(`[data-act="tr-key"][data-arg="${k}"]`);
  const n = Number(k);
  if (n >= 1 && n <= 20) await page.click(`[data-act="tr-zonepick"][data-arg="${armed || 'in'}"]`);
  armed = null;
}
const t20 = async page => { await zone(page, 't'); await key(page, '20'); };

test('jeux en solo : X01 et Cricket, stats réservées aux jeux', { skip, timeout: 150e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha', { color: 0 });

    // Un exercice lancé tout en triples : ne doit pas compter dans la part de triples des stats.
    await page.evaluate(() => { location.hash = '#/entrainement'; });
    await page.waitForSelector('.trhub');
    await page.click('[data-act="tr-start"][data-arg="groupement"]');
    await page.waitForSelector('.game.train');
    for (let i = 0; i < 9; i++) await t20(page);
    await page.waitForSelector('.trend');
    await page.click('[data-act="tr-finish"]');
    await page.waitForSelector('.trhub');

    // Mode JEUX : X01, 301, sortie simple.
    await page.click('[data-act="tr-mode"][data-arg="jeu"]');
    await page.click('[data-act="tr-game"][data-arg="start|301"]');
    await page.click('[data-act="tr-game"][data-arg="out|single"]');
    await page.click('[data-act="tr-start"][data-arg="x01"]');
    await page.waitForSelector('.game.trgame');
    assert.equal((await page.innerText('.taim .tg')).trim(), '301');
    for (let i = 0; i < 3; i++) await t20(page);
    assert.equal((await page.innerText('.taim .tg')).trim(), '121');
    await settle(page);
    await reload(page);
    await page.waitForSelector('.game.trgame');
    assert.equal((await page.innerText('.taim .tg')).trim(), '121', 'reprise après rechargement');
    await t20(page); await t20(page);
    assert.match(await page.innerText('.taim .zl'), /FINITION 1/);
    await key(page, '1');
    await page.waitForSelector('.trend');
    assert.match(await page.innerText('.trend .kpi[data-k="value"]'), /150,5/, "301 en 6 fléchettes");
    await page.click('[data-act="tr-finish-again"]');
    await page.waitForSelector('.game.trgame');
    await settle(page);
    let db = await readDb(page);
    const done = db.trainings.find(r => r.exercise === 'x01' && r.endedAt !== null);
    assert.equal(done.mode, 'jeu');
    assert.deepEqual(done.game, { startScore: 301, outMode: 'single', legs: 1 });
    assert.equal(done.darts.length, 6);
    assert.deepEqual(done.darts[5], { segment: 1, multiplier: 1, ring: 'in' });
    assert.deepEqual(db.trainings.find(r => r.endedAt === null).game, { startScore: 301, outMode: 'single', legs: 1 }, 'REJOUER : mêmes réglages');

    // Cricket : T20 ferme le 20 ; arrêté en cours.
    await page.evaluate(() => { location.hash = '#/entrainement'; });
    await page.waitForSelector('.trhub');
    await page.click('[data-act="tr-game"][data-arg="kind|cricket"]');
    await page.click('[data-act="tr-start"][data-arg="cricket"]');
    await page.waitForSelector('.game.trgame .ckline');
    await t20(page);
    assert.equal(await page.locator('.ckline span.shut').count(), 1);
    await key(page, '19');
    await page.click('[data-act="tr-pause"]');
    await page.click('[data-act="tr-stop"]');
    await page.waitForSelector('[data-act="tr-reopen"]');
    assert.match(await page.innerText('.trhead'), /Cricket solo/);
    await settle(page);
    db = await readDb(page);
    const c = db.trainings.find(r => r.exercise === 'cricket');
    assert.equal(c.stopped, true);
    assert.deepEqual(c.game, { legs: 1 });
    assert.equal(db.trainings.filter(r => r.exercise === 'x01').length, 1, 'le X01 relancé sans fléchette est oublié');

    // Stats : triples = 6 sur 8 fléchettes de jeu (le groupement en triples n'y est pas) ; carte présente.
    await page.evaluate(() => { location.hash = '#/entrainement/stats'; });
    await page.waitForSelector('.trstats .kpis');
    assert.match(await page.innerText('.kpi[data-k="triples"] b'), /^75 %$/);
    assert.match(await page.innerText('.trstats'), /CARTE DE CHALEUR\s*8 FL\./i);
    await page.click('[data-act="ts-ex"][data-arg="groupement"]');
    await page.waitForSelector('.kpi[data-k="triples"]');
    assert.equal((await page.innerText('.kpi[data-k="triples"] b')).trim(), '—');
    assert.equal(await page.locator('.heatbox').count(), 0, 'pas de carte pour un exercice');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
