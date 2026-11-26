// 0.25.1 : une partie (ou une séance) compte et part dès sa dernière fléchette, sans attendre ACCUEIL, REVANCHE ou
// TERMINER. Cas vu le 26/11 (journal du téléphone de Patrick) : un 501 en solo à l'entraînement avec une volée de 135,
// laissé sur l'écran « SÉANCE FINIE » ; la séance n'était ni dans ses stats ni chez ses amis.
// Vraie appli contre le faux Supabase : partie X01 finie et laissée sur l'écran de fin (stats, envoi, rechargement,
// ANNULER, ACCUEIL sans renvoi) ; séance X01 solo finie sans TERMINER (stats, rechargement, TERMINER sans renvoi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { pgAvailable } from '../tools/lib/pg.mjs';
import { fakeSupabase } from '../tools/lib/fake-supabase.mjs';
import { openApp, createPlayer, settle, readDb, reload, newGame, throwDarts, validate, ack } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = (!pw && 'Playwright absent') || (!pgAvailable() && !process.env.CI && 'Postgres absent');
const sync = page => page.evaluate(() => window.__strelaSyncNow('test'));
const sent = page => page.evaluate(() => ({ ...(window.__strelaCloud().sync.sent || {}) }));
const go = async (page, hash, sel) => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForSelector(sel); };
/** Meilleure volée du résumé du profil (vide si le joueur n'a aucune partie). */
const bestVisit = page => page.evaluate(() => document.querySelector('[data-k="bestVisit"] b')?.textContent.trim() || '');

// Saisie au pavé de l'entraînement : le nombre puis sa zone (T : triple, in : simple intérieur).
async function trKey(page, k, z = 'in') {
  await page.click(`[data-act="tr-key"][data-arg="${k}"]`);
  const n = Number(k);
  if (n >= 1 && n <= 20) await page.click(`[data-act="tr-zonepick"][data-arg="${z}"]`);
}

test('fin de partie : comptée et envoyée dès la dernière fléchette, même laissée sur l\'écran de fin', { skip, timeout: 180e3 }, async () => {
  const sb = await fakeSupabase();
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, `${srv.url}?cloud=${encodeURIComponent(`${sb.url}|${sb.key}`)}`);
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.click('[data-act="pad-ring"][data-arg="1"]');
    await createPlayer(page, 'Patrick');
    assert.equal(await sync(page), true);
    const me = (await page.evaluate(() => window.__strelaPlayers())).find(p => p.name === 'Patrick');

    // 1. Partie X01 (301, sortie double) finie, laissée sur l'écran de fin.
    await newGame(page, ['Patrick'], { startScore: 301 });
    await throwDarts(page, 'T20 T20 T5');
    await validate(page);
    await throwDarts(page, 'S20 S20 S20'); // reste 106
    await validate(page);
    await throwDarts(page, 'T20 S6 D20'); // 60 + 6 + 40 = 106 : partie gagnée
    await page.waitForSelector('[data-act="undo-end"]');
    await ack(page);
    assert.equal(await page.evaluate(() => location.hash), '#/fin');
    await settle(page);
    let db = await readDb(page);
    const cur = db.current;
    assert.ok(cur && Number.isFinite(cur.finishedAt), 'instant de la fin gardé dans la base');
    const gid = cur.id;

    // Stats : la partie compte déjà (profil ouvert depuis l'écran de fin, sans passer par ACCUEIL).
    await go(page, `#/joueur/${me.id}`, '.ptabs');
    assert.equal(await bestVisit(page), '135', 'meilleure volée de la partie restée ouverte');
    // Envoi : la synchronisation est partie d'elle-même à la dernière fléchette.
    await page.waitForFunction(id => !!(window.__strelaCloud().sync.sent || {})[id], gid, { timeout: 10e3 });
    assert.equal(await sb.sql(`select etat from partie where id = '${gid}'`), 'terminee');
    const fp1 = (await sent(page))[gid];

    // Rechargement sur l'écran de fin : rien n'est renvoyé (même instant de fin, même empreinte).
    await reload(page);
    assert.equal(await sync(page), true);
    assert.equal((await sent(page))[gid], fp1, 'pas de renvoi après un rechargement');

    // ANNULER LA DERNIÈRE FLÉCHETTE sur l'écran de fin : la partie ne compte plus.
    await go(page, '#/fin', '[data-act="undo-end"]');
    await page.click('[data-act="undo-end"]');
    await page.waitForSelector('.game');
    await settle(page);
    db = await readDb(page);
    assert.equal(db.current.finishedAt, undefined, 'instant de fin effacé par ANNULER');
    await go(page, `#/joueur/${me.id}`, '.ptabs');
    assert.equal(await bestVisit(page), '', 'la partie rouverte ne compte plus');

    // Finie de nouveau puis ACCUEIL : rangée avec l'instant de sa fin, envoyée une fois.
    await go(page, '#/jeu', '.game');
    await throwDarts(page, 'D20');
    await page.waitForSelector('[data-act="undo-end"]');
    await ack(page);
    await settle(page);
    const fin = (await readDb(page)).current.finishedAt;
    await page.waitForFunction(([id, fp]) => { const s = window.__strelaCloud().sync.sent || {}; return s[id] && s[id] !== fp; }, [gid, fp1], { timeout: 10e3 });
    const fp2 = (await sent(page))[gid];
    await page.click('[data-act="finish-home"]');
    await page.waitForSelector('.home2');
    await settle(page);
    db = await readDb(page);
    assert.equal(db.games.find(g => g.id === gid).endedAt, fin, 'rangée avec l\'instant de sa dernière fléchette');
    assert.equal(await sync(page), true);
    assert.equal((await sent(page))[gid], fp2, 'pas de renvoi en la rangeant');

    // 2. Séance X01 solo (301, sortie simple) finie sans TERMINER : le cas de Patrick.
    await go(page, '#/entrainement', '.trhub');
    await page.click('[data-act="tr-mode"][data-arg="jeu"]');
    await page.click('[data-act="tr-game"][data-arg="start|301"]');
    await page.click('[data-act="tr-game"][data-arg="out|single"]');
    await page.click('[data-act="tr-start"][data-arg="x01"]');
    await page.waitForSelector('.game.trgame');
    for (const [k, z] of [['5', 'in'], ['20', 'in'], ['1', 'in'], ['5', 't'], ['20', 't'], ['20', 't']]) await trKey(page, k, z); // 26, puis 135
    for (const [k, z] of [['20', 't'], ['20', 't'], ['20', 'in']]) await trKey(page, k, z); // 140 : reste 0
    await page.waitForSelector('.trend');
    await settle(page);
    db = await readDb(page);
    const tr = db.trainings.find(r => r.exercise === 'x01');
    assert.ok(tr.endedAt === null && Number.isFinite(tr.finishedAt), 'séance ouverte, instant de fin gardé');
    await page.waitForFunction(id => !!(window.__strelaCloud().sync.sent || {})[id], tr.id, { timeout: 10e3 });
    const fpt = (await sent(page))[tr.id];
    await reload(page);
    await go(page, `#/joueur/${me.id}/entrainement`, '.trl > li.tcard');
    assert.equal(await page.locator('.trl > li.tcard').count(), 1, 'la séance compte dans ses stats sans TERMINER');
    await go(page, '#/entrainement/fin', '[data-act="tr-finish"]');
    await page.click('[data-act="tr-finish"]');
    await page.waitForSelector('.trhub');
    await settle(page);
    db = await readDb(page);
    assert.equal(db.trainings.find(r => r.id === tr.id).endedAt, tr.finishedAt, 'TERMINER garde l\'instant de la fin');
    assert.equal(await sync(page), true);
    assert.equal((await sent(page))[tr.id], fpt, 'pas de renvoi en terminant');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
    await sb.close();
  }
});
