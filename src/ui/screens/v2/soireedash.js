// Lot 7.8 (dans l'appli depuis la 0.8.0) : tableau de bord d'une soirée (#/soiree/<id>) — ce qui s'est passé ce
// soir-là, joueur par joueur, à regarder et à imprimer (IMAGE · PDF, même livraison que la fiche de score).
// - Podium (victoires, puis moyenne), faits marquants (meilleure et pire volée, plus de bust, de 180, de verres,
//   meilleure moyenne), tableau des joueurs, parties de la soirée.
// - soireeModel() est pur (testé) ; le rapport à imprimer fait 3 feuilles A4 (soireereport.js, choix du 13/11 : A podium
//   et cartes, B chronologie, C duels et cibles), en aperçu à l'écran, en IMAGE (les 3 empilées) ou en PDF (3 pages).
// Pire volée : sans les bust ni les volées de finition (comme les Stats).
import { store, playerById, cumulativeDrinksFix, applyCumulativeFix, undoCumulativeFix, cumulativeFixed } from '../../store.js';
import { infoSec, infoBox } from '../../info.js';
import { tallyText, litersText } from '../../../engine/alcohol.js';
import { esc, ico, topBar, avg, pct, plural, when } from '../../dom.js';
import { avatarHtml, ICONS, iconSvg, initials, colorIndex } from '../../avatars.js';
import { AVATAR_COLORS, AVATAR_INK } from '../../theme.js';
import { drawSoireeReport, faceImage, reportFileBase } from '../../soireereport.js';
import { soireeModel } from '../../../engine/soiree.js';
import { pdfFromJpegs, sheetFonts, PAGE_W, PAGE_H } from '../../sheet.js';
import { deliverFile } from '../printsheet.js';
import { drawSoireeSummary, summaryFileName } from '../../soireesummary.js';
import { allHonours } from '../../honours.js';
import { refresh, go, backFrom } from '../../nav.js';

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
      <b class="pl">${place[i]}</b><span class="nm ell">${esc(r.name)}</span><small>${plural(r.won, 'victoire', 'victoires')}<br>moy. ${avg(r.average)}</small></a></li>`).join('')}</ol>`;
  const cards = m.highlights.map(h => `<li><small>${esc(h.label)}</small><span class="who">${avatarHtml(playerById(h.id), 24)}<span class="nm ell">${esc(h.name)}</span></span><b>${esc(h.value)}</b>${h.detail ? `<span class="dt">${h.detail}</span>` : ''}</li>`).join('');
  const th = ['Joueur', 'P.', 'V.', 'Moy.', 'Meill.', 'Pire', '100+', '180', 'Bust', 'Tripl.', 'Verres'];
  const table = `<div class="dtable"><table><thead><tr>${th.map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>
    ${m.rows.map(r => `<tr><th><a class="pl" href="#/stats/${esc(r.id)}">${avatarHtml(playerById(r.id), 22)}<span class="nm">${esc(r.name)}</span></a></th><td>${r.played}</td><td><b>${r.won}</b></td><td>${avg(r.average)}</td>
      <td>${r.best}</td><td>${r.worst ?? '—'}</td><td>${r.tons}</td><td>${r.max}</td><td>${r.busts}</td><td>${pct(r.tripleRate)}</td><td>${r.drinks}</td></tr>`).join('')}
    </tbody></table></div>`;
  const glist = m.list.map(x => `<li><a class="hrow" href="#/partie/${esc(x.id)}"><span class="t">${hhmm(x.at)}</span><span class="g">${x.startScore}</span>
      <span class="avs">${x.players.slice(0, 3).map(id => avatarHtml(playerById(id), 22)).join('')}${x.players.length > 3 ? `<small>+${x.players.length - 3}</small>` : ''}</span>
      <span class="r">${x.abandoned ? '<span class="tag red">ABANDON</span>' : x.winner ? `<span class="win">${ico('trophy')}<span class="nm ell">${esc(playerById(x.winner).name)}</span></span>` : ''}</span></a></li>`).join('');
  const st = status.get(sid) || {};
  // Version 0.8.1 : verres de la soirée, et correction des verres « resaisis à chaque partie » (avant le mode soirée).
  const fixed = cumulativeFixed(sid);
  const withDrinks = games.filter(g => g.drinks && Object.values(g.drinks).some(l => l.length)).length;
  let fix = '';
  if (fixed) {
    fix = `<p class="note">Verres corrigés : seuls les verres nouveaux de chaque partie sont comptés.</p>
      <button type="button" class="btn ghost" data-act="dash-unfix" data-arg="${esc(sid)}">ANNULER LA CORRECTION DES VERRES</button>`;
  } else if (withDrinks >= 2 && st.fixAsk) {
    const { totals } = cumulativeDrinksFix(sid);
    const lines = m.rows.filter(r => totals[r.id] && totals[r.id].before !== totals[r.id].after)
      .map(r => `<li><span class="nm ell">${esc(r.name)}</span><b>${totals[r.id].before} → ${totals[r.id].after}</b></li>`).join('');
    fix = `<div class="confirm" role="alertdialog" aria-label="Corriger les verres ?"><p class="alert-h">CORRIGER LES VERRES ?</p>
      ${lines ? `<ul class="fixlist">${lines}</ul><p class="small">Dans chaque partie, les verres déjà comptés dans la partie d'avant sont retirés. La correction peut être annulée.</p>`
        : '<p class="small">Rien à corriger : aucun joueur n\'a repris les verres des parties d\'avant.</p>'}
      <div class="btns two"><button type="button" class="btn" data-act="dash-fix-no" data-arg="${esc(sid)}">NON</button>${lines ? `<button type="button" class="btn alert" data-act="dash-fix" data-arg="${esc(sid)}">CORRIGER</button>` : ''}</div></div>`;
  } else if (withDrinks >= 2) {
    fix = `<button type="button" class="btn ghost" data-act="dash-fix-ask" data-arg="${esc(sid)}">${ico('glass')} VERRES RESAISIS À CHAQUE PARTIE ?</button>`;
  }
  const drinkRows = m.rows.map(r => `<li><a href="#/stats/${esc(r.id)}">${avatarHtml(playerById(r.id), 28)}<span class="col"><span class="nm ell">${esc(r.name)}</span>
      ${r.drinks ? `<small>${r.tally.pints ? `${tallyText(r.tally)} · ` : ''}${litersText(r.tally.liters)}</small>` : ''}</span><b>${ico('glass')}x${r.drinks}</b></a></li>`).join('');
  // Lot 9 : la moyenne de chacun au fil des verres (0, 1, 2, 3, 4, 5 et +), en tableau.
  const anyDrinks = m.drinks > 0;
  const lvTable = anyDrinks ? `<div class="dtable lvt"><table><thead><tr><th>Joueur</th>${['0', '1', '2', '3', '4', '5+'].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${m.rows.map(r => { const lv = m.levels[r.id]; return `<tr><th><a class="pl" href="#/stats/${esc(r.id)}">${avatarHtml(playerById(r.id), 22)}<span class="nm">${esc(r.name)}</span></a></th>
      ${lv.levels.map(L => `<td${L.level === lv.best ? ' class="best"' : ''}>${L.darts ? avg(L.average) : '·'}</td>`).join('')}</tr>`; }).join('')}
    </tbody></table></div>` : '';
  const btn = (kind, label) => `<button type="button" class="btn" data-act="dash-export" data-arg="${esc(`${kind}|${sid}`)}"${st.busy ? ' disabled' : ''}>${ico('download')} ${label}</button>`;
  return `<div class="screen dash2">${topBar('Soirée', backFrom('#/historique'))}
    <div class="dhead inv"><b>${ico('glass')} SOIRÉE DU ${dayFull(m.start).toUpperCase()}</b>
      <span>${hhmm(m.start)} – ${hhmm(m.end)} · ${plural(m.games, 'partie', 'parties')} · ${plural(m.rows.length, 'joueur', 'joueurs')} · ${plural(m.drinks, 'verre', 'verres')}${m.drinks ? ` (${litersText(m.liters)})` : ''}</span></div>
    <div class="pad">
      ${podium}
      ${infoSec('Faits marquants', 'dash-hl')}${infoBox('dash-hl', 'Le meilleur et le pire de la soirée. Pire volée : sans les bust ni les volées de finition. Touchez un joueur (podium, tableau, verres) pour ouvrir ses stats ; le retour revient ici.')}<ul class="hls">${cards}</ul>
      ${infoSec('Joueurs', 'dash-table')}${infoBox('dash-table', 'P. parties, V. victoires, Moy. moyenne sur 3 fléchettes ; pire volée sans les bust ni les finitions ; Tripl. fléchettes dans un triple. Le tableau défile de côté.')}${table}
      ${infoSec('Verres', 'dash-drinks', ` <span class="n">x${m.drinks}</span>`)}${infoBox('dash-drinks', 'Les verres de chacun sur toute la soirée, en verres de 25 cl : une pinte (50 cl) compte pour 2. Un oubli ou une erreur dans une partie : ouvrez la partie (liste ci-dessous), section Verres, et corrigez avec − et +. Si les verres ont été resaisis dans chaque nouvelle partie (avant le mode soirée), le bouton ci-dessous ne garde que les verres nouveaux de chaque partie.')}
      <ul class="dlist2">${drinkRows}</ul>${fix}
      ${anyDrinks ? `${infoSec('Au fil des verres', 'dash-levels')}${infoBox('dash-levels', 'Moyenne sur 3 fléchettes de chacun selon le nombre de verres déjà bus quand il lance (0, 1, 2… ; une pinte compte pour 2). Encadré : le niveau où il a le mieux joué ce soir (9 fléchettes au moins). Le détail est dans ses stats.')}${lvTable}` : ''}
      ${infoSec('Parties', 'dash-games', ` <span class="n">${m.games}</span>`)}${infoBox('dash-games', 'Touchez une partie pour son détail tour par tour, sa fiche de score et ses verres.')}<ul class="hrows dlist">${glist}</ul>
      ${infoSec('Résumé à partager', 'dash-summary')}${infoBox('dash-summary', 'Une image verticale (format téléphone) à envoyer dans la conversation des joueurs : podium et six faits marquants de la soirée. Elle est enregistrée dans Téléchargements/Strela puis le menu de partage s\'ouvre.')}
      ${st.summary ? `<div class="dsum"><img src="${st.summary}" alt="Résumé de la soirée"></div>` : ''}
      <div class="btns two"><button type="button" class="btn" data-act="dash-summary-see" data-arg="${esc(sid)}"${st.busy ? ' disabled' : ''}>${ico('image')} ${st.summary ? 'MASQUER' : 'APERÇU'}</button>
        <button type="button" class="btn primary" data-act="dash-summary" data-arg="${esc(sid)}"${st.busy ? ' disabled' : ''}>${ico('download')} PARTAGER</button></div>
      ${infoSec('Rapport à imprimer', 'dash-report', ' <span class="n">3 feuilles</span>')}${infoBox('dash-report', 'A · podium et cartes des joueurs · B · la soirée heure par heure, courbes, trophées · C · qui bat qui, chiffres comparés, cibles. IMAGE : les 3 feuilles l\'une sous l\'autre ; PDF : 3 pages A4, enregistrées dans Téléchargements/Strela puis le menu de partage s\'ouvre (Imprimer, Drive, mail…).')}
      ${st.preview ? `<div class="dpages">${st.preview.map((u, k) => `<img src="${u}" alt="Feuille ${'ABC'[k]}">`).join('')}</div>`
        : `<button type="button" class="btn" data-act="dash-preview" data-arg="${esc(sid)}"${st.busy ? ' disabled' : ''}>${ico('image')} VOIR LES 3 FEUILLES</button>`}
      <div class="btns two">${btn('png', 'IMAGE')}${btn('pdf', 'PDF')}</div>
      ${st.busy || st.msg ? `<p class="note" role="status">${st.busy ? 'Préparation…' : esc(st.msg)}</p>` : ''}
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
    const base = reportFileBase(r.m.start);
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

/** Lot 9 : record personnel battu pendant la soirée (le premier trouvé, meilleure volée d'abord), pour le résumé. */
function soireeRecord(games) {
  const at = new Set(games.map(g => g.startedAt));
  const recs = allHonours().events.filter(e => e.kind === 'record' && at.has(e.at));
  const r = recs.find(e => e.key === 'visit') || recs[0];
  const short = { visit: 'volée', avg: 'moyenne', leg: 'manche', fin: 'finition' };
  return r ? { id: r.id, label: short[r.key] || r.label, value: r.value } : null;
}

async function summaryCanvas(sid) {
  const games = store.games.filter(g => g.soiree === sid);
  if (!games.length) return null;
  await sheetFonts();
  const m = soireeModel(games, id => playerById(id).name);
  const who = await faces(m.rows.map(r => r.id));
  return { m, c: drawSoireeSummary(m, who, { record: soireeRecord(games) }) };
}

async function summaryDash(sid, share) {
  const cur = status.get(sid) || {};
  if (!share && cur.summary) { status.set(sid, { ...cur, summary: null }); refresh(); return; }
  status.set(sid, { ...cur, busy: true, msg: '' }); refresh();
  let patch;
  try {
    const r = await summaryCanvas(sid);
    if (!r) return;
    if (share) {
      const msg = await deliverFile({ name: summaryFileName(r.m.start), mime: 'image/png', bytes: dataUrlBytes(r.c.toDataURL('image/png')) });
      patch = { busy: false, msg: msg || '' };
    } else {
      const t = document.createElement('canvas'); t.width = 540; t.height = 960;
      t.getContext('2d').drawImage(r.c, 0, 0, t.width, t.height);
      patch = { busy: false, summary: t.toDataURL('image/jpeg', 0.85) };
    }
  } catch (e) {
    patch = { busy: false, msg: `Résumé impossible : ${(e && e.message) || e}.` };
  }
  status.set(sid, { ...(status.get(sid) || {}), ...patch }); refresh();
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
  'dash-summary'(sid) { summaryDash(String(sid), true); },
  'dash-summary-see'(sid) { summaryDash(String(sid), false); },
  'dash-fix-ask'(sid) { status.set(sid, { ...(status.get(sid) || {}), fixAsk: true }); refresh(); },
  'dash-fix-no'(sid) { status.set(sid, { ...(status.get(sid) || {}), fixAsk: false }); refresh(); },
  'dash-fix'(sid) { applyCumulativeFix(sid); status.set(sid, { ...(status.get(sid) || {}), fixAsk: false, preview: null }); refresh(); },
  'dash-unfix'(sid) { undoCumulativeFix(sid); status.set(sid, { ...(status.get(sid) || {}), preview: null }); refresh(); },
};
