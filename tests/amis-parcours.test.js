// Lot 10 (étape 2) : amis, deux navigateurs séparés (deux téléphones) contre le faux Supabase (Postgres local).
// Demande par code, acceptation, ami en lecture seule dans les joueurs (trois sections), proposé au lancement d'une
// partie, profil mis à jour chez l'autre, retrait (redevient un joueur local), lien d'ami pré-rempli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { pgAvailable } from '../tools/lib/pg.mjs';
import { fakeSupabase } from '../tools/lib/fake-supabase.mjs';
import { openApp, createPlayer, settle } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const V = { viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' };
const skip = (!pw && 'Playwright absent') || (!pgAvailable() && !process.env.CI && 'Postgres absent');
const sync = page => page.evaluate(() => window.__strelaSyncNow('test'));
const friends = page => page.evaluate(() => window.__strelaPlayers().filter(p => p.friend));

test('amis : demande par code, acceptation, lecture seule, partie, mise à jour, retrait', { skip, timeout: 180e3 }, async () => {
  const sb = await fakeSupabase();
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  const url = `${srv.url}?cloud=${encodeURIComponent(`${sb.url}|${sb.key}`)}`;
  const phone = async (name, player) => {
    const ctx = await browser.newContext(V);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name} : ${e.message}`));
    await openApp(page, url);
    await createPlayer(page, player);
    assert.equal(await sync(page), true);
    return { ctx, page };
  };
  try {
    const A = await phone('A', 'Guillaume');
    const B = await phone('B', 'Mathilde');
    await createPlayer(A.page, 'Tsia'); // joueur local de A
    // Mon code (QR code), côté A.
    await A.page.evaluate(() => { location.hash = '#/amis'; });
    await A.page.waitForSelector('.oncodebig');
    const codeA = (await A.page.textContent('.oncodebig')).trim();
    assert.match(codeA, /^[2-9BCDFGHJKMNPQRSTVWXZ]{6}$/);
    assert.ok(await A.page.$('.onqr svg.qr'));
    // B tape le code de A (minuscules, mauvais code d'abord).
    await B.page.evaluate(() => { location.hash = '#/amis'; });
    await B.page.waitForSelector('#frcode');
    await B.page.fill('#frcode', 'ZZZZZZ');
    await B.page.click('[data-act="fr-send"]');
    await B.page.waitForFunction(() => /aucun joueur/i.test(document.querySelector('.vibe')?.textContent || ''));
    await B.page.fill('#frcode', codeA.toLowerCase());
    await B.page.click('[data-act="fr-send"]');
    await B.page.waitForFunction(() => /Demande envoyée à Guillaume/.test(document.querySelector('.vibe')?.textContent || ''));
    assert.match(await B.page.textContent('.friends'), /Demandes envoyées[\s\S]*Guillaume/);
    // A reçoit la demande à sa synchronisation, l'accepte.
    await sync(A.page);
    await A.page.evaluate(() => { location.hash = '#/joueurs'; });
    await A.page.waitForSelector('a[href="#/amis"].primary');
    assert.match(await A.page.textContent('a[href="#/amis"]'), /1\sDEMANDE D'AMI/);
    await A.page.click('a[href="#/amis"]');
    await A.page.waitForSelector('[data-act="fr-answer"]');
    assert.match(await A.page.textContent('.friends'), /Demandes reçues[\s\S]*Mathilde/);
    await A.page.click('[data-act="fr-answer"][data-arg$=":1"]');
    // A a une joueuse locale (Tsia) : la question du rattachement suit ; ce n'est pas Mathilde.
    await A.page.waitForSelector('[data-act="fr-nomerge"]');
    await A.page.click('[data-act="fr-nomerge"]');
    await A.page.waitForFunction(() => /aucun joueur local/.test(document.querySelector('.vibe')?.textContent || ''));
    const fa = await friends(A.page);
    assert.equal(fa.length, 1);
    assert.equal(fa[0].name, 'Mathilde');
    assert.match(fa[0].id, /^u:[0-9a-f-]{36}$/);
    // B voit l'amitié à sa synchronisation.
    await sync(B.page);
    const fb = await friends(B.page);
    assert.deepEqual(fb.map(p => p.name), ['Guillaume']);
    // Joueurs en trois sections ; l'ami en lecture seule.
    await A.page.evaluate(() => { location.hash = '#/joueurs'; });
    await A.page.waitForSelector('.players3');
    const secs = await A.page.$$eval('.players3 .sec', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    assert.deepEqual(secs.slice(0, 3), ['Mon profil', 'Joueurs locaux 1', 'Amis 1']);
    await A.page.click(`a[href="#/joueur/${fa[0].id}"]`);
    await A.page.waitForSelector('.friends .preview');
    assert.equal(await A.page.$('#name'), null, 'pas de pseudo modifiable');
    assert.match(await A.page.textContent('.friends'), /RETIRER DE MES AMIS/);
    // L'ami se choisit au lancement d'une partie comme n'importe quel joueur.
    await A.page.evaluate(() => { location.hash = '#/nouvelle'; });
    await A.page.waitForSelector('.screen');
    assert.match(await A.page.textContent('.screen'), /Mathilde/);
    // B change son pseudo : A le voit à sa synchronisation suivante.
    await B.page.evaluate(() => { location.hash = '#/joueurs'; });
    await B.page.waitForSelector('.players3');
    const meB = await B.page.evaluate(() => window.__strelaPlayers().find(p => p.name === 'Mathilde').id);
    await B.page.evaluate(id => { location.hash = `#/joueur/${id}`; }, meB);
    await B.page.waitForSelector('#name');
    await B.page.fill('#name', 'Mathou');
    await B.page.click('[data-act="save-player"]');
    await B.page.waitForSelector('.players3');
    await sync(B.page);
    await sync(A.page);
    assert.deepEqual((await friends(A.page)).map(p => p.name), ['Mathou']);
    // B retire A : chez les deux, l'ancien ami redevient un joueur local (ses parties restent).
    await B.page.evaluate(id => { location.hash = `#/joueur/${id}`; }, fb[0].id);
    await B.page.waitForSelector('.friends .preview');
    await B.page.click('[data-act="fr-confirm"]');
    await B.page.click('[data-act="fr-remove"]');
    await B.page.waitForFunction(() => /Lien coupé/.test(document.querySelector('.vibe')?.textContent || ''));
    assert.equal((await friends(B.page)).length, 0);
    assert.ok(await B.page.evaluate(id => window.__strelaPlayers().some(p => p.id === id && !p.friend), fb[0].id), 'gardé en joueur local');
    await sync(A.page);
    assert.equal((await friends(A.page)).length, 0);
    // Lien d'ami (QR code → rejoindre.html → appli) : code pré-rempli.
    await B.page.evaluate(c => { location.hash = `#/amis/ajouter/${c}`; }, codeA);
    await B.page.waitForSelector('#frcode');
    assert.equal(await B.page.inputValue('#frcode'), codeA);
    await settle(A.page); await settle(B.page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    srv.close();
    await sb.close();
  }
});
