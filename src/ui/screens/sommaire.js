// Sommaire de maquette (?maquette dans l'adresse) : lien direct vers chaque écran et vers les états
// difficiles à provoquer. Les états de jeu sont fabriqués avec le vrai moteur ; l'annonce « À TOI » et la loupe,
// qui ne durent qu'un instant, restent figées jusqu'à la prochaine touche.
import { store, startGame, ensureExtraPlayers, resetMock, freshUi, currentState, deletePlayer } from '../store.js';
import { polar, sectorAngle, RINGS } from '../../engine/board.js';
import { isDeletedId } from '../../engine/players.js';
import { openDraft } from './players.js';
import { topBar, ico } from '../dom.js';
import { parseDart } from '../../engine/darts.js';
import { simulateGame } from '../mock.js';
import { go } from '../nav.js';
import { isDark, applyTheme } from './settings.js';
import { saveSetting } from '../store.js';

const ds = text => text.trim().split(/\s+/).filter(Boolean).map(parseDart);
const cfg = (players, startScore = 501, outMode = 'double', legsToWin = 1) => ({ players, startScore, outMode, legsToWin });

/** Partie fabriquée ; `pending` : la dernière volée close attend VALIDER (sinon elle est déjà validée). */
function setGame(setup, notation, ui = {}, pending = false) {
  ensureExtraPlayers(setup.players);
  startGame(setup);
  store.current.darts = Array.isArray(notation) ? notation : ds(notation);
  store.current.validated = pending ? 0 : store.current.darts.length;
  store.current.ui = { ...freshUi(), ...ui };
  return currentState();
}

// Impacts réels (saisie sur la cible) : volée de Guillaume T20 · 20 · T5 en position, Mathilde T19 · 19 · 3.
const at = (seg, r, da = 0) => polar(sectorAngle(seg) + da, r).map(v => Math.round(v * 1000) / 1000);
const withPos = (notation, points) => ds(notation).map((d, i) => (points[i] ? { ...d, pos: points[i] } : d));
const MID_T = (RINGS.tripleIn + RINGS.tripleOut) / 2;
const LIVE = () => withPos('T20 S20 T5 T19 S19 S3 T20 S20', [
  at(20, MID_T, -3), at(20, 0.3, 4), at(5, MID_T + 0.03, 2), at(19, MID_T - 0.02, -2), at(19, 0.75), at(3, 0.32, 3), at(20, MID_T + 0.02, 1.5), at(20, 0.72, -4),
]);

const SCENES = {
  jeu: () => { setGame(cfg(['p1', 'p2']), ''); return '#/jeu'; },
  reprendre: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20'); return '#/'; },
  'arme-d': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { mult: 2 }); return '#/jeu'; },
  'arme-t': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { mult: 3 }); return '#/jeu'; },
  bust: () => { setGame(cfg(['p1', 'p2'], 301), 'T20 T20 T20 20 20 20 T19 S20 S12 20 20 20 S20 S16', {}, true); return '#/jeu'; },
  volee: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S1 S20 S20 S20 T20 T20 S20', {}, true); return '#/jeu'; },
  annonce: () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S1 S20 S20 S20 T20 T20 S20', { announce: 0, frozen: true }); return '#/jeu'; },
  cible: () => { setGame(cfg(['p1', 'p2']), LIVE()); return '#/jeu'; },
  'cible-grande': () => { setGame(cfg(['p1', 'p2']), LIVE(), { panel: 'board' }); return '#/jeu'; },
  'histo-cours': () => {
    const config = cfg(['p1', 'p2'], 301, 'double', 2);
    setGame(config, [...simulateGame({ ...config, legsToWin: 1 }, [0.45, 0.45], 12), ...ds('T20 S20 S5 T19 S7')], { panel: 'history' });
    return '#/jeu';
  },
  paysage: () => { setGame(cfg(['p1', 'p2', 'p3']), LIVE()); return '#/jeu'; },
  loupe: () => { const [x, y] = at(20, MID_T, 2); setGame(cfg(['p1', 'p2']), LIVE().slice(0, 7), { loupe: { x, y } }); return '#/jeu'; },
  'paysage-attente': () => { setGame(cfg(['p1', 'p2']), LIVE().slice(0, 6), {}, true); return '#/jeu'; },
  finition: () => { setGame(cfg(['p1', 'p2']), 'T20 T20 T20 S5 S1 S20 T20 T20 T20 S20 S20 S20 S20 S20 S1 S19 S3 S17'); return '#/jeu'; },
  'fin-manche': () => { setGame(cfg(['p1', 'p2'], 301, 'double', 2), 'T20 T20 T20 20 1 5 T20 T11 D14'); return '#/manche'; },
  'fin-partie': () => { setGame(cfg(['p1', 'p2', 'p3'], 301), 'T20 T20 T20 20 1 5 T19 S7 S3 T20 T11 D14'); return '#/fin'; },
  huit: () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p7', 'p8', 'p9'];
    const config = cfg(players);
    setGame(config, simulateGame(config, players.map(() => 0.3), 77, 26));
    return '#/jeu';
  },
  long: () => {
    const players = ['p10', 'p1', 'p2'];
    const config = cfg(players, 501, 'double', 3);
    setGame(config, simulateGame(config, [0.3, 0.3, 0.3], 5, 10));
    return '#/jeu';
  },
  'long-fiche': () => { ensureExtraPlayers(['p10']); store.draft = null; return '#/joueur/p10'; },
  pause: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { pause: true }); return '#/jeu'; },
  abandon: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { pause: true, confirm: true }); return '#/jeu'; },
  solo: () => { setGame(cfg(['p2'], 301), 'T20 T20 S20 S19 S7 S3'); return '#/jeu'; },
  'aucun-joueur': () => { store.players = []; store.current = null; store.setupDraft = null; return '#/joueurs'; },
  'nouvelle-vide': () => { store.players = []; store.current = null; store.setupDraft = null; return '#/nouvelle'; },
  'historique-vide': () => { store.games = []; return '#/historique'; },
  'fiche-new': () => { store.draft = null; return '#/joueur/nouveau'; },
  'fiche-edit': () => { store.draft = null; return '#/joueur/p2'; },
  suppression: () => { store.current = null; store.draft = null; Object.assign(openDraft('p4'), { del: 'ask', reveal: true }); return '#/joueur/p4'; },
  'suppression-refus': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5'); store.draft = null; Object.assign(openDraft('p1'), { del: 'refused', reveal: true }); return '#/joueur/p1'; },
  'joueur-supprime': () => {
    resetMock();
    deletePlayer('p4');
    const g = store.games.find(x => x.config.players.some(isDeletedId));
    return g ? `#/partie/${g.id}` : '#/historique';
  },
  reinit: () => { resetMock(); return '#/sommaire'; },
};

const L = (scene, label, hint = '') => `<a href="#/sommaire" data-act="scene" data-arg="${scene}"><span>${label}</span><span>${hint}</span></a>`;
const H = (href, label, hint = '') => `<a href="${href}"><span>${label}</span><span>${hint}</span></a>`;

export function sommaire() {
  const dark = isDark();
  return `<div class="screen">${topBar('Maquette', '#/')}
    <div class="pad" style="padding-top:14px">
      <button type="button" class="btn primary" data-act="flip-theme">${ico('theme')} PASSER EN ${dark ? 'CLAIR' : 'SOMBRE'}</button>
      <p class="note">Sur chaque écran, ${ico('theme')} en haut à droite bascule le thème et ${ico('menu')} revient ici (en partie : menu pause).</p>
    </div>
    <div class="pad"><div class="sec">Écrans</div></div>
    <nav class="toc">
      ${H('#/', '1 · Accueil')}
      ${L('reprendre', '1 · Accueil avec REPRENDRE', 'partie en cours')}
      ${H('#/joueurs', '2 · Joueurs', 'liste')}
      ${L('fiche-new', '2 · Fiche : création')}
      ${L('fiche-edit', '2 · Fiche : modification', 'archiver')}
      ${L('suppression', '2 · Supprimer un joueur', 'confirmation')}
      ${L('suppression-refus', '2 · Supprimer pendant une partie', 'refusé')}
      ${L('joueur-supprime', '8 · Partie avec un joueur supprimé', 'Sacha supprimé')}
      ${H('#/avatars', '3 · Banque d\'avatars', '24 icônes')}
      ${H('#/nouvelle', '4 · Nouvelle partie', 'derniers réglages')}
      ${L('jeu', '5 · Jeu : début de partie', '501 · 2 joueurs')}
      ${L('pause', '5 · Jeu : menu pause')}
      ${L('abandon', '5 · Jeu : abandonner ?', 'confirmation')}
      ${L('fin-manche', '6 · Fin de manche')}
      ${L('fin-partie', '7 · Fin de partie', 'revanche')}
      ${H('#/historique', '8 · Historique')}
      ${H('#/partie/g1', '8 · Détail d\'une partie', 'volée par volée')}
      ${H('#/stats/p1', '9 · Stats joueur')}
      ${H('#/reglages', '10 · Réglages')}
    </nav>
    <div class="pad"><div class="sec">États de jeu</div></div>
    <nav class="toc">
      ${L('arme-d', 'D armé', 'double')}
      ${L('arme-t', 'T armé', 'triple · 25 grisé')}
      ${L('volee', 'Volée en attente de validation', '3 fléchettes')}
      ${L('bust', 'Bust en attente de validation', 'ANNULER possible')}
      ${L('annonce', 'Annonce « À TOI »', 'figée')}
      ${L('cible', 'Cible avec impacts', 'petite cible')}
      ${L('cible-grande', 'Cible agrandie', 'appui sur la petite')}
      ${L('histo-cours', 'Historique de la partie en cours', 'panneau')}
      ${L('finition', 'Finition proposée', 'reste 100')}
      ${L('huit', '8 joueurs')}
      ${L('long', 'Pseudo très long', 'en jeu')}
      ${L('long-fiche', 'Pseudo très long', 'fiche')}
      ${L('solo', 'Un seul joueur', 'entraînement')}
    </nav>
    <div class="pad"><div class="sec">Paysage</div><p class="note" style="margin-top:0">Tourne le téléphone : l'écran de jeu passe en paysage, saisie sur la cible.</p></div>
    <nav class="toc">
      ${L('paysage', 'Paysage', 'saisie sur la cible')}
      ${L('loupe', 'Loupe active sur T20', 'figée')}
      ${L('paysage-attente', 'Paysage : volée en attente', 'VALIDER')}
    </nav>
    <div class="pad"><div class="sec">Données</div></div>
    <nav class="toc">
      ${L('aucun-joueur', 'Aucun joueur', 'liste vide')}
      ${L('nouvelle-vide', 'Aucun joueur', 'nouvelle partie')}
      ${L('historique-vide', 'Historique vide')}
      ${L('reinit', 'Rétablir les données fictives', '5 joueurs · 15 parties')}
    </nav>
    <div class="pad"><div class="sec">Icône d'appli</div>
      <div style="display:flex;gap:16px;align-items:flex-end"><img src="assets/icon.svg" width="96" height="96" alt="Icône Strela"><img src="assets/icon-maskable-512.png" width="72" height="72" alt="" style="clip-path:circle(50%)"><img src="assets/icon.svg" width="40" height="40" alt=""></div>
      <p class="note">Carré de cible, flèche plantée au centre (стрела = flèche). Version ronde : découpe d'Android.</p>
    </div>
  </div>`;
}

export const actions = {
  scene(name, el, ev) {
    if (ev) ev.preventDefault();
    const target = SCENES[name] ? SCENES[name]() : '#/sommaire';
    go(target);
  },
  'flip-theme'() {
    saveSetting('theme', isDark() ? 'light' : 'dark');
    applyTheme();
    go(location.hash || '#/', { replace: true });
  },
};
