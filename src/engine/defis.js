// Strela — défis de soirée (lot 9, choix de Guillaume : variante B « tirage plein écran » ; lot 7.8, retours du 20/11 :
// bandeau pendant toute la volée, six défis de plus, résultat dans le tableau de la partie). JS pur, sans DOM.
//
// Option de la partie (`g.defis`) : 'parfois' (une volée sur 8 environ) ou 'souvent' (une sur 4) ; absente = aucun
// défi. Le tirage est déterministe (empreinte de l'identifiant de la partie et du rang de la volée) : rien d'autre à
// enregistrer, et une reprise ou le recalcul des stats retrouvent les mêmes défis. Un défi porte sur la volée entière
// du joueur qui lance ; il est vérifié tout seul quand la volée est close. Le gage est indicatif : l'écran propose de le
// noter dans les verres d'un appui.
// Lot 7.8 : jeux de défis. Les parties d'avant (sans `defiSet`) tirent dans les 8 défis du lot 9 (jeu 1), pour que leurs
// défis, déjà joués, ne changent pas ; les nouvelles parties (`defiSet: 2`) tirent dans les 14. « Main gauche » ne se
// vérifie pas aux fléchettes : le joueur le déclare (`game.defiDecl` : { rang de la volée: vrai | faux }) ; non déclaré =
// raté.
import { dartValue } from './darts.js';

export const DEFI_FREQS = Object.freeze({ parfois: 8, souvent: 4 });

/** Grand écart (lot 7.8) : les cinq secteurs du haut de la cible (autour du 20) et les cinq du bas (autour du 3). */
export const TOP = Object.freeze([12, 5, 20, 1, 18]);
export const BOTTOM = Object.freeze([2, 17, 3, 19, 7]);

/**
 * Défis : texte (carte), court (rappel dans la bande du tour), ok(visite, contexte) → réussi ?, gage en cas d'échec
 * ('verre' | 'pinte' | 'tournee') ou, pour le bull, gage des autres en cas de réussite ('autres'). minRest : reste
 * minimal au début de la volée pour que le défi soit tiré (pas de « 60 ou plus » à 40 points de la fin).
 */
export const DEFIS = Object.freeze({
  triple: { text: 'UN TRIPLE, SINON UN VERRE', short: 'UN TRIPLE', say: 'un triple, sinon un verre', gage: 'verre', minRest: 60,
    ok: v => v.darts.some(d => d.multiplier === 3) },
  double: { text: 'UN DOUBLE, SINON UN VERRE', short: 'UN DOUBLE', say: 'un double, sinon un verre', gage: 'verre', minRest: 40,
    ok: v => v.darts.some(d => d.multiplier === 2) },
  vingt: { text: 'LE 20 TROIS FOIS OU UNE PINTE', short: 'LE 20 ×3', say: 'le vingt trois fois, ou une pinte', gage: 'pinte', minRest: 100,
    ok: v => v.darts.length === 3 && v.darts.every(d => d.segment === 20) },
  soixante: { text: '60 OU PLUS, SINON UN VERRE', short: '60 OU +', say: 'soixante ou plus, sinon un verre', gage: 'verre', minRest: 100,
    ok: v => !v.bust && v.scored >= 60 },
  pasdeun: { text: 'PAS UN SEUL 1, SINON UN VERRE', short: 'PAS DE 1', say: 'pas un seul un, sinon un verre', gage: 'verre', minRest: 60,
    ok: v => !v.darts.some(d => d.segment === 1) },
  bull: { text: 'UN BULL : LES AUTRES BOIVENT', short: 'UN BULL', say: 'un bull, et les autres boivent', gage: 'autres', reward: true, minRest: 60,
    ok: v => v.darts.some(d => d.segment === 25) },
  moyenne: { text: 'MIEUX QUE TA MOYENNE, SINON UN VERRE', short: '> TA MOY.', say: 'mieux que ta moyenne, sinon un verre', gage: 'verre', minRest: 100,
    ok: (v, ctx) => !v.bust && ctx.average !== null && v.scored > ctx.average },
  tournee: { text: 'MOINS DE 20 : TA TOURNÉE', short: 'PAS SOUS 20', say: 'moins de vingt, et c\'est ta tournée', gage: 'tournee', minRest: 100,
    ok: v => !v.bust && v.scored >= 20 },
  // Lot 7.8 (Guillaume, 20/11) : six défis de plus. `hint` : précision sous le texte, dans le bandeau du défi.
  gauche: { text: 'TOUTE LA VOLÉE MAIN GAUCHE, SINON UN VERRE', short: 'MAIN GAUCHE', say: 'toute la volée de la main gauche, sinon un verre',
    hint: 'À DÉCLARER À LA FIN : FAIT OU PAS FAIT', gage: 'verre', minRest: 60, declare: true,
    ok: (v, ctx) => ctx.declared === true },
  pair: { text: 'TROIS SECTEURS PAIRS, SINON UN VERRE', short: 'TOUT PAIR', say: 'trois secteurs pairs, sinon un verre',
    hint: '2 · 4 · 6 … 20 ; NI LE BULL NI À CÔTÉ', gage: 'verre', minRest: 100,
    ok: v => v.darts.length === 3 && v.darts.every(d => d.segment >= 2 && d.segment <= 20 && d.segment % 2 === 0) },
  voisin: { text: 'LE 20, PUIS LE 1 ET LE 5 : LES AUTRES BOIVENT', short: '20 · 1 · 5', say: 'le vingt, puis le un et le cinq, et les autres boivent',
    hint: 'LE 20 D\'ABORD, PUIS SES VOISINS DANS L\'ORDRE', gage: 'autres', reward: true, minRest: 100,
    ok: v => v.darts.length === 3 && v.darts[0].segment === 20 && [v.darts[1].segment, v.darts[2].segment].sort((a, b) => a - b).join() === '1,5' },
  pasvingt: { text: 'PLUS DE 40 SANS TOUCHER LE 20, SINON UN VERRE', short: '40+ SANS 20', say: 'plus de quarante sans toucher le vingt, sinon un verre',
    gage: 'verre', minRest: 100,
    ok: v => !v.bust && v.scored > 40 && !v.darts.some(d => d.segment === 20) },
  escalier: { text: 'L\'ESCALIER : TROIS VALEURS QUI MONTENT, SINON UN VERRE', short: 'ESCALIER', say: 'l\'escalier : trois valeurs qui montent, sinon un verre',
    hint: 'CHAQUE FLÉCHETTE VAUT PLUS QUE L\'AUTRE', gage: 'verre', minRest: 100,
    ok: v => !v.bust && v.darts.length === 3 && dartValue(v.darts[0]) < dartValue(v.darts[1]) && dartValue(v.darts[1]) < dartValue(v.darts[2]) },
  ecart: { text: 'GRAND ÉCART : EN HAUT PUIS EN BAS, SINON UN VERRE', short: 'GRAND ÉCART', say: 'le grand écart : un secteur du haut, puis un du bas, sinon un verre',
    hint: `HAUT : ${TOP.join(' ')} · BAS : ${BOTTOM.join(' ')}`, gage: 'verre', minRest: 100,
    ok: v => v.darts.some((d, i) => i > 0 && TOP.includes(v.darts[i - 1].segment) && BOTTOM.includes(d.segment)) },
});

/** Jeux de défis : 1 = ceux du lot 9 (parties d'avant le lot 7.8), 2 = tous. */
export const DEFI_SETS = Object.freeze({
  1: Object.freeze(['triple', 'double', 'vingt', 'soixante', 'pasdeun', 'bull', 'moyenne', 'tournee']),
  2: Object.freeze(Object.keys(DEFIS)),
});
/** Jeu des nouvelles parties. */
export const DEFI_SET = 2;
const setOf = set => DEFI_SETS[set] || DEFI_SETS[1];

/** Empreinte stable d'un texte dans [0, 1) (FNV-1a 32 bits). */
function unit(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h / 4294967296;
}

/**
 * Défi tiré pour la volée de rang `index` (rang dans state.visits, = nombre de volées closes au début de celle-ci)
 * d'une partie `gameId`, joueur parti de `rest` : clé de DEFIS ou null. Jamais la toute première volée de la partie.
 * `set` : jeu de défis de la partie (`game.defiSet`, absent = 1).
 */
export function drawDefi(gameId, index, freq, rest, set = 1) {
  const every = DEFI_FREQS[freq];
  if (!every || index < 1 || rest < 40) return null;
  if (unit(`${gameId}:${index}:tirage`) >= 1 / every) return null;
  const pool = setOf(set).filter(k => rest >= DEFIS[k].minRest);
  if (!pool.length) return null;
  return pool[Math.floor(unit(`${gameId}:${index}:defi`) * pool.length)];
}

/** Moyenne (3 fléchettes) du joueur `p` sur ses volées closes avant la volée de rang `index`, ou null. */
export function averageBefore(state, p, index) {
  const mine = state.visits.slice(0, index).filter(v => v.player === p);
  const darts = mine.reduce((n, v) => n + v.darts.length, 0);
  return darts ? (mine.reduce((n, v) => n + v.scored, 0) / darts) * 3 : null;
}

/** Défi de la volée de rang `index` de `game` (close ou non), joueur parti de `rest` : clé de DEFIS ou null. */
export const defiOf = (game, index, rest) => drawDefi(game.id, index, game.defis, rest, game.defiSet);

/** Déclaration du joueur pour la volée de rang `index` (défi « main gauche ») : true, false, ou undefined. */
export const declaredOf = (game, index) => {
  const x = game.defiDecl && game.defiDecl[index];
  return x === true || x === false ? x : undefined;
};

/**
 * Résultat du défi de la volée close de rang `index` : { key, player, ok, gage (à noter, ou null) } ou null ; un défi
 * à déclarer porte en plus `declare: true` et `declared` (true, false, ou undefined tant que rien n'est déclaré).
 */
export function defiResult(game, state, index) {
  const v = state.visits[index];
  if (!v) return null;
  const key = defiOf(game, index, v.startRemaining);
  if (!key) return null;
  const d = DEFIS[key];
  const declared = d.declare ? declaredOf(game, index) : undefined;
  const ok = !!d.ok(v, { average: averageBefore(state, v.player, index), declared });
  const gage = d.reward ? (ok ? d.gage : null) : (ok ? null : d.gage);
  return d.declare ? { key, player: v.player, ok, gage, declare: true, declared } : { key, player: v.player, ok, gage };
}

/** Défis d'une partie : [{ index, key, player, ok, gage }] (parties sans option : []). */
export function gameDefis(game, state) {
  if (!DEFI_FREQS[game.defis]) return [];
  const out = [];
  state.visits.forEach((_, i) => { const r = defiResult(game, state, i); if (r) out.push({ index: i, ...r }); });
  return out;
}
