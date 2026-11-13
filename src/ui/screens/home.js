// Morceaux de l'accueil, partagés avec l'accueil de la version 0.8.0 (screens/v2/home2.js) : bouton REPRENDRE (partie
// en cours : jeu, fin de manche ou fin de partie pas encore rangée), accueil du premier lancement (créer les joueurs ;
// dans l'APK, importer la sauvegarde de la version web), étiquette du pied de page.
// (L'accueil des lots 4 à 7.8, variantes « bande » et « filet », a laissé la place à l'accueil A « tableau de bord ».)
import { store, currentState, playerById, resumeRoute, ckState } from '../store.js';
import { CK_MODE_LABEL } from './cricket.js';
import { esc, ico, OUT_SHORT } from '../dom.js';
import { isApk } from '../native.js';

export function resumeButtonHtml() { return resumeButton(); }

function resumeButton() {
  if (store.ck) return ckResume(); // lot 10 : Cricket en cours
  const s = currentState();
  if (!s) return '';
  const g = store.current;
  const head = `${g.config.startScore} · ${OUT_SHORT[g.config.outMode]}`;
  let line;
  if (s.status === 'finished') {
    line = `PARTIE TERMINÉE · <span class="nm">${esc(playerById(g.config.players[s.winner]).name)}</span> GAGNE`;
  } else {
    const p = playerById(g.config.players[s.currentPlayer]);
    line = `MANCHE ${s.legNumber}<br>À <span class="nm">${esc(p.name)}</span> · RESTE ${s.remaining[s.currentPlayer]}`;
  }
  return `<a class="btn primary resume" href="${resumeRoute()}">
      <span class="t">REPRENDRE</span>
      <small>${head} · ${line}</small>
      <span class="go">${ico('chev')}</span></a>`;
}

function ckResume() {
  const g = store.ck;
  const s = ckState();
  const line = s.status === 'finished'
    ? `PARTIE TERMINÉE · <span class="nm">${esc(playerById(g.config.players[s.winner]).name)}</span> GAGNE`
    : `${g.config.legsToWin > 1 ? `MANCHE ${s.legNumber}<br>` : ''}À <span class="nm">${esc(playerById(g.config.players[s.currentPlayer]).name)}</span>`;
  return `<a class="btn primary resume" href="${resumeRoute()}">
      <span class="t">REPRENDRE</span>
      <small>CRICKET · ${CK_MODE_LABEL[g.config.mode]} · ${line}</small>
      <span class="go">${ico('chev')}</span></a>`;
}

/**
 * Premier lancement (aucun joueur) : invitation à créer les joueurs ; dans l'APK (lot 5), import de la sauvegarde de
 * la version web. { first, html } — first : rien du tout (ni joueur, ni partie, ni partie en cours).
 */
export function welcomeHtml(resume) {
  const first = !store.players.length && !store.games.length && !resume;
  // Lot 5 : premier lancement de l'APK. Les données de la version web (autre origine) ne passent pas d'elles-mêmes :
  // on propose d'importer la sauvegarde exportée depuis la page web (import du lot 3), ou de commencer à zéro.
  const html = first && (isApk() || store.mockApk)
    ? `<section class="welcome" aria-label="Premier lancement de l'appli"><b>BIENVENUE DANS L'APPLI</b>
        <p>Les joueurs et les parties de la version web ne passent pas d'eux-mêmes dans l'appli. Dans la version web : Réglages › Sauvegarde › EXPORTER ; puis ici :</p>
        <label class="btn accent big wrap">IMPORTER UNE SAUVEGARDE DE LA VERSION WEB<input type="file" accept="application/json,.json" data-backup hidden></label>
        <a class="btn" href="#/joueur/nouveau">${ico('plus')} COMMENCER À ZÉRO</a></section>`
    : !store.players.length && !resume
    ? `<section class="welcome" aria-label="Premier lancement"><b>BIENVENUE</b>
        <p>Crée d'abord les joueurs : un pseudo et un avatar (initiales, icône ou photo). Ils restent sur ce téléphone, d'une partie à l'autre.</p>
        <a class="btn accent big" href="#/joueur/nouveau">${ico('plus')} CRÉER LES JOUEURS</a></section>`
    : '';
  return { first, html };
}

/** Pied de l'accueil : où sont les données (rouge si la base ne répond pas). */
export const savedLabel = () => (store.maquette ? 'Maquette · données fictives'
  : store.db.error ? '<span class="red">Non enregistré</span>' : 'Enregistré sur ce téléphone');
