// Strela — pilotage de la vraie appli (base du téléphone ouverte, sans ?maquette) pour les tests de parcours (lot 2) :
// ouverture, saisie au pavé, lecture de la base, instantané de l'écran de jeu, création de joueurs.

/** Attend que l'appli soit prête (base lue, premier écran dessiné). */
export async function ready(page) {
  await page.waitForSelector('body[data-ready]');
  await page.evaluate(() => document.fonts.ready);
}

/** Ouvre l'appli à `hash` (vide : comme l'appli installée, sur l'accueil). */
export async function openApp(page, url, hash = '') {
  await page.goto(`${url}${hash}`);
  await ready(page);
}

/** Attend que toutes les écritures soient sur le disque. */
export const settle = page => page.waitForFunction(() => window.__strelaSaving && window.__strelaSaving() === 0);

/** Recharge la page (fermeture brutale simulée) une fois les écritures finies, et attend l'appli. */
export async function reload(page) {
  await settle(page);
  await page.reload();
  await ready(page);
}

/** Contenu de la base (joueurs, parties, réglages), lu directement dans IndexedDB. */
export const readDb = page => page.evaluate(() => new Promise((resolve, reject) => {
  const r = indexedDB.open('strela');
  r.onerror = () => reject(r.error);
  r.onsuccess = () => {
    const db = r.result;
    const tx = db.transaction(['players', 'games', 'settings'], 'readonly');
    const out = {};
    const get = (name, key) => { const q = tx.objectStore(name)[key](); q.onsuccess = () => { out[`${name}.${key}`] = q.result; }; };
    get('players', 'getAll'); get('games', 'getAll'); get('settings', 'getAll'); get('settings', 'getAllKeys');
    tx.oncomplete = () => {
      db.close();
      const settings = {};
      out['settings.getAllKeys'].forEach((k, i) => { settings[k] = out['settings.getAll'][i]; });
      const games = out['games.getAll'];
      resolve({
        version: db.version, players: out['players.getAll'], settings,
        games: games.filter(g => g.endedAt !== null), current: games.find(g => g.endedAt === null) || null,
      });
    };
  };
}));

/** Notation « T20 D16 20 0 25 50 » → touches du pavé (multiplicateur puis nombre). */
export function keysOf(notation) {
  return notation.trim().split(/\s+/).flatMap(t => {
    if (t === '0' || t === '25' || t === '50') return [t];
    const m = /^([SDT]?)(\d+)$/.exec(t);
    if (!m) throw new Error(`notation ${t}`);
    return m[1] === 'D' || m[1] === 'T' ? [m[1], m[2]] : [m[2]];
  });
}

/** Saisit des fléchettes au pavé (portrait). */
export async function throwDarts(page, notation) {
  for (const k of keysOf(notation)) await page.click(`[data-key="${k}"]`);
}

export const validate = page => page.click('.validate.go');
export const undo = page => page.click('[data-key="undo"]');

/** Ce que montre l'écran (jeu, fin de manche ou de partie), pour comparer avant et après un rechargement. */
export const snapshot = page => page.evaluate(() => {
  const q = s => document.querySelector(s);
  const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
  const roll = el => (el ? (el.querySelector('[data-roll]')?.dataset.v ?? txt(el)) : null);
  return {
    hash: location.hash,
    player: txt(q('.gband .nm')),
    state: txt(q('.gband .legs')),
    remaining: roll(q('#remaining')),
    darts: [...document.querySelectorAll('.visit .dart')].map(d => txt(d.querySelector('.sv')) || ''),
    total: roll(q('.visit .total')),
    bust: !!q('.rest.alert'),
    validate: !!q('.validate.go'),
    others: [...document.querySelectorAll('.others .op')].map(o => `${txt(o.querySelector('.nm'))} ${roll(o.querySelector('.r'))}${o.classList.contains('next') ? ' (suivant)' : ''}`),
    result: txt(q('.result-head')),
    heading: txt(q('.screen > .inv b')),
  };
});

/** Crée un joueur depuis la liste des joueurs (ou l'accueil au premier lancement) ; `icon` : clé de la banque. */
export async function createPlayer(page, name, { icon = null, color = null } = {}) {
  await page.evaluate(() => { location.hash = '#/joueur/nouveau'; });
  await page.waitForSelector('#name');
  await page.fill('#name', name);
  if (color !== null) await page.click(`.swatch[data-arg="${color}"]`);
  if (icon) {
    await page.click('[data-act="avkind"][data-arg="icon"]');
    await page.click(`[data-act="pick-icon"][data-arg="${icon}"]`);
    await page.waitForSelector('#name');
  }
  await page.click('[data-act="save-player"]');
  await page.waitForSelector('.list');
}

/** Lance une partie depuis l'écran « Nouvelle partie » : joueurs (pseudos, dans l'ordre), départ, manches. */
export async function newGame(page, names, { startScore = 501, legsToWin = 1 } = {}) {
  await page.evaluate(() => { location.hash = '#/nouvelle'; });
  await page.waitForSelector('[data-act="launch"]');
  // Derniers réglages repris : on retire d'abord les joueurs déjà choisis.
  while (await page.locator('.order [data-act="remove"]').count()) await page.click('.order [data-act="remove"] >> nth=0');
  for (const n of names) await page.click(`.pool button[data-act="add"]:has(.nm:text-is("${n}"))`);
  await page.click(`[data-act="score"][data-arg="${startScore}"]`);
  for (let i = await page.evaluate(() => Number(/\d+/.exec(document.querySelector('.stepper output').textContent)?.[0] || 1)); i < legsToWin; i++) {
    await page.click('[data-act="legs"][data-arg="1"]');
  }
  await page.click('[data-act="launch"]');
  await page.waitForSelector('.game');
}
