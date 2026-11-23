// Lot 9.3 : saisie à la voix — analyse des phrases (src/engine/voice.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, interpret, sayText, dartLabel, errorText, normalize, VOICE_ERRORS } from '../src/engine/voice.js';

/** Phrase → notation courte des actions ('T20 D16 S20i 25 50 0 undo validate'). */
const read = text => {
  const r = parse(text);
  assert.ok(r.ok, `« ${text} » refusée : ${r.error} ${r.word || ''}`);
  return r.actions.map(a => (a.cmd ? a.cmd : a.dart.segment === 0 ? '0' : a.dart.segment === 25 ? String(25 * a.dart.multiplier)
    : `${'SDT'[a.dart.multiplier - 1]}${a.dart.segment}${a.dart.ring ? a.dart.ring[0] : ''}`)).join(' ');
};
const refused = (text, error) => {
  const r = parse(text);
  assert.equal(r.ok, false, `« ${text} » aurait dû être refusée`);
  if (error) assert.equal(r.error, error, `« ${text} »`);
  return r;
};

test('simples, doubles, triples, en lettres et en chiffres', () => {
  assert.equal(read('vingt'), 'S20');
  assert.equal(read('simple vingt'), 'S20');
  assert.equal(read('double seize'), 'D16');
  assert.equal(read('triple vingt'), 'T20');
  assert.equal(read('Triple 20, double 16, 5'), 'T20 D16 S5');
  assert.equal(read('triple 19 triple 19 triple 19'), 'T19 T19 T19');
  assert.equal(read('T20 d16 s1'), 'T20 D16 S1');
  for (const [w, n] of [['un', 1], ['deux', 2], ['trois', 3], ['quatre', 4], ['cinq', 5], ['six', 6], ['sept', 7], ['huit', 8], ['neuf', 9], ['dix', 10],
    ['onze', 11], ['douze', 12], ['treize', 13], ['quatorze', 14], ['quinze', 15], ['seize', 16], ['dix-sept', 17], ['dix huit', 18], ['dix-neuf', 19]]) {
    assert.equal(read(`double ${w}`), `D${n}`, w);
  }
});

test('variantes de la reconnaissance', () => {
  assert.equal(read('tripe vin'), 'T20');
  assert.equal(read('Triplé vingts'), 'T20');
  assert.equal(read('doublé seize'), 'D16');
  assert.equal(read('euh triple vingt et puis double vingt'), 'T20 D20');
  assert.equal(read('TRIPLE VINGT'), 'T20');
});

test('simple intérieur / extérieur', () => {
  assert.equal(read('simple vingt intérieur'), 'S20i');
  assert.equal(read('vingt extérieur'), 'S20o');
  assert.equal(read('simple intérieur vingt'), 'S20i');
  assert.equal(read('cinq intérieur un extérieur vingt'), 'S5i S1o S20');
  refused('double vingt intérieur', VOICE_ERRORS.RING);
  refused('intérieur vingt', VOICE_ERRORS.RING);
  refused('bull intérieur', VOICE_ERRORS.RING);
  refused('vingt intérieur extérieur', VOICE_ERRORS.RING);
  refused('triple intérieur vingt', VOICE_ERRORS.RING);
});

test('bull, 25 et 50', () => {
  for (const t of ['bull', 'centre', 'cinquante', 'double bull', '50', 'double vingt-cinq', 'bulle']) assert.equal(read(t), '50', t);
  for (const t of ['vingt-cinq', 'vingt cinq', '25', 'demi-bull', 'demi bull', 'simple bull']) assert.equal(read(t), '25', t);
  refused('triple bull', VOICE_ERRORS.INVALID);
  refused('triple vingt-cinq', VOICE_ERRORS.INVALID);
  refused('demi', VOICE_ERRORS.INCOMPLETE);
  refused('demi vingt', VOICE_ERRORS.INCOMPLETE);
});

test('hors cible', () => {
  for (const t of ['dehors', 'raté', 'zéro', 'à côté', '0', 'hors cible']) assert.equal(read(t), '0', t);
  assert.equal(read('triple vingt, à côté, raté'), 'T20 0 0');
  refused('double zéro', VOICE_ERRORS.INVALID);
  refused('triple dehors', VOICE_ERRORS.INVALID);
});

test('commandes annuler et valider, dans l\'ordre de la phrase', () => {
  assert.equal(read('annuler'), 'undo');
  assert.equal(read('valider'), 'validate');
  assert.equal(read('triple vingt annule double vingt valider'), 'T20 undo D20 validate');
  refused('triple annuler', VOICE_ERRORS.INCOMPLETE);
});

test('refus plutôt que deviner', () => {
  refused('', VOICE_ERRORS.EMPTY);
  refused('   ', VOICE_ERRORS.EMPTY);
  assert.equal(refused('triple de seize', VOICE_ERRORS.UNKNOWN).word, 'de');
  refused('triple', VOICE_ERRORS.INCOMPLETE);
  refused('double triple vingt', VOICE_ERRORS.INCOMPLETE);
  refused('vingt et un', VOICE_ERRORS.INVALID); // 21, pas « vingt » puis « un »
  refused('double 21', VOICE_ERRORS.INVALID);
  refused('60', VOICE_ERRORS.INVALID);
  refused('triple 2016', VOICE_ERRORS.INVALID);
  refused('vingt vingt vingt vingt', VOICE_ERRORS.TOO_MANY);
  refused('trois fois vingt', VOICE_ERRORS.UNKNOWN);
});

test('choix entre les propositions du moteur', () => {
  assert.equal(interpret(['triple vingt', 'triple vin']).heard, 'triple vingt');
  // La première n'est pas comprise, les suivantes le sont et disent la même chose : prise.
  const r = interpret(['triple de seize', 'triple seize', 'triple 16']);
  assert.ok(r.ok);
  assert.equal(r.heard, 'triple seize');
  // Elles ne disent pas la même chose : refus.
  const a = interpret(['triple de seize', 'triple seize', 'triple deux seize']);
  assert.equal(a.ok, false);
  assert.equal(a.error, VOICE_ERRORS.AMBIGUOUS);
  assert.deepEqual(a.options, ['triple seize', 'triple deux seize']);
  assert.match(errorText(a), /Pas sûr/);
  assert.equal(interpret([]).error, VOICE_ERRORS.EMPTY);
  assert.equal(interpret('vingt').ok, true);
});

test('textes : confirmation dite et libellés', () => {
  const r = parse('triple vingt double seize vingt intérieur annuler valider');
  assert.equal(sayText(r.actions), 'triple 20, double 16, 20 intérieur, annulé, validé');
  const b = parse('bull demi-bull dehors');
  assert.equal(sayText(b.actions), 'bull, 25, dehors');
  assert.deepEqual([...r.actions, ...b.actions].filter(a => a.dart).map(a => dartLabel(a.dart)), ['T20', 'D16', '20 INT.', '50', '25', 'HORS CIBLE']);
  assert.equal(normalize('À côté !'), 'a cote');
  for (const e of Object.values(VOICE_ERRORS)) assert.ok(errorText({ error: e, word: 'x', options: [] }).length > 3, e);
});
