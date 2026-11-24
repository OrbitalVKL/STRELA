// Strela — rattachement d'un joueur local à un ami (lot 10, étape 3), JS pur (tests/rattachement.test.js).
//
// Cas : Tsia existe en joueur local sur ce téléphone (avec tout son historique) ; elle installe Strela et devient
// amie. On propose « Ce joueur de ta liste locale, c'est elle ? » (pseudo identique ou proche d'abord). Confirmé : le
// joueur local garde son identifiant (donc tout son historique) et devient l'ami (champ `friend`) ; la fiche « u:<uuid> »
// créée à l'acceptation disparaît, et les quelques parties jouées avec elle entre-temps passent à l'identifiant local.
// À l'envoi (étape 4), toutes ses parties partent avec l'identifiant de son profil : elles apparaissent chez elle.

/** Pseudo réduit pour comparer : minuscules, sans accents ni ce qui n'est pas lettre ou chiffre. */
export const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/**
 * Proximité de deux pseudos : 0 identique (sans casse ni accents), 1 l'un commence par l'autre (3 lettres au moins),
 * 2 une ou deux lettres de différence (pseudos de 4 lettres au moins), null sinon.
 */
export function nameScore(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return null;
  if (x === y) return 0;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (s.length >= 3 && l.startsWith(s)) return 1;
  if (s.length >= 4 && lev(x, y) <= (s.length >= 7 ? 2 : 1)) return 2;
  return null;
}

/**
 * Joueurs locaux à proposer pour un ami : { suggested: [joueurs proches, les plus proches d'abord], others: [le reste] }.
 * Jamais : le joueur du profil, un autre ami, un adversaire en ligne.
 */
export function mergeCandidates(players, friendName, { meId = null } = {}) {
  const pool = players.filter(p => !p.friend && !p.remote && p.id !== meId && !String(p.id).startsWith('u:'));
  const scored = pool.map(p => ({ p, s: nameScore(p.name, friendName) }));
  const suggested = scored.filter(x => x.s !== null).sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name, 'fr')).map(x => x.p);
  const others = scored.filter(x => x.s === null).map(x => x.p).sort((a, b) => (!!a.archived - !!b.archived) || a.name.localeCompare(b.name, 'fr'));
  return { suggested, others };
}

const renameKeys = (obj, from, to) => {
  if (!obj || typeof obj !== 'object' || !(from in obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k === from ? to : k] = v;
  return out;
};

/**
 * Remplace un identifiant de joueur par un autre dans une partie (joueurs, verres et tout ce qui est rangé par joueur).
 * Renvoie la partie modifiée (copie), ou la même si elle ne contient pas ce joueur. Refuse si `to` y est déjà
 * (deux fois le même joueur dans une partie) : renvoie null.
 */
export function rewireGame(g, from, to) {
  if (!g || !g.config || !Array.isArray(g.config.players) || !g.config.players.includes(from)) return g;
  if (g.config.players.includes(to)) return null;
  const next = { ...g, config: { ...g.config, players: g.config.players.map(id => (id === from ? to : id)) } };
  for (const k of ['drinks', 'drinksBefore', 'drinksRaw', 'drinksTournee']) if (g[k]) next[k] = renameKeys(g[k], from, to);
  if (g.online && typeof g.online === 'object') {
    next.online = { ...g.online };
    if (next.online.me === from) next.online.me = to;
    if (next.online.host === from) next.online.host = to;
  }
  return next;
}

/** Séance d'entraînement : son joueur. */
export const rewireTraining = (r, from, to) => (r && r.player === from ? { ...r, player: to } : r);
