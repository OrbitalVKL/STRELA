// Entraînement solo (lot 8) : moteur (engine/training.js), jeux de fléchettes (engine/dartsets.js), base (db.js :
// migration v3, forme des séances) et sauvegarde (backup.js : séances et jeux, sauvegarde d'avant le lot 8).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { trainingState, analyze, isHit, zoneOf, realPoint, appPoint, aimPoint, suggestNext, levelOf, heatCounts, sessionValue,
  trainingDartError, trainingDartLabel, targetLabel, EXERCISES, COACH_ORDER, LEVEL_SESSIONS, direction } from '../src/engine/training.js';
import { dartSetRecord, SEED_SETS, MODELS, dartSetSummary } from '../src/engine/dartsets.js';
import { MIGRATIONS, runMigrations, trainingRecord, DB_VERSION } from '../src/data/db.js';
import { makeBackup, parseBackup, importPlan, BackupError } from '../src/data/backup.js';
import { dartPoint, impactPoint } from '../src/engine/board.js';

const d = (segment, multiplier = 1, ring) => (ring ? { segment, multiplier, ring } : { segment, multiplier });
const si = s => d(s, 1, 'in'), se = s => d(s, 1, 'out');
const rec = (exercise, darts, extra = {}) => ({ id: `r${Math.random()}`, startedAt: 1, endedAt: 2, player: 'p', mode: exercise === 'libre' ? 'libre' : 'coach', exercise, darts, ...extra });

describe('entraînement : fléchettes et cibles', () => {
  test('simple intérieur ou extérieur : saisi au pavé (ring) ou déduit de la position sur la cible', () => {
    assert.equal(zoneOf(si(20)), 'si');
    assert.equal(zoneOf(se(20)), 'se');
    assert.equal(zoneOf({ segment: 20, multiplier: 1, pos: [0, -0.3] }), 'si');
    assert.equal(zoneOf({ segment: 20, multiplier: 1, pos: [0, -0.75] }), 'se');
    assert.equal(zoneOf(d(20)), 's', 'simple sans anneau connu (partie)');
    assert.equal(zoneOf(d(0)), 'off');
    assert.equal(zoneOf(d(25, 2)), '50');
    assert.equal(trainingDartLabel(se(5)), '5 EXT.');
    assert.equal(trainingDartLabel(d(0)), 'HORS');
    assert.equal(targetLabel({ s: 20, z: 't' }), 'T20');
    assert.equal(targetLabel({ s: 25, z: 'any' }), 'BULL');
  });

  test('saisie refusée : anneau sur un double, sur le bull ou le hors cible ; position illisible', () => {
    assert.equal(trainingDartError(d(20, 2, 'in')), 'RING_INVALID');
    assert.equal(trainingDartError({ segment: 25, multiplier: 1, ring: 'out' }), 'RING_INVALID');
    assert.equal(trainingDartError({ segment: 0, multiplier: 1, ring: 'in' }), 'RING_INVALID');
    assert.equal(trainingDartError({ segment: 3, multiplier: 1, pos: [1] }), 'POS_INVALID');
    assert.equal(trainingDartError(d(0)), null, 'hors cible saisissable');
  });

  test('cible visée : tout le secteur, simple, intérieur, extérieur, triple, double, centre', () => {
    assert.ok(isHit({ s: 20, z: 'any' }, d(20, 3)));
    assert.ok(!isHit({ s: 20, z: 'any' }, si(1)));
    assert.ok(isHit({ s: 20, z: 's' }, se(20)) && !isHit({ s: 20, z: 's' }, d(20, 2)));
    assert.ok(isHit({ s: 20, z: 'si' }, si(20)) && !isHit({ s: 20, z: 'si' }, se(20)));
    assert.ok(isHit({ s: 25, z: 'any' }, d(25)) && isHit({ s: 25, z: 'any' }, d(25, 2)));
    assert.ok(isHit({ s: 25, z: 'd' }, d(25, 2)) && !isHit({ s: 25, z: 'd' }, d(25)));
  });

  test('cotes d’une vraie cible : aller-retour entre le repère de l’appli et les millimètres', () => {
    const p = realPoint({ segment: 20, multiplier: 3, pos: [0, -0.575] });
    assert.ok(Math.abs(p[1] + 103) < 0.5, 'milieu du triple à 103 mm');
    const back = appPoint(p);
    assert.ok(Math.abs(back[1] + 0.575) < 1e-6);
    assert.deepEqual(aimPoint({ s: 25, z: 'any' }), [0, 0]);
    assert.ok(realPoint(si(20))[1] > realPoint(se(20))[1], 'le simple intérieur est sous l’extérieur sur le 20');
    assert.equal(realPoint(d(0)), null, 'hors cible sans position : pas de point');
    assert.ok(dartPoint(se(20))[1] < dartPoint(si(20))[1], 'dessin : un simple extérieur va dans le simple extérieur');
    assert.deepEqual(impactPoint({ segment: 0, multiplier: 1, pos: [0.3, -1.05] }), [0.3, -1.05], 'hors cible posé sur la couronne');
  });
});

describe('entraînement : déroulé des exercices', () => {
  test('les 7 exercices du débutant, sans exercice sur les doubles seuls', () => {
    assert.deepEqual(COACH_ORDER, ['groupement', 'horloge', 'hautbas', 'gauchedroite', 'scorelibre', 'bull', 'vingt']);
    for (const k of COACH_ORDER) for (const b of EXERCISES[k].blocks || []) assert.notEqual(b.z, 'd');
    const n = k => EXERCISES[k].blocks.reduce((a, b) => a + b.n, 0);
    assert.equal(n('groupement'), 9);
    assert.equal(n('scorelibre'), 30);
    assert.equal(n('bull'), 9);
    assert.equal(n('vingt'), 60);
    assert.deepEqual(EXERCISES.hautbas.blocks.slice(0, 2).map(b => [b.s, b.n]), [[20, 3], [3, 3]]);
    assert.deepEqual(EXERCISES.gauchedroite.blocks.slice(0, 2).map(b => [b.s, b.n]), [[11, 3], [6, 3]]);
  });

  test('séries : cible en cours, volée de 3 comptée depuis le début de la série, fin, fléchette de trop refusée', () => {
    const cfg = { exercise: 'hautbas' };
    let st = trainingState(cfg, [si(20), si(20)]);
    assert.deepEqual([st.cur.s, st.cur.k, st.visitDarts], [20, 2, 2]);
    st = trainingState(cfg, [si(20), si(20), se(5)]);
    assert.deepEqual([st.cur.s, st.cur.k, st.visitDarts], [3, 0, 0], 'volée sur le 20 finie : au 3');
    const all = Array.from({ length: 18 }, () => si(3));
    assert.equal(trainingState(cfg, all).done, true);
    assert.throws(() => trainingState(cfg, [...all, si(3)]));
  });

  test('tour de l’horloge : on passe au numéro suivant dès qu’il est touché, toute zone compte', () => {
    const darts = [d(5), si(1), d(2, 3), d(3, 2)];
    let st = trainingState({ exercise: 'horloge' }, darts);
    assert.equal(st.cur.s, 4);
    for (let s = 4; s <= 20; s++) darts.push(se(s));
    st = trainingState({ exercise: 'horloge' }, darts);
    assert.equal(st.done, true);
    const a = analyze(rec('horloge', darts));
    assert.equal(a.value, 21);
    assert.deepEqual(a.extra.perNumber[0], { s: 1, darts: 2, hit: true, open: false });
    assert.match(a.messages[0].text, /Tour bouclé en 21 fléchettes/);
    assert.throws(() => trainingState({ exercise: 'horloge' }, [...darts, si(1)]), 'rien après le 20');
  });

  test('libre : séries choisies, une série ajoutée en cours de séance', () => {
    const cfg = { exercise: 'libre', blocks: [{ s: 19, z: 't', n: 3 }] };
    assert.equal(trainingState(cfg, [d(19, 3), si(19), d(7, 3)]).done, true);
    const more = { ...cfg, blocks: [...cfg.blocks, { s: 25, z: 'd', n: 2 }] };
    const st = trainingState(more, [d(19, 3), si(19), d(7, 3)]);
    assert.deepEqual([st.done, st.cur.s, st.cur.z], [false, 25, 'd']);
    assert.deepEqual(analyze(rec('libre', [d(19, 3), si(19), d(7, 3), d(25, 2), d(25)], { blocks: more.blocks })).perTarget.map(t => [t.s, t.hits, t.darts]), [[19, 1, 3], [25, 1, 2]]);
  });
});

describe('entraînement : analyse et coach', () => {
  test('groupement : fléchettes à gauche du 20 → message, conseil d’alignement, fiche posture, exercice gauche contre droite', () => {
    const a = analyze(rec('groupement', [si(5), se(5), si(5), si(12), se(5), si(20), se(20), si(20), se(20)]));
    assert.equal(a.hits, 4);
    assert.equal(a.rate, 4 / 9);
    const m = a.messages.find(x => x.kind === 'bias' && !x.vertical);
    assert.ok(m, 'écart sur le côté signalé');
    assert.match(m.text, /partent à gauche du 20/);
    assert.equal(m.sheet, 'posture');
    assert.ok(m.tip);
    assert.equal(a.next.key, 'gauchedroite');
  });

  test('haut contre bas : écart par cible (en haut sur le 20 et sur le 3 = on lâche trop tôt) ; fiche lancer', () => {
    const darts = [];
    for (let i = 0; i < 3; i++) darts.push(d(20, 2), se(20), d(20, 2), si(3), si(3), si(3));
    const a = analyze(rec('hautbas', darts));
    const ms = a.messages.filter(x => x.kind === 'bias');
    assert.ok(ms.some(x => x.s === 20 && x.dir === 'en haut'));
    assert.ok(ms.some(x => x.s === 3 && x.dir === 'en haut'));
    assert.equal(ms.filter(x => x.tip).length, 1, 'le même conseil n’est donné qu’une fois');
    assert.equal(ms[0].sheet, 'lancer');
    assert.match(a.messages[0].text, /^20 : 9\/9 · 3 : 9\/9/);
  });

  test('gauche contre droite : sur le 11, « vers le bord » est à gauche de l’écran', () => {
    const darts = [];
    for (let i = 0; i < 3; i++) darts.push(d(11, 2), d(11, 2), d(11, 2), si(6), si(6), si(6));
    const ms = analyze(rec('gauchedroite', darts)).messages.filter(x => x.kind === 'bias');
    assert.ok(ms.some(x => x.s === 11 && x.dir === 'à gauche'));
    assert.ok(ms.some(x => x.s === 6 && x.dir === 'à gauche'), 'sur le 6, trop près du centre = à gauche aussi');
  });

  test('score libre : moyenne par volée et régularité ; bull : près du centre', () => {
    const s = analyze(rec('scorelibre', Array.from({ length: 30 }, (_, i) => (i % 3 === 2 ? d(20, 3) : si(20)))));
    assert.equal(s.extra.average, 100);
    assert.equal(s.extra.sd, 0);
    assert.equal(sessionValue(rec('scorelibre', [])), null);
    const b = analyze(rec('bull', [d(25), d(25, 2), si(7), se(7), d(7, 3), d(0), si(1), si(2), si(3)]));
    assert.equal(b.extra.near, 6);
    assert.equal(b.extra.bulls, 2);
    assert.equal(b.off, 1);
  });

  test('direction d’un écart à l’écran', () => {
    assert.equal(direction([-10, 1]), 'à gauche');
    assert.equal(direction([0, -10]), 'en haut');
    assert.equal(direction([-8, -10]), 'en haut à gauche');
  });

  test('coach : exercice jamais fait d’abord, puis le moins récent ; la dernière séance peut proposer une correction', () => {
    assert.deepEqual(suggestNext([], 'p'), { key: 'groupement', why: 'pour commencer' });
    const ok = (k, at) => ({ ...rec(k, []), startedAt: at, endedAt: at + 1 });
    assert.equal(suggestNext([ok('groupement', 1)], 'p').key, 'horloge');
    const all = COACH_ORDER.map((k, i) => ok(k, 10 + i));
    assert.deepEqual(suggestNext(all, 'p'), { key: 'groupement', why: 'le moins récent' });
    const left = { ...rec('groupement', [si(5), se(5), si(5), si(12), se(5), si(20), se(20), si(20), se(20)]), startedAt: 99, endedAt: 100 };
    assert.equal(suggestNext([...all, left], 'p').key, 'gauchedroite');
    assert.equal(suggestNext([...all, left], 'autre').why, 'pour commencer', 'par joueur');
  });

  test('niveau : groupement et score libre à l’objectif du débutant sur 3 séances de suite ; une séance arrêtée ne compte pas', () => {
    const good = at => ({ ...rec('groupement', Array.from({ length: 9 }, (_, i) => (i < 6 ? si(20) : si(1)))), startedAt: at });
    const bad = at => ({ ...rec('groupement', Array.from({ length: 9 }, () => si(1))), startedAt: at });
    const score = at => ({ ...rec('scorelibre', Array.from({ length: 30 }, () => si(20))), startedAt: at }); // 60 par volée
    const crit = (list, ex) => levelOf(list, 'p').criteria.find(c => c.exercise === ex);
    assert.equal(LEVEL_SESSIONS, 3);
    assert.equal(crit([good(1), good(2)], 'groupement').streak, 2);
    assert.equal(crit([good(1), bad(2), good(3), good(4)], 'groupement').streak, 2);
    assert.equal(crit([good(1), good(2), { ...good(3), stopped: true }], 'groupement').streak, 2);
    assert.equal(levelOf([good(1), good(2), good(3)], 'p').level, 'debutant', 'le score libre manque');
    const up = [good(1), good(2), good(3), score(4), score(5), score(6)];
    assert.equal(levelOf(up, 'p').level, 'intermediaire');
    assert.equal(levelOf([...up, bad(7)], 'p').level, 'intermediaire', 'un niveau atteint reste');
  });

  test('carte de chaleur : simple intérieur et extérieur à part, simple de partie partagé', () => {
    const h = heatCounts([si(20), se(20), se(20), d(20), d(20, 3), d(25, 2), d(0)]);
    assert.equal(h.get('20', 'i'), 1.5);
    assert.equal(h.get('20', 'o'), 2.5);
    assert.equal(h.get('T20'), 1);
    assert.equal(h.get('50'), 1);
    assert.equal(h.off, 1);
  });
});

describe('entraînement : jeux de fléchettes', () => {
  test('jeu nettoyé : champs hors liste ou hors bornes retirés, tungstène seulement pour un fût en tungstène', () => {
    const r = dartSetRecord({ id: 'x', name: '  Mon jeu ', weight: '22,5', shape: 'carré', material: 'laiton', tungsten: 90, length: 9999, flightMm: '0.1', createdAt: 5, extra: 1 });
    assert.deepEqual(r, { id: 'x', name: 'Mon jeu', archived: false, createdAt: 5, weight: 22.5, flightMm: 0.1, material: 'laiton' });
    assert.equal(dartSetRecord({ id: 'x', name: ' ' }), null);
  });

  test('modèles fournis et jeux de Guillaume (22 g torpedo 161 mm, 22 g fût droit 135 mm, empennages 0,1 mm)', () => {
    assert.equal(Object.keys(MODELS).length, 6);
    assert.deepEqual(SEED_SETS.map(s => [s.weight, s.shape, s.length, s.flightMm]), [[22, 'torpedo', 161, 0.1], [22, 'droit', 135, 0.1]]);
    assert.equal(dartSetSummary(SEED_SETS[0]), '22 g · torpedo · 161 mm · empennage standard 0,1 mm');
    for (const s of SEED_SETS) assert.deepEqual(dartSetRecord(s), { ...s });
  });
});

describe('entraînement : base et sauvegarde', () => {
  test('migration v3 : deux magasins créés, les deux jeux de Guillaume posés, rien d’autre ne bouge', () => {
    assert.equal(DB_VERSION, 3);
    const created = [], put = [];
    const db = { createObjectStore: (n, o) => { created.push([n, o]); return { put: x => put.push([n, x]) }; } };
    runMigrations(db, {}, 2);
    assert.deepEqual(created, [['trainings', { keyPath: 'id' }], ['dartsets', { keyPath: 'id' }]]);
    assert.deepEqual(put.map(([n, x]) => [n, x.id]), [['dartsets', 'ds-torpedo-22'], ['dartsets', 'ds-droit-22']]);
    assert.equal(MIGRATIONS.length, 3);
  });

  test('séance enregistrée : champs connus seulement, fléchettes nettoyées, séance illisible refusée', () => {
    const r = trainingRecord({ id: 't', startedAt: 1, endedAt: null, player: 'p', setId: '', mode: 'x', exercise: 'libre', blocks: [{ s: 20, z: 'zz', n: 500 }], darts: [{ segment: 20, multiplier: 1, ring: 'in', pos: [0.1234567, -0.3], ui: 1 }], ui: { zone: 'd' } });
    assert.deepEqual(r, { id: 't', startedAt: 1, endedAt: null, player: 'p', setId: null, mode: 'coach', exercise: 'libre', darts: [{ segment: 20, multiplier: 1, ring: 'in', pos: [0.123, -0.3] }], blocks: [{ s: 20, z: 'any', n: 99 }] });
    assert.equal(trainingRecord({ id: 't', startedAt: 1, darts: [] }), null, 'sans joueur');
  });

  const T = [{ id: 't1', startedAt: 10, endedAt: 20, player: 'a', setId: 'ds-torpedo-22', mode: 'coach', exercise: 'groupement', darts: [si(20), se(5)] }];
  const TC = { id: 't2', startedAt: 30, endedAt: null, player: 'a', setId: null, mode: 'libre', exercise: 'libre', blocks: [{ s: 20, z: 't', n: 9 }], darts: [d(20, 3)], ui: { zone: 'out' } };
  const base = { players: [], games: [], current: null, display: { theme: 'auto' }, lastSetup: null };

  test('sauvegarde : séances (en cours comprise, sans état d’affichage) et jeux, aller-retour exact', () => {
    const file = JSON.stringify(makeBackup({ ...base, trainings: T, training: TC, dartSets: SEED_SETS }));
    assert.ok(!file.includes('"ui"'));
    const b = parseBackup(file);
    assert.equal(b.summary.trainings, 2);
    const plan = importPlan({ ...base, trainings: [], training: null, dartSets: [] }, b, 'replace');
    assert.deepEqual(plan.state.trainings, T);
    const { ui, ...cur } = TC;
    assert.deepEqual(plan.state.training, cur);
    assert.deepEqual(plan.state.dartSets, SEED_SETS.map(s => ({ ...s })));
    assert.deepEqual(plan.counts.trainingsAdded, 2);
    assert.ok(plan.ops.some(o => o.store === 'trainings' && o.clear));
  });

  test('sauvegarde d’avant le lot 8 : REMPLACER TOUT garde l’entraînement du téléphone ; FUSIONNER n’ajoute rien', () => {
    const old = makeBackup(base);
    assert.equal(old.trainings, undefined);
    const b = parseBackup(JSON.stringify(old));
    assert.equal(b.trainings, null);
    const local = { ...base, trainings: T, training: null, dartSets: SEED_SETS };
    const r = importPlan(local, b, 'replace');
    assert.deepEqual(r.state.trainings, T, 'séances gardées');
    assert.deepEqual(r.state.dartSets, SEED_SETS);
    assert.ok(!r.ops.some(o => o.store === 'trainings' || o.store === 'dartsets'), 'rien d’effacé');
    const m = importPlan(local, b, 'merge');
    assert.deepEqual([m.counts.trainingsAdded, m.counts.dartSetsAdded], [0, 0]);
  });

  test('fusion : séances et jeux absents ajoutés ; séance en cours ici gardée, celle de la sauvegarde rangée « arrêtée »', () => {
    const b = parseBackup(JSON.stringify(makeBackup({ ...base, trainings: T, training: TC, dartSets: SEED_SETS })));
    const busy = { ...TC, id: 'here' };
    const m = importPlan({ ...base, trainings: [], training: busy, dartSets: [SEED_SETS[0]] }, b, 'merge');
    assert.equal(m.state.training.id, 'here');
    assert.deepEqual(m.state.trainings.map(r => [r.id, !!r.stopped]), [['t1', false], ['t2', true]]);
    assert.deepEqual([m.counts.trainingsAdded, m.counts.dartSetsAdded], [2, 1]);
    const again = importPlan(m.state, b, 'merge');
    assert.deepEqual([again.counts.trainingsAdded, again.counts.dartSetsAdded], [0, 0]);
  });

  test('sauvegarde abîmée : séance illisible ou trop de fléchettes refusée avec un message clair', () => {
    const ok = makeBackup({ ...base, trainings: T });
    assert.throws(() => parseBackup(JSON.stringify({ ...ok, trainings: [{ id: 'x' }] })), e => e instanceof BackupError && /séance d'entraînement n° 1/.test(e.message));
    const tooMany = { ...T[0], darts: Array.from({ length: 10 }, () => si(20)) };
    assert.throws(() => parseBackup(JSON.stringify({ ...ok, trainings: [tooMany] })), BackupError);
  });
});
