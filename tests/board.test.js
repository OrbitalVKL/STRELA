import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SECTORS, RINGS, segmentAt, sectorIndexAt, angleOf, polar, dartPoint, impactPoint, zoneLabel, sectorAngle } from '../src/engine/board.js';
import { formatDart, makeDart } from '../src/engine/darts.js';
import { ds } from './helpers.js';

// Fléchette sous un point donné en coordonnées polaires (angle en degrés depuis le haut, sens horaire).
const at = (angle, r) => { const d = segmentAt(...polar(angle, r)); return d ? formatDart(d) : null; };
const EPS = 1e-6;

describe('cible : position → segment', () => {
  test('ordre des secteurs : 20 en haut, sens des aiguilles d’une montre', () => {
    assert.equal(SECTORS.length, 20);
    assert.deepEqual([...SECTORS].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
    assert.equal(at(0, 0.3), 'S20');
    assert.equal(at(90, 0.3), 'S6');
    assert.equal(at(180, 0.3), 'S3');
    assert.equal(at(270, 0.3), 'S11');
    assert.equal(at(18, 0.3), 'S1');
    assert.equal(at(342, 0.3), 'S5');
    // le repère a y vers le bas : un point au-dessus du centre a un y négatif
    assert.equal(formatDart(segmentAt(0, -0.3)), 'S20');
    assert.equal(formatDart(segmentAt(0, 0.3)), 'S3');
  });

  test('bords de secteur : ±9° autour de l’axe, un bord exact va au secteur suivant (sens horaire)', () => {
    assert.equal(at(9 - EPS * 100, 0.3), 'S20');
    assert.equal(at(9, 0.3), 'S1');
    assert.equal(at(9 + EPS * 100, 0.3), 'S1');
    assert.equal(at(351 - EPS * 100, 0.3), 'S5');
    assert.equal(at(351, 0.3), 'S20');
    assert.equal(at(360 - EPS, 0.3), 'S20');
    assert.equal(sectorIndexAt(0), 0);
    assert.equal(sectorIndexAt(359.999), 0);
    assert.equal(sectorIndexAt(171), 10); // 171° = bord 17 | 3 → 3
    assert.equal(SECTORS[10], 3);
    assert.ok(Math.abs(angleOf(1, 0) - 90) < EPS);
    assert.ok(Math.abs(angleOf(0, 1) - 180) < EPS);
    // chaque secteur, sur son axe et à ses deux bords intérieurs
    SECTORS.forEach((s, i) => {
      for (const da of [-8.9, 0, 8.9]) assert.equal(at(i * 18 + da, 0.75), `S${s}`, `secteur ${s} à ${da}°`);
    });
  });

  test('anneaux triple et double, simples intérieur et extérieur, limites', () => {
    assert.equal(at(0, RINGS.tripleIn - EPS), 'S20');
    assert.equal(at(0, RINGS.tripleIn), 'T20');
    assert.equal(at(0, RINGS.tripleOut - EPS), 'T20');
    assert.equal(at(0, RINGS.tripleOut), 'S20');
    assert.equal(at(0, RINGS.doubleIn - EPS), 'S20');
    assert.equal(at(0, RINGS.doubleIn), 'D20');
    assert.equal(at(0, RINGS.doubleOut), 'D20', 'le bord extérieur du double compte encore');
    assert.equal(at(54, 0.58), 'T4');
    assert.equal(at(270, 0.92), 'D11');
    assert.equal(at(126 + 8.9, 0.6), 'T15');
    assert.equal(at(126 + 9, 0.6), 'T2');
    assert.ok(RINGS.tripleOut - RINGS.tripleIn >= 0.15 && RINGS.doubleOut - RINGS.doubleIn >= 0.15, 'anneaux élargis pour le doigt');
  });

  test('25 et 50', () => {
    assert.equal(formatDart(segmentAt(0, 0)), '50');
    assert.equal(at(123, RINGS.bull - EPS), '50');
    assert.equal(at(123, RINGS.bull), '25');
    assert.equal(at(324, RINGS.outerBull - EPS), '25');
    assert.equal(at(324, RINGS.outerBull), 'S12');
    assert.equal(segmentAt(0, 0).multiplier, 2, '50 est un double');
  });

  test('hors cible : au-delà du double, dans les numéros, coordonnées invalides', () => {
    assert.equal(at(0, RINGS.doubleOut + EPS), null);
    assert.equal(at(45, RINGS.labels), null);
    assert.equal(at(200, 3), null);
    assert.equal(segmentAt(NaN, 0), null);
    assert.equal(segmentAt(0, Infinity), null);
    assert.equal(segmentAt(undefined, 0), null);
  });

  test('fléchette saisie au pavé : centre de son segment, qui redonne la même fléchette ; 0 non marqué', () => {
    for (const s of SECTORS) {
      for (const m of [1, 2, 3]) {
        const d = makeDart(s, m);
        assert.equal(formatDart(segmentAt(...dartPoint(d))), formatDart(d));
      }
    }
    assert.deepEqual(dartPoint(makeDart(25, 2)), [0, 0]);
    assert.equal(formatDart(segmentAt(...dartPoint(makeDart(25, 1)))), '25');
    assert.equal(dartPoint(makeDart(0, 1)), null);
    assert.equal(sectorAngle(3), 180);
  });

  test('impact : position réelle gardée si elle correspond à la fléchette, sinon centre du segment', () => {
    const [t20] = ds('T20');
    const pos = polar(4, 0.6);
    assert.deepEqual(impactPoint({ ...t20, pos }), pos);
    assert.deepEqual(impactPoint({ ...t20, pos: polar(4, 0.3) }), dartPoint(t20), 'position incohérente (S20) : ignorée');
    assert.deepEqual(impactPoint(t20), dartPoint(t20));
    assert.equal(impactPoint(makeDart(0, 1)), null);
    assert.deepEqual(['T20', 'D16', '5', '25', '50', '0'], ds('T20 D16 S5 25 50 0').map(zoneLabel));
  });
});
