// Strela — synchronisation des parties et séances (lot 10, étape 4), JS pur (tests/synchro.test.js).
//
// Le téléphone reste maître : ses parties gardent leurs identifiants de joueurs locaux. À l'envoi, la partie part
// telle quelle avec deux tables : `links` (identifiant local → UUID du profil, pour moi et mes amis) et `names`
// (pseudo et avatar des joueurs sans compte, pour que les autres les affichent). À la réception, chaque UUID connu
// redevient l'identifiant local qui le porte ici (mon profil, l'ami — fusionné ou non) ; un UUID inconnu (ami d'un
// ami) devient « u:<uuid> » et les joueurs sans compte gardent l'identifiant de leur téléphone, tous deux rangés en
// joueurs distants (comme les adversaires en ligne du lot 9.2).

import { CLOUD_FORMAT, isUuid } from './cloud.js';

/** Empreinte d'une valeur (FNV-1a 32 bits sur son JSON) : ce qui a déjà été envoyé tel quel n'est pas renvoyé. */
export function fingerprint(x) {
  const s = JSON.stringify(x);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${s.length.toString(36)}.${h.toString(36)}`;
}

/** Joueurs d'un enregistrement : partie (config.players) ou séance (player). */
export const recordPlayers = (rec, kind) => (kind === 'training' ? [rec.player] : rec.config.players);

/** Copie de l'enregistrement où chaque identifiant de joueur passe par `map` (objet ancien → nouveau). */
export function mapRecordIds(rec, kind, map) {
  const m = id => (Object.prototype.hasOwnProperty.call(map, id) ? map[id] : id);
  if (kind === 'training') return { ...rec, player: m(rec.player) };
  const out = { ...rec, config: { ...rec.config, players: rec.config.players.map(m) } };
  for (const k of ['drinks', 'drinksBefore', 'drinksRaw', 'drinksTournee']) {
    if (rec[k] && typeof rec[k] === 'object') out[k] = Object.fromEntries(Object.entries(rec[k]).map(([id, v]) => [m(id), v]));
  }
  if (rec.online && typeof rec.online === 'object') out.online = { ...rec.online, me: m(rec.online.me), host: m(rec.online.host) };
  return out;
}

/** Type en ligne : soirée, en ligne (lot 9.2), entraînement. */
export const cloudType = (rec, kind) => (kind === 'training' ? 'entrainement' : rec.online ? 'enligne' : 'soiree');

/**
 * Ligne envoyée à strela_envoyer : { id, type, jeu, fmt, etat, debut, fin, donnees, joueurs }.
 *   ctx.links : { identifiant local → UUID } ; ctx.names : { identifiant local → { name, avatar } }
 */
export function toCloud(rec, kind, { links = {}, names = {} } = {}) {
  const ids = recordPlayers(rec, kind);
  const l = {}, n = {};
  for (const id of ids) {
    if (links[id]) l[id] = links[id];
    else if (names[id]) n[id] = names[id];
  }
  const { ui, owner, cloudMaj, ...clean } = rec;
  return {
    id: rec.id,
    type: cloudType(rec, kind),
    jeu: kind === 'training' ? String(rec.exercise || '') : rec.config.game === 'cricket' ? 'cricket' : 'x01',
    fmt: CLOUD_FORMAT,
    etat: rec.abandoned || rec.stopped ? 'abandonnee' : 'terminee',
    debut: rec.startedAt,
    fin: rec.endedAt ?? rec.startedAt,
    donnees: { kind, rec: clean, links: l, names: n },
    joueurs: ids.map((id, i) => ({ ordre: i, ...(l[id] ? { profil: l[id] } : {}), local: id })),
  };
}

/**
 * Ligne reçue de strela_recevoir → ce qu'il faut faire ici :
 *   { action: 'delete', id } | { action: 'tooNew', id, fmt } | { action: 'skip', id, why }
 *   | { action: 'put', id, kind, rec (identifiants traduits, `owner` = créateur sauf si c'est moi), remotes: [{ id, name, avatar }] }
 *   ctx.me : mon UUID ; ctx.meLocal : identifiant local du joueur de mon profil ; ctx.friends : { UUID → identifiant local }
 */
export function fromCloud(row, { me, meLocal = null, friends = {} } = {}) {
  if (!row || typeof row.id !== 'string') return { action: 'skip', id: null, why: 'illisible' };
  const id = row.id;
  if (row.etat === 'supprimee') return { action: 'delete', id, createur: row.createur };
  if (Number.isInteger(row.fmt) && row.fmt > CLOUD_FORMAT) return { action: 'tooNew', id, fmt: row.fmt };
  const d = row.donnees;
  if (!d || typeof d !== 'object' || !d.rec || typeof d.rec !== 'object' || (d.kind !== 'game' && d.kind !== 'training')) return { action: 'skip', id, why: 'illisible' };
  const kind = d.kind;
  const rec = d.rec;
  if (rec.id !== id) return { action: 'skip', id, why: 'identifiant' };
  const ids = kind === 'training' ? [rec.player] : (rec.config && Array.isArray(rec.config.players) ? rec.config.players : null);
  if (!ids || ids.some(x => typeof x !== 'string' || !x)) return { action: 'skip', id, why: 'joueurs' };
  const links = d.links && typeof d.links === 'object' ? d.links : {};
  const names = d.names && typeof d.names === 'object' ? d.names : {};
  const map = {};
  const remotes = [];
  for (const x of ids) {
    const uuid = isUuid(links[x]) ? links[x] : null;
    if (uuid && uuid === me && meLocal) map[x] = meLocal;
    else if (uuid && friends[uuid]) map[x] = friends[uuid];
    else if (uuid) { map[x] = `u:${uuid}`; remotes.push({ id: `u:${uuid}`, name: (names[x] && names[x].name) || '?', avatar: names[x] && names[x].avatar }); }
    else remotes.push({ id: x, name: (names[x] && typeof names[x].name === 'string' && names[x].name) || 'Joueur', avatar: names[x] && names[x].avatar });
  }
  const out = mapRecordIds(rec, kind, map);
  const mine = row.createur === me;
  if (!mine && isUuid(row.createur)) out.owner = row.createur;
  else delete out.owner;
  if (Number.isFinite(row.maj)) out.cloudMaj = row.maj;
  return { action: 'put', id, kind, rec: out, remotes, mine };
}
