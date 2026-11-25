// 0.23.4 : un ami vu d'un autre téléphone, deux navigateurs (deux téléphones) contre le faux Supabase.
// - Stats d'entraînement : Mathilde s'entraîne avec un jeu de fléchettes que Guillaume n'a pas (il a supprimé le sien) ;
//   chez Guillaume, le filtre « Jeu de fléchettes » propose les jeux de Mathilde (venus de son profil), un filtre resté
//   sur un jeu de Guillaume qu'elle n'a pas retombe sur TOUS, sa séance s'affiche avec le nom de son jeu et s'ouvre
//   (lecture seule).
// - Records : Mathilde a fait 180 chez elle ; chez Guillaume, après une partie où elle a fait 3, son 140 n'est pas
//   annoncé « RECORD PERSO » (ses records comptent toutes ses parties connues, comme ses stats).
// - Rattachement fait après la réception : ce qui est déjà reçu d'elle suit le joueur local, et revient si on annule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { pgAvailable } from '../tools/lib/pg.mjs';
import { fakeSupabase } from '../tools/lib/fake-supabase.mjs';
import { openApp, createPlayer, newGame, throwDarts, ack, settle } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const V = { viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' };
const skip = (!pw && 'Playwright absent') || (!pgAvailable() && !process.env.CI && 'Postgres absent');
const sync = page => page.evaluate(() => window.__strelaSyncNow('test'));
const players = page => page.evaluate(() => window.__strelaPlayers());

/** Une volée en partie (VALIDER s'il le faut). */
async function volley(page, n) {
  await throwDarts(page, n);
  await ack(page);
  if (await page.locator('.validate.go').count()) await page.click('.validate.go');
}

async function key(page, k) {
  await page.click(`[data-act="tr-key"][data-arg="${k}"]`);
  if (Number(k) >= 1 && Number(k) <= 20) await page.click('[data-act="tr-zonepick"][data-arg="in"]');
}

test('ami vu d\'un autre téléphone : ses jeux au filtre, sa séance ouverte, ses records', { skip, timeout: 180e3 }, async () => {
  const sb = await fakeSupabase();
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  const url = `${srv.url}?cloud=${encodeURIComponent(`${sb.url}|${sb.key}`)}`;
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
    const B = await phone('B', 'Mathilde');

    // Guillaume n'a plus le fût droit (supprimé) ; Mathilde s'entraîne avec le sien.
    await A.page.evaluate(() => { location.hash = '#/armurerie/ds-droit-22'; });
    await A.page.waitForSelector('.dsform');
    await A.page.click('[data-act="ds-del"]');
    await A.page.click('[data-act="ds-del-yes"]');
    await A.page.waitForSelector('.arsenal');
    await settle(A.page);
    // Mathilde n'a plus la torpedo (le filtre de Guillaume sur la torpedo ne vaut donc rien pour elle).
    await B.page.evaluate(() => { location.hash = '#/armurerie/ds-torpedo-22'; });
    await B.page.waitForSelector('.dsform');
    await B.page.click('[data-act="ds-del"]');
    await B.page.click('[data-act="ds-del-yes"]');
    await B.page.waitForSelector('.arsenal');
    await B.page.evaluate(() => { location.hash = '#/entrainement'; });
    await B.page.waitForSelector('.trhub');
    await B.page.click('[data-act="tr-set"][data-arg="ds-droit-22"]');
    await B.page.click('.propose + .btn[data-act="tr-start"]');
    await B.page.waitForSelector('.game.train');
    for (const k of ['20', '20', '1', '20', '20', '20', '20', '5', '20']) await key(B.page, k);
    await B.page.waitForSelector('.trend');
    await B.page.click('[data-act="tr-finish"]');
    await B.page.waitForSelector('.trhub');
    await settle(B.page);

    // Mathilde fait 180 chez elle (partie avec Bob, joueur de son téléphone).
    await createPlayer(B.page, 'Bob');
    await newGame(B.page, ['Mathilde', 'Bob'], { startScore: 301 });
    await volley(B.page, 'T20 T20 T20');
    await volley(B.page, '0 0 0');
    await throwDarts(B.page, 'T20 T11 D14');
    await B.page.waitForFunction(() => location.hash === '#/fin');
    await ack(B.page);
    await B.page.click('[data-act="finish-home"]');
    await settle(B.page);

    // Amitié : B demande, A accepte (aucun joueur local à rattacher) ; la séance de B part, A la reçoit.
    const codeA = await A.page.evaluate(() => window.__strelaCloud().sync.friendCode);
    await B.page.evaluate(c => { location.hash = `#/amis/ajouter/${c}`; }, codeA);
    await B.page.waitForSelector('#frcode');
    await B.page.click('[data-act="fr-send"]');
    await B.page.waitForFunction(() => /Demande envoyée/.test(document.querySelector('.vibe')?.textContent || ''));
    await sync(A.page);
    await A.page.evaluate(() => { location.hash = '#/amis'; });
    await A.page.click('[data-act="fr-answer"][data-arg$=":1"]');
    await settle(A.page); // aucun joueur local à rattacher : pas de proposition
    await sync(B.page);
    await sync(A.page);
    const mathilde = (await players(A.page)).find(p => p.friend && p.name === 'Mathilde');
    assert.ok(mathilde, 'Mathilde est une amie chez Guillaume');

    // Chez Guillaume : filtre sur un de SES jeux (torpedo), puis Mathilde choisie.
    const me = (await players(A.page)).find(p => p.name === 'Guillaume');
    await A.page.evaluate(id => { location.hash = `#/joueur/${id}/entrainement`; }, me.id); // 0.24.0 : profil, onglet Entraînement
    await A.page.click('[data-act="ts-set"][data-arg="ds-torpedo-22"]');
    await A.page.waitForSelector('[data-act="ts-set"][data-arg="ds-torpedo-22"][aria-pressed="true"]');
    assert.equal(await A.page.locator('[data-act="ts-set"][data-arg="ds-droit-22"]').count(), 0, 'Guillaume n’a plus le fût droit');
    await A.page.evaluate(id => { location.hash = `#/joueur/${id}/entrainement`; }, mathilde.id);
    await A.page.waitForSelector('.trl li');
    assert.equal(await A.page.locator('.trl > li.tcard').count(), 1, 'la séance de Mathilde');
    assert.equal(await A.page.getAttribute('[data-act="ts-set"][data-arg=""]', 'aria-pressed'), 'true', 'filtre retombé sur TOUS');
    const chip = A.page.locator('[data-act="ts-set"][data-arg="ds-droit-22"]');
    assert.equal(await chip.count(), 1, 'son jeu proposé au filtre');
    assert.match(await chip.innerText(), /fût droit/i);
    // Son jeu choisi : la séance reste, le tableau par jeu porte son nom (pas « ? »).
    await chip.click();
    await A.page.waitForSelector('[data-act="ts-set"][data-arg="ds-droit-22"][aria-pressed="true"]');
    assert.equal(await A.page.locator('.trl > li.tcard').count(), 1);
    const tabs = (await A.page.locator('.trtab').allInnerTexts()).join('\n');
    assert.match(tabs, /fût droit/i, 'tableau par jeu au nom de son jeu');
    assert.doesNotMatch(tabs, /\?/);
    // Sa séance s'ouvre (avant : introuvable, retour à l'entraînement), en lecture seule.
    await A.page.click('.trl li [data-act="tr-card"]');
    await A.page.click('.trl li a[href^="#/entrainement/seance/"]');
    await A.page.waitForSelector('.screen.trend .trhead');
    assert.match(await A.page.innerText('.trhead'), /Mathilde/);
    assert.match(await A.page.innerText('#app'), /vient du téléphone de Mathilde/);

    // Records : une partie chez Guillaume où Mathilde fait 3, puis une autre où elle fait 140 (moins que son 180).
    for (const [ma, label] of [['1 1 1', 'première'], ['T20 T20 20', 'seconde']]) {
      await newGame(A.page, ['Guillaume', 'Mathilde'], { startScore: 301 });
      await volley(A.page, 'T20 T20 T20');
      await throwDarts(A.page, ma);
      if (label === 'seconde') assert.equal(await A.page.locator('.vr.rec').count(), 0, 'pas de RECORD PERSO : elle a fait 180 chez elle');
      await ack(A.page);
      if (await A.page.locator('.validate.go').count()) await A.page.click('.validate.go');
      await throwDarts(A.page, 'T20 T11 D14');
      await A.page.waitForFunction(() => location.hash === '#/fin');
      await ack(A.page);
      await A.page.click('[data-act="finish-home"]');
      await settle(A.page);
    }
    // Rattachement fait après la réception : un joueur local « Math » devient Mathilde ; sa séance de chez elle suit
    // (avant : restée sur l'ancien identifiant, sortie de ses stats), et revient à la fiche de l'amie si on annule.
    await createPlayer(A.page, 'Math');
    const math = (await players(A.page)).find(p => p.name === 'Math');
    await A.page.evaluate(u => { location.hash = `#/amis/rattacher/${u}`; }, mathilde.friend);
    await A.page.click(`[data-act="fr-pick"][data-arg="${math.id}"]`);
    await A.page.click('[data-act="fr-merge"]');
    await settle(A.page);
    const merged = (await players(A.page)).find(p => p.friend === mathilde.friend);
    assert.equal(merged.id, math.id, 'le joueur local garde son identifiant');
    const trPlayers = async () => (await A.page.evaluate(() => window.__strelaGames())).friendTrainings.map(r => r.player);
    assert.deepEqual(await trPlayers(), [math.id], 'sa séance reçue suit le rattachement');
    await A.page.evaluate(id => { location.hash = `#/joueur/${id}/entrainement`; }, math.id);
    await A.page.waitForSelector('.trl li');
    assert.equal(await A.page.locator('.trl > li.tcard').count(), 1);
    await A.page.evaluate(id => { location.hash = `#/joueur/${id}`; }, math.id);
    await A.page.click('[data-act="fr-unmerge"]');
    await settle(A.page);
    assert.deepEqual(await trPlayers(), [mathilde.id], 'annulé : revenue à la fiche de l’amie');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
    await sb.close();
  }
});
