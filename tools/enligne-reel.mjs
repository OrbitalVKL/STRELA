// Essai de la partie en ligne sur les VRAIS serveurs de signalisation (pas dans `node --test` : il faut Internet).
// Deux navigateurs séparés (Chromium de Playwright) chargent src/net/link.js depuis un serveur local ; l'un ouvre un
// salon (hostLink), l'autre le rejoint (guestLink), puis un message fait l'aller-retour par le canal WebRTC.
//   node tools/enligne-reel.mjs [peerjs|emqx|hivemq|tous]   (défaut : peerjs)
// Dans les sessions de Claude Code, le WebSocket sortant passe par le proxy (HTTPS_PROXY) : Chromium le prend ici ;
// seul le port 443 sort (EMQX 8084 et HiveMQ 8884 n'y répondent pas). Lot 9.5 / 0.20.1 : c'est ainsi qu'a été trouvé le
// refus des messages par le serveur PeerJS public (docs/enligne.md « 0.20.1 »).
import { serve, loadPlaywright } from './lib/serve.mjs';
import { SERVICES } from '../src/net/signal.js';

const which = (process.argv[2] || 'peerjs').toLowerCase();
const services = which === 'tous' ? SERVICES : SERVICES.filter(s => s.name.toLowerCase() === which);
if (!services.length) { console.error(`service inconnu : ${which}`); process.exit(2); }
const pw = await loadPlaywright();
if (!pw) { console.error('Playwright absent'); process.exit(2); }
const srv = await serve();
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await pw.chromium.launch(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {});
const page = async tag => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: !!proxy });
  const p = await ctx.newPage();
  p.on('console', m => console.log(`${tag} ${m.text()}`));
  await p.goto(`${srv.url}confidentialite.html`);
  return p;
};
let ok = false;
try {
  const H = await page('hôte  '), G = await page('invité');
  const code = `T${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await H.evaluate(async ([code, services]) => {
    sessionStorage.setItem('strela.signal', services.map(s => `${s.kind}:${s.url}`).join(','));
    const L = await import('/src/net/link.js');
    window.link = await L.hostLink(code, { message: (peer, m) => { console.log(`reçu ${JSON.stringify(m)}`); console.log(`réponse envoyée : ${window.link.send(peer, { t: 'retour', got: m.t })}`); }, open: () => console.log('canal ouvert') });
    console.log(`salon ${code} : ${window.link.services().map(s => `${s.name} ${s.state}`).join(', ')}`);
  }, [code, services]);
  await new Promise(r => setTimeout(r, 3000)); // laisse aux services de l'hôte le temps de s'ouvrir
  const res = await G.evaluate(async ([code, services]) => {
    const L = await import('/src/net/link.js');
    const J = await import('/src/ui/journal.js');
    const t0 = Date.now();
    try {
      let r; const got = new Promise(x => { r = x; });
      const l = await L.guestLink(code, { message: m => r(m) }, { services, onStep: s => console.log(`étape ${s.step} (${s.service})`) });
      l.send({ t: 'essai' });
      const m = await Promise.race([got, new Promise(x => setTimeout(() => x(null), 5000))]);
      return { ok: !!(m && m.t === 'retour'), text: `canal ouvert en ${Date.now() - t0} ms ; réponse ${JSON.stringify(m)}` };
    } catch (e) { return { ok: false, text: `ÉCHEC ${e.code} à l'étape ${e.step}\n${J.journalText('', J.journalLines())}` }; }
  }, [code, services]);
  ok = res.ok;
  console.log(res.text);
} finally { await browser.close(); await srv.close(); }
process.exit(ok ? 0 : 1);
