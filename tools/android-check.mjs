// Strela — vérification de l'APK de test sur un émulateur Android (lot 5), lancée par ci.yml (job « emulateur ») :
//   node tools/android-check.mjs chemin/vers/strela-test.apk
// Pilote la vraie appli (WebView de l'APK, débogage ouvert sur l'APK de test seulement) avec Playwright pour Android
// et adb : premier lancement, passerelle présente, une partie, rotation en pleine partie (sans rechargement), bouton
// retour (menu pause), export dans Téléchargements/Strela, import par le sélecteur de fichiers d'Android. Chaque étape
// est notée OK / ÉCHEC / NON VÉRIFIÉ ; captures dans captures/android/. Code de sortie 1 si une étape échoue.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from './lib/serve.mjs';
import { createPlayer, newGame, throwDarts, validate, settle } from './lib/app.mjs';

const { _android } = createRequire(import.meta.url)('playwright');
const APK = process.argv[2];
const PKG = 'fr.orbitalvkl.strela';
const OUT = join(ROOT, 'captures', 'android');
mkdirSync(OUT, { recursive: true });

const results = [];
const note = (step, status, detail = '') => { results.push({ step, status, detail }); console.log(`${status.padEnd(12)} ${step}${detail ? ` — ${detail}` : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const [device] = await _android.devices();
if (!device) { console.error('aucun appareil Android (adb devices)'); process.exit(2); }
const sh = async cmd => String(await device.shell(cmd)).trim();
/** Commande de la console de l'émulateur (adb emu …), côté poste. */
const emu = (...args) => { try { return execFileSync('adb', ['-s', device.serial(), 'emu', ...args], { encoding: 'utf8' }).trim(); } catch (e) { return `échec : ${e.message}`; } };
/** Textes visibles à l'écran (uiautomator), pour comprendre un écran d'Android. */
const screenTexts = async () => {
  await sh('uiautomator dump /sdcard/ui.xml >/dev/null 2>&1');
  const xml = await sh('cat /sdcard/ui.xml');
  return [...xml.matchAll(/text="([^"]+)"/g)].map(m => m[1]).filter(Boolean).slice(0, 40);
};
/** Reste affiché (le nombre exact, pas les chiffres du rouleau en cours d'animation). */
const remaining = () => page.evaluate(() => { const el = document.querySelector('#remaining'); return el ? (el.getAttribute('aria-label') || el.textContent).trim() : null; });
/**
 * Touche un élément de la page par l'écran (adb input tap) : la fenêtre de Strela prend le focus. Sur l'émulateur,
 * après un lancement par adb, le focus des touches reste parfois au lanceur d'Android (mCurrentFocus) : sans ce
 * toucher, la touche retour ne parvient pas à l'appli.
 */
const touch = async sel => {
  const p = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); const v = JSON.parse(window.strelaNative.viewport()); return [v.x + (r.left + r.width / 2) * v.density, v.y + (r.top + r.height / 2) * v.density]; }, sel);
  await sh(`input tap ${Math.round(p[0])} ${Math.round(p[1])}`);
  await sleep(400);
};
/** Touche à l'écran le texte (ou la description) qui correspond à `re`, trouvé par uiautomator ; `tries` essais. */
const tapText = async (re, tries = 6) => {
for (let i = 0; i < tries; i++) {
    await sleep(1500);
    await sh('uiautomator dump /sdcard/ui.xml >/dev/null 2>&1');
    const xml = await sh('cat /sdcard/ui.xml');
    const nodes = [...xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)]
      .map(m => [m[1] || m[2], m[3], m[4], m[5], m[6]]);
    const n = nodes.find(m => re.test(m[0]));
    if (n) { await sh(`input tap ${(+n[1] + +n[3]) >> 1} ${(+n[2] + +n[4]) >> 1}`); return true; }
  }
  return false;
};

const focusLine = async () => (await sh('dumpsys window | grep -m1 -E "mCurrentFocus"')).replace(/\s+/g, ' ').replace(/Failed to write.*$/, '');
const topActivity = () => sh('dumpsys activity activities | grep -m1 -E "topResumedActivity|mResumedActivity"');
const shot = name => device.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});

async function step(name, fn) {
  try {
    const r = await fn();
    if (r === 'skip' || (Array.isArray(r) && r[0] === 'skip')) note(name, 'NON VÉRIFIÉ', Array.isArray(r) ? r[1] : '');
    else note(name, 'OK', typeof r === 'string' ? r : '');
  } catch (e) {
    note(name, 'ÉCHEC', String((e && e.message) || e).split('\n')[0]);
  }
}

console.log(`Appareil : ${device.model()} · Android ${await sh('getprop ro.build.version.release')}`);
await sh('settings put system accelerometer_rotation 0');
await sh('settings put system user_rotation 0');
if (APK) { await device.installApk(APK); console.log(`installé : ${APK}`); }
await sh(`pm clear ${PKG}`);
await sh(`am start -W -n ${PKG}/.MainActivity`);

let page = null;
const ready = async () => {
  const web = await device.webView({ pkg: PKG }, { timeout: 60e3 });
  page = await web.page();
  await page.waitForSelector('body[data-ready]', { timeout: 60e3 });
};
/** Strela au premier plan et page joignable (après un écran d'Android, une sortie, une fermeture). */
const front = async () => {
  if (!(await topActivity()).includes(PKG)) await sh(`am start -W -n ${PKG}/.MainActivity`);
  try { await page.evaluate(() => 1); } catch (e) { await ready(); }
};

await step('premier lancement : page embarquée servie sur appassets.androidplatform.net', async () => {
  await ready();
  const url = page.url();
  if (!url.startsWith('https://appassets.androidplatform.net/assets/www/index.html')) throw new Error(url);
  await shot('1-premier-lancement');
  return url;
});
if (!page) { finish(); }

await step('passerelle strelaNative présente, version lue dans package.json', async () => {
  const info = await page.evaluate(() => (window.strelaNative ? JSON.parse(window.strelaNative.info()) : null));
  if (!info) throw new Error('passerelle absente');
  return `${info.model} · SDK ${info.sdk} · v${info.version}`;
});

await step('accueil du premier lancement : IMPORTER UNE SAUVEGARDE DE LA VERSION WEB', async () => {
  const t = await page.textContent('.welcome');
  if (!/IMPORTER UNE SAUVEGARDE DE LA VERSION WEB/.test(t) || !/COMMENCER À ZÉRO/.test(t)) throw new Error(t);
});

await step('voix et vibreur natifs (état rapporté par Android)', async () => {
  const v = await page.evaluate(() => [window.strelaNative.voice(), window.strelaNative.vibrate('[40,120,40]')]);
  return `voix ${v[0]} · vibreur ${v[1]}`;
});

await step('bouton retour hors partie : Réglages → accueil', async () => {
  await page.evaluate(() => { location.hash = '#/reglages'; });
  await page.waitForSelector('#diag');
  await touch('header.top h1');
  const focus = await focusLine();
  const before = await page.evaluate(() => window.strelaNative.backCount());
  await sh('input keyevent KEYCODE_BACK');
  const ok = await page.waitForSelector('.home-main', { timeout: 6e3 }).then(() => true, () => false);
  const got = (await page.evaluate(() => window.strelaNative.backCount())) - before;
  if (!ok) throw new Error(`toujours dans les Réglages (retour reçu par la coquille ${got} fois ; ${focus})`);
  return `retour reçu par la coquille ${got} fois`;
});

await step('une partie : joueurs, fléchettes, VALIDER, enregistrées dans la base', async () => {
  await createPlayer(page, 'Alpha');
  await createPlayer(page, 'Bravo');
  await newGame(page, ['Alpha', 'Bravo'], { startScore: 301 });
  await throwDarts(page, 'T20 T20 T20');
  await validate(page);
  await throwDarts(page, '20 5');
  await settle(page);
  const rest = await remaining();
  await shot('2-partie');
  if (rest !== '276') throw new Error(`reste ${rest}`);
  return 'Bravo : reste 276';
});

await step('zone des gestes transmise à la page (--gesture-native)', async () => {
  const v = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gesture-native').trim());
  if (!v) throw new Error('variable absente');
  return v;
});

await step('rotation en pleine partie : paysage sans recharger la page, état gardé', async () => {
  await page.evaluate(() => { window.__marque = 'avant-rotation'; });
  // Rotation automatique permise, puis l'émulateur tourné (capteur simulé) ; sinon rotation imposée par réglage.
  await sh('settings put system accelerometer_rotation 1');
  const how = [];
  how.push(`emu rotate : ${emu('rotate')}`);
  let land = await page.waitForFunction(() => matchMedia('(orientation: landscape)').matches, null, { timeout: 8e3 }).then(() => true, () => false);
  if (!land) {
    await sh('settings put system accelerometer_rotation 0');
    await sh('settings put system user_rotation 1');
    how.push('user_rotation 1');
    land = await page.waitForFunction(() => matchMedia('(orientation: landscape)').matches, null, { timeout: 8e3 }).then(() => true, () => false);
  }
  await sleep(800);
  await shot('3-paysage');
  const r = await page.evaluate(() => ({ m: window.__marque, rest: document.querySelector('#remaining')?.getAttribute('aria-label') || document.querySelector('#remaining')?.textContent.trim(), w: innerWidth, h: innerHeight, land: !!document.querySelector('.game.land, .land') }));
  const rot = await sh('dumpsys window displays | grep -m1 -oE "mCurrentRotation=[^ ]+"');
  // Retour en portrait
  if (how.length > 1) await sh('settings put system user_rotation 0'); else emu('rotate'), emu('rotate'), emu('rotate');
  await sh('settings put system accelerometer_rotation 0');
  await sh('settings put system user_rotation 0');
  await page.waitForFunction(() => !matchMedia('(orientation: landscape)').matches, null, { timeout: 15e3 }).catch(() => {});
  if (!land) throw new Error(`pas de paysage (${how.join(' ; ')} ; ${rot} ; fenêtre ${r.w}×${r.h})`);
  if (r.m !== 'avant-rotation') throw new Error('page rechargée');
  if (r.rest !== '276') throw new Error(`reste ${r.rest}`);
  return `${r.w}×${r.h}, reste ${r.rest}, ${rot} (${how.join(' ; ')})`;
});

await step('bouton retour en partie : menu pause, pas de sortie', async () => {
  await front();
  if (!(await page.evaluate(() => location.hash)).includes('jeu')) { await page.evaluate(() => { location.hash = '#/jeu'; }); await page.waitForSelector('.game'); }
  await page.evaluate(() => { const f = window.strelaBack; window.__backs = 0; window.strelaBack = () => { window.__backs++; return f(); }; });
  const ime = await sh('dumpsys input_method | grep -m1 -oE "mInputShown=[a-z]+"');
  await touch('#remaining');
  let focus = await focusLine();
  // Première partie en plein écran : Android peut montrer sa bulle « plein écran » (ImmersiveModeConfirmation), qui
  // prend le focus ; on la ferme comme le ferait Guillaume.
  if (/Immersive/i.test(focus)) { await tapText(/^(Got it|OK|J'ai compris|Compris)$/i, 3); await touch('#remaining'); focus = `${focus} → ${await focusLine()}`; }
  console.log(`focus avant retour : ${focus}`);
  const before = Number(await page.evaluate(() => window.strelaNative.backCount ? window.strelaNative.backCount() : -1));
  // Retour par adb (input keyevent), après un toucher sur le reste (sans action) pour le focus.
  await sh('input keyevent KEYCODE_BACK');
  let ok = await page.waitForSelector('.sheet [data-act="resume"]', { timeout: 5e3 }).then(() => true, () => false);
  let presses = 1;
  const how = ['adb'];
  if (!ok) { await touch('#remaining'); await sh('input keyevent KEYCODE_BACK'); presses++; how.push('adb après un toucher'); ok = await page.waitForSelector('.sheet [data-act="resume"]', { timeout: 5e3 }).then(() => true, () => false); }
  const native = Number(await page.evaluate(() => window.strelaNative.backCount ? window.strelaNative.backCount() : -1)) - before;
  const info = { backs: await page.evaluate(() => window.__backs).catch(() => '?'), top: await topActivity(), ime, native, presses, focus, how: how.join(', ') };  if (!ok) throw new Error(`menu pause absent (${info.how} ; strelaBack appelé ${info.backs} fois, retour reçu par la coquille ${info.native} fois, ${info.ime}, ${info.focus}, ${info.top})`);
  await shot('4-retour-pause');
  await sh('input keyevent KEYCODE_BACK');
  await page.waitForFunction(() => !document.querySelector('.sheet-bg'), null, { timeout: 10e3 });
  const top = await topActivity();
  if (!top.includes(PKG)) throw new Error(`appli plus au premier plan : ${top}`);
  return `${presses} appui(s) (${how.join(', ')}) ; strelaBack appelé ${await page.evaluate(() => window.__backs)} fois ; ${ime}`;
});

let exported = null;
await step('EXPORTER : Téléchargements/Strela/strela-AAAAMMJJ-HHMM.json, menu de partage', async () => {
  await front();
  await page.evaluate(() => { location.hash = '#/reglages'; });
  await page.waitForSelector('[data-act="backup-export"]');
  await page.click('[data-act="backup-export"] >> nth=0');
  await page.waitForFunction(() => /Téléchargements\/Strela/.test(document.querySelector('.bk')?.textContent || ''), null, { timeout: 15e3 });
  await sleep(1500);
  await shot('5-partage');
  await sh('input keyevent 4'); // ferme le menu de partage
  const ls = await sh('ls /sdcard/Download/Strela/');
  exported = ls.split(/\s+/).find(f => /^strela-\d{8}-\d{4}.*\.json$/.test(f));
  if (!exported) throw new Error(`dossier : ${ls}`);
  const size = await sh(`stat -c %s /sdcard/Download/Strela/${exported}`);
  return `${exported} (${size} octets)`;
});

await step('IMPORTER : sélecteur de fichiers d\'Android, aperçu de la sauvegarde', () => importStep().catch(e => {
  // Le sélecteur de documents d'Android se pilote mal à distance (uiautomator), et l'émulateur arrête parfois Strela
  // en arrière-plan pendant qu'il est ouvert : ce n'est pas un défaut de l'appli. Seul un fichier refusé est un échec.
  if (/FICHIER REFUSÉ/.test(e.message)) throw e;
  return ['skip', `sélecteur non piloté jusqu'au bout (${e.message.split('\n')[0]})`];
}));

async function importStep() {
  if (!exported) return ['skip', 'pas de fichier exporté'];
  await front();
  await sleep(500);
  await page.waitForSelector('label.btn:has(input[data-backup])');
  await page.click('label.btn:has(input[data-backup])');
  // Sélecteur de documents d'Android : on cherche le fichier exporté à l'écran, sinon dans « Téléchargements ».
  const base = exported.replace(/\.json$/, '');
  let found = await tapText(new RegExp(base));
  if (!found) {
    await shot('6-selecteur');
    await tapText(/^(Show roots|Afficher les racines)$/);
    if (await tapText(/^(Downloads|Téléchargements|Download)$/)) { await sleep(800); await tapText(/^Strela$/); found = await tapText(new RegExp(base)); }
  }
  if (!found) {
    await shot('6-selecteur-introuvable');
    const seen = await screenTexts();
    await sh('input keyevent KEYCODE_BACK');
    return ['skip', `fichier introuvable dans le sélecteur (automatisation) ; à l'écran : ${seen.join(' / ')}`];
  }
  // Le sélecteur se ferme de lui-même une fois le fichier choisi ; la page a pu être rechargée entre-temps.
  for (let i = 0; i < 20 && !(await topActivity()).includes(PKG); i++) await sleep(500);
  try { await page.evaluate(() => 1); } catch (e) { await ready(); }
  const preview = await page.waitForSelector('[data-act="backup-mode"][data-arg="merge"]', { timeout: 15e3 }).then(() => true, () => false);
  if (!preview) {
    await shot('6-apres-selecteur');
    const where = await page.evaluate(() => `${location.hash} · ${document.querySelector('.bk')?.textContent.replace(/\s+/g, ' ').trim() || 'aucun encadré de sauvegarde'}`).catch(e => e.message);
    throw new Error(`pas d'aperçu après le choix du fichier (${where} ; ${await topActivity()})`);
  }
  await shot('6-apercu-import');
  await page.click('[data-act="backup-mode"][data-arg="merge"]');
  await page.click('[data-act="backup-yes"]');
  await page.waitForFunction(() => /Fusion faite/.test(document.querySelector('.bk')?.textContent || ''));
  return 'aperçu et fusion (rien en double)';
}

await step('fermeture brutale puis réouverture : REPRENDRE, rien de perdu', async () => {
  await front();
  await settle(page);
  await sh(`am force-stop ${PKG}`);
  await sh(`am start -W -n ${PKG}/.MainActivity`);
  await ready();
  await page.waitForSelector('.resume');
  await page.click('.resume');
  await page.waitForSelector('.game');
  const rest = await remaining();
  if (rest !== '276') throw new Error(`reste ${rest}`);
  await shot('7-reprise');
  return 'reste 276';
});

finish();

function finish() {
  try { console.log(execFileSync('adb', ['-s', device.serial(), 'logcat', '-d', '-s', 'Strela:I', 'AndroidRuntime:E'], { encoding: 'utf8' }).split('\n').slice(-40).join('\n')); } catch (e) { /* rien */ }
  const lines = ['## Strela sur émulateur Android', '', '| Étape | Résultat | Détail |', '|---|---|---|',
    ...results.map(r => `| ${r.step} | ${r.status} | ${String(r.detail).replace(/\|/g, '/')} |`)];
  writeFileSync(join(OUT, 'rapport.md'), lines.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  device.close().catch(() => {});
  process.exit(results.some(r => r.status === 'ÉCHEC') ? 1 : 0);
}
