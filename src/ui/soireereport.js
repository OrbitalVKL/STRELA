// Strela — rapport d'une soirée en 3 feuilles A4 (lot 7.8, version 0.8.0 ; choix de Guillaume le 13/11 : les trois).
//   A · PODIUM ET CARTES : podium, une carte par joueur (courbe de ses moyennes, moyenne, meilleure / pire volée, 100+,
//       verres dessinés, cible colorée là où il a lancé, taux de triples), qui a payé chaque tournée.
//   B · CHRONOLOGIE : la soirée heure par heure (parties, vainqueur, dernier, verres de chacun à leur heure), moyenne de
//       chaque partie par joueur, trophées, liste des parties.
//   C · DUELS ET CIBLES : qui bat qui (parties où la ligne a fini devant la colonne), barres comparées (moyenne, 100+,
//       triples, bust, verres), une grande cible chiffrée par joueur et ses secteurs fétiches.
// Dessin sur canvas, papier blanc, encre et rouge de la DA (théme clair), couleurs d'avatar pour reconnaître les
// joueurs. On dessine dans une page logique de 794 × 1123 (A4 à 96 ppp) agrandie à PAGE_W × PAGE_H (150 ppp).
// Les données viennent de soireeModel() (engine/soiree.js) ; `who(id)` donne { name, color, initials, img }.
import { PAGE_W, PAGE_H } from './sheet.js';
import { mix } from './theme.js';

const LW = 794, LH = 1123, MX = 34;
const K = PAGE_W / LW;
const PAPER = '#FFFFFF', INK = '#14171A', RED = '#9E4A4A', ON_RED = '#F2F0EA', AV_INK = '#ECEDEE';
const MUT = mix(INK, 0.62, PAPER), RULE = mix(INK, 0.3, PAPER), F08 = mix(INK, 0.08, PAPER), F14 = mix(INK, 0.14, PAPER), F18 = mix(INK, 0.18, PAPER);
const FONT = '"Martian Mono", ui-monospace, monospace';
const SECT = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const DAYS = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
const pad2 = n => String(n).padStart(2, '0');
const hhmm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const dec = (v, n = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(n).replace('.', ','));
const pct = v => (v === null || v === undefined ? '—' : `${dec(v * 100)} %`);
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

// ------------------------------------------------------------------ outils de dessin
function sheet(mk) {
  const c = mk(PAGE_W, PAGE_H);
  const x = c.getContext('2d');
  x.fillStyle = PAPER; x.fillRect(0, 0, PAGE_W, PAGE_H);
  x.scale(K, K);
  x.lineJoin = 'miter'; x.lineCap = 'butt';
  return { c, x };
}
/** Texte ; renvoie sa largeur. max : coupé avec « … » au-delà. */
function T(x, s, X, Y, { px = 11, w = 400, color = INK, align = 'left', ls = 0, max = 0 } = {}) {
  x.font = `${w} ${px}px ${FONT}`; x.fillStyle = color; x.textAlign = align; x.textBaseline = 'alphabetic';
  if ('letterSpacing' in x) x.letterSpacing = `${ls}px`;
  let str = String(s);
  if (max > 0 && x.measureText(str).width > max) {
    while (str.length > 1 && x.measureText(`${str}…`).width > max) str = str.slice(0, -1);
    str += '…';
  }
  x.fillText(str, X, Y);
  const wd = x.measureText(str).width;
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  return wd;
}
const rect = (x, X, Y, w, h, fill) => { x.fillStyle = fill; x.fillRect(X, Y, w, h); };
const frame = (x, X, Y, w, h, color = RULE, lw = 1) => { x.strokeStyle = color; x.lineWidth = lw; x.strokeRect(X + lw / 2, Y + lw / 2, w - lw, h - lw); };
const hline = (x, X0, X1, Y, color = RULE, lw = 1, dash = null) => { x.strokeStyle = color; x.lineWidth = lw; x.setLineDash(dash || []); x.beginPath(); x.moveTo(X0, Y); x.lineTo(X1, Y); x.stroke(); x.setLineDash([]); };
const vline = (x, X, Y0, Y1, color = RULE, lw = 1, dash = null) => { x.strokeStyle = color; x.lineWidth = lw; x.setLineDash(dash || []); x.beginPath(); x.moveTo(X, Y0); x.lineTo(X, Y1); x.stroke(); x.setLineDash([]); };

/** Verre (le pictogramme de l'appli, simplifié) : s = largeur. */
function glass(x, X, Y, s = 8, color = INK) {
  const k = s / 8;
  x.strokeStyle = color; x.lineWidth = 0.9 * k; x.fillStyle = color;
  x.beginPath(); x.moveTo(X + k, Y); x.lineTo(X + 7 * k, Y); x.lineTo(X + 6 * k, Y + 9 * k); x.lineTo(X + 2 * k, Y + 9 * k); x.closePath(); x.stroke();
  x.beginPath(); x.moveTo(X + 1.5 * k, Y + 3.5 * k); x.lineTo(X + 6.5 * k, Y + 3.5 * k); x.lineTo(X + 5.9 * k, Y + 8.5 * k); x.lineTo(X + 2.1 * k, Y + 8.5 * k); x.closePath(); x.fill();
}

/** Avatar carré : photo ou pictogramme (image préparée), sinon initiales, sur la couleur du joueur. */
function face(x, p, X, Y, s) {
  rect(x, X, Y, s, s, p.color);
  if (p.img && p.photo) x.drawImage(p.img, X, Y, s, s);
  else if (p.img) { const m = s * 0.16; x.drawImage(p.img, X + m, Y + m, s - 2 * m, s - 2 * m); }
  else T(x, p.initials, X + s / 2, Y + s * 0.64, { px: s * 0.38, w: 700, color: AV_INK, align: 'center' });
}

/** Cible colorée selon le nombre de fléchettes par secteur (rouge = souvent ; racine carrée, pour voir aussi les secteurs
 * peu touchés) ; nums : nombres dans les secteurs. */
function board(x, sec, cx, cy, r, { nums = false } = {}) {
  const vals = SECT.map(n => sec[n] || 0);
  const max = Math.max(1, ...vals, sec.bull || 0);
  const r0 = r * 0.16;
  SECT.forEach((n, k) => {
    const a0 = (k * 18 - 99) * Math.PI / 180, a1 = a0 + Math.PI / 10;
    const v = Math.sqrt((sec[n] || 0) / max);
    x.beginPath(); x.arc(cx, cy, r, a0, a1); x.arc(cx, cy, r0, a1, a0, true); x.closePath();
    x.fillStyle = mix(RED, v, PAPER); x.fill();
    x.strokeStyle = RULE; x.lineWidth = 0.5; x.stroke();
    if (nums) {
      const a = (k * 18 - 90) * Math.PI / 180, rr = r * 0.72;
      T(x, sec[n] || 0, cx + rr * Math.cos(a), cy + rr * Math.sin(a) + r / 30, { px: Math.max(7, r / 11), color: v > 0.55 ? ON_RED : INK, align: 'center' });
    }
  });
  x.beginPath(); x.arc(cx, cy, r0, 0, Math.PI * 2);
  const vb = Math.sqrt((sec.bull || 0) / max);
  x.fillStyle = mix(RED, vb, PAPER); x.fill(); x.strokeStyle = RULE; x.lineWidth = 0.5; x.stroke();
  if (nums && sec.bull) T(x, sec.bull, cx, cy + r0 * 0.35, { px: Math.max(7, r / 12), color: vb > 0.55 ? ON_RED : INK, align: 'center' });
}

/** Titre de section : petites capitales espacées et filet. */
function h2(x, label, X, Y, w = LW - 2 * MX) {
  T(x, label, X, Y, { px: 10, w: 700, color: MUT, ls: 1.4 });
  hline(x, X, X + w, Y + 5);
}

function header(x, m, page, label) {
  T(x, `FEUILLE ${page} · ${label}`, LW - MX, 20, { px: 9, color: MUT, ls: 1.2, align: 'right' });
  rect(x, MX, 30, LW - 2 * MX, 62, RED);
  const d = new Date(m.start), e = new Date(m.endAt), dm = t => `${pad2(t.getDate())}/${pad2(t.getMonth() + 1)}`;
  T(x, 'RAPPORT DE SOIRÉE', MX + 16, 52, { px: 11, color: ON_RED, ls: 0.7 });
  T(x, m.oneDay ? `${DAYS[d.getDay()]} ${dm(d)}` : `DU ${dm(d)} AU ${dm(e)}`, MX + 16, 79, { px: 22, w: 700, color: ON_RED, ls: 2.6, max: 380 });
  const R = LW - MX - 16;
  T(x, `${m.oneDay ? `${hhmm(m.start)} → ${hhmm(m.endAt)} · ` : ''}${plural(m.games, 'PARTIE', 'PARTIES')} · ${plural(m.rows.length, 'JOUEUR', 'JOUEURS')}`, R, 58, { px: 11, color: ON_RED, ls: 0.7, align: 'right' });
  const w = T(x, `x${m.drinks} VERRE${m.drinks > 1 ? 'S' : ''}`, R, 77, { px: 11, color: ON_RED, ls: 0.7, align: 'right' });
  glass(x, R - w - 13, 67, 8, ON_RED);
}
function footer(x, page) {
  T(x, 'Strela · compteur de fléchettes', MX, LH - 16, { px: 8, color: MUT });
  T(x, `${page} / 3`, LW - MX, LH - 16, { px: 8, color: MUT, align: 'right' });
}

// ------------------------------------------------------------------ feuille A : podium et cartes
function pageA(x, m, who) {
  header(x, m, 'A', 'PODIUM ET CARTES');
  h2(x, 'PODIUM', MX, 112);
  const base = 336;
  const pod = [m.rows[1], m.rows[0], m.rows[2]];
  const hs = [86, 120, 64], marks = ['2', '1', '3'];
  pod.forEach((r, k) => {
    if (!r) return;
    const p = who(r.id), cx = LW / 2 + (k - 1) * 164, top = base - hs[k], s = k === 1 ? 50 : 40;
    rect(x, cx - 75, top, 150, hs[k], k === 1 ? INK : F18);
    T(x, marks[k], cx, top + hs[k] / 2 + 11, { px: 30, w: 700, color: k === 1 ? PAPER : INK, align: 'center' });
    T(x, `MOY. ${dec(r.average)}`, cx, top - 8, { px: 10, color: MUT, align: 'center' });
    T(x, plural(r.won, 'VICTOIRE', 'VICTOIRES'), cx, top - 21, { px: 10, color: MUT, align: 'center' });
    T(x, p.name.toUpperCase(), cx, top - 36, { px: k === 1 ? 14 : 12, w: 700, align: 'center', max: 150 });
    face(x, p, cx - s / 2, top - 52 - s, s);
  });
  // Cartes des joueurs
  h2(x, 'LES JOUEURS', MX, 360);
  const y0 = 372, rows = Math.ceil(m.rows.length / 2), gap = 10;
  const ch = Math.min(160, (LH - 30 - 102 - 14 - y0 - (rows - 1) * gap) / rows);
  const tourTop = y0 + rows * ch + (rows - 1) * gap + 14;
  const cw = (LW - 2 * MX - gap) / 2;
  const maxAvg = Math.max(1, ...m.rows.map(r => r.average || 0));
  m.rows.forEach((r, i) => {
    const X = MX + (i % 2) * (cw + gap), Y = y0 + Math.floor(i / 2) * (ch + gap);
    frame(x, X, Y, cw, ch);
    x.save(); x.translate(X, Y);
    const s = ch / 160; x.scale(s, s);
    card(x, m, who, r, i, cw / s, maxAvg);
    x.restore();
  });
  // Tournées
  h2(x, 'QUI A PAYÉ SA TOURNÉE', MX, tourTop + 8);
  if (m.timeline.length > 10) { tourneeTally(x, m, who, tourTop + 20); footer(x, 1); return; }
  const gs = m.timeline, n = Math.max(1, gs.length), g6 = 6;
  const bw = (LW - 2 * MX - g6 * (n - 1)) / n;
  gs.forEach((g, k) => {
    const X = MX + k * (bw + g6), Y = tourTop + 20;
    frame(x, X, Y, bw, 66);
    T(x, hhmm(g.at), X + bw / 2, Y + 13, { px: bw < 44 ? 7 : 9, color: MUT, align: 'center' });
    if (g.abandoned || !g.last.length) { T(x, g.abandoned ? 'ABANDON' : '—', X + bw / 2, Y + 40, { px: bw < 50 ? 6.5 : 8, w: 700, color: MUT, align: 'center', max: bw - 4 }); return; }
    const p = who(g.last[0]), s = Math.min(24, bw - 10);
    face(x, p, X + bw / 2 - s / 2, Y + 20, s);
    T(x, (g.last.length > 1 ? `${p.name} +${g.last.length - 1}` : p.name).toUpperCase(), X + bw / 2, Y + 58, { px: bw < 50 ? 6.5 : 8.5, w: 700, align: 'center', max: bw - 6 });
  });
  footer(x, 1);
}

/** Plus de 10 parties : combien de tournées chacun a payées (une case par joueur, du plus au moins). */
function tourneeTally(x, m, who, Y) {
  const count = Object.fromEntries(m.rows.map(r => [r.id, 0]));
  for (const g of m.timeline) for (const id of g.last) count[id] = (count[id] || 0) + 1;
  const ids = m.rows.map(r => r.id).sort((a, b) => count[b] - count[a]);
  const n = ids.length, gap = 6, bw = (LW - 2 * MX - gap * (n - 1)) / n;
  ids.forEach((id, k) => {
    const X = MX + k * (bw + gap), p = who(id), s = Math.min(24, bw - 10);
    frame(x, X, Y, bw, 66);
    face(x, p, X + bw / 2 - s / 2, Y + 8, s);
    T(x, p.name.toUpperCase(), X + bw / 2, Y + 44, { px: 8.5, w: 700, align: 'center', max: bw - 6 });
    T(x, count[id] ? plural(count[id], 'TOURNÉE', 'TOURNÉES') : 'AUCUNE', X + bw / 2, Y + 58, { px: 8.5, color: count[id] ? RED : MUT, align: 'center', max: bw - 6 });
  });
}

function card(x, m, who, r, i, W, maxAvg) {
  const p = who(r.id);
  face(x, p, 10, 10, 30);
  T(x, `${i + 1}. ${p.name.toUpperCase()}`, 48, 23, { px: 12, w: 700, max: W - 48 - 130 });
  T(x, `${r.won} GAGNÉE${r.won > 1 ? 'S' : ''} SUR ${r.played} · ${r.busts} BUST`, 48, 37, { px: 10, color: MUT, max: W - 48 - 130 });
  // Moyenne de chaque partie jouée (à son échelle).
  T(x, 'MOYENNE PAR PARTIE', 10, 58, { px: 9, color: MUT, ls: 0.9 });
  const vals = m.timeline.map(g => g.avg[r.id]).filter(v => v !== undefined && v !== null);
  const sw = W - 150, sh = 30, sy = 64;
  if (vals.length) {
    const lo = Math.min(...vals) - 3, hi = Math.max(...vals) + 3;
    const px = k => 12 + (vals.length > 1 ? k * (sw - 4) / (vals.length - 1) : (sw - 4) / 2);
    const py = v => sy + sh - 3 - (v - lo) / (hi - lo) * (sh - 6);
    x.strokeStyle = INK; x.lineWidth = 1.4; x.beginPath();
    vals.forEach((v, k) => (k ? x.lineTo(px(k), py(v)) : x.moveTo(px(k), py(v))));
    x.stroke();
    vals.forEach((v, k) => rect(x, px(k) - 1.6, py(v) - 1.6, 3.2, 3.2, INK));
  }
  const aw = T(x, dec(r.average), 10, 118, { px: 20, w: 700 });
  const bx = 10 + aw + 10, bwid = Math.min(110, W - 150 - aw - 10);
  if (bwid > 20) { frame(x, bx, 110, bwid, 8, INK, 1); rect(x, bx, 110, bwid * (r.average || 0) / maxAvg, 8, INK); }
  let tx = 10;
  for (const [t, v] of [['MEILL.', r.best], ['PIRE', r.worst ?? '—'], ['100+', r.tons]]) {
    tx += T(x, t, tx, 138, { px: 9, color: MUT, ls: 0.5 }) + 5;
    tx += T(x, v, tx, 138, { px: 11, w: 700 }) + 14;
  }
  const gn = Math.min(r.drinks, Math.floor((W - 160) / 9.5));
  for (let k = 0; k < gn; k++) glass(x, 10 + k * 9.5, 146, 7.5);
  T(x, r.drinks ? `x${r.drinks}` : 'aucun verre', 10 + gn * 9.5 + (gn ? 4 : 0), 155, { px: 10, color: MUT });
  // Cible et triples, à droite.
  board(x, m.sectors[r.id] || {}, W - 66, 66, 52);
  T(x, `TRIPLES ${pct(r.tripleRate)}`, W - 66, 138, { px: 9, color: MUT, ls: 0.6, align: 'center' });
}

// ------------------------------------------------------------------ feuille B : chronologie
function pageB(x, m, who) {
  header(x, m, 'B', 'CHRONOLOGIE');
  h2(x, 'LA SOIRÉE HEURE PAR HEURE', MX, 112);
  let lx = MX;
  lx += T(x, 'Carré : vainqueur · ', lx, 130, { px: 9, color: MUT });
  lx += T(x, '↓', lx, 130, { px: 9, w: 700, color: RED });
  lx += T(x, ' : dernier, il paie sa tournée · ', lx, 130, { px: 9, color: MUT });
  glass(x, lx + 1, 122, 6.5, MUT);
  T(x, ' : un verre, à son heure', lx + 9, 130, { px: 9, color: MUT });
  const n = m.rows.length;
  const L = MX + 94, R = LW - MX - 4;
  const lastDrink = Math.max(0, ...Object.values(m.drinkTimes).flat());
  const T0 = m.start - 10 * 60e3, T1 = Math.max(m.endAt, lastDrink) + 10 * 60e3;
  // Un soir : l'axe est l'heure. Plusieurs jours (parties regroupées à la main) : une case égale par partie, et chaque
  // verre placé dans la partie où il a été bu, à proportion.
  const slots = m.timeline.length || 1;
  const byGame = t => { let k = m.timeline.findIndex((g, i) => t < (m.timeline[i + 1] ? m.timeline[i + 1].at : Infinity)); if (k < 0) k = 0;
    const g = m.timeline[k]; const f = g ? Math.min(1, Math.max(0, (t - g.at) / Math.max(1, g.end - g.at))) : 0; return (k + 0.1 + 0.8 * f) / slots; };
  const tx = m.oneDay ? t => L + (t - T0) / (T1 - T0) * (R - L) : t => L + byGame(t) * (R - L);
  const gx = (g, k) => (m.oneDay ? tx(g.at) : L + k / slots * (R - L));
  const hy = 142, laneTop = 196, laneH = Math.min(34, 420 / Math.max(1, n)), laneBot = laneTop + n * laneH;
  // Heures
  const step = T1 - T0 > 8 * 3600e3 ? 60 : 30;
  const first = new Date(T0); first.setMinutes(Math.ceil(first.getMinutes() / step) * step, 0, 0);
  for (let t = first.getTime(); m.oneDay && t <= T1; t += step * 60e3) {
    const full = new Date(t).getMinutes() === 0;
    vline(x, tx(t), laneTop - 6, laneBot, RULE, full ? 0.8 : 0.4, full ? null : [2, 3]);
    if (full) T(x, hhmm(t), tx(t), laneBot + 14, { px: 9, color: MUT, align: 'center' });
  }
  // Parties
  m.timeline.forEach((g, k) => {
    const next = m.timeline[k + 1];
    const x0 = gx(g, k), x1 = Math.max(x0 + 4, (next ? gx(next, k + 1) : m.oneDay ? tx(g.end) : R) - (m.oneDay ? 3 : 1)), w = x1 - x0;
    rect(x, x0, hy, w, 44, k % 2 ? F08 : F14);
    if (!m.oneDay) vline(x, x0, laneTop - 6, laneBot, RULE, 0.4, [2, 3]);
    if (w > 34) T(x, hhmm(g.at), x0 + 4, hy + 12, { px: 8, color: MUT });
    if (w > 16) T(x, `P${g.n}`, x0 + 4, hy + 24, { px: w < 26 ? 7 : 9, w: 700 });
    if (g.winner) {
      const p = who(g.winner), q = Math.min(11, w - 4);
      rect(x, x0 + (w > 16 ? 4 : 2), hy + 29, q, q, p.color);
      if (w > 44) T(x, p.initials, x0 + 19, hy + 38, { px: 8, w: 700 });
      if (w > 64 && g.last.length) T(x, `↓${who(g.last[0]).initials}`, x0 + 36, hy + 38, { px: 7.5, w: 700, color: RED });
    } else if (g.abandoned && w > 40) T(x, 'ABANDON', x0 + 4, hy + 38, { px: 7, color: MUT });
  });
  // Joueurs : verres à leur heure, et le cumul en escalier.
  m.rows.forEach((r, j) => {
    const p = who(r.id), y = laneTop + j * laneH, base = y + laneH - 8, s = Math.min(24, laneH - 8);
    face(x, p, MX, y + 1, s);
    T(x, p.name.toUpperCase(), MX + s + 6, y + Math.min(12, laneH / 2), { px: laneH < 26 ? 8 : 9, w: 700, max: L - MX - s - 10 });
    if (laneH >= 22) T(x, `x${r.drinks} verre${r.drinks > 1 ? 's' : ''}`, MX + s + 6, y + Math.min(23, laneH - 6), { px: 8, color: MUT });
    hline(x, L, R, base, RULE, 0.6);
    const ts = m.drinkTimes[r.id] || [];
    const stepH = Math.min(2, (laneH - 16) / Math.max(1, ts.length));
    x.strokeStyle = RULE; x.lineWidth = 1; x.beginPath(); x.moveTo(L, base);
    ts.forEach((t, k) => { x.lineTo(tx(t), base - k * stepH); x.lineTo(tx(t), base - (k + 1) * stepH); });
    x.lineTo(R, base - ts.length * stepH); x.stroke();
    const gs = Math.min(8, laneH * 0.3);
    ts.forEach(t => glass(x, tx(t) - gs / 2, base - gs * 1.25 - 4, gs));
  });
  // Moyenne de chaque partie
  let y = laneBot + 42;
  h2(x, 'MOYENNE DE CHAQUE PARTIE', MX, y);
  const CH = 200, cy0 = y + 18, gsN = m.timeline.length;
  const all = m.timeline.flatMap(g => Object.values(g.avg)).filter(v => v !== null && v !== undefined);
  const lo = Math.max(0, Math.floor((Math.min(...all, 30) - 5) / 10) * 10), hi = Math.ceil((Math.max(...all, 40) + 5) / 10) * 10;
  const cx = k => MX + 34 + (gsN > 1 ? k * (LW - 2 * MX - 34 - 100) / (gsN - 1) : (LW - 2 * MX - 134) / 2);
  const cy = v => cy0 + CH - 24 - (v - lo) / (hi - lo) * (CH - 34);
  for (let v = lo; v <= hi; v += 10) { hline(x, MX + 34, LW - MX - 96, cy(v), RULE, 0.4); T(x, v, MX + 28, cy(v) + 3, { px: 8, color: MUT, align: 'right' }); }
  const every = Math.ceil(gsN / 14);
  m.timeline.forEach((g, k) => { if (k % every === 0 || k === gsN - 1 && gsN <= 14) T(x, gsN > 7 ? `P${g.n}` : `P${g.n} ${hhmm(g.at)}`, cx(k), cy0 + CH - 6, { px: 8, color: MUT, align: 'center' }); });
  const ends = [];
  m.rows.forEach((r, j) => {
    const p = who(r.id);
    const pts = m.timeline.map((g, k) => (g.avg[r.id] === undefined || g.avg[r.id] === null ? null : [cx(k), cy(g.avg[r.id])])).filter(Boolean);
    if (!pts.length) return;
    x.strokeStyle = p.color; x.lineWidth = j === 0 ? 2.6 : 1.4; x.beginPath();
    pts.forEach(([X, Y], k) => (k ? x.lineTo(X, Y) : x.moveTo(X, Y))); x.stroke();
    pts.forEach(([X, Y]) => rect(x, X - 2.5, Y - 2.5, 5, 5, p.color));
    ends.push({ p, y: pts.at(-1)[1] });
  });
  ends.sort((a, b) => a.y - b.y).forEach((e, k, arr) => { e.ly = Math.max(e.y, k ? arr[k - 1].ly + 11 : -Infinity); });
  ends.forEach(e => T(x, e.p.name.toUpperCase(), LW - MX - 90, e.ly + 3, { px: 9, w: 700, color: e.p.color, max: 90 }));
  // Trophées
  y = cy0 + CH + 26;
  h2(x, 'LES TROPHÉES', MX, y);
  const tw = (LW - 2 * MX - 16) / 3;
  m.trophies.forEach((t, k) => {
    const X = MX + (k % 3) * (tw + 8), Y = y + 14 + Math.floor(k / 3) * 60, inv = t.key === 'king';
    if (inv) rect(x, X, Y, tw, 52, INK); else frame(x, X, Y, tw, 52);
    face(x, who(t.id), X + 9, Y + 9, 34);
    T(x, t.label.toUpperCase(), X + 52, Y + 17, { px: 8.5, color: inv ? PAPER : MUT, ls: 0.6, max: tw - 58 });
    T(x, who(t.id).name.toUpperCase(), X + 52, Y + 31, { px: 11.5, w: 700, color: inv ? PAPER : INK, max: tw - 58 });
    T(x, `${t.value}${t.detail ? ` · ${t.detail}` : ''}`, X + 52, Y + 44, { px: 9, color: inv ? PAPER : INK, max: tw - 58 });
  });
  // Les parties, s'il reste de la place.
  y += 14 + Math.ceil(m.trophies.length / 3) * 60 + 22;
  const room = Math.floor((LH - 40 - y - 16) / 15);
  if (room >= 2) {
    h2(x, 'LES PARTIES', MX, y);
    const shown = m.timeline.length > room ? room - 1 : room;
    if (shown < m.timeline.length) T(x, `… et ${m.timeline.length - shown} autres parties (liste complète dans l'historique)`, MX, y + 20 + shown * 15, { px: 9, color: MUT });
    m.timeline.slice(0, shown).forEach((g, k) => {
      const Y = y + 20 + k * 15;
      T(x, `P${g.n}`, MX, Y, { px: 9, w: 700 });
      T(x, hhmm(g.at), MX + 34, Y, { px: 9, color: MUT });
      T(x, `${g.startScore}`, MX + 82, Y, { px: 9, color: MUT });
      T(x, g.abandoned ? 'abandonnée' : g.winner ? `gagnée par ${who(g.winner).name}` : '—', MX + 122, Y, { px: 9, w: 700, max: 250 });
      if (g.last.length) T(x, `tournée : ${g.last.map(id => who(id).name).join(', ')}`, MX + 380, Y, { px: 9, color: RED, max: 200 });
      T(x, plural(g.players.length, 'joueur', 'joueurs'), LW - MX, Y, { px: 9, color: MUT, align: 'right' });
    });
  }
  footer(x, 2);
}

// ------------------------------------------------------------------ feuille C : duels et cibles
function pageC(x, m, who) {
  header(x, m, 'C', 'DUELS ET CIBLES');
  const ids = m.rows.map(r => r.id), n = ids.length;
  // Qui bat qui
  h2(x, 'QUI BAT QUI', MX, 112, 300);
  const cell = Math.min(42, 296 / (n + 1)), av = Math.min(26, cell - 8), mx0 = MX + cell, my0 = 122 + cell;
  ids.forEach((id, k) => {
    face(x, who(id), mx0 + k * cell + (cell - av) / 2, 122 + (cell - av) / 2, av);
    face(x, who(id), MX + (cell - av) / 2, my0 + k * cell + (cell - av) / 2, av);
  });
  ids.forEach((a, i) => ids.forEach((b, j) => {
    const X = mx0 + j * cell, Y = my0 + i * cell;
    if (a === b) {
      x.save(); x.beginPath(); x.rect(X, Y, cell, cell); x.clip();
      x.strokeStyle = RULE; x.lineWidth = 0.8;
      for (let d = -cell; d < cell; d += 6) { x.beginPath(); x.moveTo(X + d, Y + cell); x.lineTo(X + d + cell, Y); x.stroke(); }
      x.restore(); return;
    }
    const tog = m.together[a][b], v = m.versus[a][b];
    if (!tog) { T(x, '—', X + cell / 2, Y + cell / 2 + 4, { px: 10, color: MUT, align: 'center' }); return; }
    const k = v / tog;
    rect(x, X + 0.5, Y + 0.5, cell - 1, cell - 1, mix(INK, k, PAPER));
    T(x, v, X + cell / 2, Y + cell / 2 + cell * 0.12, { px: Math.min(13, cell * 0.34), w: 700, color: k > 0.5 ? PAPER : INK, align: 'center' });
  }));
  const capY = my0 + n * cell + 14;
  T(x, 'Case : parties où la ligne a fini', MX, capY, { px: 9, color: MUT });
  T(x, 'devant la colonne (jouées ensemble).', MX, capY + 12, { px: 9, color: MUT });
  // En chiffres
  const RX = MX + 336, RW = LW - MX - RX;
  h2(x, 'EN CHIFFRES', RX, 112, RW);
  const metrics = [
    ['MOYENNE', r => r.average, v => dec(v)],
    ['VOLÉES 100+', r => r.tons, v => String(v)],
    ['TAUX DE TRIPLES', r => r.tripleRate, v => pct(v)],
    ['BUST', r => r.busts, v => String(v)],
    ['VERRES', r => r.drinks, v => String(v)],
  ];
  const rh = Math.max(7, Math.min(11, (470 - metrics.length * 18) / (metrics.length * n)));
  let y = 128;
  for (const [label, get, fmt] of metrics) {
    T(x, label, RX, y + 8, { px: 9, color: MUT, ls: 0.9 });
    y += 13;
    const vals = m.rows.map(r => get(r) ?? 0), mxv = Math.max(...vals);
    m.rows.forEach((r, j) => {
      const p = who(r.id), Y = y + j * rh;
      rect(x, RX, Y + 1, rh - 2, rh - 2, p.color);
      T(x, p.name.toUpperCase(), RX + rh + 4, Y + rh - 2.5, { px: Math.min(9, rh - 1.5), max: 78 });
      const bx = RX + rh + 86, bw = RW - rh - 86 - 50;
      rect(x, bx, Y + 1.5, bw, rh - 3, F08);
      if (mxv > 0) rect(x, bx, Y + 1.5, bw * vals[j] / mxv, rh - 3, vals[j] === mxv ? INK : MUT);
      T(x, fmt(get(r)), LW - MX, Y + rh - 2.5, { px: Math.min(9, rh - 1.5), w: 700, align: 'right' });
    });
    y += n * rh + 6;
  }
  // Cibles
  const top = Math.max(capY + 30, y + 14);
  h2(x, 'OÙ CHACUN A LANCÉ', MX, top);
  const rows = Math.ceil(n / 3), colW = (LW - 2 * MX) / 3;
  const rowH = (LH - 40 - top - 14) / rows;
  const r = Math.min(100, (rowH - 42) / 2, colW / 2 - 8);
  m.rows.forEach((row, k) => {
    const cx = MX + (k % 3) * colW + colW / 2, Y = top + 14 + Math.floor(k / 3) * rowH;
    const sec = m.sectors[row.id] || {};
    board(x, sec, cx, Y + r, r, { nums: r >= 50 });
    const p = who(row.id);
    x.font = `700 11px ${FONT}`;
    const nw = Math.min(colW - 40, x.measureText(p.name.toUpperCase()).width);
    face(x, p, cx - (nw + 24) / 2, Y + 2 * r + 7, 18);
    T(x, p.name.toUpperCase(), cx - (nw + 24) / 2 + 24, Y + 2 * r + 21, { px: 11, w: 700, max: colW - 40 });
    const fav = SECT.filter(s => sec[s]).sort((a, b) => sec[b] - sec[a]).slice(0, 3);
    T(x, fav.length ? `SECTEURS FÉTICHES ${fav.join(' · ')}` : 'AUCUNE FLÉCHETTE', cx, Y + 2 * r + 35, { px: 8.5, color: MUT, align: 'center', max: colW - 6 });
  });
  footer(x, 3);
}

/**
 * Les 3 feuilles du rapport (canvas PAGE_W × PAGE_H) : [A, B, C].
 * m = soireeModel(…) ; who(id) → { name, initials, color, img?, photo? } ; mk(w, h) → canvas.
 */
export function drawSoireeReport(m, who, mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }) {
  const endAt = Math.max(m.end || m.start, ...m.timeline.map(g => g.end));
  const mm = { ...m, endAt, oneDay: endAt - m.start <= 14 * 3600e3 };
  return [pageA, pageB, pageC].map(fn => { const { c, x } = sheet(mk); fn(x, mm, who); return c; });
}

/** Image du pictogramme d'un avatar (SVG en blanc cassé), à dessiner sur le canvas ; null si rien à charger. */
export function faceImage(svgOrPhoto, isPhoto) {
  if (!svgOrPhoto || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = isPhoto ? svgOrPhoto : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOrPhoto)}`;
  });
}
