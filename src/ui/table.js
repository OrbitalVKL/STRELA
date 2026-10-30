// Strela — historique en tableau (lot 1.2), sans DOM (testé) : pour une manche, une colonne par joueur dans l'ordre
// où ils lancent dans cette manche (le premier lanceur en tête) et une ligne par tour. Sert au panneau de la partie
// en cours et au détail d'une partie terminée (screens/history.js).
//
// Un tour = une volée de chaque joueur. La case d'une volée : total, reste après la volée, bust, finition ; dans
// la partie en cours, la volée commencée (même vide) occupe la case du joueur qui lance, et sa ligne est le tour en
// cours.
import { formatDart } from '../engine/darts.js';

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

// ------------------------------------------------------------------ contenu d'une case (lot 1.3)
const DART = d => { const f = formatDart(d); return f.replace(/^S/, ''); };
const attr = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/**
 * Ce qu'une case montre, dans l'ordre de lecture : les fléchettes du tour (« T20 », « 5 », « 0 » pour un raté), le
 * total en gros, le reste en petit. Bust : « BUST » en gros (la fléchette fautive barrée), reste inchangé ; finition :
 * « GAGNÉ » ; volée commencée : « 2/3 » ou « À JOUER ».
 *   Renvoie { cls, darts: [texte], faulty (rang de la fléchette fautive ou -1), big, small, label }
 */
export function cellView(c) {
  const darts = c.darts.map(DART);
  const n = darts.length;
  return {
    cls: c.open ? 'open' : c.bust ? 'bust' : c.finish ? 'fin' : '',
    darts,
    faulty: c.bust ? n - 1 : -1,
    big: c.bust ? 'BUST' : c.open && !n ? '…' : String(c.total),
    small: c.finish ? 'GAGNÉ' : c.open ? (n ? `${n}/3` : 'À JOUER') : String(c.remaining),
    label: `${n ? `${darts.join(', ')} : ` : ''}${c.bust ? `bust, reste ${c.remaining}` : c.finish ? `${c.total}, manche gagnée` : c.open ? `volée en cours, ${c.total}` : `${c.total}, reste ${c.remaining}`}`,
  };
}

/**
 * HTML d'une case (null : case vide). `key` = « idPartie|rangVolée » (appui → fléchettes sur la cible).
 * Les fléchettes tiennent toujours en entier : si la ligne déborde (case étroite, 5 à 8 joueurs, grande police),
 * fit.js resserre les séparateurs, puis passe à la ligne, puis rapetisse (paliers fit1 … fit3 de .ds).
 */
export function cellHtml(c, { key = '', selected = false } = {}) {
  if (!c) return '<td class="c none"></td>';
  const v = cellView(c);
  const darts = v.darts.map((d, i) => `<i${i === v.faulty ? ' class="x"' : ''}>${d}</i>`).join('');
  return `<td class="c ${v.cls}${selected ? ' sel' : ''}" data-act="log-visit" data-arg="${attr(key)}" aria-label="${attr(v.label)}">`
    + `<span class="ds"${v.darts.length ? ' data-fit="3"' : ''}>${darts}</span><b>${v.big}</b><small>${v.small}</small></td>`;
}
