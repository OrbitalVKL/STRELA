// Strela — vérifie la saisie au doigt sur la cible en paysage (914 × 410 par défaut) : pour 10 zones (doubles,
// triples, simples, 25, 50), appui décalé, glissé jusqu'à la zone, lâcher ; affiche la zone lue par la loupe et la
// fléchette enregistrée. Aussi lancé par la CI (tests/geste.test.js).
//   node tools/geste.mjs [--taille=860x410]
import { serve, loadPlaywright } from './lib/serve.mjs';
import { playTargets } from './lib/geste.mjs';

const size = (process.argv.find(a => a.startsWith('--taille='))?.split('=')[1] || '914x410').split('x').map(Number);
const pw = await loadPlaywright();
if (!pw) { console.error('Playwright absent : npm install --no-save playwright && npx playwright install chromium'); process.exit(2); }
const srv = await serve();
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`${srv.url}?maquette#/sommaire`);
await page.waitForFunction(() => window.__strela);
const res = await playTargets(page);
for (const r of res) console.log(`${r.want.padEnd(4)} loupe ${String(r.lens).padEnd(4)} enregistré ${r.got}${r.got === r.want ? '' : '   ✕'}`);
const bad = res.filter(r => r.got !== r.want).length;
console.log(bad ? `${bad} erreur(s)` : 'toutes les zones sont bonnes');
await browser.close();
await srv.close();
process.exit(bad ? 1 : 0);
