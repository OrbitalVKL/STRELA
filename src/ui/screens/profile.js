// Strela — profil d'un joueur (0.24.0, choix de Guillaume sur maquettes : profil A « quatre onglets » avec les records,
// badges A « vitrine par familles » avec la chronologie de B). Une seule porte d'entrée par joueur : #/joueur/<id>
// (onglet Résumé), #/joueur/<id>/parties, /entrainement, /badges ; MODIFIER mène au formulaire (#/joueur/<id>/modifier).
// En-tête : avatar, chiffres, statut (mon profil synchronisé, joueur local, ami, adversaire en ligne). Les onglets
// Parties et Entraînement reprennent les stats d'avant (stats2.js › playerGamesHtml, trainstats.js › trainStatsHtml) ;
// Résumé et Badges sont faits ici. Les anciennes adresses (#/stats/<id>, #/entrainement/stats) y mènent.
import { store, playerById, profilePlayer, allGames, allCkGames, allTrainings, appModes } from '../store.js';
import { esc, ico, topBar, plural, shortDate, avg } from '../dom.js';
import { avatarHtml } from '../avatars.js';
import { refresh, backFrom, go } from '../nav.js';
import { playerStats } from '../../engine/stats.js';
import { playerRecords } from '../../engine/records.js';
import { cricketPlayerStats } from '../../engine/cricket.js';
import { playerBadges, BADGES, TIER_NAMES } from '../../engine/badges.js';
import { TRAIN_BADGES, TRAIN_BADGE_KEYS, badgeValueText, tierText } from '../../engine/trainbadges.js';
import { levelOf, LEVELS } from '../../engine/training.js';
import { allHonours, badgeOpen, tierHtml } from '../honours.js';
import { honoursOf } from '../trainhonours.js';
import { playerGamesHtml, bestList, defisOf } from './v2/stats2.js';
import { trainStatsHtml } from './trainstats.js';
import { friendBlock, seenText, presenceDot } from './friends.js';
import { playerForm } from './players.js';
import { cloudSupport } from '../cloud.js';
import { agoText } from '../../engine/cloud.js';

const TABS = [['resume', 'Résumé'], ['parties', 'Parties'], ['entrainement', 'Entraîn.'], ['badges', 'Badges']];
// État de l'écran (gardé d'une visite à l'autre) : vue des badges (vitrine ou chronologie), explications ouvertes.
const pv = { badges: 'vitrine', info: new Set() };
/** Sommaire de maquette, tests : état préparé. */
export function presetProfile(state = {}) { pv.badges = state.badges || 'vitrine'; pv.info = new Set(state.info || []); }

const infoBtn = key => `<button type="button" class="ibtn" data-act="pf-info" data-arg="${key}" aria-pressed="${pv.info.has(key)}" aria-label="Explication">${ico('info')}</button>`;
const infoBox = (key, html) => (pv.info.has(key) ? `<p class="infobox" role="note">${html}</p>` : '');
const sec = (title, key = null, extra = '') => `<div class="sec">${title}${extra}${key ? infoBtn(key) : ''}</div>`;

/** Lien vers le profil (onglet `tab`, Résumé par défaut). */
export const profileHref = (id, tab = '') => `#/joueur/${esc(id)}${tab && tab !== 'resume' ? `/${tab}` : ''}`;

/** Le joueur peut-il être modifié ici ? (pas un ami : lui seul change son profil ; pas un joueur supprimé) */
const editable = p => !p.friend && !p.deleted;
const isMe = p => { const me = profilePlayer(); return !!me && me.id === p.id; };

/**
 * Statut du joueur : { key, label, note } — mon profil (synchronisé ou non), ami, adversaire en ligne, joueur local.
 * `note` dit en une phrase ce qui part en ligne.
 */
export function playerStatus(p) {
  if (p.friend) return { key: 'friend', icon: 'players', label: 'Ami · vient de son téléphone', note: 'Lecture seule : lui seul change son profil.' };
  if (p.remote) return { key: 'remote', icon: 'phone', label: 'Adversaire en ligne', note: 'Rencontré en ligne : gardé pour l\'historique.' };
  if (isMe(p)) {
    const sup = cloudSupport();
    return sup.ok ? { key: 'me', icon: 'sync', label: 'Mon profil · synchronisé', note: 'Pseudo, avatar, animation et jeux de fléchettes partent chez tes amis.' }
      : { key: 'me-off', icon: 'phone', label: 'Mon profil · ce téléphone', note: sup.why };
  }
  return { key: 'local', icon: 'phone', label: 'Joueur local · ce téléphone', note: 'Rien ne part en ligne : il n\'existe que sur ce téléphone.' };
}
/** Pastille de statut (liste des joueurs, en-tête du profil). */
export const statusChip = (p, short = false) => {
  const s = playerStatus(p);
  const label = short ? { me: 'synchronisé', 'me-off': 'ce téléphone', friend: 'ami', remote: 'en ligne', local: 'ce téléphone seulement' }[s.key] : s.label;
  return `<span class="pst ${s.key === 'me' ? 'inv' : ''}" data-st="${s.key}">${ico(s.icon)}${esc(label)}</span>`;
};

/** Route #/joueur/<id>[/<onglet>] : formulaire (nouveau joueur, MODIFIER) ou profil. */
export function profileRoute(id, tab = '') {
  if (id === 'nouveau') return playerForm('nouveau');
  const p = store.players.find(q => q.id === id);
  if (!p) { go('#/joueurs', { replace: true }); return ''; }
  if (tab === 'modifier') {
    if (!editable(p)) { go(profileHref(id), { replace: true }); return ''; }
    return playerForm(id);
  }
  return profileScreen(p, TABS.some(([k]) => k === tab) ? tab : 'resume');
}

function profileScreen(p, tab) {
  const games = allGames().filter(g => g.config.players.includes(p.id));
  const trs = allTrainings().filter(r => r.player === p.id);
  const sub = [games.length ? plural(games.length, 'partie', 'parties') : '', trs.length ? plural(trs.length, 'séance', 'séances') : '',
    p.friend ? seenText(p) : ''].filter(Boolean).join(' · ') || 'aucune partie pour l\'instant';
  const edit = editable(p) ? `<a class="pedit" href="#/joueur/${esc(p.id)}/modifier">${ico('settings')} MODIFIER</a>` : '';
  const head = `<div class="phead"><span class="pav">${avatarHtml(p, 72)}${p.friend ? presenceDot(p) : ''}</span>
    <div class="who"><b class="nm">${esc(p.name)}</b><small>${esc(sub)}</small>${statusChip(p)}${p.archived ? '<span class="pst">archivé</span>' : ''}</div>${edit}</div>`;
  const tabs = `<nav class="ptabs" role="tablist">${TABS.map(([k, label]) => `<a role="tab" href="${profileHref(p.id, k)}" aria-selected="${k === tab}" data-tab="${k}">${label}</a>`).join('')}</nav>`;
  const body = tab === 'parties' ? playerGamesHtml(p.id)
    : tab === 'entrainement' ? trainStatsHtml(p.id)
      : tab === 'badges' ? badgesHtml(p)
        : resumeHtml(p);
  return `<div class="screen profile">${topBar('Profil', backFrom('#/joueurs'))}${head}${tabs}${body}</div>`;
}

// ------------------------------------------------------------------ Résumé
function resumeHtml(p) {
  const games = allGames();
  const st = playerStats(games, p.id);
  const ck = cricketPlayerStats(allCkGames(), p.id);
  const trs = allTrainings().filter(r => r.player === p.id);
  const b = badgeCounts(p.id);
  const cell = (k, label, value) => `<div data-k="${k}"><small>${label}</small><b>${value}</b></div>`;
  const cells = [];
  if (st.played) cells.push(cell('average', 'Moyenne', avg(st.average)), cell('played', 'Parties', st.played), cell('won', 'Victoires', st.won), cell('bestVisit', 'Meill. volée', st.bestVisit));
  else if (ck.played) cells.push(cell('played', 'Parties', ck.played), cell('won', 'Victoires', ck.won));
  if (trs.length) cells.push(cell('level', 'Niveau entr.', `<span class="lvw">${LEVELS[levelOf(allTrainings(), p.id).level]}</span>`));
  cells.push(cell('badges', 'Badges', `${b.got}<small> / ${b.total}</small>`));
  const rec = playerRecords(games, p.id);
  const h = allHonours();
  const dateOf = key => { const at = h.recordsAt[p.id] && h.recordsAt[p.id][key]; return at ? shortDate(at) : ''; };
  const row = (label, value, key) => (value === null || value === undefined || value === 0 ? ''
    : `<li><span class="rl">${label}</span><b>${value}</b><small>${dateOf(key)}</small></li>`);
  const recs = [row('Meilleure volée', rec.bestVisit, 'visit'), row('Meilleure moyenne', rec.bestAverage === null ? null : avg(rec.bestAverage), 'avg'),
    row('Manche la plus courte', rec.shortestLeg === null ? null : `${rec.shortestLeg} fl.`, 'leg'), row('Plus grosse finition', rec.bestFinish, 'fin')].join('');
  const recent = recentRewards(p).slice(0, 3);
  const rivals = Object.entries(st.headToHead).sort((a, c) => c[1].played - a[1].played).slice(0, 3).map(([oid, x]) => {
    const o = playerById(oid);
    return `<li><a class="h2h-row" href="#/face/${esc(p.id)}/${esc(oid)}">${avatarHtml(o, 32)}<span class="nm ell b">${esc(o.name)}</span><span class="sc">${x.won} victoire${x.won > 1 ? 's' : ''} · ${x.lost} défaite${x.lost > 1 ? 's' : ''}</span>${ico('chev')}</a></li>`;
  }).join('');
  return `<div class="pad presume">
    <div class="pmini">${cells.join('')}</div>
    ${recs ? `${sec('Records', 'records')}${infoBox('records', 'Depuis toujours, sur toutes ses parties de 301 · 501 · 701 (celles d\'un ami jouées chez lui comprises). Date : la partie où le record a été établi.')}<ul class="vrecs">${recs}</ul>` : ''}
    ${st.played ? `${sec('Meilleures volées')}${bestList(games, p.id, 5)}` : ''}
    ${sec('Derniers badges', null, `<a class="n more" href="${profileHref(p.id, 'badges')}">tous les badges ›</a>`)}
    ${recent.length ? `<ul class="badges">${recent.map(rewardTile).join('')}</ul>` : '<p class="note">Pas encore de badge : ils arrivent avec les parties et les séances.</p>'}
    ${rivals ? `${sec('Rivaux')}<ul class="h2h">${rivals}</ul>` : ''}
    ${st.played || ck.played ? `<div class="plinks"><a class="lrow" href="#/classement">${ico('stats')}<span><b>Classement</b><small>Tous les joueurs, chiffre par chiffre</small></span>${ico('chev')}</a>
      <a class="lrow" href="#/honneur">${ico('trophy')}<span><b>Tableau d'honneur</b><small>Badges et records de tous les joueurs</small></span>${ico('chev')}</a></div>` : ''}
    ${statusBlock(p)}
  </div>`;
}

/** Bloc du bas du résumé selon le statut : ce qui part en ligne (mon profil), l'ami, le joueur local. */
function statusBlock(p) {
  if (p.friend) return friendBlock(p);
  const s = playerStatus(p);
  if (s.key === 'me') {
    const last = store.cloudSync && store.cloudSync.lastSync;
    return `${sec('En ligne', 'enligne')}
      ${infoBox('enligne', 'Ton profil est relié à ton compte Strela (invisible, sans mot de passe) : tes amis le voient tel quel. Compte, code d\'ami, présence : Réglages › Compte et amis.')}
      <ul class="pline"><li>${ico('sync')}<span>Pseudo, avatar, animation, jeux de fléchettes</span><small>envoyés à tes amis</small></li>
        <li>${ico('sync')}<span>Parties et séances créées sur ce téléphone</span><small>partagées</small></li>
        <li>${ico('phone')}<span>Finition (double préféré, éviter le bull)</span><small>ce téléphone</small></li></ul>
      <p class="note">${last ? `Dernière synchronisation : ${esc(agoText(last))}.` : 'Pas encore synchronisé.'}</p>`;
  }
  return `${sec('Sur ce téléphone')}<p class="note">${esc(s.note)}</p>`;
}

// ------------------------------------------------------------------ badges : données
// Familles des badges de parties (vitrine) ; un badge oublié ici va dans « Autres ».
const FAMILIES = [
  ['victoires', 'Victoires', ['win1', 'win10', 'streak3', 'handicap', 'games50']],
  ['volees', 'Volées', ['ton40', 'max', 'fin100', 'bull3', 'leg15', 'clean']],
  ['rangs', 'Collections à rangs', ['uns', 'sniper', 'fermier', 'notaire', 'feu', 'deco', 'plus']],
  ['soiree', 'Soirée et mois', ['drunkwin', 'defis5', 'marathon', 'champion', 'bustking']],
  ['ligne', 'En ligne', ['contact', 'distance', 'revanche', 'sangfroid', 'reconnexion', 'fidele']],
];

/**
 * Tous les badges du joueur, à plat : { src: 'partie' | 'entr', key, name, icon, earned, tier, tiers, at, count, sub,
 * prog (0 à 1, ou null : pas de progression mesurable), nextLabel (prochain palier, pour « Presque ») }.
 */
function allBadgesOf(pid) {
  const h = allHonours();
  const st = playerStats(allGames(), pid);
  const extra = { win10: [st.won, 10, 'victoires'], games50: [st.played, 50, 'parties'], defis5: [defisOf(allGames(), pid).ok, 5, 'défis réussis'] };
  const out = playerBadges(h, pid).map(b => {
    const x = { src: 'partie', key: b.key, name: b.name, icon: b.icon, earned: b.earned, tier: b.tier || 0, tiers: b.tiers || null, at: b.at, count: b.count, prog: null, sub: '', nextLabel: '' };
    if (b.tiers) {
      x.prog = b.next ? Math.min(1, b.total / b.next) : 1;
      x.sub = b.next ? `${b.total} / ${b.next}` : `${b.total} · or`;
      if (b.next) x.nextLabel = `${b.total} sur ${b.next}${b.what ? ` ${b.what[1]}` : ''} pour le rang ${TIER_NAMES[b.tier + 1]}`;
    } else if (b.earned) {
      x.sub = `${shortDate(b.at)}${b.count > 1 ? ` · ×${b.count}` : ''}`;
    } else if (extra[b.key]) {
      const [n, of, unit] = extra[b.key];
      x.prog = Math.min(1, n / of);
      x.sub = `${Math.min(n, of)} / ${of}`;
      x.nextLabel = `${n} ${unit} sur ${of}`;
    } else x.sub = 'à gagner';
    return x;
  });
  const th = honoursOf(pid);
  // Badges d'entraînement : seulement si le joueur s'entraîne (ou si le mode Entraînement est allumé).
  if (th.sessions || appModes().train) for (const b of th.badges) {
    const def = TRAIN_BADGES[b.key];
    const next = b.tier < 3 ? def.tiers[b.tier] : null;
    let prog = null;
    if (b.value !== null && next !== null) prog = def.dir > 0 ? Math.min(1, b.value / next) : Math.min(1, next / b.value);
    out.push({ src: 'entr', key: b.key, name: def.name, icon: def.icon, earned: b.tier > 0, tier: b.tier, tiers: def.tiers, at: b.got.length ? b.got[b.got.length - 1].at : null,
      count: b.tier, prog: next === null ? 1 : prog, sub: b.value === null ? 'à gagner' : badgeValueText(b.key, b.value), nextLabel: next === null ? '' : `${badgeValueText(b.key, b.value ?? 0)} · rang ${TIER_NAMES[b.tier + 1]} à ${tierText(b.key, b.tier + 1)}`, sessions: th.sessions });
  }
  return out;
}

/** Badges gagnés / existants (parties et entraînement), et rangs or · argent · bronze. */
function badgeCounts(pid) {
  const list = allBadgesOf(pid);
  const tiers = [1, 2, 3].map(t => list.filter(x => x.tiers && x.tier === t).length);
  return { got: list.filter(x => x.earned).length, total: list.length, bronze: tiers[0], argent: tiers[1], or: tiers[2] };
}

/** Carrés d'un rang (sans son nom). */
const sq = n => `<span class="tier mini"><span class="sq">${[1, 2, 3].map(k => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span></span>`;
const openAttr = (pid, x, tier = 0) => (x.src === 'entr' ? `data-act="tb-open" data-arg="badge|${x.key}|${esc(pid)}"` : badgeOpen(pid, x.key, tier));
/** Tuile d'un badge (vitrine) : plein s'il est gagné, rang en carrés, progression vers le palier suivant. */
function tile(pid, x) {
  return `<li class="${x.earned ? 'on' : 'off'}${x.tiers ? ' tiered' : ''}" data-badge="${x.key}"><button type="button" ${openAttr(pid, x)} aria-label="${esc(x.name)}">
    ${ico(x.icon)}<b>${esc(x.name)}</b>${x.tiers ? tierHtml(x.tier) : ''}<small>${esc(x.sub)}</small>
    ${x.prog !== null && x.prog < 1 ? `<span class="bprog" aria-hidden="true"><i style="width:${Math.round(x.prog * 100)}%"></i></span>` : ''}</button></li>`;
}

/** Récompenses du joueur, de la plus récente à la plus ancienne : badges (parties, rangs compris), records, badges d'entraînement. */
function rewardsOf(p) {
  const h = allHonours();
  const byKey = Object.fromEntries(BADGES.map(b => [b.key, b]));
  const out = h.events.filter(e => e.id === p.id).map(e => (e.kind === 'badge'
    ? { at: e.at, kind: 'badge', key: e.key, tier: e.tier || 0, icon: byKey[e.key] ? byKey[e.key].icon : 'trophy', name: byKey[e.key] ? byKey[e.key].name : e.label, what: e.tier ? `rang ${TIER_NAMES[e.tier]}` : 'badge' }
    : { at: e.at, kind: 'record', key: e.key, icon: 'crown', name: e.label, what: `record : ${e.value} (avant ${e.before})` }));
  for (const b of honoursOf(p.id).badges) {
    for (const g of b.got) out.push({ at: g.at, kind: 'entr', key: b.key, tier: g.tier, icon: TRAIN_BADGES[b.key].icon, name: TRAIN_BADGES[b.key].name, what: `entraînement · rang ${TIER_NAMES[g.tier]}` });
  }
  return out.sort((a, c) => c.at - a.at);
}
/** Les derniers badges gagnés (sans les records), pour le résumé. */
function recentRewards(p) {
  const all = allBadgesOf(p.id);
  return rewardsOf(p).filter(r => r.kind !== 'record').map(r => {
    const x = all.find(y => y.key === r.key && y.src === (r.kind === 'entr' ? 'entr' : 'partie'));
    return x ? { ...x, tier: r.tier || x.tier, at: r.at, sub: shortDate(r.at), earned: true, prog: null, pid: p.id } : null;
  }).filter(Boolean).filter((x, i, arr) => arr.findIndex(y => y.key === x.key && y.src === x.src) === i);
}
const rewardTile = x => tile(x.pid, x);

// ------------------------------------------------------------------ Badges
function badgesHtml(p) {
  const view = pv.badges === 'chrono' ? 'chrono' : 'vitrine';
  const seg = `<div class="seg pbseg" style="margin-top:14px"><button type="button" data-act="pf-badges" data-arg="vitrine" aria-pressed="${view === 'vitrine'}">Vitrine</button><button type="button" data-act="pf-badges" data-arg="chrono" aria-pressed="${view === 'chrono'}">Chronologie</button></div>`;
  const honour = `<a class="btn ghost honour-link" href="#/honneur">${ico('trophy')} TABLEAU D'HONNEUR <small>tous les joueurs</small></a>`;
  return `<div class="pad pbadges">${seg}${view === 'chrono' ? chronoHtml(p) : vitrineHtml(p)}${honour}</div>`;
}

function vitrineHtml(p) {
  const list = allBadgesOf(p.id);
  const c = badgeCounts(p.id);
  const medals = `<div class="medals"><div data-k="got"><b>${c.got}</b><small>gagnés / ${c.total}</small></div><div data-k="or"><b>${c.or}</b><small>${sq(3)} or</small></div>
    <div data-k="argent"><b>${c.argent}</b><small>${sq(2)} argent</small></div><div data-k="bronze"><b>${c.bronze}</b><small>${sq(1)} bronze</small></div></div>`;
  const near = list.filter(x => x.prog !== null && x.prog > 0 && x.prog < 1 && x.nextLabel).sort((a, b) => b.prog - a.prog).slice(0, 3);
  const nearHtml = near.length ? `${sec('Presque', 'presque')}${infoBox('presque', 'Les badges les plus proches : la barre montre le chemin parcouru vers le prochain rang (ou vers le badge).')}
    <ul class="pnear">${near.map(x => `<li><button type="button" ${openAttr(p.id, x)}>${ico(x.icon)}<span><b>${esc(x.name)}${x.tiers && x.tier < 3 ? ` · ${TIER_NAMES[x.tier + 1]}` : ''}</b><small>${esc(x.nextLabel)}</small>
      <span class="bprog" aria-hidden="true"><i style="width:${Math.round(x.prog * 100)}%"></i></span></span></button></li>`).join('')}</ul>` : '';
  const used = new Set(FAMILIES.flatMap(f => f[2]));
  const parts = list.filter(x => x.src === 'partie');
  const fams = [...FAMILIES.map(([k, label, keys]) => [k, label, keys.map(key => parts.find(x => x.key === key)).filter(Boolean)]),
    ['autres', 'Autres', parts.filter(x => !used.has(x.key))], ['entr', 'Entraînement', TRAIN_BADGE_KEYS.map(key => list.find(x => x.src === 'entr' && x.key === key)).filter(Boolean)]]
    .filter(f => f[2].length);
  const famHtml = fams.map(([k, label, items]) => `<div class="pfam" data-fam="${k}"><div class="sec">${label}<span class="n">${items.filter(x => x.earned).length} / ${items.length}</span></div>
    <ul class="badges">${items.map(x => tile(p.id, x)).join('')}</ul></div>`).join('');
  return `${medals}${nearHtml}
    ${infoBox('vitrine', 'Badges de parties depuis toujours (badges du mois : gagnés à la fin du mois, ×n s\'il l\'a été plusieurs fois) ; badges d\'entraînement sur toutes ses séances. Rangs : bronze, argent, or (carrés). Touchez un badge pour savoir ce qu\'il veut dire et où il a été gagné. Les badges en ligne apparaissent après une première partie en ligne.')}
    <div class="pvhint">${infoBtn('vitrine')}<span>Plein : gagné · grisé : à gagner, avec la barre du chemin parcouru.</span></div>
    ${famHtml}`;
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function chronoHtml(p) {
  const list = rewardsOf(p);
  if (!list.length) return '<p class="note" style="margin-top:16px">Rien pour l\'instant : badges, rangs et records battus s\'afficheront ici, du plus récent au plus ancien.</p>';
  const groups = [];
  for (const r of list) {
    const d = new Date(r.at);
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) groups.push(g = { label, items: [] });
    g.items.push(r);
  }
  const item = r => {
    const inner = `<small>${shortDate(r.at)} · ${esc(r.what)}</small><b>${ico(r.icon)}${esc(r.name)}${r.tier ? ` ${tierHtml(r.tier)}` : ''}</b>`;
    if (r.kind === 'record') return `<li class="rec">${inner}</li>`;
    const attr = r.kind === 'entr' ? `data-act="tb-open" data-arg="badge|${r.key}|${esc(p.id)}"` : badgeOpen(p.id, r.key, r.tier);
    return `<li><button type="button" ${attr}>${inner}</button></li>`;
  };
  return groups.map(g => `<div class="sec">${esc(g.label)}<span class="n">${g.items.length}</span></div><ol class="ptl">${g.items.map(item).join('')}</ol>`).join('');
}

export const actions = {
  'pf-info'(k) { if (pv.info.has(k)) pv.info.delete(k); else pv.info.add(k); refresh(); },
  'pf-badges'(v) { pv.badges = v === 'chrono' ? 'chrono' : 'vitrine'; refresh(); },
};

