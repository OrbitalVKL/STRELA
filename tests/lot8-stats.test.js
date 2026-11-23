// Lot 8 du 23/11/2026 (entraînement, stats et distribution) : calculs — précision en distance à la cible (hors cible
// posé compris), point approché du pavé, règles écrites par exercice, volée en cours, tendances, période, axe du temps,
// échelles de la carte de chaleur.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, aimDistance, aimPoint, realPoint, approxPoint, posOk, precisionOf, OFF_R, RULES, RULES_VERSION, rulesOf, EXERCISES, ALL_EXERCISES,
  trainingState, volleyInfo, plannedDarts, planOf, REAL_R } from '../src/engine/training.js';
import { trend, periodBounds, inPeriod, timeAxis, labelIndexes, dayStart, isoDay, DAY } from '../src/engine/trends.js';
import { impactPoint, polar, RINGS } from '../src/engine/board.js';
import { HEAT_COLORS, HEAT_SCALES, heatColor, inkOn, contrast } from '../src/ui/theme.js';
import { boardSvg } from '../src/ui/board.js';
import { trainingRecord } from '../src/data/db.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

describe('précision : distance au point visé (3.4)', () => {
  test('une fléchette posée au point visé : 0 ; un hors cible posé compte avec sa distance', () => {
    const t = { s: 20, z: 't' };
    const p = aimPoint(t); // milieu du triple du 20, en mm
    near(Math.hypot(...p), (REAL_R[3] + REAL_R[4]) / 2);
    // Point du repère de l'appli au milieu du triple 20 : distance nulle.
    const at = { segment: 20, multiplier: 3, pos: polar(0, (RINGS.tripleIn + RINGS.tripleOut) / 2) };
    near(aimDistance(t, at), 0, 1e-3);
    // Hors cible posé à 1,3 (repère) au-dessus du 20 : sur une vraie cible, 225 + 0,12 × 300 = 261 mm du centre.
    const off = { segment: 0, multiplier: 1, pos: [0, -1.3] };
    assert.ok(posOk(off));
    near(Math.hypot(...realPoint(off)), 261, 1e-6);
    near(aimDistance(t, off), 261 - 103, 1e-6);
    // Hors cible au pavé : pas de position, pas de distance.
    assert.equal(aimDistance(t, { segment: 0, multiplier: 1 }), null);
    // Au-delà de la zone autour de la cible : position refusée.
    assert.ok(!posOk({ segment: 0, multiplier: 1, pos: [0, -(OFF_R + 0.05)] }));
  });

  test('pavé : point au centre de la case, signalé comme approché', () => {
    const d = { segment: 20, multiplier: 1, ring: 'out' };
    assert.equal(approxPoint(d), true);
    near(Math.hypot(...realPoint(d)), (REAL_R[4] + REAL_R[5]) / 2);
    assert.equal(approxPoint({ segment: 20, multiplier: 1, ring: 'out', pos: polar(0, 0.75) }), false);
    assert.equal(approxPoint({ segment: 0, multiplier: 1 }), false, 'un hors cible n\'a pas de point approché : pas de point du tout');
  });

  test('precisionOf : moyenne des distances, fléchettes approchées et hors cible sans position comptés à part', () => {
    const t = { s: 20, z: 'any' };
    const a = aimPoint(t);
    const pairs = [
      { t, d: { segment: 20, multiplier: 1, ring: 'in' } },          // approchée : centre du simple intérieur
      { t, d: { segment: 0, multiplier: 1 } },                        // hors cible au pavé : sans distance
      { t, d: { segment: 0, multiplier: 1, pos: [0, -1.3] } },        // hors cible posé
    ];
    const p = precisionOf(pairs);
    assert.equal(p.distN, 2);
    assert.equal(p.approx, 1);
    assert.equal(p.offNoPos, 1);
    const d1 = Math.hypot(...a) - (REAL_R[2] + REAL_R[3]) / 2; // même axe que le point visé
    const d2 = 261 - Math.hypot(...a);
    near(p.dist, (d1 + d2) / 2, 1e-6);
  });

  test('analyze : une séance triple 20 toute dans le 20 n\'a plus « 0 % » de précision mais une distance', () => {
    const rec = { exercise: 'triple20', rules: 2, darts: Array.from({ length: 3 }, () => ({ segment: 20, multiplier: 1, ring: 'out' })) };
    const a = analyze(rec);
    assert.equal(a.rate, 0, 'aucun triple : dans la cible 0 %');
    assert.ok(a.dist > 0 && a.dist < 40, `distance au T20 : ${a.dist} mm`);
    assert.equal(a.approx, 3);
    // Le hors cible posé entre dans le groupement (il a une position) ; au pavé, non.
    const g = analyze({ exercise: 'groupement', darts: [{ segment: 20, multiplier: 1, ring: 'in' }, { segment: 20, multiplier: 1, ring: 'in' }, { segment: 0, multiplier: 1, pos: [0.4, -1.25] }] });
    assert.equal(g.points, 3);
    assert.equal(analyze({ exercise: 'groupement', darts: [{ segment: 20, multiplier: 1, ring: 'in' }, { segment: 0, multiplier: 1 }] }).points, 1);
  });

  test('marque d\'un hors cible posé au-delà de la couronne des numéros ; la cible s\'élargit pour la montrer', () => {
    const d = { segment: 0, multiplier: 1, pos: [0.2, -1.27] };
    assert.deepEqual(impactPoint(d), [0.2, -1.27]);
    const svg = boardSvg({ size: 300, impacts: [{ dart: d, n: 1 }] });
    assert.match(svg, /class="offz"/);
    assert.match(svg, /viewBox="-133 -133 266 266"/);
    // Numéros des secteurs dessinés après les marques (jamais masqués).
    assert.ok(svg.indexOf('class="num"') > svg.indexOf('class="imp"'));
    assert.ok(!/class="offz"/.test(boardSvg({ size: 300, impacts: [{ dart: { segment: 20, multiplier: 3 }, n: 1 }] })));
  });
});

describe('règles écrites et passage de la cible (1.6, 2.1 à 2.3)', () => {
  test('chaque exercice a ses règles complètes ; la cible change à la fin de la volée, sauf aux tours de l\'horloge', () => {
    for (const k of ALL_EXERCISES) {
      const r = RULES[k];
      assert.ok(r, k);
      for (const f of ['flow', 'success', 'entry', 'now']) assert.ok(typeof r[f] === 'string' && r[f].length > 10, `${k}.${f}`);
      assert.equal(rulesOf(k), r);
      const ex = EXERCISES[k];
      if (ex.game) assert.equal(r.advance, 'game');
      else if (ex.clock) assert.equal(r.advance, 'hit', k);
      else {
        assert.equal(r.advance, 'volley', k);
        for (const b of planOf({ exercise: k, rules: RULES_VERSION })) assert.equal(b.n % 3, 0, `${k} : séries en volées complètes`);
      }
    }
    assert.equal(rulesOf('inconnu'), RULES.libre);
  });

  test('20-19-18 : 21 fléchettes par numéro pour les séances nouvelles, 20 pour celles d\'avant', () => {
    assert.equal(plannedDarts({ exercise: 'vingt', rules: 2 }), 63);
    assert.equal(plannedDarts({ exercise: 'vingt' }), 60);
    // Une séance d'avant reste complète à 60 fléchettes.
    const old = { exercise: 'vingt', darts: Array.from({ length: 60 }, () => ({ segment: 20, multiplier: 1 })) };
    assert.equal(trainingState(old, old.darts).done, true);
    // Le champ `rules` est gardé par la base, et seulement s'il est valable.
    const base = { id: 't1', startedAt: 1, endedAt: 2, player: 'p1', exercise: 'vingt', darts: [] };
    assert.equal(trainingRecord({ ...base, rules: 2 }).rules, 2);
    assert.equal(trainingRecord({ ...base, rules: 'x' }).rules, undefined);
    assert.equal(trainingRecord(base).rules, undefined);
  });

  test('volée en cours : « volée 2 sur 5 » ; horloge : sans total', () => {
    const rec = { exercise: 'bull25', rules: 2, darts: [] };
    const at = n => { const darts = Array.from({ length: n }, () => ({ segment: 25, multiplier: 1 })); return volleyInfo(trainingState({ ...rec, darts }, darts)); };
    assert.deepEqual(at(0), { n: 1, total: 5, dart: 0 });
    assert.deepEqual(at(4), { n: 2, total: 5, dart: 1 });
    assert.deepEqual(at(15), { n: 5, total: 5, dart: 0 });
    // Haut contre bas : 6 séries de 3 → 6 volées ; la 4e volée vise le 3.
    const hb = Array.from({ length: 9 }, () => ({ segment: 20, multiplier: 1 }));
    const st = trainingState({ exercise: 'hautbas', darts: hb }, hb);
    assert.deepEqual(volleyInfo(st), { n: 4, total: 6, dart: 0 });
    assert.equal(st.blocks[st.cur.i].s, 3);
    // Séance d'avant de 20 fléchettes par série : 7 volées par série (la dernière de 2).
    const v = Array.from({ length: 20 }, () => ({ segment: 20, multiplier: 1 }));
    assert.deepEqual(volleyInfo(trainingState({ exercise: 'vingt', darts: v }, v)), { n: 8, total: 21, dart: 0 });
    // Horloge : la volée compte les fléchettes, sans total.
    const ck = [{ segment: 1, multiplier: 1 }, { segment: 5, multiplier: 1 }, { segment: 2, multiplier: 1 }, { segment: 3, multiplier: 1 }];
    assert.deepEqual(volleyInfo(trainingState({ exercise: 'horloge', darts: ck }, ck)), { n: 2, total: null, dart: 1 });
  });
});

describe('tendances sur les dix dernières séances (3.1)', () => {
  test('progrès, recul, stable, pas assez de séances ; sens du « mieux »', () => {
    assert.deepEqual(trend([1, 2, 3]), { n: 3, mean: 2, slope: null, change: null, arrow: null, better: null });
    const up = trend([10, 11, 12, 13, 14]);
    near(up.slope, 1);
    near(up.change, 4 / 12);
    assert.equal(up.arrow, 'up');
    assert.equal(up.better, true);
    // Une distance qui baisse : flèche vers le bas, mais c'est un progrès.
    const d = trend([50, 45, 40, 35], -1);
    assert.equal(d.arrow, 'down');
    assert.equal(d.better, true);
    assert.equal(trend([50, 55, 60, 65], -1).better, false);
    assert.equal(trend([30, 30.2, 29.9, 30.1, 30]).arrow, 'flat');
    // Seules les dix dernières comptent ; les valeurs vides sont ignorées.
    const t = trend([100, 100, 100, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null]);
    assert.equal(t.n, 10);
    near(t.mean, 5.5);
    assert.equal(trend([]).n, 0);
  });
});

describe('période des stats (3.3)', () => {
  test('raccourcis et plage libre (jours entiers, bornes comprises, remise dans l\'ordre)', () => {
    const now = new Date(2026, 10, 23, 15, 0).getTime();
    const b7 = periodBounds('7j', {}, now);
    assert.equal(b7.from, now - 7 * DAY);
    assert.ok(inPeriod(now - 6 * DAY, b7) && !inPeriod(now - 8 * DAY, b7));
    assert.equal(periodBounds('30j', {}, now).label, '30 derniers jours');
    const all = periodBounds('tout', {}, now);
    assert.ok(inPeriod(0, all) && inPeriod(now, all));
    const r = periodBounds('plage', { from: '2026-11-20', to: '2026-11-03' }, now);
    assert.equal(r.from, new Date(2026, 10, 3).getTime());
    assert.equal(r.to, new Date(2026, 10, 21).getTime());
    assert.ok(inPeriod(new Date(2026, 10, 20, 23, 59).getTime(), r));
    assert.ok(!inPeriod(new Date(2026, 10, 21, 0, 0).getTime(), r));
    assert.equal(r.label, 'du 3/11/2026 au 20/11/2026');
    assert.equal(periodBounds('plage', { from: '2026-11-03' }, now).to, Infinity);
    assert.equal(periodBounds('plage', {}, now).label, 'tout');
    assert.equal(dayStart('2026-02-30'), null);
    assert.equal(isoDay(new Date(2026, 0, 5, 23).getTime()), '2026-01-05');
  });
});

describe('courbes lisibles (3.2)', () => {
  test('abscisses selon le temps, écart minimal, une date seulement quand elle a la place', () => {
    const day = 86400000;
    const ax = timeAxis([0, day, 10 * day], { left: 0, width: 100, gap: 5 });
    near(ax.xs[1], 10);
    near(ax.xs[2], 100);
    const same = timeAxis([0, 1, 2, 10 * day], { left: 0, width: 100, gap: 30 });
    assert.deepEqual(same.xs.slice(0, 3), [0, 30, 60], 'trois séances du même soir écartées');
    assert.equal(same.xs[3], 100);
    assert.deepEqual(labelIndexes([0, 30, 60, 90, 120, 150], 60), [0, 2, 5]);
    assert.deepEqual(labelIndexes([0, 100], 60), [0, 1]);
    assert.deepEqual(timeAxis([5], { left: 10, width: 100 }).xs, [60]);
  });
});

describe('carte de chaleur (3.5)', () => {
  test('trois échelles en jetons de theme.css, zone jamais touchée à part, encre lisible sur chaque couleur', () => {
    const css = readFileSync(new URL('../assets/theme.css', import.meta.url), 'utf8');
    for (const [k, v] of Object.entries(HEAT_COLORS)) assert.match(css, new RegExp(`--heat-${k}: ${v};`), `--heat-${k}`);
    assert.deepEqual(HEAT_SCALES, ['clair', 'fonce', 'couleur']);
    for (const s of HEAT_SCALES) {
      assert.equal(heatColor(s, 0), HEAT_COLORS.none);
      assert.equal(heatColor(s, 1), HEAT_COLORS[`${s}-hi`]);
      for (const v of [0.01, 0.3, 0.6, 1]) {
        const c = heatColor(s, v);
        assert.ok(contrast(inkOn(c), c) >= 4.5, `${s} ${v} : ${c}`);
      }
    }
    // Clair : plus touché = plus clair ; foncé : l'inverse.
    assert.ok(contrast(heatColor('clair', 1), '#000000') > contrast(heatColor('clair', 0.1), '#000000'));
    assert.ok(contrast(heatColor('fonce', 1), '#000000') < contrast(heatColor('fonce', 0.1), '#000000'));
    const svg = boardSvg({ size: 300, heat: k => (k === 'T20' ? 1 : 0), heatScale: 'couleur', counts: s => (s === 20 ? 4 : 0) });
    assert.match(svg, /var\(--heat-couleur-hi\) 100\.0%/);
    assert.match(svg, /<pattern id="hatch\d+"/);
    assert.match(svg, /class="heat none" style="fill:url\(#hatch\d+\)"/);
    assert.match(svg, /<text class="bare c[dl]"[^>]*>4<\/text>/, 'chiffre à même la zone, encre selon le fond');
  });
});
