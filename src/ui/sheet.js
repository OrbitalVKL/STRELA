// Strela — fiche de score d'une partie, à imprimer (lot 7.1) : image PNG (une seule longue page) ou PDF A4 (pages).
//
// Trois étages :
//   sheetModel(g, s, players)  ce que la fiche montre (pur, testé) : en-tête, classement, tournée, verres, manches ;
//   drawSheet(model, opts)     dessin sur canvas, noir sur blanc quel que soit le thème (une page, ou des pages A4) ;
//   pdfFromJpegs(pages)        PDF minimal : une image JPEG par page A4 (pur, testé).
// La fiche est livrée par exportSheet() : dans l'APK, Téléchargements/Strela puis menu de partage d'Android
// (strelaNative.saveFile) ; dans le navigateur, partage du fichier s'il est possible, sinon téléchargement.
import { legTable, cellView } from './table.js';
import { drinksTimeline } from '../engine/alcohol.js';
import { standings, lastPlaces } from '../engine/ranking.js';
import { playerSummary } from '../engine/stats.js';
import { avg, int, OUT_LABEL } from './dom.js';

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
  const ranking = order.map(r => {
    const sum = playerSummary(s, r.player);
    return {
      place: r.place && n > 1 ? placeLabel(r.place) : '', name: players[r.player].name, winner: finished && r.player === s.winner,
      legs: String(s.legsWon[r.player]), average: avg(sum.average), darts: String(sum.darts), best: String(sum.best),
      finish: int(sum.bestFinish), drinks: drinking ? String(timeline.totals[r.player]) : null,
    };
  });
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
    title: 'FICHE DE SCORE',
    format: `${g.config.startScore} · ${OUT_LABEL[g.config.outMode]}${legsTxt}${g.config.playOn ? ' · JUSQU\'AU BOUT' : ''}`,
    date: sheetDate(g.startedAt),
    status: finished ? `VAINQUEUR : ${players[s.winner].name}` : g.abandoned ? 'PARTIE ABANDONNÉE' : 'PARTIE EN COURS',
    payers: finished ? lastPlaces(s).map(i => players[i].name) : [],
    multi: n > 1,
    drinking,
    ranking,
    legs,
  };
}

// ------------------------------------------------------------------ dessin
// A4 à 150 points par pouce : 1240 × 1754 px.
export const PAGE_W = 1240;
export const PAGE_H = 1754;
const M = 72;              // marges
const FOOT = 56;           // pied de page
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

/**
 * Blocs de la fiche, dans l'ordre : { h, draw(ctx, y), keep } ; `repeat` (en-tête d'un tableau de manche) est redessiné
 * en haut d'une page qui coupe le tableau.
 */
function blocks(model, version) {
  const W = PAGE_W - 2 * M;
  const out = [];
  // En-tête
  out.push({ h: 150, draw(ctx, y) {
    text(ctx, 'STRELA', M, y + 52, { px: 50, w: 800 });
    text(ctx, model.title, M + W, y + 50, { px: 22, w: 800, align: 'right' });
    hline(ctx, M, M + W, y + 72, INK, 3);
    text(ctx, model.format, M, y + 108, { px: 19, w: 700, max: W });
    text(ctx, model.date, M, y + 138, { px: 17, color: DIM });
    text(ctx, model.status, M + W, y + 138, { px: 17, w: 800, align: 'right', max: W / 2 });
  } });
  // Classement
  const cols = [
    { k: 'place', label: model.multi ? 'PL.' : '', w: model.multi ? 70 : 0, align: 'left' },
    { k: 'name', label: 'JOUEUR', w: 0, align: 'left' },
    { k: 'legs', label: 'MAN.', w: 90 }, { k: 'average', label: 'MOY.', w: 110 }, { k: 'darts', label: 'FL.', w: 90 },
    { k: 'best', label: 'MEIL.', w: 100 }, { k: 'finish', label: 'FIN.', w: 100 },
    ...(model.drinking ? [{ k: 'drinks', label: 'VERRES', w: 120 }] : []),
  ];
  const fixed = cols.reduce((a, c) => a + c.w, 0);
  cols.find(c => c.k === 'name').w = W - fixed;
  let x = M;
  for (const c of cols) { c.x = x; x += c.w; }
  const cellX = c => (c.align === 'left' ? c.x : c.x + c.w - 8);
  out.push({ h: 72, draw(ctx, y) {
    text(ctx, model.multi ? 'CLASSEMENT' : 'RÉSUMÉ', M, y + 34, { px: 16, w: 800 });
    for (const c of cols) if (c.label) text(ctx, c.label, cellX(c), y + 64, { px: 13, w: 700, color: DIM, align: c.align === 'left' ? 'left' : 'right' });
    hline(ctx, M, M + W, y + 72, INK, 2);
  } });
  for (const r of model.ranking) {
    out.push({ h: 52, draw(ctx, y) {
      for (const c of cols) {
        const v = r[c.k];
        if (!v) continue;
        text(ctx, v, cellX(c), y + 35, { px: c.k === 'name' ? 21 : 19, w: c.k === 'name' || c.k === 'place' || r.winner ? 800 : 400, align: c.align === 'left' ? 'left' : 'right', max: c.w - 14 });
      }
      hline(ctx, M, M + W, y + 52);
    } });
  }
  out.push({ h: 34, draw(ctx, y) {
    text(ctx, `Man. = manches gagnées · Moy. = moyenne sur 3 fléchettes · Meil. = meilleure volée · Fin. = plus grosse finition${model.drinking ? ' · Verres = verres pris pendant la partie' : ''}.`, M, y + 26, { px: 12, color: DIM, max: W });
  } });
  if (model.payers.length) {
    const one = model.payers.length === 1;
    out.push({ h: 96, draw(ctx, y) {
      ctx.fillStyle = INK; ctx.fillRect(M, y + 16, W, 66);
      text(ctx, one ? 'LE DERNIER PAIE SA TOURNÉE' : 'DERNIERS À ÉGALITÉ : ILS PARTAGENT LA TOURNÉE', M + 20, y + 44, { px: 13, w: 800, color: '#FFFFFF' });
      text(ctx, model.payers.join(' · '), M + 20, y + 72, { px: 22, w: 800, color: '#FFFFFF', max: W - 40 });
    } });
  }
  // Manches : un tableau par manche (colonne TOUR + une colonne par joueur), découpé ligne par ligne entre les pages.
  const RD = 66;
  for (const leg of model.legs) {
    const n = leg.columns.length;
    const cw = (W - RD) / n;
    const colX = k => M + RD + k * cw;
    const head = {
      h: 112, keep: true, draw(ctx, y) {
        text(ctx, leg.title, M, y + 50, { px: 20, w: 800 });
        text(ctx, leg.info, M + W, y + 50, { px: 16, color: DIM, align: 'right', max: W / 2 });
        hline(ctx, M, M + W, y + 62, INK, 2);
        text(ctx, 'TOUR', M, y + 98, { px: 12, w: 700, color: DIM });
        leg.columns.forEach((name, k) => text(ctx, name.toUpperCase(), colX(k) + cw - 10, y + 98, { px: 15, w: 800, align: 'right', max: cw - 16 }));
        hline(ctx, M, M + W, y + 112, INK, 1.5);
      },
    };
    const repeat = { ...head, h: 112 };
    out.push(head);
    leg.rows.forEach(r => {
      out.push({ h: 92, repeat, draw(ctx, y) {
        text(ctx, String(r.round), M + 8, y + 54, { px: 22, w: 800 });
        r.cells.forEach((v, k) => {
          if (!v) return;
          const x0 = colX(k), xr = x0 + cw - 10;
          if (k) { ctx.strokeStyle = RULE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y + 4); ctx.lineTo(x0, y + 88); ctx.stroke(); }
          if (v.cls === 'fin') { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x0 + 4, y + 4, cw - 8, 84); }
          text(ctx, v.darts.join(' '), xr, y + 24, { px: 15, color: DIM, align: 'right', max: cw - 18 });
          text(ctx, v.big, xr, y + 58, { px: 30, w: 800, color: v.cls === 'bust' ? RED : INK, align: 'right', max: cw - 18 });
          text(ctx, v.small, xr, y + 82, { px: 15, w: v.cls === 'fin' ? 800 : 400, align: 'right', max: cw / 2 });
          if (v.drinks) {
            const gx = x0 + 10, gy = y + 66;
            if (v.drinks.fresh) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(gx - 4, gy - 3, 48, 24); }
            glass(ctx, gx, gy, 18, INK);
            text(ctx, String(v.drinks.total), gx + 21, gy + 15, { px: 15, w: 800 });
          }
        });
        hline(ctx, M, M + W, y + 92);
      } });
    });
    out.push({ h: 20, draw() {} });
  }
  out.push({ h: 40, draw(ctx, y) {
    text(ctx, `Chaque case : fléchettes du tour, total de la volée, reste après la volée${model.drinking ? ' ; verre : verres du joueur jusque-là (encadré : pris pendant ce tour)' : ''}.`, M, y + 26, { px: 12, color: DIM, max: W });
  } });
  out.foot = `STRELA ${version ? `v${version} · ` : ''}fiche de score`;
  return out;
}

/**
 * Fiche dessinée. paged : pages A4 (PDF), sinon une seule page aussi haute qu'il faut (image).
 * Renvoie une liste de canvas (créés par `makeCanvas(w, h)`, document.createElement('canvas') par défaut).
 */
export function drawSheet(model, { paged = false, version = '', makeCanvas = null } = {}) {
  const mk = makeCanvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const list = blocks(model, version);
  // Pages : chaque bloc va sur la page en cours s'il y tient ; sinon page suivante (un en-tête de manche n'est jamais
  // laissé seul en bas de page : il part avec sa première ligne ; une ligne coupée garde l'en-tête de son tableau).
  const top = M, bottom = (paged ? PAGE_H : Infinity) - M - FOOT;
  const pages = [[]];
  let y = top;
  list.forEach((b, i) => {
    const need = b.h + (b.keep && list[i + 1] ? list[i + 1].h : 0);
    if (paged && y + need > bottom && pages.at(-1).length) {
      pages.push([]);
      y = top;
      if (b.repeat) { pages.at(-1).push({ b: b.repeat, y }); y += b.repeat.h; }
    }
    pages.at(-1).push({ b, y });
    y += b.h;
  });
  const heightOf = pg => (paged ? PAGE_H : pg.reduce((m, it) => Math.max(m, it.y + it.b.h), 0) + M + FOOT);
  return pages.map((pg, k) => {
    const H = heightOf(pg);
    const c = mk(PAGE_W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PAGE_W, H);
    for (const it of pg) it.b.draw(ctx, it.y);
    hline(ctx, M, PAGE_W - M, H - M - 22, RULE);
    text(ctx, list.foot, M, H - M + 4, { px: 13, color: DIM });
    if (paged) text(ctx, `page ${k + 1} / ${pages.length}`, PAGE_W - M, H - M + 4, { px: 13, color: DIM, align: 'right' });
    return c;
  });
}

// ------------------------------------------------------------------ PDF
const enc = s => new TextEncoder().encode(s);

/**
 * PDF de pages A4, une image JPEG pleine page chacune : pages = [{ jpeg: Uint8Array, w, h }] (pixels de l'image).
 * Renvoie un Uint8Array. Objets : 1 catalogue, 2 arbre des pages, puis pour chaque page : page, contenu, image.
 */
export function pdfFromJpegs(pages, { title = 'Fiche de score Strela' } = {}) {
  const A4W = 595.28, A4H = 841.89;
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
    // L'image garde ses proportions, calée en haut de la page.
    const h = Math.min(A4H, (A4W * p.h) / p.w);
    const content = `q ${A4W.toFixed(2)} 0 0 ${h.toFixed(2)} 0 ${(A4H - h).toFixed(2)} cm /Im${k} Do Q`;
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4W} ${A4H}] /Resources << /XObject << /Im${k} ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
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
    const [c] = drawSheet(model, { paged: false, version });
    return { name: sheetFileName(g.startedAt, 'png'), mime: 'image/png', bytes: dataUrlBytes(c.toDataURL('image/png')) };
  }
  const pages = drawSheet(model, { paged: true, version }).map(c => ({ jpeg: dataUrlBytes(c.toDataURL('image/jpeg', 0.9)), w: c.width, h: c.height }));
  return { name: sheetFileName(g.startedAt, 'pdf'), mime: 'application/pdf', bytes: pdfFromJpegs(pages) };
}
