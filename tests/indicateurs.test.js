// Refonte des infos (0.26.0) : indicateurs communs (src/engine/indicators.js). Une partie X01 et une séance X01 en solo
// aux mêmes fléchettes donnent les mêmes chiffres ; chaque meilleure ou pire valeur garde sa source (partie, volée).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { asGame, x01Sources, x01Indicators, cricketSources, cricketIndicators, exerciseBests } from '../src/engine/indicators.js';
import { playerStats } from '../src/engine/stats.js';

// 301 sortie simple : 26, 135, 60, 21, BUST (S20 S20 T20 depuis 59), 59 gagnée.
const DARTS = ds('S5 S20 S1  T5 T20 T20  S20 S20 S20  T1 T1 T5  S20 S20 T20  S20 S20 S19');
const game = { id: 'g1', startedAt: 1000, config: { startScore: 301, outMode: 'single', legsToWin: 1, players: ['pat'] }, darts: DARTS, abandoned: false };
const session = { id: 't1', startedAt: 1000, endedAt: 2000, player: 'pat', mode: 'jeu', exercise: 'x01', game: { startScore: 301, outMode: 'single', legs: 1 }, darts: DARTS };

test('une séance X01 en solo est lue comme une partie à un joueur', () => {
  const g = asGame(session);
  assert.deepEqual(g.config, { startScore: 301, outMode: 'single', legsToWin: 1, players: ['pat'] });
  assert.equal(asGame(session), g, 'même objet tant que les fléchettes ne changent pas');
  assert.equal(asGame({ ...session, exercise: 'groupement' }), null);
});

test('mêmes indicateurs pour une partie et une séance aux mêmes fléchettes', () => {
  const p = x01Indicators(x01Sources('p', { games: [game] }, 'pat'), 'pat');
  const e = x01Indicators(x01Sources('e', { trainings: [session] }, 'pat'), 'pat');
  const strip = x => JSON.parse(JSON.stringify(x, (k, v) => (k === 'kind' || k === 'id' ? undefined : v)));
  assert.deepEqual(strip(e), strip(p));
  const st = playerStats([game], 'pat');
  assert.equal(p.average, st.average);
  assert.equal(p.first9, st.first9);
  assert.equal(p.bestVisit.value, 135);
  assert.deepEqual(p.bestVisit.ref, { kind: 'game', id: 'g1', visit: 1 });
  assert.deepEqual(e.bestVisit.ref, { kind: 'training', id: 't1', visit: 1 });
  assert.deepEqual(p.topVisits.map(v => v.value), [135, 60, 59, 26, 21]);
  assert.equal(p.worstVisit.value, 21, 'pire volée complète, hors finition');
  assert.equal(p.bestFinish.value, 59);
  assert.deepEqual(p.bestFinish.ref, { kind: 'game', id: 'g1', visit: 5 });
  assert.equal(p.shortestLeg.value, 18);
  assert.equal(p.tons, 1);
  assert.equal(p.bestAverage.value, st.average);
  assert.equal(p.series.length, 1);
});

test('séances mises de côté et autres joueurs exclus ; Cricket et exercices', () => {
  assert.equal(x01Sources('e', { trainings: [{ ...session, excluded: true }, { ...session, id: 't2', player: 'x' }] }, 'pat').length, 0);
  const ck = { id: 'c1', startedAt: 5, config: { game: 'cricket', players: ['pat'], mode: 'sans', legsToWin: 1 }, darts: ds('T20 T19 T18'), abandoned: false };
  const c = cricketIndicators(cricketSources('p', { ckGames: [ck] }, 'pat'), 'pat');
  assert.equal(c.mpr, 9);
  assert.equal(c.bestVisit.value, 9);
  assert.deepEqual(c.bestVisit.ref, { kind: 'ck', id: 'c1', visit: 0 });
  const value = r => ({ v: r.darts.length, fmt: 'int', dir: -1, label: 'Fléchettes' });
  const rows = exerciseBests([
    { id: 'a', startedAt: 1, player: 'pat', exercise: 'horloge', darts: ds('S1 S2 S3 S4') },
    { id: 'b', startedAt: 2, player: 'pat', exercise: 'horloge', darts: ds('S1 S2 S3 S4 S5 S6') },
    { id: 'c', startedAt: 3, player: 'pat', exercise: 'x01', darts: DARTS },
  ], 'pat', value);
  assert.equal(rows.length, 1, 'les jeux X01 et Cricket ont leurs propres familles');
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].best.ref.id, 'a', 'moins de fléchettes, c\'est mieux');
  assert.equal(rows[0].last.ref.id, 'b');
});
