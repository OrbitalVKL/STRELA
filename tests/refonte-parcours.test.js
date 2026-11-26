// 0.26.0 : refonte des infos (proposition A « deux espaces ») dans la vraie appli : accueil (bascule, six tuiles),
// stats en tuiles, fiche d'un indicateur, records, historique des séances, et d'une stat au déroulé ouvert sur la volée,
// des deux côtés. Le cas de Patrick : un 501 en solo avec une volée de 135, laissé sur « SÉANCE FINIE ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, createPlayer, settle, newGame, throwDarts, validate, ack } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';
const go = async (page, hash, sel) => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForSelector(sel); };
async function trKey(page, k, z = 'in') {
  await page.click(`[data-act="tr-key"][data-arg="${k}"]`);
  const n = Number(k);
  if (n >= 1 && n <= 20) await page.click(`[data-act="tr-zonepick"][data-arg="${z}"]`);
}

test('deux espaces : accueil, stats en tuiles, fiche, records, séances, déroulé ouvert sur la volée', { skip, timeout: 180e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.click('[data-act="pad-ring"][data-arg="1"]');
    await createPlayer(page, 'Patrick');
    await createPlayer(page, 'Gilles');

    // Une partie X01 (301, sortie double) : Patrick 140 au premier tour.
    await newGame(page, ['Patrick', 'Gilles'], { startScore: 301 });
    await throwDarts(page, 'T20 T20 D10'); await validate(page); // Patrick : 140, reste 161
    await throwDarts(page, 'S1 S1 S1'); await validate(page); // Gilles
    await throwDarts(page, 'T20 T19 S20'); await validate(page); // Patrick : 137, reste 24
    await throwDarts(page, 'S1 S1 S1'); await validate(page);
    await throwDarts(page, 'D12'); // gagnée
    await page.waitForSelector('[data-act="undo-end"]');
    await ack(page);
    await page.click('[data-act="finish-home"]');

    // Accueil : bascule, six tuiles rangées pareil, sans chiffre.
    await page.waitForSelector('.home2 .space');
    assert.deepEqual(await page.$$eval('.tile3', a => a.map(x => x.getAttribute('href'))).then(h => h.length), 6);
    assert.equal(await page.locator('.tile3[href="#/historique"]').count(), 1);

    // Stats en tuiles (Parties) → Volées → Meilleure volée → fiche → la partie ouverte sur le tour de 140.
    await page.click('.tile3[href="#/tableau/p"]');
    await page.waitForSelector('.dash .kgrid');
    await page.click('.kfams a:text-is("VOLÉES")');
    await page.waitForSelector('.ktile[data-k="bestVisit"]');
    assert.match(await page.innerText('.ktile[data-k="bestVisit"] b'), /^140$/);
    await page.click('.ktile[data-k="bestVisit"]');
    await page.waitForSelector('.kfiche .klist');
    await page.click('.kfiche .kgo');
    await page.waitForSelector('.lt .c.sel');
    assert.match(page.url(), /#\/partie\/[^/]+\/v1$/);
    assert.match(await page.innerText('.lt .c.sel'), /140/);
    assert.match(await page.innerText('.vdet'), /T20/);

    // Entraînement : un 501 en solo, 135 à la 2e volée, laissé sur « SÉANCE FINIE ».
    await go(page, '#/', '.home2');
    await page.click('.space [data-act="space"][data-arg="e"]');
    await page.waitForSelector('.tile3[href="#/seances"]');
    await go(page, '#/entrainement', '.trhub');
    await page.click('[data-act="tr-mode"][data-arg="jeu"]');
    await page.click('[data-act="tr-game"][data-arg="start|301"]');
    await page.click('[data-act="tr-game"][data-arg="out|single"]');
    await page.click('[data-act="tr-start"][data-arg="x01"]');
    await page.waitForSelector('.game.trgame');
    for (const [k, z] of [['5', 'in'], ['20', 'in'], ['1', 'in'], ['5', 't'], ['20', 't'], ['20', 't'], ['20', 't'], ['20', 't'], ['20', 'in']]) await trKey(page, k, z);
    await page.waitForSelector('.trend');
    await settle(page);

    // Records (Entraînement) : le 135, qui ouvre la séance sur sa volée.
    await go(page, '#/', '.home2');
    await page.click('.tile3[href="#/records/e"]');
    await page.waitForSelector('.kgrid.recs');
    const rec = page.locator('.ktile.rec', { hasText: 'Meilleure volée' });
    assert.match(await rec.innerText(), /140/, 'la meilleure volée de la séance (T20 T20 S20 = 140 à la 3e volée)');
    // La 2e volée (135) est dans la fiche, parmi les meilleures volées.
    await go(page, '#/tableau/e', '.dash .kgrid');
    await page.click('.kfams a:text-is("VOLÉES")');
    await page.click('.ktile[data-k="bestVisit"]');
    await page.waitForSelector('.kfiche .klist');
    const v135 = page.locator('.klist a', { hasText: 'T5 T20 T20' });
    assert.match(await v135.innerText(), /135/);
    await v135.click();
    // La séance (encore ouverte) mène à l'écran de fin ; une fois rangée, le détail s'ouvre sur la volée.
    await go(page, '#/entrainement/fin', '[data-act="tr-finish"]');
    await page.click('[data-act="tr-finish"]');
    await page.waitForSelector('.trhub');
    await go(page, '#/tableau/e/x/volees', '.ktile[data-k="bestVisit"]');
    await page.click('.ktile[data-k="bestVisit"]');
    await page.click('.klist a:has-text("T5 T20 T20")');
    await page.waitForSelector('.tvol li.sel');
    assert.match(page.url(), /#\/entrainement\/seance\/[^/]+\/v2$/);
    assert.match(await page.innerText('.trvsel'), /135/);

    // En ligne (demande de Guillaume) : amis connectés, hors ligne, profils locaux.
    await go(page, '#/enligne', '.online');
    assert.match(await page.innerText('.online'), /AMIS[\s\S]*Aucun ami pour l'instant/i);
    assert.equal(await page.locator('.onplayers a.frmain').count(), 2, 'les deux profils du téléphone');
    // Historique des séances : la séance du jour, qui ouvre son détail.
    await go(page, '#/seances', '.hlist');
    assert.equal(await page.locator('.hlist a.srow').count(), 1);
    assert.match(await page.innerText('.hlist a.srow'), /X01 solo/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
