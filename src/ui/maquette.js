// Strela — données fictives du sommaire de maquette (?maquette) et des tests : chargé seulement dans ce cas
// (import dynamique dans app.js). Tout reste en mémoire : la vraie base du téléphone n'est jamais ouverte.
import { store } from './store.js';
import { setHomeVariant } from './screens/home.js';
import { MOCK_PLAYERS, EXTRA_PLAYERS, mockGames } from './mock.js';

const clone = o => JSON.parse(JSON.stringify(o));

// Photo d'exemple (avatar photo du sommaire, écran de recadrage) : un paysage dessiné, en SVG, 640 × 480.
const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(70,110,160)"/><stop offset="1" stop-color="rgb(225,170,120)"/></linearGradient></defs>
<rect width="640" height="480" fill="url(#c)"/><circle cx="430" cy="170" r="62" fill="rgb(250,225,150)"/>
<path d="M0 360L140 210L250 330L360 180L520 350L640 260V480H0Z" fill="rgb(60,80,70)"/>
<path d="M0 420L180 330L330 400L470 320L640 410V480H0Z" fill="rgb(35,45,40)"/>
<rect x="286" y="232" width="68" height="68" fill="none" stroke="rgb(255,255,255)" stroke-width="6"/></svg>`;
export const SAMPLE_PHOTO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SAMPLE_SVG)}`;
export const SAMPLE_SIZE = Object.freeze({ w: 640, h: 480 });

/** Données fictives remises à neuf : 5 joueurs (+1 archivé), 15 parties, aucune partie en cours. */
export function resetMock() {
  const players = MOCK_PLAYERS.map(clone);
  store.players = players;
  store.games = mockGames(players);
  store.current = null;
  store.draft = null;
  store.setupDraft = null;
  store.crop = null;
  // Lot 4 : problème d'enregistrement simulé et variante de l'accueil remis à zéro
  store.mockIssue = false;
  Object.assign(store.db, { openCode: null, writeFail: null, error: null });
  setHomeVariant('bande');
  // Derniers réglages : ceux de la partie la plus récente.
  const last = store.games[0];
  store.lastSetup = { players: [...last.config.players], startScore: last.config.startScore, outMode: last.config.outMode, legsToWin: last.config.legsToWin };
}

/** Joueurs d'appoint (8 joueurs, pseudo très long) ajoutés à la demande. */
export function ensureExtraPlayers(ids) {
  for (const p of EXTRA_PLAYERS) if (ids.includes(p.id) && !store.players.some(q => q.id === p.id)) store.players.push(clone(p));
}

/** Donne à un joueur fictif la photo d'exemple. */
export function givePhoto(id) {
  const p = store.players.find(q => q.id === id);
  if (p) p.avatar = { kind: 'photo', photo: SAMPLE_PHOTO, color: p.avatar.color };
}
