// Strela — vérifie qu'aucun élément ni texte ne se chevauche et que rien ne sort de l'écran, sur tous les écrans et
// états du sommaire, pour une grille de tailles d'écran (portrait 360–430 × 640–930, paysage 640×360 à 930×430) et de
// polices (100, 115, 130 %). Détail : tools/lib/layout.mjs. Lancé aussi par la CI (tests/chevauchement.test.js).
//   node tools/check-layout.mjs                  grille complète, thème sombre
//   node tools/check-layout.mjs --vite           6 tailles seulement
//   node tools/check-layout.mjs --clair          thème clair
//   node tools/check-layout.mjs --taille=410x914 --police=1.3 --etat=huit
import { serve, loadPlaywright } from './lib/serve.mjs';
import { PORTRAIT, LANDSCAPE, QUICK, FONT_SCALES, checkViewport } from './lib/layout.mjs';

const arg = k => process.argv.find(a => a.startsWith(`--${k}`))?.split('=')[1];
const flag = k => process.argv.includes(`--${k}`);

const pw = await loadPlaywright();
if (!pw) { console.error('Playwright absent : npm install --no-save playwright && npx playwright install chromium'); process.exit(2); }
const size = arg('taille');
const vps = size ? [{ width: Number(size.split('x')[0]), height: Number(size.split('x')[1]) }] : flag('vite') ? QUICK : [...PORTRAIT, ...LANDSCAPE];
const scales = arg('police') ? [Number(arg('police'))] : FONT_SCALES;
const only = arg('etat');
const states = only ? only.split(',').map(s => (s.startsWith('#') ? { route: s } : { scene: s })) : null;
const theme = flag('clair') ? 'light' : 'dark';

const srv = await serve();
const browser = await pw.chromium.launch();
let bad = 0;
const t0 = Date.now();
const jobs = [];
for (const vp of vps) for (const k of scales) jobs.push({ vp, k });
const results = [];
// 4 contextes en parallèle
async function worker() {
  while (jobs.length) {
    const { vp, k } = jobs.shift();
    const r = await checkViewport(browser, srv.url, vp, k, { theme, states });
    results.push({ vp, k, r });
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
for (const { vp, k, r } of results.sort((a, b) => a.vp.width - b.vp.width || a.vp.height - b.vp.height || a.k - b.k)) {
  for (const f of r) {
    bad++;
    console.log(`\n${vp.width}×${vp.height} police ${Math.round(k * 100)} % — ${f.state}`);
    for (const p of f.problems) console.log(`  · ${p}`);
  }
}
await browser.close();
await srv.close();
console.log(`\n${results.length} tailles × polices vérifiées en ${Math.round((Date.now() - t0) / 1000)} s : ${bad ? `${bad} état(s) en défaut` : 'aucun chevauchement'}`);
process.exit(bad ? 1 : 0);
