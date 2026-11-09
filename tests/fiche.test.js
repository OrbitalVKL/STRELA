// Lot 7.1 : fiche de score à imprimer (src/ui/sheet.js) : contenu, pages A4, PDF bien formé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ds } from './helpers.js';
import { computeState } from '../src/engine/x01.js';
import { sheetModel, drawSheet, pdfFromJpegs, sheetFileName, PAGE_W, PAGE_H, HALF_H, toBase64 } from '../src/ui/sheet.js';

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

test('contenu : vainqueur, classement avec verres, tournée, tableau de manche (lot 7.3 : rien d’autre)', () => {
  const g = game();
  const m = sheetModel(g, computeState(g.config, g.darts), players);
  assert.equal(m.format, "301 · SORTIE SIMPLE · JUSQU'AU BOUT");
  assert.equal(m.date, 'ven. 6 nov. 2026, 21 h 05');
  assert.equal(m.status, 'VAINQUEUR : Alpha');
  assert.deepEqual(m.ranking.map(r => [r.place, r.name, r.drinks]), [['1ER', 'Alpha', 0], ['2E', 'Charlie', 0], ['3E', 'Bravo', 2]]);
  assert.deepEqual(Object.keys(m.ranking[0]).sort(), ['drinks', 'legs', 'name', 'place', 'winner']);
  assert.equal(m.legsShown, false, 'une seule manche : pas de colonne Manches');
  assert.deepEqual(m.payers, ['Bravo']);
  assert.equal(m.drinking, true);
  assert.equal(m.legs.length, 1);
  assert.deepEqual(m.legs[0].columns, ['Alpha', 'Bravo', 'Charlie']);
  assert.deepEqual(m.legs[0].rows[0].cells[1].drinks, { total: 1, fresh: true }, 'verre pris pendant la volée d’Alpha → volée suivante de Bravo');
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

const longGame = rounds => {
  const darts = ds(Array.from({ length: rounds * 3 }, () => 'S1 S1 S1').join(' '));
  return game({ config: { ...game().config, startScore: 501, playOn: false }, darts });
};
const texts = cs => cs.flatMap(c => c.ctx.texts);

test('partie courte : une demi-feuille A4 en paysage (A5), sans titre STRELA, légende ni pied de page', () => {
  const g = game();
  const m = sheetModel(g, computeState(g.config, g.darts), players);
  for (const paged of [true, false]) {
    const cs = drawSheet(m, { paged, makeCanvas: fakeCanvas });
    assert.equal(cs.layout, 'half');
    assert.equal(cs.length, 1);
    assert.equal(cs[0].width, PAGE_W);
    assert.equal(cs[0].height, HALF_H);
  }
  const t = texts(drawSheet(m, { paged: true, makeCanvas: fakeCanvas }));
  for (const want of ['VAINQUEUR : Alpha', 'CLASSEMENT', 'VERRES', 'LE DERNIER PAIE SA TOURNÉE', 'Bravo', 'MANCHE 1', 'x2']) assert.ok(t.includes(want), want);
  for (const t1 of t) assert.doesNotMatch(t1, /STRELA|fiche de score|Moy\.|Chaque case|page /i, `texte en trop : ${t1}`);
});

test('partie plus longue : une seule page A4, réduite si besoin ; très longue : des pages A4', () => {
  const m15 = sheetModel(longGame(15), computeState(longGame(15).config, longGame(15).darts), players);
  const one = drawSheet(m15, { paged: true, makeCanvas: fakeCanvas });
  assert.equal(one.layout, 'page');
  assert.equal(one.length, 1);
  assert.equal(one[0].height, PAGE_H);
  const g30 = longGame(30);
  const scaled = drawSheet(sheetModel(g30, computeState(g30.config, g30.darts), players), { paged: true, makeCanvas: fakeCanvas });
  assert.equal(scaled.layout, 'scaled');
  assert.equal(scaled.length, 1);
  assert.ok(scaled.scale >= 0.62 && scaled.scale < 1);
  const g60 = longGame(60);
  const m60 = sheetModel(g60, computeState(g60.config, g60.darts), players);
  const pages = drawSheet(m60, { paged: true, makeCanvas: fakeCanvas });
  assert.equal(pages.layout, 'pages');
  assert.ok(pages.length >= 2);
  pages.forEach((p, k) => {
    assert.equal(p.height, PAGE_H);
    assert.ok(p.ctx.texts.includes(`${k + 1} / ${pages.length}`));
    if (k) assert.ok(p.ctx.texts.includes('MANCHE 1'), 'en-tête du tableau répété');
  });
  const rounds = pages.flatMap(p => p.ctx.texts.filter(x => /^\d+$/.test(x) && +x >= 1 && +x <= 60));
  for (let r = 1; r <= 60; r++) assert.ok(rounds.includes(String(r)), `tour ${r} présent`);
  // Image : une seule, aussi haute qu'il faut.
  const img = drawSheet(m60, { makeCanvas: fakeCanvas });
  assert.equal(img.length, 1);
  assert.ok(img[0].height > PAGE_H);
});

test('PDF : une page par image, à la taille de l’image (A5 paysage ou A4), table des renvois exacte', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = pdfFromJpegs([{ jpeg, w: 1240, h: 874 }, { jpeg, w: 1240, h: 1754 }]);
  const txt = Buffer.from(pdf).toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4'));
  assert.ok(txt.trimEnd().endsWith('%%EOF'));
  assert.match(txt, /\/Type \/Pages \/Count 2 \/Kids \[3 0 R 6 0 R\]/);
  assert.match(txt, /\/MediaBox \[0 0 595.28 419.53\]/, 'A5 paysage (21 × 14,8 cm)');
  assert.match(txt, /\/MediaBox \[0 0 595.28 841.89\]/, 'A4');
  assert.equal((txt.match(/\/Filter \/DCTDecode \/Length 9 >>/g) || []).length, 2);
  const xref = +txt.match(/startxref\n(\d+)/)[1];
  assert.ok(txt.slice(xref).startsWith('xref\n0 10\n'));
  const offs = txt.slice(xref).split('\n').slice(3, 12).map(l => +l.slice(0, 10));
  offs.forEach((o, i) => assert.ok(txt.slice(o).startsWith(`${i + 1} 0 obj`), `objet ${i + 1} à ${o}`));
  assert.equal(Buffer.from(toBase64(pdf), 'base64').length, pdf.length);
});
