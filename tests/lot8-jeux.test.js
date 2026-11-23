// Lot 8 du 23/11/2026, section 5 : jeux de cible (règles et scores), défis en X01 solo (mêmes que la soirée), badges
// d'entraînement (rangs, rétroactifs) et petits défis en séance.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { funState, FUN, FUN_KEYS, golfStrokes, drawNumbers, hashSeed, MOITIE_TARGETS } from '../src/engine/fun.js';
import { analyze, trainingState, sessionValue, RULES, EXERCISES, ALL_EXERCISES, volleyInfo, goalOf, cleanGame, soloDefiGame, soloDefiNow, isFunSession } from '../src/engine/training.js';
import { defiResult, DEFI_SET, gameDefis } from '../src/engine/defis.js';
import { computeState } from '../src/engine/x01.js';
import { SECTORS } from '../src/engine/board.js';
import { FEATS, sessionFeats, trainingHonours, tierOf, TRAIN_BADGES, badgeValueText } from '../src/engine/trainbadges.js';
import { trainingRecord } from '../src/data/db.js';

const d = (segment, multiplier = 1, extra = {}) => ({ segment, multiplier, ...extra });
const rep = (n, x) => Array.from({ length: n }, () => x);

describe('jeux de cible (5.1)', () => {
  test('dix jeux, chacun avec ses règles écrites, son score et son sens', () => {
    assert.equal(FUN_KEYS.length, 10);
    for (const k of FUN_KEYS) {
      assert.ok(EXERCISES[k] && EXERCISES[k].fun, k);
      assert.ok(ALL_EXERCISES.includes(k));
      assert.ok(['hit', 'volley'].includes(RULES[k].advance), k);
      assert.ok([1, -1].includes(FUN[k].dir));
      assert.ok(goalOf(k, 'debutant'), `${k} : objectif`);
      assert.equal(goalOf(k, 'debutant').dir, FUN[k].dir);
      assert.ok(isFunSession({ exercise: k }));
    }
    for (const k of ['serpent', 'rebours', 'golf', 'killer']) assert.equal(RULES[k].advance, 'hit', `${k} : la cible avance dès qu'elle est touchée`);
    for (const k of ['shanghai', 'moitie', 'roulette', 'mur60', 'plushaut']) assert.equal(RULES[k].advance, 'volley');
  });

  test('Serpent : l\'ordre de la cible, on avance au toucher, score = fléchettes', () => {
    const darts = SECTORS.flatMap(s => [d(0), d(s)]);
    const fs = funState('serpent', darts);
    assert.equal(fs.done, true);
    assert.equal(fs.score, 40);
    assert.deepEqual(funState('serpent', [d(20), d(1)]).cur, { s: 18, z: 'any' });
    assert.throws(() => funState('serpent', [...darts, d(20)]));
    assert.deepEqual(funState('rebours', [d(20)]).cur, { s: 19, z: 'any' });
  });

  test('Golf : triple 1, double 2, simple 3, manqué 5 ; par 27', () => {
    assert.deepEqual([golfStrokes(d(1, 3)), golfStrokes(d(1, 2)), golfStrokes(d(1)), golfStrokes(d(0))], [1, 2, 3, 5]);
    const darts = [d(1, 3), d(5), d(5), d(5), d(3), d(3, 2), ...[4, 5, 6, 7, 8, 9].map(s => d(s))];
    const fs = funState('golf', darts);
    assert.equal(fs.done, true);
    assert.deepEqual(fs.extra.holes.map(h => h.strokes), [1, 5, 3, 3, 3, 3, 3, 3, 3]);
    assert.equal(fs.score, 27);
    assert.equal(fs.extra.holes[2].darts, 1);
  });

  test('Shanghai : numéro × multiplicateur, +100 pour simple, double et triple', () => {
    const darts = [d(1), d(1, 2), d(1, 3), d(2, 3), d(5), d(0), ...rep(15, d(0))];
    const fs = funState('shanghai', darts);
    assert.equal(fs.done, true);
    assert.deepEqual(fs.extra.rounds.slice(0, 2), [{ s: 1, points: 6, shanghai: true }, { s: 2, points: 6, shanghai: false }]);
    assert.equal(fs.score, 112);
  });

  test('Moitié : départ 40, volée ratée = total divisé par deux', () => {
    assert.deepEqual(MOITIE_TARGETS, [20, 19, 18, 17, 16, 15, 25]);
    const darts = [d(20), d(20, 3), d(1), ...rep(3, d(5)), ...rep(12, d(0)), d(25, 2), d(25), d(0)];
    const fs = funState('moitie', darts);
    assert.equal(fs.done, true);
    // 40 + 80 = 120 ; 60 ; 30 ; 15 ; 7 ; 3 ; + 75 = 78
    assert.deepEqual(fs.extra.rounds.map(r => r.total), [120, 60, 30, 15, 7, 3, 78]);
    assert.equal(fs.score, 78);
  });

  test('Roulette : cibles tirées au sort d\'après la séance (les mêmes à la reprise)', () => {
    const a = funState('roulette', [], 't-1').extra.list, b = funState('roulette', [], 't-1').extra.list;
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, funState('roulette', [], 't-2').extra.list);
    assert.ok(a.every(s => s >= 1 && s <= 20) && a.length === 10);
    const fs = funState('roulette', [d(a[0], 3), d(a[0]), d(0)], 't-1');
    assert.equal(fs.live, 4);
  });

  test('Mur de 60, Plus haut, Pile 100', () => {
    const m = funState('mur60', [d(20, 3), d(0), d(0), d(20), d(20), d(19), ...rep(24, d(1))]);
    assert.equal(m.score, 1);
    const p = funState('plushaut', [...rep(3, d(5)), ...rep(3, d(20)), ...rep(3, d(1)), ...rep(3, d(1)), ...rep(3, d(1))]);
    // 15 ; 60 (réussie) ; 3 (vie) ; 3 (vie) ; 3 (vie) → fini, 1 réussie
    assert.equal(p.done, true);
    assert.equal(p.score, 1);
    assert.throws(() => funState('plushaut', [...rep(15, d(1)), d(1)]));
    const c = funState('cent', [d(20, 3), d(20, 3), d(0), d(20, 2), d(20)]);
    // 120 : dépassé, retour à 0 au milieu de la volée ; puis 40 + 20… pas fini
    assert.equal(c.extra.busts, 1);
    assert.equal(c.extra.remaining, 40);
    assert.equal(c.done, false);
    const c2 = funState('cent', [d(20, 3), d(20), d(20)]);
    assert.equal(c2.done, true);
    assert.equal(c2.score, 3);
  });

  test('Killer solo : ton numéro (3 marques), puis trois adversaires à 3 vies', () => {
    const [mine, ...foes] = drawNumbers('t-k|killer', 4);
    assert.equal(new Set([mine, ...foes]).size, 4);
    const darts = [d(mine), d(mine, 2), ...foes.map(f => d(f, 3))];
    const fs = funState('killer', darts, 't-k');
    assert.equal(fs.done, true);
    assert.equal(fs.score, 5);
    assert.equal(funState('killer', [d(mine, 3)], 't-k').extra.killer, true);
    assert.ok(hashSeed('a') !== hashSeed('b'));
  });

  test('dans la séance : saisie, volée, analyse, chiffre principal', () => {
    const rec = { id: 'g1', exercise: 'golf', darts: [d(1, 3), d(2, 1, { ring: 'in' })] };
    const st = trainingState(rec, rec.darts);
    assert.ok(st.fun);
    assert.deepEqual(st.cur, { i: 2, s: 3, z: 'any', n: null, k: 0 });
    assert.deepEqual(volleyInfo(st), { n: 1, total: null, dart: 2 });
    const a = analyze(rec);
    assert.equal(a.value, null, 'pas fini');
    assert.match(a.messages[0].text, /2 trous joués, 4 coups/);
    const full = { id: 'g2', exercise: 'cent', darts: [d(20, 3), d(20), d(20)] };
    const af = analyze(full);
    assert.deepEqual(sessionValue(full, af), { v: 3, fmt: 'int', dir: -1, label: 'Fléchettes pour 100' });
    assert.equal(af.dist, null, 'Pile 100 : sans cible, sans précision');
    assert.equal(af.rate, null);
  });
});

describe('défis en X01 solo (5.2)', () => {
  test('réglage gardé, même tirage et même validation qu\'en soirée', () => {
    assert.equal(cleanGame('x01', { defis: 'souvent' }).defis, 'souvent');
    assert.equal(cleanGame('x01', { defis: 'n\'importe' }).defis, undefined);
    assert.equal(cleanGame('cricket', { defis: 'souvent' }).defis, undefined);
    const darts = Array.from({ length: 30 }, (_, i) => d(20, i % 3 ? 1 : 3));
    const rec = { id: 't-defis', exercise: 'x01', game: { startScore: 701, outMode: 'double', legs: 1, defis: 'souvent' }, darts };
    const dg = soloDefiGame(rec);
    assert.deepEqual(dg, { id: 't-defis', defis: 'souvent', defiSet: DEFI_SET, defiDecl: null });
    const gs = computeState({ startScore: 701, outMode: 'double', legsToWin: 1, players: ['solo'] }, darts);
    const mine = analyze(rec).extra.defis;
    assert.deepEqual(mine, gameDefis(dg, gs), 'mêmes défis que la soirée pour la même « partie »');
    assert.ok(mine.length > 0, 'souvent : au moins un défi sur 10 volées');
    for (const x of mine) assert.deepEqual(defiResult(dg, gs, x.index), { key: x.key, player: 0, ok: x.ok, gage: x.gage, ...(x.declare ? { declare: true, declared: x.declared } : {}) });
    const st = trainingState(rec, darts);
    const now = soloDefiNow(rec, st);
    assert.ok(now === null || typeof now.key === 'string');
    assert.equal(soloDefiNow({ ...rec, game: { startScore: 701 } }, st), null, 'sans défis');
    // Déclaration « main gauche » gardée par la base.
    const base = { id: 't', startedAt: 1, endedAt: 2, player: 'p', exercise: 'x01', darts: [] };
    assert.deepEqual(trainingRecord({ ...base, defiDecl: { 3: true, x: 1 } }).defiDecl, { 3: true });
  });
});

describe('badges d\'entraînement et petits défis (5.3, 5.4)', () => {
  test('petits défis d\'une volée', () => {
    const rec = { id: 's', exercise: 'groupement', darts: [d(20, 1, { ring: 'in' }), d(20, 1, { ring: 'in' }), d(20, 1, { ring: 'in' }), d(20, 3), d(20), d(1), d(25), d(25, 2), d(0)] };
    const f = sessionFeats(rec);
    assert.deepEqual(f.filter(x => x.volley === 1).map(x => x.key).sort(), ['memecase', 'parfaite', 'trio']);
    assert.deepEqual(f.filter(x => x.volley === 2).map(x => x.key), []);
    assert.deepEqual(f.filter(x => x.volley === 3).map(x => x.key), ['bulls']);
    assert.deepEqual(sessionFeats({ id: 'x', exercise: 'x01', game: {}, darts: rep(3, d(20)) }), [], 'pas sur les jeux X01 et Cricket');
    assert.ok(Object.keys(FEATS).length >= 4);
  });

  test('rangs : seuils hauts, sens du « mieux »', () => {
    assert.equal(tierOf('assidu', 4), 0);
    assert.equal(tierOf('assidu', 14), 2);
    assert.equal(tierOf('elite', 41), 0);
    assert.equal(tierOf('elite', 25), 2);
    assert.equal(tierOf('elite', 20), 3);
    assert.equal(badgeValueText('elite', 25), '2,5 cm');
    assert.equal(badgeValueText('progres', 0.32), '+32 %');
    for (const b of Object.values(TRAIN_BADGES)) assert.equal(b.tiers.length, 3);
  });

  test('calcul rétroactif sur l\'historique : jours d\'affilée, volume, groupement, progrès, défis', () => {
    const day = 86400000, t0 = new Date(2026, 9, 1, 20).getTime();
    const tight = rep(9, d(20, 1, { pos: [0, -0.4] }));
    const list = [];
    for (let i = 0; i < 6; i++) list.push({ id: `s${i}`, player: 'p', startedAt: t0 + i * day, endedAt: t0 + i * day + 1000, exercise: 'groupement', mode: 'coach', darts: tight });
    list.push({ id: 'x', player: 'p', startedAt: t0 + 20 * day, endedAt: t0 + 20 * day + 1, exercise: 'groupement', mode: 'coach', darts: tight, excluded: true });
    list.push({ id: 'o', player: 'q', startedAt: t0, endedAt: t0 + 1, exercise: 'groupement', mode: 'coach', darts: tight });
    const h = trainingHonours(list, 'p');
    const by = k => h.badges.find(b => b.key === k);
    assert.equal(h.sessions, 6, 'mises de côté et autres joueurs exclus');
    assert.equal(by('assidu').value, 6);
    assert.equal(by('assidu').tier, 1);
    assert.deepEqual(by('assidu').got, [{ tier: 1, sessionId: 's4', at: t0 + 4 * day }], 'le rang garde la séance où il a été gagné');
    assert.equal(by('volume').value, 54);
    assert.ok(by('mouchoir').value < 1e-9);
    assert.equal(by('mouchoir').tier, 3);
    assert.equal(h.feats.length, 6 * 3 * 3, 'parfaite, trio, même trou à chaque volée');
    assert.equal(by('defis').tier, 2);
    // Progrès : 10 séances de score libre, de 30 à 60 de moyenne.
    const prog = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, player: 'p', startedAt: t0 + i * 3 * day, endedAt: t0 + i * 3 * day + 1, exercise: 'scorelibre', mode: 'coach',
      darts: Array.from({ length: 30 }, () => d(i < 5 ? 10 : 20)) }));
    const hp = trainingHonours(prog, 'p');
    assert.equal(hp.badges.find(b => b.key === 'progres').value, 1, '+100 %');
    assert.equal(hp.badges.find(b => b.key === 'assidu').value, 1, 'un jour sur trois : pas d\'affilée');
  });
});
