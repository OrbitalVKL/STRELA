// Photo d'avatar dans la vraie appli (lot 2 ; Playwright, sauté s'il est absent) : image test chargée par le
// sélecteur de fichier, recadrage (pincer, zoom, glisser), VALIDER, enregistrement 256 × 256 dans la base, affichage
// en couleur hors jeu et en gris en jeu (bande des autres) ; photo trop lourde, fichier qui n'est pas une image,
// image abîmée : message clair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { openApp, readDb, settle, createPlayer, newGame, throwDarts, validate, reload } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();

/** Image test 800 × 600 : moitié gauche (x < 400) rouge, moitié droite bleue (PNG). */
const testImage = page => page.evaluate(() => {
  const cv = document.createElement('canvas');
  cv.width = 800; cv.height = 600;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgb(220, 30, 30)'; ctx.fillRect(0, 0, 400, 600);
  ctx.fillStyle = 'rgb(30, 60, 220)'; ctx.fillRect(400, 0, 400, 600);
  return cv.toDataURL('image/png').split(',')[1];
});

/** Pincement à deux doigts (événements pointeur) au centre du cadre, écartement de `from` à `to` px. */
const pinch = (page, from, to) => page.evaluate(([from, to]) => {
  const f = document.getElementById('cframe');
  const r = f.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const ev = (type, id, x) => f.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true, cancelable: true, isPrimary: id === 1 }));
  ev('pointerdown', 1, cx - from / 2); ev('pointerdown', 2, cx + from / 2);
  for (let k = 1; k <= 5; k++) { const d = from + (to - from) * k / 5; ev('pointermove', 1, cx - d / 2); ev('pointermove', 2, cx + d / 2); }
  ev('pointerup', 1, cx - to / 2); ev('pointerup', 2, cx + to / 2);
}, [from, to]);

const filterOf = (page, sel) => page.$eval(sel, el => getComputedStyle(el).filter);

test('photo d’avatar : chargement, recadrage, enregistrement, couleur hors jeu et gris en jeu, erreurs claires', { skip: !pw && 'Playwright absent', timeout: 120e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 410, height: 914 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openApp(page, srv.url);
    const png = Buffer.from(await testImage(page), 'base64');

    // Fiche d'un nouveau joueur, avatar « Photo », image choisie dans la galerie.
    await page.evaluate(() => { location.hash = '#/joueur/nouveau'; });
    await page.fill('#name', 'Photo');
    await page.click('[data-act="avkind"][data-arg="photo"]');
    assert.equal(await page.locator('input[data-file="camera"][capture]').count(), 1, 'PHOTO : appareil photo');
    assert.equal(await page.locator('input[type=file][accept="image/*"]').count(), 2);

    // Erreurs : trop lourde, pas une image, image abîmée.
    const pick = file => page.setInputFiles('input[data-file="gallery"]', file);
    await pick({ name: 'enorme.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(21 * 1048576, 1) });
    assert.match(await page.innerText('.note.red'), /trop lourde : 21 Mo, 20 Mo au plus/);
    await pick({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
    assert.match(await page.innerText('.note.red'), /n'est pas une image/);
    await pick({ name: 'abimee.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('ceci n’est pas un JPEG') });
    await page.waitForFunction(() => /illisible/.test(document.querySelector('.note.red')?.textContent || ''));

    // La bonne image : écran de recadrage.
    await pick({ name: 'test.png', mimeType: 'image/png', buffer: png });
    await page.waitForSelector('#cframe img');
    await page.waitForFunction(() => document.getElementById('cimg').complete);
    assert.match(await page.innerText('#czoom'), /×1,0/);
    await pinch(page, 80, 200);
    const zoomed = await page.innerText('#czoom');
    assert.match(zoomed, /×2,[0-9]/, `pincer zoome (${zoomed})`);
    while (!(await page.locator('[data-act="crop-zoom"][data-arg="-1"]').isDisabled())) await page.click('[data-act="crop-zoom"][data-arg="-1"]');
    // Glisser vers la droite : on cadre la partie gauche (rouge) de l'image.
    const box = await page.locator('#cframe').boundingBox();
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 6 });
    await page.mouse.move(box.x + 330, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.click('[data-act="crop-ok"]');
    await page.waitForSelector('#name');
    assert.equal(await page.inputValue('#name'), 'Photo', 'la fiche garde le pseudo saisi');
    assert.equal(await page.locator('#preview .av img').count(), 4, 'aperçu en photo');
    await page.click('[data-act="save-player"]');
    await page.waitForSelector('.list');
    await settle(page);

    // Enregistrée : JPEG 256 × 256, le carré de gauche de l'image (rouge jusqu'aux 2/3, puis bleu).
    const db = await readDb(page);
    const photo = db.players.find(p => p.name === 'Photo').avatar;
    assert.equal(photo.kind, 'photo');
    assert.match(photo.photo, /^data:image\/jpeg;base64,/);
    assert.ok(photo.photo.length < 60000, `photo légère (${photo.photo.length} car.)`);
    const px = await page.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
      const at = x => [...ctx.getImageData(x, 128, 1, 1).data.slice(0, 3)];
      return { w: img.naturalWidth, h: img.naturalHeight, left: at(20), mid: at(150), right: at(236) };
    }, photo.photo);
    assert.deepEqual([px.w, px.h], [256, 256]);
    const red = c => c[0] > 150 && c[2] < 100, blue = c => c[2] > 150 && c[0] < 100;
    assert.ok(red(px.left) && red(px.mid), `carré de gauche : rouge (${px.left} ${px.mid})`);
    assert.ok(blue(px.right), `puis bleu (${px.right})`);

    // Hors jeu : en couleur (liste, après rechargement).
    await reload(page);
    await page.evaluate(() => { location.hash = '#/joueurs'; });
    await page.waitForSelector('.list .av img');
    assert.equal(await filterOf(page, '.list .av img'), 'none');

    // En jeu : en couleur au bandeau quand il lance, en gris dans la bande des autres sinon.
    await createPlayer(page, 'Autre');
    await newGame(page, ['Photo', 'Autre']);
    assert.equal(await filterOf(page, '.gband .av img'), 'none');
    await throwDarts(page, '20 20 20');
    await validate(page);
    await page.waitForFunction(() => document.querySelector('.gband .nm')?.textContent === 'Autre');
    assert.equal(await filterOf(page, '.others .av img'), 'grayscale(1)');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
});
