# Idées d'amélioration proposées à Guillaume (13/11/2026)

Proposées après la 0.8.2, à sa demande (« propose des idées d'amélioration »). Rien n'est décidé : à lui de choisir.
Le lot 7.9 (une animation de tour par pictogramme d'avatar) est déjà prévu et n'est pas dans cette liste.

## Soirée

1. **Tournée en un appui** : à la fin d'une partie, « TOURNÉE SERVIE » ajoute d'un coup un verre (ou une pinte) à chaque
   joueur ; et un bouton « +1 À TOUS » dans le panneau des verres.
2. **La moyenne au fil des verres** : dans les stats et le rapport de soirée, la moyenne de chacun selon le nombre de
   verres déjà bus (« après le 4e verre : −6 points »), et le verre où il joue le mieux.
3. **Défis de soirée** (option) : de temps en temps, un défi tiré au sort annoncé à voix haute (« le prochain sous 20
   paie un verre », « un triple ou un gage »).
4. **Résumé à partager** : une image verticale de la soirée (podium, trophées, verres) pour l'envoyer aux joueurs, en
   plus du rapport A4.

## Jeu

5. **Autres jeux** : Cricket, Tour de l'horloge, Killer ; le moteur est prévu pour (registre GAMES).
6. **Équipes** : X01 en 2 contre 2 (ou 3 contre 3), les scores s'additionnent par équipe.
7. **Handicap** : un score de départ par joueur (501 pour les forts, 301 pour les autres), pour des parties serrées.

## Stats

8. **Records et badges** : record battu annoncé en direct (meilleure volée, meilleure moyenne, manche la plus courte),
   badges (premier 180, 10 victoires d'affilée, roi du bust du mois).
9. **Saison** : classement du mois avec des points par place, série de victoires en cours, champion du mois.
10. **Comparer deux joueurs** : deux courbes superposées sur le même graphique.

## Confort

11. **Sauvegarde automatique** : un export dans Téléchargements/Strela à la fin de chaque soirée (ou chaque semaine),
    pour ne jamais perdre l'historique.
12. **Saisie plus rapide** : « RATÉ ×3 » en un appui, et la saisie du total d'une volée au clavier pour qui ne veut pas
    le détail des fléchettes.

## Cricket (lot 10, choix de Guillaume le 13/11 : « AB »)

Propositions en images envoyées le 13/11 ; Guillaume retient **les deux présentations** :
- **A · face à face** quand il y a 2 joueurs : les 7 cibles (20 à 15 et bull) au milieu, les marques de chaque joueur de
  part et d'autre (/, X, Ⓧ), les points en haut.
- **B · grille** de 3 à 8 joueurs (et au choix pour 2) : une ligne par cible, une colonne par joueur.
- Règles : **avec points** par défaut (une cible fermée par soi et ouverte chez un autre rapporte ; on gagne en fermant
  tout avec autant de points ou plus), **sans points** en option, **cut-throat** en option (les points vont aux autres,
  le moins de points gagne).
- Saisie : pavé 20 à 15, BULL, RATÉ, et simple / double / triple ; 3 fléchettes, VALIDER comme en X01.
- À prévoir : moteur pur `src/engine/cricket.js` (état recalculé depuis config + fléchettes, comme x01.js) inscrit dans
  le registre GAMES ; parties Cricket rangées à part des X01 au chargement (le code X01 — stats, records, badges, soirée,
  sauvegarde — ne doit jamais recevoir une partie Cricket : `config.game: 'cricket'`, absent = X01, aucune migration) ;
  `parseBackup` les accepte ; historique et stats du Cricket : marques par volée (MPR).
