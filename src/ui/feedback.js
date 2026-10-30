// Strela — retours sonores et annonces vocales (lot 3). Rien ici n'attend : les sons sont programmés sur l'horloge
// de Web Audio, les annonces confiées à la synthèse vocale du téléphone ; la saisie n'est jamais retardée.
//
// Sons : générés par Web Audio (aucun fichier), courts. Clic à chaque fléchette (plus aigu pour un double, double
// clic aigu pour un triple, sourd pour un 0), son distinct pour le bust, la validation, la finition. Réglage « Sons ».
// En attendant l'APK (lot 5 : vibreur natif), ils remplacent les vibrations, qui ne marchent pas en web sur le Pixel.
//
// Voix : speechSynthesis, voix française du téléphone. Une nouvelle annonce coupe la précédente. Réglage « Annonces
// vocales ». Les pseudos sont lus tels qu'écrits ; les nombres sont donnés en chiffres, la voix française les lit
// en toutes lettres (« 140 » → « cent quarante »).
import { store } from './store.js';

// ------------------------------------------------------------------ sons (Web Audio)
let ctx = null;
const audio = () => {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = null; }
  return ctx;
};

/** Note brève : forme d'onde, fréquence (Hz, ou [départ, arrivée] en glissando), début et durée (s), volume. */
function tone(ac, type, freq, at, dur, gain = 0.2) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
  o.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ac.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** Sons connus : ce que chacun joue (t = maintenant). */
export const SOUNDS = Object.freeze({
  single: (ac, t) => tone(ac, 'square', 1500, t, 0.035, 0.12),
  double: (ac, t) => tone(ac, 'square', 2100, t, 0.04, 0.12),
  triple: (ac, t) => { tone(ac, 'square', 2500, t, 0.03, 0.12); tone(ac, 'square', 2500, t + 0.055, 0.03, 0.12); },
  miss: (ac, t) => tone(ac, 'triangle', [320, 180], t, 0.08, 0.25),
  undo: (ac, t) => tone(ac, 'triangle', [900, 600], t, 0.06, 0.15),
  bust: (ac, t) => { tone(ac, 'sawtooth', [240, 110], t, 0.32, 0.16); tone(ac, 'square', [180, 90], t + 0.02, 0.3, 0.06); },
  validate: (ac, t) => { tone(ac, 'triangle', 660, t, 0.07, 0.22); tone(ac, 'triangle', 990, t + 0.075, 0.1, 0.22); },
  finish: (ac, t) => [523, 659, 784, 1047].forEach((f, i) => tone(ac, 'triangle', f, t + i * 0.09, i === 3 ? 0.35 : 0.1, 0.24)),
  max: (ac, t) => [784, 988, 1175, 1568].forEach((f, i) => tone(ac, 'square', f, t + i * 0.07, i === 3 ? 0.4 : 0.08, 0.1)),
});

/** Joue un son (si le réglage « Sons » est sur OUI, ou `force` pour le test). Renvoie false si Web Audio manque. */
export function sound(kind, { force = false } = {}) {
  if (!force && !store.settings.sound) return true;
  const ac = audio();
  if (!ac || !SOUNDS[kind]) return false;
  try {
    if (ac.state === 'suspended') ac.resume();
    SOUNDS[kind](ac, ac.currentTime + 0.005);
    soundLog.push(kind);
    if (soundLog.length > 50) soundLog.shift();
  } catch (e) { return false; }
  return true;
}
/** Derniers sons joués (lus par les tests). */
export const soundLog = [];

/** Son d'une fléchette : 0, simple, double ou triple. */
export const dartSound = d => (d.segment === 0 ? 'miss' : d.multiplier === 3 ? 'triple' : d.multiplier === 2 ? 'double' : 'single');

// ------------------------------------------------------------------ voix (speechSynthesis)
const synth = () => globalThis.speechSynthesis || null;
let voice = null;
let voicesLoaded = false;

function pickVoice() {
  const s = synth();
  if (!s) return;
  const all = s.getVoices() || [];
  voicesLoaded = all.length > 0;
  const fr = all.filter(v => /^fr([-_]|$)/i.test(v.lang || ''));
  voice = fr.find(v => /fr[-_]FR/i.test(v.lang) && v.localService) || fr.find(v => v.localService) || fr.find(v => /fr[-_]FR/i.test(v.lang)) || fr[0] || null;
}
try {
  pickVoice();
  synth()?.addEventListener?.('voiceschanged', pickVoice);
} catch (e) { /* pas de synthèse vocale */ }

/**
 * État de la voix pour les Réglages : 'absent' (pas de synthèse vocale), 'loading' (liste des voix pas encore
 * donnée par le téléphone), 'none' (aucune voix française installée), 'ok' (avec son nom).
 */
export function voiceInfo() {
  if (!synth()) return { state: 'absent' };
  if (!voice) pickVoice();
  if (voice) return { state: 'ok', name: voice.name };
  return { state: voicesLoaded ? 'none' : 'loading' };
}

/** Dernières annonces (lues par les tests). */
export const sayLog = [];

/**
 * Annonce : coupe celle en cours et parle aussitôt. `strong` : appuyée (180). Rien si le réglage est sur NON (sauf
 * `force`, pour TESTER LA VOIX).
 */
export function say(text, { strong = false, force = false } = {}) {
  if (!force && !store.settings.voice) return false;
  const s = synth();
  if (!s || typeof globalThis.SpeechSynthesisUtterance !== 'function') return false;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (!voice) pickVoice();
    try { if (voice) u.voice = voice; } catch (e) { /* voix refusée : la langue suffit */ }
    u.lang = (voice && voice.lang) || 'fr-FR';
    u.rate = strong ? 0.9 : 1.08;
    u.pitch = strong ? 1.25 : 1;
    u.volume = 1;
    s.speak(u);
    sayLog.push(text);
    if (sayLog.length > 50) sayLog.shift();
    return true;
  } catch (e) { return false; }
}

// ------------------------------------------------------------------ textes des annonces (purs, testés)
export const SPEECH = Object.freeze({
  total: n => (n === 180 ? 'Cent quatre-vingts !' : String(n)),
  bust: () => 'Bust',
  checkout: (name, rest) => `${name}, il reste ${rest}`,
  leg: name => `Manche, ${name} !`,
  match: name => `Partie, ${name} !`,
});
