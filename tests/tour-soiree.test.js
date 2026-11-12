// Lot 7.6 : tirage au sort revu (REVANCHE), bande du tour, soirée (joueurs repris, verres cumulés d'une partie à
// l'autre), panneau des verres du bandeau. JS pur d'abord, puis la vraie appli (Playwright, sautée s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { computeState } from '../src/engine/x01.js';
import { drinksTimeline } from '../src/engine/alcohol.js';
import { currentRecord, closedRecord, soireeRecord } from '../src/data/db.js';
import { makeBackup, parseBackup } from '../src/data/backup.js';
import { cellView } from '../src/ui/table.js';
import { visitStanding, VISIT_RANK_MIN } from '../src/engine/ranking.js';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, throwDarts, validate, createPlayer, newGame, readDb, reload, settle, ack } from '../tools/lib/app.mjs';

const cfg = (players, startScore = 301, outMode = 'single') => ({ startScore, outMode, legsToWin: 1, players });

test('partie enregistrée : shuffled, soiree et drinksBefore facultatifs, gardés et nettoyés', () => {
  const g = { id: 'g', startedAt: 1, config: cfg(['a', 'b']), darts: [], validated: 0, shuffled: true, soiree: 's1', drinksBefore: { a: 2, b: 0, c: -1, d: 1.5 } };
  const rec = currentRecord(g);
  assert.equal(rec.shuffled, true);
  assert.equal(rec.soiree, 's1');
  assert.deepEqual(rec.drinksBefore, { a: 2 }, 'seulement des entiers positifs');
  const plain = closedRecord({ id: 'h', startedAt: 1, config: cfg(['a']), darts: [] }, false, 2);
  assert.ok(!('shuffled' in plain) && !('soiree' in plain) && !('drinksBefore' in plain), 'rien de plus sans eux');
  // La sauvegarde garde ces champs (aller-retour).
  const back = parseBackup(JSON.stringify(makeBackup({ players: [], games: [closedRecord(g, false, 5)], current: null, display: null, lastSetup: null })));
  assert.equal(back.games[0].soiree, 's1');
  assert.deepEqual(back.games[0].drinksBefore, { a: 2 });
});

test('soirée relue : joueurs sans doublon, verres nettoyés ; illisible = pas de soirée', () => {
  assert.deepEqual(soireeRecord({ id: 's', startedAt: 5, players: ['a', 'a', 'b', 3], drinks: { a: [{ t: 1 }, 'x'] } }),
    { id: 's', startedAt: 5, players: ['a', 'b'], drinks: { a: [{ t: 1 }] } });
  assert.equal(soireeRecord(null), null);
  assert.equal(soireeRecord({ id: 's', players: [] }), null);
});

test('historique : le cumul des verres part des verres de la soirée d’avant la partie', () => {
  const s = computeState(cfg(['a', 'b']), ds('T20 S20 S5  S1 S1 S1  T20 S20 S5'));
  const t = drinksTimeline(s, { a: [{ t: 1, at: 4 }] }, ['a', 'b'], { a: 2, b: 3 });
  assert.deepEqual(t.totals, [3, 3]);
  assert.deepEqual(t.byVisit.get(0), { here: 0, total: 2, player: 0 });
  assert.deepEqual(t.byVisit.get(2), { here: 1, total: 3, player: 0 });
  assert.deepEqual(t.byVisit.get(1), { here: 0, total: 3, player: 1 }, 'Bravo : rien bu pendant la partie, 3 avant');
  // Sans soirée : comme avant.
  assert.deepEqual(drinksTimeline(s, null, ['a', 'b']).totals, [0, 0]);
});

test('case à jouer encore vide : pas de cumul répété, sauf un verre pris juste avant', () => {
  const open = { darts: [], open: true, total: 0, remaining: 301, drinks: { here: 0, total: 2 } };
  assert.equal(cellView(open).drinks, null);
  assert.deepEqual(cellView({ ...open, drinks: { here: 1, total: 3 } }).drinks, { total: 3, fresh: true });
});

test('volée parmi les 3 meilleures ou les 3 pires (rang partagé à égalité)', () => {
  const others = [26, 67, 121, 180, 60, 121, 85, 79];
  assert.equal(others.length + 1, VISIT_RANK_MIN);
  assert.deepEqual(visitStanding(180, others), { kind: 'best', rank: 1 }, '180 à égalité : meilleure');
  assert.deepEqual(visitStanding(140, others), { kind: 'best', rank: 2 });
  assert.equal(visitStanding(100, others), null, 'derrière 180, 121, 121 : rien');
  assert.deepEqual(visitStanding(0, others), { kind: 'worst', rank: 1 }, 'un bust (0) : pire');
  assert.deepEqual(visitStanding(67, others), { kind: 'worst', rank: 3 }, 'au-dessus de 26 et 60');
  assert.equal(visitStanding(80, others), null);
  assert.equal(visitStanding(180, others.slice(1)), null, 'pas assez de volées');
  assert.equal(visitStanding(20, new Array(8).fill(20)), null, 'toutes pareilles : ni l’un ni l’autre');
});

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

async function setup(names = ['Alpha', 'Bravo', 'Charlie']) {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page, srv.url);
  for (const n of names) await createPlayer(page, n);
  const db = await readDb(page);
  const id = n => db.players.find(p => p.name === n).id;
  return { srv, browser, page, errors, id, close: async () => { await browser.close(); await srv.close(); } };
}

const strip = page => page.locator('.round .rd').evaluateAll(els => els.map(e => `${e.getAttribute('aria-label')}`));

test('bande du tour : TOUR n, qui a lancé ce tour-ci depuis le premier de la manche', { skip, timeout: 120e3 }, async () => {
  const t = await setup();
  const { page } = t;
  try {
    await newGame(page, ['Alpha', 'Bravo', 'Charlie'], { startScore: 501 });
    assert.match(await page.locator('.round .rt').innerText(), /TOUR 1/);
    assert.deepEqual(await strip(page), ['Alpha : lance', 'Bravo : à lancer', 'Charlie : à lancer']);
    await throwDarts(page, 'S1 S1 S1');
    await validate(page);
    assert.deepEqual(await strip(page), ['Alpha : a lancé', 'Bravo : lance', 'Charlie : à lancer']);
    assert.match(await page.locator('.round .rl').textContent(), /1/, 'encore un joueur ce tour-ci');
    await throwDarts(page, 'S1 S1 S1');
    await validate(page);
    assert.match(await page.locator('.round .rl').textContent(), /DERNIER|FIN/);
    await throwDarts(page, 'S1 S1 S1');
    await validate(page);
    assert.match(await page.locator('.round .rt').innerText(), /TOUR 2/);
    assert.deepEqual(await strip(page), ['Alpha : lance', 'Bravo : à lancer', 'Charlie : à lancer']);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('REVANCHE d’une partie tirée au sort : nouveau tirage', { skip, timeout: 120e3 }, async () => {
  const t = await setup(['Alpha', 'Bravo']);
  const { page } = t;
  try {
    await newGame(page, ['Alpha', 'Bravo'], { startScore: 301, shuffle: true });
    await settle(page);
    assert.equal((await readDb(page)).current.shuffled, true, 'tirage noté dans la partie');
    // 301 sortie double : 180, 180, puis T20 T11 D14 (60 + 33 + 28 = 121 → 0), quel que soit l'ordre tiré.
    await throwDarts(page, 'T20 T20 T20'); await validate(page);
    await throwDarts(page, 'T20 T20 T20'); await validate(page);
    await throwDarts(page, 'T20 T11 D14');
    await page.waitForSelector('[data-act="rematch"]');
    await ack(page);
    assert.match(await page.locator('[data-act="rematch"]').textContent(), /ORDRE TIRÉ AU SORT/);
    const orders = new Set();
    // À 2 joueurs, chaque tirage garde l'ordre une fois sur deux : on rejoue jusqu'à ce qu'il change (au plus 20 fois,
    // une chance sur 500 000 de ne jamais le voir changer).
    for (let k = 0; k < 20 && orders.size < 2; k++) {
      if (k) {
        await throwDarts(page, 'T20 T20 T20'); await validate(page);
        await throwDarts(page, 'T20 T20 T20'); await validate(page);
        await throwDarts(page, 'T20 T11 D14');
        await page.waitForSelector('[data-act="rematch"]');
        await ack(page);
      }
      await page.click('[data-act="rematch"]');
      await page.waitForSelector('.game');
      await settle(page);
      const cur = (await readDb(page)).current;
      assert.equal(cur.shuffled, true);
      orders.add(cur.config.players.join());
    }
    assert.ok(orders.size > 1, 'l’ordre change d’une revanche à l’autre');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('soirée : joueurs repris, verres cumulés d’une partie à l’autre, joueur ajouté en cours de soirée', { skip, timeout: 120e3 }, async () => {
  const t = await setup();
  const { page, id } = t;
  try {
    // Débuter la soirée avec Alpha et Bravo.
    await page.evaluate(() => { location.hash = '#/soiree'; });
    await page.waitForSelector('.screen');
    while (await page.locator('[data-act="soiree-unpick"]').count()) await page.click('[data-act="soiree-unpick"] >> nth=0');
    await page.click(`[data-act="soiree-pick"][data-arg="${id('Alpha')}"]`);
    await page.click(`[data-act="soiree-pick"][data-arg="${id('Bravo')}"]`);
    await page.click('[data-act="soiree-start"]');
    await settle(page);
    assert.deepEqual((await readDb(page)).settings.soiree.players, [id('Alpha'), id('Bravo')]);
    // Nouvelle partie : les joueurs de la soirée sont proposés d'office.
    await page.evaluate(() => { location.hash = '#/nouvelle'; });
    await page.waitForSelector('[data-act="launch"]');
    assert.deepEqual(await page.locator('.order .nm').allTextContents(), ['Alpha', 'Bravo']);
    await page.click(`[data-act="shuffle"][data-arg="non"]`);
    await page.click('[data-act="launch"]');
    await page.waitForSelector('.game');
    // Panneau des verres du bandeau, sans la pause : deux verres pour Alpha.
    await page.click('.round [data-act="drinks-open"]');
    for (let k = 0; k < 2; k++) await page.click(`[data-act="drink-plus"][data-arg="${id('Alpha')}"]`);
    assert.equal(await page.locator('[data-act="pause"]').count(), 1);
    assert.equal(await page.locator('.sheet h1').textContent(), 'Verres de la soirée');
    await page.click('.sheet [data-act="drinks-close"] >> nth=0');
    assert.equal((await page.locator('.rest .meta .dk').textContent()).trim(), 'x2');
    await throwDarts(page, 'S1 S1 S1');
    await validate(page);
    // Verre pris hors partie pour Bravo (écran Soirée, Bravo est dans la partie : noté dans la partie).
    await page.evaluate(() => { location.hash = '#/soiree'; });
    await page.waitForSelector('[data-act="soiree-plus"]');
    await page.click(`[data-act="soiree-plus"][data-arg="${id('Bravo')}"]`);
    // Partie suivante (la précédente est abandonnée) avec Charlie en plus : il rejoint la soirée.
    await page.evaluate(() => { location.hash = '#/nouvelle'; });
    await page.waitForSelector('[data-act="launch"]');
    await page.click(`.pool button[data-act="add"]:has(.nm:text-is("Charlie"))`);
    await page.click('[data-act="launch"]');
    await page.click('[data-act="launch-yes"]');
    await page.waitForSelector('.game');
    await settle(page);
    let db = await readDb(page);
    assert.deepEqual(db.settings.soiree.players, [id('Alpha'), id('Bravo'), id('Charlie')], 'Charlie rejoint la soirée');
    assert.deepEqual(db.current.drinksBefore, { [id('Alpha')]: 2, [id('Bravo')]: 1 }, 'verres d’avant la partie');
    assert.equal(db.current.soiree, db.settings.soiree.id);
    assert.equal((await page.locator('.rest .meta .dk').textContent()).trim(), 'x2', 'Alpha lance : x2 sans rien ressaisir');
    await page.click('.round [data-act="drinks-open"]');
    await page.click(`[data-act="drink-plus"][data-arg="${id('Alpha')}"]`);
    assert.equal((await page.locator(`.drinks li:has-text("Alpha") .cnt`).textContent()).trim(), 'x3');
    await page.click('.sheet [data-act="drinks-close"] >> nth=0');
    // Rechargement : soirée et cumul gardés.
    await reload(page);
    assert.equal((await page.locator('.rest .meta .dk').textContent()).trim(), 'x3');
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('.soiree-btn.on');
    assert.match(await page.locator('.soiree-btn').textContent(), /3\sJOUEURS · 4\sVERRES/);
    // Fin de soirée : la prochaine partie repart de zéro, les parties gardent leurs verres.
    await page.evaluate(() => { location.hash = '#/soiree'; });
    await page.waitForSelector('[data-act="soiree-end"]');
    await page.click('[data-act="soiree-end"]');
    await page.click('[data-act="soiree-end-yes"]');
    await settle(page);
    db = await readDb(page);
    assert.equal(db.settings.soiree, undefined, 'soirée terminée');
    assert.deepEqual(db.current.drinksBefore, { [id('Alpha')]: 2, [id('Bravo')]: 1 }, 'la partie garde son cumul');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});
