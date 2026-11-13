// Test de chevauchement (lot 1.2) : sur chaque écran et chaque état du sommaire, aucune boîte de texte ni aucun
// élément visible n'en recouvre un autre et rien ne sort de l'écran (détail : tools/lib/layout.mjs).
// Grille complète en CI (portrait 360–430 × 640–930, paysage 640×360 à 930×430, police 100 / 115 / 130 %, sombre et
// clair) ; sur un poste, grille réduite (STRELA_GRILLE=complete pour tout). Sans Playwright : test sauté.
// STRELA_GRILLE=reduite : grille réduite même en CI (Pages et APK : la grille complète est passée sur la demande de
// fusion) ; STRELA_GRILLE=aucune : test sauté (job « tests » de la CI, la grille tourne à part).
// STRELA_GRILLE_PART=i/n : seulement la part i des n parts de la grille (jobs « grille » de la CI, en parallèle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { PORTRAIT, LANDSCAPE, QUICK, FONT_SCALES, checkViewport } from '../tools/lib/layout.mjs';

const pw = await loadPlaywright();
const mode = process.env.STRELA_GRILLE || '';
const full = mode === 'complete' || (process.env.CI === 'true' && mode !== 'reduite');
const none = mode === 'aucune';
const [part, parts] = /^(\d+)\/(\d+)$/.test(process.env.STRELA_GRILLE_PART || '') ? process.env.STRELA_GRILLE_PART.split('/').map(Number) : [1, 1];

test(`aucun chevauchement ni débordement (${full ? 'grille complète' : 'grille réduite'}${parts > 1 ? `, part ${part}/${parts}` : ''})`, { skip: (none && 'grille lancée à part') || (!pw && 'Playwright absent'), timeout: 15 * 60e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    let jobs = [];
    for (const theme of full ? ['dark', 'light'] : ['dark']) {
      for (const vp of full ? [...PORTRAIT, ...LANDSCAPE] : QUICK) for (const k of FONT_SCALES) jobs.push({ theme, vp, k });
    }
    jobs = jobs.filter((_, i) => i % parts === part - 1);
    const failures = [];
    const worker = async () => {
      while (jobs.length) {
        const { theme, vp, k } = jobs.shift();
        for (const f of await checkViewport(browser, srv.url, vp, k, { theme })) {
          failures.push(`${vp.width}×${vp.height} police ${Math.round(k * 100)} % ${theme === 'dark' ? 'sombre' : 'clair'} — ${f.state}\n    ${f.problems.join('\n    ')}`);
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    assert.equal(failures.length, 0, `\n${failures.slice(0, 40).join('\n')}${failures.length > 40 ? `\n… et ${failures.length - 40} autres` : ''}`);
  } finally {
    await browser.close();
    await srv.close();
  }
});
