// Icône « Soyouz » (lot 6) : assets/icon.svg (grille adaptative de 108, dessin dans la zone sûre de 66) et ses
// déclinaisons (tools/make-icons.mjs) : calques vectoriels d'Android à jour, PNG présents à la bonne taille.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { iconPaths, vectorDrawable, iconBackground, monoSvg } from '../tools/lib/icon.mjs';
import { THEMES } from '../src/ui/theme.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const svg = read('assets/icon.svg');

/** Boîte englobante des formes (coordonnées des chemins M/L/H/V/Z absolus). */
function bbox(d) {
  let x = 0, y = 0;
  const xs = [], ys = [];
  for (const [, cmd, args] of d.matchAll(/([MLHVZ])([^MLHVZ]*)/g)) {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === 'H') n.forEach(v => { x = v; xs.push(x); ys.push(y); });
    else if (cmd === 'V') n.forEach(v => { y = v; xs.push(x); ys.push(y); });
    else for (let i = 0; i + 1 < n.length; i += 2) { x = n[i]; y = n[i + 1]; xs.push(x); ys.push(y); }
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

test('icône : fond sombre de la DA, fléchette claire aux ailettes rouges, dans la zone sûre', () => {
  assert.match(svg, /viewBox="0 0 108 108"/);
  assert.equal(iconBackground(svg), THEMES.dark.bg);
  const parts = iconPaths(svg).filter(p => p.id !== 'fond');
  assert.ok(parts.length >= 3);
  assert.deepEqual([...new Set(parts.map(p => p.fill))].sort(), [THEMES.dark.fg, THEMES.dark.red].sort());
  for (const p of parts) {
    const b = bbox(p.d);
    // zone sûre de l'icône adaptative : cercle de 66 de diamètre centré ; on prend son carré englobant
    assert.ok(b.x0 >= 21 && b.x1 <= 87 && b.y0 >= 19 && b.y1 <= 87, `${p.d.slice(0, 20)}… dans la zone sûre`);
  }
});

test('icône : calques vectoriels d’Android et silhouette à jour (tools/make-icons.mjs)', () => {
  assert.equal(read('android/app/src/main/res/drawable/ic_launcher_fg.xml'), vectorDrawable(svg));
  assert.equal(read('android/app/src/main/res/drawable/ic_launcher_mono.xml'), vectorDrawable(svg, { mono: true }));
  assert.equal(read('assets/icon-mono.svg'), monoSvg(svg));
  const adaptive = read('android/app/src/main/res/mipmap-anydpi/ic_launcher.xml');
  assert.match(adaptive, /<foreground android:drawable="@drawable\/ic_launcher_fg"/);
  assert.match(adaptive, /<monochrome android:drawable="@drawable\/ic_launcher_mono"/);
  assert.match(read('android/app/src/main/res/values/colors.xml'), new RegExp(`icon_bg">${THEMES.dark.bg}<`));
});

test('icône : PNG de la PWA et de la fiche Play aux bonnes tailles', () => {
  const size = p => { const b = readFileSync(join(ROOT, p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const [p, n] of [['assets/icon-192.png', 192], ['assets/icon-512.png', 512], ['assets/icon-maskable-512.png', 512], ['docs/play/icone-512.png', 512]]) {
    assert.ok(existsSync(join(ROOT, p)), p);
    assert.deepEqual(size(p), [n, n], p);
  }
});
