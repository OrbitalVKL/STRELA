// Strela — amis (lot 10, étape 2) : liste reçue à chaque synchronisation, demandes envoyées et reçues, réponses.
// Un ami accepté devient un joueur du téléphone en lecture seule (store.js › applyFriends) : il s'ajoute à une partie
// comme n'importe quel joueur. Détail : docs/cloud.md « Amis ».

import { store, applyFriends, saveCloudKey, friendPlayers, profilePlayer, mergeFriend, undoMergeFriend } from './store.js';
import { mergeCandidates } from '../engine/merge.js';
import { refresh, go } from './nav.js';
import { onNative } from './native.js';
import { log } from './journal.js';
import { call, addSyncStep, cloudSupport, syncSoon } from './cloud.js';
import { cloudErrorText } from '../net/supabase.js';
import { friendFromServer, cleanFriendCode } from '../engine/cloud.js';

/** Demandes en attente (reçues, envoyées) et refusées, telles que reçues à la dernière synchronisation. */
export const pendingRequests = () => (store.cloudSync && Array.isArray(store.cloudSync.requests) ? store.cloudSync.requests : []);
export const receivedRequests = () => pendingRequests().filter(r => r.state === 'attente' && r.dir === 'recue');

/** Applique la réponse de strela_amis : amis acceptés (joueurs), demandes rangées dans « cloudSync ». */
export function applyFriendList(rows) {
  const all = (Array.isArray(rows) ? rows : []).map(friendFromServer).filter(Boolean);
  const c = applyFriends(all);
  const requests = all.filter(f => f.state !== 'acceptee');
  saveCloudKey('cloudSync', { ...(store.cloudSync || {}), requests });
  if (c.added || c.removed) log('cloud', `amis : ${c.added} ajouté(s), ${c.removed} retiré(s)`);
  return c;
}

export async function refreshFriends() {
  return applyFriendList(await call('strela_amis'));
}

addSyncStep('amis', async () => { await refreshFriends(); });

/** État de l'écran Amis (non enregistré). */
export const fr = { draft: '', busy: false, msg: '', bad: false, confirm: null, info: new Set() };

async function act(fn, ok) {
  if (!cloudSupport().ok) { fr.msg = cloudSupport().why; fr.bad = true; refresh(); return false; }
  fr.busy = true; fr.msg = ''; refresh();
  try {
    const r = await fn();
    await refreshFriends();
    fr.msg = typeof ok === 'function' ? ok(r) : ok; fr.bad = false;
    return true;
  } catch (e) {
    fr.msg = e.kind === 'refus' ? `${cloudErrorText(e)[0].toUpperCase()}${cloudErrorText(e).slice(1)}.` : `Pas envoyé : ${cloudErrorText(e)}. Réessaie quand le réseau revient.`;
    fr.bad = true;
    return false;
  } finally { fr.busy = false; refresh(); }
}

/** Envoie une demande d'ami par code (6 caractères). */
export async function requestFriend(text) {
  const code = cleanFriendCode(text);
  if (!code) { fr.msg = 'Un code d\'ami a 6 caractères (chiffres et consonnes).'; fr.bad = true; refresh(); return false; }
  if (code === (store.cloudSync || {}).friendCode) { fr.msg = 'C\'est ton propre code : donne-le à ton ami, ou tape le sien.'; fr.bad = true; refresh(); return false; }
  const done = await act(() => call('strela_demander_ami', { p_code: code }), r => {
    const f = friendFromServer(r);
    log('cloud', `demande d'ami : ${code} (${f ? f.state : '?'})`);
    return f && f.state === 'acceptee' ? `${f.name} et toi êtes amis.` : `Demande envoyée à ${f ? f.name : code} : elle attend son accord.`;
  });
  if (done) fr.draft = '';
  return done;
}

export const answerRequest = (id, yes) => act(() => call('strela_repondre_ami', { p_autre: id, p_accepter: !!yes }), () => {
  const p = store.players.find(q => q.friend === id);
  log('cloud', `demande d'ami ${yes ? 'acceptée' : 'refusée'}`);
  return yes ? `${p ? p.name : 'Ton ami'} est dans tes joueurs.` : 'Demande refusée.';
});

export const removeFriend = id => act(() => call('strela_retirer_ami', { p_autre: id }), () => {
  log('cloud', 'ami retiré');
  return 'Lien coupé. Vos parties communes restent dans ton historique.';
});

// Lien d'ami ouvert dans l'APK (strela://rejoindre/CODE à 6 caractères, page rejoindre.html du QR code).
onNative(d => {
  if (!d || typeof d.join !== 'string') return;
  const c = cleanFriendCode(d.join);
  if (c) { fr.draft = c; go(`#/amis/ajouter/${c}`); }
});

// ------------------------------------------------------------------ rattachement (étape 3)
const cs = () => store.cloudSync || {};
const saveCs = patch => saveCloudKey('cloudSync', { ...cs(), ...patch });

/** Joueurs locaux à proposer pour un ami (suggérés par le pseudo, puis les autres). */
export function candidatesFor(friend) {
  const me = profilePlayer();
  return mergeCandidates(store.players, friend.name, { meId: me ? me.id : null });
}

/** Amis à rattacher : ajoutés depuis peu (fiche « u:… »), sans décision, et ce téléphone a des joueurs locaux. */
export function mergeAsks() {
  const decided = cs().mergeDecided || {};
  return friendPlayers().filter(p => p.id.startsWith('u:') && !(p.friend in decided)).filter(p => {
    const c = candidatesFor(p);
    return c.suggested.length + c.others.length > 0;
  });
}

/** Fusions faites et encore annulables (rien n'est encore parti en ligne : étape 4, `sentAt`). */
export const mergeLog = () => (Array.isArray(cs().merges) ? cs().merges : []);
export const undoableMerge = uuid => mergeLog().find(m => m.uuid === uuid && !m.sentAt) || null;

/** Décision pour un ami : `localId` (fusion) ou null (« aucun de ces joueurs »). */
export function decideMerge(uuid, localId) {
  const decided = { ...(cs().mergeDecided || {}) };
  if (!localId) {
    decided[uuid] = 'aucun';
    saveCs({ mergeDecided: decided });
    log('cloud', `rattachement : aucun joueur local pour l'ami ${uuid.slice(0, 8)}…`);
    return { ok: true, msg: 'Noté : aucun joueur local à rattacher.' };
  }
  const local = store.players.find(p => p.id === localId);
  const friend = store.players.find(p => p.friend === uuid);
  const m = mergeFriend(localId, uuid);
  if (!m) return { ok: false, msg: 'Fusion impossible (joueur introuvable ou déjà lié).' };
  decided[uuid] = localId;
  saveCs({ mergeDecided: decided, merges: [...mergeLog().filter(x => x.uuid !== uuid), m] });
  log('cloud', `fusion : joueur local « ${local ? local.name : localId} » (${localId}) → ami « ${friend ? friend.name : '?'} » (${uuid.slice(0, 8)}…), ${m.games.length} partie(s) de la fiche d'ami reprises`);
  return { ok: true, msg: `Ton joueur « ${local ? local.name : '?'} » est maintenant ton ami ${friend ? friend.name : ''} : son historique d'ici est à son nom.` };
}

/** Annule une fusion pas encore partie en ligne ; la question sera reposée. */
export function undoMerge(uuid) {
  const m = undoableMerge(uuid);
  if (!m || !undoMergeFriend(m)) return { ok: false, msg: 'Fusion déjà partie en ligne : elle ne s\'annule plus.' };
  const decided = { ...(cs().mergeDecided || {}) };
  delete decided[uuid];
  saveCs({ mergeDecided: decided, merges: mergeLog().filter(x => x !== m && x.uuid !== uuid) });
  log('cloud', `fusion annulée : ${m.localId} ↔ ami ${uuid.slice(0, 8)}…`);
  return { ok: true, msg: 'Fusion annulée : les deux joueurs sont de nouveau séparés.' };
}

/** Après un retour au premier plan : les demandes reçues entre-temps arrivent vite. */
export const friendsSoon = () => syncSoon('amis', 300);
