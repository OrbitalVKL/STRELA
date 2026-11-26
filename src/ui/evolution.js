// Strela — stats contextuelles à l'écran (lot 9.6 B) : fiche « Évolution » d'un X01 en solo, séance d'exercice à cible
// comparée aux précédentes, résumé en clair en tête des écrans de stats. Calculs : src/engine/evolution.js.

import { esc, plural } from './dom.js';
import { infoBtn, infoBox } from './info.js';
import { x01SoloMetrics, compareX01, summaryLine, X01_METRICS, TIERS, spreadText, targetSession, sectorsText, targetName, trendsOf } from '../engine/evolution.js';
import { trend } from '../engine/trends.js';

const dec1 = v => (v === null || v === undefined || Number.isNaN(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const pct = v => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);
export const fmtOf = f => (f === 'pct' ? pct : f === 'int' ? v => (v === null || v === undefined ? '—' : String(Math.round(v))) : f === 'pm' ? v => (v === null || v === undefined ? '—' : `±${Math.round(v)}`) : dec1);

const cache = new Map();
/** Chiffres d'un X01 en solo (gardés : recalculés seulement quand la séance change). */
export function x01Of(r) {
  const k = `${r.id}:${r.darts.length}:${r.endedAt}`;
  if (!cache.has(k)) { try { cache.set(k, x01SoloMetrics(r)); } catch (e) { cache.set(k, null); } }
  return cache.get(k);
}

/** Flèche verte (mieux) / rouge (moins bien) / égal, avec la référence. */
export function arrow(state, ref, fmt) {
  if (!state) return '<span class="evd na">—</span>';
  const sym = state === 'better' ? '▲' : state === 'worse' ? '▼' : '=';
  const word = state === 'better' ? 'mieux' : state === 'worse' ? 'moins bien' : 'pareil';
  return `<span class="evd ${state}" title="${word}">${sym}<small>${ref === null || ref === undefined ? word : `${word} · ${esc(fmt(ref))}`}</small></span>`;
}

/** Résumé en clair (une phrase) en tête d'écran ; `fallback` si rien ne bouge. */
export const summaryHtml = (line, fallback = '') => (line || fallback ? `<p class="evsum" role="status">${esc(line || fallback)}</p>` : '');

/** Répartition des volées par paliers : barre et légende. */
export function tiersHtml(tiers) {
  const n = tiers.reduce((a, b) => a + b, 0);
  if (!n) return '';
  return `<div class="evtiers" role="img" aria-label="Répartition des volées">${tiers.map((c, i) => (c ? `<i class="t${i}" style="flex:${c}"></i>` : '')).join('')}</div>
    <ul class="evtl">${TIERS.map((t, i) => `<li><i class="t${i}"></i><span>${esc(t.label)}</span><b>${tiers[i]}</b><small>${pct(tiers[i] / n)}</small></li>`).join('')}</ul>`;
}

/**
 * Fiche « Évolution » d'un X01 en solo : la partie comparée aux précédentes (`previous` : séances X01 du même joueur,
 * avant elle, dans la période). `key` : clé des explications (i).
 */
export function x01EvolutionHtml(r, previous, key) {
  const cur = x01Of(r);
  if (!cur) return '';
  const prev = previous.map(x01Of).filter(Boolean);
  const rows = compareX01(cur, prev);
  const line = prev.length ? summaryLine(rows) : '';
  const head = prev.length ? `Comparée à ${plural(prev.length, 'partie précédente', 'parties précédentes')} de la période.` : 'Première partie de X01 en solo de la période : la comparaison viendra avec la suivante.';
  const shown = rows.filter(x => x.value !== null && x.value !== undefined);
  return `<div class="sec">Évolution${infoBtn(`ev-${key}`)}</div>
    ${infoBox(`ev-${key}`, `Chaque chiffre de cette partie, et une flèche : <b>▲ verte</b> mieux, <b>▼ rouge</b> moins bien que la moyenne de tes parties précédentes de la période (la valeur de référence est à côté). Touche (i) sur un chiffre pour son explication.`)}
    ${summaryHtml(line)}<p class="note">${esc(head)}</p>
    <ul class="evl">${shown.map(x => `<li data-k="${x.k}"><span>${esc(x.label)}${infoBtn(`ev-${key}-${x.k}`)}</span><b>${fmtOf(x.fmt)(x.value)}</b>${arrow(x.state, x.ref, fmtOf(x.fmt))}${infoBox(`ev-${key}-${x.k}`, esc(x.info))}</li>`).join('')}</ul>
    ${cur.spread !== null ? `<p class="note">Régularité : ${esc(spreadText(cur.spread))}.</p>` : ''}
    ${cur.busts ? `<p class="note">Busts : ${plural(cur.busts, 'volée perdue', 'volées perdues')} ; sans elles, ta moyenne serait de ${dec1(cur.avgNoBust)} au lieu de ${dec1(cur.avg)}.</p>` : ''}
    ${cur.high !== null && cur.low !== null ? `<p class="note">Fin de partie : ${dec1(cur.high)} de moyenne au-dessus de 100 restants, ${dec1(cur.low)} en dessous.</p>` : ''}
    <div class="sec">Répartition des volées${infoBtn(`ev-${key}-tiers`)}</div>
    ${infoBox(`ev-${key}-tiers`, 'Tes volées (sans les bust) rangées par paliers de points, adaptés à ton niveau actuel : moins de 20, 20 à 39, 40 à 59, 60 et plus.')}
    ${tiersHtml(cur.tiers)}`;
}

/** Période (stats) : moyenne de chaque chiffre sur les X01 en solo, sa tendance, et la répartition des volées. */
export function x01PeriodHtml(sessions, trendBadge) {
  const ms = sessions.map(x01Of).filter(Boolean);
  if (!ms.length) return { summary: '', html: '' };
  const tr = trendsOf(ms, X01_METRICS);
  const tiers = TIERS.map((_, i) => ms.reduce((n, m) => n + m.tiers[i], 0));
  const best = Math.max(...ms.map(m => m.best ?? -1));
  const worsts = ms.map(m => m.worst).filter(v => v !== null);
  const html = `<div class="sec">Évolution · X01 en solo${infoBtn('ts-evo')}</div>
    ${infoBox('ts-evo', 'Chaque chiffre en moyenne sur les parties de X01 en solo de la période, et sa tendance sur les dix dernières (il en faut quatre pour une flèche). Choisis-le sous « Progression » pour sa courbe.')}
    <ul class="evl">${tr.filter(x => x.t.mean !== null).map(x => `<li data-k="${x.k}"><span>${esc(x.label)}${infoBtn(`ts-evo-${x.k}`)}</span><b>${fmtOf(x.fmt)(x.t.mean)}</b>${trendBadge(x.t)}${infoBox(`ts-evo-${x.k}`, esc(x.info))}</li>`).join('')}</ul>
    ${best >= 0 ? `<p class="note">Meilleure volée de la période : ${best}${worsts.length ? ` · pire volée complète : ${Math.min(...worsts)}` : ''}.</p>` : ''}
    <div class="sec">Répartition des volées</div>${tiersHtml(tiers)}`;
  return { summary: summaryLine(tr), html };
}

/** Séance d'un exercice à cible comparée aux précédentes du même exercice (`previous`, plus anciennes d'abord). */
export function targetCompareHtml(r, previous, key, fmtValue) {
  let ts;
  try { ts = targetSession(r, previous); } catch (e) { return ''; }
  const rows = [];
  if (ts.value !== null && ts.value !== undefined) rows.push({ short: 'ton score à l\'exercice', state: ts.valueState });
  for (const s of ts.sectors) if (s.state) rows.push({ short: `le ${targetName(s)}`, state: s.state });
  const line = ts.prevCount ? summaryLine(rows) : '';
  const sectors = ts.sectors.filter(s => s.darts);
  const drift = ts.drift;
  const svg = drift && drift.words ? driftSvg(drift) : '';
  return `<div class="sec">Comparé aux séances précédentes${infoBtn(`tc-${key}`)}</div>
    ${infoBox(`tc-${key}`, 'Le score de l\'exercice comparé à la moyenne de tes séances précédentes du même exercice dans la période ; chaque secteur visé comparé à la séance précédente du même exercice. <b>▲ vert</b> mieux, <b>▼ rouge</b> moins bien.')}
    ${summaryHtml(line)}
    ${ts.prevCount ? `<ul class="evl"><li data-k="value"><span>Score de l'exercice</span><b>${fmtValue(ts.value)}</b>${arrow(ts.valueState, ts.valueRef, fmtValue)}</li></ul>` : '<p class="note">Première séance de cet exercice dans la période : la comparaison viendra avec la suivante.</p>'}
    ${sectors.length > 1 || (sectors.length && ts.prevCount) ? `<table class="sectab trtab evsec"><thead><tr><th>Secteur visé</th><th>Réussite</th><th>Avant</th></tr></thead><tbody>
      ${sectors.map(s => `<tr><th class="ell">${esc(targetName(s))}</th><td>${pct(s.rate)}<small> · ${s.hits}/${s.darts}</small></td><td>${s.prev === null ? '' : `${pct(s.prev)} `}${arrow(s.state, s.prev, pct)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${ts.best ? `<p class="note">${esc(sectorsText(ts))}</p>` : ''}
    <div class="sec">Dérive${infoBtn(`td-${key}`)}</div>
    ${infoBox(`td-${key}`, 'Où partent tes fléchettes par rapport au point visé, en moyenne : à gauche, à droite, au-dessus, en dessous. Mesurée en centimètres sur une vraie cible.')}
    ${drift ? `<div class="evdrift">${svg}<p>${esc(drift.text)}</p></div>` : '<p class="note">Pas assez de fléchettes placées pour mesurer une dérive.</p>'}
    ${ts.approx ? `<p class="note approx">≈ Approximation : ${plural(ts.approx, 'fléchette saisie', 'fléchettes saisies')} au pavé, placée${ts.approx > 1 ? 's' : ''} au centre de leur case ; la dérive réelle peut être un peu différente.</p>` : ''}
    <p class="note">Hors cible : ${plural(ts.off, 'fléchette', 'fléchettes')}${ts.darts ? ` (${pct(ts.offRate)})` : ''}.</p>`;
}

/** Petite cible : croix au point visé, flèche vers la dérive moyenne. */
function driftSvg(d) {
  const L = Math.min(34, 10 + d.mm / 2);
  const ux = d.dx / d.mm, uy = d.dy / d.mm;
  const x2 = 40 + ux * L, y2 = 40 + uy * L;
  const a1 = [x2 - ux * 8 - uy * 5, y2 - uy * 8 + ux * 5], a2 = [x2 - ux * 8 + uy * 5, y2 - uy * 8 - ux * 5];
  return `<svg class="evdsvg" viewBox="0 0 80 80" width="80" height="80" aria-hidden="true"><circle cx="40" cy="40" r="36"/><circle cx="40" cy="40" r="14"/>
    <path class="x" d="M34 40H46M40 34V46"/><path class="ar" d="M40 40L${x2.toFixed(1)} ${y2.toFixed(1)}M${a1[0].toFixed(1)} ${a1[1].toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}L${a2[0].toFixed(1)} ${a2[1].toFixed(1)}"/></svg>`;
}

/** Résumé des exercices sur la période : précision, groupement, dans la cible (tendances). */
export function exercisesSummary(parts) {
  const rows = [
    { short: 'ta précision', t: trend(parts.map(p => p.dist), -1) },
    { short: 'ton groupement', t: trend(parts.map(p => (p.points >= 3 ? p.spread : null)), -1) },
    { short: 'les fléchettes dans la cible', t: trend(parts.map(p => p.rate), 1) },
  ];
  return summaryLine(rows);
}
