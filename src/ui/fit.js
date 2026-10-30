// Strela — mise à l'échelle des blocs chargés (lot 1.2), après chaque rendu. Rien ne doit se chevaucher, quels que
// soient la largeur de l'écran et les réglages de taille d'affichage et de police d'Android ou de Chrome :
//   [data-fit="n"]  bloc qui se compacte par paliers : les classes fit1 … fitn s'ajoutent une à une tant que son
//                   contenu déborde (le CSS dit ce que chaque palier retire ou abrège) ;
//   [data-shrink]   texte qui rapetisse (taille de police) jusqu'à tenir dans son parent (reste à faire, BUST,
//                   touches du pavé…), sans descendre sous --fs-min s'il est donné (pseudo du bandeau : « … » ensuite) ;
//   [data-fit-same] groupe (tableau d'historique) : ses blocs data-fit prennent tous le palier du plus compacté,
//                   pour un aspect homogène (lot 1.3).
// Le CSS garde une coupe « … » en dernier recours.

const overflows = el => el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5;

function compact(el) {
  const max = Number(el.dataset.fit) || 1;
  for (let i = 1; i <= max; i++) el.classList.remove(`fit${i}`);
  for (let i = 1; i <= max && overflows(el); i++) el.classList.add(`fit${i}`);
}

// Largeur utile d'un bloc (sans ses marges intérieures).
const inner = box => { const s = getComputedStyle(box); return box.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); };

/** Rapetisse `el` jusqu'à ce qu'il tienne : dans sa propre largeur, dans la largeur et la hauteur de son bloc
 *  (`data-shrink="2"` : le bloc est le grand-parent). */
function shrink(el) {
  let box = el;
  for (let k = Number(el.dataset.shrink) || 1; k > 0 && box.parentElement; k--) box = box.parentElement;
  for (let i = 0; i < 5; i++) {
    const w = el.getBoundingClientRect().width, h = el.getBoundingClientRect().height;
    if (!w || !h) return;
    const own = el.clientWidth && el.scrollWidth > el.clientWidth + 0.5 ? el.clientWidth / el.scrollWidth : 1;
    const cw = inner(box);
    const spill = box.scrollWidth - box.clientWidth; // le bloc déborde de côté (avec ses autres enfants)
    const wide = Math.min(w > cw + 0.5 ? cw / w : 1, spill > 0.5 ? Math.max(w - spill, 0) / w : 1);
    const over = box.scrollHeight - box.clientHeight;
    const tall = over > 0.5 ? Math.max(h - over, 0) / h : 1;
    const r = Math.min(own, wide, tall);
    if (r >= 0.995) return;
    const min = parseFloat(getComputedStyle(el).getPropertyValue('--fs-min')) || 0; // plancher (pseudo du bandeau)
    const cur = parseFloat(getComputedStyle(el).fontSize);
    const next = Math.max(cur * Math.max(r, 0.3) * 0.98, min);
    if (next >= cur - 0.1) return;
    el.style.fontSize = `${next.toFixed(2)}px`;
  }
}

const level = el => { let i = 0; while (el.classList.contains(`fit${i + 1}`)) i++; return i; };

function align(group) {
  const items = [...group.querySelectorAll('[data-fit]')];
  const max = Math.max(0, ...items.map(level));
  items.forEach(el => { for (let i = 1; i <= Math.min(max, Number(el.dataset.fit) || 1); i++) el.classList.add(`fit${i}`); });
}

/** Ajuste tous les blocs de `root` (appelé après chaque rendu, à la rotation et une fois la police chargée). */
export function fitAll(root = document) {
  // Paliers d'abord (une étiquette abrégée libère de la place : le texte voisin n'a pas à rapetisser pour elle), puis
  // les textes qui rapetissent, puis les paliers de nouveau avec les tailles finales.
  root.querySelectorAll('[data-fit]').forEach(compact);
  root.querySelectorAll('[data-shrink]').forEach(shrink);
  root.querySelectorAll('[data-fit]').forEach(compact);
  root.querySelectorAll('[data-fit-same]').forEach(align);
}
