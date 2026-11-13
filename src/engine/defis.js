// Strela — défis de soirée (lot 9, choix de Guillaume : variante B « tirage plein écran »). JS pur, sans DOM.
//
// Option de la partie (`g.defis`) : 'parfois' (une volée sur 8 environ) ou 'souvent' (une sur 4) ; absente = aucun
// défi. Le tirage est déterministe (empreinte de l'identifiant de la partie et du rang de la volée) : rien d'autre à
// enregistrer, et une reprise ou le recalcul des stats retrouvent les mêmes défis. Un défi porte sur la volée entière
// du joueur qui lance ; il est vérifié tout seul quand la volée est close. Le gage est indicatif : l'écran propose de le
// noter dans les verres d'un appui.

export const DEFI_FREQS = Object.freeze({ parfois: 8, souvent: 4 });

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
});
const KEYS = Object.keys(DEFIS);

/** Empreinte stable d'un texte dans [0, 1) (FNV-1a 32 bits). */
function unit(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h / 4294967296;
}

/**
 * Défi tiré pour la volée de rang `index` (rang dans state.visits, = nombre de volées closes au début de celle-ci)
 * d'une partie `gameId`, joueur parti de `rest` : clé de DEFIS ou null. Jamais la toute première volée de la partie.
 */
export function drawDefi(gameId, index, freq, rest) {
  const every = DEFI_FREQS[freq];
  if (!every || index < 1 || rest < 40) return null;
  if (unit(`${gameId}:${index}:tirage`) >= 1 / every) return null;
  const pool = KEYS.filter(k => rest >= DEFIS[k].minRest);
  if (!pool.length) return null;
  return pool[Math.floor(unit(`${gameId}:${index}:defi`) * pool.length)];
}

/** Moyenne (3 fléchettes) du joueur `p` sur ses volées closes avant la volée de rang `index`, ou null. */
export function averageBefore(state, p, index) {
  const mine = state.visits.slice(0, index).filter(v => v.player === p);
  const darts = mine.reduce((n, v) => n + v.darts.length, 0);
  return darts ? (mine.reduce((n, v) => n + v.scored, 0) / darts) * 3 : null;
}

/** Résultat du défi de la volée close de rang `index` : { key, player, ok, gage (à noter, ou null) } ou null. */
export function defiResult(game, state, index) {
  const v = state.visits[index];
  if (!v) return null;
  const key = drawDefi(game.id, index, game.defis, v.startRemaining);
  if (!key) return null;
  const d = DEFIS[key];
  const ok = !!d.ok(v, { average: averageBefore(state, v.player, index) });
  const gage = d.reward ? (ok ? d.gage : null) : (ok ? null : d.gage);
  return { key, player: v.player, ok, gage };
}

/** Défis d'une partie : [{ index, key, player, ok, gage }] (parties sans option : []). */
export function gameDefis(game, state) {
  if (!DEFI_FREQS[game.defis]) return [];
  const out = [];
  state.visits.forEach((_, i) => { const r = defiResult(game, state, i); if (r) out.push({ index: i, ...r }); });
  return out;
}
