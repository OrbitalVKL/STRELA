// Sommaire de maquette (?maquette dans l'adresse) : lien direct vers chaque écran et vers les états
// difficiles à provoquer. Les états de jeu sont fabriqués avec le vrai moteur ; l'annonce « À TOI » et la loupe,
// qui ne durent qu'un instant, restent figées jusqu'à la prochaine touche. Tout est en mémoire (données fictives de
// maquette.js) : la base du téléphone n'est jamais ouverte. Chargé seulement avec ?maquette (import dynamique).
import { store, startGame, freshUi, currentState, deletePlayer } from '../store.js';
import { resetMock, ensureExtraPlayers, givePhoto, SAMPLE_PHOTO, SAMPLE_SIZE } from '../maquette.js';
import { openCrop, PHOTO_ERRORS } from './photo.js';
import { polar, sectorAngle, RINGS } from '../../engine/board.js';
import { isDeletedId } from '../../engine/players.js';
import { openDraft } from './players.js';
import { selectLogCell, presetHistory } from './history.js';
import { celebrate } from './game.js';
import { computeState } from '../../engine/x01.js';
import { correctDart } from '../../engine/correct.js';
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
  store.current = null; // la partie fabriquée remplace la précédente sans la ranger dans l'historique
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

// Partie à 2 terminée (301, sortie double) avec des ratés (0), un bust (Guillaume : 20 puis 19, il reste 1) et une
// finition D20.
const TWO = 'T20 T20 T20 20 0 20 T20 S20 S1 T20 T20 S1 S20 S19 T20 0 0 D20';
// 8 joueurs, 2 manches à gagner : la première jouée par le lanceur simulé (tirage 14 : 3 bust), puis 2 tours.
const EIGHT = ['p1', 'p2', 'p3', 'p4', 'p5', 'p7', 'p8', 'p9'];
const eightGame = () => {
  const config = cfg(EIGHT, 301, 'double', 2);
  const leg1 = simulateGame({ ...config, legsToWin: 1 }, EIGHT.map(() => 0.35), 14);
  return { config, darts: [...leg1, ...ds('T20 S20 S5  S20 S1 S5  T19 S19 S3  S20 S20 S20  S5 S5 S1  T20 T20 S20  S1 S1 S1  S20 S5 S20  T20 S1')] };
};
/** Range une partie terminée dans l'historique (sommaire) et renvoie son identifiant. */
function storeGame(id, config, darts) {
  ensureExtraPlayers(config.players);
  store.games = [{ id, startedAt: Date.now() - 3600e3, config, darts, abandoned: false }, ...store.games.filter(g => g.id !== id)];
  return id;
}
const visitIndex = (config, darts, pick) => computeState(config, darts).visits.findIndex(pick);

export const SCENES = {
  jeu: () => { setGame(cfg(['p1', 'p2']), ''); return '#/jeu'; },
  reprendre: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20'); return '#/'; },
  'arme-d': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { mult: 2 }); return '#/jeu'; },
  'arme-t': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { mult: 3 }); return '#/jeu'; },
  bust: () => { setGame(cfg(['p1', 'p2'], 301), 'T20 T20 T20 20 20 20 T19 S20 S12 20 20 20 S20 S16', {}, true); return '#/jeu'; },
  volee: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S1 S20 S20 S20 T20 T20 S20', {}, true); return '#/jeu'; },
  // Volée en attente à 4 et à 8 joueurs ; `k` (8 joueurs) = rang de la volée en attente, donc du joueur qui vient de
  // lancer (k % 8) : le test des couleurs fait passer VALIDER par les 8 couleurs d'avatar.
  'volee-4': () => { setGame(cfg(['p1', 'p2', 'p3', 'p4']), 'T20 S20 S1  S20 S5 S20  T19 S7 S3  S20 S1 S20  T20 T20 S5', {}, true); return '#/jeu'; },
  'volee-8': (k = 3) => {
    const visits = ['T20 S20 S1', 'S20 S5 S20', 'T19 S7 0', 'S20 S1 S20', 'S5 S5 S1', 'T20 S20 S5', 'S1 0 S1', 'S20 S5 S20'];
    setGame(cfg(EIGHT), Array.from({ length: k + 1 }, (_, i) => visits[i % 8]).join(' '), {}, true);
    return '#/jeu';
  },
  annonce: () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S1 S20 S20 S20 T20 T20 S20', { announce: 0, frozen: true }); return '#/jeu'; },
  cible: () => { setGame(cfg(['p1', 'p2']), LIVE()); return '#/jeu'; },
  'cible-tour1': () => { setGame(cfg(['p1', 'p2']), LIVE().slice(0, 2)); return '#/jeu'; },
  'cible-seule': () => { setGame(cfg(['p1', 'p2']), '', { panel: 'board' }); return '#/jeu'; },
  'cible-manche': () => { setGame(cfg(['p1', 'p2']), LIVE(), { panel: 'board', boardView: 'leg' }); return '#/jeu'; },
  manches: () => {
    const config = cfg(['p1', 'p2'], 301, 'double', 3);
    setGame(config, [...simulateGame({ ...config, legsToWin: 1 }, [0.45, 0.3], 3), ...ds('S20 S1 S5 T20 T20 S20 S20 S5')]);
    return '#/jeu';
  },
  'histo-deux': () => {
    const config = cfg(['p1', 'p2'], 301);
    const darts = ds(TWO);
    selectLogCell(`gx2|${visitIndex(config, darts, v => v.bust)}`);
    return `#/partie/${storeGame('gx2', config, darts)}`;
  },
  'histo-huit': () => { const { config, darts } = eightGame(); setGame(config, darts, { panel: 'board' }); selectLogCell(null); return '#/jeu'; },
  'histo-huit-detail': () => {
    const config = cfg(EIGHT, 301, 'double', 2);
    const full = simulateGame(config, EIGHT.map(() => 0.35), 14);
    selectLogCell(`gx8|${visitIndex(config, full, v => v.finish)}`);
    return `#/partie/${storeGame('gx8', config, full)}`;
  },
  // Lot 3 : panneau cible + historique, correction d'une fléchette (sélecteur, confirmation, refus)
  'panneau-case': () => {
    const config = cfg(['p1', 'p2'], 301, 'double', 2);
    const darts = [...simulateGame({ ...config, legsToWin: 1 }, [0.45, 0.45], 12), ...ds('T20 S20 S5 T19 S7')];
    setGame(config, darts, { panel: 'board' });
    selectLogCell(`${store.current.id}|2`);
    return '#/jeu';
  },
  correction: () => { setGame(cfg(['p1', 'p2']), LIVE(), { panel: 'board', fix: { index: 1, mult: 1, pick: null, result: null } }); selectLogCell(`${store.current.id}|0`); return '#/jeu'; },
  'correction-confirmer': () => {
    setGame(cfg(['p1', 'p2']), LIVE(), { panel: 'board' });
    const pick = parseDart('T20');
    store.current.ui.fix = { index: 1, mult: 1, pick, result: correctDart(store.current.config, store.current.darts, 1, pick) };
    selectLogCell(`${store.current.id}|0`);
    return '#/jeu';
  },
  'correction-refus': () => {
    setGame(cfg(['p1', 'p2'], 301), 'T20 T20 T20  20 20 20  T20 S20 S1  20', { panel: 'board' });
    const pick = parseDart('T20'); // 2e fléchette S20 → T20 : reste 1, bust, la volée serait coupée
    store.current.ui.fix = { index: 7, mult: 1, pick, result: correctDart(store.current.config, store.current.darts, 7, pick) };
    selectLogCell(`${store.current.id}|2`);
    return '#/jeu';
  },
  // Lot 3 : célébrations (figées jusqu'au prochain appui)
  'fete-100': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S20', {}, true); celebrate('ton', 100, 0, { frozen: true }); return '#/jeu'; },
  'fete-140': () => { setGame(cfg(['p1', 'p2']), 'T20 T20 S20', {}, true); celebrate('ton40', 140, 0, { frozen: true }); return '#/jeu'; },
  'fete-180': () => { setGame(cfg(['p1', 'p2', 'p3']), 'T20 T20 T20', {}, true); celebrate('max', 180, 0, { frozen: true }); return '#/jeu'; },
  'fete-180-paysage': () => { setGame(cfg(['p1', 'p2']), 'T20 T20 T20', {}, true); celebrate('max', 180, 0, { frozen: true }); return '#/jeu'; },
  'fete-finition': () => {
    setGame(cfg(['p1', 'p2'], 301, 'double', 2), 'T20 T20 T20  20 1 5  T20 S20 0  1 1 1  S1 D20');
    celebrate('finish', 41, 0, { frozen: true });
    return '#/manche';
  },
  'fete-finition-100': () => { setGame(cfg(['p1', 'p2'], 301, 'double', 2), 'T20 T20 T20 20 1 5 T20 T11 D14'); celebrate('finish-big', 121, 0, { frozen: true }); return '#/manche'; },
  'cible-grande': () => { setGame(cfg(['p1', 'p2']), LIVE(), { panel: 'board' }); return '#/jeu'; },
  'histo-cours': () => {
    const config = cfg(['p1', 'p2'], 301, 'double', 2);
    setGame(config, [...simulateGame({ ...config, legsToWin: 1 }, [0.45, 0.45], 12), ...ds('T20 S20 S5 T19 S7')], { panel: 'board' });
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
  abandon: () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { pause: true, confirm: 'abandon' }); return '#/jeu'; },
  'supprimer-en-cours': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20', { pause: true, confirm: 'delete' }); return '#/jeu'; },
  solo: () => { setGame(cfg(['p2'], 301), 'T20 T20 S20 S19 S7 S3'); return '#/jeu'; },
  'solo-attente': () => { setGame(cfg(['p2'], 301), 'T20 T20 S20 S19 S7 S3', {}, true); return '#/jeu'; },
  'aucun-joueur': () => { store.players = []; store.current = null; store.setupDraft = null; return '#/joueurs'; },
  'nouvelle-vide': () => { store.players = []; store.current = null; store.setupDraft = null; return '#/nouvelle'; },
  'historique-vide': () => { store.games = []; return '#/historique'; },
  // Lot 3 : suppression de parties (sélection par appui long, confirmation ; détail d'une partie)
  'histo-selection': () => { presetHistory({ ids: store.games.slice(0, 3).map(g => g.id) }); return '#/historique'; },
  'histo-selection-confirmer': () => { presetHistory({ ids: store.games.slice(0, 3).map(g => g.id), ask: true }); return '#/historique'; },
  'partie-supprimer': () => { presetHistory({ detail: 'g1' }); return '#/partie/g1'; },
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
  // Lot 2 : premier lancement, reprise d'une fin de manche ou de partie, photo d'avatar (recadrage, erreur, en jeu)
  'premier-lancement': () => { store.players = []; store.games = []; store.current = null; store.lastSetup = null; return '#/'; },
  'reprendre-manche': () => { setGame(cfg(['p1', 'p2'], 301, 'double', 2), 'T20 T20 T20 20 1 5 T20 T11 D14'); store.current.validated = 6; return '#/'; },
  'reprendre-fin': () => { setGame(cfg(['p1', 'p2', 'p3'], 301), 'T20 T20 T20 20 1 5 T19 S7 S3 T20 T11 D14'); return '#/'; },
  'nouvelle-en-cours': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20'); store.setupDraft = null; return '#/nouvelle'; },
  'nouvelle-confirmer': () => { setGame(cfg(['p1', 'p2']), 'T20 S20 S5 S20 T19 S1 T20'); store.setupDraft = { ...store.lastSetup, confirm: true }; return '#/nouvelle'; },
  recadrage: () => { store.draft = null; openDraft('p2'); openCrop(SAMPLE_PHOTO, SAMPLE_SIZE.w, SAMPLE_SIZE.h, 'p2'); return '#/recadrage'; },
  'recadrage-zoom': () => {
    store.draft = null; openDraft('p2'); openCrop(SAMPLE_PHOTO, SAMPLE_SIZE.w, SAMPLE_SIZE.h, 'p2');
    Object.assign(store.crop, { zoom: 2.5, cx: 320, cy: 266 });
    return '#/recadrage';
  },
  'fiche-photo': () => { givePhoto('p2'); store.draft = null; return '#/joueur/p2'; },
  'photo-erreur': () => {
    store.draft = null;
    Object.assign(openDraft('p2'), { photoError: PHOTO_ERRORS.heavy(31.4 * 1048576) });
    store.draft.avatar.kind = 'photo';
    return '#/joueur/p2';
  },
  // Guillaume (photo) dans la bande des autres : en gris ; Mathilde (photo) au bandeau : en couleur.
  'photo-jeu': () => { givePhoto('p1'); givePhoto('p2'); setGame(cfg(['p1', 'p2', 'p3']), 'T20 S20 S5'); return '#/jeu'; },
  reinit: () => { resetMock(); return '#/sommaire'; },
};

const L = (scene, label, hint = '') => `<a href="#/sommaire" data-act="scene" data-arg="${scene}"><span>${label}</span><span>${hint}</span></a>`;
const H = (href, label, hint = '') => `<a href="${href}"><span>${label}</span><span>${hint}</span></a>`;

export function sommaire() {
  const dark = isDark();
  return `<div class="screen">${topBar('Maquette', '#/')}
    <div class="pad" style="padding-top:14px">
      <button type="button" class="btn primary" data-act="flip-theme">${ico('theme')} PASSER EN ${dark ? 'CLAIR' : 'SOMBRE'}</button>
      <p class="note">Sur chaque écran, ${ico('theme')} en haut à droite bascule le thème et ${ico('menu')} revient ici (en partie : menu pause).
        Données fictives, en mémoire : la maquette ne touche jamais aux joueurs et aux parties enregistrés sur le téléphone.</p>
    </div>
    <div class="pad"><div class="sec">Écrans</div></div>
    <nav class="toc">
      ${H('#/', '1 · Accueil')}
      ${L('premier-lancement', '1 · Accueil au premier lancement', 'aucun joueur')}
      ${L('reprendre', '1 · Accueil avec REPRENDRE', 'partie en cours')}
      ${L('reprendre-manche', '1 · REPRENDRE une fin de manche', 'pas encore validée')}
      ${L('reprendre-fin', '1 · REPRENDRE une fin de partie', 'pas encore rangée')}
      ${H('#/joueurs', '2 · Joueurs', 'liste')}
      ${L('fiche-new', '2 · Fiche : création')}
      ${L('fiche-edit', '2 · Fiche : modification', 'archiver')}
      ${L('fiche-photo', '2 · Fiche : avatar photo')}
      ${L('photo-erreur', '2 · Fiche : photo refusée', 'trop lourde')}
      ${L('recadrage', '2 · Recadrage de la photo', 'glisser, pincer')}
      ${L('recadrage-zoom', '2 · Recadrage : zoom ×2,5')}
      ${L('suppression', '2 · Supprimer un joueur', 'confirmation')}
      ${L('suppression-refus', '2 · Supprimer pendant une partie', 'refusé')}
      ${L('joueur-supprime', '8 · Partie avec un joueur supprimé', 'Sacha supprimé')}
      ${H('#/avatars', '3 · Banque d\'avatars', '24 icônes')}
      ${H('#/nouvelle', '4 · Nouvelle partie', 'derniers réglages')}
      ${L('nouvelle-en-cours', '4 · Nouvelle partie', 'une partie en cours')}
      ${L('nouvelle-confirmer', '4 · LANCER pendant une partie', 'confirmation')}
      ${L('jeu', '5 · Jeu : début de partie', '501 · 2 joueurs')}
      ${L('pause', '5 · Jeu : menu pause')}
      ${L('abandon', '5 · Jeu : abandonner ?', 'confirmation')}
      ${L('supprimer-en-cours', '5 · Jeu : supprimer la partie ?', 'partie d\'essai')}
      ${L('fin-manche', '6 · Fin de manche')}
      ${L('fin-partie', '7 · Fin de partie', 'revanche')}
      ${H('#/historique', '8 · Historique')}
      ${H('#/partie/g1', '8 · Détail d\'une partie', 'volée par volée')}
      ${L('partie-supprimer', '8 · Supprimer une partie', 'confirmation')}
      ${L('histo-selection', '8 · Historique : sélection', 'appui long')}
      ${L('histo-selection-confirmer', '8 · Supprimer 3 parties', 'confirmation')}
      ${H('#/stats/p1', '9 · Stats joueur')}
      ${H('#/face/p1/p2', '9 · Face-à-face', 'Guillaume contre Mathilde')}
      ${H('#/face/p3/p1', '9 · Face-à-face', 'à 3 et 4 joueurs')}
      ${H('#/reglages', '10 · Réglages')}
    </nav>
    <div class="pad"><div class="sec">États de jeu</div></div>
    <nav class="toc">
      ${L('arme-d', 'D armé', 'double')}
      ${L('arme-t', 'T armé', 'triple · 25 grisé')}
      ${L('volee', 'Volée en attente de validation', '3 fléchettes')}
      ${L('volee-4', 'Volée en attente : 4 joueurs', 'VALIDER')}
      ${L('volee-8', 'Volée en attente : 8 joueurs', 'VALIDER')}
      ${L('bust', 'Bust en attente de validation', 'ANNULER possible')}
      ${L('annonce', 'Annonce « À TOI »', 'figée')}
      ${L('cible-tour1', 'Petite cible au 1er tour', 'volée en cours seule')}
      ${L('cible', 'Petite cible au 2e tour', 'vidée à chaque volée')}
      ${L('cible-grande', 'Cible agrandie', 'VOLÉE')}
      ${L('cible-manche', 'Cible agrandie', 'MANCHE')}
      ${L('cible-seule', 'Cible seule', 'couleurs réglementaires')}
      ${L('manches', 'Manches gagnées', 'premier à 3')}
      ${L('histo-cours', 'Historique de la partie en cours', 'panneau')}
      ${L('panneau-case', 'Panneau : case d\'une manche précédente', 'sur la cible')}
      ${L('correction', 'Corriger une fléchette', 'sélecteur')}
      ${L('correction-confirmer', 'Corriger une fléchette', 'confirmation')}
      ${L('correction-refus', 'Corriger une fléchette', 'refusée')}
      ${L('histo-deux', 'Historique : 2 joueurs', 'ratés, bust ouvert, finition')}
      ${L('histo-huit', 'Historique en cours : 8 joueurs', 'défile de côté')}
      ${L('histo-huit-detail', 'Historique terminé : 8 joueurs', 'finition ouverte')}
      ${L('finition', 'Finition proposée', 'reste 100')}
      ${L('fete-100', 'Célébration 100+', 'discrète')}
      ${L('fete-140', 'Célébration 140+', 'couleur du joueur')}
      ${L('fete-180', 'Célébration 180', 'moitié de l\'écran')}
      ${L('fete-finition', 'Célébration d\'une finition', 'fin de manche')}
      ${L('fete-finition-100', 'Célébration d\'une finition de 100+', 'fin de manche')}
      ${L('huit', '8 joueurs')}
      ${L('long', 'Pseudo très long', 'en jeu')}
      ${L('long-fiche', 'Pseudo très long', 'fiche')}
      ${L('solo', 'Un seul joueur', 'entraînement')}
      ${L('solo-attente', 'Un seul joueur : volée en attente', 'VALIDER seul')}
      ${L('photo-jeu', 'Avatars photo en jeu', 'les autres en gris')}
    </nav>
    <div class="pad"><div class="sec">Paysage</div><p class="note" style="margin-top:0">Tourne le téléphone : l'écran de jeu passe en paysage, saisie sur la cible.</p></div>
    <nav class="toc">
      ${L('paysage', 'Paysage', 'saisie sur la cible')}
      ${L('loupe', 'Loupe active sur T20', 'figée')}
      ${L('paysage-attente', 'Paysage : volée en attente', 'VALIDER')}
      ${L('fete-180-paysage', 'Paysage : célébration 180', 'saisie possible dessous')}
    </nav>
    <div class="pad"><div class="sec">Données</div></div>
    <nav class="toc">
      ${L('aucun-joueur', 'Aucun joueur', 'liste vide')}
      ${L('nouvelle-vide', 'Aucun joueur', 'nouvelle partie')}
      ${L('historique-vide', 'Historique vide')}
      ${L('reinit', 'Rétablir les données fictives', '5 joueurs · 15 parties')}
      ${H('./', 'Quitter la maquette', 'vraies données')}
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
