// Strela — outils de la base en ligne (lot 10), lancés par les actions GitHub (docs/cloud.md) ou à la main :
//
//   node tools/supabase.mjs ping                 réveil : appelle strela_ping avec la clé publique (projet gratuit mis
//                                                en veille au bout d'une semaine sans activité) ; purge aussi
//   node tools/supabase.mjs export FICHIER.json  copie de toutes les tables (clé secrète : SUPABASE_SECRET_KEY)
//   node tools/supabase.mjs restore FICHIER.json remet une copie dans un projet (tables créées par schema.sql d'abord)
//
// Adresse et clé publique : src/net/cloudconfig.js, ou SUPABASE_URL / SUPABASE_KEY. Vides : rien à faire (sortie 0).

import { writeFileSync, readFileSync } from 'node:fs';
import { CLOUD_CONFIG } from '../src/net/cloudconfig.js';

export const TABLES = Object.freeze(['profil', 'profil_secret', 'appareil', 'amitie', 'partie', 'participation']); // ordre des clés étrangères
const KEYS = { profil: 'id', profil_secret: 'profil', appareil: 'auth_uid', amitie: 'demandeur,destinataire', partie: 'id', participation: 'partie,ordre' };

const config = () => ({
  url: String(process.env.SUPABASE_URL || CLOUD_CONFIG.url || '').replace(/\/+$/, ''),
  key: String(process.env.SUPABASE_KEY || CLOUD_CONFIG.key || ''),
  secret: String(process.env.SUPABASE_SECRET_KEY || ''),
});
const headers = key => ({ apikey: key, 'Content-Type': 'application/json', ...(/^eyJ/.test(key) ? { Authorization: `Bearer ${key}` } : {}) });

async function req(url, opts, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      const text = await r.text();
      if (r.ok) return text ? JSON.parse(text) : null;
      last = new Error(`${r.status} ${text.slice(0, 300)}`);
      if (r.status < 500) break;
    } catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 3000 * (i + 1)));
  }
  throw last;
}

export async function ping({ url, key } = config()) {
  return req(`${url}/rest/v1/rpc/strela_ping`, { method: 'POST', headers: headers(key), body: '{}' }, 4);
}

export async function exportAll({ url, secret } = config()) {
  const out = { format: 'strela-base-en-ligne', version: 1, exportedAt: new Date().toISOString(), tables: {} };
  for (const t of TABLES) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const page = await req(`${url}/rest/v1/${t}?select=*&order=${KEYS[t].split(',')[0]}&offset=${from}&limit=1000`, { headers: headers(secret) });
      rows.push(...page);
      if (page.length < 1000) break;
    }
    out.tables[t] = rows;
  }
  return out;
}

export async function restoreAll(data, { url, secret } = config()) {
  if (!data || data.format !== 'strela-base-en-ligne') throw new Error('ce fichier n\'est pas une copie de la base en ligne de Strela');
  const counts = {};
  for (const t of TABLES) {
    const rows = data.tables[t] || [];
    for (let i = 0; i < rows.length; i += 500) {
      await req(`${url}/rest/v1/${t}?on_conflict=${KEYS[t]}`, {
        method: 'POST', headers: { ...headers(secret), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)),
      });
    }
    counts[t] = rows.length;
  }
  return counts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, file] = process.argv.slice(2);
  const c = config();
  if (!c.url || !c.key) { console.log('Base en ligne pas encore configurée (src/net/cloudconfig.js vide) : rien à faire.'); process.exit(0); }
  try {
    if (cmd === 'ping') console.log('Réveil :', JSON.stringify(await ping(c)));
    else if (cmd === 'export' || cmd === 'restore') {
      if (!c.secret) { console.log('SUPABASE_SECRET_KEY absente : copie impossible (secret à créer dans GitHub, docs/cloud.md).'); process.exit(cmd === 'export' ? 0 : 1); }
      if (!file) throw new Error('fichier manquant');
      if (cmd === 'export') {
        const d = await exportAll(c);
        writeFileSync(file, JSON.stringify(d));
        console.log('Copie :', Object.entries(d.tables).map(([t, r]) => `${t} ${r.length}`).join(', '));
      } else console.log('Remis :', JSON.stringify(await restoreAll(JSON.parse(readFileSync(file, 'utf8')), c)));
    } else { console.log('usage : node tools/supabase.mjs ping | export FICHIER | restore FICHIER'); process.exit(2); }
  } catch (e) { console.error(`Échec : ${e.message || e}`); process.exit(1); }
}
