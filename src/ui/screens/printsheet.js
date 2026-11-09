// Fiche de score à imprimer (lot 7.1) : boutons IMAGE et PDF en fin de partie et au détail d'une partie de
// l'historique. Livraison : dans l'APK, Téléchargements/Strela/<nom> puis menu de partage d'Android (imprimer, Drive,
// mail… ; strelaNative.saveFile) ; dans le navigateur, partage du fichier s'il est possible, sinon téléchargement.
import { store, playerById } from '../store.js';
import { esc, ico } from '../dom.js';
import { gameState } from '../../engine/stats.js';
import { sheetFile, toBase64 } from '../sheet.js';
import { isApk, callJson } from '../native.js';
import { BUILD } from '../build.js';
import { refresh } from '../nav.js';

const status = new Map(); // id de partie → { busy, msg }

const findGame = id => (store.current && store.current.id === id ? store.current : store.games.find(g => g.id === id));

/** Bloc « Fiche de score » : IMAGE · PDF, et le résultat du dernier export. */
export function sheetSection(g) {
  const st = status.get(g.id) || {};
  const btn = (kind, label) => `<button type="button" class="btn" data-act="sheet-export" data-arg="${esc(`${kind}|${g.id}`)}"${st.busy ? ' disabled' : ''}>${ico('download')} ${label}</button>`;
  return `<div class="sec">Fiche de score</div>
    <div class="btns two sheet-btns">${btn('png', 'IMAGE')}${btn('pdf', 'PDF')}</div>
    <p class="note" role="status">${st.busy ? 'Préparation de la fiche…' : st.msg ? esc(st.msg)
      : `Vainqueur, classement avec les verres, tournée et scores de chaque manche, noir sur blanc ; une demi-feuille A4 en paysage si la partie est courte. ${isApk() ? 'Enregistrée dans Téléchargements/Strela, puis le menu de partage s\'ouvre (Imprimer, Drive, mail…).' : 'Enregistrée dans les téléchargements, ou partagée si le téléphone le propose.'}`}</p>`;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/** Exporte la fiche (kind : png | pdf) de la partie `id`. */
export async function exportSheet(kind, id) {
  const g = findGame(id);
  if (!g) return;
  status.set(id, { busy: true });
  refresh();
  let msg;
  try {
    const f = await sheetFile(g, gameState(g), g.config.players.map(playerById), kind, BUILD.version);
    const what = kind === 'pdf' ? 'PDF' : 'Image';
    if (isApk()) {
      const r = callJson('saveFile', f.name, toBase64(f.bytes), f.mime, true);
      msg = r && r.ok ? `${what} enregistrée : ${r.path}. Menu de partage ouvert.` : `Export impossible : ${(r && r.error) || 'passerelle muette'}.`;
    } else {
      const blob = new Blob([f.bytes], { type: f.mime });
      let shared = false;
      try {
        const file = new File([blob], f.name, { type: f.mime });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: f.name }); shared = true; }
      } catch (e) {
        if (e && e.name === 'AbortError') { status.set(id, {}); refresh(); return; }
      }
      if (!shared) download(blob, f.name);
      msg = shared ? `${what} partagée : ${f.name}.` : `${what} enregistrée dans les téléchargements : ${f.name}.`;
    }
  } catch (e) {
    msg = `Export impossible : ${(e && e.message) || e}.`;
  }
  status.set(id, { busy: false, msg });
  refresh();
}

export const actions = {
  'sheet-export'(arg) { const [kind, id] = String(arg).split('|'); exportSheet(kind, id); },
};
