// Animations de tour (lot 7.4) : choix par joueur (fiche), défaut « voyelles » pour Tsia, champ facultatif gardé par la
// base et la sauvegarde sans migration ; dans la vraie appli (Playwright, sauté s'il est absent) : jouée au début de
// la volée du joueur, jamais pour les autres, non bloquante (on lance pendant), arrêtée à la première fléchette, une
// fois par volée, rien quand les animations sont coupées, choix gardé au rechargement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TURN_ANIMS, TURN_ANIM_KEYS, turnAnimOf, TIE_LINES, BEAR_SCENES, FX_KINDS } from '../src/ui/turnfx.js';
import { playerRecord, TURN_ANIM_VALUES } from '../src/data/db.js';
import { makeBackup, parseBackup } from '../src/data/backup.js';
import { ICONS } from '../src/ui/avatars.js';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, throwDarts, validate, createPlayer, newGame, readDb, reload, ack } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

test('choix : liste de la fiche = valeurs de la base ; pictogrammes connus ; cravate dans la banque', () => {
  assert.deepEqual([...TURN_ANIM_KEYS], [...TURN_ANIM_VALUES]);
  for (const a of TURN_ANIMS) if (a.icon) assert.ok(ICONS[a.icon], a.icon);
  assert.equal(ICONS.cravate[0], 'CRAVATE');
  assert.deepEqual([...FX_KINDS].sort(), ['carabine', 'cravate', 'etoile', 'ours', 'planete']);
  assert.equal(BEAR_SCENES.length, 5);
  assert.ok(TIE_LINES.length >= 10);
  for (const l of TIE_LINES) assert.ok(l.length <= 70, l);
});

test('animation d’un joueur : son choix, sinon voyelles pour Tsia, sinon aucune', () => {
  assert.equal(turnAnimOf({ name: 'Gilles', turnAnim: 'ours' }), 'ours');
  assert.equal(turnAnimOf({ name: 'Gilles' }), 'aucune');
  assert.equal(turnAnimOf({ name: 'Tsia' }), 'voyelles');
  assert.equal(turnAnimOf({ name: 'Tsia', turnAnim: 'aucune' }), 'aucune', 'un choix explicite l’emporte');
  assert.equal(turnAnimOf({ name: 'Tsia', turnAnim: 'carabine' }), 'carabine');
  assert.equal(turnAnimOf({ name: 'Bob', turnAnim: 'licorne' }), 'aucune', 'valeur inconnue ignorée');
  assert.equal(turnAnimOf(null), 'aucune');
});

test('base et sauvegarde : turnAnim gardé s’il est valable, absent sinon (aucune migration)', () => {
  const base = { id: 'a', name: 'A', avatar: { kind: 'icon', icon: 'ours', color: 3 } };
  assert.equal(playerRecord({ ...base, turnAnim: 'ours' }).turnAnim, 'ours');
  assert.equal(playerRecord({ ...base, turnAnim: 'aucune' }).turnAnim, 'aucune');
  assert.ok(!('turnAnim' in playerRecord(base)));
  assert.ok(!('turnAnim' in playerRecord({ ...base, turnAnim: 'licorne' })));
  const display = { theme: 'auto', night: false, vibrate: true, anim: true, sound: true, voice: true };
  const players = [{ ...base, turnAnim: 'etoile' }, { ...base, id: 'b', name: 'B' }];
  const back = parseBackup(JSON.stringify(makeBackup({ players, games: [], current: null, display, lastSetup: null })));
  assert.equal(back.players[0].turnAnim, 'etoile');
  assert.ok(!('turnAnim' in back.players[1]));
});

async function setup({ anim = true } = {}) {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true });
  if (!anim) await ctx.addInitScript(() => localStorage.setItem('strela.anim', '0'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page, srv.url);
  return { srv, browser, page, errors, close: async () => { await browser.close(); await srv.close(); } };
}
const fxCount = page => page.locator('#tfx .tfx-n').count();
const fxLog = page => page.evaluate(() => import('./src/ui/turnfx.js').then(m => m.turnFxLog.map(e => e.kind)));

test('vraie appli : l’animation du joueur se joue au début de sa volée, on lance pendant, elle s’arrête à la première fléchette', { skip, timeout: 120e3 }, async () => {
  const t = await setup();
  try {
    const { page } = t;
    await createPlayer(page, 'Alpha');
    await createPlayer(page, 'Gilles', { icon: 'ours', turnAnim: 'ours' });
    await createPlayer(page, 'Patrick', { icon: 'carabine', turnAnim: 'carabine' });
    const before = (await fxLog(page)).length; // aperçus de la fiche
    await newGame(page, ['Alpha', 'Gilles', 'Patrick'], { startScore: 501, shuffle: false });
    await page.waitForTimeout(300);
    assert.equal(await fxCount(page), 0, 'Alpha : pas d’animation');
    await throwDarts(page, 'S20 S20 S20');
    await validate(page);
    // Gilles : l'ours apparaît, et le calque ne prend aucun appui.
    await page.waitForSelector('#tfx .tfx-bear');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('tfx')).pointerEvents), 'none');
    await page.click('[data-key="20"]'); // on lance pendant l'animation
    await page.waitForFunction(() => !document.querySelector('#tfx .tfx-n'), null, { timeout: 2000 });
    { const band = await page.locator('#app .gband').textContent(); assert.match(band, /2\/3/, `la fléchette a compté : ${band}`); }
    await throwDarts(page, 'S20 S20');
    await page.waitForTimeout(200);
    assert.equal(await fxCount(page), 0, 'pas de reprise dans la même volée');
    await validate(page);
    await page.waitForSelector('#tfx .tfx-gun');
    assert.deepEqual((await fxLog(page)).slice(before), ['ours', 'carabine']);
    // Pas de deuxième lecture pour la même volée (redessins de l'écran).
    await page.waitForFunction(() => !document.querySelector('#tfx .tfx-n'), null, { timeout: 6000 });
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.evaluate(() => { location.hash = '#/jeu'; });
    await page.waitForSelector('.game');
    await page.waitForTimeout(300);
    assert.equal(await fxCount(page), 0);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('vraie appli : choix gardé au rechargement ; aucune animation quand elles sont coupées', { skip, timeout: 120e3 }, async () => {
  const t = await setup({ anim: false });
  try {
    const { page } = t;
    await createPlayer(page, 'Angelina', { icon: 'planete', turnAnim: 'planete' });
    await createPlayer(page, 'Tsia', { turnAnim: 'etoile' });
    const db = await readDb(page);
    assert.equal(db.players.find(p => p.name === 'Angelina').turnAnim, 'planete');
    assert.equal(db.players.find(p => p.name === 'Tsia').turnAnim, 'etoile');
    await reload(page);
    await page.evaluate(() => { location.hash = '#/joueurs'; });
    await page.click('a.item:has(.name:text-is("Angelina"))'); // fiche relue depuis la base
    await page.waitForSelector('[data-act="turn-anim"]');
    assert.equal(await page.locator('[data-act="turn-anim"][aria-pressed="true"]').getAttribute('data-arg'), 'planete');
    await newGame(page, ['Angelina', 'Tsia'], { startScore: 301, shuffle: false });
    await page.waitForTimeout(400);
    assert.equal(await fxCount(page), 0, 'animations coupées : rien');
    assert.equal(await page.locator('#app .vw').count(), 0, 'Tsia a choisi l’étoile : plus de voyelles');
    await throwDarts(page, 'S1 S1 S1');
    await validate(page);
    await ack(page);
    assert.equal(await fxCount(page), 0);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});
