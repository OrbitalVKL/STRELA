// Strela — synchronisation des parties et séances (lot 10, étape 4), côté appli. Moteur pur : src/engine/sync.js.
//
// À chaque synchronisation (ouverture, fin de partie ou de séance, retour du réseau, bouton), après les amis :
//   1. envoi de ce qui a changé ici (empreinte différente de celle déjà envoyée : `cloudSync.sent`) — parties et
//      séances créées sur ce téléphone, jamais celles reçues, jamais la copie d'un invité d'une partie en ligne
//      (l'hôte l'envoie) ;
//   2. suppressions faites ici et déjà parties (`cloudSync.deleted`) ;
//   3. réception depuis le curseur (`cloudSync.cursor` : maj en µs et identifiant de la dernière reçue), tout depuis
//      le début quand un ami arrive ou que le format connu augmente.
// Rien n'est perdu si le réseau tombe au milieu : ce qui n'a pas été confirmé repart la fois suivante.

import { store, saveCloudKey, profilePlayer, applyReceived, friendPlayers, finishedOpenTraining } from './store.js';
import { addSyncStep, cloudAccount } from './cloud.js';
import { log } from './journal.js';
import { toCloud, fromCloud, fingerprint } from '../engine/sync.js';
import { CLOUD_FORMAT } from '../engine/cloud.js';

const cs = () => store.cloudSync || {};
/** 0.24.1 : version de la reprise complète faite une fois (monter ce nombre = tout recevoir de nouveau chez tous). */
export const RESYNC = 1;
const saveCs = patch => saveCloudKey('cloudSync', { ...cs(), ...patch });

/** Identifiant local → UUID (mon profil, mes amis) ; pseudo et avatar (sans photo) des autres joueurs. */
export function shareContext(me) {
  const links = {};
  const names = {};
  const mine = profilePlayer();
  if (mine) links[mine.id] = me;
  for (const p of store.players) {
    if (p.friend) links[p.id] = p.friend;
    else if (!links[p.id]) {
      const av = { ...(p.avatar || {}) };
      if (av.kind === 'photo') { delete av.photo; av.kind = 'initials'; }
      names[p.id] = { name: p.name, avatar: av };
    }
  }
  return { links, names };
}

/** Ce que ce téléphone envoie : [{ rec, kind }] (créé ici, clos). */
export function ownRecords() {
  const games = [...store.games, ...store.ckGames].filter(g => !g.owner && !(g.online && g.online.role === 'guest'));
  const trs = store.trainings.filter(r => !r.owner && Number.isFinite(r.endedAt));
  // 0.24.1 : une séance finie mais restée ouverte (écran de fin, appli quittée sans TERMINER) part aussi.
  const open = finishedOpenTraining();
  if (open) trs.push(open);
  return [...games.map(rec => ({ rec, kind: 'game' })), ...trs.map(rec => ({ rec, kind: 'training' }))];
}

/** Lignes à envoyer (empreinte changée) : [{ row, fp }]. */
export function pendingUploads(me) {
  const sent = cs().sent || {};
  const ctx = shareContext(me);
  const out = [];
  for (const { rec, kind } of ownRecords()) {
    const row = toCloud(rec, kind, ctx);
    const fp = fingerprint(row);
    if (sent[rec.id] !== fp && sent[rec.id] !== `refus:${fp}`) out.push({ row, fp });
  }
  return out;
}

/** Nombre de parties et séances en attente d'envoi (Réglages). */
export function pendingCount() {
  const a = cloudAccount();
  return a ? pendingUploads(a.profileId).length + (cs().deleted || []).length : 0;
}

const what = row => (row && row.type === 'entrainement' ? 'séance' : 'partie');

async function upload(call, me) {
  const todo = pendingUploads(me);
  if (!todo.length) return 0;
  let n = 0, nt = 0, missing = 0;
  for (let i = 0; i < todo.length; i += 20) {
    const chunk = todo.slice(i, i + 20);
    const r = await call('strela_envoyer', { p_parties: chunk.map(x => x.row) });
    const sent = { ...(cs().sent || {}) };
    const ok = new Set((r && r.ok) || []);
    const refused = new Set((r && r.refusees) || []);
    for (const x of chunk) {
      if (ok.has(x.row.id)) { sent[x.row.id] = x.fp; n++; if (x.row.type === 'entrainement') nt++; } else if (refused.has(x.row.id)) sent[x.row.id] = `refus:${x.fp}`;
      else missing++;
    }
    saveCs({ sent });
    for (const x of chunk) if (refused.has(x.row.id)) log('cloud', `envoi refusé : ${what(x.row)} ${x.row.id} (créée par un autre compte)`);
  }
  log('cloud', `envoi : ${n - nt} partie(s), ${nt} séance(s)${missing ? ` ; ${missing} sans réponse (repartent la fois suivante)` : ''}`);
  return n;
}

async function deletions(call) {
  const ids = cs().deleted || [];
  if (!ids.length) return 0;
  await call('strela_supprimer', { p_ids: ids });
  const sent = { ...(cs().sent || {}) };
  for (const id of ids) delete sent[id];
  saveCs({ deleted: (cs().deleted || []).filter(id => !ids.includes(id)), sent });
  log('cloud', `suppression propagée : ${ids.length} partie(s)`);
  return ids.length;
}

async function receive(call, me) {
  let cursor = cs().cursor && typeof cs().cursor === 'object' ? cs().cursor : { maj: 0, id: '' };
  // Tout reprendre : nouvel ami (son historique est plus ancien que le curseur), format plus récent désormais lisible.
  const friendsKey = friendPlayers().map(p => p.friend).sort().join(',');
  const tooNew = cs().tooNew || null;
  // 0.24.1 : `resync` (RESYNC) — tout reprendre une fois pour les liens d'avant (séances d'un ami restées sur une
  // ancienne fiche) ; `full` : bouton RESYNCHRONISER de la fiche d'un ami. Rien en double : chaque reçue remplace la
  // copie d'ici de même identifiant.
  const full = cs().full || (cs().resync || 0) < RESYNC;
  if (full || cs().friendsKey !== friendsKey || (tooNew && tooNew <= CLOUD_FORMAT)) cursor = { maj: 0, id: '' };
  const me0 = profilePlayer();
  const friends = Object.fromEntries(friendPlayers().map(p => [p.friend, p.id]));
  let total = 0, newer = 0, games = 0, trs = 0, deleted = 0;
  const byFriend = {};
  for (let page = 0; page < 50; page++) {
    const r = await call('strela_recevoir', { p_depuis: cursor.maj, p_apres_id: cursor.id });
    const rows = (r && Array.isArray(r.parties)) ? r.parties : [];
    const items = rows.map(row => fromCloud(row, { me, meLocal: me0 ? me0.id : null, friends }));
    newer += items.filter(x => x.action === 'tooNew').length;
    const c = applyReceived(items);
    total += c.put + c.deleted;
    games += c.games; trs += c.trainings; deleted += c.deleted;
    for (const row of rows) if (row.createur !== me && row.type === 'entrainement' && row.etat !== 'supprimee') byFriend[row.createur] = (byFriend[row.createur] || 0) + 1;
    for (const x of c.skipped) log('cloud', `réception rejetée : ${x.kind === 'training' ? 'séance' : x.kind === 'game' ? 'partie' : 'ligne'} ${x.id || '?'} (${x.why})`);
    if (rows.length) { const last = rows[rows.length - 1]; cursor = { maj: last.maj, id: last.id }; }
    saveCs({ cursor, friendsKey });
    if (!rows.length || (r && r.complet)) break;
  }
  saveCs({ tooNew: newer ? CLOUD_FORMAT + 1 : null, tooNewCount: newer, resync: RESYNC, full: false, ...(full ? { fullAt: Date.now() } : {}) });
  if (total) log('cloud', `réception : ${games} partie(s), ${trs} séance(s)${deleted ? `, ${deleted} suppression(s)` : ''}${full ? ' (tout repris)' : ''}`);
  for (const [uuid, k] of Object.entries(byFriend)) {
    const p = store.players.find(q => q.friend === uuid);
    if (p) log('cloud', `séances en ligne de « ${p.name} » vues : ${k}${full ? ' (toutes)' : ' (nouvelles)'}`);
  }
  return total;
}

/** Fusions (étape 3) devenues définitives : leurs parties sont parties. */
function sealMerges() {
  const merges = Array.isArray(cs().merges) ? cs().merges : [];
  if (!merges.some(m => !m.sentAt)) return;
  saveCs({ merges: merges.map(m => (m.sentAt ? m : { ...m, sentAt: Date.now() })) });
}

addSyncStep('parties', async ({ call }) => {
  const me = cloudAccount().profileId;
  // Compte changé (sauvegarde importée, compte retrouvé, base reconstruite) : tout repart de zéro pour ce compte.
  if (cs().syncFor !== me) saveCs({ syncFor: me, sent: {}, deleted: [], cursor: { maj: 0, id: '' } });
  // 0.24.1 : une fois, tout renvoyer (rattrapage : une séance qui n'était jamais partie part maintenant ; le serveur
  // remplace chaque ligne de même identifiant, rien en double).
  if ((cs().resent || 0) < RESYNC) { saveCs({ sent: {}, resent: RESYNC }); log('cloud', 'rattrapage : tout est renvoyé une fois'); }
  await upload(call, me);
  await deletions(call);
  if (!pendingUploads(me).length) sealMerges();
  await receive(call, me);
});

/** Base en ligne reconstruite (strela_compte répond « nouveau ») : tout renvoyer. */
export const resendAll = () => saveCs({ sent: {} });

/** 0.24.1 : RESYNCHRONISER (fiche d'un ami) — tout renvoyer et tout recevoir de nouveau à la prochaine passe. */
export const resyncAll = () => { saveCs({ sent: {}, full: true }); log('cloud', 'resynchronisation complète demandée'); };

/** Séances d'un ami reçues sur ce téléphone (fiche de l'ami). */
export const friendTrainingCount = p => [...store.trainings, ...store.friendTrainings].filter(r => r.player === p.id && r.owner === p.friend).length;
/** Dernière reprise complète, dernière synchronisation de ce téléphone. */
export const fullSyncAt = () => cs().fullAt || null;
