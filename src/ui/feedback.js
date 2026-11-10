// Strela — retours sonores et annonces vocales (lot 3). Rien ici n'attend : les sons sont programmés sur l'horloge
// de Web Audio, les annonces confiées à la synthèse vocale du téléphone ; la saisie n'est jamais retardée.
//
// Sons : générés par Web Audio (aucun fichier), courts. Clic à chaque fléchette (plus aigu pour un double, double
// clic aigu pour un triple, sourd pour un 0), son distinct pour le bust, la validation, la finition. Réglage « Sons ».
// En attendant l'APK (lot 5 : vibreur natif), ils remplacent les vibrations, qui ne marchent pas en web sur le Pixel.
//
// Voix : speechSynthesis, voix française du téléphone ; dans l'APK (lot 5), TextToSpeech d'Android par la passerelle. Une nouvelle annonce coupe la précédente. Réglage « Annonces
// vocales ». Les pseudos sont lus tels qu'écrits ; les nombres sont donnés en chiffres, la voix française les lit
// en toutes lettres (« 140 » → « cent quarante »).
import { store } from './store.js';
import { isApk, call, callJson } from './native.js';

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

// Lot 7.5 : bruit filtré, grognement et tintement, pour les animations de tour (ours, planète).
let noiseBuf = null;
/** Souffle de bruit blanc filtré (type de filtre, fréquence ou [départ, arrivée], Q), début et durée (s), volume. */
function noise(ac, at, dur, gain, filter = 'bandpass', freq = 1000, q = 1) {
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = filter;
  const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
  f.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, at + dur);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.03, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/** Grognement : dent de scie grave, roulée (modulée vers 26 Hz) et étouffée (passe-bas), avec un peu de souffle. */
function growl(ac, at, dur, [f0, f1], gain = 0.3, roll = 26) {
  const o = ac.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, at);
  o.frequency.linearRampToValueAtTime((f0 + f1) / 2 * 1.08, at + dur * 0.35);
  o.frequency.linearRampToValueAtTime(f1, at + dur);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900; // assez haut pour un haut-parleur de téléphone (les graves n'y passent pas)
  lp.Q.value = 4;
  const amp = ac.createGain();
  amp.gain.value = 0.55;
  const lfo = ac.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = roll;
  const depth = ac.createGain();
  depth.gain.value = 0.45;
  lfo.connect(depth).connect(amp.gain);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.06);
  g.gain.setValueAtTime(gain, at + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(lp).connect(amp).connect(g).connect(ac.destination);
  o.start(at); lfo.start(at);
  o.stop(at + dur + 0.02); lfo.stop(at + dur + 0.02);
  noise(ac, at, dur, gain * 0.25, 'lowpass', 500, 1);
}

/** Tintement d'étoile : sinus aigu bref, avec une octave au-dessus. */
function ping(ac, f, at, gain = 0.1) {
  tone(ac, 'sine', [f, f * 1.01], at, 0.18, gain);
  tone(ac, 'sine', f * 2, at + 0.01, 0.12, gain * 0.4);
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
  // Lot 7 : trombone triste des nuls (« wah wah wah waaah »), la dernière note glisse vers le bas.
  // Lot 7.4 : coup de carabine (animation de tour) : claquement sec puis écho grave.
  // Lot 7.5 : l'ours (grognements, reniflements, grattage, ronflement, mastication) et la planète (orbite, étoiles,
  // étoile filante).
  'bear-growl': (ac, t) => growl(ac, t, 0.7, [135, 92], 0.3),
  'bear-grunt': (ac, t) => { growl(ac, t, 0.22, [140, 115], 0.28, 30); growl(ac, t + 0.28, 0.3, [130, 95], 0.28, 30); },
  'bear-sniff': (ac, t) => [0, 0.16, 0.32].forEach(d => noise(ac, t + d, 0.1, 0.35, 'bandpass', [2400, 3600], 2)),
  'bear-scratch': (ac, t) => [0, 0.09, 0.18, 0.27, 0.36, 0.45].forEach(d => noise(ac, t + d, 0.06, 0.35, 'bandpass', 2600, 3)),
  'bear-snore': (ac, t) => { growl(ac, t, 0.9, [90, 78], 0.24, 18); noise(ac, t + 0.95, 0.6, 0.06, 'highpass', 1800, 0.7); },
  'bear-chomp': (ac, t) => {
    [0, 0.17, 0.34, 0.51].forEach(d => { noise(ac, t + d, 0.07, 0.2, 'bandpass', 900, 1.5); tone(ac, 'sine', [160, 90], t + d, 0.08, 0.25); });
    growl(ac, t + 0.7, 0.45, [150, 120], 0.22, 14); // « mmmh » content
  },
  'planet-orbit': (ac, t) => {
    const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), dep = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 1.1);
    o.frequency.exponentialRampToValueAtTime(440, t + 2.2);
    lfo.frequency.value = 6; dep.gain.value = 14;
    lfo.connect(dep).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.25);
    g.gain.setValueAtTime(0.09, t + 1.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    o.connect(g).connect(ac.destination);
    o.start(t); lfo.start(t); o.stop(t + 2.35); lfo.stop(t + 2.35);
  },
  'planet-twinkle': (ac, t) => [2093, 2637, 3136, 2349].forEach((f, i) => ping(ac, f, t + i * 0.11)),
  'planet-shoot': (ac, t) => { noise(ac, t, 0.6, 0.25, 'bandpass', [5000, 700], 4); tone(ac, 'sine', [2400, 500], t, 0.55, 0.05); },
  shot: (ac, t) => { tone(ac, 'square', [1900, 140], t, 0.05, 0.16); tone(ac, 'sawtooth', [320, 45], t + 0.01, 0.22, 0.22); },
  flop: (ac, t) => [[392, 380], [370, 358], [349, 338], [330, 262]].forEach(([a, b], i) => tone(ac, 'sawtooth', [a, b], t + i * 0.26, i === 3 ? 0.7 : 0.22, 0.1)),
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
  if (isApk()) return callJson('voice') || { state: 'absent' }; // lot 5 : synthèse vocale d'Android (TextToSpeech)
  if (!synth()) return { state: 'absent' };
  if (!voice) pickVoice();
  if (voice) return { state: 'ok', name: voice.name };
  return { state: voicesLoaded ? 'none' : 'loading' };
}

/** Dernières annonces (lues par les tests). */
export const sayLog = [];

// Lot 7.5 : voix d'homme (bonhomme en costume-cravate) et voix pâteuse (Tsia) ; elles passent après l'annonce en
// cours au lieu de la couper. Voix d'homme : une voix française au nom d'homme si le téléphone en a une, sinon la voix
// habituelle, plus grave.
const MALE = /homme|male|thomas|paul|henri|nicolas|daniel|antoine|mathieu|frb|frd|-m\d|_m\d/i;
let male;
function maleVoice() {
  if (male !== undefined && male !== null) return male;
  const all = (synth() && synth().getVoices()) || [];
  male = all.find(v => /^fr/i.test(v.lang || '') && MALE.test(v.name) && !/female|femme/i.test(v.name)) || null;
  return male;
}
/** Hauteur et débit de chaque style ; `deep` : hauteur sans voix d'homme trouvée. */
export const VOICE_STYLES = Object.freeze({
  homme: { rate: 1, pitch: 0.85, deep: 0.6 },
  ivre: { rate: 0.62, pitch: 0.8, deep: 0.55 },
});

/**
 * Annonce : coupe celle en cours et parle aussitôt. `strong` : appuyée (180). `style` (lot 7.5) : 'homme' ou 'ivre',
 * dit après l'annonce en cours. Rien si le réglage est sur NON (sauf `force`, pour TESTER LA VOIX).
 */
export function say(text, { strong = false, force = false, style = null } = {}) {
  if (!force && !store.settings.voice) return false;
  const st = VOICE_STYLES[style] || null;
  // Lot 5 : dans l'APK, la voix d'Android (la Web Speech API n'est pas fiable dans une WebView).
  if (isApk()) {
    const ok = (st ? call('speakAs', text, style) : call('speak', text, strong)) === true;
    if (ok) { sayLog.push(text); if (sayLog.length > 50) sayLog.shift(); }
    return ok;
  }
  const s = synth();
  if (!s || typeof globalThis.SpeechSynthesisUtterance !== 'function') return false;
  try {
    if (!st) s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (!voice) pickVoice();
    const v = st ? (maleVoice() || voice) : voice;
    try { if (v) u.voice = v; } catch (e) { /* voix refusée : la langue suffit */ }
    u.lang = (v && v.lang) || 'fr-FR';
    u.rate = st ? st.rate : strong ? 0.9 : 1.08;
    u.pitch = st ? (v && v === male ? st.pitch : st.deep) : strong ? 1.25 : 1;
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
  // Lot 7
  place: (n, name) => `${name}, ${['premier', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième'][n - 1]} !`,
  // Lot 7.5 : plusieurs moqueries par cas, tirées au sort (`r` dans [0, 1[ pour les tests).
  flop: (kind, name, value, r = Math.random()) => {
    const list = FLOP_LINES[kind];
    return list ? list[Math.floor(r * list.length) % list.length](name, value) : '';
  },
  /** Lot 7.5 : quelques mots pâteux, à moitié compréhensibles, quand Tsia lance (voix « ivre »). */
  drunk: (r = Math.random) => {
    const n = 3 + Math.floor(r() * 3);
    const out = [];
    for (let i = 0; i < n; i++) out.push(DRUNK[Math.floor(r() * DRUNK.length)]);
    out.splice(1 + Math.floor(r() * (n - 1)), 0, DRUNK_CLEAR[Math.floor(r() * DRUNK_CLEAR.length)]);
    return `${out.join('… ')}…`;
  },
  lastPays: names => (names.length === 1 ? `${names[0]} paie sa tournée !` : `${names.join(' et ')} paient leur tournée !`),
});

// Moqueries des nuls (lot 7 ; lot 7.5 : plusieurs par cas, la volée « basse » va jusqu'à 19 points).
export const FLOP_LINES = Object.freeze({
  zero: [n => `Zéro ! Bravo ${n} !`, n => `Zéro pointé pour ${n}. Respect.`, n => `${n}, la cible est de l'autre côté.`,
    n => `Rien, nada, que dalle. Merci ${n} !`, n => `${n} vise le mur, et il le touche.`],
  low: [n => `Quel talent, ${n} !`, (n, v) => `${v} points. On sent la grande forme, ${n}.`, n => `${n}, c'est un échauffement, j'espère ?`,
    n => `Magnifique, ${n}. Enfin, presque.`, (n, v) => `${v} ! Le public est debout, ${n}. Pour partir.`, n => `${n} joue avec la main gauche ce soir.`],
  bust: [n => `Bust ! On applaudit ${n} !`, n => `Bust ! ${n} a encore fait ses calculs de tête.`, n => `Trop fort, ${n}. Vraiment trop fort.`,
    n => `Bust ! ${n}, la calculatrice est en option.`],
  serie: [(n, v) => `${v} volées ratées d'affilée. Bravo ${n} !`, (n, v) => `${v} de suite ! ${n} tient la distance.`,
    (n, v) => `${v} volées pourries d'affilée. ${n}, une tournée et ça repart.`],
});

// Voix pâteuse de Tsia (lot 7.5) : syllabes à prononcer (jamais de lettres seules, que la voix épellerait) et une
// bribe compréhensible.
const DRUNK = Object.freeze(['bleuuuh', 'gnagnagna', 'chlouf', 'mouarf', 'brouf', 'pouaaah', 'hips', 'schlurp', 'bidoulou',
  'glagla', 'hmmmouais', 'chépa', 'fouuu', 'blobloblo', 'mouiii', 'kékidi', 'pchiii', 'gloups', 'ouf ouf']);
const DRUNK_CLEAR = Object.freeze(['la cible elle bouge', 'chuis pas bourré', 'c\'est qui qui a mis deux cibles', 'encore un ptit verre',
  'je vous aime tous', 'où qu\'elle est ma fléchette', 'ça tourne un peu', 'c\'est la dernière, promis']);
