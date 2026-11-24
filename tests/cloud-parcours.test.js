// Lot 10 (étape 1) : compte invisible dans la vraie appli, contre le faux Supabase (tools/lib/fake-supabase.mjs : les
// fonctions de supabase/schema.sql tournent dans un vrai Postgres local). Compte créé à l'ouverture sans rien
// demander, profil envoyé, même compte après rechargement, hors ligne, code de récupération sur un autre téléphone,
// suppression des données en ligne. Sauté sans Playwright ou sans Postgres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { pgAvailable } from '../tools/lib/pg.mjs';
import { fakeSupabase } from '../tools/lib/fake-supabase.mjs';
import { openApp, createPlayer, reload, settle } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const V = { viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' };
const skip = (!pw && 'Playwright absent') || (!pgAvailable() && !process.env.CI && 'Postgres absent');
const state = page => page.evaluate(() => window.__strelaCloud());
const waitSynced = page => page.waitForFunction(() => { const c = window.__strelaCloud(); return c.status === 'ok' && c.sync.lastSync && c.sync.friendCode; }, null, { timeout: 15000 });

test('compte invisible : créé à l\'ouverture, profil envoyé, gardé, retrouvé ailleurs, supprimé', { skip, timeout: 180e3 }, async () => {
  const sb = await fakeSupabase();
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  const url = `${srv.url}?cloud=${encodeURIComponent(`${sb.url}|${sb.key}`)}`;
  const phone = async name => {
    const ctx = await browser.newContext(V);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name} : ${e.message}`));
    await openApp(page, url);
    return { ctx, page };
  };
  try {
    const A = await phone('A');
    // Sans rien toucher : compte créé, rattaché, code d'ami reçu.
    await waitSynced(A.page);
    const a0 = await state(A.page);
    assert.match(a0.account.profileId, /^[0-9a-f-]{36}$/);
    assert.match(a0.sync.friendCode, /^[2-9BCDFGHJKMNPQRSTVWXZ]{6}$/);
    assert.equal(await sb.sql(`select count(*) from profil`), '1');
    // Profil : le joueur du téléphone part à la synchronisation suivante.
    await createPlayer(A.page, 'Guillaume');
    await A.page.evaluate(() => { location.hash = '#/reglages'; });
    await A.page.waitForSelector('#compte');
    assert.match(await A.page.textContent('#compte'), new RegExp(a0.sync.friendCode));
    await A.page.click('[data-act="acc-sync"]');
    await A.page.waitForFunction(() => !window.__strelaCloud().busy && window.__strelaCloud().status === 'ok');
    assert.equal(await sb.sql(`select pseudo from profil where id = '${a0.account.profileId}'`), 'Guillaume');
    assert.match(await A.page.textContent('#compte'), /À jour/);
    // Rechargement : même compte, même connexion (pas de nouvel utilisateur anonyme).
    await reload(A.page);
    await waitSynced(A.page);
    const a1 = await state(A.page);
    assert.equal(a1.account.profileId, a0.account.profileId);
    assert.equal(await sb.sql(`select count(*) from appareil`), '1');
    assert.equal(await sb.sql(`select count(*) from auth.users`), '1');
    // Jetons expirés côté serveur : renouvelés sans bruit.
    sb.expire();
    assert.equal(await A.page.evaluate(() => window.__strelaSyncNow('jeton')), true);
    // Hors ligne : rien ne casse, l'état le dit ; le réseau revient : ça repart.
    sb.offline = true;
    assert.equal(await A.page.evaluate(() => window.__strelaSyncNow('coupure')), false);
    assert.equal((await state(A.page)).status, 'offline');
    await A.page.evaluate(() => { location.hash = '#/reglages'; });
    assert.match(await A.page.textContent('#compte'), /Hors ligne/);
    sb.offline = false;
    assert.equal(await A.page.evaluate(() => window.__strelaSyncNow('retour')), true);
    // Serveur en veille (503) : noté, sans plantage.
    sb.down = true;
    assert.equal(await A.page.evaluate(() => window.__strelaSyncNow('veille')), false);
    assert.equal((await state(A.page)).status, 'error');
    sb.down = false;

    // Code de récupération (Mon compte) → autre téléphone : même compte.
    await A.page.evaluate(() => { location.hash = '#/compte'; });
    await A.page.click('[data-act="acc-show"][data-arg="1"]');
    const code = (await A.page.textContent('.reccode')).trim();
    assert.match(code, /^([0-9A-Z]{5}-){9}[0-9A-Z]{2}$/);
    const B = await phone('B');
    await waitSynced(B.page);
    const b0 = await state(B.page);
    assert.notEqual(b0.account.profileId, a0.account.profileId, 'B a d\'abord son propre compte');
    await B.page.evaluate(() => { location.hash = '#/compte'; });
    await B.page.fill('#acccode', 'XXXXX-YYYYY');
    await B.page.click('[data-act="acc-recover"]');
    await B.page.waitForFunction(() => /illisible/.test(document.querySelector('.vibe')?.textContent || ''));
    await B.page.fill('#acccode', code.toLowerCase());
    await B.page.click('[data-act="acc-recover"]');
    await B.page.waitForFunction(() => /retrouvé/.test(document.querySelector('.vibe')?.textContent || ''));
    await B.page.waitForFunction(id => window.__strelaCloud().account.profileId === id && window.__strelaCloud().status === 'ok', a0.account.profileId);
    assert.equal((await state(B.page)).sync.friendCode, a0.sync.friendCode);
    assert.equal(await sb.sql(`select count(*) from appareil where profil = '${a0.account.profileId}'`), '2');
    await settle(B.page);
    // B a fini de se synchroniser (sinon il recréerait le compte juste après : limite documentée, docs/lot-10-avancement.md).
    await B.page.waitForFunction(() => !window.__strelaCloud().busy);
    await B.page.close();

    // Supprimer mes données en ligne (depuis A) : plus rien sur le serveur pour ce compte ; synchronisation coupée.
    await A.page.click('[data-act="acc-confirm"][data-arg="1"]');
    await A.page.click('[data-act="acc-delete"]');
    await A.page.waitForFunction(() => /supprimées/.test(document.querySelector('.vibe')?.textContent || ''));
    assert.equal(await sb.sql(`select count(*) from profil where id = '${a0.account.profileId}'`), '0');
    assert.equal((await state(A.page)).status, 'off');
    await A.page.evaluate(() => { location.hash = '#/reglages'; });
    assert.match(await A.page.textContent('#compte'), /Synchronisation coupée/);
    await reload(A.page);
    assert.equal((await state(A.page)).status, 'off', 'reste coupée après rechargement');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    srv.close();
    await sb.close();
  }
});
