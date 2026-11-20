// Lot 7.8 (retours du 20/11 : « Guillaume sort très souvent premier ») : l'ordre de passage tiré au sort est-il
// vraiment mélangé à chaque partie ? Fisher-Yates exact, aucune graine, aucun biais vers le premier de la liste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shuffled, uniformInt, random32 } from '../src/engine/shuffle.js';

const PLAYERS = ['Guillaume', 'Tsia', 'HPV', 'Angelina'];

test('tirage : Fisher-Yates exact, chacune des n! permutations pour un seul jeu de tirages', () => {
  // Les tirages j (i = 3, 2, 1) parcourent 4 × 3 × 2 = 24 cas : chacun doit donner une permutation différente, donc
  // toutes les permutations sortent avec la même probabilité.
  const seen = new Set();
  for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 2; c++) {
    const seq = [a, b, c];
    const out = shuffled(PLAYERS, () => seq.shift());
    assert.equal(seq.length, 0, 'trois tirages pour quatre joueurs');
    assert.deepEqual([...out].sort(), [...PLAYERS].sort(), 'mêmes joueurs, aucun perdu ni doublé');
    seen.add(out.join());
  }
  assert.equal(seen.size, 24);
  // Chaque joueur est premier dans exactement 6 cas sur 24 (1 sur 4), le premier de la liste comme les autres.
  for (const p of PLAYERS) assert.equal([...seen].filter(o => o.startsWith(`${p},`)).length, 6, p);
  assert.deepEqual(PLAYERS, ['Guillaume', 'Tsia', 'HPV', 'Angelina'], 'la liste de départ n’est pas touchée');
  assert.deepEqual(shuffled([]), []);
  assert.deepEqual(shuffled(['seul']), ['seul']);
});

test('tirage : entier uniforme sans biais de modulo (les valeurs du haut sont retirées)', () => {
  // k = 3 : 2^32 = 3 × 1431655765 + 1, la toute dernière valeur 32 bits est rejetée.
  const seq = [0xFFFFFFFF, 5];
  assert.equal(uniformInt(3, () => seq.shift()), 2);
  assert.equal(seq.length, 0, 'une valeur rejetée, la suivante prise');
  for (let k = 1; k <= 8; k++) for (let i = 0; i < 200; i++) { const x = uniformInt(k); assert.ok(Number.isInteger(x) && x >= 0 && x < k); }
  assert.throws(() => uniformInt(0));
  const r = random32();
  assert.ok(Number.isInteger(r) && r >= 0 && r < 2 ** 32);
});

test('tirage : aucune graine fixe, l’ordre change d’une partie à l’autre', () => {
  const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const orders = new Set();
  for (let i = 0; i < 200; i++) orders.add(shuffled(eight).join());
  // 8! = 40 320 ordres possibles : 200 tirages en donnent presque toujours 200 différents.
  assert.ok(orders.size >= 190, `${orders.size} ordres différents sur 200`);
});

test('tirage : chaque joueur premier 1 fois sur n, aucun biais vers le premier de la liste (hasard du téléphone)', () => {
  const N = 48000;
  for (const list of [PLAYERS, ['Guillaume', 'Tsia'], ['Guillaume', 'Tsia', 'HPV', 'Angelina', 'Gilles', 'Patrick']]) {
    const n = list.length;
    const first = Object.fromEntries(list.map(p => [p, 0]));
    const perms = new Map();
    for (let i = 0; i < N; i++) {
      const o = shuffled(list);
      first[o[0]] += 1;
      if (n <= 4) perms.set(o.join(), (perms.get(o.join()) || 0) + 1);
    }
    // Écart toléré : 6 écarts types (une fausse alerte sur un milliard environ).
    const p = 1 / n, sd = Math.sqrt(p * (1 - p) / N);
    for (const [who, c] of Object.entries(first)) assert.ok(Math.abs(c / N - p) < 6 * sd, `${who} premier ${(100 * c / N).toFixed(2)} % (attendu ${(100 * p).toFixed(2)} %)`);
    if (n <= 4) {
      // Khi-deux sur toutes les permutations (4 joueurs : 23 degrés de liberté, seuil à p ≈ 10⁻⁶).
      const k = n === 4 ? 24 : 2;
      assert.equal(perms.size, k, 'toutes les permutations sortent');
      const e = N / k;
      const chi2 = [...perms.values()].reduce((s, c) => s + (c - e) ** 2 / e, 0);
      assert.ok(chi2 < (k === 24 ? 70 : 24), `khi-deux ${chi2.toFixed(1)}`);
    }
  }
});

test('tirage : la partie (X01 et Cricket) prend ce tirage, la revanche tire de nouveau', () => {
  const store = readFileSync(new URL('../src/ui/store.js', import.meta.url), 'utf8');
  assert.match(store, /import \{ shuffled \} from '\.\.\/engine\/shuffle\.js'/);
  assert.equal((store.match(/setup\.shuffle \? shuffled\(setup\.players\)/g) || []).length, 2, 'startGame et startCricket');
  assert.ok(!/sort\(\(\) => Math\.random/.test(store), 'pas de tri au hasard (biaisé)');
});
