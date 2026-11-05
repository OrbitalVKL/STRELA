// Voyelles qui tombent (lot 7) : quand Tsia lance, les voyelles de l'écran de jeu tombent et restent absentes jusqu'à
// la fin de sa volée (VALIDER) ; elles reviennent pour le joueur suivant ; les chiffres ne bougent jamais.
// Fonctions pures, puis la vraie appli (Playwright, sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTsia, isVowel, withoutVowels, splitVowels } from '../src/ui/vowels.js';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, throwDarts, validate, createPlayer, newGame } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();

test('pseudo Tsia reconnu sans tenir compte de la casse, des accents ni des espaces', () => {
  for (const n of ['Tsia', 'TSIA', ' tsia ', 'Tsïa']) assert.ok(isTsia(n), n);
  for (const n of ['Tsiak', 'Ts ia', 'Sacha', '', null, undefined]) assert.ok(!isTsia(n), String(n));
});

test('voyelles retirées, chiffres et consonnes gardés', () => {
  assert.equal(withoutVowels('FLÉCHETTE 2/3'), 'FLCHTT 2/3');
  assert.equal(withoutVowels('ANNULER · RATÉ'), 'NNLR · RT');
  assert.equal(withoutVowels('Yaël, il reste 140'), 'l, l rst 140');
  assert.equal(withoutVowels('Œuf'), 'f');
  for (const c of 'aeiouyAEIOUYéÉèêàùîôœ') assert.ok(isVowel(c), c);
  for (const c of 'bcdTSZ0129 ·/') assert.ok(!isVowel(c), c);
  assert.deepEqual(splitVowels('TSIA'), [{ text: 'TS', vowel: false }, { text: 'I', vowel: true }, { text: 'A', vowel: true }]);
});

test('vraie appli : les voyelles tombent pendant la volée de Tsia, reviennent après', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha');
    await createPlayer(page, 'Tsia');
    await newGame(page, ['Alpha', 'Tsia'], { startScore: 301, shuffle: false });
    // Texte visible de l'écran de jeu (voyelles retirées comprises).
    const shownText = () => page.evaluate(() => {
      const app = document.getElementById('app');
      const clone = app.querySelector('.gband').cloneNode(true);
      clone.querySelectorAll('.vgone').forEach(e => e.remove());
      return clone.textContent.replace(/\s+/g, ' ').trim();
    });
    const vowelSpans = () => page.locator('#app .vw').count();

    assert.equal(await vowelSpans(), 0, 'Alpha lance : aucune voyelle touchée');
    await throwDarts(page, 'T20 S20 S5');
    await validate(page);
    // Tsia lance : les voyelles tombent (doubles dans le calque #vfall), puis disparaissent de l'écran.
    assert.ok(await vowelSpans() > 10, 'voyelles repérées sur tout l’écran');
    assert.ok(await page.locator('#vfall .vf').count() > 0, 'voyelles en chute');
    await page.waitForFunction(() => !document.querySelector('#app .vw:not(.vgone)'), null, { timeout: 5000 });
    const band = await shownText();
    assert.ok(band.startsWith('TS'), `pseudo sans voyelles : ${band}`);
    assert.ok(!/[AEIOUY]/i.test(band), `bandeau sans voyelles : ${band}`);
    assert.match(await page.locator('#remaining').first().textContent(), /301/, 'le reste ne bouge pas');

    // Fléchette suivante : l'écran est redessiné, les voyelles sont absentes d'emblée (pas de nouvelle chute).
    await page.waitForFunction(() => !document.querySelector('#vfall .vf'), null, { timeout: 5000 });
    await throwDarts(page, 'S20');
    assert.ok(await vowelSpans() > 0);
    assert.equal(await page.locator('#app .vw:not(.vgone)').count(), 0, 'retirées d’emblée');
    assert.equal(await page.locator('#vfall .vf').count(), 0, 'pas de nouvelle chute');
    await throwDarts(page, 'S20 S20');
    assert.equal(await page.locator('#app .vw:not(.vgone)').count(), 0, 'volée en attente : toujours sans voyelles');

    // VALIDER : au tour d'Alpha, les voyelles reviennent.
    await validate(page);
    assert.equal(await vowelSpans(), 0, 'voyelles revenues');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
