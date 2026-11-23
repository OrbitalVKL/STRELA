// Strela — jeux de cible en solo (lot 8 du 23/11/2026, 5.1) : dix exercices plus ludiques pour le débutant, à côté
// des exercices techniques. JS pur, sans DOM. Chacun a une règle et un score écrits (RULES de training.js) ; l'état se
// recalcule depuis les fléchettes, comme tout le reste (rien d'autre n'est enregistré que la séance).
//
// funState(key, darts, seed) → { targets (cible de chaque fléchette, ou null), cur (cible de la prochaine, ou null si
// fini), done, score (ou null tant que ce n'est pas fini, pour les scores qui n'ont de sens qu'à la fin), live (chiffre
// en cours), status (ligne d'état), extra (détail propre au jeu) }.
// Les tirages au sort (roulette, killer) dépendent de `seed` (identifiant de la séance) : une reprise retrouve les mêmes.
import { SECTORS } from './board.js';
import { dartValue, BULL, MISS } from './darts.js';

/** Empreinte d'une chaîne (FNV-1a 32 bits) et générateur déterministe (mulberry32). */
export function hashSeed(s) {
  let h = 2166136261;
  for (const c of String(s || '')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = hashSeed(seed) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** `n` numéros distincts de 1 à 20, tirés au sort d'après `seed`. */
export function drawNumbers(seed, n) {
  const r = rng(seed);
  const pool = Array.from({ length: 20 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}

const inSector = (d, s) => d.segment === s;
const marks = d => (d.segment === MISS ? 0 : d.multiplier);
const any = s => ({ s, z: 'any' });
/** Cible libre (Pile 100 : on vise ce que l'on veut) : secteur 0, jamais « dans la cible », hors précision. */
export const FREE = Object.freeze({ s: 0, z: 'any' });

/** Parcours dans un ordre, en passant au suivant dès que le secteur est touché (Serpent, Compte à rebours). */
function course(order, darts) {
  const targets = [];
  let k = 0;
  const per = order.map(() => 0);
  for (const d of darts) {
    if (k >= order.length) throw new Error('parcours déjà fini');
    targets.push(any(order[k]));
    per[k]++;
    if (inSector(d, order[k])) k++;
  }
  const done = k >= order.length;
  return { targets, cur: done ? null : any(order[k]), done, score: done ? darts.length : null, live: k, status: `${k}/${order.length} · ${darts.length} FL.`,
    extra: { reached: k, total: order.length, per: per.map((n, i) => ({ s: order[i], darts: n, hit: i < k })) } };
}

/** Coups d'un trou de golf : 1 triple, 2 double, 3 simple ; manqué après 3 fléchettes : 5. */
export const golfStrokes = d => (d && d.segment !== MISS ? (d.multiplier === 3 ? 1 : d.multiplier === 2 ? 2 : 3) : 5);

function golf(darts) {
  const holes = [];
  let h = { s: 1, darts: [], strokes: null };
  const targets = [];
  for (const d of darts) {
    if (holes.length >= 9) throw new Error('golf déjà fini');
    targets.push(any(h.s));
    h.darts.push(d);
    if (inSector(d, h.s)) h.strokes = golfStrokes(d);
    else if (h.darts.length >= 3) h.strokes = 5;
    if (h.strokes !== null) { holes.push(h); h = { s: holes.length + 1, darts: [], strokes: null }; }
  }
  const done = holes.length >= 9;
  const total = holes.reduce((n, x) => n + x.strokes, 0);
  return { targets, cur: done ? null : any(h.s), done, score: done ? total : null, live: total, status: `TROU ${done ? 9 : h.s}/9 · ${total} COUPS`,
    extra: { holes: holes.map(x => ({ s: x.s, darts: x.darts.length, strokes: x.strokes })), par: 27, total } };
}

/** Volées fixes (une cible par volée) : Shanghai, Moitié, Roulette, Mur de 60, Plus haut. */
function volleys(list, darts) {
  const targets = darts.map((_, i) => list[Math.floor(i / 3)] || null);
  if (darts.length > list.length * 3) throw new Error('trop de fléchettes');
  const vs = [];
  for (let i = 0; i < darts.length; i += 3) vs.push({ t: list[i / 3], darts: darts.slice(i, i + 3) });
  const n = darts.length;
  const done = n === list.length * 3;
  return { targets, cur: done ? null : list[Math.floor(n / 3)], done, vs, full: vs.filter(v => v.darts.length === 3) };
}

function shanghai(darts) {
  const v = volleys([1, 2, 3, 4, 5, 6, 7].map(any), darts);
  let total = 0;
  const rounds = v.vs.map(x => {
    const on = x.darts.filter(d => inSector(d, x.t.s));
    const pts = on.reduce((k, d) => k + d.multiplier * x.t.s, 0);
    const sh = x.darts.length === 3 && [1, 2, 3].every(m => on.some(d => d.multiplier === m));
    total += pts + (sh ? 100 : 0);
    return { s: x.t.s, points: pts, shanghai: sh };
  });
  return { ...v, score: v.done ? total : null, live: total, status: `MANCHE ${Math.min(7, v.vs.length + (v.done ? 0 : darts.length % 3 === 0 ? 1 : 0))}/7 · ${total} PTS`, extra: { rounds, total } };
}

export const MOITIE_TARGETS = Object.freeze([20, 19, 18, 17, 16, 15, BULL]);
function moitie(darts) {
  const v = volleys(MOITIE_TARGETS.map(any), darts);
  let total = 40;
  const rounds = v.vs.map(x => {
    const on = x.darts.filter(d => inSector(d, x.t.s));
    const pts = on.reduce((k, d) => k + dartValue(d), 0);
    const full = x.darts.length === 3;
    if (on.length) total += pts; else if (full) total = Math.floor(total / 2);
    return { s: x.t.s, points: pts, halved: full && !on.length, total };
  });
  return { ...v, score: v.done ? total : null, live: total, status: `${total} PTS`, extra: { rounds, total, start: 40 } };
}

function roulette(darts, seed) {
  const r = rng(`${seed}|roulette`);
  const list = Array.from({ length: 10 }, () => any(1 + Math.floor(r() * 20)));
  const v = volleys(list, darts);
  let total = 0;
  const rounds = v.vs.map(x => { const p = x.darts.filter(d => inSector(d, x.t.s)).reduce((k, d) => k + d.multiplier, 0); total += p; return { s: x.t.s, points: p }; });
  return { ...v, score: v.done ? total : null, live: total, status: `${total} PTS`, extra: { rounds, total, list: list.map(t => t.s) } };
}

function mur60(darts) {
  const v = volleys(Array.from({ length: 10 }, () => any(20)), darts);
  const rounds = v.full.map(x => { const p = x.darts.reduce((k, d) => k + dartValue(d), 0); return { points: p, brick: p >= 60 }; });
  const bricks = rounds.filter(x => x.brick).length;
  return { ...v, score: v.done ? bricks : null, live: bricks, status: `${bricks} BRIQUE${bricks > 1 ? 'S' : ''}`, extra: { rounds, bricks } };
}

/** Plus haut : chaque volée doit battre la précédente ; 3 vies ; 15 volées au plus. */
function plushaut(darts) {
  const targets = darts.map(() => any(20));
  const rounds = [];
  let lives = 3, prev = null, wins = 0;
  for (let i = 0; i < darts.length; i += 3) {
    if (lives <= 0 || rounds.length >= 15) throw new Error('partie déjà finie');
    const ds = darts.slice(i, i + 3);
    if (ds.length < 3) break;
    const p = ds.reduce((k, d) => k + dartValue(d), 0);
    const ok = prev === null ? null : p > prev;
    if (ok === true) wins++;
    if (ok === false) lives--;
    rounds.push({ points: p, ok, lives });
    prev = p;
  }
  const done = lives <= 0 || rounds.length >= 15;
  return { targets, cur: done ? null : any(20), done, score: done ? wins : null, live: wins, status: `${wins} RÉUSSIE${wins > 1 ? 'S' : ''} · ${lives} VIE${lives > 1 ? 'S' : ''}`,
    extra: { rounds, lives, wins, prev } };
}

/** Pile 100 : exactement 100 points ; une volée qui dépasse ne compte pas ; 20 volées au plus. */
function cent(darts) {
  const targets = darts.map(() => FREE);
  let total = 0, start = 0, k = 0, busts = 0, done = false;
  const visits = [];
  for (let i = 0; i < darts.length; i++) {
    if (done) throw new Error('partie déjà finie');
    total += dartValue(darts[i]);
    k++;
    if (total > 100) { total = start; busts++; visits.push({ bust: true }); k = 0; start = total; }
    else if (total === 100) { done = true; visits.push({ bust: false }); }
    else if (k === 3) { visits.push({ bust: false }); k = 0; start = total; }
    if (!done && visits.length >= 20) done = true;
  }
  const won = total === 100;
  return { targets, cur: done ? null : FREE, aimless: true, done, score: done && won ? darts.length : null, live: 100 - total,
    status: `RESTE ${100 - total}`, extra: { remaining: 100 - total, busts, won, visits: visits.length } };
}

/** Killer solo : ton numéro (3 marques pour être tueur), puis trois adversaires à 3 vies. */
function killer(darts, seed) {
  const [mine, ...foes] = drawNumbers(`${seed}|killer`, 4);
  const targets = [];
  let mk = 0, step = 0; // step 0 : devenir tueur ; 1 à 3 : adversaire
  const lives = foes.map(() => 3);
  for (const d of darts) {
    if (step > 3) throw new Error('killer déjà fini');
    const t = step === 0 ? mine : foes[step - 1];
    targets.push(any(t));
    if (!inSector(d, t)) continue;
    if (step === 0) { mk = Math.min(3, mk + marks(d)); if (mk >= 3) step = 1; } else { lives[step - 1] = Math.max(0, lives[step - 1] - marks(d)); if (!lives[step - 1]) step++; }
  }
  const done = step > 3;
  const cur = done ? null : any(step === 0 ? mine : foes[step - 1]);
  const out = lives.filter(x => !x).length;
  return { targets, cur, done, score: done ? darts.length : null, live: out,
    status: step === 0 ? `TON ${mine} : ${mk}/3` : `TUEUR · ${out}/3 ÉLIMINÉS`, extra: { mine, foes, marks: mk, lives, killer: step > 0 } };
}

/** Jeux de cible : réglage du parcours et du score. dir : 1 = plus haut est mieux, −1 = plus bas. */
export const FUN = Object.freeze({
  serpent: { order: SECTORS, dir: -1, unit: 'fl.', label: 'Fléchettes pour le tour', volleys: null },
  rebours: { order: Array.from({ length: 20 }, (_, i) => 20 - i), dir: -1, unit: 'fl.', label: 'Fléchettes pour le tour', volleys: null },
  golf: { dir: -1, unit: 'coups', label: 'Coups (par 27)', volleys: null },
  shanghai: { dir: 1, unit: 'pts', label: 'Points', volleys: 7 },
  moitie: { dir: 1, unit: 'pts', label: 'Points', volleys: 7 },
  roulette: { dir: 1, unit: 'pts', label: 'Points (sur 90)', volleys: 10 },
  mur60: { dir: 1, unit: 'briques', label: 'Briques (sur 10)', volleys: 10 },
  plushaut: { dir: 1, unit: 'volées', label: 'Volées réussies', volleys: 15 },
  cent: { dir: -1, unit: 'fl.', label: 'Fléchettes pour 100', volleys: 20 },
  killer: { dir: -1, unit: 'fl.', label: 'Fléchettes pour gagner', volleys: null },
});
export const FUN_KEYS = Object.freeze(Object.keys(FUN));

/** État d'un jeu de cible (voir l'en-tête). */
export function funState(key, darts, seed = '') {
  const f = FUN[key];
  if (!f) throw new Error('jeu inconnu');
  if (f.order) return course(f.order, darts);
  if (key === 'golf') return golf(darts);
  if (key === 'shanghai') return shanghai(darts);
  if (key === 'moitie') return moitie(darts);
  if (key === 'roulette') return roulette(darts, seed);
  if (key === 'mur60') return mur60(darts);
  if (key === 'plushaut') return plushaut(darts);
  if (key === 'cent') return cent(darts);
  return killer(darts, seed);
}

/** Phrase de résultat d'un jeu de cible (fin de séance, détail). */
export function funSummary(key, fs, darts) {
  const x = fs.extra;
  const pl = (n, a, b) => `${n} ${n > 1 ? b : a}`;
  switch (key) {
    case 'serpent': case 'rebours': return fs.done ? `Parcours bouclé en ${darts} fléchettes.` : `Arrêté au ${x.reached + 1}e secteur sur 20, après ${darts} fléchettes.`;
    case 'golf': return fs.done ? `${x.total} coups sur 9 trous (par 27 : ${x.total - 27 >= 0 ? '+' : ''}${x.total - 27}).` : `${pl(x.holes.length, 'trou joué', 'trous joués')}, ${x.total} coups.`;
    case 'shanghai': return `${x.total} points${x.rounds.some(r => r.shanghai) ? `, dont un Shanghai (+100)` : ''}.`;
    case 'moitie': return `${x.total} points (départ 40)${x.rounds.some(r => r.halved) ? ` ; total divisé par deux ${pl(x.rounds.filter(r => r.halved).length, 'fois', 'fois')}` : ''}.`;
    case 'roulette': return `${x.total} points sur 90 en ${pl(x.rounds.length, 'volée', 'volées')}.`;
    case 'mur60': return `${pl(x.bricks, 'brique', 'briques')} sur ${x.rounds.length} volées (60 points ou plus).`;
    case 'plushaut': return `${pl(x.wins, 'volée réussie', 'volées réussies')} avant de perdre les 3 vies${fs.done ? '' : ' (arrêté)'}.`;
    case 'cent': return x.won ? `100 pile en ${darts} fléchettes${x.busts ? ` (${pl(x.busts, 'dépassement', 'dépassements')})` : ''}.` : `Reste ${x.remaining} à faire après ${darts} fléchettes.`;
    default: return fs.done ? `Les trois adversaires éliminés en ${darts} fléchettes (ton numéro : ${x.mine}).` : `Ton numéro : ${x.mine} ; ${pl(x.lives.filter(l => !l).length, 'adversaire éliminé', 'adversaires éliminés')}.`;
  }
}
