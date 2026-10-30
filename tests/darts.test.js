import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dartError, isValidDart, dartValue, isDouble, parseDart, formatDart, makeDart, DART_ERRORS,
} from '../src/engine/darts.js';

test('fléchettes valides : 0, 1 à 20 en S/D/T, 25, 50', () => {
  assert.ok(isValidDart(makeDart(0, 1)));
  for (let s = 1; s <= 20; s++) for (let m = 1; m <= 3; m++) assert.ok(isValidDart(makeDart(s, m)), `${s}×${m}`);
  assert.ok(isValidDart(makeDart(25, 1)));
  assert.ok(isValidDart(makeDart(25, 2)));
});

test('saisies invalides refusées : T25, D0, T0, segment 21, négatif, décimal, multiplicateur 0 ou 4', () => {
  assert.equal(dartError(makeDart(25, 3)), DART_ERRORS.TRIPLE_BULL);
  assert.equal(dartError(makeDart(0, 2)), DART_ERRORS.MULTIPLIED_MISS);
  assert.equal(dartError(makeDart(0, 3)), DART_ERRORS.MULTIPLIED_MISS);
  assert.equal(dartError(makeDart(21, 1)), DART_ERRORS.SEGMENT_INVALID);
  assert.equal(dartError(makeDart(22, 1)), DART_ERRORS.SEGMENT_INVALID);
  assert.equal(dartError(makeDart(24, 1)), DART_ERRORS.SEGMENT_INVALID);
  assert.equal(dartError(makeDart(50, 1)), DART_ERRORS.SEGMENT_INVALID);
  assert.equal(dartError(makeDart(-1, 1)), DART_ERRORS.SEGMENT_INVALID);
  assert.equal(dartError(makeDart(2.5, 1)), DART_ERRORS.SEGMENT_INVALID);
  assert.equal(dartError(makeDart('20', 1)), DART_ERRORS.SEGMENT_INVALID);
  assert.equal(dartError(makeDart(20, 0)), DART_ERRORS.MULTIPLIER_INVALID);
  assert.equal(dartError(makeDart(20, 4)), DART_ERRORS.MULTIPLIER_INVALID);
  assert.equal(dartError(makeDart(20, 1.5)), DART_ERRORS.MULTIPLIER_INVALID);
  assert.equal(dartError(null), DART_ERRORS.NOT_A_DART);
  assert.equal(dartError(20), DART_ERRORS.NOT_A_DART);
  assert.equal(dartError({ segment: 20 }), DART_ERRORS.MULTIPLIER_INVALID);
});

test('valeur des fléchettes', () => {
  assert.equal(dartValue(makeDart(0, 1)), 0);
  assert.equal(dartValue(makeDart(20, 1)), 20);
  assert.equal(dartValue(makeDart(20, 2)), 40);
  assert.equal(dartValue(makeDart(20, 3)), 60);
  assert.equal(dartValue(makeDart(19, 3)), 57);
  assert.equal(dartValue(makeDart(25, 1)), 25);
  assert.equal(dartValue(makeDart(25, 2)), 50);
});

test('doubles : D1 à D20 et 50 ; 25 et les triples n’en sont pas', () => {
  assert.ok(isDouble(makeDart(1, 2)));
  assert.ok(isDouble(makeDart(20, 2)));
  assert.ok(isDouble(makeDart(25, 2)));
  assert.ok(!isDouble(makeDart(25, 1)));
  assert.ok(!isDouble(makeDart(20, 3)));
  assert.ok(!isDouble(makeDart(20, 1)));
  assert.ok(!isDouble(makeDart(0, 1)));
});

test('notation : lecture et écriture', () => {
  assert.deepEqual(parseDart('T20'), makeDart(20, 3));
  assert.deepEqual(parseDart('d16'), makeDart(16, 2));
  assert.deepEqual(parseDart('S5'), makeDart(5, 1));
  assert.deepEqual(parseDart('7'), makeDart(7, 1));
  assert.deepEqual(parseDart('0'), makeDart(0, 1));
  assert.deepEqual(parseDart('25'), makeDart(25, 1));
  assert.deepEqual(parseDart('50'), makeDart(25, 2));
  assert.deepEqual(parseDart('D25'), makeDart(25, 2));
  assert.deepEqual(parseDart('BULL'), makeDart(25, 2));
  for (const bad of ['T25', 'D0', 'T0', '21', 'S21', 'X5', '', 'T', '100', '-3']) assert.equal(parseDart(bad), null, bad);
  for (const t of ['0', 'S1', 'S20', 'D1', 'D20', 'T1', 'T20', '25', '50']) assert.equal(formatDart(parseDart(t)), t);
});

test('makeDart fige la fléchette', () => {
  const d = makeDart(20, 3);
  assert.ok(Object.isFrozen(d));
});
