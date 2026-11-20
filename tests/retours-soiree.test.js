// Lot 7.8 — retours de la soirée du 20/11 : défis (six de plus, jeux de défis, déclaration, étoiles du tableau),
// badges à rangs et volée d'obtention, roi des uns, moto d'Angelina ; puis la vraie appli (Playwright, sauté s'il est
// absent) : VALIDER ferme la moquerie en un appui, bandeau du défi, pastilles de rang, voyelles de Tsia hors des menus,
// dégrisement express, fenêtre d'un badge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { computeState } from '../src/engine/x01.js';
import { DEFIS, DEFI_SETS, DEFI_SET, drawDefi, defiResult, gameDefis } from '../src/engine/defis.js';
import { honours, playerBadges, badgesOfGame, badgeWhere, tierCounts, BADGES } from '../src/engine/badges.js';
import { flop, kingOfOnes } from '../src/engine/ranking.js';
import { soireeModel } from '../src/engine/soiree.js';
import { legTable, cellHtml } from '../src/ui/table.js';
import { FLOP_LINES } from '../src/ui/feedback.js';
import { TIE_LINES } from '../src/ui/turnfx.js';
import { withDrinks, cleanDecl } from '../src/data/db.js';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, throwDarts, validate, createPlayer, newGame, readDb, settle } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';
const cfg = (players = ['A', 'B'], extra = {}) => ({ startScore: 501, outMode: 'double', legsToWin: 1, players, ...extra });
const v = (notation, extra = {}) => { const darts = ds(notation); const total = darts.reduce((n, d) => n + d.segment * d.multiplier, 0); return { darts, total, scored: total, bust: false, ...extra }; };

/** Une partie dont la volée de rang 1 (B) porte le défi `key` (jeu `set`). */
function gameWith(key, set = 2) {
  for (let g = 0; g < 20000; g++) if (drawDefi(`k${g}`, 1, 'souvent', 501, set) === key) return `k${g}`;
  throw new Error(`aucune partie pour ${key}`);
}

test('défis : six de plus, et les parties d’avant gardent exactement leurs défis', () => {
  assert.deepEqual(DEFI_SETS[1], ['triple', 'double', 'vingt', 'soixante', 'pasdeun', 'bull', 'moyenne', 'tournee']);
  for (const k of ['gauche', 'pair', 'voisin', 'pasvingt', 'escalier', 'ecart']) assert.ok(DEFI_SETS[2].includes(k) && DEFIS[k].text && DEFIS[k].short, k);
  assert.equal(DEFI_SET, 2);
  // Sans `defiSet` (parties d'avant le lot 7.8), le tirage est celui du lot 9, volée par volée.
  for (let g = 0; g < 300; g++) for (let i = 1; i < 12; i++) {
    const old = drawDefi(`old${g}`, i, 'souvent', 501);
    if (old) assert.ok(DEFI_SETS[1].includes(old));
    assert.equal(drawDefi(`old${g}`, i, 'souvent', 501, undefined), old);
  }
  // Les nouvelles parties tirent dans les 14 défis.
  const seen = new Set();
  for (let g = 0; g < 3000; g++) { const k = drawDefi(`n${g}`, 1, 'souvent', 501, 2); if (k) seen.add(k); }
  assert.equal(seen.size, 14);
});

test('défis : tout pair, le voisin, pas de 20, escalier, grand écart', () => {
  const ok = (k, n, extra) => DEFIS[k].ok(v(n, extra), {});
  assert.ok(ok('pair', 'S2 D20 T8')); assert.ok(!ok('pair', 'S2 D20 S25')); assert.ok(!ok('pair', 'S2 D20 0')); assert.ok(!ok('pair', 'S2 D20'));
  assert.ok(ok('voisin', 'S20 S1 S5')); assert.ok(ok('voisin', 'T20 D5 T1')); assert.ok(!ok('voisin', 'S1 S20 S5')); assert.ok(!ok('voisin', 'S20 S1 S1'));
  assert.equal(DEFIS.voisin.reward, true, 'réussi : les autres boivent');
  assert.ok(ok('pasvingt', 'T19 S5 S1')); assert.ok(!ok('pasvingt', 'T19 S20 S1'), 'touche le 20'); assert.ok(!ok('pasvingt', 'S19 S20 S1'));
  assert.ok(!ok('pasvingt', 'S19 S19 S2'), '40 tout juste ne suffit pas');
  assert.ok(ok('escalier', '0 S5 T20')); assert.ok(ok('escalier', 'S1 S2 S3')); assert.ok(!ok('escalier', 'S5 S5 S6'), 'égal n’est pas monter');
  assert.ok(!ok('escalier', 'S20 S5 S1')); assert.ok(!ok('escalier', 'S1 S2 S3', { bust: true }));
  assert.ok(ok('ecart', 'S20 S3 0')); assert.ok(ok('ecart', 'S1 S12 S17'), 'haut puis bas, 2e et 3e'); assert.ok(!ok('ecart', 'S3 S20 S6'), 'bas puis haut');
  assert.ok(!ok('ecart', 'S20 S6 S3'), 'pas à la suite');
});

test('défis : « main gauche » se déclare (non déclaré = raté), gardé dans la partie et à la sauvegarde', () => {
  const id = gameWith('gauche');
  const config = cfg();
  const base = { id, config, defis: 'souvent', defiSet: 2, darts: ds('S1 S1 S1  S20 S5 S1') };
  const s = computeState(config, base.darts);
  assert.deepEqual(defiResult(base, s, 1), { key: 'gauche', player: 1, ok: false, gage: 'verre', declare: true, declared: undefined });
  assert.deepEqual(defiResult({ ...base, defiDecl: { 1: true } }, s, 1), { key: 'gauche', player: 1, ok: true, gage: null, declare: true, declared: true });
  assert.equal(defiResult({ ...base, defiDecl: { 1: false } }, s, 1).ok, false);
  assert.equal(gameDefis({ ...base, defiDecl: { 1: true } }, s).find(d => d.index === 1).ok, true);
  // Enregistrement : champs facultatifs gardés propres (aucune migration).
  const rec = withDrinks({ ...base, defiDecl: { 1: true, 2: 'oui', x: false } }, {});
  assert.deepEqual([rec.defiSet, rec.defiDecl], [2, { 1: true }]);
  assert.ok(!('defiSet' in withDrinks({ defis: 'souvent' }, {})) && !('defiDecl' in withDrinks({}, {})));
  assert.equal(cleanDecl([true]), null);
});

test('défis dans le tableau : étoile pleine si réussi, vide si raté, texte court', () => {
  const id = gameWith('triple');
  const config = cfg();
  const g = { id, config, defis: 'souvent', defiSet: 2, darts: ds('S1 S1 S1  T5 S1 S1') };
  const s = computeState(config, g.darts);
  const d = gameDefis(g, s).find(x => x.index === 1);
  const defis = new Map([[1, { short: DEFIS[d.key].short, text: DEFIS[d.key].text, ok: d.ok }]]);
  const t = legTable(s, 1, { defis });
  const cell = t.rows[0].cells[1];
  assert.equal(cell.defi.ok, true);
  const html = cellHtml(cell);
  assert.match(html, /class="df ok"/); assert.match(html, /fill="currentColor"/); assert.match(html, /UN TRIPLE/);
  assert.match(html, /défi un triple, sinon un verre : réussi/);
  const ko = cellHtml({ ...cell, defi: { ...cell.defi, ok: false } });
  assert.match(ko, /class="df ko"/); assert.ok(!/fill="currentColor"/.test(ko));
  assert.equal(t.rows[0].cells[0].defi, null, 'volée sans défi');
});

test('roi des uns : deux 1 simples, un double 1 ou un triple 1, sous 20 ; passe avant la série', () => {
  assert.ok(kingOfOnes(v('S1 S1 S5'))); assert.ok(kingOfOnes(v('D1 S5 0'))); assert.ok(kingOfOnes(v('T1 0 0')));
  assert.ok(!kingOfOnes(v('S1 S5 S5')), 'un seul 1 simple'); assert.ok(!kingOfOnes(v('S1 S1 S20')), '22 points');
  assert.ok(!kingOfOnes(v('S1 S1 S5', { bust: true, scored: 0 })));
  const config = cfg(['A', 'B']);
  const st = darts => computeState(config, ds(darts));
  assert.deepEqual(flop(st('S1 S1 S5')), { kind: 'uns', value: 7 });
  // A : deux mauvaises volées, puis une 3e avec deux 1 : le roi des uns l'emporte sur la série.
  assert.deepEqual(flop(st('S5 S5 S5  T20 T20 T20  S2 S2 S2  T20 T20 T20  S1 S1 S2')), { kind: 'uns', value: 4 });
  // Près de la fin (reste sous 60), rien.
  assert.equal(flop(computeState(cfg(['A', 'B'], { startScore: 301 }), ds('T20 T20 T20  S1 S1 S1  T20 S1 S5  S1 S1 S1  S1 S1 S5'))), null);
  assert.ok(FLOP_LINES.uns.length >= 3 && FLOP_LINES.moto.length >= 3);
  assert.match(FLOP_LINES.uns[0]('Bob', 7), /roi des uns/i);
});

test('HPV : les neuf répliques du 20/11', () => {
  for (const line of ['Triple 5, on s\'en bat les couilles.', 'J\'suis d\'vant, j\'vous laisse le temps.', 'Eh doucement les gonzesses.',
    'On en reparle en réunion.', 'Ça, c\'est pas dans mes objectifs.', 'Je valide, mais je m\'en fous.', 'Je mets ça dans le compte rendu.',
    'J\'ai un call à 15 heures, dépêchez.', 'C\'est pas un sujet.']) assert.ok(TIE_LINES.includes(line), line);
});

test('badges à rangs : cumulés sur toutes les parties, rang gagné à la volée qui franchit le seuil', () => {
  assert.deepEqual(tierCounts(v('S1 D1 T20')), { uns: 2, sniper: 0, fermier: 1, notaire: 0, feu: 0, deco: 0, plus: 0 });
  assert.deepEqual(tierCounts(v('T20 T20 T20')).feu, 1);
  assert.deepEqual(tierCounts(v('S25 D25 0')).sniper, 2);
  assert.equal(tierCounts(v('0 0 0')).deco, 3);
  assert.equal(tierCounts(v('S20 D10', { bust: true, scored: 0 })).plus, 1);
  assert.equal(tierCounts(v('S1 D10'), true).notaire, 1);
  assert.equal(tierCounts(v('S1 S10'), true).notaire, 0, 'gagné sans double (sortie simple)');
  const day = Date.UTC(2026, 9, 3, 20);
  // 20 parties de 501 : A met 3 triples 20 par volée (180) ; on compte les rangs du Fermier du 60 et du Feu d'Artifice.
  const games = [];
  for (let i = 0; i < 20; i++) {
    games.push({ id: `g${i}`, startedAt: day + i * 3600e3, config: cfg(['A', 'B']), darts: ds('T20 T20 T20  S1 S1 S1  T20 T20 T20  S1 S1 S1  T20 T19 D12') });
  }
  const h = honours(games, Date.UTC(2026, 9, 20));
  const a = playerBadges(h, 'A').find(b => b.key === 'fermier');
  assert.equal(a.total, 20 * 7, '7 triples 20 par partie');
  assert.equal(a.tier, 1, 'bronze à 50 (argent à 200)');
  assert.equal(a.next, 200);
  // Le rang bronze tombe à la 8e partie (7 × 7 = 49, puis 56) : 1re volée (rang 0) de g7.
  assert.deepEqual(badgeWhere(h, 'A', 'fermier'), { tier: 1, at: day + 7 * 3600e3, gameId: 'g7', visit: 0 });
  const feu = playerBadges(h, 'A').find(b => b.key === 'feu');
  assert.equal(feu.total, 40); assert.equal(feu.tier, 3, 'or à 20 volées à 180');
  assert.deepEqual(h.byPlayer.A.feu.tiers.map(t => [t.tier, t.gameId, t.visit]), [[1, 'g0', 0], [2, 'g2', 0], [3, 'g9', 2]]);
  assert.deepEqual(badgesOfGame(h, 'g9').filter(x => x.key === 'feu'), [{ id: 'A', key: 'feu', name: 'Le Feu d\'Artifice · or', tier: 3, visit: 2 }]);
  assert.ok(playerBadges(h, 'A').find(b => b.key === 'notaire').total === 20, 'gagné sur D12 à chaque partie');
  const uns = playerBadges(h, 'B').find(b => b.key === 'uns');
  assert.equal(uns.total, 120); assert.equal(uns.tier, 1);
  assert.equal(BADGES.filter(b => b.tiers).length, 7);
  // Badges simples : la volée qui les fait gagner.
  assert.equal(h.byPlayer.A.max.visit, 0, 'premier 180 à la 1re volée');
  assert.equal(h.byPlayer.A.win1.visit, 4, 'première victoire : la volée de la finition');
  assert.equal(h.byPlayer.A.clean.visit, null, 'sans raté : toute la partie');
  const ev = h.events.find(e => e.kind === 'badge' && e.key === 'feu' && e.tier === 3);
  assert.equal(ev.label, 'Le Feu d\'Artifice · or');
});

test('soirée : « le plus de 1 » parmi les faits marquants', () => {
  const g = { id: 's', startedAt: Date.UTC(2026, 10, 20, 20), soiree: 'x', config: cfg(['A', 'B']), darts: ds('S1 S1 S1  T20 T20 T20  D1 S1 S5') };
  const m = soireeModel([g]);
  const hl = m.highlights.find(h => h.key === 'ones');
  assert.deepEqual([hl.id, hl.value, hl.label], ['A', '5', 'Le plus de 1']);
  assert.equal(m.rows.find(r => r.id === 'B').ones, 0);
});

// ------------------------------------------------------------------ vraie appli
async function setup(viewport = { width: 410, height: 914 }) {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return { srv, browser, page, errors, close: async () => { await browser.close(); await srv.close(); } };
}

test('vraie appli : un seul appui sur VALIDER ferme la moquerie et valide ; moto d’Angelina ; pastilles de rang', { skip, timeout: 120e3 }, async () => {
  const t = await setup();
  const { page } = t;
  try {
    await openApp(page, t.srv.url);
    for (const n of ['Alpha', 'Angelina']) await createPlayer(page, n);
    await newGame(page, ['Alpha', 'Angelina'], { startScore: 501 });
    assert.equal(await page.locator('.rkp').count(), 0, 'tout le monde à égalité : pas de pastille');
    await throwDarts(page, 'T20 T20 S20');
    // Pastilles : Alpha 1er (reste 361), Angelina 2e, mises à jour à chaque fléchette.
    assert.equal(await page.locator('.gband .rkp').textContent(), '1');
    assert.equal(await page.locator('.others .rkp').textContent(), '2');
    await validate(page);
    assert.equal(await page.locator('.gband .rkp').textContent(), '2', 'Angelina lance, 2e');
    await throwDarts(page, 'S5 S3 S1'); // 9 points : la moto part dans le fossé
    assert.ok(await page.locator('.cele.nul-moto .moto-sc').count(), 'moto dans le fossé');
    assert.match(await page.locator('.cele small').first().textContent(), /FOSSÉ/);
    const before = (await readDb(page)).current.validated;
    await page.click('.validate.go'); // un seul appui
    await page.waitForSelector('.cele', { state: 'detached' });
    await settle(page);
    assert.ok((await readDb(page)).current.validated > before, 'la volée est validée du même appui');
    assert.equal(await page.locator('.gband .nm').textContent(), 'Alpha', 'au suivant');
    // Atila : deux 1 pour Alpha (sous 20) ; un appui ailleurs ferme seulement le bandeau.
    await throwDarts(page, 'S1 S1 S5');
    assert.ok(await page.locator('.cele.nul-uns').count(), 'Atila, le roi des uns');
    await page.mouse.click(4, 450);
    await page.waitForSelector('.cele', { state: 'detached' });
    assert.ok(await page.locator('.validate.go').count(), 'appui ailleurs : la volée attend toujours VALIDER');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('vraie appli : bandeau du défi pendant toute la volée, reste visible, résultat ; Tsia : voyelles sur l’écran de jeu seulement', { skip, timeout: 120e3 }, async () => {
  const t = await setup();
  const { page } = t;
  try {
    await page.goto(`${t.srv.url}?maquette#/sommaire`);
    await page.waitForFunction(() => window.__strela);
    // Volée 2 de « defi30 » : « le 20 trois fois ou une pinte », dès avant la 1re fléchette, avec le reste dessous.
    await page.evaluate(() => window.__strela.scene('jeu-defi'));
    await page.waitForSelector('.dfb.open');
    assert.match(await page.locator('.dfb .dft').textContent(), /LE 20 TROIS FOIS OU UNE PINTE/);
    assert.ok(await page.locator('#remaining').isVisible(), 'le reste du joueur se voit dès le début');
    assert.ok(parseFloat(await page.locator('.dfb .dft').evaluate(e => getComputedStyle(e).fontSize)) >= 16, 'texte en grand');
    await page.click('[data-key="20"]');
    assert.ok(await page.locator('.dfb.open').count(), 'toujours là après la 1re fléchette');
    await page.click('[data-key="20"]'); await page.click('[data-key="1"]');
    await page.waitForSelector('.dfb.res.ko');
    assert.match(await page.locator('.dfb').textContent(), /DÉFI RATÉ/);
    await page.click('.dfb .dfg');
    assert.match(await page.locator('.dfb').textContent(), /NOTÉ/);
    // Tableau de la partie : l'étoile vide de la volée ratée.
    await page.evaluate(() => window.__strela.scene('jeu-defi-histo'));
    await page.waitForSelector('.lt .df');
    assert.ok(await page.locator('.lt .df.ko').count() >= 1);

    // Tsia : défi sans voyelles, DÉGRISEMENT EXPRESS les rend au texte du défi ; le menu pause garde les siennes.
    await page.evaluate(() => window.__strela.scene('jeu-defi-tsia'));
    await page.waitForSelector('.dfb .kombu');
    const dft = () => page.locator('.dfb .dft').evaluate(e => { const c = e.cloneNode(true); c.querySelectorAll('.vgone').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
    await page.waitForFunction(() => !document.querySelector('.dfb .dft .vw:not(.vgone)'), null, { timeout: 5000 });
    assert.ok(!/[AEIOUY]/.test(await dft()), `défi sans voyelles : ${await dft()}`);
    assert.match(await page.locator('.dfb .kombu').textContent(), /DÉGRISEMENT EXPRESS/, 'le bouton garde ses voyelles');
    await page.click('.dfb .kombu');
    assert.match(await dft(), /UN TRIPLE, SINON UN VERRE/, 'voyelles revenues dans le défi');
    assert.ok(await page.locator('.gband .vw.vgone').count() > 0, 'le reste de l’écran reste sans voyelles');
    await page.click('[data-act="pause"]');
    await page.waitForSelector('.sheet-bg');
    assert.equal(await page.locator('.sheet-bg .vw').count(), 0, 'menu pause : voyelles intactes');
    assert.match(await page.locator('.sheet-bg').textContent(), /REPRENDRE/);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('vraie appli : un badge ouvre sa fenêtre (signification, partie, volée), VOIR LA PARTIE ouvre la volée', { skip, timeout: 120e3 }, async () => {
  const t = await setup();
  const { page } = t;
  try {
    await page.goto(`${t.srv.url}?maquette#/sommaire`);
    await page.waitForFunction(() => window.__strela);
    await page.evaluate(() => window.__strela.scene('v78-honneur-badges'));
    await page.waitForSelector('.hlist li.badge button');
    await page.click('.hlist li.badge button >> nth=0');
    await page.waitForSelector('.bsheet');
    assert.match(await page.locator('.bsheet .bmean').textContent(), /\./, 'signification');
    assert.ok(await page.locator('.bsheet .bkv').count(), 'partie et volée');
    assert.equal(page.url().endsWith('#/honneur'), true, 'on reste au tableau d’honneur');
    const see = page.locator('.bsheet [data-act="badge-game"]');
    if (await see.count()) {
      const arg = await see.getAttribute('data-arg');
      await see.click();
      await page.waitForSelector('.lt');
      assert.ok(page.url().includes(`#/partie/${arg.split('|')[0]}`));
      if (arg.split('|')[1]) assert.ok(await page.locator('.lt td.c.sel').count(), 'la volée est ouverte');
      assert.equal(await page.locator('.bsheet').count(), 0, 'fenêtre fermée en changeant d’écran');
    }
    // Vitrine des stats : une tuile ouvre la même fenêtre ; le retour d'Android la ferme.
    await page.evaluate(() => window.__strela.scene('v78-stats-vitrine'));
    if (!(await page.locator('.badges li button').count())) await page.click('[data-act="v2-fold"][data-arg="badges"]'); // 0.11.1 : repliés
    await page.click('.badges li button >> nth=0');
    await page.waitForSelector('.bsheet');
    await page.evaluate(() => window.strelaBack && window.strelaBack());
    await page.waitForSelector('.bsheet', { state: 'detached' });
    // Tableau de bord d'une soirée : badges de la soirée, joueur par joueur.
    await page.evaluate(() => window.__strela.scene('v78-soiree-dash'));
    await page.waitForSelector('.screen.dash2');
    assert.ok(await page.locator('.dash2 .bgroup, .dash2 .note').count(), 'badges de la soirée en liste (0.11.1)');
    assert.equal(await page.locator('.dash2 .dtable').count(), 0, 'plus aucun tableau qui défile de côté');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});
