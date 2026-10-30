// Vérification des chiffres (lot 3, L) : des parties scriptées jouées dans la vraie appli (base du téléphone), puis
// l'historique et chaque statistique lus à l'écran et comparés à des valeurs calculées à la main (ci-dessous), avec
// bust, partie abandonnée et joueur supprimé. Définitions : docs/statistiques.md. Playwright (sauté s'il est absent).
//
// Partie 1 — 301, sortie double, Alpha contre Bravo (Alpha commence) :
//   A  T20 T20 T20 = 180 → 121     B  20 20 20 = 60 → 241
//   A  T20 20 20   = 100 → 21      B  T20 T20 0 = 120 → 121
//   A  20 : 1 restant, bust (1 fl.) B  T20 1 1 = 62 → 59
//   A  1 D10 : finition de 21 (2 fl.) — Alpha gagne en 9 fléchettes.
// Partie 2 — 501, sortie double, Bravo, Alpha, Charlie ; abandonnée :
//   B  T20 T20 T20 = 180            A  T19 T19 T19 = 171            C  0 0 0      B  20 (volée pas finie)
// Partie 3 — 301, sortie simple, Charlie contre Alpha :
//   C  T20 T20 T20 → 121   A  T20 T20 T20 → 121   C  20 20 20 → 61   A  T20 T20 1 : finition de 121 (6 fl.)
//   puis Charlie est supprimé.
//
// Alpha, toutes périodes :
//   moyenne 3 fl.  : (301 + 171 + 301) points / 18 fléchettes × 3 = 128,83 → 128,8
//   9 premières    : manche 1 : 180 + 100 + 0 = 280 en 7 fl. ; partie 2 : 171 en 3 ; partie 3 : 180 + 121 en 6
//                    → 752 / 16 × 3 = 141,0
//   finition       : volées commencées sur une finition jouable : 121 (raté), 21 (bust), 21 (gagné), 121 (gagné,
//                    sortie simple) → 2 / 4 = 50 %
//   doubles        : fléchettes lancées quand une seule pouvait finir : D10 à 20 (touché), 1 à 1 en sortie simple
//                    (touché) → 2 / 2 = 100 %
//   meilleure finition 121 ; manche la plus courte 6 fl. ; 100+ : 100 et 121 → 2 ; 140+ : 171 → 1 ; 180 : 2
//   victoires 2 / 3 ; face-à-face : Bravo 1 victoire, 0 défaite (partie 2 abandonnée : ne compte pas) ; Charlie
//   supprimé n'est plus un adversaire.
// Bravo : (242 + 180) / 12 × 3 = 105,5 (9 premières : idem) ; finition 0 / 1 = 0 % ; doubles : aucune occasion « — » ;
//   100+ : 1 ; 180 : 1 ; victoires 0 / 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, readDb, settle, throwDarts, validate, createPlayer, newGame } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();

async function play(page, visits) {
  for (const [i, v] of visits.entries()) {
    await throwDarts(page, v);
    if (i < visits.length - 1) await validate(page);
  }
}

const kpis = page => page.$$eval('.kpis [data-k]', els => Object.fromEntries(els.map(e => [e.dataset.k, e.querySelector('b').textContent.replace(/\s+/g, ' ').trim()])));

test('historique et statistiques comparés aux calculs à la main', { skip: !pw && 'Playwright absent', timeout: 180e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    for (const n of ['Alpha', 'Bravo', 'Charlie']) await createPlayer(page, n);

    await newGame(page, ['Alpha', 'Bravo'], { startScore: 301 });
    await play(page, ['T20 T20 T20', '20 20 20', 'T20 20 20', 'T20 T20 0', '20', 'T20 1 1', '1 D10']);
    await page.waitForSelector('[data-act="finish-home"]');
    await page.click('[data-act="finish-home"]');

    await newGame(page, ['Bravo', 'Alpha', 'Charlie'], { startScore: 501 });
    await play(page, ['T20 T20 T20', 'T19 T19 T19', '0 0 0', '20']);
    await page.click('[data-act="pause"]');
    await page.click('[data-act="abandon"]');
    await page.click('[data-act="abandon-yes"]');

    await page.evaluate(() => { location.hash = '#/nouvelle'; });
    await page.waitForSelector('[data-act="launch"]');
    await page.click('[data-act="out"][data-arg="single"]');
    await newGame(page, ['Charlie', 'Alpha'], { startScore: 301 });
    await play(page, ['T20 T20 T20', 'T20 T20 T20', '20 20 20', 'T20 T20 1']);
    await page.waitForSelector('[data-act="finish-home"]');
    await page.click('[data-act="finish-home"]');
    await settle(page);
    let db = await readDb(page);
    const id = Object.fromEntries(db.players.map(p => [p.name, p.id]));
    assert.equal(db.games.length, 3);

    // Charlie supprimé : sa partie avec Alpha reste (anonymisée), sa partie à trois aussi.
    await page.evaluate(i => { location.hash = `#/joueur/${i}`; }, id.Charlie);
    await page.click('[data-act="delete"]');
    await page.click('[data-act="delete-yes"]');
    await page.waitForSelector('.list');
    await settle(page);
    db = await readDb(page);
    assert.equal(db.games.length, 3, 'les 3 parties restent');

    // Historique : liste et détail de la partie 1, case par case.
    await page.evaluate(() => { location.hash = '#/historique'; });
    const rows = await page.$$eval('.gitem', as => as.map(a => a.innerText.replace(/\s+/g, ' ')));
    assert.match(rows[0], /301 · SIMPLE.*CHARLIE|JOUEUR SUPPRIMÉ/i);
    assert.match(rows[0], /VAINQUEUR ALPHA/i);
    assert.match(rows[1], /ABANDONNÉE/);
    assert.match(rows[2], /VAINQUEUR ALPHA/i);
    assert.match(rows[0], /JOUEUR SUPPRIMÉ/i, 'Charlie apparaît « Joueur supprimé »');
    await page.click('.gitem >> nth=2');
    await page.waitForSelector('.lt');
    const cells = await page.$$eval('.lt td.c:not(.none)', tds => tds.map(td => td.getAttribute('aria-label')));
    assert.deepEqual(cells, [
      'T20, T20, T20 : 180, reste 121', '20, 20, 20 : 60, reste 241',
      'T20, 20, 20 : 100, reste 21', 'T20, T20, 0 : 120, reste 121',
      '20 : bust, reste 21', 'T20, 1, 1 : 62, reste 59',
      '1, D10 : 21, manche gagnée',
    ]);
    const summary = await page.$$eval('.score-table tbody tr', trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim())));
    assert.deepEqual(summary.map(r => r.slice(1)), [['1', '100,3', '9', '180'], ['0', '80,7', '9', '120']], 'manches, moyenne, fléchettes, meilleure volée');
    assert.match(await page.innerText('.leg-h'), /ALPHA en 9 fl\./i);

    // Stats d'Alpha, toutes périodes.
    await page.evaluate(i => { location.hash = `#/stats/${i}`; }, id.Alpha);
    await page.click('[data-act="period"][data-arg="tout"]');
    assert.deepEqual(await kpis(page), {
      average: '128,8', first9: '141,0', won: '2 / 3', checkout: '50 %', double: '100 %',
      bestFinish: '121', shortest: '6 fl.', ton: '2', ton40: '1', max: '2',
    });
    const h2h = await page.$$eval('.h2h-row', as => as.map(a => a.innerText.replace(/\s+/g, ' ').trim()));
    assert.deepEqual(h2h, ['BR BRAVO 1 VICTOIRE · 0 DÉFAITE'], 'Bravo seul (Charlie supprimé n’est plus un adversaire)');

    // Face-à-face Alpha contre Bravo.
    await page.click('.h2h-row');
    await page.waitForSelector('.fbilan');
    const bilan = (await page.innerText('.fbilan')).replace(/\s+/g, ' ');
    assert.match(bilan, /1 VICTOIRE · 0 DÉFAITE/);
    assert.match(bilan, /MANCHES : 1 GAGNÉE · 0 PERDUE/);
    const lines = await page.$$eval('.frow', as => as.map(a => a.innerText.replace(/\s+/g, ' ').trim()));
    assert.equal(lines.length, 2, 'la partie commune terminée, puis l’abandonnée à part');
    assert.match(lines[0], /GAGNÉ MANCHES 1 – 0 MOY\. ALPHA 100,3 BRAVO 80,7/);
    assert.match(lines[1], /ABANDONNÉE MANCHES 0 – 0 MOY\. ALPHA 171,0 BRAVO 180,0/);

    // Stats de Bravo.
    await page.evaluate(i => { location.hash = `#/stats/${i}`; }, id.Bravo);
    assert.deepEqual(await kpis(page), {
      average: '105,5', first9: '105,5', won: '0 / 2', checkout: '0 %', double: '—',
      bestFinish: '—', shortest: '—', ton: '1', ton40: '0', max: '1',
    });
    // Liste des joueurs : moyenne, parties, victoires.
    await page.evaluate(() => { location.hash = '#/joueurs'; });
    assert.match((await page.innerText('.list a:has(.nm:text-is("Alpha"))')).replace(/\s+/g, ' '), /moyenne 128,8 3 parties · 2 victoires/);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
