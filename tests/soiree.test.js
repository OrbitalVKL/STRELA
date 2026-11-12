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
    let announcedMissed = 0; // l'annonce ne dure que 0,8 s : un poste lent peut la manquer, mais pas à chaque fois
    for (let k = 0; k < 8; k++) {
      await newGame(t.page, ['Alpha', 'Bravo', 'Charlie'], { shuffle: true });
      const first = await t.page.locator('.gband .nm').textContent();
      // Lu d'un coup dans la page : l'annonce ne dure que 0,8 s (deux lectures séparées pouvaient la manquer entre les deux).
      const announced = await t.page.evaluate(() => document.querySelector('.announce .nm')?.textContent ?? null);
      await settle(t.page);
      const db = await readDb(t.page);
      const cur = db.current;
      const names = cur.config.players.map(id => db.players.find(p => p.id === id).name);
      assert.deepEqual([...names].sort(), ['Alpha', 'Bravo', 'Charlie']);
      orders.add(names.join());
      assert.equal(db.settings.lastSetup.shuffle, true);
      assert.deepEqual(db.settings.lastSetup.players.map(id => db.players.find(p => p.id === id).name), ['Alpha', 'Bravo', 'Charlie']);
      assert.equal(first, names[0], 'le premier tiré lance');
      if (announced !== null) assert.equal(announced, names[0], '« À TOI » annonce le premier tiré');
      else announcedMissed += 1;
    }
    assert.ok(announcedMissed < 8, '« À TOI » vu au moins une fois');
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
    // Verres (menu pause) : deux pour Bravo, un retiré puis remis ; alcoolémie affichée.
    await page.click('[data-act="pause"]');
    const bravoId = (await readDb(page)).players.find(p => p.name === 'Bravo').id;
    for (let k = 0; k < 3; k++) await page.click(`[data-act="drink-plus"][data-arg="${bravoId}"]`);
    await page.click(`[data-act="drink-minus"][data-arg="${bravoId}"]`);
    assert.equal((await page.locator('.drinks li:has-text("Bravo") .cnt').textContent()).trim(), 'x2', 'verre x2 (lot 7.2)');
    assert.doesNotMatch(await page.locator('.sheet').first().textContent(), /G\/L/, 'plus d’équivalent en alcool (lot 7.2)');
    await page.click('.sheet [data-act="resume"] >> nth=0');
    assert.doesNotMatch(await page.locator('.rest .meta').textContent(), /G\/L/);
    // Rechargement en pleine course aux places : rien de perdu (verres compris).
    await reload(page);
    assert.equal(await page.locator('.gband .nm').textContent(), 'Bravo');
    assert.equal((await readDb(page)).current.drinks[bravoId].length, 2, 'verres enregistrés');
    assert.ok((await readDb(page)).current.drinks[bravoId].every(d => Number.isInteger(d.at)), 'avec leur place dans la partie (lot 7.1)');
    assert.equal((await page.locator('.rest .meta .dk').textContent()).trim(), 'x2', 'verres de Bravo, qui lance');
    await throwDarts(page, '0 0 0');
    await validate(page);
    await throwDarts(page, 'T20 S20 D19'); // Charlie : 118 → 0, 2e ; Bravo reste seul, dernier
    await page.waitForSelector('.tournee');
    assert.match(await page.locator('.tournee .t').textContent(), /LE DERNIER PAIE SA TOURNÉE/);
    assert.equal(await page.locator('.tournee .nm').textContent(), 'Bravo');
    assert.equal((await page.locator('.drinks li:has-text("Bravo") .cnt').textContent()).trim(), 'x2', 'verres en fin de partie');
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
