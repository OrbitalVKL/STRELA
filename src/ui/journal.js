// Strela — journal de débogage (lot 9.5, B) : ce qui s'est passé sur ce téléphone, horodaté, pour comprendre un
// problème signalé pendant la phase de lancement (mode en ligne qui ne se connecte pas, historique incohérent…).
// Local seulement : rien ne part du téléphone sans EXPORTER (Réglages › Développement) ou la case de la sauvegarde.
//   log(cat, msg, data?)  cat : 'erreur' | 'enligne' | 'saisie' | 'maj' | 'base' | 'appli'
// Borné : 7 jours, et au plus MAX_CHARS caractères (les plus anciennes lignes partent d'abord). Rien de personnel hors
// pseudos : ni adresse réseau (les candidats WebRTC sont comptés par type), ni contenu de sauvegarde.
// Stockage : localStorage (clé strela.journal), écrit au plus une fois par seconde (tout de suite pour une erreur) ;
// sans localStorage (tests dans node), en mémoire seulement.

export const KEY = 'strela.journal';
export const KEEP_MS = 7 * 86400000;
export const MAX_CHARS = 1000000; // ~1 Mo
export const CATS = Object.freeze({ erreur: 'ERREUR', enligne: 'EN LIGNE', saisie: 'SAISIE', maj: 'MISE À JOUR', base: 'BASE', appli: 'APPLI' });

let lines = null;      // [[t, cat, msg]]
let enabled = true;
let timer = 0;
const ls = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };

function load() {
  if (lines) return lines;
  lines = [];
  try { const raw = ls() && ls().getItem(KEY); const v = raw ? JSON.parse(raw) : null; if (Array.isArray(v)) lines = v.filter(l => Array.isArray(l) && l.length === 3); } catch (e) { lines = []; }
  return lines;
}

/** Lignes gardées : moins de 7 jours, et pas plus de `max` caractères en tout (les plus récentes). Pur (testé). */
export function trim(list, now = Date.now(), max = MAX_CHARS) {
  let out = list.filter(l => now - l[0] <= KEEP_MS);
  let size = out.reduce((n, l) => n + l[2].length + 24, 0);
  let i = 0;
  while (size > max && i < out.length) { size -= out[i][2].length + 24; i++; }
  if (i) out = out.slice(i);
  return out;
}

function flush() {
  clearTimeout(timer); timer = 0;
  const s = ls();
  if (!s || !lines) return;
  lines = trim(lines);
  try { s.setItem(KEY, JSON.stringify(lines)); } catch (e) {
    // Stockage plein : on garde la moitié la plus récente.
    lines = lines.slice(Math.floor(lines.length / 2));
    try { s.setItem(KEY, JSON.stringify(lines)); } catch (e2) { /* tant pis : le journal reste en mémoire */ }
  }
}

/** Détail court d'un objet (une ligne, sans les champs longs). */
export function brief(data) {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') return data;
  if (data instanceof Error) return `${data.name}: ${data.message}`;
  try { const s = JSON.stringify(data); return s.length > 600 ? `${s.slice(0, 600)}…` : s; } catch (e) { return String(data); }
}

/** Note une ligne au journal (sans effet s'il est coupé). */
export function log(cat, msg, data) {
  if (!enabled) return;
  const l = load();
  const text = `${msg}${data !== undefined ? ` ${brief(data)}` : ''}`.slice(0, 2000);
  l.push([Date.now(), CATS[cat] ? cat : 'appli', text]);
  if (cat === 'erreur') flush();
  else if (!timer) timer = setTimeout(flush, 1000);
}

/** Allumé ou coupé (réglage `journal`, OUI par défaut pendant la phase de lancement). */
export function setJournal(on) { enabled = on !== false; }
export const journalOn = () => enabled;
/** Lignes du journal, de la plus ancienne à la plus récente. */
export function journalLines() { return [...load()]; }
export function clearJournal() { lines = []; flush(); }
export const journalSize = () => load().reduce((n, l) => n + l[2].length + 24, 0);

const two = n => String(n).padStart(2, '0');
/** Horodatage local « 2026-11-24 21:57:03.120 ». */
export function stamp(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}
/** Texte du journal (fichier exporté) : une en-tête, puis une ligne par entrée. */
export function journalText(head = '', list = journalLines()) {
  return `${head ? `${head}\n` : ''}${list.map(([t, c, m]) => `${stamp(t)}  ${(CATS[c] || c).padEnd(11)}  ${m}`).join('\n')}\n`;
}
/** Nom du fichier exporté (accepté par l'APK : Bridge.saveFile, strela-journal-AAAAMMJJ-HHMM.txt). */
export function journalFileName(date = new Date()) {
  return `strela-journal-${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}.txt`;
}

/** Erreurs JavaScript de la page, notées d'office. */
export function watchErrors(target = globalThis) {
  if (!target || !target.addEventListener) return;
  target.addEventListener('error', ev => log('erreur', `${ev.message || 'erreur'}${ev.filename ? ` (${String(ev.filename).split('/').pop()}:${ev.lineno || 0})` : ''}`));
  target.addEventListener('unhandledrejection', ev => log('erreur', 'promesse rejetée', ev.reason instanceof Error ? ev.reason : brief(ev.reason)));
  target.addEventListener('pagehide', () => { if (timer) flush(); });
  target.addEventListener('visibilitychange', () => { if (timer && target.document && target.document.visibilityState === 'hidden') flush(); });
}

/** Pour les tests : journal vidé en mémoire, relu au prochain appel. */
export function resetJournalForTests() { lines = null; enabled = true; clearTimeout(timer); timer = 0; }
