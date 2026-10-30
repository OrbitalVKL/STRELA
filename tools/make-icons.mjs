// Strela — génère les icônes PNG du manifeste à partir d'assets/icon.svg (outil de poste, pas lancé en CI) :
//   assets/icon-192.png, assets/icon-512.png, assets/icon-maskable-512.png (dessin réduit dans la zone sûre) ;
//   lot 5 : icône adaptative de l'APK, android/app/src/main/res/mipmap-*/ic_launcher_fg.png (dessin seul, fond
//   transparent, dans la zone sûre de 66 dp sur 108) et ic_launcher_mono.png (même dessin en blanc, icônes à thème).
// Il faut Playwright et Chromium : `node tools/make-icons.mjs`. Les PNG produits sont versionnés.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = createRequire(import.meta.url)('playwright');
const svg = readFileSync(join(ROOT, 'assets/icon.svg'), 'utf8');
// Zone sûre d'une icône « maskable » : cercle de 80 % ; on réduit le dessin à 72 % sur le même fond.
const maskable = svg.replace(/(<rect width="512" height="512" fill="[^"]+"\/>)([\s\S]*)<\/svg>/,
  '$1<g transform="translate(256 256) scale(0.72) translate(-256 -256)">$2</g></svg>');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, src] of [['icon-192.png', 192, svg], ['icon-512.png', 512, svg], ['icon-maskable-512.png', 512, maskable]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${src}`);
  writeFileSync(join(ROOT, 'assets', name), await page.screenshot({ type: 'png' }));
  console.log('assets/' + name);
}
// Icône adaptative d'Android : calque de premier plan (108 dp, dessin dans le cercle sûr de 66 dp), fond = couleur.
const body = svg.replace(/<rect width="512" height="512" fill="[^"]+"\/>/, '');
const fg = body.replace(/(<svg[^>]*>)([\s\S]*)<\/svg>/, '$1<g transform="translate(256 256) scale(0.68) translate(-256 -256)">$2</g></svg>');
const mono = fg.replace(/#[0-9A-Fa-f]{6}/g, '#FFFFFF');
for (const [dir, px] of [['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432]]) {
  for (const [name, src] of [['ic_launcher_fg.png', fg], ['ic_launcher_mono.png', mono]]) {
    await page.setViewportSize({ width: px, height: px });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${src}`);
    const out = join(ROOT, `android/app/src/main/res/mipmap-${dir}`, name);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, await page.screenshot({ type: 'png', omitBackground: true }));
    console.log(out.slice(ROOT.length));
  }
}
await browser.close();
