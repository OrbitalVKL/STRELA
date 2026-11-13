// Nouveautés de chaque version (lot 7.8 ; écran #/nouveautes depuis la 0.8.0) : ce qui change pour les joueurs, en clair, de la plus récente à
// la plus ancienne. Dates : publication de l'APK (releases apk-vX.Y.Z) ; avant l'APK, la version web seulement.
// À compléter à chaque lot (une entrée par version de package.json).
export const CHANGELOG = Object.freeze([
  { v: '0.8.1', date: '2026-11-13', title: 'Corrections de la refonte', items: [
    'Rapport de soirée : l\'export en PDF ou en image marche dans l\'appli (nom de fichier refusé jusque-là).',
    'Verres : se corrigent dans le détail de chaque partie (− et +) ; une soirée où les verres ont été resaisis à chaque partie se corrige d\'un appui depuis son tableau de bord (et la correction s\'annule).',
    'Retour : depuis les stats d\'un joueur ouvertes du tableau de bord d\'une soirée (ou d\'une partie ouverte depuis les stats), le retour revient là d\'où l\'on vient.',
    'Tableau de bord d\'une soirée et détail d\'une partie : les explications sont repliées derrière (i).',
    'Courbes : la valeur est écrite à côté des points (stats et rapport de soirée).',
  ] },
  { v: '0.8.0', date: '2026-11-13', title: 'Refonte', items: [
    'Accueil redessiné : reprise de partie, soirée, dernière partie, joueur en tête, six raccourcis.',
    'Stats : courbe de n\'importe quel chiffre, une partie par point, zoom ; meilleures et pires volées repliables ; explications derrière (i).',
    'Stats : taux de triples (le taux de finition disparaît) ; nombre d\'impacts écrit sur chaque secteur de la cible.',
    'Classement de tous les joueurs, avec le meilleur et le pire de chaque chiffre.',
    'Historique rangé par soirée et par jour, filtres par joueur, par résultat et par mois ; regrouper des parties en soirée, les ajouter à une soirée ou les en sortir.',
    'Tableau de bord de chaque soirée (podium, faits marquants, joueurs, parties).',
    'Rapport de soirée en 3 feuilles à imprimer (image ou PDF) : podium et cartes des joueurs, la soirée heure par heure avec les verres, qui bat qui et la cible de chacun.',
    'Réglages regroupés en cartes, plus clairs (aucune option retirée).',
    'Cette page des nouveautés.',
  ] },
  { v: '0.7.8', date: '2026-11-13', title: 'Accueil', items: [
    'STRELA centré sur l\'accueil, version en bas de page.',
    'Stats : la pire volée ne compte plus les bust (un bust n\'est pas une volée à 0).',
  ] },
  { v: '0.7.7', date: '2026-11-12', title: 'Volées dans les stats', items: [
    'Stats : meilleure volée, pire volée, et la pire volée de chaque partie.',
    'Moqueries plus cyniques, et 22 répliques de plus pour le costume-cravate.',
  ] },
  { v: '0.7.6', date: '2026-11-12', title: 'Soirée', items: [
    'Mode soirée : les joueurs de la soirée sont repris à chaque partie, et leurs verres continuent d\'une partie à l\'autre.',
    'Bouton verre « +1 » en jeu, sans passer par la pause.',
    'Bande du tour : TOUR n et qui a déjà lancé, depuis le premier de la manche.',
    'Au résultat d\'une volée : parmi les 3 meilleures ou les 3 pires de la soirée ?',
    'Pavé : double et triple bien distincts. REVANCHE : l\'ordre est de nouveau tiré au sort.',
  ] },
  { v: '0.7.5', date: '2026-11-10', title: 'Sons et voix', items: [
    'Grognements de l\'ours, sons de la planète, voix d\'homme pour le costume-cravate, Tsia qui marmonne.',
    'Moqueries dès une volée sous 20, plusieurs phrases par cas.',
  ] },
  { v: '0.7.4', date: '2026-11-10', title: 'Animations de tour', items: [
    'Une animation par joueur, choisie dans sa fiche : ours, costume-cravate, carabine, planète, étoile rouge.',
    'Pictogramme cravate.',
  ] },
  { v: '0.7.3', date: '2026-11-09', title: 'Fiche de score allégée', items: [
    'Vainqueur, classement avec les verres, tournée et scores ; demi-page A4 si la partie est courte.',
  ] },
  { v: '0.7.2', date: '2026-11-06', title: 'Verres', items: ['Verres affichés « x3 » partout.'] },
  { v: '0.7.1', date: '2026-11-06', title: 'Fiche de score', items: [
    'Célébrations jusqu\'à un appui ; verres dans l\'historique ; fiche de score en image et en PDF.',
  ] },
  { v: '0.7.0', date: '2026-11-05', title: 'Soirée entre amis', items: [
    'Ordre tiré au sort, joueur en tête, célébrations des nuls, jouer jusqu\'au bout, classement et tournée du dernier.',
    'Compteur de verres. Voyelles qui tombent quand Tsia lance.',
  ] },
  { v: '0.6.1', date: '2026-10-31', title: 'Mise à jour plus sûre', items: ['La recherche de mise à jour passe aussi quand GitHub refuse.'] },
  { v: '0.6.0', date: '2026-10-31', title: 'Icône et avatars', items: [
    'Icône « Soyouz », 16 fonds et 40 pictogrammes d\'avatar.',
    'Recherche de mise à jour automatique ; À propos et confidentialité.',
  ] },
  { v: '0.5.0', date: '2026-10-30', title: 'Appli Android', items: [
    'Strela devient une vraie appli : vibreur, voix d\'Android, export dans Téléchargements, mise à jour dans l\'appli.',
  ] },
  { v: '0.4.0', date: null, title: 'Finitions', items: [
    'Titre STRELA, finition au double préféré de chaque joueur, écrans vides et écran de secours.',
  ] },
  { v: '0.3.0', date: null, title: 'Stats et sauvegarde', items: [
    'Annonces vocales, sons, célébrations ; face-à-face ; correction d\'une fléchette ; export et import.',
  ] },
  { v: '0.2.0', date: null, title: 'Première partie jouable', items: ['Parties enregistrées sur le téléphone, vrais joueurs et photos.'] },
]);
