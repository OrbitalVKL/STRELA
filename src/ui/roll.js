// Strela — chiffres en rouleau : quand un nombre change (reste, total de la volée, restes des autres), chaque
// chiffre roule verticalement vers sa nouvelle valeur, comme un compteur mécanique (~300 ms).
// Le sens suit le nombre : il baisse → les chiffres descendent (le reste après une fléchette) ; il monte → ils
// montent (le reste après ANNULER). Rien n'attend l'animation : l'écran est redessiné à chaque saisie, la saisie
// suivante repart de la valeur affichée en dernier et coupe l'animation en cours.
// Désactivé par le réglage « Animations » et d'office si le téléphone demande moins d'animations.

export const ROLL_MS = 300;
const MAX_STEPS = 9;

/**
 * Bande de chiffres que traverse une position : de `from` à `to` (chiffres 0-9 ou '' pour une position vide),
 * en descendant (`down`, 7 → 6 → 5) ou en montant (5 → 6 → 7), en tournant après 0 ou 9.
 */
export function rollStrip(from, to, down) {
  if (from === to) return [to];
  if (from === '' || to === '') return [from, to];
  const out = [from];
  let d = Number(from);
  for (let k = 0; k < MAX_STEPS && d !== Number(to); k++) {
    d = (d + (down ? 9 : 1)) % 10;
    out.push(String(d));
  }
  if (out[out.length - 1] !== to) out.push(to);
  return out;
}

/** Chiffres d'un nombre, alignés à droite sur `width` positions ('' = vide). */
export const digitsOf = (value, width) => String(value).padStart(width, ' ').split('').map(c => (c === ' ' ? '' : c));

/** Nombre roulant (rendu statique) ; `key` identifie le nombre d'un rendu à l'autre. */
export const rollHtml = (key, value) => `<span class="roll" data-roll="${key}" data-v="${value}">${
  String(value).split('').map(c => `<span class="dg"><span class="st"><i>${c}</i></span></span>`).join('')}</span>`;

// Dernière valeur affichée de chaque nombre (portée : une partie).
let scope = null;
const last = new Map();

/** Change de portée (nouvelle partie) : rien ne roule au premier affichage. */
export function rollScope(id) {
  if (id !== scope) { scope = id; last.clear(); }
}

/** Après un rendu : anime les nombres qui ont changé (si `enabled`), retient les valeurs affichées. */
export function animateRolls(root, enabled) {
  for (const el of root.querySelectorAll('[data-roll]')) {
    const key = el.dataset.roll;
    const value = el.dataset.v;
    const prev = last.get(key);
    last.set(key, value);
    if (!enabled || prev === undefined || prev === value || typeof el.animate !== 'function') continue;
    const down = Number(value) < Number(prev);
    const width = Math.max(prev.length, value.length);
    const from = digitsOf(prev, width), to = digitsOf(value, width);
    el.innerHTML = to.map((d, i) => {
      const strip = rollStrip(from[i], d, down);
      // En descendant, la bande est lue de haut en bas à l'envers : le nouveau chiffre arrive par le haut.
      const cells = (down ? [...strip].reverse() : strip).map(c => `<i>${c || '&nbsp;'}</i>`).join('');
      return `<span class="dg${d === '' ? ' gone' : ''}"><span class="st" data-n="${strip.length}">${cells}</span></span>`;
    }).join('');
    let anim = null;
    for (const st of el.querySelectorAll('.st')) {
      const n = Number(st.dataset.n);
      if (n < 2) continue;
      const end = down ? 0 : -(n - 1);
      const start = down ? -(n - 1) : 0;
      anim = st.animate([{ transform: `translateY(${start}em)` }, { transform: `translateY(${end}em)` }],
        { duration: ROLL_MS, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' });
    }
    // Fin du roulement : retour au rendu statique (sans les positions vidées, ex. 100 → 60).
    if (anim) anim.onfinish = () => { if (el.isConnected && el.dataset.v === value) el.outerHTML = rollHtml(key, value); };
  }
}
