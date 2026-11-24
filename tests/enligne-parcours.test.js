// Lot 9.2 : partie en ligne de bout en bout, deux navigateurs séparés (deux téléphones : bases distinctes), reliés par
// WebRTC ; signalisation par un serveur local au protocole de PeerJS (tools/lib/signal-server.mjs, ?signal=…).
// Salon (code, liste en direct, réglages de l'hôte), partie X01 (fléchettes vues une par une, seul le lanceur saisit),
// coupure d'un téléphone (pause pour tous, reprise automatique à son retour), fin, historique des deux côtés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { signalServer } from '../tools/lib/signal-server.mjs';
import { openApp, createPlayer, throwDarts, ack, readDb, settle } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const V = { viewport: { width: 410, height: 914 }, reducedMotion: 'reduce' };
const cover = page => page.evaluate(() => (document.querySelector('.oncover')?.textContent || '').replace(/\s+/g, ' ').trim());

test('en ligne : salon, partie X01 à deux téléphones, coupure et reprise, historique', { skip: !pw && 'Playwright absent', timeout: 240e3 }, async () => {
  const sig = await signalServer();
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  const url = `${srv.url}?signal=${encodeURIComponent(sig.url)}`;
  const phone = async name => {
    const ctx = await browser.newContext(V);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name} : ${e.message}`));
    await openApp(page, url);
    return { ctx, page };
  };
  try {
    const A = await phone('A');
    const B = await phone('B');
    await createPlayer(A.page, 'Guillaume');
    await createPlayer(B.page, 'Mathilde');

    // Salon : l'hôte crée, l'invité tape le code ; liste en direct des deux côtés.
    await A.page.evaluate(() => { location.hash = '#/enligne'; });
    await A.page.click('[data-act="on-create"]');
    await A.page.waitForSelector('.oncodebig');
    const code = (await A.page.textContent('.oncodebig')).trim();
    assert.match(code, /^[2-9BCDFGHJKMNPQRSTVWXZ]{5}$/);
    assert.ok(await A.page.$('.onqr svg.qr'), 'QR code du salon');
    await B.page.evaluate(() => { location.hash = '#/enligne'; });
    await B.page.fill('#oncode', code.toLowerCase());
    await B.page.click('[data-act="on-join"]');
    await B.page.waitForSelector('.oncodebig', { timeout: 20000 });
    await A.page.waitForFunction(() => document.querySelectorAll('.onm').length === 2);
    assert.match(await A.page.textContent('.onmembers'), /Mathilde\s*CONNECTÉ/);
    assert.match(await B.page.textContent('.onmembers'), /Guillaume[\s\S]*HÔTE/);
    // Réglages de l'hôte, vus par l'invité (non modifiables chez lui).
    await A.page.click('[data-act="on-start"][data-arg="301"]');
    await A.page.click('[data-act="on-order"][data-arg="manual"]');
    await B.page.waitForFunction(() => document.querySelector('[data-act="on-start"][data-arg="301"]')?.getAttribute('aria-pressed') === 'true');
    assert.ok(await B.page.$eval('[data-act="on-start"][data-arg="501"]', el => el.disabled));
    assert.equal(await B.page.$('[data-act="on-launch"]'), null, 'seul l\'hôte lance');

    // Partie : Guillaume (hôte) commence ; le pavé de Mathilde est couvert.
    await A.page.click('[data-act="on-launch"]');
    await A.page.waitForSelector('.game');
    await B.page.waitForSelector('.game', { timeout: 10000 });
    assert.match(await cover(B.page), /À Guillaume/);
    assert.equal(await cover(A.page), '');
    await throwDarts(A.page, 'T20');
    await B.page.waitForFunction(() => /T20/.test(document.querySelector('.visit')?.textContent || ''), null, { timeout: 5000 }); // une par une, en direct
    await throwDarts(A.page, 'T20 T20');
    await ack(A.page);
    await A.page.click('.validate.go');
    await B.page.waitForFunction(() => !document.querySelector('.oncover'), null, { timeout: 5000 });
    assert.match(await cover(A.page), /À Mathilde/);

    // Coupure : le téléphone de Mathilde se ferme → pause pour tous ; il revient → reprise d'elle-même.
    await B.page.close();
    await A.page.waitForFunction(() => /PAUSE/.test(document.querySelector('.oncover')?.textContent || ''), null, { timeout: 15000 });
    assert.match(await cover(A.page), /Mathilde a perdu la connexion.*PASSER SON TOUR.*EXCLURE/);
    const B2 = await B.ctx.newPage();
    B2.on('pageerror', e => errors.push(`B2 : ${e.message}`));
    await openApp(B2, url);
    await A.page.waitForFunction(() => { const t = document.querySelector('.oncover')?.textContent || ''; return /À/.test(t) && !/PAUSE/.test(t); }, null, { timeout: 20000 });
    await B2.evaluate(() => { location.hash = '#/jeu'; });
    await B2.waitForSelector('.game');
    await B2.waitForFunction(() => !document.querySelector('.oncover'), null, { timeout: 10000 });
    assert.match(await B2.textContent('.game'), /121/, 'la partie reprend où elle en était (Guillaume à 121)');
    await throwDarts(B2, '0 0 0');
    await ack(B2);
    await B2.click('.validate.go');

    // Finition de Guillaume : fin de partie sur les deux téléphones, puis retour au salon.
    await A.page.waitForFunction(() => !document.querySelector('.oncover'), null, { timeout: 5000 });
    await throwDarts(A.page, 'T20 T11 D14');
    await A.page.waitForFunction(() => location.hash === '#/fin', null, { timeout: 5000 });
    await B2.waitForFunction(() => location.hash === '#/fin', null, { timeout: 5000 });
    await ack(A.page);
    await A.page.click('[data-act="online-finish"]');
    await B2.waitForFunction(() => location.hash === '#/enligne', null, { timeout: 5000 });
    await settle(A.page);
    await settle(B2);
    const da = await readDb(A.page);
    const db = await readDb(B2);
    assert.equal(da.games.length, 1);
    assert.equal(db.games.length, 1);
    assert.equal(da.games[0].id, db.games[0].id, 'même partie sur les deux téléphones');
    assert.deepEqual(da.games[0].darts, db.games[0].darts);
    assert.equal(da.games[0].online.role, 'host');
    assert.equal(db.games[0].online.role, 'guest');
    assert.equal(da.games[0].online.room, undefined, 'le salon n\'est pas gardé dans l\'historique');
    assert.equal(da.current, null);
    assert.deepEqual(db.players.map(p => [p.name, !!p.remote]).sort(), [['Guillaume', true], ['Mathilde', false]], 'adversaire rangé à part');
    // Stats : filtre local / en ligne, joueur distant absent de la liste des joueurs.
    await B2.evaluate(() => { location.hash = '#/joueurs'; });
    await B2.waitForSelector('.list');
    assert.match(await B2.textContent('.screen'), /Adversaires en ligne/);
    await B2.evaluate(() => { location.hash = '#/stats'; });
    await B2.waitForSelector('[data-act="stats-source"][data-arg="ligne"]');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); await sig.close(); }
});

// Lot 9.5 (A1) : PeerJS en panne → repli par MQTT ; étapes affichées ; code sans hôte → étape « Réponse de l'hôte » en
// échec, RÉESSAYER ; journal des deux côtés ; code tapé en minuscules avec espaces, ou lien collé.
test('en ligne : repli MQTT quand PeerJS est en panne, étapes et RÉESSAYER, journal', { skip: !pw && 'Playwright absent', timeout: 180e3 }, async () => {
  const sig = await signalServer();
  sig.peerjsDown = true;
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const errors = [];
  const url = `${srv.url}?signal=${encodeURIComponent(`peerjs:${sig.url},mqtt:${sig.mqttUrl}`)}`;
  const phone = async name => {
    const ctx = await browser.newContext(V);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name} : ${e.message}`));
    await openApp(page, url);
    return { ctx, page };
  };
  try {
    const A = await phone('A');
    const B = await phone('B');
    await createPlayer(A.page, 'Guillaume');
    await createPlayer(B.page, 'Mathilde');
    // Mauvais code (personne) : l'étape 2 échoue, message clair, RÉESSAYER.
    await B.page.evaluate(() => { location.hash = '#/enligne'; });
    await B.page.fill('#oncode', 'zzzzz');
    assert.equal(await B.page.inputValue('#oncode'), 'ZZZZZ', 'majuscules d\'office');
    await B.page.click('[data-act="on-join"]');
    await B.page.waitForSelector('.onsteps li.now');
    await B.page.waitForSelector('.onsteps li.bad', { timeout: 40000 });
    assert.match(await B.page.textContent('.onsteps li.bad'), /Réponse de l'hôte/);
    assert.match(await B.page.textContent('.banner.alert'), /aucun salon n'est ouvert à ce code/);
    assert.ok(await B.page.$('[data-act="on-retry"]'));
    // L'hôte crée le salon : PeerJS ✗, MQTT ✓.
    await A.page.evaluate(() => { location.hash = '#/enligne'; });
    await A.page.click('[data-act="on-create"]');
    await A.page.waitForSelector('.oncodebig', { timeout: 20000 });
    const code = (await A.page.textContent('.oncodebig')).trim();
    assert.match(await A.page.textContent('.onsvc'), /PeerJS 1 ✗.*MQTT 2 ✓/);
    // Lien collé dans le champ → le code ; REJOINDRE passe par MQTT.
    await B.page.fill('#oncode', `https://orbitalvkl.github.io/STRELA/rejoindre.html#${code}`);
    assert.equal(await B.page.inputValue('#oncode'), code);
    await B.page.click('[data-act="on-retry"]');
    await B.page.waitForSelector('.oncodebig', { timeout: 40000 });
    await A.page.waitForFunction(() => document.querySelectorAll('.onm').length === 2, null, { timeout: 10000 });
    // Journal : les étapes sont notées (invité : PeerJS refusé, réponse par MQTT, canal ouvert).
    await B.page.waitForFunction(() => /canal ouvert/.test(localStorage.getItem('strela.journal') || ''), null, { timeout: 5000 });
    const jb = await B.page.evaluate(() => JSON.parse(localStorage.getItem('strela.journal') || '[]').map(l => l[2]).join('\n'));
    assert.match(jb, /signalisation refusée : PeerJS 1/);
    assert.match(jb, /réponse de l'hôte par MQTT 2/);
    assert.match(jb, /canal ouvert/);
    assert.doesNotMatch(jb, /\d+\.\d+\.\d+\.\d+/, 'aucune adresse IP');
    // Réglages › Développement › Journal : VOIR montre les lignes.
    await B.page.evaluate(() => { location.hash = '#/reglages'; });
    await B.page.click('[data-act="s2-diag"]');
    await B.page.click('[data-act="journal-view"]');
    assert.match(await B.page.textContent('pre.journal'), /EN LIGNE/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); await sig.close(); }
});
