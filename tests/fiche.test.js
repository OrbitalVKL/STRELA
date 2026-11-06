// Lot 7.1 : fiche de score à imprimer (src/ui/sheet.js) : contenu, pages A4, PDF bien formé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { computeState } from '../src/engine/x01.js';
import { sheetModel, drawSheet, pdfFromJpegs, sheetFileName, PAGE_W, PAGE_H, toBase64 } from '../src/ui/sheet.js';

const players = ['Alpha', 'Bravo', 'Charlie'].map((name, i) => ({ id: `p${i}`, name }));
const PO = 'T20 T20 T20  0 0 0  T20 T20 T20  S20 S20 S1  0 0 0  S20 S20 S1  T20 S20  S1 S1 S1  T20 S20';
const game = (over = {}) => {
  const config = { startScore: 301, outMode: 'single', legsToWin: 1, players: ['p0', 'p1', 'p2'], playOn: true };
  return { id: 'g', startedAt: new Date(2026, 10, 6, 21, 5).getTime(), endedAt: 1, abandoned: false, config, darts: ds(PO),
    drinks: { p1: [{ t: 1, at: 2 }, { t: 2, at: 12 }] }, ...over };
};

// Canvas factice : enregistre les textes écrits, mesure 0,6 em par caractère.
function fakeCanvas(w, h) {
  const texts = [];
  let px = 16;
  const ctx = new Proxy({ texts }, {
    get(t, k) {
      if (k === 'texts') return texts;
      if (k === 'measureText') return s => ({ width: s.length * px * 0.6 });
      if (k === 'fillText') return s => texts.push(s);
      return t[k] ?? (() => {});
    },
    set(t, k, v) { if (k === 'font') px = parseFloat(String(v).split(' ')[1]); t[k] = v; return true; },
  });
  return { width: w, height: h, getContext: () => ctx, ctx };
}

test('contenu : classement, tournée, verres, tableau de manche', () => {
  const g = game();
  const m = sheetModel(g, computeState(g.config, g.darts), players);
  assert.equal(m.format, "301 · SORTIE SIMPLE · JUSQU'AU BOUT");
  assert.equal(m.date, 'ven. 6 nov. 2026, 21 h 05');
  assert.equal(m.status, 'VAINQUEUR : Alpha');
  assert.deepEqual(m.ranking.map(r => [r.place, r.name]), [['1ER', 'Alpha'], ['2E', 'Charlie'], ['3E', 'Bravo']]);
  assert.deepEqual(m.payers, ['Bravo']);
  assert.equal(m.drinking, true);
  assert.deepEqual(m.ranking.map(r => r.drinks), ['x0', 'x0', 'x2']);
  assert.equal(m.legs.length, 1);
  assert.deepEqual(m.legs[0].columns, ['Alpha', 'Bravo', 'Charlie']);
  const bravo1 = m.legs[0].rows[0].cells[1];
  assert.deepEqual(bravo1.drinks, { total: 1, fresh: true }, 'verre pris pendant la volée d’Alpha → volée suivante de Bravo');
  assert.equal(m.legs[0].rows[2].cells[0].cls, 'fin');
  assert.equal(sheetFileName(g.startedAt, 'pdf'), 'strela-fiche-20261106-2105.pdf');
});

test('sans verres ni fin : pas de colonne Verres, pas de tournée, partie en cours', () => {
  const g = game({ drinks: undefined, darts: ds('T20 T20 T20 0 0 0') });
  const m = sheetModel(g, computeState(g.config, g.darts), players);
  assert.equal(m.drinking, false);
  assert.ok(m.ranking.every(r => r.drinks === null && r.place === ''));
  assert.deepEqual(m.payers, []);
  assert.equal(m.status, 'PARTIE EN COURS');
});

test('dessin : une page pour l’image, des pages A4 qui répètent l’en-tête du tableau coupé', () => {
  // Partie longue : 40 tours à 3 joueurs (personne ne finit).
  const darts = ds(Array.from({ length: 40 * 3 }, () => 'S1 S1 S1').join(' '));
  const g = game({ config: { ...game().config, startScore: 501, playOn: false }, darts });
  const m = sheetModel(g, computeState(g.config, g.darts), players);
  const [one] = drawSheet(m, { makeCanvas: fakeCanvas, version: '0.7.1' });
  assert.equal(one.width, PAGE_W);
  assert.ok(one.height > PAGE_H * 2, 'image d’un seul tenant');
  const pages = drawSheet(m, { paged: true, makeCanvas: fakeCanvas, version: '0.7.1' });
  assert.ok(pages.length >= 3, `${pages.length} pages`);
  pages.forEach((p, k) => {
    assert.equal(p.height, PAGE_H);
    const t = p.ctx.texts;
    assert.ok(t.includes(`page ${k + 1} / ${pages.length}`));
    assert.ok(t.includes('STRELA v0.7.1 · fiche de score'));
    if (k) assert.ok(t.includes('MANCHE 1') && t.includes('TOUR'), 'en-tête du tableau répété');
  });
  const rounds = pages.flatMap(p => p.ctx.texts.filter(x => /^\d+$/.test(x) && +x <= 40 && +x >= 1));
  for (let r = 1; r <= 40; r++) assert.ok(rounds.includes(String(r)), `tour ${r} présent`);
});

test('PDF : en-tête, une page A4 par image, table des renvois exacte', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = pdfFromJpegs([{ jpeg, w: 1240, h: 1754 }, { jpeg, w: 1240, h: 1754 }]);
  const txt = Buffer.from(pdf).toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4'));
  assert.ok(txt.trimEnd().endsWith('%%EOF'));
  assert.match(txt, /\/Type \/Pages \/Count 2 \/Kids \[3 0 R 6 0 R\]/);
  assert.equal((txt.match(/\/MediaBox \[0 0 595.28 841.89\]/g) || []).length, 2);
  assert.equal((txt.match(/\/Filter \/DCTDecode \/Length 9 >>/g) || []).length, 2);
  const xref = +txt.match(/startxref\n(\d+)/)[1];
  assert.ok(txt.slice(xref).startsWith('xref\n0 10\n'), 'catalogue, pages, 3 objets par page, infos');
  const offs = txt.slice(xref).split('\n').slice(3, 12).map(l => +l.slice(0, 10));
  offs.forEach((o, i) => assert.ok(txt.slice(o).startsWith(`${i + 1} 0 obj`), `objet ${i + 1} à ${o}`));
  assert.equal(Buffer.from(toBase64(pdf), 'base64').length, pdf.length);
});
