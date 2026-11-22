// Strela — armurerie (lot 8) : les jeux de fléchettes, choisis avant chaque entraînement (stats comparables par jeu).
//   #/armurerie          liste (jeux actifs, archivés repliés), NOUVEAU JEU : à partir d'un modèle fourni ou vierge
//   #/armurerie/<id>     fiche d'un jeu (création : #/armurerie/nouveau, #/armurerie/nouveau/<modèle>)
// Un jeu utilisé par une séance ne se supprime pas (ses séances le gardent) : il s'archive.
import { store, newId, saveDartSet, deleteDartSet, setUses, dartSetById } from '../store.js';
import { esc, ico, topBar, plural } from '../dom.js';
import { CHOICES, NUMBERS, MODELS, dartSetSummary, dartSetRecord } from '../../engine/dartsets.js';
import { go, refresh, backFrom } from '../nav.js';
import { dartDiagram } from './advice.js';

const FIELDS = Object.freeze({
  weight: 'Poids total (g)', barrelWeight: 'Masse du fût (g)', tungsten: 'Tungstène (%)', length: 'Longueur totale (mm, empennage compris)', flightMm: 'Épaisseur de l\'empennage (mm)',
});
const GROUPS = Object.freeze({
  shape: 'Forme du fût', material: 'Matière du fût', grip: 'Grip', shaft: 'Longueur de tige', shaftMat: 'Matière de tige', flight: 'Forme d\'empennage', point: 'Pointe',
});

let archOpen = false;
let delAsk = false;

function row(x) {
  const n = setUses(x.id);
  return `<li><a class="item dsrow${x.archived ? ' archived' : ''}" href="#/armurerie/${esc(x.id)}"><span class="dsico" aria-hidden="true">${dartDiagram({ shape: x.shape, flight: x.flight, mini: true })}</span>
    <span class="main"><span class="name ell">${esc(x.name)}</span><span class="sub">${esc(dartSetSummary(x)) || 'caractéristiques à compléter'}<br>${n ? plural(n, 'séance', 'séances') : 'jamais utilisé'}</span></span>
    <span class="chev">${ico('chev')}</span></a></li>`;
}

export function arsenalList() {
  const active = store.dartSets.filter(x => !x.archived);
  const arch = store.dartSets.filter(x => x.archived);
  const models = Object.entries(MODELS).map(([k, m]) => `<li><a class="item" href="#/armurerie/nouveau/${k}"><span class="dsico" aria-hidden="true">${dartDiagram({ shape: m.shape, flight: m.flight, mini: true })}</span>
    <span class="main"><span class="name ell">${esc(m.name)}</span><span class="sub">${esc(dartSetSummary(m))}</span></span><span class="chev">${ico('plus')}</span></a></li>`).join('');
  return `<div class="screen arsenal">${topBar('Armurerie', backFrom('#/entrainement'), `<a class="act" href="#/armurerie/nouveau" aria-label="Nouveau jeu">${ico('plus')}</a>`)}
    <div class="pad"><p class="note">Tes jeux de fléchettes. Choisis le jeu avant chaque entraînement : les stats se comparent d'un jeu à l'autre.</p></div>
    ${active.length ? `<ul class="list">${active.map(row).join('')}</ul>` : '<div class="empty" style="padding-top:20px"><div class="big">AUCUN JEU</div><p>Crée ton premier jeu à partir d\'un modèle, ou vierge.</p></div>'}
    <div class="pad">
      ${arch.length ? `<button type="button" class="fold" data-act="ds-arch-fold" aria-expanded="${archOpen}"><span>Jeux archivés</span><span class="n">${arch.length}</span>${ico(archOpen ? 'up' : 'down')}</button>` : ''}
    </div>
    ${arch.length && archOpen ? `<ul class="list">${arch.map(row).join('')}</ul>` : ''}
    <div class="pad"><a class="btn" href="#/armurerie/nouveau" style="margin-top:14px">${ico('plus')} NOUVEAU JEU VIERGE</a>
      <div class="sec">Partir d'un modèle</div></div>
    <ul class="list">${models}</ul>
  </div>`;
}

/** Fiche en cours : ouverte une fois par adresse, gardée pendant la saisie (les champs ne redessinent pas l'écran). */
function draftFor(id, model) {
  const key = `${id}|${model || ''}`;
  if (store.trDraft && store.trDraft.key === key) return store.trDraft;
  let x;
  if (id === 'nouveau') x = { id: newId('ds'), createdAt: Date.now(), archived: false, ...(model && MODELS[model] ? { ...MODELS[model], model } : { name: '' }), fresh: true };
  else { const s = dartSetById(id); if (!s) return null; x = { ...s }; }
  store.trDraft = { key, x, error: '' };
  delAsk = false;
  return store.trDraft;
}

const chips = (field, x) => `<div class="chips2">${Object.entries(CHOICES[field]).map(([k, label]) => `<button type="button" class="chip2" data-act="ds-pick" data-arg="${field}|${k}" aria-pressed="${x[field] === k}">${esc(label)}</button>`).join('')}</div>`;
const numField = (field, x) => `<label class="field"><span>${esc(FIELDS[field])}</span><input class="input" type="text" inputmode="decimal" data-input="ds-num" data-field="${field}" value="${x[field] ?? ''}" placeholder="${NUMBERS[field][0]} à ${NUMBERS[field][1]}" autocomplete="off"></label>`;

export function arsenalForm(id, model = null) {
  const d = draftFor(id, model);
  if (!d) { go('#/armurerie', { replace: true }); return ''; }
  const x = d.x;
  const fresh = !!x.fresh;
  const uses = fresh ? 0 : setUses(x.id);
  const del = fresh ? '' : uses
    ? `<button type="button" class="btn danger" data-act="ds-archive">${x.archived ? 'RÉACTIVER CE JEU' : 'ARCHIVER CE JEU'}</button><p class="note">Utilisé par ${plural(uses, 'séance', 'séances')} : il ne se supprime pas, il s'archive (il n'est plus proposé, ses séances le gardent).</p>`
    : delAsk ? `<div class="confirm" role="alert" data-reveal><p class="alert-h">SUPPRIMER CE JEU ?</p><div class="btns two"><button type="button" class="btn" data-act="ds-del-no">NON</button><button type="button" class="btn alert" data-act="ds-del-yes">SUPPRIMER</button></div></div>`
      : '<button type="button" class="btn danger" data-act="ds-del">SUPPRIMER CE JEU</button>';
  return `<div class="screen has-dock dsform">${topBar(fresh ? 'Nouveau jeu' : 'Jeu de fléchettes', '#/armurerie')}
    <div class="pad">
      <div class="dsfig" id="dsfig">${dartDiagram({ shape: x.shape, flight: x.flight })}</div>
      <div class="sec">Nom</div>
      <label class="field"><input class="input" id="dsname" data-input="ds-name" value="${esc(x.name)}" maxlength="40" placeholder="NOM DU JEU" autocomplete="off" spellcheck="false" enterkeyhint="done"></label>
      ${d.error ? `<p class="note red">${esc(d.error)}</p>` : ''}
      <div class="sec">Fût</div>
      ${numField('weight', x)}${numField('barrelWeight', x)}
      <span class="small dim caps">${GROUPS.shape}</span>${chips('shape', x)}
      <span class="small dim caps">${GROUPS.material}</span>${chips('material', x)}
      ${x.material === 'tungstene' ? numField('tungsten', x) : ''}
      <span class="small dim caps">${GROUPS.grip}</span>${chips('grip', x)}
      ${numField('length', x)}
      <div class="sec">Tige</div>
      <span class="small dim caps">${GROUPS.shaft}</span>${chips('shaft', x)}
      <span class="small dim caps">${GROUPS.shaftMat}</span>${chips('shaftMat', x)}
      <div class="sec">Empennage</div>
      <span class="small dim caps">${GROUPS.flight}</span>${chips('flight', x)}
      ${numField('flightMm', x)}
      <div class="sec">Pointe</div>
      ${chips('point', x)}
      <div class="sec">Ce jeu</div>
      ${del}
    </div>
    <div class="dock btns two" data-layer><a class="btn ghost" href="#/armurerie">ANNULER</a><button type="button" class="btn primary" data-act="ds-save">ENREGISTRER</button></div>
  </div>`;
}

export const inputs = {
  'ds-name'(value) { if (store.trDraft) { store.trDraft.x.name = value; store.trDraft.error = ''; } },
  'ds-num'(value, el) { if (store.trDraft) store.trDraft.x[el.dataset.field] = value.trim() === '' ? null : value; },
};

export const actions = {
  'ds-arch-fold'() { archOpen = !archOpen; refresh(); },
  'ds-pick'(arg) {
    const d = store.trDraft;
    if (!d) return;
    const [field, val] = String(arg).split('|');
    d.x[field] = d.x[field] === val ? null : val;
    refresh();
  },
  'ds-save'() {
    const d = store.trDraft;
    if (!d) return;
    const { fresh, ...x } = d.x;
    if (!String(x.name || '').trim()) { d.error = 'Donne un nom à ce jeu.'; refresh(); return; }
    const rec = dartSetRecord(x);
    if (!rec) { d.error = 'Ce jeu ne peut pas être enregistré.'; refresh(); return; }
    saveDartSet(rec);
    store.trDraft = null;
    go('#/armurerie');
  },
  'ds-archive'() {
    const d = store.trDraft;
    if (!d) return;
    const s = dartSetById(d.x.id);
    if (s) saveDartSet({ ...s, archived: !s.archived });
    store.trDraft = null;
    go('#/armurerie');
  },
  'ds-del'() { delAsk = true; refresh(); },
  'ds-del-no'() { delAsk = false; refresh(); },
  'ds-del-yes'() { const d = store.trDraft; if (d) deleteDartSet(d.x.id); store.trDraft = null; delAsk = false; go('#/armurerie'); },
};
