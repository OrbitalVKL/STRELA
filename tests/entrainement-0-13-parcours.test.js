// Entraînement 0.13.0 dans la vraie appli (Playwright, sauté s'il est absent) :
// - armurerie : couleurs des pièces enregistrées, reprises dans le choix du jeu avant l'entraînement ;
// - jeu changé en pleine séance (menu pause), gardé au rechargement, analyse par jeu ;
// - gestion d'une séance : note, jeu corrigé, mise de côté (hors stats), reprise d'une séance arrêtée ;
// - triple 20 : le T est armé d'office au pavé.
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

test('couleurs, jeu changé en pleine séance, note, mise de côté, reprise', { skip, timeout: 150e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    // Réglage « Simple intérieur / extérieur » activé (désactivé par défaut) : ces parcours vérifient l'anneau du simple.
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.click('[data-act="pad-ring"][data-arg="1"]');
    await createPlayer(page, 'Alpha', { color: 0 });

    // Armurerie : fût doré, empennage bleu sur la torpedo.
    await page.evaluate(() => { location.hash = '#/armurerie/ds-torpedo-22'; });
    await page.waitForSelector('.dsform');
    await page.click('[data-act="ds-color"][data-arg="barrel|or"]');
    await page.click('[data-act="ds-color"][data-arg="flight|bleu"]');
    await page.click('[data-act="ds-color"][data-arg="flight|bleu"]'); // pas de bascule : reste bleu
    assert.equal(await page.locator('#dsfig .col').count(), 2, 'aperçu en couleurs');
    await page.click('[data-act="ds-save"]');
    await page.waitForSelector('.arsenal');
    await settle(page);
    let db = await readDb(page);
    assert.deepEqual(db.dartSets.find(x => x.id === 'ds-torpedo-22').colors, { barrel: 'or', flight: 'bleu' });

    // Choix du jeu avant l'entraînement : chaque jeu avec son dessin, en couleurs.
    await page.evaluate(() => { location.hash = '#/entrainement'; });
    await page.waitForSelector('.trhub');
    assert.equal(await page.locator('.setcards .setc svg.dartd').count(), 2);
    assert.match(await page.getAttribute('[data-act="tr-set"][data-arg="ds-torpedo-22"] .dartd path.col', 'style'), /--dart-or/);
    await page.click('[data-act="tr-set"][data-arg="ds-torpedo-22"]');
    await page.click('.propose + .btn[data-act="tr-start"]'); // groupement
    await page.waitForSelector('.game.train');
    for (const k of ['20', '20', '1']) await key(page, k);

    // Pause → CHANGER DE JEU → fût droit : les 3 premières restent avec la torpedo.
    await page.click('[data-act="tr-pause"]');
    await page.click('[data-act="tr-change-set"]');
    await page.click('[data-act="tr-set-now"][data-arg="ds-droit-22"]');
    await page.waitForSelector('.game.train .pad-k');
    await settle(page);
    let cur = (await readDb(page)).trainings.find(r => r.endedAt === null);
    assert.equal(cur.setId, 'ds-torpedo-22');
    assert.deepEqual(cur.setChanges, [{ at: 3, setId: 'ds-droit-22' }]);
    await reload(page);
    await page.waitForSelector('.game.train');
    for (const k of ['20', '20', '20', '20', '5', '20']) await key(page, k);
    await page.waitForSelector('.trend');
    assert.match(await page.innerText('.trhead span'), /22 g torpedo puis 22 g fût droit/);
    assert.equal(await page.locator('.trend .trtab tbody tr').count(), 2, 'analyse par jeu');
    await page.click('[data-act="tr-finish"]');
    await page.waitForSelector('.trhub');
    await settle(page);
    db = await readDb(page);
    const id = db.trainings[0].id;
    assert.deepEqual(db.trainings[0].setChanges, [{ at: 3, setId: 'ds-droit-22' }]);

    // Détail : note, jeu de la 2e partie corrigé (torpedo : plus de changement), mise de côté.
    await page.evaluate(id => { location.hash = `#/entrainement/seance/${id}`; }, id);
    await page.waitForSelector('.trnote');
    await page.fill('.trnote', 'Nouvelle prise');
    await page.click(`[data-act="tr-det-edit"][data-arg="${id}|set|1"]`);
    await page.click('[data-act="tr-run-set"][data-arg="ds-torpedo-22"]');
    await page.waitForSelector('.detsets li >> nth=0');
    assert.equal(await page.locator('.detsets li').count(), 1, 'un seul jeu pour toute la séance');
    await page.click(`[data-act="tr-exclude"][data-arg="${id}"]`);
    await page.waitForSelector('.excl-tag');
    await settle(page);
    let t = (await readDb(page)).trainings.find(r => r.id === id);
    assert.equal(t.note, 'Nouvelle prise');
    assert.equal(t.setChanges, undefined);
    assert.equal(t.setId, 'ds-torpedo-22');
    assert.equal(t.excluded, true);
    // Hors stats : la seule séance est mise de côté.
    await page.evaluate(() => { location.hash = '#/entrainement/stats'; });
    await page.waitForSelector('.trstats .empty');
    await page.evaluate(id => { location.hash = `#/entrainement/seance/${id}`; }, id);
    await page.click(`[data-act="tr-exclude"][data-arg="${id}"]`); // remise dans les stats
    await settle(page);
    assert.equal((await readDb(page)).trainings.find(r => r.id === id).excluded, undefined);

    // Triple 20 : le T de la cible visée souligné au choix de la zone ; ARRÊTER puis REPRENDRE la séance arrêtée.
    await page.evaluate(() => { location.hash = '#/entrainement'; });
    await page.click('[data-act="tr-fold"]');
    await page.click('[data-act="tr-start"][data-arg="triple20"]');
    await page.waitForSelector('.game.train');
    await page.click('[data-act="tr-key"][data-arg="20"]');
    assert.equal(await page.locator('.key.zk.aimz[data-arg="t"]').count(), 1, 'zone visée soulignée');
    await page.click('[data-act="tr-zonepick"][data-arg="t"]');
    await zone(page, 'in'); await key(page, '20');
    await page.click('[data-act="tr-pause"]');
    await page.click('[data-act="tr-stop"]');
    await page.waitForSelector('[data-act="tr-reopen"]');
    await settle(page);
    t = (await readDb(page)).trainings.find(r => r.exercise === 'triple20');
    assert.deepEqual(t.darts, [{ segment: 20, multiplier: 3 }, { segment: 20, multiplier: 1, ring: 'in' }]);
    assert.equal(t.stopped, true);
    await page.click('[data-act="tr-reopen"]');
    await page.waitForSelector('.game.train');
    await settle(page);
    t = (await readDb(page)).trainings.find(r => r.exercise === 'triple20');
    assert.equal(t.endedAt, null, 'de nouveau en cours');
    assert.equal(t.stopped, undefined);
    assert.equal(t.darts.length, 2);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
