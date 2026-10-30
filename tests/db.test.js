// Formes de la base (src/data/db.js) et recadrage de la photo (src/ui/crop.js) : JS pur, sans navigateur.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { splitGames, currentRecord, closedRecord, playerRecord, deletionOps, runMigrations, MIGRATIONS, DB_VERSION } from '../src/data/db.js';
import { deletePlayer } from '../src/engine/players.js';
import { initialCrop, clampCrop, panBy, zoomAt, cropSource, imagePlacement, fitWithin, side, ZOOM_MAX } from '../src/ui/crop.js';

const cfg = players => ({ startScore: 501, outMode: 'double', legsToWin: 1, players });

describe('base : formes des enregistrements', () => {
  test('partie en cours : sans état d’affichage, endedAt null ; partie close : endedAt, abandoned', () => {
    const g = { id: 'g', startedAt: 10, config: cfg(['a']), darts: [{ segment: 20, multiplier: 3, pos: [0, -0.6] }], validated: 0, ui: { mult: 3 } };
    assert.deepEqual(currentRecord(g), { id: 'g', startedAt: 10, endedAt: null, config: g.config, darts: g.darts, validated: 0, abandoned: false });
    assert.deepEqual(closedRecord(g, true, 99), { id: 'g', startedAt: 10, endedAt: 99, config: g.config, darts: g.darts, validated: 0, abandoned: true });
    assert.equal(closedRecord({ ...g, validated: undefined }, false, 99).validated, 1);
  });

  test('séparation : parties closes, partie en cours (la plus récente), anciennes parties ouvertes comptées abandonnées', () => {
    const r = splitGames([
      { id: 'x', startedAt: 1, endedAt: 2 },
      { id: 'old', startedAt: 3, endedAt: null },
      { id: 'cur', startedAt: 5, endedAt: null },
    ]);
    assert.equal(r.current.id, 'cur');
    assert.deepEqual(r.games.map(g => g.id), ['x', 'old']);
    assert.deepEqual(r.stale, [{ id: 'old', startedAt: 3, endedAt: 3, abandoned: true }]);
    assert.equal(splitGames([]).current, null);
  });

  test('joueur : seulement { id, name, avatar, archived, checkout } ; la photo seulement pour un avatar photo', () => {
    assert.deepEqual(playerRecord({ id: 'a', name: 'A', avatar: { kind: 'icon', icon: 'ours', color: 2, photo: 'data:x' }, skill: 0.3 }),
      { id: 'a', name: 'A', avatar: { kind: 'icon', icon: 'ours', color: 2 }, archived: false, checkout: { double: 20, avoidBull: false } });
    assert.deepEqual(playerRecord({ id: 'a', name: 'A', avatar: { kind: 'initials', color: 2 }, checkout: { double: 16, avoidBull: true, x: 1 } }).checkout,
      { double: 16, avoidBull: true });
    assert.equal(playerRecord({ id: 'a', name: 'A', avatar: { kind: 'photo', photo: 'data:x', color: 1 }, archived: true }).avatar.photo, 'data:x');
  });

  test('suppression : fiche retirée, parties à plusieurs réécrites anonymisées, parties seul effacées, derniers réglages', () => {
    const players = [{ id: 'a' }, { id: 'b' }];
    const games = [{ id: 'ab', config: cfg(['b', 'a']) }, { id: 'a', config: cfg(['a']) }, { id: 'b', config: cfg(['b']) }];
    const r = deletePlayer(players, games, 'a');
    const ops = deletionOps('a', r, { players: ['b'] });
    assert.deepEqual(ops, [
      { store: 'players', del: 'a' },
      { store: 'games', del: 'a' },
      { store: 'games', put: { id: 'ab', config: cfg(['b', '~1']) } },
      { store: 'settings', key: 'lastSetup', put: { players: ['b'] } },
    ]);
  });

  test('migrations : seules les versions manquantes sont jouées, dans l’ordre', () => {
    const seen = [];
    const list = [() => seen.push(1), () => seen.push(2), () => seen.push(3)];
    runMigrations({}, {}, 1, list);
    assert.deepEqual(seen, [2, 3]);
    assert.equal(DB_VERSION, MIGRATIONS.length);
    const created = [];
    runMigrations({ createObjectStore: (n, o) => created.push([n, o]) }, {}, 0, MIGRATIONS.slice(0, 1));
    assert.deepEqual(created, [['players', { keyPath: 'id' }], ['games', { keyPath: 'id' }], ['settings', undefined]]);
  });
});

describe('photo : recadrage carré', () => {
  test('départ : le plus grand carré, centré', () => {
    const c = initialCrop(640, 480);
    assert.deepEqual(cropSource(c), { sx: 80, sy: 0, size: 480 });
    assert.deepEqual(cropSource(initialCrop(300, 900)), { sx: 0, sy: 300, size: 300 });
  });

  test('glisser : l’image suit le doigt, sans sortir du carré', () => {
    const c = initialCrop(640, 480);
    assert.equal(cropSource(panBy(c, 30, 0, 240)).sx, 80 - 60, 'cadre de 240 px pour 480 px d’image : 30 px à droite = 60 px d’image');
    assert.equal(cropSource(panBy(c, 1e4, 0, 240)).sx, 0);
    assert.equal(cropSource(panBy(c, -1e4, 0, 240)).sx, 160);
    assert.equal(cropSource(panBy(c, 0, 50, 240)).sy, 0, 'pas de jeu en hauteur au zoom 1');
  });

  test('pincer : le point sous les doigts reste en place, zoom borné', () => {
    const c = initialCrop(640, 480);
    const z = zoomAt(c, 2, 60, 60, 240); // point du cadre (60, 60) = image (200, 120)
    assert.equal(z.zoom, 2);
    assert.equal(side(z), 240);
    const s = cropSource(z);
    assert.equal(s.sx + (60 / 240) * s.size, 200);
    assert.equal(s.sy + (60 / 240) * s.size, 120);
    assert.equal(zoomAt(c, 100, 0, 0, 240).zoom, ZOOM_MAX);
    assert.equal(zoomAt(c, 0.1, 0, 0, 240).zoom, 1);
    assert.deepEqual(clampCrop({ iw: 100, ih: 100, zoom: 2, cx: -5, cy: 500 }), { iw: 100, ih: 100, zoom: 2, cx: 25, cy: 75 });
  });

  test('affichage : le carré gardé remplit le cadre', () => {
    const c = zoomAt(initialCrop(640, 480), 2, 0, 0, 300);
    const p = imagePlacement(c, 300);
    assert.deepEqual(p, { width: 800, height: 600, left: -100, top: 0 });
  });

  test('image de travail : 1600 px de côté au plus, proportions gardées', () => {
    assert.deepEqual(fitWithin(4000, 3000, 1600), { w: 1600, h: 1200 });
    assert.deepEqual(fitWithin(800, 600, 1600), { w: 800, h: 600 });
  });
});
