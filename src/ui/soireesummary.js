// Strela — résumé de soirée à partager (lot 9, choix de Guillaume : variante A « affiche sombre »).
// Une image verticale 1080 × 1920 à envoyer dans la conversation des joueurs : bande rouge (date, parties, joueurs,
// verres), podium, six faits marquants. Couleurs du thème sombre de la DA (fond #0A0C0E, texte #CFD2D4, rouge #9E4A4A).
// On dessine dans une page logique de 540 × 960 agrandie deux fois. Données : soireeModel() (engine/soiree.js) ;
// `who(id)` → { name, color, initials, img?, photo? } comme pour le rapport (soireereport.js).
import { mix } from './theme.js';

export const SUM_W = 1080, SUM_H = 1920;
const LW = 540, LH = 960, K = SUM_W / LW, MX = 24;
const BG = '#0A0C0E', FG = '#CFD2D4', RED = '#9E4A4A', ON_RED = '#F2F0EA', AV_INK = '#ECEDEE';
const DIM = mix(FG, 0.62, BG), RULE = mix(FG, 0.3, BG), STEP = mix(FG, 0.16, BG);
const FONT = '"Martian Mono", ui-monospace, monospace';
const DAYS = ['DIM.', 'LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.'];
const pad2 = n => String(n).padStart(2, '0');
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

function T(x, s, X, Y, { px = 11, w = 400, color = FG, align = 'left', ls = 0, max = 0 } = {}) {
  x.font = `${w} ${px}px ${FONT}`; x.fillStyle = color; x.textAlign = align; x.textBaseline = 'alphabetic';
  if ('letterSpacing' in x) x.letterSpacing = `${ls}px`;
  let str = String(s);
  if (max > 0 && x.measureText(str).width > max) {
    while (str.length > 1 && x.measureText(`${str}…`).width > max) str = str.slice(0, -1);
    str += '…';
  }
  x.fillText(str, X, Y);
  if ('letterSpacing' in x) x.letterSpacing = '0px';
}
const rect = (x, X, Y, w, h, fill) => { x.fillStyle = fill; x.fillRect(X, Y, w, h); };
const frame = (x, X, Y, w, h, color = RULE) => { x.strokeStyle = color; x.lineWidth = 1; x.strokeRect(X + 0.5, Y + 0.5, w - 1, h - 1); };
function face(x, p, X, Y, s) {
  rect(x, X, Y, s, s, p.color);
  if (p.img && p.photo) x.drawImage(p.img, X, Y, s, s);
  else if (p.img) { const m = s * 0.16; x.drawImage(p.img, X + m, Y + m, s - 2 * m, s - 2 * m); }
  else T(x, p.initials, X + s / 2, Y + s * 0.64, { px: s * 0.38, w: 700, color: AV_INK, align: 'center' });
}

/**
 * Les six cases du résumé, dans l'ordre : [{ label, id, value }]. Meilleure et pire volée, roi du bust, le plus assoiffé,
 * celui qui a payé le plus de tournées, record battu pendant la soirée (`record` : { id, label, value } ou null) ; il
 * en manque : roi des défis, le plus régulier, roi de la soirée.
 */
export function summaryTiles(m, record = null) {
  const tr = Object.fromEntries(m.trophies.map(t => [t.key, t]));
  const out = [];
  const add = (label, id, value) => { if (id !== undefined && id !== null && out.length < 6) out.push({ label, id, value }); };
  if (tr.best) add('Meilleure volée', tr.best.id, tr.best.value);
  if (tr.worst) add('Pire volée', tr.worst.id, String(parseInt(tr.worst.value, 10)));
  if (tr.busts) add('Roi du bust', tr.busts.id, String(parseInt(tr.busts.value, 10)));
  const dr = m.rows.filter(r => r.drinks).sort((a, b) => b.drinks - a.drinks)[0];
  if (dr) add('Le plus assoiffé', dr.id, `x${dr.drinks}`);
  const paid = {};
  for (const t of m.timeline) for (const id of t.last) paid[id] = (paid[id] || 0) + 1 / t.last.length;
  const payer = Object.entries(paid).sort((a, b) => b[1] - a[1])[0];
  if (payer) add('Tournées', payer[0], `x${Math.round(payer[1] * 10) / 10}`.replace('.', ','));
  if (record) add(`Record · ${record.label}`, record.id, record.value);
  // Valeurs courtes : « x2 » (défis réussis, victoires), « ±3,2 » (écart des moyennes).
  const n = v => `x${parseInt(v, 10)}`;
  if (tr.defis) add('Roi des défis', tr.defis.id, n(tr.defis.value));
  if (tr.regular) add('Le plus régulier', tr.regular.id, `±${tr.regular.value.replace(/^écart /, '').replace(/ pts$/, '')}`);
  if (tr.king) add('Roi de la soirée', tr.king.id, n(tr.king.value));
  return out;
}

/** L'affiche (canvas SUM_W × SUM_H). extra = { record } ; mk(w, h) → canvas. */
export function drawSoireeSummary(m, who, extra = {}, mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }) {
  const c = mk(SUM_W, SUM_H);
  const x = c.getContext('2d');
  rect(x, 0, 0, SUM_W, SUM_H, BG);
  x.scale(K, K);
  // Bande rouge : date, puis parties, joueurs, verres.
  rect(x, 0, 0, LW, 168, RED);
  const d = new Date(m.start);
  T(x, 'STRELA · SOIRÉE', LW / 2, 46, { px: 13, color: ON_RED, ls: 4, align: 'center' });
  T(x, `${DAYS[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`, LW / 2, 104, { px: 44, w: 800, color: ON_RED, ls: 3, align: 'center' });
  T(x, `${plural(m.games, 'PARTIE', 'PARTIES')} · ${plural(m.rows.length, 'JOUEUR', 'JOUEURS')}${m.drinks ? ` · ${plural(m.drinks, 'VERRE', 'VERRES')}` : ''}`,
    LW / 2, 142, { px: 13, color: ON_RED, ls: 2, align: 'center', max: LW - 2 * MX });
  // Podium : 2e, 1er, 3e (ceux qui ont joué) ; marches en gris, la première en vidéo inverse.
  const pod = [[m.rows[1], 2, 118], [m.rows[0], 1, 168], [m.rows[2], 3, 88]];
  const bw = 150, gap = 8, x0 = (LW - 3 * bw - 2 * gap) / 2, base = 470;
  pod.forEach(([r, place, h], k) => {
    if (!r) return;
    const X = x0 + k * (bw + gap), p = who(r.id);
    rect(x, X, base - h, bw, h, place === 1 ? FG : STEP);
    T(x, place, X + bw / 2, base - h / 2 + 18, { px: 48, w: 800, color: place === 1 ? BG : FG, align: 'center' });
    const s = place === 1 ? 64 : 52;
    face(x, p, X + (bw - s) / 2, base - h - s - 38, s);
    T(x, p.name.toUpperCase(), X + bw / 2, base - h - 14, { px: 14, w: 700, align: 'center', max: bw - 6 });
  });
  // Six faits marquants, deux colonnes.
  const tiles = summaryTiles(m, extra.record || null);
  const tw = (LW - 2 * MX - 12) / 2, th = 116, ty = 500;
  tiles.forEach((t, i) => {
    const X = MX + (i % 2) * (tw + 12), Y = ty + Math.floor(i / 2) * (th + 12);
    frame(x, X, Y, tw, th);
    T(x, t.label.toUpperCase(), X + 14, Y + 26, { px: 10.5, color: DIM, ls: 1.5, max: tw - 28 });
    const p = who(t.id);
    face(x, p, X + 14, Y + 40, 26);
    T(x, p.name.toUpperCase(), X + 48, Y + 59, { px: 13, w: 700, max: tw - 62 });
    T(x, t.value, X + 14, Y + 100, { px: 30, w: 800, max: tw - 28 });
  });
  T(x, 'STRELA · COMPTEUR DE FLÉCHETTES', LW / 2, LH - 30, { px: 10.5, color: DIM, ls: 2, align: 'center' });
  return c;
}

/** Nom du fichier (accepté par l'APK : Bridge.saveFile, strela-resume-AAAAMMJJ-HHMM.png). */
export const summaryFileName = ms => { const d = new Date(ms); return `strela-resume-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.png`; };
