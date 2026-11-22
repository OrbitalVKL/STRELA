// Strela — conseils (lot 8) : fiches illustrées dans le style des pictogrammes (trait, angles droits, rien d'arrondi).
//   #/conseils          les fiches ; #/conseils/<clé>  une fiche
// Contenu extensible : une fiche de plus = une entrée de SHEETS (clé, titre, résumé, dessin, points, à retenir).
// Les messages du coach (engine/training.js › TIPS) renvoient à ces fiches par leur clé.
import { esc, ico, topBar } from '../dom.js';
import { backFrom, go } from '../nav.js';

const svg = (vb, body, label) => `<svg class="ill" viewBox="${vb}" role="img" aria-label="${esc(label)}">${body}</svg>`;

// ------------------------------------------------------------------ fléchette décomposée (aussi dans l'armurerie)
const BARRELS = Object.freeze({
  droit: 'M40 24H120V36H40Z',
  torpedo: 'M40 25L62 22L120 27V33L62 38L40 35Z',
  bombe: 'M40 27L50 22H72L120 27V33L72 38H50L40 33Z',
  fusele: 'M40 28L80 23L120 28V32L80 37L40 32Z',
});
const FLIGHTS = Object.freeze({
  standard: 'M168 30L190 8H232V52H190Z',
  slim: 'M168 30L192 18H232V42H192Z',
  kite: 'M168 30L205 6L232 18V42L205 54Z',
  pear: 'M168 30L186 16L208 8L232 12V48L208 52L186 44Z',
  petit: 'M176 30L194 16H228V44H194Z',
});

/** Remplissage d'une pièce : couleur choisie dans l'armurerie (jeton --dart-<clé>), sinon trait seul. */
const fillOf = (colors, part) => (colors && colors[part] && /^[a-z]+$/.test(colors[part]) ? ` class="col" style="fill:var(--dart-${colors[part]})"` : '');

/**
 * Fléchette vue de côté : fût `shape`, empennage `flight`, couleurs des pièces `colors` ({ point, barrel, shaft, flight }) ;
 * `parts` : décomposée (pièces écartées et nommées).
 */
export function dartDiagram({ shape = 'droit', flight = 'standard', mini = false, parts = false, colors = null } = {}) {
  const b = BARRELS[shape] || BARRELS.droit, fl = FLIGHTS[flight] || FLIGHTS.standard;
  const grip = shape === 'droit' || !shape ? '<path class="thin" d="M70 24V36M78 24V36M86 24V36M94 24V36"/>' : '';
  const P = `<path${fillOf(colors, 'point')} d="M8 30L40 28V32Z"/>`, B = `<path${fillOf(colors, 'barrel')} d="${b}"/>${grip}`;
  const S = `<path${fillOf(colors, 'shaft')} d="M120 28H168V32H120Z"/>`, F = `<path${fillOf(colors, 'flight')} d="${fl}"/><path class="thin" d="M168 30H232"/>`;
  if (!parts) return `<svg class="dartd${mini ? ' mini' : ''}" viewBox="0 0 240 60" aria-hidden="true">${P}${B}${S}${F}</svg>`;
  // Décomposée : pointe, fût, tige, empennage écartés, nom sous chaque pièce.
  return svg('0 0 300 96', `<g transform="translate(0 6)"><g transform="translate(-2 0)">${P}</g><g transform="translate(6 0)">
      ${B}</g><g transform="translate(22 0)">${S}</g><g transform="translate(40 0)">${F}</g></g>
    <g class="lbl" text-anchor="middle"><text x="24" y="86">POINTE</text><text x="86" y="86">FÛT</text><text x="168" y="86">TIGE</text><text x="250" y="86">EMPENNAGE</text></g>
    <path class="thin" d="M18 44V72M86 48V72M168 42V72M242 66V72"/>`, 'Fléchette décomposée : pointe, fût, tige, empennage');
}

// ------------------------------------------------------------------ dessins des fiches
const ILL = {
  // Prise : fléchette de côté, pouce dessous et deux doigts dessus autour du centre de gravité (repère).
  prise: () => svg('0 0 300 150', `
    <path d="M20 75L60 73V77Z"/><path d="M60 68H160V82H60Z"/><path class="thin" d="M88 68V82M96 68V82M104 68V82M112 68V82"/>
    <path d="M160 73H215V77H160Z"/><path d="M215 75L240 50H280V100H240Z"/>
    <path class="fill" d="M104 90L110 84L116 90Z"/><text class="lbl" x="110" y="104" text-anchor="middle">CENTRE DE GRAVITÉ</text>
    <path d="M78 66V40H96V66"/><path d="M100 66V30H118V66"/><path d="M122 66V44H138V66"/>
    <path d="M92 84V118H124V84"/>
    <g class="lbl"><text x="87" y="30" text-anchor="middle">INDEX</text><text x="150" y="40">MAJEUR</text><text x="108" y="134" text-anchor="middle">POUCE</text></g>`, 'Prise : trois doigts autour du centre de gravité'),
  // Posture : vue de dessus, ligne de lancer, pieds, épaules tournées vers la cible.
  posture: () => svg('0 0 300 160', `
    <path class="thin dash" d="M150 8V152"/><text class="lbl" x="156" y="20">LIGNE DE LANCER</text>
    <path d="M100 96L132 70L140 80L108 106Z"/><path d="M64 120L92 102L98 112L70 130Z"/>
    <path d="M70 70L128 112"/><path class="fill" d="M94 86H106V98H94Z"/>
    <path d="M168 70H270"/><path d="M262 62L272 70L262 78"/><text class="lbl" x="218" y="60" text-anchor="middle">CIBLE</text>
    <g class="lbl"><text x="138" y="122">PIED AVANT</text><text x="20" y="146">PIED ARRIÈRE</text><text x="40" y="62">ÉPAULES</text></g>`, 'Posture vue de dessus : épaule tournée vers la cible, pied avant légèrement devant'),
  // Lancer : épaule fixe, bras fixe, l'avant-bras bascule ; la main accompagne vers la cible.
  lancer: () => svg('0 0 300 160', `
    <path class="fill" d="M34 112H50V128H34Z"/><text class="lbl" x="20" y="146">ÉPAULE FIXE</text>
    <path d="M42 120L110 112"/><path class="fill" d="M106 108H116V118H106Z"/><text class="lbl" x="96" y="138">COUDE</text>
    <path class="thin dash" d="M112 112L80 52"/><path class="thin dash" d="M112 112L118 40"/><path d="M112 112L168 58"/>
    <path class="thin" d="M84 40L104 30L134 30L160 44"/><path d="M152 38L162 46L150 50"/>
    <path class="thin dash" d="M172 54L270 60"/><path d="M262 52L272 60L262 68"/>
    <g class="lbl"><text x="60" y="44">ARMER</text><text x="174" y="46">LÂCHER</text><text x="200" y="82">LA MAIN ACCOMPAGNE</text></g>`, 'Lancer : seul l\'avant-bras bouge, la main accompagne vers la cible'),
  types: () => dartDiagram({ parts: true }),
};

/** Variantes dessinées (fiche « types de fléchettes ») : formes de fût et d'empennage. */
function variants() {
  const row = (list, kind) => `<div class="varg">${Object.keys(list).map(k => `<figure>${kind === 'shape' ? dartDiagram({ shape: k, flight: 'standard', mini: true }) : dartDiagram({ shape: 'droit', flight: k, mini: true })}<figcaption>${esc(NAMES[kind][k])}</figcaption></figure>`).join('')}</div>`;
  return `<div class="sec">Formes de fût</div>${row(BARRELS, 'shape')}<div class="sec">Formes d'empennage</div>${row(FLIGHTS, 'flight')}`;
}
const NAMES = { shape: { droit: 'Droit', torpedo: 'Torpedo', bombe: 'Bombé', fusele: 'Fuselé' }, flight: { standard: 'Standard', slim: 'Slim', kite: 'Kite', pear: 'Pear', petit: 'Petit standard' } };

export const SHEETS = Object.freeze([
  { key: 'prise', title: 'Prise en main', sum: '3 doigts près du centre de gravité, prise détendue',
    points: ['Au moins 3 doigts : le pouce dessous, l\'index et le majeur dessus (un 4e doigt peut se poser, sans serrer).',
      'Les doigts autour du centre de gravité : pose la fléchette en équilibre sur un doigt pour le trouver.',
      'Prise détendue : on tient la fléchette, on ne la serre pas ; les doigts ne doivent pas blanchir.',
      'Toujours la même prise : c\'est elle qui rend le lancer régulier.'],
    keep: 'Une prise ferme mais souple, la même à chaque fléchette.' },
  { key: 'posture', title: 'Posture', sum: 'épaule vers la cible, pieds largeur d\'épaules, tête immobile',
    points: ['L\'épaule du bras qui lance tournée vers la cible.', 'Pieds écartés de la largeur des épaules, le pied dominant légèrement en avant, au bord de la ligne.',
      'Genoux souples, poids du corps surtout sur le pied avant, sans se pencher à l\'excès.', 'Tête immobile pendant tout le lancer : les yeux restent sur la cible visée.'],
    keep: 'Le corps ne bouge pas : seul le bras lance.' },
  { key: 'lancer', title: 'Lancer', sum: 'avant-bras seul, accompagner, la régularité avant la force',
    points: ['Seul l\'avant-bras bouge : l\'épaule et le bras restent fixes, le coude ne descend pas.',
      'Armer en ramenant la fléchette vers l\'œil, puis lancer d\'un geste fluide.', 'Accompagner : la main finit le geste vers la cible, bras tendu, doigts vers le point visé.',
      'La précision vient de la régularité, pas de la force : même rythme à chaque fléchette.',
      'Pour corriger, dans l\'ordre : la prise, puis la posture, puis le lancer.'],
    keep: 'Fléchette trop haute : tu lâches trop tôt. Trop basse : trop tard, ou geste freiné. Sur le côté : coude ou épaule pas dans l\'axe.' },
  { key: 'types', title: 'Types de fléchettes', sum: 'poids, fût, tige, empennage : le rôle de chacun',
    points: ['Poids : plus lourde (24 g et plus), elle file droit et pardonne un geste moins régulier ; plus légère (18 à 20 g), elle demande plus de précision mais fatigue moins.',
      'Fût : droit (prise partout pareille), torpedo (poids vers l\'avant, prise près de la pointe), bombé (avant lourd, pour une prise courte), fuselé (prise au centre). Le tungstène, plus dense que le laiton, donne un fût plus fin pour le même poids : les fléchettes se gênent moins dans un même secteur.',
      'Tige : courte, la fléchette pique plus vite ; longue, elle se stabilise plus tard mais reste plus droite en vol. L\'aluminium et le carbone sont plus rigides, le nylon casse moins cher, la tige rotative laisse passer les fléchettes déjà plantées.',
      'Empennage : grand (standard), il stabilise un lancer lent ; plus petit (slim, petit standard, kite), il convient à un lancer rapide et laisse plus de place dans le secteur. Plus il est épais, plus il dure.'],
    keep: 'Change une seule chose à la fois, et compare tes stats d\'entraînement d\'un jeu à l\'autre.' },
]);

export function adviceList() {
  return `<div class="screen advice">${topBar('Conseils', backFrom('#/entrainement'))}
    <ul class="advl">${SHEETS.map(s => `<li><a class="advr" href="#/conseils/${s.key}"><span class="advi">${ILL[s.key]()}</span>
      <span class="t"><b>${esc(s.title)}</b><small>${esc(s.sum)}</small></span>${ico('chev')}</a></li>`).join('')}</ul>
    <div class="pad"><p class="note">Pour progresser : corriger d'abord la prise, puis la posture, puis le lancer. Les analyses du coach renvoient à ces fiches.</p></div></div>`;
}

export function adviceSheet(key) {
  const s = SHEETS.find(x => x.key === key);
  if (!s) { go('#/conseils', { replace: true }); return ''; }
  const i = SHEETS.indexOf(s);
  const next = SHEETS[(i + 1) % SHEETS.length];
  return `<div class="screen advice">${topBar(s.title, backFrom('#/conseils'))}
    <div class="pad">
      <div class="advfig">${ILL[s.key]()}</div>
      <ul class="advp">${s.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      ${s.key === 'types' ? variants() : ''}
      <div class="advk"><small>À RETENIR</small><span>${esc(s.keep)}</span></div>
      <a class="btn ghost" href="#/conseils/${next.key}" style="margin-top:16px">FICHE SUIVANTE : ${esc(next.title.toUpperCase())} ${ico('chev')}</a>
    </div></div>`;
}
