// Strela — saisie à la voix (lot 9.3) : une phrase entendue → fléchettes et commandes. JS pur, sans DOM ni dépendance.
//
// Le joueur annonce chaque fléchette : « triple vingt », « double seize », « vingt » ou « simple vingt » (simple 20),
// « simple vingt intérieur » / « extérieur » (couronne du simple), « bull » / « centre » / « cinquante » /
// « double bull » (50), « vingt-cinq » / « demi-bull » / « simple bull » (25), « dehors » / « raté » / « zéro » /
// « à côté » / « hors cible » (hors cible) ; commandes « annuler » (dernière fléchette) et « valider » (la volée).
// Une phrase porte 1 à 3 fléchettes. Les variantes de la reconnaissance sont tolérées (chiffres, « vin », « tripe »…) ;
// ce qui reste douteux est refusé (mot inconnu, multiplicateur sans nombre, « triple 25 »…) plutôt que deviné.
// Nombres composés : « dix sept » = 17, « vingt cinq » = 25 (le français parlé), jamais deux fléchettes.
//
// Résultat de parse() : { ok: true, actions: [{ dart: { segment, multiplier, ring? } } | { cmd: 'undo' | 'validate' }] }
// ou { ok: false, error: code, word? } ; interpret() choisit entre les propositions du moteur de reconnaissance.

import { makeDart, isValidDart, BULL, MISS } from './darts.js';

export const VOICE_ERRORS = Object.freeze({
  EMPTY: 'EMPTY',               // rien d'entendu
  UNKNOWN: 'UNKNOWN',           // mot inconnu (`word`)
  INCOMPLETE: 'INCOMPLETE',     // « triple » sans nombre, « demi » sans bull
  INVALID: 'INVALID',           // fléchette impossible (« triple bull », « double zéro », « 21 »)
  RING: 'RING',                 // intérieur / extérieur mal placé (sur un double, sans fléchette avant…)
  TOO_MANY: 'TOO_MANY',         // plus de 3 fléchettes
  AMBIGUOUS: 'AMBIGUOUS',       // les propositions du moteur ne disent pas la même chose (`options`)
});

/** Texte en clair, sans accents ni ponctuation, en mots séparés par une espace. */
export function normalize(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe').replace(/['’`"«»,;:.!?()\-–—_/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const WORDS = new Map();
const def = (kind, value, ...words) => { for (const w of words) WORDS.set(w, { kind, value }); };
def('mult', 1, 'simple', 'simples', 'single', 'singles');
def('mult', 2, 'double', 'doubles', 'doublee', 'doubler', 'doublet');
def('mult', 3, 'triple', 'triples', 'triplee', 'tripler', 'tripe', 'tripes', 'tripl', 'tripple', 'triplet');
def('ring', 'in', 'interieur', 'interieure', 'interieurs', 'interne');
def('ring', 'out', 'exterieur', 'exterieure', 'exterieurs', 'externe');
def('num', 1, 'un', 'une');
def('num', 2, 'deux');
def('num', 3, 'trois');
def('num', 4, 'quatre', 'quatres');
def('num', 5, 'cinq', 'cinque');
def('num', 6, 'six');
def('num', 7, 'sept', 'set');
def('num', 8, 'huit');
def('num', 9, 'neuf');
def('num', 10, 'dix', 'dis');
def('num', 11, 'onze');
def('num', 12, 'douze');
def('num', 13, 'treize');
def('num', 14, 'quatorze');
def('num', 15, 'quinze');
def('num', 16, 'seize');
def('num', 20, 'vingt', 'vingts', 'vin', 'vins', 'vain', 'vint');
def('num', 50, 'cinquante');
def('bull', 0, 'bull', 'bulls', 'bulle', 'bulles', 'boule', 'bool', 'boul', 'centre', 'center');
def('demi', 0, 'demi', 'demie');
def('miss', 0, 'dehors', 'rate', 'ratee', 'rates', 'ratees', 'rater', 'zero', 'cote', 'hors');
def('cmd', 'undo', 'annuler', 'annule', 'annulez', 'annulee', 'annul');
def('cmd', 'validate', 'valider', 'valide', 'validez', 'validee', 'valid');
// Mots sans importance : liaisons, hésitations, articles (« à côté », « hors cible », « dans le vingt »).
def('skip', 0, 'et', 'puis', 'ensuite', 'alors', 'euh', 'heu', 'hum', 'bon', 'ok', 'okay', 'voila', 'a', 'au', 'le',
  'la', 'les', 'dans', 'cible', 'fleche', 'fleches', 'flechette', 'flechettes', 'encore', 'aussi');

/** Le mot → { kind, value }, ou null s'il est inconnu. Chiffres et notations courtes (T20, D16, S5) compris. */
function word(w) {
  if (WORDS.has(w)) return WORDS.get(w);
  if (/^\d+$/.test(w)) return { kind: 'num', value: Number(w) };
  return null;
}

/** Mots de la phrase → jetons, nombres composés regroupés (« dix sept » = 17, « vingt cinq » = 25). */
function tokens(text) {
  const out = [];
  const raw = normalize(text).split(' ').filter(Boolean);
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    const short = /^([sdt])(\d{1,2})$/.exec(w); // « T20 », « d16 » : notation des joueurs
    if (short) {
      out.push({ kind: 'mult', value: { s: 1, d: 2, t: 3 }[short[1]], w }, { kind: 'num', value: Number(short[2]), w });
      continue;
    }
    const t = word(w);
    if (!t) { out.push({ kind: 'unknown', w }); continue; }
    if (t.kind === 'num' && t.value === 10 && i + 1 < raw.length && ['sept', 'set', 'huit', 'neuf'].includes(raw[i + 1])) {
      out.push({ kind: 'num', value: 10 + word(raw[i + 1]).value, w: `${w} ${raw[i + 1]}` });
      i++;
      continue;
    }
    if (t.kind === 'num' && t.value === 20 && raw[i + 1] === 'et' && ['un', 'une'].includes(raw[i + 2])) {
      out.push({ kind: 'num', value: 21, w: `${w} et ${raw[i + 2]}` }); // « vingt et un » : 21, refusé plus loin
      i += 2;
      continue;
    }
    if (t.kind === 'num' && t.value === 20 && i + 1 < raw.length && ['cinq', 'cinque'].includes(raw[i + 1])) {
      out.push({ kind: 'num', value: 25, w: `${w} ${raw[i + 1]}` });
      i++;
      continue;
    }
    if (t.kind !== 'skip') out.push({ ...t, w });
  }
  return out;
}

/** Une phrase → { ok, actions } ou { ok: false, error, word }. */
export function parse(text) {
  const toks = tokens(text);
  if (!toks.length) return { ok: false, error: VOICE_ERRORS.EMPTY };
  const actions = [];
  let mult = null;       // multiplicateur annoncé, en attente du nombre
  let ring = null;       // couronne annoncée avant le nombre (« simple intérieur vingt »)
  let demi = false;      // « demi », en attente de « bull »
  let lastTok = null;    // jeton qui a produit la dernière fléchette (pour « vingt intérieur »)
  const fail = (error, w) => ({ ok: false, error, ...(w ? { word: w } : {}) });
  const pending = () => mult !== null || ring !== null || demi;
  const push = (dart, tok) => {
    if (!isValidDart(dart)) return false;
    actions.push({ dart });
    lastTok = tok;
    mult = null; ring = null; demi = false;
    return true;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const prev = toks[i - 1];
    switch (t.kind) {
      case 'unknown': return fail(VOICE_ERRORS.UNKNOWN, t.w);
      case 'mult':
        if (pending()) return fail(VOICE_ERRORS.INCOMPLETE, t.w);
        mult = t.value;
        break;
      case 'ring': {
        if (demi || ring !== null) return fail(VOICE_ERRORS.RING, t.w);
        if (mult !== null) { // « simple intérieur vingt »
          if (mult !== 1) return fail(VOICE_ERRORS.RING, t.w);
          ring = t.value;
          break;
        }
        // « vingt intérieur » : la fléchette juste avant, un simple de 1 à 20 sans couronne.
        const last = actions[actions.length - 1];
        if (!last || !last.dart || prev !== lastTok || last.dart.multiplier !== 1 || last.dart.segment < 1 || last.dart.segment > 20 || last.dart.ring) {
          return fail(VOICE_ERRORS.RING, t.w);
        }
        last.dart = Object.freeze({ ...last.dart, ring: t.value });
        lastTok = null;
        break;
      }
      case 'num': {
        if (demi) return fail(VOICE_ERRORS.INCOMPLETE, t.w);
        const n = t.value;
        if (n === 0) { if (pending()) return fail(VOICE_ERRORS.INVALID, t.w); push(makeDart(MISS, 1), t); break; }
        if (n === 50) { if (pending()) return fail(VOICE_ERRORS.INVALID, t.w); push(makeDart(BULL, 2), t); break; }
        if (n === BULL) {
          if (ring !== null || mult === 3) return fail(VOICE_ERRORS.INVALID, t.w);
          push(makeDart(BULL, mult === 2 ? 2 : 1), t);
          break;
        }
        if (n < 1 || n > 20) return fail(VOICE_ERRORS.INVALID, t.w);
        const d = ring ? Object.freeze({ segment: n, multiplier: 1, ring }) : makeDart(n, mult || 1);
        if (!push(d, t)) return fail(VOICE_ERRORS.INVALID, t.w);
        break;
      }
      case 'demi':
        if (pending()) return fail(VOICE_ERRORS.INCOMPLETE, t.w);
        demi = true;
        break;
      case 'bull':
        if (ring !== null || mult === 3) return fail(VOICE_ERRORS.INVALID, t.w);
        // « bull » seul = 50 (double bull) ; « demi-bull » et « simple bull » = 25.
        push(makeDart(BULL, demi || mult === 1 ? 1 : 2), t);
        break;
      case 'miss':
        if (pending()) return fail(VOICE_ERRORS.INVALID, t.w);
        push(makeDart(MISS, 1), t);
        break;
      case 'cmd':
        if (pending()) return fail(VOICE_ERRORS.INCOMPLETE, t.w);
        actions.push({ cmd: t.value });
        lastTok = null;
        break;
      default: break;
    }
  }
  if (pending()) return fail(VOICE_ERRORS.INCOMPLETE, toks[toks.length - 1].w);
  if (actions.filter(a => a.dart).length > 3) return fail(VOICE_ERRORS.TOO_MANY);
  return { ok: true, actions };
}

const sig = actions => actions.map(a => (a.cmd ? a.cmd : `${a.dart.segment}x${a.dart.multiplier}${a.dart.ring || ''}`)).join(' ');

/**
 * Propositions du moteur de reconnaissance (la plus sûre d'abord) → résultat, avec `heard` (la phrase retenue).
 * La première comprise est prise si c'est la première ; sinon, seulement si toutes celles comprises disent la même
 * chose (sinon AMBIGUOUS, avec les phrases en `options`).
 */
export function interpret(alternatives) {
  const list = (Array.isArray(alternatives) ? alternatives : [alternatives]).map(t => String(t ?? '').trim()).filter(Boolean);
  if (!list.length) return { ok: false, error: VOICE_ERRORS.EMPTY, heard: '' };
  const parsed = list.map(t => ({ ...parse(t), heard: t }));
  if (parsed[0].ok) return parsed[0];
  const good = parsed.filter(p => p.ok);
  if (!good.length) return parsed[0];
  if (good.every(p => sig(p.actions) === sig(good[0].actions))) return good[0];
  return { ok: false, error: VOICE_ERRORS.AMBIGUOUS, heard: list[0], options: good.map(p => p.heard) };
}

/** Fléchette → libellé court (T20, D16, 20 INT., 25, 50, HORS CIBLE). */
export function dartLabel(d) {
  if (d.segment === MISS) return 'HORS CIBLE';
  if (d.segment === BULL) return d.multiplier === 2 ? '50' : '25';
  const base = `${d.multiplier === 3 ? 'T' : d.multiplier === 2 ? 'D' : ''}${d.segment}`;
  return d.ring === 'in' ? `${base} INT.` : d.ring === 'out' ? `${base} EXT.` : base;
}

/** Actions → phrase de confirmation dite par l'appli (« triple 20, double 16, annulé »). */
export function sayText(actions) {
  return actions.map(a => {
    if (a.cmd) return a.cmd === 'undo' ? 'annulé' : 'validé';
    const d = a.dart;
    if (d.segment === MISS) return 'dehors';
    if (d.segment === BULL) return d.multiplier === 2 ? 'bull' : '25';
    const w = `${d.multiplier === 3 ? 'triple ' : d.multiplier === 2 ? 'double ' : ''}${d.segment}`;
    return d.ring === 'in' ? `${w} intérieur` : d.ring === 'out' ? `${w} extérieur` : w;
  }).join(', ');
}

/** Message d'erreur en français, pour l'écran (et la voix). */
export function errorText(r) {
  switch (r.error) {
    case VOICE_ERRORS.EMPTY: return 'Rien entendu.';
    case VOICE_ERRORS.UNKNOWN: return `Mot non compris : « ${r.word} ».`;
    case VOICE_ERRORS.INCOMPLETE: return 'Phrase incomplète : dis le nombre après simple, double ou triple.';
    case VOICE_ERRORS.INVALID: return `Fléchette impossible${r.word ? ` (« ${r.word} »)` : ''}.`;
    case VOICE_ERRORS.RING: return 'Intérieur ou extérieur : seulement après un simple de 1 à 20.';
    case VOICE_ERRORS.TOO_MANY: return 'Plus de 3 fléchettes : annonce une volée à la fois.';
    case VOICE_ERRORS.AMBIGUOUS: return `Pas sûr : ${(r.options || []).map(o => `« ${o} »`).join(' ou ')}. Répète.`;
    default: return 'Pas compris.';
  }
}
