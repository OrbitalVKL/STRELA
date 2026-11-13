// Strela — sauvegarde automatique (lot 9, demande de Guillaume : « ne jamais perdre l'historique »). Appli Android
// seulement (la version web n'écrit pas de fichier sans un appui) :
// - à la fin d'une soirée (TERMINER LA SOIRÉE) ;
// - au lancement, si la dernière sauvegarde automatique a plus de 7 jours et que des parties ont changé depuis.
// Le fichier est le même que celui d'EXPORTER (strela-AAAAMMJJ-HHMM.json, Téléchargements/Strela), sans le menu de
// partage. Réglage « Sauvegarde automatique » (OUI par défaut). Dernière sauvegarde notée dans localStorage
// (strela.autoBackup.at / .sig) et affichée dans les Réglages.
import { store, exportBackup } from './store.js';
import { backupFileName } from '../data/backup.js';
import { isApk, callJson } from './native.js';
import { BUILD } from './build.js';

const AT = 'strela.autoBackup.at', SIG = 'strela.autoBackup.sig', PATH = 'strela.autoBackup.path';
const WEEK = 7 * 86400e3;
const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage refusé */ } };
/** Empreinte des parties : nombre, fléchettes et verres ; une sauvegarde n'est refaite que si elle a changé. */
const signature = () => `${store.games.length}:${store.games.reduce((n, g) => n + g.darts.length + (g.drinks ? Object.values(g.drinks).reduce((a, l) => a + l.length, 0) : 0), 0)}`;

/** Dernière sauvegarde automatique : { at, path } ou null. */
export function lastAutoBackup() {
  const at = Number(get(AT));
  return at ? { at, path: get(PATH) || 'Téléchargements/Strela' } : null;
}

/** Écrit la sauvegarde maintenant (appli Android, réglage OUI, au moins une partie, quelque chose de changé). */
export function autoBackup({ force = false } = {}) {
  if (store.maquette || !isApk() || !store.settings.autoBackup || !store.games.length) return false;
  const sig = signature();
  if (!force && sig === get(SIG)) return false;
  const r = callJson('saveBackup', backupFileName(), JSON.stringify(exportBackup(BUILD.version)), false);
  if (!r || !r.ok) return false;
  put(AT, String(Date.now())); put(SIG, sig); put(PATH, r.path || '');
  return true;
}

/** Au lancement : une fois par semaine au plus. */
export function weeklyAutoBackup(now = Date.now()) {
  const last = lastAutoBackup();
  if (last && now - last.at < WEEK) return false;
  return autoBackup();
}
