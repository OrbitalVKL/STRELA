// Lot 7.8 (dans l'appli depuis la 0.8.0) : tableau de bord d'une soirée (#/soiree/<id>) — ce qui s'est passé ce
// soir-là, joueur par joueur, à regarder et à imprimer (IMAGE · PDF, même livraison que la fiche de score).
// - Podium (victoires, puis moyenne), faits marquants (meilleure et pire volée, plus de bust, de 180, de verres,
//   meilleure moyenne), tableau des joueurs, parties de la soirée.
// - soireeModel() est pur (testé) ; le rapport à imprimer fait 3 feuilles A4 (soireereport.js, choix du 13/11 : A podium
//   et cartes, B chronologie, C duels et cibles), en aperçu à l'écran, en IMAGE (les 3 empilées) ou en PDF (3 pages).
// Pire volée : sans les bust ni les volées de finition (comme les Stats).
// 0.11.1 (demande de Guillaume) : sections repliables, plus aucun tableau qui dépasse de l'écran (cartes des joueurs au
// lieu du tableau large, badges et défis en listes), chiffres enrichis, défis de la soirée ; rapport en 4 feuilles.
import { allGames } from '../../store.js';
import { playerStats } from '../../../engine/stats.js';
import { eveningForm } from '../../../engine/evolution.js';
import { store, playerById, cumulativeDrinksFix, applyCumulativeFix, undoCumulativeFix, cumulativeFixed, tourneeDrinks, applyTourneeFix, undoTourneeFix, tourneeFixed } from '../../store.js';
import { infoSec, infoBox, infoBtn } from '../../info.js';
import { tallyText, litersText, drinksText } from '../../../engine/alcohol.js';
import { drinkPair } from '../../drinks.js';
import { esc, ico, topBar, avg, pct, plural, when } from '../../dom.js';
import { avatarHtml, ICONS, iconSvg, initials, colorIndex } from '../../avatars.js';
import { AVATAR_COLORS, AVATAR_INK } from '../../theme.js';
import { drawSoireeReport, faceImage, reportFileBase } from '../../soireereport.js';
import { soireeModel } from '../../../engine/soiree.js';
import { pdfFromJpegs, sheetFonts, PAGE_W, PAGE_H } from '../../sheet.js';
import { deliverFile } from '../printsheet.js';
import { drawSoireeSummary, summaryFileName } from '../../soireesummary.js';
import { allHonours, badgeOpen, tierHtml } from '../../honours.js';
import { badgesOfGame, badgeByKey } from '../../../engine/badges.js';
import { DEFIS } from '../../../engine/defis.js';
import { refresh, go, backFrom } from '../../nav.js';

// ------------------------------------------------------------------ sections repliables (0.11.1)
// Ouvertes d'office : faits marquants, joueurs, défis, badges ; les autres repliées. Un appui sur le titre les ouvre ou
// les replie ; le choix dure le temps de la session (toutes les soirées).
const FOLD_OPEN = new Set(['dash-hl', 'dash-players', 'dash-defis', 'dash-badges']);
const foldState = new Map(); // clé → ouverte ?
const isOpen = key => (foldState.has(key) ? foldState.get(key) : FOLD_OPEN.has(key));
/** Sommaire de maquette, tests : sections ouvertes d'avance (toutes si `all`). */
export function presetDashFolds({ all = false, open = [] } = {}) {
  foldState.clear();
  if (all) for (const k of ['dash-hl', 'dash-players', 'dash-defis', 'dash-badges', 'dash-drinks', 'dash-levels', 'dash-games', 'dash-summary', 'dash-report']) foldState.set(k, true);
  for (const k of open) foldState.set(k, true);
}
/** Section repliable : titre (bouton), compte, (i), explication, contenu si ouverte. */
function fsec(key, title, extra, info, body) {
  const open = isOpen(key);
  return `<div class="sec fsec"><button type="button" class="fsh" data-act="dash-fold" data-arg="${key}" aria-expanded="${open}">
      <span>${title}</span>${extra}<i class="fl" aria-hidden="true"></i>${ico(open ? 'up' : 'down')}</button>${infoBtn(key)}</div>
    ${infoBox(key, info)}${open ? body : ''}`;
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const pad2 = n => String(n).padStart(2, '0');
const hhmm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export { soireeModel };
const dayFull = ms => { const d = new Date(ms); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

/** Ce qu'a fait un joueur pour un badge (rang `tier` d'un badge à rangs), en une ligne. */
export const badgeShort = (b, tier = 0) => (b.tiers && tier ? `${b.tiers[tier - 1]} ${b.what[b.tiers[tier - 1] > 1 ? 1 : 0]}` : b.desc);

/** Badges gagnés pendant une soirée : [{ id, key, name, tier?, visit, at }], joueur par joueur (ordre du podium), puis dans
 *  l'ordre du soir (0.11.1 : aussi pour la feuille D du rapport et le résumé). */
export function soireeBadges(games, m) {
  const h = allHonours();
  const order = new Map(m.rows.map((r, i) => [r.id, i]));
  return games.slice().sort((a, b) => a.startedAt - b.startedAt).flatMap(g => badgesOfGame(h, g.id).map(x => ({ ...x, at: g.startedAt })))
    .filter(x => order.has(x.id)).sort((a, b) => order.get(a.id) - order.get(b.id) || a.at - b.at);
}

// ------------------------------------------------------------------ écran
const status = new Map(); // id de soirée → { busy, msg }
/** Sommaire (0.11.2) : ouvre la confirmation « retirer les tournées notées » de la soirée `sid`. */
export function presetDashTourAsk(sid) { status.set(sid, { tourAsk: true }); }

export function soireeDashScreen(sid) {
  const games = store.games.filter(g => g.soiree === sid);
  if (!games.length) { go('#/historique', { replace: true }); return ''; }
  const m = soireeModel(games, id => playerById(id).name);
  const pod = m.rows.slice(0, 3);
  const place = ['1ER', '2E', '3E'];
  const podium = `<ol class="podium">${pod.map((r, i) => `<li class="p${i + 1}"><a href="#/stats/${esc(r.id)}">${avatarHtml(playerById(r.id), i ? 44 : 56)}
      <b class="pl">${place[i]}</b><span class="nm ell">${esc(r.name)}</span><small>${plural(r.won, 'victoire', 'victoires')}<br>moy. ${avg(r.average)}</small></a></li>`).join('')}</ol>`;
  const cards = m.highlights.map(h => `<li><small>${esc(h.label)}</small><span class="who">${avatarHtml(playerById(h.id), 24)}<span class="nm ell">${esc(h.name)}</span></span><b>${esc(h.value)}</b>${h.detail ? `<span class="dt">${h.detail}</span>` : ''}</li>`).join('');
  // 0.11.1 : une carte par joueur (plus de tableau qui défile de côté), avec tous ses chiffres de la soirée.
  const dec1 = v => (v === null || v === undefined ? '—' : avg(v));
  const won = soireeBadges(games, m);
  const nBadges = id => won.filter(x => x.id === id).length;
  const kp = (label, value, cls = '') => `<div class="pk${cls ? ` ${cls}` : ''}"><small>${label}</small><b>${value}</b></div>`;
  // Lot 9.6 B4 : forme du soir — moyenne de la soirée contre la moyenne habituelle du joueur (ses autres parties).
  const ids = new Set(games.map(g => g.id));
  const others = allGames().filter(g => !ids.has(g.id));
  const form = r => { const f = eveningForm(r.average, playerStats(others, r.id).average); if (!f) return ''; const d = `${f.diff >= 0 ? '+' : '−'}${avg(Math.abs(f.diff))}`; return ` · <span class="evd ${f.state}">forme ${f.state === 'better' ? '▲' : f.state === 'worse' ? '▼' : '='} ${d}</span>`; };
  const pcards = `<ul class="pcards">${m.rows.map((r, i) => `<li><a class="pch" href="#/stats/${esc(r.id)}">${avatarHtml(playerById(r.id), 32)}<span class="col"><span class="nm ell">${esc(r.name)}</span>
      <small>${i + 1 === 1 ? '1ER' : `${i + 1}E`} · ${plural(r.won, 'victoire', 'victoires')} en ${plural(r.played, 'partie', 'parties')}${form(r)}</small></span>${ico('chev')}</a>
    <div class="pks">${[
      kp('Moyenne', dec1(r.average), 'big'), kp('9 premières fléchettes', dec1(r.first9)), kp('Meilleure', r.best || '—'),
      kp('Pire', r.worst ?? '—'), kp('100+', r.tons), kp('140+', r.ton40),
      kp('180', r.max), kp('Bust', r.busts), kp('Triples', pct(r.tripleRate)),
      kp('Doubles', pct(r.doubleRate)), kp('Finition', r.bestFinish || '—'), kp('Manche', r.shortestLeg ? `${r.shortestLeg} fl.` : '—'),
      kp('Dans le 1', r.ones), kp('Bulls', r.bulls), kp('Hors cible', r.misses),
      kp('Défis', r.defisOk + r.defisKo ? `${r.defisOk}<small>/${r.defisOk + r.defisKo}</small>` : '—'), kp('Badges', nBadges(r.id)), kp('Verres · pintes', `${r.tally.glasses}<small> · ${r.tally.pints}</small>`),
    ].join('')}</div></li>`).join('')}</ul>`;
  // 0.11.1 : les défis de la soirée, dans l'ordre (étoile rouge pleine : réussi ; grise vide : raté).
  const defiRows = m.defiList.map(d => `<li class="${d.ok ? 'ok' : 'ko'}"><a href="#/partie/${esc(d.gameId)}">${ico(d.ok ? 'starf' : 'star', 'ico ds')}
      <span class="t">P${d.game}</span>${avatarHtml(playerById(d.id), 22)}<span class="col"><b class="ell">${esc(DEFIS[d.key].short)}</b><small class="ell">${esc(playerById(d.id).name)} · ${d.ok ? 'réussi' : 'raté'}</small></span></a></li>`).join('');
  const defisBody = m.defiList.length
    ? `<ul class="dfl2">${m.rows.filter(r => r.defisOk + r.defisKo).map(r => `<li>${avatarHtml(playerById(r.id), 22)}<span class="nm ell">${esc(r.name)}</span>
        <span class="st">${ico('starf', 'ico ok')}${r.defisOk}</span><span class="st">${ico('star', 'ico ko')}${r.defisKo}</span></li>`).join('')}</ul>
      <ul class="dfrows">${defiRows}</ul>`
    : '<p class="note">Aucun défi ce soir (option « Défis » au lancement d\'une partie).</p>';
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
  // 0.11.2 : tournées notées (TOURNÉE SERVIE, gages « tournée » ou « les autres boivent », un verre pour tous) : personne
  // ne les a bues. Bouton à confirmer, liste avant → après, annulable.
  const tfixed = tourneeFixed(sid);
  let tfix = '';
  const tour = tourneeDrinks(sid);
  if (st.tourAsk && tour.groups.length) {
    const lines = m.rows.filter(r => tour.totals[r.id])
      .map(r => `<li><span class="nm ell">${esc(r.name)}</span><b>${esc(drinksText(tour.totals[r.id].before))} → ${esc(drinksText(tour.totals[r.id].after))}</b></li>`).join('');
    const when = tour.groups.map(x => `<li><span class="nm ell">PARTIE ${x.n} · ${hhmm(x.t)}</span><b>${x.pint ? 'UNE PINTE' : 'UN VERRE'} × ${x.ids.length}</b></li>`).join('');
    tfix = `<div class="confirm" role="alertdialog" aria-label="Retirer les tournées notées ?"><p class="alert-h">RETIRER LES TOURNÉES NOTÉES ?</p>
      <p class="small">Verres notés à plusieurs joueurs au même instant (TOURNÉE SERVIE, gage d'un défi, un verre pour tous) :</p>
      <ul class="fixlist">${when}</ul><ul class="fixlist stack">${lines}</ul>
      <p class="small">Ces verres sont retirés de la soirée. Le retrait peut être annulé.</p>
      <div class="btns two"><button type="button" class="btn" data-act="dash-tour-no" data-arg="${esc(sid)}">NON</button><button type="button" class="btn alert" data-act="dash-tour" data-arg="${esc(sid)}">RETIRER</button></div></div>`;
  } else if (tour.groups.length) {
    tfix = `<button type="button" class="btn ghost" data-act="dash-tour-ask" data-arg="${esc(sid)}">${ico('glass')} RETIRER LES TOURNÉES NOTÉES</button>`;
  } else if (tfixed) {
    tfix = `<p class="note">Tournées notées retirées : ces verres ne comptent plus.</p>
      <button type="button" class="btn ghost" data-act="dash-tour-undo" data-arg="${esc(sid)}">REMETTRE LES TOURNÉES</button>`;
  }
  const drinkRows = m.rows.map(r => `<li><a href="#/stats/${esc(r.id)}">${avatarHtml(playerById(r.id), 28)}<span class="col"><span class="nm ell">${esc(r.name)}</span>
      ${r.drinks ? `<small>${drinksText(r.tally)} · ${litersText(r.tally.liters)}</small>` : ''}</span>${drinkPair(r.tally, 'dpair big')}</a></li>`).join('');
  // Lot 9 : la moyenne de chacun au fil des verres (0, 1, 2, 3, 4, 5 et +), en tableau ; 0.11.1 : un tableau qui
  // tient dans l'écran (avatar seul en tête de ligne, colonnes égales).
  const anyDrinks = m.drinks > 0;
  const lvTable = anyDrinks ? `<table class="lvt2"><thead><tr><th scope="col" aria-label="Joueur"></th>${['0', '1', '2', '3', '4', '5+'].map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>
    ${m.rows.map(r => { const lv = m.levels[r.id]; return `<tr><th scope="row"><a href="#/stats/${esc(r.id)}" aria-label="${esc(r.name)}">${avatarHtml(playerById(r.id), 22)}</a></th>
      ${lv.levels.map(L => `<td${L.level === lv.best ? ' class="best"' : ''}>${L.darts ? avg(L.average) : '·'}</td>`).join('')}</tr>`; }).join('')}
    </tbody></table>` : '';
  // Lot 7.8 (retours du 20/11) : badges gagnés pendant la soirée, joueur par joueur ; 0.11.1 : en liste (plus de tableau
  // qui dépasse), un bloc par joueur, chaque badge sur sa ligne avec ce qu'il a fait.
  const byWho = new Map();
  for (const x of won) { if (!byWho.has(x.id)) byWho.set(x.id, []); byWho.get(x.id).push(x); }
  const badgesBody = won.length ? `<div class="bgroups">${[...byWho.entries()].map(([id, list]) => `<div class="bgroup">
      <a class="bgh" href="#/stats/${esc(id)}">${avatarHtml(playerById(id), 24)}<span class="nm ell">${esc(playerById(id).name)}</span><span class="n">${list.length}</span></a>
      <ul>${list.map(x => { const b = badgeByKey(x.key); return `<li><button type="button" ${badgeOpen(id, x.key, x.tier)}>${ico(b.icon)}<span class="col"><b>${esc(b.name)}</b>${x.tier ? tierHtml(x.tier) : ''}
        <small>${esc(badgeShort(b, x.tier))}</small></span>${ico('chev')}</button></li>`; }).join('')}</ul></div>`).join('')}</div>`
    : '<p class="note">Aucun badge gagné ce soir.</p>';
  const btn = (kind, label) => `<button type="button" class="btn" data-act="dash-export" data-arg="${esc(`${kind}|${sid}`)}"${st.busy ? ' disabled' : ''}>${ico('download')} ${label}</button>`;
  return `<div class="screen dash2">${topBar('Soirée', backFrom('#/historique'))}
    <div class="dhead inv"><b>${ico('glass')} SOIRÉE DU ${dayFull(m.start).toUpperCase()}</b>
      <span>${hhmm(m.start)} – ${hhmm(m.end)} · ${plural(m.games, 'partie', 'parties')} · ${plural(m.rows.length, 'joueur', 'joueurs')} · ${drinksText(m.tally)}${m.drinks ? ` (${litersText(m.liters)})` : ''}</span></div>
    <div class="pad">
      ${podium}
      <ul class="dtot">
        <li><b>${m.totals.darts}</b><small>fléchettes</small></li><li><b>${m.totals.tons}</b><small>volées 100+</small></li>
        <li><b>${m.totals.max}</b><small>180</small></li><li><b>${m.totals.busts}</b><small>bust</small></li>
        <li><b>${m.totals.defis ? `${m.totals.defisOk}<small>/${m.totals.defis}</small>` : '—'}</b><small>défis réussis</small></li><li><b>${won.length}</b><small>badges</small></li>
      </ul>
      ${fsec('dash-hl', 'Faits marquants', ` <span class="n">${m.highlights.length}</span>`, 'Le meilleur et le pire de la soirée. Pire volée : sans les bust ni les volées de finition. Le plus de 1 : fléchettes tombées dans le 1 (le roi des uns de la soirée). Hors cible : fléchettes à 0 (RATÉ). Taux de triples : 30 fléchettes au moins. Touchez un joueur (podium, cartes, verres) pour ouvrir ses stats ; le retour revient ici.', `<ul class="hls">${cards}</ul>`)}
      ${fsec('dash-players', 'Joueurs', ` <span class="n">${m.rows.length}</span>`, 'Une carte par joueur, dans l\'ordre du podium. Forme : la moyenne de la soirée comparée à la moyenne habituelle du joueur (ses autres parties ; ▲ au-dessus, ▼ en dessous). Moyenne et moyenne des 9 premières fléchettes (ton niveau de scoring en début de partie) : sur 3 fléchettes ; pire volée sans les bust ni les finitions ; 140+ compte les 180 ; triples : fléchettes dans un triple ; doubles : fléchettes qui ont fini la manche quand une seule pouvait finir ; finition : plus grand reste fini en une volée ; manche : la plus courte gagnée, en fléchettes ; défis : réussis / tirés ; badges : gagnés ce soir.', pcards)}
      ${fsec('dash-defis', 'Défis de la soirée', ` <span class="n">${m.totals.defis}</span>`, 'Les défis tirés au sort pendant les parties de la soirée, dans l\'ordre (P2 : 2e partie de la soirée), avec leur résultat : étoile rouge pleine si réussi, grise et vide si raté (les gages ne sont pas notés dans les verres). En haut, les réussis et les ratés de chacun. Touchez un défi pour ouvrir sa partie.', defisBody)}
      ${fsec('dash-badges', 'Badges de la soirée', ` <span class="n">${won.length}</span>`, 'Les badges gagnés pendant les parties de la soirée, joueur par joueur : un badge n\'est gagné qu\'une fois (le premier 180…), sauf les badges à rangs (bronze, argent, or), cumulés sur toutes les parties. Touchez un badge pour sa signification, et la partie et la volée où il a été gagné.', badgesBody)}
      ${fsec('dash-drinks', 'Verres', ` <span class="n">${drinksText(m.tally)}</span>`, 'Les verres de chacun sur toute la soirée : verres de 25 cl et pintes de 50 cl comptés à part, et le volume bu ; les verres pris entre deux parties (écran Soirée) comptent aussi. Un oubli ou une erreur dans une partie : ouvrez la partie (section Parties), section Verres, et corrigez avec − et +. Si les verres ont été resaisis dans chaque nouvelle partie (avant le mode soirée), le bouton ci-dessous ne garde que les verres nouveaux de chaque partie. Les tournées notées par l\'ancienne version (TOURNÉE SERVIE, gages des défis, un verre pour tous) peuvent être retirées d\'un appui, et remises.', `<ul class="dlist2">${drinkRows}</ul>${tfix}${fix}`)}
      ${anyDrinks ? fsec('dash-levels', 'Au fil des verres', '', 'Moyenne sur 3 fléchettes de chacun selon le nombre de verres déjà bus quand il lance (0, 1, 2… ; une pinte compte pour 2). Encadré : le niveau où il a le mieux joué ce soir (9 fléchettes au moins). Touchez un avatar pour ses stats.', lvTable) : ''}
      ${fsec('dash-games', 'Parties', ` <span class="n">${m.games}</span>`, 'Touchez une partie pour son détail tour par tour, sa fiche de score et ses verres.', `<ul class="hrows dlist">${glist}</ul>`)}
      ${fsec('dash-summary', 'Résumé à partager', '', 'Une image verticale (format téléphone) à envoyer dans la conversation des joueurs : podium, six faits marquants, défis et badges de la soirée. Elle est enregistrée dans Téléchargements/Strela puis le menu de partage s\'ouvre.', `${st.summary ? `<div class="dsum"><img src="${st.summary}" alt="Résumé de la soirée"></div>` : ''}
      <div class="btns two"><button type="button" class="btn" data-act="dash-summary-see" data-arg="${esc(sid)}"${st.busy ? ' disabled' : ''}>${ico('image')} ${st.summary ? 'MASQUER' : 'APERÇU'}</button>
        <button type="button" class="btn primary" data-act="dash-summary" data-arg="${esc(sid)}"${st.busy ? ' disabled' : ''}>${ico('download')} PARTAGER</button></div>`)}
      ${fsec('dash-report', 'Rapport à imprimer', ' <span class="n">4 feuilles</span>', 'A · podium et cartes des joueurs · B · la soirée heure par heure, courbes, trophées · C · qui bat qui, chiffres comparés, cibles · D · tous les chiffres de chacun, défis et badges de la soirée. IMAGE : les 4 feuilles l\'une sous l\'autre ; PDF : 4 pages A4, enregistrées dans Téléchargements/Strela puis le menu de partage s\'ouvre (Imprimer, Drive, mail…).', `${st.preview ? `<div class="dpages">${st.preview.map((u, k) => `<img src="${u}" alt="Feuille ${'ABCD'[k]}">`).join('')}</div>`
        : `<button type="button" class="btn" data-act="dash-preview" data-arg="${esc(sid)}"${st.busy ? ' disabled' : ''}>${ico('image')} VOIR LES 4 FEUILLES</button>`}
      <div class="btns two">${btn('png', 'IMAGE')}${btn('pdf', 'PDF')}</div>`)}
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
  return { m, pages: drawSoireeReport(m, who, undefined, { badges: reportBadges(games, m) }) };
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
      // Une image : les feuilles l'une sous l'autre, séparées d'un filet.
      const gap = 24, all = document.createElement('canvas');
      all.width = PAGE_W; all.height = PAGE_H * r.pages.length + gap * (r.pages.length - 1);
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

/** 0.11.1 : badges de la soirée pour la feuille D et le résumé : [{ id, label, desc }]. */
function reportBadges(games, m) {
  return soireeBadges(games, m).map(x => { const b = badgeByKey(x.key); return { id: x.id, label: x.name, desc: badgeShort(b, x.tier) }; });
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
  return { m, c: drawSoireeSummary(m, who, { record: soireeRecord(games), badges: soireeBadges(games, m).length }) };
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
  'dash-fold'(key) { foldState.set(key, !isOpen(key)); refresh(); },
  'dash-export'(arg) { const [kind, sid] = String(arg).split('|'); exportDash(kind, sid); },
  'dash-preview'(sid) { previewDash(String(sid)); },
  'dash-summary'(sid) { summaryDash(String(sid), true); },
  'dash-summary-see'(sid) { summaryDash(String(sid), false); },
  'dash-fix-ask'(sid) { status.set(sid, { ...(status.get(sid) || {}), fixAsk: true }); refresh(); },
  'dash-fix-no'(sid) { status.set(sid, { ...(status.get(sid) || {}), fixAsk: false }); refresh(); },
  'dash-fix'(sid) { applyCumulativeFix(sid); status.set(sid, { ...(status.get(sid) || {}), fixAsk: false, preview: null }); refresh(); },
  'dash-tour-ask'(sid) { status.set(sid, { ...(status.get(sid) || {}), tourAsk: true }); refresh(); },
  'dash-tour-no'(sid) { status.set(sid, { ...(status.get(sid) || {}), tourAsk: false }); refresh(); },
  'dash-tour'(sid) { applyTourneeFix(sid); status.set(sid, { ...(status.get(sid) || {}), tourAsk: false, preview: null }); refresh(); },
  'dash-tour-undo'(sid) { undoTourneeFix(sid); status.set(sid, { ...(status.get(sid) || {}), preview: null }); refresh(); },
  'dash-unfix'(sid) { undoCumulativeFix(sid); status.set(sid, { ...(status.get(sid) || {}), preview: null }); refresh(); },
};
