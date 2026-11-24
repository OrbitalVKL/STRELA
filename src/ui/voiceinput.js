// Strela — saisie à la voix (lot 9.3), côté écran : bouton micro « appuyer pour parler », écoute, phrase entendue,
// fléchettes posées comme au pavé (corrigeables au doigt), confirmation vocale.
//
// Moteur : dans l'APK, la reconnaissance vocale d'Android (Listen.java, par la passerelle : listenInfo, listenStart,
// listenStop, listenCancel ; ce qu'elle entend arrive par l'événement strela-native { listen }) ; dans un navigateur,
// webkitSpeechRecognition / SpeechRecognition s'il existe (future version web), sinon pas de bouton.
// Analyse de la phrase : src/engine/voice.js (pur, testé). Chaque écran de saisie (X01, Cricket, entraînement)
// s'inscrit avec registerVoice(route, { play, undo, validate, ready }) ; la phrase va à l'écran affiché.
// Rien n'est validé sans « valider » ou un appui : les fléchettes entrent comme au pavé, VALIDER reste à toucher.
// Lot 9.4 (plus tard) : blockVoice('appel', true) coupera la saisie vocale pendant un appel audio en ligne.

import { store, saveSetting } from './store.js';
import { refresh } from './nav.js';
import { isApk, call, callJson, onNative } from './native.js';
import { say, sayLog } from './feedback.js';
import { esc, ico } from './dom.js';
import { interpret, sayText, errorText, dartLabel } from '../engine/voice.js';

export const VOICE_ROUTES = Object.freeze(['#/jeu', '#/cricket', '#/entrainement/jeu']);
const LINE_MS = 7000;

const adapters = new Map();
/** Un écran de saisie s'inscrit : play(dart) → vrai si la fléchette est prise ; undo() ; validate() → vrai si validé ; ready() → saisie possible. */
export const registerVoice = (route, adapter) => adapters.set(route, adapter);

// Lot 9.4 : raisons de couper la saisie vocale (appel audio en ligne…).
const blocks = new Set();
export function blockVoice(reason, on) {
  if (on) blocks.add(reason); else blocks.delete(reason);
  if (on && vs.listening) cancelListening();
}

/** État affiché : écoute en cours, phrase entendue, résultat ou erreur ; `explain` : fenêtre d'explication du micro. */
const vs = { listening: false, partial: '', heard: '', labels: [], msg: '', alert: false, explain: false, timer: 0 };
export const voiceState = () => vs;
/** Sommaire de maquette et tests : état affiché imposé (sans minuterie) ; sans argument, tout est effacé. */
export function presetVoice(st = {}) {
  clearTimeout(vs.timer);
  Object.assign(vs, { listening: false, partial: '', heard: '', labels: [], msg: '', alert: false, explain: false }, st);
}

// ------------------------------------------------------------------ moteur
const WebRec = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
let webRec = null;

/** Reconnaissance vocale disponible sur cet appareil (sans regarder le réglage). */
export function voiceEngine() {
  if (isApk()) { const i = callJson('listenInfo'); return i && i.available ? 'android' : null; }
  return WebRec() ? 'web' : null;
}

/** Le bouton micro doit-il apparaître ? Réglage OUI (par défaut), un moteur, rien qui la coupe. */
export const voiceOn = () => store.settings.voiceInput !== false && !blocks.size && !!voiceEngine();

/** Bouton micro du bandeau de l'écran de saisie ; `cls` : classe du bandeau (pause, act). */
export function micButton(cls = 'pause') {
  if (!voiceOn()) return '';
  return `<button type="button" class="${cls} mic${vs.listening ? ' on' : ''}" data-act="voice-mic" data-press aria-pressed="${vs.listening}" aria-label="${vs.listening ? 'Arrêter l\'écoute' : 'Saisir à la voix'}">${ico('mic')}</button>`;
}

/** Touche micro du pavé (X01 : le bandeau du joueur n'a pas la place d'un bouton de plus). */
export function micKey() {
  if (!voiceOn()) return '';
  return `<button type="button" class="key mic${vs.listening ? ' on' : ''}" data-act="voice-mic" data-press aria-pressed="${vs.listening}" aria-label="${vs.listening ? 'Arrêter l\'écoute' : 'Saisir à la voix'}"><span class="kl">${ico('mic')}<small>${vs.listening ? 'ÉCOUTE' : 'VOIX'}</small></span></button>`;
}

function setLine(msg, { alert = false, heard = vs.heard, labels = [] } = {}) {
  Object.assign(vs, { msg, alert, heard, labels });
  clearTimeout(vs.timer);
  vs.timer = setTimeout(() => { Object.assign(vs, { msg: '', heard: '', labels: [], alert: false }); if (VOICE_ROUTES.includes(location.hash)) refresh(); }, LINE_MS);
}

function startListening() {
  if (vs.listening) return;
  Object.assign(vs, { partial: '', heard: '', labels: [], msg: '', alert: false });
  vs.gen = (vs.gen || 0) + 1; // écoute n° gen : un « start » d'Android arrivé après sa phrase ne la rouvre pas
  if (isApk()) {
    call('stopSpeaking');
    const r = call('listenStart');
    if (r === 'started') vs.listening = true;
    else if (r === 'permission') { /* Android demande le micro ; l'écoute suit si accordé */ }
    else setLine('Reconnaissance vocale indisponible sur ce téléphone.', { alert: true });
    refresh();
    return;
  }
  const R = WebRec();
  if (!R) return;
  try { globalThis.speechSynthesis?.cancel(); } catch (e) { /* */ }
  try {
    webRec = new R();
    webRec.lang = 'fr-FR';
    webRec.interimResults = true;
    webRec.maxAlternatives = 5;
    webRec.continuous = false;
    webRec.onresult = ev => {
      const res = ev.results[ev.results.length - 1];
      const texts = [...res].map(a => a.transcript);
      if (res.isFinal) heard(texts); else { vs.partial = texts[0] || ''; refresh(); }
    };
    webRec.onerror = ev => failed(ev.error === 'not-allowed' ? 'mic' : ev.error === 'no-speech' ? 'silence' : 'other');
    webRec.onend = () => { if (vs.listening) { vs.listening = false; if (!vs.msg) setLine('Rien entendu.', { alert: true }); refresh(); } };
    webRec.start();
    vs.listening = true;
  } catch (e) { setLine('Reconnaissance vocale indisponible.', { alert: true }); }
  refresh();
}

function stopListening() {
  if (isApk()) call('listenStop');
  else try { webRec?.stop(); } catch (e) { /* */ }
}

export function cancelListening() {
  if (!vs.listening) return;
  vs.listening = false;
  if (isApk()) call('listenCancel');
  else try { webRec?.abort(); } catch (e) { /* */ }
}

const ERR = {
  mic: 'Micro refusé : autorise-le pour Strela dans les réglages d\'Android (Applis › Strela › Autorisations).',
  silence: 'Rien entendu : appuie sur le micro, puis annonce tes fléchettes.',
  other: 'Pas compris, réessaie.',
  busy: 'Le micro est occupé, réessaie.',
  network: 'Reconnaissance vocale indisponible hors ligne : installe le français hors ligne (Réglages d\'Android › Système › Langues › Reconnaissance vocale).',
};
function failed(kind) {
  vs.listening = false;
  vs.doneGen = vs.gen;
  setLine(ERR[kind] || ERR.other, { alert: true, heard: '' });
  refresh();
}

// Codes de SpeechRecognizer (Android) → message.
const ANDROID_ERR = { 1: 'network', 2: 'network', 3: 'other', 4: 'network', 5: 'other', 6: 'silence', 7: 'silence', 8: 'busy', 9: 'mic', 11: 'busy', 12: 'network', 13: 'network' };
onNative(d => {
  const l = d.listen;
  if (!l) return;
  if (l.type === 'start') { if (vs.doneGen !== vs.gen) { vs.listening = true; refresh(); } }
  else if (l.type === 'partial') { vs.partial = (l.texts && l.texts[0]) || vs.partial; if (vs.listening) refresh(); }
  else if (l.type === 'result') heard(l.texts || []);
  else if (l.type === 'error') failed(ANDROID_ERR[l.code] || 'other');
  else if (l.type === 'permission') { if (!l.granted) failed('mic'); }
  else if (l.type === 'end') { vs.listening = false; refresh(); }
});

// ------------------------------------------------------------------ phrase entendue → fléchettes
/** Propositions du moteur (la plus sûre d'abord) → fléchettes posées à l'écran affiché. Exporté pour les tests. */
export function heard(texts) {
  vs.listening = false;
  vs.doneGen = vs.gen;
  vs.partial = '';
  const route = location.hash;
  const a = adapters.get(route);
  const r = interpret(texts);
  if (!a) { refresh(); return r; }
  if (!r.ok) {
    setLine(errorText(r), { alert: true, heard: r.heard });
    if (store.settings.voice) say(r.error === 'AMBIGUOUS' ? 'Pas sûr, répète.' : 'Pas compris.');
    refresh();
    return r;
  }
  if (!a.ready()) { setLine('Saisie impossible pour l\'instant (menu ouvert).', { alert: true, heard: r.heard }); refresh(); return r; }
  const done = [];
  let ignored = 0;
  const before = sayLog.length;
  for (const act of r.actions) {
    if (location.hash !== route) { if (act.dart) ignored++; continue; } // fin de manche ou de partie : le reste n'est pas joué
    if (act.cmd === 'undo') { if (a.undo()) done.push(act); continue; }
    if (act.cmd === 'validate') { if (a.validate()) done.push(act); continue; }
    if (a.play(act.dart)) done.push(act); else ignored++;
  }
  const labels = done.map(x => (x.cmd ? (x.cmd === 'undo' ? 'ANNULÉ' : 'VALIDÉ') : dartLabel(x.dart)));
  const extra = ignored ? `${ignored} fléchette${ignored > 1 ? 's' : ''} en trop, ignorée${ignored > 1 ? 's' : ''}.` : '';
  setLine(extra, { alert: !!ignored, heard: r.heard, labels });
  // Confirmation dite, sauf si l'écran a déjà annoncé (total de la volée, bust…) : elle le couperait.
  if (done.length) setTimeout(() => { if (sayLog.length === before) say(sayText(done)); }, 0);
  refresh();
  return r;
}

// ------------------------------------------------------------------ calques : phrase entendue, explication du micro
/** Ligne de la phrase entendue (en haut de l'écran de saisie) et fenêtre d'explication, ajoutées par app.js. */
export function voiceOverlayHtml() {
  if (!VOICE_ROUTES.includes(location.hash)) return '';
  let out = '';
  if (vs.listening || vs.heard || vs.msg) {
    const body = vs.listening
      ? `<b class="vl-t">${ico('mic')} J'ÉCOUTE…</b>${vs.partial ? `<small class="vl-h">« ${esc(vs.partial)} »</small>` : '<small class="vl-h">Annonce tes fléchettes, puis attends.</small>'}`
      : `${vs.labels.length ? `<b class="vl-t">${vs.labels.map(esc).join(' · ')}</b>` : ''}${vs.heard ? `<small class="vl-h">« ${esc(vs.heard)} »</small>` : ''}${vs.msg ? `<small class="vl-m">${esc(vs.msg)}</small>` : ''}`;
    out += `<div class="vline${vs.alert ? ' alert' : ''}${vs.listening ? ' on' : ''}" role="status" aria-live="polite" data-layer>${body}</div>`;
  }
  if (vs.explain) {
    out += `<div class="sheet-bg" role="dialog" aria-label="Saisie à la voix" data-layer><div class="sheet">
      <header class="top" data-layer><h1><span>Saisie à la voix</span></h1><button type="button" class="act" data-act="voice-explain-no" aria-label="Fermer">${ico('close')}</button></header>
      <div class="body vexplain" style="padding-top:16px">
        <p>Appuie sur le micro, puis annonce tes fléchettes : <b>« triple vingt, double seize, vingt-cinq »</b>. Les fléchettes reconnues s'affichent comme au pavé ; tu peux les corriger au doigt, et rien n'est validé sans « valider » ou un appui.</p>
        <p class="small dim">Strela n'écoute que le temps d'une phrase, après un appui (jamais en continu). La phrase est reconnue par le service vocal du téléphone, hors ligne quand le français y est installé ; Strela n'enregistre rien et n'envoie rien.</p>
        <p class="small dim">Android va demander l'accès au micro.</p>
        <button type="button" class="btn primary big" data-act="voice-explain-yes">${ico('mic')} AUTORISER LE MICRO</button>
        <button type="button" class="btn" data-act="voice-explain-no">PLUS TARD</button>
        <p class="note" style="margin:0">Mots compris : simple, double, triple et le nombre ; « intérieur » ou « extérieur » après un simple ; bull, centre ou cinquante (50) ; vingt-cinq ou demi-bull (25) ; dehors, raté, zéro, à côté ; annuler (la dernière fléchette), valider (la volée). La saisie vocale se coupe dans Réglages › Saisie.</p>
      </div></div></div>`;
  }
  return out;
}

/** Changement d'écran (app.js) : l'écoute s'arrête en quittant la saisie. */
export function voiceRoute(hash) {
  if (!VOICE_ROUTES.includes(hash)) { cancelListening(); vs.explain = false; }
}

/** La fenêtre d'explication est ouverte (retour d'Android : la fermer d'abord). */
export const voiceSheetOpen = () => vs.explain;

export const actions = {
  'voice-mic'() {
    if (vs.listening) { stopListening(); return; }
    if (!voiceOn()) return;
    // Première fois dans l'APK : on explique avant qu'Android demande le micro.
    if (isApk()) {
      const i = callJson('listenInfo');
      if (i && i.permission !== 'granted' && !store.settings.voiceAsked) { vs.explain = true; refresh(); return; }
    }
    startListening();
  },
  'voice-explain-yes'() {
    vs.explain = false;
    saveSetting('voiceAsked', true);
    startListening();
  },
  'voice-explain-no'() { vs.explain = false; refresh(); },
};
