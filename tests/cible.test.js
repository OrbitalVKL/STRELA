import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTORS, zoneTone, polar, RINGS } from '../src/engine/board.js';
import { boardSvg, impactsFor } from '../src/ui/board.js';
import { BOARD_COLORS, THEMES, contrast, deltaE, toLab } from '../src/ui/theme.js';
import { computeState } from '../src/engine/x01.js';
import { cfg, ds } from './helpers.js';

const css = readFileSync(new URL('../assets/theme.css', import.meta.url), 'utf8');

describe('cible aux couleurs réglementaires (lot 1.2)', () => {
  test('ordre des numéros : 20 en haut puis le sens des aiguilles d’une montre', () => {
    assert.deepEqual([...SECTORS], [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]);
    // dans le dessin : les numéros de la couronne dans cet ordre, le premier en haut, le 6 à droite, le 3 en bas
    const svg = boardSvg({ size: 380 });
    const nums = [...svg.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>(\d+)<\/text>/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]), n: Number(m[3]) }));
    assert.deepEqual(nums.map(t => t.n), [...SECTORS]);
    const at = n => nums.find(t => t.n === n);
    assert.ok(Math.abs(at(20).x) < 0.01 && at(20).y < 0, '20 en haut');
    assert.ok(at(6).x > 0 && Math.abs(at(6).y) < 0.01, '6 à droite');
    assert.ok(Math.abs(at(3).x) < 0.01 && at(3).y > 0, '3 en bas');
    assert.ok(at(11).x < 0 && Math.abs(at(11).y) < 0.01, '11 à gauche');
    assert.ok(at(1).x > 0 && at(1).y < 0, '1 juste à droite du 20');
  });

  test('couleur de chaque zone : simples noir / crème, doubles et triples rouge / vert, 25 vert, 50 rouge', () => {
    SECTORS.forEach((s, i) => {
      const dark = i % 2 === 0; // le 20 est noir, puis un secteur sur deux
      assert.equal(zoneTone(s, 1), dark ? 'black' : 'cream', `simple ${s}`);
      assert.equal(zoneTone(s, 2), dark ? 'red' : 'green', `double ${s}`);
      assert.equal(zoneTone(s, 3), dark ? 'red' : 'green', `triple ${s}`);
    });
    assert.equal(zoneTone(20, 1), 'black');
    assert.equal(zoneTone(1, 1), 'cream');
    assert.equal(zoneTone(20, 3), 'red');
    assert.equal(zoneTone(1, 2), 'green');
    assert.equal(zoneTone(25, 1), 'green');
    assert.equal(zoneTone(25, 2), 'red');
    assert.equal(zoneTone(0, 1), null);
    // le dessin : 82 zones, 20 noires, 20 crème, 21 rouges (dont le 50), 21 vertes (dont le 25)
    const svg = boardSvg({ size: 300 });
    const count = t => (svg.match(new RegExp(`class="z z-${t}"`, 'g')) || []).length;
    assert.deepEqual([count('black'), count('cream'), count('red'), count('green')], [20, 20, 21, 21]);
    assert.match(svg, /<circle r="7.5" class="z z-red"\/>/, '50 rouge');
    assert.match(svg, /<circle r="17" class="z z-green"\/>/, '25 vert');
    assert.match(svg, /class="ring"/, 'couronne des numéros');
  });

  test('jetons --board-* : mêmes couleurs en sombre et en clair, franchement rouge et vert, marques lisibles', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    for (const [k, v] of Object.entries(BOARD_COLORS)) {
      assert.match(root, new RegExp(`--board-${k}: ${v};`), `--board-${k}`);
      assert.equal(css.split(`--board-${k}:`).length, 2, `--board-${k} défini une seule fois (pas de variante claire)`);
    }
    const B = BOARD_COLORS;
    const [, aRed] = toLab(B.red), [, aGreen] = toLab(B.green);
    assert.ok(aRed > 35, `rouge franc (a* = ${aRed.toFixed(0)})`);
    assert.ok(aGreen < -25, `vert franc (a* = ${aGreen.toFixed(0)})`);
    assert.ok(deltaE(B.red, THEMES.dark.red) > 5, 'rouge de cible distinct du rouge d’alerte');
    assert.ok(contrast(B.black, B.cream) >= 10, 'noir / crème');
    assert.ok(contrast(B.num, B.ring) >= 12, 'numéros blancs sur la couronne');
    assert.ok(contrast(B.mark, B['mark-ink']) >= 12, 'marque : disque clair, cercle et numéro sombres');
    for (const zone of [B.black, B.cream, B.red, B.green]) {
      // chaque marque garde un contour bien visible sur chaque couleur : le clair ou le sombre
      assert.ok(Math.max(contrast(B.mark, zone), contrast(B['mark-ink'], zone)) >= 4.5, `marque sur ${zone}`);
    }
    assert.ok(contrast(B.wire, B.black) >= 4.5, 'fils métalliques visibles sur le noir');
  });

  test('marques rondes numérotées ; la petite cible ne montre que la volée en cours', () => {
    const C = cfg({ startScore: 501 });
    const darts = ds('T20 S20 S5  S20 S1 S5  T20 S1');
    const s = computeState(C, darts);
    const g = { darts };
    // volée en cours de Guillaume (2e tour) : 2 fléchettes ; sa 1re volée n'apparaît qu'avec la manche
    const cur = impactsFor(g, s, 'open', { previous: false });
    assert.deepEqual(cur.map(i => i.n), [1, 2]);
    const leg = impactsFor(g, s, 'open');
    assert.equal(leg.filter(i => i.old).length, 3);
    const svg = boardSvg({ size: 104, impacts: cur });
    assert.equal((svg.match(/<g class="imp">/g) || []).length, 2);
    assert.match(svg, /<circle class="imp-o"/);
    assert.match(svg, />1<\/text>/);
    assert.ok(!/<rect/.test(svg), 'plus de carrés');
    // nouvelle volée : vide
    assert.deepEqual(impactsFor(g, computeState(C, ds('T20 S20 S5  S20 S1 S5')), 'open', { previous: false }), []);
    // anneaux élargis gardés pour la saisie au doigt
    assert.ok(Math.abs(RINGS.tripleOut - RINGS.tripleIn - 0.15) < 1e-9 && Math.abs(RINGS.doubleOut - RINGS.doubleIn - 0.15) < 1e-9);
    assert.ok(polar(0, 1)[1] < 0);
  });
});
