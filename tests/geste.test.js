// Saisie au doigt sur la cible en paysage : vrais événements tactiles (appui décalé, glissé, lâcher) sur 10 zones,
// dont doubles, triples, 25 et 50 (détail : tools/lib/geste.mjs). Sans Playwright : test sauté.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { playTargets } from '../tools/lib/geste.mjs';

const pw = await loadPlaywright();

test('paysage : le geste enregistre la zone visée (loupe comprise)', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    for (const [width, height] of [[914, 410], [640, 360]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await page.goto(`${srv.url}?maquette#/sommaire`);
      await page.waitForFunction(() => window.__strela);
      for (const r of await playTargets(page)) {
        assert.equal(r.got, r.want, `${width}×${height} : ${r.want} enregistré ${r.got}`);
        assert.equal(r.lens, r.want.replace(/^S/, ''), `${width}×${height} : loupe sur ${r.want}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    await srv.close();
  }
});
