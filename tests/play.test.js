// Fiche Google Play (lot 6) : limites de longueur de Play, images aux formats demandés, politique de confidentialité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const fiche = read('docs/play/fiche.md');
/** Bloc de code qui suit le titre `## titre…`. */
const block = title => { const m = new RegExp(`## ${title}[^\\n]*\\n[\\s\\S]*?\`\`\`\\n([\\s\\S]*?)\`\`\``).exec(fiche); assert.ok(m, title); return m[1].trim(); };

test('fiche Play : nom ≤ 30, description courte ≤ 80, longue ≤ 4 000 caractères', () => {
  assert.ok([...block('Nom')].length <= 30, block('Nom'));
  assert.ok([...block('Description courte')].length <= 80);
  assert.ok([...block('Description longue')].length <= 4000);
  assert.match(block('Nom'), /^Strela/);
});

test('fiche Play : images aux tailles demandées (JPEG sans transparence, 9:16 et 16:9)', () => {
  const jpeg = p => {
    const b = readFileSync(join(ROOT, p));
    assert.equal(b.readUInt16BE(0), 0xFFD8, `${p} en JPEG`);
    for (let i = 2; i < b.length;) {
      const marker = b.readUInt16BE(i);
      if (marker >= 0xFFC0 && marker <= 0xFFC2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
    throw new Error(`${p} : taille introuvable`);
  };
  assert.deepEqual(jpeg('docs/play/presentation-1024x500.jpg'), [1024, 500]);
  const caps = readdirSync(join(ROOT, 'docs/play/captures')).filter(f => f.endsWith('.jpg'));
  assert.ok(caps.length >= 8);
  for (const f of caps) {
    const size = jpeg(`docs/play/captures/${f}`);
    assert.deepEqual(size, /paysage/.test(f) ? [1920, 1080] : [1080, 1920], f);
  }
  for (const t of ['sombre', 'clair']) for (const o of ['paysage', 'accueil']) assert.ok(caps.some(f => f.includes(o) && f.includes(t)), `${o} ${t}`);
});

test('politique de confidentialité : en français, rien de collecté, réseau décrit par variante, contact', () => {
  const html = read('confidentialite.html');
  assert.match(html, /<html lang="fr"/);
  assert.match(html, /ne collecte, ne transmet ni ne partage aucune donnée/);
  assert.match(html, /Version Google Play<\/b> : aucun accès à Internet/);
  assert.match(html, /API de GitHub/);
  assert.match(html, /<!--@contact-->\[E-MAIL DE CONTACT\]<!--\/@-->/);
  assert.match(read('docs/play/checklist.md'), /12 testeurs/);
  assert.match(read('docs/play/classification.md'), /carabine/);
});
