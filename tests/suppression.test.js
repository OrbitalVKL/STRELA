// Suppression de parties (lot 3, B) et confirmation de LANCER pendant une partie en cours (K), dans la vraie appli
// (base du téléphone ouverte). Détail d'une partie, sélection multiple par appui long (vrais événements tactiles),
// partie en cours supprimée depuis le menu pause ; joueurs (et photos) jamais touchés ; stats recalculées.
// Playwright (sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, readDb, settle, throwDarts, createPlayer, newGame } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const VIEW = { viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' };

async function abandonGame(page) {
  await page.click('[data-act="pause"]');
  await page.click('[data-act="abandon"]');
  await page.click('[data-act="abandon-yes"]');
  await page.waitForSelector('.home-main');
}

test('supprimer des parties : détail, sélection par appui long, partie en cours ; LANCER confirmé', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext(VIEW);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha', { icon: 'renard', color: 2 });
    await createPlayer(page, 'Bravo');
    // 4 parties abandonnées (chacune quelques fléchettes)
    for (const v of ['20', 'T20', '5 5', '1']) {
      await newGame(page, ['Alpha', 'Bravo']);
      await throwDarts(page, v);
      await abandonGame(page);
    }
    await settle(page);
    let db = await readDb(page);
    const players = db.players;
    assert.equal(db.games.length, 4);

    // K : LANCER pendant une partie en cours demande une vraie confirmation.
    await newGame(page, ['Alpha', 'Bravo']);
    await throwDarts(page, '19');
    await page.evaluate(() => { location.hash = '#/nouvelle'; });
    await page.click('[data-act="launch"]');
    assert.match(await page.innerText('.dock'), /ABANDONNER LA PARTIE EN COURS \?/);
    await page.click('[data-act="launch-no"]');
    await settle(page);
    assert.equal((await readDb(page)).current.darts.length, 1, 'NON : la partie en cours continue');
    await page.click('[data-act="launch"]');
    await page.click('[data-act="launch-yes"]');
    await page.waitForSelector('.game');
    await settle(page);
    db = await readDb(page);
    assert.equal(db.games.length, 5, 'ABANDONNER : l’ancienne partie rangée');
    assert.equal(db.games.filter(g => g.abandoned).length, 5);
    assert.equal(db.current.darts.length, 0, 'nouvelle partie lancée');

    // Menu pause : SUPPRIMER LA PARTIE (essai), distinct d'ABANDONNER, confirmé.
    await throwDarts(page, '20 20');
    await page.click('[data-act="pause"]');
    await page.click('[data-act="delete-current"]');
    assert.match(await page.innerText('.sheet'), /SUPPRIMER LA PARTIE \?/);
    await page.click('[data-act="delete-current-yes"]');
    await page.waitForSelector('.home-main');
    await settle(page);
    db = await readDb(page);
    assert.equal(db.current, null, 'partie en cours effacée');
    assert.equal(db.games.length, 5, 'elle n’entre pas dans l’historique');
    assert.equal(await page.locator('a.resume').count(), 0, 'plus de REPRENDRE');

    // Détail : SUPPRIMER CETTE PARTIE, confirmé.
    const first = db.games.sort((a, b) => b.startedAt - a.startedAt)[0].id;
    await page.evaluate(id => { location.hash = `#/partie/${id}`; }, first);
    await page.click('[data-act="del-game"]');
    await page.click('[data-act="del-game-no"]');
    assert.equal(await page.locator('[data-act="del-game-yes"]').count(), 0, 'NON referme la confirmation');
    await page.click('[data-act="del-game"]');
    await page.click('[data-act="del-game-yes"]');
    await page.waitForSelector('.list');
    await settle(page);
    db = await readDb(page);
    assert.equal(db.games.length, 4);
    assert.ok(!db.games.some(g => g.id === first));

    // Liste : un appui court ouvre le détail ; un appui long entre en sélection, sans ouvrir le détail.
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const box = await page.evaluate(() => { const r = document.querySelector('.gitem').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await touch('touchStart', ...box);
    await page.waitForTimeout(800);
    await touch('touchEnd');
    await page.waitForSelector('.gitem.pick');
    assert.equal(await page.evaluate(() => location.hash), '#/historique', 'appui long : on reste sur la liste');
    assert.equal(await page.locator('.gitem.pick[aria-pressed="true"]').count(), 1, 'la partie touchée est cochée');
    await page.click('.gitem.pick >> nth=1');
    await page.click('.gitem.pick >> nth=2');
    assert.match(await page.innerText('.dock'), /SUPPRIMER \(3\)/);
    await page.click('.gitem.pick >> nth=2'); // décochée
    await page.click('[data-act="pick-delete"]');
    assert.match(await page.innerText('.dock'), /SUPPRIMER CES 2 PARTIES \?/);
    await page.click('[data-act="pick-yes"]');
    await settle(page);
    db = await readDb(page);
    assert.equal(db.games.length, 2, 'deux parties supprimées, en une fois');
    assert.equal(await page.locator('.gitem.pick').count(), 0, 'sélection refermée');

    // Joueurs (et avatars) intacts ; stats recalculées sans les parties supprimées.
    assert.deepEqual(db.players, players, 'joueurs et avatars jamais touchés');
    await page.evaluate(() => { location.hash = '#/joueurs'; });
    assert.match(await page.innerText('.list a:has(.nm:text-is("Alpha"))'), /2\sparties/);
    await page.click('.list a:has(.nm:text-is("Alpha"))'); // fiche ouverte : rien ne casse
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
