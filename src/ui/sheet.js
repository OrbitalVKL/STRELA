// Strela — fiche de score d'une partie, à imprimer (lot 7.1, simplifiée au lot 7.3) : image PNG ou PDF.
//
// Trois étages :
//   sheetModel(g, s, players)  ce que la fiche montre (pur, testé) : en-tête, classement, tournée, verres, manches ;
//   drawSheet(model, opts)     dessin sur canvas, noir sur blanc quel que soit le thème (demi-page A5 paysage, page A4,
//                              ou pages A4 : voir « dessin ») ;
//   pdfFromJpegs(pages)        PDF minimal : une image JPEG par page, page à la taille de l'image (pur, testé).
// La fiche est livrée par exportSheet() : dans l'APK, Téléchargements/Strela puis menu de partage d'Android
// (strelaNative.saveFile) ; dans le navigateur, partage du fichier s'il est possible, sinon téléchargement.
import { legTable, cellView } from './table.js';
import { drinksTimeline } from '../engine/alcohol.js';
import { standings, lastPlaces } from '../engine/ranking.js';
import { OUT_LABEL } from './dom.js';

// ------------------------------------------------------------------ modèle
const pad2 = n => String(n).padStart(2, '0');
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const sheetDate = ms => { const d = new Date(ms); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad2(d.getHours())} h ${pad2(d.getMinutes())}`; };
/** strela-fiche-AAAAMMJJ-HHMM.png|pdf (date du début de la partie). */
export const sheetFileName = (ms, ext) => { const d = new Date(ms); return `strela-fiche-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.${ext}`; };
const placeLabel = n => (n === 1 ? '1ER' : `${n}E`);

/**
 * Ce que la fiche montre.
 *   g : partie ({ config, darts, startedAt, endedAt, abandoned, drinks }) ; s : son état ; players : fiches des joueurs
 *   (même ordre que config.players).
 */
export function sheetModel(g, s, players) {
  const n = g.config.players.length;
  const finished = s.status === 'finished';
  const timeline = drinksTimeline(s, g.drinks, g.config.players);
  const drinking = timeline.totals.some(x => x > 0);
  const order = finished ? standings(s) : g.config.players.map((_, i) => ({ player: i, place: null }));
  // Lot 7.3 : place, joueur, manches gagnées, verres ; plus de moyenne ni d'autres statistiques.
  const ranking = order.map(r => ({
    place: r.place && n > 1 ? placeLabel(r.place) : '', name: players[r.player].name, winner: finished && r.player === s.winner,
    legs: String(s.legsWon[r.player]), drinks: drinking ? timeline.totals[r.player] : null,
  }));
  const legs = s.legs.filter(l => l.visits.length).map(l => {
    const t = legTable(s, l.number, { drinks: timeline.byVisit });
    const wd = l.winner !== null ? l.visits.filter(v => v.player === l.winner).reduce((k, v) => k + v.darts.length, 0) : 0;
    return {
      title: `MANCHE ${l.number}`,
      info: l.winner !== null ? `${players[l.winner].name} en ${wd} fl.` : g.abandoned ? 'interrompue' : 'en cours',
      columns: t.columns.map(i => players[i].name),
      rows: t.rows.map(r => ({ round: r.round, cells: r.cells.map(c => (c ? cellView(c) : null)) })),
    };
  });
  const legsTxt = g.config.legsToWin > 1 ? ` · ${g.config.legsToWin} MANCHES GAGNANTES` : '';
  return {
    format: `${g.config.startScore} · ${OUT_LABEL[g.config.outMode]}${legsTxt}${g.config.playOn ? ' · JUSQU\'AU BOUT' : ''}`,
    date: sheetDate(g.startedAt),
    status: finished ? (n > 1 ? `VAINQUEUR : ${players[s.winner].name}` : `${players[s.winner].name} : PARTIE FINIE`) : g.abandoned ? 'PARTIE ABANDONNÉE' : 'PARTIE EN COURS',
    payers: finished ? lastPlaces(s).map(i => players[i].name) : [],
    multi: n > 1,
    legsShown: g.config.legsToWin > 1,
    drinking,
    ranking,
    legs,
  };
}

// ------------------------------------------------------------------ dessin
// Lot 7.3 (demande de Guillaume) : l'essentiel seulement (vainqueur, classement avec les verres, tournée, scores de chaque
// manche ; plus de titre STRELA, de légendes ni de pied de page), et le moins de papier possible :
//   1. demi-feuille A4 en paysage (A5 paysage, 1240 × 874 px) si tout y tient, en deux colonnes : à gauche le vainqueur,
//      le classement et la tournée, à droite le tableau de chaque manche ;
//   2. sinon une seule page A4 en hauteur (1240 × 1754 px), en une colonne, au besoin réduite (jusqu'à 62 %) ;
//   3. sinon des pages A4, l'en-tête d'un tableau de manche répété en haut d'une page qui le coupe.
// 150 points par pouce : A4 = 1240 × 1754 px, A5 paysage = 1240 × 874 px (même largeur).
export const PAGE_W = 1240;
export const PAGE_H = 1754;
export const HALF_H = 874;
const M = 44;              // marges
const GAP = 40;            // entre les deux colonnes de la demi-page
const LEFT_W = 400;        // colonne de gauche de la demi-page
const MIN_SCALE = 0.62;    // réduction la plus forte pour tenir sur une page A4
const INK = '#14171A';
const DIM = '#5E6266';
const RULE = '#B8BBBE';
const RED = '#9E4A4A';
const FONT = '"Martian Mono", ui-monospace, monospace';
const font = (px, w = 400) => `${w} ${px}px ${FONT}`;

/** Texte rétréci (puis coupé « … ») pour tenir dans `max` px. */
function fitText(ctx, text, max, px, w) {
  let size = px;
  ctx.font = font(size, w);
  while (ctx.measureText(text).width > max && size > px * 0.62) { size -= 1; ctx.font = font(size, w); }
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
function text(ctx, str, x, y, { px = 18, w = 400, color = INK, align = 'left', max = 0 } = {}) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const s = max ? fitText(ctx, str, max, px, w) : (ctx.font = font(px, w), str);
  ctx.fillText(s, x, y);
}
const hline = (ctx, x1, x2, y, color = RULE, lw = 1) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); };
function glass(ctx, x, y, size, color) { // même dessin que l'icône « glass » (grille 24)
  const k = size / 24;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'miter';
  ctx.beginPath(); ctx.moveTo(6, 3); ctx.lineTo(18, 3); ctx.lineTo(16.5, 21); ctx.lineTo(7.5, 21); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6.7, 9); ctx.lineTo(17.3, 9); ctx.stroke();
  ctx.restore();
}


/** Verre + « x3 » à (x, y) = ligne de base ; renvoie la largeur. */
function glassCount(ctx, n, x, y, px, { align = 'left', color = INK } = {}) {
  const g = Math.round(px * 1.15);
  ctx.font = font(px, 800);
  const tw = ctx.measureText(`x${n}`).width;
  const wAll = g + 2 + tw;
  const x0 = align === 'right' ? x - wAll : x;
  glass(ctx, x0, y - g + Math.round(px * 0.18), g, color);
  text(ctx, `x${n}`, x0 + g + 2, y, { px, w: 800, color });
  return wAll;
}

/** En-tête : vainqueur en gros, puis jeu et date. */
const headBlock = (m, x, w) => ({ h: 116, draw(ctx, y) {
  text(ctx, m.status, x, y + 36, { px: 30, w: 800, max: w });
  text(ctx, m.format, x, y + 70, { px: 16, w: 700, color: DIM, max: w });
  text(ctx, m.date, x, y + 96, { px: 16, color: DIM, max: w });
  hline(ctx, x, x + w, y + 110, INK, 2.5);
} });

/** Classement : place, joueur, manches (partie en plusieurs manches), verres (si quelqu'un a bu). */
function rankingBlocks(m, x, w) {
  const out = [];
  const cols = [];
  if (m.multi) cols.push({ k: 'place', w: 62 });
  cols.push({ k: 'name', w: 0 });
  if (m.legsShown) cols.push({ k: 'legs', w: 92, label: 'MAN.', right: true });
  if (m.drinking) cols.push({ k: 'drinks', w: 104, label: 'VERRES', right: true });
  cols.find(c => c.k === 'name').w = w - cols.reduce((a, c) => a + c.w, 0);
  let cx = x;
  for (const c of cols) { c.x = cx; cx += c.w; }
  out.push({ h: 38, draw(ctx, y) {
    text(ctx, m.multi ? 'CLASSEMENT' : 'JOUEUR', x, y + 26, { px: 13, w: 800, color: DIM });
    for (const c of cols) if (c.label) text(ctx, c.label, c.x + c.w, y + 26, { px: 12, w: 700, color: DIM, align: 'right' });
    hline(ctx, x, x + w, y + 37, INK, 1.5);
  } });
  for (const r of m.ranking) {
    out.push({ h: 44, draw(ctx, y) {
      for (const c of cols) {
        if (c.k === 'drinks') { if (r.drinks !== null) glassCount(ctx, r.drinks, c.x + c.w, y + 30, 18, { align: 'right' }); continue; }
        const v = r[c.k];
        if (!v) continue;
        text(ctx, v, c.right ? c.x + c.w : c.x, y + 30, { px: c.k === 'name' ? 20 : 18, w: c.k === 'legs' && !r.winner ? 400 : 800, align: c.right ? 'right' : 'left', max: c.w - 10 });
      }
      hline(ctx, x, x + w, y + 44);
    } });
  }
  return out;
}

/** Le dernier paie sa tournée (vidéo inverse). */
const tourneeBlock = (m, x, w) => ({ h: 92, draw(ctx, y) {
  ctx.fillStyle = INK; ctx.fillRect(x, y + 18, w, 70);
  const one = m.payers.length === 1;
  text(ctx, one ? 'LE DERNIER PAIE SA TOURNÉE' : 'LES DERNIERS PARTAGENT LA TOURNÉE', x + 16, y + 44, { px: 13, w: 800, color: '#FFFFFF', max: w - 32 });
  text(ctx, m.payers.join(' · '), x + 16, y + 76, { px: 22, w: 800, color: '#FFFFFF', max: w - 32 });
} });

/**
 * Un tableau par manche : colonne TOUR + une colonne par joueur. Case : verres (à gauche) et fléchettes en haut, reste
 * (à gauche) et total de la volée (en gros, à droite) en bas ; finition encadrée, bust en rouge. rh : hauteur d'une ligne.
 */
function legBlocks(m, x, w, rh) {
  const out = [];
  const RD = 46;
  m.legs.forEach((leg, li) => {
    const n = leg.columns.length;
    const cw = (w - RD) / n;
    const colX = k => x + RD + k * cw;
    const head = { h: 66, keep: true, draw(ctx, y) {
      text(ctx, leg.title, x, y + 24, { px: 15, w: 800 });
      text(ctx, leg.info, x + w, y + 24, { px: 13, color: DIM, align: 'right', max: w / 2 });
      text(ctx, 'T.', x, y + 56, { px: 12, w: 700, color: DIM });
      leg.columns.forEach((name, k) => text(ctx, name.toUpperCase(), colX(k) + cw - 8, y + 56, { px: 14, w: 800, align: 'right', max: cw - 12 }));
      hline(ctx, x, x + w, y + 65, INK, 1.5);
    } };
    if (li) out.push({ h: 14, draw() {} });
    out.push(head);
    const big = Math.round(rh * 0.42), small = Math.round(rh * 0.25);
    leg.rows.forEach(r => out.push({ h: rh, repeat: head, draw(ctx, y) {
      text(ctx, String(r.round), x + 2, y + rh * 0.66, { px: Math.round(rh * 0.34), w: 800, color: DIM });
      r.cells.forEach((v, k) => {
        if (!v) return;
        const x0 = colX(k), xr = x0 + cw - 8;
        if (k) { ctx.strokeStyle = RULE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y + 3); ctx.lineTo(x0, y + rh - 3); ctx.stroke(); }
        if (v.cls === 'fin') { ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(x0 + 3, y + 3, cw - 6, rh - 6); }
        let left = 8;
        if (v.drinks) {
          const gx = x0 + 8;
          const gw = glassCount(ctx, v.drinks.total, gx, y + small + 6, small - 1);
          if (v.drinks.fresh) { ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.strokeRect(gx - 3, y + 4, gw + 6, small + 6); }
          left = 8 + gw + 10;
        }
        text(ctx, v.darts.join(' '), xr, y + small + 6, { px: small, color: DIM, align: 'right', max: cw - left - 8 });
        text(ctx, v.big, xr, y + rh - 8, { px: big, w: 800, color: v.cls === 'bust' ? RED : INK, align: 'right', max: cw * 0.62 });
        text(ctx, v.small, x0 + 8, y + rh - 9, { px: small + 1, w: v.cls === 'fin' ? 800 : 400, color: v.cls === 'fin' ? INK : DIM, max: cw * 0.4 });
      });
      hline(ctx, x, x + w, y + rh);
    } }));
  });
  return out;
}

const sumH = list => list.reduce((a, b) => a + b.h, 0);
const place = (list, y0) => { let y = y0; return list.map(b => { const it = { b, y }; y += b.h; return it; }); };

function blank(mk, w, h) {
  const c = mk(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

/** Une colonne pleine largeur (page A4) : en-tête, classement, tournée, manches. */
function oneColumn(m) {
  const W = PAGE_W - 2 * M;
  return [headBlock(m, M, W), { h: 16, draw() {} }, ...rankingBlocks(m, M, W), ...(m.payers.length ? [tourneeBlock(m, M, W)] : []),
    { h: 28, draw() {} }, ...legBlocks(m, M, W, 62)];
}

/** Demi-page A5 paysage : [gauche, droite], ou null si ça ne tient pas. */
function halfPage(m) {
  const RW = PAGE_W - 2 * M - LEFT_W - GAP;
  const left = [headBlock(m, M, LEFT_W), { h: 12, draw() {} }, ...rankingBlocks(m, M, LEFT_W), ...(m.payers.length ? [tourneeBlock(m, M, LEFT_W)] : [])];
  // Colonnes de joueurs trop étroites (7 ou 8 joueurs) : la page A4 lit mieux.
  const players = m.legs.length ? m.legs[0].columns.length : m.ranking.length;
  if ((RW - 46) / players < 108) return null;
  const right = legBlocks(m, M + LEFT_W + GAP, RW, 50);
  return Math.max(sumH(left), sumH(right)) <= HALF_H - 2 * M ? { left, right } : null;
}

/**
 * Fiche dessinée : liste de canvas (créés par `makeCanvas(w, h)`, document.createElement('canvas') par défaut) et la
 * forme retenue (layout : 'half' | 'page' | 'scaled' | 'pages'). paged : PDF (pages A4 si besoin) ; sinon image (une
 * seule image, aussi haute qu'il faut si la demi-page ne suffit pas).
 */
export function drawSheet(model, { paged = false, makeCanvas = null } = {}) {
  const mk = makeCanvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const half = halfPage(model);
  if (half) {
    const { c, ctx } = blank(mk, PAGE_W, HALF_H);
    for (const col of [half.left, half.right]) for (const it of place(col, M)) it.b.draw(ctx, it.y);
    return Object.assign([c], { layout: 'half' });
  }
  const list = oneColumn(model);
  const H = sumH(list) + 2 * M;
  const full = () => { const { c, ctx } = blank(mk, PAGE_W, Math.max(H, paged ? PAGE_H : 0)); for (const it of place(list, M)) it.b.draw(ctx, it.y); return c; };
  if (!paged || H <= PAGE_H) return Object.assign([full()], { layout: paged ? 'page' : 'image' });
  const scale = (PAGE_H - 2 * M) / (H - 2 * M);
  if (scale >= MIN_SCALE) {
    // Une seule page A4 : la colonne entière, réduite et centrée.
    const tall = full();
    const { c, ctx } = blank(mk, PAGE_W, PAGE_H);
    const w = PAGE_W * scale, h = tall.height * scale;
    if (ctx.drawImage) ctx.drawImage(tall, (PAGE_W - w) / 2, 0, w, h);
    return Object.assign([c], { layout: 'scaled', scale });
  }
  // Plusieurs pages A4 (un en-tête de manche n'est jamais laissé seul en bas d'une page ; une ligne coupée garde
  // l'en-tête de son tableau en haut de la page suivante).
  const bottom = PAGE_H - M - 30;
  const pages = [[]];
  let y = M;
  list.forEach((b, i) => {
    const need = b.h + (b.keep && list[i + 1] ? list[i + 1].h : 0);
    if (y + need > bottom && pages.at(-1).length) {
      pages.push([]);
      y = M;
      if (b.repeat) { pages.at(-1).push({ b: b.repeat, y }); y += b.repeat.h; }
    }
    pages.at(-1).push({ b, y });
    y += b.h;
  });
  return Object.assign(pages.map((pg, k) => {
    const { c, ctx } = blank(mk, PAGE_W, PAGE_H);
    for (const it of pg) it.b.draw(ctx, it.y);
    text(ctx, `${k + 1} / ${pages.length}`, PAGE_W - M, PAGE_H - M + 10, { px: 13, color: DIM, align: 'right' });
    return c;
  }), { layout: 'pages' });
}

// ------------------------------------------------------------------ PDF
const enc = s => new TextEncoder().encode(s);

/**
 * PDF, une image JPEG pleine page par page : pages = [{ jpeg: Uint8Array, w, h }] (pixels de l'image). La page a la
 * largeur d'un A4 (21 cm) et la hauteur de l'image dans les mêmes proportions : 1240 × 1754 px → A4, 1240 × 874 px →
 * A5 paysage (demi-feuille A4). Renvoie un Uint8Array. Objets : 1 catalogue, 2 arbre des pages, puis pour chaque
 * page : page, contenu, image.
 */
export function pdfFromJpegs(pages, { title = 'Fiche de score Strela' } = {}) {
  const A4W = 595.28;
  const chunks = [];
  let size = 0;
  const offsets = [];
  const push = b => { const u = typeof b === 'string' ? enc(b) : b; chunks.push(u); size += u.length; };
  const obj = (id, body) => { offsets[id] = size; push(`${id} 0 obj\n`); for (const part of [].concat(body)) push(part); push('\nendobj\n'); };
  push('%PDF-1.4\n');
  push(Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // commentaire binaire : le fichier n'est pas du texte
  const n = pages.length;
  const pageId = k => 3 + k * 3;
  obj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, k) => `${pageId(k)} 0 R`).join(' ')}] >>`);
  pages.forEach((p, k) => {
    const id = pageId(k);
    // Hauteur à l'échelle de l'image, recalée sur l'A4 (29,7 cm) ou l'A5 paysage (14,8 cm) à 1 pt près.
    const raw = (A4W * p.h) / p.w;
    const h = [841.89, 419.53].find(v => Math.abs(v - raw) < 1) ?? Math.round(raw * 100) / 100;
    const content = `q ${A4W.toFixed(2)} 0 0 ${h.toFixed(2)} 0 0 cm /Im${k} Do Q`;
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4W} ${h}] /Resources << /XObject << /Im${k} ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    obj(id + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    obj(id + 2, [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
  });
  const infoId = 3 + n * 3;
  obj(infoId, `<< /Title (${title.replace(/[()\\]/g, '')}) /Producer (Strela) >>`);
  const xref = size;
  const count = infoId + 1;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// ------------------------------------------------------------------ export
const dataUrlBytes = url => { const b = atob(url.slice(url.indexOf(',') + 1)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
export const toBase64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

/** Polices de la fiche chargées (sinon le canvas dessine avec une police de secours). */
export async function sheetFonts() {
  try { await Promise.all([font(20, 400), font(20, 700), font(20, 800)].map(f => document.fonts.load(f))); } catch (e) { /* police de secours */ }
}

/** Fichier de la fiche : { name, mime, bytes }. kind : 'png' ou 'pdf'. */
export async function sheetFile(g, s, players, kind, version = '') {
  await sheetFonts();
  const model = sheetModel(g, s, players);
  if (kind === 'png') {
    const [c] = drawSheet(model, { paged: false });
    return { name: sheetFileName(g.startedAt, 'png'), mime: 'image/png', bytes: dataUrlBytes(c.toDataURL('image/png')) };
  }
  const pages = drawSheet(model, { paged: true }).map(c => ({ jpeg: dataUrlBytes(c.toDataURL('image/jpeg', 0.9)), w: c.width, h: c.height }));
  return { name: sheetFileName(g.startedAt, 'pdf'), mime: 'application/pdf', bytes: pdfFromJpegs(pages) };
}
