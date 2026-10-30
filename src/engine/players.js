// Strela — suppression d'un joueur, JS pur (sans dépendance ni affichage).
//
// Effet : la fiche du joueur disparaît, et avec elle ses statistiques (elles ne se calculent que par identifiant).
// Ses parties jouées avec d'autres restent : son identifiant y est remplacé par un identifiant anonyme
// « ~<rang> » (rang dans l'ordre de jeu, donc unique dans la partie). L'interface l'affiche « Joueur supprimé »
// avec un avatar neutre ; les volées, les vainqueurs et les statistiques des autres restent justes, mais il
// n'apparaît plus comme adversaire dans les face-à-face. Une partie où il ne reste aucun joueur connu
// (jouée seul par lui) disparaît.
//
// Forme des données inchangée : joueur { id, name, avatar, archived }, partie { id, startedAt, config, darts[],
// abandoned } ; seul `config.players` change. Le lot 2 enregistre tel quel le résultat de deletePlayer().

export const DELETED_PREFIX = '~';

/** Vrai pour un identifiant anonyme de joueur supprimé. */
export const isDeletedId = id => typeof id === 'string' && id.startsWith(DELETED_PREFIX);

/** Identifiant anonyme du joueur de rang `rank` dans une partie. */
export const deletedId = rank => `${DELETED_PREFIX}${rank}`;

/** Ce que la suppression ferait : parties gardées (anonymisées) et parties effacées. */
export function deletionImpact(games, playerId) {
  const kept = [];
  const removed = [];
  for (const g of games) {
    if (!g.config.players.includes(playerId)) continue;
    const others = g.config.players.filter(id => id !== playerId && !isDeletedId(id));
    (others.length ? kept : removed).push(g.id);
  }
  return { kept, removed };
}

/**
 * Supprime un joueur : nouvelles listes { players, games } (les entrées ne sont pas modifiées),
 * plus { kept, removed } (identifiants des parties anonymisées / effacées).
 */
export function deletePlayer(players, games, playerId) {
  const { kept, removed } = deletionImpact(games, playerId);
  const gone = new Set(removed);
  const out = [];
  for (const g of games) {
    if (gone.has(g.id)) continue;
    const rank = g.config.players.indexOf(playerId);
    if (rank < 0) { out.push(g); continue; }
    const ids = [...g.config.players];
    ids[rank] = deletedId(rank);
    out.push({ ...g, config: { ...g.config, players: ids } });
  }
  return { players: players.filter(p => p.id !== playerId), games: out, kept, removed };
}
