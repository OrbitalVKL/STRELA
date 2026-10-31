// Strela — décline l'icône assets/icon.svg (lot 6, « Soyouz » : grille d'icône adaptative de 108, dessin dans la zone
// sûre de 66). Outil de poste, pas lancé en CI ; les fichiers produits sont versionnés :
//   assets/icon-192.png, assets/icon-512.png : icônes PWA « any », recadrées (le dessin occupe l'icône) ;
//   assets/icon-maskable-512.png : icône PWA « maskable », grille entière (zone sûre respectée) ;
//   android/app/src/main/res/drawable/ic_launcher_fg.xml, ic_launcher_mono.xml : icône adaptative d'Android (calques
//     vectoriels : premier plan en couleurs, silhouette monochrome pour les icônes à thème) ; fond = @color/icon_bg ;
//   assets/icon-mono.svg : la silhouette seule (aperçu de l'icône à thème au sommaire de maquette) ;
//   docs/play/icone-512.png : icône de la fiche Play (512 × 512).
// Il faut Playwright et Chromium (PNG seulement) : `node tools/make-icons.mjs`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { vectorDrawable, cropped, monoSvg } from './lib/icon.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(join(ROOT, 'assets/icon.svg'), 'utf8');
export const ANY_CROP = [13, 13, 82, 82]; // icônes « any » : la fléchette (y 20 à 86) avec une marge

const write = (rel, data) => { const out = join(ROOT, rel); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, data); console.log(rel); };
write('android/app/src/main/res/drawable/ic_launcher_fg.xml', vectorDrawable(svg));
write('android/app/src/main/res/drawable/ic_launcher_mono.xml', vectorDrawable(svg, { mono: true }));
write('assets/icon-mono.svg', monoSvg(svg));

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
const any = cropped(svg, ANY_CROP);
for (const [rel, size, src] of [['assets/icon-192.png', 192, any], ['assets/icon-512.png', 512, any],
  ['assets/icon-maskable-512.png', 512, svg], ['docs/play/icone-512.png', 512, any]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${src}`);
  write(rel, await page.screenshot({ type: 'png' }));
}
await browser.close();
