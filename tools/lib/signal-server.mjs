// Serveur de signalisation local pour les tests de la partie en ligne (lot 9.2) : le protocole du serveur public de
// PeerJS (0.peerjs.com), réduit à ce dont Strela se sert (src/net/signal.js), sur un WebSocket écrit à la main (le
// projet n'a aucune dépendance). OPEN à la connexion, ID-TAKEN si l'identifiant est pris, relais des messages à `dst`
// (avec `src`), mise en attente 5 s puis EXPIRE si le destinataire n'est pas là, HEARTBEAT ignoré. Comme le vrai
// serveur (relevé le 24/11) : un message à la forme refusée (src/net/signal.js › peerjsValid) coupe la liaison de
// l'expéditeur (code 1000) sans être relayé ; `s.cut` compte ces coupures.
//   const s = await signalServer(); s.url → 'ws://127.0.0.1:PORT/peerjs' ; s.close() ; s.kick(id) coupe un client.
// Lot 9.5 : aussi un petit courtier MQTT 3.1.1 sur WebSocket (sous-protocole « mqtt », trames binaires) sur /mqtt :
// CONNECT → CONNACK, SUBSCRIBE → SUBACK, PUBLISH (QoS 0) relayé aux abonnés du sujet exact, PINGREQ → PINGRESP.
//   s.mqttUrl → 'ws://127.0.0.1:PORT/mqtt' ; s.peerjsDown = true : /peerjs refuse tout (serveur PeerJS en panne).
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { peerjsValid } from '../../src/net/signal.js';

export const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function frame(text, op = 0x81) {
  const data = Buffer.isBuffer(text) ? text : Buffer.from(text);
  const len = data.length;
  const head = len < 126 ? Buffer.from([op, len]) : len < 65536 ? Buffer.from([op, 126, len >> 8, len & 255]) : (() => {
    const b = Buffer.alloc(10); b[0] = op; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b;
  })();
  return Buffer.concat([head, data]);
}

/** Lit les trames complètes du tampon ; renvoie [messages texte, reste, fermé ?]. */
export function parse(buf) {
  const out = [];
  let closed = false;
  while (buf.length >= 2) {
    const op = buf[0] & 15;
    const masked = buf[1] & 128;
    let len = buf[1] & 127;
    let off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    const maskOff = off;
    if (masked) off += 4;
    if (buf.length < off + len) break;
    const data = Buffer.from(buf.subarray(off, off + len));
    if (masked) for (let i = 0; i < len; i++) data[i] ^= buf[maskOff + (i % 4)];
    buf = buf.subarray(off + len);
    if (op === 8) { closed = true; break; }
    if (op === 1) out.push(data.toString());
    if (op === 2) out.push(data);
  }
  return [out, buf, closed];
}

/** Paquets MQTT complets d'un tampon : [[{ type, flags, body }], reste]. */
function mqttRead(buf) {
  const out = [];
  let i = 0;
  while (i + 2 <= buf.length) {
    let len = 0, mul = 1, j = i + 1, ok = false;
    for (let k = 0; k < 4 && j < buf.length; k++, j++) { len += (buf[j] & 127) * mul; mul *= 128; if (!(buf[j] & 128)) { ok = true; j++; break; } }
    if (!ok || j + len > buf.length) break;
    out.push({ type: buf[i] >> 4, flags: buf[i] & 15, body: buf.subarray(j, j + len) });
    i = j + len;
  }
  return [out, buf.subarray(i)];
}
const mqttPacket = (head, body) => { const v = []; let n = body.length; do { let d = n % 128; n = Math.floor(n / 128); if (n) d |= 128; v.push(d); } while (n); return Buffer.from([head, ...v, ...body]); };

export async function signalServer() {
  const clients = new Map(); // id → socket
  const queue = new Map();   // id → [{ msg, timer }]
  const subs = new Map();    // sujet MQTT → Set(socket)
  const server = createServer((req, res) => { res.writeHead(404); res.end(); });
  const sendTo = (sock, obj) => { try { sock.write(frame(JSON.stringify(obj))); } catch (e) { /* */ } };
  const api = { peerjsDown: false, cut: 0 };
  function mqttClient(req, sock, key) {
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: mqtt\r\n\r\n`);
    const raw = b => { try { sock.write(frame(b, 0x82)); } catch (e) { /* */ } };
    let wsBuf = Buffer.alloc(0), mq = Buffer.alloc(0);
    const mine = new Set();
    sock.on('data', chunk => {
      const [msgs, rest, closed] = parse(Buffer.concat([wsBuf, chunk]));
      wsBuf = rest;
      for (const m of msgs) {
        if (!Buffer.isBuffer(m)) continue;
        const [packets, left] = mqttRead(Buffer.concat([mq, m]));
        mq = Buffer.from(left);
        for (const p of packets) {
          if (p.type === 1) raw(Buffer.from([0x20, 2, 0, 0]));
          else if (p.type === 8) {
            const pid = p.body.subarray(0, 2);
            const tl = p.body.readUInt16BE(2);
            const topic = p.body.subarray(4, 4 + tl).toString();
            if (!subs.has(topic)) subs.set(topic, new Set());
            subs.get(topic).add(sock); mine.add(topic);
            raw(Buffer.from([0x90, 3, pid[0], pid[1], 0]));
          } else if (p.type === 3) {
            const tl = p.body.readUInt16BE(0);
            const topic = p.body.subarray(2, 2 + tl).toString();
            const out = frame(mqttPacket(0x30, [...p.body]), 0x82);
            for (const s2 of subs.get(topic) || []) { try { s2.write(out); } catch (e) { /* */ } }
          } else if (p.type === 12) raw(Buffer.from([0xD0, 0]));
          else if (p.type === 14) sock.end();
        }
      }
      if (closed) sock.end();
    });
    const gone = () => { for (const t of mine) { const set = subs.get(t); if (set) set.delete(sock); } };
    sock.on('close', gone);
    sock.on('error', gone);
  }
  server.on('upgrade', (req, sock) => {
    const u = new URL(req.url, 'http://x');
    const id = u.searchParams.get('id');
    const key = req.headers['sec-websocket-key'];
    if (key && u.pathname.startsWith('/mqtt')) { mqttClient(req, sock, key); return; }
    if (!key || !u.pathname.startsWith('/peerjs') || api.peerjsDown) { sock.destroy(); return; }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    if (!id || clients.has(id)) { sendTo(sock, { type: 'ID-TAKEN', payload: { msg: 'ID is taken' } }); sock.end(); return; }
    clients.set(id, sock);
    sendTo(sock, { type: 'OPEN' });
    for (const q of queue.get(id) || []) { clearTimeout(q.timer); sendTo(sock, q.msg); }
    queue.delete(id);
    let buf = Buffer.alloc(0);
    sock.on('data', chunk => {
      const [msgs, rest, closed] = parse(Buffer.concat([buf, chunk]));
      buf = rest;
      for (const text of msgs) {
        let m;
        try { m = JSON.parse(text); } catch (e) { continue; }
        if (m.type === 'HEARTBEAT') continue;
        if (!peerjsValid(m)) { api.cut++; sock.end(frame(Buffer.from([0x03, 0xE8]), 0x88)); return; }
        m.src = id;
        const to = clients.get(m.dst);
        if (to) sendTo(to, m);
        else if (m.type !== 'LEAVE' && m.type !== 'EXPIRE') {
          const q = queue.get(m.dst) || [];
          const item = { msg: m };
          item.timer = setTimeout(() => {
            const l = queue.get(m.dst) || [];
            queue.set(m.dst, l.filter(x => x !== item));
            const back = clients.get(id);
            if (back) sendTo(back, { type: 'EXPIRE', src: m.dst, dst: id });
          }, 5000);
          q.push(item);
          queue.set(m.dst, q);
        }
      }
      if (closed) sock.end();
    });
    const gone = () => { if (clients.get(id) === sock) clients.delete(id); };
    sock.on('close', gone);
    sock.on('error', gone);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return Object.assign(api, {
    url: `ws://127.0.0.1:${port}/peerjs`,
    mqttUrl: `ws://127.0.0.1:${port}/mqtt`,
    ids: () => [...clients.keys()],
    kick(id) { const s = clients.get(id); if (s) s.destroy(); },
    close: () => new Promise(r => { for (const s of clients.values()) s.destroy(); for (const set of subs.values()) for (const s of set) s.destroy(); for (const q of queue.values()) for (const i of q) clearTimeout(i.timer); server.close(() => r()); }),
  });
}
