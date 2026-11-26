// 0.24.1 (lot 9.6 A) : les séances d'entraînement d'un ami lié, deux navigateurs (deux téléphones) contre le faux
// Supabase. Cas vu par Guillaume le 26/11 (journal du Pixel) : Patrick ajouté en ami, son joueur local « Patrick »
// rattaché en 0.23.3 juste après la première réception ; aucune séance de Patrick ne s'affichait ensuite.
// Cause : la fusion de la 0.23.3 ne reprenait pas ce qui était déjà reçu sans moi (séances de chez lui) : elles restaient
// sur « u:<uuid> », fiche supprimée à la fusion, donc à personne ; et rien ne les faisait recevoir de nouveau (curseur
// déjà passé). Repris ici tel quel : état de la base d'avant la correction, puis réparation et reprise complète.
// Aussi : séance avant le lien, séance finie laissée ouverte (sans TERMINER), séance hors ligne puis synchro, séance
// dont le jeu de fléchettes est inconnu (gardée, « Jeu inconnu », nommée quand le jeu arrive), fiche de l'ami
// (séances reçues, RESYNCHRONISER) et journal (envoyées, reçues).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { pgAvailable } from '../tools/lib/pg.mjs';
import { fakeSupabase } from '../tools/lib/fake-supabase.mjs';
import { openApp, createPlayer, settle, readDb, reload } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const V = { viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' };
const skip = (!pw && 'Playwright absent') || (!pgAvailable() && !process.env.CI && 'Postgres absent');
const sync = page => page.evaluate(() => window.__strelaSyncNow('test'));
const players = page => page.evaluate(() => window.__strelaPlayers());
/** Le journal (écrit au plus une seconde après) contient-il cette ligne ? */
const logged = (page, re) => page.waitForFunction(src => new RegExp(src).test(localStorage.getItem('strela.journal') || ''), re.source, { timeout: 5000 })
  .then(() => true, async () => assert.fail(`journal sans ${re} : ${await page.evaluate(() => localStorage.getItem('strela.journal'))}`));
const friendTrs = async page => (await page.evaluate(() => window.__strelaGames())).friendTrainings;

/** Une séance du premier exercice proposé (9 fléchettes) ; `finish` : TERMINER, sinon laissée sur l'écran de fin. */
async function session(page, { set = 'ds-torpedo-22', finish = true } = {}) {
  await page.evaluate(() => { location.hash = '#/entrainement'; });
  await page.waitForSelector('.trhub');
  await page.click(`[data-act="tr-set"][data-arg="${set}"]`);
  await page.click('.propose + .btn[data-act="tr-start"]');
  await page.waitForSelector('.game.train');
  // L'exercice proposé change d'une séance à l'autre : des 20 jusqu'à l'écran de fin.
  for (let i = 0; i < 120; i++) {
    await page.waitForSelector('.trend, [data-act="tr-key"][data-arg="20"]');
    if (await page.locator('.trend').count()) break;
    await page.click('[data-act="tr-key"][data-arg="20"]');
    const zone = page.locator('[data-act="tr-zonepick"]');
    if (await zone.count()) await zone.first().click();
  }
  await page.waitForSelector('.trend');
  if (finish) { await page.click('[data-act="tr-finish"]'); await page.waitForSelector('.trhub'); }
  await settle(page);
}

/** Écrit dans la base du téléphone (comme une version d'avant l'aurait laissée), puis recharge. */
async function patchDb(page, fn) {
  await settle(page);
  await page.evaluate(src => new Promise((resolve, reject) => {
    const r = indexedDB.open('strela');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(['players', 'trainings', 'settings'], 'readwrite');
      const st = n => tx.objectStore(n);
      const all = {};
      let wait = 3;
      const done = () => { if (--wait) return; (new Function('all', 'st', src))(all, st); };
      for (const n of ['players', 'trainings']) { const q = st(n).getAll(); q.onsuccess = () => { all[n] = q.result; done(); }; }
      const k = st('settings').get('cloudSync'); k.onsuccess = () => { all.cloudSync = k.result; done(); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), fn.toString().replace(/^[^{]*{/, '').replace(/}\s*$/, ''));
  await reload(page);
}

test('séances d\'un ami lié : rattachement d\'avant réparé, finies, hors ligne, jeu inconnu, fiche et journal', { skip, timeout: 240e3 }, async () => {
  const sb = await fakeSupabase();
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  const url = `${srv.url}?cloud=${encodeURIComponent(`${sb.url}|${sb.key}`)}`;
  const offline = ctx => ctx.route(`${sb.url}/**`, r => r.abort('internetdisconnected'));
  const online = ctx => ctx.unroute(`${sb.url}/**`);
  const phone = async (name, me) => {
    const ctx = await browser.newContext(V);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name} : ${e.message}`));
    await openApp(page, url);
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.click('[data-act="pad-ring"][data-arg="1"]');
    await createPlayer(page, me);
    assert.equal(await sync(page), true);
    return { ctx, page };
  };
  try {
    const A = await phone('A', 'Guillaume');
    await createPlayer(A.page, 'Patrick'); // son joueur local, d'avant le compte de Patrick
    const B = await phone('B', 'Patrick');

    // 1. Séance de Patrick AVANT le lien d'amitié.
    await session(B.page);
    assert.equal(await sync(B.page), true);

    // Lien : Guillaume demande, Patrick accepte ; Guillaume reçoit la séance (fiche d'ami « u:… »).
    const codeB = await B.page.evaluate(() => window.__strelaCloud().sync.friendCode);
    await A.page.evaluate(c => { location.hash = `#/amis/ajouter/${c}`; }, codeB);
    await A.page.waitForSelector('#frcode');
    await A.page.click('[data-act="fr-send"]');
    await A.page.waitForFunction(() => /Demande envoyée/.test(document.querySelector('.vibe')?.textContent || ''));
    await sync(B.page);
    await B.page.evaluate(() => { location.hash = '#/amis'; });
    await B.page.click('[data-act="fr-answer"][data-arg$=":1"]');
    await settle(B.page);
    await sync(A.page);
    const ghost = (await players(A.page)).find(p => p.friend && p.id.startsWith('u:'));
    assert.ok(ghost, 'Patrick est un ami chez Guillaume');
    assert.deepEqual((await friendTrs(A.page)).map(r => r.player), [ghost.id], 'sa séance d\'avant le lien est reçue');

    // Rattachement au joueur local « Patrick » (la 0.23.4 reprend la séance reçue)…
    const local = (await players(A.page)).find(p => p.name === 'Patrick' && !p.friend);
    await A.page.evaluate(u => { location.hash = `#/amis/rattacher/${u}`; }, ghost.friend);
    await A.page.click(`[data-act="fr-pick"][data-arg="${local.id}"]`);
    await A.page.click('[data-act="fr-merge"]');
    await settle(A.page);
    // … mais la 0.23.3 la laissait sur « u:… » : base remise dans cet état, et sans la reprise complète de la 0.24.1.
    // Hors ligne : la réparation se fait sur le téléphone, sans réseau.
    await offline(A.ctx);
    await patchDb(A.page, (all, st) => {
      for (const r of all.trainings) if (r.owner) st('trainings').put({ ...r, player: `u:${r.owner}` });
      const cs = { ...all.cloudSync };
      delete cs.resync; delete cs.resent;
      st('settings').put(cs, 'cloudSync');
    });
    assert.deepEqual((await friendTrs(A.page)).map(r => r.player), [local.id], 'réparée au lancement, hors ligne');
    await logged(A.page, /réparation : 0 partie\(s\) et 1 séance\(s\) reçues de « Patrick »/);
    await A.page.evaluate(id => { location.hash = `#/joueur/${id}/entrainement`; }, local.id);
    await A.page.waitForSelector('.trl > li.tcard');
    assert.equal(await A.page.locator('.trl > li.tcard').count(), 1, 'sa séance dans son profil');
    await online(A.ctx);

    // 2. Séance finie mais laissée sur l'écran de fin (sans TERMINER), appli quittée : elle part quand même.
    await session(B.page, { finish: false });
    await B.page.evaluate(() => { location.hash = '#/'; });
    assert.equal(await sync(B.page), true);
    assert.equal(await sync(A.page), true);
    assert.equal((await friendTrs(A.page)).length, 2, 'séance finie, restée ouverte chez Patrick : reçue');
    // 3. Séance faite hors ligne : la synchronisation échoue, puis passe au retour du réseau.
    await offline(B.ctx);
    await session(B.page);
    assert.equal(await sync(B.page), false, 'hors ligne : rien ne part');
    await online(B.ctx);
    assert.equal(await sync(B.page), true);
    await logged(B.page, /envoi : 0 partie\(s\), 1 séance\(s\)/);

    // Chez Guillaume : reprise complète (une fois, 0.24.1) et les deux nouvelles ; rien en double.
    assert.equal(await sync(A.page), true);
    const trs = await friendTrs(A.page);
    assert.equal(trs.length, 3, `trois séances de Patrick : ${trs.map(r => r.id).join(', ')}`);
    assert.equal(new Set(trs.map(r => r.id)).size, 3, 'sans doublon');
    assert.ok(trs.every(r => r.player === local.id));
    await logged(A.page, /réception : 0 partie\(s\), 1 séance\(s\) \(tout repris\)/); // une fois, au lancement
    await logged(A.page, /réception : 0 partie\(s\), 1 séance\(s\)"/);
    await A.page.evaluate(() => { location.hash = '#/'; }); // même adresse qu'avant : sinon pas redessiné
    await A.page.evaluate(id => { location.hash = `#/joueur/${id}/entrainement`; }, local.id);
    await A.page.waitForSelector('.trl > li.tcard');
    assert.equal(await A.page.locator('.trl > li.tcard').count(), 3);
    // Fiche de l'ami (Résumé) : séances reçues, RESYNCHRONISER (rien en double).
    await A.page.evaluate(id => { location.hash = `#/joueur/${id}`; }, local.id);
    await A.page.waitForSelector('.frsync');
    assert.equal(await A.page.textContent('.frsync [data-k="trainings"]'), '3');
    await A.page.click('[data-act="fr-resync"]');
    await A.page.waitForFunction(() => /Tout est repris/.test(document.querySelector('.vibe')?.textContent || ''));
    assert.equal((await friendTrs(A.page)).length, 3, 'resynchronisé : toujours trois');

    // 4. Jeu de fléchettes inconnu : Guillaume n'a plus la torpedo, et le profil de Patrick n'est pas encore arrivé.
    //    La séance reste, « Jeu inconnu » ; nommée dès que son profil (ses jeux) arrive.
    const tid = trs[0].id;
    await offline(A.ctx);
    await patchDb(A.page, (all, st) => {
      for (const p of all.players) if (p.friend) st('players').put({ ...p, sets: [] });
    });
    await A.page.evaluate(() => { location.hash = '#/armurerie/ds-torpedo-22'; });
    await A.page.waitForSelector('.dsform');
    await A.page.click('[data-act="ds-del"]');
    await A.page.click('[data-act="ds-del-yes"]');
    await A.page.waitForSelector('.arsenal');
    await A.page.evaluate(id => { location.hash = `#/entrainement/seance/${id}`; }, tid);
    await A.page.waitForSelector('.screen.trend .trhead');
    assert.match(await A.page.innerText('#app'), /Jeu inconnu/);
    await online(A.ctx);
    assert.equal(await sync(A.page), true);
    await A.page.evaluate(() => { location.hash = '#/'; });
    await A.page.evaluate(id => { location.hash = `#/entrainement/seance/${id}`; }, tid);
    await A.page.waitForSelector('.screen.trend .trhead');
    const txt = await A.page.innerText('#app');
    assert.doesNotMatch(txt, /Jeu inconnu/, 'son jeu arrivé : nommé');
    assert.match(txt, /torpedo/i);
    assert.equal((await readDb(A.page)).trainings.filter(r => r.owner).length, 3);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
    await sb.close();
  }
});
