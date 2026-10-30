// Une seule couleur de joueur à l'écran pendant la partie (lot 1.3) : celle du joueur en cours (bandeau, VALIDER,
// annonce). Les autres joueurs, le suivant compris, restent neutres. VALIDER prend la couleur du joueur qui vient de
// lancer, avec un texte lisible sur chacune des 8 couleurs d'avatar, et ne dit que « VALIDER », sur une ligne (lot 2 :
// le suivant n'est montré que dans la bande des autres). Playwright (sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { show } from '../tools/lib/layout.mjs';
import { AVATAR_COLORS, contrast } from '../src/ui/theme.js';

const pw = await loadPlaywright();

const SCENES = ['jeu', 'arme-d', 'volee', 'volee-4', 'volee-8', 'bust', 'annonce', 'cible', 'manches', 'finition', 'huit',
  'long', 'solo-attente', 'paysage', 'paysage-attente', 'photo-jeu', 'fete-100', 'fete-140', 'fete-180', 'fete-180-paysage',
  'correction', 'panneau-case', 'finition-preferee'];

/** Dans la page : couleurs d'avatar trouvées sur les éléments visibles de l'écran de jeu. */
function scan(palette) {
  const hex = c => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
    if (Number(a) === 0) return null;
    return `#${[r, g, b].map(v => Math.round(Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  };
  const colorsIn = str => (str.match(/rgba?\([^)]+\)/g) || []).map(hex).filter(Boolean);
  const band = document.querySelector('.gband');
  const cur = band ? Number(/--av-(\d)/.exec(band.getAttribute('style'))?.[1]) : null;
  const found = [];
  for (const el of document.querySelectorAll('#app *')) {
    if (!el.getClientRects().length) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    const cols = [s.backgroundColor, s.boxShadow, s.fill, s.stroke];
    if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) cols.push(s.color);
    for (const k of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== 'none') cols.push(s[`border${k}Color`]);
    if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) cols.push(s.outlineColor);
    for (const c of cols.flatMap(colorsIn)) {
      const j = palette.indexOf(c);
      if (j >= 0) found.push({ j, where: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').trim().split(/\s+/).join('.')}` });
    }
  }
  const v = document.querySelector('.validate.go');
  const vs = v && getComputedStyle(v);
  return {
    cur, found,
    validate: v ? {
      bg: hex(vs.backgroundColor), fg: hex(vs.color), text: v.innerText.replace(/\s+/g, ' ').trim(),
      lines: (() => { const r = document.createRange(); r.selectNodeContents(v); return new Set([...r.getClientRects()].filter(x => x.width > 1).map(x => Math.round(x.top))).size; })(),
      size: parseFloat(getComputedStyle(v.querySelector('.vl') || v).fontSize),
    } : null,
  };
}

test('en jeu, seule la couleur du joueur en cours est à l’écran ; VALIDER à sa couleur, lisible', { skip: !pw && 'Playwright absent', timeout: 180e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    for (const theme of ['dark', 'light']) {
      for (const [width, height] of [[410, 914], [914, 410]]) {
        const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
        await ctx.addInitScript(t => { localStorage.setItem('strela.theme', t); localStorage.setItem('strela.anim', '0'); }, theme);
        const page = await ctx.newPage();
        await page.goto(`${srv.url}?maquette#/sommaire`);
        await page.waitForFunction(() => window.__strela);
        const at = `${width}×${height} ${theme === 'dark' ? 'sombre' : 'clair'}`;
        for (const scene of SCENES) {
          await show(page, { scene });
          const r = await page.evaluate(scan, [...AVATAR_COLORS]);
          assert.ok(Number.isInteger(r.cur), `${scene} ${at} : bandeau du joueur en cours`);
          const others = r.found.filter(f => f.j !== r.cur);
          assert.deepEqual(others, [], `${scene} ${at} : couleur d’un autre joueur à l’écran`);
          assert.ok(r.found.some(f => f.where.startsWith('header.gband')), `${scene} ${at} : bandeau à la couleur du joueur`);
        }
        // VALIDER : volée en attente à 8 joueurs, lancée tour à tour par chacun (les 8 couleurs d'avatar)
        const seen = new Set();
        for (let k = 0; k < 8; k++) {
          await show(page, { scene: 'volee-8', arg: k });
          const r = await page.evaluate(scan, [...AVATAR_COLORS]);
          assert.ok(r.validate, `VALIDER ${k} ${at}`);
          assert.equal(r.validate.bg, AVATAR_COLORS[r.cur], `VALIDER à la couleur du joueur qui vient de lancer (${at})`);
          assert.ok(contrast(r.validate.fg, r.validate.bg) >= 4.5, `VALIDER sur --av-${r.cur} : ${contrast(r.validate.fg, r.validate.bg).toFixed(2)}`);
          assert.equal(r.validate.text, 'VALIDER', `VALIDER seul, sans le suivant (${r.validate.text})`);
          assert.equal(r.validate.lines, 1, 'VALIDER sur une ligne');
          assert.ok(r.validate.size >= (width > height ? 20 : 40), `VALIDER en grand (${r.validate.size} px)`);
          seen.add(r.cur);
        }
        assert.equal(seen.size, 8, 'les 8 couleurs d’avatar passées');
        await show(page, { scene: 'solo-attente' });
        const solo = await page.evaluate(scan, [...AVATAR_COLORS]);
        assert.equal(solo.validate.text, 'VALIDER', 'en solo, VALIDER seul');
        assert.equal(solo.validate.lines, 1);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await srv.close();
  }
});
