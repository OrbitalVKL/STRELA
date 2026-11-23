// Lot 8 du 23/11/2026 en vraie appli : première ouverture (bienvenue, modes, mise en place guidée), accueil selon les
// modes, réglages refondus (Développement replié), tutoriel, installer ; tout gardé au rechargement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, settle, readDb } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';
const reload = async page => { await page.reload(); await page.waitForSelector('#app > *'); };

test('première ouverture : bienvenue, modes, mise en place, accueil selon les modes', { skip, timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 860 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    // Bienvenue : entraînement seul par défaut.
    await page.waitForSelector('.welcome.w2');
    assert.equal(await page.getAttribute('.modepick[data-act="mode-train"]', 'aria-pressed'), 'true');
    assert.equal(await page.getAttribute('.modepick[data-act="mode-soiree"]', 'aria-pressed'), 'false');
    assert.equal(await page.locator('a[href="#/nouvelle"]').count(), 0, 'pas de partie en mode entraînement seul');
    assert.equal(await page.locator('.tile2[href="#/classement"], .tile2[href="#/joueurs"]').count(), 0, 'ni joueurs ni classement');
    // Mise en place : nom, avatar, fléchettes, fin.
    await page.click('a[href="#/bienvenue/nom"]');
    await page.waitForSelector('#wname');
    await page.fill('#wname', 'Alice');
    await page.click('[data-act="setup-next"]');
    await page.waitForSelector('.wicons');
    await page.click('[data-act="setup-icon"][data-arg="renard"]');
    await page.click('[data-act="setup-color"][data-arg="3"]');
    await page.click('[data-act="setup-next"]');
    await page.waitForSelector('[data-act="setup-set"]');
    await page.click('[data-act="setup-set"][data-arg="ds-droit-22"]');
    await page.click('[data-act="setup-next"]');
    await page.waitForSelector('a[data-act="setup-done"][href="#/entrainement"]');
    await page.click('a[data-act="setup-done"][href="#/entrainement"]');
    await page.waitForSelector('.trhub');
    assert.equal(await page.locator('.trhub [data-act="tr-player"]').count(), 0, 'pas de choix de joueur sans le mode soirée');
    // Pavé, réglage « Simple intérieur / extérieur » désactivé (défaut) : SIMPLE, DOUBLE, TRIPLE.
    await page.click('[data-act="tr-start"][data-arg="groupement"]');
    await page.waitForSelector('.game.train');
    await page.click('[data-act="tr-key"][data-arg="20"]');
    assert.equal(await page.locator('[data-act="tr-zonepick"][data-arg="in"]').count(), 0);
    await page.click('[data-act="tr-zonepick"][data-arg="s"]');
    await settle(page);
    const cur = (await readDb(page)).trainings.find(r => r.endedAt === null);
    assert.deepEqual(cur.darts, [{ segment: 20, multiplier: 1 }]);
    // Activé : la couronne du simple se choisit.
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.click('[data-act="pad-ring"][data-arg="1"]');
    await page.evaluate(() => { location.hash = '#/entrainement/jeu'; });
    await page.waitForSelector('.game.train');
    await page.click('[data-act="tr-key"][data-arg="20"]');
    await page.click('[data-act="tr-zonepick"][data-arg="out"]');
    await settle(page);
    assert.deepEqual((await readDb(page)).trainings.find(r => r.endedAt === null).darts[1], { segment: 20, multiplier: 1, ring: 'out' });
    await page.evaluate(() => { location.hash = '#/entrainement'; });
    await page.waitForSelector('.trhub');
    await settle(page);
    let db = await readDb(page);
    const me = db.players.find(p => p.name === 'Alice');
    assert.ok(me, 'profil créé');
    assert.deepEqual(me.avatar, { kind: 'icon', icon: 'renard', color: 3 });
    // Accueil : plus de bienvenue ni de carte de mise en place ; S'ENTRAÎNER en action principale.
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('.t-main');
    assert.equal(await page.locator('.welcome.w2, .setup-card').count(), 0);
    assert.equal(await page.locator('a.tr-btn.on[href="#/entrainement"]').count(), 1, 'séance en cours en tête de l\'accueil');
    // Réglages : mode soirée allumé → partie et joueurs reviennent ; Développement replié.
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.waitForSelector('.settings2');
    assert.equal(await page.locator('#diag').count(), 0, 'Développement replié');
    assert.match(await page.textContent('.settings2'), /Données et sauvegarde/);
    assert.equal(await page.locator('[data-act="backup-export"]').count(), 1, 'l\'export n\'est jamais caché dans Développement');
    await page.click('[data-act="mode-soiree"][data-arg="1"]');
    await page.click('[data-act="mode-train"][data-arg="0"]');
    await page.click('[data-act="mode-soiree"][data-arg="0"]'); // les deux éteints : refusé, l'entraînement revient
    await settle(page);
    await reload(page);
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('.t-main');
    db = await readDb(page);
    assert.deepEqual(db.settings.display.modes, { train: true, soiree: false }, 'jamais les deux éteints, gardé au rechargement');
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.click('[data-act="mode-soiree"][data-arg="1"]');
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('a[href="#/nouvelle"]');
    assert.equal(await page.locator('.tile2[href="#/joueurs"]').count(), 1);
    // Tutoriel et installer.
    await page.evaluate(() => { location.hash = '#/tutoriel'; });
    await page.waitForSelector('.tpage');
    assert.equal(await page.locator('.tpage').count(), 6);
    await page.evaluate(() => { location.hash = '#/installer'; });
    await page.waitForSelector('.igsteps li');
    assert.equal(await page.getAttribute('.igdl', 'href'), 'https://github.com/OrbitalVKL/STRELA/releases/latest/download/strela.apk');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
