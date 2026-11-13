// Animations de tour (lot 7.4) : choix par joueur (fiche), défaut « voyelles » pour Tsia, champ facultatif gardé par la
// base et la sauvegarde sans migration ; dans la vraie appli (Playwright, sauté s'il est absent) : jouée au début de
// la volée du joueur, jamais pour les autres, non bloquante (on lance pendant), arrêtée à la première fléchette, une
// fois par volée, rien quand les animations sont coupées, choix gardé au rechargement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TURN_ANIMS, TURN_ANIM_KEYS, turnAnimOf, turnFxKind, TIE_LINES, BEAR_SCENES, FX_KINDS, PICTO_KINDS } from '../src/ui/turnfx.js';
import { PICTO_FX } from '../src/ui/pictofx.js';
import { playerRecord, TURN_ANIM_VALUES } from '../src/data/db.js';
import { makeBackup, parseBackup } from '../src/data/backup.js';
import { ICONS, ICON_KEYS } from '../src/ui/avatars.js';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, throwDarts, validate, createPlayer, newGame, readDb, reload, ack } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

test('choix : liste de la fiche = valeurs de la base ; pictogrammes connus ; cravate dans la banque', () => {
  assert.deepEqual([...TURN_ANIM_KEYS], [...TURN_ANIM_VALUES]);
  for (const a of TURN_ANIMS) if (a.icon) assert.ok(ICONS[a.icon], a.icon);
  assert.equal(ICONS.cravate[0], 'CRAVATE');
  assert.deepEqual(FX_KINDS.filter(k => !k.startsWith('picto:')).sort(), ['carabine', 'cravate', 'etoile', 'ours', 'planete']);
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

// ------------------------------------------------------------------ lot 7.5 : sons, voix d'homme, Tsia, moqueries
import { SPEECH, FLOP_LINES, SOUNDS, VOICE_STYLES } from '../src/ui/feedback.js';

const LOT75_SOUNDS = ['fx-whoosh', 'fx-thud', 'fx-tick', 'fx-beep', 'fx-ding', 'fx-pop', 'fx-boing', 'fx-creak', 'fx-rumble', 'fx-hum', 'fx-howl', 'fx-grunt',
  'fx-meow', 'fx-hoot', 'fx-screech', 'fx-caw', 'fx-slide', 'fx-gulp', 'fx-clink', 'fx-splash', 'fx-crackle', 'fx-zap', 'bear-growl', 'bear-grunt', 'bear-sniff', 'bear-scratch', 'bear-snore', 'bear-chomp', 'planet-orbit', 'planet-twinkle', 'planet-shoot', 'shot'];

test('lot 7.5 : moqueries variées (sous 20), voix pâteuse prononçable, styles de voix', () => {
  for (const k of ['zero', 'low', 'bust', 'serie']) {
    assert.ok(FLOP_LINES[k].length >= 3, k);
    const all = new Set(FLOP_LINES[k].map((_, i) => SPEECH.flop(k, 'Gilles', 7, i / FLOP_LINES[k].length)));
    assert.equal(all.size, FLOP_LINES[k].length, `${k} : toutes différentes`);
    for (const l of all) assert.match(l, /Gilles/);
  }
  for (let i = 0; i < 50; i++) {
    const d = SPEECH.drunk();
    const parts = d.replace(/…$/, '').split('… ');
    assert.ok(parts.length >= 4 && parts.length <= 6, d);
    for (const p of parts) assert.ok(!/(^|\s)[b-df-hj-np-tv-z](\s|$)/i.test(p), `pas de consonne seule (épelée) : ${p}`);
  }
  assert.ok(VOICE_STYLES.homme.pitch < 1 && VOICE_STYLES.ivre.rate < 0.8);
  for (const k of LOT75_SOUNDS) assert.equal(typeof SOUNDS[k], 'function', k);
});

test('lot 7.5 : chaque son se joue sans erreur et n’est pas muet (Web Audio hors ligne)', { skip, timeout: 60e3 }, async () => {
  const t = await setup();
  try {
    const peaks = await t.page.evaluate(async keys => {
      const { SOUNDS } = await import('./src/ui/feedback.js');
      const out = {};
      for (const k of keys) {
        const ac = new OfflineAudioContext(1, 44100 * 3, 44100);
        SOUNDS[k](ac, 0.01);
        const buf = await ac.startRendering();
        out[k] = buf.getChannelData(0).reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      }
      return out;
    }, LOT75_SOUNDS);
    for (const k of LOT75_SOUNDS) assert.ok(peaks[k] > 0.01 && peaks[k] < 1.5, `${k} : ${peaks[k]}`);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('lot 7.5 : l’ours grogne, la planète sonne, HPV parle avec une voix d’homme, Tsia marmonne', { skip, timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      window.__speech = [];
      const synth = {
        speak(u) { window.__speech.push({ text: u.text, rate: u.rate, pitch: u.pitch }); },
        cancel() { window.__speech.push('cancel'); },
        getVoices: () => [{ name: 'Voix française', lang: 'fr-FR', localService: true }, { name: 'Thomas', lang: 'fr-FR', localService: true }],
        addEventListener() {},
      };
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    await createPlayer(page, 'Gilles', { icon: 'ours', turnAnim: 'ours' });
    await createPlayer(page, 'HPV', { icon: 'cravate', turnAnim: 'cravate' });
    await createPlayer(page, 'Angelina', { icon: 'planete', turnAnim: 'planete' });
    await createPlayer(page, 'Tsia');
    await newGame(page, ['Gilles', 'HPV', 'Angelina', 'Tsia'], { startScore: 501, shuffle: false });
    await page.waitForFunction(() => import('./src/ui/feedback.js').then(m => m.soundLog.some(k => k.startsWith('bear-'))), null, { timeout: 4000 });
    await throwDarts(page, 'S20 S20 S20'); await validate(page);
    // HPV : la réplique, voix d'homme (grave), sans couper l'annonce en cours.
    await page.waitForFunction(() => window.__speech.some(s => s.pitch && s.pitch < 1 && s.rate === 1), null, { timeout: 4000 });
    const hpv = await page.evaluate(() => window.__speech.filter(s => s.pitch && s.pitch < 1));
    assert.ok(TIE_LINES.includes(hpv.at(-1).text), hpv.at(-1).text);
    await throwDarts(page, 'S20 S20 S20'); await validate(page);
    await page.waitForFunction(() => import('./src/ui/feedback.js').then(m => m.soundLog.includes('planet-orbit') && m.soundLog.includes('planet-twinkle')), null, { timeout: 4000 });
    await throwDarts(page, 'S20 S20 S20'); await validate(page);
    // Tsia : voix lente et pâteuse.
    await page.waitForFunction(() => window.__speech.some(s => s.rate && s.rate < 0.8), null, { timeout: 4000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});

// ------------------------------------------------------------------ lot 7.9 : une animation par pictogramme
const FX_SOUNDS = ['fx-whoosh', 'fx-thud', 'fx-tick', 'fx-beep', 'fx-ding', 'fx-pop', 'fx-boing', 'fx-creak', 'fx-rumble', 'fx-hum', 'fx-howl', 'fx-grunt',
  'fx-meow', 'fx-hoot', 'fx-screech', 'fx-caw', 'fx-slide', 'fx-gulp', 'fx-clink', 'fx-splash', 'fx-crackle', 'fx-zap'];

test('lot 7.9 : chaque pictogramme de la banque a son animation, toutes différentes', () => {
  assert.deepEqual([...PICTO_KINDS].sort(), [...ICON_KEYS].sort(), 'les 41 pictogrammes');
  assert.equal(new Set(PICTO_KINDS).size, ICON_KEYS.length);
  const fns = Object.values(PICTO_FX);
  assert.equal(new Set(fns).size, fns.length, 'une fonction par pictogramme');
  assert.equal(new Set(fns.map(f => String(f))).size, fns.length, 'aucune saynète recopiée');
  for (const k of Object.keys(PICTO_FX)) assert.ok(FX_KINDS.includes(`picto:${k}`), k);
  // Sons cités par les saynètes : tous connus.
  const cited = new Set(fns.flatMap(f => [...String(f).matchAll(/'(fx-[a-z]+)'/g)].map(m => m[1])));
  for (const k of cited) assert.equal(typeof SOUNDS[k], 'function', k);
  for (const k of FX_SOUNDS) assert.ok(cited.has(k), `${k} sert`);
});

test('lot 7.9 : sans choix, un joueur au pictogramme a l’animation de son pictogramme ; le choix de la fiche l’emporte', () => {
  const fox = { name: 'Bob', avatar: { kind: 'icon', icon: 'renard', color: 2 } };
  assert.equal(turnAnimOf(fox), 'picto');
  assert.equal(turnFxKind(fox), 'picto:renard');
  assert.equal(turnFxKind({ ...fox, turnAnim: 'aucune' }), 'aucune');
  assert.equal(turnFxKind({ ...fox, turnAnim: 'carabine' }), 'carabine');
  assert.equal(turnFxKind({ name: 'Bob', avatar: { kind: 'initials', color: 2 } }), 'aucune');
  assert.equal(turnFxKind({ name: 'Bob', turnAnim: 'picto', avatar: { kind: 'photo', photo: 'data:image/jpeg;base64,AAAA' } }), 'aucune', 'picto sans pictogramme');
  // Les quatre animations d'avant gardent leur pictogramme ; l'étoile du pictogramme n'est pas l'étoile rouge.
  for (const k of ['ours', 'cravate', 'carabine', 'planete']) assert.equal(turnFxKind({ name: 'X', avatar: { kind: 'icon', icon: k } }), k);
  assert.equal(turnFxKind({ name: 'X', avatar: { kind: 'icon', icon: 'etoile' } }), 'picto:etoile');
  assert.equal(turnFxKind({ name: 'X', turnAnim: 'etoile', avatar: { kind: 'icon', icon: 'etoile' } }), 'etoile');
  assert.equal(turnFxKind({ name: 'Tsia', avatar: { kind: 'icon', icon: 'etoile' } }), 'voyelles', 'Tsia garde ses voyelles');
  assert.equal(playerRecord({ id: 'a', name: 'A', avatar: { kind: 'icon', icon: 'renard', color: 1 }, turnAnim: 'picto' }).turnAnim, 'picto');
});

test('lot 7.9 : les 37 saynètes se jouent sans erreur (portrait et paysage), durent 2,5 à 4,5 s et ne laissent rien', { skip, timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    for (const viewport of [{ width: 410, height: 914 }, { width: 914, height: 410 }, { width: 360, height: 640 }]) {
      const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${srv.url}?maquette#/sommaire`);
      await page.waitForFunction(() => window.__strela);
      await page.evaluate(() => { window.__strela.reset(); window.__strela.scene('jeu'); });
      const out = await page.evaluate(async () => {
        const m = await import('./src/ui/turnfx.js');
        const res = {};
        for (const kind of m.FX_KINDS.filter(k => k.startsWith('picto:'))) {
          m.resetTurnFx();
          let err = null;
          try { m.syncTurnFx({ key: `t:${kind}`, kind, color: 'var(--av-0)', sound: () => {} }, true); } catch (e) { err = String(e); }
          const anims = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#tfx'));
          res[kind] = { err, nodes: document.querySelectorAll('#tfx .tfx-n').length, total: Math.max(0, ...anims.map(a => a.effect.getComputedTiming().endTime)) };
        }
        m.resetTurnFx();
        res.left = document.querySelectorAll('#tfx .tfx-n').length;
        return res;
      });
      assert.equal(out.left, 0, 'rien ne reste après l’arrêt');
      const kinds = Object.keys(out).filter(k => k !== 'left');
      assert.equal(kinds.length, 37);
      for (const k of kinds) {
        assert.equal(out[k].err, null, `${k} : ${out[k].err}`);
        assert.ok(out[k].nodes >= 1, `${k} : dessiné`);
        assert.ok(out[k].total >= 2500 && out[k].total <= 4500, `${k} : ${out[k].total} ms`);
      }
      assert.deepEqual(errors, [], `aucune erreur JS (${viewport.width}×${viewport.height})`);
      await ctx.close();
    }
  } finally { await browser.close(); await srv.close(); }
});

test('lot 7.9 : vraie appli — sans rien choisir, le pictogramme du joueur s’anime à sa volée (X01 et Cricket) ; AUCUNE le coupe', { skip, timeout: 120e3 }, async () => {
  const t = await setup();
  try {
    const { page } = t;
    await createPlayer(page, 'Renard', { icon: 'renard' });
    await createPlayer(page, 'Loup', { icon: 'loup', turnAnim: 'aucune' });
    const db = await readDb(page);
    assert.ok(!('turnAnim' in db.players.find(p => p.name === 'Renard')), 'rien d’enregistré sans choix');
    const before = (await fxLog(page)).length;
    await newGame(page, ['Renard', 'Loup'], { startScore: 501, shuffle: false });
    await page.waitForSelector('#tfx .tfx-renard');
    await throwDarts(page, 'S20 S20 S20');
    await validate(page);
    await page.waitForTimeout(300);
    assert.equal(await fxCount(page), 0, 'Loup a choisi AUCUNE');
    assert.deepEqual((await fxLog(page)).slice(before), ['picto:renard']);
    // Cricket : même animation au début de la volée, arrêtée à la première fléchette.
    await page.evaluate(() => { location.hash = '#/nouvelle'; });
    await page.waitForSelector('[data-act="launch"]');
    await page.click('[data-act="game"][data-arg="cricket"]');
    await page.click('[data-act="launch"]');
    await page.click('[data-act="launch-yes"]');
    await page.waitForSelector('.ckgame');
    await page.waitForSelector('#tfx .tfx-renard');
    await page.click('[data-act="ck-hit"][data-arg="20"]');
    await page.waitForFunction(() => !document.querySelector('#tfx .tfx-n'), null, { timeout: 2000 });
    // Fiche : PICTOGRAMME allumé d'office, et l'aperçu joue celle du pictogramme.
    await page.evaluate(() => { location.hash = '#/joueurs'; });
    await page.click('a.item:has(.name:text-is("Renard"))');
    await page.waitForSelector('[data-act="turn-anim"]');
    assert.equal(await page.locator('[data-act="turn-anim"][aria-pressed="true"]').getAttribute('data-arg'), 'picto');
    await page.click('[data-act="turn-anim"][data-arg="picto"]');
    await page.waitForSelector('#tfx .tfx-renard');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});
