import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { legTable, cellView, cellHtml } from '../src/ui/table.js';
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

  test('contenu d’une case (lot 1.3) : les 3 fléchettes, puis le total, puis le reste ; ratés, bust, finition', () => {
    const C = cfg({ startScore: 301 });
    // A : T20 S5 S1 (66) ; B : D16 0 0 (32) ; A : T20 T20 T20 (180, reste 55) ; B : 0 0 0 ; A : S20 S20 S20 → bust (-5) ;
    // B : T20 T20 S20 (140) ; A : S15 D20 → finition
    const s = computeState(C, ds('T20 S5 S1  D16 0 0  T20 T20 T20  0 0 0  S20 S20 S20  T20 T20 S20  S15 D20'));
    const t = legTable(s, 1);
    const [a1, b1] = t.rows[0].cells;
    assert.deepEqual(cellView(a1).darts, ['T20', '5', '1'], 'simple sans S');
    assert.equal(cellView(a1).big, '66');
    assert.equal(cellView(a1).small, '235');
    assert.deepEqual(cellView(b1).darts, ['D16', '0', '0'], 'raté = « 0 »');
    assert.deepEqual(cellView(t.rows[1].cells[1]).darts, ['0', '0', '0'], 'volée blanche : 3 ratés visibles');
    assert.equal(cellView(t.rows[1].cells[1]).big, '0');
    const bust = cellView(t.rows[2].cells[0]);
    assert.deepEqual([bust.cls, bust.big, bust.small, bust.faulty], ['bust', 'BUST', '55', 2], 'bust : reste inchangé, fautive = 3e');
    assert.deepEqual(bust.darts, ['20', '20', '20']);
    const fin = cellView(t.rows[3].cells[0]);
    assert.deepEqual([fin.cls, fin.darts.join(' '), fin.big, fin.small], ['fin', '15 D20', '55', 'GAGNÉ']);
    // HTML : fléchettes, puis total en gros, puis reste en petit, toutes les fléchettes présentes (aucune coupe « … »)
    const html = cellHtml(a1, { key: 'g|0' });
    assert.match(html, /<span class="ds" data-fit="3"><i>T20<\/i><i>5<\/i><i>1<\/i><\/span><b>66<\/b><small>235<\/small>/);
    assert.ok(!html.includes('…'));
    assert.match(cellHtml(t.rows[2].cells[0]), /<i>20<\/i><i>20<\/i><i class="x">20<\/i><\/span><b>BUST<\/b><small>55<\/small>/, 'fautive barrée');
    assert.match(cellHtml(a1, { key: 'g|0' }), /aria-label="T20, 5, 1 : 66, reste 235"/);
    assert.match(cellHtml(a1, { key: 'g|0', selected: true }), /class="c +sel"/);
    assert.equal(cellHtml(null), '<td class="c none"></td>');
  });

  test('contenu d’une case : volée en cours (fléchettes déjà lancées, « 2/3 » ou « À JOUER »)', () => {
    const C = cfg({ startScore: 301 });
    const s = computeState(C, ds('T20 T20 T20  20 0'));
    const open = legTable(s, 1, { live: true }).rows[0].cells[1];
    const v = cellView(open);
    assert.deepEqual([v.cls, v.darts.join(' '), v.big, v.small], ['open', '20 0', '20', '2/3']);
    const empty = cellView(legTable(computeState(C, ds('T20 T20 T20')), 1, { live: true }).rows[0].cells[1]);
    assert.deepEqual([empty.darts.length, empty.big, empty.small], [0, '…', 'À JOUER']);
    assert.match(cellHtml(legTable(computeState(C, ds('T20 T20 T20')), 1, { live: true }).rows[0].cells[1]), /<span class="ds"><\/span>/);
  });
});
