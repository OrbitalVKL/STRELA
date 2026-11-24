// Strela — faux Supabase des tests (lot 10) : les mêmes adresses que le vrai (/auth/v1/signup, /auth/v1/token,
// /rest/v1/rpc/<fonction>), mais les fonctions tournent pour de vrai dans un Postgres local qui a joué
// supabase/schema.sql (tools/lib/pg.mjs). Seule la connexion anonyme est imitée (jetons « fake.<base64>.x »).
//
//   const sb = await fakeSupabase();  sb.url, sb.key, sb.sql(…), sb.down = true (répond 503), sb.expire() (jetons
//   expirés), sb.calls (fonctions appelées), sb.close()

import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { startPg } from './pg.mjs';
import { frame, parse, GUID } from './signal-server.mjs';

export const FAKE_KEY = 'sb_publishable_strela_tests_0123456789';
export const FAKE_SECRET = 'sb_secret_strela_tests_0123456789'; // clé secrète (copie de la base, tools/supabase.mjs)
const TABLES = ['profil', 'profil_secret', 'appareil', 'amitie', 'partie', 'participation'];

export async function fakeSupabase({ pg = null } = {}) {
  const db = pg || await startPg();
  const refreshTokens = new Map(); // refresh → userId
  let generation = 0;              // expire() : les jetons d'avant sont refusés
  const state = { down: false, calls: [], offline: false };

  const token = userId => `fake.${Buffer.from(JSON.stringify({ sub: userId, g: generation })).toString('base64url')}.x`;
  const decode = t => {
    const m = /^fake\.([^.]+)\.x$/.exec(t || '');
    if (!m) return null;
    try { const c = JSON.parse(Buffer.from(m[1], 'base64url').toString()); return c.g === generation ? c.sub : null; } catch (e) { return null; }
  };
  const session = userId => {
    const refresh = randomBytes(12).toString('hex');
    refreshTokens.set(refresh, userId);
    return { access_token: token(userId), refresh_token: refresh, expires_in: 3600, token_type: 'bearer', user: { id: userId, is_anonymous: true } };
  };

  // Clé secrète : lecture et écriture directes des tables (comme PostgREST avec service_role, sans RLS).
  async function direct(req, raw, send) {
    const u = new URL(req.url, 'http://x');
    const t = u.pathname.replace('/rest/v1/', '');
    if (!TABLES.includes(t)) { send(404, { message: 'table inconnue' }); return; }
    const tag = `j${randomBytes(4).toString('hex')}`;
    try {
      if (req.method === 'GET') {
        const order = (u.searchParams.get('order') || '').replace(/[^a-z_]/g, '') || '1';
        const off = Number(u.searchParams.get('offset')) || 0;
        const lim = Number(u.searchParams.get('limit')) || 1000;
        send(200, JSON.parse(await db.sql(`select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (select * from public.${t} order by ${order} offset ${off} limit ${lim}) t`)));
      } else {
        await db.sql(`insert into public.${t} select * from jsonb_populate_recordset(null::public.${t}, $${tag}$${raw}$${tag}$::jsonb) on conflict do nothing`);
        send(201);
      }
    } catch (e) { send(400, { message: String(e.message).split('\n')[0] }); }
  }

  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { send(204); return; }
    if (state.offline) { req.socket.destroy(); return; }
    let raw = '';
    for await (const c of req) raw += c;
    if (state.down) { send(503, { message: 'Service Unavailable' }); return; }
    if (req.headers.apikey === FAKE_SECRET) { await direct(req, raw, send); return; }
    if (req.headers.apikey !== FAKE_KEY) { send(401, { message: 'Invalid API key' }); return; }
    const url = new URL(req.url, 'http://x');
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch (e) { send(400, { message: 'JSON invalide' }); return; }
    try {
      if (url.pathname === '/auth/v1/signup') {
        const id = randomUUID();
        await db.sql(`insert into auth.users (id) values ('${id}')`);
        send(200, session(id));
        return;
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const uid = refreshTokens.get(body.refresh_token);
        if (!uid) { send(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' }); return; }
        refreshTokens.delete(body.refresh_token);
        send(200, session(uid));
        return;
      }
      const m = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
      if (m) {
        const auth = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
        const sub = auth && auth !== FAKE_KEY ? decode(auth) : null;
        if (auth && auth !== FAKE_KEY && !sub) { send(401, { code: 'PGRST301', message: 'JWT expired' }); return; }
        state.calls.push(m[1]);
        const tag = `j${randomBytes(4).toString('hex')}`;
        const out = await db.sql(`select test_rpc('${m[1]}', $${tag}$${JSON.stringify(body)}$${tag}$::jsonb)`, sub ? { as: 'authenticated', sub } : { as: 'anon' });
        send(200, out ? JSON.parse(out) : null);
        return;
      }
      send(404, { message: 'introuvable' });
    } catch (e) {
      const msg = String(e.message || e).split('\n')[0].replace(/^ERROR:\s*/, '');
      send(/permission denied/.test(msg) ? 401 : 400, { code: 'P0001', message: msg });
    }
  });
  // Realtime (lot 10, étape 6) : présence sur le canal privé « strela-presence », protocole Phoenix JSON, réservée aux
  // connexions rattachées à un compte (comme les politiques de schema.sql).
  const members = new Map(); // socket → { key, meta | null, joinRef }
  const sendWs = (sock, obj) => { try { sock.write(frame(JSON.stringify(obj))); } catch (e) { /* */ } };
  const TOPIC = 'realtime:strela-presence';
  const broadcast = payload => { for (const s2 of members.keys()) sendWs(s2, { topic: TOPIC, event: 'presence_diff', payload, ref: null }); };
  const stateOf = () => {
    const out = {};
    for (const m of members.values()) if (m.meta) (out[m.key] || (out[m.key] = { metas: [] })).metas.push(m.meta);
    return out;
  };
  const leave = sock => {
    const m = members.get(sock);
    if (m && m.meta) { broadcast({ joins: {}, leaves: { [m.key]: { metas: [m.meta] } } }); m.meta = null; }
  };
  server.on('upgrade', (req, sock) => {
    if (!req.url.startsWith('/realtime/v1/websocket') || state.offline || state.realtimeOff) { sock.destroy(); return; }
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let buf = Buffer.alloc(0);
    sock.on('data', async chunk => {
      const [msgs, rest, closed] = parse(Buffer.concat([buf, chunk]));
      buf = rest;
      for (const raw of msgs) {
        let m;
        try { m = JSON.parse(String(raw)); } catch (e) { continue; }
        const reply = (status, response = {}) => sendWs(sock, { topic: m.topic, event: 'phx_reply', payload: { status, response }, ref: m.ref, join_ref: m.join_ref });
        if (m.topic === 'phoenix' && m.event === 'heartbeat') { reply('ok'); continue; }
        if (m.topic !== TOPIC) { reply('error', { reason: 'sujet inconnu' }); continue; }
        if (m.event === 'phx_join') {
          const sub = decode(m.payload && m.payload.access_token);
          const cfg = (m.payload && m.payload.config) || {};
          const ok = sub && cfg.private === true && (await db.sql(`select count(*) from public.appareil where auth_uid = '${sub}'`)) === '1';
          if (!ok) { reply('error', { reason: 'Unauthorized' }); continue; }
          members.set(sock, { key: (cfg.presence && cfg.presence.key) || sub, meta: null, joinRef: m.join_ref });
          reply('ok');
          sendWs(sock, { topic: TOPIC, event: 'presence_state', payload: stateOf(), ref: null });
        } else if (m.event === 'presence' && members.has(sock)) {
          const me = members.get(sock);
          const p = m.payload || {};
          if (p.event === 'track') {
            const before = me.meta;
            me.meta = { ...(p.payload || {}), phx_ref: randomBytes(6).toString('hex') };
            broadcast({ joins: { [me.key]: { metas: [me.meta] } }, leaves: before ? { [me.key]: { metas: [before] } } : {} });
          } else if (p.event === 'untrack') leave(sock);
          reply('ok');
        } else if (m.event === 'access_token') reply('ok');
      }
      if (closed) sock.end();
    });
    const gone = () => { leave(sock); members.delete(sock); };
    sock.on('close', gone);
    sock.on('error', gone);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, key: FAKE_KEY, secret: FAKE_SECRET, sql: db.sql, state,
    get calls() { return state.calls; },
    set down(v) { state.down = !!v; },
    set offline(v) { state.offline = !!v; if (v) for (const so of members.keys()) so.destroy(); },
    presence: () => stateOf(),
    expire() { generation++; },
    async close() { for (const so of members.keys()) so.destroy(); await new Promise(r => server.close(r)); if (!pg) db.stop(); },
  };
}
