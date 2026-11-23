// Entraînement, version 0.14.0 : jeux X01 et Cricket en solo (moteur, analyse, forme enregistrée, sauvegarde), et
// stats : triples, doubles et carte de chaleur réservés aux fléchettes lancées « comme en partie ».
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { trainingState, analyze, sessionValue, suggestNext, levelOf, goalMet, goalOf, cleanGame, gameConfig, gameLabel, gamePart,
  isGameSession, ALL_EXERCISES, GAME_EXERCISES, EXERCISES, plannedDarts } from '../src/engine/training.js';
import { playerStats } from '../src/engine/stats.js';
import { computeCricket, cricketSummary } from '../src/engine/cricket.js';
import { trainingRecord } from '../src/data/db.js';
import { makeBackup, parseBackup, importPlan } from '../src/data/backup.js';
import { simulateSoloX01, simulateSoloCricket, rng } from '../src/ui/mock.js';

const d = (segment, multiplier = 1, ring) => (ring ? { segment, multiplier, ring } : { segment, multiplier });
const x01 = (darts, game = { startScore: 301, outMode: 'double', legs: 1 }, extra = {}) => ({ id: `x${Math.random()}`, startedAt: 1, endedAt: 2, player: 'p', mode: 'jeu', exercise: 'x01', game, darts, ...extra });
const ck = (darts, game = { legs: 1 }, extra = {}) => ({ id: `c${Math.random()}`, startedAt: 1, endedAt: 2, player: 'p', mode: 'jeu', exercise: 'cricket', game, darts, ...extra });
const T20 = d(20, 3);
// 301 sortie double en 9 fléchettes : 180, puis T20 T19 (117) reste 4… on fait simple : 180, 100 (T20 S20 S20), puis D…
// 301 − 180 = 121 ; T20 T11 D14 = 60 + 33 + 28 = 121 : fini en 6 fléchettes.
const NINE = [T20, T20, T20, T20, d(11, 3), d(14, 2)];

describe('jeux en solo : réglages et forme enregistrée', () => {
  test('réglages nettoyés, valeurs par défaut, nom court', () => {
    assert.deepEqual(cleanGame('x01', null), { startScore: 501, outMode: 'double', legs: 1 });
    assert.deepEqual(cleanGame('x01', { startScore: 701, outMode: 'single', legs: 3, x: 1 }), { startScore: 701, outMode: 'single', legs: 3 });
    assert.deepEqual(cleanGame('x01', { startScore: 401, outMode: 'master', legs: 40 }), { startScore: 501, outMode: 'double', legs: 1 });
    assert.deepEqual(cleanGame('cricket', { legs: 5, startScore: 301 }), { legs: 5 });
    assert.equal(cleanGame('groupement', { legs: 3 }), null);
    assert.equal(gameLabel({ exercise: 'x01', game: { startScore: 301, outMode: 'single', legs: 3 } }), '301 simple · 3 manches');
    assert.equal(gameLabel({ exercise: 'cricket', game: { legs: 1 } }), '');
    assert.deepEqual(gameConfig({ exercise: 'cricket', game: { legs: 3 } }), { game: 'cricket', players: ['solo'], mode: 'sans', legsToWin: 3 });
    assert.deepEqual(GAME_EXERCISES, ['x01', 'cricket']);
    assert.ok(ALL_EXERCISES.includes('x01') && ALL_EXERCISES.includes('cricket') && ALL_EXERCISES.at(-1) === 'libre');
    assert.equal(plannedDarts({ exercise: 'x01' }), null);
  });

  test('trainingRecord garde le mode « jeu » et les réglages ; une séance d’avant reste telle quelle', () => {
    const r = trainingRecord(x01([d(20, 1, 'out')], { startScore: 301, outMode: 'single', legs: 3, bidon: 1 }));
    assert.equal(r.mode, 'jeu');
    assert.deepEqual(r.game, { startScore: 301, outMode: 'single', legs: 3 });
    assert.deepEqual(r.darts, [d(20, 1, 'out')]);
    const old = trainingRecord({ id: 'o', startedAt: 1, endedAt: 2, player: 'p', mode: 'coach', exercise: 'groupement', darts: [], game: { legs: 3 } });
    assert.deepEqual(Object.keys(old).sort(), ['darts', 'endedAt', 'exercise', 'id', 'mode', 'player', 'setId', 'startedAt'], 'exercice : pas de réglages de jeu');
    assert.deepEqual(trainingRecord(ck([])).game, { legs: 1 });
  });

  test('sauvegarde : une séance de jeu fait l’aller-retour', () => {
    const T = [trainingRecord(x01(NINE, { startScore: 301, outMode: 'double', legs: 1 }, { id: 't1', setId: 'A' })), trainingRecord(ck([d(20, 3)], { legs: 3 }, { id: 't2', stopped: true }))];
    const base = { players: [], games: [], current: null, display: { theme: 'auto' }, lastSetup: null };
    const b = parseBackup(JSON.stringify(makeBackup({ ...base, trainings: T, training: null, dartSets: [] })));
    const plan = importPlan({ ...base, trainings: [], training: null, dartSets: [] }, b, 'replace');
    assert.deepEqual(plan.state.trainings, T);
  });
});

describe('X01 solo', () => {
  test('état : reste, bust, fin de partie ; plus rien après la fin', () => {
    let st = trainingState(x01([T20, T20, T20]), [T20, T20, T20]);
    assert.equal(st.game, 'x01');
    assert.equal(st.gs.remaining[0], 121);
    assert.equal(st.done, false);
    assert.equal(st.visitDarts, 0);
    st = trainingState(x01([]), [T20, T20, T20, T20, T20]);
    assert.equal(st.gs.lastEvent, 'bust', '121 − 120 = 1 : bust en sortie double');
    assert.equal(st.gs.remaining[0], 121);
    st = trainingState(x01([]), NINE);
    assert.equal(st.done, true);
    assert.throws(() => trainingState(x01([]), [...NINE, T20]));
    const ss = trainingState(x01([], { startScore: 301, outMode: 'single', legs: 1 }), [T20, T20, T20, T20, T20, d(1)]);
    assert.equal(ss.done, true, 'sortie simple : 121 = T20 T20 + 1');
  });

  test('analyse : mêmes chiffres que les stats d’une partie X01 au même déroulé', () => {
    const darts = simulateSoloX01({ startScore: 501, outMode: 'double', legs: 3 }, rng(3), { spread: 0.45 });
    const r = x01(darts, { startScore: 501, outMode: 'double', legs: 3 });
    const a = analyze(r);
    assert.equal(a.done, true);
    assert.equal(a.game, true);
    assert.equal(a.rate, null, 'pas de cible imposée : pas de précision');
    const ps = playerStats([{ id: 'g', startedAt: 1, config: { startScore: 501, outMode: 'double', legsToWin: 3, players: ['p'] }, darts }], 'p');
    assert.equal(a.extra.average, ps.average);
    assert.equal(a.extra.finishDarts, ps.doubleDarts);
    assert.equal(a.extra.finishHits, 3, 'trois manches, trois finitions');
    assert.equal(a.extra.finishFlags.filter(f => f > 0).length, ps.doubleDarts);
    assert.equal(a.extra.finishFlags.filter(f => f === 2).length, 3);
    assert.equal(a.extra.legs.length, 3);
    assert.equal(a.extra.legs.reduce((n, l) => n + l.darts, 0), darts.length);
    assert.equal(a.extra.credit.length, darts.length);
    assert.equal(a.extra.credit.reduce((n, c) => n + c, 0), ps.points, 'points comptés fléchette par fléchette (bust : 0)');
    assert.equal(a.extra.triples, darts.filter(x => x.multiplier === 3).length);
    assert.equal(a.extra.doubles, darts.filter(x => x.multiplier === 2).length);
    assert.deepEqual(sessionValue(r, a), { v: ps.average, fmt: 'avg', dir: 1, label: 'Moyenne / 3 fl.' });
    assert.match(a.messages[0].text, /^3 manches en \d+ fléchettes, moyenne/);
  });

  test('séance arrêtée en pleine volée : la volée pas finie ne compte pas dans la moyenne', () => {
    const r = x01([T20, T20, T20, d(20)], undefined, { stopped: true });
    const a = analyze(r);
    assert.equal(a.done, false);
    assert.equal(a.extra.average, 180);
    assert.deepEqual(a.extra.credit, [60, 60, 60, null]);
    assert.match(a.messages[0].text, /^Arrêté à 101 restants/);
    assert.equal(gamePart('x01', r.darts, a.extra.credit).value, 180);
  });

  test('finition faible au double : le coach propose les doubles', () => {
    // 301 → 121 → 40, puis six fléchettes à côté avant le D20 : 1 finition sur 7 fléchettes au double.
    const darts = [T20, T20, T20, T20, d(1), d(20), ...Array(6).fill(d(0)), d(20, 2)];
    const a = analyze(x01(darts));
    assert.equal(a.done, true);
    assert.equal(a.extra.finishDarts, 7);
    assert.equal(a.extra.finishHits, 1);
    assert.deepEqual(a.next, { key: 'doubles', why: 'la finition au double est à travailler' });
    assert.ok(a.messages.some(m => /^Finition : 1 sur 7 fléchettes au double \(14 %\)\.$/.test(m.text) && m.tip));
  });
});

describe('Cricket solo', () => {
  test('marques utiles par fléchette, fermeture, MPR ; manches', () => {
    const close = [d(20, 3), d(19, 3), d(18, 3), d(17, 3), d(16, 3), d(15, 3), d(25, 2), d(25, 1)];
    const r = ck(close);
    const st = trainingState(r, close);
    assert.equal(st.done, true);
    const a = analyze(r);
    assert.deepEqual(a.extra.credit, [3, 3, 3, 3, 3, 3, 2, 1]);
    assert.equal(a.extra.mpr, (21 / 8) * 3);
    assert.deepEqual(sessionValue(r, a), { v: (21 / 8) * 3, fmt: 'mpr', dir: 1, label: 'Marques / volée' });
    assert.match(a.messages[0].text, /^Tout fermé en 3 volées \(8 fléchettes\), MPR 7,88\./);
    // Une cible déjà fermée ne rapporte plus rien (seul, pas de points).
    const b = analyze(ck([d(20, 3), d(20, 3), d(19)]));
    assert.deepEqual(b.extra.credit, [3, 0, 1]);
    assert.equal(b.extra.closed, 1);
    assert.equal(b.done, false);
  });

  test('analyse : mêmes marques que le moteur du Cricket, sur plusieurs manches', () => {
    const darts = simulateSoloCricket({ legs: 3 }, rng(9), { spread: 0.45 });
    const r = ck(darts, { legs: 3 });
    const a = analyze(r);
    assert.equal(a.done, true);
    const s = computeCricket({ game: 'cricket', players: ['solo'], mode: 'sans', legsToWin: 3 }, darts);
    const sum = cricketSummary(s, 0);
    assert.equal(a.extra.credit.reduce((n, c) => n + c, 0), sum.marks);
    assert.equal(a.extra.marks, 3 * 21, 'trois manches de 21 marques');
    assert.equal(a.extra.legs.length, 3);
    assert.ok(a.extra.legs.every(l => l.done && l.marks === 21));
    assert.equal(a.extra.legs.reduce((n, l) => n + l.rounds, 0), s.visits.length);
    for (const t of [20, 19, 18, 17, 16, 15, 25]) assert.equal(a.extra.marksByTarget[t], 9);
  });
});

describe('jeux et coach', () => {
  test('par jeu de fléchettes, quand le jeu a changé pendant la partie', () => {
    const r = x01([T20, T20, T20, d(20), d(20), d(20), d(5)], undefined, { setId: 'A', setChanges: [{ at: 3, setId: 'B' }] });
    const a = analyze(r);
    assert.deepEqual(a.extra.bySet.map(x => [x.setId, x.darts, x.value]), [['A', 3, 180], ['B', 4, 60]]);
  });

  test('objectifs par niveau ; un jeu ne compte ni pour le niveau ni pour l’exercice proposé', () => {
    assert.deepEqual(goalOf('x01', 'debutant'), { v: 30, dir: 1 });
    assert.deepEqual(goalOf('cricket', 'intermediaire'), { v: 1.5, dir: 1 });
    const r = x01(NINE);
    assert.equal(goalMet(r, analyze(r), 'confirme'), true);
    const stopped = x01([d(1)], undefined, { stopped: true });
    assert.equal(goalMet(stopped, analyze(stopped), 'debutant'), null, 'partie pas finie');
    const list = [x01(NINE, undefined, { startedAt: 5 }), ck([d(20)], undefined, { startedAt: 6 })];
    assert.equal(levelOf(list, 'p').level, 'debutant');
    assert.deepEqual(suggestNext(list, 'p'), { key: 'groupement', why: 'pour commencer' });
    assert.ok(isGameSession(list[0]) && !isGameSession({ exercise: 'groupement' }));
    assert.equal(EXERCISES.x01.game, 'x01');
  });
});
