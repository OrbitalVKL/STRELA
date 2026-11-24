// Lot 10 (étape 4) : parties partagées entre deux téléphones (deux navigateurs) via le faux Supabase. Une partie de
// soirée jouée sur le téléphone de Guillaume avec Mathilde (amie) et Tsia (joueuse locale) apparaît chez Mathilde, à
// son nom, en lecture seule ; une partie sans elle est rangée à part ; hors ligne, l'envoi attend ; une suppression
// par le créateur disparaît chez elle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { pgAvailable } from '../tools/lib/pg.mjs';
import { fakeSupabase } from '../tools/lib/fake-supabase.mjs';
import { openApp, createPlayer, newGame, throwDarts, ack, settle, reload } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const V = { viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' };
const skip = (!pw && 'Playwright absent') || (!pgAvailable() && !process.env.CI && 'Postgres absent');
const sync = page => page.evaluate(() => window.__strelaSyncNow('test'));
const games = page => page.evaluate(() => window.__strelaGames());
const players = page => page.evaluate(() => window.__strelaPlayers());

/** 301 : le premier joueur finit à sa 2e volée, les autres passent (0 0 0). */
async function playQuick(page, names) {
  await newGame(page, names, { startScore: 301 });
  const volley = async n => { await throwDarts(page, n); await ack(page); if (await page.locator('.validate.go').count()) await page.click('.validate.go'); };
  await volley('T20 T20 T20');
  for (let i = 1; i < names.length; i++) await volley('0 0 0');
  await throwDarts(page, 'T20 T11 D14');
  await page.waitForFunction(() => location.hash === '#/fin');
  await ack(page);
  await page.click('[data-act="finish-home"]'); // ACCUEIL : la partie est rangée dans l'historique
  await settle(page);
}

test('parties partagées : soirée visible chez l\'amie, à part sans elle, hors ligne, suppression propagée', { skip, timeout: 240e3 }, async () => {
  const sb = await fakeSupabase();
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  const url = `${srv.url}?cloud=${encodeURIComponent(`${sb.url}|${sb.key}`)}`;
  const phone = async (name, me, locals = []) => {
    const ctx = await browser.newContext(V);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name} : ${e.message}`));
    await openApp(page, url);
    await createPlayer(page, me);
    for (const l of locals) await createPlayer(page, l);
    assert.equal(await sync(page), true);
    return { ctx, page };
  };
  try {
    const A = await phone('A', 'Guillaume', ['Tsia']);
    const B = await phone('B', 'Mathilde');
    // Amitié (B demande, A accepte et ne rattache personne).
    const codeA = await A.page.evaluate(() => window.__strelaCloud().sync.friendCode);
    await B.page.evaluate(c => { location.hash = `#/amis/ajouter/${c}`; }, codeA);
    await B.page.waitForSelector('#frcode');
    await B.page.click('[data-act="fr-send"]');
    await B.page.waitForFunction(() => /Demande envoyée/.test(document.querySelector('.vibe')?.textContent || ''));
    await sync(A.page);
    await A.page.evaluate(() => { location.hash = '#/amis'; });
    await A.page.click('[data-act="fr-answer"][data-arg$=":1"]');
    await A.page.click('[data-act="fr-nomerge"]');
    await sync(B.page);

    // Soirée chez A : Guillaume, Mathilde (amie), Tsia (locale). Fin de partie → envoi.
    await playQuick(A.page, ['Guillaume', 'Mathilde', 'Tsia']);
    assert.equal(await sync(A.page), true);
    assert.equal(await sb.sql(`select count(*) from partie`), '1');
    assert.equal(await sb.sql(`select count(*) from participation where profil is not null`), '2', 'Guillaume et Mathilde liés à leur profil');
    // Chez B : la partie est là, à son nom, créée par A.
    await sync(B.page);
    const gb = await games(B.page);
    assert.equal(gb.games.length, 1);
    const pb = await players(B.page);
    const meB = pb.find(p => p.name === 'Mathilde' && !p.friend && !p.remote).id;
    const friendA = pb.find(p => p.friend).id;
    const tsia = pb.find(p => p.name === 'Tsia');
    assert.ok(tsia && tsia.remote, 'Tsia : joueuse distante chez B');
    assert.deepEqual(gb.games[0].players, [friendA, meB, tsia.id]);
    assert.ok(gb.games[0].owner);
    // Historique de B : la partie y est, en lecture seule.
    await B.page.evaluate(id => { location.hash = `#/partie/${id}`; }, gb.games[0].id);
    await B.page.waitForSelector('.screen');
    assert.match(await B.page.textContent('.screen'), /vient du téléphone de Guillaume/);
    assert.equal(await B.page.$('[data-act="del-game"]'), null);
    // Partie sans Mathilde (Guillaume contre Tsia) : rangée à part chez B, hors de son historique.
    await playQuick(A.page, ['Guillaume', 'Tsia']);
    await sync(A.page);
    await sync(B.page);
    const gb2 = await games(B.page);
    assert.equal(gb2.games.length, 1);
    assert.equal(gb2.friendGames.length, 1);
    // Rechargement de B : tout est gardé, au même endroit.
    await reload(B.page);
    const gb3 = await games(B.page);
    assert.equal(gb3.games.length, 1);
    assert.equal(gb3.friendGames.length, 1);
    // Hors ligne chez A : la partie attend ; le réseau revient : elle part.
    sb.offline = true;
    await playQuick(A.page, ['Mathilde', 'Guillaume']);
    assert.equal(await sync(A.page), false);
    sb.offline = false;
    assert.equal(await sync(A.page), true);
    assert.equal(await sb.sql(`select count(*) from partie`), '3');
    await sync(B.page);
    assert.equal((await games(B.page)).games.length, 2);
    // Rien n'est renvoyé s'il n'a pas changé.
    const before = sb.calls.filter(c => c === 'strela_envoyer').length;
    await sync(A.page);
    assert.equal(sb.calls.filter(c => c === 'strela_envoyer').length, before);
    // A supprime la première partie : elle disparaît chez B.
    const first = gb.games[0].id;
    await A.page.evaluate(id => { location.hash = `#/partie/${id}`; }, first);
    await A.page.click('[data-act="del-game"]');
    await A.page.click('[data-act="del-game-yes"]');
    await settle(A.page);
    await sync(A.page);
    assert.equal(await sb.sql(`select etat from partie where id = '${first}'`), 'supprimee');
    await sync(B.page);
    assert.ok(!(await games(B.page)).games.some(g => g.id === first));
    await settle(A.page); await settle(B.page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    srv.close();
    await sb.close();
  }
});
