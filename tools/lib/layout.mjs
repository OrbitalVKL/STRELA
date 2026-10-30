// Strela — vérification automatique des chevauchements (lot 1.2), avec Playwright.
// Pour chaque écran et chaque état du sommaire de maquette, sur une grille de tailles d'écran (portrait et paysage)
// et de tailles de police (100, 115, 130 %), vérifie dans la page :
//   - qu'aucune boîte de texte ni aucun élément visible n'en recouvre un autre (hors parent / enfant) ;
//   - que rien ne sort de l'écran (sur les côtés ; aussi en bas sur l'écran de jeu, qui ne défile pas) ;
//   - qu'aucun texte n'est coupé net (une coupe doit finir par « … ») ;
//   - que la page ne défile pas de côté.
// Les calques voulus (feuilles, annonce, loupe, VALIDER sur le pavé, barre du bas) portent data-layer : ce qu'ils
// couvrent n'est pas comparé. La police agrandie est simulée en multipliant la taille calculée de chaque texte (comme
// le réglage de police d'Android dans une WebView), puis la page se réajuste (fit.js).

export const PORTRAIT = [];
for (const w of [360, 384, 410, 430]) for (const h of [640, 712, 800, 866, 930]) PORTRAIT.push({ width: w, height: h });
export const LANDSCAPE = [
  { width: 640, height: 360 }, { width: 740, height: 360 }, { width: 800, height: 384 },
  { width: 860, height: 410 }, { width: 914, height: 410 }, { width: 930, height: 430 },
];
export const FONT_SCALES = [1, 1.15, 1.3];
/** Grille réduite (option --vite) : les coins de la grille. */
export const QUICK = [
  { width: 360, height: 640 }, { width: 410, height: 712 }, { width: 410, height: 914 }, { width: 430, height: 930 },
  { width: 640, height: 360 }, { width: 914, height: 410 },
];

/** Adresses d'écrans en plus des états du sommaire (« scène » = clé de SCENES dans screens/sommaire.js). */
export const ROUTES = ['#/', '#/joueurs', '#/joueur/nouveau', '#/joueur/p1', '#/avatars', '#/nouvelle', '#/historique',
  '#/partie/g1', '#/stats/p1', '#/stats/p3', '#/reglages', '#/sommaire'];
const SKIP_SCENES = new Set(['reinit']);

// ------------------------------------------------------------------ dans la page
/** Multiplie la taille de police calculée de chaque élément (hors dessins SVG) : police du téléphone agrandie. */
function scaleFonts(k) {
  if (k === 1) return;
  // Seuls les éléments qui fixent leur propre taille sont touchés ; les autres en héritent (comme sur le téléphone,
  // un texte qui rapetisse pour tenir entraîne ses enfants).
  const els = [...document.querySelectorAll('#app *')].filter(e => !e.closest('svg'));
  const size = e => parseFloat(getComputedStyle(e).fontSize);
  const own = els.map(e => [e, size(e)]).filter(([e, px]) => px !== size(e.parentElement));
  own.forEach(([e, px]) => { e.style.fontSize = `${(px * k).toFixed(2)}px`; });
}

/** Contrôle de la page affichée ; renvoie la liste des problèmes (texte). */
function inspect() {
  const W = document.documentElement.clientWidth, H = window.innerHeight;
  const app = document.getElementById('app');
  const css = new Map();
  const cs = el => { let s = css.get(el); if (!s) { s = getComputedStyle(el); css.set(el, s); } return s; };
  const shown = el => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = cs(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const name = el => {
    const t = el.nodeType === 3 ? `« ${el.textContent.trim().slice(0, 24)} »` : '';
    const e = el.nodeType === 3 ? el.parentElement : el;
    const cls = e.getAttribute('class') ? `.${e.getAttribute('class').trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${e.tagName.toLowerCase()}${cls}${t ? ` ${t}` : ''}`;
  };
  const inter = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  const big = r => r.right - r.left >= W * 0.95 && r.bottom - r.top >= H * 0.9;
  // Zone visible d'une boîte : coupée par ses ancêtres qui coupent (overflow), sauf ceux de la taille de l'écran
  // (l'écran de jeu coupe tout ce qui dépasse : on veut le voir comme « sort de l'écran »).
  const clipOf = (el, self) => {
    let r = { left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 };
    for (let e = self ? el : el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = cs(e);
      const ox = s.overflowX !== 'visible', oy = s.overflowY !== 'visible';
      if (!ox && !oy) continue;
      const b = e.getBoundingClientRect();
      if (big(b) && s.overflowY === 'hidden') continue;
      const c = { left: b.left + e.clientLeft, top: b.top + e.clientTop };
      c.right = c.left + e.clientWidth; c.bottom = c.top + e.clientHeight;
      r = inter(r, { left: ox ? c.left : -1e6, right: ox ? c.right : 1e6, top: oy ? c.top : -1e6, bottom: oy ? c.bottom : 1e6 });
    }
    return r;
  };
  const layers = [...app.querySelectorAll('[data-layer]')].filter(shown);
  const layerOf = el => el.closest('[data-layer]');
  const items = [];
  const add = (node, el, rect) => {
    const r = inter(rect, clipOf(el, node.nodeType === 3));
    if (r.right - r.left < 1 || r.bottom - r.top < 1) return;
    items.push({ node, el, r, layer: layerOf(el), raw: rect });
  };
  // Textes : boîte de l'encre (ascendante et descendante réelles du texte, mesurées au canevas)
  const ctx = document.createElement('canvas').getContext('2d');
  const walker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const txt = t.textContent.trim();
    const el = t.parentElement;
    if (!txt || el.closest('svg') || !shown(el)) continue;
    const s = cs(el);
    ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    try { ctx.fontStretch = s.fontStretch === '75%' ? 'condensed' : 'normal'; } catch (e) { /* rien */ }
    const m = ctx.measureText(s.textTransform === 'uppercase' ? txt.toUpperCase() : txt);
    const range = document.createRange();
    range.selectNodeContents(t);
    for (const lr of range.getClientRects()) {
      if (lr.width < 1) continue;
      const base = lr.top + m.fontBoundingBoxAscent * (lr.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent));
      add(t, el, { left: lr.left, right: lr.right, top: base - m.actualBoundingBoxAscent, bottom: base + m.actualBoundingBoxDescent });
    }
  }
  // Éléments visibles : filet, fond, image, dessin, champ
  for (const el of app.querySelectorAll('*')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (!shown(el)) continue;
    const s = cs(el);
    const tag = el.tagName.toLowerCase();
    const border = ['Top', 'Right', 'Bottom', 'Left'].some(k => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== 'none' && !/rgba\(.*, 0\)$/.test(s[`border${k}Color`]));
    const bg = !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor) || s.backgroundImage !== 'none';
    if (!(border || bg || ['svg', 'img', 'input', 'textarea', 'select', 'canvas'].includes(tag))) continue;
    if (el === app || big(el.getBoundingClientRect())) continue; // fonds d'écran
    add(el, el, el.getBoundingClientRect());
  }
  // Ce qu'un calque couvre n'est pas comparé (feuille, annonce, loupe, VALIDER posé sur le pavé, barre du bas)
  const covered = it => layers.some(L => !L.contains(it.el) && (() => {
    const b = L.getBoundingClientRect();
    const cx = (it.r.left + it.r.right) / 2, cy = (it.r.top + it.r.bottom) / 2;
    return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
  })());
  const live = items.filter(it => !covered(it));
  const problems = [];
  const TOL = 1.5;
  const related = (a, b) => {
    const ea = a.node.nodeType === 3 ? a.el : a.node, eb = b.node.nodeType === 3 ? b.el : b.node;
    if (a.node.nodeType === 3 && b.node.nodeType === 3) return a.node === b.node;
    if (a.node.nodeType === 3) return eb.contains(a.node);
    if (b.node.nodeType === 3) return ea.contains(b.node);
    return ea.contains(eb) || eb.contains(ea);
  };
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.layer !== b.layer || related(a, b)) continue;
      const r = inter(a.r, b.r);
      if (r.right - r.left > TOL && r.bottom - r.top > TOL) {
        problems.push(`chevauchement : ${name(a.node)} / ${name(b.node)} (${Math.round(r.right - r.left)}×${Math.round(r.bottom - r.top)} px)`);
      }
    }
  }
  // Hors de l'écran : sur les côtés partout ; en bas aussi sur l'écran de jeu (hauteur fixe, rien ne défile)
  const fixed = !!app.querySelector('.game') && !app.querySelector('.sheet-bg');
  for (const it of live) {
    const r = it.r;
    if (r.left < -1 || r.right > W + 1 || (fixed && (r.bottom > H + 1 || r.top < -1))) {
      problems.push(`hors de l'écran : ${name(it.node)} (${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)})`);
    }
  }
  // Texte coupé net : un bloc qui coupe (overflow) sans « … » et dont le contenu déborde en largeur
  for (const el of app.querySelectorAll('*')) {
    if (el.closest('svg') || !shown(el)) continue;
    const s = cs(el);
    if (s.overflowX !== 'hidden' && s.overflowX !== 'clip') continue;
    if (s.textOverflow === 'ellipsis' || !el.textContent.trim() || covered({ el, r: el.getBoundingClientRect() })) continue;
    if (el.scrollWidth > el.clientWidth + 1) problems.push(`coupé sans « … » : ${name(el)} (${el.scrollWidth} px pour ${el.clientWidth})`);
  }
  if (document.documentElement.scrollWidth > W + 1) problems.push(`la page défile de côté (${document.documentElement.scrollWidth} px pour ${W})`);
  return [...new Set(problems)];
}

// ------------------------------------------------------------------ pilotage
/** Liste des états à vérifier : routes et scènes du sommaire (lue dans la page). */
export async function statesOf(page) {
  const scenes = await page.evaluate(() => window.__strela.scenes());
  return [...ROUTES.map(r => ({ route: r })), ...scenes.filter(s => !SKIP_SCENES.has(s)).map(s => ({ scene: s }))];
}

/** Met la page dans un état (données fictives remises à neuf avant). */
export async function show(page, st) {
  await page.evaluate(st => {
    window.__strela.reset();
    if (st.scene) window.__strela.scene(st.scene, st.arg);
    else { history.replaceState(null, '', st.route); window.__strela.render(); }
  }, st);
  await page.evaluate(() => document.fonts.ready);
}

export const label = st => st.scene ? `scène ${st.scene}` : st.route;

/**
 * Vérifie tous les états sur une taille d'écran et une police ; `theme` : 'dark' | 'light'.
 * Renvoie [{ state, problems }] (seulement les états en défaut).
 */
export async function checkViewport(browser, url, vp, scale, { theme = 'dark', states = null } = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(t => { try { localStorage.setItem('strela.theme', t); localStorage.setItem('strela.anim', '0'); } catch (e) { /* rien */ } }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}?maquette#/sommaire`);
  await page.waitForFunction(() => window.__strela);
  const list = states || await statesOf(page);
  const out = [];
  for (const st of list) {
    await show(page, st);
    await page.evaluate(scaleFonts, scale);
    await page.evaluate(() => window.__strela.fit());
    const problems = await page.evaluate(inspect);
    if (errors.length) problems.push(...errors.splice(0).map(e => `erreur JS : ${e}`));
    if (problems.length) out.push({ state: label(st), problems });
  }
  await ctx.close();
  return out;
}

export const inPage = { scaleFonts, inspect };
