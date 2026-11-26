// Lot 9.6 B : stats contextuelles à l'écran (maquette) — chaque mode a ses chiffres, un résumé en clair en tête.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { show } from '../tools/lib/layout.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

test('stats contextuelles : X01 solo, exercice à cible, multijoueur', { skip, timeout: 90e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${srv.url}?maquette#/sommaire`);
    await page.waitForFunction(() => window.__strela);
    const text = async scene => { await show(page, { scene }); return page.innerText('#app'); };

    // X01 en solo : fiche Évolution (flèches, résumé en clair, paliers), pas de précision ni de dérive.
    let t = await text('tr-seance-x01');
    assert.match(t, /ÉVOLUTION/);
    assert.ok(await page.locator('.evl li[data-k="avg"] .evd').count(), 'moyenne comparée');
    assert.match(t, /moins de 20[\s\S]*20 à 39[\s\S]*40 à 59[\s\S]*60 et plus/);
    assert.doesNotMatch(t, /DÉRIVE|Précision · écart/);
    assert.match(t, /MOYENNE DES 9 PREMIÈRES FLÉCHETTES/);
    // Stats du X01 en solo : résumé, Évolution sur la période, courbe d'un chiffre de la fiche.
    t = await text('v96-stats-x01-busts');
    assert.ok(await page.locator('.evsum').count(), 'résumé en clair');
    assert.match(t, /ÉVOLUTION · X01 EN SOLO/);
    assert.equal(await page.getAttribute('[data-act="ts-metric"][data-arg="ev_busts"]', 'aria-pressed'), 'true');
    // Exercice à cible : comparé, par secteur, dérive ; pas de stats X01.
    t = await text('v96-cible-comparee');
    assert.match(t, /COMPARÉ AUX SÉANCES PRÉCÉDENTES/);
    assert.match(t, /DÉRIVE/);
    assert.match(t, /Hors cible : /);
    assert.doesNotMatch(t, /ÉVOLUTION|Busts/);
    // Multijoueur : résumé, forme du soir, face à mes amis.
    t = await text('v96-profil-face');
    assert.ok(await page.locator('.evsum').count());
    assert.match(t, /FORME DU SOIR/);
    assert.match(t, /FACE À MES AMIS/);
    assert.equal(await page.locator('.vstab thead th').count(), 3, 'moi et un ami');
    t = await text('v78-soiree-dash-tout');
    assert.match(t, /forme [▲▼=]/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
