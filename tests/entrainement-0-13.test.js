// Entraînement, version 0.13.0 : couleurs des jeux de fléchettes, exercices du niveau intermédiaire et objectifs,
// jeu changé en cours de séance, gestion des séances (note, mise de côté) — moteur, forme enregistrée, sauvegarde.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trainingState, analyze, sessionValue, levelOf, suggestNext, goalMet, goalOf, GOALS, LEVEL_UP, LEVEL_EXERCISES, ALL_EXERCISES,
  EXERCISES, COACH_ORDER, setRuns, setAt, setsUsed, cleanSetChanges, plannedDarts, completeSessions } from '../src/engine/training.js';
import { dartSetRecord, PARTS, DART_COLOR_NAMES } from '../src/engine/dartsets.js';
import { DART_COLORS } from '../src/ui/theme.js';
import { trainingRecord } from '../src/data/db.js';
import { makeBackup, parseBackup, importPlan } from '../src/data/backup.js';

const d = (segment, multiplier = 1, ring) => (ring ? { segment, multiplier, ring } : { segment, multiplier });
const si = s => d(s, 1, 'in');
const rec = (exercise, darts, extra = {}) => ({ id: `r${Math.random()}`, startedAt: 1, endedAt: 2, player: 'p', mode: 'coach', exercise, darts, ...extra });
const times = (n, f) => Array.from({ length: n }, (_, i) => f(i));

describe('armurerie : couleurs des pièces', () => {
  test('une couleur par pièce, gardée si elle est dans la liste ; rien d’autre', () => {
    const x = dartSetRecord({ id: 'a', name: 'A', colors: { point: 'argent', barrel: 'noir', shaft: 'fuchsia', flight: 'rouge', grip: 'or' } });
    assert.deepEqual(x.colors, { point: 'argent', barrel: 'noir', flight: 'rouge' });
    assert.equal(dartSetRecord({ id: 'a', name: 'A', colors: { shaft: 'x' } }).colors, undefined, 'aucune couleur valable : pas de champ');
    assert.equal(dartSetRecord({ id: 'a', name: 'A' }).colors, undefined, 'jeu d’avant la 0.13 : inchangé');
    assert.deepEqual(Object.keys(PARTS), ['point', 'barrel', 'shaft', 'flight']);
  });

  test('chaque couleur a sa teinte dans theme.js et son jeton --dart-* (identique) dans theme.css', () => {
    const css = readFileSync(new URL('../assets/theme.css', import.meta.url), 'utf8');
    assert.deepEqual(Object.keys(DART_COLORS), Object.keys(DART_COLOR_NAMES));
    for (const [k, hex] of Object.entries(DART_COLORS)) {
      const m = css.match(new RegExp(`--dart-${k}:\\s*(#[0-9A-Fa-f]{6})`));
      assert.ok(m, `jeton --dart-${k}`);
      assert.equal(m[1].toUpperCase(), hex.toUpperCase());
    }
  });
});

describe('niveau intermédiaire : exercices', () => {
  test('cinq exercices de plus (triples, doubles, centre), le score libre reste au programme', () => {
    assert.deepEqual(LEVEL_EXERCISES.intermediaire, ['triple20', 'doubles', 'triples', 'horlogedoubles', 'bull25', 'scorelibre']);
    assert.deepEqual(LEVEL_EXERCISES.debutant, COACH_ORDER);
    for (const k of ALL_EXERCISES) assert.ok(EXERCISES[k], k);
    assert.equal(plannedDarts({ exercise: 'triple20' }), 30);
    assert.equal(plannedDarts({ exercise: 'triples' }), 30);
    assert.equal(plannedDarts({ exercise: 'doubles' }), 27);
    assert.equal(plannedDarts({ exercise: 'horlogedoubles' }), 60, '3 fléchettes au plus par double');
    assert.equal(plannedDarts({ exercise: 'horloge' }), null);
    assert.deepEqual(EXERCISES.doubles.blocks.map(b => [b.s, b.z, b.n]), [[20, 'd', 9], [16, 'd', 9], [8, 'd', 9]]);
  });

  test('tour des doubles : suivant dès qu’il est touché, ou après 3 fléchettes ; doubles touchés sur 20', () => {
    const cfg = { exercise: 'horlogedoubles' };
    let st = trainingState(cfg, [d(1, 2)]);
    assert.deepEqual([st.cur.s, st.cur.z, st.cur.k], [2, 'd', 0]);
    st = trainingState(cfg, [d(1, 2), si(2), d(2, 3), d(0)]);
    assert.deepEqual([st.cur.s, st.cur.k], [3, 0], '3 fléchettes manquées : au D3');
    const darts = [d(1, 2), si(2), d(2, 3), d(0)];
    for (let s = 3; s <= 20; s++) darts.push(...(s % 2 ? [d(s, 2)] : [si(s), si(s), si(s)]));
    st = trainingState(cfg, darts);
    assert.equal(st.done, true);
    const a = analyze(rec('horlogedoubles', darts));
    assert.equal(a.extra.hitCount, 10);
    assert.deepEqual(sessionValue(rec('horlogedoubles', darts), a), { v: 10, fmt: 'int', dir: 1, label: 'Doubles touchés' });
    assert.match(a.messages[0].text, /10 doubles sur 20/);
    assert.ok(a.messages.some(m => /Manqués : D2, D4/.test(m.text)));
    assert.throws(() => trainingState(cfg, [...darts, d(1, 2)]));
  });

  test('triple 20 : part de triples, part restée dans le 20, moyenne par volée ; doubles : part de doubles', () => {
    const darts = times(30, i => (i % 5 === 0 ? d(20, 3) : i % 5 === 1 ? d(1) : si(20)));
    const a = analyze(rec('triple20', darts));
    assert.equal(Math.round(a.rate * 100), 20);
    assert.equal(Math.round(a.extra.sector * 100), 80);
    assert.ok(a.extra.average > 0);
    assert.ok(a.messages.some(m => /dans le bon secteur/.test(m.text)));
    const b = analyze(rec('doubles', times(27, i => (i % 9 < 2 ? d([20, 16, 8][Math.floor(i / 9)], 2) : d(0)))));
    assert.equal(b.perTarget.length, 3);
    assert.equal(Math.round(b.rate * 100), 22);
  });
});

describe('objectifs et passage de niveau', () => {
  test('un objectif par exercice et par niveau, de plus en plus exigeant', () => {
    for (const k of ALL_EXERCISES.filter(x => x !== 'libre')) {
      const g = GOALS[k];
      assert.ok(g, k);
      const dir = goalOf(k, 'debutant').dir;
      assert.ok(dir > 0 ? g.debutant < g.intermediaire && g.intermediaire < g.confirme : g.debutant > g.intermediaire && g.intermediaire > g.confirme, k);
    }
    assert.equal(goalOf('libre', 'debutant'), null);
    // Horloge : au plus 60 fléchettes pour le débutant.
    const clock = n => rec('horloge', [...times(n - 20, () => d(0)), ...times(20, i => si(i + 1))]);
    assert.equal(goalMet(clock(60), analyze(clock(60)), 'debutant'), true);
    assert.equal(goalMet(clock(61), analyze(clock(61)), 'debutant'), false);
    assert.equal(goalMet(rec('groupement', [si(20)]), analyze(rec('groupement', [si(20)])), 'debutant'), null, 'séance incomplète');
  });

  test('critères : ceux du niveau suivant, objectif du niveau actuel tenu 3 séances de suite', () => {
    assert.deepEqual(LEVEL_UP.intermediaire.exercises, ['groupement', 'scorelibre']);
    assert.deepEqual(LEVEL_UP.confirme.exercises, ['triple20', 'doubles', 'scorelibre']);
    const g = at => ({ ...rec('groupement', times(9, () => si(20))), startedAt: at });
    // Score libre à v par volée : 3 fléchettes de v / 3 (20 : un 20 et deux hors cible).
    const sc = (at, v) => ({ ...rec('scorelibre', times(30, i => (v === 20 ? (i % 3 ? d(0) : si(20)) : si(v / 3)))), startedAt: at });
    const t20 = (at, n) => ({ ...rec('triple20', times(30, i => (i < n ? d(20, 3) : si(20)))), startedAt: at });
    const db = (at, n) => ({ ...rec('doubles', times(27, i => (i % 9 < n ? d([20, 16, 8][Math.floor(i / 9)], 2) : d(0)))), startedAt: at });
    const base = [g(1), g(2), g(3), sc(4, 20), sc(5, 20), sc(6, 20)];
    assert.deepEqual(levelOf(base, 'p').level, 'debutant', 'score libre à 20 par volée : pas assez');
    const inter = [g(1), g(2), g(3), sc(4, 30), sc(5, 30), sc(6, 30)];
    const lv = levelOf(inter, 'p');
    assert.equal(lv.level, 'intermediaire');
    assert.equal(lv.next, 'confirme');
    assert.deepEqual(lv.criteria.map(c => [c.exercise, c.goal.v]), [['triple20', 0.12], ['doubles', 0.2], ['scorelibre', 45]]);
    const conf = [...inter, t20(7, 4), t20(8, 4), t20(9, 4), db(10, 2), db(11, 2), db(12, 2), sc(13, 45), sc(14, 45), sc(15, 45)];
    assert.equal(levelOf(conf, 'p').level, 'confirme');
    assert.equal(levelOf(conf, 'p').next, null);
    // Séances mises de côté : ni dans le niveau, ni dans l'exercice proposé.
    const off = inter.map((r, i) => (i === 2 ? { ...r, excluded: true } : r));
    assert.equal(levelOf(off, 'p').level, 'debutant');
    assert.equal(completeSessions(off, 'p').length, 5);
  });

  test('exercice proposé : celui du niveau jamais fait, puis le moins récent ; le T20 réussi mène aux triples 20 et 19', () => {
    const g = at => ({ ...rec('groupement', times(9, () => si(20))), startedAt: at });
    // Simples intérieurs et extérieurs en alternance : centrés sur le point visé, aucun écart à corriger.
    const sc = at => ({ ...rec('scorelibre', times(30, i => (i % 2 ? si(20) : d(20, 1, 'out')))), startedAt: at });
    const inter = [g(1), g(2), g(3), sc(4), sc(5), sc(6)];
    assert.equal(levelOf(inter, 'p').level, 'intermediaire');
    assert.deepEqual(suggestNext(inter, 'p'), { key: 'triple20', why: 'pas encore fait (niveau intermédiaire)' });
    const t20 = { ...rec('triple20', times(30, i => (i % 3 === 0 ? d(20, 3) : i % 3 === 1 ? si(20) : d(20, 1, 'out')))), startedAt: 9 };
    assert.equal(suggestNext([...inter, t20], 'p').key, 'triples');
    assert.equal(suggestNext([], 'p').key, 'groupement', 'débutant : comme avant');
  });
});

describe('jeu changé en cours de séance', () => {
  const r = { ...rec('groupement', times(9, i => (i < 6 ? si(20) : si(1)))), setId: 'A', setChanges: [{ at: 3, setId: 'B' }, { at: 6, setId: 'A' }] };
  test('jeu de chaque fléchette, jeux utilisés', () => {
    assert.deepEqual(setRuns(r).map(x => [x.setId, x.from, x.to]), [['A', 0, 3], ['B', 3, 6], ['A', 6, Infinity]]);
    assert.deepEqual([0, 2, 3, 5, 6, 8, 9].map(i => setAt(r, i)), ['A', 'A', 'B', 'B', 'A', 'A', 'A']);
    assert.deepEqual(setsUsed(r), ['A', 'B']);
    assert.deepEqual(setsUsed({ ...rec('groupement', []), setId: 'A' }), ['A']);
    assert.deepEqual(setsUsed({ ...rec('groupement', [si(1)]), setId: 'A', setChanges: [{ at: 1, setId: 'B' }] }), ['A'], 'aucune fléchette avec B');
    assert.deepEqual(cleanSetChanges({ setId: 'A', setChanges: [{ at: 0, setId: 'B' }, { at: 2, setId: 'B' }, { at: 4, setId: 'C' }] }, 4), { setId: 'B', setChanges: [] });
  });

  test('analyse par jeu quand il a changé (et rien de plus sinon)', () => {
    const a = analyze(r);
    assert.deepEqual(a.extra.bySet.map(x => [x.setId, x.darts, x.hits]), [['A', 6, 3], ['B', 3, 3]]);
    assert.ok(a.messages.some(m => m.kind === 'sets'));
    assert.equal(analyze({ ...r, setChanges: undefined }).extra.bySet, undefined);
  });

  test('séance enregistrée : changements de jeu, note, mise de côté gardés ; le reste nettoyé', () => {
    const base = { id: 't', startedAt: 1, endedAt: 2, player: 'p', setId: 'A', mode: 'coach', exercise: 'groupement', darts: [] };
    const x = trainingRecord({ ...base, setChanges: [{ at: 4, setId: 'B' }, { at: 0, setId: 'C' }, { at: 2.5, setId: 'D' }, { at: 4, setId: 'E' }, { at: 7, setId: null }, null, { at: 8, setId: 5 }], note: 'nouvelle prise', excluded: true });
    assert.deepEqual(x.setChanges, [{ at: 4, setId: 'E' }, { at: 7, setId: null }]);
    assert.equal(x.note, 'nouvelle prise');
    assert.equal(x.excluded, true);
    const old = trainingRecord(base);
    assert.deepEqual(Object.keys(old).sort(), ['darts', 'endedAt', 'exercise', 'id', 'mode', 'player', 'setId', 'startedAt'], 'séance d’avant : rien de plus');
    assert.equal(trainingRecord({ ...base, note: '   ', excluded: 'oui', setChanges: [] }).note, undefined);
    assert.equal(trainingRecord({ ...base, note: 'x'.repeat(400) }).note.length, 300);
  });

  test('sauvegarde : les nouveaux champs font l’aller-retour ; une séance d’avant la 0.13 se lit telle quelle', () => {
    const T = [{ id: 't1', startedAt: 10, endedAt: 20, player: 'a', setId: 'A', mode: 'coach', exercise: 'groupement', darts: [si(20), si(5)], setChanges: [{ at: 1, setId: 'B' }], note: 'fatigué', excluded: true },
      { id: 't0', startedAt: 5, endedAt: 6, player: 'a', setId: null, mode: 'coach', exercise: 'bull', darts: [d(25)] }];
    const sets = [{ id: 'A', name: 'A', archived: false, createdAt: 1, colors: { barrel: 'or', flight: 'bleu' } }];
    const base = { players: [], games: [], current: null, display: { theme: 'auto' }, lastSetup: null };
    const b = parseBackup(JSON.stringify(makeBackup({ ...base, trainings: T, training: null, dartSets: sets })));
    const plan = importPlan({ ...base, trainings: [], training: null, dartSets: [] }, b, 'replace');
    assert.deepEqual(plan.state.trainings, T);
    assert.deepEqual(plan.state.dartSets, sets);
  });
});
