// Appli Android (lot 6) : deux variantes de compilation. « github » (fr.orbitalvkl.strela, APK, mise à jour intégrée,
// INTERNET et REQUEST_INSTALL_PACKAGES) et « play » (fr.orbitalvkl.strela.play, .aab, sans mise à jour intégrée ni
// accès réseau) ; Android 16 (compileSdk et targetSdk 36). Vérifié dans les sources, et dans le manifeste fusionné de
// la variante play quand la coquille a été compilée (CI : STRELA_ANDROID_BUILT=1 l'exige).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const APP = 'android/app';
const NET = ['android.permission.INTERNET', 'android.permission.REQUEST_INSTALL_PACKAGES'];
const perms = xml => [...xml.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map(m => m[1]);
const javaIn = dir => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir), { recursive: true }).filter(f => f.endsWith('.java')).map(f => join(dir, f)) : []);

test('variantes github et play : identifiants, Android 16 (compileSdk et targetSdk 36)', () => {
  const g = read(`${APP}/build.gradle`);
  assert.match(g, /compileSdk 36\b/);
  assert.match(g, /targetSdk 36\b/);
  assert.match(g, /minSdk 30\b/);
  assert.match(g, /applicationId 'fr\.orbitalvkl\.strela'\n/, 'github : identifiant inchangé (mise à jour en place)');
  assert.match(g, /play \{[^}]*applicationId 'fr\.orbitalvkl\.strela\.play'/);
  assert.match(g, /github \{/);
});

test('manifestes : réseau et installation de paquets dans la variante github seulement', () => {
  const main = perms(read(`${APP}/src/main/AndroidManifest.xml`));
  for (const p of NET) assert.ok(!main.includes(p), `${p} hors du manifeste commun`);
  assert.ok(main.includes('android.permission.VIBRATE'));
  const github = perms(read(`${APP}/src/github/AndroidManifest.xml`));
  for (const p of NET) assert.ok(github.includes(p), `${p} dans la variante github`);
  assert.ok(!existsSync(join(ROOT, `${APP}/src/play/AndroidManifest.xml`)) || NET.every(p => !perms(read(`${APP}/src/play/AndroidManifest.xml`)).includes(p)));
  // Les deux variantes sur un même téléphone : pas d'autorité de FileProvider en dur
  assert.match(read(`${APP}/src/main/AndroidManifest.xml`), /android:authorities="\$\{applicationId\}\.files"/);
  assert.match(read(`${APP}/src/main/java/fr/orbitalvkl/strela/MainActivity.java`), /AUTHORITY = BuildConfig\.APPLICATION_ID \+ "\.files"/);
});

test('mise à jour intégrée : code dans la variante github seulement', () => {
  const others = [...javaIn(`${APP}/src/main/java`), ...javaIn(`${APP}/src/play/java`)];
  assert.ok(others.length >= 4, 'MainActivity, Bridge, Speech, Flavor (play)');
  for (const f of others) {
    const src = read(f);
    assert.doesNotMatch(src, /api\.github\.com|PackageInstaller|new Updater|checkUpdate|HttpURLConnection/, `${f} sans mise à jour`);
  }
  assert.ok(existsSync(join(ROOT, `${APP}/src/github/java/fr/orbitalvkl/strela/Updater.java`)));
  assert.match(read(`${APP}/src/github/java/fr/orbitalvkl/strela/UpdateBridge.java`), /autoCheckUpdate/);
  assert.match(read(`${APP}/src/github/java/fr/orbitalvkl/strela/Updater.java`), /24L \* 3600 \* 1000/, 'au plus une recherche automatique par 24 h');
});

/** Manifestes fusionnés de la variante play (debug, release), s'ils ont été produits par une compilation. */
function mergedPlay() {
  const base = join(ROOT, `${APP}/build/intermediates/merged_manifests`);
  if (!existsSync(base)) return [];
  return readdirSync(base).filter(d => /^play/.test(d)).flatMap(d => readdirSync(join(base, d), { recursive: true })
    .filter(f => f.endsWith('AndroidManifest.xml')).map(f => join(base, d, f))).filter(f => statSync(f).isFile());
}

test('manifeste fusionné de la variante play : ni INTERNET ni REQUEST_INSTALL_PACKAGES', {
  skip: !mergedPlay().length && !process.env.STRELA_ANDROID_BUILT && 'coquille non compilée (gradle assemblePlayDebug)',
}, () => {
  const files = mergedPlay();
  assert.ok(files.length, 'manifeste fusionné de la variante play introuvable');
  for (const f of files) {
    const xml = readFileSync(f, 'utf8');
    const p = perms(xml);
    for (const n of NET) assert.ok(!p.includes(n), `${n} absente (${f.slice(ROOT.length)})`);
    assert.match(xml, /package="fr\.orbitalvkl\.strela\.play"/);
    assert.match(xml, /android:targetSdkVersion="36"/);
    assert.match(xml, /android:authorities="fr\.orbitalvkl\.strela\.play\.files"/);
  }
});
