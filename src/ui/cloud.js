// Strela — compte invisible et synchronisation (lot 10), côté appli. Détail : docs/cloud.md.
//
// Hors ligne d'abord : l'appli ne dépend jamais du réseau. Au lancement (et au retour du réseau, au retour dans
// l'appli, à la fin d'une partie ou d'une séance), une synchronisation part en arrière-plan : compte rattaché, profil
// envoyé s'il a changé, puis (étapes suivantes du lot) amis, parties à envoyer, parties reçues. Une erreur ne bloque
// rien : elle est notée (Réglages › Compte et amis, journal) et la synchronisation suivante reprend où on en était.

import { store, saveSetting, saveCloudKey, profilePlayer, setClosedListener } from './store.js';
import { refresh } from './nav.js';
import { variant, isApk } from './native.js';
import { log } from './journal.js';
import { CLOUD_CONFIG } from '../net/cloudconfig.js';
import { supabaseClient, cloudErrorText } from '../net/supabase.js';
import { cloudAccountRecord, newCloudAccount, cleanCloudConfig, parseRecoveryCode, CLOUD_FORMAT } from '../engine/cloud.js';

/** État affiché (non enregistré) : status 'off' | 'idle' | 'sync' | 'ok' | 'offline' | 'error'. */
export const cloud = { status: 'off', error: '', busy: false, again: false, lastTry: 0, msg: '' };

/** Adresse et clé : celles de la page (tests : ?cloud=URL|CLÉ, gardées pour la session), sinon cloudconfig.js. */
export function cloudConfig() {
  try {
    const q = new URLSearchParams(location.search).get('cloud');
    if (q) sessionStorage.setItem('strela.cloud', q);
    const s = sessionStorage.getItem('strela.cloud');
    if (s) { const [url, key] = s.split('|'); const c = cleanCloudConfig({ url, key }); if (c) return c; }
  } catch (e) { /* */ }
  return cleanCloudConfig(CLOUD_CONFIG);
}

/** La synchronisation peut-elle tourner ici ? { ok, why, off } (off : coupée par le réglage). */
export function cloudSupport() {
  if (store.maquette && !store.mockCloud) return { ok: false, why: 'Maquette : rien n\'est envoyé.' };
  if (store.maquette) return store.settings.cloud === false ? { ok: false, off: true, why: 'Synchronisation coupée : rien ne part ni n\'arrive ; tout reste sur ce téléphone.' } : { ok: true, why: '' };
  if (isApk() && variant() === 'play') return { ok: false, why: 'La version Google Play de Strela n\'a pas d\'accès à Internet : amis et synchronisation sont dans la version GitHub (APK) et la version web.' };
  if (!cloudConfig()) return { ok: false, why: 'Le serveur de Strela n\'est pas encore relié à cette version : amis et synchronisation arrivent avec la prochaine.' };
  if (store.settings.cloud === false) return { ok: false, off: true, why: 'Synchronisation coupée : rien ne part ni n\'arrive ; tout reste sur ce téléphone.' };
  return { ok: true, why: '' };
}

/** Compte de ce téléphone (créé au premier besoin, rangé dans les réglages : il suit la sauvegarde). */
export function cloudAccount() {
  let a = cloudAccountRecord(store.settings.cloudAccount);
  if (!a && !store.maquette) {
    a = newCloudAccount();
    saveSetting('cloudAccount', a);
    log('cloud', `compte créé sur ce téléphone (${a.profileId.slice(0, 8)}…)`);
  }
  return a;
}

let client = null;
let clientFor = '';

function getClient() {
  const cfg = cloudConfig();
  const acct = cloudAccount();
  const k = `${cfg.url}|${cfg.key}|${acct.profileId}`;
  if (client && clientFor === k) return client;
  const auth = store.cloudAuth;
  // Une connexion d'un autre serveur est oubliée ; celle d'un autre compte (sauvegarde importée) est gardée mais
  // rattachée de nouveau (strela_compte).
  const session = auth && auth.url === cfg.url ? auth : null;
  client = supabaseClient({
    url: cfg.url, key: cfg.key, session,
    onSession: s => {
      const prev = store.cloudAuth || {};
      saveCloudKey('cloudAuth', s ? { ...s, url: cfg.url, attached: prev.userId === s.userId ? prev.attached : '' } : null);
    },
  });
  clientFor = k;
  return client;
}

const sync = () => store.cloudSync || {};
const saveSync = patch => saveCloudKey('cloudSync', { ...sync(), ...patch });

/** Rattache la connexion de ce téléphone au compte (crée le profil la première fois). */
async function attach(c) {
  const acct = cloudAccount();
  const r = await c.rpc('strela_compte', { p_profil: acct.profileId, p_secret: acct.secret });
  saveCloudKey('cloudAuth', { ...(store.cloudAuth || {}), attached: acct.profileId });
  if (r && r.code_ami) saveSync({ friendCode: r.code_ami });
  // Profil tout juste créé en ligne (premier passage, ou base reconstruite après une perte) : tout renvoyer.
  if (r && r.nouveau) saveSync({ sent: {}, profileSent: '' });
  log('cloud', `compte rattaché (${acct.profileId.slice(0, 8)}…)`);
  return r;
}

/** Appel d'une fonction du serveur ; un compte pas encore rattaché (nouvelle connexion) l'est d'abord. */
export async function call(name, args = {}) {
  const c = getClient();
  await c.ensureSession();
  if (!store.cloudAuth || store.cloudAuth.attached !== cloudAccount().profileId) await attach(c);
  try { return await c.rpc(name, args); } catch (e) {
    if (e.kind !== 'refus' || e.code !== 'sans_compte') throw e;
    await attach(c);
    return c.rpc(name, args);
  }
}

/** Mon profil tel qu'envoyé : pseudo, avatar (la photo seulement si elle n'est pas trop grosse), animation, jeux. */
export function profilePayload() {
  const me = profilePlayer();
  const av = me ? { ...me.avatar } : { kind: 'initials', color: 0 };
  if (av.kind === 'photo' && !(typeof av.photo === 'string' && av.photo.length <= 300000)) { delete av.photo; av.kind = 'initials'; }
  const jeux = (store.dartSets || []).filter(x => !x.archived).map(x => ({ ...x }));
  return { pseudo: me ? me.name : '', avatar: av, anim: (me && me.turnAnim) || null, jeux, fmt: CLOUD_FORMAT };
}

// Étapes de la synchronisation ajoutées par les étapes suivantes du lot (amis, parties, présence) : chacune reçoit
// `call` et ne lève que pour une erreur réseau ou serveur (le reste est noté au journal).
const steps = [];
export const addSyncStep = (name, fn) => { if (!steps.some(s => s.name === name)) steps.push({ name, fn }); };

/** Synchronisation complète, en arrière-plan. Une demande pendant qu'une autre tourne la relance à la fin. */
export async function syncNow(reason = '') {
  const sup = cloudSupport();
  if (store.maquette) return false;
  if (!sup.ok) { cloud.status = 'off'; return false; }
  if (cloud.busy) { cloud.again = true; return false; }
  cloud.busy = true; cloud.again = false; cloud.lastTry = Date.now();
  const was = cloud.status;
  cloud.status = 'sync';
  if (was !== 'sync') redraw();
  let ok = false;
  try {
    const me = await call('strela_mon_compte');
    if (me && me.code_ami && me.code_ami !== sync().friendCode) saveSync({ friendCode: me.code_ami });
    const payload = profilePayload();
    const key = JSON.stringify(payload);
    if (sync().profileSent !== key) { await call('strela_profil', { p: payload }); saveSync({ profileSent: key }); }
    for (const s of steps) await s.fn({ call, reason });
    saveSync({ lastSync: Date.now(), lastError: '' });
    cloud.status = 'ok'; cloud.error = '';
    ok = true;
    log('cloud', `synchronisé${reason ? ` (${reason})` : ''}`);
  } catch (e) {
    cloud.status = e && e.kind === 'reseau' ? 'offline' : 'error';
    cloud.error = cloudErrorText(e);
    saveSync({ lastError: cloud.error, lastErrorAt: Date.now() });
    log('cloud', `synchronisation interrompue${reason ? ` (${reason})` : ''} : ${cloud.error}`);
  } finally {
    cloud.busy = false;
    redraw();
  }
  if (cloud.again) { cloud.again = false; return syncNow('relance'); }
  return ok;
}

let soonTimer = null;
/** Synchronisation dans un instant (plusieurs demandes rapprochées n'en font qu'une). */
export function syncSoon(reason = '', delay = 800) {
  if (!cloudSupport().ok) return;
  clearTimeout(soonTimer);
  soonTimer = setTimeout(() => { syncNow(reason); }, delay);
}

/** Redessine seulement les écrans qui montrent l'état (jamais une partie en cours). */
function redraw() {
  try { if (/^#\/(reglages|amis|compte|joueurs|joueur\/u:)/.test(location.hash)) refresh(); } catch (e) { /* */ }
}

let started = false;
/** Au lancement de l'appli (après l'ouverture de la base). */
export function startCloud() {
  if (started || store.maquette) return;
  started = true;
  if (!cloudSupport().ok) { cloud.status = 'off'; return; }
  cloudAccount();
  setClosedListener(() => syncSoon('fin de partie', 2000)); // partie ou séance rangée : elle part chez les amis
  try {
    addEventListener('online', () => syncSoon('retour du réseau', 1500));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - cloud.lastTry > 5 * 60000) syncSoon('retour dans l\'appli');
    });
  } catch (e) { /* */ }
  syncSoon('ouverture', 1500);
}

// ------------------------------------------------------------------ Réglages › Compte et amis
/** Retrouver un compte (code de récupération tapé) : ce téléphone prend ce compte ; rien de local n'est effacé. */
export async function recoverAccount(text) {
  const r = parseRecoveryCode(text);
  if (!r) return { ok: false, msg: 'Code de récupération illisible : vérifie chaque groupe de 5 caractères.' };
  const before = store.settings.cloudAccount;
  saveSetting('cloudAccount', { ...r, createdAt: Date.now() });
  saveCloudKey('cloudAuth', store.cloudAuth ? { ...store.cloudAuth, attached: '' } : null);
  saveCloudKey('cloudSync', {});
  client = null;
  if (!cloudSupport().ok) return { ok: true, msg: 'Compte noté : il sera retrouvé dès que la synchronisation pourra tourner.' };
  try {
    await call('strela_mon_compte');
    syncSoon('compte retrouvé', 50);
    log('cloud', `compte retrouvé (${r.profileId.slice(0, 8)}…)`);
    return { ok: true, msg: 'Compte retrouvé : ses amis et ses parties reviennent avec la synchronisation.' };
  } catch (e) {
    if (e.kind === 'refus') { saveSetting('cloudAccount', before); client = null; return { ok: false, msg: `Compte non retrouvé : ${cloudErrorText(e)}.` }; }
    return { ok: true, msg: `Compte noté ; le serveur n'a pas répondu (${cloudErrorText(e)}) : il sera retrouvé à la prochaine synchronisation.` };
  }
}

/** Supprimer mes données en ligne : tout ce qui est sur le serveur ; la synchronisation se coupe, le téléphone garde tout. */
export async function deleteOnlineData() {
  try {
    await call('strela_supprimer_compte');
  } catch (e) {
    return { ok: false, msg: `Rien n'a été supprimé : ${cloudErrorText(e)}. Réessaie quand le réseau revient.` };
  }
  log('cloud', 'données en ligne supprimées ; synchronisation coupée');
  saveSetting('cloud', false);
  saveSetting('cloudAccount', null);
  await saveCloudKey('cloudAuth', null);
  await saveCloudKey('cloudSync', {});
  client = null;
  cloud.status = 'off';
  return { ok: true, msg: 'Tes données en ligne sont supprimées. Tout reste sur ce téléphone ; la synchronisation est coupée.' };
}

/** Réglage Synchronisation OUI / NON (rallumer après une suppression crée un nouveau compte). */
export function setCloudOn(on) {
  saveSetting('cloud', !!on);
  if (on) { cloudAccount(); client = null; started = false; startCloud(); syncSoon('réglage', 100); } else cloud.status = 'off';
}

/** Pour les tests : oublier le client (nouvelle configuration). */
export const resetCloudClient = () => { client = null; clientFor = ''; };
