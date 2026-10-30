// Strela — petit serveur HTTP statique pour les scripts de vérification (tools/*.mjs, tests de chevauchement) :
// sert le dépôt tel quel (les modules ES et les polices ne marchent pas en file://). Port libre choisi par le système.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

/** Démarre le serveur ; renvoie { url, close() }. */
export function serve(root = ROOT) {
  const server = createServer((req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, path);
    try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); statSync(file); } catch (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise(r => server.close(r)),
  })));
}

/** Playwright, s'il est installé (CI : npm install --no-save playwright ; poste : déjà présent). Sinon null. */
export async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* pas en module ES local */ }
  try {
    const { createRequire } = await import('node:module');
    return createRequire(import.meta.url)('playwright');
  } catch (e) { return null; }
}
