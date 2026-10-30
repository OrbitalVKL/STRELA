import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { legTable } from '../src/ui/table.js';
import { computeState } from '../src/engine/x01.js';
import { cfg, ds } from './helpers.js';

// 301 sortie double, 2 joueurs : bust de A au 3e tour (20 puis 19 : il resterait 1), finition D20 au 4e.
const TWO = 'T20 T20 T20  20 20 20  T20 S20 S1  T20 T20 S1  S20 S19  T20 S20 S20  D20';
const cell = c => (c ? `${c.bust ? 'BUST' : c.total}/${c.remaining}${c.finish ? '*' : ''}${c.open ? '…' : ''}` : '-');
const grid = t => t.rows.map(r => `${r.round}: ${r.cells.map(cell).join(' ')}`);

describe('historique en tableau (lot 1.2)', () => {
  test('une colonne par joueur, une ligne par tour : total, reste, bust, finition', () => {
    const C = cfg({ startScore: 301 });
    const s = computeState(C, ds(TWO));
    const t = legTable(s, 1);
    assert.deepEqual(t.columns, [0, 1]);
    assert.deepEqual(grid(t), ['1: 180/121 60/241', '2: 81/40 121/120', '3: BUST/40 100/20', '4: 40/0* -']);
    assert.equal(t.currentRound, null);
    assert.equal(t.winner, 0);
    const bust = t.rows[2].cells[0];
    assert.equal(bust.total, 39, 'le total joué reste connu');
    assert.equal(bust.darts.length, 2);
    assert.equal(s.visits[bust.visitIdx], s.legs[0].visits[4], 'case → volée (cible)');
  });

  test('partie en cours : la volée commencée occupe sa case et repère le tour en cours', () => {
    const C = cfg({ startScore: 301 });
    const s = computeState(C, ds('T20 T20 T20  20 20 20  T20'));
    const t = legTable(s, 1, { live: true });
    assert.deepEqual(grid(t), ['1: 180/121 60/241', '2: 60/61… -']);
    assert.equal(t.currentRound, 2);
    // sans « live » (détail d'une partie), pas de case ouverte
    assert.deepEqual(grid(legTable(s, 1)), ['1: 180/121 60/241']);
    // juste après VALIDER : la case vide du joueur suivant marque déjà son tour
    const s2 = computeState(C, ds('T20 T20 T20'));
    assert.deepEqual(grid(legTable(s2, 1, { live: true })), ['1: 180/121 0/301…']);
  });

  test('manche suivante : colonnes dans l’ordre de jeu, premier lanceur en tête', () => {
    const C = cfg({ startScore: 301, players: ['a', 'b', 'c'], legsToWin: 2 });
    // A finit en 2 volées (180 puis 121 = T20 T17 D5… ici T20 T11 D14 = 121)
    const s = computeState(C, ds('T20 T20 T20  20 20 20  1 1 1  T20 T11 D14  T19 S7'));
    assert.equal(s.legNumber, 2);
    assert.deepEqual(legTable(s, 1).columns, [0, 1, 2]);
    const t2 = legTable(s, 2, { live: true });
    assert.deepEqual(t2.columns, [1, 2, 0], 'B commence la manche 2');
    assert.deepEqual(grid(t2), ['1: 64/237… - -']);
    assert.equal(legTable(s, 3), null);
  });
});
