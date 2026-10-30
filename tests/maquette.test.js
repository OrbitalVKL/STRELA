import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MOCK_PLAYERS, EXTRA_PLAYERS, mockGames, simulateGame } from '../src/ui/mock.js';
import { ICONS, ICON_KEYS, initials, avatarHtml, iconSvg } from '../src/ui/avatars.js';
import { computeState } from '../src/engine/x01.js';
import { gameWinner } from '../src/engine/stats.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

describe('maquette', () => {
  test('données fictives : 5 joueurs actifs, une quinzaine de parties valides, une abandonnée', () => {
    assert.equal(MOCK_PLAYERS.filter(p => !p.archived).length, 5);
    assert.ok(MOCK_PLAYERS.some(p => p.archived), 'un joueur archivé pour l’exemple');
    const kinds = new Set(MOCK_PLAYERS.map(p => p.avatar.kind));
    assert.ok(kinds.has('icon') && kinds.has('initials'), 'avatars variés');
    const now = Date.UTC(2026, 9, 30, 20);
    const games = mockGames(MOCK_PLAYERS, now);
    assert.ok(games.length >= 15);
    for (const g of games) {
      const s = computeState(g.config, g.darts); // lève si une fléchette est invalide
      if (g.abandoned) assert.equal(s.status, 'playing');
      else assert.equal(s.status, 'finished', `${g.id} terminée`);
      assert.ok(g.startedAt <= now);
    }
    assert.equal(games.filter(g => g.abandoned).length, 1);
    assert.ok(games.filter(g => gameWinner(g)).length >= 14);
    // reproductible
    assert.deepEqual(mockGames(MOCK_PLAYERS, now).map(g => g.darts.length), games.map(g => g.darts.length));
  });

  test('joueurs d’appoint : 8 joueurs et pseudo très long', () => {
    const ids = new Set([...MOCK_PLAYERS, ...EXTRA_PLAYERS].map(p => p.id));
    assert.equal(ids.size, MOCK_PLAYERS.length + EXTRA_PLAYERS.length);
    assert.ok(EXTRA_PLAYERS.some(p => p.name.length > 30));
    const config = { startScore: 501, outMode: 'double', legsToWin: 1, players: ['1', '2', '3', '4', '5', '6', '7', '8'] };
    assert.equal(computeState(config, simulateGame(config, new Array(8).fill(0.3), 1)).status, 'finished');
  });

  test('banque d’avatars : 24 pictogrammes, noms en français, SVG monochrome', () => {
    assert.equal(ICON_KEYS.length, 24);
    for (const k of ICON_KEYS) {
      const svg = iconSvg(k);
      assert.match(svg, /^<svg viewBox="0 0 48 48"/);
      assert.ok(!/#[0-9a-f]{3,6}/i.test(svg), `${k} : pas de couleur en dur`);
      assert.ok(ICONS[k][0].length > 0);
    }
    assert.equal(initials('Karim'), 'KA');
    assert.equal(initials('Jean-Christophe de La Tour'), 'JC');
    assert.equal(initials('  '), '?');
    assert.match(avatarHtml({ name: '<b>', avatar: { kind: 'initials', color: 3 } }), /&lt;B|&lt;b/i);
    assert.match(avatarHtml({ name: 'X', avatar: { kind: 'icon', icon: 'renard', color: 9 } }), /var\(--av-1\)/);
  });

  test('PWA : manifeste plein écran, deux orientations, icônes présentes, service worker réseau d’abord', () => {
    const m = JSON.parse(read('manifest.webmanifest'));
    assert.equal(m.display, 'fullscreen');
    assert.equal(m.orientation, 'any', 'portrait et paysage (saisie sur la cible)');
    assert.equal(m.background_color.toUpperCase(), '#0A0C0E');
    assert.equal(m.short_name, 'Strela');
    for (const i of m.icons) assert.ok(existsSync(new URL(i.src, root)), i.src);
    assert.ok(m.icons.some(i => i.purpose === 'maskable'));
    const sw = read('sw.js');
    assert.match(sw, /__BUILD__/);
    assert.match(sw, /fetch\(req/);
    const html = read('index.html');
    assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
    assert.match(html, /<script type="module" src="src\/ui\/app.js">/);
    assert.match(html, /<!--@version-->/);
  });

  test('vraie appli : données fictives et sommaire jamais chargés (imports statiques depuis app.js)', () => {
    const seen = new Set();
    const walk = file => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = read(file);
      for (const m of src.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)) {
        walk(new URL(m[1], new URL(file, root)).pathname.slice(new URL(root).pathname.length));
      }
    };
    walk('src/ui/app.js');
    for (const f of ['src/ui/mock.js', 'src/ui/maquette.js', 'src/ui/screens/sommaire.js']) assert.ok(!seen.has(f), `${f} chargé hors maquette`);
    assert.ok(seen.has('src/data/db.js'));
    assert.match(read('src/ui/app.js'), /import\('\.\/maquette\.js'\)/, 'chargés à la demande avec ?maquette');
  });

  test('styles : uniquement les jetons du thème (aucune couleur en dur hors theme.css)', () => {
    const css = read('assets/app.css');
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), 'pas de #couleur dans app.css');
    assert.ok(!/rgba?\(/i.test(css), 'pas de rgb() dans app.css');
    for (const f of ['src/ui/screens/game.js', 'src/ui/screens/stats.js', 'src/ui/screens/players.js', 'src/ui/screens/results.js']) {
      assert.ok(!/#[0-9a-f]{6}\b/i.test(read(f)), `${f} sans couleur en dur`);
    }
  });
});
