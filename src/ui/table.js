// Strela — historique en tableau (lot 1.2), sans DOM (testé) : pour une manche, une colonne par joueur dans l'ordre
// où ils lancent dans cette manche (le premier lanceur en tête) et une ligne par tour. Sert au panneau de la partie
// en cours et au détail d'une partie terminée (screens/history.js).
//
// Un tour = une volée de chaque joueur. La case d'une volée : total, reste après la volée, bust, finition ; dans
// la partie en cours, la volée commencée (même vide) occupe la case du joueur qui lance, et sa ligne est le tour en
// cours.

/**
 * Tableau d'une manche.
 *   state : état X01 recalculé (computeState) ; legNumber : 1, 2… ; live : partie en cours (volée commencée montrée)
 * Renvoie { number, columns: [rang du joueur], rows: [{ round, cells: [case | null] }], currentRound (ou null), winner }
 *   case = { visitIdx (rang dans state.visits, ou 'open'), player, darts, total, remaining, bust, finish, open }
 */
export function legTable(state, legNumber, { live = false } = {}) {
  const leg = state.legs.find(l => l.number === legNumber);
  if (!leg) return null;
  const n = state.config.players.length;
  const columns = Array.from({ length: n }, (_, k) => (leg.starter + k) % n);
  const col = p => columns.indexOf(p);
  const rows = [];
  const count = new Array(n).fill(0); // volées déjà placées par joueur
  const put = (p, cell) => {
    const r = count[p]++;
    while (rows.length <= r) rows.push({ round: rows.length + 1, cells: new Array(n).fill(null) });
    rows[r].cells[col(p)] = cell;
    return r + 1;
  };
  for (const v of leg.visits) {
    put(v.player, {
      visitIdx: state.visits.indexOf(v),
      player: v.player,
      darts: v.darts,
      total: v.total,
      remaining: v.remainingAfter,
      bust: v.bust,
      finish: v.finish,
      open: false,
    });
  }
  let currentRound = null;
  if (live && state.status === 'playing' && state.legNumber === legNumber && state.visit) {
    const v = state.visit;
    currentRound = put(v.player, {
      visitIdx: 'open', player: v.player, darts: v.darts, total: v.total,
      remaining: v.startRemaining - v.total, bust: false, finish: false, open: true,
    });
  }
  return { number: legNumber, columns, rows, currentRound, winner: leg.winner };
}
