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
import { verdictSoundKey, nextStreak, streakStep } from '../engine/verdict.js';

// ------------------------------------------------------------------ sons (Web Audio)
let ctx = null;
const audio = () => {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = null; }
  return ctx;
};
// Lot 9.6 C : volume général (réglage `soundVolume`, 0 à 1) sur un gain commun à tous les sons.
let master = null;
const outOf = ac => {
  if (!master || master.context !== ac) { try { master = ac.createGain(); master.connect(ac.destination); } catch (e) { return ac.destination; } }
  const v = Number.isFinite(store.settings.soundVolume) ? store.settings.soundVolume : 1;
  master.gain.value = Math.max(0, Math.min(1, v));
  return master;
};
/** Demi-tons → rapport de fréquence (série de réussites). */
const semi = n => 2 ** (n / 12);

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
  o.connect(g).connect(outOf(ac));
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
  src.connect(f).connect(g).connect(outOf(ac));
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
  o.connect(lp).connect(amp).connect(g).connect(outOf(ac));
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
    o.connect(g).connect(outOf(ac));
    o.start(t); lfo.start(t); o.stop(t + 2.35); lfo.stop(t + 2.35);
  },
  'planet-twinkle': (ac, t) => [2093, 2637, 3136, 2349].forEach((f, i) => ping(ac, f, t + i * 0.11)),
  'planet-shoot': (ac, t) => { noise(ac, t, 0.6, 0.25, 'bandpass', [5000, 700], 4); tone(ac, 'sine', [2400, 500], t, 0.55, 0.05); },
  // Lot 7.9 : petits bruits des animations de tour par pictogramme (pictofx.js), courts et discrets.
  'fx-whoosh': (ac, t) => noise(ac, t, 0.32, 0.22, 'bandpass', [600, 3200], 2),
  'fx-thud': (ac, t) => { tone(ac, 'sine', [170, 70], t, 0.14, 0.3); noise(ac, t, 0.06, 0.18, 'lowpass', 700, 1); },
  'fx-tick': (ac, t) => tone(ac, 'square', 1900, t, 0.02, 0.08),
  'fx-beep': (ac, t) => tone(ac, 'sine', 1320, t, 0.09, 0.12),
  'fx-ding': (ac, t) => ping(ac, 1760, t, 0.12),
  'fx-pop': (ac, t) => tone(ac, 'sine', [420, 1100], t, 0.06, 0.18),
  'fx-boing': (ac, t) => { tone(ac, 'sine', [220, 520], t, 0.12, 0.2); tone(ac, 'sine', [520, 300], t + 0.12, 0.12, 0.14); },
  'fx-creak': (ac, t) => tone(ac, 'sawtooth', [180, 320], t, 0.5, 0.06),
  'fx-rumble': (ac, t) => { noise(ac, t, 1.2, 0.3, 'lowpass', [300, 1400], 0.8); tone(ac, 'sawtooth', [60, 110], t, 1.1, 0.12); },
  'fx-hum': (ac, t) => { tone(ac, 'sine', [220, 262], t, 1.6, 0.06); tone(ac, 'sine', [330, 392], t + 0.2, 1.4, 0.04); },
  'fx-howl': (ac, t) => { tone(ac, 'sine', [330, 620], t, 0.5, 0.12); tone(ac, 'sine', [620, 560], t + 0.5, 0.9, 0.12); tone(ac, 'triangle', [660, 1120], t + 0.02, 1.3, 0.03); },
  'fx-grunt': (ac, t) => { growl(ac, t, 0.16, [210, 170], 0.22, 38); growl(ac, t + 0.24, 0.2, [220, 160], 0.22, 38); },
  'fx-meow': (ac, t) => { tone(ac, 'triangle', [620, 980], t, 0.16, 0.12); tone(ac, 'triangle', [980, 520], t + 0.16, 0.34, 0.12); },
  'fx-hoot': (ac, t) => { tone(ac, 'sine', 392, t, 0.16, 0.16); tone(ac, 'sine', [392, 350], t + 0.22, 0.34, 0.16); },
  'fx-screech': (ac, t) => { tone(ac, 'sawtooth', [2300, 1500], t, 0.4, 0.05); noise(ac, t, 0.4, 0.08, 'bandpass', [3600, 2200], 6); },
  'fx-caw': (ac, t) => [0, 0.26].forEach(d => { tone(ac, 'sawtooth', [640, 500], t + d, 0.17, 0.09); noise(ac, t + d, 0.17, 0.12, 'bandpass', 1500, 3); }),
  'fx-slide': (ac, t) => noise(ac, t, 0.7, 0.12, 'bandpass', [900, 1700], 1.5),
  'fx-gulp': (ac, t) => [0, 0.2, 0.4].forEach(d => tone(ac, 'sine', [300, 140], t + d, 0.11, 0.2)),
  'fx-clink': (ac, t) => { ping(ac, 2637, t, 0.12); ping(ac, 3520, t + 0.03, 0.08); },
  'fx-splash': (ac, t) => { noise(ac, t, 0.5, 0.3, 'bandpass', [2600, 500], 1.2); tone(ac, 'sine', [240, 90], t, 0.18, 0.2); },
  'fx-crackle': (ac, t) => [0, 0.13, 0.21, 0.4, 0.52, 0.75, 0.9, 1.2, 1.36, 1.6].forEach(d => noise(ac, t + d, 0.03, 0.2, 'highpass', 2400, 1)),
  'fx-zap': (ac, t) => { noise(ac, t, 0.22, 0.3, 'highpass', 1800, 0.8); tone(ac, 'sawtooth', [1500, 90], t, 0.2, 0.12); },
  shot: (ac, t) => { tone(ac, 'square', [1900, 140], t, 0.05, 0.16); tone(ac, 'sawtooth', [320, 45], t + 0.01, 0.22, 0.22); },
  flop: (ac, t) => [[392, 380], [370, 358], [349, 338], [330, 262]].forEach(([a, b], i) => tone(ac, 'sawtooth', [a, b], t + i * 0.26, i === 3 ? 0.7 : 0.22, 0.1)),
  // Lot 7.8 : la moto d'Angelina (moteur qui monte, dérapage, chute dans le fossé) et la fanfare du roi des uns.
  moto: (ac, t) => {
    tone(ac, 'sawtooth', [70, 150], t, 0.7, 0.12); tone(ac, 'square', [140, 300], t, 0.7, 0.05);
    noise(ac, t + 0.7, 0.35, 0.22, 'bandpass', [2400, 900], 2.5);
    noise(ac, t + 1.05, 0.5, 0.45, 'lowpass', [900, 120], 0.8); tone(ac, 'sine', [160, 45], t + 1.05, 0.35, 0.3);
    [1.6, 1.75, 1.95].forEach(d => noise(ac, t + d, 0.06, 0.14, 'highpass', 2000, 1));
  },
  uns: (ac, t) => [[523, 0], [523, 0.16], [523, 0.32], [415, 0.5]].forEach(([f, d], i) => tone(ac, 'square', f, t + d, i === 3 ? 0.6 : 0.12, 0.09)),
  // Lot 9.6 C : verdict de chaque fléchette (engine/verdict.js) — courts, discrets ; `o.step` : demi-tons de la série.
  'v-hit': (ac, t, o = {}) => { const k = semi(o.step || 0); ping(ac, 1568 * k, t, 0.09); },
  'v-rich': (ac, t, o = {}) => { const k = semi(o.step || 0); ping(ac, 1568 * k, t, 0.09); ping(ac, 1976 * k, t + 0.045, 0.08); ping(ac, 2349 * k, t + 0.09, 0.07); },
  'v-neutral': (ac, t) => tone(ac, 'triangle', 1100, t, 0.035, 0.1),
  'v-miss': (ac, t) => tone(ac, 'triangle', [420, 300], t, 0.09, 0.16),
  'v-off': (ac, t) => { tone(ac, 'sine', [170, 80], t, 0.12, 0.22); noise(ac, t, 0.05, 0.1, 'lowpass', 600, 1); },
  'visit-good': (ac, t) => [880, 1109, 1319].forEach((f, i) => tone(ac, 'triangle', f, t + i * 0.06, 0.09, 0.14)),
  'end-win': (ac, t) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ac, 'triangle', f, t + i * 0.1, i === 4 ? 0.5 : 0.1, 0.22)),
  'end-ok': (ac, t) => [523, 659, 784].forEach((f, i) => tone(ac, 'triangle', f, t + i * 0.1, i === 2 ? 0.35 : 0.1, 0.2)),
  'end-meh': (ac, t) => [523, 494, 523].forEach((f, i) => tone(ac, 'triangle', f, t + i * 0.12, i === 2 ? 0.3 : 0.1, 0.16)),
  record: (ac, t) => { [659, 784, 988, 1319].forEach((f, i) => tone(ac, 'square', f, t + i * 0.08, i === 3 ? 0.45 : 0.08, 0.09)); ping(ac, 2637, t + 0.4, 0.08); },
  badge: (ac, t) => [784, 988, 1175].forEach((f, i) => tone(ac, 'triangle', f, t + i * 0.08, i === 2 ? 0.3 : 0.08, 0.18)),
  'badge-gold': (ac, t) => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(ac, 'triangle', f, t + i * 0.08, i === 5 ? 0.6 : 0.09, 0.2)); [2093, 2637].forEach((f, i) => ping(ac, f, t + 0.5 + i * 0.1, 0.07)); },
  'defi-in': (ac, t) => [0, 0.18, 0.36].forEach(d => { tone(ac, 'square', 988, t + d, 0.07, 0.1); tone(ac, 'square', 1480, t + d + 0.08, 0.07, 0.1); }),
  'defi-ok': (ac, t) => [784, 1047, 1568].forEach((f, i) => tone(ac, 'triangle', f, t + i * 0.07, i === 2 ? 0.3 : 0.08, 0.2)),
  'defi-ko': (ac, t) => [[392, 370], [349, 262]].forEach(([a, b], i) => tone(ac, 'triangle', [a, b], t + i * 0.2, i === 1 ? 0.4 : 0.18, 0.16)),
});

// Lot 9.6 C : familles (réglage `soundFamilies` : on coupe une famille sans toucher aux autres) et priorités (un son plus
// important coupe les moins importants pendant qu'il joue : record > badge > défi > fléchette ; pas de chevauchement).
export const SOUND_FAMILIES = Object.freeze({
  touches: { label: 'Touches', sounds: ['undo', 'validate'] },
  verdicts: { label: 'Fléchettes (réussie, neutre, ratée)', sounds: ['v-hit', 'v-rich', 'v-neutral', 'v-miss', 'v-off', 'visit-good', 'single', 'double', 'triple', 'miss'] },
  evenements: { label: 'Défis, badges, records', sounds: ['defi-in', 'defi-ok', 'defi-ko', 'badge', 'badge-gold', 'record'] },
  fins: { label: 'Fin de partie ou d\'exercice', sounds: ['finish', 'end-win', 'end-ok', 'end-meh', 'max'] },
});
const FAMILY_OF = Object.fromEntries(Object.entries(SOUND_FAMILIES).flatMap(([f, x]) => x.sounds.map(k => [k, f])));
export const familyOn = f => { const fs = store.settings.soundFamilies; return !fs || typeof fs !== 'object' || fs[f] !== false; };
const PRIO = { record: [4, 1.2], 'badge-gold': [3, 1.3], badge: [3, 0.6], 'defi-in': [2, 0.7], 'defi-ok': [2, 0.4], 'defi-ko': [2, 0.6] };
const prioOf = k => (PRIO[k] ? PRIO[k][0] : FAMILY_OF[k] === 'verdicts' ? 1 : FAMILY_OF[k] === 'touches' ? 0 : 1);
let busy = { until: 0, prio: -1 };

/** Joue un son (si le réglage « Sons » est sur OUI, ou `force` pour le test). Renvoie false si Web Audio manque. */
export function sound(kind, { force = false, step = 0 } = {}) {
  if (!force && !store.settings.sound) return true;
  if (!force && FAMILY_OF[kind] && !familyOn(FAMILY_OF[kind])) return true;
  if (!force && store.audioCall && FAMILY_OF[kind]) return true; // plus tard : pas de son pendant un appel en ligne
  const ac = audio();
  if (!ac || !SOUNDS[kind]) return false;
  const now = Date.now(), p = prioOf(kind);
  if (!force && now < busy.until && p < busy.prio) { soundLog.push(`(${kind})`); if (soundLog.length > 50) soundLog.shift(); return true; }
  if (PRIO[kind]) busy = { until: now + PRIO[kind][1] * 1000, prio: p };
  try {
    if (ac.state === 'suspended') ac.resume();
    SOUNDS[kind](ac, ac.currentTime + 0.005, { step });
    soundLog.push(kind);
    if (soundLog.length > 50) soundLog.shift();
  } catch (e) { return false; }
  return true;
}
/** Derniers sons joués (lus par les tests). */
export const soundLog = [];

/** Son d'une fléchette : 0, simple, double ou triple. */
export const dartSound = d => (d.segment === 0 ? 'miss' : d.multiplier === 3 ? 'triple' : d.multiplier === 2 ? 'double' : 'single');

// Lot 9.6 C : le son suit le verdict de la fléchette (engine/verdict.js), avec la série de réussites qui fait monter le ton.
let streak = 0;
/** Joue le son d'un verdict ; `who` (joueur) remet la série à zéro quand il change. Renvoie la clé jouée. */
let streakWho = null;
export function verdictSound(vd, who = null) {
  if (who !== streakWho) { streak = 0; streakWho = who; }
  streak = nextStreak(streak, vd);
  const key = verdictSoundKey(vd);
  sound(key, { step: streakStep(streak) });
  return key;
}
export const resetStreak = () => { streak = 0; };

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

// Moqueries des nuls (lot 7 ; lot 7.5 : plusieurs par cas, la volée « basse » va jusqu'à 19 points ; lot 7.7 : plus
// cyniques, demande de Guillaume). Sans pronom genré : le pseudo seulement.
export const FLOP_LINES = Object.freeze({
  zero: [n => `Zéro ! Bravo ${n} !`, n => `Zéro pointé pour ${n}. Respect.`, n => `${n}, la cible est de l'autre côté.`,
    n => `Rien, nada, que dalle. Merci ${n} !`, n => `${n} vise le mur, et le touche.`,
    n => `Zéro. ${n}, même par hasard on fait mieux.`, n => `${n} vient d'inventer la volée fantôme.`,
    n => `Trois fléchettes, zéro point. ${n}, c'est presque un exploit.`, n => `Zéro. Le mur te dit merci, ${n}.`,
    n => `${n}, la cible t'a vu venir. Elle s'est poussée.`, n => `Zéro pointé. ${n}, t'as pensé au tricot ?`],
  low: [n => `Quel talent, ${n} !`, (n, v) => `${v} points. On sent la grande forme, ${n}.`, n => `${n}, c'est un échauffement, j'espère ?`,
    (n, v) => `${v} ! Le public est debout, ${n}. Pour partir.`, n => `${n} joue avec la main gauche ce soir.`,
    (n, v) => `${v} points. Même la machine à café fait mieux, ${n}.`, (n, v) => `${v}. ${n}, tu joues pour l'autre équipe ?`,
    (n, v) => `${v} points. ${n}, personne ne t'oblige à jouer, tu sais.`, (n, v) => `Ah, ${v}. ${n} confond fléchettes et pétanque.`,
    (n, v) => `${v} points. Quelqu'un peut ramasser le niveau de ${n} ? Il est par terre.`,
    (n, v) => `${v}. Dis-moi que tu fais exprès, ${n}. Dis-le.`],
  bust: [n => `Bust ! On applaudit ${n} !`, n => `Bust ! ${n} a encore fait ses calculs de tête.`, n => `Trop fort, ${n}. Vraiment trop fort.`,
    n => `Bust ! ${n}, la calculatrice est en option.`, n => `Bust. ${n} compte comme un pigeon.`,
    n => `Bust ! ${n}, compter à l'envers, c'est trop demander ?`, n => `Bust. Bel effort, ${n}. Pour rien.`,
    n => `Bust ! ${n} tenait la finition, et l'a lâchée.`, n => `Bust. ${n}, l'école devrait te rembourser.`],
  // Lot 7.8 (Guillaume, 20/11) : « Atila, le roi des uns » (deux 1, ou un double ou un triple 1, sous 20 points).
  uns: [n => `Atila, le roi des uns ! Là où passe ${n}, le vingt ne repousse pas.`, n => `${n}, le roi des uns. Le un te dit merci.`,
    (n, v) => `${v} points, avec des uns. ${n}, Atila serait fier.`, n => `Le un, encore le un. ${n}, roi des uns, saison 1.`,
    n => `Atila, le roi des uns, c'est ${n}. On s'incline.`],
  // Lot 7.8 : Angelina, volée sous 20 : la moto part dans le fossé.
  moto: [n => `Et ${n} part dans le fossé !`, (n, v) => `${v} points. ${n}, la moto est dans le fossé.`,
    n => `${n} a raté le virage. Direction le fossé.`, n => `Accident de moto pour ${n}. Le fossé était là avant.`,
    (n, v) => `${v} points, et ${n} au fossé. On appelle la dépanneuse ?`],
  serie: [(n, v) => `${v} volées ratées d'affilée. Bravo ${n} !`, (n, v) => `${v} de suite ! ${n} tient la distance.`,
    (n, v) => `${v} volées pourries d'affilée. ${n}, une tournée et ça repart.`,
    (n, v) => `${v} de suite. ${n} est constant, au moins dans la nullité.`,
    (n, v) => `${v} volées ratées. ${n}, la tournée est pour toi, d'office.`,
    (n, v) => `${v} d'affilée. On arrête de compter, par pitié pour ${n}.`],
});

// Voix pâteuse de Tsia (lot 7.5) : syllabes à prononcer (jamais de lettres seules, que la voix épellerait) et une
// bribe compréhensible.
const DRUNK = Object.freeze(['bleuuuh', 'gnagnagna', 'chlouf', 'mouarf', 'brouf', 'pouaaah', 'hips', 'schlurp', 'bidoulou',
  'glagla', 'hmmmouais', 'chépa', 'fouuu', 'blobloblo', 'mouiii', 'kékidi', 'pchiii', 'gloups', 'ouf ouf']);
const DRUNK_CLEAR = Object.freeze(['la cible elle bouge', 'chuis pas bourré', 'c\'est qui qui a mis deux cibles', 'encore un ptit verre',
  'je vous aime tous', 'où qu\'elle est ma fléchette', 'ça tourne un peu', 'c\'est la dernière, promis']);
