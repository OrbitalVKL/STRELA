// 0.24.0 : profil d'un joueur (#/joueur/<id>) — vraie appli : statut dans la liste, quatre onglets (Résumé, Parties,
// Entraînement, Badges), MODIFIER et retour au profil, anciennes adresses (#/stats/<id>, #/entrainement/stats) menant au
// profil, tableau des badges (vitrine par familles, chronologie). Puis la fenêtre d'un badge gagné dans une partie à
// 5 joueurs (maquette) : plus rien de plus large que l'écran (vu par Guillaume le 25/11). Playwright (sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, createPlayer, newGame, throwDarts, ack, settle, readDb } from '../tools/lib/app.mjs';
import { show } from '../tools/lib/layout.mjs';

const pw = await loadPlaywright();
const V = { viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' };
const skip = !pw && 'Playwright absent';

/** Une volée en partie (VALIDER s'il le faut). */
async function volley(page, n) {
  await throwDarts(page, n);
  await ack(page);
  if (await page.locator('.validate.go').count()) await page.click('.validate.go');
}

test('profil : statut, onglets, MODIFIER, anciennes adresses, badges en vitrine et en chronologie', { skip, timeout: 180e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const page = await (await browser.newContext(V)).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha');
    await createPlayer(page, 'Bravo');
    // Une partie : Alpha fait 180 puis finit (première victoire, premier 180, Feu d'Artifice bronze).
    await newGame(page, ['Alpha', 'Bravo'], { startScore: 301 });
    await volley(page, 'T20 T20 T20');
    await volley(page, '20 20 20');
    await throwDarts(page, 'T20 T11 D14');
    await page.waitForFunction(() => location.hash === '#/fin');
    await ack(page);
    await page.click('[data-act="finish-home"]');
    await settle(page);
    const db = await readDb(page);
    const alpha = db.players.find(p => p.name === 'Alpha');

    // Liste : statut de chaque joueur (local, sans compte en ligne dans les tests).
    await page.evaluate(() => { location.hash = '#/joueurs'; });
    await page.waitForSelector('.players3');
    assert.match(await page.textContent('.list a:has(.nm:text-is("Bravo")) .pst'), /ce téléphone/i);

    // Toucher un joueur ouvre son profil (Résumé), plus le formulaire.
    await page.click('.list a:has(.nm:text-is("Alpha"))');
    await page.waitForSelector('.profile .phead');
    assert.equal(location(await page.url()), `#/joueur/${alpha.id}`);
    assert.equal(await page.$('#name'), null, 'pas de formulaire');
    assert.match(await page.textContent('.phead'), /Alpha[\s\S]*1\spartie/);
    assert.equal(await page.getAttribute('.ptabs a[aria-selected="true"]', 'data-tab'), 'resume');
    const mini = await page.$$eval('.pmini [data-k]', els => Object.fromEntries(els.map(e => [e.dataset.k, e.querySelector('b').textContent.replace(/\s+/g, ' ').trim()])));
    assert.equal(mini.played, '1');
    assert.equal(mini.won, '1');
    assert.equal(mini.bestVisit, '180');
    assert.match(await page.textContent('.vrecs'), /Meilleure volée\s*180/i, 'records');
    assert.match(await page.textContent('.presume .vlist'), /180/, 'meilleures volées');
    assert.ok(await page.locator('.presume .badges li.on').count() >= 2, 'derniers badges');
    assert.match(await page.textContent('.presume .h2h'), /Bravo/, 'rivaux');

    // Onglet Parties : chiffres clés visibles, le reste replié (la courbe ouverte).
    await page.click('.ptabs a[data-tab="parties"]');
    await page.waitForSelector('.pfolds');
    assert.ok(await page.locator('.kpi[data-k="average"]').count());
    assert.equal(await page.getAttribute('[data-act="v2-fold"][data-arg="pp-courbe"]', 'aria-expanded'), 'true');
    assert.equal(await page.getAttribute('[data-act="v2-fold"][data-arg="pp-score"]', 'aria-expanded'), 'false');
    await page.click('[data-act="v2-fold"][data-arg="pp-score"]');
    assert.equal(await page.textContent('.kpi[data-k="bestVisit"] b'), '180');

    // Onglet Badges : vitrine par familles, médailles ; chronologie ; un badge ouvre sa fenêtre.
    await page.click('.ptabs a[data-tab="badges"]');
    await page.waitForSelector('.medals');
    const fams = await page.$$eval('.pfam', els => els.map(e => e.dataset.fam));
    assert.deepEqual(fams.slice(0, 4), ['victoires', 'volees', 'rangs', 'soiree']);
    const on = await page.$$eval('.pfam li.on', els => els.map(e => e.dataset.badge).sort());
    assert.ok(on.includes('win1') && on.includes('max') && on.includes('feu'), `badges gagnés : ${on.join(', ')}`);
    assert.ok(await page.locator('.pfam li.off .bprog').count(), 'progression des badges à gagner');
    await page.click('[data-act="pf-badges"][data-arg="chrono"]');
    await page.waitForSelector('.ptl');
    assert.match(await page.textContent('.ptl'), /Premier 180/i);
    await page.click('.ptl li button >> nth=0');
    await page.waitForSelector('.bsheet');
    await page.click('.bsheet [data-act="badge-close"] >> nth=0');

    // MODIFIER : le formulaire, puis retour au profil ; un ami n'a pas de MODIFIER (tests/amis-parcours).
    await page.click('.pedit');
    await page.waitForSelector('#name');
    assert.equal(location(await page.url()), `#/joueur/${alpha.id}/modifier`);
    await page.fill('#name', 'Alpha2');
    await page.click('[data-act="save-player"]');
    await page.waitForSelector('.profile .phead');
    assert.match(await page.textContent('.phead'), /Alpha2/);

    // Anciennes adresses : Stats d'un joueur et stats d'entraînement mènent à son profil.
    await page.evaluate(i => { location.hash = `#/stats/${i}`; }, alpha.id);
    await page.waitForFunction(i => location.hash === `#/joueur/${i}/parties`, alpha.id);
    await page.evaluate(() => { location.hash = '#/entrainement/stats'; });
    await page.waitForFunction(() => /^#\/joueur\/[^/]+\/entrainement$/.test(location.hash));
    await page.waitForSelector('.profile .trstats');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});

test('fenêtre d\'un badge gagné dans une partie à 5 joueurs : rien de plus large que l\'écran', { skip, timeout: 60e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    for (const [w, h] of [[412, 915], [360, 640]]) {
      const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })).newPage();
      await page.goto(`${srv.url}?maquette#/sommaire`);
      await page.waitForFunction(() => window.__strela);
      await show(page, { scene: 'v24-badge-joueurs' });
      await page.waitForSelector('.bsheet .bkv');
      const names = await page.evaluate(() => [...document.querySelectorAll('.bsheet .bkv li')].find(li => /Joueurs/i.test(li.textContent)).querySelector('b').textContent);
      assert.ok(names.split(',').length >= 4, `une partie à 4 joueurs ou plus : ${names}`);
      const wide = await page.evaluate(() => [...document.querySelectorAll('.bsheet *')].filter(e => e.getBoundingClientRect().right > innerWidth + 0.5).map(e => e.className || e.tagName));
      assert.deepEqual(wide, [], `${w} px : rien ne dépasse`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
  } finally {
    await browser.close();
    await srv.close();
  }
});

/** Partie « #… » d'une adresse. */
function location(url) { return url.slice(url.indexOf('#')); }
