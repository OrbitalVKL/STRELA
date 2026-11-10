// Captures des animations de tour (lot 7.4) : une partie à cinq joueurs, chacun avec son animation ; pour chaque
// volée, l'animation est figée à plusieurs instants (Web Animations : currentTime) et capturée → captures/anim-*.png.
// node tools/animations.mjs [--taille=410x914] [--clair]
import { mkdirSync } from 'node:fs';
import { serve, loadPlaywright } from './lib/serve.mjs';
import { openApp, createPlayer, newGame, throwDarts, validate } from './lib/app.mjs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const [w, h] = arg('taille', '410x914').split('x').map(Number);
const light = process.argv.includes('--clair');
const pw = await loadPlaywright();
if (!pw) { console.error('Playwright absent'); process.exit(1); }
mkdirSync('captures', { recursive: true });
const srv = await serve();
const browser = await pw.chromium.launch();
const PLAYERS = [
  ['Gilles', 'ours', 'ours', 3], ['HPV', 'cravate', 'cravate', 0], ['Patrick', 'carabine', 'carabine', 1],
  ['Angelina', 'planete', 'planete', 8], ['Guillaume', 'etoile', 'etoile', 7],
];
try {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: light ? 'light' : 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page, srv.url);
  for (const [n, icon, anim, color] of PLAYERS) await createPlayer(page, n, { icon, color, turnAnim: anim });
  await newGame(page, PLAYERS.map(p => p[0]), { startScore: 501, shuffle: false });
  const tag = `${w}x${h}${light ? '-clair' : ''}`;
  for (let i = 0; i < PLAYERS.length; i++) {
    if (i) {
      // En paysage, la saisie se fait sur la cible : les fléchettes sont jouées au pavé (portrait), VALIDER en paysage.
      if (w > h) await page.setViewportSize({ width: h, height: w });
      await throwDarts(page, 'S20 S1 S5');
      if (w > h) await page.setViewportSize({ width: w, height: h });
      await validate(page);
    }
    await page.waitForSelector('#tfx .tfx-n');
    const kind = PLAYERS[i][2];
    for (const t of [500, 1300, 2100]) {
      await page.evaluate(ms => document.getAnimations().forEach(a => { if (a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#tfx')) { a.pause(); a.currentTime = ms; } }), t);
      await page.waitForTimeout(50);
      await page.screenshot({ path: `captures/anim-${kind}-${t}-${tag}.png` });
    }
    const log = await page.evaluate(() => import('./src/ui/turnfx.js').then(m => m.turnFxLog.at(-1)));
    console.log(kind, JSON.stringify(log));
  }
  if (errors.length) { console.error('Erreurs :', errors); process.exitCode = 1; }
} finally { await browser.close(); srv.close(); }
