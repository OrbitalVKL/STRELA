// Version 0.8.2 (Playwright, sauté s'il est absent) : rien ne se remet à zéro pendant la navigation.
// - Stats : en changeant d'indicateur, la rangée des indicateurs, la courbe et la page gardent leur position ; en
//   changeant de joueur aussi (même écran) ; la courbe d'un autre joueur repart à droite.
// - Retour : une partie ouverte depuis les stats, puis retour : la page reprend où elle était.
// - Aucun lien n'a le bleu souligné du navigateur (tableau de bord d'une soirée).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { show } from '../tools/lib/layout.mjs';

const pw = await loadPlaywright();

test('défilements gardés d’un rendu à l’autre et au retour ; liens sans bleu', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 410, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${srv.url}?maquette#/sommaire`);
    await page.waitForFunction(() => window.__strela);
    await show(page, { scene: 'v78-stats-zoom' }); // courbe zoomée ×4 : elle défile
    await page.waitForSelector('.chscroll');
    const pos = () => page.evaluate(() => ({
      y: Math.round(window.scrollY),
      chips: Math.round(document.querySelector('.chips2').scrollLeft),
      chart: Math.round(document.querySelector('.chscroll').scrollLeft),
      chartMax: document.querySelector('.chscroll').scrollWidth - document.querySelector('.chscroll').clientWidth,
    }));
    let p = await pos();
    assert.ok(p.chartMax > 100, 'la courbe zoomée défile');
    assert.equal(p.chart, p.chartMax, 'première fois : calée à droite');
    // On fait défiler la page, la rangée d'indicateurs et la courbe, puis on change d'indicateur (le dernier de la rangée).
    await page.evaluate(() => {
      const chips = document.querySelector('.chips2');
      chips.scrollLeft = chips.scrollWidth;
      document.querySelector('.chscroll').scrollLeft = 120;
      window.scrollTo(0, document.querySelector('.chips2').getBoundingClientRect().top + window.scrollY - 80);
    });
    const before = await pos();
    assert.ok(before.chips > 40, 'la rangée des indicateurs défile');
    await page.click('.chips2 button >> nth=-1');
    p = await pos();
    assert.equal(p.chips, before.chips, 'rangée des indicateurs : même position');
    assert.equal(p.y, before.y, 'page : même position');
    assert.equal(p.chart, 120, 'courbe : même position');
    // Zoom : la courbe garde le même endroit au centre (elle ne repart ni à gauche ni à droite).
    await page.click('[data-act="v2-zoom"][data-arg="in"]');
    p = await pos();
    assert.ok(p.chart > 120 && p.chart < p.chartMax, `courbe recentrée après le zoom (${p.chart} / ${p.chartMax})`);
    assert.equal(p.y, before.y);
    // Autre joueur : même écran, la page ne remonte pas ; sa courbe à lui repart à droite.
    await page.evaluate(() => document.querySelectorAll('.chips a')[1].click()); // sans faire défiler la page jusqu'à la pastille
    await page.waitForFunction(() => document.querySelector('.chscroll')?.dataset.hscroll === 'courbe:p2');
    p = await pos();
    assert.equal(p.y, before.y, 'autre joueur : la page ne remonte pas');
    assert.equal(p.chart, p.chartMax, 'courbe d’un autre joueur : calée à droite');
    // Une partie ouverte depuis la courbe, puis retour : la page reprend où elle était.
    await page.click('[data-act="v2-fold"][data-arg="worst"]');
    await page.evaluate(() => document.querySelector('.worst a').scrollIntoView({ block: 'center' }));
    const y0 = (await pos()).y;
    assert.ok(y0 > 300);
    await page.evaluate(() => document.querySelector('.worst a').click());
    await page.waitForSelector('.score-table');
    assert.equal(await page.evaluate(() => Math.round(window.scrollY)), 0, 'écran nouveau : en haut');
    await page.click('header.top a.back');
    await page.waitForSelector('.stats2');
    assert.equal((await pos()).y, y0, 'retour : la page reprend où elle était');

    // Liens : jamais le bleu du navigateur.
    await show(page, { scene: 'v78-soiree-dash' });
    await page.waitForSelector('.dash2');
    const colors = await page.$$eval('#app a', as => as.map(a => { const c = getComputedStyle(a); return `${c.color}|${c.textDecorationLine}`; }));
    assert.ok(colors.length > 10);
    for (const c of colors) {
      assert.doesNotMatch(c, /rgb\(0, 0, 238\)|rgb\(85, 26, 139\)/, 'bleu ou violet de lien du navigateur');
      assert.doesNotMatch(c, /underline/, 'lien souligné');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
