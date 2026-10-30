// Strela — construit le site GitHub Pages dans _site/ :
//   1. lance les tests (node --test, sortie TAP) et en tire le résumé (réussis / total, durée, échecs) ;
//   2. recopie index.html en remplaçant les marques <!--@clé-->…<!--/@--> (version, tests, date, commit) et en datant
//      l'adresse du manifeste (?v=version-commit) ;
//   3. recopie assets/, src/, le manifeste et le service worker (cache nommé par build), écrit _site/tests.json.
// Le site est construit même si des tests échouent : la page affiche alors les échecs en rouge.
// STRELA_SANS_TESTS=1 : sans lancer les tests (compilation de l'APK de test d'une demande de fusion, où ci.yml les lance
// déjà ; la page affiche alors « TESTS NON LANCÉS »). La page de l'APK publié, elle, est construite avec les tests.
// Le blocage d'une fusion sur test rouge est le rôle de .github/workflows/ci.yml.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '_site');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function runTests() {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const tap = r.stdout || '';
  const num = key => {
    const m = new RegExp(`^# ${key} (\\d+)$`, 'm').exec(tap);
    return m ? Number(m[1]) : null;
  };
  // Échecs : lignes « not ok » dont le test n'est pas une suite (les suites échouent avec leurs tests).
  const fails = [];
  const lines = tap.split('\n');
  lines.forEach((line, i) => {
    const m = /^\s*not ok \d+ - (.*)$/.exec(line);
    if (m && !lines.slice(i + 1, i + 6).some(l => /type: 'suite'/.test(l))) fails.push(m[1]);
  });
  return {
    total: num('tests'),
    pass: num('pass'),
    fail: num('fail'),
    durationMs: Date.now() - t0,
    fails,
    exitCode: r.status,
  };
}

export function render(html, values) {
  return html.replace(/<!--@(\w+)-->[\s\S]*?<!--\/@-->/g, (all, key) => (key in values ? values[key] : all));
}

function build() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const tests = process.env.STRELA_SANS_TESTS
    ? { total: null, pass: null, fail: null, durationMs: 0, fails: [], exitCode: 0 }
    : runTests();
  const commit = (process.env.GITHUB_SHA
    || spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout || 'local').trim().slice(0, 7);
  const now = new Date();
  const date = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' }).format(now);

  const ok = tests.total !== null && tests.fail === 0 && tests.exitCode === 0;
  const pass = tests.pass ?? 0;
  const fail = tests.total === null ? 0 : tests.total - pass;
  const values = {
    version: esc(pkg.version),
    pass: tests.pass === null ? '—' : String(pass),
    total: tests.total === null ? '—' : String(tests.total),
    verdict: tests.total === null
      ? '<span class="verdict alert">TESTS NON LANCÉS</span>'
      : ok ? '<span class="verdict inv">RÉUSSIS</span>' : `<span class="verdict alert">${fail} ÉCHEC${fail > 1 ? 'S' : ''}</span>`,
    bar: `<div class="bar" aria-hidden="true"><i style="flex:${pass}"></i>${fail ? `<i class="ko" style="flex:${fail}"></i>` : ''}</div>`,
    date: `${esc(date)} (heure de Paris)`,
    commit: esc(commit),
    duration: `${(tests.durationMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`,
    fails: tests.fails.length
      ? `<ul class="fails red">${tests.fails.slice(0, 12).map(f => `<li>✕ ${esc(f)}</li>`).join('')}</ul>` : '',
  };

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  // Adresse du manifeste propre à chaque build : Chrome relit le manifeste (orientation, icônes) au lieu d'une copie.
  const page = render(readFileSync(join(ROOT, 'index.html'), 'utf8'), values)
    .replace('href="manifest.webmanifest"', `href="manifest.webmanifest?v=${encodeURIComponent(`${pkg.version}-${commit}`)}"`);
  writeFileSync(join(OUT, 'index.html'), page);
  cpSync(join(ROOT, 'assets'), join(OUT, 'assets'), { recursive: true });
  cpSync(join(ROOT, 'src'), join(OUT, 'src'), { recursive: true });
  cpSync(join(ROOT, 'manifest.webmanifest'), join(OUT, 'manifest.webmanifest'));
  // Nom du cache du service worker propre à chaque build (les vieilles copies sont effacées).
  writeFileSync(join(OUT, 'sw.js'), readFileSync(join(ROOT, 'sw.js'), 'utf8').replace('__BUILD__', `${pkg.version}-${commit}`));
  writeFileSync(join(OUT, 'tests.json'), JSON.stringify({
    version: pkg.version, commit, builtAt: now.toISOString(),
    total: tests.total, pass: tests.pass, fail: tests.fail, fails: tests.fails,
  }, null, 2) + '\n');

  console.log(`Site construit dans _site/ — v${pkg.version}, tests ${values.pass}/${values.total}${ok ? '' : tests.total === null ? ' (non lancés)' : ' (ÉCHECS)'}, ${date}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build();
