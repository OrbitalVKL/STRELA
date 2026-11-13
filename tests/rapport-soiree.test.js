// Rapport d'une soirée en 3 feuilles (lot 7.8, maquette ; Playwright, sauté s'il est absent) : les 3 feuilles A4 sont
// dessinées avec les vrais avatars (pictogrammes chargés), l'aperçu les montre à l'écran, le PDF a 3 pages, et une
// « soirée » regroupée sur plusieurs jours se dessine aussi (axe par partie au lieu de l'heure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { show } from '../tools/lib/layout.mjs';

const pw = await loadPlaywright();

test('rapport de soirée : 3 feuilles A4, aperçu, PDF de 3 pages, soirée sur plusieurs jours', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 410, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${srv.url}?maquette#/sommaire`);
    await page.waitForFunction(() => window.__strela);
    await show(page, { scene: 'v78-soiree-dash' });
    const info = await page.evaluate(async () => {
      const mod = await import('/src/ui/screens/v2/soireedash.js');
      const r = await mod.reportPages('s1');
      return { n: r.pages.length, sizes: r.pages.map(c => [c.width, c.height]), rows: r.m.rows.length };
    });
    assert.equal(info.n, 3);
    assert.deepEqual(info.sizes, [[1240, 1754], [1240, 1754], [1240, 1754]]);
    // Aperçu à l'écran
    await page.click('[data-act="dash-preview"]');
    await page.waitForSelector('.dpages img:nth-child(3)', { timeout: 20e3 });
    assert.equal(await page.locator('.dpages img').count(), 3);
    // PDF : 3 pages
    const pdf = await page.evaluate(async () => {
      const { pdfFromJpegs } = await import('/src/ui/sheet.js');
      const mod = await import('/src/ui/screens/v2/soireedash.js');
      const r = await mod.reportPages('s1');
      const bytes = pdfFromJpegs(r.pages.map(c => { const u = c.toDataURL('image/jpeg', 0.8); const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return { jpeg: a, w: c.width, h: c.height }; }));
      return new TextDecoder('latin1').decode(bytes.slice(0, 2000));
    });
    assert.match(pdf, /\/Count 3 /);
    // Toutes les parties de la saison regroupées en une « soirée » de plusieurs semaines : rien ne casse.
    const multi = await page.evaluate(async () => {
      const { store } = await import('/src/ui/store.js');
      for (const g of store.games) if (g.soiree) g.soiree = 'tout';
      const mod = await import('/src/ui/screens/v2/soireedash.js');
      const r = await mod.reportPages('tout');
      return { n: r.pages.length, games: r.m.games };
    });
    assert.equal(multi.n, 3);
    assert.ok(multi.games > 20);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
