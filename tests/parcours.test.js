// Parcours complets dans la vraie appli (base du téléphone ouverte, lot 2), navigateur sans écran (Playwright, sauté
// s'il est absent) : premiers joueurs, partie avec rechargement de la page en plein jeu (milieu de volée, volée en
// attente, juste après un bust, après ANNULER, fin de manche : l'état retrouvé est chaque fois identique), REPRENDRE
// depuis l'accueil, abandon ; partie de 501 à 2 joueurs jouée jusqu'au bout et retrouvée à l'identique dans
// l'historique, REVANCHE ; suppression d'un joueur ; écran allumé pendant la partie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, reload, readDb, settle, snapshot, throwDarts, validate, undo, createPlayer, newGame } from '../tools/lib/app.mjs';
import { computeState } from '../src/engine/x01.js';
import { legTable, cellView } from '../src/ui/table.js';
import { ds } from './helpers.js';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';
const VIEW = { viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' };

async function withPage(fn, { init = null } = {}) {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext(VIEW);
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await fn(page, srv.url);
    assert.deepEqual(errors, [], 'aucune erreur JS');
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
}

test('partie rechargée en plein jeu : état retrouvé à l’identique, REPRENDRE, abandon', { skip, timeout: 120e3 }, () => withPage(async (page, url) => {
  await openApp(page, url);
  assert.ok(await page.locator('.welcome').count(), 'premier lancement : invitation à créer les joueurs');
  await page.click('.welcome a');
  await page.waitForSelector('#name');
  await createPlayer(page, 'Alpha', { icon: 'renard', color: 0 });
  await createPlayer(page, 'Bravo', { color: 3 });
  let db = await readDb(page);
  assert.deepEqual(db.players.map(p => p.name).sort(), ['Alpha', 'Bravo']);
  assert.deepEqual(db.players.find(p => p.name === 'Alpha').avatar, { kind: 'icon', icon: 'renard', color: 0 });

  await newGame(page, ['Alpha', 'Bravo'], { legsToWin: 2 });
  const same = async label => {
    const before = await snapshot(page);
    const dbBefore = (await (settle(page).then(() => readDb(page)))).current;
    await reload(page);
    const after = await snapshot(page);
    assert.deepEqual(after, before, `${label} : écran identique après rechargement`);
    assert.deepEqual((await readDb(page)).current, dbBefore, `${label} : partie en cours intacte`);
    return after;
  };

  await throwDarts(page, 'T20 T20');
  let s = await same('milieu de volée');
  assert.deepEqual(s.darts, ['T20', 'T20', '']);
  assert.equal(s.remaining, '381');

  await throwDarts(page, 'T20');
  s = await same('volée en attente de validation');
  assert.ok(s.validate, 'VALIDER toujours proposé');
  assert.equal(s.player, 'Alpha');
  await validate(page);

  await throwDarts(page, '20 20');
  await undo(page);
  s = await same('après ANNULER');
  assert.equal(s.player, 'Bravo');
  assert.deepEqual(s.darts, ['20', '', '']);
  await throwDarts(page, '20 20');
  await validate(page);
  await throwDarts(page, 'T20 T20 T20');
  await validate(page);
  await throwDarts(page, '1 1 1');
  await validate(page);

  await throwDarts(page, 'T20 T20 T20'); // reste 141 : 81, 21, puis bust
  s = await same('juste après un bust');
  assert.ok(s.bust && s.validate, 'bust en attente de validation');
  await validate(page);
  await throwDarts(page, '1 1 1');
  await validate(page);

  await throwDarts(page, 'T20 T19 D12'); // 141 : manche gagnée
  await page.waitForSelector('[data-act="next-leg"]');
  const legEnd = await same('fin de manche');
  assert.equal(legEnd.hash, '#/manche');

  // L'appli rouverte sur l'accueil (comme depuis l'écran d'accueil d'Android) : REPRENDRE ramène à la fin de manche.
  await openApp(page, url);
  const resume = page.locator('a.resume');
  assert.equal(await resume.getAttribute('href'), '#/manche');
  await resume.click();
  await page.waitForSelector('[data-act="next-leg"]');
  assert.deepEqual(await snapshot(page), legEnd, 'REPRENDRE : même fin de manche');

  await page.click('[data-act="next-leg"]');
  await page.waitForSelector('.game');
  s = await same('début de la manche 2');
  assert.equal(s.hash, '#/jeu', 'la fin de manche validée ne revient pas');
  assert.equal(s.player, 'Bravo', 'manche 2 : le premier lanceur a tourné');

  // Abandon : partie rangée « abandonnée », fléchettes gardées, aucune victoire.
  await throwDarts(page, 'T20');
  await page.click('[data-act="pause"]');
  await page.click('[data-act="abandon"]');
  await page.click('[data-act="abandon-yes"]');
  await page.waitForSelector('.home-main');
  await settle(page);
  db = await readDb(page);
  assert.equal(db.current, null);
  assert.equal(db.games.length, 1);
  const g = db.games[0];
  assert.equal(g.abandoned, true);
  assert.equal(g.darts.length, 7 * 3 + 1, 'les 7 volées de la manche 1 et la fléchette de la manche 2');
  assert.ok(g.endedAt >= g.startedAt);
  await page.evaluate(() => { location.hash = '#/historique'; });
  assert.match(await page.innerText('.list'), /ABANDONNÉE/);
  await page.evaluate(() => { location.hash = '#/joueurs'; });
  const row = await page.innerText('.list a:has(.nm:text-is("Alpha"))');
  assert.match(row, /moyenne \d+,\d/, 'les fléchettes d’une partie abandonnée comptent dans la moyenne');
  assert.match(row, /1\spartie\W+0\svictoire/, `aucune victoire (${row})`);
}));

test('501 à 2 joueurs de bout en bout, retrouvée à l’identique dans l’historique ; REVANCHE', { skip, timeout: 120e3 }, () => withPage(async (page, url) => {
  await openApp(page, url);
  await createPlayer(page, 'Alpha');
  await createPlayer(page, 'Bravo');
  await newGame(page, ['Alpha', 'Bravo']);
  const visits = ['T20 T20 T20', '20 20 20', 'T20 T20 T20', '0 5 1', 'T20 T19 D12'];
  for (const [i, v] of visits.entries()) {
    await throwDarts(page, v);
    if (i < visits.length - 1) await validate(page);
  }
  await page.waitForSelector('[data-act="rematch"]');
  const end = await snapshot(page);
  assert.equal(end.hash, '#/fin');
  await reload(page);
  assert.deepEqual(await snapshot(page), end, 'fin de partie retrouvée après rechargement');

  const notation = visits.join(' ');
  let db = await readDb(page);
  assert.deepEqual(db.current.darts, ds(notation), 'fléchettes enregistrées une à une');

  // REVANCHE : la partie terminée va dans l'historique, la nouvelle commence par le joueur suivant.
  await page.click('[data-act="rematch"]');
  await page.waitForSelector('.game');
  assert.equal((await snapshot(page)).player, 'Bravo');
  await settle(page);
  db = await readDb(page);
  const ids = Object.fromEntries(db.players.map(p => [p.name, p.id]));
  assert.equal(db.games.length, 1);
  const g = db.games[0];
  assert.deepEqual(g.config, { startScore: 501, outMode: 'double', legsToWin: 1, players: [ids.Alpha, ids.Bravo] });
  assert.deepEqual(g.darts, ds(notation));
  assert.equal(g.abandoned, false);
  assert.deepEqual(db.current.config.players, [ids.Bravo, ids.Alpha]);
  assert.deepEqual(db.settings.lastSetup, { players: [ids.Bravo, ids.Alpha], startScore: 501, outMode: 'double', legsToWin: 1 });

  // Historique : la partie, son vainqueur, et chaque case du tableau tour par tour.
  await page.click('[data-act="pause"]');
  await page.click('.sheet a[href="#/"]');
  await page.waitForSelector('a.resume');
  await page.evaluate(() => { location.hash = '#/historique'; });
  await page.waitForSelector('.gitem');
  assert.match(await page.innerText('.gitem'), /VAINQUEUR\s+ALPHA/i);
  await page.click('.gitem');
  await page.waitForSelector('.lt');
  const state = computeState(g.config, g.darts);
  const want = legTable(state, 1).rows.flatMap(r => r.cells.filter(Boolean).map(c => cellView(c).label));
  const got = await page.$$eval('.lt td.c:not(.none)', tds => tds.map(td => td.getAttribute('aria-label')));
  assert.deepEqual(got, want);
  assert.ok(got.at(-1).includes('manche gagnée'));
  await reload(page);
  assert.deepEqual(await page.$$eval('.lt td.c:not(.none)', tds => tds.map(td => td.getAttribute('aria-label'))), want, 'toujours là après rechargement');
}));

test('joueurs : archiver, réactiver depuis la liste, supprimer (refusé pendant la partie, puis en une transaction)', { skip, timeout: 120e3 }, () => withPage(async (page, url) => {
  await openApp(page, url);
  await createPlayer(page, 'Alpha');
  await createPlayer(page, 'Test');
  await newGame(page, ['Alpha', 'Test']);
  await throwDarts(page, '20 20 20');
  await validate(page);
  await settle(page);
  let db = await readDb(page);
  const testId = db.players.find(p => p.name === 'Test').id;

  // Joueur de la partie en cours : suppression refusée.
  await page.evaluate(id => { location.hash = `#/joueur/${id}`; }, testId);
  await page.click('[data-act="delete"]');
  assert.match(await page.innerText('.confirm'), /SUPPRESSION IMPOSSIBLE/);

  // Partie abandonnée, puis archivage et réactivation depuis la liste.
  await page.evaluate(() => { location.hash = '#/jeu'; });
  await page.click('[data-act="pause"]');
  await page.click('[data-act="abandon"]');
  await page.click('[data-act="abandon-yes"]');
  await page.evaluate(id => { location.hash = `#/joueur/${id}`; }, testId);
  await page.click('[data-act="archive"]');
  await page.click('[data-act="archive-yes"]');
  await page.waitForSelector('.arow');
  await settle(page);
  assert.equal((await readDb(page)).players.find(p => p.id === testId).archived, true);
  await page.click('.arow [data-act="unarchive-row"]');
  await settle(page);
  assert.equal((await readDb(page)).players.find(p => p.id === testId).archived, false);
  assert.equal(await page.locator('.arow').count(), 0);

  // Suppression : fiche retirée, partie gardée et anonymisée.
  await page.evaluate(id => { location.hash = `#/joueur/${id}`; }, testId);
  await page.click('[data-act="delete"]');
  await page.click('[data-act="delete-yes"]');
  await page.waitForSelector('.list');
  await reload(page);
  db = await readDb(page);
  assert.deepEqual(db.players.map(p => p.name), ['Alpha']);
  assert.equal(db.games.length, 1);
  assert.deepEqual(db.games[0].config.players, [db.players[0].id, '~1']);
  assert.ok(!db.settings.lastSetup.players.includes(testId));
}));

test('écran allumé pendant la partie : repris au retour dans l’appli, relâché en quittant le jeu', { skip, timeout: 60e3 }, () => withPage(async (page, url) => {
  await openApp(page, url);
  await createPlayer(page, 'Solo');
  await newGame(page, ['Solo']);
  const locks = () => page.evaluate(() => window.__locks.slice());
  await page.waitForFunction(() => window.__locks.includes('on'));
  // L'appli passe en arrière-plan : Android lâche le verrou ; au retour, il est repris.
  await page.evaluate(() => { window.__sentinel.release(); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => window.__locks.filter(l => l === 'on').length === 2);
  await page.click('[data-act="pause"]');
  await page.click('.sheet a[href="#/"]');
  await page.waitForFunction(() => window.__locks.at(-1) === 'off');
  assert.deepEqual(await locks(), ['on', 'off', 'on', 'off']);
}, {
  // Verrou d'écran simulé (Chromium sans écran n'en accorde pas) : on compte les prises et les relâchements.
  init: () => {
    window.__locks = [];
    const wl = {
      async request() {
        window.__locks.push('on');
        const listeners = [];
        const s = { released: false, addEventListener: (t, f) => listeners.push(f), async release() { if (s.released) return; s.released = true; window.__locks.push('off'); listeners.forEach(f => f()); } };
        window.__sentinel = s;
        return s;
      },
    };
    Object.defineProperty(navigator, 'wakeLock', { value: wl, configurable: true });
  },
}));
