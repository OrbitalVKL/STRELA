// Saisies parasites (lot 3, A) : une touche n'agit qu'au relâcher, si le doigt n'a pas glissé de plus de 10 px et
// qu'aucun pointercancel n'est arrivé (Android en envoie un quand il prend le geste « remonter du bas de l'écran »).
// Vrais événements tactiles (Chromium, protocole CDP) sur le pavé, VALIDER et la cible en paysage. Playwright (sauté
// s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { show } from '../tools/lib/layout.mjs';

const pw = await loadPlaywright();

async function touchPage(browser, url, viewport) {
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${url}?maquette#/sommaire`);
  await page.waitForFunction(() => window.__strela);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }] });
  const center = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const darts = () => page.evaluate(() => window.__strela.darts().length);
  return { ctx, page, touch, center, darts };
}

test('pavé et VALIDER : rien au pointercancel ni au glissé, saisie au relâcher sinon', { skip: !pw && 'Playwright absent', timeout: 60e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const { ctx, page, touch, center, darts } = await touchPage(browser, srv.url, { width: 410, height: 914 });
    await show(page, { scene: 'jeu' });
    const [x, y] = await center('[data-key="20"]');

    // Appui puis geste système (Android envoie pointercancel) : rien.
    await touch('touchStart', x, y);
    assert.ok(await page.evaluate(() => document.querySelector('[data-key="20"]').classList.contains('hit')), 'retour visuel dès l’appui');
    assert.equal(await darts(), 0, 'rien n’est saisi à l’appui');
    await touch('touchCancel');
    assert.equal(await darts(), 0, 'appui puis pointercancel : rien');
    assert.ok(!(await page.evaluate(() => document.querySelector('[data-key="20"]').classList.contains('hit'))), 'retour visuel retiré');

    // Appui puis glissé vers le haut : rien.
    await touch('touchStart', x, y);
    for (let k = 1; k <= 5; k++) await touch('touchMove', x, y - k * 12);
    await touch('touchEnd');
    assert.equal(await darts(), 0, 'appui puis glissé vers le haut : rien');

    // Appui-relâcher normal (un doigt bouge toujours un peu) : la fléchette part au relâcher.
    await touch('touchStart', x, y);
    await touch('touchMove', x + 3, y - 4);
    await touch('touchEnd');
    assert.equal(await darts(), 1, 'appui-relâcher : une fléchette');

    // Le 0 (RATÉ) et ANNULER, en bas de l'écran : même règle.
    const [zx, zy] = await center('[data-key="0"]');
    await touch('touchStart', zx, zy);
    await touch('touchCancel');
    assert.equal(await darts(), 1, '0 puis pointercancel : rien');
    const [ux, uy] = await center('[data-key="undo"]');
    await touch('touchStart', ux, uy);
    for (let k = 1; k <= 4; k++) await touch('touchMove', ux, uy - k * 15);
    await touch('touchEnd');
    assert.equal(await darts(), 1, 'ANNULER puis glissé : rien n’est retiré');

    // VALIDER : pointercancel ne valide pas, un appui-relâcher valide.
    await show(page, { scene: 'volee' });
    const pending = () => page.evaluate(() => !!document.querySelector('.validate.go'));
    const [vx, vy] = await center('.validate.go');
    await touch('touchStart', vx, vy);
    await touch('touchCancel');
    assert.ok(await pending(), 'VALIDER puis pointercancel : la volée attend toujours');
    await touch('touchStart', vx, vy);
    await touch('touchEnd');
    assert.ok(!(await pending()), 'VALIDER au relâcher');
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});

test('paysage : un geste système pendant la saisie sur la cible ne compte rien', { skip: !pw && 'Playwright absent', timeout: 60e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const { ctx, page, touch, center, darts } = await touchPage(browser, srv.url, { width: 914, height: 410 });
    await show(page, { scene: 'jeu' });
    const [x, y] = await center('#tboard svg');
    await touch('touchStart', x, y - 60);
    await touch('touchMove', x, y - 50);
    assert.ok(await page.evaluate(() => !document.getElementById('loupe').hidden), 'loupe affichée');
    await touch('touchCancel');
    assert.equal(await darts(), 0, 'pointercancel : rien');
    assert.ok(await page.evaluate(() => document.getElementById('loupe').hidden), 'loupe retirée');
    await touch('touchStart', x, y - 60);
    await touch('touchEnd');
    assert.equal(await darts(), 1, 'appui-relâcher : une fléchette');
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
