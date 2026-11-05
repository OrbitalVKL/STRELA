// Lot 7 dans la vraie appli (Playwright, sauté s'il est absent) : ordre tiré au sort au lancement, joueur en tête,
// célébration d'un nul, jouer jusqu'au bout (le finisseur est sauté, chaque place attend VALIDER), classement et
// tournée du dernier, préférences gardées par REVANCHE, et rien de perdu au rechargement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, throwDarts, validate, createPlayer, newGame, readDb, reload, settle } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

async function setup() {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page, srv.url);
  for (const n of ['Alpha', 'Bravo', 'Charlie']) await createPlayer(page, n);
  return { srv, browser, page, errors, close: async () => { await browser.close(); await srv.close(); } };
}

test('ordre tiré au sort : la partie prend un ordre mélangé, les réglages gardent l’ordre choisi', { skip, timeout: 120e3 }, async () => {
  const t = await setup();
  try {
    const orders = new Set();
    for (let k = 0; k < 8; k++) {
      await newGame(t.page, ['Alpha', 'Bravo', 'Charlie'], { shuffle: true });
      await settle(t.page);
      const db = await readDb(t.page);
      const cur = db.current;
      const names = cur.config.players.map(id => db.players.find(p => p.id === id).name);
      assert.deepEqual([...names].sort(), ['Alpha', 'Bravo', 'Charlie']);
      orders.add(names.join());
      assert.equal(db.settings.lastSetup.shuffle, true);
      assert.deepEqual(db.settings.lastSetup.players.map(id => db.players.find(p => p.id === id).name), ['Alpha', 'Bravo', 'Charlie']);
      assert.ok(await t.page.locator('.announce').count(), '« À TOI » annonce le premier tiré');
    }
    assert.ok(orders.size > 1, `l’ordre change d’une partie à l’autre (${[...orders].join(' / ')})`);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('jouer jusqu’au bout : places, joueur en tête, nul célébré, classement et tournée', { skip, timeout: 120e3 }, async () => {
  const t = await setup();
  const { page } = t;
  try {
    await newGame(page, ['Alpha', 'Bravo', 'Charlie'], { startScore: 301, playOn: true });
    // Tour 1 : Alpha 180 (en tête), Bravo 0 (célébration), Charlie 180.
    await throwDarts(page, 'T20 T20 T20');
    await validate(page);
    assert.equal(await page.locator('.op.lead .nm').first().textContent(), 'Alpha', 'Alpha en tête dans la bande');
    await throwDarts(page, '0 0 0');
    assert.ok(await page.locator('.cele.nul-zero').count(), 'bandeau du zéro');
    await validate(page);
    await throwDarts(page, 'T20 T20 T20');
    await validate(page);
    // Tour 2 : Alpha T20 T11 D14 (121) finit : 1er, la partie continue.
    await throwDarts(page, 'T20 T11 D14');
    assert.equal(page.url().endsWith('#/jeu'), true, 'on reste en jeu');
    assert.match(await page.locator('.gband .legs').textContent(), /1ER/);
    await validate(page);
    assert.equal(await page.locator('.gband .nm').textContent(), 'Bravo', 'Bravo lance');
    assert.match(await page.locator('.op:has(.nm:text-is("Alpha")) .r').textContent(), /1ER/, 'Alpha montre sa place');
    await throwDarts(page, '0 0 0');
    await validate(page);
    await throwDarts(page, 'S1 S1 S1'); // Charlie
    await validate(page);
    assert.equal(await page.locator('.gband .nm').textContent(), 'Bravo', 'Alpha sauté');
    // Rechargement en pleine course aux places : rien de perdu.
    await reload(page);
    assert.equal(await page.locator('.gband .nm').textContent(), 'Bravo');
    await throwDarts(page, '0 0 0');
    await validate(page);
    await throwDarts(page, 'T20 S20 D19'); // Charlie : 118 → 0, 2e ; Bravo reste seul, dernier
    await page.waitForSelector('.tournee');
    assert.match(await page.locator('.tournee .t').textContent(), /LE DERNIER PAIE SA TOURNÉE/);
    assert.equal(await page.locator('.tournee .nm').textContent(), 'Bravo');
    const ranks = await page.locator('.rank-table tbody tr').evaluateAll(rows => rows.map(r => r.querySelector('.pl').textContent.replace(/\s+/g, ' ').trim()));
    assert.deepEqual(ranks, ['1ERAlpha', '2ECharlie', '3EBravo']);
    assert.match(await page.locator('.result-head').textContent(), /Alpha/);
    // REVANCHE garde « jusqu'au bout » et la préférence de tirage.
    await page.click('[data-act="rematch"]');
    await settle(page);
    const db = await readDb(page);
    const cur = db.current;
    assert.equal(cur.config.playOn, true);
    assert.equal(db.settings.lastSetup.shuffle, false);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});
