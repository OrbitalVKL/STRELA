// Lot 7.8 (maquette, ?maquette seulement) : tableau de bord d'une soirée (#/soiree/<id>) — ce qui s'est passé ce
// soir-là, joueur par joueur, à regarder et à imprimer (IMAGE · PDF, même livraison que la fiche de score).
// - Podium (victoires, puis moyenne), faits marquants (meilleure et pire volée, plus de bust, de 180, de verres,
//   meilleure moyenne), tableau des joueurs, parties de la soirée.
// - soireeModel() est pur (testé) ; drawSoiree() dessine la feuille noir sur blanc sur un canvas (largeur A4).
// Pire volée : sans les bust ni les volées de finition (comme les Stats).
import { store, playerById } from '../../store.js';
import { esc, ico, topBar, avg, pct, plural, when } from '../../dom.js';
import { avatarHtml } from '../../avatars.js';
import { soireeModel } from '../../../engine/soiree.js';
import { pdfFromJpegs, sheetFonts, PAGE_W, PAGE_H } from '../../sheet.js';
import { deliverFile } from '../printsheet.js';
import { refresh, go } from '../../nav.js';

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const pad2 = n => String(n).padStart(2, '0');
const hhmm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export { soireeModel };
const dayFull = ms => { const d = new Date(ms); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

// ------------------------------------------------------------------ écran
const status = new Map(); // id de soirée → { busy, msg }

export function soireeDashScreen(sid) {
  const games = store.games.filter(g => g.soiree === sid);
  if (!games.length) { go('#/historique', { replace: true }); return ''; }
  const m = soireeModel(games, id => playerById(id).name);
  const pod = m.rows.slice(0, 3);
  const place = ['1ER', '2E', '3E'];
  const podium = `<ol class="podium">${pod.map((r, i) => `<li class="p${i + 1}"><a href="#/stats/${esc(r.id)}">${avatarHtml(playerById(r.id), i ? 44 : 56)}
      <b class="pl">${place[i]}</b><span class="nm ell">${esc(r.name)}</span><small>${plural(r.won, 'victoire', 'victoires')} · moy. ${avg(r.average)}</small></a></li>`).join('')}</ol>`;
  const cards = m.highlights.map(h => `<li><small>${esc(h.label)}</small><span class="who">${avatarHtml(playerById(h.id), 24)}<span class="nm ell">${esc(h.name)}</span></span><b>${esc(h.value)}</b>${h.detail ? `<span class="dt">${h.detail}</span>` : ''}</li>`).join('');
  const th = ['Joueur', 'P.', 'V.', 'Moy.', 'Meill.', 'Pire', '100+', '180', 'Bust', 'Tripl.', 'Verres'];
  const table = `<div class="dtable"><table><thead><tr>${th.map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>
    ${m.rows.map(r => `<tr><th><span class="pl">${avatarHtml(playerById(r.id), 22)}<span class="nm">${esc(r.name)}</span></span></th><td>${r.played}</td><td><b>${r.won}</b></td><td>${avg(r.average)}</td>
      <td>${r.best}</td><td>${r.worst ?? '—'}</td><td>${r.tons}</td><td>${r.max}</td><td>${r.busts}</td><td>${pct(r.tripleRate)}</td><td>${r.drinks}</td></tr>`).join('')}
    </tbody></table></div>`;
  const glist = m.list.map(x => `<li><a class="hrow" href="#/partie/${esc(x.id)}"><span class="t">${hhmm(x.at)}</span><span class="g">${x.startScore}</span>
      <span class="avs">${x.players.slice(0, 3).map(id => avatarHtml(playerById(id), 22)).join('')}${x.players.length > 3 ? `<small>+${x.players.length - 3}</small>` : ''}</span>
      <span class="r">${x.abandoned ? '<span class="tag red">ABANDON</span>' : x.winner ? `<span class="win">${ico('trophy')}<span class="nm ell">${esc(playerById(x.winner).name)}</span></span>` : ''}</span></a></li>`).join('');
  const st = status.get(sid) || {};
  const btn = (kind, label) => `<button type="button" class="btn" data-act="dash-export" data-arg="${esc(`${kind}|${sid}`)}"${st.busy ? ' disabled' : ''}>${ico('download')} ${label}</button>`;
  return `<div class="screen dash2">${topBar('Soirée', '#/historique')}
    <div class="dhead inv"><b>${ico('glass')} SOIRÉE DU ${dayFull(m.start).toUpperCase()}</b>
      <span>${hhmm(m.start)} – ${hhmm(m.end)} · ${plural(m.games, 'partie', 'parties')} · ${plural(m.rows.length, 'joueur', 'joueurs')} · ${plural(m.drinks, 'verre', 'verres')}</span></div>
    <div class="pad">
      ${podium}
      <div class="sec">Faits marquants</div><ul class="hls">${cards}</ul>
      <div class="sec">Joueurs</div>${table}
      <p class="note">P. parties, V. victoires, Moy. moyenne sur 3 fléchettes ; pire volée sans les bust ni les finitions ; Tripl. fléchettes dans un triple.</p>
      <div class="sec">Parties <span class="n">${m.games}</span></div><ul class="hrows dlist">${glist}</ul>
      <div class="sec">Imprimer</div>
      <div class="btns two">${btn('png', 'IMAGE')}${btn('pdf', 'PDF')}</div>
      <p class="note" role="status">${st.busy ? 'Préparation…' : st.msg ? esc(st.msg) : 'Le tableau de bord noir sur blanc, sur une page A4 : podium, faits marquants, tableau des joueurs et parties.'}</p>
    </div></div>`;
}

// ------------------------------------------------------------------ feuille à imprimer
const INK = '#14171A', DIM = '#5E6266', RULE = '#B8BBBE';
const FONT = '"Martian Mono", ui-monospace, monospace';
const M = 56;

/** Feuille du tableau de bord : un canvas de largeur A4 (1240 px), hauteur selon le contenu (au moins une page). */
export function drawSoiree(m, mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }) {
  const W = PAGE_W;
  const H = Math.max(PAGE_H, 420 + 92 * Math.ceil(m.highlights.length / 3) + 46 * (m.rows.length + 1) + 40 * m.list.length + 200);
  const c = mk(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  const t = (s, X, Y, px = 20, w = 400, color = INK, align = 'left') => { x.font = `${w} ${px}px ${FONT}`; x.fillStyle = color; x.textAlign = align; x.fillText(s, X, Y); };
  const line = (Y, color = RULE, lw = 1) => { x.strokeStyle = color; x.lineWidth = lw; x.beginPath(); x.moveTo(M, Y); x.lineTo(W - M, Y); x.stroke(); };
  let y = M + 30;
  t(`SOIRÉE DU ${dayFull(m.start).toUpperCase()}`, M, y, 34, 800);
  y += 40;
  t(`${hhmm(m.start)} – ${hhmm(m.end)} · ${m.games} parties · ${m.rows.length} joueurs · ${m.drinks} verres`, M, y, 20, 400, DIM);
  y += 22; line(y, INK, 3); y += 50;
  // Podium
  t('PODIUM', M, y, 18, 700, DIM); y += 38;
  m.rows.slice(0, 3).forEach((r, i) => { t(`${['1er', '2e', '3e'][i]}  ${r.name}`, M, y, i ? 24 : 30, 800); t(`${r.won} victoire${r.won > 1 ? 's' : ''} · moy. ${avg(r.average)}`, W - M, y, 20, 400, DIM, 'right'); y += i ? 38 : 44; });
  y += 16; line(y); y += 44;
  // Faits marquants
  t('FAITS MARQUANTS', M, y, 18, 700, DIM); y += 20;
  const colW = (W - 2 * M) / 3;
  m.highlights.forEach((h, i) => {
    const cx = M + (i % 3) * colW, cy = y + Math.floor(i / 3) * 92 + 30;
    t(h.label.toUpperCase(), cx, cy, 15, 700, DIM);
    t(`${h.value}`, cx, cy + 36, 30, 800);
    x.font = `800 30px ${FONT}`;
    const vw = x.measureText(`${h.value}`).width;
    t(h.name + (h.detail ? ` · ${h.detail}` : ''), cx + vw + 14, cy + 36, 18, 400, INK);
  });
  y += Math.ceil(m.highlights.length / 3) * 92 + 24; line(y); y += 46;
  // Tableau
  t('JOUEURS', M, y, 18, 700, DIM); y += 34;
  const cols = [['', 0], ['P.', 330], ['V.', 400], ['MOY.', 500], ['MEILL.', 600], ['PIRE', 690], ['100+', 780], ['180', 860], ['BUST', 940], ['TRIPL.', 1040], ['VERRES', W - M]];
  cols.forEach(([h, X], i) => i && t(h, X, y, 15, 700, DIM, 'right'));
  y += 14; line(y, INK, 2); y += 32;
  for (const r of m.rows) {
    t(r.name, M, y, 20, 700);
    const v = [r.played, r.won, avg(r.average), r.best, r.worst ?? '—', r.tons, r.max, r.busts, pct(r.tripleRate), r.drinks];
    v.forEach((val, i) => t(String(val), cols[i + 1][1], y, 20, i === 1 ? 800 : 400, INK, 'right'));
    y += 14; line(y); y += 32;
  }
  y += 24;
  // Parties
  t('PARTIES', M, y, 18, 700, DIM); y += 34;
  for (const g of [...m.list].reverse()) {
    t(hhmm(g.at), M, y, 18, 700);
    t(`${g.startScore}`, M + 110, y, 18, 400, DIM);
    t(g.players.map(id => (m.rows.find(r => r.id === id) || { name: id }).name).join(' · '), M + 190, y, 17, 400);
    t(g.abandoned ? 'abandonnée' : g.winner ? `gagnée par ${(m.rows.find(r => r.id === g.winner) || { name: '' }).name}` : '', W - M, y, 17, 700, INK, 'right');
    y += 40;
  }
  t('Strela · compteur de fléchettes', M, H - M + 10, 14, 400, DIM);
  return c;
}

const dataUrlBytes = url => { const b = atob(url.slice(url.indexOf(',') + 1)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

async function exportDash(kind, sid) {
  const games = store.games.filter(g => g.soiree === sid);
  if (!games.length) return;
  status.set(sid, { busy: true }); refresh();
  let msg;
  try {
    await sheetFonts();
    const m = soireeModel(games, id => playerById(id).name);
    const c = drawSoiree(m);
    const d = new Date(m.start);
    const base = `strela-soiree-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    let f;
    if (kind === 'png') f = { name: `${base}.png`, mime: 'image/png', bytes: dataUrlBytes(c.toDataURL('image/png')) };
    else {
      // Une page A4 : la feuille réduite si elle dépasse.
      let page = c;
      if (c.height > PAGE_H) {
        page = document.createElement('canvas'); page.width = PAGE_W; page.height = PAGE_H;
        const px = page.getContext('2d'); px.fillStyle = '#FFFFFF'; px.fillRect(0, 0, PAGE_W, PAGE_H);
        const k = PAGE_H / c.height; px.drawImage(c, (PAGE_W - c.width * k) / 2, 0, c.width * k, PAGE_H);
      }
      f = { name: `${base}.pdf`, mime: 'application/pdf', bytes: pdfFromJpegs([{ jpeg: dataUrlBytes(page.toDataURL('image/jpeg', 0.9)), w: page.width, h: page.height }], { title: 'Soirée Strela' }) };
    }
    msg = await deliverFile(f);
    if (msg === null) { status.set(sid, {}); refresh(); return; }
  } catch (e) {
    msg = `Export impossible : ${(e && e.message) || e}.`;
  }
  status.set(sid, { busy: false, msg }); refresh();
}

export const actions = {
  'dash-export'(arg) { const [kind, sid] = String(arg).split('|'); exportDash(kind, sid); },
};
