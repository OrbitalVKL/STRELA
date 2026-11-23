// Entraînement solo (lot 8) dans la vraie appli (Playwright, sauté s'il est absent) :
// - migration réelle de la base v2 → v3 : joueurs, parties et réglages intacts, deux magasins nouveaux, jeux de Guillaume ;
// - séance coachée au pavé (simple intérieur / extérieur, triple, hors cible, ANNULER), rechargement en pleine séance,
//   fin, analyse, TERMINER, stats ; séance libre à la cible en paysage (position gardée, hors cible sur la couronne) ;
// - un jeu de fléchettes créé dans l'armurerie, puis choisi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, reload, readDb, settle, createPlayer } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

// Lot 8 du 23/11 : au pavé, le nombre puis sa zone (simple intérieur si rien n'est demandé avant, comme `zone`).
let armed = null;
const zone = async (page, z) => { armed = z; };
async function key(page, k) {
  await page.click(`[data-act="tr-key"][data-arg="${k}"]`);
  const n = Number(k);
  if (n >= 1 && n <= 20) await page.click(`[data-act="tr-zonepick"][data-arg="${armed || 'in'}"]`);
  armed = null;
}
const current = async page => (await readDb(page)).trainings.find(r => r.endedAt === null) || null;

test('base : migration réelle v2 → v3 (lot 8), rien ne change, entraînement et jeux de Guillaume ajoutés', { skip, timeout: 60e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${srv.url}?maquette#/sommaire`);
    await page.waitForFunction(() => window.__strela);
    const r = await page.evaluate(async () => {
      const m = await import('/src/data/db.js');
      await m.deleteDb('t-v3');
      const v2 = await m.openDb({ name: 't-v3', migrations: m.MIGRATIONS.slice(0, 2) });
      await v2.write([
        { store: 'players', put: { id: 'a', name: 'Alpha', avatar: { kind: 'photo', photo: 'data:image/jpeg;base64,AAAA', color: 1 }, archived: false, checkout: { double: 16, avoidBull: true } } },
        { store: 'games', put: { id: 'g', startedAt: 5, endedAt: null, config: { startScore: 301, outMode: 'double', legsToWin: 1, players: ['a'] }, darts: [{ segment: 20, multiplier: 3, pos: [0, -0.57] }], validated: 1, abandoned: false, drinks: { a: [{ t: 4, at: 0 }] } } },
        { store: 'games', put: { id: 'h', startedAt: 1, endedAt: 2, config: { game: 'cricket', players: ['a'], mode: 'sans', legsToWin: 1 }, darts: [], validated: 0, abandoned: true } },
        { store: 'settings', key: 'display', put: { theme: 'light', sound: false } },
        { store: 'settings', key: 'soiree', put: { id: 's', startedAt: 3, players: ['a'], drinks: {} } },
      ]);
      const before = await v2.loadAll();
      v2.close();
      const v3 = await m.openDb({ name: 't-v3' });
      const after = await v3.loadAll();
      // Une séance s'écrit et se relit.
      await v3.write([{ store: 'trainings', put: { id: 't', startedAt: 9, endedAt: null, player: 'a', setId: null, mode: 'coach', exercise: 'groupement', darts: [] } }]);
      const again = await v3.loadAll();
      v3.close();
      return { version: v3.version, before, after, again };
    });
    assert.equal(r.version, 3);
    for (const k of ['players', 'games', 'current', 'settings']) assert.deepEqual(r.after[k], r.before[k], `${k} intacts`);
    assert.deepEqual(r.before.dartSets, [], 'pas de jeux en v2');
    assert.deepEqual(r.after.dartSets.map(x => x.id).sort(), ['ds-droit-22', 'ds-torpedo-22']);
    assert.deepEqual(r.after.trainings, []);
    assert.equal(r.again.training.id, 't');
    await page.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});

test('séance coachée au pavé : intérieur / extérieur, hors cible, ANNULER, rechargement, analyse, stats', { skip, timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Alpha', { color: 0 });
    // Accueil : le bouton Entraînement, à côté de la partie et de la soirée.
    await page.evaluate(() => { location.hash = '#/'; });
    await page.click('a.tr-btn');
    await page.waitForSelector('.trhub');
    assert.equal(await page.locator('[data-act="tr-set"][data-arg="ds-torpedo-22"]').count(), 1, 'jeux de Guillaume proposés');
    await page.click('[data-act="tr-set"][data-arg="ds-droit-22"]');
    // Coach : on commence par le groupement.
    assert.match(await page.innerText('.propose b'), /Groupement/);
    await page.click('.propose + .btn[data-act="tr-start"]');
    await page.waitForSelector('.game.train');
    assert.match(await page.innerText('.taim .tg'), /^20$/);
    await key(page, '20');           // simple intérieur (par défaut)
    await zone(page, 'out'); await key(page, '20'); // simple extérieur
    await zone(page, 't'); await key(page, '20');   // triple
    await key(page, '0');            // hors cible
    await key(page, '5');
    await page.click('[data-act="tr-undo"]'); // retire le 5
    await settle(page);
    let cur = await current(page);
    assert.deepEqual(cur.darts, [{ segment: 20, multiplier: 1, ring: 'in' }, { segment: 20, multiplier: 1, ring: 'out' }, { segment: 20, multiplier: 3 }, { segment: 0, multiplier: 1 }]);
    assert.equal(cur.setId, 'ds-droit-22');
    assert.equal(cur.exercise, 'groupement');
    assert.match(await page.innerText('.tlive'), /3\/4/);
    // Fermeture brutale : la séance reprend à l'identique.
    await reload(page);
    await page.waitForSelector('.game.train'); // rouverte à l'écran de saisie
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('a.tr-btn.on'); // ENTRAÎNEMENT EN COURS à l'accueil
    await page.click('a.tr-btn');
    await page.click('a.tr-resume');
    await page.waitForSelector('.game.train');
    assert.match(await page.innerText('.taim .tp'), /2\/3\s+VOLÉE/, 'volée 2 sur 3 (lot 8 du 23/11)');
    for (const k of ['5', '5', '1', '20']) await key(page, k);
    await zone(page, 'out'); await key(page, '5');
    await page.waitForSelector('.trend');
    assert.equal(await page.locator('.kpi[data-k="value"]').count(), 1);
    assert.ok(await page.locator('.coach li').count() >= 2, 'messages du coach');
    await page.click('[data-act="tr-finish"]');
    await page.waitForSelector('.trhub');
    await settle(page);
    const db = await readDb(page);
    assert.equal(db.trainings.length, 1);
    const t = db.trainings[0];
    assert.ok(Number.isFinite(t.endedAt));
    assert.equal(t.darts.length, 9);
    assert.equal(t.stopped, undefined, 'séance complète');
    assert.equal(db.current, null, 'aucune partie créée');
    // La séance est dans les stats d'entraînement et en tête des dernières séances.
    assert.equal(await page.locator('.trl .trow').count(), 1);
    await page.click('.tile2[href="#/entrainement/stats"]');
    await page.waitForSelector('.trstats .kpi[data-k="rate"]');
    assert.match(await page.innerText('.kpi[data-k="rate"]'), /44 %/);
    // Filtre « parties » : aucune partie, écran vide avec une action.
    await page.click('[data-act="ts-source"][data-arg="parties"]');
    await page.waitForSelector('.trstats .empty');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});

test('séance libre à la cible (paysage) : position gardée, anneau déduit, hors cible posé à côté de la cible ; armurerie', { skip, timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 914, height: 410 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Bravo', { color: 2 });
    // Armurerie : nouveau jeu d'après un modèle, renommé.
    await page.evaluate(() => { location.hash = '#/armurerie/nouveau/fusele-20'; });
    await page.waitForSelector('#dsname');
    await page.fill('#dsname', 'Mes 20 g');
    await page.click('[data-act="ds-pick"][data-arg="point|souple"]');
    await page.click('[data-act="ds-save"]');
    await page.waitForSelector('.arsenal');
    await settle(page);
    const set = (await readDb(page)).dartSets.find(x => x.name === 'Mes 20 g');
    assert.equal(set.point, 'souple');
    assert.equal(set.shape, 'fusele');
    // Libre : T20, 3 fléchettes.
    await page.evaluate(() => { location.hash = '#/entrainement'; });
    await page.click(`[data-act="tr-set"][data-arg="${set.id}"]`);
    await page.click('[data-act="tr-mode"][data-arg="libre"]');
    await page.click('[data-act="tr-pick"][data-arg="setup|z|t"]');
    await page.click('.chips2 [data-act="tr-pick"][data-arg="setup|n|3"]');
    await page.click('[data-act="tr-start"][data-arg="libre"]');
    await page.waitForSelector('.game.land.train #tboard svg');
    const box = await page.locator('#tboard svg').boundingBox();
    const at = async (x, y) => { // repère de la cible (rayon 1 = bord du double ; 1,33 = bord de la zone autour, 23/11)
      const s = box.width / 2 / 1.33;
      await page.mouse.click(box.x + box.width / 2 + x * s, box.y + box.height / 2 + y * s);
    };
    await at(0, -0.575);  // T20
    await at(0.02, -0.75); // 20 extérieur
    await at(0.3, -1.25); // à côté de la cible, au-delà des numéros (zone autour, lot 8 du 23/11) : hors cible posé
    await page.waitForSelector('.trend');
    await settle(page);
    const t = (await readDb(page)).trainings.find(r => r.endedAt === null);
    assert.deepEqual(t.darts.map(d => [d.segment, d.multiplier, d.ring ?? null, Array.isArray(d.pos)]), [[20, 3, null, true], [20, 1, 'out', true], [0, 1, null, true]]);
    assert.ok(Math.hypot(...t.darts[2].pos) > 1.18, 'position gardée au-delà du dessin');
    assert.deepEqual(t.blocks, [{ s: 20, z: 't', n: 3 }]);
    assert.equal(t.setId, set.id);
    // ENCORE UNE SÉRIE : le 19 en simple intérieur, 2 fléchettes ; ANNULER retire d'abord la série vide.
    await page.click('[data-act="tr-add"]');
    await page.click('[data-act="tr-pick"][data-arg="add|s|19"]');
    await page.click('[data-act="tr-pick"][data-arg="add|z|si"]');
    await page.click('.chips2 [data-act="tr-pick"][data-arg="add|n|3"]');
    await page.click('[data-act="tr-add-go"]');
    await page.waitForSelector('.game.train');
    assert.match(await page.innerText('.taim .tg'), /19 INT\./);
    await page.click('[data-act="tr-undo"]');
    await page.waitForSelector('.trend');
    await settle(page);
    assert.equal((await readDb(page)).trainings.find(r => r.endedAt === null).blocks.length, 1);
    await page.click('[data-act="tr-finish"]');
    await page.waitForSelector('.trhub');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
