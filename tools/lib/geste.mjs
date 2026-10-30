// Strela — geste de saisie sur la cible en paysage (Playwright, vrais événements tactiles) : le doigt se pose à côté
// de la zone visée, glisse jusqu'à elle (la loupe suit), se lève ; on lit la fléchette enregistrée.
import { polar, sectorAngle, RINGS } from '../../src/engine/board.js';
import { show } from './layout.mjs';

const mid = (a, b) => (a + b) / 2;
/** Zones visées : nom attendu et point du repère de la cible (rayon 1 = bord du double). */
export const TARGETS = [
  ['T20', polar(sectorAngle(20), mid(RINGS.tripleIn, RINGS.tripleOut))],
  ['D16', polar(sectorAngle(16), mid(RINGS.doubleIn, RINGS.doubleOut))],
  ['T19', polar(sectorAngle(19), mid(RINGS.tripleIn, RINGS.tripleOut))],
  ['D3', polar(sectorAngle(3), mid(RINGS.doubleIn, RINGS.doubleOut))],
  ['D20', polar(sectorAngle(20), mid(RINGS.doubleIn, RINGS.doubleOut))],
  ['T1', polar(sectorAngle(1), mid(RINGS.tripleIn, RINGS.tripleOut))],
  ['S5', polar(sectorAngle(5), mid(RINGS.outerBull, RINGS.tripleIn))],
  ['S11', polar(sectorAngle(11), mid(RINGS.tripleOut, RINGS.doubleIn))],
  ['25', polar(90, mid(RINGS.bull, RINGS.outerBull))],
  ['50', [0.01, -0.01]],
];

const label = d => (d.segment === 25 ? (d.multiplier === 2 ? '50' : '25') : `${['', 'S', 'D', 'T'][d.multiplier]}${d.segment}`);

/** Joue chaque zone sur une partie neuve ; renvoie [{ want, got, lens }]. `offset` : décalage du premier appui (px). */
export async function playTargets(page, { offset = 18 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const out = [];
  for (const [want, [bx, by]] of TARGETS) {
    await show(page, { scene: 'jeu' });
    const box = await page.evaluate(() => { const r = document.querySelector('#tboard svg').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
    const scale = box.w / 2 / RINGS.edge;
    const x = box.x + box.w / 2 + bx * scale, y = box.y + box.w / 2 + by * scale;
    // premier appui à côté de la zone, vers le centre de la cible (le doigt se pose sur la cible puis ajuste)
    const r = Math.hypot(bx, by);
    const [ox, oy] = r > 0.2 ? [-bx / r * offset, -by / r * offset] : [offset * 0.7, offset * 0.7];
    await touch('touchStart', x + ox, y + oy);
    for (let k = 1; k <= 4; k++) await touch('touchMove', x + ox * (1 - k / 4), y + oy * (1 - k / 4));
    const lens = await page.evaluate(() => document.querySelector('#loupe .lz')?.textContent);
    await touch('touchEnd', x, y);
    const darts = await page.evaluate(() => window.__strela.darts());
    out.push({ want, got: darts && darts.length ? label(darts[darts.length - 1]) : '—', lens });
  }
  return out;
}
