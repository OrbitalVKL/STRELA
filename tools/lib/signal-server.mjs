// Serveur de signalisation local pour les tests de la partie en ligne (lot 9.2) : le protocole du serveur public de
// PeerJS (0.peerjs.com), réduit à ce dont Strela se sert (src/net/signal.js), sur un WebSocket écrit à la main (le
// projet n'a aucune dépendance). OPEN à la connexion, ID-TAKEN si l'identifiant est pris, relais des messages à `dst`
// (avec `src`), mise en attente 5 s puis EXPIRE si le destinataire n'est pas là, HEARTBEAT ignoré.
//   const s = await signalServer(); s.url → 'ws://127.0.0.1:PORT/peerjs' ; s.close() ; s.kick(id) coupe un client.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(text) {
  const data = Buffer.from(text);
  const len = data.length;
  const head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : (() => {
    const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b;
  })();
  return Buffer.concat([head, data]);
}

/** Lit les trames complètes du tampon ; renvoie [messages texte, reste, fermé ?]. */
function parse(buf) {
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
  }
  return [out, buf, closed];
}

export async function signalServer() {
  const clients = new Map(); // id → socket
  const queue = new Map();   // id → [{ msg, timer }]
  const server = createServer((req, res) => { res.writeHead(404); res.end(); });
  const sendTo = (sock, obj) => { try { sock.write(frame(JSON.stringify(obj))); } catch (e) { /* */ } };
  server.on('upgrade', (req, sock) => {
    const u = new URL(req.url, 'http://x');
    const id = u.searchParams.get('id');
    const key = req.headers['sec-websocket-key'];
    if (!key || !u.pathname.startsWith('/peerjs')) { sock.destroy(); return; }
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
        if (m.type === 'HEARTBEAT' || !m.dst) continue;
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
  return {
    url: `ws://127.0.0.1:${port}/peerjs`,
    ids: () => [...clients.keys()],
    kick(id) { const s = clients.get(id); if (s) s.destroy(); },
    close: () => new Promise(r => { for (const s of clients.values()) s.destroy(); for (const q of queue.values()) for (const i of q) clearTimeout(i.timer); server.close(() => r()); }),
  };
}
