// Strela — génère les icônes PNG du manifeste à partir d'assets/icon.svg (outil de poste, pas lancé en CI) :
//   assets/icon-192.png, assets/icon-512.png, assets/icon-maskable-512.png (dessin réduit dans la zone sûre).
// Il faut Playwright et Chromium : `node tools/make-icons.mjs`. Les PNG produits sont versionnés.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

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
await browser.close();
