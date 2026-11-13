// Captures des animations par pictogramme (lot 7.9) : chaque animation est lancée sur l'écran de jeu de la maquette,
// figée à plusieurs instants (Web Animations : currentTime) et capturée → captures/picto-<clé>-<ms>-<taille>.png.
// node tools/pictos.mjs [--taille=410x914] [--clair] [--seul=renard,loup] [--instants=700,1500,2300]
import { mkdirSync } from 'node:fs';
import { serve, loadPlaywright } from './lib/serve.mjs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const [w, h] = arg('taille', '410x914').split('x').map(Number);
const light = process.argv.includes('--clair');
const only = arg('seul', '').split(',').filter(Boolean);
const times = arg('instants', '700,1500,2300').split(',').map(Number);
const pw = await loadPlaywright();
if (!pw) { console.error('Playwright absent'); process.exit(1); }
mkdirSync('captures', { recursive: true });
const srv = await serve();
const browser = await pw.chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: light ? 'light' : 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${srv.url}?maquette#/sommaire`);
  await page.waitForFunction(() => window.__strela);
  await page.evaluate(() => { window.__strela.reset(); window.__strela.scene('jeu'); });
  await page.evaluate(() => document.fonts.ready);
  const kinds = await page.evaluate(() => import('./src/ui/turnfx.js').then(m => m.FX_KINDS.filter(k => k.startsWith('picto:'))));
  const tag = `${w}x${h}${light ? '-clair' : ''}`;
  for (const kind of kinds) {
    const key = kind.slice(6);
    if (only.length && !only.includes(key)) continue;
    const total = await page.evaluate(kind => import('./src/ui/turnfx.js').then(m => {
      m.resetTurnFx();
      m.syncTurnFx({ key: `capture:${kind}`, kind, color: 'var(--av-0)' }, true);
      const anims = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#tfx'));
      anims.forEach(a => a.pause());
      return Math.max(0, ...anims.map(a => a.effect.getComputedTiming().endTime));
    }), kind);
    for (const t of times) {
      await page.evaluate(ms => document.getAnimations().forEach(a => { if (a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#tfx')) { a.pause(); a.currentTime = ms; } }), t);
      await page.waitForTimeout(30);
      await page.screenshot({ path: `captures/picto-${key}-${t}-${tag}.png` });
    }
    console.log(key, `${Math.round(total)} ms`);
  }
  if (errors.length) { console.error('Erreurs :', errors); process.exitCode = 1; }
} finally { await browser.close(); srv.close(); }
