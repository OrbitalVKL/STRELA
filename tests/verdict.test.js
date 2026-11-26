// Lot 9.6 C : verdict attendu de chaque fléchette, par mode et exercice (le son suit le verdict, pas la valeur brute).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { x01Verdict, cricketVerdict, targetVerdict, verdictSoundKey, nextStreak, streakStep, defiSound } from '../src/engine/verdict.js';

const d = (segment, multiplier = 1) => ({ segment, multiplier });
const V = x => `${x.v}${x.rich ? '+' : ''}`;

test('X01 : scoring, zone de finition, finition, bust, hors cible', () => {
  const rows = [
    [{ dart: d(20, 3), before: 501, after: 441 }, 'hit+'],
    [{ dart: d(5, 3), before: 501, after: 486 }, 'hit'],
    [{ dart: d(20), before: 501, after: 481 }, 'neutral'],
    [{ dart: d(1), before: 501, after: 500 }, 'miss'],
    [{ dart: d(0), before: 501, after: 501 }, 'off'],
    [{ dart: d(20, 2), before: 40, after: 0, finish: true }, 'hit+'],
    [{ dart: d(20), before: 20, after: 20, bust: true }, 'miss'],
    // 60 restants, 3 fléchettes : 20 laisse 40 (D20) : réussie ; 1 laisse 59 (finissable en 2 : 19 D20) : réussie ;
    // dernière fléchette, 40 → 25 : laisse 15, pas de finition en 3 ? si (7 D4) : réussie ; 41 → 40 dernière : réussie.
    [{ dart: d(20), before: 60, after: 40, dartsLeft: 3 }, 'hit'],
    [{ dart: d(20, 3), before: 100, after: 40, dartsLeft: 3 }, 'hit+'],
    // 2 restants, dernière fléchette : 1 laisse 1 → impossible : bust, déjà traité ; 3 → 1 avec 1 fléchette : neutre.
    [{ dart: d(1), before: 3, after: 2, dartsLeft: 2 }, 'hit'],
    [{ dart: d(1), before: 4, after: 3, dartsLeft: 1 }, 'neutral'],
  ];
  for (const [ctx, want] of rows) assert.equal(V(x01Verdict(ctx)), want, JSON.stringify(ctx));
});

test('Cricket : marques, cible fermée, hors des cibles', () => {
  assert.equal(V(cricketVerdict({ dart: d(20, 3), marks: 3, target: true })), 'hit+');
  assert.equal(V(cricketVerdict({ dart: d(19), marks: 1, target: true })), 'hit');
  assert.equal(V(cricketVerdict({ dart: d(18), marks: 0, target: true })), 'neutral');
  assert.equal(V(cricketVerdict({ dart: d(7), marks: 0, target: false })), 'miss');
  assert.equal(V(cricketVerdict({ dart: d(0) })), 'off');
});

test('exercices à cible : serpent, haut-bas, tour de l\'horloge, doubles', () => {
  // Serpent : le 7 visé (tout le secteur) : un simple 7 est une réussite (avant : le son d'un petit score de X01).
  assert.equal(V(targetVerdict({ dart: d(7), t: { s: 7, z: 'any' } })), 'hit');
  assert.equal(V(targetVerdict({ dart: d(16), t: { s: 7, z: 'any' } })), 'miss');
  // Haut-bas : le triple 20 visé.
  assert.equal(V(targetVerdict({ dart: d(20, 3), t: { s: 20, z: 't' } })), 'hit+');
  assert.equal(V(targetVerdict({ dart: d(20), t: { s: 20, z: 't' } })), 'neutral', 'bon secteur, mauvaise zone');
  // Tour de l'horloge aux doubles.
  assert.equal(V(targetVerdict({ dart: d(3, 2), t: { s: 3, z: 'd' } })), 'hit+');
  assert.equal(V(targetVerdict({ dart: d(3, 3), t: { s: 3, z: 'd' } })), 'neutral');
  assert.equal(V(targetVerdict({ dart: d(0), t: { s: 3, z: 'd' } })), 'off');
  // Bull visé (25 ou 50).
  assert.equal(V(targetVerdict({ dart: d(25, 2), t: { s: 25, z: 'any' } })), 'hit');
});

test('son du verdict, série, défis', () => {
  assert.equal(verdictSoundKey({ v: 'hit', rich: true }), 'v-rich');
  assert.equal(verdictSoundKey({ v: 'hit' }), 'v-hit');
  assert.equal(verdictSoundKey({ v: 'neutral' }), 'v-neutral');
  assert.equal(verdictSoundKey({ v: 'miss' }), 'v-miss');
  assert.equal(verdictSoundKey({ v: 'off' }), 'v-off');
  let s = 0;
  for (const v of ['hit', 'hit', 'hit']) s = nextStreak(s, { v });
  assert.equal(s, 3);
  assert.equal(streakStep(s), 2, 'deux demi-tons au-dessus à la 3e réussite de suite');
  assert.equal(nextStreak(s, { v: 'neutral' }), 0);
  assert.equal(streakStep(20), 7);
  assert.equal(defiSound('in'), 'defi-in');
  assert.equal(defiSound(true), 'defi-ok');
  assert.equal(defiSound(false), 'defi-ko');
});
