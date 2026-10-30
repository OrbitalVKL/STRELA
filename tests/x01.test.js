import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeState, throwDart, undoDart, createX01, normalizeConfig, isBust,
  EVENTS, STATUS, X01_ERRORS, X01Error, OUT_SINGLE, OUT_DOUBLE, START_SCORES,
} from '../src/engine/x01.js';
import { DART_ERRORS, makeDart, parseDart, dartValue } from '../src/engine/darts.js';
import { ds, cfg, winLeg, MISS3 } from './helpers.js';

const at = (config, text) => computeState(config, ds(text));

// ------------------------------------------------------------------------------------------ configuration
describe('configuration', () => {
  test('les trois scores de départ', () => {
    for (const startScore of [301, 501, 701]) {
      const c = cfg({ startScore });
      const s = computeState(c, []);
      assert.deepEqual(s.remaining, [startScore, startScore]);
      assert.equal(s.status, STATUS.PLAYING);
      assert.equal(s.currentPlayer, 0);
      assert.equal(s.dartNumber, 1);
      assert.equal(s.legNumber, 1);
      assert.equal(s.legStarter, 0);
      assert.equal(s.lastEvent, EVENTS.NONE);
      assert.equal(s.lastDart, null);
      assert.equal(s.lastVisit, null);
      assert.deepEqual(s.visit, { player: 0, startRemaining: startScore, darts: [], total: 0 });
      const after = at(c, 'T20');
      assert.deepEqual(after.remaining, [startScore - 60, startScore]);
      assert.equal(after.dartNumber, 2);
      assert.equal(after.lastEvent, EVENTS.DART);
    }
    assert.deepEqual(START_SCORES, [301, 501, 701]);
  });

  test('manches à gagner : 1 par défaut', () => {
    assert.equal(normalizeConfig({ startScore: 501, outMode: OUT_DOUBLE, players: ['A'] }).legsToWin, 1);
  });

  test('configurations refusées', () => {
    const bad = [
      [{ ...cfg(), startScore: 401 }, X01_ERRORS.START_SCORE_INVALID],
      [{ ...cfg(), startScore: '501' }, X01_ERRORS.START_SCORE_INVALID],
      [{ ...cfg(), outMode: 'master' }, X01_ERRORS.OUT_MODE_INVALID],
      [{ ...cfg(), legsToWin: 0 }, X01_ERRORS.LEGS_INVALID],
      [{ ...cfg(), legsToWin: 1.5 }, X01_ERRORS.LEGS_INVALID],
      [{ ...cfg(), players: [] }, X01_ERRORS.PLAYERS_INVALID],
      [{ ...cfg(), players: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] }, X01_ERRORS.PLAYERS_INVALID],
      [{ ...cfg(), players: ['A', 'A'] }, X01_ERRORS.PLAYERS_INVALID],
      [{ ...cfg(), players: 'AB' }, X01_ERRORS.PLAYERS_INVALID],
      [null, X01_ERRORS.CONFIG_INVALID],
    ];
    for (const [c, code] of bad) {
      assert.throws(() => computeState(c, []), e => e instanceof X01Error && e.code === code, JSON.stringify(c));
    }
  });

  test('la configuration renvoyée est figée et copiée', () => {
    const players = ['A', 'B'];
    const c = normalizeConfig(cfg({ players }));
    players.push('C');
    assert.deepEqual(c.players, ['A', 'B']);
    assert.ok(Object.isFrozen(c) && Object.isFrozen(c.players));
  });
});

// ------------------------------------------------------------------------------------------ volée
describe('volée', () => {
  test('3 fléchettes au plus, total et rang, puis la main passe', () => {
    const c = cfg();
    let s = at(c, 'T20 S5');
    assert.equal(s.currentPlayer, 0);
    assert.equal(s.dartNumber, 3);
    assert.deepEqual(s.visit.darts, ds('T20 S5'));
    assert.equal(s.visit.total, 65);
    assert.equal(s.visit.startRemaining, 501);
    s = at(c, 'T20 S5 D10');
    assert.equal(s.lastEvent, EVENTS.VISIT_END);
    assert.equal(s.currentPlayer, 1);
    assert.equal(s.dartNumber, 1);
    assert.deepEqual(s.visit, { player: 1, startRemaining: 501, darts: [], total: 0 });
    assert.deepEqual(s.remaining, [416, 501]);
    assert.deepEqual(s.lastVisit, {
      leg: 1, player: 0, startRemaining: 501, darts: ds('T20 S5 D10'), total: 85, scored: 85,
      remainingAfter: 416, bust: false, finish: false,
    });
    assert.equal(s.visits.length, 1);
    s = at(c, 'T20 S5 D10 0 0 0');
    assert.equal(s.currentPlayer, 0);
    assert.equal(s.visits[1].total, 0);
  });

  test('entrée libre : la première fléchette compte, double ou non', () => {
    assert.deepEqual(at(cfg(), 'S1').remaining, [500, 501]);
    assert.deepEqual(at(cfg(), 'T19').remaining, [444, 501]);
  });
});

// ------------------------------------------------------------------------------------------ finitions et bust
// Mise en place : en 301 à 2 joueurs, A arrive à `rest` pendant que B rate tout ; c'est ensuite à A.
function setup(outMode, rest) {
  const c = cfg({ startScore: 301, outMode });
  // 301 → 121 (T20 T20 T20), puis 121 → rest en une volée.
  const toRest = { 40: 'T20 S20 S1', 50: 'T20 S11 0', 25: 'T20 S20 S16', 32: 'T20 S20 S9', 2: 'T20 T19 S2' }[rest];
  const darts = ds(`T20 T20 T20 ${MISS3} ${toRest} ${MISS3}`);
  const s = computeState(c, darts);
  assert.equal(s.remaining[0], rest);
  assert.equal(s.currentPlayer, 0);
  assert.equal(s.dartNumber, 1);
  return { c, darts };
}
const play = ({ c, darts }, text) => computeState(c, [...darts, ...ds(text)]);

function assertBust(s, rest, nDarts, total) {
  assert.equal(s.lastEvent, EVENTS.BUST);
  assert.equal(s.remaining[0], rest, 'retour au reste du début de volée');
  assert.equal(s.currentPlayer, 1, 'la main passe');
  assert.equal(s.dartNumber, 1);
  assert.equal(s.lastVisit.bust, true);
  assert.equal(s.lastVisit.finish, false);
  assert.equal(s.lastVisit.darts.length, nDarts, 'la volée s’arrête aussitôt');
  assert.equal(s.lastVisit.total, total);
  assert.equal(s.lastVisit.scored, 0);
  assert.equal(s.lastVisit.startRemaining, rest);
  assert.equal(s.lastVisit.remainingAfter, rest);
  assert.equal(s.status, STATUS.PLAYING);
}

function assertWin(s, nDarts) {
  assert.equal(s.lastEvent, EVENTS.MATCH_WON);
  assert.equal(s.status, STATUS.FINISHED);
  assert.equal(s.winner, 0);
  assert.equal(s.remaining[0], 0);
  assert.deepEqual(s.legsWon, [1, 0]);
  assert.equal(s.lastVisit.finish, true);
  assert.equal(s.lastVisit.bust, false);
  assert.equal(s.lastVisit.darts.length, nDarts);
  assert.equal(s.lastVisit.remainingAfter, 0);
  assert.equal(s.currentPlayer, null);
  assert.equal(s.dartNumber, null);
  assert.equal(s.visit, null);
}

describe('sortie simple', () => {
  test('finition sur un simple, sur la 3e fléchette', () => {
    assertWin(at(cfg({ startScore: 301, outMode: OUT_SINGLE, players: ['A', 'B'] }), `T20 T20 T20 ${MISS3} T20 T20 S1`), 3);
  });
  test('un reste de 1 est permis, finition sur la 1re fléchette', () => {
    const c = cfg({ startScore: 301, outMode: OUT_SINGLE });
    const s = at(c, `T20 T20 T20 ${MISS3} T20 T20 0 ${MISS3}`);
    assert.equal(s.remaining[0], 1);
    assertWin(at(c, `T20 T20 T20 ${MISS3} T20 T20 0 ${MISS3} S1`), 1);
  });
  test('finition sur un triple ou sur 25', () => {
    const t = setup(OUT_SINGLE, 32);
    assertWin(play(t, 'S2 T10'), 2);
    assertWin(play(setup(OUT_SINGLE, 25), '25'), 1);
  });
  test('bust par dépassement', () => {
    assertBust(play(setup(OUT_SINGLE, 40), 'T20'), 40, 1, 60);
    assertBust(play(setup(OUT_SINGLE, 40), 'S20 S10 T5'), 40, 3, 45);
  });
});

describe('sortie double', () => {
  test('finition sur un double, sur la 3e fléchette', () => {
    assertWin(at(cfg({ startScore: 301 }), `T20 T20 T20 ${MISS3} T20 T17 D5`), 3);
  });
  test('finition sur 50', () => {
    assertWin(play(setup(OUT_DOUBLE, 50), '50'), 1);
    assertWin(at(cfg({ startScore: 301 }), `T20 T20 T20 ${MISS3} T20 S11 50`), 3);
  });
  test('finition sur la 1re fléchette', () => {
    assertWin(play(setup(OUT_DOUBLE, 40), 'D20'), 1);
    assertWin(play(setup(OUT_DOUBLE, 2), 'D1'), 1);
  });
  test('finition sur la 2e fléchette', () => {
    assertWin(play(setup(OUT_DOUBLE, 40), 'S20 D10'), 2);
  });
  test('bust par dépassement', () => {
    assertBust(play(setup(OUT_DOUBLE, 40), 'T20'), 40, 1, 60);
    assertBust(play(setup(OUT_DOUBLE, 2), 'S3'), 2, 1, 3);
  });
  test('bust par reste de 1', () => {
    assertBust(play(setup(OUT_DOUBLE, 40), 'S19 D10'), 40, 2, 39);
    assertBust(play(setup(OUT_DOUBLE, 2), 'S1'), 2, 1, 1);
  });
  test('bust par 0 sans double (simple, triple, 25)', () => {
    assertBust(play(setup(OUT_DOUBLE, 40), 'S10 S10 S20'), 40, 3, 40);
    assertBust(play(setup(OUT_DOUBLE, 40), 'S10 T10'), 40, 2, 40);
    assertBust(play(setup(OUT_DOUBLE, 25), '25'), 25, 1, 25);
    assertBust(play(setup(OUT_DOUBLE, 50), '25 25'), 50, 2, 50);
  });
  test('bust sur la 1re, la 2e et la 3e fléchette', () => {
    assertBust(play(setup(OUT_DOUBLE, 40), 'T15'), 40, 1, 45);
    assertBust(play(setup(OUT_DOUBLE, 40), 'S20 T10'), 40, 2, 50);
    assertBust(play(setup(OUT_DOUBLE, 40), 'S10 S10 S19'), 40, 3, 39);
  });
  test('après un bust, la volée suivante repart du même reste', () => {
    const t = setup(OUT_DOUBLE, 40);
    const s = play(t, `T20 ${MISS3}`);
    assert.equal(s.currentPlayer, 0);
    assert.equal(s.remaining[0], 40);
    assert.equal(s.visit.startRemaining, 40);
    assertWin(play(t, `T20 ${MISS3} D20`), 1);
  });
  test('isBust', () => {
    assert.equal(isBust(40, makeDart(20, 2), OUT_DOUBLE), false);
    assert.equal(isBust(40, makeDart(20, 1), OUT_DOUBLE), false);
    assert.equal(isBust(21, makeDart(20, 1), OUT_DOUBLE), true);
    assert.equal(isBust(21, makeDart(20, 1), OUT_SINGLE), false);
    assert.equal(isBust(20, makeDart(20, 1), OUT_DOUBLE), true);
    assert.equal(isBust(20, makeDart(20, 1), OUT_SINGLE), false);
    assert.equal(isBust(50, makeDart(25, 2), OUT_DOUBLE), false);
    assert.equal(isBust(10, makeDart(20, 1), OUT_SINGLE), true);
  });
});

// ------------------------------------------------------------------------------------------ saisies invalides
describe('saisies invalides', () => {
  test('T25, D0, segment 21 refusés sans toucher à la partie', () => {
    const c = cfg();
    const darts = ds('T20 S5');
    const before = computeState(c, darts);
    for (const [dart, code] of [
      [makeDart(25, 3), DART_ERRORS.TRIPLE_BULL],
      [makeDart(0, 2), DART_ERRORS.MULTIPLIED_MISS],
      [makeDart(21, 1), DART_ERRORS.SEGMENT_INVALID],
      [makeDart(20, 4), DART_ERRORS.MULTIPLIER_INVALID],
      [undefined, DART_ERRORS.NOT_A_DART],
    ]) {
      const r = throwDart(c, darts, dart);
      assert.equal(r.ok, false);
      assert.equal(r.error, code);
      assert.equal(r.darts, darts);
      assert.deepEqual(r.state, before);
    }
  });
  test('une liste contenant une fléchette invalide est rejetée', () => {
    assert.throws(() => computeState(cfg(), [makeDart(20, 3), makeDart(25, 3)]), e => e.code === DART_ERRORS.TRIPLE_BULL);
    assert.throws(() => computeState(cfg(), 'T20'), TypeError);
  });
});

// ------------------------------------------------------------------------------------------ manches et partie
describe('manches et partie', () => {
  test('rotation du premier joueur sur plusieurs manches (3 joueurs)', () => {
    const c = cfg({ players: ['A', 'B', 'C'], legsToWin: 3 });
    let darts = [];
    const winners = [0, 1, 2, 0, 1, 0];
    winners.forEach((w, k) => {
      const s = computeState(c, darts);
      assert.equal(s.legNumber, k + 1);
      assert.equal(s.legStarter, k % 3, `premier joueur de la manche ${k + 1}`);
      assert.equal(s.currentPlayer, k % 3);
      assert.equal(s.dartNumber, 1);
      assert.deepEqual(s.remaining, [501, 501, 501]);
      darts = winLeg(c, darts, w);
      const e = computeState(c, darts);
      assert.equal(e.legs[k].winner, w);
      assert.equal(e.legs[k].finalRemaining[w], 0);
      assert.equal(e.lastVisit.player, w);
      assert.equal(e.lastEvent, k === winners.length - 1 ? EVENTS.MATCH_WON : EVENTS.LEG_WON);
    });
    const end = computeState(c, darts);
    assert.deepEqual(end.legsWon, [3, 2, 1]);
    assert.equal(end.winner, 0);
    assert.equal(end.legs.length, 6);
  });

  test('l’ordre de jeu suit le premier joueur de la manche', () => {
    const c = cfg({ players: ['A', 'B', 'C'], legsToWin: 2 });
    const leg2 = winLeg(c, [], 0);
    const order = [];
    let darts = leg2;
    for (let v = 0; v < 4; v++) {
      order.push(computeState(c, darts).currentPlayer);
      darts = [...darts, ...ds(MISS3)];
    }
    assert.deepEqual(order, [1, 2, 0, 1]);
  });

  test('après une manche gagnée, restes remis au départ et volée vide', () => {
    const c = cfg({ startScore: 301, legsToWin: 2 });
    const s = at(c, `T20 T20 T20 ${MISS3} T20 T17 D5`);
    assert.equal(s.lastEvent, EVENTS.LEG_WON);
    assert.equal(s.status, STATUS.PLAYING);
    assert.equal(s.winner, null);
    assert.deepEqual(s.legsWon, [1, 0]);
    assert.deepEqual(s.remaining, [301, 301]);
    assert.equal(s.legNumber, 2);
    assert.equal(s.currentPlayer, 1);
    assert.deepEqual(s.visit, { player: 1, startRemaining: 301, darts: [], total: 0 });
    assert.deepEqual(s.legs[0].finalRemaining, [0, 301]);
    assert.equal(s.legs[1].winner, null);
    assert.equal(s.legs[1].finalRemaining, null);
    assert.equal(s.lastVisit.leg, 1);
  });

  test('fin de partie à N manches, puis plus aucune fléchette acceptée', () => {
    const c = cfg({ legsToWin: 2 });
    let darts = winLeg(c, [], 0);
    darts = winLeg(c, darts, 1);
    let s = computeState(c, darts);
    assert.equal(s.status, STATUS.PLAYING);
    assert.deepEqual(s.legsWon, [1, 1]);
    assert.equal(s.legNumber, 3);
    assert.equal(s.legStarter, 0);
    darts = winLeg(c, darts, 0);
    s = computeState(c, darts);
    assert.equal(s.status, STATUS.FINISHED);
    assert.equal(s.winner, 0);
    assert.deepEqual(s.legsWon, [2, 1]);
    assert.equal(s.lastEvent, EVENTS.MATCH_WON);
    const r = throwDart(c, darts, makeDart(20, 1));
    assert.equal(r.ok, false);
    assert.equal(r.error, X01_ERRORS.MATCH_OVER);
    assert.throws(() => computeState(c, [...darts, makeDart(20, 1)]), e => e.code === X01_ERRORS.MATCH_OVER);
  });

  test('un seul joueur', () => {
    const c = cfg({ startScore: 301, players: ['solo'] });
    let s = at(c, 'T20 T20 T20');
    assert.equal(s.currentPlayer, 0);
    assert.equal(s.lastEvent, EVENTS.VISIT_END);
    s = at(c, 'T20 T20 T20 T20 T20'); // 121 → 61 → 1 : bust
    assert.equal(s.lastEvent, EVENTS.BUST);
    assert.equal(s.remaining[0], 121);
    assert.equal(s.currentPlayer, 0);
  });

  test('8 joueurs', () => {
    const players = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const c = cfg({ players, legsToWin: 2 });
    let darts = [];
    const order = [];
    for (let v = 0; v < 10; v++) {
      order.push(computeState(c, darts).currentPlayer);
      darts = [...darts, ...ds('T20 0 0')];
    }
    assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
    let s = computeState(c, darts);
    assert.deepEqual(s.remaining, [381, 381, 441, 441, 441, 441, 441, 441]);
    darts = winLeg(c, darts, 7);
    s = computeState(c, darts);
    assert.equal(s.legNumber, 2);
    assert.equal(s.legStarter, 1);
    assert.equal(s.currentPlayer, 1);
    assert.deepEqual(s.remaining, new Array(8).fill(501));
    darts = winLeg(c, darts, 7);
    s = computeState(c, darts);
    assert.equal(s.winner, 7);
    assert.deepEqual(s.legsWon, [0, 0, 0, 0, 0, 0, 0, 2]);
  });
});

// ------------------------------------------------------------------------------------------ ANNULER
describe('ANNULER', () => {
  const same = (c, darts, prefix) => assert.deepEqual(undoDart(c, darts).state, computeState(c, prefix));

  test('en milieu de volée', () => {
    const c = cfg();
    const darts = ds('T20 T19');
    const { darts: d, state: s } = undoDart(c, darts);
    assert.deepEqual(d, ds('T20'));
    assert.deepEqual(s.remaining, [441, 501]);
    assert.equal(s.dartNumber, 2);
    assert.deepEqual(s.visit.darts, ds('T20'));
    assert.equal(s.visit.total, 60);
    same(c, darts, ds('T20'));
  });

  test('juste après un bust', () => {
    const t = setup(OUT_DOUBLE, 40);
    const bust = [...t.darts, ...ds('S20 T10')];
    assert.equal(computeState(t.c, bust).lastEvent, EVENTS.BUST);
    const { state: s } = undoDart(t.c, bust);
    assert.equal(s.currentPlayer, 0);
    assert.equal(s.dartNumber, 2);
    assert.equal(s.remaining[0], 20);
    assert.deepEqual(s.visit.darts, ds('S20'));
    assert.equal(s.visit.startRemaining, 40);
    assert.equal(s.lastEvent, EVENTS.DART);
    // on peut alors finir correctement
    assertWin(computeState(t.c, [...t.darts, ...ds('S20 D10')]), 2);
  });

  test('juste après un changement de joueur', () => {
    const c = cfg();
    const darts = ds('T20 T20 T20');
    assert.equal(computeState(c, darts).currentPlayer, 1);
    const { state: s } = undoDart(c, darts);
    assert.equal(s.currentPlayer, 0);
    assert.equal(s.dartNumber, 3);
    assert.deepEqual(s.remaining, [381, 501]);
    assert.deepEqual(s.visit.darts, ds('T20 T20'));
    assert.equal(s.visits.length, 0);
    assert.equal(s.lastVisit, null);
    // et encore une fois, à travers la volée précédente du joueur B
    const two = ds('T20 T20 T20 S1');
    const back = undoDart(c, undoDart(c, two).darts).state;
    assert.equal(back.currentPlayer, 0);
    assert.equal(back.dartNumber, 3);
  });

  test('après une manche gagnée', () => {
    const c = cfg({ startScore: 301, legsToWin: 2 });
    const darts = ds(`T20 T20 T20 ${MISS3} T20 T17 D5`);
    assert.equal(computeState(c, darts).lastEvent, EVENTS.LEG_WON);
    const { state: s } = undoDart(c, darts);
    assert.equal(s.legNumber, 1);
    assert.equal(s.legs.length, 1);
    assert.equal(s.legs[0].winner, null);
    assert.deepEqual(s.legsWon, [0, 0]);
    assert.deepEqual(s.remaining, [10, 301]);
    assert.equal(s.currentPlayer, 0);
    assert.equal(s.dartNumber, 3);
    assert.deepEqual(s.visit.darts, ds('T20 T17'));
    same(c, darts, darts.slice(0, -1));
  });

  test('après une partie gagnée : la partie redevient en cours', () => {
    const c = cfg({ startScore: 301 });
    const darts = ds(`T20 T20 T20 ${MISS3} T20 T17 D5`);
    assert.equal(computeState(c, darts).status, STATUS.FINISHED);
    const { darts: d, state: s } = undoDart(c, darts);
    assert.equal(s.status, STATUS.PLAYING);
    assert.equal(s.winner, null);
    assert.deepEqual(s.legsWon, [0, 0]);
    assert.equal(s.currentPlayer, 0);
    assert.equal(s.dartNumber, 3);
    assert.equal(s.remaining[0], 10);
    const r = throwDart(c, d, makeDart(5, 1));
    assert.equal(r.ok, true);
    assert.equal(r.state.lastEvent, EVENTS.VISIT_END);
    assert.equal(r.state.remaining[0], 5);
  });

  test('sur une partie vide : sans effet', () => {
    const { darts, state } = undoDart(cfg(), []);
    assert.deepEqual(darts, []);
    assert.equal(state.lastEvent, EVENTS.NONE);
  });

  test('ANNULER jusqu’au début, fléchette par fléchette, à travers bust, manches et fin de partie', () => {
    const c = cfg({ startScore: 301, legsToWin: 2 });
    let darts = winLeg(c, ds(`T20 T20 T20 T20 T20 T20 T20 T20 T20`), 1); // bust de A dans la 2e volée
    darts = winLeg(c, darts, 1);
    assert.equal(computeState(c, darts).winner, 1);
    for (let k = darts.length; k > 0; k--) same(c, darts.slice(0, k), darts.slice(0, k - 1));
  });

  test('createX01 : jouer, refuser, annuler', () => {
    const g = createX01(cfg({ startScore: 301 }));
    assert.equal(g.throw(makeDart(20, 3)).ok, true);
    assert.equal(g.throw(makeDart(25, 3)).ok, false);
    assert.equal(g.darts.length, 1);
    assert.equal(g.state.remaining[0], 241);
    g.undo();
    assert.equal(g.state.remaining[0], 301);
    assert.equal(g.darts.length, 0);
    assert.equal(g.config.startScore, 301);
  });
});

// ------------------------------------------------------------------------------------------ partie complète
describe('partie complète', () => {
  test('501 à 2 joueurs rejouée en entier, restes vérifiés volée par volée', () => {
    const c = cfg({ startScore: 501, outMode: OUT_DOUBLE, players: ['Guillaume', 'Invité'] });
    // [joueur, fléchettes, reste avant, total, reste après, bust, finition, restes des deux joueurs]
    const script = [
      [0, 'T20 T20 T20', 501, 180, 321, false, false, [321, 501]],
      [1, 'S20 S1 S5',   501,  26, 475, false, false, [321, 475]],
      [0, 'T20 T19 0',   321, 117, 204, false, false, [204, 475]],
      [1, 'T20 T20 T20', 475, 180, 295, false, false, [204, 295]],
      [0, 'T20 T20 S19', 204, 139,  65, false, false, [65, 295]],
      [1, 'T19 T18 0',   295, 111, 184, false, false, [65, 184]],
      [0, 'T20 S5',       65,  65,  65, true,  false, [65, 184]], // 0 sur un simple : bust
      [1, 'T20 T20 S4',  184, 124,  60, false, false, [65, 60]],
      [0, '25 0 D20',     65,  65,   0, false, true,  [0, 60]],
    ];
    let darts = [];
    script.forEach(([player, text, before, total, after, bust, finish, rest], v) => {
      const s0 = computeState(c, darts);
      assert.equal(s0.currentPlayer, player, `volée ${v + 1} : joueur`);
      assert.equal(s0.visit.startRemaining, before, `volée ${v + 1} : reste avant`);
      darts = [...darts, ...ds(text)];
      const s = computeState(c, darts);
      assert.deepEqual(s.remaining, rest, `volée ${v + 1} : restes`);
      const rec = s.visits[v];
      assert.deepEqual(
        [rec.player, rec.startRemaining, rec.total, rec.remainingAfter, rec.bust, rec.finish],
        [player, before, total, after, bust, finish],
        `volée ${v + 1}`,
      );
      assert.equal(rec.leg, 1);
    });
    const end = computeState(c, darts);
    assert.equal(end.visits.length, 9);
    assert.equal(end.status, STATUS.FINISHED);
    assert.equal(end.winner, 0);
    assert.equal(end.dartCount, 26);
    assert.deepEqual(end.legs[0].finalRemaining, [0, 60]);
    // somme des points marqués = 501 pour le gagnant
    assert.equal(end.visits.filter(v => v.player === 0).reduce((a, v) => a + v.scored, 0), 501);
  });
});

// ------------------------------------------------------------------------------------------ parties aléatoires
describe('parties aléatoires (invariants)', () => {
  // Générateur pseudo-aléatoire reproductible (mulberry32).
  const rng = seed => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randomDart = r => {
    const x = r();
    if (x < 0.06) return makeDart(0, 1);
    if (x < 0.10) return makeDart(25, r() < 0.5 ? 1 : 2);
    const seg = 1 + Math.floor(r() * 20);
    const y = r();
    return makeDart(seg, y < 0.15 ? 2 : y < 0.30 ? 3 : 1);
  };

  test('120 parties : restes cohérents, jamais 1 en sortie double, ANNULER = préfixe', () => {
    const r = rng(20261030);
    for (let g = 0; g < 120; g++) {
      const n = 1 + Math.floor(r() * 8);
      const c = {
        startScore: START_SCORES[Math.floor(r() * 3)],
        outMode: r() < 0.5 ? OUT_SINGLE : OUT_DOUBLE,
        legsToWin: 1 + Math.floor(r() * 2),
        players: Array.from({ length: n }, (_, i) => `p${i}`),
      };
      let darts = [];
      let prev = computeState(c, darts);
      for (let k = 0; k < 250 && prev.status === STATUS.PLAYING; k++) {
        const res = throwDart(c, darts, randomDart(r));
        assert.ok(res.ok);
        const s = res.state;
        if (k % 7 === 0) assert.deepEqual(undoDart(c, res.darts).state, prev);
        for (const rem of s.remaining) {
          assert.ok(rem >= 0);
          if (c.outMode === OUT_DOUBLE) assert.notEqual(rem, 1);
        }
        // restes de la manche en cours = départ − points marqués dans cette manche
        if (s.status === STATUS.PLAYING) {
          const leg = s.legs[s.legs.length - 1];
          s.remaining.forEach((rem, p) => {
            const scored = leg.visits.filter(v => v.player === p).reduce((a, v) => a + v.scored, 0)
              + (s.visit.player === p ? s.visit.total : 0);
            assert.equal(rem, c.startScore - scored);
          });
          assert.ok(s.dartNumber >= 1 && s.dartNumber <= 3);
        }
        for (const v of s.visits) {
          assert.ok(v.darts.length >= 1 && v.darts.length <= 3);
          assert.equal(v.total, v.darts.reduce((a, d) => a + dartValue(d), 0));
          if (v.darts.length < 3) assert.ok(v.bust || v.finish);
        }
        assert.equal(s.legsWon.reduce((a, b) => a + b, 0), s.legs.filter(l => l.winner !== null).length);
        darts = res.darts;
        prev = s;
      }
    }
  });

  test('parseDart et la fléchette jouée donnent le même état', () => {
    const c = cfg();
    assert.deepEqual(computeState(c, [parseDart('T20'), parseDart('50')]), computeState(c, [makeDart(20, 3), makeDart(25, 2)]));
  });
});
