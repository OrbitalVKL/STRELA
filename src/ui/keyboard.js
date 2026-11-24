// Strela — clavier du téléphone (lot 9.5, A2) : le champ où l'on tape reste visible au-dessus du clavier, pour tous les
// champs texte de l'appli (pseudo, code du salon, nom d'un jeu de fléchettes, note d'une séance…).
// APK : la coquille laisse la place du clavier en bas (MainActivity, WindowInsets ime) ; la page rapetisse. Navigateur :
// la zone visible (visualViewport) rapetisse. Dans les deux cas, le champ actif est ramené au milieu de la partie
// visible, au focus et à chaque changement de taille, s'il est caché.

const FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]), textarea, [contenteditable="true"]';

/** Le champ est-il hors de la partie visible (au-dessus du clavier) ? */
export function hidden(rect, viewTop, viewHeight, margin = 12) {
  return rect.top < viewTop + margin || rect.bottom > viewTop + viewHeight - margin;
}

function reveal(el) {
  if (!el || !el.isConnected || !el.matches || !el.matches(FIELDS)) return;
  const vv = globalThis.visualViewport;
  const top = vv ? vv.offsetTop : 0;
  const h = vv ? vv.height : globalThis.innerHeight;
  const r = el.getBoundingClientRect();
  if (!hidden(r, top, h)) return;
  try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { el.scrollIntoView(); }
}

let timer = 0;
const later = () => { clearTimeout(timer); timer = setTimeout(() => reveal(document.activeElement), 120); };

/** À appeler une fois au démarrage. */
export function watchKeyboard(doc = globalThis.document) {
  if (!doc) return;
  doc.addEventListener('focusin', ev => { if (ev.target && ev.target.matches && ev.target.matches(FIELDS)) { later(); setTimeout(() => reveal(doc.activeElement), 450); } });
  if (globalThis.visualViewport) globalThis.visualViewport.addEventListener('resize', later);
  globalThis.addEventListener('resize', later);
}
