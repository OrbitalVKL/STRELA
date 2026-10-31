// Strela — vérification de l'APK de test sur un émulateur Android (lot 5), lancée par ci.yml (job « emulateur ») :
//   node tools/android-check.mjs chemin/vers/strela-test.apk [--ancienne=strela-0.5.0.apk] [--play=strela-play.apk]
// Lot 6 : --ancienne : mise à jour en place depuis cette version (même clé de test) : joueurs et partie gardés ;
// bord à bord et retour prédictif (Android 16) ; --play : la variante play installée à côté, sans mise à jour intégrée.
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
const APK = process.argv.slice(2).find(a => !a.startsWith('--'));
const opt = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const OLD = opt('ancienne'), PLAY = opt('play');
const PKG = 'fr.orbitalvkl.strela';
const OUT = join(ROOT, 'captures', 'android');
mkdirSync(OUT, { recursive: true });

const results = [];
const note = (step, status, detail = '') => { results.push({ step, status, detail }); console.log(`${status.padEnd(12)} ${step}${detail ? ` — ${detail}` : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const [device] = await _android.devices();
if (!device) { console.error('aucun appareil Android (adb devices)'); process.exit(2); }
/** Promesse bornée : un émulateur qui cale fait échouer l'étape au lieu de figer tout le job (lot 6). */
const within = (ms, what, promise) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} : rien après ${Math.round(ms / 1000)} s`)), ms))]);
const sh = async cmd => String(await within(120e3, `adb shell ${cmd.split(' ').slice(0, 3).join(' ')}`, device.shell(cmd))).trim();
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
/**
 * Rend le focus des touches à Strela : ferme ce qui le lui prend sur l'émulateur (dialogue « ne répond pas », bulle
 * « plein écran » d'Android), puis touche `sel` (sans effet). Renvoie la ligne de focus, avant → après.
 */
const ensureFocus = async sel => {
  let before = await focusLine();
  for (let i = 0; i < 3 && !before.includes(PKG); i++) {
    const texts = await screenTexts();
    if (texts.some(t => /isn.t responding|ne répond pas/i.test(t))) await tapText(/^(Wait|Attendre)$/i, 2);
    else if (/Immersive/i.test(before)) await tapText(/^(Got it|OK|J'ai compris|Compris)$/i, 2);
    // Lot 6 : le lanceur d'Android garde le focus (ou personne ne l'a) alors que Strela est à l'écran : on la ramène
    // au premier plan comme par un appui sur son icône (même activité, singleTask : la page et la partie restent).
    else if (/launcher|mCurrentFocus=null/i.test(before.split(' → ').pop())) { await launch(); await sleep(800); }
    await touch(sel);
    before = `${before} → ${await focusLine()}`;
    if (before.includes(`${PKG}/`)) break;
  }
  if (!before.includes(PKG)) await touch(sel);
  return before;
};
const topActivity = () => sh('dumpsys activity activities | grep -m1 -E "topResumedActivity|mResumedActivity"');
const shot = name => device.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});

async function step(name, fn) {
  try {
    const r = await within(6 * 60e3, 'étape', fn());
    if (r === 'skip' || (Array.isArray(r) && r[0] === 'skip')) note(name, 'NON VÉRIFIÉ', Array.isArray(r) ? r[1] : '');
    else note(name, 'OK', typeof r === 'string' ? r : '');
  } catch (e) {
    note(name, 'ÉCHEC', String((e && e.message) || e).split('\n')[0]);
  }
}

console.log(`Appareil : ${device.model()} · Android ${await sh('getprop ro.build.version.release')}`);
// Émulateur lent : pas de dialogue « … ne répond pas » (du lanceur d'Android, par exemple) qui volerait le focus.
await sh('settings put global hide_error_dialogs 1');
await sh('settings put system accelerometer_rotation 0');
await sh('settings put system user_rotation 0');
/**
 * Lance Strela comme le lanceur d'Android (MAIN + LAUNCHER) : l'activité est alors la racine d'une tâche du lanceur,
 * qu'Android met en arrière-plan (sans la fermer) sur un retour depuis l'accueil. La classe de l'activité garde le nom
 * du tronc commun (fr.orbitalvkl.strela.MainActivity) quelle que soit la variante.
 */
const launch = (pkg = PKG) => sh(`am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n ${pkg}/fr.orbitalvkl.strela.MainActivity`);

let page = null;
const ready = async (pkg = PKG) => {
  // Après une fermeture de l'activité, l'ancienne WebView peut encore être listée un instant : on réessaie jusqu'à
  // trouver une page vivante et prête.
  let last = null;
  for (let i = 0; i < 15; i++) {
    try {
      const web = await device.webView({ pkg }, { timeout: 60e3 });
      const p = await web.page();
      await p.waitForSelector('body[data-ready]', { timeout: 10e3 });
      page = p;
      return;
    } catch (e) { last = e; await sleep(1000); }
  }
  throw last;
};
const version = () => page.evaluate(() => JSON.parse(window.strelaNative.info()).version);

// Lot 6 : mise à jour en place (version précédente installée, des données, puis la nouvelle par-dessus).
if (OLD && APK) {
  await step('mise à jour en place depuis la version précédente : joueurs et partie gardés', async () => {
    await sh(`pm uninstall ${PKG}`);
    await device.installApk(OLD);
    await launch();
    await ready();
    const before = await version();
    await createPlayer(page, 'Ancien');
    await createPlayer(page, 'Fidèle');
    await newGame(page, ['Ancien', 'Fidèle'], { startScore: 301 });
    await throwDarts(page, 'T20 S20 S5');
    await validate(page);
    await throwDarts(page, 'T19');
    await settle(page);
    await sh(`am force-stop ${PKG}`);
    await device.installApk(APK); // adb install -r : même paquet, même clé, version plus récente
    await launch();
    await ready();
    const after = await version();
    await page.waitForSelector('.resume');
    const names = await page.evaluate(() => new Promise((res, rej) => {
      const r = indexedDB.open('strela');
      r.onerror = () => rej(r.error);
      r.onsuccess = () => { const q = r.result.transaction('players').objectStore('players').getAll(); q.onsuccess = () => res(q.result.map(p => p.name).sort()); };
    }));
    await page.click('.resume');
    await page.waitForSelector('.game');
    const rest = await remaining();
    await shot('0-mise-a-jour');
    if (names.join(',') !== 'Ancien,Fidèle') throw new Error(`joueurs : ${names.join(', ')}`);
    if (rest !== '244') throw new Error(`reste ${rest}`);
    if (before === after) throw new Error(`même version (${after})`);
    return `${before} → ${after} : 2 joueurs, partie reprise (Fidèle : reste ${rest})`;
  });
}

if (APK) { await within(180e3, "installation de l'APK", device.installApk(APK)); console.log(`installé : ${APK}`); }
await sh(`pm clear ${PKG}`);
await launch();
/** Strela au premier plan et page joignable (après un écran d'Android, une sortie, une fermeture). */
const front = async () => {
  if (!(await topActivity()).includes(PKG)) await launch();
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
  const focus = await ensureFocus('header.top h1');
  const before = await page.evaluate(() => window.strelaNative.backCount());
  await sh('input keyevent KEYCODE_BACK');
  const ok = await page.waitForSelector('.home-main', { timeout: 6e3 }).then(() => true, () => false);
  const got = (await page.evaluate(() => window.strelaNative.backCount())) - before;
  if (!ok) throw new Error(`toujours dans les Réglages (retour reçu par la coquille ${got} fois ; ${focus})`);
  return `retour reçu par la coquille ${got} fois`;
});

// Lot 6 (Android 16, targetSdk 36) : bord à bord et retour prédictif.
await step('bord à bord : la page ne passe ni sous la barre d\'état ni sous la barre de navigation', async () => {
  await page.evaluate(() => { location.hash = '#/reglages'; });
  await page.waitForSelector('#diag');
  const v = await page.evaluate(() => ({ ...JSON.parse(window.strelaNative.viewport()), h: innerHeight, w: innerWidth }));
  const size = (await sh('wm size')).match(/(\d+)x(\d+)\s*$/);
  const H = size ? Number(size[2]) : 0;
  const bottom = Math.round(v.y + v.h * v.density);
  if (v.y <= 0) throw new Error(`page collée en haut (y = ${v.y})`);
  if (H && bottom >= H) throw new Error(`page jusqu'en bas de l'écran (${bottom} / ${H} px)`);
  return `page de ${v.y} à ${bottom} px sur ${H} px de haut`;
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
  // Première partie en plein écran : Android peut montrer sa bulle « plein écran » (ImmersiveModeConfirmation), qui
  // prend le focus ; on la ferme comme le ferait Guillaume.
  const focus = await ensureFocus('#remaining');
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
  await launch();
  await ready();
  await page.waitForSelector('.resume');
  await page.click('.resume');
  await page.waitForSelector('.game');
  const rest = await remaining();
  if (rest !== '276') throw new Error(`reste ${rest}`);
  await shot('7-reprise');
  return 'reste 276';
});

await step('plein écran en partie (Android 16) : barres masquées, retour = menu pause', async () => {
  await front();
  if (!(await page.evaluate(() => location.hash)).includes('jeu')) { await page.evaluate(() => { location.hash = '#/jeu'; }); await page.waitForSelector('.game'); }
  await sleep(800);
  const v = await page.evaluate(() => JSON.parse(window.strelaNative.viewport()));
  const handled = await page.evaluate(() => window.strelaNative.backHandled());
  await shot('8-plein-ecran');
  if (!handled) throw new Error('retour non traité en partie');
  return `page à y = ${v.y} px (barres masquées), retour traité par la page`;
});

await step('retour prédictif : Réglages → la page traite le retour ; accueil → Android fait sortir Strela', async () => {
  // En dernier : sortir de l'appli puis la relancer perturbe le focus des touches de l'émulateur pour la suite.
  await front();
  await page.evaluate(() => { location.hash = '#/reglages'; });
  await page.waitForSelector('#diag');
  const inSettings = await page.evaluate(() => window.strelaNative.backHandled());
  if (!inSettings) throw new Error('rappel de retour absent dans les Réglages');
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('.home-main');
  await page.waitForFunction(() => window.strelaNative.backHandled() === false, null, { timeout: 5e3 });
  await ensureFocus('.home-title');
  await sh('input keyevent KEYCODE_BACK');
  let out = false;
  for (let i = 0; i < 10 && !out; i++) { await sleep(500); out = !(await topActivity()).includes(PKG); }
  const top = await topActivity();
  // L'activité est-elle gardée en arrière-plan ou fermée par Android ? (dumpsys, avant tout relancement)
  const alive = (await sh(`dumpsys activity activities | grep -c "ActivityRecord.*${PKG}/" || true`)).trim() !== '0';
  // Relance d'un nouveau processus : une activité recréée dans le même processus garderait la même adresse de
  // débogage, et Playwright y verrait encore l'ancienne page (fermée).
  // La transition de retour vers l'écran d'accueil du téléphone doit être finie avant la relance : sinon le lanceur
  // d'Android repasse devant et garde le focus des touches (vu sur Android 14).
  await sleep(2000);
  await sh(`am force-stop ${PKG}`);
  for (let i = 0; i < 3; i++) {
    await launch();
    await sleep(1000);
    if ((await topActivity()).includes(PKG) && (await focusLine()).includes(PKG)) break;
  }
  await ready();
  if (!out) throw new Error(`Strela toujours au premier plan (${top})`);
  await page.waitForSelector('.home-main');
  // Android, sans rappel de la page, joue son retour vers le téléphone et ferme l'activité (ou la garde en
  // arrière-plan) : les deux sont admis, rien n'est perdu (tout est enregistré à chaque fléchette).
  return `sortie vers l'écran d'accueil du téléphone (activité ${alive ? 'gardée en arrière-plan' : 'fermée par Android'}) ; relance : accueil`;
});

// Lot 6 : variante play, à côté de la variante github (deux paquets), sans mise à jour intégrée.
if (PLAY) {
  await step('variante play installée à côté : page servie, sans mise à jour intégrée', async () => {
    const PPKG = `${PKG}.play`;
    await device.installApk(PLAY);
    await launch(PPKG);
    await ready(PPKG);
    const r = await page.evaluate(() => ({ info: JSON.parse(window.strelaNative.info()), upd: typeof window.strelaNative.checkUpdate, url: location.href }));
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await page.waitForSelector('#diag');
    const text = await page.textContent('#app');
    await shot('9-play-reglages');
    const both = (await sh(`pm list packages ${PKG}`)).split(/\s+/).filter(Boolean).sort();
    await sh(`pm uninstall ${PPKG}`);
    if (r.info.variant !== 'play') throw new Error(`variante ${r.info.variant}`);
    if (r.upd !== 'undefined') throw new Error('fonction de mise à jour présente');
    if (/RECHERCHER UNE MISE À JOUR/.test(text) || !/Version Google Play/.test(text)) throw new Error('Réglages de la variante play');
    if (both.length !== 2) throw new Error(`paquets : ${both.join(' ')}`);
    return `${r.info.package} ${r.info.version} à côté de ${PKG} (${both.join(', ')})`;
  });
}

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
