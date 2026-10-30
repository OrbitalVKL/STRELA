// Annonces vocales, sons et célébrations (lot 3, F, G, H) dans la vraie appli : synthèse vocale simulée (on relève
// ce qui est dit et les coupures), sons relevés par l'appli. Total de chaque volée, « Cent quatre-vingts ! » appuyé,
// bust, « PSEUDO, il reste … » quand le joueur commence son tour avec une finition jouable, « Partie, PSEUDO ! » ;
// bandeau gradué ; réglages Sons et Annonces vocales. Playwright (sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, throwDarts, validate, createPlayer, newGame } from '../tools/lib/app.mjs';
import { SPEECH } from '../src/ui/feedback.js';

const pw = await loadPlaywright();

test('textes des annonces', () => {
  assert.equal(SPEECH.total(140), '140');
  assert.equal(SPEECH.total(180), 'Cent quatre-vingts !');
  assert.equal(SPEECH.checkout('Jean-Luc', 40), 'Jean-Luc, il reste 40');
  assert.equal(SPEECH.leg('Mathilde'), 'Manche, Mathilde !');
  assert.equal(SPEECH.match('Mathilde'), 'Partie, Mathilde !');
});

test('voix, sons et bandeaux pendant une partie ; réglages respectés', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      window.__speech = [];
      const synth = {
        speak(u) { window.__speech.push({ text: u.text, lang: u.lang, rate: u.rate, pitch: u.pitch }); },
        cancel() { window.__speech.push('cancel'); },
        getVoices: () => [{ name: 'Voix française', lang: 'fr-FR', localService: true }],
        addEventListener() {},
      };
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
      if (typeof window.SpeechSynthesisUtterance !== 'function') {
        window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) { this.text = text; };
      }
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha');
    await createPlayer(page, 'Bravo');
    await newGame(page, ['Alpha', 'Bravo'], { startScore: 301 });
    const said = async () => { await page.waitForTimeout(30); return page.evaluate(() => window.__speech.filter(x => x !== 'cancel').map(x => x.text)); };
    const sounds = () => page.evaluate(() => window.__strelaFeedback().sounds);

    await throwDarts(page, 'T20');
    assert.deepEqual(await sounds(), ['triple'], 'clic de triple');
    assert.deepEqual(await said(), [], 'rien de dit en milieu de volée');
    await throwDarts(page, 'T20 T20');
    assert.deepEqual(await said(), ['Cent quatre-vingts !']);
    const strong = await page.evaluate(() => window.__speech.at(-1));
    assert.ok(strong.pitch > 1 && strong.rate < 1, '180 appuyé');
    assert.equal(strong.lang, 'fr-FR');
    assert.equal((await sounds()).at(-1), 'max');
    assert.ok(await page.locator('.cele.max').count(), 'bandeau 180');
    await page.click('[data-key="undo"]'); // un appui ferme le bandeau (et ANNULER agit quand même)
    assert.equal(await page.locator('.cele').count(), 0, 'bandeau fermé par l’appui');
    await throwDarts(page, 'T20');
    await validate(page);
    assert.equal((await sounds()).at(-1), 'validate');
    assert.equal((await said()).length, 2, 'Bravo à 301 : pas de finition, rien à annoncer');

    await throwDarts(page, '20 D20 0');
    assert.equal((await said()).at(-1), '60');
    assert.deepEqual((await sounds()).slice(-3), ['single', 'double', 'miss']);
    await validate(page);
    assert.equal((await said()).at(-1), 'Alpha, il reste 121', 'Alpha commence son tour avec une finition jouable');
    const before = await page.evaluate(() => window.__speech.length);
    await throwDarts(page, 'T20 T20'); // 121 → 61 → 1 : bust
    assert.equal((await said()).at(-1), 'Bust');
    assert.equal((await sounds()).at(-1), 'bust');
    assert.equal(await page.evaluate(n => window.__speech[n], before), 'cancel', 'une nouvelle annonce coupe l’ancienne');
    await validate(page);
    await throwDarts(page, '20 20 S1'); // Bravo : 241 → 200
    await validate(page);
    await throwDarts(page, 'T20 S20 S20'); // Alpha 121 → 21 : 100 tout juste, bandeau discret
    assert.ok(await page.locator('.cele.ton').count(), 'bandeau 100+');
    assert.equal((await said()).at(-1), '100');
    await validate(page);
    await throwDarts(page, '0 0 0');
    await validate(page);
    assert.equal((await said()).at(-1), 'Alpha, il reste 21');
    await throwDarts(page, 'S1 D10');
    await page.waitForSelector('[data-act="rematch"]');
    assert.equal((await said()).at(-1), 'Partie, Alpha !');
    assert.equal((await sounds()).at(-1), 'finish');
    assert.ok(await page.locator('.cele.finish').count(), 'bandeau de finition');

    // Réglages : Sons et Annonces vocales sur NON → silence.
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.click('[data-act="voice"][data-arg="0"]');
    await page.click('[data-act="sound"][data-arg="0"]');
    const n = { said: (await said()).length, sounds: (await sounds()).length };
    await page.evaluate(() => { location.hash = '#/fin'; });
    await page.click('[data-act="rematch"]');
    await page.waitForSelector('.game');
    await throwDarts(page, 'T20 T20 T20');
    assert.equal((await said()).length, n.said, 'voix coupée');
    assert.equal((await sounds()).length, n.sounds, 'sons coupés');
    assert.match(await page.evaluate(() => JSON.stringify(localStorage)), /strela\.voice":"0"/);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
