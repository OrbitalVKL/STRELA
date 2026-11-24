// Lot 10 : compte en ligne, fonctions pures (src/engine/cloud.js) et client Supabase (src/net/supabase.js) avec un
// faux fetch : identifiants, code de récupération, code d'ami, configuration, erreurs, renouvellement du jeton.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newUuid, isUuid, newSecret, isSecret, newCloudAccount, cloudAccountRecord, recoveryCode, parseRecoveryCode,
  cleanFriendCode, cleanCloudConfig, agoText,
} from '../src/engine/cloud.js';
import { supabaseClient, CloudError, cloudErrorText } from '../src/net/supabase.js';

const seeded = (s = 1) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

test('identifiants : UUID v4 et secret de 20 caractères, tous différents', () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) { const u = newUuid(); assert.ok(isUuid(u), u); assert.equal(u[14], '4'); ids.add(u); }
  assert.equal(ids.size, 200);
  const s = newSecret();
  assert.ok(isSecret(s), s);
  assert.equal(s.length, 20);
  assert.ok(!isSecret('O'.repeat(20)), 'pas de O dans la base 32 de Crockford');
});

test('compte : forme gardée dans les réglages, illisible → null', () => {
  const a = newCloudAccount(1234, seeded(7));
  assert.deepEqual(cloudAccountRecord(a), a);
  assert.equal(cloudAccountRecord(null), null);
  assert.equal(cloudAccountRecord({ profileId: 'x', secret: a.secret }), null);
  assert.equal(cloudAccountRecord({ profileId: a.profileId, secret: 'court' }), null);
  assert.equal(cloudAccountRecord({ ...a, createdAt: 'hier' }).createdAt, 0);
});

test('code de récupération : aller-retour, tirets et espaces ignorés, fautes repérées', () => {
  for (let i = 1; i <= 50; i++) {
    const a = newCloudAccount(0, seeded(i));
    const code = recoveryCode(a);
    assert.match(code, /^([0-9A-HJKMNP-TV-Z]{5}-){9}[0-9A-HJKMNP-TV-Z]{2}$/);
    assert.deepEqual(parseRecoveryCode(code), { profileId: a.profileId, secret: a.secret });
    assert.deepEqual(parseRecoveryCode(` ${code.toLowerCase().replace(/-/g, ' ')} `), { profileId: a.profileId, secret: a.secret });
  }
  const a = newCloudAccount(0, seeded(3));
  const code = recoveryCode(a);
  let caught = 0;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '-') continue;
    const c = code[i] === 'A' ? 'B' : 'A';
    if (parseRecoveryCode(code.slice(0, i) + c + code.slice(i + 1)) === null) caught++;
  }
  assert.equal(caught, 47, `fautes de frappe repérées : ${caught} / 47`);
  assert.equal(parseRecoveryCode('ABCDE'), null);
  assert.equal(parseRecoveryCode(''), null);
  assert.equal(recoveryCode(null), null);
  // O lu comme 0, I et L comme 1 (lettres absentes du code).
  const withO = code.replace(/0/g, 'O');
  assert.deepEqual(parseRecoveryCode(withO), parseRecoveryCode(code));
});

test('code d\'ami et configuration du serveur', () => {
  assert.equal(cleanFriendCode(' gw-b8vs '), 'GWB8VS');
  assert.equal(cleanFriendCode('GWB8V'), null);
  assert.equal(cleanFriendCode('GWB8VA'), null, 'pas de voyelle');
  assert.equal(cleanCloudConfig({ url: '', key: '' }), null);
  assert.equal(cleanCloudConfig({ url: 'https://abc.supabase.co', key: 'court' }), null);
  assert.deepEqual(cleanCloudConfig({ url: ' https://abc.supabase.co/ ', key: 'sb_publishable_0123456789abcdef' }), { url: 'https://abc.supabase.co', key: 'sb_publishable_0123456789abcdef' });
});

test('« il y a… »', () => {
  const now = 1e12;
  assert.equal(agoText(0, now), 'jamais');
  assert.equal(agoText(now - 10e3, now), 'à l\'instant');
  assert.equal(agoText(now - 5 * 60e3, now), 'il y a 5 min');
  assert.equal(agoText(now - 2 * 3600e3, now), 'il y a 2 h');
  assert.equal(agoText(now - 3 * 86400e3, now), 'il y a 3 jours');
  assert.equal(agoText(now - 1 * 86400e3, now), 'il y a 1 jour');
});

// ------------------------------------------------------------------ client, faux fetch
function fakeFetch(routes) {
  const log = [];
  const f = async (url, opts) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    log.push({ path, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : null });
    const r = routes(path, opts, log);
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.body ?? null) };
  };
  f.log = log;
  return f;
}
const auth = (id, n = 1) => ({ status: 200, body: { access_token: `acc-${id}-${n}`, refresh_token: `ref-${id}-${n}`, expires_in: 3600, user: { id } } });

test('client : connexion anonyme, clé publique en apikey, jeton dans Authorization', async () => {
  const sessions = [];
  const f = fakeFetch(path => (path === '/auth/v1/signup' ? auth('u1') : { status: 200, body: { ok: 1 } }));
  const c = supabaseClient({ url: 'https://x.supabase.co', key: 'sb_publishable_cle', fetch: f, onSession: s => sessions.push(s) });
  assert.deepEqual(await c.rpc('strela_mon_compte'), { ok: 1 });
  assert.equal(f.log[0].path, '/auth/v1/signup');
  assert.equal(f.log[0].headers.apikey, 'sb_publishable_cle');
  assert.equal(f.log[0].headers.Authorization, undefined, 'clé publishable : pas en Authorization');
  assert.equal(f.log[1].path, '/rest/v1/rpc/strela_mon_compte');
  assert.equal(f.log[1].headers.Authorization, 'Bearer acc-u1-1');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].userId, 'u1');
  // Ancienne clé anon (JWT) : aussi en Authorization quand il n'y a pas de session.
  const g = fakeFetch(() => ({ status: 200, body: { ok: true } }));
  await supabaseClient({ url: 'https://x', key: 'eyJhbGciOi.cle.anon', fetch: g }).anonRpc('strela_ping');
  assert.equal(g.log[0].headers.Authorization, 'Bearer eyJhbGciOi.cle.anon');
});

test('client : jeton expiré renouvelé, renouvellement refusé → nouvelle connexion', async () => {
  let t = 0;
  let n = 1;
  const f = fakeFetch((path, opts) => {
    if (path === '/auth/v1/signup') return auth('u2', 9);
    if (path.startsWith('/auth/v1/token')) {
      const b = JSON.parse(opts.body);
      return b.refresh_token === 'ref-u1-1' ? auth('u1', ++n) : { status: 400, body: { error: 'invalid_grant', error_description: 'Invalid Refresh Token' } };
    }
    if (opts.headers.Authorization === 'Bearer acc-u1-1') return { status: 401, body: { message: 'JWT expired' } };
    return { status: 200, body: { who: opts.headers.Authorization } };
  });
  const c = supabaseClient({ url: 'https://x', key: 'sb_publishable_cle', fetch: f, now: () => t, session: { userId: 'u1', access: 'acc-u1-1', refresh: 'ref-u1-1', expiresAt: 1e15 } });
  assert.deepEqual(await c.rpc('strela_x'), { who: 'Bearer acc-u1-2' }, 'jeton refusé (401) → renouvelé une fois');
  // Expiré d'après l'heure : renouvelé avant l'appel ; refresh refusé → nouvelle connexion anonyme.
  t = 1e16;
  assert.deepEqual(await c.rpc('strela_x'), { who: 'Bearer acc-u2-9' });
  assert.equal(c.session.userId, 'u2');
});

test('client : erreurs classées (réseau, serveur en veille, refus de la fonction)', async () => {
  const mk = r => supabaseClient({ url: 'https://x', key: 'sb_publishable_cle', fetch: fakeFetch(() => r), session: { userId: 'u', access: 'a', refresh: 'r', expiresAt: 1e15 } });
  const err = async c => { try { await c.rpc('strela_x'); } catch (e) { return e; } return null; };
  const net = await err(mk(new TypeError('Failed to fetch')));
  assert.ok(net instanceof CloudError);
  assert.equal(net.kind, 'reseau');
  assert.equal((await err(mk({ status: 503, body: { message: 'Service Unavailable' } }))).kind, 'serveur');
  const refus = await err(mk({ status: 400, body: { code: 'P0001', message: 'strela:code_inconnu' } }));
  assert.equal(refus.kind, 'refus');
  assert.equal(refus.code, 'code_inconnu');
  assert.equal(cloudErrorText(refus), 'aucun joueur n\'a ce code');
  assert.match(cloudErrorText(net), /réseau/);
});
