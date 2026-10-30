// Strela — captures d'écran de la maquette (Playwright), pour regarder les écrans avant de rendre un lot.
//   node tools/captures.mjs                       jeu de captures du lot (sombre et clair, portrait et paysage)
//   node tools/captures.mjs --etat=huit,cible --taille=410x712 --police=1.3 --clair [--entier : page entière]
// États : scènes du sommaire (src/ui/screens/sommaire.js, SCENES) ou adresses (« #/reglages »).
// Images dans captures/ (ignoré par git), nommées état-taille-thème[-police].png.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, loadPlaywright, ROOT } from './lib/serve.mjs';
import { show, inPage } from './lib/layout.mjs';

const arg = k => process.argv.find(a => a.startsWith(`--${k}`))?.split('=')[1];
const flag = k => process.argv.includes(`--${k}`);

// Jeu de captures par défaut (vérification de fin de lot) : [état, taille, page entière ?]
const P = '410x914', L = '914x410';
const DEFAULT = [
  ['#/sommaire', P], ['cible-seule', P], ['cible-seule', L], ['cible-tour1', P], ['cible', P], ['cible-grande', P], ['cible-manche', P],
  ['paysage', L], ['loupe', L], ['paysage-attente', L], ['histo-deux', P], ['histo-deux', L], ['histo-huit', P], ['histo-huit', L],
  ['histo-cours', P], ['manches', P], ['manches', L], ['huit', '410x712'], ['bust', P], ['volee', P], ['annonce', P],
  ['#/reglages', P, true], ['#/reglages', L, true], ['#/stats/p1', P], ['fin-manche', P], ['jeu', '360x640'],
];

const pw = await loadPlaywright();
if (!pw) { console.error('Playwright absent : npm install --no-save playwright && npx playwright install chromium'); process.exit(2); }
const OUT = join(ROOT, 'captures');
mkdirSync(OUT, { recursive: true });
const only = arg('etat');
const sizes = arg('taille') ? arg('taille').split(',') : null;
const list = only ? only.split(',').flatMap(st => (sizes || [P]).map(sz => [st, sz])) : DEFAULT;
const themes = flag('clair') ? ['light'] : flag('sombre') ? ['dark'] : ['dark', 'light'];
const scale = Number(arg('police') || 1);
const full = flag('entier');

const srv = await serve();
const browser = await pw.chromium.launch();
for (const theme of themes) {
  const ctxs = new Map();
  for (const [st, sz, whole] of list) {
    const [width, height] = sz.split('x').map(Number);
    if (!ctxs.has(sz)) {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      await ctx.addInitScript(t => { localStorage.setItem('strela.theme', t); localStorage.setItem('strela.anim', '0'); }, theme);
      const page = await ctx.newPage();
      page.on('pageerror', e => console.error('erreur JS :', e.message));
      await page.goto(`${srv.url}?maquette#/sommaire`);
      await page.waitForFunction(() => window.__strela);
      ctxs.set(sz, page);
    }
    const page = ctxs.get(sz);
    await show(page, st.startsWith('#') ? { route: st } : { scene: st });
    if (scale !== 1) { await page.evaluate(inPage.scaleFonts, scale); await page.evaluate(() => window.__strela.fit()); }
    await page.waitForTimeout(150);
    const file = `${st.replace(/^#\//, '').replace(/\//g, '-') || 'accueil'}-${sz}-${theme === 'dark' ? 'sombre' : 'clair'}${scale !== 1 ? `-${Math.round(scale * 100)}` : ''}.png`;
    await page.screenshot({ path: join(OUT, file), fullPage: full || !!whole });
    console.log(join('captures', file));
  }
}
await browser.close();
await srv.close();
