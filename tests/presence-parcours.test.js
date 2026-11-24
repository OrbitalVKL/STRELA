// Lot 10 (étape 6) : présence des amis. Pur (src/net/presence.js › applyPresence, presenceState) puis deux navigateurs
// contre le faux Supabase (Realtime imité : canal privé, presence_state / presence_diff) : en ligne, en partie,
// présence masquée, appli fermée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPresence, presenceState } from '../src/net/presence.js';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { pgAvailable } from '../tools/lib/pg.mjs';
import { fakeSupabase } from '../tools/lib/fake-supabase.mjs';
import { openApp, createPlayer, newGame } from '../tools/lib/app.mjs';

test('présence : état complet, arrivées et départs, plusieurs téléphones d\'un même compte', () => {
  let m = applyPresence({}, { A: { metas: [{ s: 'app', phx_ref: '1' }] }, B: { metas: [] } }, true);
  assert.deepEqual(Object.keys(m), ['A']);
  m = applyPresence(m, { joins: { A: { metas: [{ s: 'jeu', phx_ref: '2' }] } }, leaves: {} });
  assert.equal(presenceState(m.A), 'jeu', 'un des téléphones est en partie');
  m = applyPresence(m, { joins: {}, leaves: { A: { metas: [{ phx_ref: '2' }] } } });
  assert.equal(presenceState(m.A), 'app');
  m = applyPresence(m, { joins: {}, leaves: { A: { metas: [{ phx_ref: '1' }] } } });
  assert.equal(m.A, undefined);
  assert.equal(presenceState(undefined), null);
});

const pw = await loadPlaywright();
const V = { viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' };
const skip = (!pw && 'Playwright absent') || (!pgAvailable() && !process.env.CI && 'Postgres absent');
const sync = page => page.evaluate(() => window.__strelaSyncNow('test'));

test('présence : en ligne, en partie, masquée, appli fermée', { skip, timeout: 180e3 }, async () => {
  const sb = await fakeSupabase();
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  const url = `${srv.url}?cloud=${encodeURIComponent(`${sb.url}|${sb.key}`)}`;
  const phone = async (name, me) => {
    const ctx = await browser.newContext(V);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name} : ${e.message}`));
    await openApp(page, url);
    await createPlayer(page, me);
    assert.equal(await sync(page), true);
    return { ctx, page };
  };
  try {
    const A = await phone('A', 'Guillaume');
    const B = await phone('B', 'Mathilde');
    await createPlayer(A.page, 'Tsia');
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
    // Les deux sont connectés : B voit Guillaume « en ligne », pastille comprise.
    await B.page.evaluate(() => { location.hash = '#/amis'; });
    await B.page.waitForFunction(() => /Guillaume[\s\S]*en ligne/.test(document.querySelector('.frlist')?.textContent || ''), null, { timeout: 10000 });
    assert.ok(await B.page.$('.frlist .pdot.app'));
    // A lance une partie : « en partie ».
    await newGame(A.page, ['Guillaume', 'Tsia'], { startScore: 301 });
    await B.page.waitForFunction(() => /en partie/.test(document.querySelector('.frlist')?.textContent || ''), null, { timeout: 10000 });
    assert.ok(await B.page.$('.frlist .pdot.jeu'));
    // A masque sa présence : B ne la voit plus (dernière activité à la place).
    await A.page.evaluate(() => { location.hash = '#/reglages'; });
    await A.page.click('[data-act="acc-presence"][data-arg="0"]');
    await B.page.waitForFunction(() => /vu /.test(document.querySelector('.frlist')?.textContent || ''), null, { timeout: 10000 });
    assert.equal(await B.page.$('.frlist .pdot'), null);
    // A la remontre, puis ferme l'appli : B ne la voit plus.
    await A.page.click('[data-act="acc-presence"][data-arg="1"]');
    await B.page.waitForSelector('.frlist .pdot', { timeout: 10000 });
    await A.ctx.close();
    await B.page.waitForFunction(() => !document.querySelector('.frlist .pdot'), null, { timeout: 10000 });
    assert.deepEqual(Object.keys(sb.presence()).length, 1, 'seule Mathilde reste');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    srv.close();
    await sb.close();
  }
});
