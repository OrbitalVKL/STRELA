// Lot 10 (étape 3) : rattachement des joueurs locaux, deux navigateurs (deux téléphones) contre le faux Supabase.
// A avait Mathilde en joueur locale (avec une partie) ; B (Mathilde) avait Guillaume. À l'acceptation, A rattache son
// joueur local (pseudo identique proposé), annule, recommence ; B reçoit la proposition symétrique.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { pgAvailable } from '../tools/lib/pg.mjs';
import { fakeSupabase } from '../tools/lib/fake-supabase.mjs';
import { openApp, createPlayer, newGame, readDb, settle } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const V = { viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' };
const skip = (!pw && 'Playwright absent') || (!pgAvailable() && !process.env.CI && 'Postgres absent');
const sync = page => page.evaluate(() => window.__strelaSyncNow('test'));
const players = page => page.evaluate(() => window.__strelaPlayers());

test('rattachement : joueur local fusionné dans l\'ami, annulé, refait ; proposition symétrique', { skip, timeout: 180e3 }, async () => {
  const sb = await fakeSupabase();
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  const url = `${srv.url}?cloud=${encodeURIComponent(`${sb.url}|${sb.key}`)}`;
  const phone = async (name, me, local) => {
    const ctx = await browser.newContext(V);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name} : ${e.message}`));
    await openApp(page, url);
    await createPlayer(page, me);
    await createPlayer(page, local);
    await createPlayer(page, 'Gilles');
    assert.equal(await sync(page), true);
    return { ctx, page };
  };
  try {
    const A = await phone('A', 'Guillaume', 'Mathilde');
    const B = await phone('B', 'Mathilde', 'Guillaume');
    await newGame(A.page, ['Guillaume', 'Mathilde'], { startScore: 301 });
    const localM = (await players(A.page)).find(p => p.name === 'Mathilde').id;
    const codeA = await A.page.evaluate(() => window.__strelaCloud().sync.friendCode);
    // B demande, A accepte : la question arrive tout de suite, Mathilde (pseudo identique) en tête.
    await B.page.evaluate(c => { location.hash = `#/amis/ajouter/${c}`; }, codeA);
    await B.page.waitForSelector('#frcode');
    await B.page.click('[data-act="fr-send"]');
    await B.page.waitForFunction(() => /Demande envoyée/.test(document.querySelector('.vibe')?.textContent || ''));
    await sync(A.page);
    await A.page.evaluate(() => { location.hash = '#/amis'; });
    await A.page.click('[data-act="fr-answer"][data-arg$=":1"]');
    await A.page.waitForSelector('.frpick');
    assert.match(A.page.url(), /#\/amis\/rattacher\/[0-9a-f-]{36}$/);
    const uuidB = A.page.url().split('/').pop();
    assert.match(await A.page.textContent('.friends'), /Pseudo proche[\s\S]*Mathilde[\s\S]*1\spartie[\s\S]*Joueurs du téléphone|Pseudo proche[\s\S]*Mathilde/);
    const sugg = await A.page.$$eval('.frlist', ls => ls[0].textContent);
    assert.match(sugg, /Mathilde/);
    assert.doesNotMatch(sugg, /Gilles|Guillaume/);
    await A.page.click(`[data-act="fr-pick"][data-arg="${localM}"]`);
    await A.page.click('[data-act="fr-merge"]');
    await A.page.waitForSelector('[data-act="fr-unmerge"]');
    let pa = await players(A.page);
    assert.equal(pa.filter(p => p.name === 'Mathilde').length, 1);
    assert.deepEqual(pa.find(p => p.id === localM).friend, uuidB, 'le joueur local garde son identifiant et devient l\'ami');
    assert.ok(!pa.some(p => p.id.startsWith('u:')));
    await settle(A.page);
    let db = await readDb(A.page);
    assert.ok(db.current.config.players.includes(localM), 'la partie reste à son identifiant');
    // Annuler : de nouveau deux joueurs, la question revient.
    await A.page.click('[data-act="fr-unmerge"]');
    await A.page.waitForFunction(() => /Fusion annulée/.test(document.querySelector('.vibe')?.textContent || ''));
    pa = await players(A.page);
    assert.equal(pa.find(p => p.id === localM).friend, null);
    assert.ok(pa.some(p => p.id === `u:${uuidB}` && p.friend === uuidB));
    await A.page.evaluate(() => { location.hash = '#/joueurs'; });
    await A.page.waitForSelector('.frmerge');
    assert.match(await A.page.textContent('.frmerge'), /Rattacher Mathilde/);
    // Refaire la fusion depuis le bandeau.
    await A.page.click('.frmerge a');
    await A.page.click(`[data-act="fr-pick"][data-arg="${localM}"]`);
    await A.page.click('[data-act="fr-merge"]');
    await A.page.waitForSelector('[data-act="fr-unmerge"]');
    assert.equal((await players(A.page)).find(p => p.id === localM).friend, uuidB);
    // Côté B : même proposition pour son joueur local Guillaume ; « aucun » est aussi possible.
    await sync(B.page);
    await B.page.evaluate(() => { location.hash = '#/amis'; });
    await B.page.waitForSelector('.frmerge');
    assert.match(await B.page.textContent('.frmerge'), /Rattacher Guillaume/);
    await B.page.click('.frmerge a');
    await B.page.waitForSelector('[data-act="fr-nomerge"]');
    await B.page.click('[data-act="fr-nomerge"]');
    await B.page.waitForFunction(() => /aucun joueur local/.test(document.querySelector('.vibe')?.textContent || ''));
    assert.equal(await B.page.$('.frmerge'), null);
    assert.equal((await players(B.page)).filter(p => p.friend).length, 1);
    await settle(A.page); await settle(B.page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    srv.close();
    await sb.close();
  }
});
