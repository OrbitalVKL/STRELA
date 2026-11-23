// Lot 9.3 : saisie à la voix dans l'appli (sommaire de maquette), avec un moteur de reconnaissance simulé :
// webkitSpeechRecognition (navigateur) ou passerelle strelaNative (APK : listenInfo, listenStart…, événement
// strela-native { listen }). Bouton micro, phrase entendue, fléchettes posées comme au pavé, VALIDER au doigt ou
// « valider », annuler, refus, réglage, X01, Cricket, entraînement. Playwright (sauté s'il est absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright } from '../tools/lib/serve.mjs';
import { show } from '../tools/lib/layout.mjs';
import { ack } from '../tools/lib/app.mjs';

const pw = await loadPlaywright();
const skip = !pw && 'Playwright absent';

/** Moteur du navigateur simulé : window.__hear(['phrase', …]) termine l'écoute en cours avec ces propositions. */
function fakeWeb() {
  window.__recs = 0;
  class Rec {
    start() { window.__rec = this; window.__recs++; }
    stop() { setTimeout(() => this.onend && this.onend(), 0); }
    abort() { window.__rec = null; }
  }
  window.webkitSpeechRecognition = Rec;
  window.SpeechRecognition = Rec;
  window.__hear = texts => {
    const r = window.__rec;
    if (!r) return false;
    const res = texts.map(t => ({ transcript: t }));
    res.isFinal = true;
    r.onresult({ results: [res] });
    window.__rec = null;
    r.onend && r.onend();
    return true;
  };
}

/** Passerelle de l'APK simulée (ce qui sert ici), micro d'abord à demander. */
function fakeApk() {
  window.__calls = [];
  let perm = 'ask';
  const rec = (name, ret) => (...a) => { window.__calls.push([name, ...a]); return typeof ret === 'function' ? ret(...a) : ret; };
  const push = listen => window.dispatchEvent(new CustomEvent('strela-native', { detail: { listen } }));
  window.strelaNative = {
    info: rec('info', JSON.stringify({ version: '0.18.0', variant: 'github', package: 'fr.orbitalvkl.strela', sdk: 36, model: 'Pixel' })),
    vibrate: rec('vibrate', 'sent'), speak: rec('speak', true), speakAs: rec('speakAs', true), stopSpeaking: rec('stopSpeaking'),
    voice: rec('voice', JSON.stringify({ state: 'ok', name: 'Google', native: true })),
    keepScreenOn: rec('keepScreenOn'), immersive: rec('immersive'), setDark: rec('setDark'), gestureInset: rec('gestureInset', 0),
    setBackHandled: rec('setBackHandled'), backHandled: rec('backHandled', true),
    listenInfo: rec('listenInfo', () => JSON.stringify({ available: true, onDevice: true, permission: perm, listening: false })),
    listenStart: rec('listenStart', () => {
      if (perm !== 'granted') { setTimeout(() => { perm = 'granted'; push({ type: 'permission', granted: true }); push({ type: 'start', onDevice: true }); }, 10); return 'permission'; }
      setTimeout(() => push({ type: 'start', onDevice: true }), 0);
      return 'started';
    }),
    listenStop: rec('listenStop'), listenCancel: rec('listenCancel'),
  };
  window.__hear = texts => { push({ type: 'partial', texts: [texts[0].split(' ')[0]] }); push({ type: 'result', texts }); return true; };
}

async function open(browser, url, init, viewport = { width: 410, height: 914 }) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  await page.goto(`${url}?maquette#/sommaire`);
  await page.waitForFunction(() => window.__strela);
  return { ctx, page };
}
const darts = page => page.evaluate(() => window.__strela.darts().map(d => `${d.multiplier}x${d.segment}`).join(' '));
const line = page => page.evaluate(() => document.querySelector('.vline')?.textContent.replace(/\s+/g, ' ').trim() || '');
const said = page => page.evaluate(() => (window.__calls || []).filter(c => c[0] === 'speak').map(c => c[1]));
async function speak(page, texts) {
  await page.click('[data-act="voice-mic"]');
  await page.waitForFunction(() => document.querySelector('.vline.on'));
  assert.match(await line(page), /J'ÉCOUTE/);
  await page.evaluate(t => window.__hear(t), texts);
  await page.waitForFunction(() => !document.querySelector('.vline.on'));
}

test('navigateur : X01, fléchettes à la voix puis VALIDER au doigt ou « valider »', { skip, timeout: 90e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const { page } = await open(browser, srv.url, fakeWeb);
    await show(page, { scene: 'jeu' });
    assert.ok(await page.$('.pad-k [data-act="voice-mic"]'), 'touche micro au pavé');
    await speak(page, ['triple vingt double seize', 'triple vin double seize']);
    assert.equal(await darts(page), '3x20 2x16');
    assert.match(await line(page), /T20 · D16/);
    assert.match(await line(page), /« triple vingt double seize »/);
    // Corrigeable au doigt : ANNULER au pavé retire la dernière.
    await page.click('[data-key="undo"]');
    assert.equal(await darts(page), '3x20');
    // Volée finie dans la phrase : la fléchette en trop est ignorée, « valider » valide (en portrait, VALIDER couvre
    // le pavé et la touche micro pendant l'attente : on valide alors au doigt, ou dans la même phrase).
    await speak(page, ['seize vingt intérieur vingt valider']);
    assert.equal(await darts(page), '3x20 1x16 1x20', 'la couronne ne compte pas en partie ; la 4e est en trop');
    assert.match(await line(page), /1 fléchette en trop/);
    assert.match(await line(page), /VALIDÉ/);
    assert.ok(!(await page.$('.validate.go')), '« valider » valide la volée');
    // Sans « valider » : la volée attend l'appui.
    await speak(page, ['un un un']);
    assert.ok(await page.$('.validate.go'), 'rien n\'est validé sans « valider » ou appui');
    await page.click('.validate.go');
    // Refus : rien n'est posé.
    await speak(page, ['triple de seize']);
    assert.equal(await darts(page), '3x20 1x16 1x20 1x1 1x1 1x1');
    assert.match(await line(page), /Mot non compris : « de »/);
    // Annuler à la voix.
    await speak(page, ['bull dehors annuler']);
    assert.equal(await darts(page), '3x20 1x16 1x20 1x1 1x1 1x1 2x25');
    // Deuxième appui pendant l'écoute : arrêt.
    await page.click('[data-act="voice-mic"]');
    await page.waitForFunction(() => document.querySelector('.vline.on'));
    await page.click('[data-act="voice-mic"]');
    await page.waitForFunction(() => !document.querySelector('.vline.on'));
    // Réglage NON : plus de bouton.
    await page.evaluate(() => { history.replaceState(null, '', '#/reglages'); window.__strela.render(); });
    await page.click('[data-act="voice-input"][data-arg="0"]');
    await page.evaluate(() => window.__strela.scene('jeu'));
    assert.equal(await page.$('[data-act="voice-mic"]'), null, 'saisie vocale coupée : pas de micro');
  } finally { await browser.close(); await srv.close(); }
});

test('navigateur sans reconnaissance vocale : pas de bouton micro', { skip, timeout: 60e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const { page } = await open(browser, srv.url, () => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
    await show(page, { scene: 'jeu' });
    assert.equal(await page.$('[data-act="voice-mic"]'), null);
  } finally { await browser.close(); await srv.close(); }
});

test('Cricket et entraînement à la voix', { skip, timeout: 90e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const { page } = await open(browser, srv.url, fakeWeb);
    await show(page, { scene: 'ck-face' });
    const ck = () => page.evaluate(() => document.querySelectorAll('.ckvisit .ckd.done').length);
    await speak(page, ['triple vingt, triple cinq']);
    assert.equal(await ck(), 2, 'deux fléchettes (le 5 ne compte pas au Cricket, comme au pavé)');
    await speak(page, ['bull']);
    assert.ok(await page.$('[data-act="ck-validate"]'), 'VALIDER à toucher');
    await speak(page, ['valider']);
    assert.equal(await page.$('[data-act="ck-validate"]'), null);
    // Entraînement (exercice) : couronne gardée.
    await show(page, { scene: 'tr-jeu-debut' });
    assert.ok(await page.$('.tband [data-act="voice-mic"]'));
    await speak(page, ['vingt intérieur, triple vingt, dehors']);
    assert.match(await line(page), /20 INT\. · T20 · HORS CIBLE/);
  } finally { await browser.close(); await srv.close(); }
});

test('APK (passerelle simulée) : explication, micro demandé, phrase d\'Android, confirmation dite', { skip, timeout: 90e3 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    const { page } = await open(browser, srv.url, fakeApk);
    await show(page, { scene: 'jeu' });
    await page.click('[data-act="voice-mic"]');
    await page.waitForSelector('[data-act="voice-explain-yes"]');
    assert.match(await page.textContent('.vexplain'), /n'enregistre rien/);
    await page.click('[data-act="voice-explain-yes"]');
    await page.waitForFunction(() => document.querySelector('.vline.on'));
    const calls = await page.evaluate(() => window.__calls.map(c => c[0]));
    assert.ok(calls.includes('stopSpeaking') && calls.includes('listenStart'), 'la voix se tait avant l\'écoute');
    await page.evaluate(() => window.__hear(['triple vingt', 'triple vin']));
    await page.waitForFunction(() => !document.querySelector('.vline.on'));
    assert.equal(await darts(page), '3x20');
    await page.waitForFunction(() => window.__calls.some(c => c[0] === 'speak' && c[1] === 'triple 20'));
    // Deuxième fois : plus d'explication.
    await page.click('[data-act="voice-mic"]');
    await page.waitForFunction(() => document.querySelector('.vline.on'));
    assert.equal(await page.$('[data-act="voice-explain-yes"]'), null);
    await page.evaluate(() => window.__hear(['triple vingt triple vingt']));
    await page.waitForFunction(() => !document.querySelector('.vline.on'));
    assert.equal(await darts(page), '3x20 3x20 3x20');
    // La volée est finie : le total est annoncé, pas la confirmation (elle le couperait).
    await page.waitForTimeout(100);
    const s = await said(page);
    assert.equal(s[s.length - 1], 'Cent quatre-vingts !');
    // Quitter l'écran pendant l'écoute : abandon.
    await ack(page); // la célébration du 180 attend un appui
    await page.click('.validate.go');
    await page.click('[data-act="voice-mic"]');
    await page.waitForFunction(() => document.querySelector('.vline.on'));
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForFunction(() => window.__calls.some(c => c[0] === 'listenCancel'));
  } finally { await browser.close(); await srv.close(); }
});
