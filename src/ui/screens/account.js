// Strela — Réglages › Compte et amis (lot 10, docs/cloud.md) : état de la synchronisation, code d'ami, présence,
// et l'écran #/compte (code de récupération, retrouver un compte, supprimer ses données en ligne).

import { store, saveSetting } from '../store.js';
import { esc, ico, topBar } from '../dom.js';
import { refresh } from '../nav.js';
import { cloud, cloudSupport, syncNow, recoverAccount, deleteOnlineData, setCloudOn } from '../cloud.js';
import { cloudAccountRecord, recoveryCode, agoText } from '../../engine/cloud.js';

const acc = { info: new Set(), showCode: false, draft: '', msg: '', confirm: false, busy: false, copied: false };
export const presetAccount = (state = {}) => { Object.assign(acc, { info: new Set(), showCode: false, draft: '', msg: '', confirm: false, busy: false, copied: false }, state); };

const toggle = (act, on, disabled = false) => `<div class="toggle">
  <button type="button" data-act="${act}" data-arg="1" aria-pressed="${on}" ${disabled ? 'disabled' : ''}>OUI</button>
  <button type="button" data-act="${act}" data-arg="0" aria-pressed="${!on}" ${disabled ? 'disabled' : ''}>NON</button></div>`;
const srow = (act, title, desc, on, disabled = false) => `<div class="row"><div class="lbl"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</div>${toggle(act, on, disabled)}</div>`;
const ibtn = key => `<button type="button" class="ibtn" data-act="acc-info" data-arg="${key}" aria-pressed="${acc.info.has(key)}" aria-label="Explication">${ico('info')}</button>`;
const ibox = (key, text) => (acc.info.has(key) ? `<p class="infobox" role="note">${text}</p>` : '');

/** État de la synchronisation en clair. */
export function syncLine() {
  const sup = cloudSupport();
  if (!sup.ok) return sup.off ? 'Coupée' : 'Indisponible';
  if (cloud.status === 'sync') return 'En cours…';
  if (cloud.status === 'offline') return 'Hors ligne : reprise au retour du réseau';
  if (cloud.status === 'error') return `Interrompue : ${cloud.error}`;
  const s = store.cloudSync || {};
  if (s.lastError && !s.lastSync) return `Pas encore faite : ${s.lastError}`;
  return s.lastSync ? 'À jour' : 'Pas encore faite';
}

const CARD_TEXT = 'Strela te donne un compte sans e-mail ni mot de passe : un identifiant tiré sur ce téléphone, rangé avec tes réglages (il suit donc la sauvegarde). Avec tes amis, tout est partagé d\'office : parties de soirée et en ligne, séances d\'entraînement, stats et badges. Ce téléphone reste maître : tout marche sans réseau, et ce qui doit partir part dès que le réseau revient (à l\'ouverture, à la fin d\'une partie ou d\'une séance). <b>Présence</b> : tes amis voient si l\'appli est ouverte et si tu joues.';

/** Carte des Réglages. */
export function accountCard() {
  const sup = cloudSupport();
  const a = cloudAccountRecord(store.settings.cloudAccount);
  const s = store.cloudSync || {};
  const head = `<h2>${ico('sync')}<span>Compte et amis</span>${ibtn('compte')}</h2>${ibox('compte', CARD_TEXT)}`;
  if (!sup.ok && !sup.off) return `<section class="card2" id="compte">${head}<p class="note">${esc(sup.why)}</p></section>`;
  const on = sup.ok;
  return `<section class="card2" id="compte">${head}
    ${on ? `<div class="kv"><span>Mon code d'ami</span><b class="code">${esc(s.friendCode || '…')}</b></div>
    <div class="kv"><span>Identifiant</span><b class="small">${esc(a ? a.profileId.slice(0, 8).toUpperCase() : '—')}</b></div>
    <div class="kv"><span>Synchronisation</span><b class="small ell">${esc(syncLine())}</b></div>
    <div class="kv"><span>Dernière</span><b class="small">${esc(agoText(s.lastSync))}</b></div>
    <button type="button" class="btn ghost" data-act="acc-sync" ${cloud.busy ? 'disabled' : ''}>${ico('sync')} ${cloud.busy ? 'SYNCHRONISATION…' : 'SYNCHRONISER MAINTENANT'}</button>` : `<p class="note">${esc(sup.why)}</p>`}
    <div class="rows">
      ${srow('acc-cloud', 'Synchronisation', on ? 'Partage avec tes amis' : 'Rallumer crée un nouveau compte si l\'ancien a été supprimé', on)}
      ${srow('acc-presence', 'Présence visible', 'Tes amis voient quand l\'appli est ouverte', store.settings.presence !== false, !on)}
    </div>
    <a class="lrow" href="#/compte">${ico('wrench')}<span><b>Mon compte</b><small>Code de récupération, autre téléphone, suppression</small></span>${ico('chev')}</a>
  </section>`;
}

/** Écran #/compte. */
export function accountScreen() {
  const sup = cloudSupport();
  const a = cloudAccountRecord(store.settings.cloudAccount);
  const code = a ? recoveryCode(a) : null;
  return `<div class="screen account">${topBar('Mon compte', '#/reglages')}
    <div class="pad">
      ${!sup.ok ? `<p class="note">${esc(sup.why)}</p>` : ''}
      <section class="card2"><h2>${ico('flag')}<span>Code de récupération</span>${ibtn('recup')}</h2>
        ${ibox('recup', 'Ce code ramène ton compte sur un autre téléphone (ou après une réinstallation) : amis, profil et parties partagées. Il est aussi dans chaque sauvegarde (EXPORTER), et une sauvegarde importée avec REMPLACER TOUT reprend son compte. Garde-le pour toi : avec lui, n\'importe qui écrit à ta place.')}
        ${a ? (acc.showCode ? `<p class="reccode" aria-label="Code de récupération">${esc(code)}</p>
          <div class="btns two"><button type="button" class="btn ghost" data-act="acc-copy">${acc.copied ? 'COPIÉ' : 'COPIER'}</button><button type="button" class="btn ghost" data-act="acc-show" data-arg="0">MASQUER</button></div>`
    : '<button type="button" class="btn ghost" data-act="acc-show" data-arg="1">AFFICHER LE CODE</button>') : '<p class="note">Pas encore de compte sur ce téléphone.</p>'}
      </section>
      <section class="card2"><h2>${ico('phone')}<span>Retrouver un compte</span>${ibtn('retrouver')}</h2>
        ${ibox('retrouver', 'Sur un nouveau téléphone : tape ici le code de récupération de l\'ancien. Ce téléphone prend alors ce compte ; rien de ce qui est déjà sur ce téléphone n\'est effacé. Pour retrouver aussi les parties et les joueurs locaux, importe plutôt la dernière sauvegarde (Données › IMPORTER, REMPLACER TOUT) : le compte suit.')}
        <label class="field"><input class="input" data-input="acc-code" id="acccode" value="${esc(acc.draft)}" maxlength="80" placeholder="XXXXX-XXXXX-…" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" aria-label="Code de récupération"></label>
        <button type="button" class="btn ghost" data-act="acc-recover" ${acc.busy ? 'disabled' : ''}>RETROUVER CE COMPTE</button>
      </section>
      <section class="card2"><h2>${ico('trash')}<span>Données en ligne</span>${ibtn('suppr')}</h2>
        ${ibox('suppr', 'Supprime tout ce qui est sur le serveur de Strela : ton profil, tes liens d\'amitié, les parties et séances que ce téléphone a envoyées. Elles disparaissent aussi chez tes amis. Rien n\'est effacé sur ce téléphone ; la synchronisation se coupe. Détail : politique de confidentialité (À propos).')}
        ${acc.confirm ? `<p class="note">Tout supprimer en ligne ? Tes amis ne verront plus tes parties.</p>
          <div class="btns two"><button type="button" class="btn danger" data-act="acc-delete" ${acc.busy ? 'disabled' : ''}>OUI, SUPPRIMER</button><button type="button" class="btn ghost" data-act="acc-confirm" data-arg="0">ANNULER</button></div>`
    : `<button type="button" class="btn ghost" data-act="acc-confirm" data-arg="1" ${sup.ok ? '' : 'disabled'}>SUPPRIMER MES DONNÉES EN LIGNE</button>`}
      </section>
      ${acc.msg ? `<div class="vibe" role="status"><b>COMPTE</b><span>${esc(acc.msg)}</span></div>` : ''}
    </div></div>`;
}

export const inputs = {
  'acc-code'(v) { acc.draft = v; },
};

export const actions = {
  'acc-info'(k) { if (acc.info.has(k)) acc.info.delete(k); else acc.info.add(k); refresh(); },
  async 'acc-sync'() { const p = syncNow('à la main'); refresh(); await p; refresh(); },
  'acc-cloud'(v) { setCloudOn(v === '1'); refresh(); },
  'acc-presence'(v) { saveSetting('presence', v === '1'); refresh(); },
  'acc-show'(v) { acc.showCode = v === '1'; acc.copied = false; refresh(); },
  async 'acc-copy'() {
    const a = cloudAccountRecord(store.settings.cloudAccount);
    try { await navigator.clipboard.writeText(recoveryCode(a)); acc.copied = true; } catch (e) { acc.msg = 'Copie impossible : recopie le code à la main.'; }
    refresh();
  },
  async 'acc-recover'() {
    const raw = acc.draft || (document.getElementById('acccode') || {}).value || '';
    acc.busy = true; refresh();
    const r = await recoverAccount(raw);
    acc.busy = false; acc.msg = r.msg; if (r.ok) acc.draft = '';
    refresh();
  },
  'acc-confirm'(v) { acc.confirm = v === '1'; refresh(); },
  async 'acc-delete'() {
    acc.busy = true; refresh();
    const r = await deleteOnlineData();
    acc.busy = false; acc.confirm = false; acc.msg = r.msg;
    refresh();
  },
};
