// Strela — « les voyelles tombent » (lot 7). Quand le joueur au pseudo Tsia lance, les voyelles de tout le texte de
// l'écran de jeu se décrochent et tombent au bas de l'écran ; elles restent absentes le temps de sa volée (jusqu'à
// VALIDER, volée en attente comprise) et reviennent pour le joueur suivant. Les chiffres ne bougent pas.
//
// Mécanique : après chaque rendu de l'écran de jeu, chaque voyelle est mise dans un <span class="vw">. La première
// fois pour une volée donnée (clé), chaque voyelle visible est doublée dans un calque fixe hors de #app (#vfall) qui
// la fait tomber, pendant que l'originale garde sa place (invisible) puis disparaît en fin de chute : le mot se
// resserre. Aux rendus suivants de la même volée, les voyelles sont retirées d'emblée. Animations coupées (réglage
// ou demande du téléphone) : retirées d'emblée aussi.

const VOWEL_CLASS = 'aeiouyàâäáãåéèêëíìîïóòôöõúùûüýÿæœ';
const VOWEL = new RegExp(`[${VOWEL_CLASS}]`, 'iu');
const VOWELS = new RegExp(`([${VOWEL_CLASS}])`, 'giu');
const MAX_FALLING = 180; // au-delà, les voyelles disparaissent sans tomber (téléphone lent)

export const isVowel = ch => VOWEL.test(ch);

/** Vrai pour le pseudo « Tsia », sans tenir compte de la casse, des accents ni des espaces autour. */
export const isTsia = name => String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() === 'tsia';

/** Le texte tel qu'il reste une fois les voyelles tombées. */
export const withoutVowels = text => String(text).replace(VOWELS, '');

/** Découpe un texte en morceaux { text, vowel } (une voyelle par morceau voyelle). */
export function splitVowels(text) {
  return String(text).split(VOWELS).filter(Boolean).map(t => ({ text: t, vowel: t.length === 1 && isVowel(t) }));
}

let fallen = null; // clé de la volée dont les voyelles sont déjà tombées

/** Remet à zéro (tests, nouvelle partie). */
export function resetVowels() { fallen = null; }

/** Met chaque voyelle du texte sous `root` dans un <span class="vw"> ; renvoie ces spans. Dessins SVG exclus. */
export function wrapVowels(root) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes = [];
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || el.closest('svg, script, style, .vw, [data-vkeep]')) continue;
    if (VOWEL.test(t.textContent)) nodes.push(t);
  }
  const spans = [];
  for (const t of nodes) {
    const frag = doc.createDocumentFragment();
    for (const part of splitVowels(t.textContent)) {
      if (!part.vowel) { frag.appendChild(doc.createTextNode(part.text)); continue; }
      const s = doc.createElement('span');
      s.className = 'vw';
      s.textContent = part.text;
      frag.appendChild(s);
      spans.push(s);
    }
    t.replaceWith(frag);
  }
  return spans;
}

function layer(doc) {
  let el = doc.getElementById('vfall');
  if (!el) {
    el = doc.createElement('div');
    el.id = 'vfall';
    el.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(el);
  }
  return el;
}

const rand = (a, b) => a + Math.random() * (b - a);

/** Fait tomber les voyelles (doubles dans le calque #vfall) ; les originales disparaissent en fin de chute. */
function drop(spans) {
  const doc = spans[0].ownerDocument;
  const win = doc.defaultView;
  const H = win.innerHeight, W = win.innerWidth;
  const box = layer(doc);
  let n = 0;
  for (const s of spans) {
    const r = s.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
    if (!visible || n >= MAX_FALLING) { s.classList.add('vgone'); continue; }
    n += 1;
    const cs = win.getComputedStyle(s);
    if (cs.visibility === 'hidden') { s.classList.add('vgone'); continue; }
    const f = doc.createElement('span');
    f.className = 'vf';
    f.textContent = s.textContent;
    const st = f.style;
    st.left = `${r.left}px`; st.top = `${r.top}px`; st.width = `${r.width}px`; st.height = `${r.height}px`;
    st.fontFamily = cs.fontFamily; st.fontSize = cs.fontSize; st.fontWeight = cs.fontWeight;
    st.fontStretch = cs.fontStretch; st.fontStyle = cs.fontStyle; st.letterSpacing = cs.letterSpacing;
    st.lineHeight = `${r.height}px`; st.color = cs.color; st.textTransform = cs.textTransform;
    st.setProperty('--fall', `${Math.round(H - r.top + r.height + 20)}px`);
    st.setProperty('--dx', `${Math.round(rand(-40, 40))}px`);
    st.setProperty('--rot', `${Math.round(rand(-260, 260))}deg`);
    st.setProperty('--wob', `${Math.round(rand(-14, 14))}deg`);
    st.animationDuration = `${Math.round(rand(850, 1450))}ms`;
    st.animationDelay = `${Math.round(rand(0, 650))}ms`;
    s.classList.add('vhold');
    const done = () => { f.remove(); s.classList.remove('vhold'); s.classList.add('vgone'); };
    f.addEventListener('animationend', done, { once: true });
    win.setTimeout(done, 2400); // filet de sécurité (onglet en arrière-plan : pas d'événement d'animation)
    box.appendChild(f);
  }
}

/**
 * Après le rendu de l'écran de jeu. `key` : clé de la volée de Tsia en cours (null si ce n'est pas elle).
 * Renvoie 'none' (rien fait), 'gone' (voyelles retirées d'emblée : refaire la mise à l'échelle) ou 'fall'.
 */
export function applyVowels(root, key, animate) {
  if (!key) { fallen = null; return 'none'; }
  const spans = wrapVowels(root);
  if (!spans.length) { fallen = key; return 'none'; }
  if (key === fallen || !animate) {
    fallen = key;
    for (const s of spans) s.classList.add('vgone');
    return 'gone';
  }
  fallen = key;
  drop(spans);
  return 'fall';
}
