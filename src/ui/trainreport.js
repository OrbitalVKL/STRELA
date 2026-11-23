// Strela — feuille KPI de l'entraînement (lot 8 du 23/11/2026, 8.3) : une page A4 dessinée sur canvas, comme le rapport
// de soirée (papier blanc, encre et rouge de la DA) : joueur, période, chiffres clés (précision, groupement, dans la
// cible, séances, fléchettes), courbe de la précision, tendances par exercice, badges, carte de chaleur dans l'échelle
// choisie (Réglages › Affichage). IMAGE (PNG) ou PDF, partagée comme les autres feuilles. Données : écran des stats
// (mêmes filtres de période et de source), voir trainstats.js › exportData.
import { PAGE_W, PAGE_H } from './sheet.js';
import { mix, heatColor } from './theme.js';
import { SECTORS, RINGS, polar } from '../engine/board.js';

const LW = 794, LH = 1123, MX = 36;
const K = PAGE_W / LW;
const PAPER = '#FFFFFF', INK = '#14171A', RED = '#9E4A4A';
const MUT = mix(INK, 0.62, PAPER), RULE = mix(INK, 0.3, PAPER), F08 = mix(INK, 0.08, PAPER);
const FONT = '"Martian Mono", ui-monospace, monospace';
const dec1 = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const cm = mm => (mm === null || mm === undefined ? '—' : `${dec1(mm / 10)} cm`);
const pct = v => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);
const pad2 = n => String(n).padStart(2, '0');
export const trainReportBase = ms => { const d = new Date(ms); return `strela-entrainement-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`; };

function page(mk) {
  const c = mk(PAGE_W, PAGE_H);
  const x = c.getContext('2d');
  x.fillStyle = PAPER; x.fillRect(0, 0, PAGE_W, PAGE_H);
  x.scale(K, K);
  return { c, x };
}
const font = (x, size, w = 700) => { x.font = `${w} ${size}px ${FONT}`; };
function text(x, s, X, Y, { size = 12, w = 700, color = INK, align = 'left', max = null } = {}) {
  font(x, size, w); x.fillStyle = color; x.textAlign = align; x.textBaseline = 'alphabetic';
  let t = String(s);
  if (max) while (t.length > 1 && x.measureText(t).width > max) t = `${t.slice(0, -2)}…`;
  x.fillText(t, X, Y);
}
const line = (x, x1, y1, x2, y2, color = RULE, w = 1) => { x.strokeStyle = color; x.lineWidth = w; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); };
const sec = (x, title, Y, W = LW - 2 * MX, X = MX) => { text(x, title.toUpperCase(), X, Y, { size: 11, w: 800, color: MUT, max: W }); line(x, X, Y + 6, X + W, Y + 6); return Y + 22; };

/** Carte de chaleur sur canvas (zones de la cible, échelle `scale`) ; `heat(key, ring)` → 0 à 1. */
function heatBoard(x, cx, cy, R, heat, scale) {
  const r = v => (v / RINGS.doubleOut) * R;
  const zone = (s, r0, r1, key, ring) => {
    const i = SECTORS.indexOf(s);
    const a0 = ((i * 18 - 9 - 90) * Math.PI) / 180, a1 = ((i * 18 + 9 - 90) * Math.PI) / 180;
    x.beginPath(); x.arc(cx, cy, r(r1), a0, a1); x.arc(cx, cy, r(r0), a1, a0, true); x.closePath();
    const v = heat(key, ring);
    x.fillStyle = heatColor(scale, v); x.fill();
    if (!(v > 0)) { x.save(); x.clip(); x.strokeStyle = mix(INK, 0.25, heatColor(scale, 0)); x.lineWidth = 1; for (let k = -R; k < R; k += 6) { x.beginPath(); x.moveTo(cx + k, cy - R); x.lineTo(cx + k + 2 * R, cy + R); x.stroke(); } x.restore(); }
    x.strokeStyle = PAPER; x.lineWidth = 0.6; x.stroke();
  };
  x.fillStyle = INK; x.beginPath(); x.arc(cx, cy, R * 1.16, 0, Math.PI * 2); x.fill();
  for (const s of SECTORS) {
    zone(s, RINGS.outerBull, RINGS.tripleIn, `${s}`, 'i');
    zone(s, RINGS.tripleIn, RINGS.tripleOut, `T${s}`, '');
    zone(s, RINGS.tripleOut, RINGS.doubleIn, `${s}`, 'o');
    zone(s, RINGS.doubleIn, RINGS.doubleOut, `D${s}`, '');
  }
  for (const [key, rr] of [['25', RINGS.outerBull], ['50', RINGS.bull]]) {
    x.beginPath(); x.arc(cx, cy, r(rr), 0, Math.PI * 2); x.fillStyle = heatColor(scale, heat(key, '')); x.fill(); x.strokeStyle = PAPER; x.lineWidth = 0.6; x.stroke();
  }
  SECTORS.forEach((s, i) => { const [px, py] = polar(i * 18, R * 1.08); text(x, s, cx + px, cy + py + 4, { size: 10, w: 800, color: PAPER, align: 'center' }); });
}

/** Courbe simple (valeurs de la plus ancienne à la plus récente), plus bas = mieux pour une distance. */
function curve(x, pts, X, Y, W, H, fmt) {
  line(x, X, Y + H, X + W, Y + H);
  if (pts.length < 2) { text(x, 'Pas assez de séances pour une courbe.', X, Y + H / 2, { size: 11, w: 600, color: MUT }); return; }
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
  const t0 = pts[0].at, span = Math.max(1, pts[pts.length - 1].at - t0);
  const px = p => X + ((p.at - t0) / span) * W, py = v => Y + 14 + (1 - (v - lo) / (hi - lo || 1)) * (H - 28);
  x.strokeStyle = INK; x.lineWidth = 1.6; x.beginPath();
  pts.forEach((p, i) => { if (i) x.lineTo(px(p), py(p.v)); else x.moveTo(px(p), py(p.v)); }); x.stroke();
  let lastLabel = -Infinity;
  pts.forEach(p => {
    x.fillStyle = PAPER; x.strokeStyle = INK; x.fillRect(px(p) - 3, py(p.v) - 3, 6, 6); x.strokeRect(px(p) - 3, py(p.v) - 3, 6, 6);
    if (px(p) - lastLabel >= 54) { text(x, fmt(p.v), px(p), py(p.v) - 7, { size: 9, w: 700, align: 'center' }); const d = new Date(p.at); text(x, `${d.getDate()}/${pad2(d.getMonth() + 1)}`, px(p), Y + H + 13, { size: 9, w: 600, color: MUT, align: 'center' }); lastLabel = px(p); }
  });
}

/**
 * Feuille KPI : [canvas]. d : { now, player, period, source, kpis: [{ label, value }], curve: [{ at, v }] (précision, mm),
 * trends: [{ name, n, prec, spread }], badges: [{ name, tier }], heat: (key, ring) → 0..1, heatTotal, scale, approx }.
 */
export function drawTrainReport(d, mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }) {
  const { c, x } = page(mk);
  // En-tête : bande rouge STRELA, joueur, période.
  x.fillStyle = RED; x.fillRect(0, 0, LW, 70);
  text(x, 'STRELA · ENTRAÎNEMENT', MX, 44, { size: 22, w: 800, color: PAPER });
  text(x, d.period, LW - MX, 44, { size: 12, w: 700, color: PAPER, align: 'right' });
  text(x, d.player, MX, 104, { size: 20, w: 800, max: LW - 2 * MX });
  const dt = new Date(d.now);
  text(x, `Feuille du ${dt.getDate()}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()} · ${d.sourceLabel}`, MX, 124, { size: 11, w: 600, color: MUT });
  // Chiffres clés.
  let Y = 146;
  const bw = (LW - 2 * MX - 4 * 8) / 5;
  d.kpis.slice(0, 5).forEach((k, i) => {
    const X = MX + i * (bw + 8);
    x.fillStyle = i === 0 ? INK : F08; x.fillRect(X, Y, bw, 70);
    text(x, k.label.toUpperCase(), X + 8, Y + 18, { size: 8.5, w: 800, color: i === 0 ? PAPER : MUT, max: bw - 12 });
    text(x, k.value, X + 8, Y + 52, { size: 22, w: 800, color: i === 0 ? PAPER : INK, max: bw - 12 });
  });
  Y += 96;
  if (d.approx) { text(x, d.approx, MX, Y - 6, { size: 9.5, w: 600, color: MUT, max: LW - 2 * MX }); Y += 22; }
  // Courbe de la précision.
  Y = sec(x, 'Précision séance par séance (écart moyen à la cible, cm ; plus bas = mieux)', Y);
  curve(x, d.curve, MX + 6, Y, LW - 2 * MX - 12, 150, v => dec1(v / 10));
  Y += 190;
  // Tendances et badges à gauche, carte de chaleur à droite.
  const colW = 410;
  let YL = sec(x, 'Tendances · 10 dernières séances', Y, colW - 20);
  const tw = t => (!t || t.arrow === null ? '' : t.arrow === 'flat' ? '→ stable' : `${t.arrow === 'up' ? '↗' : '↘'} ${t.better ? 'mieux' : 'moins bien'}`);
  text(x, 'EXERCICE', MX, YL, { size: 8.5, w: 800, color: MUT }); text(x, 'PRÉC.', MX + 190, YL, { size: 8.5, w: 800, color: MUT }); text(x, 'GRP.', MX + 300, YL, { size: 8.5, w: 800, color: MUT });
  YL += 16;
  for (const t of d.trends.slice(0, 12)) {
    text(x, `${t.name} (${t.n})`, MX, YL, { size: 10.5, w: t.name === 'Toutes' ? 800 : 600, max: 180 });
    text(x, t.prec.mean === null ? '—' : cm(t.prec.mean), MX + 190, YL, { size: 10.5, w: 700 }); text(x, tw(t.prec), MX + 190, YL + 12, { size: 8.5, w: 700, color: t.prec.better === false ? RED : MUT });
    text(x, t.spread.mean === null ? '—' : cm(t.spread.mean), MX + 300, YL, { size: 10.5, w: 700 }); text(x, tw(t.spread), MX + 300, YL + 12, { size: 8.5, w: 700, color: t.spread.better === false ? RED : MUT });
    line(x, MX, YL + 18, MX + colW - 20, YL + 18, F08);
    YL += 28;
  }
  YL = sec(x, 'Badges d\'entraînement', YL + 8, colW - 20);
  for (const b of d.badges) {
    const on = b.tier > 0;
    for (let k = 0; k < 3; k++) { x.fillStyle = k < b.tier ? INK : PAPER; x.strokeStyle = INK; x.fillRect(MX + k * 11, YL - 9, 9, 9); x.strokeRect(MX + k * 11, YL - 9, 9, 9); }
    text(x, `${b.name}${on ? ` · ${b.tierName}` : ''}`, MX + 40, YL, { size: 10.5, w: on ? 800 : 600, color: on ? INK : MUT, max: colW - 60 });
    YL += 18;
  }
  // Carte de chaleur.
  const hx = MX + colW + 10, R = (LW - MX - hx) / 2 / 1.18;
  const YR = Y;
  sec(x, `Carte de chaleur · ${d.heatTotal} fl.`, Y, LW - MX - hx, hx);
  if (d.heatTotal) heatBoard(x, hx + R * 1.18, YR + 30 + R * 1.18, R, d.heat, d.scale);
  else text(x, 'Jeux X01 et Cricket seulement.', hx, YR + 40, { size: 10, w: 600, color: MUT });
  String(d.heatLegend).split(' ; ').forEach((l, i) => text(x, l, hx, YR + 50 + 2.36 * R + i * 13, { size: 8.5, w: 600, color: MUT, max: LW - MX - hx }));
  // Pied.
  line(x, MX, LH - 40, LW - MX, LH - 40);
  text(x, 'Strela · compteur de fléchettes · données du téléphone', MX, LH - 22, { size: 9, w: 600, color: MUT });
  return [c];
}
