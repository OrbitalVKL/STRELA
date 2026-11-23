// Lot 9.2 : QR code du salon (src/ui/qr.js). Pas de décodeur dans le projet ni dans les sessions : un petit lecteur
// écrit ici relit la matrice (format, masque, Reed-Solomon, données) et retrouve le texte ; plus les motifs fixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvg } from '../src/ui/qr.js';

const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
const ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 255; }
/** Syndromes de Reed-Solomon d'un bloc (données + correction) : tous nuls si le bloc est intact. */
function syndromesZero(block, ecc) {
  let a = 1;
  for (let k = 0; k < ecc; k++) {
    let s = 0;
    for (const c of block) s = gfMul(s, a) ^ c;
    if (s !== 0) return false;
    a = gfMul(a, 2);
  }
  return true;
}

/** Lecteur : matrice → texte (version 1 à 10, correction M), en vérifiant format et correction d'erreurs. */
function read(q) {
  const { size, modules: m } = q;
  const ver = (size - 17) / 4;
  // Format (copie autour du repère en haut à gauche), contrôlé par son code BCH.
  const pos = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  let f = 0;
  pos.forEach(([x, y], i) => { if (m[y][x]) f |= 1 << i; });
  f ^= 0x5412;
  let r = f >>> 10;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  assert.equal(r & 0x3ff, f & 0x3ff, 'code BCH du format');
  assert.equal(f >>> 13, 0, 'correction M');
  const mask = (f >>> 10) & 7;
  // Seconde copie identique.
  let f2 = 0;
  for (let i = 0; i < 8; i++) if (m[8][size - 1 - i]) f2 |= 1 << i;
  for (let i = 8; i < 15; i++) if (m[size - 15 + i][8]) f2 |= 1 << i;
  assert.equal(f2 ^ 0x5412, f, 'les deux copies du format');
  // Zones réservées (mêmes règles que l'encodeur, refaites ici).
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const res = (x, y) => { if (x >= 0 && y >= 0 && x < size && y < size) fn[y][x] = true; };
  for (let i = 0; i < size; i++) { res(6, i); res(i, 6); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) res(cx + dx, cy + dy);
  const al = [];
  if (ver > 1) { const n = Math.floor(ver / 7) + 2; const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2; al.push(6); for (let p = size - 7; al.length < n; p -= step) al.splice(1, 0, p); }
  al.forEach((ax, i) => al.forEach((ay, j) => { if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) res(ax + dx, ay + dy); }));
  for (const [x, y] of pos) res(x, y);
  for (let i = 0; i < 8; i++) res(size - 1 - i, 8);
  for (let i = 8; i < 15; i++) res(8, size - 15 + i);
  res(8, size - 8);
  if (ver >= 7) for (let i = 0; i < 18; i++) { res(size - 11 + (i % 3), Math.floor(i / 3)); res(Math.floor(i / 3), size - 11 + (i % 3)); }
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
      if (!fn[y][x]) bits.push(m[y][x] !== MASKS[mask](x, y) ? 1 : 0);
    }
  }
  let raw = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; raw -= (25 * n - 10) * n - 55; if (ver >= 7) raw -= 36; }
  const words = [];
  for (let i = 0; i + 8 <= Math.floor(raw / 8) * 8; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  // Désentrelacement.
  const nb = BLOCKS[ver], ecc = ECC[ver], total = Math.floor(raw / 8);
  const nShort = nb - (total % nb), shortLen = Math.floor(total / nb);
  const blocks = Array.from({ length: nb }, (_, i) => new Array(shortLen + (i < nShort ? 0 : 1)));
  let k = 0;
  for (let i = 0; i < shortLen - ecc; i++) for (let j = 0; j < nb; j++) blocks[j][i] = words[k++];
  for (let j = nShort; j < nb; j++) blocks[j][shortLen - ecc] = words[k++];
  for (let i = 0; i < ecc; i++) for (let j = 0; j < nb; j++) blocks[j][blocks[j].length - ecc + i] = words[k++];
  for (const b of blocks) assert.ok(syndromesZero(b, ecc), 'Reed-Solomon intact');
  const data = blocks.flatMap(b => b.slice(0, b.length - ecc));
  const dbits = data.flatMap(b => [7, 6, 5, 4, 3, 2, 1, 0].map(i => (b >>> i) & 1));
  const num = (a, n) => parseInt(dbits.slice(a, a + n).join(''), 2);
  assert.equal(num(0, 4), 4, 'mode octets');
  const lenBits = ver < 10 ? 8 : 16;
  const len = num(4, lenBits);
  const out = [];
  for (let i = 0; i < len; i++) out.push(num(4 + lenBits + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(out));
}

test('QR : relu à l\'identique, pour plusieurs longueurs et tous les masques', () => {
  const texts = ['STRELA', 'https://orbitalvkl.github.io/STRELA/rejoindre.html#BCD23', 'é'.repeat(30), 'x'.repeat(100), 'y'.repeat(200)];
  for (const t of texts) {
    for (let mask = 0; mask < 8; mask++) assert.equal(read(qrMatrix(t, { mask })), t, `${t.slice(0, 12)}… masque ${mask}`);
    const q = qrMatrix(t);
    assert.equal(read(q), t);
    assert.ok(q.mask >= 0 && q.mask < 8);
  }
  assert.equal(qrMatrix('https://orbitalvkl.github.io/STRELA/rejoindre.html#BCD23').version, 4, 'lien de salon : version 4 (33 × 33)');
  assert.throws(() => qrMatrix('z'.repeat(300)));
});

test('QR : repères, lignes de synchronisation, module sombre', () => {
  const { size, modules: m } = qrMatrix('STRELA', { mask: 3 });
  const finder = (cx, cy) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) assert.equal(m[cy + dy][cx + dx], Math.max(Math.abs(dx), Math.abs(dy)) !== 2); };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  for (let i = 8; i < size - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[size - 8][8], true);
  const svg = qrSvg('STRELA');
  assert.match(svg, /^<svg class="qr" viewBox="0 0 29 29"/);
  assert.match(svg, /var\(--board-cream\)/);
  assert.doesNotMatch(svg, /#[0-9a-f]{3,6}/i, 'aucune couleur en dur');
});
