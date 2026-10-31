// Strela — bouton retour d'Android (lot 5) : la coquille appelle window.strelaBack() et ne fait sortir de l'appli
// (passage en arrière-plan) que si la page répond false, c'est-à-dire à l'accueil.
// Ordre : 1. fermer ce qui est ouvert (confirmation, correction, panneau, menu, sélection, aperçu d'import,
// recadrage), le plus « au-dessus » d'abord ; 2. en partie, ouvrir le menu pause (jamais de sortie en pleine partie) ;
// 3. remonter d'un écran (lien Retour de la barre du haut, sinon l'accueil) ; 4. à l'accueil : false.

// Commandes qui ferment quelque chose, de la plus « au-dessus » à la plus « en dessous ».
export const CLOSERS = [
  'fix-cancel',       // correction d'une fléchette
  'abandon-no',       // confirmations du menu pause
  'resume',           // menu pause
  'close-panel',      // panneau cible + historique
  'launch-no',        // LANCER pendant une partie
  'del-game-no',      // supprimer une partie
  'pick-no',          // supprimer la sélection
  'pick-cancel',      // sélection de l'historique
  'delete-no',        // supprimer un joueur
  'archive-no',       // archiver un joueur
  'backup-no',        // confirmation d'import
  'backup-cancel',    // aperçu d'import
  'crop-cancel',      // recadrage de la photo
];

/**
 * Retour : vrai si la page l'a traité. `actions` : les commandes de l'appli (ACTIONS d'app.js) ; `go` : navigation.
 */
export function handleBack(actions, go, root = document.getElementById('app')) {
  if (document.body.dataset.rescue || !root) return false;
  const path = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  for (const act of CLOSERS) {
    const el = root.querySelector(`[data-act="${act}"]:not([disabled])`);
    if (el && actions[act]) { actions[act](el.dataset.arg, el, null); return true; }
  }
  if (path === '/jeu') { if (actions.pause) actions.pause(); return true; }
  const up = root.querySelector('header.top a.back');
  if (up) { go(up.getAttribute('href')); return true; }
  if (path === '/' || path === '') return false;
  go('#/');
  return true;
}

/**
 * Le retour aurait-il un effet dans la page (sans rien faire) ? Faux seulement à l'accueil sans rien d'ouvert, et sur
 * l'écran de secours : la coquille laisse alors Android jouer son retour prédictif vers l'écran d'accueil (lot 6).
 */
export function backHandled(root = document.getElementById('app')) {
  if (document.body.dataset.rescue || !root) return false;
  const path = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  if (CLOSERS.some(act => root.querySelector(`[data-act="${act}"]:not([disabled])`))) return true;
  return !(path === '/' || path === '');
}
