// Passerelle de l'APK (lot 5) : la vraie appli avec une passerelle « strelaNative » simulée (celle de Bridge.java,
// mêmes noms et mêmes réponses), puis sans passerelle (navigateur). Vérifie que la page s'en sert à la place des API
// web : vibreur, voix, export (Téléchargements/Strela + partage), écran allumé et plein écran en partie, zone des
// gestes, thème, bouton retour, mise à jour, diagnostic ; premier lancement de l'APK (import de la version web) ; et
// que rien de tout cela n'apparaît dans le navigateur. Playwright (sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, readDb, settle, throwDarts, validate, createPlayer, newGame } from '../tools/lib/app.mjs';
import { makeBackup, parseBackup } from '../src/data/backup.js';
import { ds } from './helpers.js';

const pw = await loadPlaywright();
const VIEW = { viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' };
const skip = !pw && 'Playwright absent';

/** Passerelle simulée : chaque appel est noté dans window.__calls ; réponses comme Bridge.java. */
function fakeBridge() {
  window.__calls = [];
  const rec = (name, ret) => (...a) => { window.__calls.push([name, ...a]); return typeof ret === 'function' ? ret(...a) : ret; };
  window.__spoken = [];
  try { speechSynthesis.speak = u => window.__spoken.push(u.text); } catch (e) { /* rien */ }
  window.__webVibrate = 0;
  try { navigator.vibrate = () => { window.__webVibrate++; return true; }; } catch (e) { /* rien */ }
  window.strelaNative = {
    info: rec('info', JSON.stringify({ version: '0.5.0', sdk: 36, model: 'Google Pixel 10 Pro' })),
    vibrate: rec('vibrate', 'sent'),
    speak: rec('speak', true),
    stopSpeaking: rec('stopSpeaking'),
    voice: rec('voice', JSON.stringify({ state: 'ok', name: 'Google · fr-fr-x-frc-local', native: true })),
    saveBackup: rec('saveBackup', n => JSON.stringify({ ok: true, path: `Téléchargements/Strela/${n}`, shared: true })),
    storage: rec('storage', JSON.stringify({ dir: '/data/user/0/fr.orbitalvkl.strela/app_webview', bytes: 1258291 })),
    keepScreenOn: rec('keepScreenOn'),
    immersive: rec('immersive'),
    setDark: rec('setDark'),
    gestureInset: rec('gestureInset', 0),
    checkUpdate: rec('checkUpdate'),
    installUpdate: rec('installUpdate'),
    updateState: rec('updateState', JSON.stringify({ current: '0.5.0', available: false, state: 'idle', progress: 0 })),
  };
}

const calls = (page, name) => page.evaluate(n => window.__calls.filter(c => c[0] === n).map(c => c.slice(1)), name);
const clear = page => page.evaluate(() => { window.__calls.length = 0; });
const hash = page => page.evaluate(() => location.hash);

test('APK (passerelle simulée) : vibreur, voix, export, écran, gestes, retour, mise à jour, premier lancement', { skip, timeout: 180e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const dir = mkdtempSync(join(tmpdir(), 'strela-apk-'));
  try {
    const ctx = await browser.newContext(VIEW);
    await ctx.addInitScript(fakeBridge);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    assert.ok((await calls(page, 'setDark')).length, 'thème transmis à la coquille');

    // Premier lancement : importer la sauvegarde de la version web, ou commencer à zéro
    assert.match(await page.textContent('.welcome'), /BIENVENUE DANS L'APPLI/);
    assert.match(await page.textContent('.welcome'), /IMPORTER UNE SAUVEGARDE DE LA VERSION WEB/);
    assert.ok(await page.$('.welcome a[href="#/joueur/nouveau"]'), 'COMMENCER À ZÉRO');
    const web = makeBackup({
      players: [{ id: 'pa', name: 'Alpha', avatar: { kind: 'initials', color: 1 }, archived: false }, { id: 'pb', name: 'Bravo', avatar: { kind: 'initials', color: 4 }, archived: false }],
      games: [{ id: 'gw', startedAt: Date.now() - 86400e3, endedAt: Date.now() - 86000e3, config: { startScore: 301, outMode: 'double', legsToWin: 1, players: ['pa', 'pb'] }, darts: ds('T20 T20 T20 20 20 20 T20 T11 D14'), validated: 9, abandoned: false }],
      current: null, display: null, lastSetup: null,
    }, { app: '0.4.0' });
    const file = join(dir, 'strela-20261030-2118.json');
    writeFileSync(file, JSON.stringify(web));
    await page.setInputFiles('.welcome input[data-backup]', file);
    await page.waitForSelector('[data-act="backup-mode"][data-arg="replace"]');
    assert.equal(await hash(page), '#/reglages', 'aperçu de l’import dans les Réglages');
    await page.click('[data-act="backup-mode"][data-arg="replace"]');
    await page.click('[data-act="backup-yes"]');
    await settle(page);
    const db = await readDb(page);
    assert.deepEqual(db.players.map(p => p.name).sort(), ['Alpha', 'Bravo']);
    assert.equal(db.games.length, 1);

    // Réglages : vibreur natif, voix d'Android, diagnostic, avertissement, mise à jour
    await clear(page);
    await page.click('[data-act="test-vibrate"]');
    assert.deepEqual(await calls(page, 'vibrate'), [['[40,120,40,120,300]']]);
    assert.match(await page.textContent('.vibe'), /VIBREUR D'ANDROID/);
    assert.match(await page.textContent('#app'), /fr-fr-x-frc-local/, 'voix d’Android affichée');
    await page.click('[data-act="test-voice"]');
    assert.equal((await calls(page, 'speak')).length, 1);
    assert.deepEqual(await page.evaluate(() => window.__spoken), [], 'speechSynthesis jamais utilisé');
    assert.match(await page.textContent('#diag'), /données dans l'appli \(\/data\/user\/0\/fr\.orbitalvkl\.strela\/app_webview, 1,2 Mo\)/);
    assert.match(await page.textContent('#diag'), /appli Android 0\.5\.0/);
    assert.match(await page.textContent('#app'), /DÉSINSTALLER EFFACE LES DONNÉES/);
    await page.click('[data-act="update-check"]');
    assert.equal((await calls(page, 'checkUpdate')).length, 1);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('strela-native', { detail: { update: { current: '0.5.0', latest: '0.6.0', available: true, state: 'idle', progress: 0, msg: 'Version 0.6.0 disponible.' } } })));
    await page.click('[data-act="update-install"]');
    assert.equal((await calls(page, 'installUpdate')).length, 1);
    assert.match(await page.textContent('#app'), /INSTALLER LA VERSION 0\.6\.0/);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('strela-native', { detail: { update: { current: '0.5.0', latest: '0.6.0', available: true, state: 'downloading', progress: 42 } } })));
    assert.match(await page.textContent('#app'), /Téléchargement : 42 %/);

    // EXPORTER : Téléchargements/Strela + menu de partage, fichier relu par l'import
    await clear(page);
    await page.click('.btns [data-act="backup-export"] >> nth=0');
    const [[name, text, share]] = await calls(page, 'saveBackup');
    assert.match(name, /^strela-\d{8}-\d{4}\.json$/);
    assert.equal(share, true);
    assert.equal(parseBackup(text).players.length, 2);
    assert.match(await page.textContent('.bk'), /Téléchargements\/Strela\/strela-\d{8}-\d{4}\.json enregistré/);

    // Retour : remonte d'un écran ; à l'accueil, false (la coquille passe en arrière-plan)
    assert.equal(await page.evaluate(() => window.strelaBack()), true);
    await page.waitForSelector('.home-main');
    assert.equal(await page.evaluate(() => window.strelaBack()), false, 'accueil : sortie permise');
    await page.evaluate(() => { location.hash = '#/stats'; });
    await page.waitForSelector('.chips');
    await page.evaluate(() => window.strelaBack());
    await page.waitForSelector('.home-main');

    // Partie : écran allumé et plein écran, vibreur à chaque fléchette, voix d'Android, zone des gestes
    await clear(page);
    await newGame(page, ['Alpha', 'Bravo'], { startScore: 301 });
    assert.deepEqual(await calls(page, 'keepScreenOn'), [[true]]);
    assert.deepEqual(await calls(page, 'immersive'), [[true]]);
    await throwDarts(page, 'T20 T20 T20');
    assert.deepEqual((await calls(page, 'vibrate')).slice(0, 3), [['25'], ['25'], ['25']]);
    await page.waitForFunction(() => window.__calls.some(c => c[0] === 'speak' && c[1] === 'Cent quatre-vingts !'));
    assert.equal(await page.evaluate(() => window.__webVibrate), 0, 'navigator.vibrate jamais utilisé');
    await validate(page);
    const padBottom = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.game')).paddingBottom));
    const before = await padBottom();
    await page.evaluate(() => document.documentElement.style.setProperty('--gesture-native', '48px')); // comme MainActivity
    assert.equal(await padBottom(), 48, `marge basse = zone des gestes mesurée (avant : ${before})`);

    // Retour en partie : ouvre le menu pause, puis le referme ; ferme le panneau ; jamais de sortie
    assert.equal(await page.evaluate(() => window.strelaBack()), true);
    await page.waitForSelector('.sheet [data-act="resume"]');
    await page.evaluate(() => window.strelaBack());
    await page.waitForFunction(() => !document.querySelector('.sheet-bg'));
    await page.click('[data-act="open-panel"], .mini-board');
    await page.waitForSelector('[data-act="close-panel"]');
    await page.evaluate(() => window.strelaBack());
    await page.waitForFunction(() => !document.querySelector('[data-act="close-panel"]'));
    assert.equal(await hash(page), '#/jeu', 'toujours en partie');

    // Quitter la partie : écran relâché, barres rendues
    await clear(page);
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('.home-main');
    assert.deepEqual(await calls(page, 'keepScreenOn'), [[false]]);
    assert.deepEqual(await calls(page, 'immersive'), [[false]]);

    // Écran de secours : l'export passe aussi par la passerelle
    await clear(page);
    await page.evaluate(() => { setTimeout(() => { null.boom(); }, 0); });
    await page.waitForSelector('.rescue');
    await page.click('.rescue button:has-text("EXPORTER")');
    await page.waitForFunction(() => /Téléchargements\/Strela/.test(document.getElementById('rescue-status').textContent));
    assert.equal((await calls(page, 'saveBackup')).length, 1);
    assert.equal(await page.evaluate(() => window.strelaBack()), false, 'écran de secours : la coquille peut sortir');
    assert.deepEqual(errors.filter(e => !/boom/.test(e)), []);
  } finally {
    await browser.close();
    await srv.close();
  }
});

test('navigateur (sans passerelle) : API web, rien de propre à l’APK', { skip, timeout: 90e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext(VIEW);
    await ctx.addInitScript(() => {
      window.__webVibrate = [];
      navigator.vibrate = p => { window.__webVibrate.push(p); return true; };
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    assert.match(await page.textContent('.welcome'), /BIENVENUE/);
    assert.doesNotMatch(await page.textContent('.welcome'), /VERSION WEB/);
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.waitForSelector('#diag');
    assert.doesNotMatch(await page.textContent('#app'), /Appli Android|DÉSINSTALLER|RECHERCHER UNE MISE À JOUR/);
    assert.doesNotMatch(await page.textContent('#diag'), /données dans l'appli/);
    await page.click('[data-act="test-vibrate"]');
    assert.deepEqual(await page.evaluate(() => window.__webVibrate), [[40, 120, 40, 120, 300]]);
    assert.equal(await page.evaluate(() => window.strelaBack()), true, 'retour géré aussi dans le navigateur');
    await createPlayer(page, 'Alpha');
    await newGame(page, ['Alpha']);
    await throwDarts(page, '20');
    assert.deepEqual((await page.evaluate(() => window.__webVibrate)).slice(-1), [25]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
