// Lot 7.8 (dans l'appli depuis la 0.8.0) : tableau de bord d'une soirée (#/soiree/<id>) — ce qui s'est passé ce
// soir-là, joueur par joueur, à regarder et à imprimer (IMAGE · PDF, même livraison que la fiche de score).
// - Podium (victoires, puis moyenne), faits marquants (meilleure et pire volée, plus de bust, de 180, de verres,
//   meilleure moyenne), tableau des joueurs, parties de la soirée.
// - soireeModel() est pur (testé) ; le rapport à imprimer fait 3 feuilles A4 (soireereport.js, choix du 13/11 : A podium
//   et cartes, B chronologie, C duels et cibles), en aperçu à l'écran, en IMAGE (les 3 empilées) ou en PDF (3 pages).
// Pire volée : sans les bust ni les volées de finition (comme les Stats).
import { store, playerById } from '../../store.js';
import { esc, ico, topBar, avg, pct, plural, when } from '../../dom.js';
import { avatarHtml, ICONS, iconSvg, initials, colorIndex } from '../../avatars.js';
import { AVATAR_COLORS, AVATAR_INK } from '../../theme.js';
import { drawSoireeReport, faceImage } from '../../soireereport.js';
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
      <div class="sec">Rapport à imprimer <span class="n">3 feuilles</span></div>
      <p class="note">A · podium et cartes des joueurs · B · la soirée heure par heure, courbes, trophées · C · qui bat qui, chiffres comparés, cibles.</p>
      ${st.preview ? `<div class="dpages">${st.preview.map((u, k) => `<img src="${u}" alt="Feuille ${'ABC'[k]}">`).join('')}</div>`
        : `<button type="button" class="btn" data-act="dash-preview" data-arg="${esc(sid)}"${st.busy ? ' disabled' : ''}>${ico('image')} VOIR LES 3 FEUILLES</button>`}
      <div class="btns two">${btn('png', 'IMAGE')}${btn('pdf', 'PDF')}</div>
      <p class="note" role="status">${st.busy ? 'Préparation…' : st.msg ? esc(st.msg) : 'IMAGE : les 3 feuilles l\'une sous l\'autre ; PDF : 3 pages A4.'}</p>
    </div></div>`;
}

// ------------------------------------------------------------------ rapport à imprimer (3 feuilles, soireereport.js)
/** Ce qu'il faut au rapport pour dessiner un joueur : pseudo, initiales, couleur, pictogramme ou photo chargés. */
async function faces(ids) {
  const out = {};
  await Promise.all(ids.map(async id => {
    const p = playerById(id) || { name: id };
    const av = p.avatar || {};
    const color = av.kind === 'deleted' ? AVATAR_COLORS[7] : AVATAR_COLORS[colorIndex(av.color)];
    const photo = av.kind === 'photo' && av.photo ? av.photo : null;
    const svg = !photo && av.kind === 'icon' && ICONS[av.icon]
      ? iconSvg(av.icon).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" color="${AVATAR_INK}" style="color:${AVATAR_INK}" `) : null;
    const img = await faceImage(photo || svg, !!photo);
    out[id] = { name: p.name || '?', initials: initials(p.name), color, img, photo: !!(img && photo) };
  }));
  return id => out[id] || { name: '?', initials: '?', color: AVATAR_COLORS[7], img: null };
}

export async function reportPages(sid) {
  const games = store.games.filter(g => g.soiree === sid);
  if (!games.length) return null;
  await sheetFonts();
  const m = soireeModel(games, id => playerById(id).name);
  const who = await faces(m.rows.map(r => r.id));
  return { m, pages: drawSoireeReport(m, who) };
}

const dataUrlBytes = url => { const b = atob(url.slice(url.indexOf(',') + 1)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

async function exportDash(kind, sid) {
  status.set(sid, { ...(status.get(sid) || {}), busy: true, msg: '' }); refresh();
  let msg;
  try {
    const r = await reportPages(sid);
    if (!r) return;
    const d = new Date(r.m.start);
    const base = `strela-soiree-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    let f;
    if (kind === 'png') {
      // Une image : les 3 feuilles l'une sous l'autre, séparées d'un filet.
      const gap = 24, all = document.createElement('canvas');
      all.width = PAGE_W; all.height = PAGE_H * 3 + gap * 2;
      const x = all.getContext('2d'); x.fillStyle = '#B8BBBE'; x.fillRect(0, 0, all.width, all.height);
      r.pages.forEach((c, k) => x.drawImage(c, 0, k * (PAGE_H + gap)));
      f = { name: `${base}.png`, mime: 'image/png', bytes: dataUrlBytes(all.toDataURL('image/png')) };
    } else {
      f = { name: `${base}.pdf`, mime: 'application/pdf',
        bytes: pdfFromJpegs(r.pages.map(c => ({ jpeg: dataUrlBytes(c.toDataURL('image/jpeg', 0.9)), w: c.width, h: c.height })), { title: 'Soirée Strela' }) };
    }
    msg = await deliverFile(f);
    if (msg === null) { status.set(sid, { ...(status.get(sid) || {}), busy: false, msg: '' }); refresh(); return; }
  } catch (e) {
    msg = `Export impossible : ${(e && e.message) || e}.`;
  }
  status.set(sid, { ...(status.get(sid) || {}), busy: false, msg }); refresh();
}

/** Aperçu des 3 feuilles à l'écran (images réduites). */
async function previewDash(sid) {
  status.set(sid, { ...(status.get(sid) || {}), busy: true }); refresh();
  try {
    const r = await reportPages(sid);
    const small = r ? r.pages.map(c => {
      const t = document.createElement('canvas'); t.width = 620; t.height = Math.round(620 * PAGE_H / PAGE_W);
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      return t.toDataURL('image/jpeg', 0.85);
    }) : [];
    status.set(sid, { ...(status.get(sid) || {}), busy: false, preview: small });
  } catch (e) {
    status.set(sid, { ...(status.get(sid) || {}), busy: false, msg: `Aperçu impossible : ${(e && e.message) || e}.` });
  }
  refresh();
}

export const actions = {
  'dash-export'(arg) { const [kind, sid] = String(arg).split('|'); exportDash(kind, sid); },
  'dash-preview'(sid) { previewDash(String(sid)); },
};
