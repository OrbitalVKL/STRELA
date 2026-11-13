// Lot 9 (2e partie, choix de Guillaume : badges A + B) : vitrine des records et badges d'un joueur (Stats), tableau
// d'honneur commun (#/honneur, onglet des Stats) et badges gagnés annoncés en fin de partie.
// Tout vient de engine/badges.js, recalculé depuis les parties closes (mis en cache tant qu'elles ne changent pas).
import { store, playerById } from './store.js';
import { esc, ico, topBar, plural, shortDate } from './dom.js';
import { avatarHtml } from './avatars.js';
import { honours, playerBadges, badgesOfGame, BADGES } from '../engine/badges.js';
import { playerRecords } from '../engine/records.js';
import { refresh, backFrom } from './nav.js';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const fmt1 = x => (x === null || x === undefined ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ','));

let cache = null;
/** Badges et événements de toutes les parties closes (et de `extra`, la partie qui vient de finir, si elle n'y est pas). */
export function allHonours(extra = null) {
  const games = extra && !store.games.some(g => g.id === extra.id) ? [...store.games, extra] : store.games;
  const key = `${games.length}:${games.reduce((n, g) => n + g.darts.length, 0)}:${extra ? extra.id : ''}:${new Date().getMonth()}`;
  if (cache && cache.key === key) return cache.h;
  const h = honours(games);
  cache = { key, h };
  return h;
}

const tile = b => `<li class="${b.earned ? 'on' : 'off'}" data-badge="${b.key}">${ico(b.icon)}<b>${esc(b.name)}</b>
  <small>${b.earned ? `${shortDate(b.at)}${b.count > 1 ? ` · ×${b.count}` : ''}` : esc(b.desc)}</small></li>`;

/** Vitrine d'un joueur (Stats) : ses records avec la date, puis ses badges (non gagnés en discret). */
export function vitrineHtml(pid, sec, infoBox) {
  const h = allHonours();
  const badges = playerBadges(h, pid);
  const got = badges.filter(b => b.earned).length;
  const rec = playerRecords(store.games, pid);
  const dateOf = key => { const at = h.recordsAt[pid] && h.recordsAt[pid][key]; return at ? shortDate(at) : ''; };
  const row = (label, value, key) => (value === null || value === undefined || value === 0 ? ''
    : `<li><span class="rl">${label}</span><b>${value}</b><small>${dateOf(key)}</small></li>`);
  const recs = [row('Meilleure volée', rec.bestVisit, 'visit'), row('Meilleure moyenne', rec.bestAverage === null ? null : fmt1(rec.bestAverage), 'avg'),
    row('Manche la plus courte', rec.shortestLeg === null ? null : `${rec.shortestLeg} fl.`, 'leg'), row('Plus grosse finition', rec.bestFinish, 'fin')].join('');
  return `${sec('Records et badges', 'vitrine', `<span class="n">${got} / ${BADGES.length}</span>`)}
    ${infoBox('vitrine', 'Depuis toujours, quelle que soit la période choisie. Date d\'un record : la partie où il a été établi. Badges du mois : gagnés à la fin du mois, ×n s\'il a été gagné plusieurs fois. Les badges pas encore gagnés sont en discret, avec ce qu\'il faut faire.')}
    ${recs ? `<ul class="vrecs">${recs}</ul>` : ''}
    <ul class="badges">${badges.map(tile).join('')}</ul>
    <a class="btn ghost honour-link" href="#/honneur">${ico('trophy')} TABLEAU D'HONNEUR</a>`;
}

/** Badges gagnés pendant la partie qui vient de finir (fin de partie). */
export function gameBadgesHtml(g) {
  if (!g || g.abandoned) return '';
  const list = badgesOfGame(allHonours(g), g.id);
  if (!list.length) return '';
  const byKey = Object.fromEntries(BADGES.map(b => [b.key, b]));
  return `<div class="pad"><div class="sec">Badges gagnés</div><ul class="recs gbadges">${list.map(x => {
    const p = playerById(x.id);
    return `<li>${avatarHtml(p, 28)}<span class="nm ell">${esc(p.name)}</span><span class="rl">${esc(x.name)}</span><b>${ico(byKey[x.key].icon)}</b><small>nouveau badge</small></li>`;
  }).join('')}</ul></div>`;
}

/** Texte annoncé à la voix pour les badges de la partie (ou ''). */
export function gameBadgesSay(g) {
  if (!g || g.abandoned) return '';
  const list = badgesOfGame(allHonours(g), g.id);
  return list.map(x => `${playerById(x.id).name} gagne le badge ${x.name}`).join('. ');
}

// ------------------------------------------------------------------ tableau d'honneur
const ui = { kind: 'tout', all: false };
const SHOWN = 30; // événements montrés avant VOIR TOUT
/** Maquette : état de l'écran (filtre). */
export function presetHonour(state = {}) { ui.kind = state.kind || 'tout'; ui.all = !!state.all; }
const monthLabel = ms => { const d = new Date(ms); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export function honourScreen() {
  const h = allHonours();
  const known = id => store.players.some(p => p.id === id);
  const events = h.events.filter(e => known(e.id) && (ui.kind === 'tout' || e.kind === ui.kind));
  const b = (v, l) => `<button type="button" data-act="honour-kind" data-arg="${v}" aria-pressed="${ui.kind === v}">${l}</button>`;
  const head = `${topBar('Tableau d\'honneur', backFrom('#/'))}<div class="pad tabs2"><div class="seg">
    <a href="#/stats" role="button" aria-pressed="false">Joueur</a>
    <a href="#/classement" role="button" aria-pressed="false">Classement</a>
    <a href="#/honneur" role="button" aria-pressed="true">Honneur</a></div></div>
    <div class="pad" style="margin-top:10px"><div class="seg">${b('tout', 'Tout')}${b('badge', 'Badges')}${b('record', 'Records')}</div></div>`;
  if (!events.length) {
    return `<div class="screen">${head}<div class="empty"><div class="big">RIEN POUR L'INSTANT</div>
      <p>Les badges gagnés et les records battus de tous les joueurs apparaîtront ici, du plus récent au plus ancien.</p>
      <a class="btn primary" href="#/nouvelle">NOUVELLE PARTIE</a></div></div>`;
  }
  // Champions : le plus de badges (tous joueurs).
  const counts = Object.entries(h.byPlayer).filter(([id]) => known(id)).map(([id, m]) => [id, Object.values(m).reduce((n, x) => n + x.count, 0)])
    .sort((a, c) => c[1] - a[1]);
  const top = counts.slice(0, 3).map(([id, n], i) => { const p = playerById(id); return `<li><span class="rk">${i + 1}</span>${avatarHtml(p, 30)}<span class="nm ell">${esc(p.name)}</span><b>${n}</b></li>`; }).join('');
  const groups = [];
  const shown = ui.all ? events : events.slice(0, SHOWN);
  for (const e of shown) {
    const label = monthLabel(e.at);
    let gr = groups[groups.length - 1];
    if (!gr || gr.label !== label) groups.push(gr = { label, items: [] });
    gr.items.push(e);
  }
  const byKey = Object.fromEntries(BADGES.map(x => [x.key, x]));
  const item = e => {
    const p = playerById(e.id);
    const right = e.kind === 'badge' ? `<b class="bi">${ico(byKey[e.key].icon)}</b><small>badge</small>` : `<b>${esc(e.value)}</b><small>avant : ${esc(e.before)}</small>`;
    return `<li class="${e.kind}"><a href="#/stats/${esc(e.id)}">${avatarHtml(p, 30)}<span class="nm ell">${esc(p.name)}</span>
      <span class="rl">${esc(e.label)} · ${shortDate(e.at)}</span>${right}</a></li>`;
  };
  return `<div class="screen honour">${head}
    <div class="pad">
      <div class="sec">Le plus de badges<span class="n">${plural(counts.length, 'joueur', 'joueurs')}</span></div>
      <ol class="htop">${top}</ol>
      ${groups.map(gr => `<div class="sec">${esc(gr.label)}</div><ul class="recs hlist">${gr.items.map(item).join('')}</ul>`).join('')}
      ${shown.length < events.length ? `<button type="button" class="btn ghost more" data-act="honour-all">VOIR TOUT <small>${events.length - shown.length} DE PLUS</small></button>` : ''}
    </div></div>`;
}

export const actions = {
  'honour-kind'(k) { ui.kind = k; refresh(); },
  'honour-all'() { ui.all = true; refresh(); },
};
