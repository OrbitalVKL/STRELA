// Strela — images de la fiche Google Play (lot 6), produites depuis la maquette (données fictives), Playwright :
//   node tools/play-assets.mjs
//   docs/play/captures/*.jpg : captures de téléphone, portrait 1080 × 1920 et paysage 1920 × 1080 (9:16 et 16:9,
//     JPEG sans transparence, comme Play les demande), en sombre et en clair ;
//   docs/play/presentation-1024x500.jpg : image de présentation (« feature graphic »), dans la DA.
// L'icône 512 × 512 (docs/play/icone-512.png) vient de tools/make-icons.mjs. Les fichiers produits sont versionnés.
// Boutons du sommaire de maquette masqués, mention « maquette » remplacée par celle de l'appli.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, loadPlaywright, ROOT } from './lib/serve.mjs';
import { show } from './lib/layout.mjs';

const OUT = join(ROOT, 'docs/play');
const CAPS = join(OUT, 'captures');
mkdirSync(CAPS, { recursive: true });
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// [nom, état (scène ou adresse), orientation]
const SHOTS = [
  ['1-accueil', { scene: 'accueil-bande' }, 'portrait'],
  ['2-saisie-finition', { scene: 'finition' }, 'portrait'],
  ['3-stats', { route: '#/stats/p1' }, 'portrait'],
  ['4-avatars', { scene: 'banque-carabine' }, 'portrait'],
  ['5-cible-paysage', { scene: 'paysage' }, 'paysage'],
  ['6-historique-paysage', { scene: 'histo-huit' }, 'paysage'],
];

/** Dans la page : l'écran tel que dans l'appli (sans les commandes du sommaire de maquette). */
function asApp(v) {
  document.querySelectorAll('.top .act.mq, .mq-row').forEach(e => e.remove());
  const foot = document.querySelector('.home-foot span');
  if (foot) foot.textContent = 'Enregistré sur ce téléphone';
  const ver = document.querySelector('.home-ver');
  if (ver) ver.textContent = `v${v}`;
}

const pw = await loadPlaywright();
if (!pw) { console.error('Playwright absent'); process.exit(2); }
const srv = await serve();
const browser = await pw.chromium.launch();
for (const theme of ['dark', 'light']) {
  for (const [name, st, orient] of SHOTS) {
    const viewport = orient === 'portrait' ? { width: 360, height: 640 } : { width: 640, height: 360 };
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await ctx.addInitScript(t => { localStorage.setItem('strela.theme', t); localStorage.setItem('strela.anim', '0'); }, theme);
    const page = await ctx.newPage();
    await page.goto(`${srv.url}?maquette#/sommaire`);
    await page.waitForFunction(() => window.__strela);
    await show(page, st);
    await page.evaluate(asApp, version);
    await page.evaluate(() => window.__strela.fit());
    await page.waitForTimeout(150);
    const file = join(CAPS, `${name}-${theme === 'dark' ? 'sombre' : 'clair'}.jpg`);
    writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 88 }));
    console.log(file.slice(ROOT.length));
    await ctx.close();
  }
}

// Image de présentation 1024 × 500 : bande rouge de l'accueil, la fléchette de l'icône, STRELA.
const icon = readFileSync(join(ROOT, 'assets/icon.svg'), 'utf8').replace(/<path id="fond"[^>]*\/>/, '').replace(/<!--[\s\S]*?-->/g, '');
const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${srv.url}confidentialite.html`); // même origine que les polices
await page.setContent(`<!doctype html><html data-theme="dark"><head><base href="${srv.url}"><link rel="stylesheet" href="assets/theme.css">
<style>
  html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; background: var(--bg); }
  .g { position: relative; width: 1024px; height: 500px; display: grid; grid-template-columns: 330px 1fr; }
  .art { display: grid; place-items: center; border-right: 1px solid var(--faint); }
  .art svg { width: 420px; height: 420px; }
  .txt { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 22px; padding: 0 48px; }
  .band { align-self: stretch; background: var(--red); color: var(--red-ink); font-size: 100px; font-weight: 800; letter-spacing: 0.14em; line-height: 1; padding: 26px 30px 22px; width: max-content; }
  .sub { color: var(--fg); font-size: 30px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  .dim2 { color: var(--dim); font-size: 21px; letter-spacing: 0.04em; }
  .rule2 { align-self: stretch; height: 1px; background: var(--faint); }
</style></head><body><div class="g"><div class="art">${icon}</div>
<div class="txt"><div class="band">STRELA</div><div class="sub">Compteur de fléchettes X01</div><div class="rule2"></div>
<div class="dim2">301 · 501 · 701 — hors ligne, tout reste sur le téléphone</div></div></div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
writeFileSync(join(OUT, 'presentation-1024x500.jpg'), await page.screenshot({ type: 'jpeg', quality: 92 }));
console.log('docs/play/presentation-1024x500.jpg');
await browser.close();
await srv.close();
