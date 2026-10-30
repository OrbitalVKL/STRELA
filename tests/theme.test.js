import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { THEMES, mix, contrast, deltaE, AVATAR_COLORS, AVATAR_INK, NIGHT_FILTER } from '../src/ui/theme.js';

const root = new URL('../', import.meta.url);
const css = readFileSync(new URL('assets/theme.css', root), 'utf8');
const VARS = { bg: 'bg', fg: 'fg', dim: 'dim', faint: 'faint', red: 'red', 'red-text': 'redText', 'red-ink': 'redInk', 'inv-fg': 'invFg', 'inv-bg': 'invBg' };

const block = selector => {
  const i = css.indexOf(selector + ' {');
  assert.ok(i >= 0, `bloc ${selector} absent de theme.css`);
  const body = css.slice(i, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2].toUpperCase()]));
};

test('DA : couleurs imposées et formule atténué 62 % / discret 30 %', () => {
  assert.equal(THEMES.dark.bg, '#0A0C0E');
  assert.equal(THEMES.dark.fg, '#CFD2D4');
  assert.equal(THEMES.dark.red, '#9E4A4A');
  assert.equal(THEMES.dark.redText, '#C26A6A');
  assert.equal(THEMES.dark.invFg, '#0C0F12');
  assert.equal(THEMES.dark.invBg, '#CFD2D4');
  assert.equal(THEMES.light.bg, '#ECEDEE');
  assert.equal(THEMES.light.fg, '#14171A');
  assert.equal(THEMES.light.red, '#9E4A4A');
  assert.equal(THEMES.light.invBg, '#14171A');
  assert.equal(THEMES.light.invFg, THEMES.light.bg);
  for (const t of Object.values(THEMES)) {
    assert.equal(t.dim, mix(t.fg, 0.62, t.bg));
    assert.equal(t.faint, mix(t.fg, 0.30, t.bg));
  }
  assert.equal(THEMES.dark.dim, '#848789');
  assert.equal(THEMES.dark.faint, '#454749');
});

test('theme.css reprend exactement la palette (sombre, clair choisi, clair en Auto)', () => {
  for (const [selector, theme] of [
    [':root', THEMES.dark],
    [':root[data-theme="light"]', THEMES.light],
    [':root:not([data-theme="dark"])', THEMES.light],
  ]) {
    const vars = block(selector);
    for (const [cssName, key] of Object.entries(VARS)) assert.equal(vars[cssName], theme[key], `${selector} --${cssName}`);
  }
});

test('lisibilité : contrastes suffisants dans les deux thèmes', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    assert.ok(contrast(t.fg, t.bg) >= 7, `${name} texte`);
    assert.ok(contrast(t.invFg, t.invBg) >= 7, `${name} vidéo inverse`);
    assert.ok(contrast(t.dim, t.bg) >= 4.5, `${name} atténué`);
    assert.ok(contrast(t.redText, t.bg) >= 4.5, `${name} texte rouge`);
    assert.ok(contrast(t.redInk, t.red) >= 4.5, `${name} texte sur rouge`);
  }
});

test('police Martian Mono embarquée avec sa licence OFL', () => {
  for (const f of ['martian-mono-latin.woff2', 'martian-mono-latin-ext.woff2', 'martian-mono-cyrillic.woff2', 'OFL.txt']) {
    assert.ok(existsSync(new URL(`assets/fonts/${f}`, root)), f);
    if (f.endsWith('.woff2')) assert.ok(css.includes(`fonts/${f}`), `${f} déclarée dans theme.css`);
  }
  assert.match(readFileSync(new URL('assets/fonts/OFL.txt', root), 'utf8'), /SIL Open Font License/);
});

test('avatars : 8 fonds sourds dans theme.css, pictogramme lisible sur chacun', () => {
  const vars = block(':root');
  assert.equal(AVATAR_COLORS.length, 8);
  AVATAR_COLORS.forEach((c, i) => {
    assert.equal(vars[`av-${i}`], c, `--av-${i}`);
    assert.ok(contrast(AVATAR_INK, c) >= 4.5, `encre sur --av-${i} : ${contrast(AVATAR_INK, c).toFixed(2)}`);
    assert.notEqual(c, THEMES.dark.red, 'le rouge reste réservé aux alertes');
  });
  assert.equal(vars['av-ink'], AVATAR_INK);
  assert.equal(vars.night, NIGHT_FILTER);
});

test('avatars : deux fonds ne se confondent jamais (écart CIEDE2000 ≥ 20, ardoise / graphite et sapin / pétrole compris)', () => {
  // valeurs de référence de la formule (Sharma et al., 2005)
  assert.ok(Math.abs(deltaE('#FFFFFF', '#FFFFFF')) < 1e-9);
  assert.ok(Math.abs(deltaE('#3D4A5A', '#4A4E52') - 6.44) < 0.05, 'ancien couple ardoise / graphite : 6,4');
  for (let i = 0; i < AVATAR_COLORS.length; i++) {
    for (let j = i + 1; j < AVATAR_COLORS.length; j++) {
      const d = deltaE(AVATAR_COLORS[i], AVATAR_COLORS[j]);
      assert.ok(d >= 20, `--av-${i} / --av-${j} : ${d.toFixed(1)}`);
    }
    assert.ok(deltaE(AVATAR_COLORS[i], THEMES.dark.red) >= 12, `--av-${i} loin du rouge d'alerte`);
  }
});
